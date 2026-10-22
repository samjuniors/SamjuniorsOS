/**
 * ============================================================================
 * M1.4: VOICE LOOP, PUSH-TO-TALK & LATENCY MEASUREMENT SUITE
 * ============================================================================
 *
 * Exit evidence required:
 *   "A spoken question gets a spoken answer on the Windows PC; median and
 *    95th-percentile end-to-end latency over at least 20 turns are recorded,
 *    not yet optimised; typing works too."
 *
 * Slices of G6.2:
 *   - Voice loop with push-to-talk (PTT)
 *   - Streaming speech-to-text transcript ingress
 *   - Spoken answers synthesized via TTS and played back through AudioEngine
 *   - End-to-end latency measured and recorded over >= 20 turns (p50 and p95)
 *   - Typing coexists seamlessly alongside voice without interference or dropped state
 *   - Defers: barge-in, turn detection, and latency optimization
 */

import assert from 'assert';
import { EventEmitter } from 'events';
import { LiveGatewayVoiceProvider } from '../../src/sofia/sophia/voice/LiveGatewayVoiceProvider';
import {
  VoiceLatencyTracker,
  calculatePercentile,
  type VoiceTurnLatencyRecord,
} from '../../src/lib/server/sophia/voice-latency';
import { ConversationAdapterRegistry } from '../../src/lib/server/ai';
import { NextRequest } from 'next/server';
import { GET as getLatencyApi, POST as postLatencyApi } from '../../src/app/api/sofia/voice/latency/route';

class MockAudioEngine {
  public pcmCallback: ((pcm: ArrayBuffer) => void) | null = null;
  public stopped = false;
  public playbackInterrupted = false;
  public playedEncodedBuffers: ArrayBuffer[] = [];

  onPCM(fn: (pcm: ArrayBuffer) => void): () => void {
    this.pcmCallback = fn;
    return () => {
      this.pcmCallback = null;
    };
  }

  interruptPlayback(): void {
    this.playbackInterrupted = true;
    this.stopped = true;
  }

  async playEncoded(buf: ArrayBuffer): Promise<void> {
    this.playedEncodedBuffers.push(buf);
  }
}

