import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { CompanyStateStore } from '@/lib/server/state/state-store';
import { SideEffectAuthorizationGate } from '@/lib/server/authorization/gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required to access Attention deck', success: false },
        { status: 401 }
      );
    }

    const stateStore = CompanyStateStore.getInstance();
    const storedItems = await stateStore.getAttentionItems();

    // Enrich with live pending approvals from gate
    const gate = SideEffectAuthorizationGate.getInstance();
    const pendingApprovals = await gate.listApprovals({ status: 'pending' });

    const approvalAttentionItems = pendingApprovals.map((appr) => ({
      id: `att-approval-${appr.id}`,
      type: 'approval_required' as const,
      title: appr.actionName,
      whatHappened: appr.target?.summary || appr.notes || `${appr.classification} awaiting sign-off`,
      whyItMatters: 'Consequential action paused at cryptographic authorization gate',
      recommendedAction: 'Review diff/payload and sign off in Approvals panel',
      authorAgentId: (appr.employeeRole || 'coo') as any,
      authorName: appr.employeeRole || 'System',
      founderActionRequired: true,
      status: 'pending' as const,
      timestamp: appr.requestedAt,
      approvalId: appr.id,
      payloadHash: appr.payloadHash,
    }));

    // Deduplicate any overlapping items
    const allItems = [...storedItems];
    for (const appItem of approvalAttentionItems) {
      if (!allItems.some((item) => (item as any).approvalId === appItem.approvalId || item.id === appItem.id)) {
        allItems.unshift(appItem as any);
      }
    }

    return NextResponse.json({
      success: true,
      items: allItems,
      totalCount: allItems.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve attention items', success: false },
      { status: 500 }
    );
  }
}
