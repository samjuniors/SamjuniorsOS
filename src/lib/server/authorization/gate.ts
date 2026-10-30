import {
  AuthorizationEvaluationRequest,
  AuthorizationDecision,
  FounderApprovalRecord,
  SideEffectAuditRecord,
  ApprovalScope,
  ActionTargetContext,
  SideEffectClassification,
  ApprovalFilter,
  AuditFilter,
} from '@/types/authorization';
import { AgentRole } from '@/types/os';
import { InMemoryApprovalStore, InMemoryAuditStore } from './approval-store';
import { SideEffectPolicyEvaluator } from './policy-evaluator';
import { computeApprovalPayloadHash, verifyApprovalPayloadBinding } from './payload-binding';
import { getIdempotencyStore, IdempotencyRecordData } from '../idempotency/store';
import {
  generateLogicalIdempotencyKey,
  IdempotencyPayloadMismatchError,
  OperationInProgressError,
  UnknownExternalResultError,
} from '../idempotency/state-machine';
import { v4 as uuidv4 } from 'uuid';

export interface ResolveInterruptedOperationParams {
  idempotencyKey: string;
  resolution: 'completed' | 'failed';
  response?: any;
  error?: string;
  reason: string;
  resolvedBy: string;
  userContext?: { role?: string; userId?: string };
}

export interface RequestApprovalParams {
  actionName: string;
  classification: SideEffectClassification;
  workflowInstanceId: string;
  stepId: string;
  employeeRole: AgentRole | 'advisor' | 'system';
  scope?: Partial<ApprovalScope>;
  notes?: string;
  target?: ActionTargetContext;
  payload?: any;
  requestedBy?: string;
}

export interface DecideApprovalParams {
  approvalId: string;
  decision: 'approved' | 'rejected';
  decidedBy: string;
  reason?: string;
  expiresAt?: string;
  userContext?: { role?: string; userId?: string };
  channel?: 'panel' | 'phone' | 'voice' | 'api';
}

export interface RevokeApprovalParams {
  approvalId: string;
  revokedBy: string;
  reason?: string;
  userContext?: { role?: string; userId?: string };
}

/**
 * Strict allowlist of recognized founder identities.
 * Loose prefixes (e.g. "founder-attacker") or unlisted roles are strictly rejected.
 */
export const ALLOWED_FOUNDER_IDENTITIES: readonly string[] = Object.freeze([
  'founder',
  'founder-001',
  'founder-local-session',
  'founder-production-session',
  'founder@samjuniors.com',
  'executive_founder',
  'executive-founder',
]);

/**
 * Validates whether an actor or verified userContext corresponds to an authorized Founder.
 */
export function isAuthorizedFounderIdentity(
  actor: string | undefined | null,
  userContext?: { role?: string; userId?: string }
): boolean {
  const normalizedActor = actor?.toLowerCase()?.trim() || '';
  if (ALLOWED_FOUNDER_IDENTITIES.includes(normalizedActor)) {
    return true;
  }
  if (userContext?.role === 'FOUNDER') {
    const ctxId = userContext.userId?.toLowerCase()?.trim();
    if (!ctxId || ALLOWED_FOUNDER_IDENTITIES.includes(ctxId) || ctxId === normalizedActor) {
      return true;
    }
  }
  return false;
}

export interface ExecuteWithGateParams<T> {
  request: AuthorizationEvaluationRequest;
  executeFn: () => Promise<T>;
  executionRef?: string;
  idempotency?: {
    key?: string;
    targetSystem?: string;
    logicalOpId?: string;
    payload?: any;
    ttlMs?: number;
  };
}

export interface ExecuteWithGateResult<T> {
  allowed: boolean;
  executed: boolean;
  decision: AuthorizationDecision;
  result?: T;
  error?: string;
  auditId: string;
  idempotencyKey?: string;
  idempotentReplay?: boolean;
}

