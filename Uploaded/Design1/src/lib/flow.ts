/**
 * FlowEngine — animated workflow diagram (design space 1600 x 900).
 *  - white / blue routed connectors with rounded corners + arrow heads
 *  - blue data packets (comets) streaming along every path, chaining node -> node
 *  - the AI Agent core burns: continuous embers + a fire burst whenever data arrives
 *  - arrival flashes / rings on every node
 */

export const DESIGN_W = 1600;
export const DESIGN_H = 900;

export type NodeKind = "card" | "core" | "round";
export type FlowNode = { id: string; x: number; y: number; w: number; h: number; kind: NodeKind };
export type EdgeStyle = "white" | "blue";
export type FlowEdge = { from: string; to: string; pts: [number, number][]; style: EdgeStyle; arrow?: boolean };

/**
 * SamJuniorsOS operating graph.
 *   Inputs (top)  → Sophia (core) → Workforce (blue)  → Your decisions (bottom)
 *   Triage → Understand → Sophia → Plan → Delegate → Deliver (middle row)
 * Positions are unchanged from the original layout to preserve the visual identity.
 */
export const NODES: FlowNode[] = [
  { id: "inbox", x: 800, y: 120, w: 84, h: 84, kind: "card" },
  { id: "calendar", x: 545, y: 195, w: 84, h: 84, kind: "card" },
  { id: "signals", x: 690, y: 195, w: 84, h: 84, kind: "card" },
  { id: "requests", x: 910, y: 195, w: 84, h: 84, kind: "card" },
  { id: "memory", x: 1055, y: 195, w: 84, h: 84, kind: "card" },
  { id: "triage", x: 330, y: 430, w: 84, h: 84, kind: "card" },
  { id: "understand", x: 528, y: 430, w: 84, h: 84, kind: "card" },
  { id: "core", x: 800, y: 418, w: 214, h: 96, kind: "core" },
  { id: "plan", x: 1068, y: 430, w: 84, h: 84, kind: "card" },
  { id: "delegate", x: 1263, y: 430, w: 84, h: 84, kind: "card" },
  { id: "deliver", x: 1458, y: 430, w: 84, h: 84, kind: "card" },
  { id: "research", x: 660, y: 592, w: 84, h: 84, kind: "round" },
  { id: "ops", x: 800, y: 592, w: 84, h: 84, kind: "round" },
  { id: "finance", x: 940, y: 592, w: 84, h: 84, kind: "round" },
  { id: "decisions", x: 800, y: 772, w: 84, h: 84, kind: "card" },
];

export const EDGES: FlowEdge[] = [
  // inbox fans out to the other inputs
  { from: "inbox", to: "calendar", pts: [[758, 120], [545, 120], [545, 153]], style: "white" },
  { from: "inbox", to: "memory", pts: [[842, 120], [1055, 120], [1055, 153]], style: "white" },
  // horizontal connectors between inputs
  { from: "calendar", to: "signals", pts: [[587, 195], [648, 195]], style: "white", arrow: true },
  { from: "requests", to: "memory", pts: [[952, 195], [1013, 195]], style: "white", arrow: true },
  // inputs into Sophia
  { from: "inbox", to: "core", pts: [[800, 162], [800, 370]], style: "white" },
  { from: "calendar", to: "core", pts: [[545, 237], [545, 300], [800, 300], [800, 370]], style: "white" },
  { from: "signals", to: "core", pts: [[690, 237], [690, 300], [800, 300], [800, 370]], style: "white" },
  { from: "requests", to: "core", pts: [[910, 237], [910, 300], [800, 300], [800, 370]], style: "white" },
  { from: "memory", to: "core", pts: [[1055, 237], [1055, 300], [800, 300], [800, 370]], style: "white" },
  // orchestration pipeline
  { from: "triage", to: "understand", pts: [[372, 430], [486, 430]], style: "white", arrow: true },
  { from: "understand", to: "core", pts: [[570, 430], [693, 430]], style: "white", arrow: true },
  { from: "core", to: "plan", pts: [[907, 430], [1026, 430]], style: "white", arrow: true },
  { from: "plan", to: "delegate", pts: [[1110, 430], [1221, 430]], style: "white", arrow: true },
  { from: "delegate", to: "deliver", pts: [[1305, 430], [1416, 430]], style: "white", arrow: true },
  // workforce (blue)
  { from: "core", to: "research", pts: [[770, 466], [770, 520], [660, 520], [660, 550]], style: "blue" },
  { from: "core", to: "ops", pts: [[800, 466], [800, 550]], style: "blue" },
  { from: "core", to: "finance", pts: [[830, 466], [830, 520], [940, 520], [940, 550]], style: "blue" },
  // operations escalates decisions to you
  { from: "ops", to: "decisions", pts: [[800, 634], [800, 730]], style: "blue" },
];

