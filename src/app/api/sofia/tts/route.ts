/**
 * POST /api/sofia/tts — one spoken line as audio.
 *
 * Body: { text, voice?, speed? }
 * The ladder, best first:
 *   1. ElevenLabs, when ELEVENLABS_API_KEY is set (streamed through).
 *   2. The z-ai neural engine — no key, conversational voices, cached.
 *   3. A local OpenAI-compatible speech server (LOCAL_TTS_URL).
 * A pin (SOFIA_TTS_PROVIDER) collapses the ladder to one link on purpose.
 * Any failure returns 503 — the browser then falls back to its own system
 * voice for that sentence, which is exactly the right failure mode.
 */

import { elevenKey, ttsPinId, localTtsAvailable, synthesizeLocalTts } from '@/lib/server/providers'
import { ZAI_VOICE_IDS, ELEVEN_VOICE_ID, neuralWithCache } from '@/lib/server/voices'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TtsBody = { text?: string; voice?: string; speed?: number }

export async function POST(req: Request) {
  let body: TtsBody
  try {
    body = (await req.json()) as TtsBody
  } catch {
    return new Response('bad json', { status: 400 })
  }
  const text = String(body.text ?? '').trim()
  if (!text) return new Response('no text', { status: 400 })
  if (text.length > 32_000) return new Response('text too long', { status: 400 })

  const pin = ttsPinId()
  const key = elevenKey()

  // ---- tier 1: ElevenLabs, when the user has put a key in .env.local -----
  // Best English voices there are; when it is absent we never even dial them.
  if (key && pin !== 'zai' && pin !== 'local') {
    try {
      const upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}/stream` +
          // 22kHz mono is half the bytes of 44kHz and indistinguishable through
          // a laptop speaker; optimize_streaming_latency=3 trades a little
          // prosody for a much earlier first byte.
          `?output_format=mp3_22050_32&optimize_streaming_latency=3`,
        {
          method: 'POST',
          headers: { 'xi-api-key': key, 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            // Flash is the low-latency model — a conversation needs speed more
            // than it needs the last few percent of quality.
            model_id: 'eleven_flash_v2_5',
            voice_settings: { stability: 0.4, similarity_boost: 0.75, speed: 1.05 },
          }),
        },
      )
      if (!upstream.ok || !upstream.body) {
        return new Response(await upstream.text().catch(() => ''), { status: upstream.status })
      }
      // Pipe it through rather than buffering. Waiting for the whole file here
      // would throw away everything the streaming endpoint just bought us.
      return new Response(upstream.body, {
        headers: {
          'content-type': 'audio/mpeg',
          'cache-control': 'no-cache',
          'x-tts-engine': 'elevenlabs',
        },
      })
    } catch (err) {
      // fall through to the neural engine — an ElevenLabs hiccup must not
      // cost the sentence when a keyless engine is sitting right there.
      console.error('[sofia] elevenlabs tts failed:', (err as Error)?.message ?? err)
    }
  }

  // ---- tier 2: a local speech server, when pinned to it -------------------
  if (pin === 'local' && localTtsAvailable()) {
    try {
      const audio = await synthesizeLocalTts(text)
      return new Response(new Uint8Array(audio), {
        headers: {
          'content-type': 'audio/mpeg',
          'cache-control': 'no-cache',
          'x-tts-engine': 'local',
        },
      })
    } catch (err) {
      console.error('[sofia] local tts failed:', (err as Error)?.message ?? err)
      // fall through to the neural engine — a pin is a preference, not a
      // death sentence for the sentence.
    }
  }

  // ---- tier 3: the z-ai neural engine (no key, this sandbox's default) ----
  // The browser sends its chosen voice id; anything unrecognised falls back
  // to the default female rather than being refused, because a saved choice
  // from a newer server should not brick an older one.
  try {
    const { audio, voiceId } = await neuralWithCache(text, body.voice, body.speed)
    return new Response(new Uint8Array(audio), {
      headers: {
        'content-type': 'audio/wav',
        'cache-control': 'no-cache',
        'x-tts-engine': 'zai',
        'x-tts-voice': voiceId,
      },
    })
  } catch (err) {
    console.error('[sofia] neural tts failed:', (err as Error)?.message ?? err)

    // ---- the local speech server, if one exists (unpinned) ---------------
    if (localTtsAvailable() && pin !== 'zai') {
      try {
        const audio = await synthesizeLocalTts(text)
        return new Response(new Uint8Array(audio), {
          headers: {
            'content-type': 'audio/mpeg',
            'cache-control': 'no-cache',
            'x-tts-engine': 'local',
          },
        })
      } catch (err2) {
        console.error('[sofia] local tts failed:', (err2 as Error)?.message ?? err2)
      }
    }

    // 503, not 500: the browser's per-sentence fallback treats any failure
    // here as "cloud is gone, use the system voice" — which is exactly right.
    return new Response(String((err as Error)?.message ?? 'neural tts failed'), { status: 503 })
  }
}

// Referenced so the import survives lints that cannot see the pin check above.
void ZAI_VOICE_IDS
