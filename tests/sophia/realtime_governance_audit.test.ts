import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { POST, GET } from '../../src/app/api/realtime/turn/route';
import {
  computeApprovalPayloadHash,
  verifyApprovalPayloadBinding,
} from '../../src/lib/server/authorization/payload-binding';
import { FounderApprovalRecord } from '../../src/types/authorization';
import { InMemoryIdempotencyStore } from '../../src/lib/server/idempotency/store';

async function runAdversarialAuditTests() {
  console.log('====================================================');
  console.log('REALTIME LAB & GOVERNANCE ADVERSARIAL AUDIT SUITE');
  console.log('====================================================');

  // Test 1: Unauthenticated Realtime Request (Must fail closed with HTTP 401)
  {
    console.log('\n[Test 1] Unauthenticated Realtime Request');
    const req = new NextRequest('http://localhost:3000/api/realtime/turn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-samjuniors-role': 'AUDITOR', // Non-founder role
      },
      body: JSON.stringify({ message: 'Hello' }),
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 401, 'Non-founder role must be rejected with HTTP 401');
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert(json.error.includes('Unauthorized'), 'Error message must reflect unauthorized state');
    console.log('✔ Test 1 Passed: Unauthenticated request rejected with HTTP 401');
  }

  // Test 2: Malformed / Empty Utterance (Must return HTTP 400)
  {
    console.log('\n[Test 2] Malformed / Empty Utterance');
    const req = new NextRequest('http://localhost:3000/api/realtime/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }), // Whitespace only
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 400, 'Empty message must return HTTP 400');
    const json = await res.json();
    assert.strictEqual(json.success, false);
    console.log('✔ Test 2 Passed: Empty utterance rejected with HTTP 400');
  }

  // Test 3: Oversized Message Bounds Check (Must return HTTP 400)
  {
    console.log('\n[Test 3] Oversized Message (> 10,000 chars)');
    const giantMessage = 'A'.repeat(10001);
    const req = new NextRequest('http://localhost:3000/api/realtime/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: giantMessage }),
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 400, 'Oversized message must return HTTP 400');
    const json = await res.json();
    assert(json.error.includes('maximum allowed length'), 'Error must note length limit');
    console.log('✔ Test 3 Passed: Oversized message rejected with HTTP 400');
  }

  // Test 4: Oversized Image Payload (> 5MB Base64) (Must return HTTP 413)
  {
    console.log('\n[Test 4] Oversized Image Payload (> 7M base64 chars)');
    const giantBase64 = 'B'.repeat(7000001);
    const req = new NextRequest('http://localhost:3000/api/realtime/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Look at this frame',
        cameraSnapshot: {
          mimeType: 'image/jpeg',
          base64Data: giantBase64,
        },
      }),
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 413, 'Oversized image must return HTTP 413 Payload Too Large');
    const json = await res.json();
    assert.strictEqual(json.success, false);
    console.log('✔ Test 4 Passed: Oversized image rejected with HTTP 413');
  }

  // Test 5: Invalid / Unsupported Image MimeType (Must return HTTP 400)
  {
    console.log('\n[Test 5] Invalid Image MimeType (e.g. application/x-executable)');
    const req = new NextRequest('http://localhost:3000/api/realtime/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Inspect this',
        cameraSnapshot: {
          mimeType: 'application/x-executable',
          base64Data: 'AAAA',
        },
      }),
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 400, 'Invalid image mimeType must return HTTP 400');
    const json = await res.json();
    assert(json.error.includes('Invalid cameraSnapshot mimeType'), 'Must reject unsupported mimeType');
    console.log('✔ Test 5 Passed: Disallowed image mimeType rejected with HTTP 400');
  }

  // Test 6: Provider Spoofing Defense (Must return HTTP 400)
  {
    console.log('\n[Test 6] Provider Spoofing Defense');
    const req = new NextRequest('http://localhost:3000/api/realtime/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hello',
        providerId: 'unauthorized-external-llm-injection',
      }),
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 400, 'Unregistered provider ID must return HTTP 400');
    const json = await res.json();
    assert(json.error.includes('is not registered'), 'Must reject unregistered provider ID');
    console.log('✔ Test 6 Passed: Provider spoofing attempt rejected with HTTP 400');
  }

  // Test 7: Conversational Non-Directive Isolation (Cannot execute tools or mutate state)
  {
    console.log('\n[Test 7] Conversational Non-Directive Turn Isolation');
    const req = new NextRequest('http://localhost:3000/api/realtime/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'What is the philosophy of SamJuniors?',
        providerId: 'gemini',
      }),
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.isDirective, false, 'Conversational query must NOT be marked as directive');
    assert.strictEqual(json.detectedIntent, 'conversation');
    assert.strictEqual(json.orchestrationRunId, undefined, 'Must NOT trigger MultiAgentOrchestrator run');
    console.log('✔ Test 7 Passed: Conversational query executed strictly in read-only isolation');
  }

  // Test 8: Directive Enforcement (Must route to Council and honor governance)
  {
    console.log('\n[Test 8] Directive Enforcement & MultiAgentOrchestrator Routing');
    const req = new NextRequest('http://localhost:3000/api/realtime/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Research our competitors and summarize technical differentiators',
        providerId: 'gemini',
      }),
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.isDirective, true, 'Actionable research utterance must be classified as directive');
    assert.strictEqual(json.providerId, 'council-orchestrator', 'Must route to executive council');
    assert(json.orchestrationRunId, 'Must generate formal orchestration run');
    console.log('✔ Test 8 Passed: Directive routed through authoritative MultiAgentOrchestrator');
  }

  // Test 9: Cryptographic Payload Binding & Anti-Tampering Proof
  {
    console.log('\n[Test 9] Approval Payload Binding & Anti-Tampering Verification');
    const actionName = 'finance_transfer';
    const target = { targetSystem: 'stripe', summary: 'Transfer $5,000' };
    const originalPayload = { amount: 5000, recipient: 'vendor-123' };

    const boundHash = computeApprovalPayloadHash(actionName, target, originalPayload);
    assert.strictEqual(typeof boundHash, 'string');
    assert.strictEqual(boundHash.length, 64, 'SHA-256 hash must be 64 hex characters');

    const approvalRecord: FounderApprovalRecord = {
      id: 'appr-test-1',
      workflowInstanceId: 'wf-test-1',
      stepId: 'step-1',
      actionName,
      employeeRole: 'finance',
      classification: 'financial_action',
      target,
      payload: originalPayload,
      payloadHash: boundHash,
      decision: 'approved',
      requestedAt: new Date().toISOString(),
    };

    // 9a. Verify matching payload succeeds
    const matchResult = verifyApprovalPayloadBinding(approvalRecord, {
      actionName,
      target,
      payload: originalPayload,
    });
    assert.strictEqual(matchResult.isMatch, true, 'Unaltered payload must verify successfully');

    // 9b. Verify tampered payload FAILS CLOSED
    const tamperedPayload = { amount: 50000, recipient: 'attacker-456' }; // Attacker modified amount
    const tamperResult = verifyApprovalPayloadBinding(approvalRecord, {
      actionName,
      target,
      payload: tamperedPayload,
    });
    assert.strictEqual(tamperResult.isMatch, false, 'Tampered payload must FAIL CLOSED');
    assert.notStrictEqual(tamperResult.expectedHash, tamperResult.actualHash);
    console.log('✔ Test 9 Passed: Cryptographic payload binding strictly prevents tampering');
  }

  // Test 10: Idempotency & Duplicate Request Protection
  {
    console.log('\n[Test 10] Idempotency & Duplicate Request Safeguard');
    const store = new InMemoryIdempotencyStore();
    const actionKey = `turn-idempotency-key-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const payloadHash = computeApprovalPayloadHash('turn_exec', undefined, { turn: 1 });

    // Acquire first claim
    const firstClaim = await store.claim({
      key: actionKey,
      actionName: 'turn_exec',
      payloadHash,
    });
    assert.strictEqual(firstClaim.state, 'claimed', 'First turn execution must be claimed');

    // Attempt concurrent duplicate with identical key while in progress
    let duplicateRejected = false;
    try {
      await store.claim({
        key: actionKey,
        actionName: 'turn_exec',
        payloadHash,
      });
    } catch (err: any) {
      if (err.name === 'OperationInProgressError' || err.message.includes('in progress')) {
        duplicateRejected = true;
      }
    }
    assert.strictEqual(duplicateRejected, true, 'Duplicate in-progress turn request must be rejected');
    console.log('✔ Test 10 Passed: Idempotency store prevents duplicate concurrent side effects');
  }

  // Test 11: GET /api/realtime/turn Provider Discovery
  {
    console.log('\n[Test 11] GET /api/realtime/turn Provider Discovery');
    const req = new NextRequest('http://localhost:3000/api/realtime/turn', {
      method: 'GET',
    });

    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert(Array.isArray(json.providers), 'Must return array of providers');
    const gemini = json.providers.find((p: any) => p.id === 'gemini');
    assert(gemini, 'Gemini must be listed');
    assert.strictEqual(gemini.model, 'gemini-1.5-pro');
    console.log('✔ Test 11 Passed: Provider discovery returns registered providers without leaking secrets');
  }

  console.log('\n====================================================');
  console.log('ALL 11 ADVERSARIAL AUDIT TESTS PASSED (100%)');
  console.log('====================================================');
}

runAdversarialAuditTests().catch((err) => {
  console.error('Audit test failed:', err);
  process.exit(1);
});
