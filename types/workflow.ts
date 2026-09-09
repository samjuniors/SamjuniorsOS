import { AgentRole } from './os';
import { ContextItemProvenance } from './context';
import { SideEffectClassification, ActionTargetContext, ApprovalScope } from './authorization';

export type WorkflowStepStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'waiting'
  | 'blocked'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkflowInstanceStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'blocked'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkflowCondition {
  type: 'state_match' | 'metric_threshold' | 'time_elapsed' | 'manual_override';
  key: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: any;
}

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  description: string;
  assignedRole: AgentRole;
  /**
   * Skill NAME (registry key) — e.g. 'financial_model', 'prd_creation',
   * 'compliance_verification', or a bare protocol step name. This is deliberately
   * a free-form string: the workflow runtime matches skill names against the
   * skill registry and special-cases specific names (e.g. 'compliance_verification'),
   * then maps them to a canonical AgentWorkProtocolStep where a protocol step is
   * required. It is NOT constrained to the AgentWorkProtocolStep union.
   */
  skill: string;
  dependencies: string[]; // Array of step IDs that must complete first
  inputReferences: string[]; // Keys of required inputs
  outputReferences: string[]; // Keys of produced outputs
  conditions?: WorkflowCondition[];
  requiresApproval: boolean;
  /**
   * Retry policy for the step. `backoffMs` is the canonical field consumed by
   * the WorkflowScheduler retry path and is REQUIRED so a failing step can
   * always compute a valid retry timestamp (a missing value would produce NaN).
   */
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
  escalationCondition?: WorkflowCondition;
  sideEffectClassification?: SideEffectClassification;
  targetContext?: ActionTargetContext;
  approvalScope?: ApprovalScope;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  /** Optional: the Prisma model stores description as String?; producers may omit it. */
  description?: string;
  objective: string;
  version: string;
  steps: WorkflowStepDefinition[];
  /** Optional: workflow-level prerequisites; the Postgres store materializes []. */
  dependencies?: string[];
  conditions?: WorkflowCondition[];
  /** Optional: not enforced by the current runtime; producers may omit it. */
  requiredApprovals?: number;
  /** Optional: not enforced by the current runtime; producers may omit it. */
  allowedRoles?: AgentRole[];
  /** Optional: skill NAME strings (registry keys), mirroring WorkflowStepDefinition.skill. */
  allowedSkills?: string[];
  /** Optional: not enforced by the current runtime; producers may omit it. */
  expectedOutputs?: string[];
  escalationConditions?: WorkflowCondition[];
  /** Optional: mirrors Prisma WorkflowDefinition.createdAt (DB-side default now()). */
  createdAt?: string;
  /** Optional: mirrors Prisma WorkflowDefinition.updatedAt (DB-side @updatedAt). */
  updatedAt?: string;
}

export interface WorkflowStepState {
  stepId: string;
  status: WorkflowStepStatus;
  assignedRole: AgentRole;
  /** Skill NAME (registry key) mirrored from the step definition. See WorkflowStepDefinition.skill. */
  skill: string;
  startedAt?: string;
  completedAt?: string;
  outputs: Record<string, any>;
  evidenceReferences: string[]; // IDs of generated/used evidence
  error?: string;
  retryCount: number;
  approvalState?: 'pending' | 'approved' | 'rejected';
  blockedReason?: string;
  sideEffectClassification?: SideEffectClassification;
  approvalId?: string;
  authorizationReasonCode?: string;
  claimedBy?: string;
  claimedAt?: string;
}

export interface WorkflowInstanceState {
  instanceId: string;
  workflowId: string;
  version: string;
  stateVersion?: number;
  objective: string;
  status: WorkflowInstanceStatus;
  stepStates: Record<string, WorkflowStepState>;
  createdAt: string;
  updatedAt: string;
  outputs: Record<string, any>;
  evidenceReferences: string[];
  approvalState?: 'pending' | 'approved' | 'rejected';
  failureReason?: string;
  escalationState?: string;
  claimedBy?: string;
  claimedAt?: string;
}