/**
 * Central Side-Effect Authorization Gate.
 * Enforces company safety, Founder approval boundaries, audit trail generation,
 * and single server-side authorization enforcement before executing side effects.
 */
export class SideEffectAuthorizationGate {
  private static instance: SideEffectAuthorizationGate;
  private approvalStore: InMemoryApprovalStore;
  private auditStore: InMemoryAuditStore;
  private evaluator: SideEffectPolicyEvaluator;

  constructor(
    approvalStore?: InMemoryApprovalStore,
    auditStore?: InMemoryAuditStore,
    evaluator?: SideEffectPolicyEvaluator
  ) {
    this.approvalStore = approvalStore || InMemoryApprovalStore.getInstance();
    this.auditStore = auditStore || InMemoryAuditStore.getInstance();
    this.evaluator = evaluator || new SideEffectPolicyEvaluator(this.approvalStore);
  }

  public static getInstance(): SideEffectAuthorizationGate {
    if (!SideEffectAuthorizationGate.instance) {
      SideEffectAuthorizationGate.instance = new SideEffectAuthorizationGate();
    }
    return SideEffectAuthorizationGate.instance;
  }

  /**
   * Evaluate whether an intended action is allowed, requires approval, or is denied.
   */
  public async evaluateAuthorization(
    request: AuthorizationEvaluationRequest
  ): Promise<AuthorizationDecision> {
    return this.evaluator.evaluate(request);
  }

  /**
   * Request a new Founder Approval for an intended side effect.
   * When params.scope carries an occurrenceId (scheduled per-occurrence
   * approval, Phase 4.4B.1), the dedupe lookup is occurrence-bound: a prior
   * occurrence's approval never satisfies this occurrence's request.
   */
  public async requestApproval(params: RequestApprovalParams): Promise<FounderApprovalRecord> {
    const existing = await this.approvalStore.findActiveMatching({
      workflowInstanceId: params.workflowInstanceId,
      stepId: params.stepId,
      employeeRole: params.employeeRole,
      actionName: params.actionName,
      classification: params.classification,
      occurrenceId: params.scope?.occurrenceId,
    });

    // If there is already a pending or approved approval, return it
    if (existing && (existing.decision === 'pending' || existing.decision === 'approved')) {
      return existing;
    }

    const id = `appr-${uuidv4()}`;
    const now = new Date().toISOString();

    const scope: ApprovalScope = {
      scopeType: params.scope?.scopeType || 'step',
      workflowInstanceId: params.workflowInstanceId,
      stepId: params.stepId,
      campaignId: params.scope?.campaignId,
      targetSystem: params.target?.targetSystem || params.scope?.targetSystem,
      operationPattern: params.scope?.operationPattern,
      occurrenceId: params.scope?.occurrenceId,
      maxUses: params.scope?.maxUses || 1,
      usedCount: 0,
    };

    const payloadHash = computeApprovalPayloadHash(
      params.actionName,
      params.target,
      params.payload
    );

    const record: FounderApprovalRecord = {
      id,
      decision: 'pending',
      actionName: params.actionName,
      classification: params.classification,
      workflowInstanceId: params.workflowInstanceId,
      stepId: params.stepId,
      employeeRole: params.employeeRole,
      scope,
      requestedAt: now,
      notes: params.notes,
      target: params.target,
      payload: params.payload,
      payloadHash,
      isConsumed: false,
    };

    return this.approvalStore.save(record);
  }

  /**
   * Founder Decision Handler (Approve / Reject).
   * Strictly enforces that ONLY the Founder can approve or reject requests.
   * AI Employees (researcher, pm, coo, finance, advisor) cannot self-approve or approve others.
   */
  public async decideApproval(params: DecideApprovalParams): Promise<FounderApprovalRecord> {
    const isAllowedFounder = isAuthorizedFounderIdentity(params.decidedBy, params.userContext);

    if (!isAllowedFounder) {
      throw new Error(
        `Permission denied: Identity "${params.decidedBy}" is not an authorized Founder. Only verified Founder identities can approve or reject side-effect requests.`
      );
    }

    if (params.channel === 'voice' && params.decision === 'approved') {
      throw new Error(
        'Voice approval rejected: Consequential actions cannot be approved by voice (Gate G6.4). Approvals must be decided through panel or phone.'
      );
    }

    return this.approvalStore.decide(
      params.approvalId,
      params.decision,
      params.decidedBy,
      params.reason,
      params.expiresAt,
      params.channel
    );
  }

