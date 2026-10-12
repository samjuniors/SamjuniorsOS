import assert from 'assert';
import { CompanyMemoryStore, INITIAL_COMPANY_MEMORIES } from '../../src/lib/server/memory/memory-store';
import { getDatabaseMode } from '../../src/lib/server/db/authority';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';
import { CompanyMemory } from '../../src/types/os';

/**
 * ============================================================================
 * M1 BATCH 1 REGRESSION SUITE: MEMORY RETRIEVAL & AUTHORITY HARDENING
 * ============================================================================
 *
 * Verifies the three fixes implemented in M1 Batch 1:
 *   1. M1-F11: DATABASE_MODE parser handles 'sqlite' as an alias for 'local',
 *      preventing silent fallback to production authoritative mode.
 *   2. M1-F02: CompanyMemoryStore.queryMemories() routes through getAllMemories(),
 *      guaranteeing that in authoritative mode the database is the true source
 *      of truth rather than an isolated in-process cache.
 *   3. M1-F03: CompanyMemoryStore.recordMemory() uses saveItemStrict() in local
 *      mode, propagating persistence errors and preventing cache split-brain.
 *   4. Deduplication: recordMemory replaces by ID instead of unshifting duplicates.
 */

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
  console.log('M1 BATCH 1 REGRESSION SUITE');
  console.log('======================================================\n');

  // Preserve original environment
  const origDatabaseMode = process.env.DATABASE_MODE;
  const origNodeEnv = process.env.NODE_ENV;

  try {
    // ------------------------------------------------------------------------
    // GROUP 1: M1-F11 — DATABASE_MODE PARSING & ALIAS HANDLING
    // ------------------------------------------------------------------------
    await runTest('M1-F11.1: DATABASE_MODE=sqlite is parsed as local mode', () => {
      process.env.DATABASE_MODE = 'sqlite';
      assert.strictEqual(getDatabaseMode(), 'local');
      
      // Case-insensitivity check
      process.env.DATABASE_MODE = 'SQLITE';
      assert.strictEqual(getDatabaseMode(), 'local');
    });

    await runTest('M1-F11.2: Standard DATABASE_MODE values take top precedence', () => {
      process.env.DATABASE_MODE = 'local';
      assert.strictEqual(getDatabaseMode(), 'local');

      process.env.DATABASE_MODE = 'authoritative';
      assert.strictEqual(getDatabaseMode(), 'authoritative');

      process.env.DATABASE_MODE = 'test';
      assert.strictEqual(getDatabaseMode(), 'test');
    });

    await runTest('M1-F11.3: Unset DATABASE_MODE falls back to NODE_ENV correctly', () => {
      delete process.env.DATABASE_MODE;

      process.env.NODE_ENV = 'production';
      assert.strictEqual(getDatabaseMode(), 'authoritative');

      process.env.NODE_ENV = 'test';
      assert.strictEqual(getDatabaseMode(), 'test');

      process.env.NODE_ENV = 'development';
      assert.strictEqual(getDatabaseMode(), 'local');
    });

    // ------------------------------------------------------------------------
    // GROUP 2: M1-F02 — AUTHORITATIVE RETRIEVAL VIA getAllMemories()
    // ------------------------------------------------------------------------
    const memoryStore = CompanyMemoryStore.getInstance();

    await runTest('M1-F02.1: queryMemories routes through getAllMemories(), not private cache', async () => {
      // In local mode, ensure clean baseline
      await memoryStore.setMemories([...INITIAL_COMPANY_MEMORIES]);

      const markerMemory: CompanyMemory = {
        id: 'mem-batch1-routing-marker',
        decisionId: 'dec-batch1-marker',
        approvedAction: 'Batch 1 Authoritative Routing Verification Marker Protocol',
        executionOutcome: 'Verified that queryMemories reads candidates from getAllMemories',
        evidenceReferences: ['m1-batch1-evidence'],
        epistemicConfidence: 'high_confidence',
        timestamp: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
      };

      const originalGetAllMemories = memoryStore.getAllMemories.bind(memoryStore);

      try {
        // Spy / stub getAllMemories to return the marker memory
        (memoryStore as any).getAllMemories = async () => [markerMemory];

        const results = await memoryStore.queryMemories({
          queryText: 'Batch 1 Authoritative Routing Verification',
          limit: 5,
        });

        assert.ok(
          results.some((r) => r.memoryId === 'mem-batch1-routing-marker'),
          'queryMemories must score candidates provided by getAllMemories(), not this.memories cache'
        );
      } finally {
        (memoryStore as any).getAllMemories = originalGetAllMemories;
      }

      // After restoring original method, verify marker (never persisted) is no longer returned
      const afterResults = await memoryStore.queryMemories({
        queryText: 'Batch 1 Authoritative Routing Verification',
        limit: 5,
      });
      assert.ok(
        !afterResults.some((r) => r.memoryId === 'mem-batch1-routing-marker'),
        'queryMemories restores normal candidate set after getAllMemories restoration'
      );
    });

    // ------------------------------------------------------------------------
    // GROUP 3: M1-F03 — LOCAL PERSISTENCE ERROR PROPAGATION
    // ------------------------------------------------------------------------
    await runTest('M1-F03.1: recordMemory propagates failure when file persistence fails', async () => {
      process.env.DATABASE_MODE = 'local';
      process.env.NODE_ENV = 'test';

      const fileStore = DurableFileStore.getInstance();
      const originalSaveItemStrict = fileStore.saveItemStrict.bind(fileStore);

      const unpersistedMemory: CompanyMemory = {
        id: 'mem-batch1-fail-disk',
        decisionId: 'dec-batch1-fail-disk',
        approvedAction: 'Attempted memory with simulated disk persistence failure',
        executionOutcome: 'Simulating IO failure',
        evidenceReferences: ['m1-test'],
        epistemicConfidence: 'high_confidence',
        timestamp: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
      };

      try {
        // Mock saveItemStrict to throw simulated disk failure
        (fileStore as any).saveItemStrict = () => {
          throw new Error('ENOSPC: no space left on device');
        };

        let threw = false;
        try {
          await memoryStore.recordMemory(unpersistedMemory);
        } catch (err: any) {
          threw = true;
          assert.ok(err.message.includes('ENOSPC'), 'Error message must reflect filesystem failure');
        }

        assert.ok(threw, 'recordMemory must throw when DurableFileStore.saveItemStrict throws');

        // Verify the in-memory cache was NOT modified with the failed memory
        const allMemories = await memoryStore.getAllMemories();
        assert.ok(
          !allMemories.some((m) => m.id === 'mem-batch1-fail-disk'),
          'In-memory cache must not contain the memory if disk persistence failed'
        );
      } finally {
        (fileStore as any).saveItemStrict = originalSaveItemStrict;
      }
    });

    await runTest('M1-F03.2: recordMemory successfully persists and updates in-memory cache', async () => {
      process.env.DATABASE_MODE = 'local';
      process.env.NODE_ENV = 'test';

      const validMemory: CompanyMemory = {
        id: 'mem-batch1-success',
        decisionId: 'dec-batch1-success',
        approvedAction: 'Valid memory recorded during Batch 1 verification',
        executionOutcome: 'Successfully verified durable recording',
        evidenceReferences: ['m1-success-ref'],
        epistemicConfidence: 'high_confidence',
        timestamp: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
      };

      await memoryStore.recordMemory(validMemory);

      const allMemories = await memoryStore.getAllMemories();
      assert.ok(
        allMemories.some((m) => m.id === 'mem-batch1-success'),
        'Successfully persisted memory must be present in getAllMemories()'
      );

      // Verify queryMemories can retrieve it
      const queryHits = await memoryStore.queryMemories({
        queryText: 'Valid memory recorded during Batch 1',
        limit: 5,
      });
      assert.ok(
        queryHits.some((h) => h.memoryId === 'mem-batch1-success'),
        'queryMemories must retrieve the newly recorded valid memory'
      );
    });

    // ------------------------------------------------------------------------
    // GROUP 4: DEDUPLICATION & REPLACEMENT INTEGRITY
    // ------------------------------------------------------------------------
    await runTest('M1-F03.3: recordMemory updates existing memory by ID without duplicate unshifting', async () => {
      const initialCount = (await memoryStore.getAllMemories()).length;

      const updatedMemory: CompanyMemory = {
        id: 'mem-batch1-success',
        decisionId: 'dec-batch1-success-updated',
        approvedAction: 'Updated action for Batch 1 verification memory',
        executionOutcome: 'Verified update replaces existing memory by ID',
        evidenceReferences: ['m1-success-ref-v2'],
        epistemicConfidence: 'high_confidence',
        timestamp: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
      };

      await memoryStore.recordMemory(updatedMemory);

      const allMemories = await memoryStore.getAllMemories();
      assert.strictEqual(
        allMemories.length,
        initialCount,
        'Count must remain unchanged when updating an existing memory ID'
      );

      const retrieved = await memoryStore.getMemoryById('mem-batch1-success');
      assert.strictEqual(
        retrieved?.approvedAction,
        'Updated action for Batch 1 verification memory',
        'Updated action must be reflected'
      );
    });

  } finally {
    // Restore original environment
    if (origDatabaseMode !== undefined) {
      process.env.DATABASE_MODE = origDatabaseMode;
    } else {
      delete process.env.DATABASE_MODE;
    }
    if (origNodeEnv !== undefined) {
      process.env.NODE_ENV = origNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  }

  console.log('\n======================================================');
  console.log(`M1 BATCH 1 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
