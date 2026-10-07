/**
 * [SofiaUI voice-presence engine — reference port]
 * Ported from SofiaUI (github.com/samjuniors/SofiaUI) @ commit 9e88dee:
 *   src/sophia/ShapeGenerator.ts
 * Port status: verbatim. The SofiaUI repository remains independent;
 * this is a one-way port into SamJuniorsOS per the approved migration plan.
 */

/**
 * ShapeGenerator — produces target GEOMETRY, not animations.
 *
 * Every command ("waveform", "torus", "infinity", "helix", "hypercube",
 * "pyramid", "star", "galaxy", "heart", "shield", "matrix", "split", "merge",
 * "dissolve", "face", "letter-z", etc.) resolves to a point set in Sophia's
 * object space (unit = her radius, y up).
 *
 * The ParticleRenderer flows the particle mesh toward whatever set it is handed.
 */

import type { SophiaShape } from './types';

export type SophiaForm = 'sphere' | 'ring';

const TAU = Math.PI * 2;

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussish(rng: () => number): number {
  return (rng() + rng() + rng() - 1.5) / 1.5;
}

/** projected sphere: uniform surface distribution */
function spherePoint(rng: () => number, out: Float32Array, i: number, cx: number, cy: number, r: number) {
  const lon = rng() * TAU;
  const y = 1 - 2 * rng();
  const rxy = Math.sqrt(Math.max(0, 1 - y * y));
  out[i * 2] = cx + Math.cos(lon) * rxy * r;
  out[i * 2 + 1] = cy + y * r;
}

/** thin ring loop */
function ringPoint(rng: () => number, out: Float32Array, i: number, cx: number, cy: number, r: number) {
  const th = rng() * TAU;
  const rr = r * (1 + (rng() - 0.5) * 0.05);
  out[i * 2] = cx + Math.cos(th) * rr;
  out[i * 2 + 1] = cy + Math.sin(th) * rr;
}

function sampleForm(count: number, rng: () => number, form: SophiaForm): Float32Array {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    if (form === 'ring') ringPoint(rng, out, i, 0, 0, 1);
    else spherePoint(rng, out, i, 0, 0, 0.99);
  }
  return out;
}

/* ---------------- Audio Agent Shapes ---------------- */

/** Waveform: multi-frequency audio equalizer sine-wave ribbon */
function sampleWaveform(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const u = (i / count) * 2 - 1; // -1 to 1
    const x = u * 1.35;
    // Harmonic envelope fading towards edges
    const env = Math.pow(Math.cos((u * Math.PI) / 2), 1.2);
    const wave =
      Math.sin(u * Math.PI * 3.5) * 0.38 +
      Math.sin(u * Math.PI * 7.0 + 0.6) * 0.18 +
      Math.sin(u * Math.PI * 14.0) * 0.07;
    const thickness = (rng() - 0.5) * 0.14 * env;
    const y = (wave + thickness) * env;
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  }
  return out;
}

/**
 * Bow / smile arc — multi-layer U-curve matching the reference ribbon.
 * Several parallel arcs with slight phase offsets produce the cyan→green→
 * purple→magenta stack that reads like Deepgram's idle indicator.
 */
function sampleBow(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  // 5 parallel ribbons with vertical offsets and slight scale differences
  const layers = [
    { yOff: 0.00, scale: 1.00, weight: 0.28 },
    { yOff: 0.07, scale: 0.96, weight: 0.22 },
    { yOff: 0.14, scale: 0.92, weight: 0.18 },
    { yOff: -0.06, scale: 1.04, weight: 0.18 },
    { yOff: 0.20, scale: 0.88, weight: 0.14 },
  ];
  const cum = layers.reduce((s, l) => s + l.weight, 0);
  for (let i = 0; i < count; i++) {
    // pick layer by weighted random
    let r = rng() * cum;
    let layer = layers[0];
    for (const l of layers) {
      r -= l.weight;
      if (r <= 0) { layer = l; break; }
    }
    // parametric U-curve: t in [-1,1], deeper at center
    const t = (rng() * 2 - 1);
    const absT = Math.abs(t);
    // classic smile / hanging cable shape
    const baseY = 0.55 * (t * t) - 0.42;
    // gentle side lift so ends rise like the reference
    const endLift = Math.pow(absT, 1.6) * 0.18;
    const y = (baseY + endLift + layer.yOff) * layer.scale;
    const x = t * 1.28 * layer.scale;
    // thin ribbon thickness
    const thick = (rng() - 0.5) * 0.055 * (1 - absT * 0.35);
    out[i * 2] = x + thick * 0.4;
    out[i * 2 + 1] = y + thick;
  }
  return out;
}

