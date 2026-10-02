import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  resetDurableState,
  seedBenchmarkUniverse,
} from '../../benchmark/memory-retrieval/seed';
import {
  computeChangeWindow,
  detectTemporalIntent,
  isRetiredKnowledgeText,
  parseWindowDuration,
} from '../../src/lib/server/retrieval/temporal-semantics';
import { EpistemicClaimStore } from '../../src/lib/server/epistemic/claim-store';
import { CompanyKnowledgeStore } from '../../src/lib/server/knowledge/knowledge-store';
import { ConversationStore } from '../../src/lib/server/conversation/store';
import { SophiaContextAssembler } from '../../src/lib/server/sophia';
import { SophiaMemoryStore } from '../../src/lib/server/sophia/personal-memory-store';
import type { SophiaContextSlice } from '../../src/lib/server/sophia/types';

/**
 * ============================================================================
 * M5.2 — RETRIEVAL HYGIENE TEST SUITE
 * ============================================================================
 * Pins the deterministic M5.2 retrieval-contract fixes (and the M4 governance
 * invariants they must preserve) that the M5.1 benchmark measured as gaps:
 *
 *   T1..T5   temporal-semantics pure functions (intent precedence, window
 *            parsing, retired-marker asymmetry, data-anchored windows)
 *   F1..F4   EpistemicClaimStore.queryFacts (conditioned, superseded-aware,
 *            lifecycle authority unchanged, deterministic order)
 *   K1..K3   queryKnowledge (authoritative read routing, CURRENT-intent
 *            currentness ranking, retired docs stay retrievable)
 *   E1..E4   ConversationStore.searchConversations (founder scoping, fold
 *            symmetry, determinism, conversation boundaries)
 *   A1..A9   end-to-end assemble() over the full benchmark universe:
 *            SUPERSEDED_FACT projection, CHANGE_RECORD window enumeration
 *            (incl. forbidden out-of-window exclusions), EPISODIC_MEMORY
 *            slice, decision visibility, two-tier facts fill, personal-mind
 *            type-token conditioning, and the governance invariants
 *            (no superseded fact under CANONICAL_FACT; no personal evidence
 *            under truth-bearing authority).
 *
 * ISOLATION: the suite runs in a dedicated scratch directory (chdir before
 * any store singleton constructs — the same contract the M5.1 CLI uses), so
 * it can never pollute the repository's .data state.
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

function sliceBy(slices: SophiaContextSlice[], authority: string): SophiaContextSlice | undefined {
  return slices.find((s) => s.authority === authority);
}

async function main(): Promise<void> {
  console.log('\n======================================================');
  console.log('M5.2 RETRIEVAL HYGIENE SUITE');
  console.log('======================================================\n');

  // ISOLATION: scratch data dir before any store singleton constructs.
  const scratch = path.join(os.tmpdir(), 'samjuniors-m52-tests');
  fs.mkdirSync(scratch, { recursive: true });
  process.chdir(scratch);
  resetDurableState();
  const seed = await seedBenchmarkUniverse();

  // =========================================================================
  // T — TEMPORAL SEMANTICS (pure functions)
  // =========================================================================

  await runTest('T1: temporal intent precedence — window > current > history > unspecified', () => {
    // Window cues win even alongside currentness words.
    assert.strictEqual(detectTemporalIntent('What changed right now in company strategy?').intent, 'window');
    assert.strictEqual(detectTemporalIntent('What changed in company strategy during the last 3 months?').intent, 'window');
    assert.strictEqual(detectTemporalIntent("what's new these days").intent, 'window');
    assert.strictEqual(detectTemporalIntent('recent changes to pricing').intent, 'window');
    // Current beats history: a message quoting both sides of a supersession
    // asks for the CURRENT answer (the M5.1 BQ5a shape).
    assert.strictEqual(
      detectTemporalIntent(
        'I previously said the Lumora Starter tier costs $29 per month, later we changed it. What is the currently true price?'
      ).intent,
      'current'
    );
    assert.strictEqual(detectTemporalIntent('Tell me everything relevant to Lumora right now.').intent, 'current');
    assert.strictEqual(detectTemporalIntent('How do I want strategy updates delivered these days?').intent, 'current');
    // Pure history questions carry no currentness cue.
    assert.strictEqual(detectTemporalIntent('What was our previous Lumora pricing strategy?').intent, 'history');
    assert.strictEqual(detectTemporalIntent('When did we move Lumora to value-based pricing?').intent, 'history');
    assert.strictEqual(detectTemporalIntent('We used to invoice quarterly.').intent, 'history');
    // No cue → unspecified (A0 ranking semantics apply).
    assert.strictEqual(detectTemporalIntent('Which services depend on the Helix Identity Store?').intent, 'unspecified');
    assert.strictEqual(detectTemporalIntent('Summarize the on-call rotation.').intent, 'unspecified');
  });

  await runTest('T2: window duration parsing is deterministic', () => {
    assert.strictEqual(parseWindowDuration('during the last 3 months')?.months, 3);
    assert.strictEqual(parseWindowDuration('over the past two weeks')?.months, 14 / 30);
    assert.strictEqual(parseWindowDuration('in the last few months')?.months, 3);
    assert.strictEqual(parseWindowDuration('last 2 quarters')?.months, 6);
    assert.strictEqual(parseWindowDuration('what changed recently'), null);
  });

  await runTest('T3: the retired-knowledge marker is asymmetric (successor stays current)', () => {
    // Passive markers → retired.
    assert.ok(isRetiredKnowledgeText('Lumora Pricing v1', 'Previous pricing', 'Retired 2026-09-02 when the company moved on.'));
    assert.ok(isRetiredKnowledgeText('Old doc', 'This document was superseded by SOP-2.', 'body'));
    assert.ok(isRetiredKnowledgeText('Doc', 'deprecated', ''));
    // The ACTIVE verb (this doc supersedes another) does NOT mark it retired.
    assert.ok(
      !isRetiredKnowledgeText(
        'Lumora Pricing Policy (Value-Based, v2)',
        'Current Lumora pricing: value-based tiers.',
        'Approved 2026-09-02. Supersedes the cost-plus policy documented in v1.'
      )
    );
    assert.ok(!isRetiredKnowledgeText('Nimbus Gateway Runbook', 'Operational runbook.', 'restart procedure'));
  });

  await runTest('T4: the change window is data-anchored when events postdate the clock', () => {
    const wall = Date.parse('2025-06-10T00:00:00.000Z');
    const latest = Date.parse('2026-09-12T00:00:00.000Z');
    const anchored = computeChangeWindow(wall, latest, 3);
    assert.strictEqual(anchored.windowToMs, latest, 'the newest recorded event anchors the window');
    // ~3 months earlier (90 days).
    assert.ok(Math.abs(anchored.windowFromMs - Date.parse('2026-06-14T00:00:00.000Z')) < 24 * 60 * 60 * 1000);
    // Wall clock wins when it is newer than every recorded event.
    const wallNewer = Date.parse('2026-12-01T00:00:00.000Z');
    const wallAnchored = computeChangeWindow(wallNewer, latest, 3);
    assert.strictEqual(wallAnchored.windowToMs, wallNewer);
  });

  await runTest('T5: intent detection is stable (deterministic) across repeats', () => {
    const msg = 'What is the currently true Lumora price, not the previous one?';
    const first = detectTemporalIntent(msg);
    for (let i = 0; i < 25; i++) {
      assert.deepStrictEqual(detectTemporalIntent(msg), first);
    }
  });

  // =========================================================================
  // F — QUERY-CONDITIONED CANONICAL FACTS (EpistemicClaimStore.queryFacts)
  // =========================================================================

  const claimStore = EpistemicClaimStore.getInstance();

  await runTest('F1: queryFacts is query-conditioned over the shared lexical pipeline', async () => {
    const hits = await claimStore.queryFacts({ queryText: 'What was our previous Lumora pricing strategy?', limit: 3 });
    assert.ok(hits.length > 0, 'lexically matching facts retrieve');
    assert.ok(
      hits.every((f) => /lumora/i.test(f.statement) || /lumora/i.test(f.subject)),
      'only facts sharing tokens with the query retrieve'
    );
  });

  await runTest('F2: includeSuperseded reaches historical facts WITHOUT touching lifecycle state', async () => {
    const activeOnly = await claimStore.queryFacts({ queryText: 'previous Lumora pricing', limit: 5 });
    assert.ok(activeOnly.every((f) => f.validityState === 'active'), 'default pool is active-only');
    assert.ok(!activeOnly.some((f) => f.id === 'fact-lumora-price-29'), 'the superseded $29 fact is excluded by default');

    const withHistory = await claimStore.queryFacts({ queryText: 'previous Lumora pricing', limit: 5, includeSuperseded: true });
    const old = withHistory.find((f) => f.id === 'fact-lumora-price-29');
    assert.ok(old, 'history intent reaches the superseded fact');
    assert.strictEqual(old!.validityState, 'superseded', 'lifecycle state is unchanged by retrieval');
    assert.strictEqual(old!.supersededById, 'fact-lumora-price-49', 'the successor pointer is preserved');
    // listActiveFacts still excludes it — lifecycle authority untouched.
    const listed = await claimStore.listActiveFacts();
    assert.ok(!listed.some((f) => f.id === 'fact-lumora-price-29'));
    const all = await claimStore.listAllFacts();
    assert.ok(all.some((f) => f.id === 'fact-lumora-price-29' && f.validityState === 'superseded'));
  });

  await runTest('F3: zero-overlap queries return nothing (the caller owns the fallback)', async () => {
    const hits = await claimStore.queryFacts({ queryText: 'xylophone rehearsal schedule' });
    assert.strictEqual(hits.length, 0);
  });

  await runTest('F4: fact ranking is deterministic (score DESC, promotedAt DESC, id ASC)', async () => {
    const a = await claimStore.queryFacts({ queryText: 'Lumora pricing', limit: 10, includeSuperseded: true });
    const b = await claimStore.queryFacts({ queryText: 'Lumora pricing', limit: 10, includeSuperseded: true });
    assert.deepStrictEqual(a.map((f) => f.id), b.map((f) => f.id), 'identical inputs → identical order');
    // Both pricing facts tie on score (lumora + pricing); the newer promotion
    // (the $49 successor, 2026-09-10) must precede the older ($29, 2026-06-15).
    const ids = a.map((f) => f.id);
    assert.ok(ids.indexOf('fact-lumora-price-49') < ids.indexOf('fact-lumora-price-29'));
  });

  // =========================================================================
  // K — KNOWLEDGE CURRENTNESS + AUTHORITATIVE ROUTING
  // =========================================================================

  const knowledge = CompanyKnowledgeStore.getInstance();

  await runTest('K1: queryKnowledge routes through the authoritative read (getAllKnowledge)', async () => {
    // Spy on getAllKnowledge: if queryKnowledge no longer consults it, the
    // marker item below can never appear in the results.
    const marker = {
      id: 'know-m52-routing-marker',
      documentId: 'M52-ROUTING-MARKER',
      title: 'M52 routing marker zzqplm',
      category: 'sop' as const,
      version: '1.0.0',
      summary: 'zzqplm routing marker summary',
      content: 'zzqplm routing marker content',
      tags: ['zzqplm'],
      applicableDepartments: ['council' as const],
      authorAuthority: 'Test',
      lastVerifiedDate: '2026-09-01',
      isDurableReference: true as const,
    };
    const original = knowledge.getAllKnowledge.bind(knowledge);
    try {
      (knowledge as any).getAllKnowledge = async () => [marker];
      const hits = await knowledge.queryKnowledge({ queryText: 'zzqplm routing marker', limit: 5 });
      assert.ok(
        hits.some((h) => h.knowledgeId === 'know-m52-routing-marker'),
        'queryKnowledge must score the getAllKnowledge() candidate set, not a private cache'
      );
    } finally {
      (knowledge as any).getAllKnowledge = original;
    }
    // And without the spy, the marker (never persisted) is gone.
    const after = await knowledge.queryKnowledge({ queryText: 'zzqplm routing marker', limit: 5 });
    assert.ok(!after.some((h) => h.knowledgeId === 'know-m52-routing-marker'));
  });

  await runTest('K2: CURRENT intent demotes the retired document below the current one', async () => {
    // The M5.1-measured inversion: for BQ5a the retired v1 outscored the
    // current v2 ($29 lexical anchor). Under a CURRENT intent v2 must rank
    // first; under history/unspecified the pre-M5.2 score order holds.
    const current = await knowledge.queryKnowledge({
      queryText:
        'I previously said the Lumora Starter tier costs $29 per month, later we changed it. What is the currently true price?',
      limit: 6,
    });
    assert.strictEqual(current[0]?.documentId, 'SOP-LUMORA-PRICING-V2', 'current doc first for a currently-true question');
    const v1Index = current.findIndex((h) => h.documentId === 'SOP-LUMORA-PRICING-V1');
    assert.ok(v1Index > 0, 'the retired doc still retrieves within a widened window (labeled, not hidden)');
    assert.ok(
      current.slice(0, v1Index).every((h) => h.documentId !== 'SOP-LUMORA-PRICING-V1'),
      'the retired doc ranks below every non-retired match under CURRENT intent (the A0 inversion is fixed)'
    );

    const history = await knowledge.queryKnowledge({
      queryText: 'What was our previous Lumora pricing strategy?',
      limit: 2,
    });
    assert.strictEqual(history[0]?.documentId, 'SOP-LUMORA-PRICING-V1', 'history keeps the A0 order (v1 is the better lexical match)');
  });

  await runTest('K3: no currentness cue → the exact pre-M5.2 ranking (A0 semantics)', async () => {
    // Pure score order with NO temporal cue: v1 mentions Lumora more often
    // than v2 (the A0 BQ4 measurement: v1=11 vs v2=9) and must rank first,
    // proving the currentness demotion is strictly intent-gated.
    const hits = await knowledge.queryKnowledge({ queryText: 'Tell me everything relevant to Lumora', limit: 6 });
    assert.strictEqual(hits[0]?.documentId, 'SOP-LUMORA-PRICING-V1');
  });

  // =========================================================================
  // E — EPISODIC RETRIEVAL (ConversationStore.searchConversations)
  // =========================================================================

  const conversations = ConversationStore.getInstance();

  await runTest('E1: episodic search is founder-scoped', async () => {
    const forA = await conversations.searchConversations(seed.founderA, 'Why did we abandon the microservices refactor?', 3);
    assert.ok(forA.some((h) => h.conversationId === 'conv-m51-episodic'));
    const forB = await conversations.searchConversations(seed.founderB, 'Why did we abandon the microservices refactor?', 3);
    assert.strictEqual(forB.length, 0, 'another founder can never retrieve this conversation');
  });

  await runTest('E2: the fold is symmetric — "abandon" matches "abandoning" (the BQ6b anaphora case)', async () => {
    const hits = await conversations.searchConversations(seed.founderA, 'Why did we abandon that approach?', 3);
    assert.ok(
      hits.some((h) => h.conversationId === 'conv-m51-episodic'),
      'the folded token must reach the conversation that only contains "abandoning"'
    );
  });

  await runTest('E3: episodic search is deterministic and rank-stable', async () => {
    const a = await conversations.searchConversations(seed.founderA, 'microservices refactor Aurorium', 3);
    const b = await conversations.searchConversations(seed.founderA, 'microservices refactor Aurorium', 3);
    assert.deepStrictEqual(
      a.map((h) => [h.conversationId, h.score]),
      b.map((h) => [h.conversationId, h.score])
    );
  });

  await runTest('E4: hits preserve conversation boundaries and chronological message order', async () => {
    const hits = await conversations.searchConversations(seed.founderA, 'microservices refactor Aurorium', 3);
    const hit = hits.find((h) => h.conversationId === 'conv-m51-episodic')!;
    assert.ok(hit.title === 'Aurorium refactor check-in');
    const times = hit.matchedMessages.map((m) => Date.parse(m.createdAt));
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] >= times[i - 1], 'matched messages render chronologically');
    }
    assert.ok(hit.matchedMessages.every((m) => m.conversationId === 'conv-m51-episodic'));
  });

  // =========================================================================
  // A — END-TO-END ASSEMBLY (the canonical turn path over the fixture universe)
  // =========================================================================

  await runTest('A1: HISTORY intent renders the superseded fact as SUPERSEDED_FACT — never as current truth', async () => {
    const assembled = await SophiaContextAssembler.assemble({
      message: 'What was our previous Lumora pricing strategy?',
      founderId: seed.founderA,
    });
    const historical = sliceBy(assembled.slices, 'SUPERSEDED_FACT');
    assert.ok(historical, 'the historical projection renders for a history question');
    assert.ok(historical!.content.includes('fact-lumora-price-29'), 'the $29 fact renders');
    assert.ok(historical!.content.includes('fact-lumora-price-49'), 'the successor pointer renders');
    // GOVERNANCE: the fact appears NOWHERE under a truth-bearing authority.
    const truthBearers = ['CANONICAL_FACT', 'AUTHORITATIVE_OPERATIONAL_STATE', 'COMPANY_KNOWLEDGE'];
    for (const slice of assembled.slices) {
      if (truthBearers.includes(slice.authority)) {
        assert.ok(!slice.content.includes('fact-lumora-price-29'), `superseded fact leaked into ${slice.authority}`);
      }
    }
    // And the CURRENT fact still renders as canonical truth.
    const canonical = sliceBy(assembled.slices, 'CANONICAL_FACT');
    assert.ok(canonical?.content.includes('fact-lumora-price-49'));
  });

  await runTest('A2: CURRENT intent ranks the current knowledge doc first; retired docs render HISTORICAL-labeled', async () => {
    const assembled = await SophiaContextAssembler.assemble({
      message:
        'I previously said the Lumora Starter tier costs $29 per month, later we changed it. What is the currently true price?',
      founderId: seed.founderA,
    });
    const knowledgeSlice = sliceBy(assembled.slices, 'COMPANY_KNOWLEDGE')!;
    assert.ok(knowledgeSlice, 'knowledge slice renders');
    const v2Pos = knowledgeSlice.content.indexOf('SOP-LUMORA-PRICING-V2');
    assert.ok(v2Pos !== -1, 'the current doc renders first for a currently-true question (the M5.1 inversion is fixed)');
    const v1Pos = knowledgeSlice.content.indexOf('SOP-LUMORA-PRICING-V1');
    if (v1Pos !== -1) {
      assert.ok(v2Pos < v1Pos, 'a retired doc never renders above the current one under CURRENT intent');
      assert.ok(
        /SOP-LUMORA-PRICING-V1[^\n]*\[HISTORICAL/.test(knowledgeSlice.content),
        'a retired doc that renders carries the explicit HISTORICAL label'
      );
    }
    // The HISTORICAL render label is guaranteed on the history path, where
    // the retired doc legitimately ranks first.
    const historyAssembled = await SophiaContextAssembler.assemble({
      message: 'What was our previous Lumora pricing strategy?',
      founderId: seed.founderA,
    });
    const historySlice = sliceBy(historyAssembled.slices, 'COMPANY_KNOWLEDGE')!;
    assert.ok(
      /SOP-LUMORA-PRICING-V1[^\n]*\[HISTORICAL/.test(historySlice.content),
      'the retired doc renders with an explicit HISTORICAL label when it legitimately retrieves'
    );
  });

  await runTest('A3: WINDOW intent enumerates the change set and excludes out-of-window records', async () => {
    const assembled = await SophiaContextAssembler.assemble({
      message: 'What changed in company strategy during the last 3 months?',
      founderId: seed.founderA,
    });
    const change = sliceBy(assembled.slices, 'CHANGE_RECORD');
    assert.ok(change, 'the change record renders for a window question');
    // In-window gold.
    for (const needle of [
      'fact-lumora-price-49',   // active fact promoted in window
      'fact-lumora-price-29',   // superseded pair (successor promoted in window)
      'PREC-01', 'PREC-02', 'PREC-03', 'PREC-04', 'PREC-06', // in-window precedents
      'SOP-LUMORA-PRICING-V2',  // current doc verified in window
      'dec-pricing-value-based', // in-window decision
    ]) {
      assert.ok(change!.content.includes(needle), `in-window gold ${needle} must enumerate`);
    }
    // FORBIDDEN (out-of-window) records must NOT appear ANYWHERE.
    for (const slice of assembled.slices) {
      assert.ok(!slice.content.includes('PREC-05'), `out-of-window precedent leaked into ${slice.authority}`);
      assert.ok(!slice.content.includes('dec-office-lease'), `out-of-window decision leaked into ${slice.authority}`);
    }
    // The superseded fact renders only as labeled history in the change block.
    assert.ok(change!.content.includes('SUPERSEDED'));
    // The state slice renders NO lexically-matched decisions for window queries.
    const state = sliceBy(assembled.slices, 'AUTHORITATIVE_OPERATIONAL_STATE')!;
    assert.ok(!state.content.includes('Decision ['), 'window queries get decisions only via the date-filtered change record');
  });

  await runTest('A4: the episodic slice renders as advisory EPISODIC_MEMORY (founder-scoped, match-gated)', async () => {
    const assembled = await SophiaContextAssembler.assemble({
      message: 'Why did we abandon the microservices refactor for Aurorium?',
      founderId: seed.founderA,
    });
    const episodic = sliceBy(assembled.slices, 'EPISODIC_MEMORY');
    assert.ok(episodic, 'a matching episodic query renders the past conversation');
    assert.ok(episodic!.content.includes('conv-m51-episodic'));
    assert.ok(episodic!.content.includes('coordination overhead'), 'the rationale text renders');

    // No match → no slice.
    const unmatched = await SophiaContextAssembler.assemble({
      message: 'What is SamJuniors current financial state?',
      founderId: seed.founderA,
    });
    assert.ok(!sliceBy(unmatched.slices, 'EPISODIC_MEMORY'), 'non-matching queries render no episodic slice');

    // No founder → no slice (founder scoping is structural).
    const anonymous = await SophiaContextAssembler.assemble({
      message: 'Why did we abandon the microservices refactor for Aurorium?',
    });
    assert.ok(!sliceBy(anonymous.slices, 'EPISODIC_MEMORY'), 'no founder principal → no episodic retrieval');
  });

  await runTest('A5: decisions render query-matched under AUTHORITATIVE_OPERATIONAL_STATE', async () => {
    const assembled = await SophiaContextAssembler.assemble({
      message: 'Which projects depend on the value-based pricing decision?',
      founderId: seed.founderA,
    });
    const state = sliceBy(assembled.slices, 'AUTHORITATIVE_OPERATIONAL_STATE')!;
    assert.ok(
      state.content.includes('Decision [dec-pricing-value-based]'),
      'the matching decision renders in the state slice'
    );
    assert.ok(!state.content.includes('dec-office-lease'), 'unmatched decisions do not render');

    const unmatched = await SophiaContextAssembler.assemble({
      message: 'Summarize the xylophone rehearsal schedule.',
      founderId: seed.founderA,
    });
    const unmatchedState = sliceBy(unmatched.slices, 'AUTHORITATIVE_OPERATIONAL_STATE')!;
    assert.ok(!unmatchedState.content.includes('Decision ['), 'zero-match queries render no decisions');
  });

  await runTest('A6: the facts slice is two-tier — matches first, newest-active fill, A0 fallback', async () => {
    // Matching query: the financial fact matches via its subject tokens and
    // must rank first; the remaining slots fill with the newest active facts.
    const assembled = await SophiaContextAssembler.assemble({
      message: 'What is SamJuniors current financial state?',
      founderId: seed.founderA,
    });
    const canonical = sliceBy(assembled.slices, 'CANONICAL_FACT')!;
    const finPos = canonical.content.indexOf('fact-burn-runway');
    assert.ok(finPos !== -1, 'the financial fact renders');
    const curPos = canonical.content.indexOf('fact-lumora-price-49');
    assert.ok(curPos !== -1, 'the successor fills (supersession breadth preserved)');
    assert.ok(finPos < curPos, 'the query match ranks first');

    // Zero-match query: the exact A0 projection (3 newest active facts).
    const fallback = await SophiaContextAssembler.assemble({
      message: 'Summarize the xylophone rehearsal schedule.',
      founderId: seed.founderA,
    });
    const fallbackSlice = sliceBy(fallback.slices, 'CANONICAL_FACT')!;
    for (const needle of ['fact-burn-runway', 'fact-lumora-price-49', 'fact-auth-helix-dependency']) {
      assert.ok(fallbackSlice.content.includes(needle), `A0 fallback renders the newest active facts (${needle})`);
    }
    assert.ok(!fallbackSlice.content.includes('fact-nimbus-auth-dependency'), 'the 4th-newest is still cut at the A0 window of 3');
  });

  await runTest('A7: personal-mind type-token conditioning — "communication preferences" reaches COMMUNICATION_PREFERENCE memories in tier 1', async () => {
    const pool = await SophiaMemoryStore.getInstance().listAllMemories(seed.founderA, { active: true });
    // Direct selection policy check (the canonical slice-6B path).
    const { selectPersonalMindMemories } = await import('../../src/lib/server/sophia/context-assembly');
    const selected = selectPersonalMindMemories(pool, 'What are my communication preferences right now?');
    const idToKey = new Map([...seed.personalIdByKey.entries()].map(([k, v]) => [v, k]));
    const keys = selected.map((m) => idToKey.get(m.id) ?? m.id);
    // Both communication-preference memories rank in the matched tier (top 2).
    assert.ok(keys.slice(0, 2).includes('PM-06'), 'PM-06 (dashboard, successor) matches via its type tokens');
    assert.ok(keys.slice(0, 2).includes('PM-02'), 'PM-02 (bullet digests) matches via its type tokens');
    // e2e: the personal mind slice renders at least one of them.
    const assembled = await SophiaContextAssembler.assemble({
      message: 'What are my communication preferences right now?',
      founderId: seed.founderA,
    });
    const personal = sliceBy(assembled.slices, 'PERSONAL_MIND_MEMORY')!;
    assert.ok(
      personal.content.includes('dashboard') || personal.content.includes('bullet-point'),
      'a communication-preference memory renders'
    );
    assert.ok(!personal.content.includes('weekly strategy updates sent by email'), 'the superseded email preference never renders');
  });

  await runTest('A8: governance invariants hold end-to-end — boundary and lifecycle under every intent', async () => {
    const probes: Array<[string, string]> = [
      ['current', 'What is SamJuniors current financial state?'],
      ['history', 'What was our previous Lumora pricing strategy?'],
      ['window', 'What changed in company strategy during the last 3 months?'],
      ['unspecified', 'Which projects depend on the value-based pricing decision?'],
    ];
    const truthBearers = ['CANONICAL_FACT', 'AUTHORITATIVE_OPERATIONAL_STATE', 'COMPANY_KNOWLEDGE'];
    for (const [label, message] of probes) {
      const assembled = await SophiaContextAssembler.assemble({ message, founderId: seed.founderA });
      const personal = sliceBy(assembled.slices, 'PERSONAL_MIND_MEMORY');
      if (personal) {
        // Personal Mind may only render inside its untrusted container —
        // never inside a truth-bearing slice.
        for (const slice of assembled.slices) {
          if (truthBearers.includes(slice.authority)) {
            const pm11 = slice.content.includes('healthier than last year');
            assert.ok(!pm11, `[${label}] personal opinion leaked into ${slice.authority}`);
          }
        }
      }
      // The superseded $29 fact never appears in a truth-bearing slice.
      for (const slice of assembled.slices) {
        if (truthBearers.includes(slice.authority)) {
          assert.ok(!slice.content.includes('fact-lumora-price-29'), `[${label}] superseded fact leaked into ${slice.authority}`);
        }
      }
      // The other founder's records never render anywhere.
      for (const slice of assembled.slices) {
        assert.ok(!slice.content.includes('Slack pings'), `[${label}] founder B data leaked`);
      }
    }
  });

  await runTest('A9: assembly determinism — identical inputs yield byte-identical slices (temporal/episodic paths included)', async () => {
    const message = 'What changed in company strategy during the last 3 months?';
    const a = await SophiaContextAssembler.assemble({ message, founderId: seed.founderA });
    const b = await SophiaContextAssembler.assemble({ message, founderId: seed.founderA });
    assert.strictEqual(a.formattedContext, b.formattedContext);
    const history = 'What was our previous Lumora pricing strategy?';
    const c = await SophiaContextAssembler.assemble({ message: history, founderId: seed.founderA });
    const d = await SophiaContextAssembler.assemble({ message: history, founderId: seed.founderA });
    assert.strictEqual(c.formattedContext, d.formattedContext);
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log('\n==================================================');
  console.log(`M5.2 RETRIEVAL HYGIENE SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');
  if (failed > 0) process.exit(1);
}

void main().catch((err) => {
  console.error(`M5.2 SUITE HARNESS ERROR: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
