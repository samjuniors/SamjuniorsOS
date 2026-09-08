import { NextRequest, NextResponse } from "next/server";
import { MultiAgentOrchestrator } from "@/lib/server/orchestration/orchestrator";
import { getAuthenticatedFounder } from "@/lib/server/auth/session";
import { getIdempotencyStore } from "@/lib/server/idempotency/store";
import {
  normalizeClientSuppliedKey,
  IdempotencyPayloadMismatchError,
  OperationInProgressError,
  UnknownExternalResultError,
} from "@/lib/server/idempotency/state-machine";
import { computeApprovalPayloadHash } from "@/lib/server/authorization/payload-binding";

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
    const rawIdempotencyKey = req.headers.get('idempotency-key') || body.idempotencyKey;
    const { directive, agents = ["coo", "researcher", "pm", "finance"], autonomyLevel = "autonomous" } = body;

    if (!directive || typeof directive !== "string" || !directive.trim()) {
      return NextResponse.json({ error: "Directive is required and must be a non-empty string", success: false }, { status: 400 });
    }

    const idempotencyStore = getIdempotencyStore();
    let normalizedKey: string | undefined;

    if (rawIdempotencyKey) {
      normalizedKey = normalizeClientSuppliedKey(rawIdempotencyKey, 'orchestrate');
      const payloadHash = computeApprovalPayloadHash(
        'Orchestrate Directive',
        undefined,
        {
          directive: directive.trim(),
          agents,
          autonomyLevel,
        }
      );

      try {
        const claimResult = await idempotencyStore.claim({
          key: normalizedKey,
          actionName: 'Orchestrate Directive',
          payloadHash,
          executionRef: `req-${Date.now()}`,
        });

        if (claimResult.state === 'completed') {
          return NextResponse.json(claimResult.record.response, {
            status: 200,
            headers: { 'X-Idempotent-Replay': 'true' },
          });
        }

        if (claimResult.state === 'in_progress') {
          return NextResponse.json(
            {
              error: `Operation with idempotency key '${normalizedKey}' is already in progress. Concurrent execution rejected.`,
              success: false,
            },
            { status: 409 }
          );
        }

        if (claimResult.state === 'unknown') {
          return NextResponse.json(
            {
              error: `Operation with idempotency key '${normalizedKey}' has an ambiguous prior state. Please inspect before retrying.`,
              success: false,
            },
            { status: 409 }
          );
        }
      } catch (claimErr: any) {
        if (claimErr instanceof IdempotencyPayloadMismatchError) {
          return NextResponse.json(
            {
              error: claimErr.message,
              success: false,
            },
            { status: 422 }
          );
        }
        throw claimErr;
      }
    }

    const orchestrator = new MultiAgentOrchestrator();
    let runResult;
    try {
      runResult = await orchestrator.orchestrateDirective({
        directive: directive.trim(),
        agents,
        autonomyLevel,
      });
    } catch (execErr: any) {
      if (normalizedKey) {
        await idempotencyStore.fail(normalizedKey, execErr.message || 'Orchestration execution failed');
      }
      throw execErr;
    }

    const responseBody = {
      success: runResult.status !== 'failed' || runResult.liveAi === false,
      data: runResult,
      liveAi: runResult.liveAi ?? false,
      executionMode: runResult.executionSummary?.executionMode || 'multi_agent_orchestrated',
      workflowInstanceId: runResult.workflowInstanceId,
    };

    if (normalizedKey) {
      await idempotencyStore.complete(normalizedKey, responseBody);
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
