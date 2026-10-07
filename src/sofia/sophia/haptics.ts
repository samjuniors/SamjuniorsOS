/**
 * Tiny tactile + sonic feedback for state landings.
 * Respects reduced-motion and a user toggle. Never throws.
 */

export type HapticKind = 'wake' | 'complete' | 'pause' | 'tap';

const PATTERNS: Record<HapticKind, number[]> = {
  wake: [14, 42, 22],
  complete: [10, 28, 14, 28, 22],
  pause: [22],
  tap: [8],
};

let ctx: AudioContext | null = null;
let enabled = true;

export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

function beep(freq: number, dur: number, gain = 0.035, type: OscillatorType = 'sine') {
  try {
    if (!ctx) ctx = new AudioContext();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {
    /* audio locked or unavailable */
  }
}

export function pulse(kind: HapticKind) {
  if (!enabled) return;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try {
    navigator.vibrate?.(PATTERNS[kind]);
  } catch {
    /* no vibration support */
  }
  if (kind === 'wake') {
    beep(420, 0.09, 0.03);
    setTimeout(() => beep(640, 0.11, 0.028), 70);
  } else if (kind === 'complete') {
    beep(520, 0.07, 0.028);
    setTimeout(() => beep(780, 0.14, 0.032), 90);
  } else if (kind === 'pause') {
    beep(220, 0.12, 0.022, 'triangle');
  }
}
