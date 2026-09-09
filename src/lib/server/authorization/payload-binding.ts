import { createHash } from 'crypto';
import { ActionTargetContext, FounderApprovalRecord } from '@/types/authorization';

/**
 * Deterministically sorts object keys and normalizes values for canonical hashing.
 */
function canonicalizeValue(value: any): any {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  if (typeof value === 'object') {
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      if (value[key] !== undefined) {
        result[key] = canonicalizeValue(value[key]);
      }
    }
    return result;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  return String(value);
}

/**
 * Computes a deterministic SHA-256 hash of the approval tuple { actionName, target, payload }.
 * This cryptographically binds the Founder approval to the exact intended action, target, and arguments.
 */
export function computeApprovalPayloadHash(
  actionName: string,
  target?: ActionTargetContext,
  payload?: any
): string {
  const canonicalTuple = {
    actionName: actionName.trim(),
    target: canonicalizeValue(target || null),
    payload: canonicalizeValue(payload !== undefined ? payload : null),
  };

  const serialized = JSON.stringify(canonicalTuple);
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Verifies that the action, target, and payload about to be executed match
 * the exact hash bound to the FounderApprovalRecord at request/approval time.
 */
export function verifyApprovalPayloadBinding(
  record: FounderApprovalRecord,
  currentExecution: {
    actionName: string;
    target?: ActionTargetContext;
    payload?: any;
  }
): { isMatch: boolean; expectedHash?: string; actualHash?: string } {
  if (!record.payloadHash) {
    // Fail-closed: Consequential side-effects strictly require cryptographic payload binding
    return {
      isMatch: false,
      expectedHash: 'MANDATORY_PAYLOAD_HASH_REQUIRED',
      actualHash: 'MISSING_PAYLOAD_HASH_ON_APPROVAL_RECORD',
    };
  }

  const actualHash = computeApprovalPayloadHash(
    currentExecution.actionName,
    currentExecution.target,
    currentExecution.payload
  );

  const isMatch = record.payloadHash === actualHash;
  return {
    isMatch,
    expectedHash: record.payloadHash,
    actualHash,
  };
}
