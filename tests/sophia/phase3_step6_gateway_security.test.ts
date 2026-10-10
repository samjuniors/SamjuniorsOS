import assert from 'assert';
import { NextRequest } from 'next/server';
import { POST as wsTicketRoute } from '../../src/app/api/auth/ws-ticket/route';
import { POST as liveSessionRoute } from '../../src/app/api/sophia/live/session/route';
import { POST as liveResetRoute } from '../../src/app/api/sophia/live/reset/route';
import { LiveTicketStore } from '../../src/lib/server/live/ticket-store';

/**
 * ============================================================================
 * PHASE 3 STEP 6B — CANONICAL TICKET COMPATIBILITY & GATEWAY SECURITY SUITE
 * ============================================================================
 *
 * Verifies:
 * 1. POST /api/auth/ws-ticket:
 *    - Unauthenticated / non-founder requests fail closed (403).
 *    - Authenticated founder receives single-use 60s ticket with wsPort.
 *    - Ticket format begins with 'ws_live_' and single-use consumption works.
 *
 * 2. POST /api/sophia/live/reset (Orphan Retirement):
 *    - Unauthenticated / non-founder requests fail closed (401) before retirement.
 *    - Authenticated founder receives 410 Gone with canonical route pointing
 *      to /api/auth/ws-ticket and deprecation headers.
 *
 * 3. POST /api/sophia/live/session (Prototype Seam & Raw-Key Non-Exposure):
 *    - Unauthenticated / non-founder requests fail closed (401).
 *    - Missing GEMINI_API_KEY fails closed (503).
 *    - ZERO raw API key exposure:
 *      * In development mode when token minting fails, MUST NOT return raw key (503).
 *      * With SOPHIA_ALLOW_RAW_LIVE_KEY=1 when token minting fails, MUST NOT return raw key (503).
 *      * In production mode when token minting fails, MUST NOT return raw key (503).
 *    - Route compatibility: when Google token minting succeeds, returns valid
 *      ephemeral token with deprecation metadata, and token does not equal apiKey.
 */

const BASE = 'http://localhost:3000';
const TEST_DEV_SECRET = 'step6b-test-dev-secret-9876543210abcdef';

