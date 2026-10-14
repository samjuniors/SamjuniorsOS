/**
 * SamJuniorsOS — Native Decision Workflow
 * Decision Lifecycle Service (Phase 2.1)
 *
 * Coordinates decision state transitions, deterministic validation,
 * cryptographic Founder approval binding, epistemic evidence verification,
 * and immutable transition history & audit integration.
 */

import { v4 as uuidv4 } from 'uuid';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  DecisionRecord,
  DecisionStatus,
  DecisionCategory,
  DecisionImpact,
  DecisionReversibility,
  DecisionUncertainty,
  DecisionOutcome,
  DecisionTransitionRecord,
  StaleEvidenceWarning,
  DecisionExecutionCancellationState,
} from '@/types/decision';
import {
  InvalidDecisionTransitionError,
  UnauthorizedDecisionActionError,
  InvalidDecisionEvidenceError,
  MissingOutcomeError,
  DecisionApprovalPayloadMismatchError,
  DecisionNotFoundError,
  ConflictingExecutionBlockedError,
  DecisionExecutionUncertaintyError,
} from './errors';
import { DecisionStore } from './store';
import {
  computeDecisionApprovalHash,
  verifyDecisionApprovalBinding,
} from './payload-binding';
import { EpistemicClaimStore } from '@/lib/server/epistemic/claim-store';
import { InMemoryAuditStore } from '@/lib/server/authorization/approval-store';
import { WorkflowRuntime } from '@/lib/server/workflow/runtime';

export const ALLOWED_FOUNDER_IDENTITIES = [
  'founder',
  'founder-001',
  'founder-local-session',
  'founder-production-session',
  'executive_founder',
  'executive-founder',
];

const PROHIBITED_AGENT_ROLES = [
  'researcher',
  'pm',
  'coo',
  'finance',
  'advisor',
  'system',
  'developer',
  'guest',
];

export interface DecisionCallerContext {
  role?: string;
  userId?: string;
  source?: 'session' | 'workflow_runtime' | 'system' | 'client';
  workflowInstanceId?: string;
  stepId?: string;
  workerCapabilityToken?: string;
}

const WORKFLOW_SECRET =
  process.env.WORKFLOW_INTERNAL_SECRET ||
  process.env.SAMJUNIORS_DEV_SECRET ||
  'samjuniors-internal-workflow-capability-key';

export interface WorkerCapabilityPayload {
  workflowInstanceId: string;
  decisionId?: string;
  workerId: string;
  expiresAt: number;
}

export function generateWorkerCapabilityToken(payload: WorkerCapabilityPayload): string {
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', WORKFLOW_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyWorkerCapabilityToken(
  token: string,
  expectedWorkflowInstanceId?: string,
  expectedDecisionId?: string,
  expectedWorkerId?: string
): { isValid: boolean; payload?: WorkerCapabilityPayload; reason?: string } {
  if (!token || typeof token !== 'string') {
    return { isValid: false, reason: 'Missing worker capability token' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { isValid: false, reason: 'Malformed capability token structure' };
  }
  const [data, sig] = parts;
  const expectedSig = createHmac('sha256', WORKFLOW_SECRET).update(data).digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { isValid: false, reason: 'Invalid capability token signature' };
  }

  let payload: WorkerCapabilityPayload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return { isValid: false, reason: 'Invalid capability token payload' };
  }

  if (typeof payload.expiresAt === 'number' && payload.expiresAt <= Date.now()) {
    return { isValid: false, reason: 'Capability token has expired' };
  }

  if (expectedWorkflowInstanceId && payload.workflowInstanceId !== expectedWorkflowInstanceId) {
    return {
      isValid: false,
      reason: `Capability token workflowInstanceId mismatch (expected: ${expectedWorkflowInstanceId}, got: ${payload.workflowInstanceId})`,
    };
  }

  if (expectedDecisionId && payload.decisionId && payload.decisionId !== expectedDecisionId) {
    return {
      isValid: false,
      reason: `Capability token decisionId mismatch (expected: ${expectedDecisionId}, got: ${payload.decisionId})`,
    };
  }

  if (expectedWorkerId && payload.workerId && payload.workerId.toLowerCase() !== expectedWorkerId.toLowerCase()) {
    return {
      isValid: false,
      reason: `Capability token workerId mismatch (expected: ${expectedWorkerId}, got: ${payload.workerId})`,
    };
  }

  return { isValid: true, payload };
}

/**
 * Checks whether an actor is an authenticated Founder.
 * AI Employees and unauthenticated roles strictly fail-closed.
 *
 * Rules:
 * 1. F-03 REMEDIATION: userContext MUST be present and verified. Unauthenticated
 *    invocations without userContext FAIL CLOSED.
 * 2. If actor is an AI employee persona or prohibited role, FAIL CLOSED.
 * 3. Client sources without verified Founder session FAIL CLOSED.
 * 4. Role must strictly match 'FOUNDER'.
 */
