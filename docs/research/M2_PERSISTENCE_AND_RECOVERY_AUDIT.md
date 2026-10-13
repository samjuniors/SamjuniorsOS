# M2 — Persistence and Recovery Audit & Architecture Specification

**Product:** SamJuniorsOS — AI-Native Company Operating System  
**Document:** `docs/research/M2_PERSISTENCE_AND_RECOVERY_AUDIT.md`  
**Status:** DRAFT PROPOSAL FOR FOUNDER REVIEW (INVESTIGATION COMPLETE)  
**Authority:** Authoritative engineering investigation for Milestone 2 (Persistence & Recovery)  
**Canonical Baseline Commit:** `dd2c3c2bfb0bc5f9ea846dcd6a9410e7c840ff80` (M1 integration into `main`)  
**Active Working Branch:** `audit/m2-persistence-and-recovery`  

---

## 1. Executive Summary

Milestone 1 (Memory Source of Truth, Conversation Deletion, Epistemic Lineage, and Recovery Quarantine) was formally accepted, verified across 90/90 core assertions, and integrated into `main` via 2-parent merge commit `dd2c3c2bfb0bc5f9ea846dcd6a9410e7c840ff80`.

With M1 established as the immutable foundation, this audit begins **Milestone 2 (M2) — Persistence and Recovery**.

### Core Findings Overview

1. **Storage Dual-Model Reality (`VERIFIED`):**  
   SamJuniorsOS operates a dual-model persistence layer:
   - **Local / Test Mode (`local`, `test`):** Persists durable state to container-local JSON files in `.data/` managed by `DurableFileStore`, using cross-process file locks (`.json.lock`) and atomic temporary-file renames (`.tmp.*`).
   - **Authoritative Database Mode (`authoritative`):** Enforces fail-closed persistence against a relational schema using Prisma ORM. While store classes are historically named `Postgres*` reflecting the target cloud architecture, the active sandbox schema is an explicit SQLite port (`provider = "sqlite"`).

2. **Critical Asymmetry in Error & Lock Handling (`VERIFIED`):**  
   Following M1 Batch 2/3, `conversation_tombstones` and `message_tombstones` were hardened with initialization markers (`.initialized`), corrupted-file quarantine (`.corrupt.*`), and fail-closed lock timeouts. However, **all other collections** (`sophia_memories`, `company_knowledge`, `company_memories`, `company_state`, `epistemic_claims`, `approvals`, `idempotency_records`) operate under a dangerous legacy contract:
   - **Fail-Open Lock Acquisition:** When `acquireLock` times out after 30,000ms (`LOCK_TIMEOUT_MS`), it logs an error and **proceeds without the lock**, degrading write serialization.
   - **Swallowed Write Errors:** Non-strict writes (`atomicWrite(..., false)`) catch write errors and log to console without throwing, causing silent in-memory vs. on-disk state divergence.
   - **Catastrophic Truncation Wipeout:** In non-critical collections, `readCollection` catches JSON parse errors and returns `{}`. A subsequent call to `saveItem` merges the new item into the empty object and writes it back, **permanently wiping out the entire pre-existing collection**.

3. **In-Memory Cache Inversion (`VERIFIED`):**  
   In `CompanyStateStore`, `EpistemicClaimStore` (Local), and `CompanyKnowledgeStore` (Local), in-memory singletons are modified **before** the durable file write is confirmed. If the disk write fails (e.g. disk full, permission denied), in-memory state diverges from durable storage until the process restarts.

4. **Single-Instance Deployment Constraint (`VERIFIED`):**  
   `InstanceConcurrencyGuard` writes `.data/instance.lock` and heartbeats every 5 seconds. Because `DurableFileStore` relies on local filesystem locks and directory state, running multiple container instances (e.g. unconstrained Cloud Run auto-scaling) causes immediate store divergence, approval double-consumption, and workflow race conditions. The system is structurally bound to `min-instances=1, max-instances=1`.

5. **Test Runner Fragmentation (`VERIFIED`):**  
   While core M1 test suites (90/90 assertions) are 100% runner-neutral (passing identically under Node.js `tsx` and Bun), several legacy restart tests (`m3_conversation_convergence.test.ts`, `k2_personal_memory.test.ts`) hardcode `Bun.spawn(['bun', ...])`. When executed under Node.js (`npx tsx`), they crash with `ReferenceError: Bun is not defined`. Furthermore, in `m2_knowledge_persistence.test.ts`, child processes emitting Prisma startup logs to `stdout` break parent `JSON.parse` streams unless seeded.

6. **Complete Absence of Automated Backup Tooling (`VERIFIED`):**  
   No automated backup scripts, snapshot procedures, or restoration runbooks currently exist in the repository. Backups exist only in documentation and ad-hoc test simulations.

---

## 2. Current Persistence Architecture

