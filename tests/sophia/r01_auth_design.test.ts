import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

/**
 * ============================================================================
 * R0.1 — AUTHENTICATION HARDENING REGRESSION SUITE
 * ============================================================================
 *
 * Pins the corrected client/server trust boundary for the development-secret
 * founder authentication mechanism:
 *
 *   1. NO server authentication secret is exposed to the client: the client
 *      adapter (src/os/lib/runtime.ts) contains no NEXT_PUBLIC_ secret read,
 *      attaches no founder credentials, and writes no credential cookies.
 *   2. POST /api/auth/founder-session is the server-validated exchange:
 *      fail-closed when SAMJUNIORS_DEV_SECRET is unset (any mode), 401 on
 *      wrong/missing secret, HttpOnly+Secure(in production)+SameSite=Lax
 *      cookies on success, cookie-syntax-unsafe configured secrets rejected.
 *   3. The minted cookies authenticate a REAL guarded route handler (the
 *      same validators R0 installed), including through the executive
 *      middleware (proxy.ts) — both layers exercised together.
 *   4. Client-visible values alone never authenticate: the removed hardcoded
 *      fallback ("samjuniors_dev_secret_local"), the literal token "founder",
 *      and empty values all fail closed.
 *   5. Development behavior is unchanged: routes stay open with no secret
 *      configured; the exchange is usable in dev when a secret exists.
 *   6. Authentication precedes any session minting (no cookies on 401s) and
 *      DELETE logs out (clears both cookies).
 *
 * Session expiry is browser-enforced via Max-Age (7 days) on the HttpOnly
 * cookies — the server-side pair is a long-lived credential by design; no
 * server-side session TTL exists (documented limitation, see R0.1 report).
 */

// --- routes / middleware under test -----------------------------------------
import { POST as login, DELETE as logout } from '../../src/app/api/auth/founder-session/route';
import { GET as integrationsStatus } from '../../src/app/api/integrations/status/route';
import { proxy as gatewayProxy } from '../../src/proxy';

const BASE = 'http://localhost:3000';
const CLIENT_ADAPTER = path.resolve(process.cwd(), 'src', 'os', 'lib', 'runtime.ts');
const SRC_DIR = path.resolve(process.cwd(), 'src');

const CORRECT_SECRET = 'r01-test-secret-do-not-use-in-prod-77c1d2e3f4';
const WRONG_SECRET = 'r01-wrong-secret-0000000000000000000000';
const REMOVED_FALLBACK = 'samjuniors_dev_secret_local'; // the old client-hardcoded default — must NEVER authenticate

function loginReq(secret: unknown): NextRequest {
  return new NextRequest(`${BASE}/api/auth/founder-session`, {
    method: 'POST',
    body: JSON.stringify(typeof secret === 'string' ? { secret } : {}),
    headers: { 'content-type': 'application/json' },
  }) as NextRequest;
}

function statusReq(cookieHeader?: string, extraHeaders?: Record<string, string>): NextRequest {
  const headers: Record<string, string> = { ...(extraHeaders || {}) };
  if (cookieHeader) headers.cookie = cookieHeader;
  return new NextRequest(`${BASE}/api/integrations/status`, { method: 'GET', headers }) as NextRequest;
}

function orchestrateReq(headers?: Record<string, string>): NextRequest {
  return new NextRequest(`${BASE}/api/orchestrate`, { method: 'GET', headers }) as NextRequest;
}

/** Multi-value Set-Cookie extraction that works under bun's fetch Headers. */
function getSetCookies(res: Response): string[] {
  const anyRes = res as unknown as { headers: { getSetCookie?: () => string[] } };
  if (typeof anyRes.headers.getSetCookie === 'function') {
    return anyRes.headers.getSetCookie();
  }
  const joined = res.headers.get('set-cookie');
  return joined ? joined.split(/,(?=[^;]+=)/) : [];
}

