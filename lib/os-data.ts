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
    title: 'Company Overview — Strategic Pulse & Status',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 9,
    position: { x: 120, y: 80 },
    size: { width: 960, height: 640 },
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
    title: 'OS Settings & Skill Explorer',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 4,
    position: { x: 180, y: 100 },
    size: { width: 940, height: 620 },
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
    name: 'Company',
    category: 'Strategic Pulse & Governance',
    description: 'High-level futuristic command dashboard: strategic goals, autonomous KPIs & executive status',
    iconName: 'Building2',
    color: 'from-blue-500 to-cyan-600',
    defaultSize: { width: 960, height: 640 },
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
    category: 'OS Governance & Skills',
    description: 'Skill Explorer directory, autonomy guardrails, wallpapers & audio telemetry',
    iconName: 'Sliders',
    color: 'from-indigo-500 to-slate-700',
    defaultSize: { width: 940, height: 620 },
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
    status: 'idle',
    currentTask: 'Standing by for directives',
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
    skills: [
      'Directive Decomposition & Workflow Planning',
      'Compliance & Safety Verification',
      'Executive Synthesis & Vault Archival',
    ],
    permissions: [
      { name: 'swarm:orchestrate', description: 'Dispatch and coordinate executive agent threads', category: 'Coordination', isSafeMock: true },
      { name: 'tasks:delegate', description: 'Assign, prioritize, and rebalance task queues', category: 'Coordination', isSafeMock: true },
      { name: 'reports:synthesize', description: 'Compile and publish Executive Reports to OS Vault', category: 'System', isSafeMock: true },
      { name: 'slas:enforce', description: 'Enforce latency thresholds & constitutional compliance', category: 'System', isSafeMock: true },
      { name: 'mock:safe_execution', description: 'Execution is sandboxed; external capital transactions blocked', category: 'System', isSafeMock: true },
    ],
    taskQueue: [],
    activityHistory: [],
    recentActivity: [],
  },
  {
    id: 'researcher',
    name: 'Dr. Aris Thorne',
    role: 'Lead Market & Intelligence Researcher',
    department: 'Market Intelligence & Deep Tech',
    avatarColor: 'from-amber-500 to-orange-600',
    accentColor: '#fbbf24',
    status: 'idle',
    currentTask: 'Standing by for directives',
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
    skills: [
      'Market Intelligence & Competitor Reconnaissance',
      'Software Repository & Architecture Reconnaissance',
    ],
    permissions: [
      { name: 'market:read_intel', description: 'Access market indices and competitor benchmarks', category: 'Intelligence', isSafeMock: true },
      { name: 'trends:scrape_safe', description: 'Simulated crawl of research trends and tech documentation', category: 'Intelligence', isSafeMock: true },
      { name: 'benchmarks:evaluate', description: 'Run model latency and architectural comparisons', category: 'Intelligence', isSafeMock: true },
      { name: 'mock:safe_execution', description: 'Read-only access; no live external mutations', category: 'System', isSafeMock: true },
    ],
    taskQueue: [],
    activityHistory: [],
    recentActivity: [],
  },
  {
    id: 'pm',
    name: 'Maya Lin',
    role: 'Principal Product Manager',
    department: 'Product Strategy & User Experience',
    avatarColor: 'from-rose-500 to-pink-600',
    accentColor: '#f43f5e',
    status: 'idle',
    currentTask: 'Standing by for directives',
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
    skills: [
      'Product Requirements Document (PRD) Authoring',
      'Technical Requirements & Workflow Analysis',
    ],
    permissions: [
      { name: 'specs:create_prd', description: 'Author and modify Product Requirement Documents', category: 'Product', isSafeMock: true },
      { name: 'backlog:prioritize', description: 'Score features and groom sprint backlogs', category: 'Product', isSafeMock: true },
      { name: 'ux:architect_flows', description: 'Generate user personas and wireframe specifications', category: 'Product', isSafeMock: true },
      { name: 'mock:safe_execution', description: 'Specs are virtual documents; no live code deployment', category: 'System', isSafeMock: true },
    ],
    taskQueue: [],
    activityHistory: [],
    recentActivity: [],
  },
  {
    id: 'finance',
    name: 'Julian Cruz',
    role: 'Chief Financial Analyst',
    department: 'Capital, Treasury & Unit Economics',
    avatarColor: 'from-emerald-500 to-teal-600',
    accentColor: '#34d399',
    status: 'idle',
    currentTask: 'Standing by for directives',
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
    skills: [
      'Unit Economics & Compute Burn Modeling',
      'Pricing Tier & Packaging Simulation',
      'Capital Efficiency & Spend Audit',
    ],
    permissions: [
      { name: 'unit_economics:simulate', description: 'Run financial sensitivity and gross margin models', category: 'Financial', isSafeMock: true },
      { name: 'spend:audit_tokens', description: 'Monitor token expenditure and compute efficiency', category: 'Financial', isSafeMock: true },
      { name: 'pricing:model_tiers', description: 'Simulate tiered subscription revenue & unit economics', category: 'Financial', isSafeMock: true },
      { name: 'mock:safe_execution', description: 'Simulation only; real bank transfer & payment gateway execution disabled', category: 'System', isSafeMock: true },
    ],
    taskQueue: [],
    activityHistory: [],
    recentActivity: [],
  },
];

// ============================================================================
// 4. FOUNDER ATTENTION & ESCALATIONS (Needs Founder Attention)
// ============================================================================

export const INITIAL_ATTENTION_ITEMS: AttentionItem[] = [];

// ============================================================================
// 5. ACTIVE COMPANY INITIATIVES
// ============================================================================

export const INITIAL_INITIATIVES: CompanyInitiative[] = [];

// ============================================================================
// 6. COMPANY GOVERNANCE DECISION LOG
// ============================================================================

export const INITIAL_COMPANY_DECISIONS: CompanyDecision[] = [];

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
];

export const NOTIFICATIONS = INITIAL_NOTIFICATIONS;

// ============================================================================
// 8. CRM / PRODUCT / RESEARCH & FINANCIAL STATE
// ============================================================================

/**
 * Customer Deals & CRM Pipeline
 */
export const SAMPLE_PIPELINE_DEALS: CustomerDeal[] = [];
export const INITIAL_DEALS = SAMPLE_PIPELINE_DEALS;

/**
 * Product Features & Roadmap Items
 */
export const INITIAL_FEATURES: ProductFeature[] = [];

/**
 * Research Intelligence Radar
 */
export const INITIAL_RESEARCH: ResearchTopic[] = [];

/**
 * Financial Planning State (Zeroed Until User / Agent Input)
 */
export const SAMPLE_FINANCIAL_MODEL: FinanceMetric = {
  mrr: 0,
  arr: 0,
  grossMargin: 0,
  computeSpend: 0,
  runwayMonths: 0,
  burnRate: 0,
  netIncome: 0,
  tokenUsageMillions: 0,
  isSimulatedModel: true,
};

export const INITIAL_FINANCIALS = SAMPLE_FINANCIAL_MODEL;

// ============================================================================
// 9. INITIAL ORCHESTRATION DELIVERABLE BUNDLE (Idle Ready State)
// ============================================================================

export const INITIAL_ORCHESTRATION: OrchestrationRun = {
  id: 'run-idle',
  directive: '',
  timestamp: 'System Ready',
  status: 'completed',
  title: 'Executive Council Ready',
  summary: 'All 4 AI executives (COO, Researcher, PM, Finance) are initialized and standing by for directives.',
  plan: [],
  messages: [],
  deliverables: [],
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
