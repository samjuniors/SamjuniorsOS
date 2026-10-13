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
| **M1-F02** | Confirmed Defect (RESOLVED in Batch 1) | Logic Discrepancy | `CompanyMemoryStore.queryMemories()` queried `this.memories` cache instead of DB in authoritative mode; `recordMemory()` in auth mode did not update `this.memories`. | Stale or missing precedents in authoritative context assembly; cache-DB divergence. | **RESOLVED:** `queryMemories()` now scores `await this.getAllMemories()` candidates; `recordMemory()` keeps `this.memories` coherent upon DB upsert. Verified with test `m1_batch1_memory_authority.test.ts`. |
| **M1-F03** | Confirmed Defect (RESOLVED in Batch 1) | Error Handling | `CompanyMemoryStore.recordMemory()` swallowed file persistence errors after updating in-memory array. | Caller observes success even if disk write failed. | **RESOLVED:** `recordMemory()` uses `saveItemStrict()` and mutates `this.memories` only upon durable file persistence success. Throws if disk write fails. Verified with test `m1_batch1_memory_authority.test.ts`. |
| **M1-F04** | Architecture Trade-off | Concurrency Limitation | `DurableFileStore` proceeds without lock after 30s timeout. | Updates can be lost under extreme file contention. | Acceptable trade-off for single-instance local runtime; replaced by database row locks in M6. |
| **M1-F05** | Confirmed Defect | Failure Recovery | `DurableFileStore.readCollection()` returns `{}` on parse error. | Corrupt file is treated as empty collection, potentially overwriting damaged data on next write. | Add corrupt file quarantine/backup (`.corrupt.<timestamp>`) and raise error rather than returning empty object (queued for Batch 3). |
| **M1-F06 / M1-F09** | Architecture Gap | API Completeness | Deletion APIs are missing for conversations, messages, precedents, knowledge items, and state entities. | Cannot fulfill founder directive to "forget" or delete historical conversations/decisions. | Implement explicit founder-scoped deletion methods with clear cascade/tombstone policies (queued for Batch 2). |
| **M1-F08** | Confirmed Defect | Incomplete Authoritative Mode | `CompanyStateStore.queryState()` queries cache only; `getFinancialMetrics()` falls back to seeded sample model. | Current operational state can return simulated sample values even in authoritative database mode. | Ensure `getFinancialMetrics()` fails closed in authoritative mode if DB record is missing; route `queryState()` through authoritative getters. |
| **M1-F10** | Confirmed Defect | Error Handling | Local Epistemic and CompanyState writes return successfully after caught file persistence errors. | In-memory maps diverge from disk state upon write errors. | Propagate persistence errors to caller in local mode. |
| **M1-F11** | Confirmed Defect (RESOLVED in Batch 1) | Configuration Inconsistency | `.env.example` documented `DATABASE_MODE=sqlite`, which `authority.ts` rejected. | Silent fallback to `NODE_ENV` defaults; operator confusion. | **RESOLVED:** `authority.ts` now accepts `'sqlite'` as an explicit alias for `'local'`. `.env.example` updated to document `'local'`, `'authoritative'`, `'test'` with `'sqlite'` alias note. Verified with test `m1_batch1_memory_authority.test.ts`. |

---

## 9. Recommended Minimal Implementation Batches

Implementation proceeds in small, independently verifiable, reversible batches:

### Batch 1: Configuration & Error Propagation Hygiene (COMPLETE & VERIFIED)
1. **Reconciled `DATABASE_MODE` parser and template (M1-F11):** Updated `src/lib/server/db/authority.ts` to accept `'sqlite'` as an alias for `'local'`. Aligned `.env.example`.
2. **Fixed `CompanyMemoryStore` authoritative retrieval (M1-F02):**
   - Updated `queryMemories()` to retrieve candidates via `await this.getAllMemories()`.
   - Updated `recordMemory()` in authoritative mode to keep `this.memories` coherent upon DB upsert.
   - Preserved `setMemories()` in-memory test/benchmark injection semantics.
3. **Fixed swallowed persistence errors in `CompanyMemoryStore` (M1-F03):**
   - Used `saveItemStrict()` in `recordMemory()` before mutating in-memory cache.
   - Throws fail-closed on filesystem persistence failure without leaving cache split-brain.
   - Ensured deduplication by ID rather than duplicate unshifting.
4. **Verification:** Verified with new targeted suite `tests/sophia/m1_batch1_memory_authority.test.ts` (7/7 passed), zero regressions across existing suites (108/108 passed).

### Batch 2: Retention, Deletion and Forget Governance (COMPLETE & VERIFIED)

This specification and implementation establishes the authoritative retention, deletion, and "forget this" governance architecture for SamJuniorsOS across all 12 system data classes. Conversation and message physical deletion have been implemented and verified with a 21-test isolated suite. Epistemic redaction and KMS cryptographic erasure are explicitly deferred per Founder directive.

