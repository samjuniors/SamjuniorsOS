import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, AlertTriangle, Scale, X, Sparkles, BrainCircuit, Check, Trash2, RefreshCw } from "lucide-react";
import type { Settings } from "../lib/field";
import { os, useOS, openAttention, openDecisions, activeWork, agentName, STAGES } from "../lib/osStore";
import { DecisionSurface, AttentionSurface, EmptyState } from "./surfaces/StandardSurfaces";
import { decisionToDecisionData, attentionToAttentionData } from "../lib/surfaceSchema";

type Props = {
  settings: Settings;
  onChange: (s: Settings) => void;
  onReset: () => void;
  onSpeak: (text: string) => void;
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

/* ------------------------------------------------------------------ Memory review (M4-A hardening)
 *
 * Founder review surface for PENDING Sophia personal-memory capture
 * candidates. Reuses the GOVERNED /api/sofia/memory APIs verbatim:
 *   GET    ?active=false  — the review queue (with deterministic
 *                           duplicate/similarity annotations)
 *   PATCH  { id, active: true } — the ONLY activation path (approve)
 *   DELETE ?id= — reject
 * Nothing here bypasses the server: this is a thin review UI over the
 * same governed boundary the tests pin.
 */

interface PendingMemory {
  id: string;
  memoryType: string;
  content: string;
  confidence: number;
  provenance?: string;
  createdAt?: string;
  metadata?: {
    captureStatus?: string;
    conversationId?: string;
    turnId?: string | null;
    capturedAt?: string;
    gate?: { decision?: string; reasons?: string[] };
  };
}

interface ReviewAnnotations {
  [memoryId: string]: {
    duplicateOf?: { id: string; content: string };
    similarTo?: Array<{ id: string; content: string; similarity: number }>;
    contradicts?: Array<{ id: string; content: string }>;
  };
}

const MEMORY_TYPE_LABEL: Record<string, string> = {
  INTERACTION_PREFERENCE: "interaction pref",
  COMMUNICATION_PREFERENCE: "comms pref",
  INTERACTION_PATTERN: "pattern",
  PERSONAL_CONTEXT_NOTE: "context note",
  INTERACTION_OBSERVATION: "observation",
};

function MemoryReview({ onCount }: { onCount?: (n: number) => void }) {
  const [pending, setPending] = useState<PendingMemory[]>([]);
  const [annotations, setAnnotations] = useState<ReviewAnnotations>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState<string>("");

  const load = async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/sofia/memory?active=false&limit=50");
      if (!res.ok) throw new Error(`queue fetch failed (${res.status})`);
      const body = await res.json();
      const list = Array.isArray(body.memories) ? body.memories : [];
      setPending(list);
      setAnnotations(body.annotations ?? {});
      setStatus("ready");
      onCount?.(list.length);
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => { load(); }, []);

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      await fetch("/api/sofia/memory", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, active: true }),
      });
    } catch { /* review action is best-effort UI; server state is authoritative */ }
    await load();
    setBusyId("");
  };

  const reject = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/sofia/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch { /* same */ }
    await load();
    setBusyId("");
  };

  if (status === "loading") {
    return <p className="py-1 text-[11.5px] text-slate-500">Loading captured memory candidates…</p>;
  }
  if (status === "error") {
    return (
      <div className="space-y-1.5">
        <p className="text-[11.5px] text-rose-300/90">Couldn't load the memory review queue.</p>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-300 transition hover:border-cyan-300/30 hover:text-white">
          <RefreshCw size={11} /> Retry
        </button>
      </div>
    );
  }
  if (pending.length === 0) {
    return <p className="py-1 text-[12px] text-slate-500">No pending memories. Captured candidates wait here for your confirmation.</p>;
  }

  return (
    <div className="space-y-2 max-h-72 overflow-y-auto [scrollbar-width:thin] pr-0.5">
      {pending.map((m) => {
        const note = annotations[m.id];
        const gateReasons = m.metadata?.gate?.reasons?.filter((r) => r !== "PASSED_DETERMINISTIC_CHECKS") ?? [];
        return (
          <div key={m.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[12px]">
            <p className="text-slate-100">{m.content}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9.5px] uppercase tracking-[0.1em] text-slate-500">
              <span className="rounded bg-white/5 px-1.5 py-px font-mono normal-case tracking-normal">{MEMORY_TYPE_LABEL[m.memoryType] ?? m.memoryType}</span>
              {typeof m.confidence === "number" && <span className="tnum font-mono normal-case">conf {m.confidence.toFixed(2)}</span>}
              {m.metadata?.capturedAt && <span className="font-mono normal-case">{new Date(m.metadata.capturedAt).toLocaleString()}</span>}
              {m.metadata?.conversationId && (
                <span className="max-w-[120px] truncate font-mono normal-case" title={m.metadata.conversationId}>from {m.metadata.conversationId}</span>
              )}
            </div>
            {(note?.duplicateOf || (note?.similarTo?.length ?? 0) > 0) && (
              <p className="mt-1.5 rounded border border-amber-300/20 bg-amber-300/5 px-2 py-1 text-[10.5px] text-amber-200/90">
                {note.duplicateOf
                  ? `Possible exact duplicate of: “${note.duplicateOf.content.slice(0, 80)}”`
                  : `Similar to an existing memory (${Math.round((note.similarTo![0].similarity ?? 0) * 100)}% overlap): “${note.similarTo![0].content.slice(0, 80)}”`}
              </p>
            )}
            {(note?.contradicts?.length ?? 0) > 0 && (
              <p className="mt-1.5 rounded border border-rose-300/20 bg-rose-300/5 px-2 py-1 text-[10.5px] text-rose-200/90">
                Possible contradiction with an existing memory: “{note.contradicts![0].content.slice(0, 80)}”
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => approve(m.id)}
                disabled={busyId === m.id}
                className="flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-40"
              >
                <Check size={11} /> Approve
              </button>
              <button
                onClick={() => reject(m.id)}
                disabled={busyId === m.id}
                className="flex items-center gap-1 rounded-md border border-rose-400/25 bg-rose-400/5 px-2 py-1 text-[11px] text-rose-200 transition hover:bg-rose-400/15 disabled:opacity-40"
              >
                <Trash2 size={11} /> Reject
              </button>
              {gateReasons.length > 0 && <span className="ml-auto font-mono text-[9.5px] text-slate-600" title={`Gate: ${gateReasons.join(", ")}`}>gate: {gateReasons[0]}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SophiaPanel({ settings, onChange, onSpeak }: Props) {
  const [open, setOpen] = useState(false);
  const [pendingMemoryCount, setPendingMemoryCount] = useState(0);
  const attention = useOS(openAttention);
  const decisions = useOS(openDecisions);
  const work = useOS(activeWork);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });

  // Discoverability: the collapsed pill needs the pending-capture count even
  // before the panel is opened once — a one-shot governed GET on mount (the
  // open panel's MemoryReview keeps the live count afterwards).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/sofia/memory?active=false&limit=50")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && Array.isArray(body?.memories)) setPendingMemoryCount(body.memories.length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const decide = (id: string, opt: string) => {
    const d = decisions.find((x) => x.id === id);
    const status = os.resolveDecision(id, opt);
    if (d?.effect === "toggle-voice") set("voice", /on/i.test(opt));
    if (d?.effect === "edit-context" && /set/i.test(opt)) {
      const v = window.prompt("This week's focus — one sentence:", "");
      if (v && v.trim()) os.setCompany({ focus: v.trim() });
    }
    if (status === "pending") { onSpeak(`Sent to the governance gate: ${d?.title ?? "decision"} → ${opt}. I'll confirm once the server records it.`); return; }
    onSpeak(status === "approved" ? `${d?.title ?? "Decision"}: ${opt}.` : `Deferred: ${d?.title ?? "decision"}.`);
  };

  // V2.1 Progressive Disclosure: Calm collapsed trigger pill by default
  if (!open) {
    const hasDecisions = decisions.length > 0;
    const hasAttention = attention.length > 0;
    const hasMemories = pendingMemoryCount > 0;
    return (
      <div className="pointer-events-auto">
        <button
          onClick={() => setOpen(true)}
          className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-medium tracking-wide backdrop-blur-xl transition-all duration-300 active:scale-95 ${
            hasDecisions
              ? "border-amber-300/40 bg-[#0c1524]/90 text-amber-100 shadow-[0_0_24px_-4px_rgba(251,191,36,0.35)]"
              : hasAttention || hasMemories
              ? "border-cyan-300/30 bg-[#081220]/90 text-cyan-100 shadow-[0_0_20px_-4px_rgba(56,189,248,0.3)]"
              : "border-white/10 bg-[#040a14]/75 text-slate-300 shadow-[0_4px_20px_rgba(0,0,0,0.5)] hover:border-cyan-300/30 hover:text-white"
          }`}
        >
          {hasDecisions ? (
            <Scale size={13} className="text-amber-300 animate-pulse" />
          ) : hasAttention ? (
            <AlertTriangle size={13} className="text-cyan-300" />
          ) : hasMemories ? (
            <BrainCircuit size={13} className="text-cyan-300" />
          ) : (
            <Sparkles size={13} className="text-cyan-300" />
          )}
          <span>
            {hasDecisions
              ? `${decisions.length} Decision${decisions.length > 1 ? "s" : ""} waiting`
              : hasAttention
              ? `${attention.length} Item${attention.length > 1 ? "s" : ""} need you`
              : hasMemories
              ? `${pendingMemoryCount} memor${pendingMemoryCount > 1 ? "ies" : "y"} to review`
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
              <EmptyState title="No open decisions" description="All governance checks are verified and clear." />
            ) : (
              <div className="space-y-2.5">
                {decisions.map((d) => (
                  <DecisionSurface
                    key={d.id}
                    decision={decisionToDecisionData(d)}
                    onDecide={(opt) => decide(d.id, opt)}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* ---- Needs you (Notice -> Understand -> Triage) ---- */}
          <Section title="Needs you" count={attention.length} defaultOpen={decisions.length === 0}>
            {attention.length === 0 ? (
              <EmptyState title="All clear" description="Nothing needs your immediate attention." />
            ) : (
              <div className="space-y-2">
                {attention.slice(0, 6).map((a) => (
                  <AttentionSurface
                    key={a.id}
                    attention={attentionToAttentionData(a)}
                    onResolve={() => os.handleAttention(a.id)}
                  />
                ))}
                {attention.length > 6 && <p className="text-[10.5px] text-slate-500 pt-1">+{attention.length - 6} more in SamJuniorsOS</p>}
              </div>
            )}
          </Section>

          {/* ---- Memory Review (M4-A hardening: pending capture candidates) ---- */}
          <Section title="Memory review" count={pendingMemoryCount} defaultOpen={false} icon={<BrainCircuit size={11} />}>
            <MemoryReview onCount={setPendingMemoryCount} />
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
