/**
 * ============================================================================
 * AI EMPLOYEE MODEL TYPE DEFINITIONS (G13.1 / M7)
 * ============================================================================
 * Defines the contract for SamJuniorsOS AI Employees governed by the 7 Pillars:
 * 1. Identity & Charter
 * 2. Permissions & Least Privilege
 * 3. Role Brain (G11.5) & Memory Partitioning
 * 4. Budget & Hard-Stop Controls
 * 5. Supervisor Hierarchy & Reporting Lines
 * 6. Performance Record & Evaluation Metrics
 * 7. Immutable Version History & Deterministic Rollback
 *
 * NON-NEGOTIABLE GOVERNANCE INVARIANTS (PRODUCT.md Sections 7 & 8):
 * - Role Brain != Company Truth: Working scratchpads cannot overwrite canonical facts.
 * - Self-Improving != Self-Authorizing: Employees cannot self-grant permissions or budgets.
 */

import { z } from 'zod';
import type { AgentRole } from './os';
import type { RouteSideEffectClass } from './decision';

export type EmployeeStatus = 
  | 'draft'
  | 'pending_approval'
  | 'active'
  | 'paused'
  | 'terminated'
  | 'retired';

export type AutonomyLevel = 'L0' | 'L1' | 'L2' | 'L3';

// Semantic versioning pattern vX.Y.Z
export const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

/**
 * Pillar 1: Identity & Charter Schema
 */
export const EmployeeIdentitySchema = z.object({
  id: z.string().min(3),
  name: z.string().min(2),
  title: z.string().min(2),
  role: z.string().min(2), // e.g. "engineer", "support", "researcher", "pm", "finance"
  avatarUrl: z.string().optional(),
  createdAt: z.string().datetime(),
});

export type EmployeeIdentity = z.infer<typeof EmployeeIdentitySchema>;

export const EmployeeCharterSchema = z.object({
  mission: z.string().min(10),
  coreResponsibilities: z.array(z.string().min(3)).min(1),
  operationalBoundaries: z.array(z.string().min(3)).min(1),
  prohibitedActions: z.array(z.string().min(3)).min(1),
  autonomyCeiling: z.enum(['L0', 'L1', 'L2', 'L3']),
  systemPromptTemplate: z.string().min(10),
});

export type EmployeeCharter = z.infer<typeof EmployeeCharterSchema>;

/**
 * Pillar 2: Permissions Schema
 */
export const EmployeePermissionsSchema = z.object({
  allowedCapabilities: z.array(z.string().min(3)), // explicit capability IDs (e.g. "tool:workspace:read_file")
  allowedEgressDomains: z.array(z.string().min(3)).default([]),
  maxSideEffectClassAllowedWithoutApproval: z.enum([
    'read_only',
    'internal_write',
    'external_reversible',
    'external_hard_to_reverse',
    'financial_legal',
    'destructive_security'
  ]).default('read_only'),
  canAccessExternalWebhooks: z.boolean().default(false),
});

export type EmployeePermissions = z.infer<typeof EmployeePermissionsSchema>;

/**
 * Pillar 3: Role Brain Configuration Schema
 */
export const EmployeeRoleBrainConfigSchema = z.object({
  workingMemoryMaxItems: z.number().int().positive().default(100),
  experienceMemoryMaxItems: z.number().int().positive().default(500),
  allowedMemoryScopes: z.array(z.enum(['working', 'experience'])).default(['working', 'experience']),
  sharesWorkingMemoryWithPeers: z.literal(false).default(false), // STRICT ISOLATION INVARIANT
  hasPersonalMindAccess: z.literal(false).default(false),       // STRICT PERSONAL MIND EXCLUSION INVARIANT
});

export type EmployeeRoleBrainConfig = z.infer<typeof EmployeeRoleBrainConfigSchema>;

/**
 * Pillar 4: Budget Schema
 */
export const EmployeeBudgetSchema = z.object({
  monthlyCapCents: z.number().int().nonnegative(), // e.g. 5000 = $50.00
  dailyCapCents: z.number().int().nonnegative(),   // e.g. 500 = $5.00
  maxCostPerTaskCents: z.number().int().positive().default(500), // e.g. 500 = $5.00
  maxToolCallsPerTask: z.number().int().positive().default(25),
  currentMonthSpendCents: z.number().int().nonnegative().default(0),
  currentDaySpendCents: z.number().int().nonnegative().default(0),
  hardStopTriggered: z.boolean().default(false),
  lastResetDate: z.string(), // ISO date "YYYY-MM-DD"
});