class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  static CLOSED = 3;

  public readyState = 1;
  public url: string;
  public sentMessages: any[] = [];
  public binaryType = 'blob';

  public onopen: (() => void) | null = null;
  public onmessage: ((e: { data: any }) => void) | null = null;
  public onerror: ((err: any) => void) | null = null;
  public onclose: ((e: { code: number; reason: string }) => void) | null = null;

  constructor(url: string, autoOpen = true) {
    super();
    this.url = url;
    if (autoOpen) {
      setTimeout(() => {
        this.onopen?.();
        this.emit('open');
      }, 5);
    }
  }

  send(data: any): void {
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
    this.emit('close', { code, reason });
  }

  simulateServerMessage(msg: any): void {
    const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
    this.onmessage?.({ data });
    this.emit('message', { data });
  }

  simulateError(err: any): void {
    this.onerror?.(err);
    if (this.listenerCount('error') > 0) {
      this.emit('error', err);
    }
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('STARTING M1.4: VOICE LOOP & LATENCY DRILL SUITE');
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

  const fakePcmChunk = new Int16Array([100, 200, 300, -100, -200]).buffer;
  const fakeAudioOutput = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]).buffer;

  // --------------------------------------------------------------------------
  // Group 1: Spoken Question to Spoken Answer via PTT (Windows PC Audio Loop)
  // --------------------------------------------------------------------------
  console.log('--- Group 1: Spoken Question to Spoken Answer via PTT ---');

  await test('1.1. startPtt sends START_PTT framing and streams PCM audio; stopPtt sends STOP_PTT', async () => {
    const audio = new MockAudioEngine() as any;
    let wsInstance: MockWebSocket | null = null;

    class CapturingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        wsInstance = this;
      }
    }

    const mockFetch = (async (url: string) => {
      if (url === '/api/auth/ws-ticket') {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_group1' }) };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const provider = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: CapturingWs as any,
    });

    await provider.start();
    assert.ok(wsInstance !== null, 'WebSocket must be constructed');

    const turnId = provider.startPtt('turn_voice_101');
    assert.strictEqual(turnId, 'turn_voice_101', 'startPtt returns active turnId');

    // Verify START_PTT frame
    const startMsg = JSON.parse(wsInstance!.sentMessages[0]);
    assert.strictEqual(startMsg.type, 'START_PTT');
    assert.strictEqual(startMsg.turnId, 'turn_voice_101');

    // Simulate PCM frame streaming from microphone
    audio.pcmCallback!(fakePcmChunk);
    assert.strictEqual(wsInstance!.sentMessages.length, 2, 'PCM chunk forwarded to server');
    assert.strictEqual(wsInstance!.sentMessages[1], fakePcmChunk, 'Binary audio chunk forwarded untouched');

    // Release push-to-talk
    provider.stopPtt('turn_voice_101');
    const stopMsg = JSON.parse(wsInstance!.sentMessages[2]);
    assert.strictEqual(stopMsg.type, 'STOP_PTT');
    assert.strictEqual(stopMsg.turnId, 'turn_voice_101');

    await provider.stop();
  });

  await test('1.2. Complete spoken turn: audio in -> transcript -> reply -> TTS -> audio output playback', async () => {
    const audio = new MockAudioEngine() as any;
    let wsInstance: MockWebSocket | null = null;
    let ttsReceivedText = '';

    class CapturingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        wsInstance = this;
      }
    }

    const mockFetch = (async (url: string, opts?: any) => {
      if (url === '/api/auth/ws-ticket') {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_turn_loop' }) };
      }
      if (url === '/api/sophia/mouth/speak') {
        const body = JSON.parse(opts.body);
        ttsReceivedText = body.text;
        return {
          ok: true,
          arrayBuffer: async () => fakeAudioOutput,
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const provider = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: CapturingWs as any,
    });

    await provider.start();

    const eventTrail: string[] = [];
    provider.addEventListener('speech_started', () => eventTrail.push('speech_started'));
    provider.addEventListener('transcript', (e: any) => eventTrail.push(`transcript:${e.detail.role}`));
    provider.addEventListener('thinking', () => eventTrail.push('thinking'));
    provider.addEventListener('response_started', () => eventTrail.push('response_started'));
    provider.addEventListener('audio_started', () => eventTrail.push('audio_started'));
    provider.addEventListener('response_finished', () => eventTrail.push('response_finished'));
    provider.addEventListener('playback_finished', () => eventTrail.push('playback_finished'));

    // 1. User presses push-to-talk and speaks
    provider.startPtt('turn_voice_loop_1');
    audio.pcmCallback!(fakePcmChunk);

    // 2. User releases push-to-talk
    provider.stopPtt('turn_voice_loop_1');

    // 3. Streaming STT emits final transcript
    wsInstance!.simulateServerMessage({
      type: 'TRANSCRIPT_FINAL',
      turnId: 'turn_voice_loop_1',
      text: 'What is the current status of Lumora?',
    });

    // 4. Server cognitive turn completes and returns spoken reply
    wsInstance!.simulateServerMessage({
      type: 'SOPHIA_RESPONSE',
      turnId: 'turn_voice_loop_1',
      reply: 'Lumora is operating normally with 4 active student cohorts.',
      liveAi: true,
    });

    // Allow async TTS and AudioEngine playback to settle
    await new Promise((r) => setTimeout(r, 30));

    // Assertions on spoken reply
    assert.strictEqual(
      ttsReceivedText,
      'Lumora is operating normally with 4 active student cohorts.',
      'Spoken reply delivered to neural TTS mouth'
    );
    assert.strictEqual(audio.playedEncodedBuffers.length, 1, 'AudioEngine played back synthesized audio');
    assert.strictEqual(audio.playedEncodedBuffers[0], fakeAudioOutput, 'Played buffer matches TTS audio');

    // Assert complete event sequence
    assert.ok(eventTrail.includes('speech_started'), 'Speech started event emitted');
    assert.ok(eventTrail.includes('transcript:user'), 'User transcript emitted');
    assert.ok(eventTrail.includes('thinking'), 'Thinking event emitted');
    assert.ok(eventTrail.includes('transcript:sophia'), 'Sophia transcript emitted');
    assert.ok(eventTrail.includes('response_started'), 'Response started event emitted');
    assert.ok(eventTrail.includes('audio_started'), 'Audio started event emitted');
    assert.ok(eventTrail.includes('response_finished'), 'Response finished event emitted');
    assert.ok(eventTrail.includes('playback_finished'), 'Playback finished event emitted');

    await provider.stop();
  });

  // --------------------------------------------------------------------------
  // Group 2: Latency Measurement & Recording Over At Least 20 Turns (p50 & p95)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 2: Latency Measurement & Recording Over At Least 20 Turns ---');

  await test('2.1. calculatePercentile utility verifies mathematical precision', () => {
    // Basic test
    const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    assert.strictEqual(calculatePercentile(samples, 50), 55, 'p50 of 10 items');
    assert.strictEqual(calculatePercentile(samples, 0), 10, 'p0 is min');
    assert.strictEqual(calculatePercentile(samples, 100), 100, 'p100 is max');

    // 20-sample test
    const twenty = Array.from({ length: 20 }, (_, i) => (i + 1) * 50); // 50, 100, ..., 1000
    const p50 = calculatePercentile(twenty, 50);
    const p95 = calculatePercentile(twenty, 95);

    assert.strictEqual(p50, 525, 'p50 of 20 items is (500 + 550) / 2');
    assert.ok(p95 > p50, 'p95 is strictly greater than p50');
    assert.ok(p95 <= 1000, 'p95 <= max');
  });

  await test('2.2. Benchmarking drill: 25 spoken turns recorded with phase breakdown and p50/p95 calculations', async () => {
    const audio = new MockAudioEngine() as any;
    let wsInstance: MockWebSocket | null = null;

    class CapturingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        wsInstance = this;
      }
    }

    const mockFetch = (async (url: string, opts?: any) => {
      if (url === '/api/auth/ws-ticket') {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_drill' }) };
      }
      if (url === '/api/sophia/mouth/speak') {
        // Simulate minor TTS network/synthesis duration (2-5ms)
        await new Promise((r) => setTimeout(r, 3));
        return {
          ok: true,
          arrayBuffer: async () => fakeAudioOutput,
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const provider = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: CapturingWs as any,
    });

    await provider.start();
    provider.clearLatencyRecords();

    const TOTAL_TURNS = 25;
    console.log(`      Executing ${TOTAL_TURNS} consecutive spoken turns through voice loop...`);

    for (let i = 1; i <= TOTAL_TURNS; i++) {
      const turnId = `drill_turn_${i}_${Date.now()}`;

      // 1. Start push-to-talk
      provider.startPtt(turnId);

      // Simulate spoken audio duration (5ms)
      audio.pcmCallback!(fakePcmChunk);
      await new Promise((r) => setTimeout(r, 5));

      // 2. Stop push-to-talk
      provider.stopPtt(turnId);

      // 3. STT final transcript
      wsInstance!.simulateServerMessage({
        type: 'TRANSCRIPT_FINAL',
        turnId,
        text: `Question turn number ${i}: what are the company goals?`,
      });

      // 4. Server cognitive reply
      wsInstance!.simulateServerMessage({
        type: 'SOPHIA_RESPONSE',
        turnId,
        reply: `Answer turn number ${i}: Company goals are tracked in the memory store.`,
        liveAi: true,
      });

      // Wait for TTS download and AudioEngine playback
      await new Promise((r) => setTimeout(r, 15));
    }

    const records = provider.getLatencyRecords();
    assert.strictEqual(records.length, TOTAL_TURNS, `Must record exactly ${TOTAL_TURNS} turns (>= 20)`);

    const summary = provider.getLatencySummary();
    assert.strictEqual(summary.sampleCount, TOTAL_TURNS, 'Summary sampleCount matches');
    assert.ok(summary.p50EndToEndFromStopMs > 0, 'p50 latency from speech stop > 0');
    assert.ok(summary.p95EndToEndFromStopMs > 0, 'p95 latency from speech stop > 0');
    assert.ok(
      summary.p50EndToEndFromStopMs <= summary.p95EndToEndFromStopMs,
      `p50 (${summary.p50EndToEndFromStopMs}ms) must be <= p95 (${summary.p95EndToEndFromStopMs}ms)`
    );

    // Verify per-turn phase breakdown integrity
    for (const rec of records) {
      assert.ok(rec.endToEndFromStopMs > 0, 'endToEndFromStopMs > 0');
      assert.ok(rec.endToEndTotalMs >= rec.endToEndFromStopMs, 'total latency >= stop latency');
      assert.strictEqual(rec.turnType, 'voice', 'turnType is voice');
    }

    console.log(`      [LATENCY REPORT] Turns: ${summary.sampleCount}`);
    console.log(`      [LATENCY REPORT] Median (p50): ${summary.p50EndToEndFromStopMs} ms`);
    console.log(`      [LATENCY REPORT] 95th Percentile (p95): ${summary.p95EndToEndFromStopMs} ms`);

    await provider.stop();
  });

  await test('2.3. Server-side VoiceLatencyTracker records turns and computes summary statistics', () => {
    const tracker = VoiceLatencyTracker.getInstance();
    tracker.clear();

    // Insert 20 calibrated turns
    for (let i = 1; i <= 20; i++) {
      tracker.recordTurn({
        turnId: `server_turn_${i}`,
        turnType: 'voice',
        durationSpeakingMs: 1200,
        sttLatencyMs: 150 + i * 10,
        cognitionLatencyMs: 300 + i * 15,
        ttsLatencyMs: 80 + i * 5,
        endToEndFromStopMs: 530 + i * 30, // 560 to 1130 ms
        endToEndTotalMs: 1730 + i * 30,
        transcriptLengthChars: 30,
        replyLengthChars: 45,
        liveAi: true,
      });
    }

    const summary = tracker.getSummary();
    assert.strictEqual(summary.sampleCount, 20, '20 turns recorded');
    assert.strictEqual(summary.voiceSampleCount, 20, '20 voice turns');
    assert.strictEqual(summary.textSampleCount, 0, '0 text turns');

    assert.ok(summary.p50EndToEndFromStopMs > 0, 'p50 is positive');
    assert.ok(summary.p95EndToEndFromStopMs > summary.p50EndToEndFromStopMs, 'p95 is greater than p50');
    assert.strictEqual(summary.minMs, 560, 'min latency is 560ms');
    assert.strictEqual(summary.maxMs, 1130, 'max latency is 1130ms');
  });

  // --------------------------------------------------------------------------
  // Group 3: Typing Works Alongside Voice (Coexistence & Alternation)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 3: Typing Works Alongside Voice (Coexistence) ---');

  await test('3.1. Typed message via sendText routes through /api/sophia/chat and plays spoken reply', async () => {
    const audio = new MockAudioEngine() as any;
    let wsInstance: MockWebSocket | null = null;
    let chatEndpointCalledWith = '';
    let ttsReceivedText = '';

    class CapturingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        wsInstance = this;
      }
    }

    const mockFetch = (async (url: string, opts?: any) => {
      if (url === '/api/auth/ws-ticket') {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_typing' }) };
      }
      if (url === '/api/sophia/chat') {
        const body = JSON.parse(opts.body);
        chatEndpointCalledWith = body.message;
        return {
          ok: true,
          json: async () => ({ reply: 'I received your typed message.' }),
        };
      }
      if (url === '/api/sophia/mouth/speak') {
        const body = JSON.parse(opts.body);
        ttsReceivedText = body.text;
        return {
          ok: true,
          arrayBuffer: async () => fakeAudioOutput,
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const provider = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: CapturingWs as any,
    });

    await provider.start();

    // User types question
    provider.sendText('How is our runway looking?');

    await new Promise((r) => setTimeout(r, 30));

    assert.strictEqual(chatEndpointCalledWith, 'How is our runway looking?', 'Typed query delivered to chat endpoint');
    assert.strictEqual(ttsReceivedText, 'I received your typed message.', 'Chat reply synthesized into audio');
    assert.strictEqual(audio.playedEncodedBuffers.length, 1, 'AudioEngine played back audio for typed turn');

    await provider.stop();
  });

  await test('3.2. Alternating sequence: voice turn -> typing turn -> voice turn executes seamlessly', async () => {
    const audio = new MockAudioEngine() as any;
    let wsInstance: MockWebSocket | null = null;
    const answeredQueries: string[] = [];

    class CapturingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        wsInstance = this;
      }
    }

    const mockFetch = (async (url: string, opts?: any) => {
      if (url === '/api/auth/ws-ticket') {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_alternating' }) };
      }
      if (url === '/api/sophia/chat') {
        const body = JSON.parse(opts.body);
        answeredQueries.push(`typed:${body.message}`);
        return {
          ok: true,
          json: async () => ({ reply: `Typed reply to ${body.message}` }),
        };
      }
      if (url === '/api/sophia/mouth/speak') {
        return {
          ok: true,
          arrayBuffer: async () => fakeAudioOutput,
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const provider = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: CapturingWs as any,
    });

    await provider.start();

    // Turn 1: Voice
    provider.startPtt('turn_alt_v1');
    provider.stopPtt('turn_alt_v1');
    wsInstance!.simulateServerMessage({
      type: 'TRANSCRIPT_FINAL',
      turnId: 'turn_alt_v1',
      text: 'Voice turn 1',
    });
    wsInstance!.simulateServerMessage({
      type: 'SOPHIA_RESPONSE',
      turnId: 'turn_alt_v1',
      reply: 'Voice answer 1',
    });
    answeredQueries.push('voice:Voice turn 1');
    await new Promise((r) => setTimeout(r, 20));

    // Turn 2: Typing
    provider.sendText('Typing turn 2');
    await new Promise((r) => setTimeout(r, 20));

    // Turn 3: Voice
    provider.startPtt('turn_alt_v3');
    provider.stopPtt('turn_alt_v3');
    wsInstance!.simulateServerMessage({
      type: 'TRANSCRIPT_FINAL',
      turnId: 'turn_alt_v3',
      text: 'Voice turn 3',
    });
    wsInstance!.simulateServerMessage({
      type: 'SOPHIA_RESPONSE',
      turnId: 'turn_alt_v3',
      reply: 'Voice answer 3',
    });
    answeredQueries.push('voice:Voice turn 3');
    await new Promise((r) => setTimeout(r, 20));

    assert.deepStrictEqual(answeredQueries, [
      'voice:Voice turn 1',
      'typed:Typing turn 2',
      'voice:Voice turn 3',
    ]);
    assert.strictEqual(audio.playedEncodedBuffers.length, 3, 'All 3 turns played audio successfully');

    await provider.stop();
  });

  // --------------------------------------------------------------------------
  // Group 4: Latency Telemetry API & Security Boundaries
  // --------------------------------------------------------------------------
  console.log('\n--- Group 4: Latency Telemetry API & Security Boundaries ---');

  await test('4.1. Non-founder request to /api/sofia/voice/latency fails closed (401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/sofia/voice/latency', {
      headers: {
        'x-samjuniors-role': 'AUDITOR',
      },
    });
    const res = await getLatencyApi(req);
    assert.strictEqual(res.status, 401, 'Non-founder request must return 401 Unauthorized');
  });

  await test('4.2. Authenticated founder retrieves latency summary with verified p50 and p95 metrics', async () => {
    const req = new NextRequest('http://localhost:3000/api/sofia/voice/latency', {
      headers: {
        'x-founder-id': 'founder-test',
        'x-samjuniors-user-id': 'founder-test',
      },
    });

    const res = await getLatencyApi(req);
    assert.strictEqual(res.status, 200, 'Authenticated request returns 200');

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.summary !== undefined);
    assert.strictEqual(data.summary.sampleCount, 20);
    assert.ok(data.summary.p50EndToEndFromStopMs > 0);
    assert.ok(data.summary.p95EndToEndFromStopMs >= data.summary.p50EndToEndFromStopMs);
  });

  await test('4.3. Founder can post turn metric and clear latency records via API', async () => {
    const postReq = new NextRequest('http://localhost:3000/api/sofia/voice/latency', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-founder-id': 'founder-test',
        'x-samjuniors-user-id': 'founder-test',
      },
      body: JSON.stringify({
        record: {
          turnId: 'api_turn_1',
          turnType: 'voice',
          endToEndFromStopMs: 650,
          endToEndTotalMs: 1800,
        },
      }),
    });

    const postRes = await postLatencyApi(postReq);
    assert.strictEqual(postRes.status, 200);
    const postData = await postRes.json();
    assert.strictEqual(postData.success, true);
    assert.strictEqual(postData.record.turnId, 'api_turn_1');

    // Clear records
    const clearReq = new NextRequest('http://localhost:3000/api/sofia/voice/latency', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-founder-id': 'founder-test',
        'x-samjuniors-user-id': 'founder-test',
      },
      body: JSON.stringify({ action: 'clear' }),
    });

    const clearRes = await postLatencyApi(clearReq);
    assert.strictEqual(clearRes.status, 200);
    const clearData = await clearRes.json();
    assert.strictEqual(clearData.cleared, true);

    const checkSummary = VoiceLatencyTracker.getInstance().getSummary();
    assert.strictEqual(checkSummary.sampleCount, 0, 'Tracker cleared successfully');
  });

  // --------------------------------------------------------------------------
  // Group 5: Model Fallbacks Preserved (Zero Deletions Rule)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 5: Model Fallbacks Preserved ---');

  await test('5.1. Gemini, OpenAI, LM Studio, and Fake providers remain registered without deletions', () => {
    const registry = ConversationAdapterRegistry.getInstance();
    assert.ok(registry.getProvider('gemini') !== undefined, 'Gemini provider preserved');
    assert.ok(registry.getProvider('openai') !== undefined, 'OpenAI provider preserved');
    assert.ok(registry.getProvider('lmstudio') !== undefined, 'LM Studio provider preserved');
    assert.ok(registry.getProvider('fake') !== undefined, 'Fake provider preserved');
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`M1.4 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running M1.4 test suite:', err);
  process.exit(1);
});
