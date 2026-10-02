/**
 * ============================================================================
 * M5.2 — DETERMINISTIC RETRIEVAL TEMPORAL SEMANTICS (shared, pure)
 * ============================================================================
 * Pure, total, deterministic helpers shared by the canonical retrieval paths:
 *
 *   1. TEMPORAL INTENT DETECTION (CURRENT / HISTORY / WINDOW / UNSPECIFIED)
 *      from the query text alone — regex cue lists, fixed precedence
 *      WINDOW > CURRENT > HISTORY > UNSPECIFIED. No model call, no embeddings,
 *      no statistics: the same message always yields the same intent.
 *
 *      Rationale for the precedence order (pinned by tests):
 *        - WINDOW first: "what changed in the last 3 months" is a change
 *          enumeration even though it mentions no currentness word.
 *        - CURRENT before HISTORY: a message quoting both sides of a
 *          supersession ("I previously said $29 … what is the currently true
 *          price?") asks for the CURRENT answer — the history words are quoted
 *          context, not the question. A pure-history question carries no
 *          currentness cue, so the precedence is safe in both directions.
 *        - UNSPECIFIED: no cue at all — every ranking behaves exactly as it
 *          did before M5.2 (A0 semantics), so cue-less queries are unchanged.
 *
 *   2. WINDOW DURATION PARSING for change-detection queries
 *      ("last 3 months", "past two weeks", "recently" → default 3 months).
 *
 *   3. KNOWLEDGE CURRENTNESS MARKER — a deterministic retired/superseded
 *      text marker scan over a knowledge item's stored fields. The marker is
 *      ASYMMETRIC BY DESIGN: "superseded"/"retired"/"deprecated" (passive —
 *      this document IS superseded) marks a historical document; the ACTIVE
 *      verb "supersedes …" (this document REPLACES another) does NOT — the
 *      successor is the current one.
 *
 *   4. DATA-ANCHORED WINDOW COMPUTATION for change enumeration:
 *      windowTo = max(wall clock, newest recorded event timestamp) —
 *      production semantics are wall-clock ("last 3 months from now"), while
 *      a dataset whose newest recorded event postdates the system clock
 *      (simulated/frozen fixtures, clock skew) anchors the window to the data
 *      so recorded change events remain enumerable. Deterministic per input;
 *      no clock read ever enters benchmark RESULTS (the anchor only decides
 *      which stored events fall inside the window).
 *
 * M5.2 SCOPE GUARDS: this module never calls a store, never calls a model,
 * never mutates anything, and imports nothing from the app runtime. It is a
 * library of pure functions the canonical retrieval path consults — it is NOT
 * a new retrieval abstraction (queryKnowledge / queryMemories / queryFacts /
 * queryState remain the only store-level retrieval entry points).
 */

/** The deterministic temporal intent of a query (M5.2 Fix Class 2/5). */
export type RetrievalTemporalIntent = 'current' | 'history' | 'window' | 'unspecified';

export interface TemporalIntentResult {
  intent: RetrievalTemporalIntent;
  /** The cue substrings that fired (deterministic order — for audits/tests). */
  cues: string[];
}

/**
 * Change-detection / window cues. Matched case-insensitively against the
 * whole message. "What changed …" / "what's new" / "recent changes" /
 * "changes <preposition> <range>".
 */
