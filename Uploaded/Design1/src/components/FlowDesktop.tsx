import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bot, ListTree, PackageCheck, ClipboardList, Scale, ChevronDown, Check,
  ZoomIn, ZoomOut, Maximize, Crosshair, PanelLeftClose, PanelRightClose, Layers,
  MousePointer2, X, Activity, Hand, Map as MapIcon, AlertTriangle, Circle, StickyNote,
  Building2, Pencil, ArrowRight, Flag, ShieldCheck, Play, Pause, MessageSquare,
  Coins, FileText, RefreshCw, ShieldAlert, Sparkles, Target,
  Mail, Send, Search, Database, Terminal, Globe, GitBranch,
} from "lucide-react";
import { FlowEngine, WORLD, deriveGraph, mapGraphDTOToFlowModel, type FlowNode, type SpatialCard } from "../lib/flow";
import { osSound } from "../lib/osAudio";
import {
  os, useOS, openAttention, openDecisions, activeWork, agentName,
  type AttentionKind, type Agent, STAGES,
} from "../lib/osStore";
import { MetricSurface, TimelineSurface } from "./surfaces/StandardSurfaces";
import { generateSystemMetrics, generateCompanyMilestones } from "../lib/surfaceSchema";
import {
  Node as Phase4Node,
  IconOnlyContent,
  IconTitleContent,
  IconMetaContent,
  Connector as Phase4Connector,
  WORKFLOW_COLORS,
  type NodeGeometryType,
  type NodeStateType,
  type NodeIndicator,
  type NodePortProps,
} from "../../../../components/workflow";
import type { GraphDTO } from "../../../../types/graph";
import { fetchGraphOverview, decideApproval } from "../lib/runtime";

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

type EntityVisual = {
  icon: ReactNode;
  tint: string;
  primaryLabel: string;
  subLabel?: string;
  serviceBrand?: string;
};

