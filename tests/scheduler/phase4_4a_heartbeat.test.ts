/**
 * PHASE 4.4A — AUTOMATION HEARTBEAT / SCHEDULER WAKE-UP BEHAVIOR TESTS.
 *
 * Exercises the REAL WorkflowScheduler.evaluateDueWork (the exact code the
 * heartbeat endpoint invokes) with the REAL InMemoryScheduledWorkStore and the
 * REAL InMemoryLeaseManager. Only the workflow store and runtime are faked
 * (the scheduler's constructor already accepts these as injectable deps) so
 * no test state ever touches durable dev storage.
 *
 * Proves:
 *   [1] due schedule executes exactly once
 *   [2] repeated heartbeat does not duplicate the occurrence
 *   [3] concurrent heartbeat calls remain safe (lease + occurrence idempotency)
 *   [4] failed execution follows the existing retry/backoff policy
 *   [5] recurring schedule advances correctly (and completes at max occurrences)
 *   [6] approval-required work stays blocked until Founder approval
 *   [7] side-effect authorization is re-evaluated when work actually wakes
 *   [8] cancelled (paused) schedules never execute
 *   [9] heartbeat records persist honest evaluation outcomes
 */
import "./env-setup";
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { WorkflowScheduler } from "../../src/lib/server/workflow/scheduler";
import { InMemoryScheduledWorkStore } from "../../src/lib/server/workflow/scheduler-store";
import { InMemoryLeaseManager } from "../../src/lib/server/coordination/lease-manager";
import { PrismaClient } from "@prisma/client";
import type { InMemoryWorkflowStore } from "../../src/lib/server/workflow/store";
import type { WorkflowRuntime } from "../../src/lib/server/workflow/runtime";
import type {
  WorkflowDefinition,
  WorkflowInstanceState,
  WorkflowStepState,
  WorkflowStepDefinition,
} from "../../src/types/workflow";
import type { ScheduledWorkItem } from "../../src/types/scheduling";

// Combined bun-test runs share ONE process: if another suite imported prisma
// first, the shared client caches the REAL database URL and best-effort writes
// from this suite would land there. afterAll purges exactly this suite's
// artifacts (fixture workflowInstanceId) from the real DB via a fresh client —
// a no-op when the shared client used the throwaway URL.
const ENV_TEXT = await Bun.file(".env").text();
const REAL_DB_URL = ENV_TEXT.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim() ?? "";

async function purgeRealDbArtifacts() {
  if (!REAL_DB_URL) return;
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = REAL_DB_URL;
  try {
    const db = new PrismaClient();
    await db.scheduledWorkItem.deleteMany({ where: { workflowInstanceId: "inst-test-1" } }).catch(() => {});
    await db.schedulerHeartbeat.deleteMany({ where: { id: "hb-test-1" } }).catch(() => {});
    await db.$disconnect().catch(() => {});
  } finally {
    process.env.DATABASE_URL = saved;
  }
}

afterAll(async () => {
  await purgeRealDbArtifacts();
});

// One-time: the env copy snapshots the real dev DB, and the LIVE heartbeat
// service legitimately accumulates scheduler_heartbeats rows over time. Once
// the copy carries ≥100 rows, [9]'s bounded-window (listHeartbeats(100))
// relative assertion saturates. Wipe the COPIED heartbeat table so the
// relative assertions stay deterministic regardless of live-service activity
// (the copy is throwaway; the real DB is never touched by this wipe).
{
  const db = new PrismaClient();
  await db.schedulerHeartbeat.deleteMany({}).catch(() => {});
  await db.$disconnect().catch(() => {});
}

/* ------------------------------------------------------------------ fakes */

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

