import assert from 'assert';
import {
  BENCHMARK_QUERIES,
} from '../../benchmark/memory-retrieval/queries';
import {
  ALL_EVIDENCE_KEYS,
  PERSONAL_MEMORIES,
  COMPANY_KNOWLEDGE,
  COMPANY_MEMORIES,
  CANONICAL_FACTS,
  EPISTEMIC_CLAIMS,
  STATE_INITIATIVES,
  STATE_DECISIONS,
  EPISODIC_CONVERSATION,
  FOUNDER_A,
  FOUNDER_B,
  computeFixtureDigest,
} from '../../benchmark/memory-retrieval/fixture';
import { buildEvidenceRegistry } from '../../benchmark/memory-retrieval/harness';
import { recallAtK, precisionAtK, mrr, computeUnionRecall } from '../../benchmark/memory-retrieval/metrics';
import { classifyGoldMiss, classifyForbiddenHit, type EvidenceTextProvider } from '../../benchmark/memory-retrieval/classify';
import { extractTokens } from '../../src/lib/server/knowledge/knowledge-store';
import { foldPersonalMindToken } from '../../src/lib/server/sophia/context-assembly';
import type { BenchmarkQuery, BenchmarkRunResult } from '../../benchmark/memory-retrieval/types';

/**
 * ============================================================================
 * M5.1 — BENCHMARK SELF-TEST SUITE
 * ============================================================================
 * Tests the BENCHMARK, not the architecture: fixture integrity, gold-set
 * sanity, metric math (hand-computed), classification rules, and the
 * determinism + wiring of the full CLI run (spawned twice, byte-compared).
 *
 *   F1..F12  fixture integrity (gold resolvable, no gold∩forbidden,
 *             contradiction, multi-hop bridgelessness, lifecycle coverage,
 *             founder pair, paraphrase-zero-overlap, lexical traps, window
 *             consistency, selection-determinism preconditions, fingerprint
 *             uniqueness, registry completeness)
 *   M1..M5   metric math on hand-computed cases
 *   CL1..CL7 classification rules (J/D/F/H gaps, graph-candidate criterion,
 *             authority-only forbidden semantics)
 *   D1..D6   full-run determinism and wiring (byte-identical JSON across two
 *             fresh processes; pinned known-good and known-bad outcomes; zero
 *             authority/lifecycle failures in the run)
 *
 * M5.2 NOTE: D4's known-bad pins describe the post-M5.2 measured state
 * (BQ1a/BQ2/BQ6 gaps closed; the BQ3a 2-hop graph candidate remains). The
 * A0 pins live on in the committed results/baseline-a0.json evidence and the
 * M5.1/M5.2 documents; the gold sets this suite reads are byte-identical
 * to A0.
 *
 * M5.3 NOTE: the BQ3a 2-hop miss is now CLOSED by the M5.3-C bounded
 * DEPENDS_ON traversal (derived relational index over canonical facts — no
 * graph database). D4 therefore pins the ZERO-failure state; the one-failure
 * state it measured at a349205 lives on in results/run-a1.json and the
 * M5.1/M5.2/M5.3 documents. Gold sets remain byte-identical to A0.
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

/** All fixture texts, used by the bridgelessness checks. */
function allFixtureTexts(): string[] {
  return [
    ...PERSONAL_MEMORIES.map((m) => m.content),
    ...COMPANY_KNOWLEDGE.map((k) => `${k.title} ${k.summary} ${k.content} ${k.tags.join(' ')}`),
    ...COMPANY_MEMORIES.map((m) => `${m.approvedAction} ${m.executionOutcome} ${m.evidenceReferences.join(' ')}`),
    ...CANONICAL_FACTS.map((f) => `${f.statement} ${f.subject}`),
    ...EPISTEMIC_CLAIMS.map((c) => `${c.statement} ${c.subject}`),
    ...STATE_INITIATIVES.map((i) => `${i.title} ${i.currentObjective} ${i.latestResult}`),
    ...STATE_DECISIONS.map((d) => `${d.title} ${d.recommendation} ${d.evidenceSummary}`),
    ...EPISODIC_CONVERSATION.messages.map((m) => m.content),
  ];
}

async function spawnBenchmarkJson(): Promise<string> {
  // @ts-ignore — Bun global exists when the suite runs under bun
  const proc = Bun.spawn(['bun', 'run', 'benchmark/memory-retrieval/run.ts', '--json'], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  const errText = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`benchmark CLI exited ${code}; stderr: ${errText.slice(0, 800)}`);
  }
  return out;
}