/** Torus: 3D donut with tilted perspective projection */
function sampleTorus(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  const R = 0.72; // major radius
  const r = 0.32; // minor radius
  for (let i = 0; i < count; i++) {
    const u = rng() * TAU;
    const v = rng() * TAU;
    // 3D coordinates
    const x3 = (R + r * Math.cos(v)) * Math.cos(u);
    const y3 = (R + r * Math.cos(v)) * Math.sin(u);
    const z3 = r * Math.sin(v);
    // 3D tilt rotation (pitch 45°, roll 20°)
    const cosP = 0.7071, sinP = 0.7071;
    const yRot = y3 * cosP - z3 * sinP;
    const zRot = y3 * sinP + z3 * cosP;
    out[i * 2] = x3 * 1.05;
    out[i * 2 + 1] = yRot * 0.9 + zRot * 0.15;
  }
  return out;
}

/** Infinity: figure-8 Lemniscate of Bernoulli */
function sampleInfinity(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const t = rng() * TAU;
    const scale = 1.15;
    const denom = 1 + Math.sin(t) * Math.sin(t);
    const x = (scale * Math.cos(t)) / denom;
    const y = (scale * Math.sin(t) * Math.cos(t)) / denom;
    const jitter = gaussish(rng) * 0.035;
    out[i * 2] = x + jitter;
    out[i * 2 + 1] = y * 1.45 + jitter;
  }
  return out;
}

/** Helix: 3D rotating DNA double helix with cross-rungs */
function sampleHelix(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const m = rng();
    if (m < 0.78) {
      // Main 2 spiral strands
      const strand = rng() < 0.5 ? 0 : Math.PI;
      const t = (rng() * 2 - 1) * 3.8; // vertical range
      const r = 0.48;
      const x = Math.cos(t * 1.8 + strand) * r;
      const y = t * 0.28;
      out[i * 2] = x + gaussish(rng) * 0.02;
      out[i * 2 + 1] = y + gaussish(rng) * 0.02;
    } else {
      // Cross rungs connecting the strands
      const step = Math.floor(rng() * 12) - 6;
      const t = (step / 6) * 3.0;
      const frac = rng(); // 0 to 1 between strand 1 and 2
      const x1 = Math.cos(t * 1.8) * 0.48;
      const x2 = Math.cos(t * 1.8 + Math.PI) * 0.48;
      const x = x1 + (x2 - x1) * frac;
      const y = t * 0.28;
      out[i * 2] = x + gaussish(rng) * 0.015;
      out[i * 2 + 1] = y + gaussish(rng) * 0.015;
    }
  }
  return out;
}

/** Hypercube: 3D rotating tesseract / concentric wireframe cubes */
function sampleHypercube(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  // Cube edges definition
  const outerSize = 0.78;
  const innerSize = 0.42;

  // 12 edges per cube, plus 8 connecting struts
  for (let i = 0; i < count; i++) {
    const m = rng();
    let p3 = [0, 0, 0];
    if (m < 0.48) {
      // Outer cube
      p3 = sampleCubeEdge(rng, outerSize);
    } else if (m < 0.82) {
      // Inner cube
      p3 = sampleCubeEdge(rng, innerSize);
    } else {
      // Diagonal connector struts
      const corner = Math.floor(rng() * 8);
      const cx = (corner & 1 ? 1 : -1);
      const cy = (corner & 2 ? 1 : -1);
      const cz = (corner & 4 ? 1 : -1);
      const t = rng();
      const s = innerSize + (outerSize - innerSize) * t;
      p3 = [cx * s, cy * s, cz * s];
    }
    // Isometric 3D projection
    const x = (p3[0] - p3[2]) * 0.7071;
    const y = (p3[0] + 2 * p3[1] + p3[2]) * 0.4082;
    out[i * 2] = x + gaussish(rng) * 0.015;
    out[i * 2 + 1] = y + gaussish(rng) * 0.015;
  }
  return out;
}

function sampleCubeEdge(rng: () => number, s: number): [number, number, number] {
  const edge = Math.floor(rng() * 12);
  const t = rng() * 2 - 1; // -1 to 1
  const xSign = (edge & 1) ? 1 : -1;
  const ySign = (edge & 2) ? 1 : -1;
  const axis = Math.floor(edge / 4); // 0 = x variable, 1 = y variable, 2 = z variable
  if (axis === 0) return [t * s, xSign * s, ySign * s];
  if (axis === 1) return [xSign * s, t * s, ySign * s];
  return [xSign * s, ySign * s, t * s];
}

