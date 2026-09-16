import { LiveModalityState, ServerLiveMessage, ClientLiveMessage } from '../../server/live/types';
import {
  SophiaLiveClientOptions,
  LiveClientError,
  AudioIngressTelemetry,
} from './types';
import { createAudioWorkletBlobUrl, PCM_RESAMPLER_WORKLET_NAME } from './audio-worklet-processor';
import { SileroVadEngine } from './vad';

export class SophiaLiveClient {
  private options: SophiaLiveClientOptions;
  private ws: WebSocket | null = null;
  private state: LiveModalityState = 'IDLE';

  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletBlobUrl: string | null = null;
  private vadEngine: SileroVadEngine;

  private isPttActive = false;
  private activeTurnId: string | null = null;
  private currentSessionId: string | null = null;
  private activeConversationId: string | null = null;

  private telemetry: AudioIngressTelemetry = {
    framesCaptured: 0,
    framesTransmitted: 0,
    framesGatedSilence: 0,
    framesDroppedBackpressure: 0,
    bytesTransmitted: 0,
    speechDurationMs: 0,
  };

  private maxBufferBytes: number;
  private isDestroyed = false;

  constructor(options: SophiaLiveClientOptions = {}) {
    this.options = options;
    this.activeConversationId = options.conversationId || null;
    this.maxBufferBytes = options.maxBufferBytes || 65_536; // 64 KB max buffer

    this.vadEngine = new SileroVadEngine(options.vad);
  }

