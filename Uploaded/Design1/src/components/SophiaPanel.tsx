import { useState, type ReactNode } from "react";
import { ChevronDown, Check, Circle, AlertTriangle, MessageSquare, StickyNote, Scale, X, Sparkles } from "lucide-react";
import type { Settings } from "../lib/field";
import { os, useOS, openAttention, openDecisions, activeWork, agentName, STAGES, type AttentionKind } from "../lib/osStore";

type Props = {
  settings: Settings;
  onChange: (s: Settings) => void;
  onReset: () => void;
  onSpeak: (text: string) => void;
};

const KIND_ICON: Record<AttentionKind, ReactNode> = {
  decision: <Scale size={12} />,
  review: <Circle size={12} />,
  blocked: <AlertTriangle size={12} />,
  message: <MessageSquare size={12} />,
  note: <StickyNote size={12} />,
};

const KIND_TINT: Record<AttentionKind, string> = {
  decision: "text-cyan-200 border-cyan-300/30 bg-cyan-300/10",
  review: "text-slate-200 border-white/15 bg-white/5",
  blocked: "text-rose-200 border-rose-300/30 bg-rose-400/10",
  message: "text-violet-200 border-violet-300/30 bg-violet-400/10",
  note: "text-amber-100 border-amber-300/25 bg-amber-300/10",
};

