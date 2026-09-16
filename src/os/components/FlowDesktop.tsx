import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bot, ListTree, PackageCheck, ClipboardList, Scale, ChevronDown, Check,
  ZoomIn, ZoomOut, Maximize, Crosshair, PanelLeftClose, PanelRightClose, Layers,
  MousePointer2, X, Activity, Hand, Map as MapIcon, AlertTriangle, Circle, StickyNote,
  Building2, Pencil, ArrowRight, Flag, ShieldCheck, Play, Pause, MessageSquare,
  Coins, FileText, RefreshCw, ShieldAlert, Sparkles, Target, Clock, Timer,
} from "lucide-react";
import { FlowEngine, WORLD, REGIONS, deriveGraph, mapGraphDTOToFlowModel, perimeterForNode, type FlowNode, type FlowEdge, type SpatialCard } from "../lib/flow";
import { osSound } from "../lib/osAudio";
import {
  os, useOS, openAttention, openDecisions, activeWork, agentName,
  type AttentionKind, type Agent, STAGES,
} from "../lib/osStore";
import { MetricSurface, TimelineSurface, ActivitySurface } from "./surfaces/StandardSurfaces";
import { generateSystemMetrics, generateCompanyMilestones } from "../lib/surfaceSchema";
import {
  Phase4Node,
  IconContainer,
  IconOnlyContent,
} from "@/components/canonical-node";
import { Connector as Phase4Connector } from "@/components/connector";
import {
  WORKFLOW_COLORS,
  EXECUTION_LANGUAGE,
  ENTITY_IDENTITY,
  SPATIAL_TOKENS,
  type NodeGeometryType,
  type NodeStateType,
  type NodeIndicator,
  type ExecutionPerimeterSpec,
} from "@/lib/tokens";
import {
  SERVICE_BRANDS,
  type ServiceBrandKey,
} from "@/components/glyphs";
import type { GraphDTO } from "@/types/graph";
import type { SchedulerStatusProjection } from "@/types/scheduling";
import { fetchGraphOverview, decideApproval, fetchSchedulerStatus, createScheduledDirective, fetchSchedules, applyScheduleAction, epistemicAction, refreshEpistemicBoard, type ScheduleListItem } from "../lib/runtime";

/* ------------------------------------------------------------- node meta */

type Meta = { title: string; sub: string; icon: ReactNode; tint?: string; desc: string; agent?: string };

const META: Record<string, Meta> = {
  founder: {
    title: "Founder / Inputs",
    sub: "Directives & Authority",
    icon: <Building2 size={26} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.founder,
    desc: "Founder authority boundary. High-level strategic directives, focus setting, and consequential approval gates originate here.",
  },
  core: {
    title: "Sophia",
    sub: "COO & Orchestrator",
    icon: <Bot size={28} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.sophia,
    desc: "Deconstructs founder directives, dispatches workstreams to governed specialists, and brings only verified outcomes or escalated decisions to you.",
    agent: "sophia",
  },
  coo: {
    title: "Sophia",
    sub: "COO & Orchestrator",
    icon: <Bot size={28} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.sophia,
    desc: "Deconstructs founder directives, dispatches workstreams to governed specialists, and brings only verified outcomes or escalated decisions to you.",
    agent: "sophia",
  },
  ops: {
    title: "Dr. Aris Thorne",
    sub: "Research & Intelligence",
    icon: <ClipboardList size={26} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.thorne,
    desc: "Executes structured research, competitive reconnaissance, and intelligence synthesis to produce typed artifacts.",
    agent: "ops",
  },
  researcher: {
    title: "Dr. Aris Thorne",
    sub: "Research & Intelligence",
    icon: <ClipboardList size={26} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.thorne,
    desc: "Executes structured research, competitive reconnaissance, and intelligence synthesis to produce typed artifacts.",
    agent: "ops",
  },
  finance: {
    title: "Julian Cruz",
    sub: "Finance & Unit Economics",
    icon: <Coins size={26} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.cruz,
    desc: "Governs deterministic unit economics, 80%+ gross margin floor verification, financial models, and pricing guardrails.",
    agent: "finance",
  },
  pm: {
    title: "Maya Lin",
    sub: "Product Architecture & PRD",
    icon: <FileText size={26} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.lin,
    desc: "Transforms research intelligence into structured PRDs, technical scope, acceptance criteria, and DAG protocol milestones.",
    agent: "pm",
  },
  verification: {
    title: "Constitutional Verifier",
    sub: "Deterministic Safety Gate",
    icon: <ShieldCheck size={26} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.verifier,
    desc: "Deterministic verification engine: Gross margin floor ≥ 80.0%, safe mock isolation, and single-use cryptographic signature binding.",
  },
  verifier: {
    title: "Constitutional Verifier",
    sub: "Deterministic Safety Gate",
    icon: <ShieldCheck size={26} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.verifier,
    desc: "Deterministic verification engine: Gross margin floor ≥ 80.0%, safe mock isolation, and single-use cryptographic signature binding.",
  },
  outcome: {
    title: "Governed Outcome",
    sub: "Immutable Vault",
    icon: <PackageCheck size={26} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.vault,
    desc: "Cryptographically verified deliverables and historical outcomes safely committed to durable company memory.",
  },
  vault: {
    title: "Governed Vault",
    sub: "Immutable Memory",
    icon: <PackageCheck size={26} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.vault,
    desc: "Cryptographically verified deliverables and historical outcomes safely committed to durable company memory.",
  },
  approval: {
    title: "Founder Approval Gate",
    sub: "Consequential Decision",
    icon: <Scale size={26} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.approval,
    desc: "Consequential external, resource, or security actions require authenticated Founder ratification before proceeding.",
  },
  "workflow-standby": {
    title: "Workflow Engine",
    sub: "Standby · Ready",
    icon: <ListTree size={26} strokeWidth={1.8} />,
    tint: WORKFLOW_COLORS.textMuted,
    desc: "Active workflow runtime standing by. Directives from Sophia dispatch structured workstreams through this channel.",
  },
};

