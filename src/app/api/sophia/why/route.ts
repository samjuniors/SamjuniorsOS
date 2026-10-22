import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { ConversationStore } from '@/lib/server/conversation/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedFounder(req);
  if (!session || session.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Unauthorized: Valid Founder session required' }, { status: 401 });
  }

  const founderId =
    (process.env.NODE_ENV !== 'production' && (req.headers.get('x-founder-id') || req.headers.get('x-samjuniors-user-id'))) ||
    session.userId;

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');
  const idOrTurnId = searchParams.get('id') || searchParams.get('turnId') || searchParams.get('messageId');

  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId parameter is required' }, { status: 400 });
  }

  const convStore = ConversationStore.getInstance();
  try {
    const log = idOrTurnId
      ? await convStore.getDecisionLog(conversationId, idOrTurnId, founderId)
      : await convStore.getLatestDecisionLog(conversationId, founderId);

    if (!log) {
      return NextResponse.json({ success: false, error: 'No decision log entry found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, log });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode || 500 });
  }
}
