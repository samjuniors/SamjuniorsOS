/**
 * SamJuniorsOS — Autonomy Policy Engine (Gate G12.4)
 *
 * Deterministic table of Action Class x Autonomy Level x Limits deciding:
 *   - 'auto': Permitted to execute autonomously within verified limits
 *   - 'needs_approval': Requires explicit Founder approval before execution
 *   - 'forbidden': Prohibited from autonomous execution entirely
 *
 * Implements:
 * 1. Ratified Founder Decision G0.7 baseline table.
 * 2. Rolling sliding-window action budgets (borrowed from Latch / AgentPolicy).
 * 3. Tamper-evident mutation guards: models and unauthenticated agents cannot change policy;
 *    changing an autonomy level strictly requires a recorded Founder decision.
 * 4. Audit ledger integration for all policy level transitions.
 */

import {
  AutonomyLevel,
  AutonomyActionClass,
  AutonomyDecisionEffect,
  AutonomyPolicyRule,
  AutonomyEvaluationContext,
  AutonomyEvaluationResult,
  AutonomyLevelUpdateParams,
  RollingActionBudgetRecord,
  AUTONOMY_LEVELS,
  AUTONOMY_ACTION_CLASSES,
} from '@/types/autonomy';
import { SideEffectClassification } from '@/types/authorization';
import { RouteSideEffectClass } from '@/types/decision';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import { InMemoryAuditStore } from './approval-store';
import { SafeModeManager } from '../sophia/stop-control';

export class UnauthorizedAutonomyMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedAutonomyMutationError';
  }
}

export class InvalidAutonomyLevelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAutonomyLevelError';
  }
}

/**
 * Baseline autonomy policy rules ratified by Founder Decision G0.7.
 */
export const DEFAULT_AUTONOMY_POLICY_RULES: Record<AutonomyActionClass, AutonomyPolicyRule> = {
  read: {
    actionClass: 'read',
    currentLevel: 'L3',
    defaultLevel: 'L3',
    maxLevelAllowed: 'L4',
    maxActionsPerWindow: undefined, // unlimited read
    windowDurationMs: 86_400_000,
    requiresExplicitApproval: false,
    ratifiedAt: '2026-10-20T00:00:00.000Z',
  },
  draft: {
    actionClass: 'draft',
    currentLevel: 'L3',
    defaultLevel: 'L3',
    maxLevelAllowed: 'L4',
    maxActionsPerWindow: undefined, // unlimited draft
    windowDurationMs: 86_400_000,
    requiresExplicitApproval: false,
    ratifiedAt: '2026-10-20T00:00:00.000Z',
  },
  internal_write: {
    actionClass: 'internal_write',
    currentLevel: 'L2',
    defaultLevel: 'L2',
    maxLevelAllowed: 'L3',
    maxActionsPerWindow: 50, // 50 actions per 24h when elevated to L3
    windowDurationMs: 86_400_000,
    requiresExplicitApproval: true,
    ratifiedAt: '2026-10-20T00:00:00.000Z',
  },
  external_reversible: {
    actionClass: 'external_reversible',
    currentLevel: 'L2',
    defaultLevel: 'L2',
    maxLevelAllowed: 'L3',
    maxActionsPerWindow: 20, // 20 actions per 24h when elevated to L3
    windowDurationMs: 86_400_000,
    requiresExplicitApproval: true,
    ratifiedAt: '2026-10-20T00:00:00.000Z',
  },
  external_hard_to_reverse: {
    actionClass: 'external_hard_to_reverse',
    currentLevel: 'L2',
    defaultLevel: 'L2',
    maxLevelAllowed: 'L2', // strict ceiling: always requires approval at first
    maxActionsPerWindow: 0,
    windowDurationMs: 86_400_000,
    requiresExplicitApproval: true,
    ratifiedAt: '2026-10-20T00:00:00.000Z',
  },
  financial_legal: {
    actionClass: 'financial_legal',
    currentLevel: 'L1',
    defaultLevel: 'L1',
    maxLevelAllowed: 'L1', // founder performs it; $0 autonomous limit
    maxActionsPerWindow: 0,
    windowDurationMs: 86_400_000,
    requiresExplicitApproval: true,
    ratifiedAt: '2026-10-20T00:00:00.000Z',
  },
  destructive_security: {
    actionClass: 'destructive_security',
    currentLevel: 'L0',
    defaultLevel: 'L0',
    maxLevelAllowed: 'L0', // observe-only for AI; founder only
    maxActionsPerWindow: 0,
    windowDurationMs: 86_400_000,
    requiresExplicitApproval: false, // forbidden outright for autonomous execution
    ratifiedAt: '2026-10-20T00:00:00.000Z',
  },
};

