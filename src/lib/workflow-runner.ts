import { FxEngine, type FxColor } from "./fx-engine";
import { edgeControl, type PortGeom } from "./ports";
import { perimeter, projectToPath, type NodeShape, type Point } from "./shape-geometry";

export type ExecutionPhase = "idle" | "waiting" | "preignite" | "igniting" | "executing" | "draining" | "success";
export interface RuntimeNode { id: string; shape: NodeShape; center: Point; color?: FxColor }
export interface RuntimeEdge { id: string; from: string; to: string; kind: FxColor; geometry: PortGeom; dashed?: boolean }
export interface RunCallbacks {
  onNodePhase?: (id: string, phase: ExecutionPhase) => void;
  onEdgePhase?: (id: string, phase: "filling" | "draining" | "idle") => void;
  onComplete?: () => void;
}

/** Dependency-driven execution. No independent timers that race comet arrival. */
export function runWorkflow(engine: FxEngine, nodes: RuntimeNode[], edges: RuntimeEdge[], callbacks: RunCallbacks = {}): () => void {
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error("Workflow node IDs must be unique.");
  if (new Set(edges.map(edge => edge.id)).size !== edges.length) throw new Error("Workflow edge IDs must be unique.");
  for (const edge of edges) if (!byId.has(edge.from) || !byId.has(edge.to)) throw new Error("Every workflow edge must reference two existing nodes.");
  const incoming = (id: string) => edges.filter(edge => edge.to === id);
  const outgoing = (id: string) => edges.filter(edge => edge.from === id);
  const remaining = new Map(nodes.map(node => [node.id, incoming(node.id).length]));
  const queue = nodes.filter(node => remaining.get(node.id) === 0).map(node => node.id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!; visited++;
    for (const edge of outgoing(id)) {
      const count = remaining.get(edge.to)! - 1;
      remaining.set(edge.to, count);
      if (!count) queue.push(edge.to);
    }
  }
  if (visited !== nodes.length) throw new Error("The specimen runner requires an acyclic workflow.");

  let cancelled = false;
  let completed = false;
  const started = new Set<string>();
  const settled = new Set<string>();
  const drained = new Set<string>();
  const arrived = new Set<string>();
  const opposite = (node: RuntimeNode, p: Point): Point => projectToPath(perimeter(node.shape, node.center), { x: node.center.x * 2 - p.x, y: node.center.y * 2 - p.y }).point;
  const finishIfReady = () => {
    if (!cancelled && !completed && settled.size === nodes.length && drained.size === edges.length) {
      completed = true;
      callbacks.onComplete?.();
    }
  };
  const ignite = (node: RuntimeNode, arrivingAt?: Point) => {
    if (cancelled || started.has(node.id)) return;
    started.add(node.id);
    const out = outgoing(node.id);
    const knownInput = arrivingAt ?? incoming(node.id)[0]?.geometry.d1;
    const output = out[0]?.geometry.d0 ?? (knownInput ? opposite(node, knownInput) : { x: node.center.x + 38, y: node.center.y });
    const input = knownInput ?? opposite(node, output);
    engine.igniteNode({
      id: `node:${node.id}`, shape: node.shape, center: node.center, input, output, color: node.color ?? "orange",
      onPhase: phase => {
        if (cancelled || phase === "settled") return;
        callbacks.onNodePhase?.(node.id, phase === "preignite" ? "preignite" : phase === "filling" ? "igniting" : "draining");
      },
      onFill: () => {
        if (cancelled) return;
        callbacks.onNodePhase?.(node.id, "executing");
        for (const edge of out) {
          const g = edge.geometry;
          callbacks.onEdgePhase?.(edge.id, "filling");
          engine.launchComet({
            id: `edge:${edge.id}`, from: g.d0, to: g.d1, ctrl: edgeControl(g), color: edge.kind, dashed: edge.dashed,
            onPhase: phase => {
              if (!cancelled && phase === "draining") callbacks.onEdgePhase?.(edge.id, "draining");
            },
            onArrive: () => {
              if (cancelled) return;
              arrived.add(edge.id);
              const destination = byId.get(edge.to)!;
              // A join starts once all of its actual incoming packets arrive.
              if (incoming(edge.to).every(inputEdge => arrived.has(inputEdge.id))) ignite(destination, g.d1);
              else callbacks.onNodePhase?.(edge.to, "waiting");
            },
            onDrained: () => {
              if (cancelled) return;
              drained.add(edge.id);
              callbacks.onEdgePhase?.(edge.id, "idle");
              finishIfReady();
            },
          });
        }
      },
      onSettled: () => {
        if (cancelled) return;
        settled.add(node.id);
        callbacks.onNodePhase?.(node.id, out.length ? "idle" : "success");
        finishIfReady();
      },
    });
  };
  nodes.forEach(node => callbacks.onNodePhase?.(node.id, "idle"));
  edges.forEach(edge => callbacks.onEdgePhase?.(edge.id, "idle"));
  engine.schedule(300, () => {
    if (cancelled) return;
    for (const node of nodes.filter(item => incoming(item.id).length === 0)) ignite(node);
    if (!nodes.length) finishIfReady();
  });
  return () => { cancelled = true; engine.clearTransient(); };
}
