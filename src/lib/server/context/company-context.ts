import {
  AIAgent,
  AttentionItem,
  CompanyDecision,
  CompanyInitiative,
  FinanceMetric,
  OrchestrationRun,
  ResearchTopic,
  CompanyExecutiveContextSnapshot,
  AgentRole,
  AdvisorTargetContext,
  CompanyMemory,
} from '@/types/os';
import {
  INITIAL_RESEARCH,
} from '@/lib/os-data';
import { CompanyStateStore } from '@/lib/server/state/state-store';
import { CompanyMemoryStore } from '@/lib/server/memory/memory-store';
import { AgentRunStore, AgentRunRecord } from '@/lib/server/agents/run-store';

export interface FullCompanyContext extends CompanyExecutiveContextSnapshot {
  constitution: {
    name: string;
    mission: string;
    operatingPrinciples: string[];
    safeguards: string[];
  };
}

/**
 * ============================================================================
 * COMPANY CONTEXT PROVIDER — M1: PURE AUTHORITY-LABELLED FORMATTER / ASSEMBLER
 * ============================================================================
 *
 * AUTHORITY MODEL (per docs/architecture/MEMORY_RECONCILIATION_REPORT.md, M1):
 * - OPERATIONAL STATE (initiatives, decisions, attention items, agents,
 *   financial model) is owned by CompanyStateStore. This provider NO LONGER
 *   reads operational state from os-data code constants; it assembles it
 *   from the canonical store (which itself seeds from those constants but
 *   honors durable storage + authoritative Prisma reads).
 * - HISTORICAL PRECEDENT (company memory) is owned by CompanyMemoryStore.
 *   The former parallel module array `serverCompanyMemory` (zero callers)
 *   has been deleted.
 * - WORKSTREAM RUNS are owned by AgentRunStore. The former parallel module
 *   array `serverOrchestrationHistory` (zero callers, seeded with demo data)
 *   has been deleted; the advisory projection is adapted from real
 *   AgentRunRecords.
 * - RESEARCH INTELLIGENCE (research radar + engineering recon) remains in
 *   this module: it is not operational state, has live recorders (github
 *   tool provider), and has no other canonical home yet.
 * - The CONSTITUTION is a static charter, not operational state.
 *
 * Consequence: `getCanonicalContext()` / `getMergedContext()` are now
 * ASYNC and reflect CompanyStateStore / CompanyMemoryStore / AgentRunStore
 * updates within the same call.
 */
let serverRecentIntelligence: ResearchTopic[] = [...INITIAL_RESEARCH];
let serverEngineeringIntelligence: CompanyExecutiveContextSnapshot['engineeringIntelligence'] | undefined = undefined;

export class CompanyContextProvider {
  /**
   * The static company charter. Constants are correct here: a constitution is
   * not operational state and only changes by explicit founder amendment.
   */
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

  /**
   * Records a new research intelligence topic into server state
   */
  public static recordIntelligence(topic: ResearchTopic): void {
    // Deduplicate by ID or title
    serverRecentIntelligence = [
      topic,
      ...serverRecentIntelligence.filter(t => t.id !== topic.id && t.title !== topic.title)
    ].slice(0, 15);
  }

  /**
   * Records engineering/repository reconnaissance into server state
   */
  public static recordEngineeringIntelligence(intel: NonNullable<CompanyExecutiveContextSnapshot['engineeringIntelligence']>): void {
    serverEngineeringIntelligence = intel;
  }

  public static getEngineeringIntelligence(): CompanyExecutiveContextSnapshot['engineeringIntelligence'] | undefined {
    return serverEngineeringIntelligence;
  }

  public static resetServerIntelligence(): void {
    serverRecentIntelligence = [...INITIAL_RESEARCH];
    serverEngineeringIntelligence = undefined;
  }

  /**
   * Adapts a canonical AgentRunRecord into the OrchestrationRun display shape
   * used by the advisory prompt projection. Only REAL, persisted runs are
   * shown; the demo-seeded orchestration constant was removed with the dead
   * serverOrchestrationHistory module array (M1).
   */
  private static adaptRunToOrchestrationDisplay(r: AgentRunRecord): OrchestrationRun {
    return {
      id: r.runId,
      directive: r.directive,
      timestamp: r.timestamp,
      status: r.status === 'running' ? 'running' : r.status === 'halted' ? 'paused' : r.status === 'failed' ? 'failed' : 'completed',
      liveAi: true,
      title: r.taskTitle,
      summary: (r.outputContent || '').slice(0, 400),
      plan: [],
      messages: [],
      deliverables: [],
    };
  }