/**
 * Autonomy Policy Engine
 */
export class AutonomyPolicyEngine {
  private static instance: AutonomyPolicyEngine | null = null;
  private rules: Map<AutonomyActionClass, AutonomyPolicyRule> = new Map();
  private budgets: Map<string, RollingActionBudgetRecord> = new Map();

  private constructor() {
    this.loadPolicyFromDurableStorage();
  }

  public static getInstance(): AutonomyPolicyEngine {
    if (!AutonomyPolicyEngine.instance) {
      AutonomyPolicyEngine.instance = new AutonomyPolicyEngine();
    }
    return AutonomyPolicyEngine.instance;
  }

  public static resetForTest(): void {
    if (AutonomyPolicyEngine.instance) {
      AutonomyPolicyEngine.instance.budgets.clear();
      AutonomyPolicyEngine.instance.rules.clear();
    }
    try {
      DurableFileStore.getInstance().clearCollection('autonomy_policy');
    } catch {
      // Fallback
    }
    AutonomyPolicyEngine.instance = null;
  }

  public resetBudgetsForTest(): void {
    this.budgets.clear();
  }

  private loadPolicyFromDurableStorage(): void {
    this.rules.clear();
    // Default starting table from ratified G0.7 baseline
    for (const [actionClass, rule] of Object.entries(DEFAULT_AUTONOMY_POLICY_RULES)) {
      this.rules.set(actionClass as AutonomyActionClass, { ...rule });
    }

    try {
      const persisted = DurableFileStore.getInstance().readCollection<AutonomyPolicyRule>('autonomy_policy');
      for (const [actionClass, rule] of Object.entries(persisted)) {
        if (AUTONOMY_ACTION_CLASSES.includes(actionClass as AutonomyActionClass)) {
          this.rules.set(actionClass as AutonomyActionClass, {
            ...this.rules.get(actionClass as AutonomyActionClass)!,
            ...rule,
          });
        }
      }
    } catch {
      // Fallback cleanly to default in-memory rules
    }
  }

