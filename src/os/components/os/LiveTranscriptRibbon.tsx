import React, { useEffect, useRef } from "react";
import { Mic, MicOff, AlertCircle, Bot, Sparkles, X, Activity } from "lucide-react";
import { useOS, liveVoiceState, os } from "../../lib/osStore";
import { liveBridge } from "../../lib/liveCompanionBridge";
import { osSound } from "../../lib/osAudio";

/**
 * ============================================================================
 * LIVE TRANSCRIPT RIBBON (PHASE 4C-C)
 * ============================================================================
 * Non-intrusive, contextual floating ribbon presenting real-time live interaction
 * status and streaming transcripts.
 * 
 * Rules:
 * - Calm when IDLE (slender status pill or collapsed).
 * - Noticeable when LISTENING (pulsing cyan waveform/ring, displaying interim text).
 * - Distinguishes INTERIM (ephemeral, italicized, active) from FINAL (committed user turn).
 * - Displays Sophia's thinking state and concise response snippet.
 * - Zero chain-of-thought or internal agent deliberations.
 * - Respects prefers-reduced-motion.
 */
export default function LiveTranscriptRibbon({
  className = "",
}: {
  className?: string;
}) {
  const live = useOS(liveVoiceState);
  const pttHeldRef = useRef(false);

  // Keyboard PTT Hook: Holding Spacebar (when not typing in an input/textarea) activates PTT
  useEffect(() => {
    if (!live.enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isInput) return;

      if (e.code === "Space" && !e.repeat && !pttHeldRef.current) {
        e.preventDefault();
        pttHeldRef.current = true;
        osSound.click();
        liveBridge.startPtt();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && pttHeldRef.current) {
        e.preventDefault();
        pttHeldRef.current = false;
        osSound.click();
        liveBridge.stopPtt();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [live.enabled]);

  if (!live.enabled) return null;

  const isListening = live.status === "listening";
  const isThinking = live.status === "thinking" || live.status === "transcribing";
  const isSpeaking = live.status === "speaking";
  const isInterrupted = live.status === "interrupted";
  const hasError = !!live.error || live.status === "error";

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

  const statusLabel =
    isListening
      ? "LISTENING"
      : isThinking
      ? "THINKING"
      : isSpeaking
      ? "SOPHIA SPEAKING"
      : isInterrupted
      ? "INTERRUPTED"
      : hasError
      ? "MIC / STT ERROR"
      : "LIVE AUDIO READY";

  const statusDotColor =
    isListening
      ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)] animate-pulse"
      : isThinking
      ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] animate-ping"
      : isSpeaking
      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse"
      : isInterrupted
      ? "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)]"
      : hasError
      ? "bg-rose-500"
      : "bg-cyan-300/60";

  return (
    <aside
      aria-label="Live Voice Transcript Ribbon"
      className={`pointer-events-auto fixed bottom-6 left-1/2 z-40 -translate-x-1/2 transition-all duration-300 ${className}`}
      style={{ animation: "os-in 240ms cubic-bezier(0.16,1,0.3,1)" }}
    >
      <div
        className={`flex max-w-[min(620px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border backdrop-blur-2xl transition-all duration-300 ${
          isListening
            ? "border-cyan-400/40 bg-[#071324]/95 shadow-[0_12px_40px_rgba(34,211,238,0.25)]"
            : isThinking
            ? "border-amber-400/30 bg-[#120f08]/95 shadow-[0_12px_40px_rgba(245,158,11,0.2)]"
            : hasError
            ? "border-rose-500/30 bg-[#140808]/95 shadow-[0_12px_40px_rgba(244,63,94,0.2)]"
            : "border-white/10 bg-[#08101e]/90 shadow-[0_16px_40px_rgba(0,0,0,0.7)]"
        }`}
      >
        {/* Top bar with status and PTT button */}
        <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${statusDotColor}`} />
            <span className="font-mono text-[9.5px] font-semibold tracking-[0.16em] text-slate-300">
              {statusLabel}
            </span>
            <span className="text-[9px] text-slate-500">· Hold Space or Mic to speak</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Direct PTT button (touch or mouse press-and-hold) */}
            <button
              onPointerDown={handlePttDown}
              onPointerUp={handlePttUp}
              onPointerCancel={handlePttUp}
              title="Hold to Speak (Push-to-Talk)"
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[10.5px] font-medium tracking-wide transition active:scale-95 ${
                isListening
                  ? "border-cyan-300 bg-cyan-400 text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.7)]"
                  : "border-white/12 bg-white/5 text-cyan-200 hover:border-cyan-300/40 hover:bg-white/10"
              }`}
            >
              <Mic size={12} className={isListening ? "animate-pulse" : ""} />
              <span>{isListening ? "Release to Send" : "Hold to Talk"}</span>
            </button>

            <button
              onClick={() => liveBridge.toggleVoice(false)}
              className="rounded-lg p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
              title="Close Voice Ribbon"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Live transcript presentation area */}
        <div className="flex flex-col gap-1.5 p-3.5 text-[12px] leading-relaxed">
          {/* Interim text during active speaking */}
          {isListening && live.interimText && (
            <div className="flex items-start gap-2 text-cyan-100">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 animate-ping" />
              <span className="italic">
                “{live.interimText}”
              </span>
            </div>
          )}

          {/* Listening idle prompt */}
          {isListening && !live.interimText && (
            <div className="text-[11.5px] text-slate-400 italic">
              Listening to founder microphone... speak now.
            </div>
          )}

          {/* Final transcript (committed turn) */}
          {!isListening && live.finalText && (
            <div className="flex items-start gap-2 text-slate-200">
              <span className="font-semibold text-cyan-300">You:</span>
              <span>{live.finalText}</span>
            </div>
          )}

          {/* Thinking animation state */}
          {isThinking && (
            <div className="flex items-center gap-2 text-[11.5px] text-amber-200/90">
              <Sparkles size={13} className="animate-spin text-amber-300" />
              <span>Sophia is reasoning and checking governance boundaries...</span>
            </div>
          )}

          {/* Latest assistant reply snippet */}
          {live.lastReply && !isListening && !isThinking && (
            <div className="mt-1 flex items-start gap-2 border-t border-white/6 pt-1.5 text-slate-300">
              <Bot size={13} className="mt-0.5 shrink-0 text-cyan-300" />
              <span className="leading-snug">{live.lastReply}</span>
            </div>
          )}

          {/* Error notification */}
          {live.error && (
            <div className="flex items-center gap-1.5 text-[11px] text-rose-300">
              <AlertCircle size={13} className="shrink-0 text-rose-400" />
              <span>{live.error}</span>
            </div>
          )}

          {/* Default standby text */}
          {!isListening && !isThinking && !live.finalText && !live.lastReply && !live.error && (
            <div className="text-[11.5px] text-slate-400">
              Ready for voice commands. Hold the <kbd className="rounded border border-white/10 bg-white/5 px-1 font-mono text-[9px]">Space</kbd> bar or click &amp; hold <span className="text-cyan-200">Hold to Talk</span>.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
