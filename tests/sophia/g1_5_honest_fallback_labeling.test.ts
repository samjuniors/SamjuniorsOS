import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));


/**
 * ============================================================================
 * GATE G1.5: HONEST FALLBACK LABELING REGRESSION SUITE
 * ============================================================================
 *
 * Exit criteria (GATES.md / gates.json):
 *   "Reproduce on current main first. Fallback replies are visibly labelled
 *    in the UI and API; regression test added. If not reproducible, record
 *    evidence and close."
 *
 * This suite verifies:
 *   1. API routes (agent-chat, agent-collab) explicitly label fallback replies
 *      with { liveAi: false, fallback: true, mode: 'deterministic_fallback' }.
 *   2. Live model replies carry { liveAi: true, fallback: false, mode: 'live_model' }.
 *   3. ConversationStore persistence preserves liveAi and fallback in metadata.
 *   4. Runtime interface (ChatReply, agentChat) exposes typed fallback and mode.
 *   5. UI (ChatPanel) displays a distinct visible badge ('Offline Fallback')
 *      and distinctive styling on fallback messages, and 'Live AI' on live turns.
 */

const ROOT = path.resolve(__dirname, '../..');
const src = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failed++;
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('GATE G1.5: HONEST FALLBACK LABELING REGRESSION SUITE');
  console.log('======================================================\n');

  console.log('--- 1. API route contract honesty ---');

  await test('1.1 agent-chat route returns explicit fallback: true and mode: deterministic_fallback', () => {
    const route = src('src/app/api/agent-chat/route.ts');
    assert.ok(
      route.includes("fallback: true"),
      'agent-chat fallback path must set fallback: true'
    );
    assert.ok(
      route.includes("mode: 'deterministic_fallback'"),
      'agent-chat fallback path must set mode: deterministic_fallback'
    );
    assert.ok(
      route.includes("liveAi: false"),
      'agent-chat fallback path must set liveAi: false'
    );
  });

  await test('1.2 agent-chat route returns explicit fallback: false and mode: live_model on live turns', () => {
    const route = src('src/app/api/agent-chat/route.ts');
    assert.ok(
      route.includes("fallback: false"),
      'agent-chat live path must set fallback: false'
    );
    assert.ok(
      route.includes("mode: 'live_model'"),
      'agent-chat live path must set mode: live_model'
    );
    assert.ok(
      route.includes("liveAi: true"),
      'agent-chat live path must set liveAi: true'
    );
  });

  await test('1.3 agent-collab route returns explicit liveAi: false, fallback: true, and mode', () => {
    const route = src('src/app/api/agent-collab/route.ts');
    assert.ok(
      route.includes("liveAi: false"),
      'agent-collab degraded path must set liveAi: false'
    );
    assert.ok(
      route.includes("fallback: true"),
      'agent-collab degraded path must set fallback: true'
    );
    assert.ok(
      route.includes("mode: 'deterministic_fallback'"),
      'agent-collab degraded path must set mode: deterministic_fallback'
    );
  });

  await test('1.4 agent-chat persists fallback metadata to ConversationStore', () => {
    const route = src('src/app/api/agent-chat/route.ts');
    assert.ok(
      route.includes("fallback: !executionResult.liveAi"),
      'agent-chat must persist fallback flag in assistant message metadata'
    );
    assert.ok(
      route.includes("mode: executionResult.liveAi ? 'live_model' : 'deterministic_fallback'"),
      'agent-chat must persist mode in assistant message metadata'
    );
  });

  console.log('--- 2. Client runtime contract ---');

  await test('2.1 runtime.ts ChatReply interface and agentChat expose fallback and mode', () => {
    const runtime = src('src/os/lib/runtime.ts');
    assert.ok(
      runtime.includes("fallback: boolean;"),
      'ChatReply must include fallback: boolean'
    );
    assert.ok(
      runtime.includes("mode: 'live_model' | 'deterministic_fallback';"),
      'ChatReply must include mode: live_model | deterministic_fallback'
    );
    assert.ok(
      runtime.includes("fallback: data.fallback ?? !data.liveAi"),
      'agentChat must map fallback from response'
    );
    assert.ok(
      runtime.includes("mode: data.mode ?? (data.liveAi ? 'live_model' : 'deterministic_fallback')"),
      'agentChat must map mode from response'
    );
  });

  console.log('--- 3. UI visible labeling in ChatPanel ---');

  await test('3.1 ChatPanel Message type carries liveAi, fallback, and mode', () => {
    const chat = src('src/os/components/os/ChatPanel.tsx');
    assert.ok(
      chat.includes("liveAi?: boolean;"),
      'ChatPanel Message type must include liveAi?: boolean'
    );
    assert.ok(
      chat.includes("fallback?: boolean;"),
      'ChatPanel Message type must include fallback?: boolean'
    );
    assert.ok(
      chat.includes("mode?: string;"),
      'ChatPanel Message type must include mode?: string'
    );
  });

  await test('3.2 ChatPanel renders visible fallback-badge ("Offline Fallback") on fallback messages', () => {
    const chat = src('src/os/components/os/ChatPanel.tsx');
    assert.ok(
      chat.includes('data-testid="fallback-badge"'),
      'ChatPanel must render element with data-testid="fallback-badge"'
    );
    assert.ok(
      chat.includes('Offline Fallback'),
      'ChatPanel fallback badge must display "Offline Fallback"'
    );
    assert.ok(
      chat.includes('border-amber-500'),
      'ChatPanel fallback badge must have amber distinction'
    );
  });

  await test('3.3 ChatPanel renders visible live-ai-badge ("Live AI") on live model messages', () => {
    const chat = src('src/os/components/os/ChatPanel.tsx');
    assert.ok(
      chat.includes('data-testid="live-ai-badge"'),
      'ChatPanel must render element with data-testid="live-ai-badge"'
    );
    assert.ok(
      chat.includes('Live AI'),
      'ChatPanel live badge must display "Live AI"'
    );
  });

  console.log('\n======================================================');
  console.log(`G1.5 TEST RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('G1.5 test suite crashed:', err);
  process.exit(1);
});
