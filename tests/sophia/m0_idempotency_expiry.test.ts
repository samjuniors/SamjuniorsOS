import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { InMemoryIdempotencyStore } from '../../src/lib/server/idempotency/store';
import { OperationInProgressError } from '../../src/lib/server/idempotency/state-machine';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';

/**
 * ============================================================================
 * M0 REGRESSION SUITE — IDEMPOTENCY expiresAt ENFORCEMENT
 * ============================================================================
 *
 * Verifies the M0 hygiene fix mandated by the Founder-approved reconciliation
 * plan (docs/architecture/MEMORY_RECONCILIATION_REPORT.md, migration step M0,
 * risk item K-6): the `expiresAt` field was stored on claim (when `ttlMs`
 * was provided) but NEVER enforced — `claim()` and `get()` treated expired
 * records identically to live ones, so a TTL could never take effect.
 *
 * Enforced semantics (documented on IdempotencyStore.claim):
 *   - An expired record is treated as ABSENT: get() returns null and a new
 *     claim overwrites it (bounds the crash window for in_progress claims
 *     and the response-cache validity window for completed records).
 *   - Records without expiresAt never expire (historical replay contract).
 *   - Payload-hash binding still applies to LIVE records.
 *
 * Local-mode store (in-memory + DurableFileStore primary per ADR 0002).
 */

const DATA_DIR = path.resolve(process.cwd(), '.data');
const IDEMPOTENCY_FILE = path.join(DATA_DIR, 'idempotency_records.json');

let passed = 0;
let failed = 0;
let originalFile: string | null = null;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failed++;
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('M0 IDEMPOTENCY EXPIRY ENFORCEMENT REGRESSION SUITE');
  console.log('======================================================\n');

  if (fs.existsSync(IDEMPOTENCY_FILE)) {
    originalFile = fs.readFileSync(IDEMPOTENCY_FILE, 'utf-8');
  }

  try {
    const store = InMemoryIdempotencyStore.getInstance();

    await test('1. Records without ttlMs never expire (historical replay contract preserved)', async () => {
      const r1 = await store.claim({ key: 'm0-no-ttl-001', actionName: 'test.action' });
      assert.strictEqual(r1.state, 'claimed');
      await store.complete('m0-no-ttl-001', { result: 'done' });
      const got = await store.get('m0-no-ttl-001');
      assert.ok(got, 'Record without expiresAt must remain visible forever');
      assert.strictEqual(got!.status, 'completed');
      assert.strictEqual(got!.expiresAt, null);
      // Replay still resolves as completed
      const r2 = await store.claim({ key: 'm0-no-ttl-001', actionName: 'test.action' });
      assert.strictEqual(r2.state, 'completed');
    });

    await test('2. get() hides an expired completed record (no stale cached responses)', async () => {
      await store.claim({ key: 'm0-exp-completed-001', actionName: 'test.action', ttlMs: 40 });
      await store.complete('m0-exp-completed-001', { result: 'cached' });
      // Live window: visible
      assert.ok(await store.get('m0-exp-completed-001'), 'Before expiry the record must be visible');
      await new Promise((r) => setTimeout(r, 60));
      // After expiry: hidden
      assert.strictEqual(
        await store.get('m0-exp-completed-001'),
        null,
        'After expiry, get() must return null — the pre-execution replay path must not serve a stale cached response'
      );
    });

    await test('3. claim() treats an expired record as ABSENT (fresh claim, no conflict)', async () => {
      await store.claim({ key: 'm0-exp-reclaim-001', actionName: 'test.action', ttlMs: 40 });
      await store.complete('m0-exp-reclaim-001', { result: 'first-run' });
      await new Promise((r) => setTimeout(r, 60));

      const reclaimed = await store.claim({ key: 'm0-exp-reclaim-001', actionName: 'test.action' });
      assert.strictEqual(
        reclaimed.state,
        'claimed',
        `An expired record must be re-claimable, got ${reclaimed.state}`
      );
      assert.strictEqual(reclaimed.record.status, 'in_progress');
    });

    await test('4. An expired in_progress record (crash window elapsed) becomes re-claimable', async () => {
      await store.claim({ key: 'm0-exp-crash-001', actionName: 'test.action', ttlMs: 40 });
      // Simulate a crashed worker: record stays in_progress, never completed.
      await new Promise((r) => setTimeout(r, 60));

      // While expired: get() hides it and a new claim succeeds instead of
      // throwing OperationInProgressError.
      assert.strictEqual(await store.get('m0-exp-crash-001'), null);
      const reclaimed = await store.claim({ key: 'm0-exp-crash-001', actionName: 'test.action' });
      assert.strictEqual(reclaimed.state, 'claimed');
    });

    await test('5. A LIVE in_progress record still conflicts (TTL bounds, does not remove, the window)', async () => {
      await store.claim({ key: 'm0-live-inprogress-001', actionName: 'test.action', ttlMs: 60_000 });
      let threw: any = null;
      try {
        await store.claim({ key: 'm0-live-inprogress-001', actionName: 'test.action' });
      } catch (err) {
        threw = err;
      }
      assert.ok(threw instanceof OperationInProgressError, `Expected OperationInProgressError, got ${threw?.constructor?.name}`);
      // Cleanup for later tests.
      await store.fail('m0-live-inprogress-001', 'test cleanup');
    });

    await test('6. Payload-hash binding still applies to LIVE records', async () => {
      await store.claim({ key: 'm0-payload-001', actionName: 'test.action', payloadHash: 'hash-aaa', ttlMs: 60_000 });
      let threw: any = null;
      try {
        await store.claim({ key: 'm0-payload-001', actionName: 'test.action', payloadHash: 'hash-bbb' });
      } catch (err) {
        threw = err;
      }
      assert.ok(threw, 'Live records must reject altered payloads');
      await store.fail('m0-payload-001', 'test cleanup');
    });

    await test('7. Expired records do NOT block different-payload re-claims', async () => {
      await store.claim({ key: 'm0-exp-payload-001', actionName: 'test.action', payloadHash: 'hash-aaa', ttlMs: 40 });
      await store.complete('m0-exp-payload-001', { result: 'first' });
      await new Promise((r) => setTimeout(r, 60));

      const reclaimed = await store.claim({ key: 'm0-exp-payload-001', actionName: 'test.action', payloadHash: 'hash-zzz' });
      assert.strictEqual(reclaimed.state, 'claimed', 'An expired record must not enforce its old payload binding');
    });

  } finally {
    try {
      if (originalFile !== null) {
        fs.writeFileSync(IDEMPOTENCY_FILE, originalFile, 'utf-8');
      } else if (fs.existsSync(IDEMPOTENCY_FILE)) {
        fs.unlinkSync(IDEMPOTENCY_FILE);
      }
      try {
        DurableFileStore.getInstance().clearCollection('idempotency_records');
      } catch {}
    } catch {}
  }

  console.log('\n======================================================');
  console.log(`M0 REGRESSION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('M0 suite crashed:', err);
  process.exitCode = 1;
});
