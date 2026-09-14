/**
 * PHASE 4.4B — AUTOMATION CREATION + LIFECYCLE BEHAVIOR TESTS.
 *
 * Exercises the REAL WorkflowScheduler, the REAL ScheduledWorkStore and the
 * REAL directive-schedule factory with a RUNTIME-REALISTIC double. The 4.4A
 * suite used a permissive runtime fake that never derived instance status —
 * which masked two real defects these tests now pin:
 *
 *   D1 — a completed/failed parent instance made the next heartbeat CANCEL
 *        recurring schedules and retry wakes (recurrence/retry were broken
 *        with the real runtime). Fixed by sanctioned reopen transitions.
 *   D2 — a founder approval (via the gate) never flipped step.approvalState,
 *        so approval-required scheduled work stayed blocked forever. Fixed in
 *        runtime.evaluateReadiness (proven here with the REAL runtime + REAL
 *        gate in [D2]).
 *
 * Proves the full founder lifecycle:
 *   [L1] founder creates schedule (definition + instance + persisted item)
 *   [L2] heartbeat discovers the due schedule and executes it once
 *   [L3] repeated heartbeat does not duplicate the execution
 *   [L4] recurring schedule advances AND the parent instance is reopened (D1)
 *   [L5] pause prevents execution; resume restores it
 *   [L6] cancellation prevents future execution
 *   [L7] approval-required work stays blocked until the founder approves,
 *        then executes exactly once (D2 path through the scheduler)
 *   [L8] failed execution follows retry/backoff with real-runtime semantics
 *        (step reset + instance reopen + retryCount advance)
 *   [R1] persisted schedule survives a simulated process restart (cold-start
 *        recovery from the authoritative database)
 *   [D2] REAL runtime + REAL gate: an approved gate record unblocks a
 *        requiresApproval step on the next evaluateReadiness pass
 */
import "./env-setup";
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { WorkflowScheduler } from "../../src/lib/server/workflow/scheduler";
import { InMemoryScheduledWorkStore } from "../../src/lib/server/workflow/scheduler-store";
import { InMemoryLeaseManager } from "../../src/lib/server/coordination/lease-manager";
import { WorkflowRuntime } from "../../src/lib/server/workflow/runtime";
import {
  createScheduledDirective,
  validateDirectiveSchedule,
  DirectiveScheduleValidationError,
  buildDirectiveWorkflowDefinition,
} from "../../src/lib/server/workflow/directive-schedule";
import { validateStepTransition } from "../../src/lib/server/workflow/state-machine";
import { PrismaClient } from "@prisma/client";
import type { InMemoryWorkflowStore } from "../../src/lib/server/workflow/store";
import type { WorkflowRuntime as RuntimeType } from "../../src/lib/server/workflow/runtime";
import type {
  WorkflowDefinition,
  WorkflowInstanceState,
  WorkflowStepState,
  WorkflowStepStatus,
} from "../../src/types/workflow";
import type { ScheduledWorkItem } from "../../src/types/scheduling";
import { v4 as uuidv4 } from "uuid";

// Combined bun-test runs share ONE process: purge exactly this suite's
// artifacts from the real DB via a fresh client (no-op when the shared client
// already used the throwaway copy).
const ENV_TEXT = await Bun.file(".env").text();
const REAL_DB_URL = ENV_TEXT.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim() ?? "";

async function purgeRealDbArtifacts() {
  if (!REAL_DB_URL) return;
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = REAL_DB_URL;
  try {
    const db = new PrismaClient();
    await db.scheduledWorkItem.deleteMany({ where: { workflowInstanceId: { startsWith: "inst-44b-" } } }).catch(() => {});
    await db.workflowInstance.deleteMany({ where: { id: { startsWith: "inst-44b-" } } }).catch(() => {});
    await db.workflowDefinition.deleteMany({ where: { id: { startsWith: "wf-auto-44b-" } } }).catch(() => {});
    await db.approvalRecord.deleteMany({ where: { workflowInstanceId: { startsWith: "inst-44b-" } } }).catch(() => {});
    await db.$disconnect().catch(() => {});
  } finally {
    process.env.DATABASE_URL = saved;
  }
}

