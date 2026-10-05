import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

/**
 * ============================================================================
 * R0 SECURITY CLOSURE — ROUTE AUTHENTICATION REGRESSION SUITE
 * ============================================================================
 *
 * Exercises the ACTUAL route handlers (imported directly, invoked as the
 * Next.js server would invoke them) for every route that gained a founder
 * session guard in the R0 pass:
 *
 *   Task-listed:   /api/sofia/{stt,tts,img,media,page,file}
 *                  /api/tts/{elevenlabs,voices}
 *                  /api/integrations/status
 *                  /api/agent-collab
 *                  /api/advisor
 *   Same-class:    /api/communication/{conversations,messages}
 *                  /api/workflow/definitions
 *                  /api/workflow/authorizations/evaluate
 *
 * Contract under test:
 *   1. Development mode stays open by design (single-tenant sandbox).
 *   2. Production WITHOUT SAMJUNIORS_DEV_SECRET fails closed (401) —
 *      misconfiguration can never open the routes.
 *   3. Production WITH a secret: no credentials → 401; wrong secret → 401;
 *      dev-as without secret → 401; forged role headers → 401; correct
 *      header pair → authenticated (non-401); cookie pair (the <img>/iframe
 *      path) → authenticated.
 *   4. Authentication precedes validation and provider work (an
 *      unauthenticated request never reaches route logic).
 */

const AUDITS_FILE = path.resolve(process.cwd(), '.data', 'audits.json');

// Phase 5 (parity-gated retirement): the legacy SOFIA voice-tab routes are
// 410-gone by default (SAMJUNIORS_VOICE_LEGACY unset). This suite pins the
// AUTH contract of those routes, so it runs them in their legacy-enabled
// state; the flag-off 410 matrix (including auth precedence) is pinned by
// tests/sophia/phase5_voice_parity.test.ts section H.
process.env.SAMJUNIORS_VOICE_LEGACY = '1';

// --- routes under test -------------------------------------------------------
import { POST as sofiaStt } from '../../src/app/api/sofia/stt/route';
import { POST as sofiaTts } from '../../src/app/api/sofia/tts/route';
import { GET as sofiaImg } from '../../src/app/api/sofia/img/route';
import { GET as sofiaMedia } from '../../src/app/api/sofia/media/route';
import { GET as sofiaPage } from '../../src/app/api/sofia/page/route';
import { GET as sofiaFile } from '../../src/app/api/sofia/file/route';
import { POST as ttsElevenlabs } from '../../src/app/api/tts/elevenlabs/route';
import { GET as ttsVoices } from '../../src/app/api/tts/voices/route';
import { GET as integrationsStatus } from '../../src/app/api/integrations/status/route';
import { POST as agentCollab } from '../../src/app/api/agent-collab/route';
import { POST as advisor } from '../../src/app/api/advisor/route';
import { GET as commConversations } from '../../src/app/api/communication/conversations/route';
import { GET as commMessages } from '../../src/app/api/communication/messages/route';
import { GET as wfDefinitions } from '../../src/app/api/workflow/definitions/route';
import { POST as wfEvaluate } from '../../src/app/api/workflow/authorizations/evaluate/route';

const BASE = 'http://localhost:3000';

interface RouteCase {
  name: string;
  run: (req: NextRequest) => Promise<Response>;
  url: string;
  build: () => { method: 'GET' | 'POST'; body?: string; headers?: Record<string, string> };
}

/** One case per guarded route: a request that is VALID enough to pass auth,
 * then fails route validation (or succeeds cheaply) — proving the guard
 * itself is the only thing that can produce a 401. */
