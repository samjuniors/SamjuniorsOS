/**
 * SamJuniorsOS — Memory Retrieval Benchmark CI Regression Gate (Gate G4.4)
 *
 * Runs the deterministic memory retrieval benchmark, compares results against
 * the authoritative recorded baseline (`ci-baseline.json`), and enforces strict
 * regression thresholds.
 *
 * Exits with code 0 if all thresholds pass.
 * Exits with code 1 if any failure, recall drop, or boundary leak is detected.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

export interface CategoryThreshold {
  maxFailures: number;
  minRenderRecall: number;
}

export interface CIBaselineConfig {
  baselineId: string;
  description: string;
  fixtureDigest: string;
  queryCount: number;
  thresholds: {
    maxOverallFailures: number;
    minOverallUnionRecall: number;
    minOverallRenderRecall: number;
    maxAuthorityFailures: number;
    maxGraphCandidateFailures: number;
    maxBoundaryViolations: number;
    maxFounderScopeViolations: number;
    perCategory: Record<string, CategoryThreshold>;
  };
}

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

/**
 * Pure evaluation function: compares BenchmarkRunResult against CIBaselineConfig
 */
export function evaluateAgainstBaseline(
  runResult: any,
  baseline: CIBaselineConfig
): GateEvaluationResult {
  const checks: RegressionCheck[] = [];
  const regressions: string[] = [];

  // 1. Fixture digest match
  const digestMatch = runResult.fixtureDigest === baseline.fixtureDigest;
  checks.push({
    name: 'Fixture Digest Integrity',
    measured: runResult.fixtureDigest.slice(0, 16) + '...',
    threshold: baseline.fixtureDigest.slice(0, 16) + '...',
    passed: digestMatch,
    message: digestMatch ? undefined : `Fixture digest altered! Expected ${baseline.fixtureDigest}, got ${runResult.fixtureDigest}`,
  });
  if (!digestMatch) {
    regressions.push(`Fixture digest altered! Expected ${baseline.fixtureDigest}, got ${runResult.fixtureDigest}`);
  }

  // 2. Query count match
  const totalQueries = runResult.queries?.length || 0;
  const countMatch = totalQueries === baseline.queryCount;
  checks.push({
    name: 'Total Queries Evaluated',
    measured: totalQueries,
    threshold: baseline.queryCount,
    passed: countMatch,
    message: countMatch ? undefined : `Query count mismatch: expected ${baseline.queryCount}, got ${totalQueries}`,
  });
  if (!countMatch) {
    regressions.push(`Query count mismatch: expected ${baseline.queryCount}, got ${totalQueries}`);
  }

  // 3. Overall failure count
  const overallFailures = runResult.aggregate?.overall?.failureCount ?? 999;
  const failuresPass = overallFailures <= baseline.thresholds.maxOverallFailures;
  checks.push({
    name: 'Overall Retrieval Failures',
    measured: overallFailures,
    threshold: `<= ${baseline.thresholds.maxOverallFailures}`,
    passed: failuresPass,
    message: failuresPass ? undefined : `Failure count regressed: ${overallFailures} failures (max allowed: ${baseline.thresholds.maxOverallFailures})`,
  });
  if (!failuresPass) {
    const failureList = (runResult.queries || []).flatMap((q: any) =>
      (q.failures || []).map((f: any) => `${q.query.queryId} (${f.evidenceKey}): ${f.primaryGap || f.failureClass}`)
    );
    regressions.push(`Overall failures regressed to ${overallFailures}: ${failureList.join(', ')}`);
  }

  // 4. Mean render recall
  const renderRecall = runResult.aggregate?.overall?.meanRenderRecall ?? 0;
  const renderPass = renderRecall >= baseline.thresholds.minOverallRenderRecall;
  checks.push({
    name: 'Mean Render Recall',
    measured: `${(renderRecall * 100).toFixed(1)}%`,
    threshold: `>= ${(baseline.thresholds.minOverallRenderRecall * 100).toFixed(1)}%`,
    passed: renderPass,
    message: renderPass ? undefined : `Render recall dropped below threshold: ${(renderRecall * 100).toFixed(1)}%`,
  });
  if (!renderPass) {
    regressions.push(`Mean render recall dropped to ${(renderRecall * 100).toFixed(1)}% (threshold: ${(baseline.thresholds.minOverallRenderRecall * 100).toFixed(1)}%)`);
  }

  // 5. Mean union recall
  const unionRecall = runResult.aggregate?.overall?.meanUnionRecall ?? 0;
  const unionPass = unionRecall >= baseline.thresholds.minOverallUnionRecall;
  checks.push({
    name: 'Mean Union Recall',
    measured: `${(unionRecall * 100).toFixed(1)}%`,
    threshold: `>= ${(baseline.thresholds.minOverallUnionRecall * 100).toFixed(1)}%`,
    passed: unionPass,
    message: unionPass ? undefined : `Union recall dropped below threshold: ${(unionRecall * 100).toFixed(1)}%`,
  });
  if (!unionPass) {
    regressions.push(`Mean union recall dropped to ${(unionRecall * 100).toFixed(1)}% (threshold: ${(baseline.thresholds.minOverallUnionRecall * 100).toFixed(1)}%)`);
  }

  // 6. Authority & lifecycle failures
  let authorityFailures = 0;
  let boundaryViolations = 0;
  let founderScopeViolations = 0;

  for (const q of runResult.queries || []) {
    for (const f of q.failures || []) {
      if (f.failureClass === 'AUTHORITY_LIFECYCLE') {
        authorityFailures++;
      }
    }
    if (q.metrics?.boundaryCorrect === 0) {
      boundaryViolations++;
      regressions.push(`Boundary violation in query ${q.query?.queryId}: personal and company context leaked!`);
    }
    if (q.metrics?.founderScopeCorrect === 0) {
      founderScopeViolations++;
      regressions.push(`Founder scope violation in query ${q.query?.queryId}: cross-founder memory leakage!`);
    }
  }

  const authorityPass = authorityFailures <= baseline.thresholds.maxAuthorityFailures;
  checks.push({
    name: 'Authority & Lifecycle Violations',
    measured: authorityFailures,
    threshold: `<= ${baseline.thresholds.maxAuthorityFailures}`,
    passed: authorityPass,
    message: authorityPass ? undefined : `Authority / lifecycle violations detected: ${authorityFailures}`,
  });
  if (!authorityPass) {
    regressions.push(`Authority / lifecycle violations regressed: ${authorityFailures}`);
  }

  const boundaryPass = boundaryViolations <= baseline.thresholds.maxBoundaryViolations;
  checks.push({
    name: 'Personal/Company Boundary Violations',
    measured: boundaryViolations,
    threshold: `<= ${baseline.thresholds.maxBoundaryViolations}`,
    passed: boundaryPass,
  });

  const founderScopePass = founderScopeViolations <= baseline.thresholds.maxFounderScopeViolations;
  checks.push({
    name: 'Founder Scope Violations',
    measured: founderScopeViolations,
    threshold: `<= ${baseline.thresholds.maxFounderScopeViolations}`,
    passed: founderScopePass,
  });

  // 7. Per-category regression checks
  for (const [catName, catThreshold] of Object.entries(baseline.thresholds.perCategory)) {
    const catData = runResult.aggregate?.categories?.[catName];
    if (catData) {
      const catFailuresPass = catData.failureCount <= catThreshold.maxFailures;
      const catRenderPass = catData.meanRenderRecall >= catThreshold.minRenderRecall;
      if (!catFailuresPass || !catRenderPass) {
        regressions.push(
          `Category ${catName} regressed: failures=${catData.failureCount} (max ${catThreshold.maxFailures}), renderRecall=${(catData.meanRenderRecall * 100).toFixed(0)}% (min ${(catThreshold.minRenderRecall * 100).toFixed(0)}%)`
        );
      }
    }
  }

  const passed = regressions.length === 0 && checks.every((c) => c.passed);
  return {
    passed,
    baselineId: baseline.baselineId,
    checks,
    regressions,
  };
}

