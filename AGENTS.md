# AGENTS.md — Canonical Engineering Guardrails & Source of Truth

**Product:** SamJuniorsOS — AI-Native Company Operating System  
**Status:** AUTHORITATIVE & BINDING  
**Authority:** Highest documentation priority for all AI agents, engineers, and contributors.

---

## 1. SOURCE OF TRUTH

When determining implementation status, architecture, or behavior, all agents must adhere to the following strict hierarchy of authority:

1. **Current local repository and working code** (the active files in `src/`, `prisma/`, `scripts/`, `tests/`)
2. **Current architecture documentation** (`AGENTS.md`, `ARCHITECTURE.md`, `docs/architecture/`, `doc/adr/`)
3. **Current official/primary external documentation** (e.g. Next.js, Prisma, WebRTC specifications)
4. **Current automated tests and runtime evidence** (`tests/`, verifiable test execution)
5. **Previous reports, worklogs, and conversation context** (`WORKLOG.md`, chat history)
6. **Model pre-training knowledge** (general assumptions, training data)

### Mandatory Rules
- **Inspect before claiming:** Never claim an implementation status without inspecting the current local repository working tree.
- **Local tree over remote:** Work against the current local repository. Do NOT assume `origin/main` or GitHub remote is authoritative if local is ahead or has unstaged work.
- **No speculative implementation:** Never invent files, directories, dependencies, or architectural subsystems that do not exist in the code.
- **No fabrication:** Never fabricate test runs, mock outputs, fake metrics, or unverified claims. If evidence is lacking, state **NOT VERIFIED**.

---

## 2. PRODUCT BOUNDARIES

SamJuniorsOS is the **internal company operating system** for SamJuniors. It exists to operate the company itself through Sophia, AI employees, workflows, tools, governance, knowledge, and company state.

### Explicit Entity Boundaries
- **SamJuniors Website** (`samjuniors.com`): The public company marketing and web presence.
- **Lumora**: Product 1 of SamJuniors (an educational AI product). It is an external product managed *by* the company, not the operating system itself.
- **SamJuniorsOS**: The private company operating system (this repository). It is the control surface, nervous system, and memory of SamJuniors.
- **Future Products**: Remain separate entities until verified by explicit founder decision and code evidence.

### Anti-Cloning Rule
- Do **NOT** turn SamJuniorsOS into a clone of another product (OpenManus, Hermes, Devin, Claude Code, etc.).
- Competitive products, research papers, and open-source frameworks are **references and design inputs**, never binding specifications.
- Do not create parallel products, parallel companies, or parallel brains inside this repository.

---

## 3. CORE ARCHITECTURAL PRINCIPLE

SamJuniorsOS has **ONE authoritative company intelligence and state system**.

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

### Invariants
1. **One Sophia:** Sophia is the persistent company intelligence and Chief Operating Officer. She is not an isolated chatbot, not an ephemeral script, and not a voice toy.
2. **Workers are capabilities:** AI employees (Dr. Aris Thorne/Researcher, Maya Lin/PM, Julian Cruz/Finance) are execution specialists, not independent company brains.
3. **Workflows are execution structures:** Workflows coordinate multi-step deterministic and agentic work. They do not hold independent company truth.
4. **UI is a representation and control surface:** The frontend (`src/os`, `src/app`) visualizes authoritative server state and dispatches authenticated commands. The frontend must **never** become an alternate execution authority or fabricate business state.

---

## 4. SOPHIA & COMPANY GOVERNANCE MODEL

### Deterministic vs. LLM Ownership

The boundary between deterministic code and probabilistic models is non-negotiable:

| Domain | Owner | Invariant |
|---|---|---|
| **Authorization** | Deterministic Code | Strict server-side allowlists (`SideEffectAuthorizationGate`). Never trusts client claims. |
| **Validation** | Deterministic Code | Cryptographic hash checks, schema validation (Zod), SSRF filters, type checking. |
| **State Transitions** | Deterministic Code | Explicit finite state machines (`WorkflowRuntime`, `LiveInteractionServer`). |
| **Approval Binding** | Deterministic Code | Cryptographic SHA-256 canonical payload hashing. Fails closed if tampered. |
| **Idempotency** | Deterministic Code | Unique keys, deduplication windows, distributed leases (`IdempotencyRecord`). |
| **Audit & Ledger** | Deterministic Code | Append-only immutable records (`SideEffectAudit`, `AgentRunStore`). |
| **Persistence** | Deterministic Code | Relational and atomic stores (`Prisma`, `DurableFileStore`). |
| **Security Boundaries**| Deterministic Code | Session tokens, route middleware, ticket consumption, fail-closed guards. |
| **Drafting & Synthesis**| LLMs | Research summaries, PRD drafting, code analysis, creative proposals. |
| **Interpretation** | LLMs | Conversational query parsing, candidate intent classification (prior to deterministic gates). |
| **Reasoning** | LLMs | Bounded domain analysis within specialist instructions. |

