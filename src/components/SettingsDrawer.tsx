import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Mic,
  Sliders,
  Volume2,
  Sparkles,
  ChevronDown,
  Eye,
  EyeOff,
  Music,
  DollarSign,
  RotateCcw,
  Sparkle,
  Layers,
  Activity,
  UserCheck,
  ChevronUp,
  Circle,
  Play,
  Shapes,
} from 'lucide-react';
import { Emotion, VoiceConfig, WakeSettings } from '../types/sofia';
import type { SophiaOS, DensityPref } from '../sofia/sophia/SophiaOS';
import type { SophiaShape } from '../sofia/sophia/types';
import type { SophiaForm } from '../sofia/sophia/ShapeGenerator';
import { ALL_SHAPES, controlLayer } from '../sofia/sophia/control';
import { scoreEngine } from '../sofia/sophia/audio/ScoreEngine';
import { screenVisionBridge } from '../sofia/sophia/vision/ScreenVisionBridge';
import { userVoiceProfile } from '../sofia/core/UserVoiceProfile';
import { decisionEngine, type PreferredMusicSource } from '../sofia/sophia/decision-engine';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  emotion: Emotion;
  onEmotionChange: (emotion: Emotion) => void;
  voiceConfig: VoiceConfig;
  onVoiceConfigChange: (config: Partial<VoiceConfig>) => void;
  wakeSettings: WakeSettings;
  onWakeSettingsChange: (settings: Partial<WakeSettings>) => void;
  onTestWakeWord: () => void;
  serverStatus?: {
    hasApiKey: boolean;
    status: string;
    models: any;
    deepgram?: boolean;
    elevenlabs?: boolean;
    gemini?: boolean;
  } | null;
  os?: SophiaOS;
}

