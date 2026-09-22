/**
 * Client for the SOFIA server — the Next.js API routes at /api/sofia/*.
 *
 * This replaces the WebSocket bridge client. Same exported surface (ask /
 * warm / cancel / watch* / connectedLabels) so App.tsx doesn't change shape;
 * different transport: one fetch per turn, answered by a Server-Sent-Events
 * stream carrying the same frames the socket used to — text deltas, tool
 * badges, panels, blades, ui ops, provider switches, done, error.
 *
 * The conversation state moved with the session. The bridge held one brain
 * per socket and the whole history lived inside it; an HTTP request is
 * stateless, so the history rides up with every ask (App.tsx already keeps
 * it for the direct path — usingBridge is false here for exactly that
 * reason) and the server rebuilds its message list per request.
 */

import type { Blade, Panel } from '../store'
import { API_BASE } from '../config'

/** Handlers a turn fills — onText per delta, onTool per tool start. */
export type AskHandlers = {
  onText: (delta: string) => void
  onTool: (name: string) => void
}

/** One conversation message in the OpenAI wire shape. */
export type Msg = { role: 'user' | 'assistant'; content: string }

/** Anything the stream can send. Deliberately loose — a frame from a newer
 *  server build should be ignored, not crash the turn. */
type Frame = {
  type?: string
  delta?: string
  name?: string
  text?: string
  message?: string
  panel?: Panel
  blade?: Blade
  op?: string
  args?: unknown
  servers?: Array<string | { name?: string }>
  brain?: { id?: unknown; label?: unknown }
}

/** Server names reported by the health probe, for the HUD readout. */
let servers: string[] = []
export const bridgeServers = () => servers

let onServers: ((s: string[]) => void) | null = null
export function watchServers(fn: (s: string[]) => void) {
  onServers = fn
}

/** Which link of the LLM chain is answering — announced at warm-up and again
 *  on every mid-session failover (z-ai → Gemini → a local server). Typed at
 *  the border: a label that isn't a string is dropped rather than trusted. */
export type BrainStatus = { id: string; label: string }
let brain: BrainStatus = { id: 'zai', label: 'Z-AI' }
export const brainStatus = () => brain

let onBrain: ((b: BrainStatus) => void) | null = null
export function watchBrain(fn: (b: BrainStatus) => void) {
  onBrain = fn
}

function noteBrain(raw: unknown) {
  const id = typeof (raw as BrainStatus | undefined)?.id === 'string' ? (raw as BrainStatus).id : ''
  const label =
    typeof (raw as BrainStatus | undefined)?.label === 'string' ? (raw as BrainStatus).label : ''
  if (!id || !label) return
  if (brain.id === id && brain.label === label) return
  brain = { id, label }
  onBrain?.(brain)
}

/** Panels arrive mid-stream — pushed while a turn is in flight. */
let onPanel: ((panel: Panel) => void) | null = null
export function watchPanels(fn: (panel: Panel) => void) {
  onPanel = fn
}

/** Blades arrive the same way panels do. */
let onBlade: ((blade: Blade) => void) | null = null
export function watchBlades(fn: (blade: Blade) => void) {
  onBlade = fn
}

/** Commands that redress the interface — theme, reactor, orbits, effects. */
let onUi: ((op: string, args: any) => void) | null = null
export function watchUi(fn: (op: string, args: any) => void) {
  onUi = fn
}

/** Connection state. There is no socket to lose any more — an ask either
 *  streams or it throws — but the surface is kept so the HUD wiring is
 *  unchanged. 'lost' fires when a stream dies mid-answer. */
export type ConnectionState = 'open' | 'lost' | 'reconnected'
let onConnection: ((state: ConnectionState) => void) | null = null
export function watchConnection(fn: (state: ConnectionState) => void) {
  onConnection = fn
}

/** Kept for the HUD's honesty checks; the API is always "connected" between
 *  turns — each one is its own request, so nothing can be down until tried. */
export function isConnected(): boolean {
  return true
}

// ---------------------------------------------------------------------------
// Warm-up
// ---------------------------------------------------------------------------

/**
 * Ping the server once so the first "Hey Sofia" already knows which engines
 * exist (the health payload names the active brain and every chain link).
 * Never throws — a cold server is reported by the first ask instead.
 */