/** Pyramid: 3D Sacred Geometry tetrahedron / pyramid */
function samplePyramid(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  const apex = [0, 0.82, 0];
  const base = [
    [-0.75, -0.55, -0.6],
    [0.75, -0.55, -0.6],
    [0.85, -0.45, 0.6],
    [-0.85, -0.45, 0.6],
  ];
  for (let i = 0; i < count; i++) {
    const m = rng();
    let pt = [0, 0, 0];
    if (m < 0.52) {
      // 4 edges to apex
      const k = Math.floor(rng() * 4);
      const b = base[k];
      const t = rng();
      pt = [apex[0] * t + b[0] * (1 - t), apex[1] * t + b[1] * (1 - t), apex[2] * t + b[2] * (1 - t)];
    } else {
      // 4 base edges
      const k = Math.floor(rng() * 4);
      const b1 = base[k];
      const b2 = base[(k + 1) % 4];
      const t = rng();
      pt = [b1[0] * t + b2[0] * (1 - t), b1[1] * t + b2[1] * (1 - t), b1[2] * t + b2[2] * (1 - t)];
    }
    // Perspective project
    const x = pt[0] * 1.05;
    const y = pt[1] + pt[2] * 0.18;
    out[i * 2] = x + gaussish(rng) * 0.015;
    out[i * 2 + 1] = y + gaussish(rng) * 0.015;
  }
  return out;
}

/** Star: celestial radiant starburst */
function sampleStar(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  const points = 5;
  for (let i = 0; i < count; i++) {
    const m = rng();
    if (m < 0.65) {
      // Star perimeter
      const seg = Math.floor(rng() * (points * 2));
      const t = rng();
      const a1 = (seg * Math.PI) / points - Math.PI / 2;
      const a2 = ((seg + 1) * Math.PI) / points - Math.PI / 2;
      const r1 = seg % 2 === 0 ? 0.95 : 0.42;
      const r2 = seg % 2 === 0 ? 0.42 : 0.95;
      const x1 = Math.cos(a1) * r1, y1 = Math.sin(a1) * r1;
      const x2 = Math.cos(a2) * r2, y2 = Math.sin(a2) * r2;
      out[i * 2] = x1 + (x2 - x1) * t + gaussish(rng) * 0.02;
      out[i * 2 + 1] = y1 + (y2 - y1) * t + gaussish(rng) * 0.02;
    } else {
      // Radiant interior stardust
      const th = rng() * TAU;
      const r = Math.pow(rng(), 0.7) * 0.45;
      out[i * 2] = Math.cos(th) * r;
      out[i * 2 + 1] = Math.sin(th) * r;
    }
  }
  return out;
}

/** Galaxy: logarithmic cosmic spiral galaxy with dual arms and nucleus */
function sampleGalaxy(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const m = rng();
    if (m < 0.22) {
      // Galactic core nucleus
      const th = rng() * TAU;
      const r = Math.pow(rng(), 0.6) * 0.25;
      out[i * 2] = Math.cos(th) * r;
      out[i * 2 + 1] = Math.sin(th) * r * 0.85;
    } else {
      // Two spiral arms: r = a * exp(b * theta)
      const arm = rng() < 0.5 ? 0 : Math.PI;
      const theta = rng() * Math.PI * 3.2; // multiple rotations
      const r = 0.18 + Math.pow(theta / (Math.PI * 3.2), 0.85) * 0.82;
      const spread = (rng() - 0.5) * 0.18 * (r + 0.2);
      const th = theta + arm + spread;
      out[i * 2] = Math.cos(th) * r;
      out[i * 2 + 1] = Math.sin(th) * r * 0.72; // tilted perspective
    }
  }
  return out;
}

/** Heart: mathematical cardioid parametric curve */
function sampleHeart(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const t = rng() * TAU;
    // Cardioid heart formula
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const s = 0.055;
    const jitter = (rng() - 0.5) * 0.04;
    out[i * 2] = x * s + jitter;
    out[i * 2 + 1] = (y * s + 0.12) + jitter;
  }
  return out;
}

/** Shield: cybernetic aegis security contour */
function sampleShield(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const t = rng() * TAU;
    const side = Math.cos(t) >= 0 ? 1 : -1;
    const u = Math.abs(Math.cos(t));
    const v = Math.sin(t);
    // Shield boundary curves
    let x = 0, y = 0;
    if (v >= 0.3) {
      // Top flat arch
      x = side * u * 0.72;
      y = 0.72 - Math.pow(u, 2) * 0.15;
    } else {
      // Bottom converging pointed V
      const prog = (0.3 - v) / 1.3;
      x = side * (0.72 * (1 - Math.pow(prog, 0.85)));
      y = 0.3 - prog * 1.25;
    }
    const fill = rng() < 0.25 ? rng() : 1.0;
    out[i * 2] = x * fill + gaussish(rng) * 0.02;
    out[i * 2 + 1] = y * fill + gaussish(rng) * 0.02;
  }
  return out;
}

