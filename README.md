# SamJuniorsOS + SOFIA

> **AI-Native Company Operating System**  
> One app, one port. Autonomous executive workflows, persistent institutional memory, deterministic governance, and real-time multimodal intelligence.

---

## Overview

SamJuniorsOS is the authoritative control surface and nervous system of SamJuniors. It combines company-wide multi-agent orchestration with **SOFIA** — the ambient holographic assistant — mounted as an always-available perceptual and voice interface.

```
                           FOUNDER
                              ↓
                            SOPHIA
                 (Persistent Company Intelligence)
                              ↓
              Plan / Understand / Reason / Propose
                              ↓
                             WORK
                              ↓
                           WORKFLOW
                     (Execution Structure)
                              ↓
            AI Employee / Tool / Integration Worker
                              ↓
                    Deterministic Verification
                              ↓
              Founder Approval (on side effects)
                              ↓
                   Durable Audit / Ledger
                              ↓
             Authoritative Company State / Outcome
```

---

## Current user interface on `kit/integration`

The Vite entry `src/App.tsx` loads `src/os/App.tsx`, which offers **Sophia** and **SamJuniorsOS** tabs. The OS tab mounts `SharedSophiaVoicePresence` and the Sofia tab loads the SofiaUI-derived surface. The branch also contains a newer `src/components/SofiaVoiceCompanion.tsx`; its intended integration status requires a separate runtime test.

This is a branch-specific source snapshot, **not a claim that voice or desktop automation passed end-to-end testing**.

---

## Quickstart (`kit/integration` runtime)

This branch uses **React + Vite + Express + TypeScript**, rather than the previous Next.js launcher. Check out the correct non-main branch before following these steps:

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

The HTTP application and integrated live WebSocket are on **port 3000** by default: `http://localhost:3000` and `ws://localhost:3000/api/live-ws`. Voice quality and real-provider access depend on the configured credentials and browser permissions; no successful live test is implied. Do **not** run `npm run dev:ws` on this branch; it is not a package script here.

For a clean install, production and testing notes, see [`docs/SETUP.md`](docs/SETUP.md) and the [current runtime map](docs/current/STACK-AND-RUN.md).

---

## Environment Variables

See [`.env.example`](.env.example) for the complete annotated configuration. Key options include:

### Core & Database
- `DATABASE_URL`: Database connection string (`file:./db/custom.db` for SQLite).
- `APP_URL`: Base application URL (`http://localhost:3000`).

### Authentication & Governance
- `SAMJUNIORS_DEV_SECRET`: Server-side secret for Founder session validation.
- `CRON_TRIGGER_SECRET`: Machine credential for automated scheduler heartbeat ticks.

### Voice and AI providers
- `GEMINI_API_KEY`: Optional live model access. Keep API keys server-side.
- `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`: Optional provider-specific speech integrations.
- `LIVE_WS_URL`: Defaults to the integrated `ws://localhost:3000/api/live-ws` endpoint in the Express entry when unset.
- `PORT`: Defaults to `3000`; `server.ts` uses this HTTP server for the live WebSocket path.

The actual provider fallback and voice connection need runtime verification. The archived Next.js and two-process setup notes are **not** instructions for this branch.

### Integrations
- `COMPOSIO_API_KEY`: Multi-agent SaaS and developer tool integration.
- `GITHUB_REPOSITORY`: Target GitHub repository for repo tools.
- `RESEND_API_KEY`: Transactional founder notifications and email drafts.

---

## Core Architectural Invariants

1. **Deterministic vs. LLM Ownership:**  
   Security authorizations, cryptographic SHA-256 approval binding, idempotency, state transitions, and database mutations are strictly deterministic. Probabilistic models draft and reason, but never bypass policy gates.
2. **SideEffectAuthorizationGate & One Execution Authority:**  
   One execution authority governs both engines (the multi-agent orchestrator for immediate directives and the workflow runtime for scheduled work). All external side effects (tool execution, financial mutations, external communications) route through the `SideEffectAuthorizationGate` singleton, requiring immutable audit logging and explicit Founder approval where policy dictates.
3. **Fail-Closed Security:**  
   In production, all executive and orchestration routes fail closed (401) if secrets are unprovisioned or untrusted headers are supplied.
4. **Single Brain, Multiple Surfaces (Not a Chain):**  
   SOFIA voice, Sophia Canvas, and SamJuniorsOS Desktop all interact with the exact same authoritative company database, memory stores, and workflow engine. The core intelligence is a unified system (not a chain of divergent disconnected bots).

---

## Available scripts on this branch

| Command | Source-backed behavior |
|---|---|
| `npm run dev` | Starts `tsx server.ts` (Express, Vite middleware, integrated WebSocket). |
| `npm run build` | Builds the Vite frontend into `dist/`. |
| `npm run start` | Starts `tsx server.ts`; in production it serves `dist/` after building. |
| `npm run typecheck` | Runs `tsc --noEmit`. |
| `npm run lint` | Runs ESLint. |
| `npm test` | Runs `node scripts/test-runner.mjs`. |
| `npm run db:push` | Synchronizes Prisma schema (destructive on incompatible local data: back up first). |

No `dev:ws` or `scan:secrets` script is defined in this branch's `package.json`. Script presence is verified in source; successful execution is **NOT VERIFIED** by this documentation audit.

---

## Documentation

- **[`AGENTS.md`](AGENTS.md)** — Canonical engineering guardrails, architecture rules, and source of truth.
- **[`docs/SETUP.md`](docs/SETUP.md)** — In-depth setup guide, speech provider configuration, and troubleshooting.
- **[`docs/README.md`](docs/README.md)** — Canonical document navigation: current runtime, architecture, research, audits and archive.
- **[`docs/architecture/`](docs/architecture/)** — Subsystem specs; formal ADRs remain under `doc/adr/`.
- **[`docs/audit/2026-10-23-kit-integration-documentation-audit.md`](docs/audit/2026-10-23-kit-integration-documentation-audit.md)** — Source-linked branch audit and preservation rules.

---

## License

Private & Confidential — © SamJuniors. All rights reserved.
