/**
 * The brain — thin and single-path in the Next.js build.
 *
 * The Vite app had two brains (a local bridge over WebSocket, or the browser
 * calling an API directly). The Next.js app has one: its own server, through
 * /api/sofia/ask, streaming over SSE. This module keeps the old exported
 * surface so App.tsx reads exactly as it did.
 */

import * as api from './api'
import type { Blade, Panel } from '../store'

export type { AskHandlers, Msg } from './api'
export type { ConnectionState } from './api'

/** The conversation lives in App.tsx's history now — the server is stateless
 *  per request — so this is false and the history threading branch in App
 *  runs on every turn. */
export const usingBridge = api.usingBridge

/** Ask the brain. The persona rides every ask so the server swaps its system
 *  prompt when the character changes mid-session. */
export async function ask(
  prompt: string,
  history: api.Msg[],
  handlers: api.AskHandlers,
  persona?: string,
): Promise<{ text: string; tools: string[] }> {
  return api.ask(prompt, history, handlers, persona)
}

/** Ping the server once so the first turn already knows the engines. */
export async function warm(): Promise<void> {
  await api.warmServer()
}

/** Server labels, announced at warm-up. */
export function watchServers(fn: (servers: string[]) => void): void {
  api.watchServers(fn)
}

/** Which link of the LLM chain is answering (z-ai → Gemini → local). */
export function watchBrain(fn: (b: api.BrainStatus) => void): void {
  api.watchBrain(fn)
}

/** HUD panels are pushed mid-turn by the `display` tool. */
export function watchPanels(fn: (panel: Panel) => void): void {
  api.watchPanels(fn)
}

/** Blades — the big surface — arrive the same way, from the `blade` tool. */
export function watchBlades(fn: (blade: Blade) => void): void {
  api.watchBlades(fn)
}

/** Interface redressing — theme, reactor, orbits, effects. */
export function watchUi(fn: (op: string, args: any) => void): void {
  api.watchUi(fn)
}

/** Barge-in. Aborts the stream; the caller's await returns with the text so
 *  far, so the transcript keeps the half-sentence the user actually heard. */
export function cancel(): void {
  api.cancel()
}

/** The older name for `cancel()`. */
export function interrupt(): void {
  cancel()
}

/** Always true between turns — each ask is its own request. */
export function isConnected(): boolean {
  return api.isConnected()
}

/** A stream dying mid-answer is worth showing, same as the socket loss was. */
export function watchConnection(fn: (state: api.ConnectionState) => void): void {
  api.watchConnection(fn)
}

/** Labels for the HUD's SYSTEMS rail. */
export function connectedLabels(): string[] {
  return api.connectedLabels()
}
