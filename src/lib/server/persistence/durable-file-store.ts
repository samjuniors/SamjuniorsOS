import fs from 'fs';
import os from 'os';
import path from 'path';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Robust, atomic file-backed durable persistence engine for SamJuniorsOS.
 * Provides process-restart durability without external database dependencies.
 * Uses atomic rename write patterns and synchronous disk sync to guarantee
 * that state survives process termination, restarts, and crashes.
 *
 * M4-A HARDENING — CROSS-PROCESS READ-MODIFY-WRITE SERIALIZATION:
 * saveItem()/deleteItem() are read-modify-write cycles. Previously two
 * processes (e.g. dev server + capture pipeline child) executing them
 * concurrently could interleave reads and both write back their own view,
 * silently erasing the other writer's record while BOTH callers received
 * success (observed: 2/20 concurrent SophiaMemory writes silently lost).
 * The single-file write was already atomic; the RMW CYCLE was not.
 *
 * Every mutating operation now serializes on a per-collection LOCK FILE
 * (`<collection>.json.lock`) acquired with O_EXCL (`wx`) creation, which is
 * atomic across processes on POSIX. While waiting, contenders sleep with
 * Atomics.wait (no busy spin) and re-try. A holder that crashed leaves a
 * stale lock; stale locks older than LOCK_STALE_MS are broken (unlinked) by
 * the next contender. If a lock cannot be acquired within LOCK_TIMEOUT_MS,
 * the operation proceeds WITHOUT the lock and logs loudly — persistence is
 * never blocked forever, exactly like before the fix (best-effort lock).
 *
 * The same primitive is exposed as withCollectionLock() so higher-level
 * stores can serialize a LARGER read-check-write unit (e.g. SophiaMemory
 * createMemory's idempotency check + save) atomically. It is RE-ENTRANT
 * within a process (a depth counter per collection), so a locked section
 * may call saveItem()/deleteItem()/writeCollection() freely.
 */
export class LockTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockTimeoutError';
  }
}

export class CriticalCollectionCorruptionError extends Error {
  public readonly collection: string;
  public readonly filePath: string;
  public readonly quarantinePath?: string;

  constructor(args: { collection: string; filePath: string; message: string; quarantinePath?: string; cause?: unknown }) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause });
    this.name = 'CriticalCollectionCorruptionError';
    this.collection = args.collection;
    this.filePath = args.filePath;
    this.quarantinePath = args.quarantinePath;
  }
}

export interface RecoveryGateInfo {
  pid: number | null;
  gateId: string | null;
  createdAt: number | null;
  raw: string;
  mtimeMs: number;
  size: number;
}

export interface ActiveRecoveryGate {
  path: string;
  gateId: string;
}

export class DurableFileStore {
  private static instance: DurableFileStore;
  private dataDir: string;

  /** Cross-process lock tuning. */
  private static readonly LOCK_POLL_MS = 5;
  private static readonly LOCK_STALE_MS = 10_000;
  private static readonly LOCK_TIMEOUT_MS = 30_000;

  /** Execution-context-isolated lock depth tracking. */
  private readonly asyncLocalStorage = new AsyncLocalStorage<Map<string, number>>();

