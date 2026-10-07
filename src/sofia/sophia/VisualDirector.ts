/**
 * VisualDirector — turns lifecycle state + real audio levels into the
 * per-frame parameters the renderer consumes. Voice-agnostic.
 *
 * Two strictly separated concerns per state:
 *   • ATMOSPHERE  — background aurora colour, drift speed, breathing rate,
 *                   vignette. Never touches the shape.
 *   • THE SHAPE   — particle/body colour tint and glow. Never touches the
 *                   background.
 *
 * Plus two cross-cutting states:
 *   • WAKEUP  — particles converge from a scattered shell, aura blooms,
 *               a shockwave ring expands, then she settles.
 *   • PAUSED  — motion freezes, everything desaturates and dims, voice events
 *               are ignored until resumed.
 */

import type { FrameParams, ParticleRenderer } from './ParticleRenderer';
import { ShapeGenerator, type SophiaForm } from './ShapeGenerator';
import type { SophiaShape, SophiaStateName } from './types';

const TAU = Math.PI * 2;
type Vec3 = [number, number, number];

/** User-correctable shape parameters (Settings → Shape correction). */
export interface ShapeTune {
  scale: number;
  rim: number;
  glow: number;
  hue: number;
  saturation: number;
  orbits: boolean;
  waves: boolean;
  spin: boolean;
  onlyParticles: boolean;
  particleScale: number;
  sparkle: number;
  backgroundEnabled: boolean;
  backgroundIntensity: number;
  backgroundMotion: number;
  dustVisible: boolean;
  dustSpeed: number;
  dustAmount: number;
}

export const DEFAULT_TUNE: ShapeTune = {
  scale: 1,
  rim: 1,
  glow: 1,
  hue: 0,
  saturation: 1.0,
  orbits: true,
  waves: true,
  spin: true,
  onlyParticles: false,
  particleScale: 1.0,
  sparkle: 1.0,
  backgroundEnabled: true,
  // Keep the atmosphere present but subordinate to Sophia.
  backgroundIntensity: 0.46,
  backgroundMotion: 0.72,
  dustVisible: true,
  dustSpeed: 0.8,
  dustAmount: 1.0,
};

export type DensityTier = 'low' | 'medium' | 'high';
export type ThemeId = 'deepgram' | 'studio' | 'emerald';

export interface ThemePreset {
  id: ThemeId;
  label: string;
  hint: string;
  form: SophiaForm;
  tune: ShapeTune;
  previewState: SophiaStateName;
  shape?: SophiaShape;
}

export const THEMES: ThemePreset[] = [
  {
    id: 'deepgram',
    label: 'Deepgram Idle',
    hint: 'bowed multi-ribbon, particles only',
    form: 'sphere',
    previewState: 'idle',
    shape: 'bow',
    tune: {
      ...DEFAULT_TUNE,
      onlyParticles: true,
      hue: -0.12,
      glow: 1.18,
      particleScale: 1.22,
      sparkle: 1.25,
      orbits: false,
      waves: false,
      spin: false,
      backgroundIntensity: 0.28,
      backgroundMotion: 0.38,
      scale: 1.04,
    },
  },
  {
    id: 'studio',
    label: 'Studio Cyan',
    hint: 'full rim, cool cyan studio light',
    form: 'sphere',
    previewState: 'listening',
    tune: {
      ...DEFAULT_TUNE,
      onlyParticles: false,
      hue: -0.62,
      glow: 1.22,
      particleScale: 1.0,
      sparkle: 0.82,
      orbits: true,
      waves: true,
      spin: true,
      backgroundIntensity: 0.58,
      backgroundMotion: 0.84,
      rim: 1.12,
    },
  },
  {
    id: 'emerald',
    label: 'Night Emerald',
    hint: 'resolved green, calm night',
    form: 'sphere',
    previewState: 'completed',
    tune: {
      ...DEFAULT_TUNE,
      onlyParticles: false,
      hue: 0.18,
      glow: 1.28,
      particleScale: 1.08,
      sparkle: 1.12,
      orbits: true,
      waves: true,
      spin: true,
      backgroundIntensity: 0.5,
      backgroundMotion: 0.52,
    },
  },
];