  /**
   * Founder Revocation Handler.
   * Immediately revokes a previously granted approval.
   * Strictly enforces Founder authorization allowlist (Audit 07 / G3.1).
   */
  public async revokeApproval(params: RevokeApprovalParams): Promise<FounderApprovalRecord> {
    const isAllowedFounder = isAuthorizedFounderIdentity(params.revokedBy, params.userContext);

    if (!isAllowedFounder) {
      throw new Error(
        `Permission denied: Identity "${params.revokedBy}" is not an authorized Founder. Only verified Founder identities can revoke approvals.`
      );
    }

    return this.approvalStore.revoke(params.approvalId, params.revokedBy, params.reason);
  }

  /**
   * Execute an operation behind the centralized Side-Effect Authorization Gate.
   * 1. Evaluates policy.
   * 2. If approval is required or denied, refuses execution and returns the decision.
   * 3. If allowed, verifies cryptographic payload binding and consumes single-use approval (if applicable).
   * 4. Executes executeFn.
   * 5. Emits a deterministic, unforgeable audit record.
   */
  public async executeWithGate<T>(params: ExecuteWithGateParams<T>): Promise<ExecuteWithGateResult<T>> {
    const { request, executeFn, executionRef } = params;
    const auditId = `audit-${uuidv4()}`;
    const timestamp = new Date().toISOString();
    const requestId = `req-${uuidv4()}`;

    // 0. Pre-Execution Idempotency Check (completed replay, in-progress conflict, ambiguous recovery, payload tampering)
    const shouldEnforceIdempotency = Boolean(
      params.idempotency ||
      request.classification === 'external_communication' ||
      request.classification === 'financial_action'
    );

    let idempotencyKey: string | undefined;
    let payloadHash: string | undefined;

    if (shouldEnforceIdempotency) {
      idempotencyKey = params.idempotency?.key || generateLogicalIdempotencyKey({
        actionName: request.actionName,
        targetSystem: params.idempotency?.targetSystem || request.target?.targetSystem || 'default',
        logicalOpId: params.idempotency?.logicalOpId || (request.workflowContext?.workflowInstanceId ? `${request.workflowContext.workflowInstanceId}-${request.workflowContext.stepId}` : (executionRef || requestId)),
      });

      const effectivePayload = params.idempotency?.payload !== undefined ? params.idempotency.payload : request.payload;
      payloadHash = computeApprovalPayloadHash(request.actionName, request.target, effectivePayload ?? {});

      const existing = await getIdempotencyStore().get(idempotencyKey);
      if (existing) {
        if (payloadHash && existing.payloadHash && existing.payloadHash !== payloadHash) {
          const mismatchErr = new IdempotencyPayloadMismatchError(
            idempotencyKey,
            existing.payloadHash,
            payloadHash
          );
          const auditRecord: SideEffectAuditRecord = {
            id: auditId,
            timestamp,
            requestId,
            employeeRole: request.employeeRole,
            requestedBy: request.requestedBy || request.employeeRole,
            skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
            workflowInstanceId: request.workflowContext?.workflowInstanceId,
            stepId: request.workflowContext?.stepId,
            actionClassification: request.classification,
            actionName: request.actionName,
            target: request.target,
            decision: 'denied',
            reasonCode: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            reason: mismatchErr.message,
            approvalId: request.approvalId,
            executionReference: executionRef,
            executed: false,
          };
          await this.auditStore.record(auditRecord);
          throw mismatchErr;
        }

        if (existing.status === 'completed') {
          const auditRecord: SideEffectAuditRecord = {
            id: auditId,
            timestamp,
            requestId,
            employeeRole: request.employeeRole,
            requestedBy: request.requestedBy || request.employeeRole,
            skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
            workflowInstanceId: request.workflowContext?.workflowInstanceId,
            stepId: request.workflowContext?.stepId,
            actionClassification: request.classification,
            actionName: request.actionName,
            target: request.target,
            decision: 'allowed',
            reasonCode: 'IDEMPOTENT_REPLAY',
            reason: `Operation already executed successfully with idempotency key ${idempotencyKey}. Replaying cached response without re-invoking side effect.`,
            approvalId: request.approvalId,
            executionReference: existing.executionRef || executionRef,
            executed: false,
          };
          await this.auditStore.record(auditRecord);

          return {
            allowed: true,
            executed: false,
            decision: {
              effect: 'allowed',
              reasonCode: 'IDEMPOTENT_REPLAY',
              reason: `Operation already executed successfully with idempotency key ${idempotencyKey}. Replaying cached response without re-invoking side effect.`,
              approvalId: request.approvalId,
              evaluatedAt: timestamp,
              evaluator: 'central_side_effect_gate',
            },
            result: existing.response as T,
            auditId,
            idempotencyKey,
            idempotentReplay: true,
          };
        }

        if (existing.status === 'in_progress') {
          const inProgressErr = new OperationInProgressError(idempotencyKey, existing.executionRef || undefined, existing.createdAt);
          const auditRecord: SideEffectAuditRecord = {
            id: auditId,
            timestamp,
            requestId,
            employeeRole: request.employeeRole,
            requestedBy: request.requestedBy || request.employeeRole,
            skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
            workflowInstanceId: request.workflowContext?.workflowInstanceId,
            stepId: request.workflowContext?.stepId,
            actionClassification: request.classification,
            actionName: request.actionName,
            target: request.target,
            decision: 'denied',
            reasonCode: 'OPERATION_IN_PROGRESS',
            reason: inProgressErr.message,
            approvalId: request.approvalId,
            executionReference: executionRef,
            executed: false,
          };
          await this.auditStore.record(auditRecord);
          throw inProgressErr;
        }

        if (existing.status === 'unknown') {
          const unknownErr = new UnknownExternalResultError(
            idempotencyKey,
            existing.executionRef || undefined,
            'Operation has ambiguous prior execution status (crash/timeout recovery state). Manual or reconciliatory inspection required before retrying.'
          );
          const auditRecord: SideEffectAuditRecord = {
            id: auditId,
            timestamp,
            requestId,
            employeeRole: request.employeeRole,
            requestedBy: request.requestedBy || request.employeeRole,
            skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
            workflowInstanceId: request.workflowContext?.workflowInstanceId,
            stepId: request.workflowContext?.stepId,
            actionClassification: request.classification,
            actionName: request.actionName,
            target: request.target,
            decision: 'denied',
            reasonCode: 'UNKNOWN_EXTERNAL_RESULT',
            reason: unknownErr.message,
            approvalId: request.approvalId,
            executionReference: executionRef,
            executed: false,
          };
          await this.auditStore.record(auditRecord);
          throw unknownErr;
        }
      }
    }

    // 1. Evaluate authorization
    const decision = await this.evaluateAuthorization(request);

    // 2. If not allowed, record audit and return blocked result
    if (decision.effect !== 'allowed') {
      const auditRecord: SideEffectAuditRecord = {
        id: auditId,
        timestamp,
        requestId,
        employeeRole: request.employeeRole,
        requestedBy: request.requestedBy || request.employeeRole,
        skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
        workflowInstanceId: request.workflowContext?.workflowInstanceId,
        stepId: request.workflowContext?.stepId,
        actionClassification: request.classification,
        actionName: request.actionName,
        target: request.target,
        decision: decision.effect,
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        approvalId: decision.approvalId,
        executionReference: undefined,
        executed: false,
      };

      await this.auditStore.record(auditRecord);

      return {
        allowed: false,
        executed: false,
        decision,
        auditId,
        error: decision.reason,
      };
    }

    // 3. If allowed, verify cryptographic approval-payload binding
    let approval: FounderApprovalRecord | null = null;
    if (decision.approvalId) {
      approval = await this.approvalStore.get(decision.approvalId);
      if (!approval) {
        const missingApprovalReason = `Approval record (${decision.approvalId}) not found in store. Execution blocked.`;
        const auditRecord: SideEffectAuditRecord = {
          id: auditId,
          timestamp,
          requestId,
          employeeRole: request.employeeRole,
          requestedBy: request.requestedBy || request.employeeRole,
          skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
          workflowInstanceId: request.workflowContext?.workflowInstanceId,
          stepId: request.workflowContext?.stepId,
          actionClassification: request.classification,
          actionName: request.actionName,
          target: request.target,
          decision: 'denied',
          reasonCode: 'APPROVAL_NOT_FOUND',
          reason: missingApprovalReason,
          approvalId: decision.approvalId,
          executionReference: executionRef,
          executed: false,
        };

        await this.auditStore.record(auditRecord);

        return {
          allowed: false,
          executed: false,
          decision: {
            effect: 'denied',
            reasonCode: 'APPROVAL_NOT_FOUND',
            reason: missingApprovalReason,
            approvalId: decision.approvalId,
            evaluatedAt: timestamp,
            evaluator: 'central_side_effect_gate',
          },
          auditId,
          error: missingApprovalReason,
        };
      }

      // Enforce mandatory cryptographic payload binding:
      // Any approval-backed consequential execution MUST have a payload hash.
      if (!approval.payloadHash) {
        const missingHashReason = `Cryptographic payload binding missing: approval record (${approval.id}) does not contain a mandatory payloadHash. Consequential execution denied.`;
        const auditRecord: SideEffectAuditRecord = {
          id: auditId,
          timestamp,
          requestId,
          employeeRole: request.employeeRole,
          requestedBy: request.requestedBy || request.employeeRole,
          skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
          workflowInstanceId: request.workflowContext?.workflowInstanceId,
          stepId: request.workflowContext?.stepId,
          actionClassification: request.classification,
          actionName: request.actionName,
          target: request.target,
          decision: 'denied',
          reasonCode: 'APPROVAL_PAYLOAD_HASH_MISSING',
          reason: missingHashReason,
          approvalId: decision.approvalId,
          executionReference: executionRef,
          executed: false,
        };

        await this.auditStore.record(auditRecord);

        return {
          allowed: false,
          executed: false,
          decision: {
            effect: 'denied',
            reasonCode: 'APPROVAL_PAYLOAD_HASH_MISSING',
            reason: missingHashReason,
            approvalId: decision.approvalId,
            evaluatedAt: timestamp,
            evaluator: 'central_side_effect_gate',
          },
          auditId,
          error: missingHashReason,
        };
      }

      // Enforce deterministic payload binding verification
      const bindingCheck = verifyApprovalPayloadBinding(approval, {
        actionName: request.actionName,
        target: request.target,
        payload: request.payload,
      });

      if (!bindingCheck.isMatch) {
        const mismatchReason = `Cryptographic payload binding mismatch: payload or target was altered after Founder approval was granted (expected: ${bindingCheck.expectedHash}, got: ${bindingCheck.actualHash}). Execution blocked.`;
        const auditRecord: SideEffectAuditRecord = {
          id: auditId,
          timestamp,
          requestId,
          employeeRole: request.employeeRole,
          requestedBy: request.requestedBy || request.employeeRole,
          skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
          workflowInstanceId: request.workflowContext?.workflowInstanceId,
          stepId: request.workflowContext?.stepId,
          actionClassification: request.classification,
          actionName: request.actionName,
          target: request.target,
          decision: 'denied',
          reasonCode: 'APPROVAL_PAYLOAD_HASH_MISMATCH',
          reason: mismatchReason,
          approvalId: decision.approvalId,
          executionReference: executionRef,
          executed: false,
        };

        await this.auditStore.record(auditRecord);

        return {
          allowed: false,
          executed: false,
          decision: {
            effect: 'denied',
            reasonCode: 'APPROVAL_PAYLOAD_HASH_MISMATCH',
            reason: mismatchReason,
            approvalId: decision.approvalId,
            evaluatedAt: timestamp,
            evaluator: 'central_side_effect_gate',
          },
          auditId,
          error: mismatchReason,
        };
      }
    }

    // 4. Atomic Idempotency Claiming
    if (shouldEnforceIdempotency && idempotencyKey && payloadHash) {
      try {
        await getIdempotencyStore().claim({
          key: idempotencyKey,
          actionName: request.actionName,
          payloadHash,
          executionRef: executionRef || auditId,
          ttlMs: params.idempotency?.ttlMs,
        });
      } catch (claimErr: any) {
        if (claimErr instanceof IdempotencyPayloadMismatchError) {
          const auditRecord: SideEffectAuditRecord = {
            id: auditId,
            timestamp,
            requestId,
            employeeRole: request.employeeRole,
            requestedBy: request.requestedBy || request.employeeRole,
            skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
            workflowInstanceId: request.workflowContext?.workflowInstanceId,
            stepId: request.workflowContext?.stepId,
            actionClassification: request.classification,
            actionName: request.actionName,
            target: request.target,
            decision: 'denied',
            reasonCode: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            reason: claimErr.message,
            approvalId: decision.approvalId,
            executionReference: executionRef,
            executed: false,
          };
          await this.auditStore.record(auditRecord);
        } else if (claimErr instanceof OperationInProgressError) {
          const auditRecord: SideEffectAuditRecord = {
            id: auditId,
            timestamp,
            requestId,
            employeeRole: request.employeeRole,
            requestedBy: request.requestedBy || request.employeeRole,
            skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
            workflowInstanceId: request.workflowContext?.workflowInstanceId,
            stepId: request.workflowContext?.stepId,
            actionClassification: request.classification,
            actionName: request.actionName,
            target: request.target,
            decision: 'denied',
            reasonCode: 'OPERATION_IN_PROGRESS',
            reason: claimErr.message,
            approvalId: decision.approvalId,
            executionReference: executionRef,
            executed: false,
          };
          await this.auditStore.record(auditRecord);
        } else if (claimErr instanceof UnknownExternalResultError) {
          const auditRecord: SideEffectAuditRecord = {
            id: auditId,
            timestamp,
            requestId,
            employeeRole: request.employeeRole,
            requestedBy: request.requestedBy || request.employeeRole,
            skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
            workflowInstanceId: request.workflowContext?.workflowInstanceId,
            stepId: request.workflowContext?.stepId,
            actionClassification: request.classification,
            actionName: request.actionName,
            target: request.target,
            decision: 'denied',
            reasonCode: 'UNKNOWN_EXTERNAL_RESULT',
            reason: claimErr.message,
            approvalId: decision.approvalId,
            executionReference: executionRef,
            executed: false,
          };
          await this.auditStore.record(auditRecord);
        }
        throw claimErr;
      }
    }

    // 5. Consume single-use approval only after authorization + idempotency claim pass.
    // Phase 4.4B.1: occurrence-bound approvals are single-use BY DEFINITION (one
    // founder authorization per scheduled occurrence) — consume them at
    // execution regardless of the recorded scopeType, in addition to the
    // existing single_action rule.
    if (
      decision.approvalId &&
      approval &&
      (approval.scope.scopeType === 'single_action' || Boolean(approval.scope.occurrenceId))
    ) {
      await this.approvalStore.consume(decision.approvalId);
    }

    // 6. Execute the authorized operation
    let result: T;
    try {
      result = await executeFn();
    } catch (err: any) {
      const isAmbiguousTimeout =
        err?.name === 'TimeoutError' ||
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ECONNRESET' ||
        err?.isAmbiguous === true ||
        /timeout|timed out|abort/i.test(err?.message || '');

      if (shouldEnforceIdempotency && idempotencyKey) {
        if (isAmbiguousTimeout) {
          await getIdempotencyStore().markUnknown(
            idempotencyKey,
            err?.message || 'Execution timed out or aborted with ambiguous provider state'
          );
        } else {
          await getIdempotencyStore().fail(
            idempotencyKey,
            err?.message || 'Execution failed'
          );
        }
      }

      const auditRecord: SideEffectAuditRecord = {
        id: auditId,
        timestamp,
        requestId,
        employeeRole: request.employeeRole,
        requestedBy: request.requestedBy || request.employeeRole,
        skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
        workflowInstanceId: request.workflowContext?.workflowInstanceId,
        stepId: request.workflowContext?.stepId,
        actionClassification: request.classification,
        actionName: request.actionName,
        target: request.target,
        decision: 'allowed',
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        approvalId: decision.approvalId,
        executionReference: executionRef,
        executed: false, // Execution threw error
      };

      await this.auditStore.record(auditRecord);

      if (isAmbiguousTimeout) {
        throw new UnknownExternalResultError(idempotencyKey || 'unknown', executionRef, err?.message || 'Operation timed out; external state is unknown');
      }
      throw err;
    }

    // 7. Record completion in idempotency store
    if (shouldEnforceIdempotency && idempotencyKey) {
      await getIdempotencyStore().complete(idempotencyKey, result, executionRef || auditId);
    }

    // 8. Record successful execution in audit trail
    const auditRecord: SideEffectAuditRecord = {
      id: auditId,
      timestamp,
      requestId,
      employeeRole: request.employeeRole,
      requestedBy: request.requestedBy || request.employeeRole,
      skillId: typeof request.skillId === 'string' ? request.skillId : undefined,
      workflowInstanceId: request.workflowContext?.workflowInstanceId,
      stepId: request.workflowContext?.stepId,
      actionClassification: request.classification,
      actionName: request.actionName,
      target: request.target,
      decision: 'allowed',
      reasonCode: decision.reasonCode,
      reason: decision.reason,
      approvalId: decision.approvalId,
      executionReference: executionRef || `exec-${Date.now()}`,
      executed: true,
    };

    await this.auditStore.record(auditRecord);

    return {
      allowed: true,
      executed: true,
      decision,
      result,
      auditId,
      idempotencyKey,
      idempotentReplay: false,
    };
  }

