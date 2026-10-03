# M5.3 Acceptance Audit — PostgreSQL-Native Retrieval Experiment

**Audited branch:** `feat/m53-postgres-retrieval-experiment` @ `ca38006` (base: M5.2 `a349205`)
**Audit date:** 2026-09-30 (this sandbox session)
**Audit method:** every claim below was re-derived from the repository itself — commit/graph inspection, file diffs, code reads, and full re-execution of the test suites and the frozen benchmark in a freshly restored worktree. Nothing was accepted from the prior report without independent evidence.

**Evidence legend:** ✅ VERIFIED (independently reproduced from repo/run evidence) · 🔶 INFERRED (consistent with evidence but not re-derivable) · ⛔ UNVERIFIED / ENVIRONMENT-LIMITED (recorded, not testable here)

---

## 1. Repository, Branch, and Commit Verification (Phase 1)

| Claim | Status | Evidence |
|---|---|---|
| Commit `ca38006` exists and is the M5.3 implementation | ✅ VERIFIED | `git show ca38006` — `feat(retrieval): M5.3 — PostgreSQL-native retrieval experiment (A/B/C stages measured)`; 23 files, +17,648/−35, containing exactly the M5.3 doc, read model, dependency layer, tests, and benchmark records. |
| M5.3 based on M5.2 `a349205` | ✅ VERIFIED | `ca38006`'s parent is `a349205` = `feat(retrieval): M5.2 — retrieval hygiene & canonical query routing`. |
| Branch local, not pushed, not merged | ✅ VERIFIED | `git branch -a`: no `remotes/origin/feat/m53*`; branch exists only locally. (Note: the sandbox reset destroyed the original worktree directory; the branch and commit were intact — worktree re-created at `/home/z/m53-postgres` for this audit.) |
| Frozen fixture digest unchanged: `40e53f15…` | ✅ VERIFIED | Full digest `40e53f1581def28371af8f050bc5ba85eaf58a47cbb86a4f449fad1beef719fb` identical in **all five committed runs** (`baseline-a0`, `run-a1`, `run-a2`, `run-a2b`, `run-a3`) **and in two fresh audit runs** executed by this audit. |
| Gold sets frozen | ✅ VERIFIED | `git diff a349205..ca38006 -- benchmark/memory-retrieval/{fixture,queries,metrics,classify,evaluate,run}.ts` → **empty**. Only `seed.ts` changed (+4 lines: `dependency_relations` added to the reset list — the documented determinism contract for the new durable collection) and `harness.ts` (the canonical-path mirror, see §4). |

## 2. M5.3-A — Authoritative As-Of / Supersession Read API

