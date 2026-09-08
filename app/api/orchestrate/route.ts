import { NextRequest, NextResponse } from "next/server";
import { MultiAgentOrchestrator } from "@/lib/server/orchestration/orchestrator";
import { getAuthenticatedFounder } from "@/lib/server/auth/session";

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

    return NextResponse.json({
      success: runResult.status !== 'failed' || runResult.liveAi === false,
      data: runResult,
      liveAi: runResult.liveAi ?? false,
      executionMode: runResult.executionSummary?.executionMode || 'multi_agent_orchestrated',
    });
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
