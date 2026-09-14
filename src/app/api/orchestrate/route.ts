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
import {
  createScheduledDirective,
  DirectiveScheduleValidationError,
} from "@/lib/server/workflow/directive-schedule";

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
    const { directive, agents = ["coo", "researcher", "pm", "finance"], autonomyLevel = "autonomous", schedule } = body;

    if (!directive || typeof directive !== "string" || !directive.trim()) {
      return NextResponse.json({ error: "Directive is required and must be a non-empty string", success: false }, { status: 400 });
    }

    // Phase 4.4B — the payload hash binds the SCHEDULE into the idempotency
    // claim so a retried scheduled-creation with the same key replays instead
    // of double-creating, and a same-key retry with a different schedule is
    // rejected as payload tampering (existing 422 behavior).
    const isScheduledRequest = schedule !== undefined;
    const payloadHash = computeApprovalPayloadHash(
      'Orchestrate Directive',
      undefined,
      isScheduledRequest
        ? { directive: directive.trim(), schedule }
        : { directive: directive.trim(), agents, autonomyLevel }
    );

    const idempotencyStore = getIdempotencyStore();
    let normalizedKey: string | undefined;

    if (rawIdempotencyKey) {
      normalizedKey = normalizeClientSuppliedKey(rawIdempotencyKey, 'orchestrate');

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

    // ------------------------------------------------------------- Phase 4.4B
    // Scheduled-directive branch: the SAME founder directive path, made
    // durable. Instead of running the council immediately, the directive is
    // persisted as an authoritative WorkflowDefinition + WorkflowInstance +
    // ScheduledWorkItem and executed by the EXISTING scheduler heartbeat
    // (leases, occurrence idempotency, wake-time re-authorization, approval
    // blocking). There is intentionally NO cron-secret path here — only an
    // authenticated Founder session may create schedules.
    if (isScheduledRequest) {
      if (schedule === null || typeof schedule !== 'object' || Array.isArray(schedule)) {
        return NextResponse.json({ error: "schedule must be an object when provided", success: false }, { status: 400 });
      }

      let created;
      try {
        created = await createScheduledDirective(
          {
            directive: directive.trim(),
            scheduleType: schedule.scheduleType,
            executeAt: schedule.executeAt,
            intervalUnit: schedule.intervalUnit,
            intervalValue: schedule.intervalValue,
            maxOccurrences: schedule.maxOccurrences,
            endDate: schedule.endDate,
            requiresApproval: schedule.requiresApproval,
          },
          {
            // Phase 4.4B.1 — authoritative founder attribution: the
            // AUTHENTICATED session identity (never a client-supplied payload
            // field) populates WorkflowInstance.initiatedById.
            founder: { userId: founder.userId },
          }
        );
      } catch (err: any) {
        if (err instanceof DirectiveScheduleValidationError) {
          return NextResponse.json({ error: err.message, success: false }, { status: err.statusCode });
        }
        if (normalizedKey) {
          await idempotencyStore.fail(normalizedKey, err.message || 'Scheduled directive creation failed').catch(() => {});
        }
        throw err;
      }

      const responseBody = {
        success: true,
        scheduled: true,
        data: {
          schedule: created.schedule,
          workflowInstanceId: created.workflowInstanceId,
          workflowDefinition: {
            id: created.definition.id,
            name: created.definition.name,
            objective: created.definition.objective,
          },
          directive: directive.trim(),
        },
        message: `Directive scheduled. The automation heartbeat will execute it when due (next: ${created.schedule.executeAt}).`,
      };

      if (normalizedKey) {
        await idempotencyStore.complete(normalizedKey, responseBody);
      }

      return NextResponse.json(responseBody);
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
