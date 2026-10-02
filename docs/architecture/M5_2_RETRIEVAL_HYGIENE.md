# M5.2 Retrieval Hygiene

**Status**: IMPLEMENTED — all six fix classes landed; benchmark rerun measured (A0 → A1).
**Branch**: `feat/m52-retrieval-hygiene` (base: `feat/m51-retrieval-benchmark` @ `b9d1504` — the M5.1 baseline evidence).
**Predecessor**: `docs/architecture/M5_1_MEMORY_RETRIEVAL_BENCHMARK.md` (the measured failures this task fixes).
**New tests**: `tests/sophia/m52_retrieval_hygiene.test.ts` (25/25 green).
**Graph decision (recorded per task)**: *Graph layer currently not justified by benchmark evidence.*

---

## 1. Baseline

- **Code baseline**: M5.1 tree @ `b9d1504` (= `origin/main` @ `b9e63ad` / M4-D + the M5 evaluation document + the M5.1 benchmark). Verified in-worktree before any change: the M5.1 benchmark reproduced **byte-identically** (14 failures, 1 graph candidate, union recall 0.7993, fixture digest `40e53f15…`, `git status` clean after the rerun).
- **Measurement baseline**: `benchmark/memory-retrieval/results/baseline-a0.{json,md}` — IMMUTABLE. The CLI now writes labeled reruns (`results/run-a1.{json,md}`, `--label` flag) and can never overwrite the A0 evidence.
- **What the baseline measured (A0, 13 queries)**: 14 failures, ALL class `RETRIEVAL`, ZERO `AUTHORITY_LIFECYCLE` — authority 10/10, founder scope 13/13, boundary 13/13, supersession 9/9, temporal 6/8. M4 governance invariants held; the retrieval contract did not.
- Every production code path was re-inspected personally before modification (no reliance on prior reports): `context-assembly.ts`, `knowledge-store.ts`, `claim-store.ts`, `state-store.ts`, `conversation/store.ts`, `memory-store.ts` + `learning-loop.ts`, the full benchmark harness, and the M4 test pins.

## 2. Failure → Root Cause Map

The complete mapping the task required (M5.1 failure → current code path → root cause → smallest fix), before any fix was written:

| # | M5.1 failure (query / evidence) | Code path (A0) | Root cause | Smallest fix (shipped) |
|---|---|---|---|---|
| 1 | BQ1a · FACT-OLD-01 (D_temporal) | slice 4A → `listActiveFacts()` | Superseded facts structurally invisible to every canonical read; no history intent routing | `queryFacts({includeSuperseded})` + HISTORY-intent `SUPERSEDED_FACT` projection (§4) |
| 2 | BQ2 · FACT-OLD-01 (D_temporal) | same | same + no windowed change enumeration | superseded-pair entry in the `CHANGE_RECORD` block (§7) |
| 3 | BQ2 · FACT-DEP-01 (C_structured) | slice 4A renders top-3 newest regardless of query | facts slice unconditioned | two-tier conditioned facts slice (§5) + change enumeration |
| 4–8 | BQ2 · PREC-01/02/03/04/06 (B_semantic ×5) | slice 5B → `queryMemories` strict zero-overlap exclusion | "What changed…" shares zero tokens with any precedent text | in-window precedent enumeration by stored `timestamp` in `CHANGE_RECORD` (§7) |
| 9 | BQ2 · SOP-LUMORA-PRICING-V2 (B_semantic) | slice 5A → `queryKnowledge` limit 2 | version transitions are not enumerable events | knowledge version-family enumeration in `CHANGE_RECORD` (§7) |
| 10 | BQ2 · STATE-dec-pricing-value-based (C_structured) | slice 1 — **no decision render path existed** | decisions stored in `CompanyStateStore` but never projected into context | query-conditioned decision sub-block in slice 1 + in-window decision enumeration (§5) |
| 11 | BQ3a · FACT-DEP-01 (F_graph_traversal — **the only graph candidate**) | slice 4A (rank 4 > K=3) | 2-hop dependency with zero single-shot lexical overlap; no traversal operator | **NOT FIXED — honestly remains** (§11, §12) |
| 12 | BQ3b · STATE-dec-pricing-value-based (C_structured) | same as #10 | same | same |
| 13 | BQ6a · CONV-EP-01 (J_other) | **no episodic retrieval surface existed** | canonical path reads only current-conversation client-supplied history | `ConversationStore.searchConversations` + `EPISODIC_MEMORY` slice (§8) |
| 14 | BQ6b · CONV-EP-01 (J_other) | same + zero unfolded overlap | same + "abandon" vs "abandoning" fold miss | same + symmetric M4-D fold on the episodic scorer (§6, §8) |

