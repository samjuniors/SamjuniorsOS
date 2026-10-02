import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { gradeAnswer, GRADER_VERSION } from '../../benchmark/generation-faithfulness/graders';
import { buildPrompt, PROMPT_VERSIONS, type PromptVersion } from '../../benchmark/generation-faithfulness/prompts';
import { SCENARIO_BATTERY } from '../../benchmark/generation-faithfulness/scenarios';
import { computeFixtureDigest } from '../../benchmark/memory-retrieval/fixture';
import type { ScenarioRunRecord } from '../../benchmark/generation-faithfulness/harness';

/**
 * ============================================================================
 * M5.4 — RE-GRADE SUITE (offline; NO model calls)
 * ============================================================================
 * Design §4: "Verdicts are pure functions of archived artifacts: every model
 * response is archived; re-grading reproduces verdicts exactly." This suite
 * re-grades every archived answer in every committed run-g*.json battery and
 * asserts:
 *
 *   R1  the archived verdicts reproduce EXACTLY (verdict + failure class +
 *       details + every check outcome) under the same grader version
 *   R2  version stamps are recorded per battery and per scenario (a known
 *       prompt version — prompt/1 baseline or prompt/2 remediation
 *       experiment — plus grade/1) and the fixture digest is the frozen
 *       digest
 *   R3  the archived inputs are complete: question + assembledContext +
 *       answer + digests are all present (reproducibility inputs)
 *   R4  environment-limited scenarios are recorded as such (never converted
 *       into passes) and their generation attempts are archived verbatim
 *   R5  every archived prompt REBUILDS byte-exactly from its recorded
 *       version (question + assembledContext + prompt version → the same
 *       promptDigest) — this pins prompt/1 as byte-stable across the
 *       prompt/2 code change and pins prompt/2 as deterministic
 *
 * If no run-g*.json exists yet (before the first live battery), the suite
 * SKIPS with an explicit message — the offline battery can never fail on a
 * quota window.
 */

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  skipped?: boolean;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`  [FAIL] ${name}: ${err?.message || err}`);
  }
}

interface BatteryRunRecord {
  label: string;
  promptVersion: string;
  graderVersion: string;
  fixtureDigest: string;
  scenarios: ScenarioRunRecord[];
}

const RESULTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../benchmark/generation-faithfulness/results');
const FROZEN_FIXTURE_DIGEST = '40e53f1581def28371af8f050bc5ba85eaf58a47cbb86a4f449fad1beef719fb';

