import { GoogleGenAI } from '@google/genai';
import { AgentRole, AgentWorkProtocolStep, EvidenceBasis, OutputProvenance } from '@/types/os';
import { AssembledEmployeeContext, TaskRetrievedContextBundle } from '@/types/context';
import { ContextualRetrievalService } from '../context/context-retrieval';
import { ContextAssemblyService } from '../context/context-assembly';
import { SERVER_AGENTS, ServerAgentDefinition } from './definitions';
import { AgentRunStore, AgentRunRecord } from './run-store';
import { EpistemicPipeline } from '../epistemic/pipeline';
import { v4 as uuidv4 } from 'uuid';

export interface AgentExecutionContext {
  directive: string;
  protocolStep: AgentWorkProtocolStep;
  taskTitle: string;
  taskDescription: string;
  retrievedContext?: TaskRetrievedContextBundle;
  assembledContext?: AssembledEmployeeContext;
  currentEvidence?: import('@/types/context').CurrentEvidenceInput[];
  upstreamContext?: {
    cooScope?: string;
    researchFindings?: string;
    productSpecs?: string;
    financeAssessment?: string;
    verificationNotes?: string;
  };
}

export interface AgentExecutionResult {
  success: boolean;
  agentId: AgentRole;
  agentName: string;
  protocolStep: AgentWorkProtocolStep;
  statusMessage: string;
  outputContent: string;
  structuredData?: Record<string, any>;
  provenance: OutputProvenance;
  retrievedContext?: TaskRetrievedContextBundle;
  assembledContext?: AssembledEmployeeContext;
  runId?: string;
  claimsGenerated?: string[];
  error?: string;
}

