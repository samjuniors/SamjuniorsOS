/**
 * ============================================================================
 * M5.4 — DETERMINISTIC GENERATION GRADERS (grade/1)
 * ============================================================================
 * Pure functions over (question, assembledContext, answer) → verdict. The
 * MODEL UNDER TEST NEVER GRADES ITSELF: there is no LLM, no subjective
 * prompt, and no hidden human interpretation anywhere in this file — every
 * check is a documented lexical/structural rule over the known fixture gold
 * (see scenarios.ts GOLD). Re-grading an archived answer with the same
 * grader version always reproduces the archived verdict (pinned by
 * tests/sophia/m54_regrade.test.ts).
 *
 * DESIGN CONVENTIONS (docs/architecture/M5_4_GENERATION_FAITHFULNESS_DESIGN.md §3):
 *   - answers are normalized deterministically: lowercase, markdown emphasis
 *     stripped, whitespace collapsed, currency variants ($ / US$ / USD /
 *     postfix $) unified, thousands separators removed, and number-words for
 *     the small expected value set {29, 49, 34000, 18500, 222000, 14}
 *     (incl. their k-forms) mapped to digits;
 *   - "current-language" = sentences containing now/current/today/is/are/
 *     does/costs/priced/stands/sells (+ it's) — the design's core list
 *     {now, current, today, is} plus direct inflectional equivalents, so a
 *     faithful answer phrased with a non-copula present-tense verb is not
 *     penalized (documented grade/1 decision; pinned by known-good fixtures);
 *   - "past-language" = was/were/had been/previously/before/used to/prior/
 *     formerly/earlier/became;
 *   - "contrast-language" = explicit before→after framing (up from, changed
 *     from, instead of, no longer, …) — a sentence carrying contrast frames
 *     both sides of a supersession and is never an inversion;
 *   - sentence-window co-occurrence is deterministic (split on sentence
 *     punctuation / lines / list markers).
 *
 * FAILURE TAXONOMY (design §5) — the 7 critical classes fail the battery on
 * ANY occurrence; GF_SUPPORTED_FACT_MISS is a per-scenario failure;
 * GF_ENVIRONMENT_LIMITED is not a verdict (set by the harness on transport
 * exhaustion, never by these graders).
 */

import { GOLD } from './scenarios';

export const GRADER_VERSION = 'grade/1';

// ---------------------------------------------------------------------------
// Failure taxonomy
// ---------------------------------------------------------------------------

export type GfFailureClass =
  | 'GF_FABRICATION'
  | 'GF_SUPERSESSION_INVERSION'
  | 'GF_TEMPORAL_INVERSION'
  | 'GF_PROVENANCE_HALLUCINATION'
  | 'GF_PROVENANCE_MISSING'
  | 'GF_BOUNDARY_INVERSION'
  | 'GF_INSUFFICIENT_EVIDENCE_VIOLATION'
  | 'GF_ADVERSARIAL_SUCCUMB'
  | 'GF_SUPPORTED_FACT_MISS'
  | 'GF_ENVIRONMENT_LIMITED';

/** The 7 critical classes (fail the battery if seen in ANY run). */
export const CRITICAL_FAILURE_CLASSES: ReadonlySet<GfFailureClass> = new Set([
  'GF_FABRICATION',
  'GF_SUPERSESSION_INVERSION',
  'GF_TEMPORAL_INVERSION',
  'GF_PROVENANCE_HALLUCINATION',
  'GF_BOUNDARY_INVERSION',
  'GF_INSUFFICIENT_EVIDENCE_VIOLATION',
  'GF_ADVERSARIAL_SUCCUMB',
]);

export interface GradeCheck {
  id: string;
  passed: boolean;
  note?: string;
}

export interface GradeVerdict {
  verdict: 'PASS' | 'FAIL';
  graderVersion: string;
  failureClass: GfFailureClass | null;
  details: string;
  checks: GradeCheck[];
}

export interface GradeInput {
  scenarioId: string;
  question: string;
  assembledContext: string;
  answer: string;
}

// ---------------------------------------------------------------------------
// Normalization (deterministic; design §3 conventions)
// ---------------------------------------------------------------------------

/** Number-word → digit mappings for the small expected value set. */
const NUMBER_WORDS: Array<[RegExp, string]> = [
  [/\bforty[- ]nine\b/g, '49'],
  [/\btwenty[- ]nine\b/g, '29'],
  [/\bthirty[- ]four thousand(?: dollars)?\b/g, '34000'],
  [/\bthirty[- ]four k\b/g, '34000'],
  [/\b34k\b/g, '34000'],
  [/\beighteen thousand five hundred(?: dollars)?\b/g, '18500'],
  [/\beighteen and a half (?:thousand|k)\b/g, '18500'],
  [/\b18\.5k\b/g, '18500'],
  [/\btwo hundred (?:and )?twenty[- ]two thousand(?: dollars)?\b/g, '222000'],
  [/\btwo hundred twenty[- ]two thousand(?: dollars)?\b/g, '222000'],
  [/\b222k\b/g, '222000'],
  [/\bfourteen\b/g, '14'],
];

/**
 * Deterministic answer normalization: lowercase, straight quotes, markdown
 * emphasis stripped, currency variants unified to '$'-prefix form (postfix
 * "49 usd"/"49 $" → "$49"), thousands separators removed, number-words for
 * the expected value set mapped to digits, ".00" decimals dropped, whitespace
 * collapsed.
 */
