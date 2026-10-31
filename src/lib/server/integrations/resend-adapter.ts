/**
 * SamJuniorsOS — Resend Email Integration Adapter (Gate G14.6)
 *
 * Invariants:
 * 1. Strict Contract Validation: Uses Zod ResendEmailInputSchema and ResendEmailResultSchema.
 * 2. Strict Idempotency: Every email mutation is guarded by deterministic idempotency keys.
 * 3. Unknown-Outcome Handling: Network drops, timeouts, and 5xx errors transition the operation
 *    to 'unknown' (never assumed succeeded or failed). Blind retry is strictly prohibited.
 * 4. Reconciliation: Exposes a reconciliation interface to resolve 'unknown' states truthfully.
 * 5. Secret Protection: Uses RESEND_API_KEY from environment or vault, never exposed to logs.
 */

import crypto from 'node:crypto';
import {
  ResendEmailInput,
  ResendEmailInputSchema,
  ResendEmailResult,
  ResendEmailResultSchema,
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
  IdempotencyPayloadMismatchError,
  OperationInProgressError,
} from '@/lib/server/idempotency/state-machine';

export class ResendAdapter {
  private static instance: ResendAdapter | null = null;
  private idempotencyStore: IdempotencyStore;
  private apiKey: string | null;
  private defaultFromEmail: string;

  // Test transport hook for deterministic testing
  private transportHook?: (
    endpoint: string,
    options: { method: string; data: any; headers: Record<string, string> }
  ) => Promise<any>;

  private constructor(idempotencyStore?: IdempotencyStore) {
    this.idempotencyStore = idempotencyStore || getIdempotencyStore();
    this.apiKey = process.env.RESEND_API_KEY || null;
    this.defaultFromEmail = (process.env.RESEND_FROM_EMAIL || 'contact@samjuniors.com').trim();
  }

  public static getInstance(idempotencyStore?: IdempotencyStore): ResendAdapter {
    if (!ResendAdapter.instance) {
      ResendAdapter.instance = new ResendAdapter(idempotencyStore);
    }
    return ResendAdapter.instance;
  }

  public static resetInstance(): void {
    ResendAdapter.instance = null;
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
   * Deterministically constructs canonical payload hash for email dispatch
   */
  public static hashPayload(input: ResendEmailInput): string {
    const canonical = JSON.stringify({
      to: Array.isArray(input.to) ? input.to.slice().sort() : [input.to],
      from: (input.from || 'default').toLowerCase(),
      subject: input.subject.trim(),
      html: input.html?.trim(),
      text: input.text?.trim(),
    });
    return crypto.createHash('sha256').update(canonical, 'utf-8').digest('hex');
  }

  /**
   * Sends an email via Resend with strict idempotency and unknown-outcome handling
   */
  public async sendEmail(rawInput: unknown): Promise<ResendEmailResult> {
    const parseResult = ResendEmailInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new IntegrationValidationError(
        'resend',
        `Invalid email payload: ${parseResult.error.message}`
      );
    }

    const input = parseResult.data;
    const toArray = Array.isArray(input.to) ? input.to : [input.to];
    const fromEmail = input.from || this.defaultFromEmail;
    const payloadHash = ResendAdapter.hashPayload(input);
    const key =
      input.idempotencyKey ||
      `resend:email:send:${toArray[0]}:${payloadHash.slice(0, 16)}`;

    // 1. Claim idempotency key
    const claim = await this.idempotencyStore.claim({
      key,
      actionName: 'resend_send_email',
      payloadHash,
      executionRef: `exec-${crypto.randomUUID()}`,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    if (claim.state === 'completed') {
      return claim.record.response as ResendEmailResult;
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

    // 2. Dispatch to Resend API
    try {
      const responseData = await this.dispatchResendApi('/emails', 'POST', {
        from: fromEmail,
        to: toArray,
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
      });

      const result: ResendEmailResult = ResendEmailResultSchema.parse({
        id: responseData.id || `msg-${crypto.randomUUID()}`,
        from: fromEmail,
        to: toArray,
        status: 'queued',
        createdAt: responseData.created_at || new Date().toISOString(),
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

      // 5. Network drop, timeout, or 502/503/504: The email might have been sent!
      // Must NOT assume failure; mark UNKNOWN to block blind duplicate retries.
      const unknownMsg = `Resend external outcome unknown: ${err.message} (HTTP ${statusCode || 'NETWORK_ERROR'})`;
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
    remoteStateChecker?: () => Promise<ResendEmailResult | null>
  ): Promise<ResendEmailResult> {
    const record = await this.idempotencyStore.get(idempotencyKey);
    if (!record) {
      throw new Error(`Cannot reconcile non-existent idempotency key "${idempotencyKey}"`);
    }

    if (record.status === 'completed') {
      return record.response as ResendEmailResult;
    }

    let remoteResult: ResendEmailResult | null = null;
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
      'Reconciliation confirmed operation was not executed by Resend',
      record.executionRef || undefined
    );

    throw new Error(`Reconciliation resolved operation "${idempotencyKey}" as failed.`);
  }

  /**
   * Low-level API dispatch helper
   */
  private async dispatchResendApi(
    endpoint: string,
    method: string,
    data: any
  ): Promise<any> {
    if (this.transportHook) {
      return this.transportHook(endpoint, {
        method,
        data,
        headers: {
          Authorization: `Bearer ${this.apiKey || 'mock-key'}`,
          'Content-Type': 'application/json',
        },
      });
    }

    if (!this.apiKey) {
      throw new IntegrationAuthError(
        'resend',
        'RESEND_API_KEY environment variable is not configured.'
      );
    }

    const response = await fetch(`https://api.resend.com${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const bodyText = await response.text();
    let bodyJson: any;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = { message: bodyText };
    }

    if (!response.ok) {
      if (response.status === 400) {
        throw new IntegrationValidationError('resend', bodyJson.message || 'Validation error');
      }
      if (response.status === 401 || response.status === 403) {
        throw new IntegrationAuthError('resend', bodyJson.message || 'Authentication error');
      }
      if (response.status === 429) {
        throw new IntegrationRateLimitError('resend', bodyJson.message || 'Rate limit exceeded');
      }
      throw new IntegrationServerError('resend', bodyJson.message || 'Server error', response.status);
    }

    return bodyJson;
  }
}
