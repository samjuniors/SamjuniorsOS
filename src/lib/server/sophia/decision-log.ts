import { randomUUID } from 'crypto';
import { SophiaRoute, MemoryScope } from './types';

/**
 * ============================================================================
 * MINIMAL DECISION LOG (M1.6 / G12.6)
 * ============================================================================
 * Records the inputs, route, scopes read, confidence, outcome, and reasoning
 * for every turn processed by Sophia.
 *
 * Invariant:
 * - Stored within existing message metadata in ConversationStore.
 * - No new store, table, or collection is created.
 * - Every turn records an entry; 'why did you do that' cites log entries.
 */

export type DecisionOutcome =
  | 'answered'
  | 'clarification_requested'
  | 'refused'
  | 'error'
  | 'cancelled';

export interface SophiaDecisionLogEntry {
  id: string;
  turnId?: string;
  messageId?: string;
  conversationId: string;
  timestamp: string;
  query: string;
  route: SophiaRoute;
  scopes: MemoryScope[];
  confidence: number;
  outcome: DecisionOutcome;
  sources?: string[];
  reasoning: string;
}

export interface BuildDecisionLogOptions {
  id?: string;
  turnId?: string;
  messageId?: string;
  conversationId: string;
  timestamp?: string;
  query: string;
  route: SophiaRoute;
  scopes?: MemoryScope[];
  confidence: number;
  outcome: DecisionOutcome;
  sources?: string[];
  reasoning: string;
}

/**
 * Builds a validated, canonical SophiaDecisionLogEntry.
 */
export function buildDecisionLogEntry(opts: BuildDecisionLogOptions): SophiaDecisionLogEntry {
  const cleanId = opts.id || `dlog-${opts.turnId || opts.messageId || randomUUID().slice(0, 12)}`;
  return {
    id: cleanId,
    turnId: opts.turnId,
    messageId: opts.messageId,
    conversationId: opts.conversationId,
    timestamp: opts.timestamp || new Date().toISOString(),
    query: opts.query.trim(),
    route: opts.route,
    scopes: opts.scopes || [],
    confidence: Math.max(0, Math.min(1, typeof opts.confidence === 'number' ? opts.confidence : 1)),
    outcome: opts.outcome,
    sources: opts.sources || [],
    reasoning: opts.reasoning.trim(),
  };
}

const EXPLANATION_QUERY_PATTERN = /^(why(\s+(did|do|would|have)\s+you\s+(do|choose|say|answer|pick|refuse|ask)\s+that|\s+did\s+you\s+do\s+this|\?|$)|explain\s+your\s+(decision|answer|choice|reasoning|action)|what\s+was\s+your\s+(reasoning|rationale|reason))/i;

/**
 * Checks whether an incoming utterance asks to explain Sophia's previous decision/turn.
 */
export function isExplanationQuery(message: string): boolean {
  if (!message || typeof message !== 'string') return false;
  const clean = message.trim();
  return EXPLANATION_QUERY_PATTERN.test(clean);
}

/**
 * Formats a server-authoritative reply citing a real decision log entry.
 */
export function formatDecisionLogExplanation(entry: SophiaDecisionLogEntry): string {
  const persona = 'Sophia Vance • COO';
  const confidencePercent = (entry.confidence * 100).toFixed(0);
  const scopesStr = entry.scopes.length > 0 ? entry.scopes.join(', ') : 'none';
  const sourcesStr = entry.sources && entry.sources.length > 0 ? entry.sources.join(', ') : 'none';

  return `[${persona}]\nDecision Log Entry [${entry.id}] (${entry.timestamp}):\n` +
    `• Query: "${entry.query}"\n` +
    `• Route: ${entry.route}\n` +
    `• Confidence: ${confidencePercent}%\n` +
    `• Scopes Read: [${scopesStr}]\n` +
    `• Sources: [${sourcesStr}]\n` +
    `• Outcome: ${entry.outcome}\n` +
    `• Reason: ${entry.reasoning}`;
}

/**
 * Formats an honest abstention reply when no previous decision log exists in session.
 */
export function formatNoDecisionLogExplanation(): string {
  const persona = 'Sophia Vance • COO';
  return `[${persona}]\nNo previous decision log entries exist in this session to explain.`;
}
