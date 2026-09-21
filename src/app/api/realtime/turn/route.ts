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
      audioRecording,
      conversationHistory = [],
    } = body;

    // Validate Message
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    if (trimmedMessage.length > 10000) {
      return NextResponse.json(
        { error: 'Message exceeds maximum allowed length of 10,000 characters', success: false },
        { status: 400 }
      );
    }

    if (!trimmedMessage && !audioRecording?.base64Data) {
      return NextResponse.json(
        { error: 'Either message or audio recording is required', success: false },
        { status: 400 }
      );
    }

    // Validate Provider Selection (Prevent Provider Spoofing)
    const validProviders = listRealtimeProviders();
    const isRegistered = validProviders.some((p) => p.id === providerId);
    if (!isRegistered) {
      return NextResponse.json(
        {
          error: `Realtime provider '${providerId}' is not registered. Available: ${validProviders.map((p) => p.id).join(', ')}`,
          success: false,
        },
        { status: 400 }
      );
    }

    // Validate Camera Snapshot Payload & Size Bounds (Max 5MB)
    if (cameraSnapshot) {
      if (typeof cameraSnapshot.base64Data !== 'string') {
        return NextResponse.json(
          { error: 'cameraSnapshot.base64Data must be a valid base64 string', success: false },
          { status: 400 }
        );
      }
      if (cameraSnapshot.base64Data.length > 7000000) {
        return NextResponse.json(
          { error: 'cameraSnapshot payload exceeds maximum size limit (5MB)', success: false },
          { status: 413 }
        );
      }
      const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (cameraSnapshot.mimeType && !allowedImageTypes.includes(cameraSnapshot.mimeType)) {
        return NextResponse.json(
          { error: `Invalid cameraSnapshot mimeType '${cameraSnapshot.mimeType}'. Allowed: ${allowedImageTypes.join(', ')}`, success: false },
          { status: 400 }
        );
      }
    }

    // Validate Audio Recording Payload & Size Bounds (Max 10MB)
    if (audioRecording) {
      if (typeof audioRecording.base64Data !== 'string') {
        return NextResponse.json(
          { error: 'audioRecording.base64Data must be a valid base64 string', success: false },
          { status: 400 }
        );
      }
      if (audioRecording.base64Data.length > 14000000) {
        return NextResponse.json(
          { error: 'audioRecording payload exceeds maximum size limit (10MB)', success: false },
          { status: 413 }
        );
      }
      const allowedAudioTypes = ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/mpeg'];
      if (audioRecording.mimeType && !allowedAudioTypes.includes(audioRecording.mimeType)) {
        return NextResponse.json(
          { error: `Invalid audioRecording mimeType '${audioRecording.mimeType}'. Allowed: ${allowedAudioTypes.join(', ')}`, success: false },
          { status: 400 }
        );
      }
    }

    // Validate Conversation History Bounds
    if (conversationHistory && !Array.isArray(conversationHistory)) {
      return NextResponse.json(
        { error: 'conversationHistory must be an array', success: false },
        { status: 400 }
      );
    }
    if (Array.isArray(conversationHistory) && conversationHistory.length > 50) {
      return NextResponse.json(
        { error: 'conversationHistory exceeds maximum allowed limit of 50 items', success: false },
        { status: 400 }
      );
    }

    const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Determine if utterance is a company directive requiring Council orchestration
    const isDirective =
      trimmedMessage.length > 0 &&
      (/^(please\s+)?(research|plan|audit|review|analyze|calculate|build|execute|model|orchestrate|run|start|transfer|delete|drop|send|deploy|publish|create|remove|pay|hire|fire)\b/i.test(
        trimmedMessage
      ) || trimmedMessage.length > 80);

    if (isDirective) {
      const startTime = Date.now();
      // Execute through authoritative MultiAgentOrchestrator council
      const orchestrator = new MultiAgentOrchestrator();
      const run = await orchestrator.orchestrateDirective({
        directive: trimmedMessage,
        autonomyLevel: 'autonomous',
        agents: ['coo', 'researcher', 'pm', 'finance'],
      });
      const elapsed = Date.now() - startTime;

      const recommendation = run.executiveResult?.recommendation || 'Directive executed by executive council.';
      const approvalsCount = run.plan.filter((p) => p.status === 'requires_approval').length;

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
        durationMs: elapsed,
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
      audioRecording,
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
