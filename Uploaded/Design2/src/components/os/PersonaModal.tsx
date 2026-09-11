import { useState, type ReactNode } from "react";
import {
  Bot, X, Cpu, Wrench, Sparkles, CheckCircle2,
  Brain, ShieldCheck, ArrowRight, ChevronDown,
} from "lucide-react";
import { osSound } from "../../lib/osAudio";

export type AgentPersona = {
  id: string;
  name: string;
  role: string;
  designation: string;
  avatar: string;
  status: "present" | "held" | "working";
  color: string;
  glow: string;
  border: string;
  icon: ReactNode;
  attending: string;
  load: string;
  lastAct: string;
  skills: string[];
  tools: string[];
  brief: string;
};

export const AGENT_PERSONAS: AgentPersona[] = [
  {
    id: "sofia",
    name: "Sophia",
    role: "Holds attention. Speaks for the house. Routes what matters to the right hands.",
    designation: "Interface",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=160&h=160&fit=crop&crop=faces",
    status: "present",
    color: "from-cyan-400 to-sky-500",
    glow: "rgba(56, 189, 248, 0.4)",
    border: "border-cyan-400/50",
    icon: <Bot size={22} className="text-cyan-300" />,
    attending: "You",
    load: "Light",
    lastAct: "Morning brief",
    skills: ["Hold the room", "Ask once", "Route cleanly", "Know when to wait"],
    tools: ["Voice", "Desk", "Briefs", "Workforce"],
    brief: "I stay with Sam. I don't invent work. I surface what needs a word, and I keep the rest quiet.",
  },
  {
    id: "marcus",
    name: "Atlas",
    role: "Runs the day's motion. Keeps ops from piling up.",
    designation: "Operations",
    avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=160&h=160&fit=crop&crop=faces",
    status: "working",
    color: "from-amber-400 to-orange-500",
    glow: "rgba(249, 115, 22, 0.4)",
    border: "border-orange-400/50",
    icon: <Sparkles size={22} className="text-orange-400" />,
    attending: "Today's list",
    load: "Steady",
    lastAct: "Ops sweep",
    skills: ["Sequence the day", "Unblock people", "Close loops", "Flag delay"],
    tools: ["Work queue", "Calendar", "Status"],
    brief: "I move what is already decided. I do not decide for you.",
  },
  {
    id: "elena",
    name: "Iris",
    role: "Finds, reads, and briefs. Leaves a short note, not a pile.",
    designation: "Research",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=160&h=160&fit=crop&crop=faces",
    status: "held",
    color: "from-purple-400 to-indigo-500",
    glow: "rgba(168, 85, 247, 0.4)",
    border: "border-purple-400/50",
    icon: <Brain size={22} className="text-purple-300" />,
    attending: "Open question",
    load: "Quiet",
    lastAct: "Filed a note",
    skills: ["Read first", "Cut noise", "One-page briefs", "Cite the source"],
    tools: ["Notes", "Archive", "Search"],
    brief: "I answer the question on the table. I don't open ten more.",
  },
  {
    id: "kai",
    name: "Voss",
    role: "Keeps the record. Yesterday stays findable.",
    designation: "Records",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&h=160&fit=crop&crop=faces",
    status: "present",
    color: "from-emerald-400 to-teal-500",
    glow: "rgba(52, 211, 153, 0.4)",
    border: "border-emerald-400/50",
    icon: <Cpu size={22} className="text-emerald-300" />,
    attending: "Last week's decisions",
    load: "Light",
    lastAct: "Archived",
    skills: ["File once", "Name clearly", "Don't lose the thread", "Restore on ask"],
    tools: ["Archive", "Files", "Continuity"],
    brief: "If it was decided, it lives here. Nothing important lives only in chat.",
  },
  {
    id: "alex",
    name: "Reed",
    role: "Drafts and sends — after you say so.",
    designation: "Comms",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&h=160&fit=crop&crop=faces",
    status: "held",
    color: "from-rose-400 to-pink-500",
    glow: "rgba(244, 63, 94, 0.4)",
    border: "border-rose-400/50",
    icon: <Wrench size={22} className="text-rose-300" />,
    attending: "A reply",
    load: "Waiting",
    lastAct: "Draft ready",
    skills: ["Write in your voice", "Short first", "Wait for yes", "Then send"],
    tools: ["Inbox", "Drafts", "Voice"],
    brief: "I prepare the words. I do not send until you nod.",
  },
];

