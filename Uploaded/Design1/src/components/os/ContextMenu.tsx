import { useEffect, type ReactNode } from "react";

export type MenuItem =
  | { type: "sep" }
  | { type: "item"; label: string; icon?: ReactNode; shortcut?: string; danger?: boolean; run: () => void };

export default function ContextMenu({ x, y, items, onClose }: {
  x: number; y: number; items: MenuItem[]; onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("blur", close); };
  }, [onClose]);

  // keep on screen
  const mx = Math.min(x, window.innerWidth - 230);
  const my = Math.min(y, window.innerHeight - 60 - items.length * 34);

  return (
    <div
      className="fixed z-[90] w-[210px] overflow-hidden rounded-xl border border-white/12 bg-[#0b1322]/95 p-1.5 shadow-[0_30px_80px_-16px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
      style={{ left: mx, top: my, animation: "ctx-in 140ms cubic-bezier(.16,1,.3,1)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((it, i) =>
        it.type === "sep" ? (
          <div key={i} className="my-1 h-px bg-white/8" />
        ) : (
          <button
            key={i}
            onClick={() => { onClose(); it.run(); }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition ${
              it.danger ? "text-rose-300 hover:bg-rose-500/15" : "text-slate-200 hover:bg-cyan-300/10 hover:text-white"
            }`}
          >
            <span className="flex h-4 w-4 items-center justify-center text-current opacity-80">{it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {it.shortcut && <span className="text-[10.5px] tracking-wide text-slate-500">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}
