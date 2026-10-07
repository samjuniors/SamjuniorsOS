/**
 * VoiceStatusPill — real-time voice-agent state indicator.
 *
 * Ported/adapted from SofiaUI @ commit 9e88dee: src/ui/SofiaStatusPill.tsx.
 * The SofiaUI repository remains independent; one-way reference port.
 *
 * Adaptations for SamJuniorsOS:
 *   - Decoupled from SofiaUI's SophiaOS singleton and Gemini Live metrics
 *     (companion/transport telemetry is out of scope for this port); the pill
 *     is a pure function of the ported state machine + live-voice facts.
 *   - Adds the destination-specific "Voice Off" state (SofiaUI is an
 *     always-on session; SamJuniorsOS live voice is explicitly toggled).
 *   - Status colours follow the destination's existing voice-language
 *     (LiveTranscriptRibbon): cyan listening, amber thinking, emerald
 *     speaking, rose interrupted/blocked — instead of SofiaUI's
 *     emerald-default scheme.
 */

import type { SophiaStateName } from "@/sofia/engine/types";

/** Per-state human text. Keyed by the ported state machine's vocabulary. */
const STATE_MESSAGES: Record<SophiaStateName, string> = {
  idle: "Standby · Hold Space to speak",
  ambient: "Standby · Hold Space to speak",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  rendering: "Rendering…",
  focusing: "Focusing…",
  wakeup: "Waking up…",
  transforming: "Transforming…",
  completed: "Done · Ready",
  blocked: "Needs attention",
  pause: "Paused",
  paused: "Paused",
};

export interface VoiceStatusPillProps {
  /** Current ported-FSM state driving the text. */
  state: SophiaStateName;
  /** Destination live-voice transport enabled flag (explicit toggle model). */
  enabled: boolean;
  /** Microphone permission denied (or mic hard-failed). */
  micDenied: boolean;
  /** True while the transport reports an interrupted turn. */
  interrupted: boolean;
  onClick?: () => void;
  className?: string;
}

/** Dot colour per state, in the destination's voice language. */
function dotFor(state: SophiaStateName, micDenied: boolean, interrupted: boolean): string {
  if (micDenied) return "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse";
  if (interrupted) return "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)]";
  switch (state) {
    case "listening":
      return "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]";
    case "focusing":
    case "wakeup":
      return "bg-cyan-300/80 shadow-[0_0_6px_rgba(103,232,249,0.7)]";
    case "thinking":
      return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]";
    case "speaking":
      return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]";
    case "completed":
      return "bg-emerald-300/80 shadow-[0_0_6px_rgba(110,231,183,0.7)]";
    case "blocked":
      return "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse";
    case "pause":
    case "paused":
      return "bg-amber-400/80 shadow-[0_0_6px_rgba(251,191,36,0.8)]";
    default:
      return "bg-slate-400/70";
  }
}

export function VoiceStatusPill({
  state,
  enabled,
  micDenied,
  interrupted,
  onClick,
  className = "",
}: VoiceStatusPillProps) {
  const isPaused = state === "paused" || state === "pause";
  const isStandby = state === "ambient" || state === "idle" || state === "completed";
  const text = micDenied
    ? "Mic Blocked · Click to Allow"
    : !enabled
      ? "Voice Off · Click to Start"
      : isPaused
        ? "Paused"
        : interrupted
          ? "Interrupted · Listening…"
          : STATE_MESSAGES[state] || "Active";

  const breathe = enabled && !isPaused && !micDenied && !isStandby;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onClick}
      title={onClick ? `Voice presence · ${text}` : text}
      className={`flex w-full select-none items-center gap-2 rounded-full border border-white/[0.12] bg-[#0c1017]/85 px-3 py-1.5 shadow-[0_4px_18px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md transition-all duration-300 ${
        onClick ? "cursor-pointer hover:border-white/25 hover:bg-[#0c1017]/95 active:scale-[0.98]" : ""
      } ${className}`}
    >
      <span className="relative flex size-2.5 shrink-0 items-center justify-center">
        <span className={`relative inline-flex size-2 rounded-full transition-all duration-300 ${dotFor(state, micDenied, interrupted)} ${breathe ? "voice-status-breathe" : ""}`} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-wide text-white/85">
        {text}
      </span>
    </div>
  );
}
