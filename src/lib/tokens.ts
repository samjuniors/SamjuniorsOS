/* --------------------------------------------------- Canonical State Tokens */

export type StateKey =
  | "idle"
  | "running"
  | "signal"
  | "completed"
  | "blocked"
  | "approval";

export const stateAccent: Record<StateKey, string> = {
  idle: "#6b7c93",
  running: "#38bdf8",
  signal: "#f59e0b",
  completed: "#34d399",
  blocked: "#f43f5e",
  approval: "#a78bfa",
};

export const stateLabel: Record<StateKey, string> = {
  idle: "IDLE",
  running: "RUNNING",
  signal: "EXTERNAL ACTION",
  completed: "COMPLETED",
  blocked: "BLOCKED",
  approval: "APPROVAL REQUIRED",
};

export const stateCaption: Record<StateKey, string> = {
  idle: "no authority claimed",
  running: "work in progress",
  signal: "waiting on third party",
  completed: "artifact sealed",
  blocked: "conduit severed",
  approval: "human in the loop",
};

export const fallbackTokens = [
  { category: "surface", name: "void", value: "#05070c", note: "page base" },
  { category: "surface", name: "canvas", value: "#080c14", note: "grid field" },
  { category: "surface", name: "panel", value: "#0b111b", note: "card body" },
  { category: "surface", name: "line", value: "#182233", note: "hairline border" },
  { category: "text", name: "primary", value: "#e6edf7", note: "headings" },
  { category: "text", name: "muted", value: "#7d8ca3", note: "body copy" },
  { category: "text", name: "dim", value: "#4d5c72", note: "eyebrow labels" },
  { category: "state", name: "idle", value: "#6b7c93", note: "dormant node" },
  { category: "state", name: "running", value: "#38bdf8", note: "active conduit" },
  { category: "state", name: "signal", value: "#f59e0b", note: "external action" },
  { category: "state", name: "completed", value: "#34d399", note: "sealed result" },
  { category: "state", name: "blocked", value: "#f43f5e", note: "severed edge" },
  { category: "state", name: "approval", value: "#a78bfa", note: "authority gate" },
  { category: "motion", name: "orbit", value: "12000ms linear", note: "halo rotation" },
  { category: "motion", name: "pulse", value: "2600ms ease-in-out", note: "breathing ring" },
  { category: "motion", name: "dash", value: "3000ms linear", note: "conduit flow" },
  { category: "radius", name: "node", value: "999px", note: "circular entity" },
  { category: "radius", name: "card", value: "14px", note: "panel corners" },
];

export const fallbackStates: {
  key: StateKey;
  label: string;
  accent: string;
  motion: string;
  description: string;
}[] = (Object.keys(stateAccent) as StateKey[]).map((k) => ({
  key: k,
  label: stateLabel[k],
  accent: stateAccent[k],
  motion:
    k === "running" ? "orbit + pulse" : k === "signal" ? "slow breathe" : k === "approval" ? "double ring" : "static",
  description: stateCaption[k],
}));

/* --------------------------------------------------- Workflow Color Palette */

export const WORKFLOW_COLORS = {
  primary: "#38bdf8",
  processing: "#f59e0b",
  success: "#34d399",
  error: "#f43f5e",
  neutral: "#6b7c93",
  borderDefault: "#182233",
  borderSubtle: "#101726",
  bgVoid: "#05070c",
  bgSurface: "#0b111b",
  bgPanel: "#0b111b",
  textPrimary: "#e6edf7",
  textMuted: "#7d8ca3",
  textDim: "#4d5c72",
  accentPurple: "#a78bfa",
  accentCyan: "#38bdf8",
} as const;

export type WorkflowColorKey = keyof typeof WORKFLOW_COLORS;