/** Configurable runtime double — the scheduler calls exactly four methods. */
class FakeRuntime {
  public executions = 0;
  public gateEffect: "allowed" | "approval_required" | "denied" = "allowed";
  public nextReadiness: "ready" | "waiting" | "blocked" = "ready";
  public executeOutcome: "completed" | "failed" = "completed";
  public failSequence: Array<"completed" | "failed"> = [];
  public holdExecution = false;
  public releaseExecution: (() => void) | null = null;

  constructor(private store: FakeWorkflowStore) {}

  private persist(inst: WorkflowInstanceState) {
    this.store.instances.set(inst.instanceId, JSON.parse(JSON.stringify(inst)));
  }

  async transitionStep(instanceId: string, stepId: string, status: string): Promise<void> {
    const inst = this.store.instances.get(instanceId);
    if (!inst) return;
    inst.stepStates[stepId].status = status as WorkflowStepState["status"];
    this.persist(inst);
  }

  async evaluateReadiness(instanceId: string): Promise<void> {
    const inst = this.store.instances.get(instanceId);
    if (!inst) return;
    if (this.nextReadiness === "ready") {
      for (const s of Object.values(inst.stepStates)) {
        if (s.status === "waiting" || s.status === "pending") s.status = "ready";
      }
    }
    this.persist(inst);
  }

  async executeReadyStep(instanceId: string, stepId: string): Promise<void> {
    this.executions += 1;
    const inst = this.store.instances.get(instanceId);
    if (!inst) throw new Error("instance missing in fake store");
    if (this.holdExecution) {
      await new Promise<void>((resolve) => { this.releaseExecution = resolve; });
    }
    const outcome = this.failSequence.length ? this.failSequence.shift()! : this.executeOutcome;
    const step = inst.stepStates[stepId];
    if (outcome === "completed") {
      step.status = "completed";
      step.completedAt = new Date().toISOString();
      step.outputs = { result: "fake-ok" };
    } else {
      step.status = "failed";
      step.error = "fake-execution-failure";
      // retryCount is runtime-owned state (the scheduler trusts it): after the
      // Nth failed attempt it reports N-1 completed retries.
      step.retryCount = this.executions - 1;
    }
    this.persist(inst);
  }

  getGate() {
    return {
      evaluateAuthorization: async () => ({
        effect: this.gateEffect,
        reason: this.gateEffect === "allowed" ? undefined : `fake gate: ${this.gateEffect}`,
      }),
    };
  }
}

/* ------------------------------------------------------------------ fixtures */

function makeStepDef(overrides: Partial<WorkflowStepDefinition> = {}): WorkflowStepDefinition {
  return {
    id: "step-1",
    name: "Prepare weekly report",
    description: "Deterministic fixture step",
    assignedRole: "coo",
    skill: "build_execute",
    dependencies: [],
    inputReferences: [],
    outputReferences: ["report"],
    requiresApproval: false,
    retryPolicy: { maxRetries: 0, backoffMs: 1000 },
    ...overrides,
  };
}

function makeDef(step: WorkflowStepDefinition): WorkflowDefinition {
  return {
    id: "wf-test",
    name: "Test workflow",
    description: "Scheduler fixture workflow",
    objective: "Prove scheduler semantics",
    version: "1.0.0",
    steps: [step],
    dependencies: [],
    requiredApprovals: 0,
    allowedRoles: ["coo"],
    allowedSkills: ["build_execute"],
    expectedOutputs: ["report"],
  };
}

function makeInstance(store: FakeWorkflowStore, def: WorkflowDefinition): WorkflowInstanceState {
  const stepStates: Record<string, WorkflowStepState> = {};
  for (const s of def.steps) {
    stepStates[s.id] = {
      stepId: s.id,
      status: "ready",
      assignedRole: s.assignedRole,
      skill: s.skill,
      outputs: {},
      evidenceReferences: [],
      retryCount: 0,
    };
  }
  const inst: WorkflowInstanceState = {
    instanceId: "inst-test-1",
    workflowId: def.id,
    version: def.version,
    status: "running",
    objective: def.objective,
    stepStates,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    outputs: {},
    evidenceReferences: [],
  };
  store.instances.set(inst.instanceId, JSON.parse(JSON.stringify(inst)));
  return inst;
}

