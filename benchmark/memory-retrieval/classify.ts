/**
 * ============================================================================
 * M5.1 — FAILURE CLASSIFICATION
 * ============================================================================
 * Deterministic rules mapping measured failures to:
 *   (1) the FAILURE CLASS — RETRIEVAL vs AUTHORITY_LIFECYCLE (GENERATION is
 *       never emitted: this harness contains no model call, so a generation
 *       failure is structurally unmeasurable here — the distinction is kept
 *       explicit in every report);
 *   (2) the GAP TAXONOMY (task options A–J);
 *   (3) the GRAPH-CANDIDATE flag — TRUE only when a failure requires a
 *       relationship traversal that cannot reasonably be represented or
 *       retrieved with the current relational/lexical architecture:
 *         a. the query declares a relationship hop at depth ≥ 2 for this
 *            evidence, AND
 *         b. single-shot lexical overlap between the query and the evidence
 *            text is ZERO (no direct retrieval is possible), AND
 *         c. the failure class is RETRIEVAL (not an authority violation).
 *       A failure is NEVER tagged F merely because the query mentions
 *       relationships — the traversal requirement is checked, not assumed.
 *
 * All rules are pure functions of (query, evidence, measured lists). The
 * classifier also never sees `expectedGaps` — measured gaps are computed
 * independently from the design hypothesis so expectation cannot leak into
 * measurement.
 */

import { extractTokens } from '../../src/lib/server/knowledge/knowledge-store';
import { foldPersonalMindToken } from '../../src/lib/server/sophia/context-assembly';
import type {
  BenchmarkQuery,
  EvidencePointer,
  FailureClass,
  FailureRecord,
  ForbiddenPointer,
  GapTag,
  RetrievalSurface,
  SurfaceRetrieval,
} from './types';
import { TRUTH_BEARING_AUTHORITIES } from './types';

/** Canonical searchable text of a fixture evidence key (same fields each
 * surface's scorer reads). Provided by the evaluator's registry bundle. */
export type EvidenceTextProvider = (evidenceKey: string) => {
  surface: RetrievalSurface | null;
  text: string;
  /** Lifecycle eligibility on the evidence's own store. */
  lifecycle: 'active' | 'superseded' | 'pending' | 'rejected' | 'archived' | 'n/a';
};

function tokenOverlap(
  query: string,
  evidenceText: string,
  surface: RetrievalSurface | null
): number {
  const queryTokens = new Set(
    extractTokens(query).map((t) => (surface === 'personal_mind' ? foldPersonalMindToken(t) : t))
  );
  if (queryTokens.size === 0) return 0;
  const evidenceTokens = new Set(
    extractTokens(evidenceText).map((t) =>
      surface === 'personal_mind' ? foldPersonalMindToken(t) : t
    )
  );
  let overlap = 0;
  for (const t of queryTokens) if (evidenceTokens.has(t)) overlap++;
  return overlap;
}

/** Priority order for gap tags (first applicable wins as primaryGap). */
const GAP_PRIORITY: GapTag[] = [
  'I_authorization',
  'F_graph_traversal',
  'D_temporal_filtering',
  'B_semantic',
  'H_context_assembly',
  'C_structured_filtering',
  'G_reranking',
  'A_lexical',
  'E_entity_resolution',
  'J_other',
];

function pickPrimary(tags: GapTag[]): GapTag {
  for (const tag of GAP_PRIORITY) if (tags.includes(tag)) return tag;
  return 'J_other';
}

function makeFailure(
  query: BenchmarkQuery,
  surface: RetrievalSurface | 'render',
  kind: FailureRecord['kind'],
  evidenceKey: string,
  failureClass: FailureClass,
  gapTags: GapTag[],
  graphCandidate: boolean,
  explanation: string
): FailureRecord {
  const unique = [...new Set(gapTags)];
  return {
    queryId: query.queryId,
    category: query.category,
    surface,
    kind,
    evidenceKey,
    failureClass,
    gapTags: unique,
    primaryGap: pickPrimary(unique),
    graphCandidate,
    explanation,
  };
}

