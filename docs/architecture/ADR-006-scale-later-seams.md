# ADR 0006: Scale-Later Seams (Owner-Scoped Keys, Provider-Neutral Interfaces, Single-Founder Focus)

## STATUS
ACCEPTED — 2026-10-21 (Gate G2.7 Platform Seam Design; Founder Decision 2026-10-20 Reaffirmed)

## DECISION

1. **Scale later, build now for one:** SamJuniorsOS is strictly engineered and optimized for a single operating founder today. No multi-founder features (such as user invite flows, tenant management UI, multi-tenant billing, or complex RBAC matrixes) shall be constructed in v1.
2. **Owner-Scoped Keys for Personal Context:** All data representing private founder context (Sophia Personal Mind, interactive conversations, chat history, private drafts) must carry explicit owner scoping (`founderId` / `userId`). Global singleton access patterns for personal data are prohibited.
3. **Partition Between Personal Mind and Company Brain:**
   - **Personal Mind** (founder preferences, private conversations, communication style) is partitioned by `founderId`.
   - **Company Brain** (canonical facts, epistemic claims, knowledge specs, company state) is company-scoped (`organizationId`). Company truth is institutional and shared across the company.
4. **Provider-Neutral Interfaces:** All external media, voice, speech-to-text, text-to-speech, and LLM inference providers must remain decoupled behind provider-neutral interfaces (`LiveGatewayAdapter`, `STTProvider`, `TTSProvider`, `ServerAgentExecutor`). No subsystem shall assume a permanent vendor lock-in.
5. **No Assumption of Exactly One Human in Interface Contracts:** Core service methods, authorization gates (`SideEffectAuthorizationGate`), and API routes must accept principal contexts (`userId`, `role`, `userContext`) rather than hardcoding static identity singletons.

---

## WHY

- **Prevent Premature Generalization:** Building multi-tenancy and team collaboration before a single founder can reliably operate their company creates immense technical debt, slows iteration velocity, and dilutes product focus.
- **Avoid Costly Future Migrations:** Hardcoding `"the only user"` into database keys, table schemas, and route parameters creates painful, breaking data migrations later. By including `founderId` or `userId` in keys and schemas today, scaling to multiple operators requires zero destructive schema rewrites.
- **Intellectual Honesty & Operational Integrity:** Personal founder context (habits, subjective directives) must never accidentally pollute institutional company truth (verified financial metrics, PRDs, architectural invariants).

---

## AUDIT CHECKLIST: EXISTING STORES & TABLES

Comprehensive audit of all 23 Prisma models and 16 server-side stores against owner-scoping and multi-operator readiness.

### 1. Prisma Models (`prisma/schema.prisma`)

