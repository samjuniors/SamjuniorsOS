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
  private maxPreRollFrames: number;
  private preRollBuffer: ArrayBuffer[] = [];
  private isDestroyed = false;

  constructor(options: SophiaLiveClientOptions = {}) {
    this.options = options;
    this.activeConversationId = options.conversationId || null;
    this.maxBufferBytes = options.maxBufferBytes || 65_536; // 64 KB max buffer
    this.maxPreRollFrames = typeof options.preRollFrames === 'number' ? options.preRollFrames : 4; // 128ms

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
          // Phase 3 (SofiaUI voice runtime): surface unintended transport
          // loss so the bridge/runtime can reconnect. Intentional teardown
          // (destroy()) is excluded — isDestroyed is set before ws.close().
          if (!this.isDestroyed) {
            this.options.onDisconnect?.(event.code);
            this.emitError({
              code: 'WEBSOCKET_DISCONNECTED',
              message: `Live session connection lost (code ${event.code})`,
              fatal: false,
            });
          }
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
      // Phase 5 (parity, area 1): a fatal acquisition failure must not look
      // like success — the bridge's connect path decides session fate from
      // whether this throws (the worklet-failure path below already throws).
      throw new Error('navigator.mediaDevices.getUserMedia is not supported by this browser');
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

      // Phase 3 (SofiaUI voice runtime): device-loss detection — a capture
      // track that ends mid-session (device unplugged / hot-swapped) is a
      // fatal capture error, not silent capture death. The bridge/runtime
      // own the explicit session cleanup that follows.
      for (const track of this.mediaStream.getAudioTracks()) {
        track.addEventListener('ended', () => {
          if (this.isDestroyed) return;
          this.emitError({
            code: 'MIC_NOT_FOUND',
            message: 'Microphone device was disconnected',
            fatal: true,
          });
        });
      }
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

      // Handle PCM frames and level metering emitted by the AudioWorklet
      this.workletNode.port.onmessage = (event) => {
        if (event.data && event.data.type === 'pcm_chunk') {
          this.handlePcmChunk(event.data.pcm);
        } else if (event.data && event.data.type === 'mic_level') {
          // Phase 3: worklet RMS/peak metering (SofiaUI AudioEngine math)
          // — real mic amplitude for the voice-presence orb.
          if (this.options.onMicLevel) {
            this.options.onMicLevel(event.data.rms, event.data.peak);
          }
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

    // 3. Audio Gating & Pre-Roll: retain rolling buffer of recent frames to reduce first-phoneme clipping
    if (!this.isPttActive) {
      if (this.maxPreRollFrames > 0) {
        this.pushPreRollFrame(arrayBuffer);
      }
      this.telemetry.framesGatedSilence++;
      return;
    }

    if (!vadResult.isSpeech) {
      if (this.maxPreRollFrames > 0) {
        this.pushPreRollFrame(arrayBuffer);
      }
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

    // 5. Pre-Roll Flush on Speech Start: transmit recent buffered frames prior to live speech
    if (vadResult.event === 'speech_start' && this.preRollBuffer.length > 0) {
      for (const preRollChunk of this.preRollBuffer) {
        if (this.ws.bufferedAmount <= this.maxBufferBytes) {
          try {
            this.ws.send(preRollChunk);
            this.telemetry.framesTransmitted++;
            this.telemetry.bytesTransmitted += preRollChunk.byteLength;
            this.telemetry.speechDurationMs += (preRollChunk.byteLength / 2 / 16000) * 1000;
          } catch (err) {
            console.error('[SophiaLiveClient] Failed to flush pre-roll chunk:', err);
          }
        }
      }
      this.preRollBuffer = [];
    }

    // 6. Binary Transmission of current active frame
    try {
      this.ws.send(arrayBuffer);
      this.telemetry.framesTransmitted++;
      this.telemetry.bytesTransmitted += arrayBuffer.byteLength;
      this.telemetry.speechDurationMs += (pcm.length / 16000) * 1000;
    } catch (err) {
      console.error('[SophiaLiveClient] Binary transmission error:', err);
    }
  }

  private pushPreRollFrame(arrayBuffer: ArrayBuffer | SharedArrayBuffer): void {
    const copy = arrayBuffer.slice(0) as ArrayBuffer;
    this.preRollBuffer.push(copy);
    while (this.preRollBuffer.length > this.maxPreRollFrames) {
      this.preRollBuffer.shift();
    }
  }

  /**
   * Activates Push-to-Talk. Transitions state to LISTENING and returns the
   * active turnId.
   *
   * Phase 3 (SofiaUI voice runtime): accepts the CALLER-OWNED turnId (the
   * bridge's `voice_turn_*` id). The caller-owned id makes interim/final
   * transcripts match the osStore's activeTurnId guard (fixing the dropped
   * interim captions) and lets STOP_PTT/INTERRUPT gate precisely on the
   * server side. When absent (legacy callers/tests) a local id is minted as
   * before.
   */
  public startPtt(turnId?: string): string {
    if (this.isPttActive) {
      return this.activeTurnId!;
    }

    this.isPttActive = true;
    this.activeTurnId =
      typeof turnId === 'string' && turnId.trim().length > 0
        ? turnId.trim()
        : `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    this.preRollBuffer = [];

    if (turnId) {
      this.sendControl({
        type: 'STOP_PTT',
        turnId,
        timestamp: Date.now(),
      });
    }

    // Phase 3: activeTurnId is deliberately RETAINED after release — a
    // THINKING-phase INTERRUPT carries it to the server so the in-flight
    // canonical turn can be identified and cancelled. It is replaced by the
    // next startPtt().
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
          case 'TRANSCRIPT_INTERIM':
            if (this.options.onTranscriptInterim) {
              this.options.onTranscriptInterim(msg.turnId, msg.text);
            }
            break;
          case 'TRANSCRIPT_FINAL':
            if (this.options.onTranscriptFinal) {
              this.options.onTranscriptFinal(msg.turnId, msg.text);
            }
            break;
          case 'SOPHIA_RESPONSE':
            if (this.options.onSophiaResponse) {
              this.options.onSophiaResponse(msg);
            }
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

  /** Phase 3: true while the capture stream holds at least one live track. */
  public isCapturing(): boolean {
    return (
      !!this.mediaStream &&
      this.mediaStream.getTracks().some((t) => t.readyState === 'live')
    );
  }

  /** Phase 3: deviceId of the active capture track (for device-change
   *  detection); null when not capturing or settings are unavailable. */
  public getActiveMicDeviceId(): string | null {
    const track = this.mediaStream?.getAudioTracks()[0];
    if (!track) return null;
    try {
      return track.getSettings?.().deviceId ?? null;
    } catch {
      return null;
    }
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
    this.preRollBuffer = [];

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