export default function PersonaModal({
  agent,
  onClose,
}: {
  agent: AgentPersona | null;
  onClose: () => void;
}) {
  const [more, setMore] = useState(false);
  if (!agent) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md"
      onClick={() => { osSound.close(); onClose(); }}
      style={{ animation: "os-fade 180ms ease" }}
    >
      <div
        className={`relative flex max-h-[90vh] w-[440px] max-w-[94vw] flex-col overflow-hidden rounded-3xl border ${agent.border} bg-[#070e1c]/95 shadow-[0_30px_90px_-15px_rgba(0,0,0,0.9)] backdrop-blur-2xl`}
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: `0 0 50px -10px ${agent.glow}, inset 0 1px 0 rgba(255,255,255,0.15)`,
          animation: "mac-zoom-in 260ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => { osSound.close(); onClose(); }} className="flex h-3 w-3 rounded-full border border-[#e0443e] bg-[#ff5f57] transition hover:brightness-110 active:scale-90" title="Close" />
            <span className="h-3 w-3 rounded-full border border-[#d89e24] bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full border border-[#1fa030] bg-[#28c840]" />
            <span className="ml-2 text-[10.5px] font-bold uppercase tracking-[0.2em] text-slate-400">Workforce</span>
          </div>
          <button onClick={() => { osSound.close(); onClose(); }} className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90" title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4 sm:p-5 os-scroll">
          <div className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:gap-4">
            <div className="relative">
              <img src={agent.avatar} alt={agent.name} className="h-16 w-16 rounded-2xl border-2 border-white/20 object-cover shadow-[0_4px_20px_rgba(0,0,0,0.6)]" />
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-emerald-400/80 bg-[#081220] shadow-[0_0_8px_rgba(52,211,153,0.8)]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-[17px] font-bold tracking-tight text-white sm:text-[18px]">{agent.name}</h3>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-emerald-300">
                  {agent.status}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11.5px] font-semibold tracking-wide text-cyan-300">{agent.designation}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{agent.role}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              ["Attending", agent.attending],
              ["Load", agent.load],
              ["Last", agent.lastAct],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/8 bg-white/[0.02] p-2.5 text-center">
                <div className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-500">{k}</div>
                <div className="mt-0.5 truncate text-[12.5px] font-semibold text-cyan-100">{v}</div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <span className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
              <ShieldCheck size={12} className="text-cyan-400" /> What they hold
            </span>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {agent.skills.map((skill) => (
                <div key={skill} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-slate-200">
                  <CheckCircle2 size={12} className="shrink-0 text-emerald-400" />
                  <span className="truncate">{skill}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => { osSound.click(); setMore((m) => !m); }}
            className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-slate-400 transition hover:text-slate-200"
          >
            Tools & brief
            <ChevronDown size={13} className={`transition-transform ${more ? "rotate-180" : ""}`} />
          </button>

          {more && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {agent.tools.map((tool) => (
                  <span key={tool} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10.5px] font-medium text-slate-300">
                    <Wrench size={10} className="text-orange-400" />
                    {tool}
                  </span>
                ))}
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/40 p-3 text-[11px] italic leading-relaxed text-slate-400">
                “{agent.brief}”
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] p-3.5">
          <span className="font-mono text-[10.5px] text-slate-500">{agent.designation}</span>
          <button
            onClick={() => { osSound.click(); onClose(); }}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 px-3.5 py-1.5 text-[11.5px] font-bold text-slate-950 shadow-[0_0_15px_rgba(56,189,248,0.4)] transition hover:brightness-110 active:scale-95"
          >
            <span>Close</span>
            <ArrowRight size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
