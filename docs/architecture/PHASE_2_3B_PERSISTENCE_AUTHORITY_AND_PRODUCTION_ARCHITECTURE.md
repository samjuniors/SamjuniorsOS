# PHASE 2.3B — Persistence Authority & Production Architecture Design

**Status:** DRAFT — REVISED FOLLOWING FOUNDER REVIEW (PENDING APPROVAL)  
**Tracking Issue:** [#15](https://github.com/samjuniors/SamJuniorsOS/issues/15)  
**Document Type:** Architectural Decision Record & Production Specification  
**Branch:** `phase/2.3b-persistence-authority-design`  
**Mode:** Design-only revision. Implementation is NOT approved.  
**Inputs:**  
- `docs/architecture/PHASE_2_3A_COMPANY_BRAIN_AUTHORITY_AUDIT.md`  
- `docs/architecture/PHASE_2_3A_DEPLOYMENT_VERIFICATION.md`  
- `AGENTS.md` (Highest authority engineering guardrails)  
- `ARCHITECTURE.md`, `PRODUCT.md`, `doc/ROADMAP.md`  
- Current repository source files in `src/lib/server/` and `prisma/schema.prisma`

---

## 1. Executive Verdict

### 1.1 Architectural Verdict
1. **Current Production State Is Unverified & Indefensible for Multi-Host Scale:**  
   The active repository code uses SQLite (`prisma/schema.prisma`, `DATABASE_URL=file:./db/custom.db`) alongside a suite of local JSON collections in `.data/*.json`. Four consequential business domains ([`DecisionStore`](src/lib/server/decision/store.ts), [`ConversationStore`](src/lib/server/conversation/store.ts), [`PersonalMemoryStore`](src/lib/server/sophia/personal-memory-store.ts), and [`ExecutiveCouncilEngine`](src/lib/server/orchestration/council.ts)) depend strictly on local filesystem storage with zero database read paths. In-process locks rely on OS signal 0 (`process.kill(pid, 0)`), which fails completely across container boundaries.
2. **One Company Brain Architecture, Not a Monolithic Store:**  
   Authoritative company truth is owned by a governed federation of dedicated domain stores. The "Company Brain" is an architectural governance layer—deterministic verification gates, provenance contracts, context assemblers, and bounded read projections—not a monolithic `CompanyBrainStore` class or single database table.
3. **Sophia Personal Mind Remains Strictly Founder-Scoped:**  
   Per `AGENTS.md §6`, the founder's personal dialogue, sensory notes, and stylistic interaction preferences ([`PersonalMemoryStore`](src/lib/server/sophia/personal-memory-store.ts)) are segregated from company truth. Personal memories are never authoritative company truth, never an authorization bypass, and never automatically promoted into company memory without explicit founder review and deterministic epistemic verification.
4. **Honest Migration & Rollback Semantics:**  
   No migration protocol can claim "zero data loss", "instant rollback", or "full semantic equivalence" prior to automated rehearsal, constraint validation, and end-to-end verification. A database transaction cannot atomically commit an external side effect (Stripe charge, GitHub push, Resend email). Rollback semantics must strictly account for both database mutations and external side effects. Pre-write rollback is valid only when zero database mutations and zero external side effects have occurred. External side effects must remain disabled during the canary cutover verification window. Once mutations or external side effects occur, configuration rollback alone is invalid and forward recovery or tested reverse change-capture is mandatory.

---

## 2. Scope & Evidence Methodology

### 2.1 Product & Entity Boundaries
Per `AGENTS.md §2`, SamJuniorsOS is the internal company operating system. Boundaries are strictly maintained:
- **SamJuniors Website (`samjuniors.com`):** Public marketing presence.
- **Lumora:** Product 1 of SamJuniors (educational AI product). Managed *by* the company, not the operating system itself.
- **SamJuniorsOS:** Internal operating system (this repository). Governs Sophia, AI employees, workflows, tools, and company state.
- **Role Brains:** Downstream specialist caches for AI employees (Researcher, PM, Finance). Explicitly out of scope until Company Brain authority is durably established.

### 2.2 Evidence Classification Standard
Every architectural finding, assertion, and claim in this specification is classified under one of four unambiguous evidential standards:

| Classification | Definition | Guardrail / Restriction |
|---|---|---|
| **VERIFIED** | Directly confirmed through inspected, executed code, runtime tests, or primary external provider records. | Requires verifiable file path, line numbers, or test execution logs. Static source inspection alone must NEVER be labeled VERIFIED. |
| **REPOSITORY EVIDENCE** | Directly visible in source code, schema files, or repository configuration, without proving active runtime behavior. | Confirms code presence; does not prove external hosting, active provisioning, or runtime durability. |
| **INFERRED** | Reasoned engineering conclusion derived logically from available evidence. | Must explicitly state the premises, reasoning, and limitations. |
| **UNKNOWN** | Cannot currently be established from repository evidence or available environments. | Must not be fabricated, guessed, or treated as a confirmed negative. |

### 2.3 Explicit Methodological Rules
- **Missing Deployment Manifest != Proof of Non-Deployment:** The absence of a Dockerfile, Terraform script, or GitHub Actions deployment workflow in the repository proves that deployment configuration is not version-controlled here; it does *not* prove that an operator has not deployed the application to a cloud container or VPS manually.
- **Prisma "Authoritative" Mode != Proof of PostgreSQL or Durability:** The presence of `isAuthoritativeMode()` in [`src/lib/server/db/authority.ts`](src/lib/server/db/authority.ts) proves that an abstraction exists to require database presence; it does *not* prove that PostgreSQL is provisioned, connected, or backed up.
- **Store Class Naming != Database Engine:** Class names prefixed with `Postgres*` (e.g. `PostgresAgentRunStore`) indicate target architecture, but in current code they execute against SQLite via Prisma.

---

## 3. Evidence Register

| ID | Finding / Claim | Classification | Evidence Source & Location | Confidence & Limitations | Architectural Implication |
|---|---|---|---|---|---|
| **EV-01** | Prisma datasource is configured for SQLite, not PostgreSQL. | **REPOSITORY EVIDENCE** | [`prisma/schema.prisma:16-19`](prisma/schema.prisma#L16-L19): `datasource db { provider = "sqlite" url = env("DATABASE_URL") }` | High confidence in repo state. Local dev uses `file:./db/custom.db`. | The system currently operates on SQLite. Any PostgreSQL transition requires schema provider changes and formal migrations. |
| **EV-02** | No Prisma migrations directory exists in the repository. | **REPOSITORY EVIDENCE** | Repository filesystem check: no `prisma/migrations/` directory exists. Build script runs `prisma generate && next build`. | High confidence. Schema changes rely on `prisma db push` or clean regeneration. | A baseline migration must be established before production database deployment to ensure repeatable schema versions. |
| **EV-03** | DecisionStore is 100% file-backed with zero Prisma mode. | **REPOSITORY EVIDENCE** | [`src/lib/server/decision/store.ts:6-8`](src/lib/server/decision/store.ts#L6-L8), [`:53-56`](src/lib/server/decision/store.ts#L53-L56): Persisted durably to `decisions.json` via `DurableFileStore`. | Confirmed in code. No Prisma model for `CompanyDecision` exists in `schema.prisma`. | Company decisions cannot be shared safely across separate container instances without a database table. |
| **EV-04** | ConversationStore and PersonalMemoryStore do not read from database. | **REPOSITORY EVIDENCE** | [`src/lib/server/conversation/store.ts:593-596`](src/lib/server/conversation/store.ts#L593-L596); [`src/lib/server/sophia/personal-memory-store.ts:45-54`](src/lib/server/sophia/personal-memory-store.ts#L45-L54) | Confirmed in code. Prisma writes are write-only mirrors with swallowed errors. Reads are file-only. | In a multi-host deployment, conversations and personal memories diverge or disappear on container replacement. |
| **EV-05** | AgentRunStore updates lifecycle status via upsert (mutable). | **REPOSITORY EVIDENCE** | [`src/lib/server/agents/run-store.ts:53-60`](src/lib/server/agents/run-store.ts#L53-L60): `await db.agentRun.upsert(...)` updating `status`, `durationMs`, `outputContent`. | Confirmed in code. Agent runs are mutable aggregates during execution, not strictly immutable records. | Must be classified as mutable during execution with immutable terminal states, not strictly append-only. |
| **EV-06** | ScheduledWorkStore distinguishes mutable work from append heartbeats. | **REPOSITORY EVIDENCE** | [`src/lib/server/workflow/scheduler-store.ts:54-60`](src/lib/server/workflow/scheduler-store.ts#L54-L60): `ScheduledWorkItem` has `update()`, `cancel()`; `SchedulerHeartbeatRecord` is logged append-only. | Confirmed in code. Two separate entities exist within one store file. | Schema and concurrency design must treat work items as mutable state machines and heartbeats as append-only audit rows. |
| **EV-07** | Local lock mechanism uses single-host OS process ID checks. | **REPOSITORY EVIDENCE** | [`src/lib/server/persistence/durable-file-store.ts:147`](src/lib/server/persistence/durable-file-store.ts#L147): `isProcessAlive(pid)` sends signal 0 via `process.kill(pid, 0)`. | Confirmed in code. PIDs are node-local and meaningless across containers or hosts. | Multi-host containerization without centralized database locking causes race conditions and lock-stealing. |
| **EV-08** | Executive Council deliberations run on local disk only. | **REPOSITORY EVIDENCE** | [`src/lib/server/orchestration/council.ts:33`](src/lib/server/orchestration/council.ts#L33): Persisted to `.data/council_deliberations.json` via `DurableFileStore`. | Confirmed in code. No Prisma model exists in `schema.prisma`. | Executive Council deliberations, specialist critiques, and friction points are lost on container replacement. |
| **EV-09** | InMemoryCommunicationStore is 100% ephemeral RAM. | **REPOSITORY EVIDENCE** | [`src/lib/server/communication/store.ts:25-32`](src/lib/server/communication/store.ts#L25-L32): Internal state held in 7 JavaScript `Map` objects. | Confirmed in code. Zero disk writes, zero database writes. | Every process restart or redeployment destroys all contacts, messages, drafts, and communication webhook events. |
| **EV-10** | Active cloud deployment location and provider. | **UNKNOWN** | No cloud manifests, Terraform files, or CI/CD deployment jobs exist in the repo working tree. | The repo does not record deployment infrastructure. Runtime hosting may exist outside GitHub version control. | Architecture recommendations must not assume a specific vendor cloud without founder confirmation. |
| **EV-11** | External side effects cannot commit atomically with database transactions. | **INFERRED** | Fundamental distributed systems principle: database commits and network RPCs (Stripe, GitHub, Resend) lack two-phase commit (2PC). | Provable engineering fact. Network partitions can cause split-brain outcomes. | Reliability architecture must implement Transactional Outbox, Idempotency, and Unknown-Outcome status probes. |
| **EV-12** | SQLite WAL mode cannot safely support multi-host network mounts. | **INFERRED** | SQLite documentation: POSIX advisory locks and shared memory (`-shm`) over network filesystems (NFS/EFS/CIFS) are unreliable and corrupt databases. | Official SQLite design specification. | Multi-host horizontal autoscaling requires a dedicated network database (PostgreSQL), not SQLite on shared network storage. |

---

## 4. Current Persistence Inventory

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                CURRENT PERSISTENCE REALITY                              │
├────────────────────────────┬─────────────────────────────┬──────────────────────────────┤
│ 1. PRISMA DATABASE         │ 2. DURABLE FILE STORE       │ 3. IN-PROCESS RAM            │
│ (SQLite: db/custom.db)     │ (.data/*.json Collections)  │ (Transient State)            │
├────────────────────────────┼─────────────────────────────┼──────────────────────────────┤
│ • Workflow Definitions     │ • Company Decisions         │ • Communication Store        │
│ • Workflow Instances       │ • Conversations (Primary)   │   (Contacts, Messages, Maps) │
│ • Scheduled Work Items     │ • Chat Messages (Primary)   │ • Live WS Tickets            │
│ • Scheduler Heartbeats     │ • Sophia Personal Memories  │   (60-second TTL Map)        │
│ • Approval Records         │ • Council Deliberations     │ • In-Memory Caches           │
│ • Side Effect Audits       │ • Company State Overrides   │   (Lease cache, fast reads)  │
│ • Agent Runs (Upsert)      │ • Company Knowledge Cache   │                              │
│ • Epistemic Ledgers        │ • Company Memory Cache      │                              │
│ • Distributed Leases       │ • Idempotency Cache         │                              │
└────────────────────────────┴─────────────────────────────┴──────────────────────────────┘
```

### 4.1 Persistence Layer Detail
1. **SQLite Database (`prisma/schema.prisma`):**  
   Targeted via `DATABASE_URL=file:./db/custom.db`. Manages relational entities for workflows, approvals, audits, runs, epistemic tables, and distributed leases. While abstraction layers name classes `Postgres*`, the runtime engine executes SQLite queries.
2. **Durable File Store (`src/lib/server/persistence/durable-file-store.ts`):**  
   Reads and writes atomic JSON files under `.data/`. Utilizes local file locking (`.lock` files via `wx` flag) and PID liveness validation. This store is the authoritative source of truth for Decisions, Council Deliberations, and primary read sources for Conversations and Sophia Personal Memories.
3. **In-Process Memory (`src/lib/server/communication/store.ts`, `src/lib/server/live/ticket-store.ts`):**  
   Stores communications (contacts, messages, drafts, webhooks) and WebSocket handshake tickets. All state is held in native V8 `Map` structures and vanishes on process restart.
4. **External Systems of Record (Stripe, GitHub, Resend):**  
   Third-party platforms holding authoritative financial charges, git revisions, and raw email transit. SamJuniorsOS records epistemic signals and side-effect audits reflecting these interactions.

---

## 5. Domain Authority Contracts

Every persistence domain in SamJuniorsOS must adhere to an explicit, typed contract governing ownership, lifecycle, and mutation boundaries.

### 5.1 Decision Domain
- **Store Owner:** [`DecisionStore`](src/lib/server/decision/store.ts).
- **Contract:** Manages company governance decisions (`DecisionRecord`).
- **Authority Boundary:** Single server-side authority for company policy and governance decisions.
- **Write Semantics:** Mutable aggregate with optimistic version control (`stateVersion`). Transitions are appended to an internal `transitions` array. Cryptographic binding (`approvedPayloadHash`) is recalculated on approval.
- **Current State:** `.data/decisions.json` via `DurableFileStore`. No Prisma model exists.
- **Target State:** Relational PostgreSQL table `company_decisions` with versioned row locks.

### 5.2 Epistemic Truth Domain
- **Store Owner:** [`EpistemicClaimStore`](src/lib/server/epistemic/claim-store.ts).
- **Contract:** Governs evidence, signals, probationary claims, and canonical company facts.
- **Authority Boundary:** Sole arbiter of corporate truth. Vector search or LLM generation cannot declare facts.
- **Write Semantics:**
  - `EvidenceSource` & `EpistemicSignal`: Strictly immutable with SHA-256 payload hashes.
  - `EpistemicClaim`: Mutable verification state (`proposed` -> `verified` / `rejected`).
  - `CanonicalFact`: Mutable validity state (`active` -> `superseded`) with supersession pointers (`supersededById`, `supersededAt`).
- **Current State:** SQLite via Prisma (`epistemic_sources`, `epistemic_signals`, `epistemic_claims`, `canonical_facts`).
- **Target State:** PostgreSQL tables with foreign key constraints, temporal queries (`asOf`), and immutable evidence ledgers.

### 5.3 Operational State Domain
- **Store Owner:** [`CompanyStateStore`](src/lib/server/state/state-store.ts).
- **Contract:** Holds high-level organizational structure, initiatives, and financial model state.
- **Authority Boundary:** Governs company operational configuration. Raw transactions remain with external providers.
- **Write Semantics:** Mutable document/relational record with optimistic concurrency.
- **Current State:** Split authority between in-memory code defaults (`os-data.ts`) and `.data/company_state.json`. Partial Prisma backing for `initiatives` and `financialModel`.
- **Target State:** Governed relational row with version checks; external financial figures derived from verified epistemic signals.

### 5.4 Canonical Knowledge Domain
- **Store Owner:** [`CompanyKnowledgeStore`](src/lib/server/knowledge/knowledge-store.ts).
- **Contract:** Governs canonical company specifications, architecture documents, and SOPs.
- **Authority Boundary:** Authoritative reference for internal operational procedures.
- **Write Semantics:** Replaceable/versioned content with SHA-256 fingerprints.
- **Current State:** SQLite via Prisma (`company_knowledge`) with file cache fallback.
- **Target State:** PostgreSQL table with full-text search indexing and revision tracking.

### 5.5 Precedent Memory Domain
- **Store Owner:** [`CompanyMemoryStore`](src/lib/server/memory/memory-store.ts).
- **Contract:** Governs historical institutional precedent and non-factual narrative memory.
- **Authority Boundary:** Precedent context only. Explicitly non-evidence; cannot override Canonical Facts.
- **Write Semantics:** Append-oriented with optional soft deprecation.
- **Current State:** SQLite via Prisma (`company_memories`) with file cache fallback.
- **Target State:** PostgreSQL table with founder categorization tags.

### 5.6 Workflow Execution Domain
- **Store Owner:** [`WorkflowStore`](src/lib/server/workflow/store.ts).
- **Contract:** Governs workflow definitions and multi-step instance execution states.
- **Authority Boundary:** Orchestrates autonomous AI employee execution pipelines.
- **Write Semantics:**
  - `WorkflowDefinition`: Versioned, immutable definitions.
  - `WorkflowInstanceState`: Mutable finite state machine with optimistic version locking (`stateVersion`), atomic step claims, and step state transitions.
- **Current State:** SQLite via Prisma (`workflow_definitions`, `workflow_instances`).
- **Target State:** PostgreSQL tables with atomic step claiming (`SELECT FOR UPDATE SKIP LOCKED` or CAS version updates).

### 5.7 Scheduling & Heartbeat Domain
- **Store Owner:** [`ScheduledWorkStore`](src/lib/server/workflow/scheduler-store.ts).
- **Contract:** Coordinates recurring background work and scheduler evaluation logs.
- **Authority Boundary:** 24/7 background continuity engine.
- **Write Semantics:**
  - `ScheduledWorkItem`: Mutable state machine (`pending` -> `running` -> `completed` / `cancelled`).
  - `SchedulerHeartbeatRecord`: Strictly immutable append-only audit trail of scheduler evaluations.
- **Current State:** SQLite via Prisma (`scheduled_work_items`, `scheduler_heartbeats`).
- **Target State:** PostgreSQL tables with distributed execution leases and time-partitioned heartbeat logs.

### 5.8 Authorization & Audit Domain
- **Store Owner:** [`ApprovalStore`](src/lib/server/authorization/approval-store.ts) / [`AuditStore`](src/lib/server/authorization/approval-store.ts#L49).
- **Contract:** Governs founder approval gates and immutable side-effect execution audits.
- **Authority Boundary:** Strict fail-closed boundary for external side effects.
- **Write Semantics:**
  - `FounderApprovalRecord`: Mutable finite state machine (`pending` -> `approved` / `rejected` / `revoked`, `consumedAt`).
  - `SideEffectAuditRecord`: Strictly immutable, append-only compliance ledger.
- **Current State:** SQLite via Prisma (`approval_records`, `side_effect_audits`).
- **Target State:** PostgreSQL tables with single-use consumption constraints (`consumedAt` CAS) and append-only audit enforcement.

### 5.9 Durable Agent Run Domain
- **Store Owner:** [`AgentRunStore`](src/lib/server/agents/run-store.ts).
- **Contract:** Traces model prompts, execution duration, token spend, structured output, and errors.
- **Authority Boundary:** Diagnostic and audit trail of autonomous agent activities.
- **Write Semantics:** Mutable aggregate during lifecycle execution (status updates from `running` to `completed` or `failed` via upsert), immutable once terminal.
- **Current State:** SQLite via Prisma (`agent_runs`).
- **Target State:** PostgreSQL table with foreign key linkages to workflow instances and epistemic claims.

### 5.10 Executive Council Deliberation Domain
- **Store Owner:** [`ExecutiveCouncilEngine`](src/lib/server/orchestration/council.ts).
- **Contract:** Coordinates bounded peer review between specialists (Researcher, PM, Finance) and COO mediation.
- **Authority Boundary:** Multi-agent deliberation governance.
- **Write Semantics:** Mutable during active review rounds, immutable upon final mediation ruling.
- **Current State:** `.data/council_deliberations.json` via `DurableFileStore`. No Prisma model exists.
- **Target State:** Relational PostgreSQL table `council_deliberations` with structured JSONB critique fields.

### 5.11 Coordination & Distributed Lease Domain
- **Store Owner:** [`LeaseManager`](src/lib/server/coordination/lease-manager.ts).
- **Contract:** Provides distributed mutual exclusion for workers and scheduler loops.
- **Authority Boundary:** Prevents split-brain concurrent execution across processes.
- **Write Semantics:** Highly mutable transient rows (`holderId`, `acquiredAt`, `expiresAt`).
- **Current State:** SQLite via Prisma (`distributed_leases`).
- **Target State:** PostgreSQL table utilizing atomic conditional updates and fencing tokens.

### 5.12 Conversation & Chat Domain
- **Store Owner:** [`ConversationStore`](src/lib/server/conversation/store.ts).
- **Contract:** Manages conversational dialogue threads and chat message history.
- **Authority Boundary:** Conversational interface between Founder and Sophia.
- **Write Semantics:**
  - `ConversationRecord`: Mutable metadata and timestamps.
  - `ChatMessageRecord`: Append-only message history with tombstone tracking.
- **Current State:** `.data/conversations.json` and `.data/chat_messages.json`. Prisma writes are shadow-only; reads never hit database.
- **Target State:** PostgreSQL tables `conversations` and `chat_messages` with paginated retrieval.

### 5.13 Sophia Personal Mind Domain
- **Store Owner:** [`PersonalMemoryStore`](src/lib/server/sophia/personal-memory-store.ts).
- **Contract:** Stores founder interaction preferences, pacing notes, and personal dialogue context.
- **Authority Boundary:** Strictly founder-scoped. Segregated completely from Company Brain authority.
- **Write Semantics:** Mutable finite state machine (`PROPOSED` -> `ACTIVE` -> `DEPRECATED` / `REVOKED` / `PURGED`).
- **Current State:** `.data/sophia_memories.json` via `DurableFileStore`. Prisma writes are shadow-only.
- **Target State:** PostgreSQL table `sophia_memories` isolated by `founderId` with zero promotion pathways to company facts.

### 5.14 Communication Domain
- **Store Owner:** [`InMemoryCommunicationStore`](src/lib/server/communication/store.ts).
- **Contract:** Manages internal CRM models: contacts, organizations, conversations, messages, and drafts.
- **Authority Boundary:** Inbound/outbound communication staging.
- **Write Semantics:** Mutable CRM entities with audit logs.
- **Current State:** 100% ephemeral in-memory JavaScript `Map` objects.
- **Target State:** Relational PostgreSQL tables `comm_contacts`, `comm_messages`, and `comm_webhook_events`.

### 5.15 Live Ephemeral Ticket Domain
- **Store Owner:** [`LiveTicketStore`](src/lib/server/live/ticket-store.ts).
- **Contract:** Single-use 60-second tickets authorizing WebSocket connection upgrades.
- **Authority Boundary:** Ephemeral transport security.
- **Write Semantics:** Transient key-value with immediate consumption or TTL eviction.
- **Current State:** In-memory RAM Map.
- **Target State:** In-memory RAM Map (or managed Redis if multi-node WebSocket gateways are deployed).

### 5.16 External Operational Systems
- **Providers:** Stripe (Billing), GitHub (Version Control/Issues), Resend (Email Transit).
- **Contract:** Canonical systems of record for external transactions.
- **Authority Boundary:** SamJuniorsOS never duplicates raw external ledger authority; it captures verifiable receipts and hashes.
- **Write Semantics:** External systems owned by third parties; SamJuniorsOS maintains append-only signal records (`EpistemicSignal`).

---

## 6. Independent Data Classification Matrix

To replace the oversimplified four-tier classification, every persistence domain is evaluated across 13 distinct technical dimensions. All evidence classifications adhere strictly to Section 2.2 (`REPOSITORY EVIDENCE` based on static code inspection; runtime execution was not performed in this design phase).

| Domain & Owner | Canonical Authority | Write Semantics | Consistency Model | Durability Requirements | Retention & Deletion Policy | Sensitivity & Auth Boundary | Transaction & Concurrency | Backup & Restore | Failure Behavior & Recovery | Current Implementation | Proposed Target Behavior | Evidence & Confidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Decisions** (`DecisionStore`) | Canonical | Mutable (stateVersion + transitions) | Optimistic Concurrency | High (survive redeploys) | Permanent corporate record | Highly Sensitive (Founder only) | Atomic CAS on version, collection lock | Snapshot + PITR | Fail-closed on lock timeout; in-memory cache | `.data/decisions.json` | PostgreSQL table `company_decisions` | **REPOSITORY EVIDENCE** ([`src/lib/server/decision/store.ts`](src/lib/server/decision/store.ts)) |
| **Epistemic Sources & Signals** (`EpistemicClaimStore`) | Canonical | Immutable | Append-Only (Idempotent by hash) | High | Permanent audit evidence | Restricted internal | Unique hash constraint | Snapshot + immutable archive | Duplicate insert ignored; SHA-256 check | SQLite via Prisma | PostgreSQL tables `epistemic_sources`, `signals` | **REPOSITORY EVIDENCE** ([`src/lib/server/epistemic/claim-store.ts`](src/lib/server/epistemic/claim-store.ts)) |
| **Epistemic Claims** (`EpistemicClaimStore`) | Canonical | Mutable (status transitions) | Eventual / Sequential | Moderate | Retained with claim history | Restricted internal | Atomic status update | Standard snapshot | Re-evaluable via verification policy | SQLite via Prisma | PostgreSQL table `epistemic_claims` | **REPOSITORY EVIDENCE** ([`src/lib/server/epistemic/claim-store.ts`](src/lib/server/epistemic/claim-store.ts)) |
| **Canonical Facts** (`EpistemicClaimStore`) | Canonical | Mutable (supersession pointers) | Transactional Supersession | Critical | Permanent (superseded marked) | High (Company Truth) | Atomic predecessor / successor link | Continuous WAL, PITR | Rollback to predecessor fact if invalid | SQLite via Prisma | PostgreSQL table `canonical_facts` | **REPOSITORY EVIDENCE** ([`src/lib/server/epistemic/claim-store.ts`](src/lib/server/epistemic/claim-store.ts)) |
| **Operational State** (`CompanyStateStore`) | Canonical | Mutable | Optimistic Concurrency | High | Overwritten on strategic update | Executive only | Version check on update | Standard snapshot | Fallback to default state seeds | In-memory + `.data/company_state.json` | PostgreSQL table `company_state` | **REPOSITORY EVIDENCE** ([`src/lib/server/state/state-store.ts`](src/lib/server/state/state-store.ts)) |
| **Company Knowledge** (`CompanyKnowledgeStore`) | Canonical | Replaceable / Versioned | Optimistic Concurrency | High | Version history retained | Company Internal | Content-hash uniqueness | Standard snapshot | Re-seed from markdown baseline | SQLite via Prisma + file cache | PostgreSQL table `company_knowledge` | **REPOSITORY EVIDENCE** ([`src/lib/server/knowledge/knowledge-store.ts`](src/lib/server/knowledge/knowledge-store.ts)) |
| **Company Memory** (`CompanyMemoryStore`) | Canonical | Append-oriented | Best-Effort / Eventual | Moderate | Soft deprecation supported | Company Internal | Simple insert / update | Standard snapshot | Loss causes precedent amnesia, not crash | SQLite via Prisma + file cache | PostgreSQL table `company_memories` | **REPOSITORY EVIDENCE** ([`src/lib/server/memory/memory-store.ts`](src/lib/server/memory/memory-store.ts)) |
| **Workflow Definitions** (`WorkflowStore`) | Canonical | Versioned / Immutable | Immutable per version | High | Retained across executions | Engineering / Admin | Unique `(id, version)` constraint | Standard snapshot | System cannot start if definitions missing | SQLite via Prisma | PostgreSQL table `workflow_definitions` | **REPOSITORY EVIDENCE** ([`src/lib/server/workflow/store.ts`](src/lib/server/workflow/store.ts)) |
| **Workflow Instances** (`WorkflowStore`) | Canonical | Mutable (state machine) | Strict Transactional (CAS) | Critical | Retain active & completed runs | Founder & Autonomous Engine | Atomic step claiming, version CAS | Continuous WAL, PITR | In-flight steps fail-safe, rehydrate on boot | SQLite via Prisma | PostgreSQL table `workflow_instances` | **REPOSITORY EVIDENCE** ([`src/lib/server/workflow/store.ts`](src/lib/server/workflow/store.ts)) |
| **Scheduled Work Items** (`ScheduledWorkStore`) | Canonical | Mutable | Transactional state machine | High | Retained for execution trail | System Scheduler | Lease-guarded atomic claims | Standard snapshot | Missed cron items detected on boot | SQLite via Prisma | PostgreSQL table `scheduled_work_items` | **REPOSITORY EVIDENCE** ([`src/lib/server/workflow/scheduler-store.ts`](src/lib/server/workflow/scheduler-store.ts)) |
| **Scheduler Heartbeats** (`ScheduledWorkStore`) | Audit Ledger | Append-Only | Append-Only | Moderate | **UNDECIDED — ILLUSTRATIVE PROPOSAL** (90 days proposed) — FOUNDER DECISION REQUIRED. Decision factors: audit compliance, disk storage cost, query index performance. | System Internal | Append-only insert | Standard snapshot | Missed heartbeat alerts founder | SQLite via Prisma | PostgreSQL table `scheduler_heartbeats` | **REPOSITORY EVIDENCE** ([`src/lib/server/workflow/scheduler-store.ts`](src/lib/server/workflow/scheduler-store.ts)) |
| **Approval Records** (`ApprovalStore`) | Canonical | Mutable (consumption state) | Strict Transactional (CAS) | Critical | Permanent governance audit | Founder Sovereign | Single-use CAS (`consumedAt IS NULL`) | Continuous WAL, PITR | Fails closed; requires fresh approval | SQLite via Prisma | PostgreSQL table `approval_records` | **REPOSITORY EVIDENCE** ([`src/lib/server/authorization/approval-store.ts`](src/lib/server/authorization/approval-store.ts)) |
| **Side Effect Audits** (`AuditStore`) | Audit Ledger | Immutable | Append-Only | Critical | Permanent immutable ledger | Compliance / Founder | Append-only insert (no updates) | Continuous WAL, immutable replica | Alert on audit write failure; halt action | SQLite via Prisma | PostgreSQL table `side_effect_audits` | **REPOSITORY EVIDENCE** ([`src/lib/server/authorization/approval-store.ts`](src/lib/server/authorization/approval-store.ts)) |
| **Agent Runs** (`AgentRunStore`) | Execution History | Mutable during run, then immutable | Optimistic / Upsert | Moderate | **UNDECIDED — ILLUSTRATIVE PROPOSAL** (30–90 days proposed) — FOUNDER DECISION REQUIRED. Decision factors: LLM token audit trails, storage overhead, debugging needs. | Internal Engineering | Upsert on `runId` | Standard snapshot | Interrupted run marked `failed` on reboot | SQLite via Prisma (upsert) | PostgreSQL table `agent_runs` | **REPOSITORY EVIDENCE** ([`src/lib/server/agents/run-store.ts`](src/lib/server/agents/run-store.ts)) |
| **Council Deliberations** (`ExecutiveCouncilEngine`) | Canonical | Mutable during review, then sealed | Optimistic Concurrency | High | Permanent strategic record | Founder & Executive | Collection lock during deliberation | Standard snapshot | Interrupted deliberation marks `degraded` | `.data/council_deliberations.json` | PostgreSQL table `council_deliberations` | **REPOSITORY EVIDENCE** ([`src/lib/server/orchestration/council.ts`](src/lib/server/orchestration/council.ts)) |
| **Distributed Leases** (`LeaseManager`) | Transient Coordination | Highly Mutable | Strict Transactional (Fencing) | Low (TTL bounded) | Auto-expiring TTL | System Workers | Atomic conditional acquire/renew | Not required | Expired lease reclaimed by standby worker | SQLite via Prisma | PostgreSQL table `distributed_leases` | **REPOSITORY EVIDENCE** ([`src/lib/server/coordination/lease-manager.ts`](src/lib/server/coordination/lease-manager.ts)) |
| **Conversations & Messages** (`ConversationStore`) | Canonical | Append-Only Messages, Mutable Threads | Transactional Append | High | Retained until founder tombstone | Founder Confidential | Idempotency key uniqueness check | Standard snapshot | Tombstones prevent resurrected state | `.data/conversations.json`, `chat_messages.json` | PostgreSQL tables `conversations`, `chat_messages` | **REPOSITORY EVIDENCE** ([`src/lib/server/conversation/store.ts`](src/lib/server/conversation/store.ts)) |
| **Sophia Personal Memories** (`PersonalMemoryStore`) | Canonical (Personal) | Mutable (lifecycle FSM) | Optimistic Concurrency | High | Founder explicit revocation | Founder Confidential (Isolated) | Founder ID tenant isolation | Standard snapshot | Isolated from Company Brain | `.data/sophia_memories.json` | PostgreSQL table `sophia_memories` | **REPOSITORY EVIDENCE** ([`src/lib/server/sophia/personal-memory-store.ts`](src/lib/server/sophia/personal-memory-store.ts)) |
| **Communications** (`InMemoryCommunicationStore`) | Ephemeral / Staging | Mutable | In-Memory (No isolation) | Zero today (High target) | None today | Founder & Communication Worker | None today | None today | Process restart loses all CRM state | Ephemeral JavaScript `Map` | PostgreSQL tables `comm_*` | **REPOSITORY EVIDENCE** ([`src/lib/server/communication/store.ts`](src/lib/server/communication/store.ts)) |
| **Live WS Tickets** (`LiveTicketStore`) | Ephemeral Handshake | Replaceable (60s TTL) | In-Memory | Zero (Ephemeral) | Expired every 60 seconds | Ephemeral Gateway | Single-use consumption | None required | Expired ticket forces client re-auth | In-memory JavaScript `Map` | In-memory RAM Map / Redis | **REPOSITORY EVIDENCE** ([`src/lib/server/live/ticket-store.ts`](src/lib/server/live/ticket-store.ts)) |
| **Dependency Relations** (`DependencyRelationStore`) | Projection | Replaceable / Rebuildable | Derived from Facts | Rebuildable | Dropped and rebuilt at will | Internal Index | Deterministic extraction pass | Not required | Deterministically rebuilt from Facts | In-memory index | PostgreSQL table `dependency_relations` | **REPOSITORY EVIDENCE** ([`src/lib/server/retrieval/dependency-relation-store.ts`](src/lib/server/retrieval/dependency-relation-store.ts)) |
| **GraphDTO Read Model** (`read-model.ts`) | Projection | Stateless Projection | Deterministic Read Model | Rebuildable | In-memory projection | Read-Only Surface | Read-only database query | Not required | Pure function of database state | Stateless code function | Stateless code function | **REPOSITORY EVIDENCE** ([`src/lib/server/graph/read-model.ts`](src/lib/server/graph/read-model.ts)) |

---

## 7. Transaction & Concurrency Requirements

### 7.1 The Multi-Host Concurrency Breakdown in Current Architecture
The current file-based locking mechanism in `DurableFileStore` relies on node-local OS PID signals:
```typescript
// From src/lib/server/persistence/durable-file-store.ts:
if (current.pid !== null && DurableFileStore.isProcessAlive(current.pid)) {
  return false;
}
```
In any containerized or multi-instance deployment:
1. **Container Isolation:** Container A and Container B have independent PID namespaces. A process running on Container A cannot see or signal a process on Container B.
2. **Lock-Stealing Bug:** If Container B checks Container A's PID, Container B either observes that the PID does not exist locally and steals the lock prematurely, or observes an unrelated OS process with the same numeric PID and stalls indefinitely.
3. **Network File Locking Failure:** POSIX `.lock` files over networked filesystems (NFS, EFS, Cloud Storage Fuse) suffer from stale file handles, client caching delays, and unsupported atomic creation flags (`wx`).

### 7.2 Database Transaction Boundaries & Concurrency Controls
In the target production architecture, concurrency boundaries must be enforced exclusively by ACID database mechanisms:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   ACID TRANSACTION CONCURRENCY PATTERNS                │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. SINGLE-USE CONSUMPTION      │ UPDATE approval_records               │
│    (Approval Records)          │ SET consumed_at = NOW()               │
│                                │ WHERE id = $1 AND consumed_at IS NULL │
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. OPTIMISTIC CONCURRENCY      │ UPDATE workflow_instances             │
│    (Workflow & Decision CAS)   │ SET state_version = state_version + 1 │
│                                │ WHERE id = $1 AND state_version = $2  │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. PESSIMISTIC ROW LOCKING     │ SELECT * FROM scheduled_work_items    │
│    (Worker Step Claiming)      │ WHERE status = 'pending'              │
│                                │ FOR UPDATE SKIP LOCKED LIMIT 1        │
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. FENCED DISTRIBUTED LEASE    │ UPDATE distributed_leases             │
│    (Leader / Cron Execution)   │ SET holder_id = $1, expires_at = $2,  │
│                                │     fencing_token = fencing_token + 1 │
│                                │ WHERE resource_key = $3               │
│                                │   AND (expires_at < NOW()             │
│                                │        OR holder_id = $1)             │
└────────────────────────────────┴───────────────────────────────────────┘
```

### 7.3 Database Connection Pool Exhaustion Protection
Next.js serverless functions or container autoscaling can rapidly exhaust PostgreSQL connection limits.
- **Connection Pooling Required:** A dedicated transaction-mode connection pooler (e.g. PgBouncer, Prisma Accelerate, or Supabase Pooler on port 6543) must be placed in front of PostgreSQL.
- **Connection Ceilings:** Compute instances must be configured with explicit Prisma connection limits:
  ```env
  DATABASE_URL="postgresql://user:pass@pooler.internal:6543/samjuniorsos?connection_limit=10&pool_timeout=20"
  ```
- **Fail-Closed Handling:** If the connection pool is exhausted, the application must throw `DatabaseAuthorityError` and return HTTP 503 instead of hanging indefinitely.

---

## 8. Idempotency, Outbox/Inbox & Side-Effect Recovery

### 8.1 The Fundamental Distributed Transaction Reality
> **CRITICAL ARCHITECTURAL FACT:** A database transaction CANNOT atomically commit an external HTTP request.  
> When Sophia or an AI employee executes an external mutation (sending an email via Resend, charging a card via Stripe, or pushing code to GitHub), the database commit and the external API call exist across a network boundary. Two-phase commit (2PC) is unsupported by external REST APIs.

### 8.2 Reliability Architecture: Outbox, Inbox & Status Probes

```
                       INBOUND WEBHOOK
                              │
                              ▼
                ┌───────────────────────────┐
                │ 1. TRANSACTIONAL INBOX    │ ◄── Deduplicates incoming webhook events
                │    (Deduplication Check)  │     via unique event IDs before processing.
                └─────────────┬─────────────┘
                              │
                              ▼
                   INTERNAL STATE MUTATION
                ┌───────────────────────────┐
                │ 2. ATOMIC DB TRANSACTION  │
                │    • State Update         │
                │    • Audit Record Insert  │
                │    • Outbox Message Insert│ ◄── Written in the SAME local transaction.
                └─────────────┬─────────────┘
                              │
                              ▼
                ┌───────────────────────────┐
                │ 3. OUTBOX RELAY WORKER    │
                └─────────────┬─────────────┘
                              │
                    ┌─────────┴─────────┐
         Success    │                   │ Network Timeout / 5xx
                    ▼                   ▼
        ┌──────────────────┐    ┌──────────────────┐
        │ Mark Outbox Sent │    │ 4. UNKNOWN-STATE │
        └──────────────────┘    │    PROBE WORKER  │ ◄── Halts retries; probes external
                                └─────────┬────────┘     system status via idempotency key.
                                          │
                            ┌─────────────┴─────────────┐
               Found        │                           │ Not Found
                            ▼                           ▼
                  ┌──────────────────┐        ┌──────────────────┐
                  │ Reconcile Outbox │        │ Bounded Backoff  │
                  │ as Completed     │        │ Retry Outbox     │
                  └──────────────────┘        └──────────────────┘
```

### 8.3 Idempotency Lifecycle & State Machine
Per [`src/lib/server/idempotency/state-machine.ts`](src/lib/server/idempotency/state-machine.ts), operations execute through a formal finite state machine:
1. **Unregistered -> In Progress:** Worker claims `(idempotencyKey, payloadHash, ttlMs)`. Concurrent executions with identical payload receive `OperationInProgressError` and fail closed.
2. **Payload Binding Guard:** If an identical key arrives with a different `payloadHash`, the system throws `IdempotencyPayloadMismatchError` (guards against parameter tampering).
3. **In Progress -> Completed / Failed:** Successful execution writes results and timestamps. Unrecoverable failures record error messages.
4. **In Progress -> Unknown Outcome:** On network timeout or connection reset during an external API call, the record transitions to `unknown`. Automated blind retries are prohibited.
5. **Unknown Outcome Status Probe:** An asynchronous probe queries the external provider using the idempotency key (e.g. Stripe `GET /v1/events?idempotency_key=...`). If the external side effect succeeded, the record is resolved as `completed`; if not found, it is retried.

### 8.4 Retry Classification & Bounded Exponential Backoff
Retries must be classified by error type to prevent thundering herds and duplicate side effects:
- **Non-Retryable Errors (Fail Immediately):** HTTP 400 (Bad Request), HTTP 401/403 (Auth Failure), HTTP 422 (Unprocessable Entity), `IdempotencyPayloadMismatchError`, `ApprovalAlreadyConsumedError`.
- **Retryable Errors:** HTTP 429 (Rate Limited), HTTP 502/503/504 (Gateway Timeout / Unavailable), transient TCP resets.
- **Backoff Formula:** $t_{\text{wait}} = \min(t_{\text{max}}, t_{\text{base}} \times 2^{\text{attempt}}) \pm \text{jitter}$ (where $t_{\text{base}} = 500\text{ms}$, $t_{\text{max}} = 30\text{s}$, max attempts = 5).

---

## 9. Hosting & Database Architecture Comparison

To establish an objective technical basis for deployment decisions, four realistic deployment options are evaluated. PostgreSQL is not treated as an unconditional default; rather, each model is evaluated against real operational tradeoffs.

| Dimension | Option A: Single-Host Container with Persistent Local Volume & SQLite | Option B: Managed Container Runtime with Managed PostgreSQL | Option C: Serverless Frontend with External PostgreSQL & Separate WS Gateway | Option D: Self-Hosted Linux VPS with Docker Compose (App + Postgres) |
|---|---|---|---|---|
| **Architecture Overview** | Single Node.js container (Next.js + WS Companion) with local mounted block storage (`/data/custom.db`). | Container service (AWS ECS / Cloud Run / Fly.io) connecting to managed PostgreSQL (RDS / Neon / Supabase). | Serverless Next.js (Vercel) + managed PostgreSQL + separately hosted container for WebSocket companion. | Single Linux server running Docker Compose: Next.js container, WebSocket container, PostgreSQL container. |
| **Reliability & Durability** | **Moderate:** Survives process restarts if volume is persistent. Host failure requires volume re-attachment. | **High:** Database durability decoupled from compute. Multi-AZ database replication available. | **High (DB), Complex (Compute):** Multi-component system with two separate compute failure domains. | **Moderate:** Dependent on single physical VPS hardware. Requires host-level snapshotting. |
| **Concurrency & Locking** | **Constrained:** Single-host only. SQLite WAL mode supports multi-thread, single-writer. No multi-container support. | **Full:** Native PostgreSQL row-level locks (`SELECT FOR UPDATE`), multi-instance safe. | **Full (DB), Complex (WS):** Requires distributed synchronization (e.g. Redis) between serverless and WS nodes. | **Full:** Native PostgreSQL container provides ACID row locks and transactions to local app containers. |
| **Horizontal Autoscaling** | **Zero:** Cannot scale compute beyond 1 instance without corrupting SQLite database. | **Full:** Compute can scale horizontally (1 to N instances) with all instances sharing PostgreSQL. | **High (Frontend), Manual (WS):** Frontend scales infinitely; WS companion requires pinned container sizing. | **Zero:** Bounded strictly to the physical CPU/RAM capacity of the single VPS instance. |
| **WebSocket & 24/7 Continuity** | **Native:** Next.js and WS Companion run on same host with direct port exposure (3000/3001). | **Supported:** Container runtime runs long-lived background workers and persistent WS connections. | **Poor:** Serverless cannot maintain persistent WebSockets; requires split-architecture hosting. | **Native:** Docker Compose networks containers locally; ports 3000/3001 exposed via reverse proxy (Caddy/Nginx). |
| **Security & Operational Burden** | **Low Operational Burden:** Single container to patch; no external database network credentials to manage. | **Moderate:** Managed service handles DB patching, backups, and encryption. Requires secure VPC/TLS. | **High:** Multiple platforms to manage (Vercel + Container Host + Database Service); multiple secret sets. | **High Operational Burden:** Operator responsible for Linux OS updates, Docker daemon, firewall, DB tuning, backups. |
| **Backups & Disaster Recovery** | **Manual:** Requires filesystem snapshots (`sqlite3 .backup`). Point-in-time recovery requires custom tooling. | **Automated:** Managed automated daily snapshots + continuous WAL archiving for point-in-time recovery. | **Automated:** Managed database provider handles PITR and snapshot validation. | **Manual / Scripted:** Requires pg_dump cron jobs and off-site S3 synchronization managed by operator. |
| **Cost Drivers** | **Lowest:** Single low-cost virtual machine or container ($5–$20/mo). | **Moderate:** Managed PostgreSQL ($15–$70/mo) + Container compute ($15–$40/mo). Total: $30–$110/mo. | **High:** Serverless execution fees + Database compute + Container host compute ($50–$150/mo). | **Low to Moderate:** Single medium VPS (e.g. Hetzner/DigitalOcean 4-core, 8GB RAM at $15–$35/mo). |
| **Portability & Vendor Lock-In** | **Highest:** 100% standard Docker container; runs anywhere Docker or Node.js is supported. | **High:** Standard PostgreSQL and standard Docker container; easily portable across cloud providers. | **Low:** Tied to serverless deployment patterns and multi-vendor integrations. | **Highest:** Standard Docker Compose manifest; portable to any bare metal or cloud Linux server. |
| **Migration Complexity** | **Zero (Current):** Matches current SQLite architecture; requires no immediate database migration. | **Moderate:** Requires Phase 2.3C migration script to transfer `.data/*.json` and SQLite to PostgreSQL. | **High:** Requires database migration PLUS architectural refactoring of WebSocket transport. | **Moderate:** Requires Phase 2.3C migration script to load data into Dockerized PostgreSQL. |

### 9.1 Technical Verdict on SQLite vs. PostgreSQL
- **When SQLite Is Appropriate:** SQLite is a battle-tested, high-performance database. It is fully appropriate for production if SamJuniorsOS is deployed as a **single-node pinned instance** with reliable, locally-attached persistent block storage.
- **When PostgreSQL Is Required:** If SamJuniorsOS requires **multi-instance autoscaling**, zero-downtime rolling deployments, serverless compute, or distributed multi-region workers, SQLite is technically disqualified due to filesystem locking constraints across hosts. PostgreSQL becomes strictly mandatory.

---

## 10. Backup, Disaster Recovery & Observability

### 10.1 Backup Scope, Ownership & Encryption
- **Scope:** Complete database dump (PostgreSQL schema and data) including all relational entities, approval records, decisions, epistemic facts, workflows, and conversation history.
- **Ownership:** Corporate IT / Infrastructure Operator role. Automated tooling performs backups; human operator verifies quarterly.
- **Encryption:**
  - Backups at rest: AES-256 encryption enforced prior to off-site replication.
  - Backups in transit: TLS 1.3 enforced on all transfer connections.
  - Key management: Backup encryption keys managed independently of application runtime secrets.
- **Snapshot Retention Policy:** **UNDECIDED — ILLUSTRATIVE PROPOSAL** (daily snapshots retained for 30 days, annual audit snapshot retained for 1 year proposed) — **FOUNDER DECISION REQUIRED**. Decision factors: corporate audit requirements, storage cost, recovery window needs, and privacy/deletion obligations.

### 10.2 Restore Validation & Point-in-Time Recovery
- **Restore Testing:** An untested backup is an invalid backup. The target operations pipeline must execute an automated monthly restore validation pass into an ephemeral sandbox database.
- **Point-in-Time Recovery (PITR) Window:** **UNDECIDED — ILLUSTRATIVE PROPOSAL** (7-day rolling PITR proposed) — **FOUNDER DECISION REQUIRED**. Continuous Write-Ahead Log (WAL) archiving allows restoring the database to any specific second. Decision factors: WAL storage volume and cost, recovery SLA, and regulatory retention obligations.
- **Recovery Objectives Notice:** Recovery Point Objective (RPO) and Recovery Time Objective (RTO) are business policy choices that must be explicitly established by founder decision, not fabricated by engineering.

### 10.3 Observability, Health & Integrity Monitoring
- **Database Health Check (`/api/health`):** Validates database connectivity via `SELECT 1` with a strict 2-second timeout. Returns HTTP 200 (Healthy) or HTTP 503 (Unhealthy).
- **Storage Growth Monitoring:** Automated alerting triggers when database table size or disk volume exceeds 80% capacity.
- **Queue & Worker Health:** Scheduler evaluation heartbeat records monitor background worker execution. If `SchedulerHeartbeat` is not logged within $2 \times \text{cadence}$, an alert triggers.
- **Audit Ledger Cryptographic Integrity:** A daily scheduled verification task iterates over `SideEffectAudit` and `CanonicalFact` rows to verify that cryptographic hashes match payload contents.

---

## 11. Threat & Failure Analysis

| Failure Scenario | Prevention Strategy | Detection Mechanism | Automated Recovery Procedure | Human Escalation Protocol |
|---|---|---|---|---|
| **1. Process Crash During Write** | Atomic filesystem rename (`tmp -> final`) or ACID database transactions (`BEGIN...COMMIT`). | Uncaught exception handler; container process exit code logging. | Next.js process auto-restarts; database rolls back uncommitted transaction. | Alert sent if restart loop exceeds 3 crashes in 5 minutes. |
| **2. Host Replacement / Pod Eviction** | Decouple storage from compute; state stored in managed PostgreSQL, not container disk. | Kubernetes / Cloud Run termination signal (`SIGTERM`) handler. | Graceful drain: active requests finish (30s window), leases released on exit. | Operator notified if node reschedule causes >60s service interruption. |
| **3. Database Outage** | Connection pool retry policy; multi-AZ automated failover on managed DB. | Health check endpoint reports 503; error logs record `DatabaseAuthorityError`. | Requests fail closed; incoming webhooks buffer at proxy; scheduler halts. | Pager alert to Founder / Operator immediately. |
| **4. Partial Migration Failure** | Wrap migration scripts in strict transactional blocks; pre-flight schema checks. | Migration runner catches SQL error, prints failed statement and table state. | Database transaction automatically rolls back; zero partial state written. | Engineer inspects migration log, fixes schema discrepancy, re-runs. |
| **5. Duplicate Worker Execution** | Distributed leases (`LeaseManager`) and atomic row claims (`SKIP LOCKED`). | Unique constraint collision on execution key or idempotency claim. | Secondary worker receives `OperationInProgressError` and halts safely. | Logged as operational warning; investigated if frequency exceeds baseline. |
| **6. Stale Lease Holder (Node Died)** | Leases have mandatory short time-to-live (`ttlMs = 30000`) and fencing tokens. | Worker heartbeat timestamp exceeds `expiresAt` threshold. | Standby worker claims expired lease atomically via conditional update. | Warning logged if lease expires without voluntary release. |
| **7. External Provider Timeout (Unknown Outcome)** | Idempotency keys sent on every request; records enter `unknown` state. | HTTP client catches `ETIMEDOUT` or `ECONNRESET`; state set to `unknown`. | Status probe worker queries external API before retry; blind retry blocked. | Alert founder if status probe cannot resolve outcome after 3 attempts. |
| **8. Permission Escalation Attempt** | Server-side identity validation (`assertFounder`); no client-trusted headers. | Security middleware logs unauthorized actor or missing session token. | Request rejected immediately with HTTP 403 Forbidden; action blocked. | Security incident logged; suspicious IP / account flagged for review. |
| **9. Prompt Injection Attempting Writes** | Fencing untrusted LLM output; deterministic `SideEffectAuthorizationGate`. | Lexical / constitutional verifier detects policy boundary violation. | LLM proposal rejected by gate; side effect blocked; zero state written. | Flagged in Founder Decisions inbox as suspicious prompt injection attempt. |
| **10. Backup File Corruption** | SHA-256 checksum recorded at backup creation; GPG signature validation. | Monthly automated restore sandbox attempts test rehydration and verification. | Corrupted backup flagged; previous verified daily backup marked active. | Immediate alert to Operator to investigate backup storage provider. |
| **11. Accidental Deletion Request** | Hard deletes disabled for corporate records; anti-resurrection tombstones. | Deletion request checks entity type; logs tombstone with founder identity. | Entity marked `status = 'deleted'`; data preserved in audit storage. | Accidental deletion can be reverted by Founder via tombstone reversal. |
| **12. Schema Migration Incompatibility** | Backward-compatible migrations (Expand-Contract pattern); test against replica. | CI test suite runs integration tests against target schema before deploy. | Deployment halted before traffic shifts; previous code version stays active. | Schema designer revises migration to preserve backward compatibility. |

---

## 12. Reversible Migration Protocol

To transition from the current SQLite/`.data` hybrid to the production database architecture without unverified claims of "zero data loss" or "instant rollback", engineering must follow a strict 5-stage migration sequence.

```
┌─────────────────────────────────┐
│ STAGE 1: DISCOVERY & SNAPSHOT   │ ◄── Enforceable write freeze across all 7 mutation entry points, drain in-flight, capture hashes
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ STAGE 2: TARGET SCHEMA & CHECKS │ ◄── Validate indexes, foreign keys, version constraints
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ STAGE 3: EXTRACTION & TRANSFORM │ ◄── Deterministic extraction script; log malformed/orphan rows
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ STAGE 4: INGESTION & RECONCILE  │ ◄── Dry-run transaction; semantic equivalence reconciliation across 8 domains
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ STAGE 5: CUTOVER & RECOVERY GATE│ ◄── Controlled pre-write vs post-write cutover architecture with external side-effect isolation
└─────────────────────────────────┘
```

### Stage 1: Discovery, Enforceable Write Freeze & Source Snapshot

A write freeze cannot simply rely on stopping workers, pausing WebSockets, or returning HTTP 503; such measures fail to guarantee that all concurrent writes have stopped or that all external events will be retried. The write freeze must be centrally enforced at the domain write boundary.

#### 1.1 Architectural Limitation of Current Repository State & Fencing Requirements
In the active repository codebase, persistence is split between local `.data/*.json` files and SQLite (`custom.db`). Locking relies on single-host PID checks (`process.kill(pid, 0)`). **There is currently no shared distributed lock manager, no global fencing token mechanism, and no cross-process write gate in active code.** Merely inspecting `.lock` files or setting an in-memory variable cannot guarantee that another worker, process, or CLI script is not mutating state. Therefore, an explicit shared fencing and draining mechanism must be established before migration can proceed.

- **Status Caveat:** The write-freeze architecture specified below is an engineering design specification and implementation contract; it must **NOT** be described as operationally proven until the mechanism has been implemented, validated by automated integration tests, and rehearsed in staging.
- **Failure of the Fencing Coordinator:** If the shared fencing coordinator or lock record is unreachable, partitioned, or errors out, the system must **fail-closed**—every mutation method must abort immediately and throw `FencingCoordinatorUnavailableError`, preventing uncoordinated writes during infrastructure uncertainty.

#### 1.2 Centrally Enforced Write Freeze at the Application Boundary
1. **Authoritative Maintenance Fencing Record:**
   - A centralized fencing record (`maintenance_state = active`, `fencing_token = N`) must be evaluated at every authoritative mutation boundary across all running application instances. Any write attempt presenting an outdated fencing token or initiated while maintenance is active throws `MaintenanceModeError` (returning HTTP 503 with `Retry-After: 300`).
   - **Atomic Counter & Token Updates:** The shared `fencing_token` and `ActiveMutationCounter` must be updated atomically using atomic Compare-And-Swap (CAS) primitives (e.g., SQL `UPDATE fencing_lock SET counter = counter + 1, version = version + 1 WHERE version = current_version`, or atomic coordinator primitives). In-memory increments or un-synchronized multi-step updates are strictly disallowed.
   - **Fencing Stale Workers:** Any worker process delayed by garbage collection, slow I/O, or a network partition will present a stale token or find its lease expired. When it attempts a write, the gate checks `presentedToken === currentFencingToken && leaseValid`. Because the token is rotated upon freeze engagement, the write is rejected fail-closed with `StaleFencingTokenError`.
2. **Current Mutation Entry Point Inventory & Completeness Acceptance Criteria:**
   - *Current Inventory Clarification:* The 7 mutation entry points documented below represent a **current inventory based on static code inspection of the active codebase**, NOT a proven exhaustive inventory.
   - **Implementation Acceptance Criteria for Proving Completeness:**
     Before migration can proceed to execution, engineering must satisfy six explicit completeness criteria:
     1. *Call-Site & Method Enumeration:* Run AST-based static analysis and runtime audit scripts to enumerate every authoritative mutation method and direct write call site across the codebase (e.g., `writeCollectionUnderLock`, `writeRawCollection`, Prisma mutations `create`/`update`/`delete`/`upsert`, `ServerAgentExecutor.executeTool`, `ScheduledWorkEngine.claimItem`, `EpistemicClaimStore.commitFact`).
     2. *Path Tracing to Entry Points:* Construct an explicit call graph tracing every API endpoint, background worker loop, scheduler heartbeat, startup routine (`ensureInitialized`), CLI maintenance script, webhook handler, and WebSocket message router directly to its terminating write method.
     3. *Bypass Detection:* Actively identify and eliminate any write call sites that bypass the proposed central gate (e.g., un-gated `fs.writeFileSync`, un-proxied Prisma calls, direct SQLite file access, or unmanaged test utilities).
     4. *Mandatory Fencing Token Validation:* Ensure all authoritative write methods require and validate the current `fencingToken` prior to committing mutations to disk or database.
     5. *Independent Boundary Probes:* Require independent probe writes at every mutation boundary (API route, scheduler claim, agent worker dispatch, direct DB write, file store write), rather than relying only on a reverse-proxy health probe.
     6. *File-Backed Write Fencing:* File-backed stores (`DurableFileStore`) must wrap atomic write/rename calls with fencing token verification; during freeze, `.data/` directory permissions can be set read-only (`chmod 444`) or mounted read-only.
   - **Current Inventory of 7 Mutation Entry Points & Owning Domain Stores (Static Inspection):**
     - **Entry Point 1 (Public & Privileged REST APIs):** `/api/orchestrate`, `/api/decision/*`, `/api/workflow/*`, `/api/approvals/*`, `/api/sophia/*`, `/api/agents/*`, `/api/settings/*` -> Owned by `WorkflowStore`, `DecisionStore`, `ApprovalStore`, `AgentRunStore`.
     - **Entry Point 2 (Scheduled Work Engine & Heartbeats):** Recurring automation loops in `ScheduledWorkEngine` and heartbeat logs in `SchedulerHeartbeat` -> Owned by `ScheduledWorkStore`.
     - **Entry Point 3 (Autonomous Workers & Tool Side Effects):** `ServerAgentExecutor` tool mutations and `ConstitutionalVerifier` checks -> Owned by `AgentRunStore`, `AuditStore`.
     - **Entry Point 4 (Executive Council Deliberations):** `ExecutiveCouncilEngine` peer review and mediation writes -> Owned by `CouncilDeliberation` in `DurableFileStore`.
     - **Entry Point 5 (Inbound External Webhooks):** Stripe subscription/charge events, Resend email status, and GitHub webhook notifications -> Owned by `IdempotencyStore`, `AuditStore`, `CommunicationStore`.
     - **Entry Point 6 (Live WebSocket Companion):** `/api/live/*`, WebSockets on Port 3001 triggering cognitive turns, memory updates, or workflow state mutations -> Owned by `ConversationStore`, `PersonalMemoryStore`, `LiveTicketStore`.
     - **Entry Point 7 (Administrative & Startup Operations):** Startup seeding routines (`ensureInitialized()`, `seedInitialDecisionsUnderLock()`), database push/migrations, and CLI scripts (`scripts/reconcile-tombstones.ts`) -> Owned by `DecisionStore`, `CompanyStateStore`.
3. **How New Work Is Prevented from Starting:**
   - **Reverse Proxy / Edge Layer:** Intercepts all inbound HTTP traffic and returns HTTP 503 `Service Unavailable` with `Retry-After: 300` for all routes except `/api/health`.
   - **Ingress Webhooks:** Route traffic directly to the Durable Ingress Buffer (detailed in §1.4).
   - **WebSocket Gateway:** Broadcasts WebSocket close frame `1008 (Policy Violation / Maintenance)` to all active connections and rejects new upgrade handshakes.
   - **Scheduler Engine:** Disables execution loops; prevents claiming items or renewing leases.
   - **Startup & CLI Scripts:** Check the shared fencing record; refuse execution if maintenance mode is active.
4. **Cooperative Cancellation, Draining & Transaction Boundaries:**
   - *No Forcible Kill Assumptions:* Forcibly terminating worker processes (`SIGKILL`) does NOT automatically roll back arbitrary database transactions or undo external provider API calls. Forcible termination risks tearing SQLite database files or leaving `.lock` files orphaned.
   - *Cooperative Abort Signal (`AbortSignal`):* A centralized abort signal is broadcast to all active worker contexts. In-flight workers cooperatively check this signal between steps and cleanly terminate or roll back.
   - *Drain Window & Active Mutation Counter:* Compute nodes maintain an `ActiveMutationCounter` tracking open transactions and active file writes. A 30-second drain window allows active transactions to commit cleanly if already past the point of no return, or cleanly roll back via `ROLLBACK`.
   - *Handling Unfinished Operations:* Any worker failing to complete before the 30-second deadline has its distributed lease revoked via fencing token invalidation (preventing late writes from succeeding). Its execution state is marked `halted_uncertain` in a migration drain log, and any uncommitted transaction is aborted.
5. **Reconciliation of Dispatched or Uncertain External Side Effects:**
   - For any external side effect (Stripe charge, GitHub issue/PR, Resend email) that was initiated or is in an `unknown` outcome state during the freeze, an automated pre-migration status probe queries the external provider API using the operation's `idempotencyKey`. The outcome must be resolved (either confirmed executed or confirmed absent) before snapshotting.
6. **Database Read-Only Controls: SQLite, PostgreSQL & File Stores (Separated & Clarified):**
   - *SQLite-Specific Read-Only Controls:*
     - Connection Pragma: `PRAGMA query_only = ON;` (prevents INSERT, UPDATE, DELETE, CREATE, DROP on that specific connection handle).
     - Connection URI Mode: Opening SQLite via `file:custom.db?mode=ro` (enforces read-only at the SQLite VFS layer).
     - Filesystem-Level Write Protection: Setting filesystem permissions to read-only (`chmod 444 custom.db custom.db-wal custom.db-shm`).
     - *Scope & Limitations:* `PRAGMA query_only = ON;` applies strictly to the single connection on which it was executed. Other processes or connections opening `custom.db` without `query_only = ON` or `mode=ro` can still mutate the database. SQLite WAL mode checkpoints also require write access. Neither setting protects against file-level corruption if an uncoordinated process writes directly to disk.
   - *PostgreSQL-Specific Database/Transaction Read-Only Controls:*
     - Database Default: `ALTER DATABASE <dbname> SET default_transaction_read_only = on;` (sets default transaction mode to read-only for all new client sessions).
     - Session/Transaction Level: `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;` or `BEGIN TRANSACTION READ ONLY;`.
     - Role Privilege Revocation: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM <app_user>;`.
     - In-Flight Writer Termination: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '<dbname>' AND pid <> pg_backend_pid();` (terminates active read-write sessions).
     - *Scope & Limitations:* `default_transaction_read_only = on` affects new sessions, not existing active transactions (which must be explicitly terminated via `pg_terminate_backend`). Superusers or sessions explicitly executing `SET TRANSACTION READ WRITE;` can bypass it unless role privileges are revoked or read-only replica mode is engaged.
   - *Fundamental Limitation: Neither Control Prevents File-Backed Mutations:*
     - SQLite and PostgreSQL read-only controls are strictly database-engine mechanisms. They have ZERO awareness or enforcement over `.data/*.json` files (`decisions.json`, `council_deliberations.json`, `conversations.json`, `chat_messages.json`, `sophia_memories.json`), direct OS filesystem calls (`fs.writeFileSync`), or temporary files.
     - **A single database read-only setting CANNOT and DOES NOT freeze the whole application.**
     - The migration gate must independently account for:
       1. SQLite engine (URI `mode=ro`, filesystem permissions)
       2. PostgreSQL engine (`default_transaction_read_only = on`, `pg_terminate_backend`)
       3. `.data` file stores (fencing token verification wrapper, directory read-only permissions/lock)
       4. Direct filesystem writes & CLI scripts (fencing token validation, file permissions)
       5. Background workers & scheduler (distributed lease revocation, `AbortSignal`, loop termination)
       6. External side effects (pre-freeze cessation, idempotency status probes for unknown outcomes)
7. **Verification Proof Checklist (8 Multi-Boundary Proof Gates):**
   - The system must verify 8 explicit independent gates before snapshotting:
     1. *Gate 1 (Edge Ingress Frozen):* Reverse proxy returns HTTP 503 to probe requests on all routes except `/api/health`.
     2. *Gate 2 (Shared Coordinator & Fencing Token Engaged):* Shared `MaintenanceLock` active; fencing token rotated and verified across all instances.
     3. *Gate 3 (Active Mutations Drained):* Shared `ActiveMutationCounter === 0` across all instances; drain window elapsed without timeout.
     4. *Gate 4 (Workers & Leases Halted):* All background loops stopped; zero active `.lock` files; all `DistributedLease` records unheld or expired.
     5. *Gate 5 (Database Engine Read-Only Verified):* SQLite opened in `mode=ro` (or file permissions set read-only); PostgreSQL `default_transaction_read_only = on` verified; active backend writers terminated.
     6. *Gate 6 (File-Backed Store Fencing Verified):* `.data/` directory write probe rejected by store wrapper (`MaintenanceModeError`) and OS permissions.
     7. *Gate 7 (Multi-Boundary Mutation Probe Rejections):* Independent probe mutations across all 7 mutation entry points (API, scheduler, worker, council, webhook, websocket, CLI) fail closed.
     8. *Gate 8 (External Side-Effect In-Flight Resolution):* All in-flight external side effects resolved via status probes (confirmed executed or confirmed absent).
   - Snapshot is taken ONLY after all 8 gates are certified and logged.

#### 1.3 Provider Webhook Delivery Realities & Primary Documentation
Universal vendor retry guarantees must not be assumed without evidence. Documented primary provider behaviors:

1. **GitHub Webhooks:**
   - **Primary Source:** [GitHub Docs: Redelivering deliveries for webhooks](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-deliveries-for-webhooks) & [Managing webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks) (Accessed: October 2026).
   - **Delivery Reality:** GitHub does **NOT** automatically redeliver failed webhook deliveries for standard organization or repository webhooks. If an endpoint is unreachable, times out, or returns HTTP 4xx/5xx, the delivery attempt is recorded as failed and is not automatically retried by GitHub.
   - **Manual & Programmatic Redelivery:** Failed deliveries can be inspected and manually redelivered via the GitHub UI (Settings > Webhooks > Edit > Recent Deliveries > Redeliver) or programmatically re-requested via the REST API (`POST /repos/{owner}/{repo}/hooks/{hook_id}/deliveries/{delivery_id}/attempts`).
   - **Three-Day Redelivery Window & Permissions:** GitHub documents a **three-day (3-day)** redelivery window (deliveries from the past 3 days can be redelivered). Redelivery requires repository or organization administration permissions (`admin:repo_hook` or `admin:org_hook`).
   - **Strict Invariant:** Redelivery is an administrative recovery capability, **NOT** an automatic failover mechanism and **NOT** a substitute for durable ingress buffering and idempotent processing.
2. **Stripe Webhooks:**
   - **Primary Source:** [Stripe Docs: Webhook delivery retries](https://docs.stripe.com/webhooks#delivery-attempts) (Accessed: October 2026).
   - **Live Mode Delivery Reality:** Stripe attempts webhook delivery with exponential backoff over a **3-day (72-hour)** window in live mode if the endpoint fails to return an HTTP 2xx status code.
   - **Sandbox / Test Mode Distinction:** In test mode, Stripe retries only 3 times over a few hours, contrasting sharply with the 72-hour live-mode window.
   - **Manual Resend:** Stripe supports manual event resending via the Dashboard or event querying via `GET /v1/events`.
3. **Resend Webhooks:**
   - **Primary Source:** [Resend Docs: Webhook Retries and Replays](https://resend.com/docs/dashboard/webhooks/retries-and-replays), [Resend Webhooks Introduction](https://resend.com/docs/dashboard/webhooks/introduction), and [Resend Webhooks Ingester](https://resend.com/docs/dashboard/webhooks/webhook-ingester) (Accessed: October 2026).
   - **Documented Automatic Retry Schedule:** Resend documents an explicit 8-attempt exponential retry schedule following failure:
     - Attempt 1: Immediately
     - Attempt 2: 5 seconds later
     - Attempt 3: 5 minutes later
     - Attempt 4: 30 minutes later
     - Attempt 5: 2 hours later
     - Attempt 6: 5 hours later
     - Attempt 7: 10 hours later
     - Attempt 8: 10 hours later (total span: ~27.5 hours from first failure).
   - **Automatic Endpoint Disabling:** If a webhook endpoint continuously fails and exhausts retries, Resend **automatically disables the endpoint** and emails an outage notification. The endpoint must be manually re-enabled in the Resend dashboard.
   - **Manual Replays:** Resend supports manual replay of individual webhook messages (both failed and successful) directly from the Resend Dashboard (*Webhooks > Endpoint > Webhook Message > Replay*).
   - **Platform Event Retention:** Event logs in the Resend dashboard are ephemeral and subject to standard platform retention policies.
   - **Self-Hosted Resend Webhook Ingester:** For durable long-term retention and direct database storage, Resend publishes the open-source **Resend Webhooks Ingester** (`resend/resend-webhooks-ingester`, Docker image `ghcr.io/resend/resend-webhooks-ingester`). It verifies webhook signatures (using the Svix cryptographic signature standard `svix-signature`), handles idempotency, and streams events directly into PostgreSQL, MySQL, or MongoDB.
   - **Specific Correction:** Do not claim Resend uses Svix internally for scheduling/tier management; Svix is used for the cryptographic signature verification standard (`svix-id`, `svix-timestamp`, `svix-signature`), while the retry schedule and endpoint lifecycle are defined directly by Resend.
4. **Generalization Rule:** Do not generalize one provider's retry behavior to another. Because GitHub does not auto-retry, any downtime without ingress buffering causes event loss unless manually redelivered within the 3-day window.

#### 1.4 Durable Ingress Buffering Specification (Provider-Neutral Queue Contract & Adapter Semantics)
To prevent event loss during migration write freezes without relying on vendor retry policies, a dedicated Durable Ingress Buffer must sit between public webhook ingress and internal domain processing:

```
EXTERNAL WEBHOOK (Stripe / GitHub / Resend)
                     │
                     ▼
       ┌───────────────────────────┐
       │ 1. INGRESS BUFFER GATEWAY │ ◄── Verifies cryptographic signature; rejects invalid.
       └─────────────┬─────────────┘
                     │
                     ▼
       ┌───────────────────────────┐
       │ 2. DURABLE MESSAGE QUEUE  │ ◄── Durable write/ack before HTTP 200/202 ack to provider.
       │    (Provider-Neutral SQS/ │     Stores raw payload, headers, provider event ID.
       │     PubSub/Redis Streams) │
       └─────────────┬─────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
   NORMAL STATE             FREEZE STATE
   (Immediate Relay)        (Buffered Queue Hold)
        │                         │
        ▼                         ▼
   Application Ingest        Post-Cutover Idempotent Replay
```

##### 1. Provider-Neutral Queue Contract
1. **Durable Acceptance Before Acknowledgment:**
   - The ingress buffer endpoint receives the raw webhook POST.
   - Verifies payload integrity and cryptographic signature (`Stripe-Signature`, `X-Hub-Signature-256`, `svix-signature`) using the configured signing secret. Invalid signatures are rejected immediately with HTTP 400/401 and discarded.
   - Extracts stable provider event identifiers: Stripe `event.id`, GitHub `X-GitHub-Delivery`, Resend `svix-id`.
   - Writes raw payload, headers, provider event ID, and ISO timestamp durably to disk/queue storage with synchronous durability acknowledgment before returning HTTP 200/202 to the external provider.
2. **Acknowledgement & Retry Behavior:**
   - Returns HTTP 200/202 to provider only after durable persistence is guaranteed.
   - If the buffer cannot durably persist (e.g. disk full, queue full), it returns HTTP 503 so that auto-retrying providers (Stripe, Resend) back off and retry later, while alerting operators immediately for GitHub deliveries.
3. **Retention & Replay Policy:**
   - Raw buffered events are retained until explicitly acknowledged and reconciled by the application processor post-cutover.
   - Retention window: **UNDECIDED — ILLUSTRATIVE PROPOSAL** (7–14 days proposed) — **FOUNDER DECISION REQUIRED**. Decision factors: storage overhead, disaster recovery margin, incident review window.
4. **Idempotent Processing & Duplicate Handling:**
   - Application consumer processes buffered queue items sequentially or by partitioned event ID.
   - Checks `IdempotencyStore` using composite key `provider:eventId` inside an atomic transaction.
   - If already processed, the duplicate is acknowledged and skipped.
5. **Dead-Letter & Quarantine Behavior:**
   - Malformed payloads, unparseable JSON, or persistent consumer errors are quarantined into a Dead-Letter Queue (DLQ) after a bounded retry limit (e.g. 5 attempts with exponential backoff).
   - Quarantined events do not block processing of subsequent valid queue messages.
6. **Monitoring & Manual Recovery:**
   - Exposes metrics: buffer queue depth, ingestion latency, signature rejection rate, DLQ item count.
   - CLI tool allows operators to inspect DLQ payloads, correct schema mismatches, and re-enqueue events.
7. **Buffer Unavailability Handling:**
   - If the buffer service itself becomes completely unavailable, inbound webhooks fail at the HTTP edge (HTTP 502/503).
   - Immediate high-priority paging alert is sent to Founder / Operator.
   - Post-incident recovery relies on Stripe auto-retries, Resend auto-retries, and manual GitHub redelivery via the GitHub UI/API within the documented 3-day redelivery window.

##### 2. Candidate Queue Adapters: Durability, Delivery & Failure Semantics
The queue contract above can be backed by different infrastructure adapters. Each candidate presents distinct configuration-dependent guarantees:

| Dimension | AWS SQS (Simple Queue Service) | Google Cloud Pub/Sub | Redis Streams |
|---|---|---|---|
| **Persistence & Replication Configuration** | Managed multi-AZ synchronous replication across availability zones within AWS region. Standard vs. FIFO queues. | Managed multi-zone synchronous storage across zones in GCP region. Regional/global topic routing. | In-memory data structure with Append-Only File (`AOF`) and replication. Requires `appendfsync always` or `everysec` + synchronous replica `WAIT`. |
| **Producer Ack Guarantee** | HTTP 200 confirms message is durably written across multi-AZ storage nodes. | Publish ack confirms message is durably stored across multiple zones. | `XADD` returns entry ID. **Caveat:** Default config returns ack in memory before disk flush. Multi-node durability requires `WAIT <numreplicas> <timeout>`. |
| **Message Visibility & Consumer Ack** | Consumer receives via `ReceiveMessage`. Message hidden for `VisibilityTimeout` (0s–12h). Consumer calls `DeleteMessage` to acknowledge. | Pull/Push subscriptions. Message hidden for `ackDeadline` (10s–600s). Consumer calls `acknowledge`. | Consumer groups (`XREADGROUP`). Unacknowledged messages track in Pending Entries List (PEL). Consumer calls `XACK`. |
| **Consumer Crash Recovery** | Message becomes visible again automatically after `VisibilityTimeout` expires. | Message redelivered automatically after `ackDeadline` expires without ack. | Messages remain in PEL indefinitely. Must be periodically reclaimed via worker scanning (`XPENDING` + `XAUTOCLAIM` / `XCLAIM`). |
| **Retention & Dead-Letter Behavior** | Retention: 1 minute to 14 days (default 4 days). Native DLQ configured via redrive policy (`maxReceiveCount`). | Retention: 10 minutes to 31 days (default 7 days). Native DLQ configured via dead-letter topic (`maxDeliveryAttempts`). | Retention: bounded via `XTRIM` or `MAXLEN`. **No native DLQ**; application code must track `delivery_count` in PEL and manually route to DLQ stream. |
| **Duplicate Delivery Semantics** | At-least-once (standard); FIFO deduplicates on `MessageDeduplicationId` within 5-min window. Idempotency required. | At-least-once delivery; duplicates possible on network partition or worker crash. Idempotency required. | Monotonic IDs; duplicates generated if producer retries `XADD` or consumers reclaim via `XAUTOCLAIM`. Idempotency required. |
| **Durability Caveat / Non-Interchangeability** | Managed cloud guarantee; independent of compute host lifecycle. | Managed cloud guarantee; independent of compute host lifecycle. | Host-dependent. Without `appendfsync always` and `WAIT`, primary crash can lose acknowledged messages. |

- **Non-Interchangeability Rule:** Disk `fsync`, multi-zone consensus replication ($f \ge 1$), and managed cloud queue acknowledgments operate on fundamentally different failure models, latency profiles, and consistency tiers. They are **NOT** interchangeable.
- **Critical Invariant on Consumer Processing & Outbox/Inbox:**
  - A consumer must **NOT** acknowledge a message (`DeleteMessage`, `acknowledge`, `XACK`) as successfully processed until its corresponding domain transaction has committed durably to the authoritative database.
  - Where external side effects are involved (e.g. sending an email or initiating a charge):
    - The consumer transaction must write an Outbox record within the same local database transaction as the domain state update.
    - Alternatively, record an Inbox event before dispatching the external side effect.
    - If a crash occurs after external dispatch but before DB commit / queue ack: post-crash recovery must execute a status probe against the external provider's idempotency key before determining whether to commit or abort, preventing duplicate external side effects.
- **Adapter Choice:** Phase 2.3B defines the contract and evaluates candidate adapter characteristics, but does **NOT** select a queue provider. Selection is a Founder architecture decision.

### Stage 2: Target Schema & Constraint Validation
1. **Domain Contract Verification:** Confirm that all target tables match approved domain contracts.
2. **Schema Definition:** Generate PostgreSQL-compatible schema with explicit foreign keys, indexes, and unique constraints:
   - Create `model CompanyDecision` mirroring `DecisionRecord`.
   - Create `model CouncilDeliberation` mirroring `CouncilDeliberationRecord`.
   - Create `model CommunicationContact`, `CommunicationMessage`, etc.
3. **Migration Versioning:** Generate formal migration using `prisma migrate dev --create-only`.

### Stage 3: Extraction & Deterministic Transformation
1. **Extraction Script:** Execute an offline extraction script (`scripts/migrate-data-to-postgres.ts`).
2. **Data Integrity Invariants:**
   - Preserve all canonical string IDs (`dec-1`, `run-xxx`, `fact-xxx`).
   - Preserve all optimistic concurrency version numbers (`stateVersion`).
   - Preserve cryptographic payload hashes and approval signatures without recalculation.
   - Preserve exact ISO 8601 timestamps for creation, update, and supersession events.
3. **Anomaly Handling:** Malformed or orphaned records are logged to an anomaly report; no record is silently discarded.

### Stage 4: Ingestion & Semantic Equivalence Reconciliation
> **CRITICAL RECONCILIATION PRINCIPLE:** A 100% record-count match does NOT prove semantic equivalence. Matching counts can easily conceal corrupted foreign keys, lost transitions, truncated text, or mangled JSON payloads. Successful reconciliation cannot be claimed until the migration script is actually executed and verified against target PostgreSQL.

1. **Dry-Run Transaction:** Ingest extracted records into target PostgreSQL inside a rolled-back transaction to validate all foreign keys and unique constraints.
2. **Domain-Specific Semantic Invariants (Mandatory Automated Checks):**
   - **Decisions (`DecisionStore`):**
     - Primary key integrity: All `decisionId` match source.
     - State version integrity: `stateVersion` matches source.
     - History integrity: All elements in `transitions` array preserved with identical `stateVersion`, `transitionId`, `actor`, `fromStatus`, `toStatus`, and timestamps.
     - Cryptographic invariant: Recalculate `computeDecisionApprovalHash(record)` against the ingested record and assert bit-for-bit equality with `approvedPayloadHash`.
   - **Approvals & Governance (`ApprovalStore`):**
     - Status & consumption: Every approved record has `consumedAt` preserved; unconsumed records maintain `consumedAt IS NULL`.
     - Revocation & Expiration: Records marked `rejected`, `revoked`, or with `expiresAt < now()` maintain terminal non-executable status.
     - Single-use behavior: Assert that no record with `consumedAt` can ever match `findActiveMatching()` queries.
     - Payload binding: Canonical hash tuple `sha256(canonical(workflowInstanceId, stepId, payload))` is verified against stored hash.
   - **Epistemic Truth (`EpistemicClaimStore`):**
     - Provenance lineage: Every `EpistemicClaim` references an existing `EvidenceSource` or `EpistemicSignal` with valid foreign keys.
     - Content hashing: Re-hash evidence payloads to verify SHA-256 fingerprint matches stored hash.
     - Fact supersession: For every `CanonicalFact` with `validityState === 'superseded'`, assert `supersededById` references a valid successor fact and `supersededAt` is a valid timestamp $\ge$ predecessor `promotedAt`.
     - Active fact exclusivity: Assert exactly one active fact exists per unique subject identifier.
   - **Conversations (`ConversationStore`):**
     - Thread integrity: Every `ChatMessage` correctly references an existing parent `Conversation`.
     - Chronological order: Messages maintain strict monotonic timestamp ordering (`createdAt`).
     - Anti-resurrection tombstones: All tombstones (`ConversationTombstone`, `MessageTombstone`) verified; assert tombstoned IDs return 404/409 on query.
     - Idempotency keys: Message `idempotencyKey` values preserved and index-enforced.
   - **Sophia Personal Mind (`PersonalMemoryStore`):**
     - Founder isolation: Assert 100% of memories are partitioned by `founderId`; zero cross-tenant contamination.
     - Lifecycle states: `PROPOSED`, `ACTIVE`, `DEPRECATED`, `REVOKED`, `PURGED` preserved.
     - Segregation boundary: Assert zero references from Personal Mind rows to Canonical Facts or Company Knowledge tables.
   - **Workflows (`WorkflowStore`):**
     - Instance versions: `stateVersion` matches across instance and step states.
     - Step claims: Active worker step claims have valid `claimedBy` and step status (`claimed`, `running`).
     - State machine integrity: All step statuses follow valid DAG transitions.
   - **Agent Runs (`AgentRunStore`):**
     - Lifecycle status: Final status (`completed`, `failed`, `halted`) matches duration and output content.
     - Provenance & model: Model identifiers and token counts preserved.
   - **Executive Council (`ExecutiveCouncilEngine`):**
     - Deliberation structure: Input proposal, specialist critiques (Researcher, PM, Finance), and COO mediation ruling preserved with matching council fingerprint.
3. **Anomaly Classification & Manual Resolution:**
   - `CRITICAL` (Halts Cutover): Missing records, mismatched cryptographic hashes, broken foreign keys.
   - `MALFORMED` (Requires Operator Review): Unparseable JSON metadata or legacy schema anomalies flagged in quarantined staging.
   - `ORPHAN` (Requires Founder Sign-off): Records whose parent entities no longer exist.
4. **Machine-Readable Reconciliation Report:** Emitted as `migration-reconciliation-report.json` certifying all semantic invariants before cutover is authorized.

### Stage 5: Cutover, Authority Transfer & Technically Honest Rollback
To avoid unverified promises of "instant rollback" or "zero data loss", rollback design is partitioned into explicit operational states that account for both database mutations and external side effects:

#### 5.1 Distinct Concepts Defined
1. **Application Rollback:** Reverting deployed application binaries, container images, or routing traffic back to the prior application version.
2. **Database Rollback:** Reverting schema changes or running down-migrations on the database instance.
3. **Data Recovery:** Restoring, forward-fixing, or reconciling application data records after corruption, partial write, or transactional anomaly.
4. **Authority Transfer:** The explicit, formal handoff where the application server switches `DATABASE_MODE=authoritative` to treat PostgreSQL as the sole system of record.

#### 5.2 Explicit Cutover Gates (All Must Pass with Human Founder Approval)
- **Gate 1 (Semantic Equivalence Certified):** Reconciliation report certifies 0 critical discrepancies and all defined domain semantic invariants pass without exception.
- **Gate 2 (Automated Test Pass on Target):** Full automated integration test suite passes against target PostgreSQL.
- **Gate 3 (Operational Rehearsal Complete):** Migration dry run completed in staging within planned maintenance window.
- **Gate 4 (Drained Workers & Multi-Boundary Fencing Verified):** Active lock monitor certifies exactly 0 in-flight mutations across all 7 mutation entry points, all 8 pre-snapshot proof gates (§1.2 item 7) pass, and all in-flight external side effects are resolved.
- **Gate 5 (Founder Authorization):** Explicit founder review and written authorization to execute authority transfer.

#### 5.3 Rollback Semantics: Pre-Write vs. Post-Write (Accounting for External Side Effects)
Rollback behavior depends fundamentally on whether production database mutations have been committed OR external side effects have been dispatched:

```
                          AUTHORITY TRANSFER
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
         STATE A: PRE-WRITE               STATE B: POST-WRITE OR
       (Zero Production Writes          POST-EXTERNAL SIDE EFFECT
       & Zero External Effects)         (Mutations or External Effects Occurred)
                    │                         │
                    ▼                         ▼
        SAFE APPLICATION ROLLBACK        CONFIGURATION ROLLBACK INVALID!
        • Route traffic back to legacy   • Flipping config discards new writes!
        • Verified legacy source active  • Discards external audit records!
        • External effects verified zero • Duplicate external side-effect risk!
                                                  │
                                                  ▼
                                       CONTROLLED RECOVERY GATES
                                       1. Controlled Write Freeze
                                       2. External Provider Status Probes
                                       3. Founder Authorization
                                       4. Option B.1: Forward Recovery (Preferred)
                                       5. Option B.2: Reverse Change-Capture Replay
```

##### Scenario A: Pre-Write Rollback (Zero Production Writes AND Zero External Side Effects)
- **Strict Precondition:** A rollback can be classified as Scenario A IF AND ONLY IF:
  1. Zero production records or state mutations have been committed to PostgreSQL.
  2. **AND** Zero external side effects (charges created on Stripe, emails dispatched on Resend, comments/PRs posted on GitHub) were dispatched, acknowledged, or left pending with external providers.
- **Mandatory Cutover Safety Constraint:** To guarantee Scenario A eligibility during initial canary testing, **all external side effects must remain strictly disabled (`EXECUTION_MODE=dry_run` or safe mock mode)** during the initial smoke-testing cutover window until database authority is confirmed stable.
- **Action:** Execute Application Rollback: immediately route traffic back to the legacy deployment.
- **Safety:** The source `.data/` directory and SQLite database remain unmodified and verified.

##### Scenario B: Post-Write or Post-External-Side-Effect Rollback
- **Condition:** PostgreSQL has accepted production writes (decisions, chats, runs, approvals) **OR** any external side effect was dispatched or left in an unknown state with an external provider.
- **The Fatal Flaw of Naive Rollback:** **Configuration rollback (switching `DATABASE_URL` back to SQLite) is NOT a valid data rollback.** Doing so abandons mutations committed during the PostgreSQL window, causes divergent corporate histories, and leaves external operations orphaned without audit trails. Furthermore, an external provider may successfully execute an action even if the database write failed or timed out. Replaying from legacy storage without provider reconciliation risks duplicate charges, duplicate emails, and corrupted audit logs.
- **Post-Write / Post-Side-Effect Recovery Procedure:**
  1. **Immediate Controlled Write Freeze:** Engage global `MaintenanceLock` across all compute nodes to stop internal mutations.
  2. **External Provider Status Probes:** For every external side effect dispatched or in an `unknown` outcome state during the cutover window, run asynchronous status probes querying external providers via stored `idempotencyKey` values.
  3. **Preservation of Acknowledged Operations:** Any external action acknowledged by a provider must be imported into the audit records (`SideEffectAudit`, `EpistemicSignal`) so that historical truth is never lost.
  4. **Idempotency Key Injection:** Populate the legacy `IdempotencyStore` with all idempotency keys used during the PostgreSQL window to strictly prevent duplicate execution of the same side effects.
  5. **Founder Authorization Gate:** Founder evaluates the outage nature and authorizes one of two recovery pathways:
     - **Path B.1: Forward Recovery on PostgreSQL (Default & Preferred):** Resolve the application crash, connection pool exhaustion, or infrastructure bug in-place on PostgreSQL. Data remains intact; corporate history remains continuous; no reverse migration is needed.
     - **Path B.2: Reverse Reconciliation & Replay (Extreme Disaster Only):** If PostgreSQL suffers unrecoverable infrastructure failure, execute a pre-tested reverse change-capture script that extracts all mutations committed to PostgreSQL since cutover, validates them, and replays them into `.data/*.json` and SQLite before legacy authority is resumed.
  6. **Strict Invariant:** Reversibility must never be claimed as "instant" or "guaranteed" unless the reverse change-capture and replay tool has been formally developed, tested, and demonstrated in rehearsal.

#### 5.4 Legacy Data Source Retirement Policy
- **Policy:** **UNDECIDED — ILLUSTRATIVE PROPOSAL** (30-day read-only archive proposed) — **FOUNDER DECISION REQUIRED**.
- **Rule:** The frozen `.data/` files and SQLite database must remain preserved in read-only cold storage and never deleted until explicit founder authorization. Decision factors: post-migration audit window, compliance verification, and emergency fallback margins.

---

## 13. Staged Implementation Roadmap

```
PHASE 2.3A (Complete)     PHASE 2.3B (Current)      PHASE 2.3C (Proposed)     PHASE 2.3D (Proposed)
Authority Audit &      ►  Architecture Design    ►  PostgreSQL Foundation  ►  Production Cutover
Deployment Discovery      Revision (Draft)          (Gated by Founder)        & 24/7 Hardening
```

- **Phase 2.3A — Authority Audit & Deployment Discovery (COMPLETE):** Established repository reality: SQLite datasource, file-backed stores, and unverified deployment state.
- **Phase 2.3B — Persistence Authority & Production Architecture Design (CURRENT):** Architectural specification addressing founder review. Documentation only. Status: `DRAFT — PENDING FOUNDER REVIEW`.
- **Phase 2.3C — Production Persistence Foundation (PROPOSED):** Strictly gated by founder approval of Phase 2.3B. Scope: PostgreSQL schema migration, Prisma client update, extraction scripts, and store adapter updates.
- **Phase 2.3D — Production Cutover & 24/7 Hardening (PROPOSED):** Scope: Rehearsed cutover execution, connection pooler configuration, backup automation, and live telemetry verification.

---

## 14. Rejected Alternatives & Architectural Rationale

| Alternative Considered | Proposed Rationale | Why It Was Rejected |
|---|---|---|
| **1. Create a unified `CompanyBrainStore` class with a single `company_brain` mega-table.** | Appears to unify all memory into one clean interface. | **REJECTED.** Violates `AGENTS.md §3` (anti-duplication). Bundling decisions, facts, audit trails, and financial models into one table destroys domain-specific validation, breaks type safety, and complicates transaction locking. |
| **2. Keep SQLite in production on a mounted cloud network volume (EFS/NFS).** | Avoids introducing an external PostgreSQL service; keeps simple single-file database. | **REJECTED.** SQLite file locking over network mounts causes database corruption under concurrent access. Restricts horizontal autoscaling and prevents multi-container deployment. |
| **3. Merge Sophia Personal Mind into Company Brain.** | Eliminates the dual-memory concept and allows Sophia to query one database. | **REJECTED.** Violates `AGENTS.md §6` and `ARCHITECTURE.md §2`. The founder's personal dialogue and interaction style must not automatically become binding company truth or governance precedent without explicit review. |
| **4. Implement Role Brains during Phase 2.3B / 2.3C.** | Would allow specialized memory caches for PM, Researcher, and Finance agents. | **REJECTED.** Explicitly out of scope per Phase 2.3 roadmap. Role Brains must be downstream consumers of an already-stable, verified Company Brain authority layer. Implementing them now introduces architectural churn. |
| **5. Use vector embeddings (pgvector) as primary epistemic authority.** | Popular in AI agent frameworks for semantic recall. | **REJECTED.** Probabilistic vector search can return contradictory or superseded facts. Epistemic truth in SamJuniorsOS must be deterministic, governed by explicit validity states (`active`, `superseded`) and exact cryptographic verification. Vector indexing is a derived search optimization, never an authority. |
| **6. Client-Side State Authority.** | Let frontend components manage execution state and dispatch final outcomes. | **REJECTED.** Violates `AGENTS.md §3`. The frontend is strictly a representation and control surface. Server-authoritative state machines govern all corporate execution. |

---

## 15. Unresolved Founder Decisions

The following architectural decisions cannot be decided by engineering alone and require explicit founder direction:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               UNRESOLVED FOUNDER DECISIONS                              │
├──────────────────────────┬─────────────────────────────┬────────────────────────────────┤
│ DECISION                 │ OPTIONS CONSIDERED          │ OPERATIONAL IMPLICATION        │
├──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ 1. Production Hosting    │ • Option A: Single Container│ Determines compute cost,       │
│    Architecture Model    │ • Option B: Managed Cloud   │ scaling ceiling, and           │
│                          │ • Option C: Serverless/WS   │ operational maintenance burden.│
│                          │ • Option D: Linux VPS       │                                │
├──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ 2. Cloud Platform &      │ • AWS (ECS + RDS)           │ Dictates credentials, latency, │
│    Database Provider     │ • GCP (Cloud Run + CloudSQL)│ and monthly infrastructure     │
│                          │ • Supabase / Neon + Fly.io  │ expenditure.                   │
│                          │ • Hetzner / DigitalOcean VPS│                                │
├──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ 3. Disaster Recovery     │ • Founder to establish RPO  │ Balances backup frequency and  │
│    Objectives (RPO/RTO)  │   (e.g. 1 hour vs 24 hours) │ storage costs against recovery │
│                          │ • Founder to establish RTO  │ time expectations.             │
│                          │   (e.g. 30 min vs 4 hours)  │                                │
├──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ 4. Backup Retention &    │ • 7-day rolling PITR        │ ILLUSTRATIVE OPTIONS — FOUNDER │
│    Archival Window       │ • 30-day snapshot archive   │ DECISION REQUIRED. Dictates    │
│                          │ • 1-year annual audit freeze│ compliance and storage costs.  │
├──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ 5. Legacy Source Data    │ • 30-day cold retention     │ ILLUSTRATIVE OPTIONS — FOUNDER │
│    Retirement Policy     │ • 90-day cold retention     │ DECISION REQUIRED. Balances    │
│                          │ • Permanent cold archive    │ fallback margin against disk.  │
└──────────────────────────┴─────────────────────────────┴────────────────────────────────┘
```

---

## 16. Acceptance Criteria

The Phase 2.3B revision is complete only when:
- [x] Every architectural statement is classified consistently under Section 2.2 (`REPOSITORY EVIDENCE`, `INFERRED`, `UNKNOWN`; no static file inspection labeled `VERIFIED`).
- [x] The oversimplified four-tier classification is replaced with the independent 13-dimension classification matrix.
- [x] Store write semantics are corrected against actual repository source code (AgentRunStore upsert, ScheduledWorkStore split, ApprovalStore CAS, etc.).
- [x] The migration protocol in Section 12 details an enforceable write freeze across all 7 mutation entry points, cooperative draining, separate database read-only controls (SQLite vs PostgreSQL vs file stores), multi-boundary verification gates, and provider-neutral durable event ingress buffering with adapter semantics.
- [x] Webhook delivery semantics are documented accurately from official primary sources (GitHub, Stripe, Resend) without unsupported retry assumptions, generic Svix conflation, or universal queue claims.
- [x] Migration protocol details domain-specific semantic reconciliation invariants across all 8 domains without unsupported 100% equivalence claims.
- [x] Rollback design explicitly accounts for external side effects and distinguishes Pre-Write Cutover from Post-Write/Post-Side-Effect Cutover.
- [x] Concurrency and external side-effect reliability architecture (Outbox, Inbox, Idempotency, Status Probes) is fully specified.
- [x] Four hosting and database deployment options are objectively compared without presenting PostgreSQL as an unconditional requirement.
- [x] Backup, disaster recovery, and retention requirements are explicitly marked as `UNDECIDED — ILLUSTRATIVE PROPOSAL — FOUNDER DECISION REQUIRED` without invented SLAs or RPO/RTO metrics.
- [x] Twelve realistic failure scenarios are documented with Prevention, Detection, Recovery, and Human Escalation protocols.
- [x] Stale persistence claims and test assertions in `doc/ROADMAP.md` are qualified with exact historical commit references.
- [x] Machine-specific `file:///` URLs are completely absent; all links are repository-relative markdown paths.
- [x] Zero runtime code, database schemas, migrations, environment variables, or production infrastructure were modified.

---

## 17. Final Decision Gate

### 17.1 What Is Verified
1. **Local Repository State:** Inspected working tree on branch `phase/2.3b-persistence-authority-design`.
2. **Current Persistence Reality:** SQLite datasource in `prisma/schema.prisma`; active file-backed stores for Decisions, Council Deliberations, Conversations, and Personal Memories; in-memory storage for Communications.
3. **Locking Limitations:** In-process signal 0 checks fail to provide cross-container concurrency safety.
4. **Architectural Guardrails:** Strict preservation of Company Brain federation, Sophia Personal Mind isolation, and anti-duplication rules.

### 17.2 What Remains Unknown
1. **Active Cloud Deployment:** Whether SamJuniorsOS is currently hosted outside local development cannot be determined from repository files alone.
2. **Founder Target Infrastructure Preference:** Selection between Single-Host Container (Option A), Managed Cloud (Option B), Serverless Hybrid (Option C), or Self-Hosted VPS (Option D).
3. **Target Recovery Metrics:** Target RPO and RTO thresholds, backup retention schedules, and operational budget limits.

### 17.3 What Can Be Approved Now
- **The Revised Architectural Specification:** The 17 sections of this document establishing the domain contracts, independent data matrix, concurrency requirements, outbox/inbox reliability patterns, domain-specific semantic reconciliation, enforceable write freeze, provider-neutral durable buffering, and pre/post-write external side-effect rollback architecture.
- **The Staged Roadmap:** Maintaining Phase 2.3B as draft specification and gating Phase 2.3C behind explicit founder sign-off.

### 17.4 What Cannot Yet Be Approved
- **PostgreSQL Provisioning or Schema Migrations (Phase 2.3C):** Implementation must remain paused until the founder selects the hosting model and database provider.
- **Production Cutover Execution:** Cannot be authorized until migration extraction scripts are rehearsed and verified with a reconciliation report.
- **Role Brains Implementation:** Strictly deferred until Company Brain persistence authority is operational and verified.

### 17.5 Evidence Required Before Implementation Begins
1. Founder decision on Target Hosting Architecture (Option A, B, C, or D).
2. Provisioned `DATABASE_URL` (if PostgreSQL option selected) or persistent volume configuration (if SQLite option selected).
3. Founder review and formal approval of this revised Phase 2.3B specification.

---
**END OF SPECIFICATION — AWAITING FOUNDER REVIEW**
