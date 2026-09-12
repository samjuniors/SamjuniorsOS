/**
 * FlowEngine — Living SamJuniorsOS company-context canvas & kinetics.
 * Phase 4.3B.1 — spatial company-context model:
 *  - Semantic regions (company / active work / related / governed outcomes)
 *    replace the execution-pipeline column grammar.
 *  - Work objects are first-class visual citizens; their local workflow is
 *    revealed on focus (never a globally persistent pipeline).
 *  - Agents are execution metadata (workforce chips), not the primary flow.
 *  - Edge layers separate structural / ownership / governance truth from
 *    orchestration plumbing (delegates), which stays inspector-only.
 * All positions are deterministic functions of authoritative GraphDTO state.
 */

import type { GraphDTO, GraphNodeDTO, GraphEdgeDTO } from "@/types/graph";
import {
  EXECUTION_LANGUAGE,
  ENTITY_IDENTITY,
  NEUTRAL_CONDUIT,
  CANVAS_CHROME,
  tokenRgbParts,
} from "@/components/workflow/execution-language";

/*
 * Phase 4.3C-B.1 — Canonical execution-language palette.
 *
 * All engine colors derive from the Phase 4.1 token library via
 * EXECUTION_LANGUAGE (running=blue/cyan, externalAction=amber,
 * completed=green, blocked=red, idle=neutral). Sophia's core heat is her
 * ENTITY_IDENTITY fire treatment (identity axis, distinct from execution
 * state). Packet/conduit/ring/glow VALUES changed to the canonical tokens;
 * every behavioral trigger, threshold, timing, and size is unchanged.
 */
