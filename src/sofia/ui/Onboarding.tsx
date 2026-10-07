import { useEffect, useState } from 'react';

const KEY = 'sophia:onboarded';

export function Onboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== '1') setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* noop */
    }
    setOpen(false);
  };

  return (
    <aside
      role="dialog"
      aria-label="Welcome to Sophia"
      className="glass-panel panel-in panel-in-center fixed bottom-[108px] inset-x-4 mx-auto z-30 w-auto max-w-[380px] rounded-2xl p-4.5 sm:bottom-[120px]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="block size-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.7)]" />
          <p className="text-[9px] font-normal uppercase tracking-[0.24em] text-sky-300/80">First look</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss onboarding"
          className="grid size-5 place-items-center rounded-lg text-white/40 transition hover:bg-white/[0.06] hover:text-white"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <p className="mt-2 text-[12.5px] font-normal leading-relaxed tracking-wide text-white/90">
        Sophia is the ambient living interface of SamJuniors OS. Her presence breathes and listens in real time.
      </p>
      <p className="mt-1.5 text-[11px] font-light leading-relaxed text-white/45">
        Space talks, P pauses, T types, ` opens terminal. Explore shapes & controls in Settings.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="mt-3.5 h-8.5 w-full rounded-xl border border-sky-400/40 bg-sky-400/15 text-[10.5px] font-normal tracking-[0.16em] text-sky-100 transition-all hover:border-sky-400/60 hover:bg-sky-400/25 active:scale-[0.98]"
      >
        GET STARTED
      </button>
    </aside>
  );
}