function hexToParts(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function mixWhite(hex: string, t: number): string {
  const [r, g, b] = hexToParts(hex);
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `#${[m(r), m(g), m(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function tokenRgb(key: WorkflowColorKey): string {
  return hexToParts(WORKFLOW_COLORS[key]).join(",");
}

export function tokenRgbParts(key: WorkflowColorKey): [number, number, number] {
  return hexToParts(WORKFLOW_COLORS[key]);
}

export function tokenRgba(key: WorkflowColorKey, alpha: number): string {
  return `rgba(${tokenRgb(key)},${alpha})`;
}

/* --------------------------------------------------- Execution Language Map */

export type ExecutionSemantic =
  | "idle"
  | "running"
  | "externalAction"
  | "completed"
  | "blocked"
  | "approval"
  | "focus";

export interface ExecutionLanguageEntry {
  token: WorkflowColorKey;
  rgb: string;
  bright: string;
  rgbBright: string;
  chip: string;
  fill: string;
  fillSoft: string;
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
    rgb: hexToParts(hex).join(","),
    rgbBright: hexToParts(bright).join(","),
    bright,
    chip: chipFor(hex, bright),
    fill: fillFor(hex),
    fillSoft: fillSoftFor(hex),
    glow: glowFor(bright),
  };
}

export const EXECUTION_LANGUAGE = {
  idle: {
    token: "textDim" as WorkflowColorKey,
    rgb: hexToParts(WORKFLOW_COLORS.textDim).join(","),
    rgbBright: hexToParts(WORKFLOW_COLORS.textMuted).join(","),
    bright: WORKFLOW_COLORS.textMuted,
    chip: "border-white/10 bg-white/[0.04] text-slate-300",
    fill: "bg-slate-600",
    fillSoft: "bg-white/10",
    glow: "",
  },
  running: entry("primary"),
  externalAction: entry("processing"),
  completed: entry("success"),
  blocked: entry("error"),
  approval: entry("processing"),
  focus: entry("primary"),
} as const satisfies Record<ExecutionSemantic, ExecutionLanguageEntry>;

export type ExecutionLanguageKey = keyof typeof EXECUTION_LANGUAGE;

/* ------------------------------------------------------ Entity Identity Map */

export const ENTITY_IDENTITY = {
  founder: "#38bdf8",
  sophia: "#fb923c",
  thorne: "#38bdf8",
  cruz: "#34d399",
  lin: "#c084fc",
  approval: "#fbbf24",
  verifier: "#34d399",
  verifierBlocked: "#fb7185",
  vault: "#34d399",
  github: "#ffffff",
  slack: "#ECB22E",
  telegram: "#2AABEE",
  gmail: "#EA4335",
  google: "#4285F4",
  gemini: "#4285F4",
  whatsapp: "#25D366",
} as const;

export type EntityIdentityKey = keyof typeof ENTITY_IDENTITY;

/* ------------------------------------------------------- Neutral Conduits */

export const NEUTRAL_CONDUIT = {
  base: `rgba(${hexToParts(WORKFLOW_COLORS.textDim).join(",")},`,
  core: `rgba(${hexToParts(WORKFLOW_COLORS.textMuted).join(",")},`,
  arrow: `rgba(${hexToParts(WORKFLOW_COLORS.textMuted).join(",")},`,
} as const;

/* ------------------------------------------------------- Conduit Language */

export interface ConduitTreatment {
  base: string;
  core: string;
  bright: string;
  baseWidth: number;
  coreWidth: number;
  baseAlpha: number;
  coreAlpha: number;
  fillWidth: number;
  fillAlpha: number;
  arrowAlpha: number;
  additive: boolean;
}

export type ConduitKey =
  | "idle"
  | "running"
  | "externalAction"
  | "blocked"
  | "completed"
  | "governance";

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

const hexRgb = (hex: string): string => hexToParts(hex).join(",");

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

/* -------------------------------------------------------- Arrival Language */

export const ARRIVAL_LANGUAGE = {
  ringRadius: 56,
  ringAlpha: 0.55,
  ringLifeMs: 380,
  glowAlpha: 0.4,
  waveLifeMs: 240,
  waveAlpha: 0.5,
  waveWidth: 1.6,
  bloomAttackMs: 90,
  bloomDecayMs: 640,
  bloomAlpha: 0.32,
  sweepMs: 60,
  sweepAlpha: 0.13,
} as const;

/* ------------------------------------------------------ Perimeter Language */

export const PERIMETER_LANGUAGE = {
  strokeWidth: 2.5,
  start: "top" as const,
  direction: "clockwise" as const,
  unmeasuredArc: 0.25,
  unmeasuredOrbitMs: 2600,
  approvalArc: 1,
  approvalAlpha: 0.45,
  activeAlpha: 0.95,
  settledAlpha: 0.7,
  blockedAlpha: 0.9,
  headDotRadius: 2.5,
  transitionMs: 620,
  epsilon: 0.02,
} as const;

/* ------------------------------------------------------ Canvas Chrome */

export const CANVAS_CHROME = {
  crosshair: tokenRgba("primary", 0.05),
} as const;

/* ------------------------------------------------------ Motion & Budget */

export const MOTION_TOKENS = {
  hoverDurationMs: 180,
  transitionDurationMs: 240,
  pulseCycleMs: 1800,
  signalVelocityPxPerSec: 160,
  activationDecayMs: 450,
  burstDurationMs: 380,
  conduitFillMs: 700,
  cometCadenceMs: 1500,
} as const;

export type EffectsBudget = "full" | "balanced" | "minimal";

export interface PerformanceBudgetConfig {
  maxParticlesPerConduit: number;
  enableAmbientParticles: boolean;
  enableComplexGlowFilters: boolean;
  enableShockwaves: boolean;
  pulseDurationMultiplier: number;
}

export const EFFECTS_BUDGET_CONFIGS: Record<EffectsBudget, PerformanceBudgetConfig> = {
  full: {
    maxParticlesPerConduit: 6,
    enableAmbientParticles: true,
    enableComplexGlowFilters: true,
    enableShockwaves: true,
    pulseDurationMultiplier: 1.0,
  },
  balanced: {
    maxParticlesPerConduit: 3,
    enableAmbientParticles: false,
    enableComplexGlowFilters: false,
    enableShockwaves: true,
    pulseDurationMultiplier: 1.2,
  },
  minimal: {
    maxParticlesPerConduit: 1,
    enableAmbientParticles: false,
    enableComplexGlowFilters: false,
    enableShockwaves: false,
    pulseDurationMultiplier: 1.5,
  },
};

/* ------------------------------------------------------ Spatial Depth */

export const SPATIAL_TOKENS = {
  springCamera: {
    omega: 15,
    dampingRatio: 1,
    settleEpsilon: 0.05,
  },
} as const;

/* ------------------------------------------------------ Node Types & Geometry */

export type NodeGeometryType = "circle" | "squircle" | "square" | "wideRectangle" | "pill";
export type NodeStateType = "default" | "hover" | "selected" | "active" | "processing" | "success" | "error";
export type NodeSize = "sm" | "md" | "lg";

export interface NodeIndicator {
  status: "active" | "waiting" | "success" | "error";
  label?: string;
  glow?: boolean;
}

export interface ExecutionPerimeterSpec {
  semantic: ExecutionSemantic;
  progress?: number;
}

export const GEOMETRY_SIZES: Record<NodeGeometryType, Record<NodeSize, { width: number; height: number; radius: string }>> = {
  circle: {
    sm: { width: 44, height: 44, radius: "9999px" },
    md: { width: 56, height: 56, radius: "9999px" },
    lg: { width: 72, height: 72, radius: "9999px" },
  },
  squircle: {
    sm: { width: 48, height: 48, radius: "14px" },
    md: { width: 64, height: 64, radius: "18px" },
    lg: { width: 80, height: 80, radius: "22px" },
  },
  square: {
    sm: { width: 44, height: 44, radius: "10px" },
    md: { width: 56, height: 56, radius: "12px" },
    lg: { width: 72, height: 72, radius: "16px" },
  },
  wideRectangle: {
    sm: { width: 140, height: 44, radius: "10px" },
    md: { width: 180, height: 56, radius: "12px" },
    lg: { width: 220, height: 68, radius: "14px" },
  },
  pill: {
    sm: { width: 90, height: 36, radius: "9999px" },
    md: { width: 120, height: 44, radius: "9999px" },
    lg: { width: 150, height: 52, radius: "9999px" },
  },
};