const getMeta = (n: FlowNode): Meta => {
  if (n.type === "workflow") {
    const stepLabel = n.subtitle ?? "Work";
    const steps = n.dtoNode?.metadata?.executionSteps;
    const doneCount = steps?.filter((s) => s.status === "done" || s.status === "failed").length ?? 0;
    return {
      title: n.title,
      sub: stepLabel,
      icon: n.state === "complete" ? <PackageCheck size={24} strokeWidth={1.8} /> : <Activity size={24} strokeWidth={1.8} />,
      tint: n.state === "blocked" ? EXECUTION_LANGUAGE.blocked.bright : n.state === "complete" ? EXECUTION_LANGUAGE.completed.bright : n.state === "active" ? EXECUTION_LANGUAGE.running.bright : WORKFLOW_COLORS.textMuted,
      desc: steps
        ? `${stepLabel} · execution trail ${doneCount}/${steps.length} stages${n.activity ? ` · ${n.activity}` : ""}`
        : n.activity ?? `${stepLabel} actively governed under SamJuniorsOS protocol invariants.`,
      agent: n.owner,
    };
  }
  if (n.type === "approval") {
    return {
      title: n.title,
      sub: n.subtitle ?? "Founder Ratification",
      icon: <Scale size={26} strokeWidth={1.8} />,
      tint: ENTITY_IDENTITY.approval,
      desc: "Consequential action requires authenticated Founder approval before release.",
    };
  }
  if (n.type === "verification") {
    return {
      title: n.title,
      sub: n.subtitle ?? "Constitutional Verifier",
      icon: <ShieldCheck size={26} strokeWidth={1.8} />,
      tint: n.state === "blocked" ? ENTITY_IDENTITY.verifierBlocked : ENTITY_IDENTITY.verifier,
      desc: "Deterministic verification engine: Gross margin floor ≥ 80.0%, mock sandbox isolation, single-use cryptographic signature binding.",
    };
  }
  if (n.type === "outcome") {
    return {
      title: n.title,
      sub: n.subtitle ?? "Immutable Vault",
      icon: <PackageCheck size={26} strokeWidth={1.8} />,
      tint: ENTITY_IDENTITY.vault,
      desc: "Historical deliverables with cryptographic verification signatures committed to company memory.",
    };
  }
  return META[n.id] ?? {
    title: n.title,
    sub: n.subtitle ?? "",
    icon: <Bot size={26} strokeWidth={1.8} />,
    tint: ENTITY_IDENTITY.founder,
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
  /** Service-brand rendering key (official flat logo — approved reference). */
  serviceBrand?: string;
  /** Brand presentation: 'disc' (clean dark disc) or 'none' (self-shaped mark). */
  serviceContainer?: "disc" | "none";
};

/**
 * Phase 4.3C — Entity-identity-first visual resolution (LOCKED precedence).
 *
 * PRECEDENCE (founder contract — never regress):
 *   1. AGENT IDENTITY — resolved from authoritative id / type / role / owner
 *      BEFORE any activity/service keyword matching. Thorne renders as
 *      Thorne even when his current activity mentions "Google Search";
 *      Cruz renders as Cruz even when activity contains a service keyword;
 *      Lin renders as Lin under the same condition. Service activity text
 *      can NEVER overwrite agent identity. Unknown agent nodes render as a
 *      generic agent with their OWN title — still never a service card.
 *   2. Company/governance entities (founder, approval, verifier, vault).
 *   3. Work objects — rendered as work cards with their own visual.
 *   4. External service fallback — ONLY for genuinely unmatched external
 *      nodes; word-boundary matching on id/title ONLY (never on activity
 *      or subtitle text); renders the official flat brand logo per the
 *      approved reference.
 */
function getEntityVisual(n: FlowNode): EntityVisual {
  const isAgentNode = n.type === "agent" || n.dtoNode?.type === "agent";

  // ---- 1. AGENT IDENTITY (authoritative id/owner/role — never keywords) ----
  if (isAgentNode || n.id === "founder" || n.type === "founder" || n.dtoNode?.role === "founder") {
    if (n.id === "founder" || n.type === "founder" || n.dtoNode?.role === "founder") {
      return {
        icon: <Building2 size={24} strokeWidth={1.8} className="text-sky-300" />,
        tint: ENTITY_IDENTITY.founder,
        primaryLabel: "Founder / Authority",
        subLabel: "DIRECTIVES",
      };
    }
    if (n.id === "core" || n.id === "coo" || n.owner === "coo" || n.owner === "sophia" || n.dtoNode?.role === "coo") {
      return {
        icon: <Bot size={26} strokeWidth={1.8} className="text-orange-300" />,
        tint: ENTITY_IDENTITY.sophia,
        primaryLabel: "Sophia",
        subLabel: "COO & ORCHESTRATOR",
      };
    }
    if (n.id === "ops" || n.id === "researcher" || n.owner === "ops" || n.owner === "researcher" || n.dtoNode?.role === "researcher") {
      return {
        icon: <ClipboardList size={24} strokeWidth={1.8} className="text-cyan-300" />,
        tint: ENTITY_IDENTITY.thorne,
        primaryLabel: "Dr. Aris Thorne",
        subLabel: "RESEARCH SPECIALIST",
      };
    }
    if (n.id === "finance" || n.owner === "finance" || n.dtoNode?.role === "finance") {
      return {
        icon: <Coins size={24} strokeWidth={1.8} className="text-emerald-300" />,
        tint: ENTITY_IDENTITY.cruz,
        primaryLabel: "Julian Cruz",
        subLabel: "FINANCE SPECIALIST",
      };
    }
    if (n.id === "pm" || n.owner === "pm" || n.dtoNode?.role === "pm") {
      return {
        icon: <FileText size={24} strokeWidth={1.8} className="text-purple-300" />,
        tint: ENTITY_IDENTITY.lin,
        primaryLabel: "Maya Lin",
        subLabel: "PRODUCT ARCHITECT",
      };
    }
    // Unknown agent — generic agent visual with its OWN authoritative title.
    // Service keyword matching is NEVER consulted for agent nodes.
    return {
      icon: <Bot size={22} strokeWidth={1.8} className="text-cyan-300" />,
      tint: n.state === "blocked" ? EXECUTION_LANGUAGE.blocked.bright : n.state === "complete" ? EXECUTION_LANGUAGE.completed.bright : EXECUTION_LANGUAGE.running.bright,
      primaryLabel: n.title,
      subLabel: n.subtitle ?? "COMPANY AGENT",
    };
  }

  // ---- 2. Company/governance entities ----
  if (n.type === "approval" || n.id === "approval") {
    return {
      icon: <Scale size={24} strokeWidth={1.8} className="text-amber-300" />,
      tint: ENTITY_IDENTITY.approval,
      primaryLabel: "Founder Approval",
      subLabel: "RATIFICATION GATE",
    };
  }
  if (n.type === "verification" || n.id === "verification" || n.id === "verifier") {
    return {
      icon: <ShieldCheck size={24} strokeWidth={1.8} className={n.state === "blocked" ? "text-rose-400" : "text-emerald-400"} />,
      tint: n.state === "blocked" ? ENTITY_IDENTITY.verifierBlocked : ENTITY_IDENTITY.verifier,
      primaryLabel: "Constitutional Verifier",
      subLabel: "SAFETY GATE",
    };
  }
  if (n.type === "outcome" || n.id === "outcome" || n.id === "vault") {
    return {
      icon: <PackageCheck size={24} strokeWidth={1.8} className="text-emerald-400" />,
      tint: ENTITY_IDENTITY.vault,
      primaryLabel: "Governed Vault",
      subLabel: "IMMUTABLE MEMORY",
    };
  }

  // ---- 3. Work objects — first-class work cards ----
  if (n.type === "workflow") {
    const isDone = n.state === "complete";
    return {
      icon: isDone
        ? <PackageCheck size={22} strokeWidth={1.8} className="text-emerald-300" />
        : n.state === "blocked"
        ? <AlertTriangle size={22} strokeWidth={1.8} className="text-rose-300" />
        : n.state === "waiting"
        ? <Clock size={22} strokeWidth={1.8} className="text-amber-200" />
        : <Activity size={22} strokeWidth={1.8} className="text-cyan-300" />,
      tint: isDone ? EXECUTION_LANGUAGE.completed.bright : n.state === "blocked" ? EXECUTION_LANGUAGE.blocked.bright : n.state === "waiting" ? EXECUTION_LANGUAGE.approval.bright : EXECUTION_LANGUAGE.running.bright,
      primaryLabel: n.title,
      subLabel: (n.subtitle ?? "WORK").toUpperCase(),
    };
  }

  // ---- 4. External service fallback (ONLY for genuinely unmatched nodes) ----
  // Word-boundary matching on id/title ONLY — never on activity text
  // (service activity must not overwrite identity) — and never for agents.
  const text = `${n.id} ${n.title}`.toLowerCase();
  const brandVisual = (key: ServiceBrandKey): EntityVisual => {
    const brand = SERVICE_BRANDS[key];
    return {
      icon: <brand.Logo size={brand.container === "disc" ? 26 : 34} title={brand.label} />,
      tint: ENTITY_IDENTITY[key],
      primaryLabel: brand.label,
      subLabel: brand.sublabel,
      serviceBrand: brand.label,
      serviceContainer: brand.container,
    };
  };
  if (/\bgithub\b/.test(text)) return brandVisual("github");
  if (/\bslack\b/.test(text)) return brandVisual("slack");
  if (/\btelegram\b/.test(text)) return brandVisual("telegram");
  if (/\bwhatsapp\b/.test(text)) return brandVisual("whatsapp");
  if (/\bgmail\b|\bemail\b/.test(text)) return brandVisual("gmail");
  if (/\bgoogle\b|\bgemini\b/.test(text)) return brandVisual("google");

  // ---- 5. General unmatched node ----
  return {
    icon: <Bot size={22} strokeWidth={1.8} className="text-cyan-300" />,
    tint: n.state === "blocked" ? EXECUTION_LANGUAGE.blocked.bright : n.state === "complete" ? EXECUTION_LANGUAGE.completed.bright : EXECUTION_LANGUAGE.running.bright,
    primaryLabel: n.title,
    subLabel: n.subtitle ?? "COMPANY NODE",
  };
}

/** Owner metadata chip — execution metadata attached to work, per the locked model. */
const OWNER_VISUALS: Record<string, { label: string; tint: string; icon: ReactNode }> = {
  coo: { label: "Sophia", tint: ENTITY_IDENTITY.sophia, icon: <Bot size={11} strokeWidth={2} /> },
  researcher: { label: "Thorne", tint: ENTITY_IDENTITY.thorne, icon: <ClipboardList size={11} strokeWidth={2} /> },
  ops: { label: "Thorne", tint: ENTITY_IDENTITY.thorne, icon: <ClipboardList size={11} strokeWidth={2} /> },
  finance: { label: "Cruz", tint: ENTITY_IDENTITY.cruz, icon: <Coins size={11} strokeWidth={2} /> },
  pm: { label: "Lin", tint: ENTITY_IDENTITY.lin, icon: <FileText size={11} strokeWidth={2} /> },
};

const WORK_STATE_LABEL: Record<string, string> = {
  running: "RUNNING",
  active: "RUNNING",
  processing: "PROCESSING",
  waiting: "WAITING",
  paused: "PARKED",
  halted: "DECISION",
  blocked: "BLOCKED",
  failed: "BLOCKED",
  completed: "DELIVERED",
  complete: "DELIVERED",
  idle: "PARKED",
};

/**
 * Phase 4.3B.1 — WorkCard: the first-class actionable visual object.
 * Title · state · owner metadata · blocked/waiting indication. Phase 4.3E:
 * execution progress renders as the PROGRESSIVE PERIMETER on the card's own
 * rounded-rectangle shape (see ExecutionPerimeter) — the linear progress bar
 * was removed so the perimeter is the single progress visual; the honest
 * numeric trail count (settled/total authoritative stages) remains.
 * No ports (no automation wire-building affordances on the company canvas).
 */
function WorkCard({
  n,
  selected,
  hasSelection,
  badge,
  perimeter,
  onClick,
  onDoubleClick,
}: {
  n: FlowNode;
  selected?: boolean;
  hasSelection?: boolean;
  badge?: ReactNode;
  perimeter?: ExecutionPerimeterSpec | null;
  onClick?: (n: FlowNode) => void;
  onDoubleClick?: (n: FlowNode) => void;
}) {
  const dto = n.dtoNode;
  const visual = getEntityVisual(n);
  const steps = dto?.metadata?.executionSteps;
  const settledCount = steps?.filter((s) => s.status === "done" || s.status === "failed").length ?? 0;
  const total = steps?.length ?? 0;
  const owner = OWNER_VISUALS[dto?.owner ?? n.owner ?? ""];

  const runtime = dto?.runtimeState ?? n.state;
  const stateLabel = WORK_STATE_LABEL[runtime] ?? runtime.toUpperCase();
  const isBlocked = runtime === "failed" || runtime === "blocked";
  const isWaiting = runtime === "waiting" || runtime === "halted" || dto?.governanceState === "awaiting_founder_approval";
  const isDelivered = runtime === "completed" || runtime === "complete" || n.state === "complete";

  // Phase 4.1 presentation state mapping
  let nodeState: NodeStateType = "default";
  if (selected) {
    nodeState = "selected";
  } else if (dto?.presentationState) {
    nodeState = dto.presentationState === "waiting" ? "processing" : (dto.presentationState as NodeStateType);
  } else {
    if (n.state === "waiting") nodeState = "processing";
    else if (n.state === "blocked") nodeState = "error";
    else if (n.state === "active") nodeState = "active";
    else if (n.state === "complete") nodeState = "success";
  }

  let indicator: NodeIndicator | undefined = undefined;
  if (isWaiting) indicator = { status: "waiting", glow: true };
  else if (dto?.runtimeState === "running" || n.state === "active") indicator = { status: "active", glow: true };
  else if (isBlocked) indicator = { status: "error", glow: true };
  else if (isDelivered) indicator = { status: "success" };

  // Canonical execution-language chip (single source: EXECUTION_LANGUAGE)
  const stateChipClass = isBlocked
    ? EXECUTION_LANGUAGE.blocked.chip
    : isWaiting
    ? EXECUTION_LANGUAGE.approval.chip
    : isDelivered
    ? EXECUTION_LANGUAGE.completed.chip
    : EXECUTION_LANGUAGE.running.chip;

  const content = (
    <div className="flex h-full w-full flex-col justify-between p-3">
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 pt-0.5">
          <IconContainer variant="glass" color={visual.tint} glow={selected || nodeState === "active"} size="md">
            {visual.icon}
          </IconContainer>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`truncate text-left text-[12.5px] font-semibold leading-tight transition-colors duration-200 ${
              selected ? "text-cyan-100" : "text-slate-100"
            }`}
            title={n.title}
          >
            {n.title}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`rounded border px-1.5 py-px font-mono text-[8.5px] font-semibold tracking-[0.1em] ${stateChipClass}`}>
              {stateLabel}
            </span>
            {owner && (
              <span
                className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-px text-[8.5px] font-medium tracking-wide text-slate-300"
                style={{ color: owner.tint }}
                title={`Owner · ${owner.label}`}
              >
                {owner.icon}
                {owner.label}
              </span>
            )}
            {/* Single approval signal: the WAITING state chip above carries the
                frozen approval semantic — never a duplicated second chip. */}
          </div>
        </div>
      </div>
      {total > 0 && (
        <div className="mt-1.5 flex items-center justify-end">
          <span className="tnum font-mono text-[8.5px] tracking-wider text-slate-500" title="Authoritative execution trail">
            TRAIL {settledCount}/{total}
          </span>
        </div>
      )}
    </div>
  );

  const externalLabel = (
    <div className="flex flex-col items-center pointer-events-none select-none transition-all duration-200">
      <span className={`text-[9px] tracking-[0.16em] uppercase font-mono transition-colors duration-200 ${selected ? "text-cyan-300 font-medium" : "text-slate-500"}`}>
        {(n.subtitle ?? "work").toUpperCase()}
      </span>
    </div>
  );

  const isDimmed = hasSelection && !selected;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Work: ${n.title}`}
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
          id={`work-node-${n.id}`}
          geometry="squircle"
          state={nodeState}
          customWidth={n.w}
          customHeight={n.h}
          indicator={indicator}
          perimeter={perimeter ?? undefined}
          ports={[]}
          externalLabel={externalLabel}
          className="!m-0 h-full w-full"
        >
          {content}
        </Phase4Node>
        {badge && <div className="pointer-events-none absolute -right-1 -top-1 z-30">{badge}</div>}
      </div>
    </div>
  );
}

/**
 * Phase 4.3B.1 — Focus-reveal: the local workflow of a focused work object,
 * rendered on-canvas beneath the work card. Stages come exclusively from the
 * authoritative execution trail (dtoNode.metadata.executionSteps) — the
 * workflow is NOT a globally visible pipeline.
 */
function ExecutionTrailOverlay({ n }: { n: FlowNode }) {
  const steps = n.dtoNode?.metadata?.executionSteps;
  if (!steps || steps.length === 0) return null;
  const width = Math.max(n.w, steps.length * 96 + 32);

  return (
    <div
      className="pointer-events-none absolute z-20 rounded-2xl border border-cyan-300/20 bg-[#06101e]/94 p-2.5 shadow-[0_16px_44px_-14px_rgba(0,0,0,0.85)] backdrop-blur-md"
      style={{
        left: n.x - width / 2,
        top: n.y + n.h / 2 + 18,
        width,
        animation: `os-in 260ms ${EASE}`,
      }}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-200/90">Local workflow · execution trail</span>
        <span className="tnum font-mono text-[8.5px] tracking-wider text-slate-500">
          {steps.filter((s) => s.status === "done" || s.status === "failed").length}/{steps.length} STAGES
        </span>
      </div>
      <div className="flex items-stretch gap-1.5">
        {steps.map((s, i) => {
          // Canonical execution-language stage dots (single source)
          const dotClass =
            s.status === "done"
              ? `${EXECUTION_LANGUAGE.completed.fill} ${EXECUTION_LANGUAGE.completed.glow}`
              : s.status === "failed"
              ? `${EXECUTION_LANGUAGE.blocked.fill} ${EXECUTION_LANGUAGE.blocked.glow}`
              : s.status === "current"
              ? `${EXECUTION_LANGUAGE.running.fill} ${EXECUTION_LANGUAGE.running.glow} animate-pulse`
              : s.status === "waiting"
              ? `${EXECUTION_LANGUAGE.approval.fill} ${EXECUTION_LANGUAGE.approval.glow}`
              : EXECUTION_LANGUAGE.idle.fill;
          const owner = OWNER_VISUALS[s.ownerAgentId ?? ""];
          return (
            <div key={`${s.step}-${i}`} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-center gap-1">
                {i > 0 && <div className={`h-px flex-1 ${i <= steps.findIndex((x) => x.status !== "done") ? EXECUTION_LANGUAGE.completed.fillSoft : "bg-white/10"}`} />}
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                {i < steps.length - 1 && <div className="h-px flex-1 bg-white/10" />}
              </div>
              <span
                className={`text-center text-[8.5px] font-medium leading-tight ${
                  s.status === "pending" ? "text-slate-600" : s.status === "failed" ? "text-rose-200" : "text-slate-300"
                }`}
              >
                {s.label}
              </span>
              {owner ? (
                <span className="text-[7.5px] font-mono uppercase tracking-wide" style={{ color: `${owner.tint}cc` }}>
                  {owner.label}
                </span>
              ) : (
                <span className="text-[7.5px] font-mono uppercase tracking-wide text-slate-700">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Phase 4.3B.1 — semantic region zone chrome. Pure presentation: labels the
 * spatial structure of the company context; contains no fabricated data.
 */
function RegionZone({ label, sub, x, y, w, h, quiet }: { label: string; sub?: string; x: number; y: number; w: number; h: number; quiet?: boolean }) {
  return (
    <div
      className="pointer-events-none absolute rounded-[26px] border border-white/[0.06]"
      style={{ left: x - w / 2, top: y - h / 2, width: w, height: h }}
    >
      <div className="absolute left-4 top-3 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-600">{label}</span>
        {sub && <span className="max-w-[420px] truncate text-[9px] tracking-[0.14em] text-slate-700">{sub}</span>}
      </div>
      {quiet && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] tracking-[0.24em] text-slate-700">
          — NO ACTIVE WORK · COMPANY CALM —
        </div>
      )}
    </div>
  );
}

function Phase4NodeCard({
  n,
  selected,
  hasSelection,
  badge,
  perimeter,
  onClick,
  onDoubleClick,
}: {
  n: FlowNode;
  selected?: boolean;
  hasSelection?: boolean;
  badge?: ReactNode;
  perimeter?: ExecutionPerimeterSpec | null;
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

  // 4. Phase 4.3B.1 — NO ports on the company canvas: port affordances belong
  // to the automation-builder aesthetic (see /design-system/workflow specimen),
  // not to the founder-facing spatial company context.

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
  //    External service nodes render the approved brand treatment: ONLY the
  //    official flat logo in a clean dark disc (no glass, no glow, no tint
  //    overlay) — "just the logo and shape, with the name below".
  const iconSize = n.kind === "core" ? "lg" : n.w <= 56 ? "sm" : "md";
  const content = visual.serviceBrand ? (
    visual.serviceContainer === "none" ? (
      <div className="flex items-center justify-center" style={{ filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.45))" }}>
        {visual.icon}
      </div>
    ) : (
      <IconContainer variant="brand" size={iconSize}>
        <span style={{ display: "flex", lineHeight: 0 }}>{visual.icon}</span>
      </IconContainer>
    )
  ) : (
    <IconOnlyContent
      icon={visual.icon}
      iconVariant={geometry === "squircle" ? "squircle" : "glass"}
      color={visual.tint}
      glow={selected || nodeState === "active"}
      size={iconSize}
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
          perimeter={perimeter ?? undefined}
          ports={[]}
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
  // Canonical execution-language badges (cyan=running, amber=approval, rose=blocked)
  const c = tone === "amber"
    ? `bg-amber-300 text-[#1a1200] shadow-[0_0_10px_rgba(252,211,77,0.8)]`
    : tone === "rose"
    ? `${EXECUTION_LANGUAGE.blocked.fill} text-white ${EXECUTION_LANGUAGE.blocked.glow}`
    : `${EXECUTION_LANGUAGE.running.fill} text-[#04121b] ${EXECUTION_LANGUAGE.running.glow}`;
  return <span className={`tnum absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold ${c}`}>{n}</span>;
}

