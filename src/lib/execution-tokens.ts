/** Durations in milliseconds. All execution effects consume this contract. */
export interface FillTiming { pre: number; fill: number; hold: number; drain: number }
export const EXECUTION = {
  node: { pre: 180, fill: 1550, hold: 180, drain: 1550 } satisfies FillTiming,
  edge: { pre: 0, fill: 1120, hold: 100, drain: 1150 } satisfies FillTiming,
  stroke: 1.8,
  neutralStroke: 1.4,
  glowFull: 7,
  glowMinimal: 3,
  emberLife: 700,
  quiet: 1600,
  maxParticles: 900,
} as const;

export type FillPhase = "preignite" | "filling" | "draining" | "settled";
export interface FillEnvelope { phase: FillPhase; head: number; tail: number; heat: number }
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Occupancy on the original stroke: first fill [0, head], then empty [tail, 1]. */
export function fillEnvelope(age: number, timing: FillTiming): FillEnvelope {
  if (age < timing.pre) return { phase: "preignite", head: 0, tail: 0, heat: clamp(age / Math.max(1, timing.pre)) * .5 };
  const fillAge = age - timing.pre;
  if (fillAge < timing.fill) return { phase: "filling", head: clamp(fillAge / Math.max(1, timing.fill)), tail: 0, heat: 1 };
  const drainAge = fillAge - timing.fill - timing.hold;
  if (drainAge < 0) return { phase: "filling", head: 1, tail: 0, heat: .95 };
  if (drainAge >= timing.drain) return { phase: "settled", head: 1, tail: 1, heat: 0 };
  const t = clamp(drainAge / Math.max(1, timing.drain));
  return { phase: "draining", head: 1, tail: t * t * (3 - 2 * t), heat: (1 - .7 * t) * (1 - clamp((t - .88) / .12)) };
}
