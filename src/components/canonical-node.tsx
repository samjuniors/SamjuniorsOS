"use client";

import React, { useId, useSyncExternalStore, type ReactNode } from "react";
import {
  WORKFLOW_COLORS,
  EXECUTION_LANGUAGE,
  PERIMETER_LANGUAGE,
  GEOMETRY_SIZES,
  grainTileUrl,
  type ExecutionSemantic,
  type ExecutionPerimeterSpec,
  type NodeGeometryType,
  type NodeStateType,
  type NodeSize,
  type NodeIndicator,
  type EffectsBudget,
} from "@/lib/tokens";

/* -------------------------------------------------------- Reduced Motion Store */

let cachedMQ: MediaQueryList | null = null;
let attached = false;

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (!cachedMQ) cachedMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const listener = () => callback();
  if (!attached) {
    cachedMQ.addEventListener("change", listener);
    attached = true;
  }
  return () => {
    cachedMQ?.removeEventListener("change", listener);
    attached = false;
  };
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (!cachedMQ) cachedMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  return cachedMQ.matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* --------------------------------------------------- Perimeter Geometry Math */

export function perimeterPathD(width: number, height: number, radius: number, inset: number): string {
  const x0 = inset;
  const y0 = inset;
  const W = width - inset * 2;
  const H = height - inset * 2;
  if (W <= 0 || H <= 0) return "";
  const R = Math.max(0, Math.min(radius, W / 2, H / 2));
  const cx = width / 2;
  return [
    `M ${cx} ${y0}`,
    `H ${x0 + W - R}`,
    `A ${R} ${R} 0 0 1 ${x0 + W} ${y0 + R}`,
    `V ${y0 + H - R}`,
    `A ${R} ${R} 0 0 1 ${x0 + W - R} ${y0 + H}`,
    `H ${x0 + R}`,
    `A ${R} ${R} 0 0 1 ${x0} ${y0 + H - R}`,
    `V ${y0 + R}`,
    `A ${R} ${R} 0 0 1 ${x0 + R} ${y0}`,
    "Z",
  ].join(" ");
}

export function perimeterLength(width: number, height: number, radius: number, inset: number): number {
  const W = width - inset * 2;
  const H = height - inset * 2;
  const R = Math.max(0, Math.min(radius, W / 2, H / 2));
  return 2 * (W - 2 * R) + 2 * (H - 2 * R) + 2 * Math.PI * R;
}

export function perimeterPointAt(
  width: number,
  height: number,
  radius: number,
  inset: number,
  t: number
): { x: number; y: number } {
  const x0 = inset;
  const y0 = inset;
  const W = width - inset * 2;
  const H = height - inset * 2;
  const R = Math.max(0, Math.min(radius, W / 2, H / 2));
  const cx = width / 2;
  const L = perimeterLength(width, height, radius, inset);

  type Seg =
    | { kind: "line"; ax: number; ay: number; bx: number; by: number; len: number }
    | { kind: "arc"; cxs: number; cys: number; a0: number; len: number };
  const q = Math.PI / 2;
  const segs: Seg[] = [
    { kind: "line", ax: cx, ay: y0, bx: x0 + W - R, by: y0, len: Math.max(0, W / 2 - R) },
    { kind: "arc", cxs: x0 + W - R, cys: y0 + R, a0: -q, len: (Math.PI * R) / 2 },
    { kind: "line", ax: x0 + W, ay: y0 + R, bx: x0 + W, by: y0 + H - R, len: Math.max(0, H - 2 * R) },
    { kind: "arc", cxs: x0 + W - R, cys: y0 + H - R, a0: 0, len: (Math.PI * R) / 2 },
    { kind: "line", ax: x0 + W - R, ay: y0 + H, bx: x0 + R, by: y0 + H, len: Math.max(0, W - 2 * R) },
    { kind: "arc", cxs: x0 + R, cys: y0 + H - R, a0: q, len: (Math.PI * R) / 2 },
    { kind: "line", ax: x0, ay: y0 + H - R, bx: x0, by: y0 + R, len: Math.max(0, H - 2 * R) },
    { kind: "arc", cxs: x0 + R, cys: y0 + R, a0: Math.PI, len: (Math.PI * R) / 2 },
    { kind: "line", ax: x0 + R, ay: y0, bx: cx, by: y0, len: Math.max(0, W / 2 - R) },
  ];

  let remaining = Math.max(0, Math.min(1, t)) * L;
  for (const s of segs) {
    if (remaining <= s.len) {
      const f = s.len > 0 ? remaining / s.len : 0;
      if (s.kind === "line") {
        return { x: s.ax + (s.bx - s.ax) * f, y: s.ay + (s.by - s.ay) * f };
      }
      const a = s.a0 + f * q;
      return { x: s.cxs + R * Math.cos(a), y: s.cys + R * Math.sin(a) };
    }
    remaining -= s.len;
  }
  return { x: cx, y: y0 };
}

