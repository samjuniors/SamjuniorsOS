/**
 * SamJuniorsOS — Integration Contracts & Types (Gate G14.6)
 *
 * Invariants:
 * 1. Strict Schema Validation: Every external call payload and response must adhere to validated Zod schemas.
 * 2. Deterministic Error Classification: Client 4xx errors are distinguished from provider 5xx / network failures.
 * 3. Idempotency & Unknown Outcomes: Side-effect calls carry idempotency keys and handle network drops safely.
 * 4. Approval by Default: All mutation capabilities route to Founder approval before execution.
 */

import { z } from 'zod';

// ----------------------------------------------------------------------------
// 1. INTEGRATION ERRORS & CLASSIFICATION
// ----------------------------------------------------------------------------

export class IntegrationError extends Error {
  public readonly provider: string;
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly isDeterministicFailure: boolean;

  constructor(params: {
    provider: string;
    message: string;
    statusCode?: number;
    code?: string;
    isDeterministicFailure?: boolean;
  }) {
    super(`[${params.provider.toUpperCase()}] ${params.message}`);
    this.name = 'IntegrationError';
    this.provider = params.provider;
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.isDeterministicFailure = params.isDeterministicFailure ?? (
      params.statusCode !== undefined && params.statusCode >= 400 && params.statusCode < 500
    );
  }
}

export class IntegrationValidationError extends IntegrationError {
  constructor(provider: string, message: string) {
    super({ provider, message, statusCode: 400, code: 'VALIDATION_ERROR', isDeterministicFailure: true });
    this.name = 'IntegrationValidationError';
  }
}

export class IntegrationAuthError extends IntegrationError {
  constructor(provider: string, message: string) {
    super({ provider, message, statusCode: 401, code: 'UNAUTHORIZED', isDeterministicFailure: true });
    this.name = 'IntegrationAuthError';
  }
}

export class IntegrationRateLimitError extends IntegrationError {
  constructor(provider: string, message: string) {
    super({ provider, message, statusCode: 429, code: 'RATE_LIMITED', isDeterministicFailure: false });
    this.name = 'IntegrationRateLimitError';
  }
}

export class IntegrationServerError extends IntegrationError {
  constructor(provider: string, message: string, statusCode: number = 500) {
    super({ provider, message, statusCode, code: 'SERVER_ERROR', isDeterministicFailure: false });
    this.name = 'IntegrationServerError';
  }
}

// ----------------------------------------------------------------------------
// 2. RESEND CONTRACTS (Email Communication)
// ----------------------------------------------------------------------------

export const ResendEmailInputSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  from: z.string().email().optional(),
  subject: z.string().min(1, 'Subject cannot be empty').max(256),
  html: z.string().optional(),
  text: z.string().optional(),
  replyTo: z.string().email().optional(),
  idempotencyKey: z.string().optional(),
}).refine(data => data.html || data.text, {
  message: 'Email must include either text or html content.',
});

export type ResendEmailInput = z.infer<typeof ResendEmailInputSchema>;

export const ResendEmailResultSchema = z.object({
  id: z.string().min(1),
  from: z.string(),
  to: z.array(z.string()),
  status: z.enum(['queued', 'sent', 'delivered', 'failed']),
  createdAt: z.string(),
});

export type ResendEmailResult = z.infer<typeof ResendEmailResultSchema>;

// ----------------------------------------------------------------------------
// 3. STRIPE CONTRACTS (Payments & Invoicing)
// ----------------------------------------------------------------------------

export const StripePaymentIntentInputSchema = z.object({
  amountCents: z.number().int().positive('Amount must be a positive integer in cents'),
  currency: z.string().length(3).toLowerCase(),
  customerId: z.string().optional(),
  description: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  idempotencyKey: z.string().optional(),
});

export type StripePaymentIntentInput = z.infer<typeof StripePaymentIntentInputSchema>;

export const StripePaymentIntentResultSchema = z.object({
  id: z.string().min(1),
  amountCents: z.number().int(),
  currency: z.string(),
  status: z.enum([
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
    'succeeded',
    'canceled',
  ]),
  clientSecret: z.string(),
  createdAt: z.string(),
});

export type StripePaymentIntentResult = z.infer<typeof StripePaymentIntentResultSchema>;
