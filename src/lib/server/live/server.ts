import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { authenticateUpgrade } from './auth';
import { LiveSessionManager } from './session-manager';
import { ClientLiveMessage, LIVE_CLOSE_CODES } from './types';
import { STTProvider, CanonicalTranscriptEvent } from './stt/types';
import { DeepgramFluxProvider } from './stt/deepgram-flux-provider';
import { executeSophiaTurn, ExecuteSophiaTurnOptions, SophiaTurnResult } from '../sophia/turn-executor';
import { isValidTurnId } from './turn-id';

export type SophiaTurnExecutorFn = (opts: ExecuteSophiaTurnOptions) => Promise<SophiaTurnResult>;

export interface LiveServerOptions {
  port?: number;
  sessionManager?: LiveSessionManager;
  sttProviderFactory?: () => STTProvider;
  /**
   * Phase 3 (SofiaUI voice runtime): canonical turn-executor seam. Defaults
   * to executeSophiaTurn; injectable so cancellation wiring can be tested
   * deterministically without live providers (same pattern as
   * sttProviderFactory). The injected function MUST honor opts.signal the
   * way the canonical executor does (settle, never throw, on abort).
   */
  turnExecutor?: SophiaTurnExecutorFn;
}

export class LiveInteractionServer {
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private sessionManager: LiveSessionManager;
  private port: number;
  private heartbeatInterval?: NodeJS.Timeout;
  private isClosing = false;

  // Phase 4C-B STT streaming session management
  private sttProviderFactory: () => STTProvider;
  private activeSttSessions: Map<WebSocket, { provider: STTProvider; turnId: string }> = new Map();
  // Phase 4 (governance review): completed/interrupted-turn suppression.
  // Keys are `${founderId}:${turnId}` — scoped per founder so a client-
  // controlled turnId from one authenticated socket can never pre-mark
  // (poison) another founder's turn into silent suppression, which the
  // pre-Phase-4 global keyspace allowed (verified defect; fixed here).
  private processedTurnIds: Map<string, number> = new Map();

  // Phase 3 (SofiaUI voice runtime): in-flight canonical turn executions per
  // socket, keyed by the socket that owns them. INTERRUPT aborts the active
  // execution's controller so executeSophiaTurn settles at its next stage
  // boundary instead of running to completion.
  private turnExecutor: SophiaTurnExecutorFn;
  private activeTurnExecutions: Map<WebSocket, { turnId: string; controller: AbortController }> = new Map();

