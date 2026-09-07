import { GoogleGenAI } from '@google/genai';
import {
  AdvisorStrategicInsight,
  AgentRole,
  AdvisorTargetContext,
  EpistemicKnowledgeBreakdown,
  FounderAdvisorResponse,
} from '@/types/os';
import { CompanyContextProvider, FullCompanyContext } from '@/lib/server/context/company-context';
import { ContextualRetrievalService } from '@/lib/server/context/context-retrieval';
import { TaskRetrievedContextBundle } from '@/types/context';

export interface AdvisorQueryOptions {
  history?: Array<{ sender: 'founder' | 'advisor'; text: string }>;
  clientContextSnapshot?: any;
  contextAttachment?: AdvisorTargetContext;
}

export class FounderAdvisorService {
  private aiClient: GoogleGenAI | null = null;
  private isKeyAvailable: boolean = false;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      this.isKeyAvailable = true;
    }
  }

  public isConfigured(): boolean {
    return this.isKeyAvailable && this.aiClient !== null;
  }

  /**
   * Main query entry point for the Founder Intelligence Advisor
   */
  public async query(
    question: string,
    options: AdvisorQueryOptions = {}
  ): Promise<FounderAdvisorResponse> {
    const timestamp = new Date().toISOString();
    const cleanQuestion = question?.trim() || '';

    if (!cleanQuestion) {
      return {
        success: false,
        question: '',
        summary: 'No question was provided.',
        analysisMarkdown: 'Please submit a specific question or strategic topic for Founder Intelligence to analyze.',
        epistemicBreakdown: {
          facts: [],
          inferences: [],
          recommendations: [],
          unknowns: ['Question was empty.'],
        },
        strategicInsights: [],
        suggestedFollowUpPrompts: [
          'What is the current status of our strategic initiatives?',
          'What decisions require my immediate approval?',
          'How do our unit economics support our self-serve launch?',
        ],
        liveAi: false,
        timestamp,
        executionOutcome: 'error',
        error: 'EMPTY_QUESTION',
      };
    }

    // 1. Retrieve persistent contextual bundle (State, Knowledge, Memory)
    const retrievedContext = await ContextualRetrievalService.getInstance().retrieveForAdvisor(
      cleanQuestion,
      {
        targetContext: options.contextAttachment,
      }
    );

    // 2. Load server-authoritative company context (clientContextSnapshot eliminated for security)
    const fullContext = CompanyContextProvider.getMergedContext();
    const contextPromptText = CompanyContextProvider.formatForAdvisorPrompt(
      fullContext,
      options.contextAttachment
    );

    // 3. If GEMINI_API_KEY is not configured, return truthful unconfigured advisor response
    if (!this.aiClient) {
      return this.buildTruthfulUnconfiguredResponse(
        cleanQuestion,
        fullContext,
        timestamp,
        options.contextAttachment,
        retrievedContext
      );
    }

    // 3. Build structured prompt with strict epistemic model
    const systemInstruction = `You are "Founder Intelligence", the strategic cognitive co-pilot and advisor for the Founder in SamJuniors OS.

ROLE & BOUNDARIES:
- You help the Founder think through problems, analyze company posture, challenge assumptions, identify operational and financial risks, compare strategic trade-offs, and recommend structured next steps.
- You are an ADVISOR, NOT an autonomous worker. You do NOT execute external code, mutate company records, transfer capital, change employee permissions, or approve governance items.

EPISTEMIC KNOWLEDGE MODEL (MANDATORY):
You MUST strictly categorize your reasoning into four categories:
1. FACT: Verified information directly contained in the provided company context (e.g., active initiatives, financial runway, decision logs, research findings).
2. INFERENCE: Deductions and logical conclusions derived from combining known facts.
3. OPINION / RECOMMENDATION: Strategic advice, suggested Founder actions, or alternative considerations.
4. UNKNOWN: Explicitly acknowledge what information is missing, unmeasured, or cannot be verified from available records.

TRUTHFULNESS & ANTI-HALLUCINATION RULES:
- Never fabricate fake revenue metrics, imaginary customer conversations, or unverified legal/compliance certifications.
- If information requested by the Founder is not present in the company context, explicitly classify it as UNKNOWN and suggest how the company or an executive specialist (Sophia Vance, Dr. Aris Thorne, Maya Lin, Julian Cruz) can gather the necessary data.

OUTPUT FORMAT:
You MUST respond with valid JSON matching the following schema:
{
  "summary": "Concise 2-3 sentence executive summary addressing the core question.",
  "analysisMarkdown": "Detailed, highly readable markdown analysis exploring context, trade-offs, implications, and critical nuances.",
  "epistemicBreakdown": {
    "facts": ["Fact 1 grounded directly in company data", "Fact 2 grounded directly in company data"],
    "inferences": ["Inference 1 deduced logically from facts", "Inference 2 deduced logically from facts"],
    "recommendations": ["Recommendation 1 for Founder consideration", "Recommendation 2 for Founder consideration"],
    "unknowns": ["Unknown 1 - missing or unverified data points", "Unknown 2 - data requiring recon"]
  },
  "strategicInsights": [
    {
      "id": "insight-1",
      "title": "Short punchy insight title",
      "summary": "1-2 sentence description of the strategic insight",
      "category": "Strategy | Risk | Opportunity | Governance | Economics",
      "severity": "Critical | High | Medium | Info",
      "primaryAgentSource": "coo | researcher | pm | finance",
      "suggestedAction": "Concrete action for the Founder to evaluate",
      "evidenceBasis": "model_reasoning | calculation | external_evidence"
    }
  ],
  "suggestedFollowUpPrompts": [
    "Suggested follow-up question 1",
    "Suggested follow-up question 2",
    "Suggested follow-up question 3"
  ],
  "referencedInitiatives": ["init-1"],
  "referencedAgents": ["coo", "finance"],
  "referencedDecisions": ["dec-1"]
}

Respond ONLY with raw JSON. No markdown code blocks, no preamble.`;

    let historyText = '';
    if (options.history && options.history.length > 0) {
      historyText = `\n=== RECENT CONVERSATION HISTORY ===\n` +
        options.history
          .map((h) => `${h.sender.toUpperCase()}: ${h.text}`)
          .join('\n') + '\n';
    }

    const userPrompt = `${retrievedContext.formattedSeparatedPrompt}

${contextPromptText}
${historyText}
=== FOUNDER QUESTION ===
"${cleanQuestion}"

Analyze the company context thoroughly, respect the Epistemic Knowledge Model, and provide your structured response in JSON format.`;

    const candidateModels = ['gemini-2.5-flash', 'gemini-2.5-pro'];
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        const response = await this.aiClient.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.5,
          },
        });

        const rawText = response.text?.trim() || '{}';
        const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleanJson);

        const breakdown: EpistemicKnowledgeBreakdown = {
          facts: Array.isArray(parsed.epistemicBreakdown?.facts) ? parsed.epistemicBreakdown.facts : [],
          inferences: Array.isArray(parsed.epistemicBreakdown?.inferences) ? parsed.epistemicBreakdown.inferences : [],
          recommendations: Array.isArray(parsed.epistemicBreakdown?.recommendations) ? parsed.epistemicBreakdown.recommendations : [],
          unknowns: Array.isArray(parsed.epistemicBreakdown?.unknowns) ? parsed.epistemicBreakdown.unknowns : [],
        };

        const insights: AdvisorStrategicInsight[] = Array.isArray(parsed.strategicInsights)
          ? parsed.strategicInsights.map((ins: any, idx: number) => ({
              id: ins.id || `insight-${Date.now()}-${idx}`,
              title: ins.title || 'Strategic Insight',
              summary: ins.summary || '',
              category: ins.category || 'Strategy',
              severity: ins.severity || 'Medium',
              primaryAgentSource: ins.primaryAgentSource || 'coo',
              suggestedAction: ins.suggestedAction || 'Review with Executive Council',
              timestamp,
              evidenceBasis: ins.evidenceBasis || 'model_reasoning',
            }))
          : [];

        return {
          success: true,
          question: cleanQuestion,
          summary: parsed.summary || 'Analysis complete.',
          analysisMarkdown: parsed.analysisMarkdown || parsed.summary || 'Detailed analysis synthesized from company state.',
          epistemicBreakdown: breakdown,
          strategicInsights: insights,
          suggestedFollowUpPrompts: Array.isArray(parsed.suggestedFollowUpPrompts) && parsed.suggestedFollowUpPrompts.length > 0
            ? parsed.suggestedFollowUpPrompts
            : [
                'Why is this happening?',
                'What should I do?',
                'What am I missing?',
                'Is this recommendation actually correct?',
              ],
          contextAttachment: options.contextAttachment,
          referencedInitiatives: Array.isArray(parsed.referencedInitiatives) ? parsed.referencedInitiatives : undefined,
          referencedAgents: Array.isArray(parsed.referencedAgents) ? parsed.referencedAgents : undefined,
          referencedDecisions: Array.isArray(parsed.referencedDecisions) ? parsed.referencedDecisions : undefined,
          retrievedContext,
          liveAi: true,
          modelUsed: model,
          timestamp,
          executionOutcome: 'live_ai',
        };
      } catch (err: any) {
        lastError = err;
        break;
      }
    }

    // Return truthful deterministic fallback with retrieved context if upstream model is unavailable
    const unconfiguredFallback = this.buildTruthfulUnconfiguredResponse(
      cleanQuestion,
      fullContext,
      timestamp,
      options.contextAttachment,
      retrievedContext
    );
    unconfiguredFallback.error = lastError?.message || 'API_UNAVAILABLE';
    return unconfiguredFallback;
  }

  /**
   * Generates a truthful, deterministic fallback when GEMINI_API_KEY is not configured
   */
  private buildTruthfulUnconfiguredResponse(
    question: string,
    context: FullCompanyContext,
    timestamp: string,
    target?: AdvisorTargetContext,
    retrievedContext?: TaskRetrievedContextBundle
  ): FounderAdvisorResponse {
    const pendingDecisionsCount = context.decisions.filter((d) => d.status === 'pending_approval').length;
    const attentionItemsCount = context.attentionItems.filter((a) => a.status === 'pending').length;

    if (target) {
      const targetFacts: string[] = [
        `Company HQ context attached: "${target.title}" (Section: ${target.section}).`,
      ];
      if (target.recommendation) {
        targetFacts.push(`Proposed recommendation on file: "${target.recommendation}".`);
      }
      if (target.whyItMatters) {
        targetFacts.push(`Strategic impact note: "${target.whyItMatters}".`);
      }
      if (target.resultSnippet) {
        targetFacts.push(`Specialist deliverable finding: "${target.resultSnippet}".`);
      }
      if (target.risk) {
        targetFacts.push(`Flagged risk: "${target.risk}".`);
      }

      const targetInferences: string[] = [
        `This item directly influences company execution velocity and governance posture.`,
      ];
      if (target.recommendation) {
        targetInferences.push(`Executing or ratifying this recommendation requires evaluating unit economics and specialist bandwidth.`);
      }

      const targetRecommendations: string[] = [
        `Review the underlying empirical evidence in Company HQ before taking irreversible action.`,
        `Ask your executive team (Sophia Vance, Dr. Aris Thorne, Maya Lin, Julian Cruz) for deeper stress-testing if needed.`,
      ];

      const targetUnknowns: string[] = [
        `Live deep-counterfactual reasoning requires GEMINI_API_KEY configured in the server environment.`,
      ];

      return {
        success: true,
        question,
        summary: `Strategic analysis for attached context: "${target.title}". Safe grounded analysis loaded directly from company records.`,
        analysisMarkdown: `### Contextual Analysis: ${target.title}\n\n**Attached Company HQ Context:**\n- **Section**: ${target.section}\n${target.sourceEntityName ? `- **Author / Source**: ${target.sourceEntityName}\n` : ''}${target.recommendation ? `- **Recommendation**: ${target.recommendation}\n` : ''}${target.whyItMatters ? `- **Why It Matters**: ${target.whyItMatters}\n` : ''}${target.risk ? `- **Flagged Risk**: ${target.risk}\n` : ''}\n\n**Founder Guidance for: *"${question}"*:**\nBased on your single source of truth in Company HQ, this item is grounded in empirical specialist deliverables. When evaluating this move, verify that it maintains the **${context.financialModel.grossMargin}% Gross Margin floor** and aligns with active initiatives.\n\n*Note: Grounded in deterministic company state with zero fabricated data.*`,
        epistemicBreakdown: {
          facts: targetFacts,
          inferences: targetInferences,
          recommendations: targetRecommendations,
          unknowns: targetUnknowns,
        },
        strategicInsights: [
          {
            id: `insight-ctx-${Date.now()}`,
            title: `Context Analysis: ${target.title.slice(0, 36)}`,
            summary: target.recommendation || target.whyItMatters || 'Grounded review of active company item.',
            category: (target.category as any) || 'Strategy',
            severity: target.risk ? 'High' : 'Medium',
            primaryAgentSource: (target.sourceEntityId as any) || 'coo',
            suggestedAction: target.recommendation || 'Inspect evidence in Company HQ before ratifying.',
            timestamp,
            evidenceBasis: (target.evidenceBasis as any) || 'model_reasoning',
          },
        ],
        suggestedFollowUpPrompts: target.suggestedQuestions && target.suggestedQuestions.length > 0
          ? target.suggestedQuestions
          : [
              'Why is this happening?',
              'What should I do?',
              'What am I missing?',
              'Is this recommendation actually correct?',
            ],
        contextAttachment: target,
        referencedInitiatives: context.initiatives.map((i) => i.id),
        referencedAgents: ['coo', 'finance', 'pm', 'researcher'],
        referencedDecisions: context.decisions.map((d) => d.id),
        retrievedContext,
        liveAi: false,
        timestamp,
        executionOutcome: 'unconfigured',
      };
    }

    return {
      success: true,
      question,
      summary: 'Founder Intelligence is operating in Safe Grounded mode. Live Gemini reasoning requires a server-side GEMINI_API_KEY.',
      analysisMarkdown: `### Founder Intelligence Notice\n\nYou asked: *"${question}"*\n\n**Current Company Context Available:**\n- **Initiatives**: ${context.initiatives.length} active initiatives (${context.initiatives.map((i) => i.title).join(', ')}).\n- **Decisions & Governance**: ${pendingDecisionsCount} pending approval out of ${context.decisions.length} total.\n- **Priority Attention**: ${attentionItemsCount} pending items in the Founder attention queue.\n- **Unit Economics**: $${context.financialModel.mrr.toLocaleString()} MRR, ${context.financialModel.grossMargin}% Gross Margin, ${context.financialModel.runwayMonths} months runway.\n\n*Note: To activate deep cognitive synthesis and counterfactual scenario modeling, configure \`GEMINI_API_KEY\` in Settings > Secrets. In accordance with system truthfulness invariants, no simulated metrics have been fabricated.*`,
      epistemicBreakdown: {
        facts: [
          `Company state includes ${context.initiatives.length} initiatives and ${context.agents.length} executive specialists.`,
          `Runway is verified at ${context.financialModel.runwayMonths} months with a ${context.financialModel.grossMargin}% gross margin floor.`,
          `Safe Mock Sandboxing is active across all agent tools.`,
          ...(context.engineeringIntelligence
            ? [
                `Engineering intelligence recorded for repository: ${context.engineeringIntelligence.repositoryTarget}.`,
                ...(context.engineeringIntelligence.evidence?.claims
                  ?.filter((c: any) => c.verificationState === 'claim_supported')
                  .map((c: any) => c.statement) ||
                  context.engineeringIntelligence.evidence?.facts ||
                  []).slice(0, 3),
              ]
            : []),
        ],
        inferences: [
          `Pending governance items (${pendingDecisionsCount}) represent the primary gating factor for company execution velocity.`,
          ...(context.engineeringIntelligence
            ? (context.engineeringIntelligence.evidence?.claims
                ?.filter((c: any) => c.verificationState === 'unverified')
                .map((c: any) => c.statement) ||
                context.engineeringIntelligence.evidence?.inferences ||
                []).slice(0, 2)
            : []),
        ],
        recommendations: [
          `Configure GEMINI_API_KEY on the server for full generative analysis.`,
          `Review pending governance decisions in Company HQ to unlock specialist workflows.`,
        ],
        unknowns: [
          `Complex multi-hop inferences require live Gemini API connection.`,
        ],
      },
      strategicInsights: [
        {
          id: `insight-unconfigured-${Date.now()}`,
          title: 'Server AI Configuration Required',
          summary: 'Live AI reasoning across financial and market vectors requires GEMINI_API_KEY in the server environment.',
          category: 'Governance',
          severity: 'Info',
          primaryAgentSource: 'coo',
          suggestedAction: 'Attach GEMINI_API_KEY in the Settings menu to activate real-time intelligence.',
          timestamp,
          evidenceBasis: 'model_reasoning',
        },
      ],
      suggestedFollowUpPrompts: [
        'What decisions require my immediate approval?',
        'What is our current compute burn and gross margin status?',
        'Summarize the latest findings from Dr. Aris Thorne.',
      ],
      referencedInitiatives: context.initiatives.map((i) => i.id),
      referencedAgents: ['coo', 'finance', 'pm', 'researcher'],
      referencedDecisions: context.decisions.map((d) => d.id),
      retrievedContext,
      liveAi: false,
      timestamp,
      executionOutcome: 'unconfigured',
    };
  }
}

export const AdvisorService = new FounderAdvisorService();