/** Matrix: computational quantum square lattice */
function sampleMatrix(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  const grid = 14;
  for (let i = 0; i < count; i++) {
    const gx = Math.floor(rng() * grid);
    const gy = Math.floor(rng() * grid);
    const x = ((gx + 0.5) / grid) * 1.6 - 0.8;
    const y = ((gy + 0.5) / grid) * 1.6 - 0.8;
    // Connective lines or node cluster
    const isLine = rng() < 0.45;
    const t = rng() * (1.6 / grid);
    const dir = rng() < 0.5;
    out[i * 2] = x + (isLine ? (dir ? t : 0) : gaussish(rng) * 0.02);
    out[i * 2 + 1] = y + (isLine ? (!dir ? t : 0) : gaussish(rng) * 0.02);
  }
  return out;
}

function sampleSplit(count: number, rng: () => number, form: SophiaForm): Float32Array {
  const out = new Float32Array(count * 2);
  const centers: Array<[number, number]> = [
    [-0.66, 0.04],
    [0.66, -0.04],
  ];
  for (let i = 0; i < count; i++) {
    const c = centers[i & 1];
    if (form === 'ring') ringPoint(rng, out, i, c[0], c[1], 0.5);
    else spherePoint(rng, out, i, c[0], c[1], 0.5);
  }
  return out;
}

function sampleDissolve(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const th = rng() * TAU;
    const d = Math.sqrt(rng()) * 2.2 + 0.1 * Math.abs(gaussish(rng));
    out[i * 2] = Math.cos(th) * d * 1.15 + gaussish(rng) * 0.15;
    out[i * 2 + 1] = Math.sin(th) * d + gaussish(rng) * 0.15;
  }
  return out;
}

