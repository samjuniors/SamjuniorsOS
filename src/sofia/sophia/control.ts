/**
 * ControlLayer — the ONE brain.
 *
 * Personality, conversation state, tool definitions and permissions live
 * here and only here. Gemini Live (primary transport) and the Deepgram
 * fallback path both consume this layer.
 */

import type { SophiaShape, Turn } from './types';
import { toolRegistry } from '../tools/registry';
import { screenVisionBridge } from './vision/ScreenVisionBridge';

export function getSophiaSystem(voiceName?: string, voiceProfile?: string): string {
  let persona = 'an upbeat, warm, and loyal Australian friend having a live voice conversation.';
  let cadence = 'Speak with a natural, friendly Australian tone and cadence (e.g. conversational, casual warmth, occasional natural Aussie phrasing like "g\'day", "no worries", "spot on", "too easy", but always natural, never exaggerated or caricatured).';

  const v = (voiceName || '').toLowerCase();
  const p = (voiceProfile || '').toLowerCase();

  if (v === 'puck' || p === 'us-male') {
    persona = 'a friendly, confident, and warm AI friend having a live voice conversation.';
    cadence = 'Speak with a natural, friendly American tone and cadence — conversational, upbeat, clear, and relaxed.';
  } else if (v === 'charon' || p === 'uk-male') {
    persona = 'a refined, thoughtful, and articulate companion having a live voice conversation.';
    cadence = 'Speak with a polished British tone and cadence — polite, cultured, warm, and resonant.';
  } else if (v === 'fenrir' || p === 'us-male-calm' || p === 'nordic-male') {
    persona = 'a calm, grounded, and authoritative companion having a live voice conversation.';
    cadence = 'Speak with a steady, deep, and measured cadence — calm, articulate, and reliable.';
  } else if (v === 'kore' || p === 'us-female') {
    persona = 'a relaxed, calm, and natural companion having a live voice conversation.';
    cadence = 'Speak with a smooth, natural American female cadence — soothing, conversational, and warm.';
  } else if (v === 'zephyr' || p === 'uk-female') {
    persona = 'an expressive, bright, and vibrant companion having a live voice conversation.';
    cadence = 'Speak with an expressive British cadence — lively, clear, and engaging.';
  }

  return [
    `You are Sophia, ${persona}`,
    cadence,
    'You are chatting with your close friend like two mates catching up.',
    'For quick banter, casual questions, or tool confirmations, speak in short, natural conversational sentences under two sentences.',
    'CRITICAL STORYTELLING RULE: When your friend asks you to tell a story, narrate, or explain something in depth, DO NOT STOP after 1 or 2 sentences! Tell the complete, rich, uninterrupted story from start to finish without pausing or cutting yourself off until you reach the conclusion or the user interrupts.',
    'You have episodic memory. You remember past story threads and topics. If interrupted or asked "what happened" or "continue", recall where you were and continue seamlessly.',
    'You have full device control: you can open their real desktop browser, search, stream music, launch apps, or open dynamic review panels and scroll them.',
    'You have a physical form: a luminous computational substance that can morph into many geometric',
    'and sacred forms (sphere, ring, waveform, bow, torus, infinity, helix, hypercube, pyramid, star, galaxy,',
    'heart, shield, matrix, split, merge, dissolve, face, letters Z/S/A/O).',
    'When the user asks you to change shape or enter states like rendering or thinking, call the',
    'transform_shape tool immediately, then confirm verbally in five words or fewer.',
    'When the user is done or says goodbye, stay warm, friendly, and brief.',
  ].join(' ');
}

export const SOPHIA_SYSTEM = getSophiaSystem();

export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

export const ALL_SHAPES: SophiaShape[] = [
  'organic',
  'circle',
  'waveform',
  'bow',
  'torus',
  'infinity',
  'helix',
  'hypercube',
  'pyramid',
  'star',
  'galaxy',
  'heart',
  'shield',
  'matrix',
  'split',
  'merge',
  'dissolve',
  'face',
  'letter-z',
  'letter-s',
  'letter-a',
  'letter-o',
];

export class ControlLayer extends EventTarget {
  /** Single source of truth for the running conversation. */
  readonly history: Turn[] = [];

