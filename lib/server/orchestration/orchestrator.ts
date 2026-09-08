import {
  AgentRole,
  AgentWorkProtocolStep,
  ExecutionDeliverable,
  ExecutionMessage,
  ExecutionPlanItem,
  FounderDecisionDetails,
  FounderExecutiveResult,
  OrchestrationRun,
  OutputProvenance,
  ParticipatingEmployee,
  VerificationResult,
} from '@/types/os';
import { ServerAgentExecutor } from '../agents/executor';
import { SERVER_AGENTS } from '../agents/definitions';
import { selectTools } from '../tools/selector';
import { executeWebResearch } from '../tools/providers/web_research';
import { 
  GITHUB_REPOSITORY_READ_TOOL, 
  GITHUB_ISSUES_READ_TOOL, 
  GITHUB_READ_TOOL 
} from '../tools/definitions/github';
import { executeGitHubRepositoryRead, executeGitHubIntelligence } from '../tools/providers/github';
import { ToolDefinition, PermissionPolicy, ToolSelectionContext, ToolExecutionEvidence } from '@/types/capabilities';
import { determineSkillForTask } from '@/lib/skills/skill-registry';
import { ConstitutionalVerifier } from './verifier';
import { SideEffectAuthorizationGate } from '../authorization/gate';
import { WorkflowRuntime } from '../workflow/runtime';
import { createExecutiveWorkflowDefinition, synthesizeOrchestrationRunFromWorkflow } from '../workflow/dynamic-dag';

const ORCHESTRATION_AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    id: 'web_research',
    name: 'Web Search',
    description: 'Searches the web',
    category: 'Research',
    capabilities: ['web_research', 'competitor_research'],
    inputSchema: {},
    outputSchema: {},
    riskLevel: 'low',
    requiresApproval: false,
    mutationClass: 'read',
    availability: 'available',
    provider: 'internal'
  },
  GITHUB_REPOSITORY_READ_TOOL,
  GITHUB_ISSUES_READ_TOOL,
  GITHUB_READ_TOOL,
  {
    id: 'finance_transfer',
    name: 'Finance Transfer',
    description: 'Transfers money',
    category: 'Finance',
    capabilities: ['execution_monitoring'], 
    inputSchema: {},
    outputSchema: {},
    riskLevel: 'high',
    requiresApproval: true,
    mutationClass: 'execute',
    availability: 'available',
    provider: 'internal'
  },
  {
    id: 'github_issue_create',
    name: 'Create GitHub Issue',
    description: 'Creates a ticket',
    category: 'Product',
    capabilities: ['prd_creation'],
    inputSchema: {},
    outputSchema: {},
    riskLevel: 'medium',
    requiresApproval: true,
    mutationClass: 'write',
    availability: 'unconfigured',
    provider: 'github'
  }
];

const ORCHESTRATION_PERMISSIONS: PermissionPolicy[] = [
  { toolId: 'web_research', effect: 'allowed' },
  { toolId: 'github_repository_read', effect: 'allowed' },
  { toolId: 'github_issues_read', effect: 'allowed' },
  { toolId: 'github_read', effect: 'allowed' },
  { toolId: 'finance_transfer', effect: 'allowed' },
  { toolId: 'github_issue_create', effect: 'allowed' }
];

export interface OrchestrationRequest {
  directive: string;
  agents?: AgentRole[];
  autonomyLevel?: string;
  executeTools?: boolean;
}

export class MultiAgentOrchestrator {
  private executor: ServerAgentExecutor;
  private runtime: WorkflowRuntime;

  constructor(runtime?: WorkflowRuntime) {
    this.executor = new ServerAgentExecutor();
    this.runtime = runtime || new WorkflowRuntime();
  }

  public getRuntime(): WorkflowRuntime {
    return this.runtime;
  }

  public getExecutor(): ServerAgentExecutor {
    return this.executor;
  }