#### 1. Repository & Baseline Verification Summary (Phase 1)
- **Branch & Commit:** Verified on `audit/m1-memory-source-of-truth` at commit `affbcaf59b6b34c23f0bbf6b64b9237aa6ca99f1`.
- **Batch 1 Integrity:** M1-F02, M1-F03, and M1-F11 verified; 7/7 targeted tests in `tests/sophia/m1_batch1_memory_authority.test.ts` passing; 108 regression assertions passing (115 total assertions green).
- **Working Tree:** Clean code working tree; isolated test execution verified.
- **Conversation Ownership Reality:** In `ConversationStore`, conversations are bound to `founderId`. In `prisma/schema.prisma` (lines 492–525), `Conversation` and `ChatMessage` models exist with `onDelete: Cascade` on the message relation. However, today local mode `DurableFileStore` collections (`conversations` and `chat_messages`) are the authoritative read and write target. Deleting a conversation in the local file store requires explicit message collection purging under `withCollectionLock`.
- **Epistemic Constraint Reality:** In `prisma/schema.prisma` (lines 372–403), `CanonicalFact` has `onDelete: Restrict` on `EpistemicClaim` and references other facts via self-relation `supersededById`. In `src/lib/server/retrieval/fact-read-model.ts`, `FactLineage` and `AS_OF` queries rely on intact backward and forward pointers. Physical deletion of facts breaks foreign keys, destroys graph lineage, and orphans derived `DependencyRelation` records.

---

#### 2. Comprehensive Retention & Forget Policy Matrix (Phase 2 — Founder-Corrected)

Retention in SamJuniorsOS is a **governed operational and legal compliance policy**, not an arbitrary hardcoded timer. The architecture distinguishes five distinct data sensitivities:
1. **Personal Information (Founder-Scoped):** Preferences, personal notes, dialogues. Subject to Founder-directed physical deletion.
2. **Company Operational Records:** Canonical state, financial models, PRDs, SOPs. Active during company lifespan; updated via governed state transitions.
3. **Epistemic Evidence & Facts:** Multi-agent claims, observations, canonical facts. Governed via immutable DAGs and supersession; physical deletion prohibited.
4. **Governance Audit Metadata:** Append-only ledger of founder approvals, side effects, and agent runs. Permanent corporate liability and compliance record.
5. **Sensitive Content & Credentials:** Zero retention policy; credentials and internal CoT are sanitized at ingress and never persisted.

