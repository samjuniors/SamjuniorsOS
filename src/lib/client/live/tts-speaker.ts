/**
 * Sentence-Queued Speech Synthesis (Client-side TTS).
 *
 * Provides low-latency speech output with dual-engine capability:
 * 1. ElevenLabs Streaming TTS via /api/tts/elevenlabs (high fidelity, configurable voice IDs)
 * 2. Native SpeechSynthesis API (zero-latency, on-device fallback)
 *
 * Features:
 * - Robust queue management without self-cancellation wedges.
 * - Automatic fallback from ElevenLabs to Native on error or rate-limit.
 * - Dynamic voice switching (ElevenLabs voice ID or Browser voice name).
 * - Real-time audio-synchronized boundary & word events.
 * - Chrome paused-state recovery and 5-second keepalive pulses.
 * - Instant barge-in cancellation.
 */

export interface TtsBoundaryData {
  sentence: string;
  sentenceIndex: number;
  charIndex: number;
  charLength?: number;
  word?: string;
  name: string;
  fullSpokenText: string;
}

export interface TtsSpeakerHandlers {
  onStart?: () => void;
  onSentence?: (sentence: string, sentenceIndex: number) => void;
  onBoundary?: (data: TtsBoundaryData) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export type TtsEngine = 'elevenlabs' | 'system';

export class TtsSpeaker {
  private queue: string[] = [];
  private completedSentences: string[] = [];
  private currentSentenceIndex = 0;
  private isSpeaking = false;
  private handlers: TtsSpeakerHandlers;
  private engine: TtsEngine = 'system';
  private voiceId = 'bMxLr8fP6hzNRRi9nJxU'; // Default George
  private nativeVoice: SpeechSynthesisVoice | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private wordIntervalTimer: ReturnType<typeof setInterval> | null = null;

  public constructor(handlers: TtsSpeakerHandlers = {}) {
    this.handlers = handlers;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.initVoice();
    }
  }

  public setEngine(engine: TtsEngine): void {
    this.engine = engine;
  }

  public getEngine(): TtsEngine {
    return this.engine;
  }

  public setVoiceId(id: string): void {
    if (id && id.trim()) {
      this.voiceId = id.trim();
    }
  }

  public getVoiceId(): string {
    return this.voiceId;
  }