Ranking inversions (measured, no hard failure in A0): retired v1 pricing doc outranked current v2 for BQ4/BQ5a (knowledge MRR 0.50) → CURRENT-intent currentness ranking + RETIRED render label (§4); BQ7b "communication preferences" tier-1 matched nothing → memoryType type-token conditioning (§6).

## 3. Canonical Retrieval Path

**Callers audited** (every retrieval entry point in `src/`, verified by search, not assumed):

| Entry point | Callers | Status after M5.2 |
|---|---|---|
| `CompanyKnowledgeStore.queryKnowledge` | Sophia `context-assembly.ts` slice 5A (canonical turn path); agent-side `context/context-assembly.ts` + `context-retrieval.ts` (agent execution pipeline) | **Canonical company-knowledge retrieval entry point.** M5.2 closed the self-documented authority gap: the candidate set is now ALWAYS `getAllKnowledge()` — the same fail-closed authoritative read `getAllKnowledge`/`getKnowledgeById` already used (Prisma table in authoritative mode; the coherent cache in local mode). Fail-closed propagation on authoritative-mode DB failure is intentional; both caller pipelines degrade fail-soft. |
| `CompanyMemoryStore.queryMemories` | Sophia slice 5B; agent context pipeline | Canonical precedent retrieval — unchanged |
| `EpistemicClaimStore.listActiveFacts` | Sophia slice 4A; `server-gateway` (display); epistemic `board`/`pipeline` (promotion pipeline); `graph/read-model` (projection); `api/epistemic` (list endpoint) | Unchanged. The promotion pipeline and projections keep the unconditioned subject/category semantics they govern on. |
| `EpistemicClaimStore.queryFacts` **(NEW)** | Sophia slice 4A + the 4A2 historical projection | Canonical query-conditioned fact retrieval, both store modes share one deterministic ranker (`rankFactsForQuery`) |
| `CompanyStateStore.queryState` | agent context pipeline only | Existing structured state query — NOT wired into the Sophia slice (a full reuse would drag product/customer noise into the turn; slice 1 got the minimal decision projection instead) |
| `SophiaMemoryStore.listAllMemories` + `selectPersonalMindMemories` | Sophia slice 6B | Canonical Personal Mind selection — M4-C/M4-D machinery preserved; M5.2 adds type-token conditioning (§6) |
| `ConversationStore.searchConversations` **(NEW)** | Sophia slice 7A | Canonical episodic retrieval (§8) |

**Authority boundaries** (documented, enforced by slice authority labels): truth-bearing positions remain exactly `CANONICAL_FACT` (active facts only), `AUTHORITATIVE_OPERATIONAL_STATE` (metrics/initiatives/query-matched decisions), `COMPANY_KNOWLEDGE`. Everything new renders under advisory labels (`SUPERSEDED_FACT`, `CHANGE_RECORD`, `EPISODIC_MEMORY`).

**Audit behavior**: every retrieved item carries deterministic provenance (match reason, source ids, timestamps rendered with the evidence); assembly outages append to `degradedStores`; the A1 benchmark itself is the per-slice audit of what each query retrieves and renders. (A dedicated retrieval-decision audit store is deferred — §13.)

**Founder scoping**: Personal Mind and episodic retrieval read ONLY the authenticated founder's records (`listAllMemories(founder)`, `listConversations(founder)`); cross-founder reads fail closed (403, pinned by M3/K-2 and re-measured by the benchmark's probe).

