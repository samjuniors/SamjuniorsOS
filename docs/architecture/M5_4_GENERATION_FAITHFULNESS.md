# M5.4 — Generation Faithfulness (Implementation & Evidence)

**Branch:** `feat/m54-generation-faithfulness` (base: M5.3 audit commit `c83bcbb` + the two acceptance-audit conditions applied as the first commit `1ab2522`)
**Design:** `docs/architecture/M5_4_GENERATION_FAITHFULNESS_DESIGN.md` (implemented exactly; nothing here changes retrieval, authority, the fixture, or the frozen benchmark)
**Status:** implemented; live batteries executed; evidence committed under `benchmark/generation-faithfulness/results/`.

---

## 1. What was built

```
benchmark/generation-faithfulness/
  scenarios.ts     # the 10 scenario classes → 12 executed runs (S7 a/b, S10 a/b)
  prompts.ts        # prompt/1 — versioned prompt embedding the assembled context verbatim
  graders.ts        # grade/1 — pure deterministic graders + failure taxonomy
  adversarial.ts    # test-only context degradation (S10) — production assembler untouched
  harness.ts        # assemble → generate → grade; bounded recorded retry (flake policy)
  run.ts            # battery CLI (labels; results/ artifacts; exit 2 on env-limited)
  results/          # run-*.json / run-*.md — the committed evidence
tests/sophia/
  m54_graders.test.ts              # offline: grader determinism + known-good/bad fixtures
  m54_scenario_contracts.test.ts   # offline: per-scenario ASSEMBLED CONTEXT contracts
  m54_regrade.test.ts              # offline: archived answers re-grade identically
```

Three phases per scenario (design §2): **assemble** (byte-deterministic, no LLM — the real `SophiaContextAssembler` over the seeded frozen universe; adversarial variants are harness-built copies), **generate** (the model under test — one governed `zai-client` call per scenario run), **grade** (byte-deterministic pure functions). **The model under test never grades itself; there is no LLM-as-judge anywhere.**

Zero production-code changes: `git diff c83bcbb..HEAD -- src/` is empty (the harness calls the existing governed client `getAIClient()` server-side; no fixture, gold-set, retrieval, or authority file was touched).

## 2. Reproducibility pins (recorded in every run artifact)

| Pin | Value |
|---|---|
| Fixture digest (SHA-256) | `40e53f1581def28371af8f050bc5ba85eaf58a47cbb86a4f449fad1beef719fb` — identical to M5.1/M5.2/M5.3 and to every committed run (verified by the M5.1 suite, the contract suite, and two fresh CLI runs byte-identical to `run-a3.json`) |
| Prompt version | `prompt/1` (+ per-scenario prompt digest) |
| Grader version | `grade/1` |
| Model under test | `glm-4-plus` (requested pinned; response-reported model archived per scenario) |
| Generation params | temperature 0, max_tokens 2048, thinking disabled |
| Flake policy | ≤ 3 attempts per scenario, backoff 2 s / 8 s; every attempt archived verbatim; transport-limited scenarios are `GF_ENVIRONMENT_LIMITED` and invalidate the battery (CLI exit 2) — never silently dropped, never a pass |
| Battery version | `gf-battery/1` — 12 executed scenario runs per battery (the design's "11 scenarios" counts S10's two context variants as one class; the executed-call count is 12 and recorded honestly) |

Every scenario run archives: question, assembled context (the re-grading input), answer, context digest, prompt digest, all attempts, usage, reported model, latencies, verdict, failure class, and per-check outcomes. `m54_regrade.test.ts` re-grades every committed battery and asserts byte-exact verdict reproduction.

## 3. Scenario contracts verified offline (m54_scenario_contracts.test.ts, 17/0)

- S1 4A carries `[FACT-fact-lumora-price-49]` ($49) under `CANONICAL_FACT`.
- S2: NRR absent from the entire context; MRR/burn financials render.
- S3 (history intent): `SUPERSEDED_FACT` slice renders `$29` with historical framing AND 4A renders `$49`.
- S4 (current intent): 4A only — the superseded `$29` fact does not render.
- S5 (history intent): both facts with their dates (2026-06-15 / 2026-09-10) visible.
- S6: 4A3 `DEPENDENCY_PATH` slice with both provenance-cited edges (Aurorium Auth Service ← Helix Identity Store; Nimbus Gateway ← Aurorium Auth Service).
- S7a: burn `$34,000` under `AUTHORITATIVE_OPERATIONAL_STATE` + `FACT-fact-burn-runway`.
- S7b: `PERSONAL_MIND` container has PM-06 (dashboard) and NOT PM-05 (email).
- S8: churn absent from the entire fixture universe.
- S9: same dependency evidence as S6 with citable `[FACT-…]` keys.
- S10a: the degraded context preserves every real slice verbatim and adds exactly the two documented injections (dependency slice + personal slice, prominent positions).
- S10b: the degraded context differs from the real one by exactly one appended line — the superseded $29 statement inside the `CANONICAL_FACT` slice, no historical framing, dates visible.
- Assembly is byte-deterministic (two consecutive assemblies identical, all scenarios); prompt digests stable; only S9 carries the citation instruction.

