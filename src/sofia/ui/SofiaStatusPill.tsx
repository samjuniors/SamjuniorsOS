/**
 * SofiaStatusPill — real-time activity indicator pill for Sophia.
 * Ported/adapted from SofiaUI @ commit 9e88dee: src/ui/SofiaStatusPill.tsx
 * The SofiaUI repository remains independent; one-way reference port.
 *
 * Adaptations for the SamJuniorsOS flow:
 *   - No Gemini Live metrics badge (this surface runs on the destination's
 *     live-voice gateway; there is no Gemini Live connection to report).
 *   - mic-denied state arrives as a prop (the surface derives it from the
 *     permission API + live transport errors, same rule as the widget).
 */

import type { SophiaStateName } from '@/sofia/engine/types';

const STATE_MESSAGES: Record<SophiaStateName, string> = {
  idle: 'Standby · Hold Space to speak',
  ambient: 'Standby · Hold Space to speak',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
  rendering: 'Rendering...',
  focusing: 'Focusing...',
  wakeup: 'Waking up...',
  transforming: 'Transforming...',
  completed: 'Standby · Hold Space to speak',
  blocked: 'Mic Blocked · Click to Allow',
  pause: 'Paused',
  paused: 'Paused',
};

export interface SofiaStatusPillProps {
  state: SophiaStateName;
  micDenied?: boolean;
  onClick?: () => void;
  className?: string;
}

export function SofiaStatusPill({ state, micDenied = false, onClick, className = '' }: SofiaStatusPillProps) {
  const isPaused = state === 'paused' || state === 'pause';
  const text = isPaused
    ? 'Paused'
    : micDenied
      ? 'Mic Blocked · Click to Allow'
      : STATE_MESSAGES[state] || 'Active';

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onClick}
      title={
        isPaused
          ? 'Sofia is paused'
          : micDenied
            ? 'Microphone blocked — click to review permissions'
            : `Sofia is active · ${text}`
      }
      className={`group flex select-none items-center gap-2.5 rounded-full border border-white/[0.12] bg-[#0c1017]/85 px-3.5 py-1.5 shadow-[0_4px_18px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md transition-all duration-300 ${
        onClick
          ? 'cursor-pointer hover:border-white/25 hover:bg-[#0c1017]/95 hover:shadow-[0_4px_22px_rgba(16,185,129,0.15)] active:scale-[0.98]'
          : ''
      } ${className}`}
    >
      {/* Indicator dot */}
      <div className="relative flex size-2.5 items-center justify-center">
        {!isPaused && !micDenied && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/40 opacity-75 duration-1000" />
        )}
        <span
          className={`relative inline-flex size-2 rounded-full transition-all duration-300 ${
            micDenied
              ? 'bg-rose-400 shadow-[0_0_8px_#f43f5e] animate-pulse'
              : isPaused
                ? 'bg-amber-400/80 shadow-[0_0_6px_#fbbf24]'
                : 'bg-emerald-400 shadow-[0_0_8px_#34d399] status-breathe'
          }`}
        />
      </div>

      {/* Sofia Brand Name */}
      <span className="text-[13px] font-semibold tracking-normal text-white">
        Sofia
      </span>

      {/* Subtle vertical separator */}
      <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />

      {/* Real-time State Description (Idle, Listening, Speaking, etc.) */}
      <span className="max-w-[130px] truncate text-[12px] font-normal tracking-wide text-white/70 transition-all duration-200 sm:max-w-none">
        {text}
      </span>
    </div>
  );
}
