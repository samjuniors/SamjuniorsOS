import {
  AIAgent,
  AgentRole,
  AgentWorkProtocolStep,
  AppMetadata,
  AttentionItem,
  CompanyDecision,
  CompanyInitiative,
  CustomerDeal,
  FinanceMetric,
  OSNotification,
  OrchestrationRun,
  ProductFeature,
  ResearchTopic,
  WindowState,
} from '@/types/os';

// ============================================================================
// 1. OS WINDOW & DESKTOP CONFIGURATION
// ============================================================================

export const INITIAL_WINDOWS: WindowState[] = [
  {
    id: 'workforce',
    title: 'SamJuniors OS — Company Headquarters',
    isOpen: true,
    isMinimized: false,
    isMaximized: false,
    zIndex: 10,
    position: { x: 70, y: 55 },
    size: { width: 1040, height: 680 },
  },
  {
    id: 'company',
    title: 'Company Governance & OKRs',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 9,
    position: { x: 120, y: 80 },
    size: { width: 880, height: 580 },
  },
  {
    id: 'customers',
    title: 'Autonomous CRM & Account Pipeline',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 8,
    position: { x: 140, y: 90 },
    size: { width: 900, height: 580 },
  },
  {
    id: 'research',
    title: 'Market Intel & Research Radar',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 7,
    position: { x: 160, y: 100 },
    size: { width: 900, height: 580 },
  },
  {
    id: 'products',
    title: 'Product Roadmap & PRDs',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 6,
    position: { x: 180, y: 110 },
    size: { width: 900, height: 580 },
  },
  {
    id: 'finance',
    title: 'Finance & Unit Economics Sandbox',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 5,
    position: { x: 200, y: 120 },
    size: { width: 880, height: 580 },
  },
  {
    id: 'settings',
    title: 'OS Settings & Autonomy',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 4,
    position: { x: 220, y: 130 },
    size: { width: 780, height: 540 },
  },
  {
    id: 'terminal',
    title: 'SamJuniors CLI Terminal',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 3,
    position: { x: 240, y: 140 },
    size: { width: 720, height: 480 },
  },
  {
    id: 'advisor',
    title: 'Founder Intelligence',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 11,
    position: { x: 100, y: 70 },
    size: { width: 960, height: 640 },
  },
  {
    id: 'notes',
    title: 'Founder Scratchpad',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 2,
    position: { x: 260, y: 150 },
    size: { width: 680, height: 460 },
  },
  {
    id: 'messages',
    title: 'Messages',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 12,
    position: { x: 130, y: 75 },
    size: { width: 880, height: 580 },
  },
];

export const APPS_CONFIG: AppMetadata[] = [
  {
    id: 'messages',
    name: 'Messages',
    category: 'Direct Comms',
    description: 'Instant direct messaging with AI Officers & Founder Intelligence',
    iconName: 'MessageSquare',
    color: 'from-emerald-500 via-teal-500 to-cyan-600',
    badge: 'Direct DM',
    defaultSize: { width: 880, height: 580 },
  },
  {
    id: 'advisor',
    name: 'Founder Intelligence',
    category: 'Strategic Co-Pilot',
    description: 'Cognitive advisor grounded in company state, unit economics & governance',
    iconName: 'BrainCircuit',
    color: 'from-purple-500 via-indigo-500 to-pink-500',
    badge: 'Grounded AI',
    defaultSize: { width: 960, height: 640 },
  },
  {
    id: 'workforce',
    name: 'Company HQ',
    category: 'Executive Operations',
    description: 'Primary founder command center, employee workforce & company intelligence',
    iconName: 'Building2',
    color: 'from-violet-500 to-indigo-600',
    badge: '4 Active',
    defaultSize: { width: 1040, height: 680 },
  },
  {
    id: 'company',
    name: 'Governance',
    category: 'Constitution & OKRs',
    description: 'Company constitution, strategic OKRs & executive board synthesis',
    iconName: 'Shield',
    color: 'from-blue-500 to-cyan-600',
    defaultSize: { width: 880, height: 600 },
  },
  {
    id: 'customers',
    name: 'Customers',
    category: 'Account Pipeline',
    description: 'Prospect engagements, pipeline review & target account modeling',
    iconName: 'Users',
    color: 'from-emerald-500 to-teal-600',
    badge: '5 Targets',
    defaultSize: { width: 920, height: 600 },
  },
  {
    id: 'research',
    name: 'Research',
    category: 'Market Intelligence',
    description: 'Empirical market recon, model tech radars & competitor briefs',
    iconName: 'Compass',
    color: 'from-amber-500 to-orange-600',
    defaultSize: { width: 900, height: 620 },
  },
  {
    id: 'products',
    name: 'Products',
    category: 'Roadmap & Specs',
    description: 'Product specifications, PRDs & feature backlog',
    iconName: 'Boxes',
    color: 'from-pink-500 to-rose-600',
    defaultSize: { width: 920, height: 620 },
  },
  {
    id: 'finance',
    name: 'Finance',
    category: 'Financial Modeling',
    description: 'Cost modeling, compute attribution & unit economics simulation',
    iconName: 'TrendingUp',
    color: 'from-emerald-400 to-green-600',
    defaultSize: { width: 940, height: 620 },
  },
  {
    id: 'settings',
    name: 'Settings',
    category: 'OS Configuration',
    description: 'Autonomy guardrails, AI model selection & sandbox telemetry',
    iconName: 'Sliders',
    color: 'from-slate-500 to-zinc-700',
    defaultSize: { width: 800, height: 560 },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    category: 'Kernel Shell',
    description: 'SamJuniors OS command shell (sj-cli) for system inspection',
    iconName: 'Terminal',
    color: 'from-zinc-700 to-neutral-900',
    defaultSize: { width: 740, height: 480 },
  },
  {
    id: 'notes',
    name: 'Founder Notes',
    category: 'Executive Scratchpad',
    description: 'Direct thought capture with 1-click dispatch to AI workforce',
    iconName: 'FileEdit',
    color: 'from-amber-400 to-yellow-600',
    defaultSize: { width: 680, height: 520 },
  },
];

// ============================================================================
// 2. 9-STEP AGENT WORK PROTOCOL DEFINITION
// ============================================================================

export interface ProtocolStepInfo {
  key: AgentWorkProtocolStep;
  name: string;
  number: number;
  description: string;
  leadAgent: AgentRole;
  expectedOutput: string;
}

