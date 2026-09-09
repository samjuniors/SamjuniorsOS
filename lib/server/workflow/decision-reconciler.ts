import { FounderApprovalRecord } from '@/types/authorization';
import { SideEffectAuthorizationGate } from '../authorization/gate';
import { WorkflowRuntime } from './runtime';
import { getWorkflowStore } from './store';

/**
 * Decision Reconciler — the Phase 3 Command Center command/action layer for
 * Founder approval decisions.
 *
 * Responsibility: after the Founder's decision has been durably recorded by the
 * SideEffectAuthorizationGate (the authority — this module NEVER decides anything
 * itself), propagate that decision into the bound workflow instance using the
 * existing WorkflowRuntime:
 *
 *   approve → resumeWorkflow → evaluateReadiness advances the approved step to
 *             'ready' (the runtime honors the authoritative record) →
 *             executeReadyStep executes it THROUGH the gate (payload binding,
 *             single-use consumption, idempotency, audit) with atomic claims.
 *
 *   reject / revoke → resumeWorkflow → evaluateReadiness re-evaluates the step
 *             against the now-rejected/revoked record → the policy evaluator
 *             returns a denial (APPROVAL_REJECTED / APPROVAL_REVOKED) → the
 *             step transitions to 'blocked' — fail-closed through existing
 *             machinery, never by mutating governance state directly.
 *
 * This module contains NO authorization logic of its own. It cannot grant,
 * weaken, or bypass anything: every path it drives re-enters the existing
 * authorization gate and state machine. It is deliberately tolerant of
 * concurrent/duplicate reconciliation because the runtime's claimStepAtomic
 * (optimistic concurrency) already guarantees exactly-once step execution.
 */

export interface DecisionReconciliationResult {
  approvalId: string;
  decision: 'approved' | 'rejected' | 'revoked';
  /** true when a bound workflow instance was found and reconciliation was driven */
  reconciled: boolean;
  workflowInstanceId?: string;
  stepId?: string;
  /** durable instance status after reconciliation (authoritative read-back) */
  workflowStatus?: string;
  /** durable step status after reconciliation (authoritative read-back) */
  stepStatus?: string;
  /** number of immutable side-effect audit records now bound to this step */
  auditRecords: number;
  /** human-readable outcome for the Founder surface */
  outcomeNote: string;
  /** reconciliation-level error; the decision itself remains durable when set */
  error?: string;
}

/**
 * Reconciles a Founder decision (already durably recorded in the approval
 * record) into its bound workflow instance.
 */
export async function reconcileFounderDecision(
  record: FounderApprovalRecord,
  options?: { runtime?: WorkflowRuntime }
): Promise<DecisionReconciliationResult> {
  const base: DecisionReconciliationResult = {
    approvalId: record.id,
    decision: record.decision === 'revoked' ? 'revoked' : (record.decision as 'approved' | 'rejected'),
    reconciled: false,
    auditRecords: 0,
    outcomeNote: '',
  };

  // 1. Standalone approvals (not bound to a workflow step) need no reconciliation.
  if (!record.workflowInstanceId || !record.stepId) {
    return {
      ...base,
      outcomeNote:
        'Decision recorded. Approval is not bound to a workflow step; no runtime reconciliation required.',
    };
  }

  const { workflowInstanceId, stepId } = record;

  try {
    const store = getWorkflowStore();
    const runtime = options?.runtime || new WorkflowRuntime();
    const gate = SideEffectAuthorizationGate.getInstance();

    // 2. The bound instance must exist (approvals may outlive their instance data
    //    in degraded/legacy situations; the decision still stands on its own).
    const instance = await store.getInstance(workflowInstanceId);
    if (!instance) {
      return {
        ...base,
        workflowInstanceId,
        stepId,
        outcomeNote: `Decision recorded. Bound workflow instance ${workflowInstanceId} no longer exists; no reconciliation performed.`,
      };
    }

    const step = instance.stepStates[stepId];
    if (!step) {
      return {
        ...base,
        workflowInstanceId,
        stepId,
        workflowStatus: instance.status,
        outcomeNote: `Decision recorded. Step ${stepId} not found in instance ${workflowInstanceId}; no reconciliation performed.`,
      };
    }

    // 3. Only steps still awaiting this approval need to be driven. Steps already
    //    completed/failed/cancelled are durable outcomes of prior reconciliation
    //    (idempotent duplicate decision); steps ready/running mean another worker
    //    is already resuming — the runtime's atomic claim guarantees single
    //    execution, so we do not stack a second resume wave on top.
    if (step.status !== 'awaiting_approval') {
      const audits = await gate.listAudits({ workflowInstanceId, stepId });
      return {
        ...base,
        reconciled: true,
        workflowInstanceId,
        stepId,
        workflowStatus: instance.status,
        stepStatus: step.status,
        auditRecords: audits.length,
        outcomeNote: `Decision recorded. Step already in durable state '${step.status}' (prior or concurrent reconciliation); no duplicate execution driven.`,
      };
    }

    // 4. Drive the existing runtime. For approvals this evaluates readiness (the
    //    authoritative record advances the step) and executes it through the
    //    SideEffectAuthorizationGate; for rejections/revocations the policy
    //    evaluator denies the step and it fails closed into 'blocked'.
    await runtime.resumeWorkflow(workflowInstanceId, {
      workerId: 'founder-decision-reconciler',
    });

    // 5. Authoritative read-back of the durable result.
    const finalInstance = await store.getInstance(workflowInstanceId);
    const finalStep = finalInstance?.stepStates[stepId];
    const audits = await gate.listAudits({ workflowInstanceId, stepId });

    const result: DecisionReconciliationResult = {
      ...base,
      reconciled: true,
      workflowInstanceId,
      stepId,
      workflowStatus: finalInstance?.status,
      stepStatus: finalStep?.status,
      auditRecords: audits.length,
      outcomeNote: '',
    };

    if (record.decision === 'approved') {
      if (finalStep?.status === 'completed') {
        result.outcomeNote = `Approved and executed: workflow step '${stepId}' completed durably (workflow status: ${finalInstance?.status}).`;
      } else if (finalStep?.status === 'blocked' || finalStep?.status === 'failed') {
        result.outcomeNote = `Approved, but execution did not complete: step '${stepId}' ended in '${finalStep.status}' (${finalStep.blockedReason || finalStep.error || 'see audit trail'}). The decision remains recorded.`;
      } else {
        result.outcomeNote = `Approved and submitted to the runtime: step '${stepId}' is now '${finalStep?.status}' (workflow status: ${finalInstance?.status}).`;
      }
    } else {
      result.outcomeNote = `Decision '${record.decision}' recorded and enforced: step '${stepId}' is now '${finalStep?.status}' (workflow status: ${finalInstance?.status}). No side effect was executed.`;
    }

    return result;
  } catch (err: any) {
    // The Founder's decision is already durable; a reconciliation/infrastructure
    // failure must be reported honestly without rolling anything back. The step
    // remains 'awaiting_approval' and reconciliation can be retried — this is
    // fail-closed, not fail-silent.
    return {
      ...base,
      workflowInstanceId,
      stepId,
      outcomeNote:
        'Decision recorded durably, but workflow reconciliation FAILED — the workflow was not resumed. Retry the decision or resume the workflow; do NOT re-execute the side effect manually.',
      error: err?.message || String(err),
    };
  }
}
