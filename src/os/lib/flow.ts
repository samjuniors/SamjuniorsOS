/**
 * FlowEngine — SamJuniorsOS company-context canvas & kinetics.
 *
 * Implements the FROZEN canonical execution language
 * (src/components/workflow/execution-language.ts — Phase 4.3C):
 *
 *   §1 CALM BASELINE      idle = thin neutral gray/white lines, strictly
 *                         static. No particles, dashes, sparks, glow, or
 *                         continuous motion. A clean technical schematic.
 *   §2 REAL STATE ONLY    comets/fills/arrivals are driven exclusively by
 *                         authoritative runtime state (via setGraph).
 *                         Clicks never fabricate execution.
 *   §3 STATE COLOR        blue/cyan=running · amber=external action ·
 *                         green=settled · red=blocked · STATIC amber=
 *                         governance. Energy color is NEVER agent identity
 *                         (identity lives in the React card layer).
 *   §4 EXECUTION          source fills → connection progressively fills →
 *                         directional comet travels the EXACT routed edge
 *                         path → target activates briefly → settles → the
 *                         next authoritative relationship may activate.
 *   §5 ROUTING            deterministic obstacle-aware orthogonal routing;
 *                         avoids lines through nodes and accidental
 *                         crossings; unavoidable crossings are deliberate
 *                         (line hops); grid-snapped lanes, minimal bends.
 *   §6 HIERARCHY          the strongest effect exists only where real
 *                         execution happens.
 *   §7 RESTRAINT          no sparks, no ember bursts, no dual shockwaves,
 *                         no marching dashes, no constant glow.
 *
 * Phase 4.3B.1 spatial grammar (unchanged): semantic regions (company /
 * active work / related / governed outcomes), work objects first-class,
 * agents as workforce metadata, edge layers separate structural / ownership /
 * governance truth from orchestration plumbing (delegates = inspector-only).
 * All positions are deterministic functions of authoritative GraphDTO state.
 */

import type { GraphDTO, GraphNodeDTO, GraphEdgeDTO } from "@/types/graph";
import {
  EXECUTION_LANGUAGE,
  CONDUIT_LANGUAGE,
  ARRIVAL_LANGUAGE,
  CANVAS_CHROME,
  MOTION_TOKENS,
  tokenRgbParts,
  type ConduitKey,
  type ExecutionPerimeterSpec,
} from "@/lib/tokens";

const RUNNING = EXECUTION_LANGUAGE.running;
const EXTERNAL = EXECUTION_LANGUAGE.externalAction;
const BLOCKED = EXECUTION_LANGUAGE.blocked;

export const DESIGN_W = 1600;
export const DESIGN_H = 900;

export type NodeKind = "card" | "core" | "round";
export type GraphNodeType = "founder" | "agent" | "workflow" | "verification" | "approval" | "outcome";
export type GraphNodeState = "idle" | "active" | "processing" | "waiting" | "blocked" | "complete";
export type GraphRelationship =
  | "delegates"
  | "researches"
  | "models_finance"
  | "authors_prd"
  | "checks"
  | "synthesizes"
  | "escalates-to"
  | "feeds"
  | "depends-on";

export type EdgeStyle = "white" | "blue" | "cyan" | "amber" | "emerald" | "rose";

/**
 * Phase 4.3B.1 — semantic edge layer. Determines default canvas visibility:
 *  - structural:  company structure truth (e.g. verifier feeds vault) — drawn faint
 *  - ownership:   agent↔work execution metadata — drawn when live or focused
 *  - governance:  authority escalation (approval gates) — always drawn (amber)
 *  - context:     orchestration plumbing (delegates) — inspector-only, never drawn
 */
export type FlowEdgeLayer = "structural" | "ownership" | "governance" | "context";

export type FlowNode = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: NodeKind;
  type: GraphNodeType;
  state: GraphNodeState;
  title: string;
  subtitle?: string;
  activity?: string;
  protocolStep?: string;
  relevance?: number;
  owner?: string;
  tint?: string;
  glow?: string;
  dtoNode?: GraphNodeDTO;
};

export type FlowEdge = {
  id: string;
  from: string;
  to: string;
  pts: [number, number][];
  style: EdgeStyle;
  arrow?: boolean;
  relationship: GraphRelationship;
  state: GraphNodeState;
  activity?: string;
  layer?: FlowEdgeLayer;
  dtoEdge?: GraphEdgeDTO;
};

export type SpatialCard = {
  id: string;
  nodeId: string;
  x: number;
  y: number;
  actor: string;
  action: string;
  target?: string;
  tone: "cyan" | "amber" | "emerald" | "rose";
};

export type GraphModel = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  spatialCards: SpatialCard[];
};

// ---------------------------------------------------------------------------
// Phase 4.3B.1 — Semantic Spatial Regions (deterministic, stable)
// ---------------------------------------------------------------------------

/** The three work regions of the company spatial context. */
export type WorkZone = "active" | "related" | "outcomes";

/** Region zone rectangles (center + size) for canvas chrome. */
export const REGIONS = {
  company: { x: 800, y: 240, w: 920, h: 252, label: "COMPANY CONTEXT" },
  active: { x: 850, y: 646, w: 900, h: 468, label: "ACTIVE WORK" },
  related: { x: 253, y: 640, w: 266, h: 456, label: "RELATED · DEPENDENCIES" },
  outcomes: { x: 1485, y: 600, w: 306, h: 552, label: "GOVERNED OUTCOMES" },
} as const;

const WORK_CARD = { w: 240, h: 104 };

/** Company-band anchors: identity, authority, invariants, workforce metadata. */
function placeCompanyNode(
  which: "founder" | "approval" | "coo" | "researcher" | "finance" | "pm" | "verifier" | "vault"
): { x: number; y: number; w: number; h: number; kind: NodeKind } {
  switch (which) {
    case "founder":
      return { x: 430, y: 190, w: 76, h: 76, kind: "round" };
    case "approval":
      return { x: 430, y: 318, w: 68, h: 68, kind: "card" };
    case "coo":
      return { x: 620, y: 255, w: 64, h: 64, kind: "core" };
    case "researcher":
      return { x: 745, y: 255, w: 54, h: 54, kind: "round" };
    case "finance":
      return { x: 855, y: 255, w: 54, h: 54, kind: "round" };
    case "pm":
      return { x: 965, y: 255, w: 54, h: 54, kind: "round" };
    case "verifier":
      return { x: 1160, y: 190, w: 68, h: 68, kind: "round" };
    case "vault":
      return { x: 1450, y: 372, w: 124, h: 74, kind: "card" };
  }
}

/** Deterministic collision-free placement of work cards within a zone. */
function placeWorkCard(index: number, zone: WorkZone): { x: number; y: number; w: number; h: number; kind: NodeKind } {
  if (zone === "active") {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return { x: 560 + col * 300, y: 478 + row * 170, w: WORK_CARD.w, h: WORK_CARD.h, kind: "card" };
  }
  if (zone === "related") {
    return { x: 252, y: 478 + Math.min(index, 2) * 150, w: 216, h: 96, kind: "card" };
  }
  return { x: 1450, y: 500 + Math.min(index, 2) * 160, w: WORK_CARD.w, h: WORK_CARD.h, kind: "card" };
}

const isWorkDtoNode = (n: GraphNodeDTO): boolean =>
  n.type === "workflow" || n.id.startsWith("step-") || n.id.startsWith("ws-") || n.id.startsWith("wf-");

/** Resolves which semantic work zone a node belongs to from authoritative state. */
function resolveWorkZone(n: GraphNodeDTO | FlowNode): WorkZone {
  const runtime = (n as GraphNodeDTO).runtimeState ?? (n as FlowNode).dtoNode?.runtimeState;
  const clientState = (n as FlowNode).state;
  const effective: string = runtime ?? clientState ?? "idle";
  if (effective === "completed" || effective === "complete" || effective === "done") return "outcomes";
  if (effective === "paused" || effective === "idle" || effective === "waiting") return "related";
  return "active"; // running | failed | halted | processing | active | blocked
}

/**
 * Computes deterministic semantic-region positions for authoritative GraphDTO
 * nodes across the 1600x900 company-context canvas. The DTO geometry stays
 * the server's canonical projection; these positions are the client's
 * spatial view-model (a pure function of DTO state — no fabrication).
 */
