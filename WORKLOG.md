# WORKLOG.md — Canonical Operational History

Per AGENTS.md: this file is the canonical record of what was actually built,
verified, and decided. Chat history is not a source of truth; this file is what
a fresh agent must be able to rely on. Every entry is written against the
repository state it describes.

---

## Current Phase

**Phase 3 — Command Center** (began at `478b3e7`).
Phase 2 foundation/durability work is certified complete through Phase 2.6.1
(`305add8`): all Phase 2 regression suites green, real-PostgreSQL concurrency
certified, tsc clean, CI created. Do NOT redo Phase 2 unless repository
evidence shows a regression.

---

## Phase 3.7 — Core V4 Prototype (Founder Operating Experience)

**Status:** COMPLETE (Core V4 prototype implemented, browser-verified, isolated in `public/prototype/v4/`).
**Base HEAD:** `9cd8773`

### What was implemented

A PROTOTYPE/UI-DESIGN iteration only — zero production/backend/API/database/auth/workflow/deployment changes. Core V4 evolves the V3 visual language (cinematic obsidian, central glowing Core, canvas starfield/earth/particles/wave carried forward) from a "state-machine demo" into a founder operating experience organized around five visible layers:

1. **FOUNDER INTENT** — Core opens with "What do you need?"; command entry renders YOU ASKED / CORE UNDERSTANDS (interpreted intent + description) + context chips.
2. **ACTIVE WORK** — persistent work identity: WHAT (title), WHY, CURRENT STEP, EVIDENCE counts, NEXT, and a milestone checklist with operational progress only (no chain-of-thought); Pause / Steer / Stop controls.
3. **ATTENTION MODEL** — "WHAT MATTERS NOW" strip + contextual header (COMPANY · WORKING ON · ATTENTION · CLEAR): ATTENTION REQUIRED (n decisions) / WORK IN PROGRESS / WATCH (unresolved findings) / CLEAR, derived from the simulated state; "Show me what needs my attention." routes to the relevant surface.
4. **AUTHORITY BOUNDARY** — FOUNDER DECISION REQUIRED pane (Core has prepared / Reason / Evidence / Core recommendation) with APPROVE / REDIRECT / REJECT / INSPECT; explicit authority note that Core can analyze, prepare and recommend but is not authorized to perform consequential actions; honest consequence semantics — non-consequential work (Company Review, Priorities) completes without a gate, REJECT records "no action was taken".
5. **OUTCOME** — COMPLETED pane with outcome, evidence row and REVIEW RESULT / INSPECT EVIDENCE / VIEW PROVENANCE / CONTINUE WORK; provenance inspector scoped per thread (SOURCE → SIGNAL → CLAIM → FACT → DECISION → OUTCOME with honest statuses); learning explicitly NOT claimed as persisted.

V4 interaction model additions:

