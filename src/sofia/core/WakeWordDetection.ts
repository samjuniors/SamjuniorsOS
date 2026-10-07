import type { WakeSettings } from '../types/sofia.ts';

export type WakeTrigger = 'wake-word' | 'clap' | 'tap';

export interface WakeWordCallbacks {
  onWake: (trigger: WakeTrigger) => void;
  onClapDetected?: () => void;
  onWakeWordHeard?: (transcript: string) => void;
}

/** Phrases that wake her, in priority order. Lower-cased substring match. */
export const DEFAULT_WAKE_WORDS = [
  'hey sofia',
  'hey sophia',
  'hi sofia',
  'hi sophia',
  'hello sofia',
  'hello sophia',
  'sofia',
  'sophia',
];

const WAKE_PREF_KEY = 'sophia:wake:v1';

/**
 * Pure wake-word matcher. Matches if any configured phrase appears as a
 * whole-word-ish substring of the (already lower-cased, trimmed) transcript.
 * Exported so it's unit-tested independently of the browser recognizer.
 */
export function matchesWakeWord(transcript: string, wakeWords: string[] = DEFAULT_WAKE_WORDS): string | null {
  const t = transcript.toLowerCase().trim();
  if (!t) return null;
  for (const w of wakeWords) {
    const phrase = w.toLowerCase().trim();
    if (!phrase) continue;
    const idx = t.indexOf(phrase);
    if (idx === -1) continue;
    // Require the phrase to sit on word boundaries so "asofia" doesn't fire.
    const before = idx > 0 ? t[idx - 1] : ' ';
    const after = idx + phrase.length < t.length ? t[idx + phrase.length] : ' ';
    if (/[\s,.!?]/.test(before) && /[\s,.!?]/.test(after)) return phrase;
  }
  return null;
}

/** Load persisted wake settings (survives reload); never throws. */
export function loadWakePrefs(): Partial<WakeSettings> {
  try {
    const raw = localStorage.getItem(WAKE_PREF_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveWakePrefs(settings: Partial<WakeSettings>) {
  try {
    localStorage.setItem(WAKE_PREF_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

export class WakeWordDetection {
  private settings: WakeSettings = {
    wakeWordEnabled: true,
    clapGestureEnabled: true,
    tapEnabled: true,
    sensitivity: 0.6,
    clapThreshold: 0.35,
    wakeWords: DEFAULT_WAKE_WORDS,
  };

  private callbacks: WakeWordCallbacks;
  private speechRecognition: any = null;
  private isListeningForWakeWord = false;
  private lastClapTime = 0;
  private lastWakeTime = 0;
  private coolDownMs = 1200; // prevent repeated double triggers

  constructor(callbacks: WakeWordCallbacks, initialSettings?: Partial<WakeSettings>) {
    this.callbacks = callbacks;
    const persisted = loadWakePrefs();
    this.settings = { ...this.settings, ...persisted, ...initialSettings };
    if (!this.settings.wakeWords?.length) this.settings.wakeWords = DEFAULT_WAKE_WORDS;
    this.initSpeechRecognition();
  }

  updateSettings(newSettings: Partial<WakeSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    if (newSettings.wakeWords && !newSettings.wakeWords.length) this.settings.wakeWords = DEFAULT_WAKE_WORDS;
    saveWakePrefs(this.settings);
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
    if (typeof window === 'undefined') return;

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

          if (matchesWakeWord(transcript, this.settings.wakeWords)) {
            this.handleWake('wake-word');
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
          } catch {
            // Already started or suspended
          }
        }
      };
    } catch (err) {
      console.warn('Could not initialize SpeechRecognition for wake word:', err);
    }
  }

  startWakeWordRecognizer() {
    if (!this.speechRecognition || !this.settings.wakeWordEnabled) return;
    this.isListeningForWakeWord = true;
    try {
      this.speechRecognition.start();
    } catch {
      // Ignored if already started
    }
  }

  stopWakeWordRecognizer() {
    this.isListeningForWakeWord = false;
    if (this.speechRecognition) {
      try {
        this.speechRecognition.stop();
      } catch {
        // Ignored
      }
    }
  }

  /**
   * Fast physical clap detector running on raw audio frames.
   * Claps exhibit sharp impulse rise (< 6ms), high crest factor (> 4.0), and rapid decay.
   */
  processFrameForClap(timeData: Float32Array): boolean {
    if (!this.settings.clapGestureEnabled) return false;

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

  private handleWake(trigger: WakeTrigger) {
    const now = Date.now();
    if (now - this.lastWakeTime < this.coolDownMs) {
      return;
    }
    this.lastWakeTime = now;
    this.callbacks.onWake(trigger);
  }

  destroy() {
    this.stopWakeWordRecognizer();
    this.speechRecognition = null;
  }
}
