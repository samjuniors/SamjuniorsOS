import { useEffect, useRef, useState } from "react";
import { Bot, Lock, Power, Wifi, Battery, ChevronRight } from "lucide-react";
import { osSound } from "../../lib/osAudio";
import { BOOT_LINES, OS } from "../../lib/osContent";

type Phase = "boot" | "lock" | "done";

function useClock() {
  const [n, setN] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setN(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return n;
}

/**
 * Fullscreen power-on → lock experience shown once before the desktop.
 * Calls onUnlock() when the user swipes / clicks / presses a key on the lock screen.
 */
export default function BootLock({ onUnlock }: { onUnlock: () => void }) {
  const [phase, setPhase] = useState<Phase>("boot");
  const [progress, setProgress] = useState(0);
  const [line, setLine] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const now = useClock();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let p = 0;
    const id = setInterval(() => {
      p += Math.random() * 12 + 5;
      setProgress(Math.min(100, p));
      setLine(Math.min(BOOT_LINES.length - 1, Math.floor((p / 100) * BOOT_LINES.length)));
      if (p >= 100) {
        clearInterval(id);
        setTimeout(() => { osSound.open(); setPhase("lock"); }, 500);
      }
    }, 260);
    return () => clearInterval(id);
  }, []);

  const unlock = () => {
    if (leaving || phase !== "lock") return;
    osSound.max();
    setLeaving(true);
    setTimeout(onUnlock, 620);
  };

  useEffect(() => {
    if (phase !== "lock") return;
    const onKey = () => unlock();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, leaving]);

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div
      className="absolute inset-0 z-[100] overflow-hidden"
      style={{
        opacity: leaving ? 0 : 1,
        transform: leaving ? "scale(1.04)" : "scale(1)",
        transition: "opacity 600ms ease, transform 600ms cubic-bezier(.16,1,.3,1)",
      }}
    >
      {/* wallpaper */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 20%, rgba(35,80,160,0.5), transparent 55%), radial-gradient(ellipse at 70% 110%, rgba(20,50,120,0.55), transparent 55%), #03060d",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6))" }}
      />
      {/* drifting particles */}
      {Array.from({ length: 26 }).map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-cyan-200/40"
          style={{
            left: `${(i * 37) % 100}%`,
            top: `${(i * 53) % 100}%`,
            width: 2 + (i % 3),
            height: 2 + (i % 3),
            opacity: 0.15 + (i % 5) * 0.08,
            animation: `boot-float ${6 + (i % 6)}s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}

      {phase === "boot" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="relative mb-8 flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan-200/25 bg-[#0a1424]/70 shadow-[0_0_60px_-8px_rgba(56,189,248,0.6)]">
            <span className="absolute inset-0 animate-ping rounded-3xl border border-cyan-300/20" style={{ animationDuration: "2.4s" }} />
            <Bot size={38} className="text-cyan-100 drop-shadow-[0_0_14px_rgba(103,232,249,0.9)]" />
          </div>
          <div className="mb-1 text-[22px] font-bold tracking-[0.28em] text-white">{OS.name.toUpperCase()}</div>
          <div className="mb-9 text-[10px] uppercase tracking-[0.4em] text-slate-500">{OS.companion} is waking</div>

          <div className="h-1 w-64 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-sky-400"
              style={{ width: `${progress}%`, transition: "width 260ms ease" }}
            />
          </div>
          <div className="mt-4 h-4 font-mono text-[11px] tracking-wide text-cyan-200/70">{BOOT_LINES[line]}</div>
        </div>
      ) : (
        <div className="absolute inset-0">
          {/* top tray */}
          <div className="absolute right-6 top-5 flex items-center gap-3 text-slate-300">
            <Wifi size={15} /> <Battery size={16} />
            <span className="tnum text-[12px]">Ready</span>
          </div>
          <div className="absolute left-6 top-5 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-slate-400">
            <Power size={13} className="text-emerald-400" /> {OS.companion} present
          </div>

          {/* clock */}
          <div className="absolute left-1/2 top-[26%] -translate-x-1/2 text-center">
            <div
              className="tnum text-[92px] font-extralight leading-none tracking-[-0.02em] text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.6)]"
              style={{ animation: "os-in 500ms cubic-bezier(.16,1,.3,1)" }}
            >
              {time}
            </div>
            <div className="mt-2 text-[15px] font-light tracking-[0.06em] text-slate-300">{date}</div>
          </div>

          {/* unlock */}
          <div className="absolute inset-x-0 bottom-[16%] flex flex-col items-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-200/25 bg-[#0a1424]/70 text-cyan-100 shadow-[0_0_40px_-6px_rgba(56,189,248,0.6)]">
              <Lock size={22} />
            </div>
            <button
              onClick={unlock}
              className="group flex items-center gap-3 rounded-full border border-white/12 bg-white/[0.05] py-2.5 pl-5 pr-2.5 text-[13px] font-medium tracking-wide text-slate-200 backdrop-blur-md transition hover:border-cyan-200/40 hover:bg-white/[0.09]"
              style={{ animation: "os-in 600ms cubic-bezier(.16,1,.3,1) 120ms both" }}
            >
              <User size={15} className="text-cyan-200" />
              Enter the desk
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400/90 text-[#04121b] transition group-hover:translate-x-0.5">
                <ChevronRight size={16} strokeWidth={2.4} />
              </span>
            </button>
            <div className="mt-4 text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Click or press any key to unlock
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function User({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
