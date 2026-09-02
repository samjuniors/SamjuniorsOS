import { GoogleGenAI } from '@google/genai';
import { AgentRole, AgentWorkProtocolStep, EvidenceBasis, OutputProvenance } from '@/types/os';
import { SERVER_AGENTS, ServerAgentDefinition } from './definitions';

export interface AgentExecutionContext {
  directive: string;
  protocolStep: AgentWorkProtocolStep;
  taskTitle: string;
  taskDescription: string;
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
    const agentDef = SERVER_AGENTS[agentId] || SERVER_AGENTS.coo;
    const timestamp = new Date().toISOString();
    const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (!this.aiClient) {
      return {
        success: false,
        agentId,
        agentName: agentDef.name,
        protocolStep: context.protocolStep,
        statusMessage: `[${agentDef.name}] Execution halted: GEMINI_API_KEY is not configured on the server.`,
        outputContent: `**Execution Unavailable**: Server AI execution requires a configured GEMINI_API_KEY. No live agent execution was performed, and simulated metrics are strictly disabled.`,
        provenance: {
          agentId,
          agentName: agentDef.name,
          taskId: `task-${context.protocolStep}-${agentId}`,
          protocolStep: context.protocolStep,
          timestamp,
          isVerified: false,
          evidenceBasis: 'unverified',
        },
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

    const fullPrompt = `${upstreamInfo}
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

        return {
          success: true,
          agentId,
          agentName: agentDef.name,
          protocolStep: context.protocolStep,
          statusMessage: parsed.statusMessage || `[${agentDef.name}] Completed ${context.taskTitle}.`,
          outputContent: parsed.artifactContent || parsed.summary || 'Task completed.',
          structuredData: parsed,
          provenance: {
            agentId,
            agentName: agentDef.name,
            taskId: `task-${context.protocolStep}-${agentId}-${Date.now()}`,
            protocolStep: context.protocolStep,
            timestamp,
            isVerified: true,
            evidenceBasis: basis,
            modelUsed: model,
          },
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

    return {
      success: false,
      agentId,
      agentName: agentDef.name,
      protocolStep: context.protocolStep,
      statusMessage: `[${agentDef.name}] Task execution failed due to API communication error: ${lastError?.message || 'Unknown error'}.`,
      outputContent: `**Execution Error**: Task "${context.taskTitle}" failed to execute through the agent runtime: ${lastError?.message || 'Upstream provider unavailable'}.`,
      provenance: {
        agentId,
        agentName: agentDef.name,
        taskId: `task-${context.protocolStep}-${agentId}`,
        protocolStep: context.protocolStep,
        timestamp,
        isVerified: false,
        evidenceBasis: 'unverified',
      },
      error: lastError?.message || 'Execution failed',
    };
  }
}
