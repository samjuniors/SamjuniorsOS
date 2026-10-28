import { generateJson, isAIConfigured } from '../ai/zai-client';
import { AgentRole, AgentWorkProtocolStep, EvidenceBasis, OutputProvenance } from '@/types/os';
import { AssembledEmployeeContext, TaskRetrievedContextBundle } from '@/types/context';
import { ContextualRetrievalService } from '../context/context-retrieval';
import { ContextAssemblyService } from '../context/context-assembly';
import { SERVER_AGENTS, ServerAgentDefinition } from './definitions';
import { AgentRunStore, AgentRunRecord } from './run-store';
import { EpistemicPipeline } from '../epistemic/pipeline';
import { v4 as uuidv4 } from 'uuid';
import { SafeModeManager } from '../sophia/stop-control';
import { SpendSettingsManager } from '../sophia/spend-settings';

export interface AgentExecutionContext {
  directive: string;
  protocolStep: AgentWorkProtocolStep;
  taskTitle: string;
  taskDescription: string;
  retrievedContext?: TaskRetrievedContextBundle;
  assembledContext?: AssembledEmployeeContext;
  currentEvidence?: import('@/types/context').CurrentEvidenceInput[];
  /** Phase 4.4C — authoritative workflow execution context. Set ONLY by the
   *  WorkflowRuntime (which owns instance/step identity); never
   *  client-supplied. Persisted into the run's provenance so completed/failed
   *  AgentRuns trace deterministically to their workflow instance, step and
   *  scheduled occurrence. */
  workflowInstanceId?: string;
  stepId?: string;
  occurrenceId?: string;
  occurrenceNumber?: number;
  upstreamContext?: {
    cooScope?: string;
    researchFindings?: string;
    productSpecs?: string;
    financeAssessment?: string;
    verificationNotes?: string;
    councilDeliberation?: string;
    reviewFingerprint?: string;
  };
  signal?: AbortSignal;
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
  /**
   * The z-ai-web-dev-sdk backend is pre-provisioned in this environment,
   * so the executor is always configured. Per-request failures are handled
   * by the error paths below (fail-closed, never simulated).
   */
  public isConfigured(): boolean {
    return isAIConfigured();
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

    const safeMode = SafeModeManager.getInstance();
    if (safeMode.isFrozen()) {
      const freezeReason = `Task execution blocked: System is frozen under Safe Mode (${safeMode.getFreezeStatus().reason || 'Stop Control active'})`;
      const failProvenance: OutputProvenance = {
        agentId,
        agentName: agentDef.name,
        taskId: `task-${context.protocolStep}-${agentId}`,
        protocolStep: context.protocolStep,
        timestamp,
        isVerified: false,
        evidenceBasis: 'unverified',
        workflowInstanceId: context.workflowInstanceId,
        stepId: context.stepId,
        occurrenceId: context.occurrenceId,
        occurrenceNumber: context.occurrenceNumber,
      };
      await AgentRunStore.getInstance().saveRun({
        runId,
        agentId,
        agentName: agentDef.name,
        protocolStep: context.protocolStep,
        taskTitle: context.taskTitle,
        directive: context.directive,
        status: 'halted',
        durationMs: 0,
        outputContent: freezeReason,
        provenance: failProvenance,
        error: freezeReason,
        timestamp,
      });
      return {
        success: false,
        agentId,
        agentName: agentDef.name,
        protocolStep: context.protocolStep,
        statusMessage: `[${agentDef.name}] ${freezeReason}.`,
        outputContent: freezeReason,
        runId,
        provenance: failProvenance,
        error: freezeReason,
      };
    }

    // G12.8 Spend Cap Gate: With no spend cap set, no autonomous model spend runs.
    // When cap is reached, autonomous work halts deterministically before model invocation.
    const spendManager = SpendSettingsManager.getInstance();
    const autoSpendCheck = spendManager.canExecuteAutonomousSpend();
    if (!autoSpendCheck.allowed) {
      const spendError = autoSpendCheck.message || 'Task execution blocked: Autonomous model spend is disabled (no spend cap configured or spend cap reached)';
      const failProvenance: OutputProvenance = {
        agentId,
        agentName: agentDef.name,
        taskId: `task-${context.protocolStep}-${agentId}`,
        protocolStep: context.protocolStep,
        timestamp,
        isVerified: false,
        evidenceBasis: 'unverified',
        workflowInstanceId: context.workflowInstanceId,
        stepId: context.stepId,
        occurrenceId: context.occurrenceId,
        occurrenceNumber: context.occurrenceNumber,
      };

      await AgentRunStore.getInstance().saveRun({
        runId,
        agentId,
        agentName: agentDef.name,
        protocolStep: context.protocolStep,
        taskTitle: context.taskTitle,
        directive: context.directive,
        status: 'halted',
        durationMs: 0,
        outputContent: spendError,
        provenance: failProvenance,
        error: spendError,
        timestamp,
      });

      return {
        success: false,
        agentId,
        agentName: agentDef.name,
        protocolStep: context.protocolStep,
        statusMessage: `[${agentDef.name}] ${spendError}.`,
        outputContent: spendError,
        runId,
        provenance: failProvenance,
        error: spendError,
      };
    }

    // Cancellation check: Fail closed if abort signal was already triggered
    if (context.signal?.aborted) {
      const abortReason = (context.signal.reason as string) || 'Task execution cancelled via AbortSignal';
      const failProvenance: OutputProvenance = {
        agentId,
        agentName: agentDef.name,
        taskId: `task-${context.protocolStep}-${agentId}`,
        protocolStep: context.protocolStep,
        timestamp,
        isVerified: false,
        evidenceBasis: 'unverified',
        workflowInstanceId: context.workflowInstanceId,
        stepId: context.stepId,
        occurrenceId: context.occurrenceId,
        occurrenceNumber: context.occurrenceNumber,
      };

      await AgentRunStore.getInstance().saveRun({
        runId,
        agentId,
        agentName: agentDef.name,
        protocolStep: context.protocolStep,
        taskTitle: context.taskTitle,
        directive: context.directive,
        status: 'halted',
        durationMs: 0,
        outputContent: `Task aborted before execution: ${abortReason}`,
        provenance: failProvenance,
        error: abortReason,
        timestamp,
      });

      return {
        success: false,
        agentId,
        agentName: agentDef.name,
        protocolStep: context.protocolStep,
        statusMessage: `[${agentDef.name}] Task cancelled before start: ${abortReason}.`,
        outputContent: `Task aborted: ${abortReason}`,
        runId,
        provenance: failProvenance,
        error: abortReason,
      };
    }

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
    } as TaskRetrievedContextBundle;



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

