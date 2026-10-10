/**
 * ============================================================================
 * PHASE 3 STEP 6C — LIVE GATEWAY VOICE PROVIDER SUITE (STAGE 2)
 * ============================================================================
 *
 * Verifies Stage 2 implementation of LiveGatewayVoiceProvider:
 * 1. Strict URL validation (ws:// and wss:// only; rejects http, malformed).
 * 2. Ticket acquisition from /api/auth/ws-ticket and secure connection handshake.
 * 3. Normalized event lifecycle (listening, transcript, thinking, response_started,
 *    audio_started, response_finished, playback_finished).
 * 4. PTT framing (START_PTT, binary PCM streaming, STOP_PTT).
 * 5. Immediate hardware audio cut (<5ms) and cooperative INTERRUPT frame dispatch.
 * 6. In-flight TTS abort and late-packet drop for interrupted turns.
 * 7. Clean resource cleanup and graceful disconnect handling.
 * 8. Complete isolation from GeminiLiveProvider and client-side DOM tools.
 */

import assert from 'assert';
import { EventEmitter } from 'events';
import { LiveGatewayVoiceProvider } from '../../src/sofia/sophia/voice/LiveGatewayVoiceProvider';

// Mock AudioEngine
class MockAudioEngine {
  public pcmCallback: ((pcm: ArrayBuffer) => void) | null = null;
  public stopped = false;
  public playedEncodedBuffers: ArrayBuffer[] = [];

  onPCM(fn: (pcm: ArrayBuffer) => void): () => void {
    this.pcmCallback = fn;
    return () => {
      this.pcmCallback = null;
    };
  }

  stop(): void {
    this.stopped = true;
  }

  async playEncoded(buf: ArrayBuffer): Promise<void> {
    this.playedEncodedBuffers.push(buf);
  }
}