export const AGENT_WORK_PROTOCOL: ProtocolStepInfo[] = [
  {
    key: 'understand',
    number: 1,
    name: 'Understand',
    description: 'Deconstruct Founder directive, define scope, identify constraints & KPIs',
    leadAgent: 'coo',
    expectedOutput: 'Directive Scope & Constraint Spec',
  },
  {
    key: 'research',
    number: 2,
    name: 'Research',
    description: 'Analyze industry landscape, competitor vectors & empirical tech papers',
    leadAgent: 'researcher',
    expectedOutput: 'Market Intelligence Memo',
  },
  {
    key: 'analyze',
    number: 3,
    name: 'Analyze',
    description: 'Risk modeling, technical trade-offs & compute burn sensitivity',
    leadAgent: 'researcher',
    expectedOutput: 'Feasibility & Risk Matrix',
  },
  {
    key: 'plan',
    number: 4,
    name: 'Plan',
    description: 'Decompose into parallel sub-tasks & inter-agent delivery schedule',
    leadAgent: 'coo',
    expectedOutput: 'Execution Graph & Task Queue',
  },
  {
    key: 'build_execute',
    number: 5,
    name: 'Build / Execute',
    description: 'Author PRDs, draft unit economics models & operational workflows',
    leadAgent: 'pm',
    expectedOutput: 'PRD & Financial Cost Model',
  },
  {
    key: 'test',
    number: 6,
    name: 'Test',
    description: 'Simulate edge cases, stress-test margins & run user archetype tests',
    leadAgent: 'finance',
    expectedOutput: 'Simulation & Stress Test Suite',
  },
  {
    key: 'verify',
    number: 7,
    name: 'Verify',
    description: 'Validate constitutional compliance, SLA bounds & security invariants',
    leadAgent: 'coo',
    expectedOutput: 'Compliance & Safety Verification',
  },
  {
    key: 'review',
    number: 8,
    name: 'Review',
    description: 'Cross-functional peer critique, margin audits & stakeholder sign-off',
    leadAgent: 'coo',
    expectedOutput: 'Council Review Synthesis',
  },
  {
    key: 'report',
    number: 9,
    name: 'Report',
    description: 'Compile comprehensive Executive Report & archive artifacts in OS vault',
    leadAgent: 'coo',
    expectedOutput: 'Final Executive Report & Artifacts',
  },
];

// ============================================================================
// 3. DURABLE EMPLOYEE DEFINITIONS (Truthful Identity & Configuration)
// ============================================================================

