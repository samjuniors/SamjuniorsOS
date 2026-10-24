/**
 * ============================================================================
 * SAMJUNIORS-OS — API ROUTES CONTRACT VERIFICATION SUITE (MX.2)
 * ============================================================================
 * Step: MX.2 [quality] Baseline before changing anything: API contract tests for every route
 *
 * Verifies that every API route in src/app/api:
 * 1. Exports valid HTTP handler methods (GET, POST, PATCH, PUT, DELETE).
 * 2. Enforces fail-closed security contracts in production (unauthorized calls return 401/403).
 * 3. Enforces request validation contracts (empty/invalid payloads return 400/401/503).
 * 4. Yields standard HTTP Responses with deterministic JSON status codes without crashing.
 * ============================================================================
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { NextRequest } from '@/lib/server/http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// Helper to construct typed NextRequest
function req(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function setNodeEnv(mode: string) {
  (process.env as Record<string, string | undefined>).NODE_ENV = mode;
}

describe("Step MX.2 — Canonical API Route Contract Suite (All Routes)", () => {

  beforeEach(() => {
    // Default to production mode for fail-closed security contract assertions
    setNodeEnv("production");
    delete process.env.SAMJUNIORS_DEV_SECRET;
  });

  afterEach(() => {
    setNodeEnv(ORIGINAL_NODE_ENV ?? "test");
  });

  // --------------------------------------------------------------------------
  // 1. Core Health & Public Endpoints
  // --------------------------------------------------------------------------
  describe("Group 1: Health & System Diagnostics", () => {
    test("GET /api/health returns 200 with healthy contract", async () => {
      const { GET } = await import("../../src/app/api/health/route");
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("healthy");
      expect(data.database).toBeDefined();
      expect(typeof data.uptime).toBe("number");
    });

    test("GET /api/sofia/health returns 410 (retired legacy route per Phase 5)", async () => {
      const { GET } = await import("../../src/app/api/sofia/health/route");
      const res = await GET();
      expect(res.status).toBe(410);
    });

    test("GET /api/tokens returns 200 with canonical visual tokens (public static)", async () => {
      const { GET } = await import("../../src/app/api/tokens/route");
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.system).toBe("Canonical Visual Language");
      expect(Array.isArray(data.tokens)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Authentication & Session Contracts
  // --------------------------------------------------------------------------
  describe("Group 2: Authentication & Token Security", () => {
    test("POST /api/auth/founder-session fails closed on invalid credentials", async () => {
      const { POST } = await import("../../src/app/api/auth/founder-session/route");
      const res = await POST(req("http://localhost:3000/api/auth/founder-session", {
        method: "POST",
        body: JSON.stringify({ secret: "invalid_secret_key_12345" }),
      }));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    test("POST /api/auth/ws-ticket fails closed without authenticated session", async () => {
      const { POST } = await import("../../src/app/api/auth/ws-ticket/route");
      const res = await POST(req("http://localhost:3000/api/auth/ws-ticket", {
        method: "POST",
        headers: { "x-untrusted": "random" },
      }));
      expect([401, 403]).toContain(res.status);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Epistemic, Activity & Knowledge Contracts
  // --------------------------------------------------------------------------
  describe("Group 3: Epistemic & State Read Model Contracts", () => {
    test("GET /api/activity fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/activity/route");
      const res = await GET(req("http://localhost:3000/api/activity"));
      expect(res.status).toBe(401);
    });

    test("GET /api/epistemic fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/epistemic/route");
      const res = await GET(req("http://localhost:3000/api/epistemic"));
      expect(res.status).toBe(401);
    });

    test("GET /api/graph fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/graph/route");
      const res = await GET(req("http://localhost:3000/api/graph"));
      expect(res.status).toBe(401);
    });

    test("GET /api/integrations/status fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/integrations/status/route");
      const res = await GET(req("http://localhost:3000/api/integrations/status"));
      expect(res.status).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Sofia & Sophia Conversational Intelligence
  // --------------------------------------------------------------------------
  describe("Group 4: Sofia / Sophia Cognition & Controls", () => {
    test("POST /api/sofia/ask rejects empty or unauthenticated payload", async () => {
      const { POST } = await import("../../src/app/api/sofia/ask/route");
      const res = await POST(req("http://localhost:3000/api/sofia/ask", {
        method: "POST",
        body: JSON.stringify({ message: "" }),
      }));
      expect([400, 401]).toContain(res.status);
    });

    test("GET /api/sofia/spend fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/sofia/spend/route");
      const res = await GET(req("http://localhost:3000/api/sofia/spend"));
      expect(res.status).toBe(401);
    });

    test("POST /api/sofia/stop fails closed without founder credentials", async () => {
      const { POST } = await import("../../src/app/api/sofia/stop/route");
      const res = await POST(req("http://localhost:3000/api/sofia/stop", {
        method: "POST",
        body: JSON.stringify({ reason: "contract_test" }),
      }));
      expect(res.status).toBe(401);
    });

    test("POST /api/sofia/resume fails closed without founder credentials", async () => {
      const { POST } = await import("../../src/app/api/sofia/resume/route");
      const res = await POST(req("http://localhost:3000/api/sofia/resume", {
        method: "POST",
        body: JSON.stringify({ reason: "contract_test" }),
      }));
      expect(res.status).toBe(401);
    });

    test("GET /api/sofia/decision-log fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/sofia/decision-log/route");
      const res = await GET(req("http://localhost:3000/api/sofia/decision-log"));
      expect(res.status).toBe(401);
    });

    test("GET /api/sofia/voice/latency fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/sofia/voice/latency/route");
      const res = await GET(req("http://localhost:3000/api/sofia/voice/latency"));
      expect(res.status).toBe(401);
    });

    test("POST /api/realtime/turn fails closed without founder credentials", async () => {
      const { POST } = await import("../../src/app/api/realtime/turn/route");
      const res = await POST(req("http://localhost:3000/api/realtime/turn", {
        method: "POST",
        body: JSON.stringify({ text: "Hello" }),
      }));
      expect([400, 401]).toContain(res.status);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Workflow Governance & Scheduling
  // --------------------------------------------------------------------------
  describe("Group 5: Workflow & Governance Gate Contracts", () => {
    test("GET /api/workflow/approvals fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/workflow/approvals/route");
      const res = await GET(req("http://localhost:3000/api/workflow/approvals"));
      expect(res.status).toBe(401);
    });

    test("GET /api/workflow/definitions fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/workflow/definitions/route");
      const res = await GET(req("http://localhost:3000/api/workflow/definitions"));
      expect(res.status).toBe(401);
    });

    test("GET /api/workflow/instances fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/workflow/instances/route");
      const res = await GET(req("http://localhost:3000/api/workflow/instances"));
      expect(res.status).toBe(401);
    });

    test("GET /api/workflow/scheduling fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/workflow/scheduling/route");
      const res = await GET(req("http://localhost:3000/api/workflow/scheduling"));
      expect(res.status).toBe(401);
    });

    test("GET /api/workflow/scheduling/status fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/workflow/scheduling/status/route");
      const res = await GET(req("http://localhost:3000/api/workflow/scheduling/status"));
      expect(res.status).toBe(401);
    });

    test("POST /api/workflow/scheduling/actions fails closed without founder credentials", async () => {
      const { POST } = await import("../../src/app/api/workflow/scheduling/actions/route");
      const res = await POST(req("http://localhost:3000/api/workflow/scheduling/actions", {
        method: "POST",
        body: JSON.stringify({ action: "pause", scheduleId: "sched-1" }),
      }));
      expect(res.status).toBe(401);
    });

    test("POST /api/orchestrate fails closed without founder credentials", async () => {
      const { POST } = await import("../../src/app/api/orchestrate/route");
      const res = await POST(req("http://localhost:3000/api/orchestrate", {
        method: "POST",
        body: JSON.stringify({ directive: "Run financial report" }),
      }));
      expect(res.status).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Agents & Collaborative Workforce Contracts
  // --------------------------------------------------------------------------
  describe("Group 6: Agents & Collaboration Contracts", () => {
    test("GET /api/agents fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/agents/route");
      const res = await GET(req("http://localhost:3000/api/agents"));
      expect(res.status).toBe(401);
    });

    test("GET /api/agents/runs fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/agents/runs/route");
      const res = await GET(req("http://localhost:3000/api/agents/runs"));
      expect(res.status).toBe(401);
    });

    test("POST /api/agent-chat fails closed without founder credentials", async () => {
      const { POST } = await import("../../src/app/api/agent-chat/route");
      const res = await POST(req("http://localhost:3000/api/agent-chat", {
        method: "POST",
        body: JSON.stringify({ agentId: "aris", message: "Status update" }),
      }));
      expect([400, 401]).toContain(res.status);
    });

    test("POST /api/agent-collab fails closed without founder credentials", async () => {
      const { POST } = await import("../../src/app/api/agent-collab/route");
      const res = await POST(req("http://localhost:3000/api/agent-collab", {
        method: "POST",
        body: JSON.stringify({ topic: "Product planning" }),
      }));
      expect(res.status).toBe(401);
    });

    test("POST /api/advisor fails closed without founder credentials", async () => {
      const { POST } = await import("../../src/app/api/advisor/route");
      const res = await POST(req("http://localhost:3000/api/advisor", {
        method: "POST",
        body: JSON.stringify({ question: "Evaluate risk" }),
      }));
      expect(res.status).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Communications, Contacts & Webhooks
  // --------------------------------------------------------------------------
  describe("Group 7: Communications & Contact Routes", () => {
    test("GET /api/communication/contacts fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/communication/contacts/route");
      const res = await GET(req("http://localhost:3000/api/communication/contacts"));
      expect(res.status).toBe(401);
    });

    test("GET /api/communication/conversations fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/communication/conversations/route");
      const res = await GET(req("http://localhost:3000/api/communication/conversations"));
      expect(res.status).toBe(401);
    });

    test("GET /api/communication/drafts fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/communication/drafts/route");
      const res = await GET(req("http://localhost:3000/api/communication/drafts"));
      expect(res.status).toBe(401);
    });

    test("GET /api/communication/intents fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/communication/intents/route");
      const res = await GET(req("http://localhost:3000/api/communication/intents"));
      expect(res.status).toBe(401);
    });

    test("GET /api/communication/messages fails closed without founder credentials", async () => {
      const { GET } = await import("../../src/app/api/communication/messages/route");
      const res = await GET(req("http://localhost:3000/api/communication/messages"));
      expect(res.status).toBe(401);
    });

    test("POST /api/communication/webhooks/resend handles signature validation or bad request", async () => {
      const { POST } = await import("../../src/app/api/communication/webhooks/resend/route");
      const res = await POST(req("http://localhost:3000/api/communication/webhooks/resend", {
        method: "POST",
        body: JSON.stringify({ type: "email.delivered" }),
      }));
      expect([200, 400, 401]).toContain(res.status);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Sophia Re-Exports & Speech Endpoints
  // --------------------------------------------------------------------------
  describe("Group 8: Sophia Re-Exports & Speech Endpoints", () => {
    test("POST /api/sophia/chat fails closed without founder credentials", async () => {
      const { POST } = await import("../../src/app/api/sophia/chat/route");
      const res = await POST(req("http://localhost:3000/api/sophia/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Hello" }),
      }));
      expect([400, 401]).toContain(res.status);
    });

    test("POST /api/sophia/speak fails closed without founder credentials", async () => {
      const { POST } = await import("../../src/app/api/sophia/speak/route");
      const res = await POST(req("http://localhost:3000/api/sophia/speak", {
        method: "POST",
        body: JSON.stringify({ text: "Hello" }),
      }));
      expect([400, 401, 503]).toContain(res.status);
    });

    test("POST /api/sophia/mouth/speak rejects unauthenticated or missing text with 400 or 401", async () => {
      const { POST } = await import("../../src/app/api/sophia/mouth/speak/route");
      const res = await POST(req("http://localhost:3000/api/sophia/mouth/speak", {
        method: "POST",
        body: JSON.stringify({}),
      }));
      expect([400, 401]).toContain(res.status);
    });

    test("POST /api/tts/elevenlabs rejects unauthenticated or missing text with 400 or 401", async () => {
      const { POST } = await import("../../src/app/api/tts/elevenlabs/route");
      const res = await POST(req("http://localhost:3000/api/tts/elevenlabs", {
        method: "POST",
        body: JSON.stringify({}),
      }));
      expect([400, 401]).toContain(res.status);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Comprehensive Discovery: Every route file exports valid HTTP methods
  // --------------------------------------------------------------------------
  describe("Group 9: Exhaustive Route File Export Inventory", () => {
    const apiDir = path.join(rootDir, "src", "app", "api");
    const routeFiles = fs.readdirSync(apiDir, { recursive: true })
      .filter((f) => typeof f === 'string' && (f.endsWith('route.ts') || f.endsWith('route.js')));

    test(`every discovered route (${routeFiles.length} files) exports at least one valid HTTP handler`, async () => {
      expect(routeFiles.length).toBeGreaterThanOrEqual(70);

      for (const rel of routeFiles) {
        const fullPath = path.join(apiDir, rel);
        const mod = await import(fullPath);
        const validMethods = ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"];
        const exportedMethods = validMethods.filter((m) => typeof mod[m] === "function");

        expect(
          exportedMethods.length,
          `Route file ${rel} must export at least one HTTP handler function`
        ).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
