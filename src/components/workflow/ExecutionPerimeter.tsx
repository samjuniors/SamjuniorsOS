/**
 * ExecutionPerimeter — the canonical progressive execution perimeter
 * (Phase 4.3E, PERIMETER_LANGUAGE in execution-language.ts).
 *
 * A loading/progress ring rendered ON THE NODE'S OWN SHAPE:
 *
 *     ┌───────────────────────┐        ╭──────────────╮
 *     │  progress perimeter   │       /  (perimeter)  \
 *     │                       │      |      LOGO       |
 *     │         LOGO          │       \                /
 *     │                       │        ╰──────────────╯
 *     └───────────────────────┘
 *
 * THE SHAPE OWNS THE PERIMETER. This component is a transparent SVG overlay
 * laid exactly over the node geometry (same width / height / border radius):
 * the stroke traces the node's own outline — never a second decorative
 * circle, never a circular ring inside a rectangle.
 *
 * Deterministic geometry: the visible arc starts EXACTLY at 12 o'clock
 * (top-center) and fills CLOCKWISE; 100% completes back at the top. The arc
 * length is the authoritative progress value (0→1) — never fabricated here.
 *
 * Implementation: SVG stroke-dasharray / stroke-dashoffset with
 * pathLength="1" normalization — `dasharray = 1`, `dashoffset = 1 − p`
 * renders the fraction [0, p] of the outline measured from the path start.
 * The generated path always begins at top-center and travels clockwise, so
 * the dash origin IS the 12 o'clock start point.
 *
 * Reduced motion: transitions and the unmeasured orbit are disabled — the
 * correct final/static progress state renders directly (also covered by the
 * app-wide prefers-reduced-motion guard in src/os/index.css).
 */
import React from 'react';
import { useSyncExternalStore } from 'react';
import {
  EXECUTION_LANGUAGE,
  PERIMETER_LANGUAGE,
  type ExecutionSemantic,
} from './execution-language';

/* ------------------------------------------------------------------ spec */

/**
 * What a node's perimeter should express. `progress` MUST come from
 * authoritative state (e.g. execution trail settled/total); `undefined`
 * means "executing, unmeasured" and renders the restrained quarter arc.
 */
export interface ExecutionPerimeterSpec {
  semantic: ExecutionSemantic;
  /** Normalized 0→1 authoritative progress; undefined = unmeasured. */
  progress?: number;
}

/* -------------------------------------------------------- reduced motion */

/* Module-level reduced-motion store (singleton, shared by all instances).
   useSyncExternalStore keeps this hydration-safe (server snapshot = false)
   and lint-clean (no state writes inside effects). */
let cachedMQ: MediaQueryList | null = null;
let attached = false;
const listeners = new Set<() => void>();

function mq(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (!cachedMQ) cachedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  return cachedMQ;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const query = mq();
  if (query && !attached) {
    attached = true;
    query.addEventListener('change', () => {
      for (const l of listeners) l();
    });
  }
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): boolean {
  return mq()?.matches ?? false;
}

const getServerSnapshot = (): boolean => false;

/** Tracks the user's prefers-reduced-motion setting (SSR/hydration-safe). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ------------------------------------------------------------- geometry */

/**
 * Rounded-rectangle outline starting EXACTLY at top-center, traveling
 * CLOCKWISE. Degenerates to the circle itself when radius = min(W,H)/2, so
 * circular nodes trace their own circle with the identical start/direction.
 * `inset` offsets the path inward (stroke centered on the geometry edge).
 */
export function perimeterPathD(width: number, height: number, radius: number, inset: number): string {
  const x0 = inset;
  const y0 = inset;
  const W = width - inset * 2;
  const H = height - inset * 2;
  if (W <= 0 || H <= 0) return '';
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
    'Z',
  ].join(' ');
}

/** Total outline length of the path built by perimeterPathD. */
export function perimeterLength(width: number, height: number, radius: number, inset: number): number {
  const W = width - inset * 2;
  const H = height - inset * 2;
  const R = Math.max(0, Math.min(radius, W / 2, H / 2));
  return 2 * (W - 2 * R) + 2 * (H - 2 * R) + 2 * Math.PI * R;
}

