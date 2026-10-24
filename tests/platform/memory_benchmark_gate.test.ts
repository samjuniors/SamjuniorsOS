/**
 * Gate G4.4: Memory Retrieval Benchmark Regression Gate Verification Suite
 *
 * Verifies:
 * 1. Authoritative recorded baseline integrity (ci-baseline.json).
 * 2. Real benchmark execution satisfies all recorded baseline thresholds (0 failures, 100% render recall).
 * 3. Fail-closed behavior on simulated overall failure regression.
 * 4. Fail-closed behavior on union recall drop below threshold.
 * 5. Fail-closed behavior on render recall drop below 100%.
 * 6. Fail-closed behavior on personal/company boundary or authority leak.
 * 7. Category-level regression threshold enforcement.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateAgainstBaseline,
  runBenchmarkCli,
  CIBaselineConfig,
} from '../../benchmark/memory-retrieval/verify-ci-gate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

describe('Gate G4.4: Memory Retrieval Benchmark Regression Gate in CI', () => {
  const baselinePath = path.resolve(REPO_ROOT, 'benchmark/memory-retrieval/ci-baseline.json');
  assert.ok(fs.existsSync(baselinePath), 'ci-baseline.json must exist');
  const baseline: CIBaselineConfig = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

  it('4.4.1 Validates recorded baseline configuration integrity', () => {
    assert.strictEqual(baseline.baselineId, 'M5.3-A3');
    assert.strictEqual(baseline.queryCount, 13);
    assert.strictEqual(baseline.thresholds.maxOverallFailures, 0);
    assert.strictEqual(baseline.thresholds.minOverallRenderRecall, 1.0);
    assert.ok(baseline.thresholds.minOverallUnionRecall >= 0.90);
    assert.strictEqual(baseline.thresholds.maxAuthorityFailures, 0);
    assert.strictEqual(baseline.thresholds.maxBoundaryViolations, 0);
    assert.strictEqual(baseline.thresholds.maxFounderScopeViolations, 0);
    assert.ok(baseline.fixtureDigest.length === 64, 'Fixture digest must be valid SHA-256');
  });

  it('4.4.2 Executes real benchmark and verifies current system meets all baseline thresholds', async () => {
    const runResult = await runBenchmarkCli();

    assert.ok(runResult, 'Benchmark CLI must return a valid run result object');
    assert.strictEqual(runResult.queries.length, 13, 'Must evaluate exactly 13 benchmark queries');

    const evaluation = evaluateAgainstBaseline(runResult, baseline);

    assert.strictEqual(evaluation.passed, true, `Gate evaluation must pass: ${evaluation.regressions.join(', ')}`);
    assert.strictEqual(evaluation.regressions.length, 0);

    // Assert each individual check passed
    for (const check of evaluation.checks) {
      assert.strictEqual(check.passed, true, `Check "${check.name}" failed: ${check.message}`);
    }

    assert.strictEqual(runResult.aggregate.overall.failureCount, 0, 'Zero retrieval failures allowed in production');
    assert.strictEqual(runResult.aggregate.overall.meanRenderRecall, 1.0, '100% of gold items must render in assembled context');
  });

  it('4.4.3 Fails closed when simulated retrieval failures exceed threshold', () => {
    const mockResult = {
      fixtureDigest: baseline.fixtureDigest,
      queries: [
        {
          query: { queryId: 'BQ1a' },
          failures: [{ evidenceKey: 'FACT-OLD-01', failureClass: 'RETRIEVAL', primaryGap: 'D_temporal_filtering' }],
          metrics: { boundaryCorrect: 1, founderScopeCorrect: 1 },
        },
      ],
      aggregate: {
        overall: {
          failureCount: 1, // Exceeds threshold of 0!
          meanRenderRecall: 1.0,
          meanUnionRecall: 0.92,
        },
        categories: {},
      },
    };

    const evaluation = evaluateAgainstBaseline(mockResult, baseline);
    assert.strictEqual(evaluation.passed, false, 'Must fail closed when failureCount > 0');
    assert.ok(evaluation.regressions.some((r) => r.includes('Overall failures regressed to 1')));
  });

  it('4.4.4 Fails closed when mean union recall drops below threshold', () => {
    const mockResult = {
      fixtureDigest: baseline.fixtureDigest,
      queries: [],
      aggregate: {
        overall: {
          failureCount: 0,
          meanRenderRecall: 1.0,
          meanUnionRecall: 0.84, // Below threshold of 0.90!
        },
        categories: {},
      },
    };

    const evaluation = evaluateAgainstBaseline(mockResult, baseline);
    assert.strictEqual(evaluation.passed, false, 'Must fail closed when union recall < 90%');
    assert.ok(evaluation.regressions.some((r) => r.includes('Mean union recall dropped')));
  });

  it('4.4.5 Fails closed when mean render recall drops below 100%', () => {
    const mockResult = {
      fixtureDigest: baseline.fixtureDigest,
      queries: [],
      aggregate: {
        overall: {
          failureCount: 0,
          meanRenderRecall: 0.95, // Below threshold of 1.0!
          meanUnionRecall: 0.92,
        },
        categories: {},
      },
    };

    const evaluation = evaluateAgainstBaseline(mockResult, baseline);
    assert.strictEqual(evaluation.passed, false, 'Must fail closed when render recall < 100%');
    assert.ok(evaluation.regressions.some((r) => r.includes('Mean render recall dropped')));
  });

  it('4.4.6 Fails closed on personal/company boundary or authority leak', () => {
    const mockResult = {
      fixtureDigest: baseline.fixtureDigest,
      queries: [
        {
          query: { queryId: 'BQ7a' },
          failures: [{ failureClass: 'AUTHORITY_LIFECYCLE', evidenceKey: 'PM-01' }],
          metrics: { boundaryCorrect: 0, founderScopeCorrect: 0 },
        },
      ],
      aggregate: {
        overall: {
          failureCount: 0,
          meanRenderRecall: 1.0,
          meanUnionRecall: 0.92,
        },
        categories: {},
      },
    };

    const evaluation = evaluateAgainstBaseline(mockResult, baseline);
    assert.strictEqual(evaluation.passed, false, 'Must fail closed when boundary or authority leak occurs');
    assert.ok(evaluation.regressions.some((r) => r.includes('Boundary violation in query BQ7a')));
    assert.ok(evaluation.regressions.some((r) => r.includes('Founder scope violation in query BQ7a')));
  });

  it('4.4.7 Fails closed when fixture digest is tampered or desynchronized', () => {
    const mockResult = {
      fixtureDigest: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      queries: [],
      aggregate: {
        overall: {
          failureCount: 0,
          meanRenderRecall: 1.0,
          meanUnionRecall: 0.92,
        },
        categories: {},
      },
    };

    const evaluation = evaluateAgainstBaseline(mockResult, baseline);
    assert.strictEqual(evaluation.passed, false, 'Must fail closed when fixture digest does not match');
    assert.ok(evaluation.regressions.some((r) => r.includes('Fixture digest altered')));
  });
});