**Critical Rule:** LLMs must never silently become the authority for deterministic governance, security access, financial expenditures, or database mutations.

---

## 5. 24/7 COMPANY MODEL

"24/7 Sophia" means the **company operating system remains alive, responsive, and operationally continuous**, even when the founder is asleep or offline.

### What 24/7 Means
- Authoritative company state remains durable and accessible.
- Scheduled workflows (`ScheduledWorkItem`, `SchedulerHeartbeat`) execute autonomously at their designated times.
- Inbound webhooks and external events (GitHub, Stripe, Resend) are captured, verified, and processed.
- Autonomous background monitoring, telemetry ingestion, and epistemic claim processing continue.
- Urgent issues are triaged, prepared, and queued in the founder's Attention and Decisions inboxes.

### What 24/7 Does NOT Mean
- The founder is NOT required to remain online or keep a browser open.
- A voice, WebRTC, or WebSocket session is NOT kept permanently connected.
- A single LLM process or infinite generation loop is NOT left spinning forever.
- Autonomous agents do NOT bypass approval gates for side effects while the founder is away.

### Office Hours as Policy Layer
Office hours represent an **operational policy layer**, not system uptime:
- During office hours: Real-time notifications, interactive desktop nudges, voice sessions, and immediate escalation.
- After office hours: Non-urgent notifications are batched into morning briefings; autonomous work proceeds strictly within read-only and safe internal bounds; side-effect mutations remain queued in `awaiting_founder_approval`.
- **Never shut down Sophia or disable background automation merely because office hours have ended.**

---

## 6. REALTIME / VOICE / VISION ARCHITECTURE

Realtime interaction is an **ephemeral interface and sensory capability** of SamJuniorsOS, **NOT a second Sophia**.

### Conceptual Pipeline
```
Browser / Desktop / Companion App
               ↓
Realtime Transport / Media Session (WebRTC / Secure WebSocket)
               ↓
Realtime Gateway (Authentication, Turn Management, Ingress Telemetry)
               ↓
Provider Adapter (STT / LLM / TTS abstraction layer)
               ↓
Sophia / Core Engine (Unified Cognitive Ingress via executeSophiaTurn)
               ↓
Existing Work / Workflow / Agent / Tool / Governance Architecture
```

### Realtime Principles
- **No "Voice Sophia" or "Camera Sophia":** There is only ONE Sophia. Whether a command arrives via voice, text chat, spotlight, scheduled trigger, or API directive, it routes through the exact same cognitive and governance pipeline.
- **Ephemeral Session vs. Persistent Brain:** The realtime connection is an ephemeral session. The company memory, conversations, and state are persistent in the database. A dropped call or network blip must never corrupt company memory or lose workflow state.
- **Provider Replaceability:** The system must not hard-code `Gemini = Sophia` or `Deepgram = Voice`. All model and media providers must sit behind provider-neutral interfaces (`STTProvider`, `LiveGatewayAdapter`).
- **Session Inputs vs. Company Memory:** Audio waveforms, video streams, and screen captures are transient session inputs. They do NOT become company memory by default. Only verified transcripts, explicit user directives, and approved artifacts are committed to persistent storage.
- **Camera and Screen Separation:** Camera (real-world environment) and Screen (computer workspace) are distinct sensory modalities with different frame rates, privacy considerations, and processing pipelines.
- **No Continuous Frame Waste:** Continuous media transport does NOT imply continuous model inference on every single 60 FPS video frame. Vision inference must be sample-gated, change-triggered, or user-prompted.

---

## 7. CLOUD / LOCAL ARCHITECTURE

The architectural destination of SamJuniorsOS is:
**ONE Sophia · ONE Authoritative Company State · MULTIPLE Execution Surfaces**

### Cloud Responsibility (Authoritative Center)
- Authoritative company state, databases, and relational schemas.
- Sophia's central reasoning, executive council orchestration, and workflow engine.
- Governed institutional memory, canonical facts, and epistemic claims.
- Production integrations (GitHub, Stripe, Resend, external APIs).
- Immutable audit ledger and governance policy enforcement.

### Local Responsibility (Perceptual & Execution Boundary)
- Founder hardware interfaces: microphone, speakers, camera, screen capture.
- Local voice activity detection (VAD), client-side audio resamplers, audio ring buffering.
- Optional local low-latency speech synthesis or local open-weight transcription (e.g. Qwen-ASR / Whisper).
- Optional local operating-system automation and desktop control tools.
- Degraded offline sensory cache.

**Rule:** A local runtime must **never** directly declare itself an alternate authoritative company database. Local nodes communicate with Cloud Sophia through authenticated, typed contracts.

