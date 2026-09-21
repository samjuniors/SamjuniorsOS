# SamJuniorsOS Architecture

**Document Type:** System Architecture Specification  
**Status:** AUTHORITATIVE CANONICAL REFERENCE  
**Repository Working Tree:** Commit `6a01bb2` + Phase 4C-B Working Tree (2026-09-21)

---

## 1. Purpose

SamJuniorsOS is the **AI-native company operating system** designed to operate SamJuniors through Sophia (Chief Operating Officer and central intelligence), specialized AI employees, workflows, tools, governance gates, knowledge repositories, and authoritative company state.

It serves a solo founder by turning high-level intent into verified, durable, and governed company execution without removing human authority over consequential decisions.

---

## 2. Architectural Principles

1. **One Authoritative Company Brain:** SamJuniorsOS has exactly one persistent intelligence layer (Sophia) and one authoritative state store. There are no parallel company brains, no competing state machines, and no disconnected agent silos.
2. **Deterministic Governance:** Consequential state transitions, authorization evaluations, input validations, cryptographic approval bindings, idempotency locks, and audit logging are owned by deterministic code. Probabilistic models never silently decide governance.
3. **LLMs Within Controlled Boundaries:** Large Language Models are used for drafting, synthesis, research, interpretation, and reasoned proposals. They operate strictly within bounded prompts, typed output schemas, and deterministic verification gates.
4. **Durable Execution:** Workflows, agent runs, and approval states must survive application crashes, container restarts, and network disconnects without state loss or duplicate side effects.
5. **Authoritative Backend State:** Business and operational truth lives on the server. The client is a display, inspection, and input control surface.
6. **Frontend as Presentation & Control Surface:** The user interface renders projections of server-authoritative state. The frontend never invents state, never executes unverified local mutations, and never simulates fake operational throughput.
7. **Integration Over Recreation:** Mature commodity infrastructure (WebRTC, speech-to-text engines, external email/billing APIs) is integrated via clean abstractions, not rebuilt from scratch.
8. **Least Privilege:** Agents, services, and execution steps access only the explicit data, tools, and capabilities required for their assigned domain.
9. **Auditability & Epistemic Lineage:** Every fact, claim, decision, and side effect is traced to its origin (source system, raw content hash, proposing agent, verification gate, or founder decision).
10. **Human Override:** The founder retains permanent, immediate authority to pause, reject, modify, or halt any agent, workflow, or system action.
11. **Reversible Decisions:** Groundwork, exploratory features, and state transitions must remain cleanly inspectable, checkpointed, and reversible.

---

## 3. System Layers

The actual system architecture implemented in the repository consists of the following eight vertical layers:

```
                            FOUNDER / CLIENT SURFACES
  (Desktop OS Shell · Sophia Assistant View · Spotlight · Live Companion WebSocket)
                                       ↓
                            SOPHIA COGNITIVE INGRESS
  (Turn Executor · Context Assembler · Intent Classifier · Entity Resolver · Gateway)
                                       ↓
                            EXECUTIVE ORCHESTRATION
  (MultiAgentOrchestrator 9-Step Council: COO, Researcher, PM, Finance, Verifier)
                                       ↓
                              WORK & WORKFLOW ENGINE
 (WorkflowRuntime · StateMachine · ScheduledWorkStore · Directive Schedules · Leases)
                                       ↓
                          AI WORKFORCE, TOOLS & INTEGRATIONS
 (Dr. Aris Thorne · Maya Lin · Julian Cruz · Tool Registry · GitHub · Resend · Stripe)
                                       ↓
                            VERIFICATION & GOVERNANCE
 (ConstitutionalVerifier · SideEffectAuthorizationGate · SHA-256 Payload Binding)
                                       ↓
                        AUTHORITATIVE PERSISTENCE & AUDIT
 (Prisma ORM [SQLite/Postgres] · DurableFileStore · Epistemic Vault · Audit Ledger)
                                       ↓
                         AUTHORITATIVE READ PROJECTIONS
          (GraphDTO Read Model · Activity Projection · Scheduler Projection)
```

---

## 4. Repository Structure

The repository structure reflects clean canonical boundaries with historical artifacts isolated into an inert archive:

```
SamjuniorsOS/
├── src/
│   ├── app/                      # Next.js 16 App Router shell & HTTP API routes
│   │   ├── api/                  # Authenticated server API endpoints
│   │   │   ├── activity/         # Authoritative Activity projection
│   │   │   ├── agents/           # Workforce roster & durable agent run records
│   │   │   ├── auth/             # Session verification & ws-ticket generation
│   │   │   ├── communication/    # Inbound webhooks (Resend) & outbound comms
│   │   │   ├── epistemic/        # Claims, canonical facts, verification routes
│   │   │   ├── graph/            # Authoritative GraphDTO read model endpoint
│   │   │   ├── orchestrate/      # Multi-agent executive council orchestration
│   │   │   ├── scheduler/        # Automation heartbeat & schedule inspection
│   │   │   └── workflow/         # Workflow instances, definitions, approvals
│   │   ├── design-system/        # Design system engineering laboratory
│   │   │   └── workflow/         # Canonical Visual Language specimen lab (page.tsx)
│   │   ├── layout.tsx            # Global HTML root layout
│   │   └── page.tsx              # Root route rendering canonical src/os/App
│   ├── components/               # Canonical workflow & design system primitives
│   │   ├── canonical-node.tsx    # Canonical node card primitive with geometry
│   │   ├── connector.tsx         # Connection rendering & routing primitives
│   │   ├── execution-canvas.tsx  # Interactive workflow canvas primitive
│   │   ├── flow-canvas.tsx       # Core flow canvas wrapper
│   │   ├── fx-canvas.tsx         # Canvas particle & effect engine
│   │   ├── glyphs.tsx            # Semantic SVG icons & status glyphs
│   │   ├── node-card.tsx         # Base node card surface
│   │   ├── node-orb.tsx          # Spherical entity orb visual
│   │   ├── port-bead.tsx         # Connection port anchor beads
│   │   ├── primitives.tsx        # Base layout & geometric primitives
│   │   ├── sections.tsx          # Laboratory section wrappers
│   │   ├── token-table.tsx       # Design token documentation table
│   │   ├── ui/                   # Radix UI + shadcn UI component library
│   │   └── workflow-section.tsx  # Workflow section showcase container
│   ├── os/                       # ONE Canonical SamJuniorsOS Application
│   │   ├── App.tsx               # Root OS component (Sophia View vs. Desktop OS tabs)
│   │   ├── index.css             # Canonical application styling & effects budget
│   │   ├── components/           # OS-specific UI components
│   │   │   ├── FlowDesktop.tsx   # Interactive spatial canvas with FlowEngine
│   │   │   ├── NeuralCanvas.tsx  # Ambient neural wave visual for Sophia View
│   │   │   ├── SophiaPanel.tsx   # Sophia conversational interaction panel
│   │   │   ├── os/               # Desktop chrome (Dock, Topbar, Spotlight, TodoDrawer,
│   │   │   │                     # LiveTranscriptRibbon, BootLock, PersonaModal)
│   │   │   └── surfaces/         # Standard operational surfaces (StandardSurfaces.tsx)
│   │   └── lib/                  # Client-side stores, runtime adapters, engine
│   │       ├── flow.ts           # FlowEngine, mapGraphDTOToFlowModel, routing, geometry
│   │       ├── osStore.ts        # Single client UI store fed from runtime adapter
│   │       ├── runtime.ts        # Client read-model adapter calling real server APIs
│   │       ├── field.ts          # Neural field simulation & ambient voice phrases
│   │       ├── surfaceSchema.ts  # Typed schemas for StandardSurfaces
│   │       ├── liveCompanionBridge.ts # WebSocket bridge to companion live server
│   │       └── osAudio.ts        # Audio sound effects & Web Speech API synthesis
│   ├── lib/
│   │   ├── client/
│   │   │   └── live/             # Client-side live interaction subsystem
│   │   │       ├── audio-worklet-processor.ts # 16kHz PCM AudioWorklet resampler
│   │   │       ├── live-client.ts# SophiaLiveClient (mic acquisition, PTT, frames)
│   │   │       ├── types.ts      # Client live audio & VAD type definitions
│   │   │       └── vad.ts        # Silero VAD deterministic acoustic heuristic
│   │   └── server/               # Authoritative server domain modules
│   │       ├── activity/         # Activity event projection engine
│   │       ├── advisor/          # Strategic advisory prompt definitions
│   │       ├── agents/           # Workforce definitions & AgentRunStore
│   │       ├── ai/               # Model providers & unified inference clients
│   │       ├── auth/             # Server session resolution & security middleware
│   │       ├── authorization/    # SideEffectAuthorizationGate, SHA-256 payload binding
│   │       ├── communication/    # Email & notification dispatching
│   │       ├── context/          # Canonical company context provider
│   │       ├── conversation/     # ConversationStore & message persistence
│   │       ├── coordination/     # Distributed locking & coordination
│   │       ├── db/               # Prisma client singleton & authority helpers
│   │       ├── epistemic/        # Source/Signal/Claim/Fact stores & lineage
│   │       ├── graph/            # Authoritative read-model (deriveGraphProjection)
│   │       ├── idempotency/      # Transactional deduplication records
│   │       ├── integrations/     # External services (GitHub, Stripe, Resend)
│   │       ├── knowledge/        # Canonical specs, PRDs, and documentation RAG
│   │       ├── live/             # Companion live server (Port 3001), session manager
│   │       │   └── stt/          # Provider-neutral streaming STT (Deepgram Flux)
│   │       ├── memory/           # Episodic company memory store
│   │       ├── orchestration/    # MultiAgentOrchestrator & ConstitutionalVerifier
│   │       ├── persistence/      # DurableFileStore & InstanceConcurrencyGuard
│   │       ├── sophia/           # Context assembly, intent classification, turn executor
│   │       ├── state/            # Dynamic company state records
│   │       ├── tools/            # Deterministic tool registry (SSRF, search, git)
│   │       └── workflow/         # WorkflowRuntime, state machine, scheduler engine
│   ├── types/                    # Canonical TypeScript contract definitions
│   └── proxy.ts                  # Security route middleware & session derivation
├── prisma/
│   ├── schema.prisma             # Full relational database schema
│   └── migrations/               # Database migration history
├── tests/                        # Automated unit & integration tests
│   └── sophia/                   # Test suites for cognitive & live phases
├── doc/                          # Architecture specifications, research reports, ADRs
│   ├── adr/                      # Formal Architectural Decision Records
│   └── research/                 # Deep-dive benchmark and research papers
├── docs/                         # Canonical root architecture documentation
│   └── architecture/             # Architecture decision records
├── old/                          # INERT ARCHIVE — Legacy UI generations & prototypes
└── scripts/                      # Operational & development runner scripts
```

