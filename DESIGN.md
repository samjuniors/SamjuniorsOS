# DESIGN.md — SamJuniorsOS V2 Design System

**Status:** Active · V2 prototype (`Uploaded/Design1/`)
**Last updated:** 2026-09-11

---

## 1. Visual Language

SamJuniorsOS is a **dark ambient operating environment** for a solo founder. The visual language is:

- **Intimate, not industrial.** Feels like a private command room, not an enterprise dashboard.
- **Calm by default, precise when needed.** The idle state is spacious and quiet. Information density rises only when work is active or attention is required.
- **Obsidian glass.** Surfaces are translucent dark glass with subtle borders, backdrop blur, and layered depth.
- **Cyan signal, warm amber attention.** The primary accent is cyan/sky. Amber signals "needs you." Emerald signals "healthy/done." Rose signals "blocked/danger."
- **Operationally honest.** Every number on screen is derived from real state. No fabricated metrics, no fake agent counts, no simulated throughput.

---

## 2. Color Tokens

### Backgrounds

| Token | Value | Use |
|---|---|---|
| `--bg-void` | `#01040a` | Root background |
| `--bg-deep` | `#03060d` | Lock screen / boot |
| `--bg-surface` | `#050a14` | Window background |
| `--bg-chrome` | `#060c18` | Menu bar, drawer, dock |
| `--bg-glass` | `rgba(4, 10, 20, 0.70)` | Panel / popover fill |
| `--bg-glass-subtle` | `rgba(255, 255, 255, 0.02)` | Card fill, hover states |
| `--bg-glass-hover` | `rgba(255, 255, 255, 0.04)` | Interactive hover |

### Borders

| Token | Value | Use |
|---|---|---|
| `--border-subtle` | `rgba(255, 255, 255, 0.05)` | Card separators |
| `--border-default` | `rgba(255, 255, 255, 0.10)` | Panel borders |
| `--border-elevated` | `rgba(255, 255, 255, 0.12)` | Window/popover borders |
| `--border-accent` | `rgba(103, 232, 249, 0.35)` | Active/selected state |

### Accent Colors

| Name | Value | Use |
|---|---|---|
| Cyan 300 | `#67e8f9` | Primary accent, active states |
| Cyan 400 | `#22d3ee` | Buttons, active indicators |
| Sky 400 | `#38bdf8` | Gradients, secondary accent |
| Sky 500 | `#0ea5e9` | Gradient endpoint |

### Semantic Colors

| State | Color | Glow |
|---|---|---|
| Active / Healthy | Emerald 400 `#34d399` | `rgba(52, 211, 153, 0.8)` |
| Needs You / Warning | Amber 300 `#fcd34d` | `rgba(252, 211, 77, 0.8)` |
| Blocked / Danger | Rose 400 `#fb7185` | `rgba(244, 63, 94, 0.8)` |
| Working | Emerald 400 `#34d399` | `rgba(52, 211, 153, 0.9)` |
| Waiting | Amber 300 `#fcd34d` | `rgba(252, 211, 77, 0.9)` |
| Offline | Slate 600 `#475569` | none |

### Agent Tints

| Agent | Text Color | Glow |
|---|---|---|
| Sophia / Orchestrator | `text-cyan-300` | `rgba(56, 189, 248, 0.4)` |
| Research | `text-violet-300` | `rgba(168, 85, 247, 0.4)` |
| Operations | `text-amber-300` | `rgba(251, 146, 60, 0.4)` |
| Finance | `text-emerald-300` | `rgba(52, 211, 153, 0.4)` |
| Comms | `text-rose-300` | `rgba(244, 63, 94, 0.4)` |

---

## 3. Typography

### Font Stack

```css
font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
```

No custom fonts loaded — uses the system's native sans-serif for speed and OS integration.

### Scale

| Use | Size | Weight | Tracking | Class notes |
|---|---|---|---|---|
| Page title / greeting | 30-40px | 300 (light) | tight | `text-3xl sm:text-4xl font-light` |
| Section label | 10-11px | 600-700 | `0.18-0.28em` | Uppercase, `tracking-[0.22em]` |
| Body / card content | 12-13px | 400-600 | normal | `text-[12px]` or `text-[13px]` |
| Hint / metadata | 10-11px | 400-500 | `0.12-0.16em` | `text-[10.5px] text-slate-500` |
| Badge / tag | 8.5-10px | 600-800 | `0.12-0.2em` | Uppercase, monospace for numbers |
| Clock / data | 11-13px | 700 | tight | `.tnum` (tabular-nums) |
| Boot clock | 92px | 200 | -0.02em | Extralight display |

