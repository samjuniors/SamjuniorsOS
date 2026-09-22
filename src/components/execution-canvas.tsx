"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFx } from "./fx-canvas";
import { NodeCard, type NodeVisualState } from "./node-card";
import { PortBead } from "./port-bead";
import { edgePath, portPoints, type PortOptions } from "@/lib/ports";
import { runWorkflow, type ExecutionPhase, type RuntimeEdge } from "@/lib/workflow-runner";
import { EXECUTION } from "@/lib/execution-tokens";
import type { FxColor, FxDensity } from "@/lib/fx-engine";
import type { NodeShape } from "@/lib/shape-geometry";

export interface WorkflowNode {
  id: string; label: string; caption?: string; x: number; y: number; shape: NodeShape; icon: ReactNode; color?: FxColor;
}
export interface WorkflowEdge extends PortOptions { id: string; from: string; to: string; kind: FxColor; dashed?: boolean }
const PHASE_LABEL: Record<ExecutionPhase, string> = { idle: "idle", waiting: "awaiting input", preignite: "input ignition", igniting: "outline filling", executing: "output reached", draining: "outline draining", success: "completed" };
const buttonClass = "cvl-mono rounded border border-[var(--cvl-line)] px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[var(--cvl-muted)] transition hover:border-sky-400/50 hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300";

