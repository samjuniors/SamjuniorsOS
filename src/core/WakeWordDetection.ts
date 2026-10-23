import { WakeSettings } from '../types/sofia';

export type WakeTrigger = 'wake-word' | 'clap' | 'tap';

export interface WakeWordCallbacks {
  onWake: (trigger: WakeTrigger, transcript?: string) => void;
  onClapDetected?: () => void;
  onWakeWordHeard?: (transcript: string) => void;
}

export class WakeWordDetection {
  private settings: WakeSettings = {
    wakeWordEnabled: true,
    clapGestureEnabled: true,
    tapEnabled: true,
    sensitivity: 0.6,
    clapThreshold: 0.35
  };

  private callbacks: WakeWordCallbacks;
  private speechRecognition: any = null;
  private isListeningForWakeWord = false;
  private isPaused = false;
  private lastClapTime = 0;
  private lastWakeTime = 0;
  private coolDownMs = 1200; // prevent repeated double triggers

  constructor(callbacks: WakeWordCallbacks, initialSettings?: Partial<WakeSettings>) {
    this.callbacks = callbacks;
    if (initialSettings) {
      this.settings = { ...this.settings, ...initialSettings };
    }
    this.initSpeechRecognition();
  }

  setPaused(paused: boolean) {
    this.isPaused = paused;
  }

  getIsPaused(): boolean {
    return this.isPaused;
  }

  updateSettings(newSettings: Partial<WakeSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    if (!this.settings.wakeWordEnabled && this.isListeningForWakeWord) {
      this.stopWakeWordRecognizer();
    } else if (this.settings.wakeWordEnabled && !this.isListeningForWakeWord) {
      this.startWakeWordRecognizer();
    }
  }

  getSettings(): WakeSettings {
    return { ...this.settings };
  }

  private initSpeechRecognition() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Browser SpeechRecognition not available for client wake-word.');
      return;
    }

    try {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = 'en-AU'; // Australian English for Sofia

      this.speechRecognition.onresult = (event: any) => {
        if (!this.settings.wakeWordEnabled) return;
        const results = event.results;
        for (let i = event.resultIndex; i < results.length; i++) {
          const transcript = results[i][0].transcript.trim().toLowerCase();
          this.callbacks.onWakeWordHeard?.(transcript);

          // Strict wake word matching:
          // Must explicitly say "Hey Sofia", "Hi Sofia", "Hello Sofia", "Wake up [Sofia]",
          // or start directly with "Sofia" at the beginning of the sentence.
          // Never triggers on casual conversation containing "sofia" as a mid-sentence word.
          const isWakeMatch =
            /\b(hey|hi|hello)\s+(sofia|sophia)\b/i.test(transcript) ||
            /\bwake\s*up(\s+(sofia|sophia))?\b/i.test(transcript) ||
            /^(sofia|sophia)\b/i.test(transcript);

          if (isWakeMatch) {
            this.handleWake('wake-word', transcript);
            break;
          }
        }
      };

      this.speechRecognition.onerror = (e: any) => {
        // ignore benign recognition interruptions
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.debug('Wake word recognizer event:', e.error);
        }
      };

      this.speechRecognition.onend = () => {
        // Automatically restart if wake word is still enabled
        if (this.isListeningForWakeWord && this.settings.wakeWordEnabled) {
          try {
            this.speechRecognition.start();
          } catch (e) {
            // Already started or suspended
          }
        }
      };
    } catch (e) {
      console.warn('Could not initialize SpeechRecognition for wake word:', e);
    }
  }

  startWakeWordRecognizer() {
    if (!this.speechRecognition || !this.settings.wakeWordEnabled) return;
    this.isListeningForWakeWord = true;
    try {
      this.speechRecognition.start();
    } catch (e) {
      // Ignored if already started
    }
  }

  stopWakeWordRecognizer() {
    this.isListeningForWakeWord = false;
    if (this.speechRecognition) {
      try {
        this.speechRecognition.stop();
      } catch (e) {
        // Ignored
      }
    }
  }

  /**
   * Fast physical clap detector running on raw audio frames.
   * Claps exhibit sharp impulse rise (< 6ms), high crest factor (> 4.0), and rapid decay.
   * Completely disabled while Sofia is paused.
   */
  processFrameForClap(timeData: Float32Array): boolean {
    if (this.isPaused || !this.settings.clapGestureEnabled) return false;

    let peak = 0;
    let sum = 0;
    const len = timeData.length;

    for (let i = 0; i < len; i++) {
      const absVal = Math.abs(timeData[i]);
      if (absVal > peak) peak = absVal;
      sum += absVal;
    }

    const mean = sum / len;
    const crestFactor = mean > 0.001 ? peak / mean : 0;

    // Clap criterion: sudden peak exceeding threshold with high peak-to-average crest factor
    const threshold = this.settings.clapThreshold * (1.2 - this.settings.sensitivity * 0.4);
    if (peak > threshold && crestFactor > 3.8) {
      const now = Date.now();
      if (now - this.lastClapTime > 600) {
        this.lastClapTime = now;
        this.callbacks.onClapDetected?.();
        this.handleWake('clap');
        return true;
      }
    }
    return false;
  }

  triggerTapWake() {
    if (!this.settings.tapEnabled) return;
    this.handleWake('tap');
  }

  private handleWake(trigger: WakeTrigger, transcript?: string) {
    // If paused, reject clap triggers to prevent environmental noise from waking Sofia
    if (this.isPaused && trigger === 'clap') {
      return;
    }

    const now = Date.now();
    if (now - this.lastWakeTime < this.coolDownMs) {
      return;
    }
    this.lastWakeTime = now;
    this.callbacks.onWake(trigger, transcript);
  }

  destroy() {
    this.stopWakeWordRecognizer();
    this.speechRecognition = null;
  }
}
