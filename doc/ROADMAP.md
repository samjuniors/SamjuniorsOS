# ROADMAP.md — SamJuniorsOS Phases
**Status:** Current-state status updated 2026-10-14; historical sections may retain their original baseline dates. This file separates FOUNDATION / NEXT / LATER so scope cannot silently expand.

**CURRENT STATUS:**
- 2026-10-14: Phase 2.2.2 (Bounded Executive Council Deliberation) completed on branch `phase/2.2.2-council-deliberation` (PR pending review against `main`).
- 2026-10-14: PR #10 merged to `main` (merge commit `7fd66bf06fd79596d0e606872ec1cbdb7e2dcf42`), completing Issue #9 post-merge M2/Decision stabilization. PR #10 changed tests and project documentation; it did not change `src/`.
- PR #8 remains the integration point for M2 Persistence/Recovery and Decision Workflow Phases 2.1, 2.1.1, and 2.2.1.
- M1 memory source-of-truth work remains merged to `main` at `dd2c3c2bfb0bc5f9ea846dcd6a9410e7c840ff80`.
- Issue #11 verified with 208/208 tests passing across council, decision, and M2 regression suites.

**NEXT PHASE:**
Phase 2.3 — Role-Specific Knowledge & Epistemic Brain Integration (or next milestone per Founder direction).

**NEXT ACTION:**
Submit PR for Issue #11 on branch `phase/2.2.2-council-deliberation` against `main` and stop for Founder review. No production deployment or direct commits to `main`.

**Rule that governs this whole file:** nothing moves from a later phase into an earlier one because it seems interesting or because a reference repo does it well. A concept moves up only when the phase before it is actually done and verified against the repository—not merely documented as done.

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
