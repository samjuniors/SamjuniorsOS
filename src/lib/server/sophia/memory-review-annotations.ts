import { normalizeForDuplicateComparison } from './memory-gate';
import { SophiaMemoryRecord } from './personal-memory-store';

/**
 * ============================================================================
 * SOPHIA MEMORY REVIEW ANNOTATIONS (M4-A HARDENING — reviewability)
 * ============================================================================
 * Deterministic, dependency-free duplicate/similarity hints for the Founder
 * review queue. This is REVIEW VISIBILITY ONLY — no merging, no semantic
 * consolidation, no automatic action:
 *
 *   - duplicateOf: exact-normalized duplicate (the MemoryGate's own
 *     normalizeForDuplicateComparison — same normalization, same verdict
 *     the gate uses for DUPLICATE_CONTENT rejections on capture).
 *   - similarTo:  near-duplicate hint via token-set Jaccard similarity
 *     over normalized content (catches article/adverb variations like
 *     "The founder strongly prefers concise answers" vs "The founder
 *     prefers concise answers"). NO embeddings, NO vectors, NO new store.
 *
 * HONEST LIMITS (documented deliberately): token Jaccard does NOT detect
 * true paraphrases ("I prefer concise answers" vs "Keep responses short"
 * share almost no tokens). Semantic paraphrase detection and contradiction
 * detection remain DEFERRED to a future phase; a paraphrase pair is
 * surfaced to the reviewer only through the similarity hint when wording
 * actually overlaps.
 */

export interface MemoryReviewAnnotation {
  /** Exact-normalized duplicate of another record (gate-equivalent match). */
  duplicateOf?: { id: string; content: string };
  /** Near-duplicate hints (token-Jaccard >= threshold), worst-first. */
  similarTo?: Array<{ id: string; content: string; similarity: number }>;
  /**
   * OBVIOUS contradiction hints (M4-A hardening): deterministic
   * polarity-opposition detection — two memories about the SAME object with
   * opposing sentiment polarity (likes/prefers/wants vs
   * dislikes/hates/avoids/does-not-want). High precision by design; see the
   * limits note below.
   */
  contradicts?: Array<{ id: string; content: string }>;
}

/** Token-set Jaccard similarity threshold for the near-duplicate hint. */
const SIMILARITY_THRESHOLD = 0.6;
/** Minimum shared tokens before a similarity hint is reported at all. */
const MIN_SHARED_TOKENS = 3;

// ---------------------------------------------------------------------------
// OBVIOUS CONTRADICTION DETECTION (deterministic, high precision)
// ---------------------------------------------------------------------------
// Detects only what pattern matching can do RELIABLY: two records whose
// OBJECT tokens overlap while their POLARITY verbs oppose each other
// ("Founder prefers concise answers" vs "Founder dislikes concise answers").
//
// DELIBERATELY NOT DETECTED (documented limits):
//   - changed preferences ("prefers concise" → "now prefers detailed") — both
//     positive polarity; antonymy of the OBJECT is not deterministically
//     reliable, so no hint is emitted;
//   - true semantic paraphrase contradictions ("Keep responses short" vs
//     "Write long explanations") — needs semantics, out of scope for M4-A;
//   - numeric/factual contradictions ("works 3 days" vs "works 5 days").
// A missed hint costs nothing: the candidate still waits for Founder review.
// ---------------------------------------------------------------------------

/** Negative-polarity verb forms (checked BEFORE positive forms are stripped). */
const NEGATIVE_POLARITY_PATTERNS: RegExp[] = [
  /\bdislikes?\b/,
  /\bhates?\b/,
  /\bhated\b/,
  /\bavoids?\b/,
  /\bavoided\b/,
  /\bdespises?\b/,
  /\bcan'?t stand\b/,
  /\bdoes not (?:like|want|prefer|enjoy)\b/,
  /\bdoesn'?t (?:like|want|prefer|enjoy)\b/,
  /\bdo not (?:like|want|prefer|enjoy)\b/,
  /\bdon'?t (?:like|want|prefer|enjoy)\b/,
  /\bnever (?:wants?|likes?|prefers?|uses?|wears?|reads?)\b/,
  // P2 follow-up (missed live contradictions): realistic phrasings that
  // escaped the original list — "prefers not to", "no longer likes",
  // "is not a fan of", "doesn't care for". All are OBVIOUS negated-polarity
  // forms (bounded additions; no semantics, no antonymy).
  /\b(?:prefer|prefers|preferred) not to\b/,
  /\bno longer (?:likes?|loves?|prefers?|wants?|uses?|wears?|reads?|enjoys?)\b/,
  /\b(?:is|are|am) not a fan of\b/,
  /\b(?:is|are|am)n'?t a fan of\b/,
  /\bdoesn'?t care for\b/,
  /\bstopped (?:liking|using|wearing|reading|preferring)\b/,
];

/** Positive-polarity verb forms. */
const POSITIVE_POLARITY_PATTERNS: RegExp[] = [
  /\blikes?\b/,
  /\bliked\b/,
  /\bloves?\b/,
  /\bloved\b/,
  /\benjoys?\b/,
  /\benjoyed\b/,
  /\bprefers?\b/,
  /\bpreferred\b/,
  /\bwants?\b/,
  /\bwanted\b/,
  /\bfavors?\b/,
  /\bfavored\b/,
];

type Polarity = 'positive' | 'negative' | 'mixed';

/**
 * Polarity + object tokens for one record. Negation phrases ("does not want")
 * are matched first and REMOVED before positive matching and tokenization, so
 * "does not want" never counts as a positive "want" or as an object token.
 */
