/**
 * Phase 4.4E — route-level security + contract tests for the founder
 * epistemic surface (GET/POST /api/epistemic).
 *
 * Real route handler + real session primitive + real pipeline + real stores:
 *   - dev founder → GET ?view=board 200 with the honest board contract
 *     (claims/facts/memories/counts; lineage only where real records exist)
 *   - dev founder → POST reject_claim works and is founder-attributed
 *   - dev founder → POST promote_to_fact on an unverified claim fails closed
 *   - production, no principal → 401 on GET and POST (fail-closed)
 *   - production, dev bypass headers → 401 (dev headers prohibited in
 *     production by the canonical session primitive)
 *
 * Artifact hygiene: the suite purges exactly the claim records it creates
 * (in-memory singleton + durable collections) and restores prior state.
 */
import { describe, test, expect, afterEach, afterAll } from "bun:test";
import { NextRequest } from "next/server";
import { GET, POST } from "../../src/app/api/epistemic/route";
import { EpistemicClaimStore } from "../../src/lib/server/epistemic/claim-store";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Restore the REAL authoritative SQLite before any test runs (combined runs
// may have pointed DATABASE_URL at a throwaway copy).
{
  const envText = await Bun.file(".env").text();
  const m = envText.match(/^DATABASE_URL=(.*)$/m);
  if (m) process.env.DATABASE_URL = m[1].trim();
}
delete process.env.DATABASE_MODE;
(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const ORIGINAL_NODE_ENV = "test";

const URL_EPISTEMIC = "http://localhost:3000/api/epistemic";

const setNodeEnv = (mode: string) => {
  (process.env as Record<string, string | undefined>).NODE_ENV = mode;
};

function makeRequest(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, { headers });
}

function makePost(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest(URL_EPISTEMIC, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
    body: JSON.stringify(body),
  });
}

/* ----------------------------------------------------------- artifact hygiene */

const claimStore = EpistemicClaimStore.getInstance();
const initialSources = new Map(claimStore.sources);
const initialSignals = new Map(claimStore.signals);
const initialClaims = new Map(claimStore.claims);
const initialFacts = new Map(claimStore.facts);
const initialVerifications = new Map(claimStore.verifications);
const createdClaimIds = new Set<string>();

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
    /* best-effort hygiene */
  }
}

afterAll(() => {
  claimStore.sources = new Map(initialSources);
  claimStore.signals = new Map(initialSignals);
  claimStore.claims = new Map(initialClaims);
  claimStore.facts = new Map(initialFacts);
  claimStore.verifications = new Map(initialVerifications);
  pruneDurableCollection("epistemic_claims", createdClaimIds);
  pruneDurableCollection("epistemic_verifications", createdClaimIds);
});

afterEach(() => {
  setNodeEnv(ORIGINAL_NODE_ENV);
});

/** Submit a claim directly through the real store-visible pipeline by using
 *  the route itself (keeps every assertion on the real HTTP contract). */
async function submitRouteClaim(statement: string, subject: string): Promise<string> {
  setNodeEnv("development");
  const res = await POST(
    makePost({ action: "submit_claim", statement, subject, category: "operational", proposedBy: "researcher" })
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  const id = body.data.id as string;
  createdClaimIds.add(id);
  return id;
}

describe("Phase 4.4E — /api/epistemic founder surface (route-level)", () => {
  test("dev founder → GET ?view=board 200 with the honest board contract", async () => {
    setNodeEnv("development");
    const res = await GET(makeRequest(`${URL_EPISTEMIC}?view=board`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const board = body.data;
    expect(typeof board.asOfTime).toBe("string");
    expect(Array.isArray(board.claims)).toBe(true);
    expect(Array.isArray(board.facts)).toBe(true);
    expect(Array.isArray(board.memories)).toBe(true);
    expect(typeof board.counts).toBe("object");
    // Every projected claim carries the honest stage taxonomy, and lineage
    // is present ONLY where a real source record exists (never fabricated).
    for (const c of board.claims) {
      expect(["pending", "verified", "rejected", "fact"]).toContain(c.stage);
      if (c.lineage) {
        expect(typeof c.lineage.source.id).toBe("string");
        expect(typeof c.lineage.source.sourceSystem).toBe("string");
      }
    }
    // Seed memories are honestly classified.
    for (const m of board.memories) {
      expect(["fact_lineage", "seed_or_unattributed"]).toContain(m.origin);
    }
  });

  test("dev founder → POST reject_claim works and is founder-attributed", async () => {
    const claimId = await submitRouteClaim(
      "Route-level rejection contract claim for 4.4E.",
      "route reject 44e"
    );
    setNodeEnv("development");
    const res = await POST(makePost({ action: "reject_claim", claimId, reason: "Route test founder rejection" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.verificationStatus).toBe("rejected");
    expect(body.data.reviewedBy).toContain("founder");

    // The board reflects the rejection.
    const boardRes = await GET(makeRequest(`${URL_EPISTEMIC}?view=board`));
    const board = (await boardRes.json()).data;
    const projected = board.claims.find((c: any) => c.id === claimId);
    expect(projected.stage).toBe("rejected");
    expect(projected.rejectionReason).toContain("Route test founder rejection");
  });

  test("dev founder → POST promote_to_fact on an unverified claim fails closed", async () => {
    const claimId = await submitRouteClaim(
      "Unverified route claim that must fail promotion.",
      "route unverified 44e"
    );
    setNodeEnv("development");
    const res = await POST(makePost({ action: "promote_to_fact", claimId }));
    expect(res.status).toBe(500); // fail-closed: the pipeline refuses promotion
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("verification has not passed");
  });

  test("reject_claim without claimId → 400 (validation fail-closed)", async () => {
    setNodeEnv("development");
    const res = await POST(makePost({ action: "reject_claim" }));
    expect(res.status).toBe(400);
  });

  test("production without a principal → 401 on GET and POST (founder-only)", async () => {
    setNodeEnv("production");
    const getRes = await GET(makeRequest(`${URL_EPISTEMIC}?view=board`));
    expect(getRes.status).toBe(401);
    const postRes = await POST(makePost({ action: "reject_claim", claimId: "clm-x" }));
    expect(postRes.status).toBe(401);
  });

  test("production with dev bypass headers → 401 (dev headers prohibited in production)", async () => {
    setNodeEnv("production");
    const getRes = await GET(
      makeRequest(`${URL_EPISTEMIC}?view=board`, {
        "x-samjuniors-dev-as": "founder",
        "x-samjuniors-dev-secret": "anything",
      })
    );
    expect(getRes.status).toBe(401);
    const postRes = await POST(
      makePost({ action: "submit_claim", statement: "x", subject: "y" }, {
        "x-samjuniors-dev-as": "founder",
        "x-samjuniors-dev-secret": "anything",
      })
    );
    expect(postRes.status).toBe(401);
  });
});
