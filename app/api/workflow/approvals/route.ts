import { NextRequest, NextResponse } from 'next/server';
import { SideEffectAuthorizationGate } from '@/lib/server/authorization/gate';
import { ApprovalStatus, SideEffectClassification } from '@/types/authorization';
import { InMemoryWorkflowStore } from '@/lib/server/workflow/store';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';

/**
 * GET /api/workflow/approvals
 * Lists Founder Approval records with optional filtering and workflow metadata enrichment.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as ApprovalStatus | null;
    const workflowInstanceId = searchParams.get('workflowInstanceId');
    const stepId = searchParams.get('stepId');
    const employeeRole = searchParams.get('employeeRole');
    const classification = searchParams.get('classification') as SideEffectClassification | null;

    const gate = SideEffectAuthorizationGate.getInstance();
    const workflowStore = InMemoryWorkflowStore.getInstance();

    const approvals = await gate.listApprovals({
      status: status || undefined,
      workflowInstanceId: workflowInstanceId || undefined,
      stepId: stepId || undefined,
      employeeRole: employeeRole || undefined,
      classification: classification || undefined,
    });

    // Enrich with workflow objective & status
    const enriched = await Promise.all(
      approvals.map(async (appr) => {
        const wf = await workflowStore.getInstance(appr.workflowInstanceId);
        const stepState = wf?.stepStates[appr.stepId];
        return {
          ...appr,
          workflowObjective: wf?.objective,
          workflowStatus: wf?.status,
          stepStatus: stepState?.status,
          stepSkill: stepState?.skill,
        };
      })
    );

    return NextResponse.json({
      totalCount: enriched.length,
      approvals: enriched,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list approvals' }, { status: 500 });
  }
}

/**
 * POST /api/workflow/approvals
 * Founder Decision & Governance Action Handler.
 * Allows ONLY the Founder to approve, reject, or revoke side-effect requests.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, approvalId, reason, expiresAt } = body;

    if (!approvalId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: approvalId and action (approve | reject | revoke)' },
        { status: 400 }
      );
    }

    // SECURITY ENFORCEMENT (Audit 07/11): Validate cryptographic session; reject unverified identity spoofing
    const session = await getAuthenticatedFounder(req);
    if (!session || session.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Cryptographically verified Founder session required.' },
        { status: 401 }
      );
    }

    const verifiedActor = session.email || session.userId || 'founder';
    const gate = SideEffectAuthorizationGate.getInstance();

    if (action === 'approve') {
      const record = await gate.decideApproval({
        approvalId,
        decision: 'approved',
        decidedBy: verifiedActor,
        reason: reason || 'Approved by Founder',
        expiresAt,
      });
      return NextResponse.json({ success: true, record });
    } else if (action === 'reject') {
      const record = await gate.decideApproval({
        approvalId,
        decision: 'rejected',
        decidedBy: verifiedActor,
        reason: reason || 'Rejected by Founder',
      });
      return NextResponse.json({ success: true, record });
    } else if (action === 'revoke') {
      const record = await gate.revokeApproval({
        approvalId,
        revokedBy: verifiedActor,
        reason: reason || 'Revoked by Founder',
      });
      return NextResponse.json({ success: true, record });
    } else {
      return NextResponse.json(
        { error: `Invalid action "${action}". Must be "approve", "reject", or "revoke".` },
        { status: 400 }
      );
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to process approval action' }, { status: 500 });
  }
}
