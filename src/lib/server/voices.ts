/**
 * The neural voice engine + catalogue, through the z-ai SDK that already
 * powers the brain. Ported from the old bridge's server.mjs.
 *
 * These are the fallback — and in this sandbox, the default — speech engine
 * for /api/sofia/tts: far warmer than any browser's speechSynthesis, no key
 * to own, and a handful of female conversational voices for the SOFIA
 * persona (plus two male ones, so the JARVIS persona has somewhere to go).
 * If an ElevenLabs key IS configured, it wins instead — see the tts route.
 *
 * Genders were measured, not guessed: samples of each voice were generated
 * and their fundamental frequency analysed (female ≈ 165–255 Hz, male ≈
 * 85–155 Hz).
 */

import ZAI from 'z-ai-web-dev-sdk'
import { ttsPinId, localTtsAvailable, elevenKey } from './providers'

export type NeuralVoice = {
  id: string
  label: string
  gender: 'female' | 'male'
  vibe: string
}

export const ZAI_VOICES: NeuralVoice[] = [
  { id: 'tongtong', label: 'Tongtong', gender: 'female', vibe: 'warm · friendly' },
  { id: 'chuichui', label: 'Chuichui', gender: 'female', vibe: 'lively · playful' },
  { id: 'kazi', label: 'Kazi', gender: 'female', vibe: 'crisp · clear' },
  { id: 'douji', label: 'Douji', gender: 'female', vibe: 'smooth · natural' },
  { id: 'luodo', label: 'Luodo', gender: 'female', vibe: 'expressive · warm' },
  { id: 'jam', label: 'Jam', gender: 'male', vibe: 'british · calm' },
  { id: 'xiaochen', label: 'Xiaochen', gender: 'male', vibe: 'steady · professional' },
]

export const ZAI_VOICE_IDS = new Set(ZAI_VOICES.map((v) => v.id))
export const DEFAULT_ZAI_VOICE = 'tongtong'

/** The ElevenLabs voice the tts route uses when a key exists. */
export const ELEVEN_VOICE_ID = process.env.SOFIA_VOICE_ID ?? process.env.JARVIS_VOICE_ID ?? 'JBFqnCBsd6RMkjVDRZzb'

/** Which engine the health route should advertise first. */
export function ttsEngineChoice(): 'elevenlabs' | 'zai' | 'local' {
  const pin = ttsPinId()
  if (pin === 'local' && localTtsAvailable()) return 'local'
  if (elevenKey() && pin !== 'zai' && pin !== 'local') return 'elevenlabs'
  return 'zai'
}

/** One client for every sentence — creating an SDK instance per request was
 *  pure latency. Latched "broken" only if creation itself fails, so a key that
 *  exists but misbehaves still falls back per-sentence in the browser. */
let zaiTtsClient: Awaited<ReturnType<typeof ZAI.create>> | null = null
async function zaiTTS() {
  if (!zaiTtsClient) zaiTtsClient = await ZAI.create()
  return zaiTtsClient
}

/** The SDK takes at most 1024 characters a call. Spoken sentences are far
 *  shorter, but a long filler or a chunked answer can exceed it — split at
 *  sentence boundaries and keep anything tail-heavy as its own chunk. */
function chunkForTts(text: string, max = 1000): string[] {
  if (text.length <= max) return [text]
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) ?? [text]
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current && (current + sentence).length > max) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current += sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

/** The same filler lines are spoken over and over ("Working on it") —
 *  caching them makes the second occurrence instant. Small map, capped by
 *  count; a sentence of wav is a few hundred KB. */
const TTS_CACHE_MAX = 96
const ttsCache = new Map<string, Buffer>()

/**
 * Merge the PCM of several WAV buffers into one file. This backend only
 * speaks wav — mp3 is refused with code 1214 — and naive concatenation would
 * bury RIFF headers mid-stream. Every chunk comes from the same engine, so
 * the first buffer's fmt block describes them all.
 */
