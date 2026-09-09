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
    const config = getResendConfig();

    // 1. Fail closed if webhook secret is not configured
    if (!config.webhookSecret) {
      return NextResponse.json(
        { error: 'WEBHOOK_SECRET_MISSING: RESEND_WEBHOOK_SECRET is not configured on the server.' },
        { status: 401 }
      );
    }

    const svixId = req.headers.get('svix-id') || undefined;
    const svixTimestamp = req.headers.get('svix-timestamp') || undefined;
    const svixSignature = req.headers.get('svix-signature') || undefined;

    // 2. Reject missing Svix headers
    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json(
        { error: 'MISSING_SVIX_HEADERS: Required Svix headers (svix-id, svix-timestamp, svix-signature) are missing.' },
        { status: 401 }
      );
    }

    const rawBody = await req.text();

    if (!rawBody || rawBody.trim().length === 0) {
      return NextResponse.json(
        { error: 'EMPTY_PAYLOAD: Webhook request body is empty.' },
        { status: 400 }
      );
    }

    // 3. Strictly enforce Svix signature verification
    const isValid = verifyResendWebhookSignature({
      rawBody,
      svixId,
      svixTimestamp,
      svixSignature,
      secret: config.webhookSecret,
    });

    if (!isValid) {
      return NextResponse.json(
        { error: 'INVALID_SIGNATURE: Svix webhook signature verification failed or timestamp expired.' },
        { status: 401 }
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
    const eventId = svixId || payload.id;

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
