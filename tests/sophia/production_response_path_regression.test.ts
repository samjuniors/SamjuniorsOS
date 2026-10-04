import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resetDurableState, seedBenchmarkUniverse } from '../../benchmark/memory-retrieval/seed';
import { SophiaContextAssembler, SophiaServerGateway } from '../../src/lib/server/sophia';

/**
 * Production response-path regression for M5.4 S6/S9.
 *
 * The assembler must supply both direct and transitive dependency evidence,
 * and the final deterministic gateway reply must preserve that evidence.
 * This test deliberately exercises the production gateway rather than the
 * benchmark model prompt or the context assembler alone.
 *
 * Regression pin (post-fix): the gateway MUST select the assembled
 * DEPENDENCY_PATH / CANONICAL_FACT evidence for dependency-intent
 * informational queries. R2/R3 fail if that selection regresses (the
 * pre-fix gateway answered with unrelated COMPANY_KNOWLEDGE content for
 * domain=general and an unrelated facts[0] record for domain=epistemic_fact).
 *
 * Known documented behavior: the dependency projection is direction-blind
 * reverse traversal — it answers "who depends on X". A forward-direction
 * question ("what does X depend on?") receives the same dependents-of-X
 * evidence slice; see the M5.3-C notes in context-assembly.ts and
 * dependency-relations.ts. No live model calls are made.
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

const QUESTION = 'Which services depend on the Helix Identity Store?';
const DIRECT_FACT = '[FACT-fact-auth-helix-dependency]';
const TRANSITIVE_FACT = '[FACT-fact-nimbus-auth-dependency]';
const DIRECT_SERVICE = 'Aurorium Auth Service';
const TRANSITIVE_SERVICE = 'Nimbus Gateway';

async function main(): Promise<void> {
  console.log('\n======================================================');
  console.log('PRODUCTION SOPHIA RESPONSE-PATH REGRESSION');
  console.log('======================================================\n');

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-production-response-path-'));
  process.chdir(scratch);
  resetDurableState();
  const seed = await seedBenchmarkUniverse();

  const assembled = await SophiaContextAssembler.assemble({
    message: QUESTION,
    founderId: seed.founderA,
  });

  await runTest('R1: production context includes both direct and transitive dependency facts', () => {
    const dependencySlice = assembled.slices.find((slice) => slice.label.includes('Dependency'));
    assert.ok(dependencySlice, 'dependency path slice must be present');
    assert.ok(dependencySlice!.content.includes(DIRECT_FACT), 'direct dependency fact must be present');
    assert.ok(dependencySlice!.content.includes(TRANSITIVE_FACT), 'transitive dependency fact must be present');
    assert.ok(assembled.formattedContext.includes(DIRECT_FACT));
    assert.ok(assembled.formattedContext.includes(TRANSITIVE_FACT));
  });

  const generalResult = await SophiaServerGateway.process({
    proposal: {
      kind: 'informational_query',
      domain: 'general',
      query: QUESTION,
      confidence: 0.9,
      reason: 'Dependency-path informational query regression.',
    },
    session: { role: 'FOUNDER', founderId: seed.founderA },
    message: QUESTION,
    context: assembled,
  });

  await runTest('R2: S6 final gateway reply names direct and transitive dependents', () => {
    assert.ok(generalResult.success, 'gateway response should succeed');
    assert.ok(generalResult.reply.includes(DIRECT_SERVICE), 'direct dependent must be answered');
    assert.ok(generalResult.reply.includes(TRANSITIVE_SERVICE), 'transitive dependent must be answered');
    assert.ok(generalResult.reply.includes(DIRECT_FACT), 'direct fact provenance must be preserved');
    assert.ok(generalResult.reply.includes(TRANSITIVE_FACT), 'transitive fact provenance must be preserved');
  });

  const provenanceResult = await SophiaServerGateway.process({
    proposal: {
      kind: 'informational_query',
      domain: 'epistemic_fact',
      query: `${QUESTION} Cite the evidence records you use.`,
      confidence: 0.9,
      reason: 'Dependency-path provenance regression.',
    },
    session: { role: 'FOUNDER', founderId: seed.founderA },
    message: `${QUESTION} Cite the evidence records you use.`,
    context: assembled,
  });

  await runTest('R3: S9 final gateway reply cites both evidence records for direct and transitive claims', () => {
    assert.ok(provenanceResult.success, 'gateway response should succeed');
    assert.ok(provenanceResult.reply.includes(DIRECT_SERVICE), 'direct dependent must be answered');
    assert.ok(provenanceResult.reply.includes(TRANSITIVE_SERVICE), 'transitive dependent must be answered');
    assert.ok(provenanceResult.reply.includes(DIRECT_FACT), 'direct evidence record must be cited');
    assert.ok(provenanceResult.reply.includes(TRANSITIVE_FACT), 'transitive evidence record must be cited');
  });

  await runTest('R4: final dependency answer does not use personal-memory content as company evidence', () => {
    const personalSlice = assembled.slices.find((slice) => slice.authority === 'PERSONAL_MIND_MEMORY');
    const replies = `${generalResult.reply}\n${provenanceResult.reply}`;
    if (personalSlice?.content) {
      assert.ok(!replies.includes(personalSlice.content), 'personal memory slice must not be copied into company answer');
    }
    assert.ok(!replies.includes('Prefers short written briefings over long meetings.'));
  });

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;
  console.log('\n==================================================');
  console.log(`PRODUCTION RESPONSE-PATH REGRESSION RESULT: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');
  if (failed > 0) process.exit(1);
}

void main().catch((err) => {
  console.error(`PRODUCTION RESPONSE-PATH REGRESSION HARNESS ERROR: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
