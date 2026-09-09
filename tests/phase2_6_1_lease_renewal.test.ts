import assert from 'assert';
import {
  PostgresLeaseManager,
  LeaseManager,
  generateWorkerIdentity,
} from '../lib/server/coordination/lease-manager';
import { PostgresIdempotencyStore } from '../lib/server/idempotency/store';
import { PostgresWorkflowStore } from '../lib/server/workflow/store';
import { PostgresScheduledWorkStore } from '../lib/server/workflow/scheduler-store';
import { PostgresApprovalStore } from '../lib/server/authorization/approval-store';
import { WorkflowScheduler } from '../lib/server/workflow/scheduler';
import { WorkflowRuntime } from '../lib/server/workflow/runtime';
import { SideEffectAuthorizationGate } from '../lib/server/authorization/gate';
import { DatabaseAuthorityError } from '../lib/server/db/authority';
import { prisma, isDatabaseAvailable } from '../lib/server/db/prisma';
import {
  WorkflowDefinition,
  WorkflowStepDefinition,
  WorkflowInstanceState,
} from '../types/workflow';

/**
 * ============================================================================
 * SAMJUNIORS OS — PHASE 2.6.1 LEASE RENEWAL VERIFICATION (REAL POSTGRESQL)
 * ============================================================================
 *
 * Verifies the bounded lease-renewal guard wired into WorkflowScheduler
 * (Phase 2.6 follow-up: "renewItemLease exists but is not wired into
 * long-running execution") plus the full renewal ownership semantics.
 *
 * Scenarios (all against the real PostgreSQL instance unless noted):
 *   R1.  Holder can renew
 *   R2.  Stale holder cannot renew (and cannot disturb the new owner)
 *   R3.  Wrong holder cannot renew
 *   R4.  Expired lease cannot be renewed
 *   R5.  Renewal extends ownership correctly (blocks competitors while renewed)
 *   R6.  Release after renewal works
 *   R7.  Crash after renewal remains recoverable
 *   R8.  DB outage during renewal fails closed (renewal throws; work completes;
 *        occurrence durably marked coordinationLost)
 *   R9.  Concurrent renewal/reclaim has deterministic ownership
 *   R10. Lease renewal does not bypass authorization
 *   R11. Lease renewal does not bypass idempotency
 *   R12. Long-running execution does not silently lose coordination
 *        (positive: renewal keeps competitors blocked; negative control:
 *        renewal disabled → lease lost is LOUDLY marked, never silent)
 *
 * Blocked-mode contract: if DATABASE_URL is absent or does not point at a live
 * PostgreSQL instance, this suite exits with code 2 and prints
 * "VERIFICATION BLOCKED — NO REAL POSTGRESQL INSTANCE".
 * ============================================================================
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function recordPass(name: string) {
  passed++;
  console.log(`  ✓ PASS: ${name}`);
}

function recordFail(name: string, err: any) {
  failed++;
  failures.push(name);
  console.error(`  ✗ FAIL: ${name}`);
  console.error(`    ${err?.stack || err?.message || String(err)}`);
}

async function withTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    recordPass(name);
  } catch (err: any) {
    recordFail(name, err);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function truncateAll() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE distributed_leases, idempotency_records, approval_records, ` +
      `side_effect_audits, workflow_instances, workflow_definitions, scheduled_work_items ` +
      `RESTART IDENTITY CASCADE`
  );
}

function createDefinition(id: string): WorkflowDefinition {
  const step: WorkflowStepDefinition = {
    id: 'step-1',
    name: 'Phase 2.6.1 Renewal Probe Step',
    description: 'Deterministic lease-renewal probe step (no real external side effects)',
    assignedRole: 'cmo',
    skill: 'content_generation',
    requiresApproval: false,
    sideEffectClassification: 'read_only',
    dependencies: [],
    inputReferences: [],
    retryPolicy: { maxRetries: 0, backoffMs: 100 },
  };
  return {
    id,
    name: 'Phase 2.6.1 Renewal Probe Workflow',
    description: 'Lease renewal verification workflow',
    version: '1.0.0',
    objective: 'Phase 2.6.1 lease renewal verification',
    allowedRoles: ['cmo'],
    allowedSkills: ['content_generation'],
    steps: [step],
    dependencies: [],
    requiredApprovals: 0,
    expectedOutputs: [],
  };
}

function createInstance(id: string, def: WorkflowDefinition): WorkflowInstanceState {
  const stepStates: Record<string, any> = {};
  for (const step of def.steps) {
    stepStates[step.id] = {
      stepId: step.id,
      status: 'ready',
      assignedRole: step.assignedRole,
      skill: step.skill,
      outputs: {},
      evidenceReferences: [],
      retryCount: 0,
      approvalState: 'not_required',
    };
  }
  return {
    id,
    instanceId: id,
    workflowId: def.id,
    version: def.version,
    stateVersion: 0,
    objective: def.objective,
    status: 'running',
    stepStates,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    outputs: {},
    evidenceReferences: [],
  } as any;
}

/**
 * Stub runtime for long-execution scenarios: claims the step atomically,
 * sleeps for the configured duration (simulating LLM/tool/provider work),
 * then completes the step via the CAS transition. Mirrors the real
 * WorkflowRuntime execution contract without network calls.
 * transitionStep/evaluateReadiness are intentionally inert: the step is
 * pre-provisioned as 'ready' and the focus of these scenarios is lease
 * coordination, not readiness mechanics.
 */