const SOURCES = new Set(["inbox", "calendar", "signals", "requests", "memory", "triage"]);

type P = { x: number; y: number };
type Sampled = { pts: P[]; cum: number[]; len: number; edge: FlowEdge; index: number };
type Packet = { e: number; d: number; speed: number; hot: boolean; trail: number };
type Ember = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; heat: number };
type Ring = { x: number; y: number; life: number; max: number; r: number; orange: boolean };

function samplePath(raw: [number, number][], radius = 22, step = 4): P[] {
  const pts = raw.map(([x, y]) => ({ x, y }));
  if (pts.length < 2) return pts;
  const out: P[] = [];
  const pushLine = (a: P, b: P) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 0; i < n; i++) out.push({ x: a.x + (b.x - a.x) * (i / n), y: a.y + (b.y - a.y) * (i / n) });
  };
  const pushQuad = (a: P, c: P, b: P) => {
    const N = 10;
    for (let i = 0; i < N; i++) {
      const t = i / N, u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
    }
  };
  let cur = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], prev = pts[i - 1], next = pts[i + 1];
    const lin = Math.hypot(p.x - prev.x, p.y - prev.y);
    const lout = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, lin / 2, lout / 2);
    const din = { x: (p.x - prev.x) / lin, y: (p.y - prev.y) / lin };
    const dout = { x: (next.x - p.x) / lout, y: (next.y - p.y) / lout };
    const pin = { x: p.x - din.x * r, y: p.y - din.y * r };
    const pout = { x: p.x + dout.x * r, y: p.y + dout.y * r };
    pushLine(cur, pin);
    pushQuad(pin, p, pout);
    cur = pout;
  }
  pushLine(cur, pts[pts.length - 1]);
  out.push(pts[pts.length - 1]);
  return out;
}

