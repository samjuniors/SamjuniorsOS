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
 * Phase 3 (voice runtime): this hook now drives the orb with REAL audio
 * amplitude — mic RMS from the live client's capture worklet and playback
 * RMS from the spoken-reply engine — via the voice runtime facade
 * (../../lib/voiceRuntime). When hardware levels are absent the ported
 * VisualDirector still substitutes its designed procedural envelopes.
 * Interruption routes through the runtime (playback stop + the existing
 * bridge interrupt seam, which now cancels the in-flight server turn).
 *
 * What this hook still does NOT do (deliberate, per the approved migration
 *   plan): no wake word, no provider stack, no chat/terminal/settings
 *   surfaces, no second protocol. The runtime owns audio; this hook owns
 *   presentation only.
 *
 * State mapping (destination live-voice status → ported SophiaState machine):
 *   connecting → wakeup (with orb convergence on first connect)
 *   idle       → idle (from wakeup, deferred by the machine's MIN_HOLD)
 *   listening  → listening (from speaking: barge-in choreography)
 *   transcribing → (stays listening)
 *   thinking   → thinking
 *   speaking    → speaking (now REAL: held by the runtime's speaking gate
 *                 until spoken playback drains, then → idle fires
 *                 response_finished)
 *   interrupted → interrupted (→ listening, reason 'interrupted')
 *   error       → blocked
 *   speaking→idle fires 'response_finished' (→ completed, then ambient after
 *   the SophiaOS post-turn cadence)
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useOS, liveVoiceState, type LiveVoiceState } from "../../lib/osStore";
import { liveBridge } from "../../lib/liveCompanionBridge";
import { voiceRuntime } from "../../lib/voiceRuntime";
import { SophiaState } from "@/sofia/engine/SophiaState";
import { VisualDirector } from "@/sofia/engine/VisualDirector";
import { ParticleRenderer } from "@/sofia/engine/ParticleRenderer";
import { STAGE_CY_CENTERED } from "@/sofia/engine/layout";
import type { SophiaEventType, SophiaStateName } from "@/sofia/engine/types";

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

export interface UseVoicePresenceOptions {
  /** Stage geometry: the circular widget passes 0.5 (canvas centre); the
   * full-screen Sophia surface uses SofiaUI's original 0.44 default. */
  stageCyRatio?: number;
  /** Screen-reader announcement strings (defaults = the widget's). */
  announce?: Record<SophiaStateName, string>;
  /** Park the render loop while the canvas is display:none (the always-mounted
   * full-screen surface behind other tabs). The FSM keeps tracking; only
   * frame work stops. */
  parkWhenHidden?: boolean;
}

/** One-shot timers owned by this hook (post-turn cadence, wake choreography).
 *
 *  * The canvas ref is owned by the CALLER and passed in: the hook must not
 *  * return a ref (a returned object containing a ref taints every property
 *  * of the return value for the React-Compiler lint rules). */
export function useVoicePresence(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  opts: UseVoicePresenceOptions = {},
) {
  const fsmRef = useRef<SophiaState | null>(null);
  const directorRef = useRef<VisualDirector | null>(null);
  const rendererRef = useRef<ParticleRenderer | null>(null);
  const rafRef = useRef(0);
  const tPrevRef = useRef(0);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const prevLiveRef = useRef<LiveVoiceState | null>(null);
  const firstRunRef = useRef(true);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  const [displayState, setDisplayState] = useState<SophiaStateName>("ambient");
  const [announce, setAnnounce] = useState<string>(() => (opts.announce ?? STATE_ANNOUNCE).ambient);
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
    // Phase 3 (voice runtime): attach the runtime for this widget's lifetime
    // — spoken replies, metering, reconnection and cleanup are owned there.
    // detach() on unmount is the explicit session cleanup contract.
    voiceRuntime.attach();

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
        setAnnounce((optsRef.current.announce ?? STATE_ANNOUNCE)[s]);
      }
    };
    const unsub = fsm.subscribe((s, _prev, meta) => announceTransition(s, meta));

    // SofiaUI's minimal render loop (SophiaOS.attach): clamp dt, feed the
    // director from the state machine, render. The renderer is created on
    // the first frame so a WebGL2 failure surfaces without touching render.
    tPrevRef.current = performance.now();
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0.0005, (now - tPrevRef.current) / 1000));
      tPrevRef.current = now;
      // Parking: when the caller opts in (always-mounted full-screen surface
      // hidden behind other tabs), skip all frame work while display:none.
      // dt above is already consumed so no time-jump accumulates for the
      // director when the surface becomes visible again.
      if (optsRef.current.parkWhenHidden && canvasRef.current?.offsetParent == null) return;
      if (!rendererRef.current) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        try {
          rendererRef.current = new ParticleRenderer(canvas, {
            stageCyRatio: optsRef.current.stageCyRatio ?? STAGE_CY_CENTERED,
          });
        } catch (err) {
          console.warn("[voice-presence] WebGL2 renderer unavailable:", err);
          setGlFailed(true);
          cancelAnimationFrame(rafRef.current);
          return;
        }
      }
      director.state = fsm.current;
      // Phase 3: REAL amplitude — mic RMS (capture worklet) while listening,
      // playback RMS while speaking; procedural envelopes when absent.
      rendererRef.current.frame(director.frame(dt, voiceRuntime.getLevels()));
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
      // Phase 3: full explicit runtime cleanup on unmount (stops playback,
      // aborts TTS fetches, removes listeners — the bridge/session survive).
      voiceRuntime.detach();
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

  /** Interrupt the current turn through the voice runtime: spoken output is
   *  cut immediately and the existing bridge seam delivers INTERRUPT, which
   *  the server now honors by cancelling the in-flight canonical turn
   *  (Phase 3). Visual feedback arrives via the transport's 'interrupted'
   *  status. */
  const onInterrupt = useCallback(() => {
    voiceRuntime.interrupt();
  }, []);

  /* ------------------------------------- surface-only FSM primitives ------
   * The full-screen Sophia surface drives the SAME machine for its text
   * turns (the transport status mapping above only covers voice turns).
   * The widget never calls these; they exist so both consumers share one
   * machine implementation instead of forking the choreography. */

  /** Feed a normalized provider event to the visual machine (e.g. 'thinking'
   *  when a text turn starts, 'response_finished' when its reply lands). */
  const driveEvent = useCallback((ev: SophiaEventType) => {
    fsmRef.current?.handleVoiceEvent(ev);
  }, []);

  /** Stand the visual machine down to ambient (text-turn post cadence). */
  const standDownVisual = useCallback((reason: string) => {
    fsmRef.current?.standDown(reason);
  }, []);

  /** Test the current visual state (guards the post-turn cadence timer). */
  const isVisualState = useCallback((...names: SophiaStateName[]) => {
    return fsmRef.current?.is(...names) ?? false;
  }, []);

  return {
    driveEvent,
    standDownVisual,
    isVisualState,
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