| Data Class | Physical Deletion | Logical Deletion | Archival | Supersession | Redaction / Tombstoning | Governed Retention Scope | Ownership & Auth | Derived-Data Propagation | Backup Implications |
|---|---|---|---|---|---|---|---|---|---|
| **1. Personal Mind** (`SophiaMemory`) | **ALLOWED** (Founder-directed). Erased from `.data/` and DB mirror. | Supported via `REJECTED` or `ARCHIVED` lifecycle states. | Supported (`ARCHIVED`). Excluded from context assembly. | Supported via `supersededByMemoryId` pointer. | N/A (prefer physical erase or lifecycle tombstone). | Governed by Founder discretion; immediate purge upon request. | Strict Founder session (`getAuthenticatedFounder`). Cross-founder: 404 (zero leakage). | Immediately drops out of `SophiaContextAssembler` slice 6B. | Point-in-time recovery may restore deleted preference; re-purge required on restoration. |
| **2. Conversations** (`Conversation`) | **ALLOWED** (Founder-directed). Erased from `.data/` and DB mirror. Write-ahead tombstone prevents resurrection. | Supported (`status = 'archived'`). Excluded from active UI list. | Supported. Retains history; hidden from active dialogue. | N/A (conversations do not supersede). | N/A (entire conversation purged). | Default: indefinite; purged immediately upon Founder deletion directive. | Strict Founder session. Must match `record.founderId`. | Purges from `listConversations` and `searchConversations` (episodic retrieval). In-flight turns fail cleanly with 404. | Write-ahead tombstone ledger prevents resurrection during backup recovery or migration. |
| **3. Chat Messages** (`ChatMessage`) | **ALLOWED** (Founder-directed single message deletion or conversation cascade). | Optional: content replaced with tombstone string if sequence counters must be preserved. | Inherits parent conversation status. | N/A. | Content replaced with `[REDACTED BY FOUNDER]` if thread continuity required. | Inherits conversation retention. | Founder owning parent conversation. Cross-founder: 404. | Immediately drops out of `getRecentHistory`, token assembly, and episodic search. | Purged on backup rotation. |
| **4. Company Precedents** (`CompanyMemory`) | **PROHIBITED** (Physical deletion would destroy company operational memory). | Supported via `active = false` or `decayScore = 0`. | Supported. Marked inactive; excluded from tier-1 assembly. | Supported (successor precedent records new lesson). | Statement redaction allowed if legally required. | Governed by operational precedent policy (active company lifespan). | Founder-only. Cannot be performed by autonomous agents. | Precedent drops out of `SophiaContextAssembler` slice 5B; operational learning loop recalculated. | Retained in cold backups for operational governance audit. |
| **5. Company Knowledge** (`CompanyKnowledge`) | **PROHIBITED** (Specs and SOPs represent binding corporate architecture). | Demoted via `[RETIRED]` or `[HISTORICAL]` title tags. | Supported. Historical versions retained for historical queries. | Mandatory model: New SOP/PRD version supersedes previous version hash. | Allowed for sensitive IP under founder directive. | Governed by architectural versioning policy (permanent company record). | Founder or authorized executive. | `CompanyKnowledgeStore.queryKnowledge` demotes retired docs below current ones. | Preserved across all backup cycles. |
| **6. Epistemic Sources** (`EpistemicSource`) | **PROHIBITED** (Raw evidence sources anchor provenance and content hashes). | Marked `validityState = 'deprecated'`. | Retained permanently as evidence anchor. | Superseded if source system emits updated document. | Statement redaction of sensitive credentials only (salt-hashed). | Governed evidentiary retention (tied to dependent claims). | System ingest or Founder. | Derived signals and claims retain pointer to source ID. | Retained in immutable backup ledger. |
| **7. Epistemic Claims** (`EpistemicClaim`) | **PROHIBITED** (Claims anchor the constitutional verification audit trail). | `verificationStatus = 'rejected'` (terminal state). | Retained under rejected status. | Marked `superseded` upon fact promotion. | Redaction of claim statement allowed with audit notice. | Governed by verification policy (tied to parent run). | Council Agents / Founder. | Ineligible claims never enter canonical fact pool. | Retained in immutable backup ledger. |
| **8. Canonical Facts** (`CanonicalFact`) | **STRICTLY PROHIBITED** (Physical deletion corrupts `FactLineage`, `AS_OF` reads, and FKs). | Marked `validityState = 'superseded'`. | Retained indefinitely in historical fact pool. | **MANDATORY MODEL:** `markFactSuperseded(oldId, newId, { supersededAt })`. | Statement replacement for legal compliance (structural DAG preserved). | Permanent (immutable company truth graph). | Founder-only governance action. | `DependencyRelationStore` edges marked superseded; AS_OF queries preserve temporal validity. | Retained permanently in cold storage. |
| **9. Operational State** (`CompanyState`) | **PROHIBITED** (Singleton company state record). | State transitions (`cancelled`, `completed`, `deprecated`). | Historical metrics preserved in periodic telemetry snapshots. | Financial models and initiatives updated in-place with history. | Sensitive metrics redacted upon board/founder order. | Governed by corporate reporting lifecycle. | Founder-only. | Realtime metrics reflect latest state immediately in slice 1. | Retained in standard database snapshots. |
| **10. Agent Runs** (`AgentRun`) | **PROHIBITED** (Council execution runs are immutable historical evidence). | Marked `status = 'halted'` or `'failed'`. | Archived upon workflow completion. | N/A (runs do not supersede). | Sanitized: CoT and secrets stripped at ingress/egress. | Permanent corporate audit log. | System runtime / Founder. | In-flight run slice 2 updates immediately. | Retained permanently in immutable ledger. |
| **11. Governance & Audit Records** (`ApprovalRecord`, `SideEffectAudit`) | **STRICTLY PROHIBITED** (Cryptographic binding and append-only ledger). | N/A (Append-only immutable ledger). | Retained permanently. | Revoked approvals marked `decision = 'revoked'`. | **NEVER REDACTED.** Payload hashes (`payloadHash`) are permanent. | Permanent regulatory & fiduciary compliance record. | Founder decision / Deterministic gate. | Audit trail visualized in Activity app and inspector. | Must be replicated to write-once-read-many (WORM) storage. |
| **12. Derived Indexes & Cached Context** (`DependencyRelation`, Episodic hits, Context slices) | **ALLOWED & REBUILDABLE** (Zero truth resides in derived indexes). | Edges marked `status = 'superseded'`. | Dropped and rebuilt dynamically. | Automatically rebuilt upon canonical fact change. | N/A (derived directly from canonical facts). | Ephemeral / Rebuildable on demand. | Automatic system maintenance. | Immediate sync: dropping derived table causes zero truth loss. | Excluded from critical recovery backups; rebuilt on restore. |

---

#### 3. Conversation Deletion Architecture & Implementation Design (Phase 3 — Founder-Corrected)