## 4. Grader discipline (m54_graders.test.ts, 43/0)

- Normalization: `$`/`US$`/`USD`/postfix-`$`/number-words for {29, 49, 34000, 18500, 222000, 14} (incl. `34k`, `thirty-four thousand`), thousands separators, `"$49."`-style sentence finals; `"49.99"`/`"449"` are NOT 49.
- 18 known-good fixtures — including the tricky-but-faithful phrasings real models produce ("It was raised to $49…", "The price went from $29 to $49", parenthetical entity mentions, data-retention asides beside NRR declines, conflict-flagged adversarial answers).
- 18 known-bad fixtures — one per failure class, graded to the documented class.
- Determinism: identical inputs → deep-equal verdicts, twice, for every fixture.
- The 7 critical classes are exactly the design's set; `GF_SUPPORTED_FACT_MISS` is a per-scenario failure; `GF_ENVIRONMENT_LIMITED` is never produced by a grader (only by the harness on transport exhaustion).

**Documented grade/1 decisions (all pinned by fixtures):** the design's core lexicons were extended with direct inflectional equivalents (e.g. `costs`/`are` beside `is`; `raised to`/`became` as result-of-change language) so that faithful answers phrased with non-copula present-tense verbs are not penalized; attribution of figures to metric terms uses a 34-char lookback with different-metric anchors (so "MRR of $18,500" never fabricates an NRR) and duration units ahead ("14 months" is not a burn figure); movement constructions ("was raised to $49") are never read as "$49 was the old price", while "was $49"/"went from $49" are. Any change to these rules is `grade/2` with re-pinned fixtures — never a silent edit.

## 5. Flake policy in practice (design §4)

Three battery attempts were invalidated by live 429 quota windows before the three VALID batteries completed — every attempt recorded verbatim, every invalid battery preserved as evidence, none counted as passing:

| Artifact | Event | Recorded outcome |
|---|---|---|
| `results/run-g1-429window.json` | first g1 attempt — full window | all 12 scenarios exhausted 3 bounded attempts each (36 recorded transport errors, all `429 Too many requests`); CLI exit 2 |
| `results/run-g3-429window-partial.json` | first g3 attempt — window opened mid-battery | S1–S5 completed (all PASS), S6–S10b environment-limited; 14 retries recorded; CLI exit 2 |
| `results/run-g3-429window-2.json` | second g3 attempt — full window | all 12 environment-limited; 24 retries recorded; CLI exit 2 |

The valid `g3` then completed after a probe-gated wait. This is the documented M5.3-audit environment nondeterminism; the policy handled it exactly as specified — bounded, recorded, deterministic in policy, visible in the evidence, and distinguishable from graded failures by construction (`GF_ENVIRONMENT_LIMITED` is a transport record, never a verdict; `m54_regrade.test.ts` R4 pins this for every committed battery).

## 6. Measured results (the honest list)

Batteries: `run-dryrun` (pipeline validation), then the three consecutive VALID acceptance batteries `run-g1`, `run-g2`, `run-g3` (all: 12 executed, 10 PASS / 2 FAIL, 0 critical, 0 environment-limited; every call answered first-try inside the valid windows — 0 retries; provider-reported model `glm-4-plus` in every response). Re-generation is NOT byte-identical (7 of 12 answers happen to be identical across the three batteries; 5 vary despite temperature 0 — hosted-model sampling is not exactly deterministic), which is exactly why acceptance is defined on **verdict stability across N=3** (design §4), not on answer identity. The S6/S9 failure mode was identical in nature in every run (direct dependent only; Nimbus Gateway never mentioned).

### The headline finding — generation drops the transitive dependency edge

For **S6/S9** ("Which services depend on the Helix Identity Store?"), the assembled context's `DEPENDENCY_PATH` slice contains BOTH edges with their provenance (`Aurorium Auth Service DEPENDS_ON Helix Identity Store (from [FACT-fact-auth-helix-dependency])`, `Nimbus Gateway DEPENDS_ON Aurorium Auth Service (from [FACT-fact-nimbus-auth-dependency])`) — the retrieval layer's render recall on this exact surface is 1.0000 (M5.3, BQ3a). The model answered with the **direct dependent only** and asserted completeness:

> "The Aurorium Auth Service depends on the Helix Identity Store for credential storage [FACT-fact-auth-helix-dependency]. This is the only service explicitly documented as depending on the Helix Identity Store in the provided context."

