# M1 — Memory Source-of-Truth and Persistence Audit

**Status:** COMPLETE (Audit & Evidence Phase) — Complete Source-of-Truth Matrix, Context Assembly Tracing, Retention/Deletion Dependency Mapping, Persistence Failure Analysis, Deployment Audit, and Test Coverage Assessment documented. No runtime code changes.  
**Date:** 2026-10-12  
**Repository baseline:** `main` at `87bec51b17229ced9eec4d730b1a6302b4d84f88`  
**Working branch:** `audit/m1-memory-source-of-truth`  
**Latest documented audit commit:** `4257db2a34c6ee57b863c0326760455e8b71416d`  
**Scope:** Authoritative engineering audit of existing memory, conversation, knowledge, epistemic evidence, operational state, and adjacent stores.

---

## 1. Executive Summary

This document represents the completed **M1: Memory Source-of-Truth and Persistence Audit** for SamJuniorsOS. It establishes an evidence-backed, line-by-line understanding of how SamJuniorsOS persists, retrieves, updates, governs, and deletes memory.

### Key Conclusions:
1. **Preserve Existing Architecture:** SamJuniorsOS possesses a well-structured set of specialized memory and state abstractions (`SophiaMemoryStore`, `ConversationStore`, `CompanyMemoryStore`, `CompanyKnowledgeStore`, `EpistemicClaimStore`, `CompanyStateStore`, `AgentRunStore`). There is **no need** for a new memory platform, vector database, or parallel "brain."
2. **Persistence Duality & Multi-Instance Barrier:** The repository currently operates under a file-primary persistence model (`DurableFileStore`) for personal memories and conversations, with opportunistic, best-effort Prisma dual-writes. In local/single-instance mode, this is durable across process restarts. However, in multi-instance cloud deployments (e.g., serverless Vercel or multiple container instances), instances do **not** share disk state, rendering personal memories and episodic conversations isolated to individual instances despite database mirrors.
3. **Confirmed Logic Discrepancies in `CompanyMemoryStore`:** While `getAllMemories()` and `getMemoryById()` query the database in authoritative mode, `queryMemories()` scores the in-process `this.memories` array; `recordMemory()` in authoritative mode mutates the DB without updating `this.memories`; and `setMemories()` updates the in-memory array only without persisting to disk or DB.
4. **Deletion & Retention Fragmentation:** Only `SophiaMemoryStore` provides a complete, founder-scoped deletion and lifecycle state machine. `ConversationStore`, `CompanyMemoryStore`, `EpistemicClaimStore`, and `CompanyStateStore` have **no** focused item deletion APIs. A unified "forget this" policy is required: Personal Mind allows physical deletion, while Epistemic Facts and Audit Records must use cryptographic supersession or redaction/tombstoning rather than cascade deletion.
5. **Deployment & Schema Reality:** The Prisma schema (`prisma/schema.prisma`) explicitly declares an SQLite datasource (`file:./db/custom.db`). Production PostgreSQL connection is **NOT VERIFIED** from repository files. Furthermore, `.env.example` documents `DATABASE_MODE=sqlite`, but `src/lib/server/db/authority.ts` does not accept `sqlite` (only `authoritative`, `test`, `local`), causing `DATABASE_MODE=sqlite` to silently default to `authoritative` in production or `local` in development.

---

## 2. Memory Ownership & Source-of-Truth Matrix