##### Method Signatures & Behavioral Contracts
```typescript
export interface DeleteConversationResult {
  success: boolean;
  deleted: boolean;
  alreadyDeleted?: boolean;
  notFound?: boolean;
  conversationId: string;
  purgedMessageCount?: number;
}

export interface DeleteMessageResult {
  success: boolean;
  deleted: boolean;
  alreadyDeleted?: boolean;
  notFound?: boolean;
  conversationId: string;
  messageId: string;
}

/**
 * Deletes a conversation and all associated messages for the authenticated Founder.
 *
 * INVARIANTS & RECONCILIATION:
 * 1. Founder Ownership & Zero Information Leakage:
 *    If the conversation is not found or owned by another founder, returns notFound (mapped to 404).
 *    Never reveals existence or ownership of foreign records.
 * 2. Idempotency:
 *    If the conversation was already deleted by this founder (tombstoned), returns
 *    { success: true, deleted: false, alreadyDeleted: true, conversationId }.
 * 3. Write-Ahead Tombstone (Anti-Resurrection Barrier):
 *    Before modifying collections, writes a tombstone to `conversation_tombstones.json`.
 *    Subsequent reads (getConversation, getOrCreateConversation) check the tombstone FIRST
 *    and immediately return null/404, strictly bypassing Prisma read fallback. This guarantees
 *    that a failed Prisma mirror deletion or point-in-time backup restore NEVER resurrects
 *    a deleted conversation.
 * 4. Atomic Collection Purge:
 *    - Acquires lock on `chat_messages` and purges all entries where `msg.conversationId === conversationId`.
 *    - Acquires lock on `conversations` and deletes the conversation record.
 * 5. Deferred Prisma Mirror Reconciliation:
 *    - Best-effort deletes the conversation from Prisma mirror (`(prisma as any).conversation.delete`).
 *    - Records `prismaReconciled: true` on tombstone if successful.
 *    - If DB is offline, tombstone preserves `prismaReconciled: false`; reconcilePrismaTombstones()
 *      retries reconciliation lazily when the database reconnects.
 * 6. Audit & Evidence Preservation:
 *    - Does NOT delete AgentRun, ApprovalRecord, or SideEffectAudit rows.
 *    - Governance evidence remains intact with orphaned references in metadata.
 * 7. Active Turn Safety:
 *    - Any in-flight turn attempting to append to a tombstoned conversation throws ConversationNotFoundError (404).
 */
public async deleteConversation(founderId: string, conversationId: string): Promise<DeleteConversationResult>;

/**
 * Deletes an individual chat message within a conversation.
 *
 * INVARIANTS:
 * 1. Strict Ownership: Validates parent conversation exists, is owned by founderId, and is not tombstoned (404).
 * 2. Referential Match: Message must belong to conversationId.
 * 3. Parent Timestamp: Updates parent conversation's updatedAt timestamp on disk.
 * 4. Idempotency: Returns notFound (404) or alreadyDeleted if message is absent.
 */
public async deleteMessage(founderId: string, conversationId: string, messageId: string): Promise<DeleteMessageResult>;
```

##### Dual-Write & Storage Engine Mechanics
1. **Write-Ahead Tombstone (`.data/conversation_tombstones.json`):**
   ```typescript
   export interface ConversationTombstone {
     id: string; // conversationId
     founderId: string;
     deletedAt: string;
     purgedMessageCount: number;
     prismaReconciled: boolean;
   }
   ```
2. **DurableFileStore Serialization:**
   - Conversation deletion acquires cross-process collection locks on both `conversations` and `chat_messages`.
   - Message purge is executed under `withCollectionLock('chat_messages')`, reading, filtering, and atomically rewriting `chat_messages.json`.
   - Conversation record is removed from `conversations.json` via `deleteItemStrict`.
3. **Prisma Dual-Write & Anti-Resurrection Shield:**
   - `getConversation()` checks `isTombstoned(conversationId)` before any lookup. If tombstoned, it returns `null` immediately and **never calls Prisma fallback**.
   - Mirror delete is executed best-effort: `await prisma.conversation.delete({ where: { id: conversationId } })`.
   - If DB is unavailable, tombstone records `prismaReconciled: false`. Lazy reconciliation runs via `reconcilePrismaTombstones()`.
4. **Audit Record Protection:**
   - Independent `AgentRun`, `ApprovalRecord`, and `SideEffectAudit` tables have no foreign keys to `Conversation`.
   - Deletion strictly touches `conversations`, `chat_messages`, and `conversation_tombstones`. Audit logs are preserved untouched.
5. **Filesystem Backup Restoration Procedure (Tombstone Preservation):**
   When restoring the local state directory (`.data/`) from cold backups or older filesystem snapshots:
   - **Step 1 (Quarantine Active Tombstones):** Before unpacking the backup archive over `.data/`, back up the active tombstone ledger:
     `cp .data/conversation_tombstones.json /tmp/conversation_tombstones.backup.json`
   - **Step 2 (Restore Volume):** Unpack/restore the historical snapshot into `.data/`.
   - **Step 3 (Re-apply Tombstone Union):** Merge `/tmp/conversation_tombstones.backup.json` into `.data/conversation_tombstones.json`. Any conversation deleted between snapshot creation and restoration remains permanently tombstoned.
   - **Step 4 (Pre-Traffic Sweep):** Execute `ConversationStore.getInstance().reconcileAllTombstones()` before serving public or API traffic. This sweeps and purges any restored conversations and messages that have active tombstones, and synchronizes the Prisma mirror.
   - **Step 5 (Serve Traffic):** Route traffic to the application.

---

#### 4. Epistemic Governance Policy (Phase 4 — Founder-Corrected)

