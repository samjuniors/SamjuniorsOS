'use client';

/**
 * ui/ViewRail.tsx — Phase 1: view switcher rail.
 *
 * Slim icon rail pinned to the left edge: Sofia (immersive holographic view)
 * or Theatre (World Monitor). One click flips the view.
 */

import { LayoutDashboard, Orbit, Sparkles } from 'lucide-react';

export type AppView = 'sofia' | 'theatre' | 'dashboard';

export function ViewRail({ view, onChange }: { view: AppView; onChange: (v: AppView) => void }) {
  const btn = (active: boolean) =>
    `rounded-xl p-2.5 transition-all duration-200 ${
      active
        ? 'bg-sky-400/20 text-sky-200 shadow-[0_0_14px_rgba(var(--th-glow),0.35)]'
        : 'text-white/45 hover:bg-white/[0.06] hover:text-white/85'
    }`;

  return (
    <nav
      aria-label="Switch interface view"
      className="fixed left-3 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border border-white/10 bg-[#070b16]/85 p-1.5 shadow-2xl backdrop-blur-md"
    >
      <button
        type="button"
        aria-label="Sofia view"
        title="Sofia view"
        aria-pressed={view === 'sofia'}
        onClick={() => onChange('sofia')}
        className={btn(view === 'sofia')}
      >
        <Orbit size={18} />
      </button>
      <button
        type="button"
        aria-label="Dashboard view"
        title="Dashboard view"
        aria-pressed={view === 'dashboard'}
        onClick={() => onChange('dashboard')}
        className={btn(view === 'dashboard')}
      >
        <LayoutDashboard size={18} />
      </button>
      <button
        type="button"
        aria-label="Theatre view"
        title="Theatre view (World Monitor)"
        aria-pressed={view === 'theatre'}
        onClick={() => onChange('theatre')}
        className={btn(view === 'theatre')}
      >
        <Sparkles size={18} />
      </button>
    </nav>
  );
}
