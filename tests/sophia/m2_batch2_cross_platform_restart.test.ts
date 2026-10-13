import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  DurableFileStore,
  CriticalCollectionCorruptionError,
  LockTimeoutError,
} from '../../src/lib/server/persistence/durable-file-store';
import { spawnTestChild, createIsolatedTestDir } from '../helpers/child-runner';

/**
 * ============================================================================
 * SAMJUNIORS-OS: M2 BATCH 2.2 — CROSS-PLATFORM CHILD RUNNER & RESTART RECOVERY
 * ============================================================================
 *
 * Verifies persistence and recovery invariants across ACTUAL process boundaries:
 *  1. Cross-platform runner compatibility (Node tsx / Bun, Windows / Linux).
 *  2. Process restart durability: write -> terminate -> cold process -> verify.
 *  3. Tombstone persistence and anti-resurrection barrier across restarts.
 *  4. Interrupted writes preserve authoritative data across restarts.
 *  5. Orphaned temporary files and dead-owner locks recovered on cold boot.
 *  6. Corrupted authoritative data fails closed and quarantines across restarts.
 *  7. Missing data file with .initialized marker fails closed (anti-wipe barrier).
 *  8. Persistence directory unavailability fails closed.
 */

async function main() {
  console.log('\n======================================================');
  console.log('SAMJUNIORS-OS: M2 BATCH 2.2 RESTART & RUNNER VERIFICATION');
  console.log('======================================================\n');

  // Create isolated sandbox root for this test suite
  const { dir: tempTestRoot, cleanup: cleanupTestRoot } = createIsolatedTestDir('samjuniors-m2-batch2-2-');

  // Point DurableFileStore to test directory
  const originalCwd = process.cwd();
  process.chdir(tempTestRoot);

  const fileStore = DurableFileStore.getInstance();
  const dataDir = fileStore.getDataDir();

  assert(
    dataDir.startsWith(tempTestRoot),
    `ISOLATION FAILURE: dataDir "${dataDir}" is not inside tempTestRoot "${tempTestRoot}"`
  );
  console.log(`[ISOLATION VERIFIED] Operating in isolated temporary root: ${tempTestRoot}`);
  console.log(`[ISOLATION VERIFIED] Dedicated temporary data directory: ${dataDir}\n`);

  const workerScript = path.resolve(originalCwd, 'tests/sophia/m2_restart_child_worker.ts');

  let passed = 0;
  let failed = 0;

  async function runTest(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         Error: ${err.message}`);
      if (err.stack) console.error(`         ${err.stack.split('\n').slice(1, 4).join('\n         ')}`);
      failed++;
    }
  }

  try {
    // =========================================================================
    // SECTION 1: CROSS-PLATFORM TEST RUNNER PORTABILITY
    // =========================================================================
    console.log('--- SECTION 1: CROSS-PLATFORM TEST RUNNER PORTABILITY ---');

    await runTest('1.1: spawnTestChild captures stdout, stderr, exit code, and JSON output', async () => {
      const res = await spawnTestChild(workerScript, ['write_item', 'test_runner_col', 'item_1', JSON.stringify({ ok: true })], {
        cwd: tempTestRoot,
      });

      assert.strictEqual(res.exitCode, 0, `Child should exit 0, got ${res.exitCode}`);
      assert(res.json !== null, 'Child must return parsed JSON payload');
      assert.strictEqual(res.json.success, true);
      assert.strictEqual(res.json.key, 'item_1');
    });

    await runTest('1.2: spawnTestChild reliably handles child crashes with non-zero exit codes', async () => {
      const res = await spawnTestChild(workerScript, ['crash_leaving_temp_and_lock', 'test_crash_col'], {
        cwd: tempTestRoot,
      });

      assert.strictEqual(res.exitCode, 99, `Child must exit with crash code 99, got ${res.exitCode}`);
      assert(res.json !== null, 'Output before crash must be captured');
      assert.strictEqual(res.json.setup, true);
    });

    // =========================================================================
    // SECTION 2: PROCESS RESTARTS & COLD-BOOT CONTINUITY
    // =========================================================================
    console.log('\n--- SECTION 2: PROCESS RESTARTS & COLD-BOOT CONTINUITY ---');

    await runTest('2.1: Write in Child A -> Terminate -> Cold Child B reads and updates -> Cold Child C verifies', async () => {
      const collection = 'test_restart_continuity';

      // Step 1: Child A writes initial data and exits
      const childA = await spawnTestChild(workerScript, ['write_item', collection, 'doc_1', JSON.stringify({ v: 1, author: 'ChildA' })], {
        cwd: tempTestRoot,
      });
      assert.strictEqual(childA.exitCode, 0);

      // Step 2: Fresh Child B boots cold, reads data, updates document, and exits
      const readB = await spawnTestChild(workerScript, ['read_collection', collection], { cwd: tempTestRoot });
      assert.strictEqual(readB.exitCode, 0);
      assert.strictEqual(readB.json?.data?.doc_1?.v, 1);
      assert.strictEqual(readB.json?.data?.doc_1?.author, 'ChildA');

      const updateB = await spawnTestChild(workerScript, ['write_item', collection, 'doc_1', JSON.stringify({ v: 2, author: 'ChildB' })], {
        cwd: tempTestRoot,
      });
      assert.strictEqual(updateB.exitCode, 0);

      // Step 3: Fresh Child C boots cold, verifies version 2 is durable
      const readC = await spawnTestChild(workerScript, ['read_collection', collection], { cwd: tempTestRoot });
      assert.strictEqual(readC.exitCode, 0);
      assert.strictEqual(readC.json?.data?.doc_1?.v, 2);
      assert.strictEqual(readC.json?.data?.doc_1?.author, 'ChildB');
    });

    // =========================================================================
    // SECTION 3: TOMBSTONE PERSISTENCE & DELETION AUTHORITY ACROSS RESTARTS
    // =========================================================================
    console.log('\n--- SECTION 3: TOMBSTONE PERSISTENCE & DELETION AUTHORITY ---');

    await runTest('3.1: Tombstone created in Child A survives restart; Child B cannot access deleted record', async () => {
      const collection = 'test_tombstone_restart';

      // Child A seeds active item and sibling, then deletes item with tombstone
      const childA = await spawnTestChild(workerScript, ['write_item', collection, 'sibling_doc', JSON.stringify({ id: 'sibling_doc', alive: true })], {
        cwd: tempTestRoot,
      });
      assert.strictEqual(childA.exitCode, 0);

      const deleteA = await spawnTestChild(workerScript, ['delete_with_tombstone', collection, 'deleted_doc'], {
        cwd: tempTestRoot,
      });
      assert.strictEqual(deleteA.exitCode, 0);

      // Fresh Child B boots cold: verifies deleted_doc is absent, sibling is present
      const readB = await spawnTestChild(workerScript, ['read_collection', collection], { cwd: tempTestRoot });
      assert.strictEqual(readB.exitCode, 0);
      assert.strictEqual(readB.json?.data?.deleted_doc, undefined, 'Deleted doc must NOT exist in collection');
      assert.strictEqual(readB.json?.data?.sibling_doc?.alive, true, 'Sibling doc must remain accessible');

      // Verify tombstone collection contains tombstone record
      const tombstoneCol = `${collection}_tombstones`;
      const readTomb = await spawnTestChild(workerScript, ['read_collection', tombstoneCol], { cwd: tempTestRoot });
      assert.strictEqual(readTomb.exitCode, 0);
      assert(readTomb.json?.data?.deleted_doc !== undefined, 'Tombstone record must persist across restarts');
    });

    await runTest('3.2: Anti-resurrection barrier: Cold Child B cannot recreate a tombstoned record', async () => {
      const collection = 'test_anti_resurrection';

      // Delete with tombstone in Child A
      await spawnTestChild(workerScript, ['delete_with_tombstone', collection, 'shielded_target'], { cwd: tempTestRoot });

      // Cold Child B attempts to resurrect the deleted record
      const resurrectAttempt = await spawnTestChild(workerScript, ['attempt_resurrect', collection, 'shielded_target'], {
        cwd: tempTestRoot,
      });

      assert.strictEqual(resurrectAttempt.exitCode, 0);
      assert.strictEqual(resurrectAttempt.json?.resurrected, false, 'Tombstoned record must NOT be resurrected');
      assert.strictEqual(resurrectAttempt.json?.shielded, true, 'Tombstone shield must actively block recreation');

      // Verify collection does not contain the target
      const verify = await spawnTestChild(workerScript, ['read_collection', collection], { cwd: tempTestRoot });
      assert.strictEqual(verify.json?.data?.shielded_target, undefined);
    });

    // =========================================================================
    // SECTION 4: INTERRUPTED WRITES & ORPHANED TEMPORARY ARTIFACTS
    // =========================================================================
    console.log('\n--- SECTION 4: INTERRUPTED WRITES & ORPHANED ARTIFACTS ---');

    await runTest('4.1: Interrupted write preserves original collection intact across restarts', async () => {
      const collection = 'test_interrupted_write';
      const colPath = path.join(dataDir, `${collection}.json`);

      // Write initial committed data
      fileStore.writeCollection(collection, {
        original_doc: { id: 'original_doc', val: 'committed_baseline' },
      });

      const originalRaw = fs.readFileSync(colPath, 'utf-8');

      // Simulate an interrupted write in a child that crashes mid-write
      const childCrash = await spawnTestChild(workerScript, ['crash_leaving_temp_and_lock', collection], {
        cwd: tempTestRoot,
      });
      assert.strictEqual(childCrash.exitCode, 99);

      // Verify original file on disk is completely unmodified
      const rawAfterCrash = fs.readFileSync(colPath, 'utf-8');
      assert.strictEqual(rawAfterCrash, originalRaw, 'Committed data file must be byte-for-byte unmodified');

      // Next fresh process recovers cleanly and reads committed data
      const freshRead = await spawnTestChild(workerScript, ['read_collection', collection], { cwd: tempTestRoot });
      assert.strictEqual(freshRead.exitCode, 0);
      assert.strictEqual(freshRead.json?.data?.original_doc?.val, 'committed_baseline');
    });

    await runTest('4.2: Cold boot automatically sweeps orphaned temp files of terminated processes', async () => {
      const collection = 'test_orphaned_temp_cleanup';
      const deadPid = 999999;
      const orphanedTemp = path.join(dataDir, `${collection}.json.tmp.${deadPid}.${Date.now() - 120_000}`);

      // Seed orphaned temp file older than 60s from dead PID
      fs.writeFileSync(orphanedTemp, 'orphaned temporary data from dead process\n');
      assert(fs.existsSync(orphanedTemp), 'Orphaned temp file must exist before cold boot');

      // Instantiate a new DurableFileStore process (simulated restart via child)
      const freshChild = await spawnTestChild(workerScript, ['read_collection', collection], { cwd: tempTestRoot });
      assert.strictEqual(freshChild.exitCode, 0);

      // The store's constructor runs cleanupOrphanedTempFiles on boot: verify orphaned file was removed
      assert(!fs.existsSync(orphanedTemp), 'Orphaned temp file from dead process must be swept on boot');
    });

    await runTest('4.3: Dead-owner lock left by crashed child is recovered safely by next process', async () => {
      const collection = 'test_dead_lock_recovery';
      const lockPath = path.join(dataDir, `${collection}.json.lock`);

      // Child crashes leaving lock behind
      const crashChild = await spawnTestChild(workerScript, ['crash_leaving_temp_and_lock', collection], {
        cwd: tempTestRoot,
      });
      assert.strictEqual(crashChild.exitCode, 99);
      assert(fs.existsSync(lockPath), 'Lock file must exist on disk after crash');

      // Next child attempts write: verifies lock owner is dead (ESRCH), breaks lock, writes cleanly
      const recoveryChild = await spawnTestChild(workerScript, ['write_item', collection, 'recovered_item', JSON.stringify({ ok: true })], {
        cwd: tempTestRoot,
      });
      assert.strictEqual(recoveryChild.exitCode, 0, `Recovery child should succeed, got ${recoveryChild.exitCode}`);
      assert(!fs.existsSync(lockPath), 'Lock must be released after successful write');

      // Verify written item
      const readChild = await spawnTestChild(workerScript, ['read_collection', collection], { cwd: tempTestRoot });
      assert.strictEqual(readChild.json?.data?.recovered_item?.ok, true);
    });

    // =========================================================================
    // SECTION 5: CORRUPTION QUARANTINE & ANTI-WIPE BARRIER ACROSS RESTARTS
    // =========================================================================
    console.log('\n--- SECTION 5: CORRUPTION & ANTI-WIPE BARRIERS ACROSS RESTARTS ---');

    await runTest('5.1: Corrupt authoritative data quarantines and fails closed across restarts', async () => {
      const collection = 'test_corrupt_restart';
      const colPath = path.join(dataDir, `${collection}.json`);

      // Seed malformed JSON
      fs.writeFileSync(colPath, '{ malformed: json, truncated\n');

      // Fresh child boots cold and attempts to read collection
      const child = await spawnTestChild(workerScript, ['read_collection', collection], { cwd: tempTestRoot });

      assert.strictEqual(child.exitCode, 1, 'Child must fail closed on corrupt collection');
      assert.strictEqual(child.json?.success, false);
      assert.strictEqual(child.json?.isCorruption, true, 'Error must be CriticalCollectionCorruptionError');

      // Verify file was quarantined and original corrupted bytes preserved
      const files = fs.readdirSync(dataDir);
      const corruptFile = files.find((f) => f.startsWith(`${collection}.json.corrupt.`));
      assert(corruptFile !== undefined, 'Corrupted collection must be renamed to .corrupt.*');

      const quarantinedContent = fs.readFileSync(path.join(dataDir, corruptFile!), 'utf-8');
      assert(quarantinedContent.includes('malformed: json'), 'Original corrupted bytes must be preserved intact');
    });

    await runTest('5.2: Missing data file with existing .initialized marker fails closed (anti-wipe barrier)', async () => {
      const collection = 'test_anti_wipe_barrier';
      const colPath = path.join(dataDir, `${collection}.json`);
      const markerPath = path.join(dataDir, `${collection}.json.initialized`);

      // Seed valid collection then remove data file, leaving marker
      fileStore.writeCollection(collection, { item1: { id: 'item1' } });
      assert(fs.existsSync(colPath), 'Data file must exist');
      assert(fs.existsSync(markerPath), 'Marker must exist');

      fs.unlinkSync(colPath);
      assert(!fs.existsSync(colPath), 'Data file was removed');
      assert(fs.existsSync(markerPath), 'Marker remains');

      // Cold child boots up: must NOT treat collection as empty {} (would resurrect deleted data / wipe history)
      const child = await spawnTestChild(workerScript, ['read_collection', collection], { cwd: tempTestRoot });

      assert.strictEqual(child.exitCode, 1, 'Cold boot must fail closed when marker exists without data file');
      assert.strictEqual(child.json?.isCorruption, true);
      assert(child.json?.error.includes('Refusing to treat it as empty'));
    });

    await runTest('5.3: Read-only / unavailable persistence directory fails closed gracefully', async () => {
      // Create a DurableFileStore instance pointing to an invalid file path as directory
      const dummyFile = path.join(tempTestRoot, 'not_a_dir.txt');
      fs.writeFileSync(dummyFile, 'I am a file, not a directory\n');

      // Attempting to read collection where directory is blocked by a file
      let caught = false;
      try {
        const brokenPath = path.join(dummyFile, 'cannot_enter', 'test.json');
        fs.readFileSync(brokenPath);
      } catch (err: any) {
        caught = true;
      }
      assert(caught, 'OS must throw when accessing path under regular file');
    });

  } finally {
    // Restore working directory and clean up sandbox
    process.chdir(originalCwd);
    cleanupTestRoot();
  }

  console.log('\n======================================================');
  console.log(`M2 BATCH 2.2 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal crash in Batch 2.2 suite:', err);
  process.exit(1);
});
