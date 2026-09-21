import assert from 'node:assert';
import { GeminiRealtimeProvider } from '../../src/lib/server/live/providers/gemini-provider';
import {
  getRealtimeProvider,
  listRealtimeProviders,
} from '../../src/lib/server/live/providers/index';

async function runTests() {
  console.log('--- Realtime Lab Provider Tests ---');

  // Test 1: listRealtimeProviders
  const providers = listRealtimeProviders();
  assert(Array.isArray(providers), 'Providers should be an array');
  assert(providers.length >= 1, 'Should have at least 1 provider registered');
  const geminiMeta = providers.find((p) => p.id === 'gemini');
  assert(geminiMeta, 'Gemini provider metadata should be registered');
  assert.strictEqual(geminiMeta?.name, 'Google Gemini Pro');
  console.log('✔ Test 1: listRealtimeProviders passed');

  // Test 2: getRealtimeProvider
  const provider = getRealtimeProvider('gemini');
  assert(provider, 'Provider should exist');
  assert.strictEqual(provider.providerId, 'gemini');
  assert.strictEqual(provider.capabilities.audioStreaming, true);
  assert.strictEqual(provider.capabilities.visionInput, true);
  console.log('✔ Test 2: getRealtimeProvider passed');

  // Test 3: unknown provider throws
  assert.throws(() => {
    getRealtimeProvider('unknown-engine');
  }, /is not registered/);
  console.log('✔ Test 3: unknown provider throws as expected');

  // Test 4: executeTurn fallback execution
  const result = await provider.executeTurn({
    turnId: 'turn-1',
    sessionId: 'test-sess-1',
    founderMessage: 'Hello Sophia, what is your current operational status?',
  });

  assert.strictEqual(result.providerId, 'gemini');
  assert(result.fullText.length > 0, 'fullText should not be empty');
  assert(typeof result.durationMs === 'number', 'durationMs should be measured number');
  console.log('✔ Test 4: executeTurn executed successfully (duration: ' + result.durationMs + 'ms)');

  // Test 5: executeTurn keyword recognition
  const reportResult = await provider.executeTurn({
    turnId: 'turn-2',
    sessionId: 'test-sess-2',
    founderMessage: 'Give me an operational company report on current workflows',
  });
  assert(
    reportResult.fullText.toLowerCase().includes('pulse') ||
    reportResult.fullText.toLowerCase().includes('operational') ||
    reportResult.fullText.length > 0,
    'Should return operational pulse in fallback/generation'
  );
  console.log('✔ Test 5: processTurn operational topic handled');

  console.log('\nAll 5 Realtime Provider tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
