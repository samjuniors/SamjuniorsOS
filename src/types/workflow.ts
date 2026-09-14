import { AgentRole, AgentWorkProtocolStep } from './os';
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
  skill: AgentWorkProtocolStep;
  dependencies: string[]; // Array of step IDs that must complete first
  inputReferences: string[]; // Keys of required inputs
  outputReferences: string[]; // Keys of produced outputs
  conditions?: WorkflowCondition[];
  requiresApproval: boolean;
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
  description: string;
  objective: string;
  version: string;
  steps: WorkflowStepDefinition[];
  dependencies: string[]; // Global dependencies or workflow-level prerequisites
  conditions?: WorkflowCondition[];
  requiredApprovals: number;
  allowedRoles: AgentRole[];
  allowedSkills: AgentWorkProtocolStep[];
  expectedOutputs: string[];
  escalationConditions?: WorkflowCondition[];
}

export interface WorkflowStepState {
  stepId: string;
  status: WorkflowStepStatus;
  assignedRole: AgentRole;
  skill: AgentWorkProtocolStep;
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
  /**
   * PHASE 4.4B.1 — FOUNDER ATTRIBUTION.
   * Mirrors the authoritative Prisma `WorkflowInstance.initiatedById` column
   * (FK → User). Populated at creation from the AUTHENTICATED founder
   * identity (runtime.createInstance options). Never client-supplied; never
   * fabricated. Persisted through the dev DurableFileStore round-trip; the
   * authoritative Postgres store writes the column only when it resolves to a
   * real User row.
   */
  initiatedById?: string;
  approvalState?: 'pending' | 'approved' | 'rejected';
  failureReason?: string;
  escalationState?: string;
  claimedBy?: string;
  claimedAt?: string;
}
