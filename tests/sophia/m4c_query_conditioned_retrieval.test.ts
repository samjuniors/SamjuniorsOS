import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  SophiaMemoryStore,
  SOPHIA_MEMORY_TYPES,
} from '../../src/lib/server/sophia/personal-memory-store';
import { SophiaContextAssembler } from '../../src/lib/server/sophia';
import { selectPersonalMindMemories } from '../../src/lib/server/sophia/context-assembly';
import { extractTokens } from '../../src/lib/server/knowledge/knowledge-store';
import { CompanyKnowledgeStore } from '../../src/lib/server/knowledge/knowledge-store';
import { prisma, isDatabaseAvailable } from '../../src/lib/server/db/prisma';

/**
 * ============================================================================
 * M4-C — QUERY-CONDITIONED PERSONAL MIND RETRIEVAL TEST SUITE
 * ============================================================================
 *
 * The M4-C contract: Personal Mind memory selection is conditioned on the
 * CURRENT founder message instead of returning the same memories every turn,
 * while every existing guarantee is preserved. Pinned here:
 *
 *   C1  A memory lexically matching the query outranks an unrelated memory —
 *       even one the pre-M4-C policy would rank FIRST (higher confidence,
 *       newer). The same pool WITHOUT the query keeps the old order.
 *   C2  Identical inputs produce identical ordering (pure determinism).
 *   C3  No-token-match (and no-usable-token) queries fall back to the EXACT
 *       pre-M4-C deterministic selection — independently re-derived in this
 *       suite — never an empty memory context.
 *   C4  The 20-memory retrieval cap remains enforced (all-matching pool).
 *   C5  Matched tier fills first, remaining capacity is filled by the
 *       pre-M4-C policy over unmatched memories; combined cap stays 20.
 *   C6  Within the matched tier, lexical score DESC is the primary order and
 *       confidence/recency only break ties (secondary policy preserved).
 *   C7  Type round-robin is preserved inside the matched tier.
 *   C8  Tokenization is the SHARED CompanyKnowledgeStore pipeline
 *       (extractTokens + stop-word filtering) — case/punctuation-insensitive,
 *       no second retrieval framework.
 *   C9  End-to-end: the matching memory renders BEFORE an unrelated,
 *       higher-confidence, newer memory inside PERSONAL_MIND_MEMORY; a
 *       no-match message restores the old order (message flips selection).
 *   C10 End-to-end determinism: identical assemble() inputs yield identical
 *       slice content.
 *   C11 End-to-end fallback: a token-bearing message that matches nothing
 *       still renders the personal-mind slice (existing behavior preserved).
 *   C12 lifecycleState stays authoritative: PENDING_REVIEW / ARCHIVED /
 *       SUPERSEDED / REJECTED records whose CONTENT matches the query are
 *       never retrieved; only ACTIVE renders.
 *   C13 The 1200-character Personal Mind container budget remains enforced
 *       for query-matched memories (truncation, always-closed container).
 *   C14 Personal Mind retrieval cannot cross into Company Brain authority:
 *       company knowledge content never enters the personal slice, personal
 *       content never enters a company slice or a company store, and Company
 *       Brain retrieval itself is unchanged.
 *   C15 The assembly call site threads the CURRENT founder message into the
 *       selection path (source-level pin, repository convention).
 *
 * NOT UNDER TEST (out of M4-C scope by contract): embeddings/vectors/Redis/
 * Graphiti, LLM-driven retrieval, consolidation, decay/TTL, older-conversation
 * search, Company Brain scoring changes, lifecycle semantics changes.
 */

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`  [FAIL] ${name}: ${err?.message || err}`);
  }
}

/** Minimal record shape the deterministic selection policy consumes. */
interface SelMem {
  memoryType: string;
  confidence: number;
  updatedAt: string;
  id: string;
  content: string;
}

function mem(id: string, memoryType: string, confidence: number, updatedAt: string, content: string): SelMem {
  return { id, memoryType, confidence, updatedAt, content };
}