/* ---------------------------------------------------- Execution Perimeter */

export interface ExecutionPerimeterProps {
  width: number;
  height: number;
  radius: number;
  semantic: ExecutionSemantic;
  progress?: number;
  strokeWidth?: number;
  className?: string;
  forceReducedMotion?: boolean;
}

export const ExecutionPerimeter: React.FC<ExecutionPerimeterProps> = ({
  width,
  height,
  radius,
  semantic,
  progress,
  strokeWidth = PERIMETER_LANGUAGE.strokeWidth,
  className = "",
  forceReducedMotion = false,
}) => {
  const reduced = usePrefersReducedMotion() || forceReducedMotion;

  if (semantic === "idle" || semantic === "focus") return null;

  const inset = strokeWidth / 2;
  const d = perimeterPathD(width, height, radius, inset);
  if (!d) return null;

  let arc: number;
  let mode: "measured" | "unmeasured" | "approval";
  if (semantic === "approval") {
    arc = PERIMETER_LANGUAGE.approvalArc;
    mode = "approval";
  } else if (typeof progress !== "number" || !Number.isFinite(progress)) {
    arc = PERIMETER_LANGUAGE.unmeasuredArc;
    mode = "unmeasured";
  } else {
    arc = Math.max(0, Math.min(1, progress));
    mode = "measured";
  }

  if (arc < PERIMETER_LANGUAGE.epsilon) return null;

  const lang = EXECUTION_LANGUAGE[semantic];
  const isExecuting = semantic === "running" || semantic === "externalAction";
  const alpha =
    mode === "approval"
      ? PERIMETER_LANGUAGE.approvalAlpha
      : semantic === "completed"
      ? PERIMETER_LANGUAGE.settledAlpha
      : semantic === "blocked"
      ? PERIMETER_LANGUAGE.blockedAlpha
      : PERIMETER_LANGUAGE.activeAlpha;

  const orbit = mode === "unmeasured" && isExecuting && !reduced;
  const showHeadDot = isExecuting && arc < 0.995;
  const head = showHeadDot ? perimeterPointAt(width, height, radius, inset, arc) : null;

  return (
    <svg
      className={`execution-perimeter pointer-events-none absolute inset-0 ${className}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ zIndex: 6, overflow: "visible" }}
      aria-hidden="true"
    >
      <g
        style={
          orbit
            ? {
                transformOrigin: `${width / 2}px ${height / 2}px`,
                animation: `spin ${PERIMETER_LANGUAGE.unmeasuredOrbitMs}ms linear infinite`,
              }
            : undefined
        }
      >
        <path
          d={d}
          fill="none"
          stroke={lang.bright}
          strokeWidth={strokeWidth}
          strokeOpacity={alpha}
          strokeLinecap="round"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - arc}
          style={{
            filter: isExecuting ? `drop-shadow(0 0 5px ${lang.bright})` : undefined,
          }}
        />
        {head && (
          <circle
            cx={head.x}
            cy={head.y}
            r={PERIMETER_LANGUAGE.headDotRadius}
            fill="#ffffff"
            style={{
              filter: `drop-shadow(0 0 4px ${lang.bright})`,
            }}
          />
        )}
      </g>
    </svg>
  );
};

/* ---------------------------------------------------- Icon Surface / Container */

export type IconSurfaceVariant = "filled" | "glass" | "outline" | "squircle" | "recessed" | "floating" | "brand";

const SIZE_MAP = {
  sm: { box: 32, icon: 16, radius: "10px" },
  md: { box: 44, icon: 22, radius: "14px" },
  lg: { box: 56, icon: 28, radius: "18px" },
};

export interface IconContainerProps {
  children: ReactNode;
  variant?: IconSurfaceVariant;
  size?: "sm" | "md" | "lg";
  color?: string;
  glow?: boolean;
  className?: string;
}

export const IconContainer: React.FC<IconContainerProps> = ({
  children,
  variant = "filled",
  size = "md",
  color = WORKFLOW_COLORS.primary,
  glow = false,
  className = "",
}) => {
  const s = SIZE_MAP[size];

  let baseStyle: React.CSSProperties = {
    width: s.box,
    height: s.box,
    borderRadius: variant === "squircle" ? s.radius : "9999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    flexShrink: 0,
    transition: "all 200ms ease",
  };

  if (variant === "glass") {
    baseStyle = {
      ...baseStyle,
      background: "rgba(11, 17, 27, 0.75)",
      backdropFilter: "blur(8px)",
      border: "1px solid rgba(255, 255, 255, 0.14)",
      boxShadow: glow ? `0 0 16px ${color}4d` : undefined,
      color: "#ffffff",
    };
  } else if (variant === "brand") {
    baseStyle = {
      ...baseStyle,
      background: "#080c14",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      color: "#ffffff",
    };
  } else {
    baseStyle = {
      ...baseStyle,
      background: `linear-gradient(135deg, ${color}26, ${color}14)`,
      border: `1px solid ${color}4d`,
      boxShadow: glow ? `0 0 16px ${color}55` : undefined,
      color: "#ffffff",
    };
  }

  return (
    <div className={`cvl-icon-container ${className}`} style={baseStyle}>
      {children}
    </div>
  );
};

export interface IconOnlyContentProps {
  icon: ReactNode;
  iconVariant?: IconSurfaceVariant;
  color?: string;
  glow?: boolean;
  size?: "sm" | "md" | "lg";
}

export const IconOnlyContent: React.FC<IconOnlyContentProps> = ({
  icon,
  iconVariant = "filled",
  color = WORKFLOW_COLORS.primary,
  glow = false,
  size = "md",
}) => (
  <IconContainer variant={iconVariant} color={color} glow={glow} size={size}>
    {icon}
  </IconContainer>
);

/* ---------------------------------------------------- Canonical Node */

export interface CanonicalNodeProps {
  id?: string;
  geometry?: NodeGeometryType;
  state?: NodeStateType;
  size?: NodeSize;
  customWidth?: number;
  customHeight?: number;
  indicator?: NodeIndicator;
  perimeter?: ExecutionPerimeterSpec;
  forceReducedMotion?: boolean;
  ports?: unknown[];
  externalLabel?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}

export const CanonicalNode: React.FC<CanonicalNodeProps> = ({
  id,
  geometry = "square",
  state = "default",
  size = "md",
  customWidth,
  customHeight,
  indicator,
  perimeter,
  forceReducedMotion,
  externalLabel,
  children,
  className = "",
  style,
  onClick,
  onDoubleClick,
}) => {
  const dims = GEOMETRY_SIZES[geometry][size];
  const width = customWidth ?? dims.width;
  const height = customHeight ?? dims.height;
  const radius = geometry === "circle" ? width / 2 : parseInt(dims.radius, 10) || 12;

  let borderColor = "var(--cvl-line)";
  if (state === "selected" || state === "active") borderColor = "#38bdf8";
  else if (state === "processing") borderColor = "#f59e0b";
  else if (state === "success") borderColor = "#34d399";
  else if (state === "error") borderColor = "#f43f5e";

  let indicatorBg = "#38bdf8";
  if (indicator) {
    if (indicator.status === "waiting") indicatorBg = "#f59e0b";
    else if (indicator.status === "success") indicatorBg = "#34d399";
    else if (indicator.status === "error") indicatorBg = "#f43f5e";
  }

  return (
    <div
      id={id}
      className={`cvl-node-wrapper relative inline-flex flex-col items-center select-none ${className}`}
      style={style}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div
        className="relative overflow-hidden transition-all duration-200"
        style={{
          width,
          height,
          borderRadius: dims.radius,
          background: "linear-gradient(180deg, #161e2c 0%, #0b1019 100%)",
          border: `1px solid ${borderColor}`,
          boxShadow:
            state === "selected"
              ? "0 0 0 2px #38bdf840, 0 0 24px rgba(56, 189, 248, 0.35)"
              : state === "active"
              ? "0 0 20px rgba(56, 189, 248, 0.25)"
              : undefined,
        }}
      >
        {children}

        {/* Status indicator dot */}
        {indicator && (
          <div
            className="absolute top-2 right-2 h-2 w-2 rounded-full"
            style={{
              backgroundColor: indicatorBg,
              boxShadow: indicator.glow ? `0 0 8px ${indicatorBg}` : undefined,
            }}
          />
        )}

        {/* Execution Perimeter Overlay */}
        {perimeter && (
          <ExecutionPerimeter
            width={width}
            height={height}
            radius={radius}
            semantic={perimeter.semantic}
            progress={perimeter.progress}
            forceReducedMotion={forceReducedMotion}
          />
        )}
      </div>

      {externalLabel && <div className="mt-2 text-center">{externalLabel}</div>}
    </div>
  );
};

export { CanonicalNode as Phase4Node };
export { CanonicalNode as Node };

const grainSubscribe = (): (() => void) => () => {};

export function useGrainTileUrl(): string {
  return useSyncExternalStore(
    grainSubscribe,
    () => grainTileUrl(),
    () => ""
  );
}
