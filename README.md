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

SamJuniorsOS runs out of the box with zero required external keys using built-in SQLite persistence and fallback browser speech synthesis.

### 1. Prerequisites
- **Node.js** v20+ or **Bun** v1.1+
- Windows, macOS, or Linux

### 2. Installation & Database Sync

```bash
# Clone the repository
git clone https://github.com/samjuniors/SamjuniorsOS.git
cd SamjuniorsOS

# Install dependencies
npm install
# (or: bun install)

# Initialize local SQLite database
npm run db:push
# (or: bun run db:push)
```

### 3. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env.local
```

Configure any desired API keys in `.env.local` (see [Environment Variables](#environment-variables) below).

### 4. Running the Development Server

```bash
# Start Next.js development server
npm run dev
# (or: bun run dev)
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Running the Live Companion WebSocket Gateway (Optional)

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
- `GEMINI_API_KEY`: Google Gemini API key for multimodal reasoning, live vision, and audio turns.
- `DEEPGRAM_API_KEY`: High-fidelity real-time transcription (Nova-3).
- `ELEVENLABS_API_KEY`: Neural speech synthesis and Scribe transcription.
- `SOFIA_VOICE_ID`: Custom voice ID for ElevenLabs synthesis.
- `SOPHIA_BRAIN_MODE`: Brain selection (`auto` | `gemini` | `ollama` | `lmstudio`).
- `OLLAMA_BASE_URL` / `LMSTUDIO_BASE_URL`: Local self-hosted LLM endpoints.

### Integrations
- `COMPOSIO_API_KEY`: Multi-agent SaaS and developer tool integration.
- `GITHUB_REPOSITORY`: Target GitHub repository for repo tools.
- `RESEND_API_KEY`: Transactional founder notifications and email drafts.

---

## Core Architectural Invariants

1. **Deterministic vs. LLM Ownership:**  
   Security authorizations, cryptographic SHA-256 approval binding, idempotency, state transitions, and database mutations are strictly deterministic. Probabilistic models draft and reason, but never bypass policy gates.
2. **SideEffectAuthorizationGate:**  
   All external side effects (tool execution, financial mutations, external communications) require immutable audit logging and explicit Founder approval where policy dictates.
3. **Fail-Closed Security:**  
   In production, all executive and orchestration routes fail closed (401) if secrets are unprovisioned or untrusted headers are supplied.
4. **Single Brain, Multiple Surfaces:**  
   SOFIA voice, Sophia Canvas, and SamJuniorsOS Desktop all interact with the exact same authoritative company database, memory stores, and workflow engine.

---

## Available Scripts

| Script | Command | Purpose |
|---|---|---|
| `dev` | `npm run dev` | Runs the full Next.js development server on port 3000. |
| `dev:ws` | `npm run dev:ws` | Runs the live companion WebSocket server on port 3001. |
| `build` | `npm run build` | Generates Prisma client, builds Next.js production bundle, and copies standalone assets. |
| `start` | `npm run start` | Boots standalone production server. |
| `db:push` | `npm run db:push` | Pushes Prisma schema changes directly to SQLite database. |
| `db:generate`| `npm run db:generate` | Regenerates Prisma TypeScript client. |
| `lint` | `npm run lint` | Runs ESLint verification across the repository. |

---

## Documentation

- **[`AGENTS.md`](AGENTS.md)** — Canonical engineering guardrails, architecture rules, and source of truth.
- **[`docs/SETUP.md`](docs/SETUP.md)** — In-depth setup guide, speech provider configuration, and troubleshooting.
- **[`docs/architecture/`](docs/architecture/)** — Architecture Decision Records (ADRs) and subsystem specs.

---

## License

Private & Confidential — © SamJuniors. All rights reserved.
