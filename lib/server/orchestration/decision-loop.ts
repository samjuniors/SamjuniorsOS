import { CompanyDecision, AttentionItem, ResearchTopic, OrchestrationRun, CompanyMemory } from '@/types/os';
import { CompanyContextProvider } from '../context/company-context';
import { MultiAgentOrchestrator } from './orchestrator';
import { GovernanceStore } from '@/lib/governance-store';
import { ServerAgentExecutor } from '../agents/executor';

export async function generateRecommendationFromFinding(
  findingId: string,
  authorId: string
): Promise<{ decision: CompanyDecision; attentionItem: AttentionItem }> {
  // Look up finding
  const context = CompanyContextProvider.getCanonicalContext();
  const finding = context.recentIntelligence.find(r => r.id === findingId) 
               || GovernanceStore.getIntelligence().find(r => r.id === findingId);

  if (!finding) {
    throw new Error(`Finding with ID ${findingId} not found in Company Context.`);
  }

  // Use existing AI executor to analyze the finding and generate a structured recommendation
  const executor = new ServerAgentExecutor();
  const prompt = `
Analyze the following Research Finding and propose a clear, actionable recommendation for the Founder.
Title: ${finding.title}
Summary: ${finding.summary}
Evidence Basis: ${finding.evidence?.repositoryTarget || 'External Data'}

Output a JSON object with these keys:
- recommendation (string): The actionable proposal (e.g. "Migrate to Next.js 15")
- businessImpact (string): Why this matters to the company
- category (string): Must be one of: Strategic, Financial, Product, Governance
- whatHappened (string): Brief summary of the triggering finding
`;

  let parsed: any = {};
  if (executor.isConfigured()) {
    const aiResult = await executor.executeAgentTask(
      authorId as any,
      {
        directive: prompt,
        protocolStep: 'analyze',
        taskTitle: 'Analyze Finding & Generate Recommendation',
        taskDescription: 'Generate a recommendation based on empirical findings.',
      },
      prompt
    );
    try {
      // Find JSON block in the output
      const jsonMatch = aiResult.outputContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(aiResult.outputContent);
      }
    } catch (e) {
      // fallback
    }
  }

  const decisionId = `dec-${Date.now()}`;
  const decision: CompanyDecision = {
    id: decisionId,
    title: `Action: ${finding.title}`,
    status: 'pending_approval',
    category: parsed.category || 'Product',
    recommendedBy: authorId,
    agentId: authorId as any,
    recommendation: parsed.recommendation || `Address the findings from ${finding.title}. Specifically: ${finding.summary}`,
    businessImpact: parsed.businessImpact || 'High potential for optimization and strategic alignment.',
    evidenceSummary: `Based on repository evidence: ${finding.evidence?.repositoryTarget || 'External Data'}`,
    date: new Date().toISOString(),
    founderApprovalRequired: true
  };

  const attentionItem: AttentionItem = {
    id: `att-${Date.now()}`,
    type: 'decision_required',
    title: `Recommendation: ${finding.title}`,
    whatHappened: parsed.whatHappened || `Research completed by ${authorId} generating new empirical findings.`,
    whyItMatters: decision.businessImpact,
    recommendedAction: 'Review and approve the proposed directive.',
    status: 'pending',
    timestamp: new Date().toISOString(),
    authorAgentId: authorId as any,
    authorName: authorId,
    founderActionRequired: true,
  };

  // Persist into Governance Store
  GovernanceStore.addDecision(decision);
  GovernanceStore.addAttentionItem(attentionItem);

  return { decision, attentionItem };
}

export async function executeApprovedDecision(decisionId: string): Promise<OrchestrationRun> {
  const decision = GovernanceStore.getDecisions().find(d => d.id === decisionId);
  if (!decision) {
    throw new Error(`Decision with ID ${decisionId} not found.`);
  }

  if (decision.status !== 'approved') {
    throw new Error(`Cannot execute decision ${decisionId}: status is ${decision.status}, expected 'approved'.`);
  }

  // Construct directive based on approved decision
  const directive = `Execute approved decision [${decision.id}]: ${decision.recommendation} Evidence context: ${decision.evidenceSummary} Ensure alignment with the business impact: ${decision.businessImpact}`;

  // Enter existing orchestration path
  const orchestrator = new MultiAgentOrchestrator();
  const run = await orchestrator.orchestrateDirective({
    directive,
    executeTools: true,
  });

  // Record into company context
  CompanyContextProvider.recordOrchestration(run);

  // Phase 11.9: Create a structured Company Memory record from completed decision
  if (run.status === 'completed' || run.status === 'failed' || run.status === 'paused') {
    const memory: CompanyMemory = {
      id: `mem-${Date.now()}`,
      decisionId: decision.id,
      approvedAction: decision.recommendation,
      executionOutcome: run.status,
      evidenceReferences: [decision.evidenceSummary],
      epistemicConfidence: 'verified_fact', // We treat executed outcomes natively as verified facts
      timestamp: new Date().toISOString()
    };
    CompanyContextProvider.recordCompanyMemory(memory);
  }

  return run;
}
