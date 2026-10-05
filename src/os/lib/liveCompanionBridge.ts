/**
 * ============================================================================
 * LIVE COMPANION BRIDGE (PHASE 4C-C)
 * ============================================================================
 * Bridges the browser AudioWorklet / VAD streaming client (SophiaLiveClient)
 * with the React OS state store (osStore).
 * 
 * Features:
 * - Single-instance lifecycle management for SophiaLiveClient.
 * - Authenticates via ephemeral Founder ticket (POST /api/auth/ws-ticket).
 * - Routes interim and final transcripts into osStore.liveVoice.
 * - Connects PTT hold/release lifecycle to UI triggers and Spacebar hotkey.
 * - Handles interruption / barge-in.
 * - Fails safely if companion server or microphone is unavailable.
 */

import { SophiaLiveClient } from '@/lib/client/live/live-client';
import type { LiveClientError } from '@/lib/client/live/types';
import { os, getOS } from './osStore';
import { fetchWsTicket } from './runtime';

/**
 * Phase 3 (SofiaUI voice runtime): events the bridge re-broadcasts to
 * subscribers (the voice runtime) on top of its existing osStore writes.
 * The store remains the UI read model; these events carry the transport
 * detail the store deliberately does not (levels, close codes, replies).
 */
export type LiveBridgeEvent =
  | { type: 'response'; turnId: string; reply: string }
  | { type: 'client-error'; error: LiveClientError }
  | { type: 'disconnect'; code: number }
  | { type: 'mic-level'; rms: number; peak: number };

class LiveCompanionBridge {
  private static instance: LiveCompanionBridge | null = null;
  private client: SophiaLiveClient | null = null;
  private isConnecting = false;
  private activeTurnCounter = 1;
  private listeners = new Set<(e: LiveBridgeEvent) => void>();
  /** Phase 3: while the voice runtime plays Sophia's spoken reply, server
   *  IDLE state changes are held so the client-owned speaking overlay is not
   *  flickered away before audio starts (see voiceRuntime). */
  private speakingGate: (() => boolean) | null = null;

  public static getInstance(): LiveCompanionBridge {
    if (!LiveCompanionBridge.instance) {
      LiveCompanionBridge.instance = new LiveCompanionBridge();
    }
    return LiveCompanionBridge.instance;
  }

  /** Phase 3: subscribe to bridge events (response / client-error /
   * disconnect / mic-level). Listener errors never break the bridge. */
  public subscribe(listener: (e: LiveBridgeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(e: LiveBridgeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(e);
      } catch (err) {
        console.warn('[LiveCompanionBridge] Listener error:', err);
      }
    }
  }

  /** Phase 3: arm/disarm the speaking overlay hold (voice runtime owns it). */
  public setSpeakingGate(gate: (() => boolean) | null): void {
    this.speakingGate = gate;
  }

  /**
   * Initializes or toggles live interaction voice mode.
   */
  public async toggleVoice(enabled?: boolean): Promise<boolean> {
    const current = getOS().liveVoice.enabled;
    const target = enabled !== undefined ? enabled : !current;

    if (!target) {
      this.disconnect();
      os.setLiveVoice({ enabled: false, status: 'disconnected' });
      return false;
    }

    os.setLiveVoice({ enabled: true, status: 'connecting', error: null });
    try {
      await this.connect();
      return true;
    } catch (err: any) {
      console.warn('[LiveCompanionBridge] Connection failed:', err);
      os.setLiveVoice({
        enabled: false,
        status: 'error',
        error: err.message || 'Failed to connect to live companion gateway',
      });
      return false;
    }
  }