function computeSpatialNode(
  n: GraphNodeDTO,
  allNodes: GraphNodeDTO[],
  _edges: GraphEdgeDTO[]
): { x: number; y: number; w: number; h: number; kind: NodeKind } {
  // 1. Company identity / authority / governance
  if (n.id === "founder" || n.type === "founder" || n.role === "founder") {
    return placeCompanyNode("founder");
  }
  if (n.id === "coo" || n.id === "core" || n.role === "coo") {
    return placeCompanyNode("coo");
  }
  if (n.id === "approval" || n.type === "approval" || n.governanceState === "awaiting_founder_approval") {
    return placeCompanyNode("approval");
  }
  if (n.id === "verifier" || n.id === "verification" || n.type === "verification") {
    return placeCompanyNode("verifier");
  }
  if (n.id === "vault" || n.id === "outcome" || n.type === "outcome") {
    return placeCompanyNode("vault");
  }

  // 2. Workforce chips (execution metadata attached to work, not primary flow)
  if (n.id === "researcher" || n.id === "ops" || n.role === "researcher") {
    return placeCompanyNode("researcher");
  }
  if (n.id === "finance" || n.role === "finance") {
    return placeCompanyNode("finance");
  }
  if (n.id === "pm" || n.role === "pm") {
    return placeCompanyNode("pm");
  }

  // 3. Work objects — first-class citizens placed by semantic zone
  if (isWorkDtoNode(n)) {
    const zone = resolveWorkZone(n);
    const zonePeers = allNodes.filter((item) => isWorkDtoNode(item) && resolveWorkZone(item) === zone);
    const idx = Math.max(0, zonePeers.findIndex((item) => item.id === n.id));
    return placeWorkCard(idx, zone);
  }

  // 4. Unknown nodes — quiet fallback band below active work
  const unknownIdx = allNodes.filter((item) => !isWorkDtoNode(item) && !item.role && item.type === "workflow").findIndex((item) => item.id === n.id);
  return { x: 700 + (unknownIdx % 3) * 260, y: 860, w: 64, h: 64, kind: "card" };
}

// ---------------------------------------------------------------------------
// Phase 4.3C — Deterministic connection routing (§5)
//
// Calm schematic discipline: port-matched orthogonal routes on a snapped
// grid, scored against node obstacles (lines must not pass through nodes),
// accidental edge crossings and collinear overlap. Where a crossing is
// genuinely unavoidable the LATER edge hops over the earlier one, making
// the crossing deliberate and visually unambiguous.
// ---------------------------------------------------------------------------

/** Routing primitives — deterministic, grid-locked, obstacle-aware. */
export const ROUTING_TOKENS = {
  /** All route coordinates snap to this grid (px). */
  grid: 8,
  /** Candidate lane offsets from anchor lanes (px). */
  laneStep: 32,
  /** Lane offsets tried on each side of each anchor. */
  laneVariants: 4,
  /** Obstacle bounding-box inflation (px). */
  obstaclePad: 6,
  /** Port standoff outside the node rect (px). */
  portStandoff: 2,
  /** Line-hop radius where a crossing is unavoidable (px). */
  hopRadius: 9,
  /** Line-hop arch height (px). */
  hopHeight: 7,
} as const;

type RP = { x: number; y: number };
interface Rect { x0: number; y0: number; x1: number; y1: number }

const nodeRect = (n: FlowNode, pad: number): Rect => ({
  x0: n.x - n.w / 2 - pad,
  y0: n.y - n.h / 2 - pad,
  x1: n.x + n.w / 2 + pad,
  y1: n.y + n.h / 2 + pad,
});

/** Liang–Barsky segment/AABB intersection. */
function segHitsRect(a: RP, b: RP, r: Rect): boolean {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x0, r.x1 - a.x, a.y - r.y0, r.y1 - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return true;
}

/** Interior intersection point of two segments (null if none / near-endpoints). */
function segSegCross(a1: RP, a2: RP, b1: RP, b2: RP): RP | null {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null; // parallel or collinear
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / den;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / den;
  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return null;
  return { x: a1.x + d1x * t, y: a1.y + d1y * t };
}

/** Minimum distance from a point to a polyline. */
function distToPolyline(p: RP, pts: RP[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, ay = pts[i - 1].y, bx = pts[i].x, by = pts[i].y;
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((p.x - ax) * dx + (p.y - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(p.x - (ax + dx * t), p.y - (ay + dy * t)));
  }
  return best;
}

const polylineLength = (pts: RP[]): number => {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
};

const gridSnap = (v: number): number => Math.round(v / ROUTING_TOKENS.grid) * ROUTING_TOKENS.grid;

/** Drops duplicate + collinear interior points (minimal bends, §5). */
function dedupePts(pts: RP[]): RP[] {
  const noDupes: RP[] = [];
  for (const p of pts) {
    const last = noDupes[noDupes.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    noDupes.push(p);
  }
  const out: RP[] = [];
  for (let i = 0; i < noDupes.length; i++) {
    const a = out[out.length - 1];
    const b = noDupes[i];
    const c = noDupes[i + 1];
    if (a && c && ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y))) continue;
    out.push(b);
  }
  return out;
}

/** Facing-side port pair (primary travel axis by dominant delta). */
function portsFor(from: FlowNode, to: FlowNode): [RP, RP] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const s = ROUTING_TOKENS.portStandoff;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? [{ x: from.x + from.w / 2 + s, y: from.y }, { x: to.x - to.w / 2 - s, y: to.y }]
      : [{ x: from.x - from.w / 2 - s, y: from.y }, { x: to.x + to.w / 2 + s, y: to.y }];
  }
  return dy >= 0
    ? [{ x: from.x, y: from.y + from.h / 2 + s }, { x: to.x, y: to.y - to.h / 2 - s }]
    : [{ x: from.x, y: from.y - from.h / 2 - s }, { x: to.x, y: to.y + to.h / 2 + s }];
}

/**
 * Scores a candidate route: node obstacles dominate, then accidental
 * crossings, collinear overlap, bends and length. Pure function of
 * deterministic inputs — same graph ⇒ same routes.
 */
function scoreCandidate(pts: RP[], from: FlowNode, to: FlowNode, obstacles: FlowNode[], routed: RP[][]): number {
  let hits = 0;
  for (let i = 1; i < pts.length; i++) {
    for (const o of obstacles) {
      if (o.id === from.id || o.id === to.id) continue;
      if (segHitsRect(pts[i - 1], pts[i], nodeRect(o, ROUTING_TOKENS.obstaclePad))) hits++;
    }
  }
  let crossings = 0;
  let overlap = 0;
  for (const rp of routed) {
    if (rp.length < 2) continue;
    for (let i = 1; i < pts.length; i++) {
      for (let j = 1; j < rp.length; j++) {
        if (segSegCross(pts[i - 1], pts[i], rp[j - 1], rp[j])) crossings++;
      }
      // Collinear-overlap sampling keeps unrelated relationships separated.
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.floor(len / 24));
      for (let k = 0; k <= n; k++) {
        const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
        if (distToPolyline(p, rp) < 3) overlap++;
      }
    }
  }
  return hits * 1000 + crossings * 8 + overlap * 6 + (pts.length - 2) * 40 + polylineLength(pts) / 50;
}

/**
 * Deterministic obstacle-aware orthogonal route between two nodes.
 *
 * Port-face discipline (§5): a horizontal-face port is always entered/exited
 * along a horizontal segment, a vertical-face port along a vertical segment —
 * relationships never stab sideways into a card. Travel lanes lie strictly
 * between the two ports (no backward jogs, no loops) on the snapped grid;
 * lane anchors come from the midpoint, both ports AND the bounding edges of
 * intervening obstacles (escape lanes), so routes dodge nodes instead of
 * crossing them. The lowest-scored candidate wins (stable generation order
 * breaks ties) — same graph ⇒ same routes.
 */
