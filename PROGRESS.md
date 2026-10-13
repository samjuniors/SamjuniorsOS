# PROGRESS.md — Running Ledger

> Written to continuously during work, not just at session end. This file — not chat history — is the source of truth for what's done, what's in progress, and what's next. Chat disappears on a cleared context; this doesn't.

## Now
M1 Batch 3: Verification & Recovery Acceptance COMPLETE on `audit/m1-memory-source-of-truth`.
- Full verification and recovery acceptance completed across Tasks 1–5 in dedicated isolated test environment:
  1. **Verified Test Coverage (Deterministic Assertions):** Core runner-agnostic M1 suites pass **90/90** assertions under both Node.js (`npx tsx`) and Bun (`bun`) runtimes (`m1_batch1_memory_authority`: 7/7, `m1_canonical_state_authority`: 7/7, `m1_batch2_conversation_deletion`: 52/52, `m1_batch3_verification_recovery`: 24/24). Adjacent runner-agnostic suites pass: `m0_idempotency_expiry` (7/7), `m3_authority_hardening` (7/7), `m52_retrieval_hygiene` (25/25).
  2. **Test Runner Distinction Documented:** Legacy child-process restart suites (`m3_conversation_convergence`: 14/14, `k2_personal_memory`: 19/19) require Bun due to hardcoded `Bun.spawn` calls. `m2_knowledge_persistence` (6/8) fails child JSON parsing under default `.env.local` because `prisma/db` is unseeded on disk, but passes 100% in isolated authoritative SQLite mode (test 8).
  3. **Type Validation:** Validated independently via `tsc --noEmit`. Resolved all 7 `NODE_ENV` reassignment errors in `m1_batch1_memory_authority.test.ts`. Zero TypeScript compiler errors in persistence, conversation store, reconciliation runbook, and all M1 test suites (`m1_batch1`, `m1_batch2`, `m1_batch3`).
  4. **Corruption Handling Attacks:** Validated for both `conversation_tombstones` and `message_tombstones` across invalid JSON, empty file, missing initialized ledger, missing marker, quarantine rename failure, read permission failure, interrupted writes, and recovery after quarantine. Proved zero operations interpret unknown ledger as empty.
  5. **Prisma Fallback Verification:** Confirmed corrupt or missing initialized conversation tombstone strictly blocks Prisma fallback in `getConversation`; corrupt message tombstone ledger blocks message recreation; DB outages leave tombstones pending (`prismaReconciled = false`); only canonical `P2025` is classified as confirmed absence.
  6. **Controlled Backup & Restore:** Procedure designed, documented, and verified end-to-end in dedicated temporary test environment with SHA-256 manifest integrity, matching ledger/marker pairs, quarantine evidence preservation, reconciliation sweep, deleted conversation non-resurrection/non-recreation, and active conversation accessibility.
  7. **Race & Failure Testing:** Verified concurrent deletion serialization, concurrent message write vs delete, lock timeouts, crashes between tombstone write and purge, crashes during Prisma reconciliation, and recovery crashes.
- **Coverage Distinctions & Boundaries Documented:**
  - *Verified Automated Tests:* All application logic, quarantine rename behavior, fail-closed read guards, marker auto-seeding, and serialization invariants.
  - *Simulated Crash Coverage:* Atomic write interruptions (`renameSync` I/O throw), crash windows between tombstone write and purge, and DB outage during reconciliation.
  - *Unverified Scenarios:* Hardware power-loss, kernel page-cache drops, OS-level SIGKILL during system calls, and physical storage bit-rot remain explicitly unverified.
  - *Backup/Restore Limitations:* Automated sequential copy tests integrity and logic only; operational production backups require quiesced writers or storage-level crash-consistent snapshots.
- Branch remains unmerged and undeployed. Stopped for Founder review.

## Next (queued, in order)
- Founder review of M1 Batch 3 verification evidence before any merge or deployment.
- Epistemic Governance (Deferred per Founder directive): Epistemic redaction and KMS cryptographic erasure.
- Deferred: Batch 4 / M6 Authoritative Database Migration to PostgreSQL once multi-instance deployment decision is finalized.

