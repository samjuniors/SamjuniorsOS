import { NextRequest, NextResponse } from "next/server";
import { AgentRunStore } from "@/lib/server/agents/run-store";

/**
 * PHASE 13: PERSISTED AGENT RUNS API (FounderOS & OptimalEngine Pattern)
 * 
 * Provides transparent, durable audit log of all specialist executions.
 */
export async function GET(req: NextRequest) {
  try {
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