    let lastError: any = null;

    const taskAbortController = new AbortController();
    if (context.signal) {
      if (context.signal.aborted) {
        taskAbortController.abort(context.signal.reason);
      } else {
        context.signal.addEventListener('abort', () => {
          taskAbortController.abort(context.signal?.reason);
        }, { once: true });
      }
    }
    spendManager.registerRunningTask(runId, taskAbortController, context.taskTitle);

    executionAttempt: {
      const model = 'zai-llm';
      try {
        const abortPromise = new Promise<never>((_, reject) => {
          if (taskAbortController.signal.aborted) {
            reject(new Error((taskAbortController.signal.reason as string) || 'Task execution aborted via AbortSignal'));
          } else {
            taskAbortController.signal.addEventListener('abort', () => {
              reject(new Error((taskAbortController.signal.reason as string) || 'Task execution aborted via AbortSignal'));
            }, { once: true });
          }
        });

        const parsed = await Promise.race([
          generateJson({
            system: systemInstruction,
            messages: [{ role: 'user', content: fullPrompt }],
          }),
          abortPromise,
        ]);

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
          // Phase 4.4C — authoritative workflow execution context (present
          // only when the WorkflowRuntime executed this run as a workflow
          // step; honest absence otherwise).
          workflowInstanceId: context.workflowInstanceId,
          stepId: context.stepId,
          occurrenceId: context.occurrenceId,
          occurrenceNumber: context.occurrenceNumber,
        };

        if (context.upstreamContext?.reviewFingerprint && parsed && typeof parsed === 'object') {
          parsed.reviewFingerprint = context.upstreamContext.reviewFingerprint;
        }

        // G12.8: Record autonomous model spend
        spendManager.recordSpend({
          amountUsd: 0.005,
          type: 'autonomous',
          taskId: runId,
          model,
        });

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
        break executionAttempt;
      } finally {
        spendManager.unregisterRunningTask(runId);
      }
    }

    const durationMs = Date.now() - startTime;
    const isAborted = taskAbortController.signal.aborted || context.signal?.aborted || /halted by stop control|aborted|spend cap/i.test(lastError?.message || '');
    const runStatus = isAborted ? 'halted' : 'failed';
    const errorOutput = isAborted
      ? `**Task Halted**: Task "${context.taskTitle}" was halted mid-run by Stop Control / Safe Mode.`
      : `**Execution Error**: Task "${context.taskTitle}" failed to execute through the agent runtime: ${lastError?.message || 'Upstream provider unavailable'}.`;
    const failProvenance: OutputProvenance = {
      agentId,
      agentName: agentDef.name,
      taskId: `task-${context.protocolStep}-${agentId}`,
      protocolStep: context.protocolStep,
      timestamp,
      isVerified: false,
      evidenceBasis: 'unverified',
      // Phase 4.4C — workflow execution context preserved on failure too, so
      // failed runs trace to their instance/step/occurrence exactly like
      // completed ones (scheduler retry semantics depend on this visibility).
      workflowInstanceId: context.workflowInstanceId,
      stepId: context.stepId,
      occurrenceId: context.occurrenceId,
      occurrenceNumber: context.occurrenceNumber,
    };

    await AgentRunStore.getInstance().saveRun({
      runId,
      agentId,
      agentName: agentDef.name,
      protocolStep: context.protocolStep,
      taskTitle: context.taskTitle,
      directive: context.directive,
      status: runStatus,
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
      statusMessage: isAborted ? `[${agentDef.name}] Task halted mid-run: ${lastError?.message || 'Stop Control active'}.` : `[${agentDef.name}] Task execution failed due to API communication error: ${lastError?.message || 'Unknown error'}.`,
      outputContent: errorOutput,
      retrievedContext,
      assembledContext,
      runId,
      provenance: failProvenance,
      error: lastError?.message || 'Execution failed',
    };
  }
}
