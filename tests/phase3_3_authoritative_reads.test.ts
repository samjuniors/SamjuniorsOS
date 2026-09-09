import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { GET as cockpitOverviewHandler } from '../app/api/cockpit/overview/route';
import { getCockpitOverview, CockpitReadError } from '../lib/server/cockpit/overview';
import { MultiAgentOrchestrator } from '../lib/server/orchestration/orchestrator';
import { InMemoryWorkflowStore, getWorkflowStore } from '../lib/server/workflow/store';
import { InMemoryScheduledWorkStore } from '../lib/server/workflow/scheduler-store';
import { AgentRunStore, AgentRunRecord } from '../lib/server/agents/run-store';
import { InMemoryApprovalStore, InMemoryAuditStore } from '../lib/server/authorization/approval-store';
import { SideEffectAuthorizationGate } from '../lib/server/authorization/gate';
import { EpistemicClaimStore } from '../lib/server/epistemic/claim-store';
import { getIdempotencyStore } from '../lib/server/idempotency/store';
import { reconcileFounderDecision } from '../lib/server/workflow/decision-reconciler';
import { createExecutiveWorkflowDefinition } from '../lib/server/workflow/dynamic-dag';
import { DurableFileStore } from '../lib/server/persistence/durable-file-store';
import {
  deriveOverviewErrorFromHttpStatus,
  deriveOverviewErrorFromNetworkFailure,
  deriveVitalsTiles,
  describePersistenceMode,
  formatRelativeTime,
  isStreamEmpty,
  isFleetInactive,
  isWorkflowListEmpty,
} from '../lib/cockpit/overview-state';

/**
 * ============================================================================
 * SAMJUNIORS OS — PHASE 3.3 AUTHORITATIVE COMMAND CENTER READS TEST SUITE
 * ============================================================================
 *
 * Vertical slice under test:
 *
 *   AUTHORITATIVE PERSISTED STATE → READ/QUERY LAYER (lib/server/cockpit)
 *   → GET /api/cockpit/overview → EXECUTIVE COCKPIT → UI REFLECTS REAL STATE
 *
 * Levels exercised (only the REAL implementations — no mocks of gates,
 * stores, or the runtime):
 *
 * A. HTTP boundary — the actual GET route handler with real NextRequests:
 *    founder auth, unauthenticated/unauthorized rejection, honest empty
 *    state, and the no-fabricated-data contract.
 *
 * B. Aggregation correctness — real persisted records seeded through the
 *    REAL persistence paths (runtime orchestration, gate decisions,
 *    reconciliation, agent run store, scheduled work store, epistemic
 *    claim store) and read back through the exact aggregation the cockpit
 *    uses.
 *
 * C. Stream correspondence — every stream event maps to a real persisted
 *    record id; ordering and bounds hold.
 *
 * D. Read-only guarantee — the overview read mutates NO authoritative state.
 *
 * E. Refresh semantics — changed durable state is reflected on the next read.
 *
 * F. Failure surfacing — an unavailable authoritative source fails CLOSED
 *    (503, source named) and is never translated into zeros; display error
 *    derivations are honest.
 *
 * G. Fabricated-data removal — the cockpit component no longer references
 *    any demo/static data source for the touched surfaces.
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

const FLEET_ROLES = ['coo', 'researcher', 'pm', 'finance'] as const;

function resetState() {
  process.env = { ...originalEnv };
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_MODE;
  delete process.env.DATABASE_MODEUpperCase;
  delete process.env.SAMJUNIORS_AUTHORITY_MODE;
  delete process.env.GEMINI_API_KEY;
  delete process.env.SAMJUNIORS_DEV_SECRET;
  (process.env as any).NODE_ENV = 'test';
  InMemoryWorkflowStore.getInstance().clear();
  InMemoryApprovalStore.getInstance().clear();
  InMemoryAuditStore.getInstance().clear();
  InMemoryScheduledWorkStore.getInstance().clear();
  getIdempotencyStore().clear();
  const runStore = AgentRunStore.getInstance();
  runStore.runs.clear();
  DurableFileStore.getInstance().clearCollection('agent_runs');
  const claimStore = EpistemicClaimStore.getInstance();
  claimStore.claims.clear();
  claimStore.facts.clear();
  claimStore.verifications.clear();
  claimStore.signals.clear();
  claimStore.sources.clear();
  DurableFileStore.getInstance().clearCollection('epistemic_claims');
  DurableFileStore.getInstance().clearCollection('epistemic_verifications');
}

const TEST_DEV_SECRET = 'p33_dev_secret_for_test';

function founderGet(extraHeaders?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/cockpit/overview', {
    method: 'GET',
    headers: {
      'x-samjuniors-dev-as': 'founder',
      'x-samjuniors-dev-secret': TEST_DEV_SECRET,
      ...(extraHeaders || {}),
    },
  });
}

/**
 * Drives the EXACT runtime path POST /api/orchestrate uses to create durable
 * workflow instances (registerWorkflow → createInstance → executeWorkflow).
 */
