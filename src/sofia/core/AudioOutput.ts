export class AudioOutput {
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private nextPlayTime = 0;
  private activeSourceNodes: AudioBufferSourceNode[] = [];
  private isPlaying = false;
  private onPlaybackStateChange?: (isPlaying: boolean) => void;
  private onLevelChange?: (level: number) => void;
  private sampleRate = 24000; // Gemini Live API default output rate
  private currentRms = 0;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    onPlaybackStateChange?: (isPlaying: boolean) => void,
    onLevelChange?: (level: number) => void
  ) {
    this.onPlaybackStateChange = onPlaybackStateChange;
    this.onLevelChange = onLevelChange;
  }

  async init(): Promise<boolean> {
    try {
      if (this.audioContext && this.audioContext.state !== 'closed') {
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
        return true;
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        console.warn('[AudioOutput] Web Audio API is not supported in this environment');
        return false;
      }

      // Try 24000Hz first for zero resampling overhead with Gemini Live, fallback to default hardware rate
      try {
        this.audioContext = new AudioCtx({ sampleRate: this.sampleRate });
      } catch {
        this.audioContext = new AudioCtx();
      }

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.5;

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1.0;

      // Connect: Sources -> analyserNode -> masterGain -> destination
      this.analyserNode.connect(this.masterGain);
      this.masterGain.connect(this.audioContext.destination);

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Unlock dummy 1-sample buffer to satisfy mobile / browser autoplay policies
      try {
        const unlockBuf = this.audioContext.createBuffer(1, 1, this.audioContext.sampleRate);
        const unlockSrc = this.audioContext.createBufferSource();
        unlockSrc.buffer = unlockBuf;
        unlockSrc.connect(this.audioContext.destination);
        unlockSrc.start(0);
      } catch {
        // ignore
      }

      return true;
    } catch (err) {
      console.warn('[AudioOutput] Failed to initialize AudioOutput context:', err);
      return false;
    }
  }

  async unlock(): Promise<void> {
    if (!this.audioContext) {
      await this.init();
      return;
    }
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('[AudioOutput] AudioContext resume failed:', e);
      }
    }
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  getPlaybackLevel(): number {
    return this.currentRms;
  }

  setVolume(vol: number) {
    if (this.masterGain && this.audioContext) {
      const clamped = Math.max(0, Math.min(1, vol));
      this.masterGain.gain.setValueAtTime(clamped, this.audioContext.currentTime);
    }
  }

  /**
   * Enqueues a raw 24kHz 16-bit PCM chunk from Gemini Live API.
   * Accepts base64 encoded string, Uint8Array, or ArrayBuffer.
   */
  queuePcmChunk(input: string | Uint8Array | ArrayBuffer): number {
    return this.playChunk(input);
  }

  /**
   * Primary method to schedule and play 24kHz PCM chunks with sample-accurate timing.
   */
  playChunk(input: string | Uint8Array | ArrayBuffer): number {
    if (!this.audioContext || !this.analyserNode) {
      void this.init().then(() => {
        if (this.audioContext && this.analyserNode) {
          this.playChunk(input);
        }
      });
      return 0;
    }

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }

    try {
      let bytes: Uint8Array;

      if (typeof input === 'string') {
        const binaryString = atob(input);
        const len = binaryString.length;
        bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
      } else if (input instanceof Uint8Array) {
        bytes = input;
      } else if (input instanceof ArrayBuffer) {
        bytes = new Uint8Array(input);
      } else {
        return 0;
      }

      const sampleCount = Math.floor(bytes.byteLength / 2);
      if (sampleCount === 0) return 0;

      // Endian-safe 16-bit signed PCM conversion
      const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
      const float32 = new Float32Array(sampleCount);
      let sum = 0;

      for (let i = 0; i < sampleCount; i++) {
        const sample16 = view.getInt16(i * 2, true); // Little endian
        const s = sample16 / 32768.0;
        float32[i] = s;
        if ((i & 7) === 0) sum += s * s;
      }

      // Calculate instantaneous RMS level for ripples/visualizer
      const rms = Math.min(1, Math.sqrt(sum / Math.max(1, sampleCount / 8)) * 3.2);
      this.currentRms = this.currentRms * 0.55 + rms * 0.45;
      this.onLevelChange?.(this.currentRms);

      // Clear any pending drain timeout since new audio has arrived
      if (this.drainTimer) {
        clearTimeout(this.drainTimer);
        this.drainTimer = null;
      }

      const audioBuffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyserNode);

      const now = this.audioContext.currentTime;
      let t: number;

      if (this.isPlaying && this.nextPlayTime > now) {
        // Continuous streaming: seamless sample-accurate chaining without artificial gaps!
        t = this.nextPlayTime;
      } else {
        // Starting fresh from silence, or recovering from buffer starvation:
        // Provide 50ms buffer lead time to absorb packet delivery jitter.
        t = now + 0.05;
      }

      source.start(t);
      this.nextPlayTime = t + audioBuffer.duration;

      this.activeSourceNodes.push(source);
      this.updatePlayingState(true);

      source.onended = () => {
        const index = this.activeSourceNodes.indexOf(source);
        if (index > -1) {
          this.activeSourceNodes.splice(index, 1);
        }
        if (this.activeSourceNodes.length === 0) {
          // Debounce queue empty state by 350ms so natural speech pauses and network packet gaps don't toggle isPlaying
          if (this.drainTimer) clearTimeout(this.drainTimer);
          this.drainTimer = setTimeout(() => {
            if (this.activeSourceNodes.length === 0) {
              this.currentRms = 0;
              this.onLevelChange?.(0);
              this.updatePlayingState(false);
              this.nextPlayTime = 0;
            }
          }, 350);
        }
      };

      return this.currentRms;
    } catch (e) {
      console.warn('[AudioOutput] Error queuing audio chunk:', e);
      return 0;
    }
  }

  /**
   * Stops all currently playing and queued audio immediately on interruption.
   */
  stopImmediately() {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    for (const source of this.activeSourceNodes) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // already stopped
      }
    }
    this.activeSourceNodes = [];
    if (this.audioContext) {
      this.nextPlayTime = this.audioContext.currentTime;
    } else {
      this.nextPlayTime = 0;
    }
    this.currentRms = 0;
    this.onLevelChange?.(0);
    this.updatePlayingState(false);

    // Also cancel standard SpeechSynthesis if active
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
  }

  private updatePlayingState(playing: boolean) {
    if (this.isPlaying !== playing) {
      this.isPlaying = playing;
      this.onPlaybackStateChange?.(playing);
    }
  }

  destroy() {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    this.stopImmediately();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }
    this.analyserNode = null;
    this.masterGain = null;
  }
}