/** "samjuniors-dev-as=founder; Path=/; HttpOnly; ..." → "samjuniors-dev-as=founder" */
function cookiePairFromSetCookie(setCookies: string[]): string {
  const pair = setCookies
    .map((c) => c.split(';')[0].trim())
    .filter((c) => c.startsWith('samjuniors-dev-as=') || c.startsWith('samjuniors-dev-secret='));
  assert.strictEqual(pair.length, 2, `expected both session cookies, got: ${pair.length}`);
  return pair.join('; ');
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

async function runTests() {
  console.log('\n======================================================');
  console.log('R0.1 AUTHENTICATION HARDENING REGRESSION SUITE');
  console.log('======================================================\n');

  const ENV = process.env as Record<string, string | undefined>;
  const originalNodeEnv = ENV.NODE_ENV;
  const originalSecret = ENV.SAMJUNIORS_DEV_SECRET;

  const setMode = (nodeEnv: string | undefined, secret: string | undefined) => {
    if (nodeEnv === undefined) delete ENV.NODE_ENV;
    else ENV.NODE_ENV = nodeEnv;
    if (secret === undefined) delete ENV.SAMJUNIORS_DEV_SECRET;
    else ENV.SAMJUNIORS_DEV_SECRET = secret;
  };

  // ---------------------------------------------------------------------
  // 1. Source-level trust boundary: the client ships NO credential material.
  // ---------------------------------------------------------------------
  await test('client adapter (runtime.ts) contains no client-bundle secret mechanism', async () => {
    const src = fs.readFileSync(CLIENT_ADAPTER, 'utf-8');
    assert.ok(!src.includes('NEXT_PUBLIC_SAMJUNIORS_DEV_SECRET'), 'client must not read a NEXT_PUBLIC auth secret');
    assert.ok(!src.includes('samjuniors-dev-secret'), 'client must not attach or write the credential');
    assert.ok(!src.includes('samjuniors-dev-as'), 'client must not attach or write the credential identity');
    assert.ok(!src.includes('getDevAuthHeaders'), 'removed helper must stay removed');
    assert.ok(!src.includes('document.cookie'), 'client must not write credential cookies');
  });

  await test('no src/ file references a NEXT_PUBLIC_ authentication secret', async () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          if (fs.readFileSync(p, 'utf-8').includes('NEXT_PUBLIC_SAMJUNIORS_DEV_SECRET')) offenders.push(p);
        }
      }
    };
    walk(SRC_DIR);
    assert.deepStrictEqual(offenders, [], 'no source file may expose the auth secret to the client bundle');
  });

  // ---------------------------------------------------------------------
  // 2. The server-validated exchange, production mode.
  // ---------------------------------------------------------------------
  setMode('production', CORRECT_SECRET);

  await test('prod, secret unset → exchange fails closed (401), no cookies minted', async () => {
    setMode('production', undefined);
    try {
      const res = await login(loginReq(CORRECT_SECRET));
      assert.strictEqual(res.status, 401, 'unconfigured server must refuse to mint sessions');
      assert.ok(!getSetCookies(res).some((c) => c.startsWith('samjuniors-dev-')), 'no credential cookies on 401');
    } finally {
      setMode('production', CORRECT_SECRET);
    }
  });

  await test('prod wrong secret → 401, no cookies minted', async () => {
    const res = await login(loginReq(WRONG_SECRET));
    assert.strictEqual(res.status, 401);
    assert.ok(!getSetCookies(res).some((c) => c.startsWith('samjuniors-dev-')), 'failed auth must not set cookies');
  });

  await test('prod missing body → 401', async () => {
    const res = await login(loginReq(undefined));
    assert.strictEqual(res.status, 401);
  });

  await test('prod correct secret → 200 + HttpOnly/Secure/SameSite=Lax cookies with 7-day Max-Age', async () => {
    const res = await login(loginReq(CORRECT_SECRET));
    assert.strictEqual(res.status, 200, `valid founder secret must mint a session, got ${res.status}`);
    const setCookies = getSetCookies(res);
    const asCookie = setCookies.find((c) => c.startsWith('samjuniors-dev-as='));
    const secretCookie = setCookies.find((c) => c.startsWith('samjuniors-dev-secret='));
    assert.ok(asCookie && secretCookie, 'both session cookies must be set');
    for (const c of [asCookie, secretCookie]) {
      assert.ok(/;\s*HttpOnly/i.test(c), 'cookie must be HttpOnly (JS-unreadable)');
      assert.ok(/;\s*Secure/i.test(c), 'production cookie must carry Secure');
      assert.ok(/;\s*SameSite=Lax/i.test(c), 'cookie must be SameSite=Lax');
      const maxAge = /Max-Age=(\d+)/i.exec(c);
      assert.ok(maxAge, 'cookie must advertise Max-Age');
      assert.strictEqual(parseInt(maxAge[1], 10), 7 * 24 * 60 * 60, 'session expiry is browser-enforced at 7 days');
    }
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.role, 'FOUNDER');
  });

  await test('minted cookies authenticate a real guarded route handler (login → cookie echo → route)', async () => {
    const loginRes = await login(loginReq(CORRECT_SECRET));
    assert.strictEqual(loginRes.status, 200);
    const cookieHeader = cookiePairFromSetCookie(getSetCookies(loginRes));
    const res = await integrationsStatus(statusReq(cookieHeader));
    assert.notStrictEqual(res.status, 401, `exchange-minted cookies must authenticate, got ${res.status}`);
  });

  await test('minted cookies + forged role header → 401 (role overrides stay prohibited in production)', async () => {
    const loginRes = await login(loginReq(CORRECT_SECRET));
    const cookieHeader = cookiePairFromSetCookie(getSetCookies(loginRes));
    const res = await integrationsStatus(statusReq(cookieHeader, { 'x-samjuniors-role': 'FOUNDER' }));
    assert.strictEqual(res.status, 401, 'a forged role header must void the session, not upgrade it');
  });

  await test('cookie-syntax-unsafe configured secret → 400 (never mints a broken session)', async () => {
    setMode('production', 'bad;secret value');
    try {
      const res = await login(loginReq('bad;secret value'));
      assert.strictEqual(res.status, 400, 'unsafe secret must be rejected, got ' + res.status);
      assert.ok(!getSetCookies(res).some((c) => c.startsWith('samjuniors-dev-')), 'no cookies minted on 400');
    } finally {
      setMode('production', CORRECT_SECRET);
    }
  });

  // ---------------------------------------------------------------------
  // 3. Middleware + route handler together (both layers, same env state).
  // ---------------------------------------------------------------------
  await test('middleware (proxy.ts): prod, no credentials → executive route blocked 401 before any handler', async () => {
    const res = gatewayProxy(orchestrateReq());
    assert.strictEqual(res.status, 401, 'middleware must fail closed');
    assert.ok((res.headers.get('content-type') || '').includes('application/json'));
    const body = await res.json();
    assert.ok(String(body.error).includes('Founder'), 'honest 401 body');
  });

  await test('middleware (proxy.ts): prod, valid header pair → request passes through to the handler', async () => {
    const res = gatewayProxy(
      orchestrateReq({ 'x-samjuniors-dev-as': 'founder', 'x-samjuniors-dev-secret': CORRECT_SECRET })
    );
    assert.notStrictEqual(res.status, 401, 'valid founder credentials must pass the middleware');
    assert.strictEqual(res.headers.get('x-middleware-next'), '1', 'middleware must continue the request');
    assert.ok(res.headers.get('x-request-id'), 'security headers still applied');
  });

  await test('middleware (proxy.ts): prod, forged role header with valid pair → blocked 401', async () => {
    const res = gatewayProxy(
      orchestrateReq({
        'x-samjuniors-role': 'FOUNDER',
        'x-samjuniors-dev-as': 'founder',
        'x-samjuniors-dev-secret': CORRECT_SECRET,
      })
    );
    assert.strictEqual(res.status, 401, 'role override headers must be prohibited in production');
  });

  // ---------------------------------------------------------------------
  // 4. Client-visible values alone must NEVER authenticate.
  // ---------------------------------------------------------------------
  await test('removed hardcoded fallback "samjuniors_dev_secret_local" never authenticates', async () => {
    const loginRes = await login(loginReq(REMOVED_FALLBACK));
    assert.strictEqual(loginRes.status, 401, 'the old client-baked default must be dead as a credential');
    const routeRes = await integrationsStatus(
      statusReq(`samjuniors-dev-as=founder; samjuniors-dev-secret=${REMOVED_FALLBACK}`)
    );
    assert.strictEqual(routeRes.status, 401, 'the old client-baked default must be dead on guarded routes too');
  });

  await test('the literal token "founder" is not a secret', async () => {
    const res = await integrationsStatus(statusReq('samjuniors-dev-as=founder; samjuniors-dev-secret=founder'));
    assert.strictEqual(res.status, 401);
  });

  await test('empty cookie values fail closed', async () => {
    const res = await integrationsStatus(statusReq('samjuniors-dev-as=; samjuniors-dev-secret='));
    assert.strictEqual(res.status, 401);
  });

  await test('no credentials at all → 401 on guarded route (missing session)', async () => {
    const res = await integrationsStatus(statusReq());
    assert.strictEqual(res.status, 401);
  });

  // ---------------------------------------------------------------------
  // 5. Development behavior is unchanged (documented policy).
  // ---------------------------------------------------------------------
  await test('dev, no secret configured → guarded routes stay open (sandbox by design)', async () => {
    setMode('development', undefined);
    try {
      const res = await integrationsStatus(statusReq());
      assert.notStrictEqual(res.status, 401, 'development must not require credentials');
    } finally {
      setMode('development', CORRECT_SECRET);
    }
  });

  await test('dev middleware: requests pass through without credentials', async () => {
    setMode('development', undefined);
    try {
      const res = gatewayProxy(orchestrateReq());
      assert.notStrictEqual(res.status, 401, 'dev middleware must not block');
      assert.strictEqual(res.headers.get('x-middleware-next'), '1');
    } finally {
      setMode('development', CORRECT_SECRET);
    }
  });

  await test('dev with a configured secret: exchange still works (no Secure flag on http://localhost)', async () => {
    const res = await login(loginReq(CORRECT_SECRET));
    assert.strictEqual(res.status, 200, 'exchange must be usable in dev when a secret exists');
    const setCookies = getSetCookies(res);
    for (const c of setCookies.filter((x) => x.startsWith('samjuniors-dev-'))) {
      assert.ok(/;\s*HttpOnly/i.test(c), 'dev cookies are still HttpOnly');
      assert.ok(!/;\s*Secure/i.test(c), 'dev cookies must not require TLS (localhost)');
    }
  });

  await test('dev with a configured secret: wrong secret still 401 (no dev bypass in the exchange)', async () => {
    const res = await login(loginReq(WRONG_SECRET));
    assert.strictEqual(res.status, 401, 'the exchange validates in dev too — it never passes open');
  });

  // ---------------------------------------------------------------------
  // 6. Logout clears the session cookies.
  // ---------------------------------------------------------------------
  await test('DELETE /api/auth/founder-session logs out (clears both cookies)', async () => {
    const res = await logout(new NextRequest(`${BASE}/api/auth/founder-session`, { method: 'DELETE' }) as never);
    assert.strictEqual(res.status, 200);
    const cleared = getSetCookies(res).filter((c) => c.startsWith('samjuniors-dev-'));
    assert.strictEqual(cleared.length, 2, 'both cookies must be cleared');
    for (const c of cleared) {
      assert.ok(/Max-Age=0/i.test(c), 'cleared cookies must expire immediately');
    }
  });

  // Restore the process environment exactly as found.
  setMode(originalNodeEnv, originalSecret);

  console.log('\n======================================================');
  console.log(`R0.1 AUTH DESIGN RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
