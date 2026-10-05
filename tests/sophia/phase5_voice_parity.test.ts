/**
 * ============================================================================
 * PHASE 5 — VOICE PARITY SUITE
 * ============================================================================
 * Executes the parity checklist (docs/audit/PHASE5-PARITY-CHECKLIST.md) for
 * the integrated SofiaUI-derived voice path against the agreed
 * voice-experience requirements, and pins the reversible legacy retirement.
 *
 *   SECTION E — the full client-side voice loop through the REAL bridge and
 *     REAL runtime against the REAL gateway (deterministic injected executor
 *     + mock STT, browser audio APIs stubbed): session up (E2), full turn →
 *     spoken reply → drain settle (E3), duplicate-final suppression (E4),
 *     interruption during playback + fresh-turn recovery (E5), TTS provider
 *     failure → speechSynthesis fallback (E6), total failure → honest text
 *     settle (E7), interruption during LISTENING (E8), attach/detach
 *     idempotence + unmount cleanup + mid-speak detach settle (E1),
 *     post-re-audit pins: PTT barge-in during playback cuts the audio
 *     through the existing state with NO second interruption path (E9),
 *     an older speak's late settlement never clobbers a newer speak's
 *     pending count (E10), a late settle never stomps a newer listening
 *     status (E11).
 *   SECTION F — reconnect semantics: abnormal transport loss → automatic
 *     reconnect onto a fresh gateway with a working turn (F1), exhausted
 *     attempts → honest error (F2), intentional close → no reconnect (F3),
 *     supersession 4409 → no reconnect (F4).
 *   SECTION G — microphone UX: permission denial fails the session honestly
 *     and retry recovers (G1 — pins the P5-D1 fix), mid-session device loss
 *     tears down with an honest error (G2), devicechange backstop (G3).
 *   SECTION H — reversible retirement: legacy-only routes answer 410 with
 *     the flag off (auth fires FIRST — production misconfig still 401),
 *     shared routes are unaffected, flag on restores them (H1–H4).
 *
 * Deterministic by construction: zero live STT/LLM/TTS provider calls. The
 * /api/auth/ws-ticket and /api/sofia/tts fetches are stubbed at the global
 * fetch boundary (the real jsonFetch/fetchSentenceAudio code runs); the
 * browser globals (AudioContext, speechSynthesis, mediaDevices,
 * AudioWorkletNode) are stubbed so the REAL live-client, bridge, runtime and
 * playback-engine code executes under bun.
 *
 * Harness note (established repo pattern, Task 6): the summary is reported
 * BEFORE the teardown awaits — WS close handshakes can starve the
 * event-loop drain in this environment. process.exit carries the true code.
 */

import { NextRequest } from 'next/server';
import { WebSocket } from 'ws';
import { LiveInteractionServer } from '../../src/lib/server/live/server';
import type { SophiaTurnExecutorFn } from '../../src/lib/server/live/server';
import { LiveSessionManager } from '../../src/lib/server/live/session-manager';
import { LiveTicketStore } from '../../src/lib/server/live/ticket-store';
import { STTProvider, CanonicalTranscriptEvent } from '../../src/lib/server/live/stt/types';
import { ConversationStore } from '../../src/lib/server/conversation';
import { liveBridge } from '../../src/os/lib/liveCompanionBridge';
import { voiceRuntime } from '../../src/os/lib/voiceRuntime';
import { os, getOS } from '../../src/os/lib/osStore';

/* Phase 5 section H route imports (legacy retirement matrix) */
import { POST as sofiaSttRoute } from '../../src/app/api/sofia/stt/route';
import { GET as sofiaHealthRoute } from '../../src/app/api/sofia/health/route';
import { GET as sofiaImgRoute } from '../../src/app/api/sofia/img/route';
import { GET as sofiaMediaRoute } from '../../src/app/api/sofia/media/route';
import { GET as sofiaPageRoute } from '../../src/app/api/sofia/page/route';
import { GET as sofiaFileRoute } from '../../src/app/api/sofia/file/route';
import { POST as sofiaAskRoute } from '../../src/app/api/sofia/ask/route';
import { POST as sofiaTtsRoute } from '../../src/app/api/sofia/tts/route';

/* ------------------------------------------------------- browser stubs */

/** Playback duration of every decoded "TTS sentence" (configurable). */
let decodeDurationMs = 300;

class FakeAudioBuffer {
  constructor(public duration: number, public channel: Float32Array) {}
  getChannelData() { return this.channel; }
}