async function createInstanceViaRuntime(directive: string) {
  const orchestrator = new MultiAgentOrchestrator();
  const workflowDef = createExecutiveWorkflowDefinition(directive, {
    executeTools: true,
    autonomyLevel: 'autonomous',
  });
  await orchestrator.getRuntime().registerWorkflow(workflowDef);
  const initialInstance = await orchestrator.getRuntime().createInstance(
    workflowDef.id,
    workflowDef.version
  );
  const executedInstance = await orchestrator.getRuntime().executeWorkflow(
    initialInstance.instanceId,
    { executeTools: true }
  );
  return executedInstance;
}

function makeAgentRun(overrides: Partial<AgentRunRecord> & { runId: string; agentId: AgentRunRecord['agentId'] }): AgentRunRecord {
  return {
    runId: overrides.runId,
    agentId: overrides.agentId,
    agentName: overrides.agentName ?? 'Sophia Vance',
    protocolStep: overrides.protocolStep ?? 'analyze',
    taskTitle: overrides.taskTitle ?? 'Analyze test directive',
    directive: overrides.directive ?? 'Analyze the market for the test',
    status: overrides.status ?? 'completed',
    durationMs: overrides.durationMs ?? 1234,
    outputContent: overrides.outputContent ?? 'Real persisted run output',
    provenance: {
      agentId: (overrides.agentId === 'advisor' ? 'coo' : overrides.agentId) as any,
      agentName: overrides.agentName ?? 'Sophia Vance',
      taskId: `task-${overrides.runId}`,
      protocolStep: 'analyze',
      timestamp: overrides.timestamp ?? new Date().toISOString(),
      isVerified: true,
      evidenceBasis: 'calculation',
    },
    timestamp: overrides.timestamp ?? new Date().toISOString(),
  };
}

function makeScheduledItem(id: string, executeAtIso: string, workflowInstanceId: string) {
  return {
    id,
    workflowInstanceId,
    stepId: 'step-scheduled-probe',
    scheduleType: 'delay' as const,
    executeAt: executeAtIso,
    status: 'scheduled' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    executionHistory: [],
    idempotencyKey: `sched-${id}`,
  };
}

async function snapshotAuthoritativeState() {
  const gate = SideEffectAuthorizationGate.getInstance();
  return {
    instances: await getWorkflowStore().listInstances(),
    approvals: await gate.listApprovals(),
    audits: await gate.listAudits(),
    runs: await AgentRunStore.getInstance().listRuns(),
    scheduled: await InMemoryScheduledWorkStore.getInstance().list(),
    claims: await EpistemicClaimStore.getInstance().listClaims(),
  };
}

