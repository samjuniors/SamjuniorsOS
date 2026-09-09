import { NextRequest, NextResponse } from 'next/server';
import { SideEffectAuthorizationGate } from '@/lib/server/authorization/gate';
import { AuthorizationEvaluationRequest } from '@/types/authorization';

/**
 * POST /api/workflow/authorizations/evaluate
 * Dry-run preflight evaluation endpoint to query authorization decisions without executing.
 */
export async function POST(req: NextRequest) {
  try {
    const body: AuthorizationEvaluationRequest = await req.json();

    if (!body.employeeRole || !body.classification || !body.actionName) {
      return NextResponse.json(
        { error: 'Missing required parameters: employeeRole, classification, actionName' },
        { status: 400 }
      );
    }

    const gate = SideEffectAuthorizationGate.getInstance();
    const decision = await gate.evaluateAuthorization(body);

    return NextResponse.json({ decision });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to evaluate authorization' }, { status: 500 });
  }
}
