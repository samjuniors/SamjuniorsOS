import assert from 'assert';
import {
  generateLogicalIdempotencyKey,
  normalizeClientSuppliedKey,
  IdempotencyPayloadMismatchError,
  OperationInProgressError,
  UnknownExternalResultError,
  IdempotencyConflictError,
} from '../lib/server/idempotency/state-machine';
import {
  InMemoryIdempotencyStore,
  PostgresIdempotencyStore,
  getIdempotencyStore,
} from '../lib/server/idempotency/store';
import { SideEffectAuthorizationGate } from '../lib/server/authorization/gate';
import { InMemoryApprovalStore, InMemoryAuditStore } from '../lib/server/authorization/approval-store';
import { computeApprovalPayloadHash } from '../lib/server/authorization/payload-binding';
import { ResendCommunicationProviderAdapter } from '../lib/server/communication/resend-provider';
import { DatabaseAuthorityError } from '../lib/server/db/authority';
import { FounderApprovalRecord, AuthorizationEvaluationRequest } from '../types/authorization';
import { Message } from '../types/communication';

/**
 * ============================================================================
 * SAMJUNIORS OS — PHASE 2.4 DURABLE IDEMPOTENCY & SIDE-EFFECT RECOVERY SUITE
 * ============================================================================
 *
 * Verifies:
 * 1. Canonical Identity & Key Normalization
 * 2. Idempotency State Machine & Transitions (claimed -> completed/failed/unknown)
 * 3. Cryptographic Payload Binding & Anti-Tampering Enforcement
 * 4. SideEffectAuthorizationGate Integration & Single-Use Approval Semantics
 * 5. Crash/Timeout Ambiguity & Recovery Protection
 * 6. Provider-Aware Idempotency (Resend HTTP headers)
 * 7. Authoritative PostgreSQL Fail-Closed Invariant
 * ============================================================================
 */

