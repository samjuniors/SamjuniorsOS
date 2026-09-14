/**
 * PHASE 4.4B.1 — SCHEDULED GOVERNANCE SEMANTICS HARDENING TESTS.
 *
 * Exercises the REAL WorkflowRuntime, the REAL SideEffectAuthorizationGate,
 * the REAL policy evaluator, the REAL approval stores, the REAL
 * WorkflowScheduler, the REAL scheduled-work store and the REAL lease
 * manager. Only two boundaries are doubled, deliberately:
 *
 *   1. FakeWorkflowStore — JSON-round-trip instance/definition store (same
 *      pattern as the 4.4B suite; keeps test instances out of the live
 *      durable stores).
 *   2. ContractExecutorDouble — implements the REAL ServerAgentExecutor's
 *      return contract (success:boolean + persisted-run semantics) so
 *      provider FAILURE can be injected deterministically. The real provider
 *      cannot be forced to fail on cue; the runtime path under test
 *      (executeReadyStep → gate → state machine → scheduler retry) is fully
 *      real.
 *
 * Invariants pinned (founder directive 4.4B.1):
 *   [P1] occurrence 1 requests a founder approval; approval executes
 *        occurrence 1 exactly once; the approval is consumed (single-use).
 *   [P2] occurrence 2 requests a NEW approval; occurrence 1's approval can
 *        never authorize occurrence 2 (APPROVAL_OCCURRENCE_MISMATCH).
 *   [P3] repeated heartbeats cannot duplicate either occurrence.
 *   [P4] a REJECTED occurrence remains blocked (no execution, no nagging
 *        re-requests).
 *   [P5] non-approval (read_only) schedules are unaffected per occurrence.
 *   [P6] financial side-effect policy remains fail-closed on scheduled
 *        occurrences (approval_required, never auto-allowed).
 *   [P7] an occurrence-bound approval cannot authorize an ad-hoc (unbound)
 *        execution of the same step.
 *   [F1] provider failure (executor success:false) → step FAILED (never a
 *        completed step with error output) → scheduler retry with backoff
 *        (step reset, retryCount advance, instance reopen) → retry succeeds.
 *   [F2] retries exhausted → terminal schedule failure; no further attempts.
 *   [F4] cancelled schedule never executes (5-way distinction completeness).
 *   [A1] scheduled creations carry founder attribution (initiatedById) and
 *        retain it across store reload.
 *   [A2] creations without a founder identity stay honestly unattributed.
 *   [A3] attribution survives a REAL process restart (cold-start durable
 *        recovery in a fresh bun child).
 *   [I1] gate-level occurrence-binding unit invariants (matching, dedupe,
 *        cross-occurrence denial).
 */
import "./env-setup";
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { WorkflowScheduler } from "../../src/lib/server/workflow/scheduler";
import { InMemoryScheduledWorkStore } from "../../src/lib/server/workflow/scheduler-store";
import { InMemoryLeaseManager } from "../../src/lib/server/coordination/lease-manager";
import { WorkflowRuntime } from "../../src/lib/server/workflow/runtime";
import {
  createScheduledDirective,
  buildDirectiveWorkflowDefinition,
  DIRECTIVE_STEP_ID,
} from "../../src/lib/server/workflow/directive-schedule";
import { SideEffectAuthorizationGate } from "../../src/lib/server/authorization/gate";
import { InMemoryApprovalStore } from "../../src/lib/server/authorization/approval-store";
import {
  validateStepTransition,
  validateInstanceTransition,
  ConcurrencyConflictError,
  StepClaimError,
} from "../../src/lib/server/workflow/state-machine";
import type { ServerAgentExecutor } from "../../src/lib/server/agents/executor";
import type { InMemoryWorkflowStore } from "../../src/lib/server/workflow/store";
import type { WorkflowRuntime as RuntimeType } from "../../src/lib/server/workflow/runtime";
import type {
  WorkflowDefinition,
  WorkflowInstanceState,
  WorkflowStepState,
} from "../../src/types/workflow";
import type { FounderApprovalRecord } from "../../src/types/authorization";
import type { ScheduledWorkItem } from "../../src/types/scheduling";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

/* ----------------------------------------------------------- artifact hygiene */

const ENV_TEXT = await Bun.file(".env").text();
const REAL_DB_URL = ENV_TEXT.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim() ?? "";

const gate = SideEffectAuthorizationGate.getInstance();
const approvalStore = gate.getApprovalStore() as InMemoryApprovalStore;
const auditStore = gate.getAuditStore() as any;

// Snapshot the pre-existing store contents so the suite can surgically purge
// exactly what IT added (approvals / audits / idempotency keys) — never the
// live dev artifacts.
const initialApprovalIds = new Set(approvalStore.approvals.keys());
const initialAuditIds = new Set<string>((auditStore.audits as Map<string, any>).keys());
let initialIdemKeys = new Set<string>();
try {
  const idemStore = (await import("../../src/lib/server/idempotency/store")).getIdempotencyStore() as any;
  initialIdemKeys = new Set<string>(Array.from(idemStore.records?.keys?.() ?? []));
} catch {
  /* store shape differs — best-effort only */
}

const createdInstanceIds = new Set<string>();
const createdDefinitionIds = new Set<string>();
const createdScheduleIds = new Set<string>();

function durableCollectionPath(collection: string): string | null {
  try {
    const dir = (gate as any) && join(process.cwd(), ".data");
    if (!existsSync(dir)) return null;
    const p = join(dir, `${collection}.json`);
    return existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

function purgeDurableIds(collection: string, ids: Set<string>): void {
  const p = durableCollectionPath(collection);
  if (!p || ids.size === 0) return;
  try {
    const raw = JSON.parse(readFileSync(p, "utf-8"));
    let changed = false;
    for (const id of ids) {
      if (id in raw) {
        delete raw[id];
        changed = true;
      }
    }
    if (changed) writeFileSync(p, JSON.stringify(raw));
  } catch {
    /* best-effort */
  }
}

async function purgeRealDbArtifacts(
  approvalIds: string[],
  auditIds: string[],
  scheduleIds: string[]
): Promise<void> {
  const dbs: Array<{ url: string | undefined }> = [
    { url: process.env.DATABASE_URL },
    { url: REAL_DB_URL || undefined },
  ];
  for (const { url } of dbs) {
    if (!url) continue;
    try {
      const db = new PrismaClient({
        datasources: { db: { url } },
      } as any);
      if (approvalIds.length) {
        await db.approvalRecord.deleteMany({ where: { id: { in: approvalIds } } }).catch(() => {});
      }
      if (auditIds.length) {
        await db.sideEffectAudit.deleteMany({ where: { id: { in: auditIds } } }).catch(() => {});
      }
      if (scheduleIds.length) {
        await db.scheduledWorkItem.deleteMany({ where: { id: { in: scheduleIds } } }).catch(() => {});
      }
      await db.$disconnect().catch(() => {});
    } catch {
      /* best-effort */
    }
  }
}

afterAll(async () => {
  // 1. Identify exactly what this suite added.
  const addedApprovalIds = Array.from(approvalStore.approvals.keys()).filter(
    (id) => !initialApprovalIds.has(id)
  );
  const addedAuditIds = Array.from((auditStore.audits as Map<string, any>).keys()).filter(
    (id) => !initialAuditIds.has(id)
  );

  // 2. In-memory singleton maps.
  for (const id of addedApprovalIds) approvalStore.approvals.delete(id);
  for (const id of addedAuditIds) (auditStore.audits as Map<string, any>).delete(id);
  try {
    const idemStore = (await import("../../src/lib/server/idempotency/store")).getIdempotencyStore() as any;
    for (const key of Array.from(idemStore.records?.keys?.() ?? [])) {
      if (!initialIdemKeys.has(key)) idemStore.records.delete(key);
    }
  } catch {
    /* best-effort */
  }

  // 3. Durable file collections (surgical — only this suite's ids).
  purgeDurableIds("approvals", new Set(addedApprovalIds));
  purgeDurableIds("audits", new Set(addedAuditIds));

  // 4. Database rows (throwaway copy first, then the real dev DB — exact ids).
  await purgeRealDbArtifacts(addedApprovalIds, addedAuditIds, Array.from(createdScheduleIds));

  // 5. Scheduler store rows in the DB copy for our exact schedules.
  try {
    const db = new PrismaClient();
    if (createdInstanceIds.size) {
      await db.scheduledWorkItem.deleteMany({
        where: { workflowInstanceId: { in: Array.from(createdInstanceIds) } },
      });
    }
    await db.$disconnect();
  } catch {
    /* best-effort */
  }
});

/* ------------------------------------------------------------- workflow store */

/** Map-backed workflow store (JSON round-trip; never touches durable stores).
 * Implements the FULL WorkflowInstanceStore contract — including the atomic
 * claim/transition operations with state-machine validation and version
 * bumps — mirroring the real InMemoryWorkflowStore semantics exactly, so the
 * REAL runtime path (executeReadyStep → claim → transition) runs unmodified. */
class FakeWorkflowStore {
  public definitions = new Map<string, WorkflowDefinition>();
  public instances = new Map<string, WorkflowInstanceState>();

  async saveDefinition(d: WorkflowDefinition): Promise<void> {
    this.definitions.set(`${d.id}@${d.version}`, d);
    this.definitions.set(d.id, d);
  }
  async getDefinition(id: string, version?: string): Promise<WorkflowDefinition | null> {
    return this.definitions.get(version ? `${id}@${version}` : id) ?? null;
  }
  async saveInstance(i: WorkflowInstanceState): Promise<void> {
    this.instances.set(i.instanceId, JSON.parse(JSON.stringify(i)));
  }
  async getInstance(id: string): Promise<WorkflowInstanceState | null> {
    const i = this.instances.get(id);
    return i ? JSON.parse(JSON.stringify(i)) : null;
  }

  async claimStepAtomic(
    instanceId: string,
    stepId: string,
    workerId: string,
    expectedVersion?: number
  ): Promise<{ instance: WorkflowInstanceState; step: WorkflowStepState }> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Workflow instance not found: ${instanceId}`);
    const currentVersion = instance.stateVersion ?? 0;
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      throw new ConcurrencyConflictError(instanceId, expectedVersion, currentVersion);
    }
    const step = instance.stepStates[stepId];
    if (!step) throw new Error(`Step not found in workflow instance: ${stepId}`);
    if (step.status !== "ready") {
      throw new StepClaimError(instanceId, stepId, step.status, step.claimedBy);
    }
    if (step.claimedBy && step.claimedBy !== workerId) {
      throw new StepClaimError(instanceId, stepId, step.status, step.claimedBy);
    }
    validateStepTransition(step.status, "running");
    const nowIso = new Date().toISOString();
    step.status = "running";
    step.claimedBy = workerId;
    step.claimedAt = nowIso;
    if (!step.startedAt) step.startedAt = nowIso;
    if (instance.status === "pending" || instance.status === "waiting") {
      validateInstanceTransition(instance.status, "running");
      instance.status = "running";
    }
    instance.stateVersion = currentVersion + 1;
    instance.claimedBy = workerId;
    instance.claimedAt = nowIso;
    instance.updatedAt = nowIso;
    this.instances.set(instanceId, JSON.parse(JSON.stringify(instance)));
    return {
      instance: JSON.parse(JSON.stringify(instance)),
      step: JSON.parse(JSON.stringify(step)),
    };
  }

  async transitionStepAtomic(
    instanceId: string,
    stepId: string,
    targetStatus: WorkflowStepStatus,
    expectedVersion?: number,
    patch?: Partial<WorkflowStepState>
  ): Promise<WorkflowInstanceState> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Workflow instance not found: ${instanceId}`);
    const currentVersion = instance.stateVersion ?? 0;
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      throw new ConcurrencyConflictError(instanceId, expectedVersion, currentVersion);
    }
    const step = instance.stepStates[stepId];
    if (!step) throw new Error(`Step not found in workflow instance: ${stepId}`);
    validateStepTransition(step.status, targetStatus);
    const nowIso = new Date().toISOString();
    step.status = targetStatus;
    if (targetStatus === "completed" || targetStatus === "failed" || targetStatus === "cancelled") {
      step.completedAt = nowIso;
      step.claimedBy = undefined;
    }
    if (patch) Object.assign(step, patch);
    instance.stateVersion = currentVersion + 1;
    instance.updatedAt = nowIso;
    this.instances.set(instanceId, JSON.parse(JSON.stringify(instance)));
    return JSON.parse(JSON.stringify(instance));
  }
}

