import {
  AuthorizationEvaluationRequest,
  AuthorizationDecision,
  AuthorizationReasonCode,
  FounderApprovalRecord,
  SideEffectClassification,
} from '@/types/authorization';
import { InMemoryApprovalStore } from './approval-store';

/**
 * Deterministic Side-Effect Policy Evaluator.
 * Pure governance boundary that determines whether an AI Employee action is
 * allowed, requires Founder approval, or is denied.
 */
export class SideEffectPolicyEvaluator {
  private approvalStore: InMemoryApprovalStore;

  constructor(approvalStore?: InMemoryApprovalStore) {
    this.approvalStore = approvalStore || InMemoryApprovalStore.getInstance();
  }

  /**
   * Evaluate authorization request against company governance and approval states.
   */
  public async evaluate(
    request: AuthorizationEvaluationRequest,
    existingApproval?: FounderApprovalRecord | null
  ): Promise<AuthorizationDecision> {
    const evaluatedAt = new Date().toISOString();

    // 1. Advisor Autonomy & Execution Ban
    // The Advisor role has no side-effect or external tool execution authority under any circumstance.
    if (request.employeeRole === 'advisor') {
      return {
        effect: 'denied',
        reasonCode: 'DENIED_ADVISOR_EXECUTION_PROHIBITED',
        reason: 'The Advisor role is strictly advisory and prohibited from executing side effects or mutating external state.',
        evaluatedAt,
        evaluator: 'central_side_effect_gate',
      };
    }

    // 2. Read-Only Operations (Always Allowed for authorized roles)
    if (request.classification === 'read_only') {
      return {
        effect: 'allowed',
        reasonCode: 'READ_ONLY_ALLOWED',
        reason: 'Read-only action does not modify external or persistent system state.',
        evaluatedAt,
        evaluator: 'central_side_effect_gate',
      };
    }

    // 3. Internal Mutations (Local state transitions within authorized company role bounds)
    if (request.classification === 'internal_mutation') {
      const allowedRoles = ['coo', 'researcher', 'pm', 'finance', 'system'];
      if (!allowedRoles.includes(request.employeeRole)) {
        return {
          effect: 'denied',
          reasonCode: 'DENIED_ROLE_PERMISSION_DISALLOWED',
          reason: `Role "${request.employeeRole}" lacks permission to perform internal state mutation.`,
          evaluatedAt,
          evaluator: 'central_side_effect_gate',
        };
      }
      return {
        effect: 'allowed',
        reasonCode: 'INTERNAL_MUTATION_ALLOWED',
        reason: 'Internal mutation authorized within employee role boundaries.',
        evaluatedAt,
        evaluator: 'central_side_effect_gate',
      };
    }

    // 4. Retrieve or match approval record for external / high-impact / financial operations
    let approval = existingApproval;
    if (approval === undefined && request.workflowContext) {
      approval = await this.approvalStore.findActiveMatching({
        workflowInstanceId: request.workflowContext.workflowInstanceId,
        stepId: request.workflowContext.stepId,
        employeeRole: request.employeeRole,
        actionName: request.actionName,
        classification: request.classification,
      });
    }

    // 5. Evaluate if an existing approval record is present
    if (approval) {
      // 5a. Revocation Check (Overrides everything)
      if (approval.decision === 'revoked') {
        return {
          effect: 'denied',
          reasonCode: 'APPROVAL_REVOKED',
          reason: `Action blocked: Previous approval (${approval.id}) was explicitly revoked by Founder. Reason: ${approval.decisionReason || 'Revoked'}`,
          approvalId: approval.id,
          approvalStatus: 'revoked',
          evaluatedAt,
          evaluator: 'central_side_effect_gate',
        };
      }

      // 5b. Rejection Check
      if (approval.decision === 'rejected') {
        return {
          effect: 'denied',
          reasonCode: 'APPROVAL_REJECTED',
          reason: `Action blocked: Founder rejected approval request (${approval.id}). Reason: ${approval.decisionReason || 'Rejected'}`,
          approvalId: approval.id,
          approvalStatus: 'rejected',
          evaluatedAt,
          evaluator: 'central_side_effect_gate',
        };
      }

      // 5c. Expiration Check
      if (approval.decision === 'expired' || (approval.expiresAt && new Date(approval.expiresAt).getTime() < Date.now())) {
        return {
          effect: 'denied',
          reasonCode: 'APPROVAL_EXPIRED',
          reason: `Action blocked: Founder approval (${approval.id}) has expired (TTL exceeded). A new approval must be requested.`,
          approvalId: approval.id,
          approvalStatus: 'expired',
          evaluatedAt,
          evaluator: 'central_side_effect_gate',
        };
      }

      // 5d. Pending Check
      if (approval.decision === 'pending') {
        return {
          effect: 'approval_required',
          reasonCode: 'APPROVAL_PENDING',
          reason: `Action requires Founder approval. Pending approval request: ${approval.id}.`,
          approvalId: approval.id,
          approvalStatus: 'pending',
          evaluatedAt,
          evaluator: 'central_side_effect_gate',
        };
      }

      // 5e. Approved - Validate Specific Scope
      if (approval.decision === 'approved') {
        // Check single_action consumption
        if (approval.scope.scopeType === 'single_action' && approval.isConsumed) {
          return {
            effect: 'denied',
            reasonCode: 'APPROVAL_CONSUMED',
            reason: `Action blocked: Single-action approval (${approval.id}) has already been consumed by a previous execution attempt.`,
            approvalId: approval.id,
            approvalStatus: 'approved',
            evaluatedAt,
            evaluator: 'central_side_effect_gate',
          };
        }

        // Scope verification
        const scopeMismatch = this.verifyScopeMatch(approval, request);
        if (scopeMismatch) {
          return {
            effect: 'denied',
            reasonCode: 'APPROVAL_SCOPE_MISMATCH',
            reason: `Action blocked due to approval scope mismatch: ${scopeMismatch}`,
            approvalId: approval.id,
            approvalStatus: 'approved',
            evaluatedAt,
            evaluator: 'central_side_effect_gate',
          };
        }

        return {
          effect: 'allowed',
          reasonCode: 'APPROVED_BY_FOUNDER',
          reason: `Action explicitly authorized by Founder approval record (${approval.id}).`,
          approvalId: approval.id,
          approvalStatus: 'approved',
          evaluatedAt,
          evaluator: 'central_side_effect_gate',
        };
      }
    }

    // 6. Default Policies for Unapproved Side-Effects

    // 6a. Financial Actions (Strict Safety Rule: Autonomous financial operations forbidden)
    if (request.classification === 'financial_action') {
      return {
        effect: 'approval_required',
        reasonCode: 'APPROVAL_REQUIRED_FINANCIAL',
        reason: 'Financial action involves monetary transfer or commitment; requires explicit, dedicated Founder approval.',
        evaluatedAt,
        evaluator: 'central_side_effect_gate',
      };
    }

    // 6b. High Impact Actions
    if (request.classification === 'high_impact_action') {
      return {
        effect: 'approval_required',
        reasonCode: 'APPROVAL_REQUIRED_HIGH_IMPACT',
        reason: 'High-impact action involves destructive or wide-reaching changes; requires explicit Founder approval.',
        evaluatedAt,
        evaluator: 'central_side_effect_gate',
      };
    }

    // 6c. External Communication (Email, messaging, public broadcast)
    if (request.classification === 'external_communication') {
      return {
        effect: 'approval_required',
        reasonCode: 'APPROVAL_REQUIRED_EXTERNAL_COMMUNICATION',
        reason: 'External communication to third parties requires explicit Founder review and approval.',
        evaluatedAt,
        evaluator: 'central_side_effect_gate',
      };
    }

    // 6d. External Record Mutation (CRM updates, external database writes, GitHub issues/PRs)
    if (request.classification === 'external_record_mutation') {
      return {
        effect: 'approval_required',
        reasonCode: 'APPROVAL_REQUIRED_EXTERNAL_RECORD_MUTATION',
        reason: 'Modifying external third-party records requires Founder approval.',
        evaluatedAt,
        evaluator: 'central_side_effect_gate',
      };
    }

    // Fallback: Default to Deny
    return {
      effect: 'denied',
      reasonCode: 'DENIED_INVALID_CONTEXT',
      reason: 'Action cannot be authorized: Unknown classification or unhandled policy criteria.',
      evaluatedAt,
      evaluator: 'central_side_effect_gate',
    };
  }

