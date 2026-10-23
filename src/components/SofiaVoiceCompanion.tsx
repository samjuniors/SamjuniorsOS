import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SofiaSubtitle } from './SofiaSubtitle';
import { SettingsDrawer } from './SettingsDrawer';
import { TranscriptDrawer } from './TranscriptDrawer';
import { BootScreen } from './BootScreen';
import { ConversationManager } from '../core/ConversationManager';
import {
  AudioMetrics,
  Emotion,
  SofiaMessage,
  SofiaState,
  SofiaSubtitleData,
  VoiceConfig,
  WakeSettings,
  WakeTrigger,
} from '../types/sofia';

// Visual & UI Chrome from Legacy Cockpit
import { Brand, Dock, ConnectionIndicator } from '../sofia/ui/Hud';
import { VisionGlow } from '../sofia/ui/VisionGlow';
import { SofiaStatusPill } from '../sofia/ui/SofiaStatusPill';
import { ToolStatusBadge } from '../sofia/ui/ToolStatusBadge';
import { ViewRail, type AppView } from '../sofia/ui/ViewRail';
import { ChatPanel } from '../sofia/ui/ChatPanel';
import { Terminal } from '../sofia/ui/Terminal';
import { BrowserPanel } from '../sofia/ui/BrowserPanel';
import { DiagnosticsModal } from '../sofia/ui/DiagnosticsModal';
import { SofiaDashboard } from '../sofia/ui/SofiaDashboard';
import { TheatrePanel } from '../sofia/ui/TheatrePanel';
import { getSophiaOS } from '../sofia/sophia/SophiaOS';
import { controlLayer } from '../sofia/sophia/control';
import { scoreEngine } from '../sofia/sophia/audio/ScoreEngine';
import { stageLayout, type StageLayout } from '../sofia/engine/layout';
import type { SophiaStateName } from '../sofia/engine/types';
import { Settings } from 'lucide-react';

interface SofiaVoiceCompanionProps {
  active?: boolean;
}

const STATE_MAP: Record<SofiaState, SophiaStateName> = {
  BOOT: 'wakeup',
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  INTERRUPTED: 'focusing',
  PAUSED: 'paused',
  ERROR: 'blocked',
};