export const INITIAL_AGENTS: AIAgent[] = [
  {
    id: 'coo',
    name: 'Sophia Vance',
    role: 'Chief Operating Officer & Orchestrator',
    department: 'Executive Operations & Orchestration',
    avatarColor: 'from-purple-500 to-indigo-600',
    accentColor: '#818cf8',
    status: 'active',
    currentTask: 'Coordinating cross-functional execution and supervising safe protocol dispatch',
    bio: 'Autonomous operational leader responsible for cross-agent execution, process orchestration, SLA enforcement, risk mitigation, and synthesizing final executive reports.',
    model: 'Gemini 2.5 Flash',
    goals: [
      'Deconstruct Founder directives into prioritized parallel sub-task graphs across Research, PM, and Finance',
      'Enforce the 9-Step Agent Work Protocol (Understand → Research → Analyze → Plan → Build/Execute → Test → Verify → Review → Report)',
      'Resolve cross-agent bottlenecks and eliminate dependencies with sub-second latency',
      'Compile holistic Executive Packages and verify constitutional compliance before delivery',
    ],
    instructions:
      'You are Sophia Vance, Master Orchestrator and COO of SamJuniors OS. When the Founder issues a directive: 1) Clarify scope and identify constraints; 2) Delegate research to Dr. Aris Thorne, product scoping to Maya Lin, and financial models to Julian Cruz; 3) Supervise testing and verification; 4) Convene Council review and synthesize the Final Executive Report. Maintain strict mock/safe execution—never move real funds or perform external transactions.',
    capabilities: [
      'Workflow Synthesis',
      'Resource Allocation',
      'Dependency Resolution',
      'Risk Matrix Modeling',
      'Escalation Routing',
      'Autonomous Protocol Enforcement',
    ],
    permissions: [
      { name: 'swarm:orchestrate', description: 'Dispatch and coordinate executive agent threads', category: 'Coordination', isSafeMock: true },
      { name: 'tasks:delegate', description: 'Assign, prioritize, and rebalance task queues', category: 'Coordination', isSafeMock: true },
      { name: 'reports:synthesize', description: 'Compile and publish Executive Reports to OS Vault', category: 'System', isSafeMock: true },
      { name: 'slas:enforce', description: 'Enforce latency thresholds & constitutional compliance', category: 'System', isSafeMock: true },
      { name: 'mock:safe_execution', description: 'Execution is sandboxed; external capital transactions blocked', category: 'System', isSafeMock: true },
    ],
    taskQueue: [
      {
        id: 't-coo-1',
        title: 'Directive Ingestion: Self-Serve Tier Rollout',
        protocolStep: 'understand',
        priority: 'Critical',
        status: 'completed',
        assignedAgent: 'coo',
        inputDescription: 'Founder Directive on self-serve expansion with unit economics',
        outputSnippet: 'Directive scope verified. Target deliverables: PRD, Market Brief, Financial Model, Ops Blueprint.',
        timestamp: 'Session Init',
      },
      {
        id: 't-coo-2',
        title: 'Master Execution Plan & Delegation Matrix',
        protocolStep: 'plan',
        priority: 'High',
        status: 'completed',
        assignedAgent: 'coo',
        inputDescription: 'Decompose into 4 parallel execution streams',
        outputSnippet: 'Assigned Research to Dr. Thorne, PRD to Maya Lin, Unit Economics to Julian Cruz.',
        timestamp: 'Session Init',
      },
    ],
    activityHistory: [
      { id: 'act-coo-1', time: 'Online', action: 'Initialized Executive Operations kernel and safe sandbox', protocolStep: 'understand', output: 'All execution guardrails active', badge: 'Ready', status: 'success' },
      { id: 'act-coo-2', time: 'Active', action: 'Synchronized cross-agent communication bus', protocolStep: 'plan', output: 'Inter-agent neural bus online', badge: 'Connected', status: 'info' },
    ],
    recentActivity: [
      { time: 'Online', action: 'Initialized Executive Operations kernel and safe sandbox', badge: 'Ready' },
      { time: 'Active', action: 'Synchronized cross-agent communication bus' },
    ],
  },
  {
    id: 'researcher',
    name: 'Dr. Aris Thorne',
    role: 'Lead Market & Intelligence Researcher',
    department: 'Market Intelligence & Deep Tech',
    avatarColor: 'from-amber-500 to-orange-600',
    accentColor: '#fbbf24',
    status: 'active',
    currentTask: 'Continuous monitoring of frontier reasoning models and competitor agent pricing models',
    bio: 'Continuous intelligence crawler analyzing AI research, competitor capabilities, regulatory shifts, market gaps, and technical moat opportunities.',
    model: 'Gemini 2.5 Flash',
    goals: [
      'Synthesize frontier model releases, technical papers, and benchmark breakthroughs',
      'Conduct granular competitive recon across AI workflow & agent operating systems',
      'Supply quantitative TAM/SAM analysis and demand signals to Product & Finance',
      'Identify defensible architectural moats and prevent strategic blindsides',
    ],
    instructions:
      'You are Dr. Aris Thorne, Lead Researcher. In the Research & Analyze protocol phases, crawl and evaluate empirical data, competitor pricing, and research breakthroughs. Provide objective, evidence-backed market memos. Highlight risks and opportunities clearly. All web scraping and API calls operate in safe mock mode.',
    capabilities: [
      'Deep Market Recon',
      'Patent & Paper Synthesis',
      'Competitor Architecture Analysis',
      'Tech Trend Forecasting',
      'Quantitative Benchmarks',
      'TAM/SAM Modeling',
    ],
    permissions: [
      { name: 'market:read_intel', description: 'Access market indices and competitor benchmarks', category: 'Intelligence', isSafeMock: true },
      { name: 'trends:scrape_safe', description: 'Simulated crawl of research trends and tech documentation', category: 'Intelligence', isSafeMock: true },
      { name: 'benchmarks:evaluate', description: 'Run model latency and architectural comparisons', category: 'Intelligence', isSafeMock: true },
      { name: 'mock:safe_execution', description: 'Read-only access; no live external mutations', category: 'System', isSafeMock: true },
    ],
    taskQueue: [
      {
        id: 't-res-1',
        title: 'Competitor Landscape Benchmark Analysis',
        protocolStep: 'research',
        priority: 'High',
        status: 'completed',
        assignedAgent: 'researcher',
        inputDescription: 'Evaluate mid-market onboarding drop-off rates and pricing friction',
        outputSnippet: 'Research indicates buyers drop off on mandatory sales demos. Self-serve increases onboarding velocity.',
        timestamp: 'Session Init',
      },
    ],
    activityHistory: [
      { id: 'act-res-1', time: 'Online', action: 'Loaded market intelligence crawler and research radar', protocolStep: 'research', output: 'Model tech radars active', badge: 'Radar Active', status: 'success' },
    ],
    recentActivity: [
      { time: 'Online', action: 'Loaded market intelligence crawler and research radar', badge: 'Radar Active' },
    ],
  },
  {
    id: 'pm',
    name: 'Maya Lin',
    role: 'Principal Product Manager',
    department: 'Product Strategy & User Experience',
    avatarColor: 'from-rose-500 to-pink-600',
    accentColor: '#f43f5e',
    status: 'active',
    currentTask: 'Authoring product requirements and specifications for inter-agent workflows',
    bio: 'Product designer and spec author transforming founder directives and market data into structured PRDs, user stories, and feature roadmaps.',
    model: 'Gemini 2.5 Flash',
    goals: [
      'Translate founder directives and research intel into modular, unambiguous PRDs',
      'Define clear user personas, workflows, and strict acceptance criteria for each sprint',
      'Optimize RICE prioritization scores to maximize product leverage per token spent',
      'Design seamless human-in-the-loop escalation guardrails for autonomous actions',
    ],
    instructions:
      'You are Maya Lin, Principal Product Manager. In the Plan and Build/Execute phases, generate comprehensive PRDs, user stories, functional specs, and acceptance criteria. Collaborate with Julian Cruz to align feature scope with compute costs, and with Sophia Vance to ensure realistic timelines.',
    capabilities: [
      'Automated PRD Authoring',
      'User Flow Architecture',
      'Feature Prioritization (RICE)',
      'UX Spec Generation',
      'Sprint Backlog Grooming',
      'Acceptance Criteria Definition',
    ],
    permissions: [
      { name: 'specs:create_prd', description: 'Author and modify Product Requirement Documents', category: 'Product', isSafeMock: true },
      { name: 'backlog:prioritize', description: 'Score features and groom sprint backlogs', category: 'Product', isSafeMock: true },
      { name: 'ux:architect_flows', description: 'Generate user personas and wireframe specifications', category: 'Product', isSafeMock: true },
      { name: 'mock:safe_execution', description: 'Specs are virtual documents; no live code deployment', category: 'System', isSafeMock: true },
    ],
    taskQueue: [
      {
        id: 't-pm-1',
        title: 'PRD: Instant Workspace Provisioning Flow',
        protocolStep: 'build_execute',
        priority: 'Critical',
        status: 'completed',
        assignedAgent: 'pm',
        inputDescription: 'Draft PRD based on competitor findings and self-serve demand',
        outputSnippet: 'Authored structured PRD with 3-click provisioning and instant 4-agent spawn.',
        timestamp: 'Session Init',
      },
    ],
    activityHistory: [
      { id: 'act-pm-1', time: 'Online', action: 'Loaded PRD template engine and user flow architect', protocolStep: 'build_execute', output: 'Specification engine online', badge: 'Ready', status: 'success' },
    ],
    recentActivity: [
      { time: 'Online', action: 'Loaded PRD template engine and user flow architect', badge: 'Ready' },
    ],
  },
  {
    id: 'finance',
    name: 'Julian Cruz',
    role: 'Chief Financial Analyst',
    department: 'Capital, Treasury & Unit Economics',
    avatarColor: 'from-emerald-500 to-teal-600',
    accentColor: '#34d399',
    status: 'active',
    currentTask: 'Auditing token margin efficiency and compute unit economics models',
    bio: 'Deterministic financial modeler tracking unit economics, compute cost attribution, pricing models, and capital runway sensitivity.',
    model: 'Gemini 2.5 Flash',
    goals: [
      'Ensure 80%+ gross margin target across autonomous agent execution workflows',
      'Track simulated token spend, compute attribution, and batch inference caching ROI',
      'Model pricing tier trajectories, payback periods, and runway sensitivity',
      'Audit all financial assumptions to ensure zero hallucination in unit economics',
    ],
    instructions:
      'You are Julian Cruz, Chief Financial Analyst. In the Analyze, Test, and Verify phases, compute cost models, token expenditure breakdowns, and gross margins. Provide deterministic formulas. All financial analysis is strictly simulated; no external bank or credit card transactions are executed.',
    capabilities: [
      'Real-Time Cost Modeling',
      'Unit Economics Analysis',
      'Dynamic Pricing Optimization',
      'Runway Sensitivity Modeling',
      'Cost Attribution',
      'Token Spend Simulation',
    ],
    permissions: [
      { name: 'unit_economics:simulate', description: 'Run financial sensitivity and gross margin models', category: 'Financial', isSafeMock: true },
      { name: 'spend:audit_tokens', description: 'Monitor token expenditure and compute efficiency', category: 'Financial', isSafeMock: true },
      { name: 'pricing:model_tiers', description: 'Simulate tiered subscription revenue & unit economics', category: 'Financial', isSafeMock: true },
      { name: 'mock:safe_execution', description: 'Simulation only; real bank transfer & payment gateway execution disabled', category: 'System', isSafeMock: true },
    ],
    taskQueue: [
      {
        id: 't-fin-1',
        title: 'Compute Expenditure & Token Burn Simulation',
        protocolStep: 'analyze',
        priority: 'Critical',
        status: 'completed',
        assignedAgent: 'finance',
        inputDescription: 'Model batch inference cost per customer onboarded',
        outputSnippet: 'Modeled onboarding compute cost at $0.18/tenant. Projected gross margin at ~83.9%.',
        timestamp: 'Session Init',
      },
    ],
    activityHistory: [
      { id: 'act-fin-1', time: 'Online', action: 'Initialized unit economics auditor and pricing simulator', protocolStep: 'verify', output: 'Margin guardrails active', badge: 'Auditor Online', status: 'success' },
    ],
    recentActivity: [
      { time: 'Online', action: 'Initialized unit economics auditor and pricing simulator', badge: 'Auditor Online' },
    ],
  },
];

