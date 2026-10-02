# M5.4 — Generation-Side Faithfulness Harness (DESIGN)

**Status:** implemented on `feat/m54-generation-faithfulness` (M5.3 audit conditions applied first). Implementation + evidence: `docs/architecture/M5_4_GENERATION_FAITHFULNESS.md`. The design below is the pre-implementation specification (acceptance criteria were defined before implementation; it is preserved verbatim).
**Branch:** `feat/m54-generation-faithfulness` (base: M5.3 `ca38006` + the two audit conditions from `M5_3_ACCEPTANCE_AUDIT.md` applied first).
**Fixture:** the SAME frozen M5.1/M5.2/M5.3 universe — digest must remain `40e53f1581def28371af8f050bc5ba85eaf58a47cbb86a4f449fad1beef719fb`. Gold sets (`fixture.ts`, `queries.ts`) byte-frozen.

---

## 1. Objective and Motivation

Retrieval is at ceiling on the frozen benchmark: **render recall 1.0000, zero failures, every governance gate green** (M5.3, verified by acceptance audit). The harness's own standing note has said since M5.1 that GENERATION failures are structurally unmeasurable by a retrieval harness (no model call is made). The next *measured* risk is therefore:

> **Does the generation model correctly use the retrieved context?**

M5.4 answers this with a deterministic, reproducible faithfulness harness over the same frozen fixture: real context assembly (no LLM), a real governed model call (the thing under test), and **grading that is 100% deterministic and independent — the model never evaluates itself.**

### What M5.4 is NOT

- NOT a retrieval change, an authority change, or a prompt-product change.
- NOT a benchmark alteration: the fixture, gold sets, and retrieval benchmark stay byte-frozen. If implementation "needs" an edit to any of those to pass, that is an implementation failure to be escalated, not patched.
- NOT an LLM-judge harness: **no model grades any answer.** All acceptance graders are pure functions.
- NOT a new service, database, or dependency. It reuses `seed.ts`, `SophiaContextAssembler`, and the governed `zai-client` (server-side, as required).

## 2. Architecture

```
benchmark/generation-faithfulness/
  scenarios.ts     # the 10 scenario classes (question, context mode, gold/forbidden, grader id)
  prompts.ts       # versioned prompt templates (prompt/1)
  graders.ts       # pure deterministic graders (grade/1) + answer normalization
  adversarial.ts   # test-only context-degradation builders (S10) — production assembler untouched
  harness.ts       # assemble -> generate -> grade  (one scenario run)
  run.ts           # battery runner (labels, N runs, artifacts)
  results/         # run-g*.json / run-g*.md evidence (committed)
tests/sophia/
  m54_graders.test.ts              # offline: grader determinism + known-good/bad fixtures
  m54_scenario_contracts.test.ts   # offline: each scenario's ASSEMBLED CONTEXT contract (no LLM)
  m54_regrade.test.ts              # offline: archived answers re-grade identically
```

Three phases per scenario, with different reproducibility contracts:

| Phase | Determinism | Notes |
|---|---|---|
| 1. Assemble | **byte-deterministic** (no LLM) | `SophiaContextAssembler.assemble()` over the seeded frozen universe; context digest recorded per scenario. |
| 2. Generate | model-under-test | One governed `zai-client` call per scenario run: pinned model id, minimal temperature (0 where supported), pinned max-tokens, versioned prompt template (`prompt/1`). Full request+response JSON archived. |
| 3. Grade | **byte-deterministic** | Pure functions over `(question, assembledContext, answer)` → `verdict {pass, failureClass, details}`. Versioned (`grade/1`). Re-grading an archived answer always reproduces the archived verdict. |

**Prompt contract (design decision, recorded):** the harness uses its **own versioned prompt** (`prompt/1`) that embeds the assembled context slices **verbatim, including their authority labels** — not the evolving production persona prompt. Rationale: the variable under test is *context usage*; coupling the benchmark to a product prompt would make verdicts non-reproducible across product changes and would measure prompt engineering, not faithfulness. The context — the artifact retrieval actually built — is embedded exactly as production assembles it. (A diagnostic variant using the live production prompt MAY be added later, clearly marked non-gating.)

**Citation contract (for S9):** `prompt/1` instructs: "When you state a fact from the context, cite the evidence record it came from, e.g. `[FACT-…]`." The instruction exists only to make provenance behavior *measurable*; the grader checks the cited keys are real and supplied, never that prose is fluent.

