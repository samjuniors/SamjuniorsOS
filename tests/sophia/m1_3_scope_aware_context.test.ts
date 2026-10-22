import assert from 'assert';
import { executeSophiaTurn } from '../../src/lib/server/sophia/turn-executor';
import { SophiaContextAssembler } from '../../src/lib/server/sophia/context-assembly';
import { SophiaMemoryStore } from '../../src/lib/server/sophia/personal-memory-store';
import { CompanyStateStore } from '../../src/lib/server/state/state-store';
import { sophiaChatTurn } from '../../src/lib/server/sophia/sofiaui';
import { ConversationAdapterRegistry, FakeConversationProvider } from '../../src/lib/server/ai';

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
  console.log('STARTING M1.3 SCOPE-AWARE CONTEXT TEST SUITE');
  console.log('======================================================\n');

  // Setup test environment: fake provider pinned for deterministic offline execution
  const registry = ConversationAdapterRegistry.getInstance();
  const fake = registry.getFakeProvider();
  registry.setPin('fake');

  const testFounderId = `test-founder-m13-${Date.now()}`;
  const memoryStore = SophiaMemoryStore.getInstance();

  // --------------------------------------------------------------------------
  // Group 1: Planted Personal Fact Isolation
  // --------------------------------------------------------------------------
  console.log('--- Group 1: Planted Personal Fact Isolation ---');

  const plantedSecretCode = 'SECRET-PIN-7749-PRIVATE';
  const plantedSecretFood = 'mango gelato with crushed pistachios';

  // Plant personal memories into the Personal Mind
  await memoryStore.createMemory({
    founderId: testFounderId,
    memoryType: 'PERSONAL_CONTEXT_NOTE',
    content: `My private security code is ${plantedSecretCode} and my secret midnight snack is ${plantedSecretFood}.`,
    confidence: 0.98,
    lifecycleState: 'ACTIVE',
  });

  await runTest('1.1. Planted personal fact never appears in company metrics answer', async () => {
    const result = await executeSophiaTurn({
      message: 'What is our MRR and cash runway?',
      founderId: testFounderId,
    });

    assert.strictEqual(result.success, true);
    assert.ok(!result.reply.includes(plantedSecretCode), 'Personal secret PIN must not leak in company metrics answer');
    assert.ok(!result.reply.includes(plantedSecretFood), 'Personal secret snack must not leak in company metrics answer');
    assert.ok(result.scopes?.includes('company_brain'), 'Company metrics answer must report scope company_brain');
    assert.ok(!result.scopes?.includes('personal_mind'), 'Company metrics answer must NOT report scope personal_mind');
    assert.ok(!result.sources?.includes('SophiaMemoryStore'), 'Sources must not include SophiaMemoryStore for company question');
  });

  await runTest('1.2. Planted personal fact never appears in company knowledge / general query answer', async () => {
    const result = await executeSophiaTurn({
      message: 'What are the company strategic initiatives?',
      founderId: testFounderId,
    });

    assert.strictEqual(result.success, true);
    assert.ok(!result.reply.includes(plantedSecretCode), 'Personal secret PIN must not leak in company strategy answer');
    assert.ok(!result.reply.includes(plantedSecretFood), 'Personal secret food must not leak in company strategy answer');
    assert.ok(result.scopes?.includes('company_brain'), 'Strategy query must report scope company_brain');
    assert.ok(!result.scopes?.includes('personal_mind'), 'Strategy query must NOT report scope personal_mind');
  });

  await runTest('1.3. Context assembler with scope: "company_only" strictly excludes Personal Mind', async () => {
    const ctx = await SophiaContextAssembler.assemble({
      message: 'What is our operational financial standing?',
      founderId: testFounderId,
      scope: 'company_only',
    });

    const personalSlice = ctx.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    assert.strictEqual(personalSlice, undefined, 'PERSONAL_MIND_MEMORY slice must not be present when scope is company_only');
    assert.ok(ctx.scopes?.includes('company_brain'), 'Assembled scopes must include company_brain');
    assert.ok(!ctx.scopes?.includes('personal_mind'), 'Assembled scopes must NOT include personal_mind');
    assert.ok(!ctx.formattedContext.includes(plantedSecretCode), 'Formatted context must not contain planted personal secret');
  });

  // --------------------------------------------------------------------------
  // Group 2: Each Answer Lists Scopes and Sources
  // --------------------------------------------------------------------------
  console.log('\n--- Group 2: Scopes and Sources Reporting ---');

  await runTest('2.1. Personal question answers from Personal Mind and lists scope and sources', async () => {
    const result = await executeSophiaTurn({
      message: 'What is my secret midnight snack preference?',
      founderId: testFounderId,
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.reply.includes(plantedSecretFood), 'Personal query must find and answer from Personal Mind');
    assert.ok(result.scopes?.includes('personal_mind'), 'Result must include personal_mind scope');
    assert.ok(result.sources?.includes('SophiaMemoryStore'), 'Result must cite SophiaMemoryStore as source');
    assert.ok(result.reply.includes('Scopes: personal_mind'), 'Reply text must cite Scopes: personal_mind');
    assert.ok(result.reply.includes('Sources: SophiaMemoryStore'), 'Reply text must cite Sources: SophiaMemoryStore');
  });

  await runTest('2.2. Company metrics question lists company_brain scope and sources', async () => {
    const result = await executeSophiaTurn({
      message: 'What is our MRR and gross margin?',
      founderId: testFounderId,
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.scopes?.includes('company_brain'), 'Result must include company_brain scope');
    assert.ok(result.sources?.some(s => s.includes('CompanyStateStore')), 'Result must cite CompanyStateStore');
    assert.ok(result.reply.includes('Scopes: company_brain'), 'Reply text must cite Scopes: company_brain');
    assert.ok(result.reply.includes('Sources:'), 'Reply text must cite Sources:');
  });

  await runTest('2.3. Conversational greeting reads neither scope and reports empty scopes', async () => {
    const result = await executeSophiaTurn({
      message: 'Hello Sophia, good morning!',
      founderId: testFounderId,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.scopes?.length, 0, 'Conversational greeting must not read any memory scopes');
    assert.strictEqual(result.sources?.length, 0, 'Conversational greeting must not cite any memory sources');
  });

  // --------------------------------------------------------------------------
  // Group 3: Empty Result Abstention (Honest 'I do not remember')
  // --------------------------------------------------------------------------
  console.log('\n--- Group 3: Empty Result Abstention ---');

  await runTest('3.1. Personal question with empty memory result gives honest "I do not remember"', async () => {
    const emptyFounderId = `test-founder-empty-${Date.now()}`;
    const result = await executeSophiaTurn({
      message: 'What is my pet dog name and breed?',
      founderId: emptyFounderId,
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.reply.includes('I do not remember'), 'Must honestly abstain with "I do not remember" on empty personal memory');
    assert.ok(result.scopes?.includes('personal_mind'), 'Must list personal_mind scope');
    assert.ok(result.sources?.includes('SophiaMemoryStore'), 'Must list SophiaMemoryStore source');
  });

  await runTest('3.2. Company question with no matching facts/knowledge gives honest "I do not remember"', async () => {
    const result = await executeSophiaTurn({
      message: 'What is the guideline on quantum hyperdrive tachyon emissions?',
      founderId: testFounderId,
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.reply.includes('I do not remember'), 'Must honestly abstain with "I do not remember" on missing company facts');
    assert.ok(result.scopes?.includes('company_brain'), 'Must list company_brain scope');
  });

  // --------------------------------------------------------------------------
  // Group 4: Context Assembler Partitioning Tests
  // --------------------------------------------------------------------------
  console.log('\n--- Group 4: Context Assembler Partitioning ---');

  await runTest('4.1. scope: "personal_only" assembles exclusively personal memory', async () => {
    const ctx = await SophiaContextAssembler.assemble({
      message: 'tell me about my preferences',
      founderId: testFounderId,
      scope: 'personal_only',
    });

    assert.ok(ctx.scopes?.includes('personal_mind'), 'Must include personal_mind');
    assert.ok(!ctx.scopes?.includes('company_brain'), 'Must NOT include company_brain');
    assert.ok(ctx.slices.every((s) => s.authority === 'PERSONAL_MIND_MEMORY'), 'All slices must be PERSONAL_MIND_MEMORY');
  });

  await runTest('4.2. scope: "none" assembles zero memory slices', async () => {
    const ctx = await SophiaContextAssembler.assemble({
      message: 'hey how are you',
      founderId: testFounderId,
      scope: 'none',
    });

    assert.strictEqual(ctx.scopes?.length, 0, 'Scopes must be empty');
    assert.strictEqual(ctx.slices.length, 0, 'Slices must be empty');
  });

  await runTest('4.3. scope: "all" preserves full context assembly for backward compatibility', async () => {
    const ctx = await SophiaContextAssembler.assemble({
      message: 'what are our strategic priorities and my notes',
      founderId: testFounderId,
      scope: 'all',
    });

    assert.ok(ctx.scopes?.includes('company_brain'), 'Must include company_brain');
    assert.ok(ctx.scopes?.includes('personal_mind'), 'Must include personal_mind');
    assert.ok(ctx.slices.some((s) => s.authority === 'PERSONAL_MIND_MEMORY'), 'Must contain personal memory');
    assert.ok(ctx.slices.some((s) => s.authority !== 'PERSONAL_MIND_MEMORY'), 'Must contain company memory');
  });

  // --------------------------------------------------------------------------
  // Group 5: Client Seam Integration (SofiaUI chat endpoint)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 5: Client Seam Integration ---');

  await runTest('5.1. sophiaChatTurn forwards scopes and sources in HTTP response', async () => {
    const res = await sophiaChatTurn(testFounderId, {
      lastUser: 'What is my secret midnight snack preference?',
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.scopes), 'Response must have scopes array');
    assert.ok(data.scopes.includes('personal_mind'), 'Scopes must include personal_mind');
    assert.ok(Array.isArray(data.sources), 'Response must have sources array');
    assert.ok(data.sources.some((s: any) => s.title?.includes('SophiaMemoryStore')), 'Sources must cite SophiaMemoryStore');
  });

  console.log('\n======================================================');
  console.log('M1.3 TEST RESULTS: ALL TESTS PASSED');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
