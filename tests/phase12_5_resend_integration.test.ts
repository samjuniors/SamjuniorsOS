import { describe, it, expect, beforeEach, vi } from 'vitest';
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
import { Message, Draft } from '../types/communication';
import crypto from 'crypto';

describe('Phase 12.5: Resend Real Email Provider Integration', () => {
  let runtime: CommunicationRuntime;
  let gate: SideEffectAuthorizationGate;
  let registry: CommunicationProviderRegistry;
  let approvalStore: InMemoryApprovalStore;
  let auditStore: InMemoryAuditStore;

  beforeEach(() => {
    runtime = CommunicationRuntime.getInstance();
    runtime.clearAll();
    gate = SideEffectAuthorizationGate.getInstance();
    approvalStore = InMemoryApprovalStore.getInstance();
    auditStore = InMemoryAuditStore.getInstance();
    approvalStore.clear();
    auditStore.clear();
    registry = CommunicationProviderRegistry.getInstance();
    registry.resetToDefaults();
  });

  // =========================================================================
  // 1. Adapter Configuration & Unconfigured Behavior
  // =========================================================================
  describe('Resend Adapter Configuration', () => {
    it('correctly reports unconfigured state when API key is empty', async () => {
      const adapter = new ResendCommunicationProviderAdapter({ apiKey: '' });
      expect(adapter.isConfigured()).toBe(false);
      expect(adapter.providerId).toBe('resend-email-adapter');
      expect(adapter.channel).toBe('email');

      const dummyMessage: Message = {
        id: 'msg-1',
        conversationId: 'conv-1',
        channel: 'email',
        sender: { address: 'maya@samjuniors.com', name: 'Maya' },
        recipients: [{ address: 'lead@example.com' }],
        subject: 'Hello',
        bodyContent: 'Test',
        direction: 'outbound',
        timestamp: new Date().toISOString(),
        deliveryStatus: 'pending_approval',
      };

      const result = await adapter.sendMessage(dummyMessage);
      expect(result.success).toBe(false);
      expect(result.deliveryStatus).toBe('failed');
      expect(result.error).toContain('RESEND_NOT_CONFIGURED');
    });

    it('reports configured state when API key is present', () => {
      const adapter = new ResendCommunicationProviderAdapter({ apiKey: 're_test_key_12345' });
      expect(adapter.isConfigured()).toBe(true);
    });

    it('does not expose API key in message or object serialization', () => {
      const apiKeySecret = 're_super_secret_api_key_999';
      const adapter = new ResendCommunicationProviderAdapter({ apiKey: apiKeySecret });
      const serialized = JSON.stringify(adapter);
      expect(serialized).not.toContain(apiKeySecret);
    });
  });

  // =========================================================================
  // 2. Unsupported Inbound Operations (Transactional Provider Boundary)
  // =========================================================================
  describe('Unsupported Capabilities on Resend', () => {
    it('readMessages returns empty array', async () => {
      const adapter = new ResendCommunicationProviderAdapter({ apiKey: 're_test_123' });
      const messages = await adapter.readMessages();
      expect(messages).toEqual([]);
    });

    it('getThread returns null', async () => {
      const adapter = new ResendCommunicationProviderAdapter({ apiKey: 're_test_123' });
      const thread = await adapter.getThread('thread-123');
      expect(thread).toBeNull();
    });
  });

  // =========================================================================
  // 3. Outbound Message Sending with Mock Fetcher
  // =========================================================================
  describe('Outbound Message Dispatch via Resend Adapter', () => {
    it('successfully sends message and returns truthful "sending" status', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'resend_email_id_abc123' }),
      });

      const adapter = new ResendCommunicationProviderAdapter({
        apiKey: 're_valid_api_key_123',
        fromEmail: 'contact@samjuniors.com',
        fetcher: mockFetcher as any,
      });

      const message: Message = {
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

      const result = await adapter.sendMessage(message, 'appr-789');

      expect(result.success).toBe(true);
      expect(result.deliveryStatus).toBe('sending'); // Truthful: sending until webhook confirms delivered
      expect(result.externalMessageId).toBe('resend_email_id_abc123');

      expect(mockFetcher).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetcher.mock.calls[0];
      expect(url).toBe(`${RESEND_API_BASE_URL}/emails`);
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer re_valid_api_key_123');

      const body = JSON.parse(options.body);
      expect(body.from).toBe('Maya PM <contact@samjuniors.com>');
      expect(body.to).toEqual(['partner@client.com']);
      expect(body.cc).toEqual(['ops@client.com']);
      expect(body.subject).toBe('Weekly Product Roadmap Update');
      expect(body.html).toBe('<p>Here is your roadmap.</p>');
      expect(body.headers['X-Samjuniors-Message-Id']).toBe('msg-out-1');
      expect(body.headers['X-Samjuniors-Execution-Ref']).toBe('exec-ref-456');
      expect(body.headers['X-Samjuniors-Approval-Ref']).toBe('appr-789');
    });

    it('gracefully handles Resend 422 Unprocessable Entity error', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({
          statusCode: 422,
          message: 'The domain has not been verified.',
          name: 'validation_error',
        }),
      });

      const adapter = new ResendCommunicationProviderAdapter({
        apiKey: 're_valid_api_key_123',
        fetcher: mockFetcher as any,
      });

      const message: Message = {
        id: 'msg-out-2',
        conversationId: 'conv-101',
        channel: 'email',
        sender: { address: 'unverified@other.com' },
        recipients: [{ address: 'test@example.com' }],
        subject: 'Test',
        bodyContent: 'Test',
        direction: 'outbound',
        timestamp: new Date().toISOString(),
        deliveryStatus: 'pending_approval',
      };

      const result = await adapter.sendMessage(message);

      expect(result.success).toBe(false);
      expect(result.deliveryStatus).toBe('failed');
      expect(result.error).toContain('RESEND_API_ERROR (422)');
      expect(result.error).toContain('The domain has not been verified.');
    });

    it('handles network error cleanly without crashing runtime', async () => {
      const mockFetcher = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const adapter = new ResendCommunicationProviderAdapter({
        apiKey: 're_valid_api_key_123',
        fetcher: mockFetcher as any,
      });

      const message: Message = {
        id: 'msg-out-3',
        conversationId: 'conv-102',
        channel: 'email',
        sender: { address: 'contact@samjuniors.com' },
        recipients: [{ address: 'test@example.com' }],
        subject: 'Test',
        bodyContent: 'Test',
        direction: 'outbound',
        timestamp: new Date().toISOString(),
        deliveryStatus: 'pending_approval',
      };

      const result = await adapter.sendMessage(message);

      expect(result.success).toBe(false);
      expect(result.deliveryStatus).toBe('failed');
      expect(result.error).toContain('RESEND_NETWORK_ERROR: Connection refused');
    });
  });

  // =========================================================================
  // 4. Full CommunicationRuntime & SideEffectAuthorizationGate Integration
  // =========================================================================
  describe('Runtime Execution & Gate Enforcement', () => {
    it('strictly blocks unapproved outbound email intent with approval required', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'resend-123' }),
      });
      const adapter = new ResendCommunicationProviderAdapter({
        apiKey: 're_valid_api_key',
        fetcher: mockFetcher as any,
      });
      registry.registerAdapter('email', adapter);

      const result = await runtime.executeIntent({
        type: 'send',
        employeeRole: 'pm',
        channel: 'email',
        payload: {
          recipients: [{ address: 'founder@partner.com' }],
          subject: 'Unapproved Cold Email',
          bodyContent: 'Hello!',
        },
        target: {
          targetSystem: 'email',
          recipient: 'founder@partner.com',
          summary: 'Cold outreach email',
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.executed).toBe(false);
      expect(result.decision.effect).toBe('approval_required');
      expect(result.decision.reasonCode).toBe('APPROVAL_REQUIRED_EXTERNAL_COMMUNICATION');
      expect(mockFetcher).not.toHaveBeenCalled();
    });

    it('executes outbound email send successfully when valid approval is provided', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'resend_email_approved_999' }),
      });
      const adapter = new ResendCommunicationProviderAdapter({
        apiKey: 're_valid_api_key',
        fromEmail: 'contact@samjuniors.com',
        fetcher: mockFetcher as any,
      });
      registry.registerAdapter('email', adapter);

      // Create workflow context & grant authorization in gate
      const workflowContext = {
        workflowId: 'wf-partner-intro',
        workflowInstanceId: 'inst-001',
        stepId: 'step-send-intro',
      };

      const approval = await gate.requestApproval({
        employeeRole: 'pm',
        actionName: 'Send Communication (send)',
        classification: 'external_communication',
        workflowInstanceId: workflowContext.workflowInstanceId,
        stepId: workflowContext.stepId,
        scope: {
          scopeType: 'single_action',
          maxUses: 1,
        },
        target: {
          targetSystem: 'email',
          recipient: 'partner@acme.com',
          summary: 'Approved partner intro',
        },
      });

      await gate.decideApproval({
        approvalId: approval.id,
        decision: 'approved',
        decidedBy: 'founder',
      });

      // Execute through runtime
      const result = await runtime.executeIntent({
        type: 'send',
        employeeRole: 'pm',
        channel: 'email',
        approvalId: approval.id,
        workflowRef: workflowContext,
        payload: {
          recipients: [{ address: 'partner@acme.com', name: 'Partner Acme' }],
          subject: 'Approved Partnership Introduction',
          bodyContent: 'Hello partner, we are excited to work together.',
          bodyMimeType: 'text/plain',
        },
        target: {
          targetSystem: 'email',
          recipient: 'partner@acme.com',
          summary: 'Approved partner intro',
        },
      });

      expect(result.allowed).toBe(true);
      expect(result.executed).toBe(true);
      expect(result.decision.effect).toBe('allowed');
      expect(result.result?.delivered).toBe(true);
      expect(result.result?.deliveryStatus).toBe('sending');
      expect(result.result?.externalMessageId).toBe('resend_email_approved_999');

      // Verify message is saved in store with external reference
      const messageInStore = await runtime.findMessageByExternalProviderRef('resend_email_approved_999');
      expect(messageInStore).not.toBeNull();
      expect(messageInStore?.subject).toBe('Approved Partnership Introduction');
      expect(messageInStore?.deliveryStatus).toBe('sending');

      // Verify gate consumed approval (single-use)
      const approvalAfter = await approvalStore.get(approval.id);
      expect(approvalAfter?.isConsumed).toBe(true);
    });

    it('rejects attempt to reuse a consumed approval for a second send', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'resend-reuse-1' }),
      });
      const adapter = new ResendCommunicationProviderAdapter({
        apiKey: 're_valid_api_key',
        fetcher: mockFetcher as any,
      });
      registry.registerAdapter('email', adapter);

      const workflowContext = {
        workflowId: 'wf-single-use',
        workflowInstanceId: 'inst-single',
        stepId: 'step-1',
      };

      const approval = await gate.requestApproval({
        employeeRole: 'pm',
        actionName: 'Send Communication (send)',
        classification: 'external_communication',
        workflowInstanceId: workflowContext.workflowInstanceId,
        stepId: workflowContext.stepId,
        scope: {
          scopeType: 'single_action',
          maxUses: 1,
        },
      });
      await gate.decideApproval({
        approvalId: approval.id,
        decision: 'approved',
        decidedBy: 'founder',
      });

      // 1st run succeeds
      const res1 = await runtime.executeIntent({
        type: 'send',
        employeeRole: 'pm',
        channel: 'email',
        approvalId: approval.id,
        workflowRef: workflowContext,
        payload: {
          recipients: [{ address: 'test@example.com' }],
          subject: 'First send',
          bodyContent: 'Msg 1',
        },
      });
      expect(res1.allowed).toBe(true);

      // 2nd run with same approval is rejected
      const res2 = await runtime.executeIntent({
        type: 'send',
        employeeRole: 'pm',
        channel: 'email',
        approvalId: approval.id,
        workflowRef: workflowContext,
        payload: {
          recipients: [{ address: 'test2@example.com' }],
          subject: 'Second send',
          bodyContent: 'Msg 2',
        },
      });
      expect(res2.allowed).toBe(false);
      expect(res2.decision.effect).toBe('denied');
      expect(res2.decision.reasonCode).toBe('APPROVAL_CONSUMED');
    });

    it('prevents advisor role from creating drafts or sending emails', async () => {
      const draftResult = await runtime.executeIntent({
        type: 'draft',
        employeeRole: 'advisor',
        channel: 'email',
        payload: {
          intendedRecipients: [{ address: 'test@example.com' }],
          subject: 'Advisor draft attempt',
          bodyContent: 'Test',
        },
      });
      expect(draftResult.allowed).toBe(false);
      expect(draftResult.error).toContain('Advisor role is strictly advisory');

      const sendResult = await runtime.executeIntent({
        type: 'send',
        employeeRole: 'advisor',
        channel: 'email',
        payload: {
          recipients: [{ address: 'test@example.com' }],
          subject: 'Advisor send attempt',
          bodyContent: 'Test',
        },
      });
      expect(sendResult.allowed).toBe(false);
      expect(sendResult.error).toContain('Advisor role is strictly advisory');
    });
  });

  // =========================================================================
  // 5. Asynchronous Delivery Webhook Handling (Svix & Resend Events)
  // =========================================================================
  describe('Resend Webhooks & Truthful Delivery Transitions', () => {
    it('updates message deliveryStatus from sending to delivered on email.delivered webhook', async () => {
      const store = runtime.getStore();

      // Seed a message in 'sending' state with externalProviderRef
      const seedMessage: Message = {
        id: 'msg-tracked-001',
        conversationId: 'conv-001',
        channel: 'email',
        sender: { address: 'contact@samjuniors.com' },
        recipients: [{ address: 'client@example.com' }],
        subject: 'Contract Overview',
        bodyContent: 'Please find attached contract.',
        direction: 'outbound',
        timestamp: new Date().toISOString(),
        deliveryStatus: 'sending',
        externalProviderRef: 'resend_msg_tracker_999',
      };
      await store.createMessage(seedMessage);

      // Ingest delivery webhook
      const webhookResult = await runtime.handleWebhookEvent({
        eventId: 'svix_evt_delivered_101',
        provider: 'resend',
        eventType: 'email.delivered',
        externalMessageId: 'resend_msg_tracker_999',
        recipient: 'client@example.com',
        timestamp: new Date().toISOString(),
      });

      expect(webhookResult.success).toBe(true);
      expect(webhookResult.duplicate).toBe(false);
      expect(webhookResult.messageId).toBe('msg-tracked-001');
      expect(webhookResult.deliveryStatus).toBe('delivered');

      // Verify store updated
      const updated = await store.getMessage('msg-tracked-001');
      expect(updated?.deliveryStatus).toBe('delivered');
    });

    it('updates message deliveryStatus to bounced on email.bounced webhook with error details', async () => {
      const store = runtime.getStore();

      const seedMessage: Message = {
        id: 'msg-bounced-002',
        conversationId: 'conv-002',
        channel: 'email',
        sender: { address: 'contact@samjuniors.com' },
        recipients: [{ address: 'bad_email@invalid-domain.xyz' }],
        subject: 'Invitation',
        bodyContent: 'You are invited.',
        direction: 'outbound',
        timestamp: new Date().toISOString(),
        deliveryStatus: 'sending',
        externalProviderRef: 'resend_msg_bounced_888',
      };
      await store.createMessage(seedMessage);

      // Ingest bounce webhook
      const webhookResult = await runtime.handleWebhookEvent({
        eventId: 'svix_evt_bounced_202',
        provider: 'resend',
        eventType: 'email.bounced',
        externalMessageId: 'resend_msg_bounced_888',
        recipient: 'bad_email@invalid-domain.xyz',
        rawPayload: {
          type: 'email.bounced',
          data: {
            email_id: 'resend_msg_bounced_888',
            bounce: {
              message: '550 5.1.1 The email account that you tried to reach does not exist.',
              type: 'hard_bounce',
            },
          },
        },
      });

      expect(webhookResult.success).toBe(true);
      expect(webhookResult.deliveryStatus).toBe('bounced');

      const updated = await store.getMessage('msg-bounced-002');
      expect(updated?.deliveryStatus).toBe('bounced');
      expect(updated?.error).toContain('550 5.1.1 The email account');
    });

    it('idempotently deduplicates identical webhook event IDs', async () => {
      const firstResult = await runtime.handleWebhookEvent({
        eventId: 'svix_evt_duplicate_303',
        provider: 'resend',
        eventType: 'email.delivered',
        externalMessageId: 'resend_msg_any_777',
      });
      expect(firstResult.duplicate).toBe(false);

      // Duplicate submission
      const secondResult = await runtime.handleWebhookEvent({
        eventId: 'svix_evt_duplicate_303',
        provider: 'resend',
        eventType: 'email.delivered',
        externalMessageId: 'resend_msg_any_777',
      });
      expect(secondResult.duplicate).toBe(true);
      expect(secondResult.success).toBe(true);
    });

    it('verifies valid Svix HMAC-SHA256 signature correctly', () => {
      const secret = 'whsec_mfKQ9r8uJRIBwSnipqiCQldILRsmOIen';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const svixId = 'msg_test_svix_id_456';
      const rawBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 'test-123' } });

      const keyBuffer = Buffer.from('mfKQ9r8uJRIBwSnipqiCQldILRsmOIen', 'base64');
      const hmac = crypto.createHmac('sha256', keyBuffer);
      hmac.update(`${svixId}.${timestamp}.${rawBody}`);
      const validSig = hmac.digest('base64');

      const isValid = verifyResendWebhookSignature({
        rawBody,
        svixId,
        svixTimestamp: timestamp,
        svixSignature: `v1,${validSig}`,
        secret,
      });
      expect(isValid).toBe(true);

      const isInvalid = verifyResendWebhookSignature({
        rawBody,
        svixId,
        svixTimestamp: timestamp,
        svixSignature: 'v1,invalid_signature_xyz',
        secret,
      });
      expect(isInvalid).toBe(false);
    });
  });
});
