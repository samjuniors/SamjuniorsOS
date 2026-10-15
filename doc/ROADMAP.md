# ROADMAP.md — SamJuniorsOS Phases
**Status:** Current-state status updated 2026-10-14; historical sections may retain their original baseline dates. This file separates FOUNDATION / NEXT / LATER so scope cannot silently expand.

**CURRENT STATUS:**
- 2026-10-15: Phase 2.3B (Persistence Authority & Production Architecture Design) in draft revision on branch `phase/2.3b-persistence-authority-design` (`DRAFT — PENDING FOUNDER REVIEW`, tracking Issue #15).
- 2026-10-15: Phase 2.3A (Company Brain Authority & Persistence Audit and Deployment Verification) completed.
- 2026-10-14: Phase 2.2.2 (Bounded Executive Council Deliberation) completed and merged to `main` (commit `edca06919b17eaa6737afba23b140b8abb3a82e5`).
- 2026-10-14: PR #10 merged to `main` (merge commit `7fd66bf06fd79596d0e606872ec1cbdb7e2dcf42`), completing Issue #9 post-merge M2/Decision stabilization.
- PR #8 remains the integration point for M2 Persistence/Recovery and Decision Workflow Phases 2.1, 2.1.1, and 2.2.1.
- M1 memory source-of-truth work remains merged to `main` at `dd2c3c2bfb0bc5f9ea846dcd6a9410e7c840ff80`.

**PROPOSED NEXT PHASE:**
Phase 2.3C — Persistence Authority & Database Migration Execution (proposed only; strictly gated by Founder approval of Phase 2.3B architecture).

**NEXT ACTION:**
Complete Phase 2.3B architecture document revision on branch `phase/2.3b-persistence-authority-design` for Founder review. No production deployment, runtime schema changes, or migration execution until approved.

**Rule that governs this whole file:** nothing moves from a later phase into an earlier one because it seems interesting or because a reference repo does it well. A concept moves up only when the phase before it is actually done and verified against the repository—not merely documented as done.

---

## FOUNDATION (v1 — the core execution loop must be trustworthy before anything else matters)

Status as of `32a6f38` — **IMPLEMENTED & SEALED**:

| Item | Status |
|---|---|
| Server-established Founder authority on all privileged routes | IMPLEMENTED + WIRED — authenticated sessions derived from Clerk/dev secret; strict allowlist enforced in decideApproval; all privileged routes guarded |
| Workflow/approval/audit state survives the actual deployment target | PARTIALLY IMPLEMENTED (LOCAL/SANDBOX ONLY) — Currently backed by atomic DurableFileStore (`.data/*.json`) and SQLite via Prisma (`db/custom.db`). Target PostgreSQL schema definitions exist in design, but PostgreSQL is NOT currently connected, provisioned, or active as production authority. Single-instance container constraint (min=1, max=1) relies on local OS process PID checks (`InstanceConcurrencyGuard`), which are ineffective across container boundaries. |
| Approval bound to exact action/target/payload | IMPLEMENTED + WIRED — cryptographic SHA-256 canonical hashing ({ actionName, target, payload }); verifyApprovalPayloadBinding fails closed on consequential side-effects |
| Deterministic verification gate rejecting bad artifacts | IMPLEMENTED + WIRED — ConstitutionalVerifier.verify() deterministically halts orchestration and marks status: failed / verification_rejected on invariant breaches |
| Synthetic data never labeled as verified fact | IMPLEMENTED + WIRED — state-store initiatives demoted to unverified; initial memories demoted to high_confidence; unbacked memory injection sanitized in recordMemory() |
| Side-effect idempotency / unknown-outcome handling | IMPLEMENTED + WIRED — idempotency cache on /api/orchestrate; deduplicated Svix webhooks on Resend; idempotent fact promotion in pipeline |

**Foundation requirements verified with 100% test pass across reference integration, milestone hardening, authorization, communication, and security suites in local/test modes. Production multi-instance database authority remains pending Phase 2.3C.**

## NEXT (build once FOUNDATION is real, before LATER)

- Full relational persistence: Transition Prisma datasource from SQLite (`provider = "sqlite"`) to PostgreSQL (`provider = "postgresql"`), connect via production `DATABASE_URL` with connection pooling, and migrate file-backed stores (Decisions, Council Deliberations, Conversations, Personal Memories) once Founder approves Phase 2.3B architecture and selects hosting infrastructure.
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