##### Architectural Decisions
1. **Supersession is Approved Lifecycle:** Normal fact evolution uses `markFactSuperseded(oldId, newId, { supersededAt })`. Predecessors remain historically accessible for audits and `AS_OF(T)` temporal reads.
2. **Physical Deletion Strictly Prohibited:** Physical deletion breaks `FactLineage` DAGs, falsifies historical `AS_OF(T)` truth queries, and orphans `DependencyRelation` edges.
3. **Automated Cryptographic Erasure & KMS Integration Deferred:** True cryptographic erasure requires per-statement envelope encryption with KMS-managed DEK destruction. In the current local SQLite / file-store architecture, claiming cryptographic erasure would be architectural fabrication. Statement replacement is NOT claimed as cryptographic erasure.
4. **Implementation Boundary:** Epistemic redaction is **deferred** from Batch 2. Batch 2 implements conversation and message deletion only.

---

#### 5. API Security & Endpoint Design (Phase 5 — Founder-Corrected)

##### Endpoint Specifications
1. `DELETE /api/conversation?id=<conversationId>`
2. `DELETE /api/conversation/message?conversationId=<conversationId>&messageId=<messageId>` (also supported via `DELETE /api/conversation?id=<cId>&messageId=<mId>`)

##### Security Bounds & Response Formats
- **Authentication:** Strict server-side session via `getAuthenticatedFounder(req)`. Unauthenticated requests return `401 Unauthorized`.
- **Founder Authorization & Zero Leakage:**
  - Session `userId` is the only trusted authority. Client-provided `founderId` is ignored.
  - Inaccessible or unknown resources return `404 Not Found` (`{ error: 'Conversation not found' }`). Does NOT reveal whether another founder owns the record.
- **Successful Deletion:** Returns `200 OK` (`{ success: true, deleted: true, conversationId: id, purgedMessages: count }`).
- **Repeated Deletion (Idempotency):** Returns `200 OK` (`{ success: true, deleted: false, alreadyDeleted: true, conversationId: id }`).
- **Audit Logging:** Emits append-only security audit event upon deletion.
- **Rate Limiting:** Token-bucket rate limiter prevents automated wipe runaway.

---

#### 6. Comprehensive Testing Plan (Phase 6)

The test suite will be specified and executed in `tests/sophia/m1_batch2_retention_governance.test.ts` using isolated `.data-test/` fixtures:
1. **Cross-Founder Isolation:** Founder B attempting to delete Founder A's conversation receives 403 Forbidden; Founder A's data remains untouched.
2. **Cascade Deletion:** Deleting a conversation purges the conversation and 100% of its associated messages from disk.
3. **Message Deletion:** Deleting a single message leaves sibling messages and parent conversation intact.
4. **Idempotent Deletion:** Second deletion of the same ID returns false/404 without error or state corruption.
5. **Audit Preservation:** Verify that deleting a conversation does NOT delete `AgentRun` or `ApprovalRecord` rows.
6. **Persistence Failure Handling:** Inject disk failure during message purge; assert error surfaces fail-closed without corrupting the store.
7. **Active Turn Handling:** In-flight turn attempting to append to a deleted conversation throws `ConversationNotFoundError`.
8. **Epistemic Redaction Scaffolding:** Verify that a redacted fact statement preserves `FactLineageHop` traversal in `getFactLineage`.
9. **AS_OF Query Stability:** Verify that a redacted/superseded fact does not break historical timeline reads.
10. **Derived Index Consistency:** Assert that `DependencyRelationStore` edges are cleaned up when a fact is superseded/redacted.

---

#### 7. Founder Review Checkpoint (Phase 7)

**CRITICAL CHECKPOINT: STOPPING FOR FOUNDER REVIEW BEFORE IMPLEMENTATION.**
Engineering must not implement runtime deletion endpoints or alter store persistence until the Founder reviews and approves:
1. Physical deletion policy for Conversations and Messages.
2. Content tombstoning vs. KMS cryptographic envelope encryption for Epistemic Facts.
3. Immutability invariant for Audit Records and Agent Runs.

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

## 12. Batch 2.1 Hardening & Production Operational Model

### 12.1 Source-Level Hardening Delivered

| Defect / Risk | Root Cause | Batch 2.1 Hardening Solution | Invariant Preserved |
|---|---|---|---|
| **`saveMessage` / `deleteConversation` race** | `deleteMessage` and `deleteConversation` locked `chat_messages`, but `saveMessage` wrote without collection lock. | `saveMessage` is now serialized under `withCollectionLockStrict(CHAT_MESSAGES_COLLECTION)`. Synchronous rechecks inside the critical section verify conversation tombstone, parent conversation record existence, and message tombstones. | Safe ordering guaranteed: a save winning the lock before deletion is cleanly swept by the purge; a save arriving after tombstone fails closed (`ConversationSecurityError`). Zero locks held across awaits. |
| **Prisma reconciliation false success** | Prisma deletion errors were swallowed by `catch(() => {})`, after which `prismaReconciled` was unconditionally marked `true`. | `isPrismaRecordNotFoundError(err)` inspects Prisma error codes: only confirmed deletions and verified absent records (`P2025`) set `prismaReconciled = true`. Connection outages, network timeouts (`P1001`, `P1002`) keep `prismaReconciled = false`. Updated tombstones persist via `saveItemStrict`. | Failed mirror deletions remain pending for retry and never report false success. |
| **Lock timeout best-effort degradation** | `DurableFileStore.acquireLock()` proceeded without a lock after `LOCK_TIMEOUT_MS`. | Added fail-closed option: `withCollectionLockStrict(collection, fn, timeoutMs)` throws `LockTimeoutError` if lock cannot be acquired within timeout (default 30s). Critical deletion and message-write paths use this strict primitive. Legacy callers preserve non-throwing behavior. | Critical deletion and message write operations never execute unprotected. |
| **Individual message replay** | Physically removing a message allowed later saves with the same message ID or replaying deleted idempotency keys to recreate content. | Implemented durable, founder-scoped deletion markers (`message_tombstones.json`) written write-ahead via `saveItemStrict`. Re-saving a deleted message ID or replaying a deleted idempotency key fails closed (`MessageTombstonedError`). | Permanently deleted messages cannot be recreated by replay attacks or retries. |