/**
 * Point at fraction t (0→1) along the clockwise-from-top outline — used for
 * the leading-edge "fill front" dot. Pure analytic segment walk; identical
 * inputs yield identical outputs (deterministic).
 */
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

  // Clockwise segments from top-center: [start, end, length] edges and
  // quarter arcs. Angles in radians (screen coords, y-down ⇒ clockwise).
  type Seg =
    | { kind: 'line'; ax: number; ay: number; bx: number; by: number; len: number }
    | { kind: 'arc'; cxs: number; cys: number; a0: number; len: number };
  const q = Math.PI / 2;
  const segs: Seg[] = [
    { kind: 'line', ax: cx, ay: y0, bx: x0 + W - R, by: y0, len: Math.max(0, W / 2 - R) },
    { kind: 'arc', cxs: x0 + W - R, cys: y0 + R, a0: -q, len: (Math.PI * R) / 2 },
    { kind: 'line', ax: x0 + W, ay: y0 + R, bx: x0 + W, by: y0 + H - R, len: Math.max(0, H - 2 * R) },
    { kind: 'arc', cxs: x0 + W - R, cys: y0 + H - R, a0: 0, len: (Math.PI * R) / 2 },
    { kind: 'line', ax: x0 + W - R, ay: y0 + H, bx: x0 + R, by: y0 + H, len: Math.max(0, W - 2 * R) },
    { kind: 'arc', cxs: x0 + R, cys: y0 + H - R, a0: q, len: (Math.PI * R) / 2 },
    { kind: 'line', ax: x0, ay: y0 + H - R, bx: x0, by: y0 + R, len: Math.max(0, H - 2 * R) },
    { kind: 'arc', cxs: x0 + R, cys: y0 + R, a0: Math.PI, len: (Math.PI * R) / 2 },
    { kind: 'line', ax: x0 + R, ay: y0, bx: cx, by: y0, len: Math.max(0, W / 2 - R) },
  ];

  let remaining = Math.max(0, Math.min(1, t)) * L;
  for (const s of segs) {
    if (remaining <= s.len) {
      const f = s.len > 0 ? remaining / s.len : 0;
      if (s.kind === 'line') {
        return { x: s.ax + (s.bx - s.ax) * f, y: s.ay + (s.by - s.ay) * f };
      }
      const a = s.a0 + f * q;
      return { x: s.cxs + R * Math.cos(a), y: s.cys + R * Math.sin(a) };
    }
    remaining -= s.len;
  }
  return { x: cx, y: y0 };
}

/* ------------------------------------------------------------ component */

export interface ExecutionPerimeterProps {
  /** Node width (px) — the overlay covers exactly the node geometry. */
  width: number;
  /** Node height (px). */
  height: number;
  /** Node border radius (px). Circles pass width/2. */
  radius: number;
  /** Execution semantic driving the perimeter treatment. */
  semantic: ExecutionSemantic;
  /** 0→1 authoritative progress; undefined = unmeasured (quarter arc). */
  progress?: number;
  /** Stroke width override (defaults to PERIMETER_LANGUAGE.strokeWidth). */
  strokeWidth?: number;
  className?: string;
  /** Force reduced-motion rendering (specimen demonstrations). */
  forceReducedMotion?: boolean;
}