## Completed
- [2026-10-13] M1 Blockers Resolved & Acceptance Verified — Fixed all 7 TS2540/TS2704 errors in `m1_batch1_memory_authority.test.ts` (0 errors in `tsc --noEmit` across all M1 code and test suites). Re-verified core M1 suites: 90/90 assertions passing under both Node.js (`npx tsx`) and Bun (`bun`). Documented test-runner divergence between runner-neutral M1 suites and legacy `Bun.spawn` suites. Verified critical collection corruption fail-closed behavior, quarantine archiving, initialization markers, strict mutation enforcement, Prisma fallback shielding, and controlled backup/restoration runbook. Branch unmerged and undeployed, stopped for Founder review.
- [2026-10-12] M1 Batch 2.2 Final Hardening — Hardened `scripts/reconcile-tombstones.ts` with non-zero exit codes (1) on pending work or local cleanup failures; extended fail-closed locking options (`{ lockStrict: true }`) to conversation tombstones and conversation deletion; tightened `isPrismaRecordNotFoundError` to reject connection errors and generic fragments; 45/45 tests passing.
- [2026-10-12] M1 Batch 2.1 Implementation & Verification — Hardened conversation deletion: serialized message writes on collection lock, synchronous critical-section rechecks, corrected Prisma reconciliation, fail-closed lock timeouts, individual message replay prevention via deletion markers. 34/34 tests passing.
- [2026-10-12] M1 Batch 2 Implementation & Verification — Implemented `ConversationStore.deleteConversation`, `ConversationStore.deleteMessage`, `isTombstoned`, `getTombstone`, `reconcileAllTombstones`, and anti-recreation guards. Added REST endpoints `DELETE /api/conversation`, `DELETE /api/conversation/message`, `DELETE /api/agent-chat` (alias) and `GET /api/conversation`. Implemented Write-Ahead Tombstone architecture preventing resurrection from Prisma mirrors. 24/24 isolated tests passing (`tests/sophia/m1_batch2_conversation_deletion.test.ts`). Zero regressions (Batch 1 7/7, Canonical State 7/7, M3 7/7).
- [2026-10-12] M1 Batch 2 Design & Architecture — Formulated comprehensive 12-class Retention and Forget Governance policy matrix, designed fail-closed conversation & message cascade deletion architecture, conducted graph integrity evaluation (proving physical deletion of CanonicalFacts breaks FactLineage DAGs and AS_OF reads; specifying content tombstoning and analyzing KMS envelope encryption), established API security contracts (`DELETE /api/conversation`, `DELETE /api/conversation/message`), and created isolated test plan. Updated `docs/research/M1_MEMORY_SOURCE_OF_TRUTH_AUDIT.md`.
- [2026-10-12] M1 Batch 1 Implementation & Verification — Reconciled `DATABASE_MODE` parser and `.env.example` template (M1-F11); fixed `CompanyMemoryStore.queryMemories` to score authoritative DB candidates in auth mode (M1-F02); enforced strict local persistence and error propagation via `saveItemStrict` in `CompanyMemoryStore.recordMemory` (M1-F03). 7/7 new test assertions passed (`m1_batch1_memory_authority.test.ts`). Total 115 passing assertions.
- [2026-10-12] M1 Memory Source-of-Truth & Persistence Audit — Completed comprehensive audit across Tasks A through E: memory ownership matrix, context assembly pipeline trace, retention/deletion dependency map, 4-tier persistence failure analysis, database configuration audit, and test suite verification (108 assertions passing). Identified confirmed defects M1-F01 through M1-F11. Recorded in `docs/research/M1_MEMORY_SOURCE_OF_TRUTH_AUDIT.md` and `WORKLOG.md`.
- [2026-09-21] Architecture Source-of-Truth Update — established `AGENTS.md`, `ARCHITECTURE.md`, and `docs/architecture/ADR-001-realtime-sophia-interface.md`. Aligned product boundaries, core principles, 24/7 operating model, realtime interface doctrine, graph read-model authority, security invariants, and failure recovery.
- [2026-09-17] Phase 4C-B Streaming STT Adapter — implemented provider-neutral STT architecture (`STTProvider`), Deepgram Flux streaming adapter (`DeepgramFluxProvider`), 80ms audio aggregation, 128ms client pre-roll ring buffer, turn finalization idempotency, and unified cognitive ingress (`executeSophiaTurn`). 58/58 test assertions passing.
- [2026-09-16] Phase 4B Client VAD & Audio Ingress (commit `6a01bb2`) — implemented AudioWorklet 16kHz PCM resampler, deterministic Silero VAD acoustic heuristic, PTT audio gating, binary frame streaming, and server frame validation. 42/42 assertions passing.
- [2026-09-16] Phase 4A Companion Live Session Foundation (commit `ee64dcb`) — implemented companion WebSocket server on port 3001, ephemeral single-use ticket auth (`/api/auth/ws-ticket`), single-tenant connection locking, PTT state framing, and 60-second session resume window. 27/27 assertions passing.
- [2026-09-15] Phase 3.1 Conversation Persistence Closure (commit `2732f2c`) — implemented durable multi-turn `ConversationStore` and chat message persistence. 15/15 assertions passing.
- [2026-09-14] Canonical Visual Language & Workflow Components (commits `77621d1`, `0312d7a`) — replaced legacy workflow styling with Canonical Visual Language, canonical node primitives, and BrandLogos.
- [2026-09-13] Phase 4.5 Spatial Depth & Specimen Instrumentation (commit `59df2b0`) — quantized depth of field, spring camera, comet trail refinement, and laboratory specimens.
- [2026-09-12] Phase 4.4A–E Automation, Epistemic & Activity Projections (commits `df3cb2b`, `eaacc0f`, `62c7da9`) — implemented `SchedulerHeartbeat`, per-occurrence approval binding, server-authoritative Activity projection (`/api/activity`), and epistemic closing loop with evidence lineage.
- [2026-09-11] Phase 3.4 Real Runtime Wiring (commit `d92e8d8`) — wired root UI to real backend endpoints (`/api/orchestrate`, `/api/agent-chat`, `/api/agents/runs`, `/api/workflow/approvals`), eliminating simulated responses and fake progress.
- [2026-09-07] Review & polish pass (commit `f73526f`) — fixed missing window title icons for messages/advisor, removed fabricated data badges (86% Margin, customer count 12), added prefers-reduced-motion a11y support, fixed z-index monotonic growth, committed previous session's unstaged fixes (AgentAvatar import, persona store re-export, openApp type widening, MessagesApp persona simplification). Build passes cleanly.
- [2026-09-07] Codebase audit & PRODUCT.md — audited 28-commit codebase, filled PRODUCT.md from code evidence. Build passes cleanly. All 13 apps, 14 OS components, 6 API route groups, 5 stores, 7 type definition files verified present.
- [pre-session] Full OS shell — window management, dock, top bar, spotlight, control center, calendar modal, notifications, context menus, voice calling
- [pre-session] All 13 app components built (Workforce, Advisor, Company, Customers, Research, Products, Finance, Settings, Terminal, Notes, Messages, PersonaConfig, SkillExplorer)
- [pre-session] Company HQ dashboard with 13 sub-components
- [pre-session] Backend API routes: advisor, agent-chat, agent-collab, orchestrate, communication (6 endpoints), workflow (5 endpoints)
- [pre-session] Collaboration store (32KB), governance store, notification center, persona store, system activity store
- [pre-session] Agent persona system with customizable archetypes and tones
- [pre-session] Voice calling interface
- [pre-session] Multi-agent collaboration workflows with authorization gate