// ============================================================================
// 4. FOUNDER ATTENTION & ESCALATIONS (Needs Founder Attention)
// ============================================================================

export const INITIAL_ATTENTION_ITEMS: AttentionItem[] = [
  {
    id: 'att-1',
    type: 'approval_required',
    title: 'Founder Sign-Off: Self-Serve Enterprise Tier Beta Launch Proposal',
    whatHappened:
      'Sophia Vance, Dr. Aris Thorne, Maya Lin, and Julian Cruz compiled the strategic proposal for the Self-Serve Enterprise Tier, including PRD, competitive analysis, and unit economics model.',
    whyItMatters:
      'Proposes unlocking frictionless self-serve onboarding. Julian modeled $0.18 compute cost per onboarded tenant with zero infrastructure bottlenecks.',
    recommendedAction:
      'Approve Beta rollout plan for prospective enterprise pilot cohort or request scope adjustments.',
    authorAgentId: 'coo',
    authorName: 'Sophia Vance (COO)',
    founderActionRequired: true,
    status: 'pending',
    timestamp: 'Today at 09:30 AM',
    evidence: {
      basis: 'model_reasoning',
      source: 'Competitor benchmark model & batch compute calculation in Safe Sandbox',
      details: 'Market recon suggests self-serve reduces evaluation drop-off; onboarding compute is bounded to $0.18/tenant.',
    },
    currentEvidence: {
      summary: 'Empirical benchmark model indicates 78% drop-off on sales-gated demos; validated onboarding compute burn strictly held at $0.18/tenant.',
      source: 'Internal audit & market recon sandbox',
      confidence: 94,
    },
    historicalMemories: [
      {
        id: 'mem-1',
        pastDecisionId: 'dec-2',
        pastAction: 'Enforce strict 80%+ gross margin floor across all tier packaging and compute operations.',
        executionOutcome: 'Preserved 83.9% gross margin during high-load stress testing.',
        whyRelevant: 'Self-serve onboarding token usage must comply with the historical 80% gross margin mandate.',
        conflictWithCurrentEvidence: false,
        epistemicConfidence: 'verified_fact',
      },
    ],
    aiInference: {
      recommendation: 'Authorize 15-account pilot cohort with automated workspace provisioning and telemetry metering.',
      reasoning: 'Verified $0.18/tenant compute spend yields 88.2% gross margin, satisfying historical policy without violating unit economics.',
    },
  },
  {
    id: 'att-2',
    type: 'product_decision',
    title: 'PRD Review: Inter-Agent Streaming Bus Specification',
    whatHappened:
      'Maya Lin drafted the v2.4 specification for low-latency inter-agent streaming channels for real-time executive debate and consensus synthesis.',
    whyItMatters:
      'Aims to reduce coordination lag between Research, Product, and Finance from 1.2s to sub-50ms.',
    recommendedAction:
      'Review functional specification and authorize simulation benchmark.',
    authorAgentId: 'pm',
    authorName: 'Maya Lin (Product)',
    founderActionRequired: true,
    status: 'pending',
    timestamp: '35m ago',
    evidence: {
      basis: 'model_reasoning',
      source: 'Internal UX & system latency architecture model',
      details: 'RICE score computed at 88/100; verified within browser sandbox bounds.',
    },
  },
  {
    id: 'att-3',
    type: 'research_finding',
    title: 'Market Intelligence: Competitor Pricing Shift',
    whatHappened:
      'Dr. Aris Thorne analyzed market reports showing price increases from legacy AI workflow competitors alongside user demand for transparent pricing.',
    whyItMatters:
      'Identifies an acquisition opportunity for SamJuniors OS as a turnkey, transparent multi-agent operating system.',
    recommendedAction:
      'Emphasize self-serve onboarding and verifiable unit economics in product positioning.',
    authorAgentId: 'researcher',
    authorName: 'Dr. Aris Thorne (Research)',
    founderActionRequired: false,
    status: 'approved',
    timestamp: '22m ago',
    evidence: {
      basis: 'external_evidence',
      source: 'Public documentation and competitor pricing analysis',
      details: 'Evaluated public pricing pages and developer sentiment across 30+ tools.',
    },
  },
];

// ============================================================================
// 5. ACTIVE COMPANY INITIATIVES
// ============================================================================

export const INITIAL_INITIATIVES: CompanyInitiative[] = [
  {
    id: 'init-1',
    title: 'Self-Serve Enterprise AI Tier',
    codeName: 'Project Lumora',
    status: 'Active',
    currentObjective: 'Finalize Beta rollout criteria and automated domain crawl ingestion',
    contributors: [
      { agentId: 'coo', name: 'Sophia Vance', role: 'Chief Operating Officer' },
      { agentId: 'researcher', name: 'Dr. Aris Thorne', role: 'Lead Researcher' },
      { agentId: 'pm', name: 'Maya Lin', role: 'Principal PM' },
      { agentId: 'finance', name: 'Julian Cruz', role: 'Chief Financial Analyst' },
    ],
    latestResult: 'Initial strategic package compiled and verified in safe mock sandbox.',
    nextRecommendedAction: 'Founder sign-off on Beta pilot cohort criteria.',
    risks: [
      'Rate-limiting safeguards needed during initial traffic spike',
      'Data isolation verification required for multi-tenant deployments',
    ],
    deliverableIds: ['Final Executive Report', 'PRD', 'Competitor Moat Analysis', 'Unit Economics'],
    updatedAt: 'Today at 09:30 AM',
  },
  {
    id: 'init-2',
    title: 'Zero-Latency Neural Bus & Inter-Agent Streaming',
    codeName: 'Project Synapse',
    status: 'In Progress',
    currentObjective: 'Eliminate context degradation across multi-step council dialogues',
    contributors: [
      { agentId: 'pm', name: 'Maya Lin', role: 'Principal PM' },
      { agentId: 'coo', name: 'Sophia Vance', role: 'Chief Operating Officer' },
    ],
    latestResult: 'Architecture PRD drafted with RICE score 88/100.',
    nextRecommendedAction: 'Benchmark batch cache hit rate against real-time streaming channels.',
    risks: ['Memory footprint under high concurrency; verified within browser sandbox.'],
    deliverableIds: ['PRD: Inter-Agent Streaming v2.4'],
    updatedAt: '35m ago',
  },
  {
    id: 'init-3',
    title: 'Continuous Market Intelligence & Regulatory Radar',
    codeName: 'Project Horizon',
    status: 'Active',
    currentObjective: 'Track frontier reasoning models, open-source weights, and EU AI Act compliance standards',
    contributors: [
      { agentId: 'researcher', name: 'Dr. Aris Thorne', role: 'Lead Researcher' },
      { agentId: 'coo', name: 'Sophia Vance', role: 'Chief Operating Officer' },
    ],
    latestResult: 'Synthesized 12 frontier models and verified alignment with safe sandboxing criteria.',
    nextRecommendedAction: 'Automate weekly competitive diff alerts into Company Pulse.',
    risks: ['External API rate limits; handled with deterministic backoff.'],
    deliverableIds: ['Market Intelligence Brief'],
    updatedAt: '5m ago',
  },
  {
    id: 'init-4',
    title: 'Autonomous Compute Guardrails & Unit Margin Auditing',
    codeName: 'Project Ledger',
    status: 'Review',
    currentObjective: 'Maintain >80% gross margin target floor across all model workflows',
    contributors: [
      { agentId: 'finance', name: 'Julian Cruz', role: 'Chief Financial Analyst' },
    ],
    latestResult: 'Modeled 5,000 tenant concurrency with $0.18/tenant onboarding compute cost.',
    nextRecommendedAction: 'Lock dynamic budget capping thresholds for Founder notification.',
    risks: ['Spike in un-cached prompt tokens; mitigation is prompt caching.'],
    deliverableIds: ['Unit Economics & Financial Projections'],
    updatedAt: '1m ago',
  },
];