function createSlowStubRuntime(
  wfStore: PostgresWorkflowStore,
  durationMs: number
): WorkflowRuntime {
  return {
    executeReadyStep: async (instanceId: string, stepId: string) => {
      const claim = await wfStore.claimStepAtomic(instanceId, stepId, `stub-exec-${Date.now()}`);
      await sleep(durationMs);
      await wfStore.transitionStepAtomic(
        instanceId,
        stepId,
        'completed',
        claim.instance.stateVersion,
        { outputs: { stubbed: true, durationMs } }
      );
    },
    transitionStep: async (instanceId: string) => {
      // Inert: keep the pre-provisioned 'ready' status for coordination scenarios.
      return wfStore.getInstance(instanceId);
    },
    evaluateReadiness: async (instanceId: string) => {
      // Inert: step is already 'ready'; no dependency evaluation needed.
      return undefined;
    },
    getGate: () => SideEffectAuthorizationGate.getInstance(),
  } as unknown as WorkflowRuntime;
}

/**
 * LeaseManager proxy that DELEGATES everything to the real PostgreSQL manager
 * except `renew`, which throws a DatabaseAuthorityError — simulating a database
 * outage observed at exactly the renewal boundary (the authoritative path throws
 * fail-closed; the guard must never propagate it out of evaluateDueWork).
 */
function createOutageOnRenewLeaseManager(real: LeaseManager): LeaseManager & { releaseCalls: () => number } {
  let releaseCalls = 0;
  return {
    acquire: (k: string, h: string, t: number, m?: Record<string, any>) => real.acquire(k, h, t, m),
    // Interface-compliant ASYNC throw (mirrors a real PostgresLeaseManager whose
    // requireAuthoritativeDatabase rejects during an outage — async functions
    // return rejected promises rather than throwing synchronously).
    renew: async () => {
      throw new DatabaseAuthorityError(
        'Simulated outage at renewal boundary: authoritative database is required but PostgreSQL is unavailable.'
      );
    },
    release: (k: string, h: string) => {
      releaseCalls++;
      return real.release(k, h);
    },
    get: (k: string) => real.get(k),
    clear: () => real.clear(),
    releaseCalls: () => releaseCalls,
  };
}

