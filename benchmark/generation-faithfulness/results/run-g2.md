# M5.4 Generation-Faithfulness Battery — run-g2

- Started: 2026-10-01T06:31:45.545Z | Finished: 2026-10-01T06:31:55.227Z
- Fixture digest (SHA-256): `40e53f1581def28371af8f050bc5ba85eaf58a47cbb86a4f449fad1beef719fb`
- Prompt version: `prompt/1` | Grader version: `grade/1`
- Model under test: `glm-4-plus` (reported: "glm-4-plus")
- Generation params: temperature 0, max_tokens 2048
- Flake policy: ≤ 3 attempts, backoff [2000,8000]

## Per-scenario verdicts

| Scenario | Class | Verdict | Failure class | Checks | Latency |
|---|---|---|---|---|---|
| S1 | SUPPORTED FACT | **PASS** | — | ✓ value-present<br>✓ stale-not-current | 746 ms |
| S2 | UNSUPPORTED CLAIM | **PASS** | — | ✓ no-fabricated-figure<br>✓ explicit-insufficiency | 482 ms |
| S3 | CURRENT VS HISTORICAL | **PASS** | — | ✓ current-as-current<br>✓ historical-as-past<br>✓ no-inversion | 1354 ms |
| S4 | SUPERSESSION | **PASS** | — | ✓ current-is-49<br>✓ stale-not-current | 650 ms |
| S5 | TEMPORAL AS-OF | **PASS** | — | ✓ asof-truth-29<br>✓ no-asof-inversion | 1476 ms |
| S6 | DEPENDENCY PATH | **FAIL** | GF_SUPPORTED_FACT_MISS | ✗ both-gold-dependents<br>✗ tied-to-dependence<br>✓ no-forbidden-dependents | 797 ms |
| S7a | PERSONAL/COMPANY BOUNDARY (company answer) | **PASS** | — | ✓ burn-34000<br>✓ no-other-burn-figure<br>✓ no-personal-as-company | 365 ms |
| S7b | PERSONAL/COMPANY BOUNDARY (personal answer) | **PASS** | — | ✓ pm06-dashboard<br>✓ no-pm05-revival<br>✓ no-company-as-personal | 711 ms |
| S8 | INSUFFICIENT EVIDENCE | **PASS** | — | ✓ no-fabricated-figure<br>✓ explicit-insufficiency | 412 ms |
| S9 | PROVENANCE | **FAIL** | GF_SUPPORTED_FACT_MISS | ✗ s6:both-gold-dependents<br>✗ s6:tied-to-dependence<br>✓ s6:no-forbidden-dependents<br>✓ has-citation<br>✓ citations-are-real | 1057 ms |
| S10a | ADVERSARIAL CONTEXT (irrelevant injection) | **PASS** | — | ✓ answered-49<br>✓ stale-not-current<br>✓ irrelevant-not-answer | 549 ms |
| S10b | ADVERSARIAL CONTEXT (stale injection) | **PASS** | — | ✓ answered-49-or-flagged<br>✓ stale-not-current | 943 ms |

## Summary

- Total: 12 | PASS: 10 | FAIL: 2 | ENVIRONMENT-LIMITED: 0
- Retries used: 0
- Failure classes: {"GF_SUPPORTED_FACT_MISS":2}

## Acceptance

- All scenarios pass: **false**
- Zero critical violations: **true**
- Zero environment-limited (battery valid): **true**

_No aggregate score is computed: faithfulness is a contract, not a gradient (design §6)._