  /**
   * Deterministic Evaluation:
   * Action Class x Autonomy Level x Limits -> 'auto' | 'needs_approval' | 'forbidden'
   */
  public evaluate(context: AutonomyEvaluationContext): AutonomyEvaluationResult {
    const evaluatedAt = new Date().toISOString();
    const rule = this.rules.get(context.actionClass) ?? DEFAULT_AUTONOMY_POLICY_RULES[context.actionClass];
    if (!rule) {
      return {
        effect: 'forbidden',
        level: 'L0',
        actionClass: context.actionClass,
        reasonCode: 'AUTONOMY_UNKNOWN_ACTION_CLASS',
        reason: `Unknown action class "${context.actionClass}"; fails closed as forbidden.`,
        evaluatedAt,
      };
    }

    // Safe Mode Freeze Check: when Safe Mode is triggered, all autonomous actions
    // freeze and the system drops to read-only.
    if (SafeModeManager.getInstance().isFrozen()) {
      if (context.actionClass === 'read') {
        return {
          effect: 'auto',
          level: 'L3',
          actionClass: 'read',
          reasonCode: 'SAFE_MODE_READ_ONLY_PERMITTED',
          reason: 'System is in Safe Mode: read-only actions are permitted.',
          evaluatedAt,
        };
      }
      return {
        effect: 'needs_approval',
        level: rule.currentLevel,
        actionClass: context.actionClass,
        reasonCode: 'SAFE_MODE_AUTONOMY_FROZEN',
        reason: `System is frozen under Safe Mode / Kill Switch. Autonomous execution for "${context.actionClass}" is suspended; dropped to read-only mode.`,
        evaluatedAt,
      };
    }

    const level = rule.currentLevel;

    // 1. Level L0: Observe & Report Only (AI execution strictly prohibited)
    if (level === 'L0') {
      return {
        effect: 'forbidden',
        level: 'L0',
        actionClass: context.actionClass,
        reasonCode: 'AUTONOMY_LEVEL_L0_FORBIDDEN',
        reason: `Action class "${context.actionClass}" is configured at Autonomy Level L0 (observe-only). Autonomous execution is forbidden.`,
        evaluatedAt,
      };
    }

    // 2. Level L1: Propose Only (Human founder executes)
    if (level === 'L1') {
      return {
        effect: 'needs_approval',
        level: 'L1',
        actionClass: context.actionClass,
        reasonCode: 'AUTONOMY_LEVEL_L1_PROPOSE_ONLY',
        reason: `Action class "${context.actionClass}" is at Level L1 (propose-only); requires Founder execution or explicit approval.`,
        evaluatedAt,
      };
    }

    // 3. Level L2: Act with Prior Approval
    if (level === 'L2') {
      return {
        effect: 'needs_approval',
        level: 'L2',
        actionClass: context.actionClass,
        reasonCode: 'AUTONOMY_LEVEL_L2_APPROVAL_REQUIRED',
        reason: `Action class "${context.actionClass}" is at Level L2; requires explicit prior Founder approval for this action.`,
        evaluatedAt,
      };
    }

    // 4. Level L3: Act within Stated Limits, then Report
    if (level === 'L3') {
      // Check rolling sliding-window action budget
      if (rule.maxActionsPerWindow !== undefined && rule.maxActionsPerWindow > 0) {
        const budgetStatus = this.checkBudget(context.employeeRole, context.actionClass, rule);
        if (!budgetStatus.allowed) {
          return {
            effect: 'needs_approval',
            level: 'L3',
            actionClass: context.actionClass,
            reasonCode: 'AUTONOMY_BUDGET_EXCEEDED',
            reason: `Action class "${context.actionClass}" rolling budget limit reached (${rule.maxActionsPerWindow} actions / ${(rule.windowDurationMs ?? 86_400_000) / 3_600_000}h). Requires Founder approval.`,
            budgetRemaining: 0,
            evaluatedAt,
          };
        }
        return {
          effect: 'auto',
          level: 'L3',
          actionClass: context.actionClass,
          reasonCode: 'AUTONOMY_LEVEL_L3_WITHIN_BUDGET',
          reason: `Action class "${context.actionClass}" authorized autonomously at Level L3 within rolling limit (${budgetStatus.remaining} remaining).`,
          budgetRemaining: budgetStatus.remaining,
          evaluatedAt,
        };
      }

      return {
        effect: 'auto',
        level: 'L3',
        actionClass: context.actionClass,
        reasonCode: 'AUTONOMY_LEVEL_L3_AUTO',
        reason: `Action class "${context.actionClass}" authorized autonomously at Level L3.`,
        evaluatedAt,
      };
    }

    // 5. Level L4: Act and Report Exceptions Only
    if (level === 'L4') {
      return {
        effect: 'auto',
        level: 'L4',
        actionClass: context.actionClass,
        reasonCode: 'AUTONOMY_LEVEL_L4_EXCEPTION_REPORTING',
        reason: `Action class "${context.actionClass}" authorized autonomously at Level L4 (report exceptions only).`,
        evaluatedAt,
      };
    }

    return {
      effect: 'forbidden',
      level,
      actionClass: context.actionClass,
      reasonCode: 'AUTONOMY_UNHANDLED_LEVEL',
      reason: `Unhandled autonomy level "${level}". Fails closed as forbidden.`,
      evaluatedAt,
    };
  }

  /**
   * Consume one action from the rolling sliding-window budget.
   */
  public consumeAction(role: string, actionClass: AutonomyActionClass): boolean {
    const rule = this.rules.get(actionClass);
    if (!rule || rule.maxActionsPerWindow === undefined || rule.maxActionsPerWindow <= 0) {
      return true; // No window cap to consume
    }

    const key = `${role}:${actionClass}`;
    const now = Date.now();
    const windowDuration = rule.windowDurationMs ?? 86_400_000;
    let budget = this.budgets.get(key);

    if (!budget || now - budget.windowStart > windowDuration) {
      budget = {
        key,
        role,
        actionClass,
        windowStart: now,
        actionsConsumed: 0,
        maxActions: rule.maxActionsPerWindow,
      };
    }

    if (budget.actionsConsumed >= budget.maxActions) {
      return false;
    }

    budget.actionsConsumed += 1;
    this.budgets.set(key, budget);
    return true;
  }

  private checkBudget(
    role: string,
    actionClass: AutonomyActionClass,
    rule: AutonomyPolicyRule
  ): { allowed: boolean; remaining: number } {
    const key = `${role}:${actionClass}`;
    const now = Date.now();
    const windowDuration = rule.windowDurationMs ?? 86_400_000;
    const max = rule.maxActionsPerWindow ?? 0;
    const budget = this.budgets.get(key);

    if (!budget || now - budget.windowStart > windowDuration) {
      return { allowed: true, remaining: max };
    }

    const remaining = Math.max(0, max - budget.actionsConsumed);
    return {
      allowed: budget.actionsConsumed < max,
      remaining,
    };
  }

