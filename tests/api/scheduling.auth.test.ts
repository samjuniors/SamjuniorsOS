/**
 * Phase 4.4A — focused security tests for the automation heartbeat endpoint
 * POST /api/workflow/scheduling and the status projection
 * GET /api/workflow/scheduling/status.
 *
 * Verifies (real route handlers + real session primitive, no auth mocks):
 *   - dev mode: founder auto-session → heartbeat accepted (triggerSource founder)
 *   - production, no principal, no secret → 401 fail-closed
 *   - production, wrong cron secret (also wrong-length) → 401 fail-closed
 *   - production, valid dev-secret founder headers → 401 (session.ts prohibits
 *     dev bypass in production — the cron secret is the ONLY production key)
 *   - production, VALID x-cron-secret → 200 + triggerSource "cron" (the
 *     heartbeat service path) — runs against the real authoritative SQLite
 *   - GET status: dev → 200 honest projection shape; production no principal → 401
 *
 * Test-created heartbeat rows are removed by exact id in afterEach.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "../../src/app/api/workflow/scheduling/route";
import { GET as GET_STATUS } from "../../src/app/api/workflow/scheduling/status/route";
import { PrismaClient } from "@prisma/client";

// bun test may run all suites in ONE process: the Phase 4.4A scheduler suite
// points DATABASE_URL at a throwaway tableless DB for isolation. This suite
// needs the REAL authoritative SQLite for the production cron-acceptance test,
// so restore it from .env before any test runs.
{
  const envText = await Bun.file(".env").text();
  const m = envText.match(/^DATABASE_URL=(.*)$/m);
  if (m) process.env.DATABASE_URL = m[1].trim();
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_CRON_SECRET = process.env.CRON_TRIGGER_SECRET;

const URL_POST = "http://localhost:3000/api/workflow/scheduling";
const URL_STATUS = "http://localhost:3000/api/workflow/scheduling/status";

const setNodeEnv = (mode: string) => {
  (process.env as Record<string, string | undefined>).NODE_ENV = mode;
};

/** Rows this suite creates (cleaned in afterEach — never real heartbeats). */
const createdHeartbeatIds: string[] = [];

async function cleanupHeartbeats() {
  if (createdHeartbeatIds.length === 0) return;
  try {
    const db = new PrismaClient();
    await db.schedulerHeartbeat.deleteMany({ where: { id: { in: [...createdHeartbeatIds] } } });
    await db.$disconnect();
  } catch {
    /* best-effort cleanup */
  }
  createdHeartbeatIds.length = 0;
}

afterEach(async () => {
  await cleanupHeartbeats();
  setNodeEnv(ORIGINAL_NODE_ENV ?? "development");
  if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_TRIGGER_SECRET;
  else process.env.CRON_TRIGGER_SECRET = ORIGINAL_CRON_SECRET;
});

describe("POST /api/workflow/scheduling — automation heartbeat authentication gate (Phase 4.4A)", () => {
  test("dev mode: founder auto-session → heartbeat accepted, triggerSource founder", async () => {
    setNodeEnv("development");
    const req = new NextRequest(URL_POST, { method: "POST", body: "{}" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.triggerSource).toBe("founder");
    expect(typeof body.processedCount).toBe("number");
    if (body.heartbeatId) createdHeartbeatIds.push(body.heartbeatId);
  });

  test("production, no principal, no cron secret configured → 401 fail-closed", async () => {
    setNodeEnv("production");
    delete process.env.CRON_TRIGGER_SECRET;
    const req = new NextRequest(URL_POST, { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(String(body.error)).toMatch(/Unauthorized.*Founder session or valid cron secret/i);
  });

  test("production, wrong cron secret → 401 fail-closed (constant-time comparison rejects)", async () => {
    setNodeEnv("production");
    process.env.CRON_TRIGGER_SECRET = "phase-44a-real-cron-secret-0123456789abcdef";
    const req = new NextRequest(URL_POST, {
      method: "POST",
      headers: { "x-cron-secret": "completely-wrong-secret-value-0123456789" },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  test("production, wrong-LENGTH cron secret → 401 fail-closed (length guard)", async () => {
    setNodeEnv("production");
    process.env.CRON_TRIGGER_SECRET = "phase-44a-real-cron-secret-0123456789abcdef";
    const req = new NextRequest(URL_POST, {
      method: "POST",
      headers: { "x-cron-secret": "short" },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  test("production: valid dev-secret founder headers are still 401 — cron secret is the only production key", async () => {
    setNodeEnv("production");
    process.env.SAMJUNIORS_DEV_SECRET = "phase-44a-dev-secret";
    delete process.env.CRON_TRIGGER_SECRET;
    const req = new NextRequest(URL_POST, {
      method: "POST",
      headers: {
        "x-samjuniors-dev-as": "founder",
        "x-samjuniors-dev-secret": "phase-44a-dev-secret",
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    delete process.env.SAMJUNIORS_DEV_SECRET;
  });

  test("production, VALID x-cron-secret → 200 + triggerSource cron (heartbeat service path, real authoritative DB)", async () => {
    setNodeEnv("production");
    process.env.CRON_TRIGGER_SECRET = "phase-44a-real-cron-secret-0123456789abcdef";
    // The Phase 4.3A suite's resetState() deletes DATABASE_URL process-wide;
    // the authoritative-mode path needs a table-complete database at call time.
    // Prefer the real DB, fall back to the scheduler suite's table-complete copy.
    {
      const envText = await Bun.file(".env").text();
      const m = envText.match(/^DATABASE_URL=(.*)$/m);
      if (m && !process.env.DATABASE_URL?.includes("throwaway")) {
        process.env.DATABASE_URL = m[1].trim();
      } else if (!process.env.DATABASE_URL) {
        process.env.DATABASE_URL = m ? m[1].trim() : "file:/tmp/samjuniors-4a-scheduler-test.db";
      }
    }
    const req = new NextRequest(URL_POST, {
      method: "POST",
      headers: { "x-cron-secret": "phase-44a-real-cron-secret-0123456789abcdef" },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.triggerSource).toBe("cron");
    expect(typeof body.workerId).toBe("string");
    expect(typeof body.processedCount).toBe("number");
    if (body.heartbeatId) createdHeartbeatIds.push(body.heartbeatId);
  });
});

describe("GET /api/workflow/scheduling/status — honest projection gate (Phase 4.4A)", () => {
  test("dev mode → 200 with honest projection shape (nulls allowed, never fabricated)", async () => {
    setNodeEnv("development");
    const req = new NextRequest(URL_STATUS);
    const res = await GET_STATUS(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.asOfTime).toBe("string");
    // lastHeartbeat is either null (never ran) or a full record — never invented
    if (body.lastHeartbeat !== null) {
      expect(typeof body.lastHeartbeat.evaluatedAt).toBe("string");
      const src: string = body.lastHeartbeat.triggerSource;
      expect(src === "cron" || src === "founder").toBe(true);
      expect(typeof body.lastHeartbeat.processedCount).toBe("number");
    }
    if (body.nextDue !== null) {
      expect(typeof body.nextDue.executeAt).toBe("string");
      expect(typeof body.nextDue.isOverdue).toBe("boolean");
    }
    expect(typeof body.counts.scheduled).toBe("number");
    expect(typeof body.awaitingApproval).toBe("number");
    expect(Array.isArray(body.recentHeartbeats)).toBe(true);
  });

  test("production, no principal → 401 fail-closed", async () => {
    setNodeEnv("production");
    const req = new NextRequest(URL_STATUS);
    const res = await GET_STATUS(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(String(body.error)).toMatch(/Unauthorized.*Founder/i);
  });
});
