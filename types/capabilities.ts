import { AgentRole, OutputProvenance } from './os';

// ----------------------------------------------------------------------------
// 1. SKILLS
// ----------------------------------------------------------------------------
export type SkillId = 
  | 'web_research'
  | 'competitor_research'
  | 'market_research'
  | 'source_comparison'
  | 'evidence_synthesis'
  | 'prd_creation'
  | 'requirements_analysis'
  | 'ux_analysis'
  | 'roadmap_analysis'
  | 'financial_modeling'
  | 'unit_economics'
  | 'scenario_analysis'
  | 'task_coordination'
  | 'workflow_planning'
  | 'execution_monitoring';

export interface SkillDefinition {
  id: SkillId;
  name: string;
  description: string;
  category: 'Research' | 'Product' | 'Finance' | 'Operations';
}

// ----------------------------------------------------------------------------
// 2. TOOLS
// ----------------------------------------------------------------------------
export type ToolId = 
  | 'web_research'
  | 'browser'
  | 'calendar_read'
  | 'calendar_create'
  | 'drive_read'
  | 'drive_create'
  | 'github_read'
  | 'github_issue_create'
  | 'gmail_read'
  | 'gmail_draft'
  | 'gmail_send'
  | 'finance_transfer';

export type ToolRiskLevel = 'low' | 'medium' | 'high';
export type ToolMutationClass = 'read' | 'write' | 'delete' | 'execute';
export type ToolAvailability = 'available' | 'offline' | 'unconfigured' | 'deprecated';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  description: string;
  category: string;
  capabilities: SkillId[]; // Which skills this tool can fulfill
  inputSchema: Record<string, any>; // JSON Schema representation
  outputSchema: Record<string, any>; // JSON Schema representation
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  mutationClass: ToolMutationClass;
  availability: ToolAvailability;
  provider: string; // Integration identifier (e.g. 'google_workspace', 'github')
}

// ----------------------------------------------------------------------------
// 3. PERMISSIONS
// ----------------------------------------------------------------------------
export type PermissionEffect = 'allowed' | 'denied' | 'approval_required';

export interface PermissionPolicy {
  toolId: ToolId;
  effect: PermissionEffect;
  conditions?: Record<string, any>;
  reason?: string;
}

// ----------------------------------------------------------------------------
// 4. EVIDENCE BOUNDARY
// ----------------------------------------------------------------------------
export type ExecutionStatus = 'success' | 'failed' | 'pending_approval' | 'denied' | 'error' | 'not_executed';
export type VerificationState = 'unverified' | 'verified_safe' | 'verification_failed';

export interface ToolExecutionEvidence {
  toolId: ToolId;
  toolName: string;
  status: ExecutionStatus;
  timestamp: string;
  inputSummary: string;
  outputSummary?: string;
  sourceReferences?: string[];
  provenance: OutputProvenance;
  verificationState: VerificationState;
  errorMessage?: string;
}

// ----------------------------------------------------------------------------
// 5. SELECTION METADATA
// ----------------------------------------------------------------------------
export interface ToolSelectionContext {
  employeeRole: AgentRole | 'advisor';
  taskObjective: string;
  requiredSkills: SkillId[];
  availableTools: ToolDefinition[];
  permissions: PermissionPolicy[];
}

export interface ToolSelectionResult {
  candidateTools: ToolId[];
  allowedTools: ToolId[];
  deniedTools: ToolId[];
  approvalRequiredTools: ToolId[];
  selectedToolId?: ToolId;
  reason: string;
}
