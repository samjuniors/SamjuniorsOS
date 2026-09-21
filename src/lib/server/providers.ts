/**
 * The resilience layer — every provider chain in one place.
 *
 * The assistant is a conversation, and a conversation dies the moment one
 * sentence goes unanswered. Every external service it depends on — the model
 * that thinks, the transcriber that hears, the voice that speaks — has a
 * moment where it rate-limits, times out, or simply goes down. So none of
 * them is load-bearing alone: each is one link in a chain, and the chain is
 * walked on failure, automatically, mid-turn.
 *
 *   LLM   z-ai (built-in, no key) → Gemini → any local OpenAI-compatible
 *         server (Ollama, LM Studio, vLLM, llama.cpp)
 *   STT   Deepgram → ElevenLabs Scribe → z-ai ASR (no key) → a local
 *         OpenAI-compatible transcription server (faster-whisper, LocalAI)
 *   TTS   ElevenLabs → z-ai neural → a local OpenAI-compatible speech server
 *         (kokoro-fastapi, LocalAI, openedai-speech) → the browser's own voice
 *
 * Three ideas make the chains safe rather than just long:
 *
 *   Circuit breakers. A provider that fails twice in a row (LLM) or three
 *   times (STT) is skipped for a cooldown — 90s / 60s — so a dead provider
 *   costs one failed attempt, not one per sentence. When every link is
 *   cooling the chain is walked anyway, in order: a retry is better than a
 *   shrug. Any success heals the provider immediately.
 *
 *   Pins. SOFIA_LLM_PROVIDER / SOFIA_STT_PROVIDER / SOFIA_TTS_PROVIDER
 *   collapse a chain to one link on purpose — for testing, or because a
 *   person has decided they know better than the ladder. (The JARVIS_*
 *   spellings from the bridge era still work as aliases.)
 *
 *   Honesty. llmInfo() / sttInfo() are the single source of truth for
 *   /api/sofia/health, which is what the settings panel shows the user:
 *   which links exist, which are configured, which one is answering right
 *   now. A fallback you can't see is a fallback you can't trust.
 *
 * Everything speaks the OpenAI wire format — the request bodies and the
 * SSE event stream — which is why one parser (in brain.ts) serves every
 * link: the z-ai SDK, Gemini's OpenAI-compat endpoint and a local server
 * all say `data: {"choices":[{"delta":{...}}]}`.
 *
 * Ported from bridge/providers.mjs (Vite era) — behaviour identical; the env
 * vars gained SOFIA_* aliases and Next.js loads .env.local itself.
 */

import ZAI from 'z-ai-web-dev-sdk'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Shared z-ai client — the brain, the speech engine and the transcriber all
// ride one SDK instance (it only reads config; the win is one place to fail).
// ---------------------------------------------------------------------------

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>

let zaiShared: ZaiClient | null = null
let zaiBroken = false

/** The one SDK instance for this process. Throws when the machine has no z-ai
 *  credentials at all (a local checkout without the sandbox's auth) — callers
 *  treat that as "provider unavailable", never as a crash. */
export async function zaiClient(): Promise<ZaiClient> {
  if (zaiShared) return zaiShared
  if (zaiBroken) throw new Error('z-ai sdk is not available on this machine')
  try {
    zaiShared = (await ZAI.create()) as ZaiClient
    return zaiShared
  } catch (err) {
    zaiBroken = true
    console.error('[sofia] z-ai sdk unavailable:', errText(err))
    throw new Error('z-ai sdk is not available on this machine')
  }
}

/** For status displays: false once a create() has failed — the local-machine
 *  case, where every z-ai link is honestly OFF rather than erroring per call. */
export function zaiAvailable(): boolean {
  return !zaiBroken
}

// ---------------------------------------------------------------------------
// Circuit breaker — the one abstraction every chain shares.
// ---------------------------------------------------------------------------

type GuardState = { fails: number; until: number }

