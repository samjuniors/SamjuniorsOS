/**
 * SamJuniorsOS — Autonomy Policy Engine Types (Gate G12.4)
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Deterministic Table: Action Class x Autonomy Level x Limits -> 'auto' | 'needs_approval' | 'forbidden'.
 * 2. Immutable Governance: The model cannot change policy or autonomy levels; elevation strictly requires
 *    a verified, recorded Founder decision (ADR / G15.8 graduation).
 * 3. Rolling Action Budgets: Rolling sliding-window action rate limits per agent/role (borrowed from Latch / AgentPolicy).
 * 4. Grounded Baseline: Ratified by Founder Decision G0.7.
 */

export type AutonomyLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export const AUTONOMY_LEVELS: readonly AutonomyLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4'] as const;

export type AutonomyActionClass =
  | 'read'
  | 'draft'
  | 'internal_write'
  | 'external_reversible'
  | 'external_hard_to_reverse'
  | 'financial_legal'
  | 'destructive_security';

export const AUTONOMY_ACTION_CLASSES: readonly AutonomyActionClass[] = [
  'read',
  'draft',
  'internal_write',
  'external_reversible',
  'external_hard_to_reverse',
  'financial_legal',
  'destructive_security',
] as const;

export type AutonomyDecisionEffect = 'auto' | 'needs_approval' | 'forbidden';

export interface AutonomyPolicyRule {
  actionClass: AutonomyActionClass;
  currentLevel: AutonomyLevel;
  defaultLevel: AutonomyLevel;
  maxLevelAllowed: AutonomyLevel;
  maxActionsPerWindow?: number;
  windowDurationMs?: number;
  requiresExplicitApproval: boolean;
  founderDecisionRef?: string;
  ratifiedAt?: string;
}

export interface RollingActionBudgetRecord {
  key: string;
  role: string;
  actionClass: AutonomyActionClass;
  windowStart: number;
  actionsConsumed: number;
  maxActions: number;
}

export interface AutonomyEvaluationContext {
  actionClass: AutonomyActionClass;
  employeeRole: string;
  actor?: string;
  targetSystem?: string;
  financialAmountUsd?: number;
  metadata?: Record<string, unknown>;
}

export interface AutonomyEvaluationResult {
  effect: AutonomyDecisionEffect;
  level: AutonomyLevel;
  actionClass: AutonomyActionClass;
  reasonCode: string;
  reason: string;
  budgetRemaining?: number;
  evaluatedAt: string;
}

export interface AutonomyLevelUpdateParams {
  actionClass: AutonomyActionClass;
  newLevel: AutonomyLevel;
  founderId: string;
  founderDecisionId: string;
  founderQuote: string;
  reason: string;
}
