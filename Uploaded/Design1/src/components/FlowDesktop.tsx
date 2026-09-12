import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bot, ListTree, PackageCheck, ClipboardList, Scale, ChevronDown, Check,
  ZoomIn, ZoomOut, Maximize, Crosshair, PanelLeftClose, PanelRightClose, Layers,
  MousePointer2, X, Activity, Hand, Map as MapIcon, AlertTriangle, Circle, StickyNote,
  Building2, Pencil, ArrowRight, Flag, ShieldCheck, Play, Pause, MessageSquare,
  Coins, FileText,
} from "lucide-react";
import { FlowEngine, WORLD, deriveGraph, type FlowNode, type SpatialCard } from "../lib/flow";
import { osSound } from "../lib/osAudio";
import {
  os, useOS, openAttention, openDecisions, activeWork, agentName,
  type AttentionKind, type Agent, STAGES,
} from "../lib/osStore";
import { MetricSurface, TimelineSurface } from "./surfaces/StandardSurfaces";
import { generateSystemMetrics, generateCompanyMilestones } from "../lib/surfaceSchema";

/* ------------------------------------------------------------- node meta */

type Meta = { title: string; sub: string; icon: ReactNode; tint?: string; desc: string; agent?: string };

const META: Record<string, Meta> = {
  founder: {
    title: "Founder / Inputs",
    sub: "Directives & Authority",
    icon: <Building2 size={26} strokeWidth={1.8} />,
    tint: "#38bdf8",
    desc: "Founder authority boundary. High-level strategic directives, focus setting, and consequential approval gates originate here.",
  },
  core: {
    title: "Sophia",
    sub: "COO & Orchestrator",
    icon: <Bot size={28} strokeWidth={1.8} />,
    tint: "#fb923c",
    desc: "Deconstructs founder directives, dispatches workstreams to governed specialists, and brings only verified outcomes or escalated decisions to you.",
    agent: "sophia",
  },
  ops: {
    title: "Dr. Aris Thorne",
    sub: "Research & Intelligence",
    icon: <ClipboardList size={26} strokeWidth={1.8} />,
    tint: "#38bdf8",
    desc: "Executes structured research, competitive reconnaissance, and intelligence synthesis to produce typed artifacts.",
    agent: "ops",
  },
  finance: {
    title: "Julian Cruz",
    sub: "Finance & Unit Economics",
    icon: <Coins size={26} strokeWidth={1.8} />,
    tint: "#34d399",
    desc: "Governs deterministic unit economics, 80%+ gross margin floor verification, financial models, and pricing guardrails.",
    agent: "finance",
  },
  pm: {
    title: "Maya Lin",
    sub: "Product Architecture & PRD",
    icon: <FileText size={26} strokeWidth={1.8} />,
    tint: "#c084fc",
    desc: "Transforms research intelligence into structured PRDs, technical scope, acceptance criteria, and DAG protocol milestones.",
    agent: "pm",
  },
  verification: {
    title: "Constitutional Verifier",
    sub: "Deterministic Safety Gate",
    icon: <ShieldCheck size={26} strokeWidth={1.8} />,
    tint: "#34d399",
    desc: "Deterministic verification engine: Gross margin floor ≥ 80.0%, safe mock isolation, and single-use cryptographic signature binding.",
  },
  outcome: {
    title: "Governed Outcome",
    sub: "Immutable Vault",
    icon: <PackageCheck size={26} strokeWidth={1.8} />,
    tint: "#34d399",
    desc: "Cryptographically verified deliverables and historical outcomes safely committed to durable company memory.",
  },
  approval: {
    title: "Founder Approval Gate",
    sub: "Consequential Decision",
    icon: <Scale size={26} strokeWidth={1.8} />,
    tint: "#fbbf24",
    desc: "Consequential external, resource, or security actions require authenticated Founder ratification before proceeding.",
  },
  "workflow-standby": {
    title: "Workflow Engine",
    sub: "Standby · Ready",
    icon: <ListTree size={26} strokeWidth={1.8} />,
    tint: "#94a3b8",
    desc: "Active workflow runtime standing by. Directives from Sophia dispatch structured workstreams through this channel.",
  },
};

const getMeta = (n: FlowNode): Meta => {
  if (n.type === "workflow") {
    const stepLabel = n.subtitle ?? "Protocol Step";
    return {
      title: n.title,
      sub: stepLabel,
      icon: <Activity size={24} strokeWidth={1.8} />,
      tint: n.state === "blocked" ? "#fb7185" : n.state === "complete" ? "#34d399" : n.state === "active" ? "#38bdf8" : "#94a3b8",
      desc: n.activity ?? `${stepLabel} actively governed under SamJuniorsOS protocol invariants.`,
      agent: n.owner,
    };
  }
  if (n.type === "approval") {
    return {
      title: n.title,
      sub: n.subtitle ?? "Founder Ratification",
      icon: <Scale size={26} strokeWidth={1.8} />,
      tint: "#fbbf24",
      desc: "Consequential action requires authenticated Founder approval before release.",
    };
  }
  if (n.type === "verification") {
    return {
      title: n.title,
      sub: n.subtitle ?? "Constitutional Verifier",
      icon: <ShieldCheck size={26} strokeWidth={1.8} />,
      tint: n.state === "blocked" ? "#fb7185" : "#34d399",
      desc: "Deterministic verification engine: Gross margin floor ≥ 80.0%, mock sandbox isolation, single-use cryptographic signature binding.",
    };
  }
  if (n.type === "outcome") {
    return {
      title: n.title,
      sub: n.subtitle ?? "Immutable Vault",
      icon: <PackageCheck size={26} strokeWidth={1.8} />,
      tint: "#34d399",
      desc: "Historical deliverables with cryptographic verification signatures committed to company memory.",
    };
  }
  return META[n.id] ?? {
    title: n.title,
    sub: n.subtitle ?? "",
    icon: <Bot size={26} strokeWidth={1.8} />,
    tint: "#38bdf8",
    desc: n.activity ?? "Governed operating node.",
  };
};

const EASE = "cubic-bezier(.16,1,.3,1)";
const MIN_K = 0.16;
const MAX_K = 2.4;

/* ------------------------------------------------------------------ nodes */