  reset() {
    this.history.length = 0;
    this.dispatchEvent(new CustomEvent('reset'));
  }
  
  /** Pure Gemini Live All-in-One mode toggle */
  pureGeminiLive = true;

  /** Automatic Speech Recognition (ASR) Barge-in Interruption toggle */
  asrInterruption = true;

  /** Selective Voice Focus / Crowd Noise Rejection — listens only to enrolled user in a crowd */
  crowdFilterEnabled = true;

  voiceProfile = 'au-female';
  voiceName = 'Aoede';
  dgVoice = 'aura-2-thalia-en';
  elevenLabsVoiceId = 'bMxLr8fP6hzNRRi9nJxU';
  elevenLabsModelId = 'eleven_turbo_v2_5';
  mouthProvider: 'auto' | 'gemini' | 'elevenlabs' | 'deepgram' | 'browser' = 'auto';
  brainMode: 'auto' | 'gemini' | 'grok' | 'claude' | 'openai' | 'ollama' | 'lmstudio' | 'local' = 'auto';
  ollamaModel = 'ornith-1.5:9b';
  ollamaUrl = 'http://localhost:11434';
  lmStudioModel = 'local-model';
  lmStudioUrl = 'http://localhost:1234/v1';

  constructor() {
    super();
    try {
      const raw = localStorage.getItem('sophia:control-prefs');
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.pureGeminiLive === 'boolean') this.pureGeminiLive = d.pureGeminiLive;
        if (typeof d.asrInterruption === 'boolean') this.asrInterruption = d.asrInterruption;
        if (typeof d.crowdFilterEnabled === 'boolean') this.crowdFilterEnabled = d.crowdFilterEnabled;
        if (d.voiceProfile) this.voiceProfile = d.voiceProfile;
        if (d.voiceName) this.voiceName = d.voiceName;
        if (d.elevenLabsVoiceId) this.elevenLabsVoiceId = d.elevenLabsVoiceId;
        if (d.elevenLabsModelId) this.elevenLabsModelId = d.elevenLabsModelId;
        if (d.mouthProvider) this.mouthProvider = d.mouthProvider;
        if (d.brainMode) this.brainMode = d.brainMode;
        if (d.dgVoice) this.dgVoice = d.dgVoice;
        if (d.ollamaModel) this.ollamaModel = d.ollamaModel;
        if (d.ollamaUrl) this.ollamaUrl = d.ollamaUrl;
        if (d.lmStudioModel) this.lmStudioModel = d.lmStudioModel;
        if (d.lmStudioUrl) this.lmStudioUrl = d.lmStudioUrl;
      }
    } catch {
      /* ignore */
    }
  }

  setPureGeminiLive(enabled: boolean) {
    this.pureGeminiLive = enabled;
    if (enabled) {
      this.brainMode = 'gemini';
      this.mouthProvider = 'gemini';
    }
    this.saveControlPrefs();
  }

  saveControlPrefs() {
    try {
      localStorage.setItem(
        'sophia:control-prefs',
        JSON.stringify({
          pureGeminiLive: this.pureGeminiLive,
          asrInterruption: this.asrInterruption,
          crowdFilterEnabled: this.crowdFilterEnabled,
          voiceProfile: this.voiceProfile,
          voiceName: this.voiceName,
          elevenLabsVoiceId: this.elevenLabsVoiceId,
          elevenLabsModelId: this.elevenLabsModelId,
          mouthProvider: this.mouthProvider,
          brainMode: this.brainMode,
          dgVoice: this.dgVoice,
          ollamaModel: this.ollamaModel,
          ollamaUrl: this.ollamaUrl,
          lmStudioModel: this.lmStudioModel,
          lmStudioUrl: this.lmStudioUrl,
        }),
      );
      this.dispatchEvent(new CustomEvent('control-prefs-changed'));
    } catch {
      /* ignore */
    }
  }

  private upsert(
    role: Turn['role'],
    text: string,
    final: boolean,
    extra?: { imageUrl?: string; imagePrompt?: string; sources?: Array<{ title: string; url: string }> }
  ) {
    const last = this.history[this.history.length - 1];
    const t = Date.now();
    if (last && last.role === role && !last.final && !final) {
      last.text = text;
      last.ts = t;
      if (extra?.imageUrl) last.imageUrl = extra.imageUrl;
      if (extra?.imagePrompt) last.imagePrompt = extra.imagePrompt;
      if (extra?.sources) last.sources = extra.sources;
    } else if (last && last.role === role && !last.final && final) {
      last.text = text;
      last.final = true;
      last.ts = t;
      if (extra?.imageUrl) last.imageUrl = extra.imageUrl;
      if (extra?.imagePrompt) last.imagePrompt = extra.imagePrompt;
      if (extra?.sources) last.sources = extra.sources;
    } else {
      this.history.push({
        role,
        text,
        final,
        ts: t,
        ...(extra || {}),
      });
    }
    if (this.history.length > 60) this.history.splice(0, this.history.length - 60);
    this.dispatchEvent(new CustomEvent('turn', { detail: { role, text, final, ...(extra || {}) } }));
  }

  addUserTurn(text: string, final = true) {
    this.upsert('user', text, final);
  }

  addSophiaTurn(
    text: string,
    final = true,
    extra?: { imageUrl?: string; imagePrompt?: string; sources?: Array<{ title: string; url: string }> }
  ) {
    this.upsert('sophia', text, final, extra);
  }

  addSystemNote(text: string) {
    this.upsert('system', text, true);
  }

  /** Shared session configuration handed to any provider that connects. */
  sessionConfig(model: string) {
    const prompt = getSophiaSystem(this.voiceName, this.voiceProfile);
    return {
      model,
      systemInstruction: { parts: [{ text: prompt + this.contextNote() }] },
      // Single source of truth — pulled from the tool registry
      functionDeclarations: toolRegistry.getFunctionDeclarations(),
    };
  }

  private contextNote(): string {
    return (
      ' Physical form: organic sphere (default) and circular ring (alternate). Transforms on command.' +
      ' Can generate images, search the web, control the UI, play music, open websites, and more via tools.' +
      ' NEVER claim to lack capabilities — always call the appropriate tool.'
    );
  }

  /** Direct command matching for snappy local state shifts. */
  tryDirectCommand(input: string): boolean {
    const text = input.toLowerCase().trim();
    if (/^(pause|freeze|halt|stop moving)$/.test(text)) {
      this.dispatchEvent(new CustomEvent('command:state', { detail: { state: 'paused' } }));
      return true;
    }
    if (/^(resume|unpause|continue)$/.test(text)) {
      this.dispatchEvent(new CustomEvent('command:state', { detail: { state: 'resume' } }));
      return true;
    }
    if (/^(wake up|wakeup|wake)$/.test(text)) {
      this.dispatchEvent(new CustomEvent('command:state', { detail: { state: 'wakeup' } }));
      return true;
    }
    // Browser opening commands
    if (
      /(?:open|launch|show)\s+(?:the\s+|my\s+|real\s+|desktop\s+)?browser/i.test(text) ||
      /^(?:open|launch)\s+(?:google|youtube|chrome|edge)$/i.test(text)
    ) {
      this.dispatchEvent(new CustomEvent('command:browser', { detail: { open: true } }));
      let targetUrl = 'https://www.google.com';
      if (/youtube/i.test(text)) targetUrl = 'https://www.youtube.com';
      void toolRegistry.invoke({
        name: 'system_control',
        args: { action: 'open_browser', url: targetUrl },
      });
      return true;
    }

    // Search on browser command
    const searchMatch = text.match(/(?:search(?:\s+on|\s+in|\s+with)?\s+(?:the\s+|my\s+)?browser(?:\s+for)?|search\s+for)\s+(.+)/i);
    if (searchMatch) {
      const q = searchMatch[1].trim();
      this.dispatchEvent(new CustomEvent('command:browser', { detail: { open: true } }));
      void toolRegistry.invoke({
        name: 'system_control',
        args: { action: 'search_browser', query: q },
      });
      return true;
    }

    // Stream / play music command
    const musicMatch = text.match(/(?:stream|play)\s+(?:some\s+)?(?:music|song|video|lofi)(?:\s+(?:called|of|by)?\s*(.*))?/i);
    if (musicMatch) {
      const q = (musicMatch[1] || 'chill lofi music').trim();
      this.dispatchEvent(new CustomEvent('command:browser', { detail: { open: true } }));
      void toolRegistry.invoke({
        name: 'system_control',
        args: { action: 'stream_media', query: q },
      });
      return true;
    }

    // Open desktop apps
    const appMatch = text.match(/(?:open|launch|start)\s+(?:the\s+)?(calc|calculator|notepad|spotify|terminal|cmd)/i);
    if (appMatch) {
      const appName = appMatch[1].toLowerCase();
      void toolRegistry.invoke({
        name: 'system_control',
        args: { action: 'open_app', app: appName },
      });
      return true;
    }
    // Screen Vision voice commands
    if (/(?:look\s+at\s+my\s+screen|start\s+screen\s+sharing|share\s+(?:my\s+)?screen|see\s+what\s+i(?:'m|\s+am)\s+seeing|enable\s+screen\s+vision|turn\s+on\s+vision)/i.test(text)) {
      void screenVisionBridge.startCapture();
      return true;
    }
    if (/(?:stop\s+looking\s+at\s+my\s+screen|stop\s+screen\s+sharing|disable\s+screen\s+vision|turn\s+off\s+vision)/i.test(text)) {
      screenVisionBridge.stopCapture();
      return true;
    }

    if (/^(close browser|close workspace|hide browser|hide workspace)$/.test(text)) {
      this.dispatchEvent(new CustomEvent('command:browser', { detail: { open: false } }));
      return true;
    }

    // Interactive page & browser scrolling commands
    if (/(?:scroll\s+down|scroll\s+for\s+me|scroll\s+lower|page\s+down)/i.test(text)) {
      this.dispatchEvent(new CustomEvent('command:scroll_info_card', { detail: { direction: 'down' } }));
      this.dispatchEvent(new CustomEvent('command:browser_scroll', { detail: { direction: 'down' } }));
      return true;
    }
    if (/(?:scroll\s+up|scroll\s+higher|page\s+up)/i.test(text)) {
      this.dispatchEvent(new CustomEvent('command:scroll_info_card', { detail: { direction: 'up' } }));
      this.dispatchEvent(new CustomEvent('command:browser_scroll', { detail: { direction: 'up' } }));
      return true;
    }

    // Key presses in browser
    if (/(?:press\s+tab|hit\s+tab|next\s+field)/i.test(text)) {
      this.dispatchEvent(new CustomEvent('command:browser_interact', { detail: { action: 'press_key', key: 'Tab' } }));
      return true;
    }
    if (/(?:press\s+enter|hit\s+enter|submit)/i.test(text)) {
      this.dispatchEvent(new CustomEvent('command:browser_interact', { detail: { action: 'press_key', key: 'Enter' } }));
      return true;
    }

    // Play/Pause active video or music
    if (/(?:pause\s+(?:the\s+)?(?:video|music|player)|stop\s+(?:the\s+)?(?:video|music))/i.test(text)) {
      this.dispatchEvent(new CustomEvent('command:browser_interact', { detail: { action: 'play_pause' } }));
      return true;
    }
    if (/(?:resume\s+(?:the\s+)?(?:video|music|player))/i.test(text)) {
      this.dispatchEvent(new CustomEvent('command:browser_interact', { detail: { action: 'play_pause' } }));
      return true;
    }
    // Dynamic panel dismissal
    if (/^(?:ok\s+|okay\s+)?done$|^close\s+(?:panel|card|review|dialog|window)$/i.test(text)) {
      this.dispatchEvent(new CustomEvent('command:info_card', { detail: { open: false } }));
      return true;
    }
    if (/^(remember my voice|learn my voice|calibrate voice|calibrate my voice)$/.test(text)) {
      this.dispatchEvent(new CustomEvent('command:calibrate_voice'));
      return true;
    }
    if (/^(enable crowd filter|crowd mode on|voice focus on|focus on my voice|listen only to me)$/.test(text)) {
      this.crowdFilterEnabled = true;
      this.saveControlPrefs();
      this.dispatchEvent(new CustomEvent('command:notification', {
        detail: { message: 'Voice Focus: Listening only to your voice (crowd ignored)', level: 'success' },
      }));
      return true;
    }
    if (/^(disable crowd filter|crowd mode off|voice focus off)$/.test(text)) {
      this.crowdFilterEnabled = false;
      this.saveControlPrefs();
      this.dispatchEvent(new CustomEvent('command:notification', {
        detail: { message: 'Crowd filter disabled', level: 'info' },
      }));
      return true;
    }
    const m = text.match(/^(?:shape|transform(?: into)?|morph(?: into)?|become)\s+([a-z0-9-]+)$/);
    if (m && ALL_SHAPES.includes(m[1] as SophiaShape)) {
      this.dispatchEvent(new CustomEvent('command:transform', { detail: { shape: m[1] } }));
      return true;
    }
    return false;
  }

  async execute(call: FunctionCall): Promise<Record<string, unknown>> {
    // ── Delegate to the tool registry for all registered tools ──────────────
    if (toolRegistry.has(call.name)) {
      return toolRegistry.invoke({ name: call.name, args: call.args, id: call.id });
    }

    // ── Legacy: transform_shape (not yet in registry, fast local dispatch) ──
    if (call.name === 'transform_shape') {
      const shape = String(call.args?.shape ?? 'organic') as SophiaShape;
      if (ALL_SHAPES.includes(shape)) {
        this.dispatchEvent(new CustomEvent('command:transform', { detail: { shape } }));
        return { status: 'transformed', shape };
      }
      return { status: 'unknown_shape', requested: shape };
    }

    // ── Legacy: generate_image ───────────────────────────────────────────────
    if (call.name === 'generate_image') {
      const prompt = String(call.args?.prompt ?? '');
      const aspectRatio = String(call.args?.aspectRatio ?? '1:1');
      try {
        const res = await fetch('/api/sophia/image/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt, aspectRatio }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed' }));
          return { error: err.error || 'Failed to generate image' };
        }
        const data = await res.json();
        this.dispatchEvent(new CustomEvent('image:generated', { detail: data }));
        this.addSophiaTurn(data.prompt || 'Here you go!', true, {
          imageUrl: data.url,
          imagePrompt: data.prompt,
        });
        return { status: 'success', prompt: data.prompt, url: data.url };
      } catch (err: any) {
        return { error: err.message || 'Image generation network error' };
      }
    }

    // ── Legacy: control_ui (old name) ────────────────────────────────────────
    if (call.name === 'control_ui') {
      if (call.args?.target === 'browser' && call.args?.action === 'open') {
        void toolRegistry.invoke({
          name: 'system_control',
          args: { action: 'open_browser', url: 'https://www.google.com' },
          id: call.id,
        });
      }
      return toolRegistry.invoke({
        name: 'ui_control',
        args: {
          action: call.args?.action === 'open' ? 'open_panel'
            : call.args?.action === 'close' ? 'close_panel'
            : call.args?.action === 'minimize' ? 'close_panel'
            : 'toggle_panel',
          panel: call.args?.target,
        },
        id: call.id,
      });
    }

    // ── Legacy: play_music ──────────────────────────────────────────────────
    if (call.name === 'play_music') {
      const q = String(call.args?.query ?? 'lofi chill music');
      void toolRegistry.invoke({
        name: 'system_control',
        args: { action: 'stream_media', query: q },
        id: call.id,
      });
      return toolRegistry.invoke({
        name: 'ui_control',
        args: {
          action: ['stop', 'pause'].includes(String(call.args?.action)) ? 'stop_music' : 'play_music',
          query: q,
        },
        id: call.id,
      });
    }

    // ── Legacy: open_url / web_search ───────────────────────────────────────
    if (call.name === 'open_url') {
      const targetUrl = String(call.args?.url ?? '').trim() || 'https://www.google.com';
      void toolRegistry.invoke({
        name: 'system_control',
        args: { action: 'open_browser', url: targetUrl },
        id: call.id,
      });
      return toolRegistry.invoke({
        name: 'ui_control',
        args: { action: 'navigate_to_url', url: targetUrl, text: call.args?.title },
        id: call.id,
      });
    }

    return { error: 'unknown_function', name: call.name };
  }
}

export const controlLayer = new ControlLayer();
