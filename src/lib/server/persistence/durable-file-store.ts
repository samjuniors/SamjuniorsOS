import fs from 'fs';
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
    this.dataDir = path.resolve(process.cwd(), '.data');
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch {
        // Fallback to /tmp if current working directory is read-only
        this.dataDir = path.resolve('/tmp', 'samjuniors-os-data');
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
   * On Windows and POSIX:
   *  - process.kill(pid, 0) returns normally if process exists and is alive.
   *  - throws ESRCH if process has terminated / does not exist.
   *  - throws EPERM if process exists but is owned by another user (alive).
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
        return false;
      }
      if (err?.code === 'EPERM') {
        return true;
      }
      return false;
    }
  }

  /** Parses the owner PID from lock file content (supports JSON format and plain PID). */
  private parseLockPid(content: string): number | null {
    const trimmed = content.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed?.pid === 'number' && Number.isInteger(parsed.pid) && parsed.pid > 0) {
          return parsed.pid;
        }
      } catch {}
    }
    const pid = parseInt(trimmed, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
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
   * Breaks a stale lock IF AND ONLY IF the owner process is confirmed dead.
   * NEVER breaks a lock held by a live process.
   */
  private breakStaleLock(lockPath: string): void {
    try {
      const stat = fs.statSync(lockPath);
      let content: string;
      try {
        content = fs.readFileSync(lockPath, 'utf-8');
      } catch {
        // Disappeared or being written — nothing to do
        return;
      }

      const ownerPid = this.parseLockPid(content);

      if (ownerPid !== null) {
        if (DurableFileStore.isProcessAlive(ownerPid)) {
          // Owner process is alive and actively running!
          // NEVER break a live lock, regardless of elapsed time.
          return;
        }
        // Owner process is confirmed dead (ESRCH).
        // It crashed or was terminated without releasing the lock file.
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // Raced with another recovering contender or release — nothing to do
        }
        return;
      }

      // Lock file exists but lacks a valid PID (e.g. created but empty/corrupt).
      // Only break if it has persisted unwritten for longer than LOCK_STALE_MS.
      if (Date.now() - stat.mtimeMs > DurableFileStore.LOCK_STALE_MS) {
        try {
          fs.unlinkSync(lockPath);
        } catch {}
      }
    } catch {
      // Lock disappeared or is not stat-able — nothing to break
    }
  }

  private acquirePhysicalLock(collection: string, timeoutMs: number = DurableFileStore.LOCK_TIMEOUT_MS): void {
    const lockPath = this.getLockPath(collection);
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      if (this.tryCreateLock(lockPath)) {
        return;
      }
      this.breakStaleLock(lockPath);
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
