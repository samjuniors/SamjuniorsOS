import { createHash } from 'crypto';

export type IdempotencyStatus = 'in_progress' | 'completed' | 'failed' | 'unknown';

export class IdempotencyPayloadMismatchError extends Error {
  readonly key: string;
  readonly expectedHash: string;
  readonly actualHash: string;

  constructor(key: string, expectedHash: string, actualHash: string, message?: string) {
    super(
      message ||
        `Idempotency payload mismatch for key '${key}': cannot reuse existing idempotency key with an altered payload (expected: ${expectedHash}, actual: ${actualHash}).`
    );
    this.name = 'IdempotencyPayloadMismatchError';
    this.key = key;
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
  }
}

export class OperationInProgressError extends Error {
  readonly key: string;
  readonly executionRef?: string;
  readonly startedAt?: string;

  constructor(key: string, executionRef?: string, startedAt?: string, message?: string) {
    super(
      message ||
        `Operation with idempotency key '${key}' is currently in progress (executionRef: ${executionRef || 'unknown'}, startedAt: ${startedAt || 'unknown'}). Competing execution blocked to prevent duplicate external side effects.`
    );
    this.name = 'OperationInProgressError';
    this.key = key;
    this.executionRef = executionRef;
    this.startedAt = startedAt;
  }
}

export class UnknownExternalResultError extends Error {
  readonly key: string;
  readonly executionRef?: string;
  readonly originalError?: string;

  constructor(key: string, executionRef?: string, originalError?: string, message?: string) {
    super(
      message ||
        `Operation with idempotency key '${key}' terminated in an UNKNOWN state (executionRef: ${executionRef || 'unknown'}, error: ${originalError || 'unknown'}). The external side effect may or may not have occurred; blind retry is prohibited without provider reconciliation.`
    );
    this.name = 'UnknownExternalResultError';
    this.key = key;
    this.executionRef = executionRef;
    this.originalError = originalError;
  }
}

export class IdempotencyConflictError extends Error {
  readonly key: string;
  readonly currentStatus: string;

  constructor(key: string, currentStatus: string, message?: string) {
    super(
      message ||
        `Idempotency conflict for key '${key}': current status '${currentStatus}' does not permit requested operation.`
    );
    this.name = 'IdempotencyConflictError';
    this.key = key;
    this.currentStatus = currentStatus;
  }
}

/**
 * Deterministically constructs a canonical logical operation idempotency key.
 * Format: op:${actionName}:${targetSystem}:${logicalOpId}
 */
export function generateLogicalIdempotencyKey(params: {
  actionName: string;
  targetSystem: string;
  logicalOpId: string;
  scope?: string;
}): string {
  const action = params.actionName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const target = params.targetSystem.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const opId = params.logicalOpId.trim();
  const scopePart = params.scope ? `:${params.scope.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')}` : '';

  return `op:${action}:${target}${scopePart}:${opId}`;
}

/**
 * Normalizes an external caller-supplied idempotency key.
 * If safe ASCII and within 64 chars, preserves the ID for observability;
 * otherwise securely hashes and truncates to guarantee bounds.
 * Format: client:${actionName}:${safeIdOrHash}
 */
export function normalizeClientSuppliedKey(clientKey: string, actionName: string = 'default'): string {
  const action = actionName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const trimmed = clientKey.trim();
  const isSafeAscii = /^[a-zA-Z0-9_-]+$/.test(trimmed);
  if (isSafeAscii && trimmed.length <= 64) {
    return `client:${action}:${trimmed}`;
  }
  const keyHash = createHash('sha256').update(trimmed).digest('hex').slice(0, 32);
  const safePrefix = trimmed.slice(0, 24).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `client:${action}:${safePrefix}_${keyHash}`;
}