const WINDOW_CUES: RegExp[] = [
  /\bwhat\s+(?:has\s+)?chang(?:ed|es)\b/i,
  /\bwhat(?:'s| is| are)\s+new\b/i,
  /\b(?:recent|latest)\s+chang(?:es|ed)\b/i,
  /\bchang(?:es|ed)\s+(?:in|during|over|between|since|within)\b/i,
  /\banything\s+chang(?:ed|ed)\b/i,
];

/**
 * Currentness cues: the question asks what is true NOW.
 * ("now" is a stop word for lexical scoring, but as an intent cue it is
 * load-bearing, so it is matched here explicitly.)
 */
const CURRENT_CUES: RegExp[] = [
  /\bcurrent(?:ly)?\b/i,
  /\bright\s+now\b/i,
  /\bthese\s+days\b/i,
  /\bas\s+of\s+now\b/i,
  /\bat\s+the\s+moment\b/i,
  /\bpresent(?:ly)?\b/i,
  /\btoday\b/i,
  /\bnow\b/i,
];

/**
 * History cues: the question asks about a PAST state or a transition.
 * NOTE: "last <N> <unit>" (with a quantity) is a WINDOW cue, not history —
 * the history cue below only matches the quantity-less forms
 * ("last year/month/week/quarter" as a point in the past).
 */
const HISTORY_CUES: RegExp[] = [
  /\bprevious(?:ly)?\b/i,
  /\bused\s+to\b/i,
  /\b(?:what|which)\s+was\b/i,
  /\bwhen\s+(?:did|were|was)\b/i,
  /\bhow\s+did\b/i,
  /\bwhy\s+did\b/i,
  /\bbefore\s+(?:we|the|this|that|it)\b/i,
  /\bprior\s+(?:to|version|state|policy|pricing)\b/i,
  /\bearlier\b/i,
  /\bformer(?:ly)?\b/i,
  /\bhistor(?:y|ical|ically)\b/i,
  /\bold\s+(?:version|policy|pricing|way|approach|doc|document|sop)\b/i,
  /\boriginal(?:ly)?\b/i,
  /\bsuperseded\b/i,
  /\blast\s+(?:year|month|week|quarter)\b/i,
];

function collectCues(message: string, cues: RegExp[]): string[] {
  const fired: string[] = [];
  for (const cue of cues) {
    const match = message.match(cue);
    if (match) fired.push(match[0]);
  }
  return fired;
}

/**
 * Deterministic temporal-intent detection. Pure; stable for identical input.
 * Precedence: WINDOW > CURRENT > HISTORY > UNSPECIFIED (see module header).
 */
export function detectTemporalIntent(message: string | null | undefined): TemporalIntentResult {
  const text = (message ?? '').trim();
  if (text.length === 0) return { intent: 'unspecified', cues: [] };

  const windowCues = collectCues(text, WINDOW_CUES);
  if (windowCues.length > 0) return { intent: 'window', cues: windowCues };

  const currentCues = collectCues(text, CURRENT_CUES);
  if (currentCues.length > 0) return { intent: 'current', cues: currentCues };

  const historyCues = collectCues(text, HISTORY_CUES);
  if (historyCues.length > 0) return { intent: 'history', cues: historyCues };

  return { intent: 'unspecified', cues: [] };
}

export interface WindowDuration {
  /** Window length in months (fractional for days/weeks). */
  months: number;
  /** The matched cue (for audits/tests). */
  cue: string;
}

/**
 * Deterministic window-duration parsing for change-detection queries.
 * "in/during/over the last N <unit>", "past N <unit>", "in the last few
 * <unit>", and the bare "recently/since when" default of 3 months.
 * Returns null when the message carries no duration phrase (the caller
 * applies its own documented default).
 */
export function parseWindowDuration(message: string | null | undefined): WindowDuration | null {
  const text = (message ?? '').toLowerCase();
  if (text.length === 0) return null;

  const UNIT_MONTHS: Record<string, number> = {
    day: 1 / 30,
    days: 1 / 30,
    week: 7 / 30,
    weeks: 7 / 30,
    month: 1,
    months: 1,
    quarter: 3,
    quarters: 3,
    year: 12,
    years: 12,
  };

  const numeric = text.match(
    /\b(?:last|past|previous|trailing)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|days|week|weeks|month|months|quarter|quarters|year|years)\b/
  );
  if (numeric) {
    const wordNums: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    };
    const n = /^\d+$/.test(numeric[1]) ? parseInt(numeric[1], 10) : wordNums[numeric[1]];
    const unit = UNIT_MONTHS[numeric[2]];
    if (Number.isFinite(n) && Number.isFinite(unit)) {
      return { months: n * unit, cue: numeric[0] };
    }
  }

  const few = text.match(/\b(?:last|past)\s+few\s+(day|days|week|weeks|month|months|year|years)\b/);
  if (few) {
    const unit = UNIT_MONTHS[few[1]];
    if (Number.isFinite(unit)) return { months: 3 * unit, cue: few[0] };
  }

  return null;
}

/** The documented default window for change queries without a duration phrase. */
export const DEFAULT_CHANGE_WINDOW_MONTHS = 3;

/**
 * Deterministic retired/superseded knowledge marker. ASYMMETRIC (see module
 * header): passive markers ("retired", "superseded", "deprecated",
 * "obsoleted", "no longer …", "replaced by") mark a HISTORICAL document; the
 * active verb "supersedes" does NOT (the successor stays current).
 */
const RETIRED_KNOWLEDGE_MARKER =
  /\b(?:retired|superseded|deprecated|obsoleted|no\s+longer\s+(?:in\s+)?(?:effect|current|active|valid)|replaced\s+by)\b/i;

/** True when a knowledge item's own text marks it as retired/superseded. */
export function isRetiredKnowledgeText(...parts: Array<string | null | undefined>): boolean {
  const text = parts.filter(Boolean).join(' ');
  if (text.length === 0) return false;
  return RETIRED_KNOWLEDGE_MARKER.test(text);
}

/**
 * Data-anchored change-window computation (M5.2 Fix Class 5).
 * windowTo = max(wallClockMs, latestEventMs); windowFrom = windowTo − months.
 * See the module header for why the max() anchor is the production-correct
 * rule that ALSO keeps simulated/frozen datasets enumerable.
 */
export function computeChangeWindow(
  wallClockMs: number,
  latestEventMs: number,
  months: number
): { windowFromMs: number; windowToMs: number } {
  const windowToMs = Math.max(
    wallClockMs,
    Number.isFinite(latestEventMs) ? latestEventMs : wallClockMs
  );
  const windowFromMs = windowToMs - months * 30 * 24 * 60 * 60 * 1000;
  return { windowFromMs, windowToMs };
}

/** Inclusive in-window test (epoch ms). */
export function isInRange(timestampMs: number, fromMs: number, toMs: number): boolean {
  return timestampMs >= fromMs && timestampMs <= toMs;
}

/** Safe epoch parse of stored ISO timestamps (0 when unparseable — excluded). */
export function toEpochMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}
