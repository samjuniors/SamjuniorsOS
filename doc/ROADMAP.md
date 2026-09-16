# ROADMAP.md — SamJuniorsOS Phases
**Status:** Reconciled against repository `32a6f38` (2026-09-08). This file exists because PRODUCT.md and PRODUCT_ARCHITECTURE.md kept accumulating phase information inline — separated out per founder instruction so the FOUNDATION/NEXT/LATER boundary can't be missed or silently expanded.

**CURRENT STATUS:**
- Canonical design system migration completed and verified (ADR 0001).
- Phase 3 & 3.1: Sophia Durable Conversation Persistence SEALED (ADR 0002). Reconciled and verified on GitHub main (`2732f2c`). Server-authoritative conversation sessions, single-instance durable persistence via `DurableFileStore`, verified Prisma schema synchronization, strict Founder ownership, bounded context budgeting, turn-level idempotency replay with concurrency locking verified with 15/15 automated tests passing.
- Phase 4 Architecture APPROVED WITH CORRECTIONS (ADR 0003). Cascaded streaming pipeline over companion Node.js WebSocket process (port 3001), native Flux interruption, and PTT-only scope.
- Phase 4A: Authenticated Companion WebSocket & Live Session Foundation IMPLEMENTED & VERIFIED (ADR 0003). Companion server, session manager, single-tenant connection lock (`4409`), PTT state transitions, barge-in `INTERRUPT` framing, and reconnection verified with 27/27 test assertions passing.
- Phase 4B: Client Silero VAD & Audio Streaming Ingress IMPLEMENTED & VERIFIED (ADR 0003). AudioWorklet resampling to 16 kHz mono Int16 PCM (512 samples / 32ms), client-side Silero VAD, PTT-only audio gating, local assistant audio mute/barge-in hook on speech start, binary WebSocket frame transport, client backpressure protection, and server frame bounds/telemetry validation verified with 42/42 automated test assertions passing.

**NEXT PHASE:**
Phase 4C: Streaming STT Integration (Deepgram Flux STT over companion WebSocket).

**NEXT ACTION:**
STOP condition active. Phase 4B verified and sealed. Await Founder review of Phase 4B closure report before proceeding to Phase 4C. (DO NOT implement STT, Deepgram, TTS, or cloud speech APIs until approved).

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
