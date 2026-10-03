import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

/**
 * ============================================================================
 * SCHEDULER MACHINE-AUTHENTICATION REGRESSION SUITE (post-reconciliation)
 * ============================================================================
 *
 * Pins the production deployment contract for the scheduler heartbeat's
 * machine credential (CRON_TRIGGER_SECRET / x-cron-secret):
 *
 *   1. MIDDLEWARE ADMISSION (proxy.ts, production): the executive gate
 *      admits the machine credential on EXACTLY POST /api/workflow/scheduling
 *      — the due-work evaluation endpoint the heartbeat wakes. Everything
 *      else stays founder-only:
 *        - GET on the same path (reads) → 401,
 *        - …/actions, …/status, /api/workflow/authorizations/*, any other
 *          executive route with the same valid cron secret → 401,
 *        - role-override headers void the request even with a valid secret.
 *   2. FAIL-CLOSED MATRIX: missing header, wrong secret, wrong-length
 *      secret, empty header, and CRON_TRIGGER_SECRET unset (with any
 *      presented value) all reject; the admission can never open when the
 *      server secret is unconfigured.
 *   3. FOUNDER PATH UNCHANGED: header pair and cookie pair still pass; a
 *      request with BOTH an invalid cron secret and valid founder
 *      credentials still passes (the fall-through is the founder check);
 *      development mode stays open by design.
 *   4. STATELESS DUPLICATES: identical valid requests pass identically
 *      (retry/duplicate invocations are safe at the gate; occurrence
 *      idempotency + leases are enforced route-side and covered by the
 *      scheduling suites).
 *   5. SOURCE-LEVEL GUARDS: the middleware admission is path- and
 *      method-scoped in source; proxy.ts logs nothing (no secret/header
 *      logging); the heartbeat service targets ONLY the evaluation endpoint,
 *      presents ONLY x-cron-secret (never founder credentials), and keeps
 *      its fail-closed startup guard.
 *
 * Route-level machine auth (the POST handler's own founder-OR-cron check,
 * triggerSource attribution, lifecycle/actions founder-only) is covered by
 * tests/api/scheduling.auth.test.ts and tests/api/schedule-lifecycle.auth.test.ts.
 */

import { proxy as gatewayProxy } from '../../src/proxy';

const BASE = 'http://localhost:3000';
const PROXY_SRC = path.resolve(process.cwd(), 'src', 'proxy.ts');
const HEARTBEAT_SRC = path.resolve(process.cwd(), 'mini-services', 'scheduler-heartbeat', 'index.ts');

const CRON_SECRET = 'cron-machine-secret-4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c';
const WRONG_CRON_SECRET = 'wrong-cron-secret-000000000000000000000000000000';
const FOUNDER_SECRET = 'founder-test-secret-5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a';

function req(
  pathname: string,
  method: 'GET' | 'POST',
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`${BASE}${pathname}`, {
    method,
    headers: method === 'POST' ? { 'content-type': 'application/json', ...headers } : headers,
    ...(method === 'POST' ? { body: JSON.stringify({}) } : {}),
  }) as NextRequest;
}

