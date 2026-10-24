import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { NextRequest } from '@/lib/server/http';
import { proxy } from '../../src/proxy';
import { runClientBundleScan } from '../../scripts/scan-client-bundle-secrets.mjs';

/**
 * ============================================================================
 * GATE G3.5: SECRETS HANDLING AND ROTATION VERIFICATION SUITE
 * ============================================================================
 *
 * Exit criteria (GATES.md / gates.json):
 *   "No secret reaches the client bundle (verified by scan); written rotation
 *    runbook tested once."
 *
 * Requirements:
 *  1. Client bundle scanner verifies zero production secrets in client assets.
 *  2. Scanner catches deliberate synthetic leak injections.
 *  3. Written rotation runbook exists and covers all inventory credentials.
 *  4. Live rotation procedure tested: old secret refused, new secret accepted.
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
  console.log('GATE G3.5: SECRETS HANDLING & ROTATION VERIFICATION');
  console.log('======================================================\n');

  // --------------------------------------------------------------------------
  console.log('--- PART 1: Client Bundle Secret Leak Scanner Verification ---');
  // --------------------------------------------------------------------------

  await test('1.1 Real codebase client assets scan passes with zero leaks', () => {
    const result = runClientBundleScan();
    assert.strictEqual(result.passed, true, 'Client bundle scan must pass on active codebase');
    assert.strictEqual(result.leaks.length, 0, 'Zero secrets must be detected');
    assert.ok(result.scannedCount > 0, 'Scanned file count must be greater than zero');
  });

  await test('1.2 Scanner successfully detects when a synthetic secret is injected into client assets', () => {
    const syntheticSecrets = new Map([
      ['SYNTHETIC_API_KEY', 'sk_live_synthetic_secret_1234567890abcdef'],
    ]);

    // Create a temporary simulated client file with leaked secret
    const tempTestDir = path.join(WORKTREE_ROOT, 'public', '__test_secret_leak_fixture');
    fs.mkdirSync(tempTestDir, { recursive: true });
    const tempFile = path.join(tempTestDir, 'leak_test.js');
    fs.writeFileSync(tempFile, 'const key = "sk_live_synthetic_secret_1234567890abcdef";');

    try {
      const scanResult = runClientBundleScan({
        secrets: syntheticSecrets,
        targetDirs: [tempTestDir],
      });

      assert.strictEqual(scanResult.passed, false, 'Scanner must detect injected secret leak');
      assert.strictEqual(scanResult.leaks.length, 1, 'Must detect exactly 1 leak');
      assert.strictEqual(scanResult.leaks[0].secretKey, 'SYNTHETIC_API_KEY');
    } finally {
      // Clean up temporary fixture
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  await test('1.3 package.json registers "scan:client-secrets" script', () => {
    const pkg = JSON.parse(src('package.json'));
    assert.ok(pkg.scripts['scan:client-secrets'], 'package.json must declare "scan:client-secrets"');
    assert.strictEqual(
      pkg.scripts['scan:client-secrets'],
      'node scripts/scan-client-bundle-secrets.mjs'
    );
  });

  // --------------------------------------------------------------------------
  console.log('\n--- PART 2: Written Secrets Rotation Runbook Verification ---');
  // --------------------------------------------------------------------------

  await test('2.1 docs/security/PRODUCTION_SECRETS_HANDLING_AND_ROTATION.md exists with all required sections', () => {
    const runbookPath = path.join(
      WORKTREE_ROOT,
      'docs/security/PRODUCTION_SECRETS_HANDLING_AND_ROTATION.md'
    );
    assert.ok(fs.existsSync(runbookPath), 'Runbook must exist');

    const content = fs.readFileSync(runbookPath, 'utf-8');
    assert.ok(content.includes('## 1. Core Security Invariants'), 'Must cover Security Invariants');
    assert.ok(content.includes('## 2. Production Secrets Inventory'), 'Must include Secrets Inventory');
    assert.ok(content.includes('## 3. Cryptographic Entropy & Generation Standard'), 'Must define Entropy standard');
    assert.ok(content.includes('## 4. Step-by-Step Rotation Procedures'), 'Must define Step-by-Step Rotation procedures');
    assert.ok(content.includes('## 5. Verification & Testing Evidence'), 'Must document testing evidence');

    // Verify all key credentials are in the runbook inventory
    assert.ok(content.includes('CRON_TRIGGER_SECRET'));
    assert.ok(content.includes('SAMJUNIORS_DEV_SECRET'));
    assert.ok(content.includes('CLERK_SECRET_KEY'));
    assert.ok(content.includes('ELEVENLABS_API_KEY'));
    assert.ok(content.includes('DEEPGRAM_API_KEY'));
    assert.ok(content.includes('OPENAI_API_KEY'));
    assert.ok(content.includes('DATABASE_URL'));
  });

  // --------------------------------------------------------------------------
  console.log('\n--- PART 3: Secrets Rotation Live Testing ("Tested Once") ---');
  // --------------------------------------------------------------------------

  await test('3.1 Live rotation rehearsal: CRON_TRIGGER_SECRET rotation rejects old and admits new', () => {
    const savedCron = process.env.CRON_TRIGGER_SECRET;
    const initialSecret = 'cron-initial-secret-32bytes-entropy-v1';
    const rotatedSecret = 'cron-rotated-secret-32bytes-entropy-v2';

    try {
      // 1. Establish initial secret
      process.env.CRON_TRIGGER_SECRET = initialSecret;

      const initialReq = new NextRequest('http://localhost:3000/api/workflow/scheduling', {
        method: 'POST',
        headers: { 'x-cron-secret': initialSecret },
      });
      const initialRes = proxy(initialReq);
      assert.strictEqual(
        initialRes.status,
        200,
        'Initial secret must be accepted before rotation'
      );

      // 2. Perform rotation: update process secret to rotated secret
      process.env.CRON_TRIGGER_SECRET = rotatedSecret;

      // 3. Test that old secret is now strictly rejected (401 Unauthorized in production)
      const savedEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const staleReq = new NextRequest('http://localhost:3000/api/workflow/scheduling', {
          method: 'POST',
          headers: { 'x-cron-secret': initialSecret },
        });
        const staleRes = proxy(staleReq);
        assert.strictEqual(
          staleRes.status,
          401,
          'Retired secret must be rejected with 401 Unauthorized after rotation'
        );

        // 4. Test that newly rotated secret is admitted
        const rotatedReq = new NextRequest('http://localhost:3000/api/workflow/scheduling', {
          method: 'POST',
          headers: { 'x-cron-secret': rotatedSecret },
        });
        const rotatedRes = proxy(rotatedReq);
        assert.strictEqual(
          rotatedRes.status,
          200,
          'Newly rotated secret must be admitted with 200 OK'
        );
      } finally {
        process.env.NODE_ENV = savedEnv;
      }
    } finally {
      process.env.CRON_TRIGGER_SECRET = savedCron;
    }
  });

  await test('3.2 Live rotation rehearsal: SAMJUNIORS_DEV_SECRET rotation rejects old and admits new', () => {
    const savedDev = process.env.SAMJUNIORS_DEV_SECRET;
    const savedEnv = process.env.NODE_ENV;
    const initialDevSecret = 'founder-dev-secret-alpha-99999999';
    const rotatedDevSecret = 'founder-dev-secret-bravo-11111111';

    try {
      process.env.NODE_ENV = 'production';

      // 1. Establish initial secret
      process.env.SAMJUNIORS_DEV_SECRET = initialDevSecret;

      const validInitialReq = new NextRequest('http://localhost:3000/api/orchestrate', {
        method: 'GET',
        headers: {
          'x-samjuniors-dev-as': 'founder',
          'x-samjuniors-dev-secret': initialDevSecret,
        },
      });
      const validInitialRes = proxy(validInitialReq);
      assert.strictEqual(validInitialRes.status, 200, 'Initial founder secret must be accepted');

      // 2. Perform rotation: update to new secret
      process.env.SAMJUNIORS_DEV_SECRET = rotatedDevSecret;

      // 3. Stale secret must be rejected (401)
      const staleReq = new NextRequest('http://localhost:3000/api/orchestrate', {
        method: 'GET',
        headers: {
          'x-samjuniors-dev-as': 'founder',
          'x-samjuniors-dev-secret': initialDevSecret,
        },
      });
      const staleRes = proxy(staleReq);
      assert.strictEqual(staleRes.status, 401, 'Retired founder secret must fail closed with 401');

      // 4. Rotated secret must be accepted (200)
      const rotatedReq = new NextRequest('http://localhost:3000/api/orchestrate', {
        method: 'GET',
        headers: {
          'x-samjuniors-dev-as': 'founder',
          'x-samjuniors-dev-secret': rotatedDevSecret,
        },
      });
      const rotatedRes = proxy(rotatedReq);
      assert.strictEqual(rotatedRes.status, 200, 'Rotated founder secret must be admitted');
    } finally {
      process.env.SAMJUNIORS_DEV_SECRET = savedDev;
      process.env.NODE_ENV = savedEnv;
    }
  });

  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`GATE G3.5 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Gate G3.5 verification suite.`);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
