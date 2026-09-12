/**
 * SamJuniorsOS Workflow Design System — Canonical Execution Language
 *
 * Semantic mapping of the approved Canvas execution-language model onto the
 * Phase 4.1 WORKFLOW_COLORS token set. This is an extension of the existing
 * token library (same design system), NOT a new design system.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  STATUS: FROZEN (Phase 4.3C — Canonical Repository Consolidation)      │
 * │  The language below is consolidated and verified. Any change to these  │
 * │  semantics requires explicit founder approval.                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * SINGLE SOURCE OF TRUTH for:
 *   - runtime execution states (idle / running / external action / completed /
 *     blocked / approval / focus) — colors AND class bundles
 *   - entity identity tints (agents, governance gates, vault, services)
 *   - canvas-engine rgba derivations (packets, conduits, rings, energy glows)
 *   - conduit + arrival treatments (stroke widths/alphas per state)
 *
 * CANONICAL EXECUTION LANGUAGE (Phase 4.3C constraint, behavioral contract):
 *
 *   §1 CALM BASELINE — idle canvas is predominantly monochrome/neutral:
 *       thin gray/white lines, no particles, no animated dashes, no sparks,
 *       no artificial glow, no continuous motion. A clean technical schematic.
 *
 *   §2 ACTIVITY COMES FROM REAL SYSTEM STATE ONLY — user selection/clicking
 *       never emits execution effects; energy is driven exclusively by
 *       authoritative runtime state.
 *
 *   §3 COLOR = RUNTIME STATE/ENERGY, NEVER AGENT IDENTITY —
 *       NEUTRAL gray/white (idle/dormant)
 *       BLUE/CYAN  active intelligence / in-progress processing
 *       AMBER/GOLD active external action / side effect (execution pulse)
 *       GREEN      successful completion / verified result (settled)
 *       RED        blocked / failed / intervention required (restrained)
 *       AMBER STATIC  founder approval / governance attention (never animated
 *       like execution). Authority is read from entity identity, relationship
 *       semantics, ownership metadata and inspector state — not from energy
 *       color.
 *
 *   §4 EXECUTION ANIMATION SEQUENCE — source node fill begins → connection
 *       progressively fills → directional energy/comet travels the SAME
 *       rendered edge path → target node activates → settles → the next
 *       authoritative relationship may activate. Deterministic and
 *       state-driven; never an independent particle system.
 *
 *   §5 CONNECTION ROUTING — deterministic routing: avoid accidental crossings
 *       and lines through nodes; orthogonal / gently curved paths, minimal
 *       bends, semantic edge layers preserved, animation on the exact routed
 *       path; unavoidable crossings are deliberate (line hops).
 *
 *   §6 VISUAL HIERARCHY — the strongest effect occurs ONLY where real
 *       execution happens: idle = quiet, running = alive, completed = settled,
 *       blocked = clearly interrupted, approval = clearly awaiting authority.
 *
 *   §7 RESTRAINT — no excessive sparks/particles/bloom/constant glow/
 *       cinematic effects. An operational interface, not a promotional
 *       animation.
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
  /** Genuinely unmatched external services (last-resort fallback only).
   *  Phase 4.3C identity-axis extension (founder-approved reference): the
   *  brand identity now renders as the official flat logo mark (see
   *  BrandLogos.tsx); these tints remain for text/metadata accents only. */
  github: '#ffffff',
  slack: '#ECB22E',
  telegram: '#2AABEE',
  gmail: '#EA4335',
  google: '#4285F4',
  gemini: '#4285F4',
  whatsapp: '#25D366',
} as const;

export type EntityIdentityKey = keyof typeof ENTITY_IDENTITY;

/* ------------------------------------------------------- neutral conduits */

/**
 * CALM BASELINE (§1) — quiet idle conduit treatment.
 * Thin neutral gray/white lines, token-derived (textDim base / textMuted
 * core). STRICTLY STATIC: no particles, no animated dashes, no sparks, no
 * artificial glow, no continuous motion while the system is idle.
 */
export const NEUTRAL_CONDUIT = {
  /** Thin dim gray base stroke (textDim token). */
  base: `rgba(${hexToParts(WORKFLOW_COLORS.textDim).join(',')},`,
  /** Narrow light-gray core stroke (textMuted token). */
  core: `rgba(${hexToParts(WORKFLOW_COLORS.textMuted).join(',')},`,
  /** Neutral gray arrowhead tint (textMuted token). */
  arrow: `rgba(${hexToParts(WORKFLOW_COLORS.textMuted).join(',')},`,
} as const;

/* ------------------------------------------------------- conduit language */

