# M5.3 — PostgreSQL-Native Retrieval Experiment

**Branch:** `feat/m53-postgres-retrieval-experiment` (base: `feat/m52-retrieval-hygiene` @ `a349205`; not pushed, not merged)
**Experiment question:** *How much of SamJuniors' required memory/retrieval workload can be solved with a PostgreSQL-native architecture — before a graph system becomes necessary?*
**Not the question:** *How do we install Graphiti?* (No graph database was installed; no vector database was installed; no external retrieval service was introduced; no LLM-authoritative retrieval exists anywhere in this work.)

The experiment ran in three independently measured stages against the **frozen** M5.1/M5.2 benchmark (fixture digest unchanged in every run: `40e53f15…`):

| Stage | Scope | Benchmark label | Code state |
|---|---|---|---|
| **M5.3-A** | Authoritative as-of / supersession read API | `run-a2` | supersededAt column + shared read model + lineage + `queryFacts(asOf)` |
| **M5.3-B** | PostgreSQL-native hybrid retrieval (evaluation) | `run-a2b` | **no code change** — measured decision to defer (§5) |
| **M5.3-C** | Explicit dependency relations | `run-a3` | `dependency_relations` table + deterministic extraction + bounded depth-2 traversal + render slice |

---

## 1. Baseline