function makeReq(
  url: string,
  options?: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  }
): NextRequest {
  const method = options?.method || 'POST';
  const headers = new Headers(options?.headers || {});
  let body: string | undefined;

  if (options?.body !== undefined) {
    body = JSON.stringify(options.body);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
  }

  return new NextRequest(`${BASE}${url}`, {
    method,
    headers,
    body,
  }) as NextRequest;
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

async function run() {
  console.log('\n======================================================');
  console.log('PHASE 3 STEP 6B: GATEWAY SECURITY & COMPATIBILITY SUITE');
  console.log('======================================================\n');

  const ENV = process.env as Record<string, string | undefined>;
  const origNodeEnv = ENV.NODE_ENV;
  const origDevSecret = ENV.SAMJUNIORS_DEV_SECRET;
  const origGeminiKey = ENV.GEMINI_API_KEY;
  const origGoogleKey = ENV.GOOGLE_API_KEY;
  const origAllowRaw = ENV.SOPHIA_ALLOW_RAW_LIVE_KEY;
  const originalFetch = globalThis.fetch;

  try {
    /* ------------------------------------------------------------------
     * 1. CANONICAL ROUTE: POST /api/auth/ws-ticket
     * ------------------------------------------------------------------ */
    console.log('SECTION 1: Canonical Gateway (/api/auth/ws-ticket)\n');

    // 1A. Production without credentials fails closed (403)
    ENV.NODE_ENV = 'production';
    delete ENV.SAMJUNIORS_DEV_SECRET;

    await test('ws-ticket: unauthenticated prod request fails closed with 403', async () => {
      const res = await wsTicketRoute(makeReq('/api/auth/ws-ticket'));
      assert.strictEqual(res.status, 403, `expected 403, got ${res.status}`);
      const data = await res.json();
      assert(data.error?.includes('Forbidden'), 'reports Forbidden error');
    });

    // 1B. Non-founder role fails closed (403)
    ENV.NODE_ENV = 'development';
    await test('ws-ticket: non-founder role fails closed with 403', async () => {
      const res = await wsTicketRoute(
        makeReq('/api/auth/ws-ticket', {
          headers: { 'x-samjuniors-role': 'AUDITOR' },
        })
      );
      assert.strictEqual(res.status, 403, `expected 403 for non-founder, got ${res.status}`);
    });

    // 1C. Authenticated founder receives ticket and wsPort
    await test('ws-ticket: authenticated founder receives 60s ticket with wsPort', async () => {
      const res = await wsTicketRoute(
        makeReq('/api/auth/ws-ticket', {
          body: { conversationId: 'conv_step6b_test_123' },
        })
      );
      assert.strictEqual(res.status, 200, `expected 200, got ${res.status}`);
      const data = await res.json();
      assert.strictEqual(data.success, true, 'success flag true');
      assert(typeof data.ticket === 'string', 'ticket is string');
      assert(data.ticket.startsWith('ws_live_'), 'ticket begins with ws_live_ prefix');
      assert.strictEqual(data.expiresInSeconds, 60, 'expires in 60 seconds');
      assert.strictEqual(typeof data.wsPort, 'number', 'wsPort is number');

      // Verify single-use consumption in LiveTicketStore
      const ticketStore = LiveTicketStore.getInstance();
      const consumed = ticketStore.consumeTicket(data.ticket);
      assert(consumed !== null, 'ticket successfully consumed on first try');
      assert.strictEqual(consumed?.conversationId, 'conv_step6b_test_123', 'bound conversation preserved');

      const secondAttempt = ticketStore.consumeTicket(data.ticket);
      assert.strictEqual(secondAttempt, null, 'ticket is single-use and invalid on second attempt');
    });

    /* ------------------------------------------------------------------
     * 2. RETIRED ORPHAN ROUTE: POST /api/sophia/live/reset
     * ------------------------------------------------------------------ */
    console.log('\nSECTION 2: Retired Orphan Endpoint (/api/sophia/live/reset)\n');

    // 2A. Unauthenticated production request fails closed with 401 before 410
    ENV.NODE_ENV = 'production';
    delete ENV.SAMJUNIORS_DEV_SECRET;

    await test('live/reset: unauthenticated request fails closed with 401 (auth precedes retirement)', async () => {
      const res = await liveResetRoute(makeReq('/api/sophia/live/reset'));
      assert.strictEqual(res.status, 401, `expected 401, got ${res.status}`);
    });

    // 2B. Non-founder role fails closed with 401
    ENV.NODE_ENV = 'development';
    await test('live/reset: non-founder role fails closed with 401', async () => {
      const res = await liveResetRoute(
        makeReq('/api/sophia/live/reset', {
          headers: { 'x-samjuniors-role': 'AUDITOR' },
        })
      );
      assert.strictEqual(res.status, 401, `expected 401, got ${res.status}`);
    });

    // 2C. Authenticated founder receives honest 410 Gone with canonical route pointer
    await test('live/reset: authenticated founder receives 410 Gone pointing to /api/auth/ws-ticket', async () => {
      const res = await liveResetRoute(makeReq('/api/sophia/live/reset'));
      assert.strictEqual(res.status, 410, `expected 410, got ${res.status}`);
      const data = await res.json();
      assert.strictEqual(data.error, 'endpoint_retired');
      assert.strictEqual(data.canonicalRoute, '/api/auth/ws-ticket');
      assert.strictEqual(res.headers.get('deprecation'), '@deprecated');
      assert(res.headers.get('warning')?.includes('/api/auth/ws-ticket'));
      assert.strictEqual(res.headers.get('x-samjuniors-canonical-route'), '/api/auth/ws-ticket');
    });

    /* ------------------------------------------------------------------
     * 3. PROTOTYPE SEAM: POST /api/sophia/live/session & SECRET CONTAINMENT
     * ------------------------------------------------------------------ */
    console.log('\nSECTION 3: Prototype Seam & Secret Containment (/api/sophia/live/session)\n');

    // 3A. Unauthenticated request fails closed with 401
    ENV.NODE_ENV = 'production';
    delete ENV.SAMJUNIORS_DEV_SECRET;

    await test('live/session: unauthenticated prod request fails closed with 401', async () => {
      const res = await liveSessionRoute(makeReq('/api/sophia/live/session'));
      assert.strictEqual(res.status, 401, `expected 401, got ${res.status}`);
    });

    // 3B. Missing GEMINI_API_KEY fails closed with 503
    ENV.NODE_ENV = 'development';
    delete ENV.GEMINI_API_KEY;
    delete ENV.GOOGLE_API_KEY;

    await test('live/session: missing GEMINI_API_KEY fails closed with 503', async () => {
      const res = await liveSessionRoute(makeReq('/api/sophia/live/session'));
      assert.strictEqual(res.status, 503, `expected 503, got ${res.status}`);
      const data = await res.json();
      assert.strictEqual(data.error, 'GEMINI_API_KEY not configured');
    });

    // 3C. CRITICAL SECURITY TEST: Raw API key is NEVER leaked in development
    const SENSITIVE_KEY = 'AIzaSy_SECRET_KEY_MUST_NEVER_LEAK_99999999';
    ENV.GEMINI_API_KEY = SENSITIVE_KEY;
    ENV.NODE_ENV = 'development';

    // Mock Google authTokens endpoint to fail
    globalThis.fetch = async (url: any) => {
      if (String(url).includes('authTokens')) {
        return new Response(JSON.stringify({ error: 'Google auth token service failure' }), {
          status: 500,
        });
      }
      return originalFetch(url);
    };

    await test('live/session: dev mode NEVER leaks raw GEMINI_API_KEY when token minting fails', async () => {
      const res = await liveSessionRoute(makeReq('/api/sophia/live/session'));
      assert.strictEqual(res.status, 503, `expected 503 fail-closed, got ${res.status}`);
      const rawText = await res.text();
      assert(!rawText.includes(SENSITIVE_KEY), 'RAW API KEY MUST NOT BE PRESENT IN RESPONSE BODY');
      const data = JSON.parse(rawText);
      assert.strictEqual(data.error, 'live-token-unavailable');
      assert.strictEqual(res.headers.get('deprecation'), '@deprecated');
      assert.strictEqual(res.headers.get('x-samjuniors-canonical-route'), '/api/auth/ws-ticket');
    });

    // 3D. CRITICAL SECURITY TEST: SOPHIA_ALLOW_RAW_LIVE_KEY=1 cannot bypass secret protection
    ENV.SOPHIA_ALLOW_RAW_LIVE_KEY = '1';

    await test('live/session: SOPHIA_ALLOW_RAW_LIVE_KEY=1 flag CANNOT bypass raw key suppression', async () => {
      const res = await liveSessionRoute(makeReq('/api/sophia/live/session'));
      assert.strictEqual(res.status, 503, `expected 503 fail-closed, got ${res.status}`);
      const rawText = await res.text();
      assert(!rawText.includes(SENSITIVE_KEY), 'RAW API KEY MUST NOT BE LEAKED EVEN WITH OVERRIDE FLAG');
    });

    // 3E. CRITICAL SECURITY TEST: Raw key non-exposure in production mode
    ENV.NODE_ENV = 'production';
    ENV.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    delete ENV.SOPHIA_ALLOW_RAW_LIVE_KEY;

    await test('live/session: production mode fails closed (503) without exposing raw key', async () => {
      const res = await liveSessionRoute(
        makeReq('/api/sophia/live/session', {
          headers: {
            'x-samjuniors-dev-as': 'founder',
            'x-samjuniors-dev-secret': TEST_DEV_SECRET,
          },
        })
      );
      assert.strictEqual(res.status, 503, `expected 503 fail-closed in prod, got ${res.status}`);
      const rawText = await res.text();
      assert(!rawText.includes(SENSITIVE_KEY), 'RAW KEY MUST NOT LEAK IN PRODUCTION');
    });

    // 3F. Route compatibility when Google authTokens succeeds
    ENV.NODE_ENV = 'development';
    const MINTED_TOKEN_NAME = 'auth_tokens/ephemeral_live_token_778899aabbcc';

    globalThis.fetch = async (url: any) => {
      if (String(url).includes('authTokens')) {
        return new Response(JSON.stringify({ name: MINTED_TOKEN_NAME }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return originalFetch(url);
    };

    await test('live/session: backward-compatible response returned when Google mints token', async () => {
      const res = await liveSessionRoute(
        makeReq('/api/sophia/live/session', {
          body: { voice: 'Fenrir', model: 'models/gemini-3.8-live' },
        })
      );
      assert.strictEqual(res.status, 200, `expected 200 OK, got ${res.status}`);
      const data = await res.json();
      assert.strictEqual(data.token, MINTED_TOKEN_NAME, 'returns Google ephemeral token');
      assert.notStrictEqual(data.token, SENSITIVE_KEY, 'returned token is NOT raw api key');
      assert.strictEqual(data.voice, 'Fenrir', 'honors voice parameter');
      assert.strictEqual(data.model, 'models/gemini-3.8-live', 'honors model parameter');
      assert(typeof data.wsUrl === 'string', 'wsUrl present');
      assert(typeof data.createdAt === 'number', 'createdAt present');
      assert.strictEqual(data.expiresInSeconds, 1800, 'expiresInSeconds present');
      // Deprecation metadata attached
      assert.strictEqual(res.headers.get('deprecation'), '@deprecated');
      assert.strictEqual(res.headers.get('x-samjuniors-canonical-route'), '/api/auth/ws-ticket');
      assert(res.headers.get('warning')?.includes('/api/auth/ws-ticket'));
    });
  } finally {
    ENV.NODE_ENV = origNodeEnv;
    ENV.SAMJUNIORS_DEV_SECRET = origDevSecret;
    ENV.GEMINI_API_KEY = origGeminiKey;
    ENV.GOOGLE_API_KEY = origGoogleKey;
    ENV.SOPHIA_ALLOW_RAW_LIVE_KEY = origAllowRaw;
    globalThis.fetch = originalFetch;
  }

  console.log('\n======================================================');
  console.log(`STEP 6B SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

void run();
