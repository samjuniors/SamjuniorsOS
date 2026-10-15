# PHASE 2.3B — Persistence Authority & Production Architecture Design

**Status:** APPROVED ARCHITECTURAL SPECIFICATION (DESIGN-ONLY)  
**Tracking Issue:** [#15](https://github.com/samjuniors/SamJuniorsOS/issues/15)  
**Document Type:** Architectural Decision Record & Production Specification  
**Branch:** `phase/2.3b-persistence-authority-design`  
**Inputs:**  
- `docs/architecture/PHASE_2_3A_COMPANY_BRAIN_AUTHORITY_AUDIT.md` (origin commit `08b8219`)  
- `docs/architecture/PHASE_2_3A_DEPLOYMENT_VERIFICATION.md`  
- `AGENTS.md` (Highest authority guardrails)  
- `ARCHITECTURE.md`, `PRODUCT.md`, `doc/ROADMAP.md`  
- Current repository source files in `src/lib/server/` and `prisma/schema.prisma`

---

## 1. Executive Summary & Core Architectural Invariants

### 1.1 The Core Invariant: One Company Brain Architecture, Not Another Store
SamJuniorsOS does **not** need a new monolithic database table or a monolithic class named `CompanyBrainStore`. Creating one would violate the non-duplication rule in `AGENTS.md §3` and create an unnecessary layer of indirection.

**Authoritative company truth is owned by a governed federation of dedicated domain stores.**  
The **Company Brain** is an architectural system—a set of strict governance rules, deterministic verification gates, provenance contracts, and bounded read projections over those domain stores.

```
                           FOUNDER
                              ↓
                        SOPHIA COGNITIVE
                         INGRESS LAYER
                              ↓
                  GOVERNED COMPANY BRAIN READ LAYER
      (Context Assemblers · Fact Lineage · Provenance Fencing · Read Models)
                              ↓
      ┌───────────────────────┼───────────────────────┐
      ↓                       ↓                       ↓
OPERATIONAL STATE     DECISION LEDGER        EPISTEMIC LEDGER
(CompanyStateStore)   (DecisionStore)        (EpistemicClaimStore)
      ↓                       ↓                       ↓
COMPANY KNOWLEDGE     HISTORICAL MEMORY      EXECUTION & AUDIT
(KnowledgeStore)      (CompanyMemoryStore)   (Workflow/Runs/Approvals)
```

### 1.2 Separation of Sophia Personal Mind vs. Company Brain
Per `AGENTS.md §6` and `ARCHITECTURE.md §2`:
- **Sophia Personal Mind** ([`PersonalMemoryStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/sophia/personal-memory-store.ts)) stores founder conversational preferences, interaction cadence, persona styling, and transient sensory notes.
- **Strict Boundary:** Personal Mind memories are **never** authoritative company truth, **never** an authorization bypass, and **never** automatically promoted into company memory. Promotion from personal dialogue to company fact requires explicit founder review and deterministic epistemic verification.

### 1.3 Reality Grounding: Current vs. Target Reality
- **Current Code Reality:** `prisma/schema.prisma` is an explicit SQLite port (`provider = "sqlite"`). Critical stores ([`DecisionStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/decision/store.ts), [`ConversationStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/conversation/store.ts), [`PersonalMemoryStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/sophia/personal-memory-store.ts), and [`ExecutiveCouncilEngine`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/orchestration/council.ts)) depend exclusively on local filesystem collections (`.data/*.json`). `ConversationStore` and `PersonalMemoryStore` have **no database read path** in any mode.
- **Target Production Reality:** A multi-host or autoscaled cloud runtime requires moving all shared state to a managed relational database with distributed locking, eliminating reliance on local disk and operating system process IDs.

---

## 2. Exhaustive Domain & Store Authority Mapping

Every data domain in SamJuniorsOS must have exactly one authoritative domain owner, an explicit persistence mechanism, and a clearly classified lifecycle.

| Domain | Current Implementing Class | Local Mode Persistence | Authoritative Mode Persistence | Authoritative Today? | Target Production Authority |
|---|---|---|---|---|---|
| **Decisions** | [`DecisionStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/decision/store.ts) | `DurableFileStore` (`decisions.json`) | `DurableFileStore` (`decisions.json`). **No Prisma mode exists.** | **Local file only.** | Relational PostgreSQL table `company_decisions` with optimistic version locking (`expectedStateVersion`). |
| **Epistemic Truth** | [`EpistemicClaimStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/epistemic/claim-store.ts) | `.data/*.json` collections + in-memory Maps | `PostgresEpistemicStore` via Prisma (`epistemic_sources`, `signals`, `claims`, `facts`, `verifications`) | **Prisma (SQLite today).** | PostgreSQL tables with explicit supersession lineage and event timestamps. |
| **Operational Reality** | [`CompanyStateStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/state/state-store.ts) | In-memory defaults (`os-data.ts`) + `.data/company_state.json` | Prisma `company_state` (only `initiatives` and `financialModel`). Other fields remain in-memory code seeds. | **Split authority / In-memory constants.** | Governed company operational state table with provenance; external systems (Stripe, GitHub) remain raw systems of record. |
| **Canonical Knowledge** | [`CompanyKnowledgeStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/knowledge/knowledge-store.ts) | In-memory cache + `.data/company_knowledge.json` | Prisma `company_knowledge` with create-only seed bootstrap | **Prisma (SQLite today).** | Relational PostgreSQL table `company_knowledge` with SHA-256 content fingerprints. |
| **Historical Memory** | [`CompanyMemoryStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/memory/memory-store.ts) | In-memory cache + `.data/company_memories.json` | Prisma `company_memories` | **Prisma (SQLite today).** | Relational PostgreSQL table `company_memories`. Explicitly non-evidence precedent storage. |
| **Workflow State** | [`WorkflowStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/workflow/store.ts) | In-memory Maps + `.data/workflow_*.json` | `PostgresWorkflowStore` via Prisma (`workflow_definitions`, `workflow_instances`) | **Prisma (SQLite today).** | Relational PostgreSQL tables with atomic step claiming and CAS state transitions. |
| **Schedules & Heartbeats** | [`ScheduledWorkStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/workflow/scheduler-store.ts) | In-memory Map + best-effort DB upsert. **No DurableFileStore.** | `PostgresScheduledWorkStore` via Prisma (`scheduled_work_items`, `scheduler_heartbeats`) | **Prisma (SQLite today).** | Relational PostgreSQL tables with distributed execution leases. |
| **Approvals & Audits** | [`ApprovalStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/authorization/approval-store.ts) / `AuditStore` | In-memory Maps + `.data/approvals.json`, `audits.json` | `PostgresApprovalStore` via Prisma (`approval_records`, `side_effect_audits`) | **Prisma (SQLite today).** | Relational PostgreSQL tables with SHA-256 payload binding and append-only audit enforcement. |
| **Durable Agent Runs** | [`AgentRunStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/agents/run-store.ts) | In-memory Map hydrated from `.data/agent_runs.json` | `PostgresAgentRunStore` via Prisma (`agent_runs`) | **Prisma (SQLite today).** | Relational PostgreSQL table `agent_runs`. |
| **Council Deliberations** | [`ExecutiveCouncilEngine`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/orchestration/council.ts) | `DurableFileStore` (`council_deliberations.json`) | `DurableFileStore` (`council_deliberations.json`). **No Prisma model exists.** | **Local file only.** | Relational PostgreSQL table `council_deliberations` with deliberation results and specialist critiques. |
| **Idempotency** | [`IdempotencyStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/idempotency/store.ts) | In-memory Map + `.data/idempotency.json` | `PostgresIdempotencyStore` via Prisma (`idempotency_records`) | **Prisma (SQLite today).** | Relational PostgreSQL table `idempotency_records` with TTL expiration enforcement. |
| **Distributed Leases** | [`LeaseManager`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/coordination/lease-manager.ts) | In-memory lease cache | `PostgresLeaseManager` via Prisma (`distributed_leases`) | **Prisma (SQLite today).** | Relational PostgreSQL table `distributed_leases` using atomic database transactions. |
| **Conversations & Chat** | [`ConversationStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/conversation/store.ts) | `DurableFileStore` (`conversations.json`, `chat_messages.json`) | `DurableFileStore`. Prisma writes are write-only shadows; **reads never touch DB.** | **Local file only.** | Relational PostgreSQL tables `conversations` and `chat_messages` with paginated retrieval. |
| **Sophia Personal Memory** | [`PersonalMemoryStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/sophia/personal-memory-store.ts) | `DurableFileStore` (`sophia_memories.json`) | `DurableFileStore`. Prisma writes are write-only shadows; **reads never touch DB.** | **Local file only.** | Relational PostgreSQL table `sophia_memories` isolated by `founderId`. |
| **Communications** | [`InMemoryCommunicationStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/communication/store.ts) | In-process RAM Maps only. | In-process RAM Maps only. **Zero disk or DB backing.** | **Ephemeral RAM only.** | Relational PostgreSQL tables for communication models; raw email/event storage retained at provider (Resend). |
| **Live WS Tickets** | [`LiveTicketStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/live/ticket-store.ts) | In-process RAM Map (TTL 60s). | In-process RAM Map (TTL 60s). | **Ephemeral RAM only.** | Ephemeral in-process RAM (or Redis if horizontal gateway scaling is introduced). |

---

## 3. Data Classification: Transactional, Append-Only, Derived, and External

To prevent over-engineering and ensure operational reliability, data is partitioned into four explicit tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   TIER 1: STRICT TRANSACTIONAL (ACID)                 │
│  • Approvals & Consumption     • Workflow Step State & Claims          │
│  • Distributed Leases           • Idempotency Claims                    │
│  • Decisions & Version Checks   • Canonical Fact Supersession           │
├────────────────────────────────────────────────────────────────────────┤
│                   TIER 2: IMMUTABLE / APPEND-ONLY LEDGER               │
│  • Side Effect Audit Log        • Agent Run Execution Trails            │
│  • Epistemic Sources & Signals • Automation Heartbeat Logs             │
├────────────────────────────────────────────────────────────────────────┤
│                   TIER 3: STRUCTURED RELATIONAL / DOCUMENT             │
│  • Conversations & Messages     • Sophia Personal Mind Memories         │
│  • Council Deliberations        • Canonical Knowledge (Specs/SOPs)      │
│  • Company Precedent Memories  • Governed Company Operational State    │
├────────────────────────────────────────────────────────────────────────┤
│                   TIER 4: REBUILDABLE / DERIVED / EPHEMERAL            │
│  • DependencyRelation Index     • GraphDTO Topology Read Model          │
│  • Activity Projections         • Live WS Handshake Tickets (60s)       │
│  • Sophia Context Assemblies    • In-memory UI Session Caches           │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Tier 1: Strict Transactional Records (Require ACID Row Locks / CAS)
These records govern consequential authority. Concurrency conflicts must fail closed rather than allow race conditions:
1. **Approval Records:** Enforces single-use consumption (`consumedAt`). Two concurrent workers must never execute the same approved mutation twice.
2. **Workflow Instance Step Claims:** Requires optimistic concurrency control (`expectedVersion`) or atomic row locks (`SELECT FOR UPDATE`) to prevent conflicting step state transitions.
3. **Idempotency Records:** Claiming an idempotency key requires an atomic `INSERT` or conditional update to prevent double-execution of non-idempotent side effects.
4. **Distributed Leases:** Mutual exclusion for the scheduler evaluation loop and single-instance runtime guards.
5. **Decisions:** Mutation requires verifying `stateVersion` matches expected version and recalculating cryptographic payload bindings.
6. **Canonical Fact Supersession:** Atomically updating predecessor `validityState = 'superseded'` and successor `supersededById` / `supersededAt`.

### 3.2 Tier 2: Immutable / Append-Only Ledgers
These records record historical evidence and compliance audits. Updates are strictly forbidden; only inserts are permitted:
1. **SideEffectAudit:** Append-only ledger of every executed or blocked external action.
2. **AgentRun:** Durable record of model inputs, prompts, outputs, durations, and token usage.
3. **EpistemicSource & EpistemicSignal:** Raw untrusted inputs with immutable SHA-256 content hashes.
4. **SchedulerHeartbeat:** Append-only history of automation wake-up evaluations.

### 3.3 Tier 3: Structured Relational / Document Stores
High-volume application state that must survive restarts and deployments:
1. **Conversations & Chat Messages:** Historical dialogue between founder and Sophia.
2. **Sophia Personal Memories:** Interaction preferences and personal context notes.
3. **Executive Council Deliberations:** Formal deliberation records, specialist critiques, and friction points.
4. **Company Knowledge & SOPs:** Markdown documents with version tags and content hashes.

### 3.4 Tier 4: Derived & Rebuildable Read Projections (Do Not Require Dedicated Transactional Storage)
1. **DependencyRelation:** Relational index derived from canonical facts. Dropping the table loses zero truth; it is deterministically rebuilt via `DependencyRelationStore.rebuildFromFacts()`.
2. **GraphDTO Read Model:** Stateless in-memory projection computed on demand by `read-model.ts` from primary database tables.
3. **Activity Projection:** Stateless timeline derived from `SideEffectAudit`, `WorkflowInstance`, and `AgentRun`.

### 3.5 External Operational Systems (Systems of Record)
SamJuniorsOS must **not** attempt to duplicate external operational databases:
* **Stripe:** Canonical source of truth for charges, subscription states, and credit card events. SamJuniorsOS stores only verified epistemic signals (`EpistemicSignal`) and cached financial summaries.
* **GitHub:** Canonical source of truth for git commits, pull requests, releases, and deployment statuses. SamJuniorsOS tools query GitHub directly and commit observations as provenance-backed sources.
* **Resend:** Canonical source of truth for email transit. SamJuniorsOS logs outbound side-effect audits and processes inbound webhooks.

---

## 4. Concurrency, Idempotency, and Failure Recovery

### 4.1 The Concurrency Boundary Problem in Current Architecture
The current local locking mechanism in `DurableFileStore` and `InstanceConcurrencyGuard` suffers from a fundamental architectural limitation:
```typescript
// From src/lib/server/persistence/durable-file-store.ts:
if (current.pid !== null && DurableFileStore.isProcessAlive(current.pid)) {
  return false;
}
```
* **Failure Mode:** `isProcessAlive` sends signal 0 (`process.kill(pid, 0)`) to check if an OS process exists on the **same physical host**.
* In any containerized or multi-node deployment:
  1. Two separate containers running on different hosts or pods share no PID table.
  2. A PID on container A might correspond to a completely unrelated OS process on container B.
  3. File locks (`.lock` via `wx` open) over networked filesystems (NFS, EFS, GCS Fuse) frequently suffer from lock-leasing bugs and stale NFS file handles.
* **Production Resolution:** All distributed locking, step claims, and lease coordination must move from local filesystem locks to **PostgreSQL ACID row-level locks** (`SELECT FOR UPDATE SKIP LOCKED` or transactional lease updates in `DistributedLease`).

### 4.2 Idempotency Lifecycle & Unknown-Outcome Recovery
Per `src/lib/server/idempotency/state-machine.ts`, all external side effects and executive operations must execute through the deterministic 5-state lifecycle:

```
             ┌───────────────┐
             │ UNREGISTERED  │
             └───────┬───────┘
                     │ claim(key, payloadHash, ttlMs)
                     ▼
             ┌───────────────┐
      ┌──────┤  IN_PROGRESS  ├──────┐
      │      └───────┬───────┘      │
      │ success      │ timeout /    │ unrecoverable
      ▼              │ network crash│ failure
┌───────────┐        ▼              ▼
│ COMPLETED │  ┌───────────┐  ┌───────────┐
└───────────┘  │  UNKNOWN  │  │  FAILED   │
               └─────┬─────┘  └───────────┘
                     │ verifyExternalSystem()
                     ▼
        (Deterministic Resolution)
```

1. **Atomic Key Claiming:** The key is claimed with an expiration TTL (`expiresAt`). A concurrent duplicate request with identical payload hash receives `OperationInProgressError` and halts safely.
2. **Payload Binding Guard:** If a duplicate key arrives with a mismatched `payloadHash`, it triggers `IdempotencyPayloadMismatchError` and fails closed (prevents parameter hijacking).
3. **Unknown Outcome Recovery:** If a network connection drops while calling an external provider (e.g., Stripe, Resend), the record transitions to `unknown`. Automated retries are prohibited until an explicit status probe verifies whether the external side effect succeeded or failed.

---

## 5. Production Infrastructure Architecture Assessment

### 5.1 Challenging the Technology Choices: Why Not SQLite for Everything?
Could SamJuniorsOS continue using SQLite in production with a single container?

| Criteria | SQLite with Local/Mounted Volume | Managed PostgreSQL (Neon / Supabase / RDS) |
|---|---|---|
| **Architectural Complexity** | Low (Single process, zero external network dependency). | Moderate (Requires managed service, connection pooling). |
| **Multi-Instance Safety** | **ZERO.** Concurrent writes across separate containers crash or corrupt SQLite. | **FULL.** Native multi-process ACID transactions and row locks. |
| **Serverless Compatibility** | **ZERO.** Serverless runtimes have read-only or ephemeral local storage. | **FULL.** Connects via standard TLS or HTTP connection poolers. |
| **Point-in-Time Recovery** | Manual (copying `.db` file, risk of mid-write backup corruption). | Automatic continuous WAL archiving and snapshot restoration. |
| **Memory Footprint** | Extremely low. | Low client footprint, managed server overhead. |
| **Verdict** | **SUITABLE ONLY FOR LOCAL DEV / SINGLE PINNED CONTAINER.** | **MANDATORY FOR PRODUCTION RESILIENCE.** |

### 5.2 Recommended Production Infrastructure Architecture

For a resilient, production-ready internal company operating system, SamJuniorsOS requires:

```
                             INTERNET
                                │
                                ▼
                       HTTPS REVERSE PROXY / CDN
                   (TLS Termination · Edge Routing)
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
              ▼ (Port 3000)                       ▼ (Port 3001)
     NEXT.JS APPLICATION                  SOPHIA LIVE GATEWAY
    (Standalone Node.js)                  (WebSocket Companion)
              │                                   │
              └─────────────────┬─────────────────┘
                                │
                                ▼
                      MANAGED POSTGRESQL 16+
          (Prisma ORM · Transactional Pooling · SSL Enforced)
                                │
                   ┌────────────┴────────────┐
                   ▼                         ▼
            RELATIONAL TABLES          IMMUTABLE LEDGERS
         (Decisions, Workflows,      (SideEffectAudit,
          Epistemic Facts, Memory)   AgentRuns, Sources)
```

1. **Compute Runtime:**
   - Containerized Node.js service running Next.js Standalone (`.next/standalone/server.js`) on Port 3000.
   - Dedicated Live Companion WebSocket gateway running on Port 3001.
   - **Deployment Model:** Container Service (e.g. AWS ECS, Google Cloud Run, Fly.io, or dedicated VPS).
   - If autoscaling is enabled, all instances connect to the centralized PostgreSQL instance; instance count is no longer pinned to 1.
2. **Database Engine:**
   - **PostgreSQL 16+** (Managed service such as Supabase, Neon, AWS RDS, or Cloud SQL).
   - Prisma ORM configured with `provider = "postgresql"` and connection pooling enabled.
   - SSL/TLS mandatory (`sslmode=require`).
3. **Storage Engine:**
   - Local `.data/` directory is **entirely eliminated in production**.
   - Ephemeral file storage used strictly for temporary audio transcoding and chunk processing, cleaned up immediately after request completion.
4. **Backup & Recovery Strategy:**
   - Automated daily snapshots + continuous Write-Ahead Log (WAL) archiving for 7-day point-in-time recovery.
   - Pre-deployment schema migration checks using formal `prisma migrate deploy`.

---

## 6. Migration Blueprint: Safe Cutover Without Data Loss

To transition from the current SQLite/`.data` hybrid to the production PostgreSQL architecture without losing or corrupting records, engineering must follow a strict 5-stage migration sequence.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ STAGE 1: AUDIT & │ ──► │ STAGE 2: SCHEMA  │ ──► │ STAGE 3: DATA    │
│ CHECKSUM FREEZE  │     │ PREPARATION      │     │ EXTRACTION       │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                           │
┌──────────────────┐     ┌──────────────────┐              │
│ STAGE 5: CUTOVER │ ◄── │ STAGE 4: SHADOW  │ ◄────────────┘
│ & VERIFICATION   │     │ INGESTION        │
└──────────────────┘     └──────────────────┘
```

### Stage 1: Local State Freeze & Checksumming
1. Halt local mutation workers (dev server, scheduler heartbeat).
2. Take a cryptographic SHA-256 fingerprint of every file in `.data/*.json` and `db/*.db`.
3. Generate a manifest recording record counts per collection (e.g., 3 decisions, 8 knowledge items, 47 agent runs).

### Stage 2: Prisma Schema Preparation
1. Create new Prisma schema models for the file-only domains:
   - `model CompanyDecision` (mirroring `DecisionRecord` in `src/types/decision.ts`).
   - `model CouncilDeliberation` (mirroring `CouncilDeliberationRecord` in `src/types/council.ts`).
   - Update `schema.prisma` datasource provider to `postgresql`.
2. Generate initial PostgreSQL baseline migration (`prisma migrate dev --name init_postgresql`).

### Stage 3: Deterministic Data Extraction Script
1. Develop an offline migration script (`scripts/migrate-data-to-postgres.ts`).
2. Script reads `.data/*.json` and existing SQLite tables:
   - Preserves all canonical IDs (`dec-1`, `run-xxx`, `fact-xxx`).
   - Preserves all optimistic concurrency version numbers (`stateVersion`).
   - Preserves cryptographic payload hashes and approval signatures.
   - Preserves exact ISO timestamps for created, updated, and superseded events.

### Stage 4: Ingestion & Reconciliation Pass
1. Run the extraction script against target PostgreSQL in a dry-run transaction.
2. Validate foreign key constraints:
   - Epistemic Claims correctly link to Agent Runs and Evidence Sources.
   - Canonical Facts correctly link to Epistemic Claims.
   - Approval Records correctly link to Workflow Instances.
3. Compare record counts and content hashes between source `.data` files and PostgreSQL rows. Reconcile any discrepancies.

### Stage 5: Code Cutover & Store Deprecation
1. Update store classes:
   - Wire `DecisionStore` to `db.companyDecision`.
   - Wire `ConversationStore` read path to `db.conversation` and `db.chatMessage`.
   - Wire `PersonalMemoryStore` read path to `db.sophiaMemory`.
   - Wire `ExecutiveCouncilEngine` persistence to `db.councilDeliberation`.
2. Switch `getDatabaseMode()` in `src/lib/server/db/authority.ts` to require PostgreSQL.
3. Remove local file fallback in production.
4. Execute integration test suites (`tests/orchestration/council_deliberation.test.ts`, `tests/sophia/*.test.ts`) against the PostgreSQL instance to confirm 100% test pass.

---

## 7. Risks & Rejected Alternatives

| Alternative Considered | Why It Was Evaluated | Why It Was Rejected |
|---|---|---|
| **1. Create a unified `CompanyBrainStore` class with a single `company_brain` mega-table.** | Appears to unify all memory into one clean interface. | **REJECTED.** Violates `AGENTS.md §3` (anti-duplication). Bundling decisions, facts, audit trails, and financial models into one table destroys domain-specific validation, breaks type safety, and complicates transaction locking. |
| **2. Keep SQLite in production on a mounted cloud volume.** | Easiest path; avoids introducing an external PostgreSQL dependency. | **REJECTED.** SQLite file locking over network mounts (NFS/EFS/GCS) causes database corruption under concurrent access. Severely restricts horizontal scaling and prevents serverless or ephemeral container deployment. |
| **3. Merge Sophia Personal Mind into Company Brain.** | Eliminates the dual-memory concept and allows Sophia to query one database. | **REJECTED.** Violates `AGENTS.md §6` and `ARCHITECTURE.md §2`. The founder's personal dialogue and interaction style must not automatically become binding company truth or governance precedent without explicit review. |
| **4. Implement Role Brains during Phase 2.3B.** | Would allow specialized memory caches for PM, Researcher, and Finance agents. | **REJECTED.** Explicitly out of scope per Phase 2.3 roadmap. Role Brains must be downstream consumers of an already-stable, verified Company Brain authority layer. Implementing them now would introduce unverified architectural churn. |
| **5. Use vector embeddings (pgvector) as the primary source of truth.** | Popular in AI agent frameworks for semantic recall. | **REJECTED.** Probabilistic vector search can return contradictory or superseded facts. Epistemic truth in SamJuniorsOS must be deterministic, governed by explicit validity states (`active`, `superseded`) and exact cryptographic verification. Vector indexing is a derived search optimization, never an authority. |

---

## 8. Remaining Architectural Questions for Founder Review

The following decisions require explicit founder review before proceeding to implementation:

1. **Target Cloud Platform Selection:**  
   Does the founder intend to deploy SamJuniorsOS to:
   - **Option A:** Managed container environment (e.g. AWS ECS / GCP Cloud Run / Fly.io) with managed PostgreSQL?
   - **Option B:** Self-hosted Linux VPS (e.g. Hetzner / DigitalOcean) running Docker Compose (Next.js + PostgreSQL container)?
   - **Option C:** Vercel frontend with serverless PostgreSQL (e.g. Supabase / Neon)? *(Note: WebSocket gateway on port 3001 would require an external container host or WebRTC migration).*
2. **PostgreSQL Database Provisioning:**  
   Should engineering prepare the PostgreSQL migration scripts to run against a founder-provided `DATABASE_URL`, or should local development continue using SQLite until cloud provisioning is complete?

---

## 9. Final Decision Statement

### Can we prove where SamJuniorsOS is deployed and whether its current persistence is durable enough for production use?

**No.**

**Summary of Evidence:**
1. **Deployment:** The repository working tree contains zero infrastructure manifests, zero deployment workflows, and no active cloud provider configurations.
2. **Durability:** Critical corporate state domains ([`DecisionStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/decision/store.ts), [`ConversationStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/conversation/store.ts), [`PersonalMemoryStore`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/sophia/personal-memory-store.ts), and [`ExecutiveCouncilEngine`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/src/lib/server/orchestration/council.ts)) depend exclusively on local JSON collections in `.data/`. Across container replacements, redeployments, or multi-instance scaling, this data is subject to divergence and complete loss.
3. **Execution Safety:** The production architecture specified in this document establishes the exact database schemas, domain authority mappings, and zero-data-loss migration blueprint required to achieve true production durability.

**No runtime code, database schemas, environment variables, or production infrastructure were modified during this design task.**
