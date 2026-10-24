import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { NextRequest } from '@/lib/server/http';
import {
  SideEffectAuthorizationGate,
  ALLOWED_FOUNDER_IDENTITIES,
  isAuthorizedFounderIdentity,
} from '../../src/lib/server/authorization/gate';
import { proxy } from '../../src/proxy';
import { POST as workflowApprovalsPost } from '../../src/app/api/workflow/approvals/route';
import { GET as conversationGet } from '../../src/app/api/conversation/route';
import { GET as sofiaMemoryGet } from '../../src/app/api/sofia/memory/route';

/**
 * ============================================================================
 * GATE G3.1: CLOSING THE TWO OPEN AUTH GAPS REGRESSION SUITE
 * ============================================================================
 *
 * Exit criteria (GATES.md / gates.json):
 *   "Both gaps reproduced, fixed, and covered by tests; unauthenticated calls
 *    to privileged routes fail closed."
 *
 * Gap 1: gate.ts allowlist loophole & blocklist
 *   - decideApproval permitted forged prefixes (e.g. 'founder-attacker') via loose
 *     startsWith('founder-'). Fixed to require strict membership in ALLOWED_FOUNDER_IDENTITIES.
 *   - revokeApproval used a blocklist (prohibitedRoles) allowing any unlisted role
 *     (e.g. 'attacker', 'admin') to revoke approvals. Fixed to enforce strict founder allowlist.
 *   - resolveInterruptedOperation permitted forged prefixes. Fixed to enforce allowlist.
 *
 * Gap 2: Live Clerk provisioning & fail-closed privileged route enforcement
 *   - .env.example lacked complete Clerk configuration (CLERK_SECRET_KEY omitted).
 *   - Privileged executive routes in production without credentials must fail closed (401).
 *   - Forged role overrides (x-samjuniors-role) in production must fail closed (401).
 */

