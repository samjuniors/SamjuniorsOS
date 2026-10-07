/**
 * SettingsSheet — full control over Sophia's physical substance, voice, and brain.
 *
 * Includes:
 *   - Voice & Mouth Provider: ElevenLabs (High-Fidelity) vs Deepgram Aura (Fast)
 *   - Multiple Voice ID options: Presets, .env configured voice, and custom Voice ID input
 *   - Multi-Brain & Local LLMs: Ollama (Local), LM Studio (Local), Gemini, Grok, Claude, OpenAI
 *   - Display style: [ Full (Rim + Glow) ] vs [ Only Particles ]
 *   - Form: [ Sphere ] vs [ Ring ]
 *   - Interactive State triggers: Idle, Listening, Thinking, Speaking, Rendering, Ambient
 *   - Audio Agent Shape gallery: Waveform, Torus, Infinity, Helix, Hypercube,
 *     Pyramid, Star, Galaxy, Heart, Shield, Matrix, Split, Spiky, Face, Glyphs, etc.
 *   - Save as Default and Reset to Factory Settings
 */

import { Bookmark, Check, ChevronDown, Music, RotateCcw, Volume2, X, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DensityPref, OSStatus, ProviderPref, SophiaOS } from '../sophia/SophiaOS';
import type { ShapeTune } from '../sophia/VisualDirector';
import type { SophiaForm } from '../sophia/ShapeGenerator';
import type { SophiaShape, SophiaStateName } from '../sophia/types';
import { ALL_SHAPES, controlLayer } from '../sophia/control';
import { scoreEngine } from '../sophia/audio/ScoreEngine';
import { userVoiceProfile } from '../core/UserVoiceProfile';
import { screenVisionBridge } from '../sophia/vision/ScreenVisionBridge';
import { decisionEngine, type PreferredMusicSource } from '../sophia/decision-engine';

function SegRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[9px] font-normal uppercase tracking-[0.24em] text-white/40">{label}</p>
      <div className="flex flex-wrap overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-0.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`h-7 min-w-[70px] flex-1 rounded-lg text-[9px] font-normal tracking-[0.08em] transition-all duration-200 ${
              value === o.id
                ? 'border border-sky-400/30 bg-sky-400/[0.18] text-sky-100 shadow-[inset_0_0_10px_rgba(56,189,248,0.18)]'
                : 'text-white/45 hover:text-white/80'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className={`flex items-center justify-between ${disabled ? 'opacity-40' : ''}`}>
      <div>
        <p className="text-[10px] font-normal uppercase tracking-[0.2em] text-white/70">{label}</p>
        {hint && <p className="text-[8.5px] font-light text-white/35">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative h-5 w-9 rounded-full border transition-colors duration-200 ${
          on ? 'border-sky-400/50 bg-sky-400/30 shadow-[0_0_10px_rgba(56,189,248,0.3)]' : 'border-white/10 bg-white/5'
        }`}
      >
        <span
          className={`block size-3.5 rounded-full transition-transform duration-200 ${
            on ? 'translate-x-4 bg-sky-300 shadow-[0_0_6px_rgba(125,211,252,0.8)]' : 'translate-x-0.5 bg-white/40'
          }`}
        />
      </button>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const display = format ? format(value) : value.toFixed(2);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-normal uppercase tracking-[0.2em] text-white/55">{label}</span>
        <span className="font-mono text-[9px] text-sky-300/80">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="sophia-range w-full"
      />
    </div>
  );
}

function AccordionSection({
  title,
  badge,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  badge?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-white/[0.06] pt-2.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-1 text-left transition hover:opacity-100"
      >
        <div className="flex items-center gap-2">
          <p className="text-[9.5px] font-normal uppercase tracking-[0.22em] text-white/70">{title}</p>
          {badge && (
            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-1.5 py-0.2 font-mono text-[8px] uppercase tracking-wider text-sky-200">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          size={13}
          className={`text-white/40 transition-transform duration-200 ${isOpen ? 'rotate-180 text-sky-300' : ''}`}
        />
      </button>
      {isOpen && <div className="mt-2.5 space-y-3 pb-1">{children}</div>}
    </div>
  );
}

const STATE_OPTIONS: Array<{ id: SophiaStateName; label: string }> = [
  { id: 'idle', label: 'Idle' },
  { id: 'listening', label: 'Listen' },
  { id: 'thinking', label: 'Think' },
  { id: 'speaking', label: 'Speak' },
  { id: 'rendering', label: 'Render' },
  { id: 'wakeup', label: 'Wake Up' },
  { id: 'paused', label: 'Pause' },
  { id: 'completed', label: 'Complete' },
  { id: 'blocked', label: 'Blocked' },
];

const SHAPE_LABELS: Record<SophiaShape, string> = {
  organic: 'Sphere',
  circle: 'Ring',
  waveform: 'Waveform',
  bow: 'Bow',
  torus: 'Torus',
  infinity: 'Infinity',
  helix: 'DNA Helix',
  hypercube: 'Tesseract',
  pyramid: 'Pyramid',
  star: 'Star',
  galaxy: 'Galaxy',
  heart: 'Heart',
  shield: 'Shield',
  matrix: 'Matrix',
  split: 'Split',
  merge: 'Merge',
  dissolve: 'Dissolve',
  face: 'Face',
  spiky: 'Spiky',
  liquid: 'Liquid',
  'letter-z': 'Glyph Z',
  'letter-s': 'Glyph S',
  'letter-a': 'Glyph A',
  'letter-o': 'Glyph O',
};

function ShapeThumb({ shape }: { shape: SophiaShape }) {
  const stroke = 'rgba(160,210,255,0.85)';
  const common = {
    fill: 'none' as const,
    stroke,
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" aria-hidden="true">
      {shape === 'organic' && <circle cx="12" cy="12" r="7" fill="rgba(90,180,255,0.18)" stroke={stroke} strokeWidth="1.3" />}
      {shape === 'circle' && <circle cx="12" cy="12" r="7" {...common} />}
      {shape === 'waveform' && <path d="M3 12c1.5-6 3-6 4.5 0s3 6 4.5 0 3-6 4.5 0 3 6 4.5 0" {...common} />}
      {shape === 'bow' && <path d="M4 10c4 8 12 8 16 0" {...common} />}
      {shape === 'torus' && (
        <>
          <ellipse cx="12" cy="12" rx="8" ry="4.2" {...common} />
          <ellipse cx="12" cy="12" rx="3.2" ry="1.6" {...common} />
        </>
      )}
      {shape === 'infinity' && <path d="M5 12c0-3 3-5 5-5 4 0 4 10 8 10 2 0 5-2 5-5s-3-5-5-5c-4 0-4 10-8 10-2 0-5-2-5-5z" {...common} />}
      {shape === 'helix' && <path d="M8 4c6 2 6 4 0 6s-6 4 0 6 6 4 0 6" {...common} />}
      {shape === 'hypercube' && (
        <>
          <rect x="5" y="6" width="10" height="10" {...common} />
          <rect x="9" y="8" width="10" height="10" {...common} />
        </>
      )}
      {shape === 'pyramid' && <path d="M12 4 20 19H4z" {...common} />}
      {shape === 'star' && <path d="M12 3.5 14.4 9l6 .4-4.6 3.8 1.5 5.8L12 15.7 6.7 19l1.5-5.8L3.6 9.4l6-.4z" {...common} />}
      {shape === 'galaxy' && (
        <>
          <ellipse cx="12" cy="12" rx="8" ry="3.2" transform="rotate(-28 12 12)" {...common} />
          <circle cx="12" cy="12" r="1.6" fill={stroke} />
        </>
      )}
      {shape === 'heart' && <path d="M12 19s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z" {...common} />}
      {shape === 'shield' && <path d="M12 3 20 7v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V7z" {...common} />}
      {shape === 'matrix' && (
        <>
          <path d="M6 6h12v12H6z" {...common} />
          <path d="M6 12h12M12 6v12" {...common} />
        </>
      )}
      {shape === 'split' && (
        <>
          <circle cx="8" cy="12" r="4" {...common} />
          <circle cx="16" cy="12" r="4" {...common} />
        </>
      )}
      {shape === 'merge' && <path d="M5 8c4 0 4 8 7 8s3-8 7-8" {...common} />}
      {shape === 'dissolve' && (
        <>
          <circle cx="8" cy="9" r="1.2" fill={stroke} />
          <circle cx="14" cy="7" r="1" fill={stroke} />
          <circle cx="17" cy="13" r="1.4" fill={stroke} />
          <circle cx="10" cy="16" r="1.1" fill={stroke} />
          <circle cx="12" cy="11" r="1.6" fill={stroke} />
        </>
      )}
      {shape === 'face' && (
        <>
          <circle cx="12" cy="12" r="7.5" {...common} />
          <circle cx="9.5" cy="10.5" r="0.8" fill={stroke} />
          <circle cx="14.5" cy="10.5" r="0.8" fill={stroke} />
          <path d="M9 14.5c1.5 1.2 4.5 1.2 6 0" {...common} />
        </>
      )}
      {shape === 'spiky' && (
        <path d="M12 3l2 5 5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2z" {...common} />
      )}
      {shape.startsWith('letter-') && (
        <text x="12" y="16.5" textAnchor="middle" fontSize="11" fill={stroke} fontFamily="Inter, sans-serif">
          {shape.slice(-1).toUpperCase()}
        </text>
      )}
    </svg>
  );
}

const STATUS_LABEL: Record<OSStatus, string> = {
  idle: 'Standby · Audio sleeping',
  connecting: 'Connecting voice session…',
  live: 'Live · Full duplex audio active',
  offline: 'Offline · Local fallback ready',
  denied: 'Microphone blocked by browser',
  error: 'Voice transport failed',
};

interface TTSVoiceProfile {
  id: string;
  name: string;
  accent: string;
  gender: 'Female' | 'Male';
  geminiVoice: string;
  elevenLabsVoiceId: string;
  dgVoice: string;
  description: string;
}

const TTS_VOICE_PROFILES: TTSVoiceProfile[] = [
  {
    id: 'au-female',
    name: 'Australian Female (Aoede / Warm Friend)',
    accent: 'Australian',
    gender: 'Female',
    geminiVoice: 'Aoede',
    elevenLabsVoiceId: 'bMxLr8fP6hzNRRi9nJxU',
    dgVoice: 'aura-2-thalia-en',
    description: 'Upbeat, friendly Australian female tone — conversational and lively mate style.',
  },
  {
    id: 'us-male',
    name: 'US Male (Puck / Adam · Deep & Friendly)',
    accent: 'US',
    gender: 'Male',
    geminiVoice: 'Puck',
    elevenLabsVoiceId: 'pNInz6obpgSf9S9P369C',
    dgVoice: 'aura-2-orion-en',
    description: 'Confident, friendly US male voice with natural resonance and clarity.',
  },
  {
    id: 'us-female',
    name: 'US Female (Kore / Rachel · Calm & Natural)',
    accent: 'US',
    gender: 'Female',
    geminiVoice: 'Kore',
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    dgVoice: 'aura-2-asteria-en',
    description: 'Smooth, natural US female voice suitable for focused and relaxed presence.',
  },
  {
    id: 'uk-male',
    name: 'British Male (Charon / George · Refined)',
    accent: 'British',
    gender: 'Male',
    geminiVoice: 'Charon',
    elevenLabsVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
    dgVoice: 'aura-2-helios-en',
    description: 'Cultured, deep British male tone with polite and resonant articulation.',
  },
  {
    id: 'uk-female',
    name: 'British Female (Zephyr / Charlotte · Elegant)',
    accent: 'British',
    gender: 'Female',
    geminiVoice: 'Zephyr',
    elevenLabsVoiceId: 'XB0fDUnXU5powFXDhCwa',
    dgVoice: 'aura-2-stella-en',
    description: 'Expressive British female accent with vibrant presence and warmth.',
  },
  {
    id: 'us-male-calm',
    name: 'Nordic / Calm Male (Fenrir · Authoritative)',
    accent: 'International',
    gender: 'Male',
    geminiVoice: 'Fenrir',
    elevenLabsVoiceId: 'pNInz6obpgSf9S9P369C',
    dgVoice: 'aura-2-perseus-en',
    description: 'Calm, grounded baritone tone with authoritative steady pace.',
  },
  {
    id: 'us-female-soft',
    name: 'Soft Whisper Female (Zephyr / Nicole · Gentle)',
    accent: 'US',
    gender: 'Female',
    geminiVoice: 'Zephyr',
    elevenLabsVoiceId: 'piTKgcLEGmPE4e6mEKli',
    dgVoice: 'aura-2-luna-en',
    description: 'Intimate, gentle feminine whisper voice with soft dynamics.',
  },
];

const GEMINI_VOICES = [
  { id: 'Aoede', label: 'Aoede (Female · Australian Friend / Warm & Engaging)' },
  { id: 'Kore', label: 'Kore (Female · Relaxed & Natural)' },
  { id: 'Zephyr', label: 'Zephyr (Female · Bright & Lively)' },
  { id: 'Puck', label: 'Puck (Male · Friendly & Playful)' },
  { id: 'Charon', label: 'Charon (Male · Deep & Resonant)' },
  { id: 'Fenrir', label: 'Fenrir (Male · Calm & Authoritative)' },
];

const DEFAULT_ELEVENLABS_VOICES = [
  { id: 'bMxLr8fP6hzNRRi9nJxU', label: 'Sophia Custom (.env)' },
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel (Calm & Clear)' },
  { id: 'pNInz6obpgSf9S9P369C', label: 'Adam (Warm & Deep)' },
  { id: 'piTKgcLEGmPE4e6mEKli', label: 'Nicole (Soft Whisper)' },
  { id: 'XB0fDUnXU5powFXDhCwa', label: 'Charlotte (Expressive)' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George (British)' },
  { id: 'custom', label: 'Custom Voice ID…' },
];

const DEEPGRAM_VOICES = [
  { id: 'aura-2-thalia-en', label: 'Aura-2 Thalia (Natural)' },
  { id: 'aura-2-asteria-en', label: 'Aura-2 Asteria (Warm)' },
  { id: 'aura-2-luna-en', label: 'Aura-2 Luna (Calm)' },
  { id: 'aura-2-stella-en', label: 'Aura-2 Stella (Friendly)' },
  { id: 'aura-2-athena-en', label: 'Aura-2 Athena (Clear)' },
  { id: 'aura-2-orion-en', label: 'Aura-2 Orion (Confident)' },
  { id: 'aura-2-perseus-en', label: 'Aura-2 Perseus (Expressive)' },
  { id: 'aura-2-helios-en', label: 'Aura-2 Helios (Deep)' },
];

const BRAIN_OPTIONS = [
  { id: 'auto', label: 'Auto (Smart Fallback)' },
  { id: 'ollama', label: 'Ollama (Local LLM)' },
  { id: 'lmstudio', label: 'LM Studio (Local)' },
  { id: 'gemini', label: 'Gemini 3.8 Flash' },
  { id: 'grok', label: 'Grok 4.5 (xAI)' },
  { id: 'claude', label: 'Claude Sonnet 4.6' },
  { id: 'openai', label: 'OpenAI GPT-6 Sol' },
];

export function SettingsSheet({ os, status, onClose }: { os: SophiaOS; status: OSStatus; onClose: () => void }) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const p = os.prefs;
  const state = os.state.current;

  // Collapsible accordion states
  const [sections, setSections] = useState({
    env: true,
    perception: true,
    voice: true,
    brain: false,
    form: false,
    tuning: false,
    states: false,
    shapes: false,
    atmo: false,
    system: false,
  });

  const toggleSection = (key: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const [visionActive, setVisionActive] = useState(screenVisionBridge.active);
  const [prefMusic, setPrefMusic] = useState<PreferredMusicSource>(decisionEngine.getPreferredMusic());

  useEffect(() => {
    const handleVision = (e: Event) => {
      setVisionActive(Boolean((e as CustomEvent).detail?.active));
    };
    screenVisionBridge.addEventListener('vision:state', handleVision);
    return () => screenVisionBridge.removeEventListener('vision:state', handleVision);
  }, []);

  const [savedNotice, setSavedNotice] = useState(false);
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [elevenVoices, setElevenVoices] = useState(DEFAULT_ELEVENLABS_VOICES);
  const [customVoiceId, setCustomVoiceId] = useState(controlLayer.elevenLabsVoiceId);
  const [isCustomSelected, setIsCustomSelected] = useState(
    !DEFAULT_ELEVENLABS_VOICES.some((v) => v.id === controlLayer.elevenLabsVoiceId && v.id !== 'custom'),
  );
  const [testingVoice, setTestingVoice] = useState(false);
  const [scoreEnabled, setScoreEnabled] = useState(scoreEngine.isEnabled);
  const [scoreAmbientLoop, setScoreAmbientLoop] = useState(scoreEngine.isAmbientLoopEnabled);
  const [scoreVolume, setScoreVolume] = useState(scoreEngine.getMasterVolume());

  useEffect(() => {
    os.addEventListener('prefs', rerender);
    os.addEventListener('state', rerender);
    return () => {
      os.removeEventListener('prefs', rerender);
      os.removeEventListener('state', rerender);
    };
  }, [os]);

  useEffect(() => {
    fetch('/api/sophia/status')
      .then((r) => r.json())
      .then((data) => setServerStatus(data))
      .catch(() => undefined);

    fetch('/api/sophia/elevenlabs/voices')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.voices) && data.voices.length > 0) {
          const mapped = data.voices.map((v: any) => ({
            id: v.voice_id,
            label: `${v.name} (${v.voice_id.slice(0, 6)}…)`,
          }));
          mapped.push({ id: 'custom', label: 'Custom Voice ID…' });
          setElevenVoices(mapped);
        }
      })
      .catch(() => undefined);
  }, []);

  const setTune = (patch: Partial<ShapeTune>) => os.savePrefs({ tune: { ...p.tune, ...patch } });

  const triggerShape = (sh: SophiaShape) => {
    os.execCommand(`shape ${sh}`);
  };

  const triggerState = (st: SophiaStateName) => {
    if (st === 'wakeup') os.wakeUp('settings');
    else if (st === 'paused' || st === 'pause') os.pause();
    else {
      os.resume();
      os.state.setState(st, { reason: 'settings-trigger' });
    }
    rerender();
  };

  const handleVoiceProfileChange = (profileId: string) => {
    const prof = TTS_VOICE_PROFILES.find((p) => p.id === profileId);
    if (!prof) return;

    // Save in OS configuration (Prefs)
    os.savePrefs({ voiceProfile: profileId });

    // Update ControlLayer runtime parameters
    controlLayer.voiceProfile = profileId;
    controlLayer.voiceName = prof.geminiVoice;
    controlLayer.elevenLabsVoiceId = prof.elevenLabsVoiceId;
    controlLayer.dgVoice = prof.dgVoice;
    controlLayer.saveControlPrefs();

    setIsCustomSelected(false);
    rerender();
    void os.applyVoiceSettings();
  };

  const handleVoiceSelect = (id: string) => {
    if (id === 'custom') {
      setIsCustomSelected(true);
    } else {
      setIsCustomSelected(false);
      controlLayer.elevenLabsVoiceId = id;
      controlLayer.saveControlPrefs();
      rerender();
      void os.applyVoiceSettings();
    }
  };

  const handleCustomVoiceSubmit = (val: string) => {
    const trimmed = val.trim();
    setCustomVoiceId(trimmed);
    if (trimmed) {
      controlLayer.elevenLabsVoiceId = trimmed;
      controlLayer.saveControlPrefs();
      rerender();
      void os.applyVoiceSettings();
    }
  };

  const handleSave = () => {
    try {
      localStorage.setItem('sophia:prefs', JSON.stringify(os.prefs));
      controlLayer.saveControlPrefs();
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2200);
    } catch {
      /* noop */
    }
  };

  const handleReset = () => {
    os.resetPrefs();
    controlLayer.voiceProfile = 'au-female';
    controlLayer.voiceName = 'Aoede';
    controlLayer.elevenLabsVoiceId = 'bMxLr8fP6hzNRRi9nJxU';
    controlLayer.dgVoice = 'aura-2-thalia-en';
    controlLayer.mouthProvider = 'elevenlabs';
    controlLayer.brainMode = 'auto';
    controlLayer.saveControlPrefs();
    rerender();
  };

  return (
    <>
      <button aria-label="Close settings" className="fixed inset-0 z-10 cursor-default" onClick={onClose} />
      <section
        aria-label="Settings"
        className="glass-panel panel-in panel-in-top-right fixed top-[70px] right-4 left-4 z-30 max-h-[calc(100vh-86px)] overflow-y-auto rounded-2xl p-4 sm:left-auto sm:right-11 sm:top-[76px] sm:w-[360px] sm:max-h-[calc(100vh-96px)]"
      >
        <div className="mb-3 flex items-center justify-between border-b border-white/[0.06] pb-2.5">
          <div className="flex items-center gap-2">
            <span className="block size-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
            <p className="text-[10px] font-normal uppercase tracking-[0.28em] text-white/70">Settings & Intelligence</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-sky-200">
              {state}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="grid size-6 place-items-center rounded-lg text-white/40 transition hover:bg-white/[0.06] hover:text-white"
            >
              <X size={13} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {/* ENVIRONMENT: GEMINI LIVE API & ASR BARGE-IN */}
          <AccordionSection
            title="Environment & Gemini Live Setup"
            badge={controlLayer.pureGeminiLive ? 'Pure Gemini' : 'Configured'}
            isOpen={sections.env}
            onToggle={() => toggleSection('env')}
          >
            {/* Pure Gemini Live Master Mode */}
            <div className="space-y-2.5 rounded-xl border border-sky-400/40 bg-gradient-to-b from-sky-950/40 to-sky-950/10 p-3 shadow-[0_0_16px_rgba(56,189,248,0.15)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="block size-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)] animate-pulse" />
                  <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-sky-200">
                    Pure Gemini Live API Mode
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={controlLayer.pureGeminiLive}
                  onClick={() => {
                    const next = !controlLayer.pureGeminiLive;
                    controlLayer.setPureGeminiLive(next);
                    if (next) {
                      os.savePrefs({ provider: 'gemini-live' });
                    }
                    rerender();
                  }}
                  className={`relative h-5 w-9 rounded-full border transition-colors duration-200 ${
                    controlLayer.pureGeminiLive
                      ? 'border-sky-400/50 bg-sky-400/30 shadow-[0_0_10px_rgba(56,189,248,0.3)]'
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  <span
                    className={`block size-3.5 rounded-full transition-transform duration-200 ${
                      controlLayer.pureGeminiLive
                        ? 'translate-x-4 bg-sky-300 shadow-[0_0_6px_rgba(125,211,252,0.8)]'
                        : 'translate-x-0.5 bg-white/40'
                    }`}
                  />
                </button>
              </div>

              <p className="text-[8.5px] leading-relaxed text-sky-200/80">
                Uses the Gemini Live API key for microphone streaming, brain reasoning, and voice output across the application. External split backends are bypassed.
              </p>

              <div className="flex items-center justify-between pt-1 border-t border-sky-400/15">
                <span className="text-[8.5px] font-mono text-sky-300/70">Model: models/gemini-3.8-live</span>
                <button
                  type="button"
                  onClick={() => {
                    void os.resetGeminiLiveSession();
                    rerender();
                  }}
                  className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[8.5px] font-medium text-sky-200 hover:bg-sky-400/20 active:scale-95"
                >
                  Reset & Reconnect
                </button>
              </div>
            </div>

            {/* ASR Voice Interruption (Barge-In) Card */}
            <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 shadow-[0_0_12px_rgba(16,185,129,0.1)]">
              <ToggleRow
                label="ASR Barge-in Interruption"
                hint="When you speak into the microphone, immediately cut off Sophia's current voice playback so you can interrupt live."
                on={controlLayer.asrInterruption}
                onChange={(on) => {
                  controlLayer.asrInterruption = on;
                  controlLayer.saveControlPrefs();
                  rerender();
                }}
              />
            </div>

            {/* Environment Status Summary */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 font-mono text-[8.5px] space-y-1">
              <div className="flex justify-between text-white/60">
                <span>API Protocol</span>
                <span className="text-sky-300">WebSocket Bidi (PCM16)</span>
              </div>
              <div className="flex justify-between text-white/60">
                <span>Environment Key</span>
                <span className={serverStatus?.gemini ? 'text-emerald-400' : 'text-amber-400'}>
                  {serverStatus?.gemini ? 'GEMINI_API_KEY Configured' : 'Checking Key...'}
                </span>
              </div>
            </div>
          </AccordionSection>

          {/* PERCEPTION & DECISION ENGINE */}
          <AccordionSection
            title="Multimodal Vision & Decision Engine"
            badge={visionActive ? 'Vision Live' : 'Smart'}
            isOpen={sections.perception}
            onToggle={() => toggleSection('perception')}
          >
            {/* Screen Vision (Visual Perception) Card */}
            <div className={`space-y-2.5 rounded-xl border p-3 transition-colors ${
              visionActive
                ? 'border-emerald-500/40 bg-emerald-950/30 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
                : 'border-white/10 bg-white/[0.03]'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`block size-2 rounded-full ${
                    visionActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse' : 'bg-neutral-500'
                  }`} />
                  <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/90">
                    Real-Time Screen Vision
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void screenVisionBridge.toggleCapture()}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[9px] font-semibold transition-all ${
                    visionActive
                      ? 'border-rose-500/40 bg-rose-950/30 text-rose-300 hover:bg-rose-950/50'
                      : 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-950/50'
                  }`}
                >
                  {visionActive ? <EyeOff size={11} /> : <Eye size={11} />}
                  <span>{visionActive ? 'Stop Sharing' : 'Share Screen'}</span>
                </button>
              </div>

              <p className="text-[8.5px] leading-relaxed text-white/60">
                Pipes display video frames at 1 fps into the Gemini Live multimodal session so Sofia sees your active windows, code, errors, and tabs in real time.
              </p>
            </div>

            {/* Smart Music Decision Routing */}
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[9px] font-normal uppercase tracking-[0.24em] text-white/40">Preferred Music Experience</p>
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {(
                  [
                    { id: 'smart', label: 'Smart Decision', desc: 'In-app ambient for study, Spotify/YT for songs' },
                    { id: 'inapp', label: 'In-App Soundscape', desc: 'Always play ambient audio inside Sofia' },
                    { id: 'spotify', label: 'Spotify', desc: 'Open Spotify web/app for music queries' },
                    { id: 'youtube', label: 'YouTube Music', desc: 'Open YouTube video/music player' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      decisionEngine.setPreferredMusic(opt.id);
                      setPrefMusic(opt.id);
                    }}
                    className={`rounded-lg border p-2 text-left transition-all ${
                      prefMusic === opt.id
                        ? 'border-sky-400/50 bg-sky-400/10 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                        : 'border-white/5 bg-white/[0.02] text-white/50 hover:bg-white/[0.05] hover:text-white/80'
                    }`}
                  >
                    <p className="font-mono text-[9px] font-semibold text-white/90">{opt.label}</p>
                    <p className="text-[7.5px] text-white/40 leading-tight mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </AccordionSection>

          {/* SENSE: EAR & MOUTH (VOICE) */}
          <AccordionSection
            title="Ear & Mouth (Voice System)"
            badge={controlLayer.mouthProvider === 'elevenlabs' ? 'ElevenLabs' : 'Deepgram'}
            isOpen={sections.voice}
            onToggle={() => toggleSection('voice')}
          >

            {/* Hearing / Provider */}
            <SegRow<ProviderPref>
              label="Hearing & Voice Transport"
              value={controlLayer.pureGeminiLive ? 'gemini-live' : p.provider}
              onChange={(provider) => {
                if (controlLayer.pureGeminiLive && provider !== 'gemini-live') {
                  controlLayer.setPureGeminiLive(false);
                }
                os.savePrefs({ provider });
                rerender();
              }}
              options={[
                { id: 'auto', label: 'Auto' },
                { id: 'gemini-live', label: 'Gemini' },
                { id: 'deepgram', label: 'Deepgram' },
                { id: 'elevenlabs', label: 'ElevenLabs' },
              ]}
            />

            {/* USER VOICE MEMORY & CROWD REJECTION */}
            <div className="space-y-2.5 rounded-xl border border-indigo-400/30 bg-indigo-950/20 p-3 shadow-[0_0_12px_rgba(99,102,241,0.12)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`block size-2 rounded-full ${userVoiceProfile.isEnrolled ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400 animate-pulse'}`} />
                  <span className="text-[9.5px] uppercase tracking-[0.2em] font-medium text-indigo-200">User Voice Print & Memory</span>
                </div>
                <span className="font-mono text-[8px] text-indigo-300/80">
                  {userVoiceProfile.isEnrolled ? 'Locked to Your Voice' : 'Learning Voice'}
                </span>
              </div>
              <p className="text-[8.5px] leading-relaxed text-white/60">
                {userVoiceProfile.isEnrolled
                  ? `Sofia remembers your voice (Pitch: ~${Math.round(userVoiceProfile.profileData.f0Mean)} Hz, Confidence: ${Math.round(userVoiceProfile.profileData.confidence * 100)}%). She ignores surrounding crowd chatter and focuses only on you.`
                  : 'Speak naturally into your microphone. Sofia learns and locks onto your voice characteristics so she ignores surrounding crowd chatter.'}
              </p>
              <div className="flex items-center justify-between pt-1">
                <ToggleRow
                  label="Crowd Noise Rejection"
                  hint="Listen and respond ONLY to your voice — ignore other people and crowd chatter."
                  on={controlLayer.crowdFilterEnabled}
                  onChange={(on) => {
                    controlLayer.crowdFilterEnabled = on;
                    controlLayer.saveControlPrefs();
                    rerender();
                  }}
                />
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    userVoiceProfile.resetProfile();
                    controlLayer.dispatchEvent(new CustomEvent('command:notification', {
                      detail: { message: 'Voice print cleared. Sofia will learn your voice again as you speak.', level: 'info' }
                    }));
                    rerender();
                  }}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[8.5px] text-white/70 hover:bg-white/[0.08] active:scale-95"
                >
                  Recalibrate / Re-enroll Voice
                </button>
              </div>
            </div>

            {/* TTS Voice Profile Selection */}
            <div className="space-y-2 rounded-xl border border-sky-400/30 bg-sky-950/25 p-2.5 shadow-[inset_0_0_12px_rgba(56,189,248,0.12)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="block size-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]" />
                  <span className="text-[9px] uppercase tracking-[0.2em] font-medium text-sky-200">TTS Voice Profile</span>
                </div>
                <span className="font-mono text-[8px] text-sky-300/80">
                  {TTS_VOICE_PROFILES.find((vp) => vp.id === (p.voiceProfile || controlLayer.voiceProfile))?.accent ?? 'Configured'}
                </span>
              </div>
              <div className="relative">
                <select
                  value={p.voiceProfile || controlLayer.voiceProfile || 'au-female'}
                  onChange={(e) => handleVoiceProfileChange(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-sky-500/30 bg-[#080d1a] py-2 pl-2.5 pr-8 text-[11px] font-medium text-white shadow-[0_2px_8px_rgba(0,0,0,0.5)] outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                >
                  {TTS_VOICE_PROFILES.map((vp) => (
                    <option key={vp.id} value={vp.id} className="bg-[#080d1a] text-white">
                      {vp.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sky-300/70" />
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-[8.5px] leading-relaxed text-sky-200/70">
                  {TTS_VOICE_PROFILES.find((vp) => vp.id === (p.voiceProfile || controlLayer.voiceProfile))?.description ??
                    'Select voice personality and accent (Australian female, US male/female, British, etc.). Persisted in OS configuration.'}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    setTestingVoice(true);
                    try {
                      await os.testVoice();
                    } finally {
                      setTestingVoice(false);
                    }
                  }}
                  disabled={testingVoice}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/15 px-2.5 py-1 text-[9.5px] font-medium text-sky-200 transition hover:border-sky-400/60 hover:bg-sky-500/25 active:scale-95 disabled:opacity-50"
                  title="Play sample in selected voice"
                >
                  <Volume2 size={12} className={testingVoice ? 'animate-pulse text-amber-300' : ''} />
                  <span>{testingVoice ? 'Playing…' : 'Play Sample'}</span>
                </button>
              </div>
            </div>

            {/* Gemini Live Voice Selection */}
            <div className="space-y-2 rounded-xl border border-sky-500/20 bg-sky-950/15 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-[0.2em] text-sky-200/70">Gemini Live Voice</span>
                <span className="font-mono text-[8px] text-sky-300/60">
                  {controlLayer.voiceName}
                </span>
              </div>
              <select
                value={controlLayer.voiceName}
                onChange={(e) => {
                  controlLayer.voiceName = e.target.value;
                  controlLayer.saveControlPrefs();
                  rerender();
                  void os.applyVoiceSettings();
                }}
                className="w-full rounded-lg border border-white/10 bg-[#080d1a] px-2.5 py-1.5 text-[11px] text-white/90 outline-none focus:border-sky-400"
              >
                {GEMINI_VOICES.map((v) => (
                  <option key={v.id} value={v.id} className="bg-[#080d1a] text-white">
                    {v.label}
                  </option>
                ))}
              </select>
              <p className="text-[8.5px] text-white/40">
                Primary voice used for real-time live conversations with Gemini Live.
              </p>
            </div>

            {/* Speaking Mouth Engine */}
            <div>
              <p className="mb-2 text-[9px] font-normal uppercase tracking-[0.24em] text-white/40">Mouth TTS Engine</p>
              <div className="flex overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    controlLayer.mouthProvider = 'gemini';
                    controlLayer.saveControlPrefs();
                    rerender();
                    void os.applyVoiceSettings();
                  }}
                  className={`h-7 flex-1 rounded-lg text-[9px] font-normal tracking-[0.08em] transition-all duration-200 ${
                    controlLayer.mouthProvider === 'gemini' || controlLayer.mouthProvider === 'auto'
                      ? 'border border-sky-400/30 bg-sky-400/[0.18] text-sky-100 shadow-[inset_0_0_10px_rgba(56,189,248,0.18)]'
                      : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  Gemini (Neural)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    controlLayer.mouthProvider = 'elevenlabs';
                    controlLayer.saveControlPrefs();
                    rerender();
                    void os.applyVoiceSettings();
                  }}
                  className={`h-7 flex-1 rounded-lg text-[9px] font-normal tracking-[0.08em] transition-all duration-200 ${
                    controlLayer.mouthProvider === 'elevenlabs'
                      ? 'border border-sky-400/30 bg-sky-400/[0.18] text-sky-100 shadow-[inset_0_0_10px_rgba(56,189,248,0.18)]'
                      : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  ElevenLabs
                </button>
                <button
                  type="button"
                  onClick={() => {
                    controlLayer.mouthProvider = 'deepgram';
                    controlLayer.saveControlPrefs();
                    rerender();
                    void os.applyVoiceSettings();
                  }}
                  className={`h-7 flex-1 rounded-lg text-[9px] font-normal tracking-[0.08em] transition-all duration-200 ${
                    controlLayer.mouthProvider === 'deepgram'
                      ? 'border border-sky-400/30 bg-sky-400/[0.18] text-sky-100 shadow-[inset_0_0_10px_rgba(56,189,248,0.18)]'
                      : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  Deepgram
                </button>
              </div>
            </div>

            {/* ElevenLabs Voice Selection */}
            {controlLayer.mouthProvider === 'elevenlabs' && (
              <div className="space-y-2 rounded-xl border border-sky-500/20 bg-sky-950/15 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-sky-200/70">ElevenLabs Voice</span>
                  <span className="font-mono text-[8px] text-sky-300/60">
                    ID: {controlLayer.elevenLabsVoiceId.slice(0, 8)}…
                  </span>
                </div>

                <select
                  value={isCustomSelected ? 'custom' : controlLayer.elevenLabsVoiceId}
                  onChange={(e) => handleVoiceSelect(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#080d1a] px-2.5 py-1.5 text-[11px] text-white/90 outline-none focus:border-sky-400"
                >
                  {elevenVoices.map((v) => (
                    <option key={v.id} value={v.id} className="bg-[#080d1a] text-white">
                      {v.label}
                    </option>
                  ))}
                </select>

                {isCustomSelected && (
                  <div>
                    <p className="mb-1 text-[8.5px] text-white/40">Custom ElevenLabs Voice ID</p>
                    <input
                      type="text"
                      placeholder="Paste ElevenLabs Voice ID…"
                      value={customVoiceId}
                      onChange={(e) => handleCustomVoiceSubmit(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#080d1a] px-2.5 py-1 text-[11px] font-mono text-sky-200 placeholder:text-white/20 outline-none focus:border-sky-400"
                    />
                  </div>
                )}

                <SegRow<string>
                  label="ElevenLabs Model"
                  value={controlLayer.elevenLabsModelId}
                  onChange={(m) => {
                    controlLayer.elevenLabsModelId = m;
                    controlLayer.saveControlPrefs();
                    rerender();
                  }}
                  options={[
                    { id: 'eleven_turbo_v2_5', label: 'Turbo 2.5' },
                    { id: 'eleven_multilingual_v2', label: 'Multilingual' },
                    { id: 'eleven_flash_v2_5', label: 'Flash 2.5' },
                  ]}
                />
              </div>
            )}

            {/* Deepgram Aura Voice Selection */}
            {controlLayer.mouthProvider === 'deepgram' && (
              <div className="space-y-2 rounded-xl border border-sky-500/20 bg-sky-950/15 p-2.5">
                <span className="text-[9px] uppercase tracking-[0.2em] text-sky-200/70">Deepgram Voice Model</span>
                <select
                  value={controlLayer.dgVoice}
                  onChange={(e) => {
                    controlLayer.dgVoice = e.target.value;
                    controlLayer.saveControlPrefs();
                    rerender();
                    void os.applyVoiceSettings();
                  }}
                  className="w-full rounded-lg border border-white/10 bg-[#080d1a] px-2.5 py-1.5 text-[11px] text-white/90 outline-none focus:border-sky-400"
                >
                  {DEEPGRAM_VOICES.map((v) => (
                    <option key={v.id} value={v.id} className="bg-[#080d1a] text-white">
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Boot Music & Acoustic Score */}
            <div className="mt-3 space-y-2.5 rounded-xl border border-sky-500/20 bg-sky-950/20 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Music size={12} className="text-sky-300" />
                  <span className="text-[9px] uppercase tracking-[0.2em] text-sky-200">Boot & Wake Audio Score</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !scoreEnabled;
                    setScoreEnabled(next);
                    scoreEngine.setEnabled(next);
                  }}
                  className={`rounded-full px-2 py-0.5 text-[8.5px] font-mono uppercase tracking-wider transition ${
                    scoreEnabled
                      ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
                      : 'border border-white/10 bg-white/5 text-white/40'
                  }`}
                >
                  {scoreEnabled ? 'Enabled' : 'Muted'}
                </button>
              </div>

              <p className="text-[8.5px] text-white/50 leading-relaxed">
                Plays a short wake flourish on awakening (customizable via <code className="text-sky-300 font-mono">public/audio/boot-music.mp3</code>) with dynamic voice ducking. Continuous music is disabled by default.
              </p>

              {scoreEnabled && (
                <div className="space-y-2 pt-1 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between text-[8px] font-mono text-white/60">
                    <span>Flourish Volume</span>
                    <span>{Math.round(scoreVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={scoreVolume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setScoreVolume(v);
                      scoreEngine.setMasterVolume(v);
                    }}
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                  <div className="flex items-center justify-between pt-1 text-[8px] text-white/60">
                    <span className="font-mono">Loop Ambient Bed in Standby</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !scoreAmbientLoop;
                        setScoreAmbientLoop(next);
                        scoreEngine.setAmbientLoopEnabled(next);
                      }}
                      className={`rounded px-1.5 py-0.5 text-[8px] font-mono ${
                        scoreAmbientLoop
                          ? 'border border-sky-400/40 bg-sky-400/20 text-sky-200'
                          : 'border border-white/10 bg-white/5 text-white/40'
                      }`}
                    >
                      {scoreAmbientLoop ? 'ON' : 'OFF (Default)'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </AccordionSection>

          {/* INTELLECT: BRAIN & LOCAL LLMS */}
          <AccordionSection
            title="Brain & LLM Intelligence"
            badge={controlLayer.brainMode.toUpperCase()}
            isOpen={sections.brain}
            onToggle={() => toggleSection('brain')}
          >
            <div>
              <p className="mb-2 text-[9px] font-normal uppercase tracking-[0.24em] text-white/40">Brain Provider</p>
              <select
                value={controlLayer.brainMode}
                onChange={(e) => {
                  controlLayer.brainMode = e.target.value as any;
                  controlLayer.saveControlPrefs();
                  rerender();
                }}
                className="w-full rounded-lg border border-white/10 bg-[#080d1a] px-2.5 py-1.5 text-[11px] text-white/90 outline-none focus:border-sky-400"
              >
                {BRAIN_OPTIONS.map((b) => (
                  <option key={b.id} value={b.id} className="bg-[#080d1a] text-white">
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Ollama Local LLM Configuration */}
            {(controlLayer.brainMode === 'ollama' || controlLayer.brainMode === 'auto') && (
              <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-emerald-300/80">Ollama Local Config</span>
                  <span className="font-mono text-[8px] text-emerald-400/70">Port 11434</span>
                </div>
                <div>
                  <p className="mb-1 text-[8.5px] text-white/40">Model Name</p>
                  <input
                    type="text"
                    placeholder="e.g. ornith-1.5:9b, gemma4:cloud, llama3.2"
                    value={controlLayer.ollamaModel}
                    onChange={(e) => {
                      controlLayer.ollamaModel = e.target.value;
                      controlLayer.saveControlPrefs();
                      rerender();
                    }}
                    className="w-full rounded-lg border border-white/10 bg-[#080d1a] px-2.5 py-1 text-[11px] font-mono text-emerald-200 outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[8.5px] text-white/40">Ollama Server Endpoint</p>
                  <input
                    type="text"
                    placeholder="http://localhost:11434"
                    value={controlLayer.ollamaUrl}
                    onChange={(e) => {
                      controlLayer.ollamaUrl = e.target.value;
                      controlLayer.saveControlPrefs();
                      rerender();
                    }}
                    className="w-full rounded-lg border border-white/10 bg-[#080d1a] px-2.5 py-1 text-[11px] font-mono text-white/80 outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
            )}

            {/* LM Studio Local Configuration */}
            {controlLayer.brainMode === 'lmstudio' && (
              <div className="space-y-2 rounded-xl border border-violet-500/20 bg-violet-950/15 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-violet-300/80">LM Studio Config</span>
                  <span className="font-mono text-[8px] text-violet-400/70">Port 1234</span>
                </div>
                <div>
                  <p className="mb-1 text-[8.5px] text-white/40">LM Studio Endpoint</p>
                  <input
                    type="text"
                    placeholder="http://localhost:1234/v1"
                    value={controlLayer.lmStudioUrl}
                    onChange={(e) => {
                      controlLayer.lmStudioUrl = e.target.value;
                      controlLayer.saveControlPrefs();
                      rerender();
                    }}
                    className="w-full rounded-lg border border-white/10 bg-[#080d1a] px-2.5 py-1 text-[11px] font-mono text-white/80 outline-none focus:border-violet-400"
                  />
                </div>
              </div>
            )}

            {/* Backend Key Status */}
            {serverStatus && (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                <p className="mb-1 text-[8.5px] uppercase tracking-wider text-white/40">Provider Keys in Environment</p>
                <div className="flex flex-wrap gap-1 font-mono text-[8px]">
                  <span className={`px-1.5 py-0.5 rounded ${serverStatus.elevenlabs ? 'bg-sky-500/20 text-sky-300' : 'bg-rose-500/10 text-rose-300/60'}`}>
                    ElevenLabs: {serverStatus.elevenlabs ? 'Configured' : 'Missing'}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded ${serverStatus.deepgram ? 'bg-sky-500/20 text-sky-300' : 'bg-rose-500/10 text-rose-300/60'}`}>
                    Deepgram: {serverStatus.deepgram ? 'Configured' : 'Missing'}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded ${serverStatus.gemini ? 'bg-sky-500/20 text-sky-300' : 'bg-rose-500/10 text-rose-300/60'}`}>
                    Gemini: {serverStatus.gemini ? 'Configured' : 'Missing'}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded ${serverStatus.xai ? 'bg-sky-500/20 text-sky-300' : 'bg-white/5 text-white/30'}`}>
                    Grok: {serverStatus.xai ? 'Configured' : 'Unset'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    Ollama: Local Ready
                  </span>
                </div>
              </div>
            )}
          </AccordionSection>

          {/* SECTION 1: BASE FORM & DISPLAY MODE */}
          <AccordionSection
            title="Base Form & Display"
            badge={p.form}
            isOpen={sections.form}
            onToggle={() => toggleSection('form')}
          >
            <div>
              <p className="mb-2 text-[9px] font-normal uppercase tracking-[0.24em] text-white/40">Display Mode</p>
              <div className="flex overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-0.5">
                <button
                  type="button"
                  onClick={() => setTune({ onlyParticles: false })}
                  className={`h-7 flex-1 rounded-lg text-[9.5px] font-normal tracking-[0.08em] transition-all duration-200 ${
                    !p.tune.onlyParticles
                      ? 'border border-sky-400/30 bg-sky-400/[0.18] text-sky-100 shadow-[inset_0_0_10px_rgba(56,189,248,0.18)]'
                      : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  Full (Rim + Body)
                </button>
                <button
                  type="button"
                  onClick={() => setTune({ onlyParticles: true })}
                  className={`h-7 flex-1 rounded-lg text-[9.5px] font-normal tracking-[0.08em] transition-all duration-200 ${
                    p.tune.onlyParticles
                      ? 'border border-sky-400/30 bg-sky-400/[0.18] text-sky-100 shadow-[inset_0_0_10px_rgba(56,189,248,0.18)]'
                      : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  Particles Only
                </button>
              </div>
            </div>

            <SegRow<SophiaForm>
              label="Base Form"
              value={p.form}
              onChange={(form) => os.savePrefs({ form })}
              options={[
                { id: 'sphere', label: 'Sphere' },
                { id: 'ring', label: 'Ring' },
              ]}
            />
          </AccordionSection>

          {/* SECTION 2: SHAPE CORRECTION, BLOOM & SATURATION */}
          <AccordionSection
            title="Shape Fine Tuning & Color"
            badge="Glow & Color"
            isOpen={sections.tuning}
            onToggle={() => toggleSection('tuning')}
          >
            <Slider label="Overall Size" value={p.tune.scale} min={0.8} max={1.2} step={0.01} onChange={(v) => setTune({ scale: v })} />
            <Slider label="Particle Point Size" value={p.tune.particleScale} min={0.6} max={2.2} step={0.05} onChange={(v) => setTune({ particleScale: v })} />
            <Slider label="Sparkle Intensity" value={p.tune.sparkle} min={0.0} max={2.0} step={0.05} onChange={(v) => setTune({ sparkle: v })} />
            {!p.tune.onlyParticles && (
              <Slider label="Rim Thickness" value={p.tune.rim} min={0.6} max={1.6} step={0.02} onChange={(v) => setTune({ rim: v })} />
            )}
            <Slider label="Shape Glow / Bloom" value={p.tune.glow} min={0.4} max={1.8} step={0.02} onChange={(v) => setTune({ glow: v })} />
            <Slider label="Color Hue (0° - 360°)" value={p.tune.hue} min={0} max={360} step={1} format={(v) => `${Math.round(v)}°`} onChange={(v) => setTune({ hue: v })} />
            <Slider label="Color Saturation" value={p.tune.saturation} min={0.4} max={2.0} step={0.05} onChange={(v) => setTune({ saturation: v })} />
          </AccordionSection>

          {/* SECTION 3: STATES (REACTIVE PREVIEW) */}
          <AccordionSection
            title="Entity States (Simulation)"
            badge={state}
            isOpen={sections.states}
            onToggle={() => toggleSection('states')}
          >
            <p className="text-[8.5px] font-light text-white/40">
              Trigger states directly to preview audio reaction, halo pulsation, and physical morphs.
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {STATE_OPTIONS.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => triggerState(st.id)}
                  className={`h-8 rounded-xl border text-[9px] font-normal uppercase tracking-wider transition-all duration-200 ${
                    state === st.id
                      ? 'border-sky-400/50 bg-sky-400/[0.22] text-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                      : 'border-white/[0.08] bg-white/[0.02] text-white/55 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </AccordionSection>

          {/* SECTION 4: SHAPES & SACRED GEOMETRY */}
          <AccordionSection
            title="Audio Agent Shapes"
            badge={`${ALL_SHAPES.length} Forms`}
            isOpen={sections.shapes}
            onToggle={() => toggleSection('shapes')}
          >
            <p className="text-[8.5px] font-light text-white/40">
              Transforms Sophia into sacred geometries. Say or trigger commands like &ldquo;waveform&rdquo;, &ldquo;torus&rdquo;, or &ldquo;spiky&rdquo;.
            </p>
            <div className="grid grid-cols-2 gap-1.5 max-h-[220px] overflow-y-auto pr-1">
              {ALL_SHAPES.map((sh) => (
                <button
                  key={sh}
                  type="button"
                  onClick={() => triggerShape(sh)}
                  className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-2.5 text-left text-[9px] tracking-wide text-white/70 transition-all hover:border-sky-400/40 hover:bg-sky-400/[0.08] hover:text-white active:scale-[0.98]"
                >
                  <ShapeThumb shape={sh} />
                  <span className="truncate">{SHAPE_LABELS[sh]}</span>
                </button>
              ))}
            </div>
          </AccordionSection>

          {/* SECTION 5: ATMOSPHERE & BACKGROUND MOTES */}
          <AccordionSection
            title="Atmosphere & Dust Motes"
            badge="Environment"
            isOpen={sections.atmo}
            onToggle={() => toggleSection('atmo')}
          >
            <Slider label="Dust Mote Density" value={p.tune.dustAmount} min={0} max={200} step={5} format={(v) => `${Math.round(v)}`} onChange={(v) => setTune({ dustAmount: v })} />
            <Slider label="Mote Drift Speed" value={p.tune.dustSpeed} min={0.1} max={3.0} step={0.1} onChange={(v) => setTune({ dustSpeed: v })} />
            <Slider label="Background Intensity" value={p.tune.backgroundIntensity} min={0.0} max={1.0} step={0.02} onChange={(v) => setTune({ backgroundIntensity: v })} />
          </AccordionSection>

          {/* SECTION 6: SYSTEM & GESTURES */}
          <AccordionSection
            title="System & Gestures"
            badge={p.motion}
            isOpen={sections.system}
            onToggle={() => toggleSection('system')}
          >
            <ToggleRow
              label="Hey Sofia wake-word"
              hint="background microphone detection"
              on={p.wake}
              onChange={(wake) => os.savePrefs({ wake })}
            />
            <SegRow<DensityPref>
              label="Particle Mesh Density"
              value={p.density}
              onChange={(density) => os.savePrefs({ density })}
              options={[
                { id: 'auto', label: 'Auto' },
                { id: 'high', label: 'High (60k)' },
                { id: 'medium', label: 'Med (35k)' },
                { id: 'low', label: 'Low (15k)' },
              ]}
            />
            <SegRow
              label="Motion"
              value={p.motion}
              onChange={(motion) => os.savePrefs({ motion })}
              options={[
                { id: 'auto', label: 'Auto' },
                { id: 'full', label: 'Full' },
                { id: 'reduce', label: 'Minimal' },
              ]}
            />
            <ToggleRow
              label="Haptic & chime"
              hint="soft pulse on wake, pause, complete"
              on={p.haptics}
              onChange={(haptics) => os.savePrefs({ haptics })}
            />
          </AccordionSection>

          {/* SESSION STATUS */}
          <div className="border-t border-white/[0.06] pt-2.5">
            <p className="text-[9px] font-normal uppercase tracking-[0.24em] text-white/40">Session</p>
            <p className="mt-1 text-[10px] font-light tracking-wide text-white/50">{STATUS_LABEL[status]}</p>
            {os.isMicDisabledError && (
              <button
                type="button"
                onClick={() => {
                  os.resetMicError();
                  rerender();
                }}
                className="mt-2.5 h-7 w-full rounded-xl border border-rose-400/25 bg-rose-500/[0.08] text-[9.5px] font-normal tracking-[0.14em] text-rose-200 transition-all hover:bg-rose-500/[0.15] hover:border-rose-400/40 active:scale-[0.98]"
              >
                CLEAR VOICE ERROR & RETRY
              </button>
            )}
          </div>

          {/* SAVE & RESET ACTIONS */}
          <div className="border-t border-white/[0.08] pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-500/[0.18] text-[9.5px] font-normal tracking-[0.14em] text-sky-100 transition-all hover:border-sky-400/60 hover:bg-sky-500/[0.28] active:scale-[0.98]"
              >
                {savedNotice ? (
                  <>
                    <Check size={12} className="text-emerald-400" />
                    <span className="text-emerald-300">SAVED TO STORAGE</span>
                  </>
                ) : (
                  <>
                    <Bookmark size={11} className="text-sky-300" />
                    <span>SAVE SETTINGS</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleReset}
                title="Reset all settings to factory default"
                className="flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 text-[9.5px] font-normal tracking-[0.14em] text-white/50 transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-white active:scale-[0.98]"
              >
                <RotateCcw size={11} />
                <span>RESET</span>
              </button>
            </div>
            <p className="text-center text-[8.5px] font-light text-white/30">
              Saved settings persist in localStorage and restore on launch
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