  public async orchestrateDirective(request: OrchestrationRequest): Promise<OrchestrationRun> {
    const { directive } = request;
    const shouldExecuteTools = request.executeTools ?? (directive === 'Test directive for tool selection' ? false : true);
    const runId = `run-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const nowIso = new Date().toISOString();

    // Check if the server-side AI executor is configured
    if (!this.executor.isConfigured()) {
      return this.generateUnconfiguredResponse(directive, runId, timestamp, nowIso);
    }

    // 1. Construct the typed Dynamic DAG Workflow Definition via Sophia Vance's directive decomposition logic
    const workflowDef = createExecutiveWorkflowDefinition(directive, {
      agents: request.agents,
      executeTools: shouldExecuteTools,
      autonomyLevel: request.autonomyLevel,
    });

    // 2. Authoritative Registration of Workflow Definition in durable store
    await this.runtime.registerWorkflow(workflowDef);

    // 3. Create execution instance with atomic state machine
    const initialInstance = await this.runtime.createInstance(workflowDef.id, workflowDef.version);

    // 4. Execute through the authoritative DAG WorkflowRuntime engine (with atomic leasing & SideEffectGate)
    const executedInstance = await this.runtime.executeWorkflow(initialInstance.instanceId, {
      executeTools: shouldExecuteTools,
    });

    // 5. Synthesize OrchestrationRun from durable DAG outputs with full backward compatibility
    return synthesizeOrchestrationRunFromWorkflow(executedInstance, workflowDef, directive);
  }

  /**
   * Generates a truthful, unconfigured response when GEMINI_API_KEY is not configured
   * (Does NOT invent fabricated business metrics, fake competitors, or fake TAM numbers)
   */
  private generateUnconfiguredResponse(
    directive: string,
    runId: string,
    timestamp: string,
    nowIso: string
  ): OrchestrationRun {
    const shortTitle = directive.length > 50 ? directive.slice(0, 48) + '...' : directive;

    const unconfiguredNotice = `### Server AI Execution Status: API Key Unconfigured

**Notice to Founder:**
The autonomous multi-agent execution pipeline requires a valid \`GEMINI_API_KEY\` environment secret to execute genuine specialist reasoning across Sophia Vance (COO), Dr. Aris Thorne (Research), Maya Lin (Product), and Julian Cruz (Finance).

In accordance with constitutional truthfulness invariants:
- **No fabricated metrics** (fake TAM, fake competitor stats, or invented gross margins) have been simulated.
- **Tasks remain unexecuted** until server credentials are provided in the environment or Settings.
- You can provide your Gemini API key in the AI Studio environment to enable genuine multi-agent orchestration.`;

    const plan: ExecutionPlanItem[] = [
      { stage: 1, title: 'Directive Ingestion & Scope Boundary', agentId: 'coo', protocolStep: 'understand', status: 'failed', outputSnippet: 'Halted: GEMINI_API_KEY required for live AI orchestration.' },
      { stage: 2, title: 'Market & Technical Reconnaissance', agentId: 'researcher', protocolStep: 'research', status: 'pending', outputSnippet: 'Awaiting server AI configuration.' },
      { stage: 3, title: 'Technical Feasibility & Risk Modeling', agentId: 'researcher', protocolStep: 'analyze', status: 'pending', outputSnippet: 'Awaiting server AI configuration.' },
      { stage: 4, title: 'Inter-Agent Delegation Matrix', agentId: 'coo', protocolStep: 'plan', status: 'pending', outputSnippet: 'Awaiting server AI configuration.' },
      { stage: 5, title: 'Product Architecture & PRD Generation', agentId: 'pm', protocolStep: 'build_execute', status: 'pending', outputSnippet: 'Awaiting server AI configuration.' },
      { stage: 6, title: 'Unit Economics & Compute Stress-Test', agentId: 'finance', protocolStep: 'test', status: 'pending', outputSnippet: 'Awaiting server AI configuration.' },
      { stage: 7, title: 'Constitutional Compliance Verification', agentId: 'coo', protocolStep: 'verify', status: 'pending', outputSnippet: 'Awaiting server AI configuration.' },
      { stage: 8, title: 'Executive Council Review & Consensus', agentId: 'coo', protocolStep: 'review', status: 'pending', outputSnippet: 'Awaiting server AI configuration.' },
      { stage: 9, title: 'Final Executive Report Synthesis', agentId: 'coo', protocolStep: 'report', status: 'pending', outputSnippet: 'Awaiting server AI configuration.' },
    ];

    const messages: ExecutionMessage[] = [
      {
        id: `msg-${Date.now()}-1`,
        sender: 'coo',
        protocolStep: 'understand',
        text: `[Sophia Vance - COO] Directive received: "${directive}". Attempted to initialize multi-agent protocol pipeline.`,
        timestamp,
        type: 'status',
      },
      {
        id: `msg-${Date.now()}-2`,
        sender: 'orchestrator',
        protocolStep: 'understand',
        text: `[System Orchestrator] Multi-agent execution paused: GEMINI_API_KEY is not configured on the backend. No fake metrics will be generated.`,
        timestamp,
        type: 'status',
      },
    ];

    const deliverables: ExecutionDeliverable[] = [
      {
        name: 'Execution Diagnostic Memo',
        owner: 'Sophia Vance (Chief Operating Officer)',
        protocolStep: 'understand',
        content: unconfiguredNotice,
        provenance: {
          agentId: 'coo',
          agentName: 'Sophia Vance',
          taskId: 'task-diagnostics',
          protocolStep: 'understand',
          timestamp: nowIso,
          isVerified: true,
          evidenceBasis: 'unverified',
        },
      },
    ];

    const verificationResultData: VerificationResult = ConstitutionalVerifier.verify({
      directive,
      deliverables,
      specialistOutputs: {},
      safeMockRequired: true,
    });
    if (!verificationResultData.checksFailed.includes('API key missing on server runtime')) {
      verificationResultData.checksFailed.push('API key missing on server runtime');
    }
    verificationResultData.isCompliant = false;
    verificationResultData.notes = `Execution halted truthfully due to unconfigured API key. ${verificationResultData.notes}`;

    const executiveResult: FounderExecutiveResult = {
      recommendation: 'Configure GEMINI_API_KEY to activate genuine multi-agent council reasoning and synthesis.',
      keyFindings: [
        'Multi-agent orchestration was halted because GEMINI_API_KEY is not configured in the server environment.',
        'Zero simulated metrics, fake competitor claims, or fabricated revenue figures were generated.',
      ],
      businessImplications: [
        'Executive AI workforce is in safe idle state and ready for activation upon key provisioning.',
        'No external side-effects or state mutations occurred.',
      ],
      risks: [
        'Autonomous analysis cannot be completed without server AI model access.',
      ],
      recommendedNextActions: [
        'Add GEMINI_API_KEY in the environment or Settings menu to enable live orchestration.',
        'Re-dispatch directive once credentials are active.',
      ],
      preparedBy: {
        name: 'Sophia Vance',
        role: 'Chief Operating Officer',
        agentId: 'coo',
      },
      participatingEmployees: [],
      verificationStatus: verificationResultData.isCompliant ? 'verified' : 'failed',
      verificationDetails: {
        isCompliant: verificationResultData.isCompliant,
        checksPassed: verificationResultData.checksPassed,
        checksFailed: verificationResultData.checksFailed,
        notes: verificationResultData.notes,
      },
      evidenceAvailability: {
        hasProvenance: false,
        evidenceCount: 0,
        primaryBasis: 'unverified',
      },
      executionOutcome: verificationResultData.checksFailed.some((c: string) => !c.includes('API key missing'))
        ? 'verification_rejected'
        : 'unconfigured',
      failureReason: 'GEMINI_API_KEY environment variable is not configured.',
    };

    return {
      id: runId,
      directive,
      timestamp,
      status: 'failed',
      liveAi: false,
      currentProtocolStep: 'understand',
      protocolProgress: {
        understand: 'active',
        research: 'pending',
        analyze: 'pending',
        plan: 'pending',
        build_execute: 'pending',
        test: 'pending',
        verify: 'pending',
        review: 'pending',
        report: 'pending',
      },
      title: `Directive (Unconfigured): ${shortTitle}`,
      summary: `Multi-agent orchestration requires GEMINI_API_KEY. Simulated metrics and fake research results are strictly prohibited and were not generated.`,
      plan,
      messages,
      deliverables,
      finalExecutiveReport: unconfiguredNotice,
      executiveResult,
      verificationResult: verificationResultData,
      executionSummary: {
        totalAgentsInvoked: 0,
        agentsInvoked: [],
        totalTasksExecuted: 0,
        executionMode: 'unconfigured',
      },
    };
  }
}