export const SofiaVoiceCompanion: React.FC<SofiaVoiceCompanionProps> = ({ active = true }) => {
  const os = useMemo(() => getSophiaOS(), []);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const micRef = useRef<HTMLButtonElement | null>(null);

  // Full-screen stage layout for exact positioning of orb & identity
  const [layout, setLayout] = useState<StageLayout>(() =>
    stageLayout(typeof window !== 'undefined' ? window.innerWidth : 1200, typeof window !== 'undefined' ? window.innerHeight : 800)
  );

  // Real-time Voice States
  const [state, setState] = useState<SofiaState>('BOOT');
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [subtitle, setSubtitle] = useState<SofiaSubtitleData | null>(null);
  const [_audioMetrics, setAudioMetrics] = useState<AudioMetrics>({
    rms: 0,
    peak: 0,
    lowEnergy: 0,
    midEnergy: 0,
    highEnergy: 0,
    speechScore: 0,
    isSpeech: false,
    dominantFrequency: 0,
    noiseFloor: 0.01,
    isClap: false,
  });
  const [messages, setMessages] = useState<SofiaMessage[]>([]);
  const [isAwakened, setIsAwakened] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  // Visual View & Panels
  const [view, setView] = useState<AppView>('sofia');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isTheatreOpen, setIsTheatreOpen] = useState(false);

  // Voice & Wake Settings
  const [voiceConfig, setVoiceConfigState] = useState<VoiceConfig>({
    name: 'Sofia (Australian)',
    accent: 'Australian',
    speed: 1.0,
    pitch: 1.0,
    provider: 'gemini-live',
    geminiVoiceName: 'Aoede',
  });

  const [wakeSettings, setWakeSettingsState] = useState<WakeSettings>({
    wakeWordEnabled: true,
    clapGestureEnabled: true,
    tapEnabled: true,
    sensitivity: 0.6,
    clapThreshold: 0.35,
  });

  const [serverStatus, setServerStatus] = useState<any>(null);
  const managerRef = useRef<ConversationManager | null>(null);

  // Handle stage layout resize
  useEffect(() => {
    const handleResize = () => {
      setLayout(stageLayout(window.innerWidth, window.innerHeight));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Attach full-screen WebGL2 canvas to SophiaOS (renders stars, cosmic dust, and central particle sphere)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Attach canvas to os renderer
    os.attach(canvas);

    return () => {
      os.detach();
    };
  }, [os]);

  // User gesture audio unblocker for ScoreEngine & WebAudio
  useEffect(() => {
    const unlockAudioScore = async () => {
      try {
        await os.audio.unlockAudio();
        await scoreEngine.unlock();
      } catch {
        // ignore
      }
    };

    window.addEventListener('pointerdown', unlockAudioScore, { once: true });
    window.addEventListener('keydown', unlockAudioScore, { once: true });
    window.addEventListener('touchstart', unlockAudioScore, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAudioScore);
      window.removeEventListener('keydown', unlockAudioScore);
      window.removeEventListener('touchstart', unlockAudioScore);
    };
  }, [os]);

  // Fetch server status on mount
  useEffect(() => {
    fetch('/api/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setServerStatus(data);
      })
      .catch((err) => console.warn('Could not reach /api/status:', err));
  }, []);

  // Listen for voice-driven tool commands on controlLayer (music, volume, ui, navigation)
  useEffect(() => {
    const onMusicCmd = (e: Event) => {
      const { action } = (e as CustomEvent).detail as { action: string };
      if (action === 'play' || action === 'resume') {
        void os.audio.unlockAudio();
        void scoreEngine.unlock().then(() => {
          scoreEngine.syncToState(os.state.current);
          os.dispatchEvent(new CustomEvent('music:play'));
        });
      } else if (action === 'stop' || action === 'pause') {
        scoreEngine.stopAll();
        os.dispatchEvent(new CustomEvent('music:stop'));
      }
    };
    controlLayer.addEventListener('command:music', onMusicCmd);

    const onVolCmd = (e: Event) => {
      const { level } = (e as CustomEvent).detail as { level?: number };
      if (typeof level === 'number') {
        scoreEngine.setMasterVolume(level / 100);
      }
    };
    controlLayer.addEventListener('command:volume', onVolCmd);

    const onUiCmd = (e: Event) => {
      const { target, action } = (e as CustomEvent).detail as { target: string; action: string };
      const open = action === 'open';
      const close = action === 'close';
      const toggle = action === 'toggle' || action === 'minimize';

      const apply = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
        if (toggle) setter((v) => !v);
        else if (open) setter(true);
        else if (close) setter(false);
      };

      if (target === 'browser') apply(setIsBrowserOpen);
      else if (target === 'chat') apply(setIsChatOpen);
      else if (target === 'settings') apply(setIsSettingsOpen);
      else if (target === 'diagnostics') apply(setIsDiagnosticsOpen);
      else if (target === 'terminal') apply(setIsTerminalOpen);
      else if (target === 'transcript') apply(setIsTranscriptOpen);
      else if (target === 'theatre') {
        if (toggle) {
          setIsTheatreOpen((v) => {
            const next = !v;
            setView(next ? 'theatre' : 'sofia');
            return next;
          });
        } else if (open) {
          setIsTheatreOpen(true);
          setView('theatre');
        } else if (close) {
          setIsTheatreOpen(false);
          setView('sofia');
        }
      } else if (target === 'all' && (close || toggle)) {
        setIsBrowserOpen(false);
        setIsChatOpen(false);
        setIsSettingsOpen(false);
        setIsDiagnosticsOpen(false);
        setIsTerminalOpen(false);
        setIsTranscriptOpen(false);
        setIsTheatreOpen(false);
        setView('sofia');
      }
    };
    controlLayer.addEventListener('command:ui', onUiCmd);

    const onNavCmd = (e: Event) => {
      const { url, query } = (e as CustomEvent).detail as { url?: string; query?: string; title?: string };
      const target = url || (query ? `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}` : '');
      if (target) {
        setIsBrowserOpen(true);
      }
    };
    controlLayer.addEventListener('command:navigate', onNavCmd);

    return () => {
      controlLayer.removeEventListener('command:music', onMusicCmd);
      controlLayer.removeEventListener('command:volume', onVolCmd);
      controlLayer.removeEventListener('command:ui', onUiCmd);
      controlLayer.removeEventListener('command:navigate', onNavCmd);
    };
  }, [os]);

  // Initialize ConversationManager
  const handleAwaken = useCallback(async (trigger?: WakeTrigger) => {
    setIsBooting(true);
    setBootError(null);

    // Audio unlock and trigger orchestral boot flourish
    try {
      await os.audio.unlockAudio();
      await scoreEngine.unlock();
      scoreEngine.playBoot();
      os.director.playWake();
      os.state.setState('wakeup', { reason: 'boot-awaken' });
    } catch {
      // ignore
    }

    if (managerRef.current) {
      managerRef.current.destroy();
    }

    const manager = new ConversationManager({
      onStateChange: (newState) => {
        setState(newState);
        const mapped = STATE_MAP[newState] || 'idle';
        os.state.setState(mapped, { reason: 'voice-companion-state' });

        // Dynamic voice ducking: when Sofia speaks, duck background music to 35%
        if (newState === 'SPEAKING') {
          scoreEngine.setDucked(true);
        } else {
          scoreEngine.setDucked(false);
        }

        // Keep atmospheric sound scoring in sync with voice companion state
        scoreEngine.syncToState(mapped);
      },
      onEmotionChange: (newEmotion) => {
        setEmotion(newEmotion);
        // Apply emotion tint to director
        let hue = -0.62;
        let glow = 1.20;
        switch (newEmotion) {
          case 'happiness': hue = 0.35; glow = 1.25; break;
          case 'curiosity': hue = 0.75; glow = 1.30; break;
          case 'calmness': hue = -0.45; glow = 1.05; break;
          case 'excitement': hue = 0.95; glow = 1.40; break;
          case 'empathy': hue = 0.60; glow = 1.20; break;
          case 'playfulness': hue = 0.85; glow = 1.32; break;
          case 'concern': hue = -0.20; glow = 1.10; break;
          case 'surprise': hue = 0.15; glow = 1.35; break;
          default: hue = -0.62; glow = 1.20; break;
        }
        os.director.setTune({ hue, glow });
      },
      onAudioMetrics: (metrics) => {
        setAudioMetrics(metrics);
        // Feed live energy into os so the full-screen particle orb reacts dynamically in real time
        const rawEnergy = Math.max(metrics.rms, (metrics.peak || 0) * 0.7);
        if (managerRef.current?.getState() === 'SPEAKING') {
          os.setAudioLevels(0, Math.min(1.0, rawEnergy * 2.8));
        } else {
          os.setAudioLevels(Math.min(1.0, rawEnergy * 2.8), 0);
        }
      },
      onMessageAdd: (msg) => {
        setMessages((prev) => [...prev, msg]);
        // Forward turn to controlLayer so ChatPanel & log receive it
        controlLayer.history.push({
          role: msg.role === 'user' ? 'user' : 'sophia',
          text: msg.text,
          final: true,
          ts: msg.timestamp,
        });
        controlLayer.dispatchEvent(
          new CustomEvent('turn', {
            detail: {
              role: msg.role === 'user' ? 'user' : 'sophia',
              text: msg.text,
              final: true,
            },
          })
        );
      },
      onWakeDetected: (trig) => {
        os.pushLog('event', `wake trigger detected: ${trig}`);
      },
      onError: (err) => {
        setBootError(err);
        os.pushLog('error', `Voice engine error: ${err}`);
      },
      onSubtitleUpdate: (subtitleData) => {
        setSubtitle(subtitleData);
      },
    });

    managerRef.current = manager;
    manager.setVoiceConfig(voiceConfig);
    manager.setWakeSettings(wakeSettings);

    const success = await manager.boot(trigger);
    setIsBooting(false);
    if (success) {
      setIsAwakened(true);
      os.pushLog('info', 'Sofia Voice Companion online (Gemini Live 3.8 + WebGL2 Particle Sphere)');
    }
    return success;
  }, [os, voiceConfig, wakeSettings]);

  // Instantaneous Pause/Resume/Interrupt toggle
  const togglePause = useCallback(() => {
    void os.audio.unlockAudio();
    const mgr = managerRef.current;
    if (!mgr) {
      void handleAwaken('tap');
      return;
    }
    const currentMgrState = mgr.getState();
    const isCurrentlyPaused = currentMgrState === 'PAUSED' || os.isPaused;

    if (isCurrentlyPaused) {
      mgr.resume();
      os.resume();
      os.state.setState('listening', { reason: 'user-resume' });
      setState('LISTENING');
      scoreEngine.syncToState('listening');
    } else if (currentMgrState === 'SPEAKING' || os.state.is('speaking')) {
      mgr.handleInterruption();
      os.interrupt();
      setState('INTERRUPTED');
      scoreEngine.setDucked(false);
    } else {
      mgr.pause();
      os.pause();
      os.state.setState('paused', { reason: 'user-pause' });
      setState('PAUSED');
      scoreEngine.stopAll(300);
    }
  }, [handleAwaken, os]);

  // Handle typing from ChatPanel
  const handleSendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!managerRef.current) {
        await handleAwaken('tap');
      }
      if (managerRef.current) {
        managerRef.current.sendText(trimmed);
      }
    },
    [handleAwaken]
  );

  // Global Keyboard Shortcuts (matching Legacy Cockpit)
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      // Guard against auto-repeat firing repeatedly when holding or slightly tapping a key
      if (e.repeat) return;

      if (e.key === 'Escape') {
        if (isTheatreOpen) {
          setIsTheatreOpen(false);
          setView('sofia');
        } else if (view === 'dashboard') {
          setView('sofia');
        } else if (isDiagnosticsOpen) setIsDiagnosticsOpen(false);
        else if (isBrowserOpen) setIsBrowserOpen(false);
        else if (isSettingsOpen) setIsSettingsOpen(false);
        else if (isTerminalOpen) setIsTerminalOpen(false);
        else if (isChatOpen) setIsChatOpen(false);
        else if (isTranscriptOpen) setIsTranscriptOpen(false);
        return;
      }
      if (e.code === 'Space' || e.key === ' ' || e.key === 'm' || e.key === 'M' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        togglePause();
      } else if (e.key === 't' || e.key === 'T' || e.key === '/') {
        e.preventDefault();
        setIsChatOpen((v) => !v);
      } else if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        setIsTerminalOpen((v) => !v);
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setIsDiagnosticsOpen((v) => !v);
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        setIsTheatreOpen((v) => {
          const next = !v;
          setView(next ? 'theatre' : 'sofia');
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    active,
    togglePause,
    isTheatreOpen,
    view,
    isDiagnosticsOpen,
    isBrowserOpen,
    isSettingsOpen,
    isTerminalOpen,
    isChatOpen,
    isTranscriptOpen,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (managerRef.current) {
        managerRef.current.destroy();
        managerRef.current = null;
      }
    };
  }, []);

  // Settings update handlers
  const handleVoiceConfigChange = (newConfig: Partial<VoiceConfig>) => {
    setVoiceConfigState((prev) => {
      const updated = { ...prev, ...newConfig };
      managerRef.current?.setVoiceConfig(updated);
      return updated;
    });
  };

  const handleWakeSettingsChange = (newSettings: Partial<WakeSettings>) => {
    setWakeSettingsState((prev) => {
      const updated = { ...prev, ...newSettings };
      managerRef.current?.setWakeSettings(updated);
      return updated;
    });
  };

  const mappedSophiaState: SophiaStateName = STATE_MAP[state] || 'idle';
  const paused = state === 'PAUSED';

  // Circular transparent button over the orb for intuitive clicking/tapping
  // Generous hit radius covering the core sphere and outer particle orbit ring
  const hitRadius = Math.max(135, layout.ringR * 1.12);
  const shapeHitStyle = {
    left: layout.cx - hitRadius,
    top: layout.cy - hitRadius,
    width: hitRadius * 2,
    height: hitRadius * 2,
  } as const;

  // Exact vertical position for identity copy beneath the orb per stageLayout
  const identityTop = layout.cy + layout.ringR + Math.max(10, Math.min(16, layout.R * 0.08));

  return (
    <div className={`font-sophia fixed inset-0 select-none overflow-hidden bg-[#04060f] text-white antialiased transition-all duration-700 ease-out ${
      paused ? 'sophia-paused' : ''
    }`}>
      {/* ── 1. Fullscreen WebGL2 Particle Canvas: Cosmic Stars, Ambient Dust & Particle Sphere ── */}
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full pointer-events-none" aria-hidden="true" />

      {/* ── 2. Clickable Hit-Target on the Central Orb with zero-latency pointerDown ── */}
      <button
        type="button"
        aria-label={paused ? 'Resume Sophia' : 'Pause Sophia'}
        title={paused ? 'Resume Sophia' : 'Pause Sophia'}
        onPointerDown={(e) => {
          e.preventDefault();
          togglePause();
        }}
        onClick={(e) => {
          e.preventDefault();
        }}
        className="absolute z-[4] rounded-full bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-sky-300/40 cursor-pointer active:scale-95 transition-transform duration-75"
        style={shapeHitStyle}
      />

      {/* ── 3. Top-Left: Iconic Legacy Brand Header ── */}
      <Brand />

      {/* ── 4. Top-Center: Screen Vision Glow & Indicator ── */}
      <VisionGlow />

      {/* ── 5. Top-Right: Connection Indicator & Settings Button ── */}
      <div className="status-cluster absolute right-7 top-[26px] z-20 flex items-center gap-2.5 transition-all duration-500 sm:right-11 sm:top-[30px]">
        <ConnectionIndicator os={os} onClick={() => setIsDiagnosticsOpen(true)} />
        <button
          type="button"
          aria-label="Settings"
          aria-expanded={isSettingsOpen}
          onClick={() => setIsSettingsOpen((v) => !v)}
          className={`grid size-[36px] place-items-center rounded-xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 ${
            isSettingsOpen
              ? 'border-sky-400/40 bg-sky-400/15 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
              : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
          }`}
        >
          <Settings size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* ── 6. Left Edge View Rail (Sofia / Dashboard / Theatre) ── */}
      <ViewRail
        view={view}
        onChange={(v) => {
          setView(v);
          setIsTheatreOpen(v === 'theatre');
        }}
      />

      {/* ── 7. Center Identity Copy & Real-Time Word Subtitles directly beneath the Orb ── */}
      <section
        aria-label="Sophia Identity"
        className="identity-hud pointer-events-none absolute left-0 right-0 z-10 select-none px-6 text-center transition-all duration-500 ease-out"
        style={{ top: identityTop }}
      >
        <span className="identity-rule mx-auto block h-px w-[32px] bg-sky-400/30" />
        <h1 className="mt-[18px] text-[clamp(24px,2.2vw,33px)] font-extralight tracking-[0.08em] text-white/95">
          I’m Sophia.
        </h1>
        <p className="mt-[12px] text-[clamp(9.5px,0.8vw,11.5px)] font-light tracking-[0.38em] text-[#9cb5ff]/70">
          [ ALWAYS WITH YOU ]
        </p>

        {/* Word-by-Word Live Subtitles below the identity copy */}
        <div className="mt-4 pointer-events-auto flex justify-center">
          <SofiaSubtitle subtitle={subtitle} emotion={emotion} />
        </div>
      </section>

      {/* ── 8. Bottom-Left Corner: SofiaStatusPill + Terminal Button ── */}
      <div className="fixed bottom-[44px] left-7 z-20 flex items-center gap-2.5 transition-all duration-500 sm:bottom-[52px] sm:left-11">
        <SofiaStatusPill
          state={mappedSophiaState}
          paused={paused}
          onClick={togglePause}
          os={os}
          onDiagnostics={() => setIsDiagnosticsOpen(true)}
        />

        <button
          type="button"
          aria-label={isTerminalOpen ? 'Close terminal' : 'Open terminal'}
          aria-pressed={isTerminalOpen}
          onClick={() => setIsTerminalOpen((v) => !v)}
          title="Terminal (~)"
          className={`dock-btn ${
            isTerminalOpen ? 'text-sky-300 drop-shadow-[0_0_12px_rgba(56,189,248,0.5)]' : ''
          }`}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <path d="m7 9 3 3-3 3" />
            <path d="M13 15h4" />
          </svg>
        </button>
      </div>

      {/* ── 9. Bottom-Right: Iconic Legacy Cockpit Voice Dock ── */}
      <Dock
        state={mappedSophiaState}
        micRef={micRef}
        onMic={togglePause}
        onChat={() => setIsChatOpen((v) => !v)}
        chatOpen={isChatOpen}
        paused={paused}
        browserOpen={isBrowserOpen}
        onToggleBrowser={() => setIsBrowserOpen((v) => !v)}
      />

      {/* ── 10. Voice-First Subtle Tool Status HUD ── */}
      <ToolStatusBadge />

      {/* ── 11. Interactive Panels & Drawers ── */}
      {/* Live Text Chat Panel */}
      {isChatOpen && (
        <ChatPanel
          status={os.status}
          onClose={() => setIsChatOpen(false)}
          onSend={handleSendText}
        />
      )}

      {/* Integrated Terminal Console */}
      <Terminal
        os={os}
        open={isTerminalOpen}
        onToggle={() => setIsTerminalOpen((v) => !v)}
        hideButton
      />

      {/* Embedded Web Browser / Workspace */}
      {isBrowserOpen && <BrowserPanel onClose={() => setIsBrowserOpen(false)} />}

      {/* Live Audio & Voice Diagnostics Modal */}
      {isDiagnosticsOpen && (
        <DiagnosticsModal os={os} onClose={() => setIsDiagnosticsOpen(false)} />
      )}

      {/* Voice & Wake Customization Drawer (No shape/theme morphs) */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        emotion={emotion}
        onEmotionChange={(newEmotion) => {
          setEmotion(newEmotion);
          managerRef.current?.setEmotion(newEmotion);
        }}
        voiceConfig={voiceConfig}
        onVoiceConfigChange={handleVoiceConfigChange}
        wakeSettings={wakeSettings}
        onWakeSettingsChange={handleWakeSettingsChange}
        onTestWakeWord={togglePause}
        serverStatus={serverStatus}
        os={os}
      />

      {/* Conversation Memory Drawer */}
      <TranscriptDrawer
        isOpen={isTranscriptOpen}
        onClose={() => setIsTranscriptOpen(false)}
        messages={messages}
      />

      {/* Full World Monitor Theatre Mode */}
      {isTheatreOpen && (
        <TheatrePanel
          onClose={() => {
            setIsTheatreOpen(false);
            setView('sofia');
          }}
        />
      )}

      {/* Read-Only Governance Dashboard View */}
      {view === 'dashboard' && (
        <SofiaDashboard
          state={mappedSophiaState}
          status={os.status}
          health={os.health}
          onMic={togglePause}
          onOpenChat={() => setIsChatOpen(true)}
          onOpenTerminal={() => setIsTerminalOpen(true)}
          onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onBackToSofia={() => setView('sofia')}
        />
      )}

      {/* First-run Boot & Microphone Permission Gate */}
      {!isAwakened && (
        <div className="absolute inset-0 z-50">
          <BootScreen
            onAwaken={async (trig) => {
              await handleAwaken(trig);
            }}
            isLoading={isBooting}
            error={bootError}
          />
        </div>
      )}
    </div>
  );
};

export default SofiaVoiceCompanion;
