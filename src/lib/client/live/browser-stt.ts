/**
 * Browser Web Speech API Recognition Adapter.
 *
 * Provides client-side speech recognition using native browser APIs
 * (webkitSpeechRecognition / SpeechRecognition) with resilient continuous listening,
 * heartbeat recovery, thought assembly, and echo-prevention inspired by jarvis-main.
 */

export interface BrowserSttErrorInfo {
  code: string;
  message: string;
  hint: string;
}

export interface BrowserSttHandlers {
  onSpeechStart?: () => void;
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: BrowserSttErrorInfo) => void;
  onEnd?: () => void;
  isSpeaking?: () => boolean;
}

export class BrowserSttClient {
  private recognition: any = null;
  private isListening = false;
  private explicitStop = false;
  private handlers: BrowserSttHandlers;
  private lastAlive = Date.now();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private settledText = '';
  private interimText = '';
  public restartsCount = 0;

  public constructor(handlers: BrowserSttHandlers = {}) {
    this.handlers = handlers;
  }

  public updateHandlers(handlers: Partial<BrowserSttHandlers>): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    );
  }

  public start(): boolean {
    if (!this.isSupported()) {
      this.handlers.onError?.({
        code: 'not-supported',
        message: 'Web Speech API is not supported in this browser.',
        hint: 'Use Google Chrome, Microsoft Edge, or Chromium with Web Speech enabled.',
      });
      return false;
    }

    this.explicitStop = false;
    this.lastAlive = Date.now();
    this.clearTimers();

    // Heartbeat watchdog (from jarvis-main)
    // If no event has fired from the engine for 15s, Chrome might have stalled
    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        if (this.explicitStop) return;
        const idle = Date.now() - this.lastAlive;
        if (idle >= 15000) {
          this.restartsCount++;
          try {
            this.recognition?.abort();
          } catch {
            // Safe ignore
          }
          this.recognition = null;
          this.isListening = false;
          this.lastAlive = Date.now();
          this.spin();
        }
      }, 5000);
    }

    this.spin();
    return true;
  }

  private spin(): void {
    if (this.explicitStop || this.isListening) return;

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        this.isListening = true;
        this.lastAlive = Date.now();
        this.handlers.onSpeechStart?.();
      };

      rec.onresult = (event: any) => {
        this.lastAlive = Date.now();

        // Echo protection: Drop speech recognized while assistant is actively speaking
        if (this.handlers.isSpeaking?.()) {
          this.interimText = '';
          return;
        }

        let freshFinal = '';
        let currentInterim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const transcript = item[0]?.transcript || '';
          if (item.isFinal) {
            freshFinal += transcript;
          } else {
            currentInterim += transcript;
          }
        }

        if (freshFinal) {
          this.settledText = `${this.settledText} ${freshFinal}`.replace(/\s+/g, ' ').trim();
        }
        this.interimText = currentInterim;

        const currentFull = `${this.settledText} ${this.interimText}`.replace(/\s+/g, ' ').trim();
        if (currentFull) {
          this.handlers.onInterimTranscript?.(currentFull);

          // Reset silence timer for thought assembly
          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
          }

          // If sentence ended with punctuation, shorten the commit window
          const isCompleteSentence = /[.!?]$/.test(currentFull);
          const commitDelayMs = isCompleteSentence ? 400 : 1000;

          this.silenceTimer = setTimeout(() => {
            this.emitThought();
          }, commitDelayMs);
        }
      };

      rec.onerror = (event: any) => {
        this.lastAlive = Date.now();
        const errCode = event.error || 'unknown';

        // Filter out non-fatal errors
        if (errCode === 'no-speech' || errCode === 'aborted') {
          return;
        }

        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          this.explicitStop = true;
          this.cleanup();
          this.handlers.onError?.({
            code: errCode,
            message: 'Microphone permission denied or speech service not allowed.',
            hint: 'Allow microphone access in Chrome address bar (sliders/lock icon) and OS settings.',
          });
          return;
        }

        // Informational logging for other transient errors
        let hint = 'Check microphone settings or try text input.';
        let friendlyMessage = `Speech recognition error: ${errCode}`;

        if (errCode === 'network') {
          friendlyMessage = 'Speech recognition network error.';
          hint = 'Chrome Web Speech routes recognition through Google servers. Check your internet connection.';
        } else if (errCode === 'audio-capture') {
          friendlyMessage = 'No microphone audio captured.';
          hint = 'Ensure your microphone is plugged in, unmuted, and not locked by another app.';
        }

        this.handlers.onError?.({
          code: errCode,
          message: friendlyMessage,
          hint,
        });
      };

      rec.onend = () => {
        this.isListening = false;
        this.lastAlive = Date.now();
        this.recognition = null;

        // If there is any uncommitted speech before end, commit it
        if (this.settledText.trim().length > 0) {
          this.emitThought();
        }

        if (!this.explicitStop) {
          // Continuous listening loop: re-spin after 80ms (jarvis-main pattern)
          this.restartTimeout = setTimeout(() => {
            this.spin();
          }, 80);
        } else {
          this.handlers.onEnd?.();
        }
      };

      this.recognition = rec;
      rec.start();
    } catch {
      this.isListening = false;
      if (!this.explicitStop) {
        this.restartTimeout = setTimeout(() => {
          this.spin();
        }, 250);
      }
    }
  }

  private emitThought(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    const text = `${this.settledText} ${this.interimText}`.replace(/\s+/g, ' ').trim();
    this.settledText = '';
    this.interimText = '';

    if (!text || text.length === 0) return;

    if (this.handlers.isSpeaking?.()) {
      return;
    }

    this.handlers.onFinalTranscript?.(text);
  }

  public stop(): void {
    this.explicitStop = true;
    this.clearTimers();
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Safe ignore
      }
      this.recognition = null;
    }
    this.isListening = false;
    this.settledText = '';
    this.interimText = '';
    this.handlers.onEnd?.();
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private cleanup(): void {
    this.clearTimers();
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Safe ignore
      }
      this.recognition = null;
    }
    this.isListening = false;
  }

  public active(): boolean {
    return this.isListening;
  }
}
