# M5.1 Memory Retrieval Benchmark

**Status**: IMPLEMENTED — baseline A0 measured and recorded.
**Branch**: `feat/m51-retrieval-benchmark` (base: `docs/m5-memory-agent-architecture-evaluation` @ `83e00fa`, whose tree equals `origin/main` @ `b9e63ad` — the verified M4-D state — plus the M5 evaluation document).
**Harness**: `benchmark/memory-retrieval/` · **Self-tests**: `tests/sophia/m51_benchmark.test.ts` (30/30 green).
**Predecessor**: `docs/architecture/M5_MEMORY_AGENT_ARCHITECTURE_EVALUATION.md` (§7 specified this benchmark; §15 proposed it as task M5.1).

---

## 1. Objective

Create a **deterministic, repeatable benchmark** that measures what the
EXISTING M4 memory/retrieval architecture (baseline **A0**) can and cannot
retrieve, so the next architecture decision (PostgreSQL-native retrieval
improvement, and only conditionally any graph layer) can be made from
**measured evidence** instead of vendor claims or intuition.

The benchmark answers, with numbers:

1. What can M4 retrieve correctly today?
2. Where does lexical retrieval fail?
3. Where is semantic retrieval required?
4. Where are temporal queries insufficient?
5. Where do entity-centric queries fail?
6. Where do multi-hop relationship queries fail?
7. Where does provenance/authority fail?
8. Where does Personal Mind vs Company Brain separation fail?
9. What exact failures could justify a future associative/temporal graph layer?

It does **not** assume Graphiti (or any graph) is the answer. It was built to
make that question decidable later, on evidence.

### Non-goals (enforced by construction)

- No Graphiti, Neo4j, FalkorDB, or any graph database.
- No pgvector / FTS / PostgreSQL retrieval implementation (baseline first).
- No replacement or modification of the current memory system — **zero
  `src/` files were changed** to build this harness.
- No LLM output treated as authoritative company truth — no LLM is called
  anywhere in the harness.

## 2. Baseline Architecture

Verified by direct inspection of `b9e63ad` (the FIRST task requirement) before
any code was written. The architecture **matches** the M5 evaluation document;
two nuances are recorded below.

The canonical Sophia turn assembles context through eight slices
(`src/lib/server/sophia/context-assembly.ts`). The retrieval surfaces the
benchmark exercises are exactly those:

| Surface | Code path | Conditioning | Effective K |
|---|---|---|---|
| `personal_mind` | `SophiaMemoryStore.listAllMemories(founder, {active:true})` → `selectPersonalMindMemories(pool, message)` (M4-C two-tier + M4-D fold & score bands) | lexical, folded tokens | 20 (render budget 1200 chars) |
| `company_knowledge` | `CompanyKnowledgeStore.queryKnowledge({queryText, limit:2})` | lexical (exact tokens, `matchedTerms×2 + category + role`) | 2 |
| `company_precedent` | `CompanyMemoryStore.queryMemories({queryText, limit:2})` → `OperationalLearningLoop.retrieveRelevantMemories` | lexical (keyword overlap ×20 + category bonus ×25, strict zero-match exclusion) | 2 |
| `canonical_facts` | `EpistemicClaimStore.listActiveFacts()` → slice 4A renders first 3 | **NOT query-conditioned** — promotedAt DESC | 3 |
| `unverified_claims` | pending claims over `listClaims()` → slice 4B under EPISTEMIC WARNING | **NOT query-conditioned** | 3 |
| `company_state` | `CompanyStateStore.getFinancialMetrics()` + active initiatives → slice 1 | **NOT query-conditioned** — renders unconditionally | 3 initiatives + metrics |
| `episodic_conversation` | — (only current-conversation, client-supplied, last-10-turn history) | **no surface exists** | 0 |

Supporting machinery verified: M4-B.1 lifecycle (5 states, founder-only
transitions, supersession pointers, append-only `metadata.lifecycle.transitions`
audit — `memory-lifecycle.ts`, `personal-memory-store.ts`), M4-A capture/gate
(REJECT|NEEDS_REVIEW only), the authority-content guard, founder scoping
(fail-closed 403), the epistemic source→claim→verification→fact chain with
`markFactSuperseded`, and DurableFileStore-authoritative persistence.

