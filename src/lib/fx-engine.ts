import { cubicPath, perimeter, pointAt, shapePort, splitPerimeter, type MeasuredPath, type NodeShape, type Point } from "./shape-geometry";
import { EXECUTION, fillEnvelope, type FillPhase, type FillTiming } from "./execution-tokens";

export type FxColor = "orange" | "blue" | "green" | "red" | "violet";
export type FxDensity = "full" | "minimal";
const PALETTE: Record<FxColor, { core: string; mid: string; rgb: string; embers: string[] }> = {
  orange: { core: "#fff2cb", mid: "#ff9a3c", rgb: "255,140,36", embers: ["#ffe5a5", "#ffb548", "#ff7330"] },
  blue: { core: "#e8fcff", mid: "#38bdf8", rgb: "56,189,248", embers: ["#d8f7ff", "#64dcff", "#2fabea"] },
  green: { core: "#e5fff3", mid: "#34d399", rgb: "52,211,153", embers: ["#c3ffdf", "#6ee7b7", "#34d399"] },
  red: { core: "#fff1f2", mid: "#f43f5e", rgb: "244,63,94", embers: ["#fda4af", "#fb7185", "#f43f5e"] },
  violet: { core: "#f5f3ff", mid: "#a78bfa", rgb: "167,139,250", embers: ["#ddd6fe", "#c4b5fd", "#a78bfa"] },
};
interface Spark { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; color: string }
interface FluidEffect {
  id: string;
  paths: MeasuredPath[];
  age: number;
  color: FxColor;
  timing: FillTiming;
  phase: FillPhase;
  filled: boolean;
  emission: number;
  width: number;
  dash?: number[];
  kind: "node" | "edge";
  onFill?: () => void;
  onSettled?: () => void;
  onPhase?: (phase: FillPhase) => void;
}
export interface NodeIgnitionOptions {
  id?: string;
  shape: NodeShape;
  center: Point;
  input?: Point;
  output?: Point;
  width?: number;
  height?: number;
  color?: FxColor;
  timing?: Partial<FillTiming>;
  onFill?: () => void;
  onSettled?: () => void;
  onPhase?: (phase: FillPhase) => void;
}
export interface PipeOptions {
  id?: string;
  from: Point;
  to: Point;
  ctrl?: [Point, Point];
  color?: FxColor;
  speed?: number;
  dashed?: boolean;
  timing?: Partial<FillTiming>;
  onArrive?: () => void;
  onDrained?: () => void;
  onPhase?: (phase: FillPhase) => void;
}
const random = (a: number, b: number) => a + Math.random() * (b - a);
const normalizedTiming = (base: FillTiming, values?: Partial<FillTiming>): FillTiming => ({
  pre: Math.max(0, values?.pre ?? base.pre),
  fill: Math.max(1, values?.fill ?? base.fill),
  hold: Math.max(0, values?.hold ?? base.hold),
  drain: Math.max(1, values?.drain ?? base.drain),
});

/**
 * One finite execution model for node borders and connections.
 * Nodes split the SAME perimeter at input/output. Edges use the SAME cubic as
 * the neutral SVG. Occupancy grows from 0, then drains from behind: never a
 * permanent colored line, detached orbit, impact circle, or radial node fill.
 */
export class FxEngine {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private w = 1;
  private h = 1;
  private raf = 0;
  private last = 0;
  private clock = 0;
  private serial = 0;
  private epoch = 0;
  private visible = true;
  private documentVisible = true;
  private paused = false;
  private effects: FluidEffect[] = [];
  private sparks: Spark[] = [];
  private tasks: { id: number; at: number; callback: () => void }[] = [];
  running = false;
  density: FxDensity;
  reduced: boolean;

  constructor(canvas: HTMLCanvasElement, options: { density?: FxDensity } = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("A 2D canvas context is required for execution effects.");
    this.ctx = ctx;
    this.density = options.density ?? "full";
    this.reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }

  resize(w: number, h: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }
  start() { this.running = true; this.wake(); }
  stop() { this.running = false; this.sleep(); }
  dispose() { this.stop(); this.clearTransient(); }
  setDensity(density: FxDensity) { this.density = density; this.draw(); }
  setPaused(paused: boolean) { this.paused = paused; if (paused) this.sleep(); else this.wake(); }
  stepOnce(milliseconds = 300) { this.setPaused(true); this.advance(milliseconds); this.draw(); }
  setVisible(visible: boolean) { this.visible = visible; if (!visible) this.sleep(); else this.wake(); }
  setDocumentVisible(visible: boolean) { this.documentVisible = visible; if (!visible) this.sleep(); else this.wake(); }
  setReducedMotion(reduced: boolean) { this.reduced = reduced; if (reduced) this.sparks = []; this.draw(); }
  private sleep() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  private wake() {
    if (this.raf || !this.running || this.paused || !this.visible || !this.documentVisible) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.raf = 0;
    if (!this.running || this.paused || !this.visible || !this.documentVisible) return;
    const elapsed = Math.min(64, Math.max(0, now - this.last));
    this.last = now;
    this.advance(elapsed);
    this.draw();
    if (this.effects.length || this.sparks.length || this.tasks.length) this.raf = requestAnimationFrame(this.frame);
  };

