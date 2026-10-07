/**
 * SofiaUI server bridge — the adapter seam between the verbatim SofiaUI
 * client surface (src/sofia/**, ported one-way from
 * github.com/samjuniors/SofiaUI @ 9e88dee) and this repo's canonical flow.
 *
 * The SofiaUI client speaks its own REST contract (POST /api/sophia/chat,
 * POST /api/sophia/mouth/speak, GET /api/sophia/status, …). Every handler
 * below serves that contract EXACTLY (response shapes mirror SofiaUI's
 * src/lib/sophia-server.ts) while delegating the actual work to the
 * destination's canonical services:
 *
 *   chat   → executeSophiaTurn (the unified turn executor the OS chat and
 *            the live voice path use) over the canonical ConversationStore
 *            — one persistent per-founder "SofiaUI surface" conversation,
 *            server-authoritative history, directive execution, durable
 *            idempotency. The client-sent `history` field is accepted for
 *            protocol compatibility and NEVER used to reconstruct dialogue
 *            (the same backwards-compatibility-only stance the canonical
 *            /api/sofia/ask route documents).
 *   speak  → the founder-gated TTS ladder this repo already serves at
 *            /api/sofia/tts: ElevenLabs when a key exists, else the z-ai
 *            neural engine (keyless, this deployment's default), else the
 *            pinned local speech server. SofiaUI's explicit provider
 *            preferences (elevenlabs/deepgram) are honored when their
 *            keys exist.
 *   status → SofiaUI's status payload shape, reporting the providers this
 *            deployment actually has (cloud keys are upgrades, never
 *            requirements — the canonical brain and the z-ai mouth always
 *            answer).
 */

import os from 'node:os';
import { executeSophiaTurn } from '@/lib/server/sophia';
import { ConversationStore } from '@/lib/server/conversation/store';
import { elevenKey, ttsPinId, localTtsAvailable, synthesizeLocalTts } from '@/lib/server/providers';
import { ZAI_VOICE_IDS, ELEVEN_VOICE_ID, neuralWithCache } from '@/lib/server/voices';

/** Marker title for the persistent per-founder SofiaUI surface conversation. */
export const SOPHIAUI_CONVERSATION_TITLE = 'Sophia — SofiaUI Surface';

/** Gemini live model names SofiaUI's UI expects to see in /status. */
const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL?.trim() || 'models/gemini-3.8-live';
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL?.trim() || 'gemini-3.8-flash';
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL?.trim() || 'gemini-3.8-flash-lite-tts';

function key(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v !== 'your_xai_api_key_here' && v !== 'your_claude_api_key_here' && v !== 'your_openai_api_key_here'
    ? v
    : undefined;
}
function geminiKey(): string | undefined {
  return key('GEMINI_API_KEY') || key('GOOGLE_API_KEY');
}

/* ------------------------------ status ------------------------------ */

/** SofiaUI's statusPayload() shape, truthfully reporting this deployment. */
export function sophiaStatusPayload() {
  const hasGemini = Boolean(geminiKey());
  const deepgram = Boolean(key('DEEPGRAM_API_KEY'));
  const elevenlabs = Boolean(elevenKey());
  const brainMode = process.env.SOPHIA_BRAIN_MODE?.trim() || 'auto';

  return {
    gemini: hasGemini,
    geminiLive: hasGemini,
    geminiLiveModel: GEMINI_LIVE_MODEL,
    geminiTextModel: GEMINI_TEXT_MODEL,
    geminiTtsModel: GEMINI_TTS_MODEL,
    geminiTts: hasGemini,
    deepgram,
    elevenlabs,
    // The canonical brain (executeSophiaTurn) answers regardless of these
    // cloud keys, but SofiaUI's UI only knows its own provider flags.
    xai: false,
    anthropic: false,
    openai: false,
    activeMouthEngine: elevenlabs ? 'elevenlabs' : hasGemini ? 'gemini' : deepgram ? 'deepgram' : 'browser',
    ollama: {
      configured: Boolean(process.env.OLLAMA_BASE_URL?.trim()),
      baseUrl: process.env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL?.trim() || 'llama3.2',
    },
    lmstudio: {
      configured: Boolean(process.env.LMSTUDIO_BASE_URL?.trim()),
      baseUrl: process.env.LMSTUDIO_BASE_URL?.trim() || 'http://localhost:1234/v1',
      model: process.env.LMSTUDIO_MODEL?.trim() || 'local-model',
    },
    configuredVoiceId:
      process.env.ELEVENLABS_VOICE_ID?.trim() ||
      process.env.SOPHIA_VOICE_ID?.trim() ||
      'bMxLr8fP6hzNRRi9nJxU',
    configuredDeepgramVoice: process.env.DEEPGRAM_VOICE_MODEL?.trim() || 'aura-2-thalia-en',
    defaultBrainMode: brainMode,
    // This deployment always has a brain (canonical executor) and a mouth
    // (the z-ai neural ladder) — SofiaUI's provider flags stay honest
    // about the cloud keys themselves.
    voice: true,
    ok: true,
    searchProviders: {
      tavily: Boolean(key('TAVILY_API_KEY')),
      brave: Boolean(key('BRAVE_SEARCH_API_KEY')),
      duckduckgo: true,
    },
    timestamp: Date.now(),
  };
}