function StateDot({ state }: { state: Agent["state"] }) {
  // Canonical execution-language agent-state dots: working=green (on it),
  // waiting=amber (decision), idle=cyan (available), offline=neutral.
  const c = state === "working"
    ? `${EXECUTION_LANGUAGE.completed.fill} shadow-[0_0_8px_rgba(34,217,122,0.9)]`
    : state === "waiting"
    ? `${EXECUTION_LANGUAGE.approval.fill} shadow-[0_0_8px_rgba(255,196,102,0.9)]`
    : state === "offline"
    ? EXECUTION_LANGUAGE.idle.fill
    : `${EXECUTION_LANGUAGE.running.fill} shadow-[0_0_8px_rgba(102,209,255,0.8)]`;
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
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/14 bg-[#23262E]">
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

/** Phase 4.4C — the AUTHORITATIVE company Activity list. Server-projected
 *  events from GET /api/activity (what the company actually did, from
 *  persisted records — survives reload/restart by construction). The client
 *  os.log is NOT merged in here: it remains an ambient browser-session
 *  supplement and is never presented as company history. */
function CompanyActivityList() {
  const activity = useOS((s) => s.activity);
  if (activity.length === 0) {
    return (
      <p className="py-2 text-[11.5px] leading-snug text-slate-500">
        No company activity recorded yet. Real executions, approvals and
        automation lifecycle events will appear here — nothing is simulated.
      </p>
    );
  }
  return (
    <div className="os-scroll max-h-[340px] overflow-y-auto pr-0.5">
      {activity.map((e) => (
        <ActivitySurface key={e.id} event={e} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------
 * Phase 4.4E — FOUNDER EPISTEMIC BOARD.
 *
 * The smallest founder surface needed to operate the EXISTING epistemic
 * pipeline: review pending claims (with their provenance/evidence lineage),
 * verify or reject them, promote verified claims to Facts, and promote
 * Facts to Memory. Everything advances ONLY through the founder-gated
 * /api/epistemic actions; the board is a server projection and is never
 * optimistically mutated locally.
 *
 * Visual honesty rules (governance):
 * - PENDING claims are always labeled "AI proposed — not company truth".
 * - VERIFIED means the founder verification passed — the fact promotion is
 *   a separate explicit step.
 * - FACTS are labeled "Founder-verified company truth".
 * - MEMORY is labeled "historical precedent — NOT new empirical evidence".
 * - Seed/demo memories are labeled as having no fact lineage.
 * ------------------------------------------------------------------------- */

const EPISTEMIC_STAGE_STYLE: Record<string, string> = {
  pending: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  verified: "border-cyan-300/40 bg-cyan-300/10 text-cyan-200",
  fact: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  rejected: "border-rose-400/40 bg-rose-400/10 text-rose-200",
};

function EpistemicStageChip({ stage }: { stage: string }) {
  return (
    <span className={`shrink-0 rounded border px-1 py-px font-mono text-[8.5px] font-semibold uppercase tracking-[0.14em] ${EPISTEMIC_STAGE_STYLE[stage] ?? EPISTEMIC_STAGE_STYLE.pending}`}>
      {stage}
    </span>
  );
}

function EpistemicBoardCard() {
  const board = useOS((s) => s.epistemic);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const act = async (key: string, action: "verify_claim" | "reject_claim" | "promote_to_fact" | "promote_to_memory", payload: Record<string, unknown>) => {
    if (busy) return;
    setBusy(key);
    try {
      const res = await epistemicAction(action, payload);
      if (res.ok) {
        osSound.click();
        os.log(`Epistemic board: ${action.replace(/_/g, " ")} accepted by the server.`);
      } else {
        os.log(`Epistemic ${action.replace(/_/g, " ")} failed: ${res.error}`);
      }
      // The board is ALWAYS re-projected from the server — the UI never
      // locally advances governed epistemic state.
      await refreshEpistemicBoard();
    } finally {
      setBusy(null);
    }
  };

  if (!board) {
    return (
      <p className="py-2 text-[11.5px] leading-snug text-slate-500">
        Epistemic board not synced yet. Claims, facts and governed memory will
        appear here once the server projection loads — nothing is simulated.
      </p>
    );
  }

  const pendingClaims = board.claims.filter((c) => c.stage === "pending");
  const verifiedClaims = board.claims.filter((c) => c.stage === "verified");
  const settledClaims = board.claims.filter((c) => c.stage === "fact" || c.stage === "rejected");
  const reviewable = [...pendingClaims, ...verifiedClaims, ...settledClaims];

  return (
    <div>
      {/* Lifecycle strip: PENDING → VERIFIED → FACT → MEMORY */}
      <div className="mb-2 flex items-center justify-between gap-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[9px] font-mono uppercase tracking-[0.12em]">
        <span className="text-amber-200/90">{board.counts.pending} pend</span>
        <ArrowRight size={9} className="text-slate-600" />
        <span className="text-cyan-200/90">{board.counts.verified} verif</span>
        <ArrowRight size={9} className="text-slate-600" />
        <span className="text-emerald-200/90">{board.counts.activeFacts} fact</span>
        <ArrowRight size={9} className="text-slate-600" />
        <span className="text-violet-200/90">{board.counts.memoriesWithFactLineage} mem</span>
      </div>

      {/* Claims — AI-proposed, never silently company truth */}
      <div className="os-scroll max-h-[340px] space-y-1.5 overflow-y-auto pr-0.5">
        {reviewable.length === 0 && (
          <p className="py-1 text-[11px] leading-snug text-slate-500">
            No epistemic claims recorded yet. Agent work and gated research
            will submit candidate claims here for founder verification.
          </p>
        )}
        {reviewable.map((c) => {
          const isOpen = expanded === c.id;
          const canVerify = c.stage === "pending" && !busy;
          const canReject = (c.stage === "pending" || c.stage === "verified") && !busy;
          const canPromote = c.stage === "verified" && !busy;
          return (
            <div key={c.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-1.5">
              <button
                type="button"
                onClick={() => { osSound.click(); setExpanded(isOpen ? null : c.id); }}
                className="w-full text-left"
              >
                <span className="flex items-start gap-1.5">
                  <EpistemicStageChip stage={c.stage} />
                  <span className={`min-w-0 flex-1 text-[10.5px] leading-snug ${c.stage === "fact" ? "text-emerald-100/90" : c.stage === "rejected" ? "text-slate-500 line-through decoration-rose-400/40" : "text-slate-300"}`}>
                    {c.statement.length > 150 && !isOpen ? `${c.statement.slice(0, 150)}…` : c.statement}
                  </span>
                </span>
                <span className="mt-1 block truncate font-mono text-[8.5px] text-slate-600" title={`${c.proposedBy} proposed this claim${c.agentRunId ? ` · run ${c.agentRunId}` : ""}`}>
                  AI proposed ({c.proposedBy}){c.agentRunId ? ` · run ${c.agentRunId.slice(0, 16)}` : ""} · {c.category}
                </span>
                <span className="mt-0.5 flex items-center gap-1 truncate font-mono text-[8.5px] text-slate-600" title={c.lineage ? `Source: ${c.lineage.source.title}` : "No evidence source — model takeaway without recorded external evidence"}>
                  {c.lineage ? (
                    <>
                      <span className="text-cyan-300/70">evidence:</span>
                      <span className="truncate">{c.lineage.source.sourceSystem}{c.lineage.signal ? ` → ${c.lineage.signal.signalType}` : ""}</span>
                    </>
                  ) : (
                    <span className="text-slate-600/80">no evidence source (AI takeaway)</span>
                  )}
                </span>
              </button>

              {isOpen && (
                <div className="mt-1.5 space-y-1.5 border-t border-white/[0.06] pt-1.5">
                  {c.lineage && (
                    <div className="rounded bg-black/30 p-1.5 font-mono text-[8.5px] leading-relaxed text-slate-400">
                      <div className="text-cyan-300/80">SOURCE</div>
                      <div className="truncate" title={c.lineage.source.title}>{c.lineage.source.title}</div>
                      {c.lineage.source.uri && (
                        <a href={c.lineage.source.uri} target="_blank" rel="noreferrer" className="block truncate text-cyan-400/80 underline decoration-cyan-400/30 hover:text-cyan-300" onClick={(e) => e.stopPropagation()}>
                          {c.lineage.source.uri}
                        </a>
                      )}
                      <div className="mt-1 text-slate-600">captured {new Date(c.lineage.source.capturedAt).toLocaleString()} · {c.lineage.source.provenanceKind}</div>
                      {c.lineage.signal && (
                        <>
                          <div className="mt-1 text-cyan-300/80">SIGNAL</div>
                          <div className="line-clamp-3">{c.lineage.signal.extractedObservation}</div>
                        </>
                      )}
                    </div>
                  )}
                  {c.verification && (
                    <div className={`rounded p-1.5 font-mono text-[8.5px] leading-relaxed ${c.verification.passed ? "bg-cyan-400/5 text-cyan-200/70" : "bg-rose-400/5 text-rose-200/70"}`}>
                      <div>{c.verification.passed ? "VERIFIED" : "NOT PASSED"} · {c.verification.policyOutcome}</div>
                      <div className="text-slate-500">by {c.verification.verifiedBy}</div>
                    </div>
                  )}
                  {c.rejectionReason && (
                    <p className="rounded bg-rose-400/5 p-1.5 text-[9px] leading-snug text-rose-200/70">{c.rejectionReason}</p>
                  )}
                  {c.stage === "fact" && (
                    <p className="text-[9px] leading-snug text-emerald-200/70">Founder verification established this as company truth.</p>
                  )}
                  {(canVerify || canReject || canPromote) && (
                    <div className="flex gap-1">
                      {canVerify && (
                        <button
                          onClick={() => act(c.id, "verify_claim", { claimId: c.id, decision: "approve_and_promote", reason: "Founder verification via SamJuniorsOS epistemic board" })}
                          className="flex-1 rounded-lg border border-cyan-300/40 bg-cyan-400/15 py-1 text-center text-[9.5px] font-semibold text-cyan-100 hover:bg-cyan-400/25 active:scale-95"
                        >
                          Verify
                        </button>
                      )}
                      {canReject && (
                        <button
                          onClick={() => act(c.id, "reject_claim", { claimId: c.id, reason: "Founder rejected this claim from the SamJuniorsOS epistemic board" })}
                          className="flex-1 rounded-lg border border-rose-400/30 bg-rose-400/15 py-1 text-center text-[9.5px] font-semibold text-rose-200 hover:bg-rose-400/25 active:scale-95"
                        >
                          Reject
                        </button>
                      )}
                      {canPromote && (
                        <button
                          onClick={() => act(c.id, "promote_to_fact", { claimId: c.id })}
                          className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-400/15 py-1 text-center text-[9.5px] font-semibold text-emerald-200 hover:bg-emerald-400/25 active:scale-95"
                        >
                          Promote to Fact
                        </button>
                      )}
                    </div>
                  )}
                  {busy === c.id && <p className="text-center font-mono text-[8.5px] text-slate-500">advancing via server…</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Facts — founder-verified company truth */}
      {board.facts.length > 0 && (
        <div className="mt-2 border-t border-white/[0.06] pt-2">
          <div className="mb-1 flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.16em] text-slate-500">
            <span>Founder-Verified Facts</span>
            <span className="text-emerald-300/80">{board.counts.activeFacts}</span>
          </div>
          <div className="os-scroll max-h-[180px] space-y-1 overflow-y-auto pr-0.5">
            {board.facts.map((f) => (
              <div key={f.id} className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] p-1.5">
                <p className="text-[10px] leading-snug text-emerald-100/80">{f.statement}</p>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className="truncate font-mono text-[8px] text-slate-600" title={`Promoted by ${f.promotedBy} at ${f.promotedAt}`}>
                    by {f.promotedBy} · {new Date(f.promotedAt).toLocaleDateString()}
                  </span>
                  {f.promotedToMemory ? (
                    <span className="shrink-0 rounded border border-violet-300/30 bg-violet-300/10 px-1 py-px font-mono text-[8px] uppercase tracking-wide text-violet-200">in memory</span>
                  ) : (
                    <button
                      disabled={!!busy}
                      onClick={() => act(f.id, "promote_to_memory", { factId: f.id, approvedAction: f.statement, executionOutcome: `Promoted canonical fact regarding ${f.subject}` })}
                      className="shrink-0 rounded border border-violet-300/40 bg-violet-300/15 px-1.5 py-px font-mono text-[8px] uppercase tracking-wide text-violet-100 hover:bg-violet-300/25 active:scale-95 disabled:opacity-40"
                    >
                      → memory
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memory — historical precedent, never new evidence */}
      {board.memories.length > 0 && (
        <div className="mt-2 border-t border-white/[0.06] pt-2">
          <div className="mb-1 flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.16em] text-slate-500">
            <span>Company Memory</span>
            <span className="text-violet-300/80">{board.counts.memoriesWithFactLineage + board.counts.seedMemories}</span>
          </div>
          <div className="os-scroll max-h-[160px] space-y-1 overflow-y-auto pr-0.5">
            {board.memories.map((m) => (
              <div key={m.id} className={`rounded-lg border p-1.5 ${m.origin === "fact_lineage" ? "border-violet-300/20 bg-violet-300/[0.04]" : "border-white/[0.07] bg-white/[0.02]"}`}>
                <p className={`text-[10px] leading-snug ${m.origin === "fact_lineage" ? "text-violet-100/80" : "text-slate-400"}`}>{m.approvedAction}</p>
                <p className="mt-0.5 font-mono text-[8px] text-slate-600">
                  {m.origin === "fact_lineage"
                    ? "historical precedent — NOT new evidence · fact lineage"
                    : "seed/demo record — no fact lineage (unverified origin)"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-1.5 border-t border-white/[0.06] pt-1.5 text-[8.5px] uppercase tracking-[0.18em] text-slate-600">
        AI proposed · Founder verifies · /api/epistemic
      </p>
    </div>
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
          // Canonical minimap dots: identity axis first, then execution state
          const color = n.id === "core" || n.id === "coo"
            ? ENTITY_IDENTITY.sophia
            : n.state === "blocked"
            ? EXECUTION_LANGUAGE.blocked.bright
            : n.state === "complete"
            ? EXECUTION_LANGUAGE.completed.bright
            : n.type === "approval"
            ? ENTITY_IDENTITY.approval
            : n.id === "finance"
            ? ENTITY_IDENTITY.cruz
            : n.id === "pm"
            ? ENTITY_IDENTITY.lin
            : n.type === "workflow"
            ? EXECUTION_LANGUAGE.running.bright
            : ENTITY_IDENTITY.thorne;
          return <circle key={n.id} cx={p.x} cy={p.y} r={n.type === "workflow" ? 3 : n.id === "core" || n.id === "coo" ? 3.2 : n.kind === "round" ? 2.4 : 1.8} fill={color} opacity={0.9} />;
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
  const activity = useOS((s) => s.activity);
  const epistemic = useOS((s) => s.epistemic);
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

  // Phase 4.4A — honest automation heartbeat status (authoritative projection;
  // never fabricated — failures keep the previous real state or show unavailable).
  const [autoStatus, setAutoStatus] = useState<{
    status: "loading" | "ok" | "unavailable";
    data: SchedulerStatusProjection | null;
    error: string | null;
  }>({ status: "loading", data: null, error: null });
  const [autoPanelOpen, setAutoPanelOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadAuto = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const res = await fetchSchedulerStatus();
      if (cancelled) return;
      if (res.success) {
        setAutoStatus({ status: "ok", data: res.data, error: null });
      } else {
        setAutoStatus((prev) => ({
          status: prev.data ? "ok" : "unavailable",
          data: prev.data,
          error: res.error,
        }));
      }
    };
    loadAuto();
    const interval = setInterval(loadAuto, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Derived presentation for the AUTO chip — computed from real timestamps only.
  const autoView = useMemo(() => {
    if (autoStatus.status === "loading") return { tone: "loading" as const, label: "AUTO", detail: "Automation status loading…" };
    if (autoStatus.status === "unavailable") return { tone: "offline" as const, label: "AUTO OFFLINE", detail: autoStatus.error ?? "Scheduler status unavailable" };
    const hb = autoStatus.data?.lastHeartbeat ?? null;
    if (!hb) return { tone: "silent" as const, label: "AUTO · NO BEAT", detail: "No scheduler evaluation has been recorded yet — shown honestly, not fabricated." };
    const ageMs = Date.now() - new Date(hb.evaluatedAt).getTime();
    const ageLabel = ageMs < 60_000 ? `${Math.max(1, Math.round(ageMs / 1000))}s` : ageMs < 3_600_000 ? `${Math.round(ageMs / 60_000)}m` : `${Math.round(ageMs / 3_600_000)}h`;
    const stale = ageMs > 300_000; // conservative staleness hint, derived from the real timestamp
    return {
      tone: stale ? ("stale" as const) : ("live" as const),
      label: `AUTO · ${ageLabel}`,
      detail: `Last evaluation ${ageLabel} ago (${hb.triggerSource}) · ${hb.processedCount} due item(s) · ${hb.executedCount} executed${hb.awaitingApprovalCount ? ` · ${hb.awaitingApprovalCount} awaiting approval` : ""}${stale ? " · stale: expected a more recent beat" : ""}`,
    };
  }, [autoStatus]);

  // ---------------------------------------------------------------- Phase 4.4B
  // Minimal founder-facing automation lifecycle on the EXISTING automation
  // surface: create a scheduled directive + pause/resume/cancel. Every value
  // comes from the authoritative server; failures surface honestly and never
  // fake success. This is deliberately NOT a canvas/builder UI.
  const [schedules, setSchedules] = useState<ScheduleListItem[] | null>(null);
  const [schedulesBusy, setSchedulesBusy] = useState(false);
  const [schedFormOpen, setSchedFormOpen] = useState(false);
  const [schedDraft, setSchedDraft] = useState({
    directive: "",
    intervalValue: "1",
    intervalUnit: "weeks" as "minutes" | "hours" | "days" | "weeks",
    startAt: "",
    requiresApproval: false,
  });
  const [schedError, setSchedError] = useState<string | null>(null);

  const loadSchedules = useCallback(async () => {
    try {
      const list = await fetchSchedules();
      setSchedules(list);
    } catch {
      // Honest: keep previous real list (or null) — never fabricate.
      setSchedules((prev) => prev);
    }
  }, []);

  useEffect(() => {
    if (autoPanelOpen) {
      loadSchedules();
    }
  }, [autoPanelOpen, loadSchedules]);

  const submitSchedule = useCallback(async () => {
    const directive = schedDraft.directive.trim();
    if (!directive) {
      setSchedError("Write the directive first — e.g. “Research our competitors and recommend pricing.”");
      return;
    }
    setSchedulesBusy(true);
    setSchedError(null);
    try {
      const intervalValue = Math.max(1, Math.round(Number(schedDraft.intervalValue) || 1));
      const created = await createScheduledDirective({
        directive,
        scheduleType: "recurring",
        intervalUnit: schedDraft.intervalUnit,
        intervalValue,
        executeAt: schedDraft.startAt ? new Date(schedDraft.startAt).toISOString() : undefined,
        requiresApproval: schedDraft.requiresApproval,
      });
      osSound.click();
      os.log(`Directive scheduled — automation will run it every ${intervalValue} ${schedDraft.intervalUnit.replace(/s$/, "")}${intervalValue > 1 ? "s" : ""} (next: ${new Date(created.executeAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}).`);
      setSchedDraft((d) => ({ ...d, directive: "", startAt: "" }));
      setSchedFormOpen(false);
      await loadSchedules();
      // Refresh the honest heartbeat projection so Next due reflects creation.
      fetchSchedulerStatus().then((res) => {
        if (res.success) setAutoStatus({ status: "ok", data: res.data, error: null });
      }).catch(() => undefined);
    } catch (err) {
      setSchedError(err instanceof Error ? err.message : String(err));
    } finally {
      setSchedulesBusy(false);
    }
  }, [schedDraft, loadSchedules]);

  const onScheduleAction = useCallback(async (scheduleId: string, action: "pause" | "resume" | "cancel") => {
    setSchedulesBusy(true);
    setSchedError(null);
    try {
      await applyScheduleAction(scheduleId, action);
      osSound.click();
      os.log(`Automation schedule ${action}d.`);
      await loadSchedules();
      fetchSchedulerStatus().then((res) => {
        if (res.success) setAutoStatus({ status: "ok", data: res.data, error: null });
      }).catch(() => undefined);
    } catch (err) {
      setSchedError(err instanceof Error ? err.message : String(err));
    } finally {
      setSchedulesBusy(false);
    }
  }, [loadSchedules]);

  const scheduleStatusView = useCallback((s: ScheduleListItem): { label: string; cls: string } => {
    const latest = s.executionHistory?.[s.executionHistory.length - 1];
    if (s.status === "scheduled" && latest?.status === "awaiting_approval") {
      return { label: "AWAITING YOUR APPROVAL", cls: "text-amber-300 bg-amber-400/10 border-amber-400/25" };
    }
    switch (s.status) {
      case "scheduled": return { label: "ACTIVE", cls: "text-emerald-300 bg-emerald-400/10 border-emerald-400/25" };
      case "paused": return { label: "PAUSED", cls: "text-slate-300 bg-white/8 border-white/15" };
      case "completed": return { label: "COMPLETED", cls: "text-cyan-300 bg-cyan-400/10 border-cyan-400/25" };
      case "failed": return { label: "FAILED", cls: "text-rose-300 bg-rose-400/10 border-rose-400/25" };
      case "cancelled": return { label: "CANCELLED", cls: "text-slate-400 bg-white/5 border-white/10" };
      default: return { label: s.status.toUpperCase(), cls: "text-slate-300 bg-white/8 border-white/15" };
    }
  }, []);

  const nextRunLabel = useCallback((s: ScheduleListItem): string => {
    if (s.status === "completed" || s.status === "cancelled" || s.status === "failed") {
      const hist = s.executionHistory ?? [];
      const last = hist[hist.length - 1];
      return last?.triggeredAt
        ? `last run ${new Date(last.triggeredAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
        : "never ran";
    }
    const when = new Date(s.executeAt);
    const overdue = when.getTime() <= Date.now();
    return `${overdue ? "due now" : `next ${when.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}`;
  }, []);

  // Dynamically derive genuine living SamJuniorsOS graph from server-authoritative GraphDTO
  const graph = useMemo(() => {
    if (graphState.data && graphState.status === "success") {
      return mapGraphDTOToFlowModel(graphState.data);
    }
    return deriveGraph(osState);
  }, [graphState.data, graphState.status, osState]);

  // Phase 4.3B.1 — semantic work zones from the view model (deterministic)
  const workNodes = useMemo(() => graph.nodes.filter((n) => n.type === "workflow"), [graph.nodes]);
  const activeWorkNodes = useMemo(
    () => workNodes.filter((n) => { const r = n.dtoNode?.runtimeState ?? n.state; return !(r === "completed" || r === "complete" || r === "paused" || r === "idle" || r === "waiting"); }),
    [workNodes]
  );
  const parkedWorkNodes = useMemo(
    () => workNodes.filter((n) => { const r = n.dtoNode?.runtimeState ?? n.state; return r === "paused" || r === "idle" || r === "waiting"; }),
    [workNodes]
  );
  const deliveredWorkNodes = useMemo(
    () => workNodes.filter((n) => { const r = n.dtoNode?.runtimeState ?? n.state; return r === "completed" || r === "complete"; }),
    [workNodes]
  );

  /**
   * Phase 4.3B.1 — default canvas edge visibility by semantic layer:
   *   context (delegates plumbing)  → never drawn (inspector-only)
   *   governance (escalations)      → always drawn (amber)
   *   structural (verifier→vault)   → always drawn (faint)
   *   ownership (agent↔work)        → drawn when live/blocked or focused
   */
  const nodeById = useMemo(() => {
    const m = new Map<string, FlowNode>();
    for (const n of graph.nodes) m.set(n.id, n);
    return m;
  }, [graph.nodes]);

  const isEdgeVisible = useCallback(
    (e: FlowEdge): boolean => {
      switch (e.layer) {
        case "context":
          return false;
        case "governance":
        case "structural":
          return true;
        case "ownership":
        default: {
          if (e.state === "active" || e.state === "blocked") return true;
          if (selected && (e.from === selected.id || e.to === selected.id)) return true;
          return false;
        }
      }
    },
    [selected]
  );

  const visibleEdges = useMemo(
    () => graph.edges.filter((e) => isEdgeVisible(e)),
    [graph.edges, isEdgeVisible]
  );

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
    // Only visibly-drawn edges participate in canvas kinetics — packets never
    // travel along hidden orchestration plumbing.
    engineRef.current?.setGraph({ nodes: graph.nodes, edges: visibleEdges, spatialCards: graph.spatialCards });
  }, [graph, visibleEdges]);

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

  const animateTo = useCallback((target: { x: number; y: number; k: number }) => {
    cancelAnimationFrame(animId.current);
    cancelAnimationFrame(momentumRaf.current);
    const end = clamp(target.x, target.y, Math.min(MAX_K, Math.max(MIN_K, target.k)));
    // Phase 4.5 — reduced motion: programmatic camera moves snap directly
    // to the deterministic final state (no glide).
    if (typeof window !== "undefined" && typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCam(end);
      return;
    }
    // Phase 4.5 — critically-damped spring (damping ratio = 1): no
    // overshoot, no oscillation — physical coherence, not spectacle.
    // Direct manipulation (drag / wheel / pinch) is untouched and stays 1:1.
    // The spring converges to the EXACT clamped target (snap on settle), so
    // target positions stay deterministic.
    const { omega, dampingRatio, settleEpsilon } = SPATIAL_TOKENS.springCamera;
    let px = camRef.current.x, py = camRef.current.y, pk = camRef.current.k;
    let vx = 0, vy = 0, vk = 0;
    let last = performance.now();
    const kEps = settleEpsilon * 0.02;
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      // Semi-implicit Euler per axis: a = −2ζω·v − ω²·(p − target). With
      // ζ = 1 the approach is monotonic (stable for ω·dt ≤ 2; dt ≤ 0.05).
      const c = 2 * dampingRatio * omega;
      vx += (-c * vx - omega * omega * (px - end.x)) * dt;
      vy += (-c * vy - omega * omega * (py - end.y)) * dt;
      vk += (-c * vk - omega * omega * (pk - end.k)) * dt;
      px += vx * dt;
      py += vy * dt;
      pk += vk * dt;
      const settled =
        Math.abs(px - end.x) < settleEpsilon &&
        Math.abs(py - end.y) < settleEpsilon &&
        Math.abs(pk - end.k) < kEps &&
        Math.abs(vx) < settleEpsilon &&
        Math.abs(vy) < settleEpsilon &&
        Math.abs(vk) < kEps;
      if (settled) {
        setCam(end); // deterministic snap to the exact target
        return;
      }
      setCam(clamp(px, py, pk));
      animId.current = requestAnimationFrame(tick);
    };
    animId.current = requestAnimationFrame(tick);
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
  }, []);

  /** Phase 4.5 — discrete zoom transitions (double-click, keyboard +/-)
   *  travel through the critically-damped spring camera; continuous wheel
   *  and pinch gestures keep the direct 1:1 zoomAt path. Same anchored-zoom
   *  target math as zoomAt — deterministic end state. */
  const zoomToAnimated = useCallback((mx: number, my: number, factor: number) => {
    const vw = vwRef.current, vh = vhRef.current;
    const prev = camRef.current;
    const nk = Math.min(MAX_K, Math.max(MIN_K, prev.k * factor));
    if (Math.abs(nk - prev.k) < 1e-6) return;
    const f = nk / prev.k;
    animateTo({
      x: mx - vw / 2 - ((mx - vw / 2 - prev.x) * f),
      y: my - vh / 2 - ((my - vh / 2 - prev.y) * f),
      k: nk,
    });
  }, [animateTo]);

  const fitView = useCallback(() => { osSound.click(); animateTo({ x: 0, y: 0, k: Math.min(vwRef.current / WORLD.W, vhRef.current / WORLD.H) * 0.94 }); }, [animateTo]);
  const recenter = useCallback(() => { osSound.click(); animateTo({ x: 0, y: 0, k: camRef.current.k }); }, [animateTo]);
  const jumpTo = useCallback((wx: number, wy: number) => { osSound.click(); const k = camRef.current.k; animateTo({ x: -(wx - WORLD.CX) * k, y: -(wy - WORLD.CY) * k, k }); }, [animateTo]);
  const focusNode = useCallback((n: FlowNode) => {
    const fit = Math.min(vwRef.current / WORLD.W, vhRef.current / WORLD.H) * 0.94;
    const k = Math.min(1.5, Math.max(camRef.current.k, fit * 1.7));
    animateTo({ x: -(n.x - WORLD.CX) * k, y: -(n.y - WORLD.CY) * k, k });
  }, [animateTo]);

  const focusActiveWork = useCallback(() => {
    osSound.click();
    // Phase 4.3B.1 — work objects first: the founder's actionable focus
    const runningWork = graph.nodes.find(
      (n) => n.type === "workflow" && (n.dtoNode?.runtimeState === "running" || n.state === "active")
    );
    const activeNode = runningWork ??
      graph.nodes.find(
        (n) =>
          n.type === "workflow" &&
          (n.dtoNode?.governanceState === "awaiting_founder_approval" || n.dtoNode?.runtimeState === "failed" || n.state === "blocked")
      ) ??
      graph.nodes.find(
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
      if (e.key === "+" || e.key === "=") zoomToAnimated(vw / 2, vh / 2, 1.15);
      else if (e.key === "-" || e.key === "_") zoomToAnimated(vw / 2, vh / 2, 1 / 1.15);
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
  }, [zoomAt, zoomToAnimated, fitView]);

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
    // Phase 4.3C-B.1 — selection MUST NOT fabricate execution animation.
    // All engine energy (packets/rings/embers/arrival glows) is driven
    // exclusively by authoritative runtime state via setGraph.
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
    if (node.id === "core" || node.id === "coo") return <CountBadge n={attention.length} tone={attention.length ? "amber" : "cyan"} />;
    if (node.id === "ops" || node.id === "researcher" || node.id === "finance" || node.id === "pm") {
      const ag = agents.find((a) => a.id === node.id || (node.id === "researcher" && a.id === "ops"));
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
          <Layers size={12} className="text-cyan-300" /> COMPANY CONTEXT · SPATIAL
          <span className="text-slate-700">·</span>
          <span className="tnum font-mono text-cyan-200">{zoomPct}%</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <div className="mr-1 hidden items-center gap-2 text-[10px] tracking-[0.2em] text-slate-300 sm:flex">
            {attention.length ? <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300 shadow-[0_0_8px_2px_rgba(252,211,77,0.8)]" /> {attention.length} NEED YOU</> : <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.8)]" /> ALL QUIET</>}
          </div>
          <button onClick={() => { osSound.click(); if (onToggleWork) onToggleWork(); else onPanelOpen?.(); }} title="Work drawer (T)" className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10.5px] uppercase tracking-[0.16em] text-slate-400 transition hover:bg-white/10 hover:text-cyan-200 active:scale-95"><Activity size={14} className="text-cyan-300" /><span className="hidden lg:inline">Work</span>{work.length > 0 && <span className="rounded-full bg-cyan-400/20 px-1.5 py-0.2 font-mono text-[9px] text-cyan-200">{work.length}</span>}</button>
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
            onDoubleClick={(e) => { if (isInteractive(e.target)) return; const r = viewportRef.current!.getBoundingClientRect(); zoomToAnimated(e.clientX - r.left, e.clientY - r.top, e.shiftKey ? 1 / 1.35 : 1.35); }}
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
              {/* Phase 4.3B.1 — semantic region zones (spatial company context) */}
              <RegionZone label="COMPANY CONTEXT" sub={`${company.name}${company.focus ? ` · FOCUS: ${company.focus}` : ""}`} x={REGIONS.company.x} y={REGIONS.company.y} w={REGIONS.company.w} h={REGIONS.company.h} />
              <RegionZone label="ACTIVE WORK" x={REGIONS.active.x} y={REGIONS.active.y} w={REGIONS.active.w} h={REGIONS.active.h} quiet={activeWorkNodes.length === 0} />
              {parkedWorkNodes.length > 0 && (
                <RegionZone label="RELATED · DEPENDENCIES" x={REGIONS.related.x} y={REGIONS.related.y} w={REGIONS.related.w} h={REGIONS.related.h} />
              )}
              <RegionZone label="GOVERNED OUTCOMES" x={REGIONS.outcomes.x} y={REGIONS.outcomes.y} w={REGIONS.outcomes.w} h={REGIONS.outcomes.h} />

              {/* Dynamic Living Connectors (Phase 4.1 Primitive — semantic layers) */}
              <svg
                className="pointer-events-none absolute inset-0 overflow-visible"
                style={{ width: WORLD.W, height: WORLD.H }}
              >
                {visibleEdges.map((e) => {
                  const fromNode = nodeById.get(e.from);
                  const toNode = nodeById.get(e.to);
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
                  else if (e.layer === "ownership") connType = "dashed"; // revealed execution metadata

                  const isEdgeSelected = selected?.id === e.from || selected?.id === e.to;
                  const isEdgeDimmed = !!selected && !isEdgeSelected;
                  const isStructural = e.layer === "structural";

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
                      className={`${
                        isEdgeDimmed ? "opacity-20" : isStructural ? "opacity-50" : "opacity-90"
                      } transition-opacity duration-200`}
                    />
                  );
                })}
              </svg>

              {/* Dynamic Living Nodes — work cards (first-class) & company nodes.
                  Phase 4.3E: every node carries its authoritative execution
                  perimeter (progressive fill on its own shape; null = idle). */}
              {graph.nodes.map((n) => {
                const perimeter = perimeterForNode(n, visibleEdges);
                return n.type === "workflow" ? (
                  <WorkCard
                    key={n.id}
                    n={n}
                    selected={selected?.id === n.id}
                    hasSelection={!!selected}
                    badge={badgeFor(n)}
                    perimeter={perimeter}
                    onClick={(node: FlowNode) => {
                      if (!panStart.current?.moved) handleNodeClick(node);
                    }}
                    onDoubleClick={focusNode}
                  />
                ) : (
                  <Phase4NodeCard
                    key={n.id}
                    n={n}
                    selected={selected?.id === n.id}
                    hasSelection={!!selected}
                    badge={badgeFor(n)}
                    perimeter={perimeter}
                    onClick={(node: FlowNode) => {
                      if (!panStart.current?.moved) handleNodeClick(node);
                    }}
                    onDoubleClick={focusNode}
                  />
                );
              })}

              {/* Focus-reveal: the local workflow of the focused work object */}
              {selected?.type === "workflow" && <ExecutionTrailOverlay n={selected} />}

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
              {/* Phase 4.4A — Automation heartbeat status chip (restrained, real) */}
              <span className="mx-0.5 h-3 w-px bg-white/10" />
              <button
                onClick={() => { osSound.click(); setAutoPanelOpen((o) => !o); }}
                title={autoView.detail}
                aria-label={`Automation heartbeat status: ${autoView.detail}`}
                aria-expanded={autoPanelOpen}
                className="flex items-center gap-1.5 rounded-full px-1.5 py-0.5 transition hover:bg-white/[0.07] active:scale-95"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${autoView.tone === "live" ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" : autoView.tone === "stale" ? "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]" : autoView.tone === "silent" ? "bg-slate-500" : autoView.tone === "offline" ? "bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]" : "animate-pulse bg-cyan-400"}`} />
                <span className={`font-mono text-[9px] ${autoView.tone === "live" ? "text-emerald-300" : autoView.tone === "stale" ? "text-amber-300" : autoView.tone === "offline" ? "text-rose-300" : "text-slate-400"}`}>
                  {autoView.label}
                </span>
              </button>
              {/* Refresh Button */}
              <button
                onClick={() => { osSound.click(); loadGraph(true); }}
                title="Refresh authoritative graph"
                className="ml-0.5 rounded-md p-0.5 text-slate-400 hover:text-cyan-200 active:scale-90"
              >
                <RefreshCw size={10} className={isRefreshing ? "animate-spin text-cyan-300" : ""} />
              </button>
            </div>

            {/* Phase 4.4A — Automation heartbeat detail panel (restrained, honest) */}
            {autoPanelOpen && (
              <div
                className="absolute left-3 top-[84px] z-20 w-[300px] max-w-[calc(100%-1.5rem)] rounded-2xl border border-white/12 bg-[#081120]/96 p-3.5 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl"
                style={{ animation: `os-in 220ms ${EASE}` }}
                role="dialog"
                aria-label="Automation heartbeat details"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Timer size={12} className="text-cyan-300" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">Automation</span>
                  </div>
                  <button
                    onClick={() => { osSound.close(); setAutoPanelOpen(false); }}
                    className="flex h-5 w-5 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90"
                    title="Close automation details"
                    aria-label="Close automation details"
                  >
                    <X size={12} />
                  </button>
                </div>

                {autoStatus.status === "unavailable" ? (
                  <p className="mt-2.5 text-[10.5px] leading-relaxed text-rose-300/90">
                    Scheduler status unavailable — {autoStatus.error ?? "the authoritative projection could not be read."} Nothing is fabricated here.
                  </p>
                ) : (
                  <div className="mt-2.5 space-y-2.5">
                    {/* Last evaluation */}
                    <div>
                      <div className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-slate-500">Last evaluation</div>
                      {autoStatus.data?.lastHeartbeat ? (
                        <div className="tnum mt-0.5 text-[10.5px] text-slate-300">
                          {new Date(autoStatus.data.lastHeartbeat.evaluatedAt).toLocaleTimeString()} · {autoStatus.data.lastHeartbeat.triggerSource === "cron" ? "heartbeat" : "founder"}
                          <span className="text-slate-500"> · {autoStatus.data.lastHeartbeat.durationMs}ms</span>
                          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[9.5px]">
                            <span className="text-emerald-300/90">{autoStatus.data.lastHeartbeat.executedCount} executed</span>
                            <span className="text-slate-400">{autoStatus.data.lastHeartbeat.skippedCount} skipped</span>
                            {autoStatus.data.lastHeartbeat.failedCount > 0 && <span className="text-rose-300/90">{autoStatus.data.lastHeartbeat.failedCount} failed</span>}
                            {autoStatus.data.lastHeartbeat.awaitingApprovalCount > 0 && <span className="text-amber-300/90">{autoStatus.data.lastHeartbeat.awaitingApprovalCount} awaiting approval</span>}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[10.5px] text-slate-400">No evaluation recorded yet — the heartbeat has not run.</div>
                      )}
                    </div>

                    {/* Next due */}
                    <div>
                      <div className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-slate-500">Next due</div>
                      {autoStatus.data?.nextDue ? (
                        <div className="tnum mt-0.5 text-[10.5px] text-slate-300">
                          {new Date(autoStatus.data.nextDue.executeAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {autoStatus.data.nextDue.isOverdue && <span className="ml-1.5 rounded bg-amber-400/15 px-1 py-px text-[8.5px] font-semibold uppercase tracking-wide text-amber-300">overdue</span>}
                          {autoStatus.data.nextDue.recurrence && (
                            <div className="text-[9.5px] text-slate-500">
                              recurring · every {autoStatus.data.nextDue.recurrence.intervalValue} {autoStatus.data.nextDue.recurrence.intervalUnit}
                              {autoStatus.data.nextDue.recurrence.maxOccurrences ? ` · occurrence ${autoStatus.data.nextDue.recurrence.currentOccurrence}/${autoStatus.data.nextDue.recurrence.maxOccurrences}` : ""}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[10.5px] text-slate-400">Nothing scheduled.</div>
                      )}
                      {(autoStatus.data?.counts.paused ?? 0) > 0 && (
                        <div className="mt-0.5 text-[9.5px] text-slate-500">{autoStatus.data?.counts.paused} paused</div>
                      )}
                    </div>

                    {/* Phase 4.4B — Founder schedule lifecycle (create + manage) */}
                    <div className="border-t border-white/8 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-slate-500">Scheduled directives</div>
                        <button
                          onClick={() => { osSound.click(); setSchedFormOpen((o) => !o); setSchedError(null); }}
                          className="flex items-center gap-1 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-cyan-200 transition hover:bg-cyan-300/20 active:scale-95"
                          title="Schedule a recurring founder directive"
                          aria-expanded={schedFormOpen}
                        >
                          <Sparkles size={9} /> NEW
                        </button>
                      </div>

                      {schedFormOpen && (
                        <div className="mt-2 space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2" style={{ animation: `os-in 200ms ${EASE}` }}>
                          <textarea
                            value={schedDraft.directive}
                            onChange={(e) => setSchedDraft((d) => ({ ...d, directive: e.target.value }))}
                            placeholder="Every week: research our competitors and recommend pricing…"
                            rows={2}
                            className="w-full resize-none rounded-lg border border-white/12 bg-[#040813]/80 px-2 py-1.5 text-[10.5px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-400/40 focus:outline-none"
                            aria-label="Directive to schedule"
                          />
                          <div className="flex items-center gap-1.5 text-[9.5px] text-slate-400">
                            <span className="shrink-0">Every</span>
                            <input
                              type="number"
                              min={1}
                              value={schedDraft.intervalValue}
                              onChange={(e) => setSchedDraft((d) => ({ ...d, intervalValue: e.target.value }))}
                              className="w-10 rounded-md border border-white/12 bg-[#040813]/80 px-1 py-0.5 text-center text-slate-200 focus:border-cyan-400/40 focus:outline-none"
                              aria-label="Interval value"
                            />
                            <select
                              value={schedDraft.intervalUnit}
                              onChange={(e) => setSchedDraft((d) => ({ ...d, intervalUnit: e.target.value as typeof d.intervalUnit }))}
                              className="flex-1 rounded-md border border-white/12 bg-[#040813]/80 px-1 py-0.5 text-slate-200 focus:border-cyan-400/40 focus:outline-none"
                              aria-label="Interval unit"
                            >
                              <option value="minutes">minutes</option>
                              <option value="hours">hours</option>
                              <option value="days">days</option>
                              <option value="weeks">weeks</option>
                            </select>
                          </div>
                          <input
                            type="datetime-local"
                            value={schedDraft.startAt}
                            onChange={(e) => setSchedDraft((d) => ({ ...d, startAt: e.target.value }))}
                            className="w-full rounded-md border border-white/12 bg-[#040813]/80 px-2 py-1 text-[9.5px] text-slate-300 focus:border-cyan-400/40 focus:outline-none"
                            aria-label="First occurrence (optional — defaults to the next heartbeat)"
                          />
                          <label className="flex cursor-pointer items-center gap-1.5 text-[9.5px] text-slate-400">
                            <input
                              type="checkbox"
                              checked={schedDraft.requiresApproval}
                              onChange={(e) => setSchedDraft((d) => ({ ...d, requiresApproval: e.target.checked }))}
                              className="h-3 w-3 accent-cyan-400"
                            />
                            Require my approval before each execution
                          </label>
                          <button
                            onClick={submitSchedule}
                            disabled={schedulesBusy}
                            className="w-full rounded-lg border border-cyan-400/30 bg-cyan-400/15 px-2 py-1 text-[10px] font-semibold tracking-wide text-cyan-100 transition hover:bg-cyan-300/25 disabled:opacity-50 active:scale-[0.98]"
                          >
                            {schedulesBusy ? "Scheduling…" : "Schedule directive"}
                          </button>
                          {schedError && <p className="text-[9px] leading-relaxed text-rose-300/90">{schedError}</p>}
                        </div>
                      )}

                      <div className="mt-1.5 max-h-44 overflow-y-auto pr-0.5 os-scroll [scrollbar-width:thin]">
                        {schedules === null ? (
                          <div className="py-1 text-[10px] text-slate-500">Loading schedules…</div>
                        ) : schedules.length === 0 ? (
                          <div className="py-1 text-[10px] text-slate-500">No schedules yet — create one with NEW.</div>
                        ) : (
                          schedules.map((s) => {
                            const view = scheduleStatusView(s);
                            const objective = s.workflowObjective || s.provenance?.stepName || "Scheduled directive";
                            return (
                              <div key={s.id} className="mb-1 rounded-lg border border-white/8 bg-white/[0.02] px-1.5 py-1">
                                <div className="flex items-start justify-between gap-1.5">
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-[9.5px] text-slate-300" title={objective}>
                                      {objective.length > 56 ? `${objective.slice(0, 54)}…` : objective}
                                    </div>
                                    <div className="tnum text-[8.5px] text-slate-500">
                                      {nextRunLabel(s)}
                                      {s.recurrence ? ` · every ${s.recurrence.intervalValue ?? 1} ${s.recurrence.intervalUnit ?? "weeks"}` : ""}
                                      {s.recurrence?.maxOccurrences ? ` · ${s.recurrence.currentOccurrence ?? 1}/${s.recurrence.maxOccurrences}` : ""}
                                    </div>
                                  </div>
                                  <span className={`shrink-0 rounded border px-1 py-px text-[7.5px] font-bold tracking-wide ${view.cls}`}>{view.label}</span>
                                </div>
                                {(s.status === "scheduled" || s.status === "paused") && (
                                  <div className="mt-1 flex gap-1">
                                    {s.status === "scheduled" ? (
                                      <button
                                        onClick={() => onScheduleAction(s.id, "pause")}
                                        disabled={schedulesBusy}
                                        className="flex items-center gap-0.5 rounded border border-white/12 bg-white/5 px-1.5 py-px text-[8px] tracking-wide text-slate-300 transition hover:bg-white/10 disabled:opacity-50 active:scale-95"
                                        title="Pause this schedule"
                                      >
                                        <Pause size={8} /> Pause
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => onScheduleAction(s.id, "resume")}
                                        disabled={schedulesBusy}
                                        className="flex items-center gap-0.5 rounded border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-px text-[8px] tracking-wide text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50 active:scale-95"
                                        title="Resume this schedule"
                                      >
                                        <Play size={8} /> Resume
                                      </button>
                                    )}
                                    <button
                                      onClick={() => onScheduleAction(s.id, "cancel")}
                                      disabled={schedulesBusy}
                                      className="flex items-center gap-0.5 rounded border border-rose-400/20 bg-rose-400/8 px-1.5 py-px text-[8px] tracking-wide text-rose-300/90 transition hover:bg-rose-400/15 disabled:opacity-50 active:scale-95"
                                      title="Cancel this schedule permanently"
                                    >
                                      <X size={8} /> Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                      {schedError && !schedFormOpen && <p className="mt-1 text-[9px] leading-relaxed text-rose-300/90">{schedError}</p>}
                    </div>

                    {/* Approval-gate tie-in */}
                    {(autoStatus.data?.awaitingApproval ?? 0) > 0 && (
                      <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-2 py-1.5 text-[10px] text-amber-200/90">
                        {autoStatus.data?.awaitingApproval} scheduled occurrence{autoStatus.data && autoStatus.data.awaitingApproval > 1 ? "s" : ""} blocked pending your approval — execution will not proceed until decided.
                      </div>
                    )}

                    <p className="border-t border-white/8 pt-2 text-[9px] leading-relaxed text-slate-500">
                      Background machinery: due-work evaluation, leases, idempotency and side-effect authorization all run server-side on each heartbeat. Scheduled directives execute through the same governed workflow runtime as immediate directives. This panel only reports and manages authoritative state.
                    </p>
                  </div>
                )}
              </div>
            )}

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
                    <button onClick={() => { osSound.click(); if (selected) focusNode(selected); }} title="Center" className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-cyan-200"><Crosshair size={13} /></button>
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

                {/* Phase 4.3B.1 — Authoritative Execution Trail (work objects) */}
                {selected.type === "workflow" && selected.dtoNode?.metadata?.executionSteps && selected.dtoNode.metadata.executionSteps.length > 0 && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
                      <span>Execution Trail · Local Workflow</span>
                      <span className="font-mono text-cyan-200">
                        {selected.dtoNode.metadata.executionSteps.filter((s) => s.status === "done" || s.status === "failed").length}/{selected.dtoNode.metadata.executionSteps.length} STAGES
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {selected.dtoNode.metadata.executionSteps.map((s, i) => {
                        const stepColor =
                          s.status === "done" ? "text-emerald-300"
                          : s.status === "failed" ? "text-rose-300"
                          : s.status === "current" ? "text-cyan-300"
                          : s.status === "waiting" ? "text-amber-200"
                          : "text-slate-500";
                        const stepBg =
                          s.status === "failed" ? "border-rose-500/25 bg-rose-500/[0.06]"
                          : s.status === "current" ? "border-cyan-400/25 bg-cyan-400/[0.06]"
                          : s.status === "waiting" ? "border-amber-400/25 bg-amber-400/[0.05]"
                          : s.status === "done" ? "border-emerald-400/20 bg-emerald-400/[0.04]"
                          : "border-white/[0.06] bg-white/[0.02]";
                        const stepOwner = OWNER_VISUALS[s.ownerAgentId ?? ""];
                        return (
                          <div key={`${s.step}-${i}`} className={`flex items-center justify-between rounded-lg border px-2 py-1 text-[10.5px] ${stepBg}`}>
                            <span className="flex min-w-0 items-center gap-2">
                              <span className={`font-mono text-[9px] ${stepColor}`}>
                                {s.status === "done" ? "✓" : s.status === "failed" ? "✗" : s.status === "current" ? "▶" : s.status === "waiting" ? "⏸" : "○"}
                              </span>
                              <span className="truncate text-slate-200">{s.label}</span>
                              {stepOwner && (
                                <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-px font-mono text-[8.5px] uppercase tracking-wide" style={{ color: stepOwner.tint }}>
                                  {stepOwner.label}
                                </span>
                              )}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              {typeof s.durationMs === "number" && s.durationMs > 0 && (
                                <span className="tnum font-mono text-[9px] text-slate-500">{(s.durationMs / 1000).toFixed(1)}s</span>
                              )}
                              <span className={`font-mono text-[9px] uppercase tracking-wider ${stepColor}`}>{s.status}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {selected.dtoNode?.owner && (
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
                        <Bot size={10} className="text-slate-500" />
                        Owner metadata · <span className="font-mono text-slate-400">{selected.dtoNode.owner}</span>
                      </div>
                    )}
                  </div>
                )}

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
          {/* Phase 4.4C — authoritative company Activity (server projection; NOT the client os.log) */}
          <div className="w-[248px] max-lg:w-[266px]">
            <SideCard title="Company Activity" icon={<Activity size={13} />} count={activity.length} defaultOpen={false}>
              <CompanyActivityList />
              <p className="mt-1.5 border-t border-white/[0.06] pt-1.5 text-[8.5px] uppercase tracking-[0.18em] text-slate-600">
                Server-authoritative · /api/activity
              </p>
            </SideCard>
          </div>
          {/* Phase 4.4E — founder epistemic board (claims → facts → governed memory) */}
          <div className="w-[248px] max-lg:w-[266px]">
            <SideCard title="Epistemic Board" icon={<ShieldCheck size={13} />} count={epistemic?.counts.pending ?? 0} tone="amber" defaultOpen={false}>
              <EpistemicBoardCard />
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