const RUNNING = EXECUTION_LANGUAGE.running;
const EXTERNAL = EXECUTION_LANGUAGE.externalAction;
const DONE = EXECUTION_LANGUAGE.completed;
const BLOCKED = EXECUTION_LANGUAGE.blocked;
/** Sophia identity fire (rgb triplet) — orchestrator heat treatment. */
const SOPHIA_RGB = sophiaRgb();
function sophiaRgbParts(): [number, number, number] {
  const h = ENTITY_IDENTITY.sophia.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function sophiaRgb(): string {
  // #fb923c identity tint → rgb triplet
  return sophiaRgbParts().join(',');
}

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

/**
 * Computes port-matched conduit route points between source and target nodes
 */
function computeEdgePoints(fromNode: FlowNode, toNode: FlowNode): [number, number][] {
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;

  let x1 = fromNode.x;
  let y1 = fromNode.y;
  let x2 = toNode.x;
  let y2 = toNode.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal primary flow
    if (dx >= 0) {
      x1 = fromNode.x + fromNode.w / 2;
      x2 = toNode.x - toNode.w / 2;
    } else {
      x1 = fromNode.x - fromNode.w / 2;
      x2 = toNode.x + toNode.w / 2;
    }
  } else {
    // Vertical primary flow
    if (dy >= 0) {
      y1 = fromNode.y + fromNode.h / 2;
      y2 = toNode.y - toNode.h / 2;
    } else {
      y1 = fromNode.y - fromNode.h / 2;
      y2 = toNode.y + toNode.h / 2;
    }
  }

  if (Math.abs(y1 - y2) < 4 || Math.abs(x1 - x2) < 4) {
    return [[x1, y1], [x2, y2]];
  }
  const midX = Math.round((x1 + x2) / 2);
  return [[x1, y1], [midX, y1], [midX, y2], [x2, y2]];
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

/**
 * Maps authoritative GraphDTO (Phase 4.3A server projection) into FlowEngine
 * GraphModel under the Phase 4.3B.1 spatial company-context grammar.
 * Preserves exact relationship taxonomies, edge layers, and spatial cards.
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

  const edges: FlowEdge[] = dto.edges.map((e) => {
    const fromNode = nodeMap.get(e.source);
    const toNode = nodeMap.get(e.target);

    let pts: [number, number][] = [];
    if (fromNode && toNode) {
      pts = computeEdgePoints(fromNode, toNode);
    } else if (e.points && e.points.length >= 2) {
      pts = e.points;
    }

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

    return {
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
    };
  });

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
type Sampled = { pts: P[]; cum: number[]; len: number; edge: FlowEdge; index: number };
type PacketTone = "cyan" | "amber" | "emerald" | "rose" | "fire" | "white";
type Packet = { e: number; d: number; speed: number; tone: PacketTone; trail: number };
type Ember = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; heat: number; color: string };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };
type Ring = { x: number; y: number; life: number; max: number; r: number; tone: PacketTone; isSecondary?: boolean };

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

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Collision-aware vertical column layout engine.
 * Computes balanced Y coordinates for nodes in a column respecting their bounding box heights,
 * applying relaxation passes to eliminate any overlap.
 */
function layoutColumn(nodesInCol: FlowNode[], centerY = 440, minGap = 24) {
  if (nodesInCol.length === 0) return;
  if (nodesInCol.length === 1) {
    nodesInCol[0].y = centerY;
    return;
  }
  const totalH = nodesInCol.reduce((sum, n) => sum + n.h, 0) + (nodesInCol.length - 1) * minGap;
  let curY = centerY - totalH / 2;
  for (const n of nodesInCol) {
    n.y = Math.round(curY + n.h / 2);
    curY += n.h + minGap;
  }
  // Boundary safeguards & relaxation passes
  for (let iter = 0; iter < 4; iter++) {
    for (let i = 0; i < nodesInCol.length - 1; i++) {
      const a = nodesInCol[i];
      const b = nodesInCol[i + 1];
      const reqDist = (a.h + b.h) / 2 + minGap;
      const actualDist = b.y - a.y;
      if (actualDist < reqDist) {
        const overlap = (reqDist - actualDist) / 2;
        a.y = Math.max(120, Math.round(a.y - overlap));
        b.y = Math.min(780, Math.round(b.y + overlap));
      }
    }
  }
}

/**
 * Dynamic, collision-aware orthogonal conduit connector.
 */
function connectNodes(
  fromNode: FlowNode,
  toNode: FlowNode,
  id: string,
  style: EdgeStyle,
  relationship: GraphRelationship,
  state: GraphNodeState,
  activity?: string
): FlowEdge {
  const pts = computeEdgePoints(fromNode, toNode);
  return {
    id,
    from: fromNode.id,
    to: toNode.id,
    pts,
    style,
    arrow: true,
    relationship,
    state,
    activity,
    layer: layerForRelationship(relationship),
  };
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
  const edges: FlowEdge[] = [];
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
  edges.push(
    connectNodes(
      founderNode,
      coreNode,
      "e-founder-core",
      hasActiveWork ? "cyan" : "white",
      "delegates",
      hasActiveWork ? "active" : "idle",
      hasActiveWork ? "Dispatching directives" : undefined
    )
  );

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
  edges.push(
    connectNodes(
      coreNode,
      thorneNode,
      "e-core-thorne",
      hasActiveWork ? "cyan" : "white",
      "delegates",
      hasActiveWork ? "active" : "idle",
      hasActiveWork ? "Delegating research" : undefined
    )
  );

  if (financeNode) {
    edges.push(
      connectNodes(
        coreNode,
        financeNode,
        "e-core-finance",
        financeNode.state === "active" ? "cyan" : "white",
        "models_finance",
        financeNode.state,
        "Modeling unit economics"
      )
    );
  }

  if (pmNode) {
    edges.push(
      connectNodes(
        thorneNode,
        pmNode,
        "e-thorne-pm",
        pmNode.state === "active" ? "cyan" : "white",
        "authors_prd",
        pmNode.state,
        "Feeding research into PRD"
      )
    );
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
    edges.push(
      connectNodes(
        assignedSpecialist,
        stepNode,
        `e-spec-${w.id}`,
        edgeStyle,
        relationship,
        isBlk ? "blocked" : isAct ? "active" : isDone ? "complete" : "idle",
        w.title
      )
    );
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
    edges.push(
      connectNodes(
        thorneNode,
        verifierNode,
        "e-thorne-verifier",
        "white",
        "checks",
        "idle",
        undefined
      )
    );
  } else {
    protocolStepNodes.forEach((stepNode) => {
      const isReview = stepNode.state === "active" && (stepNode.subtitle?.includes("Review") || stepNode.subtitle?.includes("Synthesis"));
      const isBlk = stepNode.state === "blocked";
      const edgeStyle: EdgeStyle = isBlk ? "rose" : isReview ? "cyan" : "white";
      edges.push(
        connectNodes(
          stepNode,
          verifierNode,
          `e-ver-${stepNode.id}`,
          edgeStyle,
          "checks",
          isBlk ? "blocked" : isReview ? "active" : "idle"
        )
      );
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
  edges.push(
    connectNodes(
      verifierNode,
      outcomeNode,
      "e-verifier-outcome",
      doneWork.length > 0 ? "emerald" : "white",
      "feeds",
      doneWork.length > 0 ? "complete" : "idle"
    )
  );

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
    edges.push(
      connectNodes(
        coreNode,
        approvalNode,
        "e-sophia-approval",
        "amber",
        "escalates-to",
        "blocked",
        "Escalating decision"
      )
    );

    // Approval Gate escalates to Founder
    edges.push(
      connectNodes(
        approvalNode,
        founderNode,
        "e-approval-founder",
        "amber",
        "escalates-to",
        "blocked",
        "Requires Founder Ratification"
      )
    );
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

  return { nodes, edges, spatialCards };
}

// Static fallback nodes/edges for compatibility
export const NODES: FlowNode[] = deriveGraph({ work: [], decisions: [] }).nodes;
export const EDGES: FlowEdge[] = deriveGraph({ work: [], decisions: [] }).edges;

/**
 * FlowEngine canvas particle renderer.
 * Produces high-fidelity orthogonal circuit lines, directional laser streaks,
 * trailing spark physics, dual-ring arrival shockwaves, and ambient breathing.
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
  embers: Ember[] = [];
  sparks: Spark[] = [];
  rings: Ring[] = [];
  energy = new Map<string, number>();
  coreHeat = 0.3;
  spawnTimer = 0;
  emberAcc = 0;

  blueSprite = sprite(...tokenRgbParts('primary'));
  fireSprite = sprite(...sophiaRgbParts());
  amberSprite = sprite(...tokenRgbParts('processing'));
  emeraldSprite = sprite(...tokenRgbParts('success'));
  roseSprite = sprite(...tokenRgbParts('error'));
  whiteSprite = sprite(240, 245, 255);
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
      this.energy.set(n.id, n.state === "active" || n.state === "blocked" ? 0.4 : 0);
    }

    graph.edges.forEach((e, index) => {
      const pts = samplePath(e.pts);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      }
      this.paths.push({ pts, cum, len: cum[cum.length - 1], edge: e, index });
      if (!this.outgoing.has(e.from)) this.outgoing.set(e.from, []);
      this.outgoing.get(e.from)!.push(index);
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
   * Spawns data packets ONLY when there is actual active or blocked operational activity.
   * Zero synthetic packets are spawned during idle state.
   */
  spawn(randomStart = false) {
    const activePaths = this.paths.filter((p) => p.edge.state === "active" || p.edge.state === "blocked");
    if (!activePaths.length) return;
    const p = activePaths[Math.floor(Math.random() * activePaths.length)];
    const tone: PacketTone =
      p.edge.style === "rose"
        ? "rose"
        : p.edge.style === "amber"
        ? "amber"
        : p.edge.style === "emerald"
        ? "emerald"
        : "cyan";

    this.packets.push({
      e: p.index,
      d: randomStart ? Math.random() * p.len : 0,
      speed: rnd(160, 240),
      tone,
      trail: rnd(45, 70),
    });
  }

  /**
   * Dual-ring arrival shockwave and target perimeter illumination.
   */
  arrive(nodeId: string, x: number, y: number, tone: PacketTone = "cyan") {
    this.energy.set(nodeId, 1);
    const isCore = nodeId === "core";
    const isBlocked = tone === "rose" || this.nodeMap.get(nodeId)?.state === "blocked";
    const ringTone: PacketTone = isCore ? "fire" : isBlocked ? "rose" : tone === "amber" ? "amber" : tone === "emerald" ? "emerald" : "cyan";

    // Primary fast shockwave ring
    this.rings.push({
      x,
      y,
      life: 0,
      max: isCore ? 0.7 : 0.38,
      r: isCore ? 140 : 64,
      tone: ringTone,
    });

    // Secondary soft dissipation halo ring
    this.rings.push({
      x,
      y,
      life: 0,
      max: isCore ? 0.9 : 0.6,
      r: isCore ? 180 : 92,
      tone: ringTone,
      isSecondary: true,
    });

    const count = isCore ? 32 : 18;
    this.burstFire(x, y, count, ringTone);

    if (isCore) {
      this.coreHeat = Math.min(1.6, this.coreHeat + 0.6);
      const c = this.nodeMap.get("core");
      if (c) {
        for (let i = 0; i < 18; i++) {
          this.embers.push({
            x: c.x - c.w / 2 + Math.random() * c.w,
            y: c.y - c.h / 2,
            vx: rnd(-22, 22),
            vy: rnd(-130, -50),
            life: 0,
            max: rnd(0.45, 0.95),
            size: rnd(1.4, 3.2),
            heat: rnd(0.4, 1),
            color: ENTITY_IDENTITY.sophia,
          });
        }
      }
    }
  }

  burstFire(x: number, y: number, n: number, tone: PacketTone = "cyan") {
    const col =
      tone === "amber"
        ? EXTERNAL.bright
        : tone === "rose"
        ? BLOCKED.bright
        : tone === "emerald"
        ? DONE.bright
        : tone === "fire"
        ? ENTITY_IDENTITY.sophia
        : RUNNING.bright;

    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(35, 170);
      this.embers.push({
        x: x + rnd(-8, 8),
        y: y + rnd(-8, 8),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        max: rnd(0.35, 0.85),
        size: rnd(1.0, 2.8),
        heat: Math.random(),
        color: col,
      });
    }
  }

  step(dt: number) {
    this.time += dt;
    const core = this.nodeMap.get("core");
    const hasActiveEdges = this.paths.some((p) => p.edge.state === "active" || p.edge.state === "blocked");

    // Dynamic packet spawner: ONLY active when real work is in flight
    if (hasActiveEdges) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.packets.length < 24) {
        this.spawnTimer = rnd(0.7, 1.3);
        this.spawn();
      }
    } else {
      // Idle state: strictly NO fake packets generated
      this.spawnTimer = 0;
    }

    // Packet advance, directional angle & trail physics
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const pk = this.packets[i];
      const path = this.paths[pk.e];
      if (!path) {
        this.packets.splice(i, 1);
        continue;
      }
      pk.d += pk.speed * dt;

      // Trailing micro-spark emission along motion vector
      if (Math.random() < 0.4) {
        const head = this.pointAt(path, pk.d);
        const prev = this.pointAt(path, Math.max(0, pk.d - 6));
        const ang = Math.atan2(head.y - prev.y, head.x - prev.x);
        const spMag = rnd(25, 55);

        this.sparks.push({
          x: head.x + rnd(-2, 2),
          y: head.y + rnd(-2, 2),
          vx: -Math.cos(ang) * spMag + Math.sin(ang) * rnd(-15, 15),
          vy: -Math.sin(ang) * spMag - Math.cos(ang) * rnd(-15, 15),
          life: 0,
          max: rnd(0.18, 0.4),
          size: rnd(1.0, 2.2),
          color:
            pk.tone === "amber"
              ? EXTERNAL.bright
              : pk.tone === "rose"
              ? BLOCKED.bright
              : pk.tone === "emerald"
              ? DONE.bright
              : RUNNING.bright,
        });
      }

      if (pk.d < path.len) continue;

      const to = path.edge.to;
      const end = path.pts[path.pts.length - 1];
      this.arrive(to, end.x, end.y, pk.tone);

      const next = this.outgoing.get(to);
      const activeNext = next?.filter((idx) => this.paths[idx]?.edge.state === "active" || this.paths[idx]?.edge.state === "blocked");
      const candidates = (activeNext && activeNext.length ? activeNext : next) || [];

      if (candidates.length && Math.random() < 0.85 && this.packets.length < 36) {
        pk.e = candidates[Math.floor(Math.random() * candidates.length)];
        pk.d = 0;
        pk.speed = rnd(150, 230);
        const nextEdge = this.paths[pk.e].edge;
        pk.tone =
          nextEdge.style === "rose"
            ? "rose"
            : nextEdge.style === "amber"
            ? "amber"
            : nextEdge.style === "emerald"
            ? "emerald"
            : "cyan";
      } else {
        this.packets.splice(i, 1);
      }
    }

    // Energy decay
    for (const [k, v] of this.energy) {
      this.energy.set(k, v * Math.exp(-2.5 * dt));
    }
    this.coreHeat = 0.3 + (this.coreHeat - 0.3) * Math.exp(-1.4 * dt);

    // Sophia Core perimeter combustion: active only when Sophia is orchestrating
    this.emberAcc += core && core.state === "active" ? dt * 38 : 0;
    while (core && this.emberAcc > 1) {
      this.emberAcc -= 1;
      const per = (core.w + core.h) * 2;
      let d = Math.random() * per;
      let x = core.x - core.w / 2,
        y = core.y - core.h / 2;
      if (d < core.w) x += d;
      else if ((d -= core.w) < core.h) {
        x += core.w;
        y += d;
      } else if ((d -= core.h) < core.w) {
        x += core.w - d;
        y += core.h;
      } else {
        y += d - core.w;
      }
      this.embers.push({
        x: x + rnd(-3, 3),
        y: y + rnd(-3, 3),
        vx: rnd(-20, 20),
        vy: rnd(-70, -15),
        life: 0,
        max: rnd(0.35, 0.9),
        size: rnd(0.8, 2.2),
        heat: Math.random(),
        color: ENTITY_IDENTITY.sophia,
      });
    }

    // Embers update
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const em = this.embers[i];
      em.life += dt;
      if (em.life >= em.max) {
        this.embers.splice(i, 1);
        continue;
      }
      em.vy -= 35 * dt;
      em.vx += Math.sin(this.time * 8 + em.heat * 15) * 25 * dt;
      const dmp = Math.exp(-1.5 * dt);
      em.vx *= dmp;
      em.vy *= dmp;
      em.x += em.vx * dt;
      em.y += em.vy * dt;
    }

    // Sparks update
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.life += dt;
      if (sp.life >= sp.max) {
        this.sparks.splice(i, 1);
        continue;
      }
      sp.vx *= Math.exp(-2.0 * dt);
      sp.vy *= Math.exp(-2.0 * dt);
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
    }

    // Rings update
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life += dt;
      if (ring.life >= ring.max) {
        this.rings.splice(i, 1);
      }
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

    // --- Technical Circuit Crosshairs & Coordinates
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

    // Ambient breathing oscillation (sine wave)
    const ambientBreath = Math.sin(this.time * 1.5) * 0.04;

    // --- Connectors (Orthogonal Conduits)
    for (const p of this.paths) {
      const e = p.edge;
      const eFrom = this.energy.get(e.from) || 0;
      const eTo = this.energy.get(e.to) || 0;
      const lit = Math.max(eFrom, eTo);

      g.beginPath();
      g.moveTo(p.pts[0].x, p.pts[0].y);
      for (let i = 1; i < p.pts.length; i++) g.lineTo(p.pts[i].x, p.pts[i].y);

      if (e.style === "rose" || e.state === "blocked") {
        g.save();
        g.globalCompositeOperation = "lighter";
        g.strokeStyle = `rgba(${BLOCKED.rgb},${0.25 + lit * 0.35 + Math.sin(this.time * 5) * 0.1})`;
        g.lineWidth = 8;
        g.stroke();
        g.strokeStyle = `rgba(${BLOCKED.rgbBright},${0.68 + lit * 0.32})`;
        g.lineWidth = 2.2;
        g.stroke();
        g.restore();
      } else if (e.style === "amber") {
        g.save();
        g.globalCompositeOperation = "lighter";
        g.strokeStyle = `rgba(${EXTERNAL.rgb},${0.25 + lit * 0.3 + Math.sin(this.time * 4) * 0.08})`;
        g.lineWidth = 8;
        g.stroke();
        g.strokeStyle = `rgba(${EXTERNAL.rgbBright},${0.68 + lit * 0.3})`;
        g.lineWidth = 2.2;
        g.stroke();
        g.restore();
      } else if (e.style === "emerald" || e.state === "complete") {
        g.save();
        g.strokeStyle = `rgba(${DONE.rgb},${0.18 + lit * 0.22})`;
        g.lineWidth = 5;
        g.stroke();
        g.strokeStyle = `rgba(${DONE.rgbBright},${0.55 + lit * 0.3})`;
        g.lineWidth = 1.8;
        g.stroke();
        g.restore();
      } else if (e.style === "cyan" || e.state === "active") {
        g.save();
        g.globalCompositeOperation = "lighter";
        g.strokeStyle = `rgba(${RUNNING.rgb},${0.28 + lit * 0.35})`;
        g.lineWidth = 9;
        g.stroke();
        g.strokeStyle = `rgba(${RUNNING.rgbBright},${0.68 + lit * 0.32})`;
        g.lineWidth = 2.2;
        g.setLineDash([8, 10]);
        g.lineDashOffset = -this.time * 65;
        g.stroke();
        g.setLineDash([]);
        g.restore();
      } else {
        // Quiet idle baseline conduit (ambient breathing, no flurry)
        g.strokeStyle = `${NEUTRAL_CONDUIT.base}${0.16 + ambientBreath + lit * 0.1})`;
        g.lineWidth = 4;
        g.stroke();
        g.strokeStyle = `${NEUTRAL_CONDUIT.core}${0.24 + ambientBreath + lit * 0.2})`;
        g.lineWidth = 1.4;
        g.stroke();
      }

      // Heat gradient entering Sophia core (identity fire treatment)
      if (e.to === "core") {
        const tail = 110;
        const start = Math.max(0, p.len - tail);
        const a = this.pointAt(p, start);
        const b = p.pts[p.pts.length - 1];
        const grad = g.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, `rgba(${SOPHIA_RGB},0)`);
        grad.addColorStop(1, `rgba(${SOPHIA_RGB},${0.5 + this.coreHeat * 0.35})`);
        g.save();
        g.globalCompositeOperation = "lighter";
        g.beginPath();
        let began = false;
        for (let i = 0; i < p.pts.length; i++) {
          if (p.cum[i] < start) continue;
          if (!began) {
            g.moveTo(a.x, a.y);
            began = true;
          }
          g.lineTo(p.pts[i].x, p.pts[i].y);
        }
        g.strokeStyle = grad;
        g.lineWidth = 5;
        g.stroke();
        g.restore();
      }

      // Arrowheads
      if (e.arrow) {
        const n = p.pts.length;
        const b = p.pts[n - 1],
          a = p.pts[n - 4] || p.pts[0];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        g.fillStyle =
          e.style === "rose"
            ? `rgba(${BLOCKED.rgbBright},${0.85 + lit * 0.15})`
            : e.style === "amber"
            ? `rgba(${EXTERNAL.rgbBright},${0.85 + lit * 0.15})`
            : e.style === "emerald"
            ? `rgba(${DONE.rgbBright},${0.85 + lit * 0.15})`
            : e.style === "cyan"
            ? `rgba(${RUNNING.rgbBright},${0.85 + lit * 0.15})`
            : `${NEUTRAL_CONDUIT.arrow}${0.55 + ambientBreath + lit * 0.2})`;

        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - Math.cos(ang - 0.45) * 9.5, b.y - Math.sin(ang - 0.45) * 9.5);
        g.lineTo(b.x - Math.cos(ang + 0.45) * 9.5, b.y - Math.sin(ang + 0.45) * 9.5);
        g.closePath();
        g.fill();
      }
    }

    g.globalCompositeOperation = "lighter";

    // --- Node Arrival Energy Glow
    for (const n of this.nodeMap.values()) {
      const en = this.energy.get(n.id) || 0;
      if (en < 0.02) continue;
      const r = Math.max(n.w, n.h) * (0.85 + en * 0.35);
      const isCore = n.id === "core";
      const isBlocked = n.state === "blocked";
      const gr = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
      if (isCore) {
        gr.addColorStop(0, `rgba(${SOPHIA_RGB},${0.45 * en})`);
      } else if (isBlocked) {
        gr.addColorStop(0, `rgba(${BLOCKED.rgb},${0.45 * en})`);
      } else {
        gr.addColorStop(0, `rgba(${RUNNING.rgb},${0.45 * en})`);
      }
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(n.x - r, n.y - r, r * 2, r * 2);
    }

    // --- Sophia Core Fire Border
    const c = this.nodeMap.get("core");
    if (c) {
      const heat = this.coreHeat;
      const x = c.x - c.w / 2 - 5,
        y = c.y - c.h / 2 - 5,
        w = c.w + 10,
        h = c.h + 10;
      g.save();
      g.shadowColor = `rgba(${SOPHIA_RGB},0.95)`;
      g.shadowBlur = 20 + heat * 24;
      g.strokeStyle = `rgba(${SOPHIA_RGB},${0.5 + heat * 0.4})`;
      g.lineWidth = 2.0 + heat * 1.5;
      g.beginPath();
      g.roundRect(x, y, w, h, 16);
      g.stroke();
      g.restore();

      const gr = g.createRadialGradient(c.x, c.y, c.w * 0.2, c.x, c.y, c.w * 0.8);
      gr.addColorStop(0, `rgba(${SOPHIA_RGB},${0.1 + heat * 0.1})`);
      gr.addColorStop(1, `rgba(${SOPHIA_RGB},0)`);
      g.fillStyle = gr;
      g.fillRect(c.x - c.w, c.y - c.w, c.w * 2, c.w * 2);
    }

    // --- Sparks
    for (const sp of this.sparks) {
      const k2 = 1 - sp.life / sp.max;
      g.globalAlpha = k2 * 0.9;
      g.fillStyle = sp.color;
      g.beginPath();
      g.arc(sp.x, sp.y, sp.size * k2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // --- Embers
    for (const em of this.embers) {
      const k2 = 1 - em.life / em.max;
      const s = em.size * (0.6 + k2) * 3;
      g.globalAlpha = Math.min(1, k2 * 1.3);
      g.drawImage(em.heat > 0.7 ? this.whiteSprite : this.fireSprite, em.x - s, em.y - s, s * 2, s * 2);
      g.globalAlpha = k2;
      g.fillStyle = em.color;
      g.beginPath();
      g.arc(em.x, em.y, em.size * 0.55 * (0.5 + k2), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // --- Directional Laser Streaks (Packets)
    for (const pk of this.packets) {
      const p = this.paths[pk.e];
      if (!p) continue;
      const head = this.pointAt(p, pk.d);
      const steps = 12;
      const spr =
        pk.tone === "amber"
          ? this.amberSprite
          : pk.tone === "rose"
          ? this.roseSprite
          : pk.tone === "emerald"
          ? this.emeraldSprite
          : pk.tone === "fire"
          ? this.fireSprite
          : pk.tone === "white"
          ? this.whiteSprite
          : this.blueSprite;

      const rgb =
        pk.tone === "amber"
          ? EXTERNAL.rgb
          : pk.tone === "rose"
          ? BLOCKED.rgb
          : pk.tone === "emerald"
          ? DONE.rgb
          : pk.tone === "fire"
          ? SOPHIA_RGB
          : pk.tone === "white"
          ? "255,255,255"
          : RUNNING.rgb;

      // Directional laser streak trail
      for (let i = steps; i >= 1; i--) {
        const d = pk.d - (pk.trail * i) / steps;
        if (d < 0) continue;
        const q = this.pointAt(p, d);
        const t = 1 - i / steps;
        const r = 0.8 + t * 2.6;
        g.fillStyle = `rgba(${rgb},${t * t * 0.85})`;
        g.beginPath();
        g.arc(q.x, q.y, r, 0, Math.PI * 2);
        g.fill();
      }

      // White-hot laser core pip
      const s = 12;
      g.drawImage(spr, head.x - s, head.y - s, s * 2, s * 2);
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(head.x, head.y, 2.2, 0, Math.PI * 2);
      g.fill();
    }

    // --- Arrival Shockwave Rings (Dual concentric rings)
    for (const r of this.rings) {
      const k2 = r.life / r.max;
      const alpha = r.isSecondary ? (1 - k2) * 0.45 : (1 - k2) * 0.8;
      const strokeCol =
        r.tone === "rose"
          ? `rgba(${BLOCKED.rgb},${alpha})`
          : r.tone === "amber"
          ? `rgba(${EXTERNAL.rgb},${alpha})`
          : r.tone === "emerald"
          ? `rgba(${DONE.rgb},${alpha})`
          : r.tone === "fire"
          ? `rgba(${SOPHIA_RGB},${alpha})`
          : `rgba(${RUNNING.rgb},${alpha})`;

      g.strokeStyle = strokeCol;
      g.lineWidth = r.isSecondary ? 1.4 * (1 - k2) + 0.3 : 2.4 * (1 - k2) + 0.5;
      g.beginPath();
      if (r.tone === "fire") {
        g.roundRect(r.x - r.r * k2 * 1.5, r.y - r.r * k2 * 0.7, r.r * k2 * 3, r.r * k2 * 1.4, 18);
      } else {
        g.arc(r.x, r.y, r.r * Math.pow(k2, r.isSecondary ? 0.8 : 0.6), 0, Math.PI * 2);
      }
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