function cronReq(pathname = '/api/workflow/scheduling', secret: string | undefined = CRON_SECRET, method: 'GET' | 'POST' = 'POST') {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers['x-cron-secret'] = secret;
  return req(pathname, method, headers);
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failed++;
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('SCHEDULER MACHINE-AUTH REGRESSION SUITE');
  console.log('======================================================\n');

  const ENV = process.env as Record<string, string | undefined>;
  const originalNodeEnv = ENV.NODE_ENV;
  const originalCron = ENV.CRON_TRIGGER_SECRET;
  const originalFounder = ENV.SAMJUNIORS_DEV_SECRET;

  const setMode = (
    nodeEnv: string | undefined,
    cron: string | undefined,
    founder: string | undefined
  ) => {
    if (nodeEnv === undefined) delete ENV.NODE_ENV;
    else ENV.NODE_ENV = nodeEnv;
    if (cron === undefined) delete ENV.CRON_TRIGGER_SECRET;
    else ENV.CRON_TRIGGER_SECRET = cron;
    if (founder === undefined) delete ENV.SAMJUNIORS_DEV_SECRET;
    else ENV.SAMJUNIORS_DEV_SECRET = founder;
  };

  const assertRejected = (res: Response, why: string) => {
    assert.strictEqual(res.status, 401, `${why}: expected 401, got ${res.status}`);
  };
  const assertAdmitted = (res: Response, why: string) => {
    assert.notStrictEqual(res.status, 401, `${why}: must not be 401, got ${res.status}`);
    assert.strictEqual(res.headers.get('x-middleware-next'), '1', `${why}: middleware must continue the request`);
    assert.ok(res.headers.get('x-request-id'), `${why}: security headers still applied`);
  };

  try {
    // -------------------------------------------------------------------
    // 1. Production admission: the machine credential opens EXACTLY the
    //    heartbeat's endpoint+method and nothing else.
    // -------------------------------------------------------------------
    setMode('production', CRON_SECRET, FOUNDER_SECRET);

    await test('prod: valid x-cron-secret + POST /api/workflow/scheduling → admitted (the heartbeat path)', async () => {
      assertAdmitted(gatewayProxy(cronReq()), 'valid machine credential on the evaluation endpoint');
    });

    await test('prod: valid cron secret + GET same path → 401 (scheduler reads stay founder-only)', async () => {
      assertRejected(gatewayProxy(cronReq('/api/workflow/scheduling', CRON_SECRET, 'GET')), 'GET with machine credential');
    });

    await test('prod: valid cron secret + POST /api/workflow/scheduling/actions → 401 (lifecycle is founder-only)', async () => {
      assertRejected(gatewayProxy(cronReq('/api/workflow/scheduling/actions')), 'machine credential on schedule lifecycle');
    });

    await test('prod: valid cron secret + GET /api/workflow/scheduling/status → 401 (status is founder-only)', async () => {
      assertRejected(gatewayProxy(cronReq('/api/workflow/scheduling/status', CRON_SECRET, 'GET')), 'machine credential on scheduler status');
    });

    await test('prod: valid cron secret + POST /api/workflow/authorizations/evaluate → 401 (machine auth never reaches authorization surfaces)', async () => {
      assertRejected(gatewayProxy(cronReq('/api/workflow/authorizations/evaluate')), 'machine credential on authorizations');
    });

    await test('prod: valid cron secret + POST /api/agent-chat → 401 (admission never generalizes to other executive routes)', async () => {
      assertRejected(gatewayProxy(cronReq('/api/agent-chat')), 'machine credential on a non-scheduler executive route');
    });

    await test('prod: valid cron secret + forged role header → 401 (role-override prohibition precedes machine auth)', async () => {
      const res = gatewayProxy(req('/api/workflow/scheduling', 'POST', { 'x-cron-secret': CRON_SECRET, 'x-samjuniors-role': 'FOUNDER' }));
      assertRejected(res, 'role header with valid cron secret');
      const body = await res.json();
      assert.ok(String(body.error).includes('prohibited'), 'the role-override 401 is the one that fired');
    });

    // -------------------------------------------------------------------
    // 2. Fail-closed matrix on the machine credential.
    // -------------------------------------------------------------------
    await test('prod: missing x-cron-secret header on POST → 401', async () => {
      // NOTE: a bare request (no headers at all) — passing `undefined` to a
      // defaulted parameter would silently send the VALID secret instead.
      assertRejected(gatewayProxy(req('/api/workflow/scheduling', 'POST')), 'absent machine credential');
    });

    await test('prod: wrong cron secret → 401 (constant-time comparison rejects)', async () => {
      assertRejected(gatewayProxy(cronReq('/api/workflow/scheduling', WRONG_CRON_SECRET)), 'wrong machine credential');
    });

    await test('prod: wrong-LENGTH cron secret → 401 (length guard)', async () => {
      assertRejected(gatewayProxy(cronReq('/api/workflow/scheduling', 'short')), 'wrong-length machine credential');
    });

    await test('prod: empty-string cron header → 401 (empty never authenticates)', async () => {
      assertRejected(gatewayProxy(cronReq('/api/workflow/scheduling', '')), 'empty machine credential');
    });

    await test('prod: CRON_TRIGGER_SECRET unset + any presented value → 401 (unconfigured stays closed)', async () => {
      setMode('production', undefined, FOUNDER_SECRET);
      assertRejected(gatewayProxy(cronReq('/api/workflow/scheduling', CRON_SECRET)), 'machine credential with no configured server secret');
      assertRejected(gatewayProxy(req('/api/workflow/scheduling', 'POST')), 'no credential, no configured server secret');
      setMode('production', CRON_SECRET, FOUNDER_SECRET);
    });

    // -------------------------------------------------------------------
    // 3. Founder path unchanged; fall-through semantics.
    // -------------------------------------------------------------------
    await test('prod: founder header pair + POST (no cron) → admitted (manual founder invocation unchanged)', async () => {
      assertAdmitted(
        gatewayProxy(req('/api/workflow/scheduling', 'POST', {
          'x-samjuniors-dev-as': 'founder',
          'x-samjuniors-dev-secret': FOUNDER_SECRET,
        })),
        'founder header pair'
      );
    });

    await test('prod: founder cookie pair + GET status → admitted (cookie path unchanged)', async () => {
      assertAdmitted(
        gatewayProxy(
          req('/api/workflow/scheduling/status', 'GET', {
            cookie: `samjuniors-dev-as=founder; samjuniors-dev-secret=${FOUNDER_SECRET}`,
          })
        ),
        'founder cookie pair'
      );
    });

    await test('prod: INVALID cron secret + VALID founder pair → admitted (fall-through is the founder check)', async () => {
      assertAdmitted(
        gatewayProxy(
          req('/api/workflow/scheduling', 'POST', {
            'x-cron-secret': WRONG_CRON_SECRET,
            'x-samjuniors-dev-as': 'founder',
            'x-samjuniors-dev-secret': FOUNDER_SECRET,
          })
        ),
        'invalid machine credential with valid founder credentials'
      );
    });

    await test('prod: valid cron secret + no founder secret configured → still admitted (machine path is independent of the founder secret)', async () => {
      setMode('production', CRON_SECRET, undefined);
      assertAdmitted(gatewayProxy(cronReq()), 'machine credential with no founder secret configured');
      setMode('production', CRON_SECRET, FOUNDER_SECRET);
    });

    await test('prod: no credentials at all → 401 (the pre-admission default is unchanged)', async () => {
      const res = gatewayProxy(req('/api/workflow/scheduling', 'POST'));
      assertRejected(res, 'no credentials');
      const body = await res.json();
      assert.ok(String(body.error).includes('Founder'), 'honest 401 body');
    });

    // -------------------------------------------------------------------
    // 4. Stateless duplicate/retry behavior + development mode.
    // -------------------------------------------------------------------
    await test('duplicates: identical valid machine requests admit identically (retry-safe gate)', async () => {
      const first = gatewayProxy(cronReq());
      const second = gatewayProxy(cronReq());
      assertAdmitted(first, 'first invocation');
      assertAdmitted(second, 'duplicate invocation');
      assert.strictEqual(first.status, second.status, 'gate decision is stateless/idempotent');
    });

    await test('dev: development mode stays open by design (no credentials needed)', async () => {
      setMode('development', undefined, undefined);
      assertAdmitted(gatewayProxy(req('/api/workflow/scheduling', 'POST')), 'dev mode');
      assertAdmitted(gatewayProxy(req('/api/agent-chat', 'POST')), 'dev mode, executive route');
      setMode('production', CRON_SECRET, FOUNDER_SECRET);
    });

    // -------------------------------------------------------------------
    // 5. Source-level guards.
    // -------------------------------------------------------------------
    await test('source: the middleware admission is path-exact and POST-only', async () => {
      const src = fs.readFileSync(PROXY_SRC, 'utf-8');
      assert.ok(
        src.includes('req.nextUrl.pathname === "/api/workflow/scheduling"'),
        'admission must compare the pathname for exact equality (no prefix/subpath generalization)'
      );
      assert.ok(
        /if\s*\(\s*req\.nextUrl\.pathname === "\/api\/workflow\/scheduling"\s*&&\s*req\.method === "POST"\s*\)/.test(src),
        'the path and method conditions must be ANDed in one guard'
      );
      assert.ok(
        src.includes('constantTimeEquals(presentedCronSecret, cronSecret)'),
        'admission must use the constant-time comparison, never ==='
      );
    });

    await test('source: proxy.ts logs nothing (no credential or header logging in middleware)', async () => {
      const src = fs.readFileSync(PROXY_SRC, 'utf-8');
      assert.ok(!src.includes('console.'), 'the middleware layer must stay logging-free');
    });

    await test('source: the heartbeat targets ONLY the evaluation endpoint and never lifecycle/approval surfaces', async () => {
      const src = fs.readFileSync(HEARTBEAT_SRC, 'utf-8');
      assert.ok(
        src.includes('/api/workflow/scheduling'),
        'heartbeat default target is the scheduling evaluation endpoint'
      );
      assert.ok(!src.includes('/actions'), 'heartbeat must never call the schedule lifecycle route');
      assert.ok(!src.includes('/status'), 'heartbeat must never call the scheduler status route');
      assert.ok(!src.includes('/authorizations'), 'heartbeat must never call authorization surfaces');
    });

    await test('source: the heartbeat presents ONLY the machine credential (never founder identity)', async () => {
      const src = fs.readFileSync(HEARTBEAT_SRC, 'utf-8');
      assert.ok(src.includes('"x-cron-secret"'), 'heartbeat sends the machine credential header');
      assert.ok(!src.includes('x-samjuniors-dev-as'), 'heartbeat must never present founder identity');
      assert.ok(!src.includes('x-samjuniors-dev-secret'), 'heartbeat must never present the founder secret');
      assert.ok(!src.includes('samjuniors-role'), 'heartbeat must never present a role');
    });

    await test('source: the heartbeat keeps its fail-closed startup guard', async () => {
      const src = fs.readFileSync(HEARTBEAT_SRC, 'utf-8');
      assert.ok(
        /if\s*\(!CRON_SECRET\)/.test(src),
        'startup must refuse to run without CRON_TRIGGER_SECRET'
      );
      assert.ok(
        /process\.exit\(1\)/.test(src),
        'the missing-secret startup path must exit non-zero'
      );
    });
  } finally {
    setMode(originalNodeEnv, originalCron, originalFounder);
  }

  console.log('\n======================================================');
  console.log(`SCHEDULER MACHINE-AUTH RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
