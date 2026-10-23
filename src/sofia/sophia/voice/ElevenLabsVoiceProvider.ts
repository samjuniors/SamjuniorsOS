/**
 * ElevenLabsVoiceProvider — High-fidelity persona-based voice.
 *
 * This provider handles the "Mouth" part of the stack.
 * Hearing is supported via browser WebSpeech API (or text input),
 * Thinking is routed to the configured Brain (Gemini / Grok / Claude / OpenAI / Ollama / LM Studio),
 * and Speaking streams high-definition neural audio from ElevenLabs.
 */

import { AudioEngine } from '../audio/AudioEngine';
import { controlLayer } from '../control';
import type { VoiceProviderId } from '../types';
import { VoiceProvider } from './VoiceProvider';

export class ElevenLabsVoiceProvider extends VoiceProvider {
  readonly id: VoiceProviderId = 'elevenlabs';
  private speakCtl: AbortController | null = null;
  private speaking = false;
  private busy = false;
  private recognizer: any = null;
  private pendingTranscript = '';
  private interimDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;
  private detachPlaybackStart: (() => void) | null = null;
  private detachPlaybackEnd: (() => void) | null = null;

  constructor(private audio: AudioEngine) {
    super();
    this.detachPlaybackStart = this.audio.onPlaybackStart(() => {
      this.speaking = true;
      this.stopSpeechRecognition();
    });
    this.detachPlaybackEnd = this.audio.onPlaybackEnd(() => {
      this.speaking = false;
      if (this.active && !this.busy) {
        this.rearmListening();
      }
    });
  }

