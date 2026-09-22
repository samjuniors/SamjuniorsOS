import { NextRequest, NextResponse } from 'next/server';
import { InMemoryScheduledWorkStore } from '@/lib/server/workflow/scheduler-store';
import { SchedulerStatusProjection } from '@/types/scheduling';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';

/**
 * GET /api/workflow/scheduling/status — Phase 4.4A honest scheduler status
 * projection for the Founder.
 *
 * Every value is derived from PERSISTED scheduler state (ScheduledWorkItem
 * records + the append-only SchedulerHeartbeat log). Values the authoritative
 * model does not contain are returned as null — never fabricated:
 *   - lastHeartbeat: null until an evaluation pass has actually run.
 *   - nextDue: null when nothing is scheduled.
 *   - "Active/paused": not asserted as a health claim (the server cannot know
 *     the heartbeat cadence); the raw last-evaluation timestamp is reported
 *     and recency is derived CLIENT-side from real timestamps only.
 *
 * Founder-gated (route-level, defense-in-depth over the executive middleware).
 */

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Founder session required' },
        { status: 401 }
      );
    }

    const schedulerStore = InMemoryScheduledWorkStore.getInstance();
    const asOfTime = new Date().toISOString();

    // All persisted schedule items (any status) — the authoritative record set.
    const [all, heartbeats] = await Promise.all([
      schedulerStore.list(),
      schedulerStore.listHeartbeats(5),
    ]);

    const scheduled = all.filter((i) => i.status === 'scheduled');
    const paused = all.filter((i) => i.status === 'paused');
    const cancelled = all.filter((i) => i.status === 'cancelled');
    const completed = all.filter((i) => i.status === 'completed');
    const failed = all.filter((i) => i.status === 'failed');

    // Next due occurrence: earliest pending executeAt (deterministic sort by
    // executeAt, then id for stable ordering). Overdue = due before the last
    // real evaluation pass (or before now when no pass has run yet).
    const lastHeartbeat = heartbeats[0] ?? null;
    const referenceTime = lastHeartbeat ? new Date(lastHeartbeat.evaluatedAt).getTime() : Date.now();
    const pending = [...scheduled].sort((a, b) => {
      const d = new Date(a.executeAt).getTime() - new Date(b.executeAt).getTime();
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });
    const next = pending[0] ?? null;

    // Scheduled occurrences currently blocked pending Founder approval:
    // latest execution-history record for a pending item is awaiting_approval.
    const awaitingApproval = scheduled.filter((i) => {
      const hist = i.executionHistory ?? [];
      const latest = hist[hist.length - 1];
      return latest?.status === 'awaiting_approval';
    }).length;

    const projection: SchedulerStatusProjection = {
      asOfTime,
      lastHeartbeat,
      nextDue: next
        ? {
            scheduleId: next.id,
            workflowInstanceId: next.workflowInstanceId,
            stepId: next.stepId,
            executeAt: next.executeAt,
            scheduleType: next.scheduleType,
            isOverdue: new Date(next.executeAt).getTime() <= referenceTime,
            recurrence: next.recurrence
              ? {
                  intervalUnit: next.recurrence.intervalUnit ?? 'hours',
                  intervalValue: next.recurrence.intervalValue ?? 1,
                  currentOccurrence: next.recurrence.currentOccurrence ?? 1,
                  maxOccurrences: next.recurrence.maxOccurrences,
                }
              : undefined,
          }
        : null,
      counts: {
        scheduled: scheduled.length,
        paused: paused.length,
        cancelled: cancelled.length,
        completed: completed.length,
        failed: failed.length,
      },
      awaitingApproval,
      recentHeartbeats: heartbeats,
    };

    return NextResponse.json(projection);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to project scheduler status' },
      { status: 500 }
    );
  }
}
