/**
 * WakeWord — a resilient wake-phrase spotter for “Hey Sofia”.
 *
 * Uses the browser SpeechRecognition stream in a clean lifecycle loop.
 * Recovers reliably from Chromium idle timeouts and audio endpoint transitions,
 * ensuring Sofia is always ready to wake when in standby or ambient mode.
 *
 * The phrase list is configurable + persisted (shared with WakeWordDetection
 * via loadWakePrefs/saveWakePrefs), and matching goes through the pure,
 * unit-tested `matchesWakeWord`.
 */
import { matchesWakeWord, DEFAULT_WAKE_WORDS, loadWakePrefs } from '../../core/WakeWordDetection';

type AnySpeech = {
  new (): SpeechRecognitionLike;
};

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export class WakeWordSpotter {
  private rec: SpeechRecognitionLike | null = null;
  private wantOn = false;
  private lastFire = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  available = false;
  blocked = false;
  private wakeWords: string[];

  constructor(private onWake: () => void, wakeWords?: string[]) {
    const persisted = loadWakePrefs().wakeWords;
    this.wakeWords = wakeWords?.length ? wakeWords : persisted?.length ? persisted : DEFAULT_WAKE_WORDS;
  }

  /** Replace the wake phrases at runtime (e.g. from Settings). */
  setWakeWords(words: string[]) {
    this.wakeWords = words.length ? words : DEFAULT_WAKE_WORDS;
  }

  getWakeWords(): string[] {
    return [...this.wakeWords];
  }

  private create(): SpeechRecognitionLike | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as Record<string, AnySpeech | undefined>;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return null;

    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      rec.maxAlternatives = 3;
      rec.onresult = (e) => this.hear(e);
      rec.onerror = (e) => {
        const err = (e as { error?: string }).error;
        if (err !== 'no-speech' && err !== 'aborted') {
          console.warn('[WakeWordSpotter] Recognizer status:', err);
        }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.blocked = true;
          this.wantOn = false;
        } else if (err === 'audio-capture' || err === 'network') {
          // Temporary hardware or network contention: discard instance and retry
          try {
            rec.abort();
          } catch {
            /* noop */
          }
          this.rec = null;
        }
      };
      rec.onend = () => {
        // Chromium ends recognition after silence intervals; recreate fresh instance
        this.rec = null;
        if (this.wantOn && !this.blocked) {
          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => this.safeStart(), 200);
        }
      };
      return rec;
    } catch (e) {
      console.warn('[WakeWordSpotter] Failed to initialize SpeechRecognition:', e);
      return null;
    }
  }

  private hear(e: unknown) {
    const ev = e as {
      resultIndex: number;
      results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
    };
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i];
      for (let j = 0; j < result.length; j++) {
        const text = (result[j]?.transcript ?? '').toLowerCase().trim();
        if (!text) continue;

        // Configurable phrase list + the classic attention calls.
        const matched =
          matchesWakeWord(text, this.wakeWords) !== null ||
          /^(wake\s*up|wake|hey\s*there)$/i.test(text);

        if (matched) {
          const now = performance.now();
          if (now - this.lastFire > 1800) {
            this.lastFire = now;
            console.log('[WakeWordSpotter] Triggered wake on speech:', text);
            this.onWake();
          }
          return;
        }
      }
    }
  }

  private safeStart() {
    if (!this.wantOn || this.blocked) return;

    if (!this.rec) {
      this.rec = this.create();
      this.available = Boolean(this.rec);
    }
    if (!this.rec) return;

    try {
      this.rec.start();
    } catch {
      // Instance could be stale or already aborted in browser; recreate fresh next attempt
      try {
        this.rec.abort();
      } catch {
        /* noop */
      }
      this.rec = null;
      if (this.wantOn && !this.blocked) {
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => this.safeStart(), 350);
      }
    }
  }

  unblock() {
    this.blocked = false;
    if (this.wantOn) {
      this.start();
    }
  }

  start() {
    this.blocked = false;
    this.wantOn = true;
    this.safeStart();
  }

  suspend() {
    this.wantOn = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    try {
      this.rec?.abort();
    } catch {
      /* noop */
    }
    this.rec = null;
  }

  stop() {
    this.suspend();
  }
}