export function isAuthorizedFounder(
  actor: string,
  userContext?: DecisionCallerContext
): boolean {
  const normalized = (actor || '').toLowerCase().trim();

  // If prohibited agent role or starts with agent-, strictly reject regardless of claims
  if (PROHIBITED_AGENT_ROLES.includes(normalized) || normalized.startsWith('agent-')) {
    return false;
  }

  // F-03 REMEDIATION: Never trust caller-supplied actor string when userContext is absent.
  if (!userContext) {
    return false;
  }

  // Client source without verified session strictly fails closed
  if (userContext.source === 'client') {
    return false;
  }

  // Non-founder role strictly fails closed
  if (!userContext.role || userContext.role.toUpperCase() !== 'FOUNDER') {
    return false;
  }

  // Must have non-empty userId
  if (!userContext.userId || typeof userContext.userId !== 'string' || userContext.userId.trim().length === 0) {
    return false;
  }

  // Allowlist match against authenticated identity
  if (
    ALLOWED_FOUNDER_IDENTITIES.includes(normalized) ||
    normalized.startsWith('founder-') ||
    normalized === userContext.userId.toLowerCase().trim()
  ) {
    return true;
  }

  return false;
}

/**
 * Checks whether an actor is an authorized trusted workflow execution worker.
 * Preserves legitimate workflow execution outcome reporting without granting
 * broad governance decision authority.
 *
 * Rules:
 * 1. F-02 REMEDIATION: String-prefix ('worker-') and static name ('workflow_runtime')
 *    checks are completely removed.
 * 2. Actor cannot be an AI employee persona or prohibited role.
 * 3. userContext is mandatory with source === 'workflow_runtime' or role === 'WORKFLOW_WORKER'.
 * 4. Scoping: if linkedWorkflowId is present, userContext.workflowInstanceId MUST match.
 * 5. If workerCapabilityToken is present, its HMAC signature and expiry are verified.
 */
export function isAuthorizedWorkflowWorker(
  actor: string,
  userContext?: DecisionCallerContext,
  linkedWorkflowId?: string,
  decisionId?: string
): boolean {
  const normalized = (actor || '').toLowerCase().trim();

  // Prohibited agent roles cannot masquerade as workflow workers
  if (PROHIBITED_AGENT_ROLES.includes(normalized) || normalized.startsWith('agent-')) {
    return false;
  }

  if (!userContext) {
    return false;
  }

  // Client requests cannot claim workflow worker authority
  if (userContext.source === 'client') {
    return false;
  }

  const isWorkerRole =
    userContext.role?.toUpperCase() === 'WORKFLOW_WORKER' ||
    userContext.source === 'workflow_runtime' ||
    userContext.source === 'system';

  if (!isWorkerRole) {
    return false;
  }

  // Scoping enforcement: worker must be scoped to the exact workflow instance
  if (linkedWorkflowId) {
    if (!userContext.workflowInstanceId || userContext.workflowInstanceId !== linkedWorkflowId) {
      return false;
    }
  }

  // If a capability token is supplied, verify it
  if (userContext.workerCapabilityToken) {
    const verification = verifyWorkerCapabilityToken(
      userContext.workerCapabilityToken,
      linkedWorkflowId,
      decisionId,
      actor
    );
    if (!verification.isValid) {
      return false;
    }
  }

  return true;
}

/**
 * Checks whether an actor is authorized for operational intervention (flagging intervention / resuming).
 * Operator authority does NOT grant Founder approval or rejection privileges.
 */
export function isAuthorizedOperator(
  actor: string,
  userContext?: DecisionCallerContext
): boolean {
  if (isAuthorizedFounder(actor, userContext)) {
    return true;
  }

  const normalized = (actor || '').toLowerCase().trim();
  if (PROHIBITED_AGENT_ROLES.includes(normalized) || normalized.startsWith('agent-')) {
    return false;
  }

  if (!userContext || userContext.source === 'client') {
    return false;
  }

  if (userContext.role?.toUpperCase() === 'OPERATOR') {
    return true;
  }

  return false;
}

/**
 * Authoritative State Transition Graph
 * Phase 2.1.1: Allows superseding decisions from proposed, under_review, and pending_approval
 * under authorized governance rules.
 */
