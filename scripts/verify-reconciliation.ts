import assert from 'assert';
import { NextRequest } from 'next/server';
import { getDatabaseMode, isAuthoritativeMode } from '../lib/server/db/authority';
import { AgentRunStore } from '../lib/server/agents/run-store';
import { SERVER_AGENTS } from '../lib/server/agents/definitions';
import { SideEffectAuthorizationGate } from '../lib/server/authorization/gate';
import { workstreamsFromRuns, agentStatesFromRuns, looksLikeDirective } from '../Uploaded/Design1/src/lib/runtime';
import { deriveGraph } from '../Uploaded/Design1/src/lib/flow';
import { GET as getAgentsRoute } from '../app/api/agents/route';
import { GET as getAgentsRunsRoute } from '../app/api/agents/runs/route';

let passed = 0;
let failed = 0;

function check(desc: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ✗ FAIL: ${desc}`);
      console.error(err);
      failed++;
    });
}

async function main() {
  console.log('\n======================================================');
  console.log('PHASE 3.4.2 — SAFE RECONCILIATION VERIFICATION SUITE');
  console.log('======================================================\n');

  console.log('--- 1. Production Persistence Authority ---');
  await check('getDatabaseMode() respects authority precedence', () => {
    const origEnv = process.env.NODE_ENV;
    const origDbMode = process.env.DATABASE_MODE;
    try {
      delete process.env.DATABASE_MODE;
      (process.env as any).NODE_ENV = 'production';
      assert.strictEqual(getDatabaseMode(), 'authoritative');

      (process.env as any).NODE_ENV = 'test';
      assert.strictEqual(getDatabaseMode(), 'test');

      (process.env as any).NODE_ENV = 'development';
      assert.strictEqual(getDatabaseMode(), 'local');

      process.env.DATABASE_MODE = 'authoritative';
      assert.strictEqual(getDatabaseMode(), 'authoritative');
      assert.strictEqual(isAuthoritativeMode(), true);
    } finally {
      (process.env as any).NODE_ENV = origEnv;
      if (origDbMode !== undefined) process.env.DATABASE_MODE = origDbMode;
      else delete process.env.DATABASE_MODE;
    }
  });

  await check('AgentRunStore conforms to dual-mode persistence contract', async () => {
    const store = AgentRunStore.getInstance();
    assert(store !== null, 'AgentRunStore instance exists');
    assert(typeof store.saveRun === 'function', 'saveRun is callable');
    assert(typeof store.listRuns === 'function', 'listRuns is callable');
  });

  console.log('\n--- 2. Founder Authorization ---');
  await check('GET /api/agents/runs fails closed (401) without session in production', async () => {
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';
      const req = new NextRequest('http://localhost:3000/api/agents/runs');
      const res = await getAgentsRunsRoute(req);
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert(json.error.includes('Founder session required'));
    } finally {
      (process.env as any).NODE_ENV = origEnv;
    }
  });

  await check('GET /api/agents returns authoritative 4-specialist roster', async () => {
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.SAMJUNIORS_DEV_SECRET;
    try {
      (process.env as any).NODE_ENV = 'development';
      process.env.SAMJUNIORS_DEV_SECRET = 'verify-secret';
      const req = new NextRequest('http://localhost:3000/api/agents', {
        headers: {
          'x-samjuniors-dev-as': 'founder',
          'x-samjuniors-dev-secret': 'verify-secret',
        },
      });
      const res = await getAgentsRoute(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.count, 4);
      assert.deepStrictEqual(json.agents.map((a: any) => a.id).sort(), ['coo', 'finance', 'pm', 'researcher']);
    } finally {
      (process.env as any).NODE_ENV = origEnv;
      if (origSecret !== undefined) process.env.SAMJUNIORS_DEV_SECRET = origSecret;
      else delete process.env.SAMJUNIORS_DEV_SECRET;
    }
  });

  console.log('\n--- 3. Orchestration & Specialist Council Definitions ---');
  await check('SERVER_AGENTS defines full 4-specialist executive workforce', () => {
    const agentRoles = Object.keys(SERVER_AGENTS);
    assert.strictEqual(agentRoles.length, 4);
    assert(agentRoles.includes('coo'), 'COO is present');
    assert(agentRoles.includes('researcher'), 'Researcher is present');
    assert(agentRoles.includes('pm'), 'PM is present');
    assert(agentRoles.includes('finance'), 'Finance is present');
  });

  await check('looksLikeDirective distinguishes directives from conversational queries', () => {
    assert.strictEqual(looksLikeDirective('Research competitor pricing for enterprise models'), true);
    assert.strictEqual(looksLikeDirective('Build a PRD for the billing portal'), true);
    assert.strictEqual(looksLikeDirective('What is our gross margin right now?'), false);
    assert.strictEqual(looksLikeDirective('Hello Sophia, how are you?'), false);
  });

  console.log('\n--- 4. Agent Runs & Workstream Mapping ---');
  await check('workstreamsFromRuns projects durable runs into read-only workstreams', () => {
    const mockRuns: any[] = [
      {
        id: 'run-1',
        agentId: 'coo',
        directive: 'Launch product audit',
        protocolStep: 'understand',
        status: 'completed',
        timestamp: new Date(Date.now() - 10000).toISOString(),
      },
      {
        id: 'run-2',
        agentId: 'researcher',
        directive: 'Launch product audit',
        protocolStep: 'research',
        status: 'completed',
        timestamp: new Date(Date.now() - 8000).toISOString(),
      },
      {
        id: 'run-3',
        agentId: 'pm',
        directive: 'Launch product audit',
        protocolStep: 'build_execute',
        status: 'running',
        timestamp: new Date(Date.now() - 2000).toISOString(),
      },
    ];

    const workstreams = workstreamsFromRuns(mockRuns);
    assert.strictEqual(workstreams.length, 1);
    const w = workstreams[0];
    assert(w.id.startsWith('srv-'), 'id is hashed server id');
    assert.strictEqual(w.origin, 'server');
    assert.strictEqual(w.stage, 'build');
    assert.strictEqual(w.owner, 'maya');
    assert.strictEqual(w.state, 'active');

    const agentStates = agentStatesFromRuns(mockRuns, workstreams);
    assert.strictEqual(agentStates.maya?.state, 'working');
    assert.strictEqual(agentStates.sophia?.state, 'working');
    assert.strictEqual(agentStates.julian?.state, undefined);
  });

  console.log('\n--- 5. Approvals & Side-Effect Authorization Gate ---');
  await check('SideEffectAuthorizationGate enforces founder authorization policy', async () => {
    const gate = SideEffectAuthorizationGate.getInstance();
    const evaluation = await gate.evaluateAuthorization({
      actionName: 'deploy_production',
      classification: 'high_impact_action',
      workflowContext: {
        workflowInstanceId: 'inst-1',
        stepId: 'step-deploy',
      },
      employeeRole: 'pm',
      target: { targetSystem: 'cluster' },
    });
    assert.strictEqual(evaluation.effect, 'approval_required');
    assert.strictEqual(evaluation.reasonCode, 'APPROVAL_REQUIRED_HIGH_IMPACT');
  });

  console.log('\n--- 6. Graph & Server-State Synchronization ---');
  await check('deriveGraph maps server-origin workstreams to contextual DAG nodes', () => {
    const mockOSState: any = {
      work: [
        {
          id: 'server-dir-alpha',
          title: 'Launch product audit',
          origin: 'server',
          owner: 'pm',
          stage: 'build',
          state: 'active',
          progress: 50,
        },
      ],
      decisions: [
        {
          id: 'dec-1',
          title: 'Approve deployment',
          status: 'open',
          effect: 'governance',
          scope: 'step',
        },
      ],
      attention: [
        {
          id: 'att-1',
          title: 'Founder decision required',
          handled: false,
          decisionId: 'dec-1',
        },
      ],
      agents: [
        { id: 'sophia', state: 'idle' },
        { id: 'thorne', state: 'idle' },
        { id: 'maya', state: 'active' },
        { id: 'julian', state: 'idle' },
      ],
      company: { focus: 'Market expansion' },
      dismissed: [],
    };

    const graph = deriveGraph(mockOSState);
    assert(graph.nodes.length > 0, 'Graph has nodes');
    assert(graph.edges.length > 0, 'Graph has edges');

    const nodeIds = graph.nodes.map((n) => n.id);
    assert(nodeIds.includes('founder'), 'Founder node present');
    assert(nodeIds.includes('core'), 'Sophia / core node present');
    assert(nodeIds.includes('outcome'), 'Governed Vault / outcome node present');
    assert(nodeIds.includes('verification'), 'Constitutional Verifier node present');
    assert(nodeIds.includes('approval'), 'Dynamic Founder Approval Gate node present when decisions are open');

    // Verify Maya Lin is present in active specialists
    assert(nodeIds.includes('pm'), 'Active specialist Maya Lin present');

    // Verify protocol step is revealed dynamically
    assert(nodeIds.includes('step-server-dir-alpha'), 'Contextual protocol step revealed for server workstream');
  });

  console.log('\n======================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