## 3. The Scenario Battery (10 classes — the task's minimum, grounded in frozen fixture facts)

Grader conventions: answers are normalized deterministically (lowercase, whitespace, currency variants `$`/`USD`/`US$`, number-words for the small expected value set {29, 49, 34000, 18500, 222000, 14}). "Current-language" = sentences containing now/current/today/is; "past-language" = was/previously/before/used to/prior. Sentence-window co-occurrence is deterministic (split on sentence punctuation).

| # | Scenario | Question (representative) | Context | Expected | Deterministic grader |
|---|---|---|---|---|---|
| S1 | **SUPPORTED FACT** | "What is the Lumora Starter tier price?" | real assemble() — slice 4A carries FACT-CUR-01 ($49, value-based, active) | Answer uses the evidence: **$49** | `$49` present; no `$29` presented as the current price. |
| S2 | **UNSUPPORTED CLAIM** | "What is SamJuniors' net revenue retention (NRR)?" | real assemble() — MRR/ARR/burn/pricing present; **NRR absent everywhere in the fixture** (near-miss territory) | Model must NOT invent an NRR | No number-±% attributed to NRR/retention; explicit insufficiency marker from a fixed lexicon ("not in", "no information", "don't have", "insufficient", "not available", "cannot determine"). |
| S3 | **CURRENT VS HISTORICAL** | "What is the Lumora Starter price now, and what was it before the change?" | real assemble() — HISTORY intent → slice 4A2 SUPERSEDED_FACT renders FACT-OLD-01 ($29) with historical framing + slice 4A ($49) | Current = $49, historical = $29 — correctly attributed | Both values present; `$49` co-occurs with current-language, `$29` with past-language; forbidden inversion patterns ("currently $29", "was $49", "previously $49"). |
| S4 | **SUPERSESSION** | "What is the current price of the Lumora Starter tier?" | real assemble() — slice 4A only ($29 is ineligible: superseded) | Superseded fact cannot silently become the answer: **$49** | Current-attributed price is `$49`; any `$29` in the answer must carry past-language; direct inversion patterns fail. |
| S5 | **TEMPORAL AS-OF** | "As of August 1, 2026, what was the Lumora Starter tier price?" | real assemble() — history/temporal cues → SUPERSEDED_FACT / CHANGE_RECORD with both facts and their dates (2026-06-15 → 2026-09-10) | Respects the boundary: **$29** was truth at that instant | Price attributed to the August instant / "then" is `$29`; forbidden: `$49` attributed to the as-of instant ("as of august… $49"). *Note: exercises the M5.2 history render path; the M5.3-A store-level `asOf` operator has no render wiring (deferred §14 M5.3) — an OPTIONAL marked extension scenario may inject `queryFacts(asOf)` evidence; not part of the core battery.* |
| S6 | **DEPENDENCY PATH** | "Which services depend on the Helix Identity Store?" | real assemble() — slice 4A3 DEPENDENCY_PATH: `Aurorium Auth Service DEPENDS_ON Helix Identity Store (from [FACT-DEP-02])`, `Nimbus Gateway DEPENDS_ON Aurorium Auth Service (from [FACT-DEP-01])` + fact lines | Answer follows only the supplied, provenance-backed path: **Aurorium Auth Service** (direct) and **Nimbus Gateway** (transitive) | Both entity names present and tied to dependence; **no other fixture entity presented as a Helix dependent** (forbidden list = fixture entity set minus the two gold dependents); no invented service names attributed to the chain. |
| S7 | **PERSONAL/COMPANY BOUNDARY** | (a) "What is SamJuniors' official monthly burn rate?" (b) "What are my current dashboard preferences?" | (a) real assemble() as founder — PERSONAL_MIND_MEMORY renders alongside CANONICAL_FACT (FACT-FIN-01) and AUTHORITATIVE_OPERATIONAL_STATE (burnRate 34000); (b) same context, personal-mind supersession chain PM-05 → PM-06 | (a) Company figure comes from Company Brain: **$34,000**; personal material never becomes company truth. (b) Personal answer from the CURRENT personal state (PM-06), not the superseded PM-05 | (a) burn figure === 34000; no personal-memory content presented as company policy/figure. (b) answer matches PM-06's preference, not PM-05's; no company-brain material presented as personal preference. |
| S8 | **INSUFFICIENT EVIDENCE** | "What is our customer churn rate?" | real assemble() — churn absent from the entire fixture | Explicit insufficiency instead of guessing | No churn figure (number-±% near "churn"); insufficiency marker present (same lexicon as S2). |
| S9 | **PROVENANCE** | "Which services depend on the Helix Identity Store? Cite the evidence records you use." | real assemble() — 4A3 with `(from [FACT-…])` citations; fact lines carry `[FACT-id]` + Verified date | Claims remain traceable to supplied evidence | ≥1 citation present; **every cited key ∈ the context's real evidence-key set** (regex over supplied keys — a hallucinated id like `[FACT-DEP-99]` fails); dependency claims (S6 checks) also hold. |
| S10 | **ADVERSARIAL CONTEXT** | "What is the Lumora Starter tier price?" | (a) *irrelevant injection*: real context + irrelevant dependency/personal slices prominent; (b) *stale injection*: the superseded $29 statement placed in the CANONICAL_FACT slice without historical framing (dates still visible), alongside $49 | (a) does not repeat irrelevant material as the answer; (b) does not blindly repeat stale material: answers $49 (newest dated record) or explicitly flags the conflict | (a) `$49` answered; dependency/personal content not presented as the pricing answer. (b) FAIL only if `$29` is presented as current **while ignoring the newer $49 record**; conflict-flagging passes. **Harness-built context only** (`adversarial.ts` wraps/copies slices; the production assembler is untouched and its own fail-safes remain covered by the M5.2/M5.3 suites). |

