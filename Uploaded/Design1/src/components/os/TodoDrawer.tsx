import { useState } from "react";
import { Plus, Trash2, X, ChevronRight, ChevronLeft, Activity, Pause, Play, AlertTriangle, ArrowRight } from "lucide-react";
import { osSound } from "../../lib/osAudio";
import { os, useOS, agentName, STAGES, type Workstream } from "../../lib/osStore";

const STATE_TINT: Record<Workstream["state"], string> = {
  active: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  paused: "bg-white/5 text-slate-300 border-white/10",
  blocked: "bg-rose-500/15 text-rose-200 border-rose-500/30",
  done: "bg-white/5 text-slate-500 border-white/10",
};

type Filter = "open" | "blocked" | "done";

/** V2.1 Work drawer — workstreams with filter pills and stage visualization. */
export default function TodoDrawer({ open, onToggle }: { open: boolean; onToggle: (open: boolean) => void }) {
  const work = useOS((s) => s.work);
  const agents = useOS((s) => s.agents);
  const [draft, setDraft] = useState("");
  const [owner, setOwner] = useState("ops");
  const [filter, setFilter] = useState<Filter>("open");

  const active = work.filter((w) => w.state === "active").length;
  const blocked = work.filter((w) => w.state === "blocked").length;
  const doneCount = work.filter((w) => w.state === "done").length;

  const shown = work.filter((w) =>
    filter === "open" ? w.state !== "done" :
    filter === "blocked" ? w.state === "blocked" :
    w.state === "done"
  );

  const add = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = draft.trim();
    if (!t) return;
    osSound.open();
    os.addWork(t, owner);
    setDraft("");
  };

  return (
    <>
      {/* Mobile backdrop for clean dismissal */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px] lg:hidden"
          onClick={() => { osSound.close(); onToggle(false); }}
        />
      )}

      {/* Floating pull tab handle — dynamically moves with drawer, positioned safely above right rail chevrons */}
      <button
        onClick={() => { osSound.click(); onToggle(!open); }}
        title={open ? "Close work (T)" : "Open work (T)"}
        className={`fixed z-40 flex items-center gap-1.5 rounded-l-2xl border-b border-l border-t border-cyan-400/40 bg-[#07101d]/95 py-2 pl-2 pr-1.5 backdrop-blur-xl transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-cyan-300 hover:bg-[#0c1a2e] active:scale-95 ${open ? "border-cyan-400 bg-cyan-950/90" : "hover:-translate-x-1"}`}
        style={{
          top: "36%",
          transform: "translateY(-50%)",
          right: open ? "min(290px, 85vw)" : "0px",
          boxShadow: open ? "-6px 0 24px rgba(56,189,248,0.45), inset 0 1px 0 rgba(255,255,255,0.2)" : "-6px 0 18px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.12)",
        }}
        aria-label="Toggle work drawer"
      >
        <span className={`flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400/20 text-cyan-200 transition-transform duration-350 ${open ? "" : "-rotate-180"}`}>
          {open ? <ChevronRight size={12} strokeWidth={2.5} /> : <ChevronLeft size={12} strokeWidth={2.5} />}
        </span>
        <div className="flex flex-col items-center gap-0.5">
          <span className="relative text-cyan-300">
            <Activity size={14} />
            {blocked > 0 && <span className="absolute -right-1 -top-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-0.5 text-[7.5px] font-bold text-white shadow-[0_0_6px_rgba(249,115,22,0.8)]">{blocked}</span>}
          </span>
          <span className="select-none text-[8.5px] font-extrabold uppercase tracking-[0.2em] text-cyan-100/90 [writing-mode:vertical-rl]" style={{ transform: "rotate(180deg)" }}>WORK</span>
        </div>
      </button>

      <div
        className={`fixed bottom-16 right-0 top-12 z-40 flex w-[290px] max-w-[85vw] flex-col overflow-hidden rounded-l-2xl border-b border-l border-t border-white/12 bg-[#060c18]/96 backdrop-blur-2xl transition-transform duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] sm:bottom-18 ${open ? "translate-x-0" : "pointer-events-none translate-x-full"}`}
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), -20px 0 50px -10px rgba(0,0,0,0.85)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-200/30 bg-cyan-400/10 text-cyan-200 shadow-[0_0_12px_rgba(56,189,248,0.3)]"><Activity size={14} /></span>
            <div>
              <h3 className="text-[12.5px] font-bold leading-tight tracking-wide text-white">Work</h3>
              <p className="tnum text-[9.5px] tracking-wider text-slate-400">{active} ACTIVE{blocked ? ` · ${blocked} BLOCKED` : ""}</p>
            </div>
          </div>
          <button onClick={() => { osSound.close(); onToggle(false); }} className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90" title="Close"><X size={14} /></button>
        </div>

        {/* Filter tab pills with counts */}
        <div className="flex items-center gap-1 border-b border-white/8 px-3 py-1.5">
          {(["open", "blocked", "done"] as Filter[]).map((t) => {
            const count = t === "open" ? work.filter((w) => w.state !== "done").length : t === "blocked" ? blocked : doneCount;
            return (
              <button
                key={t}
                onClick={() => { osSound.hover(); setFilter(t); }}
                className={`v2-tab flex items-center gap-1 ${filter === t ? "active" : ""}`}
              >
                <span>{t}</span>
                <span className="text-[9px] opacity-70 font-mono">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Workstream list */}
        <div className="os-scroll flex-1 space-y-1.5 overflow-y-auto px-2.5 py-2">
          {shown.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-slate-500">{filter === "blocked" ? "Nothing is blocked." : filter === "done" ? "Nothing shipped yet." : "No open workstreams."}</div>
          ) : shown.map((w) => {
            const idx = STAGES.indexOf(w.stage);
            return (
              <div key={w.id} className={`group rounded-lg border p-2 transition-all ${w.state === "done" ? "border-white/5 bg-white/[0.02] opacity-60" : "border-white/10 bg-white/[0.03] hover:border-cyan-300/30"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className={`min-w-0 flex-1 text-[11.5px] leading-snug ${w.state === "done" ? "text-slate-500 line-through" : "text-slate-200"}`}>{w.title}</p>
                  <span className={`shrink-0 rounded border px-1 py-px text-[8.5px] font-semibold uppercase tracking-wider ${STATE_TINT[w.state]}`}>{w.state}</span>
                </div>
                {/* V2: Stage progress bars */}
                <div className="v2-stage-row mt-1.5">
                  {STAGES.map((s, i) => <span key={s} title={s} className={`v2-stage-bar ${i <= idx ? "filled" : ""}`} />)}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[9.5px] text-slate-500">{agentName(w.owner)} · {w.stage}</span>
                  <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    {w.state !== "done" && <button onClick={() => { osSound.click(); os.advanceWork(w.id); }} title="Advance stage" className="rounded p-1 text-slate-400 hover:text-cyan-200"><ArrowRight size={11} /></button>}
                    {w.state === "active" && <button onClick={() => { osSound.click(); os.setWorkState(w.id, "paused"); }} title="Pause" className="rounded p-1 text-slate-400 hover:text-white"><Pause size={11} /></button>}
                    {w.state === "paused" && <button onClick={() => { osSound.click(); os.setWorkState(w.id, "active"); }} title="Resume" className="rounded p-1 text-slate-400 hover:text-white"><Play size={11} /></button>}
                    {w.state === "active" && <button onClick={() => { osSound.close(); os.setWorkState(w.id, "blocked"); }} title="Mark blocked" className="rounded p-1 text-slate-400 hover:text-rose-300"><AlertTriangle size={11} /></button>}
                    {w.state === "blocked" && <button onClick={() => { osSound.click(); os.setWorkState(w.id, "active"); }} title="Unblock" className="rounded px-1 text-[9.5px] text-amber-200 hover:text-white">Unblock</button>}
                    <button onClick={() => { osSound.close(); os.removeWork(w.id); }} title="Remove" className="rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300"><Trash2 size={11} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add workstream form */}
        <form onSubmit={add} className="border-t border-white/10 bg-black/40 p-2.5">
          <div className="flex items-center gap-1.5">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New workstream…" className="flex-1 rounded-lg border border-white/12 bg-white/5 px-2.5 py-1.5 text-[11.5px] text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:bg-white/[0.08]" />
            <button type="submit" disabled={!draft.trim()} className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-400 to-sky-400 font-bold text-slate-950 transition hover:brightness-110 active:scale-95 disabled:opacity-40"><Plus size={14} strokeWidth={2.6} /></button>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-slate-500">Owner</span>
            <div className="flex items-center gap-1">
              {agents.filter((a) => a.id !== "sophia").map((a) => (
                <button key={a.id} type="button" onClick={() => setOwner(a.id)} className={`rounded px-1.5 py-0.5 text-[8.5px] font-medium uppercase transition ${owner === a.id ? "border border-cyan-300/40 bg-cyan-300/20 text-cyan-200" : "text-slate-500 hover:text-slate-300"}`}>{a.name}</button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
