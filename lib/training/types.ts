import { AgentRole, AgentWorkProtocolStep, PersonaTone } from '@/types/os';
import { ToolId } from '@/types/capabilities';

// ============================================================================
// SAMJUNIORS OS — AI EMPLOYEE ONBOARDING & SKILL TREE / TRAINING ARCHITECTURE
// ============================================================================

export type MasteryLevel = 1 | 2 | 3 | 4 | 5;

export interface OrchestratorBoostModifiers {
  promptDirectiveInjection: string;
  latencyReductionMs: number;
  epistemicConfidenceMultiplier: number;
  unlockedTools: ToolId[];
  errorToleranceReductionPct: number;
  specializedCapabilities: string[];
}

export interface SkillNode {
  id: string;
  roleId: AgentRole | string;
  branchId: string;
  title: string;
  description: string;
  level: MasteryLevel; // 1 (Novice), 2 (Practitioner), 3 (Specialist), 4 (Expert), 5 (Grandmaster)
  tierName: string;
  xpCost: number;
  prerequisiteNodeIds: string[];
  isUnlocked: boolean;
  unlockedAt?: string;
  boostModifiers: OrchestratorBoostModifiers;
  trainingDrillRef?: string;
  iconName: string;
}

export interface SkillBranch {
  id: string;
  name: string;
  description: string;
  accentColor: string;
  iconName: string;
  nodes: SkillNode[];
}

export interface RoleSkillTree {
  roleId: AgentRole | string;
  roleTitle: string;
  agentName: string;
  avatarColor: string;
  accentColor: string;
  totalXpAvailable: number;
  branches: SkillBranch[];
}

// ----------------------------------------------------------------------------
// ONBOARDING WORKFLOW & CHECKLIST TYPES
// ----------------------------------------------------------------------------

export type OnboardingPhase =
  | 'constitutional_alignment'
  | 'tool_epistemic_calibration'
  | 'skill_tree_specialization'
  | 'certification_simulation'
  | 'orchestrator_activation';

export interface OnboardingChecklistItem {
  id: string;
  title: string;
  description: string;
  phase: OnboardingPhase;
  isCompleted: boolean;
  completedAt?: string;
  verificationEvidence?: string;
}

export interface OnboardingState {
  agentId: AgentRole | string;
  currentPhase: OnboardingPhase;
  progressPct: number;
  isFullyOnboarded: boolean;
  onboardedAt?: string;
  checklist: OnboardingChecklistItem[];
  constitutionalAgreementSigned: boolean;
  calibratedContextWindowTokens: number;
  assignedSpecializationTitle: string;
  activeDrillsPassed: number;
}

// ----------------------------------------------------------------------------
// TRAINING & CERTIFICATION SIMULATION DRILLS
// ----------------------------------------------------------------------------

export type DrillDifficulty = 'Standard' | 'Advanced' | 'Stress Test' | 'Crisis Invariant';

export interface SimulationDrill {
  id: string;
  roleId: AgentRole | string;
  title: string;
  difficulty: DrillDifficulty;
  category: string;
  scenarioDescription: string;
  simulatedFounderDirective: string;
  expectedOutputs: string[];
  invariantEnforcements: string[];
  xpReward: number;
  badgeAwarded?: string;
  samplePassingAnswer: string;
}

export interface DrillEvaluationMetric {
  name: string;
  score: number; // 0 - 100
  maxScore: number;
  status: 'passed' | 'warning' | 'failed';
  commentary: string;
}

export interface DrillEvaluationResult {
  drillId: string;
  agentId: AgentRole | string;
  agentName: string;
  timestamp: string;
  overallScore: number; // 0 - 100
  passed: boolean;
  xpAwarded: number;
  metrics: DrillEvaluationMetric[];
  generatedDeliverable: string;
  constitutionalAudit: {
    safeMockVerified: boolean;
    zeroFabricatedMetricsVerified: boolean;
    secretLeakageZeroVerified: boolean;
    epistemicSeparationScore: number;
  };
  feedback: string;
}

// ----------------------------------------------------------------------------
// CERTIFICATIONS & BADGES
// ----------------------------------------------------------------------------

export interface CertificationBadge {
  id: string;
  title: string;
  description: string;
  roleId: AgentRole | string;
  awardedAt?: string;
  icon: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  glowColor: string;
}

// ----------------------------------------------------------------------------
// EMPLOYEE ACADEMY PROFILE
// ----------------------------------------------------------------------------

export interface EmployeeTrainingProfile {
  agentId: AgentRole | string;
  name: string;
  roleTitle: string;
  level: number;
  currentXp: number;
  nextLevelXp: number;
  specializationRank: string;
  unlockedNodeIds: string[];
  completedDrillIds: string[];
  drillResults: DrillEvaluationResult[];
  badges: CertificationBadge[];
  onboarding: OnboardingState;
  orchestratorPerformanceStats: {
    totalDirectivesExecuted: number;
    averageSlaMs: number;
    epistemicPrecisionRate: number; // 0 - 100%
    constitutionalViolations: number; // strictly 0
    activeModifiersCount: number;
  };
}

// ----------------------------------------------------------------------------
// CUSTOM AI EMPLOYEE ONBOARDING SCHEMA
// ----------------------------------------------------------------------------

export interface CustomAIEmployeeDraft {
  name: string;
  role: string;
  department: string;
  callsign: string;
  clearanceLevel: string;
  avatarColor: string;
  accentColor: string;
  systemInstruction: string;
  executiveMandate: string;
  primarySkills: string[];
  prohibitedActions: string[];
  baseTone: PersonaTone;
}
