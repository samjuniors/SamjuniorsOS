import { NextRequest, NextResponse } from "next/server";
import { AgentRunStore } from "@/lib/server/agents/run-store";
import { getAuthenticatedFounder } from "@/lib/server/auth/session";

/**
 * PHASE 13: PERSISTED AGENT RUNS API (FounderOS & OptimalEngine Pattern)
 * 
 * Provides transparent, durable audit log of all specialist executions.
 * Phase 3.4.1: Founder-authenticated via the canonical session primitive
 * (getAuthenticatedFounder) — fail-closed 401 for unauthenticated or
 * non-founder principals. Response contract unchanged for authorized callers.
 */
export async function GET(req: NextRequest) {
  try {
    // Canonical founder gate — same primitive as /api/orchestrate and the
    // other protected executive APIs. Fails closed (401) for any principal
    // that is not an authenticated Founder.
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        {
          error: "Unauthorized: Valid Founder session required to read agent execution runs",
          success: false,
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId') as any;
    const status = searchParams.get('status') as any;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;

    const runs = await AgentRunStore.getInstance().listRuns({
      agentId,
      status,
      limit,
    });

    return NextResponse.json({
      success: true,
      count: runs.length,
      runs,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to retrieve agent execution runs" },
      { status: 500 }
    );
  }
}