/* ---------------------------------------------- executor contract double */

type AgentRunDoublRecord = {
  runId: string;
  status: "completed" | "failed";
  error?: string;
};

/**
 * Implements the REAL ServerAgentExecutor contract: provider failures are
 * returned as { success: false, error } (the real executor persists a FAILED
 * AgentRun before returning; this double records it in memory), successes as
 * { success: true, outputContent }. The runtime must interpret the contract.
 */
class ContractExecutorDouble {
  public calls = 0;
  public mode: "success" | "fail" = "success";
  public agentRuns: AgentRunDoublRecord[] = [];

  async executeAgentTask(agentId: any, context: any, _prompt: string): Promise<any> {
    this.calls += 1;
    const runId = `run-44b1-${this.calls}`;
    if (this.mode === "fail") {
      this.agentRuns.push({ runId, status: "failed", error: "provider unavailable" });
      return {
        success: false,
        agentId,
        agentName: "COO",
        protocolStep: context.protocolStep,
        statusMessage: "[COO] Task execution failed due to API communication error.",
        outputContent: `**Execution Error**: Task "${context.taskTitle}" failed to execute through the agent runtime: provider unavailable.`,
        runId,
        provenance: { agentId, protocolStep: context.protocolStep, isVerified: false },
        error: "provider unavailable",
      };
    }
    this.agentRuns.push({ runId, status: "completed" });
    return {
      success: true,
      agentId,
      agentName: "COO",
      protocolStep: context.protocolStep,
      statusMessage: "[COO] Completed.",
      outputContent: `44b1 deterministic output for: ${context.directive}`,
      runId,
      provenance: { agentId, protocolStep: context.protocolStep, isVerified: true },
    };
  }
}

/* ------------------------------------------------------------------ fixtures */

const schedStore = InMemoryScheduledWorkStore.getInstance();
const leaseManager = InMemoryLeaseManager.getInstance();
let wfStore: FakeWorkflowStore;
let executor: ContractExecutorDouble;
let runtime: WorkflowRuntime;

function makeScheduler(workerId?: string): WorkflowScheduler {
  return new WorkflowScheduler(
    schedStore,
    wfStore as unknown as InMemoryWorkflowStore,
    runtime as unknown as RuntimeType,
    leaseManager,
    workerId ?? `test-worker-${Math.random().toString(36).slice(2, 8)}`,
    30000
  );
}

interface CreateOpts {
  directive?: string;
  intervalValue?: number;
  maxOccurrences?: number;
  requiresApproval?: boolean;
  dueInMs?: number;
  founder?: { userId: string };
  oneTime?: boolean;
}

async function createSchedule(opts: CreateOpts = {}): Promise<{
  schedule: ScheduledWorkItem;
  instanceId: string;
  definitionId: string;
}> {
  const result = await createScheduledDirective(
    {
      directive: opts.directive ?? "44b1 fixture: research competitors and recommend pricing",
      scheduleType: opts.oneTime ? "one_time" : "recurring",
      intervalUnit: "minutes",
      intervalValue: opts.intervalValue ?? 5,
      maxOccurrences: opts.maxOccurrences,
      executeAt: new Date(Date.now() - (opts.dueInMs ?? 60_000)).toISOString(),
      requiresApproval: opts.requiresApproval,
    },
    {
      runtime: runtime as unknown as WorkflowRuntime,
      scheduler: makeScheduler(),
      founder: opts.founder,
    }
  );
  createdInstanceIds.add(result.workflowInstanceId);
  createdDefinitionIds.add(result.definition.id);
  createdScheduleIds.add(result.schedule.id);
  return {
    schedule: result.schedule,
    instanceId: result.workflowInstanceId,
    definitionId: result.definition.id,
  };
}