---

## 5. Execution Model

Execution flows strictly from human intent down through governed execution:

```
Founder Directive
       ↓
Sophia (COO) ── Proposes structured council execution plan
       ↓
Executive Council Protocol:
  ├── Dr. Aris Thorne (Researcher)   → Research analysis & evidence extraction
  ├── Maya Lin (Product Manager)     → PRD authoring & step decomposition
  ├── Julian Cruz (Finance Director) → Unit economics & budget modeling
  └── ConstitutionalVerifier         → Deterministic invariant checking
       ↓
Verification Gate:
  ├── Pass   → Advances to side-effect evaluation
  └── Reject → Halts orchestration with 'verification_rejected'
       ↓
SideEffectAuthorizationGate:
  ├── Read-only / Autonomous → Executes automatically within policy limits
  └── Consequential Mutation → Enters 'awaiting_founder_approval'
       ↓
Founder Decision (SHA-256 payload-bound approval on server)
       ↓
Execution & Durable Audit (SideEffectAudit + AgentRunStore)
       ↓
Epistemic Ingress (New Verified Facts committed to Company Knowledge Vault)
```

- **Deterministic Steps:** Schema validation, SSRF checks, ConstitutionalVerifier rules, SHA-256 payload binding, authorization gating, state transitions, and audit trail generation.
- **Model Steps:** Contextual interpretation, hypothesis formulation, document drafting, and technical analysis.

---

## 6. Company State

Authoritative company state is stored in the relational database layer (`prisma/schema.prisma`), backed by `DurableFileStore` for local atomic persistence:

1. **Identity & Authority:** `User` table maintaining founder roles and security credentials.
2. **Company Operational State:** `CompanyState` storing stage, focus, product portfolio, and high-level initiatives.
3. **Canonical Knowledge:** `CompanyKnowledge` (specs, PRDs, SOPs) indexed by category and protected by SHA-256 hashes.
4. **Episodic Memory:** `CompanyMemory` capturing decisions, operational incidents, and strategic shifts with decay scoring.
5. **Workflow & Scheduling:** `WorkflowDefinition`, `WorkflowInstance`, `ScheduledWorkItem`, and `SchedulerHeartbeat`.
6. **Governance & Audit:** `ApprovalRecord` (cryptographic approval queue) and `SideEffectAudit` (immutable execution ledger).
7. **Reality Telemetry:** `TelemetryMetric` capturing production numbers from external integrations.
8. **Durable Agent Runs:** `AgentRun` capturing full execution traces, step timings, models used, and claims generated.
9. **Epistemic Pipeline:** `EpistemicSource` → `EpistemicSignal` → `EpistemicClaim` → `EpistemicVerification` → `CanonicalFact`.
10. **Coordination & Safety:** `IdempotencyRecord` and `DistributedLease` preventing concurrent duplicate execution.
11. **Conversations:** `Conversation` and `ChatMessage` recording multi-turn interactions with Sophia.

---

## 7. Graph Architecture

The operating graph visualized on the desktop canvas is a **pure read-model projection** of authoritative server state:

- **Contract (`src/types/graph.ts`):** Defines `GraphDTO`, `GraphNodeDTO`, `GraphEdgeDTO`, `GraphSpatialCardDTO`, and orthogonal state domains (`runtimeState`, `governanceState`, `epistemicValidity`, `presentationState`).
- **Read Model (`src/lib/server/graph/read-model.ts`):** 
  - `getGraphOverview()`: Asynchronously reads active runs from `AgentRunStore`, pending approvals from `SideEffectAuthorizationGate`, active workflows from `WorkflowStore`, and counts from `EpistemicClaimStore`. Fails closed (`GraphReadError`) if stores are unreachable.
  - `deriveGraphProjection()`: Pure function that computes deterministic coordinates, node geometries, relationships, and a topological SHA-256 hash.
- **Relationship Taxonomy:** Closed set of relationships: `delegates`, `researches`, `models_finance`, `authors_prd`, `checks`, `synthesizes`, `escalates-to`, `feeds`, `depends-on`.
- **Client Transformation (`src/os/lib/flow.ts`):** `mapGraphDTOToFlowModel()` maps `GraphDTO` into the client's `FlowModel` without altering semantic state or fabricating fake connections.

---

## 8. UI Architecture

The frontend provides nine distinct, non-overlapping operational surfaces:

1. **Cockpit:** High-level operational readiness, active attention items, and system health badges.
2. **Canvas (`FlowDesktop`):** Spatial layout showing relationships between Founder, Sophia, specialists, active workstreams, verifiers, and governance gates.
3. **Work:** Active workstream ledger showing stage progress and execution steps.
4. **Todo (`TodoDrawer`):** Temporal checklist for immediate founder tasks.
5. **Decisions:** Inbox of strategic business choices raised by agents.
6. **Approvals:** Governance queue holding pending side-effect authorizations awaiting founder signature.
7. **Activity:** Chronological, server-authoritative audit log of all system events.
8. **Inspector:** Contextual drawer revealing metadata, evidence lineage, and execution parameters for the selected node.
9. **Command Surface:** Quick-access modal (Spotlight `⌘K`) and Sophia natural-language query input.

---

## 9. Design System

The visual design system is documented in `DESIGN.md` and implemented across `src/components` and `src/os/index.css`:

- **Aesthetic:** Obsidian dark glass (`#01040a` void, translucent glass panels, subtle backdrop blur, layered depth).
- **Semantic Palette:** Cyan/Sky for active signals, Amber for founder attention/approval gates, Emerald for healthy/completed state, Rose for errors/blocked states, Slate for idle/offline states.
- **Execution Perimeter (`PERIMETER_LANGUAGE`):** Loading ring rendered directly on a node's own perimeter (circle or squircle), advancing clockwise from 12 o'clock based on authoritative progress (`perimeterForNode()`).
- **Brand Identity Marks:** Official flat brand marks (Google, Gemini, GitHub, Telegram, Slack, WhatsApp) rendered without synthetic tint overlays.
- **Production vs. Specimen Boundary:** Production code strictly resides in `src/os/`. The route `/design-system/workflow` (`src/app/design-system/workflow/page.tsx`) is an isolated laboratory specimen containing test controls (C6 state scrubber, F validation controls) that must never bleed into production.