### 2.1 Storage Layer Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                          APPLICATIONS & INGRESS                        │
│   (Sophia Server Gateway, /api/sofia/ask, /api/agent-chat, Workflows)   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
       ┌───────────────────────────┐   ┌───────────────────────────┐
       │   FILE-PRIMARY STORES     │   │   DUAL-MODE STORES        │
       │  (Sophia Personal Mind,   │   │  (Company Knowledge,      │
       │   Conversations, Chats)   │   │   Epistemic Claims, State,│
       │                           │   │   Memories, Approvals)    │
       └─────────────┬─────────────┘   └─────────────┬─────────────┘
                     │                               │
                     │                 Is DATABASE_MODE === 'authoritative'?
                     │                         /               \
                     │                   YES  /                 \  NO
                     ▼                       ▼                   ▼
       ┌───────────────────────────┐   ┌───────────────┐   ┌───────────────────────────┐
       │   DURABLE FILE STORE      │   │ PRISMA / DB   │   │   DURABLE FILE STORE      │
       │  (.data/*.json via atomic │   │ (SQLite port; │   │  (.data/*.json via atomic │
       │   rename & lockfiles)     │   │  target PG)   │   │   rename & lockfiles)     │
       └─────────────┬─────────────┘   └───────────────┘   └─────────────┬─────────────┘
                     │                                                   │
                     ▼ (opportunistic mirror)                            ▼ (opportunistic mirror)
       ┌───────────────────────────┐                       ┌───────────────────────────┐
       │     PRISMA (BEST-EFFORT)  │                       │     PRISMA (BEST-EFFORT)  │
       │  (Errors logged/swallowed)│                       │  (Errors logged/swallowed)│
       └───────────────────────────┘                       └───────────────────────────┘
```

### 2.2 Persistence Subsystems

1. **`DurableFileStore` (`src/lib/server/persistence/durable-file-store.ts`):**  
   Singleton managing JSON files in `.data/` (or `/tmp/samjuniors-os-data` fallback).
   - Locking: Exclusive file creation `fs.openSync(lockPath, 'wx')` writing PID. Re-entrant in-process via `lockDepth` map. Stale lock breaking after 10,000ms. Timeout deadline 30,000ms.
   - Atomicity: `atomicWrite()` writes payload to `${collectionPath}.tmp.${Date.now()}.${random}` then calls synchronous `fs.renameSync()`.
   - Collections: `conversations`, `chat_messages`, `conversation_tombstones`, `message_tombstones`, `sophia_memories`, `company_knowledge`, `company_memories`, `company_state`, `epistemic_sources`, `epistemic_signals`, `epistemic_claims`, `canonical_facts`, `epistemic_verifications`, `approvals`, `idempotency_records`.

2. **`InstanceConcurrencyGuard` (`src/lib/server/persistence/instance-guard.ts`):**  
   Manages single-container operational exclusivity via `.data/instance.lock`.
   - Heartbeat timer (5,000ms interval, unreferenced) writes current timestamp and PID.
   - Leases older than 15,000ms are considered stale.
   - Logs warning if active lease held by different PID; throws only if `STRICT_SINGLE_INSTANCE === 'true'` or `options.failClosed === true`.

3. **Prisma ORM & SQLite Schema (`prisma/schema.prisma`):**  
   14 mapped models:
   - `User`, `CompanyState`, `CompanyKnowledge`, `CompanyMemory`
   - `WorkflowDefinition`, `WorkflowInstance`, `ScheduledWorkItem`, `SchedulerHeartbeat`
   - `ApprovalRecord`, `SideEffectAudit`, `TelemetryMetric`, `AgentRun`
   - `EpistemicSource`, `EpistemicSignal`, `EpistemicClaim`, `EpistemicVerification`, `CanonicalFact`, `DependencyRelation`
   - `IdempotencyRecord`, `DistributedLease`, `Conversation`, `ChatMessage`, `SophiaMemory`
   - Database Connection: `.env.local` sets `DATABASE_URL="file:./db/custom.db"`. Because Prisma resolves relative SQLite URLs relative to `prisma/`, it resolves to `prisma/db/custom.db`.

4. **Database Authority Enforcement (`src/lib/server/db/authority.ts`):**  
   - `getDatabaseMode()`: Evaluates `DATABASE_MODE` env var ('authoritative' | 'test' | 'local'). Defaults to 'authoritative' in `NODE_ENV === 'production'`.
   - `requireAuthoritativeDatabase()`: If authoritative mode is active, tests database ping via `isDatabaseAvailable()`. Fails closed with `DatabaseAuthorityError` (HTTP 503) if unreachable.

---

## 3. Store-by-Store Authority and Reliability Matrix

The following matrix classifies every store across the SamJuniorsOS architecture based on code inspection and empirical test execution.

| Store / Domain | Canonical Class | Storage Authority (Local/Test) | Storage Authority (Authoritative) | Lock Guarantee | Write Failure Behavior | Cache Coherence Risk | Status |
|---|---|---|---|---|---|---|---|
| **Personal Mind** | `SophiaMemoryStore` | `.data/sophia_memories.json` (File-Primary) | `.data/sophia_memories.json` (File-Primary; DB is opportunistic mirror) | Lock-strict re-entrant | Throws on write error (`saveItemStrict`) | Low (Strict file write precedes return) | `VERIFIED` |
| **Conversations** | `ConversationStore` | `.data/conversations.json` (File-Primary) | `.data/conversations.json` (File-Primary; DB is opportunistic mirror) | Non-strict lock (fail-open) | Non-strict write swallows error | Medium (In-memory file read, swallowed write) | `VERIFIED` |
| **Chat Messages** | `ConversationStore` | `.data/chat_messages.json` (File-Primary) | `.data/chat_messages.json` (File-Primary; DB is opportunistic mirror) | Lock-strict for delete; non-strict for save | `saveMessage` uses `saveItem` (swallowed) | Medium (Disk error swallowed) | `VERIFIED` |
| **Tombstones** | `ConversationStore` | `.data/*_tombstones.json` (File-Primary) | `.data/*_tombstones.json` (File-Primary; DB reconciled async) | Lock-strict fail-closed | Throws on write error (`saveItemStrict`) | None (Zero cache, reads from disk under lock) | `VERIFIED` |
| **Company Precedents** | `CompanyMemoryStore` | `.data/company_memories.json` | Prisma `CompanyMemory` | Lock-strict in local mode | Throws on local write error (`saveItemStrict`) | Low (Local write strict before cache update) | `VERIFIED` |
| **Canonical Knowledge** | `CompanyKnowledgeStore` | `.data/company_knowledge.json` | Prisma `CompanyKnowledge` | Non-strict lock (fail-open) | Non-strict write (`saveItem` swallows error) | **High** (Cache updated *before* write, write error swallowed) | `VERIFIED` |
| **Epistemic Claims & Signals** | `EpistemicClaimStore` | `.data/epistemic_*.json` | Prisma `EpistemicClaim` / `EpistemicSignal` | Non-strict lock (fail-open) | Non-strict write (`saveItem` swallows error) | **High** (In-memory Map updated *before* write, write swallowed) | `VERIFIED` |
| **Canonical Facts** | `PostgresEpistemicStore` / `EpistemicClaimStore` | `.data/canonical_facts.json` | Prisma `CanonicalFact` | Non-strict lock in local; Prisma Tx in auth | Local swallows error; Auth fails closed | **High** in local; Low in authoritative | `VERIFIED` |
| **Company Operational State** | `CompanyStateStore` | `.data/company_state.json` | Prisma `CompanyState` | Non-strict lock (fail-open) | `writeCollection` wrapped in swallowed `try/catch` | **Critical** (Arrays mutated *before* disk write; errors silently dropped) | `VERIFIED` |
| **Workflows & Instances** | `PostgresWorkflowStore` / `InMemoryWorkflowStore` | In-memory Map (optional `.data`) | Prisma `WorkflowInstance` | In-memory atomic state machine; Prisma optimistic lock (`stateVersion`) | Auth fails closed; local ephemeral | Low in auth; High in local restart | `VERIFIED` |
| **Scheduled Work** | `PostgresScheduledWorkStore` / `InMemoryScheduledWorkStore` | In-memory Map (ephemeral) | Prisma `ScheduledWorkItem` | Heartbeat worker claims via atomic SQL | Auth fails closed; local ephemeral | Ephemeral in local mode | `VERIFIED` |
| **Approvals** | `PostgresApprovalStore` / `InMemoryApprovalStore` | In-memory Map + `.data/approvals.json` | Prisma `ApprovalRecord` | Non-strict lock in local; Prisma `$transaction` in auth | Local swallows error; Auth fails closed | Medium in local; Zero in auth | `VERIFIED` |
| **Side Effect Audits** | `PostgresAuditStore` / `InMemoryAuditStore` | In-memory Map + `.data/side_effect_audits.json` | Prisma `SideEffectAudit` | Non-strict lock in local; Prisma insert in auth | Append-only; local swallows error | Low (Append-only audit) | `VERIFIED` |
| **Idempotency Records** | `PostgresIdempotencyStore` / `InMemoryIdempotencyStore` | In-memory Map + `.data/idempotency_records.json` | Prisma `IdempotencyRecord` | Non-strict lock in local; Prisma unique constraint in auth | Local swallows error; Auth fails closed on duplicate | Medium in local; Zero in auth | `VERIFIED` |
| **Agent Runs** | `AgentRunStore` | In-memory Map (ephemeral) | Prisma `AgentRun` | In-memory lock; Prisma insert in auth | Local is ephemeral; Auth fails closed | Ephemeral in local mode | `VERIFIED` |

---

## 4. Write Atomicity and Locking Analysis

### 4.1 Write Atomicity (`atomicWrite`)

**Implementation (`VERIFIED`):**
```typescript
private atomicWrite<T>(collection: string, data: Record<string, T>, strict: boolean): void {
  const filePath = this.getCollectionPath(collection);
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;
  try {
    const serialized = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempPath, serialized, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
    if (strict) throw err;
    console.error(`[DurableFileStore] Failed to atomically persist collection "${collection}":`, err);
  }
}
```

**Guarantees & Failure Modes:**
1. **Single-File Atomicity:** On POSIX filesystems and Windows NTFS, `fs.renameSync()` performs an atomic directory metadata update. A reading process either opens the complete previous version or the complete new version. No reader ever observes a partially written JSON payload (`VERIFIED`).
2. **Interrupted Writes:** If the Node process is terminated (`SIGKILL`, power failure) during `fs.writeFileSync(tempPath)`, the temp file is orphaned. The target `${collection}.json` file remains intact and uncorrupted. On restart, the store continues with the previous state (`VERIFIED`).
3. **Orphaned Temp File Accumulation:** Uncleaned `.tmp.*` files remain in `.data/` indefinitely if process death occurs before the `catch` block unlinks them. There is currently no startup garbage collection for orphaned temp files (`INFERRED`).

### 4.2 Cross-Process Locking Mechanism

**Implementation (`VERIFIED`):**
- Locks are held via `.data/<collection>.json.lock` created with `fs.openSync(lockPath, 'wx')` (POSIX `O_CREAT | O_EXCL`).
- **Poll Interval:** 5ms (`Atomics.wait` or busy-spin fallback).
- **Stale Lock Timeout:** 10,000ms (`LOCK_STALE_MS`). If lock file `mtime` is older than 10 seconds, `breakStaleLock` unlinks it.
- **Acquisition Timeout:** 30,000ms (`LOCK_TIMEOUT_MS`).

### 4.3 The Fail-Open Vulnerability

**Defect Analysis (`VERIFIED`):**
In `acquireLock(collection, failClosed, timeoutMs)`:
```typescript
if (Date.now() > deadline) {
  if (failClosed) {
    throw new LockTimeoutError(`Failed to acquire lock for "${collection}" within ${timeoutMs}ms (fail-closed)`);
  }
  if (!warned) {
    console.error(`Could not acquire lock for "${collection}" within ${timeoutMs}ms — proceeding WITHOUT the lock...`);
    warned = true;
  }
  this.lockDepth.set(collection, 1);
  return; // <--- PROCEEDS UN-SERIALIZED!
}
```

In `withCollectionLock`, `saveItem`, `writeCollection`, and `deleteItem`, `failClosed` defaults to `false`. If two processes write concurrently and lock contention exceeds 30s:
1. Process B gives up on waiting for Process A.
2. Process B enters the critical section **while Process A is still writing**.
3. Process B reads, modifies, and renames its temp file over Process A's work, causing **silent lost updates** (`VERIFIED`).

### 4.4 The Non-Critical Truncation Wipeout Vulnerability

**Defect Analysis (`VERIFIED`):**
In `readCollection(collection)`:
```typescript
public readCollection<T>(collection: string): Record<string, T> {
  if (this.isCriticalCollection(collection)) {
    return this.readCriticalCollection<T>(collection);
  }
  const filePath = this.getCollectionPath(collection);
  if (!fs.existsSync(filePath)) return {};

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.trim()) return {};
    return JSON.parse(content) as Record<string, T>;
  } catch (err) {
    console.warn(`[DurableFileStore] Error reading collection "${collection}":`, err);
    return {}; // <--- RETURNS EMPTY OBJECT ON CORRUPTION!
  }
}
```

Only `conversation_tombstones` and `message_tombstones` are registered under `isCriticalCollection`. If any other collection (e.g. `conversations.json`, `company_knowledge.json`, `sophia_memories.json`) suffers disk corruption or truncated JSON:
1. `readCollection` logs a warning and returns `{}`.
2. A subsequent call to `saveItem(collection, newId, newItem)` calls `readCollection` (getting `{}`), sets `current[newId] = newItem`, and writes `{ [newId]: newItem }` to disk.
3. **Result:** Every prior record in that collection is permanently wiped from disk without quarantine or recovery opportunity (`VERIFIED`).

---

## 5. Concurrency and Multi-Instance Analysis

### 5.1 Single-Instance Bound

`SamJuniorsOS` persists durable operational state to container-local storage (`.data/`).
`InstanceConcurrencyGuard` (§9 Concurrency Invariant) establishes:
- **Cloud Run Min Instances:** 1
- **Cloud Run Max Instances:** 1
- **Target Concurrency:** 80 requests / container

### 5.2 Multi-Instance Failure Modes

If deployed to an auto-scaling environment (e.g. `max-instances=3` without shared volumes):

1. **State Divergence (`VERIFIED`):**  
   Container 1 writes a memory or conversation to its local `.data/`. Container 2 serves a subsequent request and reads its own `.data/`, reporting that the memory does not exist.
2. **Double Approval Consumption (`VERIFIED`):**  
   `InMemoryApprovalStore.consume()` checks `isConsumed` against its local in-memory Map. If Container 1 and Container 2 receive simultaneous approval consumptions for the same action, both containers will evaluate `isConsumed === false` and execute the external side effect twice.
3. **Split-Brain Scheduling (`VERIFIED`):**  
   `WorkflowScheduler` on Container 1 and Container 2 will both poll for overdue `ScheduledWorkItem`s, generating duplicate workflow executions.
4. **File Lock Partitioning (`VERIFIED`):**  
   `.json.lock` files are local to the filesystem of each container. File locking provides zero mutual exclusion across distinct physical or virtual instances.

**Verdict:** Single-instance deployment (`max-instances=1`) is an **absolute operational requirement** for the current file-primary and SQLite architectures. Multi-instance scaling is strictly blocked until authoritative PostgreSQL persistence and distributed leases are active.

---

## 6. Crash and Restart Recovery Analysis

### 6.1 Interrupted Multi-File Operations

SamJuniorsOS workflows frequently update multiple collections during a single logical operation:
- **Conversation Deletion:**
  1. Write tombstone to `conversation_tombstones.json` (strict).
  2. Purge messages from `chat_messages.json` (strict).
  3. Purge conversation from `conversations.json`.
  4. Reconcile deletion against Prisma `Conversation` table.

**Resilience Evaluation (`VERIFIED`):**
In M1 Batch 2/3, this sequence was engineered to be crash-consistent:
- Because the tombstone is written **first** under strict lock, any process crash after step 1 leaves the tombstone durable.
- Reads immediately filter out the conversation via the tombstone shield.
- Retries of `deleteConversation()` detect the existing tombstone and sweep residual messages idempotently.
- `scripts/reconcile-tombstones.ts` recovers pending Prisma reconciliations after a restart.

**Vulnerability in Other Stores (`VERIFIED`):**
Stores outside `ConversationStore` lack this multi-step crash consistency:
- In `EpistemicClaimStore`, promoting a claim involves updating `epistemic_claims.json`, writing to `canonical_facts.json`, and indexing into `dependency_relations`. A process crash mid-promotion leaves an orphaned promoted claim without a canonical fact record.

### 6.2 Test Runner Fragmentation & Child Process Portability

**Investigation Findings (`VERIFIED`):**
1. **Runner Discrepancy:** The repository `package.json` configures test scripts via `tsx` (Node.js loader):
   ```json
   "test": "tsx tests/sophia/m1_batch1_memory_authority.test.ts"
   ```
   However, several test suites written during earlier sprints rely on Bun runtime globals:
   - `tests/sophia/m2_knowledge_persistence.test.ts` (lines 69, 92)
   - `tests/sophia/m3_conversation_convergence.test.ts` (line 110)
   - `tests/sophia/k2_personal_memory.test.ts` (line 94)
2. **Runtime Failure Evidence:** When executed via `npx tsx tests/sophia/m3_conversation_convergence.test.ts`:
   ```
   ReferenceError: Bun is not defined
       at runChild (tests/sophia/m3_conversation_convergence.test.ts:110:19)
   ```
3. **Windows `/tmp` Path Failure:** In `m2_knowledge_persistence.test.ts`:
   ```typescript
   const AUTHORITY_DB = `/tmp/m2-knowledge-authority-${process.pid}.db`;
   ```
   On Windows, `/tmp/...` creates `C:\tmp\...`. If `C:\tmp` does not exist or Prisma cannot create files there, child processes fail immediately.
4. **Child Process Output Collisions:** In `m2_knowledge_persistence.test.ts`, child processes outputting Prisma error messages to `stdout` corrupt the JSON communication channel between parent and child:
   ```
   Error: authority child (authoritative-seed) emitted non-JSON output: prisma:error ...
   ```

**Architectural Requirement:** M2 must replace hardcoded `Bun.spawn` calls with a runner-agnostic, cross-platform child process runner (`spawnTestChild`) built on Node's native `child_process.spawn`/`fork`, ensuring 100% test portability across Node.js (`tsx`) and Bun on both Windows and Linux.

---

## 7. Backup and Disaster Recovery Analysis

### 7.1 Current Backup Posture (`VERIFIED`)

- **Automated Backup Scripts:** None exist in the repository.
- **Snapshot Infrastructure:** No snapshot mechanism exists for `.data/` or `prisma/db/custom.db`.
- **Operator Runbooks:** No documented recovery runbooks exist for point-in-time database restoration.

### 7.2 Point-in-Time Consistency Challenges

1. **Concurrent File Snapshot Hazard (`INFERRED`):**  
   If an operator runs `cp -r .data/ .data.backup/` while SamJuniorsOS is running:
   - A file could be copied while `atomicWrite` is midway through renaming, resulting in a missing or truncated file in the backup.
   - Cross-collection state can be captured in a torn state (e.g. `conversation_tombstones.json` backed up *before* a deletion, but `chat_messages.json` backed up *after*).
2. **SQLite Hot-Copy Hazard (`INFERRED`):**  
   Copying `prisma/db/custom.db` while SQLite has open write transactions or WAL pages (`custom.db-wal`) can result in a corrupted backup database. Consistent SQLite backups require either:
   - Executing `VACUUM INTO 'backup.db';`
   - Using the SQLite Online Backup API (`sqlite3_backup`).
   - Performing a clean shutdown or WAL checkpoint truncate before copying.

### 7.3 Target Recovery Objectives (RPO & RTO)

For SamJuniorsOS v1 (single-instance company operating system):
- **Recovery Point Objective (RPO):** ≤ 1 hour for background automated snapshots; ≤ 0 seconds for point-in-time transactions via append-only audit ledgers.
- **Recovery Time Objective (RTO):** ≤ 5 minutes to restore container filesystem and restart service.

---

## 8. Failure Scenarios and Security Implications

| Scenario | System Behavior (Current) | Desired M2 Behavior | Severity |
|---|---|---|---|
| **Disk Full (`ENOSPC`) during save** | Non-strict stores catch and log; in-memory cache mutates; disk untouched. Silent loss. | Fail closed: throw `StorageWriteError`; roll back in-memory mutation. | **CRITICAL** |
| **Lock contention > 30s** | Logs warning and proceeds WITHOUT lock. Concurrent writers clobber each other. | Fail closed: throw `LockTimeoutError`; abort operation without mutating state. | **HIGH** |
| **Non-critical file corrupt (invalid JSON)** | `readCollection` logs warning and returns `{}`. Next write wipes entire collection. | Quarantine file to `.corrupt.*`; fail closed with `CollectionCorruptionError`. | **CRITICAL** |
| **Process killed during write** | Temp file `.tmp.*` orphaned. Main file intact. | Atomic rename preserves integrity; startup GC cleans orphaned `.tmp.*` files. | LOW |
| **Multi-instance deployment (auto-scaled)** | Memory divergence, duplicate workflow steps, double approval consumption. | Strict single-instance lease check fails closed on startup if another node is active. | **CRITICAL** |
| **Database offline in Authoritative Mode** | `requireAuthoritativeDatabase()` throws `DatabaseAuthorityError` (HTTP 503). | System fails closed safely without corrupting data or fabricating state. | ACCEPTABLE |
| **Database offline in Local Mode** | Best-effort Prisma write catches error and logs warning. `.data/` persists. | Local file persists safely; pending sync queue records unsynced mutations. | ACCEPTABLE |

---

## 9. File versus Database Architecture Comparison

| Evaluation Dimension | Option A: DurableFileStore Primary (Current Local) | Option B: SQLite Primary via Prisma (Current Sandbox DB) | Option C: PostgreSQL Primary via Prisma (Target Cloud DB) |
|---|---|---|---|
| **ACID Transactions** | ❌ None (Single-file atomicity only; no multi-collection tx) | ⚠️ Partial (Single-process ACID; file-locked WAL) | ✅ Full (Distributed ACID, multi-table transactions) |
| **Write Serialization** | ⚠️ File locks (`.json.lock`) prone to 30s fail-open | ⚠️ Handled by SQLite engine, but busy-timeout risk | ✅ Handled by PostgreSQL MVCC & row-level locking |
| **Multi-Instance Deployment** | ❌ Strictly prohibited (Split-brain, divergent files) | ❌ Prohibited (SQLite cannot span containers) | ✅ Fully supported (Shared connection pool, stateless containers) |
| **Process Crash Recovery** | ⚠️ Atomic rename safe, but multi-file partial failures | ✅ Journal / WAL crash recovery automatic | ✅ WAL crash recovery, replication, point-in-time recovery |
| **Operational Complexity** | ✅ Zero external dependencies; local `.data/` folder | ✅ Minimal (Local `.db` file; no daemon) | ⚠️ Requires managed DB instance (Cloud SQL, Supabase) |
| **Backup & Snapshot** | ⚠️ Requires lock quiescence or writer halt | ⚠️ Requires `VACUUM INTO` or WAL checkpoint | ✅ Automated cloud snapshots, continuous WAL archiving |
| **Migration Risk Today** | ✅ Zero migration risk (already active) | ✅ Low (already active via Prisma SQLite) | ⚠️ High risk if attempted prematurely before M2 stability |

### Architectural Verdict

Per `AGENTS.md` §13 (Build vs Buy) and §14 (Architectural Change Protocol):
- **Do NOT execute a premature PostgreSQL migration during M2.**
- Migrating to PostgreSQL now would introduce external cloud dependencies, networking latency, and complex environment requirements before our local write atomicity and test harnesses are stable.
- **Recommended Strategy:**
  1. Solidify and harden `DurableFileStore` so it provides rock-solid reliability, fail-closed locking, and zero-wipeout guarantees for single-instance local and preview environments.
  2. Maintain `Prisma / SQLite` as the active relational provider for dual-mode authoritative testing.
  3. Keep the target PostgreSQL migration neatly isolated behind the existing `Postgres*` store abstractions for a future milestone (M6).

---

## 10. Recommended Target Architecture

### 10.1 Five Core Architectural Directives for M2

1. **Directive 1: Universal Fail-Closed Locking (`lockStrict: true`)**  
   Deprecate the fail-open fallback in `DurableFileStore`. When `acquireLock` exceeds `timeoutMs`, it must throw `LockTimeoutError` across **all** collections, not just tombstones. Proceeding without a lock must be prohibited.
2. **Directive 2: Universal Quarantine & Anti-Wipeout Protection**  
   Extend the quarantine and corruption protection currently exclusive to `conversation_tombstones` to **all collections**. If any collection file contains unparseable JSON or empty contents, `readCollection` must quarantine the corrupt file to `<collection>.json.corrupt.<timestamp>.<pid>` and throw `CriticalCollectionCorruptionError`. It must **never** return `{}` for an existing corrupt file.
3. **Directive 3: Pre-Persistence Cache Mutation Guard**  
   Reorder state mutations across all stores (`CompanyStateStore`, `CompanyKnowledgeStore`, `EpistemicClaimStore`):
   - **Step 1:** Validate schema and authority.
   - **Step 2:** Persist strictly to disk/database.
   - **Step 3:** Mutate in-memory cache **only after** persistence confirmation.
   - **Step 4:** If persistence fails, throw immediately with cache unmodified.
4. **Directive 4: Cross-Platform Test Runner & Child Process Standard**  
   Implement a shared test utility `spawnTestChild()` in `tests/helpers/child-runner.ts` using Node's standard `child_process.spawn`. Eliminate hardcoded `Bun.spawn` calls, ensuring that all restart durability tests execute reliably under both `npx tsx` and `bun` on Windows and Linux.
5. **Directive 5: Point-in-Time Backup & Restore Automation**  
   Deliver automated backup and restore scripts:
   - `scripts/backup-store.ts`: Flushes SQLite WAL, acquires file store read-lock quiescence, and creates a timestamped, checksum-verified tarball in `.backups/`.
   - `scripts/restore-store.ts`: Verifies checksums, validates collection initialization markers, and atomically restores state.

---

## 11. Implementation Batches with Acceptance Criteria

To ensure focused execution without destabilizing working code, M2 is structured into 4 sequential implementation batches:

### Batch 2.1 — Storage Reliability & Universal Lock Hygiene

**Scope:**
- Modify `src/lib/server/persistence/durable-file-store.ts`:
  - Make `failClosed: true` the default for all lock acquisitions.
  - Eliminate `strict: false` error-swallowing in `atomicWrite`.
  - Expand quarantine logic to all collections upon JSON parse failure.
  - Implement orphaned temp file cleanup on store initialization (`.tmp.*` older than 1 hour).
- Reorder cache updates in `CompanyStateStore`, `CompanyKnowledgeStore`, and `EpistemicClaimStore` so disk writes precede in-memory mutations.

**Acceptance Criteria:**
1. Simulated lock timeout on any collection throws `LockTimeoutError` and never proceeds un-serialized.
2. Corrupted JSON in `company_knowledge.json` or `conversations.json` is quarantined to `.corrupt.*` and throws `CriticalCollectionCorruptionError`; zero records are wiped out.
3. Injected disk write failure leaves in-memory stores 100% coherent with prior durable state.

---

### Batch 2.2 — Cross-Platform Child Test Runner & Restart Recovery

**Scope:**
- Create `tests/helpers/child-runner.ts` exporting `spawnTestChild()`.
- Standardize platform-safe temp directories (using `os.tmpdir()` instead of hardcoded `/tmp/`).
- Refactor `tests/sophia/m3_conversation_convergence.test.ts`, `tests/sophia/k2_personal_memory.test.ts`, and `tests/sophia/m2_knowledge_persistence.test.ts` to use `spawnTestChild()`.
- Filter or isolate child process `stdout` to prevent non-JSON logging collisions.

**Acceptance Criteria:**
1. `npx tsx tests/sophia/m3_conversation_convergence.test.ts` passes 14/14 scenarios without `ReferenceError: Bun is not defined`.
2. `npx tsx tests/sophia/k2_personal_memory.test.ts` passes all scenarios across process restarts.
3. `npx tsx tests/sophia/m2_knowledge_persistence.test.ts` passes all scenarios under Node.js and Bun on Windows.

---

### Batch 2.3 — Concurrency Safety & Multi-Store Transaction Hygiene

**Scope:**
- Implement transactional claim patterns in `InMemoryIdempotencyStore` and `InMemoryApprovalStore` using `withCollectionLockStrict()`.
- Harden `InstanceConcurrencyGuard` to fail closed if `STRICT_SINGLE_INSTANCE=true`.
- Add concurrency stress tests verifying that 20 parallel `ApprovalStore.consume()` calls result in exactly 1 successful consumption and 19 `ApprovalAlreadyConsumedError` rejections.

**Acceptance Criteria:**
1. Zero duplicate approval consumptions observed under high concurrency stress.
2. Zero duplicate idempotency claims observed for identical execution keys.

---

### Batch 2.4 — Backup, Restore, and Disaster Recovery Automation

**Scope:**
- Create `scripts/backup-store.ts`:
  - Quiesces file writes via lock acquisition.
  - Checkpoints SQLite database via `PRAGMA wal_checkpoint(TRUNCATE)`.
  - Archives `.data/` and database files into `.backups/samjuniors-backup-<timestamp>.tar.gz` with SHA-256 manifest.
- Create `scripts/restore-store.ts`:
  - Validates manifest SHA-256 hashes.
  - Atomically unpacks archive to temporary location before swapping into place.
- Implement comprehensive test suite: `tests/sophia/m2_backup_restore.test.ts`.

**Acceptance Criteria:**
1. Backup generated while concurrent writes are queued captures 100% consistent state.
2. Restoring a verified backup restores exact record counts across all collections.
3. Restoring a corrupted or tampered backup fails closed with checksum mismatch error.

---

## 12. Risks, Trade-offs, and Unresolved Questions

### 12.1 Operational Risks & Trade-Offs

1. **Risk: Increased Lock Contention Failures**  
   - *Impact:* Changing `failClosed` from `false` to `true` means that long-running operations or slow disk I/O will throw `LockTimeoutError` instead of logging and continuing.  
   - *Trade-off:* Failing closed causes an explicit request error, but completely prevents silent data corruption and split-brain states. Explicit errors can be retried; silent corruption cannot be undone.
2. **Risk: Windows File Locking Edge Cases**  
   - *Impact:* On Windows, deleting or renaming files while another process has an open handle can result in `EBUSY` or `EPERM`.  
   - *Mitigation:* Ensure all file descriptors in `DurableFileStore` are explicitly closed in `finally` blocks, and retry atomic renames with bounded backoff if `EBUSY` occurs.

### 12.2 Unresolved Architectural Questions for Founder Review

1. **Question 1 (Storage Primacy Alignment):**  
   `SophiaMemoryStore` (Personal Mind) and `ConversationStore` (Episodic Memory) are strictly file-primary (`.data/` is the sole source of truth; Prisma is an opportunistic mirror). However, `CompanyKnowledgeStore` and `EpistemicClaimStore` are dual-mode (Prisma is primary in authoritative mode; `.data/` is primary in local mode).  
   *Founder Decision Needed:* Should we preserve this asymmetry for v1, or should all stores eventually converge on a unified storage contract? (Recommendation: Preserve for v1; Personal Mind must remain founder-scoped and strictly isolated from public DB tables).
2. **Question 2 (Strict Single-Instance Enforcement in Production):**  
   Should `STRICT_SINGLE_INSTANCE` default to `true` in production (`NODE_ENV === 'production'`), causing the server process to refuse to boot if an active lease exists?  
   *Founder Decision Needed:* Approve setting `STRICT_SINGLE_INSTANCE=true` as the default in production to strictly prevent accidental multi-instance deployment.

---

## 13. Audit Verification Attestation

The findings in this audit document have been verified against the active working tree of `SamJuniorsOS` at HEAD `dd2c3c2bfb0bc5f9ea846dcd6a9410e7c840ff80`.

- **Working Tree Clean Prior to Batch 2.1:** Confirmed.
- **Verification Evidence:** Supported by line-by-line inspection of `src/lib/server/persistence/`, `src/lib/server/memory/`, `src/lib/server/sophia/`, `prisma/schema.prisma`, and executed test suites.

---

## 14. Milestone 2 Batch 2.1 Implementation & Verification Report

**Status:** IMPLEMENTED & VERIFIED  
**Scope:** Storage Reliability and Lock Hygiene  
**Test Suite:** `tests/sophia/m2_batch1_storage_reliability.test.ts` (27/27 PASSING)  
**Regression Suites:** M1 Suites (83/83 PASSING — 7 M1 Batch 1, 52 M1 Batch 2, 24 M1 Batch 3)  
**Total Verified Assertions:** 110/110 PASSING  

### 14.1 Exact Guarantees Established

1. **Fail-Closed Mutation Locking (Zero Fail-Open Paths):**
   - Eliminated lock-timeout fail-open behavior in `DurableFileStore`. `acquireLock` now strictly throws `LockTimeoutError` upon deadline expiry.
   - Every state-changing operation (`saveItem`, `saveItemStrict`, `writeCollection`, `writeCollectionStrict`, `deleteItem`, `deleteItemStrict`, `withCollectionLock`, `withCollectionLockStrict`) fails closed on timeout. No mutation can proceed without holding its exclusive lock.
   - Locks are released reliably via `finally` blocks in both normal return and exception paths.
   - Stale locks older than 10,000ms (`LOCK_STALE_MS`) are automatically broken and re-acquired without unbounded loops or deadlocks.
   - In-process re-entrancy depth tracking prevents internal deadlocks when nested stores execute atomic read-modify-write units.

2. **Universal Corruption Protection & Quarantine:**
   - Universalized corruption protection across all collections in `DurableFileStore.readCollection`.
   - Malformed JSON, truncated content, and empty files (0 bytes) are automatically quarantined to `<collection>.json.corrupt.<timestamp>.<pid>`, preserving exact corrupted bytes on disk.
   - Throws `CriticalCollectionCorruptionError` containing collection name, file path, and quarantine path.
   - Missing data files where an `.initialized` marker exists trigger `CriticalCollectionCorruptionError` rather than silently returning `{}`.
   - After quarantine, subsequent calls to `saveItem` or `writeCollection` fail closed with `CriticalCollectionCorruptionError`, strictly preventing subsequent writes from overwriting unrecovered evidence.
   - First-use initialization behavior is clearly defined: a non-existent file without an `.initialized` marker returns `{}` and creates the marker atomically on the first write.
   - Pre-existing legacy collections on disk without a marker are lazily initialized on first read/write, ensuring seamless backward compatibility without false corruption errors.

3. **Persistence Before Cache Mutation:**
   - In all dual-mode and local stores where disk is authoritative, mutations now strictly adhere to the authoritative ordering contract:
     1. Validate proposed state.
     2. Persist to disk successfully (`saveItemStrict` / `writeCollectionStrict`).
     3. Update in-memory cache / map.
     4. Return success.
   - Refactored stores:
     - `CompanyStateStore` (`setInitiatives`, `recordDecision`, `updateFinancialMetrics`)
     - `CompanyKnowledgeStore` (`addKnowledge`, `setKnowledge`)
     - `EpistemicClaimStore` (`saveSource`, `saveSignal`, `saveClaim`, `recordVerification`, `saveFact`, `markFactSuperseded`)
     - `InMemoryIdempotencyStore` (`claim`, `complete`, `fail`, `markUnknown`)
     - `InMemoryApprovalStore` (`save`, `decide`, `revoke`, `consume`)
     - `InMemoryAuditStore` (`record`)
     - `AgentRunStore` (`saveRun`)
     - `InMemoryWorkflowStore` (`saveDefinition`, `saveInstance`, `claimStepAtomic`, `transitionStepAtomic`)
   - Any failed disk write (e.g. disk full, permission denied, lock timeout, corruption) strictly halts execution before mutating in-memory cache. The in-memory cache never reports an uncommitted state as authoritative.

4. **Strict Error Propagation:**
   - Removed all `catch {}` silent error-swallowing blocks in authoritative persistence mutation paths.
   - Atomic temporary file writes (`atomicWrite`) unlink temporary files (`.tmp.*`) upon failure and re-throw write/rename errors (including `ENOSPC` and `EACCES`).
   - Store startup automatically sweeps orphaned temporary files older than 60 seconds.

### 14.2 Remaining Limitations & System Boundaries

1. **Single-Instance Deployment Constraint:**
   - File locks are cross-process on a single OS/container filesystem, but cannot synchronize across multiple distributed nodes or separate container instances.
   - The system boundary remains strictly `min-instances=1, max-instances=1` guarded by `InstanceConcurrencyGuard`. Distributed clustering remains out of scope.
2. **PostgreSQL Migration Out of Scope:**
   - Database operations in local mode continue using file-backed storage and SQLite port. No PostgreSQL infrastructure was added.
3. **Pending Batches:**
   - Batch 2.2 (Process Crash and Recovery), Batch 2.3 (Runner Consolidation), and Batch 2.4 (Disaster Recovery Automation) remain untouched, awaiting founder review.

---

## 15. Batch 2.1 — Final Lock Safety and Concurrency Review

### 15.1 Review Objective & Findings Classification

| Area / Investigation | Finding | Classification | Rationale & Evidence |
|---|---|---|---|
| **Stale Lock Breaking (Age-Only Unlinking)** | Can break active locks held > 10s by living processes | **VERIFIED DEFECT** | `breakStaleLock` checked only `stat.mtimeMs > 10,000ms`, ignoring owner PID. If an operation took > 10s, a contender unlinked the lock and acquired it, resulting in dual lock ownership. |
| **Owner Process Liveness Verification** | Owner process termination was unverified | **VERIFIED DEFECT** | `DurableFileStore` wrote PID to lock file, but `breakStaleLock` never read the PID or checked if the process was alive before unlinking. |
| **In-Process Re-Entrancy (`lockDepth`)** | Process-global Map shared across async contexts | **VERIFIED DEFECT** | `lockDepth` tracked depth per collection name globally on the class instance (`Map<string, number>`). Unrelated concurrent async calls in the same process bypassed locking. |
| **Async Callbacks in `withCollectionLock`** | Promises returned inside lock released prematurely | **VERIFIED DEFECT** | If a callback returned a Promise, `finally` executed synchronously at T=0, unlinking the lock file while the async body continued running unprotected. |
| **Temporary File Cleanup Safety** | Active writes protected from premature temp-file deletion | **VERIFIED SAFE** | Enhanced `cleanupOrphanedTempFiles` to verify whether the PID in `.tmp.<pid>.*` is actively running. Temp files of living processes are never deleted. |
| **Failed Write Data Protection** | Original data remains intact after failed writes | **VERIFIED SAFE** | Atomic rename write pattern writes to temp file first. If write or rename throws (e.g. `ENOSPC`), original file remains byte-for-byte unmodified. |

### 15.2 Minimal Safe Corrections Implemented

1. **Owner Process Liveness Check:**
   - Added `DurableFileStore.isProcessAlive(pid)` using `process.kill(pid, 0)`: returns normally if alive; throws `ESRCH` if terminated/dead; throws `EPERM` if alive (different user).
   - In `breakStaleLock`: parses the owner PID from the lock file. If the process is alive, **NEVER** breaks the lock, regardless of elapsed time. The contender waits up to `timeoutMs` and fails closed on timeout.
   - If the process is confirmed dead (`ESRCH`), the orphaned lock is safely unlinked immediately.
   - If the lock file is empty/unidentifiable (e.g., process crashed during creation before writing PID), it is protected when fresh (< 10s) and only broken when stale (> 10s).
2. **Execution-Context-Isolated Re-Entrancy:**
   - Replaced process-global `lockDepth` Map with `AsyncLocalStorage<Map<string, number>>`.
   - Nested synchronous calls within the same execution context inherit depth and execute without deadlocking.
   - Unrelated concurrent calls in separate execution contexts have isolated depth maps (0), preventing them from sharing or bypassing locks.
   - `executeWithLock` strictly detects and rejects Promise return values (`result && typeof result.then === 'function'`), throwing immediately to prevent holding synchronous locks across async gaps.
3. **PID-Tagged Temporary Files:**
   - Temporary write files are named `<collection>.json.tmp.${process.pid}.${Date.now()}.${random}`.
   - `cleanupOrphanedTempFiles` checks PID liveness: temp files belonging to running processes are never unlinked even if older than 60s. Orphaned temp files from dead processes are cleaned up.

### 15.3 Verification Results

- Dedicated test suite `tests/sophia/m2_batch1_lock_safety.test.ts`: **11/11 PASSED**.
- Comprehensive failure test suite `tests/sophia/m2_batch1_storage_reliability.test.ts`: **27/27 PASSED**.
- M1 regression test suites:
  - `tests/sophia/m1_batch1_memory_authority.test.ts`: **7/7 PASSED**.
  - `tests/sophia/m1_batch2_conversation_deletion.test.ts`: **52/52 PASSED**.
  - `tests/sophia/m1_batch3_verification_recovery.test.ts`: **24/24 PASSED**.
- Total: **121/121 automated tests passed**. Zero regressions.
