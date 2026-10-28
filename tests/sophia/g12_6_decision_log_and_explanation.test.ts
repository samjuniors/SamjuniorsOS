import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { executeSophiaTurn } from '../../src/lib/server/sophia/turn-executor';
import { ConversationStore } from '../../src/lib/server/conversation/store';
import { SophiaMemoryStore } from '../../src/lib/server/sophia/personal-memory-store';
import { ConversationAdapterRegistry } from '../../src/lib/server/ai';
import {
  DecisionLogStore,
  CreateDecisionLogInput,
} from '../../src/lib/server/sophia/decision-log-store';
import {
  isExplanationQuery,
  extractExplanationQueryLogId,
  buildDecisionLogEntry,
  formatDecisionLogExplanation,
  formatNoDecisionLogExplanation,
} from '../../src/lib/server/sophia/decision-log';
import { GET as getWhyRoute } from '../../src/app/api/sofia/why/route';
import {
  GET as getDecisionLogRoute,
  POST as postDecisionLogRoute,
} from '../../src/app/api/sofia/decision-log/route';
import { GET as getSophiaWhyRoute } from '../../src/app/api/sophia/why/route';
import { GET as getSophiaDecisionLogRoute } from '../../src/app/api/sophia/decision-log/route';
import { NextRequest } from '../../src/lib/server/http';

console.log('\n======================================================');
console.log('STARTING G12.6 DECISION LOG & EXPLANATION TEST SUITE');
console.log('======================================================\n');