  /** Uses the animation clock, so replay, pause, hidden tabs and cleanup agree. */
  schedule(delayMs: number, callback: () => void) {
    const id = ++this.serial;
    this.tasks.push({ id, at: this.clock + Math.max(0, delayMs), callback });
    this.wake();
    return () => { this.tasks = this.tasks.filter(task => task.id !== id); };
  }
  clearTransient() {
    this.epoch++;
    this.effects = [];
    this.tasks = [];
    this.sparks = [];
    this.ctx.clearRect(0, 0, this.w, this.h);
  }
  clearNode(id: string) { this.effects = this.effects.filter(effect => effect.id !== id); }

  igniteNode(options: NodeIgnitionOptions): string {
    const path = perimeter(options.shape, options.center, options.width, options.height);
    const input = options.input ?? shapePort(options.shape, options.center, "left", 0, options.width, options.height);
    const output = options.output ?? shapePort(options.shape, options.center, "right", 0, options.width, options.height);
    const paths = splitPerimeter(path, input, output);
    const id = options.id ?? `node-${++this.serial}`;
    this.clearNode(id);
    this.effects.push({
      id, paths, age: 0, color: options.color ?? "orange", kind: "node",
      timing: normalizedTiming(EXECUTION.node, options.timing),
      width: EXECUTION.stroke, filled: false, emission: 0, phase: "preignite",
      onFill: options.onFill, onSettled: options.onSettled, onPhase: options.onPhase,
    });
    options.onPhase?.("preignite");
    this.burst(paths[0].points[0].x, paths[0].points[0].y, options.color ?? "orange", 5, .32);
    this.wake();
    return id;
  }

  /** The comet head fills the actual connection behind itself, then that pipe drains. */
  launchComet(options: PipeOptions): string {
    const mid = (options.from.x + options.to.x) / 2;
    const control = options.ctrl ?? [{ x: mid, y: options.from.y }, { x: mid, y: options.to.y }];
    const path = cubicPath(options.from, control, options.to);
    const id = options.id ?? `edge-${++this.serial}`;
    const timing = normalizedTiming(EXECUTION.edge, {
      ...(options.speed ? { fill: 1000 / Math.max(.1, options.speed) } : {}), ...options.timing,
    });
    this.effects.push({
      id, paths: [path], age: 0, color: options.color ?? "orange", kind: "edge", timing,
      width: EXECUTION.stroke, dash: options.dashed ? [6, 7] : undefined,
      filled: false, emission: 0, phase: "preignite",
      onFill: options.onArrive, onSettled: options.onDrained, onPhase: options.onPhase,
    });
    options.onPhase?.("filling");
    this.wake();
    return id;
  }

  burst(x: number, y: number, color: FxColor, count = 8, power = .55) {
    if (this.reduced) return;
    const n = Math.ceil(count * (this.density === "minimal" ? .3 : 1));
    for (let i = 0; i < n; i++) {
      const angle = Math.PI * 2 * i / n + random(-.2, .2);
      const velocity = random(16, 65) * power;
      this.addSpark({ x, y }, Math.cos(angle) * velocity, Math.sin(angle) * velocity - 6, color, random(.7, 1.5));
    }
    this.wake();
  }
  pulse(x: number, y: number, color: FxColor) { this.burst(x, y, color, 5, .4); }

  private addSpark(p: Point, vx: number, vy: number, color: FxColor, size = 1) {
    if (this.reduced || this.sparks.length >= EXECUTION.maxParticles) return;
    const palette = PALETTE[color].embers;
    this.sparks.push({ x: p.x, y: p.y, vx, vy, age: 0, life: random(.28, .72), size, color: palette[Math.floor(Math.random() * palette.length)] });
  }