const FACE_MESH = new Float32Array([0,-0.2728833416472518,0.3275972117087446,0,-0.05351271735160446,0.4715735739893834,0,-0.14610574624984912,0.3351766522752474,-0.04464594595145381,0.1468691756812111,0.39054198275973334,0,0.010357734740638593,0.482253309849061,0,0.0901207608922333,0.449176500337727,0,0.2929435494370953,0.30922794284975463,-0.4092937362115568,0.3029895801656097,0.06778243849077813,0,0.44170181118128815,0.26073886638759375,0,0.5251311848024438,0.27040987070818967,0,0.85,0.18344040947048532,0,-0.3017929023666703,0.3165703574879271,0,-0.32214556723982507,0.2881335975747964,0,-0.32947239186565913,0.2544564763537894,0,-0.38220551236569883,0.2722860613288668,0,-0.4017581786427473,0.28428681014761487,0,-0.4281255087699197,0.2912148384084466,0,-0.4613799674341964,0.2848626782576955,0,-0.5368761419372691,0.2402031632214287,0,-0.0895266081997804,0.4366011344592711,-0.04004381280301175,-0.08619246272152929,0.37264946032743784,-0.682107307741862,0.5779468746270908,-0.2382516208744491,-0.2529661385384879,0.25085465421307346,0.12248403863515273,-0.30779332489336636,0.2460349345344021,0.11755980813302755,-0.36330031277391495,0.2511918604058747,0.10305166566318465,-0.4297665019205038,0.28810246566744163,0.05579795332687697,-0.20827958156723891,0.2656718061250068,0.12284020305283463,-0.30874277589170457,0.36518410593147327,0.14824614908580483,-0.25731248000300705,0.36339520013296234,0.14597318302765055,-0.3604173153070372,0.3595409064035438,0.1344448500766141,-0.40043408617506693,0.34931915121496804,0.1101114391517403,-0.4871403456612554,0.24108876253343023,0.019317805628209575,-0.21813112208009938,-0.6596854055520369,0.17461347921297724,-0.42784565842498073,0.31129896050734,0.05755462051962633,-0.6942877266410781,0.2727106004611564,-0.2407989519028306,-0.5581410150015091,0.2810384578545471,-0.0357316827544574,-0.27378169204959185,-0.014441740565438515,0.1787821715245538,-0.06846632998882092,-0.265468558556743,0.3177367213739861,-0.05832137004620848,-0.3227480923463115,0.276151710746285,-0.13777095996208583,-0.2819822310088855,0.2810852760088844,-0.18428068226513253,-0.3110636668026028,0.23611877245805246,-0.1088455205263967,-0.3274996778969854,0.2515854119827756,-0.1504674852574186,-0.33797250927192485,0.2181549401545053,-0.25503258505048015,-0.42659364570570446,0.15523865455815955,-0.04109690851300719,-0.05036286121673647,0.4604993723236862,-0.04777049237493289,0.009155860270919788,0.4681816877246937,-0.5055501293053964,0.4284733970082121,0.07581389318045084,-0.16539829028399183,0.14872188504873665,0.19083353976607967,-0.15480641665434486,-0.035771956952998306,0.3116882777599021,-0.1589090920000933,-0.003855929718367594,0.2892777312580766,-0.45860629252297574,-0.012583064649980996,0.09231553630208533,-0.04602960766381004,0.08339367056820784,0.43552494243470025,-0.3594329311329037,0.4887786442418058,0.1900728049047515,-0.44158257645729254,0.46893573427825946,0.14176590062380431,-0.6042891837468064,0.6915639975101268,-0.11062234887707754,-0.11749682255848745,0.4535505092624147,0.24353894468862888,-0.21108963317391594,0.35328863781333153,0.1371553950613287,-0.2985816485288893,-0.363977131025619,0.14632944367997658,-0.6466662054951566,-0.40590281229330777,-0.4158065601005731,-0.11488722771539633,-0.07082821685809056,0.304331524159764,-0.07022877126021418,-0.09843957222908191,0.31351817951678435,-0.23637211015855164,-0.3629798514091809,0.16441953583653604,-0.2121803566297405,-0.35931206041995895,0.15273809356679335,-0.47981573443223485,0.5170938597994832,0.11323165501623651,-0.15323384633569045,-0.06610444311955126,0.277309028575802,-0.25449713549090647,0.4903592020359175,0.22578596249022656,-0.2656357181334827,0.5458208633991118,0.2348734961638607,-0.33912742123534034,0.8253829855790688,0.11103615784655396,-0.538891199149331,0.6049569559419684,0.014329579087781635,-0.29485640545716096,0.6868212655467067,0.18810259303682347,-0.5505553191831423,0.4643691117134771,0.024587518502525565,-0.6134374414808451,0.5154702851194748,-0.0946626992708131,-0.0647397396320757,-0.2999841722314821,0.3043370095344756,-0.12150201220979875,-0.3095763603785893,0.27353951756780415,-0.16673162127750243,-0.3254623904821446,0.23339042406418603,-0.10043288041158538,-0.08605042038689042,0.2970858253388761,-0.22338312777990751,-0.36167567951282165,0.1619436109140502,-0.19793984270504036,-0.37597634009006203,0.18722705024512667,-0.20720127238049865,-0.35659959074236314,0.14076592643733235,-0.09112208236372212,-0.04469608420101129,0.37886785432293946,-0.14138139510344547,-0.33350606697161345,0.19531316621262784,-0.09857699530080573,-0.3290311560226244,0.22628003115285258,-0.05133367630605696,-0.3293555630077651,0.24663452448424455,-0.07407373022915846,-0.531657337189663,0.23197615973501737,-0.06732633439523544,-0.45432856635967434,0.2764770800778663,-0.06444709007947623,-0.42140861931816503,0.28237703363615924,-0.06071895996842598,-0.39690063874895865,0.2765797624430829,-0.056125776641881904,-0.37985565482693723,0.266041876448756,-0.147929007816291,-0.370734920201101,0.20884010025159133,-0.15547669095025257,-0.3758099503904749,0.21539964606030088,-0.16639480002327744,-0.3895462910149223,0.21932900281208953,-0.1769393262080448,-0.4097619177549295,0.21637209713857047,-0.22790769580523376,-0.2439968772424087,0.2206409697146179,-0.7258251667859599,-0.046046544961165344,-0.4818158271571448,0,-0.11097808023886115,0.387443900863372,-0.17578354813283278,-0.36845656500287904,0.17549970405016524,-0.18569032733138616,-0.36964025112486976,0.18493368244243075,-0.05749461821905224,-0.1388556206353343,0.3167177889626336,-0.13527001403214328,-0.11003430708452276,0.2565356258387982,-0.06375054372573896,-0.1201509740417803,0.3164582441275922,-0.22541425617752825,0.10999831532764275,0.16542220459304183,-0.3202038408265401,0.06502218831240439,0.14805733671415072,-0.16611783671766045,-0.033524781779453276,0.25964092533346433,-0.4939920598493441,0.7753049789087625,0.008188172807531426,-0.43677450117055294,0.6631247354962503,0.10663448146169784,-0.38364537511018865,0.5466403976279631,0.18197571818782693,-0.20879847876803354,-0.4686273984786774,0.18097093226915176,-0.13430834123400892,0.5372552102002383,0.2637479312381957,-0.15585200606210325,0.6900040339298448,0.2257423681964654,-0.18201810954853725,0.8475555438061231,0.1635642985547368,-0.40378439907352076,0.27003489241759315,0.07696293483057837,-0.5517461266687936,0.19078883877391176,-0.013822230044274728,-0.1789855634447836,0.2816361712288304,0.1220086394934752,-0.48007730019480155,0.3508189681427099,0.04893546085865308,-0.1254190509271472,0.19124258512067485,0.21707980671101912,-0.12565906012944353,-0.009813912767031306,0.36959901457988825,-0.6221733337650683,0.14511404824276675,-0.08521418944729385,-0.5060651771204284,0.14595051976897347,0.03839334053998731,-0.4265444698025876,0.12442138637213282,0.09115908458436485,-0.3176398612047355,0.13785044977808295,0.12485747366171009,-0.23386731484284656,0.16381946471347325,0.14085657947204092,-0.17521739972180264,0.19619876552462936,0.15866855350725462,-0.05420137246452847,0.27701074929652475,0.2878794418798226,-0.609949128102803,0.00399575865619303,-0.06680430956850875,-0.5377301281686955,0.36365830564983403,0.010824713350960505,-0.02334883428145214,-0.0858467878800504,0.43268390327263456,-0.15505816648321702,0.08758565166364794,0.22327058136367434,-0.7451539912809149,0.28252557180927246,-0.4408050486505752,-0.13387605521287216,0.23306568025779112,0.1803093190912098,-0.17185524996212884,-0.03921407770188951,0.21894473787834082,-0.44950807680385046,0.3113441907900502,0.048956343776415,-0.1283741281424291,0.027623095997567206,0.3389086317720602,-0.6997119923537612,-0.22327563368248768,-0.464602721311943,-0.17865307274954154,0.3037208672258541,0.11380203775160548,-0.0888619155132284,0.06196317768153309,0.3942336399406832,-0.4812299025267594,-0.5354811245369132,-0.06571223882766729,-0.48937972582863126,-0.635898318701516,-0.17905855742230636,-0.6889718211376111,-0.023194473912373014,-0.25477164481309983,-0.5623039332344418,-0.45011089061426907,-0.15890894764812719,-0.6589434364463014,0.407430152329252,-0.17809775073596856,-0.23220861451775462,-0.7398570440023287,0.14857248076382687,-0.01731347857896075,-0.10769272572515066,0.38474076594625034,-0.20244449015904528,0.039153449876129044,0.19158032060401842,-0.6166303145016098,0.2701134198871496,-0.09763134557090805,-0.35318836131421655,0.2820592187241369,0.10199654902566387,-0.30575536383601704,0.27571851049602963,0.1155150144159497,-0.21134292275709313,-0.38758714613106154,0.18327209507801687,-0.6000117462874373,-0.13219079412601847,-0.08774814386015042,-0.1244240809421666,-0.8396588176181405,0.14615217946561018,-0.3089758561996282,-0.7662662361996689,0.021811052786626997,-0.39157164533389915,-0.7142832647501103,-0.06257537436974797,0,0.6848240117437967,0.2359629685693124,0,-0.85,0.16255335361884152,-0.2621462499397118,0.27779111602524204,0.1156542659459107,-0.2202291335553448,0.2857871563658991,0.10799899247988527,-0.19230674781473767,0.29518504676664054,0.10718532856432177,-0.5899222174998058,0.38205740724848397,-0.05166265443679069,-0.2202291335553448,0.3327124198620154,0.11545024850049442,-0.2621462499397118,0.3399594659679201,0.12475960302869675,-0.30575536383601704,0.34018330775001365,0.12526060058569538,-0.35318836131421655,0.3366782495439044,0.11057057463857098,-0.3867082351268225,0.32990746869147375,0.08734511317080926,-0.72713078220198,0.45014822965616613,-0.3432952955524423,-0.3867082351268225,0.2939482391211264,0.08329507817536397,0,-0.18776774459280177,0.32305089465385983,-0.1709336107759252,-0.2033578531658594,0.2538438466096762,-0.11762154265719477,-0.05886134263405315,0.3249948344639583,-0.07039496849051319,-0.18918605077702114,0.311798947600576,0,0.36971685390154496,0.2560475237241041,-0.39795642902898787,-0.618388232744732,0.009297565784304436,-0.3187109527931709,-0.6823050699354141,0.07771972407149988,-0.12642354814189016,-0.7765361087102769,0.20470066327181033,0.5716842126953195,-0.5439979867712461,-0.3086076143341162,0.19230674781473767,0.3189830081319407,0.11246687829985764,0.08675043118781402,0.17397221966225493,0.3059202618986212,0.22220357974761162,-0.8086978229912036,0.09947905073694227,0.6692305349581967,-0.17986668784583618,-0.26046094073553605,0.10574445535606931,-0.3741591413061962,0.24495282407922123,0.11366504773577997,-0.3858235500439396,0.2515773282726742,0.12085319823951739,-0.4058312137181239,0.25614722281535474,0.12751908332991796,-0.43649214872486825,0.25306376858489105,0.14881609876527555,-0.5050963829586333,0.2100356232348019,0.18801882077916549,-0.3477046225915016,0.1786458070339147,0.20380592166862269,-0.34320093748393726,0.19051952612249787,0.21992878523122014,-0.3349346702627477,0.19315077376050344,0.27428413312625144,-0.2978385246074249,0.18377328510430369,0.5079782256097823,-0.16053305161867804,0.027510357112045896,0.09110620364745152,0.23851063641894812,0.252271661229598,0.1264689708938885,0.3537308360028069,0.15936914171604263,0.17129766643442038,0.33016181685573565,0.1257015477247979,0.17756350410944574,-0.3395235230303089,0.16089542317090214,0.5231495210118722,-0.3329412658456002,-0.044797659867821124,0.07375846553520388,0.3611619789828066,0.22000168297409886,0.1865620207373204,-0.58160465721333,0.18724648964322765,0.04971221878821788,0.20732522260205347,0.34384700876686286,0.11998679773900667,0.07709328465596342,0.2988739612602345,0.09602552618272943,-0.6120639806407596,0.23136920783490392,0.3164971710411162,-0.4630535841291183,0.11744432656015039,0.22245898649295825,-0.09579552538341579,0.19388668008366303,0.25793290475328945,-0.5332137400881146,0.14635321363706044,0.3688604618040169,-0.09301328558887335,0.15035455390260916,0.2850335428682317,-0.16392753621875739,0.179534052798628,0.4221718562802389,-0.20329433830077692,0.1028295561046843,0.11714595104622909,-0.6990162158771764,0.2303789533474825,0.1484298129040015,0.04176169743420326,0.25267863753934583,0.3732342301420944,-0.5264962732284956,0.07080199291758307,0.2967912029760733,-0.6004119861721006,0.11921918210062792,0.360622102629606,-0.3784663152705812,0.11077536196113977,0.5864663351968133,-0.253596667926397,-0.10603850031100771,0.4416203004377657,-0.4001365286556201,0.039250694983955996,0.6335348920779414,-0.3243558845446935,-0.24107630014702386,0.33610719316602694,-0.2526178653616192,0.14962961832887298,0.12082673371239971,0.13214373538507104,0.26293176522188655,0.10837194984295638,-0.0349141213358093,0.38141913097172764,0.13887708096096066,-0.055043714304023106,0.3204392788832434,0.08882871456102623,0.004018566266836269,0.426133403520467,0.16892894690542215,0.3945540531880952,0.1686357680622804,0.25334626538254174,0.41232965052785264,0.17219000217150643,0.32604894063771644,0.41311377040768843,0.16683925972688832,0.3922298902992988,0.4086327966761233,0.14441995587245315,0.4448840983912058,0.3893163864502527,0.1030638874629808,0.4977020016126662,0.2989580222218247,0.009191418971901526,0.7022560514042445,0.12837432061171722,-0.2525317834725037,0.45295991725179213,0.21381413218201978,0.051406189110359435,0.39183975505226215,0.19705207811354739,0.08676395215530507,0.3146696751503355,0.19645908023682326,0.11130388262634082,0.24323999176684316,0.21057208325813823,0.1241511113742783,0.18966828257842727,0.23378330199857847,0.133422164514143,0.15200675838922678,0.2568253402347537,0.14527961994787936,0.7375598268138702,0.11970935326016933,-0.482253309849061,0.13444374337820736,-0.07403706482976995,0.29399890666122624,0.08515206998455038,0.11832434426279621,0.3520143467739543,0.07382130675777786,-0.038227768834874686,0.43330375061505255,0.044288434248755004,-0.07345648122213014,0.40534903003403994,0.072042986770114,-0.04784728762089618,0.4063937533300017,0.11898528379822969,-0.09765583728782241,0.2795744883317192,0.03727225505396046,-0.08075915095230406,0.42173374806313624,0.03078786850226514,-0.09980793263303192,0.3785216020735962,0.15778949815104942,0.30093516298412537,0.12398674260221647,0.12083654964609425,0.2923554595272184,0.1567126806012922,0.09925275497142509,0.2842254605620239,0.19636606945333515,0.4092937362115568,0.3217216536327219,0.07120868052339872,0.43594293761119346,0.3349735490589497,0.07355488114568588]);