function makeGuard(threshold: number, cooldownMs: number) {
  const state = new Map<string, GuardState>()

  const trip = (id: string) => {
    const s = state.get(id) ?? { fails: 0, until: 0 }
    s.fails += 1
    // Only a run of failures opens the breaker, and opening it resets the
    // count, so the cooldown that follows is a fixed window, not a ratchet.
    if (s.fails >= threshold) {
      s.until = Date.now() + cooldownMs
      s.fails = 0
    }
    state.set(id, s)
  }
  return {
    trip,
    heal: (id: string) => state.set(id, { fails: 0, until: 0 }),
    cooling: (id: string) => {
      const s = state.get(id)
      return Boolean(s && s.until > Date.now())
    },
  }
}

const LLM_GUARD = makeGuard(2, 90_000)
const STT_GUARD = makeGuard(3, 60_000)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const errText = (err: unknown) =>
  String((err as Error | undefined)?.message ?? err).replace(/\s+/g, ' ').slice(0, 180)

/** Errors worth one quick retry before the chain moves on. */
function isTransient(err: unknown): boolean {
  return /\b(429|rate|too many|502|503|504|timeout|network|fetch failed|ECONN)\b/i.test(
    errText(err),
  )
}

/** A provider that refused our tool schema (small local models often do)
 *  gets one retry without tools — a plain answer beats a failed turn. A
 *  missing endpoint (404) is NOT a schema refusal, or every typo would
 *  silently strip the tools for good. Latched so the retry is paid once per
 *  provider, not once per turn. */
function looksLikeToolRejection(err: unknown): boolean {
  const t = errText(err)
  return /(\b400\b|\b422\b|unsupported|not support|tool|function)/i.test(t)
}

// ---------------------------------------------------------------------------
// Env plumbing — Next.js loads .env.local / .env into process.env itself.
// ---------------------------------------------------------------------------

const env = (name: string): string => (process.env[name] ?? '').trim()

/** SOFIA_* is the Next-era spelling; JARVIS_* still works for anyone who
 *  carried their old bridge .env.local across the port. */
function envAlias(sofia: string, jarvis: string): string {
  return env(sofia) || env(jarvis)
}

/** Ollama's OpenAI compatibility lives under /v1; a user who points at the
 *  bare port (:11434) means it, so the suffix is added rather than demanded. */
function normaliseBase(raw: string, { appendV1 = true } = {}): string {
  let base = raw.replace(/\/+$/, '')
  if (appendV1 && !/\/v\d+$/.test(base)) base += '/v1'
  return base
}

function llmPinId(): string {
  return envAlias('SOFIA_LLM_PROVIDER', 'JARVIS_LLM_PROVIDER').toLowerCase()
}
function sttPinId(): string {
  return envAlias('SOFIA_STT_PROVIDER', 'JARVIS_STT_PROVIDER').toLowerCase()
}
export function ttsPinId(): string {
  return envAlias('SOFIA_TTS_PROVIDER', 'JARVIS_TTS_PROVIDER').toLowerCase()
}

// ---------------------------------------------------------------------------
// The LLM chain — z-ai → Gemini → local.
// ---------------------------------------------------------------------------

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

function geminiKey(): string {
  // GEMINI_API_KEY is the one everyone has; GOOGLE_API_KEY is the one Google's
  // own quickstarts hand out — accept both rather than making a person rename.
  return env('GEMINI_API_KEY') || env('GOOGLE_API_KEY')
}

function localLlmBase(): string {
  const direct = env('LOCAL_LLM_BASE_URL')
  if (direct) return normaliseBase(direct)
  // OLLAMA_BASE_URL is set by the tooling around Ollama more often than
  // anyone types ours — accept it as an alias rather than losing the link.
  const ollama = env('OLLAMA_BASE_URL')
  if (ollama) return normaliseBase(ollama)
  return ''
}

/** What the whole server sends the model. Kept loose on purpose: tool
 *  definitions and messages come straight from brain.ts's own shapes. */
export type LlmBody = {
  messages: Array<Record<string, unknown>>
  tools?: unknown[]
  stream?: boolean
  [key: string]: unknown
}

/** One SSE reader from any OpenAI-compatible chat endpoint. The shape —
 *  `data: {...}\n\n` lines ending in `data: [DONE]` — is exactly what
 *  brain.ts already parses for the z-ai SDK's streams. */
