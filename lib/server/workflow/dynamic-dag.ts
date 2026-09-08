import { 
  WorkflowDefinition, 
  WorkflowStepDefinition, 
  WorkflowInstanceState, 
  WorkflowStepState 
} from '../../../types/workflow';
import { 
  AgentRole, 
  AgentWorkProtocolStep, 
  ExecutionDeliverable, 
  ExecutionMessage, 
  ExecutionPlanItem, 
  FounderExecutiveResult, 
  OrchestrationRun, 
  OutputProvenance, 
  VerificationResult 
} from '@/types/os';
import { SideEffectClassification } from '@/types/authorization';
import { determineSkillForTask } from '@/lib/skills/skill-registry';
import { ConstitutionalVerifier } from '../orchestration/verifier';
import { v4 as uuidv4 } from 'uuid';

export interface ExecutiveWorkflowOptions {
  agents?: AgentRole[];
  executeTools?: boolean;
  autonomyLevel?: string;
  requireApproval?: boolean;
  sideEffectTarget?: {
    targetSystem: string;
    action: string;
    payload?: Record<string, any>;
  };
}

/**
 * Transforms an executive directive into a formal, typed Workflow DAG Definition.
 *
 * DAG Structure:
 * 1. step-coo-scope (COO, understand)
 * 2. step-research (Researcher, research) [depends on step-coo-scope]
 * 3. step-finance (Finance, test/analyze) [depends on step-coo-scope] -> Parallel Fan-Out with step-research
 * 4. step-pm-prd (PM, build_execute) [depends on step-research AND step-finance] -> Fan-In
 * 5. step-verification (COO, verify) [depends on step-pm-prd]
 * 6. step-synthesis-report (COO, report) [depends on step-verification]
 * 7. (optional) step-side-effect (COO, execute) [depends on step-synthesis-report, requiresApproval: true]
 */
