import React from 'react';
import { WORKFLOW_COLORS, EffectsBudget, EFFECTS_BUDGET_CONFIGS } from './tokens';

export interface BaseEffectProps {
  budget?: EffectsBudget;
  className?: string;
  style?: React.CSSProperties;
}

/** 1. FlowParticle: High-velocity traveling comet with spark emitter physics */
export interface FlowParticleProps extends BaseEffectProps {
  x: number;
  y: number;
  angle?: number;
  tone?: 'blue' | 'orange' | 'green' | 'red';
  size?: number;
}

export const FlowParticle: React.FC<FlowParticleProps> = ({
  x,
  y,
  angle = 0,
  tone = 'blue',
  size = 6,
  budget = 'full',
  className = '',
}) => {
  const config = EFFECTS_BUDGET_CONFIGS[budget];
  const color =
    tone === 'blue'
      ? WORKFLOW_COLORS.primary
      : tone === 'orange'
      ? WORKFLOW_COLORS.processing
      : tone === 'green'
      ? WORKFLOW_COLORS.success
      : WORKFLOW_COLORS.error;

  return (
    <g className={`flow-particle ${className}`} transform={`translate(${x}, ${y}) rotate(${angle})`}>
      {/* Particle head */}
      <circle r={size / 2} fill={color} filter={config.enableComplexGlowFilters ? 'url(#wf-glow)' : undefined} />
      {/* Laser comet trail */}
      <line
        x1={0}
        y1={0}
        x2={-size * 3.5}
        y2={0}
        stroke={`url(#wf-tail-${tone})`}
        strokeWidth={size * 0.8}
        strokeLinecap="round"
      />
    </g>
  );
};

/** 2. ActivationRing: Expanding radial arrival wave */
export interface ActivationRingProps extends BaseEffectProps {
  cx: number;
  cy: number;
  radius: number;
  tone?: 'blue' | 'orange' | 'green' | 'red';
}

export const ActivationRing: React.FC<ActivationRingProps> = ({
  cx,
  cy,
  radius,
  tone = 'blue',
  budget = 'full',
}) => {
  const config = EFFECTS_BUDGET_CONFIGS[budget];
  if (!config.enableShockwaves) return null;

  const color =
    tone === 'blue'
      ? WORKFLOW_COLORS.primary
      : tone === 'orange'
      ? WORKFLOW_COLORS.processing
      : tone === 'green'
      ? WORKFLOW_COLORS.success
      : WORKFLOW_COLORS.error;

  return (
    <g className="activation-ring pointer-events-none">
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        opacity={0.7}
        style={{
          animation: 'wf-shockwave 750ms cubic-bezier(0, 0.55, 0.45, 1) infinite',
          transformOrigin: `${cx}px ${cy}px`,
        }}
      />
    </g>
  );
};

/** 3. PulseEffect: Perimeter breathing aura */
export interface PulseEffectProps extends BaseEffectProps {
  color?: string;
  borderRadius?: string;
}

export const PulseEffect: React.FC<PulseEffectProps> = ({
  color = WORKFLOW_COLORS.primary,
  borderRadius = '20px',
  budget = 'full',
  className = '',
  style,
}) => {
  if (budget === 'minimal') return null;

  return (
    <div
      className={`pointer-events-none absolute -inset-1 z-0 ${className}`}
      style={{
        borderRadius,
        boxShadow: `0 0 24px ${color}55`,
        animation: 'wf-pulse 2s ease-in-out infinite',
        ...style,
      }}
    />
  );
};

/** 4. ProcessingEffect: Rotating warm amber energy */
export interface ProcessingEffectProps extends BaseEffectProps {
  borderRadius?: string;
}

export const ProcessingEffect: React.FC<ProcessingEffectProps> = ({
  borderRadius = '20px',
  budget = 'full',
  className = '',
}) => {
  return (
    <div
      className={`pointer-events-none absolute -inset-1.5 z-0 overflow-hidden ${className}`}
      style={{ borderRadius }}
    >
      <div
        style={{
          position: 'absolute',
          inset: -30,
          background: `conic-gradient(from 0deg, transparent 0deg, ${WORKFLOW_COLORS.processing} 180deg, transparent 360deg)`,
          animation: budget === 'minimal' ? 'none' : 'wf-spin 3s linear infinite',
          opacity: 0.5,
        }}
      />
    </div>
  );
};

/** 5. SuccessBurst: Subtle green celebratory halo */
export interface SuccessBurstProps extends BaseEffectProps {
  borderRadius?: string;
}

export const SuccessBurst: React.FC<SuccessBurstProps> = ({
  borderRadius = '20px',
  className = '',
}) => (
  <div
    className={`pointer-events-none absolute -inset-2 z-0 ${className}`}
    style={{
      borderRadius,
      border: `2px solid ${WORKFLOW_COLORS.success}`,
      boxShadow: `0 0 30px ${WORKFLOW_COLORS.successGlow}`,
      animation: 'wf-burst 500ms ease-out forwards',
    }}
  />
);

/** 6. ErrorPulse: Ruby warning glow */
export interface ErrorPulseProps extends BaseEffectProps {
  borderRadius?: string;
}

export const ErrorPulse: React.FC<ErrorPulseProps> = ({
  borderRadius = '20px',
  className = '',
}) => (
  <div
    className={`pointer-events-none absolute -inset-1 z-0 ${className}`}
    style={{
      borderRadius,
      boxShadow: `0 0 28px ${WORKFLOW_COLORS.errorGlow}`,
      animation: 'wf-pulse-fast 1s ease-in-out infinite',
    }}
  />
);

/** 7. LoadingRing: Precision SVG orbital spinner */
export interface LoadingRingProps extends BaseEffectProps {
  size?: number;
  color?: string;
}

export const LoadingRing: React.FC<LoadingRingProps> = ({
  size = 40,
  color = WORKFLOW_COLORS.primary,
  className = '',
}) => {
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`loading-ring ${className}`}
      style={{ animation: 'wf-spin 1.2s linear infinite' }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * 0.7}
        strokeLinecap="round"
      />
    </svg>
  );
};

/** 8. AmbientParticles: Drifting canvas stars/dust */
export interface AmbientParticlesProps extends BaseEffectProps {
  width?: number;
  height?: number;
  count?: number;
}

export const AmbientParticles: React.FC<AmbientParticlesProps> = ({
  width = 800,
  height = 500,
  count = 24,
  budget = 'full',
}) => {
  const config = EFFECTS_BUDGET_CONFIGS[budget];
  if (!config.enableAmbientParticles) return null;

  // Deterministic seed generation
  const particles = Array.from({ length: count }, (_, i) => {
    const x = ((i * 137.5) % width);
    const y = ((i * 79.3) % height);
    const size = (i % 3) + 1;
    const opacity = ((i % 5) + 2) * 0.08;
    return { x, y, size, opacity, key: i };
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.key}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: '9999px',
            backgroundColor: '#00B2FF',
            opacity: p.opacity,
            boxShadow: `0 0 6px rgba(0, 178, 255, 0.4)`,
          }}
        />
      ))}
    </div>
  );
};
