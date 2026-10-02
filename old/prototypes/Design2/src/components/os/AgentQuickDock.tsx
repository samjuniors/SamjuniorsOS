import { useState, type ReactNode } from "react";
import { ChevronUp, ChevronDown, Bot, Sparkles, Brain, Cpu, Wrench } from "lucide-react";
import { AGENT_PERSONAS, type AgentPersona } from "./PersonaModal";
import { osSound } from "../../lib/osAudio";

export default function AgentQuickDock({
  onSelectAgent,
}: {
  onSelectAgent: (agent: AgentPersona) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const getAgentIcon = (id: string, colorClass: string): ReactNode => {
    switch (id) {
      case "sofia":
        return <Bot size={17} className={colorClass} />;
      case "marcus":
        return <Sparkles size={17} className={colorClass} />;
      case "elena":
        return <Brain size={17} className={colorClass} />;
      case "kai":
        return <Cpu size={17} className={colorClass} />;
      case "alex":
        return <Wrench size={17} className={colorClass} />;
      default:
        return <Bot size={17} className={colorClass} />;
    }
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{
        bottom: collapsed ? "-38px" : "10px",
      }}
    >
      <div className="flex flex-col items-center">
        {/* Toggle Slide Handle Icon */}
        <button
          onClick={() => {
            osSound.click();
            setCollapsed(!collapsed);
          }}
          title={collapsed ? "Slide agents dock up" : "Slide agents dock down"}
          className="group flex items-center justify-center h-5 px-3.5 rounded-t-xl border-t border-l border-r border-cyan-400/30 bg-[#070e1c]/90 text-cyan-300 shadow-[0_-4px_16px_rgba(0,0,0,0.6)] backdrop-blur-xl transition hover:border-cyan-300 hover:bg-[#0c182d] hover:text-white active:scale-95 cursor-pointer"
        >
          <span className="transition-transform duration-300 group-hover:scale-125">
            {collapsed ? <ChevronUp size={13} strokeWidth={2.5} /> : <ChevronDown size={13} strokeWidth={2.5} />}
          </span>
          <span className="ml-1 text-[8.5px] uppercase font-bold tracking-widest text-slate-400 group-hover:text-cyan-200">
            {collapsed ? "TEAM" : "DOCK"}
          </span>
        </button>

        {/* The 5 Agent Buttons Bar */}
        <div
          className="flex items-center gap-1.5 sm:gap-2 p-1.5 rounded-2xl border border-white/12 bg-[#060c18]/95 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
          style={{
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.1), 0 10px 30px rgba(0,0,0,0.8), 0 0 20px -5px rgba(56,189,248,0.25)",
          }}
        >
          {AGENT_PERSONAS.map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                osSound.open();
                onSelectAgent(agent);
              }}
              title={`${agent.name} — ${agent.designation}`}
              className="group relative flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl transition-all duration-200 hover:bg-white/10 active:scale-90"
            >
              {/* Agent Icon inside soft glowing border */}
              <span
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] transition-all duration-300 group-hover:-translate-y-1 group-hover:scale-110 group-hover:border-white/30"
                style={{
                  boxShadow: `0 4px 15px -2px ${agent.glow}`,
                }}
              >
                {getAgentIcon(agent.id, "text-white")}
              </span>

              {/* Live status dot */}
              <span className="absolute bottom-0.5 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />

              {/* Hover tooltip label */}
              <span className="pointer-events-none absolute -top-9 opacity-0 group-hover:opacity-100 transition-all duration-200 -translate-y-1 group-hover:translate-y-0 whitespace-nowrap rounded-lg border border-white/10 bg-[#060c18]/95 px-2 py-0.5 text-[9.5px] font-bold text-white shadow-xl backdrop-blur-md">
                {agent.name.split(" ")[0]} · {agent.designation.split("/")[0]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