function NodeCard({ n, selected, badge, onClick, onDoubleClick }: {
  n: FlowNode; selected?: boolean; badge?: ReactNode; onClick?: (n: FlowNode) => void; onDoubleClick?: (n: FlowNode) => void;
}) {
  const m = getMeta(n);

  // 1. Sophia Core (Centerpiece Orchestrator)
  if (n.kind === "core") {
    const isActive = n.state === "active";
    const isBlocked = n.state === "blocked";
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick?.(n); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(n); }}
        className={`group absolute flex cursor-pointer select-none items-center justify-center gap-3 rounded-2xl border text-white transition-all duration-200 hover:-translate-y-1 active:scale-95 ${
          selected
            ? "border-orange-200/90 ring-2 ring-orange-400/50"
            : isBlocked
            ? "border-rose-400/80 shadow-[0_0_30px_rgba(244,63,94,0.4)]"
            : isActive
            ? "border-orange-300/80 shadow-[0_0_40px_rgba(255,140,60,0.5)]"
            : "border-orange-300/40"
        }`}
        style={{
          left: n.x - n.w / 2, top: n.y - n.h / 2, width: n.w, height: n.h,
          background: "linear-gradient(160deg, rgba(60,40,30,0.95), rgba(25,18,14,0.98))",
          boxShadow: selected
            ? "inset 0 0 30px rgba(255,140,60,0.4), 0 0 60px rgba(255,120,40,0.65), 0 0 0 2px rgba(255,200,140,0.5)"
            : isActive
            ? "inset 0 0 30px rgba(255,140,60,0.35), 0 0 45px rgba(255,120,40,0.45)"
            : "inset 0 0 20px rgba(255,140,60,0.15), 0 0 25px rgba(0,0,0,0.6)",
        }}
      >
        <span className="text-orange-100 drop-shadow-[0_0_12px_rgba(255,170,80,0.9)] transition-transform duration-200 group-hover:scale-110">{m.icon}</span>
        <div className="leading-[1.05] drop-shadow-[0_0_14px_rgba(255,190,120,0.8)]">
          <div className="text-[21px] font-semibold tracking-[-0.01em]">Sophia</div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-orange-100/80">Planner</div>
        </div>
        {badge}
        {selected && <span className="pointer-events-none absolute -inset-2 animate-pulse rounded-3xl border border-orange-200/40" />}
      </div>
    );
  }

  // 2. Round Nodes (Dr. Thorne, Julian Cruz, Maya Lin & Constitutional Verifier)
  if (n.kind === "round") {
    const isVerifier = n.type === "verification";
    const isFinance = n.id === "finance";
    const isPm = n.id === "pm";
    const isAct = n.state === "active";
    const isBlk = n.state === "blocked";
    const isComp = n.state === "complete";

    const borderColor = selected
      ? "1px solid rgba(160,230,255,0.95)"
      : isBlk
      ? "1px solid rgba(244,63,94,0.8)"
      : isComp
      ? "1px solid rgba(52,211,153,0.7)"
      : isFinance
      ? "1px solid rgba(52,211,153,0.8)"
      : isPm
      ? "1px solid rgba(192,132,252,0.8)"
      : isAct
      ? "1px solid rgba(56,189,248,0.85)"
      : "1px solid rgba(120,190,255,0.4)";

    const shadow = selected
      ? "0 0 34px rgba(103,232,249,0.6), inset 0 0 18px rgba(103,232,249,0.3)"
      : isBlk
      ? "0 0 28px rgba(244,63,94,0.45), inset 0 0 16px rgba(244,63,94,0.25)"
      : isComp || isFinance
      ? "0 0 28px rgba(52,211,153,0.4), inset 0 0 16px rgba(52,211,153,0.2)"
      : isPm
      ? "0 0 28px rgba(192,132,252,0.4), inset 0 0 16px rgba(192,132,252,0.2)"
      : isAct
      ? "0 0 30px rgba(56,189,248,0.5), inset 0 0 16px rgba(56,189,248,0.25)"
      : "0 10px 25px rgba(0,0,0,0.5), inset 0 0 14px rgba(56,189,248,0.15)";

    const bgGradient = isVerifier
      ? "radial-gradient(circle at 50% 40%, rgba(20,55,45,0.94), rgba(8,20,16,0.98))"
      : isFinance
      ? "radial-gradient(circle at 50% 40%, rgba(18,50,40,0.94), rgba(7,20,16,0.98))"
      : isPm
      ? "radial-gradient(circle at 50% 40%, rgba(55,22,75,0.94), rgba(20,8,28,0.98))"
      : "radial-gradient(circle at 50% 40%, rgba(35,65,115,0.94), rgba(12,20,38,0.98))";

    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick?.(n); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(n); }}
        className="group absolute cursor-pointer select-none"
        style={{ left: n.x - 90, top: n.y - n.h / 2, width: 180 }}
      >
        <div
          className={`relative mx-auto flex items-center justify-center rounded-full text-white transition-all duration-200 group-hover:-translate-y-1 group-hover:scale-105 active:scale-95 ${selected ? "ring-2 ring-cyan-200/80" : ""}`}
          style={{
            width: n.w, height: n.h,
            color: m.tint ?? "#f3f7ff",
            background: bgGradient,
            border: borderColor,
            boxShadow: shadow,
          }}
        >
          <span className="transition-transform duration-200 group-hover:scale-110">{m.icon}</span>
          {badge}
        </div>
        <div className="pointer-events-none mt-2 text-center">
          <div className={`text-[14.5px] font-semibold leading-[1.15] tracking-[-0.008em] transition-colors ${selected ? "text-cyan-100" : "text-white group-hover:text-cyan-100"}`} style={{ textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>
            {m.title}
          </div>
          {m.sub && <div className="mt-0.5 text-[10.5px] text-slate-300/90" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.9)" }}>{m.sub}</div>}
        </div>
      </div>
    );
  }

  // 3. Workflow Card (Tasks in active progression)
  if (n.type === "workflow") {
    const isAct = n.state === "active";
    const isBlk = n.state === "blocked";
    const isComp = n.state === "complete";
    const stepLabel = n.protocolStep ? n.protocolStep.replace("step-", "").toUpperCase() : "PROTOCOL";

    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick?.(n); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(n); }}
        className={`group absolute cursor-pointer select-none rounded-2xl border p-2.5 transition-all duration-200 hover:-translate-y-1 active:scale-95 ${
          selected
            ? "border-cyan-200/90 ring-2 ring-cyan-300/60 shadow-[0_0_30px_rgba(56,189,248,0.45)]"
            : isBlk
            ? "border-rose-400/70 shadow-[0_0_24px_rgba(244,63,94,0.35)]"
            : isComp
            ? "border-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.25)]"
            : isAct
            ? "border-cyan-300/70 shadow-[0_0_28px_rgba(56,189,248,0.35)]"
            : "border-white/12 shadow-[0_8px_20px_rgba(0,0,0,0.4)]"
        }`}
        style={{
          left: n.x - n.w / 2, top: n.y - n.h / 2, width: n.w, height: n.h,
          background: isBlk
            ? "linear-gradient(160deg, rgba(45,16,22,0.96), rgba(20,8,12,0.98))"
            : isComp
            ? "linear-gradient(160deg, rgba(16,40,30,0.96), rgba(8,20,16,0.98))"
            : isAct
            ? "linear-gradient(160deg, rgba(20,40,70,0.96), rgba(10,20,38,0.98))"
            : "linear-gradient(160deg, rgba(32,38,50,0.96), rgba(18,22,30,0.98))",
        }}
      >
        <div className="flex items-center justify-between gap-1">
          <span className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${
            isBlk ? "bg-rose-400/20 text-rose-200" : isComp ? "bg-emerald-400/20 text-emerald-200" : isAct ? "bg-cyan-400/20 text-cyan-200" : "bg-white/10 text-slate-300"
          }`}>
            {stepLabel}
          </span>
          <span className={`h-2 w-2 rounded-full ${isBlk ? "bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.9)]" : isComp ? "bg-emerald-400" : isAct ? "animate-pulse bg-cyan-400 shadow-[0_0_6px_rgba(56,189,248,0.9)]" : "bg-slate-600"}`} />
        </div>
        <div className="mt-1.5 truncate text-[12.5px] font-semibold text-white group-hover:text-cyan-100">
          {n.title}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
          <span className="truncate max-w-[95px]">{n.subtitle ?? (n.owner ? agentName(n.owner) : "Governed")}</span>
          <span className={`font-mono font-semibold ${isBlk ? "text-rose-300" : isComp ? "text-emerald-300" : isAct ? "text-cyan-200" : "text-slate-400"}`}>
            {isAct ? "ACTIVE" : isBlk ? "BLOCKED" : isComp ? "DONE" : "WAITING"}
          </span>
        </div>
      </div>
    );
  }

  // 4. Founder Approval Gate
  if (n.type === "approval") {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick?.(n); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(n); }}
        className={`group absolute cursor-pointer select-none rounded-2xl border p-3 transition-all duration-200 hover:-translate-y-1 active:scale-95 ${
          selected ? "border-amber-200 ring-2 ring-amber-300/60" : "border-amber-300/60 shadow-[0_0_35px_rgba(245,158,11,0.35)]"
        }`}
        style={{
          left: n.x - n.w / 2, top: n.y - n.h / 2, width: n.w, height: n.h,
          background: "linear-gradient(160deg, rgba(48,32,10,0.96), rgba(24,16,6,0.98))",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-amber-300">
            <Scale size={16} />
            <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-amber-200">APPROVAL GATE</span>
          </span>
          <span className="h-2 w-2 animate-ping rounded-full bg-amber-400" />
        </div>
        <div className="mt-1 truncate text-[13px] font-semibold text-white">
          {n.activity ?? n.title}
        </div>
        <div className="mt-0.5 text-[10.5px] text-amber-100/75">
          {n.subtitle ?? "Ratification required"}
        </div>
      </div>
    );
  }

  // 5. Standard Card (Founder / Outcome)
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(n); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(n); }}
      className={`group absolute flex cursor-pointer select-none flex-col justify-center rounded-2xl border p-3 text-white transition-all duration-200 hover:-translate-y-1 active:scale-95 ${
        selected ? "border-cyan-200 ring-2 ring-cyan-300/60" : "border-white/14 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
      }`}
      style={{
        left: n.x - n.w / 2, top: n.y - n.h / 2, width: n.w, height: n.h,
        background: n.type === "outcome"
          ? "linear-gradient(160deg, rgba(18,42,32,0.96), rgba(10,22,16,0.98))"
          : "linear-gradient(160deg, rgba(42,50,68,0.96), rgba(20,24,34,0.98))",
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ color: m.tint ?? "#f3f7ff" }}>{m.icon}</span>
        {badge}
      </div>
      <div className="mt-1.5 truncate text-[13px] font-semibold text-white group-hover:text-cyan-100">
        {m.title}
      </div>
      {m.sub && <div className="truncate text-[10px] text-slate-300/80">{m.sub}</div>}
    </div>
  );
}

function SpatialCardOverlay({ card }: { card: SpatialCard }) {
  const toneClasses = card.tone === "amber"
    ? "border-amber-400/40 bg-[#120d04]/94 text-amber-200 shadow-[0_8px_28px_rgba(245,158,11,0.3)]"
    : card.tone === "rose"
    ? "border-rose-400/40 bg-[#140608]/94 text-rose-200 shadow-[0_8px_28px_rgba(244,63,94,0.3)]"
    : card.tone === "emerald"
    ? "border-emerald-400/40 bg-[#04140c]/94 text-emerald-200 shadow-[0_8px_28px_rgba(16,185,129,0.3)]"
    : "border-cyan-400/40 bg-[#06101e]/94 text-cyan-200 shadow-[0_8px_28px_rgba(56,189,248,0.3)]";

  const dotClass = card.tone === "amber"
    ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)]"
    : card.tone === "rose"
    ? "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.9)]"
    : card.tone === "emerald"
    ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]"
    : "bg-cyan-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]";

  return (
    <div
      className={`pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-1.5 text-[11px] backdrop-blur-md transition-all duration-300 ${toneClasses}`}
      style={{ left: card.x, top: card.y, animation: `os-in 240ms ${EASE}` }}
    >
      <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${dotClass}`} />
      <span className="font-semibold text-white">{card.actor}:</span>
      <span className="opacity-90">{card.action}</span>
      {card.target && (
        <span className="flex items-center gap-1 font-medium text-white/80">
          <span>➜</span>
          <span>{card.target}</span>
        </span>
      )}
    </div>
  );
}