| # | Model | Classification | Scoping Status | Field / Index Evidence |
|---|---|---|---|---|
| 1 | `User` | Identity Root | **Owner-Scoped** | `id`, `clerkId`, `email`, `role`. Direct user identity representation. |
| 2 | `CompanyState` | Company Brain | **Company-Scoped** | `organizationId String @unique @default("default")`. Shared institutional state. |
| 3 | `CompanyKnowledge` | Company Brain | **Company-Scoped** | `category`, `hash`. Shared PRDs, architecture, and SOP specs. |
| 4 | `CompanyMemory` | Company Brain | **Company-Scoped** | `type`, `summary`, `tags`. Shared episodic company memory. |
| 5 | `WorkflowDefinition` | Orchestration | **Company-Scoped** | `name`, `version`. Shared workflow orchestration templates. |
| 6 | `WorkflowInstance` | Orchestration | **Owner-Scoped (Linked)** | `userId` (relation to `User`), `scheduledById`. Scoped to initiating principal. |
| 7 | `ScheduledWorkItem` | Scheduler | **Execution-Scoped** | Linked to `WorkflowInstance`. Evaluated by automated scheduler. |
| 8 | `SchedulerHeartbeat` | Scheduler | **Execution-Scoped** | Machine execution heartbeat. |
| 9 | `ApprovalRecord` | Governance Gate | **Owner-Scoped (Linked)** | `userId` (foreign key to `User`), `decidedBy` string audit trail. |
| 10 | `SideEffectAudit` | Audit Ledger | **Company-Scoped** | Immutable append-only audit trail tied to workflow executions. |
| 11 | `TelemetryMetric` | Telemetry | **Company-Scoped (Dormant)** | Dead model per ADR 0005. 0 active usages. |
| 12 | `AgentRun` | Execution Engine | **Execution-Scoped** | `workflowInstanceId`, `stepId`, `agentRole`. Linked to workflow run. |
| 13 | `EpistemicSource` | Epistemic Pipeline | **Company-Scoped** | Evidence provenance for institutional knowledge. |
| 14 | `EpistemicSignal` | Epistemic Pipeline | **Company-Scoped** | Signal extractions supporting claims. |
| 15 | `EpistemicClaim` | Epistemic Pipeline | **Company-Scoped** | Claims evaluated for promotion to canonical facts. |
| 16 | `EpistemicVerification`| Epistemic Pipeline | **Company-Scoped** | `verifiedBy` string audit trail. |
| 17 | `CanonicalFact` | Epistemic Pipeline | **Company-Scoped** | Authoritative company truth. |
| 18 | `DependencyRelation` | Epistemic Pipeline | **Company-Scoped** | Dependency DAG across facts and claims. |
| 19 | `IdempotencyRecord` | Infrastructure | **Execution-Scoped** | Deterministic SHA-256 deduplication keys. |
| 20 | `DistributedLease` | Infrastructure | **Execution-Scoped** | Concurrency control leases. |
| 21 | `Conversation` | Personal Mind | **Owner-Scoped** | `founderId String @default("founder")`, `@@index([founderId, updatedAt])`. |
| 22 | `ChatMessage` | Personal Mind | **Owner-Scoped** | Scoped via `conversationId` parent relation to `Conversation`. |
| 23 | `SophiaMemory` | Personal Mind | **Owner-Scoped** | `founderId String @default("founder")`, `@@index([founderId, updatedAt])`. |

### 2. Server Stores (`src/lib/server/`)

| # | Store | File Path | Scoping Status | Notes / Gaps |
|---|---|---|---|---|
| 1 | `SophiaMemoryStore` | `src/lib/server/sophia/personal-memory-store.ts` | **Owner-Scoped** | Strict `founderId` requirement on all CRUD operations. |
| 2 | `ConversationStore` | `src/lib/server/conversation/store.ts` | **Owner-Scoped** | Strict `founderId` requirement on all session queries and deletions. |
| 3 | `ApprovalStore` | `src/lib/server/authorization/approval-store.ts` | **Owner-Scoped (Partial)** | Persists `userId`; list queries operate globally across workflows. (Gap G2.7-1) |
| 4 | `WorkflowStore` | `src/lib/server/workflow/store.ts` | **Company-Scoped (Global)** | In-memory / flat JSON map keyed by `instanceId`. (Gap G2.7-2) |
| 5 | `SchedulerStore` | `src/lib/server/workflow/scheduler-store.ts` | **Execution-Scoped** | Evaluates scheduled work globally across the company. |
| 6 | `AgentRunStore` | `src/lib/server/agents/run-store.ts` | **Execution-Scoped** | Ledger of agent task executions. |
| 7 | `DecisionStore` | `src/lib/server/decision/store.ts` | **Company-Scoped** | Company decision log. |
| 8 | `ClaimStore` | `src/lib/server/epistemic/claim-store.ts` | **Company-Scoped** | Governed Company Brain knowledge. |
| 9 | `IdempotencyStore` | `src/lib/server/idempotency/store.ts` | **Execution-Scoped** | Operation deduplication. |
| 10 | `KnowledgeStore` | `src/lib/server/knowledge/knowledge-store.ts` | **Company-Scoped** | Canonical company specifications. |
| 11 | `MemoryStore` | `src/lib/server/memory/memory-store.ts` | **Company-Scoped** | Episodic company precedents. |
| 12 | `DurableFileStore` | `src/lib/server/persistence/durable-file-store.ts` | **Infrastructure** | Atomic disk storage backing stores. |
| 13 | `DependencyRelationStore` | `src/lib/server/retrieval/dependency-relation-store.ts` | **Company-Scoped** | Graph relations between company facts. |
| 14 | `StateStore` | `src/lib/server/state/state-store.ts` | **Company-Scoped** | Scoped by `organizationId: "default"`. |
| 15 | `CommunicationStore` | `src/lib/server/communication/store.ts` | **Unscoped Gap** | Contacts, drafts, messages lack owner scoping in flat JSON. (Gap G2.7-3) |
| 16 | `TicketStore` | `src/lib/server/live/ticket-store.ts` | **Owner-Scoped** | Ephemeral tickets store `userId`, `role`, and `isVerified`. |

