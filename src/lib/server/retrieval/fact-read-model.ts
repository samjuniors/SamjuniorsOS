/**
 * ============================================================================
 * M5.3-A — AUTHORITATIVE AS-OF / SUPERSESSION READ MODEL (shared, pure)
 * ============================================================================
 * The single source of fact-ELIGIBILITY semantics for both store modes
 * (local in-memory and Prisma/PostgreSQL authoritative), the same way
 * rankFactsForQuery is the single source of fact-RANKING semantics (M5.2).
 *
 * The read model distinguishes exactly three modes:
 *
 *   CURRENT    — what is company truth NOW.
 *                Eligibility: validityState === 'active' (unchanged since
 *                M0; the ONLY truth-bearing eligibility rule).
 *
 *   HISTORICAL — every fact that ever was company truth, active or
 *                superseded, with successor pointers and event times intact.
 *                Historical evidence is never deleted and never silently
 *                re-becomes current: rendering it as truth requires a
 *                separate, explicit decision the CALLER owns (the M5.2
 *                SUPERSEDED_FACT projection is the precedent).
 *
 *   AS_OF(T)   — what was company truth at instant T.
 *                Eligibility: the fact was promoted at or before T
 *                (promotedAt <= T) AND its supersession event had not yet
 *                happened at T (supersededAt is null OR supersededAt > T).
 *                An active fact with a null supersededAt is still current
 *                (it has never been superseded). A SUPERSEDED fact whose
 *                supersededAt is UNKNOWN (legacy pre-M5.3-A row) is EXCLUDED
 *                — fail-closed: we cannot prove it was still current at T,
 *                so we refuse to present it as as-of truth. It remains
 *                available to HISTORICAL reads.
 *
 * LIFECYCLE AUTHORITY (unchanged): validityState remains the ONLY eligibility
 * authority for truth-bearing rendering. This module computes READ
 * PROJECTIONS; it never mutates facts, never decides promotions or
 * supersessions, and never calls a store, the clock, or a model. Given the
 * same fact set and the same parameters it always returns the same result.
 */

import type { CanonicalFact } from '@/types/epistemic';

/** The three authoritative read modes (M5.3-A task contract). */
export type FactReadMode = 'CURRENT' | 'HISTORICAL' | 'AS_OF';

export interface FactReadParams {
  mode: FactReadMode;
  /** Required iff mode === 'AS_OF'. ISO-8601 instant. */
  asOf?: string;
  category?: CanonicalFact['category'];
  subject?: string;
}

/** Upper bound on lineage traversal (successor + predecessor chains). */
export const MAX_FACT_LINEAGE_NODES = 32;

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Fail-closed AS_OF eligibility for ONE fact (pure).
 * See the module header for the exact rule.
 */
export function isFactCurrentAsOf(fact: CanonicalFact, asOfMs: number): boolean {
  const promotedMs = toMs(fact.promotedAt);
  if (promotedMs === null || promotedMs > asOfMs) return false; // not yet truth at T
  if (fact.validityState === 'superseded') {
    const supersededMs = toMs(fact.supersededAt);
    if (supersededMs === null) return false; // unknown event time — fail closed
    return supersededMs > asOfMs; // supersession happened after T → still truth at T
  }
  // Active (or disputed/deprecated — non-truth states never enter read
  // projections; the caller filters validityState like every existing path).
  return fact.validityState === 'active';
}

/**
 * The single eligibility predicate shared by both store modes.
 * Deterministic; never reorders (ordering is the caller's stable contract:
 * promotedAt DESC, id ASC — matching listAllFacts since M5.2).
 */
export function selectFactsForReadMode(
  facts: CanonicalFact[],
  params: FactReadParams
): CanonicalFact[] {
  let pool: CanonicalFact[];
  if (params.mode === 'CURRENT') {
    pool = facts.filter((f) => f.validityState === 'active');
  } else if (params.mode === 'HISTORICAL') {
    pool = facts.filter((f) => f.validityState === 'active' || f.validityState === 'superseded');
  } else {
    // AS_OF
    const asOfMs = toMs(params.asOf);
    if (asOfMs === null) return []; // fail closed: no instant, no projection
    pool = facts.filter((f) => isFactCurrentAsOf(f, asOfMs));
  }
  if (params.category) pool = pool.filter((f) => f.category === params.category);
  if (params.subject) {
    pool = pool.filter((f) => f.subject.toLowerCase() === params.subject!.toLowerCase());
  }
  return pool
    .sort((a, b) => {
      if (b.promotedAt !== a.promotedAt) return b.promotedAt.localeCompare(a.promotedAt);
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((f) => ({ ...f }));
}

/** One hop of a fact lineage chain with its event time and provenance. */
export interface FactLineageHop {
  fact: CanonicalFact;
  /** When this hop's fact was superseded (null while it is current). */
  supersededAt: string | null;
}

export interface FactLineage {
  factId: string;
  /** Successor chain: fact → its superseder → … (bounded, cycle-safe). */
  successors: FactLineageHop[];
  /** Predecessor chain: facts this fact superseded, newest first (bounded). */
  predecessors: FactLineageHop[];
}

/**
 * Bounded, cycle-safe lineage collection over fetcher closures so BOTH store
 * modes share one traversal semantics (local mode passes map lookups; the
 * Prisma mode passes database reads). Pure with respect to the fetchers:
 * identical fetcher results → identical lineage. Bounded at
 * MAX_FACT_LINEAGE_NODES total to refuse unbounded chain walks.
 */
export async function collectFactLineage(
  rootId: string,
  fetchFact: (id: string) => Promise<CanonicalFact | null>,
  fetchPredecessors: (id: string) => Promise<CanonicalFact[]>
): Promise<FactLineage> {
  const successors: FactLineageHop[] = [];
  const predecessors: FactLineageHop[] = [];
  const visited = new Set<string>([rootId]);

  // Forward: follow supersededById pointers.
  let current = await fetchFact(rootId);
  if (!current) return { factId: rootId, successors, predecessors };
  while (current.supersededById) {
    if (visited.size >= MAX_FACT_LINEAGE_NODES) break;
    if (visited.has(current.supersededById)) break; // cycle guard
    const next = await fetchFact(current.supersededById);
    if (!next) break;
    visited.add(next.id);
    successors.push({ fact: { ...next }, supersededAt: next.supersededAt ?? null });
    current = next;
  }

  // Backward: facts whose supersededById points at the root (or its chain).
  const queue = [rootId, ...successors.map((s) => s.fact.id)];
  while (queue.length > 0 && visited.size < MAX_FACT_LINEAGE_NODES) {
    const id = queue.shift()!;
    const preds = await fetchPredecessors(id);
    for (const pred of preds) {
      if (visited.has(pred.id)) continue;
      visited.add(pred.id);
      predecessors.push({ fact: { ...pred }, supersededAt: pred.supersededAt ?? null });
      queue.push(pred.id);
    }
  }
  return { factId: rootId, successors, predecessors };
}

/**
 * Resolve the supersession EVENT TIME for a fact being marked superseded.
 * Deterministic preference order:
 *   1. an explicit caller-supplied event time (the promotion pipeline passes
 *      the successor's promotion moment — the semantically exact instant);
 *   2. the successor's promotedAt, when the successor is already stored
 *      (covers seed-style write orders);
 *   3. null → the CALLER (store) substitutes the wall clock and records it.
 */
export function resolveSupersessionEventTime(
  explicit: string | undefined,
  successor: CanonicalFact | null | undefined
): string | null {
  if (explicit) return explicit;
  if (successor && successor.promotedAt) return successor.promotedAt;
  return null;
}
