import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  resetDurableState,
  seedBenchmarkUniverse,
} from '../../benchmark/memory-retrieval/seed';
import { EpistemicClaimStore } from '../../src/lib/server/epistemic/claim-store';
import {
  isFactCurrentAsOf,
  resolveSupersessionEventTime,
  selectFactsForReadMode,
  collectFactLineage,
  MAX_FACT_LINEAGE_NODES,
} from '../../src/lib/server/retrieval/fact-read-model';
import type { CanonicalFact } from '../../src/types/epistemic';

/**
 * ============================================================================
 * M5.3-A — AUTHORITATIVE AS-OF / SUPERSESSION READ API TEST SUITE
 * ============================================================================
 * Pins the deterministic read-model contract (local mode; the authoritative
 * Prisma branches are exercised by m53_authoritative_read_model.test.ts on
 * the SQLite port of the PostgreSQL schema):
 *
 *   R1..R8   pure read-model rules (CURRENT / HISTORICAL / AS_OF eligibility,
 *            legacy fail-closed exclusion, event-time resolution preference)
 *   F1..F9   EpistemicClaimStore readFacts / getFactLineage / queryFacts(asOf)
 *            + markFactSuperseded event-time recording (explicit / derived /
 *            now-fallback) + the governance invariants (a superseded fact is
 *            NEVER current in CURRENT or AS_OF-after-event reads; historical
 *            evidence is never deleted)
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

function fact(partial: Partial<CanonicalFact> & { id: string }): CanonicalFact {
  return {
    claimId: partial.claimId ?? 'claim-x',
    statement: partial.statement ?? 'synthetic statement',
    subject: partial.subject ?? 'test_subject',
    category: partial.category ?? 'operational',
    validityState: partial.validityState ?? 'active',
    confidence: 'verified_fact',
    promotedAt: partial.promotedAt ?? '2026-01-01T00:00:00.000Z',
    promotedBy: partial.promotedBy ?? 'founder',
    provenance: partial.provenance ?? { sourceSystem: 'test' } as any,
    supersededById: partial.supersededById,
    supersededAt: partial.supersededAt,
    ...partial,
  } as CanonicalFact;
}

async function main(): Promise<void> {
  console.log('\n======================================================');
  console.log('M5.3-A AS-OF READ API SUITE');
  console.log('======================================================\n');

  // =========================================================================
  // R — PURE READ-MODEL RULES
  // =========================================================================

  await runTest('R1: CURRENT selects exactly the active facts, newest first', () => {
    const facts = [
      fact({ id: 'a', promotedAt: '2026-01-01T00:00:00.000Z' }),
      fact({ id: 'b', promotedAt: '2026-03-01T00:00:00.000Z' }),
      fact({ id: 'c', validityState: 'superseded', promotedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    const out = selectFactsForReadMode(facts, { mode: 'CURRENT' });
    assert.deepStrictEqual(out.map((f) => f.id), ['b', 'a']);
  });

  await runTest('R2: HISTORICAL selects active + superseded (nothing is deleted), newest first', () => {
    const facts = [
      fact({ id: 'a', promotedAt: '2026-01-01T00:00:00.000Z' }),
      fact({ id: 'b', promotedAt: '2026-03-01T00:00:00.000Z' }),
      fact({ id: 'c', validityState: 'superseded', promotedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    const out = selectFactsForReadMode(facts, { mode: 'HISTORICAL' });
    assert.deepStrictEqual(out.map((f) => f.id), ['b', 'c', 'a']);
  });

  await runTest('R3: AS_OF returns the fact that WAS truth at the instant (predecessor before its supersession)', () => {
    const pred = fact({
      id: 'pred',
      validityState: 'superseded',
      promotedAt: '2026-01-10T00:00:00.000Z',
      supersededById: 'succ',
      supersededAt: '2026-03-15T00:00:00.000Z',
    });
    const succ = fact({ id: 'succ', promotedAt: '2026-03-15T00:00:00.000Z' });
    const asOfMid = selectFactsForReadMode([pred, succ], { mode: 'AS_OF', asOf: '2026-02-01T00:00:00.000Z' });
    assert.deepStrictEqual(asOfMid.map((f) => f.id), ['pred'], 'predecessor was truth before the supersession event');
    const asOfAfter = selectFactsForReadMode([pred, succ], { mode: 'AS_OF', asOf: '2026-06-01T00:00:00.000Z' });
    assert.deepStrictEqual(asOfAfter.map((f) => f.id), ['succ'], 'successor is truth after the event');
    const asOfBeforeBoth = selectFactsForReadMode([pred, succ], { mode: 'AS_OF', asOf: '2025-12-01T00:00:00.000Z' });
    assert.deepStrictEqual(asOfBeforeBoth.map((f) => f.id), [], 'nothing was truth before the first promotion');
  });

  await runTest('R4: AS_OF is fail-closed on unknown event times (legacy superseded rows)', () => {
    const legacy = fact({
      id: 'legacy',
      validityState: 'superseded',
      promotedAt: '2026-01-10T00:00:00.000Z',
      supersededById: 'succ',
      // supersededAt deliberately absent (pre-M5.3-A row)
    });
    const succ = fact({ id: 'succ', promotedAt: '2026-03-15T00:00:00.000Z' });
    const asOf = selectFactsForReadMode([legacy, succ], { mode: 'AS_OF', asOf: '2026-02-01T00:00:00.000Z' });
    assert.deepStrictEqual(asOf.map((f) => f.id), [], 'unknown event time cannot be proven current — excluded');
    const historical = selectFactsForReadMode([legacy, succ], { mode: 'HISTORICAL' });
    assert.deepStrictEqual(historical.map((f) => f.id).sort(), ['legacy', 'succ'], 'still listed historically');
  });

  await runTest('R5: AS_OF with a missing/invalid instant returns nothing (fail closed)', () => {
    const facts = [fact({ id: 'a' })];
    assert.deepStrictEqual(selectFactsForReadMode(facts, { mode: 'AS_OF' }), []);
    assert.deepStrictEqual(selectFactsForReadMode(facts, { mode: 'AS_OF', asOf: 'not-a-date' }), []);
  });

  await runTest('R6: isFactCurrentAsOf — boundary instants are half-open [promotedAt, supersededAt)', () => {
    const pred = fact({
      id: 'pred',
      validityState: 'superseded',
      promotedAt: '2026-01-10T00:00:00.000Z',
      supersededAt: '2026-03-15T00:00:00.000Z',
    });
    assert.strictEqual(isFactCurrentAsOf(pred, Date.parse('2026-01-10T00:00:00.000Z')), true, 'current from its own promotion instant');
    assert.strictEqual(isFactCurrentAsOf(pred, Date.parse('2026-03-15T00:00:00.000Z')), false, 'not current AT the supersession instant');
    assert.strictEqual(isFactCurrentAsOf(pred, Date.parse('2026-01-09T23:59:59.999Z')), false, 'not current before promotion');
  });

  await runTest('R7: read-mode filters compose (category/subject) and ordering is stable', () => {
    const facts = [
      fact({ id: 'a1', category: 'financial', subject: 'pricing', promotedAt: '2026-01-01T00:00:00.000Z' }),
      fact({ id: 'a2', category: 'financial', subject: 'pricing', promotedAt: '2026-05-01T00:00:00.000Z' }),
      fact({ id: 'b1', category: 'architectural', subject: 'pricing', promotedAt: '2026-06-01T00:00:00.000Z' }),
    ];
    const out = selectFactsForReadMode(facts, { mode: 'CURRENT', category: 'financial' });
    assert.deepStrictEqual(out.map((f) => f.id), ['a2', 'a1']);
    const bySubject = selectFactsForReadMode(facts, { mode: 'CURRENT', subject: 'PRICING' });
    assert.deepStrictEqual(bySubject.map((f) => f.id), ['b1', 'a2', 'a1'], 'subject match is case-insensitive');
  });

  await runTest('R8: event-time resolution prefers explicit, then successor promotion, then null', () => {
    const succ = fact({ id: 'succ', promotedAt: '2026-03-15T00:00:00.000Z' });
    assert.strictEqual(resolveSupersessionEventTime('2026-01-01T00:00:00.000Z', succ), '2026-01-01T00:00:00.000Z');
    assert.strictEqual(resolveSupersessionEventTime(undefined, succ), '2026-03-15T00:00:00.000Z');
    assert.strictEqual(resolveSupersessionEventTime(undefined, null), null);
  });

  await runTest('R9: collectFactLineage is bounded and cycle-safe', async () => {
    // A -> B -> C successor chain; B also has a second predecessor D.
    const map = new Map<string, CanonicalFact>([
      ['a', fact({ id: 'a', supersededById: 'b' })],
      ['b', fact({ id: 'b', supersededById: 'c' })],
      ['c', fact({ id: 'c' })],
      ['d', fact({ id: 'd', supersededById: 'b' })],
    ]);
    const lineage = await collectFactLineage(
      'a',
      async (id) => map.get(id) ?? null,
      async (id) => [...map.values()].filter((f) => f.supersededById === id)
    );
    assert.deepStrictEqual(lineage.successors.map((s) => s.fact.id), ['b', 'c']);
    assert.deepStrictEqual(lineage.predecessors.map((p) => p.fact.id).sort(), ['d'], 'predecessors of the whole chain reachable from the root');
    // Cycle: a <-> b (malformed data) must not hang and must stop.
    const cyclic = new Map<string, CanonicalFact>([
      ['a', fact({ id: 'a', supersededById: 'b' })],
      ['b', fact({ id: 'b', supersededById: 'a' })],
    ]);
    const cycled = await collectFactLineage(
      'a',
      async (id) => cyclic.get(id) ?? null,
      async () => []
    );
    assert.strictEqual(cycled.successors.length <= 1, true, 'cycle terminates without duplication');
    // Bound: the traversal cap is a positive, small constant (chain walks
    // can never be unbounded).
    assert.ok(MAX_FACT_LINEAGE_NODES > 0 && MAX_FACT_LINEAGE_NODES <= 64);
  });

  // =========================================================================
  // F — STORE-LEVEL READ API (local mode; seeded benchmark universe)
  // =========================================================================

  const scratch = path.join(os.tmpdir(), 'samjuniors-m53a-tests');
  fs.mkdirSync(scratch, { recursive: true });
  process.chdir(scratch);
  resetDurableState();
  const seed = await seedBenchmarkUniverse();
  const store = EpistemicClaimStore.getInstance();

  await runTest('F1: markFactSuperseded derives the event time from the successor promotion (deterministic)', async () => {
    const historical = await store.readFacts({ mode: 'HISTORICAL' });
    const pred = historical.find((f) => f.id === 'fact-lumora-price-29')!;
    const succ = historical.find((f) => f.id === 'fact-lumora-price-49')!;
    assert.strictEqual(pred.supersededAt, succ.promotedAt, 'event time = successor promotion moment (fixture timeline)');
  });

  await runTest('F2: readFacts CURRENT equals the active set; HISTORICAL adds the superseded pair member', async () => {
    const current = await store.readFacts({ mode: 'CURRENT' });
    assert.ok(current.every((f) => f.validityState === 'active'));
    assert.ok(!current.some((f) => f.id === 'fact-lumora-price-29'));
    const historical = await store.readFacts({ mode: 'HISTORICAL' });
    assert.strictEqual(historical.length, current.length + 1);
    assert.ok(historical.some((f) => f.id === 'fact-lumora-price-29'));
  });

  await runTest('F3: readFacts AS_OF windows over the seeded supersession chain', async () => {
    const historical = await store.readFacts({ mode: 'HISTORICAL' });
    const pred = historical.find((f) => f.id === 'fact-lumora-price-29')!;
    const succ = historical.find((f) => f.id === 'fact-lumora-price-49')!;
    const mid = new Date((Date.parse(pred.promotedAt) + Date.parse(succ.promotedAt)) / 2).toISOString();
    const asOfMid = (await store.readFacts({ mode: 'AS_OF', asOf: mid })).filter((f) => f.id.startsWith('fact-lumora-price'));
    assert.deepStrictEqual(asOfMid.map((f) => f.id), ['fact-lumora-price-29'], 'predecessor was truth mid-window');
    const asOfNow = (await store.readFacts({ mode: 'AS_OF', asOf: new Date().toISOString() })).filter((f) => f.id.startsWith('fact-lumora-price'));
    assert.deepStrictEqual(asOfNow.map((f) => f.id), ['fact-lumora-price-49'], 'successor is truth now');
  });

  await runTest('F4: queryFacts with asOf ranks within the as-of pool (lexical semantics preserved)', async () => {
    const historical = await store.readFacts({ mode: 'HISTORICAL' });
    const pred = historical.find((f) => f.id === 'fact-lumora-price-29')!;
    const succ = historical.find((f) => f.id === 'fact-lumora-price-49')!;
    const mid = new Date((Date.parse(pred.promotedAt) + Date.parse(succ.promotedAt)) / 2).toISOString();
    const hits = await store.queryFacts({ queryText: 'Lumora Starter tier price', limit: 3, asOf: mid });
    assert.ok(hits.some((f) => f.id === 'fact-lumora-price-29'), 'predecessor retrievable as as-of truth');
    assert.ok(!hits.some((f) => f.id === 'fact-lumora-price-49'), 'successor not yet promoted at the as-of instant');
  });

  await runTest('F5: queryFacts without asOf is byte-identical to the M5.2 behavior (CURRENT pool)', async () => {
    const a = await store.queryFacts({ queryText: 'Lumora pricing', limit: 3 });
    const b = await store.queryFacts({ queryText: 'Lumora pricing', limit: 3, includeSuperseded: false });
    assert.deepStrictEqual(a.map((f) => f.id), b.map((f) => f.id));
    assert.ok(a.every((f) => f.validityState === 'active'));
  });

  await runTest('F6: getFactLineage walks successor and predecessor chains with event times', async () => {
    const lineage = await store.getFactLineage('fact-lumora-price-29');
    assert.deepStrictEqual(lineage.successors.map((s) => s.fact.id), ['fact-lumora-price-49']);
    assert.strictEqual(lineage.successors[0].supersededAt, null, 'successor is still current');
    const reverse = await store.getFactLineage('fact-lumora-price-49');
    assert.deepStrictEqual(reverse.predecessors.map((p) => p.fact.id), ['fact-lumora-price-29']);
    assert.ok(reverse.predecessors[0].supersededAt, 'predecessor carries its event time');
  });

  await runTest('F7: explicit supersededAt is honored; unknown-successor falls back to wall clock', async () => {
    const store2 = EpistemicClaimStore.getInstance();
    // Explicit
    await store2.saveFact(fact({ id: 'm53a-x1', statement: 'X1 synthetic', promotedAt: '2026-01-01T00:00:00.000Z' }));
    await store2.saveFact(fact({ id: 'm53a-y1', statement: 'Y1 synthetic', promotedAt: '2026-02-01T00:00:00.000Z' }));
    await store2.markFactSuperseded('m53a-x1', 'm53a-y1', { supersededAt: '2026-02-01T00:00:00.000Z' });
    const x1 = await store2.getFact('m53a-x1');
    assert.strictEqual(x1?.supersededAt, '2026-02-01T00:00:00.000Z');
    // Unknown successor → wall clock (recent, non-deterministic by nature; assert shape)
    await store2.saveFact(fact({ id: 'm53a-x2', statement: 'X2 synthetic', promotedAt: '2026-01-01T00:00:00.000Z' }));
    const tBefore = Date.now();
    await store2.markFactSuperseded('m53a-x2', 'm53a-nonexistent-successor');
    const tAfter = Date.now();
    const x2 = await store2.getFact('m53a-x2');
    assert.ok(x2?.supersededAt, 'fallback records an event time');
    const ms = Date.parse(x2!.supersededAt!);
    assert.ok(ms >= tBefore - 1 && ms <= tAfter + 1, 'fallback event time is the wall clock');
  });

  await runTest('F8: GOVERNANCE — superseded evidence never becomes current in any read mode', async () => {
    const current = await store.readFacts({ mode: 'CURRENT' });
    assert.ok(!current.some((f) => f.id === 'fact-lumora-price-29'), 'CURRENT never lists superseded facts');
    const asOfNow = await store.readFacts({ mode: 'AS_OF', asOf: new Date().toISOString() });
    assert.ok(!asOfNow.some((f) => f.id === 'fact-lumora-price-29'), 'AS_OF after the event excludes the predecessor');
    const historical = await store.readFacts({ mode: 'HISTORICAL' });
    assert.ok(historical.some((f) => f.id === 'fact-lumora-price-29'), 'HISTORICAL preserves the evidence (never deleted)');
  });

  await runTest('F9: provenance passes through every read mode untouched', async () => {
    for (const mode of ['CURRENT', 'HISTORICAL', 'AS_OF'] as const) {
      const out = await store.readFacts({ mode, asOf: mode === 'AS_OF' ? new Date().toISOString() : undefined });
      for (const f of out) {
        assert.ok(f.provenance && typeof f.provenance === 'object', `${mode}: provenance present on ${f.id}`);
        assert.ok(f.promotedBy, `${mode}: promotedBy present on ${f.id}`);
      }
    }
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log('\n==================================================');
  console.log(`M5.3-A AS-OF READ API SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');
  if (failed > 0) process.exit(1);
}

void main().catch((err) => {
  console.error(`M5.3-A SUITE HARNESS ERROR: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