---

## 10. Security Architecture

1. **Authentication:** Server-enforced session verification via `src/proxy.ts` and `src/lib/server/auth/session.ts`. Production environments reject development bypass headers and require verified tokens.
2. **Authorization Gates:** All mutating actions pass through `SideEffectAuthorizationGate.decideApproval()` using strict allowlists.
3. **Cryptographic Payload Binding:** `computeApprovalPayloadHash()` computes a SHA-256 hash over `(workflowInstanceId, stepId, payload)`. Approvals are invalid if the payload is modified.
4. **Untrusted Ingress:** Voice streams, microphone PCM chunks, STT transcripts, webhooks, and tool responses are validated at the ingress boundary before reaching Sophia or internal databases.
5. **SSRF Defense:** Outbound HTTP tools validate destination URLs against private IP ranges, cloud metadata addresses (e.g. AWS/GCP 169.254.169.254), and localhost.

---

## 11. 24/7 Operating Model

- **Continuous Background Operation:** Sophia and the SamJuniorsOS runtime remain operational independently of whether the founder has a browser tab open.
- **Heartbeat Evaluation:** `SchedulerHeartbeat` runs periodically via external triggers or internal timers, evaluating `ScheduledWorkItem` records and executing ready DAG steps.
- **Autonomous vs. Gated Actions:** Routine data aggregation, metric ingestion, and read-only research proceed autonomously 24/7. Actions requiring external mutations or financial resources pause in `awaiting_founder_approval` until the founder reviews them.
- **Office Hours Policy:** Defines notification channels, interruption thresholds, and conversational availability without halting background system processes.

---

## 12. Realtime Architecture

### Current Implementation (Working Repository Tree)
- **Live Companion Server (`src/lib/server/live/server.ts`):** Dedicated Node.js WebSocket server running on port 3001 (or `LIVE_WS_PORT`).
- **Ticket Authentication (`/api/auth/ws-ticket`):** Single-use, 60-second ephemeral tickets issued by authenticated Next.js routes.
- **Audio Ingress Pipeline (`src/lib/client/live/`):** 
  - AudioWorklet resampler converting microphone hardware inputs to 16 kHz mono Int16 PCM (512 samples / 32ms per frame).
  - Deterministic acoustic heuristic VAD (`SileroVadEngine`) gating transmission during silence.
  - Push-To-Talk (PTT) state machine gating binary WebSocket frames.
- **Streaming STT Adapter (`src/lib/server/live/stt/`):**
  - Provider-neutral contract (`STTProvider`).
  - Production adapter for Deepgram Flux STT (`DeepgramFluxProvider`).
  - Server-side audio aggregation into 80ms chunks (2560 bytes) and 128ms client pre-roll buffering.
  - Unified cognitive ingress via `executeSophiaTurn()` in `src/lib/server/sophia/turn-executor.ts`.
- **UI Bridge:** `LiveTranscriptRibbon.tsx` displaying live interim and final transcripts with PTT controls.

### Target Architecture (TARGET / NOT IMPLEMENTED)
- **LiveKit / WebRTC Media Transport:** [TARGET / NOT IMPLEMENTED] Transitioning media transport from raw WebSockets to WebRTC SFU (LiveKit) for unified audio, video, and screen streaming with sub-200ms latency.
- **Gemini Live Provider Adapter:** [TARGET / NOT IMPLEMENTED] Replacement provider adapter enabling direct bidirectional audio/visual streaming with Gemini Live models via the provider-neutral interface.
- **Camera Stream Ingress:** [TARGET / NOT IMPLEMENTED] Periodic sample-gated video frame capture from founder camera.
- **Screen Share Ingress:** [TARGET / NOT IMPLEMENTED] Change-triggered desktop display frame capture for visual context.
- **Local Realtime Node:** [TARGET / NOT IMPLEMENTED] Private on-device STT/TTS engine running on founder workstation.

---

## 13. Cloud / Local Architecture

- **Authoritative Cloud Core:** The company database, primary Sophia reasoning engine, workflow runtime, epistemic vault, and integration webhooks reside on governed server infrastructure.
- **Local Execution Boundary:** Founder hardware (microphones, webcams, displays, desktop OS hooks) acts as an authenticated sensory interface.
- **Single Source of Truth:** Local nodes never establish an independent company memory or alternate execution authority; all state synchronizes with the authoritative cloud core.

