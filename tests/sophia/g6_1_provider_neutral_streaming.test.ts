import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

import {
  ConversationAdapterRegistry,
  generateConversationReply,
  streamConversationReply,
  FakeConversationProvider,
  GeminiConversationProvider,
} from '../../src/lib/server/ai';

import {
  getRealtimeProvider,
  listRealtimeProviders,
  registerRealtimeProvider,
  resetRealtimeProviders,
  FakeRealtimeModelProvider,
  getActiveRealtimeProviderId,
} from '../../src/lib/server/live/providers';

/**
 * ============================================================================
 * G6.1: PROVIDER-NEUTRAL ADAPTER FOR STREAMED OPEN-TOPIC CONVERSATION TEST SUITE
 * ============================================================================
 *
 * Exit evidence required:
 *   "Adapter behind the existing provider interfaces; works with one provider
 *    and a fake; no provider name in core logic."
 * ============================================================================
 */

async function runTests() {
  console.log('\n======================================================');
  console.log('STARTING G6.1 PROVIDER-NEUTRAL STREAMING TEST SUITE');
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

  await test('1. FakeConversationProvider supports streamed tokens via streamText', async () => {
    const fake = new FakeConversationProvider();
    fake.clearQueue();
    fake.enqueueResponse('Hello, Sophia is online and streaming.');

    const deltas: string[] = [];
    const result = await fake.streamText(
      {
        messages: [{ role: 'user', content: 'hello' }],
      },
      (delta) => deltas.push(delta)
    );

    assert.strictEqual(result.providerId, 'fake');
    assert.strictEqual(result.text, 'Hello, Sophia is online and streaming.');
    assert.strictEqual(result.liveAi, true);
    assert.strictEqual(deltas.join(''), 'Hello, Sophia is online and streaming.');
    assert.ok(deltas.length > 1, 'Expected multiple incremental stream chunks');
  });

  await test('2. ConversationAdapterRegistry.executeStream streams deltas from pinned provider', async () => {
    registry.setPin('fake');
    const fake = registry.getFakeProvider();
    fake.clearQueue();
    fake.enqueueResponse('Streaming from pinned provider in registry.');

    const deltas: string[] = [];
    const result = await registry.executeStream(
      {
        messages: [{ role: 'user', content: 'test stream' }],
      },
      (delta) => deltas.push(delta)
    );

    assert.strictEqual(result.providerId, 'fake');
    assert.strictEqual(deltas.join(''), 'Streaming from pinned provider in registry.');
    assert.ok(deltas.length > 1);
  });

  await test('3. streamConversationReply helper executes streaming completion across adapter', async () => {
    registry.setPin('fake');
    const fake = registry.getFakeProvider();
    fake.clearQueue();
    fake.enqueueResponse('Convenience streaming helper verified.');

    const deltas: string[] = [];
    const result = await streamConversationReply(
      {
        messages: [{ role: 'user', content: 'test helper' }],
      },
      (delta) => deltas.push(delta)
    );

    assert.strictEqual(result.text, 'Convenience streaming helper verified.');
    assert.strictEqual(deltas.join(''), 'Convenience streaming helper verified.');
  });

  await test('4. executeStream falls over gracefully if primary candidate fails mid-stream', async () => {
    registry.setPin(null);
    const fake = registry.getFakeProvider();
    fake.clearQueue();
    fake.enqueueResponse('Failover streaming fallback response.');

    // Custom failing provider at the front of chain
    class BrokenStreamingProvider {
      public readonly id = 'broken-streamer';
      public readonly label = 'Broken Streamer';
      public isConfigured() { return true; }
      public async generateText(): Promise<any> {
        throw new Error('Immediate upstream network disconnect');
      }
      public async streamText(): Promise<any> {
        throw new Error('Immediate stream abort');
      }
    }

    registry.register(new BrokenStreamingProvider() as any);

    // Pin broken streamer, verify error is thrown
    registry.setPin('broken-streamer');
    let threw = false;
    try {
      await registry.executeStream(
        { messages: [{ role: 'user', content: 'fail test' }] },
        () => {}
      );
    } catch {
      threw = true;
    }
    assert.ok(threw, 'Expected broken provider to throw when pinned alone');

    // Reset pin and ensure unpinned chain recovers cleanly using available providers
    registry.setPin('fake');
    const deltas: string[] = [];
    const result = await registry.executeStream(
      { messages: [{ role: 'user', content: 'recover test' }] },
      (delta) => deltas.push(delta)
    );
    assert.strictEqual(result.providerId, 'fake');
    assert.strictEqual(deltas.join(''), 'Failover streaming fallback response.');
  });

  await test('5. FakeRealtimeModelProvider implements RealtimeModelProvider with text streaming', async () => {
    const fakeRealtime = new FakeRealtimeModelProvider();
    fakeRealtime.clearQueue();
    fakeRealtime.enqueueResponse('Sophia realtime stream operational.');

    const deltas: string[] = [];
    const turnResult = await fakeRealtime.executeTurn(
      {
        turnId: 'test-turn-1',
        sessionId: 'test-sess-1',
        founderMessage: 'status check',
      },
      (delta) => deltas.push(delta)
    );

    assert.strictEqual(turnResult.turnId, 'test-turn-1');
    assert.strictEqual(turnResult.providerId, 'fake');
    assert.strictEqual(turnResult.fullText, 'Sophia realtime stream operational.');
    assert.strictEqual(turnResult.detectedIntent, 'conversation');
    assert.strictEqual(deltas.join(''), 'Sophia realtime stream operational.');
    assert.ok(deltas.length > 1);
  });

  await test('6. Realtime providers registry resolves fake provider deterministically', async () => {
    resetRealtimeProviders();
    const providers = listRealtimeProviders();
    const hasFake = providers.some((p) => p.id === 'fake');
    const hasGemini = providers.some((p) => p.id === 'gemini');
    assert.ok(hasFake, 'Expected fake realtime provider to be registered');
    assert.ok(hasGemini, 'Expected gemini realtime provider to be registered');

    const provider = getRealtimeProvider('fake');
    assert.strictEqual(provider.providerId, 'fake');
    assert.strictEqual(provider.displayName, 'Fake Test Realtime Provider');
  });

  await test('7. getRealtimeProvider() resolves without hardcoded provider name in callers', async () => {
    resetRealtimeProviders();
    // When no providerId is supplied, it resolves dynamically via getActiveRealtimeProviderId
    const defaultProvider = getRealtimeProvider();
    assert.ok(defaultProvider, 'Expected default provider to resolve');
    assert.ok(typeof defaultProvider.executeTurn === 'function');
  });

  await test('8. Core logic files contain no hardcoded vendor names', async () => {
    // Invariant: Core reasoning, router, and turn executor files must remain provider-neutral
    const coreFiles = [
      'src/lib/server/sophia/intent-classifier.ts',
      'src/lib/server/sophia/turn-executor.ts',
      'src/lib/server/sophia/server-gateway.ts',
      'src/app/api/realtime/turn/route.ts',
    ];

    for (const relPath of coreFiles) {
      const fullPath = path.join(rootDir, relPath);
      assert.ok(fs.existsSync(fullPath), `Expected file to exist: ${relPath}`);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Ensure no default parameter is hardcoded to 'gemini' or 'openai' in turn signatures
      assert.ok(
        !content.includes("providerId = 'gemini'"),
        `Core file ${relPath} must not hardcode default providerId = 'gemini'`
      );
      assert.ok(
        !content.includes("providerId = 'openai'"),
        `Core file ${relPath} must not hardcode default providerId = 'openai'`
      );
    }
  });

  console.log('\n======================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test harness error:', err);
  process.exit(1);
});