---

### 12.2 Reconciliation Invocation & Operational Runbook

Store-wide tombstone reconciliation is **operator-triggered**, not executed by an unverified background timer:

1. **Per-Conversation Idempotent Auto-Retry:**
   - When `deleteConversation(founderId, conversationId)` is called on an already-tombstoned conversation, it automatically sweeps any lingering local files and re-attempts Prisma mirror deletion if `prismaReconciled === false`.
2. **Store-Wide Operator Runbook:**
   - **Command:** `npx tsx scripts/reconcile-tombstones.ts` (or `npm run db:reconcile-tombstones`).
   - **Behavior:**
     1. Sweeps all durable tombstones in `.data/conversation_tombstones.json`.
     2. Purges any orphaned records in `conversations.json` and `chat_messages.json`.
     3. Checks database availability and issues Prisma deletions for all pending tombstones (`prismaReconciled === false`).
     4. Updates tombstones strictly with `prismaReconciled: true` upon successful delete or confirmed absence (`P2025`).
     5. Leaves tombstones pending if database is offline or unreachable.
   - **Runbook Policy:** Run this script during scheduled database maintenance windows, after resolving database outages, or as part of disaster recovery validation.

---

### 12.3 Batch 3 Dependency — Critical Collection Corruption Finding

> [!CAUTION]
> **Batch 3 Required Finding: Critical Collection Corruption Policy**
> `DurableFileStore.readCollection()` currently returns `{}` upon JSON parse errors or corrupted files.
> For ordinary collections (e.g. scratch caches), a quarantine/reset policy may be tolerable.
> However, for **critical governance collections** — specifically `conversation_tombstones` — an unreadable or corrupt file must **NEVER** be interpreted as an empty ledger. Treating a corrupt tombstone file as empty would bypass the anti-resurrection barrier and allow deleted conversations to be resurrected via Prisma fallback!
>
> **Batch 3 Scope Requirement:**
> Define an explicit fail-closed corruption policy for critical collections:
> 1. Any read failure on `conversation_tombstones` must throw `CriticalCollectionCorruptionError` and halt reads rather than returning `{}`.
> 2. Implement quarantine archiving (`<collection>.json.corrupt.<timestamp>`) with deterministic operator recovery tools.
> 3. Add tests proving that corrupt tombstone files cannot make deleted conversations visible through Prisma fallback.

---

## 13. Batch 2.2 Final Hardening: Runbook Integrity, Strict Lock Coverage, and Prisma Classification

### 13.1 Reconciliation Runbook Integrity (`scripts/reconcile-tombstones.ts`)

The operator runbook script was hardened to ensure zero false success and strict exit-status propagation:
- **Non-Zero Exit Code on Pending Work:** If database is unreachable or any tombstones remain un-reconciled (`pendingPrismaCount > 0`), the script logs detailed diagnostic guidance and exits with status `1`.
- **Local Cleanup Failure Propagation:** If local orphaned file deletion fails, `failedLocalCount` is tracked, error details are printed, and the script exits with status `1`.
- **No False Success Messages:** The `[Success]` banner is logged if and only if `pendingPrismaCount === 0 && failedLocalCount === 0`.
- **Durable Retryability Preserved:** Un-reconciled tombstones remain durable on disk with `prismaReconciled: false`, allowing clean idempotent retry upon database restoration.

### 13.2 Strict Lock Coverage Across Conversation & Tombstone Collections

- **`saveItemStrict` / `deleteItemStrict` Fail-Closed Option:**
  `DurableFileStore` methods now accept `options?: { lockStrict?: boolean; timeoutMs?: number }`. When `lockStrict === true`, failure to acquire the collection lock within `timeoutMs` throws `LockTimeoutError` rather than proceeding degraded.
- **Fail-Closed Conversation Tombstones:** Writing a conversation tombstone in `deleteConversation` requires the `conversation_tombstones` collection lock under fail-closed semantics. If contention times out, execution halts and no tombstone or conversation modification occurs.
- **Fail-Closed Conversation Deletion:** Removing a conversation from disk requires the `conversations` collection lock under strict fail-closed semantics.
- **Deadlock-Free Sequential Locking:** Collection locks are acquired sequentially and never nested across collections during `deleteConversation` (Tombstone -> Messages -> Conversation -> Tombstone). Zero synchronous locks are held across asynchronous awaits.