function planRoute(from: FlowNode, to: FlowNode, obstacles: FlowNode[], routed: RP[][]): [number, number][] {
  const [p1, p2] = portsFor(from, to);
  if (Math.abs(p1.y - p2.y) < 4 || Math.abs(p1.x - p2.x) < 4) {
    return [[p1.x, p1.y], [p2.x, p2.y]];
  }

  const { laneStep, laneVariants, grid, obstaclePad } = ROUTING_TOKENS;
  const dxRaw = to.x - from.x;
  const dyRaw = to.y - from.y;
  const horizontalPorts = Math.abs(dxRaw) >= Math.abs(dyRaw);

  // Lane anchors: midpoint, both ports, and obstacle bounding edges (escape
  // lanes that skirt intervening nodes by a safe clearance).
  const anchors: number[] = horizontalPorts
    ? [(p1.x + p2.x) / 2, p1.x, p2.x]
    : [(p1.y + p2.y) / 2, p1.y, p2.y];
  for (const o of obstacles) {
    if (o.id === from.id || o.id === to.id) continue;
    const r = nodeRect(o, obstaclePad);
    if (horizontalPorts) {
      anchors.push(r.x0 - 12, r.x1 + 12);
    } else {
      anchors.push(r.y0 - 12, r.y1 + 12);
    }
  }

  // Travel lanes strictly between the two ports (forward-only, §5: no loops).
  const lo = horizontalPorts ? Math.min(p1.x, p2.x) + grid : Math.min(p1.y, p2.y) + grid;
  const hi = horizontalPorts ? Math.max(p1.x, p2.x) - grid : Math.max(p1.y, p2.y) - grid;

  const lanes = new Set<number>();
  for (const a of anchors) {
    lanes.add(a);
    for (let k = 1; k <= laneVariants; k++) {
      lanes.add(a - k * laneStep);
      lanes.add(a + k * laneStep);
    }
  }

  const candidates: RP[][] = [];
  const push = (pts: RP[]) => {
    const snapped = dedupePts(pts.map((p) => ({ x: gridSnap(p.x), y: gridSnap(p.y) })));
    if (
      snapped.length >= 2 &&
      !candidates.some((c) => c.length === snapped.length && c.every((q, i) => q.x === snapped[i].x && q.y === snapped[i].y))
    ) {
      candidates.push(snapped);
    }
  };

  if (horizontalPorts) {
    // Exit p1 horizontally → travel vertically at lane Lx → enter p2 horizontally.
    for (const Lx of lanes) {
      if (Lx < lo || Lx > hi) continue;
      push([p1, { x: Lx, y: p1.y }, { x: Lx, y: p2.y }, p2]);
    }
  } else {
    // Exit p1 vertically → travel horizontally at lane Ly → enter p2 vertically.
    for (const Ly of lanes) {
      if (Ly < lo || Ly > hi) continue;
      push([p1, { x: p1.x, y: Ly }, { x: p2.x, y: Ly }, p2]);
    }
  }

  // Degenerate port range (ports nearly stacked): cross at the shared lane.
  if (!candidates.length) {
    const lane = horizontalPorts ? (p1.x + p2.x) / 2 : (p1.y + p2.y) / 2;
    push(
      horizontalPorts
        ? [p1, { x: lane, y: p1.y }, { x: lane, y: p2.y }, p2]
        : [p1, { x: p1.x, y: lane }, { x: p2.x, y: lane }, p2]
    );
  }

  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    const s = scoreCandidate(c, from, to, obstacles, routed);
    if (s < bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best.map((p) => [p.x, p.y] as [number, number]);
}

/**
 * §5 deliberate crossings — the later edge hops over earlier ones (in edge
 * order). Called by the engine on the edges it actually draws, so hops never
 * reference hidden orchestration plumbing.
 */
function insertHops(raw: [number, number][], routed: RP[][]): [number, number][] {
  if (raw.length < 2 || routed.length === 0) return raw;
  const out: [number, number][] = [raw[0]];
  const { hopRadius, hopHeight } = ROUTING_TOKENS;

  for (let i = 1; i < raw.length; i++) {
    const a = { x: raw[i - 1][0], y: raw[i - 1][1] };
    const b = { x: raw[i][0], y: raw[i][1] };
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 2 * hopRadius + 12) {
      out.push(raw[i]);
      continue;
    }

    const crossings: { t: number; p: RP }[] = [];
    for (const rp of routed) {
      for (let j = 1; j < rp.length; j++) {
        const c = segSegCross(a, b, rp[j - 1], rp[j]);
        if (c) crossings.push({ t: Math.hypot(c.x - a.x, c.y - a.y) / segLen, p: c });
      }
    }
    if (!crossings.length) {
      out.push(raw[i]);
      continue;
    }

    crossings.sort((u, v) => u.t - v.t);
    const margin = hopRadius + 4;
    const usable = crossings.filter((c) => c.t * segLen > margin && (1 - c.t) * segLen > margin);
    if (!usable.length) {
      out.push(raw[i]);
      continue;
    }

    const dir = { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen };
    const perp = { x: -dir.y, y: dir.x }; // deterministic arch side
    for (const c of usable) {
      const enter = { x: c.p.x - dir.x * hopRadius, y: c.p.y - dir.y * hopRadius };
      const exit = { x: c.p.x + dir.x * hopRadius, y: c.p.y + dir.y * hopRadius };
      out.push([enter.x, enter.y]);
      for (let k = 1; k < 6; k++) {
        const t = k / 6;
        const bx = enter.x + (exit.x - enter.x) * t;
        const by = enter.y + (exit.y - enter.y) * t;
        out.push([bx + perp.x * hopHeight * Math.sin(Math.PI * t), by + perp.y * hopHeight * Math.sin(Math.PI * t)]);
      }
      out.push([exit.x, exit.y]);
    }
    out.push(raw[i]);
  }
  return out;
}

/**
 * Phase 4.3B.1 — semantic layer by relationship taxonomy (shared by both
 * the authoritative DTO mapping and the client fallback projection).
 */
function layerForRelationship(rel: GraphRelationship): FlowEdgeLayer {
  switch (rel) {
    case "escalates-to":
      return "governance";
    case "feeds":
    case "depends-on":
      return "structural";
    case "delegates":
      // Founder→Sophia / Sophia→specialist delegation is orchestration
      // plumbing: authoritative inspector topology, never the default canvas.
      return "context";
    case "checks":
    default:
      // researches / models_finance / authors_prd / checks / synthesizes:
      // agent↔work execution metadata — revealed when live or focused.
      return "ownership";
  }
}

/**
 * Phase 4.3B.1 — semantic layer for an authoritative DTO edge.
 */
function computeEdgeLayer(e: GraphEdgeDTO): FlowEdgeLayer {
  return layerForRelationship(e.relationship);
}

/** Deferred edge specification (routing happens once all nodes exist). */
type EdgeSpec = {
  from: FlowNode;
  to: FlowNode;
  id: string;
  style: EdgeStyle;
  relationship: GraphRelationship;
  state: GraphNodeState;
  activity?: string;
};

/** Materializes routed edges from specs (deterministic, in spec order). */
function routeSpecs(specs: EdgeSpec[], nodes: FlowNode[]): FlowEdge[] {
  const edges: FlowEdge[] = [];
  const routed: RP[][] = [];
  for (const s of specs) {
    const pts = planRoute(s.from, s.to, nodes, routed);
    routed.push(pts.map(([x, y]) => ({ x, y })));
    edges.push({
      id: s.id,
      from: s.from.id,
      to: s.to.id,
      pts,
      style: s.style,
      arrow: true,
      relationship: s.relationship,
      state: s.state,
      activity: s.activity,
      layer: layerForRelationship(s.relationship),
    });
  }
  return edges;
}

/**
 * Maps authoritative GraphDTO (Phase 4.3A server projection) into FlowEngine
 * GraphModel under the Phase 4.3B.1 spatial company-context grammar.
 * Preserves exact relationship taxonomies, edge layers, and spatial cards;
 * routes relationships with the Phase 4.3C deterministic router.
 */
