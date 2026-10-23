# Local setup — `kit/integration` (Vite + Express)

> **Branch scope:** Source-inspected on 2026-10-23 at `d209f67`. Commands and paths reflect `kit/integration`. An end-to-end installation, production deployment, voice interaction and CI pass are **NOT VERIFIED** here. The previous Next.js-era setup is preserved [in the archive](archive/setup/SETUP-PRE-VITE-2026-10-21.md).

## Runtime layout

| Component | Location / invocation |
|---|---|
| Dev HTTP server | `npm run dev` = `tsx server.ts`; default port **3000** |
| Dev frontend | Vite middleware on the same Express server (`vite.config.ts`) |
| Production frontend | `npm run build` outputs `dist/`, served by `server.ts` with `NODE_ENV=production` |
| Integrated live socket | `ws://localhost:3000/api/live-ws` (or equivalent host/`PORT`) |
| Status endpoint | `GET http://localhost:3000/api/status` (basic Express status route) |
| Canonical adapters | `src/server/api.ts` mounted at `/api` |
| SQLite/Prisma | `prisma/schema.prisma` and `DATABASE_URL` in environment |
| UI entry | `src/App.tsx` → `src/os/App.tsx` |

`scripts/dev.mjs` is retained in the repository but is **not** the `npm run dev` entry on this branch. The older `dev:ws` two-process command does not exist in this branch's `package.json`.

## Install in a new local checkout

```bash
git clone https://github.com/samjuniors/SamjuniorsOS.git
cd SamjuniorsOS
git fetch origin kit/integration
git switch kit/integration
npm install
cp .env.example .env
cp .env.example .env.local
npm run db:push
npm run dev
```

**Important:** `db:push` is configured with `--accept-data-loss`. **Do not run it on a database containing irreplaceable data without a backup**. For an existing checkout, review `git status --short --branch` and preserve uncommitted work before switching branches.

Open `http://localhost:3000`. Expect the integrated WebSocket listener at `/api/live-ws`. Do not put server keys into client-side `VITE_` variables or commit `.env*` with secrets.

## Safe smoke checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

With the server running in another terminal:

```bash
curl -i http://localhost:3000/api/status
```

These commands are **recommended checks, NOT RUN in the GitHub-only audit**. If any fail, do not claim the branch is launch-ready. To exercise voice, check browser microphone permissions, a connected session, spoken response, interruption and tab switching independently. Do not use a successful greeting as proof of conversational turn handling.

## Production caution

A `build` script and `start` script exist; this is **not** certification of deployment readiness. Auth, storage mode, provider credentials, HTTPS/WSS origin, external effects and database backups must meet `AGENTS.md` before production. Use actual environment configuration and tests rather than assuming prior Next.js deploy notes still apply.

## Reference status

- [Current stack and API map](current/STACK-AND-RUN.md)
- [Documentation index](README.md)
- [Source-backed documentation audit](audit/2026-10-23-kit-integration-documentation-audit.md)
- [Retained prior setup](archive/setup/SETUP-PRE-VITE-2026-10-21.md) — **HISTORICAL / DO NOT FOLLOW** on this branch.