const ROUTES: RouteCase[] = [
  {
    name: 'POST /api/sofia/stt',
    run: (req) => sofiaStt(req as never),
    url: `${BASE}/api/sofia/stt`,
    build: () => ({ method: 'POST', body: JSON.stringify({}) }),
  },
  {
    name: 'POST /api/sofia/tts',
    run: (req) => sofiaTts(req as never),
    url: `${BASE}/api/sofia/tts`,
    build: () => ({ method: 'POST', body: JSON.stringify({ text: '' }), headers: { 'content-type': 'application/json' } }),
  },
  {
    name: 'GET /api/sofia/img',
    run: (req) => sofiaImg(req as never),
    url: `${BASE}/api/sofia/img`,
    build: () => ({ method: 'GET' }),
  },
  {
    name: 'GET /api/sofia/media',
    run: (req) => sofiaMedia(req as never),
    url: `${BASE}/api/sofia/media`,
    build: () => ({ method: 'GET' }),
  },
  {
    name: 'GET /api/sofia/page',
    run: (req) => sofiaPage(req as never),
    url: `${BASE}/api/sofia/page`,
    build: () => ({ method: 'GET' }),
  },
  {
    name: 'GET /api/sofia/file',
    run: (req) => sofiaFile(req as never),
    url: `${BASE}/api/sofia/file`,
    build: () => ({ method: 'GET' }),
  },
  {
    name: 'POST /api/tts/elevenlabs',
    run: (req) => ttsElevenlabs(req as never),
    url: `${BASE}/api/tts/elevenlabs`,
    build: () => ({ method: 'POST', body: JSON.stringify({ text: 'x' }), headers: { 'content-type': 'application/json' } }),
  },
  {
    name: 'GET /api/tts/voices',
    run: (req) => ttsVoices(req as never),
    url: `${BASE}/api/tts/voices`,
    build: () => ({ method: 'GET' }),
  },
  {
    name: 'GET /api/integrations/status',
    run: (req) => integrationsStatus(req as never),
    url: `${BASE}/api/integrations/status`,
    build: () => ({ method: 'GET' }),
  },
  {
    name: 'POST /api/agent-collab',
    run: (req) => agentCollab(req as never),
    url: `${BASE}/api/agent-collab`,
    build: () => ({ method: 'POST', body: JSON.stringify({}), headers: { 'content-type': 'application/json' } }),
  },
  {
    name: 'POST /api/advisor',
    run: (req) => advisor(req as never),
    url: `${BASE}/api/advisor`,
    build: () => ({ method: 'POST', body: JSON.stringify({}), headers: { 'content-type': 'application/json' } }),
  },
  {
    name: 'GET /api/communication/conversations',
    run: (req) => commConversations(req as never),
    url: `${BASE}/api/communication/conversations`,
    build: () => ({ method: 'GET' }),
  },
  {
    name: 'GET /api/communication/messages',
    run: (req) => commMessages(req as never),
    url: `${BASE}/api/communication/messages`,
    build: () => ({ method: 'GET' }),
  },
  {
    name: 'GET /api/workflow/definitions',
    run: (req) => wfDefinitions(req as never),
    url: `${BASE}/api/workflow/definitions`,
    build: () => ({ method: 'GET' }),
  },
  {
    name: 'POST /api/workflow/authorizations/evaluate',
    run: (req) => wfEvaluate(req as never),
    url: `${BASE}/api/workflow/authorizations/evaluate`,
    build: () => ({ method: 'POST', body: JSON.stringify({}), headers: { 'content-type': 'application/json' } }),
  },
];

function makeReq(route: RouteCase, headers: Record<string, string> = {}): NextRequest {
  const { method, body, headers: bodyHeaders } = route.build();
  return new NextRequest(route.url, {
    method,
    body: method === 'POST' ? body : undefined,
    headers: { ...bodyHeaders, ...headers },
  }) as NextRequest;
}

const CORRECT_SECRET = 'r0-test-secret-do-not-use-in-prod-9f1a2b3c4d';
const WRONG_SECRET = 'r0-wrong-secret-000000000000000000000000';

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