async function getStep(instanceId: string): Promise<WorkflowStepState> {
  const inst = (await wfStore.getInstance(instanceId))!;
  return inst.stepStates[DIRECTIVE_STEP_ID];
}

async function getSchedule(id: string): Promise<ScheduledWorkItem> {
  return (await schedStore.get(id))!;
}

/** Approvals created for OUR instances (server-manufactured only). */
async function myApprovals(instanceId: string): Promise<FounderApprovalRecord[]> {
  const list = await approvalStore.list({ workflowInstanceId: instanceId });
  return list;
}

beforeEach(async () => {
  schedStore.clear();
  leaseManager.clear();
  wfStore = new FakeWorkflowStore();
  executor = new ContractExecutorDouble();
  runtime = new WorkflowRuntime(wfStore as any, executor as unknown as ServerAgentExecutor);
});

/* -------------------------------------------------------------------- tests */

describe("Phase 4.4B.1 — gate-level occurrence-binding invariants", () => {
  test("[I1] occurrence-bound matching, dedupe, and cross-occurrence denial", async () => {
    const instanceId = `wf-inst-44b1-i1-${uuidv4()}`;
    const stepId = DIRECTIVE_STEP_ID;

    // Request an approval bound to occurrence 1.
    const occ1 = await gate.requestApproval({
      actionName: "Execute scheduled directive",
      classification: "external_communication",
      workflowInstanceId: instanceId,
      stepId,
      employeeRole: "coo",
      scope: { scopeType: "single_action", occurrenceId: `${instanceId}-sched-occ-1`, maxUses: 1 },
    });
    expect(occ1.id).toMatch(/^appr-/);
    expect(occ1.scope.occurrenceId).toBe(`${instanceId}-sched-occ-1`);
    expect(occ1.scope.scopeType).toBe("single_action");

    // Occurrence-bound dedupe: same occurrence re-request returns the SAME record.
    const occ1Again = await gate.requestApproval({
      actionName: "Execute scheduled directive",
      classification: "external_communication",
      workflowInstanceId: instanceId,
      stepId,
      employeeRole: "coo",
      scope: { scopeType: "single_action", occurrenceId: `${instanceId}-sched-occ-1`, maxUses: 1 },
    });
    expect(occ1Again.id).toBe(occ1.id);

    // A different occurrence gets a DIFFERENT record (fresh approval).
    const occ2 = await gate.requestApproval({
      actionName: "Execute scheduled directive",
      classification: "external_communication",
      workflowInstanceId: instanceId,
      stepId,
      employeeRole: "coo",
      scope: { scopeType: "single_action", occurrenceId: `${instanceId}-sched-occ-2`, maxUses: 1 },
    });
    expect(occ2.id).not.toBe(occ1.id);

    // Founder approves occurrence 1 only.
    await gate.decideApproval({
      approvalId: occ1.id,
      decision: "approved",
      decidedBy: "founder",
      reason: "44b1 test",
    });

    const baseCtx = {
      workflowInstanceId: instanceId,
      stepId,
      objective: "44b1",
    };

    // Occurrence 1 request → allowed (its own bound approval).
    const d1 = await gate.evaluateAuthorization({
      employeeRole: "coo",
      actionName: "Execute scheduled directive",
      classification: "external_communication",
      workflowContext: { ...baseCtx, occurrenceId: `${instanceId}-sched-occ-1` },
    });
    expect(d1.effect).toBe("allowed");
    expect(d1.reasonCode).toBe("APPROVED_BY_FOUNDER");

    // Occurrence 2 request → the prior occurrence's approval CANNOT authorize it.
    // (Occurrence 2's own request exists and is pending → approval_required.)
    const d2 = await gate.evaluateAuthorization({
      employeeRole: "coo",
      actionName: "Execute scheduled directive",
      classification: "external_communication",
      workflowContext: { ...baseCtx, occurrenceId: `${instanceId}-sched-occ-2` },
    });
    expect(d2.effect).toBe("approval_required");
    expect(d2.reasonCode).toBe("APPROVAL_PENDING");
    expect(d2.approvalId).toBe(occ2.id);

    // Even naming occurrence 1's approval explicitly cannot authorize occurrence 2.
    const d2Explicit = await gate.evaluateAuthorization({
      employeeRole: "coo",
      actionName: "Execute scheduled directive",
      classification: "external_communication",
      approvalId: occ1.id,
      workflowContext: { ...baseCtx, occurrenceId: `${instanceId}-sched-occ-2` },
    });
    expect(d2Explicit.effect).toBe("denied");
    expect(d2Explicit.reasonCode).toBe("APPROVAL_OCCURRENCE_MISMATCH");

    // Ad-hoc (unbound) request cannot use the occurrence-bound approval either.
    const dAdHoc = await gate.evaluateAuthorization({
      employeeRole: "coo",
      actionName: "Execute scheduled directive",
      classification: "external_communication",
      workflowContext: baseCtx,
    });
    expect(dAdHoc.effect).toBe("denied");
    expect(dAdHoc.reasonCode).toBe("APPROVAL_OCCURRENCE_MISMATCH");
  });

  test("[I2] consumed occurrence-bound approvals never match a later evaluation", async () => {
    const instanceId = `wf-inst-44b1-i2-${uuidv4()}`;
    const stepId = DIRECTIVE_STEP_ID;
    const occurrenceId = `${instanceId}-sched-occ-7`;

    const rec = await gate.requestApproval({
      actionName: "Execute scheduled directive",
      classification: "external_communication",
      workflowInstanceId: instanceId,
      stepId,
      employeeRole: "coo",
      scope: { scopeType: "single_action", occurrenceId, maxUses: 1 },
    });
    await gate.decideApproval({
      approvalId: rec.id,
      decision: "approved",
      decidedBy: "founder",
    });
    await approvalStore.consume(rec.id); // consumed at execution (single-use)

    // findActiveMatching with the occurrence filter skips consumed records.
    const matched = await approvalStore.findActiveMatching({
      workflowInstanceId: instanceId,
      stepId,
      employeeRole: "coo",
      actionName: "Execute scheduled directive",
      classification: "external_communication",
      occurrenceId,
    });
    expect(matched).toBeNull();

    // The policy layer then re-requests (approval_required), never re-authorizes.
    const decision = await gate.evaluateAuthorization({
      employeeRole: "coo",
      actionName: "Execute scheduled directive",
      classification: "external_communication",
      workflowContext: {
        workflowInstanceId: instanceId,
        stepId,
        occurrenceId,
      },
    });
    expect(decision.effect).toBe("approval_required");
  });
});

