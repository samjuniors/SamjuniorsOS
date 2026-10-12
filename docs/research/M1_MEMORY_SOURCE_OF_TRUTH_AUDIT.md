# M1 — Memory Source-of-Truth and Persistence Audit

**Status:** IN PROGRESS — initial source-level inventory recorded; full method-by-method and runtime verification remains open.  
**Date:** 2026-10-12  
**Repository baseline:** `main` at `87bec51b17229ced9eec4d730b1a6302b4d84f88`  
**Working branch:** `audit/m1-memory-source-of-truth`  
**Scope:** Read-only audit of existing memory, conversation, knowledge, and adjacent evidence/state stores. No runtime code or schema changes.

## 1. Objective

Establish, for every existing memory class and memory-adjacent record system:

1. the canonical application abstraction;
2. the canonical data owner and source of truth in each database mode;
3. write, read, cache, mirror, and fallback behavior;
4. founder/company ownership and authority boundaries;
5. retention, archival, deletion, and provenance behavior;
6. failure and recovery semantics;
7. the exact gaps that must be resolved before Memory can be called complete.

This is an inventory and evidence document, not an implementation proposal. No new database, vector store, hosted memory provider, or parallel abstraction is approved by this audit.

## 2. Evidence and limitations

### Repository evidence inspected

- `AGENTS.md`, `CLAUDE.md`, `README.md`, `doc/ROADMAP.md`, `PROGRESS.md`, `WORKLOG.md`.
- `src/lib/server/sophia/personal-memory-store.ts`
- `src/lib/server/sophia/memory-lifecycle.ts`
- `src/lib/server/sophia/memory-capture-stage.ts`
- `src/lib/server/conversation/store.ts`
- `src/lib/server/memory/memory-store.ts`
- `src/lib/server/knowledge/knowledge-store.ts`
- `src/lib/server/sophia/context-assembly.ts`
- `src/lib/server/persistence/durable-file-store.ts`
- `src/lib/server/db/authority.ts`
- `src/lib/server/epistemic/claim-store.ts`
- `src/lib/server/state/state-store.ts`
- `src/lib/server/agents/run-store.ts`
- `prisma/schema.prisma`

### Evidence boundary

This pass inspected GitHub's current `main` source at the baseline SHA above and created a dedicated branch from it. It did **not** inspect a local developer working tree, run tests, start the application, connect to a database, inspect production data, or verify deployment configuration. All behavior statements below are source-level observations unless explicitly labeled otherwise.

The repository guardrails state that a local working tree outranks the remote repository. Therefore, before implementation, the engineering agent must reconcile this branch against the actual local checkout and report any local-only commits or uncommitted changes. Do not overwrite or discard them.

## 3. Memory taxonomy and provisional canonical ownership

| Class / record | Canonical abstraction currently found | What it owns | What it is not |
|---|---|---|---|
| Working / turn context | `SophiaContextAssembler` plus canonical turn/conversation path | Bounded context assembled for one request from durable sources and recent dialogue | A separate durable memory database; assembled context is a projection |
| Personal Mind | `SophiaMemoryStore` | Founder-scoped personal preferences, interaction patterns and contextual notes | Company truth, agent identity, system instruction, permission or approval |
| Episodic memory | `ConversationStore` and its search/history methods | Founder-bound conversations, messages, dialogue continuity and historical recall | Current company state or proof that a historical statement remains true |
| Company historical precedent | `CompanyMemoryStore` | Historical decisions, approved actions, outcomes and lessons | Current canonical facts or a permission source |
| Durable semantic/reference knowledge | `CompanyKnowledgeStore` | Versioned company reference documents, SOPs, architecture and durable knowledge | Automatically verified current operational state |
| Epistemic evidence and canonical facts | `EpistemicClaimStore` and its source/signal/claim/verification/fact model | Evidence lineage, claims, verification, canonical facts and temporal fact reads | Personal memory or generic conversational history |
| Current operational state | `CompanyStateStore` | Current company operational projections and metrics | Historical memory; it remains a distinct state authority |
| Execution history / audit evidence | `AgentRunStore` and dedicated governance/audit stores | Run outcomes, provenance and operational evidence | A substitute for the memory stores above |
| Procedural knowledge | Currently represented in `CompanyKnowledgeStore` documents such as SOPs | Durable written procedures and reference material | A separately verified, learned/versioned procedural-memory subsystem |