/** Whether the query declares a depth-≥2 relationship hop for this evidence. */
function declaredHopDepth(query: BenchmarkQuery, evidenceKey: string): number {
  const hop = query.relationship?.hops.find((h) => h.evidenceKeys.includes(evidenceKey));
  return hop?.depth ?? 0;
}

/**
 * CLASSIFY A GOLD MISS (not retrieved / beyond K / not rendered).
 */
export function classifyGoldMiss(
  query: BenchmarkQuery,
  surface: RetrievalSurface | 'render',
  evidenceKey: string,
  kind: 'GOLD_NOT_RETRIEVED' | 'GOLD_BEYOND_EFFECTIVE_K' | 'GOLD_NOT_RENDERED',
  context: {
    surfaceResult?: SurfaceRetrieval;
    getText: EvidenceTextProvider;
    rendered: boolean;
  }
): FailureRecord {
  const info = context.getText(evidenceKey);
  const overlap = tokenOverlap(query.queryText, info.text, info.surface);
  const depth = declaredHopDepth(query, evidenceKey);
  const tags: GapTag[] = [];

  // --- Rule 0: missing retrieval SURFACE (not a ranking/scoring issue) ----
  // The episodic surface does not exist in A0: token overlap is irrelevant
  // because no code path ever consults conversation history for retrieval.
  // J_other is the ONLY tag for this surface so it is also the primary gap —
  // the missing-surface fact dominates any paraphrase nuance.
  if (kind === 'GOLD_NOT_RETRIEVED' && surface === 'episodic_conversation') {
    tags.push('J_other');
    return makeFailure(
      query,
      surface,
      kind,
      evidenceKey,
      'RETRIEVAL',
      tags,
      false,
      `${kind} for ${evidenceKey} on ${surface}: NO episodic retrieval surface exists in A0 — ` +
        `the canonical path loads only current-conversation history (last 10 turns, client-supplied) ` +
        `and no store offers past-conversation search; lexical overlap with the query is ${overlap} ` +
        `but no code path ever consults it`
    );
  }

  // --- Rule 1: lifecycle-invisible gold on a history/window query ----------
  if (
    (info.lifecycle === 'superseded' || info.lifecycle === 'pending' || info.lifecycle === 'rejected' || info.lifecycle === 'archived') &&
    (query.temporal?.intent === 'history' || query.temporal?.intent === 'window')
  ) {
    tags.push('D_temporal_filtering');
  }

  // --- Rule 2: declared multi-hop hop ≥ 2 with zero direct overlap --------
  if (depth >= 2 && overlap === 0) {
    tags.push('F_graph_traversal', 'B_semantic');
  }

  // --- Rule 3: retrieved but not rendered (context assembly layer) --------
  if (kind === 'GOLD_NOT_RENDERED') {
    tags.push('H_context_assembly');
    if (overlap === 0) tags.push('B_semantic');
  }

  // --- Rule 4: rank beyond effective K (present in the ordered list) -------
  if (kind === 'GOLD_BEYOND_EFFECTIVE_K') {
    if (surface === 'canonical_facts') {
      // The facts surface ranks by promotedAt recency, ignoring the query.
      tags.push('C_structured_filtering', 'G_reranking');
    } else {
      tags.push('G_reranking', 'A_lexical');
    }
  }

  // --- Rule 5: zero-overlap miss on a conditioned surface ------------------
  if (kind === 'GOLD_NOT_RETRIEVED' && overlap === 0 && depth < 2 && surface !== 'episodic_conversation') {
    if (surface === 'unverified_claims') {
      tags.push('C_structured_filtering');
    } else if (surface === 'company_state') {
      tags.push('C_structured_filtering', 'E_entity_resolution');
    } else {
      tags.push('B_semantic');
    }
  }

  // --- Rule 6: token overlap exists but the item was not retrieved --------
  if (kind === 'GOLD_NOT_RETRIEVED' && overlap > 0) {
    if (surface === 'company_state') {
      // State renders a fixed projection; overlapping evidence (e.g. the
      // decision record) has no slice at all.
      tags.push('C_structured_filtering');
    } else {
      tags.push('A_lexical', 'G_reranking');
    }
  }

  // --- Entity-centric secondary tag ---------------------------------------
  if (query.category === 'ENTITY_CENTRIC' && overlap === 0) {
    tags.push('E_entity_resolution');
  }

  const graphCandidate =
    tags.includes('F_graph_traversal') && depth >= 2 && kind !== 'GOLD_NOT_RENDERED';

  const explanation =
    `${kind} for ${evidenceKey} on ${surface}: ` +
    (depth >= 2 && overlap === 0
      ? `declared relationship hop depth ${depth} with zero single-shot lexical overlap `
      : `lexical overlap ${overlap} `) +
    (kind === 'GOLD_NOT_RENDERED' ? `(retrieved into the selection but cut before/during render) ` : '') +
    (info.lifecycle !== 'active' && info.lifecycle !== 'n/a'
      ? `(evidence lifecycle on its store: ${info.lifecycle}) `
      : '') +
    (context.surfaceResult?.note ? `; surface note: ${context.surfaceResult.note}` : '');

  return makeFailure(query, surface, kind, evidenceKey, 'RETRIEVAL', tags, graphCandidate, explanation);
}