export function mapGraphDTOToFlowModel(dto: GraphDTO): GraphModel {
  const nodeMap = new Map<string, FlowNode>();
  const nodes: FlowNode[] = dto.nodes.map((n) => {
    let state: GraphNodeState = "idle";
    if (n.governanceState === "awaiting_founder_approval" || n.presentationState === "waiting") {
      state = "waiting";
    } else if (n.presentationState === "error" || n.runtimeState === "failed") {
      state = "blocked";
    } else if (n.presentationState === "success" || n.runtimeState === "completed") {
      state = "complete";
    } else if (n.presentationState === "processing") {
      state = "processing";
    } else if (n.presentationState === "active" || n.runtimeState === "running") {
      state = "active";
    }

    const geom = computeSpatialNode(n, dto.nodes, dto.edges);

    const flowNode: FlowNode = {
      id: n.id,
      x: geom.x,
      y: geom.y,
      w: geom.w,
      h: geom.h,
      kind: geom.kind,
      type: n.type,
      state,
      title: n.title,
      subtitle: n.subtitle,
      activity: n.activity,
      protocolStep: n.metadata?.protocolStep,
      relevance: n.relevance,
      owner: n.owner,
      dtoNode: n,
    };
    nodeMap.set(n.id, flowNode);
    return flowNode;
  });

  const edges: FlowEdge[] = [];
  const routed: RP[][] = [];
  for (const e of dto.edges) {
    const fromNode = nodeMap.get(e.source);
    const toNode = nodeMap.get(e.target);

    let pts: [number, number][] = [];
    if (fromNode && toNode) {
      pts = planRoute(fromNode, toNode, nodes, routed);
    } else if (e.points && e.points.length >= 2) {
      pts = e.points;
    }
    routed.push(pts.map(([x, y]) => ({ x, y })));

    let edgeState: GraphNodeState = "idle";
    if (e.runtimeState === "running" || e.presentationState === "active" || e.presentationState === "processing") {
      edgeState = "active";
    } else if (e.runtimeState === "failed" || e.presentationState === "error") {
      edgeState = "blocked";
    } else if (e.runtimeState === "completed" || e.presentationState === "success") {
      edgeState = "complete";
    } else if (e.presentationState === "waiting") {
      edgeState = "waiting";
    }

    edges.push({
      id: e.id,
      from: e.source,
      to: e.target,
      pts,
      style: e.style as EdgeStyle,
      arrow: e.arrow ?? true,
      relationship: e.relationship,
      state: edgeState,
      activity: e.activity,
      layer: computeEdgeLayer(e),
      dtoEdge: e,
    });
  }

  const spatialCards: SpatialCard[] = dto.spatialCards.map((c) => {
    const targetNode = nodeMap.get(c.nodeId);
    return {
      id: c.id,
      nodeId: c.nodeId,
      x: targetNode ? targetNode.x : c.x,
      y: targetNode ? targetNode.y - targetNode.h / 2 - 26 : c.y,
      actor: c.actor,
      action: c.action,
      target: c.target,
      tone: c.tone,
    };
  });

  return { nodes, edges, spatialCards };
}

export const WORLD = {
  CX: 800,
  CY: 450,
  W: 1600,
  H: 900,
  MIN_X: 60,
  MAX_X: 1640,
  MIN_Y: 40,
  MAX_Y: 860,
};