const sampleFace = (count: number, rng: () => number): Float32Array => {
  const out = new Float32Array(count * 2);
  const meshLen = FACE_MESH.length;
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * (meshLen / 3)) * 3;
    const x = FACE_MESH[idx];
    const y = FACE_MESH[idx + 1];
    out[i * 2] = x * 1.1;
    out[i * 2 + 1] = y * 1.1;
  }
  return out;
};


/** Glyphs: rasterize once, sample the alpha mask with extra weight on edges. */
function sampleGlyph(ch: string, count: number, rng: () => number): Float32Array {
  const S = 512;
  const out = new Float32Array(count * 2);
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return sampleForm(count, rng, 'ring');
  ctx.fillStyle = '#fff';
  ctx.font = '400 400px Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, S / 2, S / 2 + 14);
  const img = ctx.getImageData(0, 0, S, S).data;
  const alpha = (x: number, y: number) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : img[(y * S + x) * 4 + 3]);
  const cand: number[] = [];
  for (let y = 0; y < S; y += 2) {
    for (let x = 0; x < S; x += 2) {
      if (alpha(x, y) <= 96) continue;
      const edge = alpha(x - 3, y) <= 96 || alpha(x + 3, y) <= 96 || alpha(x, y - 3) <= 96 || alpha(x, y + 3) <= 96;
      const reps = edge ? 3 : 1;
      for (let k = 0; k < reps; k++) cand.push(x, y);
    }
  }
  const n = cand.length / 2;
  if (n === 0) return sampleForm(count, rng, 'ring');
  for (let i = 0; i < count; i++) {
    const k = Math.floor(rng() * n) * 2;
    const x = ((cand[k] + rng() * 2 - S / 2) / (S / 2)) * 1.45;
    const y = (-(cand[k + 1] + rng() * 2 - S / 2) / (S / 2)) * 1.45;
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  }
  return out;
}

