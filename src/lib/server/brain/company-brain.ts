/**
 * SamJuniorsOS — Single Authoritative Company Brain (Phase 2.3 / Gate G4.1)
 *
 * Authoritative single read and write path for Company State, Company Knowledge,
 * Historical Precedents (Memory), Decisions, and Epistemic Truth.
 *
 * Invariants (AGENTS.md §3, ARCHITECTURE.md §1):
 * 1. ONE Authoritative Company Brain: All operational state and company truth
 *    routes through this gateway. No parallel company brains, shadow stores,
 *    or disconnected agent state silos.
 * 2. Sophia Personal Mind Isolation: The founder's personal dialogue, sensory
 *    notes, and personal memories (PersonalMemoryStore) are strictly segregated
 *    and NEVER read or mutated through the Company Brain.
 * 3. Deterministic Governance: Writes to company state require authoritative
 *    validation, durable persistence (PostgreSQL / SQLite via Prisma &
 *    DurableFileStore), and fail-closed security.
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
  RetrievedHistoricalMemory,
} from '@/types/os';
import {
  RetrievedStateItem,
  StateQueryParams,
  RetrievedKnowledgeItem,
  CompanyKnowledgeItem,
} from '@/types/context';
import { DecisionRecord, DecisionFilter } from '@/types/decision';
import { CanonicalFact, EpistemicClaim } from '@/types/epistemic';
import { FullCompanyContext, ICompanyBrain } from '@/types/brain';
import { CompanyStateStore } from '@/lib/server/state/state-store';
import { CompanyMemoryStore } from '@/lib/server/memory/memory-store';
import { CompanyKnowledgeStore } from '@/lib/server/knowledge/knowledge-store';
import { DecisionStore } from '@/lib/server/decision/store';
import { EpistemicClaimStore } from '@/lib/server/epistemic/claim-store';
import { AgentRunStore } from '@/lib/server/agents/run-store';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import { INITIAL_RESEARCH } from '@/lib/os-data';
import { CompanyContextProvider } from '@/lib/server/context/company-context';
import {
  ArtifactRecord,
  ArtifactVersionRecord,
  CreateArtifactInput,
  CreateArtifactVersionInput,
  ArtifactApprovalLinkage,
  ArtifactStatus,
} from '@/types/artifact';
import { ArtifactStore } from '@/lib/server/artifacts/artifact-store';


export class CompanyBrain implements ICompanyBrain {
  private static instance: CompanyBrain | null = null;
  private stateStore: CompanyStateStore;
  private memoryStore: CompanyMemoryStore;
  private knowledgeStore: CompanyKnowledgeStore;
  private decisionStore: DecisionStore;
  private epistemicStore: EpistemicClaimStore;
  private runStore: AgentRunStore;
  private fileStore: DurableFileStore;
  private artifactStore: ArtifactStore;

  // Governed intelligence persistence collection name
  private readonly intelligenceCollection = 'company_intelligence';

  private constructor() {
    this.stateStore = CompanyStateStore.getInstance();
    this.memoryStore = CompanyMemoryStore.getInstance();
    this.knowledgeStore = CompanyKnowledgeStore.getInstance();
    this.decisionStore = DecisionStore.getInstance();
    this.epistemicStore = EpistemicClaimStore.getInstance();
    this.runStore = AgentRunStore.getInstance();
    this.fileStore = DurableFileStore.getInstance();
    this.artifactStore = ArtifactStore.getInstance();
  }

  public static getInstance(): CompanyBrain {
    if (!CompanyBrain.instance) {
      CompanyBrain.instance = new CompanyBrain();
    }
    return CompanyBrain.instance;
  }

  public static resetInstance(): void {
    CompanyBrain.instance = null;
    CompanyStateStore.resetInstance();
    ArtifactStore.resetInstance();
  }

  public getStateStore(): CompanyStateStore {
    return this.stateStore;
  }

  // =========================================================================
  // 1. OPERATIONAL STATE (Read & Write)
  // =========================================================================

  public async getInitiatives(): Promise<CompanyInitiative[]> {
    return this.stateStore.getInitiatives();
  }

  public async setInitiatives(initiatives: CompanyInitiative[]): Promise<void> {
    return this.stateStore.setInitiatives(initiatives);
  }

  public async getFinancialMetrics(): Promise<FinanceMetric> {
    return this.stateStore.getFinancialMetrics();
  }

  public async updateFinancialMetrics(patch: Partial<FinanceMetric>): Promise<void> {
    return this.stateStore.updateFinancialMetrics(patch);
  }

  public async getProducts(): Promise<ProductFeature[]> {
    return this.stateStore.getProducts();
  }

  public async updateProducts(products: ProductFeature[]): Promise<void> {
    return this.stateStore.updateProducts(products);
  }

  public async getCustomers(): Promise<CustomerDeal[]> {
    return this.stateStore.getCustomers();
  }

  public async updateCustomers(customers: CustomerDeal[]): Promise<void> {
    return this.stateStore.updateCustomers(customers);
  }

  public async getAttentionItems(): Promise<AttentionItem[]> {
    return this.stateStore.getAttentionItems();
  }

  public async updateAttentionItems(items: AttentionItem[]): Promise<void> {
    return this.stateStore.updateAttentionItems(items);
  }

  public async getEmployees(): Promise<AIAgent[]> {
    return this.stateStore.getEmployees();
  }

  public async updateEmployees(agents: AIAgent[]): Promise<void> {
    return this.stateStore.updateEmployees(agents);
  }

  public async getDecisions(filter?: DecisionFilter): Promise<CompanyDecision[]> {
    const { mapDecisionRecordToCompanyDecision } = await import('@/lib/server/decision/adapter');
    const records = await this.decisionStore.list(filter);
    return (records || []).map(mapDecisionRecordToCompanyDecision);
  }

  public async getDecision(id: string): Promise<DecisionRecord | null> {
    return this.decisionStore.get(id);
  }

  public async recordDecision(decision: CompanyDecision | DecisionRecord): Promise<void> {
    const { mapCompanyDecisionToDecisionRecord } = await import('@/lib/server/decision/adapter');
    const rec = 'decisionId' in decision ? decision : mapCompanyDecisionToDecisionRecord(decision);
    await this.decisionStore.create(rec);
  }

  public async queryState(params: StateQueryParams): Promise<RetrievedStateItem[]> {
    return this.stateStore.queryState(params);
  }

  // =========================================================================
  // 2. GOVERNED KNOWLEDGE & PRECEDENTS (Company Memory)
  // =========================================================================

  public async getKnowledge(): Promise<CompanyKnowledgeItem[]> {
    return this.knowledgeStore.getAllKnowledge();
  }

  public async queryKnowledge(query: string, limit?: number): Promise<RetrievedKnowledgeItem[]> {
    return this.knowledgeStore.queryKnowledge({ queryText: query, limit });
  }

  public async getMemories(): Promise<CompanyMemory[]> {
    return this.memoryStore.getAllMemories();
  }

  public async queryMemories(query: string, limit?: number): Promise<RetrievedHistoricalMemory[]> {
    return this.memoryStore.queryMemories({ queryText: query, limit });
  }

  // =========================================================================
  // 3. EPISTEMIC TRUTH (Canonical Facts & Claims)
  // =========================================================================

  public async getActiveFacts(): Promise<CanonicalFact[]> {
    return this.epistemicStore.listActiveFacts();
  }

  public async listClaims(): Promise<EpistemicClaim[]> {
    return this.epistemicStore.listClaims();
  }

  // =========================================================================
  // 4. RESEARCH & ENGINEERING INTELLIGENCE (Durable, Governed)
  // =========================================================================

  public async recordIntelligence(topic: ResearchTopic): Promise<void> {
    this.fileStore.withCollectionLockStrict(this.intelligenceCollection, () => {
      let currentTopics: ResearchTopic[] = [];
      try {
        const disk = this.fileStore.readCollection<any>(this.intelligenceCollection);
        if (Array.isArray(disk.topics)) {
          currentTopics = disk.topics;
        } else {
          currentTopics = [...INITIAL_RESEARCH];
        }
      } catch {
        currentTopics = [...INITIAL_RESEARCH];
      }

      // Deduplicate by ID or title
      const updated = [
        topic,
        ...currentTopics.filter((t) => t.id !== topic.id && t.title !== topic.title),
      ].slice(0, 15);

      this.fileStore.writeCollectionStrict(this.intelligenceCollection, {
        topics: updated,
        engineering: this.getEngineeringIntelligenceSync(),
      });
    });
  }

  public async getIntelligence(): Promise<ResearchTopic[]> {
    try {
      const disk = this.fileStore.readCollection<any>(this.intelligenceCollection);
      if (Array.isArray(disk.topics) && disk.topics.length > 0) {
        return disk.topics;
      }
    } catch {
      // fallback
    }
    return [...INITIAL_RESEARCH];
  }

  private getEngineeringIntelligenceSync(): CompanyExecutiveContextSnapshot['engineeringIntelligence'] | undefined {
    try {
      const disk = this.fileStore.readCollection<any>(this.intelligenceCollection);
      return disk.engineering;
    } catch {
      return undefined;
    }
  }

  public async recordEngineeringIntelligence(
    intel: NonNullable<CompanyExecutiveContextSnapshot['engineeringIntelligence']>
  ): Promise<void> {
    this.fileStore.withCollectionLockStrict(this.intelligenceCollection, () => {
      let topics: ResearchTopic[] = [...INITIAL_RESEARCH];
      try {
        const disk = this.fileStore.readCollection<any>(this.intelligenceCollection);
        if (Array.isArray(disk.topics)) topics = disk.topics;
      } catch {}

      this.fileStore.writeCollectionStrict(this.intelligenceCollection, {
        topics,
        engineering: intel,
      });
    });
  }

  public async getEngineeringIntelligence(): Promise<CompanyExecutiveContextSnapshot['engineeringIntelligence'] | undefined> {
    return this.getEngineeringIntelligenceSync();
  }

  public resetIntelligence(): void {
    try {
      this.fileStore.writeCollectionStrict(this.intelligenceCollection, {
        topics: [...INITIAL_RESEARCH],
        engineering: undefined,
      });
    } catch {}
  }

  // =========================================================================
  // 5. CANONICAL CONTEXT PROJECTION (Deterministic, Verified)
  // =========================================================================

  public static getCompanyConstitution(): FullCompanyContext['constitution'] {
    return {
      name: 'SamJuniors OS',
      mission: 'Autonomous, deterministic multi-agent enterprise operating system for agile founders.',
      operatingPrinciples: [
        'Autonomous Specialist Collaboration: Sophia Vance (COO), Dr. Aris Thorne (Research), Maya Lin (PM), and Julian Cruz (Finance) execute 9-step protocols.',
        'Result-First Executive Presentation: Deliver clear recommendations, verifiable artifacts, and explicit next steps before background logs.',
        'Strict Capital Efficiency: Maintain a minimum 80%+ gross margin floor across all operational compute.',
        'Zero-Trust Safe Mock Sandboxing: All external capital transfers, live mutations, and unverified credentials remain isolated in safe sandboxes.',
        'Human-in-the-Loop Governance: High-impact strategic decisions require explicit Founder ratification.',
      ],
      safeguards: [
        'No fabricated metrics or hallucinated revenue accounts.',
        'Truthful reporting when external API credentials or integrations are unconfigured.',
        'Verifiable provenance tracking for all specialist findings.',
      ],
    };
  }


  // =========================================================================
  // 6. VERSIONED ARTIFACTS (Gate G4.2)
  // =========================================================================

  public async createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
    return this.artifactStore.createArtifact(input);
  }

  public async addArtifactVersion(idOrSlug: string, input: CreateArtifactVersionInput): Promise<ArtifactRecord> {
    return this.artifactStore.addVersion(idOrSlug, input);
  }

  public async getArtifact(idOrSlug: string): Promise<ArtifactRecord | null> {
    return this.artifactStore.getArtifact(idOrSlug);
  }

  public async getArtifactVersion(idOrSlug: string, version: number): Promise<ArtifactVersionRecord | null> {
    return this.artifactStore.getArtifactVersion(idOrSlug, version);
  }

  public async listArtifacts(filter?: { kind?: string; status?: ArtifactStatus; tag?: string }): Promise<ArtifactRecord[]> {
    return this.artifactStore.listArtifacts(filter);
  }

  public async bindArtifactApproval(
    idOrSlug: string,
    version: number,
    linkage: ArtifactApprovalLinkage
  ): Promise<ArtifactRecord> {
    return this.artifactStore.bindApproval(idOrSlug, version, linkage);
  }

  public async getCanonicalContext(): Promise<FullCompanyContext> {
    const [
      initiatives,
      decisions,
      attentionItems,
      agents,
      financialModel,
      companyMemory,
      recentRuns,
      recentIntelligence,
      engineeringIntelligence,
    ] = await Promise.all([
      this.getInitiatives(),
      this.getDecisions(),
      this.getAttentionItems(),
      this.getEmployees(),
      this.getFinancialMetrics(),
      this.getMemories(),
      this.runStore.listRuns({ limit: 5 }),
      this.getIntelligence(),
      this.getEngineeringIntelligence(),
    ]);

    const activeWorkstreams = (recentRuns || []).map((r) => ({
      id: r.runId,
      directive: r.directive,
      timestamp: r.timestamp,
      status: (r.status === 'running'
        ? 'running'
        : r.status === 'halted'
        ? 'paused'
        : r.status === 'failed'
        ? 'failed'
        : 'completed') as any,
      liveAi: true,
      title: r.taskTitle,
      summary: (r.outputContent || '').slice(0, 400),
      plan: [],
      messages: [],
      deliverables: [],
    }));

    return {
      initiatives,
      decisions,
      attentionItems,
      agents,
      activeWorkstreams,
      orchestrationHistory: activeWorkstreams,
      financialModel,
      recentIntelligence,
      engineeringIntelligence,
      companyMemory,
      constitution: CompanyBrain.getCompanyConstitution(),
      lastUpdated: new Date().toISOString(),
    };
  }

  public formatForRoleContext(role: AgentRole | 'advisor', context: FullCompanyContext): string {
    return CompanyContextProvider.formatForEmployeeRoleContext(role, context);
  }
}