  constructor(options: LiveServerOptions = {}) {
    this.port = options.port || parseInt(process.env.LIVE_WS_PORT || '3001', 10);
    this.sessionManager = options.sessionManager || LiveSessionManager.getInstance();
    this.sttProviderFactory = options.sttProviderFactory || (() => new DeepgramFluxProvider());
    this.turnExecutor = options.turnExecutor || executeSophiaTurn;

    this.httpServer = http.createServer((req, res) => {
      // Basic HTTP health check endpoint on companion server
      if (req.url === '/health' || req.url === '/api/live/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          service: 'live-interaction-gateway',
          activeClients: this.sessionManager.getActiveClientCount(),
          timestamp: Date.now(),
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });

    this.wss = new WebSocketServer({ noServer: true });

    this.setupUpgradeHandler();
    this.setupHeartbeat();
  }

  private setupUpgradeHandler(): void {
    this.httpServer.on('upgrade', async (req, socket, head) => {
      try {
        const auth = await authenticateUpgrade(req);

        if (!auth) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }

        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.handleConnection(ws, auth.founder.userId, auth.conversationId);
        });
      } catch (err) {
        console.error('[LiveServer] Upgrade error:', err);
        socket.write('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n');
        socket.destroy();
      }
    });
  }

  private handleConnection(ws: WebSocket, founderId: string, conversationId?: string): void {
    const client = this.sessionManager.registerConnection(ws, founderId, conversationId);

    // Initial session ready dispatch
    this.sessionManager.send(ws, {
      type: 'SESSION_READY',
      sessionId: client.session.id,
      founderId,
      conversationId: client.session.conversationId,
    });

    ws.on('message', (data, isBinary) => {
      // Non-binary JSON control frames
      if (!isBinary) {
        try {
          const raw = data.toString('utf-8');
          const message = JSON.parse(raw) as ClientLiveMessage;
          this.handleClientMessage(ws, message);
        } catch (err) {
          this.sessionManager.send(ws, {
            type: 'ERROR',
            code: 'INVALID_FRAME',
            message: 'Failed to parse JSON control frame',
          });
        }
      } else {
        // Binary frames (Phase 4B audio frame transport)
        this.handleBinaryAudioFrame(ws, data);
      }
    });

    ws.on('close', (code, reason) => {
      this.closeSttSession(ws);
      this.sessionManager.unregisterConnection(ws);
    });

    ws.on('error', (err) => {
      console.error('[LiveServer] Socket error:', err);
      this.closeSttSession(ws);
      this.sessionManager.unregisterConnection(ws);
    });
  }

  private handleClientMessage(ws: WebSocket, msg: ClientLiveMessage): void {
    const client = this.sessionManager.getClient(ws);
    if (!client) return;

    client.session.lastActiveAt = Date.now();

    switch (msg.type) {
      case 'INIT_SESSION': {
        if (msg.conversationId) {
          client.session.conversationId = msg.conversationId;
        }
        this.sessionManager.send(ws, {
          type: 'SESSION_READY',
          sessionId: client.session.id,
          founderId: client.session.founderId,
          conversationId: client.session.conversationId,
        });
        break;
      }

      case 'RESUME_SESSION': {
        // Disarm any stale in-flight STT session from previous drop
        this.closeSttSession(ws);

        const { session, resumed } = this.sessionManager.resumeSession(
          ws,
          msg.sessionId,
          client.session.founderId,
          msg.conversationId
        );
        this.sessionManager.send(ws, {
          type: 'SESSION_RESUMED',
          sessionId: session.id,
          founderId: session.founderId,
          conversationId: session.conversationId,
          resumed,
        });
        break;
      }

      case 'PING': {
        this.sessionManager.send(ws, {
          type: 'PONG',
          timestamp: Date.now(),
        });
        break;
      }

      case 'START_PTT': {
        // Phase 4 (governance review): turnIds are trust-boundary inputs —
        // they become durable idempotency keys and suppression-map entries.
        // Reject anything outside the validated space before it touches
        // session state or persistence.
        if (!isValidTurnId(msg.turnId)) {
          this.sessionManager.send(ws, {
            type: 'ERROR',
            code: 'INVALID_TURN_ID',
            message: 'START_PTT requires a turnId of 1-128 characters [A-Za-z0-9_-]',
          });
          return;
        }
        client.session.activeTurnId = msg.turnId;
        this.sessionManager.setSessionState(ws, 'LISTENING', 'PTT press detected');
        this.sessionManager.send(ws, {
          type: 'PTT_ACK',
          turnId: msg.turnId,
          state: 'STARTED',
          timestamp: Date.now(),
        });

        // Initialize streaming STT session for this turn
        void this.startSttSession(ws, client, msg.turnId);
        break;
      }

      case 'STOP_PTT': {
        this.sessionManager.setSessionState(ws, 'THINKING', 'PTT release detected');
        this.sessionManager.send(ws, {
          type: 'PTT_ACK',
          turnId: msg.turnId,
          state: 'STOPPED',
          timestamp: Date.now(),
        });

        const activeStt = this.activeSttSessions.get(ws);
        if (activeStt && activeStt.turnId === msg.turnId) {
          void activeStt.provider.endTurn();
        }
        break;
      }

      case 'SET_STATE': {
        this.sessionManager.setSessionState(ws, msg.state, 'Client explicit state transition');
        break;
      }

      case 'INTERRUPT': {
        // Phase 4 (governance review): a malformed turnId must be rejected
        // before it can touch the suppression map or the abort registry — a
        // malformed id never identifies a legitimate in-flight turn.
        if (msg.turnId !== undefined && !isValidTurnId(msg.turnId)) {
          this.sessionManager.send(ws, {
            type: 'ERROR',
            code: 'INVALID_TURN_ID',
            message: 'INTERRUPT turnId must be 1-128 characters [A-Za-z0-9_-], or absent',
          });
          return;
        }
        // Phase 3 (SofiaUI voice runtime): explicit turn cancellation.
        //   1. Abort the in-flight canonical turn execution for this socket —
        //      executeSophiaTurn settles at its next stage boundary with
        //      cancelled: true (no reply is delivered).
        //   2. Mark the interrupted turnId as processed so a racing late STT
        //      final (Deepgram ForceEndTurn fires after close) can never
        //      execute the interrupted turn — the pre-Phase-3 late-final
        //      race is closed by the existing idempotency guard.
        //   3. Clear the session's activeTurnId — the turn is over.
        const activeExecution = this.activeTurnExecutions.get(ws);
        if (activeExecution) {
          activeExecution.controller.abort();
        }
        const interruptedTurnId = msg.turnId || client.session.activeTurnId;
        if (interruptedTurnId) {
          // Phase 4: founder-scoped key (see processedTurnIds declaration).
          this.processedTurnIds.set(
            this.turnDedupeKey(client.session.founderId, interruptedTurnId),
            Date.now()
          );
          this.cleanupOldTurnIds();
        }
        client.session.activeTurnId = undefined;

        this.sessionManager.setSessionState(ws, 'INTERRUPTED', 'Client barge-in signal');
        this.sessionManager.send(ws, {
          type: 'INTERRUPTED_ACK',
          turnId: msg.turnId ?? interruptedTurnId,
          timestamp: Date.now(),
        });

        const activeStt = this.activeSttSessions.get(ws);
        if (activeStt) {
          activeStt.provider.interrupt();
          this.closeSttSession(ws);
        }
        break;
      }

      case 'CLOSE_SESSION': {
        this.closeSttSession(ws);
        ws.close(LIVE_CLOSE_CODES.NORMAL_CLOSURE, 'Client initiated session close');
        break;
      }

      default: {
        this.sessionManager.send(ws, {
          type: 'ERROR',
          code: 'UNKNOWN_COMMAND',
          message: `Unrecognized command type: ${(msg as any).type}`,
        });
        break;
      }
    }
  }

  /**
   * Validates incoming binary PCM audio frames.
   * Enforces frame size boundaries, active PTT (LISTENING) state, telemetry,
   * and forwards audio payload to active streaming STT provider.
   */
  private handleBinaryAudioFrame(ws: WebSocket, data: any): void {
    const client = this.sessionManager.getClient(ws);
    if (!client) return;

    client.session.lastActiveAt = Date.now();

    const byteLength = data instanceof Buffer ? data.length : (data.byteLength || 0);

    // 1. Frame size bounds validation: minimum 2 bytes (one 16-bit sample), maximum 32 KB
    const MAX_AUDIO_FRAME_BYTES = 32_768;
    const MIN_AUDIO_FRAME_BYTES = 2;

    if (byteLength < MIN_AUDIO_FRAME_BYTES || byteLength > MAX_AUDIO_FRAME_BYTES) {
      client.session.droppedAudioFrames = (client.session.droppedAudioFrames || 0) + 1;
      this.sessionManager.send(ws, {
        type: 'ERROR',
        code: 'INVALID_AUDIO_FRAME_SIZE',
        message: `Audio frame of size ${byteLength} bytes is outside allowed bounds [2, ${MAX_AUDIO_FRAME_BYTES}]`,
      });
      return;
    }

    // 2. State validation: only accept audio frames when in LISTENING (active PTT) state
    if (client.session.state !== 'LISTENING') {
      // Safely drop audio frames received when not in LISTENING state (e.g. late frames after STOP_PTT or during IDLE)
      client.session.droppedAudioFrames = (client.session.droppedAudioFrames || 0) + 1;
      return;
    }

    // 3. Telemetry tracking
    client.session.audioFramesReceived = (client.session.audioFramesReceived || 0) + 1;
    client.session.audioBytesReceived = (client.session.audioBytesReceived || 0) + byteLength;
    client.session.lastAudioFrameAt = Date.now();

    // 4. Phase 4C-B: Forward PCM audio to active STT provider session
    const activeStt = this.activeSttSessions.get(ws);
    if (activeStt) {
      const buffer = data instanceof Buffer ? data : Buffer.from(data);
      activeStt.provider.sendAudio(buffer);
    }
  }

  private async startSttSession(ws: WebSocket, client: any, turnId: string): Promise<void> {
    this.closeSttSession(ws);

    try {
      const provider = this.sttProviderFactory();
      this.activeSttSessions.set(ws, { provider, turnId });

      provider.onEvent(async (event) => {
        if (event.kind === 'interim_transcript') {
          this.sessionManager.send(ws, {
            type: 'TRANSCRIPT_INTERIM',
            turnId: event.turnId,
            text: event.text,
            isFinal: false,
            timestamp: event.timestamp,
          });
        } else if (event.kind === 'final_transcript') {
          await this.handleFinalTranscript(ws, client, event);
        } else if (event.kind === 'error') {
          this.sessionManager.send(ws, {
            type: 'ERROR',
            code: event.error?.code || 'STT_ERROR',
            message: event.error?.message || 'STT recognition error',
            fatal: event.error?.fatal,
          });
        }
      });

      await provider.startStream({
        sessionId: client.session.id,
        founderId: client.session.founderId,
        conversationId: client.session.conversationId,
        turnId,
        sampleRate: 16000,
      });
    } catch (err: any) {
      console.error('[LiveInteractionServer] Failed to start STT stream:', err.message);
      // Phase 4 (governance review): a stream that cannot start is FATAL for
      // this turn's capture path — the client runtime routes fatal errors to
      // explicit capture teardown and the permission-modal recovery loop.
      // (Previously re-sent as fatal:false, which left a permanently broken
      // STT provider reporting as recoverable, plus a zombie session entry.)
      this.closeSttSession(ws);
      this.sessionManager.send(ws, {
        type: 'ERROR',
        code: err?.code || 'STT_INIT_FAILED',
        message: err.message || 'Failed to initialize speech recognition stream',
        fatal: true,
      });
    }
  }

  private async handleFinalTranscript(
    ws: WebSocket,
    client: any,
    event: CanonicalTranscriptEvent
  ): Promise<void> {
    const { turnId, text } = event;
    // Phase 4: founder-scoped suppression key (see processedTurnIds
    // declaration) — the same founder marks and looks up by construction.
    const dedupeKey = this.turnDedupeKey(client.session.founderId, turnId);

    // Idempotency: Prevent duplicate final processing for the same turn
    if (this.processedTurnIds.has(dedupeKey)) {
      return;
    }

    // Phase 3: late-final race guard. A session in INTERRUPTED state never
    // enters canonical execution — an INTERRUPT that landed between the
    // STT final's emission and this handler (or that closed the STT session
    // out from under a racing ForceEndTurn) must not execute the interrupted
    // turn. The turnId-level guard is the processedTurnIds marking done by
    // the INTERRUPT handler; this state-level guard is the second belt.
    if (client.session.state === 'INTERRUPTED') {
      this.processedTurnIds.set(dedupeKey, Date.now());
      return;
    }

    this.processedTurnIds.set(dedupeKey, Date.now());
    this.cleanupOldTurnIds();

    // 1. Send final transcript event to client
    this.sessionManager.send(ws, {
      type: 'TRANSCRIPT_FINAL',
      turnId,
      text,
      isFinal: true,
      conversationId: client.session.conversationId,
      timestamp: event.timestamp,
    });

    // 2. If transcript text is empty, reset state to IDLE and finish turn.
    //    Phase 4: conditional settle — a newer turn that already owns the
    //    session must not have its LISTENING state / STT provider stomped by
    //    this turn's cleanup (same guard as the execution finally below).
    if (!text || !text.trim()) {
      const owningTurnId = client.session.activeTurnId;
      if (owningTurnId === undefined || owningTurnId === turnId) {
        this.sessionManager.setSessionState(ws, 'IDLE', 'Empty transcript received');
        this.closeSttSession(ws);
      }
      return;
    }

    // 3. Hand off to Sophia Cognitive Ingress
    this.sessionManager.setSessionState(ws, 'THINKING', 'Final transcript sent to Sophia cognitive ingress');

    // Phase 3: register the in-flight execution so an INTERRUPT on this
    // socket can abort it. One execution per socket at a time (the client is
    // PTT-serial); the finally-guard below keeps a overlapping second turn
    // from deleting the first's entry.
    const controller = new AbortController();
    this.activeTurnExecutions.set(ws, { turnId, controller });
    let wasCancelled = false;

    try {
      const sophiaResult = await this.turnExecutor({
        message: text,
        founderId: client.session.founderId,
        conversationId: client.session.conversationId,
        turnId,
        signal: controller.signal,
      });

      if (sophiaResult.conversationId) {
        client.session.conversationId = sophiaResult.conversationId;
      }

      if (sophiaResult.cancelled) {
        // Interrupted mid-execution: the turn was cancelled at a stage
        // boundary (persisted as a cancelled marker when the founder
        // message had already landed). No SOPHIA_RESPONSE is delivered —
        // the client already holds INTERRUPTED_ACK for this barge-in.
        wasCancelled = true;
        console.log(
          `[LiveInteractionServer] Turn ${turnId} cancelled by client interrupt; no reply delivered`
        );
      } else {
        this.sessionManager.send(ws, {
          type: 'SOPHIA_RESPONSE',
          turnId,
          reply: sophiaResult.reply,
          conversationId: sophiaResult.conversationId,
          messageId: sophiaResult.assistantMessageId,
          liveAi: sophiaResult.liveAi,
          directiveExecuted: sophiaResult.directiveExecuted,
          metrics: sophiaResult.metrics,
        });
      }
    } catch (err: any) {
      console.error('[LiveInteractionServer] Error in Sophia turn execution:', err);
      this.sessionManager.send(ws, {
        type: 'ERROR',
        code: 'SOPHIA_EXECUTION_ERROR',
        message: err.message || 'Sophia cognitive turn execution failed',
      });
    } finally {
      const activeExecution = this.activeTurnExecutions.get(ws);
      if (activeExecution && activeExecution.turnId === turnId) {
        this.activeTurnExecutions.delete(ws);
      }
      // Phase 4 (governance review): a newer turn may already own the session
      // (INTERRUPT -> immediate START_PTT while this execution was still
      // settling). Settling unconditionally would force IDLE over the newer
      // turn's LISTENING and close its STT provider, silently dead-ending
      // it. Only settle when this turn still owns the session (activeTurnId
      // was cleared by INTERRUPT, or still points at this turn's id).
      const owningTurnId = client.session.activeTurnId;
      if (owningTurnId === undefined || owningTurnId === turnId) {
        this.sessionManager.setSessionState(
          ws,
          'IDLE',
          wasCancelled ? 'Cognitive turn cancelled by client interrupt' : 'Cognitive turn completed'
        );
        this.closeSttSession(ws);
      }
    }
  }

  private closeSttSession(ws: WebSocket): void {
    const activeStt = this.activeSttSessions.get(ws);
    if (activeStt) {
      void activeStt.provider.close();
      this.activeSttSessions.delete(ws);
    }
  }

  /** Phase 4 (governance review): per-founder suppression key — the map is
   * scoped so a client-controlled turnId from one founder can never suppress
   * another founder's turn. */
  private turnDedupeKey(founderId: string, turnId: string): string {
    return `${founderId}:${turnId}`;
  }

  private cleanupOldTurnIds(): void {
    if (this.processedTurnIds.size > 500) {
      const cutoff = Date.now() - 300_000; // 5 minutes
      for (const [id, time] of this.processedTurnIds.entries()) {
        if (time < cutoff) {
          this.processedTurnIds.delete(id);
        }
      }
    }
  }

  private setupHeartbeat(): void {
    if (typeof setInterval !== 'undefined') {
      this.heartbeatInterval = setInterval(() => {
        if (this.isClosing) return;
        for (const ws of this.wss.clients) {
          const client = this.sessionManager.getClient(ws);
          if (!client) continue;

          if (!client.isAlive) {
            ws.terminate();
            this.sessionManager.unregisterConnection(ws);
            continue;
          }

          client.isAlive = false;
          ws.ping();
        }
      }, 30_000);

      if (this.heartbeatInterval.unref) {
        this.heartbeatInterval.unref();
      }
    }

    this.wss.on('connection', (ws) => {
      ws.on('pong', () => {
        const client = this.sessionManager.getClient(ws);
        if (client) {
          client.isAlive = true;
          client.session.lastActiveAt = Date.now();
        }
      });
    });
  }

  /**
   * Starts listening on the configured or specified port.
   */
  public listen(port?: number): Promise<number> {
    const listenPort = port !== undefined ? port : this.port;
    return new Promise((resolve, reject) => {
      this.httpServer.listen(listenPort, () => {
        const addr = this.httpServer.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : listenPort;
        this.port = actualPort;
        resolve(actualPort);
      });
      this.httpServer.once('error', reject);
    });
  }

  /**
   * Stops the server and cleans up connections.
   */
  public close(): Promise<void> {
    this.isClosing = true;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    for (const [ws, activeStt] of this.activeSttSessions.entries()) {
      void activeStt.provider.close();
      // Phase 3: settling in-flight turn executions on shutdown — the
      // executors observe the abort at their next stage boundary.
      const execution = this.activeTurnExecutions.get(ws);
      if (execution) {
        execution.controller.abort();
      }
    }
    this.activeSttSessions.clear();
    this.activeTurnExecutions.clear();

    return new Promise((resolve) => {
      for (const client of this.wss.clients) {
        try {
          client.close(LIVE_CLOSE_CODES.GOING_AWAY, 'Server shutting down');
        } catch {
          /* noop */
        }
      }

      this.wss.close(() => {
        this.httpServer.close(() => {
          resolve();
        });
      });
    });
  }

  public getPort(): number {
    return this.port;
  }
}
