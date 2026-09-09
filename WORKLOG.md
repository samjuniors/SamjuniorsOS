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