| Memory Class | Canonical Abstraction | Data Owned | Authoritative Store (Local Mode) | Authoritative Store (Authoritative Mode) | Mirror Layer | Cache Layer | Read Fallback Behavior | Multi-Instance Safe? |
|---|---|---|---|---|---|---|---|---|
| **Working Context** | `SophiaContextAssembler` | Bounded dynamic prompt projection | None (Ephemerally assembled per request) | None (Ephemerally assembled per request) | None | None | Fails soft: individual store outages emit `[UNAVAILABLE / DEGRADED]` slices | Yes (stateless projection) |
| **Personal Mind** | `SophiaMemoryStore` | Founder-scoped preferences, interaction patterns, notes | `.data/sophia_memories.json` via `DurableFileStore` | `.data/sophia_memories.json` via `DurableFileStore` (No auth DB mode) | Prisma `SophiaMemory` (best-effort, swallowed errors) | None (reads file directly each time) | **No Prisma read fallback.** Reads file only. | **NO** (File-primary; instances do not share disk) |
| **Episodic Memory** | `ConversationStore` | Multi-turn dialog, chat messages, turn idempotency | `.data/conversations.json`, `.data/chat_messages.json` | Same file-primary behavior (No auth DB mode) | Prisma `Conversation`, `ChatMessage` (best-effort) | None | `getConversation()` falls back to Prisma on file miss and caches back; other reads (messages, list, idempotency) are file-only. | **NO** (File-primary; turn idempotency is local disk only) |
| **Company Historical Precedent** | `CompanyMemoryStore` | Founder-approved historical decisions, lessons, outcomes | `.data/company_memories.json` | Prisma `CompanyMemory` table (Postgres/SQLite) | Prisma `CompanyMemory` in local mode | In-process `this.memories` array | Local: fallback to DB if `DATABASE_URL` present. Auth: `getAllMemories` queries DB fail-closed. | **NO** (`queryMemories` reads in-process cache, not DB) |
| **Company Reference Knowledge** | `CompanyKnowledgeStore` | Versioned SOPs, PRDs, architecture specifications | `.data/company_knowledge.json` | Prisma `CompanyKnowledge` table (fail-closed) | Prisma `CompanyKnowledge` in local mode | In-process `this.knowledgeItems` array | Auth mode: `getAllKnowledge()` and `queryKnowledge()` query DB fail-closed. | **YES** (In authoritative mode, queries DB directly) |
| **Epistemic Evidence & Facts** | `EpistemicClaimStore` | Evidence sources, signals, claims, verifications, canonical facts | 5 `DurableFileStore` collections | Prisma tables via `PostgresEpistemicStore` (fail-closed) | None | Local mode: in-memory maps | Auth mode: delegates directly to DB; fails closed if DB unavailable. | **YES** (In authoritative mode, delegates to DB) |
| **Operational State** | `CompanyStateStore` | Current initiatives, financial metrics, decisions | `.data/company_state.json` | Prisma `CompanyState` table (single row: `organizationId: 'default'`) | Prisma `CompanyState` in local mode | In-memory fields (`financialModel`, `initiatives`, etc.) | Partial: `getFinancialMetrics` falls back to seeded sample model if row absent; `queryState()` reads cache only. | **NO** (`queryState()` and products/customers read memory cache) |
| **Audit & Run History** | `AgentRunStore` | Multi-agent council execution runs, task deliverables | `.data/agent_runs.json` | Prisma `AgentRun` table (fail-closed) | None | In-memory `this.runs` Map in local mode | Auth mode: queries Prisma `agentRun` table fail-closed. | **YES** (In authoritative mode) |
| **Derived Relations** | `DependencyRelationStore` | `DEPENDS_ON` service/system dependency index | `.data/dependency_relations.json` | Prisma `DependencyRelation` table (fail-closed) | None | Rebuildable index derived from active canonical facts | Fail-safe: if index fails, dependency slice is omitted without failing the turn. | **YES** (Rebuildable projection from facts) |

---

## 3. Context Assembly & Retrieval Flow (Task A)

