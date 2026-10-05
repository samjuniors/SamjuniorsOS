/**
 * ============================================================================
 * PHASE 4 — GOVERNANCE, INTERRUPTION & SECURITY HARDENING REGRESSION TESTS
 * ============================================================================
 * Pins the fixes from the Phase 4 focused security / execution-governance
 * review of the integrated voice path (feat/sofiaui-voice-integration):
 *
 *   G1. processedTurnIds is founder-scoped — one founder's INTERRUPT cannot
 *       poison (pre-mark) another founder's turnId into silent suppression.
 *       (Pre-fix: the map was global and keyed by bare client-supplied
 *       turnIds, so a second authenticated socket could silently drop any
 *       turn whose id it predicted.)
 *   G2. Server-side turnId validation — malformed / oversized / reserved-
 *       character turnIds are rejected with INVALID_TURN_ID before they
 *       touch session state, the suppression map or durable idempotency keys.
 *   G3. A settling turn's finally does not stomp a newer turn that already
 *       owns the session (INTERRUPT -> immediate START_PTT race): the newer
 *       turn keeps LISTENING state, its STT provider survives, and its audio
 *       frames keep flowing.
 *   G4. /api/sofia/ask never presents the cancelled-turn marker
 *       ('(turn interrupted)') as a live assistant answer — cancelled replays
 *       settle with an honest empty done frame carrying cancelled:true.
 *   G5. STT stream init failures are FATAL (the runtime routes fatal errors
 *       to explicit capture teardown + permission-modal recovery) and leave
 *       no zombie provider session entry.
 *   G6. Gemini API keys ride the x-goog-api-key header — never the URL — in
 *       both the realtime provider and the /api/realtime/turn route (query
 *       strings persist in proxies, access logs and error reporters).
 *   G7. DeepgramFluxProvider: a rapid PTT tap (STOP_PTT while the socket is
 *       still CONNECTING) still produces ForceEndTurn once the socket opens —
 *       the turn's final transcript is not silently lost.
 *
 * Deterministic by construction: injected slow executor + mock/failing STT
 * providers, a stubbed global fetch for the Gemini provider, and real
 * WebSocket upgrades through the server's dev-mode authenticateUpgrade
 * (x-samjuniors-user-id selects the founder — the documented dev fallback,
 * mirroring how the sandbox gateway authenticates browser connections).
 *
 * Harness note (established repo pattern, Task 6 / Phase 3): the WS server
 * section runs LAST and the summary is reported BEFORE the teardown await —
 * the WS close handshake can starve the event-loop drain in this environment
 * and silently skip summaries otherwise. process.exit carries the true exit
 * code. Run with: bun run tests/sophia/phase4_governance_hardening.test.ts
 */

import { WebSocket, WebSocketServer } from 'ws';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LiveInteractionServer } from '../../src/lib/server/live/server';
import type { SophiaTurnExecutorFn } from '../../src/lib/server/live/server';
import { LiveSessionManager } from '../../src/lib/server/live/session-manager';
import { ServerLiveMessage } from '../../src/lib/server/live/types';
import { STTProvider, CanonicalTranscriptEvent } from '../../src/lib/server/live/stt/types';
import { DeepgramFluxProvider } from '../../src/lib/server/live/stt/deepgram-flux-provider';
import { GeminiRealtimeProvider } from '../../src/lib/server/live/providers/gemini-provider';
import { SOPHIA_TURN_CANCELLED_MARKER } from '../../src/lib/server/sophia/turn-executor';
import type { SophiaTurnResult } from '../../src/lib/server/sophia/turn-executor';
import { ConversationStore } from '../../src/lib/server/conversation';
import { POST as askRoutePOST } from '../../src/app/api/sofia/ask/route';

/* ------------------------------------------------------------------ helpers */

class BufferedSocket {
  public ws: WebSocket;
  public messages: ServerLiveMessage[] = [];
  private waiters: Array<{
    predicate: (msg: ServerLiveMessage) => boolean;
    resolve: (msg: ServerLiveMessage) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.on('message', (data: any) => {
      try {
        const parsed = JSON.parse(data.toString('utf-8')) as ServerLiveMessage;
        this.messages.push(parsed);
        this.checkWaiters();
      } catch {
        /* binary frames from the server do not exist; ignore parse noise */
      }
    });
  }

