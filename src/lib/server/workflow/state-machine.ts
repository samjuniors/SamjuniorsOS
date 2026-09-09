import { WorkflowInstanceStatus, WorkflowStepStatus } from '../../../types/workflow';

export class InvalidStateTransitionError extends Error {
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly entityType: 'instance' | 'step';

  constructor(entityType: 'instance' | 'step', fromStatus: string, toStatus: string, message?: string) {
    super(message || `Invalid ${entityType} transition: Cannot transition from '${fromStatus}' to '${toStatus}'.`);
    this.name = 'InvalidStateTransitionError';
    this.entityType = entityType;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

export class ConcurrencyConflictError extends Error {
  readonly instanceId: string;
  readonly expectedVersion: number;
  readonly actualVersion?: number;

  constructor(instanceId: string, expectedVersion: number, actualVersion?: number, message?: string) {
    super(
      message ||
        `Optimistic concurrency conflict on workflow instance '${instanceId}': expected stateVersion ${expectedVersion}, found ${actualVersion ?? 'different version'}.`
    );
    this.name = 'ConcurrencyConflictError';
    this.instanceId = instanceId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class StepClaimError extends Error {
  readonly instanceId: string;
  readonly stepId: string;
  readonly currentStatus: string;
  readonly claimedBy?: string;

  constructor(instanceId: string, stepId: string, currentStatus: string, claimedBy?: string, message?: string) {
    super(
      message ||
        `Step '${stepId}' in workflow '${instanceId}' cannot be claimed: status is '${currentStatus}' (claimedBy: ${claimedBy || 'none'}).`
    );
    this.name = 'StepClaimError';
    this.instanceId = instanceId;
    this.stepId = stepId;
    this.currentStatus = currentStatus;
    this.claimedBy = claimedBy;
  }
}

export class ApprovalAlreadyConsumedError extends Error {
  readonly approvalId: string;
  readonly consumedAt?: Date | string;

  constructor(approvalId: string, consumedAt?: Date | string, message?: string) {
    super(
      message ||
        `Approval '${approvalId}' has already been consumed (consumedAt: ${consumedAt ? new Date(consumedAt).toISOString() : 'unknown'}). Double-consumption rejected.`
    );
    this.name = 'ApprovalAlreadyConsumedError';
    this.approvalId = approvalId;
    this.consumedAt = consumedAt;
  }
}

// Valid transition maps
export const VALID_STEP_TRANSITIONS: Record<WorkflowStepStatus, readonly WorkflowStepStatus[]> = {
  pending: ['ready', 'waiting', 'cancelled'],
  ready: ['running', 'completed', 'waiting', 'blocked', 'awaiting_approval', 'cancelled'],
  running: ['waiting', 'blocked', 'awaiting_approval', 'completed', 'failed', 'cancelled'],
  waiting: ['ready', 'running', 'failed', 'cancelled'],
  blocked: ['ready', 'running', 'cancelled', 'failed'],
  awaiting_approval: ['ready', 'running', 'blocked', 'cancelled', 'failed'],
  completed: ['ready'], // Terminal for single run; allowed to reset to ready for recurring workflows
  failed: [], // Terminal
  cancelled: [], // Terminal
};

export const VALID_INSTANCE_TRANSITIONS: Record<WorkflowInstanceStatus, readonly WorkflowInstanceStatus[]> = {
  pending: ['running', 'waiting', 'cancelled'],
  running: ['waiting', 'blocked', 'awaiting_approval', 'completed', 'failed', 'cancelled'],
  waiting: ['running', 'failed', 'cancelled'],
  blocked: ['running', 'failed', 'cancelled'],
  awaiting_approval: ['running', 'failed', 'cancelled'],
  completed: [], // Terminal
  failed: [], // Terminal
  cancelled: [], // Terminal
};

export function isTerminalStepStatus(status: WorkflowStepStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function isTerminalInstanceStatus(status: WorkflowInstanceStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function validateStepTransition(currentStatus: WorkflowStepStatus, targetStatus: WorkflowStepStatus): void {
  if (currentStatus === targetStatus) {
    return; // idempotent self-transition or no-op
  }
  const allowed = VALID_STEP_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new InvalidStateTransitionError('step', currentStatus, targetStatus);
  }
}

export function validateInstanceTransition(
  currentStatus: WorkflowInstanceStatus,
  targetStatus: WorkflowInstanceStatus
): void {
  if (currentStatus === targetStatus) {
    return; // idempotent self-transition or no-op
  }
  const allowed = VALID_INSTANCE_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new InvalidStateTransitionError('instance', currentStatus, targetStatus);
  }
}
