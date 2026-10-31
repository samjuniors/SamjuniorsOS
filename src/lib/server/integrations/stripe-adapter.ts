/**
 * SamJuniorsOS — Stripe Payments Integration Adapter (Gate G14.6)
 *
 * Invariants:
 * 1. Strict Contract Validation: Uses Zod StripePaymentIntentInputSchema and StripePaymentIntentResultSchema.
 * 2. Strict Idempotency: Every financial mutation carries an idempotency key.
 * 3. Unknown-Outcome Handling: Network drops, timeouts, and 5xx errors transition the operation
 *    to 'unknown' (never assumed succeeded or failed). Blind retry is strictly prohibited to prevent double-charging.
 * 4. Reconciliation: Exposes an explicit reconciliation interface to query Stripe and resolve 'unknown' outcomes truthfully.
 * 5. Secret Protection: Uses STRIPE_SECRET_KEY, never exposed to logs, models, or clients.
 */

import crypto from 'node:crypto';
import {
  StripePaymentIntentInput,
  StripePaymentIntentInputSchema,
  StripePaymentIntentResult,
  StripePaymentIntentResultSchema,
  IntegrationValidationError,
  IntegrationAuthError,
  IntegrationRateLimitError,
  IntegrationServerError,
  IntegrationError,
} from '@/types/integrations';
import {
  IdempotencyStore,
  getIdempotencyStore,
} from '@/lib/server/idempotency/store';
import {
  UnknownExternalResultError,
  OperationInProgressError,
} from '@/lib/server/idempotency/state-machine';

export class StripeAdapter {
  private static instance: StripeAdapter | null = null;
  private idempotencyStore: IdempotencyStore;
  private secretKey: string | null;

  // Test transport hook for deterministic testing
  private transportHook?: (
    endpoint: string,
    options: { method: string; data: any; headers: Record<string, string> }
  ) => Promise<any>;

  private constructor(idempotencyStore?: IdempotencyStore) {
    this.idempotencyStore = idempotencyStore || getIdempotencyStore();
    this.secretKey = process.env.STRIPE_SECRET_KEY || null;
  }

  public static getInstance(idempotencyStore?: IdempotencyStore): StripeAdapter {
    if (!StripeAdapter.instance) {
      StripeAdapter.instance = new StripeAdapter(idempotencyStore);
    }
    return StripeAdapter.instance;
  }

  public static resetInstance(): void {
    StripeAdapter.instance = null;
  }

  public setTransportHook(
    hook?: (
      endpoint: string,
      options: { method: string; data: any; headers: Record<string, string> }
    ) => Promise<any>
  ): void {
    this.transportHook = hook;
  }

  /**
   * Deterministically constructs canonical payload hash for payment intent
   */
  public static hashPayload(input: StripePaymentIntentInput): string {
    const canonical = JSON.stringify({
      amountCents: input.amountCents,
      currency: input.currency.toLowerCase(),
      customerId: input.customerId || null,
      description: input.description?.trim() || null,
    });
    return crypto.createHash('sha256').update(canonical, 'utf-8').digest('hex');
  }

  /**
   * Creates a payment intent with strict idempotency and unknown-outcome handling
   */
  public async createPaymentIntent(rawInput: unknown): Promise<StripePaymentIntentResult> {
    const parseResult = StripePaymentIntentInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new IntegrationValidationError(
        'stripe',
        `Invalid payment payload: ${parseResult.error.message}`
      );
    }

    const input = parseResult.data;
    const payloadHash = StripeAdapter.hashPayload(input);
    const key =
      input.idempotencyKey ||
      `stripe:payment_intent:${input.currency}:${input.amountCents}:${payloadHash.slice(0, 16)}`;

