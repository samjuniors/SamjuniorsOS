import { AgentRole, OutputProvenance } from './os';

// ----------------------------------------------------------------------------
// 1. SKILLS (Phase 11.11 Structured Reusable Skill Architecture)
// ----------------------------------------------------------------------------
export type SkillId = 
  | 'web_research'
  | 'competitor_research'
  | 'market_research'
  | 'software_repository_research'
  | 'repository_research'
  | 'source_comparison'
  | 'evidence_synthesis'
  | 'prd_creation'
  | 'requirements_analysis'
  | 'ux_analysis'
  | 'roadmap_analysis'
  | 'financial_modeling'
  | 'unit_economics'
  | 'unit_economics_modeling'
  | 'pricing_tier_simulation'
  | 'capital_efficiency_audit'
  | 'scenario_analysis'
  | 'task_coordination'
  | 'workflow_planning'
  | 'directive_decomposition'
  | 'compliance_verification'
  | 'executive_synthesis'
  | 'execution_monitoring';

export interface SkillRequiredInput {
  name: string;
  description: string;
  required: boolean;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue?: any;
}

export interface StructuredSkillDefinition {
  id: string;
  name: string;
  purpose: string;
  category: 'Operations' | 'Research' | 'Product' | 'Finance';
  requiredInputs: SkillRequiredInput[];
  procedure: string[];
  allowedTools: ToolId[];
  evidenceRequirements: string[];
  verificationRequirements: string[];
  outputFormat: string;
  escalationConditions: string[];
  description?: string;
}

export type SkillDefinition = StructuredSkillDefinition;

export interface SkillSelectionContext {
  taskTitle: string;
  taskDescription?: string;
  protocolStep?: import('./os').AgentWorkProtocolStep;
  employeeRole: AgentRole | 'advisor';
  directive?: string;
}

export interface SkillSelectionResult {
  selectedSkill?: StructuredSkillDefinition;
  reason: string;
  allowedTools: ToolId[];
}

export interface SkillExecutionRequest {
  skillId: string;
  employeeRole: AgentRole | 'advisor';
  taskTitle: string;
  taskDescription?: string;
  inputs: Record<string, any>;
  protocolStep?: import('./os').AgentWorkProtocolStep;
  provenance?: OutputProvenance;
}

export interface SkillExecutionResult {
  skillId: string;
  skillName: string;
  employeeRole: AgentRole | 'advisor';
  status: ExecutionStatus;
  selectedToolId?: ToolId;
  toolEvidence?: ToolExecutionEvidence;
  evidenceBasis: string;
  verificationPassed: boolean;
  verificationNotes: string;
  escalationRequired: boolean;
  escalationReason?: string;
  outputSummary: string;
  outputContent?: string;
  timestamp: string;
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
  | 'github_repository_read'
  | 'github_issues_read'
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
// 4. EVIDENCE & VERIFICATION BOUNDARY (Phase 11.4 Hardened)
// ----------------------------------------------------------------------------
export type ExecutionStatus = 
  | 'success' 
  | 'failed' 
  | 'pending_approval' 
  | 'denied' 
  | 'error' 
  | 'not_executed'
  | 'partial'
  | 'no_results';

export type VerificationState = 
  | 'unverified' 
  | 'verified_safe' 
  | 'source_retrieved'
  | 'evidence_extracted'
  | 'claim_supported'
  | 'verification_incomplete'
  | 'verified'
  | 'verification_failed'
  | 'conflicting';

export type SourceStatus = 'retrieved' | 'extracted' | 'invalid' | 'unreachable';

export interface ResearchSource {
  title: string;
  url: string;
  provider?: string;
  retrievalTimestamp?: string;
  excerpt?: string;
  status?: SourceStatus;
}

export type ClaimVerificationState = 
  | 'claim_supported'
  | 'verification_incomplete'
  | 'conflicting'
  | 'unverified'
  | 'verification_failed';

export interface ResearchClaim {
  id: string;
  statement: string;
  supportingSourceUrls: string[];
  evidenceExcerpt?: string;
  verificationState: ClaimVerificationState;
  confidence?: 'high' | 'medium' | 'low';
  notes?: string;
  conflictDetected?: boolean;
}

export interface ToolExecutionEvidence {
  toolId: ToolId;
  toolName: string;
  status: ExecutionStatus;
  timestamp: string;
  inputSummary: string;
  outputSummary?: string;
  data?: any;
  sourceReferences?: string[];
  sources?: ResearchSource[];
  claims?: ResearchClaim[];
  provenance: OutputProvenance;
  verificationState: VerificationState;
  executionSafetyState?: 'verified_safe' | 'unverified' | 'safety_violation';
  errorMessage?: string;
  limitations?: string[];
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

// ----------------------------------------------------------------------------
// 6. EXTERNAL PROVIDER & COMPOSIO BOUNDARY (Phase 11.5)
// ----------------------------------------------------------------------------
export type ProviderConfigStatus = 'configured' | 'unconfigured' | 'error';

export interface ComposioToolMapping {
  toolId: ToolId;
  toolkit: string;
  action: string;
  description?: string;
}

export interface ComposioSessionScope {
  userId: string;
  employeeRole?: AgentRole | 'advisor';
  permittedToolIds: ToolId[];
  connectedAccountId?: string;
}

export interface ExternalExecutionRequest {
  toolId: ToolId;
  input: Record<string, any>;
  sessionScope: ComposioSessionScope;
  provenance: OutputProvenance;
}

export interface ExternalToolProvider {
  providerId: string;
  name: string;
  getStatus(): ProviderConfigStatus;
  isAvailable(): boolean;
  createSession?(scope: ComposioSessionScope): Promise<any>;
  executeTool(request: ExternalExecutionRequest): Promise<ToolExecutionEvidence>;
}
