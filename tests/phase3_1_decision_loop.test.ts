import assert from 'assert';
import { WorkflowRuntime } from '../lib/server/workflow/runtime';
import { InMemoryWorkflowStore, getWorkflowStore } from '../lib/server/workflow/store';
import { InMemoryApprovalStore, InMemoryAuditStore } from '../lib/server/authorization/approval-store';
import { SideEffectAuthorizationGate } from '../lib/server/authorization/gate';
import { getIdempotencyStore } from '../lib/server/idempotency/store';
import { reconcileFounderDecision } from '../lib/server/workflow/decision-reconciler';
import { WorkflowDefinition, WorkflowStepDefinition, WorkflowInstanceState } from '../types/workflow';

/**
 * ============================================================================
 * SAMJUNIORS OS — PHASE 3.1 FOUNDER DECISION LOOP CLOSURE TEST SUITE
 * ============================================================================
 *
 * Phase 3 (Command Center) first vertical slice:
 *
 *   READ AUTHORITATIVE STATE → PRESENT → FOUNDER DECIDES → GATE (authority)
 *   → RUNTIME RESUME → DURABLE RESULT → AUDIT → RESULT VISIBLE
 *
 * Before Phase 3.1, the loop was broken in the middle: POST /api/workflow/approvals
 * recorded the Founder's decision in the approval store, but NOTHING propagated it
 * to the bound workflow instance — side-effect steps stayed 'awaiting_approval'
 * forever (runtime.approveStep/resumeWorkflow had zero production callers), and
 * rejected approvals never failed the step closed.
 *
 * This suite verifies the closed loop via the decision-reconciler (the same code
 * the API route drives), without bypassing or weakening any gate:
 *
 * 1.  Approve → resume → step executes THROUGH the gate (payload binding,
 *     idempotency, single-use consumption, audit) → durable completion.
 * 2.  Reject → policy denial → step fails closed to 'blocked'; no execution.
 * 3.  Revoke → policy denial → step fails closed to 'blocked'.
 * 4.  Duplicate decision → no duplicate execution (idempotent reconciliation).
 * 5.  Concurrent reconciliation → exactly one execution (atomic claim).
 * 6.  Authorization boundaries: non-Founder cannot decide; expired approval
 *     cannot be executed even through the reconciliation path.
 * 7.  Degenerate bindings: standalone/missing-instance approvals reconcile
 *     honestly as no-ops while the decision itself remains durable.
 * ============================================================================
 */

let passed = 0;
let failed = 0;

function recordPass(testName: string) {
  console.log(`  ✓ PASS: ${testName}`);
  passed++;
}

function recordFail(testName: string, error: any) {
  console.error(`  ✗ FAIL: ${testName}`);
  console.error(`    ${error?.stack || error?.message || error}`);
  failed++;
}

const originalEnv = { ...process.env };

function resetState() {
  process.env = { ...originalEnv };
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_MODE;
  delete process.env.SAMJUNIORS_AUTHORITY_MODE;
  (process.env as any).NODE_ENV = 'test';
  InMemoryWorkflowStore.getInstance().clear();
  InMemoryApprovalStore.getInstance().clear();
  InMemoryAuditStore.getInstance().clear();
  getIdempotencyStore().clear();
}

/**
 * Builds a workflow with the canonical Phase 2 dynamic-DAG side-effect shape:
 * one plain step, then a consequential step that requires Founder approval
 * (external_communication, single-use step scope).
 */
function createApprovalWorkflow(id: string): WorkflowDefinition {
  const plainStep: WorkflowStepDefinition = {
    id: 'step-prepare',
    name: 'Prepare Brief',
    description: 'Produce the internal brief for the side effect',
    assignedRole: 'coo',
    skill: 'system_plan',
    requiresApproval: false,
    sideEffectClassification: 'read_only',
    dependencies: [],
    inputReferences: [],
  };

  const sideEffectStep: WorkflowStepDefinition = {
    id: 'step-side-effect',
    name: 'Execute Side Effect Action',
    description: 'High-risk external operation requiring explicit Founder approval.',
    assignedRole: 'coo',
    skill: 'system_execute',
    requiresApproval: true,
    sideEffectClassification: 'external_communication',
    dependencies: ['step-prepare'],
    inputReferences: [],
    targetContext: {
      targetSystem: 'resend',
      resourceId: 'outbound-digest',
      metadata: { channel: 'email', audience: 'external' },
    },
    approvalScope: { scopeType: 'single_action', maxUses: 1 },
  };

  return {
    id,
    name: `Decision Loop Workflow ${id}`,
    description: 'Phase 3.1 decision-loop test workflow',
    version: '1.0.0',
    objective: 'Phase 3.1 directive: verify the founder decision loop closes durably',
    allowedRoles: ['coo'],
    allowedSkills: ['system_plan', 'system_execute'],
    steps: [plainStep, sideEffectStep],
    dependencies: [],
    requiredApprovals: 1,
    expectedOutputs: ['sideEffectReceipt'],
  };
}

