'use client';

import { AgentRole } from '@/types/os';
import {
  RoleSkillTree,
  SkillNode,
  SimulationDrill,
  DrillEvaluationResult,
  CertificationBadge,
  EmployeeTrainingProfile,
  OnboardingPhase,
  OnboardingChecklistItem,
  CustomAIEmployeeDraft,
  OrchestratorBoostModifiers,
} from './types';
import {
  DEFAULT_SKILL_TREES,
  DEFAULT_EMPLOYEE_TRAINING_PROFILES,
  DEFAULT_SIMULATION_DRILLS,
  DEFAULT_CERTIFICATION_BADGES,
  DEFAULT_ONBOARDING_CHECKLIST,
} from './default-data';

const STORAGE_KEY_PROFILES = 'samjuniors_employee_training_profiles_v1';
const STORAGE_KEY_SKILL_TREES = 'samjuniors_employee_skill_trees_v1';
const STORAGE_KEY_DRILLS = 'samjuniors_simulation_drills_v1';
const STORAGE_KEY_CUSTOM_AGENTS = 'samjuniors_custom_ai_employees_v1';

type Listener = () => void;

class TrainingStoreClass {
  private profiles: Record<string, EmployeeTrainingProfile> = {};
  private skillTrees: Record<string, RoleSkillTree> = {};
  private drills: SimulationDrill[] = [];
  private customAgents: CustomAIEmployeeDraft[] = [];
  private listeners: Set<Listener> = new Set();
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') {
      this.profiles = { ...DEFAULT_EMPLOYEE_TRAINING_PROFILES };
      this.skillTrees = { ...DEFAULT_SKILL_TREES };
      this.drills = [...DEFAULT_SIMULATION_DRILLS];
      return;
    }

    try {
      const storedProfiles = localStorage.getItem(STORAGE_KEY_PROFILES);
      if (storedProfiles) {
        this.profiles = JSON.parse(storedProfiles);
      } else {
        this.profiles = { ...DEFAULT_EMPLOYEE_TRAINING_PROFILES };
      }

      const storedTrees = localStorage.getItem(STORAGE_KEY_SKILL_TREES);
      if (storedTrees) {
        this.skillTrees = JSON.parse(storedTrees);
      } else {
        this.skillTrees = { ...DEFAULT_SKILL_TREES };
      }

      const storedDrills = localStorage.getItem(STORAGE_KEY_DRILLS);
      if (storedDrills) {
        this.drills = JSON.parse(storedDrills);
      } else {
        this.drills = [...DEFAULT_SIMULATION_DRILLS];
      }

      const storedCustom = localStorage.getItem(STORAGE_KEY_CUSTOM_AGENTS);
      if (storedCustom) {
        this.customAgents = JSON.parse(storedCustom);
      }
    } catch (e) {
      console.warn('Failed to load training store from localStorage:', e);
      this.profiles = { ...DEFAULT_EMPLOYEE_TRAINING_PROFILES };
      this.skillTrees = { ...DEFAULT_SKILL_TREES };
      this.drills = [...DEFAULT_SIMULATION_DRILLS];
    }

    this.isInitialized = true;
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(this.profiles));
      localStorage.setItem(STORAGE_KEY_SKILL_TREES, JSON.stringify(this.skillTrees));
      localStorage.setItem(STORAGE_KEY_DRILLS, JSON.stringify(this.drills));
      localStorage.setItem(STORAGE_KEY_CUSTOM_AGENTS, JSON.stringify(this.customAgents));
    } catch (e) {
      console.error('Failed to persist training store:', e);
    }
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Listener error in TrainingStore:', err);
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('samjuniors-training-updated', {
          detail: { timestamp: new Date().toISOString() },
        })
      );
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // --------------------------------------------------------------------------
  // GETTERS
  // --------------------------------------------------------------------------

  public getProfiles(): Record<string, EmployeeTrainingProfile> {
    return this.profiles;
  }

  public getProfile(agentId: string): EmployeeTrainingProfile | undefined {
    return this.profiles[agentId];
  }

  public getSkillTrees(): Record<string, RoleSkillTree> {
    return this.skillTrees;
  }

  public getSkillTree(roleId: string): RoleSkillTree | undefined {
    return this.skillTrees[roleId];
  }

  public getDrills(): SimulationDrill[] {
    return this.drills;
  }

  public getDrillsForRole(roleId: string): SimulationDrill[] {
    return this.drills.filter((d) => d.roleId === roleId);
  }

  public getCustomAgents(): CustomAIEmployeeDraft[] {
    return this.customAgents;
  }

  // --------------------------------------------------------------------------
  // SKILL TREE ACTIONS
  // --------------------------------------------------------------------------

  public unlockSkillNode(agentId: string, nodeId: string): { success: boolean; message: string } {
    const profile = this.profiles[agentId];
    const tree = this.skillTrees[agentId];

    if (!profile || !tree) {
      return { success: false, message: 'Employee or skill tree not found.' };
    }

    // Find node in tree
    let targetNode: SkillNode | undefined;
    for (const branch of tree.branches) {
      const found = branch.nodes.find((n) => n.id === nodeId);
      if (found) {
        targetNode = found;
        break;
      }
    }

    if (!targetNode) {
      return { success: false, message: 'Skill node does not exist in this tree.' };
    }

    if (profile.unlockedNodeIds.includes(nodeId) || targetNode.isUnlocked) {
      return { success: false, message: 'Skill node is already unlocked.' };
    }

    // Check prerequisites
    if (targetNode.prerequisiteNodeIds.length > 0) {
      const missingPrereq = targetNode.prerequisiteNodeIds.find(
        (preId) => !profile.unlockedNodeIds.includes(preId)
      );
      if (missingPrereq) {
        return {
          success: false,
          message: 'Prerequisite skill nodes must be mastered before unlocking this ability.',
        };
      }
    }

    // Check XP budget
    if (profile.currentXp < targetNode.xpCost) {
      return {
        success: false,
        message: `Insufficient Skill XP. Requires ${targetNode.xpCost} XP, but employee currently has ${profile.currentXp} XP.`,
      };
    }

    // Unlock node
    targetNode.isUnlocked = true;
    targetNode.unlockedAt = new Date().toISOString();
    profile.unlockedNodeIds.push(nodeId);
    profile.currentXp -= targetNode.xpCost;
    profile.orchestratorPerformanceStats.activeModifiersCount = profile.unlockedNodeIds.length;

    // Check if level upgrades
    this.recalculateEmployeeLevel(agentId);

    this.persist();
    this.notify();

    return {
      success: true,
      message: `Successfully unlocked "${targetNode.title}"! Orchestrator performance boost active.`,
    };
  }

  private recalculateEmployeeLevel(agentId: string) {
    const profile = this.profiles[agentId];
    if (!profile) return;

    const unlockedCount = profile.unlockedNodeIds.length;
    let newLevel = 1;
    let nextXp = 1000;
    let rank = 'Junior Specialist';

    if (unlockedCount >= 8) {
      newLevel = 5;
      nextXp = 5000;
      rank = 'Grandmaster Executive';
    } else if (unlockedCount >= 6) {
      newLevel = 4;
      nextXp = 3500;
      rank = 'Lead Specialist';
    } else if (unlockedCount >= 4) {
      newLevel = 3;
      nextXp = 2500;
      rank = 'Senior Specialist';
    } else if (unlockedCount >= 2) {
      newLevel = 2;
      nextXp = 1800;
      rank = 'Certified Practitioner';
    }

    profile.level = newLevel;
    profile.nextLevelXp = nextXp;
    profile.specializationRank = rank;
  }

  // --------------------------------------------------------------------------
  // DRILL SIMULATION & CERTIFICATION
  // --------------------------------------------------------------------------

  public recordDrillResult(result: DrillEvaluationResult) {
    const profile = this.profiles[result.agentId];
    if (!profile) return;

    // Save drill run
    profile.drillResults.unshift(result);
    if (!profile.completedDrillIds.includes(result.drillId) && result.passed) {
      profile.completedDrillIds.push(result.drillId);
      profile.currentXp += result.xpAwarded;
      profile.onboarding.activeDrillsPassed += 1;

      // Find if drill grants badge
      const drill = this.drills.find((d) => d.id === result.drillId);
      if (drill && drill.badgeAwarded) {
        const badge = DEFAULT_CERTIFICATION_BADGES.find((b) => b.id === drill.badgeAwarded);
        if (badge && !profile.badges.some((b) => b.id === badge.id)) {
          profile.badges.push({ ...badge, awardedAt: new Date().toISOString() });
        }
      }
    }

    this.recalculateEmployeeLevel(result.agentId as string);
    this.persist();
    this.notify();
  }

  public awardBonusXp(agentId: string, amount: number, reason?: string) {
    const profile = this.profiles[agentId];
    if (!profile) return;
    profile.currentXp += amount;
    this.recalculateEmployeeLevel(agentId);
    this.persist();
    this.notify();
  }

  // --------------------------------------------------------------------------
  // ONBOARDING WORKFLOW & CHECKLIST
  // --------------------------------------------------------------------------

  public updateOnboardingPhase(agentId: string, phase: OnboardingPhase) {
    const profile = this.profiles[agentId];
    if (!profile) return;

    profile.onboarding.currentPhase = phase;
    this.calculateOnboardingProgress(agentId);
    this.persist();
    this.notify();
  }

  public toggleChecklistItem(agentId: string, itemId: string, completed: boolean) {
    const profile = this.profiles[agentId];
    if (!profile) return;

    const item = profile.onboarding.checklist.find((c) => c.id === itemId);
    if (item) {
      item.isCompleted = completed;
      if (completed) {
        item.completedAt = new Date().toISOString();
      } else {
        item.completedAt = undefined;
      }
      this.calculateOnboardingProgress(agentId);
      this.persist();
      this.notify();
    }
  }

  public signConstitutionalAgreement(agentId: string) {
    const profile = this.profiles[agentId];
    if (!profile) return;

    profile.onboarding.constitutionalAgreementSigned = true;
    const item = profile.onboarding.checklist.find((c) => c.phase === 'constitutional_alignment');
    if (item) {
      item.isCompleted = true;
      item.completedAt = new Date().toISOString();
    }
    this.calculateOnboardingProgress(agentId);
    this.persist();
    this.notify();
  }

  private calculateOnboardingProgress(agentId: string) {
    const profile = this.profiles[agentId];
    if (!profile) return;

    const total = profile.onboarding.checklist.length;
    const completed = profile.onboarding.checklist.filter((c) => c.isCompleted).length;
    const pct = Math.round((completed / total) * 100);

    profile.onboarding.progressPct = pct;
    profile.onboarding.isFullyOnboarded = pct === 100;
    if (pct === 100 && !profile.onboarding.onboardedAt) {
      profile.onboarding.onboardedAt = new Date().toISOString();
    }
  }

  // --------------------------------------------------------------------------
  // CUSTOM AI EMPLOYEE ONBOARDING WIZARD
  // --------------------------------------------------------------------------

  public onboardCustomEmployee(draft: CustomAIEmployeeDraft): { success: boolean; agentId: string } {
    const slug = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `agent_${Date.now()}`;
    const agentId = `custom_${slug}`;

    this.customAgents.push(draft);

    // Create custom checklist
    const checklist: OnboardingChecklistItem[] = DEFAULT_ONBOARDING_CHECKLIST.map((item, idx) => ({
      ...item,
      id: `custom_${agentId}_step_${idx + 1}`,
      isCompleted: idx === 0, // Auto-sign invariant on creation
      completedAt: idx === 0 ? new Date().toISOString() : undefined,
    }));

    // Create custom skill tree
    const customTree: RoleSkillTree = {
      roleId: agentId,
      roleTitle: draft.role,
      agentName: draft.name,
      avatarColor: draft.avatarColor,
      accentColor: draft.accentColor,
      totalXpAvailable: 3000,
      branches: [
        {
          id: `${agentId}_core`,
          name: 'Core Operational Mastery',
          description: `Core domain execution skills for ${draft.name}.`,
          accentColor: draft.accentColor,
          iconName: 'Zap',
          nodes: [
            {
              id: `${agentId}_node_1`,
              roleId: agentId,
              branchId: `${agentId}_core`,
              title: 'Domain Foundation',
              description: `Baseline execution for ${draft.role}.`,
              level: 1,
              tierName: 'Novice Foundation',
              xpCost: 200,
              prerequisiteNodeIds: [],
              isUnlocked: true,
              unlockedAt: new Date().toISOString(),
              boostModifiers: {
                promptDirectiveInjection: `Adhere strictly to the executive mandate: ${draft.executiveMandate}`,
                latencyReductionMs: 40,
                epistemicConfidenceMultiplier: 1.05,
                unlockedTools: [],
                errorToleranceReductionPct: 10,
                specializedCapabilities: draft.primarySkills,
              },
              iconName: 'Briefcase',
            },
            {
              id: `${agentId}_node_2`,
              roleId: agentId,
              branchId: `${agentId}_core`,
              title: 'Autonomous Execution Protocol',
              description: 'Independent task decomposition and zero-error delivery.',
              level: 2,
              tierName: 'Practitioner',
              xpCost: 500,
              prerequisiteNodeIds: [`${agentId}_node_1`],
              isUnlocked: false,
              boostModifiers: {
                promptDirectiveInjection: `Execute complex parallel streams with zero hallucination and 100% adherence to prohibited actions.`,
                latencyReductionMs: 120,
                epistemicConfidenceMultiplier: 1.15,
                unlockedTools: [],
                errorToleranceReductionPct: 25,
                specializedCapabilities: ['Autonomous Pipeline Execution', 'Multi-Agent Relay'],
              },
              iconName: 'Cpu',
            },
            {
              id: `${agentId}_node_3`,
              roleId: agentId,
              branchId: `${agentId}_core`,
              title: 'Grandmaster Specialization',
              description: 'Executive-grade synthesis and strategic autonomous operations.',
              level: 3,
              tierName: 'Master Specialization',
              xpCost: 900,
              prerequisiteNodeIds: [`${agentId}_node_2`],
              isUnlocked: false,
              boostModifiers: {
                promptDirectiveInjection: `Synthesize institutional grade deliverables with risk-adjusted ROI.`,
                latencyReductionMs: 250,
                epistemicConfidenceMultiplier: 1.30,
                unlockedTools: [],
                errorToleranceReductionPct: 45,
                specializedCapabilities: ['Strategic Autonomous Operations', 'Institutional Synthesis'],
              },
              iconName: 'Crown',
            },
          ],
        },
      ],
    };

    // Create custom training profile
    const customProfile: EmployeeTrainingProfile = {
      agentId,
      name: draft.name,
      roleTitle: draft.role,
      level: 1,
      currentXp: 800,
      nextLevelXp: 1500,
      specializationRank: 'Onboarding Specialist',
      unlockedNodeIds: [`${agentId}_node_1`],
      completedDrillIds: [],
      drillResults: [],
      badges: [],
      onboarding: {
        agentId,
        currentPhase: 'tool_epistemic_calibration',
        progressPct: 20,
        isFullyOnboarded: false,
        checklist,
        constitutionalAgreementSigned: true,
        calibratedContextWindowTokens: 1000000,
        assignedSpecializationTitle: draft.role,
        activeDrillsPassed: 0,
      },
      orchestratorPerformanceStats: {
        totalDirectivesExecuted: 0,
        averageSlaMs: 500,
        epistemicPrecisionRate: 98.0,
        constitutionalViolations: 0,
        activeModifiersCount: 1,
      },
    };

    this.profiles[agentId] = customProfile;
    this.skillTrees[agentId] = customTree;

    this.persist();
    this.notify();

    return { success: true, agentId };
  }

  // --------------------------------------------------------------------------
  // ORCHESTRATOR BOOST EXTRACTOR
  // --------------------------------------------------------------------------

  public getActiveModifiersForAgent(agentId: string): OrchestratorBoostModifiers {
    const profile = this.profiles[agentId];
    const tree = this.skillTrees[agentId];

    const aggregated: OrchestratorBoostModifiers = {
      promptDirectiveInjection: '',
      latencyReductionMs: 0,
      epistemicConfidenceMultiplier: 1.0,
      unlockedTools: [],
      errorToleranceReductionPct: 0,
      specializedCapabilities: [],
    };

    if (!profile || !tree) return aggregated;

    const directives: string[] = [];
    const capabilities: Set<string> = new Set();
    const tools: Set<any> = new Set();

    for (const branch of tree.branches) {
      for (const node of branch.nodes) {
        if (profile.unlockedNodeIds.includes(node.id)) {
          const mod = node.boostModifiers;
          if (mod.promptDirectiveInjection) directives.push(`[${node.title}]: ${mod.promptDirectiveInjection}`);
          aggregated.latencyReductionMs += mod.latencyReductionMs;
          aggregated.epistemicConfidenceMultiplier = Math.max(
            aggregated.epistemicConfidenceMultiplier,
            mod.epistemicConfidenceMultiplier
          );
          aggregated.errorToleranceReductionPct += mod.errorToleranceReductionPct;
          mod.specializedCapabilities.forEach((c) => capabilities.add(c));
          mod.unlockedTools.forEach((t) => tools.add(t));
        }
      }
    }

    aggregated.promptDirectiveInjection = directives.join('\n');
    aggregated.specializedCapabilities = Array.from(capabilities);
    aggregated.unlockedTools = Array.from(tools);

    return aggregated;
  }
}

export const TrainingStore = new TrainingStoreClass();