---

## 14. Automation

- **Execution Flow:** `Trigger → ScheduledWorkItem → Scheduler Evaluation → WorkflowInstance → Result`.
- **Durable Scheduling:** Schedules are defined in `directive-schedule.ts` and managed through `scheduler-store.ts`.
- **Interface:** Exposed to the founder as an inspection dashboard (schedules, execution histories, next run times, pause/resume toggles) rather than an interactive node wire builder.

---

## 15. Failure & Recovery Model

- **Atomic File Store:** `DurableFileStore` uses temporary write files and atomic renames to prevent partial file corruption on process termination.
- **Database Transactions:** Multi-entity state updates in Prisma execute within database transactions.
- **Step Retry Semantics:** Steps track `retryCount` and error logs, pausing in `failed` state rather than silently advancing.
- **Session Reconnect:** Live WebSocket sessions support a 60-second resume window (`RESUME_SESSION`), restoring session metadata upon network reconnect.
- **Turn Idempotency:** Companion server maintains turn locks preventing duplicate transcription finalizations from triggering duplicate cognitive runs.

---

## 16. Architectural Anti-Patterns

The following patterns are strictly prohibited in SamJuniorsOS:

1. **Second Sophia:** Creating alternate AI agents that claim company-wide authority or independent company memory.
2. **Duplicate Workflow Engines:** Introducing secondary DAG runners or client-side execution loops.
3. **Frontend Authority:** Granting the browser UI permission to decide approvals or bypass verification gates.
4. **Fake Production State:** Injecting simulated metrics, mock agents, or synthetic throughput into production views.
5. **Draggable Automation Builders:** Transforming the spatial context canvas into an ad-hoc node-wiring editor.
6. **Unjustified Microservices:** Splitting the core operating system into distributed microservices without operational justification.
7. **Commodity Reinvention:** Building custom WebRTC SFUs or proprietary speech recognition neural networks when robust open standards exist.
8. **Permanent Audio Connections as System Runtime:** Coupling the 24/7 uptime of Sophia to a permanently connected voice call.
9. **Siloed Voice Memory:** Storing voice conversations in a separate database from textual and workflow interactions.

---

## 17. Current Status

- **Git HEAD:** `6a01bb2` (Commit: `feat(live): implement and verify Phase 4B client VAD and audio ingress`)
- **Active Branch:** `main` (synchronized with `origin/main`)
- **Local Working Tree:** Unstaged implementation of Phase 4C-B (streaming STT adapter for Deepgram Flux, `executeSophiaTurn` cognitive ingress, `LiveTranscriptRibbon`, and tests).
- **Verified Working Subsystems:**
  - Executive Council Orchestration (Sophia, Thorne, Lin, Cruz, ConstitutionalVerifier).
  - SideEffectAuthorizationGate with SHA-256 payload binding.
  - Authoritative GraphDTO read model and Canvas FlowEngine projection.
  - Epistemic lifecycle (Sources, Signals, Claims, Verifications, Facts).
  - Live companion WebSocket server (Port 3001) with ticket authentication.
  - Client AudioWorklet 16kHz PCM streaming and Silero VAD heuristic.
  - Phase 4C-B streaming STT adapter and turn finalization idempotency.
- **Target Subsystems (NOT IMPLEMENTED):**
  - LiveKit / WebRTC media gateway.
  - Gemini Live bidirectional streaming provider.
  - Camera and screen sharing vision ingress.
  - Private local on-device runtime node.

---

## 18. Next Architecture Work

1. **Working Tree Reconciliation:** Review and commit the Phase 4C-B streaming STT implementation and test suites.
2. **LiveKit / WebRTC Gateway Design (ADR-001):** Prototype WebRTC media transport to support unified audio, camera, and screen sharing.
3. **Gemini Live Provider Adapter:** Implement the provider adapter connecting WebRTC audio to the Gemini Live multimodal API while maintaining provider replaceability.
4. **Visual Sensory Ingress:** Implement sample-gated camera and change-triggered screen capture ingestion into Sophia's context assembler.
5. **Action Routing From Realtime:** Wire realtime voice intents directly to authorized workflow dispatches and approval prompts.
6. **Local Companion Edge Node:** Design the authenticated local daemon for founder desktop interaction.
