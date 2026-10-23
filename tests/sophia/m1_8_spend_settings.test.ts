/**
 * M1.8 SPEND SETTINGS & AUTONOMY CEILING TEST SUITE
 *
 * Verifies:
 * 1. An unset spend cap (null) means no autonomous model spend runs.
 * 2. Interactive spend is counted, tracked, and shown.
 * 3. Reaching the spend cap stops operations and says so.
 * 4. Lowering the cap stops a running task and triggers freeze.
 * 5. Every change by the Founder is durably logged into the audit ledger.
 * 6. API routes enforce authentication and validate inputs.
 */

import assert from 'assert';
import { NextRequest } from '@/lib/server/http';
import { SpendSettingsManager } from '../../src/lib/server/sophia/spend-settings';
import { SafeModeManager } from '../../src/lib/server/sophia/stop-control';
import { WorkflowScheduler } from '../../src/lib/server/workflow/scheduler';
import { InMemoryWorkflowStore } from '../../src/lib/server/workflow/store';
import { InMemoryScheduledWorkStore } from '../../src/lib/server/workflow/scheduler-store';
import { executeSophiaTurn } from '../../src/lib/server/sophia/turn-executor';
import { ConversationStore } from '../../src/lib/server/conversation/store';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';
import { ConversationAdapterRegistry } from '../../src/lib/server/ai/adapter';
import { GET as getSpendRoute, POST as postSpendRoute } from '../../src/app/api/sofia/spend/route';

