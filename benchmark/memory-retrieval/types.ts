/**
 * ============================================================================
 * M5.1 — MEMORY RETRIEVAL BENCHMARK: SHARED TYPES
 * ============================================================================
 * Deterministic, repeatable retrieval benchmark over the EXISTING SamJuniorsOS
 * M4 architecture (baseline A0). This module is pure typing — no store
 * imports, no I/O, no LLM.
 *
 * DESIGN CONTRACTS:
 *  - The benchmark measures RETRIEVAL ONLY. No model call is ever made; an
 *    "answer" is the set of evidence records the canonical Sophia context
 *    assembly path would surface for the query. Generation failures are out
 *    of scope by construction (see docs/architecture/
 *    M5_1_MEMORY_RETRIEVAL_BENCHMARK.md §7).
 *  - Every gold item names its authoritative surface. A correct answer must
 *    come from that surface; evidence found on another surface is context,
 *    never truth (authority-correctness hard gate).
 *  - All fixture timestamps are frozen ISO strings. The harness never reads
 *    the wall clock into any result field, so two runs produce byte-identical
 *    JSON (determinism is asserted by the benchmark's own test suite).
 */

/** The exact retrieval surfaces of the canonical Sophia turn path (A0). */
export type RetrievalSurface =
  /**
   * SophiaMemoryStore.listAllMemories(founder, {active:true}) piped through
   * selectPersonalMindMemories(pool, message) — the M4-C/M4-D conditioned
   * Personal Mind selection (context-assembly.ts slice 6B).
   */
  | 'personal_mind'
  /**
   * CompanyKnowledgeStore.queryKnowledge({queryText, limit: 2}) — slice 5A.
   */
  | 'company_knowledge'
  /**
   * CompanyMemoryStore.queryMemories({queryText, limit: 2}) (the
   * OperationalLearningLoop lexical scorer) — slice 5B.
   */
  | 'company_precedent'
  /**
   * EpistemicClaimStore.listActiveFacts() — top-3 by promotedAt DESC —
   * slice 4A. NOT query-conditioned in A0.
   */
  | 'canonical_facts'
  /**
   * Pending claims over listClaims() — top-3 — slice 4B under the
   * EPISTEMIC WARNING label. NOT query-conditioned in A0.
   */
  | 'unverified_claims'
  /**
   * CompanyStateStore.getFinancialMetrics() + getInitiatives() — slice 1.
   * Rendered unconditionally (not query-conditioned in A0).
   */
  | 'company_state'
  /**
   * Past-conversation messages. The canonical Sophia path loads ONLY the
   * last-10 turns of the CURRENT conversation (client-supplied history);
   * there is NO search over past conversations. A benchmark turn in a fresh
   * session therefore retrieves NOTHING from this surface by construction —
   * that emptiness is itself the measured A0 behavior for episodic queries.
   */
  | 'episodic_conversation';

export const RETRIEVAL_SURFACES: readonly RetrievalSurface[] = [
  'personal_mind',
  'company_knowledge',
  'company_precedent',
  'canonical_facts',
  'unverified_claims',
  'company_state',
  'episodic_conversation',
];

/** Slice authorities that may carry COMPANY TRUTH (authority checks). */
export const TRUTH_BEARING_AUTHORITIES: readonly string[] = [
  'CANONICAL_FACT',
  'AUTHORITATIVE_OPERATIONAL_STATE',
  'COMPANY_KNOWLEDGE',
];

/** Advisory / labeled-context authorities (rendering here is legal). */
export const ADVISORY_AUTHORITIES: readonly string[] = [
  'PERSONAL_MIND_MEMORY',
  'HISTORICAL_PRECEDENT',
  'UNVERIFIED_CLAIM',
];

/** The eight benchmark categories (task M5.1 / M5 doc §7.2 BQ1–BQ8). */
export type BenchmarkCategory =
  | 'TEMPORAL'
  | 'CHANGE_DETECTION'
  | 'MULTI_HOP'
  | 'ENTITY_CENTRIC'
  | 'CONTRADICTION_SUPERSESSION'
  | 'EPISODIC'
  | 'PERSONAL_MEMORY'
  | 'COMPANY_AUTHORITY';

