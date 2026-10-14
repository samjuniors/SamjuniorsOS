/**
 * SamJuniorsOS — Phase 2.2.1.2: Workflow Capability Token Security Test Suite
 *
 * Verifies the cryptographic security, fail-closed boundaries, secret strength,
 * schema validation, and cross-workflow isolation of workflow capability tokens.
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createHmac } from 'crypto';
import {
  getWorkflowCapabilitySecret,
  generateWorkerCapabilityToken,
  verifyWorkerCapabilityToken,
  isAuthorizedWorkflowWorker,
  MIN_WORKFLOW_SECRET_LENGTH,
  DecisionLifecycleService,
} from '@/lib/server/decision/lifecycle';
import { DecisionStore } from '@/lib/server/decision/store';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import { UnauthorizedDecisionActionError } from '@/lib/server/decision/errors';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    testResults.push({ name, passed: true });
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    testResults.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`  [FAIL] ${name}: ${err?.message || err}`);
  }
}

const VALID_STRONG_SECRET = 'a'.repeat(MIN_WORKFLOW_SECRET_LENGTH); // 32 chars
const VALID_WORKFLOW_ID = 'wf-inst-billing-001';
const VALID_WORKER_ID = 'worker-node-alpha';
const VALID_DECISION_ID = 'dec-billing-cutoff-001';

async function main(): Promise<void> {
  console.log('\n==================================================================');
  console.log('PHASE 2.2.1.2: WORKFLOW CAPABILITY TOKEN SECURITY TEST SUITE');
  console.log('==================================================================\n');

  const originalEnvSecret = process.env.WORKFLOW_INTERNAL_SECRET;
  const originalDevSecret = process.env.SAMJUNIORS_DEV_SECRET;
  const originalCwd = process.cwd();
  const scratchDir = path.join(os.tmpdir(), `samjuniors-captoken-test-${Date.now()}`);
  fs.mkdirSync(scratchDir, { recursive: true });
  process.chdir(scratchDir);

  try {
    DurableFileStore.resetInstance();
    DecisionStore.resetInstance();
    const service = DecisionLifecycleService.getInstance();

    // -------------------------------------------------------------------------
    // TEST 1: Missing secret configuration fails closed
    // -------------------------------------------------------------------------
    await runTest('1. Missing secret configuration fails closed', async () => {
      delete process.env.WORKFLOW_INTERNAL_SECRET;
      delete process.env.SAMJUNIORS_DEV_SECRET;

      assert.throws(
        () => getWorkflowCapabilitySecret(),
        /WORKFLOW_INTERNAL_SECRET is missing/,
        'getWorkflowCapabilitySecret must throw when no secret is configured'
      );

      assert.throws(
        () =>
          generateWorkerCapabilityToken({
            workflowInstanceId: VALID_WORKFLOW_ID,
            workerId: VALID_WORKER_ID,
            expiresAt: Date.now() + 60000,
          }),
        /WORKFLOW_INTERNAL_SECRET is missing/,
        'generateWorkerCapabilityToken must fail closed when secret is missing'
      );

      const verification = verifyWorkerCapabilityToken('some.token', VALID_WORKFLOW_ID);
      assert.strictEqual(verification.isValid, false, 'verifyWorkerCapabilityToken must return isValid: false');
      assert.match(verification.reason || '', /missing|not configured/, 'Reason must indicate missing secret');
    });

    // -------------------------------------------------------------------------
    // TEST 2: Empty or whitespace secret configuration fails closed
    // -------------------------------------------------------------------------
    await runTest('2. Empty or whitespace secret configuration fails closed', async () => {
      process.env.WORKFLOW_INTERNAL_SECRET = '   ';
      delete process.env.SAMJUNIORS_DEV_SECRET;

      assert.throws(
        () => getWorkflowCapabilitySecret(),
        /WORKFLOW_INTERNAL_SECRET is empty/,
        'getWorkflowCapabilitySecret must throw when secret is empty or whitespace'
      );

      const verification = verifyWorkerCapabilityToken('some.token', VALID_WORKFLOW_ID);
      assert.strictEqual(verification.isValid, false);
      assert.match(verification.reason || '', /empty/, 'Reason must indicate empty secret');
    });

    // -------------------------------------------------------------------------
    // TEST 3: Invalid or weak secret configuration (< 32 chars) fails closed
    // -------------------------------------------------------------------------
    await runTest('3. Weak secret (< 32 chars) configuration fails closed', async () => {
      process.env.WORKFLOW_INTERNAL_SECRET = 'short-secret-under-32-chars';
      delete process.env.SAMJUNIORS_DEV_SECRET;

      assert.throws(
        () => getWorkflowCapabilitySecret(),
        /insufficiently strong/,
        'Must reject secret shorter than minimum 32 characters'
      );

      const verification = verifyWorkerCapabilityToken('some.token', VALID_WORKFLOW_ID);
      assert.strictEqual(verification.isValid, false);
      assert.match(verification.reason || '', /insufficiently strong/);
    });

    // Configure valid secret for remaining tests
    process.env.WORKFLOW_INTERNAL_SECRET = VALID_STRONG_SECRET;

    // -------------------------------------------------------------------------
    // TEST 4: Expired token fails validation
    // -------------------------------------------------------------------------
    await runTest('4. Expired token fails validation', async () => {
      const expiredToken = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        workerId: VALID_WORKER_ID,
        expiresAt: Date.now() - 5000, // 5 seconds in the past
      });

      const verification = verifyWorkerCapabilityToken(expiredToken, VALID_WORKFLOW_ID);
      assert.strictEqual(verification.isValid, false);
      assert.strictEqual(verification.reason, 'Capability token has expired');
    });

    // -------------------------------------------------------------------------
    // TEST 5: Missing expiry in payload fails validation
    // -------------------------------------------------------------------------
    await runTest('5. Missing expiry in payload fails validation', async () => {
      assert.throws(
        () =>
          generateWorkerCapabilityToken({
            workflowInstanceId: VALID_WORKFLOW_ID,
            workerId: VALID_WORKER_ID,
          } as any),
        /expiresAt must be a valid finite number/,
        'Generation must reject missing expiresAt'
      );

      // Forge a signed token with missing expiresAt
      const forgedData = Buffer.from(
        JSON.stringify({ workflowInstanceId: VALID_WORKFLOW_ID, workerId: VALID_WORKER_ID }),
        'utf8'
      ).toString('base64url');
      const sig = createHmac('sha256', VALID_STRONG_SECRET).update(forgedData).digest('base64url');
      const forgedToken = `${forgedData}.${sig}`;

      const verification = verifyWorkerCapabilityToken(forgedToken, VALID_WORKFLOW_ID);
      assert.strictEqual(verification.isValid, false);
      assert.match(verification.reason || '', /Missing or invalid expiresAt/);
    });

    // -------------------------------------------------------------------------
    // TEST 6: Invalid expiry type (string, NaN, Infinity) fails validation
    // -------------------------------------------------------------------------
    await runTest('6. Invalid expiry type fails validation', async () => {
      assert.throws(
        () =>
          generateWorkerCapabilityToken({
            workflowInstanceId: VALID_WORKFLOW_ID,
            workerId: VALID_WORKER_ID,
            expiresAt: 'tomorrow' as any,
          }),
        /expiresAt must be a valid finite number/
      );

      const forgedData = Buffer.from(
        JSON.stringify({ workflowInstanceId: VALID_WORKFLOW_ID, workerId: VALID_WORKER_ID, expiresAt: '2026-12-31' }),
        'utf8'
      ).toString('base64url');
      const sig = createHmac('sha256', VALID_STRONG_SECRET).update(forgedData).digest('base64url');
      const verification = verifyWorkerCapabilityToken(`${forgedData}.${sig}`, VALID_WORKFLOW_ID);
      assert.strictEqual(verification.isValid, false);
      assert.match(verification.reason || '', /Missing or invalid expiresAt/);
    });

    // -------------------------------------------------------------------------
    // TEST 7: Missing workflow instance ID fails validation
    // -------------------------------------------------------------------------
    await runTest('7. Missing workflow instance ID fails validation', async () => {
      assert.throws(
        () =>
          generateWorkerCapabilityToken({
            workflowInstanceId: '',
            workerId: VALID_WORKER_ID,
            expiresAt: Date.now() + 60000,
          }),
        /workflowInstanceId must be a non-empty string/
      );

      const forgedData = Buffer.from(
        JSON.stringify({ workflowInstanceId: '  ', workerId: VALID_WORKER_ID, expiresAt: Date.now() + 60000 }),
        'utf8'
      ).toString('base64url');
      const sig = createHmac('sha256', VALID_STRONG_SECRET).update(forgedData).digest('base64url');
      const verification = verifyWorkerCapabilityToken(`${forgedData}.${sig}`);
      assert.strictEqual(verification.isValid, false);
      assert.match(verification.reason || '', /Missing or invalid workflowInstanceId/);
    });

    // -------------------------------------------------------------------------
    // TEST 8: Missing worker ID fails validation
    // -------------------------------------------------------------------------
    await runTest('8. Missing worker ID fails validation', async () => {
      assert.throws(
        () =>
          generateWorkerCapabilityToken({
            workflowInstanceId: VALID_WORKFLOW_ID,
            workerId: '',
            expiresAt: Date.now() + 60000,
          }),
        /workerId must be a non-empty string/
      );

      const forgedData = Buffer.from(
        JSON.stringify({ workflowInstanceId: VALID_WORKFLOW_ID, workerId: ' ', expiresAt: Date.now() + 60000 }),
        'utf8'
      ).toString('base64url');
      const sig = createHmac('sha256', VALID_STRONG_SECRET).update(forgedData).digest('base64url');
      const verification = verifyWorkerCapabilityToken(`${forgedData}.${sig}`);
      assert.strictEqual(verification.isValid, false);
      assert.match(verification.reason || '', /Missing or invalid workerId/);
    });

    // -------------------------------------------------------------------------
    // TEST 9: Missing decision ID for decision-scoped verification fails
    // -------------------------------------------------------------------------
    await runTest('9. Missing decision ID for decision-scoped verification fails', async () => {
      const generalToken = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        workerId: VALID_WORKER_ID,
        expiresAt: Date.now() + 60000,
      });

      // Calling verify with expectedDecisionId when token has none must fail
      const verification = verifyWorkerCapabilityToken(
        generalToken,
        VALID_WORKFLOW_ID,
        VALID_DECISION_ID,
        VALID_WORKER_ID
      );
      assert.strictEqual(verification.isValid, false);
      assert.match(verification.reason || '', /decisionId mismatch or missing/);
    });

    // -------------------------------------------------------------------------
    // TEST 10: Wrong workflow instance fails validation
    // -------------------------------------------------------------------------
    await runTest('10. Wrong workflow instance fails validation', async () => {
      const token = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        workerId: VALID_WORKER_ID,
        expiresAt: Date.now() + 60000,
      });

      const verification = verifyWorkerCapabilityToken(token, 'wf-other-workflow-999', undefined, VALID_WORKER_ID);
      assert.strictEqual(verification.isValid, false);
      assert.match(verification.reason || '', /workflowInstanceId mismatch/);
    });

    // -------------------------------------------------------------------------
    // TEST 11: Wrong decision ID fails validation
    // -------------------------------------------------------------------------
    await runTest('11. Wrong decision ID fails validation', async () => {
      const decisionToken = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        decisionId: VALID_DECISION_ID,
        workerId: VALID_WORKER_ID,
        expiresAt: Date.now() + 60000,
      });

      const verification = verifyWorkerCapabilityToken(
        decisionToken,
        VALID_WORKFLOW_ID,
        'dec-wrong-decision-999',
        VALID_WORKER_ID
      );
      assert.strictEqual(verification.isValid, false);
      assert.match(verification.reason || '', /decisionId mismatch/);
    });

    // -------------------------------------------------------------------------
    // TEST 12: Wrong worker ID fails validation
    // -------------------------------------------------------------------------
    await runTest('12. Wrong worker ID fails validation', async () => {
      const token = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        workerId: VALID_WORKER_ID,
        expiresAt: Date.now() + 60000,
      });

      const verification = verifyWorkerCapabilityToken(
        token,
        VALID_WORKFLOW_ID,
        undefined,
        'worker-impostor'
      );
      assert.strictEqual(verification.isValid, false);
      assert.match(verification.reason || '', /workerId mismatch/);
    });

    // -------------------------------------------------------------------------
    // TEST 13: Invalid or tampered signature fails validation
    // -------------------------------------------------------------------------
    await runTest('13. Invalid or tampered signature fails validation', async () => {
      const token = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        workerId: VALID_WORKER_ID,
        expiresAt: Date.now() + 60000,
      });

      const [data, sig] = token.split('.');
      const tamperedSig = sig.slice(0, -2) + (sig.endsWith('a') ? 'b' : 'a');
      const tamperedToken = `${data}.${tamperedSig}`;

      const verification = verifyWorkerCapabilityToken(tamperedToken, VALID_WORKFLOW_ID);
      assert.strictEqual(verification.isValid, false);
      assert.strictEqual(verification.reason, 'Invalid capability token signature');
    });

    // -------------------------------------------------------------------------
    // TEST 14: Malformed token structure and payload fails validation
    // -------------------------------------------------------------------------
    await runTest('14. Malformed token structure and payload fails validation', async () => {
      assert.strictEqual(verifyWorkerCapabilityToken('').isValid, false);
      assert.strictEqual(verifyWorkerCapabilityToken('just_one_part').isValid, false);
      assert.strictEqual(verifyWorkerCapabilityToken('part1.part2.part3').isValid, false);
      assert.strictEqual(verifyWorkerCapabilityToken('.part2').isValid, false);
      assert.strictEqual(verifyWorkerCapabilityToken('part1.').isValid, false);
      assert.strictEqual(verifyWorkerCapabilityToken('bad#char!.signature').isValid, false);

      // Valid signature on non-JSON payload
      const nonJsonData = Buffer.from('NOT_JSON_DATA', 'utf8').toString('base64url');
      const sig = createHmac('sha256', VALID_STRONG_SECRET).update(nonJsonData).digest('base64url');
      const nonJsonToken = `${nonJsonData}.${sig}`;
      const verification = verifyWorkerCapabilityToken(nonJsonToken);
      assert.strictEqual(verification.isValid, false);
      assert.match(verification.reason || '', /malformed JSON/);
    });

    // -------------------------------------------------------------------------
    // TEST 15: Valid token with all required claims succeeds
    // -------------------------------------------------------------------------
    await runTest('15. Valid token with all required claims succeeds', async () => {
      const validToken = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        decisionId: VALID_DECISION_ID,
        workerId: VALID_WORKER_ID,
        expiresAt: Date.now() + 120000,
      });

      const verification = verifyWorkerCapabilityToken(
        validToken,
        VALID_WORKFLOW_ID,
        VALID_DECISION_ID,
        VALID_WORKER_ID
      );
      assert.strictEqual(verification.isValid, true);
      assert.strictEqual(verification.payload?.workflowInstanceId, VALID_WORKFLOW_ID);
      assert.strictEqual(verification.payload?.decisionId, VALID_DECISION_ID);
      assert.strictEqual(verification.payload?.workerId, VALID_WORKER_ID);
    });

    // -------------------------------------------------------------------------
    // TEST 16: Cross-workflow replay rejection in DecisionLifecycleService
    // -------------------------------------------------------------------------
    await runTest('16. Cross-workflow replay rejection in DecisionLifecycleService', async () => {
      // 1. Propose and approve a decision linked to VALID_WORKFLOW_ID
      const dec = await service.proposeDecision({
        creationRequestId: 'req-cap-test-1',
        title: 'Capability Token Test Decision',
        problemStatement: 'Problem',
        proposedAction: 'Action',
        category: 'operational',
        proposer: 'founder',
        approvalRequired: true,
      });

      await service.submitForApproval({
        decisionId: dec.decisionId,
        expectedStateVersion: 1,
        actor: 'founder',
        reason: 'Submit',
      });

      await service.approveDecision({
        decisionId: dec.decisionId,
        expectedStateVersion: 2,
        actor: 'founder',
        reason: 'Approved',
        userContext: { role: 'FOUNDER', userId: 'founder', source: 'session' },
      });

      // Token generated for a DIFFERENT workflow
      const otherWorkflowToken = generateWorkerCapabilityToken({
        workflowInstanceId: 'wf-malicious-other-instance',
        workerId: 'worker-node-alpha',
        expiresAt: Date.now() + 60000,
      });

      // Attempt to start execution for VALID_WORKFLOW_ID using token from another workflow
      await assert.rejects(
        async () => {
          await service.startExecution({
            decisionId: dec.decisionId,
            expectedStateVersion: 3,
            actor: 'worker-node-alpha',
            reason: 'Malicious replay attempt',
            linkedWorkflowId: VALID_WORKFLOW_ID,
            userContext: {
              role: 'WORKFLOW_WORKER',
              workflowInstanceId: 'wf-malicious-other-instance',
              workerCapabilityToken: otherWorkflowToken,
              source: 'workflow_runtime',
            },
          });
        },
        (err: any) => err instanceof UnauthorizedDecisionActionError,
        'Must reject execution start when capability token belongs to another workflow'
      );

      // Now use a LEGITIMATE token scoped to VALID_WORKFLOW_ID
      const legitimateToken = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        workerId: 'worker-node-alpha',
        expiresAt: Date.now() + 60000,
      });

      const execRes = await service.startExecution({
        decisionId: dec.decisionId,
        expectedStateVersion: 3,
        actor: 'worker-node-alpha',
        reason: 'Legitimate execution start',
        linkedWorkflowId: VALID_WORKFLOW_ID,
        userContext: {
          role: 'WORKFLOW_WORKER',
          workflowInstanceId: VALID_WORKFLOW_ID,
          workerCapabilityToken: legitimateToken,
          source: 'workflow_runtime',
        },
      });
      assert.strictEqual(execRes.status, 'executing');
    });

    // -------------------------------------------------------------------------
    // TEST 17: Client-supplied capability token rejection
    // -------------------------------------------------------------------------
    await runTest('17. Client-supplied capability token rejection', async () => {
      // Set up an executing decision
      const clientDec = await service.proposeDecision({
        creationRequestId: 'req-client-token-test',
        title: 'Client Token Decision',
        problemStatement: 'Problem',
        proposedAction: 'Action',
        category: 'operational',
        proposer: 'founder',
      });
      await service.submitForApproval({
        decisionId: clientDec.decisionId,
        expectedStateVersion: 1,
        actor: 'founder',
        reason: 'Submit',
      });
      await service.approveDecision({
        decisionId: clientDec.decisionId,
        expectedStateVersion: 2,
        actor: 'founder',
        reason: 'Approve',
        userContext: { role: 'FOUNDER', userId: 'founder', source: 'session' },
      });
      await service.startExecution({
        decisionId: clientDec.decisionId,
        expectedStateVersion: 3,
        actor: 'founder',
        reason: 'Start execution',
        linkedWorkflowId: VALID_WORKFLOW_ID,
        userContext: { role: 'FOUNDER', userId: 'founder', source: 'session' },
      });

      // Even with a cryptographically valid token, source === 'client' must be rejected
      const validToken = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        workerId: 'worker-node-alpha',
        expiresAt: Date.now() + 60000,
      });

      // Attempt to resolve decision with client-supplied context
      await assert.rejects(
        async () => {
          await service.resolveDecision({
            decisionId: clientDec.decisionId,
            expectedStateVersion: 4,
            actor: 'worker-node-alpha',
            reason: 'Client supplied token attempt',
            outcome: {
              outcomeSummary: 'Attempted resolution',
              resolvedAt: new Date().toISOString(),
              resolvedBy: 'worker-node-alpha',
            },
            userContext: {
              role: 'WORKFLOW_WORKER',
              workflowInstanceId: VALID_WORKFLOW_ID,
              workerCapabilityToken: validToken,
              source: 'client', // CLIENT MUST FAIL CLOSED!
            },
          });
        },
        (err: any) => err instanceof UnauthorizedDecisionActionError,
        'Must reject client-supplied context even when carrying a valid capability token'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 18: Production mode strictly rejects SAMJUNIORS_DEV_SECRET fallback
    // -------------------------------------------------------------------------
    await runTest('18. Production mode strictly rejects SAMJUNIORS_DEV_SECRET fallback', async () => {
      const origNodeEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'production';
        delete process.env.WORKFLOW_INTERNAL_SECRET;
        process.env.SAMJUNIORS_DEV_SECRET = 'valid-length-development-secret-that-is-over-32-chars';

        assert.throws(
          () => getWorkflowCapabilitySecret(),
          /SAMJUNIORS_DEV_SECRET fallback is prohibited/,
          'Must throw when WORKFLOW_INTERNAL_SECRET is unset in production, even if SAMJUNIORS_DEV_SECRET is present'
        );

        // Even with whitespace WORKFLOW_INTERNAL_SECRET in production
        process.env.WORKFLOW_INTERNAL_SECRET = '   ';
        assert.throws(
          () => getWorkflowCapabilitySecret(),
          /empty in production mode/,
          'Must reject whitespace secret in production mode without falling back'
        );

        // With valid WORKFLOW_INTERNAL_SECRET in production, it succeeds
        process.env.WORKFLOW_INTERNAL_SECRET = VALID_STRONG_SECRET;
        const secret = getWorkflowCapabilitySecret();
        assert.strictEqual(secret, VALID_STRONG_SECRET);
      } finally {
        (process.env as any).NODE_ENV = origNodeEnv;
        process.env.WORKFLOW_INTERNAL_SECRET = VALID_STRONG_SECRET;
      }
    });

    // -------------------------------------------------------------------------
    // TEST 19: Direct invocation without actor or userContext fails closed
    // -------------------------------------------------------------------------
    await runTest('19. Direct invocation without actor or userContext fails closed', async () => {
      assert.strictEqual(
        isAuthorizedWorkflowWorker('', { source: 'workflow_runtime', workflowInstanceId: VALID_WORKFLOW_ID }, VALID_WORKFLOW_ID),
        false,
        'Empty actor must return false'
      );
      assert.strictEqual(
        isAuthorizedWorkflowWorker('worker-1', undefined, VALID_WORKFLOW_ID),
        false,
        'Missing userContext must return false'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 20: Non-in-process caller claiming WORKFLOW_WORKER without token fails closed
    // -------------------------------------------------------------------------
    await runTest('20. Non-in-process caller claiming WORKFLOW_WORKER without token fails closed', async () => {
      // Caller has role WORKFLOW_WORKER, but source is undefined (not workflow_runtime/system)
      // and workerCapabilityToken is absent. Must fail closed!
      assert.strictEqual(
        isAuthorizedWorkflowWorker(
          'worker-node-1',
          { role: 'WORKFLOW_WORKER', workflowInstanceId: VALID_WORKFLOW_ID },
          VALID_WORKFLOW_ID
        ),
        false,
        'Non-in-process caller without capability token must fail closed'
      );

      // Caller has source: 'session' with role: 'WORKFLOW_WORKER' and no token
      assert.strictEqual(
        isAuthorizedWorkflowWorker(
          'worker-node-1',
          { role: 'WORKFLOW_WORKER', source: 'session', workflowInstanceId: VALID_WORKFLOW_ID },
          VALID_WORKFLOW_ID
        ),
        false,
        'Session caller without capability token must fail closed'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 21: Legitimate in-process workflow runtime resolution without token succeeds
    // -------------------------------------------------------------------------
    await runTest('21. Legitimate in-process workflow runtime resolution without token succeeds', async () => {
      // In-process runtime (source: 'workflow_runtime') does not require external token
      assert.strictEqual(
        isAuthorizedWorkflowWorker(
          'workflow-runtime-daemon',
          { source: 'workflow_runtime', workflowInstanceId: VALID_WORKFLOW_ID },
          VALID_WORKFLOW_ID
        ),
        true,
        'In-process runtime bound to matching workflow must be authorized'
      );

      // System source (source: 'system') also authorized in-process
      assert.strictEqual(
        isAuthorizedWorkflowWorker(
          'system-recovery-worker',
          { source: 'system', workflowInstanceId: VALID_WORKFLOW_ID },
          VALID_WORKFLOW_ID
        ),
        true,
        'System runtime bound to matching workflow must be authorized'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 22: Legitimate in-process workflow runtime resolution with valid token succeeds
    // -------------------------------------------------------------------------
    await runTest('22. Legitimate in-process workflow runtime resolution with valid token succeeds', async () => {
      const validToken = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        workerId: 'worker-node-beta',
        expiresAt: Date.now() + 60000,
      });

      assert.strictEqual(
        isAuthorizedWorkflowWorker(
          'worker-node-beta',
          {
            source: 'workflow_runtime',
            role: 'WORKFLOW_WORKER',
            workflowInstanceId: VALID_WORKFLOW_ID,
            workerCapabilityToken: validToken,
          },
          VALID_WORKFLOW_ID
        ),
        true,
        'Runtime with matching valid token must be authorized'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 23: In-process workflow runtime resolution with invalid or expired token fails closed
    // -------------------------------------------------------------------------
    await runTest('23. In-process workflow runtime with invalid or expired token fails closed', async () => {
      const expiredToken = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        workerId: 'worker-node-beta',
        expiresAt: Date.now() - 5000,
      });

      assert.strictEqual(
        isAuthorizedWorkflowWorker(
          'worker-node-beta',
          {
            source: 'workflow_runtime',
            workflowInstanceId: VALID_WORKFLOW_ID,
            workerCapabilityToken: expiredToken,
          },
          VALID_WORKFLOW_ID
        ),
        false,
        'Runtime presenting expired token must fail closed'
      );

      assert.strictEqual(
        isAuthorizedWorkflowWorker(
          'worker-node-beta',
          {
            source: 'workflow_runtime',
            workflowInstanceId: VALID_WORKFLOW_ID,
            workerCapabilityToken: 'tampered.token',
          },
          VALID_WORKFLOW_ID
        ),
        false,
        'Runtime presenting tampered token must fail closed'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 24: Decision-scoped capability token for wrong decision fails closed
    // -------------------------------------------------------------------------
    await runTest('24. Decision-scoped capability token for wrong decision fails closed', async () => {
      const decisionScopedToken = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        decisionId: 'dec-authorized-123',
        workerId: 'worker-node-gamma',
        expiresAt: Date.now() + 60000,
      });

      // Token scoped to dec-authorized-123 presented for dec-different-456
      assert.strictEqual(
        isAuthorizedWorkflowWorker(
          'worker-node-gamma',
          {
            source: 'workflow_runtime',
            workflowInstanceId: VALID_WORKFLOW_ID,
            workerCapabilityToken: decisionScopedToken,
          },
          VALID_WORKFLOW_ID,
          'dec-different-456'
        ),
        false,
        'Decision-scoped token must be rejected when presented for a different decision'
      );

      // Decision-scoped token presented for matching decision succeeds
      assert.strictEqual(
        isAuthorizedWorkflowWorker(
          'worker-node-gamma',
          {
            source: 'workflow_runtime',
            workflowInstanceId: VALID_WORKFLOW_ID,
            workerCapabilityToken: decisionScopedToken,
          },
          VALID_WORKFLOW_ID,
          'dec-authorized-123'
        ),
        true,
        'Decision-scoped token must succeed when presented for matching decision'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 25: Capability token presented by wrong worker fails closed
    // -------------------------------------------------------------------------
    await runTest('25. Capability token presented by wrong worker fails closed', async () => {
      const tokenForWorkerAlpha = generateWorkerCapabilityToken({
        workflowInstanceId: VALID_WORKFLOW_ID,
        workerId: 'worker-node-alpha',
        expiresAt: Date.now() + 60000,
      });

      // worker-node-imposter attempts to use token minted for worker-node-alpha
      assert.strictEqual(
        isAuthorizedWorkflowWorker(
          'worker-node-imposter',
          {
            source: 'workflow_runtime',
            workflowInstanceId: VALID_WORKFLOW_ID,
            workerCapabilityToken: tokenForWorkerAlpha,
          },
          VALID_WORKFLOW_ID
        ),
        false,
        'Token presented by a different worker identity must fail closed'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 26: Worker execution attempt on unlinked decision fails closed
    // -------------------------------------------------------------------------
    await runTest('26. Worker execution attempt on unlinked decision fails closed', async () => {
      // When linkedWorkflowId is undefined or empty string
      assert.strictEqual(
        isAuthorizedWorkflowWorker(
          'worker-node-alpha',
          {
            source: 'workflow_runtime',
            workflowInstanceId: VALID_WORKFLOW_ID,
          },
          undefined
        ),
        false,
        'Worker attempt on decision without linkedWorkflowId must return false'
      );

      assert.strictEqual(
        isAuthorizedWorkflowWorker(
          'worker-node-alpha',
          {
            source: 'workflow_runtime',
            workflowInstanceId: VALID_WORKFLOW_ID,
          },
          '   '
        ),
        false,
        'Worker attempt with whitespace linkedWorkflowId must return false'
      );
    });

  } finally {
    process.chdir(originalCwd);
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch {}
    if (originalEnvSecret !== undefined) {
      process.env.WORKFLOW_INTERNAL_SECRET = originalEnvSecret;
    } else {
      delete process.env.WORKFLOW_INTERNAL_SECRET;
    }
    if (originalDevSecret !== undefined) {
      process.env.SAMJUNIORS_DEV_SECRET = originalDevSecret;
    } else {
      delete process.env.SAMJUNIORS_DEV_SECRET;
    }
    DurableFileStore.resetInstance();
    DecisionStore.resetInstance();
  }

  console.log('\n==================================================================');
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;
  console.log(`WORKFLOW CAPABILITY TOKEN TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('==================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
