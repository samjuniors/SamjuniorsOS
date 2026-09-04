import {
  AIAgent,
  AttentionItem,
  CompanyDecision,
  CompanyInitiative,
  CustomerDeal,
  FinanceMetric,
  ProductFeature,
  AgentRole,
} from '@/types/os';
import {
  INITIAL_AGENTS,
  INITIAL_INITIATIVES,
  INITIAL_COMPANY_DECISIONS,
  INITIAL_ATTENTION_ITEMS,
  SAMPLE_PIPELINE_DEALS,
  INITIAL_FEATURES,
  SAMPLE_FINANCIAL_MODEL,
} from '@/lib/os-data';
import {
  ICompanyStateStore,
  RetrievedStateItem,
  StateQueryParams,
} from '@/types/context';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
  'by', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me',
  'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she',
  'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until',
  'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves'
]);

function extractTokens(text?: string | null): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Server-Side Single Source of Truth for COMPANY STATE (Current Operational Reality)
 * 
 * Implements ICompanyStateStore.
 * Designed so that PostgreSQL / Supabase can replace this implementation directly
 * without altering any contextual retrieval or business logic.
 */
export class CompanyStateStore implements ICompanyStateStore {
  private static instance: CompanyStateStore | null = null;

  // In-memory runtime state backing store
  private products: ProductFeature[] = [...INITIAL_FEATURES];
  private initiatives: CompanyInitiative[] = [...INITIAL_INITIATIVES];
  private customers: CustomerDeal[] = [...SAMPLE_PIPELINE_DEALS];
  private employees: AIAgent[] = [...INITIAL_AGENTS];
  private decisions: CompanyDecision[] = [...INITIAL_COMPANY_DECISIONS];
  private attentionItems: AttentionItem[] = [...INITIAL_ATTENTION_ITEMS];
  private financialModel: FinanceMetric = { ...SAMPLE_FINANCIAL_MODEL };

  public static getInstance(): CompanyStateStore {
    if (!CompanyStateStore.instance) {
      CompanyStateStore.instance = new CompanyStateStore();
    }
    return CompanyStateStore.instance;
  }

  public async getProducts(): Promise<ProductFeature[]> {
    return [...this.products];
  }

  public async getInitiatives(): Promise<CompanyInitiative[]> {
    return [...this.initiatives];
  }

  public async getCustomers(): Promise<CustomerDeal[]> {
    return [...this.customers];
  }

  public async getEmployees(): Promise<AIAgent[]> {
    return [...this.employees];
  }

  public async getDecisions(): Promise<CompanyDecision[]> {
    return [...this.decisions];
  }

  public async getAttentionItems(): Promise<AttentionItem[]> {
    return [...this.attentionItems];
  }

  public async getFinancialMetrics(): Promise<FinanceMetric> {
    return { ...this.financialModel };
  }

  public async setInitiatives(inits: CompanyInitiative[]): Promise<void> {
    this.initiatives = [...inits];
  }

  public async recordDecision(decision: CompanyDecision): Promise<void> {
    this.decisions.unshift(decision);
  }

  public async updateFinancialMetrics(metrics: Partial<FinanceMetric>): Promise<void> {
    this.financialModel = { ...this.financialModel, ...metrics };
  }

