/**
 * POST /api/sofia/ask — one turn of the conversation, streamed as SSE.
 *
 * Body: { text, history?: [{role, content}], persona?: string }
 * Stream: `data: {frame}\n\n` lines — the same frames the bridge's WebSocket
 * used to send: text / tool / panel / blade / ui / provider / done / error.
 */

import { runAsk, everyEngineFailedMessage } from '@/lib/server/brain'
import { llmInfo, probeZaiAsr } from '@/lib/server/providers'

// The z-ai ASR boot probe — fired once per server process, the first time
// anyone asks anything. A pending probe reads as "available" in /health;
// this just makes it settle sooner.
let probed = false
function probeOnce() {
  if (probed) return
  probed = true
  void probeZaiAsr()
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AskBody = {
  text?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  persona?: string | null
}

export async function POST(req: Request) {
  probeOnce()

  let body: AskBody
  try {
    body = (await req.json()) as AskBody
  } catch {
    return new Response('bad json', { status: 400 })
  }
  const text = String(body.text ?? '').trim()
  if (!text) return new Response('no text', { status: 400 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (frame: Record<string, unknown>) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`))
        } catch {
          // The client went away mid-turn (a barge-in aborts the fetch);
          // stop writing, let the turn finish quietly.
          closed = true
        }
      }

      // The frames the old bridge stamped with the ask id don't need the id
      // any more — one stream per question — but the ready frame still tells
      // the browser which brain link is about to answer.
      send({ type: 'ready', brain: llmInfo() })

      try {
        await runAsk({
          text,
          history: Array.isArray(body.history) ? body.history.slice(-40) : [],
          persona: body.persona ?? null,
          io: {
            send,
            sendTurn: send,
            announce: (_id, name) => send({ type: 'tool', name }),
          },
        })
      } catch (err) {
        console.error('[sofia] turn failed:', (err as Error)?.message ?? err)
        send({ type: 'error', message: everyEngineFailedMessage() })
      } finally {
        closed = true
        try {
          controller.close()
        } catch {
          /* already closed by the abort path */
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}