const ENERGY: Record<SophiaStateName, number> = {
  ambient: 0.15,
  idle: 0.18,
  wakeup: 0.35,
  focusing: 0.45,
  listening: 0.6,
  thinking: 0.75,
  speaking: 0.85,
  rendering: 0.9,
  transforming: 0.75,
  pause: 0.12,
  paused: 0.12,
  completed: 0.55,
  blocked: 0.40,
};

interface Palette {
  /** state id sent to the shader (legacy numeric channel) */
  code: number;
  /* ---- background aurora only ---- */
  bgDeep: Vec3;
  bgCore: Vec3;
  bgAuraA: Vec3;
  bgAuraB: Vec3;
  bgAuraAmt: number;
  bgSpeed: number;
  bgPulse: number;
  bgPulseSpd: number;
  bgVig: number;
  /* ---- the shape only ---- */
  tint: Vec3;
  tintAmt: number;
  glow: number;
}

/**
 * Per-state art direction. Background aura and shape colour are separate
 * channels so a state reads instantly without one drowning out the other.
 */
const PALETTES: Record<SophiaStateName, Palette> = {
  // resting: cool deep navy, faint indigo mist, calm electric-blue body
  ambient: {
    code: 0,
    bgDeep: [0.004, 0.008, 0.024], bgCore: [0.012, 0.024, 0.062],
    bgAuraA: [0.10, 0.22, 0.62], bgAuraB: [0.30, 0.16, 0.58],
    bgAuraAmt: 0.42, bgSpeed: 0.55, bgPulse: 0.05, bgPulseSpd: 0.42, bgVig: 0.9,
    tint: [0.30, 0.68, 1.0], tintAmt: 0.0, glow: 1.0,
  },
  // idle: deep cosmic serenity — rich indigo/navy cosmos, gentle violet mist, luminous celestial cyan core
  idle: {
    code: 0,
    bgDeep: [0.004, 0.008, 0.026], bgCore: [0.012, 0.025, 0.068],
    bgAuraA: [0.14, 0.30, 0.72], bgAuraB: [0.34, 0.18, 0.66],
    bgAuraAmt: 0.48, bgSpeed: 0.42, bgPulse: 0.07, bgPulseSpd: 0.35, bgVig: 0.90,
    tint: [0.38, 0.75, 1.0], tintAmt: 0.15, glow: 1.12,
  },
  // wake-up: serene cosmic convergence without white ring, flare, or intense bloom
  wakeup: {
    code: 6,
    bgDeep: [0.004, 0.009, 0.026], bgCore: [0.012, 0.026, 0.070],
    bgAuraA: [0.16, 0.34, 0.75], bgAuraB: [0.28, 0.18, 0.68],
    bgAuraAmt: 0.50, bgSpeed: 0.85, bgPulse: 0.08, bgPulseSpd: 0.8, bgVig: 0.88,
    tint: [0.38, 0.75, 1.0], tintAmt: 0.15, glow: 1.10,
  },
  // focusing: teal-green anticipation, body leans cyan-white toward the mic
  focusing: {
    code: 1,
    bgDeep: [0.005, 0.014, 0.030], bgCore: [0.018, 0.044, 0.070],
    bgAuraA: [0.10, 0.48, 0.56], bgAuraB: [0.14, 0.30, 0.68],
    bgAuraAmt: 0.50, bgSpeed: 0.85, bgPulse: 0.10, bgPulseSpd: 0.8, bgVig: 0.8,
    tint: [0.52, 0.92, 1.0], tintAmt: 0.24, glow: 1.18,
  },
  // listening: bright azure aura that lifts with the mic, cyan body
  listening: {
    code: 2,
    bgDeep: [0.006, 0.020, 0.038], bgCore: [0.026, 0.066, 0.104],
    bgAuraA: [0.14, 0.58, 0.92], bgAuraB: [0.20, 0.34, 0.88],
    bgAuraAmt: 0.62, bgSpeed: 1.0, bgPulse: 0.14, bgPulseSpd: 1.1, bgVig: 0.7,
    tint: [0.34, 0.86, 1.0], tintAmt: 0.32, glow: 1.28,
  },
  // thinking: deep violet nebula, slow and inward; body turns amethyst
  thinking: {
    code: 3,
    bgDeep: [0.008, 0.006, 0.030], bgCore: [0.026, 0.020, 0.078],
    bgAuraA: [0.38, 0.14, 0.80], bgAuraB: [0.16, 0.10, 0.62],
    bgAuraAmt: 0.58, bgSpeed: 1.45, bgPulse: 0.08, bgPulseSpd: 0.6, bgVig: 1.0,
    tint: [0.62, 0.40, 1.0], tintAmt: 0.42, glow: 1.12,
  },
  // speaking: warm rose/amber aura pulsing with playback, body goes warm pink
  speaking: {
    code: 4,
    bgDeep: [0.014, 0.008, 0.020], bgCore: [0.052, 0.026, 0.050],
    bgAuraA: [0.86, 0.24, 0.52], bgAuraB: [0.44, 0.14, 0.66],
    bgAuraAmt: 0.60, bgSpeed: 1.15, bgPulse: 0.18, bgPulseSpd: 1.3, bgVig: 0.68,
    tint: [1.0, 0.50, 0.86], tintAmt: 0.38, glow: 1.34,
  },
  // rendering: machine cyan-green, fast scanning drift, body goes mint-white
  rendering: {
    code: 5,
    bgDeep: [0.004, 0.020, 0.026], bgCore: [0.014, 0.070, 0.082],
    bgAuraA: [0.10, 0.78, 0.68], bgAuraB: [0.12, 0.34, 0.78],
    bgAuraAmt: 0.72, bgSpeed: 2.1, bgPulse: 0.20, bgPulseSpd: 2.0, bgVig: 0.6,
    tint: [0.38, 1.0, 0.90], tintAmt: 0.46, glow: 1.4,
  },
  // transforming: fast magenta↔blue exchange in the aura, body goes orchid
  transforming: {
    code: 6,
    bgDeep: [0.012, 0.006, 0.032], bgCore: [0.046, 0.022, 0.088],
    bgAuraA: [0.62, 0.14, 0.86], bgAuraB: [0.14, 0.36, 0.92],
    bgAuraAmt: 0.74, bgSpeed: 2.8, bgPulse: 0.14, bgPulseSpd: 2.4, bgVig: 0.55,
    tint: [0.78, 0.36, 1.0], tintAmt: 0.34, glow: 1.24,
  },
  // pause / paused: serene frosted twilight, lower energy, slightly dimmer glow, settled
  pause: {
    code: 0,
    bgDeep: [0.005, 0.009, 0.024], bgCore: [0.014, 0.026, 0.058],
    bgAuraA: [0.20, 0.44, 0.75], bgAuraB: [0.28, 0.22, 0.60],
    bgAuraAmt: 0.40, bgSpeed: 0.20, bgPulse: 0.04, bgPulseSpd: 0.22, bgVig: 0.94,
    tint: [0.55, 0.78, 0.95], tintAmt: 0.28, glow: 0.95,
  },
  paused: {
    code: 0,
    bgDeep: [0.005, 0.009, 0.024], bgCore: [0.014, 0.026, 0.058],
    bgAuraA: [0.20, 0.44, 0.75], bgAuraB: [0.28, 0.22, 0.60],
    bgAuraAmt: 0.40, bgSpeed: 0.20, bgPulse: 0.04, bgPulseSpd: 0.22, bgVig: 0.94,
    tint: [0.55, 0.78, 0.95], tintAmt: 0.28, glow: 0.95,
  },
  // completed: soft emerald success — calm, resolved, warm green body
  completed: {
    code: 7,
    bgDeep: [0.004, 0.018, 0.012], bgCore: [0.012, 0.055, 0.038],
    bgAuraA: [0.18, 0.72, 0.42], bgAuraB: [0.10, 0.48, 0.58],
    bgAuraAmt: 0.58, bgSpeed: 0.75, bgPulse: 0.12, bgPulseSpd: 0.9, bgVig: 0.72,
    tint: [0.32, 0.95, 0.58], tintAmt: 0.48, glow: 1.32,
  },
  // blocked: restrained resistance — obsidian navy with restrained rose/red tension accents
  blocked: {
    code: 8,
    bgDeep: [0.012, 0.005, 0.014], bgCore: [0.038, 0.014, 0.030],
    bgAuraA: [0.72, 0.16, 0.32], bgAuraB: [0.28, 0.08, 0.35],
    bgAuraAmt: 0.55, bgSpeed: 0.35, bgPulse: 0.14, bgPulseSpd: 0.55, bgVig: 0.88,
    tint: [0.95, 0.28, 0.38], tintAmt: 0.55, glow: 1.15,
  },
};

