import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { SpendSettingsManager } from '@/lib/server/sophia/spend-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedFounder(req);
  if (!session || session.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Unauthorized: Valid Founder session required' }, { status: 401 });
  }

  const manager = SpendSettingsManager.getInstance();
  const settings = manager.getSettings();
  const autonomousCheck = manager.canExecuteAutonomousSpend();
  const interactiveCheck = manager.canExecuteInteractiveSpend();
  const auditHistory = manager.getSpendAuditHistory();

  return NextResponse.json({
    success: true,
    settings,
    canRunAutonomous: autonomousCheck.allowed,
    autonomousStatusReason: autonomousCheck.reason || null,
    autonomousStatusMessage: autonomousCheck.message || null,
    isCapReached: !interactiveCheck.allowed,
    auditHistory,
  });
}

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedFounder(req);
  if (!session || session.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Unauthorized: Valid Founder session required' }, { status: 401 });
  }

  const founderId =
    (process.env.NODE_ENV !== 'production' && (req.headers.get('x-founder-id') || req.headers.get('x-samjuniors-user-id'))) ||
    session.userId;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  if (body.spendCap !== null && body.spendCap !== undefined) {
    const num = Number(body.spendCap);
    if (isNaN(num) || num < 0) {
      return NextResponse.json({ error: 'spendCap must be a non-negative number or null' }, { status: 400 });
    }
  }

  try {
    const updated = await SpendSettingsManager.getInstance().updateSpendCap({
      newCapUsd: body.spendCap !== undefined ? (body.spendCap === null ? null : Number(body.spendCap)) : null,
      founderId,
      reason: body.reason,
    });

    return NextResponse.json({
      success: true,
      settings: updated,
      message: updated.dailySpendCapUsd !== null
        ? `Daily model spend cap set to $${updated.dailySpendCapUsd.toFixed(2)} USD.`
        : 'Daily model spend cap cleared. Autonomous model spend is disabled.',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
