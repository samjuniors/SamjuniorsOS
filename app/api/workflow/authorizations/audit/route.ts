import { NextRequest, NextResponse } from 'next/server';
import { SideEffectAuthorizationGate } from '@/lib/server/authorization/gate';
import { SideEffectClassification, AuthorizationEffect } from '@/types/authorization';

/**
 * GET /api/workflow/authorizations/audit
 * Immutable audit trail inspector for Founder and governance observers.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workflowInstanceId = searchParams.get('workflowInstanceId');
    const stepId = searchParams.get('stepId');
    const employeeRole = searchParams.get('employeeRole');
    const classification = searchParams.get('classification') as SideEffectClassification | null;
    const decision = searchParams.get('decision') as AuthorizationEffect | null;
    const executedOnly = searchParams.get('executedOnly') === 'true';

    const gate = SideEffectAuthorizationGate.getInstance();

    const audits = await gate.listAudits({
      workflowInstanceId: workflowInstanceId || undefined,
      stepId: stepId || undefined,
      employeeRole: employeeRole || undefined,
      classification: classification || undefined,
      decision: decision || undefined,
      executedOnly,
    });

    return NextResponse.json({
      totalCount: audits.length,
      audits,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch audit trail' }, { status: 500 });
  }
}