  /** Public for deterministic external clocks and regression tests; milliseconds. */
  advance(milliseconds: number) {
    const dt = Math.max(0, milliseconds) / 1000;
    this.clock += Math.max(0, milliseconds);
    const epoch = this.epoch;
    const callbacks: (() => void)[] = [];
    this.sparks = this.sparks.filter(spark => {
      spark.age += dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vx *= Math.exp(-2.4 * dt);
      spark.vy = spark.vy * Math.exp(-2.4 * dt) - 8 * dt;
      return spark.age < spark.life;
    });
    this.effects = this.effects.filter(effect => {
      effect.age += milliseconds;
      const envelope = fillEnvelope(effect.age, effect.timing);
      if (envelope.phase !== effect.phase) {
        effect.phase = envelope.phase;
        if (effect.onPhase) callbacks.push(() => effect.onPhase?.(envelope.phase));
      }
      if (!effect.filled && effect.age >= effect.timing.pre + effect.timing.fill) {
        effect.filled = true;
        const output = pointAt(effect.paths[0], 1);
        this.burst(output.x, output.y, effect.color, effect.kind === "node" ? 9 : 4, .48);
        if (effect.onFill) callbacks.push(effect.onFill);
      }
      if (envelope.phase === "settled") {
        if (effect.onSettled) callbacks.push(effect.onSettled);
        return false;
      }
      if (!this.reduced) {
        effect.emission += dt * (this.density === "full" ? 46 : 12) * Math.max(.15, envelope.heat);
        let count = Math.min(8, Math.floor(effect.emission));
        effect.emission -= count;
        while (count-- > 0) {
          const path = effect.paths[count % effect.paths.length];
          const front = envelope.phase === "filling" && !effect.filled;
          const sample = front && count % 3 !== 0 ? envelope.head : envelope.tail + Math.random() * Math.max(0, envelope.head - envelope.tail);
          const p = pointAt(path, sample);
          const before = pointAt(path, Math.max(0, sample - .02));
          const after = pointAt(path, Math.min(1, sample + .02));
          const angle = Math.atan2(after.y - before.y, after.x - before.x) + (Math.random() < .5 ? -1 : 1) * Math.PI / 2;
          const speed = random(4, front ? 24 : 12);
          this.addSpark(p, Math.cos(angle) * speed, Math.sin(angle) * speed - 4, effect.color, random(.5, front ? 1.3 : .9));
        }
      }
      return true;
    });
    const due = this.tasks.filter(task => task.at <= this.clock).sort((a, b) => a.at - b.at);
    this.tasks = this.tasks.filter(task => task.at > this.clock);
    for (const callback of [...callbacks, ...due.map(task => task.callback)]) {
      if (epoch !== this.epoch) break;
      callback();
    }
  }

  /** Trace only occupied material on the original line, never an offset contour. */
  private trace(path: MeasuredPath, start: number, end: number) {
    const ctx = this.ctx;
    const a = pointAt(path, start), b = pointAt(path, end);
    const low = start * path.length, high = end * path.length;
    ctx.beginPath(); ctx.moveTo(a.x, a.y);
    for (let i = 1; i < path.points.length; i++) {
      if (path.distances[i] > low && path.distances[i] < high) ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    ctx.lineTo(b.x, b.y);
  }
  private stroke(path: MeasuredPath, start: number, end: number, color: string, width: number, alpha: number, glow: number, dash?: number[]) {
    if (end <= start || alpha <= 0) return;
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(dash ?? []);
    ctx.lineDashOffset = start * path.length;
    this.trace(path, start, end);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
  }
  private contact(p: Point, color: FxColor, heat: number, radius = 1.8) {
    if (heat <= 0) return;
    const ctx = this.ctx, palette = PALETTE[color];
    ctx.globalAlpha = heat;
    ctx.fillStyle = palette.core;
    ctx.shadowColor = palette.mid;
    ctx.shadowBlur = this.density === "full" ? 10 : 4;
    ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  private draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = "source-over";
    for (const effect of this.effects) {
      const e = fillEnvelope(effect.age, effect.timing);
      const palette = PALETTE[effect.color];
      if (this.reduced) {
        if (e.phase === "filling") for (const path of effect.paths) this.stroke(path, 0, 1, palette.mid, effect.width, .6, 0, effect.dash);
        continue;
      }
      if (e.phase === "preignite") {
        this.contact(pointAt(effect.paths[0], 0), effect.color, e.heat, 1.5);
        continue;
      }
      const glow = this.density === "full" ? EXECUTION.glowFull : EXECUTION.glowMinimal;
      for (const path of effect.paths) {
        // The colored portion first fills, then shrinks from input to output.
        this.stroke(path, e.tail, e.head, palette.mid, effect.width, e.heat, glow, effect.dash);
        this.stroke(path, e.tail, e.head, palette.core, .65, e.heat * .4, 0, effect.dash);
        if (!effect.filled) {
          const hotTail = Math.max(e.tail, e.head - (effect.kind === "edge" ? 22 : 10) / Math.max(1, path.length));
          this.stroke(path, hotTail, e.head, palette.core, effect.kind === "edge" ? 2.1 : 1.5, .95, glow * .6);
          this.contact(pointAt(path, e.head), effect.color, 1, effect.kind === "edge" ? 2.4 : 1.7);
        } else if (e.phase === "draining") {
          // The last embers cool precisely where the two fronts met.
          this.contact(pointAt(path, 1), effect.color, e.heat * .3, 1.1);
        }
      }
    }
    ctx.globalCompositeOperation = "lighter";
    for (const spark of this.sparks) {
      ctx.globalAlpha = Math.pow(1 - spark.age / spark.life, 1.6);
      ctx.fillStyle = spark.color;
      ctx.beginPath(); ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
  }

  /** Read-only timing telemetry for integration tests / animation inspectors. */
  getSnapshot() {
    return this.effects.map(effect => ({ id: effect.id, kind: effect.kind, age: effect.age, ...fillEnvelope(effect.age, effect.timing) }));
  }
}

export function edgeControlPoints(from: Point, to: Point): [Point, Point] {
  const x = (from.x + to.x) / 2;
  return [{ x, y: from.y }, { x, y: to.y }];
}
