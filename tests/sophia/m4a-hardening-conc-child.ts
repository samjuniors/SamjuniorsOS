/**
 * M4-A HARDENING concurrency child processes.
 *
 * Runs in a FRESH bun process with an ISOLATED cwd (a temp dir spawned by
 * the parent suite), so its DurableFileStore singleton resolves to
 * <tempdir>/.data — exactly reproducing the cross-process read-modify-write
 * topology of the observed race (dev server + capture pipeline writing the
 * same collection from separate processes).
 *
 * Modes (first CLI argument):
 *   conc-write <founderId> <n> <label>
 *       n sequential createMemory calls (NO idempotency key — every call is
 *       a distinct record; this is the exact loss scenario observed in the
 *       M4-A real-use observation: 2/20 concurrent writes silently lost).
 *   hold-lock <ms>
 *       Acquires the sophia_memories cross-process lock and holds it for
 *       <ms> milliseconds (synchronous busy hold), then releases. Used by the
 *       parent to prove a concurrent writer WAITS for the critical section.
 *   timed-write <founderId>
 *       ONE createMemory call, reporting elapsed wall time — proves either
 *       fast path (no contention) or blocking on the lock (contention).
 *
 * Output contract: exactly one JSON line on stdout; non-zero exit on crash.
 */
import { SophiaMemoryStore } from '../../src/lib/server/sophia/personal-memory-store';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';

const emit = (payload: Record<string, unknown>) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};
console.log = (...args: unknown[]) => {
  console.error(...args);
};

/** Synchronous bounded sleep (same primitive the lock uses). */
function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      /* spin */
    }
  }
}

async function main() {
  const mode = process.argv[2] || '';

  if (mode === 'conc-write') {
    const founderId = process.argv[3];
    const n = Number(process.argv[4] || 10);
    const label = process.argv[5] || 'c';
    const store = SophiaMemoryStore.getInstance();
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      await store.createMemory({
        founderId,
        memoryType: 'PERSONAL_CONTEXT_NOTE',
        content: `Concurrent-write probe ${label} item ${i} ${process.pid}-${Date.now()}`,
        provenance: 'conc_write_child',
      });
    }
    emit({ mode, founderId, wrote: n, label, elapsedMs: Date.now() - t0, pid: process.pid });
    return;
  }

  if (mode === 'hold-lock') {
    const ms = Number(process.argv[3] || 500);
    const t0 = Date.now();
    DurableFileStore.getInstance().withCollectionLock('sophia_memories', () => {
      sleepSync(ms);
    });
    emit({ mode, heldMs: ms, elapsedMs: Date.now() - t0, pid: process.pid });
    return;
  }

  if (mode === 'timed-write') {
    const founderId = process.argv[3];
    const store = SophiaMemoryStore.getInstance();
    const t0 = Date.now();
    const record = await store.createMemory({
      founderId,
      memoryType: 'PERSONAL_CONTEXT_NOTE',
      content: `Timed single write ${process.pid}-${Date.now()}`,
      provenance: 'timed_write_child',
    });
    emit({ mode, founderId, id: record.id, elapsedMs: Date.now() - t0, pid: process.pid });
    return;
  }

  emit({ mode, error: 'unknown mode' });
  process.exit(1);
}

main().catch((err) => {
  console.error('m4a hardening conc child crashed:', err);
  process.exit(1);
});