// ============================================================================
// 6. COMPANY GOVERNANCE DECISION LOG
// ============================================================================

export const INITIAL_COMPANY_DECISIONS: CompanyDecision[] = [
  {
    id: 'dec-1',
    title: 'Approve Beta Launch Plan for Self-Serve AI Tier',
    status: 'pending_approval',
    category: 'Strategic',
    recommendedBy: 'Sophia Vance & Executive Council',
    agentId: 'coo',
    recommendation: 'Open pilot onboarding to 15 waitlisted enterprise accounts with automated workspace provisioning.',
    businessImpact: 'Accelerates evaluation pipeline without manual sales friction.',
    evidenceSummary: 'Competitive benchmark showed drop-off on mandatory sales demos; modeled onboarding compute cost is $0.18.',
    date: 'Today',
    founderApprovalRequired: true,
    currentEvidence: {
      summary: 'Empirical benchmark model indicates 78% drop-off on sales-gated demos; validated onboarding compute burn strictly held at $0.18/tenant.',
      source: 'Internal audit & market recon sandbox',
      confidence: 94,
    },
    historicalMemories: [
      {
        id: 'mem-1',
        pastDecisionId: 'dec-2',
        pastAction: 'Enforce strict 80%+ gross margin floor across all tier packaging and compute operations.',
        executionOutcome: 'Preserved 83.9% gross margin during high-load stress testing.',
        whyRelevant: 'Self-serve onboarding token usage must comply with the historical 80% gross margin mandate.',
        conflictWithCurrentEvidence: false,
        epistemicConfidence: 'verified_fact',
      },
    ],
    aiInference: {
      recommendation: 'Authorize 15-account pilot cohort with automated workspace provisioning and telemetry metering.',
      reasoning: 'Verified $0.18/tenant compute spend yields 88.2% gross margin, satisfying historical policy without violating unit economics.',
    },
  },
  {
    id: 'dec-2',
    title: 'Adopt Strict 80%+ Gross Margin Floor Policy',
    status: 'approved',
    category: 'Financial',
    recommendedBy: 'Julian Cruz (Finance)',
    agentId: 'finance',
    recommendation: 'Julian Cruz holds advisory veto over compute-heavy workflows exceeding 20% cost-to-value ratio.',
    businessImpact: 'Guarantees capital efficiency and prevents runaway token inference costs.',
    evidenceSummary: 'Verified token cost attribution model confirms 83.9% target margin floor in sandbox.',
    date: 'Yesterday',
    founderApprovalRequired: true,
  },
  {
    id: 'dec-3',
    title: 'Zero-Trust Agent Sandboxing & Safe Mock Protocol',
    status: 'approved',
    category: 'Governance',
    recommendedBy: 'Sophia Vance (COO)',
    agentId: 'coo',
    recommendation: 'All external capital movements and production mutations remain sandboxed in Safe Mock mode until explicit Founder approval.',
    businessImpact: 'Eliminates operational and financial risk from autonomous agent executions.',
    evidenceSummary: 'Enforced at server orchestrator level via ServerAgentExecutor guardrails.',
    date: '3 days ago',
    founderApprovalRequired: false,
  },
];

// ============================================================================
// 7. NOTIFICATIONS (Truthful System Events)
// ============================================================================

export const INITIAL_NOTIFICATIONS: OSNotification[] = [
  {
    id: 'notif-1',
    title: 'Executive Council Ready',
    message: 'Sophia, Aris, Maya, and Julian are online in Safe Sandbox mode and ready for directives.',
    time: 'Just now',
    type: 'system',
    read: false,
    actionable: true,
    actionLabel: 'Open HQ',
    appTarget: 'workforce',
  },
  {
    id: 'notif-2',
    title: 'Strategic Proposal Ready for Review',
    message: 'Sophia Vance filed the Self-Serve Enterprise Tier strategic package for Founder sign-off.',
    time: '15m ago',
    type: 'agent',
    read: false,
    actionable: true,
    actionLabel: 'Review Sign-Off',
    appTarget: 'workforce',
  },
  {
    id: 'notif-3',
    title: 'Safe Sandbox Active',
    message: 'All external mutations and capital operations are strictly sandboxed.',
    time: '1h ago',
    type: 'system',
    read: true,
    actionable: false,
    appTarget: 'settings',
  },
];

export const NOTIFICATIONS = INITIAL_NOTIFICATIONS;

// ============================================================================
// 8. SAMPLE / DEMO DATA (Explicitly labeled for Simulation & Planning)
// ============================================================================

/**
 * Sample Prospective Deals for CRM & Outreach Modeling Sandbox
 */
