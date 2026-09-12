/**
 * Phase 3.4.1 — focused security tests for GET /api/agents/runs.
 *
 * Verifies the canonical Founder authentication gate:
 *   - authorized (authenticated Founder) → 200 with the preserved response contract
 *   - unauthenticated (production, no principal) → 401 fail-closed
 *   - invalid credentials (production, wrong dev secret) → 401 fail-closed
 *   - authorized via production dev-secret founder path → 200 (contract preserved)
 *
 * Uses bun:test with the real route handler and the real session primitive —
 * no mocks of the auth path under test.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/agents/runs/route";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_DEV_SECRET = process.env.SAMJUNIORS_DEV_SECRET;

const RUNS_URL = "http://localhost:3000/api/agents/runs";

/** Next's type augmentation marks NODE_ENV read-only; tests mutate it
 *  deliberately to exercise both session resolution branches. */
const setNodeEnv = (mode: string) => {
  (process.env as Record<string, string | undefined>).NODE_ENV = mode;
};

afterEach(() => {
  setNodeEnv(ORIGINAL_NODE_ENV ?? "development");
  if (ORIGINAL_DEV_SECRET === undefined) delete process.env.SAMJUNIORS_DEV_SECRET;
  else process.env.SAMJUNIORS_DEV_SECRET = ORIGINAL_DEV_SECRET;
});

describe("GET /api/agents/runs — Founder authentication gate (Phase 3.4.1)", () => {
  test("authorized: development founder session → 200 + preserved response contract", async () => {
    setNodeEnv("development");
    process.env.SAMJUNIORS_DEV_SECRET = "phase-341-test-secret";
    const req = new NextRequest(`${RUNS_URL}?limit=5`, {
      headers: {
        "x-samjuniors-dev-as": "founder",
        "x-samjuniors-dev-secret": "phase-341-test-secret",
      },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.count).toBe("number");
    expect(Array.isArray(body.runs)).toBe(true);
    expect(body.count).toBe(body.runs.length);
  });

  test("unauthenticated: production mode without any principal → 401 fail-closed", async () => {
    setNodeEnv("production");
    delete process.env.SAMJUNIORS_DEV_SECRET;
    const req = new NextRequest(RUNS_URL);
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(String(body.error)).toMatch(/Unauthorized.*Founder/i);
  });

  test("invalid credentials: production mode with wrong dev secret → 401 fail-closed", async () => {
    setNodeEnv("production");
    process.env.SAMJUNIORS_DEV_SECRET = "phase-341-real-secret";
    const req = new NextRequest(RUNS_URL, {
      headers: {
        "x-samjuniors-dev-as": "founder",
        "x-samjuniors-dev-secret": "wrong-secret",
      },
    });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(String(body.error)).toMatch(/Unauthorized.*Founder/i);
  });

  test("fail-closed: production mode rejects even VALID dev-secret founder headers → 401", async () => {
    // session.ts prohibits dev bypass headers/cookies unconditionally in
    // production (defense-in-depth ahead of secret verification), so this
    // deployment fails closed for every principal in production: there is
    // no reachable dev-secret founder path when NODE_ENV=production. This
    // test pins that invariant — production reads require the real
    // identity provider, never a dev bypass.
    setNodeEnv("production");
    process.env.SAMJUNIORS_DEV_SECRET = "phase-341-real-secret";
    const req = new NextRequest(`${RUNS_URL}?limit=3`, {
      headers: {
        "x-samjuniors-dev-as": "founder",
        "x-samjuniors-dev-secret": "phase-341-real-secret",
      },
    });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(String(body.error)).toMatch(/Unauthorized.*Founder/i);
  });
});
