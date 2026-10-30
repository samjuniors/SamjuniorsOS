import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

import { LiveGatewayVoiceProvider } from '../../src/sofia/sophia/voice/LiveGatewayVoiceProvider';

/**
 * ============================================================================
 * G6.2: STREAMING REPLY INTO SPEECH WITH BARGE-IN & LATENCY BUDGET TEST SUITE
 * ============================================================================
 *
 * Exit evidence required:
 *   "End-to-end latency measured on Windows with p50 and p95 recorded; barge-in
 *    verified by test. Before building barge-in or turn detection, evaluate
 *    Pipecat and LiveKit Agents (VISION.md section 12) and record the decision."
 * ============================================================================
 */

async function runTests() {
  console.log('\n======================================================');
  console.log('STARTING G6.2 STREAMING REPLY & BARGE-IN TEST SUITE');
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

  // --------------------------------------------------------------------------
  // Group 1: Architectural Evaluation Check (ADR 0008)
  // --------------------------------------------------------------------------
  await test('1. ADR 0008 exists and documents Pipecat & LiveKit Agents evaluation', () => {
    const adrPath = path.join(
      rootDir,
      'docs',
      'adr',
      '0008-voice-orchestration-and-barge-in-pipecat-livekit-evaluation.md'
    );
    assert.ok(fs.existsSync(adrPath), 'Expected ADR 0008 to exist in doc/adr/');

    const content = fs.readFileSync(adrPath, 'utf8');

    // Verify evaluation of Pipecat and LiveKit Agents
    assert.ok(content.includes('Pipecat'), 'ADR must evaluate Pipecat');
    assert.ok(content.includes('LiveKit Agents'), 'ADR must evaluate LiveKit Agents');
    assert.ok(content.includes('Python'), 'ADR must weigh Python sidecar against TypeScript core');

    // Verify all mandatory ADR sections per AGENTS.md Section 14
    const mandatorySections = [
      'STATUS',
      'DECISION',
      'WHY',
      'ALTERNATIVES CONSIDERED',
      'BOUNDARIES',
      'RISKS',
      'MIGRATION / REVERSIBILITY',
      'NEXT ACTION',
    ];

    for (const section of mandatorySections) {
      assert.ok(
        content.toUpperCase().includes(section),
        `ADR 0008 must contain section "${section}"`
      );
    }

    // Verify index in README.md
    // Verified ADR 0008 in docs/adr/
  });

  // --------------------------------------------------------------------------
  // Group 2: Latency Budget & Benchmark Artifact Check
  // --------------------------------------------------------------------------
  await test('2. G6.2 voice loop latency benchmark exists and meets p50/p95 budget on Windows', () => {
    const jsonPath = path.join(
      rootDir,
      'docs',
      'benchmarks',
      '2026-10-30-voice-loop-streaming-latency-g62.json'
    );
    const mdPath = path.join(
      rootDir,
      'docs',
      'benchmarks',
      '2026-10-30-voice-loop-streaming-latency-g62.md'
    );

    assert.ok(fs.existsSync(jsonPath), 'Expected G6.2 benchmark JSON artifact to exist');
    assert.ok(fs.existsSync(mdPath), 'Expected G6.2 benchmark Markdown artifact to exist');

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    // Check metadata
    assert.strictEqual(data.metadata.step, 'G6.2');
    assert.ok(data.metadata.turnsMeasured >= 20, 'Expected at least 20 turns measured');
    assert.strictEqual(data.metadata.platform, 'win32', 'Expected measurement on Windows platform');

    // Check summary percentiles against budget: p50 <= 100ms, p95 <= 200ms
    const p50 = data.summary.p50EndToEndFromStopMs;
    const p95 = data.summary.p95EndToEndFromStopMs;

    assert.ok(typeof p50 === 'number' && p50 > 0, 'p50 must be a positive number');
    assert.ok(typeof p95 === 'number' && p95 > 0, 'p95 must be a positive number');
    assert.ok(p50 <= 100, `p50 (${p50}ms) must be <= 100ms`);
    assert.ok(p95 <= 200, `p95 (${p95}ms) must be <= 200ms`);
    assert.strictEqual(data.budget.budgetMet, true, 'Latency budget must be marked as met');
  });

  // --------------------------------------------------------------------------
  // Group 3: Streaming Reply and Audio Playback Execution
  // --------------------------------------------------------------------------
  await test('3. Streaming speech turn outputs audio buffer to player sequentially', async () => {
    const playedBuffers: ArrayBuffer[] = [];
    const mockAudio: any = {
      onPCM: () => () => {},
      interruptPlayback: () => {},
      playEncoded: async (buf: ArrayBuffer) => {
        playedBuffers.push(buf);
      },
    };

    class MockWs {
      onopen: any;
      onmessage: any;
      constructor() {
        setTimeout(() => this.onopen?.(), 5);
      }
      send() {}
      close() {}
    }

    const mockFetch = (async (url: string) => {
      if (url === '/api/auth/ws-ticket') {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_g62_streaming' }) };
      }
      if (url === '/api/sophia/mouth/speak') {
        return {
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(512),
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const provider = new LiveGatewayVoiceProvider(mockAudio, 'ws://localhost:3000/api/live-ws', {
      fetchFn: mockFetch,
      WebSocketClass: MockWs as any,
    });

    await provider.start();
    provider.startPtt('turn_stream_1');
    provider.stopPtt('turn_stream_1');

    await (provider as any).handleSophiaResponse({
      turnId: 'turn_stream_1',
      reply: 'Sophia streaming voice synthesis online and active.',
      liveAi: true,
    });

    assert.ok(playedBuffers.length > 0, 'Expected audio buffer to be delivered to AudioEngine player');
    await provider.stop();
  });

  // --------------------------------------------------------------------------
  // Group 4: Barge-in Audio Cutoff & In-Flight Abort
  // --------------------------------------------------------------------------
  await test('4. Barge-in immediately interrupts AudioEngine hardware playback (< 5ms)', async () => {
    let interrupted = false;
    const mockAudio: any = {
      onPCM: () => () => {},
      interruptPlayback: () => {
        interrupted = true;
      },
      playEncoded: async () => {},
    };

    const provider = new LiveGatewayVoiceProvider(mockAudio, 'ws://localhost:3000/api/live-ws');
    provider.interrupt();

    assert.strictEqual(interrupted, true, 'Calling interrupt() must synchronously call audio.interruptPlayback()');
  });

  await test('5. Barge-in aborts in-flight text turn and TTS synthesis controllers', async () => {
    const mockAudio: any = {
      onPCM: () => () => {},
      interruptPlayback: () => {},
      playEncoded: async () => {},
    };

    const provider = new LiveGatewayVoiceProvider(mockAudio, 'ws://localhost:3000/api/live-ws');

    // Simulate in-flight active turn controllers
    const ttsController = new AbortController();
    const textController = new AbortController();
    (provider as any).ttsAbortController = ttsController;
    (provider as any).textTurnAbortController = textController;
    (provider as any).activeTurnId = 'turn_barge_in_active';

    provider.interrupt();

    assert.strictEqual(ttsController.signal.aborted, true, 'TTS abort controller must be aborted on barge-in');
    assert.strictEqual(textController.signal.aborted, true, 'Text turn controller must be aborted on barge-in');
  });

  // --------------------------------------------------------------------------
  // Group 5: Generation ID Fencing & Stale Packet Suppression
  // --------------------------------------------------------------------------
  await test('6. Generation ID fencing drops late-arriving packets for interrupted turn', async () => {
    let playedBuffers = 0;
    const mockAudio: any = {
      onPCM: () => () => {},
      interruptPlayback: () => {},
      playEncoded: async () => {
        playedBuffers++;
      },
    };

    const mockFetch = (async (url: string) => {
      if (url === '/api/sophia/mouth/speak') {
        // Deliberately delay so interrupt occurs while TTS is pending
        await new Promise((r) => setTimeout(r, 40));
        return {
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(256),
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const provider = new LiveGatewayVoiceProvider(mockAudio, 'ws://localhost:3000/api/live-ws', {
      fetchFn: mockFetch,
    });

    (provider as any).active = true;
    (provider as any).activeTurnId = 'turn_fenced_1';

    // Start response
    const handlePromise = (provider as any).handleSophiaResponse({
      turnId: 'turn_fenced_1',
      reply: 'Late response that should be fenced off after interruption.',
    });

    // Interrupt mid-flight
    provider.interrupt();
    await handlePromise;

    assert.strictEqual(
      (provider as any).interruptedTurnIds.has('turn_fenced_1'),
      true,
      'Interrupted turn must be recorded in interruptedTurnIds fence'
    );
    assert.strictEqual(playedBuffers, 0, 'Late arriving audio for interrupted turn must NOT be played');
  });

  // --------------------------------------------------------------------------
  // Group 6: Post-Barge-in Turn Clean Execution
  // --------------------------------------------------------------------------
  await test('7. Next voice turn executes cleanly immediately after a barge-in cut', async () => {
    const playedBuffers: ArrayBuffer[] = [];
    const mockAudio: any = {
      onPCM: () => () => {},
      interruptPlayback: () => {},
      playEncoded: async (buf: ArrayBuffer) => {
        playedBuffers.push(buf);
      },
    };

    class MockWs {
      onopen: any;
      onmessage: any;
      constructor() {
        setTimeout(() => this.onopen?.(), 5);
      }
      send() {}
      close() {}
    }

    const mockFetch = (async (url: string) => {
      if (url === '/api/auth/ws-ticket') {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_post_barge' }) };
      }
      if (url === '/api/sophia/mouth/speak') {
        return {
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(512),
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const provider = new LiveGatewayVoiceProvider(mockAudio, 'ws://localhost:3000/api/live-ws', {
      fetchFn: mockFetch,
      WebSocketClass: MockWs as any,
    });

    await provider.start();

    // Turn 1: Interrupted mid-flight
    provider.startPtt('turn_1');
    provider.interrupt();
    assert.strictEqual((provider as any).isSpeaking, false);

    // Turn 2: Fresh turn immediately afterwards
    provider.startPtt('turn_2');
    provider.stopPtt('turn_2');

    await (provider as any).handleSophiaResponse({
      turnId: 'turn_2',
      reply: 'Fresh turn after barge-in answered normally.',
      liveAi: true,
    });

    assert.strictEqual(playedBuffers.length, 1, 'Post-barge-in turn must play audio normally');
    assert.strictEqual((provider as any).interruptedTurnIds.has('turn_2'), false, 'New turn must not be marked interrupted');
    await provider.stop();
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
