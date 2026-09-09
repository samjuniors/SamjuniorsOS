import {
  ScheduledWorkItem,
  ScheduleType,
  RecurrenceRule,
  ScheduledExecutionRecord,
  ScheduledWorkFilter,
} from '../../../types/scheduling';
import { InMemoryScheduledWorkStore } from './scheduler-store';
import { InMemoryWorkflowStore } from './store';
import { WorkflowRuntime } from './runtime';
import { v4 as uuidv4 } from 'uuid';
import { LeaseManager, getLeaseManager, generateWorkerIdentity } from '../coordination/lease-manager';

export interface ScheduleWorkParams {
  workflowInstanceId: string;
  stepId: string;
  scheduleType: ScheduleType;
  executeAt: string; // ISO 8601 string
  recurrence?: RecurrenceRule;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  provenance?: {
    createdByRole?: any;
    workflowId?: string;
    stepName?: string;
  };
}

export interface DueWorkEvaluationResult {
  processedCount: number;
  results: Array<{
    scheduleId: string;
    occurrenceId: string;
    status: 'completed' | 'failed' | 'awaiting_approval' | 'skipped' | 'cancelled';
    error?: string;
  }>;
}

export class WorkflowScheduler {
  private schedulerStore: InMemoryScheduledWorkStore;
  private workflowStore: InMemoryWorkflowStore;
  private runtime: WorkflowRuntime;
  private leaseManager: LeaseManager;
  private workerId: string;
  private leaseTtlMs: number;

  constructor(
    schedulerStore?: InMemoryScheduledWorkStore,
    workflowStore?: InMemoryWorkflowStore,
    runtime?: WorkflowRuntime,
    leaseManager?: LeaseManager,
    workerId?: string,
    leaseTtlMs: number = 30000
  ) {
    this.schedulerStore = schedulerStore || InMemoryScheduledWorkStore.getInstance();
    this.workflowStore = workflowStore || InMemoryWorkflowStore.getInstance();
    this.runtime = runtime || new WorkflowRuntime();
    this.leaseManager = leaseManager || getLeaseManager();
    this.workerId = workerId || generateWorkerIdentity();
    this.leaseTtlMs = leaseTtlMs;
  }

  getWorkerId(): string {
    return this.workerId;
  }

  getLeaseManager(): LeaseManager {
    return this.leaseManager;
  }

  async renewScheduleLease(scheduleId: string): Promise<boolean> {
    const leaseKey = `sched-item:${scheduleId}`;
    return this.leaseManager.renew(leaseKey, this.workerId, this.leaseTtlMs);
  }