async function main() {
  console.log('================================================================');
  console.log('🔁  PHASE 2.6.1 — LEASE RENEWAL VERIFICATION (REAL POSTGRESQL)');
  console.log('================================================================\n');

  const url = process.env.DATABASE_URL || '';
  if (!url || !url.startsWith('postgresql://') || url.includes('dummy') || url.includes('placeholder')) {
    console.error('VERIFICATION BLOCKED — NO REAL POSTGRESQL INSTANCE');
    console.error('  DATABASE_URL does not point to a PostgreSQL instance.');
    process.exit(2);
  }
  const online = await isDatabaseAvailable();
  if (!online) {
    console.error('VERIFICATION BLOCKED — NO REAL POSTGRESQL INSTANCE');
    console.error('  PostgreSQL at DATABASE_URL is unreachable.');
    process.exit(2);
  }

  const leaseMgr = PostgresLeaseManager.getInstance();
  const wfStore = PostgresWorkflowStore.getInstance();
  const schedStore = PostgresScheduledWorkStore.getInstance();
  const apprStore = PostgresApprovalStore.getInstance();
  const idemStore = PostgresIdempotencyStore.getInstance();

  // R1. Holder can renew
  await withTest('R1. Holder can renew', async () => {
    const key = `p261-R1-${Date.now()}`;
    const holder = generateWorkerIdentity();
    const acq = await leaseMgr.acquire(key, holder, 5000);
    assert.ok(acq.acquired, 'acquire must succeed');
    const before = new Date(acq.lease!.expiresAt).getTime();
    await sleep(30);
    const renewed = await leaseMgr.renew(key, holder, 5000);
    assert.strictEqual(renewed, true, 'current holder must be able to renew');
    const after = (await leaseMgr.get(key))!;
    assert.ok(
      new Date(after.expiresAt).getTime() > before,
      'renewal must extend expiresAt beyond the original'
    );
    assert.strictEqual(after.holderId, holder, 'renewal must not change ownership');
    await leaseMgr.release(key, holder);
  });

  // R2. Stale holder cannot renew (and cannot disturb the new owner)
  await withTest('R2. Stale holder cannot renew; new owner undisturbed', async () => {
    const key = `p261-R2-${Date.now()}`;
    const workerA = generateWorkerIdentity();
    const workerB = generateWorkerIdentity();
    const acq = await leaseMgr.acquire(key, workerA, 400);
    assert.ok(acq.acquired);
    await sleep(520); // A's lease expires
    const reclaim = await leaseMgr.acquire(key, workerB, 5000);
    assert.ok(reclaim.acquired, 'B must reclaim the expired lease');
    const before = (await leaseMgr.get(key))!.expiresAt;
    const staleRenew = await leaseMgr.renew(key, workerA, 5000);
    assert.strictEqual(staleRenew, false, 'stale holder A must NOT be able to renew');
    const after = (await leaseMgr.get(key))!;
    assert.strictEqual(after.holderId, workerB, 'B must still be the owner');
    assert.strictEqual(
      after.expiresAt,
      before,
      "A's rejected renewal must not disturb B's expiry in any way"
    );
    await leaseMgr.release(key, workerB);
  });

  // R3. Wrong holder cannot renew
  await withTest('R3. Wrong holder cannot renew', async () => {
    const key = `p261-R3-${Date.now()}`;
    const owner = generateWorkerIdentity();
    const intruder = generateWorkerIdentity();
    const acq = await leaseMgr.acquire(key, owner, 5000);
    assert.ok(acq.acquired);
    const intruderRenew = await leaseMgr.renew(key, intruder, 5000);
    assert.strictEqual(intruderRenew, false, 'a non-holder must NOT be able to renew');
    const state = (await leaseMgr.get(key))!;
    assert.strictEqual(state.holderId, owner, 'ownership unchanged');
    const ownerRenew = await leaseMgr.renew(key, owner, 5000);
    assert.strictEqual(ownerRenew, true, 'true holder can still renew after an intruder attempt');
    await leaseMgr.release(key, owner);
  });

  // R4. Expired lease cannot be renewed
  await withTest('R4. Expired lease cannot be renewed (even by its last holder)', async () => {
    const key = `p261-R4-${Date.now()}`;
    const holder = generateWorkerIdentity();
    const acq = await leaseMgr.acquire(key, holder, 400);
    assert.ok(acq.acquired);
    await sleep(520);
    const renewed = await leaseMgr.renew(key, holder, 5000);
    assert.strictEqual(renewed, false, 'expired lease must not be renewable');
    const state = await leaseMgr.get(key);
    // Row may persist as expired or be absent — either way it is not renewable.
    if (state) {
      assert.notStrictEqual(state.holderId, 'renewed', 'sanity');
      assert.ok(
        new Date(state.expiresAt).getTime() <= Date.now() + 50,
        'expiry must remain in the past'
      );
    }
  });

  // R5. Renewal extends ownership correctly
  await withTest('R5. Renewal extends ownership correctly (competitors blocked while renewed)', async () => {
    const key = `p261-R5-${Date.now()}`;
    const workerA = generateWorkerIdentity();
    const workerB = generateWorkerIdentity();
    const acq = await leaseMgr.acquire(key, workerA, 1200);
    assert.ok(acq.acquired);
    // A renews at ~half TTL, twice — the lease never lapses.
    for (let i = 0; i < 2; i++) {
      await sleep(500);
      const renewed = await leaseMgr.renew(key, workerA, 1200);
      assert.strictEqual(renewed, true, `renewal ${i + 1} must succeed`);
      const competitor = await leaseMgr.acquire(key, workerB, 1200);
      assert.strictEqual(
        competitor.acquired,
        false,
        `competitor must be blocked while A keeps renewing (round ${i + 1})`
      );
    }
    await leaseMgr.release(key, workerA);
    const takeover = await leaseMgr.acquire(key, workerB, 1200);
    assert.ok(takeover.acquired, 'after release, B can acquire');
    await leaseMgr.release(key, workerB);
  });

  // R6. Release after renewal works
  await withTest('R6. Release after renewal works', async () => {
    const key = `p261-R6-${Date.now()}`;
    const holder = generateWorkerIdentity();
    const acq = await leaseMgr.acquire(key, holder, 5000);
    assert.ok(acq.acquired);
    assert.strictEqual(await leaseMgr.renew(key, holder, 5000), true);
    const released = await leaseMgr.release(key, holder);
    assert.strictEqual(released, true, 'holder must be able to release a renewed lease');
    assert.strictEqual(await leaseMgr.get(key), null, 'lease row must be gone after release');
    const next = await leaseMgr.acquire(key, generateWorkerIdentity(), 5000);
    assert.ok(next.acquired, 'resource is immediately re-acquirable after renewed-lease release');
    await leaseMgr.release(key, next.lease!.holderId);
  });

  // R7. Crash after renewal remains recoverable
  await withTest('R7. Crash after renewal remains recoverable (stale claim cleared via ready transition)', async () => {
    await truncateAll();
    const def = createDefinition(`p261-def-R7-${Date.now()}`);
    await wfStore.saveDefinition(def);
    const inst = createInstance(`p261-inst-R7-${Date.now()}`, def);
    await wfStore.saveInstance(inst);

    const workerA = `worker-R7-A`;
    const leaseKey = `sched-item:simulated`;
    const acq = await leaseMgr.acquire(leaseKey, workerA, 30000);
    assert.ok(acq.acquired);

    // A claims the step, renews the lease, then CRASHES (no release, no transition).
    const claimA = await wfStore.claimStepAtomic(inst.instanceId, 'step-1', workerA);
    assert.ok(claimA, 'A must claim the step');
    assert.strictEqual(await leaseMgr.renew(leaseKey, workerA, 30000), true, 'A renews before crash');
    // (crash — nothing to do, just stop)

    // Worker B cannot re-claim an in_progress step claimed by the crashed A.
    await assert.rejects(
      () => wfStore.claimStepAtomic(inst.instanceId, 'step-1', 'worker-R7-B'),
      (err: any) => err instanceof Error,
      'B must not be able to re-claim the in-progress step while claimed by crashed A'
    );

    // Recovery (Phase 2.6 mechanism): running → waiting (release execution slot)
    // → ready (re-claimable) clears the stale claim identity.
    const afterCrash = (await wfStore.getInstance(inst.instanceId))!;
    await wfStore.transitionStepAtomic(
      inst.instanceId,
      'step-1',
      'waiting',
      afterCrash.stateVersion
    );
    const afterWaiting = (await wfStore.getInstance(inst.instanceId))!;
    const recovered = await wfStore.transitionStepAtomic(
      inst.instanceId,
      'step-1',
      'ready',
      afterWaiting.stateVersion
    );
    const recoveredStep = recovered.stepStates['step-1'];
    assert.strictEqual(recoveredStep.claimedBy, undefined, "ready transition must clear stale claimedBy");

    // B can now claim and execute.
    const claimB = await wfStore.claimStepAtomic(inst.instanceId, 'step-1', 'worker-R7-B');
    assert.strictEqual(claimB.step.claimedBy, 'worker-R7-B', 'B must claim after recovery');

    // The crashed worker's (renewed, then abandoned) lease expires and can be reclaimed.
    await leaseMgr.release(leaseKey, workerA);
    await leaseMgr.acquire(leaseKey, 'worker-R7-B', 30000);
    const state = (await leaseMgr.get(leaseKey))!;
    assert.strictEqual(state.holderId, 'worker-R7-B', 'lease must be reclaimable after crash');
    await leaseMgr.release(leaseKey, 'worker-R7-B');
  });

  // R8. DB outage during renewal fails closed
  await withTest('R8. DB outage during renewal fails closed (work completes; loss is loudly marked)', async () => {
    await truncateAll();
    const outageMgr = createOutageOnRenewLeaseManager(leaseMgr);
    const def = createDefinition(`p261-def-R8-${Date.now()}`);
    await wfStore.saveDefinition(def);
    const inst = createInstance(`p261-inst-R8-${Date.now()}`, def);
    await wfStore.saveInstance(inst);

    const scheduler = new WorkflowScheduler(
      schedStore as any,
      wfStore as any,
      createSlowStubRuntime(wfStore, 1100) as any,
      outageMgr as LeaseManager,
      `worker-R8`,
      1500,
      { renewalIntervalMs: 350 }
    );

    const now = new Date().toISOString();
    const item = await scheduler.scheduleWork({
      workflowInstanceId: inst.instanceId,
      stepId: 'step-1',
      scheduleType: 'one_time',
      executeAt: now,
    });

    // evaluateDueWork must COMPLETE (never throw) even though every renewal throws.
    const result = await scheduler.evaluateDueWork(now);
    const entry = result.results.find((r) => r.scheduleId === item.id);
    assert.ok(entry, 'result entry must exist');
    assert.strictEqual(entry!.status, 'completed', 'execution must still complete');

    // The durable occurrence record must be marked coordinationLost.
    const finalItem = await schedStore.get(item.id);
    assert.ok(finalItem, 'item must exist');
    const occ = (finalItem!.executionHistory || []).find(
      (h: any) => h.occurrenceId === entry!.occurrenceId
    );
    assert.ok(occ, 'occurrence record must exist');
    assert.strictEqual(occ.coordinationLost, true, 'occurrence must be durably marked coordinationLost');
    assert.ok(
      String(occ.error || '').includes('renewal failed'),
      `occurrence error must record the renewal failure (got: ${occ.error})`
    );

    // Fail-closed posture: the release attempt must still have been made.
    assert.ok(outageMgr.releaseCalls() >= 1, 'lease release must still be attempted after outage');

    // Result entry must surface the coordination loss to operators.
    assert.ok(
      String(entry!.error || '').includes('Lease coordination lost'),
      'result entry must surface the coordination loss'
    );
  });

  // R9. Concurrent renewal/reclaim has deterministic ownership
  await withTest('R9. Concurrent renewal/reclaim has deterministic ownership', async () => {
    const ITER = 60;
    for (let i = 0; i < ITER; i++) {
      const key = `p261-R9-${Date.now()}-${i}`;
      const workerA = `worker-R9-A-${i}`;
      const workerB = `worker-R9-B-${i}`;
      const acq = await leaseMgr.acquire(key, workerA, 420);
      assert.ok(acq.acquired, `iter ${i}: A acquires`);
      await sleep(395); // borderline: lease about to expire
      const [renewA, acqB] = await Promise.all([
        leaseMgr.renew(key, workerA, 5000),
        leaseMgr.acquire(key, workerB, 5000),
      ]);
      // Exactly one coordination winner: either A renewed the live lease,
      // or B reclaimed the expired one. Never both, never neither.
      const aWon = renewA === true;
      const bWon = acqB.acquired === true;
      assert.strictEqual(
        aWon === bWon ? 1 : 0,
        0,
        `iter ${i}: exactly one winner (A renewed=${aWon}, B acquired=${bWon})`
      );
      const state = (await leaseMgr.get(key))!;
      if (aWon) {
        assert.strictEqual(state.holderId, workerA, `iter ${i}: A renewed → A owns`);
      } else {
        assert.strictEqual(state.holderId, workerB, `iter ${i}: B reclaimed → B owns`);
      }
      await leaseMgr.release(key, state.holderId);
    }

    // Concurrent renewals by the SAME holder: ownership unchanged, never stolen.
    const key = `p261-R9-same-${Date.now()}`;
    const holder = generateWorkerIdentity();
    const acq = await leaseMgr.acquire(key, holder, 3000);
    assert.ok(acq.acquired);
    const renews = await Promise.all([
      leaseMgr.renew(key, holder, 3000),
      leaseMgr.renew(key, holder, 3000),
      leaseMgr.renew(key, holder, 3000),
    ]);
    assert.ok(renews.every((r) => r === true), 'same-holder concurrent renewals all succeed');
    const state = (await leaseMgr.get(key))!;
    assert.strictEqual(state.holderId, holder, 'ownership unchanged after concurrent self-renewals');
    await leaseMgr.release(key, holder);
  });

  // R10. Lease renewal does not bypass authorization
  await withTest('R10. Lease renewal does not bypass authorization', async () => {
    await truncateAll();
    const gate = SideEffectAuthorizationGate.getInstance();
    const worker = generateWorkerIdentity();
    const leaseKey = `p261-R10-${Date.now()}`;

    // Hold a HEALTHY, freshly renewed lease for the resource...
    const acq = await leaseMgr.acquire(leaseKey, worker, 30000);
    assert.ok(acq.acquired);
    assert.strictEqual(await leaseMgr.renew(leaseKey, worker, 30000), true, 'lease is active and renewed');

    // ...then ask the gate to authorize an external communication with NO approval.
    const decision = await gate.evaluateAuthorization({
      employeeRole: 'cmo',
      skillId: 'content_generation',
      actionName: 'p261.R10.send_client_email',
      classification: 'external_communication',
      workflowContext: {
        workflowId: 'wf-R10',
        workflowInstanceId: 'inst-R10',
        stepId: 'step-R10',
        objective: 'R10 probe',
      },
      target: { targetSystem: 'resend' },
      requestedBy: 'cmo',
    });
    assert.strictEqual(
      decision.effect,
      'approval_required',
      'a renewed lease must NOT make the gate allow an unapproved external communication'
    );

    // And financial actions stay approval-required under a renewed lease as well.
    const finDecision = await gate.evaluateAuthorization({
      employeeRole: 'coo',
      skillId: 'financial_model',
      actionName: 'p261.R10.wire_transfer',
      classification: 'financial_action',
      workflowContext: {
        workflowId: 'wf-R10',
        workflowInstanceId: 'inst-R10',
        stepId: 'step-R10',
        objective: 'R10 probe',
      },
      target: { targetSystem: 'stripe' },
      requestedBy: 'coo',
    });
    assert.strictEqual(
      finDecision.effect,
      'approval_required',
      'a renewed lease must NOT make the gate allow an unapproved financial action'
    );

    // executeWithGate is blocked identically — the lease cannot smuggle execution.
    let executed = 0;
    const gateResult = await gate.executeWithGate({
      request: {
        employeeRole: 'cmo',
        skillId: 'content_generation',
        actionName: 'p261.R10.send_client_email',
        classification: 'external_communication',
        workflowContext: {
          workflowId: 'wf-R10',
          workflowInstanceId: 'inst-R10',
          stepId: 'step-R10',
          objective: 'R10 probe',
        },
        target: { targetSystem: 'resend' },
        requestedBy: 'cmo',
      },
      executionRef: `exec-R10-${Date.now()}`,
      executeFn: async () => {
        executed++;
        return { ok: true };
      },
    });
    assert.strictEqual(executed, 0, 'executeFn must NOT run without Founder approval, lease or no lease');
    assert.strictEqual(gateResult.allowed, false, 'gate result must be blocked');
    await leaseMgr.release(leaseKey, worker);
  });

  // R11. Lease renewal does not bypass idempotency
  await withTest('R11. Lease renewal does not bypass idempotency', async () => {
    await truncateAll();
    // Authoritative mode routes the gate's idempotency AND approval stores to
    // real PostgreSQL (the InMemory adapters delegate in authoritative mode).
    const prevMode = process.env.DATABASE_MODE;
    process.env.DATABASE_MODE = 'authoritative';
    try {
      // Provision a REAL workflow instance so the approval record satisfies the
      // approval_records.workflowInstanceId foreign key (schema is authoritative).
      const def = createDefinition(`p261-def-R11-${Date.now()}`);
      await wfStore.saveDefinition(def);
      const inst = createInstance(`p261-inst-R11-${Date.now()}`, def);
      await wfStore.saveInstance(inst);

      const gate = SideEffectAuthorizationGate.getInstance();
      const worker = generateWorkerIdentity();
      const leaseKey = `p261-R11-${Date.now()}`;
      const idemKey = `p261-R11-idem-${Date.now()}`;

      // Provision an approved approval scoped to that instance + step, using the
      // gate's own canonical approval API (requestApproval + decideApproval with
      // a verified Founder identity). The target + payload are bound at request
      // time and MUST match what executeWithGate later presents — the gate's
      // cryptographic payload binding rejects any drift (by design).
      const approvalRecord = await gate.requestApproval({
        actionName: 'p261.R11.send_client_email',
        classification: 'external_communication',
        workflowInstanceId: inst.instanceId,
        stepId: 'step-1',
        employeeRole: 'cmo',
        target: { targetSystem: 'resend' },
        payload: { n: 1 },
        scope: { scopeType: 'single_action', workflowInstanceId: inst.instanceId, stepId: 'step-1' },
      });
      const decided = await gate.decideApproval({
        approvalId: approvalRecord.id,
        decision: 'approved',
        decidedBy: 'founder',
      });
      assert.strictEqual(decided.decision, 'approved', 'approval must be decided approved');
      const apprId = approvalRecord.id;

      const request = (overrides?: { approvalId?: string }) => ({
        employeeRole: 'cmo',
        skillId: 'content_generation',
        actionName: 'p261.R11.send_client_email',
        classification: 'external_communication' as const,
        workflowContext: {
          workflowId: def.id,
          workflowInstanceId: inst.instanceId,
          stepId: 'step-1',
          objective: 'R11 probe',
        },
        target: { targetSystem: 'resend' },
        // request.payload is what the gate's cryptographic approval binding
        // verifies — it must equal the payload bound at requestApproval time.
        payload: { n: 1 },
        requestedBy: 'cmo',
        approvalId: overrides?.approvalId,
      });

      // Acquire + RENEW a lease first — coordination is fully healthy.
      const acq = await leaseMgr.acquire(leaseKey, worker, 30000);
      assert.ok(acq.acquired);
      assert.strictEqual(await leaseMgr.renew(leaseKey, worker, 30000), true);

      // First gated execution (approved): runs exactly once.
      let executed = 0;
      const first = await gate.executeWithGate({
        request: request({ approvalId: apprId }),
        executionRef: `exec-R11-a-${Date.now()}`,
        idempotency: {
          key: idemKey,
          targetSystem: 'resend',
          logicalOpId: `op-R11-${Date.now()}`,
          payload: { n: 1 },
        },
        executeFn: async () => {
          executed++;
          return { ok: true, run: executed };
        },
      });
      assert.strictEqual(first.allowed, true, 'approved first execution must be allowed');
      assert.strictEqual(executed, 1, 'executeFn ran exactly once');

      // Renew the lease AGAIN (coordination still healthy) and replay the same key.
      assert.strictEqual(await leaseMgr.renew(leaseKey, worker, 30000), true, 'renew again');
      const second = await gate.executeWithGate({
        request: request({ approvalId: apprId }),
        executionRef: `exec-R11-b-${Date.now()}`,
        idempotency: {
          key: idemKey,
          targetSystem: 'resend',
          logicalOpId: `op-R11-${Date.now()}`,
          payload: { n: 1 },
        },
        executeFn: async () => {
          executed++;
          return { ok: true, run: executed };
        },
      });
      assert.strictEqual(executed, 1, 'renewal must NOT bypass idempotency — no second execution');
      assert.strictEqual(second.allowed, true, 'replay is allowed as a completed replay');
      assert.ok(
        (second as any).replay === true || (second as any).result?.ok === true,
        'replay path must return the recorded outcome, not re-execute'
      );

      // A DIFFERENT payload under the same key must be rejected as tampering.
      const tampered = await gate.executeWithGate({
        request: request({ approvalId: apprId }),
        executionRef: `exec-R11-c-${Date.now()}`,
        idempotency: {
          key: idemKey,
          targetSystem: 'resend',
          logicalOpId: `op-R11-${Date.now()}`,
          payload: { n: 999 },
        },
        executeFn: async () => {
          executed++;
          return { ok: true };
        },
      }).catch((e: unknown) => e);
      assert.ok(
        tampered instanceof Error && /payload/i.test((tampered as Error).message),
        'payload mismatch must be rejected (idempotency binding intact under a renewed lease)'
      );
      assert.strictEqual(executed, 1, 'no execution from the tampered replay');

      await leaseMgr.release(leaseKey, worker);
    } finally {
      process.env.DATABASE_MODE = prevMode;
    }
  });

  // R12. Long-running execution does not silently lose coordination
  await withTest('R12. Long-running execution does not silently lose coordination', async () => {
    await truncateAll();
    const mkScenario = async (tag: string) => {
      const def = createDefinition(`p261-def-R12-${tag}-${Date.now()}`);
      await wfStore.saveDefinition(def);
      const inst = createInstance(`p261-inst-R12-${tag}-${Date.now()}`, def);
      await wfStore.saveInstance(inst);
      return { def, inst };
    };

    // --- POSITIVE: renewal keeps coordination for work far longer than the TTL ---
    {
      const { inst } = await mkScenario('pos');
      const schedulerA = new WorkflowScheduler(
        schedStore as any,
        wfStore as any,
        createSlowStubRuntime(wfStore, 3200) as any, // work 3.2s — more than 2x the TTL
        leaseMgr,
        `worker-R12-A-pos`,
        1500, // TTL 1.5s
        { renewalIntervalMs: 500 }
      );
      const schedulerB = new WorkflowScheduler(
        schedStore as any,
        wfStore as any,
        createSlowStubRuntime(wfStore, 50) as any,
        leaseMgr,
        `worker-R12-B-pos`,
        1500,
        { renewalIntervalMs: 500 }
      );

      const now = new Date().toISOString();
      const item = await schedulerA.scheduleWork({
        workflowInstanceId: inst.instanceId,
        stepId: 'step-1',
        scheduleType: 'one_time',
        executeAt: now,
      });

      // B probes DURING A's long execution (at ~55% of the work duration).
      const late = (async () => {
        await sleep(1700);
        return schedulerB.evaluateDueWork(new Date().toISOString());
      })();
      const evalA = await schedulerA.evaluateDueWork(now);
      const evalB = await late;

      const entryB = evalB.results.find((r) => r.scheduleId === item.id);
      assert.ok(entryB, 'B must have evaluated the due item');
      assert.strictEqual(
        entryB!.status,
        'skipped',
        'B must be LOCKED OUT while A holds the renewed lease (no silent coordination loss)'
      );

      const entryA = evalA.results.find((r) => r.scheduleId === item.id);
      assert.ok(entryA);
      assert.strictEqual(entryA!.status, 'completed', 'A completes the long execution');
      assert.strictEqual(
        entryA!.error,
        undefined,
        `no coordination loss must be reported in the renewal path (got: ${entryA!.error})`
      );

      const finalItem = await schedStore.get(item.id);
      const occ = (finalItem!.executionHistory || [])[0];
      assert.strictEqual(occ.status, 'completed', 'durable occurrence completed');
      assert.strictEqual(
        occ.coordinationLost,
        undefined,
        'renewal path: occurrence must NOT be marked coordinationLost'
      );
      // Exactly one execution record — never a duplicate.
      assert.strictEqual(
        (finalItem!.executionHistory || []).filter((h: any) => h.status === 'triggered' || h.status === 'completed').length,
        1,
        'exactly one execution record'
      );
    }

    // --- NEGATIVE CONTROL: renewal disabled → loss is LOUD, never silent ---
    {
      const { inst } = await mkScenario('neg');
      const schedulerA = new WorkflowScheduler(
        schedStore as any,
        wfStore as any,
        createSlowStubRuntime(wfStore, 3200) as any,
        leaseMgr,
        `worker-R12-A-neg`,
        1500,
        { renewalIntervalMs: 500, maxRenewalDurationMs: 1 } // renewal disabled
      );
      const schedulerB = new WorkflowScheduler(
        schedStore as any,
        wfStore as any,
        createSlowStubRuntime(wfStore, 50) as any,
        leaseMgr,
        `worker-R12-B-neg`,
        1500,
        { renewalIntervalMs: 500 }
      );

      const now = new Date().toISOString();
      const item = await schedulerA.scheduleWork({
        workflowInstanceId: inst.instanceId,
        stepId: 'step-1',
        scheduleType: 'one_time',
        executeAt: now,
      });

      // B probes during A's execution — A's lease EXPIRES (no renewal).
      const late = (async () => {
        await sleep(1700);
        return schedulerB.evaluateDueWork(new Date().toISOString());
      })();
      const evalA = await schedulerA.evaluateDueWork(now);
      const evalB = await late;

      const entryA = evalA.results.find((r) => r.scheduleId === item.id);
      assert.ok(entryA);
      assert.strictEqual(entryA!.status, 'completed', 'A still completes the work');
      assert.ok(
        String(entryA!.error || '').includes('Lease coordination lost'),
        `coordination loss must be LOUDLY reported (got: ${entryA!.error})`
      );

      const finalItem = await schedStore.get(item.id);
      const occ = (finalItem!.executionHistory || [])[0];
      assert.strictEqual(
        occ.coordinationLost,
        true,
        'negative control: occurrence must be durably marked coordinationLost'
      );

      // B may have acquired the expired lease mid-execution, but occurrence-level
      // idempotency ('triggered' record) must have prevented duplicate execution.
      const entryB = evalB.results.find((r) => r.scheduleId === item.id);
      if (entryB) {
        assert.strictEqual(
          entryB!.status,
          'skipped',
          'B must SKIP re-execution (occurrence-level idempotency), not duplicate'
        );
      }
      const triggeredCount = (finalItem!.executionHistory || []).filter(
        (h: any) => h.status === 'triggered' || h.status === 'completed' || h.status === 'failed'
      ).length;
      assert.strictEqual(triggeredCount, 1, 'exactly one execution attempt even after lease loss');
    }
  });

  await truncateAll();

  console.log('\n================================================================');
  console.log(`Phase 2.6.1 Lease Renewal Suite (REAL POSTGRESQL): ${passed}/${passed + failed} Passed`);
  if (failures.length > 0) {
    console.log(`Failed: ${failures.join(', ')}`);
  }
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled suite error:', err);
  process.exit(1);
});
