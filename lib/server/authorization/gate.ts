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
import { v4 as uuidv4 } from 'uuid';

export interface RequestApprovalParams {
  actionName: string;
  classification: SideEffectClassification;
  workflowInstanceId: string;
  stepId: string;
  employeeRole: AgentRole | 'advisor' | 'system';
  scope?: Partial<ApprovalScope>;
  notes?: string;
  target?: ActionTargetContext;
  requestedBy?: string;
}

export interface DecideApprovalParams {
  approvalId: string;
  decision: 'approved' | 'rejected';
  decidedBy: string;
  reason?: string;
  expiresAt?: string;
}

export interface RevokeApprovalParams {
  approvalId: string;
  revokedBy: string;
  reason?: string;
}

export interface ExecuteWithGateParams<T> {
  request: AuthorizationEvaluationRequest;
  executeFn: () => Promise<T>;
  executionRef?: string;
}

export interface ExecuteWithGateResult<T> {
  allowed: boolean;
  decision: AuthorizationDecision;
  result?: T;
  error?: string;
  auditId: string;
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
   */
  public async requestApproval(params: RequestApprovalParams): Promise<FounderApprovalRecord> {
    const existing = await this.approvalStore.findActiveMatching({
      workflowInstanceId: params.workflowInstanceId,
      stepId: params.stepId,
      employeeRole: params.employeeRole,
      actionName: params.actionName,
      classification: params.classification,
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
      maxUses: params.scope?.maxUses || 1,
      usedCount: 0,
    };

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
    const normalizedDecidedBy = params.decidedBy?.toLowerCase()?.trim();
    if (normalizedDecidedBy !== 'founder') {
      throw new Error(
        `Permission denied: AI Employees and non-Founder identities ("${params.decidedBy}") cannot approve or reject requests. Founder remains final authority.`
      );
    }

    return this.approvalStore.decide(
      params.approvalId,
      params.decision,
      params.decidedBy,
      params.reason,
      params.expiresAt
    );
  }

  /**
   * Founder Revocation Handler.
   * Immediately revokes a previously granted approval.
   */
  public async revokeApproval(params: RevokeApprovalParams): Promise<FounderApprovalRecord> {
    const normalizedRevokedBy = params.revokedBy?.toLowerCase()?.trim();
    if (normalizedRevokedBy !== 'founder') {
      throw new Error(
        `Permission denied: Only the Founder can revoke approvals. Attempted by "${params.revokedBy}".`
      );
    }

    return this.approvalStore.revoke(params.approvalId, params.revokedBy, params.reason);
  }

  /**
   * Execute an operation behind the centralized Side-Effect Authorization Gate.
   * 1. Evaluates policy.
   * 2. If approval is required or denied, refuses execution and returns the decision.
   * 3. If allowed, consumes single-use approval (if applicable) and executes executeFn.
   * 4. Emits a deterministic, unforgeable audit record.
   */
  public async executeWithGate<T>(params: ExecuteWithGateParams<T>): Promise<ExecuteWithGateResult<T>> {
    const { request, executeFn, executionRef } = params;
    const auditId = `audit-${uuidv4()}`;
    const timestamp = new Date().toISOString();
    const requestId = `req-${uuidv4()}`;

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
        decision,
        auditId,
        error: decision.reason,
      };
    }

    // 3. If allowed, check and consume single-action approval if linked
    if (decision.approvalId) {
      const approval = await this.approvalStore.get(decision.approvalId);
      if (approval?.scope.scopeType === 'single_action') {
        await this.approvalStore.consume(decision.approvalId);
      }
    }

    // 4. Execute the authorized operation
    let result: T;
    try {
      result = await executeFn();
    } catch (err: any) {
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
      throw err;
    }

    // 5. Record successful execution in audit trail
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
      decision,
      result,
      auditId,
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
}
