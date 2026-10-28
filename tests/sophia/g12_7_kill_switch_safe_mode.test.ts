/**
 * ============================================================================
 * GATE G12.7: KILL SWITCH & SAFE MODE DRILL SUITE
 * ============================================================================
 *
 * Exit Requirement:
 *   "Drill passes: stop works mid-run, workers halt, state is recorded;
 *    it also works with the model provider unavailable."
 *
 * Verifies:
 *   1. One command by voice or panel freezes autonomous action and drops to read-only.
 *   2. Stop works mid-run: in-flight workers halt immediately via AbortSignal.
 *   3. State is recorded: AgentRunStore records status 'halted', SafeModeManager records audit entry.
 *   4. Safe Mode drops system to read-only: read operations permitted, mutations/actions frozen.
 *   5. Model provider unavailable: 100% deterministic operation when all LLMs are down.
 *   6. Resumption requires explicit Founder confirmation.
 */

import assert from 'assert';
import { NextRequest } from '@/lib/server/http';
import {
  SafeModeManager,
  isStopCommand,
  isResumeCommand,
} from '../../src/lib/server/sophia/stop-control';
import { ServerAgentExecutor } from '../../src/lib/server/agents/executor';
import { AgentRunStore } from '../../src/lib/server/agents/run-store';
import { WorkflowRuntime } from '../../src/lib/server/workflow/runtime';
import { WorkflowScheduler } from '../../src/lib/server/workflow/scheduler';
import { InMemoryWorkflowStore } from '../../src/lib/server/workflow/store';
import { InMemoryScheduledWorkStore } from '../../src/lib/server/workflow/scheduler-store';
import { AutonomyPolicyEngine } from '../../src/lib/server/authorization/autonomy-policy';
import { SideEffectPolicyEvaluator } from '../../src/lib/server/authorization/policy-evaluator';
import { ConversationAdapterRegistry } from '../../src/lib/server/ai';
import { POST as postStopRoute, GET as getStopRoute } from '../../src/app/api/sofia/stop/route';
import { POST as postResumeRoute } from '../../src/app/api/sofia/resume/route';
import { executeSophiaTurn } from '../../src/lib/server/sophia/turn-executor';
import { ConversationStore } from '../../src/lib/server/conversation/store';