function CountBadge({ n, tone = "cyan" }: { n: number; tone?: "cyan" | "amber" | "rose" }) {
  if (!n) return null;
  const c = tone === "amber"
    ? "bg-amber-300 text-[#1a1200] shadow-[0_0_10px_rgba(252,211,77,0.8)]"
    : tone === "rose"
    ? "bg-rose-400 text-white shadow-[0_0_10px_rgba(251,113,133,0.8)]"
    : "bg-cyan-300 text-[#04121b] shadow-[0_0_10px_rgba(103,232,249,0.8)]";
  return <span className={`tnum absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold ${c}`}>{n}</span>;
}

function StateDot({ state }: { state: Agent["state"] }) {
  const c = state === "working"
    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
    : state === "waiting"
    ? "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.9)]"
    : state === "offline"
    ? "bg-slate-600"
    : "bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.8)]";
  return <span className={`absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border-2 border-[#0a1120] ${c}`} />;
}

/* ------------------------------------------------------------------ panels */

function SideCard({ title, icon, count, tone, children, defaultOpen = true, action }: {
  title: string; icon?: ReactNode; count?: number; tone?: "amber" | "cyan"; children: ReactNode; defaultOpen?: boolean; action?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="shrink-0 rounded-2xl border border-white/10 bg-[#0a1120]/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_-18px_rgba(0,0,0,0.75)] backdrop-blur-md">
      <div className="flex items-center justify-between pr-2">
        <button type="button" onClick={() => { osSound.click(); setOpen((o) => !o); }} className="flex flex-1 items-center justify-between px-4 py-3 text-left">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/90">
            {icon && <span className="text-cyan-300/80">{icon}</span>}{title}
            {!!count && <span className={`tnum rounded-full px-1.5 py-px font-mono text-[10px] ${tone === "amber" ? "bg-amber-300/15 text-amber-100" : "bg-cyan-300/15 text-cyan-100"}`}>{count}</span>}
          </span>
          <ChevronDown size={14} className={`text-white/40 transition-transform duration-300 ${open ? "" : "-rotate-90"}`} />
        </button>
        {action}
      </div>
      <div className="overflow-hidden" style={{ maxHeight: open ? 720 : 0, opacity: open ? 1 : 0, transition: `max-height 420ms ${EASE}, opacity 280ms ease` }}>
        <div className="px-4 pb-4">{children}</div>
      </div>
    </section>
  );
}

const KIND_ICON: Record<AttentionKind, ReactNode> = {
  decision: <Scale size={12} />, review: <Circle size={12} />, blocked: <AlertTriangle size={12} />, message: <MessageSquare size={12} />, note: <StickyNote size={12} />,
};
const KIND_TINT: Record<AttentionKind, string> = {
  decision: "text-cyan-200 border-cyan-300/30 bg-cyan-300/10",
  review: "text-slate-200 border-white/15 bg-white/5",
  blocked: "text-rose-200 border-rose-300/30 bg-rose-400/10",
  message: "text-violet-200 border-violet-300/30 bg-violet-400/10",
  note: "text-amber-100 border-amber-300/25 bg-amber-300/10",
};

