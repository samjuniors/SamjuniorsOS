import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SophiaIntentClassifier } from '../../src/lib/server/sophia/intent-classifier';
import {
  SOPHIA_ROUTES,
  SophiaRoute,
  isKnownSophiaRoute,
} from '../../src/types/decision';
import type {
  LabelledRouteItem,
  RouteAccuracyMetric,
  RouterEvalReport,
} from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runRouterEvaluation(options?: {
  datasetPath?: string;
  outputPath?: string;
  silent?: boolean;
}): Promise<RouterEvalReport> {
  const datasetFile = options?.datasetPath || path.resolve(__dirname, 'labelled-set.json');
  const outputFile = options?.outputPath || path.resolve(__dirname, 'results/router-accuracy-report.json');

  if (!fs.existsSync(datasetFile)) {
    throw new Error(`Labelled dataset not found at ${datasetFile}`);
  }

  const rawData = fs.readFileSync(datasetFile, 'utf8');
  const items: LabelledRouteItem[] = JSON.parse(rawData);

  // Initialize per-route metrics
  const perRouteAccuracy: Record<SophiaRoute, RouteAccuracyMetric> = {} as any;
  const confusionMatrix: Record<SophiaRoute, Record<SophiaRoute, number>> = {} as any;

  for (const r of SOPHIA_ROUTES) {
    perRouteAccuracy[r] = {
      route: r,
      total: 0,
      correct: 0,
      accuracy: 0,
      misclassifications: [],
    };
    confusionMatrix[r] = {} as any;
    for (const target of SOPHIA_ROUTES) {
      confusionMatrix[r][target] = 0;
    }
  }

  let totalEvaluated = 0;
  let totalCorrect = 0;
  let totalMalformed = 0;
  let failedClosedCount = 0;

  for (const item of items) {
    totalEvaluated++;
    const expected = item.expectedRoute;
    perRouteAccuracy[expected].total++;

    let actualRoute: SophiaRoute;
    let confidence = 1.0;
    let reason = '';

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
      reason = res.reason;

      // Fail-closed invariant check: invalid output must fail closed to ask-clarify
      if (res.route === 'ask-clarify' && res.liveAi === false) {
        failedClosedCount++;
      }
    } else {
      // Evaluate deterministic routing / fallback analysis for canonical categories
      const res = SophiaIntentClassifier.fallbackRouteAnalysis(item.utterance);
      actualRoute = res.route;
      confidence = res.confidence;
      reason = res.reason;
    }

    if (confusionMatrix[expected] && confusionMatrix[expected][actualRoute] !== undefined) {
      confusionMatrix[expected][actualRoute]++;
    }

    if (actualRoute === expected) {
      perRouteAccuracy[expected].correct++;
      totalCorrect++;
    } else {
      perRouteAccuracy[expected].misclassifications.push({
        id: item.id,
        utterance: item.utterance,
        actualRoute,
        confidence,
        reason,
      });
    }
  }

  // Calculate percentage accuracies
  for (const r of SOPHIA_ROUTES) {
    const m = perRouteAccuracy[r];
    m.accuracy = m.total > 0 ? Math.round((m.correct / m.total) * 1000) / 10 : 100.0;
  }

  const overallAccuracy = totalEvaluated > 0
    ? Math.round((totalCorrect / totalEvaluated) * 1000) / 10
    : 100.0;

  const report: RouterEvalReport = {
    timestamp: new Date().toISOString(),
    totalEvaluated,
    overallAccuracy,
    perRouteAccuracy,
    confusionMatrix,
    failClosedMetrics: {
      totalMalformedTested: totalMalformed,
      failedClosedToClarify: failedClosedCount,
      failedClosedToRefuse: 0,
      passed: totalMalformed > 0 ? failedClosedCount === totalMalformed : true,
    },
  };

  // Ensure output directory exists and save report
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
          printReport(existing);
        }
        return existing;
      }
    } catch {
      // ignore parse error, write fresh
    }
  }

  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');

  if (!options?.silent) {
    printReport(report);
  }

  return report;
}

function printReport(report: RouterEvalReport) {
  console.log('\n========================================================================');
  console.log('         SOPHIA ROUTER ACCURACY & VALIDATION BENCHMARK REPORT           ');
  console.log('========================================================================');
  console.log(`Evaluated Items: ${report.totalEvaluated} | Overall Accuracy: ${report.overallAccuracy}%\n`);

  console.log('ROUTE                   TOTAL   CORRECT   ACCURACY   STATUS');
  console.log('------------------------------------------------------------------------');
  for (const r of SOPHIA_ROUTES) {
    const m = report.perRouteAccuracy[r];
    const status = m.accuracy >= 95.0 ? 'PASS [HIGH]' : m.accuracy >= 80.0 ? 'PASS [ACCEPTABLE]' : 'FAIL [SUBPAR]';
    const routeCol = r.padEnd(23, ' ');
    const totalCol = String(m.total).padStart(5, ' ');
    const correctCol = String(m.correct).padStart(7, ' ');
    const accCol = `${m.accuracy.toFixed(1)}%`.padStart(10, ' ');
    console.log(`${routeCol} ${totalCol} ${correctCol} ${accCol}   ${status}`);
  }
  console.log('------------------------------------------------------------------------');
  console.log(`Fail-Closed Malformed Tests: ${report.failClosedMetrics.failedClosedToClarify}/${report.failClosedMetrics.totalMalformedTested} passed closed (${report.failClosedMetrics.passed ? 'VERIFIED' : 'FAILED'})`);
  console.log('========================================================================\n');
}

// Direct invocation runner
if (process.argv[1] && process.argv[1].endsWith('evaluate.ts')) {
  runRouterEvaluation()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Router evaluation failed:', err);
      process.exit(1);
    });
}
