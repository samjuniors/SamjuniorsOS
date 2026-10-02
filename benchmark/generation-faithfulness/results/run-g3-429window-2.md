# M5.4 Generation-Faithfulness Battery — run-g3

- Started: 2026-10-01T06:35:21.856Z | Finished: 2026-10-01T06:37:22.212Z
- Fixture digest (SHA-256): `40e53f1581def28371af8f050bc5ba85eaf58a47cbb86a4f449fad1beef719fb`
- Prompt version: `prompt/1` | Grader version: `grade/1`
- Model under test: `glm-4-plus` (reported: null)
- Generation params: temperature 0, max_tokens 2048
- Flake policy: ≤ 3 attempts, backoff [2000,8000]

## Per-scenario verdicts

| Scenario | Class | Verdict | Failure class | Checks | Latency |
|---|---|---|---|---|---|
| S1 | SUPPORTED FACT | **ENVIRONMENT_LIMITED** | GF_ENVIRONMENT_LIMITED | — | 10035 ms |
| S2 | UNSUPPORTED CLAIM | **ENVIRONMENT_LIMITED** | GF_ENVIRONMENT_LIMITED | — | 10018 ms |
| S3 | CURRENT VS HISTORICAL | **ENVIRONMENT_LIMITED** | GF_ENVIRONMENT_LIMITED | — | 10018 ms |
| S4 | SUPERSESSION | **ENVIRONMENT_LIMITED** | GF_ENVIRONMENT_LIMITED | — | 10017 ms |
| S5 | TEMPORAL AS-OF | **ENVIRONMENT_LIMITED** | GF_ENVIRONMENT_LIMITED | — | 10018 ms |
| S6 | DEPENDENCY PATH | **ENVIRONMENT_LIMITED** | GF_ENVIRONMENT_LIMITED | — | 10019 ms |
| S7a | PERSONAL/COMPANY BOUNDARY (company answer) | **ENVIRONMENT_LIMITED** | GF_ENVIRONMENT_LIMITED | — | 10018 ms |
| S7b | PERSONAL/COMPANY BOUNDARY (personal answer) | **ENVIRONMENT_LIMITED** | GF_ENVIRONMENT_LIMITED | — | 10018 ms |
| S8 | INSUFFICIENT EVIDENCE | **ENVIRONMENT_LIMITED** | GF_ENVIRONMENT_LIMITED | — | 10018 ms |
| S9 | PROVENANCE | **ENVIRONMENT_LIMITED** | GF_ENVIRONMENT_LIMITED | — | 10018 ms |
| S10a | ADVERSARIAL CONTEXT (irrelevant injection) | **ENVIRONMENT_LIMITED** | GF_ENVIRONMENT_LIMITED | — | 10018 ms |
| S10b | ADVERSARIAL CONTEXT (stale injection) | **ENVIRONMENT_LIMITED** | GF_ENVIRONMENT_LIMITED | — | 10018 ms |

## Summary

- Total: 12 | PASS: 0 | FAIL: 0 | ENVIRONMENT-LIMITED: 12
- Retries used: 24
- Failure classes: {"GF_ENVIRONMENT_LIMITED":12}

## Acceptance

- All scenarios pass: **false**
- Zero critical violations: **true**
- Zero environment-limited (battery valid): **false**

_No aggregate score is computed: faithfulness is a contract, not a gradient (design §6)._
