/**
 * POST /api/sofia/ask — one turn of the SOFIA surface conversation, streamed
 * as SSE.
 *
 * M3 (K-1) CONVERSATION AUTHORITY CONVERGENCE:
 * This route is a thin governed ingress over the canonical server-side
 * conversation path. Every turn is delegated to executeSophiaTurn — the SAME
 * unified executor the OS chat and the live voice surface use:
 *
 *   request → authenticated founder session (fail-closed)
 *          → ConversationStore (canonical conversation identity + history)
 *          → executeSophiaTurn (idempotency + turn locking + ownership)
 *          → SophiaContextAssembler → SophiaIntentClassifier
 *          → SophiaServerGateway → canonical persistence
 *          → SSE frames (ready / text / done / error)
 *
 * There is no second Sophia: the route holds no conversation state of its
 * own, persists nothing directly, and never reconstructs history from the
 * browser.
 *
 * Body: { text, conversationId?, turnId?, persona?, history? }
 *   - conversationId: canonical ConversationStore id (founder-bound,
 *     fail-closed on ownership mismatch). When absent, the canonical store
 *     provisions a new conversation; the id is returned on the done frame.
 *   - turnId: client turn identifier for idempotency; generated when absent.
 *   - persona / history: ACCEPTED FOR BACKWARDS COMPATIBILITY ONLY. They are
 *     untrusted client state — never persisted, never used to reconstruct or
 *     overwrite canonical conversation history. The authoritative dialogue
 *     history comes exclusively from the ConversationStore.
 */

import { NextRequest, NextResponse } from 'next/server'
import { executeSophiaTurn } from '@/lib/server/sophia'
import { getAuthenticatedFounder } from '@/lib/server/auth/session'
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
  conversationId?: string
  turnId?: string
  // Untrusted legacy fields — accepted, never authoritative (see header):
  persona?: string | null
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * Split the canonical reply into sentence-sized deltas so the transcript and
 * the TTS pipeline receive roughly the cadence the old streaming path had.
 */
function chunkReply(reply: string): string[] {
  const chunks: string[] = []
  let buf = ''
  for (const part of reply.split(/(?<=[.!?…])\s+/)) {
    if (buf && (buf + ' ' + part).length > 180) {
      chunks.push(buf.trim())
      buf = part
    } else {
      buf = buf ? `${buf} ${part}` : part
    }
  }
  if (buf.trim()) chunks.push(buf.trim())
  return chunks.length ? chunks : [reply]
}

export async function POST(req: NextRequest) {
  // Fail-closed founder authentication — the same session contract as
  // /api/agent-chat and the governed OS surface. Identity never comes from
  // the request body. (Runs before anything else, including the ASR boot
  // probe, so unauthenticated requests never touch external services.)
  const session = await getAuthenticatedFounder(req)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 })
  }
  probeOnce()

  let body: AskBody
  try {
    body = (await req.json()) as AskBody
  } catch {
    return new Response('bad json', { status: 400 })
  }
  const text = String(body.text ?? '').trim()
  if (!text) return new Response('no text', { status: 400 })

  const conversationId =
    typeof body.conversationId === 'string' && body.conversationId.trim()
      ? body.conversationId.trim()
      : undefined
  const turnId =
    typeof body.turnId === 'string' && body.turnId.trim()
      ? body.turnId.trim()
      : `sofia-ask-${crypto.randomUUID()}`

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
          // stop writing — the canonical turn still completes and persists
          // server-side, exactly like the OS chat path.
          closed = true
        }
      }

      // The ready frame still tells the browser which brain link is about to
      // answer.
      send({ type: 'ready', brain: llmInfo() })

      try {
        const result = await executeSophiaTurn({
          message: text,
          founderId: session.userId,
          conversationId,
          turnId,
          executeDirective: true, // live founder interaction — same default as the live voice path
          ingress: 'sofia_ask',
        })

        if (!result.success || !result.reply) {
          send({
            type: 'error',
            message: result.error || result.reply || 'The turn failed.',
            conversationId: result.conversationId || undefined,
          })
        } else {
          for (const delta of chunkReply(result.reply)) {
            send({ type: 'text', delta })
          }
          send({
            type: 'done',
            text: result.reply,
            conversationId: result.conversationId,
            idempotentReplay: result.idempotentReplay === true,
          })
        }
      } catch (err) {
        console.error('[sofia] turn failed:', (err as Error)?.message ?? err)
        send({ type: 'error', message: (err as Error)?.message ?? 'The turn failed.' })
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
