'use client';

/**
 * ui/TheatrePanel.tsx — Phase 1: Theatre (World Monitor).
 *
 * Displays the ambient World Monitor: dot-matrix Fibonacci globe over
 * real-time Hacker News wire. Standalone and self-contained with no
 * fictional agent simulations or un-governed tool execution.
 */

import { Earth, Sparkles, X } from 'lucide-react';
import { WorldPanel } from './WorldPanel';

export function TheatrePanel({ onClose }: { onClose: () => void }) {
  return (
    <section
      aria-label="Theatre panel"
      className="fixed bottom-[98px] right-4 z-30 flex max-h-[76vh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#070b16]/95 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:right-11 sm:w-[420px]"
    >
      <header className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <span className="grid size-7 place-items-center rounded-lg bg-sky-500/15 text-sky-300">
          <Sparkles size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold text-white">Theatre</h2>
          <p className="truncate text-[10px] text-white/40">World Monitor</p>
        </div>
        <button
          type="button"
          aria-label="Close Theatre panel"
          onClick={onClose}
          className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={14} />
        </button>
      </header>

      <div className="flex flex-col gap-2 overflow-y-auto p-2.5">
        <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-sky-200">
          <Earth size={13} className="text-sky-300" />
          <span>World Monitor</span>
        </div>

        <div role="region" aria-label="World Monitor">
          <WorldPanel />
        </div>
      </div>
    </section>
  );
}
