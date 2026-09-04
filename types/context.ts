import {
  AgentRole,
  ProductFeature,
  CompanyInitiative,
  CustomerDeal,
  AIAgent,
  CompanyDecision,
  AttentionItem,
  FinanceMetric,
  CompanyMemory,
  RetrievedHistoricalMemory,
} from './os';

/**
 * PHASE 11.12: Epistemic Classifications
 * Enforces strict epistemic separation across all retrieved artifacts.
 */
export type EpistemicClassification =
  | 'current_truth' // Company State: operational ground truth (initiatives, budget, customers, agents)
  | 'durable_reference' // Company Knowledge: SOPs, specs, architecture, policies
  | 'historical_memory' // Company Memory: past decisions & recorded execution outcomes (precedent only)
  | 'current_evidence' // Empirical real-time verification from tool runs or test results
  | 'ai_inference'; // Derived specialist analysis or recommendation

/**
 * Standardized Phase 11.13 Epistemic Human-Readable Labels
 */
export type EpistemicLabel =
  | 'current verified evidence'
  | 'company state'
  | 'company knowledge'
  | 'historical memory'
  | 'AI inference';

export const EPISTEMIC_LABELS: Record<EpistemicClassification, EpistemicLabel> = {
  current_evidence: 'current verified evidence',
  current_truth: 'company state',
  durable_reference: 'company knowledge',
  historical_memory: 'historical memory',
  ai_inference: 'AI inference',
};

/**
 * Mandatory Provenance Metadata for every retrieved item
 */
export interface ContextItemProvenance {
  sourceSystem: 'company_state' | 'company_knowledge' | 'company_memory' | 'current_evidence';
  sourceId: string;
  sourceTitle: string;
  epistemicType: EpistemicClassification;
  epistemicLabel?: EpistemicLabel;
  authority: string; // e.g. "Operational System Truth", "Executive SOP Mandate", "Founder-Approved Precedent", "Empirical Tool Verification"
  timestamp: string;
  confidence: 'verified_fact' | 'high_confidence' | 'reference_standard' | 'unverified';
  immutablePrecedent?: boolean; // true for historical memory
  notes?: string;
}

/**
 * COMPANY STATE: Retrieved Item
 */
export interface RetrievedStateItem {
  entityType: 'product' | 'initiative' | 'customer' | 'employee' | 'decision' | 'task' | 'finance';
  id: string;
  title: string;
  summary: string;
  data: any;
  relevanceScore: number;
  matchReason: string;
  provenance: ContextItemProvenance;
}

/**
 * COMPANY KNOWLEDGE: Reference Item Definition
 */
export interface CompanyKnowledgeItem {
  id: string;
  documentId: string;
  title: string;
  category: 'sop' | 'technical_architecture' | 'product_spec' | 'policy' | 'research_reference';
  version: string;
  content: string;
  summary: string;
  tags: string[];
  applicableDepartments: (AgentRole | 'council' | 'advisor')[];
  authorAuthority: string;
  lastVerifiedDate: string;
  isDurableReference: true;
  sourceUri?: string;
}

/**
 * COMPANY KNOWLEDGE: Retrieved Item
 */
export interface RetrievedKnowledgeItem {
  knowledgeId: string;
  documentId: string;
  title: string;
  category: 'sop' | 'technical_architecture' | 'product_spec' | 'policy' | 'research_reference';
  version: string;
  summary: string;
  contentSnippet: string;
  fullContent: string;
  applicableDepartments: (AgentRole | 'council' | 'advisor')[];
  relevanceScore: number;
  matchReason: string;
  provenance: ContextItemProvenance;
}

/**
 * Conflict Detection & Precedence Resolution
 * Precedence Rule: Current State / Evidence > Durable Reference (Knowledge) > Historical Memory (Precedent Only)
 */
export interface ContextConflict {
  id: string;
  conflictType: 'state_vs_memory' | 'state_vs_knowledge' | 'knowledge_vs_memory';
  higherPrecedenceItem: {
    sourceSystem: 'company_state' | 'company_knowledge' | 'company_memory';
    id: string;
    title: string;
    epistemicType: EpistemicClassification;
    claim: string;
  };
  lowerPrecedenceItem: {
    sourceSystem: 'company_state' | 'company_knowledge' | 'company_memory';
    id: string;
    title: string;
    epistemicType: EpistemicClassification;
    claim: string;
  };
  precedenceRule: string;
  resolutionSummary: string;
}

/**
 * Complete Context Bundle for an Employee Task or Advisor Query
 */
export interface TaskRetrievedContextBundle {
  taskId: string;
  role: AgentRole | 'advisor' | 'orchestrator' | 'council';
  taskTitle: string;
  timestamp: string;
  // Strictly separated 3-way context
  retrievedState: {
    items: RetrievedStateItem[];
    totalCount: number;
    byEntityType: Record<string, number>;
  };
  retrievedKnowledge: {
    items: RetrievedKnowledgeItem[];
    totalCount: number;
    byCategory: Record<string, number>;
  };
  retrievedMemory: {
    items: RetrievedHistoricalMemory[];
    totalCount: number;
    hasHistoricalPrecedents: boolean;
  };
  conflicts: ContextConflict[];
  excludedNoise: {
    stateItemsExcludedCount: number;
    knowledgeItemsExcludedCount: number;
    memoryItemsExcludedCount: number;
    sampleExcludedTitles: string[];
  };
  formattedSeparatedPrompt: string;
}

/**
 * Storage Interfaces designed for future PostgreSQL/Supabase pluggability
 */
export interface StateQueryParams {
  query?: string;
  role?: AgentRole | 'advisor' | 'orchestrator' | 'council';
  categories?: string[];
  tags?: string[];
  keywords?: string[];
  limit?: number;
}

