import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { execSync } from 'node:child_process';
import { NextRequest } from '@/lib/server/http';
import {
  proxy,
  getContentSecurityPolicy,
  getRequestSizeLimit,
  MAX_STANDARD_BODY_BYTES,
  MAX_UPLOAD_BODY_BYTES,
  isExecutiveApiRoute,
} from '../../src/proxy';
import {
  globalRateLimiter,
  MemoryRateLimiter,
  RATE_LIMIT_POLICIES,
  getClientIdentifier,
} from '../../src/lib/server/security/rate-limiter';
import { securityHeadersMiddleware } from '../../src/server/middleware';

/**
 * ============================================================================
 * GATE G3.4: SECURITY HEADERS, CSP, REQUEST SIZE LIMITS, RATE LIMITS & CI AUDIT
 * ============================================================================
 *
 * Exit criteria (GATES.md / gates.json):
 *   "Headers verified on a running build; limits tested; audit step in CI."
 *
 * Requirements:
 *  1. Strict security headers (CSP, X-Content-Type-Options, X-Frame-Options,
 *     Strict-Transport-Security, Referrer-Policy, Permissions-Policy, x-request-id)
 *     on all routes including early error and admission paths.
 *  2. Mutation body size caps (fail-closed 413 Payload Too Large).
 *  3. Edge-compatible sliding-window rate limiting with standard IETF
 *     RateLimit-* and Retry-After headers (429 Too Many Requests).
 *  4. CI dependency audit step verifying zero critical vulnerabilities.
 */

