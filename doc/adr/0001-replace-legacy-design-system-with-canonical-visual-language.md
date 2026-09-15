# ADR 0001: Replace Legacy Design System with Canonical Visual Language

## Status
COMPLETED — 2026-09-15

## Context & Problem
SamJuniorsOS previously operated with a fragmented design-system implementation centered in `src/components/workflow/*`, `src/os/index.css`, and a legacy specimen page (`src/app/design-system/workflow/page.tsx`). 
Specific architectural problems with the legacy system:
1. **Parallel token systems**: Duplicate CSS variables (`--os-*`, `--sj-*`, hardcoded hex codes, and ad-hoc class utilities) caused visual divergence between the desktop shell, contextual surfaces, and canvas.
2. **Disconnected geometry & execution effects**: Node perimeters and connectors used generic approximate SVG shapes with independent CSS timers and detached orbits that did not match real port coordinates or signal transmission physics.
3. **Bloated, non-canonical component library**: `src/components/workflow/*` accumulated 12 sprawling files (`Node.tsx`, `NodeGeometry.tsx`, `NodePort.tsx`, `NodeContent.tsx`, `Connector.tsx`, `Effects.tsx`, `ExecutionPerimeter.tsx`, `BrandLogos.tsx`, `execution-language.ts`, `tokens.ts`, `index.ts`) that mingled presentation concerns with ad-hoc mock structures.
4. **Lack of a unified specimen laboratory**: The legacy specimen laboratory failed to provide an authoritative contract of surfaces, states, and copyable token definitions.

A reference implementation of the new Canonical Visual Language (CVL) was provided in `upload/new design-system`.

## Decision
We replace the old design system with the new Canonical Visual Language as the sole canonical visual presentation layer for SamJuniorsOS.

### 1. Canonical Visual Language Architecture
- **Tokens**: One unified token system (`--cvl-*`) defined in `src/app/globals.css` and `src/lib/tokens.ts` (covering `idle`, `running`, `signal`, `completed`, `blocked`, `approval`).
- **Mathematical Geometry**: Exact centerline SVG geometry and sub-pixel perimeter sampling in `src/lib/shape-geometry.ts` and port coordinates in `src/lib/ports.ts`.
- **Execution FX Engine**: High-performance HTML5 Canvas fluid execution engine (`src/lib/fx-engine.ts`) and DAG execution runner (`src/lib/workflow-runner.ts`) powering single-perimeter ignition and connection comet trails.
- **Canonical Components**: Clean, presentation-only components in `src/components/`:
  - `primitives.tsx` (Eyebrow, Section, SubLabel, Chip)
  - `glyphs.tsx` (Service and entity flat SVGs)
  - `port-bead.tsx` (Physical socket affordances)
  - `node-card.tsx` (Exact SVG outline border, ports, state-based glow)
  - `node-orb.tsx` (Circular entity medallions & ProgressRing)
  - `fx-canvas.tsx` (Canvas overlay hooks and specimens)
  - `execution-canvas.tsx` (Shared interactive execution board)
  - `flow-canvas.tsx` (Canonical workflow flow canvas)
  - `sections.tsx` (Foundations, entities, perimeter, relationships, sequence, surfaces, commit, empty states)
  - `token-table.tsx` (Interactive token table)
  - `workflow-section.tsx` (Complete component library section)
  - `canonical-node.tsx` (Canonical presentation node, perimeter, and icon containers)
  - `connector.tsx` (Canonical SVG connector with progressive flow)

### 2. Strict Architectural Boundaries (What is Intentionally NOT Migrated)
- **Prisma remains the sole authoritative ORM**: Standalone Drizzle ORM files (`drizzle.config.json`, `src/db/index.ts`, `src/db/schema.ts`) and standalone Postgres dependencies (`pg`) from `upload/new design-system` were strictly rejected.
- **Backend & Control Plane Untouched**: Authoritative workflow definitions, step state machines, founder authorization gates, audit trails, and Sophia Phase 2 grounding intelligence remain completely unchanged.
- **Specimen vs. Production Data Isolation**:
  - The design-system laboratory routes (`/design-system`, `/design-system/workflow`) use `fallbackTokens` and controlled specimen fixtures.
  - Production OS routes (`/`, desktop flow) consume real, authoritative `GraphDTO` and runtime state. No demo data is permitted in production code paths.

### 3. Migration & Deletion Results
1. Migrated global CSS (`src/app/globals.css`, `src/os/index.css`) and layout.
2. Installed canonical libraries in `src/lib/` and canonical components in `src/components/`.
3. Updated production consumers (`src/os/lib/flow.ts`, `src/os/components/FlowDesktop.tsx`) to consume canonical tokens and components.
4. Replaced the old specimen (`src/app/design-system/workflow/page.tsx`) and added `/design-system` with the new 12-section laboratory.
5. Added read-only design token inspection API route (`src/app/api/tokens/route.ts`).
6. Verified zero remaining imports of `components/workflow` across the entire codebase.
7. Deleted all 12 legacy files and removed `src/components/workflow/`.

## Risks & Mitigations
- **Risk**: Visual or layout regressions in the production desktop canvas (`FlowDesktop.tsx`).
  - **Mitigation**: Adapt `Phase4NodeCard` and `Phase4Connector` at the presentation boundary to map `FlowNode` and `FlowEdge` models directly to the new `NodeCard`, `NodeOrb`, and SVG geometry without mutating underlying data contracts.
- **Risk**: Animation performance or CPU overhead.
  - **Mitigation**: The `FxEngine` includes visibility culling (IntersectionObserver), document visibility detection, frame clock delta clamping, and automatic animation disabling under `prefers-reduced-motion: reduce`.

## Verification Evidence
1. **Design System Execution Suite**:
   Command: `node --test tests/design-system/execution.test.cjs`
   Result: **16/16 tests passed** (geometry, perimeter splitting, fill envelopes, comets, reset, acyclic check, reduced motion).
2. **Authoritative Backend Read-Model Suite**:
   Command: `npx tsx tests/phase4_3a_graph_read_model.test.ts`
   Result: **9/9 tests passed** (auth boundary, semantic separation, deterministic projection, calm baseline, approval gate escalation, specialist revelation, invariant failure, fail-closed handling, inspection context).
3. **Production Build**:
   Command: `npx next build --webpack`
   Result: **Clean exit code 0**; all 30 routes (including `/`, `/api/tokens`, `/design-system`, `/design-system/workflow`) generated and optimized successfully.
4. **Browser Verification**:
   Executed automated browser walkthrough inspecting `/design-system`, `/design-system/workflow`, and `/`.
   Results:
   - Zero console errors or hydration mismatches.
   - Sophia interactive 3D orb and prompt bar rendered crisply.
   - Spatial canvas nodes, connectors, and perimeters render accurately with live state.
   - Node Inspector displays authoritative stages (1/9 stages complete) and topology.
   - Attention, Decisions, and Agent Chat panels operate smoothly.
