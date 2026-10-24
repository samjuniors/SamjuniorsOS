# MX.1: ADR and inventory: every Next.js-only feature in use, its replacement in Vite, React or Express, the target folder layout, the live-audio transport, and how the same server runs in the cloud and inside a desktop app

Exit evidence required: The ADR lists every use of a Next-only feature found by searching the repository (route handlers, server components and actions, middleware, next/image, next/font, next/link, environment handling, request-time database use), each with its replacement; the target layout and the migration order are stated; WebSocket versus server-sent events is chosen with the reason; the Electron approach (renderer from the Vite build, the Express server in a child or utility process, context isolation on, Node integration off) is written down and marked NOT VERIFIED until MX.7; infrastructure decision G0.3 is re-read against a long-running Node service with streaming connections and any change it needs is reported to the founder; a second agent session confirms no Next-only feature was missed.

<!-- kit-v2 -->

## Plan
1. Exhaustively scan codebase for all Next.js imports, route handlers, middleware, and config.
2. Author ADR 0007 in `doc/adr/0007-stack-migration-vite-react-express.md` covering all 6 mandatory exit topics.
3. Index ADR 0007 in `doc/adr/README.md`.
4. Re-evaluate infrastructure decision G0.3 (Single VPS + SQLite) against long-running Node.js + WebSocket streaming.
5. Define the target directory layout and phased migration plan across MX.1 to MX.7.
6. Run independent verification with a second session and record PASS.
7. What will NOT be done: No deletion of Next.js dependencies yet, no untested cutting of routes before MX.2 baseline, no deployment.

## Smallest-change ladder
Needed: Architectural blueprint and feature census required before executing stack migration away from Next.js per founder directive STACK-VITE-EXPRESS.
Already in codebase: Scanned all files across `src/`, `scripts/`, `tests/` for `next/*`, finding 68 route handlers and `src/proxy.ts` middleware.
Platform or dependency: Express HTTP routing, `ws` WebSockets, Node Web Standards `Request`/`Response`, and Vite frontend bundling.
Not built: Code cutover and package uninstall deferred to MX.3 through MX.6; Electron binary packaging deferred to MX.7.
Added: `doc/adr/0007-stack-migration-vite-react-express.md` and index entry in `doc/adr/README.md`.

## What changed
- Created `doc/adr/0007-stack-migration-vite-react-express.md` with:
  1. Complete census of 68 Next.js route handlers, middleware, layout, env variables, and assets.
  2. Concrete replacements in Express + Vite.
  3. Evaluation and selection of WebSocket (`/api/live-ws`) over SSE for bidirectional audio streaming and instant barge-in.
  4. Electron architecture with process isolation (`contextIsolation: true`, `nodeIntegration: false`, Express in utility/child process), marked NOT VERIFIED until MX.7.
  5. Infrastructure decision G0.3 re-read: confirms Option A (Single VPS + persistent volume + SQLite) fits long-running Node.js streaming connections better than serverless Next.js, with 0 budget change needed.
  6. Target folder layout and 7-stage migration roadmap.
- Updated `doc/adr/README.md` index table to register ADR 0007.

## Why
Provides the binding architectural foundation for milestone MX so agents and engineers execute the Vite + React + Express migration deterministically without regressions, missing routes, or broken security boundaries.

## Verification
- Comprehensive repository search executed via `git grep`:
  - `git grep -n "next/"`: Verified all 68 route handlers and proxy references accounted for.
  - `git grep -n "next/image"`: 0 active component imports found.
  - `git grep -n "next/font"`: 0 active component imports found.
  - `git grep -n "next/link"`: 0 active component imports found.
  - `git grep -n "next/navigation"`: 0 active component imports found.
- ADR file format and requirements validated against `AGENTS.md` §14 and milestone MX.1 specification.

## Shortcuts taken
none

## Remaining risks
- Legacy test files that mock or import `@/proxy` directly will need to be transitioned to test Express middleware in MX.3.

## Findings opened
none