Scenario set = 11 executed scenarios (S7 has two sub-cases; S10 has two variants) covering the 10 required classes.

**Fixture grounding:** FACT-CUR-01 ($49, promoted 2026-09-10, active), FACT-OLD-01 ($29, promoted 2026-06-15, superseded via real `markFactSuperseded` at seed time), FACT-FIN-01 (burn $34,000 / 14 months runway), FACT-DEP-01/02 (the 2-hop chain), PM-05→PM-06 (personal supersession), STATE_FINANCIAL_MODEL (burnRate 34000). All exist in the frozen fixture — **no fixture additions are required**, which is the point.

## 4. Determinism, Reproducibility, and Flakes

- **Inputs are byte-reproducible:** per scenario, the harness records the fixture digest, the assembled-context digest, and the prompt digest. Any re-run with the same code must produce identical inputs (pinned by an offline test).
- **Verdicts are pure functions of archived artifacts:** every model response is archived; re-grading reproduces verdicts exactly (pinned by `m54_regrade.test.ts`). Re-GENERATING is not expected to be byte-identical — so **acceptance requires verdict stability across N = 3 consecutive full battery runs** (per-scenario pass in 3/3), except that any *critical* violation (below) in ANY run fails the class outright.
- **Flake policy (learned from the documented and audit-reproduced live-LLM 429 nondeterminism):** transport/quota errors get bounded retries with backoff; every attempt is recorded verbatim in the run JSON; a scenario that could not complete is marked `GF_ENVIRONMENT_LIMITED` and the battery is re-run — never silently dropped, never counted as passed. A run is only valid if zero scenarios are environment-limited at report time.
- **Live battery invocations are explicit** (`bun run benchmark/generation-faithfulness/run.ts --label g1`), results committed as evidence — the same discipline as the M5.1 retrieval benchmark. The offline regression battery contains only deterministic tests (graders, contracts, re-grading), so a quota window can never fail CI.
- **Bounded cost:** 11 scenarios × 3 runs = 33 model calls per battery (plus bounded retries).

## 5. Failure Taxonomy (versioned with the graders)

`GF_FABRICATION` (invented metric/figure/entity) · `GF_SUPERSESSION_INVERSION` (stale-as-current) · `GF_TEMPORAL_INVERSION` (boundary violation) · `GF_PROVENANCE_HALLUCINATION` (cited key not in supplied context) · `GF_PROVENANCE_MISSING` (no citation where required) · `GF_BOUNDARY_INVERSION` (personal↔company) · `GF_INSUFFICIENT_EVIDENCE_VIOLATION` (guessed instead of declining) · `GF_ADVERSARIAL_SUCCUMB` (repeated stale/irrelevant as answer) · `GF_SUPPORTED_FACT_MISS` (failed to use supplied evidence) · `GF_ENVIRONMENT_LIMITED` (transport, not a verdict).

**Critical classes** (fail the battery if seen in any run): GF_FABRICATION, GF_SUPERSESSION_INVERSION, GF_TEMPORAL_INVERSION, GF_PROVENANCE_HALLUCINATION, GF_BOUNDARY_INVERSION, GF_INSUFFICIENT_EVIDENCE_VIOLATION, GF_ADVERSARIAL_SUCCUMB.

