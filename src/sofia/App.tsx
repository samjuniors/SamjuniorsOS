'use client';

/**
 * SamJuniors OS — Sophia.
 * An operating environment, not a page: the substance is the interface.
 *
 * SofiaUI one-way reference port @ commit 9e88dee: src/App.tsx — kept
 * byte-identical to the source repo except for the three documented
 * SamJuniorsOS tab-integration seams below (the SofiaUI repository
 * remains independent):
 *   1. 'use client' — Next.js client-component directive (this App is
 *      mounted inside the OS shell via next/dynamic ssr:false).
 *   2. `active` prop — the shell keeps the surface mounted-but-hidden
 *      behind other tabs so her microphone and voice survive; when the
 *      surface is hidden, the window-level keyboard map stands down so
 *      it never steals keys from the OS desktop.
 *   3. Server seams: every /api/sophia/* endpoint the client calls is
 *      served by this repo's adapter routes, which delegate to the
 *      canonical flow (executeSophiaTurn brain, the z-ai/ElevenLabs TTS
 *      ladder, the destination's image/search/browse services).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { dockLayout, stageLayout, type StageLayout } from './sophia/layout';
import { getSophiaOS, type OSStatus } from './sophia/SophiaOS';
import type { SophiaStateName } from './sophia/types';
import { ChatPanel } from './ui/ChatPanel';
import { Brand, Dock, Identity, OrbDock, SofiaStatusPill, StatusCluster } from './ui/Hud';
import { BootScreen } from './ui/BootScreen';
import { BrowserPanel } from './ui/BrowserPanel';
import { DiagnosticsModal } from './ui/DiagnosticsModal';
import { MicPermissionModal } from './ui/MicPermissionModal';
import { SettingsSheet } from './ui/SettingsSheet';
import { Terminal } from './ui/Terminal';
import { controlLayer } from './sophia/control';
import { navigateBrowserTo } from './lib/browser-bridge';
import { ToolStatusBadge } from './ui/ToolStatusBadge';
import { scoreEngine } from './sophia/audio/ScoreEngine';
import { DynamicContentModal, type InfoPanelType } from './ui/DynamicContentModal';
import { backgroundKeepAlive } from './core/BackgroundKeepAlive';
import { ViewRail, type AppView } from './ui/ViewRail';
import { VisionGlow } from './ui/VisionGlow';
import { TheatrePanel } from './ui/TheatrePanel';
import { SofiaDashboard } from './ui/SofiaDashboard';

function isTyping(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

const STATE_ANNOUNCE: Record<SophiaStateName, string> = {
  idle: 'Sophia is here. Calm and stable presence.',
  listening: 'Sophia is listening. Receiving your voice.',
  thinking: 'Sophia is thinking. Reorganizing information.',
  rendering: 'Sophia is rendering. Assembling and building.',
  speaking: 'Sophia is speaking. Sharing voice with you.',
  pause: 'Sophia is paused. Taking a moment.',
  paused: 'Sophia is paused. Taking a moment.',
  completed: 'Task completed successfully. Returning to calm.',
  blocked: 'Sophia needs your help or permission to continue.',
  ambient: 'Sophia is present.',
  wakeup: 'Sophia is waking up.',
  focusing: 'Sophia is focusing.',
  transforming: 'Sophia is transforming.',
};

export default function App({ active = true }: { active?: boolean }) {
  const os = useMemo(() => getSophiaOS(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const micRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<SophiaStateName>(os.state.current);
  const [status, setStatus] = useState<OSStatus>(os.status);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [infoCardOpen, setInfoCardOpen] = useState(false);
  const [infoCardData, setInfoCardData] = useState<{ title: string; content: string; type: InfoPanelType }>({
    title: 'Information Review',
    content: '',
    type: 'info',
  });
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [micModalOpen, setMicModalOpen] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [booted, setBooted] = useState(false);
  const [view, setView] = useState<AppView>('sofia');
  const [theatreOpen, setTheatreOpen] = useState(false);
  const [layout, setLayout] = useState<StageLayout>(() => stageLayout(window.innerWidth, window.innerHeight));

  const docked = browserOpen || infoCardOpen;
  const paused = state === 'paused';

  useEffect(() => {
    backgroundKeepAlive.start();
    return () => backgroundKeepAlive.stop();
  }, []);

  useEffect(() => {
    os.setDocked(docked);
  }, [docked, os]);

  useEffect(() => {
    const onBrowserCmd = (e: Event) => {
      const open = Boolean((e as CustomEvent).detail?.open);
      setBrowserOpen(open);
    };
    controlLayer.addEventListener('command:browser', onBrowserCmd);

    const onInfoCardCmd = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        open?: boolean;
        title?: string;
        content?: string;
        type?: InfoPanelType;
      };
      if (detail.open !== false) {
        setInfoCardData({
          title: detail.title || 'Information Review',
          content: detail.content || '',
          type: detail.type || 'info',
        });
        setInfoCardOpen(true);
      } else {
        setInfoCardOpen(false);
      }
    };
    controlLayer.addEventListener('command:info_card', onInfoCardCmd);

    // Voice-driven panel control (control_ui tool)
    const onUiCmd = (e: Event) => {
      const { target, action } = (e as CustomEvent).detail as { target: string; action: string };
      const open = action === 'open';
      const close = action === 'close';
      const toggle = action === 'toggle' || action === 'minimize';

      const apply = (setter: Dispatch<SetStateAction<boolean>>) => {
        if (toggle) setter((v) => !v);
        else if (open) setter(true);
        else if (close) setter(false);
      };

      if (target === 'browser') apply(setBrowserOpen);
      else if (target === 'chat') apply(setChatOpen);
      else if (target === 'settings') apply(setSettingsOpen);
      else if (target === 'diagnostics') apply(setDiagnosticsOpen);
      else if (target === 'terminal') apply(setTerminalOpen);
      else if (target === 'info_card') apply(setInfoCardOpen);
      else if (target === 'all' && (close || toggle)) {
        setBrowserOpen(false);
        setChatOpen(false);
        setSettingsOpen(false);
        setDiagnosticsOpen(false);
        setTerminalOpen(false);
        setInfoCardOpen(false);
      }
    };
    controlLayer.addEventListener('command:ui', onUiCmd);

    // Music commands
    const onMusicCmd = (e: Event) => {
      const { action } = (e as CustomEvent).detail as { action: string };
      if (action === 'play' || action === 'resume') {
        os.audio.unlockAudio().then(() => {
          // scoreEngine is available via os internally
          os.dispatchEvent(new CustomEvent('music:play'));
        }).catch(() => undefined);
      } else if (action === 'stop' || action === 'pause') {
        os.dispatchEvent(new CustomEvent('music:stop'));
      }
    };
    controlLayer.addEventListener('command:music', onMusicCmd);

    // Rendering state when image generation starts (from GeminiLiveProvider tool_call)
    const onImageGen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.url) {
        // Image complete — show in chat
        setChatOpen(true);
      }
    };
    controlLayer.addEventListener('image:generated', onImageGen);

    // Web navigation commands (web_search, open_url, play_music)
    const onNavCmd = (e: Event) => {
      const { url, query, title } = (e as CustomEvent).detail as { url?: string; query?: string; title?: string };
      const target = url || (query ? `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}` : '');
      if (target) {
        setBrowserOpen(true);
        navigateBrowserTo(target, title);
      }
    };
    controlLayer.addEventListener('command:navigate', onNavCmd);

    // Volume control command
    const onVolCmd = (e: Event) => {
      const { level } = (e as CustomEvent).detail as { level?: number };
      if (typeof level === 'number') {
        scoreEngine.setMasterVolume(level / 100);
      }
    };
    controlLayer.addEventListener('command:volume', onVolCmd);

    return () => {
      controlLayer.removeEventListener('command:browser', onBrowserCmd);
      controlLayer.removeEventListener('command:info_card', onInfoCardCmd);
      controlLayer.removeEventListener('command:ui', onUiCmd);
      controlLayer.removeEventListener('command:music', onMusicCmd);
      controlLayer.removeEventListener('image:generated', onImageGen);
      controlLayer.removeEventListener('command:navigate', onNavCmd);
      controlLayer.removeEventListener('command:volume', onVolCmd);
    };
  }, [os]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) os.attach(canvas);
    const onState = (e: Event) => setState((e as CustomEvent).detail.state);
    const onStatus = (e: Event) => setStatus((e as CustomEvent).detail);
    const onMicStatus = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.status === 'denied') {
        setMicModalOpen(true);
      }
    };
    const onFail = () => setGlFailed(true);
    const onEntered = () => setBooted(true);

    os.addEventListener('state', onState);
    os.addEventListener('status', onStatus);
    os.addEventListener('mic-status', onMicStatus);
    os.addEventListener('renderer-failed', onFail);
    os.addEventListener('entered', onEntered);

    const measure = () => {
      const w = canvas?.clientWidth || window.innerWidth;
      const h = canvas?.clientHeight || window.innerHeight;
      setLayout(stageLayout(w, h));
      const r = micRef.current?.getBoundingClientRect();
      os.setFocusPoint(r ? r.left + r.width / 2 : w * 0.92, r ? r.top + r.height / 2 : h * 0.92, w, h);
    };
    measure();
    const ro = canvas ? new ResizeObserver(measure) : null;
    if (canvas) ro!.observe(canvas);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      os.removeEventListener('state', onState);
      os.removeEventListener('status', onStatus);
      os.removeEventListener('mic-status', onMicStatus);
      os.removeEventListener('renderer-failed', onFail);
      os.removeEventListener('entered', onEntered);
      os.detach();
    };
  }, [os]);

  useEffect(() => {
    const unlock = () => {
      void os.audio.unlockAudio();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, [os]);

  const onMic = useCallback(() => {
    void os.audio.unlockAudio();
    if (os.rendererFailed) return;
    if (os.audio.micStatus === 'denied') {
      setMicModalOpen(true);
      return;
    }
    if (os.isPaused || paused || os.state.is('ambient', 'idle', 'completed')) {
      if (os.isPaused || paused) os.resume();
      void os.enterSession('mic-button');
    } else {
      os.pause();
    }
  }, [os, paused]);

  const toggleShapePause = useCallback(() => {
    void os.audio.unlockAudio();
    if (os.rendererFailed) return;
    if (os.audio.micStatus === 'denied' || os.isMicDisabledError) {
      setMicModalOpen(true);
      return;
    }
    if (os.isPaused || paused || os.state.is('ambient', 'idle', 'completed')) {
      if (os.isPaused || paused) os.resume();
      void os.enterSession('mic-button');
    } else {
      os.pause();
    }
  }, [os, paused]);

  useEffect(() => {
    // Tab-integration seam: the shell keeps this surface mounted-but-hidden
    // behind other tabs; while hidden, the keyboard map stands down so the
    // OS desktop owns the keys. (SofiaUI itself is the whole page.)
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (theatreOpen) {
          setTheatreOpen(false);
          setView('sofia');
        } else if (view === 'dashboard') {
          setView('sofia');
        } else if (diagnosticsOpen) setDiagnosticsOpen(false);
        else if (browserOpen) setBrowserOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (terminalOpen) setTerminalOpen(false);
        else if (chatOpen) setChatOpen(false);
        else if (os.state.current !== 'ambient') os.deactivate('escape');
        return;
      }
      if (isTyping()) return;
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        setTheatreOpen((v) => {
          const next = !v;
          setView(next ? 'theatre' : 'sofia');
          return next;
        });
      }
      if (e.key === 'm' || e.key === 'M' || e.key === ' ') {
        e.preventDefault();
        onMic();
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (os.isPaused) os.resume();
        else os.pause();
      }
      if (e.key === 't' || e.key === 'T' || e.key === '/') {
        e.preventDefault();
        setChatOpen((v) => !v);
      }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setDiagnosticsOpen((v) => !v);
      }
      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        setTerminalOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onMic, browserOpen, chatOpen, settingsOpen, terminalOpen, diagnosticsOpen, theatreOpen, view, os]);

  const health = glFailed ? 'error' : os.health;

  const stageStyle = {
    left: layout.cx - layout.R,
    top: layout.cy - layout.R,
    width: layout.R * 2,
    height: layout.R * 2,
  } as const;
  const hitLayout = docked ? dockLayout(window.innerWidth, window.innerHeight) : layout;
  const hitRadius = docked ? 40 : hitLayout.R * 1.08;
  const shapeHitStyle = {
    left: hitLayout.cx - hitRadius,
    top: hitLayout.cy - hitRadius,
    width: hitRadius * 2,
    height: hitRadius * 2,
  } as const;

  return (
    <div
      className={`font-sophia fixed inset-0 select-none overflow-hidden bg-[#04060f] text-white antialiased transition-all duration-700 ease-out ${
        paused ? 'sophia-paused' : ''
      }`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden="true" />
      {glFailed && <div className="sophia-fallback" style={stageStyle} aria-hidden="true" />}

      {/* The substance itself is a control: click to pause, click again to resume. */}
      {!glFailed && (
        <button
          type="button"
          aria-label={paused ? 'Resume Sophia' : 'Pause Sophia'}
          title={paused ? 'Resume Sophia' : 'Pause Sophia'}
          onClick={toggleShapePause}
          className="absolute z-[4] rounded-full bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-sky-300/40"
          style={shapeHitStyle}
        />
      )}

      <Brand />
      <VisionGlow />
      <StatusCluster
        health={health}
        active={state !== 'ambient' || status === 'live'}
        settingsOpen={settingsOpen}
        onSettings={() => setSettingsOpen((v) => !v)}
        onDiagnostics={() => setDiagnosticsOpen(true)}
        os={os}
      />
      <Identity layout={layout} state={state} docked={docked} />
      <OrbDock visible={docked && !glFailed} state={state} />

      {chatOpen && (
        <ChatPanel status={status} onClose={() => setChatOpen(false)} onSend={(t) => os.sendText(t)} />
      )}
      {!booted && (
        <div className="absolute inset-0 z-50">
          <BootScreen os={os} onEnter={() => setBooted(true)} />
        </div>
      )}
      {booted && settingsOpen && <SettingsSheet os={os} status={status} onClose={() => setSettingsOpen(false)} />}
      {booted && <Terminal os={os} open={terminalOpen} onToggle={() => setTerminalOpen((v) => !v)} hideButton />}
      {browserOpen && <BrowserPanel onClose={() => setBrowserOpen(false)} />}
      {infoCardOpen && (
        <DynamicContentModal
          onClose={() => setInfoCardOpen(false)}
          initialTitle={infoCardData.title}
          initialContent={infoCardData.content}
          initialType={infoCardData.type}
        />
      )}
      {diagnosticsOpen && <DiagnosticsModal os={os} onClose={() => setDiagnosticsOpen(false)} />}
      {micModalOpen && (
        <MicPermissionModal
          os={os}
          onClose={() => setMicModalOpen(false)}
          onOpenChat={() => setChatOpen(true)}
        />
      )}
      {theatreOpen && (
        <TheatrePanel
          onClose={() => {
            setTheatreOpen(false);
            setView('sofia');
          }}
        />
      )}
      {view === 'dashboard' && (
        <SofiaDashboard
          state={state}
          status={status}
          health={health}
          onMic={onMic}
          onOpenChat={() => setChatOpen((v) => !v)}
          onOpenTerminal={() => setTerminalOpen((v) => !v)}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
          onOpenSettings={() => setSettingsOpen((v) => !v)}
          onBackToSofia={() => setView('sofia')}
        />
      )}
      {booted && (
        <ViewRail
          view={view}
          onChange={(v) => {
            setView(v);
            setTheatreOpen(v === 'theatre');
          }}
        />
      )}

      {/* Bottom-left corner: Sofia real-time Status Pill + Terminal console */}
      <div className="fixed bottom-[44px] left-7 z-10 flex items-center gap-2.5 transition-all duration-500 sm:bottom-[52px] sm:left-11">
        <SofiaStatusPill
          state={state}
          paused={paused}
          onClick={toggleShapePause}
          os={os}
          onDiagnostics={() => setDiagnosticsOpen(true)}
        />

        {booted && (
          <button
            type="button"
            aria-label={terminalOpen ? 'Close terminal' : 'Open terminal'}
            aria-pressed={terminalOpen}
            onClick={() => setTerminalOpen((v) => !v)}
            title="Terminal"
            className={`dock-btn ${
              terminalOpen ? 'text-sky-300 drop-shadow-[0_0_12px_rgba(56,189,248,0.5)]' : ''
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
        )}
      </div>

      {/* Voice-first subtle Tool status badge & notification HUD */}
      <ToolStatusBadge />

      <Dock
        state={state}
        micRef={micRef}
        onMic={onMic}
        onChat={() => setChatOpen((v) => !v)}
        chatOpen={chatOpen}
        paused={paused}
        browserOpen={browserOpen}
        onToggleBrowser={() => setBrowserOpen((v) => !v)}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {STATE_ANNOUNCE[state]} Voice transport {status}. System health {health}.
      </p>
    </div>
  );
}
