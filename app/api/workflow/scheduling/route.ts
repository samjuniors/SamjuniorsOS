import { NextRequest, NextResponse } from 'next/server';
import { InMemoryScheduledWorkStore } from '../../../../lib/server/workflow/scheduler-store';
import { InMemoryWorkflowStore } from '../../../../lib/server/workflow/store';
import { ScheduledWorkStatus } from '../../../../types/scheduling';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Session required' },
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
  try {
    const session = await getAuthenticatedFounder(req);
    // Allow if authenticated Founder session, or authorized internal cron trigger
    const cronSecret = process.env.CRON_TRIGGER_SECRET;
    const cronHeader = req.headers.get('x-cron-secret');
    const isAuthorizedCron = cronSecret && cronHeader && cronHeader === cronSecret;

    if (!session && !isAuthorizedCron) {
      return NextResponse.json(
        { error: 'Unauthorized: Founder session or valid cron secret required' },
        { status: 401 }
      );
    }

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

    return NextResponse.json({
      success: true,
      workerId: scheduler.getWorkerId(),
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to evaluate due work' },
      { status: 500 }
    );
  }
}

