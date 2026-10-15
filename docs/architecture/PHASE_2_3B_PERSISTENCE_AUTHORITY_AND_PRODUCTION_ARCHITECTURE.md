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
4. **Honest Migration Semantics:**  
   No migration protocol can claim "zero data loss" or "atomic cutover" prior to automated rehearsal, constraint validation, and end-to-end verification. A database transaction cannot atomically commit an external side effect (Stripe charge, GitHub push, Resend email). The revision removes all unsupported guarantees and defines a controlled 5-stage reversible migration protocol.

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
| **VERIFIED** | Directly confirmed through inspected, executed code, tests, or primary external provider records. | Requires verifiable file path, line numbers, or test execution logs. |
| **REPOSITORY EVIDENCE** | Directly visible in source code, schema files, or repository configuration, without proving active runtime behavior. | Confirms code presence; does not prove external hosting or durability. |
| **INFERRED** | Reasoned engineering conclusion derived logically from repository evidence. | Must explicitly state the premises and reasoning. |
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

To replace the oversimplified four-tier classification, every persistence domain is evaluated across 13 distinct technical dimensions.

| Domain & Owner | Canonical Authority | Write Semantics | Consistency Model | Durability Requirements | Retention & Deletion | Sensitivity & Auth Boundary | Transaction & Concurrency | Backup & Restore | Failure Behavior & Recovery | Current Implementation | Proposed Target Behavior | Evidence & Confidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Decisions** (`DecisionStore`) | Canonical | Mutable (stateVersion + transitions) | Optimistic Concurrency | High (survive redeploys) | Permanent corporate record | Highly Sensitive (Founder only) | Atomic CAS on version, collection lock | Daily backup, point-in-time | Fail-closed on lock timeout; in-memory cache | `.data/decisions.json` | PostgreSQL table `company_decisions` | **VERIFIED** ([`src/lib/server/decision/store.ts`](src/lib/server/decision/store.ts)) |
| **Epistemic Sources & Signals** (`EpistemicClaimStore`) | Canonical | Immutable | Append-Only (Idempotent by hash) | High | Permanent audit evidence | Restricted internal | Unique hash constraint | Daily backup, immutable archive | Duplicate insert ignored; SHA-256 check | SQLite via Prisma | PostgreSQL tables `epistemic_sources`, `signals` | **VERIFIED** ([`src/lib/server/epistemic/claim-store.ts`](src/lib/server/epistemic/claim-store.ts)) |
| **Epistemic Claims** (`EpistemicClaimStore`) | Canonical | Mutable (status transitions) | Eventual / Sequential | Moderate | Retained with claim history | Restricted internal | Atomic status update | Daily backup | Re-evaluable via verification policy | SQLite via Prisma | PostgreSQL table `epistemic_claims` | **VERIFIED** ([`src/lib/server/epistemic/claim-store.ts`](src/lib/server/epistemic/claim-store.ts)) |
| **Canonical Facts** (`EpistemicClaimStore`) | Canonical | Mutable (supersession pointers) | Transactional Supersession | Critical | Permanent (superseded marked) | High (Company Truth) | Atomic predecessor / successor link | Continuous WAL, PITR | Rollback to predecessor fact if invalid | SQLite via Prisma | PostgreSQL table `canonical_facts` | **VERIFIED** ([`src/lib/server/epistemic/claim-store.ts`](src/lib/server/epistemic/claim-store.ts)) |
| **Operational State** (`CompanyStateStore`) | Canonical | Mutable | Optimistic Concurrency | High | Overwritten on strategic update | Executive only | Version check on update | Daily backup | Fallback to default state seeds | In-memory + `.data/company_state.json` | PostgreSQL table `company_state` | **REPOSITORY EVIDENCE** ([`src/lib/server/state/state-store.ts`](src/lib/server/state/state-store.ts)) |
| **Company Knowledge** (`CompanyKnowledgeStore`) | Canonical | Replaceable / Versioned | Optimistic Concurrency | High | Version history retained | Company Internal | Content-hash uniqueness | Daily backup | Re-seed from markdown baseline | SQLite via Prisma + file cache | PostgreSQL table `company_knowledge` | **REPOSITORY EVIDENCE** ([`src/lib/server/knowledge/knowledge-store.ts`](src/lib/server/knowledge/knowledge-store.ts)) |
| **Company Memory** (`CompanyMemoryStore`) | Canonical | Append-oriented | Best-Effort / Eventual | Moderate | Soft deprecation supported | Company Internal | Simple insert / update | Daily backup | Loss causes precedent amnesia, not crash | SQLite via Prisma + file cache | PostgreSQL table `company_memories` | **REPOSITORY EVIDENCE** ([`src/lib/server/memory/memory-store.ts`](src/lib/server/memory/memory-store.ts)) |
| **Workflow Definitions** (`WorkflowStore`) | Canonical | Versioned / Immutable | Immutable per version | High | Retained across executions | Engineering / Admin | Unique `(id, version)` constraint | Daily backup | System cannot start if definitions missing | SQLite via Prisma | PostgreSQL table `workflow_definitions` | **VERIFIED** ([`src/lib/server/workflow/store.ts`](src/lib/server/workflow/store.ts)) |
| **Workflow Instances** (`WorkflowStore`) | Canonical | Mutable (state machine) | Strict Transactional (CAS) | Critical | Retain active & completed runs | Founder & Autonomous Engine | Atomic step claiming, version CAS | Continuous WAL, PITR | In-flight steps fail-safe, rehydrate on boot | SQLite via Prisma | PostgreSQL table `workflow_instances` | **VERIFIED** ([`src/lib/server/workflow/store.ts`](src/lib/server/workflow/store.ts)) |
| **Scheduled Work Items** (`ScheduledWorkStore`) | Canonical | Mutable | Transactional state machine | High | Retained for execution trail | System Scheduler | Lease-guarded atomic claims | Daily backup | Missed cron items detected on boot | SQLite via Prisma | PostgreSQL table `scheduled_work_items` | **VERIFIED** ([`src/lib/server/workflow/scheduler-store.ts`](src/lib/server/workflow/scheduler-store.ts)) |
| **Scheduler Heartbeats** (`ScheduledWorkStore`) | Audit Ledger | Append-Only | Append-Only | Moderate | Time-bounded (e.g. 90 days) | System Internal | Append-only insert | Standard snapshot | Missed heartbeat alerts founder | SQLite via Prisma | PostgreSQL table `scheduler_heartbeats` | **VERIFIED** ([`src/lib/server/workflow/scheduler-store.ts`](src/lib/server/workflow/scheduler-store.ts)) |
| **Approval Records** (`ApprovalStore`) | Canonical | Mutable (consumption state) | Strict Transactional (CAS) | Critical | Permanent governance audit | Founder Sovereign | Single-use CAS (`consumedAt IS NULL`) | Continuous WAL, PITR | Fails closed; requires fresh approval | SQLite via Prisma | PostgreSQL table `approval_records` | **VERIFIED** ([`src/lib/server/authorization/approval-store.ts`](src/lib/server/authorization/approval-store.ts)) |
| **Side Effect Audits** (`AuditStore`) | Audit Ledger | Immutable | Append-Only | Critical | Permanent immutable ledger | Compliance / Founder | Append-only insert (no updates) | Continuous WAL, immutable replica | Alert on audit write failure; halt action | SQLite via Prisma | PostgreSQL table `side_effect_audits` | **VERIFIED** ([`src/lib/server/authorization/approval-store.ts`](src/lib/server/authorization/approval-store.ts)) |
| **Agent Runs** (`AgentRunStore`) | Execution History | Mutable during run, then immutable | Optimistic / Upsert | Moderate | Retain for diagnostic window | Internal Engineering | Upsert on `runId` | Daily backup | Interrupted run marked `failed` on reboot | SQLite via Prisma (upsert) | PostgreSQL table `agent_runs` | **VERIFIED** ([`src/lib/server/agents/run-store.ts`](src/lib/server/agents/run-store.ts)) |
| **Council Deliberations** (`ExecutiveCouncilEngine`) | Canonical | Mutable during review, then sealed | Optimistic Concurrency | High | Permanent strategic record | Founder & Executive | Collection lock during deliberation | Daily backup | Interrupted deliberation marks `degraded` | `.data/council_deliberations.json` | PostgreSQL table `council_deliberations` | **VERIFIED** ([`src/lib/server/orchestration/council.ts`](src/lib/server/orchestration/council.ts)) |
| **Distributed Leases** (`LeaseManager`) | Transient Coordination | Highly Mutable | Strict Transactional (Fencing) | Low (TTL bounded) | Auto-expiring TTL | System Workers | Atomic conditional acquire/renew | Not required | Expired lease reclaimed by standby worker | SQLite via Prisma | PostgreSQL table `distributed_leases` | **VERIFIED** ([`src/lib/server/coordination/lease-manager.ts`](src/lib/server/coordination/lease-manager.ts)) |
| **Conversations & Messages** (`ConversationStore`) | Canonical | Append-Only Messages, Mutable Threads | Transactional Append | High | Retained until founder tombstone | Founder Confidential | Idempotency key uniqueness check | Daily backup | Tombstones prevent resurrected state | `.data/conversations.json`, `chat_messages.json` | PostgreSQL tables `conversations`, `chat_messages` | **VERIFIED** ([`src/lib/server/conversation/store.ts`](src/lib/server/conversation/store.ts)) |
| **Sophia Personal Memories** (`PersonalMemoryStore`) | Canonical (Personal) | Mutable (lifecycle FSM) | Optimistic Concurrency | High | Founder explicit revocation | Founder Confidential (Isolated) | Founder ID tenant isolation | Daily backup | Isolated from Company Brain | `.data/sophia_memories.json` | PostgreSQL table `sophia_memories` | **VERIFIED** ([`src/lib/server/sophia/personal-memory-store.ts`](src/lib/server/sophia/personal-memory-store.ts)) |
| **Communications** (`InMemoryCommunicationStore`) | Ephemeral / Staging | Mutable | In-Memory (No isolation) | Zero today (High target) | None today | Founder & Communication Worker | None today | None today | Process restart loses all CRM state | Ephemeral JavaScript `Map` | PostgreSQL tables `comm_*` | **VERIFIED** ([`src/lib/server/communication/store.ts`](src/lib/server/communication/store.ts)) |
| **Live WS Tickets** (`LiveTicketStore`) | Ephemeral Handshake | Replaceable (60s TTL) | In-Memory | Zero (Ephemeral) | Expired every 60 seconds | Ephemeral Gateway | Single-use consumption | None required | Expired ticket forces client re-auth | In-memory JavaScript `Map` | In-memory RAM Map / Redis | **VERIFIED** ([`src/lib/server/live/ticket-store.ts`](src/lib/server/live/ticket-store.ts)) |
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