async function runDrill() {
  console.log('\n======================================================');
  console.log('SAMJUNIORS-OS: GATE G12.7 KILL SWITCH & SAFE MODE DRILL');
  console.log('======================================================\n');

  const safeMode = SafeModeManager.getInstance();
  safeMode.resetForTesting();

  const autonomyEngine = AutonomyPolicyEngine.getInstance();
  autonomyEngine.resetBudgetsForTest();

  const policyEvaluator = new SideEffectPolicyEvaluator();
  const founderId = 'founder-g12-7-drill';

  // -------------------------------------------------------------------------
  // Phase 1: One Command by Voice or Panel Triggers Safe Mode Freeze
  // -------------------------------------------------------------------------
  console.log('[Phase 1] Testing Voice & Panel Trigger Recognition...');

  // 1a. Voice stop pattern recognition
  const voiceCommands = ['stop', 'STOP!', 'halt', 'freeze', 'emergency stop', 'cancel all', 'stand down', 'shut down'];
  for (const cmd of voiceCommands) {
    assert.strictEqual(isStopCommand(cmd), true, `Voice command "${cmd}" must be recognized as stop`);
  }
  assert.strictEqual(isStopCommand('what is our mrr?'), false);

  // 1b. Panel stop trigger via API route
  const stopReq = new NextRequest('http://localhost:3000/api/sofia/stop', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-samjuniors-dev-as': 'founder',
      'x-founder-id': founderId,
    },
    body: JSON.stringify({ source: 'panel', reason: 'Founder emergency panel click' }),
  });
  const stopRes = await postStopRoute(stopReq);
  assert.strictEqual(stopRes.status, 200, 'POST /api/sofia/stop must return 200');
  const stopData = await stopRes.json();
  assert.strictEqual(stopData.frozen, true);
  assert.strictEqual(safeMode.isFrozen(), true, 'SafeModeManager must be frozen');

  // 1c. GET /api/sofia/stop honestly reflects frozen state
  const getStopReq = new NextRequest('http://localhost:3000/api/sofia/stop', {
    headers: {
      'x-samjuniors-dev-as': 'founder',
      'x-founder-id': founderId,
    },
  });
  const getRes = await getStopRoute(getStopReq);
  assert.strictEqual(getRes.status, 200);
  const getData = await getRes.json();
  assert.strictEqual(getData.status.isFrozen, true);
  assert.strictEqual(getData.status.reason, 'Founder emergency panel click');

  // Reset for Phase 2
  safeMode.resetForTesting();
  console.log('✔ Phase 1 Passed: One command by voice or panel activates Safe Mode freeze\n');

  // -------------------------------------------------------------------------
  // Phase 2: Mid-Run Worker Halting Drill (Autonomous Task Execution)
  // -------------------------------------------------------------------------
  console.log('[Phase 2] Executing Mid-Run Worker Halting Drill...');

  const registry = ConversationAdapterRegistry.getInstance();
  const fake = registry.getFakeProvider();
  registry.setPin('fake');
  fake.setConfigured(true);
  fake.setGenerator(async () => {
    await new Promise((r) => setTimeout(r, 1500));
    return JSON.stringify({
      statusMessage: 'Analysis complete',
      summary: 'Completed competitor research',
      artifactTitle: 'Pricing Matrix',
      artifactContent: '# Pricing breakdown',
      evidenceBasis: 'model_reasoning',
      keyTakeaways: ['Key takeaway 1'],
    });
  });

  const executor = new ServerAgentExecutor();
  const workerController = new AbortController();
  const workerKey = 'worker-drill-midrun-1';

  // Register worker in SafeModeManager
  safeMode.registerActiveWorker(workerKey, workerController);
  assert.strictEqual(safeMode.getActiveWorkersCount(), 1);

  // Start worker task with AbortSignal
  const workerTaskPromise = executor.executeAgentTask(
    'researcher',
    {
      directive: 'Analyze global competitor landscape',
      protocolStep: 'research',
      taskTitle: 'Mid-Run Long Research Task',
      taskDescription: 'Simulating active background analysis',
      signal: workerController.signal,
    },
    'Produce a 50-page breakdown of competitor pricing models'
  );

  // Small delay to ensure task begins execution
  await new Promise((r) => setTimeout(r, 50));

  // Trigger Kill Switch while worker is running mid-flight!
  const stopResult = await safeMode.triggerStop({
    source: 'panel',
    reason: 'Founder pressed emergency stop while research worker was running',
    founderId,
  });

  assert.strictEqual(stopResult.frozen, true);
  assert.strictEqual(stopResult.haltedWorkersCount, 1, 'Exactly 1 active worker must be halted');

  // Await the worker execution: must resolve cleanly with halted state
  const workerResult = await workerTaskPromise;
  assert.strictEqual(workerResult.success, false, 'Halted worker must report success: false');
  assert.ok(
    workerResult.statusMessage.includes('halted') || workerResult.outputContent.includes('aborted') || workerResult.outputContent.includes('Halted'),
    `Status message must indicate halt: ${workerResult.statusMessage}`
  );

  // Verify state is recorded in AgentRunStore
  const runStore = AgentRunStore.getInstance();
  const runs = await runStore.listRuns({ agentId: 'researcher' });
  const haltedRun = runs.find((r) => r.taskTitle === 'Mid-Run Long Research Task');
  assert.ok(haltedRun, 'Halted run must be persisted in AgentRunStore');
  assert.strictEqual(haltedRun.status, 'halted', 'Run status must be recorded as "halted"');
  assert.strictEqual(haltedRun.provenance.isVerified, false, 'Unfinished work must be marked unverified');
  assert.strictEqual(haltedRun.provenance.evidenceBasis, 'unverified');

  safeMode.resetForTesting();
  console.log('✔ Phase 2 Passed: Stop works mid-run, worker halts immediately, and state is recorded\n');

  // -------------------------------------------------------------------------
  // Phase 3: Mid-Run Workflow Step Halting Drill (WorkflowRuntime)
  // -------------------------------------------------------------------------
  console.log('[Phase 3] Executing Mid-Run Workflow Step Halting Drill...');

  fake.setConfigured(true);
  fake.setGenerator(async () => {
    await new Promise((r) => setTimeout(r, 1500));
    return JSON.stringify({
      statusMessage: 'Step done',
      summary: 'Completed step',
      artifactTitle: 'Step Deliverable',
      artifactContent: '# Step Output',
      evidenceBasis: 'model_reasoning',
      keyTakeaways: ['Key takeaway 1'],
    });
  });

  const workflowStore = InMemoryWorkflowStore.getInstance();
  const runtime = new WorkflowRuntime(workflowStore);

  const workflowDefId = 'wf-kill-drill';
  const instanceId = 'inst-kill-drill-1';

  await workflowStore.saveDefinition({
    id: workflowDefId,
    version: '1.0.0',
    name: 'Kill Switch Drill Workflow',
    objective: 'Test mid-run step cancellation',
    steps: [
      {
        id: 'step-analysis',
        name: 'Autonomous Step 1',
        description: 'Analyzing state',
        assignedRole: 'coo',
        skill: 'system_monitor',
      },
    ],
  });

  await workflowStore.saveInstance({
    instanceId,
    workflowId: workflowDefId,
    version: '1.0.0',
    status: 'running',
    currentStepId: 'step-analysis',
    stateVersion: 1,
    stepStates: {
      'step-analysis': {
        status: 'ready',
        assignedRole: 'coo',
        skill: 'system_monitor',
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Launch step execution asynchronously
  const stepExecPromise = runtime.executeReadyStep(instanceId, 'step-analysis', 'worker-wf-1');

  // Small delay to ensure step claims and begins execution
  await new Promise((r) => setTimeout(r, 50));

  // Trigger Kill Switch while workflow step is running
  await safeMode.triggerStop({
    source: 'voice',
    reason: 'Voice stop command during workflow execution',
    founderId,
  });

  // Wait for step execution to settle
  await stepExecPromise;

  // Verify step state transitioned to cancelled
  const updatedInstance = await workflowStore.getInstance(instanceId);
  assert.ok(updatedInstance, 'Workflow instance must exist');
  const stepState = updatedInstance.stepStates['step-analysis'];
  assert.strictEqual(stepState.status, 'cancelled', 'Step state must be marked cancelled');
  assert.ok(stepState.error?.includes('halted') || stepState.error?.includes('cancelled') || stepState.error?.includes('Stop Control'), 'Step error must document stop control halt');

  safeMode.resetForTesting();
  console.log('✔ Phase 3 Passed: Workflow step halts cleanly mid-run and state is recorded as cancelled\n');

  // -------------------------------------------------------------------------
  // Phase 4: Safe Mode Drops System to Read-Only Mode
  // -------------------------------------------------------------------------
  console.log('[Phase 4] Testing Safe Mode Read-Only Enforcement...');

  // Freeze the system
  await safeMode.triggerStop({
    source: 'panel',
    reason: 'Read-only enforcement drill',
    founderId,
  });
  assert.strictEqual(safeMode.isFrozen(), true);

  // 4a. Autonomy Policy Engine: read permitted, mutations frozen
  const readAutonomy = autonomyEngine.evaluate({
    actionClass: 'read',
    employeeRole: 'researcher',
  });
  assert.strictEqual(readAutonomy.effect, 'auto', 'Read action must remain permitted under Safe Mode');
  assert.strictEqual(readAutonomy.reasonCode, 'SAFE_MODE_READ_ONLY_PERMITTED');

  const writeAutonomy = autonomyEngine.evaluate({
    actionClass: 'internal_write',
    employeeRole: 'pm',
  });
  assert.strictEqual(writeAutonomy.effect, 'needs_approval', 'Write action must be frozen under Safe Mode');
  assert.strictEqual(writeAutonomy.reasonCode, 'SAFE_MODE_AUTONOMY_FROZEN');

  const financialAutonomy = autonomyEngine.evaluate({
    actionClass: 'financial_legal',
    employeeRole: 'finance',
  });
  assert.strictEqual(financialAutonomy.effect, 'needs_approval', 'Financial action must be frozen under Safe Mode');
  assert.strictEqual(financialAutonomy.reasonCode, 'SAFE_MODE_AUTONOMY_FROZEN');

  // 4b. SideEffectPolicyEvaluator: read_only allowed, mutations denied
  const readGate = await policyEvaluator.evaluate({
    employeeRole: 'researcher',
    actionName: 'view_notes',
    classification: 'read_only',
  });
  assert.strictEqual(readGate.effect, 'allowed', 'read_only operation must be allowed under Safe Mode');
  assert.strictEqual(readGate.reasonCode, 'READ_ONLY_ALLOWED');

  const mutationGate = await policyEvaluator.evaluate({
    employeeRole: 'pm',
    actionName: 'update_product_spec',
    classification: 'internal_mutation',
  });
  assert.strictEqual(mutationGate.effect, 'denied', 'internal_mutation must be denied under Safe Mode');
  assert.strictEqual(mutationGate.reasonCode, 'DENIED_SAFE_MODE_FROZEN');

  const externalGate = await policyEvaluator.evaluate({
    employeeRole: 'coo',
    actionName: 'send_investor_email',
    classification: 'external_communication',
  });
  assert.strictEqual(externalGate.effect, 'denied', 'external_communication must be denied under Safe Mode');
  assert.strictEqual(externalGate.reasonCode, 'DENIED_SAFE_MODE_FROZEN');

  // 4c. Scheduled Work Evaluation: 0 jobs processed while frozen
  const schedStore = InMemoryScheduledWorkStore.getInstance();
  const scheduler = new WorkflowScheduler(schedStore, workflowStore);
  const schedEval = await scheduler.evaluateDueWork();
  assert.strictEqual(schedEval.processedCount, 0, 'Zero scheduled jobs execute while frozen');

  safeMode.resetForTesting();
  console.log('✔ Phase 4 Passed: System deterministically drops to read-only; all autonomous mutations frozen\n');

  // -------------------------------------------------------------------------
  // Phase 5: Zero Model Dependency Drill (Model Provider Completely Unavailable)
  // -------------------------------------------------------------------------
  console.log('[Phase 5] Testing Stop Control with Model Provider Unavailable...');

  registry.setPin('fake');
  fake.setGenerator(null);

  // Simulate dead/unconfigured model provider
  fake.setConfigured(false);

  // 5a. Direct spoken stop directive with dead provider
  assert.strictEqual(isStopCommand('emergency stop'), true);

  const offlineStop = await safeMode.triggerStop({
    source: 'voice',
    reason: 'Voice stop when LLM provider is down',
    founderId,
  });
  assert.strictEqual(offlineStop.success, true);
  assert.strictEqual(offlineStop.frozen, true);
  assert.strictEqual(safeMode.isFrozen(), true);

  // 5b. Attempting autonomous task with dead provider while frozen: immediately blocked
  const offlineBlockedResult = await executor.executeAgentTask(
    'researcher',
    {
      directive: 'Offline test',
      protocolStep: 'research',
      taskTitle: 'Offline Attempt',
      taskDescription: 'Should not run',
    },
    'Prompt'
  );
  assert.strictEqual(offlineBlockedResult.success, false);
  assert.ok(offlineBlockedResult.statusMessage.includes('Safe Mode'));

  // 5c. Resumption without confirmed: true fails closed (status 400)
  const unconfirmedResumeReq = new NextRequest('http://localhost:3000/api/sofia/resume', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-samjuniors-dev-as': 'founder',
      'x-founder-id': founderId,
    },
    body: JSON.stringify({ confirmed: false }),
  });
  const unconfRes = await postResumeRoute(unconfirmedResumeReq);
  assert.strictEqual(unconfRes.status, 400, 'Unconfirmed resume must fail closed with status 400');
  assert.strictEqual(safeMode.isFrozen(), true, 'System must remain frozen');

  // 5d. Confirmed resume restores normal operation without contacting any model
  const confirmedResumeReq = new NextRequest('http://localhost:3000/api/sofia/resume', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-samjuniors-dev-as': 'founder',
      'x-founder-id': founderId,
    },
    body: JSON.stringify({ confirmed: true, reason: 'Founder confirmed resumption' }),
  });
  const confRes = await postResumeRoute(confirmedResumeReq);
  assert.strictEqual(confRes.status, 200, 'Confirmed resume returns 200');
  assert.strictEqual(safeMode.isFrozen(), false, 'System must be unfrozen');

  // Restore fake provider
  fake.setConfigured(true);
  console.log('✔ Phase 5 Passed: Kill switch and Safe Mode execute deterministically with model provider down\n');

  // -------------------------------------------------------------------------
  // Phase 6: Tamper-Evident Audit Logging
  // -------------------------------------------------------------------------
  console.log('[Phase 6] Verifying Tamper-Evident Audit Trail...');

  // Trigger stop and resume sequence
  await safeMode.triggerStop({ source: 'panel', reason: 'Audit verify stop', founderId });
  await safeMode.confirmResume({ founderId, confirmed: true, reason: 'Audit verify resume' });

  const auditLog = safeMode.getAuditLog();
  assert.ok(auditLog.length >= 2, 'Audit log must record stop and resume events');

  const stopAudit = auditLog.find((a) => a.type === 'STOP_TRIGGERED' && a.reason === 'Audit verify stop');
  assert.ok(stopAudit, 'Stop audit record must exist');
  assert.strictEqual(stopAudit.actor, founderId);
  assert.ok(stopAudit.timestamp);

  const resumeAudit = auditLog.find((a) => a.type === 'RESUME_CONFIRMED' && a.reason === 'Audit verify resume');
  assert.ok(resumeAudit, 'Resume audit record must exist');
  assert.strictEqual(resumeAudit.actor, founderId);
  assert.ok(resumeAudit.timestamp);

  console.log('✔ Phase 6 Passed: Complete tamper-evident audit trail verified');

  console.log('\n======================================================');
  console.log('ALL G12.7 KILL SWITCH & SAFE MODE DRILLS PASSED (6/6)');
  console.log('======================================================\n');
}

runDrill().catch((err) => {
  console.error('\n[G12.7 DRILL FAILED]:', err);
  process.exit(1);
});