async function main(): Promise<void> {
  console.log('\n======================================================');
  console.log('M5.4 RE-GRADE SUITE — offline, no model calls');
  console.log('======================================================\n');

  const runFiles = fs
    .readdirSync(RESULTS_DIR, { withFileTypes: true })
    // Baseline batteries (run-g*) and prompt/2 remediation batteries
    // (run-p2-g*) — both are committed evidence with the same record schema.
    .filter((e) => e.isFile() && /^run-(g|p2-g)[a-z0-9-]*\.json$/.test(e.name))
    .map((e) => e.name)
    .sort();

  if (runFiles.length === 0) {
    console.log('  [SKIP] no committed run-g*.json battery evidence yet — nothing to re-grade.');
    console.log('         (This suite pins the archived live batteries; it activates once');
    console.log('          benchmark/generation-faithfulness/results/run-g*.json exists.)');
    console.log('\n==================================================');
    console.log('M5.4 RE-GRADE SUITE RESULT: SKIPPED (no archived battery)');
    console.log('==================================================\n');
    return; // exit 0 — absence of live evidence is not an offline failure
  }

  for (const file of runFiles) {
    const record: BatteryRunRecord = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8'));

    await runTest(`${file}: R2 — version stamps + frozen fixture digest`, () => {
      assert.ok(
        record.promptVersion in PROMPT_VERSIONS,
        `battery promptVersion ${JSON.stringify(record.promptVersion)} is a known prompt version`
      );
      assert.strictEqual(record.graderVersion, GRADER_VERSION);
      assert.strictEqual(record.fixtureDigest, FROZEN_FIXTURE_DIGEST);
      assert.ok(record.scenarios.length >= 10, 'a battery archives all executed scenarios');
      for (const s of record.scenarios) {
        assert.strictEqual(s.promptVersion, record.promptVersion, `${s.scenarioId} scenario stamp matches battery stamp`);
      }
    });

    await runTest(`${file}: R3 — archived inputs complete for every scenario`, () => {
      for (const s of record.scenarios) {
        assert.ok(typeof s.question === 'string' && s.question.length > 0, `${s.scenarioId} question`);
        assert.ok(typeof s.assembledContext === 'string' && s.assembledContext.length > 0, `${s.scenarioId} assembledContext`);
        assert.ok(typeof s.contextDigest === 'string' && s.contextDigest.length === 64, `${s.scenarioId} contextDigest`);
        assert.ok(typeof s.promptDigest === 'string' && s.promptDigest.length === 64, `${s.scenarioId} promptDigest`);
        assert.ok(Array.isArray(s.attempts) && s.attempts.length >= 1, `${s.scenarioId} attempts archived`);
        // answer present unless environment-limited:
        if (s.verdict !== 'ENVIRONMENT_LIMITED') {
          assert.ok(typeof s.answer === 'string', `${s.scenarioId} answer archived`);
        }
      }
    });

    await runTest(`${file}: R1 — every archived verdict reproduces EXACTLY under grade/1`, () => {
      for (const s of record.scenarios) {
        if (s.verdict === 'ENVIRONMENT_LIMITED') continue;
        const regraded = gradeAnswer({
          scenarioId: s.scenarioId,
          question: s.question,
          assembledContext: s.assembledContext,
          answer: s.answer ?? '',
        });
        assert.strictEqual(regraded.verdict, s.verdict, `${s.scenarioId} verdict mismatch`);
        assert.strictEqual(regraded.failureClass, s.failureClass, `${s.scenarioId} failure class mismatch`);
        assert.strictEqual(regraded.details, s.details, `${s.scenarioId} details mismatch`);
        assert.deepStrictEqual(
          regraded.checks.map((c) => ({ id: c.id, passed: c.passed })),
          s.checks.map((c) => ({ id: c.id, passed: c.passed })),
          `${s.scenarioId} checks mismatch`
        );
      }
    });

    await runTest(`${file}: R5 — every archived prompt rebuilds byte-exactly from its recorded version`, () => {
      const byId = new Map(SCENARIO_BATTERY.map((s) => [s.scenarioId, s]));
      for (const s of record.scenarios) {
        const spec = byId.get(s.scenarioId);
        assert.ok(spec, `${s.scenarioId} is a known scenario`);
        assert.strictEqual(spec.question, s.question, `${s.scenarioId} question unchanged`);
        assert.ok(
          s.promptVersion in PROMPT_VERSIONS,
          `${s.scenarioId} promptVersion ${JSON.stringify(s.promptVersion)} is known`
        );
        const rebuilt = buildPrompt(spec, s.assembledContext, s.promptVersion as PromptVersion);
        assert.strictEqual(rebuilt.promptDigest, s.promptDigest, `${s.scenarioId} promptDigest rebuilds byte-exactly`);
      }
    });

    await runTest(`${file}: R4 — environment-limited scenarios recorded, never converted to passes`, () => {
      for (const s of record.scenarios) {
        if (s.verdict === 'ENVIRONMENT_LIMITED') {
          assert.strictEqual(s.failureClass, 'GF_ENVIRONMENT_LIMITED');
          assert.strictEqual(s.critical, false);
          assert.ok(s.attempts.length >= 1, 'transport attempts archived verbatim');
          assert.ok(s.attempts.every((a) => a.outcome === 'transport-error'), 'all attempts recorded as transport errors');
        } else {
          assert.notStrictEqual(s.failureClass, 'GF_ENVIRONMENT_LIMITED', 'non-env-limited must not carry the transport class');
        }
      }
    });
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log('\n==================================================');
  console.log(`M5.4 RE-GRADE SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');
  if (failed > 0) process.exit(1);
}

void main().catch((err) => {
  console.error(`M5.4 RE-GRADE SUITE HARNESS ERROR: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
