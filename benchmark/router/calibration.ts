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
import type {
  LabelledRouteItem,
  CalibrationBin,
  ReliabilityCurve,
  RouteCalibrationMetric,
  RouterCalibrationReport,
} from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PredictionSample {
  confidence: number;
  isCorrect: boolean;
  actualRoute: SophiaRoute;
  expectedRoute: SophiaRoute;
}

/**
 * Calculates Brier score: (1/N) * sum((confidence - outcome)^2).
 * Perfect calibration and prediction yields 0.0; uninformative baseline is ~0.25.
 */
export function calculateBrierScore(samples: Array<{ confidence: number; isCorrect: boolean }>): number {
  if (!samples.length) return 0.0;
  const sumSquaredDiff = samples.reduce((acc, s) => {
    const outcome = s.isCorrect ? 1.0 : 0.0;
    const diff = s.confidence - outcome;
    return acc + diff * diff;
  }, 0);
  return Math.round((sumSquaredDiff / samples.length) * 10000) / 10000;
}

/**
 * Generates an empirical reliability curve with equal-width confidence bins,
 * computing Expected Calibration Error (ECE) and Maximum Calibration Error (MCE).
 */
export function calculateReliabilityCurve(
  samples: Array<{ confidence: number; isCorrect: boolean }>,
  binCount = 5
): ReliabilityCurve {
  const bins: CalibrationBin[] = [];
  const total = samples.length;

  for (let b = 0; b < binCount; b++) {
    const binLower = Math.round((b / binCount) * 100) / 100;
    const binUpper = Math.round(((b + 1) / binCount) * 100) / 100;

    const inBin = samples.filter((s) => {
      if (b === binCount - 1) {
        return s.confidence >= binLower && s.confidence <= binUpper;
      }
      return s.confidence >= binLower && s.confidence < binUpper;
    });

    const count = inBin.length;
    let meanConfidence = Math.round(((binLower + binUpper) / 2) * 10000) / 10000;
    let empiricalAccuracy = 0.0;

    if (count > 0) {
      const sumConf = inBin.reduce((acc, s) => acc + s.confidence, 0);
      const sumCorrect = inBin.filter((s) => s.isCorrect).length;
      meanConfidence = Math.round((sumConf / count) * 10000) / 10000;
      empiricalAccuracy = Math.round((sumCorrect / count) * 10000) / 10000;
    }

    const calibrationError = Math.round(Math.abs(meanConfidence - empiricalAccuracy) * 10000) / 10000;

    bins.push({
      binIndex: b,
      binLower,
      binUpper,
      count,
      meanConfidence,
      empiricalAccuracy,
      calibrationError,
    });
  }

  // ECE = sum_b (N_b / N) * |mean_conf_b - acc_b|
  let ece = 0.0;
  let mce = 0.0;

  if (total > 0) {
    for (const bin of bins) {
      if (bin.count > 0) {
        ece += (bin.count / total) * bin.calibrationError;
        if (bin.calibrationError > mce) {
          mce = bin.calibrationError;
        }
      }
    }
  }

  return {
    bins,
    expectedCalibrationError: Math.round(ece * 10000) / 10000,
    maximumCalibrationError: Math.round(mce * 10000) / 10000,
  };
}

/**
 * Runs the authoritative routing calibration evaluation across labelled test items
 * and verifies low-confidence clarification threshold enforcement.
 */
