import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { authenticateUpgrade } from './auth';
import { LiveSessionManager } from './session-manager';
import { ClientLiveMessage, LIVE_CLOSE_CODES } from './types';

export interface LiveServerOptions {
  port?: number;
  sessionManager?: LiveSessionManager;
}

export class LiveInteractionServer {
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private sessionManager: LiveSessionManager;
  private port: number;
  private heartbeatInterval?: NodeJS.Timeout;
  private isClosing = false;

  constructor(options: LiveServerOptions = {}) {
    this.port = options.port || parseInt(process.env.LIVE_WS_PORT || '3001', 10);
    this.sessionManager = options.sessionManager || LiveSessionManager.getInstance();

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
      this.sessionManager.unregisterConnection(ws);
    });

    ws.on('error', (err) => {
      console.error('[LiveServer] Socket error:', err);
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
        client.session.activeTurnId = msg.turnId;
        this.sessionManager.setSessionState(ws, 'LISTENING', 'PTT press detected');
        this.sessionManager.send(ws, {
          type: 'PTT_ACK',
          turnId: msg.turnId,
          state: 'STARTED',
          timestamp: Date.now(),
        });
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
        break;
      }

      case 'SET_STATE': {
        this.sessionManager.setSessionState(ws, msg.state, 'Client explicit state transition');
        break;
      }

      case 'INTERRUPT': {
        this.sessionManager.setSessionState(ws, 'INTERRUPTED', 'Client barge-in signal');
        this.sessionManager.send(ws, {
          type: 'INTERRUPTED_ACK',
          turnId: msg.turnId,
          timestamp: Date.now(),
        });
        break;
      }

      case 'CLOSE_SESSION': {
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
   * Phase 4B: Validates incoming binary PCM audio frames.
   * Enforces frame size boundaries, active PTT (LISTENING) state, and telemetry.
   * Discards audio payload safely without persistence, LLM, or STT invocation.
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

    // 3. Telemetry tracking (audio is safely discarded after validation in Phase 4B)
    client.session.audioFramesReceived = (client.session.audioFramesReceived || 0) + 1;
    client.session.audioBytesReceived = (client.session.audioBytesReceived || 0) + byteLength;
    client.session.lastAudioFrameAt = Date.now();
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
