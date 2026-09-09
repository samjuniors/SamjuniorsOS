import {
  CommunicationChannel,
  DeliveryStatus,
  Message,
  MessageFilter,
  MessageThread,
  ResendEmailConfig,
} from '../../../types/communication';
import { CommunicationProviderAdapter } from './provider';
import crypto from 'crypto';

/**
 * PHASE 12.5: Resend Communication Provider Adapter
 * Implements the server-side email adapter for Resend.
 * Credentials and API keys are strictly server-side and never exposed to client or logs.
 */

export const RESEND_API_BASE_URL = 'https://api.resend.com';
export const DEFAULT_RESEND_FROM_EMAIL = 'contact@samjuniors.com';

/**
 * Helper to safely extract server-side Resend configuration.
 * Never exposes the raw API key in logs or client-facing objects.
 */
export function getResendConfig(): ResendEmailConfig {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM_EMAIL).trim();
  const webhookSecret = (process.env.RESEND_WEBHOOK_SECRET || '').trim() || undefined;

  return {
    apiKey,
    fromEmail,
    webhookSecret,
  };
}

export class ResendCommunicationProviderAdapter implements CommunicationProviderAdapter {
  readonly providerId = 'resend-email-adapter';
  readonly channel: CommunicationChannel = 'email';

  private apiKey: string;
  private defaultFromEmail: string;
  private customFetcher?: typeof fetch;

  constructor(options?: {
    apiKey?: string;
    fromEmail?: string;
    fetcher?: typeof fetch;
  }) {
    const config = getResendConfig();
    this.apiKey = options?.apiKey !== undefined ? options.apiKey.trim() : config.apiKey;
    this.defaultFromEmail = options?.fromEmail !== undefined ? options.fromEmail.trim() : config.fromEmail;
    this.customFetcher = options?.fetcher;
  }