function getEntityVisual(n: FlowNode): EntityVisual {
  const text = `${n.id} ${n.title} ${n.subtitle ?? ""} ${n.activity ?? ""}`.toLowerCase();

  // 1. External Services (Real recognizable icons)
  if (text.includes("github") || text.includes("git")) {
    return {
      icon: <GitBranch size={24} strokeWidth={1.8} className="text-white" />,
      tint: "#ffffff",
      primaryLabel: "GitHub",
      subLabel: "VERSION CONTROL",
      serviceBrand: "GitHub",
    };
  }
  if (text.includes("slack")) {
    return {
      icon: <MessageSquare size={24} strokeWidth={1.8} className="text-[#ECB22E]" />,
      tint: "#ECB22E",
      primaryLabel: "Slack",
      subLabel: "TEAM CHAT",
      serviceBrand: "Slack",
    };
  }
  if (text.includes("telegram") || text.includes("reply to lead") || text.includes("send message")) {
    return {
      icon: <Send size={22} strokeWidth={1.8} className="text-[#2AABEE]" />,
      tint: "#2AABEE",
      primaryLabel: n.title.toLowerCase().includes("reply") ? "Reply to Lead" : "Telegram",
      subLabel: "COMMUNICATION",
      serviceBrand: "Telegram",
    };
  }
  if (text.includes("gmail") || text.includes("email") || text.includes("mail")) {
    return {
      icon: <Mail size={22} strokeWidth={1.8} className="text-[#EA4335]" />,
      tint: "#EA4335",
      primaryLabel: "Gmail",
      subLabel: "EXTERNAL SERVICE",
      serviceBrand: "Gmail",
    };
  }
  if (text.includes("google") || text.includes("search") || text.includes("reconnaissance") || text.includes("market")) {
    return {
      icon: <Search size={24} strokeWidth={1.8} className="text-[#4285F4]" />,
      tint: "#4285F4",
      primaryLabel: n.title.toLowerCase().includes("market") ? "Market Reconnaissance" : "Google Search",
      subLabel: "RESEARCH SERVICE",
      serviceBrand: "Google",
    };
  }
  if (text.includes("terminal") || text.includes("cli") || text.includes("sandbox")) {
    return {
      icon: <Terminal size={22} strokeWidth={1.8} className="text-emerald-400" />,
      tint: "#34d399",
      primaryLabel: n.title,
      subLabel: "RUNTIME EXECUTION",
    };
  }
  if (text.includes("database") || text.includes("postgres") || text.includes("memory")) {
    return {
      icon: <Database size={22} strokeWidth={1.8} className="text-blue-400" />,
      tint: "#38bdf8",
      primaryLabel: n.title,
      subLabel: "DATA STORAGE",
    };
  }

  // 2. Core OS Roles
  if (n.id === "founder" || n.type === "founder") {
    return {
      icon: <Building2 size={24} strokeWidth={1.8} className="text-sky-300" />,
      tint: "#38bdf8",
      primaryLabel: "Founder / Authority",
      subLabel: "DIRECTIVES",
    };
  }
  if (n.id === "core" || n.id === "coo" || n.owner === "coo" || n.dtoNode?.role === "coo") {
    return {
      icon: <Bot size={28} strokeWidth={1.8} className="text-orange-300" />,
      tint: "#fb923c",
      primaryLabel: "Sophia",
      subLabel: "COO & ORCHESTRATOR",
    };
  }
  if (n.id === "ops" || n.id === "researcher" || n.owner === "ops" || n.owner === "researcher") {
    return {
      icon: <ClipboardList size={24} strokeWidth={1.8} className="text-cyan-300" />,
      tint: "#38bdf8",
      primaryLabel: "Dr. Aris Thorne",
      subLabel: "RESEARCH SPECIALIST",
    };
  }
  if (n.id === "finance" || n.owner === "finance") {
    return {
      icon: <Coins size={24} strokeWidth={1.8} className="text-emerald-300" />,
      tint: "#34d399",
      primaryLabel: "Julian Cruz",
      subLabel: "FINANCE SPECIALIST",
    };
  }
  if (n.id === "pm" || n.owner === "pm") {
    return {
      icon: <FileText size={24} strokeWidth={1.8} className="text-purple-300" />,
      tint: "#c084fc",
      primaryLabel: "Maya Lin",
      subLabel: "PRODUCT ARCHITECT",
    };
  }
  if (n.type === "approval" || n.id === "approval") {
    return {
      icon: <Scale size={24} strokeWidth={1.8} className="text-amber-300" />,
      tint: "#fbbf24",
      primaryLabel: "Founder Approval",
      subLabel: "RATIFICATION GATE",
    };
  }
  if (n.type === "verification" || n.id === "verification") {
    return {
      icon: <ShieldCheck size={24} strokeWidth={1.8} className={n.state === "blocked" ? "text-rose-400" : "text-emerald-400"} />,
      tint: n.state === "blocked" ? "#fb7185" : "#34d399",
      primaryLabel: "Constitutional Verifier",
      subLabel: "SAFETY GATE",
    };
  }
  if (n.type === "outcome" || n.id === "outcome") {
    return {
      icon: <PackageCheck size={24} strokeWidth={1.8} className="text-emerald-400" />,
      tint: "#34d399",
      primaryLabel: "Governed Vault",
      subLabel: "IMMUTABLE MEMORY",
    };
  }

  // 3. General Workflow Steps / Actions
  return {
    icon: <Activity size={22} strokeWidth={1.8} className="text-cyan-300" />,
    tint: n.state === "blocked" ? "#fb7185" : n.state === "complete" ? "#34d399" : "#38bdf8",
    primaryLabel: n.title,
    subLabel: n.protocolStep ? n.protocolStep.replace("step-", "").toUpperCase() : n.subtitle ?? "WORKFLOW ACTION",
  };
}

