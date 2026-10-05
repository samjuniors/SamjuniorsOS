/**
 * ============================================================================
 * VOICE PLAYBACK ENGINE (PHASE 3 — SofiaUI voice runtime)
 * ============================================================================
 * Spoken-output engine for the voice presence. Adapted from SofiaUI @ commit
 * 9e88dee src/core/AudioOutput.ts (one-way reference port; the SofiaUI
 * repository remains independent).
 *
 * What is kept from SofiaUI's AudioOutput:
 *   - The Web Audio graph: sources -> AnalyserNode -> GainNode -> destination.
 *   - Sample-accurate seamless chaining via `nextPlayTime` with a 50ms
 *     lead when starting from silence (packet-jitter absorption).
 *   - The 350ms drain debounce: natural speech pauses between sentences do
 *     not toggle playback state; `onDrained` fires once playback has truly
 *     settled (SofiaUI's response_finished trigger).
 *   - `stopImmediately()` interruption semantics: nulled `onended` handlers
 *     BEFORE stop, so scheduled-but-unstarted sources die silently and the
 *     engine never reports drain after an interrupt.
 *   - Level metering math: every-8th-sample RMS with a 0.55/0.45 EMA —
 *     computed from the decoded channel data at schedule time (SofiaUI
 *     computes it from PCM chunks; the destination fetches complete
 *     per-sentence audio files instead, so the metering moved to decode time).
 *   - The autoplay-policy unlock buffer.
 *
 * What is adapted for the destination architecture:
 *   - Input is per-sentence ENCODED audio (audio/wav or audio/mpeg) from the
 *     founder-gated /api/sofia/tts provider ladder — not 24kHz PCM chunks —
 *     so buffers go through `decodeAudioData` before scheduling (the
 *     AudioContext resamples decoded buffers to its own rate automatically).
 *   - The single `onDrained` callback replaces SofiaUI's playback-state
 *     change pair; the voice runtime maps it to its speaking-overlay settle.
 *
 * This engine owns PLAYBACK only. Capture, STT, turn execution and auth stay
 * with the existing live-voice stack (see voiceRuntime.ts for the contract).
 */

export interface VoicePlaybackEngineOptions {
  /** Fired once after the last scheduled source has ended AND 350ms of quiet
   *  have passed — the "response finished" signal. Not fired for
   *  stopImmediately()/destroy() (those are intentional cuts, not drains). */
  onDrained?: () => void;
  /** Real-time playback level (0..1, EMA-smoothed) for the orb. */
  onLevel?: (level: number) => void;
}

export class VoicePlaybackEngine {
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private nextPlayTime = 0;
  private activeSourceNodes: AudioBufferSourceNode[] = [];
  private isPlaying = false;
  private currentRms = 0;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private readonly options: VoicePlaybackEngineOptions;

  constructor(options: VoicePlaybackEngineOptions = {}) {
    this.options = options;
  }

