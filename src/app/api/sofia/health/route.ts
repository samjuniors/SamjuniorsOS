/**
 * GET /api/sofia/health — the engine inventory.
 *
 * The browser reads this once at boot to decide which engines to use, and
 * the settings panel re-reads it on every open so the chains it shows are
 * the server's now, not the boot's. Tiers, best first: an ElevenLabs key
 * (best English voices, needs a key the user supplies), then the z-ai neural
 * engine (no key, conversational female/male voices), then a local speech
 * server, then the browser's own speech. STT walks its own chain: Deepgram →
 * ElevenLabs Scribe → z-ai ASR (no key) → a local server.
 */

import { llmInfo, sttInfo, anySttAvailable, ttsPinId, localTtsAvailable } from '@/lib/server/providers'
import { ZAI_VOICES, ttsEngineChoice } from '@/lib/server/voices'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const engine = ttsEngineChoice()
  return Response.json({
    ok: true,
    tts: true,
    stt: anySttAvailable(),
    engine,
    voices: ZAI_VOICES,
    servers: ['web', 'page', 'images', 'display', 'interface'],
    llm: llmInfo(),
    sttChain: sttInfo(),
    ttsChain: [
      { id: 'elevenlabs', label: 'ELEVENLABS', note: 'ELEVENLABS_API_KEY', configured: engine === 'elevenlabs' },
      { id: 'zai', label: 'Z-AI NEURAL', note: 'built-in, no key', configured: true },
      { id: 'local', label: 'LOCAL', note: 'LOCAL_TTS_URL', configured: localTtsAvailable() },
      { id: 'system', label: 'SYSTEM', note: 'the browser\u2019s own voice', configured: true },
    ],
  })
}

// Keep the pin referenced so the import is not tree-shaken away in odd builds
// (it is consulted inside ttsEngineChoice; this is belt and braces).
void ttsPinId
