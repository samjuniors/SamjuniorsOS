/**
 * Tiny WebAudio UI kit — click, hover, notify, whoosh.
 * Respects a shared volume / mute so the OS sound panel actually works.
 */

let ctx: AudioContext | null = null;
let master = 0.55;
let muted = false;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setOsVolume(v: number) {
  master = Math.max(0, Math.min(1, v));
}
export function setOsMuted(m: boolean) {
  muted = m;
}
export function getOsVolume() {
  return master;
}

function beep(opts: {
  freq: number; dur: number; type?: OscillatorType; gain?: number;
  slide?: number; delay?: number;
}) {
  if (muted || master <= 0.001) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(opts.freq, t0);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freq * opts.slide), t0 + opts.dur);
  const amp = (opts.gain ?? 0.08) * master;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(amp, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + opts.dur + 0.02);
}

export const osSound = {
  click: () => beep({ freq: 620, dur: 0.05, type: "triangle", gain: 0.05 }),
  hover: () => beep({ freq: 1400, dur: 0.03, type: "sine", gain: 0.02 }),
  open: () => { beep({ freq: 420, dur: 0.12, slide: 1.8, type: "sine", gain: 0.06 }); beep({ freq: 840, dur: 0.1, delay: 0.04, type: "triangle", gain: 0.03 }); },
  close: () => beep({ freq: 480, dur: 0.1, slide: 0.5, type: "sine", gain: 0.05 }),
  notify: () => { beep({ freq: 880, dur: 0.12, type: "sine", gain: 0.07 }); beep({ freq: 1320, dur: 0.16, delay: 0.09, type: "sine", gain: 0.05 }); },
  min: () => beep({ freq: 500, dur: 0.08, slide: 0.55, type: "triangle", gain: 0.04 }),
  max: () => beep({ freq: 360, dur: 0.1, slide: 1.7, type: "triangle", gain: 0.04 }),
};