async function runIdempotencySuite() {
  console.log('================================================================');
  console.log('⚡  SAMJUNIORS OS — PHASE 2.4 DURABLE IDEMPOTENCY & RECOVERY SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(testName: string) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  }

  function recordFail(testName: string, error: any) {
    console.error(`  ✗ FAIL: ${testName}`);
    console.error(`    ${error?.stack || error?.message || error}`);
    failed++;
  }

  // --- Group 1: Canonical Identity & Key Normalization ---
  console.log('--- Group 1: Canonical Identity & Key Normalization ---');

  try {
    const key1 = generateLogicalIdempotencyKey({
      actionName: 'Send Email',
      targetSystem: 'resend',
      logicalOpId: 'order-12345',
    });
    const key2 = generateLogicalIdempotencyKey({
      actionName: 'Send Email',
      targetSystem: 'resend',
      logicalOpId: 'order-12345',
    });
    assert.strictEqual(key1, key2, 'Keys generated with identical inputs must be byte-for-byte identical');
    assert.ok(key1.startsWith('op:'), 'Canonical key must have op: prefix');
    assert.ok(key1.includes('send_email'), 'Canonical key must include normalized action');
    assert.ok(key1.includes('resend'), 'Canonical key must include target system');
    assert.ok(key1.includes('order-12345'), 'Canonical key must include logical op ID');
    recordPass('Deterministic key generation from { actionName, targetSystem, logicalOpId }');
  } catch (err) {
    recordFail('Deterministic key generation from { actionName, targetSystem, logicalOpId }', err);
  }

  try {
    const keyA = generateLogicalIdempotencyKey({
      actionName: 'Send Email',
      targetSystem: 'resend',
      logicalOpId: 'op-1',
    });
    const keyB = generateLogicalIdempotencyKey({
      actionName: 'Send Slack',
      targetSystem: 'slack',
      logicalOpId: 'op-1',
    });
    const keyC = generateLogicalIdempotencyKey({
      actionName: 'Send Email',
      targetSystem: 'resend',
      logicalOpId: 'op-2',
    });
    assert.notStrictEqual(keyA, keyB, 'Keys with different systems/actions must not collide');
    assert.notStrictEqual(keyA, keyC, 'Keys with different logicalOpIds must not collide');
    recordPass('Key collision resistance across differing actions and operation IDs');
  } catch (err) {
    recordFail('Key collision resistance across differing actions and operation IDs', err);
  }

  try {
    const normKey = normalizeClientSuppliedKey('  my-client-req-9988  ', 'checkout');
    assert.ok(normKey.startsWith('client:checkout:'), 'Normalized client key must have prefix');
    assert.ok(normKey.includes('my-client-req-9988'), 'Normalized client key must include trimmed ID');

    // Very long key test (must be hashed down to max length)
    const veryLongKey = 'x'.repeat(300);
    const hashedKey = normalizeClientSuppliedKey(veryLongKey, 'upload');
    assert.ok(hashedKey.length <= 128, 'Normalized key must never exceed 128 chars');
    recordPass('Client key normalization and length bounding');
  } catch (err) {
    recordFail('Client key normalization and length bounding', err);
  }

  // --- Group 2: Idempotency State Machine & Transitions ---
  console.log('\n--- Group 2: Idempotency State Machine & Transitions ---');

  const testStore = new InMemoryIdempotencyStore();

  try {
    testStore.clear();
    const testKey = 'op:test:sys:1001';
    const hash = 'hash-abc-123';

    // 1. Initial claim
    const claim1 = await testStore.claim({
      key: testKey,
      actionName: 'Test Operation',
      payloadHash: hash,
      executionRef: 'exec-1',
    });
    assert.strictEqual(claim1.state, 'claimed', 'First claim must transition to claimed');
    assert.strictEqual(claim1.record.status, 'in_progress', 'Initial status must be in_progress');

    // 2. Concurrent claim while in_progress throws OperationInProgressError
    await assert.rejects(
      async () => {
        await testStore.claim({
          key: testKey,
          actionName: 'Test Operation',
          payloadHash: hash,
          executionRef: 'exec-2',
        });
      },
      (err: any) => err instanceof OperationInProgressError,
      'Concurrent claim on in-progress record must throw OperationInProgressError'
    );
    recordPass('Initial claim and concurrent in-progress rejection');
  } catch (err) {
    recordFail('Initial claim and concurrent in-progress rejection', err);
  }

  try {
    const testKey = 'op:test:sys:1001';
    const hash = 'hash-abc-123';

    // Complete the operation
    const completed = await testStore.complete(testKey, { success: true, balance: 500 }, 'exec-1');
    assert.strictEqual(completed.status, 'completed', 'Completed operation status must be completed');
    assert.deepStrictEqual(completed.response, { success: true, balance: 500 });

    // Subsequent claim returns state: 'completed' with cached response
    const replayClaim = await testStore.claim({
      key: testKey,
      actionName: 'Test Operation',
      payloadHash: hash,
      executionRef: 'exec-3',
    });
    assert.strictEqual(replayClaim.state, 'completed', 'Claim on completed record must return completed state');
    assert.deepStrictEqual(replayClaim.record.response, { success: true, balance: 500 });
    recordPass('Completed operation replay without side-effect invocation');
  } catch (err) {
    recordFail('Completed operation replay without side-effect invocation', err);
  }

  try {
    const crashKey = 'op:test:crash:2002';
    const hash = 'hash-crash-456';

    await testStore.claim({
      key: crashKey,
      actionName: 'Crashable Operation',
      payloadHash: hash,
      executionRef: 'exec-crash-1',
    });

    // Worker crashes or times out -> markUnknown
    await testStore.markUnknown(crashKey, 'HTTP 504 Gateway Timeout from payment gateway');
    const record = await testStore.get(crashKey);
    assert.strictEqual(record?.status, 'unknown');

    // Subsequent claim must fail closed with UnknownExternalResultError
    await assert.rejects(
      async () => {
        await testStore.claim({
          key: crashKey,
          actionName: 'Crashable Operation',
          payloadHash: hash,
          executionRef: 'exec-crash-2',
        });
      },
      (err: any) => err instanceof UnknownExternalResultError,
      'Claim on unknown record must throw UnknownExternalResultError to prevent blind retry'
    );
    recordPass('Ambiguous crash/timeout recovery state blocks blind retries');
  } catch (err) {
    recordFail('Ambiguous crash/timeout recovery state blocks blind retries', err);
  }

  // --- Group 3: Cryptographic Payload Binding & Anti-Tampering ---
  console.log('\n--- Group 3: Cryptographic Payload Binding & Anti-Tampering ---');

  try {
    testStore.clear();
    const boundKey = 'op:transfer:bank:3003';
    const originalHash = computeApprovalPayloadHash('Transfer Funds', { targetSystem: 'bank' }, { amount: 100, to: 'Alice' });
    const alteredHash = computeApprovalPayloadHash('Transfer Funds', { targetSystem: 'bank' }, { amount: 10000, to: 'Attacker' });

    // Claim with original payload
    await testStore.claim({
      key: boundKey,
      actionName: 'Transfer Funds',
      payloadHash: originalHash,
      executionRef: 'exec-bound-1',
    });
    await testStore.complete(boundKey, { transferred: 100 });

    // Attempt to reuse the same idempotency key with altered payload
    await assert.rejects(
      async () => {
        await testStore.claim({
          key: boundKey,
          actionName: 'Transfer Funds',
          payloadHash: alteredHash,
          executionRef: 'exec-bound-2',
        });
      },
      (err: any) => {
        assert.ok(err instanceof IdempotencyPayloadMismatchError, 'Must be IdempotencyPayloadMismatchError');
        assert.strictEqual(err.key, boundKey);
        assert.strictEqual(err.expectedHash, originalHash);
        assert.strictEqual(err.actualHash, alteredHash);
        return true;
      },
      'Same idempotency key with altered payload must be strictly rejected'
    );

    // Verify original record is unharmed
    const unmodified = await testStore.get(boundKey);
    assert.strictEqual(unmodified?.payloadHash, originalHash);
    assert.deepStrictEqual(unmodified?.response, { transferred: 100 });
    recordPass('Cryptographic payload binding mismatch rejection');
  } catch (err) {
    recordFail('Cryptographic payload binding mismatch rejection', err);
  }

  // --- Group 4: SideEffectAuthorizationGate Integration ---
  console.log('\n--- Group 4: SideEffectAuthorizationGate Integration ---');

  const approvalStore = new InMemoryApprovalStore();
  const auditStore = new InMemoryAuditStore();
  const gate = new SideEffectAuthorizationGate(approvalStore, auditStore);

  try {
    approvalStore.clear();
    auditStore.clear();
    testStore.clear();

    let sideEffectExecutionCount = 0;
    const executeFn = async () => {
      sideEffectExecutionCount++;
      return { sent: true, providerId: 'msg-ext-999' };
    };

    const actionRequest: AuthorizationEvaluationRequest = {
      employeeRole: 'sales_rep',
      actionName: 'Outbound Prospecting Email',
      classification: 'external_communication',
      target: { targetSystem: 'resend', recipient: 'customer@acme.corp' },
      payload: { subject: 'Partnership Inquiry', body: 'Hello Acme' },
    };

    // Need Founder approval for external_communication
    const approval = await gate.requestApproval({
      actionName: actionRequest.actionName,
      classification: actionRequest.classification,
      workflowInstanceId: 'wf-comm-1',
      stepId: 'step-email-1',
      employeeRole: actionRequest.employeeRole,
      scope: { scopeType: 'single_action' },
      payload: actionRequest.payload,
      target: actionRequest.target,
    });

    await gate.decideApproval({
      approvalId: approval.id,
      decision: 'approved',
      decidedBy: 'founder',
      userContext: { role: 'FOUNDER' },
    });

    // 1. First execution through gate
    const result1 = await gate.executeWithGate({
      request: {
        ...actionRequest,
        approvalId: approval.id,
      },
      idempotency: {
        targetSystem: 'resend',
        logicalOpId: 'comm-intent-001',
        payload: actionRequest.payload,
      },
      executeFn,
    });

    assert.strictEqual(result1.allowed, true);
    assert.strictEqual(result1.executed, true);
    assert.strictEqual(result1.idempotentReplay, false);
    assert.strictEqual(sideEffectExecutionCount, 1, 'Side effect must execute exactly once');
    assert.deepStrictEqual(result1.result, { sent: true, providerId: 'msg-ext-999' });

    // 2. Second execution with identical idempotency inputs (replay)
    const result2 = await gate.executeWithGate({
      request: {
        ...actionRequest,
        approvalId: approval.id, // Single action approval was already consumed, but replay must succeed!
      },
      idempotency: {
        targetSystem: 'resend',
        logicalOpId: 'comm-intent-001',
        payload: actionRequest.payload,
      },
      executeFn,
    });

    assert.strictEqual(result2.allowed, true);
    assert.strictEqual(result2.executed, false, 'Replayed call must NOT set executed = true');
    assert.strictEqual(result2.idempotentReplay, true, 'Replayed call must have idempotentReplay = true');
    assert.strictEqual(sideEffectExecutionCount, 1, 'Side effect must NOT be called a second time');
    assert.deepStrictEqual(result2.result, { sent: true, providerId: 'msg-ext-999' });

    // Verify audit logs
    const audits = await auditStore.list();
    const replayAudit = audits.find(a => a.reasonCode === 'IDEMPOTENT_REPLAY');
    assert.ok(replayAudit, 'Audit trail must contain an IDEMPOTENT_REPLAY record');
    assert.strictEqual(replayAudit.executed, false);

    recordPass('SideEffectAuthorizationGate replay caching and audit generation');
  } catch (err) {
    recordFail('SideEffectAuthorizationGate replay caching and audit generation', err);
  }

  try {
    // Test payload tampering in gate
    const actionRequest: AuthorizationEvaluationRequest = {
      employeeRole: 'sales_rep',
      actionName: 'Outbound Prospecting Email',
      classification: 'external_communication',
      target: { targetSystem: 'resend', recipient: 'customer@acme.corp' },
      payload: { subject: 'Tampered Body Content' },
    };

    await assert.rejects(
      async () => {
        await gate.executeWithGate({
          request: actionRequest,
          idempotency: {
            targetSystem: 'resend',
            logicalOpId: 'comm-intent-001', // Existing completed key
            payload: actionRequest.payload, // Altered payload
          },
          executeFn: async () => ({ sent: true }),
        });
      },
      (err: any) => err instanceof IdempotencyPayloadMismatchError,
      'Gate must reject tampered payload under existing key'
    );
    recordPass('Gate rejects tampered payload with IdempotencyPayloadMismatchError');
  } catch (err) {
    recordFail('Gate rejects tampered payload with IdempotencyPayloadMismatchError', err);
  }

  // --- Group 5: Crash/Timeout Ambiguity & UnknownExternalResultError ---
  console.log('\n--- Group 5: Crash/Timeout Ambiguity & UnknownExternalResultError ---');

  try {
    const timeoutRequest: AuthorizationEvaluationRequest = {
      employeeRole: 'sales_rep',
      actionName: 'High Latency External Call',
      classification: 'external_communication',
      target: { targetSystem: 'partner-api' },
      payload: { ping: true },
    };

    const approval = await gate.requestApproval({
      actionName: timeoutRequest.actionName,
      classification: timeoutRequest.classification,
      workflowInstanceId: 'wf-timeout-1',
      stepId: 'step-timeout-1',
      employeeRole: timeoutRequest.employeeRole,
      scope: { scopeType: 'single_action' },
      payload: timeoutRequest.payload,
      target: timeoutRequest.target,
    });

    await gate.decideApproval({
      approvalId: approval.id,
      decision: 'approved',
      decidedBy: 'founder',
      userContext: { role: 'FOUNDER' },
    });

    // Execute function throws a timeout error
    await assert.rejects(
      async () => {
        await gate.executeWithGate({
          request: { ...timeoutRequest, approvalId: approval.id },
          idempotency: {
            targetSystem: 'partner-api',
            logicalOpId: 'timeout-op-1',
            payload: timeoutRequest.payload,
          },
          executeFn: async () => {
            const timeoutErr: any = new Error('Gateway Connection Timeout after 30000ms');
            timeoutErr.code = 'ETIMEDOUT';
            throw timeoutErr;
          },
        });
      },
      (err: any) => err instanceof UnknownExternalResultError,
      'Gate must wrap ambiguous timeout in UnknownExternalResultError'
    );

    // Subsequent attempt must also throw UnknownExternalResultError
    await assert.rejects(
      async () => {
        await gate.executeWithGate({
          request: { ...timeoutRequest, approvalId: approval.id },
          idempotency: {
            targetSystem: 'partner-api',
            logicalOpId: 'timeout-op-1',
            payload: timeoutRequest.payload,
          },
          executeFn: async () => ({ status: 'retry' }),
        });
      },
      (err: any) => err instanceof UnknownExternalResultError,
      'Subsequent execution on ambiguous record must throw UnknownExternalResultError'
    );

    recordPass('Timeout triggers unknown state and prevents blind retries');
  } catch (err) {
    recordFail('Timeout triggers unknown state and prevents blind retries', err);
  }

  // --- Group 6: Provider-Aware Idempotency (Resend Provider) ---
  console.log('\n--- Group 6: Provider-Aware Idempotency (Resend Provider) ---');

  try {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    // Custom mock fetch client
    const mockFetch = async (url: string, init: any) => {
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'resend-msg-777111' }),
      };
    };

    const resendProvider = new ResendCommunicationProviderAdapter({
      apiKey: 're_test_key_1234567890',
      fetcher: mockFetch as any,
    });

    const testMessage: Message = {
      id: 'msg-local-1',
      conversationId: 'conv-1',
      channel: 'email',
      sender: { address: 'founder@samjuniors.com', name: 'Founder' },
      recipients: [{ address: 'client@example.com' }],
      subject: 'Phase 2.4 Idempotent Delivery',
      bodyContent: 'Testing Resend Idempotency-Key header',
      bodyMimeType: 'text/plain',
      direction: 'outbound',
      timestamp: new Date().toISOString(),
      deliveryStatus: 'pending_approval',
    };

    const idempotencyKey = 'op:send_email:resend:intent-555';
    const result = await resendProvider.sendMessage(testMessage, 'appr-123', idempotencyKey);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.externalMessageId, 'resend-msg-777111');
    assert.strictEqual(capturedHeaders['Idempotency-Key'], idempotencyKey, 'Resend provider must transmit Idempotency-Key header');
    assert.strictEqual(capturedHeaders['Authorization'], 'Bearer re_test_key_1234567890');

    recordPass('ResendCommunicationProvider correctly transmits Idempotency-Key HTTP header');
  } catch (err) {
    recordFail('ResendCommunicationProvider correctly transmits Idempotency-Key HTTP header', err);
  }

  // --- Group 7: Authoritative PostgreSQL Fail-Closed Invariant ---
  console.log('\n--- Group 7: Authoritative PostgreSQL Fail-Closed Invariant ---');

  try {
    const prevMode = process.env.DATABASE_MODE;
    const prevUrl = process.env.DATABASE_URL;
    process.env.DATABASE_MODE = 'authoritative';
    delete process.env.DATABASE_URL;

    try {
      const postgresStore = new PostgresIdempotencyStore();

      let claimFailedClosed = false;
      try {
        await postgresStore.claim({
          key: 'op:db:test:1',
          actionName: 'Test DB',
          payloadHash: 'hash',
        });
      } catch (err: any) {
        if (err instanceof DatabaseAuthorityError || /DatabaseAuthority|FAIL-CLOSED/i.test(err?.message || '')) {
          claimFailedClosed = true;
        }
      }
      assert.strictEqual(claimFailedClosed, true, 'PostgresIdempotencyStore.claim must fail closed when DB is unreachable');

      let completeFailedClosed = false;
      try {
        await postgresStore.complete('op:db:test:1', { ok: true });
      } catch (err: any) {
        if (err instanceof DatabaseAuthorityError || /DatabaseAuthority|FAIL-CLOSED/i.test(err?.message || '')) {
          completeFailedClosed = true;
        }
      }
      assert.strictEqual(completeFailedClosed, true, 'PostgresIdempotencyStore.complete must fail closed when DB is unreachable');

      recordPass('PostgresIdempotencyStore fails closed when database is unreachable');
    } finally {
      process.env.DATABASE_MODE = prevMode;
      if (prevUrl) process.env.DATABASE_URL = prevUrl;
    }
  } catch (err) {
    recordFail('PostgresIdempotencyStore fails closed when database is unreachable', err);
  }

  // --- Group 8: Single-Use Approval Protection ---
  console.log('\n--- Group 8: Single-Use Approval Invariant Under Idempotency ---');

  try {
    approvalStore.clear();
    auditStore.clear();
    testStore.clear();

    const req: AuthorizationEvaluationRequest = {
      employeeRole: 'sales_rep',
      actionName: 'Single Use Side Effect',
      classification: 'external_communication',
      target: { targetSystem: 'resend' },
      payload: { action: 'fire_once' },
    };

    const approval = await gate.requestApproval({
      actionName: req.actionName,
      classification: req.classification,
      workflowInstanceId: 'wf-single-1',
      stepId: 'step-1',
      employeeRole: req.employeeRole,
      scope: { scopeType: 'single_action' },
      payload: req.payload,
      target: req.target,
    });

    await gate.decideApproval({
      approvalId: approval.id,
      decision: 'approved',
      decidedBy: 'founder',
      userContext: { role: 'FOUNDER' },
    });

    // Check approval is approved and not consumed
    const apprBefore = await approvalStore.get(approval.id);
    assert.strictEqual(apprBefore?.decision, 'approved');
    assert.strictEqual(apprBefore?.scope.usedCount || 0, 0);

    // Execute through gate
    await gate.executeWithGate({
      request: { ...req, approvalId: approval.id },
      idempotency: {
        targetSystem: 'resend',
        logicalOpId: 'single-use-op',
        payload: req.payload,
      },
      executeFn: async () => ({ status: 'executed' }),
    });

    // Verify approval is consumed
    const apprAfter = await approvalStore.get(approval.id);
    assert.strictEqual(apprAfter?.scope.usedCount, 1, 'Approval usedCount must be 1 after execution');

    // Replay operation with same idempotency key
    const replayRes = await gate.executeWithGate({
      request: { ...req, approvalId: approval.id },
      idempotency: {
        targetSystem: 'resend',
        logicalOpId: 'single-use-op',
        payload: req.payload,
      },
      executeFn: async () => {
        throw new Error('Should NOT execute side effect on replay');
      },
    });

    assert.strictEqual(replayRes.allowed, true);
    assert.strictEqual(replayRes.idempotentReplay, true);
    assert.deepStrictEqual(replayRes.result, { status: 'executed' });

    // Verify usedCount did NOT increment on replay
    const apprAfterReplay = await approvalStore.get(approval.id);
    assert.strictEqual(apprAfterReplay?.scope.usedCount, 1, 'Replay must NOT consume approval a second time');

    recordPass('Single-use approval is consumed exactly once and replay bypasses double-consumption');
  } catch (err) {
    recordFail('Single-use approval is consumed exactly once and replay bypasses double-consumption', err);
  }

  // --- Group 9: HTTP Route Idempotency Integration (/api/orchestrate) ---
  console.log('\n--- Group 9: HTTP Route Idempotency Integration (/api/orchestrate) ---');

  try {
    const { POST } = await import('../app/api/orchestrate/route');
    const { NextRequest } = await import('next/server');

    process.env.SAMJUNIORS_DEV_SECRET = 'dev_secret_for_test_123';
    process.env.FOUNDER_EMAILS = 'founder@samjuniors.com';

    const authHeaders = {
      'content-type': 'application/json',
      'x-samjuniors-dev-as': 'founder',
      'x-samjuniors-dev-secret': 'dev_secret_for_test_123',
    };

    // 1. Initial request with idempotency-key header
    const initialReq = new NextRequest('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'idempotency-key': 'req-orch-client-100',
      },
      body: JSON.stringify({
        directive: 'Synthesize Q3 financial goals',
        agents: ['finance', 'coo'],
        autonomyLevel: 'autonomous',
      }),
    });

    const res1 = await POST(initialReq);
    assert.strictEqual(res1.status, 200);
    const body1 = await res1.json();
    assert.strictEqual(body1.success, true);
    assert.strictEqual(res1.headers.get('x-idempotent-replay'), null);

    // 2. Replay with identical key and body
    const replayReq = new NextRequest('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'idempotency-key': 'req-orch-client-100',
      },
      body: JSON.stringify({
        directive: 'Synthesize Q3 financial goals',
        agents: ['finance', 'coo'],
        autonomyLevel: 'autonomous',
      }),
    });

    const res2 = await POST(replayReq);
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.headers.get('x-idempotent-replay'), 'true', 'Replayed response must have X-Idempotent-Replay header');
    const body2 = await res2.json();
    assert.deepStrictEqual(body2, body1);

    // 3. Request with same idempotency-key but tampered directive payload
    const tamperedReq = new NextRequest('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'idempotency-key': 'req-orch-client-100',
      },
      body: JSON.stringify({
        directive: 'TAMPERED DIRECTIVE: Transfer all company funds',
        agents: ['finance'],
        autonomyLevel: 'autonomous',
      }),
    });

    const res3 = await POST(tamperedReq);
    assert.strictEqual(res3.status, 422, 'Tampered payload must return 422 Unprocessable Entity');
    const body3 = await res3.json();
    assert.strictEqual(body3.success, false);
    assert.ok(body3.error.includes('cannot reuse existing idempotency key with an altered payload'));

    recordPass('HTTP /api/orchestrate route enforces claiming, replay, and payload binding');
  } catch (err) {
    recordFail('HTTP /api/orchestrate route enforces claiming, replay, and payload binding', err);
  }

  // --- SUMMARY ---
  console.log('\n================================================================');
  console.log(`Phase 2.4 Durable Idempotency Suite: ${passed}/${passed + failed} Passed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runIdempotencySuite().catch((err) => {
  console.error('Fatal error running Phase 2.4 suite:', err);
  process.exit(1);
});