  /**
   * Verify that the approval scope encompasses the requested action.
   * Returns error string if mismatch, or null if matched.
   */
  private verifyScopeMatch(
    approval: FounderApprovalRecord,
    request: AuthorizationEvaluationRequest
  ): string | null {
    const scope = approval.scope;

    // Check Employee Role matching
    if (approval.employeeRole !== request.employeeRole && approval.employeeRole !== 'system') {
      return `Approval was granted for role "${approval.employeeRole}", but requested by role "${request.employeeRole}"`;
    }

    // Check Classification matching
    if (approval.classification !== request.classification) {
      return `Approval classification is "${approval.classification}", but requested action classification is "${request.classification}"`;
    }

    // Check Workflow Instance matching
    if (scope.scopeType === 'step' || scope.scopeType === 'workflow_instance' || scope.scopeType === 'single_action') {
      if (
        scope.workflowInstanceId &&
        request.workflowContext?.workflowInstanceId &&
        scope.workflowInstanceId !== request.workflowContext.workflowInstanceId
      ) {
        return `Approval is scoped to workflow instance "${scope.workflowInstanceId}", but action is executing in instance "${request.workflowContext.workflowInstanceId}"`;
      }
    }

    // Check Step matching
    if (scope.scopeType === 'step' || scope.scopeType === 'single_action') {
      if (
        scope.stepId &&
        request.workflowContext?.stepId &&
        scope.stepId !== request.workflowContext.stepId
      ) {
        return `Approval is scoped to step "${scope.stepId}", but action is executing in step "${request.workflowContext.stepId}"`;
      }
    }

    // Check Campaign matching
    if (scope.scopeType === 'campaign') {
      if (scope.campaignId && request.target?.resourceId && scope.campaignId !== request.target.resourceId) {
        return `Approval is scoped to campaign "${scope.campaignId}", but action targets campaign "${request.target.resourceId}"`;
      }
    }

    // Check Target System matching
    if (scope.targetSystem && request.target?.targetSystem && scope.targetSystem !== request.target.targetSystem) {
      return `Approval is scoped to target system "${scope.targetSystem}", but action targets "${request.target.targetSystem}"`;
    }

    return null;
  }
}