### Complete Pipeline Trace
```
FOUNDER REQUEST (Ingress: /api/agent-chat or Live WebSocket port 3001)
     ↓
1. INGRESS & AUTHENTICATION
   - Server-established session: getAuthenticatedFounder(req) extracts founderId.
   - Client headers or forged IDs are rejected in production.
     ↓
2. CONVERSATION ESTABLISHMENT & MESSAGE PERSISTENCE
   - ConversationStore.getOrCreateConversation({ founderId, conversationId, agentId: 'sophia' })
   - ConversationStore.saveMessage({ conversationId, sender: 'founder', content, idempotencyKey })
   - ConversationStore.getRecentHistory(conversation.id, founderId, 10) retrieves bounded history.
     ↓
3. CONTEXT ASSEMBLY (SophiaContextAssembler.assemble)
   - Computes deterministic temporal intent (WINDOW > CURRENT > HISTORY > UNSPECIFIED).
   - Slice 1 [AUTHORITATIVE_OPERATIONAL_STATE]: CompanyStateStore (MRR, burn, initiatives, query-matched decisions).
   - Slice 2 [ACTIVE_WORKFLOW_STATE]: AgentRunStore (in-flight runs, recently completed).
   - Slice 3 [PENDING_GOVERNANCE_STATE]: InMemoryApprovalStore (pending founder approvals).
   - Slice 3B [CHANGE_RECORD]: If WINDOW intent, enumerates changes across facts, precedents, knowledge, decisions.
   - Slice 4A [CANONICAL_FACT]: EpistemicClaimStore.queryFacts (query-matched) + listActiveFacts (newest fill).
   - Slice 4A2 [SUPERSEDED_FACT]: If HISTORY intent, EpistemicClaimStore.queryFacts (superseded facts only).
   - Slice 4A3 [CANONICAL_FACT (DEPENDENCY)]: If dependency intent, DependencyRelationStore reverse traversal.
   - Slice 4B [UNVERIFIED_CLAIM]: EpistemicClaimStore pending/under_review hypotheses (with epistemic warning).
   - Slice 5A [COMPANY_KNOWLEDGE]: CompanyKnowledgeStore.queryKnowledge (SOPs, PRDs; currentness ranked).
   - Slice 5B [HISTORICAL_PRECEDENT]: CompanyMemoryStore.queryMemories (historical lessons; non-overriding).
   - Slice 6 [RECENT_ACTIVITY]: buildActivityProjection (recent audit events).
   - Slice 6B [PERSONAL_MIND_MEMORY]: SophiaMemoryStore.listAllMemories (founder-scoped, XML-escaped in <personal_memory_context>).
   - Slice 7A [EPISODIC_MEMORY]: ConversationStore.searchConversations (founder-scoped past dialogues).
   - Slice 7 [CONVERSATIONAL_RECORD]: Bounded recent conversation turns.
     ↓
4. INTENT CLASSIFICATION (SophiaIntentClassifier.classify)
   - Deterministic pre-classification: prompt-injection regex and ambiguous scope patterns answered before model call.
   - Structural trust boundary: Founder message wrapped in <founder_utterance>, context slices labeled with authority.
   - Model generates CandidateIntentProposal (validated by isValidProposalShape gate).
   - sanitizeProposal strips all credentials, tokens, and authorization fields.
     ↓
5. SERVER TRUST BOUNDARY GATEWAY (SophiaServerGateway.process)
   - Attaches server-verified verifiedFounderId.
   - Non-founder cannot trigger autonomous directive execution.
   - Directive proposals dispatch to MultiAgentOrchestrator.orchestrateDirective.
   - Approval proposals resolve via SophiaEntityResolver (strictly zero-guessing, model ID must be founder-cited).
   - Steering proposals halt/resume active workflows via AgentRunStore.
     ↓
6. ASSISTANT MESSAGE PERSISTENCE
   - ConversationStore.saveMessage({ conversationId, sender: 'assistant', content: reply, idempotencyKey: `${turnId}:assistant` }).
     ↓
7. ASYNCHRONOUS MEMORY CAPTURE (scheduleSophiaMemoryCapture)
   - Fire-and-forget: does NOT block the turn.
   - Extracts candidate personal preferences via LLM.
   - MemoryGate evaluates candidate: task-scoped instructions or privilege semantics REJECTED.
   - Accepted candidates persisted as PENDING_REVIEW (active: false) in SophiaMemoryStore.
   - Founder must explicitly confirm via PATCH /api/sofia/memory to activate.
```

