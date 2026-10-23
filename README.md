# SamJuniorsOS + SOFIA

> [!IMPORTANT]
> **MX stack migration transition (2026-10-23, `step/MX.1`).** [ADR 0007](doc/adr/0007-stack-migration-vite-react-express.md) accepts Vite + React + Express + TypeScript. Next.js setup, build and runtime passages further down this README are **prior-baseline documentation**, not verified instructions for MX. Read the branch's current `package.json` and `scripts/dev.mjs`; preserve existing product/governance invariants.


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

SamJuniorsOS runs out of the box with zero required external keys using built-in SQLite persistence and fallback browser speech synthesis.

### 1. Prerequisites
- **Node.js** v20+ or **Bun** v1.1+
- Windows, macOS, or Linux

### 2. Environment Configuration & Database Sync

Copy the example environment file for both Next.js and Prisma:

```bash
# Clone the repository
git clone https://github.com/samjuniors/SamjuniorsOS.git
cd SamjuniorsOS

# Install dependencies
npm install
# (or: bun install)

# Configure environment (Prisma reads .env; Next.js reads .env.local and .env)
cp .env.example .env
cp .env.example .env.local

# Initialize local SQLite database
npm run db:push
# (or: bun run db:push)
```

Configure any desired API keys in `.env.local` (see [Environment Variables](#environment-variables) below).

### 3. Running the Development Server

```bash
# Start Next.js development server
npm run dev
# (or: bun run dev)
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Running the Live Companion WebSocket Gateway (Optional)

For real-time low-latency bidirectional voice and companion streaming:

```bash
npm run dev:ws
# (or: bun run dev:ws)
```
Default gateway port: `3001` (configurable via `LIVE_WS_PORT`).

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
- `GEMINI_API_KEY`: Powers real-time live vision and audio streaming on the live companion WebSocket server (`dev:ws` on port 3001).
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

| Script | Command | Purpose |
|---|---|---|
| `dev` | `npm run dev` | Runs the full Next.js development server on port 3000. |
| `dev:ws` | `npm run dev:ws` | Runs the live companion WebSocket server on port 3001. |
| `build` | `npm run build` | Generates Prisma client, builds Next.js production bundle, and copies standalone assets. |
| `start` | `npm run start` | Boots standalone production server. |
| `test` | `npm test` | Runs the canonical test runner discovering all 71 test suites. |
| `typecheck` | `npm run typecheck` | Runs TypeScript type checking via `tsc --noEmit`. |
| `lint` | `npm run lint` | Runs ESLint verification across the repository. |
| `scan:secrets`| `npm run scan:secrets` | Runs Gitleaks secret detection across commits using `.gitleaks.toml`. |
| `db:push` | `npm run db:push` | Pushes Prisma schema changes directly to SQLite database. |
| `db:generate`| `npm run db:generate` | Regenerates Prisma TypeScript client. |

---

## Documentation

- **[`AGENTS.md`](AGENTS.md)** — Canonical engineering guardrails, architecture rules, and source of truth.
- **[`docs/SETUP.md`](docs/SETUP.md)** — In-depth setup guide, speech provider configuration, and troubleshooting.
- **[`docs/architecture/`](docs/architecture/)** — Architecture Decision Records (ADRs) and subsystem specs.

---

## License

Private & Confidential — © SamJuniors. All rights reserved.
