import assert from 'assert';
import { NextRequest } from 'next/server';
import { GET as schedulingGetHandler } from '../app/api/workflow/scheduling/route';
import { GET as runsGetHandler } from '../app/api/agents/runs/route';
import { GET as definitionsGetHandler } from '../app/api/workflow/definitions/route';
import { InMemoryScheduledWorkStore } from '../lib/server/workflow/scheduler-store';
import { InMemoryWorkflowStore } from '../lib/server/workflow/store';
import { AgentRunStore, AgentRunRecord } from '../lib/server/agents/run-store';
import { createExecutiveWorkflowDefinition } from '../lib/server/workflow/dynamic-dag';
import { DurableFileStore } from '../lib/server/persistence/durable-file-store';

/**
 * ============================================================================
 * SAMJUNIORS OS — PHASE 3.4 FOUNDER-GUARD LEGACY READ ROUTES TEST SUITE
 * ============================================================================
 *
 * Target routes audited and protected:
 *   1. GET /api/workflow/scheduling
 *   2. GET /api/agents/runs
 *   3. GET /api/workflow/definitions
 *
 * Requirements verified:
 *   1. Unauthenticated request → 401
 *   2. Wrong/invalid authentication (attacker role, invalid dev secret, missing secret, prod bypass) → 401
 *   3. Valid founder authentication → existing successful response
 *   4. Response schema remains compatible
 *   5. Route remains strictly read-only
 *   6. No authorization bypass through query parameters, body, or spoofed headers
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
const TEST_DEV_SECRET = 'p34_test_dev_secret_key_123';

function resetState() {
  process.env = { ...originalEnv };
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_MODE;
  delete process.env.SAMJUNIORS_DEV_SECRET;
  (process.env as any).NODE_ENV = 'test';
  InMemoryWorkflowStore.getInstance().clear();
  InMemoryScheduledWorkStore.getInstance().clear();
  const runStore = AgentRunStore.getInstance();
  runStore.runs.clear();
  DurableFileStore.getInstance().clearCollection('agent_runs');
}

function makeFounderRequest(url: string, extraHeaders?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
    headers: {
      'x-samjuniors-dev-as': 'founder',
      'x-samjuniors-dev-secret': TEST_DEV_SECRET,
      ...(extraHeaders || {}),
    },
  });
}

async function main(): Promise<void> {
  console.log('\n=== PHASE 3.4 — FOUNDER-GUARD LEGACY READ ROUTES ===\n');

  // ==========================================================================
  // ROUTE 1: GET /api/workflow/scheduling
  // ==========================================================================
  console.log('--- Route 1: GET /api/workflow/scheduling ---');

  // 1.1 Unauthenticated request rejected with 401
  try {
    resetState();
    const req = new NextRequest('http://localhost:3000/api/workflow/scheduling', { method: 'GET' });
    const res = await schedulingGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error && body.error.includes('Unauthorized'), 'Error message should state Unauthorized');
    recordPass('GET /api/workflow/scheduling: Unauthenticated request rejected with HTTP 401');
  } catch (err) {
    recordFail('GET /api/workflow/scheduling: Unauthenticated request rejected with HTTP 401', err);
  }

  // 1.2 Spoofed dev role (e.g. attacker) rejected with 401
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const req = new NextRequest('http://localhost:3000/api/workflow/scheduling', {
      method: 'GET',
      headers: {
        'x-samjuniors-dev-as': 'attacker',
        'x-samjuniors-dev-secret': TEST_DEV_SECRET,
      },
    });
    const res = await schedulingGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    recordPass('GET /api/workflow/scheduling: Spoofed non-founder role rejected with HTTP 401');
  } catch (err) {
    recordFail('GET /api/workflow/scheduling: Spoofed non-founder role rejected with HTTP 401', err);
  }

  // 1.3 Founder identity with invalid dev secret rejected with 401
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const req = makeFounderRequest('http://localhost:3000/api/workflow/scheduling', {
      'x-samjuniors-dev-secret': 'wrong_secret',
    });
    const res = await schedulingGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    recordPass('GET /api/workflow/scheduling: Invalid dev secret rejected with HTTP 401');
  } catch (err) {
    recordFail('GET /api/workflow/scheduling: Invalid dev secret rejected with HTTP 401', err);
  }

  // 1.4 Production mode strictly rejects dev header bypass even with valid secret
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    (process.env as any).NODE_ENV = 'production';
    const req = makeFounderRequest('http://localhost:3000/api/workflow/scheduling');
    const res = await schedulingGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401 in production, got ${res.status}`);
    recordPass('GET /api/workflow/scheduling: Production mode rejects dev headers with HTTP 401');
  } catch (err) {
    recordFail('GET /api/workflow/scheduling: Production mode rejects dev headers with HTTP 401', err);
  }

  // 1.5 Query parameter bypass attempt rejected with 401
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const req = new NextRequest('http://localhost:3000/api/workflow/scheduling?role=FOUNDER&devAs=founder&secret=' + TEST_DEV_SECRET, {
      method: 'GET',
    });
    const res = await schedulingGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401 on query param bypass attempt, got ${res.status}`);
    recordPass('GET /api/workflow/scheduling: Query parameter auth bypass attempt rejected with HTTP 401');
  } catch (err) {
    recordFail('GET /api/workflow/scheduling: Query parameter auth bypass attempt rejected with HTTP 401', err);
  }

  // 1.6 Valid founder authentication returns existing response schema
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    // Seed test scheduled work and workflow
    const workflowStore = InMemoryWorkflowStore.getInstance();
    const schedulerStore = InMemoryScheduledWorkStore.getInstance();

    const wf = createExecutiveWorkflowDefinition('Plan Q4 Expansion', { executeTools: false, autonomyLevel: 'autonomous' });
    await workflowStore.saveDefinition(wf);

    const inst: any = {
      instanceId: 'inst-test-1',
      definitionId: wf.id,
      definitionVersion: wf.version,
      status: 'awaiting_approval',
      objective: 'Plan Q4 Expansion',
      context: {},
      stepStates: {
        'step-1': {
          stepId: 'step-1',
          assignedRole: 'coo',
          status: 'pending',
          skill: 'operations',
          approvalState: 'pending',
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await workflowStore.saveInstance(inst);

    await schedulerStore.save({
      id: 'sched-1',
      workflowInstanceId: inst.instanceId,
      stepId: 'step-1',
      scheduleType: 'delay',
      executeAt: new Date(Date.now() + 60000).toISOString(),
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      executionHistory: [],
      idempotencyKey: 'idem-sched-1',
    });

    const req = makeFounderRequest('http://localhost:3000/api/workflow/scheduling');
    const res = await schedulingGetHandler(req);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();

    assert.ok(body.asOfTime, 'Response must contain asOfTime');
    assert.strictEqual(body.totalCount, 1, 'Response must have totalCount 1');
    assert.ok(Array.isArray(body.schedules), 'Response schedules must be an array');
    assert.strictEqual(body.schedules.length, 1);
    assert.strictEqual(body.schedules[0].id, 'sched-1');
    assert.strictEqual(body.schedules[0].workflowObjective, 'Plan Q4 Expansion');
    assert.strictEqual(body.schedules[0].stepAssignedRole, 'coo');
    recordPass('GET /api/workflow/scheduling: Valid founder authentication returns intact enriched schedules');
  } catch (err) {
    recordFail('GET /api/workflow/scheduling: Valid founder authentication returns intact enriched schedules', err);
  }

  // 1.7 Read-only guarantee: store state is not mutated by GET
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const schedulerStore = InMemoryScheduledWorkStore.getInstance();
    await schedulerStore.save({
      id: 'sched-probe',
      workflowInstanceId: 'inst-probe',
      stepId: 'step-probe',
      scheduleType: 'delay',
      executeAt: new Date().toISOString(),
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      executionHistory: [],
      idempotencyKey: 'idem-probe',
    });
    const beforeList = await schedulerStore.list();

    const req = makeFounderRequest('http://localhost:3000/api/workflow/scheduling');
    const res = await schedulingGetHandler(req);
    assert.strictEqual(res.status, 200);

    const afterList = await schedulerStore.list();
    assert.deepStrictEqual(beforeList, afterList, 'GET route must not mutate scheduled store');
    recordPass('GET /api/workflow/scheduling: Route is strictly read-only');
  } catch (err) {
    recordFail('GET /api/workflow/scheduling: Route is strictly read-only', err);
  }

  // ==========================================================================
  // ROUTE 2: GET /api/agents/runs
  // ==========================================================================
  console.log('\n--- Route 2: GET /api/agents/runs ---');

  // 2.1 Unauthenticated request rejected with 401
  try {
    resetState();
    const req = new NextRequest('http://localhost:3000/api/agents/runs', { method: 'GET' });
    const res = await runsGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.error && body.error.includes('Unauthorized'));
    recordPass('GET /api/agents/runs: Unauthenticated request rejected with HTTP 401');
  } catch (err) {
    recordFail('GET /api/agents/runs: Unauthenticated request rejected with HTTP 401', err);
  }

  // 2.2 Spoofed dev role (e.g. attacker) rejected with 401
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const req = new NextRequest('http://localhost:3000/api/agents/runs', {
      method: 'GET',
      headers: {
        'x-samjuniors-dev-as': 'attacker',
        'x-samjuniors-dev-secret': TEST_DEV_SECRET,
      },
    });
    const res = await runsGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    recordPass('GET /api/agents/runs: Spoofed non-founder role rejected with HTTP 401');
  } catch (err) {
    recordFail('GET /api/agents/runs: Spoofed non-founder role rejected with HTTP 401', err);
  }

  // 2.3 Founder identity with invalid dev secret rejected with 401
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const req = makeFounderRequest('http://localhost:3000/api/agents/runs', {
      'x-samjuniors-dev-secret': 'wrong_secret',
    });
    const res = await runsGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    recordPass('GET /api/agents/runs: Invalid dev secret rejected with HTTP 401');
  } catch (err) {
    recordFail('GET /api/agents/runs: Invalid dev secret rejected with HTTP 401', err);
  }

  // 2.4 Production mode strictly rejects dev header bypass even with valid secret
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    (process.env as any).NODE_ENV = 'production';
    const req = makeFounderRequest('http://localhost:3000/api/agents/runs');
    const res = await runsGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401 in production, got ${res.status}`);
    recordPass('GET /api/agents/runs: Production mode rejects dev headers with HTTP 401');
  } catch (err) {
    recordFail('GET /api/agents/runs: Production mode rejects dev headers with HTTP 401', err);
  }

  // 2.5 Query parameter bypass attempt rejected with 401
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const req = new NextRequest('http://localhost:3000/api/agents/runs?role=FOUNDER&devAs=founder', {
      method: 'GET',
    });
    const res = await runsGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401 on query param bypass attempt, got ${res.status}`);
    recordPass('GET /api/agents/runs: Query parameter auth bypass attempt rejected with HTTP 401');
  } catch (err) {
    recordFail('GET /api/agents/runs: Query parameter auth bypass attempt rejected with HTTP 401', err);
  }

  // 2.6 Valid founder authentication returns existing response schema
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const runStore = AgentRunStore.getInstance();
    const testRun: AgentRunRecord = {
      runId: 'run-test-1',
      agentId: 'coo',
      agentName: 'Sophia Vance',
      protocolStep: 'coordinate',
      taskTitle: 'Execute operations directive',
      directive: 'Review resource allocation',
      status: 'completed',
      durationMs: 450,
      outputContent: 'Resource allocation verified.',
      provenance: {
        agentId: 'coo',
        agentName: 'Sophia Vance',
        taskId: 'task-test-1',
        protocolStep: 'coordinate',
        timestamp: new Date().toISOString(),
        isVerified: true,
        evidenceBasis: 'calculation',
      },
      timestamp: new Date().toISOString(),
    };
    await runStore.saveRun(testRun);

    const req = makeFounderRequest('http://localhost:3000/api/agents/runs');
    const res = await runsGetHandler(req);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.count, 1);
    assert.ok(Array.isArray(body.runs));
    assert.strictEqual(body.runs[0].runId, 'run-test-1');
    assert.strictEqual(body.runs[0].agentId, 'coo');
    recordPass('GET /api/agents/runs: Valid founder authentication returns intact runs list');
  } catch (err) {
    recordFail('GET /api/agents/runs: Valid founder authentication returns intact runs list', err);
  }

  // 2.7 Read-only guarantee: store state is not mutated by GET
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const runStore = AgentRunStore.getInstance();
    const beforeRuns = await runStore.listRuns();

    const req = makeFounderRequest('http://localhost:3000/api/agents/runs');
    const res = await runsGetHandler(req);
    assert.strictEqual(res.status, 200);

    const afterRuns = await runStore.listRuns();
    assert.deepStrictEqual(beforeRuns, afterRuns, 'GET route must not mutate agent runs');
    recordPass('GET /api/agents/runs: Route is strictly read-only');
  } catch (err) {
    recordFail('GET /api/agents/runs: Route is strictly read-only', err);
  }

  // ==========================================================================
  // ROUTE 3: GET /api/workflow/definitions
  // ==========================================================================
  console.log('\n--- Route 3: GET /api/workflow/definitions ---');

  // 3.1 Unauthenticated request rejected with 401
  try {
    resetState();
    const req = new NextRequest('http://localhost:3000/api/workflow/definitions', { method: 'GET' });
    const res = await definitionsGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error && body.error.includes('Unauthorized'));
    recordPass('GET /api/workflow/definitions: Unauthenticated request rejected with HTTP 401');
  } catch (err) {
    recordFail('GET /api/workflow/definitions: Unauthenticated request rejected with HTTP 401', err);
  }

  // 3.2 Spoofed dev role (e.g. attacker) rejected with 401
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const req = new NextRequest('http://localhost:3000/api/workflow/definitions', {
      method: 'GET',
      headers: {
        'x-samjuniors-dev-as': 'attacker',
        'x-samjuniors-dev-secret': TEST_DEV_SECRET,
      },
    });
    const res = await definitionsGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    recordPass('GET /api/workflow/definitions: Spoofed non-founder role rejected with HTTP 401');
  } catch (err) {
    recordFail('GET /api/workflow/definitions: Spoofed non-founder role rejected with HTTP 401', err);
  }

  // 3.3 Founder identity with invalid dev secret rejected with 401
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const req = makeFounderRequest('http://localhost:3000/api/workflow/definitions', {
      'x-samjuniors-dev-secret': 'wrong_secret',
    });
    const res = await definitionsGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    recordPass('GET /api/workflow/definitions: Invalid dev secret rejected with HTTP 401');
  } catch (err) {
    recordFail('GET /api/workflow/definitions: Invalid dev secret rejected with HTTP 401', err);
  }

  // 3.4 Production mode strictly rejects dev header bypass even with valid secret
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    (process.env as any).NODE_ENV = 'production';
    const req = makeFounderRequest('http://localhost:3000/api/workflow/definitions');
    const res = await definitionsGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401 in production, got ${res.status}`);
    recordPass('GET /api/workflow/definitions: Production mode rejects dev headers with HTTP 401');
  } catch (err) {
    recordFail('GET /api/workflow/definitions: Production mode rejects dev headers with HTTP 401', err);
  }

  // 3.5 Query parameter bypass attempt rejected with 401
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const req = new NextRequest('http://localhost:3000/api/workflow/definitions?role=FOUNDER&devAs=founder', {
      method: 'GET',
    });
    const res = await definitionsGetHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401 on query param bypass attempt, got ${res.status}`);
    recordPass('GET /api/workflow/definitions: Query parameter auth bypass attempt rejected with HTTP 401');
  } catch (err) {
    recordFail('GET /api/workflow/definitions: Query parameter auth bypass attempt rejected with HTTP 401', err);
  }

  // 3.6 Valid founder authentication returns existing response schema
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const workflowStore = InMemoryWorkflowStore.getInstance();
    const wf = createExecutiveWorkflowDefinition('Q4 Operations Definition', {
      executeTools: true,
      autonomyLevel: 'autonomous',
    });
    await workflowStore.saveDefinition(wf);

    const req = makeFounderRequest('http://localhost:3000/api/workflow/definitions');
    const res = await definitionsGetHandler(req);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const definitions = await res.json();
    assert.ok(Array.isArray(definitions), 'Definitions response must be an array');
    assert.ok(definitions.length >= 1, 'Should return at least 1 definition');
    const match = definitions.find((d: any) => d.id === wf.id);
    assert.ok(match, 'Saved definition must be present');
    assert.strictEqual(match.name, wf.name);
    recordPass('GET /api/workflow/definitions: Valid founder authentication returns intact definition list');
  } catch (err) {
    recordFail('GET /api/workflow/definitions: Valid founder authentication returns intact definition list', err);
  }

  // 3.7 Read-only guarantee: store state is not mutated by GET
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const workflowStore = InMemoryWorkflowStore.getInstance();
    const beforeDefs = await workflowStore.listDefinitions();

    const req = makeFounderRequest('http://localhost:3000/api/workflow/definitions');
    const res = await definitionsGetHandler(req);
    assert.strictEqual(res.status, 200);

    const afterDefs = await workflowStore.listDefinitions();
    assert.deepStrictEqual(beforeDefs, afterDefs, 'GET route must not mutate workflow definitions');
    recordPass('GET /api/workflow/definitions: Route is strictly read-only');
  } catch (err) {
    recordFail('GET /api/workflow/definitions: Route is strictly read-only', err);
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log(`\n==========================================`);
  console.log(`PHASE 3.4 LEGACY READ ROUTES SUITE: ${passed} passed, ${failed} failed`);
  console.log(`==========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