### Rules

- Numbers always use `font-variant-numeric: tabular-nums` (`.tnum` class)
- Uppercase labels always have letter-spacing >= `0.12em`
- No decorative or script fonts
- `-webkit-font-smoothing: antialiased` globally

---

## 4. Spacing and Layout

### Viewport

Full-screen fixed layout. `height: 100vh; width: 100vw; overflow: hidden`. No scrolling on the root.

### Z-Layer Map

| Z | Content |
|---|---|
| 1 | Wallpaper depth layers |
| 10 | Desktop icons, interaction hints |
| 20 | Main window, panels |
| 30 | Mode switcher |
| 40 | Drawer, agent dock |
| 50 | Menu bar |
| 60 | Toast notifications |
| 70 | Modal |
| 80 | Spotlight command palette |
| 100 | Boot/lock screen |

---

## 5. Surfaces

### Obsidian Glass Panel

```
background: rgba(4, 10, 20, 0.70)
border: 1px solid rgba(255, 255, 255, 0.12)
border-radius: 16px
backdrop-filter: blur(24px)
box-shadow: 0 0 60px -15px rgba(56, 189, 248, 0.45)
```

### Popover Glass

```
background: rgba(8, 16, 30, 0.95)
border-radius: 16px
backdrop-filter: blur(48px)
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 24px 60px rgba(0, 0, 0, 0.8)
```

### Modal Glass

```
background: rgba(7, 14, 28, 0.95)
border-radius: 24px
backdrop-filter: blur(48px)
box-shadow: 0 0 50px -10px [agent-glow], inset 0 1px 0 rgba(255, 255, 255, 0.15)
```

### Card

```
background: rgba(255, 255, 255, 0.02)
border: 1px solid rgba(255, 255, 255, 0.06-0.10)
border-radius: 12px
```

---

## 6. Components

### Toggle, Slider, Section, Status Dot, Badge, Toast, Traffic Lights

See V2 prototype source for exact implementation. All follow the token system above.

### V2 Components (from Design2)

- **Progress Bar**: `h-1 rounded-full bg-white/10` track, gradient fill `from-cyan-400 to-emerald-400`, `transition-all duration-500`
- **Filter Tabs**: `rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wider` with active: `bg-cyan-400/20 text-cyan-100 border-cyan-400/30`
- **Stage Indicators**: 5 horizontal bars `h-1 flex-1 rounded-full`, filled `bg-cyan-300/80`, empty `bg-white/10`
- **Agent Avatar**: `h-16 w-16 rounded-2xl` icon with agent glow shadow, status dot overlay

---

## 7. Animations

### Semantic Motion

Every graph animation, particle flow, glow, node transition, and contextual
card must represent a real state, relationship, event, or interaction.
Decorative or random operational motion is prohibited.

| Name | Duration | Easing | Use |
|---|---|---|---|
| `os-in` | - | `cubic-bezier(.16,1,.3,1)` | Panel entry |
| `toast-in` | 320ms | `cubic-bezier(.16,1,.3,1)` | Toast slide-in |
| `mac-zoom-in` | 260ms | `cubic-bezier(.16,1,.3,1)` | Modal open |
| `os-fade` | 180ms | `ease` | Backdrop fade |
| `spot-in` | 220ms | `cubic-bezier(.16,1,.3,1)` | Spotlight entry |
| `os-win-in` | 320ms | `cubic-bezier(.16,1,.3,1)` | Window open |

Standard easing: `cubic-bezier(.16, 1, .3, 1)` (spring). Hover: `transition duration-200`. Press: `active:scale-95`.

---

## 8. Interaction Rules

### Keyboard Shortcuts

| Key | Context | Action |
|---|---|---|
| `/` | Neural scene | Focus ask bar |
| `B` | Neural scene | Spoken briefing |
| Cmd/Ctrl+K | Desktop | Toggle Spotlight |
| `F` | Desktop | Toggle focus mode |
| `T` | Desktop | Toggle work drawer |
| `Escape` | Global | Close any open panel/modal/drawer |

### Progressive Disclosure (V2.1 Doctrine: Calm → Notice → Understand → Act → Inspect)

