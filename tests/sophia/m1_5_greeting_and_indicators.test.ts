import assert from 'assert';
import { getSofiaGreeting } from '../../src/lib/server/sophia/greeting';
import { InMemoryApprovalStore } from '../../src/lib/server/authorization/approval-store';
import { AgentRunStore } from '../../src/lib/server/agents/run-store';
import { controlLayer } from '../../src/sofia/sophia/control';
import { GET as greetingRouteHandler } from '../../src/app/api/sofia/greeting/route';
import { NextRequest } from 'next/server';

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('STARTING M1.5 GREETING & HONEST INDICATORS TEST SUITE');
  console.log('======================================================\n');

  const approvalStore = InMemoryApprovalStore.getInstance();
  const runStore = AgentRunStore.getInstance();

  // Backup existing store state to guarantee test isolation
  const backupApprovals = new Map(approvalStore.approvals);
  const backupRuns = new Map((runStore as any).runs);

  // --------------------------------------------------------------------------
  // Group 1: Greeting on Open from Real State (Empty State)
  // --------------------------------------------------------------------------
  console.log('--- Group 1: Greeting on Open with Empty State ---');

  // Clear any existing approvals and runs for the clean empty state test
  approvalStore.approvals.clear();
  (runStore as any).runs.clear();

  await runTest('1.1. Empty state greeting returns honest plain greeting', async () => {
    const greeting = await getSofiaGreeting();
    assert.strictEqual(greeting.hasRealState, false, 'hasRealState must be false when no approvals or runs exist');
    assert.strictEqual(greeting.stateSummary.pendingApprovalsCount, 0, 'pendingApprovalsCount must be 0');
    assert.strictEqual(greeting.stateSummary.activeWorkstreamsCount, 0, 'activeWorkstreamsCount must be 0');
    assert.ok(
      greeting.text.includes('Systems are calm, no approvals are pending'),
      'Greeting must honestly state no approvals are pending'
    );
    assert.ok(
      !greeting.text.includes('undefined') && !greeting.text.includes('null'),
      'Greeting text must not contain undefined or null placeholders'
    );
  });

  await runTest('1.2. Empty state greeting carries honest fallback indicator and company_brain scope', async () => {
    const greeting = await getSofiaGreeting();
    assert.strictEqual(greeting.liveAi, false, 'Initial state greeting is deterministic, liveAi must be false');
    assert.strictEqual(greeting.fallback, true, 'Deterministic greeting must indicate fallback: true');
    assert.ok(greeting.scopes.includes('company_brain'), 'Greeting from company state must declare company_brain scope');
    assert.ok(greeting.sources.length > 0, 'Sources must not be empty');
  });

  // --------------------------------------------------------------------------
  // Group 2: Greeting on Open with Full State (No State Invented)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 2: Greeting on Open with Full State ---');

  // Plant real pending approvals into the authoritative store
  const plantedApprovalId1 = `appr-test-1-${Date.now()}`;
  const plantedApprovalId2 = `appr-test-2-${Date.now()}`;
  await approvalStore.save({
    id: plantedApprovalId1,
    workflowInstanceId: 'wf-inst-1',
    stepId: 'step-deploy',
    actionName: 'deploy_production',
    employeeRole: 'finance',
    classification: 'financial_mutation',
    target: { targetSystem: 'stripe', metadata: { amount: 500 } },
    requestedAt: new Date().toISOString(),
    scope: { scopeType: 'single_action', allowedUses: 1, usedCount: 0 },
  });
  await approvalStore.save({
    id: plantedApprovalId2,
    workflowInstanceId: 'wf-inst-2',
    stepId: 'step-migration',
    actionName: 'database_migration',
    employeeRole: 'pm',
    classification: 'system_modification',
    target: { targetSystem: 'postgres', metadata: { schema: 'v2' } },
    requestedAt: new Date().toISOString(),
    scope: { scopeType: 'single_action', allowedUses: 1, usedCount: 0 },
  });

  // Plant a running workstream
  const plantedRunId = `run-test-${Date.now()}`;
  await runStore.saveRun({
    runId: plantedRunId,
    directive: 'Audit third-party dependencies',
    protocolStep: 'research',
    agentId: 'researcher',
    assignedAgents: ['researcher'],
    status: 'running',
    startedAt: new Date().toISOString(),
  });

  await runTest('2.1. Full state greeting reflects exact real state counts', async () => {
    const greeting = await getSofiaGreeting();
    assert.strictEqual(greeting.hasRealState, true, 'hasRealState must be true when approvals and runs exist');
    assert.strictEqual(greeting.stateSummary.pendingApprovalsCount, 2, 'Must report exact 2 pending approvals');
    assert.ok(
      greeting.stateSummary.activeWorkstreamsCount >= 1,
      'Must report at least 1 active workstream'
    );
    assert.ok(
      greeting.text.includes('2 approvals awaiting your review in the governance gate'),
      'Greeting text must cite exact approval count from store'
    );
    assert.ok(
      greeting.text.includes('active multi-agent workstream'),
      'Greeting text must cite active workstreams'
    );
  });

  await runTest('2.2. Full state greeting cites sources truthfully', async () => {
    const greeting = await getSofiaGreeting();
    assert.ok(greeting.sources.includes('InMemoryApprovalStore'), 'Sources must cite InMemoryApprovalStore');
    assert.ok(greeting.sources.includes('AgentRunStore'), 'Sources must cite AgentRunStore');
  });

  await runTest('2.3. No state is invented: counts match real store state strictly', async () => {
    const greeting = await getSofiaGreeting();
    const actualPending = (await approvalStore.list()).filter(
      (a) => (!a.decision || (a.decision as string) === 'pending') && (!a.expiresAt || new Date(a.expiresAt).getTime() > Date.now())
    ).length;
    const actualRuns = (await runStore.listRuns()).filter((r) => r.status === 'running').length;
    assert.strictEqual(greeting.stateSummary.pendingApprovalsCount, actualPending);
    assert.strictEqual(greeting.stateSummary.activeWorkstreamsCount, actualRuns);
  });

  // --------------------------------------------------------------------------
  // Group 3: Honest Indicators (Live-or-Fallback Badges)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 3: Honest Indicators (Live-or-Fallback Badges) ---');

  await runTest('3.1. Turn model preserves liveAi and fallback flags accurately', () => {
    controlLayer.reset();
    controlLayer.addSophiaTurn('Live model reply', true, {
      liveAi: true,
      fallback: false,
      mode: 'live_model',
      scopes: ['company_brain'],
    });

    const last = controlLayer.history[controlLayer.history.length - 1];
    assert.strictEqual(last.liveAi, true, 'Turn must carry liveAi: true');
    assert.strictEqual(last.fallback, false, 'Turn must carry fallback: false');

    controlLayer.addSophiaTurn('Deterministic fallback reply', true, {
      liveAi: false,
      fallback: true,
      mode: 'deterministic_fallback',
      scopes: ['personal_mind'],
    });

    const fallbackTurn = controlLayer.history[controlLayer.history.length - 1];
    assert.strictEqual(fallbackTurn.liveAi, false, 'Turn must carry liveAi: false');
    assert.strictEqual(fallbackTurn.fallback, true, 'Turn must carry fallback: true');
  });

  // --------------------------------------------------------------------------
  // Group 4: Memory Scope Chips
  // --------------------------------------------------------------------------
  console.log('\n--- Group 4: Memory Scope Chips ---');

  await runTest('4.1. Turn carries personal_mind scope chip data', () => {
    controlLayer.reset();
    controlLayer.addSophiaTurn('Your secret snack is gelato', true, {
      scopes: ['personal_mind'],
      sources: [{ title: 'SophiaMemoryStore', url: '' }],
    });

    const turn = controlLayer.history[0];
    assert.ok(Array.isArray(turn.scopes), 'Turn must have scopes array');
    assert.ok(turn.scopes.includes('personal_mind'), 'Scopes must contain personal_mind');
    assert.ok(!turn.scopes.includes('company_brain'), 'Scopes must NOT contain company_brain');
  });

  await runTest('4.2. Turn carries company_brain scope chip data', () => {
    controlLayer.reset();
    controlLayer.addSophiaTurn('Company MRR is $12,400', true, {
      scopes: ['company_brain'],
      sources: [{ title: 'CompanyStateStore', url: '' }],
    });

    const turn = controlLayer.history[0];
    assert.ok(turn.scopes?.includes('company_brain'), 'Scopes must contain company_brain');
    assert.ok(!turn.scopes?.includes('personal_mind'), 'Scopes must NOT contain personal_mind');
  });

  await runTest('4.3. Conversational greeting turn has empty scopes', () => {
    controlLayer.reset();
    controlLayer.addSophiaTurn('Hello Founder, how are you today?', true, {
      scopes: [],
    });

    const turn = controlLayer.history[0];
    assert.strictEqual(turn.scopes?.length, 0, 'Conversational greeting must have 0 scopes');
  });

  // --------------------------------------------------------------------------
  // Group 5: API Route Seam
  // --------------------------------------------------------------------------
  console.log('\n--- Group 5: API Route Seam ---');

  await runTest('5.1. GET /api/sofia/greeting returns valid greeting payload', async () => {
    const req = new NextRequest('http://localhost:3000/api/sofia/greeting');
    const res = await greetingRouteHandler(req);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(typeof body.text === 'string' && body.text.length > 0, 'Response must contain text string');
    assert.ok(typeof body.hasRealState === 'boolean', 'Response must contain hasRealState boolean');
    assert.ok(typeof body.stateSummary === 'object', 'Response must contain stateSummary object');
    assert.ok(Array.isArray(body.scopes), 'Response must contain scopes array');
    assert.ok(Array.isArray(body.sources), 'Response must contain sources array');
  });

  // Restore backed up store state
  approvalStore.approvals.clear();
  backupApprovals.forEach((v, k) => approvalStore.approvals.set(k, v));
  (runStore as any).runs.clear();
  backupRuns.forEach((v, k) => (runStore as any).runs.set(k, v));

  console.log('\n======================================================');
  console.log('M1.5 TEST RESULTS: ALL 9 TESTS PASSED');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
