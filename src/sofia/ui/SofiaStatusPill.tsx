/**
 * SofiaStatusPill — Real-time activity indicator pill for Sofia.
 * Displays Sofia's active state (Idle, Listening, Thinking, Speaking, etc.)
 * alongside the integrated Gemini Live real-time status and diagnostics.
 */

import { useEffect, useState } from 'react';
import type { SophiaStateName } from '../sophia/types';
import type { SophiaOS } from '../sophia/SophiaOS';
import type { LiveConnectionMetrics } from '../sophia/voice/GeminiLiveProvider';

const STATE_MESSAGES: Record<SophiaStateName, string> = {
  idle: 'Standby · Say “Hey Sofia”',
  ambient: 'Standby · Say “Hey Sofia”',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
  rendering: 'Rendering...',
  focusing: 'Focusing...',
  wakeup: 'Waking up...',
  transforming: 'Transforming...',
  completed: 'Standby · Say “Hey Sofia”',
  blocked: 'Mic Blocked · Click to Allow',
  pause: 'Paused',
  paused: 'Paused',
};

export interface SofiaStatusPillProps {
  state: SophiaStateName;
  paused?: boolean;
  onClick?: () => void;
  os?: SophiaOS;
  onDiagnostics?: () => void;
  className?: string;
}

export function SofiaStatusPill({
  state,
  paused = false,
  onClick,
  os,
  onDiagnostics,
  className = '',
}: SofiaStatusPillProps) {
  const isPaused = paused || state === 'paused' || state === 'pause';
  const isMicDenied = os?.isMicDisabledError || os?.audio?.micStatus === 'denied';
  const text = isPaused
    ? 'Paused'
    : isMicDenied
      ? 'Mic Blocked · Click to Allow'
      : STATE_MESSAGES[state] || 'Active';

  const [metrics, setMetrics] = useState<LiveConnectionMetrics | undefined>(() =>
    os?.getGeminiLiveMetrics()
  );

  useEffect(() => {
    if (!os) return;
    const interval = setInterval(() => {
      setMetrics(os.getGeminiLiveMetrics());
    }, 800);
    return () => clearInterval(interval);
  }, [os]);

  const isConnected = metrics?.isConnected ?? false;
  const latency = metrics?.latencyMs ?? 0;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onClick}
      title={
        isPaused
          ? 'Sofia is paused · Click to resume'
          : `Sofia is active · ${text} · Click to pause`
      }
      className={`group flex select-none items-center gap-2.5 rounded-full border border-white/[0.12] bg-[#0c1017]/85 px-3.5 py-1.5 shadow-[0_4px_18px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md transition-all duration-300 ${
        onClick
          ? 'cursor-pointer hover:border-white/25 hover:bg-[#0c1017]/95 hover:shadow-[0_4px_22px_rgba(16,185,129,0.15)] active:scale-[0.98]'
          : ''
      } ${className}`}
    >
      {/* Indicator dot */}
      <div className="relative flex size-2.5 items-center justify-center">
        {!isPaused && !isMicDenied && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/40 opacity-75 duration-1000" />
        )}
        <span
          className={`relative inline-flex size-2 rounded-full transition-all duration-300 ${
            isMicDenied
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

      {/* Integrated Gemini Live status badge with quick Diagnostics trigger */}
      {(os || onDiagnostics) && (
        <>
          <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDiagnostics?.();
            }}
            title={
              isConnected
                ? `Gemini Live connected (${latency}ms). Click for Diagnostics.`
                : 'Gemini Live standby. Click for Diagnostics.'
            }
            className="group/gemini flex items-center gap-1.5 rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-sky-200 transition-all duration-200 hover:border-sky-400/50 hover:bg-sky-500/20 hover:text-white"
          >
            <span
              className={`block size-1.5 rounded-full transition-all duration-300 ${
                isConnected
                  ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                  : 'bg-sky-400/60'
              }`}
            />
            <span className="font-medium">Gemini Live</span>
            {isConnected && latency > 0 && (
              <span className="text-[8.5px] font-bold text-emerald-300">{latency}ms</span>
            )}
          </button>
        </>
      )}
    </div>
  );
}
