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
import { VoiceProvider } from './VoiceProvider';
import { validateGatewayHost } from '../../lib/voice-config';

export interface LiveGatewayOptions {
  wsUrl?: string;
  allowedHosts?: string[];
  currentHostname?: string;
  fetchFn?: typeof fetch;
  WebSocketClass?: typeof WebSocket;
}

export class LiveGatewayVoiceProvider extends VoiceProvider {
  readonly id: VoiceProviderId = 'live-gateway';

  private wsUrl: string;
  private ws: WebSocket | null = null;
  private fetchFn: typeof fetch;
  private WebSocketClass: typeof WebSocket;

  private detachPCM: (() => void) | null = null;
  private ttsAbortController: AbortController | null = null;

  private activeTurnId: string | null = null;
  private interruptedTurnIds = new Set<string>();

  private isTransmitting = false;
  private isSpeaking = false;
  private turnStartPerfMs = 0;

  constructor(
    private audio: AudioEngine,
    wsUrl = 'ws://localhost:3001',
    options: LiveGatewayOptions = {}
  ) {
    super();
    this.wsUrl = this.validateWsUrl(wsUrl, options);
    this.fetchFn = options.fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
    this.WebSocketClass = options.WebSocketClass || (typeof window !== 'undefined' ? window.WebSocket : (globalThis as any).WebSocket);
  }

  /**
   * Validates that the provided WebSocket URL strictly conforms to:
   * 1. Protocol: ws:// or wss:// only.
   * 2. Host validation: host must be localhost, 127.0.0.1, [::1], current origin hostname,
   *    or in the trusted gateway host allowlist (*.samjuniors.com / *.samjuniors.local).
   * 3. No embedded credentials (username/password).
   * Acceptance criterion: fails closed on untrusted hosts or malformed strings.
   */
  private validateWsUrl(url: string, options: LiveGatewayOptions = {}): string {
    const hostCheck = validateGatewayHost(url, options);
    if (!hostCheck.valid) {
      throw new Error(`LiveGatewayVoiceProvider: ${hostCheck.error}`);
    }
    return url.trim();
  }

  /**
   * Acquires single-use ticket from /api/auth/ws-ticket and connects WebSocket.
   */
  async start(): Promise<void> {
    if (this.active) return;

    // 1. Fetch single-use ticket from canonical Next.js auth endpoint
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
      this.emit('error', {
        code: 'TICKET_ACQUISITION_FAILED',
        message: err?.message || 'Could not obtain voice ticket',
      });
      throw err;
    }

    // 2. Connect to companion WebSocket server
    const targetUrl = `${this.wsUrl}${this.wsUrl.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(ticket)}`;

