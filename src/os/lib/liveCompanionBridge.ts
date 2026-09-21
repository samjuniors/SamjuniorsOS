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
import { os, getOS } from './osStore';
import { fetchWsTicket } from './runtime';

class LiveCompanionBridge {
  private static instance: LiveCompanionBridge | null = null;
  private client: SophiaLiveClient | null = null;
  private isConnecting = false;
  private activeTurnCounter = 1;

  public static getInstance(): LiveCompanionBridge {
    if (!LiveCompanionBridge.instance) {
      LiveCompanionBridge.instance = new LiveCompanionBridge();
    }
    return LiveCompanionBridge.instance;
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
          }
        },
        onError: (err) => {
          console.warn('[LiveCompanionBridge] Client error:', err);
          os.setLiveVoice({ error: err.message });
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
