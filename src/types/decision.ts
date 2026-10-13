/**
 * SamJuniorsOS — Native Decision Workflow
 * Core Types & Interfaces (Phase 2.1)
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Single Authoritative Decision Identity:
 *    - `decisionId`: Stable, globally unique identity of the decision.
 *    - `creationRequestId`: Client/caller idempotency key for one creation request.
 *    - `stateVersion`: Monotonically increasing optimistic concurrency version.
 *    - `supersedesDecisionId`: Explicit lineage pointer to an earlier decision.
 * 2. Typed Finite State Machine:
 *    - Status transitions are strictly validated and append-only recorded in `transitions`.
 * 3. Structured Uncertainty:
 *    - Qualitative, calibrated representation (`level`, `description`, `keyUnknowns`).
 *    - Never an uncalibrated numerical probability of correctness.
 * 4. Grounded Evidence:
 *    - References verified `CanonicalFact` IDs from EpistemicClaimStore.
 */

export type DecisionStatus =
  | 'proposed'
  | 'under_review'
  | 'pending_approval'
  | 'approved'
  | 'executing'
  | 'resolved'
  | 'rejected'
  | 'withdrawn'
  | 'superseded'
  | 'intervention_required';

export type DecisionCategory =
  | 'strategic'
  | 'financial'
  | 'product'
  | 'governance'
  | 'operational';

export type DecisionImpact = 'low' | 'medium' | 'high' | 'critical';

export type DecisionReversibility = 'reversible' | 'partially_reversible' | 'irreversible';

export interface DecisionUncertainty {
  /** Qualitative calibration of epistemic uncertainty */
  level: 'low' | 'medium' | 'high';
  /** Explicit explanation of what is uncertain and why */
  description: string;
  /** Concrete unknowns that would clarify or resolve the uncertainty */
  keyUnknowns?: string[];
}

export interface DecisionOutcome {
  /** Concise factual summary of what resulted from execution */
  outcomeSummary: string;
  /** ISO-8601 timestamp when resolution occurred */
  resolvedAt: string;
  /** Actor role or principal who confirmed resolution */
  resolvedBy: string;
  /** Fact IDs promoted or verified during outcome evaluation */
  verifiedFactIds?: string[];
  /** Execution reference or workflow instance ID */
  executionRef?: string;
  /** Additional resolution notes or lessons learned */
  notes?: string;
}

export interface DecisionTransitionRecord {
  /** Unique ID of this transition audit record */
  transitionId: string;
  /** State prior to transition */
  fromStatus: DecisionStatus;
  /** State after transition */
  toStatus: DecisionStatus;
  /** Principal or agent role who initiated the transition */
  actor: string;
  /** ISO-8601 timestamp of transition */
  timestamp: string;
  /** Concrete rationale for the transition */
  reason: string;
  /** Concurrency version resulting from this transition */
  stateVersion: number;
  /** Optional metadata associated with the transition */
  metadata?: Record<string, any>;
}

export interface StaleEvidenceWarning {
  factId: string;
  statement: string;
  validityState: string;
  supersededById?: string;
  warning: string;
}

export interface DecisionRecord {
  /** Stable unique identity of the decision (e.g. dec-1, dec_abc123) */
  decisionId: string;
  /** Idempotency key for creation request */
  creationRequestId: string;
  /** Optimistic concurrency version (integer >= 1, increments on every transition) */
  stateVersion: number;

  /** Descriptive human-readable title */
  title: string;
  /** Clear statement of the underlying problem or opportunity */
  problemStatement: string;
  /** Concrete proposed action, policy, or commitment */
  proposedAction: string;
  /** Functional category */
  category: DecisionCategory;
  /** Role or user proposing the decision (e.g. coo, pm, founder) */
  proposer: string;
  /** Accountable owner responsible for execution/outcome */
  accountableOwner: string;

  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** IDs of validated CanonicalFact objects in EpistemicClaimStore */
  evidenceFactIds: string[];
  /** Explicit assumptions underlying the decision */
  assumptions: string[];
  /** Calibrated qualitative uncertainty representation */
  uncertainty: DecisionUncertainty;
  /** Assessed business impact */
  impact: DecisionImpact;
  /** Reversibility assessment */
  reversibility: DecisionReversibility;

  /** Lifecycle status */
  status: DecisionStatus;
  /** Whether explicit Founder approval is required before execution */
  approvalRequired: boolean;

  // Decided fields (populated upon approve / reject)
  /** Actor who decided (approved or rejected) */
  decidedBy?: string;
  /** ISO-8601 timestamp when decision was rendered */
  decidedAt?: string;
  /** Rationale given by the decider */
  decisionReason?: string;
  /** SHA-256 hash of canonical decision payload at the moment of approval */
  approvedPayloadHash?: string;
  /** Approval record ID in SideEffectAuthorizationGate if issued */
  approvalId?: string;

  // Execution & outcome fields
  /** Linked workflow instance ID when execution is orchestrated */
  linkedWorkflowId?: string;
  /** Outcome record required for resolved status */
  outcome?: DecisionOutcome;

  // Supersession relationships
  /** Prior decision ID that this decision replaces or updates */
  supersedesDecisionId?: string;
  /** Successor decision ID that superseded this decision */
  supersededByDecisionId?: string;
  /** Execution cancellation audit state (when executing decision is superseded/cancelled) */
  cancellationState?: DecisionExecutionCancellationState;

  // Append-only transition audit trail
  transitions: DecisionTransitionRecord[];
}

export interface DecisionExecutionCancellationState {
  /** Whether cancellation was requested for the underlying execution */
  cancellationRequested: boolean;
  /** Whether cancellation was positively confirmed across all active execution steps */
  cancellationConfirmed: boolean;
  /** ISO-8601 timestamp when cancellation was requested */
  requestedAt: string;
  /** Actor principal who requested cancellation */
  requestedBy: string;
  /** Linked workflow instance ID */
  workflowInstanceId?: string;
  /** Steps that were still running when cancellation was requested (if any) */
  runningStepIds?: string[];
  /** Steps that were cancelled */
  cancelledStepIds?: string[];
  /** Rationale given for cancellation */
  reason?: string;
}

export interface DecisionFilter {
  status?: DecisionStatus | DecisionStatus[];
  category?: DecisionCategory;
  proposer?: string;
  accountableOwner?: string;
  impact?: DecisionImpact;
}
