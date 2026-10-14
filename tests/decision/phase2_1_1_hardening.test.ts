/**
 * SamJuniorsOS — Phase 2.1.1: Decision Safety Hardening Test Suite
 *
 * Exercises:
 *  1. Authorization: AI employee personas cannot resolve or supersede decisions
 *  2. Authorization: Client/spoofed callers cannot impersonate Founder by providing actor="founder"
 *  3. Authorization: Trusted workflow execution reporting works only through authorized principals
 *  4. Authorization: Unauthorized operational intervention is rejected
 *  5. Execution: Superseding an executing decision with running steps does NOT imply cancellation
 *  6. Execution: Cancellation requested and cancellation confirmed are distinguishable
 *  7. Execution: Unconfirmed cancellation blocks conflicting successor execution
 *  8. Execution: Confirmed cancellation permits successor execution
 *  9. Execution: Resolved historical decisions retain their outcome record upon supersession
 * 10. Audit: Missing or failed centralized audit writes are detected
 * 11. Audit: Missing audit events can be reconciled using stable deterministic event IDs
 * 12. Audit: Reconciliation is strictly idempotent (zero duplicates created)
 * 13. Audit: Existing audit history is neither duplicated nor overwritten
 * 14. Audit: Restart recovery cleanly reloads reconciled records from durable store
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';
import { DecisionStore } from '../../src/lib/server/decision/store';
import {
  DecisionLifecycleService,
  isAuthorizedFounder,
  isAuthorizedWorkflowWorker,
  isAuthorizedOperator,
} from '../../src/lib/server/decision/lifecycle';
import {
  UnauthorizedDecisionActionError,
  ConflictingExecutionBlockedError,
  DecisionNotFoundError,
} from '../../src/lib/server/decision/errors';
import { InMemoryAuditStore } from '../../src/lib/server/authorization/approval-store';
import { WorkflowRuntime } from '../../src/lib/server/workflow/runtime';
import { WorkflowDefinition, WorkflowInstanceState } from '../../src/types/workflow';

const FOUNDER_USER_CONTEXT = { role: 'FOUNDER' as const, userId: 'founder', source: 'session' as const };

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
  (DecisionStore as any).instance = null;
  (DecisionLifecycleService as any).instance = null;
  (InMemoryAuditStore as any).instance = undefined;
}

async function main() {
  console.log('\n==================================================================');
  console.log('SAMJUNIORS-OS: PHASE 2.1.1 DECISION SAFETY HARDENING TEST SUITE');
  console.log('==================================================================\n');

  const originalCwd = process.cwd();
  const tempTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-harden-test-'));

  process.chdir(tempTestRoot);
  resetSingletons();

  try {
    const service = DecisionLifecycleService.getInstance();
    const store = DecisionStore.getInstance();

    // -------------------------------------------------------------------------
    // TEST 1: AI employee personas cannot resolve or supersede decisions
    // -------------------------------------------------------------------------
    await runTest('Test 1: AI employee personas cannot resolve or supersede decisions', async () => {
      // Create a decision in executing state
      const dec = await service.proposeDecision({
        creationRequestId: 'req-auth-1',
        title: 'Auth Test Decision',
        problemStatement: 'Problem statement',
        proposedAction: 'Proposed action',
        category: 'product',
        proposer: 'pm',
      });

      await service.submitForApproval({
        decisionId: dec.decisionId,
        expectedStateVersion: 1,
        actor: 'founder',
        reason: 'Ready for approval',
      });

      await service.approveDecision({
        decisionId: dec.decisionId,
        expectedStateVersion: 2,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Founder approved',
      });

      await service.startExecution({
        decisionId: dec.decisionId,
        expectedStateVersion: 3,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Start execution',
      });

      // 1. AI employee (researcher) attempts to resolve
      let resolveBlocked = false;
      try {
        await service.resolveDecision({
          decisionId: dec.decisionId,
          expectedStateVersion: 4,
          actor: 'researcher',
          reason: 'Researcher attempting to resolve',
          outcome: {
            outcomeSummary: 'Finished by researcher',
            resolvedAt: new Date().toISOString(),
            resolvedBy: 'researcher',
          },
          userContext: { role: 'RESEARCHER', userId: 'agent-aris' },
        });
      } catch (err: any) {
        if (err instanceof UnauthorizedDecisionActionError) {
          resolveBlocked = true;
        }
      }
      assert.strictEqual(resolveBlocked, true, 'AI employee persona must be blocked from resolving decision');

      // Create a successor decision
      const succ = await service.proposeDecision({
        creationRequestId: 'req-auth-succ-1',
        title: 'Successor Decision',
        problemStatement: 'Successor problem',
        proposedAction: 'Successor action',
        category: 'product',
        proposer: 'founder',
      });

      // 2. AI employee (coo) attempts to supersede
      let supersedeBlocked = false;
      try {
        await service.supersedeDecision({
          decisionId: dec.decisionId,
          expectedStateVersion: 4,
          supersededByDecisionId: succ.decisionId,
          actor: 'coo',
          reason: 'COO attempting to supersede',
          userContext: { role: 'COO', userId: 'agent-sophia' },
        });
      } catch (err: any) {
        if (err instanceof UnauthorizedDecisionActionError) {
          supersedeBlocked = true;
        }
      }
      assert.strictEqual(supersedeBlocked, true, 'AI employee persona must be blocked from superseding decision');
    });

    // -------------------------------------------------------------------------
    // TEST 2: Client/spoofed callers cannot impersonate Founder by providing actor="founder"
    // -------------------------------------------------------------------------
    await runTest('Test 2: Spoofed callers cannot impersonate Founder with actor="founder"', async () => {
      // Caller provides actor="founder", but session context is non-founder or client
      assert.strictEqual(
        isAuthorizedFounder('founder', { role: 'RESEARCHER', userId: 'agent-aris' }),
        false,
        'Caller with non-founder role cannot act as Founder even with actor="founder"'
      );

      assert.strictEqual(
        isAuthorizedFounder('founder', { role: 'GUEST', source: 'client' }),
        false,
        'Client-supplied actor="founder" without verified FOUNDER session role must fail closed'
      );

      assert.strictEqual(
        isAuthorizedFounder('founder-001', { role: 'PM', userId: 'maya' }),
        false,
        'PM session cannot use allowlist identity string'
      );

      // Verified session role FOUNDER succeeds
      assert.strictEqual(
        isAuthorizedFounder('founder', { role: 'FOUNDER', userId: 'usr-1' }),
        true,
        'Verified FOUNDER session role succeeds'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 3: Trusted workflow result reporting works through authorized worker
    // -------------------------------------------------------------------------
    await runTest('Test 3: Trusted workflow result reporting works through authorized worker', async () => {
      const dec = await service.proposeDecision({
        creationRequestId: 'req-worker-resolve',
        title: 'Worker Outcome Decision',
        problemStatement: 'Automated workflow execution',
        proposedAction: 'Deploy migration',
        category: 'operational',
        proposer: 'founder',
      });

      await service.submitForApproval({
        decisionId: dec.decisionId,
        expectedStateVersion: 1,
        actor: 'founder',
        reason: 'Ready',
      });
      await service.approveDecision({
        decisionId: dec.decisionId,
        expectedStateVersion: 2,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Approved',
      });
      await service.startExecution({
        decisionId: dec.decisionId,
        expectedStateVersion: 3,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Started',
        linkedWorkflowId: 'wf-inst-test-123',
      });

      // Trusted workflow worker reports resolution outcome
      const resolved = await service.resolveDecision({
        decisionId: dec.decisionId,
        expectedStateVersion: 4,
        actor: 'worker-node-1',
        reason: 'Workflow execution successfully completed',
        outcome: {
          outcomeSummary: 'Migration applied cleanly to production database',
          resolvedAt: new Date().toISOString(),
          resolvedBy: 'worker-node-1',
          executionRef: 'exec-ref-999',
        },
        userContext: { role: 'WORKFLOW_WORKER', source: 'workflow_runtime', workflowInstanceId: 'wf-inst-test-123' },
      });

      assert.strictEqual(resolved.status, 'resolved');
      assert.ok(resolved.outcome);
      assert.strictEqual(resolved.outcome?.outcomeSummary, 'Migration applied cleanly to production database');
    });

    // -------------------------------------------------------------------------
    // TEST 4: Unauthorized operational intervention is rejected
    // -------------------------------------------------------------------------
    await runTest('Test 4: Unauthorized operational intervention is rejected', async () => {
      const dec = await service.proposeDecision({
        creationRequestId: 'req-op-intervene',
        title: 'Intervention Test Decision',
        problemStatement: 'Problem',
        proposedAction: 'Action',
        category: 'operational',
        proposer: 'founder',
      });

      await service.submitForApproval({
        decisionId: dec.decisionId,
        expectedStateVersion: 1,
        actor: 'founder',
        reason: 'Ready',
      });
      await service.approveDecision({
        decisionId: dec.decisionId,
        expectedStateVersion: 2,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Approved',
      });

      // Guest attempts to flag intervention
      let blocked = false;
      try {
        await service.flagInterventionRequired({
          decisionId: dec.decisionId,
          expectedStateVersion: 3,
          actor: 'guest',
          reason: 'Unauthorized intervention attempt',
          userContext: { role: 'GUEST', source: 'client' },
        });
      } catch (err: any) {
        if (err instanceof UnauthorizedDecisionActionError) {
          blocked = true;
        }
      }
      assert.strictEqual(blocked, true, 'Guest actor cannot flag operational intervention');

      // Operator can flag intervention
      const flagged = await service.flagInterventionRequired({
        decisionId: dec.decisionId,
        expectedStateVersion: 3,
        actor: 'operator-1',
        reason: 'Maintenance pause',
        userContext: { role: 'OPERATOR' },
      });
      assert.strictEqual(flagged.status, 'intervention_required');
    });

    // -------------------------------------------------------------------------
    // TEST 5 & 6: Executing decision with running steps does NOT imply cancellation;
    // cancellation requested and cancellation confirmed are distinguishable
    // -------------------------------------------------------------------------
    await runTest('Test 5 & 6: Executing decision with running steps does NOT imply cancellation (uncertainty flagged)', async () => {
      const wfRuntime = new WorkflowRuntime();
      const def: WorkflowDefinition = {
        id: 'wf-def-active-step',
        version: '1.0.0',
        name: 'Active Step Workflow',
        description: 'Active Step Workflow description',
        objective: 'Test active running steps',
        dependencies: [],
        requiredApprovals: 0,
        allowedRoles: ['researcher'],
        allowedSkills: ['build_execute'],
        expectedOutputs: [],
        steps: [
          {
            id: 'step-running',
            name: 'Running Step',
            description: 'Step currently executing',
            assignedRole: 'researcher',
            skill: 'build_execute',
            dependencies: [],
            inputReferences: [],
            outputReferences: [],
            requiresApproval: false,
            retryPolicy: { maxRetries: 1, backoffMs: 100 },
          },
          {
            id: 'step-pending',
            name: 'Pending Step',
            description: 'Step awaiting running step',
            assignedRole: 'researcher',
            skill: 'build_execute',
            dependencies: ['step-running'],
            inputReferences: [],
            outputReferences: [],
            requiresApproval: false,
            retryPolicy: { maxRetries: 1, backoffMs: 100 },
          },
        ],
      };
      await wfRuntime.registerWorkflow(def);
      const instance = await wfRuntime.createInstance(def.id, def.version);

      // Artificially put step-running into 'running' status
      await (wfRuntime.getStore() as any).transitionStepAtomic(
        instance.instanceId,
        'step-running',
        'running',
        instance.stateVersion,
        {}
      );

      // Create executing decision linked to this workflow
      const dec = await service.proposeDecision({
        creationRequestId: 'req-exec-running-wf',
        title: 'Running Execution Decision',
        problemStatement: 'Problem',
        proposedAction: 'Action',
        category: 'product',
        proposer: 'founder',
      });
      await service.submitForApproval({
        decisionId: dec.decisionId,
        expectedStateVersion: 1,
        actor: 'founder',
        reason: 'Submit',
      });
      await service.approveDecision({
        decisionId: dec.decisionId,
        expectedStateVersion: 2,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Approve',
      });
      await service.startExecution({
        decisionId: dec.decisionId,
        expectedStateVersion: 3,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Start',
        linkedWorkflowId: instance.instanceId,
      });

      // Create successor decision
      const succ = await service.proposeDecision({
        creationRequestId: 'req-succ-running-wf',
        title: 'Successor for Running Workflow',
        problemStatement: 'Successor',
        proposedAction: 'Successor action',
        category: 'product',
        proposer: 'founder',
      });

      // Founder supersedes executing decision
      const result = await service.supersedeDecision({
        decisionId: dec.decisionId,
        expectedStateVersion: 4,
        supersededByDecisionId: succ.decisionId,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Superseded due to priority change',
      });

      // Crucial Safety Guarantees:
      // 1. Cancellation was requested, BUT cancellation is NOT confirmed!
      assert.ok(result.superseded.cancellationState, 'Must have cancellationState');
      assert.strictEqual(result.superseded.cancellationState?.cancellationRequested, true, 'Cancellation requested');
      assert.strictEqual(result.superseded.cancellationState?.cancellationConfirmed, false, 'Cancellation NOT confirmed');
      assert.deepStrictEqual(result.superseded.cancellationState?.runningStepIds, ['step-running'], 'Running step tracked');
      assert.deepStrictEqual(result.superseded.cancellationState?.cancelledStepIds, ['step-pending'], 'Pending step was cancelled');

      // 2. Predecessor is NOT falsely marked 'superseded'; it is marked 'intervention_required'
      assert.strictEqual(
        result.superseded.status,
        'intervention_required',
        'Predecessor with unconfirmed running execution must transition to intervention_required'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 7: Unconfirmed cancellation blocks conflicting successor execution
    // -------------------------------------------------------------------------
    await runTest('Test 7: Unconfirmed cancellation blocks conflicting successor execution', async () => {
      // Find the successor from Test 5 & 6
      const all = await store.list();
      const succ = all.find((d) => d.creationRequestId === 'req-succ-running-wf');
      assert.ok(succ, 'Successor must exist');

      await service.submitForApproval({
        decisionId: succ.decisionId,
        expectedStateVersion: succ.stateVersion,
        actor: 'founder',
        reason: 'Submit successor',
      });
      const approvedSucc = await service.approveDecision({
        decisionId: succ.decisionId,
        expectedStateVersion: succ.stateVersion + 1,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Approve successor',
      });

      // Attempt to start execution on successor while predecessor is in intervention_required / unconfirmed cancellation
      let executionBlocked = false;
      try {
        await service.startExecution({
          decisionId: approvedSucc.decisionId,
          expectedStateVersion: approvedSucc.stateVersion,
          actor: 'founder',
          userContext: FOUNDER_USER_CONTEXT,
          reason: 'Attempt starting successor execution',
        });
      } catch (err: any) {
        if (err instanceof ConflictingExecutionBlockedError) {
          executionBlocked = true;
        }
      }
      assert.strictEqual(
        executionBlocked,
        true,
        'Successor execution must be blocked while predecessor execution remains unconfirmed/active'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 8: Confirmed cancellation permits successor execution
    // -------------------------------------------------------------------------
    await runTest('Test 8: Confirmed cancellation permits successor execution', async () => {
      const wfRuntime = new WorkflowRuntime();
      const def: WorkflowDefinition = {
        id: 'wf-def-cancellable',
        version: '1.0.0',
        name: 'Cancellable Workflow',
        description: 'Cancellable Workflow description',
        objective: 'Test cancellable steps',
        dependencies: [],
        requiredApprovals: 0,
        allowedRoles: ['researcher'],
        allowedSkills: ['build_execute'],
        expectedOutputs: [],
        steps: [
          {
            id: 'step-1',
            name: 'Pending Step 1',
            description: 'Step pending',
            assignedRole: 'researcher',
            skill: 'build_execute',
            dependencies: [],
            inputReferences: [],
            outputReferences: [],
            requiresApproval: false,
            retryPolicy: { maxRetries: 1, backoffMs: 100 },
          },
        ],
      };
      await wfRuntime.registerWorkflow(def);
      const instance = await wfRuntime.createInstance(def.id, def.version);

      // Create executing decision with purely cancellable (pending/ready) steps
      const dec = await service.proposeDecision({
        creationRequestId: 'req-clean-cancel',
        title: 'Clean Cancel Predecessor',
        problemStatement: 'Problem',
        proposedAction: 'Action',
        category: 'product',
        proposer: 'founder',
      });
      await service.submitForApproval({
        decisionId: dec.decisionId,
        expectedStateVersion: 1,
        actor: 'founder',
        reason: 'Submit',
      });
      await service.approveDecision({
        decisionId: dec.decisionId,
        expectedStateVersion: 2,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Approve',
      });
      await service.startExecution({
        decisionId: dec.decisionId,
        expectedStateVersion: 3,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Start',
        linkedWorkflowId: instance.instanceId,
      });

      // Create successor
      const succ = await service.proposeDecision({
        creationRequestId: 'req-clean-succ',
        title: 'Clean Cancel Successor',
        problemStatement: 'Successor',
        proposedAction: 'Successor Action',
        category: 'product',
        proposer: 'founder',
      });

      // Supersede predecessor
      const supersedeResult = await service.supersedeDecision({
        decisionId: dec.decisionId,
        expectedStateVersion: 4,
        supersededByDecisionId: succ.decisionId,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Cancelling clean execution',
      });

      // Verify cancellation confirmed
      assert.strictEqual(supersedeResult.superseded.status, 'superseded');
      assert.strictEqual(supersedeResult.superseded.cancellationState?.cancellationConfirmed, true);

      // Now prepare and start successor execution using the updated successor stateVersion
      const currentSuccVersion = supersedeResult.successor.stateVersion;
      await service.submitForApproval({
        decisionId: succ.decisionId,
        expectedStateVersion: currentSuccVersion,
        actor: 'founder',
        reason: 'Submit',
      });
      await service.approveDecision({
        decisionId: succ.decisionId,
        expectedStateVersion: currentSuccVersion + 1,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Approve',
      });

      const executingSucc = await service.startExecution({
        decisionId: succ.decisionId,
        expectedStateVersion: currentSuccVersion + 2,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Start successor execution',
      });

      assert.strictEqual(executingSucc.status, 'executing', 'Successor starts execution cleanly');
    });

    // -------------------------------------------------------------------------
    // TEST 9: Resolved historical decisions retain their outcome record upon supersession
    // -------------------------------------------------------------------------
    await runTest('Test 9: Resolved historical decisions retain their outcome record upon supersession', async () => {
      const dec = await service.proposeDecision({
        creationRequestId: 'req-hist-resolved',
        title: 'Historical Decision',
        problemStatement: 'Problem',
        proposedAction: 'Action',
        category: 'product',
        proposer: 'founder',
      });
      await service.submitForApproval({
        decisionId: dec.decisionId,
        expectedStateVersion: 1,
        actor: 'founder',
        reason: 'Submit',
      });
      await service.approveDecision({
        decisionId: dec.decisionId,
        expectedStateVersion: 2,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Approve',
      });
      await service.startExecution({
        decisionId: dec.decisionId,
        expectedStateVersion: 3,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Start',
      });
      const resolved = await service.resolveDecision({
        decisionId: dec.decisionId,
        expectedStateVersion: 4,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Resolved with outcome',
        outcome: {
          outcomeSummary: 'Historical outcome summary',
          resolvedAt: '2026-10-01T12:00:00Z',
          resolvedBy: 'founder',
          notes: 'Crucial historical context',
        },
      });
      assert.strictEqual(resolved.status, 'resolved');

      const succ = await service.proposeDecision({
        creationRequestId: 'req-hist-succ',
        title: 'Successor to Historical Decision',
        problemStatement: 'Successor problem',
        proposedAction: 'Successor action',
        category: 'product',
        proposer: 'founder',
      });

      const result = await service.supersedeDecision({
        decisionId: resolved.decisionId,
        expectedStateVersion: 5,
        supersededByDecisionId: succ.decisionId,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Superseding historical decision with revised policy',
      });

      assert.strictEqual(result.superseded.status, 'superseded');
      assert.ok(result.superseded.outcome, 'Outcome record must be retained');
      assert.strictEqual(result.superseded.outcome?.outcomeSummary, 'Historical outcome summary');
      assert.strictEqual(result.superseded.outcome?.notes, 'Crucial historical context');
    });

    // -------------------------------------------------------------------------
    // TEST 10, 11, 12, 13: Decision Audit Reconciliation
    // -------------------------------------------------------------------------
    await runTest('Test 10 to 13: Idempotent Decision Audit Reconciliation & History Preservation', async () => {
      const auditStore = InMemoryAuditStore.getInstance();

      // Propose and approve a decision
      const dec = await service.proposeDecision({
        creationRequestId: 'req-audit-reconcile-test',
        title: 'Audit Reconciliation Test Decision',
        problemStatement: 'Testing audit resilience',
        proposedAction: 'Simulate lost audit writes',
        category: 'governance',
        proposer: 'founder',
      });

      await service.submitForApproval({
        decisionId: dec.decisionId,
        expectedStateVersion: 1,
        actor: 'founder',
        reason: 'Submit',
      });

      const approved = await service.approveDecision({
        decisionId: dec.decisionId,
        expectedStateVersion: 2,
        actor: 'founder',
        userContext: FOUNDER_USER_CONTEXT,
        reason: 'Approve',
      });

      assert.strictEqual(approved.transitions.length, 3);
      const tr1 = approved.transitions[0];
      const tr2 = approved.transitions[1];
      const tr3 = approved.transitions[2];

      const auditId1 = DecisionLifecycleService.getStableAuditId(tr1.transitionId);
      const auditId2 = DecisionLifecycleService.getStableAuditId(tr2.transitionId);
      const auditId3 = DecisionLifecycleService.getStableAuditId(tr3.transitionId);

      // Verify normal audit events were created
      assert.ok(await auditStore.get(auditId1), 'Audit 1 exists');
      assert.ok(await auditStore.get(auditId2), 'Audit 2 exists');
      assert.ok(await auditStore.get(auditId3), 'Audit 3 exists');

      // Simulate audit write failure: delete auditId2 and auditId3 from the centralized store
      auditStore.audits.delete(auditId2);
      auditStore.audits.delete(auditId3);
      assert.strictEqual(await auditStore.get(auditId2), null, 'Audit 2 deleted (simulating loss)');
      assert.strictEqual(await auditStore.get(auditId3), null, 'Audit 3 deleted (simulating loss)');

      // Run reconciliation
      const recResult1 = await service.reconcileDecisionAuditTrail(dec.decisionId);
      assert.strictEqual(recResult1.examined, 3, 'Examined 3 transitions');
      assert.strictEqual(recResult1.reconciled, 2, 'Reconciled 2 missing audit records');
      assert.strictEqual(recResult1.alreadyPresent, 1, '1 audit record was already present');
      assert.strictEqual(recResult1.errors.length, 0, 'No reconciliation errors');

      // Verify missing audit events were recreated with exact original attributes
      const restored2 = await auditStore.get(auditId2);
      assert.ok(restored2, 'Audit 2 was restored');
      assert.strictEqual(restored2?.id, auditId2);
      assert.strictEqual(restored2?.actionName, `decision.${tr2.toStatus}`);
      assert.strictEqual(restored2?.timestamp, tr2.timestamp);
      assert.strictEqual(restored2?.reason, tr2.reason);

      const restored3 = await auditStore.get(auditId3);
      assert.ok(restored3, 'Audit 3 was restored');
      assert.strictEqual(restored3?.id, auditId3);
      assert.strictEqual(restored3?.actionName, `decision.${tr3.toStatus}`);

      // Run reconciliation a SECOND time (Idempotency check)
      const recResult2 = await service.reconcileDecisionAuditTrail(dec.decisionId);
      assert.strictEqual(recResult2.examined, 3, 'Examined 3 transitions');
      assert.strictEqual(recResult2.reconciled, 0, 'Zero new records reconciled on second run');
      assert.strictEqual(recResult2.alreadyPresent, 3, 'All 3 records already present');
      assert.strictEqual(recResult2.errors.length, 0, 'No errors');
    });

    // -------------------------------------------------------------------------
    // TEST 14: Process restart recovery cleanly reloads reconciled records
    // -------------------------------------------------------------------------
    await runTest('Test 14: Process restart recovery cleanly reloads reconciled records from durable store', async () => {
      resetSingletons();

      const reloadedStore = DecisionStore.getInstance();
      const reloadedService = DecisionLifecycleService.getInstance();
      const reloadedAuditStore = InMemoryAuditStore.getInstance();

      const dec = await reloadedStore.getByCreationRequestId('req-audit-reconcile-test');
      assert.ok(dec, 'Decision persisted and recovered');

      // Verify stable audit records survived restart
      const tr = dec.transitions[1];
      const stableId = DecisionLifecycleService.getStableAuditId(tr.transitionId);
      const auditRec = await reloadedAuditStore.get(stableId);
      assert.ok(auditRec, 'Stable audit record persisted to disk and reloaded cleanly');
      assert.strictEqual(auditRec?.id, stableId);
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
  console.error('Fatal test error:', err);
  process.exit(1);
});
