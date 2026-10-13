import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';
import { InMemoryApprovalStore, InMemoryAuditStore } from '../../src/lib/server/authorization/approval-store';
import {
  SideEffectAuthorizationGate,
  RequestApprovalParams,
} from '../../src/lib/server/authorization/gate';
import {
  InMemoryIdempotencyStore,
} from '../../src/lib/server/idempotency/store';
import {
  OperationInProgressError,
  UnknownExternalResultError,
  generateLogicalIdempotencyKey,
} from '../../src/lib/server/idempotency/state-machine';
import { InstanceConcurrencyGuard } from '../../src/lib/server/persistence/instance-guard';
import { computeApprovalPayloadHash } from '../../src/lib/server/authorization/payload-binding';

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

function resetSingletons() {
  (DurableFileStore as any).instance = undefined;
  (InMemoryApprovalStore as any).instance = undefined;
  (InMemoryAuditStore as any).instance = undefined;
  (InMemoryIdempotencyStore as any).instance = undefined;
  (SideEffectAuthorizationGate as any).instance = undefined;
  (InstanceConcurrencyGuard as any).instance = undefined;
}

async function main() {
  console.log('\n==================================================================');
  console.log('SAMJUNIORS-OS: M2.3 FINAL RECOVERY VERIFICATION GATE');
  console.log('==================================================================\n');

  const originalCwd = process.cwd();
  const tempTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-m2-rec-gate-test-'));

  process.chdir(tempTestRoot);
  resetSingletons();

  try {
    // -------------------------------------------------------------------------
    // TEST A: Crash after approval consumption but before execution
    // -------------------------------------------------------------------------
    await runTest('Test A: Crash after approval consumption before execution is identifiable & fail-closed', async () => {
      resetSingletons();
      const gate = SideEffectAuthorizationGate.getInstance();

      // 1. Request and approve a single-use consequential action
      const approvalReq: RequestApprovalParams = {
        actionName: 'external_transfer',
        classification: 'financial_action',
        workflowInstanceId: 'wf-crash-a',
        stepId: 'step-transfer-1',
        employeeRole: 'finance',
        scope: { scopeType: 'single_action' },
        payload: { amount: 5000, recipient: 'acct-123' },
      };
      const approval = await gate.requestApproval(approvalReq);
      await gate.decideApproval({
        approvalId: approval.id,
        decision: 'approved',
        decidedBy: 'founder',
        reason: 'Authorized by Founder for transfer',
      });

      const idempotencyKey = 'idemp-transfer-a-1';
      const executionRef = 'exec-a-1';

      // 2. Simulate crash after approval consumption but before execution:
      // Idempotency store claimed 'in_progress', approval store consumed 'isConsumed: true'.
      // Crash occurs before executeFn runs or records completion.
      const idempStore = InMemoryIdempotencyStore.getInstance();
      const payloadA = { amount: 5000, recipient: 'acct-123' };
      const hashA = computeApprovalPayloadHash('external_transfer', undefined, payloadA);
      await idempStore.claim({
        key: idempotencyKey,
        actionName: 'external_transfer',
        payloadHash: hashA,
        executionRef,
      });
      await gate.getApprovalStore().consume(approval.id);

      // Verify immediate state: approval is consumed, idempotency record is in_progress
      const approvalAfterCrash = await gate.getApprovalStore().get(approval.id);
      assert.strictEqual(approvalAfterCrash?.isConsumed, true, 'Approval must be consumed');
      const idempAfterCrash = await idempStore.get(idempotencyKey);
      assert.strictEqual(idempAfterCrash?.status, 'in_progress', 'Idempotency record must be in_progress');

      // 3. Simulate process restart: re-instantiate singletons from disk
      resetSingletons();
      const restartedGate = SideEffectAuthorizationGate.getInstance();

      // Verify operation is identifiable after restart
      const interrupted = await restartedGate.listInterruptedOperations();
      const found = interrupted.find((op) => op.key === idempotencyKey);
      assert(found, 'Interrupted operation must be identifiable in listInterruptedOperations');
      assert.strictEqual(found?.status, 'in_progress');

      // Verify NO duplicate execution occurs on retry
      let secondExecutionAttempted = false;
      try {
        await restartedGate.executeWithGate({
          request: {
            employeeRole: 'finance',
            actionName: 'external_transfer',
            classification: 'financial_action',
            approvalId: approval.id,
            payload: { amount: 5000, recipient: 'acct-123' },
            workflowContext: {
              workflowInstanceId: 'wf-crash-a',
              stepId: 'step-transfer-1',
            },
          },
          idempotency: {
            key: idempotencyKey,
            payload: { amount: 5000, recipient: 'acct-123' },
          },
          executeFn: async () => {
            secondExecutionAttempted = true;
            return { transferred: true };
          },
        });
        assert.fail('Should have failed closed with OperationInProgressError');
      } catch (retryErr: any) {
        assert(
          retryErr instanceof OperationInProgressError || retryErr.message.includes('in progress'),
          'Must fail closed with OperationInProgressError'
        );
      }
      assert.strictEqual(secondExecutionAttempted, false, 'No duplicate execution must occur');

      // Verify safe human resolution:
      // Non-founder resolution attempt fails closed
      await assert.rejects(
        restartedGate.resolveInterruptedOperation({
          idempotencyKey,
          resolution: 'failed',
          reason: 'Attempted resolution by unauthorized actor',
          resolvedBy: 'finance',
        }),
        /Permission denied/
      );

      // Authorized Founder resolves as failed
      const resolution = await restartedGate.resolveInterruptedOperation({
        idempotencyKey,
        resolution: 'failed',
        reason: 'Verified crash occurred before external dispatch',
        resolvedBy: 'founder',
      });
      assert.strictEqual(resolution.success, true);
      assert.strictEqual(resolution.record.status, 'failed');

      // Verify consumed approval remains consumed (no silent reset)
      const approvalFinal = await restartedGate.getApprovalStore().get(approval.id);
      assert.strictEqual(approvalFinal?.isConsumed, true, 'Approval must never be silently revived');

      // Verify audit record exists with FOUNDER_MANUAL_RECONCILIATION
      const audits = await restartedGate.listAudits();
      const overrideAudit = audits.find((a) => a.id === resolution.auditId);
      assert(overrideAudit, 'Resolution must create an immutable audit record');
      assert.strictEqual(overrideAudit?.reasonCode, 'FOUNDER_MANUAL_RECONCILIATION');
      assert.strictEqual(overrideAudit?.executed, false);
    });

    // -------------------------------------------------------------------------
    // TEST B: Crash after external side effect succeeds before complete recorded
    // -------------------------------------------------------------------------
    await runTest('Test B: Crash after external success protects against duplicate execution & requires resolution', async () => {
      resetSingletons();
      const gate = SideEffectAuthorizationGate.getInstance();
      const idempStore = InMemoryIdempotencyStore.getInstance();

      const approval = await gate.requestApproval({
        actionName: 'send_investor_report',
        classification: 'external_communication',
        workflowInstanceId: 'wf-crash-b',
        stepId: 'step-report-1',
        employeeRole: 'pm',
        payload: { reportId: 'q3-summary' },
      });
      await gate.decideApproval({
        approvalId: approval.id,
        decision: 'approved',
        decidedBy: 'founder',
      });

      const idempotencyKey = 'idemp-investor-b-1';
      const executionRef = 'exec-investor-b-1';
      let externalDispatches = 0;

      // 1. Idempotency claimed and approval consumed
      const payloadB = { reportId: 'q3-summary' };
      const hashB = computeApprovalPayloadHash('send_investor_report', undefined, payloadB);
      await idempStore.claim({
        key: idempotencyKey,
        actionName: 'send_investor_report',
        payloadHash: hashB,
        executionRef,
      });
      await gate.getApprovalStore().consume(approval.id);

      // 2. External side effect dispatched successfully
      externalDispatches++; // Dispatched to external third party
      assert.strictEqual(externalDispatches, 1, 'External side effect was dispatched once');

      // 3. System crashes before getIdempotencyStore().complete() or auditStore.record() is called
      // The on-disk state remains status: 'in_progress'

      // Restart
      resetSingletons();
      const restartedGate = SideEffectAuthorizationGate.getInstance();

      // Retry attempt must NOT blindly execute the side effect again
      try {
        await restartedGate.executeWithGate({
          request: {
            employeeRole: 'pm',
            actionName: 'send_investor_report',
            classification: 'external_communication',
            approvalId: approval.id,
            payload: { reportId: 'q3-summary' },
            workflowContext: {
              workflowInstanceId: 'wf-crash-b',
              stepId: 'step-report-1',
            },
          },
          idempotency: {
            key: idempotencyKey,
            payload: { reportId: 'q3-summary' },
          },
          executeFn: async () => {
            externalDispatches++;
            return { sent: true };
          },
        });
        assert.fail('Retry must fail closed with OperationInProgressError');
      } catch (err: any) {
        assert(
          err instanceof OperationInProgressError || err.message.includes('in progress'),
          'Must be blocked as in_progress'
        );
      }
      assert.strictEqual(externalDispatches, 1, 'Blind re-execution strictly blocked');

      // Operation is visible to recovery scanner
      const interrupted = await restartedGate.listInterruptedOperations();
      assert(interrupted.some((op) => op.key === idempotencyKey), 'Must be classified as interrupted');

      // Founder checks external service, confirms message delivered with txId 'tx-inv-999'
      const overrideResult = await restartedGate.resolveInterruptedOperation({
        idempotencyKey,
        resolution: 'completed',
        response: { txId: 'tx-inv-999', status: 'delivered' },
        reason: 'Authoritative external portal confirms delivery',
        resolvedBy: 'founder',
      });
      assert.strictEqual(overrideResult.success, true);
      assert.strictEqual(overrideResult.record.status, 'completed');

      // Subsequent retry now safely replays cached outcome without re-dispatching
      const replayResult = await restartedGate.executeWithGate({
        request: {
          employeeRole: 'pm',
          actionName: 'send_investor_report',
          classification: 'external_communication',
          approvalId: approval.id,
          payload: { reportId: 'q3-summary' },
        },
        idempotency: {
          key: idempotencyKey,
          payload: { reportId: 'q3-summary' },
        },
        executeFn: async () => {
          externalDispatches++;
          return { unexpected: true };
        },
      });

      assert.strictEqual(replayResult.idempotentReplay, true);
      assert.deepStrictEqual(replayResult.result, { txId: 'tx-inv-999', status: 'delivered' });
      assert.strictEqual(externalDispatches, 1, 'Side effect never executed twice');
    });

    // -------------------------------------------------------------------------
    // TEST C: Crash after completion but before audit recording
    // -------------------------------------------------------------------------
    await runTest('Test C: Crash after completion before audit reconciles idempotently', async () => {
      resetSingletons();
      const gate = SideEffectAuthorizationGate.getInstance();
      const idempStore = (gate as any).evaluator ? (InMemoryIdempotencyStore as any).getInstance() : null;

      const idempotencyKey = 'idemp-audit-reconcile-c-1';
      const executionRef = 'exec-audit-c-1';

      // Simulate state where idempotency record reached 'completed' but crash occurred before auditStore.record
      await idempStore.claim({
        key: idempotencyKey,
        actionName: 'database_export',
        payloadHash: 'hash-c-1',
        executionRef,
      });
      await idempStore.complete(idempotencyKey, { exportSize: 1048576 }, executionRef);

      // Verify no audit record currently exists
      const auditsBefore = await gate.listAudits();
      assert.strictEqual(auditsBefore.filter((a) => a.executionReference === executionRef).length, 0);

      // Reconcile missing audit
      const reconciled = await gate.reconcileMissingAudit(idempotencyKey);
      assert(reconciled, 'Must reconcile missing audit');
      assert.strictEqual(reconciled?.reasonCode, 'AUDIT_RECONCILED');
      assert.strictEqual(reconciled?.executed, true);
      assert.strictEqual(reconciled?.executionReference, executionRef);

      // Verify audit is now in store
      const auditsAfter = await gate.listAudits();
      assert.strictEqual(auditsAfter.filter((a) => a.executionReference === executionRef).length, 1);

      // Second reconciliation is completely idempotent (no duplicate audit)
      const secondReconciliation = await gate.reconcileMissingAudit(idempotencyKey);
      assert.strictEqual(secondReconciliation?.id, reconciled?.id);
      const auditsFinal = await gate.listAudits();
      assert.strictEqual(auditsFinal.filter((a) => a.executionReference === executionRef).length, 1);
    });

    // -------------------------------------------------------------------------
    // TEST D: Repeated recovery idempotency
    // -------------------------------------------------------------------------
    await runTest('Test D: Repeated recovery cycles run safely without duplicates', async () => {
      resetSingletons();
      const gate = SideEffectAuthorizationGate.getInstance();
      const idempStore = InMemoryIdempotencyStore.getInstance();

      const idempotencyKey = 'idemp-repeated-rec-d';
      await idempStore.claim({
        key: idempotencyKey,
        actionName: 'sync_contacts',
        payloadHash: 'hash-d',
        executionRef: 'exec-d',
      });

      // Run multiple recovery scans
      const pass1 = await gate.listInterruptedOperations();
      const pass2 = await gate.listInterruptedOperations();
      assert.strictEqual(pass1.length, pass2.length);

      // Resolve once
      const res1 = await gate.resolveInterruptedOperation({
        idempotencyKey,
        resolution: 'completed',
        response: { synced: 42 },
        reason: 'Manual batch sync verification',
        resolvedBy: 'founder',
      });
      assert.strictEqual(res1.success, true);

      // Resolve a second time (repeated recovery cycle)
      const res2 = await gate.resolveInterruptedOperation({
        idempotencyKey,
        resolution: 'completed',
        response: { synced: 42 },
        reason: 'Second pass of recovery runner',
        resolvedBy: 'founder',
      });
      assert.strictEqual(res2.success, true);
      assert.strictEqual(res2.auditId, 'already_completed');

      // Verify audit trail was not polluted with duplicates
      const audits = await gate.listAudits();
      const overrideAudits = audits.filter(
        (a) => a.executionReference === 'exec-d' && a.reasonCode === 'FOUNDER_MANUAL_RECONCILIATION'
      );
      assert.strictEqual(overrideAudits.length, 1, 'Exactly one override audit record produced');
    });

    // -------------------------------------------------------------------------
    // TEST E: Founder override permissions & invariant integrity
    // -------------------------------------------------------------------------
    await runTest('Test E: Founder override permissions and invariant protection', async () => {
      resetSingletons();
      const gate = SideEffectAuthorizationGate.getInstance();
      const idempStore = InMemoryIdempotencyStore.getInstance();

      const key = 'idemp-invariant-e';
      await idempStore.claim({
        key,
        actionName: 'delete_ledger',
        payloadHash: 'hash-e',
        executionRef: 'exec-e',
      });
      await idempStore.complete(key, { deleted: true }, 'exec-e');

      // Invariant: cannot mark completed operation as failed
      await assert.rejects(
        gate.resolveInterruptedOperation({
          idempotencyKey: key,
          resolution: 'failed',
          reason: 'Try to invalidate completed action',
          resolvedBy: 'founder',
        }),
        /Cannot mark completed operation as failed/
      );

      // Non-existent key throws
      await assert.rejects(
        gate.resolveInterruptedOperation({
          idempotencyKey: 'non-existent-key',
          resolution: 'failed',
          reason: 'Does not exist',
          resolvedBy: 'founder',
        }),
        /Idempotency record not found/
      );
    });

    // -------------------------------------------------------------------------
    // TEST F: Instance Lease Identity & PID Reuse Safety
    // -------------------------------------------------------------------------
    await runTest('Test F: Instance lease identity enforces instanceId token and heartbeat expiration', async () => {
      resetSingletons();
      const guard = InstanceConcurrencyGuard.getInstance();
      const customLock = path.join(tempTestRoot, 'test-instance.lock');

      // 1. Initial acquisition
      const first = guard.acquireSingleInstanceLease(customLock);
      assert.strictEqual(first.acquired, true);

      // Read written lock file
      const lockData = JSON.parse(fs.readFileSync(customLock, 'utf-8'));
      assert.strictEqual(lockData.pid, process.pid);
      assert(typeof lockData.instanceId === 'string');

      // 2. Simulated PID reuse scenario:
      // Suppose an old lock file has our PID but a different instanceId and an expired heartbeat
      const staleLockData = {
        instanceId: `inst-${process.pid}-${Date.now() - 30000}`,
        pid: process.pid,
        startedAt: new Date(Date.now() - 30000).toISOString(),
        lastHeartbeat: new Date(Date.now() - 20000).toISOString(), // > 15 seconds old
        deploymentNote: 'simulated stale instance',
      };
      fs.writeFileSync(customLock, JSON.stringify(staleLockData, null, 2), 'utf-8');

      // Another instance attempts acquisition: since heartbeat is expired (> 15s), it reclaims safely
      resetSingletons();
      const newGuard = InstanceConcurrencyGuard.getInstance();
      const reclaimed = newGuard.acquireSingleInstanceLease(customLock);
      assert.strictEqual(reclaimed.acquired, true, 'Expired lease reclaimed safely');

      guard.releaseLease();
      newGuard.releaseLease();
    });

  } finally {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tempTestRoot, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n------------------------------------------------------------------');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log('------------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled failure in recovery verification tests:', err);
  process.exit(1);
});
