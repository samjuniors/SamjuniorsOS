import assert from 'assert';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import {
  ResendCommunicationProviderAdapter,
  verifyResendWebhookSignature,
  RESEND_API_BASE_URL,
} from '../lib/server/communication/resend-provider';
import {
  CommunicationProviderRegistry,
  NullCommunicationProviderAdapter,
} from '../lib/server/communication/provider';
import { CommunicationRuntime } from '../lib/server/communication/runtime';
import { SideEffectAuthorizationGate } from '../lib/server/authorization/gate';
import { InMemoryApprovalStore, InMemoryAuditStore } from '../lib/server/authorization/approval-store';
import { Message, Draft, DeliveryStatus } from '../types/communication';
import { POST as resendWebhookHandler } from '../app/api/communication/webhooks/resend/route';

function testPass(msg: string) {
  console.log(`  ✓ PASS: ${msg}`);
}

/**
 * Helper to generate valid Svix headers and signatures for testing.
 */
function createSvixHeaders(params: {
  secret: string;
  rawBody: string;
  svixId?: string;
  timestampSec?: number;
}) {
  const svixId = params.svixId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const timestamp = (params.timestampSec !== undefined ? params.timestampSec : Math.floor(Date.now() / 1000)).toString();
  
  let keyBuffer: Buffer;
  if (params.secret.startsWith('whsec_')) {
    keyBuffer = Buffer.from(params.secret.substring(6), 'base64');
  } else {
    keyBuffer = Buffer.from(params.secret, 'utf8');
  }

  const signedPayload = `${svixId}.${timestamp}.${params.rawBody}`;
  const hmac = crypto.createHmac('sha256', keyBuffer);
  hmac.update(signedPayload);
  const signature = hmac.digest('base64');

  return {
    svixId,
    svixTimestamp: timestamp,
    svixSignature: `v1,${signature}`,
  };
}

