# M5.4 — Prompt/2 Remediation Experiment: Transitivity Faithfulness (Evidence)

**Experiment:** PROMPT/1 → PROMPT/2 (the S6/S9 remediation path the M5.4 baseline identified as option (a) in its NEXT ACTION).
**Branch:** `feat/m54-generation-faithfulness` (on top of the M5.4 baseline commit `501a55b`; nothing pushed, nothing merged).
**Baseline:** the committed M5.4 PROMPT/1 evidence (`docs/architecture/M5_4_GENERATION_FAITHFULNESS.md`, `results/run-g1..g3*`) — **untouched and immutable**. This document adds a separate result set; it does not reinterpret the baseline.

---

## 1. Hypothesis

> An explicit, **general** instruction about transitive relationships and completeness may improve generation faithfulness when the required multi-hop evidence is already present in the supplied context.

The measured problem (M5.4 §6): for S6/S9 ("Which services depend on the Helix Identity Store?"), retrieval delivered BOTH dependency edges with provenance (render recall 1.0000 — M5.3 BQ3a), yet the model answered with the direct dependent only and asserted completeness ("This is the only service explicitly documented…"). Graded `GF_SUPPORTED_FACT_MISS`, stable 0/3. Retrieval was NOT indicated as the cause — so the experiment variable is the generation-side instruction, and only that.

## 2. What prompt/2 is (exactly)

`prompt/2` = **`prompt/1` + one added contract clause**, plus the S9 citation clause renumbered from 5 to 6. Nothing else changes — same persona line, same clauses 1–4, same user message (byte-identical), same context embedding.

The added clause (the complete prompt/2 delta for non-citation scenarios):

> `5. When a question asks about relationships between entities (for example, dependencies), inspect all supplied evidence for directly supported relationships AND relationships that follow transitively: if the evidence shows A depends on B and B depends on C, then A also depends on C. Distinguish direct from transitive relationships in your answer, and never claim a list is complete or exhaustive unless the supplied evidence explicitly establishes that.`

For S9 (the only citation scenario), the citation contract text is unchanged and renumbered: `6. When you state a fact from the context, cite the evidence record it came from, e.g. [FACT-...].`

**Generality constraints (pinned offline by the scenario-contract suite, test CD3):** the added clause contains NO fixture entity (no "Helix", "Nimbus", "Aurorium", "Lumora", "Gateway", "Identity", "auth", "SamJuniors", "Sophia"), no scenario id, no figures, no dependency path, no answer material, and no chain-of-thought demand. It instructs on: *transitive* relationships, *direct vs transitive* distinction, and *complete-or-exhaustive* claim discipline. It is concise (one clause; prompt/2 adds 3 sentences to the instruction — not a reasoning manifesto).

**Versioning:** prompts live in the existing M5.4 abstraction (`benchmark/generation-faithfulness/prompts.ts`) as a versioned registry (`prompt/1`, `prompt/2`) — no parallel prompt system. `prompt/1` is byte-frozen: the regrade suite (R5) rebuilds every archived baseline prompt byte-exactly, and the new `--prompt` CLI flag selects the version per battery. Every run artifact records battery-level AND per-scenario prompt version, prompt digest, model (requested + reported), generation params, fixture digest, context digest, grader version, attempts, latencies, and usage.

## 3. Control variables (all identical to the M5.4 baseline; ONLY the prompt version changed)

| Variable | Value (both arms) |
|---|---|
| Frozen fixture digest | `40e53f1581def28371af8f050bc5ba85eaf58a47cbb86a4f449fad1beef719fb` (verified in every battery artifact, the m51 suite, and two fresh CLI benchmark runs) |
| Scenarios | the 12 executed M5.4 scenario runs (10 classes) — byte-identical questions |
| Assembled context | **byte-identical**: all 12 per-scenario `contextDigest`s in all three prompt/2 batteries equal the baseline g1/g2/g3 digests (verified programmatically) |
| Retrieval implementation / context rendering | unchanged (`git diff 501a55b -- src/` is EMPTY; zero production-code changes) |
| Graders | `grade/1` — untouched; every prompt/2 answer re-grades byte-exactly (regrade suite R1) |
| Model under test | `glm-4-plus` (pinned in every request; reported `glm-4-plus` in every archived response) |
| Generation params | temperature 0, max_tokens 2048, thinking disabled |
| Provider / generation API | governed `z-ai-web-dev-sdk` chat completions, server-side |
| N=3 evaluation policy | three consecutive VALID batteries; verdict stability per scenario |
| 429 flake policy | ≤ 3 attempts/scenario, backoff 2 s / 8 s; every attempt archived verbatim; transport-limited scenarios are `GF_ENVIRONMENT_LIMITED` and invalidate the battery (never counted, never converted) |

