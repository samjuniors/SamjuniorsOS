import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

/**
 * ============================================================================
 * R0 SECURITY CLOSURE — REALTIME TOOL GATE REGRESSION SUITE
 * ============================================================================
 *
 * Proves the /api/realtime/turn tool branches (image generation, live web
 * search) execute ONLY through SideEffectAuthorizationGate.executeWithGate:
 *
 *   1. Authorized execution produces a gate audit record (actionName
 *      generate_image / web_search, decision allowed, executed true,
 *      employeeRole system, requestedBy the founder session).
 *   2. A gate DENIAL returns an honest blocked reply — the tool never
 *      executes and there is NO fallback to ungated execution.
 *   3. Authentication precedes the gate: production misconfiguration 401s
 *      before any tool logic.
 *   4. Read-only realtime tool calls are not deduplicated (consistent with
 *      the orchestrator's read_only gate pattern) — each turn audits.
 *
 * The gate singleton is temporarily replaced with a denying evaluator for
 * the denial tests, then restored.
 */

const AUDITS_FILE = path.resolve(process.cwd(), '.data', 'audits.json');

import { POST as realtimeTurn } from '../../src/app/api/realtime/turn/route';
import { SideEffectAuthorizationGate } from '../../src/lib/server/authorization/gate';
import {
  InMemoryApprovalStore,
  InMemoryAuditStore,
} from '../../src/lib/server/authorization/approval-store';
import { SideEffectPolicyEvaluator } from '../../src/lib/server/authorization/policy-evaluator';
import type {
  AuthorizationDecision,
  AuthorizationEvaluationRequest,
} from '../../src/types/authorization';

const BASE = 'http://localhost:3000';

