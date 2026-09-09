# ROADMAP.md — SamJuniorsOS Phases
**Status:** Reconciled against repository `32a6f38` (2026-09-08). This file exists because PRODUCT.md and PRODUCT_ARCHITECTURE.md kept accumulating phase information inline — separated out per founder instruction so the FOUNDATION/NEXT/LATER boundary can't be missed or silently expanded.

**Rule that governs this whole file:** nothing moves from a later phase into an earlier one because it seems interesting or because a reference repo does it well. A concept moves up only when the phase before it is actually done, verified against the repository — not documented as done.

---

## FOUNDATION (v1 — the core execution loop must be trustworthy before anything else matters)

Status as of `32a6f38` — **IMPLEMENTED & SEALED**:

| Item | Status |
|---|---|
| Server-established Founder authority on all privileged routes | IMPLEMENTED + WIRED — authenticated sessions derived from Clerk/dev secret; strict allowlist enforced in decideApproval; all privileged routes guarded |
| Workflow/approval/audit state survives the actual deployment target | IMPLEMENTED + WIRED — atomic DurableFileStore + PostgreSQL schema; single-instance container constraint (min=1, max=1) guarded by InstanceConcurrencyGuard; append-only audit trail guarded in production |
| Approval bound to exact action/target/payload | IMPLEMENTED + WIRED — cryptographic SHA-256 canonical hashing ({ actionName, target, payload }); verifyApprovalPayloadBinding fails closed on consequential side-effects |
| Deterministic verification gate rejecting bad artifacts | IMPLEMENTED + WIRED — ConstitutionalVerifier.verify() deterministically halts orchestration and marks status: failed / verification_rejected on invariant breaches |
| Synthetic data never labeled as verified fact | IMPLEMENTED + WIRED — state-store initiatives demoted to unverified; initial memories demoted to high_confidence; unbacked memory injection sanitized in recordMemory() |
| Side-effect idempotency / unknown-outcome handling | IMPLEMENTED + WIRED — idempotency cache on /api/orchestrate; deduplicated Svix webhooks on Resend; idempotent fact promotion in pipeline |

**Foundation requirements verified with 100% test pass across reference integration, milestone hardening, authorization, communication, and security suites.**

## NEXT (build once FOUNDATION is real, before LATER)

Status reconciled against `478b3e7` (2026-09-09) — Phase 2.5/2.6/2.6.1 completed and certified several of these items; remaining ones unchanged:

| Item | Status |
|---|---|
| Full relational persistence (Postgres/Prisma actually connected via `DATABASE_URL`) | DONE & VERIFIED — authoritative PG stores with fail-closed `DatabaseAuthorityError`, migrations deployed & deterministic (Phase 2.1–2.6) |
| Multi-instance-safe concurrency control, once shared durable persistence exists | DONE & VERIFIED under tested scenarios (Phase 2.5/2.6 certification; deployment remains pinned to min=1/max=1 by deliberate decision) |
| First-class versioned `Artifact` model | NOT STARTED |
| Company Brain as the single path for state/knowledge reads and writes | PARTIAL — epistemic pipeline active alongside un-migrated legacy paths |
| Live Clerk provisioning (auth gap 1 of 2) | OPEN — deployment decision; gate.ts allowlist gap (2 of 2) closed in Phase 2 (`FOUNDER_ROLE_ALLOWLIST`) |
| GitHub as the first fully-specified external-effect adapter | NOT STARTED |

## PHASE 3 — Command Center (current; began at `478b3e7`, founder-directed)

The founder's operating interface ON TOP OF the sealed foundation — never a
second authorization system. Guiding rule: every capability must ride existing
gates, runtime, persistence, and audit; fewer high-value capabilities over a
broad dashboard.

| Slice | Status |
|---|---|
| 3.1 Founder Decision Loop Closure — approvals read → present → founder decides → gate → runtime resume → durable result → audit → UI reflects | DONE & VERIFIED (see WORKLOG.md) |
| 3.2 Command Terminal → /api/orchestrate — cockpit terminal submits real commands through the existing orchestration path with honest state display | DONE & VERIFIED (see WORKLOG.md) |
| 3.3 Authoritative Command Center Reads — Vitals Wall / Executive Stream / header vitals replaced with authoritative persisted reads; fabricated demo data removed | DONE & VERIFIED (see WORKLOG.md) |

## LATER (genuinely valuable, explicitly not before NEXT is done)

- Role Brains (PRODUCT_ARCHITECTURE.md §11b) — per-employee derived context built from a Company Brain that's actually the single source of truth by then.
- Employee versioning and controlled upgrade/rollback (§11c).
- AI employee evaluation, skill-gap detection, training proposals — always subject to the Self-Improvement Safety Model (§11c: self-improving ≠ self-authorizing) from the very first implementation, not retrofitted after autonomy exists.
- Continuous market intelligence as a recurring, scheduled capability (§18) — the pipeline it needs (§11) is being built now, but the scheduling/cadence layer is not part of any current task.
- Remaining employee roster (Elena Rostova, Marcus Vance) once there's a concrete task only they can do.
- pgvector/RAG, E2B sandboxing, fine-tuning/eval infrastructure, broader Composio integrations, voice, multi-agent council workflows.
- Multi-user RBAC and full session-based auth for a second human — only if and when a second human is actually added (PRODUCT.md §1 locks this as internal/single-founder for now).

## Explicit non-goals (not a phase — outside this roadmap entirely unless the founder decision in PRODUCT.md §1 changes)

Commercial SaaS packaging, multi-tenancy, public signup, billing. These aren't "LATER" — they're not on this roadmap at all under the current, locked product boundary.