function timeAgo(t: number) {
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function AttentionList() {
  const items = useOS(openAttention);
  if (!items.length) return <p className="py-1 text-[12px] text-slate-500">Nothing needs you right now.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((a) => (
        <li key={a.id} className="group flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 transition hover:border-white/15">
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${KIND_TINT[a.kind]}`}>{KIND_ICON[a.kind]}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] text-slate-100">{a.title}</span>
            {a.detail && <span className="block truncate text-[11px] text-slate-500">{a.detail}</span>}
            <span className="block text-[10px] uppercase tracking-[0.12em] text-slate-600">{agentName(a.from)} · {timeAgo(a.at)}</span>
          </span>
          <button onClick={() => { osSound.click(); os.handleAttention(a.id); }} title="Mark handled" className="rounded-md p-1 text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-cyan-200 group-hover:opacity-100"><Check size={12} /></button>
        </li>
      ))}
    </ul>
  );
}

function DecisionList({ onVoice }: { onVoice?: (on: boolean) => void }) {
  const items = useOS(openDecisions);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const decide = (id: string, opt: string) => {
    osSound.click();
    const d = items.find((x) => x.id === id);
    os.resolveDecision(id, opt);
    if (d?.effect === "toggle-voice") onVoice?.(/on/i.test(opt));
    if (d?.effect === "edit-context" && /set/i.test(opt)) {
      const v = window.prompt("This week's focus — one sentence:", "");
      if (v && v.trim()) os.setCompany({ focus: v.trim() });
    }
  };
  return (
    <div>
      {!items.length && <p className="py-1 text-[12px] text-slate-500">No open decisions.</p>}
      <ul className="space-y-2">
        {items.map((d) => (
          <li key={d.id} className="rounded-xl border border-cyan-200/15 bg-cyan-300/[0.04] p-2.5">
            <div className="text-[12.5px] font-medium text-white">{d.title}</div>
            {d.context && <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{d.context}</div>}
            <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-600">raised by {agentName(d.raisedBy)} · {timeAgo(d.at)}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {d.options.map((opt, i) => (
                <button key={opt} onClick={() => decide(d.id, opt)} className={`rounded-md border px-2 py-1 text-[10.5px] uppercase tracking-[0.12em] transition active:scale-95 ${i === 0 ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25" : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/25"}`}>{opt}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {adding ? (
        <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { os.addDecision(draft.trim()); osSound.open(); } setDraft(""); setAdding(false); }} className="mt-2 flex items-center gap-2 rounded-lg border border-cyan-200/30 bg-white/[0.03] px-2 py-1.5">
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (!draft.trim()) setAdding(false); }} placeholder="What needs deciding?" className="w-full bg-transparent text-[12px] text-white outline-none placeholder:text-slate-500" />
          <button type="submit" className="text-cyan-200"><ArrowRight size={13} /></button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 w-full rounded-lg border border-dashed border-white/10 px-2 py-1.5 text-[11px] text-slate-500 transition hover:border-cyan-200/30 hover:text-cyan-100">+ Raise a decision</button>
      )}
    </div>
  );
}

function WorkforceList({ onOpen }: { onOpen: (id: string) => void }) {
  const agents = useOS((s) => s.agents);
  const label: Record<Agent["state"], string> = { ready: "Ready", working: "Working", waiting: "Waiting on you", offline: "Offline" };
  return (
    <ul className="space-y-1">
      {agents.map((a) => (
        <li key={a.id}>
          <button onClick={() => { osSound.click(); onOpen(a.id); }} className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition hover:bg-white/[0.05]">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]" style={{ boxShadow: `0 0 14px -4px ${a.glow}` }}>
              <Bot size={15} className={a.tint} />
              <StateDot state={a.state} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[12.5px] text-slate-100">{a.name}<span className="text-[10px] text-slate-500">· {a.role}</span></span>
              <span className={`block truncate text-[10.5px] ${a.state === "waiting" ? "text-amber-200" : "text-slate-500"}`}>{a.current ? a.current : label[a.state]}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CompanyCard({ onClose }: { onClose: () => void }) {
  const company = useOS((s) => s.company);
  const edit = (field: "oneLiner" | "focus", label: string) => {
    const v = window.prompt(label, company[field]);
    if (v !== null) os.setCompany({ [field]: v.trim() });
  };
  return (
    <div className="w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/12 bg-[#08101e]/95 p-4 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85)] backdrop-blur-2xl" style={{ animation: `os-in 180ms ${EASE}` }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04]"><Building2 size={16} className="text-cyan-200" /></span>
          <div>
            <div className="text-[14px] font-semibold text-white">{company.name}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Company context</div>
          </div>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-white"><X size={13} /></button>
      </div>
      <dl className="mt-3 space-y-2.5">
        <div>
          <dt className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500">What we do <button onClick={() => edit("oneLiner", "One line: what does the company do?")} className="text-slate-500 hover:text-cyan-200"><Pencil size={11} /></button></dt>
          <dd className={`mt-0.5 text-[12.5px] ${company.oneLiner ? "text-slate-200" : "text-slate-600 italic"}`}>{company.oneLiner || "Not set — add one line."}</dd>
        </div>
        <div>
          <dt className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500">This week's focus <button onClick={() => edit("focus", "This week's focus — one sentence:")} className="text-slate-500 hover:text-cyan-200"><Pencil size={11} /></button></dt>
          <dd className={`mt-0.5 text-[12.5px] ${company.focus ? "text-cyan-100" : "text-slate-600 italic"}`}>{company.focus || "Not set — everything is ranked against it."}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Operating principles</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">{company.principles.map((p) => <span key={p} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-300">{p}</span>)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Guardrails</dt>
          <dd className="mt-1 space-y-0.5">{company.constraints.map((c) => <div key={c} className="text-[11.5px] text-slate-400">· {c}</div>)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Minimap({ vw, vh, k, pan, nodes, onJump }: {
  vw: number; vh: number; k: number; pan: { x: number; y: number }; nodes: FlowNode[]; onJump: (wx: number, wy: number) => void
}) {
  const MW = 132, MH = 84;
  const ms = Math.min(MW / WORLD.W, MH / WORLD.H);
  const ox = (MW - WORLD.W * ms) / 2, oy = (MH - WORLD.H * ms) / 2;
  const toMini = (wx: number, wy: number) => ({ x: ox + (wx - (WORLD.CX - WORLD.W / 2)) * ms, y: oy + (wy - (WORLD.CY - WORLD.H / 2)) * ms });
  const tx = vw / 2 + pan.x - WORLD.CX * k;
  const ty = vh / 2 + pan.y - WORLD.CY * k;
  const a = toMini((0 - tx) / k, (0 - ty) / k), b = toMini((vw - tx) / k, (vh - ty) / k);

  return (
    <div className="overflow-hidden rounded-xl border border-white/12 bg-[#060c18]/90 shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur-md">
      <svg width={MW} height={MH} className="block cursor-crosshair" onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          onJump((e.clientX - r.left - ox) / ms + (WORLD.CX - WORLD.W / 2), (e.clientY - r.top - oy) / ms + (WORLD.CY - WORLD.H / 2));
        }}>
        <rect x={0} y={0} width={MW} height={MH} fill="rgba(10,20,36,0.6)" />
        {nodes.map((n) => {
          const p = toMini(n.x, n.y);
          const color = n.id === "core"
            ? "#fb923c"
            : n.state === "blocked"
            ? "#fb7185"
            : n.state === "complete"
            ? "#34d399"
            : n.type === "approval"
            ? "#fbbf24"
            : n.id === "finance"
            ? "#34d399"
            : n.id === "pm"
            ? "#c084fc"
            : "#7dd3fc";
          return <circle key={n.id} cx={p.x} cy={p.y} r={n.id === "core" ? 3.4 : n.kind === "round" ? 2.4 : 1.8} fill={color} opacity={0.9} />;
        })}
        <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.max(6, Math.abs(b.x - a.x))} height={Math.max(6, Math.abs(b.y - a.y))} fill="rgba(103,232,249,0.12)" stroke="rgba(103,232,249,0.7)" strokeWidth={1} rx={2} />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------- component */

export default function FlowDesktop({
  focus = false, onPanelOpen, onNodeClick, onOpenAgent, voice: _voice = false, onVoice, onToggleWork,
}: {
  focus?: boolean;
  onPanelOpen?: () => void;
  onNodeClick?: (node: FlowNode) => void;
  onOpenAgent?: (id: string) => void;
  voice?: boolean;
  onVoice?: (on: boolean) => void;
  onToggleWork?: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<FlowEngine | null>(null);
  const cursorRef = useRef<HTMLSpanElement | null>(null);

  const [vw, setVw] = useState(900);
  const [vh, setVh] = useState(560);
  const [cam, setCam] = useState({ x: 0, y: 0, k: 0.55 });
  const [selected, setSelected] = useState<FlowNode | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [leftOpen, setLeftOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 1024 : true));
  const [rightOpen, setRightOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 1280 : true));
  const [gridOn, setGridOn] = useState(true);
  const [mapOn, setMapOn] = useState(true);
  const [spaceDown, setSpaceDown] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);

  const attention = useOS(openAttention);
  const decisions = useOS(openDecisions);
  const work = useOS(activeWork);
  const agents = useOS((s) => s.agents);
  const company = useOS((s) => s.company);
  const osState = useOS((s) => s);

  // Dynamically derive genuine living SamJuniorsOS graph
  const graph = useMemo(() => deriveGraph(osState), [osState]);

  const metrics = generateSystemMetrics(osState);
  const milestones = generateCompanyMilestones();

  const vwRef = useRef(vw), vhRef = useRef(vh), camRef = useRef(cam), spaceRef = useRef(false);
  const didFit = useRef(false), baseFit = useRef(0.55);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; k: number; mx: number; my: number; px: number; py: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const animId = useRef(0);
  vwRef.current = vw; vhRef.current = vh; camRef.current = cam;

  const tx = vw / 2 + cam.x - WORLD.CX * cam.k;
  const ty = vh / 2 + cam.y - WORLD.CY * cam.k;

  useEffect(() => {
    const engine = new FlowEngine(canvasRef.current!);
    engineRef.current = engine;
    engine.setGraph(graph);
    engine.start();
    return () => engine.stop();
  }, []);

  useEffect(() => {
    engineRef.current?.setGraph(graph);
  }, [graph]);

  useEffect(() => {
    const el = viewportRef.current!;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(240, r.width), h = Math.max(240, r.height);
      setVw(w); setVh(h);
      if (!didFit.current && w > 10 && h > 10) {
        didFit.current = true;
        const k = Math.min(MAX_K, Math.max(MIN_K, Math.min(w / WORLD.W, h / WORLD.H) * 0.94));
        baseFit.current = k;
        setCam({ x: 0, y: 0, k });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { engineRef.current?.setViewport(vw, vh, cam.k, tx, ty); }, [vw, vh, cam, tx, ty]);
  useEffect(() => { const t = setTimeout(() => setShowHint(false), 6500); return () => clearTimeout(t); }, []);
  useEffect(() => () => cancelAnimationFrame(animId.current), []);

  const clamp = (x: number, y: number, k: number) => {
    const mx = (WORLD.W * k) / 2 + vwRef.current / 2 + 120, my = (WORLD.H * k) / 2 + vhRef.current / 2 + 120;
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)), k };
  };

  const animateTo = useCallback((target: { x: number; y: number; k: number }, dur = 380) => {
    cancelAnimationFrame(animId.current);
    const start = { ...camRef.current };
    const end = clamp(target.x, target.y, Math.min(MAX_K, Math.max(MIN_K, target.k)));
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      setCam({ x: start.x + (end.x - start.x) * e, y: start.y + (end.y - start.y) * e, k: start.k + (end.k - start.k) * e });
      if (t < 1) animId.current = requestAnimationFrame(tick);
    };
    animId.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomAt = useCallback((mx: number, my: number, factor: number) => {
    const vw = vwRef.current, vh = vhRef.current;
    setCam((prev) => {
      const nk = Math.min(MAX_K, Math.max(MIN_K, prev.k * factor));
      if (Math.abs(nk - prev.k) < 1e-6) return prev;
      const f = nk / prev.k;
      return clamp(mx - vw / 2 - ((mx - vw / 2 - prev.x) * f), my - vh / 2 - ((my - vh / 2 - prev.y) * f), nk);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fitView = useCallback(() => { osSound.click(); animateTo({ x: 0, y: 0, k: Math.min(vwRef.current / WORLD.W, vhRef.current / WORLD.H) * 0.94 }); }, [animateTo]);
  const recenter = useCallback(() => { osSound.click(); animateTo({ x: 0, y: 0, k: camRef.current.k }); }, [animateTo]);
  const jumpTo = useCallback((wx: number, wy: number) => { osSound.click(); const k = camRef.current.k; animateTo({ x: -(wx - WORLD.CX) * k, y: -(wy - WORLD.CY) * k, k }, 320); }, [animateTo]);
  const focusNode = useCallback((n: FlowNode) => {
    const fit = Math.min(vwRef.current / WORLD.W, vhRef.current / WORLD.H) * 0.94;
    const k = Math.min(1.5, Math.max(camRef.current.k, fit * 1.7));
    animateTo({ x: -(n.x - WORLD.CX) * k, y: -(n.y - WORLD.CY) * k, k });
  }, [animateTo]);

  useEffect(() => {
    const el = viewportRef.current!;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0014)); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.code === "Space" && !typing) { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur?.(); spaceRef.current = true; setSpaceDown(true); return; }
      if (typing) return;
      const vw = vwRef.current, vh = vhRef.current;
      if (e.key === "+" || e.key === "=") zoomAt(vw / 2, vh / 2, 1.15);
      else if (e.key === "-" || e.key === "_") zoomAt(vw / 2, vh / 2, 1 / 1.15);
      else if (e.key === "0") fitView();
      else if (e.key === "Escape") { setSelected(null); setCompanyOpen(false); }
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 160 : 48;
        const dx = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
        const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
        setCam((p) => clamp(p.x + dx, p.y + dy, p.k));
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") { spaceRef.current = false; setSpaceDown(false); } };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomAt, fitView]);

  const isInteractive = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("button,input,a,textarea,.cursor-pointer");

  const updateCursorReadout = (clientX: number, clientY: number) => {
    const el = viewportRef.current; if (!el || !cursorRef.current) return;
    const r = el.getBoundingClientRect(); const c = camRef.current;
    const cTx = vwRef.current / 2 + c.x - WORLD.CX * c.k, cTy = vhRef.current / 2 + c.y - WORLD.CY * c.k;
    cursorRef.current.textContent = `${Math.round(((clientX - r.left) - cTx) / c.k)}, ${Math.round(((clientY - r.top) - cTy) / c.k)}`;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]; const r = viewportRef.current!.getBoundingClientRect(); const c = camRef.current;
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: c.k, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, px: c.x, py: c.y };
      panStart.current = null; return;
    }
    const forcePan = e.button === 1 || e.button === 2 || spaceRef.current;
    if (forcePan || (e.button === 0 && !isInteractive(e.target))) {
      if (e.button === 1) e.preventDefault();
      const c = camRef.current;
      panStart.current = { x: c.x, y: c.y, px: e.clientX, py: e.clientY, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    updateCursorReadout(e.clientX, e.clientY);
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]; const r = viewportRef.current!.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top, d = Math.hypot(a.x - b.x, a.y - b.y) || 1, base = pinch.current;
      const vw = vwRef.current, vh = vhRef.current;
      const nk = Math.min(MAX_K, Math.max(MIN_K, base.k * (d / base.d))), f = nk / base.k;
      setCam(clamp(mx - vw / 2 - ((base.mx - vw / 2 - base.px) * f) + (mx - base.mx), my - vh / 2 - ((base.my - vh / 2 - base.py) * f) + (my - base.my), nk));
      setShowHint(false); return;
    }
    const ps = panStart.current;
    if (ps) {
      const dx = e.clientX - ps.px, dy = e.clientY - ps.py;
      if (Math.abs(dx) + Math.abs(dy) > 3) { ps.moved = true; setShowHint(false); }
      setCam((p) => clamp(ps.x + dx, p.y + dy, p.k));
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    const ps = panStart.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) panStart.current = null;
    if (ps && !ps.moved && e.button === 0 && !spaceRef.current && !isInteractive(e.target)) setSelected(null);
  };

  const handleNodeClick = (n: FlowNode) => {
    osSound.open();
    engineRef.current?.arrive(n.id, n.x, n.y);
    setSelected(n);
    onNodeClick?.(n);
  };

  const effLeft = leftOpen && !focus, effRight = rightOpen && !focus;
  const zoomPct = Math.round((cam.k / Math.max(0.001, baseFit.current)) * 100);
  const gridMinor = 44 * cam.k, gridMajor = 220 * cam.k;
  const selMeta = selected ? getMeta(selected) : null;
  const selAgent = selMeta?.agent ? agents.find((a) => a.id === selMeta.agent) : undefined;
  const selWork = selected?.type === "workflow"
    ? work.find((w) => selected.id === `step-${w.id}` || selected.id === `workflow-${w.id}` || selected.title === w.title)
    : undefined;

  // Real per-node badges from state
  const badgeFor = (node: FlowNode): ReactNode => {
    if (node.type === "approval") return <CountBadge n={decisions.length} tone="amber" />;
    if (node.id === "core") return <CountBadge n={attention.length} tone={attention.length ? "amber" : "cyan"} />;
    if (node.id === "ops" || node.id === "finance" || node.id === "pm") {
      const ag = agents.find((a) => a.id === node.id);
      if (ag) return <StateDot state={ag.state} />;
    }
    return null;
  };

  return (
    <div className="flex h-full w-full flex-col gap-2 overflow-hidden bg-[#04060d] p-2 sm:gap-2.5 sm:p-2.5">
      {/* ============================ header ============================ */}
      <header className="relative z-30 flex h-[54px] shrink-0 items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-[#060c18]/90 px-2.5 backdrop-blur-md sm:px-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={() => { osSound.click(); setLeftOpen((v) => { if (!v) onPanelOpen?.(); return !v; }); }} title={effLeft ? "Hide attention" : "Show attention"} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10 hover:text-white active:scale-95 ${effLeft ? "text-cyan-200" : "text-slate-500"}`}><PanelLeftClose size={16} /></button>
          <button onClick={() => { osSound.click(); setCompanyOpen((v) => !v); }} className={`flex items-center gap-2.5 rounded-xl px-1.5 py-1 transition hover:bg-white/[0.05] ${companyOpen ? "bg-white/[0.06]" : ""}`} title="Company context">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.03]"><Building2 size={16} className="text-white" /></span>
            <span className="hidden text-left leading-none min-[420px]:block">
              <span className="block text-[15px] font-bold tracking-[0.18em] text-white">{company.name.toUpperCase()}</span>
              <span className="mt-1 block max-w-[220px] truncate text-[8.5px] tracking-[0.22em] text-slate-500">{company.focus ? `FOCUS · ${company.focus.toUpperCase()}` : "OPERATING ENVIRONMENT"}</span>
            </span>
            <ChevronDown size={12} className={`hidden text-slate-500 transition-transform sm:block ${companyOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] tracking-[0.18em] text-slate-400 md:flex">
          <Layers size={12} className="text-cyan-300" /> LIVING OPERATING GRAPH
          <span className="text-slate-700">·</span>
          <span className="tnum font-mono text-cyan-200">{zoomPct}%</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <div className="mr-1 hidden items-center gap-2 text-[10px] tracking-[0.2em] text-slate-300 sm:flex">
            {attention.length ? <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300 shadow-[0_0_8px_2px_rgba(252,211,77,0.8)]" /> {attention.length} NEED YOU</> : <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.8)]" /> ALL QUIET</>}
          </div>
          <button onClick={() => { osSound.click(); onToggleWork ? onToggleWork() : onPanelOpen?.(); }} title="Work drawer (T)" className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10.5px] uppercase tracking-[0.16em] text-slate-400 transition hover:bg-white/10 hover:text-cyan-200 active:scale-95"><Activity size={14} className="text-cyan-300" /><span className="hidden lg:inline">Work</span>{work.length > 0 && <span className="rounded-full bg-cyan-400/20 px-1.5 py-0.2 font-mono text-[9px] text-cyan-200">{work.length}</span>}</button>
          <button onClick={() => { osSound.click(); setRightOpen((v) => { if (!v) onPanelOpen?.(); return !v; }); }} title={effRight ? "Hide workforce" : "Show workforce"} className={`flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/10 hover:text-white active:scale-95 ${effRight ? "text-cyan-200" : "text-slate-500"}`}><PanelRightClose size={16} /></button>
        </div>

        {companyOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setCompanyOpen(false)} />
            <div className="absolute left-2 top-[60px] z-50">
              <CompanyCard onClose={() => setCompanyOpen(false)} />
            </div>
          </>
        )}
      </header>

      {/* ============================ main row ============================ */}
      <div className="relative flex min-h-0 flex-1 gap-2 sm:gap-2.5">
        {/* ---------------- left rail: attention + system ---------------- */}
        <aside
          className={`z-20 flex w-[256px] shrink-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden rounded-2xl border border-white/[0.08] bg-[#060c18]/80 p-3 backdrop-blur-md transition-all duration-500 [scrollbar-width:thin] max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:w-[278px] max-lg:border-white/12 max-lg:bg-[#060c18]/96 max-lg:shadow-[24px_0_60px_rgba(0,0,0,0.65)] ${effLeft ? "max-lg:translate-x-0" : "max-lg:-translate-x-[112%]"}`}
          style={effLeft ? undefined : { marginLeft: -268, opacity: 0, pointerEvents: "none" }}
        >
          <div className="w-[232px] max-lg:w-[254px]">
            <SideCard title="Needs you" icon={<AlertTriangle size={13} />} count={attention.length} tone="amber"
              action={attention.length ? <button onClick={() => { osSound.click(); os.clearHandled(); }} title="Clear handled" className="rounded-md p-1 text-slate-600 hover:text-slate-300"><Check size={12} /></button> : undefined}>
              <AttentionList />
            </SideCard>
          </div>
          <div className="w-[232px] max-lg:w-[254px]">
            <SideCard title="Invariants" icon={<Activity size={13} />} defaultOpen={false}>
              <div className="space-y-2">
                {metrics.map((m) => (
                  <MetricSurface key={m.id} metric={m} />
                ))}
              </div>
            </SideCard>
          </div>
          <div className="w-[232px] max-lg:w-[254px]">
            <SideCard title="Milestones" icon={<Flag size={13} />} defaultOpen={false}>
              <TimelineSurface milestones={milestones} />
            </SideCard>
          </div>
          <div className="mt-auto w-[232px] pt-1 text-[9px] tracking-[0.26em] text-slate-600 max-lg:w-[254px]">SAMJUNIORSOS · ATTENTION</div>
        </aside>

        {/* ---------------- center: canvas + operating graph ---------------- */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 sm:gap-2.5">
          <div
            ref={viewportRef}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onPointerLeave={endPointer}
            onDoubleClick={(e) => { if (isInteractive(e.target)) return; const r = viewportRef.current!.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.shiftKey ? 1 / 1.35 : 1.35); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className={`relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#030710] shadow-[0_30px_80px_-24px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] outline-none ${spaceDown ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing"}`}
            style={{ touchAction: "none" }}
          >
            {gridOn && (
              <>
                <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(120,170,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(120,170,255,0.08) 1px, transparent 1px)", backgroundSize: `${gridMinor}px ${gridMinor}px`, backgroundPosition: `${tx}px ${ty}px`, opacity: cam.k < 0.3 ? 0.4 : 0.85 }} />
                <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(120,190,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(120,190,255,0.12) 1px, transparent 1px)", backgroundSize: `${gridMajor}px ${gridMajor}px`, backgroundPosition: `${tx}px ${ty}px` }} />
              </>
            )}
            <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(30,60,120,0.25), transparent 62%), radial-gradient(ellipse at 50% 115%, rgba(40,90,180,0.22), transparent 55%)" }} />

            {/* world layer */}
            <div className="absolute left-0 top-0 h-0 w-0" style={{ transform: `translate(${tx}px, ${ty}px) scale(${cam.k})`, transformOrigin: "0 0" }}>
              {/* Category section titles */}
              <div className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tracking-[0.24em] text-slate-400" style={{ left: 180, top: 290 }}>INPUTS & DIRECTIVES</div>
              <div className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tracking-[0.24em] text-orange-300/80" style={{ left: 460, top: 290 }}>COO & ORCHESTRATOR</div>
              <div className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tracking-[0.24em] text-cyan-300/80" style={{ left: 740, top: 290 }}>ACTIVE SPECIALISTS</div>
              <div className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tracking-[0.24em] text-sky-300/80" style={{ left: 1010, top: 290 }}>PROTOCOL STEPS</div>
              <div className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tracking-[0.24em] text-emerald-300/80" style={{ left: 1280, top: 290 }}>CONSTITUTIONAL VERIFIER</div>
              <div className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tracking-[0.24em] text-emerald-300/80" style={{ left: 1500, top: 290 }}>GOVERNED VAULT</div>
              {graph.nodes.some((n) => n.type === "approval") && (
                <div className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tracking-[0.24em] text-amber-300/90" style={{ left: 620, top: 615 }}>FOUNDER APPROVAL GATE</div>
              )}

              {/* Dynamic Living Nodes */}
              {graph.nodes.map((n) => (
                <NodeCard key={n.id} n={n} selected={selected?.id === n.id} badge={badgeFor(n)} onClick={handleNodeClick} onDoubleClick={focusNode} />
              ))}

              {/* Spatial Contextual Cards */}
              {graph.spatialCards.map((card) => (
                <SpatialCardOverlay key={card.id} card={card} />
              ))}
            </div>

            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(2,6,14,0.5))" }} />
            <div className="pointer-events-none absolute inset-2.5 opacity-40">
              <span className="absolute left-0 top-0 h-3 w-3 rounded-tl-md border-l border-t border-cyan-200/40" />
              <span className="absolute right-0 top-0 h-3 w-3 rounded-tr-md border-r border-t border-cyan-200/40" />
              <span className="absolute bottom-0 left-0 h-3 w-3 rounded-bl-md border-b border-l border-cyan-200/40" />
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-br-md border-b border-r border-cyan-200/40" />
            </div>

            {/* HUD */}
            <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-[#060c18]/85 py-1.5 pl-3 pr-2.5 text-[10px] tracking-[0.18em] text-slate-300 backdrop-blur-md">
              {spaceDown ? <Hand size={11} className="text-amber-300" /> : <MousePointer2 size={11} className="text-cyan-300" />}
              {spaceDown ? "PAN" : "CANVAS"}
              <span className="tnum rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-cyan-200">{zoomPct}%</span>
            </div>

            {focus && (
              <button onClick={() => { osSound.click(); onPanelOpen?.(); }} className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-cyan-200/30 bg-[#081120]/90 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100 backdrop-blur-md transition hover:bg-cyan-300/10 active:scale-95">Focus mode · press F to exit</button>
            )}

            {/* inspector — contextual, progressive */}
            {selected && selMeta && !focus && (
              <div className="absolute left-1/2 top-14 z-10 w-[380px] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl border border-cyan-200/25 bg-[#081120]/95 p-4 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:top-3 sm:max-w-[calc(100%-20rem)]" style={{ animation: `os-in 220ms ${EASE}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.05]" style={{ color: selMeta.tint ?? "#fff" }}>{selMeta.icon}</span>
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold leading-tight text-white">{selMeta.title}</div>
                      {selAgent ? (
                        <div className="truncate text-[11px] text-slate-400">{selAgent.role} · <span className={selAgent.state === "waiting" ? "text-amber-200" : "text-slate-300"}>{selAgent.current ?? selAgent.state}</span></div>
                      ) : (
                        selMeta.sub && <div className="truncate text-[11px] text-slate-400">{selMeta.sub}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => { osSound.click(); selected && focusNode(selected); }} title="Center" className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-cyan-200"><Crosshair size={13} /></button>
                    <button onClick={() => { osSound.click(); setSelected(null); }} title="Close" className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white"><X size={13} /></button>
                  </div>
                </div>

                <p className="mt-2 text-[11.5px] leading-relaxed text-slate-300">{selMeta.desc}</p>

                {/* Workflow specific actions */}
                {selWork && (
                  <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="uppercase tracking-wider text-slate-400">Progression Stage</span>
                      <span className="font-mono font-bold text-cyan-200">{selWork.stage.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {STAGES.map((s, idx) => {
                        const curIdx = STAGES.indexOf(selWork.stage);
                        const isPast = idx <= curIdx;
                        return (
                          <div key={s} className="flex flex-1 flex-col items-center gap-1">
                            <div className={`h-1.5 w-full rounded-full transition-colors ${isPast ? "bg-cyan-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]" : "bg-white/10"}`} />
                            <span className="text-[8px] uppercase tracking-tighter text-slate-500">{s.slice(0, 3)}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Local stage controls only: server-origin workstreams are
                        read-only projections of real agent-run records — their
                        stage/state refresh from the runtime sync, never bumped locally. */}
                    {selWork.origin !== "server" && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => { osSound.click(); os.advanceWork(selWork.id); }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan-300/40 bg-cyan-400/15 py-1 text-[11px] font-medium text-cyan-100 hover:bg-cyan-400/25 active:scale-95"
                      >
                        Advance Stage <ArrowRight size={11} />
                      </button>
                      <button
                        onClick={() => {
                          osSound.click();
                          os.setWorkState(selWork.id, selWork.state === "active" ? "paused" : "active");
                        }}
                        className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                      >
                        {selWork.state === "active" ? <Pause size={11} /> : <Play size={11} />}
                      </button>
                    </div>
                    )}
                    {selWork.origin === "server" && (
                      <div className="pt-1 text-[10px] leading-relaxed text-slate-500">
                        Server-authoritative execution · {selWork.note ?? "state refreshed from /api/agents/runs"}
                      </div>
                    )}
                  </div>
                )}

                {/* Approval specific actions */}
                {selected.type === "approval" && decisions.length > 0 && (
                  <div className="mt-3 space-y-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-2.5">
                    <div className="text-[11px] font-medium text-amber-100">{decisions.length} Open Consequential Decision{decisions.length > 1 ? "s" : ""}</div>
                    <div className="space-y-1.5">
                      {decisions.slice(0, 2).map((d) => (
                        <div key={d.id} className="flex items-center justify-between rounded-lg bg-black/30 px-2 py-1.5 text-[11px]">
                          <span className="truncate text-slate-200">{d.title}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => { osSound.click(); os.resolveDecision(d.id, "Approve"); }} className="rounded bg-cyan-400/20 px-1.5 py-0.5 text-[10px] text-cyan-200 hover:bg-cyan-400/30">Approve</button>
                            <button onClick={() => { osSound.click(); os.resolveDecision(d.id, "Defer"); }} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-white/20">Defer</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Verification specific metrics */}
                {selected.type === "verification" && (
                  <div className="mt-3 space-y-1.5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-2.5 text-[11px]">
                    <div className="font-semibold text-emerald-200">Constitutional Invariant Guarantees:</div>
                    <div className="flex items-center gap-1.5 text-slate-300"><Check size={12} className="text-emerald-400" /> Gross Margin Floor ≥ 80.0% Enforced</div>
                    <div className="flex items-center gap-1.5 text-slate-300"><Check size={12} className="text-emerald-400" /> Safe Sandbox Isolation Active</div>
                    <div className="flex items-center gap-1.5 text-slate-300"><Check size={12} className="text-emerald-400" /> Single-Use SHA-256 Signatures Bound</div>
                  </div>
                )}

                {selAgent && (
                  <button onClick={() => { osSound.click(); onOpenAgent?.(selAgent.id); }} className="mt-2.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-cyan-200 hover:text-white">Open role card <ArrowRight size={12} /></button>
                )}
              </div>
            )}

            <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-white/10 bg-[#060c18]/85 p-1 backdrop-blur-md">
              <button onClick={() => { osSound.click(); setGridOn((v) => !v); }} title="Toggle grid" className={`rounded-lg p-1.5 transition active:scale-90 ${gridOn ? "bg-cyan-300/15 text-cyan-200" : "text-slate-500 hover:text-slate-200"}`}><Layers size={13} /></button>
              <button onClick={() => { osSound.click(); setMapOn((v) => !v); }} title="Toggle minimap" className={`hidden rounded-lg p-1.5 transition active:scale-90 sm:block ${mapOn ? "bg-cyan-300/15 text-cyan-200" : "text-slate-500 hover:text-slate-200"}`}><MapIcon size={13} /></button>
              <button onClick={fitView} title="Fit (0)" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90"><Maximize size={13} /></button>
              <button onClick={recenter} title="Recenter" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90"><Crosshair size={13} /></button>
            </div>

            <button onClick={() => { osSound.click(); setLeftOpen((v) => { if (!v) onPanelOpen?.(); return !v; }); }} className="absolute left-0 top-1/2 z-10 hidden h-14 w-4 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-white/10 bg-[#0a1220]/90 text-[11px] text-slate-400 backdrop-blur-md transition hover:text-cyan-200 lg:flex"><span className={`transition-transform duration-300 ${effLeft ? "" : "rotate-180"}`}>‹</span></button>
            <button onClick={() => { osSound.click(); setRightOpen((v) => { if (!v) onPanelOpen?.(); return !v; }); }} className="absolute right-0 top-1/2 z-10 hidden h-14 w-4 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-white/10 bg-[#0a1220]/90 text-[11px] text-slate-400 backdrop-blur-md transition hover:text-cyan-200 lg:flex"><span className={`transition-transform duration-300 ${effRight ? "" : "rotate-180"}`}>›</span></button>

            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-xl border border-white/10 bg-[#060c18]/88 p-1 backdrop-blur-md">
              <button onClick={() => zoomAt(vw / 2, vh / 2, 1 / 1.18)} title="Zoom out (−)" className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white active:scale-90"><ZoomOut size={14} /></button>
              <span className="tnum min-w-[46px] text-center font-mono text-[11px] font-semibold text-cyan-200">{zoomPct}%</span>
              <button onClick={() => zoomAt(vw / 2, vh / 2, 1.18)} title="Zoom in (+)" className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white active:scale-90"><ZoomIn size={14} /></button>
              <span className="mx-0.5 hidden h-4 w-px bg-white/10 sm:block" />
              <span className="tnum hidden px-1.5 font-mono text-[10.5px] text-slate-500 sm:block"><span ref={cursorRef}>–, –</span></span>
            </div>

            {mapOn && <div className="absolute bottom-3 right-20 z-10 hidden sm:block"><Minimap vw={vw} vh={vh} k={cam.k} pan={{ x: cam.x, y: cam.y }} nodes={graph.nodes} onJump={jumpTo} /></div>}

            {showHint && !focus && !selected && (
              <div className="pointer-events-none absolute left-1/2 top-3 z-10 hidden -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-[#060c18]/85 px-3.5 py-1.5 text-[10.5px] tracking-wide text-slate-400 backdrop-blur-md lg:flex" style={{ animation: `os-in 400ms ${EASE}` }}>
                <Hand size={11} className="text-cyan-300" /> Drag to pan <span className="text-slate-600">·</span> Scroll to zoom <span className="text-slate-600">·</span> <MousePointer2 size={11} className="text-cyan-300" /> Click a node to inspect
              </div>
            )}
          </div>
        </main>

        {/* ---------------- right rail: workforce + decisions ---------------- */}
        <aside
          className={`z-20 flex w-[272px] shrink-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden rounded-2xl border border-white/[0.08] bg-[#060c18]/80 p-3 backdrop-blur-md transition-all duration-500 [scrollbar-width:thin] max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:w-[290px] max-lg:border-white/12 max-lg:bg-[#060c18]/96 max-lg:shadow-[-24px_0_60px_rgba(0,0,0,0.65)] ${effRight ? "max-lg:translate-x-0" : "max-lg:translate-x-[112%]"}`}
          style={effRight ? undefined : { marginRight: -284, opacity: 0, pointerEvents: "none" }}
        >
          <div className="w-[248px] max-lg:w-[266px]">
            <SideCard title="Decisions" icon={<Scale size={13} />} count={decisions.length} tone="amber">
              <DecisionList onVoice={onVoice} />
            </SideCard>
          </div>
          <div className="w-[248px] max-lg:w-[266px]">
            <SideCard title="Workforce" icon={<Bot size={13} />} count={agents.filter((a) => a.state === "working").length}>
              <WorkforceList onOpen={(id) => onOpenAgent?.(id)} />
            </SideCard>
          </div>
          <div className="mt-auto w-[248px] pt-1 text-right text-[9px] tracking-[0.22em] text-slate-700 max-lg:w-[266px]">SAMJUNIORSOS</div>
        </aside>

        {(effLeft || effRight) && (
          <button aria-label="Close panels" className="absolute inset-0 z-10 bg-black/45 backdrop-blur-[1px] lg:hidden" onClick={() => { setLeftOpen(false); setRightOpen(false); }} />
        )}
      </div>
    </div>
  );
}
