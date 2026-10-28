import { randomUUID } from 'crypto';
import { SophiaRoute, MemoryScope } from './types';
import {
  DecisionPolicyResult,
  DecisionPolicyEvaluation,
  DecisionLogOutcomeKind,
} from '../../../types/decision';

export type { DecisionPolicyResult, DecisionPolicyEvaluation };

/**
 * ============================================================================
 * DECISION LOG AND EXPLANATION (M1.6 / G12.6)
 * ============================================================================
 * Records the inputs, route, scopes read, confidence, policy result, outcome,
 * and reasoning for every decision and turn processed by Sophia or AI specialists.
 *
 * INVARIANTS:
 * - "No log entry means no action" fail-closed rule.
 * - Every decision records an entry; 'why did you do that' cites log entries.
 * - Authoritative persistence in SQLite/PostgreSQL `decision_logs` table via Prisma.
 */

export type DecisionOutcome = DecisionLogOutcomeKind;

export interface SophiaDecisionLogEntry {
  id: string;
  turnId?: string;
  messageId?: string;
  conversationId: string;
  actor: string;
  timestamp: string;
  query: string;
  route: SophiaRoute;
  scopes: MemoryScope[];
  confidence: number;
  divertedFromRoute?: SophiaRoute;
  isLowConfidenceClarification?: boolean;
  policyResult?: DecisionPolicyResult;
  outcome: DecisionOutcome;
  sources?: string[];
  reasoning: string;
  executionRef?: string;
  replayPayload?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface BuildDecisionLogOptions {
  id?: string;
  turnId?: string;
  messageId?: string;
  conversationId: string;
  actor?: string;
  timestamp?: string;
  query: string;
  route: SophiaRoute;
  scopes?: MemoryScope[];
  confidence: number;
  divertedFromRoute?: SophiaRoute;
  isLowConfidenceClarification?: boolean;
  policyResult?: DecisionPolicyResult;
  outcome: DecisionOutcome;
  sources?: string[];
  reasoning: string;
  executionRef?: string;
  replayPayload?: Record<string, any>;
}

/**
 * Builds a validated, canonical SophiaDecisionLogEntry.
 */
export function buildDecisionLogEntry(opts: BuildDecisionLogOptions): SophiaDecisionLogEntry {
  const cleanId = opts.id || `dlog-${opts.turnId || opts.messageId || randomUUID().slice(0, 12)}`;
  const now = opts.timestamp || new Date().toISOString();
  return {
    id: cleanId,
    turnId: opts.turnId,
    messageId: opts.messageId,
    conversationId: opts.conversationId,
    actor: opts.actor || 'sophia',
    timestamp: now,
    query: opts.query.trim(),
    route: opts.route,
    scopes: opts.scopes || [],
    confidence: Math.max(0, Math.min(1, typeof opts.confidence === 'number' ? opts.confidence : 1)),
    divertedFromRoute: opts.divertedFromRoute,
    isLowConfidenceClarification: Boolean(opts.isLowConfidenceClarification),
    policyResult: opts.policyResult || {},
    outcome: opts.outcome,
    sources: opts.sources || [],
    reasoning: opts.reasoning.trim(),
    executionRef: opts.executionRef,
    replayPayload: opts.replayPayload,
    createdAt: now,
    updatedAt: now,
  };
}

const EXPLANATION_QUERY_PATTERN = /^(why(\s+(did|do|would|have)\s+you\s+(do|choose|say|answer|pick|refuse|ask)\s+that|\s+did\s+you\s+do\s+this|\?|$)|explain\s+your\s+(decision|answer|choice|reasoning|action)|what\s+was\s+your\s+(reasoning|rationale|reason)|why\s+did\s+you\s+(do|make|run)\s+(dlog-[a-z0-9_-]+))/i;
const LOG_ID_CITED_PATTERN = /\b(dlog-[a-zA-Z0-9_-]+)\b/i;

/**
 * Checks whether an incoming utterance asks to explain Sophia's previous decision/turn.
 */
export function isExplanationQuery(message: string): boolean {
  if (!message || typeof message !== 'string') return false;
  const clean = message.trim();
  return EXPLANATION_QUERY_PATTERN.test(clean) || (clean.toLowerCase().startsWith('why') && LOG_ID_CITED_PATTERN.test(clean));
}

/**
 * Extracts an explicitly cited decision log ID (e.g. "dlog-12345") from an explanation query if present.
 */
export function extractExplanationQueryLogId(message: string): string | null {
  if (!message || typeof message !== 'string') return null;
  const match = message.match(LOG_ID_CITED_PATTERN);
  return match ? match[1] : null;
}

/**
 * Formats a server-authoritative reply citing a real decision log entry.
 */
export function formatDecisionLogExplanation(entry: SophiaDecisionLogEntry): string {
  const persona = 'Sophia Vance • COO';
  const confidencePercent = (entry.confidence * 100).toFixed(0);
  const scopesStr = entry.scopes.length > 0 ? entry.scopes.join(', ') : 'none';
  const sourcesStr = entry.sources && entry.sources.length > 0 ? entry.sources.join(', ') : 'none';
  const routeStr = entry.divertedFromRoute
    ? `${entry.route} (diverted from: ${entry.divertedFromRoute} due to low confidence)`
    : entry.route;
  const policyStr = entry.policyResult?.decision
    ? `\n• Policy Result: ${entry.policyResult.decision}${entry.policyResult.actionClass ? ` (${entry.policyResult.actionClass})` : ''}`
    : '';

  return `[${persona}]\nDecision Log Entry [${entry.id}] (${entry.timestamp}):\n` +
    `• Query: "${entry.query}"\n` +
    `• Route: ${routeStr}\n` +
    `• Confidence: ${confidencePercent}%\n` +
    `• Scopes Read: [${scopesStr}]\n` +
    `• Sources: [${sourcesStr}]${policyStr}\n` +
    `• Outcome: ${entry.outcome}\n` +
    `• Reason: ${entry.reasoning}`;
}

/**
 * Formats an honest abstention reply when no previous decision log exists in session.
 */
export function formatNoDecisionLogExplanation(citedId?: string): string {
  const persona = 'Sophia Vance • COO';
  if (citedId) {
    return `[${persona}]\nNo decision log entry found with ID [${citedId}].`;
  }
  return `[${persona}]\nNo previous decision log entries exist in this session to explain.`;
}
