'use client';

import {
  EmployeeCollaborationState,
  CollaborationStep,
  CollaborationDialogue,
  DelegatedSubTask,
  OrchestratorMediation,
  CollaborationMissionPreset,
  ProductFeature,
  ResearchTopic,
  CompanyDecision,
  CompanyMemory,
  AgentRole,
} from '@/types/os';
import { GovernanceStore } from '@/lib/governance-store';
import { dispatchOSNotification, playOSSound } from '@/components/os/IconHelper';
import { SystemActivityStore } from '@/lib/system-activity-store';

export const COLLABORATION_PRESETS: CollaborationMissionPreset[] = [
  {
    id: 'memory-tier',
    title: 'Autonomous Real-Time Memory Tier',
    category: 'Architecture',
    directive: 'Product Manager requests market analysis from Researcher, who consults Finance for unit economics budget constraints before delivering verified findings.',
    initialLead: 'pm',
    description: 'Deploys a sub-120ms neural context tier while locking compute burn under $0.038/op.',
  },
  {
    id: 'eu-expansion',
    title: 'European Enterprise Expansion & Data Residency',
    category: 'Expansion',
    directive: 'COO directs Researcher to map EU sovereign cloud compliance (GDPR/AI Act), Finance models local data center margins, and PM drafts localized deployment specs.',
    initialLead: 'coo',
    description: 'Cross-functional alignment on sovereign EU tenant isolation and latency SLAs.',
  },
  {
    id: 'pricing-rebalance',
    title: 'Self-Serve Pricing & Token Burn Optimization',
    category: 'Pricing',
    directive: 'Finance models tiered self-serve pricing for 250 enterprise seats; Researcher benchmarks competitor credit burns; PM specs billing enforcement UX.',
    initialLead: 'finance',
    description: 'Balances 84.2% gross margin targets with smooth, friction-free customer conversion.',
  },
  {
    id: 'developer-onboarding',
    title: 'Autonomous 3-Click Developer Onboarding Flow',
    category: 'Growth',
    directive: 'PM specs frictionless API key issuance and SDK sandboxes; Researcher evaluates developer drop-off; Finance models free-tier token allowances.',
    initialLead: 'pm',
    description: 'Eliminates developer friction while containing free-tier compute exposure.',
  },
];

const DEFAULT_SUBTASKS: DelegatedSubTask[] = [
  {
    id: 'subtask-mem-1',
    title: 'Empirical Latency Benchmarks & Competitor Moat Recon',
    description: 'Measure memory retrieval latency across top agent frameworks and assess architectural moats.',
    assignedBy: 'pm',
    assignedTo: 'researcher',
    status: 'completed',
    priority: 'critical',
    deliverableExpected: 'Market & Technical Recon Dossier',
    deliverableOutput: 'Empirical validation: <120ms latency threshold with 98% market demand score.',
    orchestratorNote: 'Validated under Safe Sandbox constraints.',
    createdAt: '10:40 AM',
    updatedAt: '10:42 AM',
  },
  {
    id: 'subtask-mem-2',
    title: 'Unit Economics & Compute Burn Ceiling Audit',
    description: 'Stress-test pricing model across 250 seats; establish maximum allowable cost per 1,000 vector lookups.',
    assignedBy: 'researcher',
    assignedTo: 'finance',
    status: 'completed',
    priority: 'high',
    deliverableExpected: 'Unit Economics Constraint Model',
    deliverableOutput: 'Hard ceiling established at $0.038 per 1k operations; 84.2% gross margin floor.',
    orchestratorNote: 'Requires two-tier LRU semantic cache in architecture.',
    createdAt: '10:42 AM',
    updatedAt: '10:43 AM',
  },
  {
    id: 'subtask-mem-3',
    title: 'PRD Specification & Sprint 15 Acceptance Criteria',
    description: 'Synthesize research memo and financial guardrails into production-ready PRD.',
    assignedBy: 'coo',
    assignedTo: 'pm',
    status: 'completed',
    priority: 'critical',
    deliverableExpected: 'Approved PRD (PRD-2026-MEM)',
    deliverableOutput: 'Feature ratified with 100% specification readiness; added to Sprint 15 backlog.',
    orchestratorNote: 'Reconciled UX latency requirements with financial margin constraints.',
    createdAt: '10:44 AM',
    updatedAt: '10:45 AM',
  },
];