afterAll(async () => {
  await purgeRealDbArtifacts();
});

// One-time: the env copy snapshots the real dev DB — wipe any pre-existing
// scheduled_work_items rows IN THE COPY so recovery-based assertions stay
// deterministic no matter what the live dev database contains.
{
  const db = new PrismaClient();
  await db.scheduledWorkItem.deleteMany({}).catch(() => {});
  await db.$disconnect().catch(() => {});
}

/* ------------------------------------------------------------- workflow store */

/** Map-backed workflow store (never touches DurableFileStore / Prisma). */
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
}

/* ------------------------------------------------------- gate double (D2-aware) */

type FakeDecision = {
  effect: "allowed" | "approval_required" | "denied";
  approvalId?: string;
  approvalStatus?: string;
  reason?: string;
};

/** Mirrors the REAL gate's contract for the four methods the runtime calls. */
class FakeGate {
  public decision: FakeDecision = { effect: "allowed" };
  public approvals = new Map<string, any>();

  async evaluateAuthorization(): Promise<any> {
    return {
      effect: this.decision.effect,
      reason: this.decision.reason ?? `fake gate: ${this.decision.effect}`,
      approvalId: this.decision.approvalId,
      approvalStatus: this.decision.approvalStatus,
      evaluatedAt: new Date().toISOString(),
      evaluator: "central_side_effect_gate",
    };
  }
  async requestApproval(params: any): Promise<any> {
    const id = `appr-fake-${this.approvals.size + 1}`;
    const rec = { id, decision: "pending", scope: { scopeType: "step", ...params.scope }, ...params };
    this.approvals.set(id, rec);
    return rec;
  }
  async decideApproval(params: any): Promise<any> {
    const rec = this.approvals.get(params.approvalId);
    if (rec) rec.decision = params.decision;
    return rec;
  }
}

/* --------------------------------------------------- RUNTIME-REALISTIC double */

/**
 * Mirrors the REAL WorkflowRuntime's observable semantics that the scheduler
 * depends on — including instance-status derivation (evaluateInstanceStatus),
 * the ready-claim requirement, and the 4.4B evaluateReadiness fix (D2). The
 * 4.4A fake omitted instance-status derivation, which is exactly what masked
 * defect D1. REAL state-machine validators are reused so this double cannot
 * drift into illegal transitions.
 */
class RealisticRuntime {
  public executions = 0;
  public executeOutcome: "completed" | "failed" = "completed";
  public gate = new FakeGate();

  constructor(private store: FakeWorkflowStore) {}

  async registerWorkflow(def: WorkflowDefinition): Promise<void> {
    await this.store.saveDefinition(def);
  }

  async createInstance(workflowId: string, version?: string): Promise<WorkflowInstanceState> {
    const def = (await this.store.getDefinition(workflowId, version))!;
    const now = new Date().toISOString();
    const stepStates: Record<string, WorkflowStepState> = {};
    for (const s of def.steps) {
      stepStates[s.id] = {
        stepId: s.id,
        status: "pending",
        assignedRole: s.assignedRole,
        skill: s.skill,
        outputs: {},
        evidenceReferences: [],
        retryCount: 0,
        sideEffectClassification: s.sideEffectClassification,
      };
    }
    const inst: WorkflowInstanceState = {
      instanceId: `inst-44b-${uuidv4()}`,
      workflowId: def.id,
      version: def.version,
      objective: def.objective,
      status: "pending",
      stepStates,
      createdAt: now,
      updatedAt: now,
      outputs: {},
      evidenceReferences: [],
    };
    await this.store.saveInstance(inst);
    await this.evaluateReadiness(inst.instanceId);
    return (await this.store.getInstance(inst.instanceId))!;
  }