  private checkWaiters() {
    for (let i = 0; i < this.waiters.length; i++) {
      const waiter = this.waiters[i];
      const matchIndex = this.messages.findIndex(waiter.predicate);
      if (matchIndex !== -1) {
        const matched = this.messages.splice(matchIndex, 1)[0];
        clearTimeout(waiter.timer);
        this.waiters.splice(i, 1);
        i--;
        waiter.resolve(matched);
      }
    }
  }

  public waitFor<T extends ServerLiveMessage>(
    predicate: (msg: ServerLiveMessage) => boolean,
    timeoutMs = 4000
  ): Promise<T> {
    const matchIndex = this.messages.findIndex(predicate);
    if (matchIndex !== -1) {
      const matched = this.messages.splice(matchIndex, 1)[0];
      return Promise.resolve(matched as T);
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for message after ${timeoutMs}ms. Buffered: ${JSON.stringify(this.messages)}`));
      }, timeoutMs);

      this.waiters.push({
        predicate,
        resolve: (m) => resolve(m as T),
        timer,
      });
    });
  }

  public send(msg: any): void {
    this.ws.send(JSON.stringify(msg));
  }

  public close(): void {
    this.ws.close();
  }
}

async function waitForCondition(cond: () => boolean, timeoutMs = 4000, label = 'condition'): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for ${label}`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSseFrames(body: string): Array<Record<string, any>> {
  const frames: Array<Record<string, any>> = [];
  for (const line of body.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        frames.push(JSON.parse(line.slice(6)));
      } catch {
        /* ignore torn lines */
      }
    }
  }
  return frames;
}

// Mock STT Provider for deterministic companion server integration tests
class MockSTTProvider implements STTProvider {
  public readonly providerId = 'mock-stt';
  public readonly providerName = 'Mock STT Provider';

  public options: any = null;
  public audioChunks: Buffer[] = [];
  public endTurnCalled = false;
  public interruptCalled = false;
  public closed = false;

  private eventListeners: Array<(event: CanonicalTranscriptEvent) => void> = [];

  public onEvent(listener: (event: CanonicalTranscriptEvent) => void): void {
    this.eventListeners.push(listener);
  }

  public onError(_listener: (error: Error) => void): void {
    /* not exercised by this suite */
  }

  public async startStream(opts: any): Promise<void> {
    this.options = opts;
    this.closed = false;
    this.endTurnCalled = false;
    this.audioChunks = [];
  }

  public sendAudio(chunk: Buffer): void {
    this.audioChunks.push(chunk);
  }

  public async endTurn(): Promise<void> {
    this.endTurnCalled = true;
  }

  public interrupt(): void {
    this.interruptCalled = true;
  }

  public async close(): Promise<void> {
    this.closed = true;
  }

  public simulateEvent(event: CanonicalTranscriptEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }
}

// STT provider whose stream cannot start (G5: init-failure path)
class FailingSTTProvider implements STTProvider {
  public readonly providerId = 'failing-stt';
  public readonly providerName = 'Failing STT Provider';
  public closed = false;

  public onEvent(_listener: (event: CanonicalTranscriptEvent) => void): void {
    /* not exercised */
  }

  public onError(_listener: (error: Error) => void): void {
    /* not exercised */
  }

  public async startStream(_opts: any): Promise<void> {
    throw new Error('phase4 simulated STT init failure');
  }

  public sendAudio(_chunk: Buffer): void {
    /* not exercised */
  }

  public async endTurn(): Promise<void> {
    /* not exercised */
  }

  public interrupt(): void {
    /* not exercised */
  }

  public async close(): Promise<void> {
    this.closed = true;
  }
}

/* -------------------------------------------------------------------- suite */

async function runTests() {
  console.log('--- STARTING PHASE 4 GOVERNANCE HARDENING SUITE ---\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      failed++;
    }
  }