  /**
   * Deterministically queries current operational state for relevant items.
   * Attaches epistemic label: 'current_truth' and full provenance metadata.
   */
  public async queryState(params: StateQueryParams): Promise<RetrievedStateItem[]> {
    const results: RetrievedStateItem[] = [];
    const nowIso = new Date().toISOString();

    const queryText = (params.query || '').toLowerCase();
    const queryTokens = new Set([
      ...extractTokens(queryText),
      ...(params.keywords ? params.keywords.flatMap(extractTokens) : []),
      ...(params.tags ? params.tags.map((t) => t.toLowerCase()) : []),
    ]);

    const targetRole = params.role;

    // 1. Initiatives & Projects
    for (const init of this.initiatives) {
      const isRoleContributor = !targetRole || targetRole === 'orchestrator' || targetRole === 'council' || targetRole === 'advisor'
        || init.contributors.some((c) => c.agentId === targetRole);
      
      const initTokens = [
        ...extractTokens(init.title),
        ...extractTokens(init.codeName),
        ...extractTokens(init.currentObjective),
        ...extractTokens(init.latestResult),
        ...extractTokens(init.nextRecommendedAction),
      ];

      const matchedTerms = initTokens.filter((t) => queryTokens.has(t));
      const hasTermMatch = matchedTerms.length > 0;

      if (hasTermMatch || isRoleContributor) {
        const score = (hasTermMatch ? matchedTerms.length * 2 : 0) + (isRoleContributor ? 1 : 0);
        results.push({
          entityType: 'initiative',
          id: init.id,
          title: `[Initiative] ${init.title} (${init.codeName})`,
          summary: `Status: ${init.status} | Objective: ${init.currentObjective} | Latest: ${init.latestResult}`,
          data: init,
          relevanceScore: score,
          matchReason: hasTermMatch
            ? `Matched query terms: ${[...new Set(matchedTerms)].join(', ')}`
            : `Assigned initiative for ${targetRole?.toUpperCase()}`,
          provenance: {
            sourceSystem: 'company_state',
            sourceId: `state:initiative:${init.id}`,
            sourceTitle: init.title,
            epistemicType: 'current_truth',
            authority: 'Operational Initiative Register',
            timestamp: nowIso,
            confidence: 'verified_fact',
            notes: 'Current active organizational initiative',
          },
        });
      }
    }

    // 2. Financial Metrics
    const isFinancialQuery = queryText.includes('margin') ||
      queryText.includes('cost') ||
      queryText.includes('price') ||
      queryText.includes('pricing') ||
      queryText.includes('burn') ||
      queryText.includes('mrr') ||
      queryText.includes('runway') ||
      queryText.includes('token') ||
      queryText.includes('finance') ||
      queryText.includes('economic') ||
      targetRole === 'finance';

    if (isFinancialQuery) {
      const fin = this.financialModel;
      results.push({
        entityType: 'finance',
        id: 'finance-current-model',
        title: `[Financial Model] MRR $${fin.mrr.toLocaleString()} | Gross Margin ${fin.grossMargin}% | Runway ${fin.runwayMonths}mo`,
        summary: `ARR $${fin.arr.toLocaleString()}, Monthly Burn $${fin.burnRate.toLocaleString()}, Compute Spend $${fin.computeSpend.toLocaleString()}/mo, Floor Guardrail: 80% Gross Margin`,
        data: fin,
        relevanceScore: 10,
        matchReason: `Target financial queries and ${targetRole || 'executive'} domain economics`,
        provenance: {
          sourceSystem: 'company_state',
          sourceId: 'state:finance:current_metrics',
          sourceTitle: 'Live Operational Financial Ledger',
          epistemicType: 'current_truth',
          authority: 'Julian Cruz (CFO) Ledger',
          timestamp: nowIso,
          confidence: 'verified_fact',
          notes: 'Current active unit economics and capital run-rate',
        },
      });
    }

    // 3. Products & Features
    const isProductQuery = queryText.includes('product') ||
      queryText.includes('feature') ||
      queryText.includes('prd') ||
      queryText.includes('tier') ||
      queryText.includes('roadmap') ||
      queryText.includes('spec') ||
      targetRole === 'pm';

    if (isProductQuery || queryTokens.size > 0) {
      for (const feat of this.products) {
        const featTokens = [
          ...extractTokens(feat.title),
          ...extractTokens(feat.description),
          ...extractTokens(feat.category),
        ];
        const matched = featTokens.filter((t) => queryTokens.has(t));
        if (matched.length > 0 || (isProductQuery && feat.priority === 'Critical')) {
          results.push({
            entityType: 'product',
            id: feat.id,
            title: `[Product] ${feat.title} (${feat.category})`,
            summary: `Status: ${feat.status}, Priority: ${feat.priority}, Completion: ${feat.completion}%: ${feat.description}`,
            data: feat,
            relevanceScore: matched.length * 2 + (feat.priority === 'Critical' ? 2 : 0),
            matchReason: matched.length > 0 ? `Matched: ${[...new Set(matched)].join(', ')}` : 'Critical roadmap feature',
            provenance: {
              sourceSystem: 'company_state',
              sourceId: `state:product:${feat.id}`,
              sourceTitle: feat.title,
              epistemicType: 'current_truth',
              authority: 'Maya Lin (Head of Product)',
              timestamp: nowIso,
              confidence: 'verified_fact',
            },
          });
        }
      }
    }

    // 4. Customers & Enterprise Deals
    const isCustomerQuery = queryText.includes('customer') ||
      queryText.includes('client') ||
      queryText.includes('deal') ||
      queryText.includes('account') ||
      queryText.includes('enterprise') ||
      queryText.includes('pipeline') ||
      queryText.includes('sales');

    if (isCustomerQuery) {
      for (const deal of this.customers) {
        const dealTokens = [
          ...extractTokens(deal.companyName),
          ...extractTokens(deal.notes),
          ...extractTokens(deal.tier),
        ];
        const matched = dealTokens.filter((t) => queryTokens.has(t));
        if (matched.length > 0 || deal.health === 'High') {
          results.push({
            entityType: 'customer',
            id: deal.id,
            title: `[Customer Account] ${deal.companyName} (${deal.tier})`,
            summary: `Stage: ${deal.stage} | ARR: ${deal.arr} | Health: ${deal.health} | Notes: ${deal.notes}`,
            data: deal,
            relevanceScore: matched.length * 2 + 1,
            matchReason: matched.length > 0 ? `Matched terms: ${[...new Set(matched)].join(', ')}` : 'Key prospective pipeline account',
            provenance: {
              sourceSystem: 'company_state',
              sourceId: `state:customer:${deal.id}`,
              sourceTitle: deal.companyName,
              epistemicType: 'current_truth',
              authority: 'CRM Operational Ledger',
              timestamp: nowIso,
              confidence: 'verified_fact',
            },
          });
        }
      }
    }

    // 5. Governance Decisions (Current pending or active decisions)
    for (const dec of this.decisions) {
      const decTokens = [
        ...extractTokens(dec.title),
        ...extractTokens(dec.recommendation),
        ...extractTokens(dec.category),
        ...extractTokens(dec.businessImpact),
      ];
      const matched = decTokens.filter((t) => queryTokens.has(t));
      if (matched.length > 0 || dec.status === 'pending_approval') {
        results.push({
          entityType: 'decision',
          id: dec.id,
          title: `[Decision] ${dec.title} (${dec.status.toUpperCase()})`,
          summary: `Recommendation: "${dec.recommendation}" | Recommended By: ${dec.recommendedBy} | Approval Req: ${dec.founderApprovalRequired ? 'YES' : 'NO'}`,
          data: dec,
          relevanceScore: matched.length * 2 + (dec.status === 'pending_approval' ? 2 : 0),
          matchReason: matched.length > 0 ? `Matched decision terms: ${[...new Set(matched)].join(', ')}` : 'Active pending decision in queue',
          provenance: {
            sourceSystem: 'company_state',
            sourceId: `state:decision:${dec.id}`,
            sourceTitle: dec.title,
            epistemicType: 'current_truth',
            authority: 'Founder Governance Register',
            timestamp: nowIso,
            confidence: 'verified_fact',
          },
        });
      }
    }

    // Sort by relevance score descending
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const limit = params.limit || 8;
    return results.slice(0, limit);
  }
}