- **Persistent WORK IDENTITY**: work threads survive every Core state change; WORK THREADS dock (labeled SIMULATION) with Continue/Pause/Steer/Stop/Inspect; "Continue the positioning review." resumes matching threads; decisions persist in a Decisions sheet (approval boundary records) with full APPROVED/REJECTED/REDIRECTED history.
- **Conversational steering**: free-text steering composer (with the four spec example chips) that visibly modifies work — WHY line updates, "Adjusting to founder steering" milestone, thread flagged steered, activity recorded; steering at the decision gate sends Core back to work and re-prepares the recommendation.
- **Founder interruption**: a new command during active work renders WORK UPDATED (previous direction → new founder direction → Redirecting…), marks the old thread Redirected, and starts the new work; "Stop."-prefixed commands halt without creating work.
- **Jarvis/Manual as one OS**: JARVIS is an AI interaction mode (not the OS); MANUAL exposes all 8 modules (Company, Work, Decisions, Research, Workforce, Activity, Audit, Messenger) fully without Jarvis; AI credits gate AI capability only — when depleted Jarvis honestly refuses while Manual remains usable.
- **Messenger** as a corner-launched contextual drawer (communication layer, explicitly simulated; Core/Sophia contextual messages on decision/completion).
- **Company State sheet** answers the four founder questions (What is happening? What changed? What needs attention? What is being worked on?) from the simulated state, with DEMO STATE notices.
- The 7 V3 states remain INTERNAL (they drive the Core orb's presence only); the founder-facing model is the operating loop above.

### Files (all isolated from production code)

- `public/prototype/v4/index.html` (new)
- `public/prototype/v4/prototype.css` (new — extends the V3 design tokens)
- `public/prototype/v4/prototype.js` (new — work engine, attention model, steering, interruption, provenance)
- `public/prototype/v4/README.md` (new)
- `scripts/verify-prototype-v4.js` (new)
- V3 remains untouched at `public/prototype/` for comparison.

### What was verified (all actually run)

- `node scripts/verify-prototype-v4.js` → **All 17 structural/safety checks PASS** (77 required IDs, 7 internal states, V4 pane mapping, conversational composer, 4 decision verbs, 8 manual modules, 6 provenance stages, demo-safety absence checks: no fabricated facts/model names/counts/claims, no fetch/XHR/WebSocket).
- `node --check prototype.js` → 0 syntax errors.
- Browser E2E via agent-browser against the live prototype (desktop 1600×1000 and mobile 420×900): all 15 required interactions verified — command → understanding; persistent thread appears; milestones progress with evidence ticking; steering (composer + example chips, visibly modifies work); interruption (WORK UPDATED + redirect); decision gate reached; APPROVE → executing → completed outcome; REJECT → honest no-action outcome; REDIRECT → steering at gate → re-prepared recommendation; outcome exposes evidence; provenance modal scoped to thread; return to work threads (focus + CONTINUE WORK + "Continue the positioning review."); messenger drawer with simulated exchange; Manual mode — all 8 modules functional without Jarvis; credits depletion honestly pauses Jarvis while Manual stays usable; attention surface updates across every state change (including the Company Review → WATCH flow). Zero browser console errors; responsive checks (context strip hidden on mobile, core scales to 270px, no overflow).
- Visual verification of rendered screenshots (ready, decision-gate, outcome, provenance states) via vision model — layout coherent, high contrast, no glitches/overlaps, premium/restrained (not game-like).
- No production files modified: `git status` shows only `public/prototype/v4/` and `scripts/verify-prototype-v4.js` (+ this documentation).

### Demo-data safety (explicit)

Persistent `DEMO STATE · NO LIVE COMPANY DATA CONNECTED` watermark; SIMULATION badges on the threads dock, work sheet and activity; DEMO notices on Company State, Workforce and Provenance surfaces; messenger labeled simulated; learning-not-persisted note on outcomes; workforce limited to the repository-confirmed v1 roster (Sophia/Thorne) with generic governed-worker semantics and target-state standby labels; no employees/revenue/customers/metrics/model names/versions/security claims anywhere.

### Known limitations

- All state is client-side simulation — command interpretation is keyword-template based, not an LLM; nothing is persisted (refresh resets the demo; Reset Demo restores initial state).
- The decision boundary is demonstrated with generic illustrative language ("external consequences"); no real approval rules are claimed.
- Founder interruption creates a new thread rather than mutating the old one in place (the old thread is kept, marked Redirected) — a deliberate persistent-identity choice.
- Voice, autonomous assistant behavior, persistent conversation memory, Role Brains and market intelligence remain out of scope (per product boundaries).

### Next recommended actions

1. Founder design review of V4 vs V3 (`/prototype/v4/` vs `/prototype/`).
2. If V4 direction is approved: map the five layers onto the REAL authoritative read layer built in Phase 3.3 (work threads ← workflow instances; attention ← real aggregation; decisions ← real approval inbox; provenance ← real audit/epistemic reads) and the real orchestration entry point from Phase 3.2 — the production connection points already exist.
3. Keep Jarvis/Manual and the credit semantics decision (AI capability vs OS access) as a durable product decision if confirmed by the founder.

---

## Phase 3.6 — Core V3 / Astra-Inspired Interaction Redesign

**Status:** COMPLETE (Core V3 prototype implemented, verified, isolated in `public/prototype/`).
**Base HEAD:** `32a6f38`

### What was implemented

A comprehensive redesign of the central operating interface inspired by OpenAI Astra interaction principles, making the **Central Core a genuine living intelligence surface** rather than a decorative orb:

1. **7 Core Operational States Model:**
   - `READY`: Calm rhythmic breathing, subtle particles, prompt suggestions.
   - `UNDERSTANDING`: Particles converge inward toward center; Work Surface displays intent and context being gathered (company state, recent decisions, product context, market intelligence).
   - `WORKING`: Controlled purposeful circulation; Work Surface displays real-time multi-step task progress checklist with checkmarks and steering actions.
   - `WAITING_FOR_FOUNDER`: Core motion slows and focuses into an attentive warm beacon; Work Surface surfaces a concise decision card with context, evidence availability, impact, and ratification/rejection controls.
   - `EXECUTING`: Directional, structured kinetic flow; task execution stages checklist with stop controls.
   - `COMPLETED`: Gentle emerald settling bloom; outcome summary with next useful actions.
   - `BLOCKED`: Restrained perimeter warning (no glitch/cyberpunk effects); diagnostic failure conditions & prerequisites.

2. **Core Work Surface & Founder Steering:**
   - Contextual surface positioned directly below the Core that appears during active states and recedes when idle.
   - Real-time steering controls: `[ ⟳ Redirect ]` (allowing the Founder to steer into product context, market research, or inspect findings) and `[ ⏹ Stop ]` (gracefully halting ongoing work).
   - Operational transparency without exposing raw model reasoning or chain-of-thought.

3. **Dynamic Context & Operating Governance:**
   - Dynamic header badge displaying active operational domain (`FOUNDER COMMAND`, `COMPANY OPERATIONS`, `LUMORA · PRODUCT CONTEXT`, `GOVERNED SYSTEMS`).
   - Conceptual AI Credits simulation (`⚡ Credits: 850`): demonstrates graceful fallback to `JARVIS UNAVAILABLE` when credits are depleted, while Manual operation remains 100% accessible.
   - Manual Mode direct navigation overlay exposing all 7 governed modules (`Company`, `Work`, `Decisions`, `Research`, `Workforce`, `Activity`, `Audit`).
   - Persistent watermark: `DEMO STATE · NO LIVE COMPANY DATA CONNECTED`.

### What was verified

- `npx tsc --noEmit` → **0 errors** (zero production regressions).
- `npx tsx tests/phase3_4_legacy_read_routes.test.ts` → **21/21 PASS**.
- `npx tsx tests/governance_security_foundation.test.ts` → **41/41 PASS**.
- `node scripts/verify-prototype.js` → **All 33 Core V3 IDs, 0 JS syntax errors, 7 core states, and absence of fabricated company facts verified**.

---

## Phase 3.5 — Jarvis Command Center HTML Prototype (Spatial IA Redesign & Epistemic Realignment)

**Status:** COMPLETE (prototype redesigned, verified, isolated in `public/prototype/`).
**Base HEAD:** `32a6f38`

### What was implemented

A standalone, high-fidelity visual and interaction prototype exploring the future **Jarvis Command Center** experience for SamJuniorsOS based on the founder's cinematic space/celestial reference, re-architected to make the **Central Core the true interaction epicenter** and ground all context strictly in verified repository reality:

1. **Information Architecture Redesign (Spatial & Contextual):**
   - **Removed Pinned Dashboard Cards:** Eliminated permanently docked 3-column sidecards (`COMPANY STATUS` and `RECENT ACTIVITY`) that made the interface resemble a standard enterprise dashboard.
   - **Central Core as Epicenter:** The Celestial Core and Command Bar now command the primary spatial canvas.
   - **Orbital Contextual Satellites:** Replaced static cards with minimalist ambient satellite beacons (`[● Governed State]`, `[☵ Active Agents]`, `[▲ Ratification Gate]`, `[◷ Activity Stream]`) that expand into spatial sliding sheets on demand or in response to command context.
   - **Spatial Glass Sheets (Level 2):** Slide-out contextual surfaces for Company State (left), Activity & Provenance (right), and Workforce Presence (bottom), dismissible via `Escape` or keyboard shortcuts (`C`, `W`, `A`, `M`).

2. **Purging Unsupported / Fabricated Facts (`PRODUCT.md` Realignment):**
   - **Zero Fabricated Metrics:** Removed all placeholder numbers ("12 employees active", "12 workflows running", "Sync: 99.4%", "Customer insights updated", "Finance forecast ready", "Product launch focus").
   - **Strict v1 Workforce:** Roster is strictly limited to **Sophia (COO / Planner)** and **Thorne (Principal Systems Worker)**. Explicit notice that other roles (Maya, Julian, Elena, Marcus) remain target-state non-v1 architectures per `PRODUCT.md §5–§6`.
   - **Evidence-Grounded States:** Reflects genuine qualitative states (`Healthy · Governed`, `Single Container Locked`, `Separation of Powers Active`, `Gross Margin Floor: 80% Enforced`).
   - **Milestone Activity Stream:** Populated exclusively with genuine architectural milestones (`ConstitutionalVerifier passed margin check`, `Sophia validated epistemic claim`, `Thorne completed deterministic build`, `Durable audit record committed`).
   - **Cryptographic Ratification Gate:** Consequential action modal demonstrating canonical SHA-256 payload hash binding (`{ actionName, target, payload }`).

3. **Files Maintained:**
   - `public/prototype/index.html`
   - `public/prototype/prototype.css`
   - `public/prototype/prototype.js`
   - `public/prototype/README.md`
   - `scripts/verify-prototype.js`

### What was verified

- `npx tsc --noEmit` → **0 errors** (zero production regressions).
- `npx tsx tests/phase3_4_legacy_read_routes.test.ts` → **21/21 PASS**.
- `npx tsx tests/governance_security_foundation.test.ts` → **41/41 PASS**.
- `node scripts/verify-prototype.js` → **All 21 HTML IDs, 0 JS syntax errors, 8 core states, and absence of fabricated phrases verified**.

---

## Phase 3.4 — Founder-Guard Legacy Read Routes (security hardening slice)

**Status:** COMPLETE (implemented, tested, regression-verified).
**Base HEAD:** `6b03925` · **Commit:** see git log for the Phase 3.4 entry.

### What was implemented

The security-hardening slice identified during Phase 3.3 — all three previously unguarded legacy read routes are now strictly protected behind the canonical SamJuniorsOS server-side founder authentication model:

1. `GET /api/workflow/scheduling` (`app/api/workflow/scheduling/route.ts`)
2. `GET /api/agents/runs` (`app/api/agents/runs/route.ts`)
3. `GET /api/workflow/definitions` (`app/api/workflow/definitions/route.ts`)

Additionally, `middleware.ts` was updated to include `"/api/agents/(.*)"` in `isExecutiveApiRoute`, ensuring edge defense-in-depth consistency with `/api/workflow/(.*)`.

### Authentication & security behavior

- Every target route imports and calls `getAuthenticatedFounder(req)` from `@/lib/server/auth/session`.
- Fails closed with HTTP 401 when:
  - Request is unauthenticated (no cookies / headers).
  - Dev identity is spoofed / non-founder (e.g. `x-samjuniors-dev-as: attacker`).
  - Dev secret is missing or incorrect (`x-samjuniors-dev-secret` mismatch).
  - Production mode is active (`NODE_ENV === 'production'` strictly disallows dev headers/cookies).
  - Query parameter or body auth spoofing attempts are made (the server reads identity exclusively from verified session/headers).
- Authenticated Founder requests:
  - Receive the identical, backward-compatible response schemas.
  - Routes remain strictly read-only (zero mutations introduced; verified via deep snapshot comparisons before and after GET requests).
  - No second authentication model, no secondary allowlists, and no client-side trust introduced.

### What was verified (all actually run)

- `npx tsc --noEmit` → 0 errors.
- `npx eslint` across all modified files → clean (0 errors, 0 warnings).
- Dedicated test suite `tests/phase3_4_legacy_read_routes.test.ts` → **21/21 PASS**:
  - Route 1 (`GET /api/workflow/scheduling`): unauthenticated 401, spoofed role 401, wrong secret 401, production bypass rejection 401, query param bypass rejection 401, valid founder read with enriched workflow metadata 200, read-only guarantee verified.
  - Route 2 (`GET /api/agents/runs`): unauthenticated 401, spoofed role 401, wrong secret 401, production bypass rejection 401, query param bypass rejection 401, valid founder read 200, read-only guarantee verified.
  - Route 3 (`GET /api/workflow/definitions`): unauthenticated 401, spoofed role 401, wrong secret 401, production bypass rejection 401, query param bypass rejection 401, valid founder read 200, read-only guarantee verified.
- `tests/governance_security_foundation.test.ts` → **41/41 PASS** (added Test 7.5, 7.6, 7.7 for the newly guarded routes).
- Full regression verification:
  - Phase 3.3 Authoritative Reads (`tests/phase3_3_authoritative_reads.test.ts`): **17/17 PASS**.
  - Phase 3.2 Command Terminal (`tests/phase3_2_command_terminal.test.ts`): **22/22 PASS**.
  - Phase 3.1 Decision Loop (`tests/phase3_1_decision_loop.test.ts`): **11/11 PASS**.
  - Phase 12.3 Authorization Gate (`tests/phase12_3_authorization_gate.test.ts`): **38/38 PASS**.
  - Phase 2.1 Database Foundation (`tests/phase2_1_database_foundation.test.ts`): **25/25 PASS**.
  - Phase 2.4 Idempotency (`tests/phase2_4_idempotency.test.ts`): **14/14 PASS**.
  - Phase 2.5 Distributed Scheduling (`tests/phase2_5_distributed_scheduling.test.ts`): **12/12 PASS** (offline unit/in-memory concurrency; real-PG skipped when PG offline, unchanged posture).

### Security findings

- The three legacy read routes previously lacked any server-side authentication check, exposing sensitive workflow definitions, internal scheduling delays, and specialist agent run telemetry to unauthenticated callers.
- All three routes now strictly enforce server-side verified founder authentication with fail-closed 401 semantics.
- Middleware route matchers now cover `/api/agents/(.*)` alongside existing `/api/workflow/(.*)` routes.

### Remaining risks & pre-existing follow-ups

- Pre-existing Phase 3.3 open items remain unchanged:
  - `synthesizeOrchestrationRunFromWorkflow` maps BLOCKED instances to run status 'running' in orchestrate synthesis (overview and terminal re-reads display blocked correctly).
  - `evaluateReadiness` non-CAS write remains (Phase 2-certified runtime write-path concurrency characteristic).
  - Single-instance deployment constraint (min=1, max=1) remains active.

### Next recommended action

- STOP. Do NOT begin UI redesign or Jarvis integration in this slice.
- The next activity is the **Command Center UX/UI Design Review** using:
  1. Current SamJuniorsOS repository
  2. Current roadmap and product docs
  3. Provided Jarvis-style visual reference
  4. Founder's HTML prototype

---

## Phase 3.3 — Authoritative Command Center Reads (third vertical slice)

**Status:** COMPLETE (implemented, tested, browser-verified).
**Base HEAD:** `e6c320c` · **Commit:** see git log for the Phase 3.3 entry.

### What was implemented

The Phase 3.3 vertical slice — the cockpit's remaining fabricated/static
surfaces now read authoritative persisted state:

```
AUTHORITATIVE PERSISTED STATE → READ/QUERY LAYER (lib/server/cockpit)
→ GET /api/cockpit/overview → EXECUTIVE COCKPIT → UI REFLECTS REAL STATE
```

At `e6c320c` the cockpit's Vitals Wall + Executive Stream + header vitals were
still fabricated: static demo initiatives/workforce/financial constants from
`lib/os-data.ts`, three seeded fake stream events, fake "Executing/Standby"
agent status, fake financial chips (runway/margin/burn), a fake green
"active" fleet dot, and a Vitals Wall labeled "Ground Truth (PostgreSQL)"
while rendering static data. Additionally, a failed approvals read silently
rendered "All Side-Effects Clear" (a dangerous false statement).

Changes:

- `lib/server/cockpit/overview.ts` (new) — READ-ONLY server-side aggregation
  over the EXISTING repositories only: workflow instance store (status
  counts + recent instances), approval store behind the gate (pending count),
  scheduled work store (count + earliest due), agent run store (24h
  completed/failed counts, per-agent last run, run events), audit store
  behind the gate (execution events), epistemic claim store
  (claims-pending-verification count). Every metric carries an explicit
  deterministic definition; fail-closed per source (CockpitReadError names
  the source — a database failure is NEVER zeros); bounded slices
  (recentWorkflows ≤ 8, stream ≤ 30, run window 100); discloses `asOf` +
  `persistenceMode`. No new persistence, no second data model.
- `app/api/cockpit/overview/route.ts` (new) — the smallest typed read
  endpoint: founder-session guard (401), aggregation, 503 fail-closed
  mapping for unavailable authoritative persistence (`reads_unavailable`),
  500 otherwise. Reads only — no write path exists in this route.
- `lib/cockpit/overview-state.ts` (new, pure client-safe) — display
  derivations from the authoritative response: error-kind mapping
  (401/503/500/network), vitals tiles, relative-time formatting,
  persistence-mode label, empty-state predicates. No data of its own.
- `components/cockpit/ExecutiveCockpit.tsx` — ALL fabricated surfaces
  removed (os-data demo imports gone, seeded stream events gone, financial
  chips replaced by REAL header chips: pending approvals + active workflows,
  fake fleet "active" dot removed) and replaced with: bounded polling of the
  authoritative overview (15s + event-triggered refreshes after command
  outcomes / approval decisions), Vitals Wall tiles + workflow-instances
  card + fleet verified-run-activity card, Executive Stream rendered from
  persisted records (workflow/approval/agent-run/audit events with source
  badges; local session events only relay real server outcomes per Phase
  3.2 semantics), honest failure states (vitals error panel, stream
  unavailable, stale-read banner on network failure), and the approvals
  inbox now distinguishes loading / error / genuinely-empty (a failed read
  no longer renders "All Side-Effects Clear").
- Metrics with NO authoritative source (financial runway/margin/burn,
  static strategy initiatives) are REMOVED, not replaced with other fake
  values — the cockpit renders only what persistence actually holds.

### Authoritative source map (implemented)

| Cockpit surface | Authoritative source | Transformation |
|---|---|---|
| Active/awaiting/blocked/failed/completed workflow counts | Workflow instance store (PG `workflow_instances`, status-indexed / DurableFileStore) | count by status |
| Recent workflows list | same | order by updatedAt, top 8 |
| Pending approvals count (+ inbox) | Approval store behind the gate (Phase 3.1 path, unchanged) | count of decision=pending |
| Scheduled work count + next due | Scheduled work store (PG `scheduled_work_items`, [status, executeAt] index) | count + min(executeAt) |
| Agent runs 24h + fleet last-run | Agent run store (PG `agent_runs`, [agentId, status, createdAt] index) | filter by 24h window; first run per roster role |
| Claims pending verification | Epistemic claim store | count of verificationStatus=pending |
| Stream events | workflow instances + decided approvals + agent runs + audit records | merged, sorted desc, capped 30, ids `source:recordId` |
| Financial chips / initiatives / fleet status | NONE EXISTS | removed (honest absence) |

### What was verified (all actually run)

- `npx tsc --noEmit` → 0 errors.
- `npx eslint` on all 5 touched/new files → clean.
- New suite `tests/phase3_3_authoritative_reads.test.ts` → **17/17 PASS**
  (offline DurableFileStore mode). Covers: unauthenticated / non-founder /
  wrong-secret rejection (401); honest empty state (real zeros, fleet with
  null lastRuns, empty stream); no fabricated/demo values in the response
  (structural + demo-string checks); workflow counts derived from real
  durable instances seeded through the exact runtime path (completed /
  awaiting / blocked); decided approval + audited execution surfacing as
  real persisted stream events; agent-run vitals + fleet last-run with the
  24h window enforced; scheduled-work + epistemic-claim vitals; every
  stream event mapping to a real persisted record id with desc ordering and
  the 30-event cap; the read-only guarantee (deep snapshot comparison of
  instances/approvals/audits/runs/scheduled/claims before+after); refresh
  reflecting changed durable state; fail-closed 503 with the source named
  when authoritative persistence is unavailable (real authority machinery,
  no mocks — DATABASE_MODE=authoritative without PostgreSQL); honest
  display error derivations; and a static source guard that the cockpit
  component no longer references any demo-data constant.
- Full offline regression (all actually run, all exit 0): Phase 3.1 decision
  loop 11/11; Phase 3.2 command terminal 22/22; governance & security
  foundation 38/38; Phase 12.3 authorization gate 38/38; Phase 2.1 25/25;
  Phase 2.2 24/24; Phase 2.3 22/22; Phase 2.4 idempotency 14/14; Phase 2.5
  12/12 in-memory (real-PG tests skip by design when no local PostgreSQL —
  none is running in this environment, unchanged posture); Phase 12.4 and
  12.5 all pass.
- Browser E2E (agent-browser against a live `next dev` server on a spare
  port, dev-cookie founder session, seeded through the exact runtime path):
  - Cockpit renders REAL persisted state: vitals tiles (109 claims pending
    verification, 36 ok / 6 failed runs in 24h, etc.), workflow-instance
    counts, fleet verified run activity, and a stream of real
    workflow/approval/agent-run/audit events — zero fabricated strings on
    the page (verified by DOM scan).
  - Source label honest: "Durable file store (local) · as of <time>".
  - Terminal dispatch → live POST /api/orchestrate → honest ENGINE NOT
    CONFIGURED result (no workflow, no fabrication).
  - Seeded awaiting-approval instance → vitals "1 pending / 1 awaiting
    approval" + inbox card; **Approve click → durable execution + audit**;
    refresh → "4 completed" + stream shows the real approval/audit/workflow
    events.
  - Unauthenticated state: vitals error panel ("Vital signs unavailable …
    No values are shown as zeros") + approvals error state — verified by
    clearing cookies; direct HTTP GET without cookies → 401.
  - Mobile (390px) and desktop layouts verified; zero page/console errors
    across all flows.
  - Runtime `.data` state was restored to HEAD after verification (test/E2E
    residue is not product state); the E2E seed script was removed.

### Known limitations

- `GET /api/workflow/scheduling`, `GET /api/agents/runs`, and
  `GET /api/workflow/definitions` remain UNGUARDED read routes (pre-existing
  Phase 13 routes, NOT used by the cockpit — the overview endpoint calls the
  stores directly behind its own founder guard). Flagged as a follow-up
  security hardening item, deliberately not expanded into this slice.
- `listAudits()` has no server-side limit; the overview takes the top 10 of
  the full list. Audit growth is founder-approval-gated (slow at single-
  founder scale), but a bounded/limit-aware audit listing is a follow-up if
  audit volume grows.
- Stream "events" for workflows are derived from persisted instance state
  (status + updatedAt), not a persisted transition log — honest state
  snapshots, not an event-sourced history. Approval/agent-run/audit events
  ARE individual persisted records.
- Optional fixes from the Phase 3.3 spec §12 were deliberately NOT taken
  (neither is in the touched read path, per the spec's own scope rule):
  (a) `synthesizeOrchestrationRunFromWorkflow` still maps BLOCKED instances
  to run status 'running' (orchestrate response path; the overview/terminal
  re-read paths display blocked correctly from raw instance state);
  (b) `evaluateReadiness`'s non-CAS instance write remains (write-path
  concurrency characteristic, Phase 2-certified runtime behavior).
- Polling intervals (approvals 10s, overview 15s) are simple bounded
  intervals at single-founder scale; no WebSockets/streaming infrastructure
  was added by design.

### Unresolved risks / next recommended actions

1. **Next slice candidate:** founder-guard the three unguarded read routes
   (scheduling/agent-runs/definitions GET) — small, security-positive, and
   now clearly flagged; or begin Jarvis prototype review (the production
   read layer is now trustworthy, which the prototype integration was
   waiting on).
2. Fix the blocked→running synthesis quirk in
   `synthesizeOrchestrationRunFromWorkflow` (small API-facing honesty fix).
3. CAS guard for `evaluateReadiness`'s instance write (Phase 3.1 limitation,
   still open).
4. Background/scheduler-driven orchestration resume so long DAGs don't hold
   the POST open (Command Center-scale concern).

---

## Phase 3.2 — Command Terminal → Real Orchestration (second vertical slice)

**Status:** COMPLETE (implemented, tested, browser-verified).
**Base HEAD:** `3cf92f3` · **Commit:** see git log for the Phase 3.2 entry.

### What was implemented

The Phase 3.2 vertical slice — the founder can now create REAL work from the
Command Center through the existing orchestration path:

```
FOUNDER COMMAND → COMMAND TERMINAL → POST /api/orchestrate (EXISTING)
→ EXISTING RUNTIME → WORKFLOW → APPROVAL WHEN REQUIRED (Phase 3.1 loop)
→ DURABLE RESULT → AUDIT → TERMINAL REFLECTS ACTUAL SERVER STATE
```

At `3cf92f3` the cockpit's bottom terminal was a local-only fake: it appended
a "Directive Issued" stream event and routed the founder to the classic-desktop
Workforce app (`onDispatchDirective` → `openApp('workforce')`); no request ever
reached `/api/orchestrate` (WORKLOG 3.1 "next slice candidate").

Changes:

- `lib/cockpit/command-terminal-state.ts` (new, pure client-safe module) —
  the terminal's display-derivation layer: authoritative run status → outcome,
  HTTP status → error kind, durable instance state (re-read) → outcome,
  client idempotency-key generation, and a sessionStorage POINTER for the
  refresh re-read. Contains no authorization, orchestration, or company-state
  logic. Pins the rule the tests enforce: HTTP 200 / `success: true` NEVER
  maps to `completed`; only `data.status` (the durable run status) can.
  Maps the unconfigured-engine response (status failed + liveAi false +
  executionMode 'unconfigured') to an honest UNCONFIGURED state.
- `components/cockpit/CommandTerminal.tsx` (new) — the input surface: input +
  dispatch, submitting state, result panel (status chip, server-provided
  detail, instance id, execution mode, replay/reread badges), distinct
  error rendering (401/403/400/409/422/500/network with the server's safe
  actionable messages), retry-with-SAME-key on network failure (real
  idempotency, not client-side fake), refresh re-read that re-fetches the
  authoritative instance state via the existing GET /api/workflow/instances
  contract (pointer only — state always comes from the server; missing
  record → pointer discarded honestly). No approval UI: when the server
  reports `requires_approval`, it fires `onApprovalRequested` so the EXISTING
  Phase 3.1 inbox refreshes immediately and points the founder there.
- `components/cockpit/ExecutiveCockpit.tsx` — the fake dispatch path removed
  (form, local-stream event, `onDispatchDirective` prop); footer now mounts
  the CommandTerminal; executive-stream events are pushed only AFTER the
  server returns the real outcome (never fabricated pre-dispatch).
- `app/page.tsx` — removed the now-unused `onDispatchDirective` cockpit wiring
  (classic-desktop paths unchanged).
- `app/api/orchestrate/route.ts` — smallest necessary, backward-compatible
  fix: the idempotency claim's thrown `OperationInProgressError` /
  `UnknownExternalResultError` / `IdempotencyConflictError` states now return
  structured 409 responses (`code: idempotency_in_progress|idempotency_unknown|
  idempotency_prior_failure`) instead of generic 500s (these error classes were
  already imported-but-unhandled in the route). Success paths are untouched;
  the replay (200 + X-Idempotent-Replay) and payload-mismatch (422) contracts
  are unchanged.

### What was verified (all actually run)

- `npx tsc --noEmit` → 0 errors.
- `npx eslint` on all 6 touched/new files → clean.
- New suite `tests/phase3_2_command_terminal.test.ts` → **22/22 PASS**
  (offline DurableFileStore mode). Covers: real route-handler invocations for
  unauthenticated / non-founder / wrong-secret (401), malformed command
  (missing/empty/non-string directive → 400), founder submission reaching the
  real path (honest unconfigured result, idempotency key claimed in the
  existing store, no workflow created, no fabricated metrics), duplicate
  submission replay (200 + X-Idempotent-Replay + deep-equal body), altered
  payload (422), in-progress duplicate (409 in_progress), coordination-loss
  unknown (409 unknown), failed-prior (409 prior_failure), successful
  orchestration through the exact route code path (runtime → completed run +
  instance id), approval-required command entering the EXISTING Phase 3.1
  approval loop (pending record → founder decides → gate-mediated execution →
  durable completed + audit; reject → blocked, zero executions), durable
  re-read (store + durable file layer + terminal re-derivation after
  approval and while awaiting), and the pure terminal display logic
  (200/success:true + failed → UNCONFIGURED never success; requires_approval →
  AWAITING; error-kind mapping for every class; blocked/cancelled/missing
  re-read honesty; unique idempotency keys).
- Full offline regression (all actually run, all exit 0): Phase 3.1 decision
  loop 11/11; Phase 2.4 idempotency 14/14 (touched route); governance &
  security foundation 38/38; Phase 12.3 authorization gate 38/38; Phase 2.1
  25/25; Phase 2.2 24/24; Phase 2.3 22/22; Phase 2.5 12/12 in-memory
  (real-PG tests skip by design when no local PostgreSQL, unchanged).
- Browser E2E (agent-browser against a live `next dev` server on a spare port,
  dev-cookie founder session, seeded through the exact /api/orchestrate code
  path):
  - Cockpit renders the terminal; approvals inbox renders pending approvals.
  - **Dispatch a directive → live POST /api/orchestrate (200 observed in the
    network trace) → terminal displays the honest ENGINE NOT CONFIGURED
    state** ("GEMINI_API_KEY environment variable is not configured", mode
    unconfigured, liveAi false, "No workflow was created and no results were
    fabricated") — not success.
  - **Refresh → DURABLE RE-READ → "AWAITING FOUNDER APPROVAL"** verified from
    durable state with the pointer to the inbox.
  - **Approve click in the existing inbox → live response:** "Approved —
    durable result: step 'step-side-effect' is completed, workflow completed
    (1 audit record)."
  - **Refresh again → DURABLE RE-READ → "COMPLETED"** verified from durable
    state.
  - Zero page errors / console errors across all flows.
  - Direct HTTP boundary checks: GET approvals & POST orchestrate without
    cookies → 401.
- Runtime `.data` state was restored to HEAD after verification (test/E2E
  residue is not product state).

### Known limitations

- The configured-engine path (live GEMINI_API_KEY) was verified at the
  runtime/route level in tests, not with a live AI key (none exists in this
  environment). The browser E2E exercised the honest unconfigured path over
  live HTTP, plus the real approval loop on seeded durable state.
- Orchestration remains synchronous (pre-existing Phase 3.1 limitation,
  unchanged): long DAGs hold the POST open.
- `synthesizeOrchestrationRunFromWorkflow` maps a BLOCKED instance to run
  status 'running' (pre-existing synthesis quirk, deliberately not changed in
  this slice — documented; the terminal's refresh re-read path DOES display
  blocked correctly from raw instance state).
- The 409 structured codes are additive to the existing contract; the
  terminal also sniffs legacy 500 messages for backward compatibility.
- The refresh re-read fetches GET /api/workflow/instances (all instances,
  client-side filter by pointer id) — fine at current single-founder scale.
- Vitals Wall / Executive Stream still render static demo data (Phase 3.1
  known limitation; explicitly out of scope here).

### Unresolved risks / next recommended actions

1. **Next slice candidate:** replace the Vitals Wall / Executive Stream demo
   data with authoritative reads (workflow instances, scheduled work, agent
   runs, epistemic claims) — the two remaining fabricated-data surfaces.
2. Consider a CAS guard for `evaluateReadiness`'s instance write (Phase 3.1
   known limitation, still open).
3. Consider fixing the blocked→running synthesis quirk in
   `synthesizeOrchestrationRunFromWorkflow` (small, but it is an API-facing
   honesty issue for any future consumer).
4. Consider a background/scheduler-driven orchestration resume so long DAGs
   don't hold the POST open (Command Center-scale concern).

---

## Phase 3.1 — Founder Decision Loop Closure (first vertical slice)

**Status:** COMPLETE (implemented, tested, browser-verified).
**Base HEAD:** `478b3e7` · **Commit:** see git log for `feat(command-center)` entry.

### What was implemented

The Phase 3 first vertical slice — the complete, production-oriented founder
decision path:

```
READ AUTHORITATIVE STATE → PRESENT → FOUNDER DECIDES → GATE (authority)
→ RUNTIME RESUME → DURABLE RESULT → AUDIT → UI REFLECTS RESULT
```

Repository evidence at `478b3e7` showed the loop was broken in the middle:
`POST /api/workflow/approvals` recorded the Founder's decision in the approval
store, but nothing propagated it to the bound workflow instance — side-effect
steps stayed `awaiting_approval` forever (`runtime.approveStep` /
`runtime.resumeWorkflow` had zero production callers), and rejected approvals
never failed the step closed. Additionally, the route passed the session email
(`founder@samjuniors.com`) as `decidedBy`, which the gate's founder allowlist
does not recognize — every cockpit Approve click failed with
"Permission denied" (latent production bug, verified live before the fix).

Changes:

- `lib/server/workflow/runtime.ts` — `evaluateReadiness`: an `allowed` decision
  carrying `APPROVED_BY_FOUNDER` (authoritative, Founder-decided approval
  record matched by the policy evaluator) now advances the step to `ready` /
  `approvalState: approved`. The record is the authority; the step field is a
  derived cache and must not veto the record.
- `lib/server/workflow/decision-reconciler.ts` (new) — the command/action
  layer: after the gate durably records a decision, reconciles it into the
  bound workflow via `runtime.resumeWorkflow`. Approvals resume execution
  THROUGH the SideEffectAuthorizationGate (payload binding, single-use
  consumption, idempotency, audit, atomic step claims); rejections/revocations
  fail closed into `blocked` via the policy evaluator. Contains no
  authorization logic of its own. Honest no-op for standalone approvals,
  missing instances, and already-decided steps; reconciliation failure is
  reported, never silently shown as success.
- `app/api/workflow/approvals/route.ts` — POST now passes the server-verified
  session role through the gate's existing `userContext` contract (fixes the
  founder-identity mismatch above; no second allowlist created) and returns the
  reconciliation result alongside the decided record.