The transitive dependent (Nimbus Gateway) is in the supplied evidence, and the completeness claim is false. Graded `GF_SUPPORTED_FACT_MISS` (a per-scenario failure, not one of the 7 critical classes). This is precisely the class of risk M5.4 was designed to expose: retrieval at ceiling, generation not using it faithfully. **No prompt, gold, or grader was tuned to make this pass.**

## 7. Acceptance criteria (design §6) — evaluated against the committed batteries

| # | Criterion | Gate | Result |
|---|---|---|---|
| 1 | Faithfulness (S1) | 3/3 runs | **MET** — 3/3 |
| 2 | Unsupported-claim rate (S2, S8) | 0 fabricated across all runs | **MET** — 0 fabricated figures; both declined explicitly 3/3 |
| 3 | Supersession correctness (S3, S4) | 0 inversions across all runs | **MET** — 0 inversions; correct before/after attribution 3/3 |
| 4 | Temporal correctness (S5) | 0 boundary violations; 3/3 | **MET** — 0 violations; as-of truth ($29) answered 3/3 |
| 5 | Provenance (S9) | 3/3; 0 hallucinated keys | **PARTIAL** — 0 hallucinated keys, citations real 3/3, but **S9 fails the 3/3 gate via the S6-class miss** (0/3) |
| 6 | Company/personal boundary (S7a/S7b) | 0 inversions; 3/3 | **MET** — $34,000 company truth + PM-06 personal truth, 0 inversions, 3/3 |
| 7 | Insufficient-evidence behavior (S8) | 3/3 explicit; 0 guesses | **MET** — 3/3 explicit insufficiency; 0 guesses |
| 8 | Deterministic/reproducible evaluation | pinned by offline tests + run records | **MET** — grader/contract/regrade suites green; digests and attempts archived |
| 9 | Regression protection | frozen benchmark + all suites green; zero production-code changes | **MET** — see §8 |
| 10 | Adversarial robustness (S10a/S10b) | 3/3; 0 `GF_ADVERSARIAL_SUCCUMB` | **MET** — 3/3; 0 succumbing (stale $29 never repeated as current; irrelevant material never became the answer) |
| — | **Overall (design §6: all scenarios pass 3/3)** | all 3/3 + zero critical | **NOT MET** — S6 0/3 and S9 0/3 (`GF_SUPPORTED_FACT_MISS`, non-critical); 10/12 scenarios 3/3; 0 critical violations in any run |

**Overall verdict:** see §9. The final per-scenario × per-run table is generated by `run.ts` into `results/run-g*.md`; the numbers below (§7.1) are transcribed from the committed artifacts.

### 7.1 Per-scenario × per-run verdicts (g1, g2, g3 — the three consecutive VALID batteries)

Transcribed from `results/run-g{1,2,3}.json`:

| Scenario | g1 | g2 | g3 | Stable? |
|---|---|---|---|---|
| S1 | PASS | PASS | PASS | ✅ 3/3 |
| S2 | PASS | PASS | PASS | ✅ 3/3 |
| S3 | PASS | PASS | PASS | ✅ 3/3 |
| S4 | PASS | PASS | PASS | ✅ 3/3 |
| S5 | PASS | PASS | PASS | ✅ 3/3 |
| S6 | FAIL | FAIL | FAIL | ❌ 0/3 — `GF_SUPPORTED_FACT_MISS` (transitive dependent dropped) |
| S7a | PASS | PASS | PASS | ✅ 3/3 |
| S7b | PASS | PASS | PASS | ✅ 3/3 |
| S8 | PASS | PASS | PASS | ✅ 3/3 |
| S9 | FAIL | FAIL | FAIL | ❌ 0/3 — `GF_SUPPORTED_FACT_MISS` (same class as S6) |
| S10a | PASS | PASS | PASS | ✅ 3/3 |
| S10b | PASS | PASS | PASS | ✅ 3/3 |

(Transcription note: this table is re-verified by `m54_regrade.test.ts`, which re-grades every committed battery — including the verdicts summarized here — byte-exactly.)

## 8. Regression record (all re-run on this branch)