  /** Mirrors runtime.evaluateReadiness INCLUDING the 4.4B D2 fix. */
  async evaluateReadiness(instanceId: string): Promise<void> {
    const inst = await this.store.getInstance(instanceId);
    if (!inst) return;
    const def = await this.store.getDefinition(inst.workflowId, inst.version);
    if (!def) return;

    let changed = false;
    for (const stepDef of def.steps) {
      const st = inst.stepStates[stepDef.id];
      if (!["pending", "blocked", "awaiting_approval", "waiting"].includes(st.status)) continue;

      const depsMet = stepDef.dependencies.every((d) => inst.stepStates[d]?.status === "completed");
      if (!depsMet) continue;

      const classification = stepDef.sideEffectClassification || (stepDef.requiresApproval ? "external_communication" : "read_only");
      const decision = await this.gate.evaluateAuthorization();

      if (decision.effect === "denied") {
        st.status = "blocked";
        st.blockedReason = decision.reason;
        changed = true;
      } else if (decision.effect === "approval_required") {
        if (st.approvalState !== "approved") {
          const rec = await this.gate.requestApproval({
            actionName: stepDef.name,
            classification,
            workflowInstanceId: inst.instanceId,
            stepId: stepDef.id,
            employeeRole: stepDef.assignedRole,
          });
          st.approvalId = rec.id;
          st.status = "awaiting_approval";
          st.blockedReason = decision.reason;
          changed = true;
        } else {
          st.status = "ready";
          changed = true;
        }
      } else {
        // allowed — with the Phase 4.4B fix (D2)
        const allowedByFounderApproval = !!decision.approvalId && decision.approvalStatus === "approved";
        if (stepDef.requiresApproval && st.approvalState !== "approved" && !allowedByFounderApproval) {
          st.status = "awaiting_approval";
          changed = true;
        } else {
          st.status = "ready";
          st.approvalState = "approved";
          if (decision.approvalId) st.approvalId = decision.approvalId;
          st.blockedReason = undefined;
          changed = true;
        }
      }
    }

    if (changed) {
      inst.updatedAt = new Date().toISOString();
      await this.store.saveInstance(inst);
    }
  }

  /** Mirrors runtime.transitionStep (validated) + instance re-evaluation. */
  async transitionStep(instanceId: string, stepId: string, status: WorkflowStepStatus): Promise<void> {
    const inst = (await this.store.getInstance(instanceId))!;
    const st = inst.stepStates[stepId];
    if (!st) return;
    if (st.status === status) return;
    validateStepTransition(st.status, status);
    st.status = status;
    this.deriveInstanceStatus(inst);
    inst.updatedAt = new Date().toISOString();
    await this.store.saveInstance(inst);
    await this.evaluateReadiness(instanceId);
  }

  /** Mirrors runtime.evaluateInstanceStatus EXACTLY. */
  private deriveInstanceStatus(inst: WorkflowInstanceState): void {
    const states = Object.values(inst.stepStates);
    let ns = inst.status;
    if (states.every((s) => s.status === "completed")) ns = "completed";
    else if (states.some((s) => s.status === "failed")) ns = "failed";
    else if (states.some((s) => s.status === "cancelled")) ns = "cancelled";
    else if (states.some((s) => s.status === "running")) ns = "running";
    else if (inst.status === "pending" && states.some((s) => s.status === "ready")) ns = "running";
    inst.status = ns;
  }

  /** Mirrors runtime.executeReadyStep: ready-claim, gate re-check, outcome. */
  async executeReadyStep(instanceId: string, stepId: string, workerId: string = "worker-default"): Promise<void> {
    const inst = (await this.store.getInstance(instanceId))!;
    const st = inst.stepStates[stepId];
    if (!st) throw new Error(`Step not found: ${stepId}`);
    if (st.status !== "ready") {
      throw new Error(`Step is not ready for execution. Current status: ${st.status}`);
    }

    const decision = await this.gate.evaluateAuthorization();
    if (decision.effect === "denied") {
      await this.transitionStep(instanceId, stepId, "blocked");
      throw new Error(`Side-effect execution prevented by authorization gate: ${decision.reason}`);
    }
    if (decision.effect === "approval_required") {
      await this.transitionStep(instanceId, stepId, "awaiting_approval");
      throw new Error(`Side-effect execution prevented by authorization gate: ${decision.reason}`);
    }

    // claim
    st.status = "running";
    st.claimedBy = workerId;
    st.claimedAt = new Date().toISOString();
    if (inst.status === "pending" || inst.status === "waiting") inst.status = "running";

    this.executions += 1;

    if (this.executeOutcome === "completed") {
      st.status = "completed";
      st.completedAt = new Date().toISOString();
      st.outputs = { result: "fake-ok" };
      st.claimedBy = undefined;
    } else {
      st.status = "failed";
      st.error = "fake-execution-failure";
      st.completedAt = new Date().toISOString();
      st.claimedBy = undefined;
    }
    this.deriveInstanceStatus(inst);
    inst.updatedAt = new Date().toISOString();
    await this.store.saveInstance(inst);
    await this.evaluateReadiness(instanceId);
  }

  getGate(): FakeGate {
    return this.gate;
  }
}

/* ------------------------------------------------------------------ fixtures */

const schedStore = InMemoryScheduledWorkStore.getInstance();
const leaseManager = InMemoryLeaseManager.getInstance();
let wfStore: FakeWorkflowStore;
let runtime: RealisticRuntime;

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

/** Creates a schedule through the REAL factory (real scheduler + double runtime). */
async function createSchedule(opts: {
  directive?: string;
  intervalValue?: number;
  maxOccurrences?: number;
  requiresApproval?: boolean;
  dueInMs?: number;
}): Promise<{ schedule: ScheduledWorkItem; instanceId: string; definitionId: string }> {
  const result = await createScheduledDirective(
    {
      directive: opts.directive ?? "44b fixture: research our competitors and recommend pricing",
      scheduleType: "recurring",
      intervalUnit: "minutes",
      intervalValue: opts.intervalValue ?? 5,
      maxOccurrences: opts.maxOccurrences,
      executeAt: new Date(Date.now() - (opts.dueInMs ?? 60_000)).toISOString(),
      requiresApproval: opts.requiresApproval,
    },
    { runtime: runtime as unknown as WorkflowRuntime, scheduler: makeScheduler() }
  );
  return {
    schedule: result.schedule,
    instanceId: result.workflowInstanceId,
    definitionId: result.definition.id,
  };
}

beforeEach(async () => {
  schedStore.clear();
  leaseManager.clear();
  wfStore = new FakeWorkflowStore();
  runtime = new RealisticRuntime(wfStore);
  // The throwaway DB copy persists best-effort saves from earlier tests in
  // this suite. Purge OUR fixtures per test so the copy is deterministic for
  // [R1]'s restart-simulation child (which recovers whatever rows exist).
  try {
    const db = new PrismaClient();
    await db.scheduledWorkItem.deleteMany({ where: { workflowInstanceId: { startsWith: "inst-44b-" } } });
    await db.$disconnect();
  } catch {
    /* best-effort — the copy may be unreachable */
  }
});

/* ------------------------------------------------------------------- tests */