  private constructor() {
    const testRepoRoot = process.env.SAMJUNIORS_TEST_REPO_ROOT;
    const isTestRunnerRepoCwd = !!testRepoRoot && path.resolve(process.cwd()) === path.resolve(testRepoRoot);
    const testDataDir = isTestRunnerRepoCwd ? process.env.SAMJUNIORS_TEST_DATA_DIR : undefined;
    this.dataDir = path.resolve(testDataDir || path.join(process.cwd(), '.data'));
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch {
        // Fallback to OS temp directory if current working directory is read-only
        this.dataDir = path.resolve(os.tmpdir(), 'samjuniors-os-data');
        if (!fs.existsSync(this.dataDir)) {
          fs.mkdirSync(this.dataDir, { recursive: true });
        }
      }
    }
    this.cleanupOrphanedTempFiles();
  }

  /** Cleans up orphaned temporary files left by abruptly terminated processes. */
  public cleanupOrphanedTempFiles(): void {
    try {
      if (!fs.existsSync(this.dataDir)) return;
      const entries = fs.readdirSync(this.dataDir);
      const now = Date.now();
      for (const entry of entries) {
        if (entry.includes('.tmp.')) {
          const fullPath = path.join(this.dataDir, entry);
          try {
            const stat = fs.statSync(fullPath);
            // Parse PID from temp file format: <prefix>.tmp.<pid>.<timestamp>.<random>
            const tmpIdx = entry.indexOf('.tmp.');
            const afterTmp = entry.substring(tmpIdx + 5);
            const pidStr = afterTmp.split('.')[0];
            const pid = pidStr ? parseInt(pidStr, 10) : NaN;

            if (Number.isInteger(pid) && pid > 0) {
              if (DurableFileStore.isProcessAlive(pid)) {
                // Creator process is still actively running. Never delete its active temp file!
                continue;
              }
              // Creator process is confirmed dead. Safe to unlink orphaned temp file.
              fs.unlinkSync(fullPath);
              continue;
            }

            // Fallback for legacy or un-parseable temp files: delete only if older than 60s
            if (now - stat.mtimeMs > 60_000) {
              fs.unlinkSync(fullPath);
            }
          } catch {}
        }
      }
    } catch {}
  }

  public static getInstance(): DurableFileStore {
    if (!DurableFileStore.instance) {
      DurableFileStore.instance = new DurableFileStore();
    }
    return DurableFileStore.instance;
  }

  public static resetInstance(): void {
    (DurableFileStore as any).instance = undefined;
  }

  public getDataDir(): string {
    return this.dataDir;
  }

  private getCollectionPath(collection: string): string {
    const sanitized = collection.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${sanitized}.json`);
  }

  private getLockPath(collection: string): string {
    const sanitized = collection.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${sanitized}.json.lock`);
  }

  private getRecoveryPath(collection: string): string {
    const sanitized = collection.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${sanitized}.json.recovery`);
  }

  /**
   * These ledgers are security/governance barriers. An unreadable ledger must
   * never be interpreted as empty because doing so can resurrect deleted data.
   */
  private isCriticalCollection(collection: string): boolean {
    return collection === 'conversation_tombstones' || collection === 'message_tombstones';
  }

  private getCriticalMarkerPath(collection: string): string {
    return `${this.getCollectionPath(collection)}.initialized`;
  }

  private markCriticalCollectionInitialized(collection: string): void {
    const markerPath = this.getCriticalMarkerPath(collection);
    let fd: number | undefined;
    try {
      fd = fs.openSync(markerPath, 'wx', 0o600);
      fs.writeSync(fd, `initialized ${new Date().toISOString()}\n`);
      fs.fsyncSync(fd);
    } catch (err: any) {
      if (err?.code !== 'EEXIST') {
        throw new CriticalCollectionCorruptionError({
          collection,
          filePath: this.getCollectionPath(collection),
          message: `Unable to persist initialization marker for critical collection "${collection}".`,
          cause: err,
        });
      }
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch { /* best-effort close after fsync */ }
      }
    }
  }

  private quarantineCriticalCollection(collection: string, filePath: string, reason: string, cause?: unknown): never {
    const quarantinePath = `${filePath}.corrupt.${Date.now()}.${process.pid}`;
    try {
      fs.renameSync(filePath, quarantinePath);
      throw new CriticalCollectionCorruptionError({
        collection,
        filePath,
        quarantinePath,
        message: `Critical collection "${collection}" is corrupt (${reason}); original file quarantined at "${quarantinePath}". Restore/reconcile it before serving traffic.`,
        cause,
      });
    } catch (err: any) {
      if (err instanceof CriticalCollectionCorruptionError) throw err;
      throw new CriticalCollectionCorruptionError({
        collection,
        filePath,
        message: `Critical collection "${collection}" is corrupt (${reason}) and quarantine failed. Refusing to continue.`,
        cause: err ?? cause,
      });
    }
  }

  private readCriticalCollection<T>(collection: string): Record<string, T> {
    return this.readCollection<T>(collection);
  }

  /** Synchronous bounded sleep (Atomics.wait blocks the thread without spinning). */
  private static sleepMs(ms: number): void {
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    } catch {
      // Environments without Atomics.wait: fall back to a busy wait.
      const until = Date.now() + ms;
      while (Date.now() < until) {
        /* spin */
      }
    }
  }

  /**
   * Helper to verify if a process with the specified PID is actively running.
   *
   * STRICT FAIL-CLOSED SEMANTICS:
   *  - Returns true if the process exists and is alive (no error).
   *  - Returns true if process.kill throws EPERM (process exists, different user).
   *  - Returns false ONLY on confirmed ESRCH (operating system confirms process does not exist).
   *  - Fails closed (returns true) on any unexpected error; unexpected errors
   *    must NEVER authorize lock deletion.
   *  - Non-positive or non-integer PIDs return false (invalid PID).
   */
  public static isProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
      return false;
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      if (err?.code === 'ESRCH') {
        // ESRCH: No such process — the ONLY confirmed signal of process termination
        return false;
      }
      if (err?.code === 'EPERM') {
        // EPERM: Process exists, owned by another user — potentially alive
        return true;
      }
      // Fail closed on any unexpected OS error: treat as potentially alive
      return true;
    }
  }

  /**
   * Inspects the current lock file on disk and extracts its ownership metadata.
   */
  public inspectLockFile(lockPath: string): {
    pid: number | null;
    lockId: string | null;
    createdAt: number | null;
    raw: string;
    mtimeMs: number;
  } | null {
    try {
      const stat = fs.statSync(lockPath);
      let raw: string;
      try {
        raw = fs.readFileSync(lockPath, 'utf-8');
      } catch {
        return null;
      }
      const trimmed = raw.trim();
      let pid: number | null = null;
      let lockId: string | null = null;
      let createdAt: number | null = null;

      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (typeof parsed?.pid === 'number' && Number.isInteger(parsed.pid) && parsed.pid > 0) {
            pid = parsed.pid;
          }
          if (typeof parsed?.lockId === 'string' && parsed.lockId.trim()) {
            lockId = parsed.lockId.trim();
          }
          if (typeof parsed?.createdAt === 'number' && Number.isFinite(parsed.createdAt)) {
            createdAt = parsed.createdAt;
          }
        } catch {}
      } else if (trimmed) {
        const parsed = parseInt(trimmed, 10);
        if (Number.isInteger(parsed) && parsed > 0) {
          pid = parsed;
        }
      }

      return { pid, lockId, createdAt, raw, mtimeMs: stat.mtimeMs };
    } catch {
      return null;
    }
  }

  /**
   * Tries once to create the lock file exclusively (O_EXCL). Returns true
   * when this process now OWNS the lock file.
   */
  private tryCreateLock(lockPath: string): boolean {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      const payload = JSON.stringify({
        pid: process.pid,
        createdAt: Date.now(),
        lockId: `${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2, 9)}`,
      });
      fs.writeSync(fd, `${payload}\n`);
      fs.closeSync(fd);
      return true;
    } catch (err: any) {
      if (err?.code === 'EEXIST') return false;
      throw err; // unexpected FS error (permissions etc.) — surface to caller
    }
  }

  /**
   * Safely removes an orphaned lock file IF AND ONLY IF the file on disk
   * is confirmed to be the exact instance originally inspected.
   *
   * Accepts an optional `onBeforeUnlink` callback to allow deterministic
   * regression testing of post-validation race windows.
   */
  public safeUnlinkStaleLock(
    lockPath: string,
    expected: {
      pid: number | null;
      lockId: string | null;
      createdAt: number | null;
      raw: string;
      mtimeMs: number;
    },
    onBeforeUnlink?: () => void
  ): boolean {
    try {
      // Re-read current lock file immediately before unlinking
      const current = this.inspectLockFile(lockPath);
      if (!current) {
        // Already removed by another process — safe no-op
        return false;
      }

      // Check whether current lock matches the inspected dead lock instance
      let matches = false;
      if (expected.lockId && current.lockId) {
        matches = expected.lockId === current.lockId;
      } else {
        matches = expected.raw.trim() === current.raw.trim();
      }

      if (!matches) {
        // The lock file on disk is NO LONGER the inspected dead lock!
        // A contender already recovered the lock and created a new live lock instance.
        // Refuse to delete the new lock file.
        return false;
      }

      // Additional defense-in-depth: if current PID is alive, NEVER unlink
      if (current.pid !== null && DurableFileStore.isProcessAlive(current.pid)) {
        return false;
      }

      // Hook invoked immediately before unlinking for deterministic race testing
      if (onBeforeUnlink) {
        onBeforeUnlink();

        // Post-validation re-check: verify lock was not replaced during the hook/preemption window
        const postCheck = this.inspectLockFile(lockPath);
        if (!postCheck) {
          return false;
        }
        let postMatches = false;
        if (expected.lockId && postCheck.lockId) {
          postMatches = expected.lockId === postCheck.lockId;
        } else {
          postMatches = expected.raw.trim() === postCheck.raw.trim();
        }
        if (!postMatches) {
          return false;
        }
        if (postCheck.pid !== null && DurableFileStore.isProcessAlive(postCheck.pid)) {
          return false;
        }
      }

      fs.unlinkSync(lockPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Inspects a recovery gate file on disk and extracts its ownership metadata.
   */
  public inspectRecoveryGate(recoveryPath: string): RecoveryGateInfo | null {
    try {
      const stat = fs.statSync(recoveryPath);
      let raw: string;
      try {
        raw = fs.readFileSync(recoveryPath, 'utf-8');
      } catch {
        return null;
      }
      const trimmed = raw.trim();
      let pid: number | null = null;
      let gateId: string | null = null;
      let createdAt: number | null = null;

      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (typeof parsed?.pid === 'number' && Number.isInteger(parsed.pid) && parsed.pid > 0) {
            pid = parsed.pid;
          }
          if (typeof parsed?.gateId === 'string' && parsed.gateId.trim()) {
            gateId = parsed.gateId.trim();
          }
          if (typeof parsed?.createdAt === 'number' && Number.isFinite(parsed.createdAt)) {
            createdAt = parsed.createdAt;
          }
        } catch {}
      } else if (trimmed) {
        const parsed = parseInt(trimmed, 10);
        if (Number.isInteger(parsed) && parsed > 0) {
          pid = parsed;
        }
      }

      return { pid, gateId, createdAt, raw, mtimeMs: stat.mtimeMs, size: stat.size };
    } catch {
      return null;
    }
  }

  /**
   * Safely removes an orphaned recovery gate IF AND ONLY IF the file on disk
   * is confirmed to be the exact instance originally inspected.
   *
   * Accepts an optional `onBeforeUnlink` callback for deterministic TOCTOU race testing.
   */
  public safeUnlinkRecoveryGate(
    recoveryPath: string,
    expected: RecoveryGateInfo,
    onBeforeUnlink?: () => void
  ): boolean {
    try {
      const current = this.inspectRecoveryGate(recoveryPath);
      if (!current) {
        return false;
      }

      let matches = false;
      if (expected.gateId && current.gateId) {
        matches = expected.gateId === current.gateId;
      } else if (expected.size === 0 && current.size === 0) {
        matches = true;
      } else {
        matches = expected.raw.trim() === current.raw.trim();
      }

      if (!matches) {
        return false;
      }

      if (current.pid !== null && DurableFileStore.isProcessAlive(current.pid)) {
        return false;
      }

      if (onBeforeUnlink) {
        onBeforeUnlink();
        const postCheck = this.inspectRecoveryGate(recoveryPath);
        if (!postCheck) return false;
        let postMatches = false;
        if (expected.gateId && postCheck.gateId) {
          postMatches = expected.gateId === postCheck.gateId;
        } else if (expected.size === 0 && postCheck.size === 0) {
          postMatches = true;
        } else {
          postMatches = expected.raw.trim() === postCheck.raw.trim();
        }
        if (!postMatches) return false;
        if (postCheck.pid !== null && DurableFileStore.isProcessAlive(postCheck.pid)) {
          return false;
        }
      }

      fs.unlinkSync(recoveryPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reclaims an abandoned recovery gate IF AND ONLY IF:
   * 1. Owner PID is confirmed dead (ESRCH), OR
   * 2. Gate was created unwritten (0 bytes / null PID) and persisted longer than LOCK_STALE_MS.
   */
  public reclaimStaleRecoveryGate(recoveryPath: string, onBeforeUnlink?: () => void): boolean {
    const inspected = this.inspectRecoveryGate(recoveryPath);
    if (!inspected) {
      return false;
    }

    if (inspected.pid !== null) {
      if (DurableFileStore.isProcessAlive(inspected.pid)) {
        return false;
      }
      return this.safeUnlinkRecoveryGate(recoveryPath, inspected, onBeforeUnlink);
    }

    // Gate exists without valid PID (paused/crashed between openSync and writeSync)
    // Only reclaim if unwritten and persisted longer than LOCK_STALE_MS
    if (Date.now() - inspected.mtimeMs > DurableFileStore.LOCK_STALE_MS) {
      return this.safeUnlinkRecoveryGate(recoveryPath, inspected, onBeforeUnlink);
    }

    return false;
  }

  /**
   * Acquires an atomic recovery gate (<collection>.json.recovery) using OS O_CREAT | O_EXCL.
   * Serializes stale-lock recovery operations across processes so that only one process
   * performs recovery on a collection at any given time.
   */
  public acquireRecoveryGate(collection: string): ActiveRecoveryGate | null {
    const recoveryPath = this.getRecoveryPath(collection);
    const gateId = `${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2, 9)}`;
    try {
      const fd = fs.openSync(recoveryPath, 'wx');
      const payload = JSON.stringify({
        pid: process.pid,
        createdAt: Date.now(),
        gateId,
      });
      fs.writeSync(fd, `${payload}\n`);
      fs.closeSync(fd);
      return { path: recoveryPath, gateId };
    } catch (err: any) {
      if (err?.code === 'EEXIST') {
        // Recovery gate already exists. Attempt to reclaim if abandoned.
        this.reclaimStaleRecoveryGate(recoveryPath);
        return null;
      }
      return null;
    }
  }

  /**
   * Releases the recovery gate IF AND ONLY IF the file on disk still belongs to this gate.
   */
  public releaseRecoveryGate(gate: ActiveRecoveryGate | string): void {
    const recoveryPath = typeof gate === 'string' ? gate : gate.path;
    const expectedGateId = typeof gate === 'string' ? null : gate.gateId;
    try {
      if (expectedGateId) {
        const current = this.inspectRecoveryGate(recoveryPath);
        if (!current || current.gateId !== expectedGateId) {
          // Gate on disk is not ours (replaced or already removed) — do NOT unlink!
          return;
        }
      }
      fs.unlinkSync(recoveryPath);
    } catch {
      // safe no-op if already unlinked
    }
  }

  /**
   * Breaks a stale lock IF AND ONLY IF the owner process is confirmed dead.
   * NEVER breaks a lock held by a live process.
   * Serializes recovery attempts via the atomic recovery gate.
   * Verifies that the file being removed is still the exact lock instance inspected.
   */
  public breakStaleLock(lockPath: string, collection?: string): boolean {
    let gate: ActiveRecoveryGate | null = null;
    if (collection) {
      gate = this.acquireRecoveryGate(collection);
      if (!gate) {
        // Another process is actively performing recovery; yield to it
        return false;
      }
    }

    try {
      const inspected = this.inspectLockFile(lockPath);
      if (!inspected) {
        // Lock disappeared or is not stat-able — nothing to break
        return false;
      }

      if (inspected.pid !== null) {
        if (DurableFileStore.isProcessAlive(inspected.pid)) {
          // Owner process is alive and actively running!
          // NEVER break a live lock, regardless of elapsed time.
          return false;
        }

        // Owner process is confirmed dead (ESRCH).
        // Safely unlink ONLY if the file on disk is still the exact instance inspected.
        return this.safeUnlinkStaleLock(lockPath, inspected);
      }

      // Lock file exists but lacks a valid PID (e.g. created but empty/corrupt).
      // Only break if it has persisted unwritten for longer than LOCK_STALE_MS.
      if (Date.now() - inspected.mtimeMs > DurableFileStore.LOCK_STALE_MS) {
        return this.safeUnlinkStaleLock(lockPath, inspected);
      }

      return false;
    } finally {
      if (gate) {
        this.releaseRecoveryGate(gate);
      }
    }
  }

  private acquirePhysicalLock(collection: string, timeoutMs: number = DurableFileStore.LOCK_TIMEOUT_MS): void {
    const lockPath = this.getLockPath(collection);
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      if (this.tryCreateLock(lockPath)) {
        return;
      }
      this.breakStaleLock(lockPath, collection);
      if (Date.now() > deadline) {
        throw new LockTimeoutError(
          `[DurableFileStore] Failed to acquire lock for "${collection}" within ${timeoutMs}ms (fail-closed)`
        );
      }
      DurableFileStore.sleepMs(DurableFileStore.LOCK_POLL_MS);
    }
  }

  private releasePhysicalLock(collection: string): void {
    try {
      fs.unlinkSync(this.getLockPath(collection));
    } catch {
      // already removed or raced — nothing to do
    }
  }

  /**
   * Acquires the per-collection cross-process lock (re-entrant within same execution context).
   */
  private acquireLock(
    collection: string,
    failClosed: boolean = true,
    timeoutMs: number = DurableFileStore.LOCK_TIMEOUT_MS
  ): void {
    const store = this.asyncLocalStorage.getStore();
    const depth = store?.get(collection) ?? 0;
    if (depth > 0) {
      store!.set(collection, depth + 1);
      return;
    }
    this.acquirePhysicalLock(collection, timeoutMs);
    if (store) {
      store.set(collection, 1);
    } else {
      const newStore = new Map<string, number>([[collection, 1]]);
      this.asyncLocalStorage.enterWith(newStore);
    }
  }

  /** Releases one level of the per-collection lock. */
  private releaseLock(collection: string): void {
    const store = this.asyncLocalStorage.getStore();
    const depth = store?.get(collection) ?? 0;
    if (depth <= 1) {
      if (store) {
        store.delete(collection);
      }
      this.releasePhysicalLock(collection);
    } else {
      store?.set(collection, depth - 1);
    }
  }

  /**
   * Executes a callback within a per-collection cross-process lock.
   * Execution-context isolated: re-entrant within the SAME asynchronous execution context,
   * but isolated across unrelated asynchronous execution contexts in the same process.
   * Strictly forbids returning Promises: holding a synchronous lock across async gaps is prohibited.
   */
  private executeWithLock<T>(
    collection: string,
    fn: () => T,
    timeoutMs: number = DurableFileStore.LOCK_TIMEOUT_MS
  ): T {
    const currentStore = this.asyncLocalStorage.getStore();
    const currentDepth = currentStore?.get(collection) ?? 0;

    if (currentDepth > 0) {
      // Re-entrant acquisition within the SAME async context
      currentStore!.set(collection, currentDepth + 1);
      try {
        const result = fn();
        if (result && typeof (result as any).then === 'function') {
          throw new Error(
            `[DurableFileStore] withCollectionLock callback returned a Promise. ` +
            `Holding a synchronous collection lock across asynchronous operations is unsafe and prohibited.`
          );
        }
        return result;
      } finally {
        currentStore!.set(collection, currentDepth);
      }
    }

    // New acquisition: acquire physical lock file on disk
    this.acquirePhysicalLock(collection, timeoutMs);
    const newStore = new Map(currentStore ?? []);
    newStore.set(collection, 1);

    return this.asyncLocalStorage.run(newStore, () => {
      try {
        const result = fn();
        if (result && typeof (result as any).then === 'function') {
          throw new Error(
            `[DurableFileStore] withCollectionLock callback returned a Promise. ` +
            `Holding a synchronous collection lock across asynchronous operations is unsafe and prohibited.`
          );
        }
        return result;
      } finally {
        this.releasePhysicalLock(collection);
      }
    });
  }

  /**
   * Serializes an arbitrary read-modify-write unit on the collection's
   * cross-process lock. RE-ENTRANT within the same execution context.
   * fn must be SYNCHRONOUS. Fails closed with LockTimeoutError on timeout.
   */
  public withCollectionLock<T>(
    collection: string,
    fn: () => T,
    timeoutMs: number = DurableFileStore.LOCK_TIMEOUT_MS
  ): T {
    if (this.isCriticalCollection(collection)) {
      throw new Error(`Critical collection "${collection}" requires withCollectionLockStrict().`);
    }
    return this.executeWithLock(collection, fn, timeoutMs);
  }

  /**
   * FAIL-CLOSED variant of withCollectionLock:
   * Throws LockTimeoutError if the collection lock cannot be acquired within
   * timeoutMs. Used for critical deletion and message-write serialization.
   */
  public withCollectionLockStrict<T>(
    collection: string,
    fn: () => T,
    timeoutMs: number = DurableFileStore.LOCK_TIMEOUT_MS
  ): T {
    return this.executeWithLock(collection, fn, timeoutMs);
  }

  /**
   * Reads all items from a collection on disk.
   *
   * M2 BATCH 2.1 HARDENING — UNIVERSAL CORRUPTION & QUARANTINE PROTECTION:
   *  - First-use: if neither data file nor initialization marker exists, returns {}.
   *  - Marker check: if data file is missing but marker exists (e.g. unrecovered quarantine),
   *    fails closed with CriticalCollectionCorruptionError.
   *  - Malformed content: if file cannot be read, is empty, or contains invalid JSON / non-object,
   *    the file is quarantined to <collection>.json.corrupt.<timestamp>.<pid> and
   *    CriticalCollectionCorruptionError is thrown. Original corrupted bytes are preserved.
   *    Subsequent writes cannot silently overwrite unrecovered data.
   */
  public readCollection<T>(collection: string): Record<string, T> {
    const filePath = this.getCollectionPath(collection);
    const markerPath = this.getCriticalMarkerPath(collection);

    if (!fs.existsSync(filePath)) {
      if (fs.existsSync(markerPath)) {
        throw new CriticalCollectionCorruptionError({
          collection,
          filePath,
          message: `Critical collection "${collection}" is missing although its initialization marker exists. Refusing to treat it as empty.`,
        });
      }
      // First-use state only. The marker is created before the first durable write.
      return {};
    }

    // A pre-existing file proves this ledger has been initialized. Persist the
    // marker before parsing so quarantine cannot make it look like first-use.
    this.markCriticalCollectionInitialized(collection);

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      this.quarantineCriticalCollection(collection, filePath, 'file read failed', err);
    }

    if (!content!.trim()) {
      this.quarantineCriticalCollection(collection, filePath, 'file is empty');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content!);
    } catch (err) {
      this.quarantineCriticalCollection(collection, filePath, 'invalid JSON', err);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.quarantineCriticalCollection(collection, filePath, 'expected a JSON object');
    }

    this.markCriticalCollectionInitialized(collection);
    return parsed as Record<string, T>;
  }

  /**
   * Extracted atomic-write core.
   * M2 BATCH 2.1 HARDENING: Re-throws persistence failures so callers can distinguish
   * durable success from swallowed loss. ENOSPC and permission errors are never swallowed.
   */
  private atomicWrite<T>(collection: string, data: Record<string, T>, strict: boolean = true): void {
    const filePath = this.getCollectionPath(collection);
    const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;

    try {
      const serialized = JSON.stringify(data, null, 2);
      fs.writeFileSync(tempPath, serialized, 'utf-8');
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore cleanup errors
        }
      }
      if (strict) {
        throw err;
      }
      console.error(`[DurableFileStore] Failed to atomically persist collection "${collection}":`, err);
      throw err;
    }
  }
  /**
   * Atomically writes an entire collection to disk using temp-file and atomic rename.
   * Serialized on the per-collection cross-process lock.
   * M2 BATCH 2.1 HARDENING: Validates existing ledger, fails closed on lock timeout,
   * and propagates write errors strictly.
   */
  public writeCollection<T>(collection: string, data: Record<string, T>, options?: { timeoutMs?: number }): void {
    if (this.isCriticalCollection(collection)) {
      throw new Error(`Critical collection "${collection}" requires writeCollectionStrict().`);
    }
    const timeoutMs = options?.timeoutMs ?? DurableFileStore.LOCK_TIMEOUT_MS;
    this.acquireLock(collection, true, timeoutMs);
    try {
      this.readCollection(collection);
      this.markCriticalCollectionInitialized(collection);
      this.atomicWrite(collection, data, true);
    } finally {
      this.releaseLock(collection);
    }
  }

  /**
   * STRICT variant: identical locking and atomicity to writeCollection, but
   * allowed on critical collections (tombstones). Validates an existing critical
   * ledger before allowing full replacement so unrecovered corruption cannot be overwritten.
   */
  public writeCollectionStrict<T>(
    collection: string,
    data: Record<string, T>,
    options?: { lockStrict?: boolean; timeoutMs?: number }
  ): void {
    const timeoutMs = options?.timeoutMs ?? DurableFileStore.LOCK_TIMEOUT_MS;
    this.acquireLock(collection, true, timeoutMs);
    try {
      // Validate an existing ledger before allowing full replacement.
      this.readCollection(collection);
      this.markCriticalCollectionInitialized(collection);
      this.atomicWrite(collection, data, true);
    } finally {
      this.releaseLock(collection);
    }
  }

  /**
   * Saves a single entity into the collection.
   * Cross-process serialized read-modify-write.
   * M2 BATCH 2.1 HARDENING: Fails closed on lock timeout, verifies collection
   * is not corrupt/quarantined, and strictly propagates write failures.
   */
  public saveItem<T>(collection: string, id: string, item: T, options?: { timeoutMs?: number }): void {
    if (this.isCriticalCollection(collection)) {
      throw new Error(`Critical collection "${collection}" requires saveItemStrict().`);
    }
    const timeoutMs = options?.timeoutMs ?? DurableFileStore.LOCK_TIMEOUT_MS;
    this.acquireLock(collection, true, timeoutMs);
    try {
      const current = this.readCollection<T>(collection);
      this.markCriticalCollectionInitialized(collection);
      current[id] = JSON.parse(JSON.stringify(item));
      this.atomicWrite(collection, current, true);
    } finally {
      this.releaseLock(collection);
    }
  }

  /**
   * STRICT variant: locked read-modify-write that THROWS when the authoritative write fails.
   * Used for critical collections and explicit strict-mode callers.
   */
  public saveItemStrict<T>(
    collection: string,
    id: string,
    item: T,
    options?: { lockStrict?: boolean; timeoutMs?: number }
  ): void {
    const timeoutMs = options?.timeoutMs ?? DurableFileStore.LOCK_TIMEOUT_MS;
    this.acquireLock(collection, true, timeoutMs);
    try {
      const current = this.readCollection<T>(collection);
      this.markCriticalCollectionInitialized(collection);
      current[id] = JSON.parse(JSON.stringify(item));
      this.atomicWrite(collection, current, true);
    } finally {
      this.releaseLock(collection);
    }
  }

  /**
   * Retrieves a single entity from disk.
   */
  public getItem<T>(collection: string, id: string): T | null {
    const current = this.readCollection<T>(collection);
    return current[id] !== undefined ? current[id] : null;
  }

  /**
   * Deletes a single entity from disk.
   * Cross-process serialized read-modify-write.
   * M2 BATCH 2.1 HARDENING: Fails closed on lock timeout and propagates write failures strictly.
   */
  public deleteItem(collection: string, id: string, options?: { timeoutMs?: number }): void {
    if (this.isCriticalCollection(collection)) {
      throw new Error(`Critical collection "${collection}" requires deleteItemStrict().`);
    }
    const timeoutMs = options?.timeoutMs ?? DurableFileStore.LOCK_TIMEOUT_MS;
    this.acquireLock(collection, true, timeoutMs);
    try {
      const current = this.readCollection(collection);
      if (current[id] !== undefined) {
        delete current[id];
        this.markCriticalCollectionInitialized(collection);
        this.atomicWrite(collection, current, true);
      }
    } finally {
      this.releaseLock(collection);
    }
  }

  /**
   * STRICT variant: locked read-check-delete that THROWS when the authoritative delete-write fails.
   */
  public deleteItemStrict(
    collection: string,
    id: string,
    options?: { lockStrict?: boolean; timeoutMs?: number }
  ): boolean {
    const timeoutMs = options?.timeoutMs ?? DurableFileStore.LOCK_TIMEOUT_MS;
    this.acquireLock(collection, true, timeoutMs);
    try {
      const current = this.readCollection(collection);
      if (current[id] === undefined) {
        return false;
      }
      this.markCriticalCollectionInitialized(collection);
      delete current[id];
      this.atomicWrite(collection, current, true);
      return true;
    } finally {
      this.releaseLock(collection);
    }
  }

  /**
   * Clears a collection on disk.
   */
  public clearCollection(collection: string): void {
    if (this.isCriticalCollection(collection)) {
      throw new Error(`Critical collection "${collection}" cannot be cleared through clearCollection(). Use the explicit recovery procedure.`);
    }
    const filePath = this.getCollectionPath(collection);
    const markerPath = this.getCriticalMarkerPath(collection);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        this.writeCollection(collection, {});
      }
    }
    if (fs.existsSync(markerPath)) {
      try {
        fs.unlinkSync(markerPath);
      } catch {}
    }
  }
}
