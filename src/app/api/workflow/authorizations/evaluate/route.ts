import { NextRequest, NextResponse } from 'next/server';
import { SideEffectAuthorizationGate } from '@/lib/server/authorization/gate';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { AuthorizationEvaluationRequest } from '@/types/authorization';

/**
 * POST /api/workflow/authorizations/evaluate
 * Dry-run preflight evaluation endpoint to query authorization decisions without executing.
 */
export async function POST(req: NextRequest) {
  try {
    // Defense-in-depth founder gate on top of the /api/workflow middleware
    // gate — the company's authorization policy is not public information.
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required' },
        { status: 401 }
      );
    }

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
