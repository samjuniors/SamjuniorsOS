/**
 * PHASE 4.4C — AUTHORITATIVE ACTIVITY PROJECTION TESTS.
 *
 * Exercises the REAL projection (src/lib/server/activity/projection.ts) over
 * the REAL stores: the REAL SideEffectAuthorizationGate (approvals + audits),
 * the REAL dual-mode AgentRunStore, the REAL durable workflow store
 * (getWorkflowStore()), the REAL scheduled-work store, the REAL lease manager,
 * the REAL WorkflowRuntime, the REAL WorkflowScheduler and the REAL
 * directive-schedule factory. Only ONE boundary is doubled, deliberately:
 *
 *   ContractExecutorDouble — implements the REAL ServerAgentExecutor return
 *   contract ({ success, error, runId, ... }) AND persists its runs through
 *   the REAL AgentRunStore exactly like the real executor does, so the
 *   work_completed / work_failed projection derives from the REAL persistence
 *   path (provider failure is injected deterministically on cue — the real
 *   provider cannot be forced to fail).
 *
 * Invariants pinned (founder directive 4.4C):
 *   [W1] real work produces Activity (start + completion + audit + occurrence)
 *   [W2] completed work produces Activity (work_completed + runId provenance)
 *   [W3] failed work produces Activity (work_failed; occurrence marked failed)
 *   [W4] approval request produces Activity
 *   [W5] approval decision produces Activity (approved AND rejected)
 *   [W6] scheduled execution produces Activity (per occurrence)
 *   [W7] pause / resume / cancel produce Activity (resumed only from the
 *        authoritative resume provenance — Phase 4.4C addition)
 *   [D1] duplicate source records never duplicate logical events:
 *        IDEMPOTENT_REPLAY audits excluded; repeated heartbeats on an
 *        awaiting-approval occurrence stay one event; repeated projection
 *        calls are byte-identical
 *   [O1] ordering is deterministic (time desc, then frozen category rank,
 *        then id — independent of input array order)
 *   [R1] Activity survives a REAL process restart (fresh bun child cold-starts
 *        all five authoritative sources and re-projects the same events)
 *   [N1] Activity never invents unavailable information (no work_started for
 *        instance-less council runs; no resumed event without resume
 *        provenance; empty sources → zero events; no sensitive payloads)
 */
import "./env-setup";
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { WorkflowScheduler } from "../../src/lib/server/workflow/scheduler";
import { InMemoryScheduledWorkStore } from "../../src/lib/server/workflow/scheduler-store";
import { InMemoryLeaseManager } from "../../src/lib/server/coordination/lease-manager";
import { WorkflowRuntime } from "../../src/lib/server/workflow/runtime";
import {
  createScheduledDirective,
  DIRECTIVE_STEP_ID,
} from "../../src/lib/server/workflow/directive-schedule";
import { SideEffectAuthorizationGate } from "../../src/lib/server/authorization/gate";
import { InMemoryApprovalStore } from "../../src/lib/server/authorization/approval-store";
import { getWorkflowStore } from "../../src/lib/server/workflow/store";
import { AgentRunStore } from "../../src/lib/server/agents/run-store";
import type { ServerAgentExecutor } from "../../src/lib/server/agents/executor";
import {
  loadActivitySourceRecords,
  deriveActivityEvents,
} from "../../src/lib/server/activity/projection";
import type { ActivityEventDTO } from "../../src/types/activity";
import type { AgentRunRecord } from "../../src/lib/server/agents/run-store";
import type { FounderApprovalRecord } from "../../src/types/authorization";
import type { ScheduledWorkItem } from "../../src/types/scheduling";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

/* ----------------------------------------------------------- artifact hygiene */

const gate = SideEffectAuthorizationGate.getInstance();
const approvalStore = gate.getApprovalStore() as InMemoryApprovalStore;
const auditStore = gate.getAuditStore() as any;
const runStore = AgentRunStore.getInstance();
const schedStore = InMemoryScheduledWorkStore.getInstance();
const leaseManager = InMemoryLeaseManager.getInstance();
const wfStore = getWorkflowStore();

// Snapshot pre-existing store contents so the suite can surgically purge
// exactly what IT added — never the live dev artifacts.
const initialApprovalIds = new Set(approvalStore.approvals.keys());
const initialAuditIds = new Set<string>((auditStore.audits as Map<string, any>).keys());
const initialRunIds = new Set(runStore.runs.keys());
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
const createdRunIds = new Set<string>();

