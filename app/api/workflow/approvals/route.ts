import { NextRequest, NextResponse } from 'next/server';
import { SideEffectAuthorizationGate } from '@/lib/server/authorization/gate';
import { ApprovalStatus, SideEffectClassification } from '@/types/authorization';
import { InMemoryWorkflowStore } from '@/lib/server/workflow/store';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { reconcileFounderDecision } from '@/lib/server/workflow/decision-reconciler';

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
 *
 * Phase 3 (Command Center): after the gate durably records the Founder's
 * decision, the decision is RECONCILED into the bound workflow instance via the
 * existing WorkflowRuntime (decision-reconciler). Approvals resume execution
 * through the SideEffectAuthorizationGate (payload binding, single-use
 * consumption, idempotency, audit); rejections/revocations fail closed into
 * 'blocked' via the policy evaluator. This route adds no authorization logic —
 * identity and governance remain exclusively with getAuthenticatedFounder and
 * the gate.
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

    if (action === 'approve' || action === 'reject') {
      const record = await gate.decideApproval({
        approvalId,
        decision: action === 'approve' ? 'approved' : 'rejected',
        decidedBy: verifiedActor,
        reason: reason || (action === 'approve' ? 'Approved by Founder' : 'Rejected by Founder'),
        expiresAt,
        // The session identity was verified server-side above (401 for non-Founders).
        // The session email is intentionally NOT in the gate's literal allowlist —
        // pass the verified role through the gate's userContext contract instead of
        // maintaining a second founder-identity allowlist here.
        userContext: { role: session.role, userId: session.userId },
      });

      const reconciliation = await reconcileFounderDecision(record);
      return NextResponse.json({ success: true, record, reconciliation });
    } else if (action === 'revoke') {
      const record = await gate.revokeApproval({
        approvalId,
        revokedBy: verifiedActor,
        reason: reason || 'Revoked by Founder',
      });

      const reconciliation = await reconcileFounderDecision(record);
      return NextResponse.json({ success: true, record, reconciliation });
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
