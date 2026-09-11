import { useState, type ReactNode } from "react";
import { ChevronDown, Check, Circle, AlertTriangle, MessageSquare, StickyNote, Scale, SlidersHorizontal, CheckCircle2 } from "lucide-react";
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
        <ChevronDown size={13} className={`text-cyan-200/50 transition-transform ${open ? "rotate-180" : ""}`} />
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
        <span className={`block h-2.5 w-2.5 rounded-full bg-white transition-transform ${on ? "translate-x-2.5" : ""}`} />
      </span>
    </button>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block select-none">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-cyan-100/50">
        <span>{label}</span><span className="font-mono text-cyan-200/80">{value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="slider h-1 w-full cursor-pointer appearance-none rounded-full bg-cyan-300/15 outline-none" />
    </label>
  );
}

export default function SophiaPanel({ settings, onChange, onReset, onSpeak }: Props) {
  const [open, setOpen] = useState(true);
  const attention = useOS(openAttention);
  const decisions = useOS(openDecisions);
  const work = useOS(activeWork);
  const allWork = useOS((s) => s.work);
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

  return (
    <div className="pointer-events-auto relative z-20 w-[292px] max-w-[calc(100vw-2rem)]">
      <div className="overflow-hidden rounded-2xl border border-cyan-200/12 bg-[#040a14]/70 shadow-[0_0_60px_-15px_rgba(56,189,248,0.45)] backdrop-blur-md">
        <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-100/80">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_10px_2px_rgba(103,232,249,0.8)]" />
            Sophia · Briefing
          </span>
          <span className={`text-cyan-200/60 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </button>

        {open && (
          <div className="max-h-[calc(100vh-9rem)] overflow-y-auto [scrollbar-width:thin]">
            {/* ---- needs you ---- */}
            <Section title="Needs you" count={attention.length}>
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
                      <button onClick={() => os.handleAttention(a.id)} title="Mark handled" className="rounded-md p-1 text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-cyan-200 group-hover:opacity-100"><Check size={12} /></button>
                    </li>
                  ))}
                  {attention.length > 6 && <li className="text-[10.5px] text-slate-500">+{attention.length - 6} more in SamJuniorsOS</li>}
                </ul>
              )}
            </Section>

            {/* ---- decisions ---- */}
            <Section title="Decisions" count={decisions.length} icon={<Scale size={11} />}>
              {decisions.length === 0 ? (
                <p className="py-1 text-[12px] text-slate-500">No open decisions.</p>
              ) : (
                <ul className="space-y-2">
                  {decisions.slice(0, 3).map((d) => (
                    <li key={d.id} className="rounded-xl border border-cyan-200/15 bg-cyan-300/[0.04] p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[12.5px] font-medium text-white">{d.title}</div>
                        <span className="shrink-0 rounded border border-cyan-300/25 bg-cyan-300/10 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wider text-cyan-200">decide</span>
                      </div>
                      {d.context && <div className="mt-1 text-[11px] leading-snug text-slate-400">{d.context}</div>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {d.options.map((opt, i) => (
                          <button key={opt} onClick={() => decide(d.id, opt)} className={`rounded-md border px-2 py-1 text-[10.5px] uppercase tracking-[0.12em] transition active:scale-95 ${i === 0 ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25" : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/25"}`}>{opt}</button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* ---- working on — V2: progress bar + stage indicators ---- */}
            <Section title="In progress" count={work.length} defaultOpen={false}>
              {work.length === 0 ? (
                <p className="py-1 text-[12px] text-slate-500">No active workstreams.</p>
              ) : (
                <>
                  {/* V2: Overall progress summary */}
                  {(() => {
                    const doneCount = allWork.filter((w) => w.state === "done").length;
                    const total = allWork.length;
                    const pct = total ? Math.round((doneCount / total) * 100) : 0;
                    return (
                      <div className="mb-2">
                        <div className="mb-1 flex items-center justify-between text-[10.5px]">
                          <span className="flex items-center gap-1 text-slate-300">
                            <CheckCircle2 size={11} className="text-emerald-400" />
                            <span className="tnum font-semibold text-white">{doneCount}</span>/{total} shipped
                          </span>
                          <span className="tnum font-mono text-[10px] font-semibold text-cyan-300">{pct}%</span>
                        </div>
                        <div className="v2-progress">
                          <div className="v2-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                  <ul className="space-y-1.5">
                    {work.slice(0, 5).map((w) => {
                      const stageIdx = STAGES.indexOf(w.stage);
                      return (
                        <li key={w.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-[12px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block truncate text-slate-100">{w.title}</span>
                              <span className="block text-[10.5px] text-slate-500">{agentName(w.owner)} · {w.stage}</span>
                            </span>
                            <span className={`shrink-0 rounded px-1.5 py-px text-[9.5px] uppercase tracking-[0.12em] ${w.state === "blocked" ? "bg-rose-400/15 text-rose-200" : w.state === "paused" ? "bg-white/5 text-slate-400" : "bg-emerald-400/10 text-emerald-200"}`}>{w.state}</span>
                          </div>
                          {/* V2: Stage progress bars */}
                          <div className="v2-stage-row mt-1.5">
                            {STAGES.map((s, i) => <span key={s} title={s} className={`v2-stage-bar ${i <= stageIdx ? "filled" : ""}`} />)}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Section>

            {/* ---- presence ---- */}
            <Section title="Presence" defaultOpen={false}>
              <Toggle label="Voice" hint="Sophia speaks when something needs you" on={settings.voice} onClick={() => set("voice", !settings.voice)} />
              <Toggle label="Motion" hint="Slow orbit of the field" on={settings.autoRotate} onClick={() => set("autoRotate", !settings.autoRotate)} />
              <Toggle label="Ambient particles" on={settings.dust} onClick={() => set("dust", !settings.dust)} />
              <Toggle label="Connections" on={settings.showLinks} onClick={() => set("showLinks", !settings.showLinks)} />
            </Section>

            {/* ---- advanced (progressive disclosure) ---- */}
            <Section title="Advanced tuning" defaultOpen={false} icon={<SlidersHorizontal size={11} />}>
              <div className="space-y-3">
                <Slider label="Density" value={settings.nodeCount} min={80} max={420} step={10} onChange={(v) => set("nodeCount", Math.round(v))} />
                <Slider label="Reach" value={settings.linkDistance} min={0.2} max={0.8} step={0.01} onChange={(v) => set("linkDistance", v)} />
                <Slider label="Glow" value={settings.glow} min={0.4} max={2} step={0.05} onChange={(v) => set("glow", v)} />
                <Slider label="Bloom" value={settings.bloom} min={0} max={1.6} step={0.05} onChange={(v) => set("bloom", v)} />
                <Slider label="Responsiveness" value={settings.stiffness} min={0.25} max={2.2} step={0.05} onChange={(v) => set("stiffness", v)} />
                <Slider label="Cursor influence" value={settings.mouseForce} min={0} max={3} step={0.05} onChange={(v) => set("mouseForce", v)} />
                <Slider label="Activity" value={settings.dataFlow} min={0} max={3} step={0.05} onChange={(v) => set("dataFlow", v)} />
                <button onClick={onReset} className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[10.5px] uppercase tracking-[0.14em] text-slate-400 transition hover:border-white/25 hover:text-slate-200">Reset defaults</button>
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