export const SAMPLE_PIPELINE_DEALS: CustomerDeal[] = [
  {
    id: 'deal-1',
    companyName: 'Nexus Global Enterprise (Target Account)',
    logoLetter: 'N',
    tier: 'Enterprise',
    arr: '$84,000 (Target)',
    stage: 'AI Demo',
    leadAgent: 'Maya Lin & Julian Cruz',
    health: 'High',
    lastInteraction: 'Simulated discovery brief generated from public data',
    notes: '250 autonomous agent seats target on dedicated VPC instance.',
    isProspectAccount: true,
  },
  {
    id: 'deal-2',
    companyName: 'Vertex BioTech (Target Account)',
    logoLetter: 'V',
    tier: 'Enterprise',
    arr: '$120,000 (Target)',
    stage: 'Discovery',
    leadAgent: 'Dr. Aris Thorne',
    health: 'High',
    lastInteraction: 'Security SLA requirements modeled by Sophia Vance',
    notes: 'Requires data masking evaluation. Token budget modeled by Julian.',
    isProspectAccount: true,
  },
  {
    id: 'deal-3',
    companyName: 'AeroDynamics AI (Target Account)',
    logoLetter: 'A',
    tier: 'Scale',
    arr: '$42,000 (Target)',
    stage: 'AI Demo',
    leadAgent: 'Maya Lin',
    health: 'Good',
    lastInteraction: 'Multi-agent workflow benchmark modeled',
    notes: 'Evaluating migration from single-agent prompt setups.',
    isProspectAccount: true,
  },
  {
    id: 'deal-4',
    companyName: 'OmniFlow Logistics (Target Account)',
    logoLetter: 'O',
    tier: 'Autonomous Pro',
    arr: '$24,000 (Target)',
    stage: 'Discovery',
    leadAgent: 'Sophia Vance',
    health: 'Good',
    lastInteraction: 'Automated discovery notes synthesized',
    notes: 'Looking for automated exception routing and PRD generation.',
    isProspectAccount: true,
  },
  {
    id: 'deal-5',
    companyName: 'Sovereign Capital Partners (Target Account)',
    logoLetter: 'S',
    tier: 'Enterprise',
    arr: '$180,000 (Target)',
    stage: 'Discovery',
    leadAgent: 'Julian Cruz',
    health: 'High',
    lastInteraction: 'Custom ROI calculator simulation generated',
    notes: 'Fintech tier with real-time audit trail verification modeling.',
    isProspectAccount: true,
  },
];

export const INITIAL_DEALS = SAMPLE_PIPELINE_DEALS;

/**
 * Product Features & Roadmap Items
 */
export const INITIAL_FEATURES: ProductFeature[] = [
  {
    id: 'feat-1',
    title: 'Zero-Latency Inter-Agent Neural Bus',
    category: 'Core OS',
    status: 'In Progress',
    owner: 'Sophia Vance & Maya Lin',
    priority: 'Critical',
    completion: 82,
    description: 'Sub-50ms peer-to-peer streaming channels for real-time agent debate and consensus synthesis.',
  },
  {
    id: 'feat-2',
    title: 'Autonomous Spend Guardrails v2',
    category: 'Billing',
    status: 'In Review',
    owner: 'Julian Cruz',
    priority: 'High',
    completion: 95,
    description: 'Dynamic budget capping with founder notification thresholds for token-intensive batch workloads.',
  },
  {
    id: 'feat-3',
    title: 'Continuous Competitor Intel Crawler',
    category: 'Agent Swarm',
    status: 'Shipped',
    owner: 'Dr. Aris Thorne',
    priority: 'High',
    completion: 100,
    description: 'Diff engine monitoring competitor pricing and product documentation trends in sandbox.',
  },
  {
    id: 'feat-4',
    title: 'Self-Healing Workflow Exception Engine',
    category: 'Core OS',
    status: 'In Progress',
    owner: 'Sophia Vance',
    priority: 'Critical',
    completion: 64,
    description: 'Automatic fallback to alternative reasoning paths when external APIs return degraded responses.',
  },
];

/**
 * Research Intelligence Radar
 */
export const INITIAL_RESEARCH: ResearchTopic[] = [
  {
    id: 'res-1',
    title: 'The Shift to Multi-Agent Operating Systems vs Single-Model Chat',
    category: 'Model Tech',
    confidence: 96,
    impact: 'Transformative',
    date: 'Sep 2026',
    author: 'Dr. Aris Thorne',
    summary: 'Enterprises are adopting hierarchical role-specialized agent swarms with deterministic kernel orchestration over single prompt-response chatbots.',
    tags: ['Multi-Agent', 'Enterprise AI', 'Kernel Architecture'],
  },
  {
    id: 'res-2',
    title: 'Token Economics: Why Caching + SLM Routing Lowers Blended Cost by 74%',
    category: 'Market Intel',
    confidence: 94,
    impact: 'High',
    date: 'Aug 2026',
    author: 'Dr. Aris Thorne & Julian Cruz',
    summary: 'Routing repetitive operational validation to small fast models while reserving frontier reasoning for synthesis yields 80%+ gross margin targets.',
    tags: ['Unit Economics', 'SLMs', 'Cost Optimization'],
  },
  {
    id: 'res-3',
    title: 'Autonomous Compliance & Zero-Trust Agent Sandboxing',
    category: 'Regulatory',
    confidence: 91,
    impact: 'High',
    date: 'Aug 2026',
    author: 'Dr. Aris Thorne & Sophia Vance',
    summary: 'EU AI Act tier 2 requirements mandate immutable audit trails for autonomous decisions. SamJuniors safe sandbox architecture satisfies core criteria.',
    tags: ['Compliance', 'Governance', 'EU AI Act'],
  },
];

/**
 * Financial Unit Economics Simulation Model (Computational Planning Sandbox)
 */
export const SAMPLE_FINANCIAL_MODEL: FinanceMetric = {
  mrr: 148500,
  arr: 1782000,
  grossMargin: 86.4,
  computeSpend: 19400,
  runwayMonths: 42,
  burnRate: 24500,
  netIncome: 124000,
  tokenUsageMillions: 840,
  isSimulatedModel: true,
};

export const INITIAL_FINANCIALS = SAMPLE_FINANCIAL_MODEL;

// ============================================================================
// 9. INITIAL ORCHESTRATION DELIVERABLE BUNDLE (Safe Mock Verification Package)
// ============================================================================

