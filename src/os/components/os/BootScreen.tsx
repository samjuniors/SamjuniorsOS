import React, { useState, useEffect } from 'react';
import { Sparkles, Terminal, CheckCircle2 } from 'lucide-react';
import { osSound } from '@/os/lib/osAudio';

interface BootScreenProps {
  onComplete: () => void;
}

const BOOT_LOGS = [
  'INITIALIZING SAMJUNIORS OS KERNEL v4.3.0...',
  'AUTHENTICATING SECURE FOUNDER SESSION [OK]',
  'MOUNTING PERSISTENT KNOWLEDGE & EPISTEMIC LEDGER [OK]',
  'LOADING EXECUTIVE SPECIALIST COUNCIL (COO, RESEARCH, PM, FINANCE) [OK]',
  'CALIBRATING SOPHIA NEURAL CORE & AUDIO SYNTHESIS [OK]',
  'CONNECTING JARVIS REALTIME COGNITIVE GATEWAY [OK]',
  'MOUNTING IN-OS BROWSER & VISION FLUX ENGINE [OK]',
  'ALL SYSTEMS NOMINAL. ENTERING JARVIS LAB...',
];

export const BootScreen: React.FC<BootScreenProps> = ({ onComplete }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Attempt audio chime
    try {
      osSound.notify();
    } catch {}

    let logIndex = 0;
    const interval = setInterval(() => {
      if (logIndex < BOOT_LOGS.length) {
        setLogs((prev) => [...prev, BOOT_LOGS[logIndex]]);
        setProgress(Math.round(((logIndex + 1) / BOOT_LOGS.length) * 100));
        logIndex++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          onComplete();
        }, 500);
      }
    }, 280);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        e.preventDefault();
        clearInterval(interval);
        onComplete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onComplete]);

  return (
    <div
      onClick={onComplete}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#020308] p-8 sm:p-14 select-none cursor-pointer overflow-hidden animate-in fade-in duration-300"
    >
      {/* Ambient background glows */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(147, 51, 234, 0.18) 0%, rgba(6, 182, 212, 0.12) 40%, transparent 70%)',
        }}
      />

      {/* Top Header */}
      <div className="relative z-10 flex w-full items-center justify-between">
        <div className="flex items-center gap-2 text-cyan-400">
          <Terminal size={16} />
          <span className="font-mono text-xs tracking-widest uppercase text-cyan-300">
            SAMJUNIORS // BOOTSTRAP KERNEL
          </span>
        </div>
        <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest">
          BUILD 2026.09.21
        </span>
      </div>

      {/* Center Core Logo & Diagnostics */}
      <div className="relative z-10 flex flex-col items-center justify-center max-w-xl w-full text-center">
        {/* Luminous Emblem */}
        <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-cyan-500/40 bg-gradient-to-br from-purple-900/30 to-cyan-900/30 shadow-[0_0_50px_rgba(6,182,212,0.3)] animate-pulse">
          <Sparkles size={36} className="text-cyan-300 drop-shadow-[0_0_12px_#22d3ee]" />
          <div className="absolute inset-0 rounded-full border border-dotted border-purple-400/40 animate-spin" style={{ animationDuration: '12s' }} />
        </div>

        <h1 className="font-sans text-2xl sm:text-3xl font-extralight tracking-[0.45em] text-white uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
          S O P H I Λ
        </h1>
        <p className="mt-2 text-xs font-mono tracking-[0.3em] text-cyan-400/80 uppercase">
          Autonomous Company Operating System
        </p>

        {/* Progress Bar */}
        <div className="mt-8 w-full max-w-md">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10 border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-400 transition-all duration-300 shadow-[0_0_10px_#22d3ee]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-white/50">
            <span>SYSTEM_INITIALIZATION</span>
            <span>{progress}%</span>
          </div>
        </div>

        {/* Terminal Boot Log Output */}
        <div className="mt-6 w-full max-w-md text-left rounded-xl border border-white/10 bg-black/60 p-4 font-mono text-[11px] leading-relaxed shadow-inner">
          <div className="space-y-1.5 h-36 overflow-y-auto custom-scrollbar">
            {logs.map((line, idx) => (
              <div key={idx} className="flex items-start gap-2 text-slate-300">
                <span className="text-cyan-400 shrink-0">❯</span>
                <span className={idx === logs.length - 1 ? 'text-cyan-200 font-medium' : 'text-slate-400'}>
                  {line}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Skip Prompt */}
      <div className="relative z-10 flex flex-col items-center gap-1.5">
        <span className="font-mono text-[10px] tracking-widest text-white/40 uppercase animate-pulse">
          [ CLICK ANYWHERE OR PRESS SPACE TO ENTER ]
        </span>
      </div>
    </div>
  );
};
