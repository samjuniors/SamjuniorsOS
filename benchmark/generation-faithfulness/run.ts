/**
 * ============================================================================
 * M5.4 — GENERATION-FAITHFULNESS BATTERY CLI
 * ============================================================================
 * Usage:
 *   bun run benchmark/generation-faithfulness/run.ts --label g1
 *   bun run benchmark/generation-faithfulness/run.ts --label g1 --json   # JSON to stdout ONLY
 *   bun run benchmark/generation-faithfulness/run.ts --label p2-g1 --prompt prompt/2
 *
 * The --prompt flag selects the versioned prompt the battery runs
 * (default: prompt/1, the immutable baseline). The prompt version is
 * recorded in the battery artifact and in every scenario record, and the
 * regrade suite rebuilds every archived prompt byte-exactly from its
 * version.
 *
 * Pipeline: reset durable state → seed the frozen fixture universe through
 * the REAL store APIs → verify the seed → per scenario: assemble (determin-
 * istic) → generate (ONE governed model call, bounded recorded retries) →
 * grade (deterministic pure graders) → emit + archive.
 *
 * LIVE INVOCATION IS EXPLICIT: this CLI performs 12 model calls (one battery)
 * — the offline regression battery contains no model calls and can never fail
 * on a quota window. Evidence is committed under results/ with the same
 * discipline as the M5.1 retrieval benchmark.
 *
 * EXIT CODES: 0 = battery ran (graded FAILs are findings, not errors);
 *            1 = harness itself broken (seed verification, store errors);
 *            2 = battery ran but is ENVIRONMENT-LIMITED (invalid battery —
 *                re-run; never counted as passing).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { resetDurableState, seedBenchmarkUniverse, type SeedResult } from '../memory-retrieval/seed';
import {
  SophiaMemoryStore,
} from '../../src/lib/server/sophia/personal-memory-store';
import { EpistemicClaimStore } from '../../src/lib/server/epistemic/claim-store';
import { CompanyKnowledgeStore } from '../../src/lib/server/knowledge/knowledge-store';
import { CompanyMemoryStore } from '../../src/lib/server/memory/memory-store';
import {
  runBattery,
  MODEL_UNDER_TEST,
  GENERATION_PARAMS,
  MAX_GENERATION_ATTEMPTS,
  RETRY_BACKOFF_MS,
  type ScenarioRunRecord,
  type BatterySummary,
} from './harness';
import { PROMPT_VERSIONS, BASELINE_PROMPT_VERSION, type PromptVersion } from './prompts';
import { GRADER_VERSION } from './graders';
import { computeFixtureDigest } from '../memory-retrieval/fixture';

/** ISOLATION: dedicated scratch dir (same contract as the M5.1 CLI). */
const SCRATCH_DIR = path.join(os.tmpdir(), 'samjuniors-m54-benchmark');

export interface BatteryRunRecord {
  label: string;
  batteryVersion: string;
  promptVersion: string;
  graderVersion: string;
  fixtureDigest: string;
  model: { requested: string };
  generationParams: { temperature: number; maxTokens: number };
  flakePolicy: { maxAttempts: number; backoffMs: readonly number[] };
  startedAt: string;
  finishedAt: string;
  scenarios: ScenarioRunRecord[];
  summary: BatterySummary;
  acceptance: {
    allScenariosPass: boolean;
    zeroCritical: boolean;
    zeroEnvironmentLimited: boolean;
    batteryValid: boolean;
  };
}

function resultsLabel(): string {
  const idx = process.argv.indexOf('--label');
  if (idx !== -1 && process.argv[idx + 1] && /^[a-z0-9-]{1,16}$/i.test(process.argv[idx + 1])) {
    return process.argv[idx + 1].toLowerCase();
  }
  return 'g1';
}

/** Prompt-version selection: --prompt prompt/2 (default: the prompt/1 baseline). */
function promptVersionFromArgv(): PromptVersion {
  const idx = process.argv.indexOf('--prompt');
  const raw = idx !== -1 ? process.argv[idx + 1] : undefined;
  if (raw === undefined) return BASELINE_PROMPT_VERSION;
  if (raw in PROMPT_VERSIONS) return raw as PromptVersion;
  throw new Error(
    `Unknown --prompt version "${raw}" (known versions: ${Object.keys(PROMPT_VERSIONS).join(', ')})`
  );
}

/** Seed verification — fail LOUDLY rather than grade answers from a bad seed. */
async function verifySeed(seed: SeedResult): Promise<void> {
  const problems: string[] = [];

  const sophiaMemory = SophiaMemoryStore.getInstance();
  const activeForA = (await sophiaMemory.listAllMemories(seed.founderA, { active: true })).length;
  if (activeForA !== 8) problems.push(`founder A ACTIVE personal memories: expected 8, got ${activeForA}`);

  const epistemic = EpistemicClaimStore.getInstance();
  const activeFacts = await epistemic.listActiveFacts();
  if (activeFacts.length !== 4) problems.push(`active canonical facts: expected 4, got ${activeFacts.length}`);
  const oldFact = await epistemic.getFact('fact-lumora-price-29');
  if (!oldFact || oldFact.validityState !== 'superseded' || oldFact.supersededById !== 'fact-lumora-price-49') {
    problems.push('FACT-OLD-01 supersession chain not established by seed');
  }

  const knowledge = await CompanyKnowledgeStore.getInstance().getAllKnowledge();
  if (knowledge.length !== 6) problems.push(`knowledge items: expected 6, got ${knowledge.length}`);
  const precedents = await CompanyMemoryStore.getInstance().getAllMemories();
  if (precedents.length !== 6) problems.push(`precedents: expected 6, got ${precedents.length}`);

  if (problems.length > 0) {
    throw new Error(`SEED VERIFICATION FAILED:\n  - ${problems.join('\n  - ')}`);
  }
}

