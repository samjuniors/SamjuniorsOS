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