    await new Promise<void>((resolve, reject) => {
      try {
        const ws = new this.WebSocketClass(targetUrl);
        this.ws = ws;

        ws.binaryType = 'arraybuffer';

        let hasOpened = false;

        ws.onopen = () => {
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
          this.handleServerMessage(event.data);
        };

        ws.onerror = (err) => {
          if (!hasOpened) {
            reject(new Error(`WebSocket connection failed to ${this.wsUrl}`));
          } else {
            this.emit('error', {
              code: 'WEBSOCKET_ERROR',
              message: 'Live interaction WebSocket connection error',
            });
          }
        };

        ws.onclose = (event) => {
          if (!hasOpened) {
            reject(new Error(`WebSocket closed before handshake completed (code: ${event.code})`));
          } else {
            this.handleClosed(event.code, event.reason);
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Gracefully shuts down connection and cleans all resources.
   */
  async stop(): Promise<void> {
    this.active = false;

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
          this.ws.send(JSON.stringify({ type: 'CLOSE_SESSION' }));
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
  }

  /**
   * Text input fallback (sends text turn to canonical brain).
   */
  sendText(text: string): void {
    const cleanText = text.trim();
    if (!cleanText || !this.ws || this.ws.readyState !== this.WebSocketClass.OPEN) return;

    const turnId = `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.activeTurnId = turnId;
    this.turnStartPerfMs = performance.now();

    this.emit('transcript', { role: 'user', text: cleanText, final: true });
    this.emit('thinking');

    // LiveInteractionServer processes TEXT_MESSAGE through executeSophiaTurn
    this.ws.send(
      JSON.stringify({
        type: 'TEXT_MESSAGE',
        turnId,
        text: cleanText,
        timestamp: Date.now(),
      })
    );
  }

  /**
   * Immediate user barge-in / UI interrupt.
   * Flushes local hardware audio buffers (<5ms) and sends INTERRUPT frame to server.
   */
  interrupt(): void {
    // 1. Immediate local audio hardware cutoff (<5ms)
    this.audio.stop();

    // 2. Abort any active TTS fetch requests
    if (this.ttsAbortController) {
      this.ttsAbortController.abort();
      this.ttsAbortController = null;
    }

    // 3. Mark current turn as interrupted locally to drop late-arriving packets
    if (this.activeTurnId) {
      this.interruptedTurnIds.add(this.activeTurnId);
    }

    const currentTurnId = this.activeTurnId;
    this.isSpeaking = false;

    // 4. Emit normalized interrupted and playback_finished events
    this.emit('interrupted');
    this.emit('playback_finished');

    // 5. Send cooperative INTERRUPT control frame to LiveInteractionServer
    if (this.ws && this.ws.readyState === this.WebSocketClass.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            type: 'INTERRUPT',
            turnId: currentTurnId || undefined,
            timestamp: Date.now(),
          })
        );
      } catch {
        /* ignore */
      }
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

    if (this.ws && this.ws.readyState === this.WebSocketClass.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'START_PTT',
          turnId,
          timestamp: Date.now(),
        })
      );
    }

    this.emit('speech_started', { level: 0.5 });
    return turnId;
  }

  /**
   * Stops a push-to-talk / speech turn.
   */
  stopPtt(turnId?: string): void {
    const targetTurnId = turnId || this.activeTurnId;
    this.isTransmitting = false;

    if (targetTurnId && this.ws && this.ws.readyState === this.WebSocketClass.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'STOP_PTT',
          turnId: targetTurnId,
          timestamp: Date.now(),
        })
      );
    }

    this.emit('thinking');
  }

  /**
   * Forward incoming 16 kHz PCM microphone audio chunks to server.
   */
  private handleMicrophonePCM(pcm: ArrayBuffer): void {
    if (!this.active || !this.isTransmitting || !this.ws) return;
    if (this.ws.readyState !== this.WebSocketClass.OPEN) return;

    try {
      this.ws.send(pcm);
    } catch {
      /* ignore */
    }
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
        if (msg.text && !this.interruptedTurnIds.has(msg.turnId)) {
          this.emit('transcript', {
            role: 'user',
            text: msg.text,
            final: false,
          });
        }
        break;

      case 'TRANSCRIPT_FINAL':
        if (msg.text && !this.interruptedTurnIds.has(msg.turnId)) {
          this.emit('transcript', {
            role: 'user',
            text: msg.text,
            final: true,
          });
          this.emit('thinking');
        }
        break;

      case 'SOPHIA_RESPONSE':
        void this.handleSophiaResponse(msg);
        break;

      case 'INTERRUPTED_ACK':
        if (msg.turnId) {
          this.interruptedTurnIds.add(msg.turnId);
        }
        break;

      case 'ERROR':
        this.emit('error', {
          code: msg.code || 'SERVER_ERROR',
          message: msg.message || 'Error from voice gateway',
        });
        break;
    }
  }

  /**
   * Synthesize and sequentially play Sophia's spoken reply.
   */
  private async handleSophiaResponse(msg: {
    turnId: string;
    reply: string;
    directiveExecuted?: boolean;
    error?: string;
  }): Promise<void> {
    const turnId = msg.turnId;

    // Drop response if this turn was interrupted
    if (this.interruptedTurnIds.has(turnId)) {
      return;
    }

    const replyText = String(msg.reply || '').trim();
    if (!replyText) {
      this.emit('response_finished');
      this.emit('playback_finished');
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
    this.ttsAbortController = new AbortController();

    try {
      const ttsRes = await this.fetchFn('/api/sophia/mouth/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText }),
        signal: this.ttsAbortController.signal,
      });

      if (!ttsRes.ok) {
        throw new Error(`TTS synthesis returned HTTP ${ttsRes.status}`);
      }

      const audioBuffer = await ttsRes.arrayBuffer();

      // Check if interrupted while downloading audio
      if (this.interruptedTurnIds.has(turnId) || !this.isSpeaking) {
        return;
      }

      this.emit('audio_started', { latencyMs: clientLatencyMs });

      // Play audio through AudioEngine
      await this.audio.playEncoded(audioBuffer);

      if (!this.interruptedTurnIds.has(turnId)) {
        this.emit('response_finished');
        this.emit('playback_finished');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        this.emit('error', {
          code: 'TTS_PLAYBACK_FAILED',
          message: err?.message || 'Failed to synthesize or play reply audio',
        });
        this.emit('playback_finished');
      }
    } finally {
      this.isSpeaking = false;
      this.ttsAbortController = null;
    }
  }

  private handleClosed(code: number, reason: string): void {
    if (!this.active) return;
    this.active = false;
    this.emit('error', {
      code: 'GATEWAY_DISCONNECTED',
      message: `Live gateway WebSocket closed (code: ${code}, reason: ${reason || 'normal'})`,
    });
  }
}