class FakeBufferSource {
  public buffer: FakeAudioBuffer | null = null;
  public onended: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  connect() {}
  disconnect() {}
  start() {
    this.timer = setTimeout(() => {
      const cb = this.onended;
      this.onended = null;
      cb?.();
    }, Math.max(1, (this.buffer?.duration ?? 0.3) * 1000));
  }
  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

class FakeAnalyser { fftSize = 0; smoothingTimeConstant = 0; connect() {} }
class FakeGain { gain = { value: 1, setValueAtTime() {} }; connect() {} }

/** Exercises the REAL VoicePlaybackEngine graph/chaining/drain code. */
class FakeAudioContext {
  state = 'running';
  sampleRate = 48000;
  currentTime = 0;
  destination = {};
  audioWorklet = { addModule: async () => {} };
  createAnalyser() { return new FakeAnalyser(); }
  createGain() { return new FakeGain(); }
  createMediaStreamSource() { return { connect() {} }; }
  createBuffer(_ch: number, len: number, _rate: number) {
    return new FakeAudioBuffer(len / 48000, new Float32Array(len));
  }
  createBufferSource() { return new FakeBufferSource(); }
  async decodeAudioData(_buf: ArrayBuffer) {
    return new FakeAudioBuffer(decodeDurationMs / 1000, new Float32Array(2400).fill(0.5));
  }
  async resume() { return true; }
  async close() { this.state = 'closed'; }
}

const synthState = { speakCount: 0, cancelled: 0 };
const fakeSpeechSynthesis = {
  speaking: false,
  speak(u: { onend?: (() => void) | null }) {
    synthState.speakCount++;
    setTimeout(() => u.onend?.(), 30);
  },
  cancel() { synthState.cancelled++; },
};
(globalThis as any).SpeechSynthesisUtterance = class {
  constructor(public text: string) {}
  onend: (() => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
};

const windowStub: any = {
  location: { protocol: 'http:', hostname: 'localhost' },
  AudioContext: FakeAudioContext,
  speechSynthesis: fakeSpeechSynthesis,
};
(globalThis as any).window = windowStub;

/* Fake capture stack (getUserMedia + tracks + devicechange). */
class FakeTrack {
  public readyState = 'live';
  public endedHandlers: Array<() => void> = [];
  constructor(public deviceId: string) {}
  addEventListener(_ev: string, fn: () => void) { this.endedHandlers.push(fn); }
  stop() { this.readyState = 'ended'; }
  getSettings() { return { deviceId: this.deviceId }; }
}

function makeFakeStream(deviceId: string) {
  const track = new FakeTrack(deviceId);
  return { track, stream: { getAudioTracks: () => [track], getTracks: () => [track] } };
}

const micState = {
  getUserMediaImpl: async (): Promise<unknown> => { throw new Error('getUserMediaImpl not set'); },
  devices: [] as Array<{ kind: string; deviceId: string }>,
  devicechangeHandlers: [] as Array<() => void>,
};

const fakeMediaDevices = {
  getUserMedia: () => micState.getUserMediaImpl(),
  addEventListener: (_ev: string, fn: () => void) => { micState.devicechangeHandlers.push(fn); },
  removeEventListener: () => {},
  enumerateDevices: async () => micState.devices,
};

try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: fakeMediaDevices },
    configurable: true,
    writable: true,
  });
} catch { /* falls through to the assertion below */ }
if (!(globalThis as any).navigator?.mediaDevices) {
  (globalThis as any).navigator = { mediaDevices: fakeMediaDevices };
}
if (!(globalThis as any).navigator?.mediaDevices) {
  throw new Error('phase5 harness: could not install navigator.mediaDevices');
}

(globalThis as any).AudioWorkletNode = class {
  port = { onmessage: null as unknown, postMessage() {} };
  constructor() {}
  disconnect() {}
};
if (typeof (URL as unknown as { createObjectURL?: unknown }).createObjectURL !== 'function') {
  (URL as unknown as { createObjectURL: (b: unknown) => string }).createObjectURL = () => `blob:phase5-${Math.random()}`;
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
}

/* Stub the two HTTP surfaces the client path touches (ticket + TTS ladder).
 * Everything else goes to the real fetch. */
const realFetch = globalThis.fetch.bind(globalThis);
const net = {
  ticketPort: 0,
  ticketFails: false,
  ticketFetches: 0,
  ttsMode: 'ok' as 'ok' | 'fail' | 'hang',
  ttsCalls: [] as string[],
  /** Re-audit F3 pin: per-fetch delay queue in ms, shifted in fetch order
   *  (0 default). The delays are deliberately NOT abort-aware — they stand
   *  in for the unabortable stretch of a real fetch/decode so an older
   * speak's settlement can land after a newer speak owns the runtime. */
  ttsDelays: [] as number[],
};
let mintTicket: () => string = () => '';

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : String((input as Request)?.url ?? input);
  if (url.includes('/api/auth/ws-ticket')) {
    net.ticketFetches++;
    if (net.ticketFails) {
      return new Response(JSON.stringify({ error: 'ticket service down' }), { status: 500 });
    }
    return new Response(
      JSON.stringify({ success: true, ticket: mintTicket(), wsPort: net.ticketPort, expiresInSeconds: 60 }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }
  if (url.includes('/api/sofia/tts')) {
    let body: { text?: string } = {};
    try { body = JSON.parse(String(init?.body ?? '{}')); } catch { /* body stays empty */ }
    net.ttsCalls.push(String(body.text ?? ''));
    const fetchDelay = net.ttsDelays.length > 0 ? (net.ttsDelays.shift() as number) : 0;
    if (fetchDelay > 0) await sleep(fetchDelay);
    if (net.ttsMode === 'fail') return new Response('provider down', { status: 500 });
    if (net.ttsMode === 'hang') {
      // A fetch that never resolves until aborted — for the mid-speak detach test.
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      });
    }
    return new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46]), { status: 200 });
  }
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;

/* ------------------------------------------------------------ helpers */

