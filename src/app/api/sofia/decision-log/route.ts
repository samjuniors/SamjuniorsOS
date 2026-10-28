import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { DecisionLogStore } from '@/lib/server/sophia/decision-log-store';
import { ConversationStore } from '@/lib/server/conversation/store';
import { SophiaRoute } from '@/lib/server/sophia/types';
import { DecisionOutcome } from '@/lib/server/sophia/decision-log';

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
  const route = (searchParams.get('route') as SophiaRoute) || undefined;
  const outcome = (searchParams.get('outcome') as DecisionOutcome) || undefined;
  const actor = searchParams.get('actor') || undefined;
  const turnId = searchParams.get('turnId') || undefined;
  const since = searchParams.get('since') || undefined;
  const until = searchParams.get('until') || undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  const offsetParam = searchParams.get('offset');
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  const decStore = DecisionLogStore.getInstance();
  const convStore = ConversationStore.getInstance();
  try {
    let logs = await decStore.queryDecisions({
      conversationId,
      route,
      outcome,
      actor,
      turnId,
      since,
      until,
      limit,
      offset,
    });

    if (logs.length === 0 && conversationId) {
      logs = await convStore.listDecisionLogs(conversationId, founderId, limit);
    }

    return NextResponse.json({ success: true, count: logs.length, logs });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedFounder(req);
  if (!session || session.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Unauthorized: Valid Founder session required' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const logId = body.id || body.logId || body.replayId;
    if (!logId || typeof logId !== 'string') {
      return NextResponse.json({ error: 'Valid logId is required for replay' }, { status: 400 });
    }

    const decStore = DecisionLogStore.getInstance();
    const replay = await decStore.replayDecision(logId);
    return NextResponse.json({ success: true, replay });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
