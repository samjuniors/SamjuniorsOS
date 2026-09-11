/**
 * NeuralField — neuron-cortex lattice engine on canvas 2D.
 *
 *  - perfect globe lattice (untwisted fibonacci sphere), links ONLY on the shell
 *  - neuron core = deforming white sphere with membrane noise + pulse waves
 *  - axons radiate from the core to sphere anchor nodes (no cross-links in the void)
 *  - data packets stream node -> node along shell links
 *  - TTS voice: the core "talks" a random phrase on every firing pulse
 *  - right-drag rotates; hover = bubble repulsion; nodes are grabbable (left drag)
 *  - electric arcs + sparks on hover/click, shockwave rings, bloom pass
 */

export type Settings = {
  nodeCount: number;
  linkDistance: number;
  rotationSpeed: number;
  glow: number;
  stiffness: number;
  mouseForce: number;
  dataFlow: number;
  bloom: number;
  axonSize: number;
  showLinks: boolean;
  autoRotate: boolean;
  dust: boolean;
  axons: boolean;
  voice: boolean;
};

export const defaultSettings: Settings = {
  nodeCount: 210,
  linkDistance: 0.5,
  rotationSpeed: 0.5,
  glow: 1,
  stiffness: 1,
  mouseForce: 1,
  dataFlow: 1,
  bloom: 0.85,
  axonSize: 1,
  showLinks: true,
  autoRotate: true,
  dust: true,
  axons: true,
  voice: true,
};

type Vec = [number, number, number];

type Node = {
  hx: number; hy: number; hz: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  tx: number; ty: number; tz: number;
  sx: number; sy: number; p: number;
  size: number; hue: number; phase: number; energy: number;
};

type Dust = {
  hx: number; hy: number; hz: number;
  ox: number; oy: number; oz: number;
  vx: number; vy: number; vz: number;
  size: number; hue: number; phase: number; spin: number;
};

type Star = { x: number; y: number; r: number; a: number; t: number };
type Branch = { at: number; dir: Vec; len: number; width: number; off: Vec; amp: number };
type Axon = { tip: number; off: Vec; amp: number; width: number; branches: Branch[]; signal: number };
type Packet = { e: number; dir: 1 | -1; t: number; speed: number; hue: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; hue: number };
type Arc = { a: number; b: number; life: number; max: number; seed: number };
type Ring = { x: number; y: number; life: number; max: number; r: number; hue: number };

const PALETTE = [
  [214, 240, 255],
  [96, 178, 255],
  [255, 186, 122],
  [214, 140, 255],
];

const PHRASES = [
  "synapse firing", "signal received", "neural pulse", "cortex online",
  "transmitting", "pathway open", "node synchronized", "impulse sent",
  "network active", "connection locked", "data flowing", "axon charged",
  "spike detected", "membrane firing", "core awakened", "circuit complete",
];