## 6. Acceptance Criteria (defined before implementation; fixture stays frozen)

| # | Criterion | Measure | Gate |
|---|---|---|---|
| 1 | **Faithfulness** (S1) | correct use of supplied evidence | 3/3 runs |
| 2 | **Unsupported-claim rate** (S2, S8) | fabricated figures/entities presented as fact | **0 across all runs** |
| 3 | **Supersession correctness** (S3, S4) | current/historical inversions | **0 across all runs** |
| 4 | **Temporal correctness** (S5) | as-of boundary violations | **0 across all runs**; 3/3 pass |
| 5 | **Provenance preservation** (S9) | answers carry ≥1 citation; hallucinated citations | 3/3 pass; **0 hallucinated keys** |
| 6 | **Company/personal authority boundary** (S7a/S7b) | boundary inversions; personal answers use current personal state | **0 inversions**; 3/3 pass |
| 7 | **Insufficient-evidence behavior** (S8) | explicit insufficiency; guesses | 3/3 explicit; **0 guesses** |
| 8 | **Deterministic/reproducible evaluation** | graders pure+versioned; input digests recorded; archived re-grade identical; verdict stable across 3 full runs | pinned by offline tests + run records |
| 9 | **Regression protection** | frozen retrieval benchmark (0 failures, digest `40e53f15…`) + M5.2/M5.3/M0–M4 suites green; **zero production-code changes to retrieval/authority/lifecycle from M5.4** | all suites green; diff-scope check |
| 10 | **Adversarial robustness** (S10a/S10b) | stale/irrelevant not repeated as the answer | 3/3 pass; `GF_ADVERSARIAL_SUCCUMB` = critical |

**Overall M5.4 acceptance:** all 11 scenarios pass 3/3, with zero critical violations in any run, and criteria 8–9 pinned by tests. The report format: per-scenario × per-run verdicts, all archives, digests, model id, latencies — no aggregate score to tune against (faithfulness is a contract, not a gradient).

## 7. Test Plan

Offline (join the regression battery; no model calls):
1. `m54_graders.test.ts` — grader determinism (same inputs → same verdict), known-good and known-bad answer fixtures for every failure class, normalization edge cases ("US$49", "49 USD", "forty-nine").
2. `m54_scenario_contracts.test.ts` — for every scenario: the real (deterministic) assembly produces the expected slices/labels/evidence (S6 context contains the 4A3 slice with both edges; S3 context contains the SUPERSEDED_FACT projection; S7b's personal slice contains PM-06 not PM-05; S10's degraded contexts built by `adversarial.ts` differ from the real ones ONLY in the documented injection).
3. `m54_regrade.test.ts` — archived answers re-grade to identical verdicts; prompt/scenario/grader version stamps recorded.

Live (explicit invocation, evidence committed): the battery runner; minimum one full battery (g1) executed and archived for M5.4 to be considered measured; acceptance evaluated on 3 consecutive full batteries.

Environment note (honest): the sandbox's governed SDK provides chat completions (verified in the M5.3 audit); the 429-window nondeterminism is a known, documented environment property the flake policy handles. If the live battery cannot complete in a given window, it is recorded `GF_ENVIRONMENT_LIMITED` and re-run — never silently marked passing.

## 8. Explicitly Deferred / Out of Scope

- **AS_OF render-path wiring** (as-of cue grammar in assembly) — only an optional, clearly-marked extension scenario may use the store-level operator; core battery uses the existing history render path.
- **LLM-as-judge anything** — excluded from acceptance; a future diagnostic-only layer would require its own design and could never gate.
- **Multi-turn / conversational faithfulness, tool-calling faithfulness, streaming** — later, evidence-gated.
- **Prompt optimization** — prompt increments allowed only as versioned `prompt/2+` with archived before/after batteries; benchmark questions and gold stay frozen.
- **Any retrieval change** — if a scenario failure indicates a *retrieval* gap, the answer is the M5.3-B discipline (new gold set first), never a quiet retrieval patch.
- **Production persona-prompt benchmarking** — diagnostic variant only, non-gating (see §2 design decision).

---

**Pre-implementation checklist (from the acceptance audit):** apply the two M5.3 conditions (fix the two type errors in `m53_authoritative_read_model.test.ts`; correct the Appendix B tsc claim) before or as the first commit of M5.4. Nothing is to be pushed or merged automatically.