## Audit Log
- [2026-09-07] Build audit — `next build` passes cleanly. 20 routes (1 static page, 1 not-found, 16 dynamic API routes, 2 static). No type errors. First Load JS: 326 kB for main page.
- [2026-09-07] Code quality audit — found 6 issues: 2 missing icon cases, 2 fabricated data badges, 1 a11y gap, 1 z-index growth bug. All fixed in commit `f73526f`.

## Blocked / Needs Founder Decision
- PRODUCT.md open questions (see file) — non-blocking for current work

## Notes for next session
- PRODUCT.md and other doc files (.claude/, CAPABILITY_REGISTRY.md, CLAUDE.md, CONTINUE.md) are still untracked in git. Commit when ready to version-control the project docs.
- The project uses `bun.lock` alongside `package-lock.json` — unclear which package manager is canonical. Should pick one.
- `.env.local` exists with Gemini API keys (922 bytes, same as `.env.example`).
- 6 subagents exist in `.claude/agents/`: architecture-reviewer, design-critic, production-hardening-reviewer, progress-auditor, qa-reviewer, security-reviewer.
- Browser automation (Playwright) failed to launch — visual verification must be done manually by the founder.


## 2026-10-12 — M1 kickoff
- Created `audit/m1-memory-source-of-truth` from current `main`.
- Added `docs/research/M1_MEMORY_SOURCE_OF_TRUTH_AUDIT.md` with initial taxonomy, persistence matrix, source findings, risks and remaining checklist.
- Confirmed Personal Mind and ConversationStore remain file-primary; CompanyMemory authoritative retrieval has a cache-path discrepancy; DurableFileStore lock timeout and corrupt-read semantics need explicit treatment.
- Source inspection only. No runtime changes; tests/build/database behavior NOT VERIFIED.
- Next: finish EpistemicClaimStore and CompanyStateStore method-level audit, then trace deletion/retention paths.

- [2026-10-12] M1 second source pass — completed source-level method matrix for EpistemicClaimStore and CompanyStateStore; added findings M1-F08 through M1-F11. Runtime behavior and deployed config remain NOT VERIFIED.


## 2026-10-13 — M1 Batch 3 Verification & Acceptance Complete
- Added fail-closed corruption handling for `conversation_tombstones` and `message_tombstones`, quarantine archiving, initialization markers, strict mutation requirements, and CLI diagnostics.
- Corrected the Batch 2.2 Prisma classifier discrepancy: only canonical `P2025` is accepted; message-only phrases are rejected.
- Executed and verified Batch 3 corruption attacks, Prisma fallback guards, and controlled backup/restore in dedicated isolated test environment (`tests/sophia/m1_batch3_verification_recovery.test.ts` — 24/24 passing).
- Executed full relevant regression suite (146/146 assertions passing) with zero regressions.
- Independent TypeScript validation passed (zero errors in stores, runbooks, and test suites).
- Documented explicit engineering distinctions between verified test coverage, simulated fault coverage, unverified hardware/kernel crashes, and backup quiesce requirements.
- Branch remains unmerged and undeployed, stopped for Founder review.