  /**
   * Checks if Resend is configured with a valid API key.
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  /**
   * Sends an email message through Resend REST API.
   * Gated behind Phase 12.3 authorization by the CommunicationRuntime.
   */
  async sendMessage(
    message: Message,
    approvalId?: string,
    idempotencyKey?: string
  ): Promise<{
    success: boolean;
    externalMessageId?: string;
    deliveryStatus: DeliveryStatus;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        deliveryStatus: 'failed',
        error: 'RESEND_NOT_CONFIGURED: Missing or invalid RESEND_API_KEY.',
      };
    }

    if (!message.recipients || message.recipients.length === 0) {
      return {
        success: false,
        deliveryStatus: 'failed',
        error: 'INVALID_PAYLOAD: Message recipients list is empty.',
      };
    }

    const fetcher = this.customFetcher || fetch;

    // Build Resend payload
    // If sender address is provided in message, use sender name + configured domain or fallback
    const senderName = message.sender?.name ? message.sender.name.replace(/[<>"\r\n]/g, '') : undefined;
    const fromAddress = this.defaultFromEmail;
    const fromFormatted = senderName ? `${senderName} <${fromAddress}>` : fromAddress;

    const toAddresses = message.recipients.map((r) => r.address);
    const ccAddresses = message.cc && message.cc.length > 0 ? message.cc.map((r) => r.address) : undefined;
    const bccAddresses = message.bcc && message.bcc.length > 0 ? message.bcc.map((r) => r.address) : undefined;

    const emailPayload: Record<string, any> = {
      from: fromFormatted,
      to: toAddresses,
      subject: message.subject || 'No Subject',
      headers: {
        'X-Samjuniors-Message-Id': message.id,
        'X-Samjuniors-Execution-Ref': message.executionRef || '',
        'X-Samjuniors-Approval-Ref': approvalId || '',
      },
    };

    if (message.bodyMimeType === 'text/html') {
      emailPayload.html = message.bodyContent;
    } else {
      emailPayload.text = message.bodyContent;
    }

    if (ccAddresses) emailPayload.cc = ccAddresses;
    if (bccAddresses) emailPayload.bcc = bccAddresses;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      };
      if (idempotencyKey) {
        requestHeaders['Idempotency-Key'] = idempotencyKey;
      }

      const response = await fetcher(`${RESEND_API_BASE_URL}/emails`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(emailPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg =
          responseData?.message || responseData?.error || `HTTP ${response.status} ${response.statusText}`;
        return {
          success: false,
          deliveryStatus: 'failed',
          error: `RESEND_API_ERROR (${response.status}): ${errorMsg}`,
        };
      }

      const externalMessageId = responseData?.id;
      if (!externalMessageId) {
        return {
          success: false,
          deliveryStatus: 'failed',
          error: 'RESEND_INVALID_RESPONSE: Missing email ID in provider response.',
        };
      }

      // Truthful delivery status: Marked as 'sending' (accepted by provider),
      // NOT prematurely marked as 'delivered' until webhook/confirmation.
      return {
        success: true,
        externalMessageId,
        deliveryStatus: 'sending',
      };
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      return {
        success: false,
        deliveryStatus: 'failed',
        error: isAbort
          ? 'RESEND_TIMEOUT_ERROR: Request to Resend timed out.'
          : `RESEND_NETWORK_ERROR: ${err.message || 'Unknown network error'}`,
      };
    }
  }

  /**
   * Inspects delivery status for a specific message from Resend.
   */
  async getDeliveryStatus(externalMessageId: string): Promise<DeliveryStatus> {
    if (!this.isConfigured() || !externalMessageId) {
      return 'failed';
    }

    const fetcher = this.customFetcher || fetch;

    try {
      const response = await fetcher(`${RESEND_API_BASE_URL}/emails/${externalMessageId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        return 'failed';
      }

      const data = await response.json().catch(() => ({}));
      const statusStr = (data?.last_event || data?.status || '').toLowerCase();

      switch (statusStr) {
        case 'delivered':
          return 'delivered';
        case 'bounced':
        case 'complained':
          return 'bounced';
        case 'sent':
        case 'delivery_delayed':
          return 'sending';
        default:
          return 'sending';
      }
    } catch {
      return 'failed';
    }
  }

  /**
   * Resend is a transactional email service and does not provide an inbound mailbox reading API.
   * Explicitly returns an empty list.
   */
  async readMessages(_filter?: MessageFilter): Promise<Message[]> {
    return [];
  }

  /**
   * Resend does not maintain inbound conversational threads.
   * Explicitly returns null.
   */
  async getThread(_threadId: string): Promise<MessageThread | null> {
    return null;
  }

  /**
   * Custom serialization to ensure API keys are never exposed.
   */
  toJSON(): Record<string, any> {
    return {
      providerId: this.providerId,
      channel: this.channel,
      isConfigured: this.isConfigured(),
      fromEmail: this.defaultFromEmail,
    };
  }
}

/**
 * Validates Resend (Svix standard) webhook signature.
 * Follows Svix HMAC-SHA256 standard with timing-safe comparison.
 */
export function verifyResendWebhookSignature(params: {
  rawBody: string;
  svixId?: string;
  svixTimestamp?: string;
  svixSignature?: string;
  secret?: string;
  toleranceSeconds?: number;
  currentTimestampSec?: number;
}): boolean {
  const secret = params.secret || process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // If no secret configured, fail closed
    return false;
  }

  const { svixId, svixTimestamp, svixSignature, rawBody } = params;
  if (!svixId || !svixTimestamp || !svixSignature || !rawBody) {
    return false;
  }

  // Svix timestamp tolerance check (5 minutes = 300 seconds default)
  const timestampNum = parseInt(svixTimestamp, 10);
  if (isNaN(timestampNum)) {
    return false;
  }

  const nowSec = params.currentTimestampSec !== undefined ? params.currentTimestampSec : Math.floor(Date.now() / 1000);
  const tolerance = params.toleranceSeconds !== undefined ? params.toleranceSeconds : 300;
  if (Math.abs(nowSec - timestampNum) > tolerance) {
    return false;
  }

  try {
    // Svix secret can be formatted as "whsec_<base64_secret>" or plain string
    let keyBuffer: Buffer;
    if (secret.startsWith('whsec_')) {
      keyBuffer = Buffer.from(secret.substring(6), 'base64');
    } else {
      keyBuffer = Buffer.from(secret, 'utf8');
    }

    const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
    const hmac = crypto.createHmac('sha256', keyBuffer);
    hmac.update(signedPayload);
    const calculatedSignature = hmac.digest('base64');

    // svixSignature format may contain multiple versions like "v1,signature1 v1,signature2"
    const passedSignatures = svixSignature.split(' ');
    for (const item of passedSignatures) {
      const parts = item.split(',');
      if (parts.length === 2 && parts[0] === 'v1') {
        const signatureToCompare = parts[1];
        const sigBuf = Buffer.from(signatureToCompare);
        const calcBuf = Buffer.from(calculatedSignature);
        if (sigBuf.length === calcBuf.length) {
          const isMatch = crypto.timingSafeEqual(sigBuf, calcBuf);
          if (isMatch) return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}
