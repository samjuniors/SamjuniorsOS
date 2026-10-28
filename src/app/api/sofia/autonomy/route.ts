import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { AutonomyPolicyEngine } from '@/lib/server/authorization/autonomy-policy';
import { AutonomyActionClass, AutonomyLevel } from '@/types/autonomy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedFounder(req);
  if (!session || session.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Unauthorized: Valid Founder session required' }, { status: 401 });
  }

  const rules = AutonomyPolicyEngine.getInstance().getAllRules();
  return NextResponse.json({
    success: true,
    autonomyRules: rules,
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

  const { actionClass, newLevel, founderDecisionId, founderQuote, reason } = body;
  if (!actionClass || !newLevel) {
    return NextResponse.json({ error: 'actionClass and newLevel are required' }, { status: 400 });
  }

  try {
    const updatedRule = await AutonomyPolicyEngine.getInstance().setAutonomyLevel({
      founderId,
      actionClass: actionClass as AutonomyActionClass,
      newLevel: newLevel as AutonomyLevel,
      founderDecisionId: founderDecisionId || `decision-autonomy-${Date.now()}`,
      founderQuote: founderQuote || `Founder adjusted autonomy level for ${actionClass} to ${newLevel}.`,
      reason: reason || `Adjusted autonomy level via Autonomy Settings API`,
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