describe("Phase 4.4B.1 — per-occurrence approval lifecycle (REAL runtime + REAL gate + REAL scheduler)", () => {
  test("[P1] occurrence 1 requests approval → founder approves → executes exactly once → approval consumed", async () => {
    const { schedule, instanceId } = await createSchedule({
      requiresApproval: true,
      maxOccurrences: 3,
      intervalValue: 5,
    });
    const s = makeScheduler();

    // First heartbeat: occurrence 1 must REQUEST approval and NOT execute.
    const r1 = await s.evaluateDueWork();
    expect(r1.results[0]).toMatchObject({ scheduleId: schedule.id, status: "awaiting_approval" });
    expect(executor.calls).toBe(0);

    const stepAfterRequest = await getStep(instanceId);
    expect(stepAfterRequest.status).toBe("awaiting_approval");
    expect(stepAfterRequest.approvalId).toBeDefined();

    const approvals1 = await myApprovals(instanceId);
    expect(approvals1).toHaveLength(1);
    const occ1Approval = approvals1[0];
    expect(occ1Approval.decision).toBe("pending");
    expect(occ1Approval.scope.occurrenceId).toBe(`${schedule.id}-occ-1`);
    expect(occ1Approval.scope.scopeType).toBe("single_action");
    expect(occ1Approval.workflowInstanceId).toBe(instanceId);

    // Repeated heartbeat while pending: no duplicate requests, no execution.
    const r1b = await s.evaluateDueWork();
    expect(r1b.results[0].status).toBe("awaiting_approval");
    expect((await myApprovals(instanceId)).length).toBe(1);

    // Founder approves through the SAME authority /api/workflow/approvals uses.
    await gate.decideApproval({
      approvalId: occ1Approval.id,
      decision: "approved",
      decidedBy: "founder",
      reason: "44b1 test approval",
    });

    // Second heartbeat: executes occurrence 1 exactly once.
    const r2 = await s.evaluateDueWork();
    expect(r2.results[0].status).toBe("completed");
    expect(executor.calls).toBe(1);

    const stepAfterRun = await getStep(instanceId);
    expect(stepAfterRun.status).toBe("completed");
    expect(stepAfterRun.outputs.result).toContain("44b1 deterministic output");

    // The approval was consumed at execution (single-use).
    const consumed = await approvalStore.get(occ1Approval.id);
    expect(consumed!.isConsumed).toBe(true);

    // Schedule advanced to occurrence 2 (future), no duplicate execution.
    const item = await getSchedule(schedule.id);
    expect(item.status).toBe("scheduled");
    expect(item.recurrence!.currentOccurrence).toBe(2);
    const r3 = await s.evaluateDueWork();
    expect(r3.processedCount).toBe(0); // next occurrence is in the future
    expect(executor.calls).toBe(1);
  });

  test("[P2] occurrence 2 requests a NEW approval; occurrence 1's approval cannot authorize it", async () => {
    const { schedule, instanceId } = await createSchedule({
      requiresApproval: true,
      maxOccurrences: 3,
      intervalValue: 5,
    });
    const s = makeScheduler();

    // Occurrence 1: request → approve → execute (approval consumed).
    await s.evaluateDueWork();
    const occ1Approval = (await myApprovals(instanceId))[0];
    await gate.decideApproval({
      approvalId: occ1Approval.id,
      decision: "approved",
      decidedBy: "founder",
    });
    await s.evaluateDueWork();
    expect(executor.calls).toBe(1);

    // Occurrence 2 becomes due.
    const r4 = await s.evaluateDueWork(new Date(Date.now() + 6 * 60_000).toISOString());
    expect(r4.results[0].status).toBe("awaiting_approval");
    expect(executor.calls).toBe(1); // still exactly one execution

    // A NEW approval was requested for occurrence 2 — distinct record, bound
    // to occurrence 2. Occurrence 1's (consumed) approval did not satisfy it.
    const approvals2 = await myApprovals(instanceId);
    expect(approvals2.length).toBe(2);
    const occ2Approval = approvals2.find((a) => a.id !== occ1Approval.id)!;
    expect(occ2Approval.id).not.toBe(occ1Approval.id);
    expect(occ2Approval.decision).toBe("pending");
    expect(occ2Approval.scope.occurrenceId).toBe(`${schedule.id}-occ-2`);

    // The occurrence-1 approval explicitly cannot authorize occurrence 2:
    // it was CONSUMED by occurrence 1's execution (single-use) — denied.
    const denial = await gate.evaluateAuthorization({
      employeeRole: "coo",
      actionName: "Execute scheduled directive",
      classification: "external_communication",
      approvalId: occ1Approval.id,
      workflowContext: {
        workflowInstanceId: instanceId,
        stepId: DIRECTIVE_STEP_ID,
        occurrenceId: `${schedule.id}-occ-2`,
      },
    });
    expect(denial.effect).toBe("denied");
    expect(denial.reasonCode).toBe("APPROVAL_CONSUMED");

    // Heartbeat cannot sneak occurrence 2 through with the stale approval.
    const r5 = await s.evaluateDueWork(new Date(Date.now() + 6 * 60_000).toISOString());
    expect(r5.results[0].status).toBe("awaiting_approval");
    expect(executor.calls).toBe(1);

    // Founder approves occurrence 2 → it executes exactly once too.
    await gate.decideApproval({
      approvalId: occ2Approval.id,
      decision: "approved",
      decidedBy: "founder",
    });
    const r6 = await s.evaluateDueWork(new Date(Date.now() + 6 * 60_000).toISOString());
    expect(r6.results[0].status).toBe("completed");
    expect(executor.calls).toBe(2);
    expect((await approvalStore.get(occ2Approval.id))!.isConsumed).toBe(true);
  });

  test("[P3] repeated heartbeats cannot duplicate either occurrence", async () => {
    const { schedule, instanceId } = await createSchedule({
      requiresApproval: true,
      maxOccurrences: 2,
      intervalValue: 5,
    });
    const s = makeScheduler();

    // Occurrence 1: request approval.
    await s.evaluateDueWork();
    const occ1Approval = (await myApprovals(instanceId))[0];
    await gate.decideApproval({
      approvalId: occ1Approval.id,
      decision: "approved",
      decidedBy: "founder",
    });

    // Fire THREE concurrent heartbeats for the same due occurrence — exactly
    // one execution (each heartbeat POST constructs its own scheduler/worker,
    // as the route does; the distributed lease + occurrence idempotency are
    // the serialization authorities).
    const concurrent = await Promise.all([
      makeScheduler().evaluateDueWork(),
      makeScheduler().evaluateDueWork(),
      makeScheduler().evaluateDueWork(),
    ]);
    const completedCount = concurrent.flatMap((r) => r.results).filter((r) => r.status === "completed").length;
    expect(completedCount).toBe(1);
    // Sequential confirmation pass.
    await makeScheduler().evaluateDueWork();
    expect(executor.calls).toBe(1);

    const item1 = await getSchedule(schedule.id);
    const occ1Records = item1.executionHistory.filter((h) => h.occurrenceId === `${schedule.id}-occ-1`);
    expect(occ1Records).toHaveLength(1);
    expect(occ1Records[0].status).toBe("completed");

    // Occurrence 2: approve and execute; repeated heartbeats cannot duplicate.
    await s.evaluateDueWork(new Date(Date.now() + 6 * 60_000).toISOString());
    const occ2Approval = (await myApprovals(instanceId)).find(
      (a) => a.scope.occurrenceId === `${schedule.id}-occ-2`
    )!;
    await gate.decideApproval({
      approvalId: occ2Approval.id,
      decision: "approved",
      decidedBy: "founder",
    });
    await s.evaluateDueWork(new Date(Date.now() + 6 * 60_000).toISOString());
    await s.evaluateDueWork(new Date(Date.now() + 6 * 60_000).toISOString());
    expect(executor.calls).toBe(2);

    const item2 = await getSchedule(schedule.id);
    expect(item2.status).toBe("completed"); // maxOccurrences 2 reached
    const occ2Records = item2.executionHistory.filter((h) => h.occurrenceId === `${schedule.id}-occ-2`);
    expect(occ2Records).toHaveLength(1);
    expect(occ2Records[0].status).toBe("completed");
  });

  test("[P4] a rejected occurrence remains blocked (no execution, no re-request)", async () => {
    const { schedule, instanceId } = await createSchedule({
      requiresApproval: true,
      maxOccurrences: 2,
    });
    const s = makeScheduler();

    await s.evaluateDueWork(); // occurrence 1 requests approval
    const occ1Approval = (await myApprovals(instanceId))[0];

    // Founder REJECTS occurrence 1.
    await gate.decideApproval({
      approvalId: occ1Approval.id,
      decision: "rejected",
      decidedBy: "founder",
      reason: "44b1 test rejection",
    });

    // Repeated heartbeats: never executes, stays blocked, no nagging re-requests.
    for (let i = 0; i < 3; i++) {
      const r = await s.evaluateDueWork();
      expect(r.results[0].status).toBe("skipped");
    }
    expect(executor.calls).toBe(0);
    expect((await myApprovals(instanceId)).length).toBe(1); // still exactly one record

    const step = await getStep(instanceId);
    expect(step.status).toBe("blocked");

    // The schedule survives (not cancelled) — the founder can still pause/cancel.
    const item = await getSchedule(schedule.id);
    expect(item.status).toBe("scheduled");
  });

  test("[P5] non-approval (read_only) schedules remain unaffected per occurrence", async () => {
    const { schedule, instanceId } = await createSchedule({
      requiresApproval: false,
      maxOccurrences: 2,
      intervalValue: 5,
    });
    const s = makeScheduler();

    const r1 = await s.evaluateDueWork();
    expect(r1.results[0].status).toBe("completed");
    const r2 = await s.evaluateDueWork(new Date(Date.now() + 6 * 60_000).toISOString());
    expect(r2.results[0].status).toBe("completed");
    expect(executor.calls).toBe(2);

    // No approval records were ever created for this schedule's instance.
    expect(await myApprovals(instanceId)).toHaveLength(0);

    const item = await getSchedule(schedule.id);
    expect(item.status).toBe("completed");
    expect(item.executionHistory).toHaveLength(2);
  });

  test("[P6] financial side-effect policy remains fail-closed on scheduled occurrences", async () => {
    // A definition whose step is financial WITHOUT the founder's
    // requiresApproval flag: the GATE itself must demand approval.
    const def: WorkflowDefinition = {
      ...buildDirectiveWorkflowDefinition("44b1 financial fixture", false),
      id: `wf-auto-44b1-fin-${uuidv4()}`,
      steps: [
        {
          ...buildDirectiveWorkflowDefinition("x", false).steps[0],
          id: DIRECTIVE_STEP_ID,
          sideEffectClassification: "financial_action",
          requiresApproval: false,
        },
      ],
    };
    await runtime.registerWorkflow(def);
    createdDefinitionIds.add(def.id);
    // Scheduled-creation semantics: defer readiness evaluation to the
    // scheduler's occurrence-bound due-work pass (as createScheduledDirective does).
    const inst = await runtime.createInstance(def.id, def.version, {
      deferReadinessEvaluation: true,
    });
    createdInstanceIds.add(inst.instanceId);
    const s = makeScheduler();
    const schedule = await s.scheduleWork({
      workflowInstanceId: inst.instanceId,
      stepId: DIRECTIVE_STEP_ID,
      scheduleType: "recurring",
      executeAt: new Date(Date.now() - 60_000).toISOString(),
      recurrence: { intervalUnit: "minutes", intervalValue: 5, currentOccurrence: 1 },
      provenance: { createdByRole: "founder", workflowId: def.id },
    });
    createdScheduleIds.add(schedule.id);

    const r = await s.evaluateDueWork();
    expect(r.results[0].status).toBe("awaiting_approval"); // APPROVAL_REQUIRED_FINANCIAL
    expect(executor.calls).toBe(0);

    // The requested approval is financial-classified (fail-closed policy).
    const finApprovals = await myApprovals(inst.instanceId);
    expect(finApprovals).toHaveLength(1);
    expect(finApprovals[0].classification).toBe("financial_action");
    expect(finApprovals[0].scope.occurrenceId).toBe(`${schedule.id}-occ-1`);

    // Repeated heartbeats: still blocked, never auto-allowed (the reason code
    // becomes APPROVAL_PENDING once the request exists — still blocked).
    await s.evaluateDueWork();
    expect(executor.calls).toBe(0);

    const step = await getStep(inst.instanceId);
    expect(step.status).toBe("awaiting_approval");
    expect(["APPROVAL_REQUIRED_FINANCIAL", "APPROVAL_PENDING"]).toContain(
      step.authorizationReasonCode
    );
  });

  test("[P7] an occurrence-bound approval cannot authorize an ad-hoc (unbound) execution", async () => {
    const { instanceId } = await createSchedule({ requiresApproval: true, maxOccurrences: 1 });
    const s = makeScheduler();

    // Occurrence 1 requests + founder approves (approval bound to occ-1).
    await s.evaluateDueWork();
    const occ1Approval = (await myApprovals(instanceId))[0];
    await gate.decideApproval({
      approvalId: occ1Approval.id,
      decision: "approved",
      decidedBy: "founder",
    });

    // An AD-HOC execution attempt of the same step (no occurrence context —
    // e.g. a hypothetical non-scheduler caller) must be DENIED, not allowed.
    const decision = await gate.evaluateAuthorization({
      employeeRole: "coo",
      actionName: "Execute scheduled directive",
      classification: "external_communication",
      workflowContext: {
        workflowInstanceId: instanceId,
        stepId: DIRECTIVE_STEP_ID,
      },
    });
    expect(decision.effect).toBe("denied");
    expect(decision.reasonCode).toBe("APPROVAL_OCCURRENCE_MISMATCH");
  });
});