const ids = (selected: SelMem[]) => selected.map((m) => m.id);

/**
 * INDEPENDENT re-derivation of the pre-M4-C policy (P2 follow-up):
 * within-type order = confidence DESC, updatedAt DESC, id ASC; round-robin
 * across SOPHIA_MEMORY_TYPES allow-list order; capped at 20. Written with a
 * different mechanism (index-walking rounds, not queue shifts) so this suite
 * encodes the DOCUMENTED contract rather than mirroring the implementation.
 */
function expectedPreM4cOrder(records: SelMem[]): string[] {
  const byType = new Map<string, SelMem[]>();
  for (const r of records) {
    byType.set(r.memoryType, [...(byType.get(r.memoryType) ?? []), r]);
  }
  for (const list of byType.values()) {
    list.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      const ta = new Date(a.updatedAt).getTime();
      const tb = new Date(b.updatedAt).getTime();
      if (tb !== ta) return tb - ta;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }
  const order: string[] = [];
  for (let round = 0; order.length < 20; round++) {
    let advanced = false;
    for (const t of SOPHIA_MEMORY_TYPES) {
      if (order.length >= 20) break;
      const list = byType.get(t);
      if (list && list.length > round) {
        order.push(list[round].id);
        advanced = true;
      }
    }
    if (!advanced) break;
  }
  return order;
}