const VALID_TRANSITIONS: Record<DecisionStatus, Set<DecisionStatus>> = {
  proposed: new Set(['under_review', 'pending_approval', 'rejected', 'withdrawn', 'superseded']),
  under_review: new Set(['pending_approval', 'rejected', 'withdrawn', 'superseded']),
  pending_approval: new Set(['approved', 'rejected', 'withdrawn', 'superseded']),
  approved: new Set(['executing', 'superseded', 'intervention_required']),
  executing: new Set(['resolved', 'intervention_required', 'superseded']),
  intervention_required: new Set(['executing', 'resolved', 'superseded']),
  resolved: new Set(['superseded']),
  rejected: new Set(),
  withdrawn: new Set(),
  superseded: new Set(),
};

export interface ProposeDecisionParams {
  creationRequestId: string;
  decisionId?: string;
  title: string;
  problemStatement: string;
  proposedAction: string;
  category: DecisionCategory;
  proposer: string;
  accountableOwner?: string;
  evidenceFactIds?: string[];
  assumptions?: string[];
  uncertainty?: DecisionUncertainty;
  impact?: DecisionImpact;
  reversibility?: DecisionReversibility;
  approvalRequired?: boolean;
  supersedesDecisionId?: string;
  initialStatus?: 'proposed' | 'under_review' | 'pending_approval';
}

export interface TransitionParams {
  decisionId: string;
  expectedStateVersion: number;
  actor: string;
  reason: string;
  metadata?: Record<string, any>;
  userContext?: DecisionCallerContext;
}

export interface ApproveDecisionParams extends TransitionParams {
  allowStaleEvidence?: boolean;
  notes?: string;
}

export interface RejectDecisionParams extends TransitionParams {}

export interface StartExecutionParams extends TransitionParams {
  linkedWorkflowId?: string;
}

export interface FlagInterventionParams extends TransitionParams {}

export interface ResumeExecutionParams extends TransitionParams {}

export interface ResolveDecisionParams extends TransitionParams {
  outcome: DecisionOutcome;
}

export interface SupersedeDecisionParams extends TransitionParams {
  supersededByDecisionId: string;
}

export class DecisionLifecycleService {
  private static instance: DecisionLifecycleService | null = null;
  private store: DecisionStore;

  constructor(store?: DecisionStore) {
    this.store = store || DecisionStore.getInstance();
  }

  public static getInstance(): DecisionLifecycleService {
    if (!DecisionLifecycleService.instance) {
      DecisionLifecycleService.instance = new DecisionLifecycleService();
    }
    return DecisionLifecycleService.instance;
  }

  /**
   * Helper to validate referenced evidence facts in EpistemicClaimStore.
   */
  public async validateEvidence(evidenceFactIds: string[]): Promise<{
    isValid: boolean;
    missingFactIds: string[];
    staleWarnings: StaleEvidenceWarning[];
  }> {
    const claimStore = EpistemicClaimStore.getInstance();
    const missingFactIds: string[] = [];
    const staleWarnings: StaleEvidenceWarning[] = [];

    for (const factId of evidenceFactIds) {
      const fact = await claimStore.getFact(factId);
      if (!fact) {
        missingFactIds.push(factId);
        continue;
      }
      if (fact.validityState !== 'active') {
        staleWarnings.push({
          factId,
          statement: fact.statement,
          validityState: fact.validityState,
          supersededById: fact.supersededById,
          warning: `Evidence fact ${factId} is marked "${fact.validityState}"${
            fact.supersededById ? ` (superseded by ${fact.supersededById})` : ''
          }.`,
        });
      }
    }

    return {
      isValid: missingFactIds.length === 0,
      missingFactIds,
      staleWarnings,
    };
  }

  /**
   * Generates a deterministic, stable audit event ID from transition ID.
   * Ensures 1-to-1 idempotent alignment between decision transitions and centralized audit records.
   */
  public static getStableAuditId(transitionId: string): string {
    return `audit-dec-${transitionId}`;
  }

  /**
   * Records a durable transition audit record in InMemoryAuditStore.
   * Uses deterministic, stable transition event IDs.
   */
  private async recordAuditEvent(
    decision: DecisionRecord,
    transition: DecisionTransitionRecord
  ): Promise<void> {
    const stableId = DecisionLifecycleService.getStableAuditId(transition.transitionId);
    try {
      const auditStore = InMemoryAuditStore.getInstance();
      await auditStore.record({
        id: stableId,
        requestId: transition.transitionId,
        requestedBy: transition.actor,
        actionName: `decision.${transition.toStatus}`,
        actionClassification: 'internal_mutation',
        employeeRole: (transition.actor as any) || 'system',
        decision:
          transition.toStatus === 'approved'
            ? 'allowed'
            : transition.toStatus === 'rejected'
            ? 'denied'
            : 'allowed',
        reasonCode:
          transition.toStatus === 'approved'
            ? 'APPROVED_BY_FOUNDER'
            : transition.toStatus === 'rejected'
            ? 'APPROVAL_REJECTED'
            : 'INTERNAL_MUTATION_ALLOWED',
        reason: transition.reason,
        target: {
          targetSystem: 'decision_store',
          metadata: {
            decisionId: decision.decisionId,
            fromStatus: transition.fromStatus,
            toStatus: transition.toStatus,
            stateVersion: transition.stateVersion,
          },
        },
        timestamp: transition.timestamp,
        executed: true,
        workflowInstanceId: decision.linkedWorkflowId || `decision-${decision.decisionId}`,
        stepId: `transition-v${transition.stateVersion}`,
      });
    } catch (err: any) {
      // Best-effort alongside authoritative decision record, but visibly log failure for reconciliation
      console.warn(
        `[DecisionAudit] Central audit write failed for ${stableId}: ${err?.message}`
      );
    }
  }

