"use client";

import { useId, useState } from "react";
import { Section, SubLabel, Chip } from "./primitives";
import { NodeCard, type NodeShape, type NodeVisualState } from "./node-card";
import { FxSpecimen, PipeSpecimen, type FxKind } from "./fx-canvas";
import { ExecutionCanvas, type WorkflowNode, type WorkflowEdge } from "./execution-canvas";
import { AgentGlyph, GoogleG, MemoryGlyph, SearchGlyph, SheetGlyph } from "./glyphs";

function TelegramGlyph({ size = 26 }: { size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.7 19c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9L18.2 6c.4-.3-.1-.5-.6-.2L6.5 12.7l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 2.8c.9-.3 1.6.2 1.4 1.5z" /></svg>;
}
function BellGlyph() {
  return <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" strokeLinejoin="round" /><path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" /></svg>;
}
function CodeGlyph() {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 6 4 12l5 6M15 6l5 6-5 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function CheckGlyph() {
  return <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#34d399" strokeWidth="2.4" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const EDGE_KINDS = [
  { k: "simple", label: "Simple" }, { k: "curved", label: "Curved" }, { k: "dashed", label: "Dashed" },
  { k: "executing", label: "Executing (orange)" }, { k: "flow", label: "Flow (blue)" },
  { k: "branch", label: "Branching (3-way)" }, { k: "merge", label: "Merge (join)" },
  { k: "elbow", label: "Step / Elbow" }, { k: "arrows", label: "With Arrows" },
] as const;

function EdgeSpecimen({ kind, density }: { kind: typeof EDGE_KINDS[number]["k"]; density: "full" | "minimal" }) {
  const arrow = useId().replace(/:/g, "");
  const port = (x: number, y: number) => <circle cx={x} cy={y} r="3" fill="#0b111b" stroke="#65758d" strokeWidth="1.4" />;
  const stroke = "#8fa2bd";
  return <div className="rounded-lg border border-[var(--cvl-line)] bg-[#060a11] p-2">
    {kind === "executing" || kind === "flow" ? <PipeSpecimen color={kind === "flow" ? "blue" : "orange"} density={density} /> :
      <svg viewBox="0 0 170 56" className="h-[56px] w-full" aria-hidden="true">
        <defs><marker id={arrow} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8z" fill={stroke} /></marker></defs>
        {kind === "simple" && <><path d="M14 28 H156" stroke={stroke} strokeWidth="1.4" />{port(14, 28)}{port(156, 28)}</>}
        {kind === "curved" && <><path d="M14 36 C70 36 100 18 156 18" fill="none" stroke={stroke} strokeWidth="1.4" />{port(14, 36)}{port(156, 18)}</>}
        {kind === "dashed" && <><path d="M14 28 H156" stroke={stroke} strokeWidth="1.4" strokeDasharray="6 6" />{port(14, 28)}{port(156, 28)}</>}
        {kind === "elbow" && <><path d="M14 38 H85 V18 H156" fill="none" stroke={stroke} strokeWidth="1.4" />{port(14, 38)}{port(156, 18)}</>}
        {kind === "arrows" && <><path d="M14 28 H152" stroke={stroke} strokeWidth="1.4" markerEnd={`url(#${arrow})`} /><path d="M80 28 H110" stroke={stroke} strokeWidth="1.4" markerEnd={`url(#${arrow})`} opacity=".7" />{port(14, 28)}</>}
        {kind === "branch" && <><path d="M14 28 C70 28 80 12 152 12 M14 28 H152 M14 28 C70 28 80 44 152 44" fill="none" stroke={stroke} strokeWidth="1.3" />{port(14, 28)}{port(152, 12)}{port(152, 28)}{port(152, 44)}</>}
        {kind === "merge" && <><path d="M14 12 C70 12 80 28 152 28 M14 28 H152 M14 44 C70 44 80 28 152 28" fill="none" stroke={stroke} strokeWidth="1.3" />{port(14, 12)}{port(14, 28)}{port(14, 44)}{port(152, 28)}</>}
      </svg>}
  </div>;
}

const BNODES: WorkflowNode[] = [
  { id: "tg", label: "Telegram Trigger", x: 7, y: 50, shape: "rounded", icon: <span className="text-sky-400"><TelegramGlyph /></span> },
  { id: "agent", label: "Real Estate AI Agent", x: 30, y: 50, shape: "wide", icon: <AgentGlyph /> },
  { id: "sheet", label: "Save to Sheet", x: 55, y: 50, shape: "rounded", icon: <SheetGlyph /> },
  { id: "notify", label: "Notify Team", x: 77, y: 22, shape: "rounded", icon: <BellGlyph /> },
  { id: "reply", label: "Reply to User", x: 77, y: 78, shape: "rounded", icon: <span className="text-sky-400"><TelegramGlyph /></span> },
  { id: "done", label: "Flow Complete", x: 94, y: 50, shape: "square", icon: <CheckGlyph />, color: "green" },
];
const BEDGES: WorkflowEdge[] = [
  { id: "b1", from: "tg", to: "agent", kind: "orange", sourceSide: "right", targetSide: "left" },
  { id: "b2", from: "agent", to: "sheet", kind: "blue", dashed: true, sourceSide: "right", targetSide: "left" },
  { id: "b3", from: "sheet", to: "notify", kind: "blue", dashed: true, sourceSide: "right", targetSide: "left" },
  { id: "b4", from: "sheet", to: "reply", kind: "blue", dashed: true, sourceSide: "right", targetSide: "left" },
  { id: "b5", from: "notify", to: "done", kind: "orange", dashed: true, sourceSide: "right", targetSide: "left" },
  { id: "b6", from: "reply", to: "done", kind: "orange", dashed: true, sourceSide: "right", targetSide: "left" },
];
const FX_VARIATIONS: { kind: FxKind; label: string; sub: string }[] = [
  { kind: "idle", label: "Idle Outline", sub: "resting stroke" },
  { kind: "ignite", label: "Ignite & Fill", sub: "two fronts · one border" },
  { kind: "comet", label: "Comet Trail", sub: "pipe fills, then drains" },
  { kind: "blueflow", label: "Blue Data Flow", sub: "transient conduit fill" },
  { kind: "impact", label: "Input Ignition", sub: "port-local sparks" },
  { kind: "success", label: "Success Flow", sub: "green fill · settle" },
  { kind: "error", label: "Error Flow", sub: "red fill · settle" },
  { kind: "fade", label: "Fade Out", sub: "outline empties" },
];

export function WorkflowSection() {
  const [density, setDensity] = useState<"full" | "minimal">("full");
  const stateRow: { s: NodeVisualState; label: string }[] = [
    { s: "idle", label: "Idle" }, { s: "hover", label: "Hover" }, { s: "selected", label: "Selected" },
    { s: "preignite", label: "Pre-Ignite" }, { s: "igniting", label: "Igniting" }, { s: "executing", label: "Executing" },
    { s: "success", label: "Success" }, { s: "error", label: "Error" },
  ];
  const shapes: { sh: NodeShape; label: string }[] = [
    { sh: "square", label: "Square" }, { sh: "rounded", label: "Rounded" }, { sh: "circle", label: "Circle" },
    { sh: "wide", label: "Wide (agent)" }, { sh: "tall", label: "Tall" }, { sh: "pill", label: "Pill" }, { sh: "hex", label: "Hexagon" },
  ];
  return <Section index="11" kicker="automation workflow" title="Automation Workflow — Component Library"
    blurb="Reusable nodes, edges and execution semantics. Energy enters through a real port, fills the existing outline in both directions, releases at the output, then drains back to neutral."
    right={<div className="flex items-center gap-2"><span className="cvl-label">fx density</span><Chip active={density === "full"} onClick={() => setDensity("full")}>full</Chip><Chip accent="#a78bfa" active={density === "minimal"} onClick={() => setDensity("minimal")}>minimal</Chip></div>}>
    <SubLabel id="11.1" text="node components — core building blocks" />
    <div className="flex flex-wrap items-start gap-x-2 gap-y-6">
      <NodeCard shape="rounded" icon={<span className="text-sky-400"><TelegramGlyph /></span>} label="Telegram Trigger" caption="trigger node" />
      <NodeCard shape="rounded" icon={<GoogleG />} label="Google Gemini" caption="model node" />
      <NodeCard shape="circle" icon={<MemoryGlyph />} label="Conversation Memory" caption="memory node" />
      <NodeCard shape="rounded" icon={<SheetGlyph />} label="Save Lead to Sheet" caption="action node" />
      <NodeCard shape="wide" icon={<AgentGlyph />} label="Real Estate AI Agent" caption="agent node" />
      <NodeCard shape="rounded" icon={<SearchGlyph />} label="Vehicle Search" caption="tool node" />
      <NodeCard shape="rounded" state="igniting" repeatIgnition effectDensity={density} icon={<span className="text-sky-300"><TelegramGlyph /></span>} label="Igniting Node" caption="input → fill → drain" ports={{ left: "input", right: "output" }} />
      <NodeCard shape="hex" icon={<CodeGlyph />} label="Custom Step" caption="hexagon node" />
      <div className="flex w-[172px] flex-col items-center"><div className="grid h-16 w-[76px] place-items-center rounded-[18px] border border-dashed border-[var(--cvl-line)] text-[var(--cvl-dim)]"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 3v12M3 9h12" strokeLinecap="round" /></svg></div><div className="mt-2.5 text-[12px] font-semibold">Add Node</div><div className="cvl-mono mt-0.5 text-[9px] uppercase tracking-[0.16em] text-[var(--cvl-dim)]">empty slot</div></div>
    </div>

    <div className="mt-10 grid gap-8 lg:grid-cols-[1.9fr_0.9fr_1.4fr]">
      <div><SubLabel id="11.2" text="node states — same component, different energy" /><div className="flex flex-wrap gap-3">{stateRow.map(r => <div key={r.s} className="flex flex-col items-center gap-2">
        <NodeCard shape="rounded" state={r.s} repeatIgnition effectDensity={density} icon={<span className="text-sky-400"><TelegramGlyph size={22} /></span>} ports={r.s === "idle" ? undefined : { left: "input", right: "output" }} />
        <span className="cvl-mono -mt-2 text-[9px] uppercase tracking-[0.16em]" style={{ color: r.s === "success" ? "#34d399" : r.s === "error" ? "#f43f5e" : r.s === "igniting" || r.s === "executing" ? "#ff9a3c" : "var(--cvl-dim)" }}>{r.label}</span>
      </div>)}</div></div>
      <div><SubLabel id="11.3" text="connection ports" /><p className="mb-4 text-[11px] leading-relaxed text-[var(--cvl-muted)]">Actual attachment points. Heat arrives at the input contact and leaves only when the outline reaches the output.</p><div className="grid grid-cols-4 gap-2">{(["default", "active", "input", "output"] as const).map(k => <div key={k} className="flex flex-col items-center gap-2 rounded-lg border border-[var(--cvl-line)] bg-[#060a11] py-3"><span className="h-3 w-3 rounded-full border-2" style={{ background: "#0b111b", borderColor: k === "active" ? "#38bdf8" : k === "input" ? "#ff9a3c" : "#3a4a61" }} /><span className="cvl-mono text-[9px] uppercase tracking-[0.14em] text-[var(--cvl-dim)]">{k}</span></div>)}</div></div>
      <div><SubLabel id="11.4" text="node shapes" /><div className="flex flex-wrap items-start gap-3">{shapes.map(s => <div key={s.sh} className="flex flex-col items-center gap-2"><NodeCard shape={s.sh} icon={<span className="text-sky-400"><TelegramGlyph size={20} /></span>} /><span className="cvl-mono -mt-2 text-[9px] uppercase tracking-[0.14em] text-[var(--cvl-dim)]">{s.label}</span></div>)}</div></div>
    </div>

    <div className="mt-10"><SubLabel id="11.5" text="connections / edges — all edge types" /><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{EDGE_KINDS.map(e => <div key={e.k}><EdgeSpecimen kind={e.k} density={density} /><div className="cvl-mono mt-1.5 text-center text-[9px] uppercase tracking-[0.14em] text-[var(--cvl-dim)]">{e.label}</div></div>)}</div></div>

    <div className="mt-10"><SubLabel id="11.6" text="execution animation sequence — live particle driven" />
      <ExecutionCanvas nodes={BNODES} edges={BEDGES} density={density} title="workflow / sequence" />
      <p className="cvl-mono mt-3 text-[10px] leading-relaxed text-[var(--cvl-muted)]">Input ignition → two outline fronts → output spark → connection fills → destination ignites → strokes drain. The original outline stays in place; only the energy moves.</p>
    </div>

    <div className="mt-10 grid gap-8 lg:grid-cols-[2fr_1fr]">
      <div><SubLabel id="11.7" text="particle & flow variations" /><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{FX_VARIATIONS.map(v => <div key={v.kind}><FxSpecimen kind={v.kind} density={density} /><div className="mt-1.5 text-[11px] font-semibold">{v.label}</div><div className="cvl-mono text-[9px] uppercase tracking-[0.14em] text-[var(--cvl-dim)]">{v.sub}</div></div>)}</div></div>
      <div><SubLabel id="11.8" text="status indicators" /><div className="grid grid-cols-5 gap-2">{[["idle", "#3a4a61"], ["running", "#38bdf8"], ["success", "#34d399"], ["error", "#f43f5e"], ["warn", "#f59e0b"]].map(([label, color]) => <div key={label} className="flex flex-col items-center gap-2 rounded-lg border border-[var(--cvl-line)] bg-[#060a11] py-3"><span className="grid h-5 w-5 place-items-center rounded-full" style={{ background: `${color}22`, border: `2px solid ${color}` }}>{["success", "error", "warn"].includes(label) && <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d={label === "success" ? "M2 5.2 4.2 7.4 8 3" : "M5 2v4M5 7.6v.4"} stroke={color} strokeWidth="1.7" fill="none" strokeLinecap="round" /></svg>}</span><span className="cvl-mono text-[9px] uppercase tracking-[0.12em] text-[var(--cvl-dim)]">{label}</span></div>)}</div></div>
    </div>
  </Section>;
}