- `components/cockpit/ExecutiveCockpit.tsx` — decision feedback now reports the
  DURABLE outcome (step status, workflow status, audit-record count, or
  reconciliation failure) instead of a UI-assumed "success"; per-decision
  in-flight disabling; approval cards show the bound directive.

### What was verified (all actually run)

- `npx tsc --noEmit` → 0 errors.
- `npx eslint` on all 5 touched files → clean.
- New suite `tests/phase3_1_decision_loop.test.ts` → **11/11 PASS** in BOTH
  persistence modes: offline (DurableFileStore) and online (authoritative
  PostgreSQL 16.4, `DATABASE_URL` pointed at the Phase 2.6 certification
  instance). Covers: approve→execute→durable-complete with audit + single-use
  consumption; reject→blocked fail-closed (zero executions); revoke→blocked;
  duplicate decision → no re-execution; concurrent reconciliation → exactly
  one execution (atomic claim); non-Founder cannot decide; expired approval
  cannot execute through the reconciliation path; verified-session
  `userContext` contract; standalone/missing-instance honest no-ops.
- Full offline regression (no DATABASE_URL): governance 38/38, 12.3 38/38,
  12.4 all pass, 12.5 all pass, 2.1 25/25, 2.2 24/24, 2.3 22/22, 2.4 14/14,
  2.5 12/12 — all exit 0, zero failures.