/** Shared view: neutral geometry below, shapes, sockets, then heat on that same geometry. */
export function ExecutionCanvas({ nodes, edges, density, height = 400, minWidth = 880, title = "workflow / execution", autoPlay = true }: {
  nodes: WorkflowNode[]; edges: WorkflowEdge[]; density: FxDensity; height?: number; minWidth?: number; title?: string; autoPlay?: boolean;
}) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const { canvasRef, engineRef } = useFx(density);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  const [playing, setPlaying] = useState(autoPlay);
  const [replay, setReplay] = useState(0);
  const [phases, setPhases] = useState<Record<string, ExecutionPhase>>({});
  const [edgePhases, setEdgePhases] = useState<Record<string, "filling" | "draining" | "idle">>({});
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const playingRef = useRef(playing);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const measure = () => setDimensions(prev => prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight });
    measure(); const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const respectMotion = () => { if (media.matches) { setPlaying(false); engineRef.current?.setPaused(true); } };
    respectMotion(); media.addEventListener("change", respectMotion);
    return () => media.removeEventListener("change", respectMotion);
  }, [engineRef]);
  useEffect(() => { playingRef.current = playing; engineRef.current?.setPaused(!playing); }, [playing, engineRef]);

  const runtimeNodes = useMemo(() => nodes.map(node => ({ id: node.id, shape: node.shape, center: { x: node.x * dimensions.w / 100, y: node.y * dimensions.h / 100 }, color: node.color })), [nodes, dimensions]);
  const runtimeEdges: RuntimeEdge[] = useMemo(() => dimensions.w > 0 ? edges.flatMap(edge => {
    const from = nodes.find(node => node.id === edge.from), to = nodes.find(node => node.id === edge.to);
    return from && to ? [{ ...edge, geometry: portPoints(from, to, dimensions.w, dimensions.h, edge) }] : [];
  }) : [], [nodes, edges, dimensions]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !dimensions.w) return;
    let disposed = false;
    let cancelRun: (() => void) | undefined;
    const begin = () => {
      if (disposed) return;
      cancelRun?.(); engine.clearTransient();
      setSettled(false); setError("");
      try {
        if (runtimeEdges.length !== edges.length) throw new Error("An edge references a missing node.");
        cancelRun = runWorkflow(engine, runtimeNodes, runtimeEdges, {
          onNodePhase: (id, phase) => { if (!disposed) setPhases(prev => ({ ...prev, [id]: phase })); },
          onEdgePhase: (id, phase) => { if (!disposed) setEdgePhases(prev => ({ ...prev, [id]: phase })); },
          onComplete: () => {
            if (disposed) return;
            setSettled(true);
            // Every stroke is neutral before another specimen cycle is allowed.
            engine.schedule(EXECUTION.quiet, () => {
              if (engine.reduced) { setPlaying(false); return; }
              begin();
            });
          },
        });
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to run workflow."); }
    };
    engine.setPaused(!playingRef.current);
    begin();
    return () => { disposed = true; cancelRun?.(); engine.clearTransient(); };
  }, [runtimeNodes, runtimeEdges, dimensions.w, edges.length, replay, engineRef]);

  const sockets = useMemo(() => {
    const seen = new Set<string>();
    return runtimeEdges.flatMap(edge => [edge.geometry.d0, edge.geometry.d1]).filter(point => {
      const key = `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }, [runtimeEdges]);
  const stateFor = (id: string): NodeVisualState => {
    const phase = phases[id] ?? "idle";
    if (selected === id) return "selected";
    if (phase === "success") return "success";
    if (phase === "preignite") return "preignite";
    if (phase === "igniting") return "igniting";
    if (phase === "executing" || phase === "draining") return "executing";
    return "idle";
  };
  const selectedNode = nodes.find(node => node.id === selected);

  return <div className="cvl-grid relative overflow-hidden rounded-xl border border-[var(--cvl-line)] bg-[var(--cvl-canvas)]" data-execution-board={title}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cvl-line-soft)] bg-[#070b12]/90 px-4 py-2.5">
      <div className="flex items-center gap-3"><span className="cvl-label">{title}</span><span className="cvl-mono text-[10px] text-[var(--cvl-muted)]" role="status">{error ? "configuration error" : !playing ? "paused" : settled ? "settled · neutral" : "fill → release → drain"}</span></div>
      <div className="flex items-center gap-2">
        <button type="button" className={buttonClass} onClick={() => { setPlaying(true); setReplay(n => n + 1); }} aria-label="Replay execution">replay</button>
        <button type="button" className={buttonClass} aria-pressed={!playing} onClick={() => setPlaying(value => !value)}>{playing ? "pause" : "play"}</button>
        <button type="button" className={buttonClass} onClick={() => { setPlaying(false); engineRef.current?.stepOnce(300); }} aria-label="Advance execution by 300 milliseconds">step</button>
      </div>
    </div>
    {error ? <p role="alert" className="p-4 text-sm text-rose-300">{error}</p> : null}
    <div className="overflow-x-auto" style={{ height }}>
      <div ref={sceneRef} className="relative h-full" style={{ minWidth }}>
        {dimensions.w > 0 && <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox={`0 0 ${dimensions.w} ${dimensions.h}`} aria-hidden="true">
          {runtimeEdges.map(edge => <path key={edge.id} data-edge-id={edge.id} data-edge-phase={edgePhases[edge.id] ?? "idle"} d={edgePath(edge.geometry)} fill="none" stroke="#3a4358" strokeWidth="1.4" strokeLinecap="round" strokeDasharray={edge.dashed ? "6 7" : undefined} />)}
        </svg>}
        {nodes.map(node => <button
          key={node.id} type="button" className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400"
          style={{ left: `${node.x}%`, top: `${node.y}%` }} data-workflow-node={node.id} data-phase={phases[node.id] ?? "idle"}
          onClick={() => setSelected(current => current === node.id ? null : node.id)} aria-label={`${node.label}: ${PHASE_LABEL[phases[node.id] ?? "idle"]}. Inspect node.`} aria-pressed={selected === node.id}
        ><NodeCard anchored managedEffects shape={node.shape} state={stateFor(node.id)} icon={node.icon} label={node.label} caption={phases[node.id] && phases[node.id] !== "idle" ? PHASE_LABEL[phases[node.id]] : node.caption ?? "idle"} /></button>)}
        {dimensions.w > 0 && <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" viewBox={`0 0 ${dimensions.w} ${dimensions.h}`} aria-hidden="true">
          {sockets.map((p, i) => <PortBead key={i} x={p.x} y={p.y} />)}
        </svg>}
        {/* Above the neutral shapes: exact original centerlines, no second perimeter. */}
        <canvas ref={canvasRef} data-fluid-canvas className="pointer-events-none absolute inset-0 z-30 h-full w-full" aria-hidden="true" />
        {selectedNode && <div className="cvl-panel absolute bottom-3 left-3 z-40 w-[255px] p-3">
          <div className="flex items-center justify-between"><span className="cvl-label">inspector</span><button type="button" onClick={() => setSelected(null)} aria-label="Close inspector" className="px-1 text-[var(--cvl-muted)] hover:text-white">×</button></div>
          <p className="mt-1 text-[13px] font-semibold">{selectedNode.label}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--cvl-muted)]">Input energy splits along the existing border. Both fronts meet at the output, release the next packet, then drain back to neutral.</p>
        </div>}
      </div>
    </div>
  </div>;
}
