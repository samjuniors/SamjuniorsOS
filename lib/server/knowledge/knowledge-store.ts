import {
  CompanyKnowledgeItem,
  ICompanyKnowledgeStore,
  KnowledgeQueryParams,
  RetrievedKnowledgeItem,
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
 * Canonical Durable Reference Information for SamJuniors OS
 * Standard Operating Procedures (SOPs), Technical Architecture Docs, Product Specs, and Governance Policies.
 */
export const CANONICAL_COMPANY_KNOWLEDGE: CompanyKnowledgeItem[] = [
  {
    id: 'know-sop-001',
    documentId: 'SOP-001',
    title: 'SOP-001: Gross Margin Floor & Compute Cost Guardrails',
    category: 'sop',
    version: '2.1.0',
    summary: 'Mandates an absolute 80%+ gross margin floor across all customer tiers, token caching protocols, and compute spend auditing.',
    content: `### SOP-001: Gross Margin Floor & Compute Cost Guardrails
1. OBJECTIVE: Preserve financial sustainability by enforcing a strict 80% gross margin floor on all operational workloads.
2. UNIT ECONOMICS THRESHOLDS:
   - Base tenant onboarding compute burn must remain ≤ $0.25 per tenant.
   - LLM generation requests must utilize semantic prompt caching when prompt tokens exceed 1,500 tokens.
   - Any proposed feature with projected margin < 80% requires Julian Cruz (CFO) review and explicit Founder sign-off.
3. MONITORING: Real-time telemetry audits compute burn against monthly recurring revenue (MRR) targets.`,
    tags: ['Finance', 'SOP', 'Gross Margin', 'Compute', 'Pricing', 'Guardrail'],
    applicableDepartments: ['finance', 'coo', 'council', 'advisor'],
    authorAuthority: 'Marcus Sterling (CFO) & Executive Council',
    lastVerifiedDate: '2026-08-20',
    isDurableReference: true,
  },
  {
    id: 'know-sop-002',
    documentId: 'SOP-002',
    title: 'SOP-002: Zero-Trust Safe Mock Sandbox & Tool Verification',
    category: 'sop',
    version: '1.4.0',
    summary: 'Strict security protocol mandating isolated sandboxing for external mutations, live banking endpoints, and unverified credentials.',
    content: `### SOP-002: Zero-Trust Safe Mock Sandbox Protocol
1. PRINCIPLE: Autonomous agents operate with read-only observation or isolated safe-mock mutations by default.
2. PROHIBITED MUTATIONS:
   - External fund transfers, live Stripe API charges, production GitHub branch deletions, and live customer notification blasts.
3. SANDBOX AUDIT:
   - All tool invocations must pass through the Server Tool Selector and verification harness.
   - Missing credentials must return truthful unconfigured status, never fabricated responses.`,
    tags: ['Security', 'Sandbox', 'Tools', 'SOP', 'Governance'],
    applicableDepartments: ['coo', 'researcher', 'council', 'advisor'],
    authorAuthority: 'Sophia Vance (COO) & Security Council',
    lastVerifiedDate: '2026-08-15',
    isDurableReference: true,
  },
  {
    id: 'know-sop-003',
    documentId: 'SOP-003',
    title: 'SOP-003: 9-Step Multi-Agent Council Protocol',
    category: 'sop',
    version: '3.0.0',
    summary: 'Prescribes the formal 9-step workflow pipeline: Understand -> Research -> Plan -> Specify -> Model -> Debate -> Verify -> Ratify -> Report.',
    content: `### SOP-003: 9-Step Multi-Agent Council Execution
1. Understand: Sophia Vance deconstructs directive and defines boundaries.
2. Research: Dr. Aris Thorne gathers empirical market and technical evidence.
3. Plan: Sophia Vance establishes execution plan and task allocations.
4. Specify: Maya Lin architects user stories, acceptance criteria, and PRD specifications.
5. Model: Julian Cruz computes unit economics, CAC/LTV, and margin impact.
6. Debate: Cross-specialist critique challenging assumptions and dependencies.
7. Verify: Multi-agent verification checking compliance and safety.
8. Ratify: Founder approval gate for all high-impact actions.
9. Report: Executive synthesis deliverable with explicit next actions.`,
    tags: ['Operations', 'Protocol', 'Council', 'SOP', 'Workflow'],
    applicableDepartments: ['coo', 'pm', 'researcher', 'finance', 'council', 'advisor'],
    authorAuthority: 'Executive Council Charter',
    lastVerifiedDate: '2026-08-28',
    isDurableReference: true,
  },
  {
    id: 'know-tech-001',
    documentId: 'TECH-001',
    title: 'TECH-001: SamJuniors OS Microkernel & Next.js App Router Architecture',
    category: 'technical_architecture',
    version: '4.2.0',
    summary: 'Technical specification for the deterministic server microkernel, App Router layout, window manager, and server-side AI execution.',
    content: `### TECH-001: SamJuniors OS Architecture Specification
1. FOUNDATION: Next.js 15+ App Router with React 19 Server/Client component boundary.
2. SERVER-SIDE SECRET ISOLATION:
   - GEMINI_API_KEY resides strictly on the server and is never prefixed with NEXT_PUBLIC_.
   - All AI execution runs via Next.js API routes or Server Actions.
3. REVERSE PROXY & PORT MAPPING: Exclusively bound to external Port 3000 behind container proxy.
4. WINDOW MANAGER: Desktop UI with multi-window tiling, z-index layering, and OS dock state persistence.`,
    tags: ['Architecture', 'Technical', 'Next.js', 'React', 'Microkernel', 'Engineering'],
    applicableDepartments: ['researcher', 'pm', 'coo', 'council', 'advisor'],
    authorAuthority: 'Dr. Aris Thorne & Lead Architect',
    lastVerifiedDate: '2026-09-01',
    isDurableReference: true,
  },
  {
    id: 'know-prd-001',
    documentId: 'PRD-001',
    title: 'PRD-001: Autonomous Founder Executive Co-Pilot Specification',
    category: 'product_spec',
    version: '2.0.0',
    summary: 'Product requirements for the Founder Intelligence Advisor, epistemic breakdown (Facts, Inferences, Recommendations, Unknowns), and anti-hallucination standards.',
    content: `### PRD-001: Founder Executive Co-Pilot Specification
1. OBJECTIVE: Provide real-time strategic advisory intelligence without displacing the Founder as the sovereign decision-maker.
2. EPISTEMIC KNOWLEDGE MODEL:
   - Facts: Grounded directly in company state, documents, and verified evidence.
   - Inferences: Logical deductions derived from facts.
   - Recommendations: Strategic advice requiring explicit Founder evaluation.
   - Unknowns: Transparently acknowledged gaps in available data.
3. ADVISORY BOUNDARY: The Advisor is purely consultative and cannot execute code, mutate data, or auto-approve decisions.`,
    tags: ['Product', 'PRD', 'Advisor', 'Epistemic', 'Specification'],
    applicableDepartments: ['pm', 'coo', 'council', 'advisor'],
    authorAuthority: 'Maya Lin (Head of Product)',
    lastVerifiedDate: '2026-08-25',
    isDurableReference: true,
  },
  {
    id: 'know-pol-001',
    documentId: 'POL-001',
    title: 'POL-001: Epistemic Grounding & Anti-Hallucination Policy',
    category: 'policy',
    version: '1.2.0',
    summary: 'Binding governance policy prohibiting fabricated metrics, imaginary customers, simulated credentials, or ungrounded claims.',
    content: `### POL-001: Epistemic Grounding Policy
1. ZERO-FABRICATION MANDATE: No AI employee may generate imaginary revenue figures, fictitious customer conversations, or mock compliance certificates.
2. CONFLICT RESOLUTION RULE:
   - Current verified empirical evidence takes absolute precedence over historical precedent and durable documentation.
   - When conflicts occur, the conflict must be surfaced explicitly to the Founder.
3. TRUTHFUL CREDENTIAL REPORTING: If an API key or integration is unconfigured, the system must report this truthfully.`,
    tags: ['Policy', 'Governance', 'Truthfulness', 'Anti-Hallucination', 'Ethics'],
    applicableDepartments: ['coo', 'researcher', 'pm', 'finance', 'council', 'advisor'],
    authorAuthority: 'Founder Sovereignty Charter',
    lastVerifiedDate: '2026-08-10',
    isDurableReference: true,
  },
  {
    id: 'know-pol-002',
    documentId: 'POL-002',
    title: 'POL-002: Founder Sovereign Prerogative & Governance Ratification',
    category: 'policy',
    version: '1.0.0',
    summary: 'Mandates that no AI agent, memory precedent, or council decision can become binding company policy without explicit Founder approval.',
    content: `### POL-002: Founder Sovereign Prerogative
1. NON-DELEGABLE FOUNDER POWERS:
   - Ratification of capital investments, pricing tier changes, and strategic partnerships.
   - Overriding or rejecting any specialist council recommendation.
2. STATUS CONSTRAINTS: All agent-generated proposals remain in 'pending_approval' status until ratified.`,
    tags: ['Policy', 'Governance', 'Founder Prerogative', 'Ratification'],
    applicableDepartments: ['coo', 'council', 'advisor'],
    authorAuthority: 'Founder Sovereign Mandate',
    lastVerifiedDate: '2026-08-01',
    isDurableReference: true,
  },
  {
    id: 'know-res-001',
    documentId: 'RES-001',
    title: 'RES-001: Deterministic Multi-Agent Verification Benchmark',
    category: 'research_reference',
    version: '1.0.0',
    summary: 'Research brief verifying that multi-agent adversarial debate reduces ungrounded hallucination from 18% to 1.4% in enterprise workflows.',
    content: `### RES-001: Multi-Agent Verification Benchmark
1. METHODOLOGY: Evaluated 250 enterprise directives across single-agent prompt workflows versus structured 4-specialist council debate.
2. EMPIRICAL FINDINGS:
   - Hallucination rate dropped from 18.2% to 1.4%.
   - Assumption detection increased from 34% to 91%.
   - Token efficiency was preserved via semantic prompt de-duplication.`,
    tags: ['Research', 'Benchmark', 'Multi-Agent', 'Safety', 'Dr. Thorne'],
    applicableDepartments: ['researcher', 'council', 'advisor'],
    authorAuthority: 'Dr. Aris Thorne (Lead Researcher)',
    lastVerifiedDate: '2026-09-02',
    isDurableReference: true,
  },
];

/**
 * Server-Side Single Source of Truth for COMPANY KNOWLEDGE (Durable Reference Information)
 * 
 * Implements ICompanyKnowledgeStore.
 * Designed so that PostgreSQL / Supabase can replace this implementation directly
 * without altering retrieval or business logic.
 */
export class CompanyKnowledgeStore implements ICompanyKnowledgeStore {
  private static instance: CompanyKnowledgeStore | null = null;

  private knowledgeItems: CompanyKnowledgeItem[] = [...CANONICAL_COMPANY_KNOWLEDGE];

  public static getInstance(): CompanyKnowledgeStore {
    if (!CompanyKnowledgeStore.instance) {
      CompanyKnowledgeStore.instance = new CompanyKnowledgeStore();
    }
    return CompanyKnowledgeStore.instance;
  }

  public async getAllKnowledge(): Promise<CompanyKnowledgeItem[]> {
    return [...this.knowledgeItems];
  }

  public async getKnowledgeById(id: string): Promise<CompanyKnowledgeItem | null> {
    const item = this.knowledgeItems.find((k) => k.id === id || k.documentId === id);
    return item ? { ...item } : null;
  }

  public async addKnowledge(item: CompanyKnowledgeItem): Promise<void> {
    this.knowledgeItems.unshift(item);
  }

  public async setKnowledge(items: CompanyKnowledgeItem[]): Promise<void> {
    this.knowledgeItems = [...items];
  }

  /**
   * Deterministically queries durable reference information.
   * Attaches epistemic label: 'durable_reference' and provenance metadata.
   */
  public async queryKnowledge(params: KnowledgeQueryParams): Promise<RetrievedKnowledgeItem[]> {
    const queryText = (params.queryText || '').toLowerCase();
    const queryTokens = new Set([
      ...extractTokens(queryText),
      ...(params.keywords ? params.keywords.flatMap(extractTokens) : []),
      ...(params.tags ? params.tags.map((t) => t.toLowerCase()) : []),
    ]);

    const targetRole = params.role;
    const nowIso = new Date().toISOString();
    const results: RetrievedKnowledgeItem[] = [];

    for (const item of this.knowledgeItems) {
      // Role match check
      const isRoleApplicable = !targetRole || targetRole === 'orchestrator' || targetRole === 'council' || targetRole === 'advisor'
        || item.applicableDepartments.includes(targetRole)
        || item.applicableDepartments.includes('council');

      const itemTokens = [
        ...extractTokens(item.title),
        ...extractTokens(item.summary),
        ...extractTokens(item.content),
        ...item.tags.flatMap(extractTokens),
        item.documentId.toLowerCase(),
      ];

      const matchedTerms = itemTokens.filter((t) => queryTokens.has(t));
      const hasTermMatch = matchedTerms.length > 0;

      // Check category match if provided
      const categoryMatch = params.category && item.category.toLowerCase().includes(params.category.toLowerCase());

      if (hasTermMatch || categoryMatch) {
        const relevanceScore = (hasTermMatch ? matchedTerms.length * 2 : 0)
          + (categoryMatch ? 3 : 0)
          + (isRoleApplicable ? 1 : 0);

        results.push({
          knowledgeId: item.id,
          documentId: item.documentId,
          title: item.title,
          category: item.category,
          version: item.version,
          summary: item.summary,
          contentSnippet: item.summary,
          fullContent: item.content,
          applicableDepartments: item.applicableDepartments,
          relevanceScore,
          matchReason: matchedTerms.length > 0
            ? `Matched knowledge terms: ${[...new Set(matchedTerms)].join(', ')}`
            : `Category match (${item.category})`,
          provenance: {
            sourceSystem: 'company_knowledge',
            sourceId: `knowledge:${item.documentId}`,
            sourceTitle: item.title,
            epistemicType: 'durable_reference',
            authority: item.authorAuthority,
            timestamp: item.lastVerifiedDate || nowIso,
            confidence: 'reference_standard',
            notes: `Durable company reference documentation (v${item.version})`,
          },
        });
      }
    }

    // Sort by relevance score descending
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const limit = params.limit || 5;
    return results.slice(0, limit);
  }
}
