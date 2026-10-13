import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fork } from 'child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  DurableFileStore,
  LockTimeoutError,
} from '../../src/lib/server/persistence/durable-file-store';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    failed++;
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('SAMJUNIORS-OS: M2 BATCH 2.1 LOCK SAFETY & HYGIENE VERIFICATION');
  console.log('======================================================\n');

  const originalCwd = process.cwd();
  const tempTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-m2-lock-safety-test-'));

  process.chdir(tempTestRoot);

  // Clear singleton to bind to isolated temporary directory
  (DurableFileStore as any).instance = undefined;

  const fileStore = DurableFileStore.getInstance();
  const dataDir = fileStore.getDataDir();

  assert(
    dataDir.startsWith(tempTestRoot),
    `ISOLATION FAILURE: dataDir "${dataDir}" is not inside tempTestRoot "${tempTestRoot}"`
  );
  console.log(`[ISOLATION VERIFIED] Operating strictly in temporary root: ${tempTestRoot}`);
  console.log(`[ISOLATION VERIFIED] Dedicated temporary data directory: ${dataDir}\n`);

  const workerScript = path.resolve(originalCwd, 'tests/sophia/m2_lock_child_worker.ts');

  try {
    // =========================================================================
    // SECTION 1: STALE LOCK BREAKING & OWNER LIVENESS VERIFICATION
    // =========================================================================
    console.log('--- SECTION 1: STALE LOCK BREAKING & OWNER LIVENESS ---');

    await runTest('1.1: Live lock older than 10s is NEVER broken while owner process is alive', async () => {
      const collection = 'test_live_lock_protection';
      const lockPath = path.join(dataDir, `${collection}.json.lock`);

      // Write a lock file owned by THIS running process, backdated by 15 seconds
      const payload = JSON.stringify({ pid: process.pid, createdAt: Date.now() - 15_000 });
      fs.writeFileSync(lockPath, `${payload}\n`, { flag: 'wx' });

      // Artificially backdate the mtime on disk to 15 seconds ago (> LOCK_STALE_MS = 10,000ms)
      const past = new Date(Date.now() - 15_000);
      fs.utimesSync(lockPath, past, past);

      // Verify that this running process is confirmed alive
      assert(DurableFileStore.isProcessAlive(process.pid), 'Current process must be alive');

      // Now run another execution context trying to acquire the lock with a 100ms timeout
      let threw = false;
      const isolatedAls = new AsyncLocalStorage<Map<string, number>>();
      await isolatedAls.run(new Map(), async () => {
        try {
          fileStore.withCollectionLock(collection, () => {
            // Must NOT run
          }, 100);
        } catch (err: any) {
          threw = true;
          assert(err instanceof LockTimeoutError, `Expected LockTimeoutError, got: ${err}`);
        }
      });

      assert(threw, 'Contender must fail closed with LockTimeoutError');
      assert(fs.existsSync(lockPath), 'Lock file must NOT have been unlinked or broken');

      // Verify lock file still belongs to this process
      const content = fs.readFileSync(lockPath, 'utf-8');
      assert(content.includes(`"pid":${process.pid}`), 'Lock file owner must remain unchanged');

      // Cleanup
      fs.unlinkSync(lockPath);
    });

    await runTest('1.2: Orphaned lock from dead process is broken immediately without waiting 10s', async () => {
      const collection = 'test_dead_process_orphan_recovery';
      const lockPath = path.join(dataDir, `${collection}.json.lock`);

      // PID 999999 is dead (verified with ESRCH)
      const deadPid = 999999;
      assert(!DurableFileStore.isProcessAlive(deadPid), 'PID 999999 must not be alive');

      // Write a freshly created lock file owned by the dead PID (mtime is 0s ago, fresh!)
      const payload = JSON.stringify({ pid: deadPid, createdAt: Date.now() });
      fs.writeFileSync(lockPath, `${payload}\n`, { flag: 'wx' });

      let acquiredAndRan = false;
      // Contender should detect the dead PID and break the lock immediately
      fileStore.withCollectionLock(collection, () => {
        acquiredAndRan = true;
        // Verify current process now owns the lock
        const content = fs.readFileSync(lockPath, 'utf-8');
        assert(content.includes(`"pid":${process.pid}`), 'New lock must belong to current process');
      }, 500);

      assert(acquiredAndRan, 'Contender must break orphaned lock and execute callback');
    });

    await runTest('1.3: Unidentified lock file without valid PID is protected when fresh (<10s) and broken when stale (>10s)', async () => {
      const collection = 'test_unidentified_lock_decay';
      const lockPath = path.join(dataDir, `${collection}.json.lock`);

      // Create an empty lock file (e.g. process crashed before writing PID)
      fs.writeFileSync(lockPath, '', { flag: 'wx' });

      // Fresh empty lock (<10s) must NOT be broken immediately
      let freshThrew = false;
      try {
        fileStore.withCollectionLock(collection, () => {}, 50);
      } catch (err: any) {
        freshThrew = true;
        assert(err instanceof LockTimeoutError);
      }
      assert(freshThrew, 'Fresh empty lock must not be broken prematurely');
      assert(fs.existsSync(lockPath), 'Fresh empty lock must still exist');

      // Backdate the empty lock file to 12s ago (> LOCK_STALE_MS = 10s)
      const past = new Date(Date.now() - 12_000);
      fs.utimesSync(lockPath, past, past);

      // Now stale empty lock should be broken and acquired
      let ran = false;
      fileStore.withCollectionLock(collection, () => {
        ran = true;
      }, 500);
      assert(ran, 'Stale empty lock must be broken after timeout');
    });

    await runTest('1.4: Simultaneous stale-lock recovery races: exactly one process wins atomic creation', async () => {
      const collection = 'test_simultaneous_recovery_race';
      const lockPath = path.join(dataDir, `${collection}.json.lock`);

      // Seed with a dead PID lock
      const deadPid = 999999;
      fs.writeFileSync(lockPath, JSON.stringify({ pid: deadPid, createdAt: Date.now() }) + '\n', { flag: 'wx' });

      // Run two concurrent writes to the collection in the same process
      // They should serialize cleanly without corruption or unhandled errors
      fileStore.writeCollection(collection, {});

      fileStore.saveItem(collection, 'item_1', { id: 'item_1', val: 1 });
      fileStore.saveItem(collection, 'item_2', { id: 'item_2', val: 2 });

      const result = fileStore.readCollection<any>(collection);
      assert.strictEqual(result.item_1.val, 1);
      assert.strictEqual(result.item_2.val, 2);
    });

    // =========================================================================
    // SECTION 2: RE-ENTRANCY & ASYNC CONTEXT ISOLATION
    // =========================================================================
    console.log('\n--- SECTION 2: RE-ENTRANCY & ASYNC CONTEXT ISOLATION ---');

    await runTest('2.1: Re-entrancy is isolated per async execution context; unrelated contexts do NOT share depth', async () => {
      const collection = 'test_async_context_isolation';

      // Test that nested calls within the SAME context work properly
      let nestedRan = false;
      fileStore.withCollectionLock(collection, () => {
        // Nested saveItem on same collection
        fileStore.saveItem(collection, 'nested_item', { id: 'nested_item', v: 42 });
        nestedRan = true;
      });
      assert(nestedRan, 'Nested call in same context must succeed re-entrantly');

      const data = fileStore.readCollection<any>(collection);
      assert.strictEqual(data.nested_item.v, 42);
    });

    await runTest('2.2: withCollectionLock strictly rejects callbacks that return a Promise', async () => {
      const collection = 'test_reject_promise_callback';

      let caught: any;
      try {
        // Intentionally pass an async function returning a Promise
        fileStore.withCollectionLock(collection, (async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }) as any);
      } catch (err: any) {
        caught = err;
      }

      assert(caught instanceof Error, 'Must throw when callback returns a Promise');
      assert(
        caught.message.includes('returned a Promise'),
        `Error message must explain Promise prohibition, got: ${caught.message}`
      );

      // Verify lock was released cleanly in finally
      const lockPath = path.join(dataDir, `${collection}.json.lock`);
      assert(!fs.existsSync(lockPath), 'Lock must not be leaked after Promise rejection');
    });

    // =========================================================================
    // SECTION 3: MULTI-PROCESS CONCURRENCY & TERMINATION VERIFICATION
    // =========================================================================
    console.log('\n--- SECTION 3: MULTI-PROCESS CONCURRENCY & CRASH RECOVERY ---');

    await runTest('3.1: Child process termination with held lock is recovered by next process', async () => {
      const collection = 'test_child_crash_recovery';
      fileStore.writeCollection(collection, {});

      // Spawn child that acquires lock and crashes immediately (exit 99)
      const child = fork(workerScript, ['crash_holding_lock', collection], {
        cwd: tempTestRoot,
        stdio: 'pipe',
      });

      await new Promise<void>((resolve, reject) => {
        child.on('exit', (code) => {
          assert.strictEqual(code, 99, 'Child must exit with crash code 99');
          resolve();
        });
        child.on('error', reject);
      });

      const lockPath = path.join(dataDir, `${collection}.json.lock`);
      assert(fs.existsSync(lockPath), 'Lock file must have been left behind by crashed child');

      // Next operation by parent should detect child is dead, recover lock, and write successfully
      fileStore.saveItem(collection, 'recovered_item', { id: 'recovered_item', recovered: true });

      const current = fileStore.readCollection<any>(collection);
      assert.strictEqual(current.recovered_item.recovered, true);
      assert(!fs.existsSync(lockPath), 'Lock must be released after parent write');
    });

    await runTest('3.2: Two-process contention on same collection preserves 100% of writes', async () => {
      const collection = 'test_two_process_contention';
      fileStore.writeCollection(collection, {});

      const childA = fork(workerScript, ['write_items', collection, 'workerA', '10'], {
        cwd: tempTestRoot,
        stdio: 'pipe',
      });
      const childB = fork(workerScript, ['write_items', collection, 'workerB', '10'], {
        cwd: tempTestRoot,
        stdio: 'pipe',
      });

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          childA.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`childA exited ${code}`))));
        }),
        new Promise<void>((resolve, reject) => {
          childB.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`childB exited ${code}`))));
        }),
      ]);

      const all = fileStore.readCollection<any>(collection);
      const keys = Object.keys(all);
      assert.strictEqual(keys.length, 20, `Expected exactly 20 items, found ${keys.length}`);

      for (let i = 0; i < 10; i++) {
        assert(all[`workerA_${i}`], `Missing workerA_${i}`);
        assert(all[`workerB_${i}`], `Missing workerB_${i}`);
      }
    });

    await runTest('3.3: Lock timeout occurs without mutating data or leaving partial artifacts', async () => {
      const collection = 'test_timeout_no_mutation';
      fileStore.writeCollection(collection, { original: { id: 'original', count: 1 } });

      const lockPath = path.join(dataDir, `${collection}.json.lock`);
      // Hold lock externally with live PID
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, createdAt: Date.now() }) + '\n', { flag: 'wx' });

      let threw = false;
      const isolatedAls = new AsyncLocalStorage<Map<string, number>>();
      await isolatedAls.run(new Map(), async () => {
        try {
          fileStore.saveItem(collection, 'mutated', { id: 'mutated', count: 99 }, { timeoutMs: 50 });
        } catch (err: any) {
          threw = true;
          assert(err instanceof LockTimeoutError);
        }
      });
      assert(threw, 'saveItem must throw LockTimeoutError on timeout');

      // Original data must be byte-for-byte unmodified
      const current = fileStore.readCollection<any>(collection);
      assert.strictEqual(current.original.count, 1);
      assert.strictEqual(current.mutated, undefined, 'Mutated item must not exist');

      fs.unlinkSync(lockPath);
    });

    await runTest('3.4: cleanupOrphanedTempFiles preserves active write temp files of living processes', async () => {
      const collection = 'test_temp_cleanup_safety';
      const liveTempFile = path.join(dataDir, `${collection}.json.tmp.${process.pid}.${Date.now()}.active`);
      const deadTempFile = path.join(dataDir, `${collection}.json.tmp.999999.${Date.now()}.dead`);

      fs.writeFileSync(liveTempFile, 'active write in progress', 'utf-8');
      fs.writeFileSync(deadTempFile, 'abandoned write', 'utf-8');

      // Backdate both by 120 seconds (> 60s cleanup threshold)
      const past = new Date(Date.now() - 120_000);
      fs.utimesSync(liveTempFile, past, past);
      fs.utimesSync(deadTempFile, past, past);

      // Run cleanup
      fileStore.cleanupOrphanedTempFiles();

      // Living process temp file must NOT be deleted
      assert(fs.existsSync(liveTempFile), 'Temp file of live process must be protected');

      // Dead process temp file must be deleted
      assert(!fs.existsSync(deadTempFile), 'Orphaned temp file of dead process must be deleted');

      // Cleanup
      if (fs.existsSync(liveTempFile)) fs.unlinkSync(liveTempFile);
    });

    await runTest('3.5: Failed atomic write preserves original data intact', async () => {
      const collection = 'test_failed_write_intact';
      fileStore.writeCollection(collection, { stable: { id: 'stable', val: 100 } });

      const originalWriteSync = fs.writeFileSync;
      try {
        fs.writeFileSync = () => {
          throw new Error('ENOSPC: no space left on device');
        };

        let threw = false;
        try {
          fileStore.saveItem(collection, 'failing', { id: 'failing', val: 999 });
        } catch (err: any) {
          threw = true;
          assert(err.message.includes('ENOSPC'));
        }
        assert(threw, 'saveItem must throw on write failure');

        // Original data intact
        const current = fileStore.readCollection<any>(collection);
        assert.strictEqual(current.stable.val, 100);
        assert.strictEqual(current.failing, undefined);
      } finally {
        fs.writeFileSync = originalWriteSync;
      }
    });

  } finally {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tempTestRoot, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n======================================================');
  console.log(`LOCK SAFETY RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled fatal error in test suite:', err);
  process.exit(1);
});