const TEST_DB = "/tmp/samjuniors-4a-scheduler-test.db";

function pruneDurableCollection(collection: string, ids: Set<string>): void {
  const file = join(process.cwd(), ".data", `${collection}.json`);
  try {
    if (!existsSync(file) || ids.size === 0) return;
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    let changed = false;
    for (const id of ids) {
      if (raw[id] !== undefined) {
        delete raw[id];
        changed = true;
      }
    }
    if (changed) writeFileSync(file, JSON.stringify(raw), "utf-8");
  } catch {
    /* best-effort cleanup */
  }
}

async function cleanupArtifacts(): Promise<void> {
  // In-memory surgical removal.
  for (const id of createdRunIds) runStore.runs.delete(id);
  for (const id of createdScheduleIds) schedStore.items.delete(id);
  for (const id of createdInstanceIds) (wfStore as any).instances?.delete?.(id);
  for (const id of createdDefinitionIds) (wfStore as any).definitions?.delete?.(id);

  // Approval/audit/idempotency snapshot-diff purge (in-memory + durable).
  for (const id of Array.from(approvalStore.approvals.keys())) {
    if (!initialApprovalIds.has(id)) approvalStore.approvals.delete(id);
  }
  for (const id of Array.from((auditStore.audits as Map<string, any>).keys())) {
    if (!initialAuditIds.has(id)) (auditStore.audits as Map<string, any>).delete(id);
  }
  try {
    const idemStore = (await import("../../src/lib/server/idempotency/store")).getIdempotencyStore() as any;
    for (const key of Array.from(idemStore.records?.keys?.() ?? [])) {
      if (!initialIdemKeys.has(key)) idemStore.records.delete(key);
    }
  } catch { /* best-effort */ }

  // Durable JSON collections (exact ids only).
  pruneDurableCollection("agent_runs", createdRunIds);
  pruneDurableCollection("workflow_instances", createdInstanceIds);
  pruneDurableCollection("workflow_definitions", createdDefinitionIds);
  pruneDurableCollection("scheduled_work_items", createdScheduleIds);
  const ourApprovalIds = new Set(
    Array.from(approvalStore.approvals.keys()).filter((id) => !initialApprovalIds.has(id))
  );
  const ourAuditIds = new Set(
    Array.from((auditStore.audits as Map<string, any>).keys()).filter((id) => !initialAuditIds.has(id))
  );
  pruneDurableCollection("approvals", ourApprovalIds);
  pruneDurableCollection("audits", ourAuditIds);

  // SQLite (the env-setup COPY — never the real dev DB).
  try {
    const db = new PrismaClient({ datasources: { db: { url: `file:${TEST_DB}` } } } as any);
    await db.scheduledWorkItem.deleteMany({ where: { id: { in: [...createdScheduleIds] } } }).catch(() => {});
    await db.workflowInstance.deleteMany({ where: { id: { in: [...createdInstanceIds] } } }).catch(() => {});
    await db.workflowDefinition.deleteMany({ where: { id: { in: [...createdDefinitionIds] } } }).catch(() => {});
    await db.agentRun.deleteMany({ where: { id: { in: [...createdRunIds] } } }).catch(() => {});
    await db.approvalRecord.deleteMany({ where: { id: { in: [...ourApprovalIds] } } }).catch(() => {});
    await db.sideEffectAudit.deleteMany({ where: { id: { in: [...ourAuditIds] } } }).catch(() => {});
    await db.$disconnect().catch(() => {});
  } catch {
    /* best-effort — the copy is disposable anyway */
  }
}

afterAll(async () => {
  await cleanupArtifacts();
});

/* --------------------------------------------- executor contract double */

/**
 * Implements the REAL ServerAgentExecutor contract AND persists runs through
 * the REAL AgentRunStore (dev dual-mode: in-memory map + DurableFileStore +
 * best-effort SQLite) — exactly the persistence behavior of the real
 * executor. Provider failure is injected deterministically via `mode`.
 */
class ContractExecutorDouble {
  public calls = 0;
  public mode: "success" | "fail" = "success";
  private readonly prefix: string;

  constructor(prefix = `run-44c-${uuidv4().slice(0, 6)}`) {
    this.prefix = prefix;
  }