  /** Lazily creates (or resumes) the AudioContext + graph. Returns false when
   *  Web Audio is unavailable — callers treat that as "no spoken output". */
  public async init(): Promise<boolean> {
    if (this.isDestroyed) return false;
    try {
      if (this.audioContext && this.audioContext.state !== 'closed') {
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
        return true;
      }

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        console.warn('[VoicePlaybackEngine] Web Audio API is not supported');
        return false;
      }

      this.audioContext = new AudioCtx();

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.5;

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1.0;

      // Connect: Sources -> analyser -> masterGain -> destination (SofiaUI graph)
      this.analyserNode.connect(this.masterGain);
      this.masterGain.connect(this.audioContext.destination);

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Unlock: 1-sample buffer satisfies mobile/autoplay policies (SofiaUI).
      try {
        const unlockBuf = this.audioContext.createBuffer(1, 1, this.audioContext.sampleRate);
        const unlockSrc = this.audioContext.createBufferSource();
        unlockSrc.buffer = unlockBuf;
        unlockSrc.connect(this.audioContext.destination);
        unlockSrc.start(0);
      } catch {
        // ignore — policy unlock is best-effort
      }

      return true;
    } catch (err) {
      console.warn('[VoicePlaybackEngine] Failed to initialize AudioContext:', err);
      return false;
    }
  }

  public isReady(): boolean {
    return !!this.audioContext && this.audioContext.state !== 'closed';
  }

  public isBusy(): boolean {
    return this.isPlaying;
  }

  /** True while sources are scheduled/playing or a drain is pending — the
   *  runtime uses this to close the settle edge-case where every scheduled
   *  sentence already drained while a later fetch failed. */
  public hasActiveAudio(): boolean {
    return this.activeSourceNodes.length > 0 || this.drainTimer !== null;
  }

  /** Real-time EMA playback level (0..1) — the orb's speaking amplitude. */
  public getPlaybackLevel(): number {
    return this.currentRms;
  }

  public setVolume(vol: number): void {
    if (this.masterGain && this.audioContext) {
      const clamped = Math.max(0, Math.min(1, vol));
      this.masterGain.gain.setValueAtTime(clamped, this.audioContext.currentTime);
    }
  }

  /**
   * Decodes an encoded utterance (audio/wav or audio/mpeg from the TTS
   * ladder) and schedules it on the seamless chain. Returns the scheduled
   * duration (0 when nothing could be scheduled — callers decide whether a
   * system-voice fallback is warranted for the sentence).
   */
  public async playEncoded(buffer: ArrayBuffer): Promise<number> {
    if (this.isDestroyed) return 0;
    if (!this.audioContext || !this.analyserNode) {
      const ok = await this.init();
      if (!ok || !this.audioContext || !this.analyserNode) return 0;
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => undefined);
    }

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await this.audioContext.decodeAudioData(buffer);
    } catch (err) {
      console.warn('[VoicePlaybackEngine] Failed to decode TTS audio:', err);
      return 0;
    }

    return this.scheduleDecoded(audioBuffer);
  }

  /** Schedules a decoded buffer on the sample-accurate chain (SofiaUI playChunk
   *  scheduling, adapted to decoded buffers). */
  private scheduleDecoded(audioBuffer: AudioBuffer): number {
    if (!this.audioContext || !this.analyserNode) return 0;

    try {
      // SofiaUI metering math: every-8th-sample RMS + EMA — computed from the
      // decoded channel data at schedule time.
      const channel = audioBuffer.getChannelData(0);
      const n = channel.length;
      let sum = 0;
      for (let i = 0; i < n; i += 8) {
        const s = channel[i];
        sum += s * s;
      }
      const rms = Math.min(1, Math.sqrt(sum / Math.max(1, n / 8)) * 3.2);
      this.currentRms = this.currentRms * 0.55 + rms * 0.45;
      this.options.onLevel?.(this.currentRms);

      // New audio cancels any pending drain (SofiaUI).
      if (this.drainTimer) {
        clearTimeout(this.drainTimer);
        this.drainTimer = null;
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyserNode);

      const now = this.audioContext.currentTime;
      let t: number;
      if (this.isPlaying && this.nextPlayTime > now) {
        // Continuous chaining: seamless, no artificial gaps (SofiaUI).
        t = this.nextPlayTime;
      } else {
        // Fresh from silence: 50ms lead absorbs decode/fetch jitter (SofiaUI).
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
          // 350ms drain debounce: natural pauses and inter-sentence fetch
          // gaps do not toggle playback state (SofiaUI).
          if (this.drainTimer) clearTimeout(this.drainTimer);
          this.drainTimer = setTimeout(() => {
            if (this.activeSourceNodes.length === 0) {
              this.currentRms = 0;
              this.options.onLevel?.(0);
              this.updatePlayingState(false);
              this.nextPlayTime = 0;
              this.options.onDrained?.();
            }
          }, 350);
        }
      };

      return audioBuffer.duration;
    } catch (err) {
      console.warn('[VoicePlaybackEngine] Failed to schedule audio:', err);
      return 0;
    }
  }

  /**
   * Stops all currently playing and scheduled audio immediately
   * (SofiaUI stopImmediately semantics — an intentional cut, NOT a drain:
   * onDrained is not fired).
   */
  public stopImmediately(): void {
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
    this.options.onLevel?.(0);
    this.updatePlayingState(false);

    // Also cancel standard SpeechSynthesis if the system-voice fallback
    // is mid-sentence (SofiaUI does the same in stopImmediately).
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
  }

  private updatePlayingState(playing: boolean): void {
    if (this.isPlaying !== playing) {
      this.isPlaying = playing;
    }
  }

  /** Full teardown. One-shot (AudioContext.close); safe to call twice. */
  public destroy(): void {
    this.isDestroyed = true;
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    this.stopImmediately();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        void this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }
    this.analyserNode = null;
    this.masterGain = null;
  }
}
