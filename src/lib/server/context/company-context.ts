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
 * ASYNC and reflect CompanyBrain updates within the same call.
 */
import { CompanyBrain } from '@/lib/server/brain/company-brain';

export class CompanyContextProvider {
  /**
   * The static company charter. Constants are correct here: a constitution is
   * not operational state and only changes by explicit founder amendment.
   */
  public static getCompanyConstitution(): FullCompanyContext['constitution'] {
    return CompanyBrain.getCompanyConstitution();
  }

  /**
   * Records a new research intelligence topic into server state via Company Brain
   */
  public static async recordIntelligence(topic: ResearchTopic): Promise<void> {
    await CompanyBrain.getInstance().recordIntelligence(topic);
  }

  /**
   * Records engineering/repository reconnaissance into server state via Company Brain
   */
  public static async recordEngineeringIntelligence(intel: NonNullable<CompanyExecutiveContextSnapshot['engineeringIntelligence']>): Promise<void> {
    await CompanyBrain.getInstance().recordEngineeringIntelligence(intel);
  }

  public static async getEngineeringIntelligence(): Promise<CompanyExecutiveContextSnapshot['engineeringIntelligence'] | undefined> {
    return CompanyBrain.getInstance().getEngineeringIntelligence();
  }

  public static resetServerIntelligence(): void {
    CompanyBrain.getInstance().resetIntelligence();
  }

  /**
   * Returns the canonical company context, assembled directly from the Company Brain.
   */
  public static async getCanonicalContext(): Promise<FullCompanyContext> {
    return CompanyBrain.getInstance().getCanonicalContext();
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

    lines.push('=== COMPANY GOVERNANCE & DECISION COMMITMENTS ===');
    const activeDecs = context.decisions.filter((d) => d.status === 'approved' || d.status === 'executing');
    const pendingDecs = context.decisions.filter(
      (d) => d.status === 'pending_approval' || d.status === 'in_review' || d.status === 'proposed' || d.status === 'under_review'
    );
    const interventionDecs = context.decisions.filter((d) => d.status === 'intervention_required');
    const resolvedDecs = context.decisions.filter((d) => d.status === 'resolved');
    const supersededDecs = context.decisions.filter((d) => d.status === 'superseded');

    if (activeDecs.length > 0) {
      lines.push('Active Commitments (Binding):');
      activeDecs.forEach((dec) => {
        lines.push(`  - [${dec.id}] "${dec.title}" (${dec.category} - ${dec.status.toUpperCase()}) -> ${dec.recommendation}`);
        lines.push(`    Impact: ${dec.businessImpact} | Evidence: ${dec.evidenceSummary}`);
      });
    }

    if (pendingDecs.length > 0) {
      lines.push('Pending Governance (Awaiting Founder Ratification — NOT Operational Ground Truth):');
      pendingDecs.forEach((dec) => {
        lines.push(`  - [${dec.id}] "${dec.title}" (${dec.status.toUpperCase()}) -> ${dec.recommendation}`);
        lines.push(`    Proposed By: ${dec.recommendedBy} | Approval Required: ${dec.founderApprovalRequired ? 'YES' : 'NO'}`);
      });
    }

    if (interventionDecs.length > 0) {
      lines.push('Operational Interventions Required (EXECUTION HALTED — Immediate Founder/Operator Action Needed):');
      interventionDecs.forEach((dec) => {
        lines.push(`  - [${dec.id}] "${dec.title}" (INTERVENTION_REQUIRED) -> ${dec.recommendation}`);
        lines.push(`    Warning: Execution halted. Requires operational intervention before resuming.`);
      });
    }

    if (resolvedDecs.length > 0) {
      lines.push('Historical Precedents (Resolved Decisions — Precedent Only, NOT Active Instructions):');
      resolvedDecs.forEach((dec) => {
        lines.push(`  - [${dec.id}] "${dec.title}" (Resolved ${dec.resolvedAt || dec.date} by ${dec.resolvedBy || 'founder'}):`);
        lines.push(`    Outcome: ${dec.resolutionNote || 'Resolved'}`);
      });
    }

    if (supersededDecs.length > 0) {
      lines.push('Superseded Decisions (Deprecated Lineage — Replaced by Successor Policy):');
      supersededDecs.forEach((dec) => {
        lines.push(`  - [${dec.id}] "${dec.title}" (SUPERSEDED${dec.supersededByDecisionId ? ` by [${dec.supersededByDecisionId}]` : ''}):`);
        lines.push(`    Deprecated policy; preserved strictly for audit and lineage.`);
      });
    }
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

    // Authoritative Decision Governance Context for Employees
    if (context.decisions && context.decisions.length > 0) {
      const activeCommitments = context.decisions.filter((d) => d.status === 'approved' || d.status === 'executing');
      const pendingGovernance = context.decisions.filter(
        (d) => d.status === 'pending_approval' || d.status === 'in_review' || d.status === 'proposed' || d.status === 'under_review'
      );
      const interventionAlerts = context.decisions.filter((d) => d.status === 'intervention_required');
      const supersededDecisions = context.decisions.filter((d) => d.status === 'superseded');

      if (activeCommitments.length > 0) {
        lines.push('');
        lines.push('=== ACTIVE COMPANY COMMITMENTS & GOVERNANCE BOUNDARIES ===');
        lines.push('Binding company commitments (must NOT be contradicted without explicit supersession proposal):');
        activeCommitments.forEach((dec) => {
          lines.push(`- Decision [${dec.id}] "${dec.title}" (${dec.category} - ${dec.status.toUpperCase()}): ${dec.recommendation}`);
          if (dec.businessImpact) lines.push(`  Impact: ${dec.businessImpact}`);
        });
      }

      if (pendingGovernance.length > 0) {
        lines.push('');
        lines.push('Pending Decisions Under Review (Awaiting Founder Ratification — NOT yet approved — NOT Operational Ground Truth):');
        pendingGovernance.forEach((dec) => {
          lines.push(`- Decision [${dec.id}] "${dec.title}" (${dec.status.toUpperCase()}): ${dec.recommendation}`);
        });
      }

      if (interventionAlerts.length > 0) {
        lines.push('');
        lines.push('=== OPERATIONAL INTERVENTIONS REQUIRED (EXECUTION HALTED — IMMEDIATE ATTENTION NEEDED) ===');
        interventionAlerts.forEach((dec) => {
          lines.push(`- [HALT] Decision [${dec.id}] "${dec.title}" (INTERVENTION_REQUIRED): ${dec.recommendation}`);
          lines.push(`  Status: Execution is halted. Do NOT treat as healthy active execution.`);
        });
      }

      if (supersededDecisions.length > 0) {
        lines.push('');
        lines.push('=== SUPERSEDED DECISIONS (DEPRECATED LINEAGE — DO NOT EXECUTE) ===');
        supersededDecisions.forEach((dec) => {
          lines.push(`- [SUPERSEDED] Decision [${dec.id}] "${dec.title}" (Superseded${dec.supersededByDecisionId ? ` by [${dec.supersededByDecisionId}]` : ''})`);
        });
      }
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
