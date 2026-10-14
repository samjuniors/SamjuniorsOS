/**
 * SamJuniorsOS — Native Decision Workflow
 * Cryptographic Approval Binding & Canonical Payload Hashing (Phase 2.1)
 *
 * Enforces cryptographic binding between Founder approval and the exact
 * content, state version, and epistemic basis of a decision.
 * Material changes between approval and execution strictly fail-closed.
 */

import { createHash } from 'crypto';
import { DecisionRecord } from '@/types/decision';

/**
 * Recursively canonicalizes an object with deterministically sorted keys
 * and normalized values for stable SHA-256 hashing.
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

export interface DecisionApprovalMaterialPayload {
  decisionId: string;
  stateVersion: number;
  title: string;
  problemStatement: string;
  proposedAction: string;
  category: string;
  impact: string;
  reversibility: string;
  evidenceFactIds: string[];
  assumptions: string[];
  uncertainty: {
    level: string;
    description: string;
    keyUnknowns?: string[];
  };
}

/**
 * Extracts the authoritative material payload of a decision.
 */
export function extractDecisionMaterialPayload(
  decision: DecisionRecord | DecisionApprovalMaterialPayload
): DecisionApprovalMaterialPayload {
  const sortedFactIds = [...(decision.evidenceFactIds || [])].sort();
  const sortedAssumptions = [...(decision.assumptions || [])].sort();
  const sortedKeyUnknowns = decision.uncertainty?.keyUnknowns
    ? [...decision.uncertainty.keyUnknowns].sort()
    : undefined;

  return {
    decisionId: decision.decisionId.trim(),
    stateVersion: decision.stateVersion,
    title: decision.title.trim(),
    problemStatement: decision.problemStatement.trim(),
    proposedAction: decision.proposedAction.trim(),
    category: decision.category,
    impact: decision.impact,
    reversibility: decision.reversibility,
    evidenceFactIds: sortedFactIds,
    assumptions: sortedAssumptions,
    uncertainty: {
      level: decision.uncertainty?.level || 'low',
      description: (decision.uncertainty?.description || '').trim(),
      ...(sortedKeyUnknowns ? { keyUnknowns: sortedKeyUnknowns } : {}),
    },
  };
}

/**
 * Computes a deterministic SHA-256 hash of the canonical decision material tuple.
 */
export function computeDecisionApprovalHash(
  decision: DecisionRecord | DecisionApprovalMaterialPayload
): string {
  const material = extractDecisionMaterialPayload(decision);
  const canonical = canonicalizeValue(material);
  const serialized = JSON.stringify(canonical);
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Verifies that the decision in its current state matches the approved payload hash.
 */
export function verifyDecisionApprovalBinding(decision: DecisionRecord): {
  isMatch: boolean;
  expectedHash?: string;
  actualHash: string;
} {
  const actualHash = computeDecisionApprovalHash(decision);
  if (!decision.approvedPayloadHash) {
    return {
      isMatch: false,
      expectedHash: undefined,
      actualHash,
    };
  }

  return {
    isMatch: decision.approvedPayloadHash === actualHash,
    expectedHash: decision.approvedPayloadHash,
    actualHash,
  };
}