1. **Calm (Default State)**:
   - Neural scene is unoccluded and serene. Secondary telemetry (technical state badges, session clocks, keyboard legends) is removed from persistent view.
   - Flow canvas opens with maximum vertical and horizontal breathing space. Work docks and telemetry rails default to collapsed edge triggers.
2. **Notice**:
   - Status surfaces highlight only consequential changes requiring human direction.
   - Amber pulse badges and concise indicators (`[ ⚖️ 2 Decisions waiting ]`) signal when executive action is needed.
3. **Understand**:
   - Contextual panels (Sophia Briefing, Bell popover, Inspector HUD) provide clear context without jargon or redundant percentages.
4. **Act**:
   - Direct inline action affordances (Approve, Defer, Decline, Advance stage, Assign owner) allow the founder to resolve items in place.
5. **Inspect**:
   - Deep-dive modalities (Role cards / Persona modals, operating graph zoom, detailed logs) remain readily accessible on demand without crowding the daily operating canvas.

### Spatial Hierarchy & Zero-Collision Layout Invariants

To guarantee that no toggle, drawer, or button ever occludes, overlaps behind, or blocks another interactive control:

1. **Edge Toggle Clearance**:
   - **`TodoDrawer` Handle**: Anchored at `top: 36%` with dynamic translation `right: open ? min(290px, 85vw) : 0px`. It moves smoothly with the drawer so it never covers drawer internal elements and leaves `top: 50%` completely clear for `FlowDesktop` canvas rail collapse/expand chevrons.
2. **Dock vs Canvas Independence**:
   - **`AgentQuickDock`**: Anchored at `bottom: 10px` (`left: 50% -translate-x-1/2`). Redundant canvas-level bottom buttons have been eliminated from `FlowDesktop` so the dock has exclusive center-bottom clearance, routing all work triggers directly to `TodoDrawer` via the header Work trigger and `T` hotkey.
3. **Vertical Viewport Safeguards**:
   - **`SophiaPanel` Briefing**: Clamped to `max-h-[calc(100vh-13.5rem)]` with responsive margin (`right-3 top-16 sm:right-6 sm:top-20`), ensuring full clearance above the bottom ask bar on both desktop and mobile viewports.
4. **Mobile & Viewport Backdrops**:
   - Drawers and popovers feature responsive backdrop dimmers for effortless, one-touch outside dismissal on smaller viewports.
5. **Unified Mode Switcher (Zero-Flicker Invariant)**:
   - Positioned persistently at `fixed left-1/2 top-1.5 z-[60] -translate-x-1/2` across both Sophia and SamJuniorsOS modes.
   - Eliminates layout shifting and flickering: the segmented pill remains anchored at the exact same physical coordinates with identical glass styling, smooth spring transitions, and unified sound feedback.
6. **Agent Messages & Handy Chat Panel (`ChatPanel.tsx`)**:
   - **Floating Launcher**: Circular glass icon at `fixed bottom-5 right-5 z-40` with pulsing unread message badge count.
   - **Handy Chat Box**: Compact glass panel at `bottom-20 right-5 z-50` (`w-[360px] h-[510px]`) featuring:
     - **Contact Picker**: Instant switching between Sophia, Operations, Research, Finance, and Comms.
     - **Thread History**: Preloaded and live conversation history with role-appropriate agent avatars, timestamps, and typing feedback.
     - **Quick Suggestions**: Clickable prompt chips for immediate founder queries.
     - **Hotkeys**: Toggle via `C` / `c` or `Escape` to close.

---

## 9. Neural Mode (V2.1)

Sophia/Core is the dominant, serene operating presence.
- **Visual Center**: Full-screen particle canvas knot responding to voice, ambient phrasing, and conversational directives.
- **Greeting & Ambient Line**: Honest, concise executive summary ("All quiet. Nothing needs you right now" or "2 decisions are waiting for your direction").
- **Briefing**: Unobtrusive floating trigger pill that alerts when decisions or attention items exist; expands on click to reveal immediate action items.
- **Ask Bar**: Clean conversational input with microphone voice toggle and shortcut focus (`/`), free of repetitive static tag clutter.

## 10. Desktop Mode (V2.1)

