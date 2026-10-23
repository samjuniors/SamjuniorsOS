# SamJuniorsOS local setup — `kit/integration` runtime

> **Branch-specific guidance (documentation reconciled 2026-10-23).** Inspected source: `package.json`, `server.ts`, `vite.config.ts`, `src/server/api.ts` on `kit/integration` at `d209f67`. The runnable scripts are **Express + Vite**, not the previous Next.js dev server. These commands have **not** been executed by this documentation audit; an actual local install and checks remain required. The [older Next.js-oriented guide is preserved verbatim](archive/legacy-setup-nextjs-2026-10-23.md).

## Prerequisites

- Node.js 20+ and npm, or a compatible Bun runtime; local installation compatibility still requires verification.
- Git and any credentials for providers you choose to enable.
- A fresh test database for first-run schema initialization; do not run destructive schema pushes against important data.

## Start the inspected branch

```sh
git clone --branch kit/integration https://github.com/samjuniors/SamjuniorsOS.git
cd SamjuniorsOS
npm install
cp .env.example .env
# Configure only the variables you need; never commit .env or .env.local.
npm run dev
```

Open **http://localhost:3000**. In this branch `npm run dev` executes **`tsx server.ts`**. `server.ts` creates the HTTP server, mounts Express API routes and uses Vite middleware in development. `npm run build` executes **`vite build`** and `npm run start` also runs **`tsx server.ts`**; do not infer production readiness from these script names alone.

The server loads `.env.local` and `.env`. Prisma reads `DATABASE_URL` through its own environment handling. For a **disposable fresh local database only**, the available initialization command is `npm run db:push`; note that its package script includes `--accept-data-loss`. Prefer a reviewed migration/backup procedure for any existing database.

## Voice and WebSocket

- The inspected `server.ts` attaches a companion WebSocket at **`/api/live-ws`** on the **same HTTP port** (default 3000). The default local URL is `ws://localhost:3000/api/live-ws`.
- It initializes `LIVE_WS_TICKET_SECRET` if absent for that process, and enables the companion gateway by default when the flag is not set. These source facts do **not** prove a deployed voice session works.
- `GEMINI_API_KEY` supports the direct Gemini functionality; `DEEPGRAM_API_KEY` supports Deepgram speech transcription in the relevant backend path. Credentials and available fallback behavior depend on the selected provider. No live audio result is claimed here.
- **Do not run `npm run dev:ws` on this branch:** there is no `dev:ws` package script. Do not re-apply the old shared-voice patch to this branch; consult the [historical patch note](voice/SHARED-SOFIA-VOICE-PATCH.md) for context only.

## Verify instead of assuming

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Inspect the actual exit codes. These checks are **NOT RUN** as part of this remote documentation reconciliation. If a check fails, capture the command, branch, exact error and relevant environment without sharing tokens or secrets.

Manual checks: load the page at port 3000, authenticate as appropriate for local development, verify a text conversation, grant microphone access on `localhost` or HTTPS, and complete at least five voice turns including interruption and tab switching. A generated greeting alone does not prove speech recognition or continuous turn-taking.

## Troubleshooting and provenance

| Symptom | First thing to verify |
| --- | --- |
| `npm run dev:ws` says missing script | Expected on `kit/integration`; WebSocket is mounted by `server.ts`. |
| Docs mention Next.js standalone server or `scripts/dev.mjs` | Those are **historical/possible legacy** instructions, not the inspected package entrypoint. |
| No response after a voice greeting | Check transcript, WebSocket frames, provider errors and completion of the model/audio turn; a greeting is not a turn-completion test. |
| Prisma engine download fails | Inspect local network access and `npm install`/postinstall logs before modifying lockfiles. |
| `db:push` reports data loss | Do not continue against a database with data to preserve; take a verified backup and review migrations first. |

Additional context: [documentation audit](audit/2026-10-23-kit-integration-documentation-audit.md), [documentation map](README.md), [environment example](../.env.example), [accepted ADRs](../doc/adr/README.md).
