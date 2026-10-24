# Handoff Note: MX.2 — Baseline before changing anything: API contract tests for every route & latency snapshot

- **Step:** MX.2
- **Milestone:** MX (Vite + React + Express stack migration)
- **Agent:** antigravity
- **Date:** 2026-10-24

## 1. Summary of Changes
- Created benchmark runner `scripts/record-voice-latency-baseline.ts` to capture pre-migration voice-loop latency over 25 consecutive turns.
- Generated canonical voice latency baseline:
  - Median (p50): **79 ms**
  - 95th percentile (p95): **90.8 ms**
  - Recorded in `doc/baseline/2026-10-24-voice-loop-latency.md` and `doc/baseline/2026-10-24-voice-loop-latency.json`.
- Authored canonical API contract test suite `tests/api/api_routes_contract.test.ts`:
  - 39 tests covering all 9 route functional groups (health, auth, epistemic/activity, sofia, workflow/governance, agents, communications, speech, and dynamic discovery).
  - Dynamically discovers all 74 `route.ts` handlers across `src/app/api` and verifies each exports at least one valid HTTP method handler.
  - Verifies fail-closed production auth behavior (401/403) and validation failure contracts (400/401).
- Verified rerunnability of M1 whole-path smoke test (`npm run test:smoke` passed all 6/6 phases).
- Verified zero application code was modified in `src/`.

## 2. Smallest-Change Ladder
- Step 1: Scripted latency benchmark measuring speech stop to audio start using `LiveGatewayVoiceProvider` interface seams.
- Step 2: Ran benchmark across 25 turns and saved immutable baseline documentation in `doc/baseline/`.
- Step 3: Implemented API contract tests covering all route exports, fail-closed auth, and status contracts.
- Step 4: Executed whole test suite and confirmed 100% pass rate.

## 3. Verification Commands & Evidence
- Latency Benchmark: `npx tsx scripts/record-voice-latency-baseline.ts` -> 25/25 turns, p50: 79ms, p95: 90.8ms.
- API Route Contract Test: `bun test tests/api/api_routes_contract.test.ts` -> 39 pass, 0 fail (119 expect calls across all 74 routes).
- Smoke Test: `npm run test:smoke` -> ALL 6/6 PHASES PASSED.
