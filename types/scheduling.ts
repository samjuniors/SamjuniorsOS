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
