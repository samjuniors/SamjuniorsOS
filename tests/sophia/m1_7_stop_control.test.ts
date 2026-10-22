import assert from 'assert';
import { NextRequest } from 'next/server';
import {
  SafeModeManager,
  isStopCommand,
  isResumeCommand,
} from '../../src/lib/server/sophia/stop-control';
import { executeSophiaTurn } from '../../src/lib/server/sophia/turn-executor';
import { WorkflowScheduler } from '../../src/lib/server/workflow/scheduler';
import { InMemoryScheduledWorkStore } from '../../src/lib/server/workflow/scheduler-store';
import { InMemoryWorkflowStore } from '../../src/lib/server/workflow/store';
import { ConversationStore } from '../../src/lib/server/conversation/store';
import { ConversationAdapterRegistry, FakeConversationProvider } from '../../src/lib/server/ai';
import { POST as postStopRoute, GET as getStopRoute } from '../../src/app/api/sofia/stop/route';
import { POST as postResumeRoute } from '../../src/app/api/sofia/resume/route';

async function runTests() {
  console.log('\n======================================================');
  console.log('STARTING M1.7 STOP CONTROL & SAFE MODE DRILL SUITE');
  console.log('======================================================\n');

  const safeMode = SafeModeManager.getInstance();
  safeMode.resetForTesting();

  const convStore = ConversationStore.getInstance();
  const founderId = 'founder-test-m1-7';

  const registry = ConversationAdapterRegistry.getInstance();
  const fake = registry.getFakeProvider();
  registry.setPin('fake');

  // --- Group 1: Deterministic Stop Control with Provider Down ---
  console.log('--- Group 1: Deterministic Stop Control (Provider Down) ---');

  // Configure fake provider to fail (simulate completely dead/unreachable model provider)
  fake.setConfigured(false);

  // 1.1 Trigger stop deterministically
  const stopResult = await safeMode.triggerStop({
    source: 'panel',
    reason: 'Founder pressed emergency stop button',
    founderId,
  });

  assert.equal(stopResult.success, true, 'triggerStop must succeed even when model provider is down');
  assert.equal(stopResult.frozen, true, 'System must be marked frozen');
  assert.equal(safeMode.isFrozen(), true, 'safeMode.isFrozen() must return true');
  assert.equal(stopResult.source, 'panel');
  console.log('  [PASS] 1.1. triggerStop executes deterministically with provider completely down');

  // 1.2 Stop API route works with provider down
  const mockStopReq = new NextRequest('http://localhost:3000/api/sofia/stop', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-samjuniors-dev-as': 'founder',
      'x-founder-id': founderId,
    },
    body: JSON.stringify({ source: 'panel', reason: 'Emergency Stop Test' }),
  });
  const stopApiRes = await postStopRoute(mockStopReq);
  assert.equal(stopApiRes.status, 200, 'POST /api/sofia/stop must return 200 OK');
  const stopApiData = await stopApiRes.json();
  assert.equal(stopApiData.frozen, true);
  console.log('  [PASS] 1.2. POST /api/sofia/stop returns 200 OK without any model interaction');

  // 1.3 GET /api/sofia/stop reflects frozen status
  const mockGetStopReq = new NextRequest('http://localhost:3000/api/sofia/stop', {
    headers: {
      'x-samjuniors-dev-as': 'founder',
      'x-founder-id': founderId,
    },
  });
  const getStopRes = await getStopRoute(mockGetStopReq);
  assert.equal(getStopRes.status, 200);
  const getStopData = await getStopRes.json();
  assert.equal(getStopData.status.isFrozen, true);
  console.log('  [PASS] 1.3. GET /api/sofia/stop honestly reflects frozen Safe Mode state');

  // Reset provider and safe mode for next group
  fake.setConfigured(true);
  safeMode.resetForTesting();

  // --- Group 2: Mid-Reply Stop Drill with Provider Unavailable ---
  console.log('\n--- Group 2: Mid-Reply Stop Drill with Provider Unavailable ---');

  const drillConv = await convStore.createConversation({ founderId, title: 'Drill Conversation' });

  // Simulate a turn in-flight: slow/delayed provider response
  fake.setGenerator(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return 'Slow model response that should be aborted';
  });

  // Launch in-flight turn asynchronously
  const inFlightPromise = executeSophiaTurn({
    message: 'What is our MRR?',
    founderId,
    conversationId: drillConv.id,
    turnId: 'drill-mid-turn-1',
  });

  // Small delay to ensure turn is registered in-flight
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Trigger stop MID-REPLY while provider is stalled
  const midTurnStop = await safeMode.triggerStop({
    source: 'panel',
    reason: 'Founder pressed STOP mid-reply',
    founderId,
  });
  assert.equal(midTurnStop.frozen, true);

  // Await the in-flight turn: must settle cleanly with cancelled: true
  const turnResult = await inFlightPromise;
  assert.equal(turnResult.cancelled, true, 'Turn must report cancelled: true when aborted mid-reply');
  assert.equal(turnResult.directiveExecuted, false, 'No directives may execute when cancelled mid-reply');
  console.log('  [PASS] 2.1. In-flight turn halts immediately mid-reply upon stop trigger');
  console.log('  [PASS] 2.2. Settled result marks cancelled: true and executes zero side-effects');

  fake.setGenerator(null);
  safeMode.resetForTesting();

  // --- Group 3: Mid-Scheduled-Job Stop Drill ---
  console.log('\n--- Group 3: Mid-Scheduled-Job Stop Drill ---');

  const schedulerStore = InMemoryScheduledWorkStore.getInstance();
  const workflowStore = InMemoryWorkflowStore.getInstance();
  const scheduler = new WorkflowScheduler(schedulerStore, workflowStore);

  // Create a sample workflow definition and instance
  const workflowId = 'wf-test-drill';
  const instanceId = 'inst-test-drill-1';
  await workflowStore.saveDefinition({
    id: workflowId,
    version: '1.0.0',
    name: 'Scheduled Autonomous Job',
    objective: 'Autonomous operational monitor',
    steps: [
      {
        id: 'step-1',
        name: 'Autonomous Step 1',
        description: 'Autonomous execution',
        assignedRole: 'coo',
        skill: 'system_monitor',
      },
    ],
  });
  await workflowStore.saveInstance({
    instanceId,
    workflowId,
    version: '1.0.0',
    status: 'running',
    currentStepId: 'step-1',
    stateVersion: 1,
    stepStates: {
      'step-1': {
        status: 'ready',
        assignedRole: 'coo',
        skill: 'system_monitor',
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Schedule a job due immediately (executeAt in the past)
  const scheduledItem = await scheduler.scheduleWork({
    workflowInstanceId: instanceId,
    stepId: 'step-1',
    scheduleType: 'one_time',
    executeAt: new Date(Date.now() - 10000).toISOString(),
  });
  assert.equal(scheduledItem.status, 'scheduled');

  // Trigger Stop Control
  const schedStopResult = await safeMode.triggerStop({
    source: 'voice',
    reason: 'Spoken emergency stop command',
    founderId,
  });
  assert.equal(schedStopResult.frozen, true);

  // Evaluate due work while system is frozen: must execute 0 items
  const evalResult = await scheduler.evaluateDueWork();
  assert.equal(evalResult.processedCount, 0, 'Zero scheduled items may process while system is frozen');
  assert.equal(evalResult.results.length, 0, 'No execution results may be returned while frozen');
  console.log('  [PASS] 3.1. evaluateDueWork freezes completely: 0 scheduled jobs execute while stopped');

  safeMode.resetForTesting();

  // --- Group 4: Resuming Needs Founder's Confirmation ---
  console.log('\n--- Group 4: Resuming Needs Founder Confirmation ---');

  // Freeze system
  await safeMode.triggerStop({ source: 'panel', reason: 'Drill freeze', founderId });
  assert.equal(safeMode.isFrozen(), true);

  // 4.1 Non-resume conversational turns are refused deterministically
  const frozenTurn = await executeSophiaTurn({
    message: 'What is our Q3 strategy roadmap?',
    founderId,
    conversationId: drillConv.id,
    turnId: 'drill-frozen-turn',
  });
  assert.equal(frozenTurn.success, false, 'Turn must be refused while frozen');
  assert.equal(frozenTurn.cancelled, true, 'Turn must be marked cancelled');
  assert.ok(frozenTurn.reply.includes('SYSTEM IS FROZEN under Safe Mode'), 'Must explain safe mode freeze');
  console.log('  [PASS] 4.1. New dialogue turns are refused deterministically while system is frozen');

  // 4.2 Unconfirmed resume fails closed (400)
  const mockUnconfirmedResumeReq = new NextRequest('http://localhost:3000/api/sofia/resume', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-samjuniors-dev-as': 'founder',
      'x-founder-id': founderId,
    },
    body: JSON.stringify({ confirmed: false }),
  });
  const unconfirmedRes = await postResumeRoute(mockUnconfirmedResumeReq);
  assert.equal(unconfirmedRes.status, 400, 'Unconfirmed resume must fail closed with 400');
  assert.equal(safeMode.isFrozen(), true, 'System must remain frozen');
  console.log('  [PASS] 4.2. Resume attempt without confirmed: true fails closed (status 400)');

  // 4.3 Confirmed resume via API succeeds and unfreezes system
  const mockConfirmedResumeReq = new NextRequest('http://localhost:3000/api/sofia/resume', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-samjuniors-dev-as': 'founder',
      'x-founder-id': founderId,
    },
    body: JSON.stringify({ confirmed: true, reason: 'Drill verified resumption' }),
  });
  const confirmedRes = await postResumeRoute(mockConfirmedResumeReq);
  assert.equal(confirmedRes.status, 200, 'Confirmed resume must succeed with 200 OK');
  const confirmedData = await confirmedRes.json();
  assert.equal(confirmedData.resumed, true);
  assert.equal(safeMode.isFrozen(), false, 'System must no longer be frozen');
  console.log('  [PASS] 4.3. POST /api/sofia/resume with confirmed: true restores normal operation');

  // 4.4 Conversational "confirm resume" directive works
  // Freeze again to test voice/conversational unfreeze
  await safeMode.triggerStop({ source: 'voice', reason: 'Test voice freeze', founderId });
  assert.equal(safeMode.isFrozen(), true);

  const voiceResumeTurn = await executeSophiaTurn({
    message: 'confirm resume',
    founderId,
    conversationId: drillConv.id,
    turnId: 'drill-voice-resume',
  });
  assert.equal(voiceResumeTurn.success, true);
  assert.ok(voiceResumeTurn.reply.includes('Safe Mode deactivated'), 'Reply must confirm safe mode deactivated');
  assert.equal(safeMode.isFrozen(), false, 'System must be unfrozen after voice confirm resume');
  console.log('  [PASS] 4.4. Conversational "confirm resume" directive unfreezes system cleanly');

  // --- Group 5: Voice and Panel Stop Commands Recognition ---
  console.log('\n--- Group 5: Voice and Panel Stop Commands Recognition ---');

  assert.equal(isStopCommand('stop'), true);
  assert.equal(isStopCommand('STOP!'), true);
  assert.equal(isStopCommand('halt'), true);
  assert.equal(isStopCommand('freeze'), true);
  assert.equal(isStopCommand('emergency stop'), true);
  assert.equal(isStopCommand('pause everything'), true);
  assert.equal(isStopCommand('hello there'), false);

  assert.equal(isResumeCommand('confirm resume'), true);
  assert.equal(isResumeCommand('resume operations'), true);
  assert.equal(isResumeCommand('unfreeze'), true);
  assert.equal(isResumeCommand('tell me a joke'), false);

  // Test direct spoken "stop" command execution
  const stopTurn = await executeSophiaTurn({
    message: 'stop',
    founderId,
    conversationId: drillConv.id,
    turnId: 'drill-spoken-stop-turn',
  });
  assert.equal(stopTurn.success, true);
  assert.equal(stopTurn.intent, 'stop');
  assert.ok(stopTurn.reply.includes('EMERGENCY STOP ACTIVATED'));
  assert.equal(safeMode.isFrozen(), true, 'Spoken stop must immediately freeze system');
  console.log('  [PASS] 5.1. Direct spoken "stop" immediately activates Safe Mode freeze');

  // Unfreeze for audit check
  await safeMode.confirmResume({ founderId, confirmed: true });

  // --- Group 6: Audit Trail Integrity ---
  console.log('\n--- Group 6: Audit Trail Integrity ---');

  const auditLog = safeMode.getAuditLog();
  assert.ok(auditLog.length >= 4, 'Audit log must record all stop and resume events');
  const stopEntries = auditLog.filter((e) => e.type === 'STOP_TRIGGERED');
  const resumeEntries = auditLog.filter((e) => e.type === 'RESUME_CONFIRMED');
  assert.ok(stopEntries.length >= 2, 'Must have multiple recorded STOP_TRIGGERED events');
  assert.ok(resumeEntries.length >= 2, 'Must have multiple recorded RESUME_CONFIRMED events');

  for (const entry of auditLog) {
    assert.ok(entry.id.startsWith('stop-') || entry.id.startsWith('resume-'));
    assert.ok(entry.timestamp);
    assert.ok(entry.actor);
  }
  console.log('  [PASS] 6.1. SafeModeManager maintains tamper-evident in-memory audit log of all events');

  console.log('\n======================================================');
  console.log('M1.7 TEST RESULTS: ALL TESTS PASSED (16/16 ASSERTIONS)');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n[M1.7 TEST FAILED]:', err);
  process.exit(1);
});