### 13.3 Prisma Error Classification Tightening

`isPrismaRecordNotFoundError()` was tightened to prevent false-positive reconciliation:
- Only an error carrying canonical `code === 'P2025'` returns `true`; message-only phrases are not accepted as proof of record absence.
- Connection failures (`P1001`), timeouts (`P1002`, `ETIMEDOUT`), and database configuration errors (`P1003`) return `false` (leaving tombstones pending).
- Generic messages containing fragments like "table does not exist" or "database does not exist" return `false`.




## 14. Batch 3 — Critical Collection Corruption and Recovery

**Status:** VERIFIED IN DEDICATED ISOLATED TEST ENVIRONMENT WITH SIMULATED FAULTS; AWAITING FOUNDER REVIEW.

### 14.1 Critical collection policy

`DurableFileStore` now explicitly classifies:
- `conversation_tombstones`
- `message_tombstones`

Reads of these collections pass through strict validation. A malformed JSON document, empty file, non-object JSON value, or read failure throws `CriticalCollectionCorruptionError`; it is never returned as an empty collection.

When quarantine succeeds, the unreadable source is renamed to:
`<collection>.json.corrupt.<timestamp>.<pid>`

When quarantine fails, the error is still fail-closed and the original source remains in place. No automatic reconstruction or deletion of the quarantined evidence is performed.

### 14.2 Initialization marker

A durable sidecar marker is created for each critical ledger:
- `.data/conversation_tombstones.json.initialized`
- `.data/message_tombstones.json.initialized`

If a marker exists but its ledger file is missing, reads throw `CriticalCollectionCorruptionError` rather than treating the collection as first-use empty. Existing ledger files are marked initialized before parsing so that a corrupt legacy file cannot be quarantined and then silently appear to be a never-used ledger.

Critical ledger mutations require strict APIs (`writeCollectionStrict`, `saveItemStrict`, `deleteItemStrict`); generic non-strict write/delete APIs and `clearCollection` reject critical collections. Critical strict mutations default to fail-closed lock acquisition.

**Migration limitation:** a deployment that already lost its tombstone file before the initialization marker was ever created cannot be distinguished from a genuinely never-initialized deployment by the marker alone. Before rollout, operators must verify the existing `.data` volume and seed/retain markers for any existing ledger files. The marker is a detection aid, not cryptographic integrity protection.

### 14.3 Prisma fallback and reconciliation

`ConversationStore.isTombstoned()`, `getTombstone()`, message tombstone lookups, and reconciliation use the normal `readCollection()` interface, which now routes registered critical ledgers through strict validation. Therefore an unknown tombstone state throws before `getConversation()` can attempt its Prisma fallback.

The reconciliation CLI reports the corruption and recovery requirement, then exits non-zero through its fatal error path. It must not print a zero-tombstone success result when the ledger cannot be read.

### 14.4 Operator backup / restore procedure

1. Stop application traffic and all writers before restoring.
2. Restore a consistent snapshot of the entire relevant `.data` volume, not a hand-picked mixture of files from different backup times. At minimum preserve both tombstone JSON files and their `.initialized` sidecars, together with the associated conversations/messages files.
3. Preserve any `.corrupt.*` files for investigation; do not overwrite or delete them automatically.
4. Validate that both tombstone files are non-empty valid JSON objects and that each initialized marker is present.
5. Restore the corresponding Prisma backup/point-in-time state if required by the incident plan.
6. Run `npx tsx scripts/reconcile-tombstones.ts` while traffic remains stopped.
7. Resume traffic only after the command exits zero and an operator has checked the restored data and logs.

The file-backed store does not provide a multi-file transactional snapshot. Backups must therefore quiesce writers or use a storage-level consistent snapshot. A marker without its ledger, or a ledger without its matching snapshot context, is not a successful recovery.

### 14.5 Batch 3 verification matrix and coverage distinctions

The Batch 3 verification suite (`tests/sophia/m1_batch3_verification_recovery.test.ts`) and full regression suites have been executed against a dedicated, isolated temporary environment. To ensure engineering accuracy and avoid overstating acceptance, the verification scope is explicitly partitioned into four categories:

