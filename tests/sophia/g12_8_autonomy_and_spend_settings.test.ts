/**
 * G12.8: Settings for Autonomy and Spend Limits Drill & Verification Suite
 *
 * Exit Requirement:
 * "A settings page edits the limits; a test proves an unset cap means no
 * autonomous model spend and that lowering the cap stops a running task;
 * every change is logged as a founder action. The founder said on 2026-10-20
 * that the daily spend cap will be adjusted in settings."
 *
 * Phases:
 * 1. Settings Page / UI Contract & API Endpoints Verification
 * 2. Unset Spend Cap Strictly Prohibits Autonomous Model Spend
 * 3. Interactive Spend Tracked with Unset Cap, Refuses on Reaching Cap
 * 4. Lowering the Cap Stops Running Tasks Mid-Flight
 * 5. Every Modification Logged as Tamper-Evident Founder Action
 * 6. Deterministic Autonomy Policy Elevation & Governance Boundaries
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { NextRequest } from '@/lib/server/http';
import { SpendSettingsManager } from '../../src/lib/server/sophia/spend-settings';
import { SafeModeManager } from '../../src/lib/server/sophia/stop-control';
import { AutonomyPolicyEngine } from '../../src/lib/server/authorization/autonomy-policy';
import { ServerAgentExecutor } from '../../src/lib/server/agents/executor';
import { AgentRunStore } from '../../src/lib/server/agents/run-store';
import { WorkflowScheduler } from '../../src/lib/server/workflow/scheduler';
import { InMemoryWorkflowStore } from '../../src/lib/server/workflow/store';
import { InMemoryScheduledWorkStore } from '../../src/lib/server/workflow/scheduler-store';
import { executeSophiaTurn } from '../../src/lib/server/sophia/turn-executor';
import { ConversationAdapterRegistry } from '../../src/lib/server/ai/adapter';
import { InMemoryAuditStore } from '../../src/lib/server/authorization/approval-store';
import { verifyAuditChain } from '../../src/lib/server/authorization/audit-integrity';
import { GET as getSpendRoute, POST as postSpendRoute } from '../../src/app/api/sofia/spend/route';
import { GET as getAutonomyRoute, POST as postAutonomyRoute } from '../../src/app/api/sofia/autonomy/route';
import { GET as getSophiaSpendRoute, POST as postSophiaSpendRoute } from '../../src/app/api/sophia/spend/route';
import { GET as getSophiaAutonomyRoute, POST as postSophiaAutonomyRoute } from '../../src/app/api/sophia/autonomy/route';

async function runG128SpendAndAutonomyDrill() {
  console.log('\n======================================================================');
  console.log('G12.8 DRILL: SETTINGS FOR AUTONOMY AND SPEND LIMITS');
  console.log('======================================================================\n');

  const founderId = 'founder-drill-g12-8';
  const spendManager = SpendSettingsManager.getInstance();
  const safeMode = SafeModeManager.getInstance();
  const autonomyEngine = AutonomyPolicyEngine.getInstance();
  const runStore = AgentRunStore.getInstance();

  // Reset providers to fake for isolation
  ConversationAdapterRegistry.resetInstance();
  const fakeProvider = ConversationAdapterRegistry.getInstance().getFakeProvider();
  fakeProvider.setConfigured(true);
  fakeProvider.setGenerator(() => JSON.stringify({
    route: 'converse',
    kind: 'conversation',
    reply: 'Verified G12.8 conversational reply.',
    confidence: 0.95,
  }));
  ConversationAdapterRegistry.getInstance().setPin('fake');

  // -------------------------------------------------------------------------
  // Phase 1: Settings Page / UI Contract & API Endpoints Verification
  // -------------------------------------------------------------------------
  console.log('[Phase 1] Verifying Settings Page UI Contract & API Endpoints...');

  // 1a. Inspect UI components for Spend and Autonomy controls
  const settingsSheetContent = fs.readFileSync(
    path.join(process.cwd(), 'src/sofia/ui/SettingsSheet.tsx'),
    'utf8'
  );
  assert.ok(settingsSheetContent.includes('data-testid="spend-settings-section"'), 'SettingsSheet must contain spend-settings-section');
  assert.ok(settingsSheetContent.includes('data-testid="spend-cap-input"'), 'SettingsSheet must contain spend-cap-input');
  assert.ok(settingsSheetContent.includes('data-testid="save-spend-cap-button"'), 'SettingsSheet must contain save-spend-cap-button');
  assert.ok(settingsSheetContent.includes('data-testid="clear-spend-cap-button"'), 'SettingsSheet must contain clear-spend-cap-button');
  assert.ok(settingsSheetContent.includes('data-testid="current-daily-spend"'), 'SettingsSheet must contain current-daily-spend');
  assert.ok(settingsSheetContent.includes('data-testid="interactive-spend"'), 'SettingsSheet must contain interactive-spend');
  assert.ok(settingsSheetContent.includes('data-testid="autonomous-spend"'), 'SettingsSheet must contain autonomous-spend');
  assert.ok(settingsSheetContent.includes('data-testid="autonomy-settings-section"'), 'SettingsSheet must contain autonomy-settings-section');
  assert.ok(settingsSheetContent.includes('data-testid="founder-quote-input"'), 'SettingsSheet must contain founder-quote-input');
  assert.ok(settingsSheetContent.includes('data-testid="save-autonomy-button"'), 'SettingsSheet must contain save-autonomy-button');
  console.log('  ✔ 1a. SettingsSheet contains full Spend & Autonomy interactive controls');

  const settingsDrawerContent = fs.readFileSync(
    path.join(process.cwd(), 'src/components/SettingsDrawer.tsx'),
    'utf8'
  );
  assert.ok(settingsDrawerContent.includes('Spend & Autonomy Limits'), 'SettingsDrawer must contain Spend & Autonomy Limits');
  assert.ok(settingsDrawerContent.includes('data-testid="autonomy-settings-section"'), 'SettingsDrawer must contain autonomy-settings-section');
  assert.ok(settingsDrawerContent.includes('data-testid="save-autonomy-button"'), 'SettingsDrawer must contain save-autonomy-button');
  console.log('  ✔ 1b. SettingsDrawer companion panel verified');

  const desktopOSContent = fs.readFileSync(
    path.join(process.cwd(), 'src/os/components/os/DesktopOS.tsx'),
    'utf8'
  );
  assert.ok(desktopOSContent.includes('Spend & Autonomy'), 'DesktopOS settings popover must include Spend & Autonomy');
  assert.ok(desktopOSContent.includes('Daily Model Cap'), 'DesktopOS settings popover must display Daily Model Cap');
  console.log('  ✔ 1c. DesktopOS settings popover integration verified');

  // 1d. GET /api/sofia/spend returns settings, breakdown, autonomyRules, and canRunAutonomous
  const getSpendReq = new NextRequest('http://localhost:3000/api/sofia/spend', {
    headers: { 'x-founder-id': founderId },
  });
  const getSpendRes = await getSpendRoute(getSpendReq);
  assert.strictEqual(getSpendRes.status, 200, 'GET /api/sofia/spend must return 200');
  const getSpendData = await getSpendRes.json();
  assert.strictEqual(getSpendData.success, true);
  assert.ok(getSpendData.settings !== undefined, 'settings must be present');
  assert.ok(getSpendData.autonomyRules !== undefined, 'autonomyRules must be present in GET');
  assert.strictEqual(typeof getSpendData.canRunAutonomous, 'boolean');
  console.log('  ✔ 1d. GET /api/sofia/spend returns settings, autonomyRules, and canRunAutonomous');

  // 1e. POST /api/sofia/spend edits spend cap to $15.00
  const postSpendReq = new NextRequest('http://localhost:3000/api/sofia/spend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-founder-id': founderId },
    body: JSON.stringify({ spendCap: 15.0, reason: 'Setting daily limit in drill' }),
  });
  const postSpendRes = await postSpendRoute(postSpendReq);
  assert.strictEqual(postSpendRes.status, 200);
  const postSpendData = await postSpendRes.json();
  assert.strictEqual(postSpendData.success, true);
  assert.strictEqual(postSpendData.settings.dailySpendCapUsd, 15.0);
  console.log('  ✔ 1e. POST /api/sofia/spend edits daily spend cap');

  // 1f. GET & POST /api/sofia/autonomy edits autonomy level
  const getAutonomyReq = new NextRequest('http://localhost:3000/api/sofia/autonomy', {
    headers: { 'x-founder-id': founderId },
  });
  const getAutonomyRes = await getAutonomyRoute(getAutonomyReq);
  assert.strictEqual(getAutonomyRes.status, 200);
  const getAutonomyData = await getAutonomyRes.json();
  assert.ok(getAutonomyData.autonomyRules.internal_write !== undefined);

  const postAutonomyReq = new NextRequest('http://localhost:3000/api/sofia/autonomy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-founder-id': founderId },
    body: JSON.stringify({
      actionClass: 'internal_write',
      newLevel: 'L2',
      founderQuote: 'Founder verified internal write policy at L2.',
      founderDecisionId: 'decision-autonomy-test-1',
      reason: 'Setting policy via Settings API',
    }),
  });
  const postAutonomyRes = await postAutonomyRoute(postAutonomyReq);
  assert.strictEqual(postAutonomyRes.status, 200);
  const postAutonomyData = await postAutonomyRes.json();
  assert.strictEqual(postAutonomyData.rule.currentLevel, 'L2');
  console.log('  ✔ 1f. Dedicated /api/sofia/autonomy GET & POST functional');

  // 1g. Re-exported endpoints /api/sophia/* parity check
  const sophiaSpendRes = await getSophiaSpendRoute(getSpendReq);
  assert.strictEqual(sophiaSpendRes.status, 200);
  const sophiaAutonomyRes = await getSophiaAutonomyRoute(getAutonomyReq);
  assert.strictEqual(sophiaAutonomyRes.status, 200);
  console.log('  ✔ 1g. Alias endpoints /api/sophia/* verified in full parity');

  // 1h. Fail-closed security validation
  const unauthReq = new NextRequest('http://localhost:3000/api/sofia/spend', {
    headers: { 'x-samjuniors-role': 'AUDITOR' },
  });
  const unauthRes = await getSpendRoute(unauthReq);
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated / non-founder request must return 401');

  const negSpendReq = new NextRequest('http://localhost:3000/api/sofia/spend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-founder-id': founderId },
    body: JSON.stringify({ spendCap: -10 }),
  });
  const negSpendRes = await postSpendRoute(negSpendReq);
  assert.strictEqual(negSpendRes.status, 400, 'Negative spend cap must return 400');
  console.log('  ✔ 1h. Security fail-closed gates reject unauthenticated and invalid inputs\n');

  // -------------------------------------------------------------------------
  // Phase 2: Unset Spend Cap Strictly Prohibits Autonomous Model Spend
  // -------------------------------------------------------------------------
  console.log('[Phase 2] Verifying Unset Spend Cap Strictly Prohibits Autonomous Spend...');

  // Reset to default UNSET state
  spendManager.resetForTest({ dailySpendCapUsd: null, currentDailySpendUsd: 0 });
  safeMode.resetForTesting();

  // 2a. Manager evaluation blocks autonomous spend
  const unsetSettings = spendManager.getSettings();
  assert.strictEqual(unsetSettings.dailySpendCapUsd, null, 'Cap must be null');
  const unsetAutoCheck = spendManager.canExecuteAutonomousSpend();
  assert.strictEqual(unsetAutoCheck.allowed, false, 'Autonomous spend must be disallowed when cap is unset');
  assert.strictEqual(unsetAutoCheck.reason, 'NO_SPEND_CAP_CONFIGURED');
  console.log('  ✔ 2a. SpendSettingsManager: canExecuteAutonomousSpend returns allowed: false (NO_SPEND_CAP_CONFIGURED)');

  // 2b. WorkflowScheduler skips due work when cap is unset
  const wfStore = new InMemoryWorkflowStore();
  const schedStore = new InMemoryScheduledWorkStore();
  const scheduler = new WorkflowScheduler(schedStore, wfStore);
  const past = new Date(Date.now() - 5000).toISOString();

  await wfStore.saveDefinition({
    id: 'wf-spend-drill-1',
    workflowId: 'wf-spend-drill-1',
    version: '1',
    name: 'Autonomous Spend Workflow',
    description: 'Testing unset cap skip',
    steps: [
      {
        id: 'step-auto-1',
        name: 'Autonomous Research Task',
        assignedRole: 'researcher',
        skill: 'market_research',
        sideEffectClassification: 'read_only',
        targetContext: { targetSystem: 'llm' },
        dependencies: [],
      },
    ],
  } as any);

  await wfStore.saveInstance({
    instanceId: 'inst-spend-drill-1',
    workflowId: 'wf-spend-drill-1',
    version: '1',
    status: 'running',
    context: {},
    stepStates: { 'step-auto-1': { status: 'pending' } },
    startedAt: past,
    history: [],
    scope: { founderId },
  } as any);

  await scheduler.scheduleWork({
    workflowInstanceId: 'inst-spend-drill-1',
    stepId: 'step-auto-1',
    scheduleType: 'one_time',
    executeAt: past,
  });

  const dueEval = await scheduler.evaluateDueWork(new Date().toISOString());
  assert.strictEqual(dueEval.processedCount, 0, 'Scheduler must process 0 jobs when spend cap is unset');
  assert.strictEqual(dueEval.results[0].status, 'skipped', 'Due job status must be skipped');
  assert.ok(dueEval.results[0].error?.includes('No spend cap configured'), 'Error must cite no spend cap configured');
  console.log('  ✔ 2b. WorkflowScheduler: evaluateDueWork skips due autonomous jobs when cap is unset');

  // 2c. ServerAgentExecutor deterministically blocks autonomous agent tasks without invoking LLM
  let llmCallsCount = 0;
  fakeProvider.setGenerator(() => {
    llmCallsCount++;
    return JSON.stringify({ reply: 'This should never be generated' });
  });

  const executor = new ServerAgentExecutor();
  const blockedAgentResult = await executor.executeAgentTask(
    'researcher',
    {
      directive: 'Conduct market analysis for Lumora pricing',
      protocolStep: 'research',
      taskTitle: 'Market Research lumora',
      taskDescription: 'Investigate education tech pricing models',
    }
  );

  assert.strictEqual(blockedAgentResult.success, false, 'Agent task must fail when spend cap is unset');
  assert.ok(blockedAgentResult.statusMessage.includes('Autonomous model spend is disabled') || blockedAgentResult.statusMessage.includes('No spend cap configured'));
  assert.strictEqual(llmCallsCount, 0, 'Zero LLM calls must reach the model provider');

  // 2d. Assert run recorded as 'halted' with unverified provenance in AgentRunStore
  const recordedBlockedRun = await runStore.getRun(blockedAgentResult.runId);
  assert.ok(recordedBlockedRun !== null, 'Run record must be persisted in AgentRunStore');
  assert.strictEqual(recordedBlockedRun?.status, 'halted', 'Run status must be halted');
  assert.strictEqual(recordedBlockedRun?.durationMs, 0, 'Duration must be 0ms when blocked prior to model call');
  assert.strictEqual(recordedBlockedRun?.provenance.isVerified, false, 'Provenance must be unverified');
  console.log('  ✔ 2c. ServerAgentExecutor: Deterministically blocks autonomous task and records status "halted" with zero LLM calls\n');

  // -------------------------------------------------------------------------
  // Phase 3: Interactive Spend Tracked with Unset Cap, Refuses on Reaching Cap
  // -------------------------------------------------------------------------
  console.log('[Phase 3] Verifying Interactive Spend Tracked with Unset Cap, Refuses on Reaching Cap...');

  // Reset spend to unset
  spendManager.resetForTest({ dailySpendCapUsd: null, currentDailySpendUsd: 0 });

  // 3a. Interactive check is permitted with unset cap
  const interactiveCheck = spendManager.canExecuteInteractiveSpend();
  assert.strictEqual(interactiveCheck.allowed, true, 'Interactive spend is allowed when cap is unset');

  fakeProvider.setGenerator(() => JSON.stringify({
    route: 'converse',
    kind: 'conversation',
    reply: 'Hello Founder, Lumora metrics look good today.',
    confidence: 0.98,
  }));

  const turnRes = await executeSophiaTurn({
    message: 'Sophia, give me an update on company health.',
    founderId,
    turnId: 'turn-interactive-spend-1',
  });
  assert.strictEqual(turnRes.success, true);
  const afterTurnSettings = spendManager.getSettings();
  assert.ok(afterTurnSettings.interactiveSpendUsd > 0, 'Interactive spend must be incremented');
  assert.ok(afterTurnSettings.currentDailySpendUsd > 0, 'Total daily spend must reflect interactive spend');
  console.log(`  ✔ 3a. Interactive turn permitted with unset cap; counted spend ($${afterTurnSettings.interactiveSpendUsd.toFixed(4)})`);

  // 3b. Configure cap of $1.00 and set spend to $1.00 (cap reached)
  spendManager.resetForTest({
    dailySpendCapUsd: 1.0,
    currentDailySpendUsd: 1.0,
    interactiveSpendUsd: 0.5,
    autonomousSpendUsd: 0.5,
  });

  const cappedInteractiveCheck = spendManager.canExecuteInteractiveSpend();
  assert.strictEqual(cappedInteractiveCheck.allowed, false, 'Interactive check returns false when cap reached');
  assert.strictEqual(cappedInteractiveCheck.reason, 'SPEND_CAP_EXCEEDED');

  const refusedTurn = await executeSophiaTurn({
    message: 'Sophia, how is engineering progressing?',
    founderId,
    turnId: 'turn-capped-refuse-1',
  });
  assert.strictEqual(refusedTurn.success, false, 'Turn must be refused when cap reached');
  assert.strictEqual(refusedTurn.intent, 'refuse');
  assert.ok(refusedTurn.reply.includes('MODEL SPEND CAP REACHED') || refusedTurn.reply.includes('spend cap reached'));
  console.log('  ✔ 3b. Reaching spend cap stops dialogue turns and explicitly says spend cap reached\n');

  // -------------------------------------------------------------------------
  // Phase 4: Lowering the Cap Stops Running Tasks Mid-Flight
  // -------------------------------------------------------------------------
  console.log('[Phase 4] Executing Drill: Lowering the Cap Stops Running Tasks Mid-Flight...');

  // Start with cap of $25.00 and current spend of $5.00
  spendManager.resetForTest({
    dailySpendCapUsd: 25.0,
    currentDailySpendUsd: 5.0,
    autonomousSpendUsd: 3.0,
    interactiveSpendUsd: 2.0,
  });
  safeMode.resetForTesting();

  // Set delayed model generator to simulate in-flight model execution
  fakeProvider.setGenerator(async () => {
    await new Promise((r) => setTimeout(r, 1200));
    return JSON.stringify({
      statusMessage: 'Research finished',
      summary: 'Market trends analysis',
      artifactContent: 'Market data',
      evidenceBasis: 'model_reasoning',
      keyTakeaways: ['Key takeaway A'],
    });
  });

  const runningWorkerController = new AbortController();
  const workerExecutionPromise = executor.executeAgentTask(
    'researcher',
    {
      directive: 'Long-running competitor pricing scan',
      protocolStep: 'research',
      taskTitle: 'Long In-Flight Research',
      taskDescription: 'Simulates active task running when cap changes',
    },
    { signal: runningWorkerController.signal }
  );

  // Allow worker to enter in-flight execution
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(spendManager.getRunningTasksCount() >= 1, 'Task must be registered with SpendSettingsManager');

  // Founder lowers spend cap to $4.00 (below current spend of $5.00)
  console.log('  -> Founder lowers spend cap to $4.00 (below current $5.00 spend)...');
  await spendManager.updateSpendCap({
    newCapUsd: 4.0,
    founderId,
    reason: 'Emergency budget conservation',
  });

  // Await halted execution
  const haltedResult = await workerExecutionPromise;
  assert.strictEqual(haltedResult.success, false, 'Task must fail/halt when cap is lowered below current spend');
  assert.strictEqual(safeMode.isFrozen(), true, 'Safe Mode must be activated when cap is lowered below current spend');

  const haltedRun = await runStore.getRun(haltedResult.runId);
  assert.ok(haltedRun !== null);
  assert.strictEqual(haltedRun?.status, 'halted', 'Run record status must be "halted"');
  assert.strictEqual(haltedRun?.provenance.isVerified, false, 'Provenance must be unverified');
  console.log('  ✔ 4a. Lowering cap below current spend immediately aborted in-flight worker (status: halted)');

  // 4b. Clearing the cap to UNSET while a task is running also stops running tasks
  spendManager.resetForTest({
    dailySpendCapUsd: 20.0,
    currentDailySpendUsd: 2.0,
  });
  safeMode.resetForTesting();

  const clearWorkerController = new AbortController();
  const clearWorkerPromise = executor.executeAgentTask(
    'pm',
    {
      directive: 'Draft product specification',
      protocolStep: 'prd',
      taskTitle: 'Long Product Spec',
      taskDescription: 'Simulates active task running when cap is cleared',
    },
    { signal: clearWorkerController.signal }
  );

  await new Promise((r) => setTimeout(r, 150));
  assert.ok(spendManager.getRunningTasksCount() >= 1);

  console.log('  -> Founder clears spend cap to UNSET (null)...');
  await spendManager.updateSpendCap({
    newCapUsd: null,
    founderId,
    reason: 'Disabling all autonomous spend',
  });

  const clearHaltedResult = await clearWorkerPromise;
  assert.strictEqual(clearHaltedResult.success, false, 'Task must halt when cap is cleared to null');
  assert.strictEqual(safeMode.isFrozen(), true, 'Safe Mode activated on clearing cap');
  console.log('  ✔ 4b. Clearing spend cap to UNSET immediately aborted running autonomous task\n');

  // -------------------------------------------------------------------------
  // Phase 5: Every Modification Logged as Tamper-Evident Founder Action
  // -------------------------------------------------------------------------
  console.log('[Phase 5] Verifying Every Modification Logged as Tamper-Evident Founder Action...');

  // Read spend cap audit history
  const spendAudits = spendManager.getSpendAuditHistory();
  assert.ok(spendAudits.length >= 2, 'Must have at least 2 spend audit records');
  const latestSpendAudit = spendAudits[0];
  assert.strictEqual(latestSpendAudit.actionName, 'update_model_spend_cap');
  assert.strictEqual(latestSpendAudit.requestedBy, founderId);
  assert.strictEqual(latestSpendAudit.decision, 'allowed');
  assert.strictEqual(latestSpendAudit.target?.metadata?.previousCapUsd, 20.0);
  assert.strictEqual(latestSpendAudit.target?.metadata?.newCapUsd, null);
  assert.strictEqual(latestSpendAudit.target?.metadata?.reason, 'Disabling all autonomous spend');
  console.log('  ✔ 5a. Spend cap modification durably logged with actionName "update_model_spend_cap" and founder attribution');

  // Perform autonomy level update and verify audit record
  const updatedRule = await autonomyEngine.setAutonomyLevel({
    founderId,
    actionClass: 'internal_write',
    newLevel: 'L2',
    founderDecisionId: 'decision-audit-verify-1',
    founderQuote: 'Founder updated internal write policy for audit verification.',
    reason: 'Audit verification test',
  });
  assert.strictEqual(updatedRule.currentLevel, 'L2');

  const allAudits = await InMemoryAuditStore.getInstance().list();
  const autonomyAudit = allAudits.find(
    (a) => a.actionName === 'autonomy.level_update' && a.requestId === 'decision-audit-verify-1'
  );
  assert.ok(autonomyAudit !== undefined, 'Autonomy level update audit record must exist');
  assert.strictEqual(autonomyAudit?.requestedBy, founderId);
  assert.strictEqual(autonomyAudit?.decision, 'allowed');
  assert.strictEqual(autonomyAudit?.target?.resourceId, 'internal_write');
  assert.strictEqual(autonomyAudit?.target?.metadata?.newLevel, 'L2');
  assert.strictEqual(autonomyAudit?.target?.metadata?.founderQuote, 'Founder updated internal write policy for audit verification.');
  console.log('  ✔ 5b. Autonomy level update durably logged with actionName "autonomy.level_update", decision ID, and quote');

  // Verify SHA-256 cryptographic chain integrity across the entire audit store
  const verifiedLedger = verifyAuditChain(allAudits);
  assert.ok(verifiedLedger.length >= allAudits.length, 'Audit chain verification succeeded with zero tamper/gap errors');
  console.log('  ✔ 5c. Cryptographic SHA-256 audit chain verified intact\n');

  // -------------------------------------------------------------------------
  // Phase 6: Deterministic Autonomy Policy Elevation & Governance Boundaries
  // -------------------------------------------------------------------------
  console.log('[Phase 6] Verifying Deterministic Autonomy Policy Elevation & Boundaries...');

  safeMode.resetForTesting();
  spendManager.resetForTest({ dailySpendCapUsd: 10.0, currentDailySpendUsd: 0 });

  // 6a. Elevate internal_write to L3: now auto-permitted within budget
  await autonomyEngine.setAutonomyLevel({
    founderId,
    actionClass: 'internal_write',
    newLevel: 'L3',
    founderDecisionId: 'decision-elevate-l3',
    founderQuote: 'Elevating internal write to L3 for fast workflow cycles.',
    reason: 'Founder operational efficiency decision',
  });

  const l3Eval = autonomyEngine.evaluate({
    actionClass: 'internal_write',
    role: 'pm',
    currentSpendUsd: 0,
    requestedLimitUsd: 0,
  });
  assert.strictEqual(l3Eval.effect, 'auto', 'internal_write at L3 must return effect: auto');
  console.log('  ✔ 6a. Founder elevation to L3 allows autonomous execution (effect: auto)');

  // 6b. Demote internal_write to L1: requires approval
  await autonomyEngine.setAutonomyLevel({
    founderId,
    actionClass: 'internal_write',
    newLevel: 'L1',
    founderDecisionId: 'decision-demote-l1',
    founderQuote: 'Demoting internal write to L1 for strict oversight.',
    reason: 'Founder oversight requirement',
  });

  const l1Eval = autonomyEngine.evaluate({
    actionClass: 'internal_write',
    role: 'pm',
    currentSpendUsd: 0,
    requestedLimitUsd: 0,
  });
  assert.strictEqual(l1Eval.effect, 'needs_approval', 'internal_write at L1 must return needs_approval');
  console.log('  ✔ 6b. Founder demotion to L1 enforces needs_approval');

  // 6c. Demote to L0: forbidden
  await autonomyEngine.setAutonomyLevel({
    founderId,
    actionClass: 'internal_write',
    newLevel: 'L0',
    founderDecisionId: 'decision-demote-l0',
    founderQuote: 'Disabling internal write completely.',
    reason: 'Emergency lock',
  });

  const l0Eval = autonomyEngine.evaluate({
    actionClass: 'internal_write',
    role: 'pm',
    currentSpendUsd: 0,
    requestedLimitUsd: 0,
  });
  assert.strictEqual(l0Eval.effect, 'forbidden', 'internal_write at L0 must return forbidden');
  console.log('  ✔ 6c. Demotion to L0 enforces forbidden');

  // 6d. Fail-closed: Non-founder elevation attempt strictly throws
  let nonFounderError: any = null;
  try {
    await autonomyEngine.setAutonomyLevel({
      founderId: 'unauthorized-user',
      actionClass: 'internal_write',
      newLevel: 'L3',
      founderDecisionId: 'fake-id',
      founderQuote: 'Unauthorized quote',
    });
  } catch (err) {
    nonFounderError = err;
  }
  assert.ok(nonFounderError !== null, 'Non-founder update must throw');
  assert.strictEqual(nonFounderError.name, 'UnauthorizedAutonomyMutationError');
  console.log('  ✔ 6d. Non-founder mutation rejected with UnauthorizedAutonomyMutationError');

  // Restore internal_write to G0.7 baseline (L2)
  await autonomyEngine.setAutonomyLevel({
    founderId,
    actionClass: 'internal_write',
    newLevel: 'L2',
    founderDecisionId: 'decision-restore-baseline',
    founderQuote: 'Restoring G0.7 baseline table.',
    reason: 'Test cleanup',
  });

  console.log('\n======================================================================');
  console.log('ALL G12.8 TESTS PASSED (6/6 PHASES CLEAN)');
  console.log('======================================================================\n');
}

runG128SpendAndAutonomyDrill().catch((err) => {
  console.error('\n❌ G12.8 DRILL FAILED:', err);
  process.exit(1);
});
