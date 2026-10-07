/**
 * LocalVoiceProvider — airplane-mode transport (Phase 9).
 *
 *   Ears:  Whisper via the Companion when available; browser SpeechRecognition otherwise
 *   Brain: Ollama / LM Studio via /api/sophia/chat (brainMode=ollama)
 *   Mouth: Piper / espeak / say / SAPI via the Companion (WAV playback)
 *
 * Same normalized event stream as every other provider, so the visual engine
 * doesn't know — or care — that no cloud is involved.
 */

import { AudioEngine } from '../audio/AudioEngine';
import { airplaneMode } from '../../lib/airplane-mode';
import { companion } from '../../lib/companion-client';
import type { VoiceProviderId } from '../types';
import { VoiceProvider } from './VoiceProvider';

export class LocalVoiceProvider extends VoiceProvider {
  readonly id: VoiceProviderId = 'local';
  private recognizer: any = null;
  private busy = false;
  private micLoopAbort = false;
  private useWhisper = false;

  constructor(private audio: AudioEngine) {
    super();
  }

  async start(): Promise<void> {
    if (!companion.connected) await companion.connect().catch(() => false);
    if (!companion.connected) throw new Error('Companion not connected — local voice needs the companion daemon.');

    // Probe STT: whisper if the companion has it, browser recognizer otherwise.
    try {
      const res = await companion.send<{ stt: { available: boolean } }>('voice_info', {}, 6000);
      this.useWhisper = Boolean(res.ok && res.result?.stt?.available);
    } catch {
      this.useWhisper = false;
    }

    this.active = true;
    this.micLoopAbort = false;
    this.emit('listening', { source: this.id });
    if (this.useWhisper) void this.whisperLoop();
    else this.startSpeechRecognition();
  }

  async stop(): Promise<void> {
    this.active = false;
    this.micLoopAbort = true;
    this.stopSpeechRecognition();
    this.interrupt();
  }

  sendText(text: string): void {
    void this.answer(text);
  }

  interrupt(): void {
    this.busy = false;
    this.audio.interruptPlayback?.();
    this.emit('interrupted', { source: this.id });
  }

  /* ── ears ─────────────────────────────────────────────────────────────── */

  private async whisperLoop() {
    while (this.active && !this.micLoopAbort) {
      if (this.busy) { await sleep(250); continue; }
      try {
        this.emit('listening', { source: this.id });
        const text = await airplaneMode.listenOnce({ maxMs: 10000, silenceMs: 800 });
        if (!this.active) return;
        if (text.trim()) {
          this.emit('speech_started', { source: this.id });
          this.emit('transcript', { text, final: true, source: this.id });
          await this.answer(text);
        }
      } catch {
        // Silence / no engine — rest briefly and keep listening.
        await sleep(400);
      }
    }
  }

  private startSpeechRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    this.recognizer = new SpeechRec();
    this.recognizer.continuous = true;
    this.recognizer.interimResults = true;
    this.recognizer.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r.isFinal) continue;
        const text = (r[0]?.transcript ?? '').trim();
        if (!text) continue;
        this.emit('speech_started', { source: this.id });
        this.emit('transcript', { text, final: true, source: this.id });
        void this.answer(text);
      }
    };
    this.recognizer.onend = () => {
      if (this.active && !this.useWhisper) {
        try { this.recognizer?.start(); } catch { /* restart races are benign */ }
      }
    };
    try { this.recognizer.start(); } catch { /* ignore */ }
  }

  private stopSpeechRecognition() {
    try { this.recognizer?.stop(); } catch { /* ignore */ }
    this.recognizer = null;
  }

  /* ── brain + mouth ────────────────────────────────────────────────────── */

  private async answer(text: string) {
    if (this.busy || !this.active) return;
    this.busy = true;
    try {
      this.emit('thinking', { source: this.id });
      const reply = await airplaneMode.askLocalBrain(text);
      if (!this.active) return;

      this.emit('response_started', { text: reply, source: this.id });
      this.emit('transcript', { text: reply, final: true, role: 'sophia', source: this.id });

      let spoken = false;
      try {
        await airplaneMode.speakLocal(reply);
        spoken = true;
      } catch { /* no local TTS — text-only reply still counts */ }

      if (!spoken) {
        // Last resort mouth: the browser voice keeps her from going mute.
        try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance(reply)); } catch { /* ignore */ }
      }

      this.emit('response_finished', { source: this.id });
      this.emit('listening', { source: this.id });
    } catch (err) {
      this.emit('error', { message: err instanceof Error ? err.message : String(err), source: this.id });
    } finally {
      this.busy = false;
    }
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
