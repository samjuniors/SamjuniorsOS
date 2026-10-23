/**
 * src/sofia/sophia/voice/LiveGatewayVoiceProvider.ts
 *
 * Canonical Voice Transport Provider — Phase 3 Step 6C Stage 2.
 *
 * Adapts LiveInteractionServer (companion WebSocket gateway) to Sofia's
 * normalized VoiceProvider contract.
 *
 * Security & Architectural Boundaries:
 * 1. Authenticates via single-use ticket from POST /api/auth/ws-ticket.
 * 2. Connects strictly to validated ws:// or wss:// URLs.
 * 3. Streams 16 kHz PCM microphone frames to LiveInteractionServer.
 * 4. Receives streaming transcripts and canonical responses from executeSophiaTurn.
 * 5. Plays spoken replies sequentially via AudioEngine without ungoverned client DOM tools.
 * 6. Implements immediate local hardware audio flush (<5ms) and cooperative
 *    server INTERRUPT frame transmission on barge-in.
 * 7. Isolates all state; never delegates to GeminiLiveProvider or controlLayer.execute().
 */

import { AudioEngine } from '../audio/AudioEngine';
import type { SophiaEventDetail, SophiaEventType, VoiceProviderId } from '../types';
import { controlLayer } from '../control';
import { VoiceProvider } from './VoiceProvider';
import { validateGatewayHost, GatewayValidationOptions } from '../../lib/voice-config';
import { SileroVadEngine } from '../../../lib/client/live/vad';

export interface LiveGatewayOptions extends GatewayValidationOptions {
  wsUrl?: string;
  fetchFn?: typeof fetch;
  WebSocketClass?: typeof WebSocket;
  /**
   * Maximum milliseconds to wait for a WebSocket handshake (onopen) before
   * rejecting startup and emitting WEBSOCKET_HANDSHAKE_FAILED.
   * Fix 3: prevents indefinite hang when socket never emits open/error/close.
   * @default 10000
   */
  handshakeTimeoutMs?: number;
}

export class LiveGatewayVoiceProvider extends VoiceProvider {
  readonly id: VoiceProviderId = 'live-gateway';

  private wsUrl: string;
  private options: LiveGatewayOptions;
  private ws: WebSocket | null = null;
  private fetchFn: typeof fetch;
  private WebSocketClass: typeof WebSocket;

  private startPromise: Promise<void> | null = null;
  private detachPCM: (() => void) | null = null;
  private ttsAbortController: AbortController | null = null;

  private activeTurnId: string | null = null;
  private interruptedTurnIds = new Set<string>();

  private isTransmitting = false;
  private isSpeaking = false;
  private packetsSent = 0;
  private packetsReceived = 0;
  private handsFreeListening = false;
  private readonly vad = new SileroVadEngine({
    speechStartThreshold: 0.5,
    speechEndThreshold: 0.35,
    minSpeechFrames: 2,
    // AudioEngine emits 640-sample / 40ms frames; 20 frames gives an 800ms
    // hangover so ordinary phrase pauses do not prematurely end a turn.
    redemptionFrames: 20,
  });
  private readonly preRollFrames: ArrayBuffer[] = [];
  private readonly maxPreRollFrames = 4;
  private turnStartPerfMs = 0;
  private turnStopPerfMs = 0;
  private transcriptFinalPerfMs = 0;
  private sophiaResponsePerfMs = 0;
  private latencyRecords: Array<{
    turnId: string;
    turnType: 'voice' | 'text';
    turnStartMs: number;
    turnStopMs?: number;
    sttLatencyMs?: number;
    cognitionLatencyMs?: number;
    ttsLatencyMs?: number;
    endToEndFromStopMs: number;
    endToEndTotalMs: number;
    timestamp: number;
  }> = [];

  /**
   * Fix 1 & 2: Monotonically increasing generation counter.
   * Incremented on every internalStart() call and on stop().
   * Any async closure captures its generation at call time and aborts if the
   * current generation has advanced (meaning stop() was called).
   */
  private generation = 0;
  private startGeneration = 0;

