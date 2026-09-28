/**
 * POST /api/sofia/stt — one spoken segment, transcribed.
 *
 * The browser captures a segment as a compressed audio blob and posts the
 * raw bytes here; the chain in providers.ts walks its links — Deepgram →
 * ElevenLabs Scribe → the z-ai transcriber (no key) → a local server — and
 * the first one that answers wins. Detecting that the user is speaking at
 * all is still done locally with voice-activity detection; this endpoint is
 * only for the words. The browser's own recogniser remains the last link,
 * client-side, for the day every server link is down.
 */

import { transcribeAnywhere, anySttAvailable, sttInfo } from '@/lib/server/providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!anySttAvailable()) {
    return new Response('no transcription provider', { status: 503 })
  }

  // A few seconds of Opus is well under a megabyte; 25 MB is a generous
  // ceiling that still refuses a runaway stream before it eats the heap.
  const max = 25 * 1024 * 1024
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > max) return new Response('audio too large', { status: 413 })

  let buffer: Buffer
  try {
    buffer = Buffer.from(await req.arrayBuffer())
  } catch {
    return new Response('bad body', { status: 400 })
  }
  if (buffer.length > max) return new Response('audio too large', { status: 413 })

  // Silence, or a click. Nothing to transcribe, and calling out to a chain
  // for it would only add latency to a non-answer.
  if (buffer.length < 1200) {
    return Response.json({ text: '' })
  }

  const type = req.headers.get('content-type') ?? 'audio/webm'
  try {
    const { text } = await transcribeAnywhere(buffer, type)
    return new Response(JSON.stringify({ text }), {
      headers: {
        'content-type': 'application/json',
        'x-stt-engine': sttInfo().active,
      },
    })
  } catch (err) {
    // 503: the browser treats any failure here as "the chain is down",
    // counts it, and after a run of them degrades to its own recogniser.
    console.error('[sofia] every stt provider failed:', (err as Error)?.message ?? err)
    return new Response(String((err as Error)?.message ?? 'transcription failed'), { status: 503 })
  }
}