function mergeWav(buffers: Buffer[]): Buffer {
  const first = buffers[0]
  // "RIFF" (8) + "WAVE" (4) + "fmt " id/size (8) + the fmt payload itself.
  // The engine also writes an "AIGC" metadata chunk between fmt and data —
  // the data scan below walks past whatever chunks it finds.
  const fmtEnd = 20 + first.readUInt32LE(16)
  const fmt = first.subarray(0, fmtEnd)
  const datas = buffers.map((b) => {
    let off = fmtEnd
    while (off + 8 <= b.length) {
      const id = b.toString('ascii', off, off + 4)
      const size = b.readUInt32LE(off + 4)
      if (id === 'data') return b.subarray(off + 8, off + 8 + size)
      off += 8 + size + (size % 2)
    }
    return b.subarray(0, 0)
  })
  const total = datas.reduce((n, d) => n + d.length, 0)
  const out = Buffer.alloc(fmtEnd + 8 + total)
  fmt.copy(out, 0, 0, fmtEnd)
  let o = fmtEnd
  out.write('data', o, 'ascii')
  o += 4
  out.writeUInt32LE(total, o)
  o += 4
  for (const d of datas) {
    d.copy(out, o)
    o += d.length
  }
  out.writeUInt32LE(o - 8, 4) // the RIFF size the copied header still carried
  return out
}

/**
 * Generate one utterance as wav through the neural engine. Returns a Buffer,
 * or throws — the caller turns that into a 503 and the browser falls back to
 * its own system voice for that sentence.
 *
 * The backend rate-limits under bursts (429) — a long answer cut into
 * sentences can be three calls in as many seconds — so each chunk is retried
 * with a short backoff before anything is declared failed.
 */
export async function synthesizeNeural(text: string, voiceId: string, speed: number): Promise<Buffer> {
  const zai = await zaiTTS()
  const chunks = chunkForTts(text)
  const parts: Buffer[] = []
  for (const chunk of chunks) {
    parts.push(await withRetry(() => speakChunk(zai, chunk, voiceId, speed)))
  }
  return parts.length === 1 ? parts[0] : mergeWav(parts)
}

/** One SDK call, one buffer. */
async function speakChunk(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  input: string,
  voice: string,
  speed: number,
): Promise<Buffer> {
  const response = await (
    zai.audio.tts.create as (b: unknown) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }>
  ).call(zai.audio.tts, {
    input,
    voice,
    speed,
    response_format: 'wav',
    stream: false,
  })
  return Buffer.from(new Uint8Array(await response.arrayBuffer()))
}

/** Retry a call on 429 only, with a growing pause. Anything else — auth,
 *  bad request — will fail identically next time and is not worth waiting on.
 *  The pause ladder is deliberately generous: a burst of sentences can trip
 *  a per-minute window, and the alternative to waiting is the browser falling
 *  back to its robot voice for that sentence. */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const msg = String((err as Error | undefined)?.message ?? err)
      if (!/429|too many/i.test(msg)) throw err
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 1200 * (i + 1)))
    }
  }
  throw lastErr
}

/** Cache lookup-and-fill in one place so the route stays flat. */
export async function neuralWithCache(
  text: string,
  voice: string | undefined,
  speed: number | undefined,
): Promise<{ audio: Buffer; voiceId: string }> {
  const voiceId = ZAI_VOICE_IDS.has(voice ?? '') ? (voice as string) : DEFAULT_ZAI_VOICE
  const clamped = Math.min(2, Math.max(0.5, Number(speed) || 1))
  const cacheKey = `${voiceId}|${clamped}|${text}`
  let audio = ttsCache.get(cacheKey)
  if (!audio) {
    audio = await synthesizeNeural(text, voiceId, clamped)
    ttsCache.set(cacheKey, audio)
    if (ttsCache.size > TTS_CACHE_MAX) {
      // Map preserves insertion order, so the first key is the oldest.
      ttsCache.delete(ttsCache.keys().next().value as string)
    }
  }
  return { audio, voiceId }
}