  public getApprovalStore(): InMemoryApprovalStore {
    return this.approvalStore;
  }

  public getAuditStore(): InMemoryAuditStore {
    return this.auditStore;
  }

  public async listApprovals(filter?: ApprovalFilter): Promise<FounderApprovalRecord[]> {
    return this.approvalStore.list(filter);
  }

  public async listAudits(filter?: AuditFilter): Promise<SideEffectAuditRecord[]> {
    return this.auditStore.list(filter);
  }

  /**
   * List interrupted operations that require operator or Founder attention.
   * Scans idempotency records for 'in_progress' and 'unknown' states.
   */
  public async listInterruptedOperations(): Promise<IdempotencyRecordData[]> {
    const store = getIdempotencyStore();
    const inProgress = await store.list({ status: 'in_progress' });
    const unknown = await store.list({ status: 'unknown' });
    return [...inProgress, ...unknown];
  }

  /**
   * Reconcile missing audit record for an operation that completed in idempotency store
   * but crashed before the audit trail record could be written.
   * Safe to call repeatedly (idempotent).
   */
  public async reconcileMissingAudit(idempotencyKey: string): Promise<SideEffectAuditRecord | null> {
    const record = await getIdempotencyStore().get(idempotencyKey);
    if (!record || record.status !== 'completed') {
      return null;
    }

    const existingAudits = await this.auditStore.list();
    const match = existingAudits.find(
      (a) => a.executionReference === record.executionRef || a.id === record.executionRef
    );

    if (match) {
      return match;
    }

    const reconciledAudit: SideEffectAuditRecord = {
      id: `audit-rec-${uuidv4()}`,
      timestamp: new Date().toISOString(),
      requestId: `req-rec-${idempotencyKey}`,
      employeeRole: 'system',
      requestedBy: 'recovery_reconciliation',
      actionClassification: 'external_record_mutation',
      actionName: record.actionName,
      decision: 'allowed',
      reasonCode: 'AUDIT_RECONCILED',
      reason: `Reconciled missing audit record for completed operation with idempotency key ${idempotencyKey}`,
      executionReference: record.executionRef || idempotencyKey,
      executed: true,
    };

    await this.auditStore.record(reconciledAudit);
    return reconciledAudit;
  }