---

## 8. CANVAS & UI ARCHITECTURE

The Canvas (`src/os/components/FlowDesktop.tsx`) is a **spatial representation of company context**.

### What Canvas Is NOT
- It is NOT a node-and-wire workflow builder.
- It is NOT a visual DAG editor.
- It is NOT a visual programming scratchpad.
- It is NOT an agent-to-agent message-passing diagram.

### Functional Boundary of UI Surfaces
| Surface | Primary Question / Purpose |
|---|---|
| **Cockpit** | *What needs attention right now?* (Alerts, open attention items, company health). |
| **Work / Workflow** | *What is being executed?* (Active workstreams, execution trails, stage progress). |
| **Canvas** | *How does company context, active work, and governance relate spatially?* |
| **Todo** | *Actionable temporal tasks for the founder.* |
| **Decisions** | *Authority and decision inbox requiring founder choice.* |
| **Approvals** | *Governance gate queue holding side effects pending cryptographic approval.* |
| **Activity** | *Chronological, server-authoritative audit log of what happened.* |
| **Inspector** | *Contextual deep-dive into the selected entity, claim, or run.* |
| **Command Surface** | *Spotlight (⌘K) and Sophia conversational input bar.* |

**Rule:** Never duplicate authoritative data or create simulated node activity merely to produce visual canvas effects. Every node, edge, and comet on the Canvas must derive from authoritative server state.

---

## 9. GRAPH READ-MODEL AUTHORITY

`GraphDTO` and the server read model (`src/lib/server/graph/read-model.ts`) are the **sole source of truth** for production graph topology.

### Invariants
1. **Authoritative Projection Only:** The graph is a strictly read-only projection of database and store state (`AgentRun`, `ApprovalRecord`, `WorkflowInstance`, `EpistemicClaim`).
2. **Orthogonal State Domains:** Runtime state (`idle`, `running`, `completed`), governance state (`awaiting_founder_approval`, `approved`), epistemic validity (`unverified`, `promoted_to_fact`), and presentation state (`waiting`, `active`) must remain strictly orthogonal.
3. **Approval Boundary Distinction:** `awaiting_founder_approval` maps to presentation state `'waiting'` (amber seal). It must **NEVER** map to `'processing'` or animate as active execution.
4. **Deterministic SHA-256:** `deriveGraphProjection()` must produce an identical topology, coordinate layout, and SHA-256 hash for identical database inputs.
5. **No Parallel Graphs:** Do NOT create parallel graph databases, client-invented graph nodes, or mock topologies.
6. **Client Transformation:** `mapGraphDTOToFlowModel()` in `src/os/lib/flow.ts` is the single authorized client adapter converting `GraphDTO` into the renderable `FlowModel`.

Before proposing any change to the graph contract:
1. Inspect `src/types/graph.ts` (`GraphDTO`).
2. Inspect `deriveGraphProjection` in `src/lib/server/graph/read-model.ts`.
3. Inspect `getGraphOverview` in `src/lib/server/graph/read-model.ts`.
4. Inspect the relationship taxonomy (`delegates`, `researches`, `models_finance`, `authors_prd`, `checks`, `escalates-to`, `feeds`, `depends-on`).
5. Inspect `mapGraphDTOToFlowModel` in `src/os/lib/flow.ts`.

---

## 10. AUTOMATION MACHINERY

Automation in SamJuniorsOS is **backend execution machinery**, not a frontend canvas puzzle.

```
Trigger (Cron / Event / Webhook / Founder Directive)
                     ↓
             ScheduledWorkItem
                     ↓
              Scheduler Engine (Heartbeat evaluation)
                     ↓
             Workflow Instance
                     ↓
             Execution & Result
```

- The automation UI displays: schedule cadence, status, next execution time, pause/resume toggles, and execution logs.
- Do NOT build draggable canvas wiring interfaces for automations unless explicitly approved as a separate product decision.

---

## 11. SECURITY & PERMISSION BOUNDARIES

Security is an absolute default requirement across all layers:

1. **Fail-Closed Authentication:** Any request to privileged routes (`/api/orchestrate`, `/api/workflow/*`, `/api/agents/*`, `/api/epistemic/*`, `/api/auth/ws-ticket`) must authenticate the session server-side. Unauthenticated calls fail immediately.
2. **Founder Identity Allowlist:** Authorizations enforce a strict server-side Founder identity check. Client headers (e.g. `x-samjuniors-dev-as: founder`) and client cookies are rejected in production.
3. **Payload Binding:** Founder approvals require SHA-256 canonical tuple hashing (`payloadHash = sha256(canonical(workflowInstanceId, stepId, payload))`). Execution halts if the payload differs by a single byte.
4. **Untrusted Ingress:** Voice transcripts, incoming webhooks, external tool outputs, and LLM text generations are treated as **untrusted user input**. They must never bypass validation gates or execute direct database mutations without policy evaluation.
5. **Least Privilege:** Specialized agents have access only to their assigned domain tools and memory partitions.
6. **Zero Client Secrets:** Production secrets, provider API keys, and database credentials must never be passed to the browser client.