/** Per-state conduit treatment for the canvas engine (§1/§3/§4/§6). */
export interface ConduitTreatment {
  /** Wide base stroke rgba prefix ("r,g,b"). */
  base: string;
  /** Narrow core stroke rgba prefix. */
  core: string;
  /** Bright fill-overlay rgba prefix (progressive source→target fill). */
  bright: string;
  /** Wide base stroke width (px). */
  baseWidth: number;
  /** Narrow core stroke width (px). */
  coreWidth: number;
  baseAlpha: number;
  coreAlpha: number;
  /** Progressive fill overlay width; 0 = this state never fills (§4). */
  fillWidth: number;
  fillAlpha: number;
  /** Arrowhead tint alpha at rest (node energy adds up to +0.2). */
  arrowAlpha: number;
  /** Additive ("lighter") composite — reserved for real execution energy. */
  additive: boolean;
}

/** Conduit treatment keys — one per canonical execution rendering state. */
export type ConduitKey =
  | 'idle'
  | 'running'
  | 'externalAction'
  | 'blocked'
  | 'completed'
  | 'governance';

const conduit = (
  rgb: string,
  rgbBright: string,
  o: Partial<ConduitTreatment>
): ConduitTreatment => ({
  base: rgb,
  core: rgbBright,
  bright: rgbBright,
  baseWidth: 5,
  coreWidth: 1.8,
  baseAlpha: 0.18,
  coreAlpha: 0.45,
  fillWidth: 0,
  fillAlpha: 0,
  arrowAlpha: 0.7,
  additive: false,
  ...o,
});

/** Token hex → "r,g,b" rgba prefix. */
const hexRgb = (hex: string): string => hexToParts(hex).join(',');

/**
 * CONDUIT_LANGUAGE — how a relationship renders per execution state.
 *  - idle:            thin, static, monochrome (calm schematic baseline)
 *  - running:         blue/cyan activation, additive energy, progressive fill
 *  - externalAction:  amber/gold execution pulse, additive, progressive fill
 *  - blocked:         restrained red (gentle state pulse only, no particles)
 *  - completed:       restrained green settled state, static
 *  - governance:      STATIC amber approval boundary — never animated like
 *                     execution (§3: must not be confused with active runs)
 */
export const CONDUIT_LANGUAGE = {
  idle: conduit(
    hexRgb(WORKFLOW_COLORS.textDim),
    hexRgb(WORKFLOW_COLORS.textMuted),
    { baseWidth: 2.6, coreWidth: 1.1, baseAlpha: 0.14, coreAlpha: 0.22, arrowAlpha: 0.5 }
  ),
  running: conduit(EXECUTION_LANGUAGE.running.rgb, EXECUTION_LANGUAGE.running.rgbBright, {
    baseWidth: 7, coreWidth: 2.2, baseAlpha: 0.2, coreAlpha: 0.5,
    fillWidth: 2.6, fillAlpha: 0.85, arrowAlpha: 0.85, additive: true,
  }),
  externalAction: conduit(EXECUTION_LANGUAGE.externalAction.rgb, EXECUTION_LANGUAGE.externalAction.rgbBright, {
    baseWidth: 7, coreWidth: 2.2, baseAlpha: 0.22, coreAlpha: 0.55,
    fillWidth: 2.6, fillAlpha: 0.9, arrowAlpha: 0.85, additive: true,
  }),
  blocked: conduit(EXECUTION_LANGUAGE.blocked.rgb, EXECUTION_LANGUAGE.blocked.rgbBright, {
    baseWidth: 6, coreWidth: 2.0, baseAlpha: 0.18, coreAlpha: 0.5, arrowAlpha: 0.8, additive: true,
  }),
  completed: conduit(EXECUTION_LANGUAGE.completed.rgb, EXECUTION_LANGUAGE.completed.rgbBright, {
    baseWidth: 3.6, coreWidth: 1.3, baseAlpha: 0.12, coreAlpha: 0.34, arrowAlpha: 0.55,
  }),
  governance: conduit(EXECUTION_LANGUAGE.approval.rgb, EXECUTION_LANGUAGE.approval.rgbBright, {
    baseWidth: 5.5, coreWidth: 1.8, baseAlpha: 0.2, coreAlpha: 0.5, arrowAlpha: 0.8,
  }),
} as const satisfies Record<ConduitKey, ConduitTreatment>;

/* -------------------------------------------------------- arrival language */

/**
 * ARRIVAL_LANGUAGE (§4 "target node activates") — the restrained short
 * activation a destination receives when real energy arrives: one small
 * ring + a decaying node glow. No ember bursts, no dual shockwaves (§7).
 */
export const ARRIVAL_LANGUAGE = {
  /** Single restrained ring radius (px). */
  ringRadius: 56,
  /** Ring max alpha at emission. */
  ringAlpha: 0.55,
  /** Ring lifetime (matches MOTION_TOKENS.burstDurationMs). */
  ringLifeMs: 380,
  /** Node activation glow peak alpha (decays per activationDecayMs). */
  glowAlpha: 0.4,
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
