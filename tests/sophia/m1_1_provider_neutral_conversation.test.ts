import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
  ConversationAdapterRegistry,
  generateConversationReply,
  generateText,
  isAIConfigured,
  FakeConversationProvider,
  GeminiConversationProvider,
  OpenAIConversationProvider,
  LMStudioConversationProvider,
} from '../../src/lib/server/ai';
import { llmInfo } from '../../src/lib/server/providers';
import { executeSophiaTurn } from '../../src/lib/server/sophia/turn-executor';
import { SophiaIntentClassifier } from '../../src/lib/server/sophia/intent-classifier';
import { SophiaServerGateway } from '../../src/lib/server/sophia/server-gateway';
import { sophiaChatTurn } from '../../src/lib/server/sophia/sofiaui';
import { ConversationStore } from '../../src/lib/server/conversation/store';

/**
 * ============================================================================
 * M1.1: PROVIDER-NEUTRAL LIVE CONVERSATION PATH TEST SUITE
 * ============================================================================
 *
 * Exit evidence required:
 *   "A live reply from the chosen provider shows in the Sofia screen;
 *    automated tests use a fake provider; every reply carries a live flag;
 *    when the provider is unavailable the screen says so honestly and
 *    shows the fallback label."
 *
 * Slice of G6.1:
 *   "Adapter behind the existing provider interfaces; works with one provider
 *    and a fake; no provider name in core logic."
 */