**Ownership decision for M1:** preserve these existing boundaries. The phrase “Company Brain” is a governed composition of state, knowledge, epistemic evidence, precedent, activity and execution projections; it must not become an excuse to collapse them into one undifferentiated memory table.

## 4. Persistence authority matrix — initial findings

| Store | Local / test-style source behavior | Authoritative-mode behavior | Cache / mirror / fallback observations |
|---|---|---|---|
| Personal Mind — `SophiaMemoryStore` | `.data/sophia_memories.json` via `DurableFileStore` is the read/write authority | Same file-primary behavior; this store has no authoritative database-mode branch | Prisma `SophiaMemory` is a best-effort write-only mirror. No Prisma read fallback. Founder-scoped operations and lifecycle are enforced in the store. |
| Conversations / episodic — `ConversationStore` | `.data/conversations.json` and `.data/chat_messages.json` are primary write/read sources for listing, message history and idempotency | Same file-primary behavior; no authoritative-mode branch in this store | Prisma dual-write is best-effort. `getConversation()` is the documented exception with a Prisma read fallback/cache-back on file miss. Other message/list/idempotency reads remain file-backed. |
| Company precedent — `CompanyMemoryStore` | Constructor hydrates an in-process array from `.data/company_memories.json`; normal reads/retrieval use the array. `recordMemory()` updates cache, attempts file persistence, then best-effort Prisma mirror. | `getAllMemories()`, `getMemoryById()`, and `recordMemory()` use the database and require it in authoritative mode. | **Important discrepancy:** `queryMemories()` still scores `this.memories` instead of calling the authoritative `getAllMemories()`. `setMemories()` only updates the in-process array. In authoritative mode this can return stale/incomplete cache results or mutate cache without persisting. Requires regression tests and a scoped fix proposal. |
| Company reference knowledge — `CompanyKnowledgeStore` | In-process cache hydrated from `.data/company_knowledge.json`; file is local-mode persistence authority; Prisma mirror is best-effort. | `getAllKnowledge()`, `getKnowledgeById()`, `addKnowledge()`, `setKnowledge()` use the required database path. | `queryKnowledge()` obtains candidates through `getAllKnowledge()`, so authoritative retrieval is database-backed and fail-closed. Local mode remains cache/file based. |
| Epistemic evidence/facts — `EpistemicClaimStore` | Store has persistence logic spanning its source/signal/claim/verification/fact records; method-level matrix still needs completion. | Uses the shared database-authority abstraction in its implementation; method-by-method failure/fallback behavior still needs completion. | Do not treat this as generic memory. Finish the per-entity read/write/delete matrix before declaring M1 complete. |
| Company operational state — `CompanyStateStore` | Has a separate state-store abstraction and durable/cache behavior. Full method-level matrix is not yet complete. | Uses the database authority abstraction. | Adjacent authoritative state, not a memory class. Keep separate in context assembly and retrieval. |
| Agent runs — `PostgresAgentRunStore` | Not a memory store; source describes direct database persistence. | Uses `requireAuthoritativeDatabase()`. | Run output/provenance may be used as evidence, but must not silently become a verified fact or memory. |

### Critical precision

- The Prisma schema in this repository declares a **SQLite datasource**, not a PostgreSQL datasource. “Authoritative mode” means the code's fail-closed database authority mode; it does not prove that production is currently running PostgreSQL.
- A Prisma mirror is not a source of truth merely because the row exists.
- A cache is not a source of truth merely because retrieval reads it.
- `DurableFileStore` atomic rename protects an individual file replacement. Its lock acquisition is explicitly best-effort after timeout; the code logs and proceeds without the lock. Do not describe this as an unconditional cross-process serialization guarantee.
- `DurableFileStore.readCollection()` catches malformed/read errors and returns an empty object. For authoritative stores this behavior needs explicit review because “empty” can be confused with “no records” unless the caller separately detects corruption.
- The Personal Mind and ConversationStore persistence contracts explicitly remain file-primary pending the documented M6 migration. That migration is a target, not a completed fact.

## 5. Verified authority and lifecycle boundaries

### Personal Mind

Source-level contract:
- founder-scoped ownership is enforced by `SophiaMemoryStore`;
- captured candidates are created as `PENDING_REVIEW`;
- activation requires an explicit Founder action;
- lifecycle states include `PENDING_REVIEW`, `ACTIVE`, `SUPERSEDED`, `ARCHIVED`, and `REJECTED`;
- `ACTIVE` means eligible for contextual retrieval only, not truth or authorization;
- content is not promoted automatically into Company Brain or epistemic facts.

### Episodic memory

