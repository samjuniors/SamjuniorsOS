import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SophiaIntentClassifier } from '../../src/lib/server/sophia/intent-classifier';
import {
  SOPHIA_ROUTES,
  SophiaRoute,
  DEFAULT_ROUTE_CLARIFICATION_THRESHOLDS,
  getRouteClarificationThreshold,
} from '../../src/types/decision';
import {
  calculateBrierScore,
  calculateReliabilityCurve,
  runRouterCalibration,
} from '../../benchmark/router/calibration';
import { evaluateAgainstBaseline } from '../../benchmark/router/verify-ci-gate';
import type { RouterCalibrationReport } from '../../benchmark/router/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ============================================================================
 * GATE G12.5: ROUTING EVALUATION & CALIBRATION TEST SUITE
 * ============================================================================
 * Exit evidence required:
 * "Report with a baseline and a CI regression threshold; low-confidence routes
 * ask instead of acting."
 */

async function runTests() {
  console.log('\n======================================================');
  console.log('GATE G12.5: ROUTING EVALUATION & CALIBRATION TESTS');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err?.message || err}\n`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // GROUP 1: MATHEMATICAL VERIFICATION (BRIER SCORE & RELIABILITY CURVE)
  // --------------------------------------------------------------------------
  console.log('--- Group 1: Mathematical Verification ---');

  await test('1.1. calculateBrierScore computes exact mathematical values', () => {
    // Empty samples -> 0.0
    assert.strictEqual(calculateBrierScore([]), 0.0);

    // Perfect predictions with full confidence: (1 - 1)^2 = 0
    const perfectSamples = [
      { confidence: 1.0, isCorrect: true },
      { confidence: 1.0, isCorrect: true },
    ];
    assert.strictEqual(calculateBrierScore(perfectSamples), 0.0);

    // 50/50 uncalibrated prediction: (0.5 - 1)^2 = 0.25; (0.5 - 0)^2 = 0.25 -> avg 0.25
    const coinFlipSamples = [
      { confidence: 0.5, isCorrect: true },
      { confidence: 0.5, isCorrect: false },
    ];
    assert.strictEqual(calculateBrierScore(coinFlipSamples), 0.25);

    // Completely inverted prediction: (1.0 - 0)^2 = 1.0
    const invertedSamples = [{ confidence: 1.0, isCorrect: false }];
    assert.strictEqual(calculateBrierScore(invertedSamples), 1.0);

    // Known heterogeneous set:
    // Sample 1: conf 0.8, correct 1 -> diff 0.2 -> sq 0.04
    // Sample 2: conf 0.6, correct 1 -> diff 0.4 -> sq 0.16
    // Sample 3: conf 0.9, correct 0 -> diff 0.9 -> sq 0.81
    // Sample 4: conf 0.2, correct 0 -> diff 0.2 -> sq 0.04
    // Sum = 1.05 / 4 = 0.2625
    const hetero = [
      { confidence: 0.8, isCorrect: true },
      { confidence: 0.6, isCorrect: true },
      { confidence: 0.9, isCorrect: false },
      { confidence: 0.2, isCorrect: false },
    ];
    assert.strictEqual(calculateBrierScore(hetero), 0.2625);
  });

  await test('1.2. calculateReliabilityCurve produces valid bins, ECE and MCE', () => {
    const samples = [
      { confidence: 0.85, isCorrect: true },
      { confidence: 0.90, isCorrect: true },
      { confidence: 0.95, isCorrect: false }, // Bin 4 [0.8, 1.0]: 3 samples, meanConf 0.90, acc 2/3 (0.6667)
      { confidence: 0.65, isCorrect: true },  // Bin 3 [0.6, 0.8]: 1 sample, meanConf 0.65, acc 1.0
      { confidence: 0.45, isCorrect: false }, // Bin 2 [0.4, 0.6]: 1 sample, meanConf 0.45, acc 0.0
    ];

    const curve = calculateReliabilityCurve(samples, 5);
    assert.strictEqual(curve.bins.length, 5, 'Must have exactly 5 bins');

    const bin4 = curve.bins[4];
    assert.strictEqual(bin4.count, 3);
    assert.strictEqual(bin4.meanConfidence, 0.9);
    assert.strictEqual(bin4.empiricalAccuracy, 0.6667);
    assert.strictEqual(bin4.calibrationError, 0.2333);

    const bin3 = curve.bins[3];
    assert.strictEqual(bin3.count, 1);
    assert.strictEqual(bin3.meanConfidence, 0.65);
    assert.strictEqual(bin3.empiricalAccuracy, 1.0);
    assert.strictEqual(bin3.calibrationError, 0.35);

    const bin2 = curve.bins[2];
    assert.strictEqual(bin2.count, 1);
    assert.strictEqual(bin2.meanConfidence, 0.45);
    assert.strictEqual(bin2.empiricalAccuracy, 0.0);
    assert.strictEqual(bin2.calibrationError, 0.45);

    // MCE must be max error among populated bins (0.45)
    assert.strictEqual(curve.maximumCalibrationError, 0.45);

    // ECE must be weighted sum: (3/5)*0.2333 + (1/5)*0.35 + (1/5)*0.45 = 0.13998 + 0.07 + 0.09 = 0.3
    assert.ok(Math.abs(curve.expectedCalibrationError - 0.3) < 0.001);
  });

  // --------------------------------------------------------------------------
  // GROUP 2: LOW-CONFIDENCE ROUTES ASK INSTEAD OF ACTING (Q-DEC-3)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 2: Low-Confidence Routes Ask Instead of Acting ---');

  await test('2.1. Model proposal with confidence below threshold diverts to ask-clarify', async () => {
    // Threshold for delegate is 0.75; supply confidence 0.55
    const mockOutput = JSON.stringify({
      route: 'delegate',
      kind: 'directive_proposal',
      confidence: 0.55,
      reason: 'Draft a tentative marketing plan',
    });

    const res = await SophiaIntentClassifier.route({
      message: 'Draft a marketing strategy document',
      customGenerator: async () => mockOutput,
    });

    assert.strictEqual(res.route, 'ask-clarify', 'Must divert to ask-clarify');
    assert.strictEqual(res.divertedFromRoute, 'delegate', 'Must record divertedFromRoute');
    assert.strictEqual(res.isLowConfidenceClarification, true);
    assert.strictEqual(res.liveAi, false);
    assert.strictEqual(res.confidence, 0.55);
    assert.strictEqual(res.clarificationThreshold, 0.75);
    assert.ok(res.reason.includes('Low confidence (0.55 < 0.75)'));
    assert.strictEqual(res.proposal.kind, 'clarification_prompt');
    assert.ok(res.proposal.ambiguityReason?.includes('below the required reliability threshold'));
    assert.ok(res.proposal.structuredOptions && res.proposal.structuredOptions.length >= 3);
  });

  await test('2.2. Model proposal with confidence >= threshold proceeds normally without divert', async () => {
    // Threshold for delegate is 0.75; supply confidence 0.88
    const mockOutput = JSON.stringify({
      route: 'delegate',
      kind: 'directive_proposal',
      confidence: 0.88,
      reason: 'Authoritative assignment to Aris Thorne',
    });

    const res = await SophiaIntentClassifier.route({
      message: 'Have Aris research AI memory architectures',
      customGenerator: async () => mockOutput,
    });

    assert.strictEqual(res.route, 'delegate');
    assert.strictEqual(res.divertedFromRoute, undefined);
    assert.strictEqual(res.isLowConfidenceClarification, undefined);
    assert.strictEqual(res.liveAi, true);
    assert.strictEqual(res.confidence, 0.88);
  });

  await test('2.3. Every actionable route diverts when confidence is below its threshold', async () => {
    const actionable = SOPHIA_ROUTES.filter((r) => r !== 'ask-clarify');

    for (const r of actionable) {
      const threshold = getRouteClarificationThreshold(r);
      const lowConf = Math.max(0.1, threshold - 0.2);

      const mock = JSON.stringify({
        route: r,
        kind: 'directive_proposal',
        confidence: lowConf,
        reason: `Testing route ${r} below threshold`,
      });

      const res = await SophiaIntentClassifier.route({
        message: `Action message for ${r}`,
        customGenerator: async () => mock,
      });

      assert.strictEqual(
        res.route,
        'ask-clarify',
        `Route "${r}" with confidence ${lowConf} (< ${threshold}) must ask instead of acting!`
      );
      assert.strictEqual(res.divertedFromRoute, r);
      assert.strictEqual(res.isLowConfidenceClarification, true);
    }
  });

  await test('2.4. Custom clarification thresholds override default thresholds cleanly', async () => {
    // Standard threshold for 'use-tool' is 0.70.
    // If caller sets custom threshold to 0.40, a confidence of 0.50 should NOT divert:
    const mock = JSON.stringify({
      route: 'use-tool',
      kind: 'tool_call_proposal',
      confidence: 0.50,
      reason: 'Tool call inspection',
    });

    const resAllowed = await SophiaIntentClassifier.route({
      message: 'Inspect repository status',
      customGenerator: async () => mock,
      clarificationThresholds: { 'use-tool': 0.40 },
    });
    assert.strictEqual(resAllowed.route, 'use-tool', 'Lowered threshold must permit route');

    // If caller sets custom threshold to 0.90, confidence of 0.85 should divert:
    const mockHigh = JSON.stringify({
      route: 'use-tool',
      kind: 'tool_call_proposal',
      confidence: 0.85,
      reason: 'Tool call inspection',
    });
    const resDiverted = await SophiaIntentClassifier.route({
      message: 'Inspect repository status',
      customGenerator: async () => mockHigh,
      clarificationThresholds: { 'use-tool': 0.90 },
    });
    assert.strictEqual(resDiverted.route, 'ask-clarify', 'Raised threshold must trigger clarification');
    assert.strictEqual(resDiverted.divertedFromRoute, 'use-tool');
  });

  await test('2.5. ask-clarify never diverts regardless of confidence score', async () => {
    const mock = JSON.stringify({
      route: 'ask-clarify',
      kind: 'clarification_prompt',
      confidence: 0.20,
      reason: 'Clarification query',
    });

    const res = await SophiaIntentClassifier.route({
      message: 'Can you look into something?',
      customGenerator: async () => mock,
    });
    assert.strictEqual(res.route, 'ask-clarify');
    assert.strictEqual(res.divertedFromRoute, undefined);
  });

  // --------------------------------------------------------------------------
  // GROUP 3: ROUTING CALIBRATION BENCHMARK & REPORT
  // --------------------------------------------------------------------------
  console.log('\n--- Group 3: Routing Calibration Benchmark & Report ---');

  await test('3.1. runRouterCalibration generates complete durable calibration report', async () => {
    const reportPath = path.resolve(__dirname, '../../benchmark/router/results/router-calibration-report.json');
    const report: RouterCalibrationReport = await runRouterCalibration({ silent: true });

    assert.ok(fs.existsSync(reportPath), `Report file must exist at ${reportPath}`);
    assert.ok(report.totalEvaluated >= 68, `Report must evaluate at least 68 items, got ${report.totalEvaluated}`);
    assert.ok(report.overallAccuracy >= 95.0, `Overall accuracy must be >= 95%, got ${report.overallAccuracy}%`);
    assert.ok(report.overallBrierScore <= 0.15, `Overall Brier score must be <= 0.15, got ${report.overallBrierScore}`);
    assert.ok(report.overallECE <= 0.20, `ECE must be <= 0.20, got ${report.overallECE}`);
    assert.ok(report.overallMCE <= 0.55, `MCE must be <= 0.55, got ${report.overallMCE}`);
  });

  await test('3.2. Report covers all 10 canonical routes with reliability curves', async () => {
    const reportPath = path.resolve(__dirname, '../../benchmark/router/results/router-calibration-report.json');
    const report: RouterCalibrationReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    for (const r of SOPHIA_ROUTES) {
      const calib = report.perRouteCalibration[r];
      assert.ok(calib, `Route "${r}" must exist in perRouteCalibration`);
      assert.strictEqual(calib.route, r);
      assert.ok(calib.sampleCount >= 5, `Route "${r}" must have >= 5 samples (found ${calib.sampleCount})`);
      assert.ok(calib.brierScore <= 0.15, `Route "${r}" Brier score must be <= 0.15 (got ${calib.brierScore})`);
      assert.strictEqual(calib.clarificationThreshold, DEFAULT_ROUTE_CLARIFICATION_THRESHOLDS[r]);
      assert.strictEqual(calib.reliabilityCurve.bins.length, 5);
    }
  });

  await test('3.3. Zero low-confidence route execution leaks are detected', async () => {
    const reportPath = path.resolve(__dirname, '../../benchmark/router/results/router-calibration-report.json');
    const report: RouterCalibrationReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    assert.strictEqual(
      report.lowConfidenceClarificationMetrics.lowConfidenceLeaks,
      0,
      'Must have zero low-confidence leaks'
    );
    assert.strictEqual(report.lowConfidenceClarificationMetrics.passed, true);
    assert.strictEqual(report.failClosedMetrics.passed, true);
  });

  // --------------------------------------------------------------------------
  // GROUP 4: CI REGRESSION THRESHOLD ENFORCEMENT
  // --------------------------------------------------------------------------
  console.log('\n--- Group 4: CI Regression Threshold Enforcement ---');

  const baselinePath = path.resolve(__dirname, '../../benchmark/router/results/ci-baseline.json');

  await test('4.1. evaluateAgainstBaseline passes cleanly against authoritative baseline', async () => {
    assert.ok(fs.existsSync(baselinePath), 'Baseline file must exist');
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

    const reportPath = path.resolve(__dirname, '../../benchmark/router/results/router-calibration-report.json');
    const report: RouterCalibrationReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    const evalResult = evaluateAgainstBaseline(report, baseline);
    assert.strictEqual(evalResult.passed, true, `Gate evaluation must pass: ${evalResult.regressions.join(', ')}`);
    assert.strictEqual(evalResult.regressions.length, 0);
  });

  await test('4.2. evaluateAgainstBaseline fails if accuracy drops or Brier score exceeds threshold', () => {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const reportPath = path.resolve(__dirname, '../../benchmark/router/results/router-calibration-report.json');
    const report: RouterCalibrationReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    // Artificially degrade accuracy
    const degradedReport: RouterCalibrationReport = {
      ...report,
      overallAccuracy: 88.0, // Below 95.0
      overallBrierScore: 0.35, // Above 0.15
    };

    const evalResult = evaluateAgainstBaseline(degradedReport, baseline);
    assert.strictEqual(evalResult.passed, false, 'Degraded report must fail CI gate');
    assert.ok(evalResult.regressions.some((r) => r.includes('Overall accuracy 88% dropped below 95%')));
    assert.ok(evalResult.regressions.some((r) => r.includes('Overall Brier score 0.35 degraded above 0.15')));
  });

  await test('4.3. evaluateAgainstBaseline fails immediately on any low-confidence leak', () => {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const reportPath = path.resolve(__dirname, '../../benchmark/router/results/router-calibration-report.json');
    const report: RouterCalibrationReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    const leakedReport: RouterCalibrationReport = {
      ...report,
      lowConfidenceClarificationMetrics: {
        ...report.lowConfidenceClarificationMetrics,
        lowConfidenceLeaks: 1, // Single unauthorized execution leak
      },
    };

    const evalResult = evaluateAgainstBaseline(leakedReport, baseline);
    assert.strictEqual(evalResult.passed, false, 'Leaked report must fail CI gate');
    assert.ok(evalResult.regressions.some((r) => r.includes('low-confidence predictions bypassed clarification')));
  });

  console.log('\n======================================================');
  console.log(`GATE G12.5 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