export class ServerAgentExecutor {
  private aiClient: GoogleGenAI | null = null;
  private apiKeyAvailable: boolean = false;

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
      this.apiKeyAvailable = true;
    }
  }

  public isConfigured(): boolean {
    return this.apiKeyAvailable && this.aiClient !== null;
  }

  /**
   * Execute a discrete task with an assigned agent specialist
   */
  public async executeAgentTask(
    agentId: AgentRole,
    context: AgentExecutionContext,
    specificPrompt: string
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const runId = `run-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const agentDef = SERVER_AGENTS[agentId] || SERVER_AGENTS.coo;
    const timestamp = new Date().toISOString();
    const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // PHASE 11.13: Deterministic Context Assembly Pipeline
    // Task → Employee Role → Skill → relevant State/Knowledge/Memory → current evidence → final employee context
    const assembledContext = context.assembledContext || await ContextAssemblyService.getInstance().assembleContextForTask({
      taskId: `task-${context.protocolStep}-${agentId}`,
      role: agentId,
      taskTitle: context.taskTitle,
      taskDescription: context.taskDescription,
      directive: context.directive,
      protocolStep: context.protocolStep,
      currentEvidence: context.currentEvidence,
      upstreamContext: context.upstreamContext,
    });

    // Also populate legacy bundle for compatibility
    const retrievedContext = context.retrievedContext || {
      taskId: assembledContext.taskId,
      role: assembledContext.employeeRole,
      taskTitle: assembledContext.taskTitle,
      timestamp: assembledContext.timestamp,
      retrievedState: {
        items: assembledContext.companyState.map((s) => ({
          entityType: 'initiative' as const,
          id: s.sourceId,
          title: s.title,
          summary: s.content,
          data: {},
          relevanceScore: s.relevanceScore,
          matchReason: s.matchReason,
          provenance: s.provenance,
        })),
        totalCount: assembledContext.companyState.length,
        byEntityType: {},
      },
      retrievedKnowledge: {
        items: assembledContext.companyKnowledge.map((k) => ({
          knowledgeId: k.sourceId,
          documentId: k.sourceId,
          title: k.title,
          category: 'sop' as const,
          version: '1.0',
          summary: k.title,
          contentSnippet: k.content,
          fullContent: k.content,
          applicableDepartments: [agentId],
          relevanceScore: k.relevanceScore,
          matchReason: k.matchReason,
          provenance: k.provenance,
        })),
        totalCount: assembledContext.companyKnowledge.length,
        byCategory: {},
      },
      retrievedMemory: {
        items: assembledContext.historicalMemory.map((m) => ({
          memoryId: m.sourceId,
          sourceDecisionId: m.sourceId,
          approvedAction: m.title,
          executionOutcome: 'verified_complete',
          keyLearnings: [],
          tags: [],
          timestamp: m.timestamp,
          epistemicConfidence: (m.provenance?.confidence || 'unverified') as any,
          relevanceExplanation: m.matchReason,
          isConflicting: m.isConflicting,
          provenance: m.provenance,
        })),
        totalCount: assembledContext.historicalMemory.length,
        hasHistoricalPrecedents: assembledContext.historicalMemory.length > 0,
      },
      conflicts: assembledContext.conflicts,
      excludedNoise: {
        stateItemsExcludedCount: assembledContext.excludedNoise.stateItemsExcludedCount,
        knowledgeItemsExcludedCount: assembledContext.excludedNoise.knowledgeItemsExcludedCount,
        memoryItemsExcludedCount: assembledContext.excludedNoise.memoryItemsExcludedCount,
        sampleExcludedTitles: assembledContext.excludedNoise.sampleExcludedTitles,
      },
      formattedSeparatedPrompt: assembledContext.formattedPrompt,
    };

    if (!this.aiClient) {
      const durationMs = Date.now() - startTime;
      const unavailContent = `**Execution Unavailable**: Server AI execution requires a configured GEMINI_API_KEY. No live agent execution was performed, and simulated metrics are strictly disabled.`;
      const provenance: OutputProvenance = {
        agentId,
        agentName: agentDef.name,
        taskId: `task-${context.protocolStep}-${agentId}`,
        protocolStep: context.protocolStep,
        timestamp,
        isVerified: false,
        evidenceBasis: 'unverified',
      };

      await AgentRunStore.getInstance().saveRun({
        runId,
        agentId,
        agentName: agentDef.name,
        protocolStep: context.protocolStep,
        taskTitle: context.taskTitle,
        directive: context.directive,
        status: 'halted',
        durationMs,
        outputContent: unavailContent,
        provenance,
        error: 'GEMINI_API_KEY_MISSING',
        timestamp,
      });

      return {
        success: false,
        agentId,
        agentName: agentDef.name,
        protocolStep: context.protocolStep,
        statusMessage: `[${agentDef.name}] Execution halted: GEMINI_API_KEY is not configured on the server.`,
        outputContent: unavailContent,
        retrievedContext,
        assembledContext,
        runId,
        provenance,
        error: 'GEMINI_API_KEY_MISSING',
      };
    }

    const systemInstruction = `${agentDef.systemInstruction}
You are executing Protocol Step: "${context.protocolStep}" for Directive: "${context.directive}".
Task: "${context.taskTitle}" - ${context.taskDescription}

Prohibited Actions to strictly enforce:
${agentDef.prohibitedActions.map((p) => `- ${p}`).join('\n')}

Important Truthfulness Rule:
Do not fabricate specific unverifiable numbers, fake revenue, imaginary customer names, or compliance certificates. State reasoning clearly. If external real-time data is unavailable, explicitly state that your response is based on architectural reasoning and model analysis.`;

    let upstreamInfo = '';
    if (context.upstreamContext) {
      const up = context.upstreamContext;
      if (up.cooScope) upstreamInfo += `\n[COO Scope & Guidelines]:\n${up.cooScope}\n`;
      if (up.researchFindings) upstreamInfo += `\n[Market & Tech Research from Dr. Aris Thorne]:\n${up.researchFindings}\n`;
      if (up.productSpecs) upstreamInfo += `\n[Product Specifications & PRD from Maya Lin]:\n${up.productSpecs}\n`;
      if (up.financeAssessment) upstreamInfo += `\n[Financial Assessment from Julian Cruz]:\n${up.financeAssessment}\n`;
    }

    const fullPrompt = `${retrievedContext.formattedSeparatedPrompt}

${upstreamInfo}
Directive: "${context.directive}"
Current Assigned Task: "${context.taskTitle}"

${specificPrompt}

Respond with a JSON object adhering to this schema:
{
  "statusMessage": "Short 1-2 sentence real-time status update for the executive message stream",
  "summary": "Brief 1-2 sentence summary of this step's output",
  "artifactTitle": "Title of deliverable or document section",
  "artifactContent": "Comprehensive markdown output detailing the results of this task",
  "evidenceBasis": "model_reasoning | calculation | external_evidence | unverified",
  "keyTakeaways": ["takeaway 1", "takeaway 2"]
}

Return ONLY raw valid JSON with no markdown wrapping.`;

    const candidateModels = ['gemini-3.7-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        const response = await this.aiClient.models.generateContent({
          model,
          contents: fullPrompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.6,
          },
        });

        const rawText = response.text?.trim() || '{}';
        const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleanJson);

        const basis: EvidenceBasis = (parsed.evidenceBasis as EvidenceBasis) || 'model_reasoning';
        const durationMs = Date.now() - startTime;
        const candidateClaims: string[] = [];

        // PHASE 13 (OptimalEngine Epistemic Lifecycle):
        // Automatically extract candidate claims from agent deliverables.
        // Invariant: Claims are submitted as 'pending', NEVER silently treated as company truth.
        if (Array.isArray(parsed.keyTakeaways)) {
          for (const takeaway of parsed.keyTakeaways) {
            if (typeof takeaway === 'string' && takeaway.trim().length > 10) {
              try {
                const claimCategory = 
                  agentId === 'finance' ? 'financial' :
                  agentId === 'researcher' ? 'market_research' :
                  agentId === 'pm' ? 'operational' : 'governance';

                const claim = await EpistemicPipeline.getInstance().submitClaim({
                  statement: takeaway.trim(),
                  subject: context.taskTitle,
                  category: claimCategory,
                  proposedBy: agentId,
                  confidence: basis === 'calculation' ? 'high_confidence' : 'unverified',
                  agentRunId: runId,
                });
                candidateClaims.push(claim.id);
              } catch {}
            }
          }
        }

        const provenance: OutputProvenance = {
          agentId,
          agentName: agentDef.name,
          taskId: `task-${context.protocolStep}-${agentId}-${Date.now()}`,
          protocolStep: context.protocolStep,
          timestamp,
          isVerified: true,
          evidenceBasis: basis,
          modelUsed: model,
        };

        await AgentRunStore.getInstance().saveRun({
          runId,
          agentId,
          agentName: agentDef.name,
          protocolStep: context.protocolStep,
          taskTitle: context.taskTitle,
          directive: context.directive,
          status: 'completed',
          durationMs,
          outputContent: parsed.artifactContent || parsed.summary || 'Task completed.',
          structuredData: parsed,
          claimsGenerated: candidateClaims,
          provenance,
          modelUsed: model,
          timestamp,
        });

        return {
          success: true,
          agentId,
          agentName: agentDef.name,
          protocolStep: context.protocolStep,
          statusMessage: parsed.statusMessage || `[${agentDef.name}] Completed ${context.taskTitle}.`,
          outputContent: parsed.artifactContent || parsed.summary || 'Task completed.',
          structuredData: parsed,
          provenance,
          retrievedContext,
          assembledContext,
          runId,
          claimsGenerated: candidateClaims,
        };
      } catch (err: any) {
        lastError = err;
        const isHighDemand =
          err?.status === 503 ||
          err?.code === 503 ||
          err?.message?.includes('high demand') ||
          err?.message?.includes('UNAVAILABLE') ||
          err?.message?.includes('RESOURCE_EXHAUSTED');
        if (isHighDemand) {
          continue;
        }
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    const errorOutput = `**Execution Error**: Task "${context.taskTitle}" failed to execute through the agent runtime: ${lastError?.message || 'Upstream provider unavailable'}.`;
    const failProvenance: OutputProvenance = {
      agentId,
      agentName: agentDef.name,
      taskId: `task-${context.protocolStep}-${agentId}`,
      protocolStep: context.protocolStep,
      timestamp,
      isVerified: false,
      evidenceBasis: 'unverified',
    };

    await AgentRunStore.getInstance().saveRun({
      runId,
      agentId,
      agentName: agentDef.name,
      protocolStep: context.protocolStep,
      taskTitle: context.taskTitle,
      directive: context.directive,
      status: 'failed',
      durationMs,
      outputContent: errorOutput,
      provenance: failProvenance,
      error: lastError?.message || 'Execution failed',
      timestamp,
    });

    return {
      success: false,
      agentId,
      agentName: agentDef.name,
      protocolStep: context.protocolStep,
      statusMessage: `[${agentDef.name}] Task execution failed due to API communication error: ${lastError?.message || 'Unknown error'}.`,
      outputContent: errorOutput,
      retrievedContext,
      assembledContext,
      runId,
      provenance: failProvenance,
      error: lastError?.message || 'Execution failed',
    };
  }
}
