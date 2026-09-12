import React, { useId } from 'react';
import { WORKFLOW_COLORS, EffectsBudget, EFFECTS_BUDGET_CONFIGS } from './tokens';

export type ConnectorType = 'straight' | 'curved' | 'dashed' | 'branch' | 'animated';
export type SignalTone = 'blue' | 'orange' | 'green' | 'red';

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
  type = 'curved',
  tone = 'blue',
  hasArrow = true,
  budget = 'full',
  className = '',
  label,
}) => {
  const markerId = useId();
  const config = EFFECTS_BUDGET_CONFIGS[budget];

  const color =
    tone === 'blue'
      ? WORKFLOW_COLORS.primary
      : tone === 'orange'
      ? WORKFLOW_COLORS.processing
      : tone === 'green'
      ? WORKFLOW_COLORS.success
      : WORKFLOW_COLORS.error;

  // Calculate SVG path string based on type
  let pathD = '';
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (type === 'straight') {
    pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
  } else if (type === 'curved' || type === 'animated') {
    // S-curve with smooth directional departure and arrival
    const dirX = dx >= 0 ? 1 : -1;
    const deltaX = Math.max(32, Math.abs(dx) * 0.45) * dirX;
    const cp1x = x1 + deltaX;
    const cp1y = y1;
    const cp2x = x2 - deltaX;
    const cp2y = y2;
    pathD = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
  } else if (type === 'branch') {
    // Branch with 90-degree rounded step
    const midX = x1 + dx * 0.5;
    pathD = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
  } else if (type === 'dashed') {
    pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  // Calculate mid-point for label
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const isDashed = type === 'dashed';
  const isAnimated = type === 'animated' && config.maxParticlesPerConduit > 0;

  return (
    <g className={`workflow-connector ${className}`}>
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

      {/* Baseline subtle track (always visible) */}
      <path
        d={pathD}
        fill="none"
        stroke="rgba(255, 255, 255, 0.12)"
        strokeWidth={2}
        strokeDasharray={isDashed ? '5 5' : undefined}
      />

      {/* Active colored conduit line */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeOpacity={isAnimated ? 0.75 : 0.5}
        strokeDasharray={isDashed ? '6 6' : undefined}
        markerEnd={hasArrow ? `url(#arrow-${markerId})` : undefined}
      />

      {/* Travelling signal packet (animated flow) */}
      {isAnimated && (
        <circle r={3.5} fill={color} style={{ filter: config.enableComplexGlowFilters ? 'drop-shadow(0 0 6px currentColor)' : undefined }}>
          <animateMotion
            path={pathD}
            dur={tone === 'orange' ? '1.8s' : '2.4s'}
            repeatCount="indefinite"
            keyPoints="0;1"
            keyTimes="0;1"
          />
        </circle>
      )}

      {/* Second follower packet if full budget */}
      {isAnimated && config.maxParticlesPerConduit >= 2 && (
        <circle r={2.5} fill={color} opacity={0.6}>
          <animateMotion
            path={pathD}
            dur={tone === 'orange' ? '1.8s' : '2.4s'}
            begin="0.9s"
            repeatCount="indefinite"
            keyPoints="0;1"
            keyTimes="0;1"
          />
        </circle>
      )}

      {/* Optional conduit label */}
      {label && (
        <text
          x={midX}
          y={midY - 8}
          fill={WORKFLOW_COLORS.textMuted}
          fontSize="10"
          textAnchor="middle"
          letterSpacing="0.06em"
          style={{ userSelect: 'none' }}
        >
          {label}
        </text>
      )}
    </g>
  );
};
