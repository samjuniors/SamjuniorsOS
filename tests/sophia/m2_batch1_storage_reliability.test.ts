import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  DurableFileStore,
  LockTimeoutError,
  CriticalCollectionCorruptionError,
} from '../../src/lib/server/persistence/durable-file-store';
import { CompanyStateStore } from '../../src/lib/server/state/state-store';
import { CompanyKnowledgeStore } from '../../src/lib/server/knowledge/knowledge-store';
import { EpistemicClaimStore } from '../../src/lib/server/epistemic/claim-store';
import { InMemoryIdempotencyStore } from '../../src/lib/server/idempotency/store';
import { InMemoryApprovalStore, InMemoryAuditStore } from '../../src/lib/server/authorization/approval-store';
import { AgentRunStore } from '../../src/lib/server/agents/run-store';
import { InMemoryWorkflowStore } from '../../src/lib/server/workflow/store';
import { CompanyInitiative, CompanyDecision, FinanceMetric } from '../../src/types/os';
import { CompanyKnowledgeItem } from '../../src/types/context';
import { EvidenceSource, EpistemicSignal, EpistemicClaim, CanonicalFact } from '../../src/types/epistemic';
import { FounderApprovalRecord, SideEffectAuditRecord } from '../../src/types/authorization';
import { AgentRunRecord } from '../../src/lib/server/agents/run-store';
import { WorkflowDefinition, WorkflowInstanceState } from '../../src/types/workflow';

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
  console.log('SAMJUNIORS-OS: M2 BATCH 2.1 STORAGE RELIABILITY & LOCK HYGIENE');
  console.log('======================================================\n');

  const originalCwd = process.cwd();
  const tempTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-m2-batch2-1-test-'));

  process.chdir(tempTestRoot);

  // Clear singletons so they bind to the temporary test environment
  (DurableFileStore as any).instance = undefined;
  (CompanyStateStore as any).instance = null;
  (CompanyKnowledgeStore as any).instance = null;
  (EpistemicClaimStore as any).instance = null;
  (InMemoryIdempotencyStore as any).instance = undefined;
  (InMemoryApprovalStore as any).instance = undefined;
  (InMemoryAuditStore as any).instance = undefined;
  (AgentRunStore as any).instance = null;
  (InMemoryWorkflowStore as any).instance = undefined;

  const fileStore = DurableFileStore.getInstance();
  const dataDir = fileStore.getDataDir();

  assert(
    dataDir.startsWith(tempTestRoot),
    `CRITICAL ISOLATION FAILURE: dataDir "${dataDir}" is not inside tempTestRoot "${tempTestRoot}"`
  );
  console.log(`[ISOLATION VERIFIED] Operating strictly in temporary root: ${tempTestRoot}`);
  console.log(`[ISOLATION VERIFIED] Dedicated temporary data directory: ${dataDir}\n`);

  try {
    // =========================================================================
    // SECTION 1: FAIL-CLOSED MUTATION LOCKING
    // =========================================================================
    console.log('--- SECTION 1: FAIL-CLOSED MUTATION LOCKING ---');

    await runTest('1.1: saveItem fails closed with LockTimeoutError when lock is held; collection not mutated', async () => {
      const collection = 'test_lock_save_item';
      fileStore.writeCollection(collection, { initial: { id: 'initial', val: 1 } });

      const lockPath = path.join(dataDir, `${collection}.json.lock`);
      fs.writeFileSync(lockPath, `${process.pid}\n`);

      let threw = false;
      try {
        fileStore.saveItem(collection, 'new_item', { id: 'new_item', val: 2 }, { timeoutMs: 30 });
      } catch (err: any) {
        threw = true;
        assert(err instanceof LockTimeoutError, `Expected LockTimeoutError, got ${err}`);
      }
      assert(threw, 'saveItem must throw LockTimeoutError on timeout');

      // Release external lock and verify collection was not mutated
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
      const after = fileStore.readCollection<any>(collection);
      assert.deepStrictEqual(after, { initial: { id: 'initial', val: 1 } });
    });

    await runTest('1.2: writeCollection fails closed with LockTimeoutError when lock is held; collection not overwritten', async () => {
      const collection = 'test_lock_write_collection';
      fileStore.writeCollection(collection, { original: { id: 'original' } });

      const lockPath = path.join(dataDir, `${collection}.json.lock`);
      fs.writeFileSync(lockPath, `${process.pid}\n`);

      let threw = false;
      try {
        fileStore.writeCollection(collection, { replaced: { id: 'replaced' } }, { timeoutMs: 30 });
      } catch (err: any) {
        threw = true;
        assert(err instanceof LockTimeoutError, `Expected LockTimeoutError, got ${err}`);
      }
      assert(threw, 'writeCollection must throw LockTimeoutError on timeout');

      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
      const after = fileStore.readCollection<any>(collection);
      assert.deepStrictEqual(after, { original: { id: 'original' } });
    });

    await runTest('1.3: deleteItem fails closed with LockTimeoutError when lock is held; item not deleted', async () => {
      const collection = 'test_lock_delete_item';
      fileStore.writeCollection(collection, { target: { id: 'target' } });

      const lockPath = path.join(dataDir, `${collection}.json.lock`);
      fs.writeFileSync(lockPath, `${process.pid}\n`);

      let threw = false;
      try {
        fileStore.deleteItem(collection, 'target', { timeoutMs: 30 });
      } catch (err: any) {
        threw = true;
        assert(err instanceof LockTimeoutError, `Expected LockTimeoutError, got ${err}`);
      }
      assert(threw, 'deleteItem must throw LockTimeoutError on timeout');

      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
      const after = fileStore.readCollection<any>(collection);
      assert.ok(after.target, 'target item must still exist after timeout');
    });

    await runTest('1.4: withCollectionLock fails closed with LockTimeoutError when lock is held', async () => {
      const collection = 'test_lock_with_collection_lock';
      const lockPath = path.join(dataDir, `${collection}.json.lock`);
      fs.writeFileSync(lockPath, `${process.pid}\n`);

      let ran = false;
      let threw = false;
      try {
        fileStore.withCollectionLock(collection, () => {
          ran = true;
        }, 30);
      } catch (err: any) {
        threw = true;
        assert(err instanceof LockTimeoutError, `Expected LockTimeoutError, got ${err}`);
      }
      assert(threw, 'withCollectionLock must throw LockTimeoutError');
      assert(!ran, 'fn inside withCollectionLock must NOT execute on lock timeout');

      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    });

    await runTest('1.5: Lock is reliably released on normal execution and on thrown error', async () => {
      const collection = 'test_lock_release_hygiene';
      const lockPath = path.join(dataDir, `${collection}.json.lock`);

      fileStore.withCollectionLock(collection, () => {
        assert(fs.existsSync(lockPath), 'Lock file must exist during locked execution');
      });
      assert(!fs.existsSync(lockPath), 'Lock file must be unlinked after normal return');

      let errorCaught = false;
      try {
        fileStore.withCollectionLock(collection, () => {
          throw new Error('boom');
        });
      } catch (e: any) {
        errorCaught = true;
        assert.strictEqual(e.message, 'boom');
      }
      assert(errorCaught, 'Error must have been propagated');
      assert(!fs.existsSync(lockPath), 'Lock file must be unlinked after thrown error');
    });

    await runTest('1.6: Stale lock (> 10s old) is safely broken by the next contender', async () => {
      const collection = 'test_lock_stale_break';
      const lockPath = path.join(dataDir, `${collection}.json.lock`);

      fs.writeFileSync(lockPath, `999999\n`);
      const staleTime = Date.now() - 15_000;
      fs.utimesSync(lockPath, staleTime / 1000, staleTime / 1000);

      // Next contender should break stale lock and succeed
      let acquired = false;
      fileStore.withCollectionLock(collection, () => {
        acquired = true;
      }, 500);
      assert(acquired, 'Contender must successfully acquire after breaking stale lock');
      assert(!fs.existsSync(lockPath), 'Lock must be released after completion');
    });

    await runTest('1.7: Re-entrant locking within the same process does not deadlock or throw', async () => {
      const collection = 'test_lock_reentrant';
      let innerRan = false;
      fileStore.withCollectionLock(collection, () => {
        fileStore.withCollectionLock(collection, () => {
          fileStore.saveItem(collection, 'rec1', { id: 'rec1' });
          innerRan = true;
        });
      });
      assert(innerRan, 'Nested locked section must execute smoothly');
      const data = fileStore.readCollection<any>(collection);
      assert.ok(data.rec1, 'Item saved under nested lock must be persisted');
    });

    // =========================================================================
    // SECTION 2: CONCURRENCY
    // =========================================================================
    console.log('\n--- SECTION 2: CONCURRENCY ---');

    await runTest('2.1: Concurrent writes to the same collection serialize without lost updates', async () => {
      const collection = 'test_concurrent_same_collection';
      const count = 25;

      // Simulate concurrent async writes using setImmediate interleaving
      await Promise.all(
        Array.from({ length: count }, (_, i) =>
          new Promise<void>((resolve, reject) => {
            setImmediate(() => {
              try {
                fileStore.saveItem(collection, `item_${i}`, { index: i, timestamp: Date.now() });
                resolve();
              } catch (err) {
                reject(err);
              }
            });
          })
        )
      );

      const items = fileStore.readCollection<any>(collection);
      assert.strictEqual(
        Object.keys(items).length,
        count,
        `Expected ${count} items, found ${Object.keys(items).length} (lost update detected!)`
      );
    });

    await runTest('2.2: Concurrent writes to different collections do not cause false contention', async () => {
      const colA = 'test_concurrent_col_a';
      const colB = 'test_concurrent_col_b';

      const [resA, resB] = await Promise.all([
        new Promise<boolean>((resolve) => {
          fileStore.withCollectionLock(colA, () => {
            fileStore.saveItem(colA, 'a1', { id: 'a1' });
            resolve(true);
          });
        }),
        new Promise<boolean>((resolve) => {
          fileStore.withCollectionLock(colB, () => {
            fileStore.saveItem(colB, 'b1', { id: 'b1' });
            resolve(true);
          });
        }),
      ]);

      assert(resA && resB, 'Both collections should be written successfully without contention');
      assert.ok(fileStore.readCollection<any>(colA).a1);
      assert.ok(fileStore.readCollection<any>(colB).b1);
    });

    // =========================================================================
    // SECTION 3: WRITE RELIABILITY & INTERRUPTION
    // =========================================================================
    console.log('\n--- SECTION 3: WRITE RELIABILITY & INTERRUPTION ---');

    await runTest('3.1: Interrupted write leaves original collection intact and cleans up temp file', async () => {
      const collection = 'test_interrupted_write';
      fileStore.writeCollection(collection, { intact: { value: 42 } });

      const originalRenameSync = fs.renameSync;
      let errorInjected = false;
      try {
        fs.renameSync = () => {
          throw new Error('SIMULATED_CRASH_DURING_RENAME');
        };

        let threw = false;
        try {
          fileStore.saveItem(collection, 'corrupting', { value: 99 });
        } catch (e: any) {
          threw = true;
          assert.strictEqual(e.message, 'SIMULATED_CRASH_DURING_RENAME');
        }
        assert(threw, 'Should throw simulated crash error');
        errorInjected = true;
      } finally {
        fs.renameSync = originalRenameSync;
      }
      assert(errorInjected, 'Error injection must have occurred');

      // Original data must be uncorrupted
      const readBack = fileStore.readCollection<any>(collection);
      assert.deepStrictEqual(readBack, { intact: { value: 42 } });

      // No stray temp files left behind
      const entries = fs.readdirSync(dataDir);
      const tempFiles = entries.filter((e) => e.startsWith(`${collection}.json.tmp.`));
      assert.strictEqual(tempFiles.length, 0, `Temp file must be unlinked on failure; found: ${tempFiles}`);
    });

    await runTest('3.2: Orphaned temp files older than 60s are cleaned up by store initialization', async () => {
      const staleTemp = path.join(dataDir, 'test_cleanup.json.tmp.12345.abcde');
      fs.writeFileSync(staleTemp, 'stale partial data');
      const oldTime = (Date.now() - 70_000) / 1000;
      fs.utimesSync(staleTemp, oldTime, oldTime);

      // Force re-instantiation of DurableFileStore
      (DurableFileStore as any).instance = undefined;
      DurableFileStore.getInstance();

      assert(!fs.existsSync(staleTemp), 'Stale temp file older than 60s must be cleaned up on init');
    });

    await runTest('3.3: Strict write error propagation throws and does not report false success', async () => {
      const collection = 'test_write_error_propagation';
      const originalWriteFileSync = fs.writeFileSync;
      try {
        fs.writeFileSync = () => {
          const err: any = new Error('ENOSPC: no space left on device');
          err.code = 'ENOSPC';
          throw err;
        };

        let caughtCode: string | undefined;
        try {
          fileStore.writeCollection(collection, { item: 1 });
        } catch (e: any) {
          caughtCode = e.code;
        }
        assert.strictEqual(caughtCode, 'ENOSPC', 'ENOSPC must be strictly propagated to caller');
      } finally {
        fs.writeFileSync = originalWriteFileSync;
      }
    });

    // =========================================================================
    // SECTION 4: CORRUPTION PROTECTION & QUARANTINE
    // =========================================================================
    console.log('\n--- SECTION 4: CORRUPTION PROTECTION & QUARANTINE ---');

    await runTest('4.1: Malformed JSON is quarantined to .corrupt.*, preserves original bytes, and throws CriticalCollectionCorruptionError', async () => {
      const collection = 'test_corrupt_malformed_json';
      const filePath = path.join(dataDir, `${collection}.json`);
      const corruptPayload = '{"broken": json without quotes or closing';
      fs.writeFileSync(filePath, corruptPayload, 'utf-8');

      let caught: any;
      try {
        fileStore.readCollection(collection);
      } catch (err: any) {
        caught = err;
      }

      assert(caught instanceof CriticalCollectionCorruptionError, `Expected CriticalCollectionCorruptionError, got: ${caught}`);
      assert(caught.quarantinePath, 'quarantinePath must be populated in error');
      assert(fs.existsSync(caught.quarantinePath), 'Quarantined file must exist on disk');

      // Original corrupted bytes must be preserved exactly
      const preservedBytes = fs.readFileSync(caught.quarantinePath, 'utf-8');
      assert.strictEqual(preservedBytes, corruptPayload, 'Preserved bytes must match original corrupt bytes');

      // The original filePath must be removed (renamed to quarantine)
      assert(!fs.existsSync(filePath), 'Original corrupt file must have been renamed to quarantine');
    });

    await runTest('4.2: Empty file (0 bytes) is quarantined and throws CriticalCollectionCorruptionError', async () => {
      const collection = 'test_corrupt_empty_file';
      const filePath = path.join(dataDir, `${collection}.json`);
      fs.writeFileSync(filePath, '', 'utf-8');

      let caught: any;
      try {
        fileStore.readCollection(collection);
      } catch (err: any) {
        caught = err;
      }

      assert(caught instanceof CriticalCollectionCorruptionError);
      assert(caught.message.includes('file is empty'));
      assert(caught.quarantinePath && fs.existsSync(caught.quarantinePath));
    });

    await runTest('4.3: Truncated JSON file is quarantined and throws CriticalCollectionCorruptionError', async () => {
      const collection = 'test_corrupt_truncated_file';
      const filePath = path.join(dataDir, `${collection}.json`);
      fs.writeFileSync(filePath, '{"key": "value", "unfinis', 'utf-8');

      let caught: any;
      try {
        fileStore.readCollection(collection);
      } catch (err: any) {
        caught = err;
      }

      assert(caught instanceof CriticalCollectionCorruptionError);
      assert(caught.message.includes('invalid JSON'));
      assert(caught.quarantinePath && fs.existsSync(caught.quarantinePath));
    });

    await runTest('4.4: Missing data file with existing .initialized marker fails closed (anti-wipe barrier)', async () => {
      const collection = 'test_corrupt_missing_ledger_with_marker';
      const filePath = path.join(dataDir, `${collection}.json`);
      const markerPath = path.join(dataDir, `${collection}.json.initialized`);

      fs.writeFileSync(markerPath, `initialized ${new Date().toISOString()}\n`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      let caught: any;
      try {
        fileStore.readCollection(collection);
      } catch (err: any) {
        caught = err;
      }

      assert(caught instanceof CriticalCollectionCorruptionError);
      assert(caught.message.includes('missing although its initialization marker exists'));
    });

    await runTest('4.5: After quarantine, subsequent writes cannot overwrite unrecovered collection', async () => {
      const collection = 'test_overwrite_protection_after_quarantine';
      const filePath = path.join(dataDir, `${collection}.json`);
      fs.writeFileSync(filePath, '{bad json', 'utf-8');

      // First read triggers quarantine
      try {
        fileStore.readCollection(collection);
      } catch {}

      // Subsequent saveItem or writeCollection must refuse to overwrite the missing/quarantined ledger
      let writeThrew = false;
      try {
        fileStore.saveItem(collection, 'new_id', { val: 1 });
      } catch (err: any) {
        writeThrew = true;
        assert(err instanceof CriticalCollectionCorruptionError, `Expected CriticalCollectionCorruptionError, got: ${err}`);
      }
      assert(writeThrew, 'saveItem must refuse to overwrite unrecovered quarantined ledger');

      let collectionWriteThrew = false;
      try {
        fileStore.writeCollection(collection, { new_id: { val: 2 } });
      } catch (err: any) {
        collectionWriteThrew = true;
        assert(err instanceof CriticalCollectionCorruptionError, `Expected CriticalCollectionCorruptionError, got: ${err}`);
      }
      assert(collectionWriteThrew, 'writeCollection must refuse to overwrite unrecovered quarantined ledger');
    });

    await runTest('4.6: Operator recovery workflow restores healthy operation', async () => {
      const collection = 'test_operator_recovery';
      const filePath = path.join(dataDir, `${collection}.json`);
      fs.writeFileSync(filePath, '{bad', 'utf-8');

      let quarantinePath: string = '';
      try {
        fileStore.readCollection(collection);
      } catch (err: any) {
        quarantinePath = err.quarantinePath;
      }
      assert(quarantinePath && fs.existsSync(quarantinePath));

      // Operator manual recovery: repair JSON and restore to collection.json
      const repairedData = { repairedKey: { id: 'repairedKey', status: 'healthy' } };
      fs.writeFileSync(filePath, JSON.stringify(repairedData), 'utf-8');

      // Now read and write resume cleanly
      const readBack = fileStore.readCollection<any>(collection);
      assert.deepStrictEqual(readBack, repairedData);

      fileStore.saveItem(collection, 'addedKey', { id: 'addedKey', status: 'new' });
      const afterSave = fileStore.readCollection<any>(collection);
      assert.ok(afterSave.repairedKey && afterSave.addedKey);
    });

    // =========================================================================
    // SECTION 5: BACKWARDS COMPATIBILITY & FIRST USE
    // =========================================================================
    console.log('\n--- SECTION 5: BACKWARDS COMPATIBILITY & FIRST USE ---');

    await runTest('5.1: First-use on clean collection returns empty {} and seeds marker on first write', async () => {
      const collection = 'test_first_use_clean';
      const markerPath = path.join(dataDir, `${collection}.json.initialized`);
      assert(!fs.existsSync(markerPath));

      const empty = fileStore.readCollection(collection);
      assert.deepStrictEqual(empty, {});
      assert(!fs.existsSync(markerPath), 'Marker should not be created on empty read');

      fileStore.saveItem(collection, 'first', { id: 'first' });
      assert(fs.existsSync(markerPath), 'Marker must be created on first write');
      assert.deepStrictEqual(fileStore.readCollection<any>(collection), { first: { id: 'first' } });
    });

    await runTest('5.2: Existing legacy collection without marker is recognized on read, marker created, data intact', async () => {
      const collection = 'test_legacy_collection';
      const filePath = path.join(dataDir, `${collection}.json`);
      const markerPath = path.join(dataDir, `${collection}.json.initialized`);

      const legacyData = { legacyItem: { id: 'legacyItem', score: 100 } };
      fs.writeFileSync(filePath, JSON.stringify(legacyData), 'utf-8');
      assert(!fs.existsSync(markerPath));

      const readData = fileStore.readCollection<any>(collection);
      assert.deepStrictEqual(readData, legacyData);
      assert(fs.existsSync(markerPath), 'Marker must be lazily created for legacy file');
    });

    // =========================================================================
    // SECTION 6: PERSISTENCE BEFORE CACHE MUTATION
    // =========================================================================
    console.log('\n--- SECTION 6: PERSISTENCE BEFORE CACHE MUTATION ---');

    await runTest('6.1: CompanyStateStore — disk write failure leaves in-memory cache at committed state', async () => {
      const store = CompanyStateStore.getInstance();
      const initialInits: CompanyInitiative[] = [
        {
          id: 'init_1',
          codeName: 'APOLLO',
          title: 'Apollo Initiative',
          contributors: [],
          status: 'Active',
          currentObjective: 'Objective 1',
          latestResult: 'Good',
          nextRecommendedAction: 'Continue',
          risks: [],
          updatedAt: new Date().toISOString(),
        },
      ];
      await store.setInitiatives(initialInits);
      assert.strictEqual((await store.getInitiatives())[0].id, 'init_1');

      // Now inject a disk write failure
      const originalWriteSync = fs.writeFileSync;
      try {
        fs.writeFileSync = () => {
          throw new Error('DISK_WRITE_FAILED');
        };

        const proposedInits: CompanyInitiative[] = [
          { ...initialInits[0], id: 'uncommitted_init', title: 'Uncommitted' },
        ];

        let threw = false;
        try {
          await store.setInitiatives(proposedInits);
        } catch (e: any) {
          threw = true;
          assert.strictEqual(e.message, 'DISK_WRITE_FAILED');
        }
        assert(threw, 'setInitiatives must throw when disk write fails');

        // Cache MUST NOT be modified!
        const currentInits = await store.getInitiatives();
        assert.strictEqual(currentInits.length, 1);
        assert.strictEqual(currentInits[0].id, 'init_1', 'In-memory cache must retain committed state init_1');
      } finally {
        fs.writeFileSync = originalWriteSync;
      }
    });

    await runTest('6.2: CompanyKnowledgeStore — disk write failure leaves cache unchanged', async () => {
      const store = CompanyKnowledgeStore.getInstance();
      const item1: CompanyKnowledgeItem = {
        id: 'know_test_1',
        documentId: 'DOC-1',
        title: 'Committed Knowledge',
        category: 'sop',
        version: '1.0.0',
        summary: 'Committed',
        content: 'Committed content',
        tags: ['test'],
        applicableDepartments: ['council'],
        authorAuthority: 'Marcus',
        lastVerifiedDate: '2026-09-01',
        isDurableReference: true,
      };
      await store.addKnowledge(item1);
      assert.ok(await store.getKnowledgeById('know_test_1'));

      const originalWriteSync = fs.writeFileSync;
      try {
        fs.writeFileSync = () => {
          throw new Error('DISK_WRITE_FAILED');
        };

        const item2: CompanyKnowledgeItem = {
          id: 'know_test_uncommitted',
          documentId: 'DOC-2',
          title: 'Uncommitted Knowledge',
          category: 'sop',
          version: '1.0.0',
          summary: 'Uncommitted',
          content: 'Uncommitted content',
          tags: ['test'],
          applicableDepartments: ['council'],
          authorAuthority: 'Marcus',
          lastVerifiedDate: '2026-09-01',
          isDurableReference: true,
        };

        let threw = false;
        try {
          await store.addKnowledge(item2);
        } catch (e: any) {
          threw = true;
          assert.strictEqual(e.message, 'DISK_WRITE_FAILED');
        }
        assert(threw, 'addKnowledge must throw on persistence failure');

        // Verify cache does NOT have know_test_uncommitted
        const uncommitted = await store.getKnowledgeById('know_test_uncommitted');
        assert.strictEqual(uncommitted, null, 'Uncommitted knowledge must not be in cache');
      } finally {
        fs.writeFileSync = originalWriteSync;
      }
    });

    await runTest('6.3: EpistemicClaimStore — disk write failure leaves in-memory maps unchanged', async () => {
      const store = EpistemicClaimStore.getInstance();
      const source: EvidenceSource = {
        id: 'src_committed',
        sourceSystem: 'github',
        title: 'Commit Source',
        rawContent: 'content',
        contentHash: 'hash1',
        capturedAt: new Date().toISOString(),
        capturedBy: 'system',
        provenanceKind: 'live_operational',
      };
      await store.saveSource(source);
      assert.ok(await store.getSource('src_committed'));

      const originalWriteSync = fs.writeFileSync;
      try {
        fs.writeFileSync = () => {
          throw new Error('DISK_WRITE_FAILED');
        };

        const uncommittedSource: EvidenceSource = {
          id: 'src_uncommitted',
          sourceSystem: 'github',
          title: 'Uncommitted Source',
          rawContent: 'uncommitted',
          contentHash: 'hash2',
          capturedAt: new Date().toISOString(),
          capturedBy: 'system',
          provenanceKind: 'live_operational',
        };

        let threw = false;
        try {
          await store.saveSource(uncommittedSource);
        } catch (e: any) {
          threw = true;
          assert.strictEqual(e.message, 'DISK_WRITE_FAILED');
        }
        assert(threw, 'saveSource must throw on disk failure');

        const found = await store.getSource('src_uncommitted');
        assert.strictEqual(found, null, 'Uncommitted source must not be present in cache');
      } finally {
        fs.writeFileSync = originalWriteSync;
      }
    });

    await runTest('6.4: InMemoryIdempotencyStore — disk write failure leaves records map unchanged', async () => {
      const store = InMemoryIdempotencyStore.getInstance();
      const key = 'idem_test_key_1';
      const claimed = await store.claim({ key, actionName: 'test_action' });
      assert.strictEqual(claimed.state, 'claimed');

      const originalWriteSync = fs.writeFileSync;
      try {
        fs.writeFileSync = () => {
          throw new Error('DISK_WRITE_FAILED');
        };

        let completeThrew = false;
        try {
          await store.complete(key, { result: 'should_fail_persistence' });
        } catch (e: any) {
          completeThrew = true;
          assert.strictEqual(e.message, 'DISK_WRITE_FAILED');
        }
        assert(completeThrew, 'complete must throw on persistence failure');

        // Record must remain in 'in_progress', NOT 'completed'
        const current = await store.get(key);
        assert.strictEqual(current?.status, 'in_progress', 'Record in cache must remain in_progress');
      } finally {
        fs.writeFileSync = originalWriteSync;
      }
    });

    await runTest('6.5: InMemoryApprovalStore & InMemoryAuditStore — disk failure leaves cache unchanged', async () => {
      const appStore = InMemoryApprovalStore.getInstance();
      const auditStore = InMemoryAuditStore.getInstance();

      const approval: FounderApprovalRecord = {
        id: 'app_test_1',
        workflowInstanceId: 'wf_1',
        stepId: 'step_1',
        actionName: 'stripe_charge',
        employeeRole: 'finance',
        classification: 'financial_action',
        decision: 'pending',
        target: { targetSystem: 'stripe' },
        payloadHash: 'hash_app_1',
        requestedAt: new Date().toISOString(),
        scope: { scopeType: 'single_action' },
      };
      await appStore.save(approval);
      assert.ok(await appStore.get('app_test_1'));

      const originalWriteSync = fs.writeFileSync;
      try {
        fs.writeFileSync = () => {
          throw new Error('DISK_WRITE_FAILED');
        };

        let decideThrew = false;
        try {
          await appStore.decide('app_test_1', 'approved', 'founder_1', 'Approved test');
        } catch (e: any) {
          decideThrew = true;
          assert.strictEqual(e.message, 'DISK_WRITE_FAILED');
        }
        assert(decideThrew, 'decide must throw on persistence failure');

        // Cache must still show pending
        const current = await appStore.get('app_test_1');
        assert.strictEqual(current?.decision, 'pending', 'Approval in cache must still be pending');

        // Audit store test
        const audit: SideEffectAuditRecord = {
          id: 'audit_test_uncommitted',
          requestId: 'req_1',
          requestedBy: 'finance',
          approvalId: 'app_test_1',
          workflowInstanceId: 'wf_1',
          stepId: 'step_1',
          actionName: 'stripe_charge',
          actionClassification: 'financial_action',
          employeeRole: 'finance',
          target: { targetSystem: 'stripe' },
          decision: 'allowed',
          reasonCode: 'APPROVED_BY_FOUNDER',
          reason: 'OK',
          executed: false,
          timestamp: new Date().toISOString(),
        };

        let auditThrew = false;
        try {
          await auditStore.record(audit);
        } catch (e: any) {
          auditThrew = true;
          assert.strictEqual(e.message, 'DISK_WRITE_FAILED');
        }
        assert(auditThrew, 'record audit must throw on persistence failure');
        assert.strictEqual(await auditStore.get('audit_test_uncommitted'), null, 'Uncommitted audit must not be in cache');
      } finally {
        fs.writeFileSync = originalWriteSync;
      }
    });

    await runTest('6.6: AgentRunStore — disk failure leaves runs map unchanged', async () => {
      const store = AgentRunStore.getInstance();
      const run: AgentRunRecord = {
        runId: 'run_committed',
        agentId: 'coo',
        agentName: 'Sophia',
        protocolStep: 'understand',
        taskTitle: 'Task 1',
        directive: 'Directive 1',
        status: 'completed',
        durationMs: 100,
        outputContent: 'Output',
        provenance: {
          agentId: 'coo',
          agentName: 'Sophia',
          taskId: 'task_1',
          protocolStep: 'understand',
          timestamp: new Date().toISOString(),
          isVerified: true,
          evidenceBasis: 'external_evidence',
        },
        timestamp: new Date().toISOString(),
      };
      await store.saveRun(run);
      assert.ok(await store.getRun('run_committed'));

      const originalWriteSync = fs.writeFileSync;
      try {
        fs.writeFileSync = () => {
          throw new Error('DISK_WRITE_FAILED');
        };

        const uncommittedRun: AgentRunRecord = {
          ...run,
          runId: 'run_uncommitted',
        };

        let threw = false;
        try {
          await store.saveRun(uncommittedRun);
        } catch (e: any) {
          threw = true;
          assert.strictEqual(e.message, 'DISK_WRITE_FAILED');
        }
        assert(threw, 'saveRun must throw on disk failure');
        assert.strictEqual(await store.getRun('run_uncommitted'), null, 'Uncommitted run must not be in cache');
      } finally {
        fs.writeFileSync = originalWriteSync;
      }
    });

    await runTest('6.7: InMemoryWorkflowStore — disk failure leaves instances cache unchanged', async () => {
      const store = InMemoryWorkflowStore.getInstance();
      const instance: WorkflowInstanceState = {
        instanceId: 'wf_inst_1',
        workflowId: 'wf_def_1',
        version: '1.0.0',
        stateVersion: 0,
        objective: 'Test Objective',
        status: 'pending',
        stepStates: {
          step_1: {
            stepId: 'step_1',
            status: 'ready',
            assignedRole: 'coo',
            skill: 'understand',
            outputs: {},
            evidenceReferences: [],
            retryCount: 0,
          },
        },
        outputs: {},
        evidenceReferences: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.saveInstance(instance);
      assert.ok(await store.getInstance('wf_inst_1'));

      const originalWriteSync = fs.writeFileSync;
      try {
        fs.writeFileSync = () => {
          throw new Error('DISK_WRITE_FAILED');
        };

        let claimThrew = false;
        try {
          await store.claimStepAtomic('wf_inst_1', 'step_1', 'worker_1');
        } catch (e: any) {
          claimThrew = true;
          assert.strictEqual(e.message, 'DISK_WRITE_FAILED');
        }
        assert(claimThrew, 'claimStepAtomic must throw on disk failure');

        // Instance in cache must still have status 'ready', not claimed
        const current = await store.getInstance('wf_inst_1');
        assert.strictEqual(current?.stepStates['step_1'].status, 'ready', 'Step must still be ready');
        assert.strictEqual(current?.claimedBy, undefined, 'Worker claim must not be recorded');
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
  console.log(`M2 BATCH 2.1 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled fatal error in test suite:', err);
  process.exit(1);
});