async function runM18SpendSettingsTests() {
  console.log('\n======================================================');
  console.log('STARTING M1.8 SPEND SETTINGS & AUTONOMY DRILL SUITE');
  console.log('======================================================\n');

  const FOUNDER_ID = 'founder-test-m1-8';
  const spendManager = SpendSettingsManager.getInstance();
  const safeMode = SafeModeManager.getInstance();
  const convStore = ConversationStore.getInstance();

  // Reset registry and pin fake provider for predictable model runs
  ConversationAdapterRegistry.resetInstance();
  const fakeProvider = ConversationAdapterRegistry.getInstance().getFakeProvider();
  const modelJson = JSON.stringify({
    route: 'converse',
    kind: 'conversation',
    reply: 'M1.8 spend test answer.',
    confidence: 0.95,
    reason: 'Spend test reply.',
  });
  fakeProvider.setGenerator(() => modelJson);
  ConversationAdapterRegistry.getInstance().setPin('fake');

  // --------------------------------------------------------------------------
  // Group 1: An Unset Cap Means No Autonomous Spend
  // --------------------------------------------------------------------------
  console.log('--- Group 1: An Unset Cap Means No Autonomous Spend ---');

  // Reset to default unset state
  spendManager.resetForTest({ dailySpendCapUsd: null, currentDailySpendUsd: 0 });
  safeMode.resetForTesting();

  // 1.1 Default state has null spend cap
  const defaultSettings = spendManager.getSettings();
  assert.strictEqual(defaultSettings.dailySpendCapUsd, null, '1.1: Default daily spend cap must be null (unset)');
  console.log('  [PASS] 1.1. Default daily spend cap is null (unset)');

  // 1.2 Autonomous spend check fails when cap is unset
  const autoCheck = spendManager.canExecuteAutonomousSpend();
  assert.strictEqual(autoCheck.allowed, false, '1.2: canExecuteAutonomousSpend must return allowed: false when cap is unset');
  assert.strictEqual(autoCheck.reason, 'NO_SPEND_CAP_CONFIGURED', '1.2: reason must be NO_SPEND_CAP_CONFIGURED');
  console.log('  [PASS] 1.2. canExecuteAutonomousSpend returns allowed: false with NO_SPEND_CAP_CONFIGURED');

  // 1.3 WorkflowScheduler.evaluateDueWork skips due work when cap is unset
  const wfStore = new InMemoryWorkflowStore();
  const schedStore = new InMemoryScheduledWorkStore();
  const scheduler = new WorkflowScheduler(schedStore, wfStore);

  await wfStore.saveDefinition({
    id: 'wf-auto-spend-test',
    workflowId: 'wf-auto-spend-test',
    version: '1',
    name: 'Auto Spend Test Workflow',
    description: 'Autonomous execution test',
    steps: [
      {
        id: 'step-1',
        name: 'Autonomous Model Task',
        employeeRole: 'researcher',
        classification: 'read_only',
        actionName: 'run_model_research',
        target: { targetSystem: 'llm' },
        dependencies: [],
      },
    ],
  } as any);

  const now = new Date();
  const past = new Date(now.getTime() - 10_000).toISOString();

  await wfStore.saveInstance({
    instanceId: 'inst-auto-spend-1',
    workflowId: 'wf-auto-spend-test',
    version: '1',
    status: 'running',
    context: {},
    stepStates: {
      'step-1': { status: 'pending' },
    },
    startedAt: past,
    history: [],
    scope: { founderId: FOUNDER_ID },
  } as any);

  await scheduler.scheduleWork({
    workflowInstanceId: 'inst-auto-spend-1',
    stepId: 'step-1',
    scheduleType: 'one_time',
    executeAt: past,
  });

  const evalResult = await scheduler.evaluateDueWork(new Date().toISOString());
  assert.strictEqual(evalResult.processedCount, 0, '1.3: evaluateDueWork must process 0 jobs when spend cap is unset');
  assert.strictEqual(evalResult.results.length, 1, '1.3: evaluation result contains skipped due item');
  assert.strictEqual(evalResult.results[0].status, 'skipped', '1.3: scheduled item status is skipped');
  assert.ok(evalResult.results[0].error?.includes('No spend cap configured'), '1.3: error explains no spend cap is configured');
  console.log('  [PASS] 1.3. WorkflowScheduler skips due work when spend cap is unset');

  // 1.4 Interactive spend is permitted when cap is unset
  const interactiveCheck = spendManager.canExecuteInteractiveSpend();
  assert.strictEqual(interactiveCheck.allowed, true, '1.4: canExecuteInteractiveSpend must be allowed when cap is unset');
  console.log('  [PASS] 1.4. Interactive dialogue turns remain permitted with unset cap');

  // --------------------------------------------------------------------------
  // Group 2: Interactive Spend is Counted and Shown
  // --------------------------------------------------------------------------
  console.log('\n--- Group 2: Interactive Spend is Counted and Shown ---');

  spendManager.resetForTest({ dailySpendCapUsd: 10.0, currentDailySpendUsd: 0 });

  const turnRes = await executeSophiaTurn({
    message: 'Hello Sophia, give me an update.',
    founderId: FOUNDER_ID,
    turnId: 'turn-spend-track-1',
  });

  assert.strictEqual(turnRes.success, true, '2.1: Turn executed successfully');
  const afterTurnSettings = spendManager.getSettings();
  assert.ok(afterTurnSettings.interactiveSpendUsd > 0, '2.1: interactiveSpendUsd must be greater than 0');
  assert.ok(afterTurnSettings.currentDailySpendUsd > 0, '2.1: currentDailySpendUsd must reflect interactive spend');
  console.log(`  [PASS] 2.1. Executing interactive turn counted spend ($${afterTurnSettings.interactiveSpendUsd})`);

  // Record autonomous spend manually
  spendManager.recordSpend({
    amountUsd: 0.05,
    type: 'autonomous',
    taskId: 'task-research-1',
  });

  const afterAutoSettings = spendManager.getSettings();
  assert.strictEqual(afterAutoSettings.autonomousSpendUsd, 0.05, '2.2: autonomousSpendUsd recorded correctly');
  assert.ok(afterAutoSettings.currentDailySpendUsd >= 0.052, '2.2: currentDailySpendUsd combines interactive and autonomous');
  console.log('  [PASS] 2.2. Spend breakdown distinguishes interactive vs autonomous expenditures');

  // --------------------------------------------------------------------------
  // Group 3: Reaching the Cap Stops and Says So
  // --------------------------------------------------------------------------
  console.log('\n--- Group 3: Reaching the Cap Stops and Says So ---');

  // Set cap to $1.00 and spend $1.00
  spendManager.resetForTest({
    dailySpendCapUsd: 1.0,
    currentDailySpendUsd: 1.0,
    interactiveSpendUsd: 0.5,
    autonomousSpendUsd: 0.5,
  });
  safeMode.resetForTesting();

  // 3.1 Both autonomous and interactive spend checks fail when cap is reached
  const capAutoCheck = spendManager.canExecuteAutonomousSpend();
  assert.strictEqual(capAutoCheck.allowed, false, '3.1: canExecuteAutonomousSpend returns false when cap reached');
  assert.strictEqual(capAutoCheck.reason, 'SPEND_CAP_EXCEEDED', '3.1: reason is SPEND_CAP_EXCEEDED');

  const capInteractiveCheck = spendManager.canExecuteInteractiveSpend();
  assert.strictEqual(capInteractiveCheck.allowed, false, '3.1: canExecuteInteractiveSpend returns false when cap reached');
  console.log('  [PASS] 3.1. Reaching cap blocks both autonomous and interactive execution');

  // 3.2 Turn attempted when cap is reached stops and says so
  const capTurnRes = await executeSophiaTurn({
    message: 'Sophia, analyze product pricing.',
    founderId: FOUNDER_ID,
    turnId: 'turn-spend-cap-refuse',
  });

  assert.strictEqual(capTurnRes.success, false, '3.2: Turn refused when spend cap is reached');
  assert.strictEqual(capTurnRes.intent, 'refuse', '3.2: Intent is refuse');
  assert.ok(capTurnRes.reply.includes('MODEL SPEND CAP REACHED'), '3.2: Sophia explicitly says model spend cap reached');
  assert.ok(capTurnRes.reply.includes('$1.00'), '3.2: Sophia cites current spend and limit');
  console.log('  [PASS] 3.2. Sophia halts dialogue turn and explicitly says spend cap reached');

  // --------------------------------------------------------------------------
  // Group 4: Lowering the Cap Stops a Running Task
  // --------------------------------------------------------------------------
  console.log('\n--- Group 4: Lowering the Cap Stops a Running Task ---');

  // Start with cap of $20.00 and current spend of $5.00
  spendManager.resetForTest({
    dailySpendCapUsd: 20.0,
    currentDailySpendUsd: 5.0,
  });
  safeMode.resetForTesting();

  // 4.1 Register a running autonomous task with an AbortController
  const taskAbortController = new AbortController();
  let taskWasAborted = false;
  taskAbortController.signal.addEventListener('abort', () => {
    taskWasAborted = true;
  });

  spendManager.registerRunningTask('running-council-task-1', taskAbortController, 'Executive council review');
  assert.strictEqual(taskAbortController.signal.aborted, false, '4.1: Task is running and not aborted');
  console.log('  [PASS] 4.1. Autonomous task registered with active AbortController');

  // 4.2 Lowering the cap below current spend stops running task
  await spendManager.updateSpendCap({
    newCapUsd: 4.0, // lowered from $20 to $4 (which is below current $5 spend)
    founderId: FOUNDER_ID,
    reason: 'Emergency budget conservation',
  });

  assert.strictEqual(taskWasAborted, true, '4.2: Lowering cap below current spend must abort running task');
  assert.strictEqual(safeMode.isFrozen(), true, '4.2: Lowering cap below current spend triggers safe mode freeze');
  console.log('  [PASS] 4.2. Lowering cap below current spend immediately aborted running task and activated safe mode');

  // --------------------------------------------------------------------------
  // Group 5: The Founder\'s Change is Logged to the Audit Ledger
  // --------------------------------------------------------------------------
  console.log('\n--- Group 5: The Founder\'s Change is Logged to the Audit Ledger ---');

  // Read audit history
  const auditEntries = spendManager.getSpendAuditHistory();
  assert.ok(auditEntries.length > 0, '5.1: Spend cap updates must produce durable audit records');

  const latestAudit = auditEntries[0];
  assert.strictEqual(latestAudit.actionName, 'update_model_spend_cap', '5.2: Audit action name is update_model_spend_cap');
  assert.strictEqual(latestAudit.requestedBy, FOUNDER_ID, '5.2: Audit requestedBy matches founderId');
  assert.strictEqual(latestAudit.decision, 'allowed', '5.2: Decision is allowed');
  assert.strictEqual(latestAudit.target?.metadata?.previousCapUsd, 20.0, '5.2: Audit records previous cap of $20');
  assert.strictEqual(latestAudit.target?.metadata?.newCapUsd, 4.0, '5.2: Audit records new cap of $4');
  assert.strictEqual(latestAudit.target?.metadata?.reason, 'Emergency budget conservation', '5.2: Audit records reason');
  console.log('  [PASS] 5.1. Founder spend cap update is logged in audits collection with full metadata');

  // Verify persistence in DurableFileStore
  const allAudits = DurableFileStore.getInstance().readCollection<any>('audits');
  const persistedEntry = allAudits[latestAudit.id];
  assert.ok(persistedEntry, '5.3: Audit record must be durably persisted in audits.json');
  console.log('  [PASS] 5.2. Audit record verified in durable store (audits collection)');

  // --------------------------------------------------------------------------
  // Group 6: API Routes & Security Gates
  // --------------------------------------------------------------------------
  console.log('\n--- Group 6: API Routes & Security Gates ---');

  // 6.1 Non-founder requests fail closed
  const unauthReq = new NextRequest('http://localhost:3000/api/sofia/spend', {
    method: 'GET',
    headers: {
      'x-samjuniors-role': 'AUDITOR',
    },
  });
  const unauthRes = await getSpendRoute(unauthReq);
  assert.strictEqual(unauthRes.status, 401, '6.1: Non-founder GET /api/sofia/spend must return 401');
  console.log('  [PASS] 6.1. Non-founder request to /api/sofia/spend fails closed (401)');

  // 6.2 Authenticated Founder updates cap via POST /api/sofia/spend
  const authPostReq = new NextRequest('http://localhost:3000/api/sofia/spend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-founder-id': FOUNDER_ID,
    },
    body: JSON.stringify({
      spendCap: 15.0,
      reason: 'Setting daily budget for test session',
    }),
  });
  const authPostRes = await postSpendRoute(authPostReq);
  assert.strictEqual(authPostRes.status, 200, '6.2: Authenticated POST /api/sofia/spend returns 200');
  const postData = await authPostRes.json();
  assert.strictEqual(postData.success, true, '6.2: Response indicates success');
  assert.strictEqual(postData.settings.dailySpendCapUsd, 15.0, '6.2: Settings updated to 15.0');
  console.log('  [PASS] 6.2. Authenticated Founder successfully updates spend cap via API');

  // 6.3 Clearing cap sets spendCap to null and disables autonomous spend
  const clearReq = new NextRequest('http://localhost:3000/api/sofia/spend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-founder-id': FOUNDER_ID,
    },
    body: JSON.stringify({
      spendCap: null,
      reason: 'Disabling autonomous spend by clearing cap',
    }),
  });
  const clearRes = await postSpendRoute(clearReq);
  assert.strictEqual(clearRes.status, 200, '6.3: Clear cap returns 200');
  const clearData = await clearRes.json();
  assert.strictEqual(clearData.settings.dailySpendCapUsd, null, '6.3: Spend cap is now null');
  assert.strictEqual(spendManager.canExecuteAutonomousSpend().allowed, false, '6.3: Autonomous spend disabled');
  console.log('  [PASS] 6.3. Clearing spend cap disables autonomous model spend deterministically');

  // 6.4 Invalid input validation
  const invalidReq = new NextRequest('http://localhost:3000/api/sofia/spend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-founder-id': FOUNDER_ID,
    },
    body: JSON.stringify({
      spendCap: -5.0,
    }),
  });
  const invalidRes = await postSpendRoute(invalidReq);
  assert.strictEqual(invalidRes.status, 400, '6.4: Negative spend cap returns 400');
  console.log('  [PASS] 6.4. Invalid spend cap inputs fail validation with 400');

  console.log('\n======================================================');
  console.log('M1.8 TEST RESULTS: ALL TESTS PASSED (16/16 ASSERTIONS)');
  console.log('======================================================\n');
}

runM18SpendSettingsTests().catch((err) => {
  console.error('\n[FATAL] M1.8 test suite failed:', err);
  process.exit(1);
});
