/**
 * ============================================================================
 * GATE G13.1 TEST SUITE: AI EMPLOYEE MODEL & GOVERNANCE BOUNDARIES
 * ============================================================================
 * Verifies that the AI Employee Model fulfills all 7 pillars and strictly
 * enforces PRODUCT.md Sections 7 & 8 safety invariants:
 * - Role Brain != Company Truth
 * - Self-Improving != Self-Authorizing
 * - Budget hard stops and least-privilege capability boundaries
 */

import { describe, it, expect } from 'bun:test';
import {
  EmployeeModelSchema,
  assertSelfImprovingNotSelfAuthorizing,
  assertRoleBrainNotCompanyTruth,
  checkEmployeeBudgetHardStop,
  SelfAuthorizationViolationError,
  EpistemicBoundaryViolationError,
  type EmployeeModel,
} from '../../src/types/employee';

describe('Gate G13.1 — AI Employee Model Architecture & Governance Invariants', () => {
  const baseEmployee: EmployeeModel = {
    id: 'employee:engineer:codex_1',
    version: '1.0.0',
    status: 'active',
    identity: {
      id: 'employee:engineer:codex_1',
      name: 'Codex-1',
      title: 'Junior Software Engineer',
      role: 'engineer',
      createdAt: new Date().toISOString(),
    },
    charter: {
      mission: 'Execute tested software development tasks and fix bugs on isolated feature branches.',
      coreResponsibilities: [
        'Implement code changes strictly within assigned step worktree',
        'Write regression tests before declaring work complete',
        'Follow canonical engineering rules in AGENTS.md',
      ],
      operationalBoundaries: [
        'Never merge directly to main branch',
        'Never force-push or delete git history',
        'Operate solely behind CapabilityGateway',
      ],
      prohibitedActions: [
        'Direct deployment to production',
        'Modifying company governance or security allowlists',
        'Self-granting additional capability permissions',
      ],
      autonomyCeiling: 'L2',
      systemPromptTemplate: 'You are Codex-1, an AI software engineer at SamJuniors...',
    },
    permissions: {
      allowedCapabilities: [
        'tool:workspace:read_file',
        'tool:workspace:write_file',
        'tool:github:read_issue',
      ],
      allowedEgressDomains: ['github.com', 'api.github.com'],
      maxSideEffectClassAllowedWithoutApproval: 'internal_write',
      canAccessExternalWebhooks: false,
    },
    roleBrainConfig: {
      workingMemoryMaxItems: 100,
      experienceMemoryMaxItems: 500,
      allowedMemoryScopes: ['working', 'experience'],
      sharesWorkingMemoryWithPeers: false,
      hasPersonalMindAccess: false,
    },
    budget: {
      monthlyCapCents: 5000, // $50.00
      dailyCapCents: 500,     // $5.00
      maxCostPerTaskCents: 200,
      maxToolCallsPerTask: 25,
      currentMonthSpendCents: 1200,
      currentDaySpendCents: 150,
      hardStopTriggered: false,
      lastResetDate: '2026-10-31',
    },
    supervisor: {
      supervisorId: 'sophia',
      supervisorRole: 'coo',
      reportingCadence: 'realtime',
      delegationRequiresExplicitAcceptance: true,
    },
    performanceRecord: {
      totalTasksAssigned: 12,
      totalTasksCompleted: 11,
      totalTasksFailed: 1,
      consecutiveFailureCount: 0,
      averageQualityScore: 94,
      recentMetrics: [],
    },
    versionHistory: [
      {
        version: '1.0.0',
        changedAt: new Date().toISOString(),
        changedBy: 'founder',
        changeDescription: 'Initial hire and configuration with L2 autonomy ceiling',
        approvedByFounder: true,
        charterSnapshot: {
          mission: 'Execute tested software development tasks and fix bugs on isolated feature branches.',
          coreResponsibilities: [
            'Implement code changes strictly within assigned step worktree',
            'Write regression tests before declaring work complete',
            'Follow canonical engineering rules in AGENTS.md',
          ],
          operationalBoundaries: [
            'Never merge directly to main branch',
            'Never force-push or delete git history',
            'Operate solely behind CapabilityGateway',
          ],
          prohibitedActions: [
            'Direct deployment to production',
            'Modifying company governance or security allowlists',
            'Self-granting additional capability permissions',
          ],
          autonomyCeiling: 'L2',
          systemPromptTemplate: 'You are Codex-1, an AI software engineer at SamJuniors...',
        },
        permissionsSnapshot: {
          allowedCapabilities: [
            'tool:workspace:read_file',
            'tool:workspace:write_file',
            'tool:github:read_issue',
          ],
          allowedEgressDomains: ['github.com', 'api.github.com'],
          maxSideEffectClassAllowedWithoutApproval: 'internal_write',
          canAccessExternalWebhooks: false,
        },
        budgetSnapshot: {
          monthlyCapCents: 5000,
          dailyCapCents: 500,
          maxCostPerTaskCents: 200,
          maxToolCallsPerTask: 25,
          currentMonthSpendCents: 1200,
          currentDaySpendCents: 150,
          hardStopTriggered: false,
          lastResetDate: '2026-10-31',
        },
      },
    ],
    updatedAt: new Date().toISOString(),
  };

  describe('1. Seven-Pillar Model Schema Validation', () => {
    it('accepts a valid employee adhering to all 7 pillars', () => {
      const parsed = EmployeeModelSchema.safeParse(baseEmployee);
      expect(parsed.success).toBe(true);
    });

    it('rejects an invalid semantic version', () => {
      const invalid = { ...baseEmployee, version: 'latest' };
      const parsed = EmployeeModelSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('enforces strict role brain invariants (sharesWorkingMemoryWithPeers must be false)', () => {
      const invalid = {
        ...baseEmployee,
        roleBrainConfig: {
          ...baseEmployee.roleBrainConfig,
          sharesWorkingMemoryWithPeers: true as any,
        },
      };
      const parsed = EmployeeModelSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('enforces strict personal mind exclusion (hasPersonalMindAccess must be false)', () => {
      const invalid = {
        ...baseEmployee,
        roleBrainConfig: {
          ...baseEmployee.roleBrainConfig,
          hasPersonalMindAccess: true as any,
        },
      };
      const parsed = EmployeeModelSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });

  describe('2. Invariant: Self-Improving != Self-Authorizing (PRODUCT.md Section 8)', () => {
    it('allows the founder to expand capabilities and budgets', () => {
      const proposed: EmployeeModel = {
        ...baseEmployee,
        permissions: {
          ...baseEmployee.permissions,
          allowedCapabilities: [...baseEmployee.permissions.allowedCapabilities, 'tool:stripe:create_customer'],
        },
        budget: {
          ...baseEmployee.budget,
          monthlyCapCents: 10000,
        },
      };

      // When initiated by "founder", no error is thrown
      expect(() => {
        assertSelfImprovingNotSelfAuthorizing(baseEmployee, proposed, 'founder');
      }).not.toThrow();
    });

    it('throws SelfAuthorizationViolationError if an employee attempts to self-grant new capabilities', () => {
      const rogueProposal: EmployeeModel = {
        ...baseEmployee,
        permissions: {
          ...baseEmployee.permissions,
          allowedCapabilities: [
            ...baseEmployee.permissions.allowedCapabilities,
            'tool:stripe:create_payment_intent',
          ],
        },
      };

      expect(() => {
        assertSelfImprovingNotSelfAuthorizing(baseEmployee, rogueProposal, baseEmployee.id);
      }).toThrow(SelfAuthorizationViolationError);
    });

    it('throws SelfAuthorizationViolationError if an employee attempts to raise its monthly budget', () => {
      const rogueProposal: EmployeeModel = {
        ...baseEmployee,
        budget: {
          ...baseEmployee.budget,
          monthlyCapCents: 99999,
        },
      };

      expect(() => {
        assertSelfImprovingNotSelfAuthorizing(baseEmployee, rogueProposal, baseEmployee.id);
      }).toThrow(SelfAuthorizationViolationError);
    });

    it('throws SelfAuthorizationViolationError if an employee attempts to elevate autonomy ceiling', () => {
      const rogueProposal: EmployeeModel = {
        ...baseEmployee,
        charter: {
          ...baseEmployee.charter,
          autonomyCeiling: 'L3',
        },
      };

      expect(() => {
        assertSelfImprovingNotSelfAuthorizing(baseEmployee, rogueProposal, baseEmployee.id);
      }).toThrow(SelfAuthorizationViolationError);
    });

    it('throws SelfAuthorizationViolationError if an employee attempts to remove prohibited actions', () => {
      const rogueProposal: EmployeeModel = {
        ...baseEmployee,
        charter: {
          ...baseEmployee.charter,
          prohibitedActions: [], // stripped out prohibited actions!
        },
      };

      expect(() => {
        assertSelfImprovingNotSelfAuthorizing(baseEmployee, rogueProposal, baseEmployee.id);
      }).toThrow(SelfAuthorizationViolationError);
    });
  });

  describe('3. Invariant: Role Brain != Company Truth (PRODUCT.md Section 7)', () => {
    it('allows standard subjective working scratchpad records', () => {
      expect(() => {
        assertRoleBrainNotCompanyTruth({
          provenance: 'employee_working_notes:task_1',
          isCanonicalFact: false,
          promotedToCompanyTruth: false,
        });
      }).not.toThrow();
    });

    it('rejects working records claiming canonical fact status without founder or consensus provenance', () => {
      expect(() => {
        assertRoleBrainNotCompanyTruth({
          provenance: 'employee_scratchpad',
          isCanonicalFact: true,
        });
      }).toThrow(EpistemicBoundaryViolationError);
    });

    it('allows claims promoted via verified founder or consensus pipeline', () => {
      expect(() => {
        assertRoleBrainNotCompanyTruth({
          provenance: 'founder_verified:decision_9',
          isCanonicalFact: true,
          promotedToCompanyTruth: true,
        });
      }).not.toThrow();
    });
  });

  describe('4. Budget Hard-Stop Controls', () => {
    it('permits tasks within daily and monthly limits', () => {
      const check = checkEmployeeBudgetHardStop(baseEmployee, 100);
      expect(check.allowed).toBe(true);
    });

    it('halts when estimated cost breaches daily cap', () => {
      // Current day spend is 150¢, daily cap is 500¢; requesting 400¢ total is 550¢ > 500¢
      const check = checkEmployeeBudgetHardStop(baseEmployee, 400);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Daily budget cap exceeded');
    });

    it('halts when estimated cost breaches monthly cap', () => {
      // Current month spend is 4800¢ (out of 5000¢); requesting 300¢ trips monthly (5100¢ > 5000¢) while daily is 150¢ + 300¢ = 450¢ <= 500¢
      const highMonthEmployee: EmployeeModel = {
        ...baseEmployee,
        budget: {
          ...baseEmployee.budget,
          currentMonthSpendCents: 4800,
          currentDaySpendCents: 150,
        },
      };
      const check = checkEmployeeBudgetHardStop(highMonthEmployee, 300);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Monthly budget cap exceeded');
    });

    it('halts immediately when hard stop flag has been triggered', () => {
      const frozenEmployee: EmployeeModel = {
        ...baseEmployee,
        budget: {
          ...baseEmployee.budget,
          hardStopTriggered: true,
        },
      };

      const check = checkEmployeeBudgetHardStop(frozenEmployee, 1);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Hard stop active');
    });
  });
});
