"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { SHAPE_SIZE, outlinePath, shapePort, type NodeShape, type Point, type PortSide } from "@/lib/shape-geometry";
import { NodeIgnition } from "./fx-canvas";
import { PortBead } from "./port-bead";
import type { FxDensity } from "@/lib/fx-engine";

export { SHAPE_SIZE } from "@/lib/shape-geometry";
export type { NodeShape } from "@/lib/shape-geometry";
export type NodeVisualState = "idle" | "hover" | "selected" | "preignite" | "igniting" | "executing" | "success" | "error";
export type PortKind = "default" | "active" | "input" | "output";
export type Ports = Partial<Record<PortSide, PortKind>>;

export function NodeCard({
  shape = "rounded", state = "idle", icon, label, caption, ports, style, selected = false,
  anchored = false, managedEffects = false, effectDensity = "full", repeatIgnition = false, inputPoint, outputPoint,
}: {
  shape?: NodeShape; state?: NodeVisualState; icon?: ReactNode; label?: string; caption?: string; ports?: Ports;
  style?: CSSProperties; selected?: boolean;
  /** The anchor is the shape box only; labels never move connection coordinates. */
  anchored?: boolean;
  /** A shared workflow canvas owns execution; prevent duplicate local effects. */
  managedEffects?: boolean;
  effectDensity?: FxDensity;
  /** Opt-in looping for design-system specimens only. Runtime nodes execute once. */
  repeatIgnition?: boolean;
  /** Actual port locations in the node's local coordinate system. */
  inputPoint?: Point; outputPoint?: Point;
}) {
  const id = useId().replace(/:/g, "");
  const { w, h } = SHAPE_SIZE[shape];
  const selectedState = selected || state === "selected";
  const executing = state === "igniting" || state === "executing";
  const stroke = selectedState || state === "hover" ? "#38bdf8" : state === "success" && !managedEffects ? "#34d399" : state === "error" ? "#f43f5e" : "#344055";
  const inputSide = (Object.entries(ports ?? {}).find(([, kind]) => kind === "input")?.[0] ?? "left") as PortSide;
  const outputSide = (Object.entries(ports ?? {}).find(([, kind]) => kind === "output")?.[0] ?? (inputSide === "top" ? "bottom" : inputSide === "bottom" ? "top" : inputSide === "right" ? "left" : "right")) as PortSide;
  const content = (
    <div data-node-shape={shape} data-node-state={state} className="relative shrink-0" style={{ width: w, height: h }}>
      {/* This is the single visible border. Execution uses this exact centerline. */}
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <defs><linearGradient id={`node-material-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#161e2c" /><stop offset="1" stopColor="#0b1019" /></linearGradient></defs>
        <path data-outline d={outlinePath(shape)} fill={`url(#node-material-${id})`} stroke={stroke} strokeWidth={selectedState ? 2 : 1.4} strokeLinejoin="round" style={{ transition: "stroke 220ms ease", filter: selectedState ? "drop-shadow(0 0 5px #38bdf84d)" : undefined }} />
      </svg>
      <span className="pointer-events-none absolute inset-0 grid place-items-center" style={{ color: state === "error" ? "#fda4af" : "var(--cvl-text)" }}>{icon}</span>
      {/* No orange background, permanent hot frame, offset orbit or detached ring. */}
      {executing && !managedEffects && <NodeIgnition shape={shape} density={effectDensity} inputSide={inputSide} outputSide={outputSide} input={inputPoint} output={outputPoint} repeat={repeatIgnition} />}
      {state === "preignite" && !managedEffects && <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><circle cx={shapePort(shape, { x: w / 2, y: h / 2 }, inputSide).x} cy={shapePort(shape, { x: w / 2, y: h / 2 }, inputSide).y} r="1.8" fill="#ffbe69" style={{ filter: "drop-shadow(0 0 4px #ff9a3c)" }} /></svg>}
      {ports && <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {Object.entries(ports).filter(([, kind]) => kind !== undefined).map(([side, kind]) => {
          const p = shapePort(shape, { x: w / 2, y: h / 2 }, side as PortSide);
          return <PortBead key={side} x={p.x} y={p.y} active={kind === "active" && !executing} accent="#38bdf8" />;
        })}
      </svg>}
      {(state === "success" || state === "error") && <span className="absolute -bottom-1.5 -right-1.5 z-20 grid h-4 w-4 place-items-center rounded-full bg-[#0b111b]" style={{ border: `1px solid ${state === "success" ? "#34d39999" : "#f43f5e99"}` }}><svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d={state === "success" ? "M2 5.2 4.2 7.4 8 3" : "M5 2v4M5 8v.5"} stroke={state === "success" ? "#34d399" : "#f43f5e"} strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg></span>}
    </div>
  );
  const labelBlock = label && <div className={anchored ? "pointer-events-none absolute left-1/2 top-full mt-2 w-[172px] -translate-x-1/2 text-center" : "mt-2.5 max-w-[172px] text-center"}>
    <div className="text-[12px] font-semibold leading-tight tracking-tight">{label}</div>
    {caption && <div className="cvl-mono mt-0.5 text-[9px] uppercase tracking-[0.16em] text-[var(--cvl-dim)]">{caption}</div>}
  </div>;
  return anchored ? <div className="relative" style={{ width: w, height: h, ...style }}>{content}{labelBlock}</div> : <div className="flex w-[172px] flex-col items-center" style={style}>{content}{labelBlock}</div>;
}