async function main(): Promise<void> {
  console.log('\n=== PHASE 3.3 — AUTHORITATIVE COMMAND CENTER READS ===\n');

  // ------------------------------------------------------------------
  console.log('--- Group A: HTTP boundary — authentication & honest empty state ---');
  // ------------------------------------------------------------------

  // A1. Unauthenticated request is rejected with 401.
  try {
    resetState();
    const req = new NextRequest('http://localhost:3000/api/cockpit/overview', {
      method: 'GET',
    });
    const res = await cockpitOverviewHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error.includes('Unauthorized'));
    recordPass('Unauthenticated overview read is rejected with HTTP 401');
  } catch (err) {
    recordFail('Unauthenticated overview read is rejected with HTTP 401', err);
  }

  // A2. Unauthorized (non-founder) identity is rejected with 401.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const req = new NextRequest('http://localhost:3000/api/cockpit/overview', {
      method: 'GET',
      headers: {
        'x-samjuniors-dev-as': 'attacker',
        'x-samjuniors-dev-secret': TEST_DEV_SECRET,
      },
    });
    const res = await cockpitOverviewHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    recordPass('Unauthorized (non-founder) identity is rejected with HTTP 401');
  } catch (err) {
    recordFail('Unauthorized (non-founder) identity is rejected with HTTP 401', err);
  }

  // A2b. Founder identity with wrong secret is rejected with 401.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const res = await cockpitOverviewHandler(
      founderGet({ 'x-samjuniors-dev-secret': 'wrong_secret' })
    );
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    recordPass('Founder identity with an invalid dev secret is rejected with HTTP 401');
  } catch (err) {
    recordFail('Founder identity with an invalid dev secret is rejected with HTTP 401', err);
  }

  // A3. Authenticated founder with EMPTY stores gets an HONEST empty state —
  // real zeros (a successful read of empty persistence), not fabricated data.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const res = await cockpitOverviewHandler(founderGet());
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();

    assert.ok(body.asOf, 'Response must disclose the read timestamp');
    assert.ok(body.persistenceMode, 'Response must disclose the persistence mode');

    // Honest zeros from a successful read.
    assert.deepStrictEqual(body.vitals.workflows, {
      active: 0,
      awaitingApproval: 0,
      blocked: 0,
      failed: 0,
      completed: 0,
      cancelled: 0,
      total: 0,
    });
    assert.strictEqual(body.vitals.approvals.pending, 0);
    assert.strictEqual(body.vitals.scheduledWork.scheduled, 0);
    assert.strictEqual(body.vitals.scheduledWork.nextDueAt, undefined);
    assert.strictEqual(body.vitals.epistemic.claimsPendingVerification, 0);
    assert.strictEqual(body.vitals.agentRuns.completedLast24h, 0);
    assert.strictEqual(body.vitals.agentRuns.failedLast24h, 0);

    assert.deepStrictEqual(body.recentWorkflows, []);
    assert.deepStrictEqual(body.stream, []);

    // Fleet: roster configuration with NO runs (honest, not "active").
    assert.strictEqual(body.fleet.length, FLEET_ROLES.length);
    for (const entry of body.fleet) {
      assert.ok(FLEET_ROLES.includes(entry.agentId as any), `Fleet role ${entry.agentId} must come from the roster config`);
      assert.strictEqual(entry.lastRun, null, 'No runs persisted → lastRun must be null, never a fabricated status');
    }

    recordPass('Authenticated founder gets an honest empty state (real zeros, fleet with no runs, empty stream)');
  } catch (err) {
    recordFail('Authenticated founder gets an honest empty state (real zeros, fleet with no runs, empty stream)', err);
  }

  // A4. No fabricated/demo values anywhere in the response payload.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    // Seed one real record so the response is non-trivial.
    await createInstanceViaRuntime('Analyze competitor pricing for the cockpit read test');

    const res = await cockpitOverviewHandler(founderGet());
    const body = await res.json();
    const serialized = JSON.stringify(body);

    // The response carries ONLY the documented read contract — no legacy
    // fabricated surfaces (initiatives, financial model, workforce chips).
    assert.ok(!('initiatives' in body), 'No fabricated initiatives field');
    assert.ok(!('financialModel' in body), 'No fabricated financial model field');
    assert.ok(!('workforce' in body), 'No fabricated workforce field');

    // None of the known demo constants from lib/os-data.ts may appear.
    for (const banned of [
      'Sprint Objective Decomposed',
      'Architecture Audit Complete',
      'Gross Margin Verification',
      'runwayMonths',
      'grossMargin',
      'burnRate',
      '84.2%',
      'Autonomous Company Operating System',
    ]) {
      assert.ok(
        !serialized.includes(banned),
        `Fabricated demo value "${banned}" must never appear in the overview read`
      );
    }

    recordPass('Overview response contains no fabricated/demo values (no initiatives, financials, demo stream text)');
  } catch (err) {
    recordFail('Overview response contains no fabricated/demo values (no initiatives, financials, demo stream text)', err);
  }

  // ------------------------------------------------------------------
  console.log('--- Group B: Aggregation over REAL persisted records ---');
  // ------------------------------------------------------------------

  // B1. Workflow counts/statuses derived correctly from real durable instances.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    // Real instance #1: read-only directive → completes.
    const completedInstance = await createInstanceViaRuntime(
      'Analyze competitor pricing and produce a recommendation memo'
    );
    // Real instance #2: side-effect directive → awaiting founder approval.
    const awaitingInstance = await createInstanceViaRuntime(
      'Send email digest of the pricing memo to the leadership list'
    );
    // Real instance #3: side-effect directive + founder REJECTION → blocked.
    const blockedInstance = await createInstanceViaRuntime(
      'Send email digest to external partners'
    );
    const blockedStep = blockedInstance.stepStates['step-side-effect'];
    const rejected = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: blockedStep.approvalId!,
      decision: 'rejected',
      decidedBy: 'founder-local-session',
    });
    const recon = await reconcileFounderDecision(rejected);
    assert.strictEqual(recon.stepStatus, 'blocked', 'Precondition: rejected side-effect must block');

    const res = await cockpitOverviewHandler(founderGet());
    assert.strictEqual(res.status, 200);
    const body = await res.json();

    const wf = body.vitals.workflows;
    assert.strictEqual(wf.total, 3, `Expected 3 instances, got ${wf.total}`);
    assert.strictEqual(wf.completed, 1, `Expected 1 completed, got ${wf.completed}`);
    assert.strictEqual(wf.awaitingApproval, 1, `Expected 1 awaiting approval, got ${wf.awaitingApproval}`);
    assert.strictEqual(wf.blocked, 1, `Expected 1 blocked, got ${wf.blocked}`);
    assert.strictEqual(wf.active, 0, 'No pending/running/waiting instances were created');
    assert.strictEqual(wf.failed, 0);

    // Pending approvals count matches the one real pending record.
    assert.strictEqual(body.vitals.approvals.pending, 1, 'One real approval must be pending');

    // recentWorkflows lists the REAL instances with their durable statuses.
    const listedIds = body.recentWorkflows.map((w: any) => w.instanceId);
    assert.ok(listedIds.includes(completedInstance.instanceId));
    assert.ok(listedIds.includes(awaitingInstance.instanceId));
    assert.ok(listedIds.includes(blockedInstance.instanceId));
    const statusById: Record<string, string> = {};
    for (const w of body.recentWorkflows) statusById[w.instanceId] = w.status;
    assert.strictEqual(statusById[completedInstance.instanceId], 'completed');
    assert.strictEqual(statusById[awaitingInstance.instanceId], 'awaiting_approval');
    assert.strictEqual(statusById[blockedInstance.instanceId], 'blocked');

    recordPass('Workflow counts/statuses are derived correctly from real durable instances (completed / awaiting / blocked)');
  } catch (err) {
    recordFail('Workflow counts/statuses are derived correctly from real durable instances (completed / awaiting / blocked)', err);
  }

  // B2. Approval decisions + audited executions appear as stream events and
  // the approved path executes through the EXISTING gate (Phase 3.1 loop).
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const instance = await createInstanceViaRuntime(
      'Send email digest of the pricing memo to the leadership list'
    );
    const step = instance.stepStates['step-side-effect'];
    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: step.approvalId!,
      decision: 'approved',
      decidedBy: 'founder-local-session',
    });
    const recon = await reconcileFounderDecision(decided);
    assert.strictEqual(recon.stepStatus, 'completed', 'Precondition: approved step must complete');

    const body = await (await cockpitOverviewHandler(founderGet())).json();

    // The decided approval surfaces as a persisted approval stream event.
    const approvalEvent = body.stream.find((e: any) => e.id === `approval:${decided.id}`);
    assert.ok(approvalEvent, `Stream must include the real approval decision event (approval:${decided.id})`);
    assert.strictEqual(approvalEvent.source, 'approval');
    assert.ok(approvalEvent.title.includes('approved'), `Title must state the real decision, got: ${approvalEvent.title}`);
    assert.ok(
      approvalEvent.summary.includes('external_communication'),
      `Summary must carry the real action classification, got: ${approvalEvent.summary}`
    );

    // The audited execution surfaces as a real audit stream event.
    const audits = await SideEffectAuthorizationGate.getInstance().listAudits({
      workflowInstanceId: instance.instanceId,
    });
    const executedAudits = audits.filter((a) => a.executed);
    assert.ok(executedAudits.length >= 1, 'Precondition: approved execution must be audited');
    const auditEvent = body.stream.find((e: any) => e.id === `audit:${executedAudits[0].id}`);
    assert.ok(auditEvent, `Stream must include the real audit record event (audit:${executedAudits[0].id})`);
    assert.strictEqual(auditEvent.source, 'audit');
    assert.ok(auditEvent.summary.includes('executed'), 'Audit event must state the real execution outcome');

    recordPass('Approved decision + audited execution surface as real persisted stream events');
  } catch (err) {
    recordFail('Approved decision + audited execution surface as real persisted stream events', err);
  }

  // B3. Agent run metrics + fleet entries derive from REAL persisted runs,
  // with the 24h window enforced deterministically.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const now = Date.now();
    const iso = (offsetHours: number) =>
      new Date(now - offsetHours * 3600_000).toISOString();

    const runStore = AgentRunStore.getInstance();
    await runStore.saveRun(
      makeAgentRun({
        runId: 'run-p33-b3-1',
        agentId: 'coo',
        agentName: 'Sophia Vance',
        status: 'completed',
        taskTitle: 'Decompose pricing directive',
        timestamp: iso(1),
      })
    );
    await runStore.saveRun(
      makeAgentRun({
        runId: 'run-p33-b3-2',
        agentId: 'researcher',
        agentName: 'Maya Lin',
        status: 'failed',
        taskTitle: 'Market research sweep',
        timestamp: iso(2),
      })
    );
    // Outside the 24h window — must NOT count.
    await runStore.saveRun(
      makeAgentRun({
        runId: 'run-p33-b3-3',
        agentId: 'coo',
        agentName: 'Sophia Vance',
        status: 'completed',
        taskTitle: 'Old completed task',
        timestamp: iso(30),
      })
    );

    const body = await (await cockpitOverviewHandler(founderGet())).json();

    assert.strictEqual(body.vitals.agentRuns.completedLast24h, 1, `Completed(24h) must be 1, got ${body.vitals.agentRuns.completedLast24h}`);
    assert.strictEqual(body.vitals.agentRuns.failedLast24h, 1, `Failed(24h) must be 1, got ${body.vitals.agentRuns.failedLast24h}`);
    assert.strictEqual(body.vitals.agentRuns.windowHours, 24);

    // Fleet: coo's last run is the NEWEST (1h ago), not the 30h-old one.
    const cooEntry = body.fleet.find((f: any) => f.agentId === 'coo');
    assert.ok(cooEntry, 'Fleet must include the roster coo entry');
    assert.strictEqual(cooEntry.lastRun.runId, 'run-p33-b3-1');
    assert.strictEqual(cooEntry.lastRun.status, 'completed');

    const researcherEntry = body.fleet.find((f: any) => f.agentId === 'researcher');
    assert.strictEqual(researcherEntry.lastRun.runId, 'run-p33-b3-2');
    assert.strictEqual(researcherEntry.lastRun.status, 'failed');

    // Agents with no runs keep an honest null lastRun.
    const pmEntry = body.fleet.find((f: any) => f.agentId === 'pm');
    assert.strictEqual(pmEntry.lastRun, null);

    // The recent runs appear as stream events mapped to the real run ids.
    const runEvent = body.stream.find((e: any) => e.id === 'agent_run:run-p33-b3-1');
    assert.ok(runEvent, 'Stream must include the real agent run event');
    assert.strictEqual(runEvent.source, 'agent_run');

    recordPass('Agent run vitals + fleet last-run derive from real persisted runs (24h window enforced)');
  } catch (err) {
    recordFail('Agent run vitals + fleet last-run derive from real persisted runs (24h window enforced)', err);
  }

  // B4. Scheduled work vitals derive from the real scheduled-work store.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const store = InMemoryScheduledWorkStore.getInstance();
    const inOneHour = new Date(Date.now() + 3600_000).toISOString();
    const inTwoHours = new Date(Date.now() + 7200_000).toISOString();
    await store.save(makeScheduledItem('sched-p33-1', inOneHour, 'wf-sched-1'));
    await store.save(makeScheduledItem('sched-p33-2', inTwoHours, 'wf-sched-2'));

    const body = await (await cockpitOverviewHandler(founderGet())).json();

    assert.strictEqual(body.vitals.scheduledWork.scheduled, 2, `Expected 2 scheduled, got ${body.vitals.scheduledWork.scheduled}`);
    assert.strictEqual(
      body.vitals.scheduledWork.nextDueAt,
      inOneHour,
      'nextDueAt must be the earliest real executeAt'
    );

    recordPass('Scheduled work vitals derive from the real scheduled-work store (earliest due)');
  } catch (err) {
    recordFail('Scheduled work vitals derive from the real scheduled-work store (earliest due)', err);
  }

  // B5. Epistemic claims pending verification derive from the real claim store.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const claimStore = EpistemicClaimStore.getInstance();
    const base = {
      statement: 'Statement',
      subject: 'test_subject',
      category: 'operational' as const,
      proposedBy: 'researcher' as const,
      confidence: 'unverified' as const,
      evidenceReferences: [],
      createdAt: new Date().toISOString(),
    };
    await claimStore.saveClaim({ ...base, id: 'claim-p33-pending', statement: 'Pending claim awaiting verification', verificationStatus: 'pending' });
    await claimStore.saveClaim({ ...base, id: 'claim-p33-promoted', statement: 'Already promoted claim', verificationStatus: 'promoted_to_fact' });

    const body = await (await cockpitOverviewHandler(founderGet())).json();

    assert.strictEqual(
      body.vitals.epistemic.claimsPendingVerification,
      1,
      `Only the real pending claim must count, got ${body.vitals.epistemic.claimsPendingVerification}`
    );

    recordPass('Epistemic claims-pending-verification vitals derive from the real claim store');
  } catch (err) {
    recordFail('Epistemic claims-pending-verification vitals derive from the real claim store', err);
  }

  // ------------------------------------------------------------------
  console.log('--- Group C: Stream events correspond to real persisted records ---');
  // ------------------------------------------------------------------

  // C1. EVERY stream event id maps to a real persisted record; ordering desc;
  // cap enforced.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    // Seed every source type through its real persistence path.
    const instance = await createInstanceViaRuntime('Send email digest for stream correspondence test');
    const step = instance.stepStates['step-side-effect'];
    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: step.approvalId!,
      decision: 'approved',
      decidedBy: 'founder-local-session',
    });
    await reconcileFounderDecision(decided);
    await AgentRunStore.getInstance().saveRun(
      makeAgentRun({ runId: 'run-p33-c1', agentId: 'pm', agentName: 'Elena Rostova', status: 'completed', taskTitle: 'Stream correspondence task' })
    );
    await InMemoryScheduledWorkStore.getInstance().save(
      makeScheduledItem('sched-p33-c1', new Date(Date.now() + 3600_000).toISOString(), instance.instanceId)
    );

    const body = await (await cockpitOverviewHandler(founderGet())).json();
    const events: Array<{ id: string; source: string; timestamp: string }> = body.stream;

    assert.ok(events.length >= 3, `Expected several real events, got ${events.length}`);

    const instanceIds = new Set((await getWorkflowStore().listInstances()).map((i) => i.instanceId));
    const approvalIds = new Set((await SideEffectAuthorizationGate.getInstance().listApprovals()).map((a) => a.id));
    const auditIds = new Set((await SideEffectAuthorizationGate.getInstance().listAudits()).map((a) => a.id));
    const runIds = new Set((await AgentRunStore.getInstance().listRuns()).map((r) => r.runId));

    for (const evt of events) {
      const [source, recordId] = evt.id.split(':');
      assert.ok(recordId, `Event ${evt.id} must carry a record id`);
      switch (source) {
        case 'workflow':
          assert.ok(instanceIds.has(recordId), `workflow event must map to a real instance: ${evt.id}`);
          break;
        case 'approval':
          assert.ok(approvalIds.has(recordId), `approval event must map to a real approval record: ${evt.id}`);
          break;
        case 'audit':
          assert.ok(auditIds.has(recordId), `audit event must map to a real audit record: ${evt.id}`);
          break;
        case 'agent_run':
          assert.ok(runIds.has(recordId), `agent_run event must map to a real run record: ${evt.id}`);
          break;
        default:
          assert.fail(`Unknown stream source: ${source}`);
      }
    }

    // Ordering: strictly non-increasing timestamps.
    for (let i = 1; i < events.length; i++) {
      assert.ok(
        Date.parse(events[i - 1].timestamp) >= Date.parse(events[i].timestamp) - 1000,
        `Stream must be ordered desc by record timestamp (${events[i - 1].timestamp} → ${events[i].timestamp})`
      );
    }

    // Cap: the contract bounds the stream length.
    assert.ok(events.length <= 30, `Stream must be capped at 30 events, got ${events.length}`);

    recordPass('Every stream event maps to a real persisted record; ordering desc; cap enforced');
  } catch (err) {
    recordFail('Every stream event maps to a real persisted record; ordering desc; cap enforced', err);
  }

  // ------------------------------------------------------------------
  console.log('--- Group D: Read-only guarantee ---');
  // ------------------------------------------------------------------

  // D1. The overview read mutates NO authoritative state (deep snapshot).
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    // Seed state across every source the overview reads.
    const instance = await createInstanceViaRuntime('Send email digest for read-only guarantee test');
    const step = instance.stepStates['step-side-effect'];
    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: step.approvalId!,
      decision: 'approved',
      decidedBy: 'founder-local-session',
    });
    await reconcileFounderDecision(decided);
    await AgentRunStore.getInstance().saveRun(
      makeAgentRun({ runId: 'run-p33-d1', agentId: 'finance', agentName: 'Julian Cruz', status: 'completed' })
    );
    await InMemoryScheduledWorkStore.getInstance().save(
      makeScheduledItem('sched-p33-d1', new Date(Date.now() + 3600_000).toISOString(), instance.instanceId)
    );

    const before = await snapshotAuthoritativeState();

    // Perform the read twice (route handler AND direct aggregation).
    const res = await cockpitOverviewHandler(founderGet());
    assert.strictEqual(res.status, 200);
    await getCockpitOverview();

    const after = await snapshotAuthoritativeState();

    assert.deepStrictEqual(after.instances, before.instances, 'Workflow instances must be unchanged');
    assert.deepStrictEqual(after.approvals, before.approvals, 'Approvals must be unchanged');
    assert.deepStrictEqual(after.audits, before.audits, 'Audit trail must be unchanged');
    assert.deepStrictEqual(after.runs, before.runs, 'Agent runs must be unchanged');
    assert.deepStrictEqual(after.scheduled, before.scheduled, 'Scheduled work must be unchanged');
    assert.deepStrictEqual(after.claims, before.claims, 'Epistemic claims must be unchanged');

    recordPass('Overview reads mutate no authoritative state (deep snapshot comparison)');
  } catch (err) {
    recordFail('Overview reads mutate no authoritative state (deep snapshot comparison)', err);
  }

  // ------------------------------------------------------------------
  console.log('--- Group E: Refresh reflects changed durable state ---');
  // ------------------------------------------------------------------

  // E1. A second read after new durable work reflects the new state —
  // the cockpit does not serve a stale/fabricated snapshot.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const first = await (await cockpitOverviewHandler(founderGet())).json();
    assert.strictEqual(first.vitals.workflows.total, 0);
    assert.strictEqual(first.vitals.approvals.pending, 0);
    assert.strictEqual(first.stream.length, 0);

    // Create real durable work (the exact runtime path the terminal drives).
    const instance = await createInstanceViaRuntime('Send email digest for refresh semantics test');

    const second = await (await cockpitOverviewHandler(founderGet())).json();
    assert.strictEqual(second.vitals.workflows.total, 1, 'Refreshed read must see the new instance');
    assert.strictEqual(second.vitals.approvals.pending, 1, 'Refreshed read must see the new pending approval');
    assert.ok(
      second.stream.some((e: any) => e.id === `workflow:${instance.instanceId}`),
      'Refreshed stream must include the new instance event'
    );

    recordPass('Refreshed read reflects changed durable state (new instance, approval, stream event)');
  } catch (err) {
    recordFail('Refreshed read reflects changed durable state (new instance, approval, stream event)', err);
  }

  // ------------------------------------------------------------------
  console.log('--- Group F: Failure surfacing (fail-closed) ---');
  // ------------------------------------------------------------------

  // F1. Unavailable authoritative persistence → fail CLOSED (503, source
  // named) — NEVER zeros. Driven with the REAL authority machinery (no mocks):
  // DATABASE_MODE=authoritative + no reachable PostgreSQL.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    process.env.DATABASE_MODE = 'authoritative';
    delete process.env.DATABASE_URL;

    // Direct aggregation: fails with the source named.
    let readError: unknown = null;
    try {
      await getCockpitOverview();
    } catch (err) {
      readError = err;
    }
    assert.ok(readError instanceof CockpitReadError, `Aggregation must fail closed, got ${readError}`);
    assert.ok(
      (readError as CockpitReadError).source.length > 0,
      'Failure must name the unavailable source'
    );

    // Route handler: 503 with the honest unavailable message — not zeros.
    const res = await cockpitOverviewHandler(founderGet());
    assert.strictEqual(res.status, 503, `Expected 503 fail-closed, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.code, 'reads_unavailable');
    assert.ok(/unavailable/i.test(body.error), 'Message must state unavailability');
    assert.ok(body.source, 'Route must name the failed source');
    assert.ok(!body.vitals, 'A failed read must NOT return a vitals payload (never zeros)');

    recordPass('Unavailable authoritative persistence fails closed (503, source named, no zeros)');
  } catch (err) {
    recordFail('Unavailable authoritative persistence fails closed (503, source named, no zeros)', err);
  }

  // F2. Display error derivations are honest (pure functions the cockpit uses).
  try {
    const unauth = deriveOverviewErrorFromHttpStatus(401, { error: 'Unauthorized: Session required' });
    assert.strictEqual(unauth.kind, 'unauthenticated');
    assert.ok(unauth.detail.toLowerCase().includes('session'), 'Server message must surface');

    const unavailable = deriveOverviewErrorFromHttpStatus(503, {
      error: 'Authoritative persistence is unavailable — Command Center reads are unavailable rather than fabricated.',
    });
    assert.strictEqual(unavailable.kind, 'unavailable');
    assert.ok(unavailable.detail.includes('unavailable'));
    assert.ok(!unavailable.detail.includes('0'), 'Failure text must never assert zeros');

    const serverError = deriveOverviewErrorFromHttpStatus(500, null);
    assert.strictEqual(serverError.kind, 'server_error');
    assert.ok(serverError.detail.includes('failed'));

    const network = deriveOverviewErrorFromNetworkFailure(new Error('fetch failed'));
    assert.strictEqual(network.kind, 'network_error');
    assert.ok(network.detail.includes('last successful read'), 'Network failure must disclose staleness, not zeros');

    recordPass('Display error derivations: 401/503/500/network map to honest kinds (no zeros)');
  } catch (err) {
    recordFail('Display error derivations: 401/503/500/network map to honest kinds (no zeros)', err);
  }

  // F3. Display derivations: tiles, empty checks, relative time, persistence mode.
  try {
    const now = new Date('2026-09-09T12:00:00Z');
    const overview = {
      asOf: now.toISOString(),
      persistenceMode: 'local',
      vitals: {
        approvals: { pending: 2 },
        scheduledWork: { scheduled: 1, nextDueAt: '2026-09-09T13:00:00Z' },
        epistemic: { claimsPendingVerification: 0 },
        agentRuns: { completedLast24h: 3, failedLast24h: 1, windowHours: 24 },
      },
      stream: [],
      fleet: [{ agentId: 'coo', agentName: 'Sophia Vance', role: 'COO', lastRun: null }],
      recentWorkflows: [],
    };

    const tiles = deriveVitalsTiles(overview, now);
    assert.strictEqual(tiles.length, 4, 'All four tiles derive from a complete response');
    const pendingTile = tiles.find((t) => t.key === 'pending-approvals')!;
    assert.strictEqual(pendingTile.value, '2');
    assert.strictEqual(pendingTile.tone, 'warning');
    const schedTile = tiles.find((t) => t.key === 'scheduled-work')!;
    assert.ok(schedTile.hint?.includes('in 1h'), `Future due time must render as "in Xh", got: ${schedTile.hint}`);
    const runsTile = tiles.find((t) => t.key === 'agent-runs')!;
    assert.strictEqual(runsTile.value, '3 ok / 1 failed');
    assert.strictEqual(runsTile.tone, 'critical');

    assert.strictEqual(isStreamEmpty(overview), true);
    assert.strictEqual(isWorkflowListEmpty(overview), true);
    assert.strictEqual(isFleetInactive(overview), true);

    assert.strictEqual(formatRelativeTime('2026-09-09T11:59:40Z', now), 'just now');
    assert.strictEqual(formatRelativeTime('2026-09-09T11:58:00Z', now), '2m ago');
    assert.strictEqual(formatRelativeTime('2026-09-09T11:00:00Z', now), '1h ago');
    assert.strictEqual(formatRelativeTime('2026-09-08T12:00:00Z', now), '1d ago');
    assert.strictEqual(formatRelativeTime(undefined, now), '—');
    assert.strictEqual(describePersistenceMode('authoritative'), 'PostgreSQL (authoritative)');
    assert.strictEqual(describePersistenceMode('local'), 'Durable file store (local)');
    assert.strictEqual(describePersistenceMode(undefined), 'Unknown persistence mode');

    recordPass('Display derivations: tiles/empty checks/relative time/persistence mode are correct');
  } catch (err) {
    recordFail('Display derivations: tiles/empty checks/relative time/persistence mode are correct', err);
  }

  // ------------------------------------------------------------------
  console.log('--- Group G: Fabricated-data removal from the cockpit component ---');
  // ------------------------------------------------------------------

  // G1. The ExecutiveCockpit no longer references any demo/static data source
  // for the touched surfaces (static source guard against regression).
  try {
    resetState();
    const componentPath = path.join(process.cwd(), 'components', 'cockpit', 'ExecutiveCockpit.tsx');
    const source = fs.readFileSync(componentPath, 'utf-8');

    for (const banned of [
      "INITIAL_INITIATIVES",
      "INITIAL_AGENTS",
      "SAMPLE_FINANCIAL_MODEL",
      "from '@/lib/os-data'",
      "stream-1",
      "Sprint Objective Decomposed",
      "runwayMonths",
      "Gross Margin:",
      "Monthly Burn:",
      "4 Active",
    ]) {
      assert.ok(
        !source.includes(banned),
        `ExecutiveCockpit must not reference fabricated data: "${banned}"`
      );
    }

    // The authoritative read is actually wired in.
    assert.ok(source.includes("/api/cockpit/overview"), 'Cockpit must fetch the authoritative overview');
    assert.ok(source.includes("deriveVitalsTiles"), 'Cockpit must derive vitals from the overview response');

    recordPass('ExecutiveCockpit no longer references fabricated data sources; authoritative read is wired in');
  } catch (err) {
    recordFail('ExecutiveCockpit no longer references fabricated data sources; authoritative read is wired in', err);
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log('\n=== RESULTS ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Suite crashed:', err);
    process.exit(1);
  })
  .then(() => {
    process.exit(failed > 0 ? 1 : 0);
  });
