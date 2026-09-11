import { useState } from "react";
import { Bot, X, Wrench, CheckCircle2, ShieldAlert, ArrowRight, Pause, Play, ChevronDown } from "lucide-react";
import { osSound } from "../../lib/osAudio";
import { os, useOS, agentName, type Agent } from "../../lib/osStore";

export type { Agent as AgentPersona };

const STATE_LABEL: Record<Agent["state"], string> = {
  ready: "Ready", working: "Working", waiting: "Waiting on you", offline: "Offline",
};
const STATE_TINT: Record<Agent["state"], string> = {
  ready: "bg-cyan-500/15 text-cyan-200 border-cyan-400/30",
  working: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  waiting: "bg-amber-400/15 text-amber-100 border-amber-300/30",
  offline: "bg-white/5 text-slate-400 border-white/10",
};

/** V2 Workforce role card — avatar layout, stat grid, live assignments, permissions, escalation. */
export default function PersonaModal({ agentId, onClose }: { agentId: string | null; onClose: () => void }) {
  const agent = useOS((s) => s.agents.find((a) => a.id === agentId) ?? null);
  const work = useOS((s) => s.work.filter((w) => w.owner === agentId && w.state !== "done"));
  const raised = useOS((s) => s.attention.filter((a) => a.from === agentId && !a.handled));
  const [more, setMore] = useState(false);
  if (!agent) return null;

  const close = () => { osSound.close(); onClose(); };
  const toggleOffline = () => {
    osSound.click();
    os.setAgentOffline(agent.id, agent.state !== "offline");
  };

  // V2: derive attending / load from live state
  const attending = agent.current ?? (raised.length ? `${raised.length} raised for you` : "—");
  const load = work.length === 0 ? "Idle" : work.filter((w) => w.state === "blocked").length ? "Blocked" : work.length >= 3 ? "Heavy" : work.length >= 2 ? "Steady" : "Light";
  const lastAct = agent.current ? agent.current : work.length ? work[0].title : "—";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-4" onClick={close} style={{ animation: "os-fade 180ms ease" }}>
      <div
        className="relative flex max-h-[90vh] w-[460px] max-w-[94vw] flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#070e1c]/95 backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: `0 0 50px -10px ${agent.glow}, inset 0 1px 0 rgba(255,255,255,0.15)`, animation: "mac-zoom-in 260ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {/* Traffic lights header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={close} className="flex h-3 w-3 rounded-full border border-[#e0443e] bg-[#ff5f57] transition hover:brightness-110 active:scale-90" title="Close" />
            <span className="h-3 w-3 rounded-full border border-[#d89e24] bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full border border-[#1fa030] bg-[#28c840]" />
            <span className="ml-2 text-[10.5px] font-bold uppercase tracking-[0.2em] text-slate-400">Workforce · Role</span>
          </div>
          <button onClick={close} className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90"><X size={14} /></button>
        </div>

        <div className="os-scroll space-y-4 overflow-y-auto p-4 sm:p-5">
          {/* V2: Avatar-style identity card */}
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <span className="v2-avatar" style={{ boxShadow: `0 0 26px -6px ${agent.glow}` }}>
              <Bot size={30} className={agent.tint} />
              <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border bg-[#081220] shadow-[0_0_8px_${agent.state === "working" ? "rgba(52,211,153,0.8)" : agent.state === "waiting" ? "rgba(252,211,77,0.8)" : "rgba(103,232,249,0.8)"}] ${agent.state === "working" ? "border-emerald-400/80" : agent.state === "waiting" ? "border-amber-300/80" : agent.state === "offline" ? "border-slate-600" : "border-cyan-400/80"}`}>
                <span className={`h-2 w-2 rounded-full ${agent.state === "working" ? "bg-emerald-400" : agent.state === "waiting" ? "bg-amber-300 animate-pulse" : agent.state === "offline" ? "bg-slate-600" : "bg-cyan-300"}`} />
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[18px] font-bold tracking-tight text-white">{agent.name}</h3>
                <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${STATE_TINT[agent.state]}`}>{STATE_LABEL[agent.state]}</span>
              </div>
              <p className="mt-0.5 text-[12px] font-semibold tracking-wide text-cyan-300">{agent.role}</p>
              {agent.current && <p className="mt-0.5 truncate text-[11.5px] text-slate-400">Now: {agent.current}</p>}
            </div>
          </div>

          {/* V2: 3-column stat grid (from Design2) */}
          <div className="v2-stat-grid">
            {([
              ["Attending", attending],
              ["Load", load],
              ["Last", lastAct],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="v2-stat-card">
                <div className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-500">{k}</div>
                <div className="mt-0.5 truncate text-[12.5px] font-semibold text-cyan-100">{v}</div>
              </div>
            ))}
          </div>

          <p className="text-[12.5px] leading-relaxed text-slate-300">{agent.remit}</p>

          {/* Live assignments */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
              <span>Assignments</span><span className="tnum font-mono text-cyan-200">{work.length}</span>
            </div>
            {work.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-3 py-2 text-[11.5px] text-slate-500">Nothing assigned. Say "work on …" to Sophia and choose this role, or add work in the dock.</div>
            ) : (
              <ul className="space-y-1.5">
                {work.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-1.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] text-slate-100">{w.title}</span>
                      <span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500">{w.stage} · {w.state}</span>
                    </span>
                    {w.state === "active" ? (
                      <button onClick={() => { osSound.click(); os.setWorkState(w.id, "paused"); }} className="rounded-md p-1 text-slate-400 hover:text-white" title="Pause"><Pause size={12} /></button>
                    ) : w.state !== "done" ? (
                      <button onClick={() => { osSound.click(); os.setWorkState(w.id, "active"); }} className="rounded-md p-1 text-slate-400 hover:text-white" title="Resume"><Play size={12} /></button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {raised.length > 0 && (
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-[11.5px] text-amber-100">
              {agent.name} raised {raised.length} item{raised.length > 1 ? "s" : ""} for you: {raised.map((r) => r.title).join(" · ")}
            </div>
          )}

          {/* Permissions */}
          <div className="space-y-1.5">
            <span className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400"><CheckCircle2 size={12} className="text-cyan-400" /> May do without asking</span>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {agent.canDo.map((s) => (
                <div key={s} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-slate-200">
                  <span className={`h-1.5 w-1.5 rounded-full ${agent.tint.replace("text-", "bg-")}`} />{s}
                </div>
              ))}
            </div>
          </div>

          {/* V2: Tools & Brief — progressive disclosure with Design2 quote style */}
          <button
            onClick={() => { osSound.click(); setMore((m) => !m); }}
            className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-slate-400 transition hover:text-slate-200"
          >
            Tools & escalation
            <ChevronDown size={13} className={`transition-transform ${more ? "rotate-180" : ""}`} />
          </button>

          {more && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <span className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400"><Wrench size={12} className="text-orange-400" /> Works with</span>
                <div className="flex flex-wrap gap-1.5">
                  {agent.tools.map((t) => <span key={t} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10.5px] font-medium text-slate-300">{t}</span>)}
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-2xl border border-rose-300/15 bg-rose-400/[0.05] p-3">
                <ShieldAlert size={14} className="mt-0.5 shrink-0 text-rose-300" />
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-rose-200">Escalates to you</div>
                  <div className="mt-0.5 text-[11.5px] text-slate-300">{agent.escalates}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] p-3.5">
          <span className="text-[10.5px] text-slate-500">Reports to {agent.id === "sophia" ? "you" : agentName("sophia")}</span>
          <div className="flex items-center gap-2">
            {agent.id !== "sophia" && (
              <button onClick={toggleOffline} className="rounded-xl border border-white/10 px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-white/25 hover:text-white active:scale-95">
                {agent.state === "offline" ? "Bring online" : "Take offline"}
              </button>
            )}
            <button
              onClick={() => { osSound.open(); const t = window.prompt(`Assign ${agent.name} a workstream:`); if (t && t.trim()) os.addWork(t.trim(), agent.id); }}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 px-3.5 py-1.5 text-[11.5px] font-bold text-slate-950 shadow-[0_0_15px_rgba(56,189,248,0.4)] transition hover:brightness-110 active:scale-95"
            >
              Assign work <ArrowRight size={13} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