export async function runRouterCalibration(options?: {
  datasetPath?: string;
  outputPath?: string;
  silent?: boolean;
}): Promise<RouterCalibrationReport> {
  const datasetFile = options?.datasetPath || path.resolve(__dirname, 'labelled-set.json');
  const outputFile = options?.outputPath || path.resolve(__dirname, 'results/router-calibration-report.json');

  if (!fs.existsSync(datasetFile)) {
    throw new Error(`Labelled dataset not found at ${datasetFile}`);
  }

  const rawData = fs.readFileSync(datasetFile, 'utf8');
  const items: LabelledRouteItem[] = JSON.parse(rawData);

  const allSamples: PredictionSample[] = [];
  const perRouteSamples: Record<SophiaRoute, PredictionSample[]> = {} as any;

  for (const r of SOPHIA_ROUTES) {
    perRouteSamples[r] = [];
  }

  let totalMalformed = 0;
  let failedClosedCount = 0;

  for (const item of items) {
    const expected = item.expectedRoute;
    let actualRoute: SophiaRoute;
    let confidence = 1.0;

    if (item.category === 'malformed_output') {
      totalMalformed++;
      const mockOut = item.mockModelOutput;
      const generatorOutput = mockOut?.rawText ?? JSON.stringify(mockOut);

      const res = await SophiaIntentClassifier.route({
        message: item.utterance,
        customGenerator: async () => generatorOutput,
      });

      actualRoute = res.route;
      confidence = res.confidence;

      if (res.route === 'ask-clarify' && res.liveAi === false) {
        failedClosedCount++;
      }
    } else {
      const res = SophiaIntentClassifier.fallbackRouteAnalysis(item.utterance);
      actualRoute = res.route;
      confidence = res.confidence;
    }

    const isCorrect = actualRoute === expected;
    const sample: PredictionSample = {
      confidence,
      isCorrect,
      actualRoute,
      expectedRoute: expected,
    };

    allSamples.push(sample);
    perRouteSamples[expected].push(sample);
  }

  // Verify low-confidence routes ask instead of acting (Gate G12.5 exit criterion)
  let lowConfTotalTested = 0;
  let lowConfDiverted = 0;
  let lowConfLeaks = 0;

  const actionableRoutes = SOPHIA_ROUTES.filter((r) => r !== 'ask-clarify');
  for (const r of actionableRoutes) {
    lowConfTotalTested++;
    const threshold = getRouteClarificationThreshold(r);
    // Sub-threshold test confidence (0.10 below threshold)
    const testConfidence = Math.max(0.20, Math.round((threshold - 0.15) * 100) / 100);

    const mockOutput = JSON.stringify({
      route: r,
      kind: 'directive_proposal',
      confidence: testConfidence,
      reason: `Low confidence mock test for route ${r}`,
    });

    const routeRes = await SophiaIntentClassifier.route({
      message: `Perform low confidence test action for ${r}`,
      customGenerator: async () => mockOutput,
    });

    if (routeRes.route === 'ask-clarify' && routeRes.isLowConfidenceClarification) {
      lowConfDiverted++;
      // Also register this sub-threshold test sample for reliability curve coverage
      allSamples.push({
        confidence: testConfidence,
        isCorrect: true, // Correctly asked instead of taking unauthorized/uncalibrated action
        actualRoute: 'ask-clarify',
        expectedRoute: 'ask-clarify',
      });
    } else {
      lowConfLeaks++;
      console.error(`[CALIBRATION LEAK] Route ${r} with confidence ${testConfidence} < ${threshold} was NOT diverted to ask-clarify!`);
    }
  }

  // Compute per-route calibration metrics
  const perRouteCalibration: Record<SophiaRoute, RouteCalibrationMetric> = {} as any;
  for (const r of SOPHIA_ROUTES) {
    const samples = perRouteSamples[r];
    const correctCount = samples.filter((s) => s.isCorrect).length;
    const sampleCount = samples.length;
    const accuracy = sampleCount > 0 ? Math.round((correctCount / sampleCount) * 1000) / 10 : 100.0;
    const brierScore = calculateBrierScore(samples);
    const reliabilityCurve = calculateReliabilityCurve(samples, 5);
    const clarificationThreshold = getRouteClarificationThreshold(r);

    perRouteCalibration[r] = {
      route: r,
      sampleCount,
      correctCount,
      accuracy,
      brierScore,
      clarificationThreshold,
      reliabilityCurve,
    };
  }

  // Compute overall calibration metrics
  const totalEvaluated = allSamples.length;
  const totalCorrect = allSamples.filter((s) => s.isCorrect).length;
  const overallAccuracy = totalEvaluated > 0 ? Math.round((totalCorrect / totalEvaluated) * 1000) / 10 : 100.0;
  const overallBrierScore = calculateBrierScore(allSamples);
  const overallReliabilityCurve = calculateReliabilityCurve(allSamples, 5);

  const report: RouterCalibrationReport = {
    timestamp: new Date().toISOString(),
    totalEvaluated,
    overallAccuracy,
    overallBrierScore,
    overallECE: overallReliabilityCurve.expectedCalibrationError,
    overallMCE: overallReliabilityCurve.maximumCalibrationError,
    overallReliabilityCurve,
    perRouteCalibration,
    clarificationThresholds: { ...DEFAULT_ROUTE_CLARIFICATION_THRESHOLDS },
    lowConfidenceClarificationMetrics: {
      totalTested: lowConfTotalTested,
      divertedToClarify: lowConfDiverted,
      lowConfidenceLeaks: lowConfLeaks,
      passed: lowConfLeaks === 0 && lowConfDiverted === lowConfTotalTested,
    },
    failClosedMetrics: {
      totalMalformedTested: totalMalformed,
      failedClosedToClarify: failedClosedCount,
      failedClosedToRefuse: 0,
      passed: totalMalformed > 0 ? failedClosedCount === totalMalformed : true,
    },
  };

  const outDir = path.dirname(outputFile);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  if (fs.existsSync(outputFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      const { timestamp: _t1, ...currentData } = report;
      const { timestamp: _t2, ...existingData } = existing;
      if (JSON.stringify(currentData) === JSON.stringify(existingData)) {
        if (!options?.silent) {
          printCalibrationReport(existing);
        }
        return existing;
      }
    } catch {
      // ignore parse error, write fresh
    }
  }

  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');

  if (!options?.silent) {
    printCalibrationReport(report);
  }

  return report;
}