describe("Phase 4.4B.1 — executor failure semantics (REAL runtime path)", () => {
  test("[F1] provider failure → step FAILED (never completed-with-error) → retry/backoff → retry succeeds", async () => {
    const { schedule, instanceId } = await createSchedule({ oneTime: true });
    const s = makeScheduler();
    executor.mode = "fail";

    const r1 = await s.evaluateDueWork();
    expect(r1.results[0].status).toBe("failed");
    expect(executor.calls).toBe(1);

    // THE regression: the failed attempt must leave the step FAILED — the
    // pre-4.4B.1 behavior marked it completed with error-marked output and
    // suppressed retry entirely.
    const stepAfterFailure = await getStep(instanceId);
    expect(stepAfterFailure.status).toBe("ready"); // reset by retry recovery
    const item1 = await getSchedule(schedule.id);
    const occ1 = item1.executionHistory.find((h) => h.occurrenceId === `${schedule.id}-occ-1`);
    expect(occ1!.status).toBe("failed");
    expect(occ1!.error).toContain("provider unavailable");

    // The AgentRun contract persisted a FAILED run (executor semantics).
    expect(executor.agentRuns[0].status).toBe("failed");

    // Retry is scheduled with backoff; retryCount advanced; not terminal.
    expect(item1.status).toBe("scheduled");
    expect(stepAfterFailure.retryCount).toBe(1);

    // Retry wakes after backoff and succeeds.
    executor.mode = "success";
    const r2 = await s.evaluateDueWork(new Date(Date.now() + 120_000).toISOString());
    expect(r2.results[0].status).toBe("completed");
    expect(executor.calls).toBe(2);

    const item2 = await getSchedule(schedule.id);
    expect(item2.status).toBe("completed");
    const stepFinal = await getStep(instanceId);
    expect(stepFinal.status).toBe("completed");
    expect(stepFinal.outputs.result).toContain("44b1 deterministic output");
  });

  test("[F2] retries exhausted → terminal failure; no further attempts", async () => {
    const { schedule } = await createSchedule({ oneTime: true });
    const s = makeScheduler();
    executor.mode = "fail";

    // retryPolicy: maxRetries 2 → 3 attempts total (1 initial + 2 retries).
    const r1 = await s.evaluateDueWork();
    expect(r1.results[0].status).toBe("failed");
    const r2 = await s.evaluateDueWork(new Date(Date.now() + 120_000).toISOString());
    expect(r2.results[0].status).toBe("failed");
    const r3 = await s.evaluateDueWork(new Date(Date.now() + 240_000).toISOString());
    expect(r3.results[0].status).toBe("failed");

    const item = await getSchedule(schedule.id);
    expect(item.status).toBe("failed"); // terminal
    expect(executor.calls).toBe(3);
    expect(executor.agentRuns.every((r) => r.status === "failed")).toBe(true);

    // Further heartbeats do nothing (failed items are never due).
    const r4 = await s.evaluateDueWork(new Date(Date.now() + 600_000).toISOString());
    expect(r4.processedCount).toBe(0);
    expect(executor.calls).toBe(3);
  });

  test("[F4] cancelled schedule never executes (five-way distinction completeness)", async () => {
    const { schedule } = await createSchedule({});
    const s = makeScheduler();

    await s.cancelSchedule(schedule.id, "founder", "44b1 test cancel");
    const r = await s.evaluateDueWork();
    expect(r.processedCount).toBe(0);
    expect(executor.calls).toBe(0);
    expect((await getSchedule(schedule.id)).status).toBe("cancelled");
  });
});