export const INITIAL_ORCHESTRATION: OrchestrationRun = {
  id: 'run-init-1',
  directive: 'Evaluate launching a self-serve tier for enterprise AI agents with unit economics & operational roadmap',
  timestamp: 'Today at 09:30 AM',
  status: 'completed',
  currentProtocolStep: 'report',
  protocolProgress: {
    understand: 'completed',
    research: 'completed',
    analyze: 'completed',
    plan: 'completed',
    build_execute: 'completed',
    test: 'completed',
    verify: 'completed',
    review: 'completed',
    report: 'completed',
  },
  title: 'Enterprise Self-Serve AI Agent Tier Strategy Proposal',
  summary: 'The Executive AI Council has modeled the self-serve expansion. The product scope is prioritized for Q4, unit economics model projects 83.9% gross margin at $249/mo/seat, and operations has verified safe sandbox boundaries.',
  plan: [
    {
      stage: 1,
      title: 'Directive Ingestion & Scope Boundary',
      agentId: 'coo',
      protocolStep: 'understand',
      status: 'done',
      outputSnippet: 'Deconstructed Founder directive. Defined objectives, safety bounds, and 4 deliverable schemas.',
    },
    {
      stage: 2,
      title: 'Market Validation & Competitive Moat',
      agentId: 'researcher',
      protocolStep: 'research',
      status: 'done',
      outputSnippet: 'TAM model of $420M in mid-market tech companies. Research indicates high drop-off on sales walls.',
    },
    {
      stage: 3,
      title: 'Technical Feasibility & Risk Modeling',
      agentId: 'researcher',
      protocolStep: 'analyze',
      status: 'done',
      outputSnippet: 'Evaluated Gemini 2.5 Flash batch latency. Prompt caching modeled for cost efficiency.',
    },
    {
      stage: 4,
      title: 'Inter-Agent Delegation & Execution Graph',
      agentId: 'coo',
      protocolStep: 'plan',
      status: 'done',
      outputSnippet: 'Assigned PRD authoring to Maya Lin, financial unit model to Julian Cruz, security review to Sophia Vance.',
    },
    {
      stage: 5,
      title: 'Self-Serve Onboarding PRD & Architecture',
      agentId: 'pm',
      protocolStep: 'build_execute',
      status: 'done',
      outputSnippet: '3-click provisioning flow with automated workspace generator and instant 4-agent spawn.',
    },
    {
      stage: 6,
      title: 'Compute Burn & Pricing Stress Test',
      agentId: 'finance',
      protocolStep: 'test',
      status: 'done',
      outputSnippet: 'Simulated 5,000 tenant concurrency model. Onboarding compute cost holds at $0.18/tenant.',
    },
    {
      stage: 7,
      title: 'Constitutional Compliance & SLA Verification',
      agentId: 'coo',
      protocolStep: 'verify',
      status: 'done',
      outputSnippet: 'Verified zero-financial-risk guardrails and safe mock execution boundaries.',
    },
    {
      stage: 8,
      title: 'Executive Council Review & Consensus',
      agentId: 'coo',
      protocolStep: 'review',
      status: 'done',
      outputSnippet: 'All 4 agents approved finalized package with unanimous alignment.',
    },
    {
      stage: 9,
      title: 'Executive Report Synthesis & Vault Archive',
      agentId: 'coo',
      protocolStep: 'report',
      status: 'done',
      outputSnippet: 'Synthesized Final Executive Report and archived 4 primary artifacts into OS Vault.',
    },
  ],
  messages: [
    {
      id: 'm1',
      sender: 'coo',
      protocolStep: 'understand',
      text: '[Sophia Vance - COO] Directive received: "Evaluate launching a self-serve tier for enterprise AI agents with unit economics & operational roadmap". Decomposing into 9-step Agent Work Protocol.',
      timestamp: '09:30:02',
      type: 'status',
    },
    {
      id: 'm2',
      sender: 'researcher',
      protocolStep: 'research',
      text: '[Dr. Thorne - Research] Evaluated SaaS onboarding trends. Buyers frequently drop off on mandatory sales calls. Frictionless self-serve onboarding provides significant pipeline acceleration.',
      timestamp: '09:30:06',
      type: 'finding',
    },
    {
      id: 'm3',
      sender: 'pm',
      protocolStep: 'build_execute',
      text: '[Maya Lin - PM] Agree with Dr. Thorne. I have drafted the PRD for "Instant Workspace Provisioning". Users input their company domain, and the system spawns custom COO, Researcher, PM, and Finance agents.',
      timestamp: '09:30:11',
      type: 'artifact',
    },
    {
      id: 'm4',
      sender: 'finance',
      protocolStep: 'analyze',
      text: '[Julian Cruz - Finance] Financial unit economics model complete. With optimized Gemini batching, each onboarding computes to approximately $0.18. At a $249/mo subscription, payback is rapid.',
      timestamp: '09:30:16',
      type: 'critique',
    },
    {
      id: 'm5',
      sender: 'coo',
      protocolStep: 'verify',
      text: '[Sophia Vance - COO] Operations has verified automated provisioning specifications and rate-limiting safeguards in Safe Mock mode.',
      timestamp: '09:30:22',
      type: 'artifact',
    },
    {
      id: 'm6',
      sender: 'orchestrator',
      protocolStep: 'report',
      text: 'Consensus finalized. Protocol Step 9 (Report) executed. Full executive package synthesized and filed in SamJuniors OS Vault.',
      timestamp: '09:30:25',
      type: 'status',
    },
  ],
  deliverables: [
    {
      name: 'Final Executive Report (COO Synthesis)',
      owner: 'Sophia Vance (Chief Operating Officer)',
      protocolStep: 'report',
      content: `# EXECUTIVE WORKFORCE REPORT: SELF-SERVE ENTERPRISE TIER

## 1. Executive Summary
The SamJuniors AI Executive Council has evaluated the **Self-Serve AI Agent Enterprise Tier**. By enabling automated onboarding and multi-agent workspace provisioning, the company can target **$3.43M in projected ARR** at an **83.9% gross margin model**, avoiding traditional 6-week enterprise sales cycle friction.

## 2. Council Findings & Contributions
- **Dr. Aris Thorne (Research)**: Identified competitive whitespace where enterprise buyers prefer immediate hands-on evaluation.
- **Maya Lin (Product)**: Authored full PRD with domain ingestion and zero-latency inter-agent streaming.
- **Julian Cruz (Finance)**: Audited token unit economics. Compute burn per onboarded workspace is modeled at **$0.18**.
- **Sophia Vance (Operations)**: Configured automated SLA guardrails and safe execution bounds.

## 3. Recommended Rollout Timeline
- **Phase 1 (Sprint 1)**: Deploy instant domain crawler and agent workspace generator in staging.
- **Phase 2 (Sprint 2)**: Launch beta with pilot enterprise cohort (15 accounts).
- **Phase 3 (Sprint 3)**: General availability self-serve subscription.

## 4. Safety & Governance Certification
*Status: PASSED (Safe Mock Execution Mode active)*. Zero live financial mutations executed. All calculations verified in sandbox.`,
    },
    {
      name: 'Product Requirements Document (PRD)',
      owner: 'Maya Lin (Principal PM)',
      protocolStep: 'build_execute',
      content: `### 1. Vision & Problem Statement
Eliminate sales friction by enabling any founder or executive to spin up an autonomous AI company workforce in under 60 seconds.

### 2. User Journey
1. **Domain Input**: Founder provides company URL and primary goals.
2. **Autonomous Recon**: Researcher agent crawls public domain to populate Company Constitution.
3. **Instant OS Desktop**: Founder is presented with SamJuniors OS pre-configured with 4 active AI employees.
4. **First Directive**: Guided prompt execution within 30 seconds.

### 3. Key Performance Indicators (KPIs)
- Time-to-first-directive < 90 seconds
- Day 30 retention target > 64%
- Zero human intervention during 98% of onboardings`,
    },
    {
      name: 'Market Intelligence & Competitor Moat Analysis',
      owner: 'Dr. Aris Thorne (Lead Researcher)',
      protocolStep: 'research',
      content: `### Industry Context
Current enterprise AI platforms often require multi-week sales cycles and manual prompt engineering. The market rewards turnkey autonomous operating systems.

### Competitive Matrix
- **Competitor A (Chat-centric)**: Prompt fatigue, no multi-agent role separation.
- **Competitor B (Workflow builders)**: High configuration complexity, fragile node connections.
- **SamJuniors OS**: Unified desktop paradigm, native role-specialized AI executives, deterministic kernel orchestration.`,
    },
    {
      name: 'Unit Economics & Financial Projections (Simulation Model)',
      owner: 'Julian Cruz (Chief Financial Analyst)',
      protocolStep: 'analyze',
      content: `### Financial Model Assumptions
- Monthly Subscription: $249 / workspace
- Included Tasks: 2,500 agent directives / month
- Overage Rate: $0.05 / additional directive
- Blended Cost per Directive (Compute + Model API): $0.016
- Target Gross Margin: **83.9%**

### 12-Month Expansion Projection (Model Sandbox)
- End of Q1 Target: 120 workspaces ($29,880 MRR)
- End of Q2 Target: 380 workspaces ($94,620 MRR)
- End of Q4 Target: 1,150 workspaces ($286,350 MRR / $3.43M ARR)`,
    },
  ],
  executiveResult: {
    recommendation: 'The Executive Council unanimously recommends launching the Self-Serve Enterprise Tier in Q4. All unit economics verify $0.18 compute cost per onboarded tenant with zero infrastructure bottlenecks.',
    keyFindings: [
      'Strategic Research (Dr. Aris Thorne): 78% of enterprise buyers drop off on mandatory sales calls; self-serve provides immediate pipeline velocity.',
      'Product PRD (Maya Lin): 3-click automated workspace provisioning flow pre-trains on public domain data and spawns custom agent teams.',
      'Unit Economics (Julian Cruz): Compute burn held at $0.18/tenant onboarding via batching with 83.9% gross margin floor.',
    ],
    businessImplications: [
      'Bypasses 6-week enterprise sales cycles to accelerate self-serve pipeline velocity.',
      'Maintains capital efficiency with zero additional human onboarding overhead.',
      'Empowers founders to evaluate autonomous multi-agent capability in <60s.',
    ],
    risks: [
      'Inference rate limits during spike traffic; mitigated via automated caching fallbacks.',
      'Safe Mock Sandboxing remains strictly enforced to prevent unverified financial mutations.',
    ],
    recommendedNextActions: [
      'Founder approval on Beta cohort launch parameters (15 waitlisted accounts).',
      'Sprint 1: Deploy domain crawler and instant agent workspace generator in sandbox.',
      'Validate prompt token caching hit rate against simulated concurrency.',
    ],
    founderDecision: {
      required: true,
      title: 'Approve Beta Launch Plan for Self-Serve AI Tier',
      recommendation: 'Open pilot onboarding to 15 waitlisted enterprise accounts with automated workspace provisioning.',
      why: 'Requires Founder sign-off before allocating execution capacity and opening onboarding.',
      impact: 'Authorizes executive team to proceed with implementation phase under Safe Mock constraints.',
      status: 'pending',
    },
    preparedBy: {
      name: 'Sophia Vance',
      role: 'Chief Operating Officer',
      agentId: 'coo',
    },
    participatingEmployees: [
      {
        agentId: 'coo',
        name: 'Sophia Vance',
        role: 'Chief Operating Officer',
        department: 'Executive Operations',
        status: 'completed',
        contribution: 'Directive decomposition, inter-agent delegation, and executive synthesis.',
      },
      {
        agentId: 'researcher',
        name: 'Dr. Aris Thorne',
        role: 'Lead Researcher',
        department: 'Market & Tech Intelligence',
        status: 'completed',
        contribution: 'Market dynamics, competitive moat analysis, and technical feasibility.',
      },
      {
        agentId: 'pm',
        name: 'Maya Lin',
        role: 'Principal PM',
        department: 'Product Strategy & PRDs',
        status: 'completed',
        contribution: 'Product Requirements Document (PRD) and instant workspace provisioning flow.',
      },
      {
        agentId: 'finance',
        name: 'Julian Cruz',
        role: 'Chief Financial Analyst',
        department: 'Finance & Unit Economics',
        status: 'completed',
        contribution: 'Unit economics modeling, compute cost stress-test, and margin analysis.',
      },
    ],
    verificationStatus: 'verified',
    verificationDetails: {
      isCompliant: true,
      checksPassed: [
        'Safe Mock Execution boundary enforced (external transactions isolated)',
        'Zero credential or API key leakage in outputs',
        'Human-in-the-loop triggers verified for external actions',
        'Provenance metadata attached to all 4 deliverables',
      ],
      checksFailed: [],
      notes: 'Safe Mock Execution Active: No external financial mutations allowed. No secret credential exposure.',
    },
    evidenceAvailability: {
      hasProvenance: true,
      evidenceCount: 4,
      primaryBasis: 'model_reasoning',
      deliverableIds: [
        'Final Executive Report (COO Synthesis)',
        'Product Requirements Document (PRD)',
        'Market Intelligence & Competitor Moat Analysis',
        'Unit Economics & Financial Projections (Simulation Model)',
      ],
    },
    executionOutcome: 'success',
  },
};

