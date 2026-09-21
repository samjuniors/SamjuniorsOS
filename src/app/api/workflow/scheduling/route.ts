import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { InMemoryScheduledWorkStore } from '../../../../lib/server/workflow/scheduler-store';
import { InMemoryWorkflowStore } from '../../../../lib/server/workflow/store';
import { ScheduledWorkStatus, SchedulerHeartbeatRecord, SchedulerTriggerSource } from '../../../../types/scheduling';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';

/**
 * Automation scheduling API (Phase 4.4A).
 *
 * POST — the AUTOMATION HEARTBEAT endpoint. Invoked by the external heartbeat
 * service (mini-services/scheduler-heartbeat) or manually by the Founder.
 * It evaluates due ScheduledWorkItems through the EXISTING WorkflowScheduler:
 * distributed leases, occurrence idempotency, wake-time re-authorization and
 * the side-effect approval gate all remain enforced inside the scheduler.
 *
 * Authentication (fail-closed):
 *   - Founder session (getAuthenticatedFounder), OR
 *   - x-cron-secret header matching CRON_TRIGGER_SECRET via CONSTANT-TIME
 *     comparison. When CRON_TRIGGER_SECRET is unset the cron path is dead —
 *     no unauthenticated scheduler execution is possible.
 *   - In production the dev-founder path is prohibited by session.ts, so the
 *     cron secret is the ONLY production heartbeat key.
 */

/** Constant-time secret comparison. Length-mismatch returns false immediately
 *  (length is not secret); equal lengths are compared without short-circuit. */
function cronSecretMatches(presented: string | null, expected: string | undefined): boolean {
  if (!presented || !expected) return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  try {
    // Founder-gated read (defense-in-depth on top of the executive-route
    // middleware gate — scheduling internals are Founder-only).
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Founder session required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as ScheduledWorkStatus | null;
    const workflowInstanceId = searchParams.get('workflowInstanceId');
    const stepId = searchParams.get('stepId');
    const dueOnly = searchParams.get('dueOnly') === 'true';
    const asOfTime = searchParams.get('asOfTime') || new Date().toISOString();

    const schedulerStore = InMemoryScheduledWorkStore.getInstance();
    const workflowStore = InMemoryWorkflowStore.getInstance();

    let items = dueOnly
      ? await schedulerStore.listDue(asOfTime)
      : await schedulerStore.list({
          status: status || undefined,
          workflowInstanceId: workflowInstanceId || undefined,
          stepId: stepId || undefined,
        });

    // Enrich with workflow objective and step info for Founder inspection
    const enriched = await Promise.all(
      items.map(async (item) => {
        const workflow = await workflowStore.getInstance(item.workflowInstanceId);
        const stepState = workflow?.stepStates[item.stepId];
        return {
          ...item,
          workflowObjective: workflow?.objective,
          workflowStatus: workflow?.status,
          stepStatus: stepState?.status,
          stepAssignedRole: stepState?.assignedRole,
          stepSkill: stepState?.skill,
          stepApprovalState: stepState?.approvalState,
        };
      })
    );

    return NextResponse.json({
      asOfTime,
      totalCount: enriched.length,
      schedules: enriched,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch schedules' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const session = await getAuthenticatedFounder(req);
    // Allow if authenticated Founder session, or authorized internal cron trigger
    const cronSecret = process.env.CRON_TRIGGER_SECRET;
    const cronHeader = req.headers.get('x-cron-secret');
    const isAuthorizedCron = cronSecretMatches(cronHeader, cronSecret);

    if (!session && !isAuthorizedCron) {
      return NextResponse.json(
        { error: 'Unauthorized: Founder session or valid cron secret required' },
        { status: 401 }
      );
    }

    // Provenance of this evaluation pass (honest trigger attribution).
    const triggerSource: SchedulerTriggerSource = isAuthorizedCron ? 'cron' : 'founder';

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const asOfTime = body.asOfTime || undefined;
    const batchLimit = typeof body.batchLimit === 'number' ? body.batchLimit : 50;

    const { WorkflowScheduler } = await import('../../../../lib/server/workflow/scheduler');
    const scheduler = new WorkflowScheduler();

    const result = await scheduler.evaluateDueWork(asOfTime, batchLimit);

    // Phase 4.4A — persist the evaluation pass in the append-only heartbeat
    // log (same scheduling authority) so the founder-facing status projection
    // can report the last evaluation HONESTLY instead of fabricating it.
    const heartbeat: SchedulerHeartbeatRecord = {
      id: `hb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      evaluatedAt: new Date().toISOString(),
      triggerSource,
      workerId: scheduler.getWorkerId(),
      asOfTime: asOfTime || new Date().toISOString(),
      processedCount: result.processedCount,
      executedCount: result.results.filter((r) => r.status === 'completed').length,
      skippedCount: result.results.filter((r) => r.status === 'skipped').length,
      failedCount: result.results.filter((r) => r.status === 'failed').length,
      awaitingApprovalCount: result.results.filter((r) => r.status === 'awaiting_approval').length,
      cancelledCount: result.results.filter((r) => r.status === 'cancelled').length,
      durationMs: Date.now() - startedAt,
      results: result.results,
    };
    try {
      await InMemoryScheduledWorkStore.getInstance().recordHeartbeat(heartbeat);
    } catch {
      // The evaluation itself already ran authoritatively; heartbeat logging
      // failure must not fail the invocation — but it IS surfaced honestly:
      // the status projection will simply show an older last evaluation.
    }

    return NextResponse.json({
      success: true,
      workerId: scheduler.getWorkerId(),
      triggerSource,
      heartbeatId: heartbeat.id,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to evaluate due work' },
      { status: 500 }
    );
  }
}
