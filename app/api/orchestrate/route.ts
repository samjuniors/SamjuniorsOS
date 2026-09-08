import { NextRequest, NextResponse } from "next/server";
import { MultiAgentOrchestrator } from "@/lib/server/orchestration/orchestrator";
import { getAuthenticatedFounder } from "@/lib/server/auth/session";

const idempotencyCache = new Map<string, { status: number; body: any; timestamp: number }>();

export async function POST(req: NextRequest) {
  try {
    // Enforce strict Founder authentication
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        {
          error: "Unauthorized: Valid Founder session required to orchestrate executive directives",
          success: false,
        },
        { status: 401 }
      );
    }

    const body = await req.json();
    const idempotencyKey = req.headers.get('idempotency-key') || body.idempotencyKey;
    if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
      const cached = idempotencyCache.get(idempotencyKey)!;
      if (Date.now() - cached.timestamp < 60000) {
        return NextResponse.json(cached.body, {
          status: cached.status,
          headers: { 'X-Idempotent-Replay': 'true' },
        });
      }
    }

    const { directive, agents = ["coo", "researcher", "pm", "finance"], autonomyLevel = "autonomous" } = body;

    if (!directive || typeof directive !== "string" || !directive.trim()) {
      return NextResponse.json({ error: "Directive is required and must be a non-empty string", success: false }, { status: 400 });
    }

    const orchestrator = new MultiAgentOrchestrator();
    const runResult = await orchestrator.orchestrateDirective({
      directive: directive.trim(),
      agents,
      autonomyLevel,
    });

    const responseBody = {
      success: runResult.status !== 'failed' || runResult.liveAi === false,
      data: runResult,
      liveAi: runResult.liveAi ?? false,
      executionMode: runResult.executionSummary?.executionMode || 'multi_agent_orchestrated',
    };

    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, {
        status: 200,
        body: responseBody,
        timestamp: Date.now(),
      });
    }

    return NextResponse.json(responseBody);
  } catch (error: any) {
    console.error("[Multi-Agent Orchestration Error]:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to orchestrate directive through multi-agent architecture",
        success: false,
      },
      { status: 500 }
    );
  }
}