- ConversationStore is the canonical conversation abstraction used by typed and voice ingress through the shared Sophia turn path.
- Conversation and message ownership is founder-bound.
- Message/turn idempotency is backed by the current file-primary store contract.
- Historical dialogue is not current company truth. Current operational questions must resolve against their canonical state/evidence stores.

### Company Brain and epistemic evidence

- Historical precedent, durable reference knowledge, current operational state, epistemic claims and canonical facts remain separate categories.
- Retrieval context carries authority/provenance partitions; retrieved content is evidence, not an instruction or authorization.
- A model-generated or summarized memory must not become a canonical fact without the existing governed epistemic promotion path.

## 6. Initial findings and risks

### M1-F01 — Personal Mind and ConversationStore are not database-authoritative

**Severity:** High for multi-instance and shared-persistence readiness.  
**Evidence:** Both stores document file-primary semantics in every database mode; Prisma is an opportunistic mirror (with the narrow ConversationStore `getConversation()` fallback exception).  
**Impact:** Multiple application instances do not share a single authoritative conversation/personal-memory read path. A successful mirror write does not make reads consistent across instances.  
**Status:** Confirmed by source inspection; production topology and data impact NOT VERIFIED.  
**Required next work:** Map M6 migration requirements, migration safety, cutover/rollback, dual-write reconciliation and ownership constraints. Do not migrate in this audit.

### M1-F02 — CompanyMemory authoritative retrieval bypasses authoritative reads

**Severity:** High correctness risk when authoritative mode is enabled.  
**Evidence:** `getAllMemories()` and `getMemoryById()` query the database in authoritative mode, but `queryMemories()` calls `OperationalLearningLoop.retrieveRelevantMemories(..., this.memories)`. `setMemories()` only assigns the in-process array.  
**Impact:** Context retrieval may omit database records or return stale/seed/cache records that do not match the authoritative database. A cache-only set operation can report completion without changing authoritative persistence.  
**Status:** Confirmed source-level discrepancy; no runtime reproduction yet.  
**Required next work:** Add isolated regression tests for authoritative retrieval and set semantics; propose the smallest correction only after checking all callers and test assumptions.

### M1-F03 — CompanyMemory local writes are not strict

**Severity:** Medium data-integrity risk.  
**Evidence:** `recordMemory()` mutates the in-process array and catches file persistence errors; local-mode Prisma writes are also best-effort.  
**Impact:** The caller may observe a successful method return despite the file write failing. This differs from Personal Mind's strict authoritative file-write contract.  
**Status:** Confirmed source-level behavior.  
**Required next work:** Determine intended local-mode success semantics and whether callers rely on best-effort behavior; do not silently change it.

### M1-F04 — DurableFileStore lock timeout degrades concurrency guarantees

**Severity:** High for concurrent writers; scope depends on deployment.  
**Evidence:** After 30 seconds, lock acquisition logs an error and proceeds without the lock.  
**Impact:** Read-modify-write operations can lose updates under prolonged contention. The lock is not a distributed database transaction or multi-instance coordination mechanism.  
**Status:** Confirmed source-level behavior; contention frequency NOT VERIFIED.  
**Required next work:** Identify all production-critical collections and whether they rely on this lock; compare current deployment constraints with the M6 shared database target.

### M1-F05 — Corrupt/missing file reads can look like empty collections

**Severity:** Medium-to-high depending on store and recovery path.  
**Evidence:** `readCollection()` catches parse/read errors and returns `{}`.  
**Impact:** Callers may treat corruption as an empty collection and continue with defaults or incomplete data.  
**Status:** Confirmed source-level behavior; no corruption test run in this audit.  
**Required next work:** Trace each critical caller and define explicit corruption detection, backup/restore and fail-closed behavior.

### M1-F06 — Retention/deletion is not unified across memory classes

**Severity:** High for privacy, lifecycle and operational correctness.  
**Evidence:** Personal Mind has lifecycle and explicit deletion; conversation and company knowledge/history have separate persistence abstractions; CompanyMemory and epistemic stores have independent schemas and APIs. No unified retention/deletion contract was established in this pass.  
**Impact:** A founder request to forget/delete information may not propagate to derived summaries, retrieval indexes, cached context, mirrors, backups or linked evidence.  
**Status:** Gap confirmed at architecture-document level; exact deletion propagation remains NOT VERIFIED.  
**Required next work:** Build a deletion/retention dependency graph and testable contract for each data class, including derived data and backup exceptions.

### M1-F07 — Procedural memory is not a distinct runtime subsystem

