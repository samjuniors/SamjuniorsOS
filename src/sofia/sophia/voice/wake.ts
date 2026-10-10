/**
 * WakeWord — a resilient wake-phrase spotter for “Hey Sofia”.
 *
 * Uses the browser SpeechRecognition stream in a clean lifecycle loop.
 * Recovers reliably from Chromium idle timeouts and audio endpoint transitions,
 * ensuring Sofia is always ready to wake when in standby or ambient mode.
 *
 * Coordinated via MicrophoneCoordinator to guarantee:
 * - Deterministic single-owner microphone exclusivity.
 * - Automatic suspension during active conversations and push-to-talk.
 * - Bounded error recovery (preventing infinite restart loops on device contention).
 * - Full manual push-to-talk operation when wake detection is unavailable.
 */
import { matchesWakeWord, DEFAULT_WAKE_WORDS, loadWakePrefs } from '../../core/WakeWordDetection';
import { MicrophoneCoordinator } from '../audio/MicrophoneCoordinator';

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

export type SpotterStatus = 'idle' | 'listening' | 'paused' | 'blocked' | 'error';

export class WakeWordSpotter {
  private rec: SpeechRecognitionLike | null = null;
  private wantOn = false;
  private lastFire = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeWords: string[];
  private unsubscribePreempt: (() => void) | null = null;
  private unsubscribeChange: (() => void) | null = null;

  available = false;
  blocked = false;
  status: SpotterStatus = 'idle';
  consecutiveErrors = 0;
  readonly maxConsecutiveErrors = 5;

  constructor(
    private onWake: () => void,
    wakeWords?: string[],
    private coordinator?: MicrophoneCoordinator,
  ) {
    const persisted = loadWakePrefs().wakeWords;
    this.wakeWords = wakeWords?.length ? wakeWords : persisted?.length ? persisted : DEFAULT_WAKE_WORDS;

    if (this.coordinator) {
      this.unsubscribePreempt = this.coordinator.registerPreemptHook('wake_word', (preemptedBy) => {
        console.info(`[WakeWordSpotter] Preempted by ${preemptedBy}; suspending recognizer`);
        this.suspendInternal();
      });
      this.unsubscribeChange = this.coordinator.onOwnershipChange(({ owner }) => {
        if (owner === 'idle' && this.wantOn && !this.blocked && this.status !== 'error') {
          this.scheduleRestart(150);
        }
      });
    }
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

        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.blocked = true;
          this.wantOn = false;
          this.status = 'blocked';
          this.coordinator?.releaseOwnership('wake_word', 'permission-denied');
          console.warn('[WakeWordSpotter] Microphone permission denied. Wake spotter blocked.');
          return;
        }

        if (err === 'aborted') {
          // Normal cancellation/preemption
          return;
        }

        if (err === 'no-speech') {
          // Normal Chromium idle silence window timeout (resets error count)
          this.consecutiveErrors = 0;
          return;
        }