type MorphPhase = 'in' | 'hold' | 'out' | null;

const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export class VisualDirector {
  state: SophiaStateName = 'ambient';
  onTransformEnd: (() => void) | null = null;

  private form: SophiaForm = 'sphere';
  private formMix = 0;
  private formTimer = 0;

  private focusAng = -0.85;
  private focusAmt = 0;

  private level = 0;
  private think = 0;
  private speak = 0;
  private listen = 0;
  private render = 0;
  private energy = ENERGY.ambient;

  private wantReduced = false;
  private motion = 1;

  private time = 0;
  private breathT = 0;
  private wavePhase = 0;
  private orbitPhase = 0;
  private spin = 0;
  private arc = 0;
  private starT = 0;

  private morph = 0;
  private morphPhase: MorphPhase = null;
  private morphTimer = 0;
  private holdFor = 3.6;
  private morphShape: SophiaShape | null = null;
  private pending: { shape: SophiaShape; renderer: ParticleRenderer } | null = null;
  private body = 1;

  private tune: ShapeTune = { ...DEFAULT_TUNE };

  /* live palette, blended every frame from the active state */
  private pal: Palette = { ...PALETTES.ambient, bgDeep: [...PALETTES.ambient.bgDeep] as Vec3, bgCore: [...PALETTES.ambient.bgCore] as Vec3, bgAuraA: [...PALETTES.ambient.bgAuraA] as Vec3, bgAuraB: [...PALETTES.ambient.bgAuraB] as Vec3, tint: [...PALETTES.ambient.tint] as Vec3 };

  private wake = 1; // 1 = fully formed
  private wakeTimer = -1;
  private paused = 0;
  private idle = 1;
  private pause = 0;
  private completed = 0;
  private completedTimer = 0;
  private completedProgress = 0;
  private blocked = 0;
  private inputAudio = 0;
  private outputAudio = 0;
  private bow = 0;
  private hangPhase = 0;
  private wantDock = false;
  private dock = 0;
  private wakeShockwave = 0;

  /* ------------------------------ inputs ------------------------------ */

  setTune(patch: Partial<ShapeTune>) {
    Object.assign(this.tune, patch);
  }

  get currentTune(): ShapeTune {
    return this.tune;
  }

  setReduced(v: boolean) {
    this.wantReduced = v;
  }

  setForm(form: SophiaForm) {
    this.form = form;
  }

  get currentForm(): SophiaForm {
    return this.form;
  }

  get formMixValue(): number {
    return this.formMix;
  }

  get isCustomMorphActive(): boolean {
    return this.morphPhase !== null;
  }

  setFocusAngle(a: number) {
    this.focusAng = a;
  }

  /** Trigger the wake-up sequence (scattered → converged).
   *  Enhanced: longer timeline with shockwave ring + bloom pulse for both forms. */
  playWake() {
    this.wakeTimer = 0;
    this.wake = 0;
    this.wakeShockwave = 0;
  }

  /** Content wants the centre stage → orb travels to the bottom dock. */
  setDocked(v: boolean) {
    this.wantDock = v;
  }

  get isDocked(): boolean {
    return this.wantDock;
  }

  requestTransform(shape: SophiaShape, renderer: ParticleRenderer) {
    if (shape === 'organic' || shape === 'circle') {
      this.form = shape === 'circle' ? 'ring' : 'sphere';
      if (this.morphPhase && this.morphPhase !== 'out') this.morphPhase = 'out';
      else if (!this.morphPhase) this.formTimer = 1.5;
      return;
    }
    if (shape === 'merge') {
      this.pending = null;
      if (this.morphPhase && this.morphPhase !== 'out') this.morphPhase = 'out';
      else if (!this.morphPhase) this.formTimer = 0.7;
      return;
    }
    if (this.morphPhase === 'hold') {
      this.beginMorph(shape, renderer);
      return;
    }
    if (this.morphPhase) {
      this.pending = { shape, renderer };
      this.morphPhase = 'out';
      return;
    }
    this.beginMorph(shape, renderer);
  }

  private beginMorph(shape: SophiaShape, renderer: ParticleRenderer) {
    renderer.uploadTargets(ShapeGenerator.createTargets(shape, renderer.particleCount, this.form));
    this.morphShape = shape;
    this.morphPhase = 'in';
    this.morphTimer = 0;
    // Keep custom shapes indefinitely so all state animations apply onto them.
    // Dissolve is brief; all other shapes remain active until another shape is chosen.
    this.holdFor = shape === 'dissolve' ? 2.6 : 1e9;
  }

  /* ------------------------------ frame ------------------------------ */

  frame(dt: number, levels: { mic: number; play: number }): FrameParams {
    const k = (rate: number) => 1 - Math.exp(-dt * rate);
    const st = this.state;
    const target = PALETTES[st] ?? PALETTES.ambient;
    const focused = st !== 'ambient' && st !== 'idle' && st !== 'paused' && st !== 'completed';

    this.motion += ((this.wantReduced ? 0.1 : 1) - this.motion) * k(3);
    const m = this.motion;

    /* smoothed state channels */
    this.think += ((st === 'thinking' ? 1 : 0) - this.think) * k(4);
    this.speak += ((st === 'speaking' ? 1 : 0) - this.speak) * k(4);
    this.listen += ((st === 'listening' ? 1 : 0) - this.listen) * k(4);
    this.render += ((st === 'rendering' ? 1 : 0) - this.render) * k(5);
    this.idle += ((st === 'idle' || st === 'ambient' ? 1 : 0) - this.idle) * k(3.5);
    this.pause += ((st === 'pause' || st === 'paused' ? 1 : 0) - this.pause) * k(3.5);
    this.completed += ((st === 'completed' ? 1 : 0) - this.completed) * k(3.5);
    this.blocked += ((st === 'blocked' ? 1 : 0) - this.blocked) * k(3.5);
    this.energy += ((ENERGY[st] ?? 0.3) - this.energy) * k(3);
    this.focusAmt += ((focused ? 1 : 0) - this.focusAmt) * k(st === 'focusing' ? 7 : 2.5);
    this.paused += ((st === 'paused' || st === 'pause' ? 1 : 0) - this.paused) * k(3.5);
    this.dock += ((this.wantDock ? 1 : 0) - this.dock) * k(3.2);

    this.bow = 0;

    /* completed cycle: cyan -> converge -> green -> calm */
    if (st === 'completed') {
      this.completedTimer += dt;
      this.completedProgress = Math.min(1.0, this.completedTimer / 2.6);
    } else {
      this.completedTimer = 0;
      this.completedProgress = 0;
    }

    /* audio: real mic/play + procedural mock envelope when testing */
    let rawMic = levels.mic;
    if ((st === 'listening' || st === 'focusing') && rawMic < 0.02) {
      // Mock voice amplitude so listening state is immediately interactive without hardware
      const t = this.time;
      rawMic = 0.38 + 0.32 * Math.sin(t * 3.8) * Math.cos(t * 2.2 + 0.7) + 0.16 * Math.sin(t * 7.1);
      rawMic = Math.max(0, Math.min(1, rawMic));
    }
    let rawPlay = levels.play;
    if (st === 'speaking' && rawPlay < 0.02) {
      // Mock speech envelope so speaking state visibly pulses and radiates
      const t = this.time;
      rawPlay = 0.44 + 0.36 * Math.sin(t * 4.6) * Math.sin(t * 1.9 + 1.1) + 0.16 * Math.cos(t * 8.4);
      rawPlay = Math.max(0, Math.min(1, rawPlay));
    }

    this.inputAudio += (rawMic - this.inputAudio) * (rawMic > this.inputAudio ? k(18) : k(6));
    this.outputAudio += (rawPlay - this.outputAudio) * (rawPlay > this.outputAudio ? k(18) : k(6));
    this.level = this.speak * this.outputAudio + this.listen * this.inputAudio;

    /* wake-up timeline — 1.85s smooth scatter convergence into form */
    if (this.wakeTimer >= 0) {
      this.wakeTimer += dt;
      this.wake = Math.min(1, this.wakeTimer / 1.85);
      this.wakeShockwave = 0;
      if (this.wake >= 1) {
        this.wakeTimer = -1;
      }
    }

    /* slow-motion suspended float while paused; minimal-motion keeps a slow breath */
    const motion = m * (1 - 0.72 * this.paused);
    this.time += dt * (1 - 0.65 * this.paused);
    this.breathT += dt * (this.wantReduced ? 0.55 * (1 - 0.4 * this.paused) : motion);
    this.hangPhase += dt * 0.62 * (this.wantReduced ? 0 : motion);
    this.spin += dt * (this.tune.spin ? (focused ? 0.015 : 0.11) : 0.0) * motion;
    this.wavePhase += dt * (focused ? 0.5 : 0.72) * (1 + this.level * 1.6) * motion;
    this.orbitPhase += dt * (1 + this.think * 5 + this.render * 3) * motion;
    this.arc += dt * (2.4 * this.think + 1.8 * this.render) * motion;
    this.starT += dt * motion;

    /* resident form */
    this.formMix += ((this.form === 'ring' ? 1 : 0) - this.formMix) * k(m > 0.5 ? 2.2 : 9);
    if (this.formTimer > 0) {
      this.formTimer -= dt;
      if (this.formTimer <= 0) {
        this.formTimer = 0;
        this.onTransformEnd?.();
      }
    }

    /* morph lifecycle */
    if (this.morphPhase) {
      const speed = (m > 0.5 ? 1 / 1.2 : 1 / 0.35) * (1 - 0.85 * this.paused);
      if (this.morphPhase === 'in') {
        this.morph = Math.min(1, this.morph + dt * speed);
        if (this.morph >= 1) {
          this.morphPhase = 'hold';
          this.morphTimer = 0;
          this.onTransformEnd?.();
        }
      } else if (this.morphPhase === 'hold') {
        this.morphTimer += dt;
        if (this.morphTimer >= this.holdFor) this.morphPhase = 'out';
      } else {
        this.morph = Math.max(0, this.morph - dt * speed);
        if (this.morph <= 0) {
          this.morphPhase = null;
          this.morphShape = null;
          if (this.pending) {
            const next = this.pending;
            this.pending = null;
            this.beginMorph(next.shape, next.renderer);
          } else {
            this.onTransformEnd?.();
          }
        }
      }
    }
    const dissolve = this.morphShape === 'dissolve' ? 1 : 0;
    this.body += (1 - this.morph * (0.88 + 0.12 * dissolve) - this.body) * k(6);

    /* blend the active palette (atmosphere + shape colour are separate fields) */
    const p = this.pal;
    const lp = k(2.6);
    p.bgDeep = mix3(p.bgDeep, target.bgDeep, lp);
    p.bgCore = mix3(p.bgCore, target.bgCore, lp);
    p.bgAuraA = mix3(p.bgAuraA, target.bgAuraA, lp);
    p.bgAuraB = mix3(p.bgAuraB, target.bgAuraB, lp);
    p.bgAuraAmt += (target.bgAuraAmt - p.bgAuraAmt) * lp;
    p.bgSpeed += (target.bgSpeed - p.bgSpeed) * lp;
    p.bgPulse += (target.bgPulse - p.bgPulse) * lp;
    p.bgPulseSpd += (target.bgPulseSpd - p.bgPulseSpd) * lp;
    p.bgVig += (target.bgVig - p.bgVig) * lp;
    p.tint = mix3(p.tint, target.tint, lp);
    p.tintAmt += (target.tintAmt - p.tintAmt) * lp;
    p.glow += (target.glow - p.glow) * lp;
    p.code = target.code;

    const formGain = 0.34 + 0.22 * this.formMix + 0.35 * this.level;
    const gain = (formGain + (1 - formGain) * this.morph) * this.tune.glow;

    const breath = Math.sin((this.breathT * TAU) / 6.5);
    const bodyScale =
      (1 + 0.012 * breath + 0.03 * this.level * (this.speak + this.listen * 0.5)) * this.tune.scale;

    /* ring form is exclusive: no orbit lines, nodes, waves, pool or interior */
    const orbits = (this.tune.orbits ? 1 : 0) * (1 - this.formMix) * (1 - this.paused * 0.8);
    const waveAmp = this.tune.waves ? 1 : 0;
    const showBody = this.tune.onlyParticles ? 0.0 : 1.0;
    const onlyParticles = this.tune.onlyParticles ? 1.0 : 0.0;

    /* audio-reactive aura lift: listening follows mic, speaking follows playback */
    const bgLevel = this.speak * this.level + this.listen * this.level;
    /* shape glow breathes with the voice too */
    const shapeGlow = p.glow * (1 + 0.35 * this.level * (this.speak + this.listen)) * this.tune.glow;
    // Idle and paused stay centered in full spherical majesty
    const hangAmt = 0;
    const hang: [number, number] = [
      Math.sin(this.hangPhase * 0.78) * 0.022 * hangAmt + Math.sin(this.hangPhase * 1.35) * 0.008 * hangAmt,
      Math.cos(this.hangPhase * 0.58) * 0.032 * hangAmt + Math.sin(this.hangPhase * 0.94) * 0.012 * hangAmt,
    ];
    const bgOn = this.tune.backgroundEnabled;
    const bgStrength = bgOn ? this.tune.backgroundIntensity : 0;
    const bgMotion = bgOn ? this.tune.backgroundMotion : 0;

    return {
      time: this.time,
      bodyScale,
      form: this.formMix,
      body: this.body,
      showBody,
      onlyParticles,
      level: this.level,
      inputAudio: this.inputAudio,
      outputAudio: this.outputAudio,
      energy: this.energy,
      think: this.think,
      speak: this.speak,
      listen: this.listen,
      render: this.render,
      idle: this.idle,
      pause: this.pause,
      completed: this.completed,
      completedProgress: this.completedProgress,
      blocked: this.blocked,
      visualState: p.code,
      focusDir: [Math.cos(this.focusAng), Math.sin(this.focusAng)],
      focusAmt: this.focusAmt,
      motion: motion,
      orbitPhase: this.orbitPhase,
      wavePhase: this.wavePhase,
      spin: this.spin,
      arc: this.arc,
      starT: this.starT,
      morph: this.morph,
      gain,
      exposure: 1.0 + 0.06 * this.energy,
      hue: this.tune.hue,
      saturation: this.tune.saturation ?? 1.0,
      rimWidth: this.tune.rim,
      glow: this.tune.glow,
      orbits,
      waveAmp,
      particleScale: this.tune.particleScale,
      sparkle: this.tune.sparkle,
      /* background aurora only */
      bgDeep: p.bgDeep,
      bgCore: p.bgCore,
      bgAuraA: p.bgAuraA,
      bgAuraB: p.bgAuraB,
      bgAuraAmt: p.bgAuraAmt * bgStrength,
      bgSpeed: p.bgSpeed * bgMotion,
      bgPulse: p.bgPulse * bgStrength,
      bgPulseSpd: p.bgPulseSpd * bgMotion,
      bgVig: p.bgVig,
      bgLevel: bgLevel * bgStrength,
      /* the shape only */
      shapeTint: p.tint,
      shapeTintAmt: p.tintAmt,
      shapeGlow,
      /* cross-cutting */
      wake: this.wake,
      wakeShockwave: this.wakeShockwave,
      paused: this.paused,
      dock: this.dock,
      bow: this.bow,
      hang,
      /* ambient dust particles */
      dustVisible: this.tune.dustVisible ? 1.0 : 0.0,
      dustSpeed: this.tune.dustSpeed,
      dustAmount: this.tune.dustAmount,
    };
  }
}
