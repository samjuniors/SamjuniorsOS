export class AudioInput {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private onAudioChunkCallback: ((pcm16Base64: string, rawFloat: Float32Array) => void) | null = null;
  private isCapturing = false;

  async init(onChunk?: (pcm16Base64: string, rawFloat: Float32Array) => void): Promise<boolean> {
    this.onAudioChunkCallback = onChunk || null;
    try {
      // Constraints requested for optimal voice isolation
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: 1,
          sampleRate: 16000
        }
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Create an audio context matching mic rate
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 16000 });
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Analyser for real-time visualization and VAD
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.6;

      // ScriptProcessor for 16kHz PCM chunk extraction (512 or 2048 buffer)
      this.scriptProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.scriptProcessor);
      // Connect to destination via silent gain to keep scriptProcessor alive in Chrome
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;
      this.scriptProcessor.connect(silentGain);
      silentGain.connect(this.audioContext.destination);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.isCapturing) return;
        const inputBuffer = e.inputBuffer.getChannelData(0);
        const pcm16 = this.floatTo16BitPCM(inputBuffer);
        const base64 = this.pcmToBase64(pcm16);
        if (this.onAudioChunkCallback) {
          this.onAudioChunkCallback(base64, inputBuffer);
        }
      };

      this.isCapturing = true;
      return true;
    } catch (err) {
      console.warn('Microphone access could not be initialized:', err);
      return false;
    }
  }

  setCapturing(enabled: boolean) {
    this.isCapturing = enabled;
  }

  getIsCapturing(): boolean {
    return this.isCapturing;
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  private pcmToBase64(pcm16: Int16Array): string {
    const bytes = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  destroy() {
    this.isCapturing = false;
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
