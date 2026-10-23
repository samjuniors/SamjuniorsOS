import assert from 'node:assert/strict';
import { AudioEngine, bargeInThreshold } from '../../src/sofia/sophia/audio/AudioEngine';
import { controlLayer } from '../../src/sofia/sophia/control';
import { SophiaOS } from '../../src/sofia/sophia/SophiaOS';
import { UserVoiceProfile } from '../../src/sofia/core/UserVoiceProfile';
import { GeminiLiveProvider } from '../../src/sofia/sophia/voice/GeminiLiveProvider';

function makeAudioStub() {
  return {
    onPlaybackEnd: () => () => undefined,
    onPCM: () => () => undefined,
    interruptPlayback: () => undefined,
    playPCM24: () => 0,
    isSpeaking: false,
    micLevel: 0,
  };
}

async function testGeminiSetupTimeout() {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = (globalThis as any).WebSocket;

  class SocketThatNeverCompletesSetup {
    static OPEN = 1;
    readyState = 0;
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;

    constructor() {
      setTimeout(() => {
        this.readyState = SocketThatNeverCompletesSetup.OPEN;
        this.onopen?.({});
      }, 0);
    }

    send() {}

    close() {
      this.readyState = 3;
      this.onclose?.({ code: 1000 });
    }
  }

  globalThis.fetch = async () => new Response(JSON.stringify({
    token: 'auth_tokens/test-token',
    model: 'models/test-live-model',
    wsUrl: 'wss://live.example.invalid/session',
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  (globalThis as any).WebSocket = SocketThatNeverCompletesSetup;

  const provider = new GeminiLiveProvider(makeAudioStub() as unknown as AudioEngine);
  (provider as any).setupTimeoutMs = 10;

  try {
    await assert.rejects(provider.start(), /live-setup-timeout:10/);
    assert.equal(provider.isActive(), false, 'a failed setup must not leave the provider active');
  } finally {
    await provider.stop();
    globalThis.fetch = originalFetch;
    (globalThis as any).WebSocket = originalWebSocket;
  }
}

async function testTextUsesCanonicalChatAndSurfacesErrors() {
  const originalFetch = globalThis.fetch;
  const previousHistory = [...controlLayer.history];
  const providerSendCalls: string[] = [];
  const transitions: string[] = [];
  const os = Object.setPrototypeOf(new EventTarget(), SophiaOS.prototype) as any;
  Object.assign(os, {
    activeProvider: {
      isActive: () => true,
      sendText: (text: string) => providerSendCalls.push(text),
    },
    state: { transition: (to: string) => transitions.push(to) },
    pushLog: () => undefined,
    speakText: async () => undefined,
    armPostTurn: () => undefined,
    log: [],
    logId: 0,
  });

  try {
    controlLayer.reset();
    let requestPath = '';
    globalThis.fetch = async (input) => {
      requestPath = String(input);
      return new Response(JSON.stringify({ text: 'A server-authoritative answer.' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    await os.sendText('Explain why the sky is blue.');
    assert.equal(requestPath, '/api/sophia/chat');
    assert.deepEqual(providerSendCalls, [], 'typed text must not bypass Sophia through the live model socket');
    assert.equal(controlLayer.history.at(-1)?.text, 'A server-authoritative answer.');

    controlLayer.reset();
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'canonical executor unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
    await assert.rejects(os.sendText('What is the current company priority?'), /canonical executor unavailable/);
    assert.equal(
      controlLayer.history.some((turn) => turn.text === 'I am here and listening. How can I assist you?'),
      false,
      'a failed request must not create a fabricated Sophia answer',
    );
    assert.equal(transitions.at(-1), 'listening', 'failed text turns must leave THINKING');
  } finally {
    globalThis.fetch = originalFetch;
    controlLayer.reset();
    for (const turn of previousHistory) {
      if (turn.role === 'user') controlLayer.addUserTurn(turn.text, turn.final);
      else if (turn.role === 'sophia') controlLayer.addSophiaTurn(turn.text, turn.final, turn);
      else controlLayer.addSystemNote(turn.text);
    }
  }
}

function testBargeInAcceptsOrdinarySpeech() {
  assert.equal(bargeInThreshold(0), 0.12);
  assert.equal(bargeInThreshold(1), 0.24);
  assert.ok(bargeInThreshold(0.5) < 0.48, 'barge-in threshold must be below the old speech-blocking floor');

  const voice = new UserVoiceProfile();
  const samples = new Int16Array(640);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * 150 * i) / 16000) * 0.05 * 32767);
  }
  assert.equal(
    voice.shouldForwardChunk(samples, true, true, true),
    true,
    'normal voiced mic input should reach the provider during speech so it can interrupt',
  );
}

async function main() {
  testBargeInAcceptsOrdinarySpeech();
  await testGeminiSetupTimeout();
  await testTextUsesCanonicalChatAndSurfacesErrors();
  console.log('PASS: live interaction timeouts, canonical text turns, honest failures, and barge-in thresholds');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