  /**
   * Founder Override and Manual Resolution for Interrupted or Ambiguous Operations.
   * Strictly enforces Founder authorization.
   * Every resolution creates an immutable audit trail with FOUNDER_MANUAL_RECONCILIATION.
   * Guarantees:
   * - Cannot silently reset an approval (consumed approvals stay consumed).
   * - Completed operations cannot be marked failed.
   * - Repeated resolutions are idempotent.
   */
  public async resolveInterruptedOperation(
    params: ResolveInterruptedOperationParams
  ): Promise<{ success: boolean; record: IdempotencyRecordData; auditId: string }> {
    const isAllowedFounder = isAuthorizedFounderIdentity(params.resolvedBy, params.userContext);

    if (!isAllowedFounder) {
      throw new Error(
        `Permission denied: Identity "${params.resolvedBy}" is not an authorized Founder. Only verified Founder identities can resolve interrupted side-effect operations.`
      );
    }

    const store = getIdempotencyStore();
    const existing = await store.get(params.idempotencyKey);
    if (!existing) {
      throw new Error(`Idempotency record not found for key: ${params.idempotencyKey}`);
    }

    // If already completed:
    if (existing.status === 'completed') {
      if (params.resolution === 'failed') {
        throw new Error('Cannot mark completed operation as failed: operation already durably completed.');
      }
      // Idempotent resolution
      return { success: true, record: existing, auditId: 'already_completed' };
    }

    const auditId = `audit-override-${uuidv4()}`;
    const executionRef = existing.executionRef || `override-${Date.now()}`;
    let updatedRecord: IdempotencyRecordData;

    if (params.resolution === 'completed') {
      updatedRecord = await store.complete(params.idempotencyKey, params.response, executionRef);
      const auditRecord: SideEffectAuditRecord = {
        id: auditId,
        timestamp: new Date().toISOString(),
        requestId: `req-override-${params.idempotencyKey}`,
        employeeRole: 'system',
        requestedBy: params.resolvedBy,
        actionClassification: 'external_record_mutation',
        actionName: existing.actionName,
        decision: 'allowed',
        reasonCode: 'FOUNDER_MANUAL_RECONCILIATION',
        reason: `Founder manual resolution [completed]: ${params.reason}`,
        executionReference: executionRef,
        executed: true,
      };
      await this.auditStore.record(auditRecord);
    } else {
      updatedRecord = await store.fail(params.idempotencyKey, params.error || params.reason, executionRef);
      const auditRecord: SideEffectAuditRecord = {
        id: auditId,
        timestamp: new Date().toISOString(),
        requestId: `req-override-${params.idempotencyKey}`,
        employeeRole: 'system',
        requestedBy: params.resolvedBy,
        actionClassification: 'external_record_mutation',
        actionName: existing.actionName,
        decision: 'allowed',
        reasonCode: 'FOUNDER_MANUAL_RECONCILIATION',
        reason: `Founder manual resolution [failed]: ${params.reason}`,
        executionReference: executionRef,
        executed: false,
      };
      await this.auditStore.record(auditRecord);
    }

    return { success: true, record: updatedRecord, auditId };
  }
}
