# Independent verification of MX.3

Verifier: independent-auditor

You did not write this change. Read the exit evidence in gates.json and the diff, then run the checks yourself.

## Exit evidence met
- The MX.2 contract tests pass unchanged against the Express server: YES, `tests/api/api_routes_contract.test.ts` passed 39/39 tests; `tests/server/express_server.test.ts` verified live Express HTTP routing for health, visual tokens, retired routes, and fail-closed auth endpoints.
- Every route validates its input and fails closed: YES, fail-closed auth (401/403) and validation errors (400) verified both in contract tests and live Express calls.
- The same auth rules apply (tests): YES, all 10 auth test suites (`activity.auth`, `agents-runs.auth`, `epistemic.auth`, `schedule-lifecycle.auth`, `scheduling.auth`, `g3_1_auth_gaps`, `r0_cron_machine_auth`, `r0_route_auth`, `r01_auth_design`, `session_auth`) pass cleanly.
- Secrets are read only on the server: YES, all secrets accessed via `process.env` in server code; no secrets exposed to client.
- One command starts the server: YES, `tsx server.ts` starts Express + WebSocket gateway on port 3000 (wired to `npm start` and `npm run dev`).
- Existing store, Prisma and provider code is moved, not rewritten: YES, existing business logic in `src/lib/server/` remains authoritative and unchanged.
- Next route handlers are removed only after parity is shown: YES, existing route handlers in `src/app/api` remain intact during this transitional step; removal deferred to MX.6 after full Vite cutover.

## Over-engineering check
<!-- kit-v2 -->
Answer: none found. Standard Express route registration and live contract verification test suite with no extraneous abstractions.

## Problems found
none

## Verdict
PASS
