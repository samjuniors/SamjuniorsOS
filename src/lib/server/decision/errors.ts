/**
 * SamJuniorsOS — Native Decision Workflow
 * Domain Errors (Phase 2.1)
 */

import { DecisionStatus } from '@/types/decision';

export class DecisionNotFoundError extends Error {
  public readonly decisionId: string;
  constructor(decisionId: string) {
    super(`Decision not found: "${decisionId}"`);
    this.name = 'DecisionNotFoundError';
    this.decisionId = decisionId;
  }
}

export class DecisionAlreadyExistsError extends Error {
  public readonly decisionId: string;
  constructor(decisionId: string) {
    super(`Decision with ID "${decisionId}" already exists with a different creationRequestId.`);
    this.name = 'DecisionAlreadyExistsError';
    this.decisionId = decisionId;
  }
}

export class InvalidDecisionTransitionError extends Error {
  public readonly fromStatus: DecisionStatus;
  public readonly toStatus: DecisionStatus;
  public readonly decisionId: string;

  constructor(decisionId: string, fromStatus: DecisionStatus, toStatus: DecisionStatus, reason?: string) {
    super(
      `Invalid decision transition for "${decisionId}": cannot transition from "${fromStatus}" to "${toStatus}".${
        reason ? ` Reason: ${reason}` : ''
      }`
    );
    this.name = 'InvalidDecisionTransitionError';
    this.decisionId = decisionId;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

export class DecisionVersionConflictError extends Error {
  public readonly decisionId: string;
  public readonly expectedVersion: number;
  public readonly actualVersion: number;

  constructor(decisionId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Concurrency conflict for decision "${decisionId}": expected stateVersion ${expectedVersion}, but current stateVersion is ${actualVersion}.`
    );
    this.name = 'DecisionVersionConflictError';
    this.decisionId = decisionId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class UnauthorizedDecisionActionError extends Error {
  public readonly actor: string;
  public readonly action: string;

  constructor(actor: string, action: string, message?: string) {
    super(
      message ||
        `Permission denied: Identity "${actor}" is not authorized to perform action "${action}". Only verified Founder identities can approve or reject decisions.`
    );
    this.name = 'UnauthorizedDecisionActionError';
    this.actor = actor;
    this.action = action;
  }
}

export class InvalidDecisionEvidenceError extends Error {
  public readonly decisionId: string;
  public readonly missingFactIds: string[];
  public readonly staleFactIds: string[];

  constructor(decisionId: string, missingFactIds: string[], staleFactIds: string[], message?: string) {
    super(
      message ||
        `Evidence validation failed for decision "${decisionId}": ${
          missingFactIds.length > 0 ? `missing facts [${missingFactIds.join(', ')}] ` : ''
        }${staleFactIds.length > 0 ? `stale/superseded facts [${staleFactIds.join(', ')}]` : ''}`
    );
    this.name = 'InvalidDecisionEvidenceError';
    this.decisionId = decisionId;
    this.missingFactIds = missingFactIds;
    this.staleFactIds = staleFactIds;
  }
}

export class MissingOutcomeError extends Error {
  public readonly decisionId: string;

  constructor(decisionId: string, details?: string) {
    super(
      `Decision "${decisionId}" cannot be resolved without a verified outcome record.${
        details ? ` ${details}` : ''
      }`
    );
    this.name = 'MissingOutcomeError';
    this.decisionId = decisionId;
  }
}

export class DecisionApprovalPayloadMismatchError extends Error {
  public readonly decisionId: string;
  public readonly expectedHash: string;
  public readonly actualHash: string;

  constructor(decisionId: string, expectedHash: string, actualHash: string) {
    super(
      `Approval binding verification failed for decision "${decisionId}": the current payload hash (${actualHash}) does not match the Founder-approved hash (${expectedHash}). Material changes invalidate prior approval.`
    );
    this.name = 'DecisionApprovalPayloadMismatchError';
    this.decisionId = decisionId;
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
  }
}

export class DecisionSupersessionError extends Error {
  public readonly decisionId: string;

  constructor(decisionId: string, message: string) {
    super(`Supersession failed for decision "${decisionId}": ${message}`);
    this.name = 'DecisionSupersessionError';
    this.decisionId = decisionId;
  }
}

export class ConflictingExecutionBlockedError extends Error {
  public readonly decisionId: string;
  public readonly predecessorDecisionId: string;
  public readonly predecessorStatus: DecisionStatus;

  constructor(
    decisionId: string,
    predecessorDecisionId: string,
    predecessorStatus: DecisionStatus,
    message?: string
  ) {
    super(
      message ||
        `Cannot start execution for successor decision "${decisionId}": predecessor decision "${predecessorDecisionId}" execution is active or unconfirmed (status: "${predecessorStatus}"). Conflicting executions are strictly blocked.`
    );
    this.name = 'ConflictingExecutionBlockedError';
    this.decisionId = decisionId;
    this.predecessorDecisionId = predecessorDecisionId;
    this.predecessorStatus = predecessorStatus;
  }
}

export class DecisionExecutionUncertaintyError extends Error {
  public readonly decisionId: string;
  public readonly runningStepIds: string[];

  constructor(decisionId: string, runningStepIds: string[], message?: string) {
    super(
      message ||
        `Execution cancellation for decision "${decisionId}" could not be confirmed. Active running steps: [${runningStepIds.join(', ')}]. Intervention required.`
    );
    this.name = 'DecisionExecutionUncertaintyError';
    this.decisionId = decisionId;
    this.runningStepIds = runningStepIds;
  }
}