export function createExecutiveWorkflowDefinition(
  directive: string,
  options?: ExecutiveWorkflowOptions
): WorkflowDefinition {
  const workflowId = `wf-exec-${uuidv4()}`;
  const now = new Date().toISOString();
  const lowerDirective = directive.toLowerCase();

  // Detect if external GitHub intelligence is requested
  const isGitHubRequested = 
    lowerDirective.includes('github') || 
    lowerDirective.includes('repository') || 
    lowerDirective.includes('repo') ||
    lowerDirective.includes('octocat') ||
    lowerDirective.includes('/');

  // Detect if external side-effect is requested (e.g. transfer, send email, create ticket)
  const isSideEffectRequested =
    Boolean(options?.requireApproval) ||
    Boolean(options?.sideEffectTarget) ||
    lowerDirective.includes('transfer') ||
    lowerDirective.includes('send email') ||
    lowerDirective.includes('send notification') ||
    lowerDirective.includes('wire') ||
    lowerDirective.includes('create ticket') ||
    lowerDirective.includes('create issue');

  const steps: WorkflowStepDefinition[] = [];

  // Stage 1: COO - Directive Decomposition & Scoping
  steps.push({
    id: 'step-coo-scope',
    name: 'Directive Decomposition & Scoping',
    description: 'Deconstruct founder directive into strategic boundaries, KPIs, and specialist delegation parameters.',
    assignedRole: 'coo',
    skill: 'directive_decomposition',
    dependencies: [],
    inputReferences: ['directive'],
    outputReferences: ['cooScope', 'decompositionPlan'],
    sideEffectClassification: 'read_only',
    requiresApproval: false,
    retryPolicy: { maxRetries: 2, backoffMultiplier: 1.5, initialDelayMs: 500 },
  });

  // Stage 2: Researcher - Market & Technical Reconnaissance
  steps.push({
    id: 'step-research',
    name: 'Market & Technical Reconnaissance',
    description: 'Conduct market reconnaissance, technical feasibility analysis, and external repository intelligence.',
    assignedRole: 'researcher',
    skill: isGitHubRequested ? 'software_repository_research' : 'competitor_analysis',
    dependencies: ['step-coo-scope'],
    inputReferences: ['cooScope'],
    outputReferences: ['researchFindings', 'market_intelligence_brief'],
    sideEffectClassification: 'read_only',
    requiresApproval: false,
    targetContext: isGitHubRequested ? { targetSystem: 'github' } : undefined,
    retryPolicy: { maxRetries: 2, backoffMultiplier: 1.5, initialDelayMs: 500 },
  });

  // Stage 3: Finance - Unit Economics & Financial Audit (Runs concurrently with Researcher)
  steps.push({
    id: 'step-finance',
    name: 'Unit Economics & Financial Audit',
    description: 'Stress-test cost structures, gross margin viability (>80%), token burn, and capital requirements.',
    assignedRole: 'finance',
    skill: 'financial_model',
    dependencies: ['step-coo-scope'],
    inputReferences: ['cooScope'],
    outputReferences: ['financeAssessment', 'unit_economics'],
    sideEffectClassification: 'read_only',
    requiresApproval: false,
    retryPolicy: { maxRetries: 2, backoffMultiplier: 1.5, initialDelayMs: 500 },
  });

  // Stage 4: PM - Product Architecture & PRD (Fan-in: depends on both Research & Finance)
  steps.push({
    id: 'step-pm-prd',
    name: 'Product Architecture & PRD Authoring',
    description: 'Author functional specifications, edge cases, user personas, and technical architecture based on research & financial boundaries.',
    assignedRole: 'pm',
    skill: 'prd_creation',
    dependencies: ['step-research', 'step-finance'],
    inputReferences: ['researchFindings', 'financeAssessment'],
    outputReferences: ['productSpecs', 'prd'],
    sideEffectClassification: 'read_only',
    requiresApproval: false,
    retryPolicy: { maxRetries: 2, backoffMultiplier: 1.5, initialDelayMs: 500 },
  });

  // Stage 5: Verification - Constitutional & Security Verification
  steps.push({
    id: 'step-verification',
    name: 'Constitutional & Security Verification',
    description: 'Audit specialist deliverables against non-negotiable constitutional invariants (80%+ gross margin floor, zero credential leakage, safe sandboxing).',
    assignedRole: 'coo',
    skill: 'compliance_verification',
    dependencies: ['step-pm-prd'],
    inputReferences: ['productSpecs', 'financeAssessment', 'researchFindings'],
    outputReferences: ['verificationResult'],
    sideEffectClassification: 'read_only',
    requiresApproval: false,
    retryPolicy: { maxRetries: 1, backoffMultiplier: 1, initialDelayMs: 500 },
  });

  // Stage 6: Executive Synthesis & Briefing
  steps.push({
    id: 'step-synthesis-report',
    name: 'Executive Synthesis & Founder Briefing',
    description: 'Synthesize specialist deliverables, key trade-offs, roadmap milestones, and strategic recommendations for Founder decision.',
    assignedRole: 'coo',
    skill: 'executive_synthesis',
    dependencies: ['step-verification'],
    inputReferences: ['verificationResult', 'productSpecs', 'financeAssessment', 'researchFindings'],
    outputReferences: ['executiveReport', 'summary'],
    sideEffectClassification: 'read_only',
    requiresApproval: false,
    retryPolicy: { maxRetries: 2, backoffMultiplier: 1.5, initialDelayMs: 500 },
  });

  // Stage 7: Optional Side-Effect Step (High-risk external mutation requiring Founder wet signature)
  if (isSideEffectRequested) {
    let classification: SideEffectClassification = 'external_communication';
    if (lowerDirective.includes('transfer') || lowerDirective.includes('wire')) {
      classification = 'financial_transfer';
    } else if (lowerDirective.includes('create') || lowerDirective.includes('mutate')) {
      classification = 'external_mutation';
    }

    steps.push({
      id: 'step-side-effect',
      name: options?.sideEffectTarget?.action || 'Execute Side Effect Action',
      description: 'High-risk external operation requiring explicit Founder wet signature.',
      assignedRole: 'coo',
      skill: 'system_execute',
      dependencies: ['step-synthesis-report'],
      inputReferences: ['executiveReport'],
      outputReferences: ['sideEffectReceipt'],
      sideEffectClassification: classification,
      requiresApproval: true,
      targetContext: options?.sideEffectTarget || {
        targetSystem: classification === 'financial_transfer' ? 'stripe' : 'resend',
      },
      retryPolicy: { maxRetries: 1, backoffMultiplier: 1, initialDelayMs: 500 },
    });
  }

  return {
    id: workflowId,
    name: `Directive: ${directive.slice(0, 45)}...`,
    objective: directive,
    version: '1.0.0',
    steps,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Converts a completed or in-progress Workflow Instance into an authoritative OrchestrationRun.
 * Preserves 100% schema compatibility with the UI Cockpit, API routes, and existing test suites.
 */
export function synthesizeOrchestrationRunFromWorkflow(
  instance: WorkflowInstanceState,
  definition: WorkflowDefinition,
  originalDirective: string
): OrchestrationRun {
  const runId = instance.instanceId;
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const nowIso = new Date().toISOString();

  const planItems: ExecutionPlanItem[] = [];
  const deliverables: ExecutionDeliverable[] = [];
  const messages: ExecutionMessage[] = [];

  let stageIndex = 1;

  for (const stepDef of definition.steps) {
    const stepState = instance.stepStates[stepDef.id] || {
      stepId: stepDef.id,
      status: 'pending',
      assignedRole: stepDef.assignedRole,
      skill: stepDef.skill,
      outputs: {},
      evidenceReferences: [],
    };

    let mappedStatus: ExecutionPlanItem['status'] = 'pending';
    if (stepState.status === 'completed') {
      mappedStatus = 'done';
    } else if (stepState.status === 'running') {
      mappedStatus = 'in_progress';
    } else if (stepState.status === 'awaiting_approval') {
      mappedStatus = 'requires_approval';
    } else if (stepState.status === 'failed') {
      mappedStatus = 'failed';
    } else if (stepState.status === 'cancelled') {
      mappedStatus = 'skipped';
    }

    const protocolStep = mapSkillToProtocolStep(stepDef.skill);

    const skillResult = determineSkillForTask({
      title: stepDef.name,
      protocolStep,
      directive: originalDirective,
    }, stepDef.assignedRole);

    planItems.push({
      stage: stageIndex++,
      title: stepDef.name,
      agentId: stepDef.assignedRole,
      protocolStep,
      status: mappedStatus,
      outputSnippet: 
        stepState.outputs?.statusMessage || 
        stepState.outputs?.summary || 
        (stepState.outputs?.result ? `${String(stepState.outputs.result).slice(0, 140)}...` : undefined),
      provenance: stepState.outputs?.provenance,
      selectedSkill: skillResult.selectedSkill,
      retrievedContext: stepState.outputs?.retrievedContext,
      toolEvidence: stepState.outputs?.toolEvidence,
    });

    // Synthesize messages
    if (stepState.outputs?.statusMessage) {
      messages.push({
        id: `msg-${stepDef.id}-status`,
        sender: stepDef.assignedRole,
        text: stepState.outputs.statusMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: stepState.status === 'awaiting_approval' ? 'approval_request' : 'status',
        protocolStep,
        provenance: stepState.outputs?.provenance,
        retrievedContext: stepState.outputs?.retrievedContext,
      });
    }

    // Synthesize deliverables
    if (stepDef.id === 'step-research' && (stepState.outputs?.result || stepState.outputs?.toolIntelBrief)) {
      const isGitHub = Boolean(stepState.outputs?.toolEvidence);
      deliverables.push({
        id: `deliv-${stepDef.id}`,
        name: isGitHub 
          ? 'Repository Intelligence & Technical Reconnaissance Brief' 
          : 'Market Intelligence & Technical Reconnaissance Brief',
        owner: 'Dr. Aris Thorne (Lead AI Researcher)',
        authorAgentId: 'researcher',
        authorName: 'Dr. Aris Thorne',
        type: 'research',
        protocolStep: 'research',
        content: String(stepState.outputs?.toolIntelBrief || stepState.outputs?.result),
        provenance: stepState.outputs?.provenance,
        updatedAt: nowIso,
      });
    } else if (stepDef.id === 'step-pm-prd' && stepState.outputs?.result) {
      deliverables.push({
        id: `deliv-${stepDef.id}`,
        name: 'Product Requirements Document (PRD)',
        owner: 'Maya Lin (Principal PM)',
        authorAgentId: 'pm',
        authorName: 'Maya Lin',
        type: 'spec',
        protocolStep: 'build_execute',
        content: String(stepState.outputs.result),
        provenance: stepState.outputs?.provenance,
        updatedAt: nowIso,
      });
    } else if (stepDef.id === 'step-finance' && stepState.outputs?.result) {
      deliverables.push({
        id: `deliv-${stepDef.id}`,
        name: 'Financial Model & Unit Economics Assessment',
        owner: 'Julian Cruz (VP Finance)',
        authorAgentId: 'finance',
        authorName: 'Julian Cruz',
        type: 'financial',
        protocolStep: 'test',
        content: String(stepState.outputs.result),
        provenance: stepState.outputs?.provenance,
        updatedAt: nowIso,
      });
    } else if (stepDef.id === 'step-synthesis-report' && stepState.outputs?.result) {
      deliverables.push({
        id: `deliv-${stepDef.id}`,
        name: 'Executive Strategy & Roadmap Brief',
        owner: 'Sophia Vance (COO)',
        authorAgentId: 'coo',
        authorName: 'Sophia Vance',
        type: 'report',
        protocolStep: 'report',
        content: String(stepState.outputs.result),
        provenance: stepState.outputs?.provenance,
        updatedAt: nowIso,
      });
    }
  }

  // Extract or evaluate verification result
  let verificationResult: VerificationResult | undefined;
  const verifyStep = instance.stepStates['step-verification'];
  if (verifyStep?.outputs?.verificationResult) {
    verificationResult = verifyStep.outputs.verificationResult;
  } else {
    verificationResult = ConstitutionalVerifier.verify({
      directive: originalDirective,
      deliverables,
      specialistOutputs: {
        coo: instance.stepStates['step-coo-scope']?.outputs?.result,
        researcher: instance.stepStates['step-research']?.outputs?.result,
        pm: instance.stepStates['step-pm-prd']?.outputs?.result,
        finance: instance.stepStates['step-finance']?.outputs?.result,
      },
    });
  }

  // Determine overall status
  let runStatus: OrchestrationRun['status'] = 'running';
  if (instance.status === 'completed') {
    runStatus = 'completed';
  } else if (instance.status === 'awaiting_approval') {
    runStatus = 'requires_approval';
  } else if (instance.status === 'failed') {
    runStatus = 'failed';
  } else if (instance.status === 'cancelled') {
    runStatus = 'failed';
  }

  // If verification failed, fail the run per Constitutional Invariants
  if (verificationResult && !verificationResult.isCompliant) {
    runStatus = 'failed';
  }

  const hasExternalEvidence = Boolean(instance.stepStates['step-research']?.outputs?.toolEvidence);

  // Synthesize FounderExecutiveResult
  const executiveResult: FounderExecutiveResult = {
    executionOutcome: 
      verificationResult && !verificationResult.isCompliant
        ? 'verification_rejected'
        : instance.status === 'completed'
        ? 'autonomous_execution_certified'
        : instance.status === 'awaiting_approval'
        ? 'awaiting_founder_decision'
        : instance.status === 'failed'
        ? 'failed'
        : 'success',
    verificationStatus: verificationResult?.isCompliant ? 'passed' : 'failed',
    summary: 
      instance.stepStates['step-synthesis-report']?.outputs?.summary ||
      `Orchestration DAG processed across ${Object.keys(instance.stepStates).length} stages for directive: "${originalDirective}".`,
    decisionsRequired: instance.status === 'awaiting_approval' ? [
      {
        id: `dec-${Date.now()}`,
        title: 'Authorize High-Risk Side Effect Operation',
        category: 'Governance',
        recommendedBy: 'Sophia Vance (COO)',
        urgency: 'high',
        status: 'pending_ratification',
        description: 'Founder signature required to execute pending external side-effect step.',
      }
    ] : [],
    evidenceAvailability: {
      hasProvenance: true,
      evidenceCount: hasExternalEvidence ? 2 : 1,
      primaryBasis: hasExternalEvidence ? 'external_evidence' : 'unverified',
    },
    kpisProjected: [
      { name: 'Gross Margin Floor', target: '>= 80%', baseline: '84%', timeline: 'Immediate' },
      { name: 'Execution Latency', target: '< 60s', baseline: 'Live DAG', timeline: 'Current Run' },
    ],
  };

  const finalReport = instance.stepStates['step-synthesis-report']?.outputs?.result || undefined;

  return {
    id: runId,
    directive: originalDirective,
    timestamp,
    status: runStatus,
    currentProtocolStep: 'report',
    protocolProgress: {
      understand: 'completed',
      plan: 'completed',
      research: 'completed',
      build_execute: 'completed',
      test: 'completed',
      verify: verificationResult?.isCompliant ? 'completed' : 'pending',
      report: runStatus === 'completed' ? 'completed' : 'pending',
    },
    liveAi: true,
    modelUsed: 'gemini-2.5-flash',
    title: `Autonomous Multi-Agent Mission: ${originalDirective.slice(0, 45)}...`,
    summary: executiveResult.summary,
    plan: planItems,
    messages,
    deliverables,
    finalExecutiveReport: finalReport,
    executiveResult,
    verificationResult,
    executionSummary: {
      totalAgentsInvoked: 4,
      agentsInvoked: ['coo', 'researcher', 'pm', 'finance'],
      totalTasksExecuted: Object.keys(instance.stepStates).length,
      executionMode: 'multi_agent_orchestrated',
    },
    workflowInstanceId: instance.instanceId,
  };
}

function mapSkillToProtocolStep(skill: string): AgentWorkProtocolStep {
  if (skill.includes('understand') || skill.includes('decomposition')) return 'understand';
  if (skill.includes('research') || skill.includes('competitor')) return 'research';
  if (skill.includes('prd') || skill.includes('build') || skill.includes('journey')) return 'build_execute';
  if (skill.includes('finance') || skill.includes('model') || skill.includes('test') || skill.includes('audit')) return 'test';
  if (skill.includes('verify') || skill.includes('compliance')) return 'verify';
  if (skill.includes('synthesis') || skill.includes('report')) return 'report';
  return 'plan';
}