/**
 * CLASSIFY A FORBIDDEN HIT. Returns null when the observation is LEGAL:
 *   - authorityOnly-forbidden evidence rendered under advisory labels
 *     (PERSONAL_MIND_MEMORY / UNVERIFIED_CLAIM / HISTORICAL_PRECEDENT) is
 *     by-design behavior, not a failure;
 *   - hard-forbidden evidence that appears NOWHERE is no failure at all.
 */
export function classifyForbiddenHit(
  query: BenchmarkQuery,
  pointer: ForbiddenPointer,
  evidenceKey: string,
  observation: {
    /** Present in the surface's retrieved list (any rank). */
    retrieved: boolean;
    /** Authorities the evidence rendered under (empty = not rendered). */
    renderedUnder: string[];
  }
): FailureRecord | null {
  const truthBearing = observation.renderedUnder.filter((a) =>
    (TRUTH_BEARING_AUTHORITIES as readonly string[]).includes(a)
  );

  if (pointer.authorityOnly) {
    // Legal unless it appeared in a truth-bearing position.
    if (truthBearing.length === 0) return null;
    return makeFailure(
      query,
      pointer.surface,
      'FORBIDDEN_AS_AUTHORITY',
      evidenceKey,
      'AUTHORITY_LIFECYCLE',
      ['I_authorization'],
      false,
      `${evidenceKey} rendered under truth-bearing authority [${truthBearing.join(', ')}] — ${pointer.reason}`
    );
  }

  if (!observation.retrieved && observation.renderedUnder.length === 0) return null;

  const kind: FailureRecord['kind'] = observation.renderedUnder.length > 0 ? 'FORBIDDEN_RENDERED' : 'FORBIDDEN_RETRIEVED';
  return makeFailure(
    query,
    pointer.surface,
    kind,
    evidenceKey,
    'AUTHORITY_LIFECYCLE',
    ['I_authorization'],
    false,
    `${evidenceKey} ${kind === 'FORBIDDEN_RENDERED' ? 'rendered' : 'retrieved'} on ${pointer.surface} — ${pointer.reason}`
  );
}

/** Expected pointers as a surface→keys map. */
export function goldBySurface(expected: EvidencePointer[]): Partial<Record<RetrievalSurface, string[]>> {
  const map: Partial<Record<RetrievalSurface, string[]>> = {};
  for (const pointer of expected) {
    map[pointer.surface] = [...(map[pointer.surface] ?? []), ...pointer.evidenceKeys];
  }
  return map;
}