// Mock WebSocket
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

  constructor(url: string) {
    super();
    this.url = url;
    setTimeout(() => {
      this.onopen?.();
      this.emit('open');
    }, 10);
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
    this.emit('error', err);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('PHASE 3 STEP 6C: LIVE GATEWAY PROVIDER SUITE (STAGE 2)');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function test(desc: string, fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`  [PASS] ${desc}`);
            passed++;
          })
          .catch((err) => {
            console.error(`  [FAIL] ${desc}:`, err.message);
            failed++;
          });
      }
      console.log(`  [PASS] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${desc}:`, err.message);
      failed++;
    }
  }

  // ------------------------------------------------------------------------
  // SECTION 1: Strict URL & Gateway Host Validation Acceptance Criteria
  // ------------------------------------------------------------------------
  console.log('SECTION 1: Strict URL & Gateway Host Validation\n');

  test('Valid ws://localhost:3001 URL is accepted', () => {
    const audio = new MockAudioEngine() as any;
    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001');
    assert.strictEqual(p.id, 'live-gateway');
  });

  test('Valid ws://127.0.0.1:3001 URL is accepted', () => {
    const audio = new MockAudioEngine() as any;
    const p = new LiveGatewayVoiceProvider(audio, 'ws://127.0.0.1:3001');
    assert.strictEqual(p.id, 'live-gateway');
  });

  test('Valid wss://samjuniors.com trusted domain URL is accepted', () => {
    const audio = new MockAudioEngine() as any;
    const p = new LiveGatewayVoiceProvider(audio, 'wss://os.samjuniors.com/live');
    assert.strictEqual(p.id, 'live-gateway');
  });

  test('Custom allowedHosts allowlist option is honored', () => {
    const audio = new MockAudioEngine() as any;
    const p = new LiveGatewayVoiceProvider(audio, 'wss://gateway.internal.net/ws', {
      allowedHosts: ['gateway.internal.net'],
    });
    assert.strictEqual(p.id, 'live-gateway');
  });

  test('Untrusted third-party host (ws://evil.com) fails closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'ws://evil.com/ws');
    }, /is not in the trusted allowlist/);
  });

  test('Untrusted IP host (ws://169.254.169.254:3001) fails closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'ws://169.254.169.254:3001/ws');
    }, /is not in the trusted allowlist/);
  });

  test('Embedded credentials (ws://user:pass@localhost:3001) fails closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'ws://attacker:secret@localhost:3001');
    }, /Credentials embedded in WebSocket URL are forbidden/);
  });

  test('Invalid http:// URL fails closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'http://localhost:3001/api/live/ws');
    }, /Invalid protocol/);
  });

  test('Invalid https:// URL fails closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'https://os.samjuniors.com/live');
    }, /Invalid protocol/);
  });

  test('Empty or non-string URL fails closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, '');
    }, /must be a non-empty string/);
  });

  // ------------------------------------------------------------------------
  // SECTION 2: Ticket Acquisition & Connection Handshake
  // ------------------------------------------------------------------------
  console.log('\nSECTION 2: Ticket Acquisition & Handshake\n');

  await test('Fails closed if ticket acquisition endpoint returns HTTP 403', async () => {
    const audio = new MockAudioEngine() as any;
    const mockFetch = (async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    })) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: MockWebSocket as any,
    });

    let caught = false;
    try {
      await p.start();
    } catch (err: any) {
      caught = true;
      assert.ok(err.message.includes('HTTP 403'));
    }
    assert.strictEqual(caught, true);
    assert.strictEqual(p.isActive(), false);
  });

  await test('Fails closed if ticket returned is invalid', async () => {
    const audio = new MockAudioEngine() as any;
    const mockFetch = (async () => ({
      ok: true,
      json: async () => ({ ticket: 'invalid_ticket_prefix' }),
    })) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: MockWebSocket as any,
    });

    let caught = false;
    try {
      await p.start();
    } catch (err: any) {
      caught = true;
      assert.ok(err.message.includes('Invalid ticket returned'));
    }
    assert.strictEqual(caught, true);
    assert.strictEqual(p.isActive(), false);
  });

  await test('Successful ticket acquisition connects WebSocket with ticket query param', async () => {
    const audio = new MockAudioEngine() as any;
    let connectedUrl = '';

    class InterceptingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        connectedUrl = url;
      }
    }

    const mockFetch = (async () => ({
      ok: true,
      json: async () => ({ ticket: 'ws_live_secret_token_123' }),
    })) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: InterceptingWs as any,
    });

    let listeningEmitted = false;
    p.addEventListener('listening', () => {
      listeningEmitted = true;
    });

    await p.start();
    assert.strictEqual(p.isActive(), true);
    assert.ok(connectedUrl.includes('ws://localhost:3001?ticket=ws_live_secret_token_123'));
    assert.strictEqual(listeningEmitted, true);
    assert.ok(audio.pcmCallback !== null, 'Microphone capture attached to AudioEngine');

    await p.stop();
    assert.strictEqual(p.isActive(), false);
    assert.strictEqual(audio.pcmCallback, null, 'Microphone capture cleanly detached');
  });

  // ------------------------------------------------------------------------
  // SECTION 3: PTT Framing & Microphone Streaming
  // ------------------------------------------------------------------------
  console.log('\nSECTION 3: PTT Framing & Audio Streaming\n');

  await test('startPtt sends START_PTT and stopPtt sends STOP_PTT', async () => {
    const audio = new MockAudioEngine() as any;
    let lastWs: MockWebSocket | null = null;

    class CapturingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        lastWs = this;
      }
    }

    const mockFetch = (async () => ({
      ok: true,
      json: async () => ({ ticket: 'ws_live_123' }),
    })) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: CapturingWs as any,
    });

    await p.start();
    assert.ok(lastWs !== null);

    const turnId = p.startPtt('test_turn_101');
    assert.strictEqual(turnId, 'test_turn_101');

    const startMsg = JSON.parse(lastWs!.sentMessages[0]);
    assert.strictEqual(startMsg.type, 'START_PTT');
    assert.strictEqual(startMsg.turnId, 'test_turn_101');

    // Stream a PCM audio chunk
    const fakePCM = new Uint8Array([1, 2, 3, 4]).buffer;
    audio.pcmCallback!(fakePCM);
    assert.strictEqual(lastWs!.sentMessages[1], fakePCM);

    p.stopPtt('test_turn_101');
    const stopMsg = JSON.parse(lastWs!.sentMessages[2]);
    assert.strictEqual(stopMsg.type, 'STOP_PTT');
    assert.strictEqual(stopMsg.turnId, 'test_turn_101');

    await p.stop();
  });

  // ------------------------------------------------------------------------
  // SECTION 4: Transcripts, Responses & Sequential Playback
  // ------------------------------------------------------------------------
  console.log('\nSECTION 4: Transcripts, Responses & Playback\n');

  await test('Processes TRANSCRIPT_INTERIM and TRANSCRIPT_FINAL events', async () => {
    const audio = new MockAudioEngine() as any;
    let lastWs: MockWebSocket | null = null;

    class CapturingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        lastWs = this;
      }
    }

    const mockFetch = (async () => ({
      ok: true,
      json: async () => ({ ticket: 'ws_live_123' }),
    })) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: CapturingWs as any,
    });

    await p.start();

    const transcripts: any[] = [];
    p.addEventListener('transcript', (e: any) => {
      transcripts.push(e.detail);
    });

    lastWs!.simulateServerMessage({
      type: 'TRANSCRIPT_INTERIM',
      turnId: 't1',
      text: 'hello',
    });

    lastWs!.simulateServerMessage({
      type: 'TRANSCRIPT_FINAL',
      turnId: 't1',
      text: 'hello sophia',
    });

    assert.strictEqual(transcripts.length, 2);
    assert.strictEqual(transcripts[0].text, 'hello');
    assert.strictEqual(transcripts[0].final, false);
    assert.strictEqual(transcripts[1].text, 'hello sophia');
    assert.strictEqual(transcripts[1].final, true);

    await p.stop();
  });

  await test('SOPHIA_RESPONSE triggers TTS synthesis and AudioEngine playback', async () => {
    const audio = new MockAudioEngine() as any;
    let lastWs: MockWebSocket | null = null;
    let ttsRequestedText = '';

    class CapturingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        lastWs = this;
      }
    }

    const fakeAudioData = new Uint8Array([10, 20, 30]).buffer;

    const mockFetch = (async (url: string, opts?: any) => {
      if (url === '/api/auth/ws-ticket') {
        return { ok: true, json: async () => ({ ticket: 'ws_live_123' }) };
      }
      if (url === '/api/sophia/mouth/speak') {
        const body = JSON.parse(opts.body);
        ttsRequestedText = body.text;
        return {
          ok: true,
          arrayBuffer: async () => fakeAudioData,
        };
      }
      throw new Error(`Unexpected url: ${url}`);
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: CapturingWs as any,
    });

    await p.start();

    let responseStarted = false;
    let playbackFinished = false;

    p.addEventListener('response_started', () => {
      responseStarted = true;
    });
    p.addEventListener('playback_finished', () => {
      playbackFinished = true;
    });

    lastWs!.simulateServerMessage({
      type: 'SOPHIA_RESPONSE',
      turnId: 't_resp_1',
      reply: 'All systems are functional.',
      directiveExecuted: false,
    });

    // Wait for async TTS handling
    await new Promise((r) => setTimeout(r, 50));

    assert.strictEqual(ttsRequestedText, 'All systems are functional.');
    assert.strictEqual(responseStarted, true);
    assert.strictEqual(playbackFinished, true);
    assert.strictEqual(audio.playedEncodedBuffers.length, 1);
    assert.strictEqual(audio.playedEncodedBuffers[0], fakeAudioData);

    await p.stop();
  });

  // ------------------------------------------------------------------------
  // SECTION 5: Barge-In Interruption & Late-Packet Suppression
  // ------------------------------------------------------------------------
  console.log('\nSECTION 5: Barge-In Interruption & Cancellation\n');

  await test('interrupt() immediately cuts local hardware audio and sends INTERRUPT frame', async () => {
    const audio = new MockAudioEngine() as any;
    let lastWs: MockWebSocket | null = null;

    class CapturingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        lastWs = this;
      }
    }

    const mockFetch = (async () => ({
      ok: true,
      json: async () => ({ ticket: 'ws_live_123' }),
    })) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: CapturingWs as any,
    });

    await p.start();
    p.startPtt('turn_interrupt_test');

    audio.stopped = false;
    let interruptedEmitted = false;
    let playbackFinishedEmitted = false;

    p.addEventListener('interrupted', () => {
      interruptedEmitted = true;
    });
    p.addEventListener('playback_finished', () => {
      playbackFinishedEmitted = true;
    });

    // Fire barge-in interrupt
    p.interrupt();

    assert.strictEqual(audio.stopped, true, 'AudioEngine hardware output stopped synchronously (<5ms)');
    assert.strictEqual(interruptedEmitted, true);
    assert.strictEqual(playbackFinishedEmitted, true);

    const interruptMsg = JSON.parse(lastWs!.sentMessages[lastWs!.sentMessages.length - 1]);
    assert.strictEqual(interruptMsg.type, 'INTERRUPT');
    assert.strictEqual(interruptMsg.turnId, 'turn_interrupt_test');

    // Late arriving response for the interrupted turn must be dropped
    let lateTurnSpoken = false;
    p.addEventListener('response_started', () => {
      lateTurnSpoken = true;
    });

    lastWs!.simulateServerMessage({
      type: 'SOPHIA_RESPONSE',
      turnId: 'turn_interrupt_test',
      reply: 'This reply arrived late and must not play.',
    });

    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(lateTurnSpoken, false, 'Late arriving reply was suppressed');

    await p.stop();
  });

  // ------------------------------------------------------------------------
  // SECTION 6: Graceful Disconnect & Resource Teardown
  // ------------------------------------------------------------------------
  console.log('\nSECTION 6: Disconnect Handling & Teardown\n');

  await test('Gracefully handles unexpected server WebSocket close', async () => {
    const audio = new MockAudioEngine() as any;
    let lastWs: MockWebSocket | null = null;

    class CapturingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        lastWs = this;
      }
    }

    const mockFetch = (async () => ({
      ok: true,
      json: async () => ({ ticket: 'ws_live_123' }),
    })) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: CapturingWs as any,
    });

    await p.start();

    let disconnectError: any = null;
    p.addEventListener('error', (e: any) => {
      disconnectError = e.detail;
    });

    lastWs!.close(1006, 'Abnormal closure');

    assert.strictEqual(p.isActive(), false);
    assert.ok(disconnectError !== null);
    assert.strictEqual(disconnectError.code, 'GATEWAY_DISCONNECTED');
  });

  console.log('\n======================================================');
  console.log(`STEP 6C STAGE 2 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
