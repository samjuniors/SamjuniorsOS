/**
 * ============================================================================
 * SOFIAUI VOICE RUNTIME — PHASE 3 CONTRACT TESTS
 * ============================================================================
 * Verifies the Phase 3 (SofiaUI voice integration) voice-runtime contracts:
 *
 *   A. executeSophiaTurn cooperative cancellation (AbortSignal):
 *      - pre-aborted signal with no persisted turn -> cancelled, nothing recorded
 *      - cancelled turn with a persisted founder message -> cancelled-marker
 *        persisted under the standard `${turnId}:assistant` idempotency key
 *      - retry of a cancelled turn replays the cancellation (no re-execution)
 *
 *   C. SophiaLiveClient turnId ownership (interim-caption fix):
 *      - startPtt(callerTurnId) uses the caller-owned turnId on the wire
 *      - stopPtt/interrupt carry the same turnId (retained through THINKING)
 *      - legacy no-arg startPtt still mints a local turn id
 *
 *   D. osStore interim-caption contract (matching turnIds accepted, stray
 *      interims for other turns still dropped).
 *
 *   B. Live server INTERRUPT wiring (injected deterministic executor):
 *      - INTERRUPT during THINKING aborts the in-flight execution's signal
 *      - a cancelled turn delivers NO SOPHIA_RESPONSE; state settles IDLE
 *      - a racing late STT final for the interrupted turnId is dropped
 *      - a normal (non-interrupted) turn still delivers SOPHIA_RESPONSE
 *      - INTERRUPT with no in-flight turn is harmless
 *
 * Deterministic by construction: zero live STT/LLM/TTS provider calls — the
 * server section injects a controllable turn executor (the same seam the
 * canonical executeSophiaTurn occupies) and a mock STT provider.
 *
 * Harness note (established repo pattern, Task 6): the WebSocket server
 * section runs LAST and the summary is reported BEFORE the teardown await —
 * the WS close handshake can starve the event-loop drain in this
 * environment and silently skip summaries otherwise. process.exit carries
 * the true exit code.
 */