const DEFAULT_MEDIATIONS: OrchestratorMediation[] = [
  {
    id: 'med-mem-1',
    disputeOrFriction:
      'Product Manager requested unbounded real-time vector re-indexing for instantaneous user feel, while Finance Analyst enforced strict compute burn ceilings.',
    agentsInvolved: ['pm', 'finance'],
    orchestratorRuling:
      'Sophia Vance arbitrated: Authorize two-tier LRU semantic caching with speculative pre-fetching. Preserves sub-100ms user responsiveness while keeping token spend capped at $0.038/op.',
    compromiseStrategy:
      'Tiered storage: Active session context kept in local memory; persistent retrieval routed via quantized embedding models.',
    slaImpact: '0ms added latency; 84.2% gross margin guaranteed.',
    timestamp: '10:43 AM',
  },
];

// Default initial artifacts produced by the collaboration
const DEFAULT_ARTIFACTS = {
  feature: {
    id: 'feat-collab-mem-1',
    title: 'Autonomous Real-Time Memory Tier',
    category: 'Core OS' as const,
    status: 'In Progress' as const,
    owner: 'Maya Lin (in collab with Dr. Thorne & Julian Cruz)',
    priority: 'Critical' as const,
    completion: 100,
    description:
      'Sub-100ms persistent neural memory bus with deterministic $0.038/op compute cap and 84.2% gross margin floor.',
  },
  prdSnippet: `## Product Requirements Document: Autonomous Real-Time Memory Tier
**Author:** Maya Lin (Principal PM)  
**Collaborators:** Dr. Aris Thorne (Lead Researcher), Julian Cruz (Chief Financial Analyst)  
**Orchestration Lead:** Sophia Vance (COO)  
**Status:** Approved for Sprint Backlog (Sprint 15)

### 1. Strategic Rationale & Market Validation (Dr. Aris Thorne)
- Competitive recon indicates enterprise customers abandon single-agent frameworks due to context amnesia across multi-step execution.
- Benchmark: Competing solutions suffer 650ms+ latency and unmitigated token inflation.
- SamJuniors OS provides sub-120ms recall using speculative embedding caching.

### 2. Financial Guardrails & Unit Economics (Julian Cruz)
- **Hard Compute Ceiling:** ≤ $0.038 per 1,000 vector memory lookups.
- **Target Gross Margin:** 84.2% minimum floor.
- **Projected ARR Contribution:** +$380,000 across 250 enterprise seats at $299/mo.
- **Mitigation:** Two-tier LRU semantic caching to prevent un-cached vector compute spikes.

### 3. Architecture & Functional Acceptance Criteria
- **AC-1:** Sub-100ms bidirectional context retrieval between PM, Research, and Finance agents.
- **AC-2:** Dynamic token burn breaker automatically alerts Julian if compute ratio exceeds 16%.
- **AC-3:** Zero external data leakage; enforced within Safe Mock execution boundaries.`,
  researchTopic: {
    id: 'res-collab-mem-1',
    title: 'Enterprise Agent Memory & Latency: Market Recon & Competitive Threat Analysis',
    category: 'Market Intel',
    confidence: 98,
    impact: 'Transformative' as const,
    date: 'Just now',
    author: 'Dr. Aris Thorne (Lead Researcher)',
    summary:
      'Commissioned by Maya Lin (PM). Verified demand for zero-loss memory tiers across enterprise AI workforces. Consulted Julian Cruz to establish $0.038 compute cost threshold before finalizing technical recommendations.',
    tags: ['Agent Memory', 'Competitive Recon', 'Unit Economics Verified'],
    evidence: {
      basis: 'calculation' as const,
      facts: [
        'Enterprise customers demand sub-120ms agent memory recall',
        'Un-cached embedding lookup costs exceed $0.12/op at unthrottled API rates',
        'Tiered semantic caching bounds compute expenditure to $0.038/op',
      ],
      inferences: [
        'Autonomous memory will increase platform stickiness and reduce churn by ~34%',
      ],
      sources: ['Internal benchmark suite', 'Competitor public API latency documentation'],
      status: 'verified',
    },
  },
  financialGuardrail: {
    initiative: 'Autonomous Real-Time Memory Tier',
    maxComputeCostPer1kOps: '$0.038',
    targetGrossMargin: '84.2%',
    projectedAnnualArr: '+$380,000',
    cachingStrategy: 'Two-tier LRU Semantic Cache with SLM routing',
    signOffDate: 'Today',
  },
  decision: {
    id: 'dec-collab-mem-1',
    title: 'Ratify Autonomous Real-Time Memory Tier Architecture & Financial Budget',
    status: 'approved' as const,
    category: 'Strategic' as const,
    recommendedBy: 'Executive Council (Maya Lin, Dr. Thorne, Julian Cruz, Sophia Vance)',
    agentId: 'coo' as const,
    recommendation:
      'Authorize immediate inclusion of Autonomous Real-Time Memory Tier into Sprint 15 with bounded compute expenditure capped at $0.038/op.',
    businessImpact:
      'Unlocks transformative enterprise retention while maintaining strict >80% gross margin targets.',
    evidenceSummary:
      'Empirical market recon by Dr. Thorne + deterministic unit economics model audited by Julian Cruz.',
    date: 'Today',
    founderApprovalRequired: false,
  },
  companyMemory: {
    id: 'mem-collab-mem-1',
    decisionId: 'dec-collab-mem-1',
    approvedAction:
      'Incorporate Autonomous Real-Time Memory Tier into Sprint 15 under $0.038 compute cap and 84.2% margin floor.',
    executionOutcome: 'completed',
    evidenceReferences: [
      'Empirical market recon by Dr. Thorne + deterministic unit economics model audited by Julian Cruz.',
    ],
    epistemicConfidence: 'verified_fact' as const,
    timestamp: new Date().toISOString(),
  },
};

