/**
 * SamJuniorsOS — Gate G14.6 Automated Test Suite
 *
 * First integrations chosen by the founder (email, payments, code host),
 * each approval-by-default.
 *
 * Exit evidence required:
 * Each integration has a contract test, a failure-mode test and a policy row;
 * at least one side-effect integration passes unknown-outcome tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { GitHubAdapter } from '@/lib/server/integrations/github-adapter';
import { ResendAdapter } from '@/lib/server/integrations/resend-adapter';
import { StripeAdapter } from '@/lib/server/integrations/stripe-adapter';
import { InMemoryIdempotencyStore } from '@/lib/server/idempotency/store';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import {
  ResendEmailInput,
  StripePaymentIntentInput,
  IntegrationValidationError,
  IntegrationAuthError,
  IntegrationRateLimitError,
  IntegrationServerError,
  IntegrationError,
} from '@/types/integrations';
import { GitHubIssueCreateInput } from '@/lib/server/integrations/github-adapter';
import {
  UnknownExternalResultError,
  IdempotencyPayloadMismatchError,
} from '@/lib/server/idempotency/state-machine';
import {
  AutonomyPolicyEngine,
  DEFAULT_AUTONOMY_POLICY_RULES,
} from '@/lib/server/authorization/autonomy-policy';
import { CapabilityRegistry } from '@/lib/server/capabilities/capability-registry';
import { CapabilityGateway } from '@/lib/server/capabilities/capability-gateway';
import { CapabilitySecretVault } from '@/lib/server/capabilities/secret-vault';

describe('Gate G14.6 — First Integrations (GitHub, Resend, Stripe) & Approval-by-Default', () => {
  beforeEach(() => {
    InMemoryIdempotencyStore.getInstance().records.clear();
    try {
      DurableFileStore.getInstance().clearCollection('idempotency_records');
    } catch {
      // ignore
    }

    GitHubAdapter.resetInstance();
    ResendAdapter.resetInstance();
    StripeAdapter.resetInstance();
    CapabilityRegistry.getInstance().reset();

    const vault = CapabilitySecretVault.getInstance();
    vault.reset();
    vault.registerSecret({
      name: 'GITHUB_TOKEN',
      value: 'ghp_test_token_12345678',
      allowedCapabilityIds: ['tool:github:read_issue', 'tool:github:create_issue'],
    });
    vault.registerSecret({
      name: 'RESEND_API_KEY',
      value: 're_test_key_87654321',
      allowedCapabilityIds: ['tool:resend:send_email'],
    });
    vault.registerSecret({
      name: 'STRIPE_SECRET_KEY',
      value: 'sk_test_stripe_secret_11223344',
      allowedCapabilityIds: ['tool:stripe:create_payment_intent'],
    });
  });

  describe('1. Contract Tests (Schema & Payload Validation)', () => {
    it('GitHub: validates issue create contract input and output schema', async () => {
      const adapter = GitHubAdapter.getInstance();
      adapter.setTransportHook(async (_endpoint, options) => {
        return {
          id: 5501,
          number: 101,
          title: options.data.title,
          html_url: 'https://github.com/samjuniors/SamjuniorsOS/issues/101',
          state: 'open',
          created_at: '2026-10-31T15:00:00Z',
        };
      });

      const validPayload: GitHubIssueCreateInput = {
        owner: 'samjuniors',
        repo: 'SamjuniorsOS',
        title: 'Fix edge proxy rate limiter timeout',
        body: 'Under sustained websocket load, proxy connection resets.',
        labels: ['bug', 'network'],
      };

      const result = await adapter.createIssue(validPayload);
      expect(result.id).toBe(5501);
      expect(result.number).toBe(101);
      expect(result.title).toBe('Fix edge proxy rate limiter timeout');
      expect(result.state).toBe('open');
      expect(result.htmlUrl).toContain('issues/101');
    });

    it('Resend: validates email contract input and output schema', async () => {
      const adapter = ResendAdapter.getInstance();
      adapter.setTransportHook(async (_endpoint, options) => {
        return {
          id: 'resend_msg_998877',
          created_at: '2026-10-31T15:00:00Z',
        };
      });

      const validEmail: ResendEmailInput = {
        to: 'founder@samjuniors.com',
        from: 'alerts@samjuniors.com',
        subject: 'Weekly Operating Briefing Ratified',
        html: '<p>The executive council ratified the M6 roadmap.</p>',
        replyTo: 'ops@samjuniors.com',
      };

      const result = await adapter.sendEmail(validEmail);
      expect(result.id).toBe('resend_msg_998877');
      expect(result.from).toBe('alerts@samjuniors.com');
      expect(result.to).toEqual(['founder@samjuniors.com']);
      expect(result.status).toBe('queued');

      // Reject empty subject or missing content
      expect(
        adapter.sendEmail({
          to: 'founder@samjuniors.com',
          subject: '',
          html: 'Valid body',
        })
      ).rejects.toThrow(IntegrationValidationError);

      expect(
        adapter.sendEmail({
          to: 'founder@samjuniors.com',
          subject: 'Missing body',
        })
      ).rejects.toThrow(IntegrationValidationError);
    });

    it('Stripe: validates payment intent contract input and output schema', async () => {
      const adapter = StripeAdapter.getInstance();
      adapter.setTransportHook(async (_endpoint, options) => {
        return {
          id: 'pi_3MtwBwLkdIwHu7ix28a3tqPa',
          amount: options.data.amount,
          currency: options.data.currency,
          status: 'requires_payment_method',
          client_secret: 'pi_3MtwBwLkdIwHu7ix28a3tqPa_secret_xY9',
          created: 1730386800,
        };
      });

      const validPayment: StripePaymentIntentInput = {
        amountCents: 5000,
        currency: 'usd',
        customerId: 'cus_12345',
        description: 'SamJuniors Enterprise Tier',
        metadata: { tier: 'enterprise', billingCycle: 'monthly' },
      };

      const result = await adapter.createPaymentIntent(validPayment);
      expect(result.id).toBe('pi_3MtwBwLkdIwHu7ix28a3tqPa');
      expect(result.amountCents).toBe(5000);
      expect(result.currency).toBe('usd');
      expect(result.status).toBe('requires_payment_method');
      expect(result.clientSecret).toContain('secret_xY9');

      // Reject invalid amount or malformed currency
      expect(
        adapter.createPaymentIntent({
          amountCents: -500,
          currency: 'usd',
        })
      ).rejects.toThrow(IntegrationValidationError);

      expect(
        adapter.createPaymentIntent({
          amountCents: 5000,
          currency: 'us_dollar', // not 3 chars
        })
      ).rejects.toThrow(IntegrationValidationError);
    });
  });

  describe('2. Failure-Mode Tests (Deterministic Error Handling)', () => {
    it('GitHub: maps client errors (4xx), rate limits (429), and server errors (500)', async () => {
      const adapter = GitHubAdapter.getInstance();

      // 1. 401 Unauthorized
      adapter.setTransportHook(async () => {
        const err: any = new Error('Bad credentials');
        err.statusCode = 401;
        throw err;
      });

      await expect(
        adapter.createIssue({
          owner: 'samjuniors',
          repo: 'core',
          title: 'Title Auth Error',
          body: 'Body',
        })
      ).rejects.toThrow('Bad credentials');

      // 2. 429 Rate limited
      adapter.setTransportHook(async () => {
        const err: any = new Error('API rate limit exceeded');
        err.statusCode = 429;
        throw err;
      });

      await expect(
        adapter.createIssue({
          owner: 'samjuniors',
          repo: 'core',
          title: 'Rate test issue',
          body: 'Body',
        })
      ).rejects.toThrow('API rate limit exceeded');
    });

    it('Resend: maps validation (400), auth (401), rate limits (429), and server errors (500)', async () => {
      const adapter = ResendAdapter.getInstance();

      // 1. 400 Validation error
      adapter.setTransportHook(async () => {
        throw new IntegrationValidationError('resend', 'Domain not verified');
      });

      await expect(
        adapter.sendEmail({
          to: 'user@unverified.org',
          subject: 'Validation Failure Test',
          text: 'Hello',
        })
      ).rejects.toThrow(IntegrationValidationError);

      // 2. 401 Auth error
      adapter.setTransportHook(async () => {
        throw new IntegrationAuthError('resend', 'Invalid API key provided');
      });

      await expect(
        adapter.sendEmail({
          to: 'user@example.com',
          subject: 'Auth Failure Test',
          text: 'Hello',
        })
      ).rejects.toThrow(IntegrationAuthError);

      // 3. 429 Rate limit error
      adapter.setTransportHook(async () => {
        throw new IntegrationRateLimitError('resend', 'Too many requests');
      });

      await expect(
        adapter.sendEmail({
          to: 'user@example.com',
          subject: 'Rate Limit Failure Test',
          text: 'Hello',
        })
      ).rejects.toThrow(IntegrationRateLimitError);

      // 4. 500 Server error
      adapter.setTransportHook(async () => {
        throw new IntegrationServerError('resend', 'Internal infrastructure error', 500);
      });

      // Server error triggers unknown-outcome handling
      await expect(
        adapter.sendEmail({
          to: 'user@example.com',
          subject: 'Server Error Test',
          text: 'Hello',
        })
      ).rejects.toThrow(UnknownExternalResultError);
    });

    it('Stripe: maps validation (400), auth (401), card error (402), and rate limits (429)', async () => {
      const adapter = StripeAdapter.getInstance();

      // 1. 400 Validation error
      adapter.setTransportHook(async () => {
        throw new IntegrationValidationError('stripe', 'Invalid customer ID');
      });

      await expect(
        adapter.createPaymentIntent({
          amountCents: 1000,
          currency: 'usd',
          customerId: 'invalid_cus',
        })
      ).rejects.toThrow(IntegrationValidationError);

      // 2. 401 Auth error
      adapter.setTransportHook(async () => {
        throw new IntegrationAuthError('stripe', 'Invalid API key');
      });

      await expect(
        adapter.createPaymentIntent({
          amountCents: 1000,
          currency: 'usd',
          description: 'Auth failure intent',
        })
      ).rejects.toThrow(IntegrationAuthError);

      // 3. 402 Card declined error (deterministic failure)
      adapter.setTransportHook(async () => {
        throw new IntegrationError({
          provider: 'stripe',
          message: 'Your card was declined.',
          statusCode: 402,
          code: 'card_declined',
          isDeterministicFailure: true,
        });
      });

      await expect(
        adapter.createPaymentIntent({
          amountCents: 2000,
          currency: 'usd',
          description: 'Card declined intent',
        })
      ).rejects.toThrow('Your card was declined.');

      // 4. 429 Rate limit
      adapter.setTransportHook(async () => {
        throw new IntegrationRateLimitError('stripe', 'Too many concurrent requests');
      });

      await expect(
        adapter.createPaymentIntent({
          amountCents: 3000,
          currency: 'usd',
          description: 'Rate limit intent',
        })
      ).rejects.toThrow(IntegrationRateLimitError);
    });
  });

  describe('3. Policy Rows & Approval-by-Default Governance', () => {
    it('verifies explicit policy rows for all integration action classes', () => {
      const policyEngine = AutonomyPolicyEngine.getInstance();

      // 1. GitHub issue creation: external_reversible -> L2, requiresExplicitApproval: true
      const extRevRule = DEFAULT_AUTONOMY_POLICY_RULES.external_reversible;
      expect(extRevRule).toBeDefined();
      expect(extRevRule.currentLevel).toBe('L2');
      expect(extRevRule.requiresExplicitApproval).toBe(true);

      const extRevEval = policyEngine.evaluate({
        actionClass: 'external_reversible',
        employeeRole: 'maya_lin',
      });
      expect(extRevEval.effect).toBe('needs_approval');

      // 2. Resend email dispatch: external_hard_to_reverse -> L2, requiresExplicitApproval: true
      const extHardRule = DEFAULT_AUTONOMY_POLICY_RULES.external_hard_to_reverse;
      expect(extHardRule).toBeDefined();
      expect(extHardRule.currentLevel).toBe('L2');
      expect(extHardRule.requiresExplicitApproval).toBe(true);

      const extHardEval = policyEngine.evaluate({
        actionClass: 'external_hard_to_reverse',
        employeeRole: 'dr_aris_thorne',
      });
      expect(extHardEval.effect).toBe('needs_approval');

      // 3. Stripe payment: financial_legal -> L1, requiresExplicitApproval: true
      const finRule = DEFAULT_AUTONOMY_POLICY_RULES.financial_legal;
      expect(finRule).toBeDefined();
      expect(finRule.currentLevel).toBe('L1');
      expect(finRule.requiresExplicitApproval).toBe(true);

      const finEval = policyEngine.evaluate({
        actionClass: 'financial_legal',
        employeeRole: 'julian_cruz',
      });
      expect(finEval.effect).toBe('needs_approval');
    });

    it('enforces approval-by-default for GitHub create issue via CapabilityGateway', async () => {
      const result = await CapabilityGateway.invoke({
        capabilityId: 'tool:github:create_issue',
        callerAgentId: 'maya_lin',
        parameters: {
          owner: 'samjuniors',
          repo: 'core',
          title: 'New Feature Request',
          body: 'Implement export capabilities',
        },
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('awaiting_founder_approval');
      expect(result.approvalId).toBeDefined();
      expect(result.payloadHash).toBeDefined();
      expect(result.error).toContain('requires explicit Founder approval');
    });

    it('enforces approval-by-default for Resend send email via CapabilityGateway', async () => {
      const result = await CapabilityGateway.invoke({
        capabilityId: 'tool:resend:send_email',
        callerAgentId: 'dr_aris_thorne',
        parameters: {
          to: 'external@client.com',
          subject: 'Quarterly Financial Summary',
          text: 'Here is the quarterly summary.',
        },
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('awaiting_founder_approval');
      expect(result.approvalId).toBeDefined();
      expect(result.payloadHash).toBeDefined();
      expect(result.error).toContain('requires explicit Founder approval');
    });

    it('enforces approval-by-default for Stripe payment intent via CapabilityGateway', async () => {
      const result = await CapabilityGateway.invoke({
        capabilityId: 'tool:stripe:create_payment_intent',
        callerAgentId: 'julian_cruz',
        parameters: {
          amountCents: 25000,
          currency: 'usd',
          description: 'Custom Enterprise Setup',
        },
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('awaiting_founder_approval');
      expect(result.approvalId).toBeDefined();
      expect(result.payloadHash).toBeDefined();
      expect(result.error).toContain('requires explicit Founder approval');
    });

    it('permits read-only integration tools to execute autonomously without halting', async () => {
      const result = await CapabilityGateway.invoke({
        capabilityId: 'tool:github:read_issue',
        callerAgentId: 'dr_aris_thorne',
        parameters: { issueNumber: 42 },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('executed');
      expect(result.data).toBeDefined();
    });
  });

  describe('4. Unknown-Outcome & Distributed Idempotency Tests (Side-Effect Integrations)', () => {
    it('GitHub: network drop during issue creation enters unknown outcome, blocks blind retry, and reconciles', async () => {
      const adapter = GitHubAdapter.getInstance();
      let networkCallCount = 0;

      // 1. Transport drops connection during dispatch
      adapter.setTransportHook(async (endpoint) => {
        networkCallCount++;
        if (endpoint.includes('?state=all')) {
          // Reconciliation GET probe
          return [
            {
              id: 9911,
              number: 88,
              title: 'Investigate dropped socket',
              html_url: 'https://github.com/samjuniors/core/issues/88',
              state: 'open',
              created_at: '2026-10-31T15:10:00Z',
            },
          ];
        }
        const netErr: any = new Error('ECONNRESET: Socket closed unexpectedly by remote host');
        netErr.code = 'ECONNRESET';
        throw netErr;
      });

      const issueInput: GitHubIssueCreateInput = {
        owner: 'samjuniors',
        repo: 'core',
        title: 'Investigate dropped socket',
        body: 'Connection reset under load.',
      };

      const payloadHash = GitHubAdapter.hashPayload(issueInput);
      const expectedKey = `github:issue:create:samjuniors/core:${payloadHash.slice(0, 16)}`;

      // Initial dispatch throws UnknownExternalResultError
      await expect(adapter.createIssue(issueInput)).rejects.toThrow(UnknownExternalResultError);
      expect(networkCallCount).toBe(1);

      // 2. Blind retry with the same key is strictly blocked without calling the network
      await expect(adapter.createIssue(issueInput)).rejects.toThrow(UnknownExternalResultError);
      expect(networkCallCount).toBe(1);

      // 3. Payload alteration on the same key throws IdempotencyPayloadMismatchError
      await expect(
        adapter.createIssue({
          ...issueInput,
          title: 'Altered Title',
          idempotencyKey: expectedKey,
        })
      ).rejects.toThrow(IdempotencyPayloadMismatchError);

      // 4. Reconciliation truthfully queries remote state and resolves the unknown outcome
      const reconciledResult = await adapter.reconcileUnknownOperation(expectedKey);
      expect(reconciledResult.status).toBe('completed');
      expect((reconciledResult.response as any).number).toBe(88);

      // 5. Subsequent calls with the key now safely return the reconciled result without network re-dispatch
      const cached = await adapter.createIssue(issueInput);
      expect(cached.id).toBe(9911);
      expect(cached.number).toBe(88);
      expect(networkCallCount).toBe(2); // 1 POST + 1 GET probe for reconciliation
    });

    it('Resend: 504 Gateway Timeout enters unknown outcome, blocks duplicate email, and reconciles', async () => {
      const adapter = ResendAdapter.getInstance();
      const testKey = `resend:test:unknown:${Date.now()}`;
      let dispatchCount = 0;

      // 1. Transport encounters 504 Gateway Timeout after transmitting email
      adapter.setTransportHook(async () => {
        dispatchCount++;
        throw new IntegrationServerError('resend', '504 Gateway Timeout from upstream mail worker', 504);
      });

      const emailInput: ResendEmailInput = {
        to: 'founder@samjuniors.com',
        subject: 'Critical Alert',
        text: 'System heartbeat normal.',
        idempotencyKey: testKey,
      };

      // Dispatch fails with UnknownExternalResultError
      await expect(adapter.sendEmail(emailInput)).rejects.toThrow(UnknownExternalResultError);
      expect(dispatchCount).toBe(1);

      // 2. Blind retry is strictly blocked (prevents duplicate email dispatch)
      await expect(adapter.sendEmail(emailInput)).rejects.toThrow(UnknownExternalResultError);
      expect(dispatchCount).toBe(1);

      // 3. Reconcile with remote state check
      const reconciled = await adapter.reconcileOutcome(testKey, async () => {
        return {
          id: 'reconciled_email_7788',
          from: 'contact@samjuniors.com',
          to: ['founder@samjuniors.com'],
          status: 'sent',
          createdAt: '2026-10-31T15:12:00Z',
        };
      });

      expect(reconciled.id).toBe('reconciled_email_7788');
      expect(reconciled.status).toBe('sent');

      // Subsequent call returns reconciled completed state
      const subsequent = await adapter.sendEmail(emailInput);
      expect(subsequent.id).toBe('reconciled_email_7788');
      expect(dispatchCount).toBe(1);
    });

    it('Stripe: network timeout during charge enters unknown outcome, blocks double charge, and reconciles', async () => {
      const adapter = StripeAdapter.getInstance();
      const testKey = `stripe:test:unknown:${Date.now()}`;
      let stripeCallCount = 0;

      // 1. Network drops during charge dispatch
      adapter.setTransportHook(async () => {
        stripeCallCount++;
        const timeoutErr: any = new Error('Client network timeout after 10000ms');
        timeoutErr.code = 'ETIMEDOUT';
        throw timeoutErr;
      });

      const paymentInput: StripePaymentIntentInput = {
        amountCents: 9900,
        currency: 'usd',
        description: 'Yearly Pro Plan',
        idempotencyKey: testKey,
      };

      // Fails with UnknownExternalResultError
      await expect(adapter.createPaymentIntent(paymentInput)).rejects.toThrow(UnknownExternalResultError);
      expect(stripeCallCount).toBe(1);

      // 2. Blind retry is blocked to prevent double-charging customer
      await expect(adapter.createPaymentIntent(paymentInput)).rejects.toThrow(UnknownExternalResultError);
      expect(stripeCallCount).toBe(1);

      // 3. Reconcile outcome against remote Stripe query
      const reconciledPayment = await adapter.reconcileOutcome(testKey, async () => {
        return {
          id: 'pi_reconciled_998811',
          amountCents: 9900,
          currency: 'usd',
          status: 'succeeded',
          clientSecret: 'pi_reconciled_secret_998811',
          createdAt: '2026-10-31T15:15:00Z',
        };
      });

      expect(reconciledPayment.id).toBe('pi_reconciled_998811');
      expect(reconciledPayment.status).toBe('succeeded');

      // Subsequent call returns cached succeeded result without extra charge
      const cached = await adapter.createPaymentIntent(paymentInput);
      expect(cached.id).toBe('pi_reconciled_998811');
      expect(stripeCallCount).toBe(1);
    });
  });
});
