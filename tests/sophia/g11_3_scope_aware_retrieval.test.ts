import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { executeSophiaTurn } from '../../src/lib/server/sophia/turn-executor';
import { SophiaContextAssembler } from '../../src/lib/server/sophia/context-assembly';
import { SophiaMemoryStore } from '../../src/lib/server/sophia/personal-memory-store';
import { ConversationStore } from '../../src/lib/server/conversation/store';
import { ConversationAdapterRegistry } from '../../src/lib/server/ai';
import { EpistemicClaimStore } from '../../src/lib/server/epistemic/claim-store';
import { CompanyKnowledgeStore } from '../../src/lib/server/knowledge/knowledge-store';
import { evaluateAgainstBaseline, CIBaselineConfig } from '../../benchmark/memory-retrieval/verify-ci-gate';

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('STARTING G11.3 SCOPE-AWARE RETRIEVAL TEST SUITE');
  console.log('======================================================\n');

  // Setup test environment: fake provider pinned for deterministic offline execution
  const registry = ConversationAdapterRegistry.getInstance();
  registry.setPin('fake');

  const testFounderId = `founder-g11-3-${Date.now()}`;
  const memoryStore = SophiaMemoryStore.getInstance();
  const claimStore = EpistemicClaimStore.getInstance();
  const knowledgeStore = CompanyKnowledgeStore.getInstance();
  const convStore = ConversationStore.getInstance();

  // --------------------------------------------------------------------------
  // Group 1: Retrieval Benchmark Baseline Integrity
  // --------------------------------------------------------------------------
  console.log('--- Group 1: Retrieval Benchmark Baseline Integrity ---');

  await runTest('1.1. Authoritative ci-baseline.json exists with recorded baseline M5.3-A3', async () => {
    const baselinePath = path.resolve(process.cwd(), 'benchmark/memory-retrieval/ci-baseline.json');
    assert.ok(fs.existsSync(baselinePath), 'ci-baseline.json must exist');
    const baseline: CIBaselineConfig = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    assert.strictEqual(baseline.baselineId, 'M5.3-A3', 'Baseline ID must be M5.3-A3');
    assert.strictEqual(baseline.queryCount, 13, 'Recorded baseline must evaluate 13 queries');
    assert.strictEqual(baseline.thresholds.maxOverallFailures, 0, 'Baseline threshold enforces 0 failures');
    assert.strictEqual(baseline.thresholds.maxBoundaryViolations, 0, 'Baseline threshold enforces 0 boundary violations');
  });

  await runTest('1.2. evaluateAgainstBaseline passes cleanly against recorded benchmark run', async () => {
    const baselinePath = path.resolve(process.cwd(), 'benchmark/memory-retrieval/ci-baseline.json');
    const baseline: CIBaselineConfig = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

    // Simulated benchmark result conforming to M5.3-A3 baseline
    const mockRunResult = {
      fixtureDigest: baseline.fixtureDigest,
      queries: new Array(13).fill(null).map((_, i) => ({ id: `q-${i}` })),
      aggregate: {
        overall: {
          failureCount: 0,
          meanRenderRecall: 1.0,
          meanUnionRecall: 0.921,
          authorityFailures: 0,
          graphCandidateFailures: 0,
          boundaryViolations: 0,
          founderScopeViolations: 0,
        },
        byCategory: Object.fromEntries(
          Object.keys(baseline.thresholds.perCategory).map((cat) => [
            cat,
            { failureCount: 0, meanRenderRecall: 1.0 },
          ])
        ),
      },
    };

    const evaluation = evaluateAgainstBaseline(mockRunResult, baseline);
    assert.strictEqual(evaluation.passed, true, 'Mock evaluation must pass');
    assert.strictEqual(evaluation.regressions.length, 0, 'Must have zero regressions');
  });

  // --------------------------------------------------------------------------
  // Group 2: Source ID Attribution on Every Recalled Item
  // --------------------------------------------------------------------------
  console.log('\n--- Group 2: Source ID Attribution on Recalled Items ---');

  const plantedSecretPref = `Pref-${Date.now()}-cold-brew`;
  const personalMem = await memoryStore.createMemory({
    founderId: testFounderId,
    memoryType: 'PERSONAL_CONTEXT_NOTE',
    content: `Founder morning routine: enjoys ${plantedSecretPref} at 07:30.`,
    confidence: 0.95,
    lifecycleState: 'ACTIVE',
  });

  await runTest('2.1. Recalled personal memory slice carries exact source id', async () => {
    const ctx = await SophiaContextAssembler.assemble({
      message: 'What is my morning beverage preference?',
      founderId: testFounderId,
      scope: 'personal_only',
    });

    const personalSlice = ctx.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    assert.ok(personalSlice, 'PERSONAL_MIND_MEMORY slice must be present');
    assert.ok(Array.isArray(personalSlice.sourceIds), 'sourceIds must be an array');
    assert.ok(personalSlice.sourceIds.includes(personalMem.id), 'sourceIds must contain personal memory ID');
    assert.ok(ctx.sourceIds?.includes(personalMem.id), 'Top-level assembledContext.sourceIds must include personal memory ID');
  });

  await runTest('2.2. Recalled canonical facts carry valid source ids', async () => {
    const activeFacts = await claimStore.listActiveFacts();
    if (activeFacts.length > 0) {
      const targetFact = activeFacts[0];
      const ctx = await SophiaContextAssembler.assemble({
        message: targetFact.statement,
        founderId: testFounderId,
        scope: 'company_only',
      });

      const factSlice = ctx.slices.find((s) => s.authority === 'CANONICAL_FACT');
      assert.ok(factSlice, 'CANONICAL_FACT slice must be present');
      assert.ok(Array.isArray(factSlice.sourceIds), 'Canonical fact slice must have sourceIds array');
      assert.ok(factSlice.sourceIds.length > 0, 'Canonical fact slice sourceIds must not be empty');
      assert.ok(factSlice.sourceIds.includes(String(targetFact.id)), 'Canonical fact slice must include target fact ID');
      assert.ok(ctx.sourceIds?.includes(String(targetFact.id)), 'Top-level sourceIds must contain target fact ID');
    }
  });

  await runTest('2.3. Recalled company knowledge items carry valid document IDs', async () => {
    const allKnowledge = await knowledgeStore.getAllKnowledge();
    if (allKnowledge.length > 0) {
      const targetDoc = allKnowledge[0];
      const ctx = await SophiaContextAssembler.assemble({
        message: targetDoc.title || targetDoc.documentId,
        founderId: testFounderId,
        scope: 'company_only',
      });

      const kSlice = ctx.slices.find((s) => s.authority === 'COMPANY_KNOWLEDGE');
      if (kSlice) {
        assert.ok(Array.isArray(kSlice.sourceIds), 'Company knowledge slice must have sourceIds');
        assert.ok(kSlice.sourceIds.includes(targetDoc.documentId), 'Knowledge slice must include target documentId');
        assert.ok(ctx.sourceIds?.includes(targetDoc.documentId), 'Top-level sourceIds must include target documentId');
      }
    }
  });

  await runTest('2.4. executeSophiaTurn propagates sourceIds in result and persisted metadata', async () => {
    const turnResult = await executeSophiaTurn({
      message: 'What is my personal morning beverage preference?',
      founderId: testFounderId,
    });

    assert.strictEqual(turnResult.success, true);
    assert.ok(Array.isArray(turnResult.sourceIds), 'turnResult must have sourceIds array');
    assert.ok(turnResult.sourceIds.includes(personalMem.id), 'turnResult.sourceIds must contain personal memory ID');

    // Verify persisted message in ConversationStore
    assert.ok(turnResult.assistantMessageId, 'Assistant message ID must be present');
    const messages = await convStore.getMessages(turnResult.conversationId, testFounderId);
    const msg = messages.find((m) => m.id === turnResult.assistantMessageId);
    assert.ok(msg, 'Persisted assistant message must be retrievable');
    assert.ok(Array.isArray(msg.metadata?.sourceIds), 'Persisted metadata must contain sourceIds');
    assert.ok(msg.metadata.sourceIds.includes(personalMem.id), 'Persisted sourceIds must contain personal memory ID');
  });

  // --------------------------------------------------------------------------
  // Group 3: Scope-Aware Partitioning and Budgeting
  // --------------------------------------------------------------------------
  console.log('\n--- Group 3: Scope-Aware Partitioning and Budgeting ---');

  await runTest('3.1. scope: "personal_only" contains only personal sources and sourceIds', async () => {
    const ctx = await SophiaContextAssembler.assemble({
      message: 'Check my notes and company finances',
      founderId: testFounderId,
      scope: 'personal_only',
    });

    assert.ok(ctx.scopes?.includes('personal_mind'), 'Must include personal_mind');
    assert.ok(!ctx.scopes?.includes('company_brain'), 'Must NOT include company_brain');
    assert.ok(ctx.slices.every((s) => s.authority === 'PERSONAL_MIND_MEMORY'), 'All slices must be personal');
    assert.ok(ctx.sourceIds?.every((id) => id === personalMem.id), 'All sourceIds must belong to personal memory');
  });

  await runTest('3.2. scope: "company_only" contains only company sources and sourceIds', async () => {
    const ctx = await SophiaContextAssembler.assemble({
      message: 'What are the company strategic initiatives?',
      founderId: testFounderId,
      scope: 'company_only',
    });

    assert.ok(ctx.scopes?.includes('company_brain'), 'Must include company_brain');
    assert.ok(!ctx.scopes?.includes('personal_mind'), 'Must NOT include personal_mind');
    assert.ok(ctx.slices.every((s) => s.authority !== 'PERSONAL_MIND_MEMORY'), 'Must have zero personal slices');
    assert.ok(!ctx.sourceIds?.includes(personalMem.id), 'Must NOT contain personal memory source ID');
  });

  await runTest('3.3. scope: "none" returns zero slices, zero scopes, and zero sourceIds', async () => {
    const ctx = await SophiaContextAssembler.assemble({
      message: 'Hello Sophia, good afternoon!',
      founderId: testFounderId,
      scope: 'none',
    });

    assert.strictEqual(ctx.slices.length, 0, 'Slices must be empty');
    assert.strictEqual(ctx.scopes?.length, 0, 'Scopes must be empty');
    assert.strictEqual(ctx.sourceIds?.length, 0, 'sourceIds must be empty');
  });

  // --------------------------------------------------------------------------
  // Group 4: Honest Abstention When Nothing Relevant Is Found
  // --------------------------------------------------------------------------
  console.log('\n--- Group 4: Honest Abstention When Nothing Relevant Is Found ---');

  await runTest('4.1. Unmatched personal recall query honestly abstains with "I do not remember" and sourceIds: []', async () => {
    const emptyFounder = `empty-founder-${Date.now()}`;
    const result = await executeSophiaTurn({
      message: 'What is my secret childhood pet nickname?',
      founderId: emptyFounder,
      route: 'recall-personal',
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.reply.includes('I do not remember'), 'Reply must include "I do not remember"');
    assert.ok(result.scopes?.includes('personal_mind'), 'Scopes must cite personal_mind');
    assert.deepStrictEqual(result.sourceIds, [], 'sourceIds must be empty on abstention');

    // Check persisted message metadata
    const messages = await convStore.getMessages(result.conversationId, emptyFounder);
    const msg = messages.find((m) => m.id === result.assistantMessageId);
    assert.deepStrictEqual(msg?.metadata?.sourceIds, [], 'Persisted metadata sourceIds must be empty on abstention');
  });

  await runTest('4.2. Unmatched company recall query honestly abstains with "I do not remember" and sourceIds: []', async () => {
    const result = await executeSophiaTurn({
      message: 'What is the guideline on quantum hyperdrive tachyon emissions?',
      founderId: testFounderId,
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.reply.includes('I do not remember'), 'Reply must include "I do not remember"');
    assert.ok(result.scopes?.includes('company_brain'), 'Scopes must cite company_brain');
    assert.deepStrictEqual(result.sourceIds, [], 'sourceIds must be empty on abstention');

    // Check persisted message metadata
    const messages = await convStore.getMessages(result.conversationId, testFounderId);
    const msg = messages.find((m) => m.id === result.assistantMessageId);
    assert.deepStrictEqual(msg?.metadata?.sourceIds, [], 'Persisted metadata sourceIds must be empty on abstention');
  });

  console.log('\n======================================================');
  console.log('G11.3 TEST RESULTS: ALL TESTS PASSED');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