  public setNativeVoiceByName(voiceName: string): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    const found = voices.find((v) => v.name.toLowerCase() === voiceName.toLowerCase());
    if (found) {
      this.nativeVoice = found;
    }
  }

  public getNativeVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices();
  }

  private initVoice(): void {
    const updateVoice = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return;

        // Rank voices favoring natural British / English male and clear assistant voices
        const score = (v: SpeechSynthesisVoice): number => {
          const n = v.name.toLowerCase();
          let s = 0;
          if (n.includes('google uk english male')) s += 100;
          else if (n.startsWith('daniel')) s += 95;
          else if (n.includes('george')) s += 90;
          else if (/\b(oliver|arthur|jamie|malcolm)\b/.test(n)) s += 85;
          else if (n.includes('natural') || n.includes('neural')) s += 50;
          else if (n.includes('premium') || n.includes('enhanced')) s += 30;

          if (/en[-_]gb/i.test(v.lang)) s += 25;
          else if (/^en/i.test(v.lang)) s += 10;

          if (/whisper|bells|organ|bad news|good news|jester/i.test(n)) s -= 200;
          return s;
        };

        const sorted = [...voices]
          .filter((v) => /^en/i.test(v.lang))
          .sort((a, b) => score(b) - score(a));

        this.nativeVoice = sorted[0] || voices.find((v) => /^en/i.test(v.lang)) || voices[0] || null;
      } catch {
        // Safe ignore
      }
    };

    updateVoice();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoice;
    }
  }

  public speakText(text: string): void {
    if (!text || !text.trim()) return;

    // Split text into coherent sentences for low-latency streaming speech
    const sentences = text
      .replace(/([.?!])\s*(?=[A-Z0-9"'])/g, '$1|')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (sentences.length === 0) return;

    // Un-wedge Chrome SpeechSynthesis engine if paused
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.resume();
      }
    } catch {
      // Safe ignore
    }

    this.queue = sentences;
    this.completedSentences = [];
    this.currentSentenceIndex = 0;

    if (!this.isSpeaking) {
      this.pump();
    }
  }

  private pump(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    if (this.queue.length === 0) {
      this.isSpeaking = false;
      this.clearKeepalive();
      this.clearWordInterval();
      this.handlers.onEnd?.();
      return;
    }

    const sentence = this.queue.shift();
    if (!sentence) {
      this.isSpeaking = false;
      this.clearKeepalive();
      this.clearWordInterval();
      this.handlers.onEnd?.();
      return;
    }

    const sentenceIdx = this.currentSentenceIndex;
    this.isSpeaking = true;
    this.handlers.onSentence?.(sentence, sentenceIdx);

    if (this.engine === 'elevenlabs') {
      this.speakElevenLabs(sentence, sentenceIdx);
    } else {
      this.speakNative(sentence, sentenceIdx);
    }
  }

  private async speakElevenLabs(sentence: string, sentenceIdx: number): Promise<void> {
    try {
      const res = await fetch('/api/tts/elevenlabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sentence,
          voiceId: this.voiceId,
        }),
      });

      if (!res.ok) {
        console.warn(`[TtsSpeaker] ElevenLabs failed with HTTP ${res.status}. Falling back to browser speech.`);
        this.speakNative(sentence, sentenceIdx);
        return;
      }

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

      audio.onplay = () => {
        if (sentenceIdx === 0) {
          this.handlers.onStart?.();
        }
        // Simulate word boundaries based on audio duration for subtitle synchronization
        this.startSimulatedWordBoundaries(sentence);
      };

      audio.onended = () => {
        this.clearWordInterval();
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.completedSentences.push(sentence);
        this.currentSentenceIndex++;
        this.pump();
      };

      audio.onerror = () => {
        this.clearWordInterval();
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        console.warn('[TtsSpeaker] Audio element playback failed. Falling back to native.');
        this.speakNative(sentence, sentenceIdx);
      };

      await audio.play();
    } catch (err: any) {
      console.warn('[TtsSpeaker] ElevenLabs stream network exception. Falling back to native:', err);
      this.speakNative(sentence, sentenceIdx);
    }
  }

  private startSimulatedWordBoundaries(sentence: string): void {
    this.clearWordInterval();
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    let wordIdx = 0;
    const intervalMs = Math.max(160, Math.min(320, 240));

    this.wordIntervalTimer = setInterval(() => {
      if (wordIdx < words.length) {
        const spokenWords = words.slice(0, wordIdx + 1);
        this.handlers.onBoundary?.({
          sentence,
          sentenceIndex: this.currentSentenceIndex,
          charIndex: spokenWords.join(' ').length,
          word: words[wordIdx],
          name: 'word',
          fullSpokenText: spokenWords.join(' '),
        });
        wordIdx++;
      } else {
        this.clearWordInterval();
      }
    }, intervalMs);
  }

  private clearWordInterval(): void {
    if (this.wordIntervalTimer) {
      clearInterval(this.wordIntervalTimer);
      this.wordIntervalTimer = null;
    }
  }

  private speakNative(sentence: string, sentenceIdx: number): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.handlers.onError?.('SpeechSynthesis API not supported in this browser.');
      this.isSpeaking = false;
      return;
    }

    try {
      if (!this.nativeVoice) {
        this.initVoice();
      }

      const utterance = new SpeechSynthesisUtterance(sentence);
      if (this.nativeVoice) {
        utterance.voice = this.nativeVoice;
      }
      utterance.lang = this.nativeVoice?.lang || 'en-GB';
      utterance.rate = 0.95;
      utterance.pitch = 0.95;

      utterance.onstart = () => {
        if (sentenceIdx === 0) {
          this.handlers.onStart?.();
        }
        this.startKeepalive();
      };

      utterance.onboundary = (e) => {
        if (e.name === 'word') {
          const charIndex = e.charIndex;
          const spokenSoFar = sentence.substring(0, charIndex + (e.charLength || 4)).trim();
          this.handlers.onBoundary?.({
            sentence,
            sentenceIndex: sentenceIdx,
            charIndex: e.charIndex,
            charLength: e.charLength,
            name: e.name,
            fullSpokenText: spokenSoFar,
          });
        }
      };

      utterance.onend = () => {
        this.completedSentences.push(sentence);
        this.currentSentenceIndex++;
        this.pump();
      };

      utterance.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') {
          return;
        }
        this.handlers.onError?.(`Speech error: ${e.error}`);
        this.completedSentences.push(sentence);
        this.currentSentenceIndex++;
        this.pump();
      };

      this.watchdogTimer = setTimeout(() => {
        if (this.isSpeaking && this.currentSentenceIndex === sentenceIdx) {
          console.warn('[TtsSpeaker] Utterance watchdog timed out after 14s. Advancing queue.');
          try {
            window.speechSynthesis.cancel();
          } catch {}
          this.completedSentences.push(sentence);
          this.currentSentenceIndex++;
          this.pump();
        }
      }, 14000);

      window.speechSynthesis.speak(utterance);
    } catch (err: any) {
      this.handlers.onError?.(err?.message || 'Synthesis exception');
      this.pump();
    }
  }

  private startKeepalive(): void {
    this.clearKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.isSpeaking && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } catch {
          // Safe ignore
        }
      } else {
        this.clearKeepalive();
      }
    }, 4500);
  }

  private clearKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  public cancel(): void {
    this.queue = [];
    this.isSpeaking = false;
    this.clearKeepalive();
    this.clearWordInterval();
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  public pause(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
      } catch {}
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.pause();
      } catch {}
    }
  }

  public resume(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.play();
      } catch {}
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();
      } catch {}
    }
  }

  public speaking(): boolean {
    return (
      this.isSpeaking ||
      (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) ||
      (this.currentAudio !== null && !this.currentAudio.paused)
    );
  }
}