function Phase4NodeCard({
  n,
  selected,
  hasSelection,
  badge,
  onClick,
  onDoubleClick,
}: {
  n: FlowNode;
  selected?: boolean;
  hasSelection?: boolean;
  badge?: ReactNode;
  onClick?: (n: FlowNode) => void;
  onDoubleClick?: (n: FlowNode) => void;
}) {
  const visual = getEntityVisual(n);
  const dto = n.dtoNode;

  // 1. Determine Phase 4.1 Presentation State
  let nodeState: NodeStateType = "default";
  if (selected) {
    nodeState = "selected";
  } else if (dto?.presentationState) {
    nodeState = dto.presentationState === "waiting" ? "processing" : (dto.presentationState as NodeStateType);
  } else {
    if (n.state === "waiting") nodeState = "processing";
    else if (n.state === "blocked") nodeState = "error";
    else if (n.state === "active") nodeState = "active";
    else if (n.state === "processing") nodeState = "processing";
    else if (n.state === "complete") nodeState = "success";
  }

  // 2. Determine Geometry Shape from Phase 4.1 Taxonomy
  let geometry: NodeGeometryType = "circle";
  if (n.kind === "core" || n.dtoNode?.role === "coo" || n.id === "coo") {
    geometry = "squircle";
  } else if (n.type === "workflow" || n.type === "outcome" || n.type === "approval") {
    geometry = "square";
  } else {
    geometry = "circle";
  }

  // 3. Status Indicator: Minimal glowing status dot (no bulky text rows)
  let indicator: NodeIndicator | undefined = undefined;
  if (dto?.governanceState === "awaiting_founder_approval" || n.type === "approval") {
    indicator = { status: "waiting", glow: true };
  } else if (dto?.runtimeState === "running" || n.state === "active") {
    indicator = { status: "active", glow: true };
  } else if (dto?.runtimeState === "failed" || n.state === "blocked") {
    indicator = { status: "error", glow: true };
  } else if (dto?.runtimeState === "completed" || n.state === "complete") {
    indicator = { status: "success" };
  }

  // 4. Ports based on role / topology
  const ports: NodePortProps[] = [];
  const isPortActive = nodeState === "active" || nodeState === "selected";
  if (n.id === "founder") {
    ports.push({ position: "right", shape: "circle", state: isPortActive ? "active" : "default" });
    ports.push({ position: "bottom", shape: "circle", state: isPortActive ? "active" : "default" });
  } else if (n.id === "core" || n.dtoNode?.role === "coo") {
    ports.push({ position: "left", shape: "circle", state: isPortActive ? "active" : "default" });
    ports.push({ position: "right", shape: "circle", state: isPortActive ? "active" : "default" });
    ports.push({ position: "bottom", shape: "circle", state: isPortActive ? "active" : "default" });
  } else if (n.type === "approval") {
    ports.push({ position: "top", shape: "square", state: "active" });
    ports.push({ position: "right", shape: "square", state: "active" });
  } else if (n.type === "outcome") {
    ports.push({ position: "left", shape: "circle", state: isPortActive ? "active" : "default" });
  } else {
    ports.push({ position: "left", shape: "circle", state: isPortActive ? "active" : "default" });
    ports.push({ position: "right", shape: "circle", state: isPortActive ? "active" : "default" });
    ports.push({ position: "top", shape: "circle", state: isPortActive ? "active" : "default" });
  }

  // 5. External Semantic Label (Sitting outside/below node)
  const externalLabel = (
    <div className="flex flex-col items-center pointer-events-none select-none transition-all duration-200">
      <span
        className={`text-[11.5px] tracking-wide transition-all duration-200 ${
          selected
            ? "text-cyan-200 font-semibold drop-shadow-[0_0_8px_rgba(0,178,255,0.75)] scale-105"
            : "text-slate-300 group-hover:text-white font-medium"
        }`}
      >
        {visual.primaryLabel}
      </span>
      {visual.subLabel && (
        <span
          className={`text-[9px] tracking-wider uppercase font-mono mt-0.5 transition-colors duration-200 ${
            selected ? "text-cyan-400/90 font-medium" : "text-slate-500"
          }`}
        >
          {visual.subLabel}
        </span>
      )}
    </div>
  );

  // 6. Minimal Icon-First Content
  const content = (
    <IconOnlyContent
      icon={visual.icon}
      iconVariant={geometry === "squircle" ? "squircle" : "glass"}
      color={visual.tint}
      glow={selected || nodeState === "active"}
      size={n.kind === "core" ? "lg" : "md"}
    />
  );

  const isDimmed = hasSelection && !selected;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group absolute cursor-pointer select-none transition-all duration-200 hover:-translate-y-0.5 active:scale-98 ${
        isDimmed ? "opacity-45 hover:opacity-85" : "opacity-100"
      }`}
      style={{
        left: n.x - n.w / 2,
        top: n.y - n.h / 2,
        width: n.w,
        height: n.h,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(n);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.(n);
      }}
    >
      <div className="relative h-full w-full">
        <Phase4Node
          id={`wf-node-${n.id}`}
          geometry={geometry}
          state={nodeState}
          customWidth={n.w}
          customHeight={n.h}
          indicator={indicator}
          ports={ports}
          externalLabel={externalLabel}
          className="!m-0 h-full w-full"
        >
          {content}
        </Phase4Node>
        {badge && (
          <div className="pointer-events-none absolute -right-1 -top-1 z-30">
            {badge}
          </div>
        )}
      </div>
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

  // Authoritative Server-Projected Graph (Phase 4.3B)
  const [graphState, setGraphState] = useState<{
    status: "loading" | "success" | "unavailable" | "error";
    data: GraphDTO | null;
    error: string | null;
    lastSync: Date | null;
  }>({
    status: "loading",
    data: null,
    error: null,
    lastSync: null,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadGraph = useCallback(async (showIndicator = false) => {
    if (showIndicator) setIsRefreshing(true);
    try {
      const res = await fetchGraphOverview();
      if (res.success) {
        setGraphState({
          status: "success",
          data: res.data,
          error: null,
          lastSync: new Date(),
        });
      } else if (res.unavailable) {
        setGraphState((prev) => ({
          status: "unavailable",
          data: prev.data,
          error: res.error,
          lastSync: new Date(),
        }));
      } else {
        setGraphState((prev) => ({
          status: prev.data ? "success" : "error",
          data: prev.data,
          error: res.error,
          lastSync: new Date(),
        }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setGraphState((prev) => ({
        status: prev.data ? "success" : "error",
        data: prev.data,
        error: msg,
        lastSync: new Date(),
      }));
    } finally {
      if (showIndicator) setIsRefreshing(false);
    }
  }, []);

  // Initial load and conservative refresh (polling every 8 seconds, paused when tab is backgrounded)
  useEffect(() => {
    loadGraph();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        loadGraph();
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [loadGraph]);

  // Dynamically derive genuine living SamJuniorsOS graph from server-authoritative GraphDTO
  const graph = useMemo(() => {
    if (graphState.data && graphState.status === "success") {
      return mapGraphDTOToFlowModel(graphState.data);
    }
    return deriveGraph(osState);
  }, [graphState.data, graphState.status, osState]);

  const metrics = generateSystemMetrics(osState);
  const milestones = generateCompanyMilestones();

  const vwRef = useRef(vw), vhRef = useRef(vh), camRef = useRef(cam), spaceRef = useRef(false);
  const didFit = useRef(false), baseFit = useRef(0.55);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; k: number; mx: number; my: number; px: number; py: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const animId = useRef(0);
  const velRef = useRef({ vx: 0, vy: 0, lastX: 0, lastY: 0, lastT: 0 });
  const momentumRaf = useRef(0);
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
  useEffect(() => () => { cancelAnimationFrame(animId.current); cancelAnimationFrame(momentumRaf.current); }, []);

  const clamp = (x: number, y: number, k: number) => {
    const maxX = (WORLD.W * k) / 2 + vwRef.current / 2 + 360;
    const maxY = (WORLD.H * k) / 2 + vhRef.current / 2 + 360;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)), k };
  };

  const animateTo = useCallback((target: { x: number; y: number; k: number }, dur = 380) => {
    cancelAnimationFrame(animId.current);
    cancelAnimationFrame(momentumRaf.current);
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
    cancelAnimationFrame(momentumRaf.current);
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

  const focusActiveWork = useCallback(() => {
    osSound.click();
    const activeNode = graph.nodes.find(
      (n) =>
        n.dtoNode?.runtimeState === "running" ||
        n.state === "active" ||
        n.dtoNode?.governanceState === "awaiting_founder_approval" ||
        n.type === "approval"
    );
    if (activeNode) {
      focusNode(activeNode);
      setSelected(activeNode);
    } else {
      recenter();
    }
  }, [graph.nodes, focusNode, recenter]);

  useEffect(() => {
    const el = viewportRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(momentumRaf.current);
      const r = el.getBoundingClientRect();
      const delta = e.deltaY;
      const factor = delta < 0 ? 1.12 : 0.89;
      zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
    };
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

  const isInteractive = (t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    if (!el) return false;
    return !!el.closest("button, input, a, textarea, select, [role='button']");
  };

  const updateCursorReadout = (clientX: number, clientY: number) => {
    const el = viewportRef.current; if (!el || !cursorRef.current) return;
    const r = el.getBoundingClientRect(); const c = camRef.current;
    const cTx = vwRef.current / 2 + c.x - WORLD.CX * c.k, cTy = vhRef.current / 2 + c.y - WORLD.CY * c.k;
    cursorRef.current.textContent = `${Math.round(((clientX - r.left) - cTx) / c.k)}, ${Math.round(((clientY - r.top) - cTy) / c.k)}`;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    cancelAnimationFrame(momentumRaf.current);
    velRef.current = { vx: 0, vy: 0, lastX: e.clientX, lastY: e.clientY, lastT: performance.now() };
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]; const r = viewportRef.current!.getBoundingClientRect(); const c = camRef.current;
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: c.k, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, px: c.x, py: c.y };
      panStart.current = null; return;
    }
    const forcePan = e.button === 1 || e.button === 2 || spaceRef.current;
    if (forcePan || (e.button === 0 && !isInteractive(e.target))) {
      if (e.button === 1 || e.button === 2) e.preventDefault();
      const c = camRef.current;
      panStart.current = { x: c.x, y: c.y, px: e.clientX, py: e.clientY, moved: false };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    updateCursorReadout(e.clientX, e.clientY);
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const now = performance.now();
    const dt = Math.max(1, now - velRef.current.lastT);
    velRef.current.vx = ((e.clientX - velRef.current.lastX) / dt) * 16;
    velRef.current.vy = ((e.clientY - velRef.current.lastY) / dt) * 16;
    velRef.current.lastX = e.clientX;
    velRef.current.lastY = e.clientY;
    velRef.current.lastT = now;

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
      setCam((p) => clamp(ps.x + dx, ps.y + dy, p.k));
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    const ps = panStart.current;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) panStart.current = null;

    if (ps && ps.moved) {
      let vx = Math.max(-48, Math.min(48, velRef.current.vx));
      let vy = Math.max(-48, Math.min(48, velRef.current.vy));
      if (Math.hypot(vx, vy) > 1.2) {
        cancelAnimationFrame(momentumRaf.current);
        const glide = () => {
          vx *= 0.92;
          vy *= 0.92;
          if (Math.hypot(vx, vy) > 0.15) {
            setCam((p) => clamp(p.x + vx, p.y + vy, p.k));
            momentumRaf.current = requestAnimationFrame(glide);
          }
        };
        momentumRaf.current = requestAnimationFrame(glide);
      }
    } else if (ps && !ps.moved && e.button === 0 && !spaceRef.current && !isInteractive(e.target)) {
      setSelected(null);
    }
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
            style={{ touchAction: "none", perspective: "1400px" }}
          >
            {gridOn && (
              <>
                <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(120,170,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(120,170,255,0.08) 1px, transparent 1px)", backgroundSize: `${gridMinor}px ${gridMinor}px`, backgroundPosition: `${tx}px ${ty}px`, opacity: cam.k < 0.3 ? 0.4 : 0.85 }} />
                <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(120,190,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(120,190,255,0.12) 1px, transparent 1px)", backgroundSize: `${gridMajor}px ${gridMajor}px`, backgroundPosition: `${tx}px ${ty}px` }} />
              </>
            )}
            <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(30,60,120,0.25), transparent 62%), radial-gradient(ellipse at 50% 115%, rgba(40,90,180,0.22), transparent 55%)" }} />

            {/* world layer */}
            <div
              className="absolute left-0 top-0 h-0 w-0"
              style={{
                transform: `translate3d(${tx}px, ${ty}px, 0px) scale(${cam.k}) rotateX(${Math.max(-6, Math.min(6, -cam.y * 0.005))}deg) rotateY(${Math.max(-6, Math.min(6, cam.x * 0.005))}deg)`,
                transformOrigin: "0 0",
                transformStyle: "preserve-3d",
                willChange: "transform",
              }}
            >
              {/* Dynamic Living Connectors (Phase 4.1 Primitive) */}
              <svg
                className="pointer-events-none absolute inset-0 overflow-visible"
                style={{ width: WORLD.W, height: WORLD.H }}
              >
                {graph.edges.map((e) => {
                  const fromNode = graph.nodes.find((n) => n.id === e.from);
                  const toNode = graph.nodes.find((n) => n.id === e.to);
                  const x1 = e.pts[0]?.[0] ?? (fromNode ? fromNode.x + fromNode.w / 2 : 0);
                  const y1 = e.pts[0]?.[1] ?? (fromNode ? fromNode.y : 0);
                  const x2 = e.pts[e.pts.length - 1]?.[0] ?? (toNode ? toNode.x - toNode.w / 2 : 0);
                  const y2 = e.pts[e.pts.length - 1]?.[1] ?? (toNode ? toNode.y : 0);

                  let tone: "blue" | "orange" | "green" | "red" = "blue";
                  if (e.state === "blocked" || toNode?.state === "blocked" || e.dtoEdge?.runtimeState === "failed") tone = "red";
                  else if (
                    e.relationship === "escalates-to" ||
                    toNode?.dtoNode?.governanceState === "awaiting_founder_approval" ||
                    e.state === "waiting"
                  )
                    tone = "orange";
                  else if (toNode?.dtoNode?.runtimeState === "completed" || e.state === "complete")
                    tone = "green";

                  let connType: "straight" | "curved" | "dashed" | "branch" | "animated" = "curved";
                  if (e.dtoEdge?.presentationState === "active" || e.dtoEdge?.runtimeState === "running" || e.activity || e.state === "active") connType = "animated";
                  else if (e.relationship === "depends-on") connType = "dashed";
                  else if (e.relationship === "escalates-to") connType = "branch";

                  const isEdgeSelected = selected?.id === e.from || selected?.id === e.to;
                  const isEdgeDimmed = !!selected && !isEdgeSelected;

                  return (
                    <Phase4Connector
                      key={e.id}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      type={connType}
                      tone={tone}
                      hasArrow={e.arrow ?? true}
                      label={isEdgeSelected ? e.relationship : undefined}
                      className={isEdgeDimmed ? "opacity-25 transition-opacity duration-200" : "opacity-90 transition-opacity duration-200"}
                    />
                  );
                })}
              </svg>

              {/* Dynamic Living Nodes */}
              {graph.nodes.map((n) => (
                <Phase4NodeCard
                  key={n.id}
                  n={n}
                  selected={selected?.id === n.id}
                  hasSelection={!!selected}
                  badge={badgeFor(n)}
                  onClick={(node: FlowNode) => {
                    if (!panStart.current?.moved) handleNodeClick(node);
                  }}
                  onDoubleClick={focusNode}
                />
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

            {/* Fail-Closed 503 Banner */}
            {graphState.status === "unavailable" && (
              <div className="absolute inset-x-4 top-14 z-20 mx-auto max-w-lg rounded-xl border border-amber-500/40 bg-[#140e04]/95 p-3 text-center shadow-[0_12px_36px_rgba(245,158,11,0.25)] backdrop-blur-xl">
                <div className="flex items-center justify-center gap-2 text-[12px] font-semibold text-amber-300">
                  <AlertTriangle size={14} className="text-amber-400" />
                  AUTHORITATIVE PERSISTENCE UNAVAILABLE (503 FAIL-CLOSED)
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {graphState.error || "Database unavailable. OS fail-closed policy active — refusing to fabricate optimistic state."}
                </p>
                <div className="mt-2 flex justify-center gap-2">
                  <button
                    onClick={() => { osSound.click(); loadGraph(true); }}
                    className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10.5px] font-semibold text-amber-200 hover:bg-amber-400/20 active:scale-95"
                  >
                    Retry Connection
                  </button>
                </div>
              </div>
            )}

            {/* Calm Loading Overlay when no data yet */}
            {graphState.status === "loading" && !graphState.data && (
              <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#04060d]/70 backdrop-blur-sm">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-300" />
                <span className="text-[11px] font-medium tracking-[0.2em] text-cyan-200">
                  SYNCHRONIZING AUTHORITATIVE GRAPH...
                </span>
              </div>
            )}

            {/* HUD */}
            <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-[#060c18]/85 py-1.5 pl-3 pr-2.5 text-[10px] tracking-[0.18em] text-slate-300 backdrop-blur-md">
              {spaceDown ? <Hand size={11} className="text-amber-300" /> : <MousePointer2 size={11} className="text-cyan-300" />}
              {spaceDown ? "PAN" : "CANVAS"}
              <span className="tnum rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-cyan-200">{zoomPct}%</span>
              <span className="mx-0.5 h-3 w-px bg-white/10" />
              {/* Authoritative Server Sync Status */}
              {graphState.status === "success" && graphState.data ? (
                <div className="flex items-center gap-1.5 text-emerald-300" title={`Deterministic Hash: ${graphState.data.deterministicHash}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                  <span className="font-mono text-[9px]">SYNCED · {graphState.data.deterministicHash.slice(0, 7)}</span>
                </div>
              ) : graphState.status === "unavailable" ? (
                <div className="flex items-center gap-1.5 text-amber-400" title={graphState.error ?? "503 Fail-Closed"}>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
                  <span className="font-mono text-[9px]">FAIL-CLOSED (503)</span>
                </div>
              ) : graphState.status === "error" ? (
                <div className="flex items-center gap-1.5 text-rose-400" title={graphState.error ?? "Sync Error"}>
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
                  <span className="font-mono text-[9px]">SYNC ERROR</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-cyan-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                  <span className="font-mono text-[9px]">SYNCING...</span>
                </div>
              )}
              {/* Refresh Button */}
              <button
                onClick={() => { osSound.click(); loadGraph(true); }}
                title="Refresh authoritative graph"
                className="ml-0.5 rounded-md p-0.5 text-slate-400 hover:text-cyan-200 active:scale-90"
              >
                <RefreshCw size={10} className={isRefreshing ? "animate-spin text-cyan-300" : ""} />
              </button>
            </div>

            {/* Quick Action: Focus Active Work */}
            <button
              onClick={focusActiveWork}
              className="absolute left-3 top-12 z-10 flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-[#060c18]/80 px-2.5 py-1 text-[9.5px] font-medium tracking-[0.14em] text-cyan-200 backdrop-blur-md transition hover:border-cyan-300/40 hover:bg-cyan-300/10 active:scale-95"
              title="Focus graph on active running work or pending founder approvals"
            >
              <Target size={11} className="text-cyan-300" />
              FOCUS ACTIVE
            </button>

            {focus && (
              <button onClick={() => { osSound.click(); onPanelOpen?.(); }} className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-cyan-200/30 bg-[#081120]/90 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100 backdrop-blur-md transition hover:bg-cyan-300/10 active:scale-95">Focus mode · press F to exit</button>
            )}

            {/* inspector — contextual, progressive */}
            {selected && selMeta && !focus && (
              <div className="absolute left-1/2 top-14 z-10 w-[420px] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl border border-cyan-200/25 bg-[#081120]/95 p-4 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:top-3 sm:max-w-[calc(100%-20rem)]" style={{ animation: `os-in 220ms ${EASE}` }}>
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

                {/* 4 Orthogonal State Domains (Phase 4.2 / 4.3A) */}
                <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl border border-white/10 bg-black/40 p-2 text-[10px]">
                  <div className="rounded-lg bg-white/[0.03] p-1.5">
                    <span className="text-slate-500 uppercase tracking-wider block text-[9px]">Runtime Domain</span>
                    <span className={`font-mono font-semibold ${
                      selected.dtoNode?.runtimeState === "running" ? "text-cyan-300 animate-pulse" :
                      selected.dtoNode?.runtimeState === "completed" ? "text-emerald-300" :
                      selected.dtoNode?.runtimeState === "failed" ? "text-rose-400" :
                      "text-slate-300"
                    }`}>
                      {(selected.dtoNode?.runtimeState ?? selected.state).toUpperCase()}
                    </span>
                  </div>
                  <div className={`rounded-lg p-1.5 ${
                    selected.dtoNode?.governanceState === "awaiting_founder_approval" || selected.type === "approval"
                      ? "bg-amber-400/15 border border-amber-400/30"
                      : "bg-white/[0.03]"
                  }`}>
                    <span className="text-slate-500 uppercase tracking-wider block text-[9px]">Governance Domain</span>
                    <span className={`font-mono font-semibold ${
                      selected.dtoNode?.governanceState === "awaiting_founder_approval" || selected.type === "approval"
                        ? "text-amber-300 font-bold"
                        : "text-slate-300"
                    }`}>
                      {(selected.dtoNode?.governanceState ?? "none").replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-1.5">
                    <span className="text-slate-500 uppercase tracking-wider block text-[9px]">Epistemic Domain</span>
                    <span className="font-mono font-semibold text-slate-300">
                      {(selected.dtoNode?.epistemicValidity ?? "active").replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-1.5">
                    <span className="text-slate-500 uppercase tracking-wider block text-[9px]">Presentation State</span>
                    <span className="font-mono font-semibold text-cyan-200">
                      {(selected.dtoNode?.presentationState ?? (selected.state === "waiting" ? "waiting" : "default")).toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Authoritative Founder Approval Gate (Zero Optimistic Illusion) */}
                {(selected.type === "approval" || selected.dtoNode?.governanceState === "awaiting_founder_approval") && (
                  <div className="mt-3 space-y-2 rounded-xl border border-amber-400/40 bg-amber-400/[0.08] p-3 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-200">
                        <Scale size={13} className="text-amber-300" />
                        Founder Authorization Boundary
                      </span>
                      <span className="rounded bg-amber-400/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-200">
                        GATE
                      </span>
                    </div>
                    {decisions.length > 0 ? (
                      <div className="space-y-2">
                        {decisions.map((d) => (
                          <div key={d.id} className="rounded-lg bg-black/40 p-2 text-[11px]">
                            <div className="font-medium text-white">{d.title}</div>
                            {d.context && <div className="mt-0.5 text-[10px] text-slate-400">{d.context}</div>}
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                onClick={async () => {
                                  osSound.click();
                                  if (d.approvalId) {
                                    await decideApproval(d.approvalId, "approve");
                                    await loadGraph(true);
                                  } else {
                                    os.resolveDecision(d.id, "Approve");
                                  }
                                }}
                                className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-400/20 py-1 text-center text-[10.5px] font-semibold text-emerald-200 hover:bg-emerald-400/30 active:scale-95"
                              >
                                Approve & Ratify
                              </button>
                              <button
                                onClick={async () => {
                                  osSound.click();
                                  if (d.approvalId) {
                                    await decideApproval(d.approvalId, "reject");
                                    await loadGraph(true);
                                  } else {
                                    os.resolveDecision(d.id, "Reject");
                                  }
                                }}
                                className="flex-1 rounded-lg border border-rose-400/30 bg-rose-400/15 py-1 text-center text-[10.5px] font-semibold text-rose-200 hover:bg-rose-400/25 active:scale-95"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10.5px] text-amber-200/80">
                        Awaiting formal ratification record from orchestration runtime.
                      </div>
                    )}
                  </div>
                )}

                {/* Connected Relationships & Conduits (Follow Topology) */}
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
                    <span>Connected Topology</span>
                    <span className="font-mono text-cyan-200">
                      {graph.edges.filter((e) => e.from === selected.id || e.to === selected.id).length} CONDUITS
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {graph.edges
                      .filter((e) => e.from === selected.id || e.to === selected.id)
                      .map((e) => {
                        const isOut = e.from === selected.id;
                        const otherId = isOut ? e.to : e.from;
                        const otherNode = graph.nodes.find((n) => n.id === otherId);
                        return (
                          <button
                            key={e.id}
                            onClick={() => {
                              osSound.click();
                              if (otherNode) {
                                focusNode(otherNode);
                                setSelected(otherNode);
                              }
                            }}
                            className="flex w-full items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1.5 text-left text-[11px] transition hover:bg-cyan-400/10 hover:border hover:border-cyan-300/30"
                          >
                            <span className="flex items-center gap-1.5 text-slate-300">
                              <span className="text-[10px] text-cyan-400">{isOut ? "→" : "←"}</span>
                              <span className="truncate">{otherNode?.title ?? otherId}</span>
                            </span>
                            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-400">
                              {e.relationship}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Deep Provenance & Audit Information */}
                {selected.dtoNode?.metadata && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-[10.5px]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Provenance & Lineage</div>
                    <div className="mt-1.5 space-y-1 font-mono text-[10px] text-slate-300">
                      {selected.dtoNode.metadata.runId && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Run ID:</span>
                          <span className="truncate max-w-[180px] text-cyan-200">{selected.dtoNode.metadata.runId}</span>
                        </div>
                      )}
                      {selected.dtoNode.metadata.protocolStep && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Protocol Step:</span>
                          <span className="text-slate-200">{selected.dtoNode.metadata.protocolStep}</span>
                        </div>
                      )}
                      {typeof selected.dtoNode.metadata.durationMs === "number" && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Duration:</span>
                          <span className="text-slate-200">{selected.dtoNode.metadata.durationMs}ms</span>
                        </div>
                      )}
                      {selected.dtoNode.metadata.error && (
                        <div className="mt-1 rounded bg-rose-500/10 p-1.5 text-rose-300 border border-rose-500/20">
                          {selected.dtoNode.metadata.error}
                        </div>
                      )}
                      {typeof selected.dtoNode.metadata.evidenceCount === "number" && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Epistemic Evidence:</span>
                          <span className="text-emerald-300">{selected.dtoNode.metadata.evidenceCount} facts</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
