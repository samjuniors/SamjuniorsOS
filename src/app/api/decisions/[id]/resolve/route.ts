import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { DecisionStore } from '@/lib/server/decision/store';
import { DecisionLifecycleService } from '@/lib/server/decision/lifecycle';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required to resolve decisions', success: false },
        { status: 401 }
      );
    }

    const decisionId = params.id;
    const body = await req.json();
    const { selectedOption, reason, outcomeSummary } = body;

    const store = DecisionStore.getInstance();
    const current = await store.get(decisionId);
    if (!current) {
      return NextResponse.json(
        { error: `Decision not found: ${decisionId}`, success: false },
        { status: 404 }
      );
    }

    const service = DecisionLifecycleService.getInstance();
    const actor = founder.email || founder.userId || 'founder';
    const userContext = { role: 'FOUNDER', userId: actor };

    // Advance lifecycle cleanly with strict optimistic concurrency control
    let currentRecord = current;
    if (currentRecord.status === 'proposed') {
      currentRecord = await service.submitForApproval({
        decisionId,
        expectedStateVersion: currentRecord.stateVersion,
        actor,
        reason: 'Submitted for Founder decision',
        userContext,
      });
    }

    if (currentRecord.status === 'under_review') {
      currentRecord = await service.submitForApproval({
        decisionId,
        expectedStateVersion: currentRecord.stateVersion,
        actor,
        reason: 'Review complete, submitted for Founder sign-off',
        userContext,
      });
    }

    if (currentRecord.status === 'pending_approval') {
      currentRecord = await service.approveDecision({
        decisionId,
        expectedStateVersion: currentRecord.stateVersion,
        actor,
        reason: reason || `Selected option: ${selectedOption || 'Approved'}`,
        userContext,
        allowStaleEvidence: true,
      });
    }

    // Now start execution and resolve with outcome
    if (currentRecord.status === 'approved') {
      currentRecord = await service.startExecution({
        decisionId,
        expectedStateVersion: currentRecord.stateVersion,
        actor,
        reason: 'Execution started per founder decision',
        userContext,
      });
    }

    if (currentRecord.status === 'executing' || currentRecord.status === 'intervention_required') {
      currentRecord = await service.resolveDecision({
        decisionId,
        expectedStateVersion: currentRecord.stateVersion,
        actor,
        reason: reason || `Resolved by Founder with option ${selectedOption || 'default'}`,
        userContext,
        outcome: {
          outcomeSummary: outcomeSummary || `Founder selected option ${selectedOption || 'Approved'}: ${current.title}`,
          resolvedAt: new Date().toISOString(),
          resolvedBy: actor,
          notes: `Founder selected option ${selectedOption || 'Approved'}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      record: currentRecord,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to resolve decision', success: false },
      { status: 500 }
    );
  }
}
