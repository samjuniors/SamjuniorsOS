import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { VoiceLatencyTracker } from '@/lib/server/sophia/voice-latency';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedFounder(req);
  if (!session || session.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Unauthorized: Valid Founder session required' }, { status: 401 });
  }

  const tracker = VoiceLatencyTracker.getInstance();
  const summary = tracker.getSummary();
  const records = tracker.getRecords();

  return NextResponse.json({
    success: true,
    summary,
    records,
  });
}

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedFounder(req);
  if (!session || session.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Unauthorized: Valid Founder session required' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const tracker = VoiceLatencyTracker.getInstance();

  if (body.action === 'clear') {
    tracker.clear();
    return NextResponse.json({ success: true, cleared: true });
  }

  if (body.record && body.record.turnId) {
    const saved = tracker.recordTurn(body.record);
    return NextResponse.json({ success: true, record: saved });
  }

  return NextResponse.json({ error: 'Missing turn record or action' }, { status: 400 });
}