### 10.2 Restore Validation & Point-in-Time Recovery
- **Restore Testing:** An untested backup is an invalid backup. The target operations pipeline must execute an automated monthly restore validation pass into an ephemeral sandbox database.
- **Point-in-Time Recovery (PITR):** Continuous Write-Ahead Log (WAL) archiving allows restoring the database to any specific second within a rolling 7-day retention window.
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

To transition from the current SQLite/`.data` hybrid to the production database architecture without unverified claims of "zero data loss", engineering must follow a strict 5-stage migration sequence.

```
┌─────────────────────────────────┐
│ STAGE 1: DISCOVERY & SNAPSHOT   │ ◄── Read-only lock, inventory files, capture SHA-256 hashes
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
│ STAGE 4: INGESTION & RECONCILE  │ ◄── Dry-run transaction; produce machine-readable diff report
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ STAGE 5: CUTOVER & ROLLBACK GATE│ ◄── Verify cutover gates; maintain instant rollback procedure
└─────────────────────────────────┘
```

### Stage 1: Discovery & Source Snapshot
1. **Mutation Freeze:** Stop local background workers, scheduler evaluations, and live WebSocket sessions.
2. **Cryptographic Source Snapshot:** Capture SHA-256 checksums and record counts for all source files:
   - All `.data/*.json` collections (`decisions.json`, `conversations.json`, `chat_messages.json`, `sophia_memories.json`, `council_deliberations.json`).
   - SQLite database file (`db/custom.db`).