function sprite(r: number, g: number, b: number, size = 64): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d")!;
  const h = size / 2;
  const grd = x.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.18, `rgba(${r},${g},${b},0.9)`);
  grd.addColorStop(0.45, `rgba(${r},${g},${b},0.3)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd;
  x.fillRect(0, 0, size, size);
  return c;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export const WORLD = {
  CX: 895,
  CY: 445,
  W: 1290,
  H: 790,
  MIN_X: 250,
  MAX_X: 1540,
  MIN_Y: 50,
  MAX_Y: 840,
};

export class FlowEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scale = 1;
  tx = 0;
  ty = 0;
  vw = 0;
  vh = 0;
  dpr = 1;
  time = 0;

  paths: Sampled[] = [];
  outgoing = new Map<string, number[]>();
  nodeMap = new Map<string, FlowNode>();
  packets: Packet[] = [];
  embers: Ember[] = [];
  rings: Ring[] = [];
  energy = new Map<string, number>();
  coreHeat = 0.4;
  spawnTimer = 0;
  emberAcc = 0;
  running = true;

  blueSprite = sprite(90, 180, 255);
  fireSprite = sprite(255, 150, 60);
  whiteSprite = sprite(220, 240, 255);
  private raf = 0;
  private lastT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    for (const n of NODES) { this.nodeMap.set(n.id, n); this.energy.set(n.id, 0); }
    EDGES.forEach((e, index) => {
      const pts = samplePath(e.pts);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      this.paths.push({ pts, cum, len: cum[cum.length - 1], edge: e, index });
      if (!this.outgoing.has(e.from)) this.outgoing.set(e.from, []);
      this.outgoing.get(e.from)!.push(index);
    });
    // seed a few packets so the scene is alive on frame one
    for (let i = 0; i < 10; i++) this.spawn(true);
  }

  /** Legacy API — fits whole design into a scaled canvas (kept for compat). */
  setScale(scale: number) {
    this.setViewport(DESIGN_W * scale, DESIGN_H * scale, scale, 0, 0);
  }

  /**
   * Viewport API for the pannable / zoomable canvas.
   * screen = world * scale + (tx, ty)
   */
  setViewport(vw: number, vh: number, scale: number, tx: number, ty: number) {
    this.vw = vw;
    this.vh = vh;
    this.scale = scale;
    this.tx = tx;
    this.ty = ty;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(vw * this.dpr));
    const h = Math.max(1, Math.floor(vh * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /* ------------------------------------------------------------- simulate */

  pointAt(p: Sampled, d: number): P {
    const cum = p.cum;
    if (d <= 0) return p.pts[0];
    if (d >= p.len) return p.pts[p.pts.length - 1];
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo] || 1;
    const t = (d - cum[lo]) / seg;
    return { x: p.pts[lo].x + (p.pts[hi].x - p.pts[lo].x) * t, y: p.pts[lo].y + (p.pts[hi].y - p.pts[lo].y) * t };
  }

  spawn(randomStart = false) {
    const starts = this.paths.filter((p) => SOURCES.has(p.edge.from));
    const p = starts[Math.floor(Math.random() * starts.length)];
    this.packets.push({
      e: p.index,
      d: randomStart ? Math.random() * p.len : 0,
      speed: rnd(130, 220),
      hot: false,
      trail: rnd(34, 58),
    });
  }

  arrive(nodeId: string, x: number, y: number) {
    this.energy.set(nodeId, 1);
    if (nodeId === "core") {
      this.coreHeat = Math.min(1.6, this.coreHeat + 0.7);
      this.burstFire(x, y, 46);
      // flames lick up along the whole top edge of the core
      const c = this.nodeMap.get("core")!;
      for (let i = 0; i < 24; i++) {
        this.embers.push({
          x: c.x - c.w / 2 + Math.random() * c.w, y: c.y - c.h / 2,
          vx: rnd(-18, 18), vy: rnd(-140, -60),
          life: 0, max: rnd(0.45, 1), size: rnd(1.4, 3), heat: rnd(0.3, 1),
        });
      }
      this.rings.push({ x: c.x, y: c.y, life: 0, max: 0.7, r: 150, orange: true });
    } else {
      this.rings.push({ x, y, life: 0, max: 0.55, r: 62, orange: false });
    }
  }

  burstFire(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(30, 170);
      this.embers.push({
        x: x + rnd(-40, 40), y: y + rnd(-14, 14),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0, max: rnd(0.4, 1.1), size: rnd(1.2, 3.2), heat: Math.random(),
      });
    }
  }

  step(dt: number) {
    this.time += dt;
    const core = this.nodeMap.get("core")!;

    // packet spawner
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = rnd(0.18, 0.42); this.spawn(); }

    for (let i = this.packets.length - 1; i >= 0; i--) {
      const pk = this.packets[i];
      const path = this.paths[pk.e];
      pk.d += pk.speed * dt;
      if (pk.d < path.len) continue;
      const to = path.edge.to;
      const end = path.pts[path.pts.length - 1];
      this.arrive(to, end.x, end.y);
      const next = this.outgoing.get(to);
      if (next && next.length && Math.random() < 0.9 && this.packets.length < 60) {
        pk.e = next[Math.floor(Math.random() * next.length)];
        pk.d = 0;
        pk.speed = rnd(130, 230);
        pk.hot = to === "core";
      } else {
        this.packets.splice(i, 1);
      }
    }

    // energy decay
    for (const [k, v] of this.energy) this.energy.set(k, v * Math.exp(-2.6 * dt));
    this.coreHeat = 0.4 + (this.coreHeat - 0.4) * Math.exp(-1.4 * dt);

    // continuous embers around the core perimeter
    this.emberAcc += dt * (70 + this.coreHeat * 90);
    while (this.emberAcc > 1) {
      this.emberAcc -= 1;
      const per = (core.w + core.h) * 2;
      let d = Math.random() * per;
      let x = core.x - core.w / 2, y = core.y - core.h / 2;
      if (d < core.w) x += d;
      else if ((d -= core.w) < core.h) { x += core.w; y += d; }
      else if ((d -= core.h) < core.w) { x += core.w - d; y += core.h; }
      else { y += d - core.w; }
      this.embers.push({
        x: x + rnd(-3, 3), y: y + rnd(-3, 3),
        vx: rnd(-22, 22), vy: rnd(-70, -15),
        life: 0, max: rnd(0.35, 0.9), size: rnd(0.8, 2.2), heat: Math.random(),
      });
    }
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const em = this.embers[i];
      em.life += dt;
      if (em.life >= em.max) { this.embers.splice(i, 1); continue; }
      em.vy -= 40 * dt;
      em.vx += Math.sin(this.time * 9 + em.heat * 20) * 30 * dt;
      const dmp = Math.exp(-1.6 * dt);
      em.vx *= dmp; em.vy *= dmp;
      em.x += em.vx * dt; em.y += em.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life += dt;
      if (this.rings[i].life >= this.rings[i].max) this.rings.splice(i, 1);
    }
  }

  /* ---------------------------------------------------------------- render */

  render() {
    const g = this.ctx;
    // clear in device pixels
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // world -> screen
    const k = this.scale * this.dpr;
    g.setTransform(k, 0, 0, k, this.tx * this.dpr, this.ty * this.dpr);
    g.lineCap = "round";
    g.lineJoin = "round";

    // --- connectors
    for (const p of this.paths) {
      const e = p.edge;
      const eFrom = this.energy.get(e.from) || 0;
      const eTo = this.energy.get(e.to) || 0;
      const lit = Math.max(eFrom, eTo);
      g.beginPath();
      g.moveTo(p.pts[0].x, p.pts[0].y);
      for (let i = 1; i < p.pts.length; i++) g.lineTo(p.pts[i].x, p.pts[i].y);

      if (e.style === "blue") {
        g.save();
        g.globalCompositeOperation = "lighter";
        g.strokeStyle = `rgba(60,150,255,${0.28 + lit * 0.3})`;
        g.lineWidth = 9;
        g.stroke();
        g.strokeStyle = `rgba(110,190,255,${0.55 + lit * 0.4})`;
        g.lineWidth = 2.4;
        g.setLineDash([7, 9]);
        g.lineDashOffset = -this.time * 60;
        g.stroke();
        g.setLineDash([]);
        g.restore();
      } else {
        g.strokeStyle = `rgba(255,255,255,${0.12 + lit * 0.08})`;
        g.lineWidth = 5;
        g.stroke();
        g.strokeStyle = `rgba(${225 + lit * 30},${235 + lit * 20},255,${0.62 + lit * 0.35})`;
        g.lineWidth = 1.7;
        g.stroke();
      }

      // heat gradient where a connector enters the burning core
      if (e.to === "core") {
        const tail = 120;
        const start = Math.max(0, p.len - tail);
        const a = this.pointAt(p, start);
        const b = p.pts[p.pts.length - 1];
        const grad = g.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, "rgba(255,150,60,0)");
        grad.addColorStop(1, `rgba(255,170,80,${0.55 + this.coreHeat * 0.35})`);
        g.save();
        g.globalCompositeOperation = "lighter";
        g.beginPath();
        let began = false;
        for (let i = 0; i < p.pts.length; i++) {
          if (p.cum[i] < start) continue;
          if (!began) { g.moveTo(a.x, a.y); began = true; }
          g.lineTo(p.pts[i].x, p.pts[i].y);
        }
        g.strokeStyle = grad;
        g.lineWidth = 6;
        g.stroke();
        g.lineWidth = 2;
        g.stroke();
        g.restore();
      }

      // arrow heads
      if (e.arrow) {
        const n = p.pts.length;
        const b = p.pts[n - 1], a = p.pts[n - 4] || p.pts[0];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        g.fillStyle = `rgba(240,246,255,${0.85 + lit * 0.15})`;
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - Math.cos(ang - 0.45) * 10, b.y - Math.sin(ang - 0.45) * 10);
        g.lineTo(b.x - Math.cos(ang + 0.45) * 10, b.y - Math.sin(ang + 0.45) * 10);
        g.closePath();
        g.fill();
      }
    }

    // junction dots
    g.fillStyle = "rgba(230,240,255,0.9)";
    for (const [x, y] of [[545, 300], [690, 300], [910, 300], [1055, 300], [800, 300], [545, 120], [1055, 120], [770, 520], [830, 520]] as [number, number][]) {
      g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
    }

    g.globalCompositeOperation = "lighter";

    // --- node arrival glows
    for (const n of NODES) {
      const en = this.energy.get(n.id) || 0;
      if (en < 0.02) continue;
      const r = Math.max(n.w, n.h) * (0.9 + en * 0.3);
      const orange = n.id === "core";
      const gr = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
      gr.addColorStop(0, orange ? `rgba(255,170,80,${0.45 * en})` : `rgba(100,190,255,${0.45 * en})`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(n.x - r, n.y - r, r * 2, r * 2);
    }

    // --- core fire border
    {
      const c = this.nodeMap.get("core")!;
      const heat = this.coreHeat;
      const x = c.x - c.w / 2 - 5, y = c.y - c.h / 2 - 5, w = c.w + 10, h = c.h + 10;
      g.save();
      g.shadowColor = "rgba(255,140,50,0.95)";
      g.shadowBlur = 22 + heat * 26;
      g.strokeStyle = `rgba(255,${Math.round(160 + heat * 50)},80,${0.55 + heat * 0.4})`;
      g.lineWidth = 2.2 + heat * 1.6;
      g.beginPath();
      g.roundRect(x, y, w, h, 16);
      g.stroke();
      g.restore();
      const gr = g.createRadialGradient(c.x, c.y, c.w * 0.2, c.x, c.y, c.w * 0.8);
      gr.addColorStop(0, `rgba(255,140,60,${0.12 + heat * 0.1})`);
      gr.addColorStop(1, "rgba(255,120,40,0)");
      g.fillStyle = gr;
      g.fillRect(c.x - c.w, c.y - c.w, c.w * 2, c.w * 2);
    }

    // --- embers
    for (const em of this.embers) {
      const k2 = 1 - em.life / em.max;
      const s = em.size * (0.6 + k2) * 3;
      g.globalAlpha = Math.min(1, k2 * 1.3);
      g.drawImage(em.heat > 0.7 ? this.whiteSprite : this.fireSprite, em.x - s, em.y - s, s * 2, s * 2);
      g.globalAlpha = k2;
      g.fillStyle = em.heat > 0.7 ? "#fff3d0" : em.heat > 0.35 ? "#ffb347" : "#ff7a2a";
      g.beginPath(); g.arc(em.x, em.y, em.size * 0.55 * (0.5 + k2), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;

    // --- data packets (comets)
    for (const pk of this.packets) {
      const p = this.paths[pk.e];
      const head = this.pointAt(p, pk.d);
      const steps = 8;
      for (let i = steps; i >= 1; i--) {
        const d = pk.d - (pk.trail * i) / steps;
        if (d < 0) continue;
        const q = this.pointAt(p, d);
        const t = 1 - i / steps;
        const r = 1 + t * 3.2;
        g.fillStyle = pk.hot
          ? `rgba(255,190,110,${t * t * 0.75})`
          : `rgba(120,200,255,${t * t * 0.8})`;
        g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.fill();
      }
      const s = 11;
      g.drawImage(pk.hot ? this.fireSprite : this.blueSprite, head.x - s, head.y - s, s * 2, s * 2);
      g.fillStyle = "#ffffff";
      g.beginPath(); g.arc(head.x, head.y, 2.2, 0, Math.PI * 2); g.fill();
    }

    // --- rings
    for (const r of this.rings) {
      const k2 = r.life / r.max;
      g.strokeStyle = r.orange ? `rgba(255,170,90,${(1 - k2) * 0.7})` : `rgba(120,200,255,${(1 - k2) * 0.7})`;
      g.lineWidth = 2.4 * (1 - k2) + 0.4;
      g.beginPath();
      if (r.orange) g.roundRect(r.x - r.r * k2 * 1.5, r.y - r.r * k2 * 0.7, r.r * k2 * 3, r.r * k2 * 1.4, 18);
      else g.arc(r.x, r.y, r.r * Math.pow(k2, 0.6), 0, Math.PI * 2);
      g.stroke();
    }

    g.globalCompositeOperation = "source-over";
  }

  start() {
    this.lastT = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.04, Math.max(0.001, (now - this.lastT) / 1000));
      this.lastT = now;
      this.step(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }
}
