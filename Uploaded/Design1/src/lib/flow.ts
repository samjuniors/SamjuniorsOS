/**
 * FlowEngine — Living SamJuniorsOS operating graph canvas & kinetics.
 * Inspired by REF.mp4 & verified repository definitions:
 *  - Real SamJuniorsOS operational chain: Founder ➜ Sophia ➜ Active Specialists ➜ Contextual Protocol Steps ➜ Verifier ➜ Vault
 *  - Contextual revelation: active DAG steps reveal only as real work progresses; idle remains calm
 *  - Scalable collision-aware column positioning: zero overlap regardless of task count
 *  - Strictly state-driven kinetics: NO synthetic packets when idle; idle breathes ambiently
 *  - Directional laser streaks with velocity-aligned trailing spark emitters
 *  - Dual-ring arrival shockwaves and target perimeter illumination
 *  - Sophia core combustion with procedural ember physics
 */

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
  | "feeds";

export type EdgeStyle = "white" | "blue" | "cyan" | "amber" | "emerald" | "rose" | "fire";

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

export const WORLD = {
  CX: 840,
  CY: 440,
  W: 1600,
  H: 900,
  MIN_X: 80,
  MAX_X: 1620,
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
/** White-hot contact flash at the instant a packet impacts a node. */
type Flash = { x: number; y: number; life: number; max: number; tone: PacketTone };

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
  const x1 = fromNode.x + fromNode.w / 2;
  const y1 = fromNode.y;
  const x2 = toNode.x - toNode.w / 2;
  const y2 = toNode.y;

  let pts: [number, number][];
  if (Math.abs(y1 - y2) < 4) {
    pts = [[x1, y1], [x2, y2]];
  } else {
    const xMid = Math.round((x1 + x2) / 2);
    pts = [[x1, y1], [xMid, y1], [xMid, y2], [x2, y2]];
  }

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
  };
}

