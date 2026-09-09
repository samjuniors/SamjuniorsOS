import assert from 'assert';
import {
  PostgresLeaseManager,
  generateWorkerIdentity,
} from '../lib/server/coordination/lease-manager';
import { PostgresIdempotencyStore } from '../lib/server/idempotency/store';
import { PostgresWorkflowStore } from '../lib/server/workflow/store';
import { PostgresScheduledWorkStore } from '../lib/server/workflow/scheduler-store';
import { PostgresApprovalStore } from '../lib/server/authorization/approval-store';
import { WorkflowScheduler } from '../lib/server/workflow/scheduler';
import { WorkflowRuntime } from '../lib/server/workflow/runtime';
import {
  ConcurrencyConflictError,
  StepClaimError,
  ApprovalAlreadyConsumedError,
} from '../lib/server/workflow/state-machine';
import {
  IdempotencyPayloadMismatchError,
  OperationInProgressError,
} from '../lib/server/idempotency/state-machine';
import { prisma, isDatabaseAvailable } from '../lib/server/db/prisma';
import {
  WorkflowDefinition,
  WorkflowStepDefinition,
  WorkflowInstanceState,
} from '../types/workflow';

/**
 * ============================================================================
 * SAMJUNIORS OS — PHASE 2.6 REAL POSTGRESQL CONCURRENCY VERIFICATION
 * ============================================================================
 *
 * Re-certification of the Phase 2.6 durability fixes against a REAL PostgreSQL
 * instance (no mocks, no in-memory substitutes, no serialized promises
 * pretending to be concurrent). Every race in this suite issues genuinely
 * concurrent statements from independent promise chains (and, for the
 * multi-process group, independent OS processes with their own Prisma
 * connection pools).
 *
 * Verified invariants:
 *   A. Lease acquisition race — exactly one acquired=true (PK-anchored INSERT + guarded reclaim)
 *   B. Lease renewal ownership — only the current holder may renew
 *   C. Lease release ownership — only the current holder may release
 *   D. Expired lease reclamation — new worker atomically becomes owner; stale worker is locked out
 *   E. Workflow step claim race — exactly one claim, stateVersion incremented exactly once
 *   F. Workflow OCC transition race — loser gets ConcurrencyConflictError, no lost update
 *   G. Idempotency claim race — one record, one owner, exact payload binding
 *   H. Idempotency payload mismatch — IdempotencyPayloadMismatchError, no second execution
 *   I. Approval consumption race — exactly one consumption of a single-use approval
 *   J. Scheduler due-work race — one lease owner, one execution attempt, no duplicate
 *   K. Scheduler stale-snapshot protection — fresh re-read after lease prevents state erasure
 *   L. Crash-recovery orphan re-claim — transition to 'ready' clears stale claim identity
 *   M. Mixed system contention — all primitives racing simultaneously
 *   N. Multi-process contention — 3 independent worker processes, own connection pools
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
    name: 'Phase 2.6 Probe Step',
    description: 'Deterministic offline probe step (no external side effects)',
    assignedRole: 'cmo',
    skill: 'content_generation' as any,
    requiresApproval: false,
    sideEffectClassification: 'read_only',
    dependencies: [],
    inputReferences: [],
  };
  return {
    id,
    name: 'Phase 2.6 Probe Workflow',
    description: 'Concurrency verification workflow',
    version: '1.0.0',
    objective: 'Phase 2.6 real PostgreSQL concurrency verification',
    allowedRoles: ['cmo'],
    allowedSkills: ['content_generation' as any],
    steps: [step],
    dependencies: [],
    requiredApprovals: 0,
    expectedOutputs: [],
  } as any;
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

async function main() {
  console.log('================================================================');
  console.log('🐘  PHASE 2.6 — REAL POSTGRESQL CONCURRENCY VERIFICATION');
  console.log('================================================================\n');

  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
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
  console.log(`[INFO] Real PostgreSQL reachable at ${url.replace(/:[^:@/]*@/, ':***@')}\n`);

  const leaseMgr = PostgresLeaseManager.getInstance();
  const idemStore = PostgresIdempotencyStore.getInstance();
  const wfStore = PostgresWorkflowStore.getInstance();
  const apprStore = PostgresApprovalStore.getInstance();

  // ==========================================================================
  // A. LEASE ACQUISITION RACE — 60 iterations × 5 concurrent workers
  // ==========================================================================
  await withTest('A. Lease acquisition race (60 × 5 concurrent workers, exactly one winner)', async () => {
    await truncateAll();
    const ITER = 60;
    const WORKERS = 5;
    for (let i = 0; i < ITER; i++) {
      const key = `p26-lease-A-${i}`;
      const results = await Promise.all(
        Array.from({ length: WORKERS }, (_, w) =>
          leaseMgr.acquire(key, `worker-A${w}-i${i}`, 30000)
        )
      );
      const winners = results.filter((r) => r.acquired);
      assert.strictEqual(
        winners.length,
        1,
        `iteration ${i}: expected exactly 1 acquired=true, got ${winners.length} (reasons: ${results
          .map((r) => r.reason)
          .join(',')})`
      );
      const rows = await prisma.distributedLease.count({ where: { resourceKey: key } });
      assert.strictEqual(rows, 1, `iteration ${i}: expected exactly 1 durable row`);
      const row = await prisma.distributedLease.findUnique({ where: { resourceKey: key } });
      assert.strictEqual(row?.holderId, winners[0]!.lease!.holderId, 'DB holder must equal the winner');
    }
    await truncateAll();
  });

  // ==========================================================================
  // B. LEASE RENEWAL OWNERSHIP
  // ==========================================================================
  await withTest('B. Lease renewal ownership (owner renews, non-owner and expired cannot)', async () => {
    await truncateAll();
    const owner = 'worker-B-owner';
    const intruder = 'worker-B-intruder';
    for (let i = 0; i < 20; i++) {
      const key = `p26-lease-B-${i}`;
      const acquired = await leaseMgr.acquire(key, owner, 5000);
      assert.ok(acquired.acquired, 'owner must acquire');

      assert.strictEqual(await leaseMgr.renew(key, owner, 5000), true, 'owner must renew');
      assert.strictEqual(await leaseMgr.renew(key, intruder, 5000), false, 'non-owner must NOT renew');
      await leaseMgr.release(key, owner);
    }
    // Expired lease cannot be renewed by its (now stale) holder
    const expKey = 'p26-lease-B-expired';
    await leaseMgr.acquire(expKey, owner, 60);
    await sleep(120);
    assert.strictEqual(await leaseMgr.renew(expKey, owner, 5000), false, 'expired holder must NOT renew');
    await truncateAll();
  });

  // ==========================================================================
  // C. LEASE RELEASE OWNERSHIP
  // ==========================================================================
  await withTest('C. Lease release ownership (only current holder may release)', async () => {
    await truncateAll();
    const owner = 'worker-C-owner';
    const intruder = 'worker-C-intruder';
    for (let i = 0; i < 20; i++) {
      const key = `p26-lease-C-${i}`;
      await leaseMgr.acquire(key, owner, 30000);

      assert.strictEqual(await leaseMgr.release(key, intruder), false, 'non-owner must NOT release');
      const row = await prisma.distributedLease.findUnique({ where: { resourceKey: key } });
      assert.ok(row, 'lease must survive a foreign release attempt');

      assert.strictEqual(await leaseMgr.release(key, owner), true, 'owner must release');
      const gone = await prisma.distributedLease.findUnique({ where: { resourceKey: key } });
      assert.strictEqual(gone, null, 'lease row must be deleted after owner release');
    }
    await truncateAll();
  });

  // ==========================================================================
  // D. EXPIRED LEASE RECLAMATION + STALE WORKER LOCKOUT
  // ==========================================================================
  await withTest('D. Expired lease reclamation (B becomes owner atomically; A locked out)', async () => {
    await truncateAll();
    for (let i = 0; i < 20; i++) {
      const key = `p26-lease-D-${i}`;
      const workerA = `worker-D-A-${i}`;
      const workerB = `worker-D-B-${i}`;
      const first = await leaseMgr.acquire(key, workerA, 60);
      assert.ok(first.acquired, 'A must initially acquire');
      await sleep(120);

      const reclaimed = await leaseMgr.acquire(key, workerB, 30000);
      assert.ok(reclaimed.acquired, 'B must reclaim the expired lease');
      assert.strictEqual(reclaimed.lease?.holderId, workerB, 'B must be the new durable holder');

      // Stale worker A is fully locked out after losing the lease:
      assert.strictEqual(await leaseMgr.renew(key, workerA, 5000), false, 'stale A must NOT renew');
      assert.strictEqual(await leaseMgr.release(key, workerA), false, 'stale A must NOT release');
      const row = await prisma.distributedLease.findUnique({ where: { resourceKey: key } });
      assert.strictEqual(row?.holderId, workerB, 'durable holder must remain B');
      await leaseMgr.release(key, workerB);
    }
    await truncateAll();
  });

  // ==========================================================================
  // E. WORKFLOW STEP CLAIM RACE — 40 iterations × 5 concurrent workers
  // ==========================================================================
  await withTest('E. Workflow step claim race (exactly one claim, version +1 exactly once)', async () => {
    await truncateAll();
    const ITER = 40;
    const WORKERS = 5;
    for (let i = 0; i < ITER; i++) {
      const def = createDefinition(`p26-def-E-${i}`);
      await wfStore.saveDefinition(def);
      const inst = createInstance(`p26-inst-E-${i}`, def);
      await wfStore.saveInstance(inst);

      const outcomes = await Promise.allSettled(
        Array.from({ length: WORKERS }, (_, w) =>
          wfStore.claimStepAtomic(`p26-inst-E-${i}`, 'step-1', `worker-E${w}-i${i}`)
        )
      );
      const successes = outcomes.filter((o) => o.status === 'fulfilled');
      assert.strictEqual(successes.length, 1, `iteration ${i}: exactly one worker must claim the step`);

      for (const o of outcomes) {
        if (o.status === 'rejected') {
          const ok =
            o.reason instanceof StepClaimError || o.reason instanceof ConcurrencyConflictError;
          assert.ok(
            ok,
            `iteration ${i}: losers must receive StepClaimError/ConcurrencyConflictError, got: ${o.reason?.name}: ${o.reason?.message}`
          );
        }
      }

      const finalRow = await prisma.workflowInstance.findUnique({ where: { id: `p26-inst-E-${i}` } });
      assert.strictEqual(finalRow?.stateVersion, 1, `iteration ${i}: stateVersion must be exactly 1`);
      const step = (finalRow?.stepStates as any)?.['step-1'];
      assert.strictEqual(step?.status, 'running', 'step must be running');
      assert.strictEqual(step?.claimedBy, (successes[0] as any).value.step.claimedBy, 'claimedBy must be the winner');
    }
    await truncateAll();
  });

  // ==========================================================================
  // F. WORKFLOW OCC TRANSITION RACE — 40 iterations × 5 concurrent writers
  // ==========================================================================
  await withTest('F. OCC transition race (loser gets ConcurrencyConflictError, no lost update)', async () => {
    await truncateAll();
    const ITER = 40;
    const WORKERS = 5;
    for (let i = 0; i < ITER; i++) {
      const def = createDefinition(`p26-def-F-${i}`);
      await wfStore.saveDefinition(def);
      const inst = createInstance(`p26-inst-F-${i}`, def);
      await wfStore.saveInstance(inst);

      // All writers validated against the same expected version (the classic OCC race)
      const outcomes = await Promise.allSettled(
        Array.from({ length: WORKERS }, () =>
          wfStore.transitionStepAtomic(`p26-inst-F-${i}`, 'step-1', 'completed', 0)
        )
      );
      const successes = outcomes.filter((o) => o.status === 'fulfilled');
      assert.strictEqual(successes.length, 1, `iteration ${i}: exactly one writer must succeed`);

      for (const o of outcomes) {
        if (o.status === 'rejected') {
          assert.ok(
            o.reason instanceof ConcurrencyConflictError,
            `iteration ${i}: OCC loser must get ConcurrencyConflictError, got ${o.reason?.name}: ${o.reason?.message}`
          );
        }
      }

      const finalRow = await prisma.workflowInstance.findUnique({ where: { id: `p26-inst-F-${i}` } });
      assert.strictEqual(finalRow?.stateVersion, 1, `iteration ${i}: version must advance exactly once (no lost update)`);
      const step = (finalRow?.stepStates as any)?.['step-1'];
      assert.strictEqual(step?.status, 'completed', 'step must be completed (winner write persisted)');
      assert.strictEqual(step?.claimedBy, undefined, 'claim identity must be cleared on completion');
    }
    await truncateAll();
  });

  // ==========================================================================
  // G. IDEMPOTENCY CLAIM RACE — 60 iterations × 5 concurrent workers
  // ==========================================================================
  await withTest('G. Idempotency claim race (one record, one owner, one execution)', async () => {
    await truncateAll();
    const ITER = 60;
    const WORKERS = 5;
    for (let i = 0; i < ITER; i++) {
      const key = `p26-idem-G-${i}`;
      const outcomes = await Promise.allSettled(
        Array.from({ length: WORKERS }, (_, w) =>
          idemStore.claim({ key, actionName: 'p26.probe', payloadHash: `hash-G-${i}`, executionRef: `ref-${w}` })
        )
      );
      const claimed = outcomes.filter(
        (o) => o.status === 'fulfilled' && (o.value as any).state === 'claimed'
      );
      assert.strictEqual(claimed.length, 1, `iteration ${i}: exactly one worker must claim`);

      for (const o of outcomes) {
        if (o.status === 'rejected') {
          assert.ok(
            o.reason instanceof OperationInProgressError,
            `iteration ${i}: losers must get OperationInProgressError, got ${o.reason?.name}: ${o.reason?.message}`
          );
        }
      }

      const rows = await prisma.idempotencyRecord.count({ where: { key } });
      assert.strictEqual(rows, 1, `iteration ${i}: exactly one durable record`);
      const row = await prisma.idempotencyRecord.findUnique({ where: { key } });
      assert.strictEqual(row?.status, 'in_progress', 'record must be in_progress');
      assert.strictEqual(row?.payloadHash, `hash-G-${i}`, 'payload hash must bind to winner claim');
    }
    await truncateAll();
  });

  // ==========================================================================
  // H. IDEMPOTENCY PAYLOAD MISMATCH
  // ==========================================================================
  await withTest('H. Idempotency payload mismatch (altered payload rejected, no second execution)', async () => {
    await truncateAll();
    for (let i = 0; i < 10; i++) {
      const key = `p26-idem-H-${i}`;
      const first = await idemStore.claim({ key, actionName: 'p26.probe', payloadHash: `hash-H1-${i}` });
      assert.strictEqual((first as any).state, 'claimed');

      await assert.rejects(
        () => idemStore.claim({ key, actionName: 'p26.probe', payloadHash: `hash-H2-${i}` }),
        IdempotencyPayloadMismatchError,
        `iteration ${i}: altered payload must be rejected`
      );

      const row = await prisma.idempotencyRecord.findUnique({ where: { key } });
      assert.strictEqual(row?.payloadHash, `hash-H1-${i}`, 'original hash binding must be intact');
      assert.strictEqual(row?.status, 'in_progress', 'no second execution may start');
    }
    await truncateAll();
  });

  // ==========================================================================
  // I. APPROVAL CONSUMPTION RACE — 60 iterations × 5 concurrent consumers
  // ==========================================================================
  await withTest('I. Single-use approval consumption race (exactly one consumption)', async () => {
    await truncateAll();
    const ITER = 60;
    const WORKERS = 5;
    for (let i = 0; i < ITER; i++) {
      const approvalId = `p26-appr-I-${i}`;
      await apprStore.save({
        id: approvalId,
        decision: 'approved',
        actionName: 'p26.probe.action',
        classification: 'external_communication',
        workflowInstanceId: null as any,
        stepId: 'step-1',
        employeeRole: 'cmo',
        scope: { allowedUses: 1, usedCount: 0 },
        requestedAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
        decidedBy: 'founder',
        isConsumed: false,
      } as any);

      const outcomes = await Promise.allSettled(
        Array.from({ length: WORKERS }, () => apprStore.consume(approvalId))
      );
      const consumed = outcomes.filter((o) => o.status === 'fulfilled');
      assert.strictEqual(consumed.length, 1, `iteration ${i}: exactly one consumer must succeed`);

      for (const o of outcomes) {
        if (o.status === 'rejected') {
          assert.ok(
            o.reason instanceof ApprovalAlreadyConsumedError,
            `iteration ${i}: losers must get ApprovalAlreadyConsumedError, got ${o.reason?.name}: ${o.reason?.message}`
          );
        }
      }

      const row = await prisma.approvalRecord.findUnique({ where: { id: approvalId } });
      assert.notStrictEqual(row?.consumedAt, null, 'consumedAt must be set exactly once');
      const scope = (row?.scope as any) ?? {};
      assert.strictEqual(scope.usedCount, 1, 'usedCount must be exactly 1');
    }
    await truncateAll();
  });

  // ==========================================================================
  // J. SCHEDULER DUE-WORK RACE — real evaluateDueWork, two schedulers
  // ==========================================================================
  await withTest('J. Scheduler due-work race (one lease owner, one execution attempt, no duplicate)', async () => {
    await truncateAll();
    const schedStore = PostgresScheduledWorkStore.getInstance();
    const ITER = 10;
    for (let i = 0; i < ITER; i++) {
      const def = createDefinition(`p26-def-J-${i}`);
      await wfStore.saveDefinition(def);
      const inst = createInstance(`p26-inst-J-${i}`, def);
      await wfStore.saveInstance(inst);

      const schedulerA = new WorkflowScheduler(
        schedStore as any,
        wfStore as any,
        new WorkflowRuntime(wfStore as any),
        leaseMgr,
        `worker-J-A-${i}`
      );
      const schedulerB = new WorkflowScheduler(
        schedStore as any,
        wfStore as any,
        new WorkflowRuntime(wfStore as any),
        leaseMgr,
        `worker-J-B-${i}`
      );

      const now = new Date().toISOString();
      const item = await schedulerA.scheduleWork({
        workflowInstanceId: `p26-inst-J-${i}`,
        stepId: 'step-1',
        scheduleType: 'one_time',
        executeAt: now,
      });

      const [evalA, evalB] = await Promise.all([schedulerA.evaluateDueWork(now), schedulerB.evaluateDueWork(now)]);
      const resultA = evalA.results.find((r) => r.scheduleId === item.id);
      const resultB = evalB.results.find((r) => r.scheduleId === item.id);

      const executedA = resultA && resultA.status !== 'skipped' ? 1 : 0;
      const executedB = resultB && resultB.status !== 'skipped' ? 1 : 0;
      assert.strictEqual(
        executedA + executedB,
        1,
        `iteration ${i}: exactly one scheduler must execute (A=${resultA?.status}, B=${resultB?.status})`
      );

      // Durable state: exactly one triggered occurrence, never duplicated
      const finalItem = await schedStore.get(item.id);
      assert.ok(finalItem, 'item must exist');
      const triggered = (finalItem.executionHistory || []).filter((h: any) => h.status === 'triggered' || h.status === 'completed' || h.status === 'failed');
      assert.strictEqual(triggered.length, 1, `iteration ${i}: exactly one execution record`);

      // A second evaluation pass must not re-execute a finalized item
      const reEval = await schedulerB.evaluateDueWork(new Date().toISOString());
      const reResult = reEval.results.find((r) => r.scheduleId === item.id);
      assert.ok(!reResult, `iteration ${i}: finalized item must not be re-discovered as due`);
    }
    await truncateAll();
  });

  // ==========================================================================
  // K. SCHEDULER STALE-SNAPSHOT PROTECTION (Finding 6 regression guard)
  // ==========================================================================
  await withTest('K. Scheduler stale-snapshot protection (fresh re-read prevents state erasure)', async () => {
    await truncateAll();
    const schedStore = PostgresScheduledWorkStore.getInstance();
    for (let i = 0; i < 15; i++) {
      const def = createDefinition(`p26-def-K-${i}`);
      await wfStore.saveDefinition(def);
      const inst = createInstance(`p26-inst-K-${i}`, def);
      await wfStore.saveInstance(inst);

      const schedulerWinner = new WorkflowScheduler(
        schedStore as any,
        wfStore as any,
        new WorkflowRuntime(wfStore as any),
        leaseMgr,
        `worker-K-winner-${i}`
      );
      const now = new Date().toISOString();
      const item = await schedulerWinner.scheduleWork({
        workflowInstanceId: `p26-inst-K-${i}`,
        stepId: 'step-1',
        scheduleType: 'one_time',
        executeAt: now,
      });

      // Worker B's discovery snapshot is taken BEFORE the winner finalizes
      const staleSnapshot = await schedStore.get(item.id);
      assert.ok(staleSnapshot, 'stale snapshot must exist at discovery time');

      // Winner executes and finalizes the item (writes executionHistory + final status)
      const winnerEval = await schedulerWinner.evaluateDueWork(now);
      assert.ok(
        winnerEval.results.some((r) => r.scheduleId === item.id && r.status !== 'skipped'),
        'winner must execute the item'
      );
      const afterWinner = await schedStore.get(item.id);
      assert.notStrictEqual(afterWinner?.status, 'scheduled', 'winner must finalize the item');

      // Worker B now enters its critical section with the STALE pre-finalization snapshot
      // (simulating discovery → lease wait → winner finalizes → B acquires lease).
      const staleDiscoveryStore: any = {
        save: (it: any) => schedStore.save(it),
        get: (id: string) => schedStore.get(id),
        update: (it: any) => schedStore.update(it),
        list: (f?: any) => schedStore.list(f),
        cancel: (id: string, by: string, r?: string) => schedStore.cancel(id, by, r),
        listDue: async () => [staleSnapshot!], // B only sees its stale discovery snapshot
      };
      const schedulerStale = new WorkflowScheduler(
        staleDiscoveryStore,
        wfStore as any,
        new WorkflowRuntime(wfStore as any),
        leaseMgr,
        `worker-K-stale-${i}`
      );
      const staleEval = await schedulerStale.evaluateDueWork(now);
      const staleResult = staleEval.results.find((r) => r.scheduleId === item.id);
      assert.strictEqual(staleResult?.status, 'skipped', `iteration ${i}: stale worker must skip (got ${staleResult?.status})`);

      // The winner's durable finalization must NOT have been erased or relabeled
      const finalItem = await schedStore.get(item.id);
      assert.strictEqual(finalItem?.status, afterWinner?.status, 'final status must survive the stale worker');
      const finalHistory = (finalItem?.executionHistory || []).filter(
        (h: any) => h.status === 'triggered' || h.status === 'completed' || h.status === 'failed'
      );
      const winnerHistory = (afterWinner?.executionHistory || []).filter(
        (h: any) => h.status === 'triggered' || h.status === 'completed' || h.status === 'failed'
      );
      assert.strictEqual(
        finalHistory.length,
        winnerHistory.length,
        `iteration ${i}: executionHistory must not be erased by the stale worker`
      );
    }
    await truncateAll();
  });

  // ==========================================================================
  // L. CRASH-RECOVERY ORPHAN RE-CLAIM (Finding 7 regression guard)
  // ==========================================================================
  await withTest('L. Crash-recovery orphan re-claim (ready-transition clears stale claim identity)', async () => {
    await truncateAll();
    for (let i = 0; i < 15; i++) {
      const def = createDefinition(`p26-def-L-${i}`);
      await wfStore.saveDefinition(def);
      const inst = createInstance(`p26-inst-L-${i}`, def);
      await wfStore.saveInstance(inst);

      const crashedWorker = `worker-L-crashed-${i}`;
      const claim = await wfStore.claimStepAtomic(`p26-inst-L-${i}`, 'step-1', crashedWorker);
      assert.strictEqual(claim.step.claimedBy, crashedWorker);

      // A live worker cannot claim a step held by the (now crashed) worker
      await assert.rejects(
        () => wfStore.claimStepAtomic(`p26-inst-L-${i}`, 'step-1', `worker-L-live-${i}`),
        (err: any) => err instanceof StepClaimError || err instanceof ConcurrencyConflictError,
        'live worker must not steal a claimed step'
      );

      // Crash recovery follows the legal state-machine path:
      // running → waiting (release execution slot) → ready (re-claimable).
      await wfStore.transitionStepAtomic(`p26-inst-L-${i}`, 'step-1', 'waiting');
      await wfStore.transitionStepAtomic(`p26-inst-L-${i}`, 'step-1', 'ready');
      const recoveredRow = await prisma.workflowInstance.findUnique({ where: { id: `p26-inst-L-${i}` } });
      const recoveredStep = (recoveredRow?.stepStates as any)?.['step-1'];
      assert.strictEqual(recoveredStep?.status, 'ready', 'step must be ready after recovery');
      assert.strictEqual(recoveredStep?.claimedBy, undefined, 'stale claimedBy must be cleared');

      // …so a NEW live worker can claim it (no permanent orphan)
      const reclaimed = await wfStore.claimStepAtomic(`p26-inst-L-${i}`, 'step-1', `worker-L-live-${i}`);
      assert.strictEqual(reclaimed.step.claimedBy, `worker-L-live-${i}`, 'new worker must be able to claim');
    }
    await truncateAll();
  });

  // ==========================================================================
  // M. MIXED SYSTEM CONTENTION — all primitives racing simultaneously
  // ==========================================================================
  await withTest('M. Mixed system contention (lease + claim + idempotency + approval simultaneously)', async () => {
    await truncateAll();
    const ITER = 30;
    for (let i = 0; i < ITER; i++) {
      // Pre-provision approval + workflow instance for this round
      const approvalId = `p26-appr-M-${i}`;
      await apprStore.save({
        id: approvalId,
        decision: 'approved',
        actionName: 'p26.probe.action',
        classification: 'external_communication',
        workflowInstanceId: null as any,
        stepId: 'step-1',
        employeeRole: 'cmo',
        scope: { allowedUses: 1, usedCount: 0 },
        requestedAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
        decidedBy: 'founder',
        isConsumed: false,
      } as any);
      const def = createDefinition(`p26-def-M-${i}`);
      await wfStore.saveDefinition(def);
      const inst = createInstance(`p26-inst-M-${i}`, def);
      await wfStore.saveInstance(inst);

      const round = Array.from({ length: 4 }, (_, w) => `worker-M${w}-i${i}`);
      // Each worker issues [lease, claim, idem, approval] — results are interleaved per
      // worker, so classify by position (idx % 4) rather than contiguous slices.
      const results = await Promise.all(
        round.flatMap((worker) => [
          leaseMgr.acquire(`p26-lease-M-${i}`, worker, 30000),
          wfStore.claimStepAtomic(`p26-inst-M-${i}`, 'step-1', worker).catch((e) => e),
          idemStore.claim({ key: `p26-idem-M-${i}`, actionName: 'p26.probe', payloadHash: `hash-M-${i}` }).catch((e) => e),
          apprStore.consume(approvalId).catch((e) => e),
        ])
      );

      const isErr = (r: any) => r instanceof Error;
      const byType = (pos: number) => results.filter((_, idx) => idx % 4 === pos);

      // Lease: exactly one winner
      const leaseWinners = byType(0).filter((r: any) => (r as any)?.acquired);
      assert.strictEqual(leaseWinners.length, 1, `round ${i}: exactly one lease winner`);
      // Step claim: exactly one success among the 4 workers
      const claimSuccesses = byType(1).filter((r: any) => !isErr(r));
      assert.strictEqual(claimSuccesses.length, 1, `round ${i}: exactly one step claim`);
      // Idempotency: exactly one claimed
      const idemClaimed = byType(2).filter((r: any) => (r as any)?.state === 'claimed');
      assert.strictEqual(idemClaimed.length, 1, `round ${i}: exactly one idempotency claim`);
      // Approval: exactly one consumption
      const apprConsumed = byType(3).filter((r: any) => !isErr(r));
      assert.strictEqual(apprConsumed.length, 1, `round ${i}: exactly one approval consumption`);
    }
    await truncateAll();
  });

  // ==========================================================================
  // N. MULTI-PROCESS CONTENTION — 3 independent OS processes, own Prisma pools
  // ==========================================================================
  await withTest('N. Multi-process contention (3 independent worker processes)', async () => {
    await truncateAll();
    const ITER = 20;
    const prefix = `p26-mp-${Date.now()}`;

    // Pre-provision approvals + workflow instances
    for (let i = 0; i < ITER; i++) {
      await apprStore.save({
        id: `${prefix}-appr-${i}`,
        decision: 'approved',
        actionName: 'p26.probe.action',
        classification: 'external_communication',
        workflowInstanceId: null as any,
        stepId: 'step-1',
        employeeRole: 'cmo',
        scope: { allowedUses: 1, usedCount: 0 },
        requestedAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
        decidedBy: 'founder',
        isConsumed: false,
      } as any);
      const def = createDefinition(`${prefix}-def-${i}`);
      await wfStore.saveDefinition(def);
      const inst = createInstance(`${prefix}-inst-${i}`, def);
      await wfStore.saveInstance(inst);
    }

    const startAt = Date.now() + 1500; // simultaneous start barrier
    const workerTags = ['proc0', 'proc1', 'proc2'];
    const procs = workerTags.map((tag) =>
      Bun.spawn(
        ['bun', 'scripts/phase2_6_worker.ts', String(ITER), prefix, tag, String(startAt)],
        { stdout: 'pipe', stderr: 'inherit', env: { ...process.env } as any }
      )
    );

    const summaries: any[] = [];
    for (const proc of procs) {
      const text = await new Response(proc.stdout as any).text();
      const exitCode = await proc.exited;
      assert.strictEqual(exitCode, 0, `worker process must exit 0`);
      const line = text.split('\n').find((l) => l.startsWith('RESULT '));
      assert.ok(line, `worker must print a RESULT line, got: ${text.slice(0, 300)}`);
      summaries.push(JSON.parse(line.slice('RESULT '.length)));
    }

    // Aggregate worker reports: totals per resource type
    for (const resource of ['lease', 'idem', 'approval', 'claim'] as const) {
      const total = summaries.reduce((acc, s) => acc + (s[`${resource}Wins`] || 0), 0);
      assert.strictEqual(
        total,
        ITER,
        `resource ${resource}: across 3 processes exactly ${ITER} wins expected, got ${total}`
      );
    }

    // Durable invariants verified independently by this (parent) process
    for (let i = 0; i < ITER; i++) {
      const leaseRows = await prisma.distributedLease.findMany({ where: { resourceKey: `${prefix}-lease-${i}` } });
      assert.strictEqual(leaseRows.length, 1, `lease ${i}: exactly one durable row`);
      assert.ok(leaseRows[0]!.holderId.startsWith('proc'), 'holder must be one of the worker processes');

      const idemRows = await prisma.idempotencyRecord.findMany({ where: { key: `${prefix}-idem-${i}` } });
      assert.strictEqual(idemRows.length, 1, `idem ${i}: exactly one durable record`);

      const apprRow = await prisma.approvalRecord.findUnique({ where: { id: `${prefix}-appr-${i}` } });
      assert.notStrictEqual(apprRow?.consumedAt, null, `approval ${i}: consumed exactly once`);
      assert.strictEqual(((apprRow?.scope as any) || {}).usedCount, 1, `approval ${i}: usedCount exactly 1`);

      const instRow = await prisma.workflowInstance.findUnique({ where: { id: `${prefix}-inst-${i}` } });
      assert.strictEqual(instRow?.stateVersion, 1, `instance ${i}: version advanced exactly once`);
      const step = (instRow?.stepStates as any)?.['step-1'];
      assert.strictEqual(step?.status, 'running', `instance ${i}: step running`);
      assert.ok(step?.claimedBy?.startsWith('proc'), `instance ${i}: claimed by a worker process`);
    }
    await truncateAll();
  });

  // ==========================================================================
  // WORKER IDENTITY SANITY
  // ==========================================================================
  await withTest('Worker identity uniqueness (generateWorkerIdentity)', async () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateWorkerIdentity()));
    assert.strictEqual(ids.size, 200, 'all worker identities must be unique');
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n================================================================');
  console.log('📊  PHASE 2.6 REAL POSTGRESQL CONCURRENCY VERIFICATION — SUMMARY');
  console.log('================================================================');
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  if (failures.length) {
    console.log('  Failing tests:');
    for (const f of failures) console.log(`    - ${f}`);
  }
  console.log(
    failed === 0
      ? '\nVERDICT: All real-PostgreSQL concurrency invariants held.'
      : '\nVERDICT: FAIL — concurrency invariants violated.'
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