type P = { x: number; y: number };
type Sampled = { pts: P[]; cum: number[]; len: number; edge: FlowEdge; index: number; emit: number };
type PacketTone = "cyan" | "amber" | "rose";
type Packet = { e: number; d: number; speed: number; tone: PacketTone; trail: number };
type Ring = { x: number; y: number; life: number; max: number; r: number; tone: PacketTone };
/** Phase 4.5 — slower soft arrival bloom (attack ramp then decay). */
type Bloom = { x: number; y: number; r: number; life: number; max: number; tone: PacketTone };
/** Phase 4.5 — one restrained ~60ms specular sweep across the arriving node. */
type Sweep = { x: number; y: number; w: number; h: number; life: number; max: number; tone: PacketTone };

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
    if (lin < 1e-3 || lout < 1e-3) continue;
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
  grd.addColorStop(0.18, `rgba(${r},${g},${b},0.95)`);
  grd.addColorStop(0.45, `rgba(${r},${g},${b},0.35)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd;
  x.fillRect(0, 0, size, size);
  return c;
}

/**
 * Dynamic company-context projection derived strictly from live OS state
 * (client fallback when the authoritative /api/graph projection is
 * unreachable — same spatial grammar as mapGraphDTOToFlowModel):
 *   Company band: Founder · Workforce (Sophia, Thorne, Cruz, Lin) · Verifier
 *   ACTIVE WORK · RELATED/DEPENDENCIES · GOVERNED OUTCOMES regions
 *   Escalation gate attaches to the founder inside the company band.
 */
export function deriveGraph(state: {
  work: Array<{ id: string; title: string; state: string; stage: string; owner?: string }>;
  decisions: Array<{ id: string; title: string; status: string }>;
  agents?: Array<{ id: string; name: string; role: string; state: string }>;
  company?: { name: string; focus: string };
  attention?: Array<{ id: string; title: string; kind: string; handled?: boolean }>;
}): GraphModel {
  const nodes: FlowNode[] = [];
  const specs: EdgeSpec[] = [];
  const spatialCards: SpatialCard[] = [];

  const openDecisions = state.decisions.filter((d) => d.status === "open");
  const hasOpenDecisions = openDecisions.length > 0;
  const activeWork = state.work.filter((w) => w.state === "active");
  const blockedWork = state.work.filter((w) => w.state === "blocked");
  const doneWork = state.work.filter((w) => w.state === "done");
  const hasActiveWork = activeWork.length > 0;
  const hasBlockedWork = blockedWork.length > 0;
  const hasReviewWork = state.work.some((w) => (w.stage === "review" || w.stage === "ship") && w.state === "active");

  // 1. Founder / Inputs (Authority — company band west)
  const founderNode: FlowNode = {
    id: "founder",
    x: 430,
    y: 190,
    w: 76,
    h: 76,
    kind: "round",
    type: "founder",
    state: hasOpenDecisions ? "waiting" : "idle",
    title: "Founder / Inputs",
    subtitle: state.company?.focus ? `Focus: ${state.company.focus}` : "Directives & Invariants",
    activity: hasOpenDecisions ? "Reviewing decisions" : undefined,
    relevance: hasOpenDecisions ? 1 : 0.6,
  };
  nodes.push(founderNode);

  // 2. Sophia Vance (COO — workforce chip, execution metadata)
  const sophiaState: GraphNodeState = hasActiveWork ? "active" : hasBlockedWork ? "blocked" : "idle";
  const coreNode: FlowNode = {
    id: "core",
    x: 620,
    y: 255,
    w: 64,
    h: 64,
    kind: "core",
    type: "agent",
    state: sophiaState,
    title: "Sophia",
    subtitle: "COO & Orchestrator",
    activity: hasActiveWork ? `Orchestrating ${activeWork.length} workstream${activeWork.length > 1 ? "s" : ""}` : undefined,
    relevance: 1,
    owner: "sophia",
  };
  nodes.push(coreNode);

  // Founder -> Sophia conduit
  specs.push({
    from: founderNode,
    to: coreNode,
    id: "e-founder-core",
    style: hasActiveWork ? "cyan" : "white",
    relationship: "delegates",
    state: hasActiveWork ? "active" : "idle",
    activity: hasActiveWork ? "Dispatching directives" : undefined,
  });

  // 3. Workforce chips (execution metadata — company band)
  const specialistNodes: FlowNode[] = [];

  // Dr. Aris Thorne (Research & Intelligence)
  const thorneWork = activeWork.find((w) => w.owner === "ops" || w.owner === "researcher" || !w.owner);
  const thorneBlocked = blockedWork.find((w) => w.owner === "ops" || w.owner === "researcher" || !w.owner);
  const thorneState: GraphNodeState = thorneWork ? "active" : thorneBlocked ? "blocked" : "idle";

  const thorneNode: FlowNode = {
    id: "ops",
    x: 745,
    y: 255,
    w: 54,
    h: 54,
    kind: "round",
    type: "agent",
    state: thorneState,
    title: "Dr. Aris Thorne",
    subtitle: "Research & Intelligence",
    activity: thorneWork ? thorneWork.title : thorneBlocked ? "Blocked on research" : undefined,
    relevance: thorneWork || thorneBlocked ? 1 : 0.7,
    owner: "ops",
  };
  specialistNodes.push(thorneNode);

  // Julian Cruz (Finance & Unit Economics)
  const financeWork = state.work.find((w) => w.owner === "finance" && w.state !== "done");
  let financeNode: FlowNode | undefined;
  if (financeWork) {
    const isAct = financeWork.state === "active";
    const isBlk = financeWork.state === "blocked";
    financeNode = {
      id: "finance",
      x: 855,
      y: 255,
      w: 54,
      h: 54,
      kind: "round",
      type: "agent",
      state: isBlk ? "blocked" : isAct ? "active" : "idle",
      title: "Julian Cruz",
      subtitle: "Finance & Economics",
      activity: financeWork.title,
      relevance: 1,
      owner: "finance",
    };
    specialistNodes.push(financeNode);
  }

  // Maya Lin (Product Architecture & PRD)
  const pmWork = state.work.find((w) => w.owner === "pm" && w.state !== "done");
  let pmNode: FlowNode | undefined;
  if (pmWork) {
    const isAct = pmWork.state === "active";
    const isBlk = pmWork.state === "blocked";
    pmNode = {
      id: "pm",
      x: 965,
      y: 255,
      w: 54,
      h: 54,
      kind: "round",
      type: "agent",
      state: isBlk ? "blocked" : isAct ? "active" : "idle",
      title: "Maya Lin",
      subtitle: "Product Architecture",
      activity: pmWork.title,
      relevance: 1,
      owner: "pm",
    };
    specialistNodes.push(pmNode);
  }

  specialistNodes.forEach((node) => nodes.push(node));

  // Connect Sophia to specialists
  specs.push({
    from: coreNode,
    to: thorneNode,
    id: "e-core-thorne",
    style: hasActiveWork ? "cyan" : "white",
    relationship: "delegates",
    state: hasActiveWork ? "active" : "idle",
    activity: hasActiveWork ? "Delegating research" : undefined,
  });

  if (financeNode) {
    specs.push({
      from: coreNode,
      to: financeNode,
      id: "e-core-finance",
      style: financeNode.state === "active" ? "cyan" : "white",
      relationship: "models_finance",
      state: financeNode.state,
      activity: "Modeling unit economics",
    });
  }

  if (pmNode) {
    specs.push({
      from: thorneNode,
      to: pmNode,
      id: "e-thorne-pm",
      style: pmNode.state === "active" ? "cyan" : "white",
      relationship: "authors_prd",
      state: pmNode.state,
      activity: "Feeding research into PRD",
    });
  }

  // 4. Work objects — first-class cards in semantic regions
  const protocolStepNodes: FlowNode[] = [];
  const openWorkAll = state.work.filter((w) => w.state !== "done");
  const doneWorkAll = state.work.filter((w) => w.state === "done");
  const openWork = openWorkAll.slice(0, 9);
  const doneWorkCapped = doneWorkAll.slice(0, 3);

  const zoneOf = (w: { state: string }): WorkZone =>
    w.state === "done" ? "outcomes" : w.state === "active" || w.state === "blocked" ? "active" : "related";

  const workItems = [...openWork, ...doneWorkCapped];
  const zoneCounters = { active: 0, related: 0, outcomes: 0 };

  workItems.forEach((w) => {
    const isAct = w.state === "active";
    const isBlk = w.state === "blocked";
    const isDone = w.state === "done";
    const wState: GraphNodeState = isDone ? "complete" : isBlk ? "blocked" : isAct ? "active" : "waiting";

    let stepName = "Research & Reconnaissance";
    let assignedSpecialist = thorneNode;
    let relationship: GraphRelationship = "researches";

    if (w.stage === "discovery") {
      stepName = "Market Reconnaissance";
      assignedSpecialist = thorneNode;
      relationship = "researches";
    } else if (w.stage === "build") {
      if (w.owner === "finance" && financeNode) {
        stepName = "Unit Economics Audit";
        assignedSpecialist = financeNode;
        relationship = "models_finance";
      } else {
        stepName = "Product Architecture & PRD";
        assignedSpecialist = pmNode || thorneNode;
        relationship = "authors_prd";
      }
    } else if (w.stage === "review") {
      stepName = "Council Peer Review";
      assignedSpecialist = thorneNode;
      relationship = "checks";
    } else if (w.stage === "ship") {
      stepName = "Executive Synthesis";
      assignedSpecialist = thorneNode;
      relationship = "synthesizes";
    }

    const zone = zoneOf(w);
    const geom = placeWorkCard(zoneCounters[zone]++, zone);

    const stepNode: FlowNode = {
      id: `step-${w.id}`,
      x: geom.x,
      y: geom.y,
      w: geom.w,
      h: geom.h,
      kind: "card",
      type: "workflow",
      state: wState,
      title: w.title,
      subtitle: isDone ? "Governed Outcome" : `${stepName}`,
      protocolStep: w.stage,
      activity: isDone ? "Verified & delivered" : isAct ? `${stepName} in execution` : isBlk ? "Attention required" : undefined,
      relevance: isAct || isBlk ? 1 : 0.45,
      owner: w.owner,
    };
    protocolStepNodes.push(stepNode);

    // Ownership edge from assigned specialist to this work object
    const edgeStyle: EdgeStyle = isBlk ? "rose" : isAct ? "cyan" : isDone ? "emerald" : "white";
    specs.push({
      from: assignedSpecialist,
      to: stepNode,
      id: `e-spec-${w.id}`,
      style: edgeStyle,
      relationship,
      state: isBlk ? "blocked" : isAct ? "active" : isDone ? "complete" : "idle",
      activity: w.title,
    });
  });

  protocolStepNodes.forEach((n) => nodes.push(n));

  // 5. Constitutional Verifier (Invariant — company band east)
  const verState: GraphNodeState = hasBlockedWork
    ? "blocked"
    : hasReviewWork
    ? "active"
    : doneWork.length > 0
    ? "complete"
    : "idle";

  const verifierNode: FlowNode = {
    id: "verification",
    x: 1160,
    y: 190,
    w: 68,
    h: 68,
    kind: "round",
    type: "verification",
    state: verState,
    title: "Constitutional Verifier",
    subtitle: "Safety Gate",
    activity: hasReviewWork ? "Evaluating gross margin ≥ 80%" : hasBlockedWork ? "Invariant check failed" : undefined,
    relevance: hasReviewWork || hasBlockedWork ? 1 : 0.5,
  };
  nodes.push(verifierNode);

  // Work → verifier execution boundary (ownership layer: revealed on focus / when live)
  if (protocolStepNodes.length === 0) {
    specs.push({
      from: thorneNode,
      to: verifierNode,
      id: "e-thorne-verifier",
      style: "white",
      relationship: "checks",
      state: "idle",
    });
  } else {
    protocolStepNodes.forEach((stepNode) => {
      const isReview = stepNode.state === "active" && (stepNode.subtitle?.includes("Review") || stepNode.subtitle?.includes("Synthesis"));
      const isBlk = stepNode.state === "blocked";
      const edgeStyle: EdgeStyle = isBlk ? "rose" : isReview ? "cyan" : "white";
      specs.push({
        from: stepNode,
        to: verifierNode,
        id: `e-ver-${stepNode.id}`,
        style: edgeStyle,
        relationship: "checks",
        state: isBlk ? "blocked" : isReview ? "active" : "idle",
      });
    });
  }

  // 6. Governed Vault (Immutable Memory — outcomes region anchor)
  const outcomeState: GraphNodeState = doneWork.length > 0 ? "complete" : "idle";
  const outcomeNode: FlowNode = {
    id: "outcome",
    x: 1450,
    y: 372,
    w: 124,
    h: 74,
    kind: "card",
    type: "outcome",
    state: outcomeState,
    title: "Governed Vault",
    subtitle: "Immutable Memory",
    activity: doneWork.length > 0 ? `${doneWork.length} deliverable${doneWork.length > 1 ? "s" : ""} verified` : undefined,
    relevance: doneWork.length > 0 ? 1 : 0.35,
  };
  nodes.push(outcomeNode);

  // Structural edge: verifier feeds the vault (company structure truth)
  specs.push({
    from: verifierNode,
    to: outcomeNode,
    id: "e-verifier-outcome",
    style: doneWork.length > 0 ? "emerald" : "white",
    relationship: "feeds",
    state: doneWork.length > 0 ? "complete" : "idle",
  });

  // 7. Contextual Escalation: Founder Approval Gate (governance — inside company band)
  if (hasOpenDecisions) {
    const approvalNode: FlowNode = {
      id: "approval",
      x: 430,
      y: 318,
      w: 68,
      h: 68,
      kind: "card",
      type: "approval",
      state: "blocked",
      title: "Founder Approval Gate",
      subtitle: `${openDecisions.length} Decision${openDecisions.length > 1 ? "s" : ""} Waiting`,
      activity: openDecisions[0]?.title ?? "Consequential Action Ratification",
      relevance: 1,
    };
    nodes.push(approvalNode);

    // Sophia escalates to Approval Gate
    specs.push({
      from: coreNode,
      to: approvalNode,
      id: "e-sophia-approval",
      style: "amber",
      relationship: "escalates-to",
      state: "blocked",
      activity: "Escalating decision",
    });

    // Approval Gate escalates to Founder
    specs.push({
      from: approvalNode,
      to: founderNode,
      id: "e-approval-founder",
      style: "amber",
      relationship: "escalates-to",
      state: "blocked",
      activity: "Requires Founder Ratification",
    });
  }

  // 8. Spatial Contextual Cards (Real operational intent only)
  if (hasActiveWork) {
    spatialCards.push({
      id: "sp-sophia",
      nodeId: "core",
      x: coreNode.x,
      y: coreNode.y - coreNode.h / 2 - 26,
      actor: "Sophia Vance",
      action: "Delegating research",
      target: "Dr. Aris Thorne",
      tone: "cyan",
    });
  }
  if (thorneWork) {
    spatialCards.push({
      id: "sp-thorne",
      nodeId: "ops",
      x: thorneNode.x,
      y: thorneNode.y - thorneNode.h / 2 - 26,
      actor: "Dr. Aris Thorne",
      action: thorneWork.title,
      tone: "cyan",
    });
  }
  if (financeNode && financeWork && financeWork.state === "active") {
    spatialCards.push({
      id: "sp-finance",
      nodeId: "finance",
      x: financeNode.x,
      y: financeNode.y - financeNode.h / 2 - 26,
      actor: "Julian Cruz",
      action: "Stress-testing margin floor ≥ 80%",
      tone: "cyan",
    });
  }
  if (pmNode && pmWork && pmWork.state === "active") {
    spatialCards.push({
      id: "sp-pm",
      nodeId: "pm",
      x: pmNode.x,
      y: pmNode.y - pmNode.h / 2 - 26,
      actor: "Maya Lin",
      action: "Drafting PRD & architecture specs",
      tone: "cyan",
    });
  }
  if (hasReviewWork) {
    spatialCards.push({
      id: "sp-verify",
      nodeId: "verification",
      x: verifierNode.x,
      y: verifierNode.y - verifierNode.h / 2 - 26,
      actor: "Constitutional Verifier",
      action: "Auditing gross margin invariant ≥ 80%",
      tone: "emerald",
    });
  } else if (hasBlockedWork) {
    spatialCards.push({
      id: "sp-verify-blocked",
      nodeId: "verification",
      x: verifierNode.x,
      y: verifierNode.y - verifierNode.h / 2 - 26,
      actor: "Constitutional Verifier",
      action: "Deterministic check failed — blocked",
      tone: "rose",
    });
  }
  if (hasOpenDecisions) {
    spatialCards.push({
      id: "sp-approval",
      nodeId: "approval",
      x: 380,
      y: 600 - 34 - 26,
      actor: "Waiting",
      action: "Founder decision required",
      target: "Founder",
      tone: "amber",
    });
  }

  // Phase 4.3C — route all relationships once every node exists (§5).
  const edges = routeSpecs(specs, nodes);

  return { nodes, edges, spatialCards };
}

// Static fallback nodes/edges for compatibility
export const NODES: FlowNode[] = deriveGraph({ work: [], decisions: [] }).nodes;
export const EDGES: FlowEdge[] = deriveGraph({ work: [], decisions: [] }).edges;

/* ------------------------------------------------- execution language map */

/** §3/§5 — which conduit treatment an edge renders with. */
function conduitTreatmentFor(e: FlowEdge): ConduitKey {
  // Governance relationships render as STATIC amber approval boundaries —
  // never animated like execution (§3).
  if (e.layer === "governance" || e.relationship === "escalates-to") return "governance";
  if (e.state === "blocked" || e.style === "rose") return "blocked";
  // Amber outside governance = external action/side effect; only animated
  // (progressive fill + comets) while genuinely executing.
  if (e.style === "amber") return e.state === "active" ? "externalAction" : "governance";
  if (e.state === "complete" || e.style === "emerald") return "completed";
  if (e.state === "active" || e.style === "cyan") return "running";
  return "idle";
}

/** §3 — comet tone derives from execution state, never agent identity. */
function toneForEdge(e: FlowEdge): PacketTone {
  if (e.state === "blocked" || e.style === "rose") return "rose";
  if (e.style === "amber" && e.state === "active") return "amber";
  return "cyan";
}

/* --------------------------------------------------- execution perimeter */

/**
 * Phase 4.3E — resolve the progressive execution perimeter for a node from
 * AUTHORITATIVE state only (GraphDTO runtime/governance/execution trail, or
 * the client fallback view-model). Pure function of its inputs; NEVER
 * fabricates a progress value.
 *
 *   approval  → static amber boundary (never animated, never fake progress)
 *   blocked   → restrained red, stopped at the last KNOWN progress
 *   completed → full perimeter, restrained green, settled
 *   running   → blue/cyan progressive fill (amber when an attached
 *               relationship is in a genuine external-action state)
 *   idle      → no perimeter (§1 calm baseline)
 *
 * Measured progress = settled stages / total (execution trail). Nodes
 * without a trail carry `progress: undefined` ("executing, unmeasured") —
 * the perimeter component decides how that renders; this mapper only passes
 * authoritative facts.
 */
export function perimeterForNode(n: FlowNode, edges: FlowEdge[] = []): ExecutionPerimeterSpec | null {
  const dto = n.dtoNode;
  const runtime = dto?.runtimeState;
  const governance = dto?.governanceState;

  const steps = dto?.metadata?.executionSteps;
  const measured =
    steps && steps.length > 0
      ? steps.filter((s) => s.status === "done" || s.status === "failed").length / steps.length
      : undefined;

  // Approval / authority boundary — static amber, never animated (§3/§5).
  if (governance === "awaiting_founder_approval" || n.type === "approval" || dto?.presentationState === "waiting") {
    return { semantic: "approval" };
  }
  // Blocked — restrained red, stopped at the actual known progress.
  if (runtime === "failed" || n.state === "blocked") {
    return { semantic: "blocked", progress: measured };
  }
  // Completed / verified — full perimeter, settled green.
  if (runtime === "completed" || n.state === "complete") {
    return { semantic: "completed", progress: 1 };
  }
  // Executing — blue/cyan; amber when an attached relationship is in a
  // genuine external-action state (authoritative edge semantics only).
  if (runtime === "running" || n.state === "active" || n.state === "processing") {
    const external = edges.some(
      (e) =>
        (e.from === n.id || e.to === n.id) &&
        e.style === "amber" &&
        e.state === "active" &&
        e.layer !== "governance"
    );
    return { semantic: external ? "externalAction" : "running", progress: measured };
  }
  // Idle / paused / parked — no perimeter (§1 calm baseline).
  return null;
}

/**
 * FlowEngine — the canonical company-context canvas renderer.
 *
 * Renders the FROZEN execution language: static calm conduits, progressive
 * source→target activation fills, directional comets constrained to the
 * exact routed edge paths, and restrained arrival activations — all driven
 * exclusively by authoritative runtime state delivered via setGraph().
 */
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
  rings: Ring[] = [];
  blooms: Bloom[] = [];
  sweeps: Sweep[] = [];
  energy = new Map<string, number>();
  /** §4 — per-edge progressive fill, carried across graph refreshes. */
  private fill = new Map<string, { active: boolean; q: number }>();
  /** Deterministic round-robin for multi-relationship continuation. */
  private hopSeq = 0;

  blueSprite = sprite(...tokenRgbParts("primary"));
  amberSprite = sprite(...tokenRgbParts("processing"));
  roseSprite = sprite(...tokenRgbParts("error"));
  /** Phase 4.3E — reduced motion: static final states, no continuous animation. */
  private reducedMotion = false;
  private raf = 0;
  private lastT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.setGraph({ nodes: NODES, edges: EDGES, spatialCards: [] });
  }

  setGraph(graph: GraphModel) {
    this.paths = [];
    this.outgoing.clear();
    this.nodeMap.clear();
    this.energy.clear();
    this.packets = [];

    for (const n of graph.nodes) {
      this.nodeMap.set(n.id, n);
      // Authoritative activation hint: active/blocked nodes begin with a
      // brief decaying glow (§2 — state-driven, never interaction-fabricated).
      this.energy.set(n.id, n.state === "active" || n.state === "blocked" ? 0.3 : 0);
    }

    const prevFill = this.fill;
    this.fill = new Map();

    // §5 — deliberate crossings: later edges hop over earlier ones, in edge
    // order. Only the edges the engine actually receives (visible ones)
    // participate, so hops never reference hidden orchestration plumbing.
    const routedRaw: RP[][] = [];
    graph.edges.forEach((e, index) => {
      const raw = insertHops(e.pts, routedRaw);
      routedRaw.push(e.pts.map(([x, y]) => ({ x, y })));

      const pts = samplePath(raw);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      }
      this.paths.push({ pts, cum, len: cum[cum.length - 1], edge: e, index, emit: ((index % 5) * 140) / 1000 });
      if (!this.outgoing.has(e.from)) this.outgoing.set(e.from, []);
      this.outgoing.get(e.from)!.push(index);

      // §4 — progressive fill: newly-active relationships fill 0→1;
      // relationships that stay active across refreshes stay filled.
      const active = e.state === "active";
      const prev = prevFill.get(e.id);
      this.fill.set(e.id, active ? { active: true, q: prev && prev.active ? prev.q : 0 } : { active: false, q: 1 });
    });
  }

  setScale(scale: number) {
    this.setViewport(DESIGN_W * scale, DESIGN_H * scale, scale, 0, 0);
  }

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

  pointAt(p: Sampled, d: number): P {
    const cum = p.cum;
    if (d <= 0) return p.pts[0];
    if (d >= p.len) return p.pts[p.pts.length - 1];
    let lo = 0,
      hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1;
    const t = (d - cum[lo]) / seg;
    return { x: p.pts[lo].x + (p.pts[hi].x - p.pts[lo].x) * t, y: p.pts[lo].y + (p.pts[hi].y - p.pts[lo].y) * t };
  }

  /**
   * §4 — "target node activates": one restrained fast thin wave, a slower
   * soft bloom and one ~60ms specular sweep across the node — all spawned
   * ONLY by a real arrival event (packet completing an authoritative edge).
   * No ember bursts, no dual shockwaves, no sparks (§7).
   */
  arrive(nodeId: string, x: number, y: number, tone: PacketTone = "cyan") {
    this.energy.set(nodeId, 1);
    this.rings.push({
      x,
      y,
      life: 0,
      max: ARRIVAL_LANGUAGE.waveLifeMs / 1000,
      r: ARRIVAL_LANGUAGE.ringRadius,
      tone,
    });
    const n = this.nodeMap.get(nodeId);
    const bloomR = n ? Math.max(n.w, n.h) * 0.92 : ARRIVAL_LANGUAGE.ringRadius;
    this.blooms.push({
      x,
      y,
      r: bloomR,
      life: 0,
      max: (ARRIVAL_LANGUAGE.bloomAttackMs + ARRIVAL_LANGUAGE.bloomDecayMs) / 1000,
      tone,
    });
    if (n) {
      this.sweeps.push({
        x: n.x,
        y: n.y,
        w: n.w,
        h: n.h,
        life: 0,
        max: ARRIVAL_LANGUAGE.sweepMs / 1000,
        tone,
      });
    }
  }

  step(dt: number) {
    // Phase 4.3E — prefers-reduced-motion: render the correct FINAL/STATIC
    // state only. Active conduit fills complete instantly, no comets, no
    // arrival rings, no glow decay/pulse oscillation, time frozen. The
    // React perimeter layer applies the same policy via CSS guards.
    if (this.reducedMotion) {
      for (const p of this.paths) {
        const f = this.fill.get(p.edge.id);
        if (f && f.active) f.q = 1;
        p.emit = 0;
      }
      this.packets = [];
      this.rings = [];
      this.blooms = [];
      this.sweeps = [];
      for (const [k] of this.energy) this.energy.set(k, 0);
      return;
    }

    this.time += dt;

    // §4 — progressive source→target conduit fill for active relationships.
    const fillStep = dt / (MOTION_TOKENS.conduitFillMs / 1000);
    for (const p of this.paths) {
      const f = this.fill.get(p.edge.id);
      if (f && f.active && f.q < 1) f.q = Math.min(1, f.q + fillStep);
    }

    // §2/§4 — deterministic comet emission. ONLY authoritative active or
    // blocked relationships emit energy; cadence, speed and trail derive
    // from the edge's graph index (same graph ⇒ same behavior). Idle
    // relationships never emit (§1 calm baseline).
    for (const p of this.paths) {
      const active = p.edge.state === "active" || p.edge.state === "blocked";
      if (!active) {
        p.emit = 0;
        continue;
      }
      p.emit += dt;
      const cadence = (MOTION_TOKENS.cometCadenceMs + (p.index % 5) * 140) / 1000;
      if (p.emit >= cadence) {
        p.emit -= cadence;
        if (this.packets.length < 24) {
          this.packets.push({
            e: p.index,
            d: 0,
            speed: MOTION_TOKENS.signalVelocityPxPerSec + (p.index % 4) * 18,
            tone: toneForEdge(p.edge),
            trail: 46 + (p.index % 3) * 8,
          });
        }
      }
    }

    // Comet advance along the exact routed path (§4/§5).
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const pk = this.packets[i];
      const path = this.paths[pk.e];
      if (!path) {
        this.packets.splice(i, 1);
        continue;
      }
      pk.d += pk.speed * dt;

      if (pk.d < path.len) continue;

      // Target node receives a short, restrained activation (§4).
      const to = path.edge.to;
      const end = path.pts[path.pts.length - 1];
      this.arrive(to, end.x, end.y, pk.tone);

      // The next AUTHORITATIVE relationship may activate. Energy never
      // continues onto idle relationships — no fabricated activity (§2).
      const next = this.outgoing.get(to) ?? [];
      const activeNext = next.filter((idx) => {
        const s = this.paths[idx]?.edge.state;
        return s === "active" || s === "blocked";
      });
      if (activeNext.length && this.packets.length < 36) {
        this.hopSeq++;
        const nextIdx = activeNext[this.hopSeq % activeNext.length];
        const np = this.paths[nextIdx];
        pk.e = nextIdx;
        pk.d = 0;
        pk.speed = MOTION_TOKENS.signalVelocityPxPerSec + (nextIdx % 4) * 18;
        pk.trail = 46 + (nextIdx % 3) * 8;
        pk.tone = toneForEdge(np.edge);
      } else {
        this.packets.splice(i, 1);
      }
    }

    // §4 — node activation decay (MOTION_TOKENS.activationDecayMs).
    const decay = 1 / (MOTION_TOKENS.activationDecayMs / 1000);
    for (const [k, v] of this.energy) {
      this.energy.set(k, v * Math.exp(-decay * dt));
    }

    // Arrival wave / bloom / sweep lifetimes.
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life += dt;
      if (ring.life >= ring.max) this.rings.splice(i, 1);
    }
    for (let i = this.blooms.length - 1; i >= 0; i--) {
      const bloom = this.blooms[i];
      bloom.life += dt;
      if (bloom.life >= bloom.max) this.blooms.splice(i, 1);
    }
    for (let i = this.sweeps.length - 1; i >= 0; i--) {
      const sweep = this.sweeps[i];
      sweep.life += dt;
      if (sweep.life >= sweep.max) this.sweeps.splice(i, 1);
    }
  }

  render() {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const k = this.scale * this.dpr;
    g.setTransform(k, 0, 0, k, this.tx * this.dpr, this.ty * this.dpr);
    g.lineCap = "round";
    g.lineJoin = "round";

    // --- Static technical chrome (grid crosshairs) — §1 calm baseline.
    g.save();
    g.strokeStyle = CANVAS_CHROME.crosshair;
    g.lineWidth = 1;
    for (let gx = 180; gx <= 1520; gx += 260) {
      for (let gy = 200; gy <= 780; gy += 240) {
        g.beginPath();
        g.moveTo(gx - 4, gy);
        g.lineTo(gx + 4, gy);
        g.moveTo(gx, gy - 4);
        g.lineTo(gx, gy + 4);
        g.stroke();
      }
    }
    g.restore();

    // §3 — blocked state only: restrained slow pulse (no particles, §7).
    const blockedPulseAngle = (Math.PI * 2) / (MOTION_TOKENS.pulseCycleMs / 1000);

    // --- Conduits (§1 calm · §3 state color · §4 progressive fill · §5 routed)
    for (const p of this.paths) {
      const e = p.edge;
      const lit = Math.max(this.energy.get(e.from) || 0, this.energy.get(e.to) || 0);
      const key = conduitTreatmentFor(e);
      const c = CONDUIT_LANGUAGE[key];

      g.beginPath();
      g.moveTo(p.pts[0].x, p.pts[0].y);
      for (let i = 1; i < p.pts.length; i++) g.lineTo(p.pts[i].x, p.pts[i].y);

      if (c.additive) {
        g.save();
        g.globalCompositeOperation = "lighter";
      }
      const pulse = key === "blocked" ? Math.sin(this.time * blockedPulseAngle) * 0.06 : 0;
      g.strokeStyle = `rgba(${c.base},${Math.min(1, c.baseAlpha + lit * 0.1 + pulse).toFixed(3)})`;
      g.lineWidth = c.baseWidth;
      g.stroke();
      g.strokeStyle = `rgba(${c.core},${Math.min(1, c.coreAlpha + lit * 0.25 + pulse).toFixed(3)})`;
      g.lineWidth = c.coreWidth;
      g.stroke();
      if (c.additive) {
        g.restore();
      }

      // §4 — progressive source→target fill (running / external action only).
      if (c.fillWidth > 0) {
        const f = this.fill.get(e.id);
        const q = f ? f.q : 1;
        const upto = q * p.len;
        if (upto > 0.5) {
          if (c.additive) {
            g.save();
            g.globalCompositeOperation = "lighter";
          }
          g.beginPath();
          g.moveTo(p.pts[0].x, p.pts[0].y);
          for (let i = 1; i < p.pts.length; i++) {
            if (p.cum[i] <= upto) {
              g.lineTo(p.pts[i].x, p.pts[i].y);
            } else {
              const t = (upto - p.cum[i - 1]) / (p.cum[i] - p.cum[i - 1] || 1);
              g.lineTo(
                p.pts[i - 1].x + (p.pts[i].x - p.pts[i - 1].x) * t,
                p.pts[i - 1].y + (p.pts[i].y - p.pts[i - 1].y) * t
              );
              break;
            }
          }
          g.strokeStyle = `rgba(${c.bright},${c.fillAlpha})`;
          g.lineWidth = c.fillWidth;
          g.stroke();
          // Fill front — the leading edge of the activation (§4).
          if (q < 1) {
            const front = this.pointAt(p, upto);
            const spr = toneForEdge(e) === "amber" ? this.amberSprite : this.blueSprite;
            g.drawImage(spr, front.x - 7, front.y - 7, 14, 14);
          }
          if (c.additive) {
            g.restore();
          }
        }
      }

      // Arrowheads — tinted per treatment, strictly static (§1: no idle
      // oscillation; node energy may brighten them transiently).
      if (e.arrow) {
        const n = p.pts.length;
        const b = p.pts[n - 1];
        const a = p.pts[n - 4] || p.pts[0];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        g.fillStyle = `rgba(${c.core},${Math.min(1, c.arrowAlpha + lit * 0.2).toFixed(3)})`;
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - Math.cos(ang - 0.45) * 9.5, b.y - Math.sin(ang - 0.45) * 9.5);
        g.lineTo(b.x - Math.cos(ang + 0.45) * 9.5, b.y - Math.sin(ang + 0.45) * 9.5);
        g.closePath();
        g.fill();
      }
    }

    g.globalCompositeOperation = "lighter";

    // --- Node activation glow (§4: destination activates, then settles).
    for (const n of this.nodeMap.values()) {
      const en = this.energy.get(n.id) || 0;
      if (en < 0.02) continue;
      const r = Math.max(n.w, n.h) * (0.85 + en * 0.35);
      const rgb = n.state === "blocked" ? BLOCKED.rgb : RUNNING.rgb;
      const gr = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
      gr.addColorStop(0, `rgba(${rgb},${ARRIVAL_LANGUAGE.glowAlpha * en})`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(n.x - r, n.y - r, r * 2, r * 2);
    }

    // --- Comets (§4: directional energy on the exact routed path).
    // Phase 4.5 — refined treatment: a short soft trail of sprite samples
    // with Gaussian-like falloff along the exact routed path (never an
    // independent particle system, §4/§8), plus one restrained low-alpha
    // halo pass beneath the head. The additive "lighter" composite above
    // provides the low-alpha additive pass; semantics (cadence, speed,
    // emission — real signals on real relationships only) are unchanged.
    for (const pk of this.packets) {
      const p = this.paths[pk.e];
      if (!p) continue;
      const head = this.pointAt(p, pk.d);
      const isAmber = pk.tone === "amber";
      const isRose = pk.tone === "rose";
      const spr = isAmber ? this.amberSprite : isRose ? this.roseSprite : this.blueSprite;

      // Soft trail — sprite samples behind the head, Gaussian alpha profile.
      const steps = 8;
      const sigma = 0.42;
      for (let i = steps; i >= 1; i--) {
        const d = pk.d - (pk.trail * i) / steps;
        if (d < 0) continue;
        const u = i / steps;
        const q = this.pointAt(p, d);
        const a = Math.exp(-(u * u) / (2 * sigma * sigma)) * 0.5;
        const r = 2.2 + (1 - u) * 3.2;
        g.globalAlpha = a;
        g.drawImage(spr, q.x - r, q.y - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;

      // Restrained halo — one wider low-alpha pass beneath the head sprite.
      g.globalAlpha = 0.3;
      const hs = 15;
      g.drawImage(spr, head.x - hs, head.y - hs, hs * 2, hs * 2);
      g.globalAlpha = 1;

      // Comet head.
      const s = 11;
      g.drawImage(spr, head.x - s, head.y - s, s * 2, s * 2);
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.beginPath();
      g.arc(head.x, head.y, 2, 0, Math.PI * 2);
      g.fill();
    }

    // --- Phase 4.5 arrival blooms (slower soft glow: attack, then decay).
    for (const b of this.blooms) {
      const attack = ARRIVAL_LANGUAGE.bloomAttackMs / 1000;
      const t = b.life;
      let a: number;
      if (t < attack) a = t / attack;
      else a = Math.max(0, 1 - (t - attack) / Math.max(0.001, b.max - attack));
      a *= ARRIVAL_LANGUAGE.bloomAlpha;
      if (a <= 0.004) continue;
      const rgb =
        b.tone === "amber" ? EXTERNAL.rgb : b.tone === "rose" ? BLOCKED.rgb : RUNNING.rgb;
      const rr = b.r * (0.92 + 0.22 * (t / b.max));
      const gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, rr);
      gr.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
      gr.addColorStop(0.55, `rgba(${rgb},${(a * 0.35).toFixed(3)})`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(b.x - rr, b.y - rr, rr * 2, rr * 2);
    }

    // --- Phase 4.5 specular sweeps (~60ms, clipped to the arriving node,
    //     additive, deterministic diagonal direction — real arrivals only).
    for (const sw of this.sweeps) {
      const k2 = sw.life / sw.max;
      const a = Math.sin(Math.PI * (0.15 + 0.7 * k2)) * ARRIVAL_LANGUAGE.sweepAlpha;
      if (a <= 0.004) continue;
      const rgb =
        sw.tone === "amber" ? EXTERNAL.rgbBright : sw.tone === "rose" ? BLOCKED.rgbBright : RUNNING.rgbBright;
      g.save();
      g.beginPath();
      g.rect(sw.x - sw.w / 2, sw.y - sw.h / 2, sw.w, sw.h);
      g.clip();
      const band = 0.5;
      const lead = -band + (1 + band) * k2;
      const x0 = sw.x - sw.w / 2;
      const g0 = x0 + lead * sw.w;
      const g1 = g0 + band * sw.w;
      const gr = g.createLinearGradient(g0, sw.y - sw.h, g1, sw.y + sw.h);
      gr.addColorStop(0, `rgba(${rgb},0)`);
      gr.addColorStop(0.5, `rgba(${rgb},${a.toFixed(3)})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(sw.x - sw.w / 2, sw.y - sw.h / 2, sw.w, sw.h);
      g.restore();
    }

    // --- Arrival waves (fast, thin, single — §7 restraint).
    for (const r of this.rings) {
      const k2 = r.life / r.max;
      const alpha = (1 - k2) * ARRIVAL_LANGUAGE.waveAlpha;
      const rgb =
        r.tone === "amber" ? EXTERNAL.rgb : r.tone === "rose" ? BLOCKED.rgb : RUNNING.rgb;
      g.strokeStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
      g.lineWidth = ARRIVAL_LANGUAGE.waveWidth * (1 - k2) + 0.3;
      g.beginPath();
      g.arc(r.x, r.y, r.r * Math.pow(k2, 0.45), 0, Math.PI * 2);
      g.stroke();
    }

    g.globalCompositeOperation = "source-over";
  }

  start() {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.reducedMotion = mq.matches;
      mq.addEventListener?.("change", (e) => {
        this.reducedMotion = e.matches;
      });
    }
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