export interface TTSVoiceProfile {
  id: string;
  name: string;
  accent: string;
  gender: 'Female' | 'Male';
  geminiVoice: 'Aoede' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
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
  const stroke = 'rgba(56,189,248,0.85)';
  const common = {
    fill: 'none' as const,
    stroke,
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" aria-hidden="true">
      {shape === 'organic' && <circle cx="12" cy="12" r="7" fill="rgba(56,189,248,0.18)" stroke={stroke} strokeWidth="1.3" />}
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

/* ── Collapsible Accordion Section Component ── */
function CollapsibleSection({
  title,
  badge,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all duration-200 hover:border-white/15">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between p-3.5 text-left transition-colors duration-150 hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="text-cyan-400 shrink-0">{icon}</div>
          <div className="truncate">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/90">
              {title}
            </span>
          </div>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-cyan-300' : ''
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] p-3.5 space-y-4 bg-black/20">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  emotion,
  onEmotionChange,
  voiceConfig,
  onVoiceConfigChange,
  wakeSettings,
  onWakeSettingsChange,
  onTestWakeWord: _onTestWakeWord,
  serverStatus,
  os,
}) => {
  // Collapsible sections state
  const [sections, setSections] = useState<Record<string, boolean>>({
    voice: true,
    wake: true,
    baseForm: false,
    shapes: false,
    music: false,
    atmosphere: false,
    multimodal: false,
    spend: false,
  });

  const toggleSection = (id: string) => {
    setSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allCollapsed = Object.values(sections).every((v) => !v);
  const toggleAll = () => {
    const nextState = allCollapsed;
    setSections({
      voice: nextState,
      wake: nextState,
      baseForm: nextState,
      shapes: nextState,
      music: nextState,
      atmosphere: nextState,
      multimodal: nextState,
      spend: nextState,
    });
  };

  // State for live spend tracking
  const [spendData, setSpendData] = useState<{
    dailySpendCapUsd: number | null;
    currentDailySpendUsd: number;
    interactiveSpendUsd: number;
    autonomousSpendUsd: number;
    canRunAutonomous: boolean;
    isCapReached: boolean;
  } | null>(null);
  const [spendCapInput, setSpendCapInput] = useState<string>('');
  const [savingSpendCap, setSavingSpendCap] = useState(false);
  const [spendNotice, setSpendNotice] = useState<string | null>(null);

  // G12.8 Autonomy Settings State
  const [autonomyRules, setAutonomyRules] = useState<Record<string, any>>({
    read: { currentLevel: 'L3' },
    draft: { currentLevel: 'L3' },
    internal_write: { currentLevel: 'L2' },
    external_reversible: { currentLevel: 'L2' },
    external_hard_to_reverse: { currentLevel: 'L2' },
    financial_legal: { currentLevel: 'L1' },
    destructive_security: { currentLevel: 'L0' },
  });
  const [selectedActionClass, setSelectedActionClass] = useState<string>('internal_write');
  const [selectedLevel, setSelectedLevel] = useState<string>('L2');
  const [founderQuoteInput, setFounderQuoteInput] = useState<string>('Founder updated autonomy limits in settings.');
  const [savingAutonomy, setSavingAutonomy] = useState<boolean>(false);
  const [autonomyNotice, setAutonomyNotice] = useState<string | null>(null);

  // Vision, barge-in, sound score, and voiceprint states
  const [visionActive, setVisionActive] = useState(screenVisionBridge.active);
  const [bargeInEnabled, setBargeInEnabled] = useState(controlLayer.asrInterruption);
  const [crowdFilter, setCrowdFilter] = useState(controlLayer.crowdFilterEnabled);
  const [isVoiceEnrolled, setIsVoiceEnrolled] = useState(userVoiceProfile.isEnrolled);
  const [scoreEnabled, setScoreEnabled] = useState(scoreEngine.isEnabled);
  const [scoreVolume, setScoreVolume] = useState(scoreEngine.getMasterVolume());
  const [scoreAmbientLoop, setScoreAmbientLoop] = useState(scoreEngine.isAmbientLoopEnabled);
  const [prefMusic, setPrefMusic] = useState<PreferredMusicSource>(decisionEngine.getPreferredMusic());

  // Particle & Base Form tune values from SophiaOS
  const [, setRerenderTrigger] = useState(0);
  const currentForm: SophiaForm = os?.prefs.form || 'sphere';
  const currentTune = os?.prefs.tune || {
    glow: 1.2,
    sparkle: 1.0,
    dustAmount: 80,
    dustSpeed: 1.0,
    particleScale: 1.0,
    scale: 1.0,
    rim: 1.0,
    hue: 0,
    saturation: 1.0,
    onlyParticles: false,
    backgroundIntensity: 0.8,
  };
  const currentDensity = os?.prefs.density || 'auto';

  // Load live spend data
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/sofia/spend')
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d?.success && d.settings) {
          setSpendData({
            dailySpendCapUsd: d.settings.dailySpendCapUsd,
            currentDailySpendUsd: d.settings.currentDailySpendUsd,
            interactiveSpendUsd: d.settings.interactiveSpendUsd,
            autonomousSpendUsd: d.settings.autonomousSpendUsd,
            canRunAutonomous: d.canRunAutonomous,
            isCapReached: d.isCapReached,
          });
          if (d.autonomyRules) {
            setAutonomyRules(d.autonomyRules);
          }
          setSpendCapInput(
            d.settings.dailySpendCapUsd !== null && d.settings.dailySpendCapUsd !== undefined
              ? String(d.settings.dailySpendCapUsd)
              : ''
          );
        }
      })
      .catch(() => undefined);
  }, [isOpen]);

  // Sync screen vision listener
  useEffect(() => {
    const handleVision = (e: Event) => {
      setVisionActive(Boolean((e as CustomEvent).detail?.active));
    };
    screenVisionBridge.addEventListener('vision:state', handleVision);
    return () => screenVisionBridge.removeEventListener('vision:state', handleVision);
  }, []);

  // G12.8: Update autonomy level handler
  const handleUpdateAutonomyLevel = async (actionClass: string, newLevel: string) => {
    setSavingAutonomy(true);
    try {
      const res = await fetch('/api/sofia/autonomy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionClass,
          newLevel,
          founderQuote: founderQuoteInput || 'Founder updated autonomy limit in settings.',
          founderDecisionId: `decision-settings-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (data.success && data.autonomyRules) {
        setAutonomyRules(data.autonomyRules);
        setAutonomyNotice(data.message || `Autonomy for ${actionClass} updated to ${newLevel}`);
        setTimeout(() => setAutonomyNotice(null), 3000);
      } else {
        setAutonomyNotice(`Error: ${data.error || 'Failed to update autonomy'}`);
        setTimeout(() => setAutonomyNotice(null), 4000);
      }
    } catch (err: any) {
      setAutonomyNotice(`Error: ${err.message}`);
      setTimeout(() => setAutonomyNotice(null), 4000);
    } finally {
      setSavingAutonomy(false);
    }
  };

  // Update spend cap handler
  const handleUpdateSpendCap = async (newVal: number | null) => {
    setSavingSpendCap(true);
    try {
      const res = await fetch('/api/sofia/spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spendCap: newVal }),
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setSpendData({
          dailySpendCapUsd: data.settings.dailySpendCapUsd,
          currentDailySpendUsd: data.settings.currentDailySpendUsd,
          interactiveSpendUsd: data.settings.interactiveSpendUsd,
          autonomousSpendUsd: data.settings.autonomousSpendUsd,
          canRunAutonomous:
            data.settings.dailySpendCapUsd !== null &&
            data.settings.currentDailySpendUsd < data.settings.dailySpendCapUsd,
          isCapReached:
            data.settings.dailySpendCapUsd !== null &&
            data.settings.currentDailySpendUsd >= data.settings.dailySpendCapUsd,
        });
        setSpendCapInput(data.settings.dailySpendCapUsd !== null ? String(data.settings.dailySpendCapUsd) : '');
        setSpendNotice(data.message || 'Spend cap saved');
        setTimeout(() => setSpendNotice(null), 3000);
      }
    } catch (err: any) {
      setSpendNotice(`Error: ${err.message}`);
      setTimeout(() => setSpendNotice(null), 3000);
    } finally {
      setSavingSpendCap(false);
    }
  };

  // Helper to update SophiaOS tune prefs
  const updateTune = (patch: Record<string, any>) => {
    if (!os) return;
    os.savePrefs({ tune: { ...os.prefs.tune, ...patch } });
    setRerenderTrigger((n) => n + 1);
  };

  const handleFormChange = (form: SophiaForm) => {
    if (!os) return;
    os.savePrefs({ form });
    setRerenderTrigger((n) => n + 1);
  };

  const handleDensityChange = (density: DensityPref) => {
    if (!os) return;
    os.savePrefs({ density });
    setRerenderTrigger((n) => n + 1);
  };

  const triggerShape = (sh: SophiaShape) => {
    if (!os) return;
    os.execCommand(`shape ${sh}`);
  };

  const handleTestMusicPlay = async () => {
    try {
      if (os) await os.audio.unlockAudio();
      await scoreEngine.unlock();
      scoreEngine.playBoot();
      if (os) os.dispatchEvent(new CustomEvent('music:play'));
    } catch {
      /* ignore */
    }
  };

  const handleTestMusicStop = () => {
    scoreEngine.stopAll(200);
    if (os) os.dispatchEvent(new CustomEvent('music:stop'));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-[#090d16] border-l border-white/10 p-5 flex flex-col justify-between overflow-y-auto text-slate-200 select-none shadow-2xl"
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center">
                    <Sliders className="w-4 h-4 text-cyan-300" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white tracking-wide">Sofia Companion</h2>
                    <p className="text-[11px] text-slate-400">Settings & Intelligence Controls</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleAll}
                    title={allCollapsed ? 'Expand All' : 'Collapse All'}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-[10px] text-slate-300 font-medium transition-colors"
                  >
                    {allCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                    <span>{allCollapsed ? 'Expand' : 'Collapse'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Accordion Group */}
              <div className="mt-4 space-y-3">
                {/* ── Section 1: Persona, Vocal Timbre & Cadence ── */}
                <CollapsibleSection
                  title="Persona & Vocal Timbre"
                  icon={<Sparkles size={16} />}
                  badge={
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {voiceConfig.geminiVoiceName || 'Aoede'}
                    </span>
                  }
                  isOpen={sections.voice}
                  onToggle={() => toggleSection('voice')}
                >
                  {/* Persona Card */}
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1.5">
                      Persona & Tone
                    </label>
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 font-semibold text-xs">
                          AU
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">Sofia</div>
                          <div className="text-xs text-slate-400">Warm Australian Female Companion</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        Active
                      </span>
                    </div>
                  </div>

                  {/* Vocal Timbre Selection */}
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1.5">
                      Vocal Timbre Profile
                    </label>
                    <div className="space-y-1.5">
                      {TTS_VOICE_PROFILES.map((vp) => {
                        const isSelected = (voiceConfig.geminiVoiceName || 'Aoede') === vp.geminiVoice;
                        return (
                          <button
                            key={vp.id}
                            type="button"
                            onClick={() => {
                              onVoiceConfigChange({ geminiVoiceName: vp.geminiVoice });
                              controlLayer.voiceName = vp.geminiVoice;
                              controlLayer.voiceProfile = vp.id;
                              controlLayer.saveControlPrefs();
                            }}
                            className={`w-full p-2.5 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'bg-cyan-500/15 border-cyan-400/80 text-white shadow-[0_0_12px_rgba(56,189,248,0.15)]'
                                : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs font-medium">
                              <span className="text-white">{vp.name}</span>
                              <span className="font-mono text-[10px] text-cyan-300">{vp.geminiVoice}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{vp.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Emotional Tone & Cadence Grid */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                        Emotional Tone & Cadence
                      </label>
                      <span className="text-[11px] text-cyan-400 capitalize font-medium">
                        {emotion}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'neutral', label: 'Neutral', dot: 'bg-cyan-400' },
                          { id: 'happiness', label: 'Happiness', dot: 'bg-amber-400' },
                          { id: 'curiosity', label: 'Curiosity', dot: 'bg-violet-400' },
                          { id: 'calmness', label: 'Calmness', dot: 'bg-teal-400' },
                          { id: 'excitement', label: 'Excitement', dot: 'bg-rose-400' },
                          { id: 'empathy', label: 'Empathy', dot: 'bg-purple-400' },
                          { id: 'playfulness', label: 'Playful', dot: 'bg-pink-400' },
                          { id: 'concern', label: 'Concern', dot: 'bg-orange-400' },
                          { id: 'surprise', label: 'Surprise', dot: 'bg-emerald-400' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onEmotionChange(item.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all text-left ${
                            emotion === item.id
                              ? 'bg-white/[0.08] border-cyan-400/80 text-white shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                              : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
                          <span className="truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Voice Provider */}
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1.5">
                      Voice Engine Pipeline
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onVoiceConfigChange({ provider: 'gemini-live' })}
                        className={`p-2.5 rounded-xl border text-left transition-all text-xs ${
                          voiceConfig.provider === 'gemini-live'
                            ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_15px_rgba(56,189,248,0.2)]'
                            : 'bg-white/[0.02] border-white/10 text-slate-400 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                          Gemini Live
                        </div>
                        <div className="text-[10.5px] text-slate-400">Bidirectional PCM streaming</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onVoiceConfigChange({ provider: 'gemini-tts' })}
                        className={`p-2.5 rounded-xl border text-left transition-all text-xs ${
                          voiceConfig.provider === 'gemini-tts'
                            ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_15px_rgba(56,189,248,0.2)]'
                            : 'bg-white/[0.02] border-white/10 text-slate-400 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-cyan-300" />
                          Gemini TTS
                        </div>
                        <div className="text-[10.5px] text-slate-400">Modular TTS synthesis</div>
                      </button>
                    </div>
                  </div>
                </CollapsibleSection>

                {/* ── Section 2: Hearing, Wake & ASR Barge-In ── */}
                <CollapsibleSection
                  title="Hearing, Wake & Barge-In"
                  icon={<Mic size={16} />}
                  badge={
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {wakeSettings.wakeWordEnabled ? 'Wake Word ON' : 'PTT Only'}
                    </span>
                  }
                  isOpen={sections.wake}
                  onToggle={() => toggleSection('wake')}
                >
                  {/* ASR Barge-In Card */}
                  <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-emerald-400" />
                          ASR Barge-In Interruption
                        </div>
                        <p className="text-[10.5px] text-slate-300 mt-0.5 leading-relaxed">
                          Instantly cut off voice playback when you speak into the mic, allowing natural interruption.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={bargeInEnabled}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setBargeInEnabled(val);
                          controlLayer.asrInterruption = val;
                          controlLayer.saveControlPrefs();
                        }}
                        className="w-4 h-4 accent-emerald-400 cursor-pointer ml-3 shrink-0"
                      />
                    </div>
                  </div>

                  {/* Wake Word & Clap */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/10">
                      <div>
                        <div className="text-xs font-medium text-white flex items-center gap-1.5">
                          <Mic className="w-3.5 h-3.5 text-cyan-400" />
                          "Hey Sofia" Wake Word
                        </div>
                        <div className="text-[11px] text-slate-400">Background voice activation</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={wakeSettings.wakeWordEnabled}
                        onChange={(e) => onWakeSettingsChange({ wakeWordEnabled: e.target.checked })}
                        className="w-4 h-4 accent-cyan-400 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/10">
                      <div>
                        <div className="text-xs font-medium text-white flex items-center gap-1.5">
                          👏 Clap Wake Gesture
                        </div>
                        <div className="text-[11px] text-slate-400">Awaken Sofia with a hand clap</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={wakeSettings.clapGestureEnabled}
                        onChange={(e) => onWakeSettingsChange({ clapGestureEnabled: e.target.checked })}
                        className="w-4 h-4 accent-cyan-400 cursor-pointer"
                      />
                    </div>

                    {/* Sensitivity */}
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-300">Microphone Sensitivity</span>
                        <span className="text-cyan-300 font-mono text-[11px]">
                          {Math.round(wakeSettings.sensitivity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={wakeSettings.sensitivity}
                        onChange={(e) => onWakeSettingsChange({ sensitivity: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>Rejects background noise</span>
                        <span>Very sensitive</span>
                      </div>
                    </div>
                  </div>

                  {/* User Voice Print & Crowd Filter */}
                  <div className="space-y-2.5 rounded-xl border border-indigo-400/30 bg-indigo-950/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-xs font-semibold text-indigo-200">User Voice Print & Memory</span>
                      </div>
                      <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {isVoiceEnrolled ? 'Voice Enrolled' : 'Learning Voice'}
                      </span>
                    </div>
                    <p className="text-[10.5px] leading-relaxed text-slate-300">
                      Sofia learns your vocal resonance and ignores surrounding crowd noise, focusing strictly on your voice.
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-white/90">Crowd Noise Rejection</span>
                      <input
                        type="checkbox"
                        checked={crowdFilter}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setCrowdFilter(val);
                          controlLayer.crowdFilterEnabled = val;
                          controlLayer.saveControlPrefs();
                        }}
                        className="w-4 h-4 accent-indigo-400 cursor-pointer"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        userVoiceProfile.resetProfile();
                        setIsVoiceEnrolled(false);
                      }}
                      className="w-full py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-[10px] text-slate-300 hover:text-white hover:bg-white/[0.08] transition"
                    >
                      Recalibrate / Re-enroll Voice
                    </button>
                  </div>
                </CollapsibleSection>

                {/* ── Section 3: Base Form & Substance ── */}
                <CollapsibleSection
                  title="Base Form & Substance"
                  icon={<Circle size={16} />}
                  badge={
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30 capitalize">
                      {currentForm}
                    </span>
                  }
                  isOpen={sections.baseForm}
                  onToggle={() => toggleSection('baseForm')}
                >
                  {/* Base Form Selector: Sphere vs Ring */}
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1.5">
                      Substance Form
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleFormChange('sphere')}
                        className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                          currentForm === 'sphere'
                            ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.2)]'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Circle size={12} className="text-sky-300" />
                        <span>Sphere</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleFormChange('ring')}
                        className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                          currentForm === 'ring'
                            ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.2)]'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Layers size={12} className="text-sky-300" />
                        <span>Ring</span>
                      </button>
                    </div>
                  </div>

                  {/* Display Mode: Full vs Particles Only */}
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1.5">
                      Display Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateTune({ onlyParticles: false })}
                        className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                          !currentTune.onlyParticles
                            ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.18)]'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        Full (Rim + Body)
                      </button>

                      <button
                        type="button"
                        onClick={() => updateTune({ onlyParticles: true })}
                        className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                          currentTune.onlyParticles
                            ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.18)]'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        Particles Only
                      </button>
                    </div>
                  </div>

                  {/* Fine Tuning Sliders */}
                  <div className="space-y-3 pt-1">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300">Overall Scale</span>
                        <span className="font-mono text-cyan-300 text-[11px]">
                          {(currentTune.scale || 1.0).toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.8"
                        max="1.2"
                        step="0.01"
                        value={currentTune.scale || 1.0}
                        onChange={(e) => updateTune({ scale: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300">Particle Point Size</span>
                        <span className="font-mono text-cyan-300 text-[11px]">
                          {(currentTune.particleScale || 1.0).toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.6"
                        max="2.2"
                        step="0.05"
                        value={currentTune.particleScale || 1.0}
                        onChange={(e) => updateTune({ particleScale: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>

                    {!currentTune.onlyParticles && (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-300">Outer Rim Thickness</span>
                          <span className="font-mono text-cyan-300 text-[11px]">
                            {(currentTune.rim || 1.0).toFixed(2)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.6"
                          max="1.6"
                          step="0.02"
                          value={currentTune.rim || 1.0}
                          onChange={(e) => updateTune({ rim: parseFloat(e.target.value) })}
                          className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                        />
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300">Color Hue Tint</span>
                        <span className="font-mono text-cyan-300 text-[11px]">
                          {Math.round(currentTune.hue || 0)}°
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        step="1"
                        value={currentTune.hue || 0}
                        onChange={(e) => updateTune({ hue: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300">Color Saturation</span>
                        <span className="font-mono text-cyan-300 text-[11px]">
                          {(currentTune.saturation || 1.0).toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.4"
                        max="2.0"
                        step="0.05"
                        value={currentTune.saturation || 1.0}
                        onChange={(e) => updateTune({ saturation: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>
                  </div>
                </CollapsibleSection>

                {/* ── Section 4: Audio Agent Sacred Shapes ── */}
                <CollapsibleSection
                  title="Audio Agent Shapes"
                  icon={<Shapes size={16} />}
                  badge={
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      {ALL_SHAPES.length} Forms
                    </span>
                  }
                  isOpen={sections.shapes}
                  onToggle={() => toggleSection('shapes')}
                >
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    Morph Sophia’s particle body into sacred geometries and functional agent shapes in real time.
                  </p>

                  <div className="grid grid-cols-2 gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {ALL_SHAPES.map((sh) => (
                      <button
                        key={sh}
                        type="button"
                        onClick={() => triggerShape(sh)}
                        className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-2.5 text-left text-[10px] tracking-wide text-white/70 transition-all hover:border-sky-400/40 hover:bg-sky-400/[0.08] hover:text-white active:scale-[0.98]"
                      >
                        <ShapeThumb shape={sh} />
                        <span className="truncate">{SHAPE_LABELS[sh]}</span>
                      </button>
                    ))}
                  </div>
                </CollapsibleSection>

                {/* ── Section 5: Audio Score & Music System ── */}
                <CollapsibleSection
                  title="Audio Score & Music System"
                  icon={<Music size={16} />}
                  badge={
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {scoreEnabled ? 'Score ON' : 'Muted'}
                    </span>
                  }
                  isOpen={sections.music}
                  onToggle={() => toggleSection('music')}
                >
                  {/* Boot & Wake Audio Flourish */}
                  <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-xs font-semibold text-white">Wake Audio Flourish</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !scoreEnabled;
                          setScoreEnabled(next);
                          scoreEngine.setEnabled(next);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase transition ${
                          scoreEnabled
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                            : 'bg-white/5 text-slate-500 border border-white/10'
                        }`}
                      >
                        {scoreEnabled ? 'Enabled' : 'Muted'}
                      </button>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Plays a short acoustic chord upon awakening with dynamic voice ducking.
                    </p>

                    {scoreEnabled && (
                      <div className="space-y-2 pt-1 border-t border-white/[0.06]">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">Flourish Volume</span>
                          <span className="font-mono text-cyan-300 text-[11px]">
                            {Math.round(scoreVolume * 100)}%
                          </span>
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
                          className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                        />

                        <div className="flex items-center justify-between pt-1 text-xs">
                          <span className="text-slate-300">Loop Ambient Bed in Standby</span>
                          <input
                            type="checkbox"
                            checked={scoreAmbientLoop}
                            onChange={(e) => {
                              const v = e.target.checked;
                              setScoreAmbientLoop(v);
                              scoreEngine.setAmbientLoopEnabled(v);
                            }}
                            className="w-4 h-4 accent-cyan-400 cursor-pointer"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleTestMusicPlay}
                            className="flex-1 py-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/20 transition flex items-center justify-center gap-1.5"
                          >
                            <Play size={10} className="text-cyan-300" />
                            <span>Play Test Flourish</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleTestMusicStop}
                            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-[10px] text-slate-400 hover:text-white transition"
                          >
                            Stop
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Preferred Music Source Choice */}
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1.5">
                      Preferred Music Player
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'smart', label: 'Smart Decision', desc: 'In-app for ambient, Spotify for songs' },
                          { id: 'inapp', label: 'In-App Bed', desc: 'Continuous ambient music inside Sophia' },
                          { id: 'spotify', label: 'Spotify Player', desc: 'Open Spotify app for music queries' },
                          { id: 'youtube', label: 'YouTube Music', desc: 'Open YouTube video player' },
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
                              ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200 shadow-[0_0_10px_rgba(56,189,248,0.15)]'
                              : 'border-white/5 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                          }`}
                        >
                          <p className="font-mono text-xs font-semibold text-white/90">{opt.label}</p>
                          <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </CollapsibleSection>

                {/* ── Section 6: Cosmic Atmosphere & Particle Tuning ── */}
                <CollapsibleSection
                  title="Cosmic Atmosphere & Particles"
                  icon={<Sparkle size={16} />}
                  badge={
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      {currentDensity.toUpperCase()}
                    </span>
                  }
                  isOpen={sections.atmosphere}
                  onToggle={() => toggleSection('atmosphere')}
                >
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    Fine-tune the ambient stardust, bloom, and density of the central particle sphere.
                  </p>

                  {/* Sliders */}
                  <div className="space-y-3 pt-1">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300">Shape Glow / Bloom</span>
                        <span className="font-mono text-cyan-300 text-[11px]">
                          {(currentTune.glow || 1.2).toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.4"
                        max="1.8"
                        step="0.02"
                        value={currentTune.glow || 1.2}
                        onChange={(e) => updateTune({ glow: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300">Sparkle Intensity</span>
                        <span className="font-mono text-cyan-300 text-[11px]">
                          {(currentTune.sparkle || 1.0).toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="2.0"
                        step="0.05"
                        value={currentTune.sparkle || 1.0}
                        onChange={(e) => updateTune({ sparkle: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300">Dust Mote Density</span>
                        <span className="font-mono text-cyan-300 text-[11px]">
                          {Math.round(currentTune.dustAmount || 80)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        step="5"
                        value={currentTune.dustAmount || 80}
                        onChange={(e) => updateTune({ dustAmount: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300">Dust Drift Speed</span>
                        <span className="font-mono text-cyan-300 text-[11px]">
                          {(currentTune.dustSpeed || 1.0).toFixed(1)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="3.0"
                        step="0.1"
                        value={currentTune.dustSpeed || 1.0}
                        onChange={(e) => updateTune({ dustSpeed: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Particle Density Tier */}
                  <div className="pt-2 border-t border-white/[0.06]">
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-2">
                      Particle Mesh Density
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['auto', 'high', 'medium', 'low'] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleDensityChange(d)}
                          className={`py-1.5 rounded-lg border text-center text-xs font-medium uppercase tracking-wider transition-all ${
                            currentDensity === d
                              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                              : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </CollapsibleSection>

                {/* ── Section 7: Multimodal Vision Perception ── */}
                <CollapsibleSection
                  title="Multimodal Vision Perception"
                  icon={<Eye size={16} />}
                  badge={
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                      visionActive
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-white/5 text-slate-400 border-white/10'
                    }`}>
                      {visionActive ? 'Vision Live' : 'Screen Off'}
                    </span>
                  }
                  isOpen={sections.multimodal}
                  onToggle={() => toggleSection('multimodal')}
                >
                  {/* Real-Time Screen Vision */}
                  <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`block size-2 rounded-full ${
                          visionActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                        }`} />
                        <span className="text-xs font-semibold text-white">Real-Time Screen Vision</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void screenVisionBridge.toggleCapture()}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-medium transition ${
                          visionActive
                            ? 'bg-rose-500/20 border-rose-400/40 text-rose-300 hover:bg-rose-500/30'
                            : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30'
                        }`}
                      >
                        {visionActive ? <EyeOff size={13} /> : <Eye size={13} />}
                        <span>{visionActive ? 'Stop Sharing' : 'Share Screen'}</span>
                      </button>
                    </div>
                    <p className="text-[10.5px] text-slate-400 mt-2 leading-relaxed">
                      Streams desktop frames into Sophia so she sees code, documents, errors, and active windows live.
                    </p>
                  </div>
                </CollapsibleSection>

                {/* ── Section 8: Model Spend & Autonomy Limits ── */}
                <CollapsibleSection
                  title="Spend & Autonomy Limits"
                  icon={<DollarSign size={16} />}
                  badge={
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {spendData?.dailySpendCapUsd ? `$${spendData.dailySpendCapUsd}/day` : 'No Cap Set'}
                    </span>
                  }
                  isOpen={sections.spend}
                  onToggle={() => toggleSection('spend')}
                >
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    Set a daily model expenditure ceiling to prevent runaway API costs during autonomous reasoning.
                  </p>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-black/40 p-2.5 text-center font-mono text-xs">
                    <div>
                      <p className="text-[8px] uppercase tracking-wider text-slate-400">Total Today</p>
                      <p className="text-white font-semibold mt-0.5">
                        ${spendData?.currentDailySpendUsd?.toFixed(3) ?? '0.000'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] uppercase tracking-wider text-slate-400">Interactive</p>
                      <p className="text-cyan-300 font-semibold mt-0.5">
                        ${spendData?.interactiveSpendUsd?.toFixed(3) ?? '0.000'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] uppercase tracking-wider text-slate-400">Autonomous</p>
                      <p className="text-violet-300 font-semibold mt-0.5">
                        ${spendData?.autonomousSpendUsd?.toFixed(3) ?? '0.000'}
                      </p>
                    </div>
                  </div>

                  {/* Input & Presets */}
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          placeholder="Unset (No Cap)"
                          value={spendCapInput}
                          onChange={(e) => setSpendCapInput(e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-7 pr-2 font-mono text-xs text-white placeholder-slate-600 focus:border-cyan-400 focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const val = spendCapInput.trim() === '' ? null : parseFloat(spendCapInput);
                          void handleUpdateSpendCap(val);
                        }}
                        disabled={savingSpendCap}
                        className="rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/30 disabled:opacity-50"
                      >
                        {savingSpendCap ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSpendCapInput('');
                          void handleUpdateSpendCap(null);
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="flex gap-1.5">
                      {[5, 10, 25, 50].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setSpendCapInput(String(preset));
                            void handleUpdateSpendCap(preset);
                          }}
                          className="flex-1 rounded border border-white/10 bg-white/[0.03] py-1 font-mono text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-white"
                        >
                          ${preset}
                        </button>
                      ))}
                    </div>

                    {spendNotice && (
                      <p className="text-[10px] text-cyan-300 text-center">{spendNotice}</p>
                    )}

                    {/* G12.8 Autonomy Policy Controls */}
                    <div data-testid="autonomy-settings-section" className="mt-3 pt-3 border-t border-white/10 space-y-2">
                      <div>
                        <p className="text-[10.5px] font-medium text-white/90">Autonomy Limits & Boundaries</p>
                        <p className="text-[9.5px] text-slate-400">Deterministic boundaries deciding auto, needs approval, or forbidden.</p>
                      </div>

                      {/* Rules Badges */}
                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        {Object.entries(autonomyRules).map(([cls, rule]: [string, any]) => (
                          <div
                            key={cls}
                            onClick={() => {
                              setSelectedActionClass(cls);
                              if (rule.currentLevel) setSelectedLevel(rule.currentLevel);
                            }}
                            className={`flex items-center justify-between p-1.5 rounded-lg border cursor-pointer transition ${
                              selectedActionClass === cls
                                ? 'border-cyan-400 bg-cyan-500/20 text-white'
                                : 'border-white/10 bg-black/30 text-white/70 hover:border-white/20'
                            }`}
                          >
                            <span className="truncate capitalize">{cls.replace(/_/g, ' ')}</span>
                            <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[9px] ${
                              rule.currentLevel === 'L0' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                              rule.currentLevel === 'L1' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              rule.currentLevel === 'L2' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' :
                              'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}>
                              {rule.currentLevel}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Level Selector & Update Form */}
                      <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/40 p-2 text-[10px]">
                        <div className="flex items-center justify-between text-slate-300">
                          <span>Action: <strong className="text-white capitalize">{selectedActionClass.replace(/_/g, ' ')}</strong></span>
                          <span>Level: <strong className="text-cyan-300 font-mono">{autonomyRules[selectedActionClass]?.currentLevel || 'L2'}</strong></span>
                        </div>

                        <div className="flex gap-1 pt-1">
                          {['L0', 'L1', 'L2', 'L3', 'L4'].map((lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              onClick={() => setSelectedLevel(lvl)}
                              className={`flex-1 py-1 rounded font-mono text-[9px] border transition ${
                                selectedLevel === lvl
                                  ? 'border-cyan-400 bg-cyan-500/30 text-white shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                                  : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                              }`}
                            >
                              {lvl}
                            </button>
                          ))}
                        </div>

                        <input
                          type="text"
                          placeholder="Founder decision quote (required for elevation)"
                          value={founderQuoteInput}
                          onChange={(e) => setFounderQuoteInput(e.target.value)}
                          data-testid="founder-quote-input"
                          className="w-full rounded border border-white/10 bg-white/5 py-1 px-2 text-[10px] text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                        />

                        <button
                          type="button"
                          onClick={() => void handleUpdateAutonomyLevel(selectedActionClass, selectedLevel)}
                          disabled={savingAutonomy}
                          data-testid="save-autonomy-button"
                          className="w-full rounded border border-cyan-400/40 bg-cyan-500/20 py-1 text-[10px] font-medium text-cyan-200 transition hover:bg-cyan-500/30 disabled:opacity-50"
                        >
                          {savingAutonomy ? 'Updating Autonomy…' : `Update ${selectedActionClass.replace(/_/g, ' ')} to ${selectedLevel}`}
                        </button>

                        {autonomyNotice && (
                          <p data-testid="autonomy-notice" className="text-[9.5px] text-cyan-300 text-center">{autonomyNotice}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CollapsibleSection>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  os?.resetPrefs();
                  onEmotionChange('neutral');
                  setRerenderTrigger((n) => n + 1);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-slate-400 hover:text-white hover:bg-white/[0.06] transition"
              >
                <RotateCcw size={12} />
                <span>Reset Defaults</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 rounded-lg text-xs font-semibold tracking-wide transition shadow-[0_0_12px_rgba(56,189,248,0.2)]"
              >
                Done
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
export default SettingsDrawer;
