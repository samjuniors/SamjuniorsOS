/**
 * ============================================================================
 * M5.1 — BENCHMARK QUERY REGISTRY (the eight categories, BQ1–BQ8)
 * ============================================================================
 * Every query declares:
 *   - gold evidence PER SURFACE (the authoritative evidence for the answer)
 *   - forbidden evidence (with the failure each hit would signal)
 *   - required authority domain, temporal intent, relationship chains
 *   - the design expectation (from M5 doc §7.2) vs what is MEASURED
 *
 * GOLD DISCIPLINE: a gold item means "a correct, provenance-complete answer
 * MUST be derivable from this evidence". It does NOT mean the item must be
 * ranked first — ranking is measured (MRR), not assumed.
 *
 * NOTE ON THE company_state SURFACE: slice 1 (financials + active
 * initiatives) renders UNCONDITIONALLY in A0 — it is not selected by the
 * query. State-surface gold therefore measures PRESENCE IN CONTEXT, not
 * query-driven retrieval; every result involving that surface is annotated
 * accordingly (see harness.ts notes and the benchmark doc §2).
 */

import type { BenchmarkQuery } from './types';

export const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  // =========================================================================
  // BQ1 — TEMPORAL
  // =========================================================================
  {
    queryId: 'BQ1a',
    category: 'TEMPORAL',
    queryText: 'What was our previous Lumora pricing strategy?',
    rationale:
      'As-of/previous-version semantics: the answer lives in superseded/old-version evidence.',
    expected: [
      { surface: 'company_knowledge', evidenceKeys: ['SOP-LUMORA-PRICING-V1'] },
      { surface: 'company_precedent', evidenceKeys: ['PREC-01'] },
      { surface: 'canonical_facts', evidenceKeys: ['FACT-OLD-01'] },
    ],
    forbidden: [],
    requiredAuthority: 'company_brain_knowledge',
    temporal: { intent: 'history' },
    expectedBehavior:
      'Knowledge v1 doc and the pricing precedent are lexically reachable (lumora/pricing tokens). ' +
      'The superseded canonical fact is structurally invisible: listActiveFacts() filters superseded ' +
      'facts and no as-of query exists.',
    expectedGaps: ['D_temporal_filtering'],
  },
  {
    queryId: 'BQ1b',
    category: 'TEMPORAL',
    queryText: 'When did we move Lumora to value-based pricing?',
    rationale: 'Point-in-time resolution: a WHEN question about a past transition.',
    expected: [
      { surface: 'company_precedent', evidenceKeys: ['PREC-01'] },
      { surface: 'company_knowledge', evidenceKeys: ['SOP-LUMORA-PRICING-V2'] },
      { surface: 'canonical_facts', evidenceKeys: ['FACT-CUR-01'] },
    ],
    forbidden: [],
    requiredAuthority: 'company_brain_precedent',
    temporal: { intent: 'history' },
    expectedBehavior:
      'PREC-01 carries the transition timestamp; KN-01 the ratification date; FACT-CUR-01 the promotion. ' +
      'Lexically reachable; measures whether the timestamps actually render with the evidence.',
    expectedGaps: [],
  },

  // =========================================================================
  // BQ2 — CHANGE DETECTION
  // =========================================================================
  {
    queryId: 'BQ2',
    category: 'CHANGE_DETECTION',
    queryText: 'What changed in company strategy during the last 3 months?',
    rationale:
      'Windowed change enumeration across stores. Window = 2026-06-25..2026-09-25 (frozen).',
    expected: [
      {
        surface: 'canonical_facts',
        evidenceKeys: [
          'FACT-CUR-01', // promoted 09-10 (in window)
          'FACT-OLD-01', // superseded 09-10 (in window) — the "from" side of the change
          'FACT-FIN-01', // promoted 09-12 (in window)
          'FACT-DEP-01', // promoted 08-20 (in window)
          'FACT-DEP-02', // promoted 08-22 (in window)
        ],
      },
      {
        surface: 'company_precedent',
        evidenceKeys: ['PREC-01', 'PREC-02', 'PREC-03', 'PREC-04', 'PREC-06'], // 09-02..08-28 (in window)
      },
      {
        surface: 'company_knowledge',
        evidenceKeys: ['SOP-LUMORA-PRICING-V2', 'SOP-LUMORA-PRICING-V1'], // version change in window
      },
      {
        surface: 'company_state',
        evidenceKeys: ['STATE-dec-pricing-value-based'], // decision recorded 09-02 (in window)
      },
    ],
    forbidden: [
      {
        surface: 'company_precedent',
        evidenceKeys: ['PREC-05'], // 2026-06-01 — OUTSIDE the window
        reason: 'Out-of-window precedent presented as a change.',
      },
      {
        surface: 'company_state',
        evidenceKeys: ['STATE-dec-office-lease'], // 2026-05-20 — OUTSIDE the window
        reason: 'Out-of-window decision presented as a change.',
      },
      {
        surface: 'unverified_claims',
        evidenceKeys: ['CLAIM-01'], // pending hypothesis, not a change
        reason: 'Pending claim enumerated as a change (epistemic boundary).',
        authorityOnly: true, // rendering under EPISTEMIC WARNING is legal; as FACT it is not
      },
    ],
    requiredAuthority: 'company_brain_canonical_fact',
    temporal: { intent: 'window', windowFrom: '2026-06-25T00:00:00.000Z', windowTo: '2026-09-25T00:00:00.000Z' },
    expectedBehavior:
      'No windowed change-set query exists in A0. Lexical probe on "changed/company/strategy/months" ' +
      'retrieves almost nothing gold; the fact slice renders top-3 newest regardless of the window; ' +
      'CompanyState decisions never render at all.',
    expectedGaps: ['D_temporal_filtering', 'C_structured_filtering'],
  },

  // =========================================================================
  // BQ3 — MULTI-HOP
  // =========================================================================
  {
    queryId: 'BQ3a',
    category: 'MULTI_HOP',
    queryText: 'Which services depend on the Helix Identity Store?',
    rationale:
      'Two-hop dependency chain: Helix Identity Store ← Aurorium Auth Service ← Nimbus Gateway. ' +
      'The query anchors on Helix; the transitive dependent (Nimbus Gateway) is only reachable ' +
      'through a traversal operator that does not exist in A0. No fixture record contains both ' +
      '"Nimbus Gateway" and "Helix Identity Store" (verified by the fixture integrity test).',
    expected: [
      {
        surface: 'canonical_facts',
        evidenceKeys: ['FACT-DEP-02', 'FACT-DEP-01'], // direct dependent + transitive dependent
      },
      { surface: 'company_precedent', evidenceKeys: ['PREC-04'] }, // Helix Analytics built on the store
    ],
    forbidden: [],
    requiredAuthority: 'company_brain_canonical_fact',
    relationship: {
      anchors: ['Helix Identity Store'],
      hops: [
        { evidenceKeys: ['FACT-DEP-02'], depth: 1 }, // store → Aurorium Auth
        { evidenceKeys: ['FACT-DEP-01'], depth: 2 }, // Aurorium Auth → Nimbus (transitive)
      ],
    },
    expectedBehavior:
      'FACT-DEP-02 (hop 1) lexically matches and is the 3rd-newest active fact, so it renders. ' +
      'FACT-DEP-01 (hop 2, Nimbus) shares zero tokens with the query and is the 4th-newest fact — ' +
      'unreachable without traversal. PREC-04 (Helix Analytics) matches lexically on the precedent surface.',
    expectedGaps: ['F_graph_traversal', 'C_structured_filtering'],
  },
  {
    queryId: 'BQ3b',
    category: 'MULTI_HOP',
    queryText: 'Which projects depend on the value-based pricing decision?',
    rationale:
      'Decision → project dependency. The edge exists ONLY as text inside the initiative objective ' +
      '(opaque CompanyState JSON); decisions themselves have no render slice at all.',
    expected: [
      { surface: 'company_state', evidenceKeys: ['STATE-dec-pricing-value-based', 'STATE-init-lumora-scale'] },
      { surface: 'company_precedent', evidenceKeys: ['PREC-01'] },
      { surface: 'company_knowledge', evidenceKeys: ['SOP-LUMORA-PRICING-V2'] },
    ],
    forbidden: [
      {
        surface: 'company_state',
        evidenceKeys: ['STATE-init-brand-refresh'],
        reason: 'Unrelated initiative presented as a dependent of the pricing decision.',
      },
    ],
    requiredAuthority: 'company_brain_state',
    relationship: {
      anchors: ['value-based pricing decision'],
      hops: [{ evidenceKeys: ['STATE-init-lumora-scale'], depth: 1 }],
    },
    expectedBehavior:
      'init-lumora-scale renders ONLY because slice 1 lists active initiatives unconditionally — ' +
      'not because any dependency semantics selected it. The decision record dec-pricing-value-based ' +
      'has no render path; the dependency edge is unqueryable text.',
    expectedGaps: ['F_graph_traversal', 'C_structured_filtering'],
  },

  // =========================================================================
  // BQ4 — ENTITY-CENTRIC
  // =========================================================================
  {
    queryId: 'BQ4',
    category: 'ENTITY_CENTRIC',
    queryText: 'Tell me everything relevant to Lumora right now.',
    rationale:
      'Entity pivot across all five stores. "Right now" requires active/current flagging and a ' +
      'label for unverified claims.',
    expected: [
      { surface: 'company_knowledge', evidenceKeys: ['SOP-LUMORA-PRICING-V2'] },
      { surface: 'canonical_facts', evidenceKeys: ['FACT-CUR-01'] },
      { surface: 'unverified_claims', evidenceKeys: ['CLAIM-01'] },
      { surface: 'company_precedent', evidenceKeys: ['PREC-01', 'PREC-03'] },
      { surface: 'company_state', evidenceKeys: ['STATE-init-lumora-scale'] },
    ],
    forbidden: [
      {
        surface: 'canonical_facts',
        evidenceKeys: ['FACT-OLD-01'],
        reason: 'Superseded fact presented as current entity truth for a "right now" question.',
      },
    ],
    requiredAuthority: 'company_brain_canonical_fact',
    temporal: { intent: 'current' },
    expectedBehavior:
      'Lexical "lumora" matches fire on knowledge/precedent surfaces but limit-2 truncates the set; ' +
      'the fact slice is unconditioned (top-3 newest — includes FACT-CUR-01 by luck of recency); ' +
      'CLAIM-01 renders only under the EPISTEMIC WARNING label; PM-09 (personal Lumora note) may ' +
      'render in the PERSONAL_MIND advisory container but never as company evidence.',
    expectedGaps: ['E_entity_resolution', 'C_structured_filtering'],
  },

  // =========================================================================
  // BQ5 — CONTRADICTION / SUPERSESSION
  // =========================================================================
  {
    queryId: 'BQ5a',
    category: 'CONTRADICTION_SUPERSESSION',
    queryText:
      'I previously said the Lumora Starter tier costs $29 per month, later we changed it. What is the currently true price?',
    rationale:
      'Contradiction resolution: both versions are quoted in the query; only the successor may be ' +
      'presented as current truth. The $29 anchor is a lexical trap pulling the OLD knowledge doc ' +
      'to the top of the knowledge slice.',
    expected: [
      { surface: 'canonical_facts', evidenceKeys: ['FACT-CUR-01'] },
      { surface: 'company_knowledge', evidenceKeys: ['SOP-LUMORA-PRICING-V2'] },
    ],
    forbidden: [
      {
        surface: 'canonical_facts',
        evidenceKeys: ['FACT-OLD-01'],
        reason: 'Superseded $29 fact presented as the currently true price.',
      },
      {
        surface: 'personal_mind',
        evidenceKeys: ['PM-09'],
        reason:
          'Personal Lumora journal note used as company pricing evidence (Personal Mind may render ' +
          'as advisory context but is never an authority source).',
        authorityOnly: true, // advisory rendering is by design; truth-bearing position is the violation
      },
    ],
    requiredAuthority: 'company_brain_canonical_fact',
    temporal: { intent: 'current' },
    expectedBehavior:
      'listActiveFacts() structurally excludes FACT-OLD-01 and FACT-CUR-01 is the 2nd-newest fact — ' +
      'current truth renders. However the knowledge slice scores the OLD doc (SOP-LUMORA-PRICING-V1) ' +
      'HIGHER than the current one (more token overlap with "$29"), so old-first ranking is expected.',
    expectedGaps: ['D_temporal_filtering', 'G_reranking'],
  },
  {
    queryId: 'BQ5b',
    category: 'CONTRADICTION_SUPERSESSION',
    queryText: 'How do I want strategy updates delivered these days?',
    rationale:
      'Personal-domain supersession: email (PM-05, SUPERSEDED) → dashboard (PM-06, ACTIVE). ' +
      '"These days" must resolve to the successor only.',
    expected: [{ surface: 'personal_mind', evidenceKeys: ['PM-06'] }],
    forbidden: [
      {
        surface: 'personal_mind',
        evidenceKeys: ['PM-05'],
        reason: 'Superseded email preference rendered for a "these days" question.',
      },
    ],
    requiredAuthority: 'personal_mind',
    temporal: { intent: 'current' },
    expectedBehavior:
      'M4-B.1 lifecycle filtering excludes SUPERSEDED records from the active pool; the M4-D fold ' +
      'lets "updates" match "updates". Expected PASS (the benchmark verifies it keeps passing).',
    expectedGaps: [],
  },

  // =========================================================================
  // BQ6 — EPISODIC
  // =========================================================================
  {
    queryId: 'BQ6a',
    category: 'EPISODIC',
    queryText: 'Why did we abandon the microservices refactor for Aurorium?',
    rationale: 'Anchored episodic query: the rationale lives in a precedent + a past conversation.',
    expected: [
      { surface: 'company_precedent', evidenceKeys: ['PREC-02'] },
      { surface: 'episodic_conversation', evidenceKeys: ['CONV-EP-01'] },
    ],
    forbidden: [],
    requiredAuthority: 'company_brain_precedent',
    expectedBehavior:
      'PREC-02 lexically matches (abandon/microservices/refactor/aurorium) and retrieves. ' +
      'CONV-EP-01 is unreachable: the canonical path loads only current-conversation history; ' +
      'no store offers past-conversation search.',
    expectedGaps: ['J_other'],
  },
  {
    queryId: 'BQ6b',
    category: 'EPISODIC',
    queryText: 'Why did we abandon that approach?',
    rationale:
      'Anaphoric episodic query ("that approach" has no lexical anchor). Measures what a bare ' +
      'follow-up question can and cannot retrieve.',
    expected: [
      { surface: 'company_precedent', evidenceKeys: ['PREC-02'] },
      { surface: 'episodic_conversation', evidenceKeys: ['CONV-EP-01'] },
    ],
    forbidden: [],
    requiredAuthority: 'company_brain_precedent',
    expectedBehavior:
      'The only surviving token with any anchor is "abandon", which uniquely matches PREC-02 — ' +
      'partial lexical luck. The conversational rationale stays unreachable; nothing can resolve ' +
      'the anaphora "that approach" structurally.',
    expectedGaps: ['B_semantic', 'J_other'],
  },

  // =========================================================================
  // BQ7 — PERSONAL MEMORY
  // =========================================================================
  {
    queryId: 'BQ7a',
    category: 'PERSONAL_MEMORY',
    queryText: 'What do you know about how I prefer to work?',
    rationale:
      'Personal Mind breadth query: all active work-style preferences for THIS founder, including ' +
      'one paraphrase-only memory, excluding every non-ACTIVE and other-founder record.',
    expected: [
      {
        surface: 'personal_mind',
        evidenceKeys: ['PM-01', 'PM-02', 'PM-03', 'PM-06', 'PM-07', 'PM-10'],
      },
    ],
    forbidden: [
      { surface: 'personal_mind', evidenceKeys: ['PM-04'], reason: 'PENDING_REVIEW content revealed.' },
      { surface: 'personal_mind', evidenceKeys: ['PM-05'], reason: 'SUPERSEDED content revealed.' },
      { surface: 'personal_mind', evidenceKeys: ['PM-08'], reason: 'REJECTED content revealed.' },
      { surface: 'personal_mind', evidenceKeys: ['PM-B1', 'PM-B2'], reason: 'Other founder data leaked.' },
    ],
    requiredAuthority: 'personal_mind',
    expectedBehavior:
      'Tier-1 matches only PM-01/PM-06 ("prefer" fold); PM-02/03/07/10 join via tier-2 fallback, so ' +
      'selection recall is high — but the 1200-char render budget keeps ~3 memories, so render ' +
      'recall is expected around half. PM-10 (paraphrase-only) never ranks above filler.',
    expectedGaps: ['B_semantic', 'H_context_assembly'],
  },
  {
    queryId: 'BQ7b',
    category: 'PERSONAL_MEMORY',
    queryText: 'What are my communication preferences right now?',
    rationale:
      'Type-scoped personal query. Gold is the two COMMUNICATION_PREFERENCE records; the "communication" ' +
      'token appears in NO memory content (structured filtering gap) while "prefer" matches other types.',
    expected: [{ surface: 'personal_mind', evidenceKeys: ['PM-02', 'PM-06'] }],
    forbidden: [
      { surface: 'personal_mind', evidenceKeys: ['PM-05'], reason: 'Superseded email preference.' },
      { surface: 'personal_mind', evidenceKeys: ['PM-B1'], reason: 'Other founder preference leaked.' },
    ],
    requiredAuthority: 'personal_mind',
    temporal: { intent: 'current' },
    expectedBehavior:
      'M4-D fold asymmetry: "preferences" folds to "preference" but memory contents contain ' +
      '"prefers"→"prefer" — these NEVER match (homograph protection), and no memory contains ' +
      '"communication". Tier-1 therefore matches NOTHING and the selection falls back to the ' +
      'unconditioned policy; memoryType is never used as a filter anywhere in the path. Gold ' +
      'renders only as far as the fallback order + 1200-char budget allow.',
    expectedGaps: ['C_structured_filtering', 'B_semantic'],
  },

  // =========================================================================
  // BQ8 — COMPANY AUTHORITY
  // =========================================================================
  {
    queryId: 'BQ8',
    category: 'COMPANY_AUTHORITY',
    queryText: "What is SamJuniors' current financial state?",
    rationale:
      'The authority hard gate: the ONLY acceptable sources are the canonical CompanyState ' +
      'financial model and the active financial canonical fact. Personal opinion (PM-11) and the ' +
      'pending claim (CLAIM-01) are boundary traps.',
    expected: [
      { surface: 'company_state', evidenceKeys: ['STATE-FIN-01'] },
      { surface: 'canonical_facts', evidenceKeys: ['FACT-FIN-01'] },
    ],
    forbidden: [
      {
        surface: 'canonical_facts',
        evidenceKeys: ['FACT-OLD-01'],
        reason: 'Superseded fact as current financial truth.',
      },
      {
        surface: 'personal_mind',
        evidenceKeys: ['PM-11'],
        reason:
          'Personal opinion about company finances used as company financial truth (AUTH-1: any ' +
          'answer citing Personal Mind for a company-domain question scores 0 on authority).',
        authorityOnly: true, // advisory rendering is by design; truth-bearing position is the violation
      },
    ],
    requiredAuthority: 'company_brain_state',
    temporal: { intent: 'current' },
    expectedBehavior:
      'Slice 1 renders the canonical financial model UNCONDITIONALLY (not query-conditioned) and ' +
      'FACT-FIN-01 is the newest active fact — so the numbers reach the model with correct authority. ' +
      'PM-11 may render in the PERSONAL_MIND advisory container (allowed) but never as evidence.',
    expectedGaps: [],
  },
];
