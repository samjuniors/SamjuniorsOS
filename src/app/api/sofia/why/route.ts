import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { DecisionLogStore } from '@/lib/server/sophia/decision-log-store';
import { ConversationStore } from '@/lib/server/conversation/store';
import {
  SophiaDecisionLogEntry,
  formatDecisionLogExplanation,
  formatNoDecisionLogExplanation,
} from '@/lib/server/sophia/decision-log';

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
  const conversationId = searchParams.get('conversationId') || undefined;
  const idOrTurnId = searchParams.get('id') || searchParams.get('turnId') || searchParams.get('messageId') || undefined;

  const decStore = DecisionLogStore.getInstance();
  const convStore = ConversationStore.getInstance();
  try {
    let log: SophiaDecisionLogEntry | null = null;
    if (idOrTurnId) {
      log = (await decStore.getDecision(idOrTurnId)) ||
        (conversationId ? await decStore.getDecisionByTurnId(conversationId, idOrTurnId) : null) ||
        (conversationId ? await convStore.getDecisionLog(conversationId, idOrTurnId, founderId) : null);
    } else if (conversationId) {
      log = (await decStore.getLatestDecision(conversationId)) ||
        (await convStore.getLatestDecisionLog(conversationId, founderId));
    }

    if (!log) {
      return NextResponse.json(
        {
          success: false,
          explanation: formatNoDecisionLogExplanation(idOrTurnId),
          error: 'No decision log entry found',
        },
        { status: 404 }
      );
    }

    const explanation = formatDecisionLogExplanation(log);
    return NextResponse.json({
      success: true,
      log,
      explanation,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