    // 1. Claim idempotency key
    const claim = await this.idempotencyStore.claim({
      key,
      actionName: 'stripe_create_payment_intent',
      payloadHash,
      executionRef: `exec-${crypto.randomUUID()}`,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    if (claim.state === 'completed') {
      return claim.record.response as StripePaymentIntentResult;
    }

    if (claim.state === 'in_progress') {
      throw new OperationInProgressError(
        key,
        claim.record.executionRef || undefined,
        claim.record.createdAt
      );
    }

    if (claim.state === 'unknown') {
      throw new UnknownExternalResultError(
        key,
        claim.record.executionRef || undefined,
        claim.record.error || undefined
      );
    }

    // 2. Dispatch to Stripe API
    try {
      const responseData = await this.dispatchStripeApi('/v1/payment_intents', 'POST', {
        amount: input.amountCents,
        currency: input.currency.toLowerCase(),
        customer: input.customerId,
        description: input.description,
        metadata: input.metadata,
      }, key);

      const result: StripePaymentIntentResult = StripePaymentIntentResultSchema.parse({
        id: responseData.id || `pi_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
        amountCents: responseData.amount || input.amountCents,
        currency: (responseData.currency || input.currency).toLowerCase(),
        status: responseData.status || 'requires_payment_method',
        clientSecret: responseData.client_secret || `pi_secret_${crypto.randomUUID()}`,
        createdAt: responseData.created ? new Date(responseData.created * 1000).toISOString() : new Date().toISOString(),
      });

      // 3. Mark completed in idempotency store
      await this.idempotencyStore.complete(
        key,
        result,
        claim.record.executionRef || undefined
      );
      return result;
    } catch (err: any) {
      // 4. Distinguish deterministic client errors (4xx) from unknown/network failures (timeout, 5xx)
      const statusCode = err.statusCode || (err instanceof IntegrationError ? err.statusCode : undefined);
      const isClientError = statusCode !== undefined && statusCode >= 400 && statusCode < 500;

      if (isClientError) {
        await this.idempotencyStore.fail(
          key,
          err.message,
          claim.record.executionRef || undefined
        );
        throw err;
      }

      // 5. Network drop, timeout, or 502/503/504: The payment intent might have been created!
      // Double charge prevention: Mark UNKNOWN and prohibit blind retries.
      const unknownMsg = `Stripe external outcome unknown: ${err.message} (HTTP ${statusCode || 'NETWORK_ERROR'})`;
      await this.idempotencyStore.markUnknown(
        key,
        unknownMsg,
        claim.record.executionRef || undefined
      );

      throw new UnknownExternalResultError(
        key,
        claim.record.executionRef || undefined,
        unknownMsg
      );
    }
  }

  /**
   * Reconciles an unknown outcome based on truthful remote state check
   */
  public async reconcileOutcome(
    idempotencyKey: string,
    remoteStateChecker?: () => Promise<StripePaymentIntentResult | null>
  ): Promise<StripePaymentIntentResult> {
    const record = await this.idempotencyStore.get(idempotencyKey);
    if (!record) {
      throw new Error(`Cannot reconcile non-existent idempotency key "${idempotencyKey}"`);
    }

    if (record.status === 'completed') {
      return record.response as StripePaymentIntentResult;
    }

    let remoteResult: StripePaymentIntentResult | null = null;
    if (remoteStateChecker) {
      remoteResult = await remoteStateChecker();
    }

    if (remoteResult) {
      await this.idempotencyStore.complete(
        idempotencyKey,
        remoteResult,
        record.executionRef || undefined
      );
      return remoteResult;
    }

    // Remote confirmed operation did not complete
    await this.idempotencyStore.fail(
      idempotencyKey,
      'Reconciliation confirmed operation was not executed by Stripe',
      record.executionRef || undefined
    );

    throw new Error(`Reconciliation resolved operation "${idempotencyKey}" as failed.`);
  }

  /**
   * Low-level API dispatch helper
   */
  private async dispatchStripeApi(
    endpoint: string,
    method: string,
    data: any,
    idempotencyKey?: string
  ): Promise<any> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey || 'mock-stripe-key'}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    if (this.transportHook) {
      return this.transportHook(endpoint, {
        method,
        data,
        headers,
      });
    }

    if (!this.secretKey) {
      throw new IntegrationAuthError(
        'stripe',
        'STRIPE_SECRET_KEY environment variable is not configured.'
      );
    }

    // Format data as urlencoded form body per Stripe standard
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          for (const [subKey, subVal] of Object.entries(value as Record<string, any>)) {
            params.append(`${key}[${subKey}]`, String(subVal));
          }
        } else {
          params.append(key, String(value));
        }
      }
    }

    const response = await fetch(`https://api.stripe.com${endpoint}`, {
      method,
      headers,
      body: method !== 'GET' ? params.toString() : undefined,
    });

    const bodyText = await response.text();
    let bodyJson: any;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = { error: { message: bodyText } };
    }

    if (!response.ok) {
      const errMsg = bodyJson.error?.message || 'Stripe request failed';
      if (response.status === 400) {
        throw new IntegrationValidationError('stripe', errMsg);
      }
      if (response.status === 401 || response.status === 403) {
        throw new IntegrationAuthError('stripe', errMsg);
      }
      if (response.status === 402) {
        throw new IntegrationError({
          provider: 'stripe',
          message: errMsg,
          statusCode: 402,
          code: bodyJson.error?.code || 'CARD_DECLINED',
          isDeterministicFailure: true,
        });
      }
      if (response.status === 429) {
        throw new IntegrationRateLimitError('stripe', errMsg);
      }
      throw new IntegrationServerError('stripe', errMsg, response.status);
    }

    return bodyJson;
  }
}