        // Hardware contention, network loss, or audio-capture failure
        this.consecutiveErrors++;
        console.warn(`[WakeWordSpotter] Recognizer status: ${err} (${this.consecutiveErrors}/${this.maxConsecutiveErrors})`);

        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          this.status = 'error';
          this.coordinator?.releaseOwnership('wake_word', 'max-consecutive-errors');
          console.error('[WakeWordSpotter] Max consecutive errors reached. Pausing automatic restarts.');
          try {
            rec.abort();
          } catch {
            /* noop */
          }
          this.rec = null;
          return;
        }

        try {
          rec.abort();
        } catch {
          /* noop */
        }
        this.rec = null;
      };

      rec.onend = () => {
        this.rec = null;
        if (this.status === 'listening') {
          this.status = 'idle';
        }
        // Chromium ends recognition after silence intervals; restart with bounded backoff only if not paused
        if (this.wantOn && !this.blocked && this.status !== 'error' && this.status !== 'paused') {
          const delay = this.consecutiveErrors > 0
            ? Math.min(6000, 300 * Math.pow(1.5, this.consecutiveErrors))
            : 200;
          this.scheduleRestart(delay);
        }
      };
      return rec;
    } catch (e) {
      console.warn('[WakeWordSpotter] Failed to initialize SpeechRecognition:', e);
      return null;
    }
  }

  private scheduleRestart(delayMs: number) {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => this.safeStart(), delayMs);
  }

  private hear(e: unknown) {
    const ev = e as {
      resultIndex: number;
      results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
    };

    // Valid speech frame received: reset error count
    this.consecutiveErrors = 0;

    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i];
      for (let j = 0; j < result.length; j++) {
        const text = (result[j]?.transcript ?? '').toLowerCase().trim();
        if (!text) continue;

        const matched =
          matchesWakeWord(text, this.wakeWords) !== null ||
          /^(wake\s*up|wake|hey\s*there)$/i.test(text);

        if (matched) {
          const now = performance.now();
          if (this.lastFire === 0 || now - this.lastFire > 1800) {
            this.lastFire = now;
            console.log('[WakeWordSpotter] Triggered wake on speech:', text);

            // Yield ownership to allow conversation to immediately acquire mic
            this.coordinator?.releaseOwnership('wake_word', 'wake-phrase-detected');
            this.suspendInternal();
            this.onWake();
          }
          return;
        }
      }
    }
  }

  private safeStart() {
    if (!this.wantOn || this.blocked || this.status === 'error') return;

    // Check with coordinator whether wake_word can own the microphone
    if (this.coordinator && !this.coordinator.requestOwnership('wake_word', 'passive-spotting')) {
      this.status = 'paused';
      return;
    }

    if (!this.rec) {
      this.rec = this.create();
      this.available = Boolean(this.rec);
    }
    if (!this.rec) {
      this.coordinator?.releaseOwnership('wake_word', 'no-recognizer-available');
      return;
    }

    try {
      this.rec.start();
      this.status = 'listening';
    } catch {
      // Instance could be stale or already in progress; discard and retry with backoff
      try {
        this.rec.abort();
      } catch {
        /* noop */
      }
      this.rec = null;
      this.consecutiveErrors++;

      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        this.status = 'error';
        this.coordinator?.releaseOwnership('wake_word', 'max-start-failures');
        return;
      }

      if (this.wantOn && !this.blocked) {
        const delay = Math.min(6000, 350 * Math.pow(1.5, this.consecutiveErrors));
        this.scheduleRestart(delay);
      }
    }
  }

  private suspendInternal() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.status === 'listening') {
      this.status = 'paused';
    }
    const rec = this.rec;
    this.rec = null;
    try {
      rec?.abort();
    } catch {
      /* noop */
    }
  }

  unblock() {
    this.blocked = false;
    this.wantOn = true;
    this.consecutiveErrors = 0;
    this.status = 'idle';
    this.start();
  }

  resetRecovery() {
    this.consecutiveErrors = 0;
    if (this.status === 'error') {
      this.status = 'idle';
    }
    if (this.wantOn && !this.blocked) {
      this.safeStart();
    }
  }

  start() {
    this.blocked = false;
    this.wantOn = true;
    if (this.status === 'error') {
      this.consecutiveErrors = 0;
      this.status = 'idle';
    }
    this.safeStart();
  }

  suspend() {
    this.wantOn = false;
    this.suspendInternal();
    this.coordinator?.releaseOwnership('wake_word', 'explicit-suspend');
    if (this.status !== 'blocked' && this.status !== 'error') {
      this.status = 'idle';
    }
  }

  stop() {
    this.suspend();
  }

  destroy() {
    this.stop();
    this.unsubscribePreempt?.();
    this.unsubscribeChange?.();
    this.unsubscribePreempt = null;
    this.unsubscribeChange = null;
  }
}