describe("Phase 4.4B — validation (fail-closed)", () => {
  test("invalid recurrence is rejected", () => {
    expect(() => validateDirectiveSchedule({ directive: "x", scheduleType: "recurring", intervalUnit: "fortnights" as any })).toThrow(DirectiveScheduleValidationError);
    expect(() => validateDirectiveSchedule({ directive: "x", scheduleType: "recurring", intervalValue: 0 })).toThrow(DirectiveScheduleValidationError);
    expect(() => validateDirectiveSchedule({ directive: "x", scheduleType: "recurring", intervalValue: 1.5 })).toThrow(DirectiveScheduleValidationError);
    expect(() => validateDirectiveSchedule({ directive: "x", scheduleType: "one_time" })).toThrow(/executeAt/i);
    expect(() => validateDirectiveSchedule({ directive: "x", scheduleType: "one_time", executeAt: "not-a-date" })).toThrow(/valid ISO/i);
    expect(() => validateDirectiveSchedule({ directive: "x", scheduleType: "recurring", maxOccurrences: 0 })).toThrow(/maxOccurrences/i);
    expect(() => validateDirectiveSchedule({ directive: "x", scheduleType: "banana" as any })).toThrow(/scheduleType/i);
    const ok = validateDirectiveSchedule({ directive: "x", scheduleType: "recurring", intervalUnit: "weeks", intervalValue: 1 });
    expect(ok.scheduleType).toBe("recurring");
    expect(ok.recurrence?.intervalUnit).toBe("weeks");
  });

  test("directive workflow definition carries governance requirements", () => {
    const def = buildDirectiveWorkflowDefinition("Weekly competitor research", true);
    expect(def.steps).toHaveLength(1);
    expect(def.steps[0].requiresApproval).toBe(true);
    expect(def.steps[0].sideEffectClassification).toBe("external_communication");
    expect(def.steps[0].retryPolicy.maxRetries).toBeGreaterThan(0);
    const def2 = buildDirectiveWorkflowDefinition("Weekly competitor research", false);
    expect(def2.steps[0].sideEffectClassification).toBe("read_only");
    expect(def2.steps[0].requiresApproval).toBe(false);
  });
});