function Section({ title, count, children, defaultOpen = true, icon }: { title: string; count?: number; children: ReactNode; defaultOpen?: boolean; icon?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-white/5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-2.5 text-left">
        <span className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.2em] text-cyan-100/75">
          {icon}{title}
          {count !== undefined && count > 0 && (
            <span className="tnum rounded-full bg-cyan-300/15 px-1.5 py-px font-mono text-[10px] text-cyan-100">{count}</span>
          )}
        </span>
        <ChevronDown size={13} className={`text-cyan-200/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className="overflow-hidden transition-[max-height,opacity] duration-300" style={{ maxHeight: open ? 900 : 0, opacity: open ? 1 : 0 }}>
        <div className="px-4 pb-3">{children}</div>
      </div>
    </div>
  );
}

function Toggle({ label, on, onClick, hint }: { label: string; on: boolean; onClick: () => void; hint?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left transition hover:bg-white/[0.04]">
      <span>
        <span className="block text-[12px] text-slate-200">{label}</span>
        {hint && <span className="block text-[10.5px] text-slate-500">{hint}</span>}
      </span>
      <span className={`ml-3 h-3.5 w-6 shrink-0 rounded-full p-0.5 transition ${on ? "bg-cyan-400/70" : "bg-slate-600/70"}`}>
        <span className={`block h-2.5 w-2.5 rounded-full bg-white transition-transform duration-200 ${on ? "translate-x-2.5" : ""}`} />
      </span>
    </button>
  );
}

export default function SophiaPanel({ settings, onChange, onSpeak }: Props) {
  const [open, setOpen] = useState(false);
  const attention = useOS(openAttention);
  const decisions = useOS(openDecisions);
  const work = useOS(activeWork);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });

  const decide = (id: string, opt: string) => {
    const d = decisions.find((x) => x.id === id);
    const status = os.resolveDecision(id, opt);
    if (d?.effect === "toggle-voice") set("voice", /on/i.test(opt));
    if (d?.effect === "edit-context" && /set/i.test(opt)) {
      const v = window.prompt("This week's focus — one sentence:", "");
      if (v && v.trim()) os.setCompany({ focus: v.trim() });
    }
    onSpeak(status === "approved" ? `${d?.title ?? "Decision"}: ${opt}.` : `Deferred: ${d?.title ?? "decision"}.`);
  };

  // V2.1 Progressive Disclosure: Calm collapsed trigger pill by default
  if (!open) {
    const hasDecisions = decisions.length > 0;
    const hasAttention = attention.length > 0;
    return (
      <div className="pointer-events-auto">
        <button
          onClick={() => setOpen(true)}
          className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-medium tracking-wide backdrop-blur-xl transition-all duration-300 active:scale-95 ${
            hasDecisions
              ? "border-amber-300/40 bg-[#0c1524]/90 text-amber-100 shadow-[0_0_24px_-4px_rgba(251,191,36,0.35)]"
              : hasAttention
              ? "border-cyan-300/30 bg-[#081220]/90 text-cyan-100 shadow-[0_0_20px_-4px_rgba(56,189,248,0.3)]"
              : "border-white/10 bg-[#040a14]/75 text-slate-300 shadow-[0_4px_20px_rgba(0,0,0,0.5)] hover:border-cyan-300/30 hover:text-white"
          }`}
        >
          {hasDecisions ? (
            <Scale size={13} className="text-amber-300 animate-pulse" />
          ) : hasAttention ? (
            <AlertTriangle size={13} className="text-cyan-300" />
          ) : (
            <Sparkles size={13} className="text-cyan-300" />
          )}
          <span>
            {hasDecisions
              ? `${decisions.length} Decision${decisions.length > 1 ? "s" : ""} waiting`
              : hasAttention
              ? `${attention.length} Item${attention.length > 1 ? "s" : ""} need you`
              : "Briefing"}
          </span>
          <span className="text-[10px] text-cyan-200/50">▾</span>
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto relative z-20 w-[310px] max-w-[calc(100vw-2rem)]" style={{ animation: "os-in 220ms cubic-bezier(.16,1,.3,1)" }}>
      <div className="overflow-hidden rounded-2xl border border-cyan-200/15 bg-[#050c18]/92 shadow-[0_16px_50px_-10px_rgba(0,0,0,0.8),0_0_30px_-10px_rgba(56,189,248,0.3)] backdrop-blur-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-3">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/90">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_2px_rgba(103,232,249,0.8)]" />
            Sophia · Briefing
          </span>
          <button
            onClick={() => setOpen(false)}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90"
            title="Close briefing"
          >
            <X size={13} />
          </button>
        </div>

        <div className="max-h-[calc(100vh-13.5rem)] overflow-y-auto [scrollbar-width:thin]">
          {/* ---- Decisions (Immediate Act) ---- */}
          <Section title="Decisions" count={decisions.length} defaultOpen={decisions.length > 0} icon={<Scale size={11} />}>
            {decisions.length === 0 ? (
              <p className="py-1 text-[12px] text-slate-500">No open decisions waiting.</p>
            ) : (
              <ul className="space-y-2.5">
                {decisions.map((d) => (
                  <li key={d.id} className="rounded-xl border border-amber-300/25 bg-amber-400/[0.04] p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[12.5px] font-semibold text-white">{d.title}</div>
                      <span className="shrink-0 rounded border border-amber-300/30 bg-amber-400/10 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-amber-200">Action</span>
                    </div>
                    {d.context && <div className="mt-1 text-[11px] leading-snug text-slate-300">{d.context}</div>}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {d.options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => decide(d.id, opt)}
                          className="rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/20 active:scale-95"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ---- Needs you (Notice -> Understand -> Triage) ---- */}
          <Section title="Needs you" count={attention.length} defaultOpen={decisions.length === 0}>
            {attention.length === 0 ? (
              <p className="py-1 text-[12px] text-slate-500">Nothing needs you right now.</p>
            ) : (
              <ul className="space-y-1.5">
                {attention.slice(0, 6).map((a) => (
                  <li key={a.id} className="group flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${KIND_TINT[a.kind]}`}>{KIND_ICON[a.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-slate-100">{a.title}</span>
                      <span className="block text-[10.5px] text-slate-500">{agentName(a.from)} · {a.kind}</span>
                    </span>
                    <button
                      onClick={() => os.handleAttention(a.id)}
                      title="Mark handled"
                      className="rounded-md p-1 text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-cyan-200 group-hover:opacity-100"
                    >
                      <Check size={12} />
                    </button>
                  </li>
                ))}
                {attention.length > 6 && <li className="text-[10.5px] text-slate-500">+{attention.length - 6} more in SamJuniorsOS</li>}
              </ul>
            )}
          </Section>

          {/* ---- Active Workstreams ---- */}
          <Section title="In progress" count={work.length} defaultOpen={false}>
            {work.length === 0 ? (
              <p className="py-1 text-[12px] text-slate-500">No active workstreams.</p>
            ) : (
              <ul className="space-y-1.5">
                {work.slice(0, 5).map((w) => {
                  const stageIdx = STAGES.indexOf(w.stage);
                  return (
                    <li key={w.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[12px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-slate-100">{w.title}</span>
                          <span className="block text-[10.5px] text-slate-500">{agentName(w.owner)} · {w.stage}</span>
                        </span>
                        <span className={`shrink-0 rounded px-1.5 py-px text-[9.5px] uppercase tracking-[0.12em] ${w.state === "blocked" ? "bg-rose-400/15 text-rose-200" : w.state === "paused" ? "bg-white/5 text-slate-400" : "bg-emerald-400/10 text-emerald-200"}`}>{w.state}</span>
                      </div>
                      <div className="v2-stage-row mt-1.5">
                        {STAGES.map((s, i) => <span key={s} title={s} className={`v2-stage-bar ${i <= stageIdx ? "filled" : ""}`} />)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* ---- Preferences (Progressive disclosure) ---- */}
          <Section title="Presence & Audio" defaultOpen={false}>
            <Toggle label="Voice output" hint="Sophia speaks when decisions need you" on={settings.voice} onClick={() => set("voice", !settings.voice)} />
            <Toggle label="Core rotation" hint="Ambient motion of the particle lattice" on={settings.autoRotate} onClick={() => set("autoRotate", !settings.autoRotate)} />
            <Toggle label="Ambient field" on={settings.dust} onClick={() => set("dust", !settings.dust)} />
          </Section>
        </div>
      </div>
    </div>
  );
}
