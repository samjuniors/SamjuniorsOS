/**
 * HUD — the little chrome that frames the substance.
 * Top-left brand, top-right health dot + settings, identity copy beneath
 * Sophia, the bottom-right voice dock, and the bottom-centre orb dock pad
 * that receives the mini-orb when content owns the centre stage.
 */

import { Globe, Mic, MicOff, MessageSquare, Settings, Zap, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { controlLayer } from '../sophia/control';
import { screenVisionBridge } from '../sophia/vision/ScreenVisionBridge';
import type { StageLayout } from '../sophia/layout';
import type { SophiaStateName } from '../sophia/types';
import type { SophiaOS } from '../sophia/SophiaOS';
import type { LiveConnectionMetrics } from '../sophia/voice/GeminiLiveProvider';
export { SofiaStatusPill, type SofiaStatusPillProps } from './SofiaStatusPill';

export function Brand() {
  return (
    <header className="pointer-events-none absolute left-7 top-7 z-10 select-none sm:left-11 sm:top-9">
      <div className="flex items-center gap-2">
        <span className="block size-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
        <p className="text-[11px] font-normal tracking-[0.32em] text-white/90">SAMJUNIORS OS</p>
      </div>
      <p className="mt-[5px] pl-3.5 text-[9px] font-light tracking-[0.42em] text-sky-200/60">SOPHIA</p>
    </header>
  );
}

/**
 * ConnectionIndicator — displays real-time Gemini Live API latency and stability.
 */
export function ConnectionIndicator({
  os,
  onClick,
}: {
  os?: SophiaOS;
  onClick: () => void;
}) {
  const [metrics, setMetrics] = useState<LiveConnectionMetrics>(() => {
    return os?.getGeminiLiveMetrics() ?? {
      isConnected: false,
      latencyMs: 0,
      stabilityPercent: 0,
      quality: 'offline',
      packetsSent: 0,
      packetsReceived: 0,
      modelName: 'gemini-3.8-live',
      voiceName: 'Aoede',
      history: [],
    };
  });

  useEffect(() => {
    if (!os) return;
    const interval = setInterval(() => {
      setMetrics(os.getGeminiLiveMetrics());
    }, 600);
    return () => clearInterval(interval);
  }, [os]);

  const isConn = metrics.isConnected;
  const lat = metrics.latencyMs;
  const stab = metrics.stabilityPercent;

  let latBadgeStyle = 'border-sky-500/20 bg-sky-950/20 text-sky-200';
  let dotBg = 'bg-sky-400 shadow-[0_0_8px_#38bdf8]';

  if (!isConn) {
    latBadgeStyle = 'border-white/10 bg-white/[0.02] text-white/40';
    dotBg = 'bg-neutral-500';
  } else if (lat > 0 && lat < 90) {
    latBadgeStyle = 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.12)]';
    dotBg = 'bg-emerald-400 shadow-[0_0_8px_#34d399]';
  } else if (lat < 180) {
    latBadgeStyle = 'border-amber-500/30 bg-amber-950/20 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.12)]';
    dotBg = 'bg-amber-400 shadow-[0_0_8px_#fbbf24]';
  } else {
    latBadgeStyle = 'border-rose-500/30 bg-rose-950/20 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.12)]';
    dotBg = 'bg-rose-400 shadow-[0_0_8px_#f43f5e]';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title="Gemini Live Real-time API Connection Latency & Stability. Click for Live Diagnostics."
      aria-label={`Gemini Live API status: ${isConn ? 'Connected' : 'Standby'}, Latency ${lat} ms, Stability ${stab}%. Click for detailed diagnostics.`}
      className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 ${latBadgeStyle}`}
    >
      <div className="relative flex items-center justify-center">
        <span className={`block size-2 rounded-full transition-all duration-300 ${dotBg}`} />
        {isConn && <span className="absolute size-3 animate-ping rounded-full bg-emerald-400/30" />}
      </div>

      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider">
        <span className="font-semibold text-white/90 group-hover:text-sky-200">
          Gemini Live
        </span>
        <span className="text-white/20">•</span>
        {isConn ? (
          <>
            <span className="font-bold text-sky-200">{lat}ms</span>
            <span className="text-white/20">•</span>
            <span className="text-emerald-300">{stab}% stab</span>
          </>
        ) : (
          <span className="text-white/40">Standby</span>
        )}
      </div>

      <Zap
        size={11}
        className={`transition-all duration-300 group-hover:scale-110 ${
          isConn ? 'text-amber-300 animate-pulse' : 'text-white/20'
        }`}
      />
    </button>
  );
}

export function StatusCluster({
  settingsOpen,
  onSettings,
}: {
  health?: 'ok' | 'warn' | 'error';
  active?: boolean;
  settingsOpen: boolean;
  onSettings: () => void;
  onDiagnostics?: () => void;
  os?: SophiaOS;
}) {
  return (
    <div className="status-cluster absolute right-7 top-[26px] z-10 flex items-center gap-2.5 transition-all duration-500 sm:right-11 sm:top-[30px]">
      {/* Settings Button */}
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={settingsOpen}
        onClick={onSettings}
        className={`grid size-[36px] place-items-center rounded-xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 ${
          settingsOpen
            ? 'border-sky-400/40 bg-sky-400/15 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
            : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
        }`}
      >
        <Settings size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}

const STATE_WORD: Record<SophiaStateName, string> = {
  ambient: '',
  idle: 'IDLE',
  wakeup: 'WAKING',
  focusing: 'FOCUSING',
  listening: 'LISTENING',
  thinking: 'THINKING',
  speaking: 'SPEAKING',
  rendering: 'RENDERING',
  transforming: 'TRANSFORMING',
  pause: 'PAUSE',
  paused: 'PAUSE',
  completed: 'COMPLETED',
  blocked: 'BLOCKED',
};

function useLatestLine(state: SophiaStateName): string {
  const [line, setLine] = useState('');
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { role: string; text: string };
      if (d.role === 'system') return;
      setLine(d.text);
    };
    controlLayer.addEventListener('turn', on);
    return () => controlLayer.removeEventListener('turn', on);
  }, []);
  useEffect(() => {
    if (state === 'ambient') {
      const t = setTimeout(() => setLine(''), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state]);
  return line;
}

export function Identity({
  layout,
  state,
  docked,
}: {
  layout: StageLayout;
  state: SophiaStateName;
  docked: boolean;
}) {
  const line = useLatestLine(state);
  const active = state !== 'ambient';
  const top = layout.cy + layout.ringR + Math.max(10, Math.min(16, layout.R * 0.08));
  return (
    <section
      aria-label="Sophia"
      aria-hidden={docked}
      className={`identity-hud pointer-events-none absolute left-0 right-0 z-10 select-none px-6 text-center transition-all duration-500 ease-out ${
        docked ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'
      }`}
      style={{ top }}
    >
      <span className={`identity-rule mx-auto block h-px w-[32px] ${state === 'completed' ? 'identity-rule-done' : ''}`} />
      <h1 className="mt-[18px] text-[clamp(24px,2.2vw,33px)] font-extralight tracking-[0.08em] text-white/95">
        I’m Sophia.
      </h1>
      <p className="mt-[12px] text-[clamp(9.5px,0.8vw,11.5px)] font-light tracking-[0.38em] text-[#9cb5ff]/70">
        [ ALWAYS WITH YOU ]
      </p>
      <p
        aria-live="polite"
        className={`mx-auto mt-[18px] max-w-[min(60ch,80vw)] truncate text-[11px] font-normal tracking-[0.16em] transition-opacity duration-300 ${
          active ? 'opacity-100' : 'opacity-0'
        } ${state === 'completed' ? 'text-emerald-300' : 'text-white/45'}`}
      >
        {line || STATE_WORD[state]}
      </p>
    </section>
  );
}

/** Bottom-centre landing pad the mini-orb settles onto while content owns the stage. */
export function OrbDock({ visible, state }: { visible: boolean; state: SophiaStateName }) {
  return (
    <div
      aria-hidden={!visible}
      className={`orb-dock pointer-events-none absolute bottom-0 left-1/2 z-[5] -translate-x-1/2 transition-all duration-700 ${
        visible ? 'opacity-100' : 'translate-y-3 opacity-0'
      }`}
    >
      <div className="orb-dock-glow" />
      <div className="orb-dock-base" />
      <p className="orb-dock-label">{STATE_WORD[state] || 'SOPHIA'}</p>
    </div>
  );
}

export function Dock({
  state,
  micRef,
  onMic,
  onChat,
  chatOpen,
  paused,
  browserOpen,
  onToggleBrowser,
}: {
  state: SophiaStateName;
  micRef: RefObject<HTMLButtonElement | null>;
  onMic: () => void;
  onChat: () => void;
  chatOpen: boolean;
  paused: boolean;
  browserOpen?: boolean;
  onToggleBrowser?: () => void;
}) {
  const on = state !== 'ambient' && state !== 'paused' && state !== 'idle' && state !== 'completed';
  const isStandby = state === 'ambient' || state === 'idle' || state === 'completed';
  const isMicOff = paused;
  const micLabel = paused
    ? 'System paused · Click to wake Sofia & resume'
    : isStandby
      ? 'Standby · Say “Hey Sofia” or click to speak'
      : 'Sofia is active · Click to stand down';

  const [visionActive, setVisionActive] = useState(screenVisionBridge.active);

  useEffect(() => {
    const handleVision = (e: Event) => {
      setVisionActive(Boolean((e as CustomEvent).detail?.active));
    };
    screenVisionBridge.addEventListener('vision:state', handleVision);
    return () => screenVisionBridge.removeEventListener('vision:state', handleVision);
  }, []);

  const onToggleVision = () => {
    void screenVisionBridge.toggleCapture();
  };

  return (
    <div className="dock-cluster absolute bottom-[44px] right-7 z-10 flex items-center gap-[18px] transition-all duration-500 sm:bottom-[52px] sm:right-11">
      {/* Screen Vision (Visual Perception) Launcher */}
      <button
        type="button"
        aria-label={visionActive ? 'Stop screen vision' : 'Share screen with Sofia (Vision)'}
        title={visionActive ? 'Screen Vision Active: Sofia sees your screen (Click to stop)' : 'Screen Vision: Share your screen so Sofia can see what you are looking at'}
        aria-pressed={visionActive}
        onClick={onToggleVision}
        className={`dock-btn relative transition-all duration-300 ${
          visionActive
            ? 'text-emerald-300 bg-emerald-950/40 border-emerald-400/50 drop-shadow-[0_0_14px_rgba(52,211,153,0.6)] animate-pulse'
            : 'hover:text-sky-300'
        }`}
      >
        {visionActive ? <Eye size={18} strokeWidth={1.8} /> : <EyeOff size={18} strokeWidth={1.6} />}
        {visionActive && (
          <span className="absolute -top-1 -right-1 block size-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
        )}
      </button>

      {/* Fullscreen Browser/Workspace launcher */}
      {onToggleBrowser && (
        <button
          type="button"
          aria-label={browserOpen ? 'Close browser' : 'Open browser'}
          title="Sofia Browser"
          onClick={onToggleBrowser}
          className={`dock-btn ${browserOpen ? 'text-sky-300 drop-shadow-[0_0_12px_rgba(56,189,248,0.5)]' : ''}`}
        >
          <Globe size={18} strokeWidth={1.6} />
        </button>
      )}

      {/* Text Chat Launcher — Available anytime */}
      <button
        type="button"
        aria-label="Type message to Sophia"
        title="Type message to Sophia (Chat Panel)"
        aria-expanded={chatOpen}
        onClick={onChat}
        className={`dock-btn ${chatOpen ? 'text-sky-300 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]' : ''}`}
      >
        <MessageSquare size={18} strokeWidth={1.6} />
      </button>

      {/* Main Microphone Button */}
      <button
        ref={micRef}
        type="button"
        aria-label={micLabel}
        aria-pressed={!isMicOff}
        title={micLabel}
        onClick={onMic}
        className={`group relative grid size-[48px] place-items-center rounded-2xl border transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 active:scale-95 ${
          paused
            ? 'border-white/[0.12] bg-white/[0.04] text-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-sky-400/40 hover:bg-white/[0.10] hover:text-white'
            : 'border-sky-400/40 bg-sky-500/[0.16] text-sky-100 shadow-[0_0_20px_rgba(56,189,248,0.38),inset_0_1px_0_rgba(255,255,255,0.22)] hover:border-sky-400/70 hover:bg-sky-500/[0.26] hover:text-white'
        }`}
      >
        {/* Live speaking/listening indicator halo dot when active and running */}
        {!isMicOff && on && (
          <span className="absolute -right-0.5 -top-0.5 block size-[8px] rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]" />
        )}

        <div className="relative z-10 transition-transform duration-300 group-hover:scale-110">
          {isMicOff ? (
            <MicOff
              size={22}
              strokeWidth={2.2}
              className="text-white/60 group-hover:text-white"
              aria-hidden="true"
            />
          ) : (
            <Mic
              size={22}
              strokeWidth={2.2}
              className="text-sky-200 transition-all duration-200 group-hover:scale-105 group-hover:text-white"
              aria-hidden="true"
            />
          )}
        </div>
      </button>
    </div>
  );
}
