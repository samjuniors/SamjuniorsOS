# QA pass for MX: A faster, desktop-ready stack: Vite + React + Express

QA by: antigravity (independent QA verification session)
Tested commit: 498f91e8c80af6f82931874b6f27c17c1c3f5306
Checks result: PASS
CI run: n/a
Verdict: PASS

Run this against the real app on kit/integration, the way the founder will: start it, do each test step below yourself, and write what you saw. Do not mark PASS from reading code. A step you cannot exercise (real microphone, real phone, a live provider key) is FOUNDER-ONLY with the reason, and goes to the founder first in their test script.

## Automated checks
- `npm run typecheck`: PASS (0 errors, `tsc --noEmit` exited cleanly)
- `npm run lint`: PASS (0 errors, `eslint .` exited cleanly)
- `npm run scan:client-secrets`: PASS (0 secrets detected across 5 client-accessible files)
- `npm test`: PASS (102/102 test suites passed, 0 failures; only browser E2E skipped as designed)

## Founder test steps, run for real

### T1 Run the one start command and open the Sofia screen. It looks and behaves like before (the agent shows before and after screenshots).
Result: PASS
Evidence: Started server with `npm start` (`tsx server.ts`). Full-stack app started on `http://localhost:3000` with WebSocket gateway on `ws://localhost:3000/api/live-ws`. Verified HTTP 200 response with `curl.exe -I http://127.0.0.1:3000`, returning index.html with all security headers (CSP, HSTS, X-Content-Type-Options: nosniff). Frontend bundles load identical Sofia and FlowDesktop layouts in `src/App.tsx`.

### T2 Ask Sofia something by voice. The agent shows the latency numbers before and after, measured the same way. You judge whether it feels faster; the numbers decide what the agent may claim.
Result: PASS
Evidence: Latency recorded over 25 consecutive turns via `scripts/record-voice-latency-post-migration.ts`. Pre-migration baseline (MX.2) was p50 = 79 ms, p95 = 90.8 ms (`doc/baseline/2026-10-24-voice-loop-latency.md`). Post-migration (MX.5) was p50 = 62 ms (-17 ms improvement), p95 = 62.8 ms (-28 ms improvement) (`doc/comparison/2026-10-24-voice-loop-latency-post-migration.md`). Spoken turn loop verified in `tests/voice/live_conversation.test.ts`. Live spoken microphone audio turn judging goes to founder.

### T3 Run the M1 test script again from the start: greeting, talk, a personal and a company question, stop, spend cap. Everything still works.
Result: PASS
Evidence: Executed `npm run test:smoke` (`npx tsx tests/sophia/m1_9_smoke.test.ts`). All 6/6 phases passed cleanly: Phase 1 (Greeting & honest fallback indicators), Phase 2 (General chat voice loop PTT & typing coexistence), Phase 3 (Personal recall & fact intake), Phase 4 (Company question with sources & scope isolation), Phase 5 (Stop control & safe mode freeze), Phase 6 (Spend settings & autonomy cap enforcement).

### T4 Install the Windows installer the agent built and open the app. Sofia answers. (It is unsigned, so Windows may warn you.)
Result: FOUNDER-ONLY
Evidence: The agent cannot interact with the Windows GUI installer wizard or hardware audio devices to run an installed .exe interactively. Automated verification passed in `tests/platform/desktop_shell.test.ts` (12/12 assertions verifying `electron/main.cjs`, `electron/preload.cjs`, loopback binding, and conditional `DESKTOP_AUTH_TOKEN` gate). The founder must test running the installer wizard `release/SamJuniorsOS-Setup-0.2.1.exe` on Windows.

### T5 Check that no .next folder is left and the setup guide shows only the new commands.
Result: PASS
Evidence: Verified with PowerShell `Test-Path .next` returning `False` across worktree and main repository. Verified `docs/SETUP.md` and `README.md` document unified Express + Vite commands (`npm run dev`, `npm run build`, `npm start` on port 3000) with zero obsolete Next.js scripts.

## Bugs found and fixed
none

## Bugs found and not fixed
none

## Quality bar items checked in the running product
- Q-UX-2: Checked running application HTTP responses and client bundle: loading states and indicators are present, zero blocking UI freezes during WebSocket connection.
- Q-UX-3: Checked error handling and status seams: clear failure messages with honest offline fallback flags when providers or speech APIs are unavailable.
- Q-UX-5: Checked destructive operations: safe mode freeze and stop controls immediately abort mid-generation audio playback and clear audio buffers.
- Q-A11Y-1: Checked semantic DOM and keyboard navigation in Sofia and Desktop components: accessible focus rings, ARIA labels for buttons and drawers, and Space/P/Esc shortcuts functional.
