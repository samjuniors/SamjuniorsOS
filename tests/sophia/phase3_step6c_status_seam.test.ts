/**
 * ============================================================================
 * PHASE 3 STEP 6C — CANONICAL STATUS & CONFIGURATION SEAM TEST SUITE
 * ============================================================================
 *
 * Verifies Stage 1 of the canonical voice gateway migration:
 *
 * 1. Server-side status payload (sophiaStatusPayload):
 *    - SAMJUNIORS_VOICE_GATEWAY='1' or 'true' sets voiceGateway: true.
 *    - Unset, '0', or invalid values ('2', 'yes', 'enabled') evaluate to false.
 *    - Default liveWsUrl is 'ws://localhost:3001'; custom LIVE_WS_URL is honored.
 *    - legacyVoiceAllowed defaults to false; true only when SAMJUNIORS_LEGACY_VOICE_ALLOWED='true'.
 *
 * 2. Server GET /api/sophia/status route authentication:
 *    - Unauthenticated request fails closed with HTTP 401.
 *    - Non-founder role fails closed with HTTP 401.
 *    - Authenticated founder receives HTTP 200 with complete status schema.
 *
 * 3. Client-side fail-closed resolver (resolveVoiceConfig):
 *    - Valid gateway status resolves to CANONICAL_GATEWAY with valid liveWsUrl.
 *    - Malformed liveWsUrl (not ws:// or wss://) fails closed to CONFIG_UNAVAILABLE.
 *    - False gateway flag with legacyVoiceAllowed=false resolves to VOICE_DISABLED.
 *    - False gateway flag with legacyVoiceAllowed=true resolves to VOICE_ONLY_LEGACY.
 *    - Null, undefined, empty object, or non-object fails closed to CONFIG_UNAVAILABLE.
 *    - Error payload fails closed to CONFIG_UNAVAILABLE.
 *    - Network fetch error or HTTP 500 fails closed to CONFIG_UNAVAILABLE.
 */

import assert from 'assert';
import { NextRequest } from 'next/server';
import { sophiaStatusPayload } from '../../src/lib/server/sophia/sofiaui';
import { GET as statusRoute } from '../../src/app/api/sophia/status/route';
import { resolveVoiceConfig, fetchVoiceConfig } from '../../src/sofia/lib/voice-config';

const BASE = 'http://localhost:3000';
const TEST_DEV_SECRET = 'step6c-test-dev-secret-0123456789abcdef';