---

## ALTERNATIVES CONSIDERED

1. **Build Multi-Tenant / Multi-Founder Infrastructure Now:**
   - *Rejected:* Violates founder decision (2026-10-20) and `AGENTS.md`. Adding multi-user role management, invitations, tenant switches, and row-level security before the core loop is validated wastes engineering capital on unused features.
2. **Ignore Owner Scoping Entirely (Pure Single-User Monolith):**
   - *Rejected:* Omitting `founderId` from `SophiaMemory` or `Conversation` would require destructive table drops, complex data migrations, and contract refactoring whenever a second human is introduced.
3. **Owner-Scoping Everything Including Company Truth:**
   - *Rejected:* Company Brain facts (e.g. runway, verified pricing, PRD specifications) are institutional assets of SamJuniors, not the personal property of a single user. Conflating Personal Mind with Company Brain creates siloed, contradictory brains.

---

## BOUNDARIES

- **What Is Permitted:**
  - Defining `founderId` or `userId` columns in data models.
  - Passing `userContext` / principal credentials in function signatures.
  - Isolating Personal Mind memories and conversations by caller identity.
- **What Is Strictly Prohibited:**
  - Building multi-tenant UI (workspace switchers, invite forms, team member settings).
  - Building team chat or human-to-human collaboration tools.
  - Adding multi-tenant billing or subscription tiers.
  - Creating parallel databases or second company brains.

---

## RISKS

- **Risk:** Developers may inadvertently build multi-user UI or complex permission matrices under the guise of "preparation."
  - *Mitigation:* Strict guardrail enforced by this ADR and `AGENTS.md`: any PR adding multi-founder features must be rejected.
- **Risk:** In-memory flat stores (`.data/*.json`) do not support multi-tenant query isolation.
  - *Mitigation:* Documented as explicit architectural gaps (Findings `G2.7-1`, `G2.7-2`, `G2.7-3`) to be resolved during PostgreSQL migration (Phase 2.3C / G10), not by prematurely adding complex file partitioning.

---

## MIGRATION / REVERSIBILITY

- This ADR enforces design seams only; it introduces zero database migrations and zero runtime overhead.
- When the founder explicitly decides to scale to multiple operators (Gate G10 / Phase 2.3C), the existing `founderId` columns on Personal Mind models and `userId` relations on Workflow models directly accommodate multi-user session tokens (e.g., Clerk or Auth0) without modifying data structures.

---

## NEXT ACTION

1. Reaffirm founder approval for ADR 0006.
2. File findings `.agent/product-kit/findings/G2.7-owner-scoping-gaps.md` for recorded gaps.
3. Maintain single-founder focus during execution of Gate G4 (Company Brain) and Gate G5 (Core Loop).