function sprite(color: number[], size = 128): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  const [cr, cg, cb] = color;
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.13, `rgba(${cr},${cg},${cb},0.95)`);
  grd.addColorStop(0.3, `rgba(${cr},${cg},${cb},0.34)`);
  grd.addColorStop(0.6, `rgba(${Math.round(cr * 0.6)},${Math.round(cg * 0.7)},${cb},0.08)`);
  grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class NeuralField {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  settings: Settings;

  nodes: Node[] = [];
  dust: Dust[] = [];
  stars: Star[] = [];
  edges: { a: number; b: number; rest: number }[] = [];
  nodeEdges: number[][] = [];
  neighbors: number[][] = [];
  axonList: Axon[] = [];
  packets: Packet[] = [];
  sparks: Spark[] = [];
  arcs: Arc[] = [];
  rings: Ring[] = [];

  w = 0; h = 0; dpr = 1; cx = 0; cy = 0;
  radius = 300;
  baseRadius = 300;
  zoom = 1;
  focal = 1100;

  rotX = -0.18; rotY = 0;
  spinX = 0; spinY = 0;
  orbiting = false;
  orbitLast = { x: 0, y: 0 };

  mouse = { x: -9999, y: -9999, active: false };
  dragIndex = -1;
  dragDepth = 0;
  hoverIndex = -1;
  pressTime = 0;
  pressPos = { x: 0, y: 0 };
  pressMoved = 0;

  corePulse = 0;
  pulses: { t: number; dur: number }[] = [];
  fireTimer = 1.5;
  coreKick = 0;
  /** 0..1 progress of a speech shockwave running across the outer globe */
  speechWave = -1;
  speechBeam = 0;
  speechText = "";
  speechUntil = 0;
  time = 0;

  sprites: HTMLCanvasElement[] = [];
  private bloomCanvas: HTMLCanvasElement;
  private bloomCtx: CanvasRenderingContext2D;
  private raf = 0;
  private lastT = 0;
  private fps = 60;
  private linkCount = 0;
  onStats?: (s: { nodes: number; links: number; packets: number; fps: number }) => void;

  private cyR = 1; private syR = 0; private cxR = 1; private sxR = 0;

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.settings = { ...settings };
    this.sprites = PALETTE.map((c) => sprite(c));
    this.bloomCanvas = document.createElement("canvas");
    this.bloomCtx = this.bloomCanvas.getContext("2d")!;
    this.resize();
    this.build();
  }

  /* ----------------------------------------------------------------- setup */

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.bloomCanvas.width = Math.max(2, Math.floor(this.w / 4));
    this.bloomCanvas.height = Math.max(2, Math.floor(this.h / 4));
    this.cx = this.w / 2;
    this.cy = this.h / 2;
    this.baseRadius = Math.min(this.w, this.h) * 0.36;
    this.radius = this.baseRadius * this.zoom;
    this.focal = Math.max(this.w, this.h) * 1.35;
    this.buildStars();
    this.rescale();
  }

  rescale() {
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const dx = a.hx - b.hx, dy = a.hy - b.hy, dz = a.hz - b.hz;
      e.rest = Math.sqrt(dx * dx + dy * dy + dz * dz) * this.radius;
    }
  }

  buildStars() {
    const n = Math.round((this.w * this.h) / 8500);
    this.stars = [];
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: Math.random() * 1.1 + 0.25,
        a: Math.random() * 0.5 + 0.15,
        t: Math.random() * Math.PI * 2,
      });
    }
  }

  build() {
    const total = this.settings.nodeCount;
    const LIMBS = 9;
    const outer = Math.max(24, total - LIMBS); // perfect globe nodes
    this.nodes = [];

    // uniform, untwisted fibonacci sphere — a clean globe
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < outer; i++) {
      const y = 1 - (i / Math.max(1, outer - 1)) * 2;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * i;
      this.nodes.push(this.mkNode(Math.cos(th) * rr, y, Math.sin(th) * rr, rnd(2.2, 4.6)));
    }

    // axon tip nodes — small sphere between cortex and globe
    this.axonList = [];
    const tipIdx: number[] = [];
    for (let i = 0; i < LIMBS; i++) {
      const y = 1 - (i / (LIMBS - 1)) * 2;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * i + 0.9;
      const len = rnd(0.52, 0.7);
      tipIdx.push(this.nodes.length);
      this.nodes.push(this.mkNode(
        Math.cos(th) * rr * len, y * len * 0.92, Math.sin(th) * rr * len, rnd(4.2, 5.6),
      ));
    }

    // lattice topology for the outer globe only — links live ON the shell
    const K = 5;
    this.edges = [];
    this.neighbors = this.nodes.map(() => []);
    this.nodeEdges = this.nodes.map(() => []);
    const seen = new Set<string>();
    for (let i = 0; i < outer; i++) {
      const a = this.nodes[i];
      const d: { j: number; d: number }[] = [];
      for (let j = 0; j < outer; j++) {
        if (i === j) continue;
        const b = this.nodes[j];
        const dx = a.hx - b.hx, dy = a.hy - b.hy, dz = a.hz - b.hz;
        d.push({ j, d: dx * dx + dy * dy + dz * dz });
      }
      d.sort((p, q) => p.d - q.d);
      for (let k = 0; k < Math.min(K, d.length); k++) {
        const j = d[k].j;
        this.neighbors[i].push(j);
        this.neighbors[j].push(i);
        const key = i < j ? `${i}_${j}` : `${j}_${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ei = this.edges.length;
        this.edges.push({ a: i, b: j, rest: Math.sqrt(d[k].d) * this.radius });
        this.nodeEdges[i].push(ei);
        this.nodeEdges[j].push(ei);
      }
    }
    // tip nodes: pulses diffuse along the axon chain + nearest globe node
    for (let i = 0; i < LIMBS; i++) {
      const t = tipIdx[i];
      const tn = this.nodes[t];
      let best = 0, bd = Infinity;
      for (let j = 0; j < outer; j++) {
        const b = this.nodes[j];
        const dx = tn.hx - b.hx, dy = tn.hy - b.hy, dz = tn.hz - b.hz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd) { bd = d; best = j; }
      }
      this.neighbors[t].push(best);
      this.neighbors[best].push(t);
    }

    // axon geometry — from cortex core to each tip (then the aura reaches the shell)
    for (let i = 0; i < LIMBS; i++) {
      const n = this.nodes[tipIdx[i]];
      const up: Vec = Math.abs(n.hy) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const off = norm(cross([n.hx, n.hy, n.hz], up));
      const branches: Branch[] = [];
      const nb = 2 + (Math.random() < 0.6 ? 1 : 0);
      for (let b = 0; b < nb; b++) {
        const base: Vec = norm([n.hx, n.hy, n.hz]);
        const dir = norm([base[0] + rnd(-0.9, 0.9), base[1] + rnd(-0.9, 0.9), base[2] + rnd(-0.9, 0.9)]);
        branches.push({
          at: rnd(0.35, 0.72),
          dir,
          len: rnd(0.12, 0.27),
          width: rnd(2.4, 4.2),
          off: norm(cross(dir, up)),
          amp: rnd(-0.05, 0.05),
        });
      }
      this.axonList.push({ tip: tipIdx[i], off, amp: rnd(-0.11, 0.11), width: rnd(7.5, 11), branches, signal: -1 });
    }

    // dust
    this.dust = [];
    for (let i = 0; i < 620; i++) {
      const rr = 0.3 + Math.pow(Math.random(), 0.62) * 1.22;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      this.dust.push({
        hx: Math.sin(ph) * Math.cos(th) * rr,
        hy: Math.cos(ph) * rr * 0.85,
        hz: Math.sin(ph) * Math.sin(th) * rr,
        ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0,
        size: rnd(0.5, 2.1),
        hue: Math.random() < 0.08 ? 2 : Math.random() < 0.42 ? 1 : 0,
        phase: Math.random() * Math.PI * 2,
        spin: rnd(-0.16, 0.16),
      });
    }

    this.packets = [];
    this.sparks = [];
    this.arcs = [];
    this.rings = [];
    this.pulses = [];
  }

  private mkNode(hx: number, hy: number, hz: number, size: number): Node {
    const R = this.radius;
    return {
      hx, hy, hz,
      x: hx * R, y: hy * R, z: hz * R,
      vx: 0, vy: 0, vz: 0,
      tx: hx * R, ty: hy * R, tz: hz * R,
      sx: 0, sy: 0, p: 1,
      size,
      hue: Math.random() < 0.05 ? 2 : Math.random() < 0.34 ? 1 : 0,
      phase: Math.random() * Math.PI * 2,
      energy: 0,
    };
  }

  applySettings(s: Settings) {
    const merged: Settings = { ...defaultSettings, ...s };
    const n = merged as unknown as Record<string, unknown>;
    if ("dendrites" in n) { merged.axons = Boolean(n.dendrites); delete n.dendrites; }
    // axons / voice stay on unless explicitly disabled
    if (merged.axons as unknown as boolean !== false) merged.axons = true;
    if (merged.voice as unknown as boolean !== false) merged.voice = true;
    const rebuild = merged.nodeCount !== this.settings.nodeCount;
    this.settings = merged;
    if (rebuild) this.build();
  }

  /* ----------------------------------------------------------- interaction */

  /** button: 1 = left · 2 = right. Right always orbits and never clicks. */
  pointerDown(x: number, y: number, button: number) {
    this.mouse.x = x; this.mouse.y = y; this.mouse.active = true;
    this.pressTime = performance.now();
    this.pressPos = { x, y };
    this.pressMoved = 0;
    let i = -1;
    if (button !== 2) i = this.pick(x, y);
    if (i >= 0) {
      this.dragIndex = i;
      this.dragDepth = this.nodes[i].z;
      this.nodes[i].energy = Math.max(this.nodes[i].energy, 0.9);
      this.burst(this.nodes[i].sx, this.nodes[i].sy, 10, 0);
    } else {
      this.orbiting = true;
      this.orbitLast = { x, y };
    }
  }

  pointerMove(x: number, y: number) {
    this.pressMoved = Math.max(this.pressMoved, Math.hypot(x - this.pressPos.x, y - this.pressPos.y));
    this.mouse.x = x; this.mouse.y = y; this.mouse.active = true;
    if (this.orbiting) {
      const dx = x - this.orbitLast.x;
      const dy = y - this.orbitLast.y;
      this.rotY += dx * 0.005;
      this.rotX = Math.max(-1.35, Math.min(1.35, this.rotX + dy * 0.004));
      this.spinY = dx * 0.005;
      this.spinX = dy * 0.004;
      this.orbitLast = { x, y };
    }
  }

  pointerUp() {
    if (this.dragIndex >= 0) {
      const n = this.nodes[this.dragIndex];
      const held = performance.now() - this.pressTime;
      if (held < 280 && this.pressMoved < 7) this.fireNode(this.dragIndex);
      else {
        this.burst(n.sx, n.sy, 14, 0);
        n.energy = Math.max(n.energy, 0.9);
      }
    }
    this.dragIndex = -1;
    this.orbiting = false;
  }

  pointerLeave() {
    this.mouse.active = false;
    this.mouse.x = -9999; this.mouse.y = -9999;
    this.dragIndex = -1;
    this.orbiting = false;
    this.hoverIndex = -1;
  }

  zoomBy(delta: number) {
    this.zoom = Math.max(0.5, Math.min(2.1, this.zoom * (1 - delta * 0.0012)));
    this.radius = this.baseRadius * this.zoom;
    this.rescale();
  }

  pick(x: number, y: number): number {
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const d = Math.hypot(n.sx - x, n.sy - y);
      const hit = Math.max(18, n.size * n.p * 4.4);
      if (d > hit) continue;
      const score = d - (n.z / this.radius) * 9;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  fireNode(i: number) {
    const n = this.nodes[i];
    n.energy = 1.7;
    this.rings.push({ x: n.sx, y: n.sy, life: 0, max: 0.75, r: 190 * n.p, hue: 0 });
    this.burst(n.sx, n.sy, 26, 0);
    this.arcTo(i, 4);
    for (const ei of this.nodeEdges[i]) {
      const e = this.edges[ei];
      this.packets.push({ e: ei, dir: e.a === i ? 1 : -1, t: 0, speed: rnd(0.8, 1.5), hue: 0 });
    }
    if (i < this.axonList.length + this.nodes.length - 9 || Math.random() < 0.4) {
      this.coreKick = Math.min(1.6, this.coreKick + 0.5);
      if (Math.random() < 0.6) this.speak(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
    }
  }

  burst(x: number, y: number, count: number, hue: number) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(25, 190);
      this.sparks.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: rnd(0.22, 0.6),
        size: rnd(0.8, 2.2),
        hue: Math.random() < 0.22 ? 3 : hue,
      });
    }
  }

  arcTo(i: number, count: number) {
    const nb = this.neighbors[i];
    for (let k = 0; k < count && nb.length; k++) {
      const j = nb[Math.floor(Math.random() * nb.length)];
      this.arcs.push({ a: i, b: j, life: 0, max: rnd(0.12, 0.26), seed: Math.random() * 1000 });
    }
  }

  /* ------------------------------------------------------------- TTS voice */

  speak(phrase?: string) {
    if (!this.settings.voice) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const text = phrase ?? PHRASES[Math.floor(Math.random() * PHRASES.length)];
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rnd(1.02, 1.2);
      u.pitch = rnd(0.25, 0.5);
      u.volume = 0.75;
      synth.speak(u);
      this.speechText = text;
      this.speechUntil = performance.now() + 1900;
      this.speechWave = 0;
      this.speechBeam = 1.6;
    } catch { /* audio unavailable */ }
  }

  pulseAll() {
    this.coreKick = 1.5;
    this.corePulse = 1.3;
    this.pulses.push({ t: 0, dur: 1.6 });
    for (const l of this.axonList) l.signal = 0;
    for (let i = 0; i < this.nodes.length; i++) if (Math.random() < 0.06) this.fireNode(i);
  }

  shake() {
    for (const n of this.nodes) {
      n.vx += rnd(-1000, 1000);
      n.vy += rnd(-1000, 1000);
      n.vz += rnd(-1000, 1000);
      n.energy = Math.max(n.energy, 0.8);
    }
    for (const d of this.dust) { d.vx += rnd(-260, 260); d.vy += rnd(-260, 260); d.vz += rnd(-260, 260); }
    this.rings.push({ x: this.cx, y: this.cy, life: 0, max: 1.1, r: this.radius * 2.4, hue: 3 });
    this.coreKick = 1.6;
    this.corePulse = 1.4;
    for (const l of this.axonList) l.signal = 0;
    this.speak();
  }

  /* ---------------------------------------------------------------- update */

  private rot(x: number, y: number, z: number): Vec {
    const x1 = x * this.cyR + z * this.syR;
    const z1 = -x * this.syR + z * this.cyR;
    const y2 = y * this.cxR - z1 * this.sxR;
    const z2 = y * this.sxR + z1 * this.cxR;
    return [x1, y2, z2];
  }

  private proj(x: number, y: number, z: number) {
    const p = this.focal / Math.max(140, this.focal - z);
    return { x: this.cx + x * p, y: this.cy + y * p, p };
  }

  step(dt: number) {
    const s = this.settings;
    const R = this.radius;
    this.time += dt;

    if (s.autoRotate && !this.orbiting) {
      this.rotY += dt * 0.11 * s.rotationSpeed;
      this.rotX = Math.max(-1, Math.min(1, this.rotX + Math.sin(this.time * 0.11) * dt * 0.028 * s.rotationSpeed));
    }
    if (!this.orbiting) {
      this.rotY += this.spinY;
      this.rotX = Math.max(-1.35, Math.min(1.35, this.rotX + this.spinX));
      this.spinY *= 0.93; this.spinX *= 0.93;
    }
    this.cyR = Math.cos(this.rotY); this.syR = Math.sin(this.rotY);
    this.cxR = Math.cos(this.rotX); this.sxR = Math.sin(this.rotX);

    const kE = 16 * s.stiffness;
    const damp = 4.4;
    const mForce = 3000 * s.mouseForce * s.stiffness;
    const mRadius = Math.min(this.w, this.h) * 0.26;
    const nNodes = this.nodes.length;

    // speech shockwave: globe keeps breathing outward while the voice lasts
    const nOuter = nNodes - 9;
    if (this.speechWave >= 0) {
      this.speechWave += dt * 0.42;
      if (this.speechWave >= 1.05) this.speechWave = -1;
    }
    this.speechBeam *= Math.exp(-1.1 * dt);
    const dialK = 2.4 * Math.min(1.6, this.speechBeam);

    for (const n of this.nodes) {
      const [x, y, z] = this.rot(n.hx, n.hy, n.hz);
      n.tx = x * R; n.ty = y * R; n.tz = z * R;
    }

    // edge springs only along stored shell rest-connections (no cross-void coupling)
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const len = Math.hypot(dx, dy, dz) || 1e-4;
      const f = ((len - e.rest) * kE) / len;
      a.vx += dx * f * dt; a.vy += dy * f * dt; a.vz += dz * f * dt;
      b.vx -= dx * f * dt; b.vy -= dy * f * dt; b.vz -= dz * f * dt;
    }

    // apply the voice dilation to the shell + wake nodes where the wave passes
    if (dialK > 0.002) {
      for (let i = 0; i < nOuter; i++) {
        if (i === this.dragIndex) continue;
        const n = this.nodes[i];
        const il = Math.hypot(n.hx, n.hy, n.hz) || 1;
        const wave = Math.sin(this.speechWave * Math.PI * 2.4 - il * 4.2);
        const dial = 1 + dialK * 0.013 * (0.5 + 0.5 * wave);
        n.vx += (n.tx * dial - n.x) * 46 * dt;
        n.vy += (n.ty * dial - n.y) * 46 * dt;
        n.vz += (n.tz * dial - n.z) * 46 * dt;
        if (Math.abs(Math.sin(this.speechWave * Math.PI * 2.4 - il * 4.2)) > 0.985) {
          n.energy = Math.max(n.energy, this.speechBeam * 0.5);
        }
      }
    }

    const mx = this.mouse.x, my = this.mouse.y;
    const mouseOn = this.mouse.active && this.dragIndex < 0;
    for (let i = 0; i < nNodes; i++) {
      const n = this.nodes[i];
      if (i === this.dragIndex) continue;
      const kA = (i >= nNodes - 9 ? 52 : 34) * s.stiffness;
      n.vx += (n.tx - n.x) * kA * dt;
      n.vy += (n.ty - n.y) * kA * dt;
      n.vz += (n.tz - n.z) * kA * dt;

      if (mouseOn) {
        const dx = n.sx - mx, dy = n.sy - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < mRadius * mRadius) {
          const d = Math.sqrt(d2) || 1;
          const fall = 1 - d / mRadius;
          const f = mForce * fall * fall;
          const p = n.p || 1;
          n.vx += (dx / d) * (f / p) * dt;
          n.vy += (dy / d) * (f / p) * dt;
          n.vz += f * 0.25 * dt;
          n.energy = Math.min(0.7, n.energy + fall * dt * 1.1);
        }
      }

      const dmp = Math.exp(-damp * dt);
      n.vx *= dmp; n.vy *= dmp; n.vz *= dmp;
      n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
    }

    if (this.dragIndex >= 0) {
      const n = this.nodes[this.dragIndex];
      const p = this.focal / Math.max(140, this.focal - this.dragDepth);
      const tX = (mx - this.cx) / p;
      const tY = (my - this.cy) / p;
      const clamp = (v: number) => Math.max(-2600, Math.min(2600, v));
      n.vx = clamp(((tX - n.x) / Math.max(dt, 1e-3)) * 0.35);
      n.vy = clamp(((tY - n.y) / Math.max(dt, 1e-3)) * 0.35);
      n.x += (tX - n.x) * 0.45;
      n.y += (tY - n.y) * 0.45;
      n.z = this.dragDepth; n.vz = 0;
      n.energy = Math.min(1.6, n.energy + dt * 2.4);
    }

    // pulse diffusion (along shell topology + axon chains)
    for (let i = 0; i < nNodes; i++) {
      const n = this.nodes[i];
      if (n.energy > 0.02) {
        const spread = n.energy * 0.9 * dt;
        for (const j of this.neighbors[i]) {
          const m = this.nodes[j];
          if (m.energy < n.energy * 0.72) m.energy += spread * 0.5;
        }
      }
      n.energy *= Math.exp(-1.5 * dt);
    }

    for (const n of this.nodes) {
      const p = this.focal / Math.max(140, this.focal - n.z);
      n.p = p;
      n.sx = this.cx + n.x * p;
      n.sy = this.cy + n.y * p;
    }

    // per-frame hover re-pick
    if (this.mouse.active && this.dragIndex < 0 && !this.orbiting) {
      const hi = this.pick(this.mouse.x, this.mouse.y);
      if (hi !== this.hoverIndex) {
        this.hoverIndex = hi;
        if (hi >= 0) {
          const n = this.nodes[hi];
          this.burst(n.sx, n.sy, 8, 0);
          this.arcTo(hi, 2);
        }
      }
    } else if (this.orbiting) {
      this.hoverIndex = -1;
    }

    this.stepDust(dt);
    this.stepCortex(dt);
    this.stepPackets(dt);
    this.stepFx(dt);

    this.corePulse *= Math.exp(-1.6 * dt);
    this.coreKick *= Math.exp(-1.1 * dt);
  }

  private stepDust(dt: number) {
    if (!this.settings.dust) return;
    for (const d of this.dust) {
      const a = d.spin * dt;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = d.hx * ca + d.hz * sa;
      d.hz = -d.hx * sa + d.hz * ca; d.hx = nx;
      d.vx += -d.ox * 26 * dt; d.vy += -d.oy * 26 * dt; d.vz += -d.oz * 26 * dt;
      const dmp = Math.exp(-3.2 * dt);
      d.vx *= dmp; d.vy *= dmp; d.vz *= dmp;
      d.ox += d.vx * dt; d.oy += d.vy * dt; d.oz += d.vz * dt;
    }
  }

  private stepCortex(dt: number) {
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = rnd(3, 5.5);
      this.fire();
    }
    for (const l of this.axonList) {
      if (l.signal < 0) continue;
      l.signal += dt * 1.2;
      if (l.signal >= 1) {
        l.signal = -1;
        const tip = this.nodes[l.tip];
        tip.energy = 1.5;
        this.burst(tip.sx, tip.sy, 12, 3);
        this.rings.push({ x: tip.sx, y: tip.sy, life: 0, max: 0.6, r: 120 * tip.p, hue: 3 });
      }
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      this.pulses[i].t += dt;
      if (this.pulses[i].t >= this.pulses[i].dur) this.pulses.splice(i, 1);
    }
  }

  /** the cortex fires AND speaks */
  fire() {
    this.corePulse = 1.35;
    this.coreKick = 1.6;
    this.pulses.push({ t: 0, dur: 1.7 });
    for (const l of this.axonList) if (l.signal < 0) l.signal = rnd(-0.25, 0);
    this.rings.push({ x: this.cx, y: this.cy, life: 0, max: 0.9, r: this.radius * 0.9, hue: 0 });
    this.speak();
  }

  private stepPackets(dt: number) {
    const s = this.settings;
    const target = Math.round(this.edges.length * 0.09 * s.dataFlow);
    let guard = 0;
    while (this.packets.length < target && guard++ < 12) {
      const e = Math.floor(Math.random() * this.edges.length);
      this.packets.push({
        e, dir: Math.random() < 0.5 ? 1 : -1, t: Math.random(),
        speed: rnd(0.3, 0.8),
        hue: Math.random() < 0.12 ? 3 : Math.random() < 0.3 ? 1 : 0,
      });
    }

    for (let i = this.packets.length - 1; i >= 0; i--) {
      const pk = this.packets[i];
      pk.t += pk.speed * dt;
      if (pk.t < 1) continue;
      const e = this.edges[pk.e];
      const endIdx = pk.dir === 1 ? e.b : e.a;
      const end = this.nodes[endIdx];
      end.energy = Math.min(1.2, end.energy + 0.35);
      const opts = this.nodeEdges[endIdx];
      if (opts.length && this.packets.length <= target * 1.6 && Math.random() < 0.82) {
        const ne = opts[Math.floor(Math.random() * opts.length)];
        const edge = this.edges[ne];
        pk.e = ne;
        pk.dir = edge.a === endIdx ? 1 : -1;
        pk.t = 0;
        pk.speed = rnd(0.3, 0.9);
      } else {
        this.packets.splice(i, 1);
      }
    }
  }

  private stepFx(dt: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.life += dt;
      if (sp.life >= sp.max) { this.sparks.splice(i, 1); continue; }
      const dmp = Math.exp(-3.4 * dt);
      sp.vx *= dmp; sp.vy *= dmp;
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].life += dt;
      if (this.arcs[i].life >= this.arcs[i].max) this.arcs.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life += dt;
      if (this.rings[i].life >= this.rings[i].max) this.rings.splice(i, 1);
    }

    const hi = this.dragIndex >= 0 ? this.dragIndex : this.hoverIndex;
    if (hi >= 0) {
      const n = this.nodes[hi];
      if (Math.random() < dt * 55) this.burst(n.sx, n.sy, 1, Math.random() < 0.3 ? 3 : 0);
      if (Math.random() < dt * 14) this.arcTo(hi, 1);
      n.energy = Math.max(n.energy, 0.55);
    }
  }

  /* ---------------------------------------------------------------- render */

  render() {
    const g = this.ctx;
    const s = this.settings;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    g.fillStyle = "#010307";
    g.fillRect(0, 0, this.w, this.h);
    const bg = g.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, Math.max(this.w, this.h) * 0.75);
    bg.addColorStop(0, "#050d1c");
    bg.addColorStop(0.45, "#03080f");
    bg.addColorStop(1, "#010307");
    g.fillStyle = bg;
    g.fillRect(0, 0, this.w, this.h);

    g.globalCompositeOperation = "lighter";

    const t = this.time;
    const blob = (x: number, y: number, r: number, col: string, a: number) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, col.replace("A", String(a)));
      gr.addColorStop(1, col.replace("A", "0"));
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    blob(this.cx + Math.sin(t * 0.13) * this.w * 0.18, this.cy - this.h * 0.24, this.radius * 2.1, "rgba(120,40,190,A)", 0.1);
    blob(this.cx - this.w * 0.22, this.cy + this.h * 0.28, this.radius * 2.0, "rgba(20,90,200,A)", 0.09);

    for (const st of this.stars) {
      st.t += 0.02;
      g.fillStyle = `rgba(190,215,255,${st.a * (0.6 + 0.4 * Math.sin(st.t)) * 0.5})`;
      g.fillRect(st.x, st.y, st.r, st.r);
    }

    this.drawDust();
    this.linkCount = s.showLinks ? this.drawLinks() : 0;
    this.drawSpeechWave();
    this.drawPackets();

    // depth split around the core — axons sit in the middle layer
    const order = this.nodes.map((_, i) => i).sort((i, j) => this.nodes[i].z - this.nodes[j].z);
    let split = 0;
    while (split < order.length && this.nodes[order[split]].z < 0) split++;

    for (let k = 0; k < split; k++) this.drawNode(order[k]);
    if (s.axons) this.drawAxons();
    this.drawCortex();
    for (let k = split; k < order.length; k++) this.drawNode(order[k]);

    this.drawArcs();
    this.drawSparks();
    this.drawRings();
    this.drawCursorAura();

    if (s.bloom > 0.01) {
      const bw = this.bloomCanvas.width, bh = this.bloomCanvas.height;
      const bc = this.bloomCtx;
      bc.setTransform(1, 0, 0, 1, 0, 0);
      bc.globalCompositeOperation = "source-over";
      bc.clearRect(0, 0, bw, bh);
      bc.filter = "blur(3px)";
      bc.drawImage(this.canvas, 0, 0, bw, bh);
      bc.filter = "none";
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.5 * s.bloom;
      g.drawImage(this.bloomCanvas, 0, 0, this.w, this.h);
      g.globalAlpha = 1;
    }

    g.globalCompositeOperation = "source-over";
    const vg = g.createRadialGradient(this.cx, this.cy, this.radius * 0.85, this.cx, this.cy, Math.max(this.w, this.h) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = vg;
    g.fillRect(0, 0, this.w, this.h);

    this.drawSpeech();
  }

  private drawDust() {
    if (!this.settings.dust) return;
    const g = this.ctx;
    const s = this.settings;
    for (const d of this.dust) {
      const [rx, ry, rz] = this.rot(d.hx, d.hy, d.hz);
      const pr = this.proj(rx * this.radius + d.ox, ry * this.radius + d.oy, rz * this.radius + d.oz);
      if (pr.x < -20 || pr.x > this.w + 20 || pr.y < -20 || pr.y > this.h + 20) continue;
      d.phase += 0.03;
      const tw = 0.55 + 0.45 * Math.sin(d.phase);
      const size = d.size * pr.p * 2.5 * s.glow;
      g.globalAlpha = Math.min(1, 0.3 * tw * (0.4 + pr.p * 0.5));
      g.drawImage(this.sprites[d.hue], pr.x - size, pr.y - size, size * 2, size * 2);
    }
    g.globalAlpha = 1;
  }

  /** links drawn only between stored shell neighbours — they hug the globe */
  private drawLinks(): number {
    const g = this.ctx;
    const maxD = this.radius * this.settings.linkDistance;
    const nodes = this.nodes;
    const outer = this.axonList.length ? nodes.length - 9 : nodes.length;
    let links = 0;
    g.lineWidth = 1;
    for (let i = 0; i < outer; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < outer; j++) {
        const b = nodes[j];
        const dx = a.x - b.x; if (dx > maxD || dx < -maxD) continue;
        const dy = a.y - b.y; if (dy > maxD || dy < -maxD) continue;
        const dz = a.z - b.z; if (dz > maxD || dz < -maxD) continue;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > maxD) continue;
        const tt = 1 - d / maxD;
        const depth = (a.z + b.z) * 0.5;
        const dfac = 0.34 + 0.66 * ((depth + this.radius) / (this.radius * 2));
        const e = Math.min(1, (a.energy + b.energy) * 0.5);
        const alpha = tt * tt * 0.42 * dfac;
        if (alpha < 0.012) continue;
        links++;
        if (e > 0.05) {
          g.strokeStyle = `rgba(${Math.round(150 + 105 * e)},${Math.round(225 + 25 * e)},255,${Math.min(0.95, alpha + e * 0.6)})`;
          g.lineWidth = 1 + e * 1.5;
        } else {
          g.strokeStyle = `rgba(120,196,255,${alpha})`;
          g.lineWidth = 1;
        }
        g.beginPath();
        g.moveTo(a.sx, a.sy);
        g.lineTo(b.sx, b.sy);
        g.stroke();
      }
    }
    return links;
  }

  /** expanding luminous ring/shell ripple that pulses the globe while the core speaks */
  private drawSpeechWave() {
    const g = this.ctx;
    if (this.speechWave < 0) return;
    const w = this.speechWave;
    const fade = Math.min(1, w * 6) * Math.min(1, Math.max(0, (1.05 - w) * 3.5));

    // expanding equator ring squashed along the current X rotation
    const rr = this.radius * (0.25 + 0.85 * w) * (1 + this.speechBeam * 0.02);
    const sq = Math.cos(this.rotX);
    g.save();
    g.translate(this.cx, this.cy);
    g.scale(1, Math.max(0.2, Math.abs(sq)));
    g.rotate(this.rotY * 0);
    g.strokeStyle = `rgba(190,235,255,${0.4 * fade})`;
    g.lineWidth = 2.6 * fade + 0.6;
    g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = `rgba(120,200,255,${0.2 * fade})`;
    g.lineWidth = 7 * fade;
    g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  private drawPackets() {
    const g = this.ctx;
    for (const pk of this.packets) {
      const e = this.edges[pk.e];
      const a = pk.dir === 1 ? this.nodes[e.a] : this.nodes[e.b];
      const b = pk.dir === 1 ? this.nodes[e.b] : this.nodes[e.a];
      const tt = Math.min(1, pk.t);
      const t0 = Math.max(0, tt - 0.32);
      const px = a.x + (b.x - a.x) * tt, py = a.y + (b.y - a.y) * tt, pz = a.z + (b.z - a.z) * tt;
      const qx = a.x + (b.x - a.x) * t0, qy = a.y + (b.y - a.y) * t0, qz = a.z + (b.z - a.z) * t0;
      const P = this.proj(px, py, pz);
      const Q = this.proj(qx, qy, qz);
      const dfac = 0.35 + 0.65 * ((pz + this.radius) / (this.radius * 2));
      const col = PALETTE[pk.hue];

      const grad = g.createLinearGradient(Q.x, Q.y, P.x, P.y);
      grad.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      grad.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},${0.85 * dfac})`);
      g.strokeStyle = grad;
      g.lineWidth = 1.6 * P.p;
      g.beginPath();
      g.moveTo(Q.x, Q.y);
      g.lineTo(P.x, P.y);
      g.stroke();

      const size = 4.2 * P.p * this.settings.glow;
      g.globalAlpha = 0.9 * dfac;
      g.drawImage(this.sprites[pk.hue], P.x - size, P.y - size, size * 2, size * 2);
      g.globalAlpha = 1;
    }
  }

  private drawNode(i: number) {
    const g = this.ctx;
    const s = this.settings;
    const n = this.nodes[i];
    n.phase += 0.02;
    const tw = 0.75 + 0.25 * Math.sin(n.phase + this.time);
    const e = Math.min(1.5, n.energy);
    const hov = this.hoverIndex === i || this.dragIndex === i ? 1 : 0;
    const dfac = 0.45 + 0.55 * ((n.z + this.radius) / (this.radius * 2));
    const size = n.size * n.p * (2.8 + e * 2.5 + hov * 1.8) * s.glow;
    g.globalAlpha = Math.min(1, (0.5 + e * 0.5 + hov * 0.3) * tw * dfac);
    g.drawImage(this.sprites[e > 0.35 ? 0 : n.hue], n.sx - size, n.sy - size, size * 2, size * 2);

    g.globalAlpha = Math.min(1, 0.85 * dfac + e * 0.4);
    g.fillStyle = e > 0.35 ? "#ffffff" : "#e8f6ff";
    g.beginPath();
    g.arc(n.sx, n.sy, Math.max(0.6, n.size * n.p * 0.34 * (1 + e * 0.5)), 0, Math.PI * 2);
    g.fill();

    if (hov) {
      g.globalAlpha = 0.6;
      g.strokeStyle = "rgba(180,235,255,0.9)";
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(n.sx, n.sy, 13 + 3 * Math.sin(this.time * 7), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 0.28;
      g.beginPath();
      g.arc(n.sx, n.sy, 22 + 5 * Math.sin(this.time * 4 + 1), 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  private axonPoint(l: Axon, t: number, off: Vec) {
    const tip = this.nodes[l.tip];
    const amp = l.amp * this.radius;
    const bend = Math.sin(Math.PI * t) * amp;
    return {
      x: tip.x * t + off[0] * bend,
      y: tip.y * t + off[1] * bend,
      z: tip.z * t + off[2] * bend,
    };
  }

  /** thick organic axons from the cortex to the globe anchors */
  private drawAxons() {
    const g = this.ctx;
    const SEG = 18;
    for (const l of this.axonList) {
      const tip = this.nodes[l.tip];
      const off = this.rot(l.off[0], l.off[1], l.off[2]);
      const pts: { x: number; y: number; p: number }[] = [];
      for (let k = 0; k <= SEG; k++) {
        const wp = this.axonPoint(l, k / SEG, off);
        const pr = this.proj(wp.x, wp.y, wp.z);
        pts.push({ x: pr.x, y: pr.y, p: pr.p });
      }
      const energy = Math.min(1, tip.energy);
      const dfac = 0.45 + 0.55 * ((tip.z + this.radius) / (this.radius * 2));
      const sig = l.signal >= 0 ? 1 : 0;

      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < SEG; k++) {
          const t = k / SEG;
          const taper = Math.pow(1 - t, 1.45);
          const w = (l.width * this.settings.axonSize * taper + 0.9) * pts[k].p;
          const a = pass === 0
            ? (0.07 + energy * 0.11 + sig * 0.06) * dfac
            : (0.2 + 0.32 * taper + energy * 0.45 + sig * 0.1) * dfac;
          g.strokeStyle = pass === 0
            ? `rgba(110,190,255,${a})`
            : `rgba(${Math.round(200 + 55 * energy)},${Math.round(232 + 20 * energy)},255,${a})`;
          g.lineWidth = pass === 0 ? w * 3.8 : w;
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(pts[k].x, pts[k].y);
          g.lineTo(pts[k + 1].x, pts[k + 1].y);
          g.stroke();
        }
      }

      // sub-branches
      for (const br of l.branches) {
        const base = this.axonPoint(l, br.at, off);
        const bdir = this.rot(br.dir[0], br.dir[1], br.dir[2]);
        const boff = this.rot(br.off[0], br.off[1], br.off[2]);
        const len = br.len * this.radius;
        const B = 8;
        let prev = this.proj(base.x, base.y, base.z);
        for (let k = 1; k <= B; k++) {
          const t = k / B;
          const bend = Math.sin(Math.PI * t) * br.amp * this.radius;
          const px = base.x + bdir[0] * len * t + boff[0] * bend;
          const py = base.y + bdir[1] * len * t + boff[1] * bend;
          const pz = base.z + bdir[2] * len * t + boff[2] * bend;
          const pr = this.proj(px, py, pz);
          const taper = Math.pow(1 - t, 1.35);
          g.strokeStyle = `rgba(185,225,255,${(0.12 + 0.22 * taper + energy * 0.3) * dfac})`;
          g.lineWidth = (br.width * this.settings.axonSize * taper + 0.5) * pr.p;
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(pr.x, pr.y); g.stroke();
          prev = pr;
        }
        const tipSize = 2.6 * prev.p * this.settings.glow;
        g.globalAlpha = 0.5 * dfac;
        g.drawImage(this.sprites[0], prev.x - tipSize, prev.y - tipSize, tipSize * 2, tipSize * 2);
        g.globalAlpha = 1;
      }

      // faint aura beam from the tip to the shell — the "feeler" reaching the globe
      {
        const dir = norm([tip.x, tip.y, tip.z]);
        const p0 = this.proj(tip.x, tip.y, tip.z);
        const p1 = this.proj(dir[0] * this.radius * 0.98, dir[1] * this.radius * 0.98, dir[2] * this.radius * 0.98);
        const grad = g.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
        grad.addColorStop(0, `rgba(170,220,255,${(0.16 + energy * 0.3 + sig * 0.2) * dfac})`);
        grad.addColorStop(1, "rgba(170,220,255,0)");
        g.strokeStyle = grad;
        g.lineWidth = 1.1;
        g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
      }

      // travelling action potential
      if (l.signal >= 0) {
        const t = Math.max(0.001, Math.min(1, l.signal));
        const wp = this.axonPoint(l, t, off);
        const pr = this.proj(wp.x, wp.y, wp.z);
        const size = 9 * pr.p * this.settings.glow;
        g.globalAlpha = 0.95;
        g.drawImage(this.sprites[3], pr.x - size, pr.y - size, size * 2, size * 2);
        g.drawImage(this.sprites[0], pr.x - size * 0.55, pr.y - size * 0.55, size * 1.1, size * 1.1);
        g.globalAlpha = 1;
      }
    }
    g.lineCap = "butt";
  }

  /** the core: a deforming sphere (bulges toward axon tips) that flashes when it speaks */
  private drawCortex() {
    const g = this.ctx;
    const R = this.radius * 0.3;
    const pulse = this.corePulse;

    // aura halo — always breathing, flashing when talking
    const haloR = R * (1.7 + pulse * 0.5) * this.settings.glow;
    const cg = g.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, haloR);
    cg.addColorStop(0, `rgba(255,255,255,${0.5 + pulse * 0.3})`);
    cg.addColorStop(0.12, `rgba(200,235,255,${0.32 + pulse * 0.25})`);
    cg.addColorStop(0.3, `rgba(90,180,255,${0.16 + pulse * 0.2})`);
    cg.addColorStop(0.62, "rgba(70,60,200,0.05)");
    cg.addColorStop(1, "rgba(30,60,160,0)");
    g.fillStyle = cg;
    g.beginPath(); g.arc(this.cx, this.cy, haloR, 0, Math.PI * 2); g.fill();

    // pulse waves travelling across the body surface — only while talking
    const activePulses: { k: number; front: number; ang: number; w: number }[] = [];
    for (const pl of this.pulses) {
      const k = pl.t / pl.dur;
      const front = Math.cos(k * Math.PI);
      const ang = Math.sin(k * Math.PI) * (Math.PI / 2.1);
      const w = R * (0.16 * (1 - k));
      const alpha = (1 - Math.abs(front) * 0.35) * 0.5 * (1 - k * 0.5);
      activePulses.push({ k, front, ang, w });
      g.strokeStyle = `rgba(215,240,255,${Math.max(0, alpha)})`;
      g.lineWidth = R * 0.09 * (1 - k) + 0.5;
      g.save();
      g.translate(this.cx, this.cy);
      g.rotate(ang);
      g.scale(1, Math.abs(front));
      g.beginPath(); g.arc(0, 0, R * 0.86, 0, Math.PI * 2); g.stroke();
      g.restore();
    }

    // deforming sphere — bulges toward axon tips + pulse waves (no membrane noise)
    const dirs: { a: number; amp: number }[] = [];
    for (const l of this.axonList) {
      const tip = this.nodes[l.tip];
      const dx = tip.sx - this.cx, dy = tip.sy - this.cy;
      const len = Math.hypot(dx, dy) || 1;
      const front = Math.max(0, (tip.z + this.radius * 0.4) / (this.radius * 1.6));
      dirs.push({ a: Math.atan2(dy, dx), amp: (len / (this.radius * 0.7)) * front });
    }

    const STEPS = 72;
    g.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const ang = (i / STEPS) * Math.PI * 2;
      const nx = Math.cos(ang), ny = Math.sin(ang);
      let r = R;
      for (const d of dirs) {
        let diff = Math.abs(ang - d.a) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        r += R * 0.15 * d.amp * Math.exp(-(diff * diff) / 0.085);
      }
      for (const pl of activePulses) {
        const side = pl.front >= 0 ? 0 : Math.PI;
        let dd = Math.abs(ang - (pl.ang + side)) % (Math.PI * 2);
        if (dd > Math.PI) dd = Math.PI * 2 - dd;
        r += pl.w * Math.exp(-(dd * dd) * 2.2);
      }
      g[i === 0 ? "moveTo" : "lineTo"](this.cx + nx * r, this.cy + ny * r);
    }
    g.closePath();

    const body = g.createRadialGradient(
      this.cx - R * 0.3, this.cy - R * 0.34, R * 0.04,
      this.cx, this.cy, R * 1.5,
    );
    const speaking = performance.now() < this.speechUntil;
    const flash = speaking ? 0.2 : 0;
    body.addColorStop(0, `rgba(255,255,255,${0.94 + flash})`);
    body.addColorStop(0.34, `rgba(232,248,255,${0.5 + flash + pulse * 0.2})`);
    body.addColorStop(0.68, `rgba(140,205,255,${0.12 + pulse * 0.12})`);
    body.addColorStop(1, "rgba(60,120,230,0)");
    g.fillStyle = body;
    g.fill();
    g.strokeStyle = `rgba(210,240,255,${0.3 + pulse * 0.4})`;
    g.lineWidth = 1.2;
    g.stroke();

    // nucleus
    const nr = R * (0.32 + pulse * 0.1);
    const ng = g.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, nr);
    ng.addColorStop(0, "rgba(255,255,255,1)");
    ng.addColorStop(0.45, `rgba(215,185,255,${0.8 + pulse * 0.2})`);
    ng.addColorStop(1, "rgba(150,110,255,0)");
    g.fillStyle = ng;
    g.beginPath(); g.arc(this.cx, this.cy, nr, 0, Math.PI * 2); g.fill();
  }

  private drawArcs() {
    const g = this.ctx;
    for (const arc of this.arcs) {
      const a = this.nodes[arc.a], b = this.nodes[arc.b];
      const k = 1 - arc.life / arc.max;
      const dx = b.sx - a.sx, dy = b.sy - a.sy;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const SEG = 7;
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass === 0 ? `rgba(120,200,255,${0.16 * k})` : `rgba(235,250,255,${0.85 * k})`;
        g.lineWidth = pass === 0 ? 4.5 : 1.1;
        g.beginPath();
        g.moveTo(a.sx, a.sy);
        for (let i = 1; i < SEG; i++) {
          const tt = i / SEG;
          const jitter = Math.sin(arc.seed + i * 12.9898 + this.time * 60) * len * 0.09 * Math.sin(Math.PI * tt);
          g.lineTo(a.sx + dx * tt + nx * jitter, a.sy + dy * tt + ny * jitter);
        }
        g.lineTo(b.sx, b.sy);
        g.stroke();
      }
    }
  }

  private drawSparks() {
    const g = this.ctx;
    for (const sp of this.sparks) {
      const k = 1 - sp.life / sp.max;
      const col = PALETTE[sp.hue];
      g.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.9 * k})`;
      g.lineWidth = sp.size * k + 0.4;
      g.beginPath();
      g.moveTo(sp.x, sp.y);
      g.lineTo(sp.x - sp.vx * 0.02, sp.y - sp.vy * 0.02);
      g.stroke();
      const s2 = sp.size * 3 * k;
      g.globalAlpha = k * 0.8;
      g.drawImage(this.sprites[sp.hue], sp.x - s2, sp.y - s2, s2 * 2, s2 * 2);
      g.globalAlpha = 1;
    }
  }

  private drawRings() {
    const g = this.ctx;
    for (const r of this.rings) {
      const k = r.life / r.max;
      const col = PALETTE[r.hue];
      g.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${(1 - k) * 0.5})`;
      g.lineWidth = 2 * (1 - k) + 0.4;
      g.beginPath();
      g.arc(r.x, r.y, r.r * Math.pow(k, 0.6), 0, Math.PI * 2);
      g.stroke();
    }
  }

  private drawCursorAura() {
    if (!this.mouse.active) return;
    const g = this.ctx;
    const r = Math.min(this.w, this.h) * 0.1;
    const gr = g.createRadialGradient(this.mouse.x, this.mouse.y, 0, this.mouse.x, this.mouse.y, r);
    gr.addColorStop(0, "rgba(110,200,255,0.09)");
    gr.addColorStop(0.6, "rgba(90,160,255,0.03)");
    gr.addColorStop(1, "rgba(90,160,255,0)");
    g.fillStyle = gr;
    g.beginPath(); g.arc(this.mouse.x, this.mouse.y, r, 0, Math.PI * 2); g.fill();
  }

  private drawSpeech() {
    if (performance.now() > this.speechUntil || !this.speechText) return;
    const g = this.ctx;
    const k = Math.min(1, (this.speechUntil - performance.now()) / 1900);
    const fade = Math.min(1, k * 4) * Math.min(1, (1 - Math.min(1, (1900 - (this.speechUntil - performance.now())) / 300)));
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.globalAlpha = Math.max(0, Math.min(1, fade));
    g.fillStyle = "#cdefff";
    g.font = "500 12px ui-monospace, monospace";
    g.textAlign = "center";
    g.shadowColor = "rgba(103,232,249,0.9)";
    g.shadowBlur = 12;
    g.fillText(`❝ ${this.speechText.toUpperCase()} ❞`, this.cx, this.h - 88);
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ loop */

  start() {
    this.lastT = performance.now();
    const loop = (now: number) => {
      const raw = (now - this.lastT) / 1000;
      this.lastT = now;
      const dt = Math.min(0.033, Math.max(0.001, raw));
      this.fps = this.fps * 0.92 + (1 / Math.max(raw, 1e-3)) * 0.08;
      this.step(dt / 2);
      this.step(dt / 2);
      this.render();
      this.onStats?.({
        nodes: this.nodes.length,
        links: this.linkCount,
        packets: this.packets.length,
        fps: Math.round(this.fps),
      });
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
  }
}

/* ------------------------------------------------------------------ vector */

function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(v: Vec): Vec {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
