import { NextRequest, NextResponse } from "next/server";
import { EpistemicPipeline } from "@/lib/server/epistemic/pipeline";
import { EpistemicClaimStore } from "@/lib/server/epistemic/claim-store";
import {
  EpistemicClaimInputSchema,
  ClaimVerificationInputSchema,
} from "@/lib/server/epistemic/schemas";

/**
 * PHASE 13: GOVERNED EPISTEMIC & MEMORY LIFECYCLE API
 * 
 * Supports:
 * - Ingesting raw evidence sources
 * - Submitting candidate claims from agents or founder
 * - Verifying claims against contradiction and constitutional policies
 * - Promoting verified claims to canonical facts
 * - Promoting canonical facts to durable company memory
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const view = searchParams.get('view') || 'claims'; // 'claims' | 'facts' | 'sources'
    const claimStore = EpistemicClaimStore.getInstance();

    if (view === 'facts') {
      const category = searchParams.get('category') as any;
      const subject = searchParams.get('subject') || undefined;
      const facts = await claimStore.listActiveFacts({ category, subject });
      return NextResponse.json({ success: true, count: facts.length, data: facts });
    }

    if (view === 'sources') {
      const sources = await claimStore.listSources();
      return NextResponse.json({ success: true, count: sources.length, data: sources });
    }

    // Default: claims
    const status = searchParams.get('status') as any;
    const category = searchParams.get('category') as any;
    const proposedBy = searchParams.get('proposedBy') as any;

    const claims = await claimStore.listClaims({ status, category, proposedBy });
    return NextResponse.json({ success: true, count: claims.length, data: claims });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'submit_claim';
    const pipeline = EpistemicPipeline.getInstance();

    if (action === 'submit_claim') {
      const parsed = EpistemicClaimInputSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: 'Validation failed', details: parsed.error.format() },
          { status: 400 }
        );
      }

      const claim = await pipeline.submitClaim(parsed.data);
      return NextResponse.json({ success: true, data: claim });
    }

    if (action === 'verify_claim') {
      const parsed = ClaimVerificationInputSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: 'Validation failed', details: parsed.error.format() },
          { status: 400 }
        );
      }

      const verification = await pipeline.verifyClaim(parsed.data.claimId, {
        role: parsed.data.reviewerRole,
        userId: parsed.data.reviewerId,
      });

      return NextResponse.json({ success: true, data: verification });
    }

    if (action === 'promote_to_fact') {
      const { claimId, promotedBy = 'founder' } = body;
      if (!claimId) {
        return NextResponse.json({ success: false, error: 'claimId is required' }, { status: 400 });
      }

      const fact = await pipeline.promoteClaimToFact(claimId, promotedBy);
      return NextResponse.json({ success: true, data: fact });
    }

    if (action === 'promote_to_memory') {
      const { factId, approvedAction, executionOutcome, category } = body;
      if (!factId) {
        return NextResponse.json({ success: false, error: 'factId is required' }, { status: 400 });
      }

      const memory = await pipeline.promoteFactToMemory({
        factId,
        approvedAction,
        executionOutcome,
        category,
      });

      return NextResponse.json({ success: true, data: memory });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported action: ${action}` },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