/** Failure class — the retrieval/generation/authority distinction (task §). */
export type FailureClass =
  /** Correct evidence was never retrieved (or retrieved too low to matter). */
  | 'RETRIEVAL'
  /** Unauthorized / superseded / lifecycle-ineligible evidence was used. */
  | 'AUTHORITY_LIFECYCLE'
  /**
   * Correct evidence was retrieved but a model produced a bad answer.
   * NOT MEASURABLE by this harness (no LLM in the loop) — kept in the type so
   * every report can state the three-way distinction explicitly.
   */
  | 'GENERATION';

/**
 * Gap taxonomy (task "GRAPH-SPECIFIC GAP DETECTION", options A–J).
 * A failure may carry several tags; `primaryGap` is the first applicable in
 * the fixed priority order implemented in classify.ts.
 */
export type GapTag =
  | 'A_lexical' // lexical scoring/limit miss though tokens overlap
  | 'B_semantic' // paraphrase/anaphora — zero lexical overlap
  | 'C_structured_filtering' // no query-conditioned filter on the surface
  | 'D_temporal_filtering' // needs as-of/window semantics that do not exist
  | 'E_entity_resolution' // entity pivot across stores not supported
  | 'F_graph_traversal' // multi-hop relationship traversal required
  | 'G_reranking' // retrieved but ranked below threshold/distractors
  | 'H_context_assembly' // retrieved in list, lost in render (budget/slice)
  | 'I_authorization' // scope/authorization leak
  | 'J_other'; // measured gap that fits none of the above

/** Temporal intent declared per query (drives temporal scoring + gaps). */
export type TemporalIntent =
  /** "What is currently true" — superseded evidence must not win. */
  | 'current'
  /** "What was true before / previous version" — history must be reachable. */
  | 'history'
  /** "What changed in window [from, to]" — change-set enumeration. */
  | 'window';

/** A single expected/forbidden evidence pointer on a surface. */
export interface EvidencePointer {
  surface: RetrievalSurface;
  evidenceKeys: string[];
}

export interface ForbiddenPointer extends EvidencePointer {
  reason: string;
  /**
   * When true → AUTHORITY-ONLY forbidden: retrieving/rendering as clearly
   * labeled advisory context is LEGAL (Personal Mind renders advisory by
   * design; claims render under EPISTEMIC WARNING); the violation is
   * appearing in a TRUTH-BEARING position (canonical fact slice, authoritative
   * state slice, knowledge slice).
   * When absent/false → HARD forbidden: must NOT be retrieved/rendered on
   * that surface at all (lifecycle/scope violations: superseded, pending,
   * rejected, other-founder, out-of-window).
   */
  authorityOnly?: boolean;
}

/**
 * Relationship chain declared for multi-hop queries. `anchors` are terms the
 * query itself can lexically reach; each `hops[]` entry is one required
 * traversal step the CURRENT architecture has no operator for. A record
 * containing BOTH the anchor terms and a hop's evidence terms would make the
 * hop lexically bridgeable — the fixture deliberately contains none.
 */
export interface RelationshipSpec {
  anchors: string[];
  hops: { evidenceKeys: string[]; depth: number }[];
}

export interface BenchmarkQuery {
  queryId: string;
  category: BenchmarkCategory;
  queryText: string;
  /** Human-readable intent (why this query exists in the suite). */
  rationale: string;
  /** Gold evidence per surface. Empty surface lists are skipped in scoring. */
  expected: EvidencePointer[];
  /** Evidence that must NOT be retrieved/used, with the failure it signals. */
  forbidden: ForbiddenPointer[];
  /** The authority domain the answer must resolve from (hard gate). */
  requiredAuthority:
    | 'company_brain_state'
    | 'company_brain_canonical_fact'
    | 'company_brain_knowledge'
    | 'company_brain_precedent'
    | 'personal_mind';
  temporal?: {
    intent: TemporalIntent;
    /** ISO window for CHANGE_DETECTION queries. */
    windowFrom?: string;
    windowTo?: string;
  };
  relationship?: RelationshipSpec;
  /**
   * Design expectation (from M5 doc §7.2) — which gap(s) this query is
   * expected to expose in A0. The classifier computes `measuredGap`
   * INDEPENDENTLY from behavior; the report shows both so the reader can see
   * expectation vs measurement, not a tautology.
   */
  expectedBehavior: string;
  expectedGaps: GapTag[];
}

