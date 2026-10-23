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

## The Three Surfaces

| Surface | Description |
|---|---|
| **SOFIA / SofiaUI** | **Ambient Companion & Voice Interface.** Talk to her via "Hey Sofia" or conversational text. Features holographic particle rendering, zero-latency speech pipelines, and direct OS steering. Survives tab navigation. |
| **Sophia Canvas** | **Executive Intelligence & COO.** The spatial neural canvas visualizing company context, active workstreams, epistemic claims, and company memory. |
| **SamJuniorsOS Desktop** | **Company Control Center.** Cockpit overview, Workflows DAG execution, AI Employees (Researcher, PM, Finance), Approvals gate queue, Decision logs, and Spotlight (`⌘K` / `Ctrl+K`). |

---

## Quickstart

**Branch-specific startup (`kit/integration`):** `npm run dev` executes `tsx server.ts` (Express with Vite middleware), and `npm run build` executes `vite build`. The [current setup guide](docs/SETUP.md) and [documentation audit](docs/audit/2026-10-23-kit-integration-documentation-audit.md) supersede old Next.js/`dev:ws` instructions **for this branch**. External AI/voice keys are optional for parts of the interface, but live provider capability requires configuration; a greeting alone is not an end-to-end voice test.

### 1. Prerequisites
- **Node.js** v20+ or **Bun** v1.1+
- Windows, macOS, or Linux

### 2. Environment Configuration & Database Sync

Copy the example environment file for the Express/Vite server and Prisma:

```bash
# Clone the repository
git clone https://github.com/samjuniors/SamjuniorsOS.git
cd SamjuniorsOS

# Install dependencies
npm install
# (or: bun install)

# Configure environment (server.ts loads .env.local / .env; Prisma reads DATABASE_URL)
cp .env.example .env
cp .env.example .env.local

# Initialize ONLY a disposable fresh local database (db:push uses --accept-data-loss)
# npm run db:push
```

Configure any desired API keys in `.env.local` (see [Environment Variables](#environment-variables) below).

### 3. Running the Development Server

```bash
# Start the Express/Vite server (tsx server.ts)
npm run dev
# (or: bun run dev)
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Live Companion WebSocket on this branch

The companion WebSocket is attached by `server.ts` at **`/api/live-ws`** on the same HTTP port (`3000` by default). On `kit/integration` the `dev:ws` script does **not** exist. Configure provider keys in your local environment before testing live speech. See [voice migration provenance](docs/voice/SHARED-SOFIA-VOICE-PATCH.md) and [current setup](docs/SETUP.md); do not reapply the old standalone patch.

---

## Environment Variables

See [`.env.example`](.env.example) for the complete annotated configuration. Key options include:

### Core & Database
- `DATABASE_URL`: Database connection string (`file:./db/custom.db` for SQLite).
- `APP_URL`: Base application URL (`http://localhost:3000`).

### Authentication & Governance
- `SAMJUNIORS_DEV_SECRET`: Server-side secret for Founder session validation.
- `CRON_TRIGGER_SECRET`: Machine credential for automated scheduler heartbeat ticks.

### Multimodal Brain & Speech Chains
- `GEMINI_API_KEY`: Enables Gemini features for supported voice/model routes. The branch's integrated companion WebSocket is `/api/live-ws` on the application port; availability still requires live testing.
- **Executive AI Provider:** Executive reasoning and COO chat (`POST /api/agent-chat`, `/api/orchestrate`) route through `ServerAgentExecutor` via the server AI provider (`src/lib/server/ai/zai-client.ts`), falling back honestly to deterministic analysis with `liveAi: false` when unconfigured.
- `DEEPGRAM_API_KEY`: High-fidelity real-time transcription (Nova-3).
- `ELEVENLABS_API_KEY`: Neural speech synthesis and Scribe transcription.
- `SOFIA_VOICE_ID`: Custom voice ID for ElevenLabs synthesis.

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

## Available Scripts

These reflect the inspected `kit/integration` `package.json`, not earlier Next.js scripts.

| Script | Command | Purpose |
|---|---|---|
| `dev` | `npm run dev` | Starts `tsx server.ts` with Express + Vite dev middleware (port 3000 by default). |
| `build` | `npm run build` | Runs `vite build`; production/server integration needs separate verification. |
| `start` | `npm run start` | Starts `tsx server.ts` (set and verify production environment explicitly). |
| `test` | `npm test` | Runs repository test runner; total passing suites not verified by this audit. |
| `typecheck` | `npm run typecheck` | Runs `tsc --noEmit`. |
| `lint` | `npm run lint` | Runs ESLint. |
| `db:push` | `npm run db:push` | Prisma schema push **with `--accept-data-loss`**; only for reviewed disposable databases. |
| `db:generate` | `npm run db:generate` | Generates Prisma client. |
| `audit:deps` | `npm run audit:deps` | Audits unmitigated critical dependency advisories. |
| `docs:links` | `npm run docs:links` | Checks maintained Markdown links. |
| `docs:links:all` | `npm run docs:links:all` | Checks all tracked Markdown, including historical links. |
| `test:docs` | `npm run test:docs` | Runs the link checker regression tests. |

> **Deployment caution:** The existing `Dockerfile` and staging scripts still target Next.js standalone output. They are **not verified** for this Vite/Express branch; do not deploy with them before a separate staging migration passes. [Repository hygiene audit](docs/audit/2026-10-23-kit-integration-repository-hygiene.md).

**Not present in this branch's scripts:** `dev:ws`, `scan:secrets`. Do not copy those commands from historical setup guides.

---

## Documentation

- **[`AGENTS.md`](AGENTS.md)** — Canonical engineering guardrails, architecture rules, and source of truth.
- **[`docs/SETUP.md`](docs/SETUP.md)** — In-depth setup guide, speech provider configuration, and troubleshooting.
- **[`docs/README.md`](docs/README.md)** — Reconciled documentation map, dated history and archive navigation.
- **[`doc/adr/`](doc/adr/README.md)** — Accepted Architecture Decision Records.
- **[`docs/architecture/`](docs/architecture/)** — System architecture, acceptance reports and subsystem specs.
- **[`docs/archive/`](docs/archive/README.md)** — Historical setup and audit navigation.

---

## License

Private & Confidential — © SamJuniors. All rights reserved.