Information-rich multi-window operating environment with contextual surfaces:
- **Operating Graph**: Full-viewport canvas with fluid pan/zoom, interactive nodes, and collapsible attention/decision rails.
- **Top Menu Bar**: Glass chrome with instant Spotlight search (⌘K), workspace switcher, Bell notification tray, and calendar/device stats.
- **Work Drawer (`TodoDrawer`)**: Actionable workstream checklist with clean filter pills (`open`, `blocked`, `done`) and stage progress visualization.
- **Workforce Dock (`AgentQuickDock`)**: Compact bottom dock with agent-tinted glow avatars and live attending tooltips, routing directly to rich Persona modals.

## 11. Content Hierarchy

1. **What needs you** (open decisions, blocked workstreams, high-priority attention items)
2. **Active work** (workstreams with stages, owners, and honest state)
3. **Company context** (weekly focus, identity, strategic direction)
4. **Workforce state** (agent readiness, assignments, escalation rules)
5. **System & preferences** (voice, interface sounds, wallpaper display)

### Operational Honesty

- Every count derives strictly from `osStore` state
- No fabricated percentages or demo vanity metrics
- No simulated agent chatter
- Empty states show honest messages ("All quiet. Nothing needs you.")

---

## 12. Scalable Content-to-Surface Architecture (V2.1)

To ensure SamJuniorsOS scales gracefully as new initiatives, agents, external integrations (GitHub, Stripe, Cloud APIs), and operational telemetry are added without dashboard clutter or layout shifts, V2.1 enforces strict **separation of UI presentation surfaces from domain content definitions**.

### Canonical Domain Schemas (`src/lib/surfaceSchema.ts`)

Domain entities are decoupled from raw JSX markup via typed contracts:
- `EntityItem`: Agents, tools, human stakeholders.
- `AttentionData`: Triage alerts, reviews, notices, and messages.
- `WorkData`: Tasks, workstreams, initiatives, and deliverables.
- `DecisionData`: Governance choices requiring founder approval.
- `ActivityEvent`: Immutable audit log entries.
- `MetricItem`: Operational KPIs, financial floors, and workforce ratios.
- `TimelineMilestone`: Company phases, releases, and roadmap milestones.
- `RelationshipLink`: Directed dependencies, delegations, and escalations.

### The 10 Standardized Reusable Surfaces (`src/components/surfaces/StandardSurfaces.tsx`)

| Surface | Purpose | Progressive Disclosure Levels | Container Usage |
|---|---|---|---|
| **1. EntitySurface** | Shows an agent, tool, or person | Level 1: Compact avatar & status dot<br>Level 2: Badges & current status<br>Level 3: Collapsible remit & scope | `AgentQuickDock`, `PersonaModal`, `FlowDesktop` workforce |
| **2. AttentionSurface** | Notice, alert, and review triage | Level 1: Left tone bar & title<br>Level 2: Detail narrative & source<br>Level 3: Inline mark-handled action | `SophiaPanel`, Bell popover, `FlowDesktop` left rail |
| **3. WorkSurface** | Workstreams and deliverables | Level 1: Title & owner badge<br>Level 2: 5-stage progression track (`discovery`→`done`)<br>Level 3: Pause, Resume, Advance stage actions | `TodoDrawer`, `SophiaPanel` in-progress |
| **4. DecisionSurface** | Executive human-in-the-loop decisions | Level 1: Title & author tag<br>Level 2: Context explanation<br>Level 3: Actionable choice buttons / resolved state | `SophiaPanel`, `FlowDesktop` right rail |
| **5. ActivitySurface** | Audit log & runtime events | Level 1: Timestamp & actor badge<br>Level 2: Full event description | Bell popover recent list, Inspector log tab |
| **6. MetricSurface** | Operational and financial KPIs | Level 1: Label & tabular value (`.tnum`)<br>Level 2: Status pill<br>Level 3: Epistemic confidence (`verified` / `inferred`) & source | `FlowDesktop` left rail, Company context |
| **7. TimelineSurface** | Roadmap & company milestones | Level 1: Vertical sequence nodes (`complete`, `current`, `upcoming`)<br>Level 2: Phase subtitle & completion dates | `FlowDesktop` left rail, Company overview |
| **8. RelationshipSurface** | Directed links between entities | Level 1: `[From] --(delegates / depends-on / escalates)--> [To]` tags | `PersonaModal`, `FlowDesktop` canvas inspector |
| **9. ListSurface** | Universal collection container | Level 1: Total count badge & header action<br>Level 2: Live text search filter<br>Level 3: Stage filter pills (`open`, `blocked`, `done`)<br>Level 4: Integrated Loading, Empty, and Error states | `TodoDrawer`, Chat contact lists |
| **10. InspectorSurface** | Deep contextual inspection sheet | Level 1: Header with status pill and close trigger<br>Level 2: Tabbed navigation (`Overview`, `Activity`, `Relationships`)<br>Level 3: Full scrollable detail body | Modal overlay, canvas inspector HUD |