  async executeAgentTask(agentId: any, context: any, _prompt: string): Promise<any> {
    this.calls += 1;
    const runId = `${this.prefix}-${this.calls}`;
    const timestamp = new Date().toISOString();
    const agentName = "Sophia Vance";
    // Mirrors the REAL executor's Phase 4.4C provenance stamping: the
    // workflow execution context (instance/step/occurrence) supplied by the
    // WorkflowRuntime is persisted on the run's provenance.
    const wfProvenance = {
      workflowInstanceId: context.workflowInstanceId,
      stepId: context.stepId,
      occurrenceId: context.occurrenceId,
      occurrenceNumber: context.occurrenceNumber,
    };
    if (this.mode === "fail") {
      await runStore.saveRun({
        runId,
        agentId,
        agentName,
        protocolStep: context.protocolStep,
        taskTitle: context.taskTitle,
        directive: context.directive,
        status: "failed",
        durationMs: 3,
        outputContent: `**Execution Error**: Task "${context.taskTitle}" failed (provider unavailable).`,
        provenance: { agentId, agentName, protocolStep: context.protocolStep, timestamp, isVerified: false, evidenceBasis: "unverified", ...wfProvenance },
        error: "provider unavailable (44c double)",
        timestamp,
      });
      createdRunIds.add(runId);
      return {
        success: false,
        agentId,
        agentName,
        protocolStep: context.protocolStep,
        statusMessage: "[COO] Task execution failed.",
        outputContent: `**Execution Error**: provider unavailable.`,
        runId,
        provenance: { agentId, agentName, protocolStep: context.protocolStep, timestamp, isVerified: false, ...wfProvenance },
        error: "provider unavailable (44c double)",
      };
    }
    await runStore.saveRun({
      runId,
      agentId,
      agentName,
      protocolStep: context.protocolStep,
      taskTitle: context.taskTitle,
      directive: context.directive,
      status: "completed",
      durationMs: 12,
      outputContent: `44c deterministic output for: ${context.directive}`,
      provenance: { agentId, agentName, protocolStep: context.protocolStep, timestamp, isVerified: true, evidenceBasis: "model_reasoning", ...wfProvenance },
      timestamp,
    });
    createdRunIds.add(runId);
    return {
      success: true,
      agentId,
      agentName,
      protocolStep: context.protocolStep,
      statusMessage: "[COO] Completed.",
      outputContent: `44c deterministic output for: ${context.directive}`,
      runId,
      provenance: { agentId, agentName, protocolStep: context.protocolStep, timestamp, isVerified: true, ...wfProvenance },
    };
  }
}

/* ------------------------------------------------------------------ fixtures */

let executor: ContractExecutorDouble;
let runtime: WorkflowRuntime;

