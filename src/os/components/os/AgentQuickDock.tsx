import { useState } from "react";
import { ChevronUp, ChevronDown, Bot } from "lucide-react";
import { useOS, type Agent } from "../../lib/osStore";
import { osSound } from "../../lib/osAudio";

const STATE_DOT: Record<Agent["state"], string> = {
  working: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]",
  waiting: "bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.9)] animate-pulse",
  ready: "bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.8)]",
  offline: "bg-slate-600",
};
const STATE_LABEL: Record<Agent["state"], string> = { working: "Working", waiting: "Waiting on you", ready: "Ready", offline: "Offline" };

/** V2 Bottom workforce dock — richer icon avatars with gradient backgrounds, live state dots, attending text. */
export default function AgentQuickDock({ onSelectAgent }: { onSelectAgent: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const agents = useOS((s) => s.agents);
  const waiting = agents.filter((a) => a.state === "waiting").length;

  return (
    <div className="fixed left-1/2 z-40 -translate-x-1/2 transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ bottom: collapsed ? "-38px" : "10px" }}>
      <div className="flex flex-col items-center">
        <button
          onClick={() => { osSound.click(); setCollapsed(!collapsed); }}
          title={collapsed ? "Show workforce" : "Hide workforce"}
          className="group flex h-5 cursor-pointer items-center justify-center rounded-t-xl border-l border-r border-t border-cyan-400/30 bg-[#070e1c]/90 px-3.5 text-cyan-300 shadow-[0_-4px_16px_rgba(0,0,0,0.6)] backdrop-blur-xl transition hover:border-cyan-300 hover:bg-[#0c182d] hover:text-white active:scale-95"
        >
          <span className="transition-transform duration-300 group-hover:scale-125">{collapsed ? <ChevronUp size={13} strokeWidth={2.5} /> : <ChevronDown size={13} strokeWidth={2.5} />}</span>
          <span className="ml-1 text-[8.5px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-cyan-200">Workforce{waiting ? ` · ${waiting}` : ""}</span>
        </button>

        <div
          className="flex items-center gap-1.5 rounded-2xl border border-white/12 bg-[#060c18]/95 p-1.5 backdrop-blur-2xl sm:gap-2"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 10px 30px rgba(0,0,0,0.8), 0 0 20px -5px rgba(56,189,248,0.25)" }}
        >
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => { osSound.open(); onSelectAgent(a.id); }}
              title={`${a.name} — ${a.role} · ${a.current ?? STATE_LABEL[a.state]}`}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 hover:bg-white/10 active:scale-90 sm:h-11 sm:w-11 ${a.state === "offline" ? "opacity-50" : ""}`}
            >
              {/* V2: Gradient background icon avatar */}
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 transition-all duration-300 group-hover:-translate-y-1 group-hover:scale-110 group-hover:border-white/30 sm:h-9 sm:w-9"
                style={{
                  background: `linear-gradient(135deg, ${a.glow.replace("0.4", "0.15")}, rgba(255,255,255,0.04))`,
                  boxShadow: `0 4px 15px -2px ${a.glow}`,
                }}
              >
                <Bot size={17} className={a.tint} />
              </span>
              <span className={`absolute bottom-0.5 right-1 h-1.5 w-1.5 rounded-full ${STATE_DOT[a.state]}`} />
              {/* V2: Enhanced tooltip with attending text */}
              <span className="pointer-events-none absolute -top-11 -translate-y-1 whitespace-nowrap rounded-lg border border-white/10 bg-[#060c18]/95 px-2 py-1 text-[9.5px] opacity-0 shadow-xl backdrop-blur-md transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                <span className="block font-bold text-white">{a.name}</span>
                <span className="block text-slate-400">{a.current ?? STATE_LABEL[a.state]}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