/* ------------------------------------------------------------------ harness */

const schedStore = InMemoryScheduledWorkStore.getInstance();
const leaseManager = InMemoryLeaseManager.getInstance();
let wfStore: FakeWorkflowStore;
let runtime: FakeRuntime;

function makeScheduler(workerId?: string): WorkflowScheduler {
  return new WorkflowScheduler(
    schedStore,
    wfStore as unknown as InMemoryWorkflowStore,
    runtime as unknown as WorkflowRuntime,
    leaseManager,
    workerId ?? `test-worker-${Math.random().toString(36).slice(2, 8)}`,
    30000
  );
}

async function scheduleDueItem(s: WorkflowScheduler, overrides: Record<string, unknown> = {}): Promise<ScheduledWorkItem> {
  return s.scheduleWork({
    workflowInstanceId: "inst-test-1",
    stepId: "step-1",
    scheduleType: "one_time_delay",
    executeAt: new Date(Date.now() - 60_000).toISOString(), // already due
    ...overrides,
  } as any);
}

beforeEach(() => {
  schedStore.clear();
  leaseManager.clear();
  wfStore = new FakeWorkflowStore();
  runtime = new FakeRuntime(wfStore);
  const step = makeStepDef();
  const def = makeDef(step);
  wfStore.saveDefinition(def);
  makeInstance(wfStore, def);
});

/* ------------------------------------------------------------------ tests */

