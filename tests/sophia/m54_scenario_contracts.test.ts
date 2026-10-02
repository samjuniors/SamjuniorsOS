import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { resetDurableState, seedBenchmarkUniverse, type SeedResult } from '../../benchmark/memory-retrieval/seed';
import { computeFixtureDigest } from '../../benchmark/memory-retrieval/fixture';
import { detectTemporalIntent } from '../../src/lib/server/retrieval/temporal-semantics';
import { detectDependencyIntent } from '../../src/lib/server/retrieval/dependency-relations';
import { SCENARIO_BATTERY } from '../../benchmark/generation-faithfulness/scenarios';
import { buildPrompt, PROMPT_VERSIONS, RELATIONSHIP_INSTRUCTION, CITATION_INSTRUCTION, CITATION_INSTRUCTION_V2, SYSTEM_INSTRUCTION_BASE, type PromptVersion } from '../../benchmark/generation-faithfulness/prompts';
import { assembleScenarioContext } from '../../benchmark/generation-faithfulness/harness';
import { formatSlices } from '../../benchmark/generation-faithfulness/adversarial';

/**
 * ============================================================================
 * M5.4 — SCENARIO CONTEXT CONTRACT SUITE (offline; NO model calls)
 * ============================================================================
 * Pins the ASSEMBLE phase for every scenario: the REAL (deterministic)
 * assembly over the seeded frozen universe produces the context each design
 * scenario specifies, byte-deterministically. Phase 2 (generation) is never
 * invoked here — a quota window can never fail this suite.
 *
 *   C1    fixture digest is the frozen digest
 *   C2    intent routing: S3/S5 history, S4 current, S6/S9 dependency
 *   C3..  per-scenario context contracts (S1..S10b) — expected slices,
 *         labels, authorities, evidence keys, values, and absences
 *   CD1   byte-determinism of assembly (two consecutive runs identical)
 *   CD2   prompt determinism (every version): stable digests; S9 carries
 *         the citation instruction
 *   CD3   prompt/2 = prompt/1 + the ONE general relationship clause only;
 *         the added text is fixture-free and scenario-free (the remediation
 *         experiment's control pin — see M5_4_PROMPT2_REMEDIATION.md)
 *   AD1   S10a degraded context differs from the real one ONLY by the two
 *         documented injected slices (all real slices preserved verbatim)
 *   AD2   S10b degraded context differs from the real one ONLY by the one
 *         appended stale line inside the CANONICAL_FACT slice
 *
 * ISOLATION: dedicated scratch directory (chdir before any store singleton
 * constructs — the M5.1 CLI contract).
 */

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
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

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const FROZEN_FIXTURE_DIGEST = '40e53f1581def28371af8f050bc5ba85eaf58a47cbb86a4f449fad1beef719fb';