async function openAiCompatReader(
  url: string,
  key: string,
  body: LlmBody,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
    // No abort signal: it would kill the body mid-stream, and local models
    // legitimately take their time. The brain's own stall guard owns hangs.
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText} ${String(detail).slice(0, 200)}`)
  }
  const reader = res.body?.getReader()
  if (!reader) throw new Error('the provider returned no stream')
  return reader
}

type LlmProvider = {
  id: string
  label: string
  note: string
  available: () => boolean
  model?: string
  start: (body: LlmBody) => Promise<ReadableStreamDefaultReader<Uint8Array>>
}

/** Each link adapts the shared body to its own dialect. */
function buildLlmBody(p: { id: string; model?: string }, body: LlmBody, withTools: boolean): LlmBody {
  const tools =
    withTools && Array.isArray(body.tools) && body.tools.length ? body.tools : undefined
  if (p.id === 'zai') {
    // `thinking` is a z-ai extension; harmless nowhere else but not theirs
    // to carry, so it stays on the one link that reads it.
    return { ...body, tools, thinking: { type: 'disabled' } }
  }
  const out: LlmBody = { ...body, tools, model: p.model }
  delete out.thinking
  return out
}

const LLM_CHAIN: LlmProvider[] = [
  {
    id: 'zai',
    label: 'Z-AI',
    note: 'built-in, no key',
    available: () => zaiAvailable(),
    async start(body) {
      const api = await zaiClient()
      const res = await (api.chat.completions.create as (b: unknown) => Promise<Response>)(
        body,
      )
      const reader = (res as unknown as { getReader?: () => ReadableStreamDefaultReader<Uint8Array> })
        .getReader
        ? (res as unknown as { getReader: () => ReadableStreamDefaultReader<Uint8Array> }).getReader()
        : null
      if (!reader) throw new Error('the model returned no stream')
      return reader
    },
  },
  {
    id: 'gemini',
    label: 'GEMINI',
    note: 'GEMINI_API_KEY',
    available: () => Boolean(geminiKey()),
    get model() {
      return env('GEMINI_MODEL') || 'gemini-2.0-flash'
    },
    async start(body) {
      return openAiCompatReader(GEMINI_URL, geminiKey(), body)
    },
  },
  {
    id: 'local',
    label: 'LOCAL',
    note: 'LOCAL_LLM_BASE_URL',
    available: () => Boolean(localLlmBase()),
    get model() {
      return env('LOCAL_LLM_MODEL') || env('OLLAMA_MODEL') || 'llama3.1'
    },
    async start(body) {
      return openAiCompatReader(
        `${localLlmBase()}/chat/completions`,
        env('LOCAL_LLM_API_KEY'),
        body,
      )
    },
  },
]

// Latched per provider once a tool rejection is seen — see looksLikeToolRejection.
const noTools = new Set<string>()

/** The last outcome per provider, for /health: 'never' | 'ok' | 'err'. */
const llmHealth = new Map<string, string>([
  ['zai', 'never'],
  ['gemini', 'never'],
  ['local', 'never'],
])
const llmErrors = new Map<string, string>()

let activeLlm = 'zai'

export type LlmLinkInfo = {
  id: string
  label: string
  note: string
  configured: boolean
  healthy: boolean
  state: string
  cooling: boolean
  tools: boolean
  error: string | null
}

export type LlmInfo = {
  active: string
  label: string
  pin: string | null
  providers: LlmLinkInfo[]
}

/**
 * Walk the chain and return the first live SSE reader.
 *
 * `announce(provider)` fires exactly when the active link *changes* — the
 * browser turns that into the BRAIN rail line, so a person can see the
 * moment Gemini takes over. Failures are announced the loud way instead: a
 * warning on the server log naming the link and the error.
 */
export async function openLlmStream(
  body: LlmBody,
  announce?: (p: LlmProvider) => void,
): Promise<{ reader: ReadableStreamDefaultReader<Uint8Array>; provider: LlmProvider }> {
  const configured = LLM_CHAIN.filter((p) => p.available())
  if (!configured.length) throw new Error('no llm provider is configured')

  const pinId = llmPinId()
  const pin = pinId ? configured.find((p) => p.id === pinId) : null
  if (pinId && !pin) {
    console.warn(`[sofia] SOFIA_LLM_PROVIDER="${pinId}" matches nothing — using the chain`)
  }
  const ordered = pin ? [pin] : configured

  let awake = ordered.filter((p) => !LLM_GUARD.cooling(p.id))
  if (!awake.length) {
    // Every link cooling. Try them in order anyway — a chain that has given
    // up is worse than one that keeps failing loudly.
    awake = ordered
  }

  let lastErr: unknown
  for (const p of awake) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const withTools = !noTools.has(p.id)
      try {
        const reader = await p.start(buildLlmBody(p, body, withTools))
        if (activeLlm !== p.id) {
          activeLlm = p.id
          announce?.(p)
        }
        llmHealth.set(p.id, 'ok')
        llmErrors.delete(p.id)
        LLM_GUARD.heal(p.id)
        return { reader, provider: p }
      } catch (err) {
        lastErr = err
        // First failure with tools + a rejection-shaped error + never latched:
        // retry the same link once with the tools stripped.
        if (attempt === 0 && withTools && !noTools.has(p.id) && looksLikeToolRejection(err)) {
          noTools.add(p.id)
          console.warn(`[sofia] llm "${p.id}" refused the tool schema — continuing without tools`)
          continue
        }
        if (!isTransient(err) || attempt === 1) break
        await sleep(600)
      }
    }
    LLM_GUARD.trip(p.id)
    llmHealth.set(p.id, 'err')
    llmErrors.set(p.id, errText(lastErr))
    console.warn(`[sofia] llm provider "${p.id}" failed: ${errText(lastErr)}`)
  }
  throw lastErr ?? new Error('every llm provider failed')
}

/** What /api/sofia/health and the settings panel show about the brain. */
export function llmInfo(): LlmInfo {
  const pin = llmPinId()
  const active = LLM_CHAIN.find((p) => p.id === activeLlm) ?? LLM_CHAIN[0]
  return {
    active: activeLlm,
    label: active.label,
    pin: pin || null,
    providers: LLM_CHAIN.map((p) => ({
      id: p.id,
      label: p.label,
      note: p.note,
      configured: p.available(),
      // 'never' reads as ready-to-serve, not broken.
      healthy: llmHealth.get(p.id) !== 'err',
      state: llmHealth.get(p.id) ?? 'never',
      cooling: LLM_GUARD.cooling(p.id),
      tools: !noTools.has(p.id),
      error: llmErrors.get(p.id) ?? null,
    })),
  }
}

// ---------------------------------------------------------------------------
// The STT chain — Deepgram → ElevenLabs → z-ai → local.
// ---------------------------------------------------------------------------

export function elevenKey(): string | null {
  if (env('ELEVENLABS_API_KEY')) return env('ELEVENLABS_API_KEY')
  // Borrowed from the Claude Code MCP config when present — the same trick
  // the old bridge used, kept so the chain owns one key source.
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8')) as {
      mcpServers?: Record<string, { env?: Record<string, string> }>
    }
    return cfg.mcpServers?.elevenlabs?.env?.ELEVENLABS_API_KEY ?? null
  } catch {
    return null
  }
}

function localSttBase(): string {
  const raw = env('LOCAL_STT_URL')
  return raw ? normaliseBase(raw) : ''
}

/** The extension is the only hint a transcription server gets about the
 *  codec — derive it from the content-type the recorder reported. */
function extFromType(type: string | undefined): string {
  const t = String(type ?? '')
  if (t.includes('ogg')) return 'ogg'
  if (t.includes('mp4') || t.includes('mpeg')) return 'mp4'
  if (t.includes('wav')) return 'wav'
  return 'webm'
}

/**
 * z-ai ASR is keyless, which makes it the difference between "server-side
 * transcription needs a key" and "it works for everyone" — but on a machine
 * without the sandbox's z-ai credentials it cannot work at all. So it is
 * probed once at startup with half a second of silence: ok means live,
 * rate-limited means live (a quota window closes on its own), and an auth
 * error means honestly OFF.
 */
const asrProbe = { state: 'pending' as 'pending' | 'ok' | 'no', detail: '' }

function silenceWav(): Buffer {
  const samples = 8000 // half a second of 16kHz zeros
  const buf = Buffer.alloc(44 + samples * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + samples * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(16000, 24)
  buf.writeUInt32LE(32000, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(samples * 2, 40)
  return buf
}

export async function probeZaiAsr(): Promise<'ok' | 'no' | 'pending'> {
  try {
    const api = await zaiClient()
    const res = await (
      api.audio.asr.create as (b: unknown) => Promise<{ text?: unknown }>
    ).call(api.audio.asr, { file_base64: silenceWav().toString('base64') })
    asrProbe.state = 'ok'
    asrProbe.detail = typeof res?.text === 'string' ? '' : 'unexpected shape'
  } catch (err) {
    const text = errText(err)
    if (/\b(429|rate|too many|502|503|504)\b/i.test(text)) {
      // A quota window — the same one that trips the LLM chain — not an
      // outage. Available, and the breaker will absorb the failures.
      asrProbe.state = 'ok'
      asrProbe.detail = 'rate-limited at probe time'
    } else {
      asrProbe.state = 'no'
      asrProbe.detail = text
    }
  }
  console.log(
    `[sofia] z-ai asr: ${asrProbe.state}${asrProbe.detail ? ` (${asrProbe.detail})` : ''}`,
  )
  return asrProbe.state
}

type SttProvider = {
  id: string
  label: string
  note: string
  available: () => boolean
  transcribe: (buffer: Buffer, type: string | undefined) => Promise<string>
}

const STT_CHAIN: SttProvider[] = [
  {
    id: 'deepgram',
    label: 'DEEPGRAM',
    note: 'DEEPGRAM_API_KEY',
    available: () => Boolean(env('DEEPGRAM_API_KEY')),
    async transcribe(buffer, type) {
      const model = env('DEEPGRAM_MODEL') || 'nova-3'
      const res = await fetch(
        `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(model)}&smart_format=true`,
        {
          method: 'POST',
          headers: {
            authorization: `Token ${env('DEEPGRAM_API_KEY')}`,
            'content-type': String(type ?? 'audio/webm'),
          },
          body: new Uint8Array(buffer),
          signal: AbortSignal.timeout(20_000),
        },
      )
      if (!res.ok) throw new Error(`deepgram ${res.status}: ${errText(await res.text())}`)
      const data = (await res.json()) as {
        results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> }
      }
      return String(
        data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '',
      ).trim()
    },
  },
  {
    id: 'elevenlabs',
    label: 'ELEVENLABS',
    note: 'ELEVENLABS_API_KEY',
    available: () => Boolean(elevenKey()),
    async transcribe(buffer, type) {
      const form = new FormData()
      form.append('model_id', 'scribe_v1')
      form.append(
        'file',
        new Blob([new Uint8Array(buffer)], { type: String(type ?? 'audio/webm') }),
        `speech.${extFromType(type)}`,
      )
      const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey() ?? '' },
        body: form,
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) throw new Error(`scribe ${res.status}: ${errText(await res.text())}`)
      const data = (await res.json()) as { text?: string }
      return String(data?.text ?? '').trim()
    },
  },
  {
    id: 'zai',
    label: 'Z-AI ASR',
    note: 'built-in, no key',
    available: () => zaiAvailable() && asrProbe.state !== 'no',
    async transcribe(buffer) {
      const api = await zaiClient()
      const res = await (
        api.audio.asr.create as (b: unknown) => Promise<{ text?: unknown }>
      ).call(api.audio.asr, {
        file_base64: Buffer.from(new Uint8Array(buffer)).toString('base64'),
      })
      return String((res as { text?: string })?.text ?? '').trim()
    },
  },
  {
    id: 'local',
    label: 'LOCAL',
    note: 'LOCAL_STT_URL',
    available: () => Boolean(localSttBase()),
    async transcribe(buffer, type) {
      const form = new FormData()
      form.append('model', env('LOCAL_STT_MODEL') || 'whisper-1')
      form.append(
        'file',
        new Blob([new Uint8Array(buffer)], { type: String(type ?? 'audio/webm') }),
        `speech.${extFromType(type)}`,
      )
      const res = await fetch(`${localSttBase()}/audio/transcriptions`, {
        method: 'POST',
        headers: env('LOCAL_STT_API_KEY')
          ? { authorization: `Bearer ${env('LOCAL_STT_API_KEY')}` }
          : {},
        body: form,
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) throw new Error(`local stt ${res.status}: ${errText(await res.text())}`)
      const data = (await res.json()) as { text?: string }
      return String(data?.text ?? '').trim()
    },
  },
]

const sttErrors = new Map<string, string>()
const sttHealth = new Map<string, string>()
let activeStt = ''

/**
 * Transcribe one segment through the first link that answers. Per-request
 * fallthrough (not just breaker-driven): a segment is a few hundred
 * milliseconds of speech, and the words are only useful now.
 */
export async function transcribeAnywhere(
  buffer: Buffer,
  type: string | undefined,
): Promise<{ text: string; provider: string }> {
  const configured = STT_CHAIN.filter((p) => p.available())
  if (!configured.length) throw new Error('no transcription provider is configured')

  const pinId = sttPinId()
  const pin = pinId ? configured.find((p) => p.id === pinId) : null
  if (pinId && !pin) {
    console.warn(`[sofia] SOFIA_STT_PROVIDER="${pinId}" matches nothing — using the chain`)
  }
  const ordered = pin ? [pin] : configured

  let awake = ordered.filter((p) => !STT_GUARD.cooling(p.id))
  if (!awake.length) awake = ordered

  let lastErr: unknown
  for (const p of awake) {
    try {
      const text = await p.transcribe(buffer, type)
      sttHealth.set(p.id, 'ok')
      sttErrors.delete(p.id)
      STT_GUARD.heal(p.id)
      activeStt = p.id
      return { text, provider: p.id }
    } catch (err) {
      lastErr = err
      STT_GUARD.trip(p.id)
      sttHealth.set(p.id, 'err')
      sttErrors.set(p.id, errText(err))
      console.warn(`[sofia] stt provider "${p.id}" failed: ${errText(err)}`)
    }
  }
  throw lastErr ?? new Error('every transcription provider failed')
}

export type SttLinkInfo = {
  id: string
  label: string
  note: string
  configured: boolean
  state: string
  healthy: boolean
  cooling: boolean
  error: string | null
  detail: string
}

export type SttInfo = {
  pin: string | null
  active: string
  providers: SttLinkInfo[]
}

/** Chain status for /health. `available` decides the browser's engine pick. */
export function sttInfo(): SttInfo {
  const pinId = sttPinId()
  const providers: SttLinkInfo[] = STT_CHAIN.map((p) => {
    const state =
      p.id === 'zai' && asrProbe.state === 'pending'
        ? 'never'
        : (sttHealth.get(p.id) ?? 'never')
    return {
      id: p.id,
      label: p.label,
      note: p.note,
      configured: p.available(),
      state,
      healthy: state !== 'err',
      cooling: STT_GUARD.cooling(p.id),
      error: sttErrors.get(p.id) ?? null,
      detail: p.id === 'zai' ? asrProbe.detail : '',
    }
  })
  return {
    pin: pinId || null,
    active: activeStt || providers.find((p) => p.configured)?.id || '',
    providers,
  }
}

/** Does any server-side transcriber exist? The browser asks this once at boot
 *  through /health's `stt` field to choose VAD+segments vs its own
 *  SpeechRecognition. Pending probes count as yes — optimistic beats deaf. */
export function anySttAvailable(): boolean {
  return STT_CHAIN.some((p) => p.available())
}

// ---------------------------------------------------------------------------
// The local TTS tier — an OpenAI-compatible /audio/speech endpoint.
// ---------------------------------------------------------------------------

function localTtsBase(): string {
  const raw = env('LOCAL_TTS_URL')
  return raw ? normaliseBase(raw) : ''
}

export function localTtsAvailable(): boolean {
  return Boolean(localTtsBase())
}

/** One utterance as an audio buffer from a local speech server
 *  (kokoro-fastapi, LocalAI, openedai-speech — anything speaking the
 *  OpenAI /v1/audio/speech shape). */
export async function synthesizeLocalTts(text: string): Promise<Buffer> {
  const base = localTtsBase()
  const res = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env('LOCAL_TTS_API_KEY')
        ? { authorization: `Bearer ${env('LOCAL_TTS_API_KEY')}` }
        : {}),
    },
    body: JSON.stringify({
      model: env('LOCAL_TTS_MODEL') || 'kokoro',
      voice: env('LOCAL_TTS_VOICE') || 'af_sky',
      input: text,
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`local tts ${res.status}: ${errText(await res.text())}`)
  return Buffer.from(await res.arrayBuffer())
}
