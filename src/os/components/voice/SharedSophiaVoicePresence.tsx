/**
 * OS desktop controls the SAME SofiaOS singleton as the full-screen Sofia tab.
 * Do not create SophiaLiveClient, a second getUserMedia stream, or another
 * WebSocket: doing so reintroduced push-to-talk and superseded Sofia's session.
 *
 * Implements Gate G6.5: Panel fallback when voice is unavailable, with honest presence states.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Square, AlertCircle, MessageSquare, X } from "lucide-react";
import { getSophiaOS, type OSStatus } from "@/sofia/sophia/SophiaOS";
import type { SophiaStateName } from "@/sofia/sophia/types";
import { ParticleRenderer } from "@/sofia/engine/ParticleRenderer";
import { VisualDirector } from "@/sofia/engine/VisualDirector";
import { STAGE_CY_CENTERED } from "@/sofia/engine/layout";
import { resolvePresenceState } from "@/os/lib/presence";
import { os, useOS } from "@/os/lib/osStore";
import { updateBriefingSettings } from "@/os/lib/runtime";
import { formatUserError } from "@/os/lib/errorFormat";

export default function SharedSophiaVoicePresence() {
  const sofia = useMemo(() => getSophiaOS(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<SophiaStateName>(() => sofia.state.current);
  const [status, setStatus] = useState<OSStatus>(() => sofia.status);
  const [micDenied, setMicDenied] = useState(() => sofia.audio.micStatus === "denied");
  const [error, setError] = useState<string | null>(null);
  const [rendererUnavailable, setRendererUnavailable] = useState(false);
  const [starting, setStarting] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const greeting = useOS((s) => s.greeting);
  const greetingDismissed = useOS((s) => s.greetingDismissed);
  const briefing = useOS((s) => s.briefing);
  const briefingDismissed = useOS((s) => s.briefingDismissed);
  const briefingEnabled = useOS((s) => s.briefingEnabled);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = sofia.state.subscribe((next) => setState(next));
    const onStatus = (event: Event) => setStatus((event as CustomEvent<OSStatus>).detail);
    const onMicStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ status: string; err?: string }>).detail;
      setMicDenied(detail.status === "denied");
      if (detail.err) {
        const formatted = formatUserError(detail.err, {
          whatHappened: "Microphone permission was denied or device is unavailable.",
          whatToDo: "Enable microphone in browser settings, or use the text panel below.",
        });
        setError(`${formatted.whatHappened} ${formatted.whatToDo}`);
      }
    };
    const onUnsupported = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; action?: string }>).detail;
      if (detail) {
        const formatted = formatUserError(detail.message, {
          whatHappened: detail.message || "Voice capability is unsupported in this browser environment.",
          whatToDo: detail.action || "Use the text chat panel below.",
        });
        setError(`${formatted.whatHappened} ${formatted.whatToDo}`);
      }
    };
    sofia.addEventListener("status", onStatus);
    sofia.addEventListener("mic-status", onMicStatus);
    sofia.addEventListener("speech-unsupported", onUnsupported);
    return () => {
      unsubscribe();
      sofia.removeEventListener("status", onStatus);
      sofia.removeEventListener("mic-status", onMicStatus);
      sofia.removeEventListener("speech-unsupported", onUnsupported);
    };
  }, [sofia]);

  // Separate VISUAL renderer, but no separate audio or conversation runtime.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: ParticleRenderer;
    try {
      renderer = new ParticleRenderer(canvas, { stageCyRatio: STAGE_CY_CENTERED });
    } catch (err) {
      console.warn("[shared-sofia-voice] Visual renderer unavailable", err);
      setRendererUnavailable(true); // CSS fallback; voice still works.
      return;
    }
    const director = new VisualDirector();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotion = () => director.setReduced(motion.matches);
    applyMotion();
    motion.addEventListener("change", applyMotion);
    let frameId = 0;
    let previous = performance.now();
    const frame = (now: number) => {
      frameId = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0.0005, (now - previous) / 1000));
      previous = now;
      director.state = sofia.state.current;
      renderer.frame(director.frame(dt, {
        mic: sofia.audio.micLevel,
        play: sofia.audio.playbackLevel,
      }));
    };
    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      motion.removeEventListener("change", applyMotion);
      renderer.dispose();
    };
  }, [sofia]);

  const live = status === "live";
  const connecting = status === "connecting" || starting;
  const interruptible = state === "speaking" || state === "thinking";

  const presence = useMemo(() => {
    return resolvePresenceState({
      isOnline,
      status,
      state,
      micDenied,
      interrupted: Boolean((sofia as any)?.audio?.isInterrupted),
    });
  }, [isOnline, status, state, micDenied, sofia]);

  const toggleVoice = useCallback(async () => {
    if (sofia.status === "live") {
      sofia.deactivate("os-desktop-voice-off");
      setError(null);
      return;
    }
    if (starting || sofia.status === "connecting") return;
    if (!isOnline) {
      setError("Network offline. Voice session requires internet connectivity. Text chat fallback is available.");
      os.openChatPanel("sophia");
      return;
    }
    if (sofia.audio.micStatus === "denied") {
      setError("Microphone permission denied. Allow microphone access in browser settings, or use the text chat panel below.");
      return;
    }
    setError(null);
    setStarting(true);
    try {
      // User gesture unlocks audio and starts native hands-free Live session.
      await sofia.enterSession("mic-button");
    } catch (err) {
      const formatted = formatUserError(err, {
        whatHappened: "Could not start hands-free voice session.",
        whatToDo: "Allow microphone access in browser settings, or use the text chat panel below.",
      });
      setError(`${formatted.whatHappened} ${formatted.whatToDo}`);
    } finally {
      setStarting(false);
    }
  }, [sofia, starting, isOnline]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !interruptible) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLElement && el.isContentEditable)) return;
      event.preventDefault();
      sofia.interrupt();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [interruptible, sofia]);

  const openFallback = useCallback(() => {
    os.openChatPanel("sophia");
  }, []);

  return (
    <section aria-label="Sofia live voice" className="fixed bottom-5 left-5 z-40 flex w-auto flex-col items-start gap-2 text-slate-100">
      {/* Gate G6.8: Proactive Briefing Card */}
      {briefing && !briefingDismissed && briefingEnabled && (
        <aside
          role="region"
          aria-label="Sophia executive proactive briefing"
          data-testid="sofia-briefing-card"
          className="relative w-[320px] mb-1 rounded-2xl border border-cyan-400/30 bg-[#070e1c]/95 p-3.5 text-xs text-slate-200 shadow-[0_16px_40px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl"
        >
          <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
              <span className="font-semibold tracking-wide text-cyan-200 uppercase text-[10px]">
                Proactive Briefing {briefing.sinceText ? `· ${briefing.sinceText}` : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => os.dismissBriefing()}
              data-testid="sofia-briefing-dismiss-btn"
              aria-label="Dismiss briefing"
              title="Dismiss briefing"
              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-1"
            >
              <X size={13} />
            </button>
          </div>

          <p className="leading-relaxed text-slate-200" data-testid="sofia-briefing-text">
            {briefing.spokenText}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-1">
            {briefing.pendingApprovalCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  os.dismissBriefing();
                  os.openChatPanel('sophia');
                }}
                data-testid="sofia-briefing-action-approvals"
                className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/20"
              >
                Review Approvals ({briefing.pendingApprovalCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                os.dismissBriefing();
                os.setBriefingEnabled(false);
                void updateBriefingSettings({ enabled: false });
              }}
              data-testid="sofia-briefing-turn-off-btn"
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white"
            >
              Turn off briefings
            </button>
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-1.5 text-[9px] text-slate-400" data-testid="sofia-briefing-sources">
            <span>Sources: {briefing.sources.join(', ')}</span>
            <span className="font-mono text-cyan-300/80">{briefing.latencyMs}ms</span>
          </div>
        </aside>
      )}

      {/* Gate G6.6: Honest Greeting Bubble on Open */}
      {greeting && !greetingDismissed && (
        <aside
          role="region"
          aria-label="Sophia executive greeting"
          data-testid="sofia-greeting-bubble"
          className="relative w-[300px] mb-1 rounded-2xl border border-cyan-400/30 bg-[#070e1c]/95 p-3.5 text-xs text-slate-200 shadow-[0_16px_40px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl"
        >
          <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
              <span className="font-semibold tracking-wide text-cyan-200 uppercase text-[10px]">
                Sophia Vance · COO
              </span>
            </div>
            <button
              type="button"
              onClick={() => os.dismissGreeting()}
              data-testid="sofia-greeting-dismiss-btn"
              aria-label="Dismiss greeting"
              title="Dismiss greeting"
              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X size={13} />
            </button>
          </div>

          <p className="leading-relaxed text-slate-200" data-testid="sofia-greeting-text">
            {greeting.text.replace(/^\[Sophia Vance • Chief Operating Officer\]\n/, '')}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-1">
            {greeting.stateSummary.pendingApprovalsCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  os.dismissGreeting();
                  os.openChatPanel('sophia');
                }}
                data-testid="sofia-greeting-action-approvals"
                className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-1"
              >
                Review Approvals ({greeting.stateSummary.pendingApprovalsCount})
              </button>
            )}
            {greeting.stateSummary.openAlertsCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  os.dismissGreeting();
                  os.openChatPanel('sophia');
                }}
                data-testid="sofia-greeting-action-attention"
                className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/20 focus-visible:outline-2 focus-visible:outline-rose-400 focus-visible:outline-offset-1"
              >
                View Alerts ({greeting.stateSummary.openAlertsCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                os.dismissGreeting();
                os.openChatPanel('sophia');
              }}
              data-testid="sofia-greeting-action-chat"
              className="rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
            >
              Open Chat
            </button>
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-1.5 text-[9px] text-slate-400">
            <span>Real state grounded</span>
            <span className="font-mono text-cyan-300/80">{greeting.latencyMs}ms</span>
          </div>
        </aside>
      )}
      <div className="relative h-[168px] w-[168px] overflow-hidden rounded-full bg-[#04060f] shadow-[0_10px_40px_rgba(0,0,0,0.55)]">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
        {rendererUnavailable && <div className="absolute inset-5 rounded-full border border-cyan-400/30 bg-cyan-400/10 shadow-[0_0_45px_rgba(56,189,248,0.2)]" aria-hidden="true" />}
        <button type="button" aria-label={interruptible ? "Interrupt Sofia" : "Sofia voice presence"}
          disabled={!interruptible} onClick={() => sofia.interrupt()}
          className="absolute inset-0 rounded-full focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:cursor-default" />
      </div>

      <div
        role="status"
        aria-live="polite"
        data-testid="presence-status-badge"
        data-presence-state={presence.state}
        className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide transition-colors ${presence.badgeClass}`}
        aria-label={presence.ariaLabel}
      >
        {presence.label}
      </div>

      {/* Prominent panel fallback action when voice is unavailable or offline */}
      {!presence.isVoiceAvailable && (
        <button
          type="button"
          onClick={openFallback}
          data-testid="presence-panel-fallback-btn"
          aria-label="Open text chat panel fallback"
          title="Open text chat with Sophia"
          className="flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-500/20 px-3.5 py-1.5 text-[11px] font-semibold text-cyan-100 shadow-[0_0_15px_rgba(56,189,248,0.25)] transition hover:bg-cyan-500/30 active:scale-95 focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-1"
        >
          <MessageSquare size={13} className="text-cyan-300" />
          <span>Type to Sophia</span>
        </button>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void toggleVoice()} disabled={connecting || (!isOnline && !live)}
          aria-label={live ? "Stop hands-free conversation" : "Start hands-free conversation"}
          aria-pressed={live}
          title={!isOnline ? "Voice unavailable while offline — click Type to Sophia" : live ? "Stop Sofia" : "Talk naturally with Sophia"}
          className="grid size-12 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-500/15 text-cyan-100 transition hover:bg-cyan-500/25 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-2">
          {live ? <Mic size={22} /> : <MicOff size={22} />}
        </button>
        <button type="button" disabled={!interruptible} onClick={() => sofia.interrupt()}
          aria-label="Interrupt Sofia speaking" title="Interrupt (Escape)"
          className="grid size-11 place-items-center rounded-2xl border border-rose-400/20 bg-rose-500/10 text-rose-200 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-rose-400 focus-visible:outline-offset-2">
          <Square size={16} fill="currentColor" />
        </button>
      </div>

      {error && <p role="alert" className="max-w-[260px] rounded-lg border border-rose-400/30 bg-[#160b11]/95 p-2 text-xs text-rose-100">
        <AlertCircle size={14} className="mr-1 inline" />{error}
      </p>}
    </section>
  );
}