interface Fixture {
  runtime: WorkflowRuntime;
  instance: WorkflowInstanceState;
  approvalId: string;
}

/**
 * Drives a fresh workflow to the quiescent 'awaiting_approval' state — exactly
 * what /api/orchestrate leaves behind when a consequential step needs the
 * Founder — and returns the pending approval id.
 */
async function driveToAwaitingApproval(workflowId: string): Promise<Fixture> {
  const runtime = new WorkflowRuntime();
  const def = createApprovalWorkflow(workflowId);
  await runtime.registerWorkflow(def);
  const instance = await runtime.createInstance(def.id, def.version);
  const quiesced = await runtime.executeWorkflow(instance.instanceId, {
    workerId: 'fixture-driver',
  });

  // The plain step completes (executor is unconfigured → truthful unavailable
  // output, still a durable completion); the side-effect step must be awaiting.
  assert.strictEqual(
    quiesced.stepStates['step-side-effect'].status,
    'awaiting_approval',
    `Expected side-effect step to be awaiting approval, found '${quiesced.stepStates['step-side-effect'].status}'`
  );

  const step = quiesced.stepStates['step-side-effect'];
  assert.ok(step.approvalId, 'Side-effect step should carry the pending approval id');

  const record = await InMemoryApprovalStore.getInstance().get(step.approvalId!);
  assert.ok(record, 'Pending approval record must exist');
  assert.strictEqual(record!.decision, 'pending');
  assert.strictEqual(record!.workflowInstanceId, quiesced.instanceId);
  assert.strictEqual(record!.stepId, 'step-side-effect');

  return { runtime, instance: quiesced, approvalId: step.approvalId! };
}

async function countExecutedAudits(workflowInstanceId: string, stepId: string): Promise<number> {
  const audits = await SideEffectAuthorizationGate.getInstance().listAudits({
    workflowInstanceId,
    stepId,
  });
  return audits.filter((a) => a.executed).length;
}

