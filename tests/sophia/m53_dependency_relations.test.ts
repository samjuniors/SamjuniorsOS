import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  resetDurableState,
  seedBenchmarkUniverse,
} from '../../benchmark/memory-retrieval/seed';
import {
  DEPENDENCY_EXTRACTION_RULE_VERSION,
  MAX_DEPENDENCY_TRAVERSAL_DEPTH,
  collectDependencyFacts,
  detectDependencyIntent,
  extractDependencyRelations,
  knownEntityKeys,
  normalizeEntityKey,
  resolveDependencyAnchors,
  traverseDependents,
} from '../../src/lib/server/retrieval/dependency-relations';
import { DependencyRelationStore } from '../../src/lib/server/retrieval/dependency-relation-store';
import { EpistemicClaimStore } from '../../src/lib/server/epistemic/claim-store';
import { SophiaContextAssembler } from '../../src/lib/server/sophia';
import type { SophiaContextSlice } from '../../src/lib/server/sophia/types';
import type { CanonicalFact } from '../../src/types/epistemic';

/**
 * ============================================================================
 * M5.3-C — EXPLICIT DEPENDENCY RELATIONS TEST SUITE
 * ============================================================================
 * Pins the bounded relational-traversal contract that closes the M5.1 BQ3a
 * 2-hop failure (still with NO graph database):
 *
 *   E1..E6   deterministic extraction (rule dep-rel/1): grammar, entity
 *            normalization, garbage rejection, non-dependency statements
 *   T1..T7   intent detection, anchor resolution (token-subset), bounded
 *            depth-2 reverse traversal, cycle safety, determinism, status
 *            filtering, fail-safe on unresolvable anchors
 *   S1..S4   DependencyRelationStore maintenance (saveFact hook, supersession
 *            status flip, rebuild idempotency, durable collection)
 *   A1..A8   end-to-end assemble(): DEPENDENCY_PATH slice for a Helix-anchored
 *            query, render determinism, fail-safes, and the governance
 *            invariants (active facts only; no superseded statements; no
 *            personal-mind material; company scope by construction)
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

function fact(partial: Partial<CanonicalFact> & { id: string; statement: string }): CanonicalFact {
  return {
    claimId: partial.claimId ?? 'claim-x',
    subject: partial.subject ?? 'test_subject',
    category: partial.category ?? 'architectural',
    validityState: partial.validityState ?? 'active',
    confidence: 'verified_fact',
    promotedAt: partial.promotedAt ?? '2026-01-01T00:00:00.000Z',
    promotedBy: partial.promotedBy ?? 'founder',
    provenance: partial.provenance ?? ({ sourceSystem: 'test' } as any),
    ...partial,
  } as CanonicalFact;
}

function depSlice(slices: SophiaContextSlice[]): SophiaContextSlice | undefined {
  return slices.find((s) => s.label.includes('Dependency'));
}

async function main(): Promise<void> {
  console.log('\n======================================================');
  console.log('M5.3-C DEPENDENCY RELATIONS SUITE');
  console.log('======================================================\n');

  // =========================================================================
  // E — DETERMINISTIC EXTRACTION (pure)
  // =========================================================================

  await runTest('E1: extraction rule version is pinned', () => {
    assert.strictEqual(DEPENDENCY_EXTRACTION_RULE_VERSION, 'dep-rel/1');
  });

  await runTest('E2: the benchmark dependency statements extract exactly one edge each', () => {
    const nimbus = extractDependencyRelations(
      fact({
        id: 'fact-nimbus-auth-dependency',
        statement: 'Nimbus Gateway depends on the Aurorium Auth Service for token verification',
      })
    );
    assert.strictEqual(nimbus.length, 1);
    assert.strictEqual(nimbus[0].sourceEntity, 'nimbus gateway');
    assert.strictEqual(nimbus[0].sourceEntityDisplay, 'Nimbus Gateway');
    assert.strictEqual(nimbus[0].targetEntity, 'aurorium auth service');
    assert.strictEqual(nimbus[0].targetEntityDisplay, 'Aurorium Auth Service');
    assert.strictEqual(nimbus[0].relationType, 'DEPENDS_ON');
    assert.strictEqual(nimbus[0].sourceFactId, 'fact-nimbus-auth-dependency');
    assert.strictEqual(nimbus[0].provenance.extractionRule, 'dep-rel/1');
    assert.ok(nimbus[0].provenance.statementHash.length === 64, 'SHA-256 statement hash pinned');

    const auth = extractDependencyRelations(
      fact({
        id: 'fact-auth-helix-dependency',
        statement: 'Aurorium Auth Service depends on the Helix Identity Store for credential storage',
      })
    );
    assert.strictEqual(auth.length, 1);
    assert.strictEqual(auth[0].sourceEntity, 'aurorium auth service');
    assert.strictEqual(auth[0].targetEntity, 'helix identity store');
  });

  await runTest('E3: extraction is deterministic (same input, same output) and statement-hash binds the input', () => {
    const f = fact({ id: 'f1', statement: 'Nimbus Gateway depends on the Helix Identity Store' });
    const a = extractDependencyRelations(f);
    const b = extractDependencyRelations(f);
    assert.deepStrictEqual(a, b);
    const changed = extractDependencyRelations(fact({ id: 'f1', statement: 'Nimbus Gateway depends on the Helix Identity Store for audits' }));
    assert.notStrictEqual(changed[0].provenance.statementHash, a[0].provenance.statementHash);
  });

  await runTest('E4: non-dependency and garbage statements extract NOTHING', () => {
    const cases = [
      'Company monthly burn rate is $34,000 with 14 months of runway',
      'Lumora Starter tier costs $49 per month',
      'The pricing team depends on the numbers', // lowercase generic entities
      'We depend on each other', // no proper-noun object
      'Nimbus Gateway depends on the aurorium auth service for token verification', // lowercase target (not entity-like)
      'Depends on everything', // no source
    ];
    for (const statement of cases) {
      assert.deepStrictEqual(
        extractDependencyRelations(fact({ id: 'x', statement })), [],
        `statement must extract nothing: ${statement}`
      );
    }
  });

  await runTest('E5: only the FIRST sentence is considered; purpose clause is cut', () => {
    const out = extractDependencyRelations(
      fact({
        id: 'x',
        statement:
          'Nimbus Gateway depends on the Helix Identity Store for credential storage. Everything else is context.',
      })
    );
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].targetEntityDisplay, 'Helix Identity Store');
  });

  await runTest('E6: entity key normalization uses the shared tokenizer', () => {
    assert.strictEqual(normalizeEntityKey('The Helix Identity Store'), 'helix identity store');
    assert.strictEqual(normalizeEntityKey('  Aurorium   Auth  Service '), 'aurorium auth service');
  });

  // =========================================================================
  // T — INTENT / ANCHORS / BOUNDED TRAVERSAL (pure)
  // =========================================================================

  const edgeNimbus = {
    id: 'rel-nimbus',
    sourceEntity: 'nimbus gateway',
    targetEntity: 'aurorium auth service',
    relationType: 'DEPENDS_ON' as const,
    sourceFactId: 'fact-nimbus-auth-dependency',
  };
  const edgeAuth = {
    id: 'rel-auth',
    sourceEntity: 'aurorium auth service',
    targetEntity: 'helix identity store',
    relationType: 'DEPENDS_ON' as const,
    sourceFactId: 'fact-auth-helix-dependency',
  };
  const edges = [edgeNimbus, edgeAuth];

  await runTest('T1: dependency intent detection (cue list, deterministic)', () => {
    assert.deepStrictEqual(detectDependencyIntent('Which services depend on the Helix Identity Store?'), { intent: true, cues: ['depend on'] });
    assert.strictEqual(detectDependencyIntent('What does the pricing decision rely on?').intent, true);
    assert.strictEqual(detectDependencyIntent('Tell me everything relevant to Lumora right now.').intent, false);
    assert.strictEqual(detectDependencyIntent('What changed in company strategy?').intent, false);
    assert.deepStrictEqual(detectDependencyIntent(''), { intent: false, cues: [] });
  });

  await runTest('T2: anchors resolve by token-subset (longest first); unresolvable → none', () => {
    const keys = knownEntityKeys(edges);
    assert.deepStrictEqual(keys, ['aurorium auth service', 'helix identity store', 'nimbus gateway']);
    const anchors = resolveDependencyAnchors('Which services depend on the Helix Identity Store?', keys);
    assert.deepStrictEqual(anchors, ['helix identity store']);
    // BQ3b: no entity is a token subset of the value-based-pricing query.
    const none = resolveDependencyAnchors('Which projects depend on the value-based pricing decision?', keys);
    assert.deepStrictEqual(none, []);
    // Multi-token entities require ALL tokens present.
    const partial = resolveDependencyAnchors('Which services depend on the Helix Store?', keys);
    assert.deepStrictEqual(partial, [], 'partial token overlap is not an anchor');
  });

  await runTest('T3: bounded reverse traversal reaches depth 2 (dependents-of), not beyond', () => {
    const hops = traverseDependents(['helix identity store'], edges);
    assert.strictEqual(hops.length, 2);
    assert.strictEqual(hops[0].fromKey, 'aurorium auth service');
    assert.strictEqual(hops[0].toKey, 'helix identity store');
    assert.strictEqual(hops[0].depth, 1);
    assert.strictEqual(hops[0].viaRelationIds[0], 'rel-auth');
    assert.strictEqual(hops[1].fromKey, 'nimbus gateway');
    assert.strictEqual(hops[1].depth, 2);
    // The depth bound is the benchmark-evidenced 2.
    assert.strictEqual(MAX_DEPENDENCY_TRAVERSAL_DEPTH, 2);
  });

  await runTest('T4: traversal is cycle-safe and deterministic', () => {
    const cyclic = [
      { id: 'r1', sourceEntity: 'a', targetEntity: 'b', relationType: 'DEPENDS_ON' as const, sourceFactId: 'f1' },
      { id: 'r2', sourceEntity: 'b', targetEntity: 'a', relationType: 'DEPENDS_ON' as const, sourceFactId: 'f2' },
    ];
    const hops = traverseDependents(['a'], cyclic, 4);
    assert.strictEqual(hops.filter((h) => h.fromKey === 'b' && h.toKey === 'a').length, 1, 'no edge duplication under cycles');
    const again = traverseDependents(['a'], cyclic, 4);
    assert.deepStrictEqual(hops, again, 'deterministic');
  });

  await runTest('T5: anchored traversal from the middle of the chain also works (1 hop from Aurorium)', () => {
    const hops = traverseDependents(['aurorium auth service'], edges);
    assert.strictEqual(hops.length, 1);
    assert.strictEqual(hops[0].fromKey, 'nimbus gateway');
    assert.strictEqual(hops[0].depth, 1);
  });

  await runTest('T6: collectDependencyFacts orders by evidence depth, active facts only', () => {
    const hops = traverseDependents(['helix identity store'], edges);
    const facts = [
      fact({
        id: 'fact-auth-helix-dependency',
        statement: 'Aurorium Auth Service depends on the Helix Identity Store for credential storage',
        promotedAt: '2026-08-22T09:00:00.000Z',
      }),
      fact({
        id: 'fact-nimbus-auth-dependency',
        statement: 'Nimbus Gateway depends on the Aurorium Auth Service for token verification',
        promotedAt: '2026-08-20T09:00:00.000Z',
      }),
      fact({
        id: 'fact-superseded-dep',
        statement: 'Legacy Gateway depends on the Aurorium Auth Service for token verification',
        promotedAt: '2026-01-01T00:00:00.000Z',
        validityState: 'superseded',
      }),
      fact({ id: 'fact-unrelated', statement: 'Company burn rate is stable' }),
    ];
    const collected = collectDependencyFacts(hops, ['helix identity store'], facts);
    assert.deepStrictEqual(collected.map((f) => f.id), [
      'fact-auth-helix-dependency',
      'fact-nimbus-auth-dependency',
    ], 'direct-dependency evidence first, then the transitive; superseded and unrelated excluded');
  });

  await runTest('T7: status filtering is the CALLER\'s lifecycle rule (only active edges traverse)', () => {
    const active = [edgeNimbus, { ...edgeAuth }];
    const stale = [{ ...edgeNimbus, id: 'rel-old', sourceFactId: 'fact-old' }];
    const hops = traverseDependents(['helix identity store'], [...active, ...stale]);
    assert.strictEqual(hops.length, 2, 'dedup by (source,target) keeps the pool deterministic');
  });

  // =========================================================================
  // S — STORE MAINTENANCE (local mode)
  // =========================================================================

  const scratch = path.join(os.tmpdir(), 'samjuniors-m53c-tests');
  fs.mkdirSync(scratch, { recursive: true });
  process.chdir(scratch);
  resetDurableState();
  const seed = await seedBenchmarkUniverse();

  await runTest('S1: seed-time saveFact hooks maintained the relations (2 edges, provenance intact)', async () => {
    const rels = await DependencyRelationStore.getInstance().listActiveRelations();
    assert.strictEqual(rels.length, 2);
    const bySource = new Map(rels.map((r) => [r.sourceEntity, r]));
    assert.ok(bySource.get('nimbus gateway'));
    assert.ok(bySource.get('aurorium auth service'));
    for (const r of rels) {
      assert.strictEqual(r.scope, 'company', 'authorization scope is company by construction');
      assert.strictEqual(r.status, 'active');
      assert.strictEqual(r.relationType, 'DEPENDS_ON');
      assert.ok(
        ['fact-nimbus-auth-dependency', 'fact-auth-helix-dependency'].includes(r.sourceFactId),
        'every edge cites its source fact'
      );
      assert.strictEqual(r.provenance.extractionRule, 'dep-rel/1');
      assert.strictEqual(
        r.observedAt,
        r.sourceFactId === 'fact-auth-helix-dependency' ? '2026-08-22T09:00:00.000Z' : '2026-08-20T09:00:00.000Z'
      );
    }
  });

  await runTest('S2: superseding a dependency fact flips its edges out of the active pool', async () => {
    const store = EpistemicClaimStore.getInstance();
    await store.saveFact(
      fact({
        id: 'fact-new-auth',
        statement: 'Aurorium Auth Service depends on the New Identity Store for credential storage',
        promotedAt: '2026-09-20T09:00:00.000Z',
      })
    );
    await store.markFactSuperseded('fact-auth-helix-dependency', 'fact-new-auth', {
      supersededAt: '2026-09-20T09:00:00.000Z',
    });
    const rels = await DependencyRelationStore.getInstance().listActiveRelations();
    assert.ok(!rels.some((r) => r.sourceFactId === 'fact-auth-helix-dependency'), 'superseded fact\'s edges left the active pool');
    assert.ok(rels.some((r) => r.sourceFactId === 'fact-new-auth'), 'successor fact\'s edges entered');
    // Rebuild determinism: full rebuild reproduces the same active pool.
    const allFacts = await store.readFacts({ mode: 'HISTORICAL' });
    await DependencyRelationStore.getInstance().rebuildFromFacts(allFacts);
    const rebuilt = await DependencyRelationStore.getInstance().listActiveRelations();
    assert.deepStrictEqual(
      rebuilt.map((r) => r.id).sort(),
      rels.map((r) => r.id).sort(),
      'rebuild == incremental maintenance'
    );
  });

  await runTest('S3: idempotent maintenance — re-saving a fact does not duplicate edges', async () => {
    const store = EpistemicClaimStore.getInstance();
    const nimbus = await store.getFact('fact-nimbus-auth-dependency');
    await store.saveFact(nimbus!);
    await store.saveFact(nimbus!);
    const rels = await DependencyRelationStore.getInstance().listAllRelations();
    const nimbusEdges = rels.filter((r) => r.sourceFactId === 'fact-nimbus-auth-dependency');
    assert.strictEqual(nimbusEdges.length, 1, 'deterministic row ids make maintenance converge');
  });

  await runTest('S4: relations persist to the durable collection (restart semantics)', async () => {
    DependencyRelationStore.resetInstance();
    const reloaded = await DependencyRelationStore.getInstance().listActiveRelations();
    assert.ok(reloaded.length >= 1, 'durable collection reloads on fresh construction');
    assert.ok(reloaded.every((r) => r.status === 'active'));
  });

  // =========================================================================
  // A — END-TO-END ASSEMBLY (the canonical render path)
  // =========================================================================

  // S2 superseded the original auth-helix fact; re-seed a fresh universe in a
  // NEW scratch so the A-section asserts the pristine fixture state.
  const scratch2 = path.join(os.tmpdir(), 'samjuniors-m53c-tests-e2e');
  fs.mkdirSync(scratch2, { recursive: true });
  process.chdir(scratch2);
  resetDurableState();
  const seed2 = await seedBenchmarkUniverse();

  await runTest('A1: a Helix-anchored dependency query renders the DEPENDENCY_PATH slice with provenance', async () => {
    const assembled = await SophiaContextAssembler.assemble({
      message: 'Which services depend on the Helix Identity Store?',
      founderId: seed2.founderA,
    });
    const slice = depSlice(assembled.slices);
    assert.ok(slice, 'dependency slice present');
    assert.strictEqual(slice!.authority, 'CANONICAL_FACT', 'renders under the truth-bearing fact authority (active facts only)');
    assert.ok(slice!.content.includes('DEPENDS_ON'));
    assert.ok(slice!.content.includes('(from [FACT-fact-auth-helix-dependency])'), 'edge cites its source fact');
    assert.ok(slice!.content.includes('(from [FACT-fact-nimbus-auth-dependency])'));
    assert.ok(slice!.content.includes('[FACT-fact-nimbus-auth-dependency]'), 'hop-2 fact rendered (the BQ3a gold)');
    assert.ok(slice!.content.includes('[FACT-fact-auth-helix-dependency]'), 'hop-1 fact rendered');
    assert.strictEqual(assembled.tokenBreakdown?.dependencyPath !== undefined, true);
  });

  await runTest('A2: the transitive (hop-2) fact is unreachable lexically — only the traversal reaches it', async () => {
    // Prove the negative: the hop-2 fact shares no query token with the question.
    const store = EpistemicClaimStore.getInstance();
    const lexical = await store.queryFacts({ queryText: 'Which services depend on the Helix Identity Store?', limit: 3 });
    assert.ok(!lexical.some((f) => f.id === 'fact-nimbus-auth-dependency'), 'sanity: hop-2 fact is NOT a lexical hit');
    const assembled = await SophiaContextAssembler.assemble({
      message: 'Which services depend on the Helix Identity Store?',
      founderId: seed2.founderA,
    });
    assert.ok(assembled.formattedContext.includes('[FACT-fact-nimbus-auth-dependency]'), 'but the dependency path renders it');
  });

  await runTest('A3: dependency queries WITHOUT resolvable anchors render NOTHING new (fail-safe)', async () => {
    const assembled = await SophiaContextAssembler.assemble({
      message: 'Which projects depend on the value-based pricing decision?',
      founderId: seed2.founderA,
    });
    assert.strictEqual(depSlice(assembled.slices), undefined, 'no dependency slice for anchor-less dependency questions');
    const casual = await SophiaContextAssembler.assemble({
      message: 'What changed in company strategy during the last 3 months?',
      founderId: seed2.founderA,
    });
    assert.strictEqual(depSlice(casual.slices), undefined, 'window queries never render the dependency slice');
  });

  await runTest('A4: GOVERNANCE — the dependency slice never contains superseded statements or personal material', async () => {
    const assembled = await SophiaContextAssembler.assemble({
      message: 'Which services depend on the Helix Identity Store?',
      founderId: seed2.founderA,
    });
    const slice = depSlice(assembled.slices)!;
    const historical = await EpistemicClaimStore.getInstance().readFacts({ mode: 'HISTORICAL' });
    const supersededStatements = historical
      .filter((f) => f.validityState === 'superseded')
      .map((f) => f.statement);
    for (const statement of supersededStatements) {
      assert.ok(!slice.content.includes(statement), 'no superseded statement in the dependency slice');
    }
    const personal = await SophiaContextAssembler.assemble({
      message: 'Which services depend on the Helix Identity Store?',
      founderId: seed2.founderA,
    });
    const personalSlice = personal.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    assert.ok(
      !personalSlice || personalSlice.content.length === 0 || !slice.content.includes(personalSlice.content),
      'no personal-mind material in the dependency slice'
    );
  });

  await runTest('A5: assemble() is deterministic for dependency queries (byte-identical rerun)', async () => {
    const message = 'Which services depend on the Helix Identity Store?';
    const a = await SophiaContextAssembler.assemble({ message, founderId: seed2.founderA });
    const b = await SophiaContextAssembler.assemble({ message, founderId: seed2.founderA });
    assert.strictEqual(a.formattedContext, b.formattedContext);
  });

  await runTest('A6: a superseded dependency fact\'s edges no longer traverse (lifecycle authority holds)', async () => {
    const store = EpistemicClaimStore.getInstance();
    // Supersede the hop-1 fact with a NEW fact that re-points the dependency.
    await store.saveFact(
      fact({
        id: 'fact-new-auth-helix',
        claimId: 'claim-auth-helix-dependency',
        subject: 'service_dependencies',
        statement: 'Aurorium Auth Service depends on the Vault Identity Store for credential storage',
        promotedAt: '2026-09-20T09:00:00.000Z',
      })
    );
    await store.markFactSuperseded('fact-auth-helix-dependency', 'fact-new-auth-helix', {
      supersededAt: '2026-09-20T09:00:00.000Z',
    });
    const assembled = await SophiaContextAssembler.assemble({
      message: 'Which services depend on the Helix Identity Store?',
      founderId: seed2.founderA,
    });
    const slice = depSlice(assembled.slices);
    // The old helix edge is gone; the anchor still resolves through the new
    // fact's target? It does NOT (vault ≠ helix) → no anchors → no slice.
    assert.strictEqual(slice, undefined, 'stale edges never answer current-dependency questions');
    // And the hop-2 fact is no longer rendered via any dependency path.
    assert.ok(!assembled.formattedContext.includes('[FACT-fact-nimbus-auth-dependency]'));
  });

  await runTest('A7: dependency retrieval is company-scoped — Personal Mind contributes no edges (boundary by construction)', async () => {
    const rels = await DependencyRelationStore.getInstance().listAllRelations();
    assert.ok(rels.every((r) => r.scope === 'company'));
    assert.ok(rels.every((r) => r.sourceFactId.startsWith('fact-')), 'every edge cites a canonical fact');
  });

  await runTest('A8: degraded relation store fails SAFE (no slice, no crash)', async () => {
    // Corrupt the in-memory relation pool; the assembly must degrade to no
    // dependency slice rather than throw or render garbage.
    const relStore = DependencyRelationStore.getInstance();
    (relStore as any).relations.clear();
    const assembled = await SophiaContextAssembler.assemble({
      message: 'Which services depend on the Helix Identity Store?',
      founderId: seed2.founderA,
    });
    assert.strictEqual(depSlice(assembled.slices), undefined, 'fail-safe: nothing renders without the index');
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log('\n==================================================');
  console.log(`M5.3-C DEPENDENCY RELATIONS SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');
  if (failed > 0) process.exit(1);
}

void main().catch((err) => {
  console.error(`M5.3-C SUITE HARNESS ERROR: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