3. **Inventory Manifest:** Generate a machine-readable JSON manifest recording file sizes, timestamps, and record counts.

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

### Stage 4: Ingestion & Reconciliation Pass
1. **Dry-Run Transaction:** Ingest extracted records into target PostgreSQL inside a rolled-back transaction to validate all foreign keys and unique constraints.
2. **Automated Verification Queries:** Execute side-by-side reconciliation queries:
   - Compare record counts between source files and target tables.
   - Verify that Epistemic Claims correctly link to Evidence Sources.
   - Verify that Canonical Facts correctly link to Epistemic Claims.
   - Verify that Approval Records correctly link to Workflow Instances.
3. **Machine-Readable Report:** Produce `migration-reconciliation-report.json` certifying 100% record match.

### Stage 5: Cutover, Recovery & Rollback Gates
1. **Explicit Cutover Gates:**
   - Gate 1: Reconciliation report confirms zero missing records.
   - Gate 2: Full automated test suite passes against target PostgreSQL.
   - Gate 3: Founder explicitly reviews and signs off on cutover report.
2. **Cutover Execution:**
   - Deploy code configured with `DATABASE_MODE=authoritative` and target PostgreSQL `DATABASE_URL`.
   - Shift application traffic to updated deployment.
3. **Rollback Criteria & Procedure:**
   - Rollback triggers: Database connectivity failure, transaction error rate > 0.5%, or data divergence detected within 1 hour post-cutover.
   - Rollback action: Revert `DATABASE_URL` and `DATABASE_MODE` to previous configuration. The frozen `.data/` directory and SQLite database remain unmodified and immediately restorable.
