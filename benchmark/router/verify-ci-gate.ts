/**
 * SamJuniorsOS — Router Calibration CI Regression Gate (Gate G12.5)
 *
 * Runs the routing calibration benchmark, compares results against the
 * authoritative recorded baseline (results/ci-baseline.json), and enforces
 * strict regression thresholds:
 * - Brier score bounds
 * - Reliability curve calibration errors (ECE, MCE)
 * - Zero low-confidence route execution (must ask instead of acting)
 * - 100% fail-closed on malformed outputs
 *
 * Exits with code 0 if all thresholds pass.
 * Exits with code 1 if any regression is detected.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runRouterCalibration } from './calibration';
import { SOPHIA_ROUTES, SophiaRoute } from '../../src/types/decision';
import type { RouterCalibrationReport } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RegressionCheck {
  name: string;
  measured: number | string;
  threshold: number | string;
  passed: boolean;
  message?: string;
}

export interface GateEvaluationResult {
  passed: boolean;
  baselineId: string;
  checks: RegressionCheck[];
  regressions: string[];
}

export function evaluateAgainstBaseline(
  report: RouterCalibrationReport,
  baseline: any
): GateEvaluationResult {
  const checks: RegressionCheck[] = [];
  const regressions: string[] = [];
  const t = baseline.thresholds;

  // 1. Overall Accuracy
  const accPassed = report.overallAccuracy >= t.minOverallAccuracy;
  checks.push({
    name: 'Overall Router Accuracy',
    measured: `${report.overallAccuracy}%`,
    threshold: `>= ${t.minOverallAccuracy}%`,
    passed: accPassed,
    message: accPassed ? undefined : `Overall accuracy ${report.overallAccuracy}% dropped below threshold ${t.minOverallAccuracy}%`,
  });
  if (!accPassed) regressions.push(`Overall accuracy ${report.overallAccuracy}% dropped below ${t.minOverallAccuracy}%`);

  // 2. Overall Brier Score
  const brierPassed = report.overallBrierScore <= t.maxOverallBrierScore;
  checks.push({
    name: 'Overall Brier Score',
    measured: report.overallBrierScore.toFixed(4),
    threshold: `<= ${t.maxOverallBrierScore.toFixed(4)}`,
    passed: brierPassed,
    message: brierPassed ? undefined : `Overall Brier score ${report.overallBrierScore} degraded above ${t.maxOverallBrierScore}`,
  });
  if (!brierPassed) regressions.push(`Overall Brier score ${report.overallBrierScore} degraded above ${t.maxOverallBrierScore}`);

  // 3. Expected Calibration Error (ECE)
  const ecePassed = report.overallECE <= t.maxExpectedCalibrationError;
  checks.push({
    name: 'Expected Calibration Error (ECE)',
    measured: report.overallECE.toFixed(4),
    threshold: `<= ${t.maxExpectedCalibrationError.toFixed(4)}`,
    passed: ecePassed,
    message: ecePassed ? undefined : `ECE ${report.overallECE} degraded above ${t.maxExpectedCalibrationError}`,
  });
  if (!ecePassed) regressions.push(`ECE ${report.overallECE} degraded above ${t.maxExpectedCalibrationError}`);

  // 4. Maximum Calibration Error (MCE)
  const mcePassed = report.overallMCE <= t.maxMaximumCalibrationError;
  checks.push({
    name: 'Maximum Calibration Error (MCE)',
    measured: report.overallMCE.toFixed(4),
    threshold: `<= ${t.maxMaximumCalibrationError.toFixed(4)}`,
    passed: mcePassed,
    message: mcePassed ? undefined : `MCE ${report.overallMCE} degraded above ${t.maxMaximumCalibrationError}`,
  });
  if (!mcePassed) regressions.push(`MCE ${report.overallMCE} degraded above ${t.maxMaximumCalibrationError}`);

  // 5. Zero Low-Confidence Leaks (Crucial Q-DEC-3 invariant: low confidence asks instead of acting)
  const leaks = report.lowConfidenceClarificationMetrics.lowConfidenceLeaks;
  const leaksPassed = leaks <= t.maxLowConfidenceLeaks;
  checks.push({
    name: 'Zero Low-Confidence Route Leaks',
    measured: leaks,
    threshold: `<= ${t.maxLowConfidenceLeaks}`,
    passed: leaksPassed,
    message: leaksPassed ? undefined : `${leaks} low-confidence predictions bypassed clarification and attempted action!`,
  });
  if (!leaksPassed) regressions.push(`${leaks} low-confidence predictions bypassed clarification!`);

  // 6. Fail-Closed Malformed Pass Rate
  const malformedTotal = report.failClosedMetrics.totalMalformedTested;
  const malformedClosed = report.failClosedMetrics.failedClosedToClarify;
  const malformedRate = malformedTotal > 0 ? malformedClosed / malformedTotal : 1.0;
  const malformedPassed = malformedRate >= t.failClosedMalformedPassRate;
  checks.push({
    name: 'Fail-Closed Malformed Pass Rate',
    measured: `${(malformedRate * 100).toFixed(1)}%`,
    threshold: `>= ${(t.failClosedMalformedPassRate * 100).toFixed(1)}%`,
    passed: malformedPassed,
    message: malformedPassed ? undefined : `Fail-closed pass rate ${(malformedRate * 100).toFixed(1)}% below required 100%`,
  });
  if (!malformedPassed) regressions.push(`Fail-closed pass rate below 100%`);

  // 7. Per-Route Accuracy and Brier Score
  for (const r of SOPHIA_ROUTES) {
    const routeCalib = report.perRouteCalibration[r];
    const minAcc = t.perRouteMinAccuracy[r] ?? 80.0;
    const maxBrier = t.perRouteMaxBrierScore[r] ?? 0.20;

    const rAccPassed = routeCalib.accuracy >= minAcc;
    checks.push({
      name: `Route "${r}" Accuracy`,
      measured: `${routeCalib.accuracy}%`,
      threshold: `>= ${minAcc}%`,
      passed: rAccPassed,
      message: rAccPassed ? undefined : `Route "${r}" accuracy ${routeCalib.accuracy}% < ${minAcc}%`,
    });
    if (!rAccPassed) regressions.push(`Route "${r}" accuracy degraded to ${routeCalib.accuracy}%`);

    const rBrierPassed = routeCalib.brierScore <= maxBrier;
    checks.push({
      name: `Route "${r}" Brier Score`,
      measured: routeCalib.brierScore.toFixed(4),
      threshold: `<= ${maxBrier.toFixed(4)}`,
      passed: rBrierPassed,
      message: rBrierPassed ? undefined : `Route "${r}" Brier score ${routeCalib.brierScore} > ${maxBrier}`,
    });
    if (!rBrierPassed) regressions.push(`Route "${r}" Brier score degraded to ${routeCalib.brierScore}`);
  }

  return {
    passed: regressions.length === 0,
    baselineId: baseline.baselineId,
    checks,
    regressions,
  };
}

export async function runVerifyCIGate(): Promise<boolean> {
  const baselinePath = path.resolve(__dirname, 'results/ci-baseline.json');
  if (!fs.existsSync(baselinePath)) {
    console.error(`Baseline file not found at ${baselinePath}`);
    return false;
  }

  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  console.log('Running Router Calibration Evaluation...');
  const report = await runRouterCalibration({ silent: true });

  const result = evaluateAgainstBaseline(report, baseline);

  console.log('\n========================================================================');
  console.log(`      ROUTER CALIBRATION CI REGRESSION GATE: ${result.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`      Baseline ID: ${result.baselineId}`);
  console.log('========================================================================\n');

  console.log('CHECK                                MEASURED       THRESHOLD      STATUS');
  console.log('------------------------------------------------------------------------');
  for (const c of result.checks) {
    const nameCol = c.name.padEnd(36, ' ');
    const measCol = String(c.measured).padEnd(14, ' ');
    const threshCol = String(c.threshold).padEnd(14, ' ');
    const statusCol = c.passed ? 'PASS' : 'FAIL';
    console.log(`${nameCol} ${measCol} ${threshCol} ${statusCol}`);
  }
  console.log('------------------------------------------------------------------------');

  if (result.regressions.length > 0) {
    console.error('\nRegressions Detected:');
    for (const r of result.regressions) {
      console.error(`  - ${r}`);
    }
  } else {
    console.log('\nAll router calibration and threshold regression checks passed cleanly.');
  }

  console.log('========================================================================\n');
  return result.passed;
}

if (process.argv[1] && process.argv[1].endsWith('verify-ci-gate.ts')) {
  runVerifyCIGate()
    .then((passed) => process.exit(passed ? 0 : 1))
    .catch((err) => {
      console.error('CI regression gate error:', err);
      process.exit(1);
    });
}
