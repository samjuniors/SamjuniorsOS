import { NextRequest, NextResponse } from 'next/server';
import { CommunicationRuntime } from '@/lib/server/communication/runtime';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { CommunicationChannel, ConversationStatus } from '@/types/communication';

/**
 * GET /api/communication/conversations
 * Inspection API for conversations. (Defense-in-depth founder gate on top
 * of the executive-route middleware gate — conversation content is
 * Founder-only data.)
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
    const channel = (searchParams.get('channel') as CommunicationChannel) || undefined;
    const status = (searchParams.get('status') as ConversationStatus) || undefined;
    const workflowInstanceId = searchParams.get('workflowInstanceId') || undefined;
    const participantAddress = searchParams.get('participantAddress') || undefined;

    const runtime = CommunicationRuntime.getInstance();
    const conversations = await runtime.listConversations({
      channel,
      status,
      workflowInstanceId,
      participantAddress,
    });

    return NextResponse.json({
      success: true,
      count: conversations.length,
      conversations,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
