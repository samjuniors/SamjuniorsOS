import { WebSocket } from 'ws';
import crypto from 'crypto';
import { LiveModalityState, LiveSessionRecord, LIVE_CLOSE_CODES, ServerLiveMessage } from './types';

export interface ConnectedClient {
  socket: WebSocket;
  session: LiveSessionRecord;
  pingTimer?: NodeJS.Timeout;
  isAlive: boolean;
}

export class LiveSessionManager {
  private static instance: LiveSessionManager;

  // Active connected clients keyed by socket
  private clientSockets: Map<WebSocket, ConnectedClient> = new Map();

  // Founder connection registry for single-tenant connection enforcement
  private founderActiveSockets: Map<string, WebSocket> = new Map();

  // Persistent in-memory session records (for 60s reconnects)
  private sessionRecords: Map<string, LiveSessionRecord> = new Map();

  private readonly sessionKeepaliveMs = 60_000; // 60 seconds

  private constructor() {
    // Periodic sweeper for expired detached sessions
    if (typeof setInterval !== 'undefined') {
      const timer = setInterval(() => this.cleanupExpiredSessions(), 30_000);
      if (timer.unref) timer.unref();
    }
  }

  public static getInstance(): LiveSessionManager {
    if (!LiveSessionManager.instance) {
      LiveSessionManager.instance = new LiveSessionManager();
    }
    return LiveSessionManager.instance;
  }

  /**
   * Registers a newly authenticated socket connection, enforcing the single-connection rule.
   */
  public registerConnection(
    socket: WebSocket,
    founderId: string,
    initialConversationId?: string
  ): ConnectedClient {
    // 1. Enforce single active connection per founder: close older socket if open
    const existingSocket = this.founderActiveSockets.get(founderId);
    if (existingSocket && existingSocket !== socket && existingSocket.readyState === WebSocket.OPEN) {
      try {
        existingSocket.close(LIVE_CLOSE_CODES.SESSION_SUPERSEDED, 'Session superseded by new connection');
      } catch {
        /* noop */
      }
      this.unregisterConnection(existingSocket);
    }

    // 2. Provision initial session record
    const sessionId = `live_sess_${crypto.randomBytes(16).toString('hex')}`;
    const now = Date.now();
    const session: LiveSessionRecord = {
      id: sessionId,
      founderId,
      conversationId: initialConversationId,
      state: 'IDLE',
      createdAt: now,
      lastActiveAt: now,
      connectedAt: now,
      isAlive: true,
    };

    this.sessionRecords.set(sessionId, session);

    const client: ConnectedClient = {
      socket,
      session,
      isAlive: true,
    };

    this.clientSockets.set(socket, client);
    this.founderActiveSockets.set(founderId, socket);

    return client;
  }

  /**
   * Retrieves the connected client for a given WebSocket.
   */
  public getClient(socket: WebSocket): ConnectedClient | undefined {
    return this.clientSockets.get(socket);
  }

  /**
   * Reattaches an existing session if within the 60-second resume window.
   */
  public resumeSession(
    socket: WebSocket,
    requestedSessionId: string,
    founderId: string,
    conversationId?: string
  ): { session: LiveSessionRecord; resumed: boolean } {
    const client = this.clientSockets.get(socket);
    if (!client) {
      throw new Error('Socket not registered in session manager');
    }

    const existingRecord = this.sessionRecords.get(requestedSessionId);
    const now = Date.now();

    // Check validity of existing session: must match founder and be within keepalive window
    if (
      existingRecord &&
      existingRecord.founderId === founderId &&
      now - existingRecord.lastActiveAt <= this.sessionKeepaliveMs
    ) {
      existingRecord.lastActiveAt = now;
      existingRecord.isAlive = true;
      if (conversationId) {
        existingRecord.conversationId = conversationId;
      }

      client.session = existingRecord;
      return { session: existingRecord, resumed: true };
    }

    // Expired or missing: re-initialize a fresh session
    const newSessionId = `live_sess_${crypto.randomBytes(16).toString('hex')}`;
    const freshSession: LiveSessionRecord = {
      id: newSessionId,
      founderId,
      conversationId,
      state: 'IDLE',
      createdAt: now,
      lastActiveAt: now,
      connectedAt: now,
      isAlive: true,
    };

    this.sessionRecords.set(newSessionId, freshSession);
    client.session = freshSession;
    return { session: freshSession, resumed: false };
  }

  /**
   * Updates the state of an active session.
   */
  public setSessionState(
    socket: WebSocket,
    newState: LiveModalityState,
    reason?: string
  ): LiveSessionRecord {
    const client = this.clientSockets.get(socket);
    if (!client) {
      throw new Error('Socket not registered');
    }

    const prev = client.session.state;
    if (prev === newState) {
      return client.session;
    }

    client.session.state = newState;
    client.session.lastActiveAt = Date.now();

    // Notify client of state change
    this.send(socket, {
      type: 'STATE_CHANGE',
      state: newState,
      previousState: prev,
      reason,
    });

    return client.session;
  }

  /**
   * Sends a typed message to a connected socket.
   */
  public send(socket: WebSocket, message: ServerLiveMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
      } catch (err) {
        console.error('[LiveSessionManager] Send failed:', err);
      }
    }
  }

  /**
   * Unregisters a disconnecting socket, keeping the session record alive for the 60s resume window.
   */
  public unregisterConnection(socket: WebSocket): void {
    const client = this.clientSockets.get(socket);
    if (client) {
      if (client.pingTimer) {
        clearInterval(client.pingTimer);
      }
      client.session.isAlive = false;
      client.session.lastActiveAt = Date.now();

      // Only delete founder socket mapping if it points to this socket
      if (this.founderActiveSockets.get(client.session.founderId) === socket) {
        this.founderActiveSockets.delete(client.session.founderId);
      }

      this.clientSockets.delete(socket);
    }
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessionRecords.entries()) {
      if (!session.isAlive && now - session.lastActiveAt > this.sessionKeepaliveMs) {
        this.sessionRecords.delete(id);
      }
    }
  }

  public getActiveClientCount(): number {
    return this.clientSockets.size;
  }

  public getStoredSessionCount(): number {
    return this.sessionRecords.size;
  }

  public clearAll(): void {
    for (const socket of this.clientSockets.keys()) {
      try {
        socket.close();
      } catch {
        /* noop */
      }
    }
    this.clientSockets.clear();
    this.founderActiveSockets.clear();
    this.sessionRecords.clear();
  }
}