export async function warmServer(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return
    const info = (await res.json()) as {
      servers?: string[]
      llm?: { active?: string; label?: string }
    }
    if (Array.isArray(info.servers)) {
      servers = info.servers.map((s) => (typeof s === 'string' ? s : '')).filter(Boolean)
      onServers?.(servers)
    }
    noteBrain({ id: info.llm?.active ?? 'zai', label: info.llm?.label ?? 'Z-AI' })
  } catch {
    /* the health probe is advisory only */
  }
}

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

/**
 * No frame of any kind for two minutes means the turn is never coming back.
 * Generous on purpose: a long tool run can sit silent, and cutting a real
 * answer off is worse than waiting.
 */
const IDLE_TIMEOUT_MS = 120_000

/** The turn in flight, so a barge-in can settle it locally. */
let pending: { abort: (reason?: string) => void } | null = null

/** The abort controller behind pending — the stream's kill switch. */
let pendingAbort: AbortController | null = null

/**
 * Ask the server a question and stream the answer.
 *
 * A new question supersedes the one in flight — same rule the socket had:
 * cancelling aborts the fetch (which stops the server's work the moment the
 * framework notices the disconnect) and settles the old promise with the
 * words said so far.
 */
export async function ask(
  prompt: string,
  history: Msg[],
  handlers: AskHandlers,
  persona?: string,
): Promise<{ text: string; tools: string[] }> {
  if (pending) cancel()
  const controller = new AbortController()
  pendingAbort = controller
  pending = { abort: (reason) => controller.abort(reason ? new Error(reason) : undefined) }

  const tools: string[] = []
  let text = ''
  let lastFrame = Date.now()

  const idle = setInterval(() => {
    if (Date.now() - lastFrame > IDLE_TIMEOUT_MS) {
      controller.abort(new Error('The server went quiet — that turn was lost.'))
    }
  }, 5_000)

  try {
    const res = await fetch(`${API_BASE}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: prompt,
        history: history.slice(-40),
        persona: persona ?? null,
      }),
      signal: controller.signal,
    })

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '')
      throw new Error(detail || `The server answered ${res.status}.`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      lastFrame = Date.now()
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, '')
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        let msg: Frame
        try {
          msg = JSON.parse(data)
        } catch {
          continue // a torn line — the next chunk completes it
        }
        try {
          switch (msg.type) {
            case 'text':
              text += msg.delta ?? ''
              handlers.onText(msg.delta ?? '')
              break
            case 'tool':
              if (msg.name) {
                tools.push(msg.name)
                handlers.onTool(msg.name)
              }
              break
            case 'provider':
              // A fallback switch mid-session — the HUD should say so.
              noteBrain(msg.brain)
              break
            case 'panel':
              if (msg.panel) onPanel?.(msg.panel)
              break
            case 'blade':
              if (msg.blade) onBlade?.(msg.blade)
              break
            case 'ui':
              if (msg.op) onUi?.(msg.op, (msg.args ?? {}) as Record<string, unknown>)
              break
            case 'done':
              return { text: (text || (msg.text ?? '')).trim(), tools }
            case 'error':
              throw new Error(msg.message ?? 'The server reported an error.')
          }
        } catch (err) {
          if (err instanceof Error && msg.type === 'error') throw err
          // a handler bug must not kill the stream for the frames after it
          console.error('[sofia] frame handler failed:', err)
        }
      }
    }
    // Stream ended without a done frame — treat what arrived as the answer.
    return { text: text.trim(), tools }
  } catch (err) {
    if (controller.signal.aborted) {
      // A barge-in. Whatever was said so far is the answer's head; the
      // caller's stale() check stands the turn down quietly.
      return { text: text.trim(), tools }
    }
    onConnection?.('lost')
    throw err
  } finally {
    clearInterval(idle)
    pending = null
    pendingAbort = null
  }
}

/**
 * Cut SOFIA off mid-answer. Aborts the in-flight fetch — the server's stream
 * write fails on the next flush and the turn stops generating.
 */
export function cancel(): void {
  pendingAbort?.abort()
  pending = null
}

/** The older name for `cancel()`. */
export function interrupt(): void {
  cancel()
}

/** Labels for the HUD's SYSTEMS rail. */
export function connectedLabels(): string[] {
  return servers
}

/** The direct path is gone; history is always threaded through the API. */
export const usingBridge = false
