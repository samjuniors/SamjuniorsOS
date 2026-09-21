/**
 * Browser Web Speech API Recognition Adapter.
 *
 * Provides client-side speech recognition using native browser APIs
 * (webkitSpeechRecognition / SpeechRecognition) with resilient error reporting,
 * friendly diagnostics, and auto-recovery.
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
}

export class BrowserSttClient {
  private recognition: any = null;
  private isListening = false;
  private explicitStop = false;
  private handlers: BrowserSttHandlers;

  public constructor(handlers: BrowserSttHandlers = {}) {
    this.handlers = handlers;
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

    if (this.isListening) return true;
    this.explicitStop = false;

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.handlers.onSpeechStart?.();
      };

      this.recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (interim) {
          this.handlers.onInterimTranscript?.(interim);
        }
        if (final && final.trim().length > 0) {
          this.handlers.onFinalTranscript?.(final.trim());
        }
      };

      this.recognition.onerror = (event: any) => {
        const errCode = event.error || 'unknown';

        // Filter out non-fatal errors
        if (errCode === 'no-speech') {
          // Normal pause in speech; do not abort
          return;
        }

        if (errCode === 'aborted' && this.explicitStop) {
          // Expected on intentional stop
          return;
        }

        let hint = 'Check microphone settings or try text input.';
        let friendlyMessage = `Speech recognition error: ${errCode}`;

        if (errCode === 'not-allowed') {
          friendlyMessage = 'Microphone permission was denied by the browser.';
          hint = 'Click the lock or site settings icon in your address bar (http://localhost:3000) and allow Microphone.';
        } else if (errCode === 'network') {
          friendlyMessage = 'Browser Speech recognition network error.';
          hint = 'Chrome Web Speech routes recognition through Google servers. Check your internet connection or use text input.';
        } else if (errCode === 'audio-capture') {
          friendlyMessage = 'No microphone audio captured.';
          hint = 'Ensure your microphone is plugged in, unmuted, and not in use exclusively by another application.';
        } else if (errCode === 'service-not-allowed') {
          friendlyMessage = 'Speech recognition service not allowed on this device or origin.';
          hint = 'Verify browser speech permissions in OS Settings.';
        }

        this.handlers.onError?.({
          code: errCode,
          message: friendlyMessage,
          hint,
        });
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.handlers.onEnd?.();
      };

      this.recognition.start();
      return true;
    } catch (err: any) {
      this.isListening = false;
      this.handlers.onError?.({
        code: 'start-failed',
        message: err?.message || 'Failed to start browser speech recognition',
        hint: 'Restart the session or check browser permissions.',
      });
      return false;
    }
  }

  public stop(): void {
    this.explicitStop = true;
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Safe ignore
      }
    }
    this.isListening = false;
  }

  public active(): boolean {
    return this.isListening;
  }
}
