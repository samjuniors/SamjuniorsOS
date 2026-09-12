/**
 * SamJuniorsOS Workflow Design System — Canonical Execution Language
 *
 * Semantic mapping of the approved Canvas execution-language model onto the
 * Phase 4.1 WORKFLOW_COLORS token set. This is an extension of the existing
 * token library (same design system), NOT a new design system.
 *
 * SINGLE SOURCE OF TRUTH for:
 *   - runtime execution states (idle / running / external action / completed /
 *     blocked / approval / focus) — colors AND class bundles
 *   - entity identity tints (agents, governance gates, vault, services)
 *   - canvas-engine rgba derivations (packets, conduits, rings, energy glows)
 *
 * APPROVED EXECUTION LANGUAGE MODEL (behavioral contract):
 *
 *   IDLE                    neutral gray/white — no particles, no continuous
 *                           animation
 *   RUNNING / INTELLIGENCE  blue/cyan activation — source node fills,
 *                           connection fills, directional energy travels along
 *                           the actual connection, destination activates
 *   EXTERNAL ACTION /
 *   SIDE EFFECT             amber/gold execution pulse — directional
 *                           comet/energy follows the actual connection
 *   COMPLETED               restrained green settled state
 *   BLOCKED                 restrained red state
 *   APPROVAL                static amber governance treatment (no continuous
 *                           animation)
 *
 * Clicking/selecting a node MUST NOT fabricate execution animation — all
 * execution energy is driven by authoritative runtime state only.
 *
 * React-layer treatments are expressed as complete literal Tailwind class
 * bundles (statically compilable); canvas-layer treatments derive rgba()
 * strings from the same tokens at runtime.
 */

import { WORKFLOW_COLORS, type WorkflowColorKey } from './tokens';

/* ------------------------------------------------------------------ helpers */

