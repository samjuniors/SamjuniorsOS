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
}

/** Token-set Jaccard similarity threshold for the near-duplicate hint. */
const SIMILARITY_THRESHOLD = 0.6;
/** Minimum shared tokens before a similarity hint is reported at all. */
const MIN_SHARED_TOKENS = 3;

function tokenize(normalized: string): Set<string> {
  const raw = normalized.split(' ').filter((t) => t.length > 1);
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
  }));

  const annotations: Record<string, MemoryReviewAnnotation> = {};

  for (const record of listed) {
    const normalized = normalizeForDuplicateComparison(record.content);
    const mine = tokenize(normalized);
    let duplicateOf: MemoryReviewAnnotation['duplicateOf'] | undefined;
    const similar: Array<{ id: string; content: string; similarity: number }> = [];

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
    }

    const annotation: MemoryReviewAnnotation = {};
    if (duplicateOf) annotation.duplicateOf = duplicateOf;
    if (similar.length > 0) {
      // Closest match first — the strongest near-duplicate evidence is what
      // the reviewer should weigh first.
      similar.sort((a, b) => b.similarity - a.similarity);
      annotation.similarTo = similar.slice(0, 3);
    }
    if (annotation.duplicateOf || annotation.similarTo) {
      annotations[record.id] = annotation;
    }
  }

  return annotations;
}