async function runTests() {
  const registry = ConversationAdapterRegistry.getInstance();
  registry.setPin('fake');

  const founderId = `founder-g12-6-${randomUUID()}`;
  const convStore = ConversationStore.getInstance();
  const decStore = DecisionLogStore.getInstance();
  const memStore = SophiaMemoryStore.getInstance();

  await decStore.clearForTest();

  // =========================================================================
  // Group 1: Schema and DecisionLogStore CRUD & Query Interface
  // =========================================================================
  console.log('--- Group 1: Schema and DecisionLogStore CRUD & Query Interface ---');

  const conv1 = await convStore.createConversation({ founderId, title: 'Group 1 Conversation' });

  // 1.1 Record valid decision log entry
  const entryInput1: CreateDecisionLogInput = {
    turnId: 'turn-g12-1',
    conversationId: conv1.id,
    actor: 'sophia',
    query: 'Audit the cloud spend for Q3',
    route: 'research',
    scopes: ['company_brain'],
    confidence: 0.88,
    policyResult: {
      actionClass: 'read_only',
      autonomyLevel: 1,
      decision: 'auto',
      limitsChecked: { spendCapUsd: 50, currentSpendUsd: 5.2, withinLimits: true },
      reasons: ['Read-only analytical query within spend limits'],
    },
    outcome: 'answered',
    sources: ['CloudBillingStore', 'CompanyKnowledgeStore'],
    reasoning: 'Analytical request regarding Q3 cloud spend.',
  };

  const recorded1 = await decStore.recordDecision(entryInput1);
  assert.ok(recorded1.id.startsWith('dlog-'), 'ID must have canonical dlog- prefix');
  assert.equal(recorded1.turnId, 'turn-g12-1');
  assert.equal(recorded1.conversationId, conv1.id);
  assert.equal(recorded1.route, 'research');
  assert.equal(recorded1.confidence, 0.88);
  assert.equal(recorded1.outcome, 'answered');
  assert.deepEqual(recorded1.scopes, ['company_brain']);
  assert.equal(recorded1.policyResult?.decision, 'auto');
  console.log('  [PASS] 1.1. Record valid decision log entry with inputs, route, confidence, policyResult, and outcome');

  // 1.2 Retrieve by ID
  const fetchedById = await decStore.getDecision(recorded1.id);
  assert.ok(fetchedById, 'Entry must be retrievable by ID');
  assert.equal(fetchedById?.id, recorded1.id);
  assert.equal(fetchedById?.query, 'Audit the cloud spend for Q3');
  console.log('  [PASS] 1.2. Retrieve decision log entry by canonical ID');

  // 1.3 Retrieve by turnId
  const fetchedByTurn = await decStore.getDecisionByTurnId(conv1.id, 'turn-g12-1');
  assert.ok(fetchedByTurn, 'Entry must be retrievable by turnId');
  assert.equal(fetchedByTurn?.id, recorded1.id);
  console.log('  [PASS] 1.3. Retrieve decision log entry by conversationId and turnId');

  // 1.4 Retrieve latest decision
  const entryInput2: CreateDecisionLogInput = {
    turnId: 'turn-g12-2',
    conversationId: conv1.id,
    actor: 'sophia',
    query: 'Should we hire another engineer?',
    route: 'propose-for-approval',
    scopes: ['company_brain'],
    confidence: 0.92,
    policyResult: {
      actionClass: 'governance_proposal',
      autonomyLevel: 1,
      decision: 'needs_approval',
      reasons: ['Headcount addition requires founder decision'],
    },
    outcome: 'proposed_for_approval',
    reasoning: 'Strategic personnel proposal requires founder ratification.',
  };
  const recorded2 = await decStore.recordDecision(entryInput2);

  const latest = await decStore.getLatestDecision(conv1.id);
  assert.ok(latest, 'Must retrieve latest decision entry');
  assert.equal(latest?.id, recorded2.id);
  assert.equal(latest?.route, 'propose-for-approval');
  console.log('  [PASS] 1.4. Retrieve latest decision log entry in conversation');

  // 1.5 Query filtering
  const allConvLogs = await decStore.queryDecisions({ conversationId: conv1.id });
  assert.equal(allConvLogs.length, 2, 'Must return 2 logs for conversation');
  assert.equal(allConvLogs[0].id, recorded2.id, 'Newest log must be first (reverse chronological)');

  const researchLogs = await decStore.queryDecisions({
    conversationId: conv1.id,
    route: 'research',
  });
  assert.equal(researchLogs.length, 1);
  assert.equal(researchLogs[0].id, recorded1.id);

  const paginatedLogs = await decStore.queryDecisions({
    conversationId: conv1.id,
    limit: 1,
    offset: 1,
  });
  assert.equal(paginatedLogs.length, 1);
  assert.equal(paginatedLogs[0].id, recorded1.id, 'Offset 1 must return the older entry');
  console.log('  [PASS] 1.5. Query decision logs by route, conversationId, and pagination (limit/offset)');

  // 1.6 Strict validation fail-closed on invalid input
  await assert.rejects(
    async () => {
      await decStore.recordDecision({
        conversationId: '',
        query: 'test',
        route: 'converse',
        confidence: 0.5,
        outcome: 'answered',
        reasoning: 'test',
      });
    },
    /conversationId is required/,
    'Empty conversationId must reject fail-closed'
  );

  await assert.rejects(
    async () => {
      await decStore.recordDecision({
        conversationId: conv1.id,
        query: '',
        route: 'converse',
        confidence: 0.5,
        outcome: 'answered',
        reasoning: 'test',
      });
    },
    /query input is required/,
    'Empty query must reject fail-closed'
  );
  console.log('  [PASS] 1.6. Validation fails closed on missing required inputs');

  // =========================================================================
  // Group 2: Deterministic Decision Replay
  // =========================================================================
  console.log('\n--- Group 2: Deterministic Decision Replay ---');

  const replayConv = await convStore.createConversation({ founderId, title: 'Replay Conversation' });
  const entryForReplay = await decStore.recordDecision({
    turnId: 'replay-turn-1',
    conversationId: replayConv.id,
    actor: 'sophia',
    query: 'What is our MRR and runway?',
    route: 'recall-company',
    confidence: 0.9,
    policyResult: { actionClass: 'read_only', autonomyLevel: 1, decision: 'auto' },
    outcome: 'answered',
    reasoning: 'Financial metric query targeting Company Brain.',
  });

  const replayResult = await decStore.replayDecision(entryForReplay.id);
  assert.equal(replayResult.success, true);
  assert.equal(replayResult.matches, true, 'Deterministic replay route must match original recorded route');
  assert.equal(replayResult.replayedRoute, 'recall-company');
  assert.ok(replayResult.replayedConfidence >= 0.65, 'Replayed confidence must be within expected range');
  console.log('  [PASS] 2.1. Deterministic replay evaluates recorded query and verifies route match');

  await assert.rejects(
    async () => {
      await decStore.replayDecision('non-existent-log-id');
    },
    /not found for replay/,
    'Replaying non-existent log ID must throw'
  );
  console.log('  [PASS] 2.2. Replaying non-existent decision log ID rejects fail-closed');

  // =========================================================================
  // Group 3: "Why did you do that" is Answered from Log Entries that are Cited
  // =========================================================================
  console.log('\n--- Group 3: "Why Did You Do That" Cites Authoritative Log Entries ---');

  const whyConv = await convStore.createConversation({ founderId, title: 'Why Explanation Conv' });

  // 3.1 Initial action turn
  const turn1 = await executeSophiaTurn({
    message: 'What is our monthly recurring revenue MRR?',
    founderId,
    conversationId: whyConv.id,
    turnId: 'why-step-1',
  });
  assert.equal(turn1.success, true);
  const logId1 = turn1.decisionLog?.id;
  assert.ok(logId1, 'Action turn must carry decisionLog with authoritative ID');

  // 3.2 "Why did you do that?" cites previous log entry
  assert.equal(isExplanationQuery('Why did you do that?'), true);
  assert.equal(isExplanationQuery('why did you choose that'), true);
  assert.equal(isExplanationQuery('explain your decision'), true);
  assert.equal(isExplanationQuery('what was your reasoning?'), true);

  const turn2 = await executeSophiaTurn({
    message: 'Why did you do that?',
    founderId,
    conversationId: whyConv.id,
    turnId: 'why-step-2',
  });
  assert.equal(turn2.success, true);
  assert.ok(turn2.reply.includes(logId1!), `Explanation reply must cite log ID [${logId1}]`);
  assert.ok(turn2.reply.includes('recall-company'), 'Explanation reply must cite route');
  assert.ok(turn2.reply.includes('company_brain'), 'Explanation reply must cite scopes read');
  assert.ok(turn2.reply.includes('answered'), 'Explanation reply must cite outcome');
  assert.ok(turn2.decisionLog?.sources?.includes(`DecisionLog:${logId1}`), 'Explanation turn must cite log in its sources');
  console.log('  [PASS] 3.1. "Why did you do that?" cites exact previous decision log ID, route, scopes, and outcome');

  // 3.3 Explicit log ID citation: "Why did you do dlog-..."
  const turn3 = await executeSophiaTurn({
    message: `Why did you do ${logId1}?`,
    founderId,
    conversationId: whyConv.id,
    turnId: 'why-step-3',
  });
  assert.equal(turn3.success, true);
  assert.ok(turn3.reply.includes(logId1!), `Reply must cite the requested log ID [${logId1}]`);
  assert.ok(turn3.reply.includes('recall-company'), 'Reply must cite the route of the requested log entry');
  console.log('  [PASS] 3.2. Explicit decision log ID citation ("Why did you do dlog-...") retrieves and explains specific entry');

  // 3.4 Honest abstention in fresh conversation
  const emptyConv = await convStore.createConversation({ founderId, title: 'Fresh Empty Conv' });
  const emptyWhyTurn = await executeSophiaTurn({
    message: 'Why did you do that?',
    founderId,
    conversationId: emptyConv.id,
    turnId: 'empty-why-1',
  });
  assert.equal(emptyWhyTurn.success, true);
  assert.ok(
    emptyWhyTurn.reply.includes('No previous decision log entries exist in this session to explain'),
    'Must honestly abstain when no previous log entry exists'
  );
  console.log('  [PASS] 3.3. Fresh conversation with no prior entries honestly abstains from explaining');

  // 3.5 Specific non-existent log ID abstention
  const missingWhyTurn = await executeSophiaTurn({
    message: 'Why did you do dlog-nonexistent999?',
    founderId,
    conversationId: emptyConv.id,
    turnId: 'empty-why-2',
  });
  assert.equal(missingWhyTurn.success, true);
  assert.ok(
    missingWhyTurn.reply.includes('No decision log entry found with ID [dlog-nonexistent999]'),
    'Must honestly state that the cited log ID does not exist'
  );
  console.log('  [PASS] 3.4. Asking about non-existent log ID honestly reports entry not found');

  // =========================================================================
  // Group 4: Invariant "No log entry means no action" (Fail-Closed Rule)
  // =========================================================================
  console.log('\n--- Group 4: Invariant "No Log Entry Means No Action" (Fail-Closed) ---');

  // 4.1 Simulate failure in DecisionLogStore.recordDecision
  const failConv = await convStore.createConversation({ founderId, title: 'Fail Closed Conv' });
  const originalRecord = decStore.recordDecision.bind(decStore);

  // Force recordDecision to throw an unrecoverable persistence error
  (decStore as any).recordDecision = async () => {
    throw new Error('Disk write error: authoritative decision log failed to commit');
  };

  try {
    const failedTurn = await executeSophiaTurn({
      message: 'What is our MRR?',
      founderId,
      conversationId: failConv.id,
      turnId: 'fail-closed-turn-1',
    });

    assert.equal(failedTurn.success, false, 'Turn must fail when decision log recording fails');
    assert.equal(failedTurn.intent, 'refuse', 'Intent must be refuse on log recording failure');
    assert.equal(failedTurn.directiveExecuted, false, 'Directive must NOT execute');
    assert.ok(
      failedTurn.reply.includes('Action aborted: failed to record authoritative decision log entry'),
      'Reply must state action was aborted fail-closed'
    );
    assert.ok(
      failedTurn.error?.includes('Decision log recording failed'),
      'Error message must state decision log recording failed'
    );
    console.log('  [PASS] 4.1. Fail-closed: failure to record decision log aborts action immediately ("no log entry means no action")');
  } finally {
    // Restore original method
    (decStore as any).recordDecision = originalRecord;
  }

  // 4.2 Verify every turn writes to DecisionLogStore
  const auditConv = await convStore.createConversation({ founderId, title: 'Audit Verification Conv' });
  const normalTurn = await executeSophiaTurn({
    message: 'Hello Sophia, what is the plan for today?',
    founderId,
    conversationId: auditConv.id,
    turnId: 'audit-turn-1',
  });
  assert.equal(normalTurn.success, true);
  const auditLog = await decStore.getDecisionByTurnId(auditConv.id, 'audit-turn-1');
  assert.ok(auditLog, 'Turn must exist in authoritative DecisionLogStore');
  assert.equal(auditLog?.outcome, 'answered');
  assert.equal(auditLog?.route, 'converse');
  console.log('  [PASS] 4.2. Every completed turn persists an authoritative entry in DecisionLogStore');

  // =========================================================================
  // Group 5: HTTP API Endpoints
  // =========================================================================
  console.log('\n--- Group 5: HTTP API Endpoints ---');

  // 5.1 GET /api/sofia/decision-log
  const logReq = new NextRequest(
    `http://localhost:3000/api/sofia/decision-log?conversationId=${whyConv.id}&limit=10`,
    {
      headers: {
        'x-samjuniors-dev-as': 'founder',
        'x-founder-id': founderId,
      },
    }
  );
  const logRes = await getDecisionLogRoute(logReq);
  assert.equal(logRes.status, 200);
  const logData = await logRes.json();
  assert.equal(logData.success, true);
  assert.ok(logData.logs.length >= 2, 'Must return at least 2 logs for whyConv');
  console.log('  [PASS] 5.1. GET /api/sofia/decision-log returns queried entries with count');

  // 5.2 POST /api/sofia/decision-log (Replay)
  const replayReq = new NextRequest('http://localhost:3000/api/sofia/decision-log', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-samjuniors-dev-as': 'founder',
      'x-founder-id': founderId,
    },
    body: JSON.stringify({ id: logId1 }),
  });
  const replayRes = await postDecisionLogRoute(replayReq);
  assert.equal(replayRes.status, 200);
  const replayData = await replayRes.json();
  assert.equal(replayData.success, true);
  assert.equal(replayData.replay.matches, true);
  assert.equal(replayData.replay.replayedRoute, 'recall-company');
  console.log('  [PASS] 5.2. POST /api/sofia/decision-log replays and validates decision');

  // 5.3 GET /api/sofia/why
  const whyReq = new NextRequest(
    `http://localhost:3000/api/sofia/why?conversationId=${whyConv.id}&id=${logId1}`,
    {
      headers: {
        'x-samjuniors-dev-as': 'founder',
        'x-founder-id': founderId,
      },
    }
  );
  const whyRes = await getWhyRoute(whyReq);
  assert.equal(whyRes.status, 200);
  const whyData = await whyRes.json();
  assert.equal(whyData.success, true);
  assert.equal(whyData.log.id, logId1);
  assert.ok(whyData.explanation.includes(logId1!), 'Explanation must cite the log ID');
  console.log('  [PASS] 5.3. GET /api/sofia/why returns entry and formatted explanation');

  // 5.4 Alias parity with /api/sophia/*
  const sophiaWhyReq = new NextRequest(
    `http://localhost:3000/api/sophia/why?conversationId=${whyConv.id}&id=${logId1}`,
    {
      headers: {
        'x-samjuniors-dev-as': 'founder',
        'x-founder-id': founderId,
      },
    }
  );
  const sophiaWhyRes = await getSophiaWhyRoute(sophiaWhyReq);
  assert.equal(sophiaWhyRes.status, 200);

  const sophiaLogReq = new NextRequest(
    `http://localhost:3000/api/sophia/decision-log?conversationId=${whyConv.id}`,
    {
      headers: {
        'x-samjuniors-dev-as': 'founder',
        'x-founder-id': founderId,
      },
    }
  );
  const sophiaLogRes = await getSophiaDecisionLogRoute(sophiaLogReq);
  assert.equal(sophiaLogRes.status, 200);
  console.log('  [PASS] 5.4. API route parity between /api/sofia/* and /api/sophia/*');

  // 5.5 Unauthorized rejection
  const unauthReq = new NextRequest('http://localhost:3000/api/sofia/decision-log', {
    headers: {
      'x-samjuniors-role': 'AUDITOR',
    },
  });
  const unauthRes = await getDecisionLogRoute(unauthReq);
  assert.equal(unauthRes.status, 401, 'Unauthenticated request must return 401');
  console.log('  [PASS] 5.5. Unauthenticated request to decision log API returns 401');

  console.log('\n======================================================');
  console.log('G12.6 TEST RESULTS: ALL 18 TESTS PASSED (18/18 ASSERTIONS)');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n[G12.6 TEST FAILED]:', err);
  process.exit(1);
});
