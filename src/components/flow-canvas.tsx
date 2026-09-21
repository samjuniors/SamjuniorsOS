"use client";

import { ExecutionCanvas, type WorkflowNode, type WorkflowEdge } from "./execution-canvas";
import { AgentGlyph, GoogleG, MemoryGlyph, SheetGlyph, TriggerGlyph } from "./glyphs";

const NODES: WorkflowNode[] = [
  { id: "trigger", label: "Telegram Trigger", caption: "inbound event", x: 10, y: 48, shape: "rounded", icon: <TriggerGlyph /> },
  { id: "agent", label: "Real Estate AI Agent", caption: "orchestrator", x: 47, y: 22, shape: "wide", icon: <AgentGlyph /> },
  { id: "model", label: "Gemini Chat Model", caption: "reasoning", x: 32, y: 78, shape: "circle", icon: <GoogleG />, color: "blue" },
  { id: "memory", label: "Conversation Memory", caption: "context store", x: 62, y: 78, shape: "circle", icon: <MemoryGlyph />, color: "blue" },
  { id: "sheet", label: "Save Lead to Sheet", caption: "artifact", x: 89, y: 48, shape: "rounded", icon: <SheetGlyph /> },
];
const EDGES: WorkflowEdge[] = [
  { id: "e1", from: "trigger", to: "agent", kind: "orange", sourceSide: "right", targetSide: "left" },
  { id: "e2", from: "model", to: "agent", kind: "blue", dashed: true, sourceSide: "top", targetSide: "bottom", targetOffset: -24 },
  { id: "e3", from: "memory", to: "agent", kind: "blue", dashed: true, sourceSide: "top", targetSide: "bottom", targetOffset: 24 },
  { id: "e4", from: "agent", to: "sheet", kind: "orange", sourceSide: "right", targetSide: "left" },
];

export function FlowCanvas({ density }: { density: "full" | "minimal" }) {
  return <ExecutionCanvas nodes={NODES} edges={EDGES} density={density} height={500} minWidth={760} title="canvas / execution" />;
}