  public isSupported(): boolean {
    if (typeof window === 'undefined') return true;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  async start(): Promise<void> {
    if (typeof window !== 'undefined' && !this.isSupported()) {
      this.active = false;
      console.warn('[elevenlabs-provider] Browser WebSpeech not available in this environment');
      this.emit('error', {
        code: 'webspeech-unsupported',
        message: 'Browser WebSpeech not available in this environment',
        source: this.id,
      });
      throw new Error('Browser WebSpeech not available in this environment');
    }
    this.active = true;
    this.emit('listening', { source: this.id });
    this.startSpeechRecognition();
  }

  async stop(): Promise<void> {
    this.active = false;
    this.stopSpeechRecognition();
    this.interrupt();
  }

  public rearmListening() {
    if (!this.active || this.busy || this.speaking || this.audio.isSpeaking) return;
    this.startSpeechRecognition();
  }

  private startSpeechRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('[elevenlabs-provider] Browser WebSpeech not available in this environment');
      return;
    }

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.interimDebounceTimer) {
      clearTimeout(this.interimDebounceTimer);
      this.interimDebounceTimer = null;
    }
    this.pendingTranscript = '';

    // Clean up any existing recognizer instance
    if (this.recognizer) {
      try {
        this.recognizer.onend = null;
        this.recognizer.onerror = null;
        this.recognizer.onresult = null;
        this.recognizer.stop();
      } catch {
        /* ignore */
      }
      this.recognizer = null;
    }

    if (!this.active || this.busy || this.speaking || this.audio.isSpeaking) return;

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        if (this.active && !this.speaking && !this.busy) {
          this.emit('listening', { source: this.id });
        }
      };

      rec.onresult = (e: any) => {
        if (!this.active || this.speaking || this.busy || this.audio.isSpeaking) return;
        let interim = '';
        let final = '';

        for (let i = e.resultIndex; i < e.results.length; i++) {
          const item = e.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) final += text;
          else interim += text;
        }

        const currentText = (final || interim).trim();
        if (currentText) {
          this.pendingTranscript = currentText;
          controlLayer.addUserTurn(currentText, Boolean(final));
          this.emit('transcript', { role: 'user', text: currentText, final: Boolean(final), source: this.id });
        }

        if (final.trim() && !this.busy && !this.speaking) {
          if (this.interimDebounceTimer) {
            clearTimeout(this.interimDebounceTimer);
            this.interimDebounceTimer = null;
          }
          this.pendingTranscript = '';
          this.stopSpeechRecognition();
          void this.runTurn(final.trim());
          return;
        }

        // Silence fallback for interim transcripts:
        // If Chrome delays setting isFinal = true after speech ceases,
        // trigger the turn after 850ms of silence so the user is never left hanging.
        if (this.pendingTranscript.trim() && !this.busy && !this.speaking) {
          if (this.interimDebounceTimer) clearTimeout(this.interimDebounceTimer);
          this.interimDebounceTimer = setTimeout(() => {
            if (this.pendingTranscript.trim() && !this.busy && !this.speaking && this.active) {
              const textToCommit = this.pendingTranscript.trim();
              this.pendingTranscript = '';
              controlLayer.addUserTurn(textToCommit, true);
              this.emit('transcript', { role: 'user', text: textToCommit, final: true, source: this.id });
              this.stopSpeechRecognition();
              void this.runTurn(textToCommit);
            }
          }, 850);
        }
      };

      rec.onerror = (err: any) => {
        const errType = err?.error;
        if (errType !== 'no-speech' && this.active) {
          console.warn('[elevenlabs-provider] Speech recognition notice:', errType);
        }
        if (errType === 'not-allowed' || errType === 'service-not-allowed') {
          this.emit('error', { code: 'mic-permission-denied', message: errType, source: this.id });
        }
      };

      rec.onend = () => {
        this.recognizer = null;
        if (this.interimDebounceTimer) {
          clearTimeout(this.interimDebounceTimer);
          this.interimDebounceTimer = null;
        }

        // If onend fired while we had pending speech, commit it as a completed turn
        if (this.pendingTranscript.trim() && !this.busy && !this.speaking && this.active) {
          const textToCommit = this.pendingTranscript.trim();
          this.pendingTranscript = '';
          controlLayer.addUserTurn(textToCommit, true);
          this.emit('transcript', { role: 'user', text: textToCommit, final: true, source: this.id });
          void this.runTurn(textToCommit);
          return;
        }

        // Otherwise cleanly re-arm speech recognition with bounded backoff
        if (this.active && !this.busy && !this.speaking && !this.audio.isSpeaking) {
          if (this.restartTimeout) clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            this.rearmListening();
          }, 150);
        }
      };

      rec.start();
      this.recognizer = rec;
    } catch (e) {
      console.warn('[elevenlabs-provider] Error starting speech recognition:', e);
      this.recognizer = null;
    }
  }

  private stopSpeechRecognition() {
    if (this.interimDebounceTimer) {
      clearTimeout(this.interimDebounceTimer);
      this.interimDebounceTimer = null;
    }
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.recognizer) {
      try {
        this.recognizer.onend = null;
        this.recognizer.onerror = null;
        this.recognizer.onresult = null;
        this.recognizer.stop();
      } catch {
        /* ignore */
      }
      this.recognizer = null;
    }
  }

  async sendText(text: string): Promise<void> {
    if (!text.trim()) return;
    controlLayer.addUserTurn(text.trim(), true);
    this.emit('transcript', { role: 'user', text: text.trim(), final: true, source: this.id });
    await this.runTurn(text.trim());
  }

  private async runTurn(text: string) {
    if (this.busy) return;
    this.busy = true;
    this.emit('thinking', { source: this.id });

    const ctl = new AbortController();
    this.speakCtl = ctl;

    try {
      const res = await fetch('/api/sophia/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: ctl.signal,
        body: JSON.stringify({
          lastUser: text,
          history: controlLayer.history.slice(-16),
          brainMode: controlLayer.brainMode,
          ollamaModel: controlLayer.ollamaModel,
          ollamaUrl: controlLayer.ollamaUrl,
          lmStudioModel: controlLayer.lmStudioModel,
          lmStudioUrl: controlLayer.lmStudioUrl,
        }),
      });

      if (!res.ok) throw new Error(`chat:${res.status}`);
      const out = (await res.json()) as {
        text: string;
        toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
      };

      for (const tc of out.toolCalls ?? []) await controlLayer.execute(tc);

      if (out.text) {
        controlLayer.addSophiaTurn(out.text, true);
        this.emit('transcript', { role: 'sophia', text: out.text, final: true, source: this.id });
        await this.speak(out.text, ctl.signal);
      } else {
        this.busy = false;
        this.emit('response_finished', { source: this.id });
        this.emit('listening', { source: this.id });
        this.rearmListening();
      }
    } catch (e: any) {
      this.busy = false;
      // Report the failed turn first. LISTENING must be the final state once
      // the recognizer is rearmed, not overwritten by a late error event.
      if (e.name !== 'AbortError') {
        this.emit('error', { code: 'elevenlabs-turn', message: e.message, source: this.id });
      }
      this.emit('listening', { source: this.id });
      this.rearmListening();
    }
  }

  private async speak(text: string, signal: AbortSignal) {
    this.emit('response_started', { source: this.id });

    try {
      const res = await fetch('/api/sophia/mouth/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal,
        body: JSON.stringify({
          text,
          provider: controlLayer.pureGeminiLive ? 'gemini' : (controlLayer.mouthProvider || 'auto'),
          voice: controlLayer.voiceName,
          voiceId: controlLayer.elevenLabsVoiceId || 'bMxLr8fP6hzNRRi9nJxU',
          modelId: controlLayer.elevenLabsModelId || 'eleven_turbo_v2_5',
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`mouth-speak:${res.status}`);
      }

      this.speaking = true;
      this.emit('audio_started', { source: this.id });

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          this.emit('audio_chunk', { level: 0.5, source: this.id });
        }
      }

      const buf = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.length;
      }

      await this.audio.playEncoded(buf.buffer);

      this.speaking = false;
      this.busy = false;
      this.emit('response_finished', { source: this.id });
      this.emit('playback_finished', { source: this.id });
      this.emit('listening', { source: this.id });
      this.rearmListening();
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        this.emit('error', { code: 'mouth-error', message: e.message, source: this.id });
      }
      this.speaking = false;
      this.busy = false;
      this.emit('playback_finished', { source: this.id });
      this.emit('listening', { source: this.id });
      this.rearmListening();
    }
  }

  interrupt() {
    this.speakCtl?.abort();
    this.audio.interruptPlayback();
    this.speaking = false;
    this.busy = false;
    this.rearmListening();
  }
}
