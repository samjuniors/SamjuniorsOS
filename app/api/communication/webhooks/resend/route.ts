import { NextRequest, NextResponse } from 'next/server';
import { CommunicationRuntime } from '../../../../../lib/server/communication/runtime';
import {
  verifyResendWebhookSignature,
  getResendConfig,
} from '../../../../../lib/server/communication/resend-provider';

/**
 * PHASE 12.5: Resend Webhook Endpoint
 * Ingests asynchronous delivery events (email.sent, email.delivered, email.bounced, etc.)
 * Supports Svix signature validation, deduplication, and message status updates.
 */

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const config = getResendConfig();

    const svixId = req.headers.get('svix-id') || undefined;
    const svixTimestamp = req.headers.get('svix-timestamp') || undefined;
    const svixSignature = req.headers.get('svix-signature') || undefined;

    // If webhook secret is configured, strictly enforce signature verification
    if (config.webhookSecret) {
      const isValid = verifyResendWebhookSignature({
        rawBody,
        svixId,
        svixTimestamp,
        svixSignature,
        secret: config.webhookSecret,
      });

      if (!isValid) {
        return NextResponse.json(
          { error: 'INVALID_SIGNATURE: Svix webhook signature verification failed.' },
          { status: 401 }
        );
      }
    }

    if (!rawBody || rawBody.trim().length === 0) {
      return NextResponse.json(
        { error: 'EMPTY_PAYLOAD: Webhook request body is empty.' },
        { status: 400 }
      );
    }

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'MALFORMED_JSON: Invalid JSON body.' },
        { status: 400 }
      );
    }

    const eventType = payload.type;
    const eventData = payload.data || {};
    const externalMessageId = eventData.email_id || eventData.id || payload.id;
    const eventId = svixId || payload.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!eventType || !externalMessageId) {
      return NextResponse.json(
        { error: 'INVALID_EVENT_DATA: Missing event type or email_id in payload.' },
        { status: 400 }
      );
    }

    const recipient = Array.isArray(eventData.to)
      ? eventData.to.join(', ')
      : typeof eventData.to === 'string'
      ? eventData.to
      : undefined;

    const runtime = CommunicationRuntime.getInstance();
    const result = await runtime.handleWebhookEvent({
      eventId,
      provider: 'resend',
      eventType,
      externalMessageId,
      timestamp: payload.created_at || eventData.created_at,
      recipient,
      rawPayload: payload,
    });

    return NextResponse.json({
      received: true,
      duplicate: result.duplicate,
      messageId: result.messageId,
      externalMessageId: result.externalMessageId,
      deliveryStatus: result.deliveryStatus,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `WEBHOOK_PROCESSING_FAILED: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  const runtime = CommunicationRuntime.getInstance();
  const events = await runtime.listWebhookEvents();
  return NextResponse.json({ events });
}