/** Liquid: fluid, blobby, undulating form with shifting centers of mass.
 * Uses a sum of low-frequency sine waves and noise to simulate viscosity. */
function sampleLiquid(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  const time = performance.now() * 0.001;
  for (let i = 0; i < count; i++) {
    const th = rng() * TAU;
    // Base radius with slow undulating noise
    const noise = Math.sin(th * 3 + time) * 0.1 + Math.cos(th * 5 - time * 0.8) * 0.05;
    const r = 0.8 + noise;
    // Add "droplets" or protrusions by modulating radius with sharp peaks
    const droplet = Math.pow(Math.abs(Math.sin(th * 2.1 + time * 0.5)), 4) * 0.2;
    const finalR = r + droplet;
    out[i * 2] = Math.cos(th) * finalR;
    out[i * 2 + 1] = Math.sin(th) * finalR;
  }
  return out;
}

function sampleSpiky(count: number, rng: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const th = rng() * TAU;
    const rBase = 0.85;
    // create sharp spikes by modulating radius with high-frequency noise
    const spike = Math.sin(th * 8) * 0.2 + Math.cos(th * 14) * 0.1 + (rng() - 0.5) * 0.2;
    const r = rBase + spike;
    out[i * 2] = Math.cos(th) * r;
    out[i * 2 + 1] = Math.sin(th) * r;
  }
  return out;
}