async function main(): Promise<void> {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-m54-contracts-'));
  process.chdir(scratch);
  resetDurableState();
  const seed: SeedResult = await seedBenchmarkUniverse();

  const contexts = new Map<string, Awaited<ReturnType<typeof assembleScenarioContext>>>();
  for (const spec of SCENARIO_BATTERY) {
    contexts.set(spec.scenarioId, await assembleScenarioContext(spec, seed));
  }

  console.log('\n======================================================');
  console.log('M5.4 SCENARIO CONTEXT CONTRACT SUITE — offline, no model calls');
  console.log('======================================================\n');

  await runTest('C1: fixture digest is the frozen M5.1/M5.2/M5.3 digest', () => {
    assert.strictEqual(computeFixtureDigest(), FROZEN_FIXTURE_DIGEST);
  });

  await runTest('C2: intent routing — S3/S5 history, S4 current, S6/S9 dependency, S7b current', () => {
    const byId = new Map(SCENARIO_BATTERY.map((s) => [s.scenarioId, s]));
    assert.strictEqual(detectTemporalIntent(byId.get('S3')!.question).intent, 'history', 'S3 must route history (SUPERSEDED_FACT renders)');
    assert.strictEqual(detectTemporalIntent(byId.get('S5')!.question).intent, 'history', 'S5 must route history');
    assert.strictEqual(detectTemporalIntent(byId.get('S4')!.question).intent, 'current', 'S4 must route current (4A2 must NOT render)');
    assert.strictEqual(detectTemporalIntent(byId.get('S7b')!.question).intent, 'current');
    assert.ok(detectDependencyIntent(byId.get('S6')!.question).intent, 'S6 must fire dependency intent');
    assert.ok(detectDependencyIntent(byId.get('S9')!.question).intent, 'S9 must fire dependency intent');
    assert.ok(!detectDependencyIntent(byId.get('S1')!.question).intent, 'S1 must NOT fire dependency intent');
  });

  await runTest('C3: S1 context — 4A carries FACT-CUR-01 ($49) under CANONICAL_FACT authority', () => {
    const ctx = contexts.get('S1')!;
    const slice4A = ctx.slices.find((s) => s.label === 'Canonical Verified Facts' && s.authority === 'CANONICAL_FACT');
    assert.ok(slice4A, '4A slice present');
    assert.ok(slice4A.content.includes('[FACT-fact-lumora-price-49]'), 'FACT-CUR-01 key present');
    assert.ok(slice4A.content.includes('$49'), '$49 present');
  });

  await runTest('C4: S2 context — NRR absent everywhere; MRR/burn financials present', () => {
    const ctx = contexts.get('S2')!;
    assert.ok(!/\bnrr\b|net revenue retention/i.test(ctx.formattedContext), 'NRR must be absent');
    assert.ok(!/\bretention rate\b/i.test(ctx.formattedContext));
    assert.ok(ctx.formattedContext.includes('MRR'), 'financials render');
  });

  await runTest('C5: S3 context — SUPERSEDED_FACT slice (4A2) renders FACT-OLD-01 AND 4A renders FACT-CUR-01', () => {
    const ctx = contexts.get('S3')!;
    const hist = ctx.slices.find((s) => s.authority === 'SUPERSEDED_FACT');
    assert.ok(hist, '4A2 slice present (history intent)');
    assert.ok(hist.content.includes('[FACT-fact-lumora-price-29]'), 'FACT-OLD-01 present with historical framing');
    assert.ok(hist.content.includes('NOT currently true'), 'historical framing present');
    const cur = ctx.slices.find((s) => s.label === 'Canonical Verified Facts');
    assert.ok(cur?.content.includes('[FACT-fact-lumora-price-49]'), 'FACT-CUR-01 also present');
  });

  await runTest('C6: S4 context — 4A only; the superseded $29 fact does NOT render (superseded → ineligible)', () => {
    const ctx = contexts.get('S4')!;
    assert.ok(!ctx.slices.some((s) => s.authority === 'SUPERSEDED_FACT'), 'no 4A2 (current intent)');
    const cur = ctx.slices.find((s) => s.label === 'Canonical Verified Facts');
    assert.ok(cur, '4A slice present');
    assert.ok(cur.content.includes('[FACT-fact-lumora-price-49]'), 'current fact present');
    assert.ok(!cur.content.includes('[FACT-fact-lumora-price-29]'), 'superseded fact absent from the truth-bearing slice');
  });

  await runTest('C7: S5 context — both facts with their dates (2026-06-15 and 2026-09-10 visible)', () => {
    const ctx = contexts.get('S5')!;
    const hist = ctx.slices.find((s) => s.authority === 'SUPERSEDED_FACT');
    assert.ok(hist, 'history projection renders');
    assert.ok(hist.content.includes('2026-06-15'), 'old fact promotion date visible');
    const cur = ctx.slices.find((s) => s.label === 'Canonical Verified Facts');
    assert.ok(cur?.content.includes('2026-09-10'), 'successor verification date visible');
  });

  await runTest('C8: S6 context — DEPENDENCY_PATH slice (4A3) with both provenance-cited edges', () => {
    const ctx = contexts.get('S6')!;
    const dep = ctx.slices.find((s) => s.label === 'Service Dependency Chain (Canonical Facts)');
    assert.ok(dep, '4A3 slice present');
    assert.ok(dep.content.includes('Aurorium Auth Service DEPENDS_ON Helix Identity Store'));
    assert.ok(dep.content.includes('Nimbus Gateway DEPENDS_ON Aurorium Auth Service'));
    assert.ok(dep.content.includes('(from [FACT-fact-auth-helix-dependency])'), 'edges cite their facts');
    assert.ok(dep.content.includes('(from [FACT-fact-nimbus-auth-dependency])'));
    assert.ok(dep.content.includes('[FACT-fact-auth-helix-dependency]'), 'fact lines render');
    assert.ok(dep.content.includes('[FACT-fact-nimbus-auth-dependency]'));
  });

  await runTest('C9: S7a context — burn 34000 under AUTHORITATIVE_OPERATIONAL_STATE + FACT-FIN-01', () => {
    const ctx = contexts.get('S7a')!;
    const ops = ctx.slices.find((s) => s.authority === 'AUTHORITATIVE_OPERATIONAL_STATE');
    assert.ok(ops, 'operational state slice present');
    assert.ok(ops.content.includes('$34,000'), 'burn 34000 present');
    const facts = ctx.slices.filter((s) => s.authority === 'CANONICAL_FACT');
    assert.ok(facts.some((s) => s.content.includes('[FACT-fact-burn-runway]')), 'FACT-FIN-01 present');
  });

  await runTest('C10: S7b context — PERSONAL_MIND container has PM-06 (dashboard), NOT PM-05 (email)', () => {
    const ctx = contexts.get('S7b')!;
    const personal = ctx.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    assert.ok(personal, 'personal mind container present');
    assert.ok(personal.content.includes('shared dashboard'), 'PM-06 (current) present');
    assert.ok(!personal.content.includes('sent by email'), 'PM-05 (superseded) must not render');
    assert.ok(!personal.content.toLowerCase().includes('pending_review'), 'no pending memories');
  });

  await runTest('C11: S8 context — churn absent from the entire fixture universe', () => {
    const ctx = contexts.get('S8')!;
    assert.ok(!/\bchurn/i.test(ctx.formattedContext), 'churn must be absent');
  });

  await runTest('C12: S9 context — same dependency evidence as S6 + citable keys present', () => {
    const ctx = contexts.get('S9')!;
    const dep = ctx.slices.find((s) => s.label === 'Service Dependency Chain (Canonical Facts)');
    assert.ok(dep, '4A3 slice present');
    assert.ok(dep.content.includes('(from [FACT-fact-auth-helix-dependency])'));
    assert.ok(dep.content.includes('(from [FACT-fact-nimbus-auth-dependency])'));
  });

  await runTest('C13: S10a context — real slices preserved; exactly the two documented injections added', () => {
    const degraded = contexts.get('S10a')!;
    // The real S10a assembly (same question, real mode = the S1 assembly):
    const real = contexts.get('S1')!;
    // Every real slice must appear VERBATIM in the degraded context:
    for (const realSlice of real.slices) {
      const stillPresent = degraded.slices.some(
        (s) => s.label === realSlice.label && s.authority === realSlice.authority && s.content === realSlice.content
      );
      assert.ok(stillPresent, `real slice "${realSlice.label}" must be preserved verbatim`);
    }
    // The degraded slice list = real slices + exactly 2 injections:
    assert.strictEqual(degraded.slices.length, real.slices.length + degraded.injected.length);
    assert.strictEqual(degraded.injected.length, 2, 'dependency slice + personal slice injected');
    assert.ok(degraded.slices.some((s) => s.label === 'Service Dependency Chain (Canonical Facts)'), 'dependency slice injected');
    assert.ok(degraded.slices.some((s) => s.authority === 'PERSONAL_MIND_MEMORY'), 'personal slice injected');
    // Prominence: the dependency slice sits at position 2 (right after operational state):
    assert.strictEqual(degraded.slices[1].label, 'Service Dependency Chain (Canonical Facts)');
  });

  await runTest('C14: S10b context — differs from the real one ONLY by the stale line inside the CANONICAL_FACT slice', () => {
    const degraded = contexts.get('S10b')!;
    const real = contexts.get('S1')!;
    assert.strictEqual(degraded.injected.length, 1);
    // same slice count, same labels/authorities in order:
    assert.deepStrictEqual(
      degraded.slices.map((s) => [s.label, s.authority]),
      real.slices.map((s) => [s.label, s.authority])
    );
    // every non-canonical slice byte-identical:
    for (let i = 0; i < real.slices.length; i++) {
      if (real.slices[i].label !== 'Canonical Verified Facts') {
        assert.strictEqual(degraded.slices[i].content, real.slices[i].content, `slice ${i} unchanged`);
      }
    }
    const real4A = real.slices.find((s) => s.label === 'Canonical Verified Facts')!;
    const degraded4A = degraded.slices.find((s) => s.label === 'Canonical Verified Facts')!;
    // exactly ONE line added, without historical framing, dates visible:
    const addedLines = degraded4A.content.split('\n').filter((l) => !real4A.content.split('\n').includes(l));
    assert.strictEqual(addedLines.length, 1, `exactly one line added: ${JSON.stringify(addedLines)}`);
    assert.ok(addedLines[0].includes('[FACT-fact-lumora-price-29]'), 'stale line carries the superseded fact id');
    assert.ok(addedLines[0].includes('2026-06-15'), 'dates still visible');
    assert.ok(!addedLines[0].toLowerCase().includes('superseded'), 'no historical framing in the injected line');
    // the real $49 record is still there:
    assert.ok(degraded4A.content.includes('[FACT-fact-lumora-price-49]'));
  });

  await runTest('CD1: assembly byte-determinism — two consecutive assemblies are identical (all scenarios)', async () => {
    for (const spec of SCENARIO_BATTERY) {
      const first = contexts.get(spec.scenarioId)!;
      const second = await assembleScenarioContext(spec, seed);
      assert.strictEqual(second.formattedContext, first.formattedContext, `${spec.scenarioId} context must be byte-identical`);
      assert.strictEqual(second.contextDigest, first.contextDigest);
    }
  });

  await runTest('CD2: prompt determinism — every version: digests stable; S9 (and only S9) carries the citation instruction', () => {
    for (const version of Object.keys(PROMPT_VERSIONS) as PromptVersion[]) {
      for (const spec of SCENARIO_BATTERY) {
        const ctx = contexts.get(spec.scenarioId)!;
        const p1 = buildPrompt(spec, ctx.formattedContext, version);
        const p2 = buildPrompt(spec, ctx.formattedContext, version);
        assert.strictEqual(p1.promptDigest, p2.promptDigest, `${spec.scenarioId} ${version} digest must be stable`);
        assert.strictEqual(p1.promptVersion, version);
        assert.strictEqual(p1.user.includes(ctx.formattedContext), true, 'context embedded verbatim');
        const hasCitation = p1.system.includes('cite the evidence record');
        assert.strictEqual(hasCitation, spec.requireCitations, `${spec.scenarioId} ${version} citation instruction flag`);
      }
    }
    // authority labels are embedded verbatim (any version):
    const s1 = buildPrompt(SCENARIO_BATTERY[0], contexts.get('S1')!.formattedContext);
    assert.ok(s1.user.includes('=== [CANONICAL_FACT] CANONICAL VERIFIED FACTS ==='), 'authority labels embedded');
  });

  await runTest('CD3: prompt/2 = prompt/1 + the ONE general relationship clause; added text is fixture-free and scenario-free', () => {
    const s6 = SCENARIO_BATTERY.find((s) => s.scenarioId === 'S6')!;
    const s9 = SCENARIO_BATTERY.find((s) => s.scenarioId === 'S9')!;
    const ctx6 = contexts.get('S6')!.formattedContext;
    const ctx9 = contexts.get('S9')!.formattedContext;

    const p1n = buildPrompt(s6, ctx6, 'prompt/1'); // non-citation variant
    const p2n = buildPrompt(s6, ctx6, 'prompt/2');
    const p1c = buildPrompt(s9, ctx9, 'prompt/1'); // citation variant (S9)
    const p2c = buildPrompt(s9, ctx9, 'prompt/2');

    // The systems are EXACTLY the documented composites (no other edits):
    assert.strictEqual(p1n.system, SYSTEM_INSTRUCTION_BASE, 'prompt/1 non-citation system');
    assert.strictEqual(p2n.system, `${SYSTEM_INSTRUCTION_BASE}\n${RELATIONSHIP_INSTRUCTION}`, 'prompt/2 non-citation system = base + relationship clause');
    assert.strictEqual(p1c.system, `${SYSTEM_INSTRUCTION_BASE}\n${CITATION_INSTRUCTION}`, 'prompt/1 citation system');
    assert.strictEqual(
      p2c.system,
      `${SYSTEM_INSTRUCTION_BASE}\n${RELATIONSHIP_INSTRUCTION}\n${CITATION_INSTRUCTION_V2}`,
      'prompt/2 citation system = base + relationship clause + renumbered citation clause'
    );
    // The citation contract CONTENT is unchanged — only the clause number moved:
    assert.strictEqual(CITATION_INSTRUCTION_V2, CITATION_INSTRUCTION.replace(/^5\./, '6.'));
    // The user message is IDENTICAL across versions (only the system instruction changed):
    assert.strictEqual(p1n.user, p2n.user, 'user message identical across versions (non-citation)');
    assert.strictEqual(p1c.user, p2c.user, 'user message identical across versions (citation)');
    // The versions must be distinguishable (a real prompt change, recorded as one):
    assert.notStrictEqual(p1n.promptDigest, p2n.promptDigest);
    assert.notStrictEqual(p1c.promptDigest, p2c.promptDigest);

    // GENERality of the added clause: no fixture entity, no scenario id, no
    // figures, no dependency path, no chain-of-thought demand:
    const added = RELATIONSHIP_INSTRUCTION.toLowerCase();
    for (const forbidden of [
      'helix', 'nimbus', 'aurorium', 'lumora', 'gateway', 'identity', 'auth',
      'samjuniors', 'sophia', 's6', 's9', 'starter', 'pricing', 'burn',
    ]) {
      assert.ok(!added.includes(forbidden), `prompt/2 added clause must not mention "${forbidden}"`);
    }
    assert.ok(!/\d/.test(RELATIONSHIP_INSTRUCTION.replace(/^5\./, '')), 'no figures in the added clause');
    for (const required of ['transitiv', 'direct', 'complete or exhaustive', 'dependencies']) {
      assert.ok(added.includes(required), `prompt/2 added clause must instruct on "${required}"`);
    }
    assert.ok(
      !/chain[- ]of[- ]thought|step[- ]by[- ]step|show your reasoning|think through/i.test(p2n.system),
      'prompt/2 must not demand chain-of-thought revelation'
    );
    // prompt/1 remains byte-identical (the baseline is a control variable): a
    // full rebuild-vs-archive byte pin lives in the regrade suite (R5).
  });

  await runTest('AD1: formatSlices reproduces the production formattedContext shape for a real assembly', () => {
    const real = contexts.get('S1')!;
    // Re-formatting the (unmodified) real slice list must reproduce the real
    // formatted context byte-for-byte — proving adversarial re-rendering does
    // not alter the block format.
    assert.strictEqual(formatSlices(real.slices), real.formattedContext);
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log('\n==================================================');
  console.log(`M5.4 SCENARIO CONTRACT SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');
  if (failed > 0) process.exit(1);
}

void main().catch((err) => {
  console.error(`M5.4 CONTRACT SUITE HARNESS ERROR: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
