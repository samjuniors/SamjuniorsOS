import { AudioOutput } from './AudioOutput';
import { VoiceActivityDetection } from './VoiceActivityDetection';

export interface InterruptionCallbacks {
  onInterrupt: () => void;
}

export class InterruptionManager {
  private isSofiaSpeaking = false;
  private audioOutput: AudioOutput;
  private callbacks: InterruptionCallbacks;
  private speechStartTimestamp = 0;
  private minInterruptionDurationMs = 140; // confirm human utterance rather than tiny click

  constructor(audioOutput: AudioOutput, callbacks: InterruptionCallbacks) {
    this.audioOutput = audioOutput;
    this.callbacks = callbacks;
  }

  setSofiaSpeaking(speaking: boolean) {
    this.isSofiaSpeaking = speaking;
    if (!speaking) {
      this.speechStartTimestamp = 0;
    }
  }

  getIsSofiaSpeaking(): boolean {
    return this.isSofiaSpeaking;
  }

  /**
   * Called when VAD detects human speech onset.
   */
  handleUserSpeechDetected(isHumanSpeech: boolean, rms: number) {
    if (!this.isSofiaSpeaking) return;

    if (isHumanSpeech && rms > 0.02) {
      const now = Date.now();
      if (!this.speechStartTimestamp) {
        this.speechStartTimestamp = now;
      } else if (now - this.speechStartTimestamp >= this.minInterruptionDurationMs) {
        // Confirmed natural interruption!
        this.triggerInterruption();
      }
    } else {
      this.speechStartTimestamp = 0;
    }
  }

  triggerInterruption() {
    this.speechStartTimestamp = 0;
    this.isSofiaSpeaking = false;
    // Halt audio immediately
    this.audioOutput.stopImmediately();
    // Notify coordinator
    this.callbacks.onInterrupt();
  }
}