const COLLABORATION_STEPS: CollaborationStep[] = [
  {
    id: 'collab-step-1',
    stepNumber: 1,
    title: 'Product Manager Initiates Market Feasibility Request',
    protocolStep: 'understand',
    initiatingAgent: 'pm',
    targetAgent: 'researcher',
    description:
      'Maya Lin (PM) drafts a strategic cross-functional request for Dr. Aris Thorne (Research) to conduct market recon and competitive analysis for a new "Autonomous Real-Time Memory Tier".',
    status: 'pending',
    timestamp: '10:40 AM',
    dialogue: {
      id: 'diag-1',
      from: 'pm',
      fromName: 'Maya Lin (Principal PM)',
      to: 'researcher',
      toName: 'Dr. Aris Thorne (Lead Researcher)',
      intent: 'delegate_subtask',
      subtask: DEFAULT_SUBTASKS[0],
      message:
        'Dr. Thorne: We are scoping the Autonomous Real-Time Memory Tier for Sprint 15. Can you run competitive intelligence and technical feasibility recon? We need to know latency tolerances and architectural moats.',
      timestamp: '10:40 AM',
      protocolStep: 'understand',
      attachment: {
        title: 'Initial Initiative Brief: Project Synapse-Memory',
        type: 'prd',
        appTarget: 'products',
        snippet: 'Goal: Sub-120ms shared memory context across all executive agents.',
      },
    },
    affectedApp: 'products',
    outputArtifact: 'Initiative Brief registered in Product Strategy queue.',
    subtask: DEFAULT_SUBTASKS[0],
  },
  {
    id: 'collab-step-2',
    stepNumber: 2,
    title: 'COO & Orchestrator Routes Task with Constitutional Verification',
    protocolStep: 'plan',
    initiatingAgent: 'coo',
    targetAgent: 'researcher',
    description:
      'Sophia Vance (COO) validates the directive within Safe Sandbox bounds, logs the multi-agent task into the executive execution queue, and authorizes Dr. Thorne to initiate research.',
    status: 'pending',
    timestamp: '10:41 AM',
    dialogue: {
      id: 'diag-2',
      from: 'coo',
      fromName: 'Sophia Vance (Chief Operating Officer)',
      to: 'researcher',
      toName: 'Dr. Aris Thorne (Lead Researcher)',
      intent: 'delegate_subtask',
      message:
        '[Orchestration Kernel] Directive validated under Safe Sandbox constraints. Task assigned to Dr. Thorne with priority: Critical. Please coordinate with Julian Cruz (Finance) for unit economics before finalizing specs.',
      timestamp: '10:41 AM',
      protocolStep: 'plan',
      attachment: {
        title: 'Orchestration Routing Ticket #CR-904',
        type: 'governance_record',
        appTarget: 'workforce',
        snippet: 'Protocol Stage: Research -> Analyze -> Test (Finance) -> Build (PRD).',
      },
    },
    affectedApp: 'workforce',
    outputArtifact: 'Multi-agent orchestration pipeline activated.',
  },
  {
    id: 'collab-step-3',
    stepNumber: 3,
    title: 'Researcher Uncovers High-Frequency Compute Risk & Consults Finance',
    protocolStep: 'research',
    initiatingAgent: 'researcher',
    targetAgent: 'finance',
    description:
      'Dr. Aris Thorne completes market recon. Enterprise demand is high, but real-time vector indexing could trigger exponential token spend. Thorne reaches out to Julian Cruz (Finance) for budget constraints.',
    status: 'pending',
    timestamp: '10:42 AM',
    dialogue: {
      id: 'diag-3',
      from: 'researcher',
      fromName: 'Dr. Aris Thorne (Lead Researcher)',
      to: 'finance',
      toName: 'Julian Cruz (Chief Financial Analyst)',
      intent: 'share_information',
      subtask: DEFAULT_SUBTASKS[1],
      message:
        'Julian: Market recon confirms massive enterprise demand (<120ms recall needed). However, continuous vector re-indexing risks ballooning our inference burn. What is our hard compute ceiling and gross margin floor for this feature?',
      timestamp: '10:42 AM',
      protocolStep: 'research',
      attachment: {
        title: 'Preliminary Market Reconnaissance Memo',
        type: 'research_brief',
        appTarget: 'research',
        snippet: 'Demand score: 98/100. Latency threshold: 120ms. Risk: Uncapped vector queries.',
      },
    },
    affectedApp: 'research',
    outputArtifact: 'Market analysis complete; financial audit requested.',
    subtask: DEFAULT_SUBTASKS[1],
  },
  {
    id: 'collab-step-4',
    stepNumber: 4,
    title: 'Finance Analyst Stress-Tests Unit Economics & Sets Hard Budget Caps',
    protocolStep: 'test',
    initiatingAgent: 'finance',
    targetAgent: 'researcher',
    description:
      'Julian Cruz models unit economics and compute burn. He locks in a hard ceiling of $0.038 per 1,000 operations, an 84.2% gross margin floor, and mandates tiered LRU caching.',
    status: 'pending',
    timestamp: '10:43 AM',
    dialogue: {
      id: 'diag-4',
      from: 'finance',
      fromName: 'Julian Cruz (Chief Financial Analyst)',
      to: 'researcher',
      toName: 'Dr. Aris Thorne (Lead Researcher)',
      intent: 'status_update',
      subtask: DEFAULT_SUBTASKS[1],
      message:
        'Dr. Thorne: I stress-tested our pricing model across 250 enterprise seats ($299/mo). To maintain our strict >80% gross margin target, compute cost MUST NOT exceed $0.038 per 1,000 operations. I mandate a two-tier LRU semantic cache to buffer vector queries.',
      timestamp: '10:43 AM',
      protocolStep: 'test',
      attachment: {
        title: 'Financial Unit Economics Guardrail Model',
        type: 'budget_constraint',
        appTarget: 'finance',
        snippet: 'Max compute: $0.038/1k ops | Target Gross Margin: 84.2% | ARR: +$380k.',
      },
    },
    affectedApp: 'finance',
    outputArtifact: 'Financial unit economics constraints ratified.',
    subtask: DEFAULT_SUBTASKS[1],
  },
  {
    id: 'collab-step-5',
    stepNumber: 5,
    title: 'Researcher Synthesizes Market Memo with Finance Guardrails & Delivers to PM',
    protocolStep: 'analyze',
    initiatingAgent: 'researcher',
    targetAgent: 'pm',
    description:
      'Dr. Aris Thorne synthesizes the completed Market & Technical Feasibility Brief, embedding Julian Cruz\'s budget constraints, and officially delivers findings to Maya Lin.',
    status: 'pending',
    timestamp: '10:44 AM',
    dialogue: {
      id: 'diag-5',
      from: 'researcher',
      fromName: 'Dr. Aris Thorne (Lead Researcher)',
      to: 'pm',
      toName: 'Maya Lin (Principal PM)',
      intent: 'share_information',
      message:
        'Maya: Market reconnaissance and financial audit are complete! We validated high enterprise moat potential. We incorporated Julian\'s mandatory $0.038/op compute cap and two-tier caching architecture into the verified dossier.',
      timestamp: '10:44 AM',
      protocolStep: 'analyze',
      attachment: {
        title: 'Finalized Market & Feasibility Dossier',
        type: 'research_brief',
        appTarget: 'research',
        snippet: 'Confidence: 98% • Transformative • Audited by Julian Cruz for Maya Lin.',
      },
    },
    affectedApp: 'research',
    outputArtifact: 'Market Feasibility Dossier published to Research App.',
  },
  {
    id: 'collab-step-6',
    stepNumber: 6,
    title: 'Product Manager Authors Formal PRD & Updates Autonomous Roadmap',
    protocolStep: 'build_execute',
    initiatingAgent: 'pm',
    targetAgent: 'council',
    description:
      'Maya Lin approves the research findings and financial guardrails, publishes the formal PRD, and promotes the Autonomous Real-Time Memory Tier into Sprint 15 and the Product Roadmap.',
    status: 'pending',
    timestamp: '10:45 AM',
    dialogue: {
      id: 'diag-6',
      from: 'pm',
      fromName: 'Maya Lin (Principal PM)',
      to: 'council',
      toName: 'Executive Council & Founder',
      intent: 'status_update',
      subtask: DEFAULT_SUBTASKS[2],
      message:
        'Council & Founder: Formal PRD (PRD-2026-MEM) has been published! Feature added to Sprint 15 backlog with 100% specification readiness. All acceptance criteria reflect Dr. Thorne\'s latency benchmarks and Julian\'s $0.038 compute cap.',
      timestamp: '10:45 AM',
      protocolStep: 'build_execute',
      attachment: {
        title: 'Approved PRD: Autonomous Real-Time Memory Tier',
        type: 'prd',
        appTarget: 'products',
        snippet: 'Sprint 15 Ready • Author: Maya Lin • Financial Sign-Off: Julian Cruz.',
      },
    },
    affectedApp: 'products',
    outputArtifact: 'Feature added to Roadmap & Sprint Board; PRD generated.',
    subtask: DEFAULT_SUBTASKS[2],
  },
  {
    id: 'collab-step-7',
    stepNumber: 7,
    title: 'COO Ratifies Governance Decision & Durably Enters Company Memory',
    protocolStep: 'report',
    initiatingAgent: 'coo',
    targetAgent: 'council',
    description:
      'Sophia Vance verifies constitutional SLA, ratifies the cross-functional initiative into the Company Governance Decision Log, records it into durable Company Memory, and alerts the Founder.',
    status: 'pending',
    timestamp: '10:46 AM',
    dialogue: {
      id: 'diag-7',
      from: 'coo',
      fromName: 'Sophia Vance (Chief Operating Officer)',
      to: 'council',
      toName: 'Company HQ & Founder',
      intent: 'orchestrator_mediation',
      mediation: DEFAULT_MEDIATIONS[0],
      message:
        '[Executive Council Ratification & Orchestrator Sign-off] The cross-functional initiative has been fully verified and executed across Product, Research, and Finance. Trade-offs between memory latency and compute burn reconciled via two-tier semantic caching. Ratification recorded into Company Governance and durable organizational memory.',
      timestamp: '10:46 AM',
      protocolStep: 'report',
      attachment: {
        title: 'Ratified Decision: Autonomous Real-Time Memory Tier',
        type: 'governance_record',
        appTarget: 'workforce',
        snippet: 'Ratified by Sophia Vance • Logged to Durable Company Memory.',
      },
    },
    affectedApp: 'workforce',
    outputArtifact: 'Decision ratified, Company Memory established, Founder notified.',
    mediation: DEFAULT_MEDIATIONS[0],
  },
];