**Severity:** Low / product-design question, not necessarily a defect.  
**Evidence:** Existing SOPs and procedures are represented in durable company knowledge. No separate procedural-memory store was established by this source inventory.  
**Impact:** The current system has written procedural references, but this audit does not establish adaptive learned procedures or a dedicated procedure versioning/execution contract.  
**Status:** Source inventory observation.  
**Required next work:** Keep SOPs in CompanyKnowledge unless a concrete use case proves the need for another abstraction.

## 7. What is deliberately not being built

- No new vector database, embedding index, hosted memory service or Honcho integration.
- No TypeSafe integration; TypeSafe remains a reference for the separate native decision-workflow research.
- No replacement of Personal Mind, ConversationStore, CompanyMemoryStore, CompanyKnowledgeStore or EpistemicClaimStore.
- No automatic memory activation, automatic fact promotion, autonomous policy learning or model-granted permissions.
- No schema migration, data migration, retention deletion or runtime code change in M1.
- No expansion of voice/TTS/Qwen work while memory foundations remain unresolved.

## 8. M1 remaining audit checklist

- [x] Identify memory classes and provisional canonical owners.
- [x] Map initial persistence semantics for Personal Mind, conversations, CompanyMemory and CompanyKnowledge.
- [x] Identify the CompanyMemory authoritative retrieval/cache discrepancy.
- [x] Record file-lock and corrupt-read semantics from DurableFileStore.
- [ ] Complete per-method persistence matrix for EpistemicClaimStore (sources, signals, claims, verifications, facts and deletion).
- [ ] Complete per-method persistence matrix for CompanyStateStore and AgentRunStore where they participate in memory/context projections.
- [ ] Trace every memory read/write call site from `SophiaContextAssembler`, turn ingress, capture, governance and background jobs.
- [ ] Build retention/deletion propagation matrix: primary record, mirror, cache, derived summaries, indexes, logs and backups.
- [ ] Reconcile current deployment database mode and topology from deployment config; do not infer PostgreSQL from names.
- [ ] Inspect relevant tests and run isolated persistence/recovery tests in a dedicated local test database.
- [ ] Reconcile this remote branch against the actual local working tree before implementation.
- [ ] Produce a final canonical ownership/persistence decision and minimal implementation plan.

## 9. Acceptance criteria for M1

M1 is complete only when:
1. every memory and memory-adjacent store has a per-method source-of-truth matrix;
2. every read, write, cache, mirror and fallback path is traced from actual call sites;
3. founder/company isolation and authority transitions are mapped;
4. retention, deletion, supersession and derived-data propagation are explicit;
5. failure semantics are tested or clearly marked NOT VERIFIED;
6. database mode and deployment topology are evidenced rather than inferred;
7. local/remote branch differences are reconciled;
8. the resulting design preserves one canonical owner per data class and requires no parallel memory platform.

**No implementation is authorized by this M1 report.** Any required runtime fix will be proposed as a separate, minimal implementation task with tests and rollback criteria.

## 10. Next single action

Continue M1 with a method-by-method audit of `EpistemicClaimStore` and `CompanyStateStore`, then trace the context assembler call sites and deletion paths. Update this report and WORKLOG before starting any implementation. Stop and report the evidence and any material architecture decision requiring Founder approval.

## 11. Primary source links

- [AGENTS.md](../../AGENTS.md)
- [CLAUDE.md](../../CLAUDE.md)
- [Personal Mind store](../../src/lib/server/sophia/personal-memory-store.ts)
- [Personal Mind lifecycle](../../src/lib/server/sophia/memory-lifecycle.ts)
- [Memory capture stage](../../src/lib/server/sophia/memory-capture-stage.ts)
- [ConversationStore](../../src/lib/server/conversation/store.ts)
- [CompanyMemoryStore](../../src/lib/server/memory/memory-store.ts)
- [CompanyKnowledgeStore](../../src/lib/server/knowledge/knowledge-store.ts)
- [Context assembler](../../src/lib/server/sophia/context-assembly.ts)
- [DurableFileStore](../../src/lib/server/persistence/durable-file-store.ts)
- [Database authority](../../src/lib/server/db/authority.ts)
- [EpistemicClaimStore](../../src/lib/server/epistemic/claim-store.ts)
- [CompanyStateStore](../../src/lib/server/state/state-store.ts)
- [AgentRunStore](../../src/lib/server/agents/run-store.ts)
- [Prisma schema](../../prisma/schema.prisma)
