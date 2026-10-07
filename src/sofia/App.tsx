'use client';

/**
 * Sophia — the SofiaUI surface for SamJuniorsOS.
 *
 * Ported/adapted from SofiaUI @ commit 9e88dee: src/App.tsx
 * The SofiaUI repository remains independent; one-way reference port.
 *
 * The surface composition is SofiaUI's: full-screen WebGL2 particle Sophia,
 * the Brand/Identity chrome, the bottom-right Dock (chat + session mic),
 * the bottom-left SofiaStatusPill, the BootScreen entry overlay and the
 * mic-permission modal — mounted inside the shell's `.sofia-scope` wrapper
 * (always mounted, hidden behind other tabs so her microphone and voice
 * survive tab switches).
 *
 * The FLOW is the destination's, unchanged (this is the "merge with the
 * current flow" contract):
 *   - voice: liveBridge.toggleVoice / startPtt / stopPtt + voiceRuntime
 *     (ws-ticket → gateway :3001 → STT → executeSophiaTurn → /api/sofia/tts
 *     playback) — the same seams the OS tray, ribbon and widget use;
 *   - interruption: voiceRuntime.interrupt() (playback cut + server
 *     cancel), Escape or the orb;
 *   - text turns: the canonical /api/sofia/ask SSE path (client-minted
 *     turnId, server-threaded conversationId, server-side directive
 *     execution), with the OS fast path (os.localCommand) first;
 *   - visual state: the shared SofiaState machine (src/sofia/engine)
 *     driven by the transport status — the exact mapping the
 *     voice-presence widget uses — plus text-turn events.
 *
 * Not ported from SofiaUI (documented deltas): the screen-vision and
 * browser dock buttons and their tools, SettingsSheet/Terminal/
 * DiagnosticsModal/BrowserPanel/DynamicContentModal (SofiaUI's own
 * surfaces with server dependencies this flow does not carry), wake-word
 * spotting, SofiaUI's provider stack, the ScoreEngine music kit, and
 * spoken replies for TYPED turns (text replies arrive as text + visuals;
 * only voice turns speak — the destination's runtime owns spoken output).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { stageLayout, STAGE_CY_SOFIAUI, type StageLayout } from '@/sofia/engine/layout';
import type { SophiaStateName } from '@/sofia/engine/types';
import { Brand, Dock, Identity } from '@/sofia/ui/Hud';
import { SofiaStatusPill } from '@/sofia/ui/SofiaStatusPill';
import { ChatPanel } from '@/sofia/ui/ChatPanel';
import { BootScreen } from '@/sofia/ui/BootScreen';
import { ask } from '@/sofia/lib/ask';
import type { SurfaceTurn } from '@/sofia/types';
import { useVoicePresence } from '@/os/components/voice/useVoicePresence';
import { VoicePermissionModal, probeMicPermission, type MicProbeResult } from '@/os/components/voice/VoicePermissionModal';
import { os } from '@/os/lib/osStore';
import { liveBridge } from '@/os/lib/liveCompanionBridge';
import { osSound } from '@/os/lib/osAudio';

/** Screen-reader announcements per state (SofiaUI App.tsx strings). */
const SURFACE_ANNOUNCE: Record<SophiaStateName, string> = {
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

function isTyping(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

export default function SofiaSurface({ active = true }: { active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const micRef = useRef<HTMLButtonElement>(null);

  const v = useVoicePresence(canvasRef, {
    stageCyRatio: STAGE_CY_SOFIAUI,
    parkWhenHidden: true,
    announce: SURFACE_ANNOUNCE,
  });

  const [booted, setBooted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [layout, setLayout] = useState<StageLayout>(() => stageLayout(1280, 800));

  /* ------------------------------------------------------- conversation */
  const [turns, setTurns] = useState<SurfaceTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);
  const nextId = () => `t${++idRef.current}`;
  const streamIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cadenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLiveTurnRef = useRef<{ finalText: string; lastReply: string } | null>(null);

  const pushTurn = useCallback((turn: SurfaceTurn) => {
    setTurns((list) => [...list, turn]);
  }, []);

  const patchTurn = useCallback((id: string, patch: Partial<SurfaceTurn>) => {
    setTurns((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  /** The visual machine's post-turn cadence (SofiaOS: completed → calm). */
  const settleCadence = useCallback(() => {
    if (cadenceRef.current) clearTimeout(cadenceRef.current);
    cadenceRef.current = setTimeout(() => {
      if (v.isVisualState('completed')) v.standDownVisual('post-turn-quiet');
    }, 1700);
  }, [v]);

  /** Submit one text turn through the canonical flow. */
  const submit = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || busy) return;

      pushTurn({ id: nextId(), role: 'user', text: clean, final: true, ts: Date.now() });

      // OS fast path — local founder records (decisions, focus, notes).
      const local = os.localCommand(clean);
      if (local !== null) {
        pushTurn({ id: nextId(), role: 'sophia', text: local, final: true, ts: Date.now() });
        os.setLastSaid(local);
        return;
      }

      const id = nextId();
      streamIdRef.current = id;
      pushTurn({ id, role: 'sophia', text: '', final: false, ts: Date.now() });
      setBusy(true);
      os.setSophia('thinking');
      v.driveEvent('thinking');
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await ask(
          clean,
          {
            onText: (delta) => {
              setTurns((list) =>
                list.map((t) => (t.id === streamIdRef.current ? { ...t, text: t.text + delta } : t)),
              );
            },
          },
          controller.signal,
        );
        const text2 = res.text || '(no reply)';
        patchTurn(id, { text: text2, final: true });
        os.setLastSaid(text2);
        v.driveEvent('response_finished');
        settleCadence();
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        if (aborted) {
          setTurns((list) =>
            list.map((t) => (t.id === id ? { ...t, text: t.text ? `${t.text} (interrupted)` : '(interrupted)', final: true } : t)),
          );
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          os.log(`Execution failed: ${msg}`);
          patchTurn(id, {
            text: `That failed on the server — nothing was simulated locally. ${msg}`,
            final: true,
          });
        }
        v.standDownVisual('text-turn-ended');
      } finally {
        os.setSophia('idle');
        setBusy(false);
        abortRef.current = null;
        streamIdRef.current = null;
      }
    },
    [busy, patchTurn, pushTurn, settleCadence, v],
  );

  /* Voice turns land in the same conversation view (SofiaUI parity: one
     history). The transport owns the audio; the surface only mirrors the
     committed transcript and reply as chat turns. */
  useEffect(() => {
    const live = v.live;
    const prev = prevLiveTurnRef.current;
    prevLiveTurnRef.current = { finalText: live.finalText, lastReply: live.lastReply };
    if (!prev) return; // first run after mount — no replay
    if (live.finalText && live.finalText !== prev.finalText) {
      pushTurn({ id: nextId(), role: 'user', text: live.finalText, final: true, ts: Date.now() });
    }
    if (live.lastReply && live.lastReply !== prev.lastReply) {
      pushTurn({ id: nextId(), role: 'sophia', text: live.lastReply, final: true, ts: Date.now() });
    }
  }, [v.live, pushTurn]);

  /* ------------------------------------------------------------ layout */
  useEffect(() => {
    const canvas = canvasRef.current;
    const measure = () => {
      const w = canvas?.clientWidth || window.innerWidth;
      const h = canvas?.clientHeight || window.innerHeight;
      setLayout(stageLayout(w, h));
    };
    measure();
    const ro = canvas ? new ResizeObserver(measure) : null;
    if (canvas && ro) ro.observe(canvas);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => () => {
    if (cadenceRef.current) clearTimeout(cadenceRef.current);
    abortRef.current?.abort();
  }, []);

  /* ------------------------------------------------------- interactions */

  /** Session mic: same seam as the OS tray, the ribbon and the widget.
   *  Permission gating mirrors the widget: a denied mic opens the
   *  destination's permission modal instead of toggling. */
  const handleMic = useCallback(() => {
    if (v.micDenied) {
      setPermModalOpen(true);
      return;
    }
    void v.onMicToggle();
  }, [v]);

  const handleMicFromBoot = useCallback(() => {
    setBooted(true);
    if (v.micDenied) {
      setPermModalOpen(true);
      return;
    }
    void v.onMicToggle(true);
  }, [v]);

  const handleEnterText = useCallback(() => {
    setBooted(true);
    setChatOpen(true);
  }, []);

  const handlePermGranted = useCallback(() => {
    setPermModalOpen(false);
    void v.onMicToggle(true);
  }, [v]);

  const handlePermRetry = useCallback(async (): Promise<MicProbeResult> => probeMicPermission(), []);

  /* Keyboard (SofiaUI's map, merged with the destination's PTT contract):
   *   Space — session OFF: start the live-voice session; session ON:
   *           hold-to-talk (the destination's PTT seam).
   *   M     — toggle the live-voice session.
   *   T / /  — toggle the chat panel.
   *   Esc    — close the permission modal → the chat → abort a text turn →
   *           interrupt the spoken turn (the widget's Escape contract). */
  useEffect(() => {
    if (!active) return;
    const pttHeld = { current: false };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (permModalOpen) setPermModalOpen(false);
        else if (chatOpen) setChatOpen(false);
        else if (busy) abortRef.current?.abort();
        else if (v.interruptible) v.onInterrupt();
        return;
      }
      if (isTyping()) return;
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleMic();
      }
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (!v.live.enabled) {
          handleMic();
          return;
        }
        if (!e.repeat && !pttHeld.current) {
          pttHeld.current = true;
          osSound.click();
          liveBridge.startPtt();
        }
      }
      if (e.key === 't' || e.key === 'T' || e.key === '/') {
        e.preventDefault();
        setChatOpen((o) => !o);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        if (pttHeld.current) {
          e.preventDefault();
          pttHeld.current = false;
          osSound.click();
          liveBridge.stopPtt();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [active, busy, chatOpen, handleMic, permModalOpen, v]);

  /* Pointer hold-to-talk (touch parity with the ribbon). */
  const handlePttDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    osSound.click();
    liveBridge.startPtt();
  };
  const handlePttUp = (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    osSound.click();
    liveBridge.stopPtt();
  };

  /* ------------------------------------------------------------ derived */

  const state = v.state;
  const stageStyle = {
    left: layout.cx - layout.R,
    top: layout.cy - layout.R,
    width: layout.R * 2,
    height: layout.R * 2,
  } as const;

  const listening = v.live.enabled && v.live.status === 'listening';

  /* The Identity line — SofiaUI's "latest turn" for this flow: the live
     interim transcript while listening, else the streaming text reply,
     else the last spoken reply, else the latest chat line. */
  const streamingText = turns.length ? turns[turns.length - 1] : null;
  const identityLine = listening
    ? v.live.interimText || '…'
    : busy && streamingText?.text
      ? streamingText.text
      : v.live.lastReply || streamingText?.text || '';

  const transport = v.live.enabled ? v.live.status : 'off';

  return (
    <div
      className={`relative h-full w-full select-none overflow-hidden bg-[#04060f] text-white antialiased transition-all duration-700 ease-out`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden="true" />
      {v.glFailed && <div className="sophia-fallback" style={stageStyle} aria-hidden="true" />}

      {/* The substance itself is a control: interrupt while she speaks or
          thinks (the widget's orb contract). */}
      {!v.glFailed && (
        <button
          type="button"
          aria-label={v.interruptible ? 'Interrupt Sophia' : 'Voice presence'}
          title={v.interruptible ? 'Interrupt Sophia (Escape)' : 'Voice presence'}
          disabled={!v.interruptible}
          onClick={v.onInterrupt}
          className="absolute z-[4] rounded-full bg-transparent outline-none transition-opacity focus-visible:ring-1 focus-visible:ring-sky-300/40 disabled:cursor-default"
          style={stageStyle}
        />
      )}

      <Brand />
      <Identity layout={layout} state={state} line={identityLine} />

      {chatOpen && (
        <ChatPanel
          sessionOn={v.live.enabled}
          liveStatus={v.live.status}
          turns={turns}
          busy={busy}
          onClose={() => setChatOpen(false)}
          onSend={(t) => void submit(t)}
        />
      )}

      {!booted && (
        <div className="absolute inset-0 z-50">
          <BootScreen
            onEnterVoice={handleMicFromBoot}
            onEnterText={handleEnterText}
            onMicHelp={() => setPermModalOpen(true)}
          />
        </div>
      )}

      <VoicePermissionModal
        open={permModalOpen}
        onRetry={handlePermRetry}
        onGranted={handlePermGranted}
        onClose={() => setPermModalOpen(false)}
      />

      {/* Bottom-left corner: Sofia real-time Status Pill + hold-to-talk */}
      <div className="fixed bottom-[44px] left-7 z-10 flex items-center gap-2.5 transition-all duration-500 sm:bottom-[52px] sm:left-11">
        <SofiaStatusPill
          state={state}
          micDenied={v.micDenied}
          onClick={v.micDenied ? () => setPermModalOpen(true) : handleMic}
        />

        {v.live.enabled && (
          <button
            type="button"
            onPointerDown={handlePttDown}
            onPointerUp={handlePttUp}
            onPointerCancel={handlePttUp}
            title="Hold to Speak (Push-to-Talk)"
            aria-label={listening ? 'Release to send' : 'Hold to talk'}
            className={`dock-btn ${
              listening
                ? 'border-cyan-300 bg-cyan-400 text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.7)]'
                : ''
            }`}
          >
            <Mic size={18} strokeWidth={1.8} className={listening ? 'animate-pulse' : ''} />
          </button>
        )}
      </div>

      <Dock
        state={state}
        micRef={micRef}
        onMic={handleMic}
        onChat={() => setChatOpen((o) => !o)}
        chatOpen={chatOpen}
        sessionOn={v.live.enabled}
        micDenied={v.micDenied}
        streaming={busy}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {v.announce} Voice transport {transport}.
        {v.live.error ? ` ${v.live.error}` : ''}
      </p>
    </div>
  );
}