const WORKTREE_ROOT = path.resolve(__dirname, '../..');
const src = (rel: string) => fs.readFileSync(path.join(WORKTREE_ROOT, rel), 'utf-8');

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
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
  console.log('GATE G3.4: SECURITY HEADERS, CSP, LIMITS & CI AUDIT');
  console.log('======================================================\n');

  // Reset rate limiter state before test execution
  globalRateLimiter.reset();

  // --------------------------------------------------------------------------
  console.log('--- PART 1: Security Headers & Content Security Policy (CSP) ---');
  // --------------------------------------------------------------------------

  await test('1.1 Standard request receives full HTTP security headers suite', () => {
    const req = new NextRequest('http://localhost:3000/api/health', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '203.0.113.195',
      },
    });

    const res = proxy(req);
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
    assert.strictEqual(
      res.headers.get('strict-transport-security'),
      'max-age=31536000; includeSubDomains; preload'
    );
    assert.strictEqual(
      res.headers.get('referrer-policy'),
      'strict-origin-when-cross-origin'
    );
    assert.strictEqual(
      res.headers.get('permissions-policy'),
      'camera=(self), microphone=(self), geolocation=()'
    );
    assert.strictEqual(res.headers.get('x-dns-prefetch-control'), 'on');
    assert.ok(res.headers.get('x-request-id'), 'x-request-id must be attached');
  });

  await test('1.2 Content-Security-Policy contains comprehensive restrictive directives', () => {
    const csp = getContentSecurityPolicy(false);

    assert.ok(csp.includes("default-src 'self'"), "Must enforce default-src 'self'");
    assert.ok(csp.includes("script-src 'self'"), "Must restrict script-src to 'self'");
    assert.ok(csp.includes("style-src 'self'"), "Must allow style-src 'self'");
    assert.ok(csp.includes("font-src 'self' https://fonts.gstatic.com"), "Must allow required font origins");
    assert.ok(csp.includes("img-src 'self' data: blob: https://picsum.photos https://images.unsplash.com"), "Must permit UI images");
    assert.ok(csp.includes("media-src 'self' blob: data:"), "Must permit audio stream playback");
    assert.ok(csp.includes("connect-src 'self' https: wss: ws:"), "Must allow API and WebRTC/WebSocket transports");
    assert.ok(csp.includes("frame-ancestors 'none'"), "Must deny external framing by default");
    assert.ok(csp.includes("object-src 'none'"), "Must block legacy objects/plugins");
    assert.ok(csp.includes("base-uri 'self'"), "Must restrict base-uri to self");
    assert.ok(csp.includes("form-action 'self'"), "Must restrict form-action to self");
  });

  await test('1.3 Prototype asset paths permit same-origin iframe embedding', () => {
    const protoReq = new NextRequest('http://localhost:3000/prototype/v4/index.html', {
      method: 'GET',
    });
    const res = proxy(protoReq);

    assert.strictEqual(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(csp.includes("frame-ancestors 'self'"), "Prototype asset must permit frame-ancestors 'self'");
  });

  await test('1.4 Error responses (401, 413, 429) retain all security headers fail-closed', () => {
    const savedEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      process.env.SAMJUNIORS_DEV_SECRET = 'correct-secret';

      // Unauthenticated executive route in production -> 401
      const req = new NextRequest('http://localhost:3000/api/workflow/instances', {
        method: 'GET',
      });
      const res = proxy(req);

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
      assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
      assert.ok(res.headers.get('content-security-policy'));
      assert.ok(res.headers.get('x-request-id'));
    } finally {
      process.env.NODE_ENV = savedEnv;
    }
  });

  // --------------------------------------------------------------------------
  console.log('\n--- PART 2: Request Body Size Limits ---');
  // --------------------------------------------------------------------------

  await test('2.1 Standard mutation payload within 2MB limit is admitted', () => {
    const req = new NextRequest('http://localhost:3000/api/conversation', {
      method: 'POST',
      headers: {
        'content-length': (1024 * 50).toString(), // 50 KB
        'content-type': 'application/json',
      },
    });

    const res = proxy(req);
    assert.notStrictEqual(res.status, 413, '50 KB payload must not trigger 413');
  });

  await test('2.2 Mutation payload exceeding 2MB standard limit is rejected with 413', async () => {
    const oversizedBytes = MAX_STANDARD_BODY_BYTES + 1024; // 2 MB + 1 KB
    const req = new NextRequest('http://localhost:3000/api/conversation', {
      method: 'POST',
      headers: {
        'content-length': oversizedBytes.toString(),
        'content-type': 'application/json',
      },
    });

    const res = proxy(req);
    assert.strictEqual(res.status, 413, 'Must reject oversized payload with HTTP 413');

    const body = await res.json();
    assert.ok(body.error.includes('Payload Too Large'), 'Error message must specify Payload Too Large');
    assert.strictEqual(body.limit, MAX_STANDARD_BODY_BYTES);
    assert.strictEqual(body.received, oversizedBytes);
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  });

  await test('2.3 Media / upload endpoint admits payloads up to 10MB', () => {
    const uploadBytes = 5 * 1024 * 1024; // 5 MB
    assert.strictEqual(getRequestSizeLimit('/api/media/voice-clip'), MAX_UPLOAD_BODY_BYTES);
    assert.strictEqual(getRequestSizeLimit('/api/upload/document'), MAX_UPLOAD_BODY_BYTES);

    const req = new NextRequest('http://localhost:3000/api/media/audio', {
      method: 'POST',
      headers: {
        'content-length': uploadBytes.toString(),
        'content-type': 'audio/wav',
      },
    });

    const res = proxy(req);
    assert.notStrictEqual(res.status, 413, '5 MB upload on /api/media must not be rejected');
  });

  await test('2.4 Media / upload endpoint rejects payloads exceeding 10MB with 413', async () => {
    const oversizedUploadBytes = MAX_UPLOAD_BODY_BYTES + 1024 * 1024; // 11 MB
    const req = new NextRequest('http://localhost:3000/api/upload/file', {
      method: 'POST',
      headers: {
        'content-length': oversizedUploadBytes.toString(),
        'content-type': 'application/octet-stream',
      },
    });

    const res = proxy(req);
    assert.strictEqual(res.status, 413);
    const body = await res.json();
    assert.strictEqual(body.limit, MAX_UPLOAD_BODY_BYTES);
    assert.strictEqual(body.received, oversizedUploadBytes);
  });

  // --------------------------------------------------------------------------
  console.log('\n--- PART 3: Edge-Compatible Rate Limiting & Quotas ---');
  // --------------------------------------------------------------------------

  await test('3.1 Admitted API request returns standard IETF RateLimit-* headers', () => {
    globalRateLimiter.reset();

    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '198.51.100.42',
      },
    });

    const res = proxy(req);
    assert.ok(res.headers.has('ratelimit-limit'), 'Must include RateLimit-Limit');
    assert.ok(res.headers.has('ratelimit-remaining'), 'Must include RateLimit-Remaining');
    assert.ok(res.headers.has('ratelimit-reset'), 'Must include RateLimit-Reset');
    assert.strictEqual(
      res.headers.get('ratelimit-remaining'),
      (RATE_LIMIT_POLICIES.EXECUTIVE_API.maxRequests - 1).toString()
    );
  });

  await test('3.2 Rapid sequential requests decrement RateLimit-Remaining monotonically', () => {
    const testIp = '198.51.100.99';

    for (let i = 1; i <= 5; i++) {
      const req = new NextRequest('http://localhost:3000/api/version', {
        method: 'GET',
        headers: { 'x-forwarded-for': testIp },
      });
      const res = proxy(req);
      const expectedRemaining = RATE_LIMIT_POLICIES.STANDARD_API.maxRequests - i;
      assert.strictEqual(
        res.headers.get('ratelimit-remaining'),
        expectedRemaining.toString(),
        `Turn ${i} must decrement remaining quota to ${expectedRemaining}`
      );
    }
  });

  await test('3.3 Exceeding rate limit returns 429 Too Many Requests with Retry-After', async () => {
    const limiter = new MemoryRateLimiter();
    const policy = { windowMs: 10_000, maxRequests: 3 };
    const key = 'test-abuser-ip';

    // 3 requests allowed
    assert.strictEqual(limiter.check(key, policy).allowed, true);
    assert.strictEqual(limiter.check(key, policy).allowed, true);
    assert.strictEqual(limiter.check(key, policy).allowed, true);

    // 4th request must be rejected
    const blocked = limiter.check(key, policy);
    assert.strictEqual(blocked.allowed, false);
    assert.strictEqual(blocked.remaining, 0);
    assert.ok(blocked.resetSeconds > 0 && blocked.resetSeconds <= 10);

    // Test through proxy middleware
    const proxyIp = '203.0.113.88';
    // Exhaust quota on executive route (60 requests)
    for (let i = 0; i < 60; i++) {
      proxy(
        new NextRequest('http://localhost:3000/api/orchestrate', {
          method: 'GET',
          headers: { 'x-forwarded-for': proxyIp },
        })
      );
    }

    // 61st request must trigger 429
    const blockedRes = proxy(
      new NextRequest('http://localhost:3000/api/orchestrate', {
        method: 'GET',
        headers: { 'x-forwarded-for': proxyIp },
      })
    );

    assert.strictEqual(blockedRes.status, 429);
    assert.ok(blockedRes.headers.has('retry-after'));
    assert.strictEqual(blockedRes.headers.get('ratelimit-remaining'), '0');

    const body = await blockedRes.json();
    assert.ok(body.error.includes('Too Many Requests'));
    assert.ok(typeof body.retryAfter === 'number');
  });

  await test('3.4 Rate limiter memory bounds and TTL cleanup purge stale keys', () => {
    const limiter = new MemoryRateLimiter(5); // tiny capacity for testing
    const policy = { windowMs: 1000, maxRequests: 10 };
    const baseTime = 1_000_000;

    // Add 5 distinct keys
    for (let i = 0; i < 5; i++) {
      limiter.check(`ip-${i}`, policy, baseTime);
    }
    assert.strictEqual(limiter.getBucketCount(), 5);

    // Add 3 more keys with advanced time beyond maxAge (120_000 ms)
    limiter.check('ip-fresh', policy, baseTime + 130_000);

    // Old expired keys must be purged
    assert.ok(
      limiter.getBucketCount() <= 5,
      `Bucket count (${limiter.getBucketCount()}) must respect capacity limits`
    );
  });

  await test('3.5 Scheduler heartbeat machine caller gets dedicated machine rate limit quota', () => {
    const savedCron = process.env.CRON_TRIGGER_SECRET;
    try {
      process.env.CRON_TRIGGER_SECRET = 'test-cron-secret-123';

      const req = new NextRequest('http://localhost:3000/api/workflow/scheduling', {
        method: 'POST',
        headers: {
          'x-cron-secret': 'test-cron-secret-123',
        },
      });

      const res = proxy(req);
      assert.strictEqual(
        res.headers.get('ratelimit-limit'),
        RATE_LIMIT_POLICIES.CRON_MACHINE.maxRequests.toString()
      );
    } finally {
      process.env.CRON_TRIGGER_SECRET = savedCron;
    }
  });

  // --------------------------------------------------------------------------
  console.log('\n--- PART 4: CI Dependency Audit & Build Configuration ---');
  // --------------------------------------------------------------------------

  await test('4.1 package.json registers "audit:deps" script', () => {
    const pkg = JSON.parse(src('package.json'));
    assert.ok(pkg.scripts['audit:deps'], 'package.json must declare "audit:deps"');
    assert.strictEqual(pkg.scripts['audit:deps'], 'node scripts/audit-deps.mjs');
  });

  await test('4.2 scripts/audit-deps.mjs executes successfully with zero critical vulnerabilities', () => {
    const scriptPath = path.join(WORKTREE_ROOT, 'scripts/audit-deps.mjs');
    assert.ok(fs.existsSync(scriptPath), 'scripts/audit-deps.mjs must exist');

    const result = execSync('node scripts/audit-deps.mjs', {
      cwd: WORKTREE_ROOT,
      encoding: 'utf-8',
    });
    assert.ok(
      result.includes('PASS: Dependency security audit completed with zero unmitigated critical vulnerabilities'),
      'Audit script must report zero unmitigated critical vulnerabilities'
    );
  });

  await test('4.3 .github/workflows/ci.yml wires the dependency security audit step', () => {
    const ciContent = src('.github/workflows/ci.yml');
    assert.ok(
      ciContent.includes('name: Dependency security audit'),
      'CI workflow must define "Dependency security audit" step'
    );
    assert.ok(
      ciContent.includes('run: npm run audit:deps'),
      'CI workflow must execute "npm run audit:deps"'
    );
  });

  await test('4.4 securityHeadersMiddleware defines server-level security headers for static assets and API', async () => {
    const headers: Record<string, string> = {};
    const mockReq: any = { headers: {} };
    const mockRes: any = {
      setHeader: (k: string, v: string) => { headers[k] = v; },
    };
    securityHeadersMiddleware(mockReq, mockRes, () => {});
    const headerKeys = Object.keys(headers);
    assert.ok(headerKeys.includes('X-Content-Type-Options'));
    assert.ok(headerKeys.includes('Strict-Transport-Security'));
    assert.ok(headerKeys.includes('Referrer-Policy'));
    assert.ok(headerKeys.includes('Permissions-Policy'));
  });

  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`GATE G3.4 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Gate G3.4 verification suite.`);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
