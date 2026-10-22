import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { SafeModeManager } from '@/lib/server/sophia/stop-control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedFounder(req);
  if (!session || session.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Unauthorized: Valid Founder session required' }, { status: 401 });
  }

  const founderId =
    (process.env.NODE_ENV !== 'production' && (req.headers.get('x-founder-id') || req.headers.get('x-samjuniors-user-id'))) ||
    session.userId;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty body is acceptable for stop trigger
  }

  try {
    const result = await SafeModeManager.getInstance().triggerStop({
      source: body.source || 'panel',
      reason: body.reason || 'Founder initiated stop via panel',
      founderId,
    });

    return NextResponse.json({
      ...result,
      message: 'System frozen under Safe Mode. Resuming requires explicit Founder confirmation.',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedFounder(req);
  if (!session || session.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Unauthorized: Valid Founder session required' }, { status: 401 });
  }

  const status = SafeModeManager.getInstance().getFreezeStatus();
  return NextResponse.json({ success: true, status });
}