- Online regression (real PG): phase2_6 15/15 exit 0, phase2_6_1 12/12,
  phase2_2 18/18, phase2_5 including real-PG lease race — all exit 0.
- Browser E2E (agent-browser against a live dev server, seeded via the exact
  `/api/orchestrate` code path — `createExecutiveWorkflowDefinition` →
  `executeWorkflow` → `awaiting_approval`):
  - Cockpit inbox renders pending approvals with directive context.
  - **Approve click → live response:** "Approved — durable result: step
    'step-side-effect' is completed, workflow completed (1 audit record)."
    Instance/step verified durably complete via API; approval consumed;
    zero browser console errors.
  - **Reject click → live response:** "Rejected — durable result: step
    'step-side-effect' is blocked, workflow blocked (0 audit records)."
    Durable blocked reason: "Founder rejected approval request"; zero
    executed audits (fail-closed verified over HTTP).

### Known limitations

- The reconciliation executes the resumed workflow synchronously within the
  POST request, consistent with `/api/orchestrate`'s existing behavior. Long
  DAGs will hold the request open; a background/scheduler-driven resume is a
  future Command Center concern, not introduced here.
- `evaluateReadiness` persists readiness changes via full-instance
  `saveInstance` (pre-existing, non-CAS). Execution itself is protected by
  `claimStepAtomic` (exactly-once), but a narrow concurrent-resume window can
  interleave readiness writes. Pre-existing runtime characteristic, unchanged
  in this slice; documented rather than rewritten (Phase 2 certified the
  runtime as-is; a CAS guard for `evaluateReadiness` is a candidate follow-up).
