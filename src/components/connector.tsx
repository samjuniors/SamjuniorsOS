"use client";

import React, { useId, useEffect, useState } from "react";
import {
  WORKFLOW_COLORS,
  EFFECTS_BUDGET_CONFIGS,
  type EffectsBudget,
} from "@/lib/tokens";

export type ConnectorType = "straight" | "curved" | "dashed" | "branch" | "animated";
export type SignalTone = "blue" | "orange" | "green" | "red";

export interface ConnectorProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type?: ConnectorType;
  tone?: SignalTone;
  hasArrow?: boolean;
  budget?: EffectsBudget;
  className?: string;
  label?: string;
  activityText?: string;
}

export const Connector: React.FC<ConnectorProps> = ({
  x1,
  y1,
  x2,
  y2,
  type = "curved",
  tone = "blue",
  hasArrow = true,
  budget = "full",
  className = "",
  label,
}) => {
  const markerId = useId().replace(/:/g, "");
  const config = EFFECTS_BUDGET_CONFIGS[budget];
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const color =
    tone === "blue"
      ? WORKFLOW_COLORS.primary
      : tone === "orange"
      ? WORKFLOW_COLORS.processing
      : tone === "green"
      ? WORKFLOW_COLORS.success
      : WORKFLOW_COLORS.error;

  const dx = x2 - x1;
  const dy = y2 - y1;
  let pathD = "";

  if (type === "straight" || type === "dashed") {
    pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
  } else if (type === "curved" || type === "animated") {
    const dirX = dx >= 0 ? 1 : -1;
    const deltaX = Math.max(32, Math.abs(dx) * 0.45) * dirX;
    const cp1x = x1 + deltaX;
    const cp1y = y1;
    const cp2x = x2 - deltaX;
    const cp2y = y2;
    pathD = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
  } else if (type === "branch") {
    const midX = x1 + dx * 0.5;
    pathD = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
  }

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const isDashed = type === "dashed";
  const isAnimated = type === "animated" && config.maxParticlesPerConduit > 0 && !reduced;

  return (
    <g className={`cvl-connector ${className}`}>
      <defs>
        {hasArrow && (
          <marker
            id={`arrow-${markerId}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={color} />
          </marker>
        )}
      </defs>

      {/* Base stroke */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={isAnimated ? 2.5 : 1.5}
        strokeOpacity={isAnimated ? 0.35 : 0.22}
        strokeDasharray={isDashed ? "5 5" : undefined}
      />

      {/* Core stroke */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={isAnimated ? 1.5 : 1}
        strokeOpacity={isAnimated ? 0.85 : 0.6}
        strokeDasharray={isDashed ? "5 5" : undefined}
        markerEnd={hasArrow ? `url(#arrow-${markerId})` : undefined}
      />

      {/* Traveling energy packet (animated) */}
      {isAnimated && (
        <circle r="3" fill="#ffffff">
          <animateMotion
            path={pathD}
            dur="1.8s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Label */}
      {label && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect
            x="-28"
            y="-9"
            width="56"
            height="18"
            rx="4"
            fill="#0b111b"
            stroke="#182233"
            strokeWidth="1"
          />
          <text
            x="0"
            y="3"
            fill="#7d8ca3"
            fontSize="9"
            fontFamily="monospace"
            textAnchor="middle"
            letterSpacing="0.08em"
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
};
