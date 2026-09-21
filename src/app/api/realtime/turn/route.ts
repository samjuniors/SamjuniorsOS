import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { getRealtimeProvider, listRealtimeProviders } from '@/lib/server/live/providers';
import { MultiAgentOrchestrator } from '@/lib/server/orchestration/orchestrator';

export const dynamic = 'force-dynamic';

/**
 * POST /api/realtime/turn
 *
 * Executes a realtime voice/vision turn in Sophia Realtime Lab.
 * Enforces server-side Founder authentication.
 *
 * If the utterance is classified as a directive (e.g. "Research our competitors"),
 * it dispatches into the standard MultiAgentOrchestrator council, honoring all
 * deterministic verifications and SideEffectAuthorizationGate approval locks.
 */
export async function POST(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required', success: false },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      message,
      sessionId = `sess-${Date.now()}`,
      providerId = 'gemini',
      cameraSnapshot,
      conversationHistory = [],
    } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'Message is required and must be non-empty', success: false },
        { status: 400 }
      );
    }

    const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const trimmedMessage = message.trim();

    // Determine if utterance is a company directive requiring Council orchestration
    const isDirective =
      /^(please\s+)?(research|plan|audit|review|analyze|calculate|build|execute|model|orchestrate|run|start)\b/i.test(
        trimmedMessage
      ) || trimmedMessage.length > 80;

    if (isDirective) {
      // Execute through authoritative MultiAgentOrchestrator council
      const orchestrator = new MultiAgentOrchestrator();
      const run = await orchestrator.orchestrate(trimmedMessage, {
        autonomyLevel: 'autonomous',
        agents: ['coo', 'researcher', 'pm', 'finance'],
      });

      const recommendation = run.executiveResult?.recommendation || 'Directive executed by executive council.';
      const approvalsCount = run.plan.filter((p) => p.status === 'awaiting_approval').length;

      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'council-orchestrator',
        modelUsed: 'executive-council-v1',
        isDirective: true,
        reply: `[Executive Council] ${run.title}: ${recommendation}`,
        orchestrationRunId: run.id,
        approvalsPending: approvalsCount,
        durationMs: run.durationMs,
        detectedIntent: 'directive',
      });
    }

    // Standard Realtime Provider Turn (Gemini / Provider-neutral)
    const provider = getRealtimeProvider(providerId);
    const result = await provider.executeTurn({
      turnId,
      sessionId,
      founderMessage: trimmedMessage,
      conversationHistory,
      cameraSnapshot,
    });

    return NextResponse.json({
      success: true,
      turnId: result.turnId,
      sessionId,
      providerId: result.providerId,
      modelUsed: result.modelUsed,
      isDirective: false,
      reply: result.fullText,
      durationMs: result.durationMs,
      detectedIntent: result.detectedIntent || 'conversation',
      costEstimateUsd: result.costEstimateUsd,
    });
  } catch (err: any) {
    console.error('[RealtimeTurnRoute] Turn failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to process realtime turn',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/realtime/turn
 * Returns available realtime providers and status.
 */
export async function GET(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required', success: false },
        { status: 401 }
      );
    }

    const available = listRealtimeProviders();
    return NextResponse.json({
      success: true,
      providers: available,
      defaultProvider: 'gemini',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
