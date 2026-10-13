import fs from 'fs';
import path from 'path';

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

  /** Per-collection re-entrancy depth for THIS process (0 = not held). */
  private readonly lockDepth = new Map<string, number>();

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
    if (!this.isCriticalCollection(collection)) return;
    const markerPath = this.getCriticalMarkerPath(collection);
    let fd: number | undefined;
    try {
      fd = fs.openSync(markerPath, 'wx', 0o600);
      fs.writeSync(fd, `initialized ${new Date().toISOString()}\\n`);
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
   * Tries once to create the lock file exclusively (O_EXCL). Returns true
   * when this process now OWNS the lock file.
   */
  private tryCreateLock(lockPath: string): boolean {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      return true;
    } catch (err: any) {
      if (err?.code === 'EEXIST') return false;
      throw err; // unexpected FS error (permissions etc.) — surface to caller
    }
  }

  /** Breaks a stale lock (holder crashed or is stuck beyond LOCK_STALE_MS). */
  private breakStaleLock(lockPath: string): void {
    try {
      const stat = fs.statSync(lockPath);
      if (Date.now() - stat.mtimeMs > DurableFileStore.LOCK_STALE_MS) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      // lock disappeared or is not stat-able — nothing to break
    }
  }

  /**
   * Acquires the per-collection cross-process lock (re-entrant in-process).
   * When `failClosed` is true, throws LockTimeoutError if the lock cannot be
   * acquired within `timeoutMs`, guaranteeing that critical operations never proceed
   * without serialization. When `failClosed` is false (legacy default), proceeds
   * without the lock after timeout and logs loudly.
   */
  private acquireLock(
    collection: string,
    failClosed: boolean = false,
    timeoutMs: number = DurableFileStore.LOCK_TIMEOUT_MS
  ): void {
    const depth = this.lockDepth.get(collection) ?? 0;
    if (depth > 0) {
      this.lockDepth.set(collection, depth + 1);
      return; // already held by this process — re-entrant
    }

    const lockPath = this.getLockPath(collection);
    const deadline = Date.now() + timeoutMs;
    let warned = false;

    for (;;) {
      if (this.tryCreateLock(lockPath)) {
        this.lockDepth.set(collection, 1);
        return;
      }
      this.breakStaleLock(lockPath);
      if (Date.now() > deadline) {
        if (failClosed) {
          throw new LockTimeoutError(
            `[DurableFileStore] Failed to acquire lock for "${collection}" within ${timeoutMs}ms (fail-closed)`
          );
        }
        if (!warned) {
          console.error(
            `[DurableFileStore] Could not acquire lock for "${collection}" within ` +
              `${timeoutMs}ms — proceeding WITHOUT the lock ` +
              `(concurrent read-modify-write protection is degraded for this write).`
          );
          warned = true;
        }
        this.lockDepth.set(collection, 1); // still counted so release() stays balanced
        return;
      }
      DurableFileStore.sleepMs(DurableFileStore.LOCK_POLL_MS);
    }
  }

  /** Releases one level of the per-collection lock. */
  private releaseLock(collection: string): void {
    const depth = this.lockDepth.get(collection) ?? 0;
    if (depth <= 1) {
      this.lockDepth.delete(collection);
      try {
        fs.unlinkSync(this.getLockPath(collection));
      } catch {
        // already removed (stale-break raced us) — nothing to do
      }
    } else {
      this.lockDepth.set(collection, depth - 1);
    }
  }

  /**
   * Serializes an arbitrary read-modify-write unit on the collection's
   * cross-process lock. RE-ENTRANT: code inside fn may call saveItem /
   * deleteItem / writeCollection on the SAME collection without deadlocking.
   * fn must be SYNCHRONOUS — holding the lock across an await would break
   * the serialization guarantee.
   */
  public withCollectionLock<T>(collection: string, fn: () => T): T {
    this.acquireLock(collection, false);
    try {
      return fn();
    } finally {
      this.releaseLock(collection);
    }
  }

  /**
   * FAIL-CLOSED variant of withCollectionLock:
   * Throws LockTimeoutError if the collection lock cannot be acquired within
   * timeoutMs. Used for critical deletion and message-write serialization where
   * proceeding without a lock is unsafe and prohibited.
   */
  public withCollectionLockStrict<T>(
    collection: string,
    fn: () => T,
    timeoutMs: number = DurableFileStore.LOCK_TIMEOUT_MS
  ): T {
    this.acquireLock(collection, true, timeoutMs);
    try {
      return fn();
    } finally {
      this.releaseLock(collection);
    }
  }

  /**
   * Reads all items from a collection on disk.
   */
  public readCollection<T>(collection: string): Record<string, T> {
    if (this.isCriticalCollection(collection)) {
      return this.readCriticalCollection<T>(collection);
    }
    const filePath = this.getCollectionPath(collection);
    if (!fs.existsSync(filePath)) {
      return {};
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.trim()) return {};
      return JSON.parse(content) as Record<string, T>;
    } catch (err) {
      console.warn(`[DurableFileStore] Error reading collection "${collection}":`, err);
      return {};
    }
  }

  /**
   * Extracted atomic-write core. `strict` rethrows persistence failures so
   * callers can distinguish durable success from a swallowed loss; the
   * legacy non-strict path keeps the original best-effort logging contract
   * for pre-existing callers.
   */
  private atomicWrite<T>(collection: string, data: Record<string, T>, strict: boolean): void {
    const filePath = this.getCollectionPath(collection);
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;

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
        // M4-A hardening (no false success): the AUTHORITATIVE write failed —
        // surface the failure to the caller instead of returning while the
        // record exists only in this process's memory.
        throw err;
      }
      console.error(`[DurableFileStore] Failed to atomically persist collection "${collection}":`, err);
    }
  }

  /**
   * Atomically writes an entire collection to disk using temp-file and atomic rename.
   * Serialized on the per-collection cross-process lock (M4-A hardening).
   */
  public writeCollection<T>(collection: string, data: Record<string, T>): void {
    if (this.isCriticalCollection(collection)) {
      throw new Error(`Critical collection "${collection}" requires writeCollectionStrict().`);
    }
    this.acquireLock(collection);
    try {
      this.markCriticalCollectionInitialized(collection);
      this.atomicWrite(collection, data, false);
    } finally {
      this.releaseLock(collection);
    }
  }

  /**
   * STRICT variant (M4-A hardening — no false success): identical locking and
   * atomicity to writeCollection, but a failed authoritative write THROWS so a
   * caller can never mistake a lost write for a durable one.
   * When options.lockStrict is true, throws LockTimeoutError on lock timeout (fail-closed).
   */
  public writeCollectionStrict<T>(
    collection: string,
    data: Record<string, T>,
    options?: { lockStrict?: boolean; timeoutMs?: number }
  ): void {
    const lockStrict = options?.lockStrict ?? this.isCriticalCollection(collection);
    const timeoutMs = options?.timeoutMs ?? DurableFileStore.LOCK_TIMEOUT_MS;
    this.acquireLock(collection, lockStrict, timeoutMs);
    try {
      this.markCriticalCollectionInitialized(collection);
      this.atomicWrite(collection, data, true);
    } finally {
      this.releaseLock(collection);
    }
  }

  /**
   * Saves a single entity into the collection.
   * Cross-process serialized read-modify-write (M4-A hardening): the read,
   * merge, and write now happen under the collection lock, so a concurrent
   * writer can no longer be silently erased by a last-writer-wins interleave.
   */
  public saveItem<T>(collection: string, id: string, item: T): void {
    if (this.isCriticalCollection(collection)) {
      throw new Error(`Critical collection "${collection}" requires saveItemStrict().`);
    }
    this.acquireLock(collection);
    try {
      const current = this.readCollection<T>(collection);
      this.markCriticalCollectionInitialized(collection);
      current[id] = JSON.parse(JSON.stringify(item));
      this.atomicWrite(collection, current, false);
    } finally {
      this.releaseLock(collection);
    }
  }

  /**
   * STRICT variant (M4-A hardening — no false success): locked
   * read-modify-write that THROWS when the authoritative write fails.
   * When options.lockStrict is true, throws LockTimeoutError if the collection
   * lock cannot be acquired within timeoutMs (fail-closed locking).
   */
  public saveItemStrict<T>(
    collection: string,
    id: string,
    item: T,
    options?: { lockStrict?: boolean; timeoutMs?: number }
  ): void {
    const lockStrict = options?.lockStrict ?? this.isCriticalCollection(collection);
    const timeoutMs = options?.timeoutMs ?? DurableFileStore.LOCK_TIMEOUT_MS;
    this.acquireLock(collection, lockStrict, timeoutMs);
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
   * Cross-process serialized read-modify-write (M4-A hardening).
   */
  public deleteItem(collection: string, id: string): void {
    if (this.isCriticalCollection(collection)) {
      throw new Error(`Critical collection "${collection}" requires deleteItemStrict().`);
    }
    this.acquireLock(collection);
    try {
      const current = this.readCollection(collection);
      if (current[id] !== undefined) {
        this.markCriticalCollectionInitialized(collection);
        delete current[id];
        this.atomicWrite(collection, current, false);
      }
    } finally {
      this.releaseLock(collection);
    }
  }

  /**
   * STRICT variant (M4-A hardening — no false success): locked
   * read-check-delete that THROWS when the authoritative delete-write fails.
   * When options.lockStrict is true, throws LockTimeoutError if the collection
   * lock cannot be acquired within timeoutMs (fail-closed locking).
   */
  public deleteItemStrict(
    collection: string,
    id: string,
    options?: { lockStrict?: boolean; timeoutMs?: number }
  ): boolean {
    const lockStrict = options?.lockStrict ?? this.isCriticalCollection(collection);
    const timeoutMs = options?.timeoutMs ?? DurableFileStore.LOCK_TIMEOUT_MS;
    this.acquireLock(collection, lockStrict, timeoutMs);
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
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        this.writeCollection(collection, {});
      }
    }
  }
}
