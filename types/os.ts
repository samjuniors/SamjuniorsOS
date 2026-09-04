// ============================================================================
// SAMJUNIORS OS — DATA ARCHITECTURE & DOMAIN MODEL
// ============================================================================
// Core Rule:
// A dashboard must never imply that SamJuniors has achieved a business result,
// financial result, security certification, customer result, or operational action
// unless the system has actual evidence for it.
//
// Clear Separation of Concerns:
// 1. Company State: Organizational context, governance policies, active initiatives.
// 2. Employee Definitions (AIAgent): Durable identity, role configuration, permissions.
// 3. Agent Runtime / Executions: Live multi-agent orchestration passes, execution graphs.
// 4. Tasks: Discrete work units assigned, queued, or completed in session.
// 5. Deliverables: Structured business/technical documents authored by agents.
// 6. Decisions: Governance proposals requiring Founder ratification.
// 7. Evidence & Provenance: Grounding basis and author verification.
// 8. Verification: Compliance and sandbox safety checks.
// 9. Simulation & Planning Models: Computational models and sample data for planning.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. OS WINDOW & APP METADATA
// ----------------------------------------------------------------------------

export type AppId =
  | 'workforce'
  | 'company'
  | 'customers'
  | 'research'
  | 'products'
  | 'finance'
  | 'settings'
  | 'terminal'
  | 'notes'
  | 'advisor'
  | 'messages';

export interface AppMetadata {
  id: AppId;
  name: string;
  category: string;
  description: string;
  iconName: string;
  color: string;
  badge?: number | string;
  defaultSize: { width: number; height: number };
}