import { WebSocket } from 'ws';
import { LiveInteractionServer } from '../../src/lib/server/live/server';
import type { SophiaTurnExecutorFn } from '../../src/lib/server/live/server';
import { LiveSessionManager } from '../../src/lib/server/live/session-manager';
import { LiveTicketStore } from '../../src/lib/server/live/ticket-store';
import { ServerLiveMessage } from '../../src/lib/server/live/types';
import { STTProvider, CanonicalTranscriptEvent } from '../../src/lib/server/live/stt/types';
import { executeSophiaTurn, SOPHIA_TURN_CANCELLED_MARKER } from '../../src/lib/server/sophia/turn-executor';
import type { SophiaTurnResult } from '../../src/lib/server/sophia/turn-executor';
import { ConversationStore } from '../../src/lib/server/conversation';
import { SophiaLiveClient } from '../../src/lib/client/live/live-client';
import { os, getOS } from '../../src/os/lib/osStore';

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
        /* ignore */
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
  private errorListeners: Array<(error: Error) => void> = [];

  public onEvent(listener: (event: CanonicalTranscriptEvent) => void): void {
    this.eventListeners.push(listener);
  }

  public onError(listener: (error: Error) => void): void {
    this.errorListeners.push(listener);
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

  // Test helpers to simulate provider events
  public simulateEvent(event: CanonicalTranscriptEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  public simulateError(err: Error): void {
    for (const listener of this.errorListeners) {
      listener(err);
    }
  }
}

/* -------------------------------------------------------------------- suite */

async function runTests() {
  console.log('--- STARTING SOFIAUI VOICE RUNTIME (PHASE 3) SUITE ---\n');
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

  const testFounder = {
    userId: 'founder-p3-runtime',
    email: 'founder@samjuniors.com',
    name: 'Executive Founder',
    role: 'FOUNDER' as const,
    isVerified: true,
  };

  const convStore = ConversationStore.getInstance();

  /* ======================================================================
   * SECTION A — executeSophiaTurn cooperative cancellation (AbortSignal)
   * ==================================================================== */

  console.log('SECTION A: executeSophiaTurn cancellation semantics\n');

  // A1: signal aborted BEFORE the turn starts, nothing persisted -> the turn
  // leaves no record at all (checkpoint 0, before conversation resolution).
  {
    const controller = new AbortController();
    controller.abort();
    const result = await executeSophiaTurn({
      message: 'what is the active MRR',
      founderId: testFounder.userId,
      turnId: 'p3_cancel_fresh_001',
      signal: controller.signal,
    });
    assert(result.cancelled === true, 'A1: pre-aborted turn resolves cancelled (not thrown)');
    assert(result.success === false, 'A1: cancelled turn is not a success');
    assert(result.reply === '', 'A1: cancelled turn carries no reply');
    assert(result.conversationId === '', 'A1: cancelled-before-start provisions no conversation');
  }

  // A2: founder message already persisted, signal aborted -> a cancelled
  // assistant marker is persisted under the standard idempotency key.
  {
    const convId = 'conv_p3_cancel_marker';
    await convStore.createConversation({
      id: convId,
      founderId: testFounder.userId,
      agentId: 'sophia',
      title: 'P3 cancellation marker test',
    });
    await convStore.saveMessage(
      {
        conversationId: convId,
        sender: 'founder',
        role: 'user',
        content: 'what is the active MRR',
        idempotencyKey: 'p3_cancel_marker_turn',
      },
      testFounder.userId
    );

    const controller = new AbortController();
    controller.abort();
    const result = await executeSophiaTurn({
      message: 'what is the active MRR',
      founderId: testFounder.userId,
      conversationId: convId,
      turnId: 'p3_cancel_marker_turn',
      signal: controller.signal,
    });

    assert(result.cancelled === true, 'A2: mid-record cancelled turn resolves cancelled');
    assert(result.conversationId === convId, 'A2: cancelled turn preserves the conversation binding');

    const marker = await convStore.findMessageByIdempotencyKey(convId, 'p3_cancel_marker_turn:assistant');
    assert(!!marker, 'A2: cancelled-turn assistant marker persisted');
    assert(marker?.content === SOPHIA_TURN_CANCELLED_MARKER, 'A2: marker content is the cancelled-turn marker');
    assert(marker?.metadata?.cancelled === true, 'A2: marker metadata records cancellation');

    const founderMsg = await convStore.findMessageByIdempotencyKey(convId, 'p3_cancel_marker_turn');
    assert(!!founderMsg, 'A2: the founder message survives cancellation (ownership preserved)');

    // A3: retrying the SAME turnId replays the cancellation marker — the
    // exactly-once guarantee holds across cancellation (no re-execution).
    const replay = await executeSophiaTurn({
      message: 'what is the active MRR',
      founderId: testFounder.userId,
      conversationId: convId,
      turnId: 'p3_cancel_marker_turn',
    });
    assert(replay.idempotentReplay === true, 'A3: cancelled-turn retry is an idempotent replay');
    assert(replay.cancelled === true, 'A3: replay reports cancelled (marker metadata surfaced)');
    assert(replay.reply === SOPHIA_TURN_CANCELLED_MARKER, 'A3: replay returns the cancelled marker content');
  }

  /* ======================================================================
   * SECTION C — SophiaLiveClient turnId ownership (interim-caption fix)
   * ==================================================================== */

  console.log('\nSECTION C: client turnId ownership\n');

  {
    const sent: any[] = [];
    const client = new SophiaLiveClient({});
    // Deterministic fake transport: an OPEN socket that records control frames.
    (client as any).ws = {
      readyState: 1, // WebSocket.OPEN
      send: (data: string) => {
        sent.push(JSON.parse(data));
      },
    };

    const turnId = client.startPtt('voice_turn_bridge_owned_1');
    assert(turnId === 'voice_turn_bridge_owned_1', 'C1: startPtt returns the caller-owned turnId');
    assert(
      sent.some((m) => m.type === 'START_PTT' && m.turnId === 'voice_turn_bridge_owned_1'),
      'C1: START_PTT on the wire carries the caller-owned turnId'
    );

    client.stopPtt();
    assert(
      sent.some((m) => m.type === 'STOP_PTT' && m.turnId === 'voice_turn_bridge_owned_1'),
      'C2: STOP_PTT gates precisely on the same turnId'
    );

    client.interrupt();
    assert(
      sent.some((m) => m.type === 'INTERRUPT' && m.turnId === 'voice_turn_bridge_owned_1'),
      'C3: THINKING-phase INTERRUPT identifies the in-flight turn server-side (turnId retained after release)'
    );

    const legacyTurn = client.startPtt();
    assert(/^turn_/.test(legacyTurn), 'C4: legacy no-arg startPtt still mints a local turn id');
  }

  /* ======================================================================
   * SECTION D — osStore interim-caption contract (positive + stray guard)
   * ==================================================================== */

  console.log('\nSECTION D: osStore interim-caption contract\n');

  {
    os.resetLiveVoice();
    os.setLiveVoice({ enabled: true, status: 'listening', activeTurnId: 'voice_turn_bridge_owned_1' });

    os.setLiveVoiceInterim('voice_turn_bridge_owned_1', 'show me the active');
    assert(getOS().liveVoice.interimText === 'show me the active', 'D1: interim for the ACTIVE caller-owned turnId is accepted (captions live)');

    os.setLiveVoiceInterim('voice_turn_stray_999', 'ignored stray');
    assert(getOS().liveVoice.interimText === 'show me the active', 'D2: stray interims for other turns are still dropped');
  }

  /* ======================================================================
   * SECTION B — live server INTERRUPT wiring (deterministic executor).
   * Runs LAST: it owns the WS teardown + the summary report (Task 6 pattern:
   * report + exit BEFORE awaiting the WS close handshake).
   * ==================================================================== */

  console.log('\nSECTION B: live server INTERRUPT cancellation wiring\n');

  const sessionManager = LiveSessionManager.getInstance();
  const ticketStore = LiveTicketStore.getInstance();

  let mockProvider = new MockSTTProvider();
  const executorCalls: Array<{ turnId?: string; signal?: AbortSignal }> = [];
  let resolveCurrentExecution: ((r: SophiaTurnResult) => void) | null = null;

  const slowExecutor: SophiaTurnExecutorFn = (opts) => {
    executorCalls.push({ turnId: opts.turnId, signal: opts.signal });
    return new Promise<SophiaTurnResult>((resolve) => {
      resolveCurrentExecution = resolve;
    });
  };

  // The resolver is assigned inside the executor closure; TypeScript's
  // control-flow analysis cannot track it, so it narrows the binding to
  // `null` at the call sites — hence the explicit widening cast here.
  function resolveExecution(r: SophiaTurnResult): void {
    (resolveCurrentExecution as ((res: SophiaTurnResult) => void) | null)?.(r);
  }

  const server = new LiveInteractionServer({
    port: 0,
    sessionManager,
    sttProviderFactory: () => {
      mockProvider = new MockSTTProvider();
      return mockProvider;
    },
    turnExecutor: slowExecutor,
  });
  const serverPort = await server.listen(0);
  const wsUrl = `ws://localhost:${serverPort}`;

  const convIdB = 'conv_p3_interrupt_wiring';
  await convStore.createConversation({
    id: convIdB,
    founderId: testFounder.userId,
    agentId: 'sophia',
    title: 'P3 interrupt wiring test',
  });

  const ticket = ticketStore.issueTicket(testFounder, convIdB);
  const rawWs = new WebSocket(`${wsUrl}?ticket=${ticket}`);
  const testClient = new BufferedSocket(rawWs);
  await new Promise<void>((r) => rawWs.on('open', r));
  await testClient.waitFor((m) => m.type === 'SESSION_READY');

  try {
    // B1: INTERRUPT during THINKING aborts the in-flight execution and
    // delivers no SOPHIA_RESPONSE for the cancelled turn.
    testClient.send({ type: 'START_PTT', turnId: 'p3_wire_turn_1' });
    await testClient.waitFor((m) => m.type === 'PTT_ACK' && (m as any).state === 'STARTED');
    await waitForCondition(() => mockProvider.options !== null, 4000, 'STT session started');

    mockProvider.simulateEvent({
      kind: 'final_transcript',
      turnId: 'p3_wire_turn_1',
      text: 'run the monthly revenue report',
      isFinal: true,
      timestamp: Date.now(),
    });

    await testClient.waitFor((m) => m.type === 'TRANSCRIPT_FINAL' && (m as any).turnId === 'p3_wire_turn_1');
    await waitForCondition(() => executorCalls.length === 1, 4000, 'turn executor invoked');

    testClient.send({ type: 'INTERRUPT', turnId: 'p3_wire_turn_1' });

    const interruptAck = await testClient.waitFor((m) => m.type === 'INTERRUPTED_ACK');
    assert((interruptAck as any).turnId === 'p3_wire_turn_1', 'B1: INTERRUPTED_ACK carries the interrupted turnId');
    await testClient.waitFor((m) => m.type === 'STATE_CHANGE' && (m as any).state === 'INTERRUPTED');

    assert(executorCalls[0].signal !== undefined, 'B1: executor received an AbortSignal');
    assert(executorCalls[0].signal?.aborted === true, 'B1: INTERRUPT aborted the in-flight execution signal');

    // Resolve the (aborted) execution the way the canonical executor would.
    resolveExecution({
      success: false,
      cancelled: true,
      reply: '',
      conversationId: convIdB,
      intent: 'conversation',
      directiveExecuted: false,
      liveAi: false,
      error: 'Turn cancelled before completion',
    });

    const settleIdle = await testClient.waitFor((m) => m.type === 'STATE_CHANGE' && (m as any).state === 'IDLE');
    assert(String((settleIdle as any).reason).includes('cancelled'), 'B1: settle reason records the cancellation');
    await sleep(250);
    assert(
      !testClient.messages.some((m) => m.type === 'SOPHIA_RESPONSE'),
      'B1: NO SOPHIA_RESPONSE delivered for the cancelled turn'
    );

    // B2: a racing LATE final for the interrupted turnId is dropped.
    mockProvider.simulateEvent({
      kind: 'final_transcript',
      turnId: 'p3_wire_turn_1',
      text: 'run the monthly revenue report',
      isFinal: true,
      timestamp: Date.now(),
    });
    await sleep(250);
    assert(executorCalls.length === 1, 'B2: late final for the interrupted turn never reaches execution');
    assert(
      !testClient.messages.some((m) => m.type === 'SOPHIA_RESPONSE'),
      'B2: late final produces no response'
    );

    // B3: a normal (non-interrupted) turn still delivers SOPHIA_RESPONSE.
    testClient.send({ type: 'START_PTT', turnId: 'p3_wire_turn_2' });
    await testClient.waitFor((m) => m.type === 'PTT_ACK' && (m as any).state === 'STARTED');
    await waitForCondition(() => mockProvider.options?.turnId === 'p3_wire_turn_2', 4000, 'second STT session');

    mockProvider.simulateEvent({
      kind: 'final_transcript',
      turnId: 'p3_wire_turn_2',
      text: 'summarize the company pulse',
      isFinal: true,
      timestamp: Date.now(),
    });
    await waitForCondition(() => executorCalls.length === 2, 4000, 'second turn executed');

    resolveExecution({
      success: true,
      reply: 'Here is the company pulse summary.',
      conversationId: convIdB,
      intent: 'conversation',
      directiveExecuted: false,
      liveAi: true,
    });

    const response = await testClient.waitFor((m) => m.type === 'SOPHIA_RESPONSE');
    assert((response as any).turnId === 'p3_wire_turn_2', 'B3: SOPHIA_RESPONSE bound to the executing turnId');
    assert((response as any).reply === 'Here is the company pulse summary.', 'B3: SOPHIA_RESPONSE carries the reply');
    await testClient.waitFor((m) => m.type === 'STATE_CHANGE' && (m as any).state === 'IDLE');

    // B4: INTERRUPT with no in-flight turn is harmless (ack + state only).
    testClient.send({ type: 'INTERRUPT', turnId: 'p3_wire_none' });
    await testClient.waitFor((m) => m.type === 'INTERRUPTED_ACK');
    await sleep(150);
    assert(executorCalls.length === 2, 'B4: no spurious executor invocation');
  } finally {
    // Task-6 harness pattern: report the summary BEFORE the teardown await —
    // the WS close handshake can starve the drain and silently skip the
    // summary in this environment. process.exit carries the true code.
    console.log('\n==================================================');
    console.log(`SOFIAUI VOICE RUNTIME (PHASE 3) SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================\n');

    const exitCode = failed > 0 ? 1 : 0;
    try {
      testClient.close();
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
  console.error('Fatal error running SofiaUI voice runtime test suite:', err);
  process.exit(1);
});
