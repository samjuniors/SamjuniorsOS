import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { DecisionStore } from '@/lib/server/decision/store';
import { DecisionLifecycleService } from '@/lib/server/decision/lifecycle';
import type { DecisionCategory, DecisionImpact, DecisionReversibility } from '@/types/decision';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required to access Decisions', success: false },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const category = searchParams.get('category');

    const store = DecisionStore.getInstance();
    const decisions = await store.list({
      status: status as any,
      category: category as any,
    });

    return NextResponse.json({
      success: true,
      decisions,
      totalCount: decisions.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to list decisions', success: false },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required to register decisions', success: false },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      creationRequestId,
      title,
      problemStatement,
      proposedAction,
      category = 'strategic',
      impact = 'medium',
      reversibility = 'reversible',
      options,
      recommendation,
      proposer = 'coo',
    } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'title is required and must be a string', success: false },
        { status: 400 }
      );
    }

    const service = DecisionLifecycleService.getInstance();
    const actor = founder.email || founder.userId || 'founder';
    const reqId = creationRequestId || `dec-req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const record = await service.proposeDecision({
      creationRequestId: reqId,
      title,
      problemStatement: problemStatement || title,
      proposedAction: proposedAction || (options ? `Options: ${JSON.stringify(options)}` : title),
      category: category as DecisionCategory,
      proposer,
      impact: impact as DecisionImpact,
      reversibility: reversibility as DecisionReversibility,
      uncertainty: {
        level: 'low',
        description: recommendation || 'Evaluated by Sophia Vance / Executive Council',
      },
      evidenceFactIds: [],
    });

    return NextResponse.json({
      success: true,
      record,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to register decision', success: false },
      { status: 500 }
    );
  }
}
