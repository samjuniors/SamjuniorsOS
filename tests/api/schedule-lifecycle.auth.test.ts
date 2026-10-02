/**
 * Phase 4.4B — route-level security + lifecycle tests for the automation
 * creation path (POST /api/orchestrate with a schedule payload) and the
 * schedule lifecycle actions (POST /api/workflow/scheduling/actions).
 *
 * Real route handlers + real session primitive (no auth mocks):
 *   - dev founder creates a schedule → 200, persisted authoritatively
 *     (definition + instance + scheduled item), recurrence honored
 *   - invalid recurrence → 400 (fail-closed validation)
 *   - production, no principal → 401 (creation is founder-only)
 *   - production, VALID x-cron-secret → STILL 401 on creation: the heartbeat
 *     key authorizes evaluation only, never schedule creation
 *   - lifecycle: pause → 200 paused; resume → 200 scheduled; cancel → 200
 *     cancelled; invalid action → 400; unknown id → 404
 *   - lifecycle actions in production with the cron secret → 401 (cron can
 *     never mutate schedules)
 *
 * Test-created rows (SQLite + .data JSON) are removed by exact ids in afterEach.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { NextRequest } from "next/server";
import { POST as POST_ORCHESTRATE } from "../../src/app/api/orchestrate/route";
import { POST as POST_ACTIONS } from "../../src/app/api/workflow/scheduling/actions/route";
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, existsSync } from "fs";

// Restore the REAL authoritative SQLite before any test runs (combined runs
// may have pointed DATABASE_URL at a throwaway copy).
{
  const envText = await Bun.file(".env").text();
  const m = envText.match(/^DATABASE_URL=(.*)$/m);
  if (m) process.env.DATABASE_URL = m[1].trim();
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_CRON_SECRET = process.env.CRON_TRIGGER_SECRET;

const URL_ORCHESTRATE = "http://localhost:3000/api/orchestrate";
const URL_ACTIONS = "http://localhost:3000/api/workflow/scheduling/actions";

const setNodeEnv = (mode: string) => {
  (process.env as Record<string, string | undefined>).NODE_ENV = mode;
};

/** Exact ids this suite creates (SQLite + DurableFileStore JSON). */
const createdScheduleIds: string[] = [];
const createdInstanceIds: string[] = [];
const createdDefinitionIds: string[] = [];