export interface WindowState {
  id: AppId;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

// ----------------------------------------------------------------------------
// 2. EMPLOYEE ROLES & DEFINITIONS (Durable Employee Identity)
// ----------------------------------------------------------------------------

export type AgentRole = 'coo' | 'researcher' | 'pm' | 'finance';

export interface AgentPermission {
  name: string;
  description: string;
  category: 'Coordination' | 'Intelligence' | 'Product' | 'Financial' | 'System';
  isSafeMock: boolean;
}

/**
 * AIAgent represents durable employee identity, configuration, and capabilities.
 * It does NOT contain fabricated runtime statistics (e.g. fake uptime or fake accuracy).
 */
export interface AIAgent {
  id: AgentRole;
  name: string;
  role: string;
  department: string;
  avatarColor: string;
  accentColor: string;
  status:
    | 'idle'
    | 'processing'
    | 'standby'
    | 'active'
    | 'understanding'
    | 'researching'
    | 'analyzing'
    | 'planning'
    | 'executing'
    | 'testing'
    | 'verifying'
    | 'reviewing'
    | 'reporting';
  currentTask: string;
  bio: string;
  goals?: string[];
  responsibilities?: string[];
  skills?: string[];
  instructions?: string;
  capabilities?: string[];
  permissions?: AgentPermission[];
  model?: string;
  taskQueue?: AgentTask[];
  tasks?: Array<{
    id: string;
    title: string;
    priority: string;
    description: string;
    status: string;
    completedAt?: string;
  }>;
  activityHistory?: AgentActivity[];
  recentActivity?: Array<{ time: string; action: string; badge?: string }>;
}

/**
 * AgentRuntimeStats represents stats derived from actual runtime execution/task data.
 */
export interface AgentRuntimeStats {
  agentId: AgentRole;
  deliverablesAuthored: number;
  activeTasks: number;
  completedTasks: number;
  lastActiveTime?: string;
}

// ----------------------------------------------------------------------------
// 3. 9-STEP AGENT WORK PROTOCOL & TASK PIPELINE
// ----------------------------------------------------------------------------

export type AgentWorkProtocolStep =
  | 'understand'
  | 'research'
  | 'analyze'
  | 'plan'
  | 'build_execute'
  | 'test'
  | 'verify'
  | 'review'
  | 'report';

export interface AgentTask {
  id: string;
  title: string;
  protocolStep: AgentWorkProtocolStep;
  priority: 'Critical' | 'High' | 'Medium';
  status: 'queued' | 'in_progress' | 'testing' | 'completed';
  assignedAgent: AgentRole;
  inputDescription: string;
  outputSnippet?: string;
  timestamp: string;
}

export interface AgentActivity {
  id: string;
  time: string;
  action: string;
  protocolStep: AgentWorkProtocolStep;
  output?: string;
  badge?: string;
  status: 'success' | 'info' | 'warning';
}

// ----------------------------------------------------------------------------
// 4. EVIDENCE & PROVENANCE (Truth Tracking)
// ----------------------------------------------------------------------------

export type EvidenceBasis =
  | 'external_evidence'
  | 'calculation'
  | 'model_reasoning'
  | 'unverified';

export interface OutputProvenance {
  agentId: AgentRole;
  agentName: string;
  taskId: string;
  protocolStep: AgentWorkProtocolStep;
  timestamp: string;
  isVerified: boolean;
  evidenceBasis: EvidenceBasis;
  modelUsed?: string;
}

// ----------------------------------------------------------------------------
// 5. VERIFICATION & SAFETY BOUNDS
// ----------------------------------------------------------------------------

export interface VerificationResult {
  isCompliant: boolean;
  checksPassed: string[];
  checksFailed: string[];
  safeMockEnforced: boolean;
  notes: string;
  verifiedAt: string;
}

// ----------------------------------------------------------------------------
// 6. RUNTIME ORCHESTRATION & EXECUTION STATE
// ----------------------------------------------------------------------------

export type ExecutionState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'requires_approval';

export interface ExecutionMessage {
  id: string;
  sender: 'orchestrator' | 'coo' | 'researcher' | 'pm' | 'finance' | 'founder';
  text: string;
  timestamp: string;
  type: 'status' | 'finding' | 'critique' | 'artifact' | 'approval_request';
  protocolStep?: AgentWorkProtocolStep;
  artifactData?: any;
  provenance?: OutputProvenance;
}

export interface ExecutionPlanItem {
  stage: number;
  title: string;
  agentId: AgentRole;
  protocolStep: AgentWorkProtocolStep;
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'blocked' | 'requires_approval';
  outputSnippet?: string;
  provenance?: OutputProvenance;
  toolSelection?: import('./capabilities').ToolSelectionResult;
  toolEvidence?: import('./capabilities').ToolExecutionEvidence;
}

export interface ParticipatingEmployee {
  agentId: AgentRole;
  name: string;
  role: string;
  department: string;
  status: 'completed' | 'failed' | 'partial';
  contribution: string;
}

export interface FounderDecisionDetails {
  required: boolean;
  title: string;
  recommendation: string;
  why: string;
  impact: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedAt?: string;
}

export interface FounderExecutiveResult {
  recommendation: string;
  keyFindings: string[];
  businessImplications: string[];
  risks: string[];
  recommendedNextActions: string[];
  founderDecision?: FounderDecisionDetails;
  preparedBy: {
    name: string;
    role: string;
    agentId: AgentRole;
  };
  participatingEmployees: ParticipatingEmployee[];
  verificationStatus: 'verified' | 'pending' | 'failed' | 'insufficient_evidence';
  verificationDetails?: {
    isCompliant: boolean;
    checksPassed: string[];
    checksFailed: string[];
    notes: string;
  };
  evidenceAvailability: {
    hasProvenance: boolean;
    evidenceCount: number;
    primaryBasis: EvidenceBasis;
    deliverableIds?: string[];
  };
  executionOutcome: 'success' | 'partial' | 'failed' | 'unconfigured';
  failureReason?: string;
}

export interface OrchestrationRun {
  id: string;
  directive: string;
  timestamp: string;
  status: 'planning' | 'running' | 'synthesizing' | 'completed' | 'paused' | 'failed' | 'requires_approval';
  currentProtocolStep?: AgentWorkProtocolStep;
  protocolProgress?: Record<AgentWorkProtocolStep, 'pending' | 'active' | 'completed'>;
  liveAi?: boolean;
  modelUsed?: string;
  title: string;
  summary: string;
  plan: ExecutionPlanItem[];
  messages: ExecutionMessage[];
  deliverables: ExecutionDeliverable[];
  finalExecutiveReport?: string;
  executiveResult?: FounderExecutiveResult;
  verificationResult?: VerificationResult;
  executionSummary?: {
    totalAgentsInvoked: number;
    agentsInvoked: AgentRole[];
    totalTasksExecuted: number;
    executionMode: 'multi_agent_orchestrated' | 'direct_agent' | 'unconfigured';
  };
}

// ----------------------------------------------------------------------------
// 7. COMPANY WORK DELIVERABLES
// ----------------------------------------------------------------------------

export interface ExecutionDeliverable {
  id?: string;
  name: string;
  owner: string;
  authorAgentId?: string;
  authorName?: string;
  type?: 'report' | 'spec' | 'research' | 'financial' | 'general' | string;
  protocolStep?: AgentWorkProtocolStep;
  content: string;
  updatedAt?: string;
  provenance?: OutputProvenance;
}

// ----------------------------------------------------------------------------
// 8. COMPANY STATE, INITIATIVES & GOVERNANCE DECISIONS
// ----------------------------------------------------------------------------

export interface CompanyInitiative {
  id: string;
  title: string;
  codeName?: string;
  status: 'Active' | 'Validating' | 'In Progress' | 'Review' | 'Shipped' | 'Paused';
  currentObjective: string;
  contributors: Array<{
    agentId: AgentRole;
    name: string;
    role: string;
  }>;
  latestResult: string;
  nextRecommendedAction: string;
  risks: string[];
  deliverableIds?: string[];
  updatedAt: string;
}

export interface CompanyDecision {
  id: string;
  title: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'revision_requested' | 'in_review' | 'resolved';
  category: 'Strategic' | 'Financial' | 'Product' | 'Governance';
  recommendedBy: string;
  agentId: AgentRole;
  recommendation: string;
  businessImpact: string;
  evidenceSummary: string;
  date: string;
  founderApprovalRequired: boolean;
  resolutionNote?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface AttentionItem {
  id: string;
  type:
    | 'approval_required'
    | 'decision_required'
    | 'blocked_work'
    | 'financial_warning'
    | 'customer_issue'
    | 'product_decision'
    | 'research_finding';
  title: string;
  whatHappened: string;
  whyItMatters: string;
  recommendedAction: string;
  authorAgentId: AgentRole;
  authorName: string;
  founderActionRequired: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'revision_requested' | 'dismissed' | 'resolved';
  timestamp: string;
  resolutionNote?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  evidence?: {
    basis: EvidenceBasis;
    source: string;
    details: string;
  };
}

export interface OSNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'agent' | 'system' | 'finance' | 'deal';
  agent?: string;
  read: boolean;
  actionable?: boolean;
  actionLabel?: string;
  appTarget?: AppId;
}

// ----------------------------------------------------------------------------
// 9. SIMULATION & PLANNING MODELS (Explicitly marked as Planning / Simulation)
// ----------------------------------------------------------------------------

/**
 * Computational Unit Economics & Financial Simulation Model
 * Used for pricing stress-tests and cost planning sandbox.
 */
export interface FinanceMetric {
  mrr: number;
  arr: number;
  grossMargin: number;
  computeSpend: number;
  runwayMonths: number;
  burnRate: number;
  netIncome: number;
  tokenUsageMillions: number;
  isSimulatedModel?: boolean;
}

/**
 * Prospective Account Deal for CRM and Outreach Modeling
 */
export interface CustomerDeal {
  id: string;
  companyName: string;
  logoLetter: string;
  tier: 'Enterprise' | 'Scale' | 'Autonomous Pro';
  arr: string;
  stage: 'Discovery' | 'AI Demo' | 'Contract Review' | 'Closed Won';
  leadAgent: string;
  health: 'High' | 'Good' | 'At Risk';
  lastInteraction: string;
  notes: string;
  isProspectAccount?: boolean;
}

/**
 * Product Specification & Roadmap Item
 */
export interface ProductFeature {
  id: string;
  title: string;
  category: 'Core OS' | 'Agent Swarm' | 'Security' | 'Billing';
  status: 'In Progress' | 'In Review' | 'Shipped' | 'Backlog';
  owner: string;
  priority: 'Critical' | 'High' | 'Medium';
  completion: number;
  description: string;
}

/**
 * Research Intelligence Brief
 */
export interface ResearchTopic {
  id: string;
  title: string;
  category: 'Model Tech' | 'Market Intel' | 'Competitor Threat' | 'Regulatory' | 'Engineering' | 'Repository Recon' | string;
  confidence: number;
  impact: 'Transformative' | 'High' | 'Moderate';
  date: string;
  author: string;
  summary: string;
  tags: string[];
  evidence?: {
    basis?: EvidenceBasis;
    repositoryTarget?: string;
    facts?: string[];
    inferences?: string[];
    uncertainties?: string[];
    claims?: any[];
    sources?: any[];
    limitations?: string[];
    status?: string;
  };
}

// ----------------------------------------------------------------------------
// 10. DIRECT MESSAGES FOUNDATION (Founder <-> Employee Direct Communication)
// ----------------------------------------------------------------------------

export interface EmployeeDirectMessage {
  id: string;
  conversationId: string;
  sender: 'founder' | AgentRole;
  senderName: string;
  recipient: 'founder' | AgentRole;
  recipientName: string;
  text: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
  taskReferenceId?: string;
  deliverableReferenceId?: string;
  isLiveAi?: boolean;
  provenance?: OutputProvenance;
}

export interface EmployeeConversationThread {
  id: string;
  agentId: AgentRole;
  agentName: string;
  agentRole: string;
  department: string;
  avatarColor: string;
  status: 'active' | 'idle' | 'busy';
  lastMessageText?: string;
  lastMessageTimestamp?: string;
  unreadCount: number;
  messages: EmployeeDirectMessage[];
  pinnedContextIds?: string[];
}

// ----------------------------------------------------------------------------
// 11. FOUNDER ADVISOR & FOUNDER INTELLIGENCE FOUNDATION
// ----------------------------------------------------------------------------

export interface AdvisorStrategicInsight {
  id: string;
  title: string;
  summary: string;
  category: 'Strategy' | 'Risk' | 'Opportunity' | 'Governance' | 'Economics';
  severity: 'Critical' | 'High' | 'Medium' | 'Info';
  primaryAgentSource?: AgentRole;
  suggestedAction: string;
  timestamp: string;
  evidenceBasis: EvidenceBasis;
}

export interface AdvisorQueryContext {
  activeInitiativesCount: number;
  pendingApprovalsCount: number;
  criticalRisksCount: number;
  activeAgents: AgentRole[];
  latestDeliverablesSummary?: string;
  financialMetricsSnapshot?: FinanceMetric;
  attentionItemsSnapshot?: AttentionItem[];
}

export interface AdvisorTargetContext {
  section:
    | 'hq_attention'
    | 'hq_initiatives'
    | 'hq_decisions'
    | 'hq_deliverables'
    | 'hq_employees'
    | 'hq_intelligence'
    | 'hq_council_result';
  title: string;
  category?: string;
  sourceEntityId?: string;
  sourceEntityName?: string;
  recommendation?: string;
  whyItMatters?: string;
  risk?: string;
  resultSnippet?: string;
  evidenceBasis?: string;
  suggestedQuestions?: string[];
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface EpistemicKnowledgeBreakdown {
  facts: string[];
  inferences: string[];
  recommendations: string[];
  unknowns: string[];
}

export interface FounderAdvisorResponse {
  success: boolean;
  question: string;
  summary: string;
  analysisMarkdown: string;
  epistemicBreakdown: EpistemicKnowledgeBreakdown;
  strategicInsights: AdvisorStrategicInsight[];
  suggestedFollowUpPrompts: string[];
  contextAttachment?: AdvisorTargetContext;
  referencedInitiatives?: string[];
  referencedAgents?: AgentRole[];
  referencedDecisions?: string[];
  liveAi: boolean;
  modelUsed?: string;
  timestamp: string;
  executionOutcome?: 'live_ai' | 'unconfigured' | 'error';
  error?: string;
}

export interface CompanyMemory {
  id: string;
  decisionId: string;
  approvedAction: string;
  executionOutcome: string;
  evidenceReferences: string[];
  epistemicConfidence: 'verified_fact' | 'high_confidence' | 'unverified';
  timestamp: string;
}

// ----------------------------------------------------------------------------
// 12. SHARED COMPANY CONTEXT SNAPSHOT
// ----------------------------------------------------------------------------

export interface CompanyExecutiveContextSnapshot {
  initiatives: CompanyInitiative[];
  decisions: CompanyDecision[];
  attentionItems: AttentionItem[];
  agents: AIAgent[];
  recentIntelligence: ResearchTopic[];
  financialModel: FinanceMetric;
  orchestrationHistory: OrchestrationRun[];
  companyMemory: CompanyMemory[];
  engineeringIntelligence?: {
    repositoryTarget: string;
    lastReconTimestamp: string;
    status: string;
    findingsSummary: string;
    evidence?: any;
  };
  lastUpdated: string;
}

// ----------------------------------------------------------------------------
// 13. AI EMPLOYEE COLLABORATION WORKFLOW
// ----------------------------------------------------------------------------

export interface CollaborationDialogue {
  id: string;
  from: AgentRole;
  fromName: string;
  to: AgentRole | 'council';
  toName: string;
  message: string;
  timestamp: string;
  protocolStep: AgentWorkProtocolStep;
  attachment?: {
    title: string;
    type: 'prd' | 'research_brief' | 'budget_constraint' | 'governance_record';
    appTarget: AppId;
    snippet: string;
  };
}

export interface CollaborationStep {
  id: string;
  stepNumber: number;
  title: string;
  protocolStep: AgentWorkProtocolStep;
  initiatingAgent: AgentRole;
  targetAgent: AgentRole | 'council';
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  timestamp: string;
  dialogue: CollaborationDialogue;
  affectedApp: AppId;
  outputArtifact: string;
}

export interface EmployeeCollaborationState {
  id: string;
  title: string;
  directive: string;
  status: 'idle' | 'running' | 'completed';
  currentStepIndex: number;
  steps: CollaborationStep[];
  allDialogues: CollaborationDialogue[];
  artifacts: {
    feature: ProductFeature;
    prdSnippet: string;
    researchTopic: ResearchTopic;
    financialGuardrail: {
      initiative: string;
      maxComputeCostPer1kOps: string;
      targetGrossMargin: string;
      projectedAnnualArr: string;
      cachingStrategy: string;
      signOffDate: string;
    };
    decision: CompanyDecision;
    companyMemory: CompanyMemory;
  };
  startedAt?: string;
  completedAt?: string;
}

