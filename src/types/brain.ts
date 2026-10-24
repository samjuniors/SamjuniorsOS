/**
 * SamJuniorsOS — Company Brain Type Definitions
 * 
 * Defines the contract for the single authoritative Company Brain.
 * All operational state, governed knowledge, company precedents (memory),
 * governance decisions, canonical facts, and versioned artifacts are
 * accessed and mutated through this unified interface.
 */

import {
  AIAgent,
  AttentionItem,
  CompanyDecision,
  CompanyInitiative,
  CustomerDeal,
  FinanceMetric,
  ProductFeature,
  AgentRole,
  ResearchTopic,
  CompanyExecutiveContextSnapshot,
  CompanyMemory,
  OrchestrationRun,
  RetrievedHistoricalMemory,
} from './os';
import {
  RetrievedStateItem,
  StateQueryParams,
  RetrievedKnowledgeItem,
  CompanyKnowledgeItem,
  ICompanyStateStore,
} from './context';
import { DecisionRecord, DecisionFilter } from './decision';
import { CanonicalFact, EpistemicClaim } from './epistemic';
import {
  ArtifactRecord,
  ArtifactVersionRecord,
  CreateArtifactInput,
  CreateArtifactVersionInput,
  ArtifactApprovalLinkage,
  ArtifactStatus,
} from './artifact';

export interface FullCompanyContext extends CompanyExecutiveContextSnapshot {
  activeWorkstreams?: OrchestrationRun[];
  constitution: {
    name: string;
    mission: string;
    operatingPrinciples: string[];
    safeguards: string[];
  };
}

export interface ICompanyBrain extends ICompanyStateStore {
  // Operational State
  getInitiatives(): Promise<CompanyInitiative[]>;
  setInitiatives(initiatives: CompanyInitiative[]): Promise<void>;
  getFinancialMetrics(): Promise<FinanceMetric>;
  updateFinancialMetrics(patch: Partial<FinanceMetric>): Promise<void>;
  getProducts(): Promise<ProductFeature[]>;
  updateProducts(products: ProductFeature[]): Promise<void>;
  getCustomers(): Promise<CustomerDeal[]>;
  updateCustomers(customers: CustomerDeal[]): Promise<void>;
  getAttentionItems(): Promise<AttentionItem[]>;
  updateAttentionItems(items: AttentionItem[]): Promise<void>;
  getEmployees(): Promise<AIAgent[]>;
  getDecisions(filter?: DecisionFilter): Promise<CompanyDecision[]>;
  getDecision(id: string): Promise<DecisionRecord | null>;
  recordDecision(decision: CompanyDecision | DecisionRecord): Promise<void>;
  queryState(params: StateQueryParams): Promise<RetrievedStateItem[]>;

  // Governed Knowledge & Memory
  getKnowledge(): Promise<CompanyKnowledgeItem[]>;
  queryKnowledge(query: string, limit?: number): Promise<RetrievedKnowledgeItem[]>;
  getMemories(): Promise<CompanyMemory[]>;
  queryMemories(query: string, limit?: number): Promise<RetrievedHistoricalMemory[]>;
  getActiveFacts(): Promise<CanonicalFact[]>;
  listClaims(): Promise<EpistemicClaim[]>;

  // Versioned Artifacts (Gate G4.2)
  createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord>;
  addArtifactVersion(idOrSlug: string, input: CreateArtifactVersionInput): Promise<ArtifactRecord>;
  getArtifact(idOrSlug: string): Promise<ArtifactRecord | null>;
  getArtifactVersion(idOrSlug: string, version: number): Promise<ArtifactVersionRecord | null>;
  listArtifacts(filter?: { kind?: string; status?: ArtifactStatus; tag?: string }): Promise<ArtifactRecord[]>;
  bindArtifactApproval(idOrSlug: string, version: number, linkage: ArtifactApprovalLinkage): Promise<ArtifactRecord>;

  // Intelligence
  recordIntelligence(topic: ResearchTopic): Promise<void>;
  getIntelligence(): Promise<ResearchTopic[]>;
  recordEngineeringIntelligence(intel: NonNullable<CompanyExecutiveContextSnapshot['engineeringIntelligence']>): Promise<void>;
  getEngineeringIntelligence(): Promise<CompanyExecutiveContextSnapshot['engineeringIntelligence'] | undefined>;

  // Context Projections
  getCanonicalContext(): Promise<FullCompanyContext>;
  formatForRoleContext(role: AgentRole | 'advisor', context: FullCompanyContext): string;
}
