import { AgentRole, AgentWorkProtocolStep } from './os';

export type ScheduleType = 'one_time_delay' | 'exact_timestamp' | 'recurring';

export type ScheduledWorkStatus =
  | 'scheduled'
  | 'paused'
  | 'triggered'
  | 'completed'
  | 'failed'
  | 'cancelled';

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

/** Phase 4.4B — pause provenance for a founder-paused schedule. Paused items
 *  are excluded from due-work evaluation (listDue only returns 'scheduled')
 *  but remain resumable; unlike cancellation this is NOT terminal.
 *
 *  Phase 4.4C — resume provenance: resuming a paused schedule records
 *  `resumedAt`/`resumedBy` on the retained pausedState (the pause window's
 *  provenance). This is the AUTHORITATIVE record the Activity projection
 *  derives "automation resumed" events from — previously a resume left no
 *  derivable timestamp (updatedAt is overwritten by later executions and is
 *  not a resume signal). Only the LATEST pause window is retained by the
 *  model (existing 4.4B semantics); earlier windows are honestly not
 *  projectable. */
export interface PausedState {
  pausedAt: string; // ISO 8601 UTC
  pausedBy: string;
  reason?: string;
  /** Set when the schedule was resumed (Phase 4.4C provenance). */
  resumedAt?: string; // ISO 8601 UTC
  resumedBy?: string;
}

export interface ScheduledWorkItem {
  id: string;
  workflowInstanceId: string;
  stepId: string;
  scheduleType: ScheduleType;
  executeAt: string; // Canonical ISO 8601 UTC string
  recurrence?: RecurrenceRule;
  status: ScheduledWorkStatus;
  pausedState?: PausedState;
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

// ---------------------------------------------------------
// Phase 4.4A — Automation heartbeat records & honest status projection
// ---------------------------------------------------------

export type SchedulerTriggerSource = 'cron' | 'founder';

/** Append-only record of one scheduler evaluation pass. Written exclusively
 *  by the scheduling evaluation path; never fabricated client-side. */
export interface SchedulerHeartbeatRecord {
  id: string;
  evaluatedAt: string; // ISO 8601 UTC
  triggerSource: SchedulerTriggerSource;
  workerId: string;
  asOfTime: string; // ISO 8601 UTC
  processedCount: number;
  executedCount: number;
  skippedCount: number;
  failedCount: number;
  awaitingApprovalCount: number;
  cancelledCount: number;
  durationMs: number;
  results: Array<{
    scheduleId: string;
    occurrenceId: string;
    status: 'completed' | 'failed' | 'awaiting_approval' | 'skipped' | 'cancelled';
    error?: string;
  }>;
}

/** Founder-facing honest scheduler status projection (Phase 4.4A).
 *  Every field is derived from persisted scheduler state or explicitly null —
 *  values the authoritative model does not contain are NEVER invented. */
export interface SchedulerStatusProjection {
  asOfTime: string;
  /** Latest persisted evaluation pass, or null when no evaluation has ever run. */
  lastHeartbeat: SchedulerHeartbeatRecord | null;
  /** Earliest pending scheduled occurrence, or null when nothing is scheduled. */
  nextDue: {
    scheduleId: string;
    workflowInstanceId: string;
    stepId: string;
    executeAt: string;
    scheduleType: ScheduleType;
    isOverdue: boolean;
    recurrence?: {
      intervalUnit: RecurrenceIntervalUnit;
      intervalValue: number;
      currentOccurrence: number;
      maxOccurrences?: number;
    };
  } | null;
  counts: {
    scheduled: number;
    paused: number;
    cancelled: number;
    completed: number;
    failed: number;
  };
  /** Scheduled occurrences currently blocked pending Founder approval. */
  awaitingApproval: number;
  /** Most recent evaluation passes, newest first (bounded). */
  recentHeartbeats: SchedulerHeartbeatRecord[];
}

