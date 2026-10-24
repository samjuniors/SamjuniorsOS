# ADR 0007: Stack Migration to Vite + React + Express + TypeScript

- **STATUS:** ACCEPTED (Ratified by Founder Directive `STACK-VITE-EXPRESS` on 2026-10-23)
- **DECISION:** Migrate SamJuniorsOS from Next.js (App Router / `.next`) to a Full-Stack Vite + React frontend and an Express + WebSocket + TypeScript backend.
- **SCOPE:** Milestone MX (Steps MX.1 through MX.7)
- **AUTHORITY:** Binding per `.agent/product-kit/MASTER_PROMPT.md` and `AGENTS.md`.

---

## 1. Context and Problem Statement

SamJuniorsOS was initially bootstrapped on Next.js 15+ (App Router). While Next.js served for early prototyping, its architectural model presents severe friction for an AI-native company operating system:
1. **Streaming Audio & Bidirectional WebSockets:** Sofia's primary sensory and interaction channel requires real-time, low-latency, full-duplex binary audio streaming (PCM at 16kHz) with instantaneous client interruption (barge-in). Next.js's request-response serverless model does not support long-lived bidirectional WebSocket connections on its standard route handlers, requiring ad-hoc parallel processes (`scripts/live-gateway.ts`) and complicated port coordination.
2. **Dual-Environment (Cloud + Desktop) Target:** Per the founder's directive ("Yes pc off or on as we are handling on cloud as well as desktop both"), the same server architecture must run continuously in the cloud (VPS) and locally inside a Windows desktop application (`.exe`). Next.js standalone builds are heavy, complex, and unsuited for embedded execution inside an Electron child process.
3. **Build & Startup Latency:** Next.js development compilation (`next dev`) and webpack/turbopack builds create significant overhead. Vite provides near-instantaneous HMR, clean ESM bundling, and straightforward integration with modern desktop runtimes.

On 2026-10-23, the founder issued the binding decision:
> *"convert the project Next.js (.next) into a Full-Stack Vite + React + Express + TypeScript architecture"*

---

## 2. Next.js-Only Feature Inventory and Replacements

A comprehensive repository search was performed across all source directories (`src/`, `scripts/`, `tests/`, `public/`). Below is the complete census of every Next.js-only feature in the codebase and its deterministic replacement:

### 2.1 Route Handlers (`src/app/api/**/route.ts`)
- **Inventory (68 Route Handlers):**
  - Core Health & Auth: `/api/health`, `/api/auth/founder-session`, `/api/auth/ws-ticket`
  - Epistemic & State: `/api/activity`, `/api/advisor`, `/api/agent-chat`, `/api/agent-collab`, `/api/agents`, `/api/agents/runs`, `/api/browser/read`, `/api/epistemic`, `/api/graph`, `/api/integrations/status`, `/api/orchestrate`, `/api/tokens`
  - Communications: `/api/communication/contacts`, `/api/communication/conversations`, `/api/communication/drafts`, `/api/communication/intents`, `/api/communication/messages`, `/api/communication/webhooks/resend`, `/api/conversation`, `/api/conversation/message`
  - Sofia / Sophia Core: `/api/realtime/turn`, `/api/sofia/ask`, `/api/sofia/decision-log`, `/api/sofia/file`, `/api/sofia/greeting`, `/api/sofia/img`, `/api/sofia/media`, `/api/sofia/memory`, `/api/sofia/page`, `/api/sofia/resume`, `/api/sofia/spend`, `/api/sofia/stop`, `/api/sofia/stt`, `/api/sofia/tts`, `/api/sofia/voice/latency`, `/api/sofia/why`, `/api/sophia/browse`, `/api/sophia/chat`, `/api/sophia/decision-log`, `/api/sophia/dg/session`, `/api/sophia/dg/speak`, `/api/sophia/elevenlabs/speak`, `/api/sophia/elevenlabs/voices`, `/api/sophia/gemini/speak`, `/api/sophia/greeting`, `/api/sophia/image/generate`, `/api/sophia/live/reset`, `/api/sophia/live/session`, `/api/sophia/mouth/speak`, `/api/sophia/resume`, `/api/sophia/speak`, `/api/sophia/status`, `/api/sophia/stop`, `/api/sophia/system/action`, `/api/sophia/test-voice`, `/api/sophia/tools/web-search`, `/api/sophia/why`
  - Speech & Voice: `/api/tts/elevenlabs`, `/api/tts/voices`
  - Workflow Governance: `/api/workflow/approvals`, `/api/workflow/authorizations/audit`, `/api/workflow/authorizations/evaluate`, `/api/workflow/definitions`, `/api/workflow/instances`, `/api/workflow/scheduling`, `/api/workflow/scheduling/actions`, `/api/workflow/scheduling/status`
