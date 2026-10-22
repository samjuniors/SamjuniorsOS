# SamJuniorsOS Full-History Secret Scan & Finding Classification

**Date:** 2026-10-21  
**Author:** Antigravity Security Lane (Gate G1.3)  
**Status:** COMPLETE & VERIFIED  
**Scanner:** Gitleaks v8.21.2 (windows/amd64)  
**Scope:** 471 Git commits across all historical branches and refs  

---

## 1. Scanner Selection & Command Specification

To establish full-history secret auditing that can be reused seamlessly both locally and within GitHub Actions CI (Gate G1.2):

- **Chosen Scanner:** [Gitleaks](https://github.com/gitleaks/gitleaks) (v8.21.2)
  - *Rationale:* Native Go implementation, high performance (scans 471 commits in ~2.5 seconds), deep AST and regex rule coverage, supports `.gitleaks.toml` allowlists, and has first-class GitHub Action support (`gitleaks/gitleaks-action`).
- **Canonical Full-History Scan Command:**
  ```bash
  gitleaks detect --config .gitleaks.toml --log-opts="--all" --verbose
  ```
- **Canonical PR / Working Tree Scan Command (for CI):**
  ```bash
  gitleaks detect --config .gitleaks.toml --verbose
  ```

---

## 2. Scan Execution Summary

| Metric | Value |
|---|---|
| Total Commits Scanned | 471 |
| Total Scan Duration | 2.54 seconds |
| Raw Detections (default ruleset) | 172 occurrences (across 43 unique strings) |
| Classified Test Fixtures | 13 unique strings |
| Browser / Storage Cache Keys | 2 unique strings |
| Idempotency UUIDs (`.data`) | 26 unique strings |
| Benchmark Memory Claim IDs | 2 unique strings |
| **Live / Active Production Secrets** | **0** |
| **Revoked / Historical Leaked Secrets** | **0** |
| **Unexplained Findings** | **0** |

---

## 3. Comprehensive Finding Classification

Every single detection from the full git history has been audited and classified:

### A. Test Fixtures (Synthetic Credentials in `tests/`)
All findings in this category are non-functional, synthetic tokens explicitly authored inside automated test files to test API clients, signature verification, red-team leak protection, or redaction filters:

| Synthetic Secret Pattern | Rule | File(s) | Classification & Purpose |
|---|---|---|---|
| `sk-live1234567890abcdef1234567890` | `generic-api-key` | `tests/orchestration/council_deliberation.test.ts` | **Test Fixture:** Synthetic token tested against executive deliberation redaction filters. |
| `AIzaSy_SECRET_KEY_MUST_NEVER_LEAK_99999999` | `generic-api-key` | `tests/sophia/phase3_step6_gateway_security.test.ts` | **Test Fixture:** High-entropy string asserting that gateway routes redact API keys. |
| `phase-341-WRONG-secret` | `generic-api-key` | `tests/api/agents-runs.auth.test.ts` | **Test Fixture:** Deliberately invalid auth header verifying 401 unauthorized rejection. |
| `phase4-deepgram-stub` | `generic-api-key` | `tests/sophia/phase4_governance_hardening.test.ts` | **Test Fixture:** Stub key for mock Deepgram STT adapter in offline tests. |
| `sk-AbCdEf1234567890GhIj` | `generic-api-key` | `tests/sophia/m4a_observation.ts` | **Test Fixture:** Synthetic key string verifying memory extractor identifies secret shapes. |
| `sk-abc123def456ghi789jklmno` | `generic-api-key` | `tests/sophia/m4a_memory_capture.test.ts` | **Test Fixture:** Synthetic key string verifying memory capture redactions. |
| `sk-live-987654321098765432109876543210` | `generic-api-key` | `tests/governance_security_foundation.test.ts` | **Test Fixture:** Synthetic billing export payload verifying cryptographic sealing. |
| `re_test_key_1234567890` | `generic-api-key` | `tests/phase2_4_idempotency.test.ts` | **Test Fixture:** Mock Resend client key testing idempotent email dispatch. |
| `re_valid_api_key_123` | `generic-api-key` | `tests/phase12_5_resend_integration.test.ts` | **Test Fixture:** Mock Resend API key testing client initialization. |
| `whsec_mfKQ9r8uJRIBwSnipqiCQldILRsmOIen` | `generic-api-key` | `tests/phase12_5_resend_integration.test.ts` | **Test Fixture:** Synthetic webhook secret testing HMAC-SHA256 signature verification. |
| `turn-idempotency-key-001` | `generic-api-key` | `tests/sophia/realtime_governance_audit.test.ts` | **Test Fixture:** Idempotency key constant for audit ledger verification. |
| `idemp-investor-b-1` | `generic-api-key` | `tests/sophia/m2_batch3_recovery_gate.test.ts` | **Test Fixture:** Idempotency token testing lock recovery gates. |
| `p3_cancel_marker_turn` | `generic-api-key` | `tests/sophia/sofiaui_voice_runtime.test.ts` | **Test Fixture:** Marker turn token verifying cancellation semantics. |

### B. LocalStorage & Browser State Keys
| Key String | File | Classification & Purpose |
|---|---|---|
| `samjuniors_personas_v2` | `src/lib/persona-store.ts`, `lib/persona-store.ts` | **Storage Key:** Browser localStorage key name used for persona state caching. Not a credential. |
| `samjuniors-os-4.5` | `Uploaded/astra.html` | **Storage Key:** Browser localStorage key name for prototype audio settings. Not a credential. |

### C. Runtime Idempotency Identifiers (`.data/`)
| Pattern | File | Classification & Purpose |
|---|---|---|
| `sofia-[0-9a-f-]{36}` | `.data/chat_messages.json` | **Idempotency Key:** Standard RFC4122 v4 UUID generated at runtime to deduplicate conversational turns. Matched by gitleaks due to `"idempotencyKey": "..."` field names. |
| `k2-e2e-turn-[0-9]+` | `.data/chat_messages.json` | **Idempotency Key:** Synthetic timestamped turn key from local test runs. |
| `m3-t4-*`, `m4a-e1-*` | `.data/chat_messages.json` | **Idempotency Key:** Phase test run turn markers. |
| `p26-outage-idem` | `scripts/phase2_6_outage_probe.ts` | **Idempotency Key:** Script probe lease identifier. |

### D. Benchmark Knowledge Claim Identifiers
| Pattern | File | Classification & Purpose |
|---|---|---|
| `SOP-LUMORA-PRICING-V1` | `benchmark/memory-retrieval/results/baseline-a0.json` | **Benchmark Claim ID:** Unique tag identifying epistemic claim in memory benchmark test vectors. |
| `SOP-LUMORA-PRICING-V2` | `benchmark/memory-retrieval/results/baseline-a0.json` | **Benchmark Claim ID:** Unique tag identifying revised epistemic claim in memory benchmark. |

---

## 4. Historical `.env` Audit Check

Commit `7b78ab8` (`chore(security): B.0 — untrack .env and .zscripts/dev.pid`) was inspected to verify past `.env` tracking:
- `.env` historically existed across commits `963a26c`, `27a2cac`, and `6e3c231`.
- Content in all 3 commits contained strictly: `DATABASE_URL=file:/home/z/my-project/db/custom.db` (local SQLite path).
- All secret provider keys (`COMPOSIO_API_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`) were completely unpopulated placeholders.
- No live secret was ever committed; no Git history rewriting was or is required.

---

## 5. Repository Allowlist Configuration (`.gitleaks.toml`)

To ensure clean CI integration and avoid false positives on legitimate test fixtures, `.gitleaks.toml` was configured in repository root:
- Ignores paths containing tests, benchmarks, runtime data, and legacy prototypes.
- Allows known test idempotency patterns (`samjuniors-*`, `sofia-*`, `k2-*`, `turn-idempotency-*`).
- **Result:** Running `gitleaks detect --config .gitleaks.toml --log-opts="--all"` exits `0` with 0 leaks reported across all 471 commits.