async function runTests() {
  console.log('\n======================================================');
  console.log('R0 ROUTE AUTHENTICATION REGRESSION SUITE');
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

  try {
    // ------------------------------------------------------------------
    // 1. Development mode: every guarded route admits the sandbox founder
    //    session (auth passes; the request then hits ordinary validation
    //    or succeeds — anything but a 401).
    // ------------------------------------------------------------------
    setMode('development', undefined);

    for (const route of ROUTES) {
      await test(`dev: ${route.name} admits the dev founder session (non-401)`, async () => {
        const res = await route.run(makeReq(route));
        assert.notStrictEqual(res.status, 401, `dev mode must not 401; got ${res.status}`);
      });
    }

    // ------------------------------------------------------------------
    // 2. Production WITHOUT SAMJUNIORS_DEV_SECRET (misconfiguration):
    //    every route fails closed.
    // ------------------------------------------------------------------
    setMode('production', undefined);

    for (const route of ROUTES) {
      await test(`prod misconfigured (no secret): ${route.name} fails closed 401`, async () => {
        const res = await route.run(makeReq(route));
        assert.strictEqual(res.status, 401, `expected 401, got ${res.status}`);
      });
    }

    // ------------------------------------------------------------------
    // 3. Production WITH a secret: credential matrix.
    // ------------------------------------------------------------------
    setMode('production', CORRECT_SECRET);

    for (const route of ROUTES) {
      await test(`prod no credentials: ${route.name} → 401`, async () => {
        const res = await route.run(makeReq(route));
        assert.strictEqual(res.status, 401);
      });
    }

    for (const route of ROUTES) {
      await test(`prod wrong secret: ${route.name} → 401`, async () => {
        const res = await route.run(makeReq(route, {
          'x-samjuniors-dev-as': 'founder',
          'x-samjuniors-dev-secret': WRONG_SECRET,
        }));
        assert.strictEqual(res.status, 401);
      });
    }

    for (const route of ROUTES) {
      await test(`prod dev-as without secret: ${route.name} → 401`, async () => {
        const res = await route.run(makeReq(route, { 'x-samjuniors-dev-as': 'founder' }));
        assert.strictEqual(res.status, 401);
      });
    }

    await test('prod correct header pair: /api/sofia/stt authenticated (non-401)', async () => {
      const route = ROUTES[0];
      const res = await route.run(makeReq(route, {
        'x-samjuniors-dev-as': 'founder',
        'x-samjuniors-dev-secret': CORRECT_SECRET,
      }));
      assert.notStrictEqual(res.status, 401, `correct credentials must pass auth; got ${res.status}`);
    });

    await test('prod cookie pair (img-tag path): /api/sofia/img authenticated (non-401)', async () => {
      const route = ROUTES[2];
      const res = await route.run(makeReq(route, {
        cookie: `samjuniors-dev-as=founder; samjuniors-dev-secret=${CORRECT_SECRET}`,
      }));
      assert.notStrictEqual(res.status, 401, `cookie credentials must pass auth; got ${res.status}`);
    });

    await test('prod forged role header is rejected: /api/agent-collab → 401', async () => {
      const route = ROUTES[9];
      const res = await route.run(makeReq(route, {
        'x-samjuniors-role': 'FOUNDER',
        'x-samjuniors-dev-as': 'founder',
        'x-samjuniors-dev-secret': CORRECT_SECRET,
      }));
      assert.strictEqual(res.status, 401, 'role/dev headers are prohibited in production');
    });

    await test('prod cookie pair: /api/agent-collab authenticated (non-401)', async () => {
      const route = ROUTES[9];
      const res = await route.run(makeReq(route, {
        cookie: `samjuniors-dev-as=founder; samjuniors-dev-secret=${CORRECT_SECRET}`,
      }));
      assert.notStrictEqual(res.status, 401);
    });

    await test('auth precedes validation/providers: unauthenticated tts with valid text → 401 (never 400/500)', async () => {
      const res = await sofiaTts(new NextRequest(`${BASE}/api/sofia/tts`, {
        method: 'POST',
        body: JSON.stringify({ text: 'hello world' }),
        headers: { 'content-type': 'application/json' },
      }) as never);
      assert.strictEqual(res.status, 401, 'auth must run before any body validation or provider call');
    });

    await test('sofia/page 401 renders the styled iframe page (not a bare status)', async () => {
      const route = ROUTES[4];
      const res = await route.run(makeReq(route));
      assert.strictEqual(res.status, 401);
      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/html'), 'iframe-honest 401 must be an HTML page');
    });
  } finally {
    // Restore the process environment exactly as found.
    setMode(originalNodeEnv, originalSecret);
    // Restore the durable audits file if any route wrote to it.
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
  console.log(`R0 ROUTE AUTH RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