function hexToParts(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Mix a token color toward white by `t` (0 = token, 1 = white). */
function mixWhite(hex: string, t: number): string {
  const [r, g, b] = hexToParts(hex);
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `#${[m(r), m(g), m(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** "r,g,b" — rgb triplet string for canvas 2D rgba() composition. */
export function tokenRgb(key: WorkflowColorKey): string {
  return hexToParts(WORKFLOW_COLORS[key]).join(',');
}

/** [r,g,b] — numeric parts for canvas sprite generation. */
export function tokenRgbParts(key: WorkflowColorKey): [number, number, number] {
  return hexToParts(WORKFLOW_COLORS[key]);
}

/** "rgba(r,g,b,a)" — canvas 2D color derived from a canonical token. */
export function tokenRgba(key: WorkflowColorKey, alpha: number): string {
  return `rgba(${tokenRgb(key)},${alpha})`;
}

/* --------------------------------------------------- execution language map */

export type ExecutionSemantic =
  | 'idle'
  | 'running'
  | 'externalAction'
  | 'completed'
  | 'blocked'
  | 'approval'
  | 'focus';

export interface ExecutionLanguageEntry {
  /** Canonical WORKFLOW_COLORS token for this semantic state. */
  token: WorkflowColorKey;
  /** Canvas rgb triplet ("0,178,255") for the main treatment. */
  rgb: string;
  /** Lighter derived tint (55% toward white) for core lines/arrows/sparks. */
  bright: string;
  /** Bright tint as rgb triplet. */
  rgbBright: string;
  /** React status-chip treatment (border / surface / readable text). */
  chip: string;
  /** React solid fill treatment (progress bars, dots). */
  fill: string;
  /** React soft fill treatment (trail connector lines at 40%). */
  fillSoft: string;
  /** React glow treatment (respect EFFECTS_BUDGET_CONFIGS glow limits). */
  glow: string;
}

const chipFor = (hex: string, bright: string) =>
  `border-[${hex}]/40 bg-[${hex}]/10 text-[${bright}]`;
const fillFor = (hex: string) => `bg-[${hex}]`;
const fillSoftFor = (hex: string) => `bg-[${hex}]/40`;
const glowFor = (bright: string) => `shadow-[0_0_8px_${bright}]`;

function entry(token: WorkflowColorKey): ExecutionLanguageEntry {
  const hex = WORKFLOW_COLORS[token];
  const bright = mixWhite(hex, 0.55);
  return {
    token,
    rgb: hexToParts(hex).join(','),
    rgbBright: hexToParts(bright).join(','),
    bright,
    chip: chipFor(hex, bright),
    fill: fillFor(hex),
    fillSoft: fillSoftFor(hex),
    glow: glowFor(bright),
  };
}

/**
 * The canonical execution language. Every execution-state visual treatment
 * in the canonical UI derives from this map — components MUST NOT invent
 * separate visual/state treatments.
 */
export const EXECUTION_LANGUAGE = {
  /** Neutral idle — no particles, no continuous animation (behavioral rule). */
  idle: {
    token: 'textDim' as WorkflowColorKey,
    rgb: hexToParts(WORKFLOW_COLORS.textDim).join(','),
    rgbBright: hexToParts(WORKFLOW_COLORS.textMuted).join(','),
    bright: WORKFLOW_COLORS.textMuted,
    chip: 'border-white/10 bg-white/[0.04] text-slate-300',
    fill: 'bg-slate-600',
    fillSoft: 'bg-white/10',
    glow: '',
  },
  /** RUNNING / INTELLIGENCE — blue/cyan activation. */
  running: entry('primary'),
  /** EXTERNAL ACTION / SIDE EFFECT — amber/gold execution pulse. */
  externalAction: entry('processing'),
  /** COMPLETED — restrained green settled state. */
  completed: entry('success'),
  /** BLOCKED — restrained red state. */
  blocked: entry('error'),
  /** APPROVAL — static amber governance treatment (same token family as
   *  external action; static: no continuous animation). */
  approval: entry('processing'),
  /** FOCUS / SELECTION — primary-family emphasis ring (static). */
  focus: entry('primary'),
} as const satisfies Record<ExecutionSemantic, ExecutionLanguageEntry>;

export type ExecutionLanguageKey = keyof typeof EXECUTION_LANGUAGE;

/* ------------------------------------------------------ entity identity map */

/**
 * Entity identity tints — the identity axis, deliberately SEPARATE from the
 * execution-state axis (an agent keeps its identity color regardless of the
 * execution state of its work). Single source for agent/gate/vault tints.
 */
export const ENTITY_IDENTITY = {
  founder: '#38bdf8',
  sophia: '#fb923c',
  thorne: '#38bdf8',
  cruz: '#34d399',
  lin: '#c084fc',
  approval: '#fbbf24',
  verifier: '#34d399',
  verifierBlocked: '#fb7185',
  vault: '#34d399',
  /** Genuinely unmatched external services (last-resort fallback only). */
  github: '#ffffff',
  slack: '#ECB22E',
  telegram: '#2AABEE',
  gmail: '#EA4335',
} as const;

export type EntityIdentityKey = keyof typeof ENTITY_IDENTITY;

/* ------------------------------------------------------- neutral conduits */

/**
 * Quiet idle baseline conduit treatment (ambient breathing only, no flurry).
 * The neutral-connection primitive for the canvas engine.
 */
export const NEUTRAL_CONDUIT = {
  /** Wide dim base stroke. */
  base: `rgba(${hexToParts('#283a5a').join(',')},`,
  /** Narrow brighter core stroke. */
  core: `rgba(${hexToParts('#82a5cd').join(',')},`,
  /** Neutral arrowhead tint. */
  arrow: `rgba(${hexToParts('#b4d2f0').join(',')},`,
} as const;

/**
 * Ambient canvas chrome (grid crosshairs) — technical marking derived from
 * the primary token at very low alpha; not execution energy.
 */
export const CANVAS_CHROME = {
  crosshair: tokenRgba('primary', 0.05),
} as const;

/* ---------------------------------------------------- motion / glow limits */

// Motion & easing: MOTION_TOKENS (tokens.ts) is the canonical source.
// Glow & animation limits: EFFECTS_BUDGET_CONFIGS (tokens.ts) is the
// canonical source. Both are re-exported here for a single import site.
export { MOTION_TOKENS, EFFECTS_BUDGET_CONFIGS } from './tokens';
