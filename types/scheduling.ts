import { AgentRole, AgentWorkProtocolStep } from './os';

export type ScheduleType = 'one_time_delay' | 'exact_timestamp' | 'recurring';

export type ScheduledWorkStatus = 'scheduled' | 'triggered' | 'completed' | 'failed' | 'cancelled';

export type RecurrenceIntervalUnit = 'minutes' | 'hours' | 'days' | 'weeks';

export interface RecurrenceRule {
  intervalMs?: number;
  intervalUnit?: RecurrenceIntervalUnit;
  intervalValue?: number; // e.g. 2 hours, 1 day
  maxOccurrences?: number;
  currentOccurrence?: number;
  endDate?: string; // ISO 8601 UTC
}

export interface ScheduledExecutionRecord {
  occurrenceId: string;
  occurrenceNumber: number;
  triggeredAt: string; // ISO 8601 UTC
  completedAt?: string;
  status: 'triggered' | 'completed' | 'failed' | 'cancelled' | 'awaiting_approval';
  result?: any;
  error?: string;
  durationMs?: number;
  /**
   * PHASE 2.6.1: true when the scheduler lost `sched-item` lease ownership at some
   * point during this occurrence's execution (renewal rejected/threw, or the bounded
   * renewal duration cap was hit). The execution outcome recorded here is still this
   * worker's honest observation, but lease ownership was uncertain while it ran.
   * Coordination marker only — carries no authorization semantics.
   */
  coordinationLost?: boolean;
}

export interface CancellationState {
  cancelledAt: string; // ISO 8601 UTC
  cancelledBy: string;
  reason?: string;
}

export interface ScheduledWorkItem {
  id: string;
  workflowInstanceId: string;
  stepId: string;
  scheduleType: ScheduleType;
  executeAt: string; // Canonical ISO 8601 UTC string
  recurrence?: RecurrenceRule;
  status: ScheduledWorkStatus;
  cancellationState?: CancellationState;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
  lastTriggeredAt?: string;
  executionHistory: ScheduledExecutionRecord[];
  idempotencyKey: string;
  metadata?: Record<string, any>;
  provenance?: {
    createdByRole?: AgentRole | 'founder' | 'system';
    workflowId?: string;
    stepName?: string;
  };
}

export interface ScheduledWorkFilter {
  workflowInstanceId?: string;
  stepId?: string;
  status?: ScheduledWorkStatus;
  scheduleType?: ScheduleType;
}