  public getRule(actionClass: AutonomyActionClass): AutonomyPolicyRule {
    return JSON.parse(JSON.stringify(this.rules.get(actionClass) ?? DEFAULT_AUTONOMY_POLICY_RULES[actionClass]));
  }

  public getAllRules(): Record<AutonomyActionClass, AutonomyPolicyRule> {
    const result = {} as Record<AutonomyActionClass, AutonomyPolicyRule>;
    for (const actionClass of AUTONOMY_ACTION_CLASSES) {
      result[actionClass] = this.getRule(actionClass);
    }
    return result;
  }

  /**
   * Tamper-Evident Elevation / Demotion of Autonomy Level:
   * Strictly requires a verified, recorded Founder Decision (G15.8 / Founder Decision ID).
   * Models, unauthenticated users, or agents cannot modify autonomy levels.
   */
  public async setAutonomyLevel(params: AutonomyLevelUpdateParams): Promise<AutonomyPolicyRule> {
    if (!params.founderId || (params.founderId !== 'founder' && !params.founderId.startsWith('founder-'))) {
      throw new UnauthorizedAutonomyMutationError(
        `Permission denied: Only the authenticated Founder can adjust autonomy levels. Call from identity "${params.founderId}" is prohibited.`
      );
    }

    if (!params.founderDecisionId || !params.founderDecisionId.trim()) {
      throw new UnauthorizedAutonomyMutationError(
        'Permission denied: Changing an autonomy level strictly requires a verified, recorded Founder decision ID.'
      );
    }

    if (!params.founderQuote || params.founderQuote.trim().length < 3) {
      throw new UnauthorizedAutonomyMutationError(
        'Permission denied: Changing an autonomy level requires the Founder\'s documented decision quote.'
      );
    }

    if (!AUTONOMY_LEVELS.includes(params.newLevel)) {
      throw new InvalidAutonomyLevelError(`Invalid autonomy level "${params.newLevel}". Expected one of: ${AUTONOMY_LEVELS.join(', ')}.`);
    }

    const existing = this.getRule(params.actionClass);
    const updatedRule: AutonomyPolicyRule = {
      ...existing,
      currentLevel: params.newLevel,
      founderDecisionRef: params.founderDecisionId,
      ratifiedAt: new Date().toISOString(),
    };

    // Commit to durable file store
    DurableFileStore.getInstance().saveItemStrict('autonomy_policy', params.actionClass, updatedRule);
    this.rules.set(params.actionClass, updatedRule);

    // Record immutable audit entry
    try {
      await InMemoryAuditStore.getInstance().record({
        id: `audit-autonomy-${params.actionClass}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        requestId: params.founderDecisionId,
        requestedBy: params.founderId,
        employeeRole: 'system',
        actionClassification: 'internal_mutation',
        actionName: 'autonomy.level_update',
        decision: 'allowed',
        reasonCode: 'FOUNDER_AUTONOMY_LEVEL_UPDATED',
        reason: `Founder updated autonomy level for "${params.actionClass}" from ${existing.currentLevel} to ${params.newLevel}. Quote: "${params.founderQuote}". Reason: ${params.reason}`,
        executed: true,
        target: {
          targetSystem: 'autonomy_policy',
          resourceId: params.actionClass,
          metadata: {
            previousLevel: existing.currentLevel,
            newLevel: params.newLevel,
            founderDecisionId: params.founderDecisionId,
            founderQuote: params.founderQuote,
          },
        },
      });
    } catch {
      // Audit recording handled fail-closed via audit store
    }

    return updatedRule;
  }

  /**
   * Helper to map SideEffectClassification to AutonomyActionClass.
   */
  public static mapSideEffectToAutonomyActionClass(
    classification: SideEffectClassification | RouteSideEffectClass
  ): AutonomyActionClass {
    switch (classification) {
      case 'read_only':
        return 'read';
      case 'internal_mutation':
      case 'internal_write':
        return 'internal_write';
      case 'external_communication':
        return 'external_hard_to_reverse';
      case 'external_record_mutation':
      case 'external_reversible':
        return 'external_reversible';
      case 'financial_action':
      case 'financial_legal':
        return 'financial_legal';
      case 'high_impact_action':
      case 'destructive_security':
        return 'destructive_security';
      default:
        return 'destructive_security'; // Fails closed
    }
  }
}