export const ExecutionPerimeter: React.FC<ExecutionPerimeterProps> = ({
  width,
  height,
  radius,
  semantic,
  progress,
  strokeWidth = PERIMETER_LANGUAGE.strokeWidth,
  className = '',
  forceReducedMotion = false,
}) => {
  const reduced = usePrefersReducedMotion() || forceReducedMotion;

  // IDLE has no perimeter (§1 calm baseline); FOCUS is selection, not
  // execution — both render nothing.
  if (semantic === 'idle' || semantic === 'focus') return null;

  const inset = strokeWidth / 2;
  const d = perimeterPathD(width, height, radius, inset);
  if (!d) return null;

  // Resolve arc + mode from authoritative inputs only.
  let arc: number;
  let mode: 'measured' | 'unmeasured' | 'approval';
  if (semantic === 'approval') {
    arc = PERIMETER_LANGUAGE.approvalArc;
    mode = 'approval';
  } else if (typeof progress !== 'number' || !Number.isFinite(progress)) {
    arc = PERIMETER_LANGUAGE.unmeasuredArc;
    mode = 'unmeasured';
  } else {
    arc = Math.max(0, Math.min(1, progress));
    mode = 'measured';
  }

  // 0% (and near-0) renders NO active perimeter (§3).
  if (arc < PERIMETER_LANGUAGE.epsilon) return null;

  const lang = EXECUTION_LANGUAGE[semantic];
  const isExecuting = semantic === 'running' || semantic === 'externalAction';
  const alpha =
    mode === 'approval'
      ? PERIMETER_LANGUAGE.approvalAlpha
      : semantic === 'completed'
      ? PERIMETER_LANGUAGE.settledAlpha
      : semantic === 'blocked'
      ? PERIMETER_LANGUAGE.blockedAlpha
      : PERIMETER_LANGUAGE.activeAlpha;

  // Unmeasured ACTIVE nodes orbit slowly (spinner semantics) — clockwise,
  // deterministic, only while genuinely executing. Blocked/approval never
  // animate; reduced motion renders the static final state.
  const orbit = mode === 'unmeasured' && isExecuting && !reduced;

  // Leading-edge dot marks the fill front (direction legibility). Hidden
  // once settled at 100% and never present on the approval boundary.
  const showHeadDot = isExecuting && arc < 0.995;
  const head = showHeadDot ? perimeterPointAt(width, height, radius, inset, arc) : null;

  const transition = reduced
    ? 'none'
    : `stroke-dashoffset ${PERIMETER_LANGUAGE.transitionMs}ms cubic-bezier(0.16, 1, 0.3, 1), ` +
      `stroke 300ms linear, stroke-opacity 300ms linear`;

  return (
    <svg
      className={`execution-perimeter pointer-events-none absolute inset-0 ${className}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ zIndex: 6, overflow: 'visible' }}
      aria-hidden="true"
    >
      <g
        style={
          orbit
            ? {
                transformBox: 'view-box',
                transformOrigin: 'center',
                animation: `wf-perimeter-orbit ${PERIMETER_LANGUAGE.unmeasuredOrbitMs}ms linear infinite`,
              }
            : undefined
        }
      >
        {/* Phase 4.5 — faint inner shadow beneath the perimeter stroke:
            MATERIAL DEPTH ONLY. It traces the exact same arc geometry (never
            a second ring, never a progress indicator) offset ~1px down, so
            the stroke reads as resting slightly above the node surface.
            Dash semantics, progress mapping and state colors are untouched. */}
        <path
          d={d}
          pathLength={1}
          fill="none"
          stroke="rgba(0,0,0,0.32)"
          strokeWidth={strokeWidth + 0.5}
          strokeLinecap="round"
          strokeDasharray={1}
          strokeDashoffset={1 - arc}
          transform="translate(0, 1.1)"
        />
        <path
          d={d}
          pathLength={1}
          fill="none"
          stroke={lang.bright}
          strokeOpacity={alpha}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={1}
          strokeDashoffset={1 - arc}
          style={{ transition }}
        />
        {head && (
          <circle
            r={PERIMETER_LANGUAGE.headDotRadius}
            className={isExecuting && !reduced ? 'wf-head-breathe' : undefined}
            fill={lang.bright}
            fillOpacity={0.95}
            style={{
              transform: `translate(${head.x}px, ${head.y}px)`,
              transition: reduced
                ? 'none'
                : `transform ${PERIMETER_LANGUAGE.transitionMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
            }}
          />
        )}
      </g>
    </svg>
  );
};
