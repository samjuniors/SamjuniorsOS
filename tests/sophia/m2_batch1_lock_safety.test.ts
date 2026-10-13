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

    await runTest('1.5: Deterministic recovery race: Process C inspecting dead lock cannot remove Process B\'s newly acquired live lock', async () => {
      const collection = 'test_deterministic_recovery_race';
      const lockPath = path.join(dataDir, `${collection}.json.lock`);

      // Step 1: Create a dead-owner lock instance L_dead
      const deadPid = 999999;
      const deadLockId = 'dead_token_999999_xyz';
      const deadPayload = JSON.stringify({
        pid: deadPid,
        createdAt: Date.now() - 5000,
        lockId: deadLockId,
      });
      fs.writeFileSync(lockPath, `${deadPayload}\n`, { flag: 'wx' });

      // Step 2: Process C inspects L_dead and confirms PID is dead
      const inspectedByC = fileStore.inspectLockFile(lockPath);
      assert(inspectedByC !== null, 'Process C must successfully inspect the lock');
      assert.strictEqual(inspectedByC.pid, deadPid);
      assert.strictEqual(inspectedByC.lockId, deadLockId);
      assert(!DurableFileStore.isProcessAlive(inspectedByC.pid!), 'PID must be confirmed dead');

      // Step 3: Before Process C unlinks, Process B intervenes:
      // Process B unlinks L_dead and acquires a brand new live lock L_B
      fs.unlinkSync(lockPath);
      const liveLockId = `live_token_${process.pid}_abc`;
      const livePayload = JSON.stringify({
        pid: process.pid,
        createdAt: Date.now(),
        lockId: liveLockId,
      });
      fs.writeFileSync(lockPath, `${livePayload}\n`, { flag: 'wx' });

      // Verify that L_B is currently active on disk and owner is alive
      const currentOnDisk = fileStore.inspectLockFile(lockPath);
      assert.strictEqual(currentOnDisk?.lockId, liveLockId);
      assert(DurableFileStore.isProcessAlive(currentOnDisk!.pid!), 'Owner of L_B must be alive');

      // Step 4: Process C now continues its stale-lock recovery attempt with its earlier inspected reference
      const unlinkedByC = fileStore.safeUnlinkStaleLock(lockPath, inspectedByC);

      // Step 5: VERIFICATION
      // - Process C must REFUSE to unlink the lock file (returns false)
      // - The live lock L_B must remain on disk completely intact
      // - L_B's content must still have liveLockId and belong to Process B
      assert.strictEqual(unlinkedByC, false, 'Process C must NOT unlink the lock file because instance changed');
      assert(fs.existsSync(lockPath), 'Live lock file L_B must still exist on disk');

      const finalCheck = fileStore.inspectLockFile(lockPath);
      assert.strictEqual(finalCheck?.lockId, liveLockId, 'Lock ID on disk must remain L_B');
      assert.strictEqual(finalCheck?.pid, process.pid, 'Lock owner on disk must remain Process B');

      // Cleanup
      fs.unlinkSync(lockPath);
    });

    await runTest('1.6: PID validation and error handling: Only confirmed ESRCH authorizes deletion; unexpected errors and EPERM fail closed', async () => {
      // 1. ESRCH is confirmed dead
      assert.strictEqual(DurableFileStore.isProcessAlive(999999), false, 'ESRCH must return false');

      // 2. Active PID is confirmed alive
      assert.strictEqual(DurableFileStore.isProcessAlive(process.pid), true, 'Current process must return true');

      // 3. EPERM must fail closed (treat as potentially alive)
      const origKill = process.kill;
      try {
        (process as any).kill = (pid: number, signal?: any) => {
          const err: any = new Error('Operation not permitted');
          err.code = 'EPERM';
          throw err;
        };
        assert.strictEqual(DurableFileStore.isProcessAlive(12345), true, 'EPERM must return true (potentially alive)');
      } finally {
        process.kill = origKill;
      }

      // 4. Unexpected errors (EIO, ENOSYS, etc.) must fail closed (treat as alive)
      try {
        (process as any).kill = (pid: number, signal?: any) => {
          const err: any = new Error('Unexpected I/O failure');
          err.code = 'EIO';
          throw err;
        };
        assert.strictEqual(DurableFileStore.isProcessAlive(12345), true, 'Unexpected error EIO must return true (fail closed)');
      } finally {
        process.kill = origKill;
      }

      // 5. Malformed, non-positive, NaN, and invalid PIDs return false (invalid PID)
      assert.strictEqual(DurableFileStore.isProcessAlive(0), false, 'PID 0 must return false');
      assert.strictEqual(DurableFileStore.isProcessAlive(-1), false, 'Negative PID must return false');
      assert.strictEqual(DurableFileStore.isProcessAlive(NaN), false, 'NaN PID must return false');
      assert.strictEqual(DurableFileStore.isProcessAlive(12.34), false, 'Float PID must return false');

      // 6. InspectLockFile rejects malformed/negative PIDs in lock file
      const tempLock = path.join(dataDir, 'test_malformed_pid.lock');
      fs.writeFileSync(tempLock, JSON.stringify({ pid: -100 }) + '\n');
      assert.strictEqual(fileStore.inspectLockFile(tempLock)?.pid, null, 'Negative PID must parse as null');

      fs.writeFileSync(tempLock, 'invalid_text_pid\n');
      assert.strictEqual(fileStore.inspectLockFile(tempLock)?.pid, null, 'Text PID must parse as null');

      fs.unlinkSync(tempLock);
    });

    await runTest('1.7: Post-validation TOCTOU race: replacement of inspected dead lock after validation but before deletion cannot remove live lock', async () => {
      const collection = 'test_toctou_post_validation_race';
      const lockPath = path.join(dataDir, `${collection}.json.lock`);

      // Step 1: Create a dead-owner lock instance L_dead
      const deadPid = 999999;
      const deadLockId = 'dead_token_999999_toctou';
      const deadPayload = JSON.stringify({
        pid: deadPid,
        createdAt: Date.now() - 5000,
        lockId: deadLockId,
      });
      fs.writeFileSync(lockPath, `${deadPayload}\n`, { flag: 'wx' });

      // Step 2: Inspect L_dead to obtain the baseline expected reference
      const inspected = fileStore.inspectLockFile(lockPath);
      assert(inspected !== null, 'Must inspect dead lock');

      // Step 3: Exercise production safeUnlinkStaleLock with a hook that executes
      // AFTER initial validation but BEFORE unlinking, simulating an interleaving process
      // that removes L_dead and creates a brand-new live lock L_live
      const liveLockId = `live_token_${process.pid}_toctou_replacement`;
      const livePayload = JSON.stringify({
        pid: process.pid,
        createdAt: Date.now(),
        lockId: liveLockId,
      });

      const unlinked = fileStore.safeUnlinkStaleLock(lockPath, inspected, () => {
        // Interleaving action executed between validation and unlinking:
        fs.unlinkSync(lockPath);
        fs.writeFileSync(lockPath, `${livePayload}\n`, { flag: 'wx' });
      });

      // Step 4: Verification
      // - safeUnlinkStaleLock must return false (refused to delete)
      // - The replacement live lock must remain intact on disk
      // - The content and ownership must match L_live
      assert.strictEqual(unlinked, false, 'safeUnlinkStaleLock must return false when lock is replaced post-validation');
      assert(fs.existsSync(lockPath), 'Replacement live lock must remain on disk');

      const onDisk = fileStore.inspectLockFile(lockPath);
      assert.strictEqual(onDisk?.lockId, liveLockId, 'Lock ID on disk must remain L_live');
      assert.strictEqual(onDisk?.pid, process.pid, 'Lock owner on disk must remain current process');

      // Cleanup
      fs.unlinkSync(lockPath);
    });

    await runTest('1.8: Recovery Gate mutual exclusion: concurrent recovery attempts on same collection are serialized via atomic creation', async () => {
      const collection = 'test_recovery_gate_mutual_exclusion';
      const lockPath = path.join(dataDir, `${collection}.json.lock`);
      const recoveryPath = path.join(dataDir, `${collection}.json.recovery`);

      // Seed dead lock
      const deadPid = 999999;
      fs.writeFileSync(lockPath, JSON.stringify({ pid: deadPid, createdAt: Date.now() - 5000, lockId: 'dead_1' }) + '\n', { flag: 'wx' });

      // Simulate Process A already holding the recovery gate
      fs.writeFileSync(recoveryPath, JSON.stringify({ pid: process.pid, createdAt: Date.now() }) + '\n', { flag: 'wx' });

      // Process B attempts breakStaleLock while recovery gate is held
      const broke = fileStore.breakStaleLock(lockPath, collection);
      assert.strictEqual(broke, false, 'breakStaleLock must yield and return false when recovery gate is held by another process');

      // The dead lock file was not removed because Process B respected the recovery gate
      assert(fs.existsSync(lockPath), 'Dead lock file must remain untouched when recovery gate was occupied');

      // Release simulated Process A's recovery gate
      fs.unlinkSync(recoveryPath);

      // Now Process B can acquire recovery gate and break the stale lock cleanly
      const brokeAfterRelease = fileStore.breakStaleLock(lockPath, collection);
      assert.strictEqual(brokeAfterRelease, true, 'breakStaleLock must succeed once recovery gate is free');
      assert(!fs.existsSync(lockPath), 'Dead lock file must be removed after successful recovery');
      assert(!fs.existsSync(recoveryPath), 'Recovery gate must be cleaned up after recovery completes');
    });

    await runTest('1.9: Recovery Gate Case 1 & 2: Mutual exclusion between contenders and safe reclamation of crashed owner', async () => {
      const collection = 'test_gate_case_1_2';
      const recoveryPath = path.join(dataDir, `${collection}.json.recovery`);

      // Case 1: Contender 1 acquires gate
      const gate1 = fileStore.acquireRecoveryGate(collection);
      assert(gate1 !== null, 'Contender 1 must successfully acquire recovery gate');
      assert(fs.existsSync(recoveryPath), 'Recovery gate file must exist on disk');

      // Contender 2 attempts acquisition on same collection
      const gate2 = fileStore.acquireRecoveryGate(collection);
      assert.strictEqual(gate2, null, 'Contender 2 must receive null and yield');

      // Release gate 1
      fileStore.releaseRecoveryGate(gate1);
      assert(!fs.existsSync(recoveryPath), 'Recovery gate must be removed after release');

      // Case 2: Crashed gate owner (PID 999999 dead)
      const deadPid = 999999;
      const deadGateId = 'dead_gate_token_123';
      fs.writeFileSync(
        recoveryPath,
        JSON.stringify({ pid: deadPid, createdAt: Date.now() - 5000, gateId: deadGateId }) + '\n',
        { flag: 'wx' }
      );

      // New contender attempts acquisition: detects crashed owner, reclaims gate safely
      assert(!DurableFileStore.isProcessAlive(deadPid), 'PID 999999 must be dead');
      const reclaimed = fileStore.reclaimStaleRecoveryGate(recoveryPath);
      assert.strictEqual(reclaimed, true, 'reclaimStaleRecoveryGate must safely reclaim dead owner gate');
      assert(!fs.existsSync(recoveryPath), 'Dead recovery gate must be removed');

      // Now a new live contender acquires cleanly
      const liveGate = fileStore.acquireRecoveryGate(collection);
      assert(liveGate !== null, 'Live contender must acquire recovered gate');
      fileStore.releaseRecoveryGate(liveGate);
    });

    await runTest('1.10: Recovery Gate Case 3: Pause between gate creation and metadata writing (0 bytes / null PID)', async () => {
      const collection = 'test_gate_case_3';
      const recoveryPath = path.join(dataDir, `${collection}.json.recovery`);

      // Simulate a process pausing immediately after openSync('wx'), leaving empty file (0 bytes)
      fs.writeFileSync(recoveryPath, '', { flag: 'wx' });

      // Fresh unwritten gate (<10s) must NOT be reclaimed (treated as actively in-progress)
      const freshReclaim = fileStore.reclaimStaleRecoveryGate(recoveryPath);
      assert.strictEqual(freshReclaim, false, 'Fresh unwritten gate (<10s) must NOT be reclaimed');
      assert(fs.existsSync(recoveryPath), 'Fresh unwritten gate must remain on disk');

      // Contender acquisition must yield while fresh
      const contenderGate = fileStore.acquireRecoveryGate(collection);
      assert.strictEqual(contenderGate, null, 'Contender must yield while fresh unwritten gate is held');

      // Now simulate gate having aged > LOCK_STALE_MS (abandoned unwritten gate from crashed process)
      const pastTime = new Date(Date.now() - 15000);
      fs.utimesSync(recoveryPath, pastTime, pastTime);

      const staleReclaim = fileStore.reclaimStaleRecoveryGate(recoveryPath);
      assert.strictEqual(staleReclaim, true, 'Stale unwritten gate (>10s) must be reclaimed');
      assert(!fs.existsSync(recoveryPath), 'Stale unwritten gate must be removed');
    });

    await runTest('1.11: Recovery Gate Case 4, 5, 6: TOCTOU race safety during reclamation (reclamation must NEVER delete a replacement live gate)', async () => {
      const collection = 'test_gate_case_4_5_6';
      const recoveryPath = path.join(dataDir, `${collection}.json.recovery`);

      // Seed dead owner gate G_dead
      const deadPid = 999999;
      const deadGateId = 'dead_gate_token_456';
      fs.writeFileSync(
        recoveryPath,
        JSON.stringify({ pid: deadPid, createdAt: Date.now() - 5000, gateId: deadGateId }) + '\n',
        { flag: 'wx' }
      );

      // Process C inspects G_dead
      const inspectedByC = fileStore.inspectRecoveryGate(recoveryPath);
      assert(inspectedByC !== null, 'Process C must inspect dead gate');
      assert.strictEqual(inspectedByC.gateId, deadGateId);

      // Process C prepares to unlink G_dead, but Process B intervenes:
      // Process B removes G_dead and acquires brand new live gate G_live (owned by live process)
      const liveGateId = `live_gate_token_${process.pid}_abc`;
      const unlinkedByC = fileStore.safeUnlinkRecoveryGate(recoveryPath, inspectedByC, () => {
        // Interleaving action executed between Process C's validation and unlinking:
        fs.unlinkSync(recoveryPath);
        fs.writeFileSync(
          recoveryPath,
          JSON.stringify({ pid: process.pid, createdAt: Date.now(), gateId: liveGateId }) + '\n',
          { flag: 'wx' }
        );
      });

      // VERIFICATION:
      // - Process C's safeUnlinkRecoveryGate MUST return false (refuse to unlink)
      // - Process B's live recovery gate G_live MUST remain intact on disk
      // - The gateId and PID on disk must remain Process B's
      assert.strictEqual(unlinkedByC, false, 'safeUnlinkRecoveryGate must return false when gate was replaced post-validation');
      assert(fs.existsSync(recoveryPath), 'Process B live gate must still exist on disk');

      const onDisk = fileStore.inspectRecoveryGate(recoveryPath);
      assert.strictEqual(onDisk?.gateId, liveGateId, 'Gate ID on disk must remain Process B live gate');
      assert.strictEqual(onDisk?.pid, process.pid, 'Gate PID on disk must remain Process B');

      // Cleanup
      fs.unlinkSync(recoveryPath);
    });

    await runTest('1.12: Recovery Gate Case 7: Unexpected PID-check errors fail closed and never authorize gate reclamation', async () => {
      const collection = 'test_gate_case_7';
      const recoveryPath = path.join(dataDir, `${collection}.json.recovery`);

      // Seed gate with arbitrary PID
      const testPid = 12345;
      fs.writeFileSync(
        recoveryPath,
        JSON.stringify({ pid: testPid, createdAt: Date.now() - 5000, gateId: 'gate_err_test' }) + '\n',
        { flag: 'wx' }
      );

      const origKill = process.kill;
      try {
        // Mock process.kill to throw an unexpected error (e.g. EIO)
        (process as any).kill = () => {
          const err: any = new Error('Unexpected OS error');
          err.code = 'EIO';
          throw err;
        };

        const reclaimed = fileStore.reclaimStaleRecoveryGate(recoveryPath);
        assert.strictEqual(reclaimed, false, 'Unexpected error must fail closed and refuse to reclaim gate');
        assert(fs.existsSync(recoveryPath), 'Gate must remain untouched on unexpected error');
      } finally {
        process.kill = origKill;
        fs.unlinkSync(recoveryPath);
      }
    });

    await runTest('1.13: Recovery Gate Case 8: releaseRecoveryGate strictly verifies gateId before unlinking', async () => {
      const collection = 'test_gate_case_8';
      const recoveryPath = path.join(dataDir, `${collection}.json.recovery`);

      // Process A holds gate A
      const gateA = {
        path: recoveryPath,
        gateId: 'gate_token_A_original',
      };

      // Meanwhile, the file on disk is replaced by Process B with gate B
      const gateIdB = 'gate_token_B_replacement';
      fs.writeFileSync(
        recoveryPath,
        JSON.stringify({ pid: process.pid, createdAt: Date.now(), gateId: gateIdB }) + '\n',
        { flag: 'wx' }
      );

      // Process A calls releaseRecoveryGate with its old gateA token
      fileStore.releaseRecoveryGate(gateA);

      // Verification: Gate B must NOT have been unlinked!
      assert(fs.existsSync(recoveryPath), 'Gate B must remain intact on disk after mismatched release');
      const current = fileStore.inspectRecoveryGate(recoveryPath);
      assert.strictEqual(current?.gateId, gateIdB, 'Gate B on disk must remain intact');

      // Now Process B calls releaseRecoveryGate with matching gateId
      fileStore.releaseRecoveryGate({ path: recoveryPath, gateId: gateIdB });
      assert(!fs.existsSync(recoveryPath), 'Gate B is cleanly removed when gateId matches');
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
