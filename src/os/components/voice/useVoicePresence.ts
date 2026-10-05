/**
 * useVoicePresence — React glue for the SofiaUI voice-presence port.
 *
 * Ported/adapted from SofiaUI @ commit 9e88dee:
 *   - src/App.tsx (canvas attach, reduced-motion wiring, keyboard, sr-only
 *     announcements, WebGL-failure fallback trigger)
 *   - src/sophia/SophiaOS.ts (the minimal per-frame loop `attach()` runs, the
 *     completed→ambient post-turn cadence, and the state-machine feeding)
 * The SofiaUI repository remains independent; one-way reference port.
 *
 * What this hook does NOT do (deliberate, per the approved migration plan):
 *   - No audio engine. Nothing captures or plays audio here. Sustained
 *     capture is owned by the existing live-voice client; the orb's motion
 *     uses SofiaUI's own designed fallback (VisualDirector procedural
 *     envelopes when hardware levels are absent). Real amplitude wiring
 *     arrives with the voice-runtime phase.
 *   - No wake word, no provider stack, no chat/terminal/settings surfaces.
 *   - Interruption goes through the EXISTING seam (liveBridge.interrupt →
 *     live-client INTERRUPT). The known server-side limitation (server work
 *     is not cancelled by stopping playback) is a pre-existing, documented
 *     defect scheduled for the cancellation phase — this port does not
 *     pretend to fix it and does not add a second protocol.
 *
 * State mapping (destination live-voice status → ported SophiaState machine):
 *   connecting → wakeup (with orb convergence on first connect)
 *   idle       → idle (from wakeup, deferred by the machine's MIN_HOLD)
 *   listening  → listening (from speaking: barge-in choreography)
 *   transcribing → (stays listening)
 *   thinking   → thinking
 *   speaking    → speaking
 *   interrupted → interrupted (→ listening, reason 'interrupted')
 *   error       → blocked
 *   speaking→idle fires 'response_finished' (→ completed, then ambient after
 *   the SophiaOS post-turn cadence)
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useOS, liveVoiceState, type LiveVoiceState } from "../../lib/osStore";
import { liveBridge } from "../../lib/liveCompanionBridge";
import { SophiaState } from "./orb/SophiaState";
import { VisualDirector } from "./orb/VisualDirector";
import { ParticleRenderer } from "./orb/ParticleRenderer";
import type { SophiaStateName } from "./orb/types";

/** Screen-reader announcements per state (ported from SofiaUI App.tsx). */
const STATE_ANNOUNCE: Record<SophiaStateName, string> = {
  idle: "Voice presence is standing by. Hold space to speak.",
  ambient: "Voice presence is standing by.",
  listening: "Sophia is listening. Receiving your voice.",
  thinking: "Sophia is thinking. Reorganizing information.",
  rendering: "Sophia is rendering. Assembling and building.",
  speaking: "Sophia is speaking. Sharing voice with you.",
  pause: "Voice presence is paused. Taking a moment.",
  paused: "Voice presence is paused. Taking a moment.",
  completed: "Task completed successfully. Returning to calm.",
  blocked: "Voice presence needs your help or permission to continue.",
  wakeup: "Voice presence is waking up.",
  focusing: "Voice presence is focusing.",
  transforming: "Voice presence is transforming.",
};

const MIC_ERROR_RE = /microphone/i;

/** One-shot timers owned by this hook (post-turn cadence, wake choreography).
 *
 *  The canvas ref is owned by the CALLER and passed in: the hook must not
 *  return a ref (a returned object containing a ref taints every property
 *  of the return value for the React-Compiler lint rules). */