  /**
   * Fix 2: Per-text-turn AbortController that is aborted in interrupt()/stop().
   * Cancels in-flight /api/sophia/chat and /api/sophia/mouth/speak requests
   * belonging to the current text turn.
   */
  private textTurnAbortController: AbortController | null = null;

  constructor(
    private audio: AudioEngine,
    wsUrl = (typeof window !== 'undefined' && window.location ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/live-ws` : 'ws://localhost:3000/api/live-ws'),
    options: LiveGatewayOptions = {}
  ) {
    super();
    this.options = options;
    this.wsUrl = this.validateWsUrl(wsUrl, options);
    this.fetchFn = options.fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
    this.WebSocketClass = options.WebSocketClass || (typeof window !== 'undefined' ? window.WebSocket : (globalThis as any).WebSocket);
  }

  /**
   * Validates that the provided WebSocket URL strictly conforms to:
   * 1. Protocol: ws:// or wss:// only.
   * 2. Host validation: host must be localhost, 127.0.0.1, [::1], current origin hostname,
   *    or in the trusted gateway host allowlist (*.samjuniors.com / *.samjuniors.local).
   * 3. No query strings or fragments.
   * 4. No embedded credentials (username/password).
   * 5. Port and path allowlisting.
   * Acceptance criterion: fails closed on untrusted hosts or malformed strings.
   */
  private validateWsUrl(url: string, options: LiveGatewayOptions = {}): string {
    const hostCheck = validateGatewayHost(url, options);
    if (!hostCheck.valid) {
      throw new Error(`LiveGatewayVoiceProvider: ${hostCheck.error}`);
    }
    return url.trim();
  }

  /** Update the authenticated status endpoint's URL before opening a session. */
  configureWsUrl(url: string): void {
    if (this.active || this.startPromise) {
      throw new Error('Cannot change the live gateway URL while a session is active');
    }
    this.wsUrl = this.validateWsUrl(url, this.options);
  }

  /**
   * Enable local speech segmentation for an explicitly started microphone
   * session. Only buffered onset plus speech-turn PCM is sent to the gateway.
   */
  enableHandsFreeListening(): void {
    this.handsFreeListening = true;
    this.vad.reset();
    this.preRollFrames.length = 0;
  }

  disableHandsFreeListening(): void {
    this.handsFreeListening = false;
    this.vad.reset();
    this.preRollFrames.length = 0;
    if (this.isTransmitting) this.stopPtt();
  }

  /**
   * Acquires single-use ticket from /api/auth/ws-ticket and connects WebSocket.
   * Concurrent invocations are idempotent and share the in-flight start Promise.
   */
  start(): Promise<void> {
    if (this.active) return Promise.resolve();
    if (this.startPromise) return this.startPromise;

    const myGeneration = ++this.generation;
    this.startGeneration = myGeneration;

    const promise = (async () => {
      try {
        await this.internalStart(myGeneration);
      } finally {
        // Identity-safe cleanup: an older unwinding startup cannot clear or overwrite
        // a newer in-flight startup's promise.
        if (this.startGeneration === myGeneration) {
          this.startPromise = null;
        }
      }
    })();

    this.startPromise = promise;
    return promise;
  }

  private async internalStart(myGeneration: number): Promise<void> {
    // 1. Re-validate URL, port, path, scheme before ticket acquisition
    this.wsUrl = this.validateWsUrl(this.wsUrl, this.options);

    // 2. Fetch single-use ticket from canonical Next.js auth endpoint
    let ticket: string;
    try {
      const ticketRes = await this.fetchFn('/api/auth/ws-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!ticketRes.ok) {
        throw new Error(`Failed to obtain live session ticket: HTTP ${ticketRes.status}`);
      }
      const ticketData = (await ticketRes.json()) as { ticket?: string };
      if (!ticketData.ticket || !ticketData.ticket.startsWith('ws_live_')) {
        throw new Error('Invalid ticket returned from /api/auth/ws-ticket');
      }
      ticket = ticketData.ticket;
    } catch (err: any) {
      // Fix 1: If stop() was called while we were fetching the ticket, do not
      // emit an error event for the cancelled startup — just abort silently.
      if (this.generation !== myGeneration) {
        return;
      }
      this.emit('error', {
        code: 'TICKET_ACQUISITION_FAILED',
        message: err?.message || 'Could not obtain voice ticket',
      });
      throw err;
    }

    // Fix 1: Check generation after async ticket acquisition. If stop() was
    // called while POST /api/auth/ws-ticket was in flight, abandon startup
    // without constructing a WebSocket.
    if (this.generation !== myGeneration) {
      return;
    }

    // 3. Connect to companion WebSocket server
    // Since wsUrl is validated to have no query string, append ticket directly
    const targetUrl = `${this.wsUrl}?ticket=${encodeURIComponent(ticket)}`;
    const handshakeTimeoutMs = this.options.handshakeTimeoutMs ?? 10000;

    await new Promise<void>((resolve, reject) => {
      let ws: WebSocket;
      let hasOpened = false;
      let settled = false;
      // Fix 3: Bounded handshake timeout handle.
      let handshakeTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanupHandshakeSocket = () => {
        if (handshakeTimer !== null) {
          clearTimeout(handshakeTimer);
          handshakeTimer = null;
        }
        if (ws) {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          if (this.ws === ws) {
            this.ws = null;
          }
        }
      };

      try {
        ws = new this.WebSocketClass(targetUrl);
        this.ws = ws;
        ws.binaryType = 'arraybuffer';

        // Fix 3: Arm the bounded handshake timeout immediately after socket
        // construction. If the socket never emits open/error/close within the
        // window, reject startup and emit WEBSOCKET_HANDSHAKE_FAILED.
        handshakeTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanupHandshakeSocket();
          // Finding 1: If stop() was called during handshake, do NOT emit error
          if (this.generation !== myGeneration) {
            resolve();
            return;
          }
          const error = new Error(
            `WebSocket handshake timed out after ${handshakeTimeoutMs}ms connecting to ${this.wsUrl}`
          );
          this.emit('error', {
            code: 'WEBSOCKET_HANDSHAKE_FAILED',
            message: error.message,
          });
          reject(error);
        }, handshakeTimeoutMs);

        ws.onopen = () => {
          if (settled) return;
          settled = true;
          // Clear the handshake timeout
          if (handshakeTimer !== null) {
            clearTimeout(handshakeTimer);
            handshakeTimer = null;
          }

          // Finding 1: If stop() was called after WebSocket construction but before onopen,
          // abort startup immediately: clean up socket, do NOT set active, do NOT wire audio,
          // do NOT emit 'listening', and resolve cleanly.
          if (this.generation !== myGeneration) {
            cleanupHandshakeSocket();
            resolve();
            return;
          }

          hasOpened = true;
          this.active = true;

          // Wire microphone PCM streaming from AudioEngine
          this.detachPCM = this.audio.onPCM((pcm) => {
            this.handleMicrophonePCM(pcm);
          });

          this.emit('listening');
          resolve();
        };

        ws.onmessage = (event) => {
          if (this.generation !== myGeneration || !this.active) return;
          this.packetsReceived++;
          this.handleServerMessage(event.data);
        };

        ws.onerror = (err) => {
          if (this.generation !== myGeneration) {
            if (!settled) {
              settled = true;
              cleanupHandshakeSocket();
              resolve();
            }
            return;
          }
          if (!hasOpened) {
            if (!settled) {
              settled = true;
              cleanupHandshakeSocket();
              const error = new Error(`WebSocket connection failed to ${this.wsUrl}`);
              this.emit('error', {
                code: 'WEBSOCKET_HANDSHAKE_FAILED',
                message: error.message,
              });
              reject(error);
            }
          } else {
            this.emit('error', {
              code: 'WEBSOCKET_ERROR',
              message: 'Live interaction WebSocket connection error',
            });
          }
        };

        ws.onclose = (event) => {
          if (this.generation !== myGeneration) {
            if (!settled) {
              settled = true;
              cleanupHandshakeSocket();
              resolve();
            }
            return;
          }
          if (!hasOpened) {
            if (!settled) {
              settled = true;
              cleanupHandshakeSocket();
              const error = new Error(
                `WebSocket closed before handshake completed (code: ${event.code})`
              );
              this.emit('error', {
                code: 'WEBSOCKET_HANDSHAKE_FAILED',
                message: error.message,
              });
              reject(error);
            }
          } else {
            this.handleClosed(event.code, event.reason);
          }
        };
      } catch (err: any) {
        if (!settled) {
          settled = true;
          cleanupHandshakeSocket();
          if (this.generation !== myGeneration) {
            resolve();
          } else {
            reject(err);
          }
        }
      }
    });
  }

  /**
   * Gracefully shuts down connection and cleans all resources.
   */
  async stop(): Promise<void> {
    // Fix 1 & 2: Advance the generation counter so any in-flight internalStart()
    // or sendText() async closure that checks this.generation !== myGeneration
    // will abort without constructing a WebSocket or proceeding to TTS.
    this.generation++;
    // Invalidate pending startPromise so immediate start() initiates a fresh startup.
    this.startPromise = null;
    this.startGeneration = 0;

    this.active = false;

    // Abort in-flight text-turn chat request
    if (this.textTurnAbortController) {
      this.textTurnAbortController.abort();
      this.textTurnAbortController = null;
    }

    // Abort in-flight TTS synthesis
    if (this.ttsAbortController) {
      this.ttsAbortController.abort();
      this.ttsAbortController = null;
    }

    // Flush local audio playback immediately
    this.interrupt();

    // Detach microphone capture
    if (this.detachPCM) {
      this.detachPCM();
      this.detachPCM = null;
    }

    // Close WebSocket
    if (this.ws) {
      try {
        if (this.ws.readyState === this.WebSocketClass.OPEN) {
          this.sendControl({ type: 'CLOSE_SESSION' });
        }
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }

    this.activeTurnId = null;
    this.interruptedTurnIds.clear();
    this.isTransmitting = false;
    this.isSpeaking = false;
    this.handsFreeListening = false;
    this.vad.reset();
    this.preRollFrames.length = 0;
  }

  /**
   * Text input fallback.
   * LiveInteractionServer is an audio stream gateway that does not support
   * raw TEXT_MESSAGE frames. Text turns route through the canonical
   * /api/sophia/chat endpoint server-side, with spoken playback synthesized
   * via AudioEngine, without invoking client-side tools.
   */
  sendText(text: string): void {
    const cleanText = text.trim();
    if (!cleanText) return;

    // Finding 2: When a newer turn starts, immediately cancel any prior
    // in-flight turn across its entire lifecycle: chat request, TTS request,
    // audio download, and active hardware playback.
    const previousTurnId = this.activeTurnId;
    if (previousTurnId) {
      this.interruptedTurnIds.add(previousTurnId);

      // If superseding an active gateway/PTT turn, send the canonical INTERRUPT
      // control frame to LiveInteractionServer with the previous turn ID while
      // its identity is still available.
      if (this.ws && this.ws.readyState === this.WebSocketClass.OPEN) {
        this.sendControl({
          type: 'INTERRUPT',
          turnId: previousTurnId,
          timestamp: Date.now(),
        });
      }
    }
    if (this.textTurnAbortController) {
      this.textTurnAbortController.abort();
      this.textTurnAbortController = null;
    }
    if (this.ttsAbortController) {
      this.ttsAbortController.abort();
      this.ttsAbortController = null;
    }
    this.audio.interruptPlayback();
    this.isSpeaking = false;
    this.isTransmitting = false;

    const turnId = `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.activeTurnId = turnId;
    this.turnStartPerfMs = performance.now();

    const turnAbort = new AbortController();
    this.textTurnAbortController = turnAbort;
    const myGeneration = this.generation;

    this.emit('transcript', { role: 'user', text: cleanText, final: true });
    this.emit('thinking');

    void (async () => {
      try {
        const chatRes = await this.fetchFn('/api/sophia/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: cleanText, turnId }),
          signal: turnAbort.signal,
        });
        if (!chatRes.ok) {
          throw new Error(`Chat turn failed: HTTP ${chatRes.status}`);
        }
        const data = (await chatRes.json()) as { text?: string; reply?: string };
        const reply = (data.reply || data.text || '').trim();

        // Check if turn was invalidated during chat fetch
        if (
          this.generation !== myGeneration ||
          this.interruptedTurnIds.has(turnId) ||
          turnAbort.signal.aborted ||
          this.activeTurnId !== turnId
        ) {
          return;
        }

        if (reply) {
          await this.handleSophiaResponse({ turnId, reply }, turnAbort.signal);
        } else {
          this.finishTurn(turnId);
        }
      } catch (err: any) {
        if ((err as Error).name === 'AbortError') return;
        if (this.generation !== myGeneration || this.activeTurnId !== turnId) return;
        this.emit('error', {
          code: 'TEXT_TURN_FAILED',
          message: err?.message || 'Text turn failed',
        });
        this.recoverTurn(turnId);
      } finally {
        if (this.textTurnAbortController === turnAbort) {
          this.textTurnAbortController = null;
        }
      }
    })();
  }

