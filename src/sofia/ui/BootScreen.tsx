import { useEffect, useState } from 'react';
import { Mic, MessageSquare, Sparkles, Lock } from 'lucide-react';
import type { SophiaOS } from '../sophia/SophiaOS';

export function BootScreen({ os, onEnter }: { os: SophiaOS; onEnter: () => void }) {
  const [micState, setMicState] = useState<'granted' | 'prompt' | 'denied' | 'checking'>('checking');
  const [booting, setBooting] = useState(false);

  useEffect(() => {
    let unmounted = false;

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((p) => {
          if (unmounted) return;
          setMicState(p.state as 'granted' | 'prompt' | 'denied');
          p.onchange = () => {
            if (!unmounted) setMicState(p.state as 'granted' | 'prompt' | 'denied');
          };
        })
        .catch(() => {
          if (!unmounted) setMicState('prompt');
        });
    } else {
      setMicState('prompt');
    }

    const onEntered = () => {
      if (!unmounted) onEnter();
    };
    os.addEventListener('entered', onEntered);

    return () => {
      unmounted = true;
      os.removeEventListener('entered', onEntered);
    };
  }, [os, onEnter]);

  const handleStartWithMic = async () => {
    setBooting(true);
    await os.audio.unlockAudio();
    try {
      await os.enterSession('boot');
    } catch (err) {
      console.warn('[BootScreen] Start session note:', err);
    } finally {
      onEnter();
    }
  };

  const handleStartTextOnly = async () => {
    await os.audio.unlockAudio();
    void os.enterSession('chat');
    onEnter();
  };

  return (
    <div
      className="boot-screen absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#04060f] p-6 text-center transition-all duration-700 ease-in-out"
      role="dialog"
      aria-label="Sophia boot screen"
    >
      <div className="relative flex max-w-[min(440px,90vw)] flex-col items-center text-center">
        {/* Luminous mark */}
        <div className="relative mb-6">
          <span className="boot-mark block size-16 rounded-full bg-gradient-to-tr from-sky-500 via-sky-300 to-indigo-400 p-0.5 shadow-[0_0_35px_rgba(56,189,248,0.45)] animate-pulse">
            <span className="block h-full w-full rounded-full bg-[#04060f]" />
          </span>
        </div>

        <p className="text-[10px] font-medium uppercase tracking-[0.42em] text-sky-300/80">
          SamJuniors OS
        </p>
        
        <h1 className="mt-2 text-[clamp(32px,5vw,48px)] font-extralight tracking-[0.12em] text-white/95">
          Sophia
        </h1>

        <p className="mt-1.5 text-[11px] font-light tracking-[0.18em] text-sky-200/60 uppercase">
          Living Interface
        </p>

        {/* Status Badge */}
        <div className="mt-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 backdrop-blur-md">
          <span
            className={`size-2 rounded-full ${
              micState === 'granted'
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                : micState === 'denied'
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                  : 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]'
            }`}
          />
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-white/80">
            {micState === 'granted'
              ? 'Microphone Authorized'
              : micState === 'denied'
                ? 'Microphone Restricted in Browser'
                : 'Click to Connect Microphone'}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="mt-7 w-full space-y-3">
          {micState === 'denied' ? (
            <>
              {/* Primary option when mic is blocked in settings: Text & AI Voice Mode */}
              <button
                type="button"
                onClick={handleStartTextOnly}
                className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-emerald-400/50 bg-emerald-500/20 py-3.5 px-6 text-[12px] font-semibold tracking-wider text-emerald-100 shadow-[0_0_25px_rgba(52,211,153,0.25)] hover:bg-emerald-500/30 hover:text-white transition-all active:scale-[0.98]"
              >
                <MessageSquare size={18} className="text-emerald-300" />
                <span>Start Text & AI Voice Mode</span>
                <Sparkles size={14} className="text-emerald-300/80" />
              </button>

              <button
                type="button"
                onClick={handleStartWithMic}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 py-2.5 px-4 text-[10.5px] font-normal tracking-wide text-amber-200/90 hover:bg-amber-500/20 transition-all"
              >
                <Lock size={14} className="text-amber-300" />
                <span>Microphone Blocked (How to Unblock)</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleStartWithMic}
                disabled={booting}
                className="group relative flex w-full items-center justify-center gap-2.5 rounded-2xl border border-sky-400/50 bg-sky-500/20 py-3.5 px-6 text-[12px] font-semibold tracking-wider text-sky-100 shadow-[0_0_25px_rgba(56,189,248,0.3)] hover:border-sky-300 hover:bg-sky-500/30 hover:text-white transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <Mic size={18} className="text-sky-300 group-hover:scale-110 transition-transform" />
                <span>
                  {booting
                    ? 'Connecting Sophia…'
                    : micState === 'granted'
                      ? 'Start Live Voice Session'
                      : 'Start Sophia & Connect Mic'}
                </span>
                <Sparkles size={14} className="text-sky-300/70" />
              </button>

              <button
                type="button"
                onClick={handleStartTextOnly}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] py-2.5 px-4 text-[11px] font-normal tracking-wide text-white/60 hover:border-white/20 hover:bg-white/[0.06] hover:text-white transition-all"
              >
                <MessageSquare size={14} className="text-sky-300/80" />
                <span>Type Messages with Sophia Instead</span>
              </button>
            </>
          )}
        </div>

        <p className="mt-7 text-[9px] font-mono text-white/30">
          Powered by Gemini Live & Neural Audio
        </p>

      </div>
    </div>
  );
}