- **Replacement:**
  An Express API router (`src/server/api.ts`) mounted on `/api` under `server.ts`. A Web Standards HTTP adapter (`src/server/adapter.ts` and `src/lib/server/http.ts`) converts Express `(req, res)` into standard `Request` and resolves returned `Response` / `NextResponse` instances. This allows existing business logic in route handlers to run cleanly without breaking type contracts or rewriting handler internals.

### 2.2 Server Components, Layouts, and Pages
- **Inventory:**
  - `src/app/layout.tsx`: Root HTML wrapper, metadata, global font classes, theme script.
  - `src/app/page.tsx`: Root page entry mounting `App`.
  - Directives: `"use client"` across multiple components in `src/os/` and `src/sofia/`.
  - `"use server"`: None present in active code.
- **Replacement:**
  - Single-Page Application (SPA) structure: `index.html` at the project root with `<div id="root"></div>`.
  - Client entry: `src/main.tsx` calling `ReactDOM.createRoot`.
  - CSS & Tokens: `src/index.css` importing Tailwind and the design tokens.
  - Components: Pure React components in Vite. The `"use client"` string directive is ignored by Vite and can remain or be cleaned up without functional effect.

### 2.3 Edge Middleware (`src/proxy.ts`)
- **Inventory:**
  - `src/proxy.ts`: Next.js middleware handling rate limiting, payload byte limits (2MB standard, 10MB upload), security headers (CSP, HSTS, X-Frame-Options), and constant-time founder credential verification.
- **Replacement:**
  - Express middleware stack in `src/server/middleware.ts`:
    - `securityHeadersMiddleware`: Enforces the identical strict CSP, HSTS, and framing headers.
    - `rateLimitMiddleware`: Connects to `globalRateLimiter` (`src/lib/server/security/rate-limiter.ts`).
    - `payloadSizeMiddleware`: Configures `express.json({ limit: '2mb' })` and `express.raw({ limit: '10mb' })`.
    - `founderAuthMiddleware`: Constant-time string equality check matching `src/proxy.ts` fail-closed rules.

### 2.4 Navigation and Link Components (`next/link`, `next/navigation`, `next/router`)
- **Inventory:**
  - `next/link`: 0 active imports.
  - `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`): 0 active imports.
  - `next/router`: 0 active imports.
- **Replacement:**
  - Application surfaces are managed as stateful views/tabs (`src/os/App.tsx`, `src/sofia/App.tsx`). Standard HTML `<a>` tags and lightweight browser History API / React state provide all required navigation.

### 2.5 Images and Media (`next/image`)
- **Inventory:**
  - `next/image`: 0 active imports in application code (only present in proxy route matcher regex).
- **Replacement:**
  - Standard HTML `<img>` elements with CSS `object-fit`, WebP assets, and explicit dimension attributes.

### 2.6 Typography (`next/font`)
- **Inventory:**
  - `next/font`: 0 active imports.
- **Replacement:**
  - System font stack and Google Web Fonts linked via `index.html` and configured in Tailwind.

### 2.7 Environment Variable Handling (`@next/env`, `NEXT_PUBLIC_*`)
- **Inventory:**
  - Server: `@next/env` was loaded in `scripts/dev.mjs`.
  - Client: Components reference `process.env.NEXT_PUBLIC_*` (e.g. `NEXT_PUBLIC_VOICE_GATEWAY`).