let collaborationState: EmployeeCollaborationState = {
  id: 'collab-flow-001',
  title: 'Cross-Functional Feasibility: Real-Time Autonomous Memory Tier',
  directive:
    'Product Manager requests market analysis from Researcher, who consults Finance for unit economics budget constraints before delivering verified findings.',
  status: 'idle',
  currentStepIndex: 0,
  steps: JSON.parse(JSON.stringify(COLLABORATION_STEPS)),
  allDialogues: [],
  delegatedTasks: JSON.parse(JSON.stringify(DEFAULT_SUBTASKS)),
  mediations: JSON.parse(JSON.stringify(DEFAULT_MEDIATIONS)),
  artifacts: DEFAULT_ARTIFACTS,
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      console.error('[CollaborationStore] listener error:', e);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('samjuniors-collaboration-updated', {
        detail: collaborationState,
      })
    );
  }
}

export const CollaborationStore = {
  getState(): EmployeeCollaborationState {
    return collaborationState;
  },

  getSteps(): CollaborationStep[] {
    return collaborationState.steps;
  },

  getDelegatedTasks(): DelegatedSubTask[] {
    return collaborationState.delegatedTasks || [];
  },

  getMediations(): OrchestratorMediation[] {
    return collaborationState.mediations || [];
  },

  getCurrentStep(): CollaborationStep | undefined {
    return collaborationState.steps[collaborationState.currentStepIndex];
  },

  isCompleted(): boolean {
    return collaborationState.status === 'completed';
  },

  isRunning(): boolean {
    return collaborationState.status === 'running';
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Reset collaboration to initial state
   */
  reset(): void {
    collaborationState = {
      id: `collab-flow-${Date.now()}`,
      title: 'Cross-Functional Feasibility: Real-Time Autonomous Memory Tier',
      directive:
        'Product Manager requests market analysis from Researcher, who consults Finance for unit economics budget constraints before delivering verified findings.',
      status: 'idle',
      currentStepIndex: 0,
      steps: JSON.parse(JSON.stringify(COLLABORATION_STEPS)),
      allDialogues: [],
      delegatedTasks: JSON.parse(JSON.stringify(DEFAULT_SUBTASKS)),
      mediations: JSON.parse(JSON.stringify(DEFAULT_MEDIATIONS)),
      artifacts: DEFAULT_ARTIFACTS,
    };
    SystemActivityStore.endTask('collab-sim');
    notify();
  },

  /**
   * Load a preset collaboration mission
   */
  loadPreset(presetId: string): void {
    const preset = COLLABORATION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    this.reset();
    collaborationState.title = preset.title;
    collaborationState.directive = preset.directive;
    notify();
  },

  /**
   * Initiate dynamic custom collaboration mission via server API or local fallback
   */
  async initiateCustomMission(directive: string): Promise<void> {
    const cleanDir = directive.trim();
    if (!cleanDir) return;

    collaborationState.status = 'running';
    collaborationState.title = `Mission: ${cleanDir.slice(0, 48)}`;
    collaborationState.directive = cleanDir;
    collaborationState.startedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    collaborationState.allDialogues = [];
    collaborationState.currentStepIndex = 0;
    notify();

    try {
      const res = await fetch('/api/agent-collab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directive: cleanDir }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.dialogues && data.dialogues.length > 0) {
          const newSteps: CollaborationStep[] = data.dialogues.map((d: any, idx: number) => ({
            id: `step-dyn-${idx + 1}`,
            stepNumber: idx + 1,
            title: d.outputArtifact || `${d.fromName} → ${d.toName}`,
            protocolStep: d.protocolStep || 'analyze',
            initiatingAgent: d.from,
            targetAgent: d.to,
            description: d.message.slice(0, 120) + '...',
            status: 'pending' as const,
            timestamp: d.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            dialogue: d,
            affectedApp: d.from === 'pm' ? 'products' : d.from === 'finance' ? 'finance' : d.from === 'researcher' ? 'research' : 'workforce',
            outputArtifact: d.outputArtifact || 'Execution milestone registered.',
            subtask: d.subtask,
            mediation: d.mediation,
          }));

          collaborationState.title = data.title || collaborationState.title;
          collaborationState.steps = newSteps;
          collaborationState.delegatedTasks = data.delegatedTasks || [];
          collaborationState.mediations = data.mediations || [];
          notify();
          return;
        }
      }
    } catch (err) {
      console.warn('[CollaborationStore] custom mission API error:', err);
    }

    // Fallback: Use standard steps tailored to directive
    collaborationState.steps = JSON.parse(JSON.stringify(COLLABORATION_STEPS));
    collaborationState.delegatedTasks = JSON.parse(JSON.stringify(DEFAULT_SUBTASKS));
    collaborationState.mediations = JSON.parse(JSON.stringify(DEFAULT_MEDIATIONS));
    notify();
  },

  /**
   * Delegate a sub-task between agents
   */
  delegateSubTask(taskInput: Omit<DelegatedSubTask, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<DelegatedSubTask, 'id' | 'createdAt' | 'updatedAt'>>): DelegatedSubTask {
    if (!collaborationState.delegatedTasks) collaborationState.delegatedTasks = [];
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const fullTask: DelegatedSubTask = {
      id: taskInput.id || `task-sub-${Date.now().toString(36)}`,
      createdAt: taskInput.createdAt || now,
      updatedAt: taskInput.updatedAt || now,
      ...taskInput,
    };
    collaborationState.delegatedTasks.push(fullTask);
    notify();
    return fullTask;
  },

  /**
   * Update the status of an existing sub-task
   */
  updateSubTaskStatus(taskId: string, status: DelegatedSubTask['status'], note?: string): void {
    if (!collaborationState.delegatedTasks) return;
    const task = collaborationState.delegatedTasks.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      task.updatedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (note) task.orchestratorNote = note;
      notify();
    }
  },

  /**
   * Log an orchestrator mediation
   */
  addMediation(mediation: OrchestratorMediation): void {
    if (!collaborationState.mediations) collaborationState.mediations = [];
    collaborationState.mediations.unshift(mediation);
    notify();
  },

  /**
   * Post a direct inter-agent dialogue message
   */
  postInterAgentDialogue(dialogue: CollaborationDialogue): void {
    collaborationState.allDialogues.push(dialogue);
    notify();
  },

  /**
   * Step forward by 1 step
   */
  stepForward(): void {
    if (collaborationState.status === 'completed') {
      SystemActivityStore.endTask('collab-sim');
      return;
    }

    if (collaborationState.status === 'idle') {
      collaborationState.status = 'running';
      collaborationState.startedAt = new Date().toLocaleTimeString();
    }

    const currentIndex = collaborationState.currentStepIndex;
    const currentStep = collaborationState.steps[currentIndex];

    if (!currentStep) return;

    // Track in live heartbeat telemetry
    SystemActivityStore.startTask(
      'collab-sim',
      currentStep.initiatingAgent,
      currentStep.dialogue.fromName,
      currentStep.title
    );

    // Mark current step completed
    currentStep.status = 'completed';
    collaborationState.allDialogues.push(currentStep.dialogue);

    // If step has a subtask, mark it completed or updated
    if (currentStep.subtask && collaborationState.delegatedTasks) {
      const existing = collaborationState.delegatedTasks.find((t) => t.id === currentStep.subtask?.id);
      if (existing) {
        existing.status = 'completed';
        existing.updatedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    // Play sound and trigger notification
    playOSSound('execute');
    dispatchOSNotification({
      title: `Collaboration: Step ${currentStep.stepNumber}/${collaborationState.steps.length}`,
      message: `${currentStep.dialogue.fromName}: "${currentStep.title}"`,
      type: 'agent',
      category: 'ai_employee',
      priority: 'normal',
      agent: currentStep.dialogue.fromName,
      actionable: true,
      actionLabel: `Open ${currentStep.affectedApp}`,
      appTarget: currentStep.affectedApp,
    });

    // Advance
    if (currentIndex < collaborationState.steps.length - 1) {
      collaborationState.currentStepIndex = currentIndex + 1;
      collaborationState.steps[currentIndex + 1].status = 'in_progress';
    } else {
      // Completed all steps!
      collaborationState.status = 'completed';
      collaborationState.completedAt = new Date().toLocaleTimeString();
      SystemActivityStore.endTask('collab-sim');

      // Commit artifacts to Company Governance
      GovernanceStore.addDecision(collaborationState.artifacts.decision);
      GovernanceStore.addIntelligence(collaborationState.artifacts.researchTopic);

      playOSSound('notification');
      dispatchOSNotification({
        title: 'AI Multi-Agent Collaboration Completed',
        message: 'Product Roadmap, Research Radar, and Unit Economics synchronized.',
        type: 'agent',
        category: 'ai_employee',
        priority: 'high',
        agent: 'Executive Orchestrator',
        actionable: true,
        actionLabel: 'Inspect Results',
        appTarget: 'workforce',
      });
    }

    notify();
  },

  /**
   * Run entire simulation automatically with pacing
   */
  async runFullSimulation(speedMs = 1500): Promise<void> {
    if (collaborationState.status === 'running') return;

    this.reset();
    collaborationState.status = 'running';
    collaborationState.startedAt = new Date().toLocaleTimeString();
    if (collaborationState.steps.length > 0) {
      collaborationState.steps[0].status = 'in_progress';
    }
    notify();

    for (let i = 0; i < collaborationState.steps.length; i++) {
      await new Promise((r) => setTimeout(r, speedMs));
      this.stepForward();
    }
  },

  /**
   * Fast-forward / complete instantly
   */
  completeInstantly(): void {
    collaborationState.status = 'completed';
    collaborationState.steps.forEach((s) => (s.status = 'completed'));
    collaborationState.allDialogues = collaborationState.steps.map((s) => s.dialogue);
    if (collaborationState.delegatedTasks) {
      collaborationState.delegatedTasks.forEach((t) => (t.status = 'completed'));
    }
    collaborationState.currentStepIndex = Math.max(0, collaborationState.steps.length - 1);
    collaborationState.completedAt = new Date().toLocaleTimeString();
    SystemActivityStore.endTask('collab-sim');

    GovernanceStore.addDecision(collaborationState.artifacts.decision);
    GovernanceStore.addIntelligence(collaborationState.artifacts.researchTopic);

    playOSSound('notification');
    dispatchOSNotification({
      title: 'AI Collaboration Completed',
      message: 'Product Roadmap, Research Radar, and Unit Economics synchronized.',
      type: 'system',
      agent: 'Executive Orchestrator',
      appTarget: 'workforce',
    });

    notify();
  },
};
