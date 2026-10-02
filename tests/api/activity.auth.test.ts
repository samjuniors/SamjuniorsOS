/**
 * Phase 4.4C — route-level security + contract tests for the authoritative
 * Activity read API (GET /api/activity).
 *
 * Real route handler + real session primitive + real projection (no mocks):
 *   - dev founder → 200 with the honest response contract
 *     (asOfTime / totalProjected / events[])
 *   - limit honored; invalid limit → 400 (fail-closed, never silently defaulted)
 *   - production, no principal → 401 (founder-only, fail-closed)
 *   - production, dev bypass headers → 401 (dev headers are prohibited in
 *     production by the canonical session primitive)
 *
 * Read-only route: creates no artifacts.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { NextRequest } from "next/server";
import { GET } from "../../src/app/api/activity/route";

// Restore the REAL authoritative SQLite before any test runs (combined runs
// may have pointed DATABASE_URL at a throwaway copy).
{
  const envText = await Bun.file(".env").text();
  const m = envText.match(/^DATABASE_URL=(.*)$/m);
  if (m) process.env.DATABASE_URL = m[1].trim();
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

const URL_ACTIVITY = "http://localhost:3000/api/activity";

const setNodeEnv = (mode: string) => {
  (process.env as Record<string, string | undefined>).NODE_ENV = mode;
};

function makeRequest(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, { headers });
}

afterEach(() => {
  setNodeEnv(ORIGINAL_NODE_ENV);
});

describe("Phase 4.4C — GET /api/activity (founder-gated Activity projection)", () => {
  test("dev founder session → 200 with the honest response contract", async () => {
    setNodeEnv("development");
    const res = await GET(makeRequest(URL_ACTIVITY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.asOfTime).toBe("string");
    expect(Number.isFinite(Date.parse(body.asOfTime))).toBe(true);
    expect(typeof body.totalProjected).toBe("number");
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeLessThanOrEqual(body.totalProjected);
    // Every event carries the deterministic projection identity + taxonomy.
    for (const e of body.events) {
      expect(typeof e.id).toBe("string");
      expect(e.id).toMatch(/^[a-z_]+:/);
      expect(typeof e.summary).toBe("string");
      expect(typeof e.at).toBe("string");
      expect(typeof e.provenance).toBe("object");
    }
  });

  test("limit parameter is honored (bounded feed slice)", async () => {
    setNodeEnv("development");
    const res = await GET(makeRequest(`${URL_ACTIVITY}?limit=2`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events.length).toBeLessThanOrEqual(2);
    // totalProjected stays honest (the FULL projection count, pre-slice).
    expect(body.totalProjected).toBeGreaterThanOrEqual(body.events.length);
  });

  test("invalid limit → 400 (fail-closed, never silently defaulted)", async () => {
    setNodeEnv("development");
    const bad = await GET(makeRequest(`${URL_ACTIVITY}?limit=abc`));
    expect(bad.status).toBe(400);
    const zero = await GET(makeRequest(`${URL_ACTIVITY}?limit=0`));
    expect(zero.status).toBe(400);
  });

  test("production without a principal → 401 (founder-only)", async () => {
    setNodeEnv("production");
    const res = await GET(makeRequest(URL_ACTIVITY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Founder");
  });

  test("production with dev bypass headers → 401 (dev headers prohibited in production)", async () => {
    setNodeEnv("production");
    const res = await GET(
      makeRequest(URL_ACTIVITY, {
        "x-samjuniors-dev-as": "founder",
        "x-samjuniors-dev-secret": "anything",
      })
    );
    expect(res.status).toBe(401);
  });
});
