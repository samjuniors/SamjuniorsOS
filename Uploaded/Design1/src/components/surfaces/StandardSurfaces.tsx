import React, { useState } from "react";
import type {
  EntityItem,
  AttentionData,
  WorkData,
  DecisionData,
  ActivityEvent,
  MetricItem,
  TimelineMilestone,
  RelationshipLink,
  SurfaceStatus,
} from "../../lib/surfaceSchema";

/* ------------------------------------------------------------------ Helpers & Status Badges */

const statusColor: Record<SurfaceStatus, { dot: string; text: string; bg: string }> = {
  healthy: { dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]", text: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/30" },
  active: { dot: "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]", text: "text-cyan-300", bg: "bg-cyan-500/10 border-cyan-500/30" },
  waiting: { dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]", text: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/30" },
  blocked: { dot: "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.6)]", text: "text-rose-300", bg: "bg-rose-500/10 border-rose-500/30" },
  offline: { dot: "bg-slate-500", text: "text-slate-400", bg: "bg-slate-800/40 border-slate-700/40" },
  neutral: { dot: "bg-slate-400", text: "text-slate-300", bg: "bg-slate-800/40 border-slate-700/40" },
};

export function StatusPill({ status, label }: { status: SurfaceStatus; label?: string }) {
  const conf = statusColor[status] ?? statusColor.neutral;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider uppercase border ${conf.bg} ${conf.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
      <span>{label ?? status}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ Loading, Empty & Error States */

export function LoadingState({ message = "Synchronizing neural telemetry..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-cyan-500/20 bg-slate-950/40 backdrop-blur-sm text-center">
      <div className="relative w-8 h-8 mb-3">
        <div className="absolute inset-0 rounded-full border border-cyan-500/30 animate-ping" />
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      </div>
      <p className="text-xs font-mono text-cyan-300/80 tracking-wide animate-pulse">{message}</p>
    </div>
  );
}

export function EmptyState({
  icon = "✧",
  title = "No items present",
  description = "All current operations are clear and verified.",
  actionLabel,
  onAction,
}: {
  icon?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center rounded-xl border border-slate-800/80 bg-slate-950/30 backdrop-blur-sm">
      <span className="text-2xl text-cyan-400/50 mb-2 font-mono">{icon}</span>
      <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-1">{title}</h4>
      <p className="text-[11px] text-slate-400 max-w-xs mb-3">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-3 py-1 rounded-md text-[11px] font-medium bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition-all active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorState({
  title = "Telemetry Stream Disrupted",
  message = "Failed to synchronize operational state.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/20 backdrop-blur-sm text-left">
      <div className="flex items-start gap-2.5">
        <span className="text-rose-400 text-sm mt-0.5">⚠️</span>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wide">{title}</h4>
          <p className="text-[11px] text-rose-200/70 mt-0.5">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2.5 px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-colors"
            >
              Retry Sync
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 1. EntitySurface */

export function EntitySurface({
  entity,
  compact = false,
  selected = false,
  onSelect,
}: {
  entity: EntityItem;
  compact?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={onSelect ?? entity.onClick}
      className={`group relative rounded-xl border transition-all cursor-pointer ${
        selected
          ? "border-cyan-400/80 bg-cyan-950/30 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
          : "border-slate-800/80 hover:border-cyan-500/40 bg-slate-900/50 hover:bg-slate-900/80"
      } ${compact ? "p-2.5" : "p-3.5"} backdrop-blur-md`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 border"
            style={{
              backgroundColor: entity.tint ? `${entity.tint}22` : "rgba(34,211,238,0.1)",
              borderColor: entity.tint ? `${entity.tint}66` : "rgba(34,211,238,0.3)",
              color: entity.tint ?? "#38bdf8",
              boxShadow: entity.glow ? `0 0 12px ${entity.glow}` : undefined,
            }}
          >
            {entity.icon ?? entity.title.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-slate-100 truncate group-hover:text-cyan-200 transition-colors">
              {entity.title}
            </h4>
            {entity.subtitle && <p className="text-[10px] text-slate-400 truncate">{entity.subtitle}</p>}
          </div>
        </div>
        <StatusPill status={entity.status} label={entity.statusLabel} />
      </div>

      {!compact && entity.badges && entity.badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {entity.badges.map((b, idx) => (
            <span
              key={idx}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                b.tone === "cyan"
                  ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                  : b.tone === "amber"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : b.tone === "rose"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  : "bg-slate-800/60 border-slate-700/60 text-slate-300"
              }`}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}

      {/* Progressive disclosure toggle if meta exists */}
      {!compact && entity.meta && Object.keys(entity.meta).length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-slate-800/60">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-[10px] font-mono text-cyan-400/80 hover:text-cyan-300 flex items-center gap-1 transition-colors"
          >
            <span>{expanded ? "▾ Hide Remit & Scope" : "▸ Inspect Remit & Scope"}</span>
          </button>
          {expanded && (
            <dl className="mt-2 space-y-1 text-[10px] font-mono bg-slate-950/50 p-2 rounded border border-slate-800/80">
              {Object.entries(entity.meta).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-slate-400 uppercase">{k}:</dt>
                  <dd className="text-slate-200 text-right truncate max-w-[180px]">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 2. AttentionSurface */

export function AttentionSurface({
  attention,
  onResolve,
}: {
  attention: AttentionData;
  onResolve?: () => void;
}) {
  const toneMap: Record<AttentionData["kind"], { border: string; text: string; bg: string; icon: string }> = {
    blocked: { border: "border-l-rose-500 border-slate-800/80", text: "text-rose-300", bg: "bg-rose-950/20", icon: "⛔" },
    decision: { border: "border-l-amber-500 border-slate-800/80", text: "text-amber-300", bg: "bg-amber-950/20", icon: "⚖️" },
    review: { border: "border-l-cyan-500 border-slate-800/80", text: "text-cyan-300", bg: "bg-cyan-950/20", icon: "🔍" },
    message: { border: "border-l-sky-500 border-slate-800/80", text: "text-sky-300", bg: "bg-sky-950/20", icon: "💬" },
    note: { border: "border-l-slate-500 border-slate-800/80", text: "text-slate-300", bg: "bg-slate-900/40", icon: "📌" },
  };

  const tone = toneMap[attention.kind] ?? toneMap.note;

  return (
    <div
      className={`rounded-lg border-l-4 border p-3 ${tone.border} ${tone.bg} backdrop-blur-sm transition-all hover:bg-slate-900/60`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">{tone.icon}</span>
          <span className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${tone.text}`}>
            {attention.kind}
          </span>
          <span className="text-slate-500 text-[10px]">· from {attention.from}</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          {new Date(attention.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <h4 className="text-xs font-medium text-slate-100 mt-1">{attention.title}</h4>
      {attention.detail && <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{attention.detail}</p>}

      <div className="mt-2.5 flex items-center justify-end gap-2">
        {onResolve && (
          <button
            onClick={onResolve}
            className="px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 transition-colors"
          >
            {attention.handled ? "Archived" : "Mark Handled"}
          </button>
        )}
      </div>
    </div>
  );
}

import type { Stage } from "../../lib/osStore";

/* ------------------------------------------------------------------ 3. WorkSurface */

const stages: Stage[] = ["discovery", "build", "review", "ship", "done"];

export function WorkSurface({
  work,
  compact = false,
}: {
  work: WorkData;
  compact?: boolean;
}) {
  const currentStageIndex = stages.indexOf(work.stage);

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/70 p-3.5 backdrop-blur-md transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
              {work.owner}
            </span>
            <span
              className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                work.state === "active"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : work.state === "blocked"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  : work.state === "done"
                  ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-300"
              }`}
            >
              {work.state}
            </span>
          </div>
          <h4 className="text-xs font-semibold text-slate-100 mt-1.5 truncate">{work.title}</h4>
          {work.note && <p className="text-[11px] text-slate-400 mt-0.5">{work.note}</p>}
        </div>
      </div>

      {/* Stage Progression Track */}
      {!compact && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-slate-400 mb-1">
            {stages.map((s, idx) => (
              <span
                key={s}
                className={
                  idx === currentStageIndex
                    ? "text-cyan-300 font-bold"
                    : idx < currentStageIndex
                    ? "text-slate-500 line-through"
                    : "text-slate-600"
                }
              >
                {s}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1 h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
            {stages.map((_, idx) => (
              <div
                key={idx}
                className={`h-full transition-all ${
                  idx < currentStageIndex
                    ? "bg-cyan-600/70"
                    : idx === currentStageIndex
                    ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                    : "bg-transparent"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Action triggers */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between">
        <span className="text-[10px] font-mono text-slate-500">
          Updated {new Date(work.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <div className="flex items-center gap-1.5">
          {work.onStateChange && (
            <button
              onClick={() =>
                work.onStateChange?.(
                  work.state === "active" ? "paused" : work.state === "paused" ? "active" : "active"
                )
              }
              className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              {work.state === "active" ? "Pause" : "Resume"}
            </button>
          )}
          {work.onAdvance && currentStageIndex < stages.length - 1 && (
            <button
              onClick={work.onAdvance}
              className="px-2 py-0.5 text-[10px] font-mono font-medium rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-colors"
            >
              Advance →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 4. DecisionSurface */

export function DecisionSurface({
  decision,
  onDecide,
}: {
  decision: DecisionData;
  onDecide?: (option: string) => void;
}) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-950/15 hover:bg-amber-950/25 p-3.5 backdrop-blur-md transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-amber-400 text-xs">⚖️</span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 font-semibold">
            Founder Approval Required
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">From {decision.raisedBy}</span>
      </div>

      <h4 className="text-xs font-semibold text-slate-100 mt-1.5">{decision.title}</h4>
      <p className="text-[11px] text-slate-300 mt-1 leading-relaxed bg-slate-950/40 p-2 rounded border border-slate-800/80">
        {decision.context}
      </p>

      {decision.status === "open" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {decision.options.map((opt) => (
            <button
              key={opt}
              onClick={() => onDecide?.(opt) ?? decision.onDecide?.(opt)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-500/30 transition-all hover:scale-[1.02] active:scale-95"
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-2 text-[11px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">
          <span>✓ {decision.status}:</span>
          <span className="font-semibold text-white">{decision.chosen ?? "Confirmed"}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 5. ActivitySurface */

export function ActivitySurface({ event }: { event: ActivityEvent }) {
  return (
    <div className="flex items-start gap-2.5 py-2 px-1 border-b border-slate-800/40 text-xs group">
      <span className="text-[10px] font-mono text-slate-500 shrink-0 mt-0.5 tabular-nums">
        {new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
      {event.actor && (
        <span className="text-[10px] font-mono uppercase tracking-wider px-1 rounded bg-slate-800 border border-slate-700/60 text-cyan-300 shrink-0">
          {event.actor}
        </span>
      )}
      <p className="text-[11px] text-slate-300 leading-snug flex-1 min-w-0 group-hover:text-slate-100 transition-colors">
        {event.text}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ 6. MetricSurface */

export function MetricSurface({ metric }: { metric: MetricItem }) {
  return (
    <div className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/60 backdrop-blur-md transition-all">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-slate-400 truncate">{metric.label}</span>
        {metric.status && <StatusPill status={metric.status} />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-xl font-bold font-mono text-slate-100 tabular-nums tracking-tight">
          {metric.value}
        </span>
        {metric.unit && <span className="text-xs font-mono text-slate-400">{metric.unit}</span>}
      </div>
      {(metric.confidence || metric.source) && (
        <div className="mt-2 flex items-center justify-between text-[9px] font-mono text-slate-500 pt-1.5 border-t border-slate-800/50">
          {metric.confidence && (
            <span
              className={`uppercase tracking-wider ${
                metric.confidence === "verified" ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              ● {metric.confidence}
            </span>
          )}
          {metric.source && <span className="truncate max-w-[150px]">{metric.source}</span>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 7. TimelineSurface */

export function TimelineSurface({ milestones }: { milestones: TimelineMilestone[] }) {
  return (
    <div className="relative pl-5 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
      {milestones.map((m) => {
        const isComplete = m.status === "complete";
        const isCurrent = m.status === "current";
        const isBlocked = m.status === "blocked";

        return (
          <div key={m.id} className="relative group">
            <div
              className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full border-2 transition-all ${
                isComplete
                  ? "bg-cyan-500 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                  : isCurrent
                  ? "bg-amber-400 border-amber-300 animate-pulse"
                  : isBlocked
                  ? "bg-rose-500 border-rose-400"
                  : "bg-slate-900 border-slate-700"
              }`}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h5
                  className={`text-xs font-semibold ${
                    isComplete ? "text-slate-200" : isCurrent ? "text-cyan-300" : "text-slate-400"
                  }`}
                >
                  {m.title}
                </h5>
                <span className="text-[9px] font-mono text-slate-500">
                  {typeof m.at === "number"
                    ? new Date(m.at).toLocaleDateString([], { month: "short", day: "numeric" })
                    : m.at}
                </span>
              </div>
              {m.subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{m.subtitle}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ 8. RelationshipSurface */

export function RelationshipSurface({ links }: { links: RelationshipLink[] }) {
  return (
    <div className="space-y-1.5">
      {links.map((link) => (
        <div
          key={link.id}
          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900/40 border border-slate-800/80 text-xs font-mono"
        >
          <span className="text-slate-300 truncate max-w-[100px]">{link.fromName}</span>
          <span className="text-[10px] text-cyan-400/80 uppercase px-1.5 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/40">
            → {link.type} →
          </span>
          <span className="text-slate-300 truncate max-w-[100px] text-right">{link.toName}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ 9. ListSurface (with Search/Filters & States) */

export function ListSurface<T>({
  title,
  items,
  renderItem,
  filterPills,
  activeFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search...",
  loading = false,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  headerAction,
}: {
  title?: string;
  items: T[];
  renderItem: (item: T, idx: number) => React.ReactNode;
  filterPills?: { id: string; label: string; count?: number }[];
  activeFilter?: string;
  onFilterChange?: (filterId: string) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  headerAction?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {(title || onSearchChange || headerAction) && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            {title && (
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-800 text-cyan-400 border border-slate-700">
                  {items.length}
                </span>
              </div>
            )}
            {headerAction}
          </div>

          {onSearchChange && (
            <div className="relative">
              <input
                type="text"
                value={searchQuery ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-slate-900/60 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300 font-mono"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {filterPills && filterPills.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {filterPills.map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => onFilterChange?.(pill.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wider transition-all whitespace-nowrap ${
                    activeFilter === pill.id
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-semibold"
                      : "bg-slate-900/40 hover:bg-slate-800/60 text-slate-400 border border-slate-800"
                  }`}
                >
                  {pill.label} {pill.count !== undefined ? `(${pill.count})` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* State views */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          actionLabel={emptyActionLabel}
          onAction={onEmptyAction}
        />
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => renderItem(item, idx))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 10. InspectorSurface */

export function InspectorSurface({
  title,
  subtitle,
  status,
  onClose,
  children,
  tabs,
  activeTab,
  onTabChange,
}: {
  title: string;
  subtitle?: string;
  status?: SurfaceStatus;
  onClose: () => void;
  children: React.ReactNode;
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}) {
  return (
    <div className="h-full flex flex-col rounded-2xl border border-cyan-500/30 bg-slate-950/90 backdrop-blur-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      <div className="p-4 border-b border-slate-800/80 flex items-start justify-between bg-slate-900/40">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-100">{title}</h3>
            {status && <StatusPill status={status} />}
          </div>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg border border-slate-700/60 bg-slate-800/50 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {tabs && tabs.length > 0 && (
        <div className="flex border-b border-slate-800 px-4 gap-4 bg-slate-950/60 text-xs font-mono">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              className={`py-2 border-b-2 transition-all ${
                activeTab === tab.id
                  ? "border-cyan-400 text-cyan-300 font-semibold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">{children}</div>
    </div>
  );
}