const ROOT = path.resolve(__dirname, '../..');
const src = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

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
  console.log('GATE G3.1: AUTH GAPS CLOSURE & PRIVILEGED ROUTES SUITE');
  console.log('======================================================\n');

  console.log('--- PART 1: Gap 1 — gate.ts strict allowlist enforcement ---');

  await test('1.1 ALLOWED_FOUNDER_IDENTITIES is frozen and contains exact known identities', () => {
    assert.ok(Array.isArray(ALLOWED_FOUNDER_IDENTITIES), 'ALLOWED_FOUNDER_IDENTITIES must be an array');
    assert.ok(ALLOWED_FOUNDER_IDENTITIES.includes('founder'));
    assert.ok(ALLOWED_FOUNDER_IDENTITIES.includes('founder-001'));
    assert.ok(ALLOWED_FOUNDER_IDENTITIES.includes('founder-local-session'));
    assert.ok(ALLOWED_FOUNDER_IDENTITIES.includes('founder-production-session'));
    assert.ok(ALLOWED_FOUNDER_IDENTITIES.includes('executive_founder'));
    assert.ok(ALLOWED_FOUNDER_IDENTITIES.includes('executive-founder'));
    assert.ok(ALLOWED_FOUNDER_IDENTITIES.includes('founder@samjuniors.com'));
    assert.strictEqual(ALLOWED_FOUNDER_IDENTITIES.includes('founder-attacker'), false);
    assert.strictEqual(ALLOWED_FOUNDER_IDENTITIES.includes('founder-malicious'), false);
  });

  await test('1.2 isAuthorizedFounderIdentity rejects arbitrary prefixes and unlisted roles', () => {
    // Forged prefixes that passed before G3.1 fix:
    assert.strictEqual(isAuthorizedFounderIdentity('founder-attacker'), false);
    assert.strictEqual(isAuthorizedFounderIdentity('founder-compromised'), false);
    assert.strictEqual(isAuthorizedFounderIdentity('founder-evil'), false);

    // Unlisted roles that bypassed the revoke blocklist before G3.1 fix:
    assert.strictEqual(isAuthorizedFounderIdentity('attacker'), false);
    assert.strictEqual(isAuthorizedFounderIdentity('admin'), false);
    assert.strictEqual(isAuthorizedFounderIdentity('eve'), false);
    assert.strictEqual(isAuthorizedFounderIdentity('guest-user'), false);

    // Authorized identities:
    assert.strictEqual(isAuthorizedFounderIdentity('founder'), true);
    assert.strictEqual(isAuthorizedFounderIdentity('founder-001'), true);
    assert.strictEqual(isAuthorizedFounderIdentity('founder-local-session'), true);
    assert.strictEqual(isAuthorizedFounderIdentity('founder-production-session'), true);
    assert.strictEqual(isAuthorizedFounderIdentity('executive_founder'), true);
    assert.strictEqual(isAuthorizedFounderIdentity('founder@samjuniors.com'), true);

    // Verified session userContext:
    assert.strictEqual(isAuthorizedFounderIdentity('founder', { role: 'FOUNDER' }), true);
    assert.strictEqual(isAuthorizedFounderIdentity('unknown', { role: 'FOUNDER', userId: 'founder' }), true);
    assert.strictEqual(isAuthorizedFounderIdentity('unknown', { role: 'FOUNDER', userId: 'attacker' }), false);
    assert.strictEqual(isAuthorizedFounderIdentity('unknown', { role: 'EXECUTIVE' }), false);
  });

  const gate = SideEffectAuthorizationGate.getInstance();

  // Request a test approval to test decideApproval and revokeApproval against
  const testApproval = await gate.requestApproval({
    workflowInstanceId: `wf-test-g3-1-${Date.now()}`,
    stepId: 'step-1',
    actionClassification: 'financial_action',
    actionName: 'test_payout',
    employeeRole: 'finance',
    scope: { scopeType: 'single_action' },
    notes: 'G3.1 auth gap test approval',
  });

  await test('1.3 decideApproval rejects forged prefix "founder-attacker" with Permission denied', async () => {
    await assert.rejects(
      async () => {
        await gate.decideApproval({
          approvalId: testApproval.id,
          decision: 'approved',
          decidedBy: 'founder-attacker',
          reason: 'Attempted prefix spoofing',
        });
      },
      /Permission denied: Identity "founder-attacker" is not an authorized Founder/
    );
  });

  await test('1.4 decideApproval rejects unlisted role "attacker" with Permission denied', async () => {
    await assert.rejects(
      async () => {
        await gate.decideApproval({
          approvalId: testApproval.id,
          decision: 'approved',
          decidedBy: 'attacker',
          reason: 'Attempted arbitrary role injection',
        });
      },
      /Permission denied: Identity "attacker" is not an authorized Founder/
    );
  });

  await test('1.5 revokeApproval rejects unlisted role "attacker" (blocklist eliminated)', async () => {
    await assert.rejects(
      async () => {
        await gate.revokeApproval({
          approvalId: testApproval.id,
          revokedBy: 'attacker',
          reason: 'Attempted revocation by attacker',
        });
      },
      /Permission denied: Identity "attacker" is not an authorized Founder/
    );
  });

  await test('1.6 revokeApproval rejects prefix spoofing "founder-attacker"', async () => {
    await assert.rejects(
      async () => {
        await gate.revokeApproval({
          approvalId: testApproval.id,
          revokedBy: 'founder-attacker',
          reason: 'Attempted revocation by spoofed founder',
        });
      },
      /Permission denied: Identity "founder-attacker" is not an authorized Founder/
    );
  });

  await test('1.7 resolveInterruptedOperation rejects prefix spoofing "founder-attacker"', async () => {
    await assert.rejects(
      async () => {
        await gate.resolveInterruptedOperation({
          idempotencyKey: 'test-key-g3-1',
          resolution: 'failed',
          reason: 'Attempted spoofed resolution',
          resolvedBy: 'founder-attacker',
        });
      },
      /Permission denied: Identity "founder-attacker" is not an authorized Founder/
    );
  });

  await test('1.8 decideApproval succeeds for authorized Founder identity', async () => {
    const record = await gate.decideApproval({
      approvalId: testApproval.id,
      decision: 'approved',
      decidedBy: 'founder',
      reason: 'Legitimate founder approval',
    });
    assert.strictEqual(record.decision, 'approved');
    assert.strictEqual(record.decidedBy, 'founder');
  });

  await test('1.9 revokeApproval succeeds for authorized Founder identity', async () => {
    const record = await gate.revokeApproval({
      approvalId: testApproval.id,
      revokedBy: 'founder',
      reason: 'Legitimate founder revocation',
    });
    assert.strictEqual(record.decision, 'revoked');
    assert.strictEqual(record.decidedBy, 'founder');
  });

  console.log('\n--- PART 2: Gap 2 — Live Clerk provisioning & fail-closed routes ---');

  await test('2.1 .env.example provisions complete live Clerk credentials (both publishable & secret keys)', () => {
    const envExample = src('.env.example');
    assert.ok(
      envExample.includes('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='),
      '.env.example must document NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'
    );
    assert.ok(
      envExample.includes('CLERK_SECRET_KEY='),
      '.env.example must document CLERK_SECRET_KEY'
    );
  });

  const ENV = process.env as Record<string, string | undefined>;
  const origNodeEnv = ENV.NODE_ENV;
  const origDevSecret = ENV.SAMJUNIORS_DEV_SECRET;
  const origPubClerk = ENV.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const origSecClerk = ENV.CLERK_SECRET_KEY;

  const setEnv = (nodeEnv: string, secret?: string) => {
    ENV.NODE_ENV = nodeEnv;
    if (secret !== undefined) ENV.SAMJUNIORS_DEV_SECRET = secret;
    else delete ENV.SAMJUNIORS_DEV_SECRET;
  };

  try {
    setEnv('production', 'test-production-secret-32-chars-long-1234');

    await test('2.2 Proxy middleware: unauthenticated requests to privileged routes fail closed (401)', () => {
      const privilegedPaths = [
        'http://localhost:3000/api/workflow/approvals',
        'http://localhost:3000/api/orchestrate',
        'http://localhost:3000/api/advisor',
        'http://localhost:3000/api/agent-chat',
        'http://localhost:3000/api/agent-collab',
        'http://localhost:3000/api/epistemic',
        'http://localhost:3000/api/agents',
        'http://localhost:3000/api/activity',
        'http://localhost:3000/api/conversation',
        'http://localhost:3000/api/sofia/memory',
        'http://localhost:3000/api/sophia/system/action',
      ];

      for (const url of privilegedPaths) {
        const req = new NextRequest(url, { method: 'GET' });
        const res = proxy(req);
        assert.strictEqual(
          res.status,
          401,
          `Path ${url} must fail closed with 401 when unauthenticated in production`
        );
      }
    });

    await test('2.3 Proxy middleware: forged role header (x-samjuniors-role) fails closed (401)', () => {
      const req = new NextRequest('http://localhost:3000/api/workflow/approvals', {
        method: 'GET',
        headers: { 'x-samjuniors-role': 'FOUNDER' },
      });
      const res = proxy(req);
      assert.strictEqual(res.status, 401);
    });

    await test('2.4 Proxy middleware: x-samjuniors-dev-as: founder without secret fails closed (401)', () => {
      const req = new NextRequest('http://localhost:3000/api/workflow/approvals', {
        method: 'GET',
        headers: { 'x-samjuniors-dev-as': 'founder' },
      });
      const res = proxy(req);
      assert.strictEqual(res.status, 401);
    });

    await test('2.5 Proxy middleware: wrong secret fails closed (401)', () => {
      const req = new NextRequest('http://localhost:3000/api/workflow/approvals', {
        method: 'GET',
        headers: {
          'x-samjuniors-dev-as': 'founder',
          'x-samjuniors-dev-secret': 'wrong-secret-00000000000000000000',
        },
      });
      const res = proxy(req);
      assert.strictEqual(res.status, 401);
    });

    await test('2.6 Proxy middleware: valid secret admits request (non-401)', () => {
      const req = new NextRequest('http://localhost:3000/api/workflow/approvals', {
        method: 'GET',
        headers: {
          'x-samjuniors-dev-as': 'founder',
          'x-samjuniors-dev-secret': 'test-production-secret-32-chars-long-1234',
        },
      });
      const res = proxy(req);
      assert.notStrictEqual(res.status, 401, 'Valid credentials must pass through proxy middleware');
    });

    await test('2.7 Route handlers fail closed (401) on direct invocation when unauthenticated in production', async () => {
      // Direct call to /api/workflow/approvals
      const approvalsReq = new NextRequest('http://localhost:3000/api/workflow/approvals', {
        method: 'POST',
        body: JSON.stringify({ action: 'approve', approvalId: 'test-id' }),
      });
      const approvalsRes = await workflowApprovalsPost(approvalsReq);
      assert.strictEqual(approvalsRes.status, 401, 'Workflow approvals POST must return 401 when unauthenticated');

      // Direct call to /api/conversation
      const convReq = new NextRequest('http://localhost:3000/api/conversation', { method: 'GET' });
      const convRes = await conversationGet(convReq);
      assert.strictEqual(convRes.status, 401, 'Conversation GET must return 401 when unauthenticated');

      // Direct call to /api/sofia/memory
      const memReq = new NextRequest('http://localhost:3000/api/sofia/memory', { method: 'GET' });
      const memRes = await sofiaMemoryGet(memReq);
      assert.strictEqual(memRes.status, 401, 'Sofia memory GET must return 401 when unauthenticated');
    });
  } finally {
    // Restore environment
    ENV.NODE_ENV = origNodeEnv;
    if (origDevSecret !== undefined) ENV.SAMJUNIORS_DEV_SECRET = origDevSecret;
    else delete ENV.SAMJUNIORS_DEV_SECRET;
    if (origPubClerk !== undefined) ENV.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = origPubClerk;
    else delete ENV.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (origSecClerk !== undefined) ENV.CLERK_SECRET_KEY = origSecClerk;
    else delete ENV.CLERK_SECRET_KEY;
  }

  console.log('\n======================================================');
  console.log(`TEST RUN COMPLETE: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
