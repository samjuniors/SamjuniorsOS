/**
 * AudioEngine — real microphone capture + low-latency PCM playback.
 *
 * Capture: getUserMedia → AudioWorklet (with ScriptProcessor fallback) → 16 kHz PCM16 frames,
 * plus a smoothed RMS level stream that drives Sophia's listening ripples.
 *
 * Playback: 24 kHz PCM16 queue (Gemini Live native audio) with sample-accurate
 * scheduling and immediate interruption (flush + stop all sources).
 * Encoded audio (Deepgram/Gemini TTS mpeg/wav) is decoded via decodeAudioData.
 */

import { controlLayer } from '../control';
import { AudioOutput } from '../../core/AudioOutput';
import { scoreEngine } from './ScoreEngine';
import { userVoiceProfile } from '../../core/UserVoiceProfile';

type PCMHandler = (pcm: ArrayBuffer) => void;
type LevelHandler = (level: number) => void;
type MicStatusHandler = (status: MicStatus, errorMsg?: string) => void;

export type MicStatus = 'idle' | 'requesting' | 'capturing' | 'denied' | 'error';

const CAPTURE_WORKLET = `
class SophiCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(1024);
    this.len = 0;
    this.ratio = sampleRate / 16000;
    this.inputPos = 0;
    this.prevRms = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || ch.length === 0) return true;

    let sum = 0;
    let peak = 0;
    for (let i = 0; i < ch.length; i++) {
      const s = ch[i];
      sum += s * s;
      const abs = Math.abs(s);
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sum / ch.length);
    this.port.postMessage({ type: 'level', rms, peak });

    if (peak > 0.55 && this.prevRms < 0.045 && peak / Math.max(rms, 0.001) > 5.5) {
      this.port.postMessage({ type: 'clap', peak, rms });
    }
    this.prevRms = this.prevRms * 0.6 + rms * 0.4;

    let idx = this.inputPos;
    while (idx < ch.length - 1) {
      const i0 = Math.floor(idx);
      const frac = idx - i0;
      const s0 = ch[i0];
      const s1 = ch[i0 + 1];
      const sample = s0 + (s1 - s0) * frac;
      const v = Math.max(-1, Math.min(1, sample));
      this.buf[this.len++] = v < 0 ? v * 0x8000 : v * 0x7fff;

      if (this.len >= 640) {
        const chunk = new Int16Array(this.buf.subarray(0, 640));
        this.port.postMessage({ type: 'pcm', buffer: chunk.buffer }, [chunk.buffer]);
        this.len = 0;
      }
      idx += this.ratio;
    }
    this.inputPos = idx - ch.length;
    return true;
  }
}
registerProcessor('sophia-capture', SophiCapture);
`;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private captureNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private pcmHandlers = new Set<PCMHandler>();
  private levelHandlers = new Set<LevelHandler>();
  private playbackLevelHandlers = new Set<LevelHandler>();
  private playbackHandlers = new Set<() => void>();
  private playbackStartHandlers = new Set<() => void>();
  private clapHandlers = new Set<() => void>();
  private micStatusHandlers = new Set<MicStatusHandler>();
  private bargeInHandlers = new Set<() => void>();
  private lastClap = 0;
  private playRms = 0;
  private speechStreakMs = 0;
  private lastBargeCheck = performance.now();
  private output = new AudioOutput(
    (isPlaying) => {
      scoreEngine.setDucked(isPlaying);
      if (isPlaying) {
        this.playbackStartHandlers.forEach((fn) => fn());
      } else {
        this.playRms = 0;
        this.speechStreakMs = 0;
        this.playbackHandlers.forEach((fn) => fn());
      }
    },
    (level) => {
      this.playRms = level;
      this.playbackLevelHandlers.forEach((fn) => fn(level));
    }
  );
  
  capturing = false;
  micStatus: MicStatus = 'idle';
  micErrorDetails: string | null = null;

  onPCM(fn: PCMHandler): () => void {
    this.pcmHandlers.add(fn);
    return () => this.pcmHandlers.delete(fn);
  }
  onMicLevel(fn: LevelHandler): () => void {
    this.levelHandlers.add(fn);
    return () => this.levelHandlers.delete(fn);
  }
  onPlaybackLevel(fn: LevelHandler): () => void {
    this.playbackLevelHandlers.add(fn);
    return () => this.playbackLevelHandlers.delete(fn);
  }
  /** fires when the playback queue fully drains (natural end of utterance) */
  onPlaybackEnd(fn: () => void): () => void {
    this.playbackHandlers.add(fn);
    return () => this.playbackHandlers.delete(fn);
  }
  /** fires when audio playback begins on the output device */
  onPlaybackStart(fn: () => void): () => void {
    this.playbackStartHandlers.add(fn);
    return () => this.playbackStartHandlers.delete(fn);
  }
  onClap(fn: () => void): () => void {
    this.clapHandlers.add(fn);
    return () => this.clapHandlers.delete(fn);
  }
  onMicStatus(fn: MicStatusHandler): () => void {
    this.micStatusHandlers.add(fn);
    return () => this.micStatusHandlers.delete(fn);
  }
  onBargeIn(fn: () => void): () => void {
    this.bargeInHandlers.add(fn);
    return () => this.bargeInHandlers.delete(fn);
  }

  get isSpeaking(): boolean {
    return this.output.getIsPlaying() || this.playRms > 0.02;
  }

  private checkBargeIn() {
    if (!controlLayer.asrInterruption || !this.isSpeaking) {
      this.speechStreakMs = 0;
      this.lastBargeCheck = performance.now();
      return;
    }

    const now = performance.now();
    const dt = Math.min(100, Math.max(1, now - this.lastBargeCheck));
    this.lastBargeCheck = now;

    // Acoustic echo suppression:
    // When audio plays through speakers, mic picks up echo proportional to playRms.
    // True user speech directly in front of the mic must significantly exceed the echo.
    const dynamicThreshold = Math.max(0.48, this.playRms * 0.95 + 0.26);

    if (this._mic > dynamicThreshold) {
      this.speechStreakMs += dt;
      // Require 260ms of continuous human voice to confirm intentional interruption
      if (this.speechStreakMs >= 260) {
        this.speechStreakMs = 0;
        if (this.bargeInHandlers.size > 0) {
          this.bargeInHandlers.forEach((fn) => fn());
        } else {
          this.interruptPlayback();
        }
      }
    } else {
      this.speechStreakMs = Math.max(0, this.speechStreakMs - dt * 2.5);
    }
  }

  private setMicStatus(status: MicStatus, errorMsg?: string) {
    this.micStatus = status;
    this.micErrorDetails = errorMsg ?? null;
    this.micStatusHandlers.forEach((fn) => fn(status, errorMsg));
  }

  get micLevel(): number {
    return this._mic;
  }
  private _mic = 0;

  get playbackLevel(): number {
    return this.playRms;
  }

  async startCapture(): Promise<void> {
    if (this.capturing) return;
    this.setMicStatus('requesting');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = 'getUserMedia is not supported on this browser or origin';
      this.setMicStatus('error', err);
      throw new Error(err);
    }

    try {
      // Try high-quality voice constraints first, then basic audio
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (e) {
        console.warn('[AudioEngine] Advanced audio constraints failed, trying basic audio: true', e);
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      this.stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          this.setMicStatus('error', 'Microphone device was disconnected');
          this.stopCapture();
        };
      });

      this.ctx = new AudioContext();
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      const src = this.ctx.createMediaStreamSource(this.stream);
      const silenceGain = this.ctx.createGain();
      silenceGain.gain.value = 0; // Mute local speaker feedback so echo cancellation does not suppress user voice

      // Attempt AudioWorklet first, then fallback to ScriptProcessor
      let workletReady = false;
      if (typeof this.ctx.audioWorklet !== 'undefined') {
        const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }));
        try {
          await this.ctx.audioWorklet.addModule(url);
          this.captureNode = new AudioWorkletNode(this.ctx, 'sophia-capture', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
          });
          this.captureNode.port.onmessage = (e: MessageEvent) => {
            const d = e.data;
            if (d.type === 'pcm') {
              const b: ArrayBuffer = d.buffer;
              const int16 = new Int16Array(b);
              // Filter through UserVoiceProfile: gates out crowd and prevents hiccups during Sofia speech
              if (userVoiceProfile.shouldForwardChunk(int16, this.isSpeaking, controlLayer.asrInterruption, controlLayer.crowdFilterEnabled)) {
                this.pcmHandlers.forEach((fn) => fn(b));
              }
            } else if (d.type === 'level') {
              this._mic = this._mic * 0.72 + Math.min(1, d.rms * 5.5) * 0.28;
              this.levelHandlers.forEach((fn) => fn(this._mic));
              this.checkBargeIn();
            } else if (d.type === 'clap') {
              const now = performance.now();
              if (now - this.lastClap > 1400) {
                this.lastClap = now;
                this.clapHandlers.forEach((fn) => fn());
              }
            }
          };
          src.connect(this.captureNode);
          this.captureNode.connect(silenceGain);
          silenceGain.connect(this.ctx.destination);
          workletReady = true;
        } catch (err) {
          console.warn('[AudioEngine] AudioWorklet setup failed, falling back to ScriptProcessor:', err);
        } finally {
          URL.revokeObjectURL(url);
        }
      }

      if (!workletReady) {
        // Sample-accurate ScriptProcessorNode fallback
        const spNode = this.ctx.createScriptProcessor(4096, 1, 1);
        this.captureNode = spNode;
        const ratio = this.ctx.sampleRate / 16000;
        const pcmBuf = new Int16Array(1024);
        let pcmLen = 0;
        let inputPos = 0;
        let prevRms = 0;

        spNode.onaudioprocess = (e) => {
          const ch = e.inputBuffer.getChannelData(0);
          if (!ch || ch.length === 0) return;

          let sum = 0;
          let peak = 0;
          for (let i = 0; i < ch.length; i++) {
            const s = ch[i];
            sum += s * s;
            const abs = Math.abs(s);
            if (abs > peak) peak = abs;
          }
          const rms = Math.sqrt(sum / ch.length);
          this._mic = this._mic * 0.72 + Math.min(1, rms * 5.5) * 0.28;
          this.levelHandlers.forEach((fn) => fn(this._mic));
          this.checkBargeIn();

          if (peak > 0.55 && prevRms < 0.045 && peak / Math.max(rms, 0.001) > 5.5) {
            const now = performance.now();
            if (now - this.lastClap > 1400) {
              this.lastClap = now;
              this.clapHandlers.forEach((fn) => fn());
            }
          }
          prevRms = prevRms * 0.6 + rms * 0.4;

          let idx = inputPos;
          while (idx < ch.length - 1) {
            const i0 = Math.floor(idx);
            const frac = idx - i0;
            const s0 = ch[i0];
            const s1 = ch[i0 + 1];
            const sample = s0 + (s1 - s0) * frac;
            const v = Math.max(-1, Math.min(1, sample));
            pcmBuf[pcmLen++] = v < 0 ? v * 0x8000 : v * 0x7fff;

            if (pcmLen >= 640) {
              const chunk = new Int16Array(pcmBuf.subarray(0, 640));
              if (userVoiceProfile.shouldForwardChunk(chunk, this.isSpeaking, controlLayer.asrInterruption, controlLayer.crowdFilterEnabled)) {
                this.pcmHandlers.forEach((fn) => fn(chunk.buffer));
              }
              pcmLen = 0;
            }
            idx += ratio;
          }
          inputPos = idx - ch.length;
        };
        src.connect(spNode);
        spNode.connect(silenceGain);
        silenceGain.connect(this.ctx.destination);
      }

      this.capturing = true;
      this.setMicStatus('capturing');
    } catch (err: any) {
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || (err.message && err.message.toLowerCase().includes('permission denied'));
      if (isDenied) {
        console.warn('[AudioEngine] Microphone permission status: Permission denied');
      } else {
        console.error('[AudioEngine] Microphone error:', err);
      }
      const status: MicStatus = isDenied ? 'denied' : 'error';
      this.setMicStatus(status, isDenied ? 'Microphone permission denied by browser or user' : (err.message || 'Microphone access error'));
      this.stopCapture();
      throw err;
    }
  }

  stopCapture() {
    this.capturing = false;
    this.captureNode?.disconnect();
    this.captureNode = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this._mic = 0;
    if (this.micStatus !== 'denied' && this.micStatus !== 'error') {
      this.setMicStatus('idle');
    }
  }

  /* ------------------------------ playback ------------------------------ */

  async unlockAudio(): Promise<void> {
    await this.output.init();
    await this.output.unlock();
    void scoreEngine.unlock();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // ignore
      }
    }
  }

  /** Queue a 24 kHz PCM16 chunk (Gemini Live native audio). Returns its RMS level. */
  playPCM24(input: ArrayBuffer | Uint8Array | string): number {
    return this.output.playChunk(input);
  }

  /** Play an encoded buffer (mpeg/wav…) — used by TTS fallback paths. */
  async playEncoded(data: ArrayBuffer): Promise<void> {
    await this.output.init();
    const ctx = this.output.getAudioContext();
    if (ctx && ctx.state !== 'closed') {
      try {
        const buf = await ctx.decodeAudioData(data.slice(0));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const analyser = this.output.getAnalyserNode();
        if (analyser) {
          src.connect(analyser);
        } else {
          src.connect(ctx.destination);
        }
        const now = ctx.currentTime;
        src.start(now + 0.02);
        return;
      } catch {
        /* If decodeAudioData fails (raw PCM), play directly through AudioOutput */
      }
    }
    this.output.playChunk(data);
  }

  /** Barge-in: kill everything that is playing or queued. Immediately. */
  interruptPlayback() {
    this.output.stopImmediately();
    this.playRms = 0;
    this.playbackLevelHandlers.forEach((fn) => fn(0));
  }

  dispose() {
    this.stopCapture();
    this.interruptPlayback();
    this.output.destroy();
  }
}