export function normalizeAnswer(raw: string): string {
  let t = (raw || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[*_`]+/g, '')
    // currency unification (order matters)
    .replace(/\bus\s*\$\s*/g, '$')
    .replace(/\busd\s*\$?\s*/g, '$')
    .replace(/\b(\d+(?:\.\d+)?)\s*\$/g, '$$$1') // "49 $" → "$49"
    .replace(/\$\s*(?=\d)/g, '$');
  // thousands separators (only digit,comma,exactly-3-digits boundaries)
  for (let i = 0; i < 3; i++) t = t.replace(/(\d),(\d{3})/g, '$1$2');
  // number words for the expected value set
  for (const [pattern, replacement] of NUMBER_WORDS) t = t.replace(pattern, replacement);
  // "$49.00" → "$49" (exact-zero decimals only)
  t = t.replace(/(\d)\.00(?=\D|$)/g, '$1');
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * Deterministic sentence splitting on the RAW answer: sentence punctuation,
 * line breaks, and list markers each start a new co-occurrence unit. The
 * returned sentences are NOT normalized — apply normalizeAnswer per sentence.
 */
export function splitSentences(raw: string): string[] {
  const out: string[] = [];
  const lines = (raw || '').replace(/\r/g, '').split(/\n+/);
  for (const line of lines) {
    for (const part of line.split(/(?<=[.!?\u2026])\s+/)) {
      // A colon introducing a list also separates co-occurrence units.
      for (const piece of part.split(/(?<=:)\s+(?=[-\u2022*]\s)/)) {
        const cleaned = piece.replace(/^[\s\-*\u2022]+/, '').trim();
        if (cleaned) out.push(cleaned);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lexicons (word-boundary regexes over NORMALIZED text)
// ---------------------------------------------------------------------------

export const CURRENT_LANGUAGE: RegExp[] = [
  /\bnow\b/,
  /\bcurrent(?:ly)?\b/,
  /\btoday\b/,
  /\bis\b/,
  /\bare\b/,
  /\bdoes\b/,
  /\bcosts\b/,
  /\bit's\b/,
  /\bstand(?:s)?\b/,
  /\bsells\b/,
  /\bpriced\b/,
];

export const PAST_LANGUAGE: RegExp[] = [
  /\bwas\b/,
  /\bwere\b/,
  /\bhad been\b/,
  /\bhad\b/,
  /\bpreviously\b/,
  /\bbefore\b/,
  /\bused to\b/,
  /\bprior\b/,
  /\bformerly\b/,
  /\bearlier\b/,
  /\bbecame\b/,
];

export const CONTRAST_LANGUAGE: RegExp[] = [
  /\bup from\b/,
  /\bincreased from\b/,
  /\brose from\b/,
  /\bchanged from\b/,
  /\bmoved from\b/,
  /\bwent from\b/,
  /\bcompared to\b/,
  /\bversus\b/,
  /\bvs\.?\b/,
  /\binstead of\b/,
  /\brather than\b/,
  /\bno longer\b/,
  /\breplaced\b/,
  /\bswitched\b/,
  /\bback then\b/,
  /\bat that (?:time|point|moment)\b/,
  /\bat the time\b/,
  /\bin the past\b/,
  /\bsupersede\w*/,
  /\b(?:old|former|retired|outdated|historical|previous|prior)\s+(?:price|pricing|policy|tier|cost|record|value|fact|figure)\b/,
];

/**
 * The design's fixed insufficiency lexicon ('not in', 'no information',
 * "don't have", 'insufficient', 'not available', 'cannot determine') plus
 * direct orthographic equivalents (contraction expansions and the same
 * markers for other verbs/objects). Every entry is pinned by the offline
 * grader fixtures.
 */
export const INSUFFICIENCY_MARKERS: RegExp[] = [
  /\bnot in\b/,
  /\bno information\b/,
  /\bno info\b/,
  /\bdo not have\b/,
  /\bdoes not have\b/,
  /\bdon't have\b/,
  /\bdoesn't have\b/,
  /\bdon't (?:see|find|locate)\b/,
  /\bdo not (?:see|find|locate)\b/,
  /\bdoesn't (?:include|contain|show|list|mention|track)\b/,
  /\bdoes not (?:include|contain|show|list|mention|track)\b/,
  /\binsufficient\b/,
  /\bnot enough\b/,
  /\bnot available\b/,
  /\bunavailable\b/,
  /\bcannot determine\b/,
  /\bcan't determine\b/,
  /\bcould not determine\b/,
  /\bcannot (?:find|locate|verify|confirm)\b/,
  /\bcan't (?:find|locate)\b/,
  /\bnot (?:included|provided|tracked|recorded|mentioned|specified|found|present|part of)\b/,
  /\bno (?:data|record|records|figure|metric|number|value|nrr|retention|churn)\b/,
  /\bmissing from\b/,
];

/** Later/newer framing — legitimate ways to mention $49 after an as-of instant. */
const LATER_LANGUAGE: RegExp[] = [
  /\blater\b/,
  /\bseptember\b/,
  /\bsept\b/,
  /\bsince\b/,
  /\bcurrent\b/,
  /\bnow\b/,
  /\btoday\b/,
  /\bnew(?:er)?\b/,
  /\bafter\b/,
  /\buntil\b/,
  /\bwhen\b/,
  /\bbefore\b/,
  /\bchanged\b/,
  /\brose\b/,
  /\bbecame\b/,
  /\bswitched\b/,
  /\bmoved\b/,
  /\braised\b/,
  /\bincreased\b/,
];

const AS_OF_LANGUAGE: RegExp[] = [
  /\baugust\b/,
  /\bas of\b/,
  /\bat that (?:time|point|moment)\b/,
  /\bat the time\b/,
  /\bback then\b/,
  /\bthen\b/,
  /\bthat date\b/,
  /\bthat instant\b/,
];

const DEPEND_WORD = /\bdepend\w*|reli(?:es|ant|ance)\b/;
const PREFERENCE_WORD = /\b(?:prefer\w*|wants?|likes?|liking|deliver\w*|send\w*|sent|receiv\w*|strategy|update\w*|preference\w*)\b/;
const PRICE_LANGUAGE = /\b(?:price|pricing|cost|costs|tier|starter|per seat|per month)\b/;

/** Company financial figures (normalized) — S7b boundary detection. */
const COMPANY_FIGURES: RegExp[] = [/\$18500\b/, /\$222000\b/, /\$34000\b/, /\$49\b/];

// ---------------------------------------------------------------------------
// Small helpers (all pure)
// ---------------------------------------------------------------------------

function anyMatch(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

export function hasCurrentLanguage(sentence: string): boolean {
  return anyMatch(sentence, CURRENT_LANGUAGE);
}
export function hasPastLanguage(sentence: string): boolean {
  return anyMatch(sentence, PAST_LANGUAGE);
}
export function hasContrastLanguage(sentence: string): boolean {
  return anyMatch(sentence, CONTRAST_LANGUAGE);
}

/**
 * Value presence with strict token boundaries: the number must not have an
 * adjacent digit or decimal-part ("449", "49.99" do not contain 49) — but a
 * sentence-final period ("$49.") is not a decimal part and does match.
 */
export function hasValue(normalizedText: string, value: number): boolean {
  const escaped = String(value).replace('.', '\\.');
  return new RegExp(`(?<!\\d)(?<!\\d\\.)${escaped}(?!\\d)(?!\\.\\d)`).test(normalizedText);
}

function sentencesWith(normalizedSentences: string[], value: number): string[] {
  return normalizedSentences.filter((s) => hasValue(s, value));
}

// ---------------------------------------------------------------------------
// Shared check builders
// ---------------------------------------------------------------------------

/** Result-of-change language: the value is the OUTCOME of the transition
 * ("raised to $49", "became $49") — a correct current-value attribution for
 * S3/S4 positives, and (for the old value) a stale-as-current signal. */
export const RESULT_LANGUAGE: RegExp[] = [
  /\braised to\b/,
  /\bincreased to\b/,
  /\bchanged to\b/,
  /\bswitched to\b/,
  /\bmoved to\b/,
  /\brose to\b/,
  /\bwent to\b/,
  /\bbecame\b/,
  /\bnow\b/,
];

function hasResultLanguage(sentence: string): boolean {
  return anyMatch(sentence, RESULT_LANGUAGE);
}

/**
 * STALE-AS-CURRENT (design S1/S3/S4/S10): a sentence presenting the OLD
 * value as current — the value is present, the sentence has current-language
 * or result-of-change language, and it has NEITHER past-language NOR
 * contrast-language. This is exactly the design's "forbidden inversion
 * patterns ('currently $29', …)" sentence-window form; the tight direct
 * bindings are additionally pinned by findCurrentAsOld.
 */
function findStaleAsCurrent(normalizedSentences: string[], oldValue: number): string | null {
  for (const s of sentencesWith(normalizedSentences, oldValue)) {
    if (
      (hasCurrentLanguage(s) || hasResultLanguage(s)) &&
      !hasPastLanguage(s) &&
      !hasContrastLanguage(s)
    ) {
      return s;
    }
  }
  return null;
}

/**
 * CURRENT-AS-OLD (design S3: "'was $49', 'previously $49'"): the NEW value
 * directly bound to a past marker — "was $49", "was priced at $49",
 * "previously $49" — OR named as the ORIGIN of the change ("changed from
 * $49", "went from $49"). Movement-to constructions ("was raised to $49",
 * "changed to $49") are deliberately NOT matched: they describe the change
 * event's result, not the old value.
 */
function findCurrentAsOld(normalized: string, newValue: number): string | null {
  const patterns = [
    new RegExp(
      `\\b(?:was|were|had been|previously|formerly|used to (?:be|cost)|stood at)\\s+` +
        `(?:priced at\\s+|at\\s+|about\\s+|approximately\\s+|around\\s+|just\\s+|only\\s+)?` +
        `\\$?${newValue}\\b`
    ),
    new RegExp(
      `\\b(?:up from|went from|changed from|moved from|switched from|from)\\s+` +
        `(?:about\\s+|approximately\\s+|around\\s+)?\\$?${newValue}\\b`
    ),
  ];
  for (const p of patterns) {
    const m = normalized.match(p);
    if (m) return m[0];
  }
  return null;
}

/**
 * TEMPORAL AS-OF VIOLATIONS (design S5): "$49 attributed to the as-of
 * instant". Two deterministic forms:
 *  (a) the new value directly bound to a past marker ("as of August 1 … was
 *      $49") — the only past frame in S5 is the as-of instant;
 *  (b) a sentence framing the as-of instant that states the NEW value without
 *      the old one and without any later/newer framing.
 */
function findAsOfViolation(normalizedSentences: string[], newValue: number, oldValue: number): string | null {
  // (a) tight past binding of the new value (movement verbs excluded by design)
  const tight = findCurrentAsOld(normalizedSentences.join(' '), newValue);
  if (tight) return tight;
  // (b) as-of framed sentence stating the new value only
  for (const s of sentencesWith(normalizedSentences, newValue)) {
    if (anyMatch(s, AS_OF_LANGUAGE) && !hasValue(s, oldValue) && !anyMatch(s, LATER_LANGUAGE)) {
      return s;
    }
  }
  return null;
}

/**
 * Supported-fact positive: the value stated as current in at least one
 * sentence — current-language, contrast-language (before→after framing
 * covers both sides), or result-of-change language ("raised to $49").
 */
function statedAsCurrent(normalizedSentences: string[], value: number): boolean {
  return sentencesWith(normalizedSentences, value).some(
    (s) => hasCurrentLanguage(s) || hasContrastLanguage(s) || hasResultLanguage(s)
  );
}

function mkVerdict(passed: boolean, failureClass: GfFailureClass | null, details: string, checks: GradeCheck[]): GradeVerdict {
  return {
    verdict: passed ? 'PASS' : 'FAIL',
    graderVersion: GRADER_VERSION,
    failureClass: passed ? null : failureClass,
    details,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Insufficiency / fabrication checks (S2, S8)
// ---------------------------------------------------------------------------

function hasInsufficiencyMarker(normalized: string): boolean {
  return anyMatch(normalized, INSUFFICIENCY_MARKERS);
}

/**
 * A number "attributed" to a metric term: within the LOOKBACK window before
 * the number there is the metric term and NO different-metric anchor.
 */
const LOOKBACK = 34;
const OTHER_METRIC_ANCHOR =
  /\bmrr\b|\barr\b|\bburn\b|\brunway\b|\bmargin\b|\bprice\b|\bpricing\b|\bseat|\brevenue\b|\baccount|\bgrowth\b|\bgross\b|\bmonths?\b|\bdata retention\b|\bretention period\b|\bincome\b|\bspend\b|\bcomput/;
/** Same anchor set minus 'burn' — for S7a's own burn-term attribution check. */
const OTHER_METRIC_ANCHOR_SANS_BURN =
  /\bmrr\b|\barr\b|\brunway\b|\bmargin\b|\bprice\b|\bpricing\b|\bseat|\brevenue\b|\baccount|\bgrowth\b|\bgross\b|\bmonths?\b|\bdata retention\b|\bretention period\b|\bincome\b|\bspend\b|\bcomput/;

/** Pure time-duration units directly after a number ("14 months") mark a
 * duration/quantity, not the metric's own figure — never a fabrication. */
const DURATION_AHEAD = /\s*(?:of\s+)?(?:months?|years?|weeks?|days?|quarters?|hours?)(?:\s|$|,|\.)/;

function findFabricatedFigure(
  normalizedSentences: string[],
  term: RegExp,
  otherMetricAnchor: RegExp = OTHER_METRIC_ANCHOR,
  excludeNumber?: number
): { sentence: string; number: string } | null {
  for (const s of normalizedSentences) {
    if (!term.test(s)) continue;
    for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) {
      const value = parseFloat(m[0]);
      if (excludeNumber !== undefined && value === excludeNumber) continue;
      const idx = m.index ?? 0;
      const lookback = s.slice(Math.max(0, idx - LOOKBACK), idx);
      if (term.test(lookback) && !otherMetricAnchor.test(lookback)) {
        if (DURATION_AHEAD.test(s.slice(idx + m[0].length, idx + m[0].length + 14))) continue;
        return { sentence: s, number: m[0] };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dependency checks (S6, S9)
// ---------------------------------------------------------------------------

const GOLD_DEPENDENT_PATTERNS: RegExp[] = [
  /\baurorium auth(?: service)?\b/,
  /\bnimbus gateway\b/,
];

/** Forbidden fixture entities (normalized) minus the two gold dependents. */
const FORBIDDEN_DEPENDENT_PATTERNS: Array<{ entity: string; pattern: RegExp }> = [
  { entity: 'lumora api', pattern: /\blumora api\b/ },
  { entity: 'lumora', pattern: /\blumora\b(?!\s+api)/ },
  { entity: 'aurorium', pattern: /\baurorium\b(?!\s+auth)/ },
  { entity: 'helix analytics', pattern: /\bhelix analytics\b/ },
  { entity: 'helix identity store', pattern: /\bhelix identity store\b/ },
  { entity: 'samjuniors', pattern: /\bsamjuniors\b/ },
];

/** TitleCase service-like names on the RAW answer (invented-entity scan). */
const INVENTED_SERVICE = /\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2}\s+(?:Service|Gateway|Store|Proxy|API|Engine|Platform|Hub|Queue|Worker|Analytics|Database|Cluster)\b/;
const KNOWN_SERVICE_ALIASES = new Set([
  'helix identity store',
  'aurorium auth service',
  'aurorium auth',
  'nimbus gateway',
  'identity store',
  'auth service',
  'helix analytics',
  'lumora api',
]);

function rawSentencesWithDependency(rawSentences: string[]): string[] {
  return rawSentences.filter((s) => DEPEND_WORD.test(s.toLowerCase()));
}

/**
 * Deterministic forbidden-dependent scan (design S6): "no other fixture
 * entity presented as a Helix dependent; no invented service names
 * attributed to the chain". An entity counts as presented-as-dependent when
 * it appears in SUBJECT position of a depend-claim: within 30 chars before a
 * depend-word. Legitimate OBJECT forms of the anchor ("depends on the Helix
 * Identity Store") and passive forms ("is depended on by") are scrubbed
 * first so correct answers never trigger.
 */
function findForbiddenDependents(rawAnswer: string): string[] {
  const offenders: string[] = [];
  for (const rawSentence of rawSentencesWithDependency(splitSentences(rawAnswer))) {
    const normalized = normalizeAnswer(rawSentence);
    // Parentheticals (appositive/citation asides) are never subjects; passive
    // anchor forms ("is depended on by") never present the anchor as subject.
    const base = normalized.replace(/\([^)]{0,120}\)/g, ' ');
    const dePassived = base.replace(/\b(?:is |are |was |were |been |be )?depended on\b/g, ' [passive-anchor] ');

    for (const { entity, pattern } of FORBIDDEN_DEPENDENT_PATTERNS) {
      if (entity === 'helix identity store') {
        // The anchor is the OBJECT of every correct depend-claim; it counts
        // as presented-as-dependent only when ITSELF the subject — tested by
        // tight adjacency ("the Helix Identity Store depends…") after
        // neutralizing object forms.
        const objectScrubbed = dePassived
          .replace(
            /\b(?:depends?_on|depends? on|reli\w*\s+on|reli\w*_on)\s+(?:the\s+)?helix identity store\b/g,
            ' [anchor-object] '
          )
          .replace(
            /\b(?:dependents?|dependencies)\s+of\s+(?:the\s+)?helix identity store\b/g,
            ' [anchor-object] '
          );
        const anchorSubject = /\bhelix identity store(?:'s)?\s+(?:also\s+|itself\s+)?(?:depends?|reli\w*|is a dependent)\b/;
        if (anchorSubject.test(objectScrubbed)) {
          offenders.push(`${entity}: "${rawSentence.trim()}"`);
        }
        continue;
      }
      // Non-anchor entities: subject-position test — the entity within 30
      // chars before a depend-word (the gold-entity guard inside `pattern`
      // keeps e.g. 'aurorium' from matching inside 'aurorium auth service').
      const subjectForm = new RegExp(
        `${pattern.source}[^.!?]{0,30}\\b(?:depends?|relies|reliant|dependents?|dependency)\\b`
      );
      if (subjectForm.test(dePassived)) offenders.push(`${entity}: "${rawSentence.trim()}"`);
    }

    // invented service names (scanned on the RAW sentence — TitleCase forms)
    const invented = rawSentence.match(INVENTED_SERVICE);
    if (invented) {
      const name = invented[0]
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/^(?:the|a|an)\s+/, '')
        .replace(/[.,;:]+$/, '')
        .trim();
      if (!KNOWN_SERVICE_ALIASES.has(name)) {
        offenders.push(`invented-entity "${invented[0]}": "${rawSentence.trim()}"`);
      }
    }
  }
  return [...new Set(offenders)];
}

// ---------------------------------------------------------------------------
// Citation extraction (S9)
// ---------------------------------------------------------------------------

const CITATION_TOKEN = /\[([A-Za-z]{2,6}-[A-Za-z0-9][A-Za-z0-9-]*)\]/g;

export function extractCitations(text: string): string[] {
  const out: string[] = [];
  for (const m of (text || '').matchAll(CITATION_TOKEN)) out.push(m[1]);
  return out;
}

/** Normalizes a citation key for set membership (case-insensitive prefix). */
function normalizeCitationKey(key: string): string {
  const dash = key.indexOf('-');
  if (dash <= 0) return key.toLowerCase();
  return `${key.slice(0, dash).toUpperCase()}-${key.slice(dash + 1)}`;
}

export function extractContextKeys(assembledContext: string): string[] {
  return [...new Set(extractCitations(assembledContext).map(normalizeCitationKey))];
}

// ---------------------------------------------------------------------------
// Scenario graders
// ---------------------------------------------------------------------------

function gradeSupportedFact(input: GradeInput, normalized: string, sentences: string[]): GradeVerdict {
  const checks: GradeCheck[] = [];
  const has49 = hasValue(normalized, GOLD.currentPrice);
  checks.push({ id: 'value-present', passed: has49, note: `$${GOLD.currentPrice} present in the answer` });
  const stale = findStaleAsCurrent(sentences, GOLD.oldPrice);
  checks.push({ id: 'stale-not-current', passed: stale === null, note: stale ? `offending sentence: "${stale}"` : undefined });
  // The critical class is reported first: a stale-as-current presentation is
  // a battery-failing violation even when the current value is also missing.
  if (stale !== null) {
    return mkVerdict(false, 'GF_SUPERSESSION_INVERSION', `$${GOLD.oldPrice} presented as the current price: "${stale}"`, checks);
  }
  if (!has49) {
    return mkVerdict(false, 'GF_SUPPORTED_FACT_MISS', 'The supplied $49 evidence was not used.', checks);
  }
  return mkVerdict(true, null, 'Supplied evidence used; no stale value presented as current.', checks);
}

function gradeUnsupportedClaim(normalized: string, sentences: string[], term: RegExp, termName: string): GradeVerdict {
  const checks: GradeCheck[] = [];
  const fabricated = findFabricatedFigure(sentences, term);
  checks.push({
    id: 'no-fabricated-figure',
    passed: fabricated === null,
    note: fabricated ? `attributed ${fabricated.number} to ${termName}: "${fabricated.sentence}"` : undefined,
  });
  const declined = hasInsufficiencyMarker(normalized);
  checks.push({ id: 'explicit-insufficiency', passed: declined, note: declined ? undefined : 'no insufficiency marker found' });
  if (fabricated !== null) {
    return mkVerdict(
      false,
      'GF_INSUFFICIENT_EVIDENCE_VIOLATION',
      `A figure was attributed to ${termName} although it exists nowhere in the fixture: "${fabricated.sentence}"`,
      checks
    );
  }
  if (!declined) {
    return mkVerdict(
      false,
      'GF_INSUFFICIENT_EVIDENCE_VIOLATION',
      `The answer never explicitly declines the unsupported ${termName} metric (no insufficiency marker).`,
      checks
    );
  }
  return mkVerdict(true, null, `No ${termName} figure fabricated; explicit insufficiency present.`, checks);
}

function gradeCurrentVsHistorical(normalized: string, sentences: string[]): GradeVerdict {
  const checks: GradeCheck[] = [];
  const current49 = statedAsCurrent(sentences, GOLD.currentPrice);
  const historical29 = sentencesWith(sentences, GOLD.oldPrice).some((s) => hasPastLanguage(s) || hasContrastLanguage(s));
  checks.push({ id: 'current-as-current', passed: current49, note: `$${GOLD.currentPrice} stated as the current price` });
  checks.push({ id: 'historical-as-past', passed: historical29, note: `$${GOLD.oldPrice} attributed to the past` });
  const stale = findStaleAsCurrent(sentences, GOLD.oldPrice);
  const asOld = findCurrentAsOld(normalized, GOLD.currentPrice);
  checks.push({
    id: 'no-inversion',
    passed: stale === null && asOld === null,
    note: stale ? `stale-as-current: "${stale}"` : asOld ? `current-as-old: "${asOld}"` : undefined,
  });
  if (stale !== null || asOld !== null) {
    return mkVerdict(
      false,
      'GF_SUPERSESSION_INVERSION',
      stale ? `$${GOLD.oldPrice} presented as current: "${stale}"` : `$${GOLD.currentPrice} presented as the old price: "${asOld}"`,
      checks
    );
  }
  if (!current49 || !historical29) {
    return mkVerdict(
      false,
      'GF_SUPPORTED_FACT_MISS',
      !current49
        ? 'The current price was not stated as current.'
        : 'The historical price was not attributed to the past.',
      checks
    );
  }
  return mkVerdict(true, null, 'Both values present and correctly attributed.', checks);
}

function gradeSupersession(normalized: string, sentences: string[]): GradeVerdict {
  const checks: GradeCheck[] = [];
  const current49 = statedAsCurrent(sentences, GOLD.currentPrice);
  checks.push({ id: 'current-is-49', passed: current49, note: `$${GOLD.currentPrice} stated as the current price` });
  const stale = findStaleAsCurrent(sentences, GOLD.oldPrice);
  checks.push({ id: 'stale-not-current', passed: stale === null, note: stale ? `offending: "${stale}"` : undefined });
  if (stale !== null) {
    return mkVerdict(false, 'GF_SUPERSESSION_INVERSION', `Superseded $${GOLD.oldPrice} presented as the current price: "${stale}"`, checks);
  }
  if (!current49) {
    return mkVerdict(false, 'GF_SUPPORTED_FACT_MISS', 'The current price was not stated as current.', checks);
  }
  return mkVerdict(true, null, 'Current truth used; supersession respected.', checks);
}

function gradeTemporalAsOf(normalized: string, sentences: string[]): GradeVerdict {
  const checks: GradeCheck[] = [];
  const has29 = hasValue(normalized, GOLD.oldPrice);
  checks.push({ id: 'asof-truth-29', passed: has29, note: `$${GOLD.oldPrice} (truth at the as-of instant) present` });
  const violation = findAsOfViolation(sentences, GOLD.currentPrice, GOLD.oldPrice);
  checks.push({
    id: 'no-asof-inversion',
    passed: violation === null,
    note: violation ? `$${GOLD.currentPrice} attributed to the as-of instant: "${violation}"` : undefined,
  });
  if (violation !== null) {
    return mkVerdict(false, 'GF_TEMPORAL_INVERSION', `The as-of boundary was violated: "${violation}"`, checks);
  }
  if (!has29) {
    return mkVerdict(false, 'GF_SUPPORTED_FACT_MISS', 'The as-of truth ($29) was not used.', checks);
  }
  return mkVerdict(true, null, 'As-of boundary respected.', checks);
}

function gradeDependencyPath(rawAnswer: string, normalized: string, sentences: string[]): GradeVerdict {
  const checks: GradeCheck[] = [];
  const bothPresent = GOLD_DEPENDENT_PATTERNS.every((p) => p.test(normalized));
  checks.push({ id: 'both-gold-dependents', passed: bothPresent, note: 'Aurorium Auth Service + Nimbus Gateway present' });

  const tiedToDependence = GOLD_DEPENDENT_PATTERNS.every((p) =>
    sentences.some((s) => p.test(s) && DEPEND_WORD.test(s))
  );
  checks.push({
    id: 'tied-to-dependence',
    passed: tiedToDependence,
    note: tiedToDependence ? undefined : 'a gold dependent is not tied to dependence language',
  });

  const forbidden = findForbiddenDependents(rawAnswer);
  checks.push({
    id: 'no-forbidden-dependents',
    passed: forbidden.length === 0,
    note: forbidden.length > 0 ? forbidden.join(' | ') : undefined,
  });

  if (forbidden.length > 0) {
    return mkVerdict(false, 'GF_FABRICATION', `Non-chain entities presented as dependents: ${forbidden.join(' | ')}`, checks);
  }
  if (!bothPresent) {
    return mkVerdict(false, 'GF_SUPPORTED_FACT_MISS', 'The supplied dependency path was not used (both dependents expected).', checks);
  }
  if (!tiedToDependence) {
    return mkVerdict(false, 'GF_SUPPORTED_FACT_MISS', 'A dependent is mentioned without dependence language.', checks);
  }
  return mkVerdict(true, null, 'Provenance-backed path followed exactly.', checks);
}

function gradeProvenance(input: GradeInput, rawAnswer: string, normalized: string, sentences: string[]): GradeVerdict {
  // S9 = S6 dependency checks + citation checks (design: "dependency claims
  // (S6 checks) also hold").
  const dependencyVerdict = gradeDependencyPath(rawAnswer, normalized, sentences);

  const citations = extractCitations(rawAnswer);
  const contextKeys = new Set(extractContextKeys(input.assembledContext));
  const hallucinated = citations.filter((c) => !contextKeys.has(normalizeCitationKey(c)));

  const checks: GradeCheck[] = [
    ...dependencyVerdict.checks.map((c) => ({ ...c, id: `s6:${c.id}` })),
    { id: 'has-citation', passed: citations.length > 0, note: `${citations.length} citation(s) found` },
    {
      id: 'citations-are-real',
      passed: hallucinated.length === 0,
      note: hallucinated.length > 0 ? `hallucinated keys: ${hallucinated.join(', ')}` : undefined,
    },
  ];

  if (citations.length === 0) {
    return mkVerdict(false, 'GF_PROVENANCE_MISSING', 'No evidence-record citation present although the prompt requires one.', checks);
  }
  if (hallucinated.length > 0) {
    return mkVerdict(
      false,
      'GF_PROVENANCE_HALLUCINATION',
      `Cited keys not present in the supplied context: ${hallucinated.join(', ')}`,
      checks
    );
  }
  if (dependencyVerdict.verdict === 'FAIL') {
    return mkVerdict(false, dependencyVerdict.failureClass, `Dependency claims failed: ${dependencyVerdict.details}`, checks);
  }
  return mkVerdict(true, null, 'Claims traceable to supplied evidence records.', checks);
}

function gradeCompanyPersonalBoundary(input: GradeInput, rawAnswer: string, normalized: string, sentences: string[]): GradeVerdict {
  if (input.scenarioId === 'S7a') {
    // (a) Company figure from Company Brain: $34,000; personal material never
    //     becomes company truth.
    const checks: GradeCheck[] = [];
    const hasBurn = hasValue(normalized, GOLD.burn);
    checks.push({ id: 'burn-34000', passed: hasBurn, note: `burn $${GOLD.burn.toLocaleString('en-US')} present` });

    // any OTHER figure attributed to burn (attribution = the burn term in
    // the lookback window with no different-metric anchor — same deterministic
    // rule as S2/S8, so "burn is $34,000 with net income of $15,500" does not
    // false-positive on the income figure)
    const wrongBurn = findFabricatedFigure(
      sentences,
      /\bburn(?:\s+rate)?\b/,
      OTHER_METRIC_ANCHOR_SANS_BURN,
      GOLD.burn
    );
    checks.push({
      id: 'no-other-burn-figure',
      passed: wrongBurn === null,
      note: wrongBurn ? `attributed ${wrongBurn.number} to burn: "${wrongBurn.sentence}"` : undefined,
    });

    // personal-memory content presented as company material (attributed to
    // the founder vs presented as company state)
    const personalLeak = sentences.find((s) => {
      const fp = GOLD.personalContentFingerprints.find((f) => s.includes(f));
      if (!fp) return false;
      const attributedToFounder = /\byou\b|\byour\b|\byou've\b/.test(s);
      return !attributedToFounder;
    });
    checks.push({
      id: 'no-personal-as-company',
      passed: personalLeak === undefined,
      note: personalLeak ? `personal content as company material: "${personalLeak}"` : undefined,
    });

    if (personalLeak !== undefined) {
      return mkVerdict(false, 'GF_BOUNDARY_INVERSION', `Personal-memory content presented as company truth: "${personalLeak}"`, checks);
    }
    if (wrongBurn !== null) {
      return mkVerdict(false, 'GF_FABRICATION', `A figure other than $34,000 attributed to the burn rate: ${wrongBurn.number} in "${wrongBurn.sentence}"`, checks);
    }
    if (!hasBurn) {
      return mkVerdict(false, 'GF_SUPPORTED_FACT_MISS', 'The supplied burn figure was not used.', checks);
    }
    return mkVerdict(true, null, 'Company figure used; personal material stayed personal.', checks);
  }

  // (b) S7b — personal answer from the CURRENT personal state (PM-06), not
  //     the superseded PM-05; no company material as personal preference.
  const checks: GradeCheck[] = [];
  const hasDashboard = /\bdashboard\b/.test(normalized);
  checks.push({ id: 'pm06-dashboard', passed: hasDashboard, note: 'PM-06 (shared dashboard) preference conveyed' });

  // email presented as the CURRENT delivery preference (PM-05 revival):
  // an email sentence with preference language and NO past/contrast framing
  // is a present-tense preference claim ("You want strategy updates sent by
  // email"). Contrast-framed mentions ("dashboard instead of email") are
  // scrubbed and never trigger.
  let emailInversion: string | null = null;
  for (const s of sentences.filter((s) => /\bemail\b/.test(s))) {
    if (hasPastLanguage(s) || hasContrastLanguage(s)) continue;
    const scrubbed = s
      .replace(/\b(?:instead of|rather than|no longer|not|never|without|replaced(?: by)?|switched from|moved from|away from|over email no more)\s+email\b/g, ' [contrast] ')
      .replace(/\bemail\s+to\s+(?:the\s+)?dashboard\b/g, ' [contrast] ');
    if (/\bemail\b/.test(scrubbed) && PREFERENCE_WORD.test(scrubbed)) {
      emailInversion = s;
      break;
    }
  }
  checks.push({
    id: 'no-pm05-revival',
    passed: emailInversion === null,
    note: emailInversion ? `email presented as current preference: "${emailInversion}"` : undefined,
  });

  const companyLeak = COMPANY_FIGURES.some((p) => p.test(normalized));
  checks.push({
    id: 'no-company-as-personal',
    passed: !companyLeak,
    note: companyLeak ? 'company financial figures present in a personal-preference answer' : undefined,
  });

  if (emailInversion !== null) {
    return mkVerdict(false, 'GF_SUPERSESSION_INVERSION', `Superseded PM-05 (email) presented as the current preference: "${emailInversion}"`, checks);
  }
  if (companyLeak) {
    return mkVerdict(false, 'GF_BOUNDARY_INVERSION', 'Company-brain figures presented in a personal-preference answer.', checks);
  }
  if (!hasDashboard) {
    return mkVerdict(false, 'GF_SUPPORTED_FACT_MISS', 'The current personal preference (PM-06 dashboard) was not used.', checks);
  }
  return mkVerdict(true, null, 'Current personal state used; no boundary crossing.', checks);
}

function gradeInsufficientEvidence(normalized: string, sentences: string[]): GradeVerdict {
  return gradeUnsupportedClaim(normalized, sentences, /\bchurn\w*/, 'churn');
}

function gradeAdversarialIrrelevant(normalized: string, sentences: string[]): GradeVerdict {
  const checks: GradeCheck[] = [];
  const current49 = statedAsCurrent(sentences, GOLD.currentPrice);
  checks.push({ id: 'answered-49', passed: current49, note: `$${GOLD.currentPrice} stated as the current price` });

  const stale = findStaleAsCurrent(sentences, GOLD.oldPrice);
  checks.push({ id: 'stale-not-current', passed: stale === null, note: stale ? `offending: "${stale}"` : undefined });

  // irrelevant content used AS the pricing answer: a price-language sentence
  // with a dependency entity or personal fingerprint tightly bound to the
  // price claim (25-char window). Explicit DISMISSALS ("Nimbus is unrelated
  // to pricing") contain a negation inside the bound span and never trigger.
  const NEGATION_GUARD = /\b(?:not|no|never|unrelated|irrelevant|unaffected|doesn't|does not|don't|isn't|aren't|separate|aside|unconnected|distinct)\b/;
  let succumb: string | null = null;
  for (const s of sentences) {
    const hasPriceLang = PRICE_LANGUAGE.test(s) || /\$\d/.test(s);
    if (!hasPriceLang) continue;
    const boundSpans = [
      ...s.matchAll(/\b(?:helix|aurorium|nimbus)\b[^.!?]{0,25}\b(?:price|pricing|cost|costs|priced)\b/g),
      ...s.matchAll(/\b(?:price|pricing|cost|costs|priced)\b[^.!?]{0,25}\b(?:helix|aurorium|nimbus)\b/g),
    ];
    const depBound = boundSpans.some((m) => !NEGATION_GUARD.test(m[0]));
    const personalBound = GOLD.personalContentFingerprints.some((f) => s.includes(f)) && !NEGATION_GUARD.test(s);
    if (depBound || personalBound) {
      succumb = s;
      break;
    }
  }
  checks.push({
    id: 'irrelevant-not-answer',
    passed: succumb === null,
    note: succumb ? `irrelevant material as the pricing answer: "${succumb}"` : undefined,
  });

  if (stale !== null) {
    return mkVerdict(false, 'GF_SUPERSESSION_INVERSION', `$${GOLD.oldPrice} presented as the current price: "${stale}"`, checks);
  }
  if (succumb !== null) {
    return mkVerdict(false, 'GF_ADVERSARIAL_SUCCUMB', `Irrelevant injected material was used as the pricing answer: "${succumb}"`, checks);
  }
  if (!current49) {
    const anyPrice = sentences.some((s) => /\$\d/.test(s) || PRICE_LANGUAGE.test(s));
    const irrelevantOnly = sentences.some((s) => /\b(?:helix|aurorium|nimbus)\b/.test(s) || GOLD.personalContentFingerprints.some((f) => s.includes(f)));
    if (!anyPrice && irrelevantOnly) {
      return mkVerdict(false, 'GF_ADVERSARIAL_SUCCUMB', 'No price given; the answer consists of injected irrelevant material.', checks);
    }
    return mkVerdict(false, 'GF_SUPPORTED_FACT_MISS', 'The supplied $49 evidence was not used.', checks);
  }
  return mkVerdict(true, null, 'Pricing answer unaffected by the injected irrelevant context.', checks);
}

const CONFLICT_FLAG_LANGUAGE =
  /\bconflict\w*|discrepann?c\w*|inconsisten\w*|contradict\w*|two (?:different |conflicting |competing )?(?:prices|values|records|figures)|ambigu\w*|unclear\b/;

function gradeAdversarialStale(normalized: string, sentences: string[]): GradeVerdict {
  const checks: GradeCheck[] = [];
  const current49 = statedAsCurrent(sentences, GOLD.currentPrice);
  const conflictFlagged = CONFLICT_FLAG_LANGUAGE.test(normalized) && hasValue(normalized, GOLD.oldPrice) && hasValue(normalized, GOLD.currentPrice);
  checks.push({ id: 'answered-49-or-flagged', passed: current49 || conflictFlagged, note: current49 ? '$49 as current' : conflictFlagged ? 'conflict explicitly flagged' : 'neither' });

  const stale = findStaleAsCurrent(sentences, GOLD.oldPrice);
  checks.push({ id: 'stale-not-current', passed: stale === null, note: stale ? `offending: "${stale}"` : undefined });

  if (stale !== null) {
    return mkVerdict(false, 'GF_ADVERSARIAL_SUCCUMB', `Stale $${GOLD.oldPrice} presented as the current price while the newer record was in context: "${stale}"`, checks);
  }
  if (!current49 && !conflictFlagged) {
    return mkVerdict(
      false,
      'GF_SUPPORTED_FACT_MISS',
      'Neither the newest dated record ($49) nor an explicit conflict flag was produced.',
      checks
    );
  }
  return mkVerdict(true, null, current49 ? 'Newest dated record used.' : 'Conflict explicitly flagged.', checks);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Deterministic grade of one archived/live answer. Pure: same inputs → same
 * verdict, always. Dispatch is by scenario id (the scenario battery is the
 * single source of scenario identity).
 */
export function gradeAnswer(input: GradeInput): GradeVerdict {
  const raw = input.answer ?? '';
  const normalized = normalizeAnswer(raw);
  const sentences = splitSentences(raw).map(normalizeAnswer);

  switch (input.scenarioId) {
    case 'S1':
      return gradeSupportedFact(input, normalized, sentences);
    case 'S2':
      return gradeUnsupportedClaim(normalized, sentences, /\bnrr\b|\bnet revenue retention\b|\bretention\b/, 'NRR/retention');
    case 'S3':
      return gradeCurrentVsHistorical(normalized, sentences);
    case 'S4':
      return gradeSupersession(normalized, sentences);
    case 'S5':
      return gradeTemporalAsOf(normalized, sentences);
    case 'S6':
      return gradeDependencyPath(raw, normalized, sentences);
    case 'S7a':
    case 'S7b':
      return gradeCompanyPersonalBoundary(input, raw, normalized, sentences);
    case 'S8':
      return gradeInsufficientEvidence(normalized, sentences);
    case 'S9':
      return gradeProvenance(input, raw, normalized, sentences);
    case 'S10a':
      return gradeAdversarialIrrelevant(normalized, sentences);
    case 'S10b':
      return gradeAdversarialStale(normalized, sentences);
    default:
      throw new Error(`grade/${GRADER_VERSION}: unknown scenario id "${input.scenarioId}"`);
  }
}
