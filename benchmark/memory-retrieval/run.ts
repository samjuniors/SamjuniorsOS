/**
 * ============================================================================
 * M5.1 — BENCHMARK CLI (single-process, deterministic)
 * ============================================================================
 * Usage:
 *   bun run benchmark/memory-retrieval/run.ts            # human summary
 *   bun run benchmark/memory-retrieval/run.ts --json     # JSON to stdout ONLY
 *
 * Pipeline: reset durable state → seed the fixture universe through the REAL
 * store APIs → verify the seed → run the retrieval battery per query →
 * evaluate → emit. The process is single-use by design: store singletons are
 * process-lifetime, so cross-run determinism is guaranteed by running this
 * file fresh (the benchmark's own test suite asserts byte-identical output
 * across two consecutive runs).
 *
 * EXIT CODES: 0 = harness ran (failures in the BASELINE are findings, not
 * errors). 1 = harness itself is broken (seed verification, store errors).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { resetDurableState, seedBenchmarkUniverse } from './seed';
import { runBenchmarkHarness } from './harness';
import { evaluateBenchmark } from './evaluate';
import { renderMarkdownReport } from './report';
import {
  SophiaMemoryStore,
} from '../../src/lib/server/sophia/personal-memory-store';
import { EpistemicClaimStore } from '../../src/lib/server/epistemic/claim-store';
import { CompanyKnowledgeStore } from '../../src/lib/server/knowledge/knowledge-store';
import { CompanyMemoryStore } from '../../src/lib/server/memory/memory-store';

/**
 * ISOLATION: every DurableFileStore resolves its data directory from
 * process.cwd() at first construction. The benchmark therefore runs inside a
 * dedicated scratch directory so it can NEVER pollute the repository's real
 * .data state (which the other test suites read). resetDurableState() wipes
 * the scratch on entry, making consecutive runs deterministic too.
 */
const SCRATCH_DIR = path.join(os.tmpdir(), 'samjuniors-m51-benchmark');

/**
 * M5.2: results-file naming. The A0 baseline evidence
 * (results/baseline-a0.{json,md}, committed at b9d1504) is IMMUTABLE — the
 * CLI therefore never writes to it. Runs are labeled (`--label <name>`,
 * default `a1`) and persist to results/run-<label>.{json,md}. Measurement
 * semantics (fixture, gold sets, metrics, classification) are unchanged;
 * this is plumbing so post-M5.2 runs never destroy the baseline evidence.
 */
function resultsLabel(): string {
  const idx = process.argv.indexOf('--label');
  if (idx !== -1 && process.argv[idx + 1] && /^[a-z0-9-]{1,16}$/i.test(process.argv[idx + 1])) {
    return process.argv[idx + 1].toLowerCase();
  }
  return 'a1';
}

/** Seed verification: fail LOUDLY rather than report numbers from a bad seed. */
async function verifySeed(): Promise<void> {
  const problems: string[] = [];

  const sophiaMemory = SophiaMemoryStore.getInstance();
  const activeForA = (await sophiaMemory.listAllMemories('founder-m51-a', { active: true })).length;
  if (activeForA !== 8) {
    problems.push(`founder A ACTIVE personal memories: expected 8, got ${activeForA}`);
  }
  const pendingForA = (
    await sophiaMemory.listAllMemories('founder-m51-a', { lifecycleState: 'PENDING_REVIEW' })
  ).length;
  if (pendingForA !== 1) problems.push(`founder A PENDING_REVIEW: expected 1, got ${pendingForA}`);
  const supersededForA = (
    await sophiaMemory.listAllMemories('founder-m51-a', { lifecycleState: 'SUPERSEDED' })
  ).length;
  if (supersededForA !== 1) problems.push(`founder A SUPERSEDED: expected 1, got ${supersededForA}`);
  const rejectedForA = (
    await sophiaMemory.listAllMemories('founder-m51-a', { lifecycleState: 'REJECTED' })
  ).length;
  if (rejectedForA !== 1) problems.push(`founder A REJECTED: expected 1, got ${rejectedForA}`);
  const forB = (await sophiaMemory.listAllMemories('founder-m51-b', { active: true })).length;
  if (forB !== 2) problems.push(`founder B active: expected 2, got ${forB}`);

  const epistemic = EpistemicClaimStore.getInstance();
  const activeFacts = await epistemic.listActiveFacts();
  if (activeFacts.length !== 4) {
    problems.push(`active canonical facts: expected 4, got ${activeFacts.length}`);
  }
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

async function run(): Promise<void> {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  process.chdir(SCRATCH_DIR);
  resetDurableState();
  const seed = await seedBenchmarkUniverse();
  await verifySeed();

  const outcomes = await runBenchmarkHarness(seed);
  const result = evaluateBenchmark(outcomes);

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  // Human summary (stderr keeps stdout clean for piping).
  const summary = renderMarkdownReport(result);
  process.stderr.write(`${summary}\n`);

  // Persist results next to the harness (deterministic content; no clock).
  // M5.2: run-labeled files — the committed A0 baseline evidence is never
  // overwritten (see resultsLabel).
  const label = resultsLabel();
  const resultsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, `run-${label}.json`), `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(path.join(resultsDir, `run-${label}.md`), `${summary}\n`);
  process.stderr.write(
    `\nResults written to benchmark/memory-retrieval/results/run-${label}.{json,md}\n` +
      `Fixture digest: ${result.fixtureDigest}\n`
  );
}

void run().catch((err) => {
  process.stderr.write(`BENCHMARK HARNESS ERROR: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
