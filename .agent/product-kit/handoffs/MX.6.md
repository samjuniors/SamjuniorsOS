# Handoff Note: MX.6 — Cutover to Vite + React + Express Stack & Obsolete Removal

- **Step:** MX.6
- **Milestone:** MX (Vite + React + Express stack migration)
- **Agent:** antigravity
- **Date:** 2026-10-24

## 1. Summary of Changes
- Verified complete removal of Next.js runtime, `next.config.*`, and `.next` build caches from repository tracking.
- Standardized single-port production and development commands:
  - `npm run dev`: Boots unified Express server with Vite middleware on port 3000 (with WebSocket companion gateway at `/api/live-ws`).
  - `npm run build`: Compiles production static frontend bundle into `dist/` via Vite in ~5s.
  - `npm start`: Runs production Express server serving `dist/` static files and handling all 74 `/api/*` endpoints.
  - `npm test`: Runs 99/99 test suites with 0 failures across the codebase.
  - `npm run test:smoke`: Runs the canonical M1 whole-path scripted smoke test across all 6 phases.
- Updated documentation and CI configurations:
  - `docs/SETUP.md`: Removed deprecated Next.js dev server and port 3001 standalone gateway references; documented unified :3000 setup, database push, and environment keys.
  - `README.md`: Updated quickstart, architectural diagrams, and script table to reflect unified Express + Vite architecture.
  - `.github/workflows/ci.yml`: Integrated `npm run scan:client-secrets` alongside Gitleaks, lint, typecheck, production build, and full tests.
- Validated whole-path Milestone M1 functionality:
  - `npm run test:smoke` passed all 6 phases (Greeting & Honest Indicators, General Chat via Voice PTT & Typing coexistence, Personal Recall, Company Questions with Sources & Scope Isolation, Stop Control mid-reply, Spend Settings & Autonomy Cap Enforcement).

## 2. Smallest-Change Ladder
- Step 1: Audited repository tree to confirm zero residual `next.config.*` or `.next` artifacts.
- Step 2: Updated `docs/SETUP.md` and `README.md` to accurately document the unified stack.
- Step 3: Added `scan:client-secrets` step to `.github/workflows/ci.yml`.
- Step 4: Executed `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:smoke` to prove end-to-end functionality.

## 3. Verification Commands & Evidence
- Smoke Test: `npm run test:smoke` -> ALL 6/6 PHASES PASSED.
- Production Build: `npm run build` -> compiled into `dist/` in 5.19s.
- Typecheck: `npm run typecheck` -> 0 errors.
- Lint: `npm run lint` -> 0 errors.
- Client Bundle Secret Scan: `npm run scan:client-secrets` -> 0 secrets detected across 5 client files.
