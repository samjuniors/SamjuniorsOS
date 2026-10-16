# ROADMAP.md — SamJuniorsOS Phases
**Status:** Current-state status updated 2026-10-16; historical sections may retain their original baseline dates. This file separates FOUNDATION / NEXT / LATER so scope cannot silently expand.

**CURRENT STATUS:**
- 2026-10-16: SAM-5 (SamJuniorsOS Repository & Project Reconciliation) accepted: reconciliation committed directly to `main` at `1c86599` (parent `aed87ba`; no PR was created or merged for that commit), followed by documentation hygiene PR #17 merged at `b8607f7`. Repository-state documentation was reconciled, the Phase 2.3A audit report restored on `main`, relative links fixed, and deployment-report backup custody qualified.
- 2026-10-15: Phase 2.3B (Persistence Authority & Production Architecture Design) completed and merged to `main` via [PR #16](https://github.com/samjuniors/SamJuniorsOS/pull/16), merge commit `b8afe455086ab044088079ef9081dd476bc457d6`; design baseline approved by Founder in commit `7c04463`. Founder-approved design baseline; implementation is NOT authorized.
- 2026-10-15: Phase 2.3A (Company Brain Authority & Persistence Audit and Deployment Verification) completed. The audit report is documented in [`docs/architecture/PHASE_2_3A_COMPANY_BRAIN_AUTHORITY_AUDIT.md`](../docs/architecture/PHASE_2_3A_COMPANY_BRAIN_AUTHORITY_AUDIT.md); the deployment-verification supporting report is preserved on local backup branch `backup/phase-2.3a-deployment-verification`; that branch was not found among the repository's remote branches during this review, so remote backup availability is NOT VERIFIED and the report is not part of `main`.
- 2026-10-14: Phase 2.2.2 (Bounded Executive Council Deliberation) completed and merged to `main` (commit `edca06919b17eaa6737afba23b140b8abb3a82e5`).
- 2026-10-14: PR #10 merged to `main` (merge commit `7fd66bf06fd79596d0e606872ec1cbdb7e2dcf42`), completing Issue #9 post-merge M2/Decision stabilization.
- PR #8 remains the integration point for M2 Persistence/Recovery and Decision Workflow Phases 2.1, 2.1.1, and 2.2.1.
- M1 memory source-of-truth work remains merged to `main` at `dd2c3c2bfb0bc5f9ea846dcd6a9410e7c840ff80`.

**PROPOSED NEXT PHASE:**
- Proposed First-Release Direction: [Founder Operating Loop Product Definition and v1 Release Strategy](https://linear.app/samjuniors/document/founder-operating-loop-product-definition-and-v1-release-strategy-6f29b0c955b3) (active proposal awaiting Founder formal ratification).
- Phase 2.3C — Persistence Authority & Database Migration Execution (proposed only; strictly gated by Founder infrastructure decisions and explicit implementation authorization).

**NEXT ACTION:**
Founder to formally review/ratify the Founder Operating Loop proposal and separately resolve the hosting model, RPO/RTO, backup retention, recovery requirements, and budget before considering Phase 2.3C. Phase 2.3C remains proposed and unauthorized; no production deployment, runtime schema changes, or migration execution is authorized. No production deployment, runtime schema changes, or migration execution is authorized by the Phase 2.3B design approval.

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

**Test Verification Status:** Core foundation suites were re-verified locally on Node.js v24.20.0 during SAM-5 reconciliation (35/35 council deliberation tests, 15/15 decision context tests, 4/4 production response path regression tests, 9/9 graph read model tests passing; eslint exited code 0). This verifies local single-instance runtime correctness under SQLite; it does NOT imply multi-instance production verification or cloud deployment verification. Production multi-instance database authority remains pending Phase 2.3C.

## NEXT (build once FOUNDATION is real, before LATER)

- Founder Operating Loop release alignment: Formal Founder review and ratification of the proposed first-release direction ([Founder Operating Loop Product Definition and v1 Release Strategy](https://linear.app/samjuniors/document/founder-operating-loop-product-definition-and-v1-release-strategy-6f29b0c955b3)).
- Full relational persistence (Phase 2.3C): Transition Prisma datasource from SQLite (`provider = "sqlite"`) to PostgreSQL (`provider = "postgresql"`), connect via production `DATABASE_URL` with connection pooling, and migrate file-backed stores (Decisions, Council Deliberations, Conversations, Personal Memories) once Founder decides hosting infrastructure and authorizes Phase 2.3C implementation (Phase 2.3B design baseline approved in commit `7c04463`).
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