  /**
   * Immediate user barge-in / UI interrupt.
   * Flushes local hardware audio buffers (<5ms) and sends INTERRUPT frame to server.
   */
  interrupt(): void {
    // 1. Immediate local audio hardware cutoff (<5ms)
    this.audio.interruptPlayback();

    // 2. Abort any active TTS fetch requests
    if (this.ttsAbortController) {
      this.ttsAbortController.abort();
      this.ttsAbortController = null;
    }

    // Fix 2: Abort the in-flight text-turn AbortController on barge-in.
    // This cancels any pending /api/sophia/chat or /api/sophia/mouth/speak
    // fetch for the current text turn without waiting for stop().
    if (this.textTurnAbortController) {
      this.textTurnAbortController.abort();
      this.textTurnAbortController = null;
    }

    // 3. Mark current turn as interrupted locally to drop late-arriving packets
    if (this.activeTurnId) {
      this.interruptedTurnIds.add(this.activeTurnId);
    }

    const currentTurnId = this.activeTurnId;
    this.isTransmitting = false;
    this.isSpeaking = false;

    // 4. Emit normalized interrupted and playback_finished events
    this.emit('interrupted');
    this.emit('playback_finished');

    // 5. Send cooperative INTERRUPT control frame to LiveInteractionServer
    if (this.ws && this.ws.readyState === this.WebSocketClass.OPEN) {
      this.sendControl({
        type: 'INTERRUPT',
        turnId: currentTurnId || undefined,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Starts a push-to-talk / speech turn.
   */
  startPtt(callerTurnId?: string): string {
    const turnId = callerTurnId || `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.activeTurnId = turnId;
    this.isTransmitting = true;
    this.turnStartPerfMs = performance.now();
    this.turnStopPerfMs = 0;
    this.transcriptFinalPerfMs = 0;
    this.sophiaResponsePerfMs = 0;

    if (this.ws && this.ws.readyState === this.WebSocketClass.OPEN) {
      this.sendControl({
        type: 'START_PTT',
        turnId,
        timestamp: Date.now(),
      });
    }

    this.emit('speech_started', { level: 0.5 });
    return turnId;
  }

  /**
   * Stops a push-to-talk / speech turn.
   */
  stopPtt(turnId?: string): void {
    if (!this.isTransmitting) return;
    const targetTurnId = turnId || this.activeTurnId;
    this.isTransmitting = false;
    this.turnStopPerfMs = performance.now();

    if (targetTurnId && this.ws && this.ws.readyState === this.WebSocketClass.OPEN) {
      this.sendControl({
        type: 'STOP_PTT',
        turnId: targetTurnId,
        timestamp: Date.now(),
      });
    }

    this.emit('thinking');
  }

  /**
   * Forward incoming 16 kHz PCM microphone audio chunks to server.
   */
  private handleMicrophonePCM(pcm: ArrayBuffer): void {
    if (!this.active || !this.ws || this.ws.readyState !== this.WebSocketClass.OPEN) return;

    if (!this.handsFreeListening) {
      if (this.isTransmitting) this.sendPcm(pcm);
      return;
    }

    if (pcm.byteLength < 2 || pcm.byteLength % 2 !== 0) return;
    const frame = pcm.slice(0);
    const vad = this.vad.process(new Int16Array(frame));

    if (!this.isTransmitting) {
      this.preRollFrames.push(frame);
      if (this.preRollFrames.length > this.maxPreRollFrames) this.preRollFrames.shift();

      if (vad.event === 'speech_start') {
        const previousTurnId = this.activeTurnId;
        if (previousTurnId && !this.interruptedTurnIds.has(previousTurnId)) {
          // New speech during Sophia's response or cognitive work supersedes
          // that turn. The server cancels its executor/STT before the new PTT.
          this.interrupt();
        }

        this.startPtt();
        for (const bufferedFrame of this.preRollFrames) this.sendPcm(bufferedFrame);
        this.preRollFrames.length = 0;
      }
      return;
    }

    this.sendPcm(frame);
    if (vad.event === 'speech_end') this.stopPtt();
  }

  private sendPcm(pcm: ArrayBuffer): void {
    if (!this.active || !this.isTransmitting || !this.ws) return;
    if (this.ws.readyState !== this.WebSocketClass.OPEN) return;
    try {
      this.ws.send(pcm);
      this.packetsSent++;
    } catch {
      /* ignore */
    }
  }

  private sendControl(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== this.WebSocketClass.OPEN) return;
    try {
      this.ws.send(JSON.stringify(message));
      this.packetsSent++;
    } catch {
      /* ignore */
    }
  }

  getTrafficMetrics(): { packetsSent: number; packetsReceived: number } {
    return { packetsSent: this.packetsSent, packetsReceived: this.packetsReceived };
  }

  private finishTurn(turnId: string): void {
    if (this.activeTurnId !== turnId) return;
    this.activeTurnId = null;
    this.interruptedTurnIds.delete(turnId);
    this.isTransmitting = false;
    this.isSpeaking = false;
    this.emit('response_finished');
    this.emit('playback_finished');
    this.emit('listening', { source: this.id });
  }

  private recoverTurn(turnId: string | null): void {
    if (!turnId || this.activeTurnId !== turnId) return;
    this.activeTurnId = null;
    this.isTransmitting = false;
    this.isSpeaking = false;
    this.vad.reset();
    this.preRollFrames.length = 0;
    this.emit('playback_finished');
    this.emit('listening', { source: this.id });
  }

  /**
   * Dispatch incoming server frames from LiveInteractionServer.
   */
  private handleServerMessage(data: any): void {
    if (typeof data !== 'string') return;

    let msg: any;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'SESSION_READY':
      case 'SESSION_RESUMED':
        // Connected and authenticated
        break;

      case 'TRANSCRIPT_INTERIM':
        if (
          msg.text &&
          !this.interruptedTurnIds.has(msg.turnId) &&
          (!this.activeTurnId || this.activeTurnId === msg.turnId)
        ) {
          this.emit('transcript', {
            role: 'user',
            text: msg.text,
            final: false,
          });
        }
        break;

      case 'TRANSCRIPT_FINAL':
        if (
          typeof msg.text === 'string' &&
          !msg.text.trim() &&
          !this.interruptedTurnIds.has(msg.turnId) &&
          (!this.activeTurnId || this.activeTurnId === msg.turnId)
        ) {
          if (this.isTransmitting && (!this.activeTurnId || this.activeTurnId === msg.turnId)) {
            this.stopPtt(msg.turnId);
          }
          this.vad.reset();
          this.preRollFrames.length = 0;
          this.recoverTurn(msg.turnId || this.activeTurnId);
        } else if (
          msg.text &&
          !this.interruptedTurnIds.has(msg.turnId) &&
          (!this.activeTurnId || this.activeTurnId === msg.turnId)
        ) {
          this.transcriptFinalPerfMs = performance.now();
          this.emit('transcript', {
            role: 'user',
            text: msg.text,
            final: true,
          });
          if (this.isTransmitting) this.stopPtt(msg.turnId);
          else this.emit('thinking');
          // A semantic STT final can arrive before the local silence hangover.
          // Reset VAD here so the next spoken phrase can open a fresh turn.
          this.vad.reset();
          this.preRollFrames.length = 0;
        }
        break;

      case 'SOPHIA_RESPONSE':
        this.sophiaResponsePerfMs = performance.now();
        void this.handleSophiaResponse(msg);
        break;

      case 'INTERRUPTED_ACK':
        if (msg.turnId) {
          this.interruptedTurnIds.add(msg.turnId);
        }
        break;

      case 'ERROR': {
        const failedTurnId = msg.turnId || this.activeTurnId;
        if (msg.turnId && this.activeTurnId && msg.turnId !== this.activeTurnId) break;
        this.emit('error', {
          code: msg.code || 'SERVER_ERROR',
          message: msg.message || 'Error from voice gateway',
        });
        if (failedTurnId && this.activeTurnId === failedTurnId) {
          this.interrupt();
          this.recoverTurn(failedTurnId);
        }
        break;
      }
    }
  }

  /**
   * Synthesize and sequentially play Sophia's spoken reply.
   */
  private async handleSophiaResponse(
    msg: {
      turnId: string;
      reply: string;
      directiveExecuted?: boolean;
      error?: string;
    },
    signal?: AbortSignal
  ): Promise<void> {
    const turnId = msg.turnId;

    // Drop response if this turn was interrupted, cancelled, or superseded
    if (
      !this.active ||
      this.interruptedTurnIds.has(turnId) ||
      signal?.aborted ||
      (this.activeTurnId && this.activeTurnId !== turnId)
    ) {
      return;
    }

    const replyText = String(msg.reply || '').trim();
    if (!replyText) {
      this.finishTurn(turnId);
      return;
    }

    this.emit('transcript', {
      role: 'sophia',
      text: replyText,
      final: true,
    });

    this.emit('response_started');
    this.isSpeaking = true;

    // Calculate monotonic client turn-to-response duration
    const clientLatencyMs = this.turnStartPerfMs > 0 ? performance.now() - this.turnStartPerfMs : 0;

    // Synthesize spoken reply sequentially via canonical TTS endpoint
    const controller = new AbortController();
    this.ttsAbortController = controller;

    // Forward turn signal abort to TTS controller
    if (signal) {
      if (signal.aborted) {
        controller.abort();
        return;
      }
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const ttsStartPerfMs = performance.now();

    try {
      const ttsRes = await this.fetchFn('/api/sophia/mouth/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: replyText,
          provider: controlLayer.pureGeminiLive ? 'gemini' : (controlLayer.mouthProvider || 'auto'),
          voice: controlLayer.voiceName,
          voiceId: controlLayer.elevenLabsVoiceId || 'bMxLr8fP6hzNRRi9nJxU',
          modelId: controlLayer.elevenLabsModelId || 'eleven_turbo_v2_5',
        }),
        signal: controller.signal,
      });

      if (!ttsRes.ok) {
        throw new Error(`TTS synthesis returned HTTP ${ttsRes.status}`);
      }

      const audioBuffer = await ttsRes.arrayBuffer();
      const ttsEndPerfMs = performance.now();

      // Check if interrupted or superseded while fetching or downloading audio
      if (
        !this.active ||
        this.interruptedTurnIds.has(turnId) ||
        !this.isSpeaking ||
        controller.signal.aborted ||
        signal?.aborted ||
        (this.activeTurnId && this.activeTurnId !== turnId)
      ) {
        return;
      }

      const playbackStartPerfMs = performance.now();
      const endToEndTotalMs = this.turnStartPerfMs > 0 ? playbackStartPerfMs - this.turnStartPerfMs : 0;
      const endToEndFromStopMs = this.turnStopPerfMs > 0 ? playbackStartPerfMs - this.turnStopPerfMs : endToEndTotalMs;
      const sttLatencyMs = this.transcriptFinalPerfMs > 0 && this.turnStopPerfMs > 0 ? this.transcriptFinalPerfMs - this.turnStopPerfMs : 0;
      const cognitionLatencyMs = this.sophiaResponsePerfMs > 0 && this.transcriptFinalPerfMs > 0 ? this.sophiaResponsePerfMs - this.transcriptFinalPerfMs : 0;
      const ttsLatencyMs = ttsEndPerfMs - ttsStartPerfMs;

      const latencyRecord = {
        turnId,
        turnType: turnId.startsWith('text_') ? ('text' as const) : ('voice' as const),
        turnStartMs: this.turnStartPerfMs,
        turnStopMs: this.turnStopPerfMs > 0 ? this.turnStopPerfMs : undefined,
        sttLatencyMs: Math.round(sttLatencyMs),
        cognitionLatencyMs: Math.round(cognitionLatencyMs),
        ttsLatencyMs: Math.round(ttsLatencyMs),
        endToEndFromStopMs: Math.round(endToEndFromStopMs),
        endToEndTotalMs: Math.round(endToEndTotalMs),
        timestamp: Date.now(),
      };
      this.latencyRecords.push(latencyRecord);

      this.emit('audio_started', {
        latencyMs: clientLatencyMs,
        endToEndMs: Math.round(endToEndTotalMs),
        endToEndFromStopMs: Math.round(endToEndFromStopMs),
        turnId,
        record: latencyRecord,
      });

      // Best-effort post to voice latency endpoint
      void this.fetchFn('/api/sofia/voice/latency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: latencyRecord }),
      }).catch(() => {});

      // Play audio through AudioEngine
      await this.audio.playEncoded(audioBuffer);

      // Verify turn is still current after playback finishes
      if (
        this.active &&
        !this.interruptedTurnIds.has(turnId) &&
        !controller.signal.aborted &&
        !signal?.aborted &&
        (!this.activeTurnId || this.activeTurnId === turnId)
      ) {
        this.finishTurn(turnId);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        if (
          this.active &&
          !this.interruptedTurnIds.has(turnId) &&
          !controller.signal.aborted &&
          !signal?.aborted &&
          (!this.activeTurnId || this.activeTurnId === turnId)
        ) {
          this.emit('error', {
            code: 'TTS_PLAYBACK_FAILED',
            message: err?.message || 'Failed to synthesize or play reply audio',
          });
        this.recoverTurn(turnId);
        }
      }
    } finally {
      if (this.ttsAbortController === controller) {
        this.ttsAbortController = null;
      }
      if (this.activeTurnId === turnId) {
        this.isSpeaking = false;
      }
    }
  }

  private handleClosed(code: number, reason: string): void {
    if (!this.active && !this.ws) return;
    this.active = false;

    // Clean up all resources
    if (this.detachPCM) {
      this.detachPCM();
      this.detachPCM = null;
    }
    if (this.ttsAbortController) {
      this.ttsAbortController.abort();
      this.ttsAbortController = null;
    }
    this.audio.interruptPlayback();

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }

    this.isTransmitting = false;
    this.isSpeaking = false;
    this.activeTurnId = null;

    this.emit('error', {
      code: 'GATEWAY_DISCONNECTED',
      message: `Live gateway WebSocket closed (code: ${code}, reason: ${reason || 'normal'})`,
    });
  }

  getLatencyRecords() {
    return [...this.latencyRecords];
  }

  getLatencySummary() {
    const records = this.latencyRecords;
    const stopLatencies = records.map((r) => r.endToEndFromStopMs).sort((a, b) => a - b);
    const totalLatencies = records.map((r) => r.endToEndTotalMs).sort((a, b) => a - b);
    const calc = (vals: number[], p: number) => {
      if (vals.length === 0) return 0;
      if (vals.length === 1) return vals[0];
      const rank = (p / 100) * (vals.length - 1);
      const l = Math.floor(rank);
      const u = Math.ceil(rank);
      return l === u ? vals[l] : Math.round((vals[l] + (rank - l) * (vals[u] - vals[l])) * 100) / 100;
    };
    return {
      sampleCount: records.length,
      p50EndToEndFromStopMs: calc(stopLatencies, 50),
      p95EndToEndFromStopMs: calc(stopLatencies, 95),
      p50TotalMs: calc(totalLatencies, 50),
      p95TotalMs: calc(totalLatencies, 95),
      records: [...records],
    };
  }

  clearLatencyRecords(): void {
    this.latencyRecords = [];
  }
}