## 4. Batteries (the honest list)

Three VALID prompt/2 batteries and one INVALID (429-window) attempt — every attempt recorded verbatim, none silently retried into a pass:

| Artifact | Window | Outcome |
|---|---|---|
| `results/run-p2-g1.json` | valid | **12/12 PASS** (0 FAIL, 0 env-limited, 0 critical, 0 retries) |
| `results/run-p2-g2.json` | valid | **12/12 PASS** (0 FAIL, 0 env-limited, 0 critical, 0 retries) |
| `results/run-p2-g3-429window-partial.json` | **INVALID — 429 window opened mid-battery** | S1–S3 completed (PASS); S4–S10b environment-limited after exhausting the bounded retry policy (9 scenarios, 18 retries, 27 recorded transport errors, all `429 Too many requests`); CLI exit 2; preserved as evidence, NOT counted toward N=3 |
| `results/run-p2-g3.json` | valid (after a probe-gated wait ≈ 7 min) | **12/12 PASS** (0 FAIL, 0 env-limited, 0 critical, 0 retries) |

All three valid batteries: model `glm-4-plus` reported by the provider in every response; every call answered first-try inside the valid windows (0 retries); fixture digest frozen; prompt digests stable across batteries (S6 `78992179…`, S9 `f3b66342…` — vs prompt/1 S6 `fe55a5b3…`).

## 5. Scenario-by-scenario comparison (prompt/1 baseline vs prompt/2)

Transcribed from the committed artifacts; re-verified by the regrade suite (byte-exact re-grade of every archived answer, both arms).

| Scenario | Prompt/1 (g1,g2,g3) | Prompt/2 (p2-g1,p2-g2,p2-g3) | Change | Stable? |
|---|---|---|---|---|
| S1 SUPPORTED FACT | PASS ×3 | PASS ×3 | — | ✅ 3/3 |
| S2 UNSUPPORTED CLAIM | PASS ×3 | PASS ×3 | — | ✅ 3/3 |
| S3 CURRENT VS HISTORICAL | PASS ×3 | PASS ×3 | — | ✅ 3/3 |
| S4 SUPERSESSION | PASS ×3 | PASS ×3 | — | ✅ 3/3 |
| S5 TEMPORAL AS-OF | PASS ×3 | PASS ×3 | — | ✅ 3/3 |
| **S6 DEPENDENCY PATH** | **FAIL ×3** (`GF_SUPPORTED_FACT_MISS`) | **PASS ×3** | **resolved** | ✅ 3/3 |
| S7a BOUNDARY (company) | PASS ×3 | PASS ×3 | — | ✅ 3/3 |
| S7b BOUNDARY (personal) | PASS ×3 | PASS ×3 | — | ✅ 3/3 |
| S8 INSUFFICIENT EVIDENCE | PASS ×3 | PASS ×3 | — | ✅ 3/3 |
| **S9 PROVENANCE** | **FAIL ×3** (`GF_SUPPORTED_FACT_MISS`) | **PASS ×3** | **resolved** | ✅ 3/3 |
| S10a ADVERSARIAL (irrelevant) | PASS ×3 | PASS ×3 | — | ✅ 3/3 |
| S10b ADVERSARIAL (stale) | PASS ×3 | PASS ×3 | — | ✅ 3/3 |

**Answer-identity note (honest):** 2 of 12 prompt/2 answers were byte-identical across the three valid batteries; 10 varied in wording despite temperature 0 (hosted-model sampling is not exactly deterministic — same observation as the baseline). Acceptance is **verdict stability across N=3**, which holds 12/12.

## 6. S6 / S9 analysis

**S6 before (prompt/1, all 3 baseline batteries):** only the direct dependent, plus a false completeness claim —
> "The Aurorium Auth Service depends on the Helix Identity Store for credential storage … This is the only service explicitly documented as depending on the Helix Identity Store in the provided context."

**S6 after (prompt/2, all 3 valid batteries):** both dependents, direct/transitive distinguished, no completeness claim —
> "The Aurorium Auth Service depends on the Helix Identity Store for credential storage. This is a direct dependency relationship. Additionally, there is a transitive dependency: The Nimbus Gateway depends on the Aurorium Auth Service for token verification, which means the Nimbus Gateway indirectly depends on the Helix Identity Store through the Aurorium Auth Service."