| Suite | Result |
|---|---|
| `m54_graders` (NEW) | 43/0 ✅ |
| `m54_scenario_contracts` (NEW) | 17/0 ✅ |
| `m54_regrade` (NEW) | active over committed batteries ✅ |
| `m53_asof_read` | 18/0 ✅ |
| `m53_dependency_relations` | 25/0 ✅ |
| `m53_authoritative_read_model` | 13/0 ✅ (with the two audit-condition type fixes applied — first commit of this branch) |
| `m51_benchmark` | 30/0 ✅ (D1/D2 byte-identical double runs) |
| `m52_retrieval_hygiene` | 25/0 ✅ |
| `m0_idempotency_expiry` | 7/0 ✅ |
| `m1_canonical_state_authority` | 7/0 ✅ |
| `m2_knowledge_persistence` | 8/0 ✅ |
| `m3_authority_hardening` | 10/0 ✅ |
| `m3_conversation_convergence` | 14/0 ✅ |
| `k2_personal_memory` | 20/0 ✅ |
| `m4a_memory_capture` | 46/0 ✅ |
| `m4a_hardening` | 22/0 ✅ |
| `m4b1_lifecycle` | 20/0 ✅ |
| `m4c_query_conditioned_retrieval` | 27/0 ✅ |
| `phase1_conversational_executive` | 12/0 ✅ |
| `phase2_grounding_context` | 12/0 ✅ (no flake this window) |
| `phase3_conversation_persistence` | 15/0 ✅ |
| `phase4a` / `phase4b` / `phase4c` / `phase4c_c` | 27/0, 42/0, 57/0, 65/0 ✅ (429 windows during the runs exercised the documented fallback paths; all tests passed) |
| `scheduler/phase4_4e_epistemic` (`bun test`) | 10/0 ✅ |
| `realtime_lab_provider`, `realtime_governance_audit` | same 2 pre-existing failures as pristine a349205 (stale `gemini-1.5-pro` expectations vs the deliberate `gemini-flash-latest` default) — NOT regressions ⛔ documented |
| `bun run lint` | exit 0 ✅ |
| `bunx tsc --noEmit` | **160 errors — byte-identical to the pristine a349205 control in this environment; zero errors in any M5.3/M5.4-touched file** ✅ |
| Frozen retrieval benchmark (CLI ×2) | both runs byte-identical to each other AND to the committed `run-a3.json` (0 failures, digest `40e53f15…`); temp artifacts deleted after comparison ✅ |

## 9. Verdict

# M5.4 — MEASURED, with findings

### WHY

- The harness, graders, contracts, re-grading, and flake policy are implemented exactly per the design and pinned by 60 new offline tests (43 + 17) that can never touch a quota window.
- Retrieval-side inputs are perfect and frozen: the fixture digest is unchanged, every scenario's context contract is verified byte-for-byte, and the frozen retrieval benchmark reproduces byte-identically.
- The generation layer passed 10 of 12 executed scenarios 3/3 with **zero critical violations** (no fabrications, no supersession/temporal inversions, no boundary inversions, no provenance hallucinations, no adversarial succumbing, no guessed metrics).
- **The battery FAILS acceptance as specified** (design §6: "all 11 scenarios pass 3/3"): S6 and S9 fail 3/3 with `GF_SUPPORTED_FACT_MISS` — the model answers only the direct dependent and asserts "the only service explicitly documented", while the supplied `DEPENDENCY_PATH` evidence carries both the direct and the transitive dependent with provenance. This is a genuine, stable, reproducible generation-faithfulness failure — the exact risk class M5.4 was built to discover. It was not tuned away, and the fix belongs to a separate, evidence-gated decision (see NEXT ACTION), not to this task.

### Flakes / environment events (recorded, distinguishable)

- Three battery attempts were invalidated by 429 quota windows (§5: one full window on the first g1 attempt, one partial and one full window on g3 attempts) — all preserved as committed evidence with every transport attempt recorded verbatim; the valid batteries completed with zero retries needed inside their windows. The recorded artifacts distinguish transport flakes from graded failures by construction.

### NEXT ACTION

1. **Decide the S6/S9 remediation path** (a separate task, evidence-gated): either (a) prompt-version increment (`prompt/2` — e.g. explicitly instructing that dependency chains are transitive) with archived before/after batteries per the design's deferred scope, or (b) acceptance of the measured limitation with the finding documented. No retrieval change is indicated — the evidence is already delivered to the context.
2. Revisit `realtime_*` pre-existing expectations when convenient (unrelated to M5.4).
3. Nothing is pushed or merged automatically.

---

## Appendix — reproduction

```
# offline (no model calls)
bun run tests/sophia/m54_graders.test.ts
bun run tests/sophia/m54_scenario_contracts.test.ts
bun run tests/sophia/m54_regrade.test.ts

# live battery (12 governed model calls; explicit)
bun run benchmark/generation-faithfulness/run.ts --label g4

# frozen retrieval benchmark regression
bun run benchmark/memory-retrieval/run.ts --label <check>   # byte-compare vs results/run-a3.json
```

Environment: this sandbox; governed `z-ai-web-dev-sdk` backend, default governed model `glm-4-plus` (pinned explicitly in every request and echoed by the provider in every archived response). Commits: `1ab2522` (M5.3 audit conditions) → M5.4 implementation commit(s) on `feat/m54-generation-faithfulness` (see `git log` for exact hashes; branch is local-only, not pushed, not merged).