| Claim | Status | Evidence |
|---|---|---|
| `canonical_facts.supersededAt` added | ✅ VERIFIED | `prisma/schema.prisma` diff: additive `supersededAt DateTime?` + `@@index([supersededById])`; recorded by `markFactSuperseded` with deterministic preference (explicit → successor `promotedAt` → wall clock), verified in both store classes; `pipeline.ts` passes the successor's promotion moment explicitly. |
| Shared pure read model | ✅ VERIFIED | `src/lib/server/retrieval/fact-read-model.ts` (186 lines): no store calls, no clock, no model; `selectFactsForReadMode` is the single eligibility predicate used by BOTH `EpistemicClaimStore` (local) and `PostgresEpistemicStore` (authoritative). |
| CURRENT / HISTORICAL / AS_OF modes | ✅ VERIFIED | CURRENT = `validityState === 'active'` (the only truth-bearing rule, unchanged); HISTORICAL = active + superseded (nothing deleted); AS_OF = `promotedAt <= T && (supersededAt null ∥ supersededAt > T)`. |
| Half-open intervals `[promotedAt, supersededAt)` | ✅ VERIFIED | `isFactCurrentAsOf` implements exactly this; pinned by test R6 ("boundary instants are half-open"). |
| Fail-closed on unknown event times | ✅ VERIFIED | Superseded fact with `supersededAt == null` → excluded from AS_OF (R4); missing/invalid `asOf` instant → empty projection (R5); `readFacts` AS_OF in SQL mode re-applies the shared predicate after the coarse filter. |
| Bounded lineage | ✅ VERIFIED | `collectFactLineage`: `MAX_FACT_LINEAGE_NODES = 32`, cycle-safe (visited set), successor + predecessor chains; R9 pins bounds/cycles. |
| `queryFacts(asOf)` | ✅ VERIFIED | Optional `asOf` in `FactQueryParams`; eligibility flows through the read model; ranking unchanged (`rankFactsForQuery` untouched); F5 pins "without asOf is byte-identical to M5.2 behavior". |
| Both store modes | ✅ VERIFIED | `readFacts`/`getFactLineage`/`queryFacts(asOf)` implemented in `EpistemicClaimStore` (local, in-memory + durable) and `PostgresEpistemicStore` (Prisma); F1–F9 (local) and P1–P13 (authoritative, real database) suites pass. |
| STOP-rule result: no benchmark change, M5.2 saturated temporal surface | ✅ VERIFIED | `run-a2.json` is per-query **byte-identical** to `run-a1.json` (this audit's own structural diff: changed queries = `[]`). No benchmark query exercises an as-of timestamp operator; the temporal gate was already 8/8 and supersession 9/9 at A1. The documented reasons (§3 of the M5.3 doc) hold. |

## 3. M5.3-B — Hybrid Retrieval (evaluated, deferred)

| Claim | Status | Evidence |
|---|---|---|
| Evaluated, not silently implemented | ✅ VERIFIED | The `a349205→ca38006` diff contains **zero** M5.3-B code (no tsvector/pgvector/trigram anywhere); the deliverable is the §4/§5 evaluation with the production design and four acceptance criteria (new semantic gold set; governance gates green on frozen benchmark; measured latency/storage cost; deterministic rerank unchanged). |
| No remaining semantic failure after M5.2 | ✅ VERIFIED | `run-a1.json`: exactly 1 failure (BQ3a), `primaryGap: F_graph_traversal` (not `B_semantic`). Post-M5.2 gap distribution = `F_graph_traversal × 1` — the semantic class is empty. |
| No PostgreSQL server in sandbox | ✅ VERIFIED | `psql`/`pg_ctl`/`postgres` absent from PATH; no process; no 5432 listener. Prisma datasource = documented SQLite port (`DATABASE_URL=file:…`). |
| Governed SDK has no embedding API | ✅ VERIFIED | `z-ai-web-dev-sdk` type surface: chat / vision / TTS / ASR / image-gen / image-edit / video / web-search / page-reader only — zero matches for "embed". |
| `run-a2b` record | ✅ VERIFIED (result) / 🔶 INFERRED (provenance) | `run-a2b.json` is byte-identical to `run-a2.json` (trivially, no code exists for B). That "zero code change between A2 and A2b" as a *procedure* is inferred from the single-commit evidence + identical trees, not re-derivable from git history. Immaterial: the decision evidence (the three facts above) is independently verified. |

## 4. M5.3-C — Explicit Dependency Relations

| Claim | Status | Evidence |
|---|---|---|
| Derived `dependency_relations` table | ✅ VERIFIED | `prisma/schema.prisma`: `DependencyRelation` model — source/target entity (normalized + display), `relationType`, `scope`, `status`, `sourceFactId`, `observedAt`, `provenance Json`, unique `[sourceEntity, targetEntity, relationType, sourceFactId]`, two traversal indexes + sourceFactId index. Schema pushes clean to a throwaway DB (this audit re-validated). |
| Rebuildable / non-authoritative | ✅ VERIFIED | `rebuildFromFacts`; deterministic row ids (idempotent maintenance); writers closed to `maintainRelationsForFact` / `markRelationsStaleForFact` / `rebuildFromFacts`, driven only from claim-store lifecycle hooks; maintenance failure inside a truth write is logged, never fails the write (authority direction preserved); S1–S4 pin idempotency/durability/rebuild. |
| `DEPENDS_ON` only | ✅ VERIFIED | Literal type `'DEPENDS_ON'`; grammar, store, and traversal closed; AFFECTS/forward-traversal deferred (doc §14). |
| Deterministic `dep-rel/1` extraction | ✅ VERIFIED | Version-pinned regex rule over the first sentence: `"<Source> depends on <the> <Target>[ for <purpose>]"`, entity-likeness guard (≤ 6 tokens, TitleCase/digit-initial), self-loop rejection, SHA-256 statement hash in provenance; E1–E6 pin determinism + garbage rejection. Same statement → same edges, always; **no LLM anywhere** (grep of the three new retrieval modules: zero model/SDK imports). |
| Bounded depth-2 reverse traversal | ✅ VERIFIED | `MAX_DEPENDENCY_TRAVERSAL_DEPTH = 2` (default, not overridden by any caller); BFS reverse-only, cycle-safe, deterministic order; T1–T7 pin intent/anchors/bounds/cycles. |
| Provenance-citing DEPENDENCY_PATH render slice | ✅ VERIFIED | Context-assembly slice 4A3: renders only when dependency intent fires AND anchors resolve AND hops exist AND active facts evidence them; every edge line cites `(from [FACT-…])`; fact lines are the active canonical facts under `CANONICAL_FACT` authority; bounded 900 chars / 8 edges / 4 facts; degraded store → no slice, no crash (A8); no anchors → nothing (A3). |
| Only BQ3a changed | ✅ VERIFIED | This audit's per-query diff `run-a2b → run-a3`: changed queries = `['BQ3a']` — surgical. BQ3a canonical_facts: gold `{FACT-DEP-02, FACT-DEP-01}` both retrieved (recall 1.0, MRR 1.0), note records the M5.3-C path. MULTI_HOP category union/render 0.8333 → 1.0000. |
| Harness wiring is benchmark *maintenance*, not gold change | ✅ VERIFIED (design intent) / noted | `harness.ts` diff: the `canonical_facts` surface battery prepends dependency-anchored facts for anchor-resolving dependency queries — mirroring the new slice 4A3 the way M5.2 mirrored slices 4A/4A2/3B. Gold sets, metrics, classifier, K, and dedup untouched. **Audit note:** the union-surface leg is a *simulation* of the canonical exposure; the independent proof the real render path carries the evidence is the render leg (render recall 1.0000) + tests A1/A2 running the real `assemble()`. |

## 5. Benchmark Reproduction (Phase 2 — this audit's own runs)

Fresh full runs on the restored tree, labels `audit1`/`audit2`:

- `audit1` **byte-identical** to `audit2` (full-file compare) — double-run determinism confirmed.
- `audit2` **byte-identical** to the committed `run-a3.json` — the committed evidence reproduces exactly.
- Aggregate: **0 failures, union recall 0.9211, render recall 1.0000, graph-candidate failures 0**, 13 queries, digest `40e53f15…`.

Committed-run comparison (this audit's structural diffs):

| Metric | A0 | A1 | A2 | A2b | A3 |
|---|---|---|---|---|---|
| Failures | 14 | 1 | 1 | 1 | **0** |
| Union recall | 0.7993 | 0.8955 | 0.8955 | 0.8955 | **0.9211** |
| Render recall | 0.7993 | 0.9744 | 0.9744 | 0.9744 | **1.0000** |
| Authority gate | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 |
| Temporal gate | 6/8 | 8/8 | 8/8 | 8/8 | 8/8 |
| Supersession gate | 9/9 | 9/9 | 9/9 | 9/9 | 9/9 |
| Founder scope | 13/13 | 13/13 | 13/13 | 13/13 | 13/13 |
| Personal/Company boundary | 13/13 | 13/13 | 13/13 | 13/13 | 13/13 |
| Changed queries vs previous stage | — | 12 queries | **none** | **none** | **BQ3a only** |

A1's single failure verified as BQ3a (`GOLD_NOT_RETRIEVED` for FACT-DEP-01, `primaryGap: F_graph_traversal`, `graphCandidate: true`).

## 6. Test Reproduction Record (Phase 2 — all re-run by this audit)

| Suite | Documented | This audit's actual result |
|---|---|---|
| `m53_asof_read.test.ts` (NEW) | 18/0 | **18 passed, 0 failed** ✅ |
| `m53_dependency_relations.test.ts` (NEW) | 25/0 (run twice) | **25 passed, 0 failed** (this audit ran it twice: 25/0 both) ✅ |
| `m53_authoritative_read_model.test.ts` (NEW) | 13/0 | **13 passed, 0 failed** (incl. P13 child-process fail-closed probe) ✅ |
| New-test total | 56 | **56** (18+25+13) ✅ |
| `m51_benchmark.test.ts` | 30/0 | **30 passed, 0 failed** ✅ (D4 pin now asserts the zero-failure state; documented in-file; old state preserved in `run-a1.json`) |
| `m52_retrieval_hygiene.test.ts` | 25/0 | **25 passed, 0 failed** ✅ |
| `m0_idempotency_expiry` | 7/0 | 7/0 ✅ |
| `m1_canonical_state_authority` | 7/0 | 7/0 ✅ |
| `m2_knowledge_persistence` | 8/0 | 8/0 ✅ |
| `m3_authority_hardening` | 10/0 | 10/0 ✅ |
| `m3_conversation_convergence` | 14/0 | 14/0 ✅ |
| `k2_personal_memory` | 20/0 | 20/0 ✅ |
| `m4a_memory_capture` | 46/0 | 46/0 ✅ |
| `m4a_hardening` | 22/0 | 22/0 ✅ |
| `m4b1_lifecycle` | 20/0 | 20/0 ✅ |
| `m4c_query_conditioned_retrieval` | 27/0 | 27/0 ✅ |
| `phase1_conversational_executive` | — | 12/0 ✅ (one 429 fallback to the deterministic analyzer observed live — the documented flake mechanism) |
| `phase2_grounding_context` | 12/0 with one documented flake | **Flake independently reproduced**: 12/0 → 11/1 → 12/0 → 12/0 across four runs. Failing test: #6 "Conservative Candidate Matching (Ambiguous)" (live-LLM intent classification). ⚠ Not silently classified as passing: it is a **transient live-LLM failure that passes on retry**, consistent with the documented M5.1 environment nondeterminism — not an M5.3 regression (M5.3 touches no classifier code; the a349205 control exhibits the same mechanism). |
| `phase3_conversation_persistence` | — | 15/0 ✅ |
| `phase4a/b/c/c_c` | — | 27/0, 42/0, 57/0, 65/0 ✅ |
| `realtime_lab_provider`, `realtime_governance_audit` | — (pre-existing) | **Same 2 failures on the M5.3 tree AND on the pristine a349205 control** (stale `gemini-1.5-pro` expectations vs the deliberate `gemini-flash-latest` default) — pre-existing, not regressions. ⛔ Not fixed by M5.3, not caused by M5.3. |
| `scheduler/phase4_4e_epistemic` (`bun test`) | 10/0 | 10/0 ✅ |
| `bun run lint` | clean | **exit 0** ✅ |
| `bunx tsc --noEmit` | "160 errors, identical to pristine control; zero errors in any M5.3-touched file" | ⚠ **DISCREPANCY — see §8**: actual **159** on the M5.3 tree vs **157** on the pristine a349205 control (this environment); **+2 new errors, both in the new test file `m53_authoritative_read_model.test.ts`** (TS2503 invalid namespace-type usage line 81; TS2540 `NODE_ENV` read-only assignment line 42). Runtime-harmless — the 13 tests pass — but the documented claim is inaccurate. |
| Prisma schema | — | `db push` to a throwaway SQLite DB: clean, in sync ✅ |
| Real PostgreSQL coverage | documented limitation | ⛔ ENVIRONMENT-LIMITED: no PostgreSQL server in this sandbox (verified). The authoritative branches executed for real against the SQLite port of the schema; the query shapes are plain relational filters (verified by code read) that run unchanged on PostgreSQL. Live PostgreSQL validation remains a deployment-time task. |

## 7. Code Review — Architectural Regressions (Phase 3)

| Question | Finding | Evidence |
|---|---|---|
| Company Brain authority preserved? | ✅ Yes | Canonical facts remain the only `CANONICAL_FACT` authority; the dependency slice renders under the same authority with an explicit "NOT an independent source of truth" disclaimer; no new authority class invented. |
| Personal Mind separate? | ✅ Yes | `PERSONAL_MIND_MEMORY` slice untouched; dependency edges carry literal `scope: 'company'` (no parameter exists to set otherwise); A7: "Personal Mind contributes no edges"; boundary gate 13/13 in every run. |
| Canonical facts still authoritative? | ✅ Yes | `validityState` remains the only truth-bearing eligibility rule; supersession timing is additive metadata on the authoritative row; no second store of truth. |
| Dependency relations clearly non-authoritative? | ✅ Yes | Derived-index discipline documented in code; closed writers; rebuildable; P10–P12 execute the real DB branches; S-tests pin rebuild idempotency. |
| Rebuildable deterministically? | ✅ Yes | `rebuildFromFacts` over the versioned extraction; S3; double-run byte-determinism of the benchmark corroborates. |
| Provenance preserved? | ✅ Yes | Every edge: `sourceFactId` + SHA-256 statement hash + rule version; every rendered edge cites its fact; read modes pass provenance through untouched (F9, P10). |
| Authorization boundaries preserved? | ✅ Yes | No new authorization surface; founder-scope gate 13/13; company scope by construction. |
| Temporal semantics fail-closed? | ✅ Yes | R4/R5 (unknown instants/event times exclude, never guess); P13 (unreachable DB throws, no silent fallback). |
| Can stale/superseded facts become current? | ✅ No path | F8 pins "superseded evidence never becomes current in any read mode"; A6 pins "superseding a dependency fact removes its edges from CURRENT traversal"; `collectDependencyFacts` filters `validityState === 'active'`; AS_OF answers "what was truth then" only. |
| Can retrieval fabricate relationships? | ✅ No path | Edges exist only via `maintainRelationsForFact` from fact statements matching the grammar; no anchors → nothing renders; every edge cites a source fact. |
| Depth bounded? | ✅ Yes | `MAX_DEPENDENCY_TRAVERSAL_DEPTH = 2`; no caller overrides; lineage bounded at 32. |
| Any LLM-authoritative retrieval? | ✅ None | Zero model/SDK usage in the new retrieval modules; extraction/traversal/read-model are pure. |
| Any graph database dependency? | ✅ None | `package.json` + `bun.lock` diff between a349205 and ca38006 is **empty**. |
| Any vector database dependency? | ✅ None | Same empty diff; pgvector only appears as a documented future design (§4 of the M5.3 doc). |
| Unnecessary infrastructure? | ✅ None found | One additive column, one derived table, zero extensions, zero services. |
| M0–M4 behaviors preserved? | ✅ Yes | Every M0–M4 suite re-passed (§6); governance gates identical across all runs. |

**Minor code notes (non-blocking, recorded for honesty):**
1. `PostgresEpistemicStore.readFacts` applies `where.subject = params.subject` as an exact case-sensitive SQL filter while the shared pure model lower-cases both sides — the authoritative result can only ever be a *subset* of the pure-model result (fail-closed direction, no authority risk; cosmetic divergence between modes for mixed-case subjects).
2. Slice 4A3's edge lines cite `viaRelationIds[0]` only; when multiple facts evidence the same entity pair, the additional fact ids are not enumerated in the edge line itself (the facts render separately, bounded at 4). Cosmetic.
3. The two new tsc errors in the new test file (see §8).

## 8. Discrepancies Found (the honest list)

1. **tsc claim is inaccurate.** The M5.3 doc (Appendix B) states "160 errors — identical count to a pristine a349205 worktree control run" and "diff-verified: zero errors in any file touched by M5.3". Actual: the M5.3 tree has **159** errors; the pristine a349205 control (this environment) has **157**; the delta is **+2, both inside the NEW M5.3 test file** `tests/sophia/m53_authoritative_read_model.test.ts`:
   - line 81: `type CanonicalFact = typeEpistemic.CanonicalFact;` → TS2503 (invalid namespace usage; works only because the alias is unused at runtime)
   - line 42: `process.env.NODE_ENV = 'test';` → TS2540 (read-only property; works under tsx/bun)
   Both are runtime-harmless (the 13 tests pass; lint is unaffected) and confined to a test file — but the documented claim is wrong as stated.
2. **The `a2b` "zero code change between A2 and A2b" procedure is inferred**, not re-derivable (both result files landed in one commit). The result (byte-identical runs) and the decision evidence are independently verified; immaterial to the verdict.
3. **Phase-2 flake reproduced (1 in 4 runs)** — confirms rather than contradicts the documented environment nondeterminism; classified as transient, not as passing-while-failing.

No other discrepancy between the M5.3 report and the repository evidence was found. Every substantive claim — commits, parentage, digest freeze, per-stage benchmark deltas, gate counts, test counts, code structure, governance invariants — verified exactly, except §8.1.

## 9. Graph Decision Verification (Phase 4)

Recorded conclusion under audit: **"Graph layer not justified by benchmark evidence."**

- The only graph-candidate failure in the entire benchmark history (BQ3a) is **closed** by a bounded relational traversal — 1 relation type, 1 table, 2 hops, ~40 lines of pure traversal code, zero new infrastructure. ✅ Verified from the code and the reproduced A3 run (graph-candidate failures: 0).
- All five gate conditions are unmet: there is **no surviving multi-hop failure class at all** (condition 1 fails), hence no relational-insufficiency demonstration (2), no multi-query failure spread (3), no measurable improvement left (4), and nothing to justify operational complexity (5). ✅ The code/results support the conclusion.
- No graph database installed (empty dependency diff ✅); Graphiti/Neo4j/FalkorDB appear nowhere in the tree. ✅
- Re-opening requires new benchmark evidence (deeper/heterogeneous multi-hop chains) — correctly recorded as the future gate.

## 10. Verdict

# M5.3 — ACCEPT WITH CONDITIONS

### WHY

Concrete evidence (all independently reproduced in this audit):
- Commit/parentage/digest verified; gold sets byte-frozen; benchmark fully reproduced — two fresh runs byte-identical to each other and to the committed `run-a3` (0 failures, union 0.9211, render 1.0000, digest `40e53f15…`).
- Stage discipline verified exactly as reported: A changed nothing (byte-identical, STOP-rule correctly documented and correctly overridden with justification targeting BQ3a), B evaluated-not-implemented on independently confirmed environment evidence, C closed BQ3a surgically (only BQ3a changed) with zero governance drift across every gate.
- 56 new tests pass in both store modes, including real execution of the Prisma branches and the child-process fail-closed probe; all M0–M4/M5.1/M5.2 suites re-pass; lint clean; schema validates.
- Code review: every governance invariant held; no LLM-authoritative retrieval; no graph/vector dependency; no unnecessary infrastructure; authority direction never inverted (derived index can never block or override truth).
- Graph decision evidence supports the recorded conclusion.

### CONDITIONS (exact corrective actions, both trivial)

1. **Fix the two type errors** in `tests/sophia/m53_authoritative_read_model.test.ts`:
   - line 81: replace `type CanonicalFact = typeEpistemic.CanonicalFact;` with a proper type import (`import type { CanonicalFact } from '../../src/types/epistemic'`).
   - line 42: replace the direct `process.env.NODE_ENV = 'test'` assignment with `(process.env as any).NODE_ENV = 'test'` or an env-file-driven setup consistent with the other authoritative suites.
   Verify: `bunx tsc --noEmit` returns to the pristine-baseline error count with zero errors in M5.3-touched files.
2. **Correct the Appendix B tsc claim** in `docs/architecture/M5_3_POSTGRES_RETRIEVAL_EXPERIMENT.md` (159 measured, +2 in the new test file — not "identical count / zero in touched files").

### RISKS

1. ⛔ Authoritative-mode validation is against the **SQLite port**; live PostgreSQL validation is deployment-time (plain relational query shapes; low risk, documented).
2. Union-vs-render divergence on enumeration queries (BQ2 31%/100%, BQ1a 67%/100%) is an inherent metric property, not a defect — documented since M5.1; do not "fix" it by changing the benchmark.
3. Live-LLM nondeterminism (429 windows) will affect any generation-side test — M5.4 must grade deterministically and retry with recorded attempts (this audit reproduced the flake 1-in-4).
4. `dep-rel/1` coverage is deliberately narrow (reverse DEPENDS_ON, depth 2, fact statements only) — extension must stay evidence-gated or the minimalism discipline erodes.
5. The M5.1 D4 pin was updated to the zero-failure state — legitimate and documented, but it means the *harness itself* no longer fails if BQ3a regresses at retrieval level; regression protection for BQ3a now lives in `m53_dependency_relations.test.ts` (A1/A2) — adequate, noted for awareness.

### NEXT ACTION

M5.4 — Generation-side faithfulness harness — is the next task, per the design in `docs/architecture/M5_4_GENERATION_FAITHFULNESS_DESIGN.md` (same frozen fixture; 10 scenario classes; deterministic independent grading; acceptance criteria defined before implementation). Recommended sequence: apply the two M5.3 conditions as the first commit of the M5.4 branch (or a fix commit on the M5.3 branch before merge), then implement the harness. Nothing is to be pushed or merged automatically.

---
*This audit changed no production code and modified no benchmark artifact. Audit-run benchmark results (`run-audit1/2`) were deleted after byte-comparison; the committed evidence stands as shipped.*