export interface ICompanyStateStore {
  getProducts(): Promise<ProductFeature[]>;
  getInitiatives(): Promise<CompanyInitiative[]>;
  getCustomers(): Promise<CustomerDeal[]>;
  getEmployees(): Promise<AIAgent[]>;
  getDecisions(): Promise<CompanyDecision[]>;
  getAttentionItems(): Promise<AttentionItem[]>;
  getFinancialMetrics(): Promise<FinanceMetric>;
  queryState(params: StateQueryParams): Promise<RetrievedStateItem[]>;
}

export interface KnowledgeQueryParams {
  queryText: string;
  category?: string;
  role?: AgentRole | 'advisor' | 'orchestrator' | 'council';
  tags?: string[];
  keywords?: string[];
  limit?: number;
}

export interface ICompanyKnowledgeStore {
  getAllKnowledge(): Promise<CompanyKnowledgeItem[]>;
  getKnowledgeById(id: string): Promise<CompanyKnowledgeItem | null>;
  addKnowledge(item: CompanyKnowledgeItem): Promise<void>;
  queryKnowledge(params: KnowledgeQueryParams): Promise<RetrievedKnowledgeItem[]>;
}

export interface MemoryQueryParams {
  queryText: string;
  category?: string;
  tags?: string[];
  keywords?: string[];
  currentFacts?: string[];
  limit?: number;
}

export interface ICompanyMemoryStore {
  getAllMemories(): Promise<CompanyMemory[]>;
  getMemoryById(id: string): Promise<CompanyMemory | null>;
  recordMemory(memory: CompanyMemory): Promise<void>;
  queryMemories(params: MemoryQueryParams): Promise<RetrievedHistoricalMemory[]>;
}

// ============================================================================
// PHASE 11.13: DETERMINISTIC EMPLOYEE CONTEXT ASSEMBLY PIPELINE
// Task → Employee Role → Skill → relevant State/Knowledge/Memory → current evidence → final employee context
// ============================================================================

export interface CurrentEvidenceInput {
  id: string;
  sourceToolOrTest: string;
  evidenceType: 'tool_output' | 'telemetry' | 'test_verification' | 'user_input' | 'system_check';
  title: string;
  summary: string;
  data?: any;
  timestamp?: string;
  relevanceScore?: number;
  matchReason?: string;
  selectionReason?: string;
}

export interface InjectedContextItem {
  id: string;
  title: string;
  epistemicClassification: EpistemicClassification;
  epistemicLabel: EpistemicLabel;
  sourceSystem: 'company_state' | 'company_knowledge' | 'company_memory' | 'current_evidence';
  sourceId: string;
  authority: string;
  relevanceScore: number;
  matchReason: string;
  selectionReason: string; // Explains why this specific item was chosen for the task & skill
  characterCount: number;
  content: string;
  timestamp: string;
  isConflicting?: boolean;
  conflictResolutionNote?: string;
  provenance: ContextItemProvenance;
}

export interface EmployeeContextBudget {
  maxTotalCharacters: number;
  maxItemsPerCategory: {
    evidence: number;
    state: number;
    knowledge: number;
    memory: number;
  };
  totalCharactersUsed: number;
  budgetUtilizationPct: number;
  isTruncated: boolean;
  truncatedItemCount: number;
}

export interface ContextAssemblyPipelineStep {
  stage:
    | 'task_intake'
    | 'role_resolution'
    | 'skill_binding'
    | 'retrieval'
    | 'evidence_injection'
    | 'conflict_arbitration'
    | 'budget_enforcement'
    | 'final_assembly';
  description: string;
  status: 'completed' | 'skipped' | 'flagged';
  timestamp: string;
  details?: Record<string, any>;
}

export interface ContextAssemblyRequest {
  taskId?: string;
  taskTitle: string;
  taskDescription?: string;
  directive?: string;
  role: AgentRole | 'advisor' | 'orchestrator' | 'council';
  protocolStep?: import('./os').AgentWorkProtocolStep;
  explicitSkillId?: string;
  currentEvidence?: CurrentEvidenceInput[];
  currentFacts?: string[];
  tags?: string[];
  keywords?: string[];
  maxBudgetChars?: number;
  upstreamContext?: {
    cooScope?: string;
    researchFindings?: string;
    productSpecs?: string;
    financeAssessment?: string;
    verificationNotes?: string;
  };
}

export interface AssembledEmployeeContext {
  contextId: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  directive?: string;
  employeeRole: AgentRole | 'advisor' | 'orchestrator' | 'council';
  employeeName: string;
  skillId: string;
  skillName: string;
  skillPurpose: string;
  timestamp: string;
  
  // Pipeline tracking
  pipelineStages: ContextAssemblyPipelineStep[];

  // Categorized Injected Items
  currentEvidence: InjectedContextItem[];
  companyState: InjectedContextItem[];
  companyKnowledge: InjectedContextItem[];
  historicalMemory: InjectedContextItem[];

  // Consolidated & Audit
  allInjectedItems: InjectedContextItem[];
  totalInjectedItems: number;
  conflicts: ContextConflict[];
  budget: EmployeeContextBudget;
  excludedNoise: {
    stateItemsExcludedCount: number;
    knowledgeItemsExcludedCount: number;
    memoryItemsExcludedCount: number;
    sampleExcludedTitles: string[];
    rejectionReason: string;
  };

  // Immutability & Access Control
  isReadOnly: true;
  immutableSnapshotHash: string;

  // Formatted Prompts
  formattedPrompt: string;
  formattedSeparatedSections: {
    evidenceSection: string;
    stateSection: string;
    knowledgeSection: string;
    memorySection: string;
    conflictsSection: string;
  };
}