/**
 * Dynamic operating graph projection derived strictly from live OS state.
 * Real operational chain:
 *   Founder / Inputs
 *   → Sophia Vance (COO / Orchestrator)
 *   → Active Specialists (Dr. Thorne, and Maya Lin / Julian Cruz when actively assigned)
 *   → Contextual Protocol Steps (understand, research, test, build_execute, verify, report)
 *   → Constitutional Verifier (Margin ≥ 80% & Safe Mock Sandbox)
 *   → Founder Approval Gate (contextually visible when decisions require wet signature ratification)
 *   → Governed Outcome (Immutable Vault)
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

  // 1. Column 0: Founder / Inputs (Authority Boundary)
  const founderNode: FlowNode = {
    id: "founder",
    x: 180,
    y: 440,
    w: 124,
    h: 80,
    kind: "card",
    type: "founder",
    state: hasOpenDecisions ? "waiting" : "idle",
    title: "Founder / Inputs",
    subtitle: state.company?.focus ? `Focus: ${state.company.focus}` : "Directives & Invariants",
    activity: hasOpenDecisions ? "Reviewing decisions" : undefined,
    relevance: hasOpenDecisions ? 1 : 0.6,
  };
  nodes.push(founderNode);

  // 2. Column 1: Sophia Vance (COO & Master Orchestrator)
  const sophiaState: GraphNodeState = hasActiveWork ? "active" : hasBlockedWork ? "blocked" : "idle";
  const coreNode: FlowNode = {
    id: "core",
    x: 430,
    y: 440,
    w: 214,
    h: 96,
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

  // 3. Column 2: Employed Specialists (collision-aware) — all four authoritative v1
  //    employees render permanently; per PRODUCT.md §5 Sophia+Thorne are the implemented
  //    v1 critical path, Maya/Julian are employed (defined + profiled) and activate only
  //    when real work is assigned to them. No standby/target-state employees are shown.
  const specialistNodes: FlowNode[] = [];

  const workFor = (...ids: string[]) =>
    state.work.find((w) => w.owner != null && ids.includes(w.owner) && w.state !== "done");
  const activeFor = (...ids: string[]) =>
    state.work.find((w) => w.owner != null && ids.includes(w.owner) && w.state === "active");

  // Dr. Aris Thorne — Lead Market & Technology Researcher (permanent v1 specialist)
  const thorneWork = workFor("thorne", "ops", "researcher") ?? (!state.work.some((w) => w.owner) && activeWork[0]);
  const thorneBlocked = state.work.find((w) => (w.owner === "thorne" || w.owner === "ops") && w.state === "blocked");
  const thorneState: GraphNodeState = thorneWork && thorneWork.state === "active" ? "active" : thorneBlocked ? "blocked" : thorneWork ? "idle" : "idle";

  const thorneNode: FlowNode = {
    id: "thorne",
    x: 710,
    y: 440,
    w: 112,
    h: 88,
    kind: "round",
    type: "agent",
    state: thorneState,
    title: "Dr. Aris Thorne",
    subtitle: "Research & Intelligence",
    activity: thorneWork && thorneWork.state === "active" ? thorneWork.title : thorneBlocked ? "Blocked on research" : undefined,
    relevance: thorneWork || thorneBlocked ? 1 : 0.7,
    owner: "thorne",
  };
  specialistNodes.push(thorneNode);

  // Maya Lin — Principal Product Manager (employed; active only with assigned work)
  const mayaWork = workFor("maya", "pm");
  const mayaActive = !!activeFor("maya", "pm");
  const mayaBlocked = state.work.find((w) => (w.owner === "maya" || w.owner === "pm") && w.state === "blocked");
  const mayaNode: FlowNode = {
    id: "maya",
    x: 710,
    y: 440,
    w: 112,
    h: 88,
    kind: "round",
    type: "agent",
    state: mayaBlocked ? "blocked" : mayaActive ? "active" : "idle",
    title: "Maya Lin",
    subtitle: "Product Architecture & PRD",
    activity: mayaActive && mayaWork ? mayaWork.title : mayaBlocked ? "Blocked on specifications" : undefined,
    relevance: mayaWork || mayaBlocked ? 1 : 0.7,
    owner: "maya",
  };
  specialistNodes.push(mayaNode);

  // Julian Cruz — Chief Financial Analyst (employed; active only with assigned work)
  const julianWork = workFor("julian", "finance");
  const julianActive = !!activeFor("julian", "finance");
  const julianBlocked = state.work.find((w) => (w.owner === "julian" || w.owner === "finance") && w.state === "blocked");
  const julianNode: FlowNode = {
    id: "julian",
    x: 710,
    y: 440,
    w: 112,
    h: 88,
    kind: "round",
    type: "agent",
    state: julianBlocked ? "blocked" : julianActive ? "active" : "idle",
    title: "Julian Cruz",
    subtitle: "Finance & Unit Economics",
    activity: julianActive && julianWork ? julianWork.title : julianBlocked ? "Blocked on margin audit" : undefined,
    relevance: julianWork || julianBlocked ? 1 : 0.7,
    owner: "julian",
  };
  specialistNodes.push(julianNode);

  // Layout specialists collision-free
  layoutColumn(specialistNodes, 440, 24);
  specialistNodes.forEach((node) => nodes.push(node));

  // Connect Sophia to each specialist — genuine delegation authority (cyan = AI/data pathway)
  edges.push(
    connectNodes(
      coreNode,
      thorneNode,
      "e-core-thorne",
      thorneState === "active" || thorneState === "blocked" ? "cyan" : "white",
      "delegates",
      thorneState === "active" ? "active" : thorneState === "blocked" ? "blocked" : "idle",
      thorneState === "active" ? "Delegating research" : thorneState === "blocked" ? "Awaiting unblock" : undefined
    )
  );

  edges.push(
    connectNodes(
      coreNode,
      mayaNode,
      "e-core-maya",
      mayaNode.state === "active" || mayaNode.state === "blocked" ? "cyan" : "white",
      "delegates",
      mayaNode.state,
      mayaActive ? "Delegating product architecture" : undefined
    )
  );

  edges.push(
    connectNodes(
      coreNode,
      julianNode,
      "e-core-julian",
      julianNode.state === "active" || julianNode.state === "blocked" ? "cyan" : "white",
      "models_finance",
      julianNode.state,
      julianActive ? "Requesting unit economics audit" : undefined
    )
  );

  // Research feeds product: Thorne's intelligence flows into Maya's PRDs —
  // contextual: rendered only while Maya is actively authoring.
  if (mayaActive) {
    edges.push(
      connectNodes(
        thorneNode,
        mayaNode,
        "e-thorne-maya",
        "cyan",
        "feeds",
        "active",
        "Feeding research into PRD"
      )
    );
  }

  // 4. Column 3: Contextual Protocol Steps (Revealed ONLY as real work progresses)
  const protocolStepNodes: FlowNode[] = [];
  const activeOrOpenWork = state.work.filter((w) => w.state !== "done").slice(0, 5);

  activeOrOpenWork.forEach((w) => {
    const isAct = w.state === "active";
    const isBlk = w.state === "blocked";
    const wState: GraphNodeState = isBlk ? "blocked" : isAct ? "active" : "waiting";

    // Route each protocol step to the genuinely responsible specialist.
    const ownerIsMaya = w.owner === "maya" || w.owner === "pm";
    const ownerIsJulian = w.owner === "julian" || w.owner === "finance";

    let stepName = "Research & Reconnaissance";
    let stepCode = "step-research";
    let assignedSpecialist = thorneNode;
    let relationship: GraphRelationship = "researches";

    if (w.stage === "discovery") {
      stepName = "Market Reconnaissance";
      stepCode = "step-research";
      assignedSpecialist = thorneNode;
      relationship = "researches";
    } else if (w.stage === "build") {
      if (ownerIsJulian) {
        stepName = "Unit Economics Audit";
        stepCode = "step-finance";
        assignedSpecialist = julianNode;
        relationship = "models_finance";
      } else if (ownerIsMaya) {
        stepName = "Product Architecture & PRD";
        stepCode = "step-pm-prd";
        assignedSpecialist = mayaNode;
        relationship = "authors_prd";
      } else {
        // Thorne-led build: research synthesis artifact
        stepName = "Research Synthesis";
        stepCode = "step-research";
        assignedSpecialist = thorneNode;
        relationship = "researches";
      }
    } else if (w.stage === "review") {
      stepName = "Council Peer Review";
      stepCode = "step-review";
      assignedSpecialist = ownerIsMaya ? mayaNode : ownerIsJulian ? julianNode : thorneNode;
      relationship = "checks";
    } else if (w.stage === "ship") {
      stepName = "Executive Synthesis";
      stepCode = "step-report";
      assignedSpecialist = ownerIsMaya ? mayaNode : ownerIsJulian ? julianNode : thorneNode;
      relationship = "synthesizes";
    }

    const stepNode: FlowNode = {
      id: `step-${w.id}`,
      x: 1010,
      y: 440,
      w: 160,
      h: 76,
      kind: "card",
      type: "workflow",
      state: wState,
      title: w.title,
      subtitle: `${stepName}`,
      protocolStep: stepCode,
      activity: isAct ? `${stepName} in execution` : isBlk ? "Attention required" : undefined,
      relevance: isAct || isBlk ? 1 : 0.45,
      owner: w.owner,
    };
    protocolStepNodes.push(stepNode);

    // Edge from the responsible specialist into live execution.
    // fire = white-hot execution energy (per reference spec); cyan is reserved
    // for AI/data pathways; rose = blocked; white = idle conduit.
    const edgeStyle: EdgeStyle = isBlk ? "rose" : isAct ? "fire" : "white";
    edges.push(
      connectNodes(
        assignedSpecialist,
        stepNode,
        `e-spec-${w.id}`,
        edgeStyle,
        relationship,
        isBlk ? "blocked" : isAct ? "active" : "idle",
        w.title
      )
    );
  });

  // Layout protocol steps collision-free
  if (protocolStepNodes.length > 0) {
    layoutColumn(protocolStepNodes, 440, 22);
    protocolStepNodes.forEach((n) => nodes.push(n));
  }

  // 5. Column 4: Constitutional Verifier (Governance & Invariants)
  const verState: GraphNodeState = hasBlockedWork
    ? "blocked"
    : hasReviewWork
    ? "active"
    : doneWork.length > 0
    ? "complete"
    : "idle";

  const verifierNode: FlowNode = {
    id: "verification",
    x: 1280,
    y: 440,
    w: 120,
    h: 84,
    kind: "round",
    type: "verification",
    state: verState,
    title: "Verifier",
    subtitle: "Constitutional Safety",
    activity: hasReviewWork ? "Evaluating gross margin ≥ 80%" : hasBlockedWork ? "Invariant check failed" : undefined,
    relevance: hasReviewWork || hasBlockedWork ? 1 : 0.5,
  };
  nodes.push(verifierNode);

  // Connect protocol steps to Verifier (or direct Thorne -> Verifier when idle)
  if (protocolStepNodes.length === 0) {
    // Quiet baseline conduit when no active workstream
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

  // 6. Column 5: Governed Outcome / Immutable Vault
  const outcomeState: GraphNodeState = doneWork.length > 0 ? "complete" : "idle";
  const outcomeNode: FlowNode = {
    id: "outcome",
    x: 1500,
    y: 440,
    w: 130,
    h: 78,
    kind: "card",
    type: "outcome",
    state: outcomeState,
    title: "Governed Vault",
    subtitle: "Immutable Memory",
    activity: doneWork.length > 0 ? `${doneWork.length} deliverable${doneWork.length > 1 ? "s" : ""} verified` : undefined,
    relevance: doneWork.length > 0 ? 1 : 0.35,
  };
  nodes.push(outcomeNode);

  // Connector from Verifier to Outcome
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

  // 7. Contextual Escalation: Founder Approval Gate (ONLY when decisions are open)
  if (hasOpenDecisions) {
    const approvalNode: FlowNode = {
      id: "approval",
      x: 570,
      y: 680,
      w: 180,
      h: 84,
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
    const p1: [number, number][] = [
      [coreNode.x, coreNode.y + coreNode.h / 2],
      [coreNode.x, approvalNode.y],
      [approvalNode.x - approvalNode.w / 2, approvalNode.y],
    ];
    edges.push({
      id: "e-sophia-approval",
      from: "core",
      to: "approval",
      pts: p1,
      style: "amber",
      arrow: true,
      relationship: "escalates-to",
      state: "blocked",
      activity: "Escalating decision",
    });

    // Approval Gate escalates to Founder
    const p2: [number, number][] = [
      [approvalNode.x - approvalNode.w / 2, approvalNode.y],
      [founderNode.x, approvalNode.y],
      [founderNode.x, founderNode.y + founderNode.h / 2],
    ];
    edges.push({
      id: "e-approval-founder",
      from: "approval",
      to: "founder",
      pts: p2,
      style: "amber",
      arrow: true,
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
      y: coreNode.y - coreNode.h / 2 - 24,
      actor: "Sophia Vance",
      action: "Orchestrating specialist workstreams",
      target: "Dr. Aris Thorne",
      tone: "cyan",
    });
  }
  if (thorneWork && thorneWork.state === "active") {
    spatialCards.push({
      id: "sp-thorne",
      nodeId: "thorne",
      x: thorneNode.x,
      y: thorneNode.y - thorneNode.h / 2 - 24,
      actor: "Dr. Aris Thorne",
      action: thorneWork.title,
      tone: "cyan",
    });
  }
  if (julianWork && julianWork.state === "active") {
    spatialCards.push({
      id: "sp-julian",
      nodeId: "julian",
      x: julianNode.x,
      y: julianNode.y - julianNode.h / 2 - 24,
      actor: "Julian Cruz",
      action: "Stress-testing margin floor ≥ 80%",
      tone: "cyan",
    });
  }
  if (mayaWork && mayaWork.state === "active") {
    spatialCards.push({
      id: "sp-maya",
      nodeId: "maya",
      x: mayaNode.x,
      y: mayaNode.y - mayaNode.h / 2 - 24,
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
      y: verifierNode.y - verifierNode.h / 2 - 24,
      actor: "Constitutional Verifier",
      action: "Auditing gross margin invariant ≥ 80%",
      tone: "emerald",
    });
  } else if (hasBlockedWork) {
    spatialCards.push({
      id: "sp-verify-blocked",
      nodeId: "verification",
      x: verifierNode.x,
      y: verifierNode.y - verifierNode.h / 2 - 24,
      actor: "Constitutional Verifier",
      action: "Deterministic check failed — blocked",
      tone: "rose",
    });
  }
  if (hasOpenDecisions) {
    spatialCards.push({
      id: "sp-approval",
      nodeId: "approval",
      x: 570,
      y: 618,
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
  flashes: Flash[] = [];
  energy = new Map<string, number>();
  coreHeat = 0.3;
  spawnTimer = 0;
  emberAcc = 0;
  /** When set (node-selection focus), edges/nodes unrelated to the focused
   *  node's direct relationships render at reduced emphasis. */
  focusNodes: Set<string> | null = null;

  blueSprite = sprite(56, 189, 248);
  fireSprite = sprite(249, 115, 22);
  amberSprite = sprite(245, 158, 11);
  emeraldSprite = sprite(16, 185, 129);
  roseSprite = sprite(244, 63, 94);
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

  setFocus(nodeIds: Set<string> | null) {
    this.focusNodes = nodeIds && nodeIds.size > 0 ? nodeIds : null;
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
      p.edge.style === "fire"
        ? "fire"
        : p.edge.style === "rose"
        ? "rose"
        : p.edge.style === "amber"
        ? "amber"
        : p.edge.style === "emerald"
        ? "emerald"
        : "cyan";

    // Source-node ignition: dispatch visibly energizes the emitting node's
    // perimeter (matches reference frame 2 — C-arc border light-up).
    const src = this.energy.get(p.edge.from) || 0;
    this.energy.set(p.edge.from, Math.max(src, 0.72));

    this.packets.push({
      e: p.index,
      d: randomStart ? Math.random() * p.len : 0,
      speed: rnd(210, 290),
      tone,
      trail: rnd(105, 135),
    });
  }

  /**
   * Dual-ring arrival shockwave, white-hot contact flash, and target perimeter illumination.
   */
  arrive(nodeId: string, x: number, y: number, tone: PacketTone = "cyan") {
    this.energy.set(nodeId, 1);
    const isCore = nodeId === "core";
    const isBlocked = tone === "rose" || this.nodeMap.get(nodeId)?.state === "blocked";
    const ringTone: PacketTone = isCore ? "fire" : isBlocked ? "rose" : tone === "fire" ? "fire" : tone === "amber" ? "amber" : tone === "emerald" ? "emerald" : "cyan";

    // White-hot contact flash — the instant of impact (reference frame 4)
    this.flashes.push({ x, y, life: 0, max: 0.16, tone: ringTone });

    // Primary fast shockwave ring (gold-leaning for execution energy)
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

    const count = isCore ? 42 : 26;
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
            color: "#ffaa55",
          });
        }
      }
    }
  }

  burstFire(x: number, y: number, n: number, tone: PacketTone = "cyan") {
    const col =
      tone === "amber"
        ? "#fbbf24"
        : tone === "rose"
        ? "#fb7185"
        : tone === "emerald"
        ? "#34d399"
        : tone === "fire"
        ? "#ff8833"
        : "#38bdf8";

    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(45, 175);
      this.embers.push({
        x: x + rnd(-8, 8),
        y: y + rnd(-8, 8),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        max: rnd(0.4, 0.95),
        size: rnd(1.4, 3.4),
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
        this.spawnTimer = rnd(0.5, 0.95);
        this.spawn();
      }
    } else {
      // Idle state: strictly NO fake packets generated
      this.spawnTimer = 0;
    }

    // Packet advance with cinematic ease (launch slow, transit fast, arrive decelerating)
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const pk = this.packets[i];
      const path = this.paths[pk.e];
      if (!path) {
        this.packets.splice(i, 1);
        continue;
      }
      const prog = Math.min(1, pk.d / path.len);
      const ease = 0.5 + 0.95 * Math.sin(Math.PI * prog);
      pk.d += pk.speed * ease * dt;

      // Trailing micro-spark emission along motion vector — varied sizes &
      // occasional larger "pop" sparks for organic high-velocity texture
      if (Math.random() < 0.44) {
        const head = this.pointAt(path, pk.d);
        const prev = this.pointAt(path, Math.max(0, pk.d - 6));
        const ang = Math.atan2(head.y - prev.y, head.x - prev.x);
        const spMag = rnd(25, 60);
        const pop = Math.random() < 0.16;

        this.sparks.push({
          x: head.x + rnd(-2, 2),
          y: head.y + rnd(-2, 2),
          vx: -Math.cos(ang) * spMag + Math.sin(ang) * rnd(-15, 15),
          vy: -Math.sin(ang) * spMag - Math.cos(ang) * rnd(-15, 15),
          life: 0,
          max: pop ? rnd(0.3, 0.55) : rnd(0.18, 0.4),
          size: pop ? rnd(2.4, 3.6) : rnd(1.1, 2.6),
          color:
            pk.tone === "amber"
              ? "#fde68a"
              : pk.tone === "rose"
              ? "#fca5a5"
              : pk.tone === "emerald"
              ? "#a7f3d0"
              : pk.tone === "fire"
              ? pop
                ? "#fff1dd"
                : "#ffd9a0"
              : "#7dd3fc",
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
        pk.speed = rnd(200, 280);
        pk.trail = rnd(105, 135);
        const nextEdge = this.paths[pk.e].edge;
        pk.tone =
          nextEdge.style === "fire"
            ? "fire"
            : nextEdge.style === "rose"
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
        color: "#fb923c",
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

    // Contact flashes update
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.life += dt;
      if (fl.life >= fl.max) {
        this.flashes.splice(i, 1);
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

    // (Grid crosshairs & micro-dots render in the DOM layers beneath the nodes —
    // the canvas reserves itself strictly for energy, so nothing occludes nodes.)

    // Ambient breathing oscillation (sine wave)
    const ambientBreath = Math.sin(this.time * 1.5) * 0.04;

    // --- Connectors (Orthogonal Conduits)
    for (const p of this.paths) {
      const e = p.edge;
      const eFrom = this.energy.get(e.from) || 0;
      const eTo = this.energy.get(e.to) || 0;
      const lit = Math.max(eFrom, eTo);

      // Selection focus: unrelated edges de-emphasize (related = either endpoint
      // belongs to the focused node's direct relationship set).
      const related = !this.focusNodes || this.focusNodes.has(e.from) || this.focusNodes.has(e.to);
      const dim = related ? 1 : 0.3;

      g.save();
      g.globalAlpha = dim;

      g.beginPath();
      g.moveTo(p.pts[0].x, p.pts[0].y);
      for (let i = 1; i < p.pts.length; i++) g.lineTo(p.pts[i].x, p.pts[i].y);

      if (e.style === "fire" && e.state === "active") {
        // White-hot execution conduit — continuous layered energy
        // (reference frames 3–5). Motion is carried by the comet itself,
        // so the conduit stays a precise continuous beam.
        g.save();
        g.globalCompositeOperation = "lighter";
        // Ambient light cast onto the canvas beneath the active path
        g.strokeStyle = `rgba(255,150,50,${0.07 + lit * 0.06})`;
        g.lineWidth = 24;
        g.stroke();
        // Outer corona
        g.strokeStyle = `rgba(249,115,22,${0.24 + lit * 0.28})`;
        g.lineWidth = 7;
        g.stroke();
        // Mid sheath
        g.strokeStyle = `rgba(255,150,70,${0.38 + lit * 0.32})`;
        g.lineWidth = 3.6;
        g.stroke();
        // Bright interior core — continuous, hairline-precise
        g.strokeStyle = `rgba(255,236,214,${0.78 + lit * 0.22})`;
        g.lineWidth = 1.8;
        g.stroke();
        g.restore();
      } else if (e.style === "rose" || e.state === "blocked") {
        g.save();
        g.globalCompositeOperation = "lighter";
        g.strokeStyle = `rgba(244,63,94,${0.16 + lit * 0.26 + Math.sin(this.time * 5) * 0.08})`;
        g.lineWidth = 6;
        g.stroke();
        g.strokeStyle = `rgba(251,113,133,${0.6 + lit * 0.32})`;
        g.lineWidth = 1.7;
        g.stroke();
        g.restore();
      } else if (e.style === "amber") {
        g.save();
        g.globalCompositeOperation = "lighter";
        g.strokeStyle = `rgba(245,158,11,${0.16 + lit * 0.24 + Math.sin(this.time * 4) * 0.06})`;
        g.lineWidth = 6;
        g.stroke();
        g.strokeStyle = `rgba(252,211,77,${0.6 + lit * 0.3})`;
        g.lineWidth = 1.7;
        g.stroke();
        g.restore();
      } else if (e.style === "emerald" || e.state === "complete") {
        g.save();
        g.strokeStyle = `rgba(16,185,129,${0.13 + lit * 0.17})`;
        g.lineWidth = 4;
        g.stroke();
        g.strokeStyle = `rgba(52,211,153,${0.48 + lit * 0.3})`;
        g.lineWidth = 1.4;
        g.stroke();
        g.restore();
      } else if (e.style === "cyan" || e.state === "active") {
        // Cyan AI/data pathway — continuous neon beam
        // (reference frame 6: core filament + sheath + soft outer bloom).
        g.save();
        g.globalCompositeOperation = "lighter";
        g.strokeStyle = `rgba(0,102,204,${0.1 + lit * 0.12})`;
        g.lineWidth = 8;
        g.stroke();
        g.strokeStyle = `rgba(56,189,248,${0.24 + lit * 0.3})`;
        g.lineWidth = 3.2;
        g.stroke();
        g.strokeStyle = `rgba(215,245,255,${0.6 + lit * 0.32})`;
        g.lineWidth = 1.5;
        g.stroke();
        g.restore();
      } else {
        // Quiet idle baseline conduit (ambient breathing, no flurry)
        g.strokeStyle = `rgba(40,55,80,${0.14 + ambientBreath + lit * 0.08})`;
        g.lineWidth = 2.6;
        g.stroke();
        g.strokeStyle = `rgba(130,165,205,${0.22 + ambientBreath + lit * 0.18})`;
        g.lineWidth = 1;
        g.stroke();
      }

      // Heat gradient entering Sophia core
      if (e.to === "core") {
        const tail = 110;
        const start = Math.max(0, p.len - tail);
        const a = this.pointAt(p, start);
        const b = p.pts[p.pts.length - 1];
        const grad = g.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, "rgba(255,150,60,0)");
        grad.addColorStop(1, `rgba(255,170,80,${0.5 + this.coreHeat * 0.35})`);
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

      // Arrowheads — slim aerodynamic taper (reference: sleek technical points)
      if (e.arrow) {
        const n = p.pts.length;
        const b = p.pts[n - 1],
          a = p.pts[n - 4] || p.pts[0];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const hot = e.style === "fire" || e.style === "cyan" || e.style === "rose" || e.style === "amber";
        g.fillStyle =
          e.style === "rose"
            ? `rgba(251,113,133,${0.8 + lit * 0.2})`
            : e.style === "amber"
            ? `rgba(252,211,77,${0.8 + lit * 0.2})`
            : e.style === "emerald"
            ? `rgba(52,211,153,${0.75 + lit * 0.25})`
            : e.style === "cyan"
            ? `rgba(215,245,255,${0.8 + lit * 0.2})`
            : e.style === "fire"
            ? `rgba(255,224,190,${0.8 + lit * 0.2})`
            : `rgba(185,215,245,${0.62 + ambientBreath + lit * 0.22})`;

        const ah = hot ? 7 : 6.2;
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - Math.cos(ang - 0.36) * ah, b.y - Math.sin(ang - 0.36) * ah);
        g.lineTo(b.x - Math.cos(ang + 0.36) * ah, b.y - Math.sin(ang + 0.36) * ah);
        g.closePath();
        g.fill();
      }

      // Connection ports — crisp technical anchors: outer ring + bright core dot
      // (reference frame 1 — precise connection points on node borders; the
      // destination port pulses softly while a packet is inbound — frame 6).
      {
        const s = p.pts[0],
          t = p.pts[p.pts.length - 1];
        const inbound = this.packets.some((pk) => this.paths[pk.e] === p && pk.d > p.len * 0.45);
        const pulse = inbound ? 0.55 + 0.45 * Math.sin(this.time * 6.5) : 0;
        const portAlpha = 0.35 + lit * 0.45 + pulse * 0.4;
        const ringAlpha = 0.22 + lit * 0.3 + pulse * 0.3;
        const fire = e.style === "fire" && e.state === "active";
        const dotColor =
          fire
            ? `rgba(255,214,170,${portAlpha})`
            : e.style === "rose"
            ? `rgba(251,113,133,${portAlpha})`
            : e.style === "amber"
            ? `rgba(252,211,77,${portAlpha})`
            : e.style === "emerald"
            ? `rgba(52,211,153,${portAlpha})`
            : `rgba(170,215,250,${portAlpha})`;
        const ringColor =
          fire
            ? `rgba(255,170,110,${ringAlpha})`
            : `rgba(120,185,235,${ringAlpha})`;

        for (const pt of [s, t]) {
          // soft socket glow where an energized beam plugs into the port
          if (fire || (e.style === "cyan" && e.state === "active") || e.style === "amber" || (e.style === "rose" && e.state === "blocked")) {
            const gs = fire ? this.fireSprite : e.style === "amber" ? this.amberSprite : e.style === "rose" ? this.roseSprite : this.blueSprite;
            g.globalAlpha = 0.3 + lit * 0.3 + pulse * 0.25;
            g.drawImage(gs, pt.x - 8.5, pt.y - 8.5, 17, 17);
            g.globalAlpha = 1;
          }
          g.strokeStyle = ringColor;
          g.lineWidth = 1;
          g.beginPath();
          g.arc(pt.x, pt.y, 3.1, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = dotColor;
          g.beginPath();
          g.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
          g.fill();
        }
      }

      g.restore(); // focus dim scope
    }

    g.globalCompositeOperation = "lighter";

    // --- Node Arrival Energy Glow
    for (const n of this.nodeMap.values()) {
      const en = this.energy.get(n.id) || 0;
      if (en < 0.02) continue;
      const related = !this.focusNodes || this.focusNodes.has(n.id);
      const glowEn = en * (related ? 1 : 0.3);
      if (glowEn < 0.02) continue;
      const r = Math.max(n.w, n.h) * (0.85 + glowEn * 0.35);
      const isCore = n.id === "core";
      const isBlocked = n.state === "blocked";
      const isExecuting = this.nodeMap.get(n.id)?.state === "active" && n.type === "agent";
      const gr = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
      if (isCore) {
        gr.addColorStop(0, `rgba(255,170,80,${0.45 * glowEn})`);
      } else if (isBlocked) {
        gr.addColorStop(0, `rgba(244,63,94,${0.45 * glowEn})`);
      } else if (isExecuting) {
        // Executing specialists radiate warm execution energy.
        gr.addColorStop(0, `rgba(255,170,90,${0.4 * glowEn})`);
      } else {
        gr.addColorStop(0, `rgba(56,189,248,${0.45 * glowEn})`);
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
      g.shadowColor = "rgba(255,140,50,0.95)";
      g.shadowBlur = 20 + heat * 24;
      g.strokeStyle = `rgba(255,${Math.round(160 + heat * 50)},80,${0.5 + heat * 0.4})`;
      g.lineWidth = 2.0 + heat * 1.5;
      g.beginPath();
      g.roundRect(x, y, w, h, 16);
      g.stroke();
      g.restore();

      const gr = g.createRadialGradient(c.x, c.y, c.w * 0.2, c.x, c.y, c.w * 0.8);
      gr.addColorStop(0, `rgba(255,140,60,${0.1 + heat * 0.1})`);
      gr.addColorStop(1, "rgba(255,120,40,0)");
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

    // --- Directional Laser Streaks (Packets) — white-hot comet with volumetric tail
    for (const pk of this.packets) {
      const p = this.paths[pk.e];
      if (!p) continue;
      const head = this.pointAt(p, pk.d);
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

      const isFire = pk.tone === "fire";
      // Volumetric tail — smooth gradient: transparent ember tip → saturated
      // body → white-hot head base (reference spec: 0%/40%/90%/100% stops).
      // Drawn in two passes per segment: soft gaseous halo + dense core.
      const steps = 28;
      for (let i = steps; i >= 1; i--) {
        const d = pk.d - (pk.trail * i) / steps;
        if (d < 0) continue;
        const q = this.pointAt(p, d);
        const t = 1 - i / steps; // 0 tail tip → 1 head base
        const rCore = 0.8 + t * 4.2;
        const rHalo = rCore + 2.6 * t + 1.2;
        let col: string;
        if (isFire) {
          if (t < 0.4) {
            const u = t / 0.4;
            col = `rgba(255,${Math.round(68 + 102 * u)},0,${(u * 0.6).toFixed(3)})`;
          } else {
            const u = (t - 0.4) / 0.6;
            col = `rgba(255,${Math.round(170 + 54 * u)},${Math.round(0 + 190 * u)},${(0.6 + 0.4 * u).toFixed(3)})`;
          }
        } else {
          const rgb =
            pk.tone === "amber"
              ? "245,158,11"
              : pk.tone === "rose"
              ? "244,63,94"
              : pk.tone === "emerald"
              ? "16,185,129"
              : "56,189,248";
          col = `rgba(${rgb},${(t * t * 0.85).toFixed(3)})`;
        }
        // soft gaseous halo pass
        g.fillStyle = col.replace(/,([\d.]+)\)$/, "," + (parseFloat(col.match(/([\d.]+)\)$/)![1]) * 0.28).toFixed(3) + ")");
        g.beginPath();
        g.arc(q.x, q.y, rHalo, 0, Math.PI * 2);
        g.fill();
        // dense core pass
        g.fillStyle = col;
        g.beginPath();
        g.arc(q.x, q.y, rCore, 0, Math.PI * 2);
        g.fill();
      }

      // Residual heat along the freshly traversed path (soft corona under-glow)
      {
        const back = this.pointAt(p, Math.max(0, pk.d - pk.trail * 1.9));
        const grad = g.createLinearGradient(back.x, back.y, head.x, head.y);
        const base = isFire ? "255,140,60" : pk.tone === "amber" ? "245,158,11" : pk.tone === "rose" ? "244,63,94" : pk.tone === "emerald" ? "16,185,129" : "56,189,248";
        grad.addColorStop(0, `rgba(${base},0)`);
        grad.addColorStop(1, `rgba(${base},${isFire ? 0.3 : 0.18})`);
        g.save();
        g.strokeStyle = grad;
        g.lineWidth = isFire ? 11 : 7;
        g.beginPath();
        let began = false;
        for (let i = 0; i < p.pts.length; i++) {
          if (p.cum[i] < Math.max(0, pk.d - pk.trail * 1.9)) continue;
          if (!began) {
            g.moveTo(back.x, back.y);
            began = true;
          }
          g.lineTo(p.pts[i].x, p.pts[i].y);
        }
        g.lineTo(head.x, head.y);
        g.stroke();
        g.restore();
      }

      // Comet head — layered corona: wide soft bloom + tight hot glow + blinding white core
      const s = isFire ? 23 : 18;
      g.globalAlpha = 0.6;
      g.drawImage(spr, head.x - s * 1.7, head.y - s * 1.7, s * 3.4, s * 3.4);
      g.globalAlpha = 0.95;
      g.drawImage(spr, head.x - s * 0.9, head.y - s * 0.9, s * 1.8, s * 1.8);
      g.globalAlpha = 1;
      // tight white-hot plasma center
      g.drawImage(this.whiteSprite, head.x - s * 0.42, head.y - s * 0.42, s * 0.84, s * 0.84);
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(head.x, head.y, isFire ? 4.1 : 3.2, 0, Math.PI * 2);
      g.fill();
      if (isFire) {
        g.fillStyle = "rgba(255,248,236,0.95)";
        g.beginPath();
        g.arc(head.x, head.y, 6.4, 0, Math.PI * 2);
        g.fill();
      }
    }

    // --- Arrival Shockwave Rings (Dual concentric rings, gold-leaning for execution)
    for (const r of this.rings) {
      const k2 = r.life / r.max;
      const alpha = r.isSecondary ? (1 - k2) * 0.45 : (1 - k2) * 0.8;
      const strokeCol =
        r.tone === "rose"
          ? `rgba(244,63,94,${alpha})`
          : r.tone === "amber"
          ? `rgba(245,158,11,${alpha})`
          : r.tone === "emerald"
          ? `rgba(16,185,129,${alpha})`
          : r.tone === "fire"
          ? `rgba(255,204,102,${alpha})`
          : `rgba(56,189,248,${alpha})`;

      g.strokeStyle = strokeCol;
      g.lineWidth = r.isSecondary ? 1.6 * (1 - k2) + 0.35 : 3 * (1 - k2) + 0.6;
      g.beginPath();
      if (r.tone === "fire") {
        g.roundRect(r.x - r.r * k2 * 1.5, r.y - r.r * k2 * 0.7, r.r * k2 * 3, r.r * k2 * 1.4, 18);
      } else {
        g.arc(r.x, r.y, r.r * Math.pow(k2, r.isSecondary ? 0.8 : 0.6), 0, Math.PI * 2);
      }
      g.stroke();
    }

    // --- Contact Flashes (white-hot impact instant — reference frame 4)
    for (const fl of this.flashes) {
      const k2 = fl.life / fl.max;
      const fade = 1 - k2;
      const rad = 10 + 30 * k2;
      const spr =
        fl.tone === "rose"
          ? this.roseSprite
          : fl.tone === "amber"
          ? this.amberSprite
          : fl.tone === "emerald"
          ? this.emeraldSprite
          : fl.tone === "fire"
          ? this.fireSprite
          : this.blueSprite;
      g.globalAlpha = fade;
      g.drawImage(spr, fl.x - rad, fl.y - rad, rad * 2, rad * 2);
      g.globalAlpha = fade * 0.9;
      g.drawImage(this.whiteSprite, fl.x - rad * 0.5, fl.y - rad * 0.5, rad, rad);
      g.globalAlpha = fade;
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(fl.x, fl.y, 2.6 + 3.2 * fade, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }

    // --- Source-Node Ignition Arcs (reference frame 2 — C-arc border light-up)
    // A short luminous arc sweeps the emitting node's perimeter while dispatch
    // energy is fresh. Strictly state-driven: fades with real energy decay.
    for (const n of this.nodeMap.values()) {
      const en = this.energy.get(n.id) || 0;
      if (en < 0.3) continue;
      const related = !this.focusNodes || this.focusNodes.has(n.id);
      const arcEn = en * (related ? 1 : 0.3);
      if (arcEn < 0.3) continue;
      const isCore = n.id === "core";
      const isBlocked = n.state === "blocked";
      const executing = n.type === "agent" && n.state === "active";
      const col = isBlocked ? "251,113,133" : isCore || executing ? "255,170,90" : "125,211,252";
      const alpha = 0.35 + arcEn * 0.5;
      g.save();
      g.strokeStyle = `rgba(${col},${alpha})`;
      g.lineWidth = 2.2;
      if (n.kind === "round") {
        const rr = n.w / 2 + 5;
        const a0 = this.time * 2.2 + (n.x % 7);
        g.beginPath();
        g.arc(n.x, n.y, rr, a0, a0 + 1.0);
        g.stroke();
        g.beginPath();
        g.arc(n.x, n.y, rr + 3.5, a0 + Math.PI, a0 + Math.PI + 0.7);
        g.stroke();
      } else {
        const x = n.x - n.w / 2 - 5,
          y = n.y - n.h / 2 - 5,
          w = n.w + 10,
          h = n.h + 10;
        const per = 2 * (w + h);
        g.setLineDash([per * 0.22, per * 0.78]);
        g.lineDashOffset = -this.time * 90;
        g.beginPath();
        g.roundRect(x, y, w, h, 14);
        g.stroke();
        g.setLineDash([]);
      }
      g.restore();
    }

    // --- Executing Specialist Gold Spark Halo (reference frame 7 — processing
    // agent wrapped in gold sparks). Deterministic orbital swarm derived purely
    // from live node state + time: zero activity when nobody is executing.
    for (const n of this.nodeMap.values()) {
      if (n.type !== "agent" || n.id === "core" || n.state !== "active") continue;
      const related = !this.focusNodes || this.focusNodes.has(n.id);
      if (!related) continue;
      const R = n.w / 2;
      for (let i = 0; i < 11; i++) {
        const omega = 0.55 + 0.9 * ((i * 37) % 10) / 10;
        const phase = (i * 2.399) % (Math.PI * 2);
        const ang = this.time * omega + phase;
        const rr = R + 7 + ((i * 53) % 12);
        const yy = Math.sin(this.time * 1.7 + i * 1.9) * 9;
        const x = n.x + Math.cos(ang) * rr;
        const y = n.y + Math.sin(ang) * rr * 0.92 + yy;
        const flick = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * 9 + i * 2.7));
        const size = 1.6 + ((i * 29) % 10) / 10 * 2.2;
        g.globalAlpha = flick * 0.85;
        g.drawImage(i % 3 === 0 ? this.whiteSprite : this.fireSprite, x - size * 2.2, y - size * 2.2, size * 4.4, size * 4.4);
        g.globalAlpha = flick;
        g.fillStyle = i % 3 === 0 ? "#fff6e8" : "#ffcf6e";
        g.beginPath();
        g.arc(x, y, size * 0.6, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
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
