import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { WorkflowScheduler } from '@/lib/server/workflow/scheduler';
import { InMemoryWorkflowStore } from '@/lib/server/workflow/store';

/**
 * Phase 4.4B — Automation schedule lifecycle actions.
 *
 * POST /api/workflow/scheduling/actions  { scheduleId, action, reason? }
 *   action: 'pause' | 'resume' | 'cancel'
 *
 * SECURITY (fail-closed):
 *   - Founder session ONLY. There is deliberately NO cron-secret path here:
 *     the heartbeat key authorizes due-work EVALUATION, never schedule
 *     lifecycle mutations. An unauthenticated caller gets 401 even when
 *     CRON_TRIGGER_SECRET is configured.
 *   - The client can never supply occurrence ids, execution results,
 *     approval records or authorization decisions — only a schedule id and a
 *     lifecycle verb. Every state change is computed server-side through the
 *     existing scheduler authority and persisted in the same stores.
 *
 * Semantics:
 *   - pause:  item leaves due-work evaluation (listDue only returns
 *             'scheduled'); resumable; NOT terminal.
 *   - resume: restores 'scheduled' exactly as persisted — an overdue next
 *             occurrence executes on the next heartbeat (honest catch-up).
 *   - cancel: terminal, existing store semantics with founder provenance.
 */
const ACTIONS = new Set(['pause', 'resume', 'cancel']);

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session || session.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Founder session required to manage automation schedules' },
        { status: 401 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { scheduleId, action, reason } = body ?? {};
    if (!scheduleId || typeof scheduleId !== 'string') {
      return NextResponse.json({ error: 'scheduleId is required' }, { status: 400 });
    }
    if (!action || !ACTIONS.has(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${[...ACTIONS].join(', ')}` },
        { status: 400 }
      );
    }
    if (reason !== undefined && typeof reason !== 'string') {
      return NextResponse.json({ error: 'reason must be a string when provided' }, { status: 400 });
    }

    const founderActor = session.email || session.userId || 'founder';
    const scheduler = new WorkflowScheduler();

    let item;
    try {
      if (action === 'pause') {
        item = await scheduler.pauseSchedule(scheduleId, founderActor, reason);
      } else if (action === 'resume') {
        item = await scheduler.resumeSchedule(scheduleId, founderActor);
      } else {
        item = await scheduler.cancelSchedule(scheduleId, founderActor, reason || 'Cancelled by Founder');
      }
    } catch (err: any) {
      // Distinguish "not found / invalid state" (operator error, 409/404)
      // from genuine server failures (500). Both fail closed.
      const msg = err?.message || 'Schedule lifecycle action failed';
      if (/not found/i.test(msg)) {
        return NextResponse.json({ error: msg }, { status: 404 });
      }
      if (/Cannot (pause|resume)/i.test(msg)) {
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      throw err;
    }

    // Enrich exactly like the GET list route so the founder sees the same
    // authoritative context (objective + step status) after every action.
    const workflowStore = InMemoryWorkflowStore.getInstance();
    const workflow = await workflowStore.getInstance(item.workflowInstanceId);
    const stepState = workflow?.stepStates[item.stepId];

    return NextResponse.json({
      success: true,
      action,
      schedule: {
        ...item,
        workflowObjective: workflow?.objective,
        workflowStatus: workflow?.status,
        stepStatus: stepState?.status,
        stepApprovalState: stepState?.approvalState,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to apply schedule lifecycle action' },
      { status: 500 }
    );
  }
}
