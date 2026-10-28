/**
 * SamJuniorsOS — Gate G12.4: Autonomy Policy Engine Test Suite
 *
 * Exercises:
 * 1. Table-driven matrix tests: Action Class x Autonomy Level (L0..L4) x Limits.
 * 2. Default policy table conformance: strictly matches ratified Founder Decision G0.7 baseline.
 * 3. Rolling sliding-window action budgets: Latch / AgentPolicy / AgentLedger pattern.
 * 4. Tamper protection: models and AI employee personas cannot change policy; elevation
 *    requires a verified, recorded Founder decision.
 * 5. Founder-authorized elevation & audit log integration.
 * 6. SideEffectPolicyEvaluator integration.
 */

import assert from 'node:assert/strict';
import {
  AutonomyPolicyEngine,
  UnauthorizedAutonomyMutationError,
  InvalidAutonomyLevelError,
  DEFAULT_AUTONOMY_POLICY_RULES,
} from '../../src/lib/server/authorization/autonomy-policy';
import { SideEffectPolicyEvaluator } from '../../src/lib/server/authorization/policy-evaluator';
import { InMemoryAuditStore } from '../../src/lib/server/authorization/approval-store';
import {
  AutonomyLevel,
  AutonomyActionClass,
  AUTONOMY_LEVELS,
  AUTONOMY_ACTION_CLASSES,
} from '../../src/types/autonomy';

