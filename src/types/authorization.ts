import { AgentRole, AgentWorkProtocolStep } from './os';

/**
 * PHASE 12.3: SIDE-EFFECT CLASSIFICATION
 * Deterministic taxonomy of operations performed by AI Employees.
 */
export type SideEffectClassification =
  | 'read_only'
  | 'internal_mutation'
  | 'external_communication'
  | 'external_record_mutation'
  | 'financial_action'
  | 'high_impact_action';

/**
 * Authorization outcome from the central policy gate.
 */
export type AuthorizationEffect = 'allowed' | 'approval_required' | 'denied';

/**
 * Lifecycle status of a Founder Approval.
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired';

/**
 * Granular scope bounding an approval.
 */
export type ApprovalScopeType =
  | 'single_action'
  | 'step'
  | 'workflow_instance'
  | 'campaign'
  | 'bounded_operation';

/**
 * PHASE 4.4B.1 — OCCURRENCE BINDING.
 * A per-occurrence scheduled approval authorizes exactly ONE scheduler
 * occurrence (scopeType 'single_action' + occurrenceId). It is single-use
 * (consumed at execution) and can never authorize a later occurrence or an
 * ad-hoc (unbound) execution of the same step.
 */
export interface ApprovalScope {
  scopeType: ApprovalScopeType;
  workflowInstanceId?: string;
  stepId?: string;
  campaignId?: string;
  targetSystem?: string;
  operationPattern?: string;
  /** Scheduler occurrence identity ("<scheduleId>-occ-<n>") this approval is
   * bound to. Set ONLY by the scheduled execution path; server-derived. */
  occurrenceId?: string;
  maxUses?: number;
  usedCount?: number;
}

export interface ActionTargetContext {
  targetSystem?: string; // e.g., 'email', 'crm', 'github', 'database', 'internal_store'
  resourceId?: string;
  operation?: string;
  recipient?: string;
  payloadHash?: string;
  summary?: string;
  metadata?: Record<string, any>;
}

export type AuthorizationReasonCode =
  | 'READ_ONLY_ALLOWED'
  | 'INTERNAL_MUTATION_ALLOWED'
  | 'APPROVED_BY_FOUNDER'
  | 'APPROVAL_REQUIRED_EXTERNAL_COMMUNICATION'
  | 'APPROVAL_REQUIRED_EXTERNAL_RECORD_MUTATION'
  | 'APPROVAL_REQUIRED_STEP_POLICY'
  | 'APPROVAL_REQUIRED_HIGH_IMPACT'
  | 'APPROVAL_REQUIRED_FINANCIAL'
  | 'APPROVAL_PENDING'
  | 'APPROVAL_REJECTED'
  | 'APPROVAL_REVOKED'
  | 'APPROVAL_EXPIRED'
  | 'APPROVAL_SCOPE_MISMATCH'
  | 'APPROVAL_OCCURRENCE_MISMATCH'
  | 'APPROVAL_CONSUMED'
  | 'APPROVAL_PAYLOAD_HASH_MISMATCH'
  | 'APPROVAL_PAYLOAD_HASH_MISSING'
  | 'APPROVAL_NOT_FOUND'
  | 'DENIED_ADVISOR_EXECUTION_PROHIBITED'
  | 'DENIED_ROLE_PERMISSION_DISALLOWED'
  | 'DENIED_FINANCIAL_ACTION_AUTONOMY_PROHIBITED'
  | 'DENIED_HIGH_IMPACT_ACTION_AUTONOMY_PROHIBITED'
  | 'DENIED_UNAUTHORIZED_CALLER'
  | 'DENIED_INVALID_CONTEXT'
  | 'DENIED_APPROVAL_REJECTED'
  | 'DENIED_APPROVAL_REVOKED'
  | 'IDEMPOTENT_REPLAY'
  | 'IDEMPOTENCY_PAYLOAD_MISMATCH'
  | 'OPERATION_IN_PROGRESS'
  | 'UNKNOWN_EXTERNAL_RESULT';

export interface FounderApprovalRecord {
  id: string;
  decision: ApprovalStatus;
  actionName: string;
  classification: SideEffectClassification;
  workflowInstanceId: string;
  stepId: string;
  employeeRole: AgentRole | 'advisor' | 'system';
  scope: ApprovalScope;
  requestedAt: string;
  decidedAt?: string;
  expiresAt?: string;
  decidedBy?: string; // e.g. 'founder'
  decisionReason?: string;
  notes?: string;
  target?: ActionTargetContext;
  payload?: any;
  payloadHash?: string; // SHA-256 cryptographic binding of {actionName, target, payload}
  isConsumed?: boolean;
}

export interface AuthorizationEvaluationRequest {
  employeeRole: AgentRole | 'advisor' | 'system';
  skillId?: string | AgentWorkProtocolStep;
  actionName: string;
  classification: SideEffectClassification;
  workflowContext?: {
    workflowId?: string;
    workflowInstanceId: string;
    stepId: string;
    objective?: string;
    /** Server-derived scheduler occurrence identity when this evaluation is
     * for a specific scheduled occurrence (Phase 4.4B.1). Client-supplied
     * values are never trusted — only the WorkflowScheduler sets this. */
    occurrenceId?: string;
  };
  target?: ActionTargetContext;
  payload?: any;
  requestedBy?: string;
  approvalId?: string;
}

export interface AuthorizationDecision {
  effect: AuthorizationEffect;
  reasonCode: AuthorizationReasonCode;
  reason: string;
  approvalId?: string;
  approvalStatus?: ApprovalStatus;
  requiredScope?: ApprovalScope;
  evaluatedAt: string;
  evaluator: 'central_side_effect_gate';
}

export interface SideEffectAuditRecord {
  id: string;
  timestamp: string;
  requestId: string;
  employeeRole: AgentRole | 'advisor' | 'system';
  requestedBy: string;
  skillId?: string;
  workflowInstanceId?: string;
  stepId?: string;
  actionClassification: SideEffectClassification;
  actionName: string;
  target?: ActionTargetContext;
  decision: AuthorizationEffect;
  reasonCode: AuthorizationReasonCode;
  reason: string;
  approvalId?: string;
  executionReference?: string;
  executed: boolean;
}

export interface ApprovalFilter {
  status?: ApprovalStatus;
  workflowInstanceId?: string;
  stepId?: string;
  employeeRole?: string;
  classification?: SideEffectClassification;
  /** Filter to approvals bound to a specific scheduled occurrence. */
  occurrenceId?: string;
}

export interface AuditFilter {
  workflowInstanceId?: string;
  stepId?: string;
  employeeRole?: string;
  classification?: SideEffectClassification;
  decision?: AuthorizationEffect;
  executedOnly?: boolean;
}
