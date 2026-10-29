#!/usr/bin/env node
/**
 * Canonical Design System Token Reconciliation Script (Gate G8.1)
 *
 * Audits and reconciles token definitions and component styles against DESIGN.md:
 * - Color tokens: Backgrounds, Borders, Accents, Semantics, Glows, Agent Tints
 * - Typography: tabular-nums (.tnum)
 * - Surfaces: .glass-panel, .glass-popover, .glass-modal, .glass-card
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

// 1. Reconcile src/os/index.css
const indexCssPath = path.join(root, 'src', 'os', 'index.css');
let indexCss = fs.readFileSync(indexCssPath, 'utf8');

indexCss = indexCss.replace(
  /--os-surface: var\(--cvl-panel\);/,
  '--os-surface: var(--bg-surface);'
).replace(
  /--os-surface-raised: var\(--cvl-panel-2\);/,
  '--os-surface-raised: var(--bg-chrome);'
).replace(
  /--os-line: var\(--cvl-line\);/,
  '--os-line: var(--border-default);'
).replace(
  /--os-line-strong: var\(--cvl-running\);/,
  '--os-line-strong: var(--border-accent);'
).replace(
  /--os-cyan: var\(--cvl-running\);/,
  '--os-cyan: var(--accent-cyan-400);'
).replace(
  /--os-amber: var\(--cvl-signal\);/,
  '--os-amber: var(--semantic-warning);'
);

fs.writeFileSync(indexCssPath, indexCss, 'utf8');
console.log('✓ src/os/index.css reconciled');

// 2. Reconcile src/lib/tokens.ts
const tokensPath = path.join(root, 'src', 'lib', 'tokens.ts');
let tokensTs = fs.readFileSync(tokensPath, 'utf8');

// Replace WORKFLOW_COLORS values
tokensTs = tokensTs.replace(
  /bgVoid: "#05070c"/,
  'bgVoid: "#01040a"'
).replace(
  /bgSurface: "#0b111b"/,
  'bgSurface: "#050a14"'
).replace(
  /bgPanel: "#0b111b"/,
  'bgPanel: "#050a14"'
).replace(
  /processing: "#f59e0b"/g,
  'processing: "#fcd34d"'
).replace(
  /error: "#f43f5e"/,
  'error: "#fb7185"'
).replace(
  /accentCyan: "#38bdf8"/,
  'accentCyan: "#67e8f9"'
);

// Replace stateAccent values
tokensTs = tokensTs.replace(
  /signal: "#f59e0b"/,
  'signal: "#fcd34d"'
).replace(
  /blocked: "#f43f5e"/,
  'blocked: "#fb7185"'
);

// Replace fallbackTokens values
tokensTs = tokensTs.replace(
  /\{ category: "surface", name: "void", value: "#05070c", note: "page base" \}/,
  '{ category: "surface", name: "void", value: "#01040a", note: "page base" }'
).replace(
  /\{ category: "surface", name: "canvas", value: "#080c14", note: "grid field" \}/,
  '{ category: "surface", name: "deep", value: "#03060d", note: "lock / boot base" }'
).replace(
  /\{ category: "surface", name: "panel", value: "#0b111b", note: "card body" \}/,
  '{ category: "surface", name: "surface", value: "#050a14", note: "window surface" }'
).replace(
  /\{ category: "surface", name: "line", value: "#182233", note: "hairline border" \}/,
  '{ category: "surface", name: "chrome", value: "#060c18", note: "chrome / bar" }'
).replace(
  /\{ category: "state", name: "signal", value: "#f59e0b", note: "external action" \}/,
  '{ category: "state", name: "signal", value: "#fcd34d", note: "external action" }'
).replace(
  /\{ category: "state", name: "blocked", value: "#f43f5e", note: "severed edge" \}/,
  '{ category: "state", name: "blocked", value: "#fb7185", note: "severed edge" }'
);

// Replace ENTITY_IDENTITY to match DESIGN.md Section 2 Agent Tints
tokensTs = tokensTs.replace(
  /sophia: "#fb923c"/,
  'sophia: "#67e8f9"'
).replace(
  /thorne: "#38bdf8"/,
  'thorne: "#c084fc"'
).replace(
  /lin: "#c084fc"/,
  'lin: "#fcd34d"'
).replace(
  /approval: "#fbbf24"/,
  'approval: "#fcd34d"'
);

fs.writeFileSync(tokensPath, tokensTs, 'utf8');
console.log('✓ src/lib/tokens.ts reconciled');

// 3. Reconcile src/os/lib/osStore.ts AGENTS array
const osStorePath = path.join(root, 'src', 'os', 'lib', 'osStore.ts');
let osStoreTs = fs.readFileSync(osStorePath, 'utf8');

// Thorne: Research -> text-violet-300 / rgba(168,85,247,0.4)
osStoreTs = osStoreTs.replace(
  /state: "ready", tint: "text-amber-300", glow: "rgba\(251,146,60,0.4\)",\r?\n\s*\},(\r?\n\s*\{\r?\n\s*id: "maya")/,
  'state: "ready", tint: "text-violet-300", glow: "rgba(168,85,247,0.4)",\n  },$1'
);

// Maya: PM / Operations -> text-amber-300 / rgba(251,146,60,0.4)
osStoreTs = osStoreTs.replace(
  /state: "ready", tint: "text-emerald-300", glow: "rgba\(52,211,153,0.35\)",\r?\n\s*\},(\r?\n\s*\{\r?\n\s*id: "julian")/,
  'state: "ready", tint: "text-amber-300", glow: "rgba(251,146,60,0.4)",\n  },$1'
);

// Julian: Finance -> text-emerald-300 / rgba(52,211,153,0.4)
osStoreTs = osStoreTs.replace(
  /state: "ready", tint: "text-violet-300", glow: "rgba\(167,139,250,0.35\)",\r?\n\s*\},(\r?\n\];)/,
  'state: "ready", tint: "text-emerald-300", glow: "rgba(52,211,153,0.4)",\n  },$1'
);

fs.writeFileSync(osStorePath, osStoreTs, 'utf8');
console.log('✓ src/os/lib/osStore.ts reconciled');

// 4. Reconcile StandardSurfaces.tsx
const standardSurfacesPath = path.join(root, 'src', 'os', 'components', 'surfaces', 'StandardSurfaces.tsx');
let standardSurfacesTs = fs.readFileSync(standardSurfacesPath, 'utf8');

standardSurfacesTs = standardSurfacesTs.replace(
  /waiting: \{ dot: "bg-amber-400 shadow-\[0_0_8px_rgba\(251,191,36,0.6\)\]", text: "text-amber-300", bg: "bg-amber-500\/10 border-amber-500\/30" \}/,
  'waiting: { dot: "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]", text: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/30" }'
).replace(
  /active: \{ dot: "bg-cyan-400 shadow-\[0_0_8px_rgba\(34,211,238,0.6\)\]", text: "text-cyan-300", bg: "bg-cyan-500\/10 border-cyan-500\/30" \}/,
  'active: { dot: "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]", text: "text-cyan-300", bg: "bg-cyan-500/10 border-cyan-500/30" }'
).replace(
  /healthy: \{ dot: "bg-emerald-400 shadow-\[0_0_8px_rgba\(52,211,153,0.6\)\]", text: "text-emerald-300", bg: "bg-emerald-500\/10 border-emerald-500\/30" \}/,
  'healthy: { dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]", text: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/30" }'
).replace(
  /blocked: \{ dot: "bg-rose-400 shadow-\[0_0_8px_rgba\(244,63,94,0.6\)\]", text: "text-rose-300", bg: "bg-rose-500\/10 border-rose-500\/30" \}/,
  'blocked: { dot: "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]", text: "text-rose-300", bg: "bg-rose-500/10 border-rose-500/30" }'
).replace(
  /offline: \{ dot: "bg-slate-500", text: "text-slate-400"/,
  'offline: { dot: "bg-slate-600", text: "text-slate-400"'
);

// Harmonize InspectorSurface glass styling
standardSurfacesTs = standardSurfacesTs.replace(
  /bg-\[#081120\]\/95 backdrop-blur-xl shadow-2xl/,
  'bg-[var(--bg-chrome)]/95 border-white/12 backdrop-blur-2xl shadow-2xl'
);

fs.writeFileSync(standardSurfacesPath, standardSurfacesTs, 'utf8');
console.log('✓ src/os/components/surfaces/StandardSurfaces.tsx reconciled');