describe("Phase 4.4B — founder lifecycle", () => {
  test("[L1] founder creates schedule: definition + instance + persisted item with recurrence + provenance", async () => {
    const { schedule, instanceId, definitionId } = await createSchedule({ maxOccurrences: 3 });

    expect(schedule.id).toMatch(/^sched-/);
    expect(schedule.status).toBe("scheduled");
    expect(schedule.scheduleType).toBe("recurring");
    expect(schedule.recurrence?.intervalUnit).toBe("minutes");
    expect(schedule.recurrence?.currentOccurrence).toBe(1);
    expect(schedule.recurrence?.maxOccurrences).toBe(3);
    expect(schedule.provenance?.createdByRole).toBe("founder");

    const def = await wfStore.getDefinition(definitionId);
    expect(def!.objective).toContain("competitors");
    const inst = await wfStore.getInstance(instanceId);
    // scheduleWork parks the step in 'waiting', but the REAL transitionStep
    // re-runs evaluateReadiness which re-readies an authorized step — so the
    // honest persisted state is 'ready'. Execution remains gated by the
    // schedule's executeAt: nothing executes a ready step outside the
    // scheduler's due-work evaluation.
    expect(["waiting", "ready"]).toContain(inst!.stepStates["step-objective"].status);
    expect(inst!.status).toBe("pending");
  });

  test("[L2] heartbeat discovers the due schedule and executes it once", async () => {
    const { schedule } = await createSchedule({ maxOccurrences: 1 });
    const s = makeScheduler();
    const result = await s.evaluateDueWork();

    expect(result.processedCount).toBe(1);
    expect(result.results[0]).toMatchObject({ scheduleId: schedule.id, status: "completed" });
    expect(runtime.executions).toBe(1);

    const after = (await schedStore.get(schedule.id))!;
    expect(after.status).toBe("completed"); // maxOccurrences 1 → terminal after first occurrence
    const step = (await wfStore.getInstance(after.workflowInstanceId))!.stepStates["step-objective"];
    expect(step.status).toBe("completed");
  });

  test("[L3] repeated heartbeat does not duplicate the execution", async () => {
    await createSchedule({ maxOccurrences: 1 });
    const s = makeScheduler();
    await s.evaluateDueWork();
    const second = await s.evaluateDueWork();

    expect(second.processedCount).toBe(0);
    expect(runtime.executions).toBe(1);
  });

  test("[L4] recurring schedule advances AND the parent instance is reopened for the next occurrence (D1)", async () => {
    const { schedule, instanceId } = await createSchedule({ intervalValue: 5, maxOccurrences: 2 });
    const s = makeScheduler();

    const r1 = await s.evaluateDueWork();
    expect(r1.results[0].status).toBe("completed");

    // D1 proof: with the REAL runtime the single-step instance reaches
    // terminal 'completed' here; the scheduler must REOPEN it so the next
    // heartbeat's parent-terminal check does not cancel the schedule.
    const mid = (await wfStore.getInstance(instanceId))!;
    expect(mid.status).toBe("running");

    const after1 = (await schedStore.get(schedule.id))!;
    expect(after1.status).toBe("scheduled");
    expect(after1.recurrence!.currentOccurrence).toBe(2);

    // Second occurrence (5 minutes later) still executes — recurrence intact.
    const r2 = await s.evaluateDueWork(new Date(Date.now() + 6 * 60_000).toISOString());
    expect(r2.results[0].status).toBe("completed");
    expect(runtime.executions).toBe(2);

    const after2 = (await schedStore.get(schedule.id))!;
    expect(after2.status).toBe("completed"); // maxOccurrences 2 reached
    expect(after2.executionHistory).toHaveLength(2);
  });

  test("[L5] pause prevents execution; resume restores it", async () => {
    const { schedule } = await createSchedule({});
    const s = makeScheduler();

    const paused = await s.pauseSchedule(schedule.id, "founder", "test pause");
    expect(paused.status).toBe("paused");
    expect(paused.pausedState?.pausedBy).toBe("founder");

    const beat = await s.evaluateDueWork();
    expect(beat.processedCount).toBe(0); // paused items are never due
    expect(runtime.executions).toBe(0);

    const resumed = await s.resumeSchedule(schedule.id, "founder");
    expect(resumed.status).toBe("scheduled");

    const beat2 = await s.evaluateDueWork();
    expect(beat2.results[0].status).toBe("completed");
    expect(runtime.executions).toBe(1);
  });

  test("[L6] cancellation prevents future execution", async () => {
    const { schedule } = await createSchedule({});
    const s = makeScheduler();

    const cancelled = await s.cancelSchedule(schedule.id, "founder", "test cancel");
    expect(cancelled.status).toBe("cancelled");

    const beat = await s.evaluateDueWork();
    expect(beat.processedCount).toBe(0);
    expect(runtime.executions).toBe(0);

    // A cancelled schedule cannot be resumed (only paused items can).
    expect(s.resumeSchedule(schedule.id, "founder")).rejects.toThrow(/Cannot resume/i);
  });

  test("[L7] approval-required work stays blocked until founder approval, then executes exactly once (D2 path)", async () => {
    const { schedule } = await createSchedule({ requiresApproval: true, maxOccurrences: 1 });
    const s = makeScheduler();

    // Gate demands approval → work must NOT execute.
    runtime.gate.decision = { effect: "approval_required", reason: "external communication requires founder approval" };
    const r1 = await s.evaluateDueWork();
    expect(r1.results[0].status).toBe("awaiting_approval");
    expect(runtime.executions).toBe(0);

    const afterBlock = (await schedStore.get(schedule.id))!;
    expect(afterBlock.executionHistory.at(-1)!.status).toBe("awaiting_approval");

    // Founder approves through the gate (mirrors /api/workflow/approvals →
    // the gate now answers 'allowed' with the approved record attached).
    runtime.gate.decision = { effect: "allowed", approvalId: "appr-fake-1", approvalStatus: "approved" };

    const r2 = await s.evaluateDueWork();
    expect(r2.results[0].status).toBe("completed");
    expect(runtime.executions).toBe(1);

    const r3 = await s.evaluateDueWork();
    expect(r3.processedCount).toBe(0); // never twice
  });

  test("[L8] failed execution follows retry/backoff with real-runtime semantics (step reset + instance reopen + retryCount)", async () => {
    const { schedule } = await createSchedule({ maxOccurrences: 1 });
    const s = makeScheduler();
    runtime.executeOutcome = "failed";

    const r1 = await s.evaluateDueWork();
    expect(r1.results[0].status).toBe("failed");
    expect(runtime.executions).toBe(1);

    const after1 = (await schedStore.get(schedule.id))!;
    expect(after1.status).toBe("scheduled"); // retry scheduled (retryPolicy maxRetries=2)

    // Real-runtime failure semantics: step 'failed' + instance 'failed' at
    // this point — the scheduler's recovery must have reset BOTH so the retry
    // wake is not cancelled and the step is executable again.
    const inst1 = (await wfStore.getInstance(after1.workflowInstanceId))!;
    expect(inst1.status).toBe("running");
    expect(inst1.stepStates["step-objective"].status).toBe("ready");
    expect(inst1.stepStates["step-objective"].retryCount).toBe(1);

    // Retry wakes after backoff and succeeds.
    runtime.executeOutcome = "completed";
    const r2 = await s.evaluateDueWork(new Date(Date.now() + 120_000).toISOString());
    expect(r2.results[0].status).toBe("completed");
    expect(runtime.executions).toBe(2);

    const after2 = (await schedStore.get(schedule.id))!;
    expect(after2.status).toBe("completed");
  });
});

