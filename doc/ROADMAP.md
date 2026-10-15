# ROADMAP.md — SamJuniorsOS Phases
**Status:** Current-state status updated 2026-10-15; historical sections may retain their original baseline dates. This file separates FOUNDATION / NEXT / LATER so scope cannot silently expand.

**CURRENT STATUS (verified 2026-10-15):**
- Phase 2.2.2 (Bounded Executive Council Deliberation) is complete. PR #12 is merged; merge commit: `edca06919b17eaa6737afba23b140b8abb3a82e5`. Issue #11 is closed.
- PR #10 is merged to `main` at `7fd66bf06fd79596d0e606872ec1cbdb7e2dcf42`; PR #8 remains the integration point for M2 Persistence/Recovery and Decision Workflow Phases 2.1, 2.1.1, and 2.2.1.
- The current `main` HEAD inspected for Phase 2.3A is `99441fd27ac927554028a41779a19aa86f4c67ce` (2026-10-15).
- GitHub branch listing contains only `main`; no open pull requests or open issues were present before Issue #13 was created.
- Issue #13, Phase 2.3A — Company Brain authority & persistence audit, is open. Audit branch: `phase/2.3a-company-brain-authority-audit`.
- Previous test totals remain historical engineering-reported results; they are not a fresh verification of the current `main` HEAD.

**NEXT PHASE:**
Phase 2.3A — Company Brain Authority & Persistence Audit. Role-Specific Knowledge and deeper Epistemic Brain integration remain downstream of verified domain authority, deployment/persistence reality, and read-path reconciliation.

**NEXT ACTION:**
Complete Issue #13 on its dedicated branch. Produce the domain/store and mode matrix, trace current consumers, reconcile documentation, and request Founder review. Do not start a persistence migration, schema rewrite, Role Brain implementation, or production deployment from the audit alone. No direct commits to `main`.

**Rule that governs this whole file:** nothing moves from a later phase into an earlier one because it seems interesting or because a reference repo does it well. A concept moves up only when the phase before it is actually done and verified against the repository—not merely documented as done.

---

## FOUNDATION (v1 — the core execution loop must be trustworthy before anything else matters)

Historical baseline as of `32a6f38` — implementation mechanisms reported as **IMPLEMENTED**. This is not current deployment verification; Phase 2.3A is re-auditing persistence, provenance and authority claims.

| Item | Status |
|---|---|
| Server-established Founder authority on all privileged routes | IMPLEMENTED + WIRED — authenticated sessions derived from Clerk/dev secret; strict allowlist enforced in decideApproval; all privileged routes guarded |
| Workflow/approval/audit persistence mechanisms | IMPLEMENTED paths exist — DurableFileStore and Prisma stores are present. Actual deployment durability is NOT VERIFIED: the checked-in schema is SQLite and deployed host/provider/storage semantics are unknown (Issue #13) |
| Approval bound to exact action/target/payload | IMPLEMENTED + WIRED — cryptographic SHA-256 canonical hashing ({ actionName, target, payload }); verifyApprovalPayloadBinding fails closed on consequential side-effects |
| Deterministic verification gate rejecting bad artifacts | IMPLEMENTED + WIRED — ConstitutionalVerifier.verify() deterministically halts orchestration and marks status: failed / verification_rejected on invariant breaches |
| Synthetic data never labeled as verified fact | PARTIALLY IMPLEMENTED — explicit provenance exists in several paths, but CompanyStateStore.queryState seed/current-truth behavior and INITIAL_RESEARCH confidence labels remain under audit (Issue #13) |
| Side-effect idempotency / unknown-outcome handling | IMPLEMENTED + WIRED — idempotency cache on /api/orchestrate; deduplicated Svix webhooks on Resend; idempotent fact promotion in pipeline |

**Historical verification statement:** prior engineering reports recorded passing targeted suites for this baseline. These are not a fresh test run on current `main`, do not establish PostgreSQL or deployed-storage behavior, and do not close the Phase 2.3A findings.

## NEXT (build once FOUNDATION is real, before LATER)

- Full relational persistence (Postgres/Prisma actually connected via `DATABASE_URL`) once §0's deployment decision is made.
- First-class versioned `Artifact` model.
- The Company Brain becoming the *single* path for state/knowledge reads and writes (not a correct pipeline existing alongside an un-migrated old one).
- Confirming and closing the two open auth gaps (live Clerk provisioning, gate.ts allowlist fix).
- GitHub as the first fully-specified external-effect adapter (idempotency key + unknown-outcome handling defined for that one provider — PRODUCT_ARCHITECTURE.md §8).
- Multi-instance-safe concurrency control, once shared durable persistence exists.

## LATER (genuinely valuable, explicitly not before NEXT is done)

- Role Brains (PRODUCT_ARCHITECTURE.md §11b) — per-employee derived context built from a Company Brain that's actually the single source of truth by then.
- Employee versioning and controlled upgrade/rollback (§11c).
- AI employee evaluation, skill-gap detection, training proposals — always subject to the Self-Improvement Safety Model (§11c: self-improving ≠ self-authorizing) from the very first implementation, not retrofitted after autonomy exists.
- Continuous market intelligence as a recurring, scheduled capability (§18) — the pipeline it needs (§11) is being built now, but the scheduling/cadence layer is not part of any current task.
- Remaining employee roster (Elena Rostova, Marcus Vance) once there's a concrete task only they can do.
- pgvector/RAG, E2B sandboxing, fine-tuning/eval infrastructure, broader Composio integrations, voice, unbounded peer-to-peer swarm workflows.
- Multi-user RBAC and full session-based auth for a second human — only if and when a second human is actually added (PRODUCT.md §1 locks this as internal/single-founder for now).

## Explicit non-goals (not a phase — outside this roadmap entirely unless the founder decision in PRODUCT.md §1 changes)

Commercial SaaS packaging, multi-tenancy, public signup, billing. These aren't "LATER" — they're not on this roadmap at all under the current, locked product boundary.