- The Executive Cockpit's Vitals Wall and Executive Stream still render static
  demo data (`lib/os-data.ts`) — flagged as a known fabricated-data surface;
  replacing it with authoritative reads is deliberately NOT part of this slice.
- Dev-mode (sandbox) authentication uses the `SAMJUNIORS_DEV_SECRET` cookie
  contract; production remains Clerk-verified. Unchanged.

### Unresolved risks / next recommended actions

1. **Next slice candidate:** wire the cockpit directive terminal to
   `/api/orchestrate` (currently appends to a local stream only) so the
   founder can create real work from the Command Center — the read side of
   the loop is now trustworthy, the create side still routes through the
   classic-desktop Workforce app.
2. Replace the Vitals Wall / Executive Stream demo data with authoritative
   reads (workflow instances, scheduled work, agent runs, epistemic claims).
3. Consider a CAS guard for `evaluateReadiness`'s instance write (see known
   limitations).
4. PROGRESS.md/ROADMAP.md history below Phase 3 is reconciled only at the
   status level; PRODUCT.md's "Current Repository State" section is dated
   `32a6f38` and does not yet describe Phase 2.5–2.6.1 durability machinery.

---

## Phase 2 — Foundation & Durability (summary, verified from git history)

All Phase 2 claims below are corroborated by repository commits and the
passing suites listed above (re-run at Phase 3.1 time — no regression):