export type EmployeeBudget = z.infer<typeof EmployeeBudgetSchema>;

/**
 * Pillar 5: Supervisor Schema
 */
export const EmployeeSupervisorSchema = z.object({
  supervisorId: z.string().min(2).default('sophia'),
  supervisorRole: z.enum(['coo', 'ceo']).default('coo'),
  reportingCadence: z.enum(['realtime', 'daily_briefing', 'weekly_review']).default('realtime'),
  delegationRequiresExplicitAcceptance: z.boolean().default(true),
});

export type EmployeeSupervisor = z.infer<typeof EmployeeSupervisorSchema>;

/**
 * Pillar 6: Performance Record Schema
 */
export const EmployeeTaskMetricSchema = z.object({
  taskId: z.string(),
  workflowInstanceId: z.string().optional(),
  costCents: z.number().int().nonnegative(),
  toolCallsCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  status: z.enum(['completed', 'failed', 'halted_budget', 'halted_policy']),
  qualityScore: z.number().min(0).max(100).optional(),
  evaluatedAt: z.string().datetime(),
});

export type EmployeeTaskMetric = z.infer<typeof EmployeeTaskMetricSchema>;

export const EmployeePerformanceRecordSchema = z.object({
  totalTasksAssigned: z.number().int().nonnegative().default(0),
  totalTasksCompleted: z.number().int().nonnegative().default(0),
  totalTasksFailed: z.number().int().nonnegative().default(0),
  consecutiveFailureCount: z.number().int().nonnegative().default(0),
  averageQualityScore: z.number().min(0).max(100).default(0),
  recentMetrics: z.array(EmployeeTaskMetricSchema).max(50).default([]),
  lastEvaluatedAt: z.string().datetime().optional(),
});

export type EmployeePerformanceRecord = z.infer<typeof EmployeePerformanceRecordSchema>;

/**
 * Pillar 7: Version History & Rollback Schema
 */
export const EmployeeVersionRecordSchema = z.object({
  version: z.string().regex(SEMVER_REGEX, 'Version must be semantic versioning (vX.Y.Z)'),
  changedAt: z.string().datetime(),
  changedBy: z.string(), // e.g. "founder" or "system_evaluator"
  changeDescription: z.string().min(5),
  approvedByFounder: z.boolean(),
  charterSnapshot: EmployeeCharterSchema,
  permissionsSnapshot: EmployeePermissionsSchema,
  budgetSnapshot: EmployeeBudgetSchema,
});

export type EmployeeVersionRecord = z.infer<typeof EmployeeVersionRecordSchema>;

/**
 * Complete AI Employee Aggregate Model Schema
 */
export const EmployeeModelSchema = z.object({
  id: z.string().min(3),
  version: z.string().regex(SEMVER_REGEX, 'Version must be semantic versioning (vX.Y.Z)'),
  status: z.enum(['draft', 'pending_approval', 'active', 'paused', 'terminated', 'retired']),
  identity: EmployeeIdentitySchema,
  charter: EmployeeCharterSchema,
  permissions: EmployeePermissionsSchema,
  roleBrainConfig: EmployeeRoleBrainConfigSchema,
  budget: EmployeeBudgetSchema,
  supervisor: EmployeeSupervisorSchema,
  performanceRecord: EmployeePerformanceRecordSchema,
  versionHistory: z.array(EmployeeVersionRecordSchema).default([]),
  updatedAt: z.string().datetime(),
});

export type EmployeeModel = z.infer<typeof EmployeeModelSchema>;

/**
 * ============================================================================
 * GOVERNANCE ERROR CLASSES
 * ============================================================================
 */
export class SelfAuthorizationViolationError extends Error {
  constructor(message: string) {
    super(`[SELF-AUTHORIZATION VIOLATION]: ${message}`);
    this.name = 'SelfAuthorizationViolationError';
  }
}

export class EpistemicBoundaryViolationError extends Error {
  constructor(message: string) {
    super(`[EPISTEMIC BOUNDARY VIOLATION]: ${message}`);
    this.name = 'EpistemicBoundaryViolationError';
  }
}

export class BudgetHardStopExceededError extends Error {
  constructor(message: string) {
    super(`[BUDGET HARD STOP]: ${message}`);
    this.name = 'BudgetHardStopExceededError';
  }
}

/**
 * ============================================================================
 * DETERMINISTIC GOVERNANCE HELPERS & INVARIANT GUARDS
 * ============================================================================
 */

/**
 * Invariant 1: Self-Improving != Self-Authorizing (PRODUCT.md Section 8)
 * Asserts that an employee cannot modify its own permissions, budgets, or autonomy ceiling.
 * Only the founder can approve permission or budget expansions.
 */