/* ------------------------------- chat ------------------------------- */

export interface SophiaChatBody {
  lastUser?: string;
  history?: Array<{ role: string; text: string; final?: boolean }>;
  brainMode?: string;
  ollamaModel?: string;
  ollamaUrl?: string;
  lmStudioModel?: string;
  lmStudioUrl?: string;
}

/**
 * Resolve the founder's persistent SofiaUI-surface conversation (creating it
 * on first use) so the canonical executor threads multi-turn memory through
 * the server-authoritative ConversationStore — never through the client's
 * history upload.
 */
async function resolveSurfaceConversation(founderId: string): Promise<string> {
  const store = ConversationStore.getInstance();
  const recent = await store.listConversations(founderId, 20);
  const existing = recent.find((c) => c.title === SOPHIAUI_CONVERSATION_TITLE && c.status === 'active');
  if (existing) return existing.id;
  const created = await store.createConversation({
    founderId,
    agentId: 'sophia',
    title: SOPHIAUI_CONVERSATION_TITLE,
  });
  return created.id;
}

/**
 * One SofiaUI chat turn over the canonical executor. Response shape mirrors
 * SofiaUI's /api/sophia/chat: { text, toolCalls, brain, sources }.
 */
export async function sophiaChatTurn(founderId: string, body: SophiaChatBody): Promise<Response> {
  const lastUser = String(body.lastUser ?? '').trim();
  if (!lastUser) {
    return Response.json({ error: 'Missing lastUser message.' }, { status: 400 });
  }
  // body.history is deliberately NOT read: canonical history comes from the
  // ConversationStore (same contract /api/sofia/ask documents for its own
  // legacy history field).

  const conversationId = await resolveSurfaceConversation(founderId);
  const turnId = `sophia-ui-${crypto.randomUUID()}`;

  const result = await executeSophiaTurn({
    message: lastUser,
    founderId,
    conversationId,
    turnId,
    executeDirective: true, // live founder interaction — same default as the canonical surfaces
    ingress: 'sophia_ui',
  });

  if (!result.success || !result.reply) {
    return Response.json(
      { error: result.error || 'The turn failed.' },
      { status: 500 },
    );
  }

  return Response.json({
    text: result.reply,
    toolCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    brain: 'sophia-os',
    sources: [] as Array<{ title: string; url: string }>,
    conversationId: result.conversationId,
  });
}

/* ------------------------------- speak ------------------------------- */

export interface SophiaSpeakBody {
  text?: string;
  provider?: string;
  voice?: string;
  voiceId?: string;
  modelId?: string;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

/** SofiaUI's gemini voice names → the nearest z-ai neural voice. */
function mapGeminiVoiceToZai(voiceName?: string): string | undefined {
  const v = (voiceName || '').toLowerCase();
  if (!v) return undefined;
  if (['puck', 'charon', 'fenrir'].includes(v)) return 'jam'; // male
  if (['aoede', 'kore', 'zephyr'].includes(v)) return 'tongtong'; // female default
  return undefined;
}

async function speakWithElevenLabs(text: string, voiceId: string, modelId: string): Promise<Response> {
  const apiKey = elevenKey();
  if (!apiKey) return json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 503 });
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: modelId || 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
    }),
  });
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    return json({ error: `elevenlabs-speak:${res.status}`, details: errText }, { status: 502 });
  }
  return new Response(res.body, {
    headers: { 'content-type': res.headers.get('content-type') ?? 'audio/mpeg', 'transfer-encoding': 'chunked' },
  });
}

async function speakWithDeepgram(text: string, voice: string): Promise<Response> {
  const apiKey = key('DEEPGRAM_API_KEY');
  if (!apiKey) return json({ error: 'DEEPGRAM_API_KEY not configured' }, { status: 503 });
  const res = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice)}`, {
    method: 'POST',
    headers: { authorization: `Token ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) return json({ error: `speak:${res.status}` }, { status: 502 });
  return new Response(res.body, {
    headers: { 'content-type': res.headers.get('content-type') ?? 'audio/mpeg' },
  });
}

/**
 * SofiaUI's unified mouth: honor an explicit cloud provider when its key
 * exists, else fall through to the destination's canonical TTS ladder
 * (ElevenLabs → z-ai neural → local), which answers keyless here.
 * Audio response (audio/mpeg or audio/wav) — never throws.
 */