export function printCalibrationReport(report: RouterCalibrationReport): void {
  console.log('\n========================================================================');
  console.log('       SOPHIA ROUTER CALIBRATION & RELIABILITY CURVE REPORT (G12.5)    ');
  console.log('========================================================================');
  console.log(`Evaluated Samples: ${report.totalEvaluated} | Overall Accuracy: ${report.overallAccuracy}%`);
  console.log(`Overall Brier Score: ${report.overallBrierScore.toFixed(4)} (Target: <= 0.1500)`);
  console.log(`Expected Calibration Error (ECE): ${report.overallECE.toFixed(4)} (Target: <= 0.1500)`);
  console.log(`Maximum Calibration Error (MCE): ${report.overallMCE.toFixed(4)} (Target: <= 0.2500)\n`);

  console.log('ROUTE                   TOTAL   CORRECT   ACCURACY   BRIER    THRESHOLD   ECE');
  console.log('--------------------------------------------------------------------------------');
  for (const r of SOPHIA_ROUTES) {
    const m = report.perRouteCalibration[r];
    const routeCol = r.padEnd(23, ' ');
    const totalCol = String(m.sampleCount).padStart(5, ' ');
    const correctCol = String(m.correctCount).padStart(7, ' ');
    const accCol = `${m.accuracy.toFixed(1)}%`.padStart(10, ' ');
    const brierCol = m.brierScore.toFixed(4).padStart(8, ' ');
    const threshCol = m.clarificationThreshold.toFixed(2).padStart(11, ' ');
    const eceCol = m.reliabilityCurve.expectedCalibrationError.toFixed(4).padStart(7, ' ');
    console.log(`${routeCol} ${totalCol} ${correctCol} ${accCol} ${brierCol} ${threshCol} ${eceCol}`);
  }
  console.log('--------------------------------------------------------------------------------');

  console.log('\n--- Overall Reliability Curve (Confidence Bins) ---');
  console.log('BIN   RANGE          COUNT   MEAN_CONF   EMPIRICAL_ACC   CALIB_ERROR');
  console.log('----------------------------------------------------------------');
  for (const b of report.overallReliabilityCurve.bins) {
    const binCol = String(b.binIndex).padEnd(5, ' ');
    const rangeCol = `[${b.binLower.toFixed(2)}, ${b.binUpper.toFixed(2)}]`.padEnd(14, ' ');
    const countCol = String(b.count).padStart(5, ' ');
    const confCol = b.meanConfidence.toFixed(4).padStart(11, ' ');
    const accCol = b.empiricalAccuracy.toFixed(4).padStart(15, ' ');
    const errCol = b.calibrationError.toFixed(4).padStart(13, ' ');
    console.log(`${binCol} ${rangeCol} ${countCol} ${confCol} ${accCol} ${errCol}`);
  }

  console.log('\n--- Gate Invariants Verification ---');
  console.log(`Low-Confidence Clarification: ${report.lowConfidenceClarificationMetrics.divertedToClarify}/${report.lowConfidenceClarificationMetrics.totalTested} diverted (${report.lowConfidenceClarificationMetrics.passed ? 'PASS: ASKS INSTEAD OF ACTING' : 'FAIL'})`);
  console.log(`Low-Confidence Leaks: ${report.lowConfidenceClarificationMetrics.lowConfidenceLeaks} (Must be 0)`);
  console.log(`Fail-Closed Malformed Tests: ${report.failClosedMetrics.failedClosedToClarify}/${report.failClosedMetrics.totalMalformedTested} (${report.failClosedMetrics.passed ? 'PASS' : 'FAIL'})`);
  console.log('========================================================================\n');
}

// CLI direct runner
if (process.argv[1] && process.argv[1].endsWith('calibration.ts')) {
  runRouterCalibration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Calibration evaluation failed:', err);
      process.exit(1);
    });
}
