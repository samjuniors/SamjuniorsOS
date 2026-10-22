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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.confirmed) {
    return NextResponse.json(
      { error: 'Explicit confirmation (confirmed: true) is required to resume from Safe Mode.' },
      { status: 400 }
    );
  }

  try {
    const result = await SafeModeManager.getInstance().confirmResume({
      founderId,
      confirmed: true,
      reason: body.reason || 'Founder confirmed resumption via panel',
    });

    return NextResponse.json({
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