describe("Phase 4.4B — restart survival (dev/local mode)", () => {
  test("[R1] persisted schedule survives a real process restart (cold-start recovery)", async () => {
    const { schedule } = await createSchedule({});
    // The schedule was persisted best-effort to the isolated DB copy by save().
    // Simulate a GENUINE restart: a fresh bun child process constructs a
    // brand-new store singleton (empty map, recovery armed) and lists due work.
    const proc = Bun.spawn(["bun", "tests/scheduler/restart-child.ts"], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;

    const recovered = JSON.parse(out.trim()) as Array<{
      id: string;
      status: string;
      workflowInstanceId: string;
      intervalUnit?: string;
      currentOccurrence?: number;
    }>;
    const found = recovered.find((i) => i.id === schedule.id);
    expect(found).toBeDefined();
    expect(found!.status).toBe("scheduled");
    expect(found!.intervalUnit).toBe("minutes");
    expect(found!.currentOccurrence).toBe(1);
  }, 30_000);
});

describe("Phase 4.4B — REAL runtime + REAL gate (D2 integration)", () => {
  test("[D2] an approved gate record unblocks a requiresApproval step on the next evaluateReadiness pass", async () => {
    const store = new FakeWorkflowStore();
    const realRuntime = new WorkflowRuntime(store as any);

    const def = buildDirectiveWorkflowDefinition("44b real-runtime approval fixture", true);
    await realRuntime.registerWorkflow(def);
    const inst = await realRuntime.createInstance(def.id, def.version);

    // Before the 4.4B fix this was permanently 'awaiting_approval'.
    const step = inst.stepStates["step-objective"];
    expect(step.status).toBe("awaiting_approval");
    expect(step.approvalId).toBeDefined();

    // Founder approves through the REAL gate.
    const gate = realRuntime.getGate();
    await gate.decideApproval({
      approvalId: step.approvalId!,
      decision: "approved",
      decidedBy: "founder",
      reason: "44b test approval",
    });

    await realRuntime.evaluateReadiness(inst.instanceId);
    const after = (await store.getInstance(inst.instanceId))!;
    expect(after.stepStates["step-objective"].status).toBe("ready");
    expect(after.stepStates["step-objective"].approvalState).toBe("approved");
  });
});