async function main() {
  console.log('\n======================================================');
  console.log('M4-C QUERY-CONDITIONED PERSONAL MIND RETRIEVAL SUITE');
  console.log('======================================================\n');

  const store = SophiaMemoryStore.getInstance();
  const dbAvailable = await isDatabaseAvailable().catch(() => false);

  // Isolate this suite's personal memory state from anything left in .data.
  store.clearForTests();

  // =========================================================================
  // PURE SELECTION-POLICY TESTS (no store state; deterministic by contract)
  // =========================================================================

  await runTest('C1: a query-matching memory outranks an unrelated memory the old policy would rank first', async () => {
    const records = [
      // Unrelated: highest confidence + newest → FIRST under the pre-M4-C policy.
      mem('m-hi', 'INTERACTION_PREFERENCE', 0.95, '2026-12-01T00:00:00.000Z', 'Prefers sailing and long bicycle rides on weekends.'),
      // Matching: lowest confidence + oldest → LAST under the pre-M4-C policy.
      mem('m-match', 'INTERACTION_PREFERENCE', 0.3, '2026-01-01T00:00:00.000Z', 'Founder drinks espresso every morning while reading.'),
    ];
    const query = 'What espresso drinks does the founder prefer in the morning?';

    const conditioned = ids(selectPersonalMindMemories(records, query));
    assert.deepStrictEqual(conditioned, ['m-match', 'm-hi'], 'matching memory must outrank the unrelated one');

    // The same pool WITHOUT the query keeps the pre-M4-C order — the message
    // is what flips the selection (the M4-C goal, stated inversely).
    const fallback = ids(selectPersonalMindMemories(records, undefined));
    assert.deepStrictEqual(fallback, ['m-hi', 'm-match'], 'without a query the old confidence-first order holds');
  });

  await runTest('C2: identical inputs produce identical ordering (determinism, conditioned and fallback)', async () => {
    const records = [
      mem('d-1', 'COMMUNICATION_PREFERENCE', 0.5, '2026-05-01T00:00:00.000Z', 'Founder likes matcha tea ceremonies.'),
      mem('d-2', 'INTERACTION_PATTERN', 0.9, '2026-06-01T00:00:00.000Z', 'Founder asks about matcha every Friday.'),
      mem('d-3', 'PERSONAL_CONTEXT_NOTE', 0.7, '2026-07-01T00:00:00.000Z', 'Keeps a ceramic cup collection.'),
      mem('d-4', 'COMMUNICATION_PREFERENCE', 0.5, '2026-05-01T00:00:00.000Z', 'Prefers short answers about tea.'),
    ];
    for (const query of ['Tell me about matcha tea', undefined, 'zzz no match query']) {
      const first = selectPersonalMindMemories(records, query);
      const second = selectPersonalMindMemories(records, query);
      const third = selectPersonalMindMemories(records, query);
      assert.deepStrictEqual(ids(first), ids(second), `stable across repeated calls (query=${String(query)})`);
      assert.deepStrictEqual(ids(second), ids(third), `stable across repeated calls (query=${String(query)})`);
      assert.deepStrictEqual(first, second, 'identical record objects and order');
    }
  });

  await runTest('C3: no-token-match (and no-usable-token) queries fall back to the exact pre-M4-C policy — never empty', async () => {
    const records = [
      mem('f-1', 'INTERACTION_PREFERENCE', 0.9, '2026-03-01T00:00:00.000Z', 'Founder prefers concise answers.'),
      mem('f-2', 'COMMUNICATION_PREFERENCE', 0.9, '2026-02-01T00:00:00.000Z', 'Founder prefers morning check-ins.'),
      mem('f-3', 'COMMUNICATION_PREFERENCE', 0.9, '2026-02-01T00:00:00.000Z', 'Founder prefers plain language.'),
      mem('f-4', 'INTERACTION_PATTERN', 0.4, '2026-08-01T00:00:00.000Z', 'Asks for numbers, not adjectives.'),
      mem('f-5', 'PERSONAL_CONTEXT_NOTE', 0.4, '2026-01-01T00:00:00.000Z', 'Keeps a garden on the balcony.'),
      mem('f-6', 'INTERACTION_OBSERVATION', 0.6, '2026-04-01T00:00:00.000Z', 'Enjoys whiteboard explanations.'),
    ];
    const expected = expectedPreM4cOrder(records);
    assert.ok(expected.length === 6, 'sanity: all six records are expected under the pre-M4-C policy');

    // Token-bearing message with ZERO lexical matches → exact fallback.
    assert.deepStrictEqual(
      ids(selectPersonalMindMemories(records, 'Xylophone quux xyzzY')),
      expected,
      'no-match query must reproduce the pre-M4-C order exactly'
    );
    // No usable tokens at all → exact fallback (all equivalent).
    for (const query of [undefined, '', '   ', 'the and of a is it'] as (string | undefined)[]) {
      assert.deepStrictEqual(
        ids(selectPersonalMindMemories(records, query)),
        expected,
        `no-usable-token query (${JSON.stringify(query)}) must reproduce the pre-M4-C order`
      );
    }
    // Never empty: a fallback still selects the pool it is given.
    assert.ok(selectPersonalMindMemories(records, 'zzz unmatched').length > 0, 'fallback is not an empty context');
  });

  await runTest('C4: the 20-memory retrieval cap remains enforced for an all-matching pool', async () => {
    const records: SelMem[] = [];
    const types = SOPHIA_MEMORY_TYPES; // 5 allow-listed types
    for (let i = 0; i < 30; i++) {
      records.push(
        mem(
          `cap-${i}`,
          types[i % types.length],
          0.5,
          new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
          `Founder enjoys matcha blend number ${i}.`
        )
      );
    }
    const selected = selectPersonalMindMemories(records, 'matcha');
    assert.strictEqual(selected.length, 20, 'exactly PERSONAL_MIND_RETRIEVAL_LIMIT memories are selected');
    assert.strictEqual(new Set(ids(selected)).size, 20, 'no memory is selected twice');
    assert.ok(selected.every((m) => m.content.includes('matcha')), 'every selected memory matched the query');
  });

  await runTest('C5: matched tier fills first; remaining capacity is filled by the pre-M4-C policy; cap stays 20', async () => {
    const records: SelMem[] = [];
    // 8 matching memories (espresso), varied types/confidence/recency.
    for (let i = 0; i < 8; i++) {
      records.push(
        mem(`t1-${i}`, SOPHIA_MEMORY_TYPES[i % SOPHIA_MEMORY_TYPES.length], 0.4 + i * 0.05, new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), `Founder drinks espresso blend ${i}.`)
      );
    }
    // 30 non-matching memories.
    for (let i = 0; i < 30; i++) {
      records.push(
        mem(`t2-${i}`, SOPHIA_MEMORY_TYPES[i % SOPHIA_MEMORY_TYPES.length], 0.1 + i * 0.02, new Date(Date.UTC(2026, 5, 1 + i)).toISOString(), `Gardening note number ${i} about ferns.`)
      );
    }
    const selected = selectPersonalMindMemories(records, 'espresso');
    assert.strictEqual(selected.length, 20, 'combined tiers fill to exactly the retrieval cap');
    assert.strictEqual(new Set(ids(selected)).size, 20, 'no duplicates across tiers');
    for (let i = 0; i < 8; i++) {
      assert.ok(selected[i].content.includes('espresso'), `position ${i} belongs to the matched tier`);
    }
    for (let i = 8; i < 20; i++) {
      assert.ok(!selected[i].content.includes('espresso'), `position ${i} belongs to the unmatched fill`);
    }
    // The unmatched fill must be the pre-M4-C order restricted to unmatched records.
    const unmatched = records.filter((r) => !r.content.includes('espresso'));
    assert.deepStrictEqual(
      ids(selected.slice(8)),
      expectedPreM4cOrder(unmatched).slice(0, 12),
      'tier-2 fill is the pre-M4-C policy over the unmatched pool'
    );
  });

  await runTest('C6: within the matched tier, lexical score DESC is primary; confidence/recency only break ties', async () => {
    const records = [
      // Highest confidence + newest, but only ONE query token in content.
      mem('s-a', 'COMMUNICATION_PREFERENCE', 0.99, '2026-10-01T00:00:00.000Z', 'Coffee is the only relevant word here.'),
      // Mid confidence, TWO query tokens.
      mem('s-c', 'COMMUNICATION_PREFERENCE', 0.5, '2026-06-01T00:00:00.000Z', 'Coffee plus tea together.'),
      // Lowest confidence + oldest, THREE query tokens → must rank FIRST.
      mem('s-b', 'COMMUNICATION_PREFERENCE', 0.1, '2026-01-01T00:00:00.000Z', 'Coffee, tea, and biscuits.'),
    ];
    const selected = selectPersonalMindMemories(records, 'coffee tea biscuits');
    assert.deepStrictEqual(ids(selected), ['s-b', 's-c', 's-a'], 'lexical score DESC outranks confidence and recency');
  });

  await runTest('C7: type round-robin is preserved inside the matched tier', async () => {
    // COMMUNICATION_PREFERENCE holds three matching memories; every other
    // present type holds one. Expected: one per type per round, in
    // SOPHIA_MEMORY_TYPES allow-list order, then the remaining two.
    const records = [
      mem('rr-cp1', 'COMMUNICATION_PREFERENCE', 0.9, '2026-01-04T00:00:00.000Z', 'Matcha brewing notes one.'),
      mem('rr-cp2', 'COMMUNICATION_PREFERENCE', 0.8, '2026-01-03T00:00:00.000Z', 'Matcha brewing notes two.'),
      mem('rr-cp3', 'COMMUNICATION_PREFERENCE', 0.7, '2026-01-02T00:00:00.000Z', 'Matcha brewing notes three.'),
      mem('rr-ip1', 'INTERACTION_PREFERENCE', 0.5, '2026-01-09T00:00:00.000Z', 'Matcha brewing notes four.'),
      mem('rr-itp1', 'INTERACTION_PATTERN', 0.5, '2026-01-08T00:00:00.000Z', 'Matcha brewing notes five.'),
      mem('rr-pcn1', 'PERSONAL_CONTEXT_NOTE', 0.5, '2026-01-07T00:00:00.000Z', 'Matcha brewing notes six.'),
      mem('rr-io1', 'INTERACTION_OBSERVATION', 0.5, '2026-01-06T00:00:00.000Z', 'Matcha brewing notes seven.'),
    ];
    const selected = selectPersonalMindMemories(records, 'matcha brewing');
    assert.deepStrictEqual(
      ids(selected),
      ['rr-ip1', 'rr-cp1', 'rr-itp1', 'rr-pcn1', 'rr-io1', 'rr-cp2', 'rr-cp3'],
      'matched tier interleaves by type in the allow-list order'
    );
  });

  await runTest('C8: tokenization is the SHARED CompanyKnowledgeStore pipeline (extractTokens + stop words)', async () => {
    // The exact tokenizer CompanyKnowledgeStore.queryKnowledge uses.
    assert.deepStrictEqual(
      extractTokens('What Espresso!! do you drink?'),
      ['espresso', 'drink'],
      'shared tokenizer: lowercase, strip punctuation, drop stop words and <=2-char fragments'
    );
    // A memory matching the message through that pipeline is selected first
    // (case/punctuation-insensitive overlap).
    const records = [
      mem('tk-no', 'INTERACTION_PREFERENCE', 0.95, '2026-10-01T00:00:00.000Z', 'Prefers sailing on windy days.'),
      mem('tk-yes', 'INTERACTION_PREFERENCE', 0.2, '2026-01-01T00:00:00.000Z', 'ESPRESSO! drinks at dawn...'),
    ];
    const selected = selectPersonalMindMemories(records, 'what espresso do you drink');
    assert.deepStrictEqual(ids(selected), ['tk-yes', 'tk-no'], 'the shared pipeline drives the personal-mind match');
  });

  // =========================================================================
  // END-TO-END TESTS (real store + SophiaContextAssembler.assemble)
  // =========================================================================

  await runTest('C9: end-to-end — the matching memory renders BEFORE an unrelated higher-confidence newer one; a no-match message restores the old order', async () => {
    const founder = `founder_m4c_e2e_${randomUUID().slice(0, 8)}`;
    const markMatch = `M4C-E2E-MATCH-${randomUUID().slice(0, 8)}`;
    const markUnrel = `M4C-E2E-UNREL-${randomUUID().slice(0, 8)}`;

    // Created FIRST (older) with LOW confidence — old policy would rank it last.
    await store.createMemory({
      founderId: founder,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `Founder drinks espresso every morning. ${markMatch}`,
      provenance: 'founder_direct',
      confidence: 0.3,
    });
    // Created SECOND (newer) with HIGH confidence — old policy ranks it first.
    await store.createMemory({
      founderId: founder,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `Prefers sailing and long bicycle rides on weekends. ${markUnrel}`,
      provenance: 'founder_direct',
      confidence: 0.95,
    });

    // Matching message: matched memory must render first.
    const matchCtx = await SophiaContextAssembler.assemble({
      message: 'Tell me about espresso preferences in the morning',
      founderId: founder,
    });
    const matchSlice = matchCtx.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    assert.ok(matchSlice, 'personal-mind slice renders for the matching message');
    assert.ok(matchSlice.content.includes(markMatch), 'matching memory renders');
    assert.ok(matchSlice.content.includes(markUnrel), 'unrelated memory still renders (secondary fill, not exclusion)');
    assert.ok(
      matchSlice.content.indexOf(markMatch) < matchSlice.content.indexOf(markUnrel),
      'matching memory renders BEFORE the higher-confidence unrelated one'
    );

    // No-match message: the old order returns (higher confidence first).
    const noMatchCtx = await SophiaContextAssembler.assemble({
      message: 'Xylophone quux xyzzY unrelated query',
      founderId: founder,
    });
    const noMatchSlice = noMatchCtx.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    assert.ok(noMatchSlice, 'personal-mind slice still renders on a no-match message (fallback)');
    assert.ok(noMatchSlice.content.includes(markMatch) && noMatchSlice.content.includes(markUnrel), 'fallback renders both memories');
    assert.ok(
      noMatchSlice.content.indexOf(markUnrel) < noMatchSlice.content.indexOf(markMatch),
      'fallback preserves the pre-M4-C order (confidence first)'
    );
  });

  await runTest('C10: end-to-end determinism — identical assemble() inputs yield identical slice content', async () => {
    const founder = `founder_m4c_det_${randomUUID().slice(0, 8)}`;
    const markA = `M4C-DET-A-${randomUUID().slice(0, 8)}`;
    const markB = `M4C-DET-B-${randomUUID().slice(0, 8)}`;
    await store.createMemory({
      founderId: founder,
      memoryType: 'INTERACTION_OBSERVATION',
      content: `Founder enjoys matcha tea ceremonies. ${markA}`,
      provenance: 'founder_direct',
      confidence: 0.6,
    });
    await store.createMemory({
      founderId: founder,
      memoryType: 'PERSONAL_CONTEXT_NOTE',
      content: `Keeps a small herb garden. ${markB}`,
      provenance: 'founder_direct',
      confidence: 0.9,
    });

    for (const message of ['Tell me about matcha tea ceremonies', 'Completely unrelated question today']) {
      const first = await SophiaContextAssembler.assemble({ message, founderId: founder });
      const second = await SophiaContextAssembler.assemble({ message, founderId: founder });
      const s1 = first.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
      const s2 = second.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
      assert.ok(s1 && s2, 'personal-mind slice renders');
      assert.strictEqual(s1.content, s2.content, `identical inputs → identical container (message: ${message.slice(0, 30)}...)`);
      assert.strictEqual(first.formattedContext, second.formattedContext, 'identical inputs → identical assembled context');
    }
  });

  await runTest('C11: end-to-end fallback — a token-bearing no-match message keeps a non-empty personal-mind context', async () => {
    const founder = `founder_m4c_fb_${randomUUID().slice(0, 8)}`;
    const mark = `M4C-FB-${randomUUID().slice(0, 8)}`;
    await store.createMemory({
      founderId: founder,
      memoryType: 'INTERACTION_PREFERENCE',
      content: `Founder prefers concise, direct answers. ${mark}`,
      provenance: 'founder_direct',
      confidence: 0.8,
    });

    const ctx = await SophiaContextAssembler.assemble({
      message: 'Xylophone quux xyzzY nothing matches this',
      founderId: founder,
    });
    const slice = ctx.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    assert.ok(slice, 'personal-mind slice renders (never emptied by a token miss)');
    assert.ok(slice.content.includes(mark), 'the memory still renders under the fallback policy');
    assert.ok(slice.content.trimEnd().endsWith('</personal_memory_context>'), 'container still closes');
  });

  await runTest('C12: lifecycleState stays authoritative — matching-but-inactive memories are never retrieved', async () => {
    const founder = `founder_m4c_life_${randomUUID().slice(0, 8)}`;
    const mk = (label: string) => `M4C-LIFE-${label}-${randomUUID().slice(0, 8)}`;

    const activeMark = mk('ACTIVE');
    await store.createMemory({
      founderId: founder,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `Active matcha tea preference note. ${activeMark}`,
      provenance: 'founder_direct',
      confidence: 0.7,
    });

    // Every non-ACTIVE record below CONTAINS the query tokens — each would be
    // a top lexical match if lifecycle allowed; its absence proves the guard.
    const pendingMark = mk('PENDING');
    await store.createMemory({
      founderId: founder,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `Pending matcha tea preference note. ${pendingMark}`,
      provenance: 'founder_direct',
      lifecycleState: 'PENDING_REVIEW',
    });

    const archived = await store.createMemory({
      founderId: founder,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `Archived matcha tea preference note. ${mk('ARCHIVED')}`,
      provenance: 'founder_direct',
    });
    await store.updateMemory(founder, archived.id, { lifecycleState: 'ARCHIVED' });

    const successor = await store.createMemory({
      founderId: founder,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: 'Replacement note about ceramic cups.',
      provenance: 'founder_direct',
    });
    const superseded = await store.createMemory({
      founderId: founder,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `Superseded matcha tea preference note. ${mk('SUPERSEDED')}`,
      provenance: 'founder_direct',
    });
    await store.updateMemory(founder, superseded.id, { lifecycleState: 'SUPERSEDED', supersededByMemoryId: successor.id });

    // REJECTED is reachable only from PENDING_REVIEW (transition table).
    const rejected = await store.createMemory({
      founderId: founder,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `Rejected matcha tea preference note. ${mk('REJECTED')}`,
      provenance: 'founder_direct',
      lifecycleState: 'PENDING_REVIEW',
    });
    await store.updateMemory(founder, rejected.id, { lifecycleState: 'REJECTED' });

    const ctx = await SophiaContextAssembler.assemble({
      message: 'Tell me about matcha tea preferences',
      founderId: founder,
    });
    const slice = ctx.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    assert.ok(slice, 'personal-mind slice renders for the ACTIVE memory');
    assert.ok(slice.content.includes(activeMark), 'the ACTIVE (matching) memory renders');
    assert.ok(ctx.formattedContext.includes(activeMark), 'ACTIVE marker present in the assembled context');
    for (const label of ['PENDING', 'ARCHIVED', 'SUPERSEDED', 'REJECTED']) {
      assert.ok(
        !ctx.formattedContext.includes(`M4C-LIFE-${label}-`),
        `no ${label} memory is ever retrieved, even when its content matches the query`
      );
    }
  });

  await runTest('C13: the 1200-character Personal Mind container budget remains enforced for matched memories', async () => {
    const founder = `founder_m4c_budget_${randomUUID().slice(0, 8)}`;
    const mark = `M4C-BUDGET-${randomUUID().slice(0, 8)}`;
    const longContent = `Founder loves matcha ${mark} ${'and elaborate tea ceremonies with many detailed steps '.repeat(30)}`;
    assert.ok(longContent.length <= 2000, 'test fixture respects the store content bound');
    await store.createMemory({
      founderId: founder,
      memoryType: 'PERSONAL_CONTEXT_NOTE',
      content: longContent,
      provenance: 'founder_direct',
    });

    const ctx = await SophiaContextAssembler.assemble({
      message: 'Tell me about matcha tea ceremonies',
      founderId: founder,
    });
    const slice = ctx.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    assert.ok(slice, 'slice renders for the matching long memory');
    assert.ok(slice.content.includes('[TRUNCATED]'), 'overflow content is truncated, not silently dropped');
    assert.ok(slice.content.length <= 1200 + 5, `container stays within the 1200-char personalMind budget (got ${slice.content.length})`);
    assert.ok(slice.content.trimEnd().endsWith('</personal_memory_context>'), 'closing tag always emitted');
    const closers = slice.content.match(/<\/personal_memory_context>/g) || [];
    assert.strictEqual(closers.length, 1, 'exactly one renderer-owned container close');
    assert.ok(
      slice.content.includes('<personal_memory_context type="untrusted_personal_interaction_data">'),
      'untrusted-data container present'
    );
  });

  await runTest('C14: Personal Mind retrieval cannot cross into Company Brain authority (either direction)', async () => {
    const founder = `founder_m4c_brain_${randomUUID().slice(0, 8)}`;
    const personalMark = `M4C-PERSONAL-${randomUUID().slice(0, 8)}`;
    const companyMark = `M4C-COMPANY-${randomUUID().slice(0, 8)}`;

    const knowledgeStore = CompanyKnowledgeStore.getInstance();
    const knowledgeBefore = await knowledgeStore.getAllKnowledge();

    // Company knowledge item whose content matches the company-side query.
    await knowledgeStore.addKnowledge({
      id: `know-m4c-${randomUUID().slice(0, 8)}`,
      documentId: 'M4C-KW-001',
      title: 'Zephyrblue Operating Protocol',
      category: 'sop',
      version: '1.0.0',
      summary: `Zephyrblue operating protocol summary. ${companyMark}`,
      content: `Zephyrblue operating protocol details. ${companyMark}`,
      tags: ['zephyrblue'],
      applicableDepartments: ['coo'],
      authorAuthority: 'Founder',
      lastVerifiedDate: '2026-01-01',
      isDurableReference: true,
    });

    // Personal memory with NO zephyrblue token (no lexical match to the
    // company-side query).
    await store.createMemory({
      founderId: founder,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `Founder prefers afternoon check-ins. ${personalMark}`,
      provenance: 'founder_direct',
      confidence: 0.8,
    });

    try {
      // (a) Query matching COMPANY data only: company content renders in ITS
      //     own slice; the personal slice never absorbs company content.
      const companyCtx = await SophiaContextAssembler.assemble({
        message: 'What is the zephyrblue protocol?',
        founderId: founder,
      });
      const companySlice = companyCtx.slices.find((s) => s.authority === 'COMPANY_KNOWLEDGE');
      assert.ok(companySlice, 'Company Brain retrieval still works (unchanged)');
      assert.ok(companySlice.content.includes(companyMark), 'company content renders in its own COMPANY_KNOWLEDGE slice');

      const personalSlice = companyCtx.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
      assert.ok(personalSlice, 'personal-mind slice renders (fallback — no personal match)');
      assert.ok(personalSlice.content.includes(personalMark), 'personal memory renders in the personal slice');
      assert.ok(
        !personalSlice.content.includes(companyMark),
        'company knowledge NEVER enters the Personal Mind container — retrieval stays inside the Personal Mind boundary'
      );
      assert.ok(
        !companyCtx.slices.some((s) => s.authority !== 'PERSONAL_MIND_MEMORY' && s.content.includes(personalMark)),
        'personal content never enters any Company Brain slice'
      );

      // (b) Query matching the PERSONAL memory: personal selection works and
      //     no company store absorbed personal content (no promotion).
      const personalCtx = await SophiaContextAssembler.assemble({
        message: 'Tell me about afternoon check-ins',
        founderId: founder,
      });
      const personalSlice2 = personalCtx.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
      assert.ok(personalSlice2 && personalSlice2.content.includes(personalMark), 'matching personal memory renders in its own slice');

      const knowledgeAfter = await knowledgeStore.getAllKnowledge();
      assert.strictEqual(knowledgeAfter.length, knowledgeBefore.length + 1, 'no personal→company knowledge promotion');
      assert.ok(
        !knowledgeAfter.some((k) => (k.content || '').includes(personalMark) || (k.summary || '').includes(personalMark)),
        'personal content never appears in company knowledge'
      );
      // The company item is untouched by the personal-side query.
      const item = knowledgeAfter.find((k) => k.documentId === 'M4C-KW-001');
      assert.ok(item && item.content.includes(companyMark), 'company item intact');
    } finally {
      // Restore the company knowledge snapshot (suite hygiene).
      await knowledgeStore.setKnowledge([...knowledgeBefore]);
    }
  });

  await runTest('C15: the assembly call site threads the CURRENT founder message into the selection path', async () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/server/sophia/context-assembly.ts'),
      'utf-8'
    );
    assert.ok(
      /selectPersonalMindMemories\(activeMemories,\s*opts\.message\)/.test(source),
      'assemble() passes opts.message (the current founder message) into the selection'
    );
    assert.ok(
      /import \{ CompanyKnowledgeStore, extractTokens \} from '\.\.\/knowledge\/knowledge-store'/.test(source),
      'the selection reuses the CompanyKnowledgeStore tokenizer (no second framework)'
    );
    assert.ok(
      /import \{ CompanyMemoryStore \} from '\.\.\/memory\/memory-store'/.test(source),
      'Company Brain retrieval imports are unchanged (no behavior change there)'
    );
  });

  // =========================================================================
  // CLEANUP
  // =========================================================================
  if (dbAvailable) {
    await (prisma as any).sophiaMemory.deleteMany({
      where: { founderId: { startsWith: 'founder_m4c_' } },
    }).catch(() => {});
  }
  store.clearForTests();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log('\n======================================================');
  console.log(`M4-C QUERY-CONDITIONED RETRIEVAL SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('M4-C suite crashed:', err);
  process.exit(1);
});