async function main(): Promise<void> {
  console.log('\n======================================================');
  console.log('SAMJUNIORS-OS: GATE G12.4 AUTONOMY POLICY ENGINE SUITE');
  console.log('======================================================\n');

  // Reset engine to clean default state
  AutonomyPolicyEngine.resetForTest();
  const engine = AutonomyPolicyEngine.getInstance();
  const auditStore = InMemoryAuditStore.getInstance();
  auditStore.clear();

  // -------------------------------------------------------------------------
  // Phase 1: Table-Driven Matrix Tests (Action Class x Autonomy Level)
  // -------------------------------------------------------------------------
  console.log('[Phase 1] Running Table-Driven Matrix Tests (Action Class x Autonomy Level)...');

  interface TableTestCase {
    actionClass: AutonomyActionClass;
    level: AutonomyLevel;
    expectedEffect: 'auto' | 'needs_approval' | 'forbidden';
    expectedReasonCodePrefix: string;
  }

  const tableMatrix: TableTestCase[] = [];

  for (const actionClass of AUTONOMY_ACTION_CLASSES) {
    for (const level of AUTONOMY_LEVELS) {
      let expectedEffect: 'auto' | 'needs_approval' | 'forbidden';
      let expectedReasonCodePrefix: string;

      switch (level) {
        case 'L0':
          expectedEffect = 'forbidden';
          expectedReasonCodePrefix = 'AUTONOMY_LEVEL_L0';
          break;
        case 'L1':
          expectedEffect = 'needs_approval';
          expectedReasonCodePrefix = 'AUTONOMY_LEVEL_L1';
          break;
        case 'L2':
          expectedEffect = 'needs_approval';
          expectedReasonCodePrefix = 'AUTONOMY_LEVEL_L2';
          break;
        case 'L3':
        case 'L4':
          expectedEffect = 'auto';
          expectedReasonCodePrefix = level === 'L3' ? 'AUTONOMY_LEVEL_L3' : 'AUTONOMY_LEVEL_L4';
          break;
      }

      tableMatrix.push({
        actionClass,
        level,
        expectedEffect,
        expectedReasonCodePrefix,
      });
    }
  }

  let matrixTestsRun = 0;
  for (const tc of tableMatrix) {
    // Dynamically evaluate a rule configured at this level
    const syntheticRule = {
      actionClass: tc.actionClass,
      currentLevel: tc.level,
      defaultLevel: 'L2' as AutonomyLevel,
      maxLevelAllowed: 'L4' as AutonomyLevel,
      maxActionsPerWindow: undefined,
      windowDurationMs: 86_400_000,
      requiresExplicitApproval: tc.level !== 'L3' && tc.level !== 'L4',
    };

    // Test with direct evaluation
    (engine as any).rules.set(tc.actionClass, syntheticRule);
    const result = engine.evaluate({
      actionClass: tc.actionClass,
      employeeRole: 'researcher',
    });

    assert.equal(
      result.effect,
      tc.expectedEffect,
      `Matrix test failed for ${tc.actionClass} at ${tc.level}: expected ${tc.expectedEffect}, got ${result.effect}`
    );
    assert.ok(
      result.reasonCode.startsWith(tc.expectedReasonCodePrefix),
      `Reason code for ${tc.actionClass} at ${tc.level} must start with ${tc.expectedReasonCodePrefix}, got ${result.reasonCode}`
    );
    matrixTestsRun++;
  }

  console.log(`✔ Phase 1 Passed: Table-driven matrix verified (${matrixTestsRun} tests passed across 7 action classes x 5 levels)`);

  // -------------------------------------------------------------------------
  // Phase 2: Ratified G0.7 Baseline Conformance
  // -------------------------------------------------------------------------
  console.log('\n[Phase 2] Verifying Ratified G0.7 Baseline Conformance...');
  AutonomyPolicyEngine.resetForTest();
  const baselineEngine = AutonomyPolicyEngine.getInstance();

  const baselineExpectations: Record<AutonomyActionClass, { level: AutonomyLevel; effect: string }> = {
    read: { level: 'L3', effect: 'auto' },
    draft: { level: 'L3', effect: 'auto' },
    internal_write: { level: 'L2', effect: 'needs_approval' },
    external_reversible: { level: 'L2', effect: 'needs_approval' },
    external_hard_to_reverse: { level: 'L2', effect: 'needs_approval' },
    financial_legal: { level: 'L1', effect: 'needs_approval' },
    destructive_security: { level: 'L0', effect: 'forbidden' },
  };

  for (const [actionClass, expected] of Object.entries(baselineExpectations)) {
    const ac = actionClass as AutonomyActionClass;
    const rule = baselineEngine.getRule(ac);
    assert.equal(rule.currentLevel, expected.level, `Default level for ${ac} must be ${expected.level}`);
    const evalRes = baselineEngine.evaluate({ actionClass: ac, employeeRole: 'coo' });
    assert.equal(evalRes.effect, expected.effect, `Default effect for ${ac} must be ${expected.effect}`);
  }

  console.log('✔ Phase 2 Passed: G0.7 ratified baseline policy verified across all 7 action classes');

  // -------------------------------------------------------------------------
  // Phase 3: Rolling Sliding-Window Action Budgets (Latch / AgentPolicy pattern)
  // -------------------------------------------------------------------------
  console.log('\n[Phase 3] Testing Rolling Sliding-Window Action Budgets...');

  // Configure internal_write with L3 and rolling window of 3 actions per 1000ms
  const testRule = {
    actionClass: 'internal_write' as AutonomyActionClass,
    currentLevel: 'L3' as AutonomyLevel,
    defaultLevel: 'L2' as AutonomyLevel,
    maxLevelAllowed: 'L3' as AutonomyLevel,
    maxActionsPerWindow: 3,
    windowDurationMs: 1_000,
    requiresExplicitApproval: false,
  };
  (baselineEngine as any).rules.set('internal_write', testRule);

  // First 3 actions must be permitted autonomously (auto)
  for (let i = 1; i <= 3; i++) {
    const evalResult = baselineEngine.evaluate({
      actionClass: 'internal_write',
      employeeRole: 'researcher',
    });
    assert.equal(evalResult.effect, 'auto', `Action ${i} within budget must be auto`);
    assert.equal(evalResult.reasonCode, 'AUTONOMY_LEVEL_L3_WITHIN_BUDGET');
    const consumed = baselineEngine.consumeAction('researcher', 'internal_write');
    assert.equal(consumed, true, `Consumption of action ${i} must succeed`);
  }

  // 4th action exceeds rolling budget -> must require Founder approval
  const exceededResult = baselineEngine.evaluate({
    actionClass: 'internal_write',
    employeeRole: 'researcher',
  });
  assert.equal(exceededResult.effect, 'needs_approval', '4th action exceeding budget must require approval');
  assert.equal(exceededResult.reasonCode, 'AUTONOMY_BUDGET_EXCEEDED');
  assert.equal(exceededResult.budgetRemaining, 0);

  // Consume should return false when budget exhausted
  const consumedPastLimit = baselineEngine.consumeAction('researcher', 'internal_write');
  assert.equal(consumedPastLimit, false, 'Consuming past limit must fail');

  console.log('✔ Phase 3 Passed: Rolling sliding-window action budgets enforced deterministically');

  // -------------------------------------------------------------------------
  // Phase 4: Tamper-Evident Policy Mutation Protection
  // -------------------------------------------------------------------------
  console.log('\n[Phase 4] Testing Tamper-Evident Policy Mutation Protection...');

  // 4a. AI employee personas cannot elevate autonomy levels
  const unauthorizedRoles = ['coo', 'researcher', 'pm', 'finance', 'advisor', 'model', 'system'];
  for (const role of unauthorizedRoles) {
    await assert.rejects(
      () =>
        baselineEngine.setAutonomyLevel({
          actionClass: 'internal_write',
          newLevel: 'L3',
          founderId: role,
          founderDecisionId: 'dec-1',
          founderQuote: 'Promote autonomy',
          reason: 'Attempted role self-elevation',
        }),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedAutonomyMutationError);
        assert.ok(err.message.includes('Only the authenticated Founder'));
        return true;
      },
      `Role "${role}" must be rejected from modifying autonomy levels`
    );
  }

  // 4b. Missing Founder Decision ID rejected
  await assert.rejects(
    () =>
      baselineEngine.setAutonomyLevel({
        actionClass: 'internal_write',
        newLevel: 'L3',
        founderId: 'founder',
        founderDecisionId: '',
        founderQuote: 'Promote autonomy',
        reason: 'Missing decision reference',
      }),
    (err: any) => {
      assert.ok(err instanceof UnauthorizedAutonomyMutationError);
      assert.ok(err.message.includes('verified, recorded Founder decision ID'));
      return true;
    }
  );

  // 4c. Missing Founder Quote rejected
  await assert.rejects(
    () =>
      baselineEngine.setAutonomyLevel({
        actionClass: 'internal_write',
        newLevel: 'L3',
        founderId: 'founder',
        founderDecisionId: 'G15.8-RATIFIED',
        founderQuote: '',
        reason: 'Missing founder quote',
      }),
    (err: any) => {
      assert.ok(err instanceof UnauthorizedAutonomyMutationError);
      assert.ok(err.message.includes('documented decision quote'));
      return true;
    }
  );

  // 4d. Invalid autonomy level string rejected
  await assert.rejects(
    () =>
      baselineEngine.setAutonomyLevel({
        actionClass: 'internal_write',
        newLevel: 'L99' as any,
        founderId: 'founder',
        founderDecisionId: 'G15.8-RATIFIED',
        founderQuote: 'Elevate',
        reason: 'Invalid level test',
      }),
    (err: any) => {
      assert.ok(err instanceof InvalidAutonomyLevelError);
      return true;
    }
  );

  console.log('✔ Phase 4 Passed: Model and AI personas strictly blocked from mutating policy');

  // -------------------------------------------------------------------------
  // Phase 5: Verified Founder Elevation & Cryptographic Audit Integration
  // -------------------------------------------------------------------------
  console.log('\n[Phase 5] Testing Verified Founder Elevation & Audit Integration...');
  baselineEngine.resetBudgetsForTest();

  const elevatedRule = await baselineEngine.setAutonomyLevel({
    actionClass: 'internal_write',
    newLevel: 'L3',
    founderId: 'founder',
    founderDecisionId: 'G15.8-PILOT-GRADUATION',
    founderQuote: 'I approve L3 autonomy for internal write tasks based on supervised pilot evidence',
    reason: 'Supervised pilot evaluation passed with zero regressions',
  });

  assert.equal(elevatedRule.currentLevel, 'L3');
  assert.equal(elevatedRule.founderDecisionRef, 'G15.8-PILOT-GRADUATION');

  // Engine evaluation now reflects the elevated level
  const elevatedEval = baselineEngine.evaluate({
    actionClass: 'internal_write',
    employeeRole: 'researcher',
  });
  assert.equal(elevatedEval.effect, 'auto');
  assert.equal(elevatedEval.level, 'L3');

  // Verify immutable audit entry in the audit store
  const audits = await auditStore.list({ classification: 'internal_mutation' });
  const elevationAudit = audits.find((a) => a.actionName === 'autonomy.level_update');
  assert.ok(elevationAudit, 'Elevation action must produce an immutable audit record');
  assert.equal(elevationAudit.requestedBy, 'founder');
  assert.equal(elevationAudit.decision, 'allowed');
  assert.ok(elevationAudit.reason.includes('G15.8-PILOT-GRADUATION') || elevationAudit.requestId === 'G15.8-PILOT-GRADUATION');
  assert.ok(elevationAudit.chainSequence, 'Audit record must carry chain sequence');
  assert.ok(elevationAudit.recordHash, 'Audit record must carry record hash');

  console.log('✔ Phase 5 Passed: Founder elevation and hash-chained audit integration verified');

  // -------------------------------------------------------------------------
  // Phase 6: SideEffectPolicyEvaluator Integration
  // -------------------------------------------------------------------------
  console.log('\n[Phase 6] Testing SideEffectPolicyEvaluator Integration...');
  const evaluator = new SideEffectPolicyEvaluator();

  const autonomyEval = evaluator.evaluateAutonomy({
    actionClass: 'internal_write',
    employeeRole: 'pm',
  });
  assert.equal(autonomyEval.effect, 'auto');
  assert.equal(autonomyEval.level, 'L3');

  // Normal read_only evaluation
  const readEval = await evaluator.evaluate({
    employeeRole: 'researcher',
    actionName: 'search_notes',
    classification: 'read_only',
  });
  assert.equal(readEval.effect, 'allowed');
  assert.equal(readEval.reasonCode, 'READ_ONLY_ALLOWED');

  // Classification mapping check
  assert.equal(AutonomyPolicyEngine.mapSideEffectToAutonomyActionClass('read_only'), 'read');
  assert.equal(AutonomyPolicyEngine.mapSideEffectToAutonomyActionClass('internal_mutation'), 'internal_write');
  assert.equal(AutonomyPolicyEngine.mapSideEffectToAutonomyActionClass('external_communication'), 'external_hard_to_reverse');
  assert.equal(AutonomyPolicyEngine.mapSideEffectToAutonomyActionClass('financial_action'), 'financial_legal');
  assert.equal(AutonomyPolicyEngine.mapSideEffectToAutonomyActionClass('high_impact_action'), 'destructive_security');

  console.log('✔ Phase 6 Passed: SideEffectPolicyEvaluator integration verified');

  console.log('\n======================================================');
  console.log('ALL G12.4 AUTONOMY POLICY ENGINE TESTS PASSED (6/6)');
  console.log('======================================================');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