/**
 * Spawns the benchmark runner to gather JSON metrics
 */
export async function runBenchmarkCli(): Promise<any> {
  const runTsPath = path.resolve(__dirname, 'run.ts');
  const dbPath = path.resolve(REPO_ROOT, 'prisma/db/custom.db').replace(/\\/g, '/');

  return new Promise((resolve, reject) => {
    // Try bun first, fallback to node --import tsx
    const isBun = typeof (globalThis as any).Bun !== 'undefined' || Boolean(process.versions.bun);
    const cmd = isBun ? 'bun' : process.execPath;
    const args = isBun
      ? ['run', runTsPath, '--json']
      : ['--import', 'tsx', runTsPath, '--json'];

    const child = spawn(cmd, args, {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: `file:${dbPath}`,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });

    let stdoutData = '';
    child.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn benchmark CLI: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Benchmark CLI exited with non-zero code ${code}`));
      }
      try {
        const parsed = JSON.parse(stdoutData.trim());
        resolve(parsed);
      } catch (err: any) {
        reject(new Error(`Failed to parse benchmark JSON output: ${err.message}\nOutput: ${stdoutData.slice(0, 500)}`));
      }
    });
  });
}

/**
 * CLI Entry point
 */
export async function main(): Promise<void> {
  const baselinePath = path.resolve(__dirname, 'ci-baseline.json');
  if (!fs.existsSync(baselinePath)) {
    console.error(`FATAL: Recorded baseline configuration not found at ${baselinePath}`);
    process.exit(1);
  }

  const baseline: CIBaselineConfig = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

  console.log('======================================================================');
  console.log(`SamJuniorsOS Memory Retrieval Benchmark Regression Gate (Gate G4.4)`);
  console.log(`Recorded Baseline: ${baseline.baselineId} — ${baseline.description}`);
  console.log(`Fixture Digest:    ${baseline.fixtureDigest}`);
  console.log('======================================================================\n');

  console.log('[1/2] Executing deterministic memory retrieval benchmark battery...');
  const startTime = Date.now();
  let runResult: any;

  try {
    runResult = await runBenchmarkCli();
  } catch (err: any) {
    console.error(`\n[FATAL] Benchmark execution failed: ${err.message}`);
    process.exit(1);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[2/2] Benchmark completed in ${durationSec}s. Evaluating results against regression thresholds...\n`);

  const evaluation = evaluateAgainstBaseline(runResult, baseline);

  console.log('--- REGRESSION THRESHOLD VERIFICATION ---');
  for (const check of evaluation.checks) {
    const symbol = check.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${symbol}  ${check.name.padEnd(38)} Measured: ${String(check.measured).padEnd(10)} Threshold: ${check.threshold}`);
    if (check.message) {
      console.log(`         ↳ ${check.message}`);
    }
  }

  console.log('\n======================================================================');
  if (evaluation.passed) {
    console.log(`RESULT: PASS — Zero memory retrieval regressions detected against ${baseline.baselineId}.`);
    console.log('======================================================================\n');
    process.exit(0);
  } else {
    console.error(`RESULT: FAIL — ${evaluation.regressions.length} memory retrieval regression(s) detected!`);
    for (const reg of evaluation.regressions) {
      console.error(`  - ${reg}`);
    }
    console.log('======================================================================\n');
    process.exit(1);
  }
}

// Only run main() if executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(`FATAL: Unexpected regression gate crash: ${err.message}`);
    process.exit(1);
  });
}