async function runPhase12_5Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PHASE 12.5 TESTS: RESEND REAL EMAIL PROVIDER INTEGRATION');
  console.log('================================================================\n');

  const runtime = CommunicationRuntime.getInstance();
  const gate = SideEffectAuthorizationGate.getInstance();
  const registry = CommunicationProviderRegistry.getInstance();
  const approvalStore = InMemoryApprovalStore.getInstance();
  const auditStore = InMemoryAuditStore.getInstance();

  function resetAll() {
    runtime.clearAll();
    approvalStore.clear();
    auditStore.clear();
    registry.resetToDefaults();
  }

  // =========================================================================
  // TEST GROUP 1: Adapter Configuration & Secret Safety
  // =========================================================================
  console.log('--- Test Group 1: Resend Adapter Configuration & Secret Safety ---');
  resetAll();

  // 1.1 Unconfigured state
  const unconfiguredAdapter = new ResendCommunicationProviderAdapter({ apiKey: '' });
  assert.strictEqual(unconfiguredAdapter.isConfigured(), false, 'Reports unconfigured state when API key is empty');
  assert.strictEqual(unconfiguredAdapter.providerId, 'resend-email-adapter');
  assert.strictEqual(unconfiguredAdapter.channel, 'email');

  const dummyMsg: Message = {
    id: 'msg-unconf-1',
    conversationId: 'conv-1',
    channel: 'email',
    sender: { address: 'sender@example.com' },
    recipients: [{ address: 'rcpt@example.com' }],
    subject: 'Test',
    bodyContent: 'Content',
    direction: 'outbound',
    timestamp: new Date().toISOString(),
    deliveryStatus: 'pending_approval',
  };
  const unconfResult = await unconfiguredAdapter.sendMessage(dummyMsg);
  assert.strictEqual(unconfResult.success, false);
  assert.strictEqual(unconfResult.deliveryStatus, 'failed');
  assert.ok(unconfResult.error?.includes('RESEND_NOT_CONFIGURED'), 'Returns failed with RESEND_NOT_CONFIGURED error');
  testPass('Unconfigured adapter fails safely with clear error');

  // 1.2 Configured state
  const configuredAdapter = new ResendCommunicationProviderAdapter({ apiKey: 're_test_key_12345' });
  assert.strictEqual(configuredAdapter.isConfigured(), true, 'Reports configured state when API key is provided');
  testPass('Configured adapter reports configured state');

  // 1.3 Secret safety in serialization
  const apiKeySecret = 're_super_secret_api_key_999';
  const secretAdapter = new ResendCommunicationProviderAdapter({ apiKey: apiKeySecret });
  const serialized = JSON.stringify(secretAdapter);
  assert.ok(!serialized.includes(apiKeySecret), 'API key must never appear in JSON serialization');
  testPass('API key is safely excluded from JSON serialization');

  // =========================================================================
  // TEST GROUP 2: Unsupported Inbound Operations Boundary
  // =========================================================================
  console.log('\n--- Test Group 2: Unsupported Inbound Operations Boundary ---');

  const inbounds = await configuredAdapter.readMessages();
  assert.deepStrictEqual(inbounds, [], 'readMessages explicitly returns empty array for Resend');
  const thread = await configuredAdapter.getThread('thread-123');
  assert.strictEqual(thread, null, 'getThread explicitly returns null for Resend');
  testPass('Resend transactional boundary returns empty/null for unsupported inbound calls');

  // =========================================================================
  // TEST GROUP 3: Outbound Message Dispatch via Mock Fetcher
  // =========================================================================
  console.log('\n--- Test Group 3: Outbound Message Dispatch via Mock Fetcher ---');

  let fetchCallCount = 0;
  let lastFetchUrl = '';
  let lastFetchOptions: any = null;

  const mockFetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCallCount++;
    lastFetchUrl = url.toString();
    lastFetchOptions = init;
    return new Response(JSON.stringify({ id: 'resend_email_id_abc123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const sendingAdapter = new ResendCommunicationProviderAdapter({
    apiKey: 're_valid_api_key_123',
    fromEmail: 'contact@samjuniors.com',
    fetcher: mockFetcher,
  });

  const messageToSend: Message = {
    id: 'msg-out-1',
    conversationId: 'conv-100',
    channel: 'email',
    sender: { address: 'contact@samjuniors.com', name: 'Maya PM' },
    recipients: [{ address: 'partner@client.com', name: 'Partner' }],
    cc: [{ address: 'ops@client.com' }],
    subject: 'Weekly Product Roadmap Update',
    bodyContent: '<p>Here is your roadmap.</p>',
    bodyMimeType: 'text/html',
    direction: 'outbound',
    timestamp: new Date().toISOString(),
    deliveryStatus: 'pending_approval',
    executionRef: 'exec-ref-456',
  };

  const sendResult = await sendingAdapter.sendMessage(messageToSend, 'appr-789');
  assert.strictEqual(sendResult.success, true);
  assert.strictEqual(sendResult.deliveryStatus, 'sending', 'Truthful status: sending until webhook confirmation');
  assert.strictEqual(sendResult.externalMessageId, 'resend_email_id_abc123');
  assert.strictEqual(fetchCallCount, 1);
  assert.strictEqual(lastFetchUrl, `${RESEND_API_BASE_URL}/emails`);
  assert.strictEqual(lastFetchOptions.headers['Authorization'], 'Bearer re_valid_api_key_123');

  const parsedBody = JSON.parse(lastFetchOptions.body);
  assert.strictEqual(parsedBody.from, 'Maya PM <contact@samjuniors.com>');
  assert.deepStrictEqual(parsedBody.to, ['partner@client.com']);
  assert.deepStrictEqual(parsedBody.cc, ['ops@client.com']);
  assert.strictEqual(parsedBody.subject, 'Weekly Product Roadmap Update');
  assert.strictEqual(parsedBody.html, '<p>Here is your roadmap.</p>');
  assert.strictEqual(parsedBody.headers['X-Samjuniors-Message-Id'], 'msg-out-1');
  assert.strictEqual(parsedBody.headers['X-Samjuniors-Approval-Ref'], 'appr-789');
  testPass('Outbound email dispatched accurately with truthful "sending" status and custom headers');

  // Graceful handling of Resend 422 API error
  const mock422Fetcher = (async () => {
    return new Response(
      JSON.stringify({ statusCode: 422, message: 'The domain has not been verified.' }),
      { status: 422, statusText: 'Unprocessable Entity' }
    );
  }) as typeof fetch;

  const errorAdapter = new ResendCommunicationProviderAdapter({
    apiKey: 're_valid_api_key_123',
    fetcher: mock422Fetcher,
  });

  const errResult = await errorAdapter.sendMessage(messageToSend);
  assert.strictEqual(errResult.success, false);
  assert.strictEqual(errResult.deliveryStatus, 'failed');
  assert.ok(errResult.error?.includes('422'));
  assert.ok(errResult.error?.includes('The domain has not been verified'));
  testPass('Resend 422 API errors handled gracefully without crashing');

  // Graceful handling of network failure
  const mockNetErrFetcher = (async () => {
    throw new Error('Connection refused by host');
  }) as typeof fetch;

  const netErrAdapter = new ResendCommunicationProviderAdapter({
    apiKey: 're_valid_api_key_123',
    fetcher: mockNetErrFetcher,
  });
  const netErrResult = await netErrAdapter.sendMessage(messageToSend);
  assert.strictEqual(netErrResult.success, false);
  assert.strictEqual(netErrResult.deliveryStatus, 'failed');
  assert.ok(netErrResult.error?.includes('RESEND_NETWORK_ERROR: Connection refused'));
  testPass('Network failures handled cleanly and honestly');

  // =========================================================================
  // TEST GROUP 4: Authorization Gate Enforcement (Phase 12.3 & 12.4)
  // =========================================================================
  console.log('\n--- Test Group 4: Authorization Gate & Runtime Enforcement ---');
  resetAll();

  registry.registerAdapter('email', sendingAdapter);

  // 4.1 Unapproved send intent is blocked by gate
  const unapprovedIntent = await runtime.executeIntent({
    type: 'send',
    employeeRole: 'pm',
    channel: 'email',
    payload: {
      recipients: [{ address: 'cold_lead@example.com' }],
      subject: 'Unapproved Cold Outreach',
      bodyContent: 'Hello',
    },
  });
  assert.strictEqual(unapprovedIntent.allowed, false);
  assert.strictEqual(unapprovedIntent.executed, false);
  assert.strictEqual(unapprovedIntent.decision.effect, 'approval_required');
  testPass('Unapproved outbound email intent strictly requires Founder approval');

  // 4.2 Approved send intent executes successfully
  const workflowContext = {
    workflowId: 'wf-intro',
    workflowInstanceId: 'inst-001',
    stepId: 'step-send',
  };

  const approval = await gate.requestApproval({
    employeeRole: 'pm',
    actionName: 'Send Communication (send)',
    classification: 'external_communication',
    workflowInstanceId: workflowContext.workflowInstanceId,
    stepId: workflowContext.stepId,
    scope: { scopeType: 'single_action', maxUses: 1 },
    target: { targetSystem: 'email', recipient: 'partner@acme.com', summary: 'Intro email' },
  });

  await gate.decideApproval({
    approvalId: approval.id,
    decision: 'approved',
    decidedBy: 'founder',
  });

  const approvedIntent = await runtime.executeIntent({
    type: 'send',
    employeeRole: 'pm',
    channel: 'email',
    approvalId: approval.id,
    workflowRef: workflowContext,
    payload: {
      recipients: [{ address: 'partner@acme.com' }],
      subject: 'Approved Partnership Introduction',
      bodyContent: 'Excited to partner!',
    },
    target: { targetSystem: 'email', recipient: 'partner@acme.com', summary: 'Intro email' },
  });

  assert.strictEqual(approvedIntent.allowed, true);
  assert.strictEqual(approvedIntent.executed, true);
  assert.strictEqual(approvedIntent.result?.delivered, true);
  assert.strictEqual(approvedIntent.result?.deliveryStatus, 'sending');
  assert.strictEqual(approvedIntent.result?.externalMessageId, 'resend_email_id_abc123');

  // 4.3 Reusing single-use approval is denied
  const replayIntent = await runtime.executeIntent({
    type: 'send',
    employeeRole: 'pm',
    channel: 'email',
    approvalId: approval.id,
    workflowRef: workflowContext,
    payload: {
      recipients: [{ address: 'partner2@acme.com' }],
      subject: 'Second send',
      bodyContent: 'Attempt with reused approval',
    },
  });
  assert.strictEqual(replayIntent.allowed, false);
  assert.strictEqual(replayIntent.decision.effect, 'denied');
  assert.strictEqual(replayIntent.decision.reasonCode, 'APPROVAL_CONSUMED');
  testPass('Single-use approval is consumed and cannot be reused');

  // 4.4 Advisor role strictly prohibited from drafting or sending
  const advisorDraft = await runtime.executeIntent({
    type: 'draft',
    employeeRole: 'advisor',
    channel: 'email',
    payload: { intendedRecipients: [{ address: 'test@example.com' }], subject: 'Advisor attempt', bodyContent: 'Hi' },
  });
  assert.strictEqual(advisorDraft.allowed, false);
  assert.ok(advisorDraft.error?.includes('Advisor role is strictly advisory'));
  testPass('Advisor role strictly prohibited from initiating email actions');

  // =========================================================================
  // TEST GROUP 5: Svix Signature Verification Unit Tests
  // =========================================================================
  console.log('\n--- Test Group 5: Svix Webhook Signature Verification Unit Tests ---');

  const testSecret = 'whsec_mfKQ9r8uJRIBwSnipqiCQldILRsmOIen';
  const testPayload = JSON.stringify({
    type: 'email.delivered',
    created_at: new Date().toISOString(),
    data: { email_id: 're_test_email_101', to: ['user@example.com'] },
  });

  // 5.1 Missing secret -> fails closed
  const missingSecretResult = verifyResendWebhookSignature({
    rawBody: testPayload,
    svixId: 'msg_123',
    svixTimestamp: Math.floor(Date.now() / 1000).toString(),
    svixSignature: 'v1,some_sig',
    secret: undefined,
  });
  assert.strictEqual(missingSecretResult, false, 'Missing secret must fail closed');
  testPass('Missing webhook secret fails closed (returns false)');

  // 5.2 Missing svix headers -> fails closed
  assert.strictEqual(
    verifyResendWebhookSignature({ rawBody: testPayload, secret: testSecret }),
    false,
    'Missing all svix headers must fail'
  );
  assert.strictEqual(
    verifyResendWebhookSignature({ rawBody: testPayload, svixId: 'id', secret: testSecret }),
    false,
    'Missing svix-timestamp and signature must fail'
  );
  testPass('Missing Svix headers fail closed');

  // 5.3 Valid signature -> passes
  const validHeaders = createSvixHeaders({ secret: testSecret, rawBody: testPayload });
  const validResult = verifyResendWebhookSignature({
    rawBody: testPayload,
    svixId: validHeaders.svixId,
    svixTimestamp: validHeaders.svixTimestamp,
    svixSignature: validHeaders.svixSignature,
    secret: testSecret,
  });
  assert.strictEqual(validResult, true, 'Valid Svix signature must verify successfully');
  testPass('Valid Svix signature passes verification');

  // 5.4 Invalid signature -> fails
  const invalidResult = verifyResendWebhookSignature({
    rawBody: testPayload,
    svixId: validHeaders.svixId,
    svixTimestamp: validHeaders.svixTimestamp,
    svixSignature: 'v1,invalidBase64SignatureXYZ===',
    secret: testSecret,
  });
  assert.strictEqual(invalidResult, false, 'Invalid signature must be rejected');
  testPass('Invalid Svix signature is rejected');

  // 5.5 Stale timestamp (> 300s) -> rejected
  const staleTimestampSec = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
  const staleHeaders = createSvixHeaders({ secret: testSecret, rawBody: testPayload, timestampSec: staleTimestampSec });
  const staleResult = verifyResendWebhookSignature({
    rawBody: testPayload,
    svixId: staleHeaders.svixId,
    svixTimestamp: staleHeaders.svixTimestamp,
    svixSignature: staleHeaders.svixSignature,
    secret: testSecret,
  });
  assert.strictEqual(staleResult, false, 'Stale webhook timestamp (>300s) must be rejected');
  testPass('Stale webhook timestamp (> 300s) is rejected');

  // 5.6 Multiple signatures in header (v1,sig1 v1,sig2)
  const multiSigHeader = `v1,bogusSig123 ${validHeaders.svixSignature}`;
  const multiSigResult = verifyResendWebhookSignature({
    rawBody: testPayload,
    svixId: validHeaders.svixId,
    svixTimestamp: validHeaders.svixTimestamp,
    svixSignature: multiSigHeader,
    secret: testSecret,
  });
  assert.strictEqual(multiSigResult, true, 'Multiple signatures in header verifies if one matches');
  testPass('Multi-signature Svix header format verified correctly');

  // =========================================================================
  // TEST GROUP 6: Hardened Resend Webhook HTTP Route Handler Tests
  // =========================================================================
  console.log('\n--- Test Group 6: Resend Webhook HTTP Route Handler Security ---');
  resetAll();

  const originalEnvSecret = process.env.RESEND_WEBHOOK_SECRET;

  try {
    // 6.1 Production requires RESEND_WEBHOOK_SECRET: Missing secret -> 401 rejected before payload processing
    delete process.env.RESEND_WEBHOOK_SECRET;

    const noSecretReq = new NextRequest('http://localhost:3000/api/communication/webhooks/resend', {
      method: 'POST',
      headers: {
        'svix-id': 'msg_test_1',
        'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
        'svix-signature': 'v1,some_sig',
        'Content-Type': 'application/json',
      },
      body: testPayload,
    });

    const noSecretRes = await resendWebhookHandler(noSecretReq);
    assert.strictEqual(noSecretRes.status, 401, 'Missing RESEND_WEBHOOK_SECRET must return 401 Unauthorized');
    const noSecretJson = await noSecretRes.json();
    assert.ok(noSecretJson.error?.includes('WEBHOOK_SECRET_MISSING'), 'Error message specifies missing secret');
    testPass('Missing RESEND_WEBHOOK_SECRET fails closed with HTTP 401');

    // Configure test secret in env for subsequent tests
    process.env.RESEND_WEBHOOK_SECRET = testSecret;

    // 6.2 Missing Svix headers -> 401 rejected
    const missingHeadersReq = new NextRequest('http://localhost:3000/api/communication/webhooks/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: testPayload,
    });
    const missingHeadersRes = await resendWebhookHandler(missingHeadersReq);
    assert.strictEqual(missingHeadersRes.status, 401, 'Missing Svix headers must return 401');
    const missingHeadersJson = await missingHeadersRes.json();
    assert.ok(missingHeadersJson.error?.includes('MISSING_SVIX_HEADERS'), 'Error specifies missing svix headers');
    testPass('Missing Svix headers rejected with HTTP 401');

    // 6.3 Empty payload body -> 400 rejected
    const emptyBodyHeaders = createSvixHeaders({ secret: testSecret, rawBody: '' });
    const emptyBodyReq = new NextRequest('http://localhost:3000/api/communication/webhooks/resend', {
      method: 'POST',
      headers: {
        'svix-id': emptyBodyHeaders.svixId,
        'svix-timestamp': emptyBodyHeaders.svixTimestamp,
        'svix-signature': emptyBodyHeaders.svixSignature,
        'Content-Type': 'application/json',
      },
      body: '',
    });
    const emptyBodyRes = await resendWebhookHandler(emptyBodyReq);
    assert.strictEqual(emptyBodyRes.status, 400);
    testPass('Empty request body rejected with HTTP 400');

    // 6.4 Invalid signature -> 401 rejected
    const invalidSigReq = new NextRequest('http://localhost:3000/api/communication/webhooks/resend', {
      method: 'POST',
      headers: {
        'svix-id': validHeaders.svixId,
        'svix-timestamp': validHeaders.svixTimestamp,
        'svix-signature': 'v1,tampered_signature_abc',
        'Content-Type': 'application/json',
      },
      body: testPayload,
    });
    const invalidSigRes = await resendWebhookHandler(invalidSigReq);
    assert.strictEqual(invalidSigRes.status, 401, 'Invalid Svix signature must return 401');
    const invalidSigJson = await invalidSigRes.json();
    assert.ok(invalidSigJson.error?.includes('INVALID_SIGNATURE'));
    testPass('Invalid signature rejected with HTTP 401');

    // 6.5 Valid signature with matching message in store -> 200 accepted & status transitioned
    const seedMessage: Message = {
      id: 'msg-webhook-test-1',
      conversationId: 'conv-webhook-1',
      channel: 'email',
      sender: { address: 'contact@samjuniors.com' },
      recipients: [{ address: 'user@example.com' }],
      subject: 'Webhook Delivery Test',
      bodyContent: 'Test',
      direction: 'outbound',
      timestamp: new Date().toISOString(),
      deliveryStatus: 'sending',
      externalProviderRef: 're_test_email_101',
    };
    await runtime.getStore().createMessage(seedMessage);

    const validPayload = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        email_id: 're_test_email_101',
        to: ['user@example.com'],
      },
    });
    const validHttpSig = createSvixHeaders({ secret: testSecret, rawBody: validPayload });

    const validReq = new NextRequest('http://localhost:3000/api/communication/webhooks/resend', {
      method: 'POST',
      headers: {
        'svix-id': validHttpSig.svixId,
        'svix-timestamp': validHttpSig.svixTimestamp,
        'svix-signature': validHttpSig.svixSignature,
        'Content-Type': 'application/json',
      },
      body: validPayload,
    });

    const validRes = await resendWebhookHandler(validReq);
    assert.strictEqual(validRes.status, 200, 'Valid webhook request must return 200 OK');
    const validJson = await validRes.json();
    assert.strictEqual(validJson.received, true);
    assert.strictEqual(validJson.duplicate, false);
    assert.strictEqual(validJson.messageId, 'msg-webhook-test-1');
    assert.strictEqual(validJson.deliveryStatus, 'delivered');

    const updatedMsg = await runtime.getStore().getMessage('msg-webhook-test-1');
    assert.strictEqual(updatedMsg?.deliveryStatus, 'delivered', 'Message in store transitioned to delivered');
    testPass('Valid webhook request authenticated, processed, and updated message deliveryStatus');

    // 6.6 Duplicate event replay -> Idempotent response with duplicate: true
    const dupReq = new NextRequest('http://localhost:3000/api/communication/webhooks/resend', {
      method: 'POST',
      headers: {
        'svix-id': validHttpSig.svixId,
        'svix-timestamp': validHttpSig.svixTimestamp,
        'svix-signature': validHttpSig.svixSignature,
        'Content-Type': 'application/json',
      },
      body: validPayload,
    });

    const dupRes = await resendWebhookHandler(dupReq);
    assert.strictEqual(dupRes.status, 200);
    const dupJson = await dupRes.json();
    assert.strictEqual(dupJson.received, true);
    assert.strictEqual(dupJson.duplicate, true, 'Duplicate webhook event returns duplicate: true');
    testPass('Duplicate webhook event ID is idempotently deduplicated');

  } finally {
    if (originalEnvSecret !== undefined) {
      process.env.RESEND_WEBHOOK_SECRET = originalEnvSecret;
    } else {
      delete process.env.RESEND_WEBHOOK_SECRET;
    }
  }

  // =========================================================================
  // TEST GROUP 7: DeliveryStatus Taxonomy & Mapping Verification
  // =========================================================================
  console.log('\n--- Test Group 7: DeliveryStatus Mapping & Truthfulness ---');
  resetAll();

  const store = runtime.getStore();

  // 7.1 email.delivered -> 'delivered'
  const delResult = await runtime.handleWebhookEvent({
    eventId: 'evt-del-1',
    provider: 'resend',
    eventType: 'email.delivered',
    externalMessageId: 're_msg_del_1',
  });
  assert.strictEqual(delResult.deliveryStatus, 'delivered');
  testPass('email.delivered maps accurately to "delivered"');

  // 7.2 email.bounced -> 'bounced' with bounce reason
  const bounceResult = await runtime.handleWebhookEvent({
    eventId: 'evt-bnc-1',
    provider: 'resend',
    eventType: 'email.bounced',
    externalMessageId: 're_msg_bnc_1',
    rawPayload: {
      data: { bounce: { message: '550 User unknown' } },
    },
  });
  assert.strictEqual(bounceResult.deliveryStatus, 'bounced');
  const storedBnc = await store.getWebhookEvent('evt-bnc-1');
  assert.strictEqual(storedBnc?.deliveryStatus, 'bounced');
  assert.strictEqual(storedBnc?.error, '550 User unknown');
  testPass('email.bounced maps accurately to "bounced" with error message');

  // 7.3 email.complained -> maps to 'bounced' per DeliveryStatus type (with complaint error detail)
  const complaintResult = await runtime.handleWebhookEvent({
    eventId: 'evt-cmp-1',
    provider: 'resend',
    eventType: 'email.complained',
    externalMessageId: 're_msg_cmp_1',
  });
  assert.strictEqual(complaintResult.deliveryStatus, 'bounced', 'email.complained maps to "bounced" since DeliveryStatus has no distinct complained state');
  const storedCmp = await store.getWebhookEvent('evt-cmp-1');
  assert.strictEqual(storedCmp?.deliveryStatus, 'bounced');
  assert.ok(storedCmp?.error?.includes('complained'), 'Complaint detail recorded in error');
  testPass('email.complained maps to "bounced" adhering strictly to DeliveryStatus type taxonomy');

  // 7.4 email.sent & email.delivery_delayed -> 'sending'
  const sentResult = await runtime.handleWebhookEvent({
    eventId: 'evt-snt-1',
    provider: 'resend',
    eventType: 'email.sent',
    externalMessageId: 're_msg_snt_1',
  });
  assert.strictEqual(sentResult.deliveryStatus, 'sending');

  const delayedResult = await runtime.handleWebhookEvent({
    eventId: 'evt-dly-1',
    provider: 'resend',
    eventType: 'email.delivery_delayed',
    externalMessageId: 're_msg_dly_1',
  });
  assert.strictEqual(delayedResult.deliveryStatus, 'sending');
  testPass('email.sent and email.delivery_delayed map accurately to "sending"');

  console.log('\n================================================================');
  console.log('Phase 12.5 Test Suite Complete: All Tests Passed Successfully');
  console.log('================================================================');
}

runPhase12_5Tests().catch((err) => {
  console.error('\n❌ Fatal Phase 12.5 Test Error:', err);
  process.exit(1);
});