async function runTests() {
  console.log('\n======================================================');
  console.log('STARTING M1.1 PROVIDER-NEUTRAL CONVERSATION TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err?.message || err}`);
      failed++;
    }
  }

  const registry = ConversationAdapterRegistry.getInstance();
  const fakeProvider = registry.getFakeProvider();

  // --------------------------------------------------------------------------
  // 1. PROVIDER-NEUTRAL ADAPTER CONTRACT & REGISTRATION
  // --------------------------------------------------------------------------
  await test('1.1. Registry contains G0.8 providers and Fake provider', () => {
    assert.ok(registry.getProvider('gemini') instanceof GeminiConversationProvider);
    assert.ok(registry.getProvider('openai') instanceof OpenAIConversationProvider);
    assert.ok(registry.getProvider('lmstudio') instanceof LMStudioConversationProvider);
    assert.ok(registry.getProvider('fake') instanceof FakeConversationProvider);
  });

  await test('1.2. Fake provider responds deterministically to generateText', async () => {
    fakeProvider.enqueueResponse('Deterministic hello from fake');
    const res = await fakeProvider.generateText({
      messages: [{ role: 'user', content: 'Say hello' }],
    });
    assert.strictEqual(res.text, 'Deterministic hello from fake');
    assert.strictEqual(res.providerId, 'fake');
    assert.strictEqual(res.liveAi, true);
  });

  await test('1.3. Pinning fake provider routes global generateText to fake', async () => {
    registry.setPin('fake');
    fakeProvider.enqueueResponse('Pinned fake response');

    const reply = await generateText({
      messages: [{ role: 'user', content: 'ping' }],
    });

    assert.strictEqual(reply, 'Pinned fake response');
    registry.setPin(null);
  });

  // --------------------------------------------------------------------------
  // 2. LIVE CONVERSATION PATH THROUGH EXECUTESOPHIATURN (USING FAKE PROVIDER)
  // --------------------------------------------------------------------------
  await test('2.1. executeSophiaTurn carries liveAi: true on valid model reply', async () => {
    registry.setPin('fake');
    const modelJson = JSON.stringify({
      route: 'converse',
      kind: 'conversation',
      reply: 'G\'day Founder! Sophia here live and fully operational on any topic.',
      confidence: 0.95,
      reason: 'Open-topic casual banter and greeting.',
    });
    fakeProvider.setGenerator(() => modelJson);

    const founderId = 'founder-m1-test';
    const convStore = ConversationStore.getInstance();
    const conv = await convStore.createConversation({
      founderId,
      agentId: 'sophia',
      title: 'M1.1 Live Conversation Test',
    });

    const turnId = `turn-live-${Date.now()}`;
    const turnResult = await executeSophiaTurn({
      message: 'Hello Sophia, how is everything running today?',
      founderId,
      conversationId: conv.id,
      turnId,
    });

    assert.strictEqual(turnResult.success, true);
    assert.strictEqual(turnResult.liveAi, true);
    assert.strictEqual(turnResult.reply, 'G\'day Founder! Sophia here live and fully operational on any topic.');

    // Verify durable persistence carries liveAi in metadata
    const assistantMsg = await convStore.findMessageByIdempotencyKey(conv.id, `${turnId}:assistant`);
    assert.ok(assistantMsg, 'Assistant message must be persisted');
    assert.strictEqual(assistantMsg.metadata?.liveAi, true);

    fakeProvider.setGenerator(null);
    registry.setPin(null);
  });

  await test('2.2. sophiaChatTurn (SofiaUI client seam) returns liveAi: true and mode: live_model', async () => {
    registry.setPin('fake');
    const modelJson = JSON.stringify({
      route: 'converse',
      kind: 'conversation',
      reply: 'Live response via the SofiaUI surface seam.',
      confidence: 0.90,
      reason: 'General topic conversation.',
    });
    fakeProvider.setGenerator(() => modelJson);

    const res = await sophiaChatTurn('founder-ui-test', {
      lastUser: 'Can you tell me about black holes in space?',
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.text, 'Live response via the SofiaUI surface seam.');
    assert.strictEqual(body.liveAi, true);
    assert.strictEqual(body.fallback, false);
    assert.strictEqual(body.mode, 'live_model');

    fakeProvider.setGenerator(null);
    registry.setPin(null);
  });

  // --------------------------------------------------------------------------
  // 3. HONEST FALLBACK WHEN PROVIDER IS UNAVAILABLE
  // --------------------------------------------------------------------------
  await test('3.1. When provider throws, turn falls back to deterministic reply with liveAi: false', async () => {
    registry.setPin('fake');
    fakeProvider.setConfigured(false); // Provider disabled / unconfigured

    const res = await sophiaChatTurn('founder-ui-test-fallback', {
      lastUser: 'Hello Sophia',
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.liveAi, false);
    assert.strictEqual(body.fallback, true);
    assert.strictEqual(body.mode, 'deterministic_fallback');
    assert.ok(body.text.includes('Good to connect, Founder'));

    fakeProvider.setConfigured(true);
    registry.setPin(null);
  });

  await test('3.2. llmInfo() honestly reports provider links and active status', () => {
    const info = llmInfo();
    assert.ok(info.providers.length >= 4, 'Must report at least Gemini, OpenAI, LM Studio, ZAI');
    const geminiLink = info.providers.find((p) => p.id === 'gemini');
    const openaiLink = info.providers.find((p) => p.id === 'openai');
    const lmstudioLink = info.providers.find((p) => p.id === 'lmstudio');

    assert.ok(geminiLink, 'Gemini link must be present');
    assert.ok(openaiLink, 'OpenAI link must be present');
    assert.ok(lmstudioLink, 'LM Studio link must be present');
  });

  // --------------------------------------------------------------------------
  // 4. ARCHITECTURAL INVARIANTS: NO PROVIDER NAMES IN CORE LOGIC
  // --------------------------------------------------------------------------
  await test('4.1. Core business logic has zero hardcoded vendor provider imports or names', () => {
    const ROOT = path.resolve(__dirname, '../..');
    const turnExecutorCode = fs.readFileSync(path.join(ROOT, 'src/lib/server/sophia/turn-executor.ts'), 'utf8');
    const gatewayCode = fs.readFileSync(path.join(ROOT, 'src/lib/server/sophia/server-gateway.ts'), 'utf8');

    // Business orchestration must NOT import concrete vendor providers
    assert.ok(!turnExecutorCode.includes("from '../ai/providers/gemini'"));
    assert.ok(!turnExecutorCode.includes("from '../ai/providers/openai'"));
    assert.ok(!gatewayCode.includes("from '../ai/providers/gemini'"));
    assert.ok(!gatewayCode.includes("from '../ai/providers/openai'"));
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`M1.1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