- **M4-D:** `b9e63ad` — the verified M4 state (M5.1's A0 baseline).
- **M5.1:** `b9d1504` — benchmark harness; A0 = **14 failures**, union recall **0.7993**, render recall **0.7993**, temporal 6/8, authority 10/10, founder 13/13, boundary 13/13, supersession 9/9. Gap distribution: B_semantic×6, C_structured_filtering×3, D_temporal×2, J_episodic×2, F_graph_traversal×1.
- **M5.2:** `a349205` — retrieval hygiene; A1 = **1 failure** (BQ3a, the 2-hop graph candidate), union recall **0.8955**, render recall **0.9744**, temporal 8/8, all governance gates green (unchanged or improved from A0).
- **Environment (verified, not assumed):** this sandbox has **no PostgreSQL server** (`psql` absent; no server packages) and the Prisma datasource is the documented **SQLite port of the upstream PostgreSQL schema** (`prisma/schema.prisma` header; `DATABASE_URL=file:…`). The governed SDK (`z-ai-web-dev-sdk`) exposes **no embedding API** (chat / vision / TTS / ASR / image / video / web-search / page-reader only — verified in `dist/` and the README). These facts drive §5.

**Verification method for this task:** every claim above was re-derived from the repository itself (code reads + benchmark runs), not from prior reports; the A1 state was reproduced before any change was made.

---

## 2. M5.3-A Design — Authoritative As-Of / Supersession Read API

The task-required chain, **current source of truth → PostgreSQL representation → read API → retrieval caller → context assembly**:

| Layer | Before M5.3-A (verified in code) | M5.3-A |
|---|---|---|
| Source of truth | `CanonicalFact` rows: `statement`, `subject`, `category`, `validityState`, `supersededById` (self-relation), `promotedAt`, `promotedBy`, `provenance`. **The supersession event TIME was not recorded anywhere** — `markFactSuperseded` mutated `validityState` + `supersededById` only. No as-of operator existed; reads were `listActiveFacts` (CURRENT) and `listAllFacts` (active+superseded, unordered truth position). | Same rows **plus `supersededAt`** (additive; PostgreSQL target `TIMESTAMPTZ`) — the lifecycle event time, recorded by `markFactSuperseded` as: explicit caller time → successor's `promotedAt` → wall clock (in that deterministic preference order). |
| PostgreSQL representation | Relational only; no extensions, no vectors. | Still **plain relational filters** (`validityState`, `promotedAt <= T`, `supersededAt` null/`> T`), expressible identically on PostgreSQL and the SQLite port. |
| Read API | none (two ad-hoc list methods + `queryFacts` with `includeSuperseded`). | **`readFacts({ mode: CURRENT \| HISTORICAL \| AS_OF, asOf, category?, subject? })`** and **`getFactLineage(factId)`** (bounded successor/predecessor chain, cycle-safe, ≤ 32 nodes) on `IEpistemicClaimStore`, implemented in BOTH store modes over ONE shared pure eligibility core (`src/lib/server/retrieval/fact-read-model.ts`) — the same dual-mode discipline as M5.2's shared ranker. |
| Retrieval caller | `queryFacts({ queryText, limit, includeSuperseded })`. | `queryFacts` gains optional **`asOf`**: eligibility flows through the shared read model (CURRENT default; `includeSuperseded` → HISTORICAL pool; `asOf` → AS_OF pool); ranking unchanged. Default behavior byte-identical. |
| Context assembly | Slice 4A (query-conditioned facts, active only), 4A2 (SUPERSEDED_FACT historical projection, HISTORY intent), 3B (CHANGE_RECORD window enumeration). | **Unchanged by design** (see below) — the render path already saturates the benchmark's temporal surface; M5.3-A is a store-level contract, not a render change. |

**AS_OF semantics (pinned by tests R3–R6):** a fact is truth at instant T iff `promotedAt <= T` AND (no supersession event OR `supersededAt > T`). Half-open interval `[promotedAt, supersededAt)`. A superseded fact with **unknown** event time (legacy pre-M5.3-A row) is **excluded** from AS_OF truth reads — fail-closed: we cannot prove it was current at T — but remains fully available to HISTORICAL reads. Lifecycle authority is untouched: `validityState` remains the only truth-bearing eligibility rule; AS_OF never resurrects a fact as *current* truth, it answers *what was truth then*.

**Do-not-duplicate check:** `supersededAt` is lifecycle metadata on the authoritative row itself (not a second store of truth); `readFacts`/`getFactLineage` are read projections only — no write path, no truth mutation.

## 3. M5.3-A Results

**Benchmark (run-a2, fixture digest unchanged):** per-query metrics, failure sets, and every gate **byte-identical to A1** — 1 failure (BQ3a), union recall 0.8955, render recall 0.9744, authority 10/10, temporal 8/8, supersession 9/9, founder 13/13, boundary 13/13. **Exactly which failures changed: none.**

**STOP-rule checkpoint (per task: "If M5.3-A does not materially improve the benchmark, STOP and document why before continuing").** Documented reasons:

1. M5.2 already closed the entire D_temporal class **at the render-path level** (SUPERSEDED_FACT projection for history questions, CHANGE_RECORD for windows, history-intent `includeSuperseded` retrieval). The frozen benchmark's temporal gate is 8/8 and its supersession gate 9/9 — there is no failing temporal query left for an as-of operator to fix.
2. No benchmark query exercises an as-of **timestamp** operator: BQ1b ("When did we move…") is a change-point question satisfied by the change record; BQ1a is a history question satisfied by the historical projection. The as-of capability is real production contract hardening (previously, "what was true on 2026-08-01?" had *no* correct answer at any layer, and supersession timing was not even recorded), but it is invisible to a benchmark whose temporal surface was already saturated.
3. **Why the experiment continues anyway (justified, not assumed):** the sole remaining failure (BQ3a) is a *multi-hop dependency* failure — a class M5.3-A was never aimed at and cannot touch. The next stage (M5.3-C) targets exactly that failure, and the task's own graph-decision gate prescribes analyzing remaining failures *after* M5.3-C. M5.3-A is not dead weight under M5.3-C: the dependency layer reuses the same provenance/lifecycle/event-time discipline (edges carry `observedAt = sourceFact.promotedAt`; supersession flips edge status out of the CURRENT pool).

**New tests:** `tests/sophia/m53_asof_read.test.ts` — 18/18 (R1–R9 pure read-model rules incl. half-open boundaries, legacy fail-closed, lineage bounds/cycles; F1–F9 store behavior incl. deterministic event-time derivation, `queryFacts(asOf)` pool, governance invariants). `tests/sophia/m53_authoritative_read_model.test.ts` — 13/13: the **Prisma (PostgreSQL-representation) branches now actually execute** against a real database built from the checked-in schema (P1–P13, including the fail-closed probe) — closing the M5.1/M5.2 gap where those branches were verified by inspection only.

---

## 4. M5.3-B Design — PostgreSQL-Native Hybrid Retrieval (evaluation)

The smallest reliable PostgreSQL-native semantic approach, evaluated against this project's actual constraints:

**Candidate mechanisms (PostgreSQL-native, no external services):**

| Mechanism | What it solves | Verdict in this environment |
|---|---|---|
| `tsvector` + GIN (`ts_rank`) | Lexical relevance ranking, prefix/stem matching | The deterministic token scorer (M4-C/M5.2 shared tokenizer + fold) already covers this governed-lexically; **zero remaining lexical failures** in the frozen benchmark. Cannot run in the sandbox (no PostgreSQL server). |
| `pgvector` (+ HNSW/IVFFlat) | Paraphrase/anaphora semantic similarity | Requires (a) a PostgreSQL server **— absent from this sandbox**; (b) an **embedding provider — absent from the governed SDK** (verified: no embeddings API). An external embedding service is forbidden by the task ("do not introduce an external retrieval service"). |
| `pg_trgm` | Fuzzy string similarity | Lexical, not semantic; same sandbox constraint; no benchmark failure class matches it. |

**Frozen-benchmark target analysis:** the post-M5.2 gap distribution is `F_graph_traversal × 1` — **the semantic class is empty**. The union-recall soft spots (BQ2 31%, BQ1a 67%) are window/enumeration classes whose gold is **fully render-reachable** (render recall 100% for both) — they are not similarity misses, and the harness's failure rule (render-reachability-aware since M5.2) confirms no failure. An embedding layer has nothing measurable to fix on the frozen set.

**Design (documented for the production PostgreSQL migration — not implemented now):**
1. `canonical_facts.statement_tsv` / knowledge `title+summary_tsv` as **generated `tsvector` columns with GIN indexes** — a second SQL-native lexical opinion feeding a **deterministic RRF fusion** (rank-only; no cross-space score mixing) with the existing governed ranker, which remains the final deterministic word.
2. `fact_embeddings vector(N)` (pgvector) as a **retrieval index only**: populated at promotion time by a *pinned, version-tagged* embedding model; canonical truth never derives from the vector; dropping the index loses no truth (same derived-index rule as the dependency table).
3. Lifecycle/authority/founder filters applied **before** fusion (SQL `WHERE`), so governance bounds every candidate set.
4. **Acceptance criteria for implementation:** (a) a NEW gold set with a genuine paraphrase/anaphora class (the frozen M5.1/M5.2 set cannot measure this and must not be altered to pretend otherwise); (b) all governance gates green on the frozen benchmark (regression gate); (c) measured latency and index/storage cost; (d) deterministic rerank unchanged.

## 5. M5.3-B Results

**Measured decision: not implemented; deferred with evidence.** The stage's benchmark record (`run-a2b`, zero code change between A2 and A2b): byte-identical to A2 — 1 failure, union 0.8955, render 0.9744, all gates green (i.e., before == after trivially, and the determinism claim re-verified).

- **Recall@K / Precision@K / MRR / render recall:** unchanged (no remaining semantic failure to resolve; nothing measurable to gain).
- **Semantic failures resolved by B:** 0 of 0 (class empty since M5.2).
- **Temporal failures resolved by B:** 0 of 0 (closed by M5.2).
- **Authority/lifecycle behavior:** unchanged (no code).
- **Latency / storage:** not applicable (nothing deployed).

Per the task's stop rule ("If a stage reveals that the next stage is unnecessary, STOP. Do not continue merely because it was planned"): M5.3-B revealed *itself* unnecessary — it does **not** render M5.3-C unnecessary (different failure class, §6–§7), so the experiment proceeded to C. The honest conclusion is recorded in §13: the semantic stage must wait for a PostgreSQL environment **and** a semantic gold set; building it now would be an unmeasurable, unvalidatable infrastructure change — the opposite of the smallest reliable approach.

---

## 6. M5.3-C Design — Explicit Dependency Relations

**The target failure (M5.1 BQ3a, the sole survivor of M5.2):** *"Which services depend on the Helix Identity Store?"* — the answer requires hop 2: query(Helix) → `FACT-DEP-02` (Aurorium Auth Service depends on Helix Identity Store) → `FACT-DEP-01` (Nimbus Gateway depends on Aurorium Auth Service). FACT-DEP-01 shares **zero** tokens with the query (verified by the fixture's design and pinned by test A2).

**Minimum relational representation (task contract: "entity A → depends_on → entity B"):**

```prisma
model DependencyRelation {
  id                  String   @id @default(uuid())
  sourceEntity        String    // normalized key: "nimbus gateway"
  sourceEntityDisplay String    // "Nimbus Gateway"
  targetEntity        String    // "aurorium auth service"
  targetEntityDisplay String
  relationType        String    // "DEPENDS_ON" — the ONLY evidenced type
  scope               String    // "company" — authorization scope
  status              String    // mirrors source fact validityState
  sourceFactId        String    // provenance: the canonical fact this edge was extracted from
  observedAt          DateTime  // = source fact promotedAt
  provenance          Json      // { statementHash (SHA-256), extractionRule, statement }
  @@unique([sourceEntity, targetEntity, relationType, sourceFactId])
  @@index([targetEntity, relationType, status])  // reverse traversal
  @@index([sourceEntity, relationType, status])
}
```

Every task-required field is present: source entity, target entity, relationship type, provenance (fact id + statement hash + rule version), created/observed timestamps, authorization scope (`company` — Personal Mind contributes no edges, preserving the founder/company boundary by construction), and lifecycle/status (mirrors the source fact's `validityState`).

**Governance model — a derived index, not a brain:**
- **Extraction is deterministic and versioned** (`dep-rel/1`, `src/lib/server/retrieval/dependency-relations.ts`): `"<Source> depends on <the> <Target>[ for <purpose>]"` over the first sentence; both sides must be entity-like proper-noun phrases (≤ 6 tokens, TitleCase/digit-initial — rejects "the pricing team" and clause fragments). Same statement → same edges, always. **No LLM can create, alter, or rank an edge.**
- **Writers are closed:** only `maintainRelationsForFact` / `markRelationsStaleForFact` / `rebuildFromFacts`, driven exclusively from canonical-fact lifecycle events (`saveFact` / `markFactSuperseded` in the claim store, both modes). Maintenance failure inside a truth write is logged but never fails the write (the index is rebuildable; blocking truth persistence on a derived cache would invert the authority model). Retrieval-side failures fail closed at their own boundary (degraded store → nothing renders).
- **Dropping the table loses no truth** — it is fully rebuildable from the facts.
- **Traversal is bounded:** depth ≤ 2 (`MAX_DEPENDENCY_TRAVERSAL_DEPTH`), reverse direction only ("who depends on X"), cycle-safe, deterministic order. This is not a general-purpose graph engine; forward traversal ("what does X depend on?") and additional relation types (`AFFECTS`, …) are explicitly deferred until benchmark evidence requires them.

**Retrieval caller → context assembly:** slice **4A3 DEPENDENCY_PATH** renders when (a) dependency intent fires (cue list: "depend(s) on", "rely/relies/relied/reliance on"), (b) anchors resolve (an entity's normalized tokens are a subset of the query's tokens — longest match first), (c) bounded traversal finds dependents, and (d) active canonical facts evidence them. Render: each edge cites its source fact (`(from [FACT-…])`); the fact lines are the **active canonical facts themselves under the CANONICAL_FACT authority** (same truth-bearing class as slice 4A — superseded facts' edges never traverse; no new authority class was invented). Partition-bounded at 900 chars / 8 edges / 4 facts. No anchors → nothing renders (fail-safe — pinned by A3/A6/A8).

**Benchmark maintenance (documented, gold sets byte-identical):** the `canonical_facts` surface battery mirrors the canonical path exactly as before, with the dependency-anchored facts prepended for anchor-resolving dependency queries (same K = 3, same dedup, deterministic order — `fixture.ts`/`queries.ts`/`metrics.ts`/`classify.ts` untouched; `seed.ts` RESET_COLLECTIONS gains the new durable collection so consecutive runs stay byte-deterministic). This is the same rewiring pattern M5.2 used for `queryFacts`/decisions/episodic search — the battery measures the canonical path, and the canonical path gained a capability.

## 7. M5.3-C Results

**Benchmark (`run-a3`, fixture digest unchanged):**

| Metric | A1 (M5.2) | A3 (M5.3-C) | Δ |
|---|---|---|---|
| Failures | 1 | **0** | BQ3a closed |
| Graph-candidate failures | 1 | **0** | — |
| Union recall | 0.8955 | **0.9211** | +0.0256 |
| Render recall | 0.9744 | **1.0000** | +0.0256 |
| BQ3a canonical_facts Recall@K | 50% | **100%** | FACT-DEP-01 retrieved |
| BQ3a canonical_facts MRR | 1.00 | 1.00 | (first-gold rank preserved) |
| Authority / temporal / supersession / founder / boundary | 10/10 · 8/8 · 9/9 · 13/13 · 13/13 | **identical** | zero governance drift |

**Exactly which queries changed: BQ3a only** (per-query metrics of the other 12 queries are byte-identical to A1 — the change is surgical). MULTI_HOP category: union 0.8333 → 1.0000, render 0.8333 → 1.0000. Determinism: two consecutive full runs byte-identical; the m51 D1/D2 determinism self-tests pass on the final tree.

**New tests:** `tests/sophia/m53_dependency_relations.test.ts` — 25/25 (E1–E6 extraction determinism/garbage rejection; T1–T7 intent/anchors/bounded traversal/cycles; S1–S4 store maintenance/rebuild idempotency/durability; A1–A8 end-to-end render + fail-safes + governance invariants, incl. "the hop-2 fact is unreachable lexically — only the traversal reaches it" and "superseding a dependency fact removes its edges from CURRENT traversal"). Authoritative-mode Prisma coverage: P10–P12 in the M5.3 authoritative suite.

---

## 8. Benchmark Comparison (A0 → A1 → A2 → A2b → A3)

| | A0 (M4-D, b9d1504-measured) | A1 (M5.2, a349205) | A2 (M5.3-A) | A2b (M5.3-B) | A3 (M5.3-C) |
|---|---|---|---|---|---|
| Failures | 14 | 1 | 1 | 1 | **0** |
| Graph candidates | 1 | 1 | 1 | 1 | **0** |
| Union recall | 0.7993 | 0.8955 | 0.8955 | 0.8955 | **0.9211** |
| Render recall | 0.7993 | 0.9744 | 0.9744 | 0.9744 | **1.0000** |
| Temporal gate | 6/8 | 8/8 | 8/8 | 8/8 | 8/8 |
| Authority gate | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 |
| Supersession gate | 9/9 | 9/9 | 9/9 | 9/9 | 9/9 |
| Founder scope | 13/13 | 13/13 | 13/13 | 13/13 | 13/13 |
| Personal/Company boundary | 13/13 | 13/13 | 13/13 | 13/13 | 13/13 |
| AUTHORITY_LIFECYCLE failures | 0 | 0 | 0 | 0 | 0 |

**Answer to the experiment's question:** at the scale and shape the frozen benchmark measures, **100% of the required retrieval workload is now solved PostgreSQL-natively** — 14/14 baseline failures closed (13 by deterministic render-path hygiene in M5.2; the multi-hop remainder by a bounded relational traversal in M5.3-C), with relational filters, a derived relation table, and zero extensions. Render recall is 1.0000 and every governance invariant held at every stage. The residual union-recall gap (0.9211 < 1.0 overall mean) is composed entirely of window-enumeration surfaces whose gold is fully render-reachable (BQ2 union 31% / render 100%; BQ1a union 67% / render 100%) — a property of single-shot lexical recall vs. enumeration, not a failure class (§9).

---

## 9. Remaining Failures

**None.** Zero retrieval failures, zero authority/lifecycle failures, zero graph candidates on the frozen benchmark. Honest residues (measured non-failures and known boundaries):

1. **Union-vs-render divergence on enumeration queries** (BQ2 31%/100%, BQ1a 67%/100%): single-shot lexical retrieval cannot *enumerate* a time window — the CHANGE_RECORD render path does. This is inherent to the metric (union recall is per-surface top-K), not a defect; documented since M5.1.
2. **GENERATION is structurally unmeasured** (no model call in the harness) — a generation-side harness is the only way to measure whether the now-perfect context is *used* correctly.
3. **Dependency coverage is exactly as evidenced:** DEPENDS_ON, reverse ("who depends on X"), depth ≤ 2, extracted from canonical-fact statements matching the dep-rel/1 grammar. Anything outside that envelope (decisions-as-nodes, initiative objectives, forward traversal) is deferred (§14).
4. **Scale caveats unchanged from M5.1/M5.2:** the corpus is deliberately small; per-surface full-collection scans are acceptable at this size and are the next thing to revisit under load.

---

## 10. PostgreSQL Operational Implications

- **Schema (additive, migration-safe):** `canonical_facts.superseded_at TIMESTAMPTZ NULL` + 1 index (`supersededById`); new `dependency_relations` table (2 traversal indexes + 1 provenance unique + sourceFactId index). On PostgreSQL, the AS_OF query shape is `validityState IN ('active','superseded') AND promotedAt <= T AND NOT (validityState='superseded' AND (supersededAt IS NULL OR supersededAt <= T))` — a plain btree-servable predicate; at fact volumes where that matters, a partial index on `(supersededAt)` or a temporal view is the standard next step (deferred — no evidence of need yet).
- **Both store modes share ONE eligibility/ranking core** (pure functions), so local, test, and authoritative deployments cannot drift semantically. The authoritative branches were **executed for real** in this task (against the SQLite port of the schema) — a first since M0.
- **Derived-index maintenance cost:** one bounded extraction pass per `saveFact` (regex over one sentence) + `deleteMany`/`createMany` on `sourceFactId`; non-transactional by design (rebuildable; a failure logs and never blocks the truth write). Index size is bounded by the number of dependency-shaped canonical facts.
- **No extensions required** for anything shipped in M5.3-A/C. pgvector/tsvector remain future *optional* additions under the §4 design and acceptance criteria.
- **Backfill note for the production migration:** pre-M5.3-A rows have `supersededAt NULL`; the fail-closed rule excludes them from AS_OF truth reads (correct), and a one-time backfill can derive event times from each successor's `promotedAt` where the chain is intact.

---

## 11. Graph-Specific Evidence

The graph decision gate (task): a Graphiti/graph-layer experiment is permitted only if (1) a reproducible class requires multi-hop relationship retrieval, (2) the relational representation is insufficient or materially complex, (3) the failure is demonstrated across multiple realistic queries, (4) the expected improvement is measurable, (5) operational complexity is justified.

**Evidence after M5.3-C:** the one-and-only graph-candidate failure in the entire benchmark history (BQ3a) is **closed by a bounded relational traversal** — 1 relation type, 1 table, 2 hops, ~40 lines of pure traversal code, zero new infrastructure. Conditions (1)–(5) are therefore **not met**: there is no surviving multi-hop failure class at all, let alone a *reproducible* one across *multiple* queries. The recorded conclusion, extending M5.1/M5.2's finding:

> **Graph layer not justified by benchmark evidence.** The measured multi-hop requirement of this system is fully served by an explicit relational dependency index with bounded traversal. A graph database would add operational surface (a second datastore, LLM-driven ingestion/invalidation per the Graphiti reference study) with zero measurable retrieval benefit on the workload we can currently evidence.

Re-opening the question requires *new benchmark evidence*: a gold set whose multi-hop chains are deeper or more heterogeneous than depth-2 DEPENDS_ON, or whose traversal patterns defeat the relational shape — neither of which exists today.

---

## 12. Security / Governance Verification

Every invariant, verified by measurement (benchmark gates, all green at every stage — see §8) and by dedicated tests:

| Invariant | Evidence |
|---|---|
| Founder authorization | 13/13 founder-scope gates green in A2/A2b/A3; cross-founder probe unchanged; the dependency layer adds no new authorization surface (company scope by construction — A7/S1). |
| Founder scoping | Episodic/Personal Mind surfaces untouched by M5.3; dependency edges carry `scope='company'`; no personal-mind material can enter the relation table (writers are fact-lifecycle hooks only). |
| Personal Mind / Company Brain boundary | Boundary gate 13/13 in every run; A4 asserts no personal content in the dependency slice; relations never render inside the PERSONAL_MIND container. |
| Lifecycle semantics | `validityState` remains the ONLY truth-bearing eligibility rule (F8: superseded evidence never current in any read mode; A6: superseding a dependency fact removes its edges from CURRENT traversal). AS_OF answers "what was true then" and never re-currents a superseded fact (R3/R6 half-open semantics). |
| Supersession | Gate 9/9 every run; historical evidence preserved and labeled (HISTORICAL list unchanged); event times recorded, never rewritten (additive column; no update path for `supersededAt` except the transition itself). |
| Provenance | Every rendered fact cites its record; every dependency edge cites its source fact + SHA-256 statement hash + extraction rule version; read modes pass provenance through untouched (F9, S1, P10). |
| Append-only audit | No existing audit surface modified; the derived index is rebuildable and its rows carry their own provenance — no truth is only-in-the-index. |
| Fail-closed behavior | P13 (child-process probe: unreachable database → `[DatabaseAuthority] FAIL-CLOSED`, exit 3, never a silent in-memory fallback); R4/R5 (unknown as-of instants and unknown event times exclude rather than guess); A8 (degraded relation store renders nothing); empty-anchor dependency questions change nothing (A3). |
| Deterministic state transitions | Extraction/traversal/read-model are pure functions with pinned tests; two-run byte-identical benchmark; D1/D2 self-tests green on the final tree; the only wall-clock use (markFactSuperseded fallback) is last-preference and unobservable in the frozen benchmark. |

**Retrieval improvements never changed authority:** every metric that touches truth position (authority, supersession, boundary, founder) is identical across A1 → A2 → A2b → A3.

---

## 13. Recommended Next Experiment

**M5.4 — Generation-side faithfulness harness (the now-measured bottleneck).** Retrieval is at ceiling on the frozen benchmark (render recall 1.0000, zero failures); the remaining unmeasured class is whether a model *consuming this exact context* answers correctly (the harness's own standing note: GENERATION failures are structurally unmeasurable by it). Build a generation-side harness over the same frozen fixture: same 13 queries, same assembled contexts (now fully gold-bearing), a model call, and graded answers against the gold + forbidden sets — with authority/lifecycle gates on the *answer* (does it cite current truth for CURRENT questions? does it label history as history?). This directly measures the next real risk and requires no new retrieval infrastructure.

Secondary candidates (in order, each gated on the frozen benchmark as regression gate):
1. **A semantic gold set + pgvector prototype** — only once a real PostgreSQL environment exists (per §4/§5; the frozen set cannot measure it).
2. **Dependency-layer extension ONLY on new evidence** (decisions/initiatives as dependency nodes, forward traversal, depth > 2) — each addition justified by a measured failure first, per the M5.3-C minimalism rule.

## 14. Explicitly Deferred Work

- **pgvector / tsvector / pg_trgm / any hybrid semantic retrieval** — designed (§4), not implemented; blocked on (a) a PostgreSQL server environment, (b) an embedding provider inside the governed stack, (c) a semantic gold set. No external retrieval service, ever, without a founder decision.
- **Forward dependency traversal** ("what does X depend on?") and **AFFECTS / additional relation types** — not benchmark-evidenced; the extraction grammar, traversal, and store are deliberately closed.
- **Dependency edges from decisions / initiative objectives / knowledge docs** — requires those surfaces to carry the same governed lifecycle the fact table has (the CompanyState history design deferred since M5.1).
- **AS_OF wiring into context assembly** (rendering as-of answers with intent cues like "as of <date>") — the store-level API exists and is tested; no benchmark query requires the render path, so no cue grammar was invented.
- **`supersededAt` backfill job for legacy rows** (see §10) — the fail-closed rule makes it safe to defer.
- **Index tuning at scale** (partial indexes, tsvector, HNSW parameters) — no measured need at current corpus size.
- **Graphiti / any graph database** — not installed, not prototyped, not justified (§11).

---

## Appendix A — How to reproduce

```bash
# the frozen benchmark (labels: a2 = post-M5.3-A, a2b = post-M5.3-B, a3 = post-M5.3-C)
bun run benchmark/memory-retrieval/run.ts --label a3
bun run benchmark/memory-retrieval/run.ts --json      # byte-deterministic JSON

# the M5.3 suites
bun run tests/sophia/m53_asof_read.test.ts            # 18 tests (read model + local store)
bun run tests/sophia/m53_dependency_relations.test.ts # 25 tests (extraction/traversal/e2e)
bun run tests/sophia/m53_authoritative_read_model.test.ts  # 13 tests (Prisma branches, real DB)

# the regression battery (M0–M4 + benchmark self-tests) — see Appendix B
```

## Appendix B — Test execution record (this task)

| Suite | Result |
|---|---|
| `tests/sophia/m53_asof_read.test.ts` (NEW) | **18 passed, 0 failed** |
| `tests/sophia/m53_dependency_relations.test.ts` (NEW) | **25 passed, 0 failed** (run twice — cross-run determinism verified after the seed-wipe fix) |
| `tests/sophia/m53_authoritative_read_model.test.ts` (NEW) | **13 passed, 0 failed** (schema pushed to a throwaway SQLite DB; Prisma branches executed for real; fail-closed child-process probe) |
| `tests/sophia/m51_benchmark.test.ts` (D4 pins updated to the zero-failure state, documented) | **30 passed, 0 failed** (incl. D1/D2 byte-identical double runs) |
| `tests/sophia/m52_retrieval_hygiene.test.ts` | **25 passed, 0 failed** |
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
| `tests/sophia/phase2_grounding_context.test.ts` | 12 passed, 0 failed (one transient live-LLM-dependent test flaked once, then failed identically on the **pristine a349205 baseline** in a control run and passed on retry — the documented M5.1 environment nondeterminism, not a regression) |
| `tests/scheduler/phase4_4e_epistemic.test.ts` (`bun test`) | 10 passed, 0 failed |
| `bun run lint` | clean (exit 0) |
| `bunx tsc --noEmit` | **CORRECTED (M5.4 Phase 0, per the acceptance audit's condition 2):** the original claim here ("160 errors — identical count to a pristine a349205 control; zero errors in any file touched by M5.3") was **inaccurate**. The M5.3 acceptance audit independently measured **159** on the M5.3 tree vs **157** on a pristine a349205 control (audit environment) — a **+2 discrepancy, both errors inside the NEW M5.3 test file** `tests/sophia/m53_authoritative_read_model.test.ts` (TS2503 invalid namespace-type usage, line 81; TS2540 read-only `NODE_ENV` assignment, line 42). Both were runtime-harmless (13/13 tests passed; lint unaffected) but the documented claim was wrong as stated. Absolute counts drift with each environment's node_modules state (M5.2 env: 155; audit env: 157/159; M5.4 env: 160/162) — the invariant is the per-file delta. Both errors were fixed as the first commit of M5.4 (proper `import type { CanonicalFact }`; test-safe `(process.env as { NODE_ENV?: string })` cast); after the fix the M5.3 tree returns to its pristine-control count with **zero errors in any M5.3-touched file** (verified: M5.4 env control 160, fixed tree 160). |

**Environment limitations (honest scope):** the "authoritative" suites run the Prisma branches against the **SQLite port** of the PostgreSQL schema — this sandbox has no PostgreSQL server. The query shapes are plain relational filters that run unchanged on PostgreSQL (§10); a live PostgreSQL validation remains a deployment-time task. Two bugs were caught by the new tests during development (a cue-regex spelling error and a seed reset gap that leaked derived relations across runs) — both fixed before commit; the benchmark never regressed at any point (every intermediate run is committed as evidence).