---

## 12. FAILURE & RECOVERY MODEL

Every autonomous, agentic, and realtime subsystem must be engineered for resilience:

- **Process Restarts:** Workflow instances, agent runs, approvals, and scheduler states must be durably persisted. If the Node.js process crashes, the next instance must recover state cleanly without data loss.
- **Idempotency:** Re-executing a workflow step, re-transmitting a message, or duplicate webhook delivery must not cause duplicate side effects. Use `IdempotencyRecord` and unique execution references.
- **Distributed Concurrency:** Multiple instances or rapid scheduler evaluations must be guarded by leases (`DistributedLease` / `InstanceConcurrencyGuard`).
- **Network Disconnections:** Realtime sessions (WebSockets/WebRTC) must support reconnection windows (e.g., 60-second resume window) and preserve state across transient disconnects.
- **Provider Fallbacks:** Model timeouts, rate limits, and provider API deprecations must fail gracefully with explicit error logging, without corrupting state or hanging workflows indefinitely.
- **Human Override:** The founder must always have the authority to halt, cancel, or modify any in-flight workflow, agent run, or approval.

---

## 13. BUILD VS. BUY STRATEGY

Do not spend founder capital and engineering time rebuilding mature commodity infrastructure.

| Domain | Prefer External / Commodity | Build Differentiated In SamJuniors |
|---|---|---|
| **Media Transport** | LiveKit, WebRTC, standard protocols | Custom realtime gateway adapters, turn state machines |
| **Speech Audio** | Deepgram, specialized STT/TTS services | Cognitive ingress, intent classification, memory extraction |
| **Commodity Integrations** | Official APIs (GitHub, Resend, Stripe) | Epistemic provenance extraction, cross-system synthesis |
| **Databases** | PostgreSQL, Prisma ORM, standard storage | Governed epistemic schemas, graph read-model projection |
| **Core Value** | *Never attempt to recreate vendor clouds* | **Authoritative company state, Sophia intelligence, governance gates, institutional memory** |

---

## 14. ARCHITECTURAL CHANGE PROTOCOL

Before introducing any new subsystem, library, dependency, or architectural pattern:

1. **Read `AGENTS.md` and `ARCHITECTURE.md`.**
2. **Inspect the current working repository** for existing abstractions.
3. **Check product boundaries:** Does this belong in SamJuniorsOS?
4. **Evaluate Build vs. Buy:** Is this reinventing commodity infrastructure?
5. **Evaluate Security:** Does this violate trust boundaries or fail-closed rules?
6. **Check for Duplication:** Does this create a second Sophia, second brain, second workflow engine, or second store?
7. **Document the Decision:** Record the decision in `docs/architecture/` using the Architecture Decision Record (ADR) template:
   - STATUS
   - DECISION
   - WHY
   - ALTERNATIVES CONSIDERED
   - BOUNDARIES
   - RISKS
   - MIGRATION / REVERSIBILITY
   - NEXT ACTION

**Rule:** Never implement a new subsystem simply because it is technically interesting or novel.

---

## 15. AGENT BEHAVIOR & INTELLECTUAL HONESTY

AI agents working on this codebase must adhere to the highest standard of technical rigor:

- **Challenge Weak Assumptions:** Do not automatically agree with flawed proposals. If a design violates security, creates duplicate architecture, or breaks invariants, challenge it respectfully with technical evidence.
- **Decision Template:** For all consequential decisions, structure recommendations as:
  - **VERDICT:** Clear, unequivocal stance.
  - **WHY:** Concrete architectural and operational rationale.
  - **CHALLENGE:** Risks, edge cases, or counterarguments considered.
  - **EVIDENCE:** Verified repository files, line numbers, or test results.
  - **RISKS:** Downstream maintenance, security, or performance implications.
  - **NEXT ACTION:** Immediate, reversible, verifiable next step.
- **Say NOT VERIFIED:** When you have not tested or verified a claim in the active codebase, explicitly state **NOT VERIFIED**. Never present speculation as verified code reality.

---

## 16. GIT & REPOSITORY HYGIENE

- **Inspect working state first:** Run `git status` and inspect modified/untracked files before beginning work.
- **Never force-push:** Force-pushing (`git push --force`) is strictly forbidden.
- **Preserve history:** Never rewrite history or delete commits to make the repository look tidy.
- **No unapproved pushes:** Do not push to remote repositories unless explicitly instructed by the founder.
- **Keep commits focused:** Separate architectural documentation, structural refactoring, and feature implementations into clean, distinct commits.