  public async connect(): Promise<void> {
    if (this.client || this.isConnecting) return;
    this.isConnecting = true;

    try {
      // 1. Fetch authenticated single-use ticket
      const ticketRes = await fetchWsTicket();
      if (!ticketRes.success || !ticketRes.ticket) {
        throw new Error('Failed to acquire live companion authentication ticket');
      }

      const wsProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const wsPort = ticketRes.wsPort || 3001;
      const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}`;

      // 2. Instantiate SophiaLiveClient
      const client = new SophiaLiveClient({
        wsUrl,
        ticket: ticketRes.ticket,
        onStateChange: (state) => {
          const statusMap: Record<string, any> = {
            IDLE: 'idle',
            LISTENING: 'listening',
            TRANSCRIBING: 'transcribing',
            THINKING: 'thinking',
            SPEAKING: 'speaking',
            INTERRUPTED: 'interrupted',
            ERROR: 'error',
          };
          const status = statusMap[state] || 'idle';
          // Phase 3: while the voice runtime is playing Sophia's spoken reply,
          // hold the client-owned 'speaking' overlay — the server's trailing
          // IDLE STATE_CHANGE after SOPHIA_RESPONSE must not flicker the orb
          // back to idle before playback has started.
          if (state === 'IDLE' && this.speakingGate && this.speakingGate()) {
            return;
          }
          os.setLiveVoice({ status });
          if (state === 'THINKING') os.setSophia('thinking');
          else if (state === 'SPEAKING') os.setSophia('speaking');
          else if (state === 'IDLE' && getOS().sophia !== 'attentive') os.setSophia('idle');
        },
        onTranscriptInterim: (turnId, text) => {
          os.setLiveVoiceInterim(turnId, text);
        },
        onTranscriptFinal: (turnId, text) => {
          os.setLiveVoiceFinal(turnId, text);
        },
        onSophiaResponse: (msg) => {
          if (msg.reply) {
            os.setLiveVoiceReply(msg.turnId, msg.reply);
            // Phase 3: the voice runtime synthesizes + plays the spoken reply.
            this.emit({ type: 'response', turnId: msg.turnId, reply: msg.reply });
          }
        },
        onError: (err) => {
          console.warn('[LiveCompanionBridge] Client error:', err);
          os.setLiveVoice({ error: err.message });
          this.emit({ type: 'client-error', error: err });
        },
        onDisconnect: (code) => {
          // Phase 3: unintended transport loss — the store reflects the loss
          // (previously it silently stayed in its last status); the runtime
          // decides on reconnection (close-code aware).
          os.setLiveVoice({ status: 'disconnected' });
          this.emit({ type: 'disconnect', code });
        },
        onMicLevel: (rms, peak) => {
          // Phase 3: real capture metering for the voice-presence orb.
          this.emit({ type: 'mic-level', rms, peak });
        },
      });

      // 3. Connect WebSocket
      await client.connect();

      // 4. Request microphone acquisition
      try {
        await client.startMicrophone();
      } catch (micErr: any) {
        console.warn('[LiveCompanionBridge] Microphone not started:', micErr);
        os.setLiveVoice({
          error: 'Microphone permission denied or device not found',
        });
      }

      this.client = client;
      os.setLiveVoice({ status: 'idle', error: null });
    } finally {
      this.isConnecting = false;
    }
  }

  public startPtt(): string | null {
    if (!this.client) return null;
    const turnId = `voice_turn_${Date.now()}_${this.activeTurnCounter++}`;
    this.client.startPtt(turnId);
    os.setLiveVoice({
      status: 'listening',
      activeTurnId: turnId,
      interimText: '',
      finalText: '',
      error: null,
    });
    return turnId;
  }

  public stopPtt(): void {
    if (!this.client) return;
    this.client.stopPtt();
    os.setLiveVoice({ status: 'thinking' });
  }

  public interrupt(): void {
    if (!this.client) return;
    this.client.interrupt();
    os.setLiveVoice({ status: 'interrupted' });
  }

  /**
   * Phase 3 (SofiaUI voice runtime): hard transport reset + fresh
   * authenticated connect after unintended loss. Conversation continuity
   * is preserved server-side (conversationId is durable); the transport
   * session itself restarts fresh — an in-flight turn's response delivery
   * does not survive a drop (documented limitation, see PORT-NOTES).
   * On failure the store reports 'error' but `enabled` is preserved so the
   * caller can retry.
   */
  public async reconnect(): Promise<boolean> {
    if (this.isConnecting) return false;
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    os.setLiveVoice({ status: 'connecting', error: null });
    try {
      await this.connect();
      return true;
    } catch (err: any) {
      console.warn('[LiveCompanionBridge] Reconnect failed:', err);
      os.setLiveVoice({ status: 'error', error: 'Live session reconnect failed' });
      return false;
    }
  }

  public disconnect(): void {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    os.resetLiveVoice();
  }

  public getClient(): SophiaLiveClient | null {
    return this.client;
  }
}

export const liveBridge = LiveCompanionBridge.getInstance();
