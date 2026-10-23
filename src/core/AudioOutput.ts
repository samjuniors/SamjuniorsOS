export class AudioOutput {
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private nextPlayTime = 0;
  private activeSourceNodes: AudioBufferSourceNode[] = [];
  private isPlaying = false;
  private onPlaybackStateChange?: (isPlaying: boolean) => void;
  private sampleRate = 24000; // Gemini Live API default output rate

  constructor(onPlaybackStateChange?: (isPlaying: boolean) => void) {
    this.onPlaybackStateChange = onPlaybackStateChange;
  }

  async init(): Promise<boolean> {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: this.sampleRate });

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.5;

      this.analyserNode.connect(this.audioContext.destination);

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      return true;
    } catch (err) {
      console.warn('Failed to initialize AudioOutput context:', err);
      return false;
    }
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Enqueues a base64 encoded raw 24kHz PCM chunk from Gemini Live API.
   */
  queuePcmChunk(base64Pcm: string) {
    if (!this.audioContext || !this.analyserNode) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    try {
      const binaryString = atob(base64Pcm);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 16-bit signed PCM
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      const audioBuffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyserNode);

      const now = this.audioContext.currentTime;
      if (this.nextPlayTime < now) {
        this.nextPlayTime = now + 0.02; // tiny safety buffer to prevent glitch
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;

      this.activeSourceNodes.push(source);
      this.updatePlayingState(true);

      source.onended = () => {
        const index = this.activeSourceNodes.indexOf(source);
        if (index > -1) {
          this.activeSourceNodes.splice(index, 1);
        }
        if (this.activeSourceNodes.length === 0) {
          this.updatePlayingState(false);
          this.nextPlayTime = 0;
        }
      };
    } catch (e) {
      console.warn('Error queuing audio chunk:', e);
    }
  }

  /**
   * Stops all currently playing and queued audio immediately on interruption.
   */
  stopImmediately() {
    for (const source of this.activeSourceNodes) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // already stopped
      }
    }
    this.activeSourceNodes = [];
    this.nextPlayTime = 0;
    this.updatePlayingState(false);

    // Also cancel standard SpeechSynthesis if active
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
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
    this.stopImmediately();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
