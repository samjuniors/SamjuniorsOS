"use client";

import { useEffect, useRef, useState } from "react";
import { FxEngine, type FxColor, type FxDensity } from "@/lib/fx-engine";
import { EXECUTION, type FillTiming } from "@/lib/execution-tokens";
import { SHAPE_SIZE, outlinePath, shapePort, type NodeShape, type Point, type PortSide } from "@/lib/shape-geometry";

/** One engine per canvas; quality changes never restart a running execution. */
export function useFx(density: FxDensity = "full") {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FxEngine | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new FxEngine(canvas);
    engineRef.current = engine;
    const parent = canvas.parentElement!;
    const resize = () => engine.resize(parent.clientWidth, parent.clientHeight);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    const visibility = new IntersectionObserver(([entry]) => engine.setVisible(entry.isIntersecting), { rootMargin: "40px" });
    visibility.observe(parent);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = () => engine.setReducedMotion(media.matches);
    const documentVisibility = () => engine.setDocumentVisible(!document.hidden);
    media.addEventListener("change", reduced);
    document.addEventListener("visibilitychange", documentVisibility);
    documentVisibility();
    engine.start();
    return () => {
      observer.disconnect(); visibility.disconnect();
      media.removeEventListener("change", reduced);
      document.removeEventListener("visibilitychange", documentVisibility);
      engine.dispose(); engineRef.current = null;
    };
  }, []);
  useEffect(() => { engineRef.current?.setDensity(density); }, [density]);
  return { canvasRef, engineRef };
}

/** Local overlay on the node's exact SVG stroke, with room only for escaping sparks. */
export function NodeIgnition({ shape, color = "orange", density = "full", inputSide = "left", outputSide = "right", input, output, repeat = false, width, height, timing }: {
  shape: NodeShape; color?: FxColor; density?: FxDensity; inputSide?: PortSide; outputSide?: PortSide;
  input?: Point; output?: Point; repeat?: boolean; width?: number; height?: number; timing?: Partial<FillTiming>;
}) {
  const w = width ?? SHAPE_SIZE[shape].w, h = height ?? SHAPE_SIZE[shape].h;
  const padding = 22;
  const { canvasRef, engineRef } = useFx(density);
  const pre = timing?.pre ?? EXECUTION.node.pre;
  const fill = timing?.fill ?? EXECUTION.node.fill;
  const hold = timing?.hold ?? EXECUTION.node.hold;
  const drain = timing?.drain ?? EXECUTION.node.drain;
  const ix = input?.x, iy = input?.y, ox = output?.x, oy = output?.y;
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const center = { x: padding + w / 2, y: padding + h / 2 };
    const inPort = ix !== undefined && iy !== undefined ? { x: padding + ix, y: padding + iy } : shapePort(shape, center, inputSide, 0, w, h);
    const outPort = ox !== undefined && oy !== undefined ? { x: padding + ox, y: padding + oy } : shapePort(shape, center, outputSide, 0, w, h);
    const play = () => {
      engine.igniteNode({
        id: "outline", shape, center, width: w, height: h, input: inPort, output: outPort, color,
        timing: { pre, fill, hold, drain },
        onPhase: phase => { if (canvasRef.current) canvasRef.current.dataset.phase = phase; },
        onSettled: () => { if (repeat && !engine.reduced) engine.schedule(EXECUTION.quiet, play); },
      });
    };
    play();
    return () => engine.clearTransient();
  }, [shape, color, inputSide, outputSide, repeat, w, h, pre, fill, hold, drain, ix, iy, ox, oy, canvasRef, engineRef]);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute z-[25]" style={{ left: -padding, top: -padding, width: w + padding * 2, height: h + padding * 2 }}>
      <canvas ref={canvasRef} data-ignition-canvas className="absolute inset-0 h-full w-full" />
    </div>
  );
}

/** Shared orange/blue pipe specimen, with an exact neutral SVG beneath the fill. */
export function PipeSpecimen({ color, density, height = 56 }: { color: FxColor; density: FxDensity; height?: number }) {
  const { canvasRef, engineRef } = useFx(density);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;
    const measure = () => setWidth(parent.clientWidth);
    measure(); const observer = new ResizeObserver(measure); observer.observe(parent);
    return () => observer.disconnect();
  }, [canvasRef]);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !width) return;
    const play = () => engine.launchComet({
      id: "pipe", from: { x: 12, y: height / 2 }, to: { x: width - 12, y: height / 2 },
      color, dashed: color === "blue", timing: { fill: 1350, drain: 1300 },
      onArrive: () => engine.burst(width - 12, height / 2, color, 5, .4),
      onDrained: () => { if (!engine.reduced) engine.schedule(1100, play); },
      onPhase: phase => { if (canvasRef.current) canvasRef.current.dataset.phase = phase; },
    });
    play();
    return () => engine.clearTransient();
  }, [width, height, color, canvasRef, engineRef]);
  return (
    <div className="relative w-full" style={{ height }}>
      {width > 0 && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <path d={`M 12 ${height / 2} H ${width - 12}`} stroke="#3a4358" strokeWidth="1.4" fill="none" strokeDasharray={color === "blue" ? "6 7" : undefined} />
        {[12, width - 12].map(x => <circle key={x} cx={x} cy={height / 2} r="3" fill="#080c14" stroke="#536177" strokeWidth="1.2" />)}
      </svg>}
      <canvas ref={canvasRef} data-pipe-canvas className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden="true" />
    </div>
  );
}

export type FxKind = "idle" | "ignite" | "comet" | "blueflow" | "impact" | "success" | "error" | "fade";
export function FxSpecimen({ kind, density }: { kind: FxKind; density: FxDensity }) {
  const color: FxColor = kind === "success" ? "green" : kind === "error" ? "red" : "orange";
  return (
    <div className="relative h-[92px] w-full overflow-hidden rounded-lg border border-[var(--cvl-line)] bg-[#060a11]">
      <div className="cvl-grid pointer-events-none absolute inset-0 opacity-40" />
      {kind === "comet" || kind === "blueflow" ? <PipeSpecimen color={kind === "blueflow" ? "blue" : "orange"} density={density} height={92} /> :
        <div className="absolute left-1/2 top-1/2 h-[48px] w-[64px] -translate-x-1/2 -translate-y-1/2">
          <svg viewBox="0 0 64 48" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <path d={outlinePath("rounded", 64, 48)} fill="#0b111b" stroke="#344055" strokeWidth="1.4" />
            <path d="M27 24h10m-4-4 4 4-4 4" fill="none" stroke="#607087" strokeWidth="1.2" />
          </svg>
          {kind !== "idle" && <NodeIgnition shape="rounded" width={64} height={48} color={color} density={density} repeat timing={kind === "fade" ? { fill: 750, drain: 2200 } : kind === "impact" ? { pre: 50, fill: 1000 } : undefined} />}
        </div>}
    </div>
  );
}