export function assertSelfImprovingNotSelfAuthorizing(
  current: EmployeeModel,
  proposed: EmployeeModel,
  initiatorId: string
): void {
  // If the update was initiated by the employee themselves
  const isSelfUpdate = initiatorId === current.id;

  if (isSelfUpdate) {
    // 1. Cannot expand capabilities
    const currentCaps = new Set(current.permissions.allowedCapabilities);
    const addedCaps = proposed.permissions.allowedCapabilities.filter((c) => !currentCaps.has(c));
    if (addedCaps.length > 0) {
      throw new SelfAuthorizationViolationError(
        `Employee "${current.id}" attempted to self-grant new capabilities: ${addedCaps.join(', ')}. ` +
        `Capabilities may only be granted with Founder approval.`
      );
    }

    // 2. Cannot increase budget caps
    if (proposed.budget.monthlyCapCents > current.budget.monthlyCapCents) {
      throw new SelfAuthorizationViolationError(
        `Employee "${current.id}" attempted to increase monthly budget from ${current.budget.monthlyCapCents}¢ to ${proposed.budget.monthlyCapCents}¢.`
      );
    }
    if (proposed.budget.dailyCapCents > current.budget.dailyCapCents) {
      throw new SelfAuthorizationViolationError(
        `Employee "${current.id}" attempted to increase daily budget from ${current.budget.dailyCapCents}¢ to ${proposed.budget.dailyCapCents}¢.`
      );
    }

    // 3. Cannot raise autonomy ceiling
    const levels: Record<AutonomyLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };
    if (levels[proposed.charter.autonomyCeiling] > levels[current.charter.autonomyCeiling]) {
      throw new SelfAuthorizationViolationError(
        `Employee "${current.id}" attempted to self-elevate autonomy ceiling from ${current.charter.autonomyCeiling} to ${proposed.charter.autonomyCeiling}.`
      );
    }

    // 4. Cannot modify prohibited actions
    const currentProhibited = new Set(current.charter.prohibitedActions);
    const removedProhibited = current.charter.prohibitedActions.filter((p) => !proposed.charter.prohibitedActions.includes(p));
    if (removedProhibited.length > 0) {
      throw new SelfAuthorizationViolationError(
        `Employee "${current.id}" attempted to remove prohibited actions: ${removedProhibited.join(', ')}.`
      );
    }
  }
}

/**
 * Invariant 2: Role Brain != Company Truth (PRODUCT.md Section 7)
 * Asserts that employee scratchpad/working memory records cannot claim canonical fact status.
 */
export function assertRoleBrainNotCompanyTruth(record: {
  isCanonicalFact?: boolean;
  promotedToCompanyTruth?: boolean;
  provenance: string;
}): void {
  if (record.isCanonicalFact === true || record.promotedToCompanyTruth === true) {
    if (!record.provenance.startsWith('founder_verified:') && !record.provenance.startsWith('epistemic_consensus:')) {
      throw new EpistemicBoundaryViolationError(
        `Role Brain working memory cannot be directly declared Company Truth. ` +
        `Provenance must be verified via epistemic consensus or explicit founder authorization.`
      );
    }
  }
}

/**
 * Invariant 3: Budget Hard-Stop Evaluation
 * Deterministically evaluates whether a proposed task or tool call breaches daily or monthly caps.
 */
export function checkEmployeeBudgetHardStop(
  employee: EmployeeModel,
  estimatedCostCents: number
): { allowed: boolean; reason?: string } {
  if (employee.budget.hardStopTriggered) {
    return {
      allowed: false,
      reason: `Hard stop active for employee "${employee.id}". Spend limits were previously reached.`,
    };
  }

  if (employee.budget.currentDaySpendCents + estimatedCostCents > employee.budget.dailyCapCents) {
    return {
      allowed: false,
      reason: `Daily budget cap exceeded. Current spend: ${employee.budget.currentDaySpendCents}¢, Estimated: ${estimatedCostCents}¢, Daily Cap: ${employee.budget.dailyCapCents}¢.`,
    };
  }

  if (employee.budget.currentMonthSpendCents + estimatedCostCents > employee.budget.monthlyCapCents) {
    return {
      allowed: false,
      reason: `Monthly budget cap exceeded. Current spend: ${employee.budget.currentMonthSpendCents}¢, Estimated: ${estimatedCostCents}¢, Monthly Cap: ${employee.budget.monthlyCapCents}¢.`,
    };
  }

  return { allowed: true };
}
