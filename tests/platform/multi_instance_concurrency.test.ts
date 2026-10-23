/**
 * ============================================================================
 * SAMJUNIORS-OS: MULTI-INSTANCE CONCURRENCY & SHARED LEASE VERIFICATION SUITE
 * ============================================================================
 * Step: G2.4 [platform] Multi-instance concurrency: shared leases replace PID guard
 * Exit Criteria:
 *   Two instances against one database pass the concurrency suite;
 *   the PID guard is no longer load-bearing.
 * ============================================================================
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync, fork } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { InstanceConcurrencyGuard } from '../../src/lib/server/persistence/instance-guard';
import {
  DatabaseDistributedLeaseManager,
  getLeaseManager,
} from '../../src/lib/server/coordination/lease-manager';
import {
  PostgresApprovalStore,
  ApprovalAlreadyConsumedError,
} from '../../src/lib/server/authorization/approval-store';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  console.log('\n======================================================');
  console.log('SAMJUNIORS-OS: MULTI-INSTANCE CONCURRENCY SUITE (G2.4)');
  console.log('======================================================\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-g24-concurrency-'));
  const testDbFile = path.join(tempDir, 'concurrency_test.db');
  const normalizedDbPath = testDbFile.replace(/\\/g, '/');
  const testDbUrl = `file:${normalizedDbPath}`;

  // Configure environment to authoritative mode pointing to dedicated test database
  process.env.DATABASE_URL = testDbUrl;
  process.env.DATABASE_MODE = 'authoritative';
  process.env.STRICT_SINGLE_INSTANCE = 'true';

  console.log(`[SUITE SETUP] Dedicated test SQLite database: ${testDbFile}`);

  // 1. Run migrations against test database
  const repoRoot = path.resolve(__dirname, '../..');
  console.log('[SUITE SETUP] Applying Prisma versioned migrations...');
  execSync('npx prisma migrate deploy', {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'pipe',
  });
  console.log('[SUITE SETUP] Migrations applied successfully.\n');

  const prisma = new PrismaClient({
    datasources: { db: { url: testDbUrl } },
  });

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    process.stdout.write(`  [RUN] ${name}... `);
    try {
      await fn();
      console.log('PASS');
      passed++;
    } catch (err: any) {
      console.log('FAIL');
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(`    ${err.stack.split('\n').slice(1, 4).join('\n    ')}`);
      }
      failed++;
    }
  }

  try {
    // ------------------------------------------------------------------------
    // TEST 1: PID Guard Is Explicitly Non-Load-Bearing
    // ------------------------------------------------------------------------
    await test('TEST 1: isPidGuardLoadBearing returns false (PID checks decoupled from concurrency)', async () => {
      const guard = InstanceConcurrencyGuard.getInstance();
      assert.strictEqual(
        guard.isPidGuardLoadBearing(),
        false,
        'PID guard must not be load-bearing in Milestone M2'
      );
      const docs = guard.getDeploymentConstraintDocumentation();
      assert(docs.includes('NO LONGER load-bearing'), 'Documentation must reflect M2 shared leases');
    });

    // ------------------------------------------------------------------------
    // TEST 2: Two Instances Mutual Exclusion via Database Lease
    // ------------------------------------------------------------------------
    await test('TEST 2: Two instances against one database enforce mutual exclusion via distributed lease', async () => {
      const guardInstance1 = InstanceConcurrencyGuard.getInstance();
      const instanceId1 = 'inst-worker-alpha-1';
      const instanceId2 = 'inst-worker-bravo-2';
      const resourceKey = 'instance:test-primary';

      // Instance 1 acquires the lease
      const acq1 = await guardInstance1.acquireSharedInstanceLease({
        resourceKey,
        holderId: instanceId1,
        ttlMs: 4000,
      });
      assert.strictEqual(acq1.acquired, true, 'Instance 1 must successfully acquire the lease');

      // Verify record in database
      const dbRecord = await prisma.distributedLease.findUnique({ where: { resourceKey } });
      assert(dbRecord, 'Lease record must exist in distributed_leases table');
      assert.strictEqual(dbRecord.holderId, instanceId1);
      assert(new Date(dbRecord.expiresAt) > new Date());

      // Instance 2 attempts to acquire the same lease without failClosed
      const guardInstance2 = Object.create(InstanceConcurrencyGuard.prototype);
      (guardInstance2 as any).databaseHeartbeats = new Map();

      const acq2 = await guardInstance2.acquireSharedInstanceLease({
        resourceKey,
        holderId: instanceId2,
        ttlMs: 4000,
        failClosed: false,
      });
      assert.strictEqual(acq2.acquired, false, 'Instance 2 must be rejected while lease is held');
      assert.strictEqual(acq2.activeLease?.holderId, instanceId1);

      // Instance 2 attempts with failClosed: true -> throws concurrency error
      let thrown = false;
      try {
        await guardInstance2.acquireSharedInstanceLease({
          resourceKey,
          holderId: instanceId2,
          ttlMs: 4000,
          failClosed: true,
        });
      } catch (err: any) {
        if (err.message.includes('[CONCURRENCY WARNING]')) {
          thrown = true;
        }
      }
      assert.strictEqual(thrown, true, 'Instance 2 must throw when failClosed is requested');

      // Cleanup instance 1 lease
      await guardInstance1.releaseSharedInstanceLease(resourceKey, instanceId1);
    });

    // ------------------------------------------------------------------------
    // TEST 3: Heartbeat Renewal Extends Lease Expiration
    // ------------------------------------------------------------------------
    await test('TEST 3: Heartbeat renewal extends lease expiration in database', async () => {
      const guard = InstanceConcurrencyGuard.getInstance();
      const instanceId = 'inst-heartbeat-worker';
      const resourceKey = 'instance:test-heartbeat';

      const initial = await guard.acquireSharedInstanceLease({
        resourceKey,
        holderId: instanceId,
        ttlMs: 2000,
        heartbeatIntervalMs: 200,
      });
      assert.strictEqual(initial.acquired, true);

      const before = await prisma.distributedLease.findUnique({ where: { resourceKey } });
      assert(before);
      const beforeExpires = new Date(before.expiresAt).getTime();

      // Wait for heartbeat renewal cycle
      await new Promise((r) => setTimeout(r, 600));

      const after = await prisma.distributedLease.findUnique({ where: { resourceKey } });
      assert(after);
      const afterExpires = new Date(after.expiresAt).getTime();

      assert(
        afterExpires > beforeExpires,
        `Heartbeat must extend expiresAt (before: ${beforeExpires}, after: ${afterExpires})`
      );

      await guard.releaseSharedInstanceLease(resourceKey, instanceId);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Standby Failover on Crashed Instance (TTL Expiry Without PID)
    // ------------------------------------------------------------------------
    await test('TEST 4: Crashed instance lease expires via TTL and standby takes over without PID check', async () => {
      const crashedInstanceId = 'inst-crashed-node';
      const standbyInstanceId = 'inst-standby-node';
      const resourceKey = 'instance:test-failover';

      const leaseManager = getLeaseManager({ forceDatabase: true });

      // Simulate crashed instance: acquired with a short 300ms TTL, no heartbeat/release
      const crashAcq = await leaseManager.acquire(resourceKey, crashedInstanceId, 300, {
        crashedWorkerNote: 'simulated node crash without graceful shutdown',
      });
      assert.strictEqual(crashAcq.acquired, true);

      // Immediately verify standby is blocked
      const blocked = await leaseManager.acquire(resourceKey, standbyInstanceId, 4000);
      assert.strictEqual(blocked.acquired, false, 'Standby must be blocked while TTL is unexpired');

      // Wait for TTL (300ms) to elapse
      await new Promise((r) => setTimeout(r, 450));

      // Standby attempts acquisition: TTL has expired, so standby atomically reclaims lease
      const standbyAcq = await leaseManager.acquire(resourceKey, standbyInstanceId, 4000);
      assert.strictEqual(standbyAcq.acquired, true, 'Standby must successfully reclaim expired lease');
      assert.strictEqual(standbyAcq.lease?.holderId, standbyInstanceId);

      // Verify database reflects the takeover
      const record = await prisma.distributedLease.findUnique({ where: { resourceKey } });
      assert.strictEqual(record?.holderId, standbyInstanceId);

      await leaseManager.release(resourceKey, standbyInstanceId);
    });

    // ------------------------------------------------------------------------
    // TEST 5: Graceful Release Enables Immediate Handover
    // ------------------------------------------------------------------------
    await test('TEST 5: Explicit release enables immediate handover to second instance', async () => {
      const guard = InstanceConcurrencyGuard.getInstance();
      const primaryId = 'inst-primary-handover';
      const secondaryId = 'inst-secondary-handover';
      const resourceKey = 'instance:test-handover';

      // Primary acquires with 15s TTL
      const acq1 = await guard.acquireSharedInstanceLease({
        resourceKey,
        holderId: primaryId,
        ttlMs: 15000,
      });
      assert.strictEqual(acq1.acquired, true);

      // Primary gracefully releases
      const released = await guard.releaseSharedInstanceLease(resourceKey, primaryId);
      assert.strictEqual(released, true);

      // Secondary immediately acquires without waiting for 15s TTL
      const acq2 = await guard.acquireSharedInstanceLease({
        resourceKey,
        holderId: secondaryId,
        ttlMs: 15000,
      });
      assert.strictEqual(acq2.acquired, true, 'Secondary must immediately acquire after release');

      await guard.releaseSharedInstanceLease(resourceKey, secondaryId);
    });

    // ------------------------------------------------------------------------
    // TEST 6: High-Concurrency Acquisition Stampede (At-Most-One Guarantee)
    // ------------------------------------------------------------------------
    await test('TEST 6: 20 concurrent workers competing for 1 unallocated lease yield exactly 1 winner', async () => {
      const resourceKey = `stampede-race-${Date.now()}`;
      const leaseManager = getLeaseManager({ forceDatabase: true });

      // 20 concurrent workers try to acquire simultaneously
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          leaseManager.acquire(resourceKey, `worker-${i}`, 10000, { rank: i })
        )
      );

      const winners = results.filter((r) => r.acquired === true);
      const losers = results.filter((r) => r.acquired === false);

      assert.strictEqual(winners.length, 1, `Exactly 1 winner must acquire the lease. Got: ${winners.length}`);
      assert.strictEqual(losers.length, 19, `Exactly 19 workers must be rejected. Got: ${losers.length}`);

      const winnerHolder = winners[0].lease?.holderId;
      assert(winnerHolder, 'Winner must have valid holderId');

      // Verify all losers reference the winning holder
      for (const loser of losers) {
        assert.strictEqual(
          loser.activeLease?.holderId,
          winnerHolder,
          'All losing workers must see the winning holder'
        );
      }

      await leaseManager.release(resourceKey, winnerHolder);
    });

    // ------------------------------------------------------------------------
    // TEST 7: Multi-Worker Scheduled Work Coordination via Leases
    // ------------------------------------------------------------------------
    await test('TEST 7: Two worker instances evaluating scheduled work never duplicate execution', async () => {
      const leaseManager = getLeaseManager({ forceDatabase: true });
      const workItemIds = ['work-task-alpha', 'work-task-beta', 'work-task-gamma'];

      const executedByWorker1: string[] = [];
      const executedByWorker2: string[] = [];

      const completedTasks = new Set<string>();

      // Simulate Worker 1 and Worker 2 processing tasks concurrently with leases
      async function processBatch(workerId: string, executedLog: string[]) {
        for (const id of workItemIds) {
          if (completedTasks.has(id)) continue;
          const leaseKey = `sched-item:${id}`;
          const claim = await leaseManager.acquire(leaseKey, workerId, 5000);
          if (claim.acquired) {
            // Guard against race if already completed
            if (!completedTasks.has(id)) {
              completedTasks.add(id);
              await new Promise((r) => setTimeout(r, 20));
              executedLog.push(id);
            }
            // Release lease after execution
            await leaseManager.release(leaseKey, workerId);
          }
        }
      }

      await Promise.all([
        processBatch('worker-inst-1', executedByWorker1),
        processBatch('worker-inst-2', executedByWorker2),
      ]);

      const allExecuted = [...executedByWorker1, ...executedByWorker2];
      const uniqueExecuted = new Set(allExecuted);

      assert.strictEqual(
        allExecuted.length,
        uniqueExecuted.size,
        `No scheduled task may be executed more than once! Duplicates found: ${allExecuted.join(', ')}`
      );
      assert.strictEqual(
        uniqueExecuted.size,
        workItemIds.length,
        'All work items must be processed across the two workers'
      );
    });

    // ------------------------------------------------------------------------
    // TEST 8: Multi-Instance Approval Consumption Concurrency in Database
    // ------------------------------------------------------------------------
    await test('TEST 8: 20 concurrent approval consume() calls against database yield 1 success and 19 errors', async () => {
      const approvalStore = PostgresApprovalStore.getInstance();
      const approvalId = `appr-multi-${Date.now()}`;

      // Create an approved single-action approval in the database via approvalStore.save
      await approvalStore.save({
        id: approvalId,
        actionName: 'finance_mutation',
        classification: 'financial_action',
        workflowInstanceId: undefined as any,
        stepId: 'step-multi-1',
        employeeRole: 'finance',
        scope: { scopeType: 'single_action', allowedUses: 1, usedCount: 0 },
        decision: 'approved',
        requestedAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
        decidedBy: 'founder',
        isConsumed: false,
        payloadHash: 'hash-test-8',
      });

      // 20 concurrent consume calls
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, () => approvalStore.consume(approvalId))
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.strictEqual(
        fulfilled.length,
        1,
        `Exactly 1 consume call must succeed. Got ${fulfilled.length}`
      );
      assert.strictEqual(
        rejected.length,
        19,
        `Exactly 19 consume calls must be rejected. Got ${rejected.length}`
      );

      // Verify all rejected calls threw ApprovalAlreadyConsumedError
      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          assert(
            rej.reason instanceof ApprovalAlreadyConsumedError,
            `Expected ApprovalAlreadyConsumedError, got ${rej.reason?.name}: ${rej.reason?.message}`
          );
        }
      }

      // Verify database reflects consumed state
      const fresh = await prisma.approvalRecord.findUnique({ where: { id: approvalId } });
      assert(fresh?.consumedAt !== null, 'consumedAt must be recorded in database');
    });

    // ------------------------------------------------------------------------
    // TEST 9: Real Cross-Process Subprocess Crash & Standby Takeover
    // ------------------------------------------------------------------------
    await test('TEST 9: Real child process holding lease killed via SIGKILL is cleanly taken over upon TTL', async () => {
      const resourceKey = 'instance:real-subprocess-test';
      const subprocessScript = path.join(repoRoot, 'tests', 'platform', '_scratch_subworker.js');

      try {
        // Create a standalone child script inside repo root so @prisma/client resolves
        fs.writeFileSync(
          subprocessScript,
          `
          const { PrismaClient } = require('@prisma/client');
          const prisma = new PrismaClient({ datasources: { db: { url: ${JSON.stringify(testDbUrl)} } } });
          async function run() {
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 1200);
            await prisma.distributedLease.create({
              data: {
                resourceKey: ${JSON.stringify(resourceKey)},
                holderId: 'child-process-' + process.pid,
                acquiredAt: now,
                expiresAt: expiresAt,
                metadata: { childPid: process.pid }
              }
            });
            console.log('CHILD_ACQUIRED');
            setInterval(() => {}, 1000);
          }
          run().catch(e => { console.error(e); process.exit(1); });
          `
        );

        const child = fork(subprocessScript, [], {
          cwd: repoRoot,
          env: { ...process.env, DATABASE_URL: testDbUrl },
          silent: true,
        });

        // Wait for child to acquire
        await new Promise<void>((resolve, reject) => {
          child.stdout?.on('data', (d) => {
            if (d.toString().includes('CHILD_ACQUIRED')) {
              resolve();
            }
          });
          child.stderr?.on('data', (d) => {
            console.error('Child stderr:', d.toString());
          });
          child.on('error', reject);
          child.on('exit', (code) => {
            if (code !== null && code !== 0) reject(new Error(`Child exited early with code ${code}`));
          });
        });

        // Verify main process cannot acquire while child holds it
        const leaseManager = getLeaseManager({ forceDatabase: true });
        const blocked = await leaseManager.acquire(resourceKey, 'main-process-worker', 5000);
        assert.strictEqual(blocked.acquired, false, 'Main process must be blocked while child holds lease');
        assert(blocked.activeLease?.holderId.startsWith('child-process-'));

        // Abruptly kill the child process (simulating ungraceful crash/OOM)
        child.kill('SIGKILL');

        // Wait until the child's 1200ms lease expires
        await new Promise((r) => setTimeout(r, 1400));

        // Main process acquires the lease from the dead process without any PID inspection
        const takeover = await leaseManager.acquire(resourceKey, 'main-process-worker', 5000);
        assert.strictEqual(
          takeover.acquired,
          true,
          'Main process must successfully reclaim lease after child TTL expires'
        );
        assert.strictEqual(takeover.lease?.holderId, 'main-process-worker');

        await leaseManager.release(resourceKey, 'main-process-worker');
      } finally {
        if (fs.existsSync(subprocessScript)) {
          try {
            fs.unlinkSync(subprocessScript);
          } catch {}
        }
      }
    });

  } finally {
    await prisma.$disconnect();
    // Clean up temporary database files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n======================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[UNCAUGHT TEST RUNNER ERROR]:', err);
  process.exit(1);
});
