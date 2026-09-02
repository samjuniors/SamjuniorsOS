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
} from '@/types/os';
import {
  INITIAL_AGENTS,
  INITIAL_INITIATIVES,
  INITIAL_COMPANY_DECISIONS,
  INITIAL_ATTENTION_ITEMS,
  INITIAL_RESEARCH,
  SAMPLE_FINANCIAL_MODEL,
  INITIAL_ORCHESTRATION,
} from '@/lib/os-data';

export interface FullCompanyContext extends CompanyExecutiveContextSnapshot {
  constitution: {
    name: string;
    mission: string;
    operatingPrinciples: string[];
    safeguards: string[];
  };
}

/**
 * Server-Side Single Source of Truth for Company Context
 */
export class CompanyContextProvider {
  /**
   * Returns the canonical company context initialized on the server
   */
  public static getCanonicalContext(): FullCompanyContext {
    return {
      constitution: {
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
      },
      initiatives: INITIAL_INITIATIVES,
      decisions: INITIAL_COMPANY_DECISIONS,
      attentionItems: INITIAL_ATTENTION_ITEMS,
      agents: INITIAL_AGENTS,
      recentIntelligence: INITIAL_RESEARCH,
      financialModel: SAMPLE_FINANCIAL_MODEL,
      orchestrationHistory: [INITIAL_ORCHESTRATION],
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Merges server canonical context with any runtime client-side snapshot
   */
  public static getMergedContext(clientSnapshot?: Partial<CompanyExecutiveContextSnapshot>): FullCompanyContext {
    const canonical = this.getCanonicalContext();
    if (!clientSnapshot) {
      return canonical;
    }

    return {
      ...canonical,
      initiatives: clientSnapshot.initiatives && clientSnapshot.initiatives.length > 0 ? clientSnapshot.initiatives : canonical.initiatives,
      decisions: clientSnapshot.decisions && clientSnapshot.decisions.length > 0 ? clientSnapshot.decisions : canonical.decisions,
      attentionItems: clientSnapshot.attentionItems && clientSnapshot.attentionItems.length > 0 ? clientSnapshot.attentionItems : canonical.attentionItems,
      agents: clientSnapshot.agents && clientSnapshot.agents.length > 0 ? clientSnapshot.agents : canonical.agents,
      recentIntelligence: clientSnapshot.recentIntelligence && clientSnapshot.recentIntelligence.length > 0 ? clientSnapshot.recentIntelligence : canonical.recentIntelligence,
      financialModel: clientSnapshot.financialModel ? clientSnapshot.financialModel : canonical.financialModel,
      orchestrationHistory: clientSnapshot.orchestrationHistory && clientSnapshot.orchestrationHistory.length > 0 ? clientSnapshot.orchestrationHistory : canonical.orchestrationHistory,
      lastUpdated: clientSnapshot.lastUpdated || canonical.lastUpdated,
    };
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

    lines.push('=== RECENT COUNCIL ORCHESTRATIONS & DELIVERABLES ===');
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

    return lines.join('\n');
  }
}