  /**
   * Connects to the companion live session WebSocket.
   */
  public async connect(): Promise<void> {
    if (this.isDestroyed) return;

    const wsUrl = this.options.wsUrl || 'ws://localhost:3001';
    const targetUrl = this.options.ticket
      ? `${wsUrl}?ticket=${encodeURIComponent(this.options.ticket)}`
      : wsUrl;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(targetUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          this.transitionState('IDLE', 'WebSocket connected');
          // Initialize session
          this.sendControl({
            type: 'INIT_SESSION',
            conversationId: this.activeConversationId || undefined,
          });
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleServerMessage(event.data);
        };

        this.ws.onclose = (event) => {
          this.transitionState('IDLE', `WebSocket closed: ${event.code}`);
        };

        this.ws.onerror = (err) => {
          this.emitError({
            code: 'WEBSOCKET_ERROR',
            message: 'Live interaction WebSocket connection failed',
            originalError: err,
          });
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Acquires browser microphone and initializes AudioWorklet resampler.
   */
  public async startMicrophone(): Promise<void> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      throw new Error('Microphone acquisition is only supported in browser environments');
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.emitError({
        code: 'AUDIO_WORKLET_UNSUPPORTED',
        message: 'navigator.mediaDevices.getUserMedia is not supported by this browser',
        fatal: true,
      });
      return;
    }

    // 1. Acquire MediaStream
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.emitError({
          code: 'MIC_PERMISSION_DENIED',
          message: 'Microphone permission was denied by the user',
          fatal: true,
          originalError: err,
        });
      } else {
        this.emitError({
          code: 'MIC_NOT_FOUND',
          message: 'Failed to access audio recording device',
          fatal: true,
          originalError: err,
        });
      }
      throw err;
    }

    // 2. Initialize AudioContext and Worklet
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtxClass();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Load resampler worklet via Blob URL
      this.workletBlobUrl = createAudioWorkletBlobUrl();
      await this.audioContext.audioWorklet.addModule(this.workletBlobUrl);

      const sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, PCM_RESAMPLER_WORKLET_NAME);

      // Handle PCM frames emitted by the AudioWorklet
      this.workletNode.port.onmessage = (event) => {
        if (event.data && event.data.type === 'pcm_chunk') {
          this.handlePcmChunk(event.data.pcm);
        }
      };

      sourceNode.connect(this.workletNode);
    } catch (err: any) {
      this.emitError({
        code: 'AUDIO_WORKLET_FAILED',
        message: `Failed to initialize AudioWorklet: ${err.message}`,
        fatal: true,
        originalError: err,
      });
      throw err;
    }
  }

  /**
   * Processes a 16kHz mono PCM frame from the AudioWorklet.
   */
  public handlePcmChunk(arrayBuffer: ArrayBuffer | SharedArrayBuffer): void {
    this.telemetry.framesCaptured++;
    const pcm = new Int16Array(arrayBuffer);

    // 1. Evaluate Voice Activity Detection
    const vadResult = this.vadEngine.process(pcm);

    // 2. Handle speech start trigger (immediate local assistant audio mute hook)
    if (vadResult.event === 'speech_start') {
      if (this.options.onSpeechStart) {
        this.options.onSpeechStart();
      }
      // If Sophia was in a speaking state, also notify server of barge-in
      if (this.state === 'SPEAKING' && this.isPttActive) {
        this.interrupt();
      }
    } else if (vadResult.event === 'speech_end') {
      if (this.options.onSpeechEnd) {
        this.options.onSpeechEnd();
      }
    }

    // 3. Audio Gating: only transmit over WebSocket if PTT is ACTIVE and VAD detects SPEECH
    if (!this.isPttActive) {
      this.telemetry.framesGatedSilence++;
      return;
    }

    if (!vadResult.isSpeech) {
      this.telemetry.framesGatedSilence++;
      return;
    }

    // 4. Backpressure Protection: monitor bufferedAmount
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (this.ws.bufferedAmount > this.maxBufferBytes) {
      this.telemetry.framesDroppedBackpressure++;
      this.emitError({
        code: 'BUFFER_OVERFLOW',
        message: 'Dropping audio frame due to WebSocket transmission backpressure',
        fatal: false,
      });
      return;
    }

    // 5. Binary Transmission
    try {
      this.ws.send(arrayBuffer);
      this.telemetry.framesTransmitted++;
      this.telemetry.bytesTransmitted += arrayBuffer.byteLength;
      this.telemetry.speechDurationMs += (pcm.length / 16000) * 1000;
    } catch (err) {
      console.error('[SophiaLiveClient] Binary transmission error:', err);
    }
  }

  /**
   * Activates Push-to-Talk. Generates a stable turnId and transitions state to LISTENING.
   */
  public startPtt(): string {
    if (this.isPttActive) {
      return this.activeTurnId!;
    }

    this.isPttActive = true;
    this.activeTurnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.vadEngine.reset();

    this.transitionState('LISTENING', 'PTT activated');

    this.sendControl({
      type: 'START_PTT',
      turnId: this.activeTurnId,
      timestamp: Date.now(),
    });

    return this.activeTurnId;
  }

  /**
   * Deactivates Push-to-Talk. Signals turn completion and transitions state to THINKING.
   */
  public stopPtt(): void {
    if (!this.isPttActive) return;

    this.isPttActive = false;
    const turnId = this.activeTurnId;

    this.transitionState('THINKING', 'PTT released');

    if (turnId) {
      this.sendControl({
        type: 'STOP_PTT',
        turnId,
        timestamp: Date.now(),
      });
    }

    this.activeTurnId = null;
  }

  /**
   * Emits an INTERRUPT control frame to signal immediate client barge-in.
   */
  public interrupt(): void {
    if (this.options.onSpeechStart) {
      this.options.onSpeechStart();
    }
    this.transitionState('INTERRUPTED', 'Client barge-in interrupt');

    this.sendControl({
      type: 'INTERRUPT',
      turnId: this.activeTurnId || undefined,
    });
  }

  private sendControl(msg: ClientLiveMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (err) {
        console.error('[SophiaLiveClient] Failed to send control message:', err);
      }
    }
  }

  private handleServerMessage(data: any): void {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data) as ServerLiveMessage;
        switch (msg.type) {
          case 'SESSION_READY':
          case 'SESSION_RESUMED':
            this.currentSessionId = msg.sessionId;
            if (msg.conversationId) {
              this.activeConversationId = msg.conversationId;
            }
            break;
          case 'STATE_CHANGE':
            this.transitionState(msg.state, msg.reason);
            break;
          case 'ERROR':
            console.error('[SophiaLiveClient] Server error:', msg.code, msg.message);
            break;
        }
      } catch {
        /* ignore */
      }
    }
  }

  private transitionState(next: LiveModalityState, reason?: string): void {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    if (this.options.onStateChange) {
      this.options.onStateChange(next, prev);
    }
  }

  private emitError(error: LiveClientError): void {
    if (this.options.onError) {
      this.options.onError(error);
    }
  }

  public getState(): LiveModalityState {
    return this.state;
  }

  public getIsPttActive(): boolean {
    return this.isPttActive;
  }

  public getTelemetry(): AudioIngressTelemetry {
    return { ...this.telemetry };
  }

  public getVadEngine(): SileroVadEngine {
    return this.vadEngine;
  }

  /**
   * Cleans up all media stream tracks, audio contexts, and socket resources.
   */
  public destroy(): void {
    this.isDestroyed = true;
    this.stopPtt();

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
      this.audioContext = null;
    }

    if (this.workletBlobUrl && typeof URL !== 'undefined') {
      URL.revokeObjectURL(this.workletBlobUrl);
      this.workletBlobUrl = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