#### A. Verified Automated Test Coverage (Deterministic Assertions)
- **Malformed JSON Quarantine:** Parsing failure on `conversation_tombstones` or `message_tombstones` strictly throws `CriticalCollectionCorruptionError` and generates a single quarantine file (`<collection>.json.corrupt.<timestamp>.<pid>`).
- **Empty / Truncated File Quarantine:** 0-byte or whitespace-only files trigger corruption quarantine and fail closed instead of being treated as empty objects.
- **Missing Initialized Ledger Protection:** When an `.initialized` marker exists but the JSON ledger is missing, reads throw `CriticalCollectionCorruptionError`, blocking phantom resurrection or uninitialized overwrite.
- **Marker Auto-Seeding:** Pre-existing uncorrupted ledger files without an initialization marker auto-seed the marker upon first read.
- **Quarantine Rename Failure:** If quarantine rename fails (e.g. simulated permission denial), the system fails closed with `CriticalCollectionCorruptionError` and preserves the original corrupt byte sequence intact on disk.
- **Read Permission Denial:** Read failures fail closed with `CriticalCollectionCorruptionError`.
- **Store-Wide Fail-Closed Invariant:** Verified that `isTombstoned()`, `getTombstone()`, `getConversation()`, `deleteConversation()`, and `reconcileAllTombstones()` strictly fail closed on corrupt or missing ledgers. None interpret damaged ledgers as empty.
- **Prisma Fallback Shielding:** Confirmed that corrupt or missing initialized tombstone ledgers strictly abort before any Prisma fallback in `getConversation()`. Dual-write mirrors are unreachable under corruption.
- **Prisma Error Classification:** Unit tests verify only canonical `P2025` is classified as confirmed absence; connection errors (`P1001`, `P1002`, `ETIMEDOUT`, `ECONNREFUSED`), database config errors (`P1003`), and error message strings are rejected.
- **Concurrency & Race Invariants:** Parallel deletions serialize safely under collection lock; concurrent message writes during deletion fail closed or are cascaded without ghost records; strict lock timeouts fail closed without state mutation.

#### B. Simulated Crash and Recovery Coverage (Fault Injection)
- **Atomic Write Interruption:** Interrupted writes right before atomic rename (simulated via `renameSync` I/O errors) leave the existing target file intact at its previous valid baseline.
- **Crash Between Tombstone Write and Conversation Purge:** If process terminates after tombstone write but before local conversation/message purge, the conversation is immediately shielded from reads, and subsequent retry sweeps lingering records cleanly.
- **Crash During Prisma Reconciliation:** Database outages leave tombstones marked `prismaReconciled: false`; subsequent reconciliation runbook sweeps pending records upon database reconnection.
- **Operator Recovery After Quarantine:** Validates that an operator restoring a valid backup alongside its `.initialized` marker fully restores operational read/write health.
- **Isolated End-to-End Backup and Restore Exercise:**
  - Executed against an isolated temporary directory (`tempTestRoot/.data`), leaving the repository `.data` directory untouched.
  - Backed up both tombstone ledgers and both `.initialized` markers along with conversation collections.
  - Seeded unrelated application data (`company_knowledge.json`) and pre-existing quarantine evidence (`.corrupt.historical_*`).
  - Simulated live store corruption, verified quarantine creation and pre-restore quarantine preservation.
  - Performed SHA-256 hash verification on each file prior to restoration.
  - Verified unrelated application data was not modified.
  - Verified pre-existing quarantine evidence and newly created disaster quarantine files were strictly preserved.
  - Executed `runReconcile` script (exited 0).
  - Verified deleted conversations remain inaccessible and cannot be recreated.
  - Verified active conversations remain accessible and intact.

#### C. Unverified Process-Kill and Storage-Level Crash Scenarios
The following scenarios cannot be verified through process-level automated testing and are explicitly **NOT VERIFIED**:
- **Hardware Power Loss:** Sudden power cutoffs, brownouts, or hardware write-cache drops before OS sync.
- **Operating System Kernel Panics:** Crash-consistency of unflushed filesystem buffers during kernel-level halts.
- **Hard Process Termination (`SIGKILL` / `kill -9`):** Process termination precisely scheduled mid-syscall inside OS kernel disk drivers.
- **Filesystem / Storage Corruption:** Bit rot, bad sectors, or underlying disk volume corruption.

#### D. Limitations of Automated Backup/Restore Verification
- **Sequential Copy vs. Atomic Snapshot:** The automated test performs sequential file copies to test integrity, hash validation, and reconciliation logic. It **does NOT prove** an atomic multi-file snapshot under live concurrent writes.
- **Operational Requirement:** Operators must strictly follow the runbook (§14.4): either quiesce all writers (stop application traffic) or take a storage-level crash-consistent snapshot (e.g. ZFS, LVM, EBS snapshot) when taking production backups.

### 14.6 Verification Evidence and Pre-Merge Status

- **Automated Regression Suite:** 146/146 test assertions verified passing (m1_batch3_verification_recovery: 24/24, m1_batch2_conversation_deletion: 52/52, m1_batch1_memory_authority: 7/7, m1_canonical_state_authority: 7/7, m3_conversation_convergence: 14/14, m3_authority_hardening: 7/7, m0_idempotency_expiry: 7/7, m2_knowledge_persistence: 8/8, k2_personal_memory: 20/20).
- **TypeScript Compilation:** Independent compiler check verified zero errors in persistence, conversation store, reconciliation runbook, and test suites.
- **Directory Isolation Proof:** Test suite executed in dedicated temporary root with verified assertions that resolved data directory was outside repository root and repository `.data` was untouched.
- **Branch Status:** `audit/m1-memory-source-of-truth` remains strictly unmerged and undeployed, awaiting Founder review.
