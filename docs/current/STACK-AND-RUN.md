# Current stack and run contract — `kit/integration`

**Status:** SOURCE-VERIFIED, RUNTIME NOT VERIFIED · 2026-10-23.  
**Scope:** `samjuniors/SamjuniorsOS` branch `kit/integration` at `d209f67b`. Does not describe the separate Orbit plugin or SofiaUI repository.

## What runs

- **Frontend:** React 19 in Vite (`vite.config.ts`, `index.html`, `src/main.tsx` / `src/App.tsx` entry); output directory `dist/`.
- **Backend:** Express in `server.ts`; on development start, it attaches Vite middleware, and on production start it serves `dist/`.
- **API:** `src/server/api.ts` adapts existing `src/app/api/**/route.ts` modules; the directory name does **not** mean the active server is Next.js.
- **Realtime:** integrated `ws` WebSocket server on `/api/live-ws` sharing Express `PORT`, default 3000; a legacy live-server module also remains. Its presence is not proof that both pathways are active or mutually isolated.
- **Application:** `src/App.tsx` mounts the SamJuniorsOS shell (`src/os/App.tsx`), which includes a Sofia screen and OS desktop. A newly introduced `src/components/SofiaVoiceCompanion.tsx` exists but is not directly referenced in the inspected main entry: its shipped UI status is **UNVERIFIED**.
- **Persistence:** Prisma schema and existing server-side stores remain in the repository. Durable behavior and safety of migrations require direct tests.

## Confirmed scripts (from `package.json`)

```text
dev       tsx server.ts
start     tsx server.ts
build     vite build
lint      eslint .
typecheck tsc --noEmit
test      node scripts/test-runner.mjs
```

`npm run dev:ws` is **not defined**; old instructions for standalone port 3001 are obsolete here. The `server.ts` default is `PORT=3000`.

## Endpoint examples (read-only observation)

- `GET /api/status`: explicit Express route.
- `POST /api/chat` and `POST /api/tts`: explicit Express routes; protect by actual server policy, not by this document.
- `/api/live-ws`: integrated WebSocket endpoint.
- `/api/*`: Express modular router, see `src/server/api.ts`.

No claim is made that provider authentication, voice, audio output, database migrations, deployment or all adapters passed execution tests.

## Canonical documents, and what is historical

- **Binding policy:** [`AGENTS.md`](../../AGENTS.md); **product scope:** [`PRODUCT.md`](../../PRODUCT.md).
- **How to run this branch:** [`docs/SETUP.md`](../SETUP.md).
- **Milestone source:** [`.agent/product-kit/milestones.json`](../../.agent/product-kit/milestones.json), from which [`MILESTONES.md`](../../.agent/product-kit/MILESTONES.md) is generated.
- **Historical baseline:** [`doc/ROADMAP.md`](../../doc/ROADMAP.md); not the current executable milestone scheduler.
- **Implementation-layout claims needing revision:** [`ARCHITECTURE.md`](../../ARCHITECTURE.md) sections 4 and 12; its governance principles remain subject to `AGENTS.md`.

For preservation decisions and the exact audit boundary, consult the [2026-10-23 documentation audit](../audit/2026-10-23-kit-integration-documentation-audit.md).