describe("Phase 4.4A — scheduler heartbeat behavior (evaluateDueWork)", () => {
  test("[1] due schedule executes exactly once", async () => {
    const s = makeScheduler();
    await scheduleDueItem(s);
    const result = await s.evaluateDueWork();

    expect(result.processedCount).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe("completed");
    expect(runtime.executions).toBe(1);

    const item = await schedStore.get((await schedStore.list())[0].id);
    expect(item!.status).toBe("completed");
    expect(item!.executionHistory).toHaveLength(1);
    expect(item!.executionHistory[0].status).toBe("completed");
  });

  test("[2] repeated heartbeat does not duplicate the occurrence", async () => {
    const s = makeScheduler();
    await scheduleDueItem(s);
    await s.evaluateDueWork();

    const second = await s.evaluateDueWork();
    expect(second.processedCount).toBe(0); // completed item is no longer due
    expect(second.results).toHaveLength(0);
    expect(runtime.executions).toBe(1); // still exactly one execution
  });

  test("[3a] concurrent heartbeat calls remain safe — one executes, the other is lease-skipped", async () => {
    const s1 = makeScheduler("worker-concurrent-1");
    const s2 = makeScheduler("worker-concurrent-2");
    await scheduleDueItem(s1);

    const [r1, r2] = await Promise.all([s1.evaluateDueWork(), s2.evaluateDueWork()]);

    const statuses = [r1.results[0]?.status, r2.results[0]?.status].sort();
    expect(statuses).toEqual(["completed", "skipped"]);
    expect(runtime.executions).toBe(1); // exactly one real execution
    const item = (await schedStore.list())[0];
    expect(item.status).toBe("completed");
    expect(item.executionHistory).toHaveLength(1);
  });

  test("[3b] lease held mid-execution blocks a second heartbeat; after completion the occurrence stays single", async () => {
    const s1 = makeScheduler("worker-slow-1");
    const s2 = makeScheduler("worker-slow-2");
    runtime.holdExecution = true;
    await scheduleDueItem(s1);

    const p1 = s1.evaluateDueWork();
    // let s1 reach the in-flight execution before s2 starts
    await new Promise((r) => setTimeout(r, 25));
    const r2 = await s2.evaluateDueWork();

    expect(r2.processedCount).toBe(1);
    expect(r2.results[0].status).toBe("skipped"); // lease (or triggered-occurrence) guard
    expect(runtime.executions).toBe(1);

    runtime.releaseExecution!();
    const r1 = await p1;
    expect(r1.results[0].status).toBe("completed");

    const s3 = makeScheduler("worker-slow-3");
    const r3 = await s3.evaluateDueWork();
    expect(r3.processedCount).toBe(0); // nothing left
    expect(runtime.executions).toBe(1); // never doubled
  });

  test("[3c] occurrence idempotency alone (triggered record present) blocks re-execution", async () => {
    const s = makeScheduler();
    const item = await scheduleDueItem(s);
    // Simulate an in-flight occurrence from a crashed worker (record persisted, lease expired)
    item.executionHistory.push({
      occurrenceId: `${item.id}-occ-1`,
      occurrenceNumber: 1,
      triggeredAt: new Date().toISOString(),
      status: "triggered",
    });
    await schedStore.update(item);

    const result = await s.evaluateDueWork();
    expect(result.results[0].status).toBe("skipped");
    expect(runtime.executions).toBe(0);
  });

  test("[4] failed execution follows the existing retry/backoff policy, then fails terminally", async () => {
    const step = makeStepDef({ retryPolicy: { maxRetries: 1, backoffMs: 2000 } });
    const def = makeDef(step);
    wfStore.saveDefinition(def);
    makeInstance(wfStore, def);

    runtime.failSequence = ["failed", "failed"]; // both attempts fail

    const s = makeScheduler();
    const item = await scheduleDueItem(s);
    const originalExecuteAt = new Date(item.executeAt).getTime();

    const r1 = await s.evaluateDueWork();
    expect(r1.results[0].status).toBe("failed");
    expect(runtime.executions).toBe(1);

    const after1 = (await schedStore.get(item.id))!;
    expect(after1.status).toBe("scheduled"); // retry scheduled
    expect(new Date(after1.executeAt).getTime()).toBeGreaterThanOrEqual(originalExecuteAt + 2000 - 50);
    expect(after1.executionHistory[0].status).toBe("failed");

    // Second attempt (retry) — occurrence 2 after backoff window
    const r2 = await s.evaluateDueWork(new Date(Date.now() + 60_000).toISOString());
    expect(r2.results[0].status).toBe("failed");
    expect(runtime.executions).toBe(2);

    const after2 = (await schedStore.get(item.id))!;
    expect(after2.status).toBe("failed"); // retries exhausted → terminal
    expect(after2.executionHistory).toHaveLength(2);
  });

  test("[5] recurring schedule advances correctly and completes at max occurrences", async () => {
    const s = makeScheduler();
    const item = await scheduleDueItem(s, {
      scheduleType: "recurring",
      recurrence: { intervalUnit: "minutes", intervalValue: 5, maxOccurrences: 2 },
    });
    expect(item.recurrence!.currentOccurrence).toBe(1);

    // Occurrence 1
    const r1 = await s.evaluateDueWork();
    expect(r1.results[0].status).toBe("completed");
    const after1 = (await schedStore.get(item.id))!;
    expect(after1.status).toBe("scheduled");
    expect(after1.recurrence!.currentOccurrence).toBe(2);
    expect(new Date(after1.executeAt).getTime()).toBeGreaterThan(Date.now());

    // Occurrence 2 (due after the interval)
    const r2 = await s.evaluateDueWork(new Date(Date.now() + 6 * 60_000).toISOString());
    expect(r2.results[0].status).toBe("completed");
    const after2 = (await schedStore.get(item.id))!;
    expect(after2.status).toBe("completed"); // maxOccurrences reached
    expect(after2.executionHistory).toHaveLength(2);
    expect(runtime.executions).toBe(2);
  });

  test("[6] approval-required work stays blocked until Founder approval, then executes once", async () => {
    const step = makeStepDef({ requiresApproval: true, sideEffectClassification: "external_communication" });
    const def = makeDef(step);
    wfStore.saveDefinition(def);
    makeInstance(wfStore, def);
    runtime.gateEffect = "approval_required";

    const s = makeScheduler();
    const item = await scheduleDueItem(s);

    const r1 = await s.evaluateDueWork();
    expect(r1.results[0].status).toBe("awaiting_approval");
    expect(runtime.executions).toBe(0); // NEVER executed without approval

    const after1 = (await schedStore.get(item.id))!;
    expect(after1.status).toBe("scheduled"); // stays scheduled, blocked on the gate
    expect(after1.executionHistory[after1.executionHistory.length - 1].status).toBe("awaiting_approval");

    // Repeated heartbeats keep it blocked — no duplication of the wait record
    await s.evaluateDueWork();
    const afterRepeat = (await schedStore.get(item.id))!;
    const approvalRecords = afterRepeat.executionHistory.filter((h) => h.status === "awaiting_approval");
    expect(approvalRecords).toHaveLength(1); // same occurrence record replaced, not duplicated
    expect(runtime.executions).toBe(0);

    // Founder approves (mirrors approveStep + evaluateReadiness in the real runtime)
    const inst = wfStore.instances.get("inst-test-1")!;
    inst.stepStates["step-1"].approvalState = "approved";
    inst.stepStates["step-1"].status = "ready";
    wfStore.instances.set("inst-test-1", JSON.parse(JSON.stringify(inst)));
    runtime.gateEffect = "allowed";

    const r2 = await s.evaluateDueWork();
    expect(r2.results[0].status).toBe("completed");
    expect(runtime.executions).toBe(1);
  });

  test("[7] side-effect authorization is re-evaluated when the work actually wakes (denied → blocked)", async () => {
    runtime.gateEffect = "denied";
    const s = makeScheduler();
    await scheduleDueItem(s);

    const r = await s.evaluateDueWork();
    expect(r.results[0].status).toBe("skipped");
    expect(String(r.results[0].error)).toMatch(/denied on wake/i);
    expect(runtime.executions).toBe(0);

    const inst = await wfStore.getInstance("inst-test-1");
    expect(inst!.stepStates["step-1"].status).toBe("blocked");
  });

  test("[8] cancelled (paused) schedules never execute", async () => {
    const s = makeScheduler();
    const item = await scheduleDueItem(s);
    await s.cancelSchedule(item.id, "founder", "paused by founder");

    const r = await s.evaluateDueWork();
    expect(r.processedCount).toBe(0);
    expect(runtime.executions).toBe(0);
  });

  test("[9] heartbeat records persist honest evaluation outcomes", async () => {
    const s = makeScheduler();
    await scheduleDueItem(s);
    await s.evaluateDueWork();

    // Relative assertions: the live heartbeat service may legitimately have
    // recorded real beats — the store must return EXACTLY what exists, no more.
    const before = (await schedStore.listHeartbeats(100)).length;
    await schedStore.recordHeartbeat({
      id: "hb-test-1",
      evaluatedAt: new Date().toISOString(),
      triggerSource: "cron",
      workerId: "test-worker",
      asOfTime: new Date().toISOString(),
      processedCount: 1,
      executedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      awaitingApprovalCount: 0,
      cancelledCount: 0,
      durationMs: 12,
      results: [{ scheduleId: "sched-x", occurrenceId: "sched-x-occ-1", status: "completed" }],
    });

    const after = await schedStore.listHeartbeats(100);
    expect(after.length).toBe(before + 1); // exactly one new record — nothing fabricated
    const rec = after.find((h) => h.id === "hb-test-1");
    expect(rec !== undefined).toBe(true);
    expect(rec!.triggerSource).toBe("cron");
    expect(rec!.executedCount).toBe(1);
    expect(rec!.results[0].status).toBe("completed");
  });
});
