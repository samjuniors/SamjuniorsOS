/**
 * VoicePresence — the SofiaUI voice-agent presence, adapted into the
 * SamJuniorsOS shell.
 *
 * Ported/adapted from SofiaUI @ commit 9e88dee:
 *   - src/App.tsx (stage composition, canvas, WebGL-failure fallback,
 *     sr-only live region, keyboard escape, isTyping guard)
 *   - src/ui/Hud.tsx Dock mic button (48px, aria-pressed, halo dot)
 * The SofiaUI repository remains independent; one-way reference port.
 *
 * Adaptations for the destination shell (each deliberate, per the approved
 * migration plan):
 *   - This is a floating WIDGET (bottom-left), not a full-viewport experience.
 *     It mounts only on the non-SOFIA tabs, exactly like the existing
 *     ChatPanel and LiveTranscriptRibbon chrome; the SOFIA tab keeps its own
 *     full-screen voice surface, and nothing existing was removed.
 *   - SofiaUI's orb-click action is pause/resume of an always-on session;
 *     the destination's live voice is a push-to-talk session, so the orb
 *     click (and the stop button + Escape) performs INTERRUPT through the
 *     existing live-voice seam instead.
 *   - SofiaUI's Space/M/P keyboard layer is NOT ported: the destination's
 *     LiveTranscriptRibbon already owns Space (push-to-talk). Only Escape
 *     (interrupt) is added, guarded against typing and open dialogs, so no
 *     two global keyboard systems compete.
 *   - Amplitude: no audio engine ships with this port; the orb moves on
 *     SofiaUI's designed procedural envelopes (see useVoicePresence).
 */

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { os } from "../../lib/osStore";
import { useVoicePresence } from "./useVoicePresence";
import { VoiceStatusPill } from "./VoiceStatusPill";
import { VoicePermissionModal, probeMicPermission } from "./VoicePermissionModal";
import "./voice-presence.css";

function isTyping(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
}

export default function VoicePresence() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const v = useVoicePresence(canvasRef);
  const [permissionOpen, setPermissionOpen] = useState(false);

  /* Escape interrupts the current turn (guarded like SofiaUI's escape
     handler: never while typing, never while a dialog owns the screen). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || permissionOpen) return;
      if (isTyping()) return;
      if (v.interruptible) {
        e.preventDefault();
        v.onInterrupt();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [permissionOpen, v.interruptible, v.onInterrupt]);

  const handleMic = () => {
    if (v.micDenied) {
      setPermissionOpen(true);
      return;
    }
    v.onMicToggle();
  };

  const handleRetry = async () => {
    const result = await probeMicPermission();
    if (result === "granted") {
      // Drop the stale transport error so the pill stops reporting a block.
      os.setLiveVoice({ error: null });
    }
    return result;
  };

  const micLabel = v.micDenied
    ? "Microphone blocked — click for help"
    : v.live.enabled
      ? "Voice session active — hold Space to speak, click to turn off"
      : "Start live voice session";

  return (
    <div
      role="complementary"
      aria-label="Voice presence"
      className={`voice-presence fixed bottom-5 left-5 z-40 flex w-[148px] flex-col items-center gap-2 sm:bottom-6 sm:left-6 sm:w-[168px] ${
        v.flash ? "voice-flash" : ""
      } ${v.state === "paused" || v.state === "pause" ? "voice-paused" : ""}`}
      style={{ animation: "os-in 240ms cubic-bezier(0.16,1,0.3,1)" }}
    >
      {/* The stage: WebGL2 orb (SofiaUI ParticleRenderer), CSS sphere when
          WebGL2 is unavailable (SofiaUI's renderer-failed fallback). */}
      <div className="voice-stage relative h-[148px] w-[148px] overflow-hidden rounded-full bg-[#04060f] shadow-[0_10px_40px_rgba(0,0,0,0.55)] sm:h-[168px] sm:w-[168px]">
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden="true" />
        {v.glFailed && <div className="voice-orb-fallback" aria-hidden="true" />}
        {/* Orb as a control: interrupt the turn (adapted from SofiaUI's
            substance-click pause — see file header). */}
        <button
          type="button"
          aria-label={v.interruptible ? "Interrupt Sophia" : "Voice presence"}
          title={v.interruptible ? "Interrupt Sophia (Escape)" : "Voice presence"}
          onClick={v.onInterrupt}
          disabled={!v.interruptible}
          className="absolute inset-0 z-[2] rounded-full bg-transparent outline-none transition focus-visible:ring-1 focus-visible:ring-sky-300/40 disabled:cursor-default"
        />
      </div>

      <VoiceStatusPill
        state={v.state}
        enabled={v.live.enabled}
        micDenied={v.micDenied}
        interrupted={v.live.status === "interrupted"}
        onClick={handleMic}
      />

      {/* Controls: mic toggle (SofiaUI dock mic, 48px) + interrupt (stop). */}
      <div className="voice-controls flex items-center gap-2">
        <button
          type="button"
          aria-label={micLabel}
          title={micLabel}
          aria-pressed={v.live.enabled}
          onClick={handleMic}
          className={`group relative grid size-[48px] place-items-center rounded-2xl border transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 active:scale-95 ${
            v.micDenied
              ? "border-rose-400/40 bg-rose-500/[0.12] text-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.25)]"
              : v.live.enabled
                ? "border-sky-400/40 bg-sky-500/[0.16] text-sky-100 shadow-[0_0_20px_rgba(56,189,248,0.38),inset_0_1px_0_rgba(255,255,255,0.22)] hover:border-sky-400/70 hover:bg-sky-500/[0.26] hover:text-white"
                : "border-white/[0.12] bg-white/[0.04] text-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-sky-400/40 hover:bg-white/[0.10] hover:text-white"
          }`}
        >
          {v.live.enabled && !v.micDenied && (
            <span className="absolute -right-0.5 -top-0.5 block size-[8px] rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]" />
          )}
          <span className="relative z-10 transition-transform duration-300 group-hover:scale-110">
            {v.micDenied || !v.live.enabled ? (
              <MicOff size={22} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <Mic size={22} strokeWidth={2.2} aria-hidden="true" />
            )}
          </span>
        </button>

        <button
          type="button"
          aria-label="Interrupt Sophia (stop speaking)"
          title="Interrupt Sophia (Escape)"
          onClick={v.onInterrupt}
          disabled={!v.interruptible}
          className={`grid size-11 place-items-center rounded-2xl border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/40 ${
            v.interruptible
              ? "border-rose-400/45 bg-rose-500/[0.14] text-rose-100 shadow-[0_0_16px_rgba(244,63,94,0.3)] hover:border-rose-400/70 hover:bg-rose-500/[0.24] active:scale-95"
              : "pointer-events-none border-white/[0.08] bg-white/[0.03] text-white/25"
          }`}
        >
          <Square size={16} strokeWidth={2.4} aria-hidden="true" fill="currentColor" />
        </button>
      </div>

      {/* Screen-reader state channel (ported from SofiaUI App.tsx). */}
      <p className="sr-only" role="status" aria-live="polite">
        {v.announce}
        {v.live.error ? ` ${v.live.error}` : ""}
      </p>

      <VoicePermissionModal
        open={permissionOpen}
        onRetry={handleRetry}
        onGranted={() => {
          setPermissionOpen(false);
          v.onMicToggle(true);
        }}
        onClose={() => setPermissionOpen(false)}
      />
    </div>
  );
}
