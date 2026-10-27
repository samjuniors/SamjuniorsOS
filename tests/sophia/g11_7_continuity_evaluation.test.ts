/**
 * ============================================================================
 * GATE G11.7: CONTINUITY EVALUATION TEST SUITE
 * ============================================================================
 *
 * SPECIFICATION & EXIT CRITERIA (GATES.md / gates.json):
 * "Scripted multi-session evaluation with founder-approved pass thresholds,
 *  run before and after a restart."
 *
 * VERIFICATION SCOPE:
 * 1. Multi-Session Ingestion:
 *    - Session 1 ("Last Week"): 7-day-old personal preferences, company facts,
 *      and strategy knowledge seeded.
 *    - Session 2 ("Recent Consolidation & Deletions"): Fact supersession,
 *      cascading deletion of personal note, and adversarial injection probe.
 * 2. Pre-Restart Evaluation:
 *    - Accurately recalls 7-day-old personal preference ("remembers last week").
 *    - Excludes superseded fact ($29) from active canonical truth ("invents nothing stale").
 *    - Grounds company questions with authoritative sources and zero personal leakage.
 *    - Honestly abstains on unrecorded facts without guessing ("invents nothing").
 *    - Deletion leaves zero trace in memory or assembled context.
 *    - Adversarial prompt injection rejected by MemoryGate.
 * 3. Cold Process Restart Durability:
 *    - Spawns cold child process reading exclusively from persistent storage.
 *    - 100% of valid memories survive cold restart.
 *    - Zero resurrection of deleted memories.
 *    - Post-restart evaluation matches pre-restart with 100% concordance.
 * 4. Founder-Approved Pass Threshold Enforcement:
 *    - Evaluates against FOUNDER_APPROVED_CONTINUITY_THRESHOLDS.
 *    - Enforces fail-closed behavior on simulated regression.
 */

import { resolveSqliteDatabaseUrl } from '../../src/lib/server/db/database-url';
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolveSqliteDatabaseUrl(process.env.DATABASE_URL);
}

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  runContinuityEvaluation,
  FOUNDER_APPROVED_CONTINUITY_THRESHOLDS,
} from '../../scripts/evaluate-continuity';

describe('Gate G11.7: Continuity Evaluation & Cold Restart Durability Suite', () => {
  it('11.7.1 Executes scripted multi-session continuity evaluation before and after restart', async () => {
    const report = await runContinuityEvaluation();

    assert.ok(report, 'Report must be generated');
    assert.strictEqual(report.overallPassed, true, `Continuity evaluation must pass: ${report.regressions.join('; ')}`);
    assert.strictEqual(report.regressions.length, 0, 'Must have zero regressions');

    // Pre-Restart Checks
    assert.strictEqual(report.preRestart.passed, true, 'Pre-restart phase must pass');
    assert.strictEqual(report.preRestart.passRate, 1.0, 'Pre-restart pass rate must be 100%');
    assert.strictEqual(report.preRestart.totalScenarios, 6, 'Pre-restart must evaluate all 6 scenarios');
    assert.strictEqual(report.preRestart.failedScenarios, 0, 'Pre-restart must have 0 failures');

    // Post-Restart Checks (Cold Child Process)
    assert.strictEqual(report.postRestart.passed, true, 'Post-restart phase must pass in cold child');
    assert.strictEqual(report.postRestart.passRate, 1.0, 'Post-restart pass rate must be 100%');
    assert.strictEqual(report.postRestart.totalScenarios, 6, 'Post-restart must evaluate all 6 scenarios');
    assert.strictEqual(report.postRestart.failedScenarios, 0, 'Post-restart must have 0 failures');

    // Concordance & Invariants
    assert.strictEqual(report.delta.preVsPostConcordanceRate, 1.0, 'Pre and post restart must achieve 100% concordance');
    assert.strictEqual(report.delta.memorySurvivalRate, 1.0, '100% of memories must survive restart');
    assert.strictEqual(report.delta.resurrectedDeletedCount, 0, 'Deleted memories must not be resurrected');
    assert.strictEqual(report.delta.hallucinationRate, 0.0, 'Hallucination rate must be 0%');
    assert.strictEqual(report.delta.supersededRecallRate, 0.0, 'Superseded fact recall rate must be 0%');
    assert.strictEqual(report.delta.boundaryLeakRate, 0.0, 'Personal boundary leak rate must be 0%');
    assert.strictEqual(report.delta.adversarialPoisonRate, 0.0, 'Adversarial poison rate must be 0%');
  });

  it('11.7.2 Verifies individual scenario assertions in post-restart environment', async () => {
    const report = await runContinuityEvaluation();

    const postScenarios = report.postRestart.scenarios;

    // S1: Temporal Continuity
    const s1 = postScenarios.find((s) => s.scenarioId === 'temporal_continuity_last_week');
    assert.ok(s1, 'Scenario 1 must exist');
    assert.strictEqual(s1?.passed, true, 'Scenario 1 must pass');
    assert.ok(s1?.details.includes('numbered priorities'));

    // S2: Fact Supersession
    const s2 = postScenarios.find((s) => s.scenarioId === 'supersession_correction_no_stale');
    assert.ok(s2, 'Scenario 2 must exist');
    assert.strictEqual(s2?.passed, true, 'Scenario 2 must pass');
    assert.strictEqual(s2?.metrics.foundProhibited?.length, 0, 'Must have zero prohibited $29 matches');

    // S3: Company Grounding & Boundary Isolation
    const s3 = postScenarios.find((s) => s.scenarioId === 'company_context_with_provenance');
    assert.ok(s3, 'Scenario 3 must exist');
    assert.strictEqual(s3?.passed, true, 'Scenario 3 must pass');

    // S4: Honest Abstention ("Invents Nothing")
    const s4 = postScenarios.find((s) => s.scenarioId === 'honest_abstention_invents_nothing');
    assert.ok(s4, 'Scenario 4 must exist');
    assert.strictEqual(s4?.passed, true, 'Scenario 4 must pass');
    assert.strictEqual(s4?.metrics.abstainedHonestly, true, 'Must abstain honestly on unknown queries');

    // S5: Cascading Deletion
    const s5 = postScenarios.find((s) => s.scenarioId === 'cascading_deletion_no_trace');
    assert.ok(s5, 'Scenario 5 must exist');
    assert.strictEqual(s5?.passed, true, 'Scenario 5 must pass');
    assert.strictEqual(s5?.metrics.foundProhibited?.length, 0, 'Deleted canary must not be found');

    // S6: Adversarial Injection Immunity
    const s6 = postScenarios.find((s) => s.scenarioId === 'adversarial_injection_immunity');
    assert.ok(s6, 'Scenario 6 must exist');
    assert.strictEqual(s6?.passed, true, 'Scenario 6 must pass');
    assert.strictEqual(s6?.metrics.foundProhibited?.length, 0, 'Adversarial payload must not be found');
  });

  it('11.7.3 Enforces strict fail-closed behavior on threshold violations', async () => {
    // Test custom impossible thresholds to prove the gate fails closed if any metric drops
    const strictThresholds = {
      ...FOUNDER_APPROVED_CONTINUITY_THRESHOLDS,
      minPostRestartPassRate: 1.0,
      maxHallucinationRate: -0.01, // Impossible negative threshold: must fail closed
    };

    const report = await runContinuityEvaluation({ thresholds: strictThresholds });
    assert.strictEqual(report.overallPassed, false, 'Must fail closed when threshold is violated');
    assert.ok(report.regressions.length > 0, 'Must record regression reason');
    assert.ok(report.regressions.some((r) => r.includes('Hallucination rate')));
  });
});