export async function sophiaSpeak(body: SophiaSpeakBody): Promise<Response> {
  const text = String(body.text ?? '').trim();
  if (!text) return json({ error: 'Text is required for TTS' }, { status: 400 });
  if (text.length > 32_000) return json({ error: 'Text too long' }, { status: 400 });

  const provider = body.provider || 'auto';
  const pin = ttsPinId();

  try {
    // SofiaUI's explicit provider preferences, when the key backs them.
    if (provider === 'elevenlabs' && elevenKey()) {
      return await speakWithElevenLabs(
        text,
        body.voiceId || process.env.ELEVENLABS_VOICE_ID || 'bMxLr8fP6hzNRRi9nJxU',
        body.modelId || 'eleven_turbo_v2_5',
      );
    }
    if (provider === 'deepgram' && key('DEEPGRAM_API_KEY')) {
      return await speakWithDeepgram(text, body.voice || process.env.DEEPGRAM_VOICE_MODEL || 'aura-2-thalia-en');
    }

    // Destination ladder tier 1: ElevenLabs when a key exists (unpinned).
    if (elevenKey() && pin !== 'zai' && pin !== 'local') {
      try {
        return await speakWithElevenLabs(text, ELEVEN_VOICE_ID, 'eleven_flash_v2_5');
      } catch (err) {
        console.error('[sophia-ui] elevenlabs speak failed, falling to neural:', (err as Error).message);
      }
    }

    // Destination ladder tier 2: the pinned local speech server.
    if (pin === 'local' && localTtsAvailable()) {
      try {
        const audio = await synthesizeLocalTts(text);
        return new Response(new Uint8Array(audio), {
          headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-cache', 'x-tts-engine': 'local' },
        });
      } catch (err) {
        console.error('[sophia-ui] local speak failed, falling to neural:', (err as Error).message);
      }
    }

    // Destination ladder tier 3: the z-ai neural engine (keyless default).
    const voiceId =
      (body.voiceId && ZAI_VOICE_IDS.has(body.voiceId) ? body.voiceId : undefined) ??
      mapGeminiVoiceToZai(body.voice) ??
      undefined;
    const { audio, voiceId: used } = await neuralWithCache(text, voiceId, undefined);
    return new Response(new Uint8Array(audio), {
      headers: {
        'content-type': 'audio/wav',
        'cache-control': 'no-cache',
        'x-tts-engine': 'zai',
        'x-tts-voice': used,
      },
    });
  } catch (err) {
    console.error('[sophia-ui] neural speak failed:', (err as Error).message);
    if (localTtsAvailable() && pin !== 'zai') {
      try {
        const audio = await synthesizeLocalTts(text);
        return new Response(new Uint8Array(audio), {
          headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-cache', 'x-tts-engine': 'local' },
        });
      } catch {
        /* fall through to 503 */
      }
    }
    // 503, not 500: the client treats this as "cloud gone → browser
    // speechSynthesis fallback for this sentence" — exactly right.
    return json({ error: (err as Error)?.message || 'neural tts failed' }, { status: 503 });
  }
}

/* ------------------------------- voices ------------------------------ */

const ELEVEN_PRESET_VOICES = [
  { voice_id: 'bMxLr8fP6hzNRRi9nJxU', name: 'Sophia Custom (.env)' },
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Calm & Professional)' },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Warm & Deep)' },
  { voice_id: 'piTKgcLEGmPE4e6mEKli', name: 'Nicole (Whispering & Soft)' },
  { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte (Expressive & Elegant)' },
  { voice_id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (British Accent)' },
];

/** SofiaUI's /api/sophia/elevenlabs/voices shape. */
export async function sophiaElevenLabsVoices(): Promise<Response> {
  const apiKey = elevenKey();
  if (!apiKey) return json({ voices: ELEVEN_PRESET_VOICES });
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } });
    if (!res.ok) throw new Error(`voices-fetch:${res.status}`);
    const data = (await res.json()) as { voices?: Array<{ voice_id: string; name: string; category?: string }> };
    return json({ voices: data.voices ?? [] });
  } catch (err) {
    console.warn('[sophia-ui] voices fetch failed, returning presets:', (err as Error).message);
    return json({ voices: ELEVEN_PRESET_VOICES });
  }
}

/* ---------------------------- system action ---------------------------- */

/**
 * SofiaUI's /api/sophia/system/action. get_time / get_system_info are real
 * (this server is the founder's own deployment). The desktop-open actions
 * respond honestly: the user-visible part (the in-app Sofia BrowserPanel)
 * is client-side; the server here does not spawn desktop processes on a
 * hosted deployment.
 */
export async function sophiaSystemAction(body: {
  action?: string;
  url?: string;
  query?: string;
  app?: string;
}): Promise<Response> {
  const action = body.action;

  if (action === 'get_time') {
    const now = new Date();
    return json({
      success: true,
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      iso: now.toISOString(),
    });
  }

  if (action === 'get_system_info') {
    return json({
      success: true,
      platform: process.platform,
      hostname: os.hostname(),
      arch: process.arch,
      cpus: os.cpus().length,
      totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
      freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
      uptimeSeconds: Math.round(os.uptime()),
    });
  }

  if (action === 'open_browser' || action === 'search_browser' || action === 'stream_media' || action === 'open_app') {
    const target =
      body.url ||
      (body.query ? `https://html.duckduckgo.com/html/?q=${encodeURIComponent(body.query)}` : 'https://www.google.com');
    return json({
      success: true,
      url: target,
      title: body.query || 'Browser',
      message: `Opening ${body.query || 'browser'} in Sofia.`,
    });
  }

  return json({ error: `Unknown system action: ${action}` }, { status: 400 });
}
