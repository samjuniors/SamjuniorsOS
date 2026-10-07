/**
 * lib/airplane-mode.ts — the fully local round-trip (Phase 8):
 *
 *    mic → Whisper (companion) → Ollama/LM Studio brain → Piper/espeak/say/SAPI
 *
 * No cloud at any point. Each leg degrades with an actionable message; the
 * Diagnostics panel surfaces readiness per leg. The realtime voice providers
 * stay untouched — airplane mode is its own deliberate path.
 */
import { companion } from './companion-client';
import { controlLayer } from '../sophia/control';
import { pcm16ToWav, wavToPcm16Mono, bytesToBase64, base64ToBytes } from './wav';

export interface VoiceInfo {
  platform: string;
  tts: { available: boolean; engines: Record<string, boolean>; hint: string };
  stt: { available: boolean; engines: Record<string, boolean>; hint: string };
}

export interface Readiness {
  companion: boolean;
  tts: boolean;
  stt: boolean;
  brain: boolean;
  ttsHint?: string;
  sttHint?: string;
  brainHint?: string;
}

const PREF_KEY = 'sophia:airplane:v1';

class AirplaneMode extends EventTarget {
  private _enabled = false;

  constructor() {
    super();
    try { this._enabled = localStorage.getItem(PREF_KEY) === '1'; } catch { /* ignore */ }
  }

  get enabled(): boolean { return this._enabled; }

  setEnabled(on: boolean) {
    this._enabled = on;
    try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch { /* ignore */ }
    if (on) controlLayer.brainMode = 'ollama';
    this.dispatchEvent(new CustomEvent('change'));
  }

  /** Probe all three legs. Best-effort; never throws. */
  async readiness(): Promise<Readiness> {
    const r: Readiness = { companion: false, tts: false, stt: false, brain: false };
    // voice engines via companion
    try {
      if (!companion.connected) await companion.connect().catch(() => false);
      if (companion.connected) {
        r.companion = true;
        const res = await companion.send<VoiceInfo>('voice_info', {}, 8000);
        if (res.ok && res.result) {
          r.tts = Boolean(res.result.tts?.available);
          r.stt = Boolean(res.result.stt?.available);
          if (!r.tts) r.ttsHint = res.result.tts?.hint;
          if (!r.stt) r.sttHint = res.result.stt?.hint;
        }
      }
    } catch { /* companion optional */ }
    // local brain via Ollama
    try {
      const st = await fetch('/api/sophia/status').then((x) => x.json());
      const o = st?.ollama;
      if (o?.configured) {
        const tags = await fetch(`${String(o.baseUrl).replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(2500) });
        r.brain = tags.ok;
      }
      if (!r.brain) r.brainHint = 'Start Ollama (ollama serve) and pull a model — the brain then runs 100% on this machine.';
    } catch {
      r.brainHint = 'Start Ollama (ollama serve) and pull a model — the brain then runs 100% on this machine.';
    }
    return r;
  }

  /** Speak text with the local TTS engine. Returns the engine used. */
  async speakLocal(text: string): Promise<{ engine: string; ms: number }> {
    const t0 = performance.now();
    if (!companion.connected && !(await companion.connect().catch(() => false))) {
      throw new Error('Companion not connected — local speech needs the companion daemon.');
    }
    const res = await companion.send<{ data: string; engine: string; sampleRate: number }>('tts_local', { text }, 45000);
    if (!res.ok || !res.result) throw new Error(res.detail || res.error || 'Local TTS failed');
    await playWavBase64(res.result.data, res.result.sampleRate);
    return { engine: res.result.engine, ms: Math.round(performance.now() - t0) };
  }

  /** Record the microphone until silence (or maxMs) and transcribe locally. */
  async listenOnce(opts: { maxMs?: number; silenceMs?: number; level?: (rms: number) => void } = {}): Promise<string> {
    const wavB64 = await recordWav(opts);
    if (!companion.connected && !(await companion.connect().catch(() => false))) {
      throw new Error('Companion not connected — local transcription needs the companion daemon.');
    }
    const res = await companion.send<{ text: string; engine: string }>('stt_local', { data: wavB64 }, 60000);
    if (!res.ok || !res.result) throw new Error(res.detail || res.error || 'Local STT failed');
    return res.result.text;
  }

  /** Local brain only: text → Ollama reply (no speech). */
  async askLocalBrain(text: string): Promise<string> {
    const res = await fetch('/api/sophia/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lastUser: text,
        history: controlLayer.history.slice(-12),
        brainMode: 'ollama',
        ollamaModel: controlLayer.ollamaModel,
        ollamaUrl: controlLayer.ollamaUrl,
      }),
    });
    const j = await res.json().catch(() => null);
    const reply = (j?.text ?? '').trim();
    if (!reply) throw new Error(j?.error || 'Local brain did not answer (is Ollama running?).');
    return reply;
  }

  /** One fully offline round-trip: text → local brain → spoken local reply. */
  async askLocal(text: string): Promise<string> {
    const reply = await this.askLocalBrain(text);
    try { await this.speakLocal(reply); } catch { /* speaking is best-effort */ }
    return reply;
  }
}

/* ── audio plumbing ────────────────────────────────────────────────────────── */

async function playWavBase64(b64: string, fallbackRate: number) {
  const bytes = base64ToBytes(b64);
  let pcm: Uint8Array;
  let rate = fallbackRate;
  try { ({ pcm, sampleRate: rate } = wavToPcm16Mono(bytes)); } catch { pcm = bytes; }
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
    const buf = ctx.createBuffer(1, samples.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 32768;
    await new Promise<void>((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => resolve();
      src.start();
    });
  } finally {
    await ctx.close().catch(() => {});
  }
}

/** Capture mic → 16 kHz mono WAV (base64). Energy endpointing. */
async function recordWav(opts: { maxMs?: number; silenceMs?: number; level?: (rms: number) => void } = {}): Promise<string> {
  const maxMs = opts.maxMs ?? 12000;
  const silenceMs = opts.silenceMs ?? 900;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ sampleRate: 16000 });
  try {
    const source = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Int16Array[] = [];
    let lastVoice = performance.now();
    let started = false;
    const startedAt = performance.now();
    const done = new Promise<void>((resolve) => {
      proc.onaudioprocess = (e) => {
        const f32 = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
        const rms = Math.sqrt(sum / f32.length);
        opts.level?.(rms);
        if (rms > 0.012) { lastVoice = performance.now(); started = true; }
        if (started) {
          const i16 = new Int16Array(f32.length);
          for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)));
          chunks.push(i16);
        }
        const now = performance.now();
        if (now - startedAt > maxMs || (started && now - lastVoice > silenceMs)) resolve();
      };
    });
    source.connect(proc);
    proc.connect(ctx.destination);
    await done;
    proc.disconnect();
    source.disconnect();
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const pcm = new Uint8Array(total * 2);
    let off = 0;
    for (const c of chunks) { pcm.set(new Uint8Array(c.buffer, 0, c.length * 2), off); off += c.length * 2; }
    if (total < 1600) throw new Error('I did not hear anything — try again.');
    return bytesToBase64(pcm16ToWav(pcm, 16000));
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close().catch(() => {});
  }
}

export const airplaneMode = new AirplaneMode();