- **Replacement:**
  - Server: `dotenv` in `server.ts` loading `.env.local` followed by `.env`.
  - Client: Vite natively supports `import.meta.env.VITE_*`. During the migration bridge, `vite.config.ts` defines `process.env` substitutions for backward-compatibility so existing client code continues operating seamlessly.

### 2.8 Request-Time Database Connections & Long-Running Services
- **Inventory:**
  - Prisma client instances and memory store locks in `src/lib/server/persistence/prisma.ts`.
- **Replacement:**
  - Next.js serverless route invocations risk connection churn. In Express, the database connection is initialized once at server startup as a persistent singleton, with WAL mode enabled on SQLite, eliminating connection churn and cold-start reconnect latency.

---

## 3. Real-Time Transport: WebSocket vs. Server-Sent Events (SSE)

### Analysis
| Dimension | Server-Sent Events (SSE) | WebSockets (`ws`) |
|---|---|---|
| **Directionality** | Half-duplex (Server $\rightarrow$ Client only) | Full-duplex (Bidirectional) |
| **Upstream Audio Capture** | Requires continuous HTTP POST requests for PCM chunks | Single persistent connection; continuous binary streaming |
| **Barge-In / Interruption** | Needs separate HTTP POST, creating latency and race conditions | Immediate in-band `INTERRUPT` frame on the active stream |
| **Protocol Overhead** | HTTP headers repeated on every client audio frame | Minimal 2-to-6 byte framing per binary chunk |
| **Gateway Parity** | Diverges from existing `LiveInteractionServer` | Native protocol for `LiveInteractionServer` (`src/lib/server/live/server.ts`) |

### Decision
**WebSocket (`ws`) is selected as the authoritative real-time transport.**
- Path: `/api/live-ws`
- Handshake: Ticket-authenticated via `/api/auth/ws-ticket`
- Protocol: Binary frames for 16kHz PCM audio; JSON control frames (`START_PTT`, `STOP_PTT`, `INTERRUPT`, `TRANSCRIPT_*`, `SOPHIA_RESPONSE`).

---

## 4. Electron Desktop Integration Strategy

The desktop runtime expands SamJuniorsOS into a local executive cockpit without creating a parallel company brain.

### Architecture
```
+-------------------------------------------------------------+
|                 Electron Main Process                        |
|   (app lifecycle, single instance lock, window creation)    |
+-------------------------------------------------------------+
         |                                           |
         | spawns via utilityProcess                 | loads in BrowserWindow
         v                                           v
+-----------------------------+             +-----------------+
|   Express + WS Server       |             |  Vite Renderer  |
|  (runs server.ts compiled)  | <---------  |  (dist/ UI)     |
|  - SQLite persistence       | HTTP / WS   | - contextIsol:  |
|  - Company Brain & Sophia   |             |   true          |
|  - Local port 127.0.0.1     |             | - nodeInteg:    |
+-----------------------------+             |   false         |
                                            +-----------------+
```

### Invariants (Binding for MX.7)
1. **Isolated Processes:** The Express server runs in an isolated child or `utilityProcess`, decoupled from Electron main thread event loops.
2. **Security Hardening:**
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - Zero Node.js primitives exposed to the DOM.
   - IPC communication strictly mediated via typed `contextBridge` in `preload.ts`.
3. **Identical Server Code:** The exact same Express backend (`server.ts`) executes both in cloud production and local desktop.
4. **Verification Status:** **NOT VERIFIED** until verified by running implementation in milestone MX.7.

---

## 5. Review of Infrastructure Decision G0.3

Decision G0.3 was ratified by the founder on 2026-10-22:
> *"Option A: Single VPS with persistent volume & SQLite; Daily automated backups with 30-day retention (RPO < 24h, RTO < 2h)"*