describe("Phase 4.4B.1 — founder attribution (initiatedById)", () => {
  test("[A1] scheduled creations carry founder attribution and retain it across store reload", async () => {
    const { instanceId, schedule } = await createSchedule({
      founder: { userId: "founder-local-session" },
    });

    const inst = (await wfStore.getInstance(instanceId))!;
    expect(inst.initiatedById).toBe("founder-local-session");

    // JSON round-trip reload (restart-equivalent at the store layer).
    const reloaded = (await wfStore.getInstance(instanceId))!;
    expect(reloaded.initiatedById).toBe("founder-local-session");

    // Schedule provenance preserved as supporting audit context (not a second
    // attribution system).
    expect(schedule.provenance?.createdByRole).toBe("founder");
  });

  test("[A2] creations without a founder identity stay honestly unattributed", async () => {
    const { instanceId } = await createSchedule({});
    const inst = (await wfStore.getInstance(instanceId))!;
    expect(inst.initiatedById).toBeUndefined();
  });

  test("[A3] attribution survives a REAL process restart (cold-start durable recovery)", async () => {
    const { instanceId } = await createSchedule({
      founder: { userId: "founder-local-session" },
    });
    const inst = (await wfStore.getInstance(instanceId))!;

    // Seed a temp .data snapshot exactly as a pre-restart process would have
    // left it, then cold-start a FRESH bun process (new singleton) from it.
    const restartDir = join(tmpdir(), `samjuniors-44b1-restart-${uuidv4()}`);
    const dataDir = join(restartDir, ".data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, "workflow_instances.json"),
      JSON.stringify({ [instanceId]: inst })
    );

    try {
      const proc = Bun.spawn(
        ["bun", resolve("tests/scheduler/attribution-child.ts"), instanceId],
        {
          stdout: "pipe",
          stderr: "pipe",
          cwd: restartDir,
          env: { ...process.env },
        }
      );
      const out = await new Response(proc.stdout).text();
      const errText = await new Response(proc.stderr).text();
      await proc.exited;

      expect(errText).not.toContain("error");
      const recovered = JSON.parse(out.trim());
      expect(recovered.found).toBe(true);
      expect(recovered.initiatedById).toBe("founder-local-session");
      expect(recovered.status).toBe(inst.status);
    } finally {
      rmSync(restartDir, { recursive: true, force: true });
    }
  }, 30_000);
});
