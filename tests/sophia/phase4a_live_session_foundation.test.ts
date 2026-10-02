/**
 * ============================================================================
 * PHASE 4A: SOPHIA LIVE INTERACTION — SESSION FOUNDATION TESTS
 * ============================================================================
 * Verifies the authenticated companion WebSocket server, session lifecycle,
 * single-tenant founder connection enforcement, PTT state transitions,
 * interruption frames, heartbeat, and reconnection resumption.
 * 
 * ZERO audio processing, STT, or TTS is tested here; tests focus exclusively
 * on the foundational session transport layer.
 */

import { WebSocket } from 'ws';
import http from 'http';
import { LiveInteractionServer } from '../../src/lib/server/live/server';
import { LiveSessionManager } from '../../src/lib/server/live/session-manager';
import { LiveTicketStore } from '../../src/lib/server/live/ticket-store';
import { LIVE_CLOSE_CODES, ServerLiveMessage } from '../../src/lib/server/live/types';

/**
 * Buffered test wrapper over WebSocket to ensure messages arriving in the
 * same network frame or tick are never lost between asynchronous awaits.
 */
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
    // Check if matching message is already in buffer
    const matchIndex = this.messages.findIndex(predicate);
    if (matchIndex !== -1) {
      const matched = this.messages.splice(matchIndex, 1)[0];
      return Promise.resolve(matched as T);
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for message matching predicate after ${timeoutMs}ms. Buffered: ${JSON.stringify(this.messages)}`));
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

function waitForClose(ws: WebSocket, timeoutMs = 4000): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for WebSocket close after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

async function runTests() {
  console.log('--- STARTING PHASE 4A: LIVE SESSION FOUNDATION SUITE ---\n');
  let passed = 0;
  let failed = 0;

  const sessionManager = LiveSessionManager.getInstance();
  const ticketStore = LiveTicketStore.getInstance();

  // Spin up test server on an ephemeral port (port 0)
  const server = new LiveInteractionServer({ port: 0, sessionManager });
  const port = await server.listen(0);
  const wsBaseUrl = `ws://localhost:${port}`;
  const httpBaseUrl = `http://localhost:${port}`;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      failed++;
    }
  }

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Health Check Endpoint on Companion Server
    // ------------------------------------------------------------------------
    console.log('TEST 1: Health check endpoint on companion server');
    const healthRes = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      http.get(`${httpBaseUrl}/health`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
        });
      }).on('error', reject);
    });

    assert(healthRes.status === 200, 'Health endpoint returns HTTP 200');
    assert(healthRes.body.status === 'ok', 'Health status is ok');
    assert(healthRes.body.service === 'live-interaction-gateway', 'Correct service identifier');

    // ------------------------------------------------------------------------
    // TEST 2: Unauthenticated Connection Rejection
    // ------------------------------------------------------------------------
    console.log('\nTEST 2: Unauthenticated connection rejection (fails closed with 401)');
    const unauthRejected = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(wsBaseUrl, {
        headers: { 'x-samjuniors-role': 'AUDITOR' },
      });
      ws.on('open', () => {
        ws.close();
        resolve(false);
      });
      ws.on('unexpected-response', (_req, res) => {
        resolve(res.statusCode === 401);
      });
      ws.on('error', () => resolve(true));
    });

    assert(unauthRejected, 'Unauthenticated / non-founder connection rejected with 401');

    // ------------------------------------------------------------------------
    // TEST 3: Ticket-based Authentication & Single-Use Consumption
    // ------------------------------------------------------------------------
    console.log('\nTEST 3: Ticket-based authentication and single-use consumption');
    const founderSession = {
      userId: 'founder-test-1',
      email: 'founder@samjuniors.com',
      name: 'Executive Founder',
      role: 'FOUNDER' as const,
      isVerified: true,
    };

    const ticket = ticketStore.issueTicket(founderSession, 'conv_initial_123');
    assert(ticket.startsWith('ws_live_'), 'Ticket generated with correct prefix');

    const rawTicketWs = new WebSocket(`${wsBaseUrl}?ticket=${ticket}`);
    const ticketSocket = new BufferedSocket(rawTicketWs);
    const readyMsg = await ticketSocket.waitFor<any>((m) => m.type === 'SESSION_READY');

    assert(readyMsg.type === 'SESSION_READY', 'Received SESSION_READY over ticket-authenticated socket');
    assert(readyMsg.founderId === 'founder-test-1', 'Session bound to correct founderId');
    assert(readyMsg.conversationId === 'conv_initial_123', 'Session attached to initial conversationId');

    // Attempt second connection with same consumed ticket
    const secondTicketAttempt = await new Promise<boolean>((resolve) => {
      const ws2 = new WebSocket(`${wsBaseUrl}?ticket=${ticket}`);
      ws2.on('open', () => {
        ws2.close();
        resolve(false);
      });
      ws2.on('unexpected-response', (_req, res) => {
        resolve(res.statusCode === 401);
      });
      ws2.on('error', () => resolve(true));
    });

    assert(secondTicketAttempt, 'Consumed ticket cannot be reused (fails with 401)');
    ticketSocket.close();

    // ------------------------------------------------------------------------
    // TEST 4: Direct Header Authentication & Session Initialization
    // ------------------------------------------------------------------------
    console.log('\nTEST 4: Header authentication and INIT_SESSION handling');
    const rawClientA = new WebSocket(wsBaseUrl, {
      headers: {
        'x-samjuniors-user-id': 'founder-alice',
        'x-samjuniors-role': 'FOUNDER',
      },
    });
    const clientA = new BufferedSocket(rawClientA);

    const initReady = await clientA.waitFor<any>((m) => m.type === 'SESSION_READY');
    assert(initReady.founderId === 'founder-alice', 'Direct header connection resolves founder-alice');
    const sessionIdA = initReady.sessionId;

    // Send explicit INIT_SESSION with updated conversation ID
    clientA.send({
      type: 'INIT_SESSION',
      conversationId: 'conv_alice_active',
    });

    const sessionUpdated = await clientA.waitFor<any>(
      (m) => m.type === 'SESSION_READY' && m.conversationId === 'conv_alice_active'
    );
    assert(sessionUpdated.conversationId === 'conv_alice_active', 'INIT_SESSION updates active conversationId');

    // ------------------------------------------------------------------------
    // TEST 5: Push-to-Talk (PTT) State Machine Transitions
    // ------------------------------------------------------------------------
    console.log('\nTEST 5: Push-to-Talk state machine transitions (START_PTT -> LISTENING, STOP_PTT -> THINKING)');
    clientA.send({
      type: 'START_PTT',
      turnId: 'turn_ptt_001',
    });

    const pttStartAck = await clientA.waitFor<any>((m) => m.type === 'PTT_ACK' && m.state === 'STARTED');
    assert(pttStartAck.turnId === 'turn_ptt_001', 'Received PTT_ACK for START_PTT');

    const stateListening = await clientA.waitFor<any>((m) => m.type === 'STATE_CHANGE' && m.state === 'LISTENING');
    assert(stateListening.state === 'LISTENING', 'State transitioned to LISTENING on PTT press');

    clientA.send({
      type: 'STOP_PTT',
      turnId: 'turn_ptt_001',
    });

    const pttStopAck = await clientA.waitFor<any>((m) => m.type === 'PTT_ACK' && m.state === 'STOPPED');
    assert(pttStopAck.turnId === 'turn_ptt_001', 'Received PTT_ACK for STOP_PTT');

    const stateThinking = await clientA.waitFor<any>((m) => m.type === 'STATE_CHANGE' && m.state === 'THINKING');
    assert(stateThinking.state === 'THINKING', 'State transitioned to THINKING on PTT release');

    // ------------------------------------------------------------------------
    // TEST 6: Interruption / Barge-in Signaling
    // ------------------------------------------------------------------------
    console.log('\nTEST 6: Interruption / barge-in frame handling');
    clientA.send({
      type: 'SET_STATE',
      state: 'SPEAKING',
    });
    await clientA.waitFor<any>((m) => m.type === 'STATE_CHANGE' && m.state === 'SPEAKING');

    // Send INTERRUPT frame
    clientA.send({
      type: 'INTERRUPT',
      turnId: 'turn_ptt_001',
    });

    const interruptAck = await clientA.waitFor<any>((m) => m.type === 'INTERRUPTED_ACK');
    assert(interruptAck.turnId === 'turn_ptt_001', 'Server acknowledges barge-in with INTERRUPTED_ACK');

    const stateInterrupted = await clientA.waitFor<any>((m) => m.type === 'STATE_CHANGE' && m.state === 'INTERRUPTED');
    assert(stateInterrupted.state === 'INTERRUPTED', 'State transitioned to INTERRUPTED');

    // ------------------------------------------------------------------------
    // TEST 7: Single Active Connection Per Founder Enforcement (Close Code 4409)
    // ------------------------------------------------------------------------
    console.log('\nTEST 7: Single connection enforcement (superseding older socket with 4409)');
    const closePromiseA = waitForClose(clientA.ws);

    const rawClientB = new WebSocket(wsBaseUrl, {
      headers: {
        'x-samjuniors-user-id': 'founder-alice',
        'x-samjuniors-role': 'FOUNDER',
      },
    });
    const clientB = new BufferedSocket(rawClientB);

    const readyB = await clientB.waitFor<any>((m) => m.type === 'SESSION_READY');
    assert(readyB.founderId === 'founder-alice', 'New socket for founder-alice established');

    const closeResultA = await closePromiseA;
    assert(closeResultA.code === LIVE_CLOSE_CODES.SESSION_SUPERSEDED, 'Older socket closed with code 4409 (SESSION_SUPERSEDED)');
    assert(closeResultA.reason.includes('superseded'), 'Close reason indicates session supersession');

    // ------------------------------------------------------------------------
    // TEST 8: Reconnection & Session Resumption (resumed: true)
    // ------------------------------------------------------------------------
    console.log('\nTEST 8: Reconnection and session resumption within 60s window');
    const sessionIdB = readyB.sessionId;
    clientB.close();
    await waitForClose(clientB.ws);

    const rawClientC = new WebSocket(wsBaseUrl, {
      headers: {
        'x-samjuniors-user-id': 'founder-alice',
        'x-samjuniors-role': 'FOUNDER',
      },
    });
    const clientC = new BufferedSocket(rawClientC);
    await clientC.waitFor<any>((m) => m.type === 'SESSION_READY');

    clientC.send({
      type: 'RESUME_SESSION',
      sessionId: sessionIdB,
      conversationId: 'conv_alice_resumed',
    });

    const resumeMsg = await clientC.waitFor<any>((m) => m.type === 'SESSION_RESUMED');
    assert(resumeMsg.resumed === true, 'Session successfully resumed with resumed: true');
    assert(resumeMsg.sessionId === sessionIdB, 'Session ID matches resumed session');
    assert(resumeMsg.conversationId === 'conv_alice_resumed', 'Conversation ID updated on resume');

    // ------------------------------------------------------------------------
    // TEST 9: Expired or Invalid Session Resumption (resumed: false)
    // ------------------------------------------------------------------------
    console.log('\nTEST 9: Non-existent/expired session resumption falls back to clean session');
    clientC.send({
      type: 'RESUME_SESSION',
      sessionId: 'non_existent_session_9999',
    });

    const fallbackResume = await clientC.waitFor<any>((m) => m.type === 'SESSION_RESUMED');
    assert(fallbackResume.resumed === false, 'Invalid session request returns resumed: false');
    assert(fallbackResume.sessionId !== 'non_existent_session_9999', 'Fresh session ID provisioned');

    // ------------------------------------------------------------------------
    // TEST 10: Heartbeat PING / PONG
    // ------------------------------------------------------------------------
    console.log('\nTEST 10: Heartbeat PING/PONG handling');
    const pingTime = Date.now();
    clientC.send({
      type: 'PING',
      timestamp: pingTime,
    });

    const pongMsg = await clientC.waitFor<any>((m) => m.type === 'PONG');
    assert(pongMsg.type === 'PONG', 'Server responds with PONG');
    assert(pongMsg.timestamp >= pingTime, 'PONG timestamp is valid');

    // Clean up Client C
    clientC.close();
    await waitForClose(clientC.ws);

  } finally {
    await server.close();
    console.log('\nLiveInteractionServer closed cleanly.');
  }

  console.log('\n==================================================');
  console.log(`PHASE 4A TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running Phase 4A test suite:', err);
  process.exit(1);
});
