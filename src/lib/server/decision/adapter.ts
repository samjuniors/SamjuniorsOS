/**
 * SamJuniorsOS — Native Decision Workflow
 * Legacy CompanyDecision Adapter (Phase 2.1)
 *
 * Provides bidirectional adaptation between the new authoritative `DecisionRecord`
 * and the legacy `CompanyDecision` interface, guaranteeing backward compatibility
 * for CompanyContextProvider and CompanyStateStore consumers.
 */

import {
  DecisionRecord,
  DecisionStatus,
  DecisionCategory,
} from '@/types/decision';
import { CompanyDecision, AgentRole } from '@/types/os';
import { computeDecisionApprovalHash } from './payload-binding';

/**
 * Maps authoritative DecisionStatus to legacy CompanyDecision status.
 */
export function mapDecisionStatusToLegacy(
  status: DecisionStatus
): CompanyDecision['status'] {
  switch (status) {
    case 'proposed':
      return 'proposed';
    case 'under_review':
      return 'under_review';
    case 'intervention_required':
      return 'intervention_required';
    case 'pending_approval':
      return 'pending_approval';
    case 'approved':
      return 'approved';
    case 'executing':
      return 'executing';
    case 'resolved':
      return 'resolved';
    case 'superseded':
      return 'superseded';
    case 'rejected':
      return 'rejected';
    case 'withdrawn':
      return 'withdrawn';
    default:
      return status as CompanyDecision['status'];
  }
}

/**
 * Maps authoritative DecisionCategory to legacy CompanyDecision category.
 */
export function mapDecisionCategoryToLegacy(
  category: DecisionCategory
): CompanyDecision['category'] {
  switch (category) {
    case 'strategic':
    case 'operational':
      return 'Strategic';
    case 'financial':
      return 'Financial';
    case 'product':
      return 'Product';
    case 'governance':
      return 'Governance';
    default:
      return 'Strategic';
  }
}

/**
 * Converts a new authoritative DecisionRecord to a legacy CompanyDecision.
 */
export function mapDecisionRecordToCompanyDecision(
  record: DecisionRecord
): CompanyDecision {
  const legacyStatus = mapDecisionStatusToLegacy(record.status);
  const legacyCategory = mapDecisionCategoryToLegacy(record.category);

  // Parse date string (e.g. "2026-09-01")
  const dateStr = record.createdAt ? record.createdAt.split('T')[0] : 'Today';

  return {
    id: record.decisionId,
    title: record.title,
    status: legacyStatus,
    category: legacyCategory,
    recommendedBy: record.proposer,
    agentId: (record.proposer as AgentRole) || 'coo',
    recommendation: record.proposedAction,
    businessImpact: record.problemStatement,
    evidenceSummary:
      record.evidenceFactIds.length > 0
        ? `Backed by ${record.evidenceFactIds.length} verified canonical facts.`
        : record.uncertainty.description || 'Internal executive proposal',
    date: dateStr,
    founderApprovalRequired: record.approvalRequired,
    resolvedAt: record.outcome?.resolvedAt,
    resolvedBy: record.outcome?.resolvedBy,
    resolutionNote: record.outcome?.outcomeSummary,
    supersedesDecisionId: record.supersedesDecisionId,
    supersededByDecisionId: record.supersededByDecisionId,
    originalStatus: record.status,
    currentEvidence: {
      summary: record.uncertainty.description,
      source: 'Authoritative DecisionStore',
      confidence: record.uncertainty.level === 'low' ? 95 : record.uncertainty.level === 'medium' ? 75 : 50,
    },
  };
}

/**
 * Converts a legacy CompanyDecision into a new authoritative DecisionRecord.
 */
export function mapCompanyDecisionToDecisionRecord(
  cd: CompanyDecision,
  creationRequestId?: string
): DecisionRecord {
  const categoryLower = (cd.category || 'Strategic').toLowerCase() as DecisionCategory;
  const validCategory: DecisionCategory = [
    'strategic',
    'financial',
    'product',
    'governance',
    'operational',
  ].includes(categoryLower)
    ? categoryLower
    : 'strategic';

  let status: DecisionStatus = 'proposed';
  if (cd.status === 'approved') status = 'approved';
  else if (cd.status === 'executing') status = 'executing';
  else if (cd.status === 'pending_approval') status = 'pending_approval';
  else if (cd.status === 'resolved') status = 'resolved';
  else if (cd.status === 'rejected') status = 'rejected';
  else if (cd.status === 'withdrawn') status = 'withdrawn';
  else if (cd.status === 'intervention_required') status = 'intervention_required';
  else if (cd.status === 'superseded') status = 'superseded';
  else if (cd.status === 'in_review' || cd.status === 'revision_requested' || cd.status === 'under_review') status = 'under_review';
  else if (cd.status === 'proposed') status = 'proposed';

  const now = new Date().toISOString();
  const decisionId = cd.id;
  const stateVersion = status === 'approved' || status === 'resolved' ? 2 : 1;

  const rec: DecisionRecord = {
    decisionId,
    creationRequestId: creationRequestId || `req-${decisionId}`,
    stateVersion,
    title: cd.title,
    problemStatement: cd.businessImpact || cd.title,
    proposedAction: cd.recommendation || cd.title,
    category: validCategory,
    proposer: cd.agentId || cd.recommendedBy || 'coo',
    accountableOwner: 'founder',
    createdAt: cd.date && cd.date !== 'Today' && cd.date !== 'Yesterday' ? cd.date : now,
    evidenceFactIds: [],
    assumptions: [],
    uncertainty: {
      level: 'low',
      description: cd.evidenceSummary || 'Legacy decision record',
    },
    impact: 'medium',
    reversibility: 'reversible',
    status,
    approvalRequired: cd.founderApprovalRequired ?? true,
    decidedBy: status === 'approved' || status === 'resolved' ? 'founder' : undefined,
    decidedAt: cd.resolvedAt || (status === 'approved' ? now : undefined),
    decisionReason: cd.resolutionNote,
    supersedesDecisionId: cd.supersedesDecisionId,
    supersededByDecisionId: cd.supersededByDecisionId,
    outcome:
      status === 'resolved'
        ? {
            outcomeSummary: cd.resolutionNote || 'Resolved',
            resolvedAt: cd.resolvedAt || now,
            resolvedBy: cd.resolvedBy || 'founder',
          }
        : undefined,
    transitions: [
      {
        transitionId: `tr-legacy-${decisionId}`,
        fromStatus: 'proposed',
        toStatus: status,
        actor: cd.recommendedBy || 'system',
        timestamp: now,
        reason: 'Migrated from legacy CompanyDecision',
        stateVersion,
      },
    ],
  };

  if (status === 'approved' || status === 'resolved') {
    rec.approvedPayloadHash = computeDecisionApprovalHash(rec);
  }

  return rec;
}
