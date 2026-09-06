import { NextRequest, NextResponse } from 'next/server';
import { InMemoryScheduledWorkStore } from '../../../../lib/server/workflow/scheduler-store';
import { InMemoryWorkflowStore } from '../../../../lib/server/workflow/store';
import { ScheduledWorkStatus } from '../../../../types/scheduling';

export async function GET(req: NextRequest) {
  try {
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