function pruneDurableCollection(collection: string, ids: string[]): void {
  const file = `.data/${collection}.json`;
  try {
    if (!existsSync(file) || ids.length === 0) return;
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

async function cleanupArtifacts() {
  if (
    createdScheduleIds.length === 0 &&
    createdInstanceIds.length === 0 &&
    createdDefinitionIds.length === 0
  ) {
    return;
  }
    try {
    const db = new PrismaClient();
    await db.scheduledWorkItem.deleteMany({ where: { id: { in: [...createdScheduleIds] } } }).catch(() => {});
    await db.workflowInstance.deleteMany({ where: { id: { in: [...createdInstanceIds] } } }).catch(() => {});
    await db.workflowDefinition.deleteMany({
      where: { id: { in: [...createdDefinitionIds] } },
    }).catch(() => {});
    // Idempotency claims created by this suite's creation tests.
    await db.idempotencyRecord.deleteMany({ where: { key: { contains: "44b-idem-" } } }).catch(() => {});
    await db.$disconnect().catch(() => {});
  } catch {
    /* best-effort cleanup */
  }
  pruneDurableCollection("workflow_instances", createdInstanceIds);
  pruneDurableCollection("workflow_definitions", createdDefinitionIds);
  createdScheduleIds.length = 0;
  createdInstanceIds.length = 0;
  createdDefinitionIds.length = 0;
}

afterEach(async () => {
  await cleanupArtifacts();
  setNodeEnv(ORIGINAL_NODE_ENV ?? "development");
  if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_TRIGGER_SECRET;
  else process.env.CRON_TRIGGER_SECRET = ORIGINAL_CRON_SECRET;
});

const DIRECTIVE = "44b-route fixture: every week research our competitors and recommend pricing";

describe("POST /api/orchestrate (schedule branch) — creation security & lifecycle (Phase 4.4B)", () => {
  test("dev founder creates a recurring schedule → 200 + authoritative persistence", async () => {
    setNodeEnv("development");
    const executeAt = new Date(Date.now() + 60_000).toISOString();
    const req = new NextRequest(URL_ORCHESTRATE, {
      method: "POST",
      body: JSON.stringify({
        directive: DIRECTIVE,
        schedule: {
          scheduleType: "recurring",
          intervalUnit: "weeks",
          intervalValue: 1,
          executeAt,
          maxOccurrences: 4,
        },
      }),
    });
    const res = await POST_ORCHESTRATE(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.scheduled).toBe(true);
    const schedule = body.data.schedule;
    expect(schedule.scheduleType).toBe("recurring");
    expect(schedule.status).toBe("scheduled");
    expect(schedule.recurrence.intervalUnit).toBe("weeks");
    expect(schedule.recurrence.intervalValue).toBe(1);
    expect(schedule.recurrence.currentOccurrence).toBe(1);
    expect(schedule.recurrence.maxOccurrences).toBe(4);
    expect(new Date(schedule.executeAt).toISOString()).toBe(executeAt);
    expect(schedule.provenance.createdByRole).toBe("founder");
    expect(body.data.workflowDefinition.objective).toBe(DIRECTIVE);

    createdScheduleIds.push(schedule.id);
    createdInstanceIds.push(body.data.workflowInstanceId);
    createdDefinitionIds.push(body.data.workflowDefinition.id);

    // Authoritative persistence (real SQLite row with full metadata).
    const db = new PrismaClient();
    const row = await db.scheduledWorkItem.findUnique({ where: { id: schedule.id } });
    await db.$disconnect();
    expect(row).not.toBeNull();
    expect((row!.metadata as any).workflowInstanceId).toBe(body.data.workflowInstanceId);
    expect((row!.metadata as any).recurrence.maxOccurrences).toBe(4);
  });

  test("invalid recurrence is rejected with 400 (fail-closed validation)", async () => {
    setNodeEnv("development");
    const cases = [
      { scheduleType: "recurring", intervalUnit: "fortnights", intervalValue: 1 },
      { scheduleType: "recurring", intervalUnit: "weeks", intervalValue: 0 },
      { scheduleType: "recurring", intervalUnit: "weeks", intervalValue: 1, maxOccurrences: 0 },
      { scheduleType: "one_time" },
      { scheduleType: "one_time", executeAt: "not-a-date" },
    ];
    for (const schedule of cases) {
      const req = new NextRequest(URL_ORCHESTRATE, {
        method: "POST",
        body: JSON.stringify({ directive: DIRECTIVE, schedule }),
      });
      const res = await POST_ORCHESTRATE(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(String(body.error)).toMatch(/intervalUnit|intervalValue|maxOccurrences|executeAt|valid ISO/i);
    }
  });

  test("production, no principal → 401 fail-closed (schedule creation is founder-only)", async () => {
    setNodeEnv("production");
    delete process.env.CRON_TRIGGER_SECRET;
    const req = new NextRequest(URL_ORCHESTRATE, {
      method: "POST",
      body: JSON.stringify({
        directive: DIRECTIVE,
        schedule: { scheduleType: "recurring", intervalUnit: "weeks", intervalValue: 1 },
      }),
    });
    const res = await POST_ORCHESTRATE(req);
    expect(res.status).toBe(401);
  });

  test("production, VALID x-cron-secret → still 401: the heartbeat key can never create schedules", async () => {
    setNodeEnv("production");
    process.env.CRON_TRIGGER_SECRET = "phase-44b-real-cron-secret-0123456789abcdef";
    const req = new NextRequest(URL_ORCHESTRATE, {
      method: "POST",
      headers: { "x-cron-secret": "phase-44b-real-cron-secret-0123456789abcdef" },
      body: JSON.stringify({
        directive: DIRECTIVE,
        schedule: { scheduleType: "recurring", intervalUnit: "weeks", intervalValue: 1 },
      }),
    });
    const res = await POST_ORCHESTRATE(req);
    expect(res.status).toBe(401);
  });

  test("idempotent creation: same key replays the schedule instead of double-creating", async () => {
    setNodeEnv("development");
    const idemKey = `44b-idem-${Date.now()}`;
    const payload = {
      directive: DIRECTIVE,
      schedule: { scheduleType: "recurring", intervalUnit: "hours", intervalValue: 2, executeAt: new Date(Date.now() + 3_600_000).toISOString() },
    };
    const req1 = new NextRequest(URL_ORCHESTRATE, {
      method: "POST",
      headers: { "idempotency-key": idemKey },
      body: JSON.stringify(payload),
    });
    const res1 = await POST_ORCHESTRATE(req1);
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    createdScheduleIds.push(body1.data.schedule.id);
    createdInstanceIds.push(body1.data.workflowInstanceId);
    createdDefinitionIds.push(body1.data.workflowDefinition.id);

    const req2 = new NextRequest(URL_ORCHESTRATE, {
      method: "POST",
      headers: { "idempotency-key": idemKey },
      body: JSON.stringify(payload),
    });
    const res2 = await POST_ORCHESTRATE(req2);
    expect(res2.status).toBe(200);
    expect(res2.headers.get("X-Idempotent-Replay")).toBe("true");
    const body2 = await res2.json();
    expect(body2.data.schedule.id).toBe(body1.data.schedule.id);

    // Same key with a DIFFERENT schedule is payload tampering → 422.
    const req3 = new NextRequest(URL_ORCHESTRATE, {
      method: "POST",
      headers: { "idempotency-key": idemKey },
      body: JSON.stringify({ ...payload, schedule: { ...payload.schedule, intervalValue: 5 } }),
    });
    const res3 = await POST_ORCHESTRATE(req3);
    expect(res3.status).toBe(422);
  });
});

describe("POST /api/workflow/scheduling/actions — lifecycle security & semantics (Phase 4.4B)", () => {
  async function createFixtureSchedule(): Promise<string> {
    const req = new NextRequest(URL_ORCHESTRATE, {
      method: "POST",
      body: JSON.stringify({
        directive: `${DIRECTIVE} (actions fixture)`,
        // Future executeAt: the fixture must never be due while it exists, so
        // the LIVE heartbeat (dev server process) cannot race this suite's
        // create→assert→cleanup window and execute it for real.
        schedule: { scheduleType: "recurring", intervalUnit: "hours", intervalValue: 6, maxOccurrences: 5, executeAt: new Date(Date.now() + 3_600_000).toISOString() },
      }),
    });
    const res = await POST_ORCHESTRATE(req);
    const body = await res.json();
    createdScheduleIds.push(body.data.schedule.id);
    createdInstanceIds.push(body.data.workflowInstanceId);
    createdDefinitionIds.push(body.data.workflowDefinition.id);
    return body.data.schedule.id as string;
  }

  test("founder pause → resume → cancel lifecycle round-trip", async () => {
    setNodeEnv("development");
    const scheduleId = await createFixtureSchedule();

    const pause = await POST_ACTIONS(
      new NextRequest(URL_ACTIONS, { method: "POST", body: JSON.stringify({ scheduleId, action: "pause", reason: "44b test pause" }) })
    );
    expect(pause.status).toBe(200);
    const pauseBody = await pause.json();
    expect(pauseBody.success).toBe(true);
    expect(pauseBody.schedule.status).toBe("paused");
    expect(pauseBody.schedule.pausedState.pausedBy).toBeDefined();
    expect(pauseBody.schedule.workflowObjective).toContain("actions fixture");

    const resume = await POST_ACTIONS(
      new NextRequest(URL_ACTIONS, { method: "POST", body: JSON.stringify({ scheduleId, action: "resume" }) })
    );
    expect(resume.status).toBe(200);
    expect((await resume.json()).schedule.status).toBe("scheduled");

    const cancel = await POST_ACTIONS(
      new NextRequest(URL_ACTIONS, { method: "POST", body: JSON.stringify({ scheduleId, action: "cancel", reason: "44b test cancel" }) })
    );
    expect(cancel.status).toBe(200);
    const cancelBody = await cancel.json();
    expect(cancelBody.schedule.status).toBe("cancelled");

    // A cancelled schedule cannot be paused again (invalid state → 409).
    const rePause = await POST_ACTIONS(
      new NextRequest(URL_ACTIONS, { method: "POST", body: JSON.stringify({ scheduleId, action: "pause" }) })
    );
    expect(rePause.status).toBe(409);
  });

  test("invalid action and unknown scheduleId are rejected", async () => {
    setNodeEnv("development");
    const badAction = await POST_ACTIONS(
      new NextRequest(URL_ACTIONS, { method: "POST", body: JSON.stringify({ scheduleId: "whatever", action: "explode" }) })
    );
    expect(badAction.status).toBe(400);

    const unknown = await POST_ACTIONS(
      new NextRequest(URL_ACTIONS, { method: "POST", body: JSON.stringify({ scheduleId: "sched-does-not-exist", action: "pause" }) })
    );
    expect(unknown.status).toBe(404);
  });

  test("production, no principal → 401 (lifecycle is founder-only)", async () => {
    setNodeEnv("production");
    delete process.env.CRON_TRIGGER_SECRET;
    const res = await POST_ACTIONS(
      new NextRequest(URL_ACTIONS, { method: "POST", body: JSON.stringify({ scheduleId: "x", action: "pause" }) })
    );
    expect(res.status).toBe(401);
  });

  test("production, VALID x-cron-secret → still 401: cron can never manage schedules", async () => {
    setNodeEnv("production");
    process.env.CRON_TRIGGER_SECRET = "phase-44b-real-cron-secret-0123456789abcdef";
    const res = await POST_ACTIONS(
      new NextRequest(URL_ACTIONS, {
        method: "POST",
        headers: { "x-cron-secret": "phase-44b-real-cron-secret-0123456789abcdef" },
        body: JSON.stringify({ scheduleId: "x", action: "pause" }),
      })
    );
    expect(res.status).toBe(401);
  });
});