/** Ranked retrieval outcome for one query on one surface. */
export interface SurfaceRetrieval {
  surface: RetrievalSurface;
  /** Runtime-resolved evidence keys in ranked order (1-based ranks). */
  retrieved: { evidenceKey: string; rank: number; score: number | null }[];
  /** Effective K for this surface in the production path (limit). */
  effectiveK: number;
  note?: string;
}

/** What the assembled context actually rendered for a query (e2e layer). */
export interface RenderOutcome {
  /** Fixture evidence keys whose identity fingerprint rendered anywhere. */
  renderedEvidenceKeys: string[];
  /** Which slice authorities each rendered evidence key appeared under. */
  renderedByAuthority: Record<string, string[]>;
  /** Which slices were present, with their authority labels. */
  slices: { label: string; authority: string }[];
  /** True when the personal-mind untrusted container was present. */
  personalMindContainerPresent: boolean;
  /** True when the epistemic-warning (unverified claims) block was present. */
  unverifiedClaimsWarningPresent: boolean;
}

export interface PerSurfaceMetrics {
  surface: RetrievalSurface;
  k: number;
  goldCount: number;
  retrievedCount: number;
  recallAtK: number;
  precisionAtK: number;
  /** Reciprocal rank of the FIRST gold item (null when no gold retrieved). */
  mrr: number | null;
}

export interface QueryMetrics {
  perSurface: PerSurfaceMetrics[];
  /** Gold items (any surface) present in the union of retrieved lists. */
  unionRecall: number;
  /** Gold items (any surface) that actually RENDERED in assemble() output. */
  renderRecall: number | null;
  /** 0/1 hard gates; null = check not applicable to this query. */
  authorityCorrect: 0 | 1 | null;
  temporalCorrect: 0 | 1 | null;
  supersessionCorrect: 0 | 1 | null;
  founderScopeCorrect: 0 | 1 | null;
  boundaryCorrect: 0 | 1 | null;
}

export interface FailureRecord {
  queryId: string;
  category: BenchmarkCategory;
  surface: RetrievalSurface | 'render';
  /** What went wrong, machine-readable. */
  kind:
    | 'GOLD_NOT_RETRIEVED'
    | 'GOLD_BEYOND_EFFECTIVE_K'
    | 'GOLD_NOT_RENDERED'
    | 'FORBIDDEN_RETRIEVED'
    | 'FORBIDDEN_RENDERED'
    | 'FORBIDDEN_AS_AUTHORITY'
    | 'SCOPE_LEAK';
  evidenceKey: string;
  failureClass: FailureClass;
  /** All applicable gap tags (deterministic rules, classify.ts). */
  gapTags: GapTag[];
  primaryGap: GapTag;
  /**
   * True only when the failure requires a relationship traversal that cannot
   * reasonably be represented/retrieved with the current relational/lexical
   * architecture (task's graph-candidate criterion). Requires F in gapTags.
   */
  graphCandidate: boolean;
  explanation: string;
}

export interface QueryResult {
  query: BenchmarkQuery;
  surfaces: SurfaceRetrieval[];
  render: RenderOutcome;
  metrics: QueryMetrics;
  failures: FailureRecord[];
}

export interface BenchmarkRunResult {
  /** Fixture digest (SHA-256 of the canonical fixture JSON). */
  fixtureDigest: string;
  /** Git baseline description (static string, no wall clock). */
  baseline: string;
  queries: QueryResult[];
  aggregate: {
    perCategory: Record<
      BenchmarkCategory,
      {
        queryCount: number;
        meanUnionRecall: number;
        meanRenderRecall: number | null;
        authorityCorrectCount: number;
        authorityApplicableCount: number;
        temporalCorrectCount: number;
        temporalApplicableCount: number;
        supersessionCorrectCount: number;
        supersessionApplicableCount: number;
        failureCount: number;
        failureClasses: Record<string, number>;
        primaryGaps: Record<string, number>;
        graphCandidateFailures: number;
      }
    >;
    overall: {
      queryCount: number;
      meanUnionRecall: number;
      meanRenderRecall: number | null;
      failureCount: number;
      graphCandidateFailures: number;
    };
  };
}