function polarityAndObjects(normalized: string): {
  polarity: Polarity;
  objects: Set<string>;
} {
  let residue = normalized;
  let negative = false;
  for (const p of NEGATIVE_POLARITY_PATTERNS) {
    if (p.test(residue)) {
      negative = true;
      residue = residue.replace(new RegExp(p.source, p.flags), ' ');
    }
  }
  let positive = false;
  for (const p of POSITIVE_POLARITY_PATTERNS) {
    const re = new RegExp(p.source, p.flags);
    if (re.test(residue)) {
      positive = true;
      residue = residue.replace(re, ' ');
    }
  }
  const objects = tokenize(residue);
  const polarity: Polarity =
    negative && positive ? 'mixed' : negative ? 'negative' : positive ? 'positive' : 'mixed';
  return { polarity, objects };
}

/** Minimum shared OBJECT tokens before a contradiction hint is reported. */
const CONTRADICTION_MIN_SHARED_OBJECTS = 2;
/** Object-token Jaccard required for a contradiction hint. */
const CONTRADICTION_OBJECT_JACCARD = 0.5;

function tokenize(normalized: string): Set<string> {
  // P2 follow-up (punctuation-variant similarity miss): internal punctuation
  // used to survive INSIDE tokens ("tea," ≠ "tea"), so comma/variant pairs
  // scored ~0.43 Jaccard and evaded the similarTo hint. Tokens are now
  // reduced to their alphanumeric core, matching the authority guard's
  // normalization philosophy: punctuation cannot split a keyword.
  const raw = normalized
    .split(' ')
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter((t) => t.length > 1);
  // Drop the most common English function words so similarity reflects
  // content words, not shared grammar.
  const stop = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'to', 'of', 'in', 'on', 'at', 'for', 'with', 'and', 'or', 'but',
    'that', 'this', 'it', 'as', 'by', 'from', 'their', 'his', 'her',
    'they', 'them', 'he', 'she', 'has', 'have', 'had', 'does', 'do',
  ]);
  const tokens = new Set(raw.filter((t) => !stop.has(t)));
  return tokens.size > 0 ? tokens : new Set(raw);
}

function jaccard(a: Set<string>, b: Set<string>): { similarity: number; shared: number } {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const union = a.size + b.size - shared;
  return { similarity: union === 0 ? 0 : shared / union, shared };
}

/**
 * Computes review annotations for the given listed records, compared against
 * the full comparison pool (which may include records outside the listing —
 * e.g. active memories when the reviewer lists only pending candidates).
 * Pure function; deterministic; O(n*m) over bounded store lists (<=50).
 */
export function annotateReviewRecords(
  listed: SophiaMemoryRecord[],
  pool: SophiaMemoryRecord[]
): Record<string, MemoryReviewAnnotation> {
  const normalizedPool = pool.map((m) => ({
    id: m.id,
    content: m.content,
    normalized: normalizeForDuplicateComparison(m.content),
    tokens: null as Set<string> | null,
    polarity: null as null | { polarity: Polarity; objects: Set<string> },
  }));

  const annotations: Record<string, MemoryReviewAnnotation> = {};

  for (const record of listed) {
    const normalized = normalizeForDuplicateComparison(record.content);
    const mine = tokenize(normalized);
    const minePolarity = polarityAndObjects(normalized);
    let duplicateOf: MemoryReviewAnnotation['duplicateOf'] | undefined;
    const similar: Array<{ id: string; content: string; similarity: number }> = [];
    const contradictions: Array<{ id: string; content: string }> = [];

    for (const other of normalizedPool) {
      if (other.id === record.id) continue;

      if (other.normalized === normalized) {
        // Exact-normalized duplicate: strongest signal; keep the first found.
        if (!duplicateOf) {
          duplicateOf = { id: other.id, content: other.content };
        }
        continue;
      }

      if (other.tokens === null) {
        other.tokens = tokenize(other.normalized);
      }
      const { similarity, shared } = jaccard(mine, other.tokens);
      if (similarity >= SIMILARITY_THRESHOLD && shared >= MIN_SHARED_TOKENS) {
        similar.push({ id: other.id, content: other.content, similarity: Math.round(similarity * 100) / 100 });
      }

      // OBVIOUS contradiction: opposing polarity verbs over the SAME object
      // tokens (positive vs negative only — 'mixed' polarity never flags).
      if (other.polarity === null) {
        other.polarity = polarityAndObjects(other.normalized);
      }
      const otherPolarity = other.polarity.polarity;
      if (
        otherPolarity !== 'mixed' &&
        minePolarity.polarity !== 'mixed' &&
        otherPolarity !== minePolarity.polarity
      ) {
        const obj = jaccard(minePolarity.objects, other.polarity.objects);
        if (
          obj.shared >= CONTRADICTION_MIN_SHARED_OBJECTS &&
          obj.similarity >= CONTRADICTION_OBJECT_JACCARD
        ) {
          contradictions.push({ id: other.id, content: other.content });
        }
      }
    }

    const annotation: MemoryReviewAnnotation = {};
    if (duplicateOf) annotation.duplicateOf = duplicateOf;
    if (similar.length > 0) {
      // Closest match first — the strongest near-duplicate evidence is what
      // the reviewer should weigh first.
      similar.sort((a, b) => b.similarity - a.similarity);
      annotation.similarTo = similar.slice(0, 3);
    }
    if (contradictions.length > 0) {
      annotation.contradicts = contradictions.slice(0, 3);
    }
    if (annotation.duplicateOf || annotation.similarTo || annotation.contradicts) {
      annotations[record.id] = annotation;
    }
  }

  return annotations;
}