function makeScheduler(workerId?: string): WorkflowScheduler {
  return new WorkflowScheduler(
    schedStore,
    wfStore as any,
    runtime as any,
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
  oneTime?: boolean;
}

async function createSchedule(opts: CreateOpts = {}): Promise<{
  schedule: ScheduledWorkItem;
  instanceId: string;
}> {
  const result = await createScheduledDirective(
    {
      directive: opts.directive ?? `44c fixture: research competitors ${uuidv4().slice(0, 6)}`,
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
      founder: { userId: "founder-local-session" },
    }
  );
  createdInstanceIds.add(result.workflowInstanceId);
  createdDefinitionIds.add(result.definition.id);
  createdScheduleIds.add(result.schedule.id);
  return { schedule: result.schedule, instanceId: result.workflowInstanceId };
}

/** Full REAL projection over the REAL stores. */
async function project(): Promise<ActivityEventDTO[]> {
  const sources = await loadActivitySourceRecords();
  return deriveActivityEvents(sources);
}

function eventsFor(
  events: ActivityEventDTO[],
  category: string
): ActivityEventDTO[] {
  return events.filter((e) => e.category === category);
}

function byInstanceId(
  events: ActivityEventDTO[],
  instanceId: string
): ActivityEventDTO[] {
  return events.filter((e) => e.provenance.workflowInstanceId === instanceId);
}

beforeEach(async () => {
  schedStore.clear(); // arms the recovery flag — full test isolation (4.4B pattern)
  leaseManager.clear();
  executor = new ContractExecutorDouble();
  runtime = new WorkflowRuntime(wfStore as any, executor as unknown as ServerAgentExecutor);
});

/* -------------------------------------------------------------------- tests */

describe("Phase 4.4C — real work produces Activity (authoritative projection)", () => {
  test("[W1]+[W2] real scheduled work produces work_started, work_completed, side_effect_authorized and scheduled_execution events", async () => {
    const { instanceId } = await createSchedule({ oneTime: true });

    const scheduler = makeScheduler();
    await scheduler.evaluateDueWork();

    const events = await project();
    const mine = byInstanceId(events, instanceId);
    const categories = new Set(mine.map((e) => e.category));

    expect(categories.has("work_started")).toBe(true);
    expect(categories.has("work_completed")).toBe(true);
    expect(categories.has("scheduled_execution")).toBe(true);
    expect(categories.has("side_effect_authorized")).toBe(true);

    // [W2] completed work carries runId provenance + honest status/actor.
    const completed = mine.find((e) => e.category === "work_completed")!;
    expect(completed.status).toBe("completed");
    expect(completed.provenance.agentRunId).toMatch(/^run-44c-/);
    expect(completed.actor).toBe("Sophia Vance");
    expect(typeof completed.at).toBe("string");
    expect(Number.isFinite(Date.parse(completed.at))).toBe(true);

    // scheduled_execution: occurrence 1, completed status, occurrence provenance.
    const occ = mine.find((e) => e.category === "scheduled_execution")!;
    expect(occ.provenance.occurrenceNumber).toBe(1);
    expect(occ.provenance.occurrenceId).toContain("-occ-1");
    expect(occ.status).toBe("completed");
    expect(occ.provenance.scheduleId).toBeTruthy();
  }, 30_000);

  test("[W3] failed work produces work_failed and the occurrence is honestly failed", async () => {
    executor.mode = "fail";
    const { instanceId } = await createSchedule({ oneTime: true });

    const scheduler = makeScheduler();
    await scheduler.evaluateDueWork();

    const events = await project();
    const mine = byInstanceId(events, instanceId);

    const failed = mine.find((e) => e.category === "work_failed");
    expect(failed).toBeTruthy();
    expect(failed!.status).toBe("failed");
    expect(failed!.provenance.agentRunId).toMatch(/^run-44c-/);

    // The occurrence record itself is failed (never misrepresented as completed).
    const occ = mine.find((e) => e.category === "scheduled_execution");
    expect(occ).toBeTruthy();
    expect(occ!.status).toBe("failed");

    // No work_completed event may exist for this instance.
    expect(mine.find((e) => e.category === "work_completed")).toBeUndefined();
  }, 30_000);

  test("[W4]+[W5] approval request and founder decisions produce Activity", async () => {
    const { instanceId } = await createSchedule({ oneTime: true, requiresApproval: true });

    // First wake: approval requested, nothing executed.
    const scheduler = makeScheduler();
    await scheduler.evaluateDueWork();

    let events = await project();
    let mine = byInstanceId(events, instanceId);
    const requested = mine.find((e) => e.category === "approval_requested");
    expect(requested).toBeTruthy();
    expect(requested!.status).toBe("pending");
    expect(requested!.provenance.approvalId).toMatch(/^appr-/);
    // Occurrence-bound provenance (Phase 4.4B.1 binding visible in Activity).
    expect(requested!.provenance.occurrenceId).toContain("-occ-1");
    // The occurrence itself is awaiting approval — not executed, not failed.
    const occWaiting = mine.find((e) => e.category === "scheduled_execution");
    expect(occWaiting!.status).toBe("awaiting_approval");
    // No work completed while awaiting approval.
    expect(mine.find((e) => e.category === "work_completed")).toBeUndefined();

    // Founder approves through the REAL gate decision path.
    const approval: FounderApprovalRecord | undefined = (await approvalStore.list({ workflowInstanceId: instanceId }))[0];
    expect(approval).toBeTruthy();
    await gate.decideApproval({
      approvalId: approval!.id,
      decision: "approved",
      decidedBy: "founder-local-session",
      userContext: { role: "FOUNDER" },
    });

    // Second wake: executes.
    await scheduler.evaluateDueWork();

    events = await project();
    mine = byInstanceId(events, instanceId);
    const approved = mine.find((e) => e.category === "approval_approved");
    expect(approved).toBeTruthy();
    expect(approved!.status).toBe("approved");
    expect(approved!.actor).toBe("Founder");
    expect(approved!.provenance.approvalId).toBe(approval!.id);
    expect(approved!.at >= requested!.at).toBe(true);
    // And the work actually completed after the decision.
    expect(mine.find((e) => e.category === "work_completed")).toBeTruthy();

    // Rejected path: a second approval-required schedule, rejected.
    const second = await createSchedule({ oneTime: true, requiresApproval: true });
    const scheduler2 = makeScheduler();
    await scheduler2.evaluateDueWork();
    const secondApproval = (await approvalStore.list({ workflowInstanceId: second.instanceId }))[0];
    await gate.decideApproval({
      approvalId: secondApproval.id,
      decision: "rejected",
      decidedBy: "founder-local-session",
      userContext: { role: "FOUNDER" },
    });
    const eventsAfterReject = await project();
    const rejected = byInstanceId(eventsAfterReject, second.instanceId).find(
      (e) => e.category === "approval_rejected"
    );
    expect(rejected).toBeTruthy();
    expect(rejected!.status).toBe("rejected");
    // A rejected occurrence never executes.
    const rejectedOcc = byInstanceId(eventsAfterReject, second.instanceId).find(
      (e) => e.category === "scheduled_execution"
    );
    expect(rejectedOcc!.status).not.toBe("completed");
    expect(byInstanceId(eventsAfterReject, second.instanceId).find((e) => e.category === "work_completed")).toBeUndefined();
  }, 60_000);

  test("[W6] recurring scheduled executions produce one Activity event per occurrence", async () => {
    const { instanceId } = await createSchedule({ intervalValue: 1, maxOccurrences: 2 });

    const scheduler = makeScheduler();
    // Occurrence 1.
    await scheduler.evaluateDueWork();
    // Force occurrence 2 due now (backoff-free deterministic test clock).
    const item = (await schedStore.list()).find((i) => i.workflowInstanceId === instanceId)!;
    item.executeAt = new Date(Date.now() - 1000).toISOString();
    await schedStore.update(item);
    await scheduler.evaluateDueWork();

    const events = await project();
    const occs = byInstanceId(events, instanceId).filter((e) => e.category === "scheduled_execution");
    expect(occs.length).toBe(2);
    expect(new Set(occs.map((o) => o.provenance.occurrenceId)).size).toBe(2);
    expect(occs.map((o) => o.provenance.occurrenceNumber).sort()).toEqual([1, 2]);
    // Each occurrence has its own completed work event (distinct runIds).
    const completions = byInstanceId(events, instanceId).filter((e) => e.category === "work_completed");
    expect(completions.length).toBe(2);
    expect(new Set(completions.map((c) => c.provenance.agentRunId)).size).toBe(2);
  }, 30_000);

  test("[W7] pause / resume / cancel produce Activity from authoritative lifecycle records", async () => {
    const { instanceId, schedule } = await createSchedule({ oneTime: true, dueInMs: 60_000 * 60 });

    const scheduler = makeScheduler();
    // Pause (founder action).
    await scheduler.pauseSchedule(schedule.id, "founder-local-session");
    let events = await project();
    let paused = byInstanceId(events, instanceId).find((e) => e.category === "automation_paused");
    expect(paused).toBeTruthy();
    expect(paused!.actor).toBe("Founder");

    // Resume (founder action) — the Phase 4.4C resume provenance.
    await scheduler.resumeSchedule(schedule.id, "founder-local-session");
    events = await project();
    const resumed = byInstanceId(events, instanceId).find((e) => e.category === "automation_resumed");
    expect(resumed).toBeTruthy();
    expect(resumed!.actor).toBe("Founder");
    expect(resumed!.at >= (paused!.at as string)).toBe(true);

    // Cancel (founder action).
    await scheduler.cancelSchedule(schedule.id, "founder-local-session", "44c test cancellation");
    events = await project();
    const cancelled = byInstanceId(events, instanceId).find((e) => e.category === "automation_cancelled");
    expect(cancelled).toBeTruthy();
    expect(cancelled!.status).toBe("cancelled");
    // A cancelled schedule never executed.
    expect(byInstanceId(events, instanceId).find((e) => e.category === "scheduled_execution")).toBeUndefined();
    expect(byInstanceId(events, instanceId).find((e) => e.category === "work_completed")).toBeUndefined();

    // The paused event's status honestly reflects the later resume.
    paused = byInstanceId(events, instanceId).find((e) => e.category === "automation_paused")!;
    expect(paused.status).toBe("resumed");
  }, 30_000);
});

describe("Phase 4.4C — duplicate source records never duplicate logical events", () => {
  test("[D1a] an IDEMPOTENT_REPLAY audit does not create a second side_effect_authorized event", async () => {
    const actionName = `44c replay probe ${uuidv4().slice(0, 6)}`;
    const key = `idem-44c-replay-${uuidv4()}`;

    // Execute the SAME logical operation twice through the REAL gate with the
    // SAME idempotency key: the second pass is an IDEMPOTENT_REPLAY audit.
    // (read_only classification is allowed autonomously — no approval needed —
    // and no workflow instance is referenced, so the SQLite FK stays clean.)
    const execute = () => gate.executeWithGate({
      request: {
        employeeRole: "coo",
        actionName,
        classification: "read_only",
        requestedBy: "coo",
      },
      executionRef: `exec-44c-replay-${uuidv4()}`,
      idempotency: { key, targetSystem: "internal_agent", logicalOpId: key },
      executeFn: async () => ({ ok: true, marker: `44c-${uuidv4().slice(0, 4)}` }),
    });

    const first = await execute();
    expect(first.allowed).toBe(true);
    expect(first.executed).toBe(true);
    const replay = await execute();
    expect(replay.allowed).toBe(true);
    expect(replay.executed).toBe(false); // served from the idempotent cache

    // Two audit records exist for this action (execution + replay)…
    const auditsForAction = (await gate.listAudits({}))
      .filter((a: any) => a.actionName === actionName);
    expect(auditsForAction.length).toBe(2);
    expect(auditsForAction.some((a: any) => a.reasonCode === "IDEMPOTENT_REPLAY")).toBe(true);

    // …but the projection emits exactly ONE logical authorization event.
    const events = await project();
    const authorized = events.filter(
      (e) => e.category === "side_effect_authorized" && e.summary.includes(actionName)
    );
    expect(authorized.length).toBe(1);
  }, 30_000);

  test("[D1b] repeated heartbeats on an awaiting-approval occurrence stay a single logical event", async () => {
    const { instanceId } = await createSchedule({ oneTime: true, requiresApproval: true });

    const scheduler = makeScheduler();
    await scheduler.evaluateDueWork();
    await scheduler.evaluateDueWork();
    await scheduler.evaluateDueWork();

    const events = await project();
    const mine = byInstanceId(events, instanceId);
    // One occurrence event, one approval request — repeated wakes deduplicated.
    expect(mine.filter((e) => e.category === "scheduled_execution").length).toBe(1);
    expect(mine.filter((e) => e.category === "approval_requested").length).toBe(1);
  }, 30_000);

  test("[D1c] repeated projection calls are deterministic and identical", async () => {
    const { instanceId } = await createSchedule({ oneTime: true });
    const scheduler = makeScheduler();
    await scheduler.evaluateDueWork();

    const first = await project();
    const second = await project();
    // Identical logical content (the projection is stateless + deterministic).
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(byInstanceId(first, instanceId).length).toBeGreaterThan(0);
  }, 30_000);
});

describe("Phase 4.4C — deterministic ordering", () => {
  test("[O1] identical timestamps break ties by frozen category rank then id; input order is irrelevant", () => {
    const T = "2026-09-14T00:00:00.000Z";
    const mkRun = (runId: string, directive: string): AgentRunRecord => ({
      runId,
      agentId: "coo",
      agentName: "Sophia Vance",
      protocolStep: "report",
      taskTitle: "t",
      directive,
      status: "completed",
      durationMs: 1,
      outputContent: "x",
      provenance: { agentId: "coo", agentName: "Sophia Vance", protocolStep: "report", timestamp: T, isVerified: true },
      timestamp: T,
    });
    const mkApproval = (id: string, actionName: string): FounderApprovalRecord => ({
      id,
      decision: "approved",
      actionName,
      classification: "read_only",
      workflowInstanceId: `wf-o1-${id}`,
      stepId: "s",
      employeeRole: "coo",
      scope: { scopeType: "step", workflowInstanceId: `wf-o1-${id}`, stepId: "s", maxUses: 1, usedCount: 0 },
      requestedAt: T,
      decidedAt: T,
      decidedBy: "founder",
      isConsumed: false,
    });

    const sources = {
      agentRuns: [mkRun("run-b", "d-b"), mkRun("run-a", "d-a")],
      approvals: [mkApproval("appr-z", "act-z"), mkApproval("appr-y", "act-y")],
      audits: [],
      workflowInstances: [],
      scheduledItems: [],
    };

    const ordered = deriveActivityEvents(sources as any);
    const ids = ordered.map((e) => e.id);

    // All four events share the same timestamp: order must be the frozen
    // category rank (work_completed < approval_requested < approval_approved),
    // then id within the category.
    expect(ids).toEqual([
      "work_completed:run-a",
      "work_completed:run-b",
      "approval_requested:appr-y",
      "approval_requested:appr-z",
      "approval_approved:appr-y",
      "approval_approved:appr-z",
    ]);

    // Input array order is irrelevant — shuffled inputs, same output.
    const shuffled = {
      agentRuns: [mkRun("run-a", "d-a"), mkRun("run-b", "d-b")],
      approvals: [mkApproval("appr-y", "act-y"), mkApproval("appr-z", "act-z")],
      audits: [],
      workflowInstances: [],
      scheduledItems: [],
    };
    expect(deriveActivityEvents(shuffled as any).map((e) => e.id)).toEqual(ids);
  });
});

describe("Phase 4.4C — Activity survives a REAL process restart", () => {
  test("[R1] a fresh bun child cold-starts all authoritative sources and re-projects the same events", async () => {
    const { instanceId } = await createSchedule({ oneTime: true });
    const scheduler = makeScheduler();
    await scheduler.evaluateDueWork();

    const before = await project();
    const mineBefore = byInstanceId(before, instanceId).map((e) => e.id).sort();
    expect(mineBefore.length).toBeGreaterThanOrEqual(4);

    // Seed a temp environment with EXACTLY the durable state a restart finds.
    const restartDir = join(tmpdir(), `44c-restart-${uuidv4()}`);
    const dataDir = join(restartDir, ".data");
    mkdirSync(dataDir, { recursive: true });

    const writeCollection = (collection: string, records: Record<string, unknown>) => {
      if (Object.keys(records).length > 0) {
        writeFileSync(join(dataDir, `${collection}.json`), JSON.stringify(records));
      }
    };

    // Workflow instance + definition + runs + approvals + audits from the
    // LIVE durable collections (our fixture ids only).
    const instance = (await (wfStore as any).getInstance(instanceId)) as any;
    writeCollection("workflow_instances", { [instanceId]: instance });
    const defRows: Record<string, unknown> = {};
    for (const defId of createdDefinitionIds) {
      const d = (await (wfStore as any).getDefinition(defId)) as any;
      if (d) {
        defRows[`${d.id}@${d.version}`] = d;
        defRows[d.id] = d;
      }
    }
    writeCollection("workflow_definitions", defRows);

    const runRows: Record<string, unknown> = {};
    for (const runId of createdRunIds) {
      const r = runStore.runs.get(runId);
      if (r) runRows[runId] = r;
    }
    writeCollection("agent_runs", runRows);

    const apprRows: Record<string, unknown> = {};
    for (const id of approvalStore.approvals.keys()) {
      if (!initialApprovalIds.has(id)) apprRows[id] = approvalStore.approvals.get(id);
    }
    writeCollection("approvals", apprRows);
    const auditRows: Record<string, unknown> = {};
    for (const id of (auditStore.audits as Map<string, any>).keys()) {
      if (!initialAuditIds.has(id)) auditRows[id] = (auditStore.audits as Map<string, any>).get(id);
    }
    writeCollection("audits", auditRows);

    // Scheduled items recover from SQLite: copy the CURRENT env DB copy.
    copyFileSync(TEST_DB, join(restartDir, "restart.db"));

    try {
      const proc = Bun.spawn(
        ["bun", resolve("tests/scheduler/activity-child.ts"), instanceId],
        {
          stdout: "pipe",
          stderr: "pipe",
          cwd: restartDir,
          env: {
            ...process.env,
            DATABASE_URL: `file:${join(restartDir, "restart.db")}`,
          },
        }
      );
      const out = await new Response(proc.stdout).text();
      const errText = await new Response(proc.stderr).text();
      await proc.exited;

      expect(errText).not.toContain("error");
      const recovered = JSON.parse(out.trim());
      expect(recovered.found).toBe(true);
      const mineAfter = recovered.eventIds.sort();
      expect(mineAfter).toEqual(mineBefore);
    } finally {
      rmSync(restartDir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("Phase 4.4C — Activity never invents unavailable information", () => {
  test("[N1a] an instance-less council run produces work_completed but NO work_started", async () => {
    // A council/orchestrate-style run: persisted by the executor, not attached
    // to any WorkflowInstance (no step startedAt exists for it).
    const runId = `run-44c-council-${uuidv4().slice(0, 6)}`;
    await runStore.saveRun({
      runId,
      agentId: "researcher",
      agentName: "Dr. Aris Thorne",
      protocolStep: "research",
      taskTitle: "Council research",
      directive: `44c council directive ${uuidv4().slice(0, 6)}`,
      status: "completed",
      durationMs: 20,
      outputContent: "council output",
      provenance: { agentId: "researcher", agentName: "Dr. Aris Thorne", protocolStep: "research", timestamp: new Date().toISOString(), isVerified: true },
      timestamp: new Date().toISOString(),
    });
    createdRunIds.add(runId);

    const events = await project();
    const mine = events.filter((e) => e.provenance.agentRunId === runId);
    expect(mine.length).toBe(1);
    expect(mine[0].category).toBe("work_completed");
    // No fabricated start event: the authoritative record carries none.
    expect(events.filter((e) => e.category === "work_started" && (e as any).provenance?.agentRunId === runId).length).toBe(0);
  }, 30_000);

  test("[N1b] a pre-4.4C paused item WITHOUT resume provenance projects pause but NOT resume", () => {
    const scheduleId = `sched-44c-legacy-${uuidv4().slice(0, 6)}`;
    const pausedAt = new Date().toISOString();
    const sources = {
      agentRuns: [],
      approvals: [],
      audits: [],
      workflowInstances: [],
      scheduledItems: [
        {
          id: scheduleId,
          workflowInstanceId: `wf-legacy-${uuidv4().slice(0, 6)}`,
          stepId: DIRECTIVE_STEP_ID,
          scheduleType: "recurring",
          executeAt: new Date(Date.now() + 60_000).toISOString(),
          status: "paused",
          pausedState: { pausedAt, pausedBy: "founder" }, // no resumedAt — pre-4.4C record
          createdAt: pausedAt,
          updatedAt: pausedAt,
          executionHistory: [],
          idempotencyKey: scheduleId,
        } as any,
      ],
    };

    const events = deriveActivityEvents(sources as any);
    expect(events.filter((e) => e.category === "automation_paused").length).toBe(1);
    expect(events.filter((e) => e.category === "automation_resumed").length).toBe(0);
  });

  test("[N1c] empty authoritative records project ZERO events", () => {
    const events = deriveActivityEvents({
      agentRuns: [],
      approvals: [],
      audits: [],
      workflowInstances: [],
      scheduledItems: [],
    });
    expect(events.length).toBe(0);
  });

  test("[N1d] projected events expose no sensitive payloads — summaries and provenance pointers only", async () => {
    const { instanceId } = await createSchedule({ oneTime: true, requiresApproval: true });
    const scheduler = makeScheduler();
    await scheduler.evaluateDueWork();
    const approval = (await approvalStore.list({ workflowInstanceId: instanceId }))[0];
    await gate.decideApproval({
      approvalId: approval.id,
      decision: "approved",
      decidedBy: "founder-local-session",
      userContext: { role: "FOUNDER" },
    });
    await scheduler.evaluateDueWork();

    const events = await project();
    const mine = byInstanceId(events, instanceId);
    expect(mine.length).toBeGreaterThan(0);

    for (const e of mine) {
      const serialized = JSON.stringify(e);
      // No payloads, hashes, targets, reasons or error evidence in Activity.
      expect(serialized).not.toContain("payloadHash");
      expect(serialized).not.toContain("provider unavailable");
      expect((e as any).payload).toBeUndefined();
      expect((e as any).target).toBeUndefined();
      expect((e as any).reason).toBeUndefined();
      expect((e as any).error).toBeUndefined();
      // Provenance carries only id pointers.
      expect(Object.keys(e.provenance).every((k) =>
        ["workstreamId", "workstreamTitle", "workflowInstanceId", "stepId", "agentRunId", "approvalId", "auditId", "scheduleId", "occurrenceId", "occurrenceNumber"].includes(k)
      )).toBe(true);
    }
  }, 60_000);
});