### Context Isolation & Epistemic Invariants:
- **Historical Precedent Cannot Override Facts:** Slices carry strict authority labels. `HISTORICAL_PRECEDENT` includes the explicit warning: *"Historical precedents reflect past outcomes and do NOT override current operational policy or facts."*
- **Model Summaries Cannot Become Canonical Facts:** Summaries reside only in chat messages or agent run records. Promotion to `CanonicalFact` in `EpistemicClaimStore` requires the governed verification pipeline (`ConstitutionalVerifier` / `epistemic-pipeline`).
- **Prompt Injection Defense:** Personal memories are untrusted data and render inside `<personal_memory_context>` with XML-escaped entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`). A memory cannot break out of its container. Utterances are encapsulated in `<founder_utterance>`.
- **Store Outage Resilience:** Every store access in `SophiaContextAssembler` is wrapped in try/catch. A store failure degrades fail-soft, recording the store in `degradedStores` and emitting an `[UNAVAILABLE / DEGRADED]` slice without crashing the turn.

---

## 4. Retention & Deletion Dependency Map (Task B)

| Data Class | Primary Record | Mirror Layer | Cache Layer | Derived Data / Indexes | Deletion / Archive API Currently Implemented | "Forget This" Semantic Definition | Trade-offs & Policy Decision |
|---|---|---|---|---|---|---|---|
| **Personal Mind** | `.data/sophia_memories.json` | Prisma `SophiaMemory` | None | `SophiaContextAssembler` slice 6B | `deleteMemory(founderId, memoryId)` (physical delete); `updateMemory` (`ARCHIVED`, `SUPERSEDED`, `REJECTED`) | **Physical Delete & Tombstone** supported. Immediately disappears from context retrieval. | **Safe to physically delete.** Historical dialogue turns quoting the preference remain in conversation history unless conversation is also redacted. |
| **Conversations** | `.data/conversations.json` | Prisma `Conversation` | None | `listConversations`, `searchConversations` | **NONE** (No delete method) | Undefined in code. | **Founder Directive:** Must provide `deleteConversation(id)` and `archiveConversation(id)`. Deletion must cascade to associated `chat_messages`. |
| **Chat Messages** | `.data/chat_messages.json` | Prisma `ChatMessage` | None | Dialogue context, episodic search hits | **NONE** (No delete method) | Undefined in code. | **Founder Directive:** Provide `deleteMessage(id)` and redact sensitive content while preserving turn sequence counters for conversation coherence. |
| **Company Precedents** | `.data/company_memories.json` (Local) / Prisma `CompanyMemory` (Auth) | Prisma `CompanyMemory` (Local) | In-memory array `this.memories` | `OperationalLearningLoop` scores, change record | **NONE** (No delete method) | Undefined in code. | **Trade-off:** Precedents reflect actual past events. Recommended policy: **Tombstone / Deactivate** rather than physical deletion to preserve audit lineage. |
| **Company Knowledge** | `.data/company_knowledge.json` (Local) / Prisma `CompanyKnowledge` (Auth) | Prisma `CompanyKnowledge` (Local) | In-memory array `this.knowledgeItems` | Token index, hash change detection, retired doc labels | `setKnowledge(items)` replaces entire collection; no single-item delete | **Version Retirement / Text Tagging** (`[RETIRED]`, `[HISTORICAL]`). | **Document Supersession:** New document versions supersede old ones. Old documents are demoted by currentness ranking but retained for historical reference. |
| **Epistemic Claims & Evidence** | 5 `DurableFileStore` collections (Local) / Prisma tables (Auth) | None | In-memory maps (Local) | `DependencyRelationStore` edges, `FactLineage` graph, `AS_OF` reads | **NONE** (No delete method); `markFactSuperseded` toggles validity state | **Supersession & Lineage Retention**. Facts are marked `superseded`, never deleted. | **CRITICAL POLICY DECISION:** Never cascade-delete epistemic facts! Physical deletion breaks `FactLineage`, `AS_OF` temporal queries, and `DEPENDS_ON` relations. If legally required to forget, apply cryptographic redaction (tombstoning the statement while preserving fact ID and successor pointer). |
| **Company Operational State** | `.data/company_state.json` (Local) / Prisma `CompanyState` (Auth) | Prisma `CompanyState` (Local) | In-memory state fields | Telemetry slice 1, change enumeration | `setInitiatives(items)` replaces array; no decision delete | **Replacement / Update** only. | **State Mutation:** Operational state represents current reality. State items should transition to `cancelled` or `completed` rather than vanish without trace. |
| **Agent Runs & Governance Audit** | `.data/agent_runs.json` (Local) / Prisma `AgentRun` (Auth) | None | In-memory map (Local) | Active workstream slice, activity projection | **NONE** (Immutable ledger) | Immutable audit log. | **Immutability Invariant:** Governed audit records (`AgentRun`, `SideEffectAudit`) must **never** be deleted by ordinary memory forget operations. |

---

## 5. Persistence & Failure Behavior (Task C)

### Four Persistence Tiers — Critical Distinction:
1. **In-Memory Mutation (`this.memories.unshift(...)`, `this.runs.set(...)`)**:
   - Scope: Single process only.
   - Durability: None. Lost on crash, restart, or deployment recycle.
   - Danger: Callers observing an in-memory change cannot assume durable persistence.
2. **Local File Write (`DurableFileStore`)**:
   - Scope: Single container/host filesystem (`.data/*.json`).
   - Durability: Survives Node.js restarts and crashes on the same machine.
   - Atomicity: Atomic file replacement via `.tmp` file write and synchronous `fs.renameSync`.
   - Concurrency: Serialized via `<collection>.json.lock` using `O_EXCL` file creation (`wx`).
   - Failure Modes:
     - After 30 seconds (`LOCK_TIMEOUT_MS`), `DurableFileStore` logs an error and **proceeds without the lock**, degrading concurrency guarantees under sustained contention.
     - `readCollection()` catches parse/read errors and returns `{}` (empty object), which can mask corrupted files as "empty collections."
     - In non-strict writes (`saveItem`), filesystem errors are logged and swallowed, returning success to the caller despite failed disk write.
3. **Database Transaction / Write (`PrismaClient`)**:
   - Scope: Shared relational database (SQLite local; PostgreSQL target).
   - Durability: ACID compliant; shared across all application instances.
   - Authoritative Mode Semantics: `requireAuthoritativeDatabase()` fails closed (`DatabaseAuthorityError`) if the database is unreachable.
4. **Mirror Write (Opportunistic Dual-Write)**:
   - Scope: Secondary shadow write.
   - Semantics: Best-effort, try/catch with swallowed errors.
   - Danger: A successful mirror write **does not** mean the data will be read by subsequent requests, because `SophiaMemoryStore` and `ConversationStore` read exclusively from local files. A failed mirror write does not roll back the primary file write.

### Multi-Instance Production Hazard:
- In multi-instance deployments (e.g., autoscaled containers, Vercel serverless functions), each instance has an independent local disk.
- Because `SophiaMemoryStore` and `ConversationStore` are file-primary, an update written by Instance A is stored in Instance A's local `.data/` directory.
- When a subsequent request hits Instance B, Instance B reads its own local `.data/` directory and **cannot see** the memory or message, even though Instance A successfully mirrored the record to the shared Prisma database.
- **Verdict:** The current file-primary architecture is **unsafe for multi-instance production deployment**. Shared database authority (the planned M6 migration) is mandatory for horizontal scaling.

---

## 6. Database & Deployment Configuration (Task D)

### Verified Codebase Evidence:
1. **Prisma Datasource:** `prisma/schema.prisma` explicitly declares `provider = "sqlite"` and `url = env("DATABASE_URL")`.
2. **Prisma Health Probe:** `src/lib/server/db/prisma.ts` explicitly probes SQLite connectivity via `await prisma.$queryRaw\`SELECT 1\``.
3. **Database Authority Parser:** `src/lib/server/db/authority.ts` accepts exactly `'authoritative' | 'test' | 'local'`.
4. **Environment Template Inconsistency:**
   - `.env.example` documents:
     ```bash
     DATABASE_URL=file:./db/custom.db
     # DATABASE_MODE=sqlite
     ```
   - If an operator sets `DATABASE_MODE=sqlite`, `authority.ts` ignores the value because `'sqlite'` is not in `['authoritative', 'test', 'local']`.
   - The parser then falls back to `NODE_ENV`:
     - In `NODE_ENV === 'production'`, it defaults to `'authoritative'`.
     - In `NODE_ENV === 'test'`, it defaults to `'test'`.
     - Otherwise, it defaults to `'local'`.
5. **Class Naming vs. Reality:**
   - Classes named `PostgresEpistemicStore` and `PostgresAgentRunStore` execute queries through the shared Prisma client, which connects to the SQLite database defined in `prisma/schema.prisma`.
   - The term "Postgres" in class names represents the architectural target, not runtime reality.
6. **Production Configuration Status:**
   - **NOT VERIFIED:** Production PostgreSQL connection string, cloud host, or remote database credentials. No production secrets or external database endpoints exist in the repository (complying with security rules).
   - What is proven is that the active local working tree is configured for SQLite.

---

## 7. Test Suite Status & Coverage Assessment (Task E)

### Executed Test Results (Verified via `npx tsx`):
- `tests/sophia/m52_retrieval_hygiene.test.ts` — **25 passed, 0 failed** (VERIFIED)
  - Verified temporal intent routing, query-conditioned fact/knowledge retrieval, episodic search scoping, and context assembly determinism.
- `tests/sophia/m1_canonical_state_authority.test.ts` — **7 passed, 0 failed** (VERIFIED)
  - Verified `CompanyStateStore` baseline metrics, context slice 1 wiring, and fail-soft degradation.
- `tests/sophia/m4b1_lifecycle.test.ts` — **19 passed, 0 failed, 1 skipped** (VERIFIED)
  - Verified 5 lifecycle states (`PENDING_REVIEW`, `ACTIVE`, `SUPERSEDED`, `ARCHIVED`, `REJECTED`), transition matrix, founder ownership, and audit logging.
- `tests/sophia/m53_asof_read.test.ts` — **18 passed, 0 failed** (VERIFIED)
  - Verified `readFacts` (`CURRENT`, `HISTORICAL`, `AS_OF`), boundary timestamps, and lineage tracking.
- `tests/sophia/m53_dependency_relations.test.ts` — **25 passed, 0 failed** (VERIFIED)
  - Verified deterministic `DEPENDS_ON` extraction, bounded reverse traversal, and relation indexing.
- `tests/sophia/m0_idempotency_expiry.test.ts` — **7 passed, 0 failed** (VERIFIED)
  - Verified TTL expiration, in-progress claim protection, and payload-hash binding.
- `tests/sophia/m3_authority_hardening.test.ts` — **7 passed, 0 failed, 3 skipped** (VERIFIED)
  - Verified conversation security checks, unknown conversation handling, and retry idempotency.

**Total Verified Passing Assertions:** **108 tests passing** across 7 active suites.

### Runtime Environment Defect in Child-Spawning Suites:
- Several restart-testing suites (`m2_knowledge_persistence.test.ts`, `m53_authoritative_read_model.test.ts`, `phase4_4b_lifecycle.test.ts`) fail on Windows with `Bun is not defined` or `spawnSync bunx ENOENT`.
- These tests hardcode `Bun.spawn(['bun', ...])` or `execSync('bunx prisma ...')`. In environments where `bun` is not installed on the system PATH, these tests cannot execute.
- **Recommendation:** Refactor child process invocation helpers in tests to use standard Node.js `child_process.spawnSync` with `npx tsx` fallback when `Bun` is not detected.

### Missing Test Coverage Identified:
1. **Persistence Failure Injection:** No tests verify behavior when `DurableFileStore.saveItem` throws during `CompanyMemoryStore.recordMemory()` or `CompanyStateStore.recordDecision()`.
2. **Authoritative Retrieval Discrepancy:** No tests assert that `CompanyMemoryStore.queryMemories()` returns records inserted directly into the authoritative database.
3. **File Corruption Detection:** No tests assert what happens when `.data/conversations.json` or `.data/sophia_memories.json` contains invalid JSON.
4. **Conversation Deletion & Cascade:** Zero tests exist for deleting conversations or messages (because the methods do not exist).
5. **Multi-Instance Divergence:** No tests verify synchronization between two processes accessing separate local files with a shared database mirror.

---

## 8. Confirmed Defects vs. Architectural Trade-offs

| ID | Category | Nature | Finding | Impact | Recommended Action |
|---|---|---|---|---|---|
| **M1-F01** | Architecture Trade-off | Documented Strategy | Personal Mind and ConversationStore are file-primary; Prisma is a mirror. | Multi-instance inconsistency; instances cannot share history without shared disk. | Preserve for M1 (local single-instance); execute planned M6 authoritative migration when moving to multi-instance cloud. |
| **M1-F02** | Confirmed Defect | Logic Discrepancy | `CompanyMemoryStore.queryMemories()` queries `this.memories` cache instead of DB in authoritative mode; `recordMemory()` in auth mode does not update `this.memories`; `setMemories()` updates cache only. | Stale or missing precedents in authoritative context assembly; cache-DB divergence. | Minimal fix batch: make `queryMemories` route through `getAllMemories()` in authoritative mode; update `this.memories` on `recordMemory()`. |
| **M1-F03** | Confirmed Defect | Error Handling | `CompanyMemoryStore.recordMemory()` swallows file persistence errors after updating in-memory array. | Caller observes success even if disk write failed. | Use strict save semantics (`saveItemStrict`) or propagate persistence errors. |
| **M1-F04** | Architecture Trade-off | Concurrency Limitation | `DurableFileStore` proceeds without lock after 30s timeout. | Updates can be lost under extreme file contention. | Acceptable trade-off for single-instance local runtime; replaced by database row locks in M6. |
| **M1-F05** | Confirmed Defect | Failure Recovery | `DurableFileStore.readCollection()` returns `{}` on parse error. | Corrupt file is treated as empty collection, potentially overwriting damaged data on next write. | Add corrupt file quarantine/backup (`.corrupt.<timestamp>`) and raise error rather than returning empty object. |
| **M1-F06 / M1-F09** | Architecture Gap | API Completeness | Deletion APIs are missing for conversations, messages, precedents, knowledge items, and state entities. | Cannot fulfill founder directive to "forget" or delete historical conversations/decisions. | Implement explicit founder-scoped deletion methods with clear cascade/tombstone policies. |
| **M1-F08** | Confirmed Defect | Incomplete Authoritative Mode | `CompanyStateStore.queryState()` queries cache only; `getFinancialMetrics()` falls back to seeded sample model. | Current operational state can return simulated sample values even in authoritative database mode. | Ensure `getFinancialMetrics()` fails closed in authoritative mode if DB record is missing; route `queryState()` through authoritative getters. |
| **M1-F10** | Confirmed Defect | Error Handling | Local Epistemic and CompanyState writes return successfully after caught file persistence errors. | In-memory maps diverge from disk state upon write errors. | Propagate persistence errors to caller in local mode. |
| **M1-F11** | Confirmed Defect | Configuration Inconsistency | `.env.example` documents `DATABASE_MODE=sqlite`, which `authority.ts` rejects. | Silent fallback to `NODE_ENV` defaults; operator confusion. | Update `.env.example` to document accepted values (`authoritative`, `local`, `test`) or update `authority.ts` to alias `sqlite` to `local`. |

---

## 9. Recommended Minimal Implementation Batches

Implementation must proceed in small, independently verifiable, reversible batches:

### Batch 1: Configuration & Error Propagation Hygiene (Zero Migration Risk)
1. **Reconcile `DATABASE_MODE` parser and template:** Update `src/lib/server/db/authority.ts` to accept `'sqlite'` as an alias for `'local'`, or align `.env.example` to `'local' | 'authoritative' | 'test'`.
2. **Fix `CompanyMemoryStore` authoritative retrieval (M1-F02):**
   - Update `queryMemories()` to retrieve candidates via `await this.getAllMemories()` instead of raw `this.memories`.
   - Update `recordMemory()` in authoritative mode to keep `this.memories` coherent.
   - Update `setMemories()` to persist in both local and authoritative modes.
3. **Fix cross-platform test execution:** Update child process runners in test suites to support `tsx`/`node` alongside `bun`.

### Batch 2: Deletion & Retention Foundation (API Completeness)
1. **Conversation & Message Deletion:**
   - Add `deleteConversation(founderId, conversationId)` to `ConversationStore`: deletes conversation and cascades to all associated messages in both file and Prisma mirror.
   - Add `deleteMessage(founderId, conversationId, messageId)` to `ConversationStore`.
   - Add route endpoints: `DELETE /api/conversation` and `DELETE /api/conversation/message`.
2. **Epistemic Redaction & Tombstoning:**
   - Add `redactFact(factId, reason)` to `EpistemicClaimStore`: cryptographically redacts statement text while preserving fact ID, lineage, and supersession links.

### Batch 3: File Store Corruption Safeguards
1. **Quarantine on Corruption in `DurableFileStore`:**
   - When JSON parsing fails in `readCollection()`, copy the corrupted file to `<collection>.json.corrupt.<timestamp>` before returning an error, preventing silent overwrite of corrupted data.

### Batch 4: Authoritative Database Migration (M6 Milestone — Deferred)
- Migrate Personal Mind and Conversations to database-primary with transactional fail-closed guarantees. This requires a founder decision on the production database target (PostgreSQL vs. SQLite).

---

## 10. Risks, Rollback Strategy & Acceptance Criteria

### Risks:
- **Migration Risk:** Shifting Personal Mind or ConversationStore to database-primary prematurely risks breaking local offline development and existing test fixtures that rely on `.data/` files.
- **Cascade Deletion Risk:** Cascade deleting epistemic facts breaks `FactLineage` and `DependencyRelationStore`.
- **Lock Contention:** Introducing strict locking without timeouts can deadlock asynchronous event loops.

### Rollback Strategy:
- Every batch must be strictly backwards-compatible with existing `.data/` JSON file formats.
- Retain atomic file-writing abstractions so reverting a commit immediately restores prior behavior.
- Use explicit Git commit checkpoints for each batch.

### Acceptance Criteria for M1 Sign-off:
- [x] Every memory and memory-adjacent store has a documented per-method source-of-truth matrix.
- [x] Every read, write, cache, mirror, and fallback path is traced from actual call sites.
- [x] Founder/company isolation and authority transitions are mapped.
- [x] Retention, deletion, supersession, and derived-data propagation are explicit.
- [x] Failure semantics are evaluated and marked VERIFIED or NOT VERIFIED.
- [x] Database mode and deployment topology are evidenced from actual configuration.
- [x] Local and remote Git branches are reconciled.
- [x] Test coverage gaps and test suite runtime constraints are documented.
- [x] Confirmed defects are separated from architectural trade-offs.

---

## 11. Exact Next Action for Engineering

1. **Review and Confirm:** Present this completed M1 audit report to the Founder.
2. **Do Not Begin Batch 2/3 Implementation** until Founder reviews the deletion/retention trade-offs (specifically: physical deletion vs. cryptographic tombstoning for epistemic records).
3. **Immediate Safe Next Step:** Implement **Batch 1** (correcting `DATABASE_MODE` configuration parser alignment and fixing the `CompanyMemoryStore.queryMemories` authoritative read discrepancy), accompanied by isolated regression tests.