  /**
   * Normalize any input date to a canonical UTC ISO-8601 string.
   */
  private canonicalizeTimestamp(dateInput: string | Date | number): string {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      throw new Error(`Invalid timestamp provided: ${dateInput}`);
    }
    return d.toISOString();
  }

  /**
   * Schedule a workflow step for future or recurring execution.
   */
  async scheduleWork(params: ScheduleWorkParams): Promise<ScheduledWorkItem> {
    const { workflowInstanceId, stepId, scheduleType, executeAt, recurrence, idempotencyKey, metadata, provenance } = params;

    // 1. Verify workflow instance exists and is not in terminal state
    const workflow = await this.workflowStore.getInstance(workflowInstanceId);
    if (!workflow) {
      throw new Error(`Cannot schedule step: Workflow instance ${workflowInstanceId} not found`);
    }
    if (workflow.status === 'completed' || workflow.status === 'cancelled' || workflow.status === 'failed') {
      throw new Error(`Cannot schedule step: Workflow instance is in terminal state (${workflow.status})`);
    }

    // 2. Verify step exists in definition and instance
    const stepState = workflow.stepStates[stepId];
    if (!stepState) {
      throw new Error(`Cannot schedule step: Step ${stepId} not found in instance ${workflowInstanceId}`);
    }

    // 3. Check for existing schedule with identical idempotencyKey
    const idKey = idempotencyKey || `idem-${workflowInstanceId}-${stepId}-${scheduleType}-${new Date(executeAt).getTime()}`;
    const existing = await this.schedulerStore.list({ workflowInstanceId, stepId });
    const duplicate = existing.find(item => item.idempotencyKey === idKey && (item.status === 'scheduled' || item.status === 'triggered'));
    if (duplicate) {
      return duplicate; // Idempotent return
    }

    // 4. Canonicalize execution timestamp
    const canonicalExecuteAt = this.canonicalizeTimestamp(executeAt);
    const now = new Date().toISOString();

    // 5. Build Recurrence Rule if applicable
    let recurrenceRule: RecurrenceRule | undefined = undefined;
    if (scheduleType === 'recurring') {
      recurrenceRule = {
        intervalMs: recurrence?.intervalMs,
        intervalUnit: recurrence?.intervalUnit || 'hours',
        intervalValue: recurrence?.intervalValue || 1,
        maxOccurrences: recurrence?.maxOccurrences,
        currentOccurrence: 1,
        endDate: recurrence?.endDate ? this.canonicalizeTimestamp(recurrence.endDate) : undefined,
      };
    }

    const scheduledItem: ScheduledWorkItem = {
      id: `sched-${uuidv4()}`,
      workflowInstanceId,
      stepId,
      scheduleType,
      executeAt: canonicalExecuteAt,
      recurrence: recurrenceRule,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
      executionHistory: [],
      idempotencyKey: idKey,
      metadata: metadata || {},
      provenance: provenance || {
        workflowId: workflow.workflowId,
      },
    };

    // Transition step to 'waiting' if currently pending
    if (stepState.status === 'pending' || stepState.status === 'ready') {
      await this.runtime.transitionStep(workflowInstanceId, stepId, 'waiting');
    }

    await this.schedulerStore.save(scheduledItem);
    return scheduledItem;
  }

  /**
   * Deterministic Due-Work Evaluation.
   * Evaluates all scheduled items due at or before asOfTime with bounded batch size and distributed leases.
   */
  async evaluateDueWork(asOfTime?: string, batchLimit: number = 50): Promise<DueWorkEvaluationResult> {
    const cutoff = asOfTime ? this.canonicalizeTimestamp(asOfTime) : new Date().toISOString();
    const dueItems = await this.schedulerStore.listDue(cutoff, batchLimit);

    const evaluationResult: DueWorkEvaluationResult = {
      processedCount: dueItems.length,
      results: [],
    };

    for (let item of dueItems) {
      const discoveryOccurrenceNumber = item.recurrence?.currentOccurrence || (item.executionHistory.length + 1);
      const leaseKey = `sched-item:${item.id}`;

      // Acquire distributed lease before evaluating or executing this work item
      const claim = await this.leaseManager.acquire(leaseKey, this.workerId, this.leaseTtlMs, {
        workflowInstanceId: item.workflowInstanceId,
        stepId: item.stepId,
        occurrenceId: `${item.id}-occ-${discoveryOccurrenceNumber}`,
      });

      if (!claim.acquired) {
        evaluationResult.results.push({
          scheduleId: item.id,
          occurrenceId: `${item.id}-occ-${discoveryOccurrenceNumber}`,
          status: 'skipped',
          error: `Active lease held by worker: ${claim.activeLease?.holderId || 'another_worker'}`,
        });
        continue;
      }

      try {
        // 0. Phase 2.6 hardening — FRESH RE-READ after lease acquisition.
        // The listDue snapshot may be stale: another worker may have finalized this item
        // (or advanced its recurrence / rewritten executionHistory) between discovery and
        // lease acquisition. Writing from the stale snapshot would overwrite the winner's
        // durable state (erased executionHistory, relabeled completed→cancelled).
        // The lease guarantees no OTHER scheduler is inside this critical section now,
        // so the fresh read + finalized-skip below is authoritative.
        const freshItem = await this.schedulerStore.get(item.id);
        if (!freshItem) {
          evaluationResult.results.push({
            scheduleId: item.id,
            occurrenceId: `${item.id}-occ-${discoveryOccurrenceNumber}`,
            status: 'skipped',
            error: 'Scheduled item no longer exists (removed after discovery)',
          });
          continue;
        }
        item = freshItem;

        if (item.status !== 'scheduled') {
          // Finalized by a concurrent winner (completed / cancelled / failed / executed).
          evaluationResult.results.push({
            scheduleId: item.id,
            occurrenceId: `${item.id}-occ-${discoveryOccurrenceNumber}`,
            status: 'skipped',
            error: `Item already finalized (${item.status}) by another worker after discovery`,
          });
          continue;
        }

        // Recompute the authoritative occurrence identity from the FRESH item state:
        // the winner may have advanced currentOccurrence or appended history.
        const occurrenceNumber = item.recurrence?.currentOccurrence || (item.executionHistory.length + 1);
        const occurrenceId = `${item.id}-occ-${occurrenceNumber}`;

        // 1. Idempotency Check: Prevent duplicate execution of this specific occurrence
        const existingOcc = item.executionHistory.find(h => h.occurrenceId === occurrenceId);
        if (existingOcc && (existingOcc.status === 'triggered' || existingOcc.status === 'completed')) {
          evaluationResult.results.push({
            scheduleId: item.id,
            occurrenceId,
            status: 'skipped',
          });
          continue;
        }

        // 2. Load Workflow Instance & Definition
        const workflow = await this.workflowStore.getInstance(item.workflowInstanceId);
        if (!workflow) {
          item.status = 'failed';
          item.updatedAt = new Date().toISOString();
          await this.schedulerStore.update(item);
          evaluationResult.results.push({
            scheduleId: item.id,
            occurrenceId,
            status: 'failed',
            error: `Workflow instance not found: ${item.workflowInstanceId}`,
          });
          continue;
        }

        // 3. Parent Workflow Terminal State Check
        if (workflow.status === 'completed' || workflow.status === 'cancelled' || workflow.status === 'failed') {
          item.status = 'cancelled';
          item.updatedAt = new Date().toISOString();
          item.cancellationState = {
            cancelledAt: new Date().toISOString(),
            cancelledBy: 'system',
            reason: `Parent workflow is in terminal state: ${workflow.status}`,
          };
          await this.schedulerStore.update(item);
          evaluationResult.results.push({
            scheduleId: item.id,
            occurrenceId,
            status: 'cancelled',
            error: `Parent workflow terminal (${workflow.status})`,
          });
          continue;
        }

        // 4. Load Step Definition & Check Step Existence
        const def = await this.workflowStore.getDefinition(workflow.workflowId, workflow.version);
        const stepDef = def?.steps.find(s => s.id === item.stepId);
        const stepState = workflow.stepStates[item.stepId];

        if (!def || !stepDef || !stepState) {
          item.status = 'failed';
          item.updatedAt = new Date().toISOString();
          await this.schedulerStore.update(item);
          evaluationResult.results.push({
            scheduleId: item.id,
            occurrenceId,
            status: 'failed',
            error: `Step definition or state missing for step: ${item.stepId}`,
          });
          continue;
        }

        // 5. If step is already completed or cancelled (and not recurring)
        if ((stepState.status === 'completed' || stepState.status === 'cancelled') && item.scheduleType !== 'recurring') {
          item.status = stepState.status;
          item.updatedAt = new Date().toISOString();
          await this.schedulerStore.update(item);
          evaluationResult.results.push({
            scheduleId: item.id,
            occurrenceId,
            status: 'completed',
          });
          continue;
        }

        // If recurring and step was completed from a prior occurrence, reset status to ready for this new occurrence
        if (item.scheduleType === 'recurring' && stepState.status === 'completed') {
          await this.runtime.transitionStep(item.workflowInstanceId, item.stepId, 'ready');
        }

        // 6. Wake Workflow Runtime & Re-evaluate Readiness
        await this.runtime.evaluateReadiness(item.workflowInstanceId);
        const recheckedWorkflow = (await this.workflowStore.getInstance(item.workflowInstanceId))!;
        const recheckedStepState = recheckedWorkflow.stepStates[item.stepId];

        // 7. Dependency & Prerequisites Check
        if (
          recheckedStepState.status === 'blocked' || 
          recheckedStepState.status === 'pending' || 
          recheckedStepState.status === 'waiting'
        ) {
          evaluationResult.results.push({
            scheduleId: item.id,
            occurrenceId,
            status: 'skipped',
            error: recheckedStepState.blockedReason || `Step dependencies not fulfilled (status: ${recheckedStepState.status})`,
          });
          continue;
        }

        // 8. Re-evaluate Side-Effect Authorization at Wake Time (Defense-in-depth)
        let classification = stepDef.sideEffectClassification || (stepDef.requiresApproval ? 'external_communication' : 'read_only');
        const wakeAuth = await this.runtime.getGate().evaluateAuthorization({
          employeeRole: stepDef.assignedRole,
          skillId: stepDef.skill,
          actionName: stepDef.name,
          classification,
          workflowContext: {
            workflowId: workflow.workflowId,
            workflowInstanceId: item.workflowInstanceId,
            stepId: item.stepId,
            objective: def.objective,
          },
          target: stepDef.targetContext,
          requestedBy: stepDef.assignedRole,
        });

        if (wakeAuth.effect === 'denied') {
          await this.runtime.transitionStep(item.workflowInstanceId, item.stepId, 'blocked');
          evaluationResult.results.push({
            scheduleId: item.id,
            occurrenceId,
            status: 'skipped',
            error: `Side-effect authorization denied on wake: ${wakeAuth.reason}`,
          });
          continue;
        }

        // Strict Governance & Approval Check
        // If step requires approval and approval has NOT been granted:
        if ((stepDef.requiresApproval || wakeAuth.effect === 'approval_required') && recheckedStepState.approvalState !== 'approved') {
          // Transition step to awaiting_approval if not already
          if (recheckedStepState.status !== 'awaiting_approval') {
            await this.runtime.transitionStep(item.workflowInstanceId, item.stepId, 'awaiting_approval');
          }

          const occRecord: ScheduledExecutionRecord = {
            occurrenceId,
            occurrenceNumber,
            triggeredAt: new Date().toISOString(),
            status: 'awaiting_approval',
            error: 'Step requires Founder approval before execution',
          };

          item.lastTriggeredAt = new Date().toISOString();
          // Replace or add record
          const recIndex = item.executionHistory.findIndex(h => h.occurrenceId === occurrenceId);
          if (recIndex >= 0) {
            item.executionHistory[recIndex] = occRecord;
          } else {
            item.executionHistory.push(occRecord);
          }

          await this.schedulerStore.update(item);

          evaluationResult.results.push({
            scheduleId: item.id,
            occurrenceId,
            status: 'awaiting_approval',
            error: 'Awaiting Founder approval',
          });
          continue; // Strictly NEVER execute without approval
        }

        // 9. Execute Eligible Step
        const startTime = Date.now();
        const triggerTime = new Date().toISOString();

        const occRecord: ScheduledExecutionRecord = {
          occurrenceId,
          occurrenceNumber,
          triggeredAt: triggerTime,
          status: 'triggered',
        };

        item.lastTriggeredAt = triggerTime;
        item.executionHistory.push(occRecord);
        await this.schedulerStore.update(item);

        try {
          // Execute Ready Step via Runtime (which delegates to ServerAgentExecutor)
          await this.runtime.executeReadyStep(item.workflowInstanceId, item.stepId);

          // Fetch final step state after execution
          const finalWorkflow = (await this.workflowStore.getInstance(item.workflowInstanceId))!;
          const finalStepState = finalWorkflow.stepStates[item.stepId];
          const durationMs = Date.now() - startTime;

          if (finalStepState.status === 'completed') {
            occRecord.status = 'completed';
            occRecord.completedAt = new Date().toISOString();
            occRecord.durationMs = durationMs;
            occRecord.result = finalStepState.outputs;

            // Handle Schedule Completion or Recurrence Advance
            if (item.scheduleType === 'recurring' && item.recurrence) {
              const nextOccNumber = occurrenceNumber + 1;
              const maxOcc = item.recurrence.maxOccurrences;
              const nextExecuteAt = this.calculateNextRecurrence(item.executeAt, item.recurrence);

              const isPastEndDate = item.recurrence.endDate && new Date(nextExecuteAt).getTime() > new Date(item.recurrence.endDate).getTime();
              const isMaxOccReached = maxOcc !== undefined && nextOccNumber > maxOcc;

              if (isPastEndDate || isMaxOccReached) {
                item.status = 'completed';
              } else {
                item.status = 'scheduled';
                item.executeAt = nextExecuteAt;
                item.recurrence.currentOccurrence = nextOccNumber;
              }
            } else {
              item.status = 'completed';
            }

            item.updatedAt = new Date().toISOString();
            await this.schedulerStore.update(item);

            evaluationResult.results.push({
              scheduleId: item.id,
              occurrenceId,
              status: 'completed',
            });
          } else if (finalStepState.status === 'failed') {
            // Handle Step Failure & Retry Policy
            occRecord.status = 'failed';
            occRecord.completedAt = new Date().toISOString();
            occRecord.durationMs = durationMs;
            occRecord.error = finalStepState.error || 'Execution failed';

            const retryPolicy = stepDef.retryPolicy || { maxRetries: 0, backoffMs: 1000 };
            if (finalStepState.retryCount < retryPolicy.maxRetries) {
              // Schedule Retry with backoff
              const backoffTime = new Date(Date.now() + retryPolicy.backoffMs).toISOString();
              item.status = 'scheduled';
              item.executeAt = backoffTime;
            } else {
              // Retries exhausted
              item.status = 'failed';
            }

            item.updatedAt = new Date().toISOString();
            await this.schedulerStore.update(item);

            evaluationResult.results.push({
              scheduleId: item.id,
              occurrenceId,
              status: 'failed',
              error: occRecord.error,
            });
          }
        } catch (err: any) {
          occRecord.status = 'failed';
          occRecord.completedAt = new Date().toISOString();
          occRecord.error = err.message || 'Execution error';
          item.status = 'failed';
          item.updatedAt = new Date().toISOString();
          await this.schedulerStore.update(item);

          evaluationResult.results.push({
            scheduleId: item.id,
            occurrenceId,
            status: 'failed',
            error: err.message,
          });
        }
      } finally {
        await this.leaseManager.release(leaseKey, this.workerId);
      }
    }

    return evaluationResult;
  }

  /**
   * Calculate the next execution timestamp based on RecurrenceRule.
   */
  calculateNextRecurrence(currentExecuteAt: string, recurrence: RecurrenceRule): string {
    const current = new Date(currentExecuteAt).getTime();
    let addMs = 0;

    if (recurrence.intervalMs && recurrence.intervalMs > 0) {
      addMs = recurrence.intervalMs;
    } else {
      const val = recurrence.intervalValue || 1;
      switch (recurrence.intervalUnit) {
        case 'minutes':
          addMs = val * 60 * 1000;
          break;
        case 'hours':
          addMs = val * 60 * 60 * 1000;
          break;
        case 'days':
          addMs = val * 24 * 60 * 60 * 1000;
          break;
        case 'weeks':
          addMs = val * 7 * 24 * 60 * 60 * 1000;
          break;
        default:
          addMs = val * 60 * 60 * 1000; // Default 1 hour
      }
    }

    return new Date(current + addMs).toISOString();
  }

  /**
   * Cancel a scheduled work item.
   */
  async cancelSchedule(id: string, cancelledBy: string = 'founder', reason?: string): Promise<ScheduledWorkItem> {
    return this.schedulerStore.cancel(id, cancelledBy, reason);
  }

  /**
   * Get a single schedule by ID.
   */
  async getSchedule(id: string): Promise<ScheduledWorkItem | null> {
    return this.schedulerStore.get(id);
  }

  /**
   * List schedules with optional filter.
   */
  async listSchedules(filter?: ScheduledWorkFilter): Promise<ScheduledWorkItem[]> {
    return this.schedulerStore.list(filter);
  }
}
