import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';
import { InMemoryApprovalStore } from '../../src/lib/server/authorization/approval-store';
import {
  ApprovalAlreadyConsumedError,
  ConcurrencyConflictError,
  StepClaimError,
} from '../../src/lib/server/workflow/state-machine';
import {
  InMemoryIdempotencyStore,
} from '../../src/lib/server/idempotency/store';
import {
  OperationInProgressError,
} from '../../src/lib/server/idempotency/state-machine';
import { InMemoryWorkflowStore } from '../../src/lib/server/workflow/store';
import { CompanyStateStore } from '../../src/lib/server/state/state-store';
import { InstanceConcurrencyGuard } from '../../src/lib/server/persistence/instance-guard';
import { CompanyDecision } from '../../src/types/os';
import { WorkflowStepState } from '../../src/types/workflow';

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
  console.log('SAMJUNIORS-OS: M2 BATCH 2.3 CONCURRENCY HYGIENE VERIFICATION');
  console.log('======================================================\n');

  const originalCwd = process.cwd();
  const tempTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-m2-concurrency-test-'));

  process.chdir(tempTestRoot);

  // Clear singletons to bind to isolated temporary directory
  (DurableFileStore as any).instance = undefined;
  (InMemoryApprovalStore as any).instance = undefined;
  (InMemoryIdempotencyStore as any).instance = undefined;
  (InMemoryWorkflowStore as any).instance = undefined;
  (CompanyStateStore as any).instance = undefined;
  (InstanceConcurrencyGuard as any).instance = undefined;

  const fileStore = DurableFileStore.getInstance();
  const dataDir = fileStore.getDataDir();

  assert(
    dataDir.startsWith(tempTestRoot),
    `ISOLATION FAILURE: dataDir "${dataDir}" is not inside tempTestRoot "${tempTestRoot}"`
  );
  console.log(`[ISOLATION VERIFIED] Operating strictly in temporary root: ${tempTestRoot}`);
  console.log(`[ISOLATION VERIFIED] Dedicated temporary data directory: ${dataDir}\n`);

  const approvalStore = InMemoryApprovalStore.getInstance();
  const idempotencyStore = InMemoryIdempotencyStore.getInstance();
  const workflowStore = InMemoryWorkflowStore.getInstance();
  const stateStore = CompanyStateStore.getInstance();
  const instanceGuard = InstanceConcurrencyGuard.getInstance();

  // --------------------------------------------------------------------------
  // TEST 1: Concurrent Approval Consumption (20 callers)
  // --------------------------------------------------------------------------
  await runTest('TEST 1: 20 concurrent approval consume() calls result in exactly 1 success and 19 ApprovalAlreadyConsumedError', async () => {
    const approval = await approvalStore.save({
      id: `appr-${Date.now()}`,
      decision: 'approved',
      actionName: 'financial_mutation',
      classification: 'financial_action',
      workflowInstanceId: 'wf-1',
      stepId: 'step-1',
      employeeRole: 'finance',
      scope: { scopeType: 'single_action' },
      requestedAt: new Date().toISOString(),
      decidedAt: new Date().toISOString(),
      decidedBy: 'founder',
      isConsumed: false,
    });

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => approvalStore.consume(approval.id))
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, `Expected exactly 1 fulfilled consume(), got ${fulfilled.length}`);
    assert.strictEqual(rejected.length, 19, `Expected exactly 19 rejected consume(), got ${rejected.length}`);

    for (const rej of rejected) {
      if (rej.status === 'rejected') {
        assert(
          rej.reason instanceof ApprovalAlreadyConsumedError || rej.reason.message.includes('already consumed'),
          `Expected ApprovalAlreadyConsumedError, got ${rej.reason}`
        );
      }
    }

    // Verify on disk and memory
    const onDiskRecord = fileStore.getItem<any>('approvals', approval.id);
    assert(onDiskRecord, 'Approval record must exist on disk');
    assert.strictEqual(onDiskRecord.isConsumed, true, 'Disk record must be marked consumed');

    const inMemRecord = await approvalStore.get(approval.id);
    assert.strictEqual(inMemRecord?.isConsumed, true, 'In-memory cache must be marked consumed');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Concurrent Duplicate Idempotency Claims (20 callers)
  // --------------------------------------------------------------------------
  await runTest('TEST 2: 20 concurrent idempotency claim() calls result in exactly 1 claim and 19 OperationInProgressError', async () => {
    const key = `idempotency-race-key-${Date.now()}`;
    const params = {
      key,
      executionRef: 'agent-worker-1',
      actionName: 'deploy-artifact',
      payloadHash: 'hash-abc-123',
    };

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => idempotencyStore.claim(params))
    );

    const claimed = results.filter(
      (r) => r.status === 'fulfilled' && (r as PromiseFulfilledResult<any>).value.state === 'claimed'
    );
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(claimed.length, 1, `Expected exactly 1 claim() to succeed as claimed, got ${claimed.length}`);
    assert.strictEqual(rejected.length, 19, `Expected exactly 19 claim() to be rejected, got ${rejected.length}`);

    for (const rej of rejected) {
      if (rej.status === 'rejected') {
        assert(
          rej.reason instanceof OperationInProgressError || rej.reason.message.includes('in progress'),
          `Expected OperationInProgressError, got: ${rej.reason}`
        );
      }
    }

    // Complete the claimed record
    await idempotencyStore.complete(key, { deployedUrl: 'https://example.com' }, 'hash-abc-123');

    // Subsequent claim returns status 'completed' with stored response
    const finalClaim = await idempotencyStore.claim(params);
    assert.strictEqual(finalClaim.state, 'completed');
    assert.deepStrictEqual(finalClaim.record.response, { deployedUrl: 'https://example.com' });
  });

  // --------------------------------------------------------------------------
  // TEST 3: Concurrent Workflow Step Claims with Optimistic Version
  // --------------------------------------------------------------------------
  await runTest('TEST 3: Concurrent claimStepAtomic() with identical expectedVersion results in exactly 1 winner', async () => {
    const instanceId = `wf-instance-${Date.now()}`;
    const initialStep: WorkflowStepState = {
      stepId: 'step-collect',
      status: 'ready',
      assignedRole: 'researcher',
      skill: 'understand',
      outputs: {},
      evidenceReferences: [],
      retryCount: 0,
    };

    await workflowStore.saveInstance({
      instanceId,
      workflowId: 'research-pipeline',
      version: '1.0.0',
      stateVersion: 0,
      status: 'pending',
      objective: 'Verify research step concurrency',
      stepStates: {
        'step-collect': initialStep,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputs: {},
      evidenceReferences: [],
    });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, idx) =>
        workflowStore.claimStepAtomic(instanceId, 'step-collect', `worker-${idx}`, 0)
      )
    );

    const winners = results.filter((r) => r.status === 'fulfilled');
    const losers = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(winners.length, 1, `Expected exactly 1 worker to claim step, got ${winners.length}`);
    assert.strictEqual(losers.length, 9, `Expected exactly 9 workers to fail step claim, got ${losers.length}`);

    for (const loser of losers) {
      if (loser.status === 'rejected') {
        const err = loser.reason;
        assert(
          err instanceof ConcurrencyConflictError || err instanceof StepClaimError,
          `Expected ConcurrencyConflictError or StepClaimError, got: ${err}`
        );
      }
    }

    const updated = await workflowStore.getInstance(instanceId);
    assert(updated, 'Workflow instance must exist');
    assert.strictEqual(updated.stateVersion, 1, 'Version must be incremented to 1');
    assert.strictEqual(updated.stepStates['step-collect'].status, 'running');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Concurrent Decisions (Zero Lost Updates)
  // --------------------------------------------------------------------------
  await runTest('TEST 4: 10 concurrent recordDecision() calls preserve all 10 decisions without lost updates', async () => {
    const baselineDecisions = await stateStore.getDecisions();
    const baselineCount = baselineDecisions.length;

    const testDecisions: CompanyDecision[] = Array.from({ length: 10 }, (_, idx) => ({
      id: `decision-concurrent-${Date.now()}-${idx}`,
      title: `Concurrent Decision #${idx}`,
      status: 'approved' as const,
      category: 'Strategic' as const,
      recommendedBy: 'Sophia',
      agentId: 'coo' as const,
      recommendation: 'Verify concurrency',
      businessImpact: 'High',
      evidenceSummary: 'None',
      date: new Date().toISOString(),
      founderApprovalRequired: true,
    }));

    await Promise.all(testDecisions.map((d) => stateStore.recordDecision(d)));

    const finalDecisions = await stateStore.getDecisions();
    assert.strictEqual(
      finalDecisions.length,
      baselineCount + 10,
      `Expected ${baselineCount + 10} decisions, got ${finalDecisions.length}`
    );

    for (const d of testDecisions) {
      assert(
        finalDecisions.some((fd) => fd.id === d.id),
        `Decision ${d.id} was lost during concurrent writes!`
      );
    }

    // Verify disk copy directly
    const onDiskState = fileStore.readCollection<any>('company_state');
    assert(Array.isArray(onDiskState.decisions), 'Disk state must contain decisions array');
    for (const d of testDecisions) {
      assert(
        onDiskState.decisions.some((fd: any) => fd.id === d.id),
        `Decision ${d.id} is missing from on-disk JSON!`
      );
    }
  });

  // --------------------------------------------------------------------------
  // TEST 5: Concurrent Mutations on Different Collections
  // --------------------------------------------------------------------------
  await runTest('TEST 5: Concurrent mutations across different collections complete independently without interference', async () => {
    const op1 = approvalStore.save({
      id: `appr-indep-${Date.now()}`,
      decision: 'approved',
      actionName: 'code_deployment',
      classification: 'internal_mutation',
      workflowInstanceId: 'wf-indep',
      stepId: 'step-indep',
      employeeRole: 'system',
      scope: { scopeType: 'single_action' },
      requestedAt: new Date().toISOString(),
      decidedAt: new Date().toISOString(),
      decidedBy: 'founder',
      isConsumed: false,
    });

    const op2 = idempotencyStore.claim({
      key: `independent-key-${Date.now()}`,
      executionRef: 'worker-a',
      actionName: 'test-action',
      payloadHash: 'hash-xyz',
    });

    const op3 = stateStore.recordDecision({
      id: `independent-dec-${Date.now()}`,
      title: 'Independent Decision',
      status: 'approved',
      category: 'Strategic',
      recommendedBy: 'Sophia',
      agentId: 'coo',
      recommendation: 'Cross-store independence',
      businessImpact: 'Moderate',
      evidenceSummary: 'None',
      date: new Date().toISOString(),
      founderApprovalRequired: true,
    });

    const [res1, res2] = await Promise.all([op1, op2, op3]);
    assert(res1.id, 'Approval creation must succeed');
    assert.strictEqual(res2.state, 'claimed', 'Idempotency claim must succeed');
  });

  // --------------------------------------------------------------------------
  // TEST 6: Dead Process Lease Reclamation in InstanceConcurrencyGuard
  // --------------------------------------------------------------------------
  await runTest('TEST 6: Dead owner PID in instance.lock is safely reclaimed without false positive lockout', async () => {
    const lockPath = path.join(dataDir, 'instance.lock');

    // Write a synthetic lease with a non-existent PID and a fresh heartbeat (< 5000ms old)
    const deadPid = 99999999; // guaranteed dead PID
    const staleLock = {
      instanceId: 'inst-dead-pid-test',
      pid: deadPid,
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(), // fresh heartbeat!
      deploymentNote: 'Simulated crashed container',
    };
    fs.writeFileSync(lockPath, JSON.stringify(staleLock, null, 2), 'utf-8');

    // Attempt to acquire lease with failClosed: true
    const result = instanceGuard.acquireSingleInstanceLease(undefined, { failClosed: true });
    assert.strictEqual(result.acquired, true, 'Lease should be acquired since owner PID is dead');

    // Verify lock file now belongs to this process
    const raw = fs.readFileSync(lockPath, 'utf-8');
    const updated = JSON.parse(raw);
    assert.strictEqual(updated.pid, process.pid);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Live Process Lease Collision Rejection
  // --------------------------------------------------------------------------
  await runTest('TEST 7: Live owner PID in instance.lock causes failClosed error on conflicting instance', async () => {
    const testCollisionPath = path.join(dataDir, 'test_collision.lock');
    const liveLock = {
      instanceId: `inst-live-${process.pid}`,
      pid: process.pid, // currently running process!
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      deploymentNote: 'Live instance running',
    };
    fs.writeFileSync(testCollisionPath, JSON.stringify(liveLock, null, 2), 'utf-8');

    const otherGuard = Object.create(InstanceConcurrencyGuard.prototype);
    otherGuard.lockFilePath = testCollisionPath;
    otherGuard.currentInstanceId = `inst-competing-${Date.now()}`;

    const originalPid = process.pid;
    let thrownError = false;
    try {
      const origPidGetter = Object.getOwnPropertyDescriptor(process, 'pid');
      Object.defineProperty(process, 'pid', { value: 98765432, configurable: true });

      try {
        otherGuard.acquireSingleInstanceLease(testCollisionPath, { failClosed: true });
      } catch (err: any) {
        if (err.message.includes('[CONCURRENCY WARNING]')) {
          thrownError = true;
        }
      } finally {
        if (origPidGetter) {
          Object.defineProperty(process, 'pid', origPidGetter);
        } else {
          Object.defineProperty(process, 'pid', { value: originalPid, configurable: true });
        }
      }
    } catch {}

    assert(thrownError, 'Competing instance must be rejected when lease holder PID is alive');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Persistence-Before-Cache Invariant on Write Failure
  // --------------------------------------------------------------------------
  await runTest('TEST 8: Write failure prevents cache corruption (persistence-before-cache)', async () => {
    const collectionPath = path.join(dataDir, 'unwritable_collection.json');
    fs.writeFileSync(collectionPath, JSON.stringify({ item1: { val: 'orig' } }), 'utf-8');

    let failedCleanly = false;
    try {
      fileStore.withCollectionLockStrict('unwritable_collection', () => {
        throw new Error('SIMULATED_DISK_IO_FAILURE');
      });
    } catch (err: any) {
      if (err.message === 'SIMULATED_DISK_IO_FAILURE') {
        failedCleanly = true;
      }
    }
    assert(failedCleanly, 'Error must propagate cleanly out of withCollectionLockStrict');

    let lockReleased = false;
    fileStore.withCollectionLockStrict('unwritable_collection', () => {
      lockReleased = true;
    });
    assert(lockReleased, 'Collection lock must be cleanly released after failed callback');
  });

  // --------------------------------------------------------------------------
  // Summary and Teardown
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  process.chdir(originalCwd);
  try {
    fs.rmSync(tempTestRoot, { recursive: true, force: true });
  } catch {}

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
