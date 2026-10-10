/**
 * DeepgramVoiceProvider — FALLBACK voice path.
 *
 * This is not a second brain: Deepgram supplies streaming STT + TTS while
 * the SAME ControlLayer (via /api/chat) supplies intelligence, tools,
 * conversation state and personality.
 *
 * Chain: mic → Deepgram nova (streaming STT, server VAD) → /api/chat
 * (control layer LLM) → /api/dg/speak (Deepgram Aura TTS) → playback.
 *
 * Barge-in: Deepgram's server-side SpeechStarted event interrupts playback
 * immediately and hands the turn back to the human.
 */

import { AudioEngine } from '../audio/AudioEngine';
import { controlLayer } from '../control';
import type { VoiceProviderId } from '../types';
import { VoiceProvider } from './VoiceProvider';

export class DeepgramVoiceProvider extends VoiceProvider {
  readonly id: VoiceProviderId = 'deepgram';
  private ws: WebSocket | null = null;
  private detachPCM: (() => void) | null = null;
  private detachPlayEnd: (() => void) | null = null;
  private speakCtl: AbortController | null = null;
  private speaking = false;
  private busy = false;
  private turnBuffer = '';

  constructor(private audio: AudioEngine) {
    super();
  }

  async start(): Promise<void> {
    const res = await fetch('/api/sophia/dg/session', { method: 'POST' });
    if (!res.ok) throw new Error(`dg-session:${res.status}`);
    const { key } = (await res.json()) as { key: string };

    const qs = new URLSearchParams({
      model: 'nova-3',
      language: 'en',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
      vad_events: 'true',
      smart_format: 'true',
      endpointing: '420',
      utterance_end_ms: '900',
    });

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${qs}`, ['token', key]);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onerror = () => reject(new Error('dg-ws'));
      ws.onclose = () => {
        if (!this.active) reject(new Error('dg-closed'));
        else this.handleClosed();
      };
      ws.onopen = () => {
        this.active = true;
        this.attachMic();
        this.detachPlayEnd = this.audio.onPlaybackEnd(() => this.finishTurn());
        this.emit('listening', { source: this.id });
        resolve();
      };
      ws.onmessage = (ev) => this.handleMessage(ev.data as string);
    });
  }

  private attachMic() {
    if (this.detachPCM) return;
    this.detachPCM = this.audio.onPCM((pcm) => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm);
    });
  }

  private handleMessage(raw: string) {
    let m: Record<string, any>;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    switch (m.type) {
      case 'SpeechStarted': {
        this.emit('speech_started', { source: this.id });
        if (this.speaking) {
          // genuine barge-in driven by Deepgram server VAD
          this.speakCtl?.abort();
          this.audio.interruptPlayback();
          this.speaking = false;
          this.busy = false;
          this.emit('interrupted', { source: this.id });
          this.emit('listening', { source: this.id });
        }
        break;
      }
      case 'Results': {
        const alt = m.channel?.alternatives?.[0];
        const text: string = (alt?.transcript ?? '').trim();
        if (!text) break;
        const isFinal = Boolean(m.is_final);
        controlLayer.addUserTurn(text, isFinal);
        this.emit('transcript', { role: 'user', text, final: isFinal, source: this.id });
        if (isFinal) this.turnBuffer = (this.turnBuffer + ' ' + text).trim();
        // a *turn* only starts on real endpointing — not every final segment
        if (m.speech_final && this.turnBuffer) {
          const t = this.turnBuffer;
          this.turnBuffer = '';
          void this.runTurn(t);
        }
        break;
      }
      case 'UtteranceEnd': {
        if (this.turnBuffer && !this.busy) {
          const t = this.turnBuffer;
          this.turnBuffer = '';
          void this.runTurn(t);
        } else if (!this.speaking && !this.busy) {
          this.emit('listening', { source: this.id });
        }
        break;
      }
      default:
        break;
    }
  }

  /** One conversational turn through the single control layer. */
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
    } catch (e) {
      this.busy = false;
      if ((e as Error).name !== 'AbortError') {
        this.emit('error', { code: 'dg-turn', message: (e as Error).message, source: this.id });
      }
    }
  }

  private async speak(text: string, signal: AbortSignal) {
    this.emit('response_started', { source: this.id });

    const useElevenLabs = controlLayer.mouthProvider === 'elevenlabs';
    const primaryUrl = useElevenLabs ? '/api/sophia/elevenlabs/speak' : '/api/sophia/dg/speak';
    const primaryBody = useElevenLabs
      ? { text, voiceId: controlLayer.elevenLabsVoiceId, modelId: controlLayer.elevenLabsModelId }
      : { text, voice: controlLayer.dgVoice };

    let res = await fetch(primaryUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify(primaryBody),
    });

    // Graceful fallback to Deepgram if ElevenLabs encounters an issue
    if (!res.ok && useElevenLabs) {
      console.warn('[sophia] ElevenLabs speak returned error, falling back to Deepgram Aura');
      res = await fetch('/api/sophia/dg/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal,
        body: JSON.stringify({ text, voice: controlLayer.dgVoice }),
      });
    }

    if (!res.ok || !res.body) {
      this.busy = false;
      this.emit('error', { code: 'tts-speak', source: this.id });
      return;
    }
    this.speaking = true;
    this.emit('audio_started', { source: this.id });
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    // stream decode: accumulate then decode whole clip (aura responses are short)
    for (;;) {
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
  }

  /** Called when the playback queue drains. */
  private finishTurn() {
    if (!this.speaking) return;
    this.speaking = false;
    this.busy = false;
    this.emit('response_finished', { source: this.id });
    this.emit('playback_finished', { source: this.id });
    this.emit('listening', { source: this.id });
  }

  sendText(text: string) {
    controlLayer.addUserTurn(text, true);
    this.emit('transcript', { role: 'user', text, final: true, source: this.id });
    void this.runTurn(text);
  }

  interrupt() {
    this.speakCtl?.abort();
    this.audio.interruptPlayback();
    this.speaking = false;
    this.busy = false;
  }

  private handleClosed() {
    this.active = false;
    this.detachPCM?.();
    this.detachPCM = null;
    this.detachPlayEnd?.();
    this.detachPlayEnd = null;
    this.emit('error', { code: 'closed', source: this.id });
  }

  async stop(): Promise<void> {
    this.active = false;
    const ws = this.ws;
    this.ws = null;
    this.detachPCM?.();
    this.detachPCM = null;
    this.detachPlayEnd?.();
    this.detachPlayEnd = null;
    this.interrupt();
    if (ws) {
      ws.onclose = null;
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }));
        ws.close();
      } catch {
        /* noop */
      }
    }
  }
}