async function main(): Promise<void> {
  console.log('\n=== PHASE 3.1 — FOUNDER DECISION LOOP CLOSURE ===\n');

  // ------------------------------------------------------------------
  console.log('--- Group 1: Approve → Runtime Resumes → Durable Execution ---');
  // ------------------------------------------------------------------

  try {
    resetState();
    const fx = await driveToAwaitingApproval('wf-p3-approve');

    // The Founder decides through the authority (gate), exactly as the route does.
    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: fx.approvalId,
      decision: 'approved',
      decidedBy: 'founder-local-session',
      reason: 'Approved via Phase 3.1 test',
    });
    assert.strictEqual(decided.decision, 'approved');

    const recon = await reconcileFounderDecision(decided);
    assert.strictEqual(recon.reconciled, true, `Expected reconciliation, got note: ${recon.outcomeNote}`);
    assert.strictEqual(recon.stepStatus, 'completed', `Step should complete durably; note: ${recon.outcomeNote}`);
    assert.strictEqual(recon.workflowStatus, 'completed');
    assert.ok(recon.auditRecords >= 1, 'Execution must be audited');

    // Authoritative read-back: instance and step are durably complete.
    const finalInstance = await getWorkflowStore().getInstance(fx.instance.instanceId);
    assert.ok(finalInstance);
    assert.strictEqual(finalInstance!.status, 'completed');
    assert.strictEqual(finalInstance!.stepStates['step-side-effect'].status, 'completed');
    assert.strictEqual(finalInstance!.stepStates['step-side-effect'].approvalState, 'approved');

    // The approval record is bound and (single_action) consumed — no reuse.
    const finalRecord = await InMemoryApprovalStore.getInstance().get(fx.approvalId);
    assert.ok(finalRecord);
    assert.strictEqual(finalRecord!.decision, 'approved');
    assert.strictEqual(finalRecord!.isConsumed, true, 'Single-action approval must be consumed after execution');

    // Exactly one executed audit record: the gate-mediated execution.
    const executedAudits = await countExecutedAudits(fx.instance.instanceId, 'step-side-effect');
    assert.strictEqual(executedAudits, 1, `Expected exactly 1 executed audit, found ${executedAudits}`);

    recordPass('Founder approval resumes the workflow: step executes through the gate and completes durably');
  } catch (err) {
    recordFail('Founder approval resumes the workflow: step executes through the gate and completes durably', err);
  }

  try {
    resetState();
    const fx = await driveToAwaitingApproval('wf-p3-audit');

    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: fx.approvalId,
      decision: 'approved',
      decidedBy: 'founder-local-session',
    });
    await reconcileFounderDecision(decided);

    const audits = await SideEffectAuthorizationGate.getInstance().listAudits({
      workflowInstanceId: fx.instance.instanceId,
      stepId: 'step-side-effect',
    });
    assert.ok(audits.length >= 1);
    const executed = audits.find((a) => a.executed);
    assert.ok(executed, 'There must be an executed audit record for the side-effect step');
    assert.strictEqual(executed!.decision, 'allowed');
    assert.strictEqual(executed!.approvalId, fx.approvalId);
    assert.strictEqual(executed!.actionClassification, 'external_communication');

    recordPass('Audit trail binds the executed side effect to the approval record and classification');
  } catch (err) {
    recordFail('Audit trail binds the executed side effect to the approval record and classification', err);
  }

  // ------------------------------------------------------------------
  console.log('\n--- Group 2: Reject → Fail-Closed ---');
  // ------------------------------------------------------------------

  try {
    resetState();
    const fx = await driveToAwaitingApproval('wf-p3-reject');

    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: fx.approvalId,
      decision: 'rejected',
      decidedBy: 'founder-local-session',
      reason: 'Rejected via Phase 3.1 test',
    });

    const recon = await reconcileFounderDecision(decided);
    assert.strictEqual(recon.reconciled, true);
    assert.strictEqual(recon.stepStatus, 'blocked', `Rejected side-effect must fail closed to 'blocked'; note: ${recon.outcomeNote}`);
    assert.strictEqual(recon.workflowStatus, 'blocked');

    const finalInstance = await getWorkflowStore().getInstance(fx.instance.instanceId);
    assert.strictEqual(finalInstance!.stepStates['step-side-effect'].status, 'blocked');
    assert.ok(
      (finalInstance!.stepStates['step-side-effect'].blockedReason || '').includes('reject'),
      `Blocked reason should reference the Founder rejection, got: ${finalInstance!.stepStates['step-side-effect'].blockedReason}`
    );

    const executedAudits = await countExecutedAudits(fx.instance.instanceId, 'step-side-effect');
    assert.strictEqual(executedAudits, 0, 'A rejected side effect must never execute');

    recordPass('Founder rejection fails the step closed (blocked) and the side effect never executes');
  } catch (err) {
    recordFail('Founder rejection fails the step closed (blocked) and the side effect never executes', err);
  }

  // ------------------------------------------------------------------
  console.log('\n--- Group 3: Revoke → Fail-Closed ---');
  // ------------------------------------------------------------------

  try {
    resetState();
    const fx = await driveToAwaitingApproval('wf-p3-revoke');

    // Approve but do NOT resume — then the Founder revokes before execution.
    const approved = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: fx.approvalId,
      decision: 'approved',
      decidedBy: 'founder-local-session',
    });
    assert.strictEqual(approved.decision, 'approved');

    const revoked = await SideEffectAuthorizationGate.getInstance().revokeApproval({
      approvalId: fx.approvalId,
      revokedBy: 'founder-local-session',
      reason: 'Revoked before execution',
    });
    assert.strictEqual(revoked.decision, 'revoked');

    const recon = await reconcileFounderDecision(revoked);
    assert.strictEqual(recon.reconciled, true);
    assert.strictEqual(recon.stepStatus, 'blocked', `Revoked approval must fail closed to 'blocked'; note: ${recon.outcomeNote}`);

    const executedAudits = await countExecutedAudits(fx.instance.instanceId, 'step-side-effect');
    assert.strictEqual(executedAudits, 0, 'A revoked approval must never execute');

    recordPass('Approval revoked before execution fails closed: step blocked, no side effect executed');
  } catch (err) {
    recordFail('Approval revoked before execution fails closed: step blocked, no side effect executed', err);
  }

  // ------------------------------------------------------------------
  console.log('\n--- Group 4: Duplicate & Concurrent Decisions (no double execution) ---');
  // ------------------------------------------------------------------

  try {
    resetState();
    const fx = await driveToAwaitingApproval('wf-p3-duplicate');

    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: fx.approvalId,
      decision: 'approved',
      decidedBy: 'founder-local-session',
    });
    const first = await reconcileFounderDecision(decided);
    assert.strictEqual(first.stepStatus, 'completed');

    // Duplicate decision (double-submit): the decision is re-recorded (same values)
    // and reconciliation must be an honest no-op — no duplicate execution.
    const decidedAgain = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: fx.approvalId,
      decision: 'approved',
      decidedBy: 'founder-local-session',
    });
    const second = await reconcileFounderDecision(decidedAgain);
    assert.strictEqual(second.reconciled, true);
    assert.strictEqual(second.stepStatus, 'completed', `Step must remain completed; note: ${second.outcomeNote}`);

    const executedAudits = await countExecutedAudits(fx.instance.instanceId, 'step-side-effect');
    assert.strictEqual(executedAudits, 1, `Duplicate decision must not re-execute; found ${executedAudits} executed audits`);

    recordPass('Duplicate decision does not re-execute the side effect (idempotent reconciliation)');
  } catch (err) {
    recordFail('Duplicate decision does not re-execute the side effect (idempotent reconciliation)', err);
  }

  try {
    resetState();
    const fx = await driveToAwaitingApproval('wf-p3-concurrent');

    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: fx.approvalId,
      decision: 'approved',
      decidedBy: 'founder-local-session',
    });

    // Two simultaneous reconciliations race (e.g. two founder tabs). The runtime's
    // atomic step claim must guarantee exactly one execution.
    const [r1, r2] = await Promise.allSettled([
      reconcileFounderDecision(decided),
      reconcileFounderDecision(decided),
    ]);
    assert.strictEqual(r1.status, 'fulfilled', 'Concurrent reconciliation must not reject');
    assert.strictEqual(r2.status, 'fulfilled', 'Concurrent reconciliation must not reject');

    const finalInstance = await getWorkflowStore().getInstance(fx.instance.instanceId);
    assert.ok(finalInstance);
    assert.strictEqual(
      finalInstance!.stepStates['step-side-effect'].status,
      'completed',
      `Concurrent reconciliation must still complete the step; got '${finalInstance!.stepStates['step-side-effect'].status}'`
    );

    const executedAudits = await countExecutedAudits(fx.instance.instanceId, 'step-side-effect');
    assert.strictEqual(executedAudits, 1, `Concurrent reconciliation must execute exactly once; found ${executedAudits}`);

    recordPass('Concurrent reconciliation executes the side effect exactly once (atomic claim)');
  } catch (err) {
    recordFail('Concurrent reconciliation executes the side effect exactly once (atomic claim)', err);
  }

  // ------------------------------------------------------------------
  console.log('\n--- Group 5: Authorization Boundaries ---');
  // ------------------------------------------------------------------

  try {
    resetState();
    const fx = await driveToAwaitingApproval('wf-p3-nonfounder');

    // An AI employee identity attempts to self-approve.
    await assert.rejects(
      () =>
        SideEffectAuthorizationGate.getInstance().decideApproval({
          approvalId: fx.approvalId,
          decision: 'approved',
          decidedBy: 'researcher',
        }),
      (err: any) => /not an authorized Founder/i.test(err.message)
    );

    // The approval is still pending — nothing was decided.
    const stillPending = await InMemoryApprovalStore.getInstance().get(fx.approvalId);
    assert.strictEqual(stillPending!.decision, 'pending');

    // And the step is still awaiting — no self-authorization leaked into the workflow.
    const instance = await getWorkflowStore().getInstance(fx.instance.instanceId);
    assert.strictEqual(instance!.stepStates['step-side-effect'].status, 'awaiting_approval');

    recordPass('Non-Founder identity cannot decide approvals (self-authorization blocked at the gate)');
  } catch (err) {
    recordFail('Non-Founder identity cannot decide approvals (self-authorization blocked at the gate)', err);
  }

  try {
    resetState();
    const fx = await driveToAwaitingApproval('wf-p3-session-contract');

    // Contract pinned for the API route: a session email identity is NOT in the
    // gate's literal allowlist — unverified, it must be denied. (Pre-3.1 the route
    // passed session.email without userContext, so every cockpit Approve click
    // failed with "Permission denied" — a latent production bug this suite pins.)
    await assert.rejects(
      () =>
        SideEffectAuthorizationGate.getInstance().decideApproval({
          approvalId: fx.approvalId,
          decision: 'approved',
          decidedBy: 'founder@samjuniors.com',
        }),
      (err: any) => /not an authorized Founder/i.test(err.message)
    );

    // With the SERVER-VERIFIED session role passed through the gate's userContext
    // contract (as the route does after 401-verifying the session), the same
    // email identity decides legitimately and reconciliation proceeds.
    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: fx.approvalId,
      decision: 'approved',
      decidedBy: 'founder@samjuniors.com',
      userContext: { role: 'FOUNDER', userId: 'founder-local-session' },
    });
    assert.strictEqual(decided.decision, 'approved');
    assert.strictEqual(decided.decidedBy, 'founder@samjuniors.com');

    const recon = await reconcileFounderDecision(decided);
    assert.strictEqual(recon.stepStatus, 'completed', `Note: ${recon.outcomeNote}`);
    assert.strictEqual(recon.workflowStatus, 'completed');

    recordPass('Verified-session contract: email identity decides only via server-verified userContext (route path)');
  } catch (err) {
    recordFail('Verified-session contract: email identity decides only via server-verified userContext (route path)', err);
  }

  try {
    resetState();
    const fx = await driveToAwaitingApproval('wf-p3-expired');

    // Approve with an already-past expiry: the decision is recorded, but the
    // authority (policy evaluator) must refuse execution for expired approvals.
    const pastExpiry = new Date(Date.now() - 60_000).toISOString();
    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: fx.approvalId,
      decision: 'approved',
      decidedBy: 'founder-local-session',
      expiresAt: pastExpiry,
    });
    assert.strictEqual(decided.decision, 'approved');

    const recon = await reconcileFounderDecision(decided);
    assert.strictEqual(recon.reconciled, true);

    const finalInstance = await getWorkflowStore().getInstance(fx.instance.instanceId);
    const stepStatus = finalInstance!.stepStates['step-side-effect'].status;
    assert.ok(
      stepStatus === 'blocked' || stepStatus === 'awaiting_approval',
      `Expired approval must not execute; step is '${stepStatus}'`
    );
    assert.notStrictEqual(stepStatus, 'completed', 'An expired approval must never complete the step');

    const executedAudits = await countExecutedAudits(fx.instance.instanceId, 'step-side-effect');
    assert.strictEqual(executedAudits, 0, 'An expired approval must never execute');

    recordPass('Expired approval cannot execute through the reconciliation path (policy authority holds)');
  } catch (err) {
    recordFail('Expired approval cannot execute through the reconciliation path (policy authority holds)', err);
  }

  // ------------------------------------------------------------------
  console.log('\n--- Group 6: Degenerate Bindings (honest no-op reconciliation) ---');
  // ------------------------------------------------------------------

  try {
    resetState();

    // Standalone approval (e.g. created by the communication runtime) with no
    // workflow binding: decision stands, reconciliation is an honest no-op.
    const standalone = await SideEffectAuthorizationGate.getInstance().requestApproval({
      actionName: 'Send External Digest',
      classification: 'external_communication',
      workflowInstanceId: 'standalone-ctx',
      stepId: 'standalone-step',
      employeeRole: 'coo',
      requestedBy: 'coo',
    });

    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: standalone.id,
      decision: 'approved',
      decidedBy: 'founder-local-session',
    });

    const recon = await reconcileFounderDecision(decided);
    assert.strictEqual(recon.reconciled, false, 'Unbound workflow instance must not be reconciled');
    assert.strictEqual(recon.error, undefined);
    assert.ok(recon.outcomeNote.length > 0);

    recordPass('Standalone approval (missing instance) reconciles as an honest no-op');
  } catch (err) {
    recordFail('Standalone approval (missing instance) reconciles as an honest no-op', err);
  }

  try {
    resetState();

    // Approval bound to an instance id that no longer exists.
    const orphan = await SideEffectAuthorizationGate.getInstance().requestApproval({
      actionName: 'Legacy Side Effect',
      classification: 'external_record_mutation',
      workflowInstanceId: 'wf-inst-does-not-exist',
      stepId: 'step-side-effect',
      employeeRole: 'coo',
      requestedBy: 'coo',
    });

    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: orphan.id,
      decision: 'rejected',
      decidedBy: 'founder-local-session',
    });

    const recon = await reconcileFounderDecision(decided);
    assert.strictEqual(recon.reconciled, false);
    assert.strictEqual(recon.error, undefined, `Degenerate binding is a no-op, not an error; got ${recon.error}`);

    const record = await InMemoryApprovalStore.getInstance().get(orphan.id);
    assert.strictEqual(record!.decision, 'rejected', 'The decision itself remains durable');

    recordPass('Approval bound to a missing instance: decision durable, reconciliation no-op');
  } catch (err) {
    recordFail('Approval bound to a missing instance: decision durable, reconciliation no-op', err);
  }

  // ------------------------------------------------------------------
  console.log('\n==========================================');
  console.log(`PHASE 3.1 DECISION LOOP SUITE: ${passed} passed, ${failed} failed`);
  console.log('==========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