4. **Old Source Retirement:** Source `.data/` files and SQLite database are archived read-only and retained for 30 days before decommission.

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
│ 4. Backup Retention &    │ • 7-day rolling PITR        │ Dictates regulatory compliance │
│    Archival Window       │ • 30-day snapshot archive   │ and cloud storage overhead.    │
│                          │ • 1-year annual audit freeze│                                │
└──────────────────────────┴─────────────────────────────┴────────────────────────────────┘
```

---

## 16. Acceptance Criteria

The Phase 2.3B revision is complete only when:
- [x] Every important architectural claim is classified under the formal Evidence Register (`VERIFIED`, `REPOSITORY EVIDENCE`, `INFERRED`, `UNKNOWN`).
- [x] The oversimplified four-tier classification is replaced with the independent 13-dimension classification matrix.
- [x] Store write semantics are corrected against actual repository source code (AgentRunStore upsert, ScheduledWorkStore split, ApprovalStore CAS, etc.).
- [x] The migration protocol is redesigned as a controlled 5-stage reversible procedure without unsupported zero-data-loss guarantees.
- [x] Concurrency and external side-effect reliability architecture (Outbox, Inbox, Idempotency, Status Probes) is fully specified.
- [x] Four hosting and database deployment options are objectively compared without presenting PostgreSQL as an unconditional requirement.
- [x] Backup, disaster recovery, and observability requirements are defined without invented SLAs or RPO/RTO metrics.
- [x] Twelve realistic failure scenarios are documented with Prevention, Detection, Recovery, and Human Escalation protocols.
- [x] Roadmap status in `doc/ROADMAP.md` reflects `DRAFT — PENDING FOUNDER REVIEW` with Phase 2.3C remaining proposed.
- [x] Machine-specific `file:///` URLs are replaced with repository-relative markdown paths.
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
- **The Revised Architectural Specification:** The 17 sections of this document establishing the domain contracts, independent data matrix, concurrency requirements, outbox/inbox reliability patterns, and 5-stage reversible migration protocol.
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
