# ROADMAP.md — SamJuniorsOS Phases
**Status:** Reconciled against repository `8524908` (2026-09-08). This file exists because PRODUCT.md and PRODUCT_ARCHITECTURE.md kept accumulating phase information inline — separated out per founder instruction so the FOUNDATION/NEXT/LATER boundary can't be missed or silently expanded.

**Rule that governs this whole file:** nothing moves from a later phase into an earlier one because it seems interesting or because a reference repo does it well. A concept moves up only when the phase before it is actually done, verified against the repository — not documented as done.

---

## FOUNDATION (v1 — the core execution loop must be trustworthy before anything else matters)

Status as of `8524908` — **partial**, real progress, not complete:

| Item | Status |
|---|---|
| Server-established Founder authority on all privileged routes | PARTIAL — middleware/Clerk structure exists; live credentials unconfirmed, sandbox-mode bypass and gate.ts blocklist gap remain open (PRODUCT_ARCHITECTURE.md §7) |
| Workflow/approval/audit state survives the actual deployment target | PARTIAL — survives in-process restart; does not yet survive Cloud Run container replacement, pending the §0 deployment decision (§6) |
| Approval bound to exact action/target/payload | PARTIAL — hash computation implemented; end-to-end enforcement unconfirmed (§7) |
| Deterministic verification gate rejecting bad artifacts | NOT IMPLEMENTED (§3, §10) |
| Synthetic data never labeled as verified fact | PARTIAL — correct governed pipeline now exists (§11); migration of old code paths onto it unconfirmed |
| Side-effect idempotency / unknown-outcome handling | NOT IMPLEMENTED (§8) |

**Nothing below this line should be started until every row above reads IMPLEMENTED and confirmed, not just PARTIAL.**

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
- pgvector/RAG, E2B sandboxing, fine-tuning/eval infrastructure, broader Composio integrations, voice, multi-agent council workflows.
- Multi-user RBAC and full session-based auth for a second human — only if and when a second human is actually added (PRODUCT.md §1 locks this as internal/single-founder for now).

## Explicit non-goals (not a phase — outside this roadmap entirely unless the founder decision in PRODUCT.md §1 changes)

Commercial SaaS packaging, multi-tenancy, public signup, billing. These aren't "LATER" — they're not on this roadmap at all under the current, locked product boundary.