### Standardized System States

1. **LoadingState**:
   - Obsidian glass skeleton card with cyan pulse ping and spinning indicator.
   - Text message: "Synchronizing neural telemetry...".
2. **EmptyState**:
   - Clean obsidian container with delicate icon, uppercase title, description, and optional CTA button.
   - Context-aware messages (e.g. "Nothing is blocked. All active workstreams are flowing smoothly.").
3. **ErrorState**:
   - Rose-tinted translucent warning card with disruption alert and "Retry Sync" affordance.

### Scalable Content-to-Surface Rules

1. **Never add new permanent panels**: The core layout footprint (Neural Core knot, canvas viewport, top bar, floating chat launcher) is fixed and inviolable.
2. **Reuse existing surfaces for new data**: Any incoming data (such as a GitHub Pull Request, a Stripe invoice, an external server alert) MUST map to one of the 10 standard surfaces:
   - A GitHub PR maps to `WorkSurface` (stage = `review`).
   - A Stripe webhook alert maps to `AttentionSurface` (kind = `review` or `blocked`).
   - An API health metric maps to `MetricSurface` (confidence = `verified`).
3. **Progressive Disclosure Boundary**:
   - Quick glance: Glance pills (`SophiaPanel` collapsed trigger, top bar status dot, dock badges).
   - Execution: Side drawers (`TodoDrawer`) and side cards (`SideCard`).
   - Deep inspection: Modals (`PersonaModal`, `InspectorSurface`).
4. **Zero Layout Shift**: All surfaces adhere to fixed aspect ratios, tabular numbers (`font-mono`, `.tnum`), and fluid max-height limits with custom thin scrollbars.
5. **Single Authoritative Interface**: The V2 Design1 shell is the exclusive operational UI of SamJuniorsOS on the root dev server (`http://localhost:3000/`). Competing interfaces, classic multi-window fallbacks, or legacy prototype toggles are prohibited in active application routes. Legacy UI code remains strictly as an inactive archive/reference asset.
6. **Semantic Motion**: Every graph animation, particle flow, glow, node transition, and contextual card must represent a real state, relationship, event, or interaction. Decorative/random operational motion is prohibited.

---

## 13. Semantic Motion & Living Graph Specification

The living operating graph visually communicates the dynamic state of SamJuniorsOS using physical, state-bound visual metaphors:

1. **Orthogonal Conduit Routing**: Connectors use clean, rounded right-angle paths that trace authentic organizational relationships (`delegates`, `researches`, `depends-on`, `checks`, `escalates-to`, `feeds`).
2. **State-Driven Particle Kinetics**:
   - **Active Pulse**: High-velocity laser comet with spark emitter physics traveling along an active relationship vector.
   - **Arrival Burst**: Radial energy dissipation and perimeter illumination when an event or data packet arrives at a target node.
   - **Quiet Completion**: Completed paths dim down to subdued, calm steady conduits.
   - **Attention & Blocked Pulse**: Paths awaiting founder decision or invariant check pulse with warm amber (`#f59e0b`) or alert rose (`#fb7185`).
   - **Ambient Breathing**: Subtle, slow particle drift when idle to maintain liveliness without visual clutter.
3. **Spatial Contextual Cards**:
   - Ephemeral spatial cards appear adjacent to active or relevant nodes to disclose immediate operational intent (e.g. `Sophia: Delegating research ➜ Dr. Thorne`).
   - Cards smoothly animate into view on relevant events and collapse/fade out when the event completes.
4. **Zero Random Decoration**: No particle or animation fires without an authentic causal event in the operating state.

---

## 14. Workflow Design System (Phase 4.1 Specification)

The workflow component system (`components/workflow/`) provides presentation-only, portable visual primitives for node-based graphs, inspired by high-end dark ambient modular flow interfaces (such as FLOWGRID).

