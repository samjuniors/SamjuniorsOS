# /old — Inert Archive

**Status: ARCHIVED · INERT · NOT PART OF THE CANONICAL RUNTIME**

This directory is the explicitly inert historical archive of SamjuniorsOS.
Nothing in here is loaded, imported, built, served, or executed by the
canonical application.

## Rules (enforced)

1. **No runtime imports.** Canonical runtime code (`src/app`, `src/os`,
   `src/components`, `src/lib`, `src/types`) MUST NOT import anything from
   `/old`. This is verified by `scripts/verify-canonical-boundaries.js`.
2. **No feature development.** Files here are frozen history. Bugs are not
   fixed here; features are not added here.
3. **No resurrection by copy-paste of architecture.** If historical code
   contains useful behavior, the *behavior* is evaluated and re-adapted
   into the canonical source (`src/**`) — never the other way around.
   V1/V2/prototype architecture is not to be restored.
4. **Boundary guards (repository-level):**
   - `tsconfig.json` excludes `old` (no type-checking, no path resolution)
   - `eslint.config.mjs` ignores `old/**` (no linting)
   - `src/app/v2-globals.css` declares `@source not "../../old"` (Tailwind v4
     does not scan archived classes)

## Contents

### legacy-ui/ — Phase 2.x classic cockpit/desktop UI (superseded)

The pre-Design1 UI generation: `HQ` cockpit views, classic desktop-OS
chrome (dock, top bar, windows, notifications), classic apps, and their
client stores (governance / persona / collaboration / system-activity /
notification-center / employee-profiles). Superseded by the canonical
company-context canvas and the os shell in `src/os` (relocated from
`Uploaded/Design1/src` in Phase 4.3C-B.3).

- `components/hq` — HQ cockpit sections and views
- `components/os` — classic desktop chrome (Dock, TopMenuBar, OSWindow, …)
- `components/apps` — classic workspace apps
- `components/cockpit` — legacy cockpit surface
- `lib/*-store.ts` — legacy client-side stores (localStorage era)
- `app/globals.css` — the unused shadcn default stylesheet (layout uses
  `v2-globals.css`)
- `tailwind.config.ts` — dead TW3-era config (canonical styling is
  Tailwind v4 CSS-first)
- `server/decision-loop.ts` — dead orchestration module (zero importers;
  tangled a 'use client' store into server code)

### prototypes/ — historical design prototypes

- `Design2/` — V2 sibling Vite prototype (parallel design exploration)
- `interactive-3d-particle-lattice/` — 3D particle lattice experiment
- `samjuniors-os-web-interface/` — early web interface prototype
- `core-v4/`, `core-v5/` — Core V4/V5 static prototype archives
  (previously served from `public/prototype/`; integrity is still verified
  by `scripts/verify-prototype-v4.js` / `verify-prototype-v5.js`)

### media/ — reference material

- `whatsapp-screenshots/` — original product conversation screenshots
- `REF.mp4` — reference video
- `astra.html` — reference page

## Provenance

Consolidated in Phase 4.3C-B.2 (repository consolidation) from the
formerly cohabiting locations: `src/components/{hq,apps,os,cockpit}`,
`src/lib/*-store.ts`, `src/app/globals.css`, `tailwind.config.ts`,
`src/lib/server/orchestration/decision-loop.ts`, `Uploaded/{Design2,
interactive-3d-particle-lattice, samjuniors-os-web-interface}`,
`public/prototype/{v4,v5}`, and `Uploaded/{screenshots, REF.mp4,
astra.html}`. Git history preserves the original paths.
