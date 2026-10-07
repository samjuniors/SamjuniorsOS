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

  constructor(private audio: AudioEngine) {
    super();
  }

  async start(): Promise<void> {
    this.active = true;
    this.emit('listening', { source: this.id });
    this.startSpeechRecognition();
  }

  async stop(): Promise<void> {
    this.active = false;
    this.stopSpeechRecognition();
    this.interrupt();
  }

  private startSpeechRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        if (this.active) this.emit('listening', { source: this.id });
      };

      rec.onresult = (e: any) => {
        if (!this.active) return;
        let interim = '';
        let final = '';

        for (let i = e.resultIndex; i < e.results.length; i++) {
          const item = e.results[i];
          const text = item[0].transcript;
          if (item.isFinal) final += text;
          else interim += text;
        }

        const currentText = (final || interim).trim();
        if (currentText) {
          if (this.speaking) {
            // Barge-in interruption
            this.interrupt();
            this.emit('interrupted', { source: this.id });
          }
          controlLayer.addUserTurn(currentText, Boolean(final));
          this.emit('transcript', { role: 'user', text: currentText, final: Boolean(final), source: this.id });
        }

        if (final.trim() && !this.busy) {
          void this.runTurn(final.trim());
        }
      };

      rec.onerror = (err: any) => {
        if (err.error !== 'no-speech' && this.active) {
          console.warn('[elevenlabs-provider] Speech recognition notice:', err.error);
        }
      };

      rec.onend = () => {
        if (this.active && !this.busy) {
          try {
            rec.start();
          } catch {
            /* ignore restart collisions */
          }
        }
      };

      rec.start();
      this.recognizer = rec;
    } catch (e) {
      console.warn('[elevenlabs-provider] Browser WebSpeech not available:', e);
    }
  }

  private stopSpeechRecognition() {
    if (this.recognizer) {
      try {
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
      }
    } catch (e: any) {
      this.busy = false;
      if (e.name !== 'AbortError') {
        this.emit('error', { code: 'elevenlabs-turn', message: e.message, source: this.id });
      }
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
          provider: controlLayer.mouthProvider,
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
      this.emit('listening', { source: this.id });
    } catch (e: any) {
      if (e.name !== 'AbortError' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          const u = new SpeechSynthesisUtterance(text);
          u.onstart = () => {
            this.speaking = true;
            this.emit('audio_started', { source: this.id });
          };
          u.onend = () => {
            this.speaking = false;
            this.busy = false;
            this.emit('response_finished', { source: this.id });
            this.emit('listening', { source: this.id });
          };
          u.onerror = () => {
            this.speaking = false;
            this.busy = false;
            this.emit('response_finished', { source: this.id });
          };
          window.speechSynthesis.speak(u);
          return;
        } catch {
          /* fallback error handled below */
        }
      }
      this.speaking = false;
      this.busy = false;
      if (e.name !== 'AbortError') {
        this.emit('error', { code: 'mouth-error', message: e.message, source: this.id });
      }
    }
  }

  interrupt() {
    this.speakCtl?.abort();
    this.audio.interruptPlayback();
    this.speaking = false;
    this.busy = false;
  }
}
