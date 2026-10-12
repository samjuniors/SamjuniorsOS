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
import { WebSocket as WsWebSocket } from 'ws';
import { LiveGatewayVoiceProvider } from '../../src/sofia/sophia/voice/LiveGatewayVoiceProvider';
import { LiveInteractionServer, SophiaTurnExecutorFn } from '../../src/lib/server/live/server';
import { LiveSessionManager } from '../../src/lib/server/live/session-manager';
import { LiveTicketStore } from '../../src/lib/server/live/ticket-store';
import type { SophiaTurnResult } from '../../src/lib/server/sophia/turn-executor';
import type { STTProvider, CanonicalTranscriptEvent } from '../../src/lib/server/live/stt/types';
import { AudioEngine } from '../../src/sofia/sophia/audio/AudioEngine';

// Mock AudioEngine: faithfully implements the AudioEngine methods used by LiveGatewayVoiceProvider
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

  constructor(url: string, autoOpen = true) {
    super();
    this.url = url;
    if (autoOpen) {
      setTimeout(() => {
        this.onopen?.();
        this.emit('open');
      }, 10);
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

  test('Custom allowedHosts allowlist option is strictly restrictive and replaces default host policy', () => {
    const audio = new MockAudioEngine() as any;
    // When allowedHosts is supplied, even samjuniors.com is rejected if not in allowedHosts
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'wss://os.samjuniors.com/live', {
        allowedHosts: ['gateway.internal.net'],
      });
    }, /is not in the restrictive allowedHosts list/);

    // Permitted host in allowedHosts is accepted
    const p = new LiveGatewayVoiceProvider(audio, 'wss://gateway.internal.net/ws', {
      allowedHosts: ['gateway.internal.net'],
    });
    assert.strictEqual(p.id, 'live-gateway');
  });

  test('Current browser hostname is untrusted by default unless trustCurrentOrigin is true', () => {
    const audio = new MockAudioEngine() as any;
    // Untrusted by default
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'wss://custom.browser-origin.io/ws', {
        currentHostname: 'custom.browser-origin.io',
      });
    }, /is not in the trusted allowlist/);

    // Explicitly trusted via trustCurrentOrigin
    const p = new LiveGatewayVoiceProvider(audio, 'wss://custom.browser-origin.io/ws', {
      currentHostname: 'custom.browser-origin.io',
      trustCurrentOrigin: true,
    });
    assert.strictEqual(p.id, 'live-gateway');
  });

  test('Untrusted third-party host (wss://evil.com) fails closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'wss://evil.com/ws');
    }, /is not in the trusted allowlist/);
  });

  test('Untrusted IP host (wss://169.254.169.254:3001) fails closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'wss://169.254.169.254:3001/ws');
    }, /is not in the trusted allowlist/);
  });

  test('Embedded credentials (ws://user:pass@localhost:3001) fails closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'ws://attacker:secret@localhost:3001');
    }, /Credentials embedded in WebSocket URL are forbidden/);
  });

  test('Query strings (ws://localhost:3001?foo=bar) fail closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001?foo=bar');
    }, /Query parameters in gateway URL are forbidden/);
  });

  test('URL fragments (ws://localhost:3001#fragment) fail closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001#fragment');
    }, /URL fragments in gateway URL are forbidden/);
  });

  test('Production mode strictly requires wss:// scheme', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', { isProduction: true });
    }, /Insecure ws:\/\/ protocol is forbidden in production/);
  });

  test('Production mode cannot be weakened or downgraded by isProduction: false', () => {
    const audio = new MockAudioEngine() as any;
    const originalEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';
      assert.throws(() => {
        new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', { isProduction: false });
      }, /Insecure ws:\/\/ protocol is forbidden in production/);
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  test('Production mode accepts trusted wss:// scheme', () => {
    const audio = new MockAudioEngine() as any;
    const p = new LiveGatewayVoiceProvider(audio, 'wss://os.samjuniors.com/live', { isProduction: true });
    assert.strictEqual(p.id, 'live-gateway');
  });

  test('Development mode strictly rejects insecure ws:// for non-local remote hosts', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'ws://os.samjuniors.com/live', { isProduction: false });
    }, /Insecure ws:\/\/ protocol is only permitted for local loopback addresses in development/);
  });

  test('Disallowed port (ws://localhost:9999) fails closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'ws://localhost:9999');
    }, /Port 9999 is not in the allowed gateway ports list/);
  });

  test('Path traversal (ws://localhost:3001/../admin) fails closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001/../admin');
    }, /Path traversal in gateway URL is forbidden/);
  });

  test('Disallowed path (ws://localhost:3001/unauthorized/custom) fails closed synchronously', () => {
    const audio = new MockAudioEngine() as any;
    assert.throws(() => {
      new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001/unauthorized/custom');
    }, /is not in the allowed gateway path list/);
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

  await test('Concurrent start() calls are idempotent and share single in-flight ticket acquisition', async () => {
    const audio = new MockAudioEngine() as any;
    let ticketFetches = 0;

    const mockFetch = (async (url: string) => {
      if (url === '/api/auth/ws-ticket') {
        ticketFetches++;
        // Small delay to simulate in-flight concurrency
        await new Promise((r) => setTimeout(r, 20));
        return {
          ok: true,
          json: async () => ({ ticket: `ws_live_ticket_${ticketFetches}` }),
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: MockWebSocket as any,
    });

    // Launch 3 start calls concurrently
    await Promise.all([p.start(), p.start(), p.start()]);

    assert.strictEqual(ticketFetches, 1, 'Ticket was fetched exactly once across concurrent start() calls');
    assert.strictEqual(p.isActive(), true);

    await p.stop();
  });

  await test('Handshake failure cleans up socket resources and emits WEBSOCKET_HANDSHAKE_FAILED', async () => {
    const audio = new MockAudioEngine() as any;

    class FailingWs extends MockWebSocket {
      constructor(url: string) {
        super(url, false);
        // Fail connection immediately before open
        setTimeout(() => {
          this.onerror?.(new Error('Connection refused'));
        }, 5);
      }
    }

    const mockFetch = (async () => ({
      ok: true,
      json: async () => ({ ticket: 'ws_live_ticket_abc' }),
    })) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: FailingWs as any,
    });

    let handshakeError: any = null;
    p.addEventListener('error', (e: any) => {
      handshakeError = e.detail;
    });

    let caught = false;
    try {
      await p.start();
    } catch (err: any) {
      caught = true;
    }

    assert.strictEqual(caught, true);
    assert.strictEqual(p.isActive(), false);
    assert.ok(handshakeError !== null);
    assert.strictEqual(handshakeError.code, 'WEBSOCKET_HANDSHAKE_FAILED');
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

  await test('stop() called during async ticket acquisition aborts startup and prevents ghost WebSocket connection (Fix 1)', async () => {
    const audio = new MockAudioEngine() as any;
    let wsConstructed = false;

    class TrackingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        wsConstructed = true;
      }
    }

    let resolveTicketFetch: (val: any) => void = () => {};
    const delayedFetch = (async () => {
      return new Promise((resolve) => {
        resolveTicketFetch = () =>
          resolve({
            ok: true,
            json: async () => ({ ticket: 'ws_live_ticket_delayed' }),
          });
      });
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: delayedFetch,
      WebSocketClass: TrackingWs as any,
    });

    let errorEmitted: any = null;
    p.addEventListener('error', (e: any) => {
      errorEmitted = e.detail;
    });

    // 1. Initiate start (ticket fetch is now pending)
    const startPromise = p.start();

    // 2. Call stop() before ticket fetch resolves
    await p.stop();

    // 3. Resolve ticket fetch now
    resolveTicketFetch(null);
    await startPromise;

    // 4. Verify no ghost WebSocket was constructed and provider is inactive
    assert.strictEqual(wsConstructed, false, 'WebSocket must not be instantiated if stop() was called during ticket acquisition');
    assert.strictEqual(p.isActive(), false, 'Provider remains inactive');
    assert.strictEqual(errorEmitted, null, 'No error event emitted for intentionally cancelled startup');
  });

  await test('WebSocket handshake times out after handshakeTimeoutMs if socket never opens/errors and emits WEBSOCKET_HANDSHAKE_FAILED (Fix 3)', async () => {
    const audio = new MockAudioEngine() as any;

    class SilentHangingWs extends MockWebSocket {
      constructor(url: string) {
        // autoOpen = false: never calls onopen, onerror, or onclose
        super(url, false);
      }
    }

    const mockFetch = (async () => ({
      ok: true,
      json: async () => ({ ticket: 'ws_live_ticket_timeout' }),
    })) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: SilentHangingWs as any,
      handshakeTimeoutMs: 50,
    });

    let handshakeError: any = null;
    p.addEventListener('error', (e: any) => {
      handshakeError = e.detail;
    });

    let caught = false;
    let thrownError: any = null;
    try {
      await p.start();
    } catch (err: any) {
      caught = true;
      thrownError = err;
    }

    assert.strictEqual(caught, true, 'start() promise rejects on handshake timeout');
    assert.ok(thrownError?.message.includes('WebSocket handshake timed out after 50ms'));
    assert.strictEqual(p.isActive(), false, 'Provider is inactive after timeout');
    assert.ok(handshakeError !== null, 'error event emitted');
    assert.strictEqual(handshakeError.code, 'WEBSOCKET_HANDSHAKE_FAILED');
  });

  await test('stop() after WebSocket construction but before open leaves provider inactive and ignores late onopen (Finding 1)', async () => {
    const audio = new MockAudioEngine() as any;
    let lateWs: any = null;

    class DelayedOpenWs extends MockWebSocket {
      constructor(url: string) {
        // autoOpen = false so we control when onopen fires
        super(url, false);
        lateWs = this;
      }
    }

    const mockFetch = (async () => ({
      ok: true,
      json: async () => ({ ticket: 'ws_live_ticket_late_open' }),
    })) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: DelayedOpenWs as any,
    });

    let listeningEmitted = false;
    p.addEventListener('listening', () => {
      listeningEmitted = true;
    });

    // 1. Start provider (ticket resolves, WebSocket is constructed, awaiting open)
    const startPromise = p.start();
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(lateWs !== null, 'WebSocket instance must be constructed');

    // 2. Call stop() before the socket opens
    await p.stop();
    assert.strictEqual(p.isActive(), false, 'Provider is inactive after stop()');

    // 3. Late onopen fires on the socket
    lateWs!.onopen?.();

    // 4. Assert provider remains inactive, does not wire audio, does not emit 'listening'
    await startPromise;
    assert.strictEqual(p.isActive(), false, 'Provider remains inactive despite late onopen');
    assert.strictEqual(listeningEmitted, false, 'listening event must not be emitted for cancelled handshake');
    assert.strictEqual(audio.pcmCallback, null, 'Audio PCM listener must not be attached');
  });

  await test('Late socket error and close events after cancellation do not emit errors or reactivate provider (Finding 1)', async () => {
    const audio = new MockAudioEngine() as any;
    let lateWs: MockWebSocket | null = null;

    class ManualWs extends MockWebSocket {
      constructor(url: string) {
        super(url, false);
        lateWs = this;
      }
    }

    const mockFetch = (async () => ({
      ok: true,
      json: async () => ({ ticket: 'ws_live_ticket_late_events' }),
    })) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: ManualWs as any,
    });

    const emittedErrors: any[] = [];
    p.addEventListener('error', (e: any) => {
      emittedErrors.push(e.detail);
    });

    const startPromise = p.start();
    await new Promise((r) => setTimeout(r, 10));

    // Cancel startup
    await p.stop();

    // Late onerror and onclose fire on the stale socket
    lateWs!.simulateError(new Error('Late network drop'));
    lateWs!.close(1006, 'Abnormal late close');

    await startPromise;

    assert.strictEqual(p.isActive(), false);
    assert.strictEqual(emittedErrors.length, 0, 'No errors emitted for late events on cancelled socket');
  });

  // ------------------------------------------------------------------------
  // SECTION 2B: Restart After Cancellation & Lifecycle Races
  // ------------------------------------------------------------------------

  function createDeferred<T>() {
    let resolve!: (val: T) => void;
    let reject!: (err?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  await test('stop() during ticket acquisition followed immediately by start() activates replacement connection and ignores stale ticket (old resolves first)', async () => {
    const audio = new MockAudioEngine() as any;
    const constructedSockets: MockWebSocket[] = [];

    class TrackingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        constructedSockets.push(this);
      }
    }

    const ticketDeferred1 = createDeferred<any>();
    const ticketDeferred2 = createDeferred<any>();
    let ticketCallCount = 0;

    const mockFetch = (async (url: string) => {
      if (url === '/api/auth/ws-ticket') {
        ticketCallCount++;
        if (ticketCallCount === 1) {
          return ticketDeferred1.promise;
        }
        if (ticketCallCount === 2) {
          return ticketDeferred2.promise;
        }
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: TrackingWs as any,
    });

    // 1. Initial start() triggers ticket acquisition 1
    const p1 = p.start();
    assert.strictEqual(ticketCallCount, 1, 'First ticket acquisition initiated');

    // 2. Stop during ticket acquisition
    await p.stop();
    assert.strictEqual(p.isActive(), false);

    // 3. Immediately start again: initiates fresh startup without waiting for p1 to settle
    const p2 = p.start();
    assert.strictEqual(ticketCallCount, 2, 'Second ticket acquisition initiated immediately after restart');

    // 4. Resolve old ticket response FIRST in controlled order
    ticketDeferred1.resolve({
      ok: true,
      json: async () => ({ ticket: 'ws_live_stale_ticket' }),
    });

    // Await old start promise — it must unwind cleanly without constructing a socket
    await p1;
    assert.strictEqual(constructedSockets.length, 0, 'Cancelled startup must not construct a socket even after ticket resolves');

    // 5. Resolve new ticket response SECOND in controlled order
    ticketDeferred2.resolve({
      ok: true,
      json: async () => ({ ticket: 'ws_live_replacement_ticket' }),
    });

    // Await replacement start promise
    await p2;

    // 6. Assert replacement startup becomes active and only the valid current socket exists
    assert.strictEqual(p.isActive(), true, 'Replacement startup must become active');
    assert.strictEqual(constructedSockets.length, 1, 'Only one WebSocket must be constructed');
    assert.ok(
      constructedSockets[0].url.includes('ticket=ws_live_replacement_ticket'),
      'Connected socket must use the replacement ticket'
    );
    assert.ok(audio.pcmCallback !== null, 'Microphone capture attached to replacement connection');

    await p.stop();
    assert.strictEqual(p.isActive(), false);
  });

  await test('stop() during ticket acquisition followed by start() when replacement ticket resolves before old ticket', async () => {
    const audio = new MockAudioEngine() as any;
    const constructedSockets: MockWebSocket[] = [];

    class TrackingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        constructedSockets.push(this);
      }
    }

    const ticketDeferred1 = createDeferred<any>();
    const ticketDeferred2 = createDeferred<any>();
    let ticketCallCount = 0;

    const mockFetch = (async (url: string) => {
      if (url === '/api/auth/ws-ticket') {
        ticketCallCount++;
        if (ticketCallCount === 1) {
          return ticketDeferred1.promise;
        }
        if (ticketCallCount === 2) {
          return ticketDeferred2.promise;
        }
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: TrackingWs as any,
    });

    const p1 = p.start();
    await p.stop();
    const p2 = p.start();

    // Resolve replacement ticket FIRST
    ticketDeferred2.resolve({
      ok: true,
      json: async () => ({ ticket: 'ws_live_replacement_ticket_fast' }),
    });
    await p2;

    assert.strictEqual(p.isActive(), true, 'Replacement startup becomes active');
    assert.strictEqual(constructedSockets.length, 1);

    // Resolve old ticket SECOND
    ticketDeferred1.resolve({
      ok: true,
      json: async () => ({ ticket: 'ws_live_stale_ticket_late' }),
    });
    await p1;

    // Replacement remains active; no second socket was created
    assert.strictEqual(p.isActive(), true, 'Provider remains active after stale ticket settles');
    assert.strictEqual(constructedSockets.length, 1, 'No ghost socket created from late stale ticket');

    await p.stop();
  });

  await test('stop() during pending handshake followed by restart keeps replacement active despite late events from old socket', async () => {
    const audio = new MockAudioEngine() as any;
    const sockets: MockWebSocket[] = [];
    const socketConstructedDeferreds = [createDeferred<MockWebSocket>(), createDeferred<MockWebSocket>()];
    let constructedCount = 0;

    class ControllableWs extends MockWebSocket {
      constructor(url: string) {
        // autoOpen = false: keep handshake pending until manually opened
        super(url, false);
        const idx = constructedCount++;
        sockets.push(this);
        if (idx < socketConstructedDeferreds.length) {
          socketConstructedDeferreds[idx].resolve(this);
        }
      }
    }

    let ticketCount = 0;
    const mockFetch = (async (url: string) => {
      if (url === '/api/auth/ws-ticket') {
        ticketCount++;
        return {
          ok: true,
          json: async () => ({ ticket: `ws_live_ticket_handshake_${ticketCount}` }),
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: ControllableWs as any,
    });

    const emittedErrors: any[] = [];
    p.addEventListener('error', (e: any) => {
      emittedErrors.push(e.detail);
    });

    const receivedTranscripts: any[] = [];
    p.addEventListener('transcript', (e: any) => {
      receivedTranscripts.push(e.detail);
    });

    // 1. Initial start(): acquires ticket 1 and constructs socket 1
    const p1 = p.start();
    const ws1 = await socketConstructedDeferreds[0].promise;
    assert.strictEqual(ws1.url.includes('ticket=ws_live_ticket_handshake_1'), true);

    // 2. Stop during socket 1 pending handshake
    await p.stop();
    assert.strictEqual(p.isActive(), false);

    // 3. Immediately start again: acquires ticket 2 and constructs socket 2
    const p2 = p.start();
    const ws2 = await socketConstructedDeferreds[1].promise;
    assert.strictEqual(ws2.url.includes('ticket=ws_live_ticket_handshake_2'), true);

    // 4. Complete handshake for replacement socket 2
    ws2.onopen?.();
    await p2;
    await p1; // Old startup unwinds cleanly

    assert.strictEqual(p.isActive(), true, 'Replacement connection is active');

    // 5. Simulate late events from old socket 1
    ws1.onopen?.();
    ws1.simulateServerMessage({
      type: 'TRANSCRIPT_FINAL',
      text: 'Stale text from old socket',
    });
    ws1.simulateError(new Error('Stale socket network error'));
    ws1.close(1006, 'Stale socket closed');

    // 6. Assert replacement connection remains active and unaffected
    assert.strictEqual(p.isActive(), true, 'Replacement connection remains active after old socket events');
    assert.strictEqual(emittedErrors.length, 0, 'No errors emitted for late events on old cancelled socket');
    assert.strictEqual(receivedTranscripts.length, 0, 'No transcript events emitted from stale socket messages');

    // Verify replacement socket is still functional
    ws2.simulateServerMessage({
      type: 'TRANSCRIPT_FINAL',
      text: 'Valid text on replacement socket',
    });
    assert.strictEqual(receivedTranscripts.length, 1);
    assert.strictEqual(receivedTranscripts[0].text, 'Valid text on replacement socket');

    await p.stop();
    assert.strictEqual(p.isActive(), false);
  });

  await test('Older startup finally block cannot clear the in-flight replacement startup promise', async () => {
    const audio = new MockAudioEngine() as any;
    const ticket1Deferred = createDeferred<any>();
    const ticket2Deferred = createDeferred<any>();
    let ticketFetches = 0;

    const mockFetch = (async (url: string) => {
      if (url === '/api/auth/ws-ticket') {
        ticketFetches++;
        if (ticketFetches === 1) {
          return ticket1Deferred.promise;
        }
        if (ticketFetches === 2) {
          return ticket2Deferred.promise;
        }
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: MockWebSocket as any,
    });

    // 1. Start old startup (ticket 1 fetch is pending)
    const p1 = p.start();
    assert.strictEqual(ticketFetches, 1);

    // 2. Stop old startup
    await p.stop();

    // 3. Start replacement startup (ticket 2 fetch is now pending)
    const p2 = p.start();
    assert.strictEqual(ticketFetches, 2);

    // 4. Old startup 1 unwinds when ticket 1 resolves and enters its finally block
    ticket1Deferred.resolve({
      ok: true,
      json: async () => ({ ticket: 'ws_live_ticket_stale' }),
    });
    await p1;

    // 5. Call start() concurrently while replacement startup p2 is still in-flight
    // If old startup's finally block had cleared startPromise, this would launch a 3rd ticket fetch!
    const p3 = p.start();

    // Assert that p3 reuses the in-flight replacement promise and did NOT initiate a 3rd ticket fetch
    assert.strictEqual(p3, p2, 'Concurrent start() must return the existing in-flight replacement promise');
    assert.strictEqual(ticketFetches, 2, 'No third ticket fetch was initiated; replacement startPromise remained intact');

    // 6. Settle replacement startup
    ticket2Deferred.resolve({
      ok: true,
      json: async () => ({ ticket: 'ws_live_ticket_replacement' }),
    });

    await Promise.all([p2, p3]);
    assert.strictEqual(p.isActive(), true, 'Replacement startup completed and is active');

    await p.stop();
  });

  // ------------------------------------------------------------------------
  // SECTION 3: PTT Framing & Microphone Streaming
  // ------------------------------------------------------------------------
  console.log('\nSECTION 3: PTT Framing & Audio Streaming\n');

  await test('startPtt sends START_PTT and stopPtt sends STOP_PTT', async () => {
    const audio = new MockAudioEngine() as any;
    let lastWs: any = null;

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

  await test('sendText does NOT send raw TEXT_MESSAGE frames to gateway WebSocket, routes via /api/sophia/chat without client tools', async () => {
    const audio = new MockAudioEngine() as any;
    let lastWs: any = null;
    let chatEndpointHit = false;
    let ttsEndpointHit = false;

    class CapturingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        lastWs = this;
      }
    }

    const mockFetch = (async (url: string, opts?: any) => {
      if (url === '/api/auth/ws-ticket') {
        return { ok: true, json: async () => ({ ticket: 'ws_live_123' }) };
      }
      if (url === '/api/sophia/chat') {
        chatEndpointHit = true;
        const body = JSON.parse(opts.body);
        assert.strictEqual(body.message, 'Status report please');
        return {
          ok: true,
          json: async () => ({
            reply: 'All systems operating within normal parameters.',
            toolCalls: [{ name: 'danger_tool', args: {} }], // Attempted client tool call
          }),
        };
      }
      if (url === '/api/sophia/mouth/speak') {
        ttsEndpointHit = true;
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([10, 20]).buffer,
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: CapturingWs as any,
    });

    await p.start();

    // Verify WebSocket exists and has sent 0 messages so far
    assert.ok(lastWs !== null);
    const initialSentCount = lastWs!.sentMessages.length;

    p.sendText('Status report please');

    await new Promise((r) => setTimeout(r, 60));

    // LiveInteractionServer protocol verification:
    // Ensure NO raw TEXT_MESSAGE frame was sent across the companion gateway socket
    for (const msg of lastWs!.sentMessages) {
      if (typeof msg === 'string') {
        const parsed = JSON.parse(msg);
        assert.notStrictEqual(parsed.type, 'TEXT_MESSAGE', 'TEXT_MESSAGE frame must not be sent to LiveInteractionServer');
      }
    }

    assert.strictEqual(chatEndpointHit, true, 'Text turn routed through canonical /api/sophia/chat');
    assert.strictEqual(ttsEndpointHit, true, 'Reply audio synthesized via canonical mouth/speak');
    assert.strictEqual(audio.playedEncodedBuffers.length, 1, 'Audio played through AudioEngine');

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

  await test('sendText() response arriving after stop() is discarded and does not trigger TTS (Fix 2)', async () => {
    const audio = new MockAudioEngine() as any;
    let resolveChat: (val: any) => void = () => {};
    let ttsCalled = false;

    const mockFetch = (async (url: string) => {
      if (url.includes('/api/auth/ws-ticket')) {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_text' }) };
      }
      if (url.includes('/api/sophia/chat')) {
        return new Promise((resolve) => {
          resolveChat = () =>
            resolve({
              ok: true,
              json: async () => ({ reply: 'This late reply must never be spoken because stop() was called.' }),
            });
        });
      }
      if (url.includes('/api/sophia/mouth/speak')) {
        ttsCalled = true;
        return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: MockWebSocket as any,
    });

    await p.start();

    let responseStarted = false;
    p.addEventListener('response_started', () => {
      responseStarted = true;
    });

    p.sendText('Tell me a story');

    // Call stop() while chat response is in flight
    await p.stop();

    // Now resolve the late chat response
    resolveChat(null);
    await new Promise((r) => setTimeout(r, 40));

    assert.strictEqual(ttsCalled, false, 'TTS endpoint must not be invoked after stop()');
    assert.strictEqual(responseStarted, false, 'response_started event must not be emitted after stop()');
  });

  await test('sendText() response arriving after interrupt() is discarded and does not trigger TTS (Fix 2)', async () => {
    const audio = new MockAudioEngine() as any;
    let resolveChat: (val: any) => void = () => {};
    let ttsCalled = false;

    const mockFetch = (async (url: string) => {
      if (url.includes('/api/auth/ws-ticket')) {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_text2' }) };
      }
      if (url.includes('/api/sophia/chat')) {
        return new Promise((resolve) => {
          resolveChat = () =>
            resolve({
              ok: true,
              json: async () => ({ reply: 'Late reply after interrupt.' }),
            });
        });
      }
      if (url.includes('/api/sophia/mouth/speak')) {
        ttsCalled = true;
        return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: MockWebSocket as any,
    });

    await p.start();

    let responseStarted = false;
    p.addEventListener('response_started', () => {
      responseStarted = true;
    });

    p.sendText('Explain quantum mechanics');

    // Interrupt while chat response is pending
    p.interrupt();

    // Resolve late chat response
    resolveChat(null);
    await new Promise((r) => setTimeout(r, 40));

    assert.strictEqual(ttsCalled, false, 'TTS endpoint must not be invoked after interrupt()');
    assert.strictEqual(responseStarted, false, 'response_started event must not be emitted after interrupt()');

    await p.stop();
  });

  await test('Newer sendText() turn supersedes older pending turn, discarding older response (Fix 2)', async () => {
    const audio = new MockAudioEngine() as any;
    let resolveFirstChat: (val: any) => void = () => {};
    let resolveSecondChat: (val: any) => void = () => {};
    const spokenReplies: string[] = [];

    const mockFetch = (async (url: string, opts?: any) => {
      if (url.includes('/api/auth/ws-ticket')) {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_supersede' }) };
      }
      if (url.includes('/api/sophia/chat')) {
        const body = JSON.parse(opts?.body || '{}');
        if (body.message === 'First prompt') {
          return new Promise((resolve, reject) => {
            if (opts?.signal) {
              opts.signal.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
              });
            }
            resolveFirstChat = () =>
              resolve({
                ok: true,
                json: async () => ({ reply: 'First reply (superseded)' }),
              });
          });
        }
        if (body.message === 'Second prompt') {
          return new Promise((resolve) => {
            resolveSecondChat = () =>
              resolve({
                ok: true,
                json: async () => ({ reply: 'Second reply (active)' }),
              });
          });
        }
      }
      if (url.includes('/api/sophia/mouth/speak')) {
        const body = JSON.parse(opts?.body || '{}');
        spokenReplies.push(body.text);
        return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: MockWebSocket as any,
    });

    await p.start();

    // 1. Send first prompt (turn 1 is now pending)
    p.sendText('First prompt');

    // 2. Send second prompt before first completes (supersedes turn 1)
    p.sendText('Second prompt');

    // 3. Resolve first chat response
    resolveFirstChat(null);
    await new Promise((r) => setTimeout(r, 20));

    // 4. Resolve second chat response
    resolveSecondChat(null);
    await new Promise((r) => setTimeout(r, 40));

    // 5. Verify only second reply was synthesized and spoken
    assert.strictEqual(spokenReplies.length, 1, 'Only one response must be spoken');
    assert.strictEqual(spokenReplies[0], 'Second reply (active)', 'Second turn must supersede first turn');

    await p.stop();
  });

  await test('Newer sendText() supersedes older turn while older turn TTS is pending, aborting older TTS (Finding 2)', async () => {
    const audio = new MockAudioEngine() as any;
    let resolveFirstTTS: (val: any) => void = () => {};
    let firstTTSAborted = false;
    const spokenReplies: string[] = [];

    const mockFetch = (async (url: string, opts?: any) => {
      if (url.includes('/api/auth/ws-ticket')) {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_tts_race' }) };
      }
      if (url.includes('/api/sophia/chat')) {
        const body = JSON.parse(opts?.body || '{}');
        return {
          ok: true,
          json: async () => ({ reply: `Reply for ${body.message}` }),
        };
      }
      if (url.includes('/api/sophia/mouth/speak')) {
        const body = JSON.parse(opts?.body || '{}');
        if (body.text.includes('Turn 1')) {
          return new Promise((resolve, reject) => {
            if (opts?.signal) {
              opts.signal.addEventListener('abort', () => {
                firstTTSAborted = true;
                const err = new Error('TTS aborted');
                err.name = 'AbortError';
                reject(err);
              });
            }
            resolveFirstTTS = () => {
              resolve({
                ok: true,
                arrayBuffer: async () => new Uint8Array([1, 1]).buffer,
              });
            };
          });
        }
        if (body.text.includes('Turn 2')) {
          spokenReplies.push(body.text);
          return {
            ok: true,
            arrayBuffer: async () => new Uint8Array([2, 2]).buffer,
          };
        }
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: MockWebSocket as any,
    });

    await p.start();

    // 1. Send Turn 1 (completes chat, enters TTS and pauses there)
    p.sendText('Turn 1');
    await new Promise((r) => setTimeout(r, 20));

    // 2. Send Turn 2 while Turn 1 TTS is still pending
    p.sendText('Turn 2');
    await new Promise((r) => setTimeout(r, 20));

    // 3. Verify Turn 1's TTS was aborted by Turn 2
    assert.strictEqual(firstTTSAborted, true, 'Turn 1 TTS must be aborted when Turn 2 starts');

    // 4. Resolve Turn 1 TTS (even if late response arrived)
    resolveFirstTTS(null);
    await new Promise((r) => setTimeout(r, 30));

    // 5. Verify only Turn 2 was spoken and played
    assert.strictEqual(spokenReplies.length, 1);
    assert.ok(spokenReplies[0].includes('Turn 2'));

    await p.stop();
  });

  await test('Newer sendText() arriving while older audio playback is pending halts audio hardware and suppresses stale completion (Finding 2)', async () => {
    let playEncodedResolve: any = null;
    let audioStoppedWhilePlaying = false;

    class PlaybackControllableAudio extends MockAudioEngine {
      async playEncoded(buf: ArrayBuffer): Promise<void> {
        this.playedEncodedBuffers.push(buf);
        return new Promise<void>((resolve) => {
          playEncodedResolve = resolve;
        });
      }

      interruptPlayback(): void {
        super.interruptPlayback();
        if (playEncodedResolve) {
          audioStoppedWhilePlaying = true;
        }
      }
    }

    const audio = new PlaybackControllableAudio() as any;
    let playbackFinishedCount = 0;

    const mockFetch = (async (url: string, opts?: any) => {
      if (url.includes('/api/auth/ws-ticket')) {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_playback_race' }) };
      }
      if (url.includes('/api/sophia/chat')) {
        const body = JSON.parse(opts?.body || '{}');
        return {
          ok: true,
          json: async () => ({ reply: `Reply for ${body.message}` }),
        };
      }
      if (url.includes('/api/sophia/mouth/speak')) {
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([9, 9]).buffer,
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: MockWebSocket as any,
    });

    p.addEventListener('playback_finished', () => {
      playbackFinishedCount++;
    });

    await p.start();

    // 1. Send Turn 1 — proceeds into audio.playEncoded and hangs there
    p.sendText('Turn 1');
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(audio.playedEncodedBuffers.length, 1, 'Turn 1 audio started playing');
    assert.ok(playEncodedResolve !== null, 'Audio playback is currently in-flight');

    // 2. Send Turn 2 while Turn 1 audio is still playing
    p.sendText('Turn 2');
    await new Promise((r) => setTimeout(r, 20));

    // AudioEngine.stop() must be invoked to cut the hardware output
    assert.strictEqual(audioStoppedWhilePlaying, true, 'AudioEngine.stop() must be called when superseded');

    // 3. Turn 1's playEncoded now resolves late
    playEncodedResolve!();
    await new Promise((r) => setTimeout(r, 20));

    // Turn 1 must NOT have emitted playback_finished
    // Turn 2 is now in playEncoded
    assert.strictEqual(audio.playedEncodedBuffers.length, 2, 'Turn 2 audio queued for playback');

    // 4. Resolve Turn 2's playEncoded
    if (playEncodedResolve) {
      playEncodedResolve();
    }
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(playbackFinishedCount, 1, 'Only Turn 2 emits playback_finished');

    await p.stop();
  });

  await test('sendText() does not throw before chat request when using strict AudioEngine interface without stop()', async () => {
    class StrictAudioEngine extends AudioEngine {
      public playbackInterrupted = false;
      public playedEncodedBuffers: ArrayBuffer[] = [];

      override interruptPlayback(): void {
        super.interruptPlayback();
        this.playbackInterrupted = true;
      }

      override async playEncoded(buf: ArrayBuffer): Promise<void> {
        this.playedEncodedBuffers.push(buf);
      }
    }

    const strictAudio = new StrictAudioEngine();
    let chatEndpointHit = false;

    const mockFetch = (async (url: string, opts?: any) => {
      if (url.includes('/api/auth/ws-ticket')) {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_strict_audio' }) };
      }
      if (url.includes('/api/sophia/chat')) {
        chatEndpointHit = true;
        return {
          ok: true,
          json: async () => ({ reply: 'Strict audio reply' }),
        };
      }
      if (url.includes('/api/sophia/mouth/speak')) {
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(strictAudio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: MockWebSocket as any,
    });

    await p.start();

    // Verify sending text does not throw and issues chat request
    assert.doesNotThrow(() => {
      p.sendText('Testing audio contract');
    });

    await new Promise((r) => setTimeout(r, 40));

    assert.strictEqual(strictAudio.playbackInterrupted, true, 'interruptPlayback() invoked without calling stop()');
    assert.strictEqual(chatEndpointHit, true, 'Chat endpoint reached successfully');
    assert.strictEqual(strictAudio.playedEncodedBuffers.length, 1, 'Reply played via AudioEngine');

    // Verify interrupt() also uses interruptPlayback()
    strictAudio.playbackInterrupted = false;
    p.interrupt();
    assert.strictEqual(strictAudio.playbackInterrupted, true, 'interrupt() invokes interruptPlayback()');

    await p.stop();
  });

  await test('Active PTT turn followed by sendText() immediately sends canonical INTERRUPT with previous PTT turn ID', async () => {
    const audio = new MockAudioEngine() as any;
    const capturedSockets: MockWebSocket[] = [];
    let chatEndpointReceivedTurn: string | null = null;
    let chatEndpointHit = false;

    class CapturingWs extends MockWebSocket {
      constructor(url: string) {
        super(url);
        capturedSockets.push(this);
      }
    }

    const mockFetch = (async (url: string, opts?: any) => {
      if (url.includes('/api/auth/ws-ticket')) {
        return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_ptt_text_switch' }) };
      }
      if (url.includes('/api/sophia/chat')) {
        chatEndpointHit = true;
        const body = JSON.parse(opts?.body || '{}');
        chatEndpointReceivedTurn = body.message;
        return {
          ok: true,
          json: async () => ({ reply: `Reply to ${body.message}` }),
        };
      }
      if (url.includes('/api/sophia/mouth/speak')) {
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([5, 5]).buffer,
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: mockFetch,
      WebSocketClass: CapturingWs as any,
    });

    let interruptedEventEmitted = false;
    p.addEventListener('interrupted', () => {
      interruptedEventEmitted = true;
    });

    await p.start();
    const activeSocket = capturedSockets[0];
    assert.ok(activeSocket);

    // 1. Start an active PTT turn
    const pttTurnId = p.startPtt('turn_active_ptt_test_1');
    assert.strictEqual(pttTurnId, 'turn_active_ptt_test_1');

    const startPttMsg = JSON.parse(activeSocket.sentMessages[0]);
    assert.strictEqual(startPttMsg.type, 'START_PTT');
    assert.strictEqual(startPttMsg.turnId, 'turn_active_ptt_test_1');

    // 2. While PTT turn is active, user sends text input
    p.sendText('superseding text turn');

    // 3. Verify outgoing WebSocket frame is the canonical INTERRUPT frame containing the PREVIOUS PTT turn ID
    const interruptMsg = activeSocket.sentMessages
      .map((m) => (typeof m === 'string' ? JSON.parse(m) : null))
      .find((m) => m && m.type === 'INTERRUPT');

    assert.ok(interruptMsg, 'INTERRUPT frame must be sent over WebSocket');
    assert.strictEqual(
      interruptMsg.turnId,
      'turn_active_ptt_test_1',
      'Outgoing INTERRUPT frame must contain the previous PTT turn ID'
    );

    // 4. Verify sendText does not emit duplicate "interrupted" event to voice listeners
    assert.strictEqual(interruptedEventEmitted, false, 'sendText() must not emit extraneous interrupted event');

    // 5. Simulate late server response for the interrupted PTT turn arriving over WebSocket
    activeSocket.simulateServerMessage({
      type: 'SOPHIA_RESPONSE',
      turnId: 'turn_active_ptt_test_1',
      reply: 'Stale speech response that must be dropped',
    });

    await new Promise((r) => setTimeout(r, 50));

    // 6. Verify new text turn reached /api/sophia/chat and was played, while old PTT response was dropped
    assert.strictEqual(chatEndpointHit, true, 'New text turn reaches /api/sophia/chat');
    assert.strictEqual(chatEndpointReceivedTurn, 'superseding text turn');
    assert.strictEqual(audio.playedEncodedBuffers.length, 1, 'Only replacement text turn reply is played');

    await p.stop();
  });

  await test('Server-side PTT execution is cancelled when client switches to text turn (server seam)', async () => {
    const audio = new MockAudioEngine() as any;
    const sessionManager = LiveSessionManager.getInstance();
    const ticketStore = LiveTicketStore.getInstance();

    class MockSTTForTest implements STTProvider {
      public readonly providerId = 'mock-stt';
      public readonly providerName = 'Mock STT';
      public name = 'mock-stt';
      public options: any = null;
      public isStreaming = false;
      public interruptCalled = false;
      private eventListeners: Array<(event: CanonicalTranscriptEvent) => void> = [];

      async startStream(opts: any): Promise<void> {
        this.options = opts;
        this.isStreaming = true;
      }
      sendAudio(): void {}
      onEvent(fn: (event: CanonicalTranscriptEvent) => void): () => void {
        this.eventListeners.push(fn);
        return () => {
          this.eventListeners = this.eventListeners.filter((l) => l !== fn);
        };
      }
      onError(): () => void {
        return () => {};
      }
      async endTurn(): Promise<void> {}
      interrupt(): void {
        this.interruptCalled = true;
      }
      async close(): Promise<void> {
        this.isStreaming = false;
      }
      simulateEvent(event: CanonicalTranscriptEvent): void {
        for (const listener of this.eventListeners) {
          listener(event);
        }
      }
    }

    let mockStt = new MockSTTForTest();
    const executorCalls: Array<{ turnId?: string; signal?: AbortSignal }> = [];
    let resolveTurnExecution: ((r: SophiaTurnResult) => void) | null = null;

    const slowExecutor: SophiaTurnExecutorFn = (opts) => {
      executorCalls.push({ turnId: opts.turnId, signal: opts.signal });
      return new Promise<SophiaTurnResult>((resolve) => {
        resolveTurnExecution = resolve;
      });
    };

    const server = new LiveInteractionServer({
      port: 0,
      sessionManager,
      sttProviderFactory: () => {
        mockStt = new MockSTTForTest();
        return mockStt;
      },
      turnExecutor: slowExecutor,
    });

    const serverPort = await server.listen(0);
    const testFounder = {
      userId: 'founder-test-server-seam',
      email: 'founder@samjuniors.com',
      name: 'Test Founder',
      role: 'FOUNDER' as const,
      isVerified: true,
    };

    let chatEndpointHit = false;
    const mockFetch = (async (url: string) => {
      if (url.includes('/api/auth/ws-ticket')) {
        const ticket = ticketStore.issueTicket(testFounder, 'conv_server_seam_1');
        return {
          ok: true,
          json: async () => ({ ticket }),
        };
      }
      if (url.includes('/api/sophia/chat')) {
        chatEndpointHit = true;
        return {
          ok: true,
          json: async () => ({ reply: 'Chat reply from Next.js endpoint' }),
        };
      }
      if (url.includes('/api/sophia/mouth/speak')) {
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([8, 8]).buffer,
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const p = new LiveGatewayVoiceProvider(audio, `ws://localhost:${serverPort}`, {
      fetchFn: mockFetch,
      WebSocketClass: WsWebSocket as any,
      allowedPorts: [serverPort],
    });

    await p.start();

    // 1. Start a PTT turn
    const pttTurnId = p.startPtt('turn_server_seam_active_1');
    await new Promise((r) => setTimeout(r, 40));

    // 2. Simulate final transcript from STT -> triggers server turnExecutor
    mockStt.simulateEvent({
      kind: 'final_transcript',
      turnId: pttTurnId,
      text: 'Analyze the revenue growth rate',
      isFinal: true,
      timestamp: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(executorCalls.length, 1, 'Server turn executor invoked for PTT turn');
    assert.strictEqual(executorCalls[0].turnId, pttTurnId);
    assert.strictEqual(executorCalls[0].signal?.aborted, false, 'Server turn execution initially active');

    // 3. User switches to text turn while server execution is in-flight
    p.sendText('Hold on, show churn rate instead');

    // Allow INTERRUPT frame to reach server and be processed
    await new Promise((r) => setTimeout(r, 60));

    // 4. Verify server turn execution was aborted via AbortSignal
    assert.strictEqual(executorCalls[0].signal?.aborted, true, 'Server turn execution aborted by INTERRUPT');
    assert.strictEqual(mockStt.interruptCalled, true, 'Server STT session was interrupted');

    // 5. Resolve the aborted server execution
    if (resolveTurnExecution) {
      (resolveTurnExecution as any)({
        success: false,
        cancelled: true,
        reply: '',
        conversationId: 'conv_server_seam_1',
        intent: 'conversation',
        directiveExecuted: false,
        liveAi: false,
      });
    }

    await new Promise((r) => setTimeout(r, 50));

    // 6. Verify text turn succeeded through /api/sophia/chat
    assert.strictEqual(chatEndpointHit, true, 'Text turn reached chat endpoint');

    await p.stop();
    await server.close();
  });

  // ------------------------------------------------------------------------
  // SECTION 6: Graceful Disconnect, Teardown & Fail-Closed Boundaries
  // ------------------------------------------------------------------------
  console.log('\nSECTION 6: Disconnect Handling & Teardown\n');

  await test('Gracefully handles unexpected server WebSocket close and cleans up all resources', async () => {
    const audio = new MockAudioEngine() as any;
    let lastWs: any = null;

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
    assert.strictEqual(p.isActive(), true);
    assert.ok(audio.pcmCallback !== null);

    let disconnectError: any = null;
    p.addEventListener('error', (e: any) => {
      disconnectError = e.detail;
    });

    audio.stopped = false;
    lastWs!.close(1006, 'Abnormal closure');

    assert.strictEqual(p.isActive(), false);
    assert.strictEqual(audio.pcmCallback, null, 'PCM capture callback detached upon disconnect');
    assert.strictEqual(audio.stopped, true, 'Audio hardware stopped upon disconnect');
    assert.ok(disconnectError !== null);
    assert.strictEqual(disconnectError.code, 'GATEWAY_DISCONNECTED');
  });

  await test('Gateway failures fail closed and NEVER trigger ungoverned provider fallback', async () => {
    const audio = new MockAudioEngine() as any;

    // Simulate complete gateway outage
    const failingFetch = (async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Live interaction service unavailable' }),
    })) as any;

    const p = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
      fetchFn: failingFetch,
      WebSocketClass: MockWebSocket as any,
    });

    let errorEvent: any = null;
    p.addEventListener('error', (e: any) => {
      errorEvent = e.detail;
    });

    let caught = false;
    try {
      await p.start();
    } catch {
      caught = true;
    }

    assert.strictEqual(caught, true, 'Fails closed on outage');
    assert.strictEqual(p.isActive(), false);
    assert.strictEqual(errorEvent.code, 'TICKET_ACQUISITION_FAILED');
    // Verify provider identity remains live-gateway; no alternate provider instantiated
    assert.strictEqual(p.id, 'live-gateway');
  });

  console.log('\n======================================================');
  console.log(`STEP 6C STAGE 2 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
