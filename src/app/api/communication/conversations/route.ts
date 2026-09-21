import { NextRequest, NextResponse } from 'next/server';
import { CommunicationRuntime } from '@/lib/server/communication/runtime';
import { CommunicationChannel, ConversationStatus } from '@/types/communication';

/**
 * GET /api/communication/conversations
 * Inspection API for conversations.
 */
export async function GET(req: NextRequest) {
  try {
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