export const ShapeGenerator = {
  /** `count` target points (object space, y up) for a shape, relative to the live form. */
  createTargets(shape: SophiaShape, count: number, form: SophiaForm = 'sphere'): Float32Array {
    const rng = mulberry32(1337 + shape.length * 97 + (shape === 'dissolve' ? performance.now() | 0 : 0));
    switch (shape) {
      case 'organic':
      case 'merge':
        return sampleForm(count, rng, form);
      case 'circle':
        return sampleForm(count, rng, 'ring');
      case 'waveform':
        return sampleWaveform(count, rng);
      case 'bow':
        return sampleBow(count, rng);
      case 'torus':
        return sampleTorus(count, rng);
      case 'infinity':
        return sampleInfinity(count, rng);
      case 'helix':
        return sampleHelix(count, rng);
      case 'hypercube':
        return sampleHypercube(count, rng);
      case 'pyramid':
        return samplePyramid(count, rng);
      case 'star':
        return sampleStar(count, rng);
      case 'galaxy':
        return sampleGalaxy(count, rng);
      case 'heart':
        return sampleHeart(count, rng);
      case 'shield':
        return sampleShield(count, rng);
      case 'matrix':
        return sampleMatrix(count, rng);
      case 'split':
        return sampleSplit(count, rng, form);
      case 'dissolve':
        return sampleDissolve(count, rng);
      case 'face':
        return sampleFace(count, rng);
      case 'spiky':
        return sampleSpiky(count, rng);
      case 'liquid':
        return sampleLiquid(count, rng);
      case 'letter-z':
        return sampleGlyph('Z', count, rng);
      case 'letter-s':
        return sampleGlyph('S', count, rng);
      case 'letter-a':
        return sampleGlyph('A', count, rng);
      case 'letter-o':
        return sampleGlyph('O', count, rng);
      default:
        return sampleForm(count, rng, form);
    }
  },
};