### Re-evaluation against Long-Running Express + WebSockets:
- **Hosting Model Compatibility:** Option A (Single VPS) is an **ideal match** for an Express + WebSocket service. Unlike serverless platforms (which impose 15-minute connection limits and require external pub/sub for WebSocket state), a persistent VPS hosts long-running Node.js processes and persistent WebSocket connections natively.
- **Resource Footprint:** Node.js + Express + SQLite consumes $< 150\text{ MB}$ RSS under normal loads, fitting comfortably on a budget VPS ($5–$20/mo).
- **Reverse Proxy:** Production uses Caddy or Nginx for TLS termination (`wss://`) and connection upgrading.
- **RPO / RTO Targets:** Daily SQLite `.backup` / Litestream streaming to S3/Cloud Storage guarantees RPO $< 24\text{h}$ and RTO $< 2\text{h}$.
- **Verdict:** **No change required to G0.3.** Option A is affirmed and strengthened by the Express + Vite migration.

---

## 6. Target Folder Layout

```
SamjuniorsOS/
├── dist/                          # Production Vite frontend build output
├── public/                        # Static public assets (icons, sounds)
├── server.ts                      # Unified Express + WebSocket server entry point
├── vite.config.ts                 # Vite bundler configuration
├── index.html                     # SPA entry HTML
├── src/
│   ├── main.tsx                   # React client bootstrap
│   ├── index.css                  # Global styling, tokens, and Tailwind directives
│   ├── server/                    # Backend server infrastructure
│   │   ├── api.ts                 # Express router mapping /api/* endpoints
│   │   ├── middleware.ts          # Auth, security headers, rate limiting
│   │   └── adapter.ts             # Web standards Next-compatible request adapter
│   ├── os/                        # OS spatial desktop, canvas, cockpits
│   ├── sofia/                     # Sofia companion screen, HUD, controls
│   ├── core/                      # Client audio & voice engines (VAD, AudioWorklet)
│   ├── lib/
│   │   ├── server/                # Authoritative server business logic
│   │   │   ├── brain/             # Company Brain & State Store
│   │   │   ├── live/              # LiveInteractionServer & STT/TTS gateways
│   │   │   ├── security/          # Rate limiters & crypto hashing
│   │   │   └── persistence/       # Prisma & SQLite client
│   │   └── client/                # Client utilities
│   └── types/                     # Shared TypeScript schemas and DTOs
├── doc/
│   └── adr/                       # Architectural Decision Records
└── tests/                         # Regression, platform, and contract test suites
```

---

## 7. Migration Order (Milestone MX Execution Roadmap)

1. **MX.1 (Current Step):** Architectural Decision Record (ADR 0007), Next.js feature census, and target blueprint.
2. **MX.2:** Baseline metrics before structural changes: rerunnable M1 smoke test, voice-loop latency measurement, and API route contract test suite.
3. **MX.3:** Express server stabilization: route adapter validation, security middleware, WebSocket server attachment, health route.
4. **MX.4:** Vite + React frontend cutover: clean SPA mount, Sofia screen & OS shell rendering without server components, styling parity.
5. **MX.5:** Live conversation integration: AudioWorklet microphone capture, streaming over `/api/live-ws`, latency comparison against MX.2 baseline.
6. **MX.6:** Clean cutover: removal of Next.js dependencies, removal of `next.config.ts` and `.next`, unified single-command `npm run dev` and `npm run build`, CI/workflow updates.
7. **MX.7:** Electron desktop proof: packaging the unified Vite build and Express server into an unsigned Windows desktop executable (`.exe`).

---

## 8. Verification and Quality Checks

- **Next-Only Feature Census:** Confirmed by exhaustive ripgrep scan of `src/`, `scripts/`, `tests/`. No server actions, `next/font`, or `next/navigation` remain unaddressed.
- **Security Invariants:** ADR confirms that `isExecutiveApiRoute` fail-closed authentication and SHA-256 payload binding are preserved unchanged in Express middleware.
- **Reversibility:** Staged migration allows testing API contracts (MX.2) and Express routes in parallel before final Next.js package removal (MX.6).