**Lifecycle enforcement**: `validityState`/`lifecycleState` remain the ONLY eligibility authorities — no new path can mutate them, and superseded/pending/rejected/archived records stay out of every truth-bearing position (pinned by tests A1/A8 and the benchmark's supersession gates).

## 4. Current vs Historical Semantics

Deterministic temporal intent detection (`src/lib/server/retrieval/temporal-semantics.ts` — pure regex cue lists, precedence **WINDOW > CURRENT > HISTORY > UNSPECIFIED**; the CURRENT-over-HISTORY precedence handles messages that quote both sides of a supersession, e.g. *"I previously said $29 … what is the currently true price?"* → CURRENT).

- **CURRENT** — `queryKnowledge` ranks non-retired documents above retired/superseded ones regardless of lexical score (the $29-trap inversion fix), and slice 5A renders retired documents with an explicit `[HISTORICAL — retired/superseded document; verify against current policy]` label. Retired documents are never deleted or hidden — they are ordered and labeled.
- **HISTORY** — slice 4A2 renders lexically-matched **superseded** facts under the new `SUPERSEDED_FACT` authority (NOT truth-bearing) with the successor pointer rendered explicitly (`"…" (Superseded by [FACT-…])`). Historical evidence is therefore reachable exactly when explicitly requested, and can never silently become current truth: the `CANONICAL_FACT` slice still renders active facts only.
- **WINDOW** — the `CHANGE_RECORD` block enumerates in-window change events (§7).
- **UNSPECIFIED** — every ranking behaves exactly as in A0 (M4-D). Cue-less queries are unchanged; the currentness demotion is strictly intent-gated (pinned by test K3 against the A0 order).

Provenance and lifecycle metadata are preserved everywhere: supersession pointers, promotedAt dates, retired markers, decision dates all render with their evidence.

## 5. Structured Slice Conditioning

- **Facts slice (4A) — now two-tier, the M4-C Personal Mind philosophy applied to facts**: tier 1 = `queryFacts` lexical matches (shared `extractTokens` pipeline; score DESC, promotedAt DESC, id ASC); tier 2 = newest-active fill to the slice width; zero matches = the exact A0 top-3-newest projection (never-empty). The fill preserves the A0 breadth that the benchmark's supersession gate measures (the successor stays in context even when a query matches only the predecessor's domain — this was caught by the first A1 run, where BQ8's supersession gate flipped until the fill was added).
- **State decisions — the missing render projection**: slice 1 renders query-matched decisions (top 2, over title/recommendation/category/impact/evidence) under the existing `AUTHORITATIVE_OPERATIONAL_STATE` authority. **Strict match-only**: unmatched queries render no decisions, and WINDOW-intent queries render none either (their decision surface is the date-filtered change record) — an unconditional "recent decisions" block measurably admitted the out-of-window forbidden decision in the first A1 run (`dec-office-lease` matched "months" in "last 3 months" vs "12 months lease"); the window gate closes exactly that trap.
- **Unverified claims slice (4B)**: deliberately left unconditioned (deferred — §13). It renders only under the `EPISTEMIC WARNING` label, and the benchmark showed no measured failure that claims conditioning would fix.

## 6. Query Normalization

Implemented — deterministic only, all of it:

1. **Token normalization** — the shared `extractTokens` pipeline (lowercase, strip non-alphanumeric except `_-`, stop words, >2 chars) remains THE tokenizer for every surface, including all new paths.
2. **Suffix normalization** — the M4-D `foldPersonalMindToken` (guarded, homograph-protected) now ALSO applies symmetrically on the episodic scorer, so "abandon" matches "abandoning" (the BQ6b case). The shared Company Brain tokenizer stays byte-identical (pinned by H12).
3. **Structured-field (controlled-vocabulary) normalization** — the Personal Mind's `memoryType` (a store-validated member of the `SOPHIA_MEMORY_TYPES` allow-list) joins the foldable content-side token set (`COMMUNICATION_PREFERENCE` → `communication`, `preference`). This closes the M5.1-measured BQ7b gap ("the 'communication' token appears in NO memory content; memoryType is never used as a filter anywhere in the path") — the stored structured field is now matchable. MRR 0.50 → 1.00.
4. **Entity/subject normalization** — fact subjects tokenize with underscores as spaces (`lumora_pricing` → `lumora pricing`), so stored subject identifiers are reachable from natural language (this is what makes BQ8's `financial_state` fact tier-1 match "financial state").
5. **Version-family normalization** — knowledge titles strip parenthetical/version suffixes to a family slug ("Lumora Pricing Policy (Cost-Plus, v1)" ≡ "(Value-Based, v2)"), powering the version-transition enumeration.

**No LLM, embedding, or statistic participates anywhere in retrieval.** Nothing semantic beyond the above is claimed.

## 7. Temporal Semantics

The data already contained sufficient temporal information (promotedAt, precedent timestamps, lastVerifiedDate, decision dates, supersession pointers); the query semantics did not exist. M5.2 adds the smallest deterministic set:

- **Current state** — intent-gated currentness ranking (§4).
- **Previous state** — HISTORY intent + `includeSuperseded` fact retrieval (§4).
- **Before/after/during interval** — the `CHANGE_RECORD` block: parses the window ("last N months/weeks/days/quarters", "past few …", default 3), computes the window **data-anchored**: `windowTo = max(wall clock, newest recorded event)`, `windowFrom = windowTo − duration`. Production turns get true wall-clock windows; a dataset whose newest event postdates the clock (frozen/simulated corpora, clock skew) anchors to the data instead of silently enumerating nothing. Determinism note: the anchor only decides which STORED events fall inside the window; no clock value enters any benchmark result (byte-identical reruns asserted).
- **Changed between two points** — the enumeration covers: active facts promoted in window; superseded facts whose **successor** was promoted in window (the supersession event carries no stored timestamp of its own — the successor's promotion date is the only deterministic anchor and is rendered AS such, never invented); precedents recorded in window; current knowledge verified in window plus retired family members rendered as explicit version-transition pairs; decisions dated in window. Bounded at 16 entries / 2100 chars, rendered under the advisory `CHANGE_RECORD` authority with every entry citing the authoritative record id.

## 8. Episodic Retrieval

The canonical `ConversationStore` already contained the evidence; only the retrieval path was missing. Added `searchConversations(founderId, queryText, limit)`:

- **Founder-scoped by construction** (candidates come from the founder-owned `listConversations` read — another founder's conversations can never enter; pinned by test E1).
- **Deterministic scoring**: shared tokenizer + symmetric M4-D fold; conversation score = Σ per-message distinct-token scores; rank score DESC, updatedAt DESC, id ASC (pinned E3).
- **Conversation boundaries and timestamps preserved**; matched messages render chronologically (pinned E4).
- Renders as the advisory `EPISODIC_MEMORY` slice (interaction records — **never company truth**; promotion of conversation content into company knowledge remains an explicit governed action in the epistemic pipeline). Bounded: top 3 conversations, 4 matched messages each, 600 chars.
- **Personal Mind / Company Brain separation preserved**: the episodic slice is founder-scoped advisory context, exactly like `PERSONAL_MIND_MEMORY`; it never enters a truth-bearing position (pinned A8).

Both M5.1 episodic failures (BQ6a anchored, BQ6b anaphoric-via-fold) now retrieve; episodic MRR — → 1.00 on both.

## 9. Governance Preservation

Re-measured, not assumed (A1 benchmark + suites):

| Invariant | A0 | A1 |
|---|---|---|
| Authority correctness | 10/10 | **10/10** |
| Founder scope | 13/13 (+ 403 probe) | **13/13** (+ 403 probe) |
| Personal Mind / Company Brain boundary | 13/13 | **13/13** |
| Supersession | 9/9 | **9/9** |
| Temporal | 6/8 | **8/8** |
| AUTHORITY_LIFECYCLE failures | 0 | **0** |

Mechanism-level guarantees (beyond the benchmark): superseded facts render only under `SUPERSEDED_FACT`/`CHANGE_RECORD` (never `CANONICAL_FACT` — pinned A1/A8); pending claims still render only under `EPISTEMIC WARNING`; personal memories only inside the escaped untrusted container (M4-A hardening untouched); lifecycle state machines, append-only audits, deterministic transitions, and fail-closed behavior are untouched code paths (all M4 suites green). One regression was caught and fixed DURING the task by the benchmark itself: the first A1 run admitted the out-of-window forbidden decision via a spurious lexical match — fixed by the window-intent decision gate (§5), and the A1 final run records zero forbidden hits.

## 10. Before/After Benchmark

**Benchmark integrity**: `fixture.ts`, `queries.ts` (gold sets), `metrics.ts`, `classify.ts` are byte-identical to b9d1504. Fixture digest unchanged (`40e53f15…`). Three documented maintenance changes, none of which weaken a gold set:

1. **evaluate.ts measurement-consistency correction (a benchmark correction, not a success)**: failure records now recognize render-reachability exactly as the evaluator's own `goldHits` definition always has (retrieved-within-K on the declared surface OR rendered). **Proven A0-invariant**: all 14 A0 failures were also unrendered in the A0 run (verified against the committed baseline JSON before shipping) — this changes zero A0 numbers; it only lets post-M5.2 render paths (historical projection, change enumeration) be measured honestly instead of recording phantom retrieval failures for evidence a generation layer could already consume.
2. **harness.ts rewiring**: the retrieval battery mirrors the canonical path where M5.2 changed the path's entry points (facts → `queryFacts` two-tier; state → metrics + query-matched decisions + initiatives in render order; episodic → `searchConversations`) — same limits, same order, no gold touched.
3. **run.ts plumbing**: run-labeled result files so the committed A0 evidence is never overwritten; m51 self-test D4's known-bad pins updated to the new measured state (A0 pins preserved in the committed baseline evidence; D5 zero-authority-failure pin unchanged and green).

| Metric (13 queries) | A0 (b9d1504) | A1 (M5.2) |
|---|---|---|
| Failures | 14 | **1** |
| — RETRIEVAL class | 14 | 1 |
| — AUTHORITY_LIFECYCLE class | 0 | **0** |
| Graph-candidate failures | 1 | 1 (same one) |
| Mean union recall | 0.7993 | **0.8955** |
| Mean render recall | 0.7993 | **0.9744** |
| Authority / temporal / supersession / founder / boundary | 10/10 · 6/8 · 9/9 · 13/13 · 13/13 | **10/10 · 8/8 · 9/9 · 13/13 · 13/13** |
| Primary gap distribution | B×6, C×3, D×2, J×2, F×1 | **F×1** |

Per-category (union → render): TEMPORAL 83%→83%/100% · CHANGE_DETECTION 31%→31%/**100%** · MULTI_HOP 71%→83%/83% · ENTITY_CENTRIC 100%/100% · CONTRADICTION_SUPERSESSION 100%/100% · EPISODIC 50%→**100%**/100% · PERSONAL_MEMORY 100%/100% · COMPANY_AUTHORITY 100%/100%.

MRR where applicable (gold rank movements): BQ1b facts 0.50→1.00 · BQ3a facts 0.33→1.00 · BQ4 knowledge 0.50→**1.00** · BQ4 facts 0.50→1.00 · BQ5a knowledge 0.50→**1.00** · BQ5a facts 0.50→1.00 · BQ6a/b episodic —→1.00 · BQ7b personal 0.50→**1.00**. (One benign MRR dip: BQ4 company_state 0.50→0.33 — the query-matched decision now precedes the gold initiative, which stays within K at rank 3 with 100% recall.)

**The 14 baseline failures — disposition (the task's most important table):**

| A0 failure | Disposition | Why |
|---|---|---|
| 1. BQ1a FACT-OLD-01 (D_temporal) | **DISAPPEARED** | HISTORY intent → superseded fact renders under `SUPERSEDED_FACT` with successor pointer; temporal history gate 0→1 |
| 2. BQ2 FACT-OLD-01 (D_temporal) | **DISAPPEARED** | superseded-pair enumeration in the change record |
| 3. BQ2 FACT-DEP-01 (C_structured) | **DISAPPEARED** | in-window promotion enumerated in the change record |
| 4–8. BQ2 PREC-01/02/03/04/06 (B_semantic ×5) | **DISAPPEARED** | in-window precedent enumeration by stored timestamp (lexical matching deliberately not required for change sets) |
| 9. BQ2 SOP-LUMORA-PRICING-V2 (B_semantic) | **DISAPPEARED** | knowledge version-transition enumeration |
| 10. BQ2 STATE-dec-pricing-value-based (C_structured) | **DISAPPEARED** | in-window decision enumeration |
| 11. BQ3a FACT-DEP-01 (F_graph_traversal) | **REMAINS** | 2-hop dependency, zero single-shot lexical overlap, no traversal operator — by design (no graph layer, §12) |
| 12. BQ3b STATE-dec-pricing-value-based (C_structured) | **DISAPPEARED** | query-matched decision projection in slice 1 |
| 13. BQ6a CONV-EP-01 (J_other) | **DISAPPEARED** | episodic retrieval surface (lexical overlap 3 now reachable) |
| 14. BQ6b CONV-EP-01 (J_other) | **DISAPPEARED** | episodic retrieval + symmetric fold ("abandon"↔"abandoning") |

**Honesty note on BQ2's union recall (31%)**: the per-surface lexical battery still cannot answer "what changed" (union counts battery retrieval only); the change enumeration is a render-path capability — render recall for BQ2 is 100%. The union-vs-render divergence is reported, not hidden: it says single-shot lexical retrieval cannot enumerate windowed change sets, while a deterministic date-filtered enumeration can.

## 11. Remaining Failures

**Exactly one: BQ3a · FACT-DEP-01 (RETRIEVAL class, primary gap F_graph_traversal, graph candidate).**

- Query: *"Which services depend on the Helix Identity Store?"* — gold chain: FACT-DEP-02 (Aurorium Auth → Helix Identity Store, hop 1, now rank 1 on the conditioned facts slice) and FACT-DEP-01 (Nimbus Gateway → Aurorium Auth, hop 2 — the transitive dependent).
- FACT-DEP-01 shares zero tokens with the query and no fixture record bridges both endpoints (fixture integrity F4). Post-M5.2 the conditioned facts slice retrieves hop 1 first (MRR 0.33→1.00) but hop 2 remains unreachable without a traversal operator.
- Secondary residuals (measured, documented, below the failure threshold): BQ2 union recall (above); BQ6b's anaphora ("that approach") is solved only because "abandon" survives the fold — a fully anaphoric follow-up with no surviving content token would still miss (B_semantic, M5.3 territory); BQ7a's paraphrase-only PM-10 still ranks via fallback (rank 8/8 — render recall holds at this corpus size); the personal-surface precision remains context noise by design (tier-2 fallback).

## 12. Graph-Specific Evidence

Recorded per the task: **"Graph layer currently not justified by benchmark evidence."**

- M5.1 produced exactly one graph candidate (BQ3a FACT-DEP-01, 2-hop) and explicitly found it **lexically bridgeable** through the FACT-DEP-02 intermediate once the facts surface became query-conditioned — M5.2 shipped exactly that conditioning (hop 1 now retrieves at rank 1). What remains is the hop-2 traversal itself, whose edges exist as prose inside fact statements; M5.1 already noted an explicit `dependency` relation over existing rows would represent the chain without any graph database.
- A1's gap distribution is F×1 — one failure, 2-hop, with a documented relational representation path. Nothing in the A0→A1 evidence requires graph traversal infrastructure, and the architecture stays extensible: the stores are row-shaped, the authority classes are orthogonal to storage, and a future associative layer could be added behind `queryFacts` without touching governance.
- Re-evaluate only if a future benchmark (post-M5.3) shows multi-hop failures that are NOT lexically bridgeable and NOT representable relationally.

## 13. Deferred Work

- **No PostgreSQL / pgvector / tsvector / FTS** — explicitly out of scope (M5.3's task, which must rerun this benchmark).
- **No Graphiti, no graph database, no graph traversal** — not installed, not prototyped (§12).
- **No semantic/embedding retrieval** — the paraphrase class (BQ7a PM-10 rank, fully-anaphoric follow-ups) is unmeasurable-to-fix lexically; that is M5.3's measured decision to make.
- **Unverified-claims slice conditioning** — deferred deliberately (no measured failure motivates it; claims render only under EPISTEMIC WARNING).
- **Dedicated retrieval-decision audit store / TurnStopwatch wiring** — the M5 doc R2 alternate branch; current audit behavior (provenance on every item, degradedStores, the benchmark itself) is documented in §3, but a persisted per-turn retrieval audit record remains future work.
- **Initiative status changes are not enumerated change events** — the change record covers facts/precedents/knowledge/decisions; initiative transitions lack a stored event timestamp and need a state-history design (deferred with CompanyState history, per the M5.1 finding that CompanyState is a single current blob).
- **Scale expansion** — the M5.1 scale caveats still apply unchanged.

## 14. Next Experiment

**M5.3 — the smallest PostgreSQL-native retrieval improvement** (a separate task, gated on these A1 numbers):

1. **As-of / supersession-history read API over the existing `supersededById` chains** — the D-class is closed at the projection level, but a first-class temporal read (effective-date semantics) is the relational continuation; rerun this benchmark unchanged.
2. **Hybrid lexical+semantic retrieval for the paraphrase/anaphora class** (embeddings as retrieval index only, never canonical truth) — the measured residue (PM-10 rank, anaphoric BQ6b variants) is exactly this class.
3. **Explicit dependency relations over existing rows** (relational column or join table for the FACT-DEP class) — the honest candidate for the one remaining failure; still NO graph database required.
4. Only then, and only if a genuine non-bridgeable multi-hop gap survives: re-open the Graphiti question with benchmark evidence.

Every step reruns this exact benchmark (fixture and gold sets untouched); every step is reversible; governance invariants are regression gates, not aspirations — as demonstrated in this task, where the benchmark caught a would-be authority regression before it shipped.

---

## Appendix A — How to reproduce

```bash
bun run benchmark/memory-retrieval/run.ts            # A1 human summary → results/run-a1.{json,md}
bun run benchmark/memory-retrieval/run.ts --json     # A1 JSON to stdout (byte-deterministic)
bun run tests/sophia/m52_retrieval_hygiene.test.ts   # 25 self-tests (temporal/facts/knowledge/episodic/e2e/governance)
bun run tests/sophia/m51_benchmark.test.ts           # 30 benchmark self-tests (incl. byte-identical rerun)
```

The A0 baseline: `git show b9d1504:benchmark/memory-retrieval/results/baseline-a0.json` (or the committed file on this branch — untouched).

## Appendix B — Test execution record (this task)

| Suite | Result |
|---|---|
| `tests/sophia/m52_retrieval_hygiene.test.ts` (NEW) | **25 passed, 0 failed** |
| `tests/sophia/m51_benchmark.test.ts` (updated D4 pins) | **30 passed, 0 failed** |
| `tests/sophia/m0_idempotency_expiry.test.ts` | 7 passed, 0 failed |
| `tests/sophia/m1_canonical_state_authority.test.ts` | 7 passed, 0 failed |
| `tests/sophia/m2_knowledge_persistence.test.ts` | 8 passed, 0 failed |
| `tests/sophia/m3_authority_hardening.test.ts` | 10 passed, 0 failed |
| `tests/sophia/m3_conversation_convergence.test.ts` | 14 passed, 0 failed (one transient live-LLM 429 retried green; the suite's tests 6/7 depend on live intent classification — documented environment nondeterminism, unchanged from M5.1) |
| `tests/sophia/k2_personal_memory.test.ts` | 20 passed, 0 failed |
| `tests/sophia/m4a_memory_capture.test.ts` | 46 passed, 0 failed |
| `tests/sophia/m4a_hardening.test.ts` | 22 passed, 0 failed |
| `tests/sophia/m4b1_lifecycle.test.ts` | 20 passed, 0 failed |
| `tests/sophia/m4c_query_conditioned_retrieval.test.ts` | **27 passed, 0 failed** (all M4-C/M4-D selection pins hold under the type-token conditioning) |
| `tests/sophia/phase2_grounding_context.test.ts` | 12 passed, 0 failed |
| `tests/scheduler/phase4_4e_epistemic.test.ts` (`bun test`) | 10 passed, 0 failed |
| `bun run lint` | clean (exit 0) |
| `bunx tsc --noEmit` | 155 errors — ALL pre-existing at baseline (verified by diff against the b9d1504 tree: identical after line-number shifts; zero new errors introduced) |

**Environment limitations** (unchanged from M5.1): local persistence mode only (no DATABASE_URL / authoritative Postgres in this sandbox), so the authoritative-mode branches (`PostgresEpistemicStore.queryFacts`, `queryKnowledge`'s authoritative routing) are verified by code inspection + the local-mode shared-ranker tests, not by a live authoritative-mode run. Live-LLM-dependent suites intermittently hit provider 429s in this environment (transient; deterministic suites unaffected).
