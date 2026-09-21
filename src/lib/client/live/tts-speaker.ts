/**
 * Sentence-Queued Speech Synthesis (Client-side TTS).
 *
 * Provides low-latency speech output using the browser's native SpeechSynthesis API.
 * Features:
 * - Chunks streaming text by sentence boundaries so speech begins immediately.
 * - Supports instant barge-in cancellation (cancel()).
 * - Fires onStart, onSentence, and onEnd callbacks for telemetry.
 * - Includes Chromium paused-state recovery and resume safeguards.
 */

export interface TtsSpeakerHandlers {
  onStart?: () => void;
  onSentence?: (sentence: string) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export class TtsSpeaker {
  private queue: string[] = [];
  private isSpeaking = false;
  private handlers: TtsSpeakerHandlers;
  private voice: SpeechSynthesisVoice | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(handlers: TtsSpeakerHandlers = {}) {
    this.handlers = handlers;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.initVoice();
    }
  }

  private initVoice(): void {
    const updateVoice = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return;
        // Prefer natural English voice for Sophia
        this.voice =
          voices.find((v) => v.lang.startsWith('en') && /natural|neural|female|samantha|zira|karen|serena/i.test(v.name)) ||
          voices.find((v) => v.lang.startsWith('en') && !/google/i.test(v.name)) ||
          voices.find((v) => v.lang.startsWith('en')) ||
          voices[0] ||
          null;
      } catch {
        // Safe ignore
      }
    };

    updateVoice();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = updateVoice;
      }
    }
  }

  public speakText(text: string): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.handlers.onError?.('SpeechSynthesis API not supported in this browser.');
      return;
    }

    this.cancel();
    if (!text || !text.trim()) return;

    // Split text into coherent sentences for low-latency streaming speech
    const sentences = text
      .replace(/([.?!])\s*(?=[A-Z0-9"'])/g, '$1|')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    this.queue = sentences;
    try {
      window.speechSynthesis.resume();
    } catch {
      // Safe ignore
    }
    this.pump();
  }

  private pump(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    if (this.isSpeaking || this.queue.length === 0) return;

    const sentence = this.queue.shift();
    if (!sentence) {
      this.isSpeaking = false;
      this.handlers.onEnd?.();
      return;
    }

    this.isSpeaking = true;
    this.handlers.onSentence?.(sentence);

    try {
      const utterance = new SpeechSynthesisUtterance(sentence);
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        if (this.watchdogTimer) {
          clearTimeout(this.watchdogTimer);
          this.watchdogTimer = null;
        }
        this.handlers.onStart?.();
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.pump();
      };

      utterance.onerror = (e) => {
        this.isSpeaking = false;
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          this.handlers.onError?.(`TTS error (${e.error})`);
        }
        this.pump();
      };

      // Chromium safeguard: If speech doesn't start in 400ms, trigger resume
      this.watchdogTimer = setTimeout(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        }
      }, 400);

      window.speechSynthesis.speak(utterance);
    } catch (err: any) {
      this.isSpeaking = false;
      this.handlers.onError?.(`Speech synthesis error: ${err?.message || err}`);
      this.pump();
    }
  }

  public cancel(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.queue = [];
    this.isSpeaking = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Safe ignore
      }
    }
    this.handlers.onEnd?.();
  }

  public speaking(): boolean {
    return this.isSpeaking;
  }
}