**Nuances vs the M5 document** (reported per the task's instruction):

1. M5 doc §7.2 BQ1 lists "CompanyState financialModel history" as gold.
   CompanyState has **no history** — it is a single current blob
   (`state-store.ts` keeps one `financialModel`, `persistState` overwrites).
   The fixture therefore cannot contain it; the absence is itself a recorded
   structural fact (any "what changed in financials" query has nothing to
   read).
2. `tests/sophia/m4c_retrieval_evaluation.test.ts` (the M4-D evidence suite
   cited by the architecture doc) remains absent from the tree — confirmed.
   This harness is its committed successor.

## 3. Benchmark Dataset

A small, fully synthetic universe in
`benchmark/memory-retrieval/fixture.ts` — **no fabricated production facts**;
all entities (Lumora, Aurorium, Nimbus Gateway, Helix Analytics, Helix
Identity Store, Aurorium Auth Service) and all numbers are invented for
measurement. Fixture digest (SHA-256, printed with every run):

```
40e53f1581def28371af8f050bc5ba85eaf58a47cbb86a4f449fad1beef719fb
```

| Corpus | Records | Notes |
|---|---|---|
| Personal memories (SophiaMemory) | 13 | founder A: 8 ACTIVE + PENDING_REVIEW + SUPERSEDED + ARCHIVED + REJECTED (all 5 lifecycle states); founder B: 2 (isolation) |
| Company knowledge | 6 | pricing v2 (current) + v1 (retired), runbooks/specs, a support-"tiers" lexical trap |
| Company precedents | 6 | pricing switch, microservices abandonment, dependency builds, out-of-window decoy, discount-freeze lexical trap |
| Canonical facts | 5 | incl. a real supersession chain ($29 → $49) and a 2-hop dependency chain |
| Epistemic claims | 3 | 1 pending (trap), 2 promoted (lineage of the facts) |
| Evidence sources | 2 | provenance chain for the pricing facts |
| CompanyState | 3 initiatives + 2 decisions + financial model | decisions: 1 in-window, 1 out-of-window |
| Past conversation | 1 (4 messages) | the episodic abandonment rationale |

Required dataset properties (asserted by self-tests F3–F9):

- **Multiple timestamps** across a frozen timeline (2026-05-12 … 2026-09-25).
- **Old and new facts**: pricing v1→v2 (knowledge), $29→$49 (facts, real
  `markFactSuperseded` at seed time), email→dashboard (personal, real M4-B.1
  transition at seed time).
- **Superseded facts** with successor pointers on both the fact store and the
  personal store.
- **Related projects and decisions** with evidence references.
- **Evidence/provenance** everywhere (sources, claimIds, evidenceReferences,
  provenance strings incl. `conversation:<id>`).
- **Personal memories AND company facts**, with two deliberate boundary traps
  (PM-09 "personal Lumora pricing notes"; PM-11 "personal opinion about
  company finances").
- **Intentionally similar lexical wording**: the support-escalation SOP shares
  `lumora`/`tiers`/`policy` tokens with pricing queries; PREC-06 (discount
  freeze) shares `lumora`/`pricing` with the pricing-switch precedent.
- **Intentionally different wording, same meaning**: PM-10 ("keeps replies
  tight and terse when tired") vs "how I prefer to work" — asserted ZERO
  folded-token overlap (F7).
- **At least one contradiction**: $29 (superseded fact) vs $49 (current fact);
  email vs dashboard preference.
- **At least one multi-hop chain with no lexical bridge**: Nimbus Gateway →
  Aurorium Auth Service → Helix Identity Store. Self-test F4 asserts NO
  fixture record contains tokens of both endpoints.
- **Every gold answer identifies its authoritative evidence** (per-query
  gold pointers per surface; §5).

Seeding goes **through the real store APIs** (`seed.ts`): personal memories via
`createMemory` + governed `updateMemory` transitions, the fact supersession via
`markFactSuperseded`, state via the documented durable seed shape — so the
fixture state on "disk" is produced by production code paths, not fixture
fiat. The CLI runs in an isolated scratch directory
(`$TMPDIR/samjuniors-m51-benchmark`) and wipes it on entry — it cannot pollute
the repository's `.data` (an earlier draft did; the isolation was added and
verified against the M1 suite).

## 4. Query Categories

Thirteen queries across the eight required categories
(`benchmark/memory-retrieval/queries.ts`):

| ID | Category | Query |
|---|---|---|
| BQ1a | TEMPORAL | "What was our previous Lumora pricing strategy?" |
| BQ1b | TEMPORAL | "When did we move Lumora to value-based pricing?" |
| BQ2 | CHANGE_DETECTION | "What changed in company strategy during the last 3 months?" (frozen window 2026-06-25…2026-09-25) |
| BQ3a | MULTI-HOP | "Which services depend on the Helix Identity Store?" (2-hop chain) |
| BQ3b | MULTI-HOP | "Which projects depend on the value-based pricing decision?" |
| BQ4 | ENTITY_CENTRIC | "Tell me everything relevant to Lumora right now." |
| BQ5a | CONTRADICTION/SUPERSESSION | "I previously said the Lumora Starter tier costs $29 per month, later we changed it. What is the currently true price?" |
| BQ5b | CONTRADICTION/SUPERSESSION | "How do I want strategy updates delivered these days?" (personal supersession) |
| BQ6a | EPISODIC | "Why did we abandon the microservices refactor for Aurorium?" (anchored) |
| BQ6b | EPISODIC | "Why did we abandon that approach?" (anaphoric — the task's exact wording) |
| BQ7a | PERSONAL MEMORY | "What do you know about how I prefer to work?" |
| BQ7b | PERSONAL MEMORY | "What are my communication preferences right now?" |
| BQ8 | COMPANY AUTHORITY | "What is SamJuniors' current financial state?" |

Every query records: query text, category, gold evidence IDs per surface,
forbidden evidence IDs (with the failure each hit signals, and whether the
forbidden is *hard* — must never appear — or *authority-only* — may render as
labeled advisory context but never in a truth-bearing position), required
authority domain, temporal intent (`current`/`history`/`window` + window
bounds), relationship depth (for multi-hop), expected retrieval behavior
(design hypothesis), and expected gaps (the hypothesis the MEASURED gaps are
compared against — the classifier never sees them).

## 5. Gold-Standard Evidence

Gold = "a correct, provenance-complete answer must be derivable from this
evidence on this surface." Examples (full sets in `queries.ts`):

- **BQ1a** gold: `SOP-LUMORA-PRICING-V1` (knowledge — the retired policy
  doc), `PREC-01` (precedent — the switch decision with outcome), and
  `FACT-OLD-01` (canonical facts — the superseded $29 fact, i.e. the
  authoritative record of the previous price).
- **BQ8** gold: `STATE-FIN-01` (CompanyState financial model — the only
  canonical financial source) + `FACT-FIN-01` (active financial fact);
  forbidden: superseded financial facts, the pending ARR claim as truth, and
  PM-11 (personal opinion) as company evidence (authority-only forbidden).
- **BQ7a** gold: the six ACTIVE work-style memories of founder A; forbidden:
  the PENDING_REVIEW, SUPERSEDED, REJECTED records and both founder-B records
  (hard forbidden).
- **BQ3a** gold: `FACT-DEP-02` (direct dependent), `FACT-DEP-01` (transitive
  dependent at declared hop depth 2), `PREC-04` (Helix Analytics built on the
  store).

The benchmark tests **retrieval, not invention**: the harness never asks a
model to answer; it measures exactly which evidence the canonical context
assembly would surface for the query.

## 6. Metrics

Per query × surface (`metrics.ts`, pure functions pinned by hand-computed
tests M1–M5):

- **Recall@K** — K = the surface's production effective K (§2 table); facts
  and claims lists are recorded in full so beyond-K misses remain visible and
  classifiable.
- **Precision@K** — gold fraction of the retrieved window (distractors count
  against it; for the personal surface the tier-2 fallback fill is by design
  and is annotated as such).
- **MRR** — reciprocal rank of the first gold item per surface.
- **Union recall** — gold items (any surface) present at rank ≤ K on their
  surface: what a generation layer would actually have had to work with.
- **Render recall** — gold items that actually rendered inside
  `SophiaContextAssembler.assemble()` output (identity fingerprints per slice
  authority): the e2e layer, including slice budgets and truncation.
- **Correctness gates** (0/1, null when vacuous): authority-correctness,
  temporal-correctness, supersession-correctness, founder-scope-correctness,
  Personal-vs-Company boundary-correctness (§8–§9).

Latency is NOT measured: the harness is a single deterministic process;
wall-time would measure Bun startup, not retrieval. Deferred to a load-test
harness (§14).

## 7. Retrieval vs Generation Failure

The harness contains **no model call**, so it structurally cannot produce
GENERATION-class failures. The three-way distinction is enforced in the data
model and every report:

- **RETRIEVAL failure** — the correct evidence was never retrieved (or ranked
  beyond the effective K): all 14 measured baseline failures are this class.
- **AUTHORITY/LIFECYCLE failure** — unauthorized, superseded, or
  lifecycle-ineligible evidence was retrieved or rendered in a truth-bearing
  position, or scope/boundary leakage occurred: **zero measured** in A0.
- **GENERATION failure** — correct evidence was in context but a model
  produced a bad answer: **unmeasurable here by design**; self-test D6 asserts
  the harness can never emit this class, and every report footer states it.
  Measuring it requires a separate generation-side harness (§14).

A key implication for reading the results: **recall/rank numbers here are the
ceiling for answer quality** — a generation layer consuming this exact
context cannot answer better than what was retrieved.

## 8. Authority / Lifecycle Checks

- **Authority-correctness** (hard gate, per M5 doc AUTH-1): the answer's
  evidence must come from the authoritative surface; any personal-mind content
  in a truth-bearing position, any pending claim as fact, or answering a
  company question solely from non-authoritative material scores 0. Vacuous
  (nothing retrieved) → null, not 0 — "honest failure" territory.
- **Lifecycle enforcement** (measured, not assumed): PENDING_REVIEW /
  SUPERSEDED / ARCHIVED / REJECTED personal memories must never enter the
  ACTIVE pool or render; superseded facts must never appear in `listActiveFacts`
  or render as current truth; predecessors must not be presented as current.
- **Supersession-correctness**: for every declared pair
  (FACT-OLD-01→FACT-CUR-01, PM-05→PM-06): successor present AND predecessor
  absent from eligible truth positions.
- **Founder-scope**: founder A's retrieval contains no founder-B records
  (checked on every query), and a direct cross-founder `getMemory` probe must
  fail closed (403).

**Measured (A0): 10/10 authority, 13/13 founder-scope, 9/9 supersession,
0 authority/lifecycle failures.** The M4 governance invariants hold under this
workload — the failures are all retrieval-side.

## 9. Personal vs Company Boundary Checks

Structural, per query: personal evidence (PM-*) must never render under a
truth-bearing authority (CANONICAL_FACT / AUTHORITATIVE_OPERATIONAL_STATE /
COMPANY_KNOWLEDGE); company evidence must never render inside the
`<personal_memory_context>` untrusted container. Advisory rendering of
personal content (including the two deliberate traps PM-09/PM-11 inside the
PERSONAL_MIND container) is by-design behavior, not a violation — the
authority-only forbidden semantics encode exactly this.

**Measured (A0): 13/13 boundary-correct.** Notably, the PM-09/PM-11 traps did
render as advisory context for company queries (as the architecture intends) —
the boundary held structurally in every case.

## 10. Graph-Specific Failure Criteria

A failure is flagged **graph-candidate** ONLY when ALL hold (deterministic
rules, `classify.ts`; self-tests CL3/CL4 pin both polarities):

1. the query declares a relationship hop at **depth ≥ 2** for the missed
   evidence;
2. **single-shot lexical overlap** between the query and the evidence text is
   zero (no direct retrieval is possible even with perfect lexical scoring);
3. the failure class is RETRIEVAL (not an authority violation).

A failure is **never** tagged F merely because the query mentions
relationships — the traversal requirement is checked against the declared
chain and measured token overlap, not assumed. The fixture guarantees the
criterion is testable: no record bridges both endpoints of the 2-hop chain.

**Measured (A0): exactly 1 graph-candidate failure** — `FACT-DEP-01` (the
Nimbus Gateway transitive dependency) in BQ3a. §12.5 analyzes whether it
actually justifies a graph layer (short answer: not yet — a 2-hop lexical
bridge exists through FACT-DEP-02, and the fact surface is not even
query-conditioned yet).

## 11. Baseline Results

Recorded run (regenerable: `bun run benchmark/memory-retrieval/run.ts`;
full detail in `benchmark/memory-retrieval/results/baseline-a0.{json,md}`):

- 13 queries · **14 failures — all RETRIEVAL class** · 0 authority/lifecycle ·
  1 graph-candidate.
- Overall mean union recall **0.80**; mean render recall **0.80** (render ≡
  union at this scale — nothing was lost between selection and render except
  where retrieval itself failed).

| Category | Queries | Union recall | Render recall | Authority | Temporal | Supersession | Failures |
|---|---|---|---|---|---|---|---|
| TEMPORAL | 2 | 83% | 83% | 2/2 | 1/2 | 2/2 | 1 |
| CHANGE_DETECTION | 1 | **31%** | 31% | 1/1 | **0/1** | 1/1 | **9** |
| MULTI_HOP | 2 | **71%** | 71% | 2/2 | n/a | n/a | 2 |
| ENTITY_CENTRIC | 1 | 100%* | 100% | 1/1 | 1/1 | 1/1 | 0 |
| CONTRADICTION/SUPERSESSION | 2 | 100% | 100% | 1/1 | 2/2 | 2/2 | 0 |
| EPISODIC | 2 | **50%** | 50% | 2/2 | n/a | n/a | 2 |
| PERSONAL_MEMORY | 2 | 100%* | 100% | n/a | 1/1 | 2/2 | 0 |
| COMPANY_AUTHORITY | 1 | 100%* | 100% | 1/1 | 1/1 | 1/1 | 0 |

(*) scale-sensitive passes — see §12.8.

**Primary gap distribution (14 failures):** B_semantic ×6 ·
C_structured_filtering ×3 · D_temporal_filtering ×2 · J_other (no episodic
surface) ×2 · F_graph_traversal ×1.

Selected per-query anchors (full tables in the results file):

- BQ1a: knowledge Recall@2 = 100% (MRR 1.0 — the retired v1 doc ranks FIRST),
  precedent Recall@2 = 100%, facts Recall@3 = **0%** (FACT-OLD-01 structurally
  invisible) → union 67%.
- BQ2: 4/13 gold (three facts by recency + one knowledge doc); all five
  in-window precedents missed (zero lexical overlap with
  "changed/company/strategy/months"); the in-window decision record has no
  render path → union 31%.
- BQ5a: gold retrieved, **but the knowledge MRR is 0.50 — the RETIRED v1
  policy outranks the current v2** for the "currently true price" query
  (the "$29" anchor gives the old doc more token overlap).
- BQ7b: personal MRR 0.50 — "communication preferences" matches NOTHING in
  tier 1 (fold asymmetry: `preferences`→`preference` but `prefers`→`prefer`,
  by homograph protection), so selection falls to the unconditioned
  fallback; memoryType is never used as a filter.

## 12. Failure Analysis

### 12.1 Temporal (D ×2) — superseded truth is unreachable

`listActiveFacts()` filters superseded facts and **no as-of / previous-version
operator exists anywhere**. For "what was our previous pricing strategy",
the old *policy documents and the precedent* happen to survive textually
(knowledge/precedent surfaces), but the authoritative record of the previous
price (FACT-OLD-01) is invisible to every surface. History questions are
answerable only by luck of surviving prose, never from the governed chain —
even though the chain (`supersededById` + promotedAt timestamps) fully
exists in the data model.

### 12.2 Change detection (B ×6, C ×2, D ×1 within BQ2's 9 failures) — no windowed change-set operator

"What changed in the last 3 months" retrieves 4/13 gold: the three newest
facts render only because the facts slice is unconditioned, and one knowledge
doc matches the word "company". All five in-window precedents share **zero
tokens** with the query; the decision record has **no render path at all**
(CompanyState decisions are opaque JSON with no slice); CompanyState has no
financial history to diff. There is no mechanism to enumerate
promotions/supersessions/decisions in a time window.

### 12.3 Episodic (J ×2) — no past-conversation retrieval surface

The abandonment rationale exists verbatim in a past conversation
(CONV-EP-01) with **lexical overlap 3** against BQ6a — and no code path can
reach it: the canonical turn loads only the current conversation's last-10
client-supplied turns. The precedent PREC-02 partially rescues the answer
(50% recall) precisely because it duplicates the rationale in its outcome
text. The anaphoric variant (BQ6b, "that approach") still retrieves PREC-02
through the single surviving token "abandon" — lexical luck, not resolution.

### 12.4 Structured filtering (C ×3) — unconditioned and opaque surfaces

(a) The facts slice renders the **3 newest** facts regardless of the query —
FACT-DEP-01 (rank 4 by recency) is unreachable for the Helix question even
before traversal is considered. (b) CompanyState **decisions never render
anywhere**. (c) Slice 1 renders metrics + top-3 active initiatives
**unconditionally** — BQ8's "pass" is presence-by-construction, not query
understanding.

### 12.5 The single graph-candidate failure — honest scope

FACT-DEP-01 (Nimbus Gateway → Aurorium Auth → Helix Identity Store, hop
depth 2) failed with zero single-shot lexical overlap. **This does NOT yet
justify a graph layer**, for three measured reasons:

1. The intermediate hop (FACT-DEP-02) shares "Aurorium Auth Service" tokens
   with both endpoints — a **2-step lexical expansion** (retrieve DEP-02,
   re-query with its terms) would reach it; no persistent edge store is
   required to close this gap.
2. The fact surface is not even query-conditioned (C) — until facts can be
   selected by relevance, traversal quality is unmeasurable.
3. The edges themselves are **prose** ("depends on …") inside fact
   statements — an explicit `dependency` relation over existing rows (a
   relational column or join table) represents this chain without any graph
   database, consistent with the M5 evaluation's derived-index rule.

Graphiti-class tooling becomes a candidate only if, after the §13 experiment,
the multi-hop class still fails AND dependency/entity queries become
product-critical for the founder.

### 12.6 Ranking inversions (measured, no hard failure)

The retired v1 pricing doc outranks the current v2 for both "right now"
(BQ4) and "currently true" (BQ5a) questions — knowledge MRR 0.50 both times.
Lexical overlap cannot express temporal currency. Similarly BQ7b's type-scoped
question falls to the unconditioned fallback because the M4-D fold
deliberately never matches `preferences`↔`prefers` (homograph protection).

### 12.7 Precision observations

Personal-surface precision is 13–75% (tier-2 fallback fills by design —
contextual noise, not a correctness bug); BQ3a's knowledge window is 100%
distractor (the Helix data contract matched "helix"). These quantify the
context pollution a generation layer must resist.

### 12.8 Scale sensitivity — what this benchmark can NOT yet claim

The corpus is deliberately small. Three "passes" are scale-limited:

- **BQ4 (entity-centric) 100%**: only 6 knowledge docs and 6 precedents
  exist, FACT-CUR-01 happens to be the 2nd-newest fact, and the initiative
  renders unconditionally. Adding a handful of Lumora-mentioning docs would
  push gold out of the limit-2 windows.
- **BQ7 (personal) 100%**: 8 active memories all fit the 20-cap and the
  1200-char render budget, so tier-2 fallback masks paraphrase misses for
  RECALL — the semantic weakness shows only in RANK (PM-10 at 8/8 for
  BQ7a). The starvation regime (>20 active) is pinned by the existing m4c
  C4/H9 cap tests, not by this fixture.
- **Render ≡ union recall**: at this scale nothing retrieved was lost in
  render; H_context_assembly did not manifest.

A scale-expanded fixture (100+ memories/docs) is deferred work (§14); the
mechanism-level numbers above are the valid claims of THIS run.

## 13. Recommended Next Experiment

Ranked by measured failure weight, smallest-first, all reversible, all
rerunnable against THIS benchmark unchanged:

1. **M5.2 hygiene (unconditional)** — route `queryKnowledge` through the
   authoritative read path (the self-documented cache gap in
   `knowledge-store.ts`) and add the minimal retrieval-decision audit, per
   M5 doc R2. Both are prerequisites for the benchmark's numbers to govern a
   production retrieval change.
2. **M5.3 — the smallest PostgreSQL-native retrieval improvement** (the task
   explicitly defers implementation to a future task): per the measured gap
   order (B ×6 → C ×3 → D ×2), the candidate set is, in order of leverage:
   (a) query-conditioned fact/claim slices (fixes C at its root —
   `tsvector`-style filtering over canonical tables), (b) an **as-of /
   supersession-history read API** over the existing `supersededById` chains
   (fixes D relationally — no graph needed: the chain already exists in the
   data), (c) hybrid lexical+semantic retrieval for the paraphrase class
   (embeddings as retrieval index only, never canonical truth). Rerun exactly
   this benchmark after each increment.
3. **Episodic surface (small, relational)** — a bounded past-conversation
   search over ConversationStore (fixes J ×2; the gold conversations already
   lexically overlap the queries).
4. **Decision visibility (small)** — render or expose CompanyState decisions
   through a governed query API (fixes the C-class decision invisibility).
5. **Graph layer: NOT NOW.** One graph-candidate failure, 2-hop,
   lexically-bridgeable, blocked behind an unconditioned surface (§12.5).
   Re-evaluate only after M5.3 reruns this benchmark.

## 14. Explicitly Deferred Work

- **No PostgreSQL/pgvector/FTS implementation** — this task establishes the
  baseline only; M5.3 is a separate future task that must rerun this exact
  benchmark.
- **No Graphiti / Neo4j / FalkorDB / any graph database** — not installed,
  not prototyped, not evaluated in code.
- **No production memory semantics changed** — zero `src/` modifications;
  the M4 architecture is preserved exactly.
- **No generation-side evaluation** — answer-quality (GENERATION failures)
  requires a separate LLM-in-the-loop harness with its own governance;
  this harness states the class explicitly instead of conflating it.
- **No scale-expanded fixture** — the current fixture measures mechanisms;
  a 100+ record corpus (and with it H_context_assembly/starvation
  measurements) is future work; partial coverage exists in m4c cap tests.
- **No latency measurement** — meaningless in a single-process deterministic
  CLI; belongs to a load-test harness over the real API surface.

---

## Appendix A — How to reproduce

```bash
bun run benchmark/memory-retrieval/run.ts          # human summary + results files
bun run benchmark/memory-retrieval/run.ts --json   # JSON to stdout
bun run tests/sophia/m51_benchmark.test.ts          # 30 self-tests (incl. byte-identical rerun)
```

Deterministic: no clock reads in results; the scratch data dir is wiped on
entry; two consecutive runs are byte-identical (self-test D2).

## Appendix B — Test execution record (this task)

| Suite | Result |
|---|---|
| `tests/sophia/m51_benchmark.test.ts` (NEW) | **30 passed, 0 failed** |
| `tests/sophia/m0_idempotency_expiry.test.ts` | 7 passed, 0 failed |
| `tests/sophia/m1_canonical_state_authority.test.ts` | 7 passed, 0 failed |
| `tests/sophia/m2_knowledge_persistence.test.ts` | 8 passed, 0 failed |
| `tests/sophia/m3_authority_hardening.test.ts` | 10 passed, 0 failed |
| `tests/sophia/m3_conversation_convergence.test.ts` | 14 passed, 0 failed |
| `tests/sophia/k2_personal_memory.test.ts` | 20 passed, 0 failed |
| `tests/sophia/m4a_memory_capture.test.ts` | 46 passed, 0 failed |
| `tests/sophia/m4a_hardening.test.ts` | 22 passed, 0 failed |
| `tests/sophia/m4b1_lifecycle.test.ts` | 20 passed, 0 failed |
| `tests/sophia/m4c_query_conditioned_retrieval.test.ts` | 27 passed, 0 failed |
| `tests/sophia/phase2_grounding_context.test.ts` | 12 passed, 0 failed (final run)* |

\* Environment note: phase2 tests 6/7 depend on live intent-classification
(no SDK mock; the worktree carries no `.DATABASE_URL`/LLM env). One earlier
run in this environment showed 11/12 with test 6 failing on a
`approval_action` vs `ambiguous` classification; the deterministic
entity-resolver assertions passed throughout. The canonical m51-relevant
memory suites (M0–M4-D) are fully deterministic and green.

**Environment limitations**: local persistence mode only (no DATABASE_URL —
Prisma mirrors skipped, exactly like production local mode); the benchmark
CLI runs in `$TMPDIR/samjuniors-m51-benchmark` (repository `.data` untouched —
verified by re-running the M1 suite after a benchmark run).
