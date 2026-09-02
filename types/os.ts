export type AppId =
  | 'workforce'
  | 'company'
  | 'customers'
  | 'research'
  | 'products'
  | 'finance'
  | 'settings'
  | 'terminal'
  | 'notes';

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

export type AgentRole = 'coo' | 'researcher' | 'pm' | 'finance';

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

export interface AgentPermission {
  name: string;
  description: string;
  category: 'Coordination' | 'Intelligence' | 'Product' | 'Financial' | 'System';
  isSafeMock: boolean;
}

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
  uptime: string;
  tasksCompleted: number;
  accuracyScore: string;
  tokenEfficiency: string;
  bio: string;
  goals: string[];
  instructions: string;
  capabilities: string[];
  permissions: AgentPermission[];
  taskQueue: AgentTask[];
  activityHistory: AgentActivity[];
  recentActivity: Array<{ time: string; action: string; badge?: string }>;
}

export type ExecutionState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'requires_approval';

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

export interface VerificationResult {
  isCompliant: boolean;
  checksPassed: string[];
  checksFailed: string[];
  safeMockEnforced: boolean;
  notes: string;
  verifiedAt: string;
}

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

export interface ExecutionDeliverable {
  name: string;
  owner: string;
  protocolStep?: AgentWorkProtocolStep;
  content: string;
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
  verificationResult?: VerificationResult;
  executionSummary?: {
    totalAgentsInvoked: number;
    agentsInvoked: AgentRole[];
    totalTasksExecuted: number;
    executionMode: 'multi_agent_orchestrated' | 'direct_agent' | 'unconfigured';
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
}

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

export interface ResearchTopic {
  id: string;
  title: string;
  category: 'Model Tech' | 'Market Intel' | 'Competitor Threat' | 'Regulatory';
  confidence: number;
  impact: 'Transformative' | 'High' | 'Moderate';
  date: string;
  author: string;
  summary: string;
  tags: string[];
}

export interface FinanceMetric {
  mrr: number;
  arr: number;
  grossMargin: number;
  computeSpend: number;
  runwayMonths: number;
  burnRate: number;
  netIncome: number;
  tokenUsageMillions: number;
}
