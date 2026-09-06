import { SideEffectAuthorizationGate } from '../lib/server/authorization/gate';
import { InMemoryApprovalStore, InMemoryAuditStore } from '../lib/server/authorization/approval-store';
import { SideEffectPolicyEvaluator } from '../lib/server/authorization/policy-evaluator';
import { WorkflowRuntime } from '../lib/server/workflow/runtime';
import { WorkflowScheduler } from '../lib/server/workflow/scheduler';
import { InMemoryWorkflowStore } from '../lib/server/workflow/store';
import { InMemoryScheduledWorkStore } from '../lib/server/workflow/scheduler-store';
import { WorkflowDefinition } from '../types/workflow';
import { AuthorizationEvaluationRequest } from '../types/authorization';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}`, detail !== undefined ? detail : '');
  }
}

async function runPhase12_3Tests() {
  console.log('=== Running Phase 12.3: Approval & External Side-Effect Gate Tests ===\n');

  const approvalStore = InMemoryApprovalStore.getInstance();
  const auditStore = InMemoryAuditStore.getInstance();
  const workflowStore = InMemoryWorkflowStore.getInstance();
  const schedulerStore = InMemoryScheduledWorkStore.getInstance();

  approvalStore.clear();
  auditStore.clear();
  workflowStore.clear();
  schedulerStore.clear();

  const gate = SideEffectAuthorizationGate.getInstance();
  const runtime = new WorkflowRuntime();
  const scheduler = new WorkflowScheduler(schedulerStore, workflowStore, runtime);

  // ==========================================
  // TEST GROUP 1: Policy Evaluator & Taxonomy
  // ==========================================
  console.log('--- Test Group 1: Side-Effect Classification & Policy Evaluation ---');

  // 1. Read-only allowed
  const readOnlyReq: AuthorizationEvaluationRequest = {
    employeeRole: 'researcher',
    actionName: 'Fetch Competitor Data',
    classification: 'read_only',
  };
  const readOnlyDecision = await gate.evaluateAuthorization(readOnlyReq);
  assert(readOnlyDecision.effect === 'allowed' && readOnlyDecision.reasonCode === 'READ_ONLY_ALLOWED', 'Read-only action allowed without approval');

  // 2. Internal mutation allowed for authorized employee roles
  const internalMutReq: AuthorizationEvaluationRequest = {
    employeeRole: 'pm',
    actionName: 'Update Internal Task Priority',
    classification: 'internal_mutation',
  };
  const internalMutDecision = await gate.evaluateAuthorization(internalMutReq);
  assert(internalMutDecision.effect === 'allowed' && internalMutDecision.reasonCode === 'INTERNAL_MUTATION_ALLOWED', 'Internal mutation allowed for PM');

  // 3. Advisor prohibited from executing side effects
  const advisorReq: AuthorizationEvaluationRequest = {
    employeeRole: 'advisor',
    actionName: 'Run Advisor Strategy',
    classification: 'external_communication',
  };
  const advisorDecision = await gate.evaluateAuthorization(advisorReq);
  assert(advisorDecision.effect === 'denied' && advisorDecision.reasonCode === 'DENIED_ADVISOR_EXECUTION_PROHIBITED', 'Advisor role strictly prohibited from side effects');

  // 4. External communication requires approval when unapproved
  const extCommReq: AuthorizationEvaluationRequest = {
    employeeRole: 'coo',
    actionName: 'Send Outbound Campaign',
    classification: 'external_communication',
    workflowContext: {
      workflowId: 'wf-growth-1',
      workflowInstanceId: 'inst-101',
      stepId: 'step-send-emails',
    },
  };
  const extCommDecision = await gate.evaluateAuthorization(extCommReq);
  assert(extCommDecision.effect === 'approval_required' && extCommDecision.reasonCode === 'APPROVAL_REQUIRED_EXTERNAL_COMMUNICATION', 'External communication requires Founder approval by default');

  // 5. Financial action requires approval (autonomous forbidden)
  const finReq: AuthorizationEvaluationRequest = {
    employeeRole: 'finance',
    actionName: 'Transfer Vendor Payment',
    classification: 'financial_action',
  };
  const finDecision = await gate.evaluateAuthorization(finReq);
  assert(finDecision.effect === 'approval_required' && finDecision.reasonCode === 'APPROVAL_REQUIRED_FINANCIAL', 'Financial action requires explicit Founder approval');

  // ==========================================
  // TEST GROUP 2: Founder Authority & Scope Precision
  // ==========================================
  console.log('\n--- Test Group 2: Founder Authority & Scoped Approvals ---');

  // 6. Non-Founder cannot approve requests
  const approvalRecord = await gate.requestApproval({
    actionName: 'Send Partner Email',
    classification: 'external_communication',
    workflowInstanceId: 'inst-202',
    stepId: 'step-email-partners',
    employeeRole: 'coo',
    scope: { scopeType: 'step', workflowInstanceId: 'inst-202', stepId: 'step-email-partners' },
  });

  let nonFounderBlocked = false;
  try {
    await gate.decideApproval({
      approvalId: approvalRecord.id,
      decision: 'approved',
      decidedBy: 'coo', // AI employee attempting to approve
    });
  } catch (err: any) {
    nonFounderBlocked = true;
  }
  assert(nonFounderBlocked, 'AI Employees cannot approve requests (Founder remains final authority)');

  // 7. Founder approval grants execution for targeted scope
  const approvedRecord = await gate.decideApproval({
    approvalId: approvalRecord.id,
    decision: 'approved',
    decidedBy: 'founder',
    reason: 'Approved outreach to partners',
  });
  assert(approvedRecord.decision === 'approved', 'Founder successfully approves request');

  // 8. Re-evaluation with approved record allows step
  const scopedReq: AuthorizationEvaluationRequest = {
    employeeRole: 'coo',
    actionName: 'Send Partner Email',
    classification: 'external_communication',
    workflowContext: {
      workflowId: 'wf-partners',
      workflowInstanceId: 'inst-202',
      stepId: 'step-email-partners',
    },
  };
  const scopedDecision = await gate.evaluateAuthorization(scopedReq);
  assert(scopedDecision.effect === 'allowed' && scopedDecision.reasonCode === 'APPROVED_BY_FOUNDER', 'Approved request within matching step scope is allowed');

  // 9. Scope boundary enforcement: Approval for step-email-partners does NOT authorize step-email-customers
  const mismatchStepReq: AuthorizationEvaluationRequest = {
    employeeRole: 'coo',
    actionName: 'Send Customer Email',
    classification: 'external_communication',
    workflowContext: {
      workflowId: 'wf-partners',
      workflowInstanceId: 'inst-202',
      stepId: 'step-email-customers', // Different step!
    },
  };
  const mismatchDecision = await gate.evaluateAuthorization(mismatchStepReq);
  assert(mismatchDecision.effect === 'approval_required', 'Step-scoped approval does not leak to other steps in instance');

  // 10. Campaign scope boundary
  const campaignApproval = await gate.requestApproval({
    actionName: 'Send Campaign Blasts',
    classification: 'external_communication',
    workflowInstanceId: 'inst-camp-1',
    stepId: 'step-blast',
    employeeRole: 'coo',
    scope: { scopeType: 'campaign', campaignId: 'q1-expansion' },
    target: { resourceId: 'q1-expansion', targetSystem: 'email_provider' },
  });
  await gate.decideApproval({
    approvalId: campaignApproval.id,
    decision: 'approved',
    decidedBy: 'founder',
  });

  const diffCampaignReq: AuthorizationEvaluationRequest = {
    employeeRole: 'coo',
    actionName: 'Send Campaign Blasts',
    classification: 'external_communication',
    workflowContext: {
      workflowId: 'wf-camp',
      workflowInstanceId: 'inst-camp-1',
      stepId: 'step-blast',
    },
    target: { resourceId: 'unauthorized-arbitrary-campaign', targetSystem: 'email_provider' },
  };
  const diffCampDecision = await gate.evaluateAuthorization(diffCampaignReq);
  assert(diffCampDecision.effect === 'denied' && diffCampDecision.reasonCode === 'APPROVAL_SCOPE_MISMATCH', 'Campaign-scoped approval blocks unauthorized campaigns');

  // ==========================================
  // TEST GROUP 3: Revocation, Expiration, and Consumption
  // ==========================================
  console.log('\n--- Test Group 3: Revocation, Expiration & Consumption ---');

  // 11. Founder revocation immediately blocks execution
  await gate.revokeApproval({
    approvalId: approvedRecord.id,
    revokedBy: 'founder',
    reason: 'Partner outreach paused due to strategy pivot',
  });

  const revokedDecision = await gate.evaluateAuthorization(scopedReq);
  assert(revokedDecision.effect === 'denied' && revokedDecision.reasonCode === 'APPROVAL_REVOKED', 'Founder revocation immediately blocks action with APPROVAL_REVOKED');

  // Also verify executeWithGate intercepts and records revoked attempt in audit trail
  const revokedExecAttempt = await gate.executeWithGate({
    request: scopedReq,
    executeFn: async () => {
      throw new Error('Should NEVER execute when revoked');
    },
  });
  assert(revokedExecAttempt.allowed === false && revokedExecAttempt.decision.reasonCode === 'APPROVAL_REVOKED', 'executeWithGate blocks execution of revoked action and creates audit log');

  // 12. Expiration TTL
  const expiredApproval = await gate.requestApproval({
    actionName: 'Publish Release Notes',
    classification: 'external_record_mutation',
    workflowInstanceId: 'inst-exp-1',
    stepId: 'step-pub',
    employeeRole: 'pm',
    scope: { scopeType: 'step', workflowInstanceId: 'inst-exp-1', stepId: 'step-pub' },
  });
  // Approve with already expired timestamp (1 hour ago)
  const pastTime = new Date(Date.now() - 3600000).toISOString();
  await gate.decideApproval({
    approvalId: expiredApproval.id,
    decision: 'approved',
    decidedBy: 'founder',
    expiresAt: pastTime,
  });

  const expiredDecision = await gate.evaluateAuthorization({
    employeeRole: 'pm',
    actionName: 'Publish Release Notes',
    classification: 'external_record_mutation',
    workflowContext: {
      workflowId: 'wf-rel',
      workflowInstanceId: 'inst-exp-1',
      stepId: 'step-pub',
    },
  });
  assert(expiredDecision.effect === 'denied' && expiredDecision.reasonCode === 'APPROVAL_EXPIRED', 'Expired approval TTL blocks execution with APPROVAL_EXPIRED');

  // 13. Single-Action Consumption
  const singleActionAppr = await gate.requestApproval({
    actionName: 'One-Time Payment Verification',
    classification: 'external_record_mutation',
    workflowInstanceId: 'inst-single-1',
    stepId: 'step-pay',
    employeeRole: 'finance',
    scope: { scopeType: 'single_action', workflowInstanceId: 'inst-single-1', stepId: 'step-pay' },
  });
  await gate.decideApproval({
    approvalId: singleActionAppr.id,
    decision: 'approved',
    decidedBy: 'founder',
  });

  // Execute first time
  let execCount = 0;
  const exec1 = await gate.executeWithGate({
    request: {
      employeeRole: 'finance',
      actionName: 'One-Time Payment Verification',
      classification: 'external_record_mutation',
      workflowContext: {
        workflowId: 'wf-pay',
        workflowInstanceId: 'inst-single-1',
        stepId: 'step-pay',
      },
    },
    executeFn: async () => {
      execCount++;
      return { success: true };
    },
  });
  assert(exec1.allowed === true && execCount === 1, 'First single-action execution succeeds');

  // Attempt execute second time with same single-action approval
  const exec2 = await gate.executeWithGate({
    request: {
      employeeRole: 'finance',
      actionName: 'One-Time Payment Verification',
      classification: 'external_record_mutation',
      workflowContext: {
        workflowId: 'wf-pay',
        workflowInstanceId: 'inst-single-1',
        stepId: 'step-pay',
      },
    },
    executeFn: async () => {
      execCount++;
      return { success: true };
    },
  });
  assert(exec2.allowed === false && exec2.decision.reasonCode === 'APPROVAL_CONSUMED' && execCount === 1, 'Second attempt blocked because single_action approval was consumed');

  // ==========================================
  // TEST GROUP 4: Workflow Runtime Integration
  // ==========================================
  console.log('\n--- Test Group 4: Workflow Runtime Integration ---');

  const wfDef: WorkflowDefinition = {
    id: 'wf-gov-demo',
    version: '1.0.0',
    name: 'Governance Demo Workflow',
    description: 'Demonstrating side effect authorization gate within workflow engine',
    objective: 'Safely execute multi-step business workflow with external side effects',
    steps: [
      {
        id: 'step-1-research',
        name: 'Market Research',
        description: 'Analyze industry landscape',
        assignedRole: 'researcher',
        skill: 'competitor_intel',
        dependencies: [],
        inputReferences: [],
        outputReferences: ['intel'],
        requiresApproval: false,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        sideEffectClassification: 'read_only',
      },
      {
        id: 'step-2-draft',
        name: 'Draft Proposal',
        description: 'Internal documentation synthesis',
        assignedRole: 'pm',
        skill: 'strategy_planning',
        dependencies: ['step-1-research'],
        inputReferences: ['intel'],
        outputReferences: ['proposal'],
        requiresApproval: false,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        sideEffectClassification: 'internal_mutation',
      },
      {
        id: 'step-3-notify-board',
        name: 'Notify Board Members',
        description: 'External communication to board',
        assignedRole: 'coo',
        skill: 'executive_dispatch',
        dependencies: ['step-2-draft'],
        inputReferences: ['proposal'],
        outputReferences: ['dispatched'],
        requiresApproval: false,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        sideEffectClassification: 'external_communication',
      },
    ],
  };

  await runtime.registerWorkflow(wfDef);
  const instance = await runtime.createInstance('wf-gov-demo');

  // Step 1 is read-only -> status should be ready
  assert(instance.stepStates['step-1-research'].status === 'ready', 'Step 1 (read_only) starts in ready state');

  // Execute Step 1
  await runtime.executeReadyStep(instance.instanceId, 'step-1-research');
  const instAfterStep1 = (await workflowStore.getInstance(instance.instanceId))!;
  assert(instAfterStep1.stepStates['step-1-research'].status === 'completed', 'Step 1 completes successfully');

  // Step 2 (internal_mutation) dependencies met -> status should be ready
  assert(instAfterStep1.stepStates['step-2-draft'].status === 'ready', 'Step 2 (internal_mutation) becomes ready');

  // Execute Step 2
  await runtime.executeReadyStep(instance.instanceId, 'step-2-draft');
  const instAfterStep2 = (await workflowStore.getInstance(instance.instanceId))!;
  assert(instAfterStep2.stepStates['step-2-draft'].status === 'completed', 'Step 2 completes successfully');

  // Step 3 (external_communication) dependencies met -> status MUST be awaiting_approval
  assert(instAfterStep2.stepStates['step-3-notify-board'].status === 'awaiting_approval', 'Step 3 (external_communication) automatically pauses at awaiting_approval');

  // Attempting to execute Step 3 directly while unapproved throws error
  let blockedDirectExec = false;
  try {
    await runtime.executeReadyStep(instance.instanceId, 'step-3-notify-board');
  } catch (err: any) {
    blockedDirectExec = true;
  }
  assert(blockedDirectExec, 'Step 3 cannot be executed while awaiting approval');

  // Founder approves Step 3
  await runtime.approveStep(instance.instanceId, 'step-3-notify-board', 'founder', 'Board update approved');
  const instAfterAppr = (await workflowStore.getInstance(instance.instanceId))!;
  assert(instAfterAppr.stepStates['step-3-notify-board'].status === 'ready', 'Step 3 becomes ready after Founder approval');

  // Execute Step 3
  await runtime.executeReadyStep(instance.instanceId, 'step-3-notify-board');
  const finalInst = (await workflowStore.getInstance(instance.instanceId))!;
  assert(finalInst.stepStates['step-3-notify-board'].status === 'completed', 'Step 3 completes successfully after authorization');
  assert(finalInst.status === 'completed', 'Overall workflow instance transitions to completed');

  // ==========================================
  // TEST GROUP 5: Scheduled Wake-Time Authorization Re-evaluation
  // ==========================================
  console.log('\n--- Test Group 5: Scheduled Wake-Time Re-evaluation ---');

  const schedWfDef: WorkflowDefinition = {
    id: 'wf-scheduled-ext',
    version: '1.0.0',
    name: 'Scheduled External Blast',
    description: 'Scheduled workflow with external communication',
    objective: 'Test scheduled wake-time authorization governance',
    steps: [
      {
        id: 'step-wake-blast',
        name: 'Morning Blast',
        description: 'External notification dispatch',
        assignedRole: 'coo',
        skill: 'executive_dispatch',
        dependencies: [],
        inputReferences: [],
        outputReferences: [],
        requiresApproval: false,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        sideEffectClassification: 'external_communication',
      },
    ],
  };

  await runtime.registerWorkflow(schedWfDef);
  const schedInst = await runtime.createInstance('wf-scheduled-ext');

  // Approve step initially
  await runtime.approveStep(schedInst.instanceId, 'step-wake-blast', 'founder', 'Initial approval');

  // Schedule delayed execution
  const futureTime = new Date(Date.now() + 60000).toISOString();
  const schedItem = await scheduler.scheduleWork({
    workflowInstanceId: schedInst.instanceId,
    stepId: 'step-wake-blast',
    scheduleType: 'delayed',
    executeAt: futureTime,
  });

  // Now Founder REVOKES the approval before schedule wakes!
  const stepApprovalId = schedInst.stepStates['step-wake-blast'].approvalId!;
  await gate.revokeApproval({
    approvalId: stepApprovalId,
    revokedBy: 'founder',
    reason: 'Emergency revoke: Morning blast cancelled',
  });

  // Wake time arrives -> Scheduler evaluates work
  const wakeTime = new Date(Date.now() + 120000).toISOString();
  const evalResult = await scheduler.evaluateDueWork(wakeTime);

  const schedResult = evalResult.results.find(r => r.scheduleId === schedItem.id);
  assert(schedResult?.status === 'skipped', 'Scheduled execution was skipped on wake because authorization was revoked');

  const recheckedStep = (await workflowStore.getInstance(schedInst.instanceId))!.stepStates['step-wake-blast'];
  assert(recheckedStep.status === 'blocked', 'Step in workflow instance transitioned to blocked upon waking to revoked approval');

  // ==========================================
  // TEST GROUP 6: Immutable Audit Trail
  // ==========================================
  console.log('\n--- Test Group 6: Immutable Audit Trail ---');

  const allAudits = await gate.listAudits();
  assert(allAudits.length > 0, `Audit trail recorded ${allAudits.length} events`);

  const revokedAudit = allAudits.find(a => a.decision === 'denied' && a.reasonCode === 'APPROVAL_REVOKED');
  assert(!!revokedAudit, 'Audit trail contains explicit record of denied attempt due to APPROVAL_REVOKED');

  const executedAudits = allAudits.filter(a => a.executed === true);
  assert(executedAudits.length > 0, `Audit trail verified ${executedAudits.length} successful authorized executions with executionReferences`);

  console.log(`\n======================================================`);
  console.log(`Phase 12.3 Test Suite Complete: ${passedTests}/${totalTests} Passed`);
  console.log(`======================================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPhase12_3Tests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
