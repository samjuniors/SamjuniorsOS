import assert from 'assert';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CanonicalFact } from '../../src/types/epistemic';

/**
 * ============================================================================
 * M5.3 — AUTHORITATIVE-MODE READ MODEL TEST SUITE (PostgreSQL representation)
 * ============================================================================
 * Executes the AUTHORITATIVE (Prisma) store branches against a real database
 * built from the checked-in schema — the SQLite port of the upstream
 * PostgreSQL schema (the sandbox has no PostgreSQL server; the query shapes
 * are plain relational filters that run unchanged on PostgreSQL — see
 * docs/architecture/M5_3_POSTGRES_RETRIEVAL_EXPERIMENT.md §10).
 *
 * This closes the M5.1/M5.2 verification gap where the PostgresEpistemicStore
 * branches were verified by inspection only: here they actually execute.
 *
 * Covered:
 *   P1..P3   saveFact / markFactSuperseded persist the supersession event time
 *   P4..P6   readFacts CURRENT / HISTORICAL / AS_OF over the database rows
 *   P7..P8   queryFacts (ranking inside the authoritative pool, asOf mode)
 *   P9       getFactLineage over the relational supersededById chain
 *   P10..P12 DependencyRelationStore Prisma maintenance (edges on save,
 *            status flip on supersession, active pool for traversal)
 *   P13      fail-closed: an unreachable database must throw, never silently
 *            fall back to the in-memory path
 *
 * MODE ISOLATION: this process sets DATABASE_MODE=authoritative and a
 * throwaway DATABASE_URL before any store/prisma import, and pushes the
 * schema to that throwaway file. Nothing here can touch repository state.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-m53-auth-'));
const dbFile = path.join(scratch, 'authoritative.db');
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.DATABASE_MODE = 'authoritative';
// NODE_ENV is typed read-only in @types/node; the audit-mandated test-safe
// cast keeps the assignment while satisfying tsc (runtime behavior under bun
// is unchanged).
(process.env as { NODE_ENV?: string }).NODE_ENV = 'test';

execSync('bunx prisma db push --schema prisma/schema.prisma --skip-generate --accept-data-loss', {
  cwd: REPO_ROOT,
  env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
  stdio: 'pipe',
});

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

async function main(): Promise<void> {
  console.log('\n======================================================');
  console.log('M5.3 AUTHORITATIVE READ MODEL SUITE (SQLite port of the PostgreSQL schema)');
  console.log('======================================================\n');

  // Imports happen AFTER the authoritative env is in place (dual-mode reads
  // the env at call time, but the PrismaClient singleton binds the URL at
  // construction).
  const { EpistemicClaimStore } = await import('../../src/lib/server/epistemic/claim-store');
  const { DependencyRelationStore } = await import('../../src/lib/server/retrieval/dependency-relation-store');
  const { isAuthoritativeMode } = await import('../../src/lib/server/db/authority');

  assert.strictEqual(isAuthoritativeMode(), true, 'suite must run in authoritative mode');

  const store = EpistemicClaimStore.getInstance();
  const relStore = DependencyRelationStore.getInstance();

  // Minimal governed universe (claims first — the fact FK requires them).
  const claimIds = ['clm-a', 'clm-b', 'clm-c', 'clm-d'];
  for (const [i, claimId] of claimIds.entries()) {
    await store.saveClaim({
      id: claimId,
      statement: `claim ${claimId}`,
      subject: 'test_subject',
      category: 'operational',
      proposedBy: 'researcher',
      confidence: 'unverified',
      verificationStatus: 'pending',
      evidenceReferences: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    } as any);
  }

  function mkFact(partial: Partial<CanonicalFact> & { id: string; claimId: string; statement: string }): CanonicalFact {
    return {
      subject: 'test_subject',
      category: 'operational',
      validityState: 'active',
      confidence: 'verified_fact',
      promotedAt: '2026-01-01T00:00:00.000Z',
      promotedBy: 'founder',
      provenance: { sourceSystem: 'test' } as any,
      ...partial,
    } as CanonicalFact;
  }

  await runTest('P1: authoritative saveFact persists rows (round trip)', async () => {
    await store.saveFact(mkFact({ id: 'auth-f1', claimId: 'clm-a', statement: 'Alpha Service depends on the Beta Store for tokens', promotedAt: '2026-01-10T00:00:00.000Z' }));
    const got = await store.getFact('auth-f1');
    assert.ok(got);
    assert.strictEqual(got!.statement, 'Alpha Service depends on the Beta Store for tokens');
    assert.strictEqual(got!.validityState, 'active');
    assert.strictEqual(got!.supersededAt, undefined);
  });

  await runTest('P2: markFactSuperseded records an explicit event time in the database', async () => {
    await store.saveFact(mkFact({ id: 'auth-f2', claimId: 'clm-b', statement: 'Old price is $29', promotedAt: '2026-02-01T00:00:00.000Z' }));
    await store.saveFact(mkFact({ id: 'auth-f3', claimId: 'clm-c', statement: 'New price is $49', promotedAt: '2026-03-15T00:00:00.000Z' }));
    await store.markFactSuperseded('auth-f2', 'auth-f3', { supersededAt: '2026-03-15T00:00:00.000Z' });
    const old = await store.getFact('auth-f2');
    assert.strictEqual(old!.validityState, 'superseded');
    assert.strictEqual(old!.supersededById, 'auth-f3');
    assert.strictEqual(old!.supersededAt, '2026-03-15T00:00:00.000Z');
  });

  await runTest('P3: markFactSuperseded derives the event time from the stored successor when not explicit', async () => {
    await store.saveFact(mkFact({ id: 'auth-f4', claimId: 'clm-d', statement: 'Old runway is 10 months', promotedAt: '2026-02-01T00:00:00.000Z' }));
    await store.saveFact(mkFact({ id: 'auth-f5', claimId: 'clm-a', statement: 'New runway is 14 months', promotedAt: '2026-04-01T00:00:00.000Z' }));
    await store.markFactSuperseded('auth-f4', 'auth-f5');
    const old = await store.getFact('auth-f4');
    assert.strictEqual(old!.supersededAt, '2026-04-01T00:00:00.000Z', 'event time = successor promotion moment');
  });

  await runTest('P4: readFacts CURRENT = active rows only', async () => {
    const current = await store.readFacts({ mode: 'CURRENT' });
    assert.ok(current.every((f) => f.validityState === 'active'));
    assert.ok(!current.some((f) => f.id === 'auth-f2' || f.id === 'auth-f4'));
    assert.ok(current.some((f) => f.id === 'auth-f3'));
  });

  await runTest('P5: readFacts HISTORICAL includes superseded rows', async () => {
    const historical = await store.readFacts({ mode: 'HISTORICAL' });
    assert.ok(historical.some((f) => f.id === 'auth-f2'));
    assert.ok(historical.some((f) => f.id === 'auth-f4'));
    assert.strictEqual(historical.length, (await store.readFacts({ mode: 'CURRENT' })).length + 2);
  });

  await runTest('P6: readFacts AS_OF windows over the database rows (pre- and post-event)', async () => {
    const mid = '2026-03-01T00:00:00.000Z';
    const asOfMid = await store.readFacts({ mode: 'AS_OF', asOf: mid });
    assert.ok(asOfMid.some((f) => f.id === 'auth-f2'), 'f2 was truth mid-window (superseded 03-15)');
    assert.ok(!asOfMid.some((f) => f.id === 'auth-f3'), 'f3 not yet promoted mid-window');
    const late = '2026-05-01T00:00:00.000Z';
    const asOfLate = await store.readFacts({ mode: 'AS_OF', asOf: late });
    assert.ok(asOfLate.some((f) => f.id === 'auth-f3'));
    assert.ok(!asOfLate.some((f) => f.id === 'auth-f2'));
    assert.ok(!asOfLate.some((f) => f.id === 'auth-f4'), 'f4 superseded 04-01');
    // Fail-closed on a missing instant:
    assert.deepStrictEqual(await store.readFacts({ mode: 'AS_OF' }), []);
  });

  await runTest('P7: queryFacts ranks inside the authoritative pool (shared deterministic ranker)', async () => {
    const hits = await store.queryFacts({ queryText: 'runway months', limit: 5 });
    assert.ok(hits.length >= 1);
    assert.ok(hits.some((f) => f.id === 'auth-f5'));
    assert.ok(hits.every((f) => f.validityState === 'active'), 'default pool is CURRENT');
  });

  await runTest('P8: queryFacts asOf switches eligibility to the as-of projection', async () => {
    const mid = '2026-03-01T00:00:00.000Z';
    const hits = await store.queryFacts({ queryText: 'runway', limit: 5, asOf: mid });
    assert.ok(hits.some((f) => f.id === 'auth-f4'), 'predecessor retrievable as as-of truth');
    assert.ok(!hits.some((f) => f.id === 'auth-f5'), 'successor not yet promoted at the instant');
  });

  await runTest('P9: getFactLineage walks the relational supersededById chain', async () => {
    const lineage = await store.getFactLineage('auth-f2');
    assert.deepStrictEqual(lineage.successors.map((s) => s.fact.id), ['auth-f3']);
    const reverse = await store.getFactLineage('auth-f3');
    assert.ok(reverse.predecessors.some((p) => p.fact.id === 'auth-f2'));
    assert.ok(reverse.predecessors.find((p) => p.fact.id === 'auth-f2')!.supersededAt === '2026-03-15T00:00:00.000Z');
  });

  await runTest('P10: saveFact maintains DEPENDS_ON edges in the database (derived index)', async () => {
    await store.saveFact(mkFact({ id: 'auth-dep1', claimId: 'clm-b', statement: 'Nimbus Gateway depends on the Aurorium Auth Service for token verification', promotedAt: '2026-05-01T00:00:00.000Z' }));
    await store.saveFact(mkFact({ id: 'auth-dep2', claimId: 'clm-c', statement: 'Aurorium Auth Service depends on the Helix Identity Store for credential storage', promotedAt: '2026-05-02T00:00:00.000Z' }));
    const rels = await relStore.listActiveRelations();
    const depRels = rels.filter((r) => r.sourceFactId === 'auth-dep1' || r.sourceFactId === 'auth-dep2');
    assert.strictEqual(depRels.length, 2, 'both dependency statements extracted one edge each');
    const nimbus = depRels.find((r) => r.sourceFactId === 'auth-dep1')!;
    assert.strictEqual(nimbus.sourceEntity, 'nimbus gateway');
    assert.strictEqual(nimbus.targetEntity, 'aurorium auth service');
    assert.strictEqual(nimbus.provenance.extractionRule, 'dep-rel/1');
    assert.strictEqual(nimbus.observedAt, '2026-05-01T00:00:00.000Z');
  });

  await runTest('P11: bounded traversal over the DATABASE-loaded active edges reaches hop 2', async () => {
    const { traverseDependents, resolveDependencyAnchors, knownEntityKeys, collectDependencyFacts } =
      await import('../../src/lib/server/retrieval/dependency-relations');
    const rels = await relStore.listActiveRelations();
    const anchors = resolveDependencyAnchors('Which services depend on the Helix Identity Store?', knownEntityKeys(rels));
    assert.deepStrictEqual(anchors, ['helix identity store']);
    const hops = traverseDependents(anchors, rels);
    assert.strictEqual(hops.length, 2);
    assert.strictEqual(hops[1].fromKey, 'nimbus gateway');
    const activeFacts = await store.readFacts({ mode: 'CURRENT' });
    const depFacts = collectDependencyFacts(hops, anchors, activeFacts);
    assert.deepStrictEqual(depFacts.map((f) => f.id), ['auth-dep2', 'auth-dep1']);
  });

  await runTest('P12: supersession flips the derived edges out of the active pool', async () => {
    await store.saveFact(mkFact({ id: 'auth-dep3', claimId: 'clm-d', statement: 'Aurorium Auth Service depends on the Vault Identity Store for credential storage', promotedAt: '2026-06-01T00:00:00.000Z' }));
    await store.markFactSuperseded('auth-dep2', 'auth-dep3', { supersededAt: '2026-06-01T00:00:00.000Z' });
    const rels = await relStore.listActiveRelations();
    assert.ok(!rels.some((r) => r.sourceFactId === 'auth-dep2'), 'superseded fact edges left the active pool');
    assert.ok(rels.some((r) => r.sourceFactId === 'auth-dep3'));
    // Rebuild from the canonical facts reproduces the pool exactly.
    const allFacts = await store.readFacts({ mode: 'HISTORICAL' });
    await relStore.rebuildFromFacts(allFacts);
    const rebuilt = await relStore.listActiveRelations();
    assert.deepStrictEqual(rebuilt.map((r) => r.id).sort(), rels.map((r) => r.id).sort());
  });

  await runTest('P13: FAIL-CLOSED — an unreachable database throws (no silent in-memory fallback)', async () => {
    // A child process with an unopenable DATABASE_URL must exit with the
    // fail-closed authority error — the authoritative mode NEVER silently
    // falls back to the in-memory path. (Run in a child because the Prisma
    // client binds its datasource URL at construction in this process.)
    const childScript = path.join(scratch, 'failclosed.ts');
    fs.writeFileSync(
      childScript,
      [
        `process.env.DATABASE_URL = 'file:/nonexistent-m53-dir/nope.db';`,
        `process.env.DATABASE_MODE = 'authoritative';`,
        `const { EpistemicClaimStore } = await import(${JSON.stringify(path.join(REPO_ROOT, 'src/lib/server/epistemic/claim-store'))});`,
        `try {`,
        `  await EpistemicClaimStore.getInstance().readFacts({ mode: 'CURRENT' });`,
        `  console.log('READ_SUCCEEDED');`,
        `} catch (err) {`,
        `  console.log('THREW:' + String(err?.message ?? err).slice(0, 160));`,
        `  process.exit(3);`,
        `}`,
      ].join('\n')
    );
    let stdout = '';
    let exitCode = 0;
    try {
      stdout = execSync(`bun run ${JSON.stringify(childScript)}`, {
        cwd: REPO_ROOT,
        env: { ...process.env, DATABASE_MODE: 'authoritative' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }).toString();
    } catch (err: any) {
      exitCode = err.status ?? 1;
      stdout = (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '');
    }
    assert.strictEqual(exitCode, 3, `child must exit 3; output: ${stdout.slice(0, 300)}`);
    assert.ok(stdout.includes('READ_SUCCEEDED') === false, 'the read must NOT succeed');
    assert.ok(
      /FAIL-CLOSED|DATABASE_AUTHORITY/i.test(stdout),
      `expected the fail-closed authority error in child output: ${stdout.slice(0, 300)}`
    );
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log('\n==================================================');
  console.log(`M5.3 AUTHORITATIVE READ MODEL SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');
  if (failed > 0) process.exit(1);
}

void main().catch((err) => {
  console.error(`M5.3 AUTHORITATIVE SUITE HARNESS ERROR: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