export function useVoicePresence(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const fsmRef = useRef<SophiaState | null>(null);
  const directorRef = useRef<VisualDirector | null>(null);
  const rendererRef = useRef<ParticleRenderer | null>(null);
  const rafRef = useRef(0);
  const tPrevRef = useRef(0);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const prevLiveRef = useRef<LiveVoiceState | null>(null);
  const firstRunRef = useRef(true);

  const [displayState, setDisplayState] = useState<SophiaStateName>("ambient");
  const [announce, setAnnounce] = useState<string>(STATE_ANNOUNCE.ambient);
  const [flash, setFlash] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  const live = useOS(liveVoiceState);

  /* Derived (no effect-setState needed): mic is denied when the permission
     API says so OR the live transport reported a microphone failure. */
  const micDenied = permDenied || (live.error ? MIC_ERROR_RE.test(live.error) : false);
  const interruptible = displayState === "speaking" || displayState === "thinking";

  /* ---------------------------------------------------------------- engine */
  useEffect(() => {
    const fsm = new SophiaState();
    const director = new VisualDirector();
    fsmRef.current = fsm;
    directorRef.current = director;

    const announceTransition = (s: SophiaStateName, meta: Record<string, unknown>) => {
      setDisplayState(s);
      if (meta?.reason === "interrupted") {
        setAnnounce("Interrupted. Listening again.");
        setFlash(true);
        const t = setTimeout(() => setFlash(false), 700);
        timersRef.current.add(t);
      } else {
        setAnnounce(STATE_ANNOUNCE[s]);
      }
    };
    const unsub = fsm.subscribe((s, _prev, meta) => announceTransition(s, meta));

    // SofiaUI's minimal render loop (SophiaOS.attach): clamp dt, feed the
    // director from the state machine, render. The renderer is created on
    // the first frame so a WebGL2 failure surfaces without touching render.
    tPrevRef.current = performance.now();
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (!rendererRef.current) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        try {
          rendererRef.current = new ParticleRenderer(canvas);
        } catch (err) {
          console.warn("[voice-presence] WebGL2 renderer unavailable:", err);
          setGlFailed(true);
          cancelAnimationFrame(rafRef.current);
          return;
        }
      }
      const dt = Math.min(0.05, Math.max(0.0005, (now - tPrevRef.current) / 1000));
      tPrevRef.current = now;
      director.state = fsm.current;
      rendererRef.current.frame(director.frame(dt, { mic: 0, play: 0 }));
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      unsub();
      fsmRef.current = null;
      directorRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  /* ------------------------------------------------- reduced-motion (SofiaUI) */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => directorRef.current?.setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /* --------------------------------------------- microphone permission state */
  useEffect(() => {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!perms?.query) return; // API unavailable: stay neutral until a live error proves denial
    let status: PermissionStatus | null = null;
    perms
      .query({ name: "microphone" as PermissionName })
      .then((s) => {
        status = s;
        setPermDenied(s.state === "denied");
        s.onchange = () => setPermDenied(s.state === "denied");
      })
      .catch(() => undefined);
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  /* -------------------------------------- live-voice status → state machine */
  useEffect(() => {
    const fsm = fsmRef.current;
    const director = directorRef.current;
    if (!fsm) return;

    const clearTurnTimers = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
    const later = (ms: number, fn: () => void) => {
      const t = setTimeout(() => {
        timersRef.current.delete(t);
        fn();
      }, ms);
      timersRef.current.add(t);
    };

    const prev = prevLiveRef.current;
    prevLiveRef.current = live;

    // First run after mount (the widget can mount mid-conversation when the
    // founder switches tabs): place the machine exactly where the transport
    // is, without replaying choreography.
    if (firstRunRef.current) {
      firstRunRef.current = false;
      switch (live.status) {
        case "connecting":
          fsm.setState("wakeup");
          break;
        case "listening":
        case "transcribing":
          fsm.setState("listening");
          break;
        case "thinking":
          fsm.setState("thinking");
          break;
        case "speaking":
          fsm.setState("speaking");
          break;
        case "interrupted":
          fsm.setState("listening");
          break;
        case "error":
          fsm.setState("blocked");
          break;
        default:
          fsm.setState(live.enabled ? "idle" : "ambient");
          break;
      }
      return;
    }
    if (!prev) return;

    if (!live.enabled && prev.enabled) {
      clearTurnTimers();
      fsm.standDown("voice-off");
      return;
    }
    if (!live.enabled) return;
    if (live.status === prev.status) return;

    switch (live.status) {
      case "connecting":
        if (prev.status === "disconnected") director?.playWake();
        fsm.transition("wakeup", { source: "connecting" });
        break;
      case "idle":
        if (prev.status === "speaking" || prev.status === "thinking") {
          // A finished turn completes (emerald), then settles (SophiaOS cadence).
          fsm.handleVoiceEvent("response_finished");
          later(1700, () => {
            if (fsm.is("completed")) fsm.standDown("post-turn-quiet");
          });
        } else {
          fsm.transition("idle", { source: "session-ready" });
        }
        break;
      case "listening":
        if (prev.status === "speaking") {
          // Barge-in while the answer plays: the same visual the SofiaUI
          // acoustic barge-in produces, driven here by push-to-talk.
          fsm.handleVoiceEvent("speech_started");
        } else {
          fsm.transition("listening", { source: "ptt" });
        }
        break;
      case "transcribing":
        break; // interim STT: remain in listening
      case "thinking":
        fsm.handleVoiceEvent("thinking");
        break;
      case "speaking":
        fsm.handleVoiceEvent("response_started");
        break;
      case "interrupted":
        fsm.handleVoiceEvent("interrupted");
        break;
      case "error":
        fsm.transition("blocked", { reason: "error", code: "live-error" });
        break;
      case "disconnected":
        clearTurnTimers();
        fsm.standDown("disconnected");
        break;
    }
  }, [live]);

  /* ----------------------------------------------------------- interactions */

  /** Toggle the existing live-voice session (same seam as the OS tray and
   *  the transcript ribbon use). Optional `enabled` forces a direction — used
   *  after a granted permission retry. Permission gating happens in the widget. */
  const onMicToggle = useCallback((enabled?: boolean) => {
    void liveBridge.toggleVoice(enabled);
  }, []);

  /** Interrupt the current turn through the existing seam. Visual feedback
   *  arrives via the transport's 'interrupted' status. */
  const onInterrupt = useCallback(() => {
    liveBridge.interrupt();
  }, []);

  return {
    state: displayState,
    live,
    micDenied,
    glFailed,
    flash,
    interruptible,
    announce,
    onMicToggle,
    onInterrupt,
  };
}
