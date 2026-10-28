import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { SpendSettingsManager } from '@/lib/server/sophia/spend-settings';
import { AutonomyPolicyEngine } from '@/lib/server/authorization/autonomy-policy';
import { AutonomyActionClass, AutonomyLevel } from '@/types/autonomy';

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
  const autonomyRules = AutonomyPolicyEngine.getInstance().getAllRules();

  return NextResponse.json({
    success: true,
    settings,
    canRunAutonomous: autonomousCheck.allowed,
    autonomousStatusReason: autonomousCheck.reason || null,
    autonomousStatusMessage: autonomousCheck.message || null,
    isCapReached: !interactiveCheck.allowed,
    auditHistory,
    autonomyRules,
  });
}

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedFounder(req);
  if (!session || session.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Unauthorized: Valid Founder session required' }, { status: 401 });
  }

  const founderId =
    (process.env.NODE_ENV !== 'production' && (req.headers.get('x-founder-id') || req.headers.get('x-samjuniors-user-id'))) ||
    session.userId || 'founder';

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  // Handle Spend Cap update
  if (body.spendCap !== undefined) {
    if (body.spendCap !== null) {
      const num = Number(body.spendCap);
      if (isNaN(num) || num < 0) {
        return NextResponse.json({ error: 'spendCap must be a non-negative number or null' }, { status: 400 });
      }
    }

    try {
      const updated = await SpendSettingsManager.getInstance().updateSpendCap({
        newCapUsd: body.spendCap === null ? null : Number(body.spendCap),
        founderId,
        reason: body.reason,
      });

      return NextResponse.json({
        success: true,
        settings: updated,
        autonomyRules: AutonomyPolicyEngine.getInstance().getAllRules(),
        message: updated.dailySpendCapUsd !== null
          ? `Daily model spend cap set to $${updated.dailySpendCapUsd.toFixed(2)} USD.`
          : 'Daily model spend cap cleared. Autonomous model spend is disabled.',
      });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // Handle Autonomy Level update
  if (body.autonomyLevel !== undefined) {
    const { actionClass, newLevel, founderDecisionId, founderQuote, reason } = body.autonomyLevel;
    if (!actionClass || !newLevel) {
      return NextResponse.json({ error: 'actionClass and newLevel are required for autonomy level updates' }, { status: 400 });
    }

    try {
      const updatedRule = await AutonomyPolicyEngine.getInstance().setAutonomyLevel({
        founderId,
        actionClass: actionClass as AutonomyActionClass,
        newLevel: newLevel as AutonomyLevel,
        founderDecisionId: founderDecisionId || `decision-autonomy-${Date.now()}`,
        founderQuote: founderQuote || `Founder adjusted autonomy level for ${actionClass} to ${newLevel}.`,
        reason: reason || body.reason || `Adjusted autonomy level in Settings`,
      });

      return NextResponse.json({
        success: true,
        rule: updatedRule,
        autonomyRules: AutonomyPolicyEngine.getInstance().getAllRules(),
        message: `Autonomy level for ${actionClass} set to ${newLevel}.`,
      });
    } catch (err: any) {
      const statusCode = err.name === 'UnauthorizedAutonomyMutationError' ? 403 : 400;
      return NextResponse.json({ success: false, error: err.message }, { status: statusCode });
    }
  }

  return NextResponse.json({ error: 'Missing spendCap or autonomyLevel in request body' }, { status: 400 });
}
