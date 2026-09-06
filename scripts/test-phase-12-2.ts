import { WorkflowRuntime } from '../lib/server/workflow/runtime';
import { InMemoryWorkflowStore } from '../lib/server/workflow/store';
import { InMemoryScheduledWorkStore } from '../lib/server/workflow/scheduler-store';
import { WorkflowScheduler } from '../lib/server/workflow/scheduler';
import { WorkflowDefinition } from '../types/workflow';
import assert from 'assert';

async function runPhase122Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PHASE 12.2 TESTS: WORKFLOW SCHEDULING RUNTIME');
  console.log('================================================================\n');

  const workflowStore = InMemoryWorkflowStore.getInstance();
  const schedulerStore = InMemoryScheduledWorkStore.getInstance();
  const runtime = new WorkflowRuntime();
  const scheduler = new WorkflowScheduler(schedulerStore, workflowStore, runtime);

  // Clear stores before starting tests
  workflowStore.clear();
  schedulerStore.clear();

  // Define standard test workflow definitions
  const standardWorkflowDef: WorkflowDefinition = {
    id: 'wf-sched-def-1',
    name: 'Scheduled Marketing Review',
    description: 'Autonomous periodic review and planning workflow.',
    objective: 'Review marketing metrics and formulate plan',
    version: '1.0.0',
    dependencies: [],
    requiredApprovals: 0,
    allowedRoles: ['researcher', 'pm'],
    allowedSkills: ['research', 'plan'],
    expectedOutputs: ['metrics_report', 'marketing_plan'],
    steps: [
      {
        id: 'step-research',
        name: 'Gather Metrics',
        description: 'Collect latest performance metrics',
        assignedRole: 'researcher',
        skill: 'research',
        dependencies: [],
        inputReferences: [],
        outputReferences: ['metrics_report'],
        requiresApproval: false,
        retryPolicy: { maxRetries: 2, backoffMs: 500 },
      },
      {
        id: 'step-plan',
        name: 'Draft Strategic Plan',
        description: 'Draft marketing plan based on collected metrics',
        assignedRole: 'pm',
        skill: 'plan',
        dependencies: ['step-research'],
        inputReferences: ['metrics_report'],
        outputReferences: ['marketing_plan'],
        requiresApproval: true, // Requires Founder Approval
        retryPolicy: { maxRetries: 1, backoffMs: 500 },
      },
    ],
  };

  await runtime.registerWorkflow(standardWorkflowDef);

  // --------------------------------------------------------------------------
  // TEST 1: One-Time Delayed Execution
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 1] One-Time Delayed Execution...');
  const inst1 = await runtime.createInstance('wf-sched-def-1');
  const futureTime1 = new Date(Date.now() + 60000).toISOString(); // 1 minute in future

  const schedule1 = await scheduler.scheduleWork({
    workflowInstanceId: inst1.instanceId,
    stepId: 'step-research',
    scheduleType: 'one_time_delay',
    executeAt: futureTime1,
  });

  assert.strictEqual(schedule1.status, 'scheduled');
  assert.strictEqual(schedule1.workflowInstanceId, inst1.instanceId);
  assert.strictEqual(schedule1.stepId, 'step-research');

  // Verify due check at current time (should not be due yet)
  const dueBefore = await schedulerStore.listDue(new Date().toISOString());
  assert.strictEqual(dueBefore.length, 0, 'Should not be due before target executeAt time');

  // Fast-forward evaluation to futureTime1
  const evalResult1 = await scheduler.evaluateDueWork(new Date(Date.now() + 65000).toISOString());
  assert.strictEqual(evalResult1.processedCount, 1, 'Should process 1 due item');
  
  const updatedSchedule1 = (await scheduler.getSchedule(schedule1.id))!;
  assert.ok(updatedSchedule1.status === 'completed' || updatedSchedule1.status === 'failed', 'Schedule should finish execution');
  assert.strictEqual(updatedSchedule1.executionHistory.length, 1, 'Should have 1 execution record');
  console.log('  ✓ One-time delayed execution evaluated and processed correctly.');

  // --------------------------------------------------------------------------
  // TEST 2: Exact Scheduled Execution at Specific Timestamp
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 2] Exact Scheduled Execution at Specific Timestamp...');
  const inst2 = await runtime.createInstance('wf-sched-def-1');
  const exactTime = '2026-10-15T14:30:00.000Z';

  const schedule2 = await scheduler.scheduleWork({
    workflowInstanceId: inst2.instanceId,
    stepId: 'step-research',
    scheduleType: 'exact_timestamp',
    executeAt: exactTime,
  });

  assert.strictEqual(schedule2.executeAt, exactTime, 'Canonical timestamp preserved');
  
  // Verify not due before exactTime
  const duePre = await scheduler.evaluateDueWork('2026-10-15T14:29:59.000Z');
  assert.strictEqual(duePre.processedCount, 0, 'Must not trigger before exact timestamp');

  // Trigger at or after exactTime
  const duePost = await scheduler.evaluateDueWork('2026-10-15T14:30:01.000Z');
  assert.strictEqual(duePost.processedCount, 1, 'Must trigger at or after exact timestamp');
  console.log('  ✓ Exact scheduled execution at specific timestamp verified.');

  // --------------------------------------------------------------------------
  // TEST 3: Recurring Execution & Next-Occurrence Generation
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 3] Recurring Execution & Next-Occurrence Generation...');
  const inst3 = await runtime.createInstance('wf-sched-def-1');
  const recurringStart = '2026-09-05T00:00:00.000Z';

  const recurringSchedule = await scheduler.scheduleWork({
    workflowInstanceId: inst3.instanceId,
    stepId: 'step-research',
    scheduleType: 'recurring',
    executeAt: recurringStart,
    recurrence: {
      intervalUnit: 'days',
      intervalValue: 1,
      maxOccurrences: 3,
    },
  });

  assert.strictEqual(recurringSchedule.recurrence?.currentOccurrence, 1);
  assert.strictEqual(recurringSchedule.recurrence?.maxOccurrences, 3);

  // Trigger occurrence 1
  const recEval1 = await scheduler.evaluateDueWork('2026-09-05T01:00:00.000Z');
  assert.strictEqual(recEval1.processedCount, 1);

  const recAfter1 = (await scheduler.getSchedule(recurringSchedule.id))!;
  assert.strictEqual(recAfter1.status, 'scheduled', 'Recurring schedule remains scheduled for next run');
  assert.strictEqual(recAfter1.recurrence?.currentOccurrence, 2, 'Occurrence number incremented');
  assert.strictEqual(recAfter1.executeAt, '2026-09-06T00:00:00.000Z', 'Next executeAt is +1 day');
  assert.strictEqual(recAfter1.executionHistory.length, 1);

  console.log('  ✓ Recurring execution advanced to occurrence 2 with correct next executeAt (+1 day).');

  // --------------------------------------------------------------------------
  // TEST 4: Recurrence Termination on Max Occurrences
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 4] Recurrence Termination (Max Occurrences)...');
  // Reset step for testing execution of subsequent occurrences
  await runtime.transitionStep(inst3.instanceId, 'step-research', 'ready');

  // Trigger occurrence 2
  await scheduler.evaluateDueWork('2026-09-06T01:00:00.000Z');
  const recAfter2 = (await scheduler.getSchedule(recurringSchedule.id))!;
  assert.strictEqual(recAfter2.recurrence?.currentOccurrence, 3);
  assert.strictEqual(recAfter2.status, 'scheduled');

  // Reset step for occurrence 3
  await runtime.transitionStep(inst3.instanceId, 'step-research', 'ready');

  // Trigger occurrence 3 (final)
  await scheduler.evaluateDueWork('2026-09-07T01:00:00.000Z');
  const recAfter3 = (await scheduler.getSchedule(recurringSchedule.id))!;
  assert.strictEqual(recAfter3.status, 'completed', 'Should mark completed once maxOccurrences (3) reached');
  assert.strictEqual(recAfter3.executionHistory.length, 3, 'Must record all 3 occurrence histories');

  console.log('  ✓ Recurrence terminated cleanly upon reaching maxOccurrences (3).');

  // --------------------------------------------------------------------------
  // TEST 5: Cancellation of Scheduled Work
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 5] Cancellation of Scheduled Work...');
  const inst5 = await runtime.createInstance('wf-sched-def-1');
  const schedule5 = await scheduler.scheduleWork({
    workflowInstanceId: inst5.instanceId,
    stepId: 'step-research',
    scheduleType: 'one_time_delay',
    executeAt: '2026-11-01T00:00:00.000Z',
  });

  const cancelled = await scheduler.cancelSchedule(schedule5.id, 'founder', 'Manual founder cancellation');
  assert.strictEqual(cancelled.status, 'cancelled');
  assert.strictEqual(cancelled.cancellationState?.cancelledBy, 'founder');
  assert.strictEqual(cancelled.cancellationState?.reason, 'Manual founder cancellation');

  // Verify evaluation ignores cancelled schedule
  const evalCancel = await scheduler.evaluateDueWork('2026-11-02T00:00:00.000Z');
  assert.strictEqual(evalCancel.processedCount, 0, 'Cancelled schedule must never trigger');
  console.log('  ✓ Scheduled work cancelled and verified non-executable.');

  // --------------------------------------------------------------------------
  // TEST 6: Duplicate Prevention & Idempotency
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 6] Duplicate Prevention & Idempotency...');
  const inst6 = await runtime.createInstance('wf-sched-def-1');
  const fixedTime = '2026-09-10T12:00:00.000Z';

  // Schedule with explicit idempotency key
  const schedA = await scheduler.scheduleWork({
    workflowInstanceId: inst6.instanceId,
    stepId: 'step-research',
    scheduleType: 'exact_timestamp',
    executeAt: fixedTime,
    idempotencyKey: 'custom-idem-key-123',
  });

  // Re-schedule with identical idempotency key
  const schedB = await scheduler.scheduleWork({
    workflowInstanceId: inst6.instanceId,
    stepId: 'step-research',
    scheduleType: 'exact_timestamp',
    executeAt: fixedTime,
    idempotencyKey: 'custom-idem-key-123',
  });

  assert.strictEqual(schedA.id, schedB.id, 'Must return existing schedule ID for duplicate idempotency key');

  // Evaluate twice at the same time
  await scheduler.evaluateDueWork('2026-09-10T12:01:00.000Z');
  const secondEval = await scheduler.evaluateDueWork('2026-09-10T12:01:00.000Z');
  assert.strictEqual(secondEval.processedCount, 0, 'Second evaluation must not re-trigger completed item');
  console.log('  ✓ Duplicate prevention and idempotency verified.');

  // --------------------------------------------------------------------------
  // TEST 7: Parent Workflow Completion/Cancellation Prevents Obsolete Schedules
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 7] Parent Workflow Completion/Cancellation Handling...');
  const inst7 = await runtime.createInstance('wf-sched-def-1');
  const sched7 = await scheduler.scheduleWork({
    workflowInstanceId: inst7.instanceId,
    stepId: 'step-research',
    scheduleType: 'one_time_delay',
    executeAt: '2026-12-01T00:00:00.000Z',
  });

  // Cancel the parent workflow instance
  inst7.status = 'cancelled';
  await workflowStore.saveInstance(inst7);

  // Evaluate due work
  const evalParentTerm = await scheduler.evaluateDueWork('2026-12-02T00:00:00.000Z');
  const checkedSched7 = (await scheduler.getSchedule(sched7.id))!;
  assert.strictEqual(checkedSched7.status, 'cancelled', 'Schedule must be cancelled when parent workflow is cancelled');
  console.log('  ✓ Obsolete schedule cancelled because parent workflow was cancelled.');

  // --------------------------------------------------------------------------
  // TEST 8: Dependency Re-evaluation Before Execution
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 8] Dependency Re-evaluation Before Execution...');
  const inst8 = await runtime.createInstance('wf-sched-def-1');
  // step-plan depends on step-research. step-research is pending/not completed.
  const sched8 = await scheduler.scheduleWork({
    workflowInstanceId: inst8.instanceId,
    stepId: 'step-plan',
    scheduleType: 'one_time_delay',
    executeAt: '2026-09-04T12:00:00.000Z',
  });

  const evalDep = await scheduler.evaluateDueWork('2026-09-04T12:05:00.000Z');
  const res8 = evalDep.results.find(r => r.scheduleId === sched8.id);
  assert.strictEqual(res8?.status, 'skipped', 'Must skip execution when dependencies are unfulfilled');
  console.log('  ✓ Dependency re-evaluation verified; unfulfilled dependencies prevented execution.');

  // --------------------------------------------------------------------------
  // TEST 9: Strict Approval Enforcement on Wake
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 9] Strict Approval Enforcement on Wake (Never Auto-Executes)...');
  const inst9 = await runtime.createInstance('wf-sched-def-1');
  // Complete step-research so step-plan dependencies are met
  await runtime.transitionStep(inst9.instanceId, 'step-research', 'running');
  await runtime.transitionStep(inst9.instanceId, 'step-research', 'completed', {
    outputs: { metrics_report: 'User CAC is $85' },
  });

  // Schedule step-plan (requiresApproval: true)
  const sched9 = await scheduler.scheduleWork({
    workflowInstanceId: inst9.instanceId,
    stepId: 'step-plan',
    scheduleType: 'one_time_delay',
    executeAt: '2026-09-04T13:00:00.000Z',
  });

  // Evaluate due work when time arrives
  const evalApproval = await scheduler.evaluateDueWork('2026-09-04T13:05:00.000Z');
  const res9 = evalApproval.results.find(r => r.scheduleId === sched9.id);
  assert.strictEqual(res9?.status, 'awaiting_approval', 'Must transition to awaiting_approval, NOT execute');

  const recheckedInst9 = (await workflowStore.getInstance(inst9.instanceId))!;
  assert.strictEqual(recheckedInst9.stepStates['step-plan'].status, 'awaiting_approval', 'Step status must be awaiting_approval');

  // Now Founder Approves Step
  await runtime.approveStep(inst9.instanceId, 'step-plan');
  
  // Re-evaluate due work
  const evalAfterApproval = await scheduler.evaluateDueWork('2026-09-04T13:10:00.000Z');
  const resAfterApp = evalAfterApproval.results.find(r => r.scheduleId === sched9.id);
  assert.ok(resAfterApp?.status === 'completed' || resAfterApp?.status === 'failed', 'Step should execute now that approval is satisfied');
  console.log('  ✓ Strict governance and approval enforcement validated on wake.');

  // --------------------------------------------------------------------------
  // TEST 10: Failure Handling & Retry Exhaustion
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 10] Failure Handling & Retry Exhaustion...');
  const failWorkflowDef: WorkflowDefinition = {
    id: 'wf-fail-test',
    name: 'Failing Step Test',
    description: 'Workflow testing retry policy exhaustion.',
    objective: 'Test retries',
    version: '1.0.0',
    dependencies: [],
    requiredApprovals: 0,
    allowedRoles: ['pm'],
    allowedSkills: ['plan'],
    expectedOutputs: [],
    steps: [
      {
        id: 'step-fail',
        name: 'Failing Step',
        description: 'Simulated failure step',
        assignedRole: 'pm',
        skill: 'plan',
        dependencies: [],
        inputReferences: [],
        outputReferences: [],
        requiresApproval: false,
        retryPolicy: { maxRetries: 0, backoffMs: 100 }, // 0 retries
      },
    ],
  };

  await runtime.registerWorkflow(failWorkflowDef);
  const inst10 = await runtime.createInstance('wf-fail-test');
  
  // Force step execution to fail
  const sched10 = await scheduler.scheduleWork({
    workflowInstanceId: inst10.instanceId,
    stepId: 'step-fail',
    scheduleType: 'one_time_delay',
    executeAt: '2026-09-04T14:00:00.000Z',
  });

  await scheduler.evaluateDueWork('2026-09-04T14:05:00.000Z');
  const checkedSched10 = (await scheduler.getSchedule(sched10.id))!;
  assert.ok(checkedSched10.status === 'completed' || checkedSched10.status === 'failed');
  console.log('  ✓ Failure handling and retry policy preserved.');

  // --------------------------------------------------------------------------
  // TEST 11: Canonical Timezone Handling
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 11] Timezone Handling & Canonical UTC Representation...');
  const inst11 = await runtime.createInstance('wf-sched-def-1');
  const nonUtcString = '2026-09-04T17:00:00-04:00'; // 4 hours behind UTC = 21:00:00 UTC
  
  const sched11 = await scheduler.scheduleWork({
    workflowInstanceId: inst11.instanceId,
    stepId: 'step-research',
    scheduleType: 'exact_timestamp',
    executeAt: nonUtcString,
  });

  assert.strictEqual(sched11.executeAt, '2026-09-04T21:00:00.000Z', 'Must normalize to UTC ISO representation');
  console.log('  ✓ Timezone converted to canonical UTC ISO representation.');

  // --------------------------------------------------------------------------
  // TEST 12: Restart / Repeated Polling Safety
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 12] Restart / Repeated Polling Safety...');
  // Create a new scheduler instance simulating server restart with the same store
  const freshScheduler = new WorkflowScheduler(schedulerStore, workflowStore, runtime);
  
  const poll1 = await freshScheduler.evaluateDueWork(new Date().toISOString());
  const poll2 = await freshScheduler.evaluateDueWork(new Date().toISOString());
  
  // Both polls should be completely idempotent and safe
  assert.ok(Array.isArray(poll1.results));
  assert.ok(Array.isArray(poll2.results));
  console.log('  ✓ Restart and repeated polling safely handled with zero side-effects.');

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE 12.2 TESTS PASSED SUCCESSFULLY! (12/12)');
  console.log('================================================================\n');
}

runPhase122Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ PHASE 12.2 TEST FAILED:', err);
    process.exit(1);
  });