  /**
   * Returns the canonical company context, assembled from the canonical
   * owners of each authority domain (M1):
   *   - operational state   → CompanyStateStore
   *   - historical memory   → CompanyMemoryStore
   *   - workstream runs     → AgentRunStore
   *   - research intel      → this module (recorders above)
   *   - constitution        → static charter
   */
  public static async getCanonicalContext(): Promise<FullCompanyContext> {
    const stateStore = CompanyStateStore.getInstance();

    const [
      initiatives,
      decisions,
      attentionItems,
      agents,
      financialModel,
      companyMemory,
      recentRuns,
    ] = await Promise.all([
      stateStore.getInitiatives(),
      stateStore.getDecisions(),
      stateStore.getAttentionItems(),
      stateStore.getEmployees(),
      stateStore.getFinancialMetrics(),
      CompanyMemoryStore.getInstance().getAllMemories(),
      AgentRunStore.getInstance().listRuns({ limit: 5 }),
    ]);

    return {
      constitution: this.getCompanyConstitution(),
      initiatives,
      decisions,
      attentionItems,
      agents,
      recentIntelligence: [...serverRecentIntelligence],
      financialModel,
      orchestrationHistory: recentRuns.map((r) => this.adaptRunToOrchestrationDisplay(r)),
      companyMemory,
      engineeringIntelligence: serverEngineeringIntelligence,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Returns server-side canonical context.
   * SECURITY ENFORCEMENT (Audit 07/11): Client-side snapshot merging is permanently eliminated.
   * The server database is the exclusive authority for company state.
   */
  public static async getMergedContext(_deprecatedClientSnapshot?: Partial<CompanyExecutiveContextSnapshot>): Promise<FullCompanyContext> {
    return this.getCanonicalContext();
  }

  /**
   * Formats a focused contextual attachment from Company HQ for the Founder Advisor
   */
  public static formatTargetContext(target: AdvisorTargetContext): string {
    const lines: string[] = [];
    lines.push('=== FOCUSED CONTEXTUAL ATTACHMENT (Directly from Company HQ) ===');
    lines.push(`Company HQ Section: ${target.section}`);
    lines.push(`Target Subject / Item: ${target.title}`);
    if (target.sourceEntityName) {
      lines.push(`Source Specialist / Author: ${target.sourceEntityName}`);
    }
    if (target.category) {
      lines.push(`Category: ${target.category}`);
    }
    if (target.recommendation) {
      lines.push(`Proposed Recommendation: "${target.recommendation}"`);
    }
    if (target.whyItMatters) {
      lines.push(`Strategic Impact / Context: "${target.whyItMatters}"`);
    }
    if (target.risk) {
      lines.push(`Flagged Risks / Nuances: "${target.risk}"`);
    }
    if (target.resultSnippet) {
      lines.push(`Execution / Deliverable Finding: "${target.resultSnippet}"`);
    }
    if (target.evidenceBasis) {
      lines.push(`Evidence Basis: ${target.evidenceBasis}`);
    }
    lines.push('===============================================================');
    return lines.join('\n');
  }

  /**
   * Formats structured company context into a dense, unambiguous text prompt for the Founder Advisor
   */
  public static formatForAdvisorPrompt(
    context: FullCompanyContext,
    targetContext?: AdvisorTargetContext
  ): string {
    const lines: string[] = [];

    if (targetContext) {
      lines.push(this.formatTargetContext(targetContext));
      lines.push('');
    }

    lines.push('=== COMPANY OVERVIEW & CONSTITUTION ===');
    lines.push(`Company Name: ${context.constitution.name}`);
    lines.push(`Mission: ${context.constitution.mission}`);
    lines.push('Core Operating Principles:');
    context.constitution.operatingPrinciples.forEach((p) => lines.push(`  - ${p}`));
    lines.push('Core Safeguards:');
    context.constitution.safeguards.forEach((s) => lines.push(`  - ${s}`));
    lines.push('');

    lines.push('=== EXECUTIVE AI WORKFORCE ===');
    context.agents.forEach((agent) => {
      lines.push(`- ${agent.name} (${agent.role}) | Status: ${agent.status} | Dept: ${agent.department}`);
      if (agent.skills && agent.skills.length > 0) {
        lines.push(`  Skills: ${agent.skills.join(', ')}`);
      }
      lines.push(`  Current Task: ${agent.currentTask || 'Available for council directives'}`);
      if (agent.permissions && agent.permissions.length > 0) {
        lines.push(`  Permissions: ${agent.permissions.map((p) => p.name).join(', ')}`);
      }
    });
    lines.push('');

    lines.push('=== STRATEGIC INITIATIVES & OKRS ===');
    context.initiatives.forEach((init) => {
      const contributorNames = init.contributors.map((c) => c.name).join(', ');
      lines.push(`[${init.id}] "${init.title}" | Status: ${init.status} | Contributors: ${contributorNames}`);
      lines.push(`  Objective: ${init.currentObjective}`);
      lines.push(`  Latest Result: ${init.latestResult}`);
      lines.push(`  Next Recommended Action: ${init.nextRecommendedAction}`);
      if (init.risks && init.risks.length > 0) {
        lines.push(`  Key Risks: ${init.risks.join('; ')}`);
      }
    });
    lines.push('');

    lines.push('=== COMPANY GOVERNANCE & PENDING DECISIONS ===');
    context.decisions.forEach((dec) => {
      lines.push(`[${dec.id}] "${dec.title}" | Status: ${dec.status.toUpperCase()} | Category: ${dec.category}`);
      lines.push(`  Recommended By: ${dec.recommendedBy}`);
      lines.push(`  Recommendation: ${dec.recommendation}`);
      lines.push(`  Business Impact: ${dec.businessImpact}`);
      lines.push(`  Evidence Basis: ${dec.evidenceSummary}`);
      lines.push(`  Founder Ratification Required: ${dec.founderApprovalRequired ? 'YES' : 'NO'}`);
    });
    lines.push('');

    lines.push('=== PRIORITY ATTENTION & GOVERNANCE QUEUE ===');
    context.attentionItems.forEach((att) => {
      lines.push(`[${att.id}] ${att.type.toUpperCase()}: "${att.title}" | Status: ${att.status}`);
      lines.push(`  What Happened: ${att.whatHappened}`);
      lines.push(`  Why It Matters: ${att.whyItMatters}`);
      lines.push(`  Recommended Action: ${att.recommendedAction}`);
    });
    lines.push('');

    lines.push('=== FINANCIAL MODEL & UNIT ECONOMICS (SANDBOX SIMULATION) ===');
    const fin = context.financialModel;
    lines.push(`MRR: $${fin.mrr.toLocaleString()} | ARR Run Rate: $${fin.arr.toLocaleString()}`);
    lines.push(`Gross Margin: ${fin.grossMargin}% (Floor Guardrail: 80%) | Burn Rate: $${fin.burnRate.toLocaleString()}/mo | Runway: ${fin.runwayMonths} months`);
    lines.push(`Compute Spend: $${fin.computeSpend.toLocaleString()} | Token Usage: ${fin.tokenUsageMillions}M tokens`);
    lines.push('');

    lines.push('=== MARKET & TECHNICAL RESEARCH RADAR ===');
    context.recentIntelligence.forEach((res) => {
      lines.push(`- "${res.title}" (${res.category}) | Confidence: ${res.confidence}% | Impact: ${res.impact} | Author: ${res.author}`);
      lines.push(`  Key Finding: ${res.summary}`);
    });
    lines.push('');

    if (context.engineeringIntelligence) {
      const eng = context.engineeringIntelligence;
      lines.push('=== ENGINEERING & REPOSITORY INTELLIGENCE (GROUNDED EVIDENCE) ===');
      lines.push(`Target Repository: ${eng.repositoryTarget}`);
      lines.push(`Reconnaissance Timestamp: ${eng.lastReconTimestamp}`);
      lines.push(`Status: ${eng.status}`);
      lines.push(`Summary: ${eng.findingsSummary}`);

      const claims = eng.evidence?.claims || [];
      const facts = claims.filter((c: any) => c.verificationState === 'claim_supported').map((c: any) => c.statement);
      const inferences = claims.filter((c: any) => c.verificationState === 'unverified').map((c: any) => c.statement);
      const uncertainties = eng.evidence?.limitations || eng.evidence?.uncertainties || [];

      if (facts.length > 0) {
        lines.push('Empirical Grounded Facts:');
        facts.forEach((f: string) => lines.push(`  - ${f}`));
      }
      if (inferences.length > 0) {
        lines.push('Specialist Inferences:');
        inferences.forEach((inf: string) => lines.push(`  - ${inf}`));
      }
      if (uncertainties.length > 0) {
        lines.push('Known Uncertainties & Bounds:');
        uncertainties.forEach((unc: string) => lines.push(`  - ${unc}`));
      }
      lines.push('');
    }

    lines.push('=== RECENT COUNCIL ORCHESTRATIONS & DELIVERABLES ===');
    if (context.orchestrationHistory && context.orchestrationHistory.length > 0) {
      context.orchestrationHistory.forEach((run) => {
        lines.push(`Run [${run.id}] Directive: "${run.directive}" | Status: ${run.status}`);
        if (run.summary) {
          lines.push(`  Council Recommendation: ${run.summary}`);
        }
        if (run.executiveResult) {
          lines.push(`  Key Findings: ${run.executiveResult.keyFindings.join('; ')}`);
          lines.push(`  Business Implications: ${run.executiveResult.businessImplications.join('; ')}`);
          lines.push(`  Risks: ${run.executiveResult.risks.join('; ')}`);
        }
        lines.push(`  Deliverables Count: ${run.deliverables.length}`);
      });
    } else {
      lines.push('No council orchestration runs recorded yet.');
    }
    lines.push('');

    lines.push('=== DURABLE ORGANIZATIONAL MEMORY & HISTORICAL CONTEXT ===');
    lines.push('OPERATIONAL LEARNING & GROUNDING RULES:');
    lines.push('1. The following memory records represent completed past organizational actions and historical outcomes.');
    lines.push('2. Historical memory must NEVER be presented as new or current empirical evidence.');
    lines.push('3. If historical memory contradicts current verified evidence, current verified evidence takes absolute precedence.');
    lines.push('4. Historical memory cannot automatically approve, execute, change permissions, or become policy without explicit Founder ratification.');
    if (context.companyMemory && context.companyMemory.length > 0) {
      context.companyMemory.forEach((mem) => {
        lines.push(`[${mem.id}] Decision: ${mem.decisionId} | Timestamp: ${mem.timestamp}`);
        lines.push(`  Past Approved Action: ${mem.approvedAction}`);
        lines.push(`  Execution Outcome: ${mem.executionOutcome}`);
        lines.push(`  Epistemic Confidence: ${mem.epistemicConfidence}`);
        if (mem.evidenceReferences && mem.evidenceReferences.length > 0) {
          lines.push(`  Evidence References: ${mem.evidenceReferences.join('; ')}`);
        }
      });
    } else {
      lines.push('No memory records established yet.');
    }

    return lines.join('\n');
  }

  /**
   * Generates strictly scoped, role-appropriate domain context for direct employee conversation
   * Enforces least-privilege context isolation across COO, Research, Product, Finance, and Advisor.
   */
  public static formatForEmployeeRoleContext(
    role: AgentRole | 'advisor',
    context: FullCompanyContext
  ): string {
    const lines: string[] = [];

    if (role === 'advisor') {
      return this.formatForAdvisorPrompt(context);
    }

    if (role === 'coo') {
      // Sophia Vance: Operations, coordination, initiatives, governance decisions, attention queue
      lines.push('=== EXECUTIVE OPERATIONS CONTEXT (SOPHIA VANCE • COO) ===');
      lines.push(`Company: ${context.constitution.name}`);
      lines.push(`Mission: ${context.constitution.mission}`);
      lines.push('Active Initiatives:');
      context.initiatives.forEach((init) => {
        lines.push(`  - [${init.codeName}] "${init.title}" (${init.status}): ${init.currentObjective}`);
        lines.push(`    Latest Result: ${init.latestResult}`);
      });
      lines.push('Pending Governance Approvals & Attention:');
      context.attentionItems.forEach((att) => {
        lines.push(`  - [${att.type}] "${att.title}" (Status: ${att.status}) -> ${att.recommendedAction}`);
      });
      lines.push('Active Agent Roster:');
      context.agents.forEach((ag) => {
        lines.push(`  - ${ag.name} (${ag.role}) | Status: ${ag.status} | Current: ${ag.currentTask || 'Idle'}`);
      });
      lines.push('Operating Guardrails: Safe mock operations only; no unauthorized external mutations.');
    } else if (role === 'researcher') {
      // Dr. Aris Thorne: Market research, intelligence, competitive landscape, tech benchmarks
      lines.push('=== MARKET & TECHNICAL RESEARCH CONTEXT (DR. ARIS THORNE • RESEARCH) ===');
      lines.push('Market Intelligence & Tech Radars:');
      context.recentIntelligence.forEach((res) => {
        lines.push(`  - [${res.category.toUpperCase()}] "${res.title}" (Confidence: ${res.confidence}%): ${res.summary}`);
      });
      lines.push('Active Research Tracks:');
      context.initiatives
        .filter((init) => init.contributors.some((c) => c.agentId === 'researcher'))
        .forEach((init) => {
          lines.push(`  - "${init.title}": ${init.currentObjective}`);
        });
      if (context.engineeringIntelligence) {
        lines.push('Active Engineering & Repository Intelligence:');
        lines.push(`  - Target: ${context.engineeringIntelligence.repositoryTarget} | Status: ${context.engineeringIntelligence.status}`);
        lines.push(`  - Findings: ${context.engineeringIntelligence.findingsSummary}`);
      }
      lines.push('Scope Guardrails: No access to internal financial ledgers or unredacted system keys; empirical analysis only.');
    } else if (role === 'pm') {
      // Maya Lin: Product specifications, PRDs, UX workflows, feature backlogs, acceptance criteria
      lines.push('=== PRODUCT ARCHITECTURE & PRD CONTEXT (MAYA LIN • PM) ===');
      lines.push('Active Product Roadmaps & Initiatives:');
      context.initiatives
        .filter((init) => init.contributors.some((c) => c.agentId === 'pm'))
        .forEach((init) => {
          lines.push(`  - [${init.codeName}] "${init.title}" (${init.status}): ${init.currentObjective}`);
          if (init.deliverableIds && init.deliverableIds.length > 0) {
            lines.push(`    Deliverables: ${init.deliverableIds.join(', ')}`);
          }
        });
      lines.push('Product Specs & Specifications:');
      context.attentionItems
        .filter((att) => att.type === 'product_decision' || att.authorAgentId === 'pm')
        .forEach((att) => {
          lines.push(`  - "${att.title}": ${att.whatHappened} -> Recommended: ${att.recommendedAction}`);
        });
      lines.push('Scope Guardrails: Product design and specification modeling only; no direct server deployment or live mutations.');
    } else if (role === 'finance') {
      // Julian Cruz: Financial modeling, unit economics, compute burn, pricing tiers, gross margin
      lines.push('=== FINANCIAL ANALYSIS & UNIT ECONOMICS CONTEXT (JULIAN CRUZ • FINANCE) ===');
      const fin = context.financialModel;
      lines.push(`MRR: $${fin.mrr.toLocaleString()} | Gross Margin: ${fin.grossMargin}% (Target Floor: 80%)`);
      lines.push(`Monthly Burn Rate: $${fin.burnRate.toLocaleString()} | Runway: ${fin.runwayMonths} months`);
      lines.push(`Compute Expenditure: $${fin.computeSpend.toLocaleString()} | Token Volume: ${fin.tokenUsageMillions}M tokens`);
      lines.push('Financial Initiatives & Margin Safeguards:');
      context.initiatives
        .filter((init) => init.contributors.some((c) => c.agentId === 'finance'))
        .forEach((init) => {
          lines.push(`  - "${init.title}" (${init.status}): ${init.currentObjective}`);
          lines.push(`    Result: ${init.latestResult}`);
        });
      lines.push('Scope Guardrails: Computational financial modeling & simulation only; live banking transfers and payment mutations disabled.');
    } else {
      return '';
    }

    lines.push('');
    lines.push('=== COMPANY MEMORY & OPERATIONAL LEARNING (HISTORICAL CONTEXT ONLY) ===');
    lines.push('GOVERNANCE & GROUNDING BOUNDARIES FOR EMPLOYEES:');
    lines.push('- Historical memories provide organizational context and consistency; NEVER treat them as current empirical evidence.');
    lines.push('- If historical memory conflicts with current verified evidence, current verified evidence takes absolute precedence.');
    lines.push('- Historical memory cannot automatically approve initiatives, bypass permissions, execute tasks, or become binding policy without Founder approval.');
    if (context.companyMemory && context.companyMemory.length > 0) {
      context.companyMemory.forEach((mem) => {
        lines.push(`[${mem.id}] Past Action: ${mem.approvedAction}`);
        lines.push(`  Execution Outcome: ${mem.executionOutcome}`);
        lines.push(`  Epistemic Confidence: ${mem.epistemicConfidence}`);
      });
    } else {
      lines.push('No memories established yet.');
    }

    return lines.join('\n');
  }
}