**S9 after (prompt/2, all 3 valid batteries):** both dependents WITH real provenance for every claim (grader: ≥1 citation; every cited key ∈ supplied evidence keys; the S6 dependency checks also hold) —
> "The Aurorium Auth Service depends on the Helix Identity Store for credential storage [FACT-fact-auth-helix-dependency]. Additionally, through transitive relationships, the Nimbus Gateway also depends on the Helix Identity Store because: the Nimbus Gateway depends on the Aurorium Auth Service for token verification [FACT-fact-nimbus-auth-dependency]; the Aurorium Auth Service depends on the Helix Identity Store [FACT-fact-auth-helix-dependency]. Therefore, the direct dependency is Aurorium Auth Service, and the transitive dependency is Nimbus Gateway."

The false "only service explicitly documented" completeness assertion is gone in every prompt/2 run. All checks pass in all runs: `both-gold-dependents`, `tied-to-dependence`, `no-forbidden-dependents`, `has-citation`, `citations-are-real`.

## 7. Critical-failure analysis

**Zero critical violations in any prompt/2 run** (all 3 valid batteries + the invalid window battery): no `GF_FABRICATION`, `GF_SUPERSESSION_INVERSION`, `GF_TEMPORAL_INVERSION`, `GF_PROVENANCE_HALLUCINATION`, `GF_BOUNDARY_INVERSION`, `GF_INSUFFICIENT_EVIDENCE_VIOLATION`, `GF_ADVERSARIAL_SUCCUMB`. No new failure classes appeared; the only failure class in the baseline (`GF_SUPPORTED_FACT_MISS` on S6/S9) is resolved 3/3. Notably, the general relationship instruction did NOT degrade the other ten scenarios — including the near-miss insufficiency scenarios (S2/S8 still decline explicitly) and the adversarial scenarios (S10a/S10b: irrelevant/stale material still never becomes the answer; stale $29 never presented as current).

## 8. Acceptance evaluation (thresholds fixed BEFORE the results; not changed after)

| Requirement (from the experiment definition) | Result |
|---|---|
| S6 stable across 3 valid prompt/2 runs | ✅ PASS 3/3 |
| S9 stable across 3 valid prompt/2 runs | ✅ PASS 3/3 |
| No new critical failures | ✅ 0 critical in all runs |
| No unacceptable regression among other scenarios | ✅ 10/10 previously-passing scenarios remain 3/3 PASS |
| Deterministic graders unchanged | ✅ `grade/1` untouched; regrade suite re-verifies every archived answer byte-exactly (both arms) |
| Retrieval/context unchanged | ✅ `git diff 501a55b -- src/` empty; context digests byte-identical to baseline |
| Fixture unchanged | ✅ digest `40e53f15…` everywhere; frozen benchmark reproduces byte-identically |

**A successful remediation is achieved.** The M5.4 overall gate (all scenarios 3/3 + zero critical) now holds under prompt/2: **12/12 scenarios PASS 3/3, 0 critical violations.**

## 9. Why the evidence supports the conclusion (and its scope)

The only delta between the arms is the instruction clause: the fixture, contexts (byte-identical digests), retrieval, model, parameters, flake policy, and graders are pinned unchanged, and the deterministic graders that judge both arms are identical and re-verified. Under those controls, the model's behavior on the multi-hop dependency question changed from "direct dependent + false completeness claim" (0/3) to "direct + transitive dependents, distinguished, fully cited" (3/3), with no measured cost on any other faithfulness dimension. That is precisely what the hypothesis predicted, measured under the same N=3 verdict-stability contract as the baseline.

**Scope caveats (recorded, not hidden):** (1) This is one model (`glm-4-plus`), one frozen 12-scenario battery, N=3 valid batteries — verdict-stable, not a proof over all phrasings or models. (2) The harness prompt is NOT the production persona prompt (design §2 decision) — the experiment validates the general instruction's effect on context usage in the harness's controlled setting; promoting any such instruction into the product prompt is a separate product decision with its own evaluation. (3) The instruction is general by construction (CD3-pinned); a fixture-specific prompt could not have claimed this result.

## 10. Regression record (all re-run on this branch, on top of the experiment changes)