async function main(): Promise<void> {
  console.log('\n==================================================');
  console.log('M5.1 BENCHMARK SELF-TEST SUITE');
  console.log('==================================================\n');

  // =========================================================================
  // F — FIXTURE INTEGRITY
  // =========================================================================

  await runTest('F1: every gold and forbidden evidence key resolves to fixture evidence', () => {
    const known = new Set(ALL_EVIDENCE_KEYS);
    for (const query of BENCHMARK_QUERIES) {
      for (const pointer of [...query.expected, ...query.forbidden]) {
        for (const key of pointer.evidenceKeys) {
          assert.ok(known.has(key), `${query.queryId}: unknown evidence key "${key}"`);
        }
      }
    }
  });

  await runTest('F2: no evidence key is both gold and forbidden for the same query', () => {
    for (const query of BENCHMARK_QUERIES) {
      const gold = new Set(query.expected.flatMap((p) => p.evidenceKeys));
      for (const pointer of query.forbidden) {
        for (const key of pointer.evidenceKeys) {
          assert.ok(!gold.has(key), `${query.queryId}: "${key}" is both gold and forbidden`);
        }
      }
    }
  });

  await runTest('F3: a real contradiction exists (old vs new pricing facts, email vs dashboard preference)', () => {
    const oldFact = CANONICAL_FACTS.find((f) => f.evidenceKey === 'FACT-OLD-01')!;
    const newFact = CANONICAL_FACTS.find((f) => f.evidenceKey === 'FACT-CUR-01')!;
    assert.ok(oldFact.statement.includes('$29'), 'old fact carries the $29 price');
    assert.ok(newFact.statement.includes('$49'), 'new fact carries the $49 price');
    assert.strictEqual(oldFact.validityState, 'active', 'old fact seeded active (superseded via store machinery)');
    assert.strictEqual(oldFact.supersededById, newFact.id, 'supersession pointer to the successor');
    const pm05 = PERSONAL_MEMORIES.find((m) => m.evidenceKey === 'PM-05')!;
    const pm06 = PERSONAL_MEMORIES.find((m) => m.evidenceKey === 'PM-06')!;
    assert.ok(pm05.content.includes('email'), 'PM-05 is the email preference');
    assert.ok(pm06.content.includes('dashboard'), 'PM-06 is the dashboard preference');
    assert.strictEqual(pm05.transition?.to, 'SUPERSEDED', 'PM-05 is superseded');
    assert.strictEqual(pm05.transition?.successorKey, 'PM-06', 'supersession successor is PM-06');
  });

  await runTest('F4: multi-hop chain exists and NO fixture record lexically bridges Nimbus↔Helix Identity Store', () => {
    // The chain: Nimbus Gateway → Aurorium Auth Service → Helix Identity Store.
    const dep01 = CANONICAL_FACTS.find((f) => f.evidenceKey === 'FACT-DEP-01')!;
    const dep02 = CANONICAL_FACTS.find((f) => f.evidenceKey === 'FACT-DEP-02')!;
    assert.ok(dep01.statement.includes('Nimbus Gateway') && dep01.statement.includes('Aurorium Auth Service'));
    assert.ok(dep02.statement.includes('Aurorium Auth Service') && dep02.statement.includes('Helix Identity Store'));
    for (const text of allFixtureTexts()) {
      const hasNimbus = text.includes('Nimbus Gateway') || text.includes('nimbus');
      const hasHelix = text.includes('Helix Identity Store') || text.includes('identity store');
      assert.ok(
        !(hasNimbus && hasHelix),
        `lexically bridging record found (would invalidate the graph-candidate design): "${text.slice(0, 90)}"`
      );
    }
  });

  await runTest('F5: all five lifecycle states are present in the personal fixture', () => {
    const states = new Set(PERSONAL_MEMORIES.map((m) => {
      if (m.transition) return m.transition.to;
      return m.birthState;
    }));
    for (const state of ['ACTIVE', 'PENDING_REVIEW', 'SUPERSEDED', 'ARCHIVED', 'REJECTED'] as const) {
      assert.ok(states.has(state), `lifecycle state ${state} missing from fixture`);
    }
  });

  await runTest('F6: two founders exist and founder-B records are distinct people-scoped data', () => {
    assert.ok(FOUNDER_A.length > 0 && FOUNDER_B.length > 0 && FOUNDER_A !== (FOUNDER_B as string));
    const bRecords = PERSONAL_MEMORIES.filter((m) => m.founderId === FOUNDER_B);
    assert.strictEqual(bRecords.length, 2, 'founder B has two records');
    assert.ok(PERSONAL_MEMORIES.some((m) => m.founderId === FOUNDER_A));
  });

  await runTest('F7: the paraphrase gold (PM-10) has ZERO folded-token overlap with the work-style queries', () => {
    const pm10 = PERSONAL_MEMORIES.find((m) => m.evidenceKey === 'PM-10')!;
    const contentTokens = new Set(extractTokens(pm10.content).map(foldPersonalMindToken));
    for (const q of BENCHMARK_QUERIES.filter((x) => x.category === 'PERSONAL_MEMORY')) {
      const queryTokens = extractTokens(q.queryText).map(foldPersonalMindToken);
      const overlap = queryTokens.filter((t) => contentTokens.has(t));
      assert.strictEqual(overlap.length, 0, `${q.queryId} overlaps PM-10 via ${overlap.join(',')}`);
    }
  });

  await runTest('F8: lexical traps exist (support "tiers" doc; personal Lumora pricing note)', () => {
    const support = COMPANY_KNOWLEDGE.find((k) => k.documentId === 'SOP-LUMORA-SUPPORT')!;
    assert.ok(support.tags.includes('tiers') && support.tags.includes('lumora'));
    const pm09 = PERSONAL_MEMORIES.find((m) => m.evidenceKey === 'PM-09')!;
    assert.ok(pm09.content.includes('Lumora pricing'), 'PM-09 carries the personal Lumora-pricing trap');
  });

  await runTest('F9: CHANGE_DETECTION window dates are consistent (gold inside, forbidden outside)', () => {
    const bq2 = BENCHMARK_QUERIES.find((q) => q.queryId === 'BQ2')!;
    const from = new Date(bq2.temporal!.windowFrom!).getTime();
    const to = new Date(bq2.temporal!.windowTo!).getTime();
    const dateOf = (key: string): number => {
      const prec = COMPANY_MEMORIES.find((m) => m.id === key);
      if (prec) return new Date(prec.timestamp).getTime();
      const dec = STATE_DECISIONS.find((d) => `STATE-${d.id}` === key);
      if (dec) return new Date(dec.date).getTime();
      const know = COMPANY_KNOWLEDGE.find((k) => k.documentId === key);
      if (know) return new Date(know.lastVerifiedDate).getTime();
      const fact = CANONICAL_FACTS.find((f) => f.evidenceKey === key);
      if (fact) {
        // A fact with a supersession pointer changes when its SUCCESSOR is
        // promoted (the fixture seeds it active; markFactSuperseded flips it
        // at seed time, so the pointer — not validityState — carries this).
        if (fact.supersededById) {
          const successor = CANONICAL_FACTS.find((f) => f.id === fact.supersededById)!;
          return new Date(successor.promotedAt).getTime();
        }
        return new Date(fact.promotedAt).getTime();
      }
      throw new Error(`no date for ${key}`);
    };
    for (const pointer of bq2.expected) {
      for (const key of pointer.evidenceKeys) {
        const t = dateOf(key);
        assert.ok(t >= from && t <= to, `gold ${key} is OUTSIDE the declared window`);
      }
    }
    for (const pointer of bq2.forbidden) {
      for (const key of pointer.evidenceKeys) {
        if (key.startsWith('CLAIM-')) {
          // Pending claims are excluded as changes on EPISTEMIC grounds, not
          // window grounds — assert they really are pending.
          const claim = EPISTEMIC_CLAIMS.find((c) => c.id === key)!;
          assert.strictEqual(claim.verificationStatus, 'pending', `${key} must be a pending claim`);
          continue;
        }
        const t = dateOf(key);
        assert.ok(t < from || t > to, `forbidden ${key} is INSIDE the window (fixture bug)`);
      }
    }
  });

  await runTest('F10: selection-determinism precondition — ACTIVE memories per (founder, type) have distinct confidences', () => {
    for (const founder of [FOUNDER_A, FOUNDER_B]) {
      const byType = new Map<string, number[]>();
      for (const m of PERSONAL_MEMORIES.filter(
        (x) => x.founderId === founder && !x.transition && x.birthState === 'ACTIVE'
      )) {
        byType.set(m.memoryType, [...(byType.get(m.memoryType) ?? []), m.confidence]);
      }
      for (const [type, confidences] of byType) {
        assert.strictEqual(
          new Set(confidences).size,
          confidences.length,
          `founder ${founder} type ${type} has duplicate confidences (${confidences}) — wall-clock updatedAt ties would become nondeterministic`
        );
      }
    }
  });

  await runTest('F11: every render fingerprint in the evidence registry is globally unique', () => {
    const registry = buildEvidenceRegistry({
      personalIdByKey: new Map(PERSONAL_MEMORIES.map((m) => [m.evidenceKey, `id-${m.evidenceKey}`])),
      founderA: FOUNDER_A,
      founderB: FOUNDER_B,
    });
    const all: string[] = [];
    for (const entry of registry.values()) all.push(...entry.renderFingerprints);
    assert.strictEqual(new Set(all).size, all.length, 'duplicate render fingerprints would misattribute renders');
    // SRC-* are provenance-only records no retrieval surface can return;
    // everything else in the fixture universe must be registry-covered.
    const expected = ALL_EVIDENCE_KEYS.filter((k) => !k.startsWith('SRC-'));
    for (const key of expected) {
      assert.ok(registry.has(key), `registry missing retrievable evidence key ${key}`);
    }
  });

  await runTest('F12: fixture digest is stable across computations (pure SHA-256, no clock)', () => {
    assert.strictEqual(computeFixtureDigest(), computeFixtureDigest());
    assert.match(computeFixtureDigest(), /^[0-9a-f]{64}$/);
  });

  // =========================================================================
  // M — METRIC MATH (hand-computed)
  // =========================================================================

  await runTest('M1: recallAtK hand cases', () => {
    assert.strictEqual(recallAtK(['a', 'b', 'c'], ['a', 'd'], 2), 1 / 2);
    assert.strictEqual(recallAtK(['a', 'b', 'c'], ['a', 'd'], 3), 1 / 2);
    assert.strictEqual(recallAtK(['a', 'b', 'c'], ['z'], 3), 0);
    assert.strictEqual(recallAtK(['a'], [], 3), 0, 'empty gold is 0 by contract, not NaN');
  });

  await runTest('M2: precisionAtK hand cases', () => {
    assert.strictEqual(precisionAtK(['a', 'x', 'y'], ['a'], 2), 1 / 2);
    assert.strictEqual(precisionAtK(['a', 'b'], ['a', 'b'], 2), 1);
    assert.strictEqual(precisionAtK([], ['a'], 3), 0, 'empty retrieval is 0 by contract');
  });

  await runTest('M3: mrr hand cases', () => {
    assert.strictEqual(mrr(['x', 'a'], ['a']), 1 / 2);
    assert.strictEqual(mrr(['a'], ['a']), 1);
    assert.strictEqual(mrr(['x', 'y'], ['a']), null, 'no gold retrieved → null');
  });

  await runTest('M4: computeUnionRecall hand case across surfaces', () => {
    const surfaces = [
      { surface: 'company_knowledge' as const, effectiveK: 2, retrieved: [{ evidenceKey: 'K1', rank: 1, score: 1 }, { evidenceKey: 'K9', rank: 2, score: 1 }] },
      { surface: 'canonical_facts' as const, effectiveK: 3, retrieved: [{ evidenceKey: 'F1', rank: 1, score: null }, { evidenceKey: 'F2', rank: 4, score: null }] },
    ];
    const gold = { company_knowledge: ['K1'], canonical_facts: ['F2'] } as any;
    // F2 is at rank 4 > effectiveK 3 → not counted. Union = 1/2.
    assert.strictEqual(computeUnionRecall(surfaces as any, gold), 1 / 2);
  });

  await runTest('M5: metrics reject nothing silently — boundary values are finite', () => {
    assert.ok(Number.isFinite(recallAtK(['a'], ['a'], 1)));
    assert.ok(Number.isFinite(precisionAtK(['a'], ['a'], 1)));
  });

  // =========================================================================
  // CL — CLASSIFICATION RULES
  // =========================================================================

  const fakeGetText = (key: string): ReturnType<EvidenceTextProvider> => {
    const texts: Record<string, { surface: any; text: string; lifecycle: any }> = {
      'PM-10': { surface: 'personal_mind', text: 'Keeps replies tight and terse when tired in the evening.', lifecycle: 'active' },
      'FACT-OLD-01': { surface: 'canonical_facts', text: 'Lumora Starter tier is priced at $29 per seat per month under cost-plus pricing lumora_pricing', lifecycle: 'superseded' },
      'FACT-DEP-01': { surface: 'canonical_facts', text: 'Nimbus Gateway depends on the Aurorium Auth Service for token verification service_dependencies', lifecycle: 'active' },
      'CONV-EP-01': { surface: 'episodic_conversation', text: 'The refactor is dragging. Measured: the microservices refactor of Aurorium adds about three hours of coordination overhead per release.', lifecycle: 'n/a' },
    };
    const found = texts[key];
    if (!found) throw new Error(`fake provider: unknown ${key}`);
    return found;
  };

  await runTest('CL1: episodic-surface miss classifies J_other (missing surface dominates)', () => {
    const query = BENCHMARK_QUERIES.find((q) => q.queryId === 'BQ6a')!;
    const failure = classifyGoldMiss(query, 'episodic_conversation', 'CONV-EP-01', 'GOLD_NOT_RETRIEVED', {
      getText: fakeGetText,
      rendered: false,
    });
    assert.strictEqual(failure.primaryGap, 'J_other');
    assert.strictEqual(failure.failureClass, 'RETRIEVAL');
    assert.strictEqual(failure.graphCandidate, false);
  });

  await runTest('CL2: superseded gold on a history query classifies D_temporal_filtering', () => {
    const query = BENCHMARK_QUERIES.find((q) => q.queryId === 'BQ1a')!;
    const failure = classifyGoldMiss(query, 'canonical_facts', 'FACT-OLD-01', 'GOLD_NOT_RETRIEVED', {
      getText: fakeGetText,
      rendered: false,
    });
    assert.strictEqual(failure.primaryGap, 'D_temporal_filtering');
    assert.ok(failure.gapTags.includes('D_temporal_filtering'));
  });

  await runTest('CL3: declared depth-2 zero-overlap miss classifies F_graph_traversal AND is a graph candidate', () => {
    const query = BENCHMARK_QUERIES.find((q) => q.queryId === 'BQ3a')!;
    const failure = classifyGoldMiss(query, 'canonical_facts', 'FACT-DEP-01', 'GOLD_BEYOND_EFFECTIVE_K', {
      getText: fakeGetText,
      rendered: false,
    });
    assert.ok(failure.gapTags.includes('F_graph_traversal'));
    assert.strictEqual(failure.graphCandidate, true, 'depth-2 + zero overlap + retrieval class = graph candidate');
  });

  await runTest('CL4: a depth-1 relationship miss is NOT a graph candidate (no traversal required)', () => {
    const query = BENCHMARK_QUERIES.find((q) => q.queryId === 'BQ3b')!;
    const failure = classifyGoldMiss(query, 'company_state', 'STATE-dec-pricing-value-based', 'GOLD_NOT_RETRIEVED', {
      getText: (key) => ({
        surface: 'company_state',
        text: 'Adopt value-based pricing company-wide Move all Lumora tiers to value-based pricing Pricing experiment 12 and the July financial model 2026-09-02',
        lifecycle: 'n/a',
      }),
      rendered: false,
    });
    assert.strictEqual(failure.graphCandidate, false);
    assert.strictEqual(failure.primaryGap, 'C_structured_filtering');
  });

  await runTest('CL5: authorityOnly-forbidden under an advisory label is LEGAL (null)', () => {
    const query = BENCHMARK_QUERIES.find((q) => q.queryId === 'BQ8')!;
    const pointer = query.forbidden.find((f) => f.evidenceKeys.includes('PM-11'))!;
    const record = classifyForbiddenHit(query, pointer, 'PM-11', {
      retrieved: true,
      renderedUnder: ['PERSONAL_MIND_MEMORY'],
    });
    assert.strictEqual(record, null, 'advisory rendering of personal content is by-design behavior');
  });

  await runTest('CL6: authorityOnly-forbidden under a truth-bearing authority IS a violation', () => {
    const query = BENCHMARK_QUERIES.find((q) => q.queryId === 'BQ8')!;
    const pointer = query.forbidden.find((f) => f.evidenceKeys.includes('PM-11'))!;
    const record = classifyForbiddenHit(query, pointer, 'PM-11', {
      retrieved: true,
      renderedUnder: ['CANONICAL_FACT'],
    });
    assert.ok(record, 'personal evidence under CANONICAL_FACT must fail');
    assert.strictEqual(record!.kind, 'FORBIDDEN_AS_AUTHORITY');
    assert.strictEqual(record!.failureClass, 'AUTHORITY_LIFECYCLE');
  });

  await runTest('CL7: hard-forbidden retrieval (superseded personal memory in the ACTIVE pool) is an authority failure', () => {
    const query = BENCHMARK_QUERIES.find((q) => q.queryId === 'BQ5b')!;
    const pointer = query.forbidden.find((f) => f.evidenceKeys.includes('PM-05'))!;
    const record = classifyForbiddenHit(query, pointer, 'PM-05', {
      retrieved: true,
      renderedUnder: [],
    });
    assert.ok(record);
    assert.strictEqual(record!.kind, 'FORBIDDEN_RETRIEVED');
    assert.strictEqual(record!.failureClass, 'AUTHORITY_LIFECYCLE');
  });

  // =========================================================================
  // D — FULL-RUN DETERMINISM AND WIRING (fresh child processes)
  // =========================================================================

  let run1: BenchmarkRunResult | null = null;
  let raw1 = '';
  let raw2 = '';

  await runTest('D1: the benchmark CLI runs green end-to-end (seed verification passes)', async () => {
    raw1 = await spawnBenchmarkJson();
    run1 = JSON.parse(raw1) as BenchmarkRunResult;
    assert.ok(run1 && run1.queries.length === 13, '13 benchmark queries ran');
    assert.match(run1.fixtureDigest, /^[0-9a-f]{64}$/);
  });

  await runTest('D2: two consecutive fresh-process runs produce BYTE-IDENTICAL JSON', async () => {
    raw2 = await spawnBenchmarkJson();
    assert.strictEqual(raw1.length > 0, true);
    assert.strictEqual(raw2, raw1, 'determinism violated — the harness must never read the clock into results');
  });

  await runTest('D3: all metric values are finite and within [0,1] (no NaN/Infinity leaks)', () => {
    const r = run1!;
    for (const q of r.queries) {
      for (const row of q.metrics.perSurface) {
        for (const value of [row.recallAtK, row.precisionAtK]) {
          assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${q.query.queryId}/${row.surface}: ${value}`);
        }
        if (row.mrr !== null) {
          assert.ok(row.mrr > 0 && row.mrr <= 1, `${q.query.queryId}/${row.surface} MRR: ${row.mrr}`);
        }
      }
      assert.ok(q.metrics.unionRecall >= 0 && q.metrics.unionRecall <= 1);
      if (q.metrics.renderRecall !== null) {
        assert.ok(q.metrics.renderRecall >= 0 && q.metrics.renderRecall <= 1);
      }
    }
  });

  await runTest('D4: pinned wiring outcomes — the known-good and known-bad run anchors hold', () => {
    const r = run1!;
    const byId = new Map(r.queries.map((q) => [q.query.queryId, q]));
    // Known-GOOD (pins the harness wiring to real machinery):
    const bq8 = byId.get('BQ8')!;
    assert.strictEqual(bq8.metrics.authorityCorrect, 1, 'BQ8 authority must pass (state slice renders)');
    assert.strictEqual(bq8.metrics.temporalCorrect, 1);
    const bq5b = byId.get('BQ5b')!;
    assert.strictEqual(bq5b.metrics.supersessionCorrect, 1, 'BQ5b personal supersession must pass (M4-B.1 + M4-C)');
    assert.strictEqual(bq5b.metrics.founderScopeCorrect, 1);
    const bq7a = byId.get('BQ7a')!;
    assert.strictEqual(bq7a.metrics.founderScopeCorrect, 1, 'founder isolation holds');
    assert.strictEqual(bq7a.metrics.boundaryCorrect, 1, 'personal/company boundary holds');
    // Known-BAD (pins the gaps that REMAIN after M5.2 — the A0 gap pins this
    // suite carried at b9d1504 were: BQ1a temporal FAIL + FACT-OLD-01 miss,
    // BQ2 temporal FAIL with >=5 failures, BQ6a CONV-EP-01 J_other miss.
    // M5.2 closed those retrieval gaps; the pins now assert the closed
    // state AND the one gap that honestly remains: the 2-hop multi-hop
    // miss on BQ3a, which stays a RETRIEVAL-class graph candidate).
    const bq1a = byId.get('BQ1a')!;
    assert.strictEqual(bq1a.metrics.temporalCorrect, 1, 'BQ1a history gate must PASS (superseded fact reachable via the historical projection)');
    assert.ok(
      !bq1a.failures.some((f) => f.evidenceKey === 'FACT-OLD-01'),
      'BQ1a FACT-OLD-01 must no longer fail (renders under SUPERSEDED_FACT)'
    );
    assert.strictEqual(bq1a.metrics.supersessionCorrect, 1, 'BQ1a supersession must still hold (predecessor never in a truth position)');
    const bq2 = byId.get('BQ2')!;
    assert.strictEqual(bq2.metrics.temporalCorrect, 1, 'BQ2 window change-set must PASS (change enumeration renders the in-window gold)');
    assert.strictEqual(bq2.failures.length, 0, 'BQ2 must show zero failures (was 9 in A0)');
    assert.strictEqual(bq2.metrics.supersessionCorrect, 1, 'BQ2 supersession must hold under change enumeration');
    const bq6a = byId.get('BQ6a')!;
    assert.ok(
      !bq6a.failures.some((f) => f.evidenceKey === 'CONV-EP-01'),
      'BQ6a episodic conversation gold must be retrieved (M5.2 episodic surface)'
    );
    const bq3a = byId.get('BQ3a')!;
    assert.strictEqual(bq3a.failures.length, 0, 'BQ3a is fully closed by the M5.3-C bounded DEPENDS_ON traversal');
    assert.strictEqual(bq3a.failures.filter((f) => f.graphCandidate).length, 0, 'BQ3a no longer produces a graph-candidate failure');
    assert.strictEqual(bq3a.metrics.unionRecall, 1, 'BQ3a union recall is 100% post M5.3-C');
    assert.strictEqual(bq3a.metrics.renderRecall, 1, 'BQ3a render recall is 100% post M5.3-C');
    // The headline: ZERO failures remain overall — the M5.1 baseline's 14
    // failures are all closed (A0→A1 closed 13 via M5.2; A1→A3 closed BQ3a
    // via M5.3-C, still with NO graph database).
    assert.strictEqual(
      r.aggregate.overall.failureCount,
      0,
      `zero failures must remain; got ${r.aggregate.overall.failureCount}: ` +
        JSON.stringify(r.queries.flatMap((q) => q.failures.map((f) => [q.query.queryId, f.evidenceKey, f.primaryGap])))
    );
    assert.strictEqual(r.aggregate.overall.graphCandidateFailures, 0, 'no graph-candidate failures remain');
  });

  await runTest('D5: zero AUTHORITY_LIFECYCLE failures in the run (M4 governance invariants hold under M5.2)', () => {
    const r = run1!;
    const authorityFailures = r.queries.flatMap((q) => q.failures.filter((f) => f.failureClass === 'AUTHORITY_LIFECYCLE'));
    assert.strictEqual(
      authorityFailures.length,
      0,
      `authority/lifecycle violations measured: ${JSON.stringify(authorityFailures.map((f) => [f.queryId, f.evidenceKey]))}`
    );
    for (const q of r.queries) {
      assert.strictEqual(q.metrics.founderScopeCorrect, 1, `${q.query.queryId}: founder scope`);
      assert.strictEqual(q.metrics.boundaryCorrect, 1, `${q.query.queryId}: boundary`);
    }
  });

  await runTest('D6: generation-failure accounting is explicit — no GENERATION class can be emitted by this harness', () => {
    const r = run1!;
    const classes = new Set(r.queries.flatMap((q) => q.failures.map((f) => f.failureClass)));
    assert.ok(!classes.has('GENERATION'), 'the retrieval harness contains no model call by construction');
    assert.ok(
      [...classes].every((c) => c === 'RETRIEVAL' || c === 'AUTHORITY_LIFECYCLE'),
      `unexpected failure classes: ${[...classes].join(', ')}`
    );
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log('\n==================================================');
  console.log(`M5.1 BENCHMARK SELF-TEST SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('M5.1 benchmark self-test suite crashed:', err);
  process.exit(1);
});