// ============================================================================
// 10. WALLPAPERS
// ============================================================================

export const WALLPAPERS = [
  {
    id: 'elegant-dark',
    name: 'Elegant Dark Void',
    preview: 'radial-gradient(circle at 50% -20%, #2a2a4a 0%, #0a0a0f 80%)',
    bgClass: 'bg-[#0a0a0f]',
  },
  {
    id: 'cyber-glass',
    name: 'Obsidian Nebula',
    preview: 'radial-gradient(circle at 50% 0%, #1f1f38 0%, #0c0d14 60%, #060609 100%)',
    bgClass: 'bg-gradient-to-br from-[#08090f] via-[#141226] to-[#0a1824]',
  },
  {
    id: 'aurora-borealis',
    name: 'Solar Aurora',
    preview: 'radial-gradient(circle at 30% -10%, #16363c 0%, #0a1728 50%, #060912 100%)',
    bgClass: 'bg-gradient-to-br from-[#04141c] via-[#092b27] to-[#121938]',
  },
  {
    id: 'deep-space',
    name: 'Cosmic Titanium',
    preview: 'radial-gradient(circle at 50% -20%, #1e2230 0%, #0f1118 60%, #08090c 100%)',
    bgClass: 'bg-gradient-to-br from-[#0c0e14] via-[#181b24] to-[#07080a]',
  },
  {
    id: 'hyper-violet',
    name: 'Quantum Violet',
    preview: 'radial-gradient(circle at 50% -10%, #30144d 0%, #140d25 60%, #07040d 100%)',
    bgClass: 'bg-gradient-to-br from-[#100720] via-[#230d38] to-[#0c1630]',
  },
];
