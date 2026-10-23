import { AudioMetrics } from '../types/sofia';
import { NoiseSuppression } from './NoiseSuppression';
import { SpeakerFocus } from './SpeakerFocus';

export interface VADCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: (speechDurationMs: number) => void;
  onMetrics?: (metrics: AudioMetrics) => void;
  onTransientNoise?: (type: string) => void;
}

export class VoiceActivityDetection {
  private noiseSuppression = new NoiseSuppression();
  private speakerFocus = new SpeakerFocus();
  private isSpeaking = false;
  private speechStartTime = 0;
  private lastSpeechTime = 0;
  private minSpeechDurationMs = 280; // filter out tiny accidental bursts/coughs (< 280ms)
  private hangoverMs = 850; // allow natural pauses in conversational flow
  private callbacks: VADCallbacks = {};
  private sensitivity = 0.55;

  constructor(callbacks?: VADCallbacks) {
    if (callbacks) this.callbacks = callbacks;
  }

  setCallbacks(callbacks: VADCallbacks) {
    this.callbacks = callbacks;
  }

  setSensitivity(val: number) {
    this.sensitivity = Math.max(0.1, Math.min(1.0, val));
  }

  processFrame(timeData: Float32Array, freqData: Uint8Array, sampleRate: number = 16000) {
    // 1. Calculate RMS & Peak
    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = Math.abs(timeData[i]);
      if (v > peak) peak = v;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / timeData.length);

    // 2. Track background noise floor
    const noiseFloor = this.noiseSuppression.updateNoiseFloor(rms);

    // 3. Speaker Focus analysis
    const analysis = this.speakerFocus.analyzeVoicePresence(freqData, sampleRate, rms);

    // Dynamic threshold adjusted by sensitivity
    const thresholdMultiplier = 1.6 + (1 - this.sensitivity) * 1.5;
    const isAboveNoise = rms > noiseFloor * thresholdMultiplier && rms > 0.015;
    const isSpeechCandidate = isAboveNoise && analysis.isHumanSpeech;

    const now = Date.now();

    if (isSpeechCandidate) {
      this.lastSpeechTime = now;
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.speechStartTime = now;
        this.callbacks.onSpeechStart?.();
      }
    } else if (this.isSpeaking) {
      // Check if silence hangover duration elapsed
      const timeSinceSpeech = now - this.lastSpeechTime;
      if (timeSinceSpeech >= this.hangoverMs) {
        const totalDuration = this.lastSpeechTime - this.speechStartTime;
        this.isSpeaking = false;

        // Filter out tiny transient noises (e.g. sharp cough, microphone bump)
        if (totalDuration >= this.minSpeechDurationMs) {
          this.callbacks.onSpeechEnd?.(totalDuration);
        } else {
          this.callbacks.onTransientNoise?.(analysis.soundType);
        }
      }
    }

    if (this.callbacks.onMetrics) {
      this.callbacks.onMetrics({
        rms,
        peak,
        lowEnergy: analysis.lowBand,
        midEnergy: analysis.midBand,
        highEnergy: analysis.highBand,
        speechScore: analysis.speechScore,
        isSpeech: this.isSpeaking,
        dominantFrequency: analysis.dominantFreq,
        noiseFloor,
        isClap: false
      });
    }
  }

  reset() {
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.lastSpeechTime = 0;
  }
}
