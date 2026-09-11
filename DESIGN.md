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

### Progressive Disclosure

Default calm -> on-demand panels -> contextual alerts -> deep-dive modals.

---

## 9. Neural Mode

Sophia's ambient presence. Full-screen particle canvas with greeting, ask bar, briefing panel, state strip. Sophia states: idle, attentive, thinking, speaking.

## 10. Desktop Mode

Full OS chrome: menu bar, wallpapers, windows (max/win/min), spotlight, context menu, desktop icons, operating graph, agent dock, work drawer, toasts.

## 11. Content Hierarchy

1. What needs you (decisions, blocked, attention)
2. Active work (workstreams with stage/owner/state)
3. Company context (focus, principles, constraints)
4. Workforce state (agent readiness, assignments)
5. System/telemetry (session, voice, connection)

### Operational Honesty

- Every count derives from `osStore` state
- No fabricated metrics
- No simulated agent output
- Empty states show honest messages