- `02fc943` / `5e8ba9f` / `73af411` — security foundation: side-effect
  authorization gate, audit trails, deterministic verification, fail-closed
  payload binding, founder-only promotion/allowlists.
- `32a6f38` — orchestration + epistemic pipeline + governance state.
- `553dc96` — communication runtime behind the gate, persistent
  contacts/conversations/drafts.
- `b12cc5b` — Phase 2.5 distributed scheduling + lease manager.
- `4a272d9` — distributed scheduling test data.
- `8e21335` — Phase 2.6 real-PostgreSQL concurrency certification fixes
  (atomic lease acquire/claim/consume, genuine CAS transitions, scheduler
  fresh re-read, crash recovery `ready` clears stale claims, migration BOM).
- `305add8` — Phase 2.6.1: all 39 pre-existing tsc errors fixed (tsc exit 0),
  lease renewal wired into long-running execution with 12/12 renewal tests,
  phase 2.2 test redesign (online/fail-closed modes, FK-valid fixtures),
  real-PG CI (`.github/workflows/ci.yml`, fails — never skips — when PG is
  unavailable), full regression green.
- `478b3e7` — AGENTS.md universal agent contract added (documentation).

Deployment posture unchanged: single instance (min=1, max=1) +
`.data/instance.lock` `STRICT_SINGLE_INSTANCE` semantics intact.