function makeReq(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
  }
): NextRequest {
  const method = options?.method || 'GET';
  const headers = new Headers(options?.headers || {});
  return new NextRequest(`${BASE}${url}`, { method, headers });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('PHASE 3 STEP 6C: STATUS & CONFIGURATION SEAM SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function test(desc: string, fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`  [PASS] ${desc}`);
            passed++;
          })
          .catch((err) => {
            console.error(`  [FAIL] ${desc}:`, err.message);
            failed++;
          });
      }
      console.log(`  [PASS] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${desc}:`, err.message);
      failed++;
    }
  }

  // Backup original env
  const origGateway = process.env.SAMJUNIORS_VOICE_GATEWAY;
  const origLegacy = process.env.SAMJUNIORS_LEGACY_VOICE_ALLOWED;
  const origWsUrl = process.env.LIVE_WS_URL;
  const origNodeEnv = process.env.NODE_ENV;
  const origDevSecret = process.env.DEV_FOUNDER_SECRET;

  try {
    process.env.DEV_FOUNDER_SECRET = TEST_DEV_SECRET;

    // ------------------------------------------------------------------------
    // SECTION 1: Server Status Payload Environment Parsing
    // ------------------------------------------------------------------------
    console.log('SECTION 1: Server Status Payload (sophiaStatusPayload)\n');

    process.env.SAMJUNIORS_VOICE_GATEWAY = '1';
    delete process.env.LIVE_WS_URL;
    delete process.env.SAMJUNIORS_LEGACY_VOICE_ALLOWED;
    test('SAMJUNIORS_VOICE_GATEWAY=1 sets voiceGateway=true and default liveWsUrl', () => {
      const p = sophiaStatusPayload();
      assert.strictEqual(p.voiceGateway, true);
      assert.strictEqual(p.liveWsUrl, 'ws://localhost:3001');
      assert.strictEqual(p.legacyVoiceAllowed, false);
    });

    process.env.SAMJUNIORS_VOICE_GATEWAY = 'true';
    test('SAMJUNIORS_VOICE_GATEWAY=true sets voiceGateway=true', () => {
      const p = sophiaStatusPayload();
      assert.strictEqual(p.voiceGateway, true);
    });

    process.env.LIVE_WS_URL = 'wss://os.samjuniors.com/gateway/ws';
    test('LIVE_WS_URL overrides liveWsUrl', () => {
      const p = sophiaStatusPayload();
      assert.strictEqual(p.liveWsUrl, 'wss://os.samjuniors.com/gateway/ws');
    });

    process.env.SAMJUNIORS_VOICE_GATEWAY = '0';
    test('SAMJUNIORS_VOICE_GATEWAY=0 sets voiceGateway=false', () => {
      const p = sophiaStatusPayload();
      assert.strictEqual(p.voiceGateway, false);
    });

    delete process.env.SAMJUNIORS_VOICE_GATEWAY;
    test('Unset SAMJUNIORS_VOICE_GATEWAY defaults to voiceGateway=false', () => {
      const p = sophiaStatusPayload();
      assert.strictEqual(p.voiceGateway, false);
    });

    process.env.SAMJUNIORS_VOICE_GATEWAY = '2';
    test('Invalid string SAMJUNIORS_VOICE_GATEWAY="2" strictly evaluates to false', () => {
      const p = sophiaStatusPayload();
      assert.strictEqual(p.voiceGateway, false);
    });

    process.env.SAMJUNIORS_VOICE_GATEWAY = 'enabled';
    test('Invalid string SAMJUNIORS_VOICE_GATEWAY="enabled" strictly evaluates to false', () => {
      const p = sophiaStatusPayload();
      assert.strictEqual(p.voiceGateway, false);
    });

    process.env.SAMJUNIORS_LEGACY_VOICE_ALLOWED = 'true';
    test('SAMJUNIORS_LEGACY_VOICE_ALLOWED="true" enables legacyVoiceAllowed=true', () => {
      const p = sophiaStatusPayload();
      assert.strictEqual(p.legacyVoiceAllowed, true);
    });

    process.env.SAMJUNIORS_LEGACY_VOICE_ALLOWED = '1';
    test('SAMJUNIORS_LEGACY_VOICE_ALLOWED="1" does NOT enable (strictly requires "true")', () => {
      const p = sophiaStatusPayload();
      assert.strictEqual(p.legacyVoiceAllowed, false);
    });

    // ------------------------------------------------------------------------
    // SECTION 2: Server GET /api/sophia/status Route Security
    // ------------------------------------------------------------------------
    console.log('\nSECTION 2: Server GET /api/sophia/status Route Security\n');

    (process.env as any).NODE_ENV = 'production';
    await test('Unauthenticated production request fails closed with 401', async () => {
      const req = makeReq('/api/sophia/status');
      const res = await statusRoute(req);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, 'Founder session required');
    });

    (process.env as any).NODE_ENV = 'development';
    await test('Non-founder role fails closed with 401', async () => {
      const req = makeReq('/api/sophia/status', {
        headers: {
          'x-samjuniors-role': 'AUDITOR',
          'x-samjuniors-user-id': 'auditor-1',
        },
      });
      const res = await statusRoute(req);
      assert.strictEqual(res.status, 401);
    });

    process.env.SAMJUNIORS_VOICE_GATEWAY = '1';
    process.env.LIVE_WS_URL = 'ws://localhost:3001';
    await test('Authenticated founder receives 200 with canonical voiceGateway schema', async () => {
      const req = makeReq('/api/sophia/status', {
        headers: {
          'x-samjuniors-dev-secret': TEST_DEV_SECRET,
          'x-samjuniors-dev-role': 'FOUNDER',
          'x-samjuniors-dev-user-id': 'founder-test',
        },
      });
      const res = await statusRoute(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.voice, true);
      assert.strictEqual(data.voiceGateway, true);
      assert.strictEqual(data.liveWsUrl, 'ws://localhost:3001');
      assert.strictEqual(typeof data.legacyVoiceAllowed, 'boolean');
    });

    // ------------------------------------------------------------------------
    // SECTION 3: Client resolveVoiceConfig Fail-Closed Resolver
    // ------------------------------------------------------------------------
    console.log('\nSECTION 3: Client resolveVoiceConfig Fail-Closed Resolver\n');

    test('Valid canonical gateway status resolves to CANONICAL_GATEWAY', () => {
      const r = resolveVoiceConfig({
        voiceGateway: true,
        liveWsUrl: 'ws://localhost:3001',
        legacyVoiceAllowed: false,
      });
      assert.strictEqual(r.mode, 'CANONICAL_GATEWAY');
      if (r.mode === 'CANONICAL_GATEWAY') {
        assert.strictEqual(r.liveWsUrl, 'ws://localhost:3001');
      }
    });

    test('Valid secure wss:// URL resolves to CANONICAL_GATEWAY', () => {
      const r = resolveVoiceConfig({
        voiceGateway: true,
        liveWsUrl: 'wss://gateway.samjuniors.com/ws',
        legacyVoiceAllowed: false,
      });
      assert.strictEqual(r.mode, 'CANONICAL_GATEWAY');
      if (r.mode === 'CANONICAL_GATEWAY') {
        assert.strictEqual(r.liveWsUrl, 'wss://gateway.samjuniors.com/ws');
      }
    });

    test('Malformed liveWsUrl (http:// instead of ws://) fails closed to CONFIG_UNAVAILABLE', () => {
      const r = resolveVoiceConfig({
        voiceGateway: true,
        liveWsUrl: 'http://localhost:3001/api/live/ws',
      });
      assert.strictEqual(r.mode, 'CONFIG_UNAVAILABLE');
    });

    test('Missing liveWsUrl fails closed to CONFIG_UNAVAILABLE', () => {
      const r = resolveVoiceConfig({
        voiceGateway: true,
        liveWsUrl: '',
      });
      assert.strictEqual(r.mode, 'CONFIG_UNAVAILABLE');
    });

    test('Untrusted gateway host in liveWsUrl fails closed to CONFIG_UNAVAILABLE', () => {
      const r = resolveVoiceConfig({
        voiceGateway: true,
        liveWsUrl: 'ws://evil-attacker.com:3001/ws',
      });
      assert.strictEqual(r.mode, 'CONFIG_UNAVAILABLE');
      if (r.mode === 'CONFIG_UNAVAILABLE') {
        assert.ok(r.error.includes('not in the trusted allowlist'));
      }
    });

    test('Embedded credentials in liveWsUrl fails closed to CONFIG_UNAVAILABLE', () => {
      const r = resolveVoiceConfig({
        voiceGateway: true,
        liveWsUrl: 'ws://admin:secret@localhost:3001',
      });
      assert.strictEqual(r.mode, 'CONFIG_UNAVAILABLE');
      if (r.mode === 'CONFIG_UNAVAILABLE') {
        assert.ok(r.error.includes('Credentials embedded'));
      }
    });

    test('voiceGateway=false and legacyVoiceAllowed=false resolves to VOICE_DISABLED (no ungoverned actions)', () => {
      const r = resolveVoiceConfig({
        voiceGateway: false,
        liveWsUrl: 'ws://localhost:3001',
        legacyVoiceAllowed: false,
      });
      assert.strictEqual(r.mode, 'VOICE_DISABLED');
      if (r.mode === 'VOICE_DISABLED') {
        assert.ok(r.reason.includes('SAMJUNIORS_VOICE_GATEWAY=1 required'));
      }
    });

    test('voiceGateway=false and legacyVoiceAllowed=true resolves to VOICE_ONLY_LEGACY', () => {
      const r = resolveVoiceConfig({
        voiceGateway: false,
        liveWsUrl: 'ws://localhost:3001',
        legacyVoiceAllowed: true,
      });
      assert.strictEqual(r.mode, 'VOICE_ONLY_LEGACY');
    });

    test('Null / undefined / primitive status payload fails closed to CONFIG_UNAVAILABLE', () => {
      assert.strictEqual(resolveVoiceConfig(null).mode, 'CONFIG_UNAVAILABLE');
      assert.strictEqual(resolveVoiceConfig(undefined).mode, 'CONFIG_UNAVAILABLE');
      assert.strictEqual(resolveVoiceConfig('invalid string').mode, 'CONFIG_UNAVAILABLE');
      assert.strictEqual(resolveVoiceConfig(12345).mode, 'CONFIG_UNAVAILABLE');
    });

    test('Server error response payload fails closed to CONFIG_UNAVAILABLE', () => {
      const r = resolveVoiceConfig({ error: 'Founder session required' });
      assert.strictEqual(r.mode, 'CONFIG_UNAVAILABLE');
      if (r.mode === 'CONFIG_UNAVAILABLE') {
        assert.ok(r.error.includes('Founder session required'));
      }
    });

    // ------------------------------------------------------------------------
    // SECTION 4: Client fetchVoiceConfig Network Recovery
    // ------------------------------------------------------------------------
    console.log('\nSECTION 4: Client fetchVoiceConfig Network Recovery\n');

    await test('Network rejection fails closed to CONFIG_UNAVAILABLE', async () => {
      const mockFetch = (() => Promise.reject(new Error('Network error: connection refused'))) as any;
      const r = await fetchVoiceConfig(mockFetch);
      assert.strictEqual(r.mode, 'CONFIG_UNAVAILABLE');
      if (r.mode === 'CONFIG_UNAVAILABLE') {
        assert.ok(r.error.includes('connection refused'));
      }
    });

    await test('HTTP 500 server error fails closed to CONFIG_UNAVAILABLE', async () => {
      const mockFetch = (() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal server error' }),
        })) as any;
      const r = await fetchVoiceConfig(mockFetch);
      assert.strictEqual(r.mode, 'CONFIG_UNAVAILABLE');
      if (r.mode === 'CONFIG_UNAVAILABLE') {
        assert.ok(r.error.includes('Internal server error'));
      }
    });

    await test('HTTP 401 unauthenticated fails closed to CONFIG_UNAVAILABLE', async () => {
      const mockFetch = (() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Founder session required' }),
        })) as any;
      const r = await fetchVoiceConfig(mockFetch);
      assert.strictEqual(r.mode, 'CONFIG_UNAVAILABLE');
      if (r.mode === 'CONFIG_UNAVAILABLE') {
        assert.ok(r.error.includes('Founder session required'));
      }
    });
  } finally {
    // Restore environment
    if (origGateway !== undefined) process.env.SAMJUNIORS_VOICE_GATEWAY = origGateway;
    else delete process.env.SAMJUNIORS_VOICE_GATEWAY;

    if (origLegacy !== undefined) process.env.SAMJUNIORS_LEGACY_VOICE_ALLOWED = origLegacy;
    else delete process.env.SAMJUNIORS_LEGACY_VOICE_ALLOWED;

    if (origWsUrl !== undefined) process.env.LIVE_WS_URL = origWsUrl;
    else delete process.env.LIVE_WS_URL;

    if (origNodeEnv !== undefined) (process.env as any).NODE_ENV = origNodeEnv;
    else delete (process.env as any).NODE_ENV;

    if (origDevSecret !== undefined) process.env.DEV_FOUNDER_SECRET = origDevSecret;
    else delete process.env.DEV_FOUNDER_SECRET;
  }

  console.log('\n======================================================');
  console.log(`STEP 6C STAGE 1 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