  /* ======================================================================
   * SECTION G4 — /api/sofia/ask must not present the cancelled-turn marker
   * as a live assistant answer (route-handler test, no WS needed).
   * ==================================================================== */

  console.log('SECTION G4: ask route — cancelled replay honesty\n');

  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = 'development';

  {
    const founderId = 'founder-local-session'; // dev-mode founder identity
    const convStore = ConversationStore.getInstance();
    const convId = 'conv_p4_ask_cancelled';
    try {
      await convStore.createConversation({
        id: convId,
        founderId,
        agentId: 'sophia',
        title: 'P4 ask cancelled-replay probe',
      });
    } catch {
      /* already exists from a prior run — the idempotent keys below dedupe */
    }
    await convStore.saveMessage(
      {
        conversationId: convId,
        sender: 'founder',
        role: 'user',
        content: 'phase four cancelled replay probe',
        idempotencyKey: 'p4_ask_cancelled_1',
      },
      founderId
    );
    await convStore.saveMessage(
      {
        conversationId: convId,
        sender: 'assistant',
        role: 'assistant',
        content: SOPHIA_TURN_CANCELLED_MARKER,
        idempotencyKey: 'p4_ask_cancelled_1:assistant',
        intent: 'conversation',
        metadata: { cancelled: true, ingress: 'sofia_ask' },
      },
      founderId
    );

    const req = new NextRequest('http://localhost:3000/api/sofia/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'phase four cancelled replay probe',
        conversationId: convId,
        turnId: 'p4_ask_cancelled_1',
      }),
    });
    const res = await askRoutePOST(req);
    assert(res.status === 200, 'G4: ask route answers 200');
    assert(String(res.headers.get('content-type') ?? '').includes('text/event-stream'), 'G4: SSE content type');

    const bodyText = await res.text();
    const frames = parseSseFrames(bodyText);
    const done = frames.find((f) => f.type === 'done');

    assert(!!done, 'G4: done frame present');
    assert(done?.cancelled === true, 'G4: done frame carries cancelled:true');
    assert((done?.text ?? '') === '', 'G4: done frame text is empty (marker not presented as the answer)');
    assert(done?.idempotentReplay === true, 'G4: replay is still reported as an idempotent replay');
    assert(
      !frames.some((f) => f.type === 'text' && String(f.delta ?? '').includes(SOPHIA_TURN_CANCELLED_MARKER)),
      'G4: no text frame ever streams the cancelled-turn marker content'
    );
    assert(frames.some((f) => f.type === 'ready'), 'G4: ready frame contract preserved');
  }

  (process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_NODE_ENV ?? 'development';

  /* ======================================================================
   * SECTION G6 — Gemini API key transport: header, never URL.
   * ==================================================================== */

  console.log('\nSECTION G6: Gemini key transport (x-goog-api-key header)\n');

  {
    const captured: Array<{ url: string; headers: Record<string, string> }> = [];
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = async (input: any, init?: any) => {
      captured.push({
        url: typeof input === 'string' ? input : String(input?.url ?? input),
        headers: (init?.headers as Record<string, string>) ?? {},
      });
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'phase four stub reply' }] } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };
    try {
      const provider = new GeminiRealtimeProvider('phase4-stub-key', 'gemini-flash-latest');
      const out = await provider.executeTurn({
        turnId: 'g6_turn_1',
        founderMessage: 'phase four key transport probe',
      } as any);
      assert(out.fullText === 'phase four stub reply', 'G6: stubbed provider turn resolved');
    } finally {
      (globalThis as any).fetch = realFetch;
    }

    assert(captured.length >= 1, 'G6: provider issued at least one fetch');
    const hit = captured[0];
    assert(!hit.url.includes('key='), 'G6: request URL carries no API key query parameter');
    assert(
      hit.headers['x-goog-api-key'] === 'phase4-stub-key',
      'G6: API key sent via the x-goog-api-key header'
    );

    // Source-level tripwires (regression guard for both former ?key= sites).
    // fileURLToPath(import.meta.url) instead of import.meta.dir — the latter
    // is bun-only and would add a tsc diagnostic to the baseline.
    const geminiSrc = readFileSync(
      fileURLToPath(new URL('../../src/lib/server/live/providers/gemini-provider.ts', import.meta.url)),
      'utf-8'
    );
    const realtimeRouteSrc = readFileSync(
      fileURLToPath(new URL('../../src/app/api/realtime/turn/route.ts', import.meta.url)),
      'utf-8'
    );
    assert(!geminiSrc.includes('?key='), 'G6: gemini-provider source contains no ?key= query construction');
    assert(geminiSrc.includes('x-goog-api-key'), 'G6: gemini-provider authenticates via header');
    assert(!realtimeRouteSrc.includes('?key='), 'G6: /api/realtime/turn source contains no ?key= query construction');
    assert(realtimeRouteSrc.includes('x-goog-api-key'), 'G6: /api/realtime/turn authenticates via header');
  }

  /* ======================================================================
   * SECTION G7 — DeepgramFluxProvider rapid PTT tap (pendingEndTurn).
   * ==================================================================== */

  console.log('\nSECTION G7: Deepgram rapid-tap endTurn while CONNECTING\n');

  {
    const dgServer = new WebSocketServer({ port: 0 });
    const dgPort = (dgServer.address() as any).port;
    const received: string[] = [];
    dgServer.on('connection', (ws) => {
      ws.on('message', (data: any) => {
        received.push(data.toString('utf-8'));
      });
    });

    const provider = new DeepgramFluxProvider({
      apiKey: 'phase4-deepgram-stub',
      endpoint: `ws://localhost:${dgPort}`,
    });

    // START_PTT fires; the handshake is still CONNECTING when the user
    // releases the button immediately (rapid tap: STOP_PTT -> endTurn).
    const started = provider.startStream({
      sessionId: 'g7_session',
      founderId: 'founder-p4-g7',
      turnId: 'g7_turn_1',
      sampleRate: 16000,
    } as any);
    await provider.endTurn(); // must be remembered, not dropped
    await started; // handshake completes -> pendingEndTurn must fire now

    await waitForCondition(
      () => received.some((m) => { try { return JSON.parse(m).type === 'ForceEndTurn'; } catch { return false; } }),
      4000,
      'ForceEndTurn delivered after socket open'
    );
    assert(
      received.some((m) => { try { return JSON.parse(m).type === 'ForceEndTurn'; } catch { return false; } }),
      'G7: ForceEndTurn is delivered once the socket opens (rapid-tap turn not lost)'
    );

    await provider.close();
    await new Promise<void>((r) => dgServer.close(() => r()));
  }

  /* ======================================================================
   * SECTIONS G1 / G2 / G3 / G5 — live server hardening (deterministic
   * executor + mock STT). Runs LAST: it owns the WS teardown + the summary
   * report (Task 6 pattern: report + exit BEFORE awaiting the WS close).
   * ==================================================================== */

  console.log('\nSECTION G1/G2/G3/G5: live server governance hardening\n');

  const sessionManager = LiveSessionManager.getInstance();

  let mockProvider = new MockSTTProvider();
  let failingProvider: FailingSTTProvider | null = null;
  let sttFailNext = false;

  const executorCalls: Array<{ turnId?: string; signal?: AbortSignal }> = [];
  let resolveCurrentExecution: ((r: SophiaTurnResult) => void) | null = null;

  const slowExecutor: SophiaTurnExecutorFn = (opts) => {
    executorCalls.push({ turnId: opts.turnId, signal: opts.signal });
    return new Promise<SophiaTurnResult>((resolve) => {
      resolveCurrentExecution = resolve;
    });
  };

  function resolveExecution(r: SophiaTurnResult): void {
    (resolveCurrentExecution as ((res: SophiaTurnResult) => void) | null)?.(r);
  }

  const server = new LiveInteractionServer({
    port: 0,
    sessionManager,
    sttProviderFactory: () => {
      if (sttFailNext) {
        sttFailNext = false;
        failingProvider = new FailingSTTProvider();
        return failingProvider;
      }
      mockProvider = new MockSTTProvider();
      return mockProvider;
    },
    turnExecutor: slowExecutor,
  });
  const serverPort = await server.listen(0);
  const wsUrl = `ws://localhost:${serverPort}`;

  // Two DISTINCT founders via the documented dev-mode upgrade fallback
  // (x-samjuniors-user-id selects the founder identity).
  const rawA = new WebSocket(wsUrl, { headers: { 'x-samjuniors-user-id': 'founder-p4-a' } });
  const clientA = new BufferedSocket(rawA);
  await new Promise<void>((r) => rawA.on('open', r));
  await clientA.waitFor((m) => m.type === 'SESSION_READY');

  const rawB = new WebSocket(wsUrl, { headers: { 'x-samjuniors-user-id': 'founder-p4-b' } });
  const clientB = new BufferedSocket(rawB);
  await new Promise<void>((r) => rawB.on('open', r));
  await clientB.waitFor((m) => m.type === 'SESSION_READY');

  try {
    /* ---------------- G1: cross-founder suppression poisoning ---------------- */

    clientA.send({ type: 'START_PTT', turnId: 'g1_turn_a' });
    await clientA.waitFor((m) => m.type === 'PTT_ACK' && (m as any).state === 'STARTED');
    await waitForCondition(() => mockProvider.options !== null, 4000, 'A STT session started');

    // Founder B tries to pre-mark (poison) founder A's turnId via INTERRUPT.
    clientB.send({ type: 'INTERRUPT', turnId: 'g1_turn_a' });
    await clientB.waitFor((m) => m.type === 'INTERRUPTED_ACK');

    // A's STT final arrives — it must NOT be suppressed by B's interrupt.
    mockProvider.simulateEvent({
      kind: 'final_transcript',
      turnId: 'g1_turn_a',
      text: 'founder A asks for the company pulse',
      isFinal: true,
      timestamp: Date.now(),
    });

    await clientA.waitFor((m) => m.type === 'TRANSCRIPT_FINAL' && (m as any).turnId === 'g1_turn_a');
    await waitForCondition(() => executorCalls.length === 1, 4000, "A's turn executed (not poisoned)");
    assert(executorCalls[0].turnId === 'g1_turn_a', 'G1: cross-founder INTERRUPT could not suppress the turn');
    assert(
      executorCalls[0].signal?.aborted !== true,
      'G1: cross-founder INTERRUPT could not abort the execution either (per-socket registry)'
    );

    resolveExecution({
      success: true,
      reply: 'Founder A reply.',
      conversationId: 'conv_p4_g1',
      intent: 'conversation',
      directiveExecuted: false,
      liveAi: true,
    });
    const respA = await clientA.waitFor((m) => m.type === 'SOPHIA_RESPONSE');
    assert((respA as any).turnId === 'g1_turn_a', 'G1: the response is delivered to A undisturbed');

    /* ---------------- G2: turnId validation at the boundary ---------------- */

    const oversized = 'x'.repeat(300);
    clientA.send({ type: 'START_PTT', turnId: oversized });
    await clientA.waitFor((m) => m.type === 'ERROR' && (m as any).code === 'INVALID_TURN_ID');
    assert(
      !clientA.messages.some((m) => m.type === 'PTT_ACK' && (m as any).turnId === oversized),
      'G2: oversized turnId rejected with no PTT_ACK'
    );

    clientA.send({ type: 'START_PTT', turnId: 'bad:id' });
    await clientA.waitFor((m) => m.type === 'ERROR' && (m as any).code === 'INVALID_TURN_ID');
    assert(
      !clientA.messages.some((m) => m.type === 'PTT_ACK' && (m as any).turnId === 'bad:id'),
      'G2: colon-carrying turnId rejected (reserved for key composition)'
    );

    clientA.send({ type: 'INTERRUPT', turnId: 'bad/id' });
    await clientA.waitFor((m) => m.type === 'ERROR' && (m as any).code === 'INVALID_TURN_ID');
    assert(
      !clientA.messages.some((m) => m.type === 'INTERRUPTED_ACK'),
      'G2: malformed INTERRUPT turnId rejected without ack or state change'
    );

    clientA.send({ type: 'START_PTT', turnId: 'g2_turn_ok' });
    await clientA.waitFor((m) => m.type === 'PTT_ACK' && (m as any).state === 'STARTED');
    await waitForCondition(() => mockProvider.options?.turnId === 'g2_turn_ok', 4000, 'valid turnId still starts STT');
    assert(true, 'G2: well-formed turnIds still flow through the validated path');

    /* ---------------- G3: settling turn must not stomp a newer turn ---------------- */

    clientA.send({ type: 'START_PTT', turnId: 'g3_t1' });
    await clientA.waitFor((m) => m.type === 'PTT_ACK' && (m as any).state === 'STARTED');
    await waitForCondition(() => mockProvider.options?.turnId === 'g3_t1', 4000, 'T1 STT session');

    mockProvider.simulateEvent({
      kind: 'final_transcript',
      turnId: 'g3_t1',
      text: 'interrupted then superseded',
      isFinal: true,
      timestamp: Date.now(),
    });
    await clientA.waitFor((m) => m.type === 'TRANSCRIPT_FINAL' && (m as any).turnId === 'g3_t1');
    await waitForCondition(() => executorCalls.length === 2, 4000, 'T1 executing');
    const t1Signal = executorCalls[1].signal;

    // Barge-in aborts T1 (its execution settles later)…
    clientA.send({ type: 'INTERRUPT', turnId: 'g3_t1' });
    await clientA.waitFor((m) => m.type === 'INTERRUPTED_ACK');

    // …and the user immediately starts T2, which now owns the session.
    clientA.send({ type: 'START_PTT', turnId: 'g3_t2' });
    await clientA.waitFor((m) => m.type === 'PTT_ACK' && (m as any).state === 'STARTED');
    await waitForCondition(() => mockProvider.options?.turnId === 'g3_t2', 4000, 'T2 STT owns the socket');
    const providerT2 = mockProvider;

    // NOW T1's execution settles — its finally must not stomp T2.
    resolveExecution({
      success: false,
      cancelled: true,
      reply: '',
      conversationId: 'conv_p4_g3',
      intent: 'conversation',
      directiveExecuted: false,
      liveAi: false,
      error: 'Turn cancelled before completion',
    });
    await sleep(300);

    assert(t1Signal?.aborted === true, 'G3: T1 was aborted by the interrupt');
    assert(providerT2.closed === false, 'G3: T2 STT provider survived T1 settling (no unconditional closeSttSession)');

    // T2's audio keeps flowing -> the session is still LISTENING, not stomped to IDLE.
    const audioChunk = Buffer.alloc(640, 1); // 20ms of 16kHz mono PCM
    rawA.send(audioChunk);
    await sleep(150);
    assert(
      providerT2.audioChunks.length === 1,
      'G3: T2 audio still accepted after T1 settled (session stayed LISTENING)'
    );

    /* ---------------- G5: STT init failure is fatal + zombie cleaned ---------------- */

    sttFailNext = true;
    clientA.send({ type: 'START_PTT', turnId: 'g5_turn_1' });
    const errFrame = await clientA.waitFor((m) => m.type === 'ERROR' && (m as any).code === 'STT_INIT_FAILED');
    assert((errFrame as any).fatal === true, 'G5: STT init failure reports fatal:true (teardown routing)');
    await sleep(150);
    assert(
      (failingProvider as FailingSTTProvider | null)?.closed === true,
      'G5: failed provider session entry cleaned (no zombie)'
    );
  } finally {
    // Task-6 harness pattern: report the summary BEFORE the teardown await —
    // the WS close handshake can starve the drain and silently skip the
    // summary in this environment. process.exit carries the true code.
    console.log('\n==================================================');
    console.log(`PHASE 4 GOVERNANCE HARDENING SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================\n');

    const exitCode = failed > 0 ? 1 : 0;
    try {
      clientA.close();
      clientB.close();
    } catch {
      /* ignore */
    }
    void server.close().then(() => {
      process.exit(exitCode);
    });
    // Backstop in case the close handshake never settles.
    setTimeout(() => process.exit(exitCode), 2000).unref?.();
  }
}

runTests().catch((err) => {
  console.error('Fatal error running Phase 4 governance hardening test suite:', err);
  process.exit(1);
});