### Core Principles & Architectural Boundary
- **Presentation-Only & Portable**: Primitives rely strictly on React, CSS/SVG, and local tokens. They have zero dependencies on Next.js server APIs, Prisma, authentication, or graph execution state, ensuring drop-in portability to the standalone `Uploaded/Design1` Vite environment.
- **Semantic Mapping**: Workflow tokens map directly to the established SamJuniorsOS semantic color hierarchy (`cyan` primary, `amber` attention/processing, `emerald` healthy/complete, `rose` error/blocked, `obsidian glass` surfaces).
- **Physical Depth & Optical Balance**: Nodes feature multi-layered obsidian glass backdrops (`rgba(6, 12, 24, 0.88)`), specular hairline top borders (`linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)`), and subtle ambient drop shadows.
### Node Geometries & Form Factors
| Geometry | Default Size (W x H) | Border Radius | Typical Node Type |
|---|---|---|---|
| `square` | 84 x 84 px | 14px | Micro agent / utility / compact action |
| `rectangle` | 240 x 96 px | 16px | Standard workflow step / agent executor |
| `circle` | 84 x 84 px | 50% | Router / trigger / endpoint / gateway |
| `squircle` | 100 x 100 px | 24px | Core specialist / LLM model node |
| `pill` | 180 x 52 px | 9999px | Condition gate / lightweight trigger |

### Node Port Architecture
Connection ports (`NodePort.tsx`) are independent physical terminals placed at compass positions (`top`, `bottom`, `left`, `right`):
- **Shapes**: `circle` (8px default) or `square` (8px default).
- **States**: `default` (slate-600 outline), `hover` (cyan outline + glow), `active` (filled cyan), `connected` (filled cyan dot), `success` (emerald), `error` (rose).
- **Hit Area**: Includes invisible 24px expanded click/hover boundary for micro-precision targeting.

### Reusable Content Styles
- `IconOnlyContent`: Focused single-glyph presentation with optional status pip.
- `IconLabelContent`: Icon paired with a bold primary label.
- `IconTitleContent`: Icon, title, and auxiliary badge.
- `IconMetaContent`: Full structured card with title, role/type subtitle, and status pill.
- `AgentContent`: Dedicated specialist representation with avatar container, role tag, and capability badges.
- `ModelContent`: LLM provider/model block (e.g. Gemini 2.5 Pro, Claude 3.5 Sonnet) with temperature/context tokens.

### Connectors & Vector Kinetics
- SVG path-based connectors (`Connector.tsx`): `straight`, `curved` (smooth cubic Bezier S-curve), `dashed`, `branch`, and `animated`.
- Kinetic laser packet flow with speed, color, and dash-offset synchronization matching active operational causality.

### Node States & Kinetic Feedback
Nodes transition across 8 discrete visual states:
- `default`: Quiet, low-contrast obsidian glass with subdued hairline rim.
- `hover`: Elevated luminance, enhanced specular highlight, subtle lift.
- `selected`: High-visibility cyan boundary (`#00B2FF`) with crisp outline.
- `active`: Vibrant cyan pulse with animated perimeter luminescence.
- `processing`: Kinetic amber energy field (`#FF8A00`) with particle agitation.
- `success`: Emerald halo (`#22D97A`) indicating completed execution.
- `error`: Alert rose warning perimeter (`#FF4B4B`) signaling blocked or failed step.
- `disabled`: Muted opacity and grayscale attenuation for locked or inactive nodes.

### Effects & Performance Budget
Supports 3 explicit performance tiers (`full`, `balanced`, `minimal`) plus automatic `prefers-reduced-motion` compliance to safeguard 60 FPS rendering:
- `full`: Complete 12px backdrop-filter blur, dynamic glow particle emitters, active SVG conduit animations.
- `balanced`: Reduced 6px backdrop-filter blur, halved particle counts, streamlined SVG animations.
- `minimal`: Disables heavy GPU filters (`backdropFilter: 'none'`), disables floating particles, retains lightweight CSS opacity/color transitions.

### Specimen Sheet
- Certified at `/design-system/workflow` (`app/design-system/workflow/page.tsx`).
- Features 13 comprehensive sections: Canvas & Background, Node Geometries, Node Anatomy, Content Styles, Icon Containers, Node States, Connection Ports, Connectors & Flows, Effects Library, Color Tokens, Typography, Real Compositions (generic illustrative fixtures), and Responsive Sizes.
- Includes a live interactive Effects Budget switch (`full` / `balanced` / `minimal`) and state inspection triggers.
- Container provides dedicated viewport scrolling (`fixed inset-0 overflow-y-auto select-text`), decoupled from the root OS desktop shell.
