/**
 * ============================================================================
 * SAMJUNIORS-OS — VISUAL LANGUAGE & DESIGN SYSTEM AUDIT SUITE (Gate G8.1)
 * ============================================================================
 * Step: G8.1 [frontend] Design-system audit against canonical visual language
 *
 * Verifies that the implementation strictly adheres to DESIGN.md tokens:
 * 1. CSS variables in globals.css declare the canonical colors and surfaces.
 * 2. Surface utility classes (.glass-panel, .glass-popover, .glass-modal, .glass-card, .tnum) exist.
 * 3. Color constants in src/lib/tokens.ts match canonical values without drift.
 * 4. Roster presentation metadata in src/os/lib/osStore.ts matches DESIGN.md agent tints.
 * 5. Surface status pills and badges in StandardSurfaces.tsx map to canonical semantic tokens.
 * ============================================================================
 */

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

describe("Gate G8.1 — Design System Audit & Token Consistency", () => {

  test("1. Root CSS variables in globals.css declare canonical DESIGN.md tokens", () => {
    const globalsCssPath = path.join(rootDir, "src", "app", "globals.css");
    expect(fs.existsSync(globalsCssPath)).toBe(true);

    const content = fs.readFileSync(globalsCssPath, "utf8");

    // Background tokens (DESIGN.md Section 2)
    expect(content).toContain("--bg-void: #01040a;");
    expect(content).toContain("--bg-deep: #03060d;");
    expect(content).toContain("--bg-surface: #050a14;");
    expect(content).toContain("--bg-chrome: #060c18;");
    expect(content).toContain("--bg-glass: rgba(4, 10, 20, 0.70);");
    expect(content).toContain("--bg-glass-subtle: rgba(255, 255, 255, 0.02);");
    expect(content).toContain("--bg-glass-hover: rgba(255, 255, 255, 0.04);");

    // Border tokens (DESIGN.md Section 2)
    expect(content).toContain("--border-subtle: rgba(255, 255, 255, 0.05);");
    expect(content).toContain("--border-default: rgba(255, 255, 255, 0.10);");
    expect(content).toContain("--border-elevated: rgba(255, 255, 255, 0.12);");
    expect(content).toContain("--border-accent: rgba(103, 232, 249, 0.35);");

    // Accent tokens
    expect(content).toContain("--accent-cyan-300: #67e8f9;");
    expect(content).toContain("--accent-cyan-400: #22d3ee;");
    expect(content).toContain("--accent-sky-400: #38bdf8;");
    expect(content).toContain("--accent-sky-500: #0ea5e9;");

    // Semantic colors & glows
    expect(content).toContain("--semantic-active: #34d399;");
    expect(content).toContain("--semantic-warning: #fcd34d;");
    expect(content).toContain("--semantic-blocked: #fb7185;");
    expect(content).toContain("--semantic-offline: #475569;");
    expect(content).toContain("--glow-active: rgba(52, 211, 153, 0.8);");
    expect(content).toContain("--glow-warning: rgba(252, 211, 77, 0.8);");
    expect(content).toContain("--glow-blocked: rgba(244, 63, 94, 0.8);");

    // Agent tints & glows
    expect(content).toContain("--agent-sophia: #67e8f9;");
    expect(content).toContain("--agent-sophia-glow: rgba(56, 189, 248, 0.4);");
    expect(content).toContain("--agent-research: #c084fc;");
    expect(content).toContain("--agent-research-glow: rgba(168, 85, 247, 0.4);");
    expect(content).toContain("--agent-operations: #fcd34d;");
    expect(content).toContain("--agent-operations-glow: rgba(251, 146, 60, 0.4);");
    expect(content).toContain("--agent-finance: #34d399;");
    expect(content).toContain("--agent-finance-glow: rgba(52, 211, 153, 0.4);");

    // No drifted values
    expect(content).not.toContain("--cvl-void: #05070c;");
  });

  test("2. Canonical glass surface and typography utility classes exist", () => {
    const globalsCssPath = path.join(rootDir, "src", "app", "globals.css");
    const content = fs.readFileSync(globalsCssPath, "utf8");

    expect(content).toContain(".glass-panel {");
    expect(content).toContain(".glass-popover {");
    expect(content).toContain(".glass-modal {");
    expect(content).toContain(".glass-card {");
    expect(content).toContain(".tnum {");
  });

  test("3. src/lib/tokens.ts exports canonical tokens matching DESIGN.md", async () => {
    const { WORKFLOW_COLORS, stateAccent, ENTITY_IDENTITY, fallbackTokens } = await import("../../src/lib/tokens.ts");

    // Workflow colors
    expect(WORKFLOW_COLORS.bgVoid).toBe("#01040a");
    expect(WORKFLOW_COLORS.bgSurface).toBe("#050a14");
    expect(WORKFLOW_COLORS.processing).toBe("#fcd34d");
    expect(WORKFLOW_COLORS.error).toBe("#fb7185");
    expect(WORKFLOW_COLORS.accentCyan).toBe("#67e8f9");

    // State accents
    expect(stateAccent.signal).toBe("#fcd34d");
    expect(stateAccent.blocked).toBe("#fb7185");

    // Entity identity
    expect(ENTITY_IDENTITY.sophia).toBe("#67e8f9");
    expect(ENTITY_IDENTITY.thorne).toBe("#c084fc");
    expect(ENTITY_IDENTITY.cruz).toBe("#34d399");
    expect(ENTITY_IDENTITY.lin).toBe("#fcd34d");
    expect(ENTITY_IDENTITY.approval).toBe("#fcd34d");

    // Fallback tokens
    const voidToken = fallbackTokens.find((t) => t.category === "surface" && t.name === "void");
    expect(voidToken?.value).toBe("#01040a");
    const deepToken = fallbackTokens.find((t) => t.category === "surface" && t.name === "deep");
    expect(deepToken?.value).toBe("#03060d");
    const signalToken = fallbackTokens.find((t) => t.category === "state" && t.name === "signal");
    expect(signalToken?.value).toBe("#fcd34d");
  });

  test("4. Workforce roster metadata in src/os/lib/osStore.ts matches canonical agent tints", async () => {
    const { presentationFor } = await import("../../src/os/lib/osStore.ts");

    const sophia = presentationFor("sophia");
    expect(sophia.tint).toBe("text-cyan-300");
    expect(sophia.glow).toBe("rgba(56,189,248,0.4)");

    const thorne = presentationFor("thorne");
    expect(thorne.tint).toBe("text-violet-300");
    expect(thorne.glow).toBe("rgba(168,85,247,0.4)");

    const maya = presentationFor("maya");
    expect(maya.tint).toBe("text-amber-300");
    expect(maya.glow).toBe("rgba(251,146,60,0.4)");

    const julian = presentationFor("julian");
    expect(julian.tint).toBe("text-emerald-300");
    expect(julian.glow).toBe("rgba(52,211,153,0.4)");
  });

  test("5. StandardSurfaces.tsx status indicators use canonical tokens and glows", () => {
    const surfacesPath = path.join(rootDir, "src", "os", "components", "surfaces", "StandardSurfaces.tsx");
    const content = fs.readFileSync(surfacesPath, "utf8");

    // Healthy
    expect(content).toContain('healthy: { dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"');
    // Active
    expect(content).toContain('active: { dot: "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"');
    // Waiting (Amber 300)
    expect(content).toContain('waiting: { dot: "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]"');
    // Blocked (Rose 400)
    expect(content).toContain('blocked: { dot: "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]"');
    // Offline (Slate 600)
    expect(content).toContain('offline: { dot: "bg-slate-600"');
  });

});