class MockSTTProvider implements STTProvider {
  public readonly providerId = 'mock-stt';
  public readonly providerName = 'Mock STT Provider';
  public options: unknown = null;
  public endTurnCalled = false;
  public interruptCalled = false;
  public closed = false;
  private eventListeners: Array<(event: CanonicalTranscriptEvent) => void> = [];
  private errorListeners: Array<(error: Error) => void> = [];
  public onEvent(listener: (event: CanonicalTranscriptEvent) => void): void { this.eventListeners.push(listener); }
  public onError(listener: (error: Error) => void): void { this.errorListeners.push(listener); }
  public async startStream(opts: unknown): Promise<void> {
    this.options = opts;
    this.closed = false;
    this.endTurnCalled = false;
    this.interruptCalled = false;
  }
  public sendAudio(_chunk: Buffer): void { /* not needed */ }
  public async endTurn(): Promise<void> { this.endTurnCalled = true; }
  public interrupt(): void { this.interruptCalled = true; }
  public async close(): Promise<void> { this.closed = true; }
  public simulateEvent(event: CanonicalTranscriptEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }
  public simulateError(err: Error): void {
    for (const listener of this.errorListeners) listener(err);
  }
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

async function waitForCondition(cond: () => boolean, timeoutMs = 4000, label = 'condition'): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout waiting for ${label}`);
    await sleep(10);
  }
}

function terminateClients(server: LiveInteractionServer): void {
  const wss = (server as unknown as { wss: { clients: Set<{ terminate(): void }> } }).wss;
  for (const c of wss.clients) c.terminate();
}
function closeClientsWith(server: LiveInteractionServer, code: number, reason: string): void {
  const wss = (server as unknown as { wss: { clients: Set<{ close(c: number, r: string): void }> } }).wss;
  for (const c of wss.clients) c.close(code, reason);
}

/* ------------------------------------------------------------------ suite */

/** Unique two-sentence reply per turn (the store keeps no monotonic response
 * counter, so each turn's expected reply must be distinguishable). */
const replyFor = (turnId: string) => `Hello Sam. The morning briefing ${turnId} is ready.`;

async function runTests() {
  console.log('--- STARTING PHASE 5 VOICE PARITY SUITE ---\n');
  let passed = 0;
  let failed = 0;
  function assert(condition: boolean, desc: string) {
    if (condition) { console.log(`  [PASS] ${desc}`); passed++; }
    else { console.error(`  [FAIL] ${desc}`); failed++; }
  }

  const testFounder = {
    userId: 'founder-p5-parity',
    email: 'founder@samjuniors.com',
    name: 'Executive Founder',
    role: 'FOUNDER' as const,
    isVerified: true,
  };

  const sessionManager = LiveSessionManager.getInstance();
  const ticketStore = LiveTicketStore.getInstance();
  const convStore = ConversationStore.getInstance();
  const convId = 'conv_p5_parity';
  await convStore.createConversation({
    id: convId,
    founderId: testFounder.userId,
    agentId: 'sophia',
    title: 'Phase 5 parity suite',
  });
  mintTicket = () => ticketStore.issueTicket(testFounder, convId);

  let mockProvider = new MockSTTProvider();
  const executorCalls: Array<{ turnId?: string }> = [];
  const cannedExecutor: SophiaTurnExecutorFn = (opts) => {
    executorCalls.push({ turnId: opts.turnId });
    return Promise.resolve({
      success: true,
      reply: replyFor(opts.turnId ?? 'unknown'),
      conversationId: opts.conversationId ?? '',
      intent: 'conversation',
      directiveExecuted: false,
      liveAi: true,
    });
  };
  const makeServer = () => new LiveInteractionServer({
    port: 0,
    sessionManager,
    sttProviderFactory: () => { mockProvider = new MockSTTProvider(); return mockProvider; },
    turnExecutor: cannedExecutor,
  });

  const server1 = makeServer();
  const port1 = await server1.listen(0);
  net.ticketPort = port1;
  let server2: LiveInteractionServer | null = null;

  // Default capture grant for the E/F sections (G overrides this per case).
  const e2Grant = makeFakeStream('dev-p5-e2');
  micState.getUserMediaImpl = async () => e2Grant.stream;

  /** Runs one full voice turn through the REAL bridge (PTT → final → response).
   * The readiness waits are deliberately SERVER-side (this turn's STT session
   * + its endTurn) — client-local status flips before the server has
   * processed the frames, and simulating a final into a stale provider races
   * the server into suppression (the INTERRUPTED-state belt works as
   * designed). */
  async function bridgeTurn(label: string): Promise<string> {
    const turnId = liveBridge.startPtt();
    if (!turnId) throw new Error(`startPtt returned null (${label})`);
    const expectedReply = replyFor(turnId);
    await waitForCondition(
      () => (mockProvider.options as { turnId?: string } | null)?.turnId === turnId,
      4000,
      `${label}: STT session started for this turn`
    );
    liveBridge.stopPtt();
    await waitForCondition(() => mockProvider.endTurnCalled === true, 4000, `${label}: STOP_PTT processed (endTurn)`);
    mockProvider.simulateEvent({
      kind: 'final_transcript',
      turnId,
      text: 'what is on my schedule today',
      isFinal: true,
      timestamp: Date.now(),
    });
    await waitForCondition(() => getOS().liveVoice.lastReply === expectedReply, 4000, `${label}: SOPHIA_RESPONSE`);
    return turnId;
  }

  try {
    os.resetLiveVoice();

    /* ====================================================================
     * SECTION E — the full client-side voice loop (real bridge + runtime)
     * ==================================================================== */
    console.log('SECTION E: full client-side voice loop\n');

    // E2: session up through the real transport (ticket fetch → WS → mic).
    voiceRuntime.attach();
    const ok = await liveBridge.toggleVoice(true);
    assert(ok === true, 'E2: toggleVoice(true) succeeds through the real transport');
    assert(getOS().liveVoice.enabled === true, 'E2: live voice enabled');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 4000, 'E2: session ready (IDLE)');
    assert(getOS().liveVoice.error === null, 'E2: no transport error after connect');
    assert(liveBridge.getClient() !== null, 'E2: bridge client registered');
    assert(liveBridge.getClient()?.isCapturing() === true, 'E2: capture live (fake mic stream)');

    // E3: full turn — final transcript → canonical executor → SOPHIA_RESPONSE
    // → runtime speaks both sentences through the TTS ladder → drain settle.
    const ttsBeforeE3 = net.ttsCalls.length;
    const execBeforeE3 = executorCalls.length;
    const e3Turn = await bridgeTurn('E3');
    assert(getOS().liveVoice.lastReply === replyFor(e3Turn), 'E3: canonical reply lands in the store');
    assert(executorCalls.length === execBeforeE3 + 1, 'E3: exactly one executor invocation');
    await waitForCondition(() => net.ttsCalls.length >= ttsBeforeE3 + 2, 4000, 'E3: both sentences fetched from /api/sofia/tts');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 6000, 'E3: speaking overlay settles after drain');
    assert(voiceRuntime.isSpeaking() === false, 'E3: runtime speaking flag cleared after settle');
    assert(getOS().liveVoice.error === null, 'E3: settle without error');
    assert(voiceRuntime.getLevels().play === 0, 'E3: playback level zero after settle');

    // E4: a duplicate final for the completed turn is suppressed end-to-end
    // (no re-execution, no second response, no re-speak).
    const ttsBeforeE4 = net.ttsCalls.length;
    const execBeforeE4 = executorCalls.length;
    mockProvider.simulateEvent({
      kind: 'final_transcript',
      turnId: e3Turn,
      text: 'what is on my schedule today',
      isFinal: true,
      timestamp: Date.now(),
    });
    await sleep(400);
    assert(executorCalls.length === execBeforeE4, 'E4: duplicate final never re-executes the turn');
    assert(net.ttsCalls.length === ttsBeforeE4, 'E4: duplicate final never re-speaks the reply');

    // E5: interruption during PLAYBACK cuts audio immediately; a fresh turn
    // still works afterwards (cleanup correctness).
    decodeDurationMs = 4000; // long playback so the interrupt lands mid-speech
    const ttsBeforeE5 = net.ttsCalls.length;
    await bridgeTurn('E5');
    await waitForCondition(() => net.ttsCalls.length >= ttsBeforeE5 + 1, 4000, 'E5: playback audio fetching');
    assert(voiceRuntime.isSpeaking() === true, 'E5: runtime reports speaking during playback');
    voiceRuntime.interrupt();
    assert(voiceRuntime.isSpeaking() === false, 'E5: interrupt cuts spoken output immediately');
    await waitForCondition(() => getOS().liveVoice.status === 'interrupted', 4000, 'E5: interrupted status surfaces');
    const ttsAtInterrupt = net.ttsCalls.length;
    await sleep(400);
    assert(net.ttsCalls.length === ttsAtInterrupt, 'E5: no further TTS fetches after the interrupt');
    decodeDurationMs = 300;
    await bridgeTurn('E5b'); // fresh turn after an interruption
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 6000, 'E5b: fresh turn settles after interrupt');

    // E6: TTS provider failure degrades to the browser voice per sentence.
    net.ttsMode = 'fail';
    const speakBeforeE6 = synthState.speakCount;
    const ttsBeforeE6 = net.ttsCalls.length;
    await bridgeTurn('E6');
    await waitForCondition(() => net.ttsCalls.length >= ttsBeforeE6 + 1, 4000, 'E6: TTS attempts happened');
    await waitForCondition(() => synthState.speakCount >= speakBeforeE6 + 1, 4000, 'E6: speechSynthesis fallback spoke');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 6000, 'E6: settles after fallback speech');
    assert(getOS().liveVoice.error === null, 'E6: per-sentence fallback is not an error');
    net.ttsMode = 'ok';

    // E7: total spoken-output failure settles honestly (reply stays as text).
    net.ttsMode = 'fail';
    delete windowStub.speechSynthesis;
    await bridgeTurn('E7');
    await waitForCondition(() => getOS().liveVoice.error === 'Voice playback unavailable — reply shown as text', 6000, 'E7: honest total-failure error');
    assert(getOS().liveVoice.status === 'idle', 'E7: overlay settles despite total failure');
    windowStub.speechSynthesis = fakeSpeechSynthesis;
    net.ttsMode = 'ok';

    // E8: interruption during LISTENING aborts the STT provider and never
    // reaches the executor; a fresh turn still works.
    const execBeforeE8 = executorCalls.length;
    const listenTurn = liveBridge.startPtt();
    await waitForCondition(
      () => (mockProvider.options as { turnId?: string } | null)?.turnId === listenTurn,
      4000,
      'E8: STT session started for this turn'
    );
    assert(getOS().liveVoice.status === 'listening', 'E8: LISTENING before interrupt');
    voiceRuntime.interrupt();
    await waitForCondition(() => getOS().liveVoice.status === 'interrupted', 4000, 'E8: interrupted from LISTENING');
    await waitForCondition(() => mockProvider.interruptCalled === true, 4000, 'E8: server interrupted the STT provider');
    await sleep(250);
    assert(executorCalls.length === execBeforeE8, 'E8: no execution happened (no final was sent)');
    // The natural user flow: after an interrupt during a held PTT, the user
    // releases the key before speaking again (the live client keeps the hold
    // until released; a held-through turn is over — the server closed its STT
    // session on INTERRUPT, so speech must re-enter via release + re-press).
    liveBridge.stopPtt();
    await bridgeTurn('E8b');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 6000, 'E8b: fresh turn works after listening interrupt');

    // E9 (re-audit F2): barge-in — pressing PTT while Sophia speaks cuts the
    // audible playback through the existing voice state/runtime. NO second
    // interruption path fires: the spoken turn already completed server-side,
    // so no INTERRUPT control frame is sent and the canonical cancellation
    // semantics (interrupt() remains the only server-cancel seam) are
    // untouched.
    decodeDurationMs = 4000; // long playback so the press lands mid-speech
    const ttsBeforeE9 = net.ttsCalls.length;
    await bridgeTurn('E9');
    await waitForCondition(() => net.ttsCalls.length >= ttsBeforeE9 + 1, 4000, 'E9: playback audio fetching');
    assert(voiceRuntime.isSpeaking() === true, 'E9: runtime reports speaking during playback');
    assert(getOS().liveVoice.status === 'speaking', 'E9: speaking overlay up during playback');

    const e9Turn = liveBridge.startPtt(); // the barge-in: founder talks over Sophia
    if (!e9Turn) throw new Error('startPtt returned null (E9)');
    assert(voiceRuntime.isSpeaking() === false, 'E9: PTT barge-in cuts spoken output immediately (F2)');
    assert(voiceRuntime.getLevels().play === 0, 'E9: playback level zeroed by the cut');
    assert(
      getOS().liveVoice.status === 'listening',
      'E9: barge-in settles into listening — NOT interrupted (no second interruption path)'
    );
    const ttsAtBarge = net.ttsCalls.length;
    await sleep(400);
    assert(net.ttsCalls.length === ttsAtBarge, 'E9: no further TTS fetches after the barge-in cut');
    assert(mockProvider.interruptCalled === false, 'E9: barge-in sent no INTERRUPT (playback cut is client-side only)');

    // The barge-in turn completes normally — the session survived the cut.
    await waitForCondition(
      () => (mockProvider.options as { turnId?: string } | null)?.turnId === e9Turn,
      4000,
      'E9: barge-in STT session started'
    );
    liveBridge.stopPtt();
    await waitForCondition(() => mockProvider.endTurnCalled === true, 4000, 'E9: STOP_PTT processed');
    mockProvider.simulateEvent({
      kind: 'final_transcript',
      turnId: e9Turn,
      text: 'hold on a second',
      isFinal: true,
      timestamp: Date.now(),
    });
    decodeDurationMs = 300;
    await waitForCondition(() => getOS().liveVoice.status === 'speaking', 4000, 'E9: barge-in turn answered and speaks');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 8000, 'E9: fresh reply settles after the barge-in');

    // E10 (re-audit F3): an older speak's late settlement must never clobber
    // a newer speak's pending count — the overlay must hold through the newer
    // reply's inter-sentence fetch gap instead of settling early (the
    // pre-fix aborted finally zeroed speakPending unconditionally).
    decodeDurationMs = 200;
    // Fetch plan (per-fetch delays, in fetch order — the delays are not
    // abort-aware, standing in for the unabortable stretch of a real
    // fetch/decode so A's settlement lands AFTER B's speak setup):
    //   A s1: 0ms (plays 200ms) | A s2: 500ms — resolves after the cut,
    //   after B's setup, before B's drain deadline (the late settlement)
    //   B s1: 0ms (plays 200ms) | B s2: 1400ms (the inter-sentence gap)
    const e10Base = net.ttsCalls.length;
    net.ttsDelays = [0, 500, 0, 1400];
    await bridgeTurn('E10-A'); // A: s1 plays; s2's fetch still in flight
    await waitForCondition(() => net.ttsCalls.length >= e10Base + 2, 4000, 'E10: A sentence2 fetch in flight');
    assert(voiceRuntime.isSpeaking() === true, 'E10: A speaking while its sentence2 fetch is in flight');

    await bridgeTurn('E10-B'); // B supersedes A (barge-in cut + fresh reply)
    await waitForCondition(() => net.ttsCalls.length >= e10Base + 3, 4000, 'E10: B sentence1 fetched');
    // Now: B s1 has ended while B s2 is still inside its 1400ms gap, and A's
    // late settlement landed inside that window. Pre-fix, the clobbered
    // speakPending let the 350ms drain settle the overlay here (orb/pill
    // idle while the reply was still being spoken).
    await sleep(800);
    assert(
      voiceRuntime.isSpeaking() === true,
      "F3: older speak's late settlement never clobbered the newer speak's pending count (overlay held through the fetch gap)"
    );
    assert(getOS().liveVoice.status === 'speaking', 'F3: status stays speaking through the inter-sentence gap');
    net.ttsDelays = [];
    decodeDurationMs = 300;
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 8000, 'E10: the newer reply settles after its true drain');

    // E11 (re-audit F4): pressing PTT during the final drain window must not
    // have the pending settle stomp the newer 'listening' status back to
    // 'idle' mid-hold.
    decodeDurationMs = 250;
    await bridgeTurn('E11');
    // Both sentences fetched + scheduled; the last fake source ends ~250ms
    // after scheduling and the 350ms drain would settle at ~600ms. Wait INTO
    // that window (after the audio ended, before the settle), then press.
    await sleep(400);
    assert(getOS().liveVoice.status === 'speaking', 'E11: reply still speaking inside the final drain window');
    const e11Turn = liveBridge.startPtt();
    if (!e11Turn) throw new Error('startPtt returned null (E11)');
    assert(voiceRuntime.isSpeaking() === false, 'E11: PTT press during the drain window cuts the tail (F2)');
    assert(getOS().liveVoice.status === 'listening', 'E11: press settles into listening');
    await sleep(500); // past the would-be settle deadline
    assert(
      getOS().liveVoice.status === 'listening',
      'F4: the late settle never stomps the newer listening status'
    );
    await waitForCondition(
      () => (mockProvider.options as { turnId?: string } | null)?.turnId === e11Turn,
      4000,
      'E11: barge-in STT session started'
    );
    liveBridge.stopPtt();
    await waitForCondition(() => mockProvider.endTurnCalled === true, 4000, 'E11: STOP_PTT processed');
    mockProvider.simulateEvent({
      kind: 'final_transcript',
      turnId: e11Turn,
      text: 'one more thing',
      isFinal: true,
      timestamp: Date.now(),
    });
    decodeDurationMs = 300;
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 8000, 'E11: post-barge-in turn settles');

    // E1: attach/detach lifecycle. E1a proves a single attach speaks; then:
    // a second attach is idempotent, one detach keeps the runtime alive
    // (refcounted), the second detach is the full cleanup, and a detached
    // runtime never speaks. Mid-speak detach settles the overlay honestly.
    const ttsBeforeA = net.ttsCalls.length;
    await bridgeTurn('E1a');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 6000, 'E1a: spoken turn settled');
    assert(net.ttsCalls.length >= ttsBeforeA + 2, 'E1a: attached runtime speaks both sentences');
    voiceRuntime.attach(); // second attach must be idempotent (count 2)
    await bridgeTurn('E1b');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 6000, 'E1b: spoken turn settled');
    voiceRuntime.detach(); // count 1 — the refcount keeps the runtime attached
    await bridgeTurn('E1b2');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 6000, 'E1b2: still speaks after one detach');
    assert(net.ttsCalls.length > 0, 'E1: refcounted detach keeps the runtime speaking');
    voiceRuntime.detach(); // count 0 — full explicit cleanup
    const ttsBaselineC = net.ttsCalls.length;
    await bridgeTurn('E1c');
    await sleep(500);
    assert(net.ttsCalls.length === ttsBaselineC, 'E1: detached runtime never speaks (full cleanup)');
    os.setLiveVoice({ status: 'idle' }); // test bookkeeping: detached turns never settle

    // E1-mid: detach WHILE speaking aborts the in-flight TTS fetch and
    // settles the client-owned overlay (P5-D2 fix).
    voiceRuntime.attach();
    net.ttsMode = 'hang';
    const speakBeforeHang = synthState.speakCount;
    const hangBaseline = net.ttsCalls.length;
    await bridgeTurn('E1-hang');
    await waitForCondition(() => getOS().liveVoice.status === 'speaking', 4000, 'E1-mid: speaking overlay up');
    await waitForCondition(() => net.ttsCalls.length >= hangBaseline + 1, 4000, 'E1-mid: hanging fetch was issued');
    voiceRuntime.detach();
    assert(getOS().liveVoice.status === 'idle', 'E1-mid: mid-speak detach settles the overlay honestly (P5-D2)');
    await sleep(300);
    assert(synthState.speakCount === speakBeforeHang, 'E1-mid: aborted fetch never falls through to system voice');
    net.ttsMode = 'ok';
    voiceRuntime.attach(); // re-attach for sections F and G

    /* ====================================================================
     * SECTION F — reconnect semantics
     * ==================================================================== */
    console.log('\nSECTION F: reconnect semantics\n');

    // F1: abnormal transport loss (1006) → automatic reconnect (fresh
    // ticket + fresh socket) → a full turn works on the new transport.
    server2 = makeServer();
    const port2 = await server2.listen(0);
    net.ticketPort = port2; // the reconnect's ticket fetch points at server2
    terminateClients(server1);
    await waitForCondition(() => getOS().liveVoice.status === 'disconnected', 4000, 'F1: transport loss surfaces');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 10000, 'F1: automatic reconnect restores the session');
    assert(getOS().liveVoice.enabled === true, 'F1: voice stays enabled across the reconnect');
    await bridgeTurn('F1-turn');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 6000, 'F1: full turn works on the recovered transport');

    // F2: reconnects are bounded — exhaustion settles with an honest error.
    net.ticketFails = true;
    terminateClients(server2);
    await waitForCondition(() => getOS().liveVoice.status === 'disconnected', 4000, 'F2: second loss surfaces');
    await waitForCondition(
      () => getOS().liveVoice.error === 'Live session lost — could not reconnect',
      25000,
      'F2: exhausted reconnects settle with the honest exhaustion error'
    );
    assert(getOS().liveVoice.status === 'error', 'F2: exhaustion settles in the error state');
    net.ticketFails = false;
    await liveBridge.toggleVoice(false);

    // F3: intentional close never reconnects.
    const okF3 = await liveBridge.toggleVoice(true);
    assert(okF3 === true, 'F3: re-established after exhaustion (manual retry works)');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 6000, 'F3: session ready');
    const ticketsF3 = net.ticketFetches;
    await liveBridge.toggleVoice(false);
    assert(getOS().liveVoice.status === 'disconnected', 'F3: intentional close disconnects');
    await sleep(2200);
    assert(net.ticketFetches === ticketsF3, 'F3: intentional close triggers zero reconnect attempts');

    // F4: supersession (4409) never reconnects (the live surface took over).
    const okF4 = await liveBridge.toggleVoice(true);
    assert(okF4 === true, 'F4: re-established');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 6000, 'F4: session ready');
    const ticketsF4 = net.ticketFetches;
    closeClientsWith(server2, 4409, 'superseded');
    await waitForCondition(() => getOS().liveVoice.status === 'disconnected', 4000, 'F4: supersession surfaces');
    await sleep(2200);
    assert(net.ticketFetches === ticketsF4, 'F4: supersession triggers zero reconnect attempts');
    await liveBridge.toggleVoice(false);

    /* ====================================================================
     * SECTION G — microphone UX (permission, denial, device loss)
     * ==================================================================== */
    console.log('\nSECTION G: microphone UX\n');

    // G1: permission DENIAL fails the session honestly and the retry
    // reconnects cleanly (pins the P5-D1 fix).
    const denied = new Error('The request is not allowed by the user agent or the platform') as Error & { name: string };
    denied.name = 'NotAllowedError';
    micState.getUserMediaImpl = async () => { throw denied; };
    const okG1 = await liveBridge.toggleVoice(true);
    assert(okG1 === false, 'G1: denied mic fails toggleVoice');
    assert(getOS().liveVoice.enabled === false, 'G1: session not left enabled');
    assert(getOS().liveVoice.status === 'error', 'G1: denial surfaces an error status');
    assert(/microphone/i.test(getOS().liveVoice.error ?? ''), 'G1: error text feeds the permission-modal micDenied derivation');
    assert(liveBridge.getClient() === null, 'G1: no zombie client — retry is possible');
    const grant1 = makeFakeStream('dev-p5-g1');
    micState.getUserMediaImpl = async () => grant1.stream;
    const okG1b = await liveBridge.toggleVoice(true);
    assert(okG1b === true, 'G1: retry after grant succeeds');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 6000, 'G1: recovered session ready');
    assert(liveBridge.getClient()?.isCapturing() === true, 'G1: capture live after recovery');

    // G2: mid-session device loss (track ended) is a fatal capture error
    // with explicit teardown.
    grant1.track.endedHandlers.forEach((fn) => fn());
    await waitForCondition(() => getOS().liveVoice.enabled === false, 4000, 'G2: device loss disables the session');
    await waitForCondition(() => getOS().liveVoice.status === 'disconnected', 4000, 'G2: device loss disconnects the transport');
    assert(getOS().liveVoice.error === 'Microphone device was disconnected', 'G2: honest device-loss error');

    // G3: devicechange enumeration backstop catches a vanished device.
    const grant3 = makeFakeStream('dev-p5-g3');
    micState.getUserMediaImpl = async () => grant3.stream;
    const okG3 = await liveBridge.toggleVoice(true);
    assert(okG3 === true, 'G3: re-established with a new device');
    await waitForCondition(() => getOS().liveVoice.status === 'idle', 6000, 'G3: session ready');
    micState.devices = []; // the active device is gone from the enumeration
    micState.devicechangeHandlers.forEach((fn) => fn());
    await waitForCondition(() => getOS().liveVoice.enabled === false, 4000, 'G3: devicechange backstop disables the session');
    await waitForCondition(() => getOS().liveVoice.status === 'disconnected', 4000, 'G3: devicechange backstop disconnects');
    assert(getOS().liveVoice.error === 'Microphone device disconnected', 'G3: honest enumeration error');
    await liveBridge.toggleVoice(false);

    /* ====================================================================
     * SECTION H — reversible retirement of the legacy voice path
     * ==================================================================== */
    console.log('\nSECTION H: legacy-path reversible retirement\n');

    const ENV = process.env as Record<string, string | undefined>;
    const hadFlag = ENV.SAMJUNIORS_VOICE_LEGACY;
    const hadNodeEnv = ENV.NODE_ENV;
    const hadSecret = ENV.SAMJUNIORS_DEV_SECRET;
    const mk = (url: string, init?: RequestInit) =>
      new NextRequest(url, init as unknown as ConstructorParameters<typeof NextRequest>[1]);

    try {
      // Flag OFF, dev mode: founder-authenticated requests → 410 Gone.
      delete ENV.SAMJUNIORS_VOICE_LEGACY;
      ENV.NODE_ENV = 'development';

      const stt410 = await sofiaSttRoute(mk('http://localhost:3000/api/sofia/stt', { method: 'POST', body: '{}' }) as never);
      assert(stt410.status === 410, 'H1: POST /api/sofia/stt → 410 with the flag off');
      const health410 = await sofiaHealthRoute();
      assert(health410.status === 410, 'H1: GET /api/sofia/health → 410 with the flag off');
      const img410 = await sofiaImgRoute(mk('http://localhost:3000/api/sofia/img?url=https%3A%2F%2Fx%2Fi.png') as never);
      assert(img410.status === 410, 'H1: GET /api/sofia/img → 410 with the flag off');
      const media410 = await sofiaMediaRoute(mk('http://localhost:3000/api/sofia/media?url=https%3A%2F%2Fx%2Fv.mp4') as never);
      assert(media410.status === 410, 'H1: GET /api/sofia/media → 410 with the flag off');
      const page410 = await sofiaPageRoute(mk('http://localhost:3000/api/sofia/page?url=https%3A%2F%2Fx%2Fa') as never);
      assert(page410.status === 410, 'H1: GET /api/sofia/page → 410 with the flag off');
      const file410 = await sofiaFileRoute(mk('http://localhost:3000/api/sofia/file?path=%2Ftmp%2Fx.png') as never);
      assert(file410.status === 410, 'H1: GET /api/sofia/file → 410 with the flag off');

      // Auth fires BEFORE the flag check: production misconfiguration still
      // fails closed with 401, not 410 (removal never weakens a control).
      ENV.NODE_ENV = 'production';
      delete ENV.SAMJUNIORS_DEV_SECRET;
      const stt401 = await sofiaSttRoute(mk('http://localhost:3000/api/sofia/stt', { method: 'POST', body: '{}' }) as never);
      assert(stt401.status === 401, 'H2: auth precedes retirement (401, not 410, in prod without a secret)');
      const img401 = await sofiaImgRoute(mk('http://localhost:3000/api/sofia/img?url=https%3A%2F%2Fx%2Fi.png') as never);
      assert(img401.status === 401, 'H2: auth precedes retirement on the proxy routes too');

      // Shared canonical routes are NOT retired.
      ENV.NODE_ENV = 'development';
      const ask = await sofiaAskRoute(mk('http://localhost:3000/api/sofia/ask', {
        method: 'POST',
        body: JSON.stringify({ text: '' }),
        headers: { 'content-type': 'application/json' },
      }) as never);
      assert(ask.status !== 410, 'H3: POST /api/sofia/ask is not retired (canonical typed surface)');
      const tts = await sofiaTtsRoute(mk('http://localhost:3000/api/sofia/tts', {
        method: 'POST',
        body: JSON.stringify({ text: '' }),
        headers: { 'content-type': 'application/json' },
      }) as never);
      assert(tts.status !== 410, 'H3: POST /api/sofia/tts is not retired (new-path TTS ladder)');

      // Flag ON: the legacy routes are fully restored.
      ENV.SAMJUNIORS_VOICE_LEGACY = '1';
      const sttOn = await sofiaSttRoute(mk('http://localhost:3000/api/sofia/stt', { method: 'POST', body: 'x'.repeat(100) }) as never);
      assert(sttOn.status !== 410 && sttOn.status !== 401, 'H4: stt restored with the flag on (reaches route logic)');
      const healthOn = await sofiaHealthRoute();
      assert(healthOn.status === 200, 'H4: health inventory restored with the flag on');
      const imgOn = await sofiaImgRoute(mk('http://localhost:3000/api/sofia/img') as never);
      assert(imgOn.status === 400, 'H4: img restored (ordinary validation: missing url → 400)');
      const mediaOn = await sofiaMediaRoute(mk('http://localhost:3000/api/sofia/media') as never);
      assert(mediaOn.status === 400, 'H4: media restored (missing url → 400)');
      const pageOn = await sofiaPageRoute(mk('http://localhost:3000/api/sofia/page') as never);
      assert(pageOn.status !== 410 && pageOn.status !== 401, 'H4: page restored with the flag on (reaches route logic)');
      const fileOn = await sofiaFileRoute(mk('http://localhost:3000/api/sofia/file') as never);
      assert(fileOn.status === 400, 'H4: file restored (missing path → 400)');
    } finally {
      if (hadFlag === undefined) delete ENV.SAMJUNIORS_VOICE_LEGACY;
      else ENV.SAMJUNIORS_VOICE_LEGACY = hadFlag;
      if (hadNodeEnv === undefined) delete ENV.NODE_ENV;
      else ENV.NODE_ENV = hadNodeEnv;
      if (hadSecret === undefined) delete ENV.SAMJUNIORS_DEV_SECRET;
      else ENV.SAMJUNIORS_DEV_SECRET = hadSecret;
    }
  } finally {
    // Task-6 harness pattern: report the summary BEFORE the teardown awaits —
    // the WS close handshake can starve the drain and silently skip the
    // summary in this environment. process.exit carries the true code.
    console.log('\n==================================================');
    console.log(`PHASE 5 VOICE PARITY SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================\n');

    const exitCode = failed > 0 ? 1 : 0;
    try { await liveBridge.toggleVoice(false); } catch { /* ignore */ }
    voiceRuntime.detach();
    const closers: Array<Promise<void>> = [server1.close()];
    if (server2) closers.push(server2.close());
    void Promise.allSettled(closers).then(() => process.exit(exitCode));
    // Not unref'd: an unref'd backstop can lose the race against a naturally
    // draining event loop, silently converting failures into exit 0.
    setTimeout(() => process.exit(exitCode), 2500);
  }
}

runTests().then(() => {
  /* no-op: runTests owns its summary + exit */
}).catch((err) => {
  console.error('Fatal error running Phase 5 voice parity suite:', err);
  process.exit(1);
});
