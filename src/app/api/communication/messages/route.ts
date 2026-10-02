import { NextRequest, NextResponse } from 'next/server';
import { InMemoryCommunicationStore } from '@/lib/server/communication/store';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { CommunicationChannel, DeliveryStatus, MessageDirection } from '@/types/communication';

/**
 * GET /api/communication/messages
 * Inspection API for internal/external message records. (Defense-in-depth
 * founder gate on top of the executive-route middleware gate — message
 * content is Founder-only data.)
 */
export async function GET(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Valid Founder session required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId') || undefined;
    const threadId = searchParams.get('threadId') || undefined;
    const channel = (searchParams.get('channel') as CommunicationChannel) || undefined;
    const direction = (searchParams.get('direction') as MessageDirection) || undefined;
    const deliveryStatus = (searchParams.get('deliveryStatus') as DeliveryStatus) || undefined;

    const store = InMemoryCommunicationStore.getInstance();
    const messages = await store.listMessages({
      conversationId,
      threadId,
      channel,
      direction,
      deliveryStatus,
    });

    return NextResponse.json({
      success: true,
      count: messages.length,
      messages,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