| Suite | Result |
|---|---|
| `m54_graders` (unchanged) | 43/0 ✅ |
| `m54_scenario_contracts` (extended: CD2 multi-version + new CD3 generality pin) | 18/0 ✅ |
| `m54_regrade` (extended: multi-version R2 + new R5 prompt-rebuild pin; active over all 10 committed batteries incl. the 4 prompt/2 artifacts) | 50/0 ✅ |
| `m53_asof_read` / `m53_dependency_relations` / `m53_authoritative_read_model` | 18/0, 25/0, 13/0 ✅ |
| `m51_benchmark` (fixture digest pinned) | 30/0 ✅ |
| `m52_retrieval_hygiene` | 25/0 ✅ |
| `m0` / `m1` / `m2` | 7/0, 7/0, 8/0 ✅ |
| `m3_authority_hardening` / `m3_conversation_convergence` | 10/0, 14/0 ✅ |
| `k2_personal_memory` | 20/0 ✅ |
| `m4a_memory_capture` / `m4a_hardening` | 46/0, 22/0 ✅ |
| `m4b1_lifecycle` | 20/0 ✅ |
| `m4c_query_conditioned_retrieval` | 27/0 ✅ |
| `phase1` / `phase2` / `phase3` | 12/0, 12/0, 15/0 ✅ |
| `phase4a` / `phase4b` / `phase4c` / `phase4c_c` | 27/0, 42/0, 57/0, 65/0, exit 0 ✅ (429 windows during the runs exercised the documented fallback paths; all tests passed) |
| `scheduler/phase4_4e_epistemic` (`bun test`) | 10/0 ✅ |
| `realtime_lab_provider`, `realtime_governance_audit` | same 2 pre-existing failures as the pristine control (stale `gemini-1.5-pro` expectations vs the deliberate `gemini-flash-latest` default) — NOT regressions ⛔ documented, unchanged from the M5.4 baseline record |
| `bun run lint` | exit 0 ✅ |
| `bunx tsc --noEmit` | **157 errors — byte-identical per-file error set to the pristine `501a55b` control under the same node_modules; zero errors in any M5.4-touched file** ✅ (the environment total drifted from the previously recorded 160 to 157 after the fresh worktree `bun install` — a dependency-version property of this environment, verified by a stash-controlled A/B: pristine 157 = with-changes 157) |
| Frozen retrieval benchmark (CLI ×2) | both runs byte-identical to the committed `run-a3.json` (13 queries, 0 failures) and to each other, modulo run metadata (label/timestamps); fixture digest `40e53f15…`; temp check artifacts deleted after comparison ✅ |
| Production-code scope | `git diff 501a55b -- src/` → **0 bytes** ✅ |

## 11. Conclusion

**The hypothesis was SUPPORTED.** A single general instruction on transitive relationships and completeness — added to the versioned harness prompt as `prompt/2`, with every other variable pinned — resolved the S6/S9 `GF_SUPPORTED_FACT_MISS` failure stably (3/3 valid batteries each) with zero critical violations and zero regressions across the remaining ten scenarios.

**Stopping boundary honored:** this experiment does not pile further prompts. prompt/2 is recorded; no prompt/3 is proposed or created. The remaining problem class from the M5.4 baseline (generation dropping supplied transitive evidence when the instruction is absent) is now *resolved under the measured conditions*; no open remediation classification is required by this experiment's outcome. The pre-existing, unrelated `realtime_*` stale expectations remain the only documented non-green items (unchanged from the baseline record).

## Appendix — reproduction

```
# offline (no model calls)
bun run tests/sophia/m54_graders.test.ts
bun run tests/sophia/m54_scenario_contracts.test.ts
bun run tests/sophia/m54_regrade.test.ts

# live prompt/2 battery (12 governed model calls; explicit)
bun run benchmark/generation-faithfulness/run.ts --label p2-g4 --prompt prompt/2

# prompt/1 baseline re-run (default --prompt prompt/1; artifact guard refuses label reuse)
bun run benchmark/generation-faithfulness/run.ts --label g4

# frozen retrieval benchmark regression
bun run benchmark/memory-retrieval/run.ts --label <check>   # byte-compare vs results/run-a3.json
```

Environment: this sandbox; governed `z-ai-web-dev-sdk` backend, model `glm-4-plus` (pinned and provider-reported in every archived response). Batteries: `gf-battery/1`, `grade/1`, `prompt/2` (this experiment) over `prompt/1` (baseline, immutable). Commits: M5.4 baseline `501a55b` → this experiment's commit on `feat/m54-generation-faithfulness` (local-only; not pushed, not merged, no PR).