function renderMarkdownReport(record: BatteryRunRecord): string {
  const out: string[] = [];
  out.push(`# M5.4 Generation-Faithfulness Battery — run-${record.label}`);
  out.push('');
  out.push(`- Started: ${record.startedAt} | Finished: ${record.finishedAt}`);
  out.push(`- Fixture digest (SHA-256): \`${record.fixtureDigest}\``);
  out.push(`- Prompt version: \`${record.promptVersion}\` | Grader version: \`${record.graderVersion}\``);
  out.push(`- Model under test: \`${record.model.requested}\` (reported: ${JSON.stringify(record.scenarios[0]?.model.reported ?? null)})`);
  out.push(`- Generation params: temperature ${record.generationParams.temperature}, max_tokens ${record.generationParams.maxTokens}`);
  out.push(`- Flake policy: ≤ ${record.flakePolicy.maxAttempts} attempts, backoff ${JSON.stringify(record.flakePolicy.backoffMs)}`);
  out.push('');
  out.push('## Per-scenario verdicts');
  out.push('');
  out.push('| Scenario | Class | Verdict | Failure class | Checks | Latency |');
  out.push('|---|---|---|---|---|---|');
  for (const s of record.scenarios) {
    const checks = s.checks.map((c) => `${c.passed ? '✓' : '✗'} ${c.id}`).join('<br>') || '—';
    out.push(
      `| ${s.scenarioId} | ${s.className} | **${s.verdict}** | ${s.failureClass ?? '—'}${s.critical ? ' ⚠CRITICAL' : ''} | ${checks} | ${s.latencyMs} ms |`
    );
  }
  out.push('');
  out.push('## Summary');
  out.push('');
  out.push(`- Total: ${record.summary.total} | PASS: ${record.summary.passed} | FAIL: ${record.summary.failed} | ENVIRONMENT-LIMITED: ${record.summary.environmentLimited}`);
  out.push(`- Retries used: ${record.summary.retriesUsed}`);
  if (Object.keys(record.summary.byFailureClass).length > 0) {
    out.push(`- Failure classes: ${JSON.stringify(record.summary.byFailureClass)}`);
  }
  if (record.summary.criticalViolations.length > 0) {
    out.push(`- **CRITICAL VIOLATIONS: ${record.summary.criticalViolations.join(', ')}**`);
  }
  out.push('');
  out.push('## Acceptance');
  out.push('');
  out.push(`- All scenarios pass: **${record.acceptance.allScenariosPass}**`);
  out.push(`- Zero critical violations: **${record.acceptance.zeroCritical}**`);
  out.push(`- Zero environment-limited (battery valid): **${record.acceptance.zeroEnvironmentLimited}**`);
  out.push('');
  out.push('_No aggregate score is computed: faithfulness is a contract, not a gradient (design §6)._');
  return out.join('\n');
}

async function run(): Promise<void> {
  const label = resultsLabel();
  const promptVersion = promptVersionFromArgv();
  const startedAt = new Date().toISOString();

  const resultsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');
  const resultsJson = path.join(resultsDir, `run-${label}.json`);
  const resultsMd = path.join(resultsDir, `run-${label}.md`);
  // ARTIFACT GUARD: committed batteries are immutable evidence — refuse to
  // overwrite an existing run-<label>.* (rename it or choose a new label).
  if (fs.existsSync(resultsJson) || fs.existsSync(resultsMd)) {
    process.stderr.write(
      `M5.4 BATTERY: results for label "${label}" already exist (${resultsJson}). ` +
        `Committed batteries are immutable evidence — rename/move the existing artifact or use a new label.\n`
    );
    process.exit(1);
  }

  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  process.chdir(SCRATCH_DIR);
  resetDurableState();
  const seed = await seedBenchmarkUniverse();
  await verifySeed(seed);

  process.stderr.write(
    `\nM5.4 GENERATION-FAITHFULNESS BATTERY (${label}) — ${MODEL_UNDER_TEST} — ${promptVersion}\n`
  );
  const outcome = await runBattery(seed, { promptVersion });
  const finishedAt = new Date().toISOString();

  const record: BatteryRunRecord = {
    label,
    batteryVersion: 'gf-battery/1',
    promptVersion,
    graderVersion: GRADER_VERSION,
    fixtureDigest: computeFixtureDigest(),
    model: { requested: MODEL_UNDER_TEST },
    generationParams: { ...GENERATION_PARAMS },
    flakePolicy: { maxAttempts: MAX_GENERATION_ATTEMPTS, backoffMs: RETRY_BACKOFF_MS },
    startedAt,
    finishedAt,
    scenarios: outcome.scenarios,
    summary: outcome.summary,
    acceptance: {
      allScenariosPass: outcome.allScenariosPass,
      zeroCritical: outcome.zeroCritical,
      zeroEnvironmentLimited: outcome.batteryValid,
      batteryValid: outcome.batteryValid,
    },
  };

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }

  const summary = renderMarkdownReport(record);
  process.stderr.write(`\n${summary}\n`);

  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(resultsJson, `${JSON.stringify(record, null, 2)}\n`);
  fs.writeFileSync(resultsMd, `${summary}\n`);
  process.stderr.write(
    `\nResults written to benchmark/generation-faithfulness/results/run-${label}.{json,md}\n` +
      `Fixture digest: ${record.fixtureDigest}\n`
  );

  if (!record.acceptance.batteryValid) process.exit(2);
}

void run().catch((err) => {
  process.stderr.write(`M5.4 BATTERY HARNESS ERROR: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