  /**
   * 1. PROPOSE A NEW DECISION
   * Idempotent: repeated calls with identical `creationRequestId` return the existing decision.
   */
  public async proposeDecision(params: ProposeDecisionParams): Promise<DecisionRecord> {
    if (!params.creationRequestId || !params.creationRequestId.trim()) {
      throw new Error('creationRequestId is mandatory for idempotent decision creation');
    }
    if (!params.title || !params.title.trim()) {
      throw new Error('title is mandatory');
    }
    if (!params.problemStatement || !params.problemStatement.trim()) {
      throw new Error('problemStatement is mandatory');
    }
    if (!params.proposedAction || !params.proposedAction.trim()) {
      throw new Error('proposedAction is mandatory');
    }
    if (!params.proposer || !params.proposer.trim()) {
      throw new Error('proposer is mandatory');
    }

    // Check if creationRequestId already exists (fast-path idempotency)
    const existing = await this.store.getByCreationRequestId(params.creationRequestId);
    if (existing) {
      return existing;
    }

    const decisionId = params.decisionId || `dec_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    const initialStatus: DecisionStatus = params.initialStatus || 'proposed';

    const evidenceFactIds = params.evidenceFactIds || [];
    const assumptions = params.assumptions || [];
    const uncertainty: DecisionUncertainty = params.uncertainty || {
      level: 'low',
      description: 'Standard operational evaluation',
    };

    const initialTransition: DecisionTransitionRecord = {
      transitionId: `tr-${uuidv4()}`,
      fromStatus: 'proposed',
      toStatus: initialStatus,
      actor: params.proposer,
      timestamp: now,
      reason: 'Initial proposal created',
      stateVersion: 1,
    };

    const newRecord: DecisionRecord = {
      decisionId,
      creationRequestId: params.creationRequestId,
      stateVersion: 1,
      title: params.title.trim(),
      problemStatement: params.problemStatement.trim(),
      proposedAction: params.proposedAction.trim(),
      category: params.category || 'strategic',
      proposer: params.proposer.trim(),
      accountableOwner: params.accountableOwner || 'founder',
      createdAt: now,
      evidenceFactIds,
      assumptions,
      uncertainty,
      impact: params.impact || 'medium',
      reversibility: params.reversibility || 'reversible',
      status: initialStatus,
      approvalRequired: params.approvalRequired ?? true,
      supersedesDecisionId: params.supersedesDecisionId,
      transitions: [initialTransition],
    };

    const { record: savedRecord } = await this.store.create(newRecord);
    await this.recordAuditEvent(savedRecord, initialTransition);

    return savedRecord;
  }

  /**
   * Helper to perform a typed state transition.
   */
  private async performTransition(
    decisionId: string,
    expectedStateVersion: number,
    toStatus: DecisionStatus,
    actor: string,
    reason: string,
    updaterPatch: (draft: DecisionRecord) => void,
    metadata?: Record<string, any>
  ): Promise<DecisionRecord> {
    const updated = await this.store.update(decisionId, expectedStateVersion, (current) => {
      // Validate transition legality
      const allowed = VALID_TRANSITIONS[current.status];
      if (!allowed || !allowed.has(toStatus)) {
        throw new InvalidDecisionTransitionError(decisionId, current.status, toStatus, reason);
      }

      const transition: DecisionTransitionRecord = {
        transitionId: `tr-${uuidv4()}`,
        fromStatus: current.status,
        toStatus,
        actor,
        timestamp: new Date().toISOString(),
        reason,
        stateVersion: current.stateVersion + 1,
        metadata,
      };

      current.status = toStatus;
      updaterPatch(current);
      current.transitions.push(transition);

      return current;
    });

    const latestTransition = updated.transitions[updated.transitions.length - 1];
    if (latestTransition) {
      await this.recordAuditEvent(updated, latestTransition);
    }

    return updated;
  }

  /**
   * 2. REVIEW DECISION
   * proposed -> under_review
   */
  public async reviewDecision(params: TransitionParams): Promise<DecisionRecord> {
    return this.performTransition(
      params.decisionId,
      params.expectedStateVersion,
      'under_review',
      params.actor,
      params.reason,
      () => {},
      params.metadata
    );
  }

  /**
   * 3. SUBMIT FOR APPROVAL
   * proposed / under_review -> pending_approval
   */
  public async submitForApproval(params: TransitionParams): Promise<DecisionRecord> {
    return this.performTransition(
      params.decisionId,
      params.expectedStateVersion,
      'pending_approval',
      params.actor,
      params.reason,
      () => {},
      params.metadata
    );
  }

  /**
   * 4. APPROVE DECISION
   * pending_approval -> approved
   * Strictly enforces Founder authorization and cryptographic payload binding.
   */
  public async approveDecision(params: ApproveDecisionParams): Promise<DecisionRecord> {
    // 1. Authorization check: actor MUST be an authorized Founder
    if (!isAuthorizedFounder(params.actor, params.userContext)) {
      throw new UnauthorizedDecisionActionError(
        params.actor,
        'approve',
        `Permission denied: Identity "${params.actor}" is not an authorized Founder. AI employees and non-founder principals cannot approve company decisions.`
      );
    }

    // 2. Fetch current record to evaluate evidence
    const current = await this.store.get(params.decisionId);
    if (!current) {
      throw new DecisionNotFoundError(params.decisionId);
    }

    // 3. Evidence verification
    if (current.evidenceFactIds.length > 0) {
      const evidence = await this.validateEvidence(current.evidenceFactIds);
      if (!evidence.isValid) {
        throw new InvalidDecisionEvidenceError(
          params.decisionId,
          evidence.missingFactIds,
          evidence.staleWarnings.map((w) => w.factId),
          `Cannot approve decision "${params.decisionId}": referenced evidence facts do not exist: [${evidence.missingFactIds.join(', ')}].`
        );
      }
      if (evidence.staleWarnings.length > 0 && !params.allowStaleEvidence) {
        throw new InvalidDecisionEvidenceError(
          params.decisionId,
          [],
          evidence.staleWarnings.map((w) => w.factId),
          `Cannot approve decision "${params.decisionId}": referenced evidence contains superseded or inactive facts [${evidence.staleWarnings
            .map((w) => w.factId)
            .join(', ')}]. Approval requires explicit allowStaleEvidence=true.`
        );
      }
    }

    const now = new Date().toISOString();

    return this.performTransition(
      params.decisionId,
      params.expectedStateVersion,
      'approved',
      params.actor,
      params.reason,
      (draft) => {
        draft.decidedBy = params.actor;
        draft.decidedAt = now;
        draft.decisionReason = params.reason;
        // Compute canonical payload hash with the new stateVersion (current + 1)
        const nextVersion = draft.stateVersion + 1;
        draft.approvedPayloadHash = computeDecisionApprovalHash({
          ...draft,
          stateVersion: nextVersion,
        });
      },
      params.metadata
    );
  }

  /**
   * 5. REJECT DECISION
   * proposed / under_review / pending_approval -> rejected
   * Strictly enforces Founder authorization.
   */
  public async rejectDecision(params: RejectDecisionParams): Promise<DecisionRecord> {
    if (!isAuthorizedFounder(params.actor, params.userContext)) {
      throw new UnauthorizedDecisionActionError(
        params.actor,
        'reject',
        `Permission denied: Identity "${params.actor}" is not an authorized Founder.`
      );
    }

    const now = new Date().toISOString();

    return this.performTransition(
      params.decisionId,
      params.expectedStateVersion,
      'rejected',
      params.actor,
      params.reason,
      (draft) => {
        draft.decidedBy = params.actor;
        draft.decidedAt = now;
        draft.decisionReason = params.reason;
      },
      params.metadata
    );
  }

  /**
   * 6. WITHDRAW DECISION
   * proposed / under_review / pending_approval -> withdrawn
   */
  public async withdrawDecision(params: TransitionParams): Promise<DecisionRecord> {
    return this.performTransition(
      params.decisionId,
      params.expectedStateVersion,
      'withdrawn',
      params.actor,
      params.reason,
      () => {},
      params.metadata
    );
  }

  /**
   * 7. START EXECUTION
   * approved -> executing
   * Verifies that the decision payload has NOT been altered since Founder approval.
   * Enforces that conflicting predecessor executions are not active or uncertain.
   */
  public async startExecution(params: StartExecutionParams): Promise<DecisionRecord> {
    const current = await this.store.get(params.decisionId);
    if (!current) {
      throw new DecisionNotFoundError(params.decisionId);
    }

    // F-04 REMEDIATION: Verify caller authorization before starting execution
    const targetWorkflowId = params.linkedWorkflowId || current.linkedWorkflowId;
    const isWorker = isAuthorizedWorkflowWorker(
      params.actor,
      params.userContext,
      targetWorkflowId,
      current.decisionId
    );
    const isFounder = isAuthorizedFounder(params.actor, params.userContext);

    if (!isWorker && !isFounder) {
      throw new UnauthorizedDecisionActionError(
        params.actor,
        'start_execution',
        `Permission denied: Identity "${params.actor}" is not authorized to start execution for decision "${params.decisionId}". Must be an authorized workflow runtime worker bound to the linked workflow, or an authenticated Founder.`
      );
    }

    if (current.status !== 'approved') {
      throw new InvalidDecisionTransitionError(
        params.decisionId,
        current.status,
        'executing',
        params.reason
      );
    }

    // Cryptographic payload binding check:
    const binding = verifyDecisionApprovalBinding(current);
    if (!binding.isMatch) {
      throw new DecisionApprovalPayloadMismatchError(
        params.decisionId,
        binding.expectedHash || 'MISSING_APPROVAL_HASH',
        binding.actualHash
      );
    }

    // Successor execution guard: block conflicting execution if predecessor is active or uncertain
    if (current.supersedesDecisionId) {
      const predecessor = await this.store.get(current.supersedesDecisionId);
      if (predecessor) {
        if (predecessor.status === 'executing') {
          throw new ConflictingExecutionBlockedError(
            current.decisionId,
            predecessor.decisionId,
            predecessor.status,
            `Cannot start execution for successor decision "${current.decisionId}": predecessor decision "${predecessor.decisionId}" is currently executing. Conflicting executions are strictly blocked.`
          );
        }
        if (predecessor.status === 'intervention_required') {
          throw new ConflictingExecutionBlockedError(
            current.decisionId,
            predecessor.decisionId,
            predecessor.status,
            `Cannot start execution for successor decision "${current.decisionId}": predecessor decision "${predecessor.decisionId}" requires operational intervention. Predecessor state must be resolved before successor execution.`
          );
        }
        if (predecessor.cancellationState && !predecessor.cancellationState.cancellationConfirmed) {
          throw new ConflictingExecutionBlockedError(
            current.decisionId,
            predecessor.decisionId,
            predecessor.status,
            `Cannot start execution for successor decision "${current.decisionId}": predecessor decision "${predecessor.decisionId}" execution cancellation was not confirmed (running steps: [${(predecessor.cancellationState.runningStepIds || []).join(', ')}]). Conflicting executions are strictly blocked.`
          );
        }
        if (predecessor.linkedWorkflowId) {
          const wfRuntime = new WorkflowRuntime();
          const wfInstance = await wfRuntime.getInstance(predecessor.linkedWorkflowId);
          if (wfInstance && wfInstance.status === 'running') {
            throw new ConflictingExecutionBlockedError(
              current.decisionId,
              predecessor.decisionId,
              predecessor.status,
              `Cannot start execution for successor decision "${current.decisionId}": predecessor workflow instance "${predecessor.linkedWorkflowId}" is still running.`
            );
          }
        }
      }
    }

    return this.performTransition(
      params.decisionId,
      params.expectedStateVersion,
      'executing',
      params.actor,
      params.reason,
      (draft) => {
        if (params.linkedWorkflowId) {
          draft.linkedWorkflowId = params.linkedWorkflowId;
        }
      },
      params.metadata
    );
  }

  /**
   * 8. FLAG INTERVENTION REQUIRED
   * approved / executing -> intervention_required
   * Enforces operator / Founder authorization.
   */
  public async flagInterventionRequired(params: FlagInterventionParams): Promise<DecisionRecord> {
    if (!isAuthorizedOperator(params.actor, params.userContext)) {
      throw new UnauthorizedDecisionActionError(
        params.actor,
        'flag_intervention',
        `Permission denied: Identity "${params.actor}" is not authorized to flag operational interventions.`
      );
    }

    return this.performTransition(
      params.decisionId,
      params.expectedStateVersion,
      'intervention_required',
      params.actor,
      params.reason,
      () => {},
      params.metadata
    );
  }

  /**
   * 9. RESUME EXECUTION
   * intervention_required -> executing
   * Enforces operator / Founder authorization.
   */
  public async resumeExecution(params: ResumeExecutionParams): Promise<DecisionRecord> {
    if (!isAuthorizedOperator(params.actor, params.userContext)) {
      throw new UnauthorizedDecisionActionError(
        params.actor,
        'resume_execution',
        `Permission denied: Identity "${params.actor}" is not authorized to resume executions.`
      );
    }

    return this.performTransition(
      params.decisionId,
      params.expectedStateVersion,
      'executing',
      params.actor,
      params.reason,
      () => {},
      params.metadata
    );
  }

  /**
   * 10. RESOLVE DECISION
   * executing / intervention_required -> resolved
   * Strictly requires a verified outcome record.
   * Authorized for Founder OR trusted workflow execution worker reporting outcome.
   */
  public async resolveDecision(params: ResolveDecisionParams): Promise<DecisionRecord> {
    const current = await this.store.get(params.decisionId);
    if (!current) {
      throw new DecisionNotFoundError(params.decisionId);
    }

    const isFounder = isAuthorizedFounder(params.actor, params.userContext);
    const isWorker = isAuthorizedWorkflowWorker(
      params.actor,
      params.userContext,
      current.linkedWorkflowId,
      current.decisionId
    );

    if (!isFounder && !isWorker) {
      throw new UnauthorizedDecisionActionError(
        params.actor,
        'resolve',
        `Permission denied: Identity "${params.actor}" is not authorized to resolve company decisions. Only an authorized Founder or a trusted workflow execution worker can report resolution outcomes.`
      );
    }

    if (!params.outcome) {
      throw new MissingOutcomeError(params.decisionId, 'No outcome object was provided.');
    }
    if (!params.outcome.outcomeSummary || !params.outcome.outcomeSummary.trim()) {
      throw new MissingOutcomeError(params.decisionId, 'outcomeSummary cannot be empty.');
    }
    if (!params.outcome.resolvedAt) {
      params.outcome.resolvedAt = new Date().toISOString();
    }
    if (!params.outcome.resolvedBy) {
      params.outcome.resolvedBy = params.actor;
    }

    return this.performTransition(
      params.decisionId,
      params.expectedStateVersion,
      'resolved',
      params.actor,
      params.reason,
      (draft) => {
        draft.outcome = params.outcome;
      },
      params.metadata
    );
  }

  /**
   * 11. SUPERSEDE DECISION
   * proposed / under_review / pending_approval / approved / executing / intervention_required / resolved -> superseded
   *
   * ARCHITECTURAL SEMANTICS (Phase 2.1.1 Execution-Aware Supersession):
   * 1. Authorization: Only verified Founder governance actions can supersede decisions.
   * 2. Execution awareness: Executing decisions are NOT treated as cancelled merely because
   *    their decision record is superseded. Cancellation is explicitly requested via WorkflowRuntime.
   * 3. Cancellation requested != cancellation confirmed:
   *    - If all steps are successfully cancelled and no step is actively running: confirmed = true,
   *      and predecessor transitions to 'superseded'.
   *    - If any step is actively running or cancellation cannot be confirmed: confirmed = false,
   *      and predecessor transitions to 'intervention_required' with full cancellation state recorded!
   * 4. Outcome retention: Resolved historical decisions retain their outcome record.
   * 5. Successor linking: Predecessor and successor decisions are deterministically linked.
   */
  public async supersedeDecision(
    params: SupersedeDecisionParams
  ): Promise<{ superseded: DecisionRecord; successor: DecisionRecord }> {
    // 1. Authorization check: Founder only
    if (!isAuthorizedFounder(params.actor, params.userContext)) {
      throw new UnauthorizedDecisionActionError(
        params.actor,
        'supersede',
        `Permission denied: Identity "${params.actor}" is not an authorized Founder. Only verified Founder identities can supersede company decisions.`
      );
    }

    const current = await this.store.get(params.decisionId);
    if (!current) {
      throw new DecisionNotFoundError(params.decisionId);
    }

    const successor = await this.store.get(params.supersededByDecisionId);
    if (!successor) {
      throw new DecisionNotFoundError(params.supersededByDecisionId);
    }

    const now = new Date().toISOString();
    let cancellationState: DecisionExecutionCancellationState | undefined;
    let targetStatus: DecisionStatus = 'superseded';

    // 2. If current decision is actively executing, request cancellation from WorkflowRuntime
    if (current.status === 'executing' && current.linkedWorkflowId) {
      const wfRuntime = new WorkflowRuntime();
      try {
        const cancelResult = await wfRuntime.requestInstanceCancellation(
          current.linkedWorkflowId,
          params.actor,
          params.reason
        );

        cancellationState = {
          cancellationRequested: true,
          cancellationConfirmed: cancelResult.confirmed,
          requestedAt: now,
          requestedBy: params.actor,
          workflowInstanceId: current.linkedWorkflowId,
          runningStepIds: cancelResult.runningStepIds,
          cancelledStepIds: cancelResult.cancelledStepIds,
          reason: params.reason,
        };

        if (!cancelResult.confirmed) {
          // If cancellation cannot be confirmed immediately (e.g. running steps), use intervention_required
          targetStatus = 'intervention_required';
        }
      } catch (err: any) {
        cancellationState = {
          cancellationRequested: true,
          cancellationConfirmed: false,
          requestedAt: now,
          requestedBy: params.actor,
          workflowInstanceId: current.linkedWorkflowId,
          runningStepIds: [],
          cancelledStepIds: [],
          reason: `Cancellation request encountered error: ${err.message}`,
        };
        targetStatus = 'intervention_required';
      }
    }

    const superseded = await this.performTransition(
      params.decisionId,
      params.expectedStateVersion,
      targetStatus,
      params.actor,
      params.reason,
      (draft) => {
        draft.supersededByDecisionId = params.supersededByDecisionId;
        if (cancellationState) {
          draft.cancellationState = cancellationState;
        }
        // If resolved, retain existing outcome record
      },
      {
        ...params.metadata,
        successorDecisionId: params.supersededByDecisionId,
        cancellationConfirmed: cancellationState ? cancellationState.cancellationConfirmed : true,
      }
    );

    // Update successor's supersedesDecisionId if not set
    let updatedSuccessor = successor;
    if (successor.supersedesDecisionId !== params.decisionId) {
      updatedSuccessor = await this.store.update(
        successor.decisionId,
        successor.stateVersion,
        (draft) => {
          draft.supersedesDecisionId = params.decisionId;
          return draft;
        }
      );
    }

    return { superseded, successor: updatedSuccessor };
  }

  /**
   * Phase 2.1.1: Idempotent Decision Audit Trail Reconciliation.
   * Compares durable DecisionTransitionRecord entries with centralized audit events.
   * Uses stable event identifiers (`audit-dec-${transition.transitionId}`) to prevent duplication.
   * Reconciles missing entries with original actor, timestamp, and metadata.
   * Fails visibly when source data is incomplete or ambiguous.
   */
  public async reconcileDecisionAuditTrail(targetDecisionId?: string): Promise<{
    examined: number;
    reconciled: number;
    alreadyPresent: number;
    errors: string[];
  }> {
    const auditStore = InMemoryAuditStore.getInstance();
    let decisions: DecisionRecord[] = [];

    if (targetDecisionId) {
      const dec = await this.store.get(targetDecisionId);
      if (!dec) {
        throw new DecisionNotFoundError(targetDecisionId);
      }
      decisions = [dec];
    } else {
      decisions = await this.store.list();
    }

    let examined = 0;
    let reconciled = 0;
    let alreadyPresent = 0;
    const errors: string[] = [];

    for (const decision of decisions) {
      if (!decision.transitions || !Array.isArray(decision.transitions)) {
        errors.push(`Decision "${decision.decisionId}" has corrupted or missing transitions array.`);
        continue;
      }

      for (const transition of decision.transitions) {
        examined++;

        if (!transition.transitionId || !transition.transitionId.trim()) {
          errors.push(
            `Decision "${decision.decisionId}" transition v${transition.stateVersion} is missing a transitionId.`
          );
          continue;
        }
        if (!transition.toStatus || !transition.timestamp) {
          errors.push(
            `Decision "${decision.decisionId}" transition "${transition.transitionId}" has incomplete source data.`
          );
          continue;
        }

        const stableId = DecisionLifecycleService.getStableAuditId(transition.transitionId);
        const existing = await auditStore.get(stableId);

        if (existing) {
          alreadyPresent++;
          continue;
        }

        // Reconcile missing entry with original data
        try {
          await auditStore.record({
            id: stableId,
            requestId: transition.transitionId,
            requestedBy: transition.actor,
            actionName: `decision.${transition.toStatus}`,
            actionClassification: 'internal_mutation',
            employeeRole: (transition.actor as any) || 'system',
            decision:
              transition.toStatus === 'approved'
                ? 'allowed'
                : transition.toStatus === 'rejected'
                ? 'denied'
                : 'allowed',
            reasonCode:
              transition.toStatus === 'approved'
                ? 'APPROVED_BY_FOUNDER'
                : transition.toStatus === 'rejected'
                ? 'APPROVAL_REJECTED'
                : 'INTERNAL_MUTATION_ALLOWED',
            reason: transition.reason,
            target: {
              targetSystem: 'decision_store',
              metadata: {
                decisionId: decision.decisionId,
                fromStatus: transition.fromStatus,
                toStatus: transition.toStatus,
                stateVersion: transition.stateVersion,
                ...(transition.metadata || {}),
                reconciled: true,
              },
            },
            timestamp: transition.timestamp,
            executed: true,
            workflowInstanceId: decision.linkedWorkflowId || `decision-${decision.decisionId}`,
            stepId: `transition-v${transition.stateVersion}`,
          });
          reconciled++;
        } catch (err: any) {
          errors.push(
            `Failed to persist reconciled audit record "${stableId}" for decision "${decision.decisionId}": ${err.message}`
          );
        }
      }
    }

    return { examined, reconciled, alreadyPresent, errors };
  }
}
