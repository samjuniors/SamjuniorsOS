/**
 * HUD — the little chrome that frames the substance.
 * Ported/adapted from SofiaUI @ commit 9e88dee: src/ui/Hud.tsx
 * The SofiaUI repository remains independent; one-way reference port.
 *
 * Adaptations for the SamJuniorsOS flow:
 *   - Identity's "latest line" arrives as a PROP (the surface computes it
 *     from live transcripts + chat turns) instead of subscribing to
 *     SofiaUI's controlLayer turn events (not ported).
 *   - The Dock carries the chat launcher and the session mic toggle only.
 *     SofiaUI's screen-vision and browser buttons are omitted: their tools
 *     (getDisplayMedia bridge, /api/sophia/browse proxy) are not part of
 *     this port's surface.
 *   - The mic button's labels/aria follow the destination's live-voice
 *     session semantics (toggleVoice + Hold-Space PTT), matching the
 *     voice-presence widget's exact strings for continuity.
 */

import { Mic, MicOff, MessageSquare } from 'lucide-react';
import type { RefObject } from 'react';
import type { StageLayout } from '@/sofia/engine/layout';
import type { SophiaStateName } from '@/sofia/engine/types';

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

export function Identity({
  layout,
  state,
  line,
}: {
  layout: StageLayout;
  state: SophiaStateName;
  line: string;
}) {
  const active = state !== 'ambient';
  const top = layout.cy + layout.ringR + Math.max(10, Math.min(16, layout.R * 0.08));
  return (
    <section
      aria-label="Sophia"
      className="identity-hud pointer-events-none absolute left-0 right-0 z-10 select-none px-6 text-center transition-all duration-500 ease-out"
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

export function Dock({
  state,
  micRef,
  onMic,
  onChat,
  chatOpen,
  sessionOn,
  micDenied,
  streaming,
}: {
  state: SophiaStateName;
  micRef: RefObject<HTMLButtonElement | null>;
  onMic: () => void;
  onChat: () => void;
  chatOpen: boolean;
  sessionOn: boolean;
  micDenied: boolean;
  streaming: boolean;
}) {
  const on = state !== 'ambient' && state !== 'paused' && state !== 'idle' && state !== 'completed';
  const micLabel = micDenied
    ? 'Microphone blocked — click for help'
    : sessionOn
      ? 'Voice session active — hold Space to speak, click to turn off'
      : 'Start live voice session';
  return (
    <div className="dock-cluster absolute bottom-[44px] right-7 z-10 flex items-center gap-[18px] transition-all duration-500 sm:bottom-[52px] sm:right-11">
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

      {/* Session Microphone Button — the live-voice toggle (Hold Space PTT) */}
      <button
        ref={micRef}
        type="button"
        aria-label={micLabel}
        aria-pressed={sessionOn}
        title={micLabel}
        onClick={onMic}
        className={`group relative grid size-[48px] place-items-center rounded-2xl border transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 active:scale-95 ${
          micDenied
            ? 'border-rose-400/40 bg-rose-500/[0.12] text-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.25)] hover:border-rose-400/60 hover:bg-rose-500/[0.2] hover:text-white'
            : sessionOn
              ? 'border-sky-400/40 bg-sky-500/[0.16] text-sky-100 shadow-[0_0_20px_rgba(56,189,248,0.38),inset_0_1px_0_rgba(255,255,255,0.22)] hover:border-sky-400/70 hover:bg-sky-500/[0.26] hover:text-white'
              : 'border-white/[0.12] bg-white/[0.04] text-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-sky-400/40 hover:bg-white/[0.10] hover:text-white'
        }`}
      >
        {/* Live speaking/listening indicator halo dot when active and running */}
        {sessionOn && (on || streaming) && (
          <span className="absolute -right-0.5 -top-0.5 block size-[8px] rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]" />
        )}

        <div className="relative z-10 transition-transform duration-300 group-hover:scale-110">
          {micDenied ? (
            <MicOff
              size={22}
              strokeWidth={2.2}
              className="text-rose-200 transition-all duration-200 group-hover:scale-105 group-hover:text-white"
              aria-hidden="true"
            />
          ) : (
            <Mic
              size={22}
              strokeWidth={2.2}
              className={
                sessionOn
                  ? 'text-sky-200 transition-all duration-200 group-hover:scale-105 group-hover:text-white'
                  : 'text-white/70 transition-all duration-200 group-hover:scale-105 group-hover:text-white'
              }
              aria-hidden="true"
            />
          )}
        </div>
      </button>
    </div>
  );
}