function turnRequest(message: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${BASE}/api/realtime/turn`, {
    method: 'POST',
    body: JSON.stringify({ message, sessionId: 'r0-gate-test-session' }),
    headers: { 'content-type': 'application/json', ...headers },
  }) as NextRequest;
}

/** Audits recorded for one of the new realtime tool action names. */
function auditsFor(actionName: string) {
  return Array.from(InMemoryAuditStore.getInstance().audits.values()).filter(
    (a) => a.actionName === actionName
  );
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failed++;
    process.exitCode = 1;
  }
}

class DenyingEvaluator extends SideEffectPolicyEvaluator {
  async evaluate(_request: AuthorizationEvaluationRequest): Promise<AuthorizationDecision> {
    return {
      effect: 'denied',
      reasonCode: 'DENIED_INVALID_CONTEXT',
      reason: 'R0 test denial: every action denied',
      evaluatedAt: new Date().toISOString(),
      evaluator: 'central_side_effect_gate',
    };
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('R0 REALTIME TOOL GATE REGRESSION SUITE');
  console.log('======================================================\n');

  const ENV = process.env as Record<string, string | undefined>;
  const originalNodeEnv = ENV.NODE_ENV;
  const originalSecret = ENV.SAMJUNIORS_DEV_SECRET;
  let originalAudits: string | null = null;
  if (fs.existsSync(AUDITS_FILE)) {
    originalAudits = fs.readFileSync(AUDITS_FILE, 'utf-8');
  }

  const setMode = (nodeEnv: string | undefined, secret: string | undefined) => {
    if (nodeEnv === undefined) delete ENV.NODE_ENV;
    else ENV.NODE_ENV = nodeEnv;
    if (secret === undefined) delete ENV.SAMJUNIORS_DEV_SECRET;
    else ENV.SAMJUNIORS_DEV_SECRET = secret;
  };

  // The route resolves the gate singleton per request; keep the real one so
  // it can be restored after denial tests.
  const realGate = SideEffectAuthorizationGate.getInstance();
  const swapGate = (gate: SideEffectAuthorizationGate | null) => {
    (SideEffectAuthorizationGate as unknown as { instance: SideEffectAuthorizationGate | null }).instance = gate;
  };

  try {
    setMode('development', undefined);

    // ------------------------------------------------------------------
    // 1. Authorized image generation: tool executes AND audit is recorded.
    //    (generateAiImage is a pure URL builder — no network involved.)
    // ------------------------------------------------------------------
    await test('image generation runs through the gate and is audited', async () => {
      const before = auditsFor('generate_image').length;
      const res = await realtimeTurn(turnRequest('generate an image of a quiet harbor at dawn'));
      const body = await res.json();
      assert.strictEqual(res.status, 200, `expected 200, got ${res.status}`);
      assert.strictEqual(body.success, true, body.error || 'turn must succeed');
      assert.strictEqual(body.detectedIntent, 'tool_generate_image');
      assert.ok(body.action?.imageUrl?.startsWith('https://image.pollinations.ai/prompt/'),
        'image action must carry the generated URL');

      const audits = auditsFor('generate_image');
      assert.strictEqual(audits.length, before + 1, 'exactly one new gate audit must exist');
      const audit = audits[audits.length - 1];
      assert.strictEqual(audit.actionName, 'generate_image');
      assert.strictEqual(audit.actionClassification, 'read_only');
      assert.strictEqual(audit.decision, 'allowed');
      assert.strictEqual(audit.executed, true);
      assert.strictEqual(audit.employeeRole, 'system');
      assert.strictEqual(audit.requestedBy, 'founder-local-session', 'audit must name the founder session');
      assert.strictEqual(audit.target?.targetSystem, 'pollinations');
    });

    await test('two identical image turns audit separately (read_only, no dedup — matches orchestrator pattern)', async () => {
      const before = auditsFor('generate_image').length;
      await realtimeTurn(turnRequest('generate an image of a quiet harbor at dawn'));
      await realtimeTurn(turnRequest('generate an image of a quiet harbor at dawn'));
      assert.strictEqual(auditsFor('generate_image').length, before + 2,
        'read_only realtime tools are not deduplicated; every execution audits');
    });

    // ------------------------------------------------------------------
    // 2. Gate denial on image generation: honest block, no execution,
    //    no fallback path.
    // ------------------------------------------------------------------
    await test('gate denial blocks image generation honestly (no ungated fallback)', async () => {
      swapGate(new SideEffectAuthorizationGate(
        InMemoryApprovalStore.getInstance(),
        InMemoryAuditStore.getInstance(),
        new DenyingEvaluator()
      ));
      try {
        const before = auditsFor('generate_image').length;
        const res = await realtimeTurn(turnRequest('draw a neon city skyline'));
        const body = await res.json();
        assert.strictEqual(body.success, false, 'a denied tool turn must not report success');
        assert.ok(
          typeof body.reply === 'string' && body.reply.includes('blocked by the authorization gate'),
          `reply must state the block honestly, got: ${body.reply}`
        );
        assert.strictEqual(body.action, undefined, 'denied generation must not produce an image action');
        assert.ok(typeof body.error === 'string' && body.error.length > 0, 'denial reason must be surfaced');

        const audits = auditsFor('generate_image');
        assert.strictEqual(audits.length, before + 1, 'the denial itself must be audited');
        const audit = audits[audits.length - 1];
        assert.strictEqual(audit.decision, 'denied');
        assert.strictEqual(audit.executed, false);
      } finally {
        swapGate(realGate);
      }
    });

    // ------------------------------------------------------------------
    // 3. Live web search: gate + audit on the allowed path (the search
    //    provider chain always resolves — DuckDuckGo, Wikipedia, or the
    //    documented fallback result — so the turn succeeds).
    // ------------------------------------------------------------------
    await test('live web search runs through the gate and is audited', async () => {
      const before = auditsFor('web_search').length;
      const res = await realtimeTurn(turnRequest('search the web for samjuniors os'));
      const body = await res.json();
      assert.strictEqual(res.status, 200, `expected 200, got ${res.status}`);
      assert.strictEqual(body.success, true, body.error || 'turn must succeed');
      assert.strictEqual(body.detectedIntent, 'tool_web_search');
      assert.ok(Array.isArray(body.action?.results), 'search action must carry results');

      const audits = auditsFor('web_search');
      assert.strictEqual(audits.length, before + 1, 'exactly one new gate audit must exist');
      const audit = audits[audits.length - 1];
      assert.strictEqual(audit.actionName, 'web_search');
      assert.strictEqual(audit.actionClassification, 'read_only');
      assert.strictEqual(audit.decision, 'allowed');
      assert.strictEqual(audit.executed, true);
      assert.strictEqual(audit.target?.targetSystem, 'web');
    });

    // ------------------------------------------------------------------
    // 4. Gate denial on web search: cannot bypass to a direct search.
    // ------------------------------------------------------------------
    await test('gate denial blocks web search honestly (no ungated fallback)', async () => {
      swapGate(new SideEffectAuthorizationGate(
        InMemoryApprovalStore.getInstance(),
        InMemoryAuditStore.getInstance(),
        new DenyingEvaluator()
      ));
      try {
        const before = auditsFor('web_search').length;
        const res = await realtimeTurn(turnRequest('search the web for anything at all'));
        const body = await res.json();
        assert.strictEqual(body.success, false, 'a denied tool turn must not report success');
        assert.ok(
          typeof body.reply === 'string' && body.reply.includes('blocked by the authorization gate'),
          `reply must state the block honestly, got: ${body.reply}`
        );
        assert.strictEqual(body.action, undefined, 'denied search must not produce results');

        const audits = auditsFor('web_search');
        assert.strictEqual(audits.length, before + 1, 'the denial itself must be audited');
        assert.strictEqual(audits[audits.length - 1].executed, false);
        assert.strictEqual(audits[audits.length - 1].decision, 'denied');
      } finally {
        swapGate(realGate);
      }
    });

    // ------------------------------------------------------------------
    // 5. Authentication precedes the gate entirely.
    // ------------------------------------------------------------------
    setMode('production', undefined);
    await test('production misconfiguration 401s before any tool logic', async () => {
      const beforeImg = auditsFor('generate_image').length;
      const beforeSearch = auditsFor('web_search').length;
      const res = await realtimeTurn(turnRequest('generate an image of a sunset'));
      assert.strictEqual(res.status, 401, 'no secret configured → fail closed');
      assert.strictEqual(auditsFor('generate_image').length, beforeImg, 'no gate audit may be produced');
      assert.strictEqual(auditsFor('web_search').length, beforeSearch, 'no gate audit may be produced');
    });
  } finally {
    setMode(originalNodeEnv, originalSecret);
    swapGate(realGate);
    if (originalAudits !== null) {
      fs.writeFileSync(AUDITS_FILE, originalAudits);
    } else if (fs.existsSync(AUDITS_FILE)) {
      const current = fs.readFileSync(AUDITS_FILE, 'utf-8');
      if (current.trim() === '{}' || current.trim() === '[]') {
        fs.rmSync(AUDITS_FILE);
      }
    }
  }

  console.log('\n======================================================');
  console.log(`R0 REALTIME GATE RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
