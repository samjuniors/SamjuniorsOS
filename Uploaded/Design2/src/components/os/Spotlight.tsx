import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search, CornerDownLeft } from "lucide-react";
import { osSound } from "../../lib/osAudio";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: ReactNode;
  run: () => void;
};

/** macOS-Spotlight style command palette (⌘/Ctrl + K). */
export default function Spotlight({ open, commands, onClose }: {
  open: boolean; commands: Command[]; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter((c) => (c.label + " " + c.group + " " + (c.hint ?? "")).toLowerCase().includes(s));
  }, [q, commands]);

  useEffect(() => { setSel(0); }, [q]);

  if (!open) return null;

  const pick = (c?: Command) => {
    if (!c) return;
    osSound.click();
    onClose();
    c.run();
  };

  const grouped: Record<string, Command[]> = {};
  results.forEach((c) => { (grouped[c.group] ??= []).push(c); });
  let flat = 0;

  return (
    <div
      className="absolute inset-0 z-[80] flex items-start justify-center pt-[14vh]"
      onPointerDown={onClose}
      style={{ animation: "os-fade 140ms ease" }}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" />
      <div
        className="relative w-[560px] max-w-[92vw] overflow-hidden rounded-2xl border border-white/12 bg-[#0a1220]/92 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
        onPointerDown={(e) => e.stopPropagation()}
        style={{ animation: "spot-in 220ms cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
          <Search size={18} className="shrink-0 text-cyan-300" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); pick(results[sel]); }
              else if (e.key === "Escape") { onClose(); }
            }}
            placeholder="Search apps, actions, settings…"
            className="w-full bg-transparent text-[16px] text-white outline-none placeholder:text-slate-500"
          />
          <kbd className="rounded border border-white/12 bg-white/5 px-1.5 py-0.5 text-[10px] tracking-wide text-slate-400">ESC</kbd>
        </div>

        <div className="max-h-[46vh] overflow-y-auto p-2 os-scroll">
          {results.length === 0 && (
            <div className="px-3 py-8 text-center text-[13px] text-slate-500">No results for “{q}”</div>
          )}
          {Object.entries(grouped).map(([group, cmds]) => (
            <div key={group} className="mb-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{group}</div>
              {cmds.map((c) => {
                const idx = flat++;
                const active = idx === sel;
                return (
                  <button
                    key={c.id}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => pick(c)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${active ? "bg-cyan-300/12" : "hover:bg-white/[0.04]"}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${active ? "border-cyan-200/40 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300"}`}>
                      {c.icon}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[13.5px] font-medium leading-tight text-slate-100">{c.label}</span>
                      {c.hint && <span className="block text-[11.5px] text-slate-500">{c.hint}</span>}
                    </span>
                    {active && <CornerDownLeft size={14} className="text-slate-500" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10.5px] text-slate-500">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="rounded bg-white/5 px-1">↑</kbd><kbd className="rounded bg-white/5 px-1">↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="rounded bg-white/5 px-1">↵</kbd> open</span>
          </span>
          <span className="tracking-[0.18em]">SAMJUNIORSOS</span>
        </div>
      </div>
    </div>
  );
}
