/**
 * SamJuniorsOS Workflow Design System — Centralized Design Tokens
 * 
 * Maps 1:1 with FLOWGRID reference specification while preserving
 * SamJuniorsOS obsidian glass and semantic color invariants (DESIGN.md).
 * 
 * Presentation-only, fully portable, zero runtime/backend dependencies.
 */

export const WORKFLOW_COLORS = {
  // Primary / Active Conduit (Cyan/Blue)
  primary: '#00B2FF',
  primaryMuted: 'rgba(0, 178, 255, 0.15)',
  primaryGlow: 'rgba(0, 178, 255, 0.45)',
  primaryBorder: 'rgba(0, 178, 255, 0.65)',

  // Processing / Attention (Amber/Orange)
  processing: '#FF8A00',
  processingMuted: 'rgba(255, 138, 0, 0.15)',
  processingGlow: 'rgba(255, 138, 0, 0.45)',
  processingBorder: 'rgba(255, 138, 0, 0.70)',

  // Success / Verified / Healthy (Emerald/Green)
  success: '#22D97A',
  successMuted: 'rgba(34, 217, 122, 0.15)',
  successGlow: 'rgba(34, 217, 122, 0.45)',
  successBorder: 'rgba(34, 217, 122, 0.70)',

  // Error / Blocked / Invariant Violation (Rose/Red)
  error: '#FF4B4B',
  errorMuted: 'rgba(255, 75, 75, 0.15)',
  errorGlow: 'rgba(255, 75, 75, 0.45)',
  errorBorder: 'rgba(255, 75, 75, 0.70)',

  // Neutral / Base Palette (Obsidian Glass)
  text: '#FFFFFF',
  textMuted: '#94A3B8',
  textDim: '#64748B',

  surface: '#1E293B',
  surfaceHover: '#334155',
  background: '#0F172A',
  bgVoid: '#01040A',
  bgDeep: '#04060D',
  bgGlass: 'rgba(5, 10, 20, 0.82)',
  bgGlassHover: 'rgba(12, 22, 40, 0.90)',

  // Specular hairline borders
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  borderDefault: 'rgba(255, 255, 255, 0.14)',
  borderElevated: 'rgba(255, 255, 255, 0.22)',
} as const;

export type WorkflowColorKey = keyof typeof WORKFLOW_COLORS;

/** Node Geometry definitions */
export type NodeGeometryType = 'square' | 'rectangle' | 'circle' | 'squircle' | 'pill';

/** Node Interactive States */
export type NodeStateType =
  | 'default'
  | 'hover'
  | 'selected'
  | 'active'
  | 'processing'
  | 'success'
  | 'error'
  | 'disabled';

/** Standard Size Variants */
export type NodeSize = 'sm' | 'md' | 'lg';

/** Dimensions by geometry and size */
export const GEOMETRY_SIZES: Record<NodeGeometryType, Record<NodeSize, { width: number; height: number; radius: string }>> = {
  square: {
    sm: { width: 64, height: 64, radius: '16px' },
    md: { width: 96, height: 96, radius: '20px' },
    lg: { width: 128, height: 128, radius: '24px' },
  },
  rectangle: {
    sm: { width: 140, height: 56, radius: '16px' },
    md: { width: 190, height: 68, radius: '20px' },
    lg: { width: 240, height: 80, radius: '22px' },
  },
  circle: {
    sm: { width: 64, height: 64, radius: '9999px' },
    md: { width: 96, height: 96, radius: '9999px' },
    lg: { width: 120, height: 120, radius: '9999px' },
  },
  squircle: {
    sm: { width: 68, height: 68, radius: '22px' },
    md: { width: 104, height: 104, radius: '28px' },
    lg: { width: 136, height: 136, radius: '36px' },
  },
  pill: {
    sm: { width: 84, height: 42, radius: '9999px' },
    md: { width: 116, height: 52, radius: '9999px' },
    lg: { width: 148, height: 64, radius: '9999px' },
  },
};

/** Centralized Depth & Shadow Tokens */
export const DEPTH_TOKENS = {
  canvas: 'inset 0 0 100px rgba(0, 0, 0, 0.95)',
  surface: '0 4px 20px -2px rgba(0, 0, 0, 0.70), 0 1px 3px rgba(0, 0, 0, 0.85)',
  nodeResting:
    '0 12px 32px -4px rgba(0, 0, 0, 0.75), 0 4px 12px -2px rgba(0, 0, 0, 0.60), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
  nodeHover:
    '0 18px 40px -6px rgba(0, 0, 0, 0.85), 0 0 20px rgba(0, 178, 255, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.20)',
  nodeSelected:
    '0 0 0 2px #00B2FF, 0 0 32px rgba(0, 178, 255, 0.40), inset 0 1px 0 rgba(255, 255, 255, 0.30)',
  nodeActive:
    '0 0 0 1.5px rgba(0, 178, 255, 0.85), 0 0 28px rgba(0, 178, 255, 0.35), inset 0 0 16px rgba(0, 178, 255, 0.15)',
  nodeProcessing:
    '0 0 0 1.5px rgba(255, 138, 0, 0.90), 0 0 32px rgba(255, 138, 0, 0.40), inset 0 0 20px rgba(255, 138, 0, 0.15)',
  nodeSuccess:
    '0 0 0 1.5px rgba(34, 217, 122, 0.90), 0 0 30px rgba(34, 217, 122, 0.40), inset 0 0 16px rgba(34, 217, 122, 0.15)',
  nodeError:
    '0 0 0 1.5px rgba(255, 75, 75, 0.90), 0 0 32px rgba(255, 75, 75, 0.45), inset 0 0 18px rgba(255, 75, 75, 0.20)',
} as const;

/** Motion & Transition Tokens */
export const MOTION_TOKENS = {
  hoverDurationMs: 180,
  transitionDurationMs: 240,
  pulseCycleMs: 1800,
  signalVelocityPxPerSec: 160,
  activationDecayMs: 450,
  burstDurationMs: 380,
} as const;

/** Performance / Effects Budget Levels */
export type EffectsBudget = 'full' | 'balanced' | 'minimal';

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
