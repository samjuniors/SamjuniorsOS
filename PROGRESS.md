# PROGRESS.md — Running Ledger

> Written continuously during work. This file is the repository ledger for implementation status and next actions.

## Milestone M0 — Baseline Ready (CLOSED)

- **Status:** CLOSED on 2026-10-22 (9/9 steps complete, founder accepted with `ack/MS-M0.json`).
- **Steps Verified & Closed:** G0.1, G0.4, G0.5, G1.1, G1.2, G1.3, G1.4, G1.5, G1.6.
- **Capabilities Delivered:**
  - One-command canonical test runner (`scripts/test-runner.mjs`, `npm test`) running 71 suites with clean failure handling.
  - Full-history secret scan with zero live leaks via Gitleaks v8.21.2 (`npm run scan:secrets`).
  - Full CI workflow `.github/workflows/ci.yml` covering install, lint, typecheck, build, test, and security scan on all PRs and pushes.
  - Reconciled documentation with running code, cross-platform install compatibility (`@next/swc-win32-x64-msvc` made optional), and honest offline fallback badges in UI and API contracts.

## Now — Product Kit & Active Milestone M1 (First Sofia you can talk to)

**Baseline:** `main` at commit `05552e2` incorporating product kit (`.agent/product-kit/`, 17 gates, 116 steps, 12 milestones) and target-state architecture specs; integration branch `kit/integration`.

- **Completed Steps:**
  - `G0.1`: Product boundary recorded (internal company OS, single-founder, scalable later).
  - `G0.4`: Sophia Vance identity & COO title retained.
  - `G0.5`: Independent fact-check of decision briefs completed and verified (`.agent/product-kit/handoffs/G0.5.verify.md` PASS).
  - `G1.1`: Canonical test runner implemented (`scripts/test-runner.mjs`) and wired in `package.json` (`npm test`). Discovers all 71 suites; 56 Node suites pass clean (exit code 0); 15 Bun-divergent suites listed with exact reasons per runner divergence; non-zero exit verified on deliberate failure (`.agent/product-kit/handoffs/G1.1.verify.md` PASS).
  - `G1.3`: Full-history secret scan performed via Gitleaks v8.21.2 over 471 commits; 0 live or unrevoked secrets; all 43 unique token occurrences classified (13 synthetic test fixtures, 2 storage keys, 26 idempotency UUIDs, 2 benchmark IDs) in `docs/security/SECRET_SCAN_REPORT.md`; `.gitleaks.toml` allowlist committed; `"scan:secrets"` wired in `package.json` (`.agent/product-kit/handoffs/G1.3.verify.md` PASS).
  - `G1.2`: Comprehensive CI workflow `.github/workflows/ci.yml` authored replacing legacy 4-test workflow; enforces install, Gitleaks secret scan, lint, TypeScript typecheck, Next.js build, and full 71-suite canonical test runner on every PR and push to `main` (`.agent/product-kit/handoffs/G1.2.verify.md` PASS).
  - `G1.4`: Reconciled documentation with code; resolved Prisma `.env` vs Next.js `.env.local` quickstart instruction in `README.md` and `docs/SETUP.md`; corrected multimodal brain copy to distinguish `dev:ws` live streaming from executive `ServerAgentExecutor` (zai); added `test`, `typecheck`, and `scan:secrets` to scripts table; recorded Windows 11 end-to-end verification (`.agent/product-kit/handoffs/G1.4.verify.md` PASS).
  - `G1.5`: Honest fallback reply labeling in API contracts and UI; `/api/agent-chat` and `/api/agent-collab` return `{ liveAi: false, fallback: true, mode: 'deterministic_fallback' }`; `ChatPanel.tsx` renders visible `Offline Fallback` amber badge and distinctive card styling; added `tests/sophia/g1_5_honest_fallback_labeling.test.ts` (8/8 PASS); restored tracked `mini-services/scheduler-heartbeat/index.ts` fixture (`.agent/product-kit/handoffs/G1.5.verify.md` PASS).
  - `G1.6`: Reproducible install across Windows and Linux; moved `@next/swc-win32-x64-msvc` to `optionalDependencies` in `package.json` to prevent `EBADPLATFORM` on non-Windows systems; updated `docs/SETUP.md` with cross-platform instructions; added `tests/sophia/g1_6_reproducible_install.test.ts` (6/6 PASS) (`.agent/product-kit/handoffs/G1.6.verify.md` PASS).
  - `G3.1`: Closed two open auth gaps; enforced strict `ALLOWED_FOUNDER_IDENTITIES` allowlist in `gate.ts` across `decideApproval`, `revokeApproval` (eliminating `prohibitedRoles` blocklist), and `resolveInterruptedOperation` (eliminating prefix match); documented live Clerk credentials (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) in `.env.example`; expanded `EXECUTIVE_API_PATTERNS` in `proxy.ts` to fail closed (401) on unauthenticated or role-override requests in production; added `tests/sophia/g3_1_auth_gaps.test.ts` (16/16 PASS) (`.agent/product-kit/handoffs/G3.1.verify.md` PASS).
  - `G3.2`: Authored comprehensive canonical threat model against current OWASP Top 10 for Agentic Applications (ASI01–ASI10, Dec 2025) and OWASP LLM Top 10 (2026 Edition) in `docs/security/OWASP_AGENTIC_AND_LLM_THREAT_MODEL.md`; aligned natively with OWASP Agent Control Standard (ACS v0.1 preview) Guardian architecture; mapped all 20 threat categories to active repository code (`gate.ts`, `policy-evaluator.ts`, `payload-binding.ts`, `net.ts`, `authority-content-guard.ts`, `runtime.ts`), verified test suites, or explicit Accepted Risks (`AR-01` through `AR-04`); implemented automated validation test suite `tests/sophia/g3_2_threat_model.test.ts` (7/7 PASS) (`.agent/product-kit/handoffs/G3.2.verify.md` PASS).
  - `G3.3`: Added comprehensive untrusted-ingress automated regression suite across all four channels (transcripts, webhooks, tool outputs, screen text) in `tests/sophia/g3_3_untrusted_ingress.test.ts` (9/9 PASS); proved direct and laundered prompt injections, unsigned/signed webhook payloads, tampered tool arguments, and forged visual screen approval certificates cannot bypass `SideEffectAuthorizationGate` or trigger side effects without Founder approval (`.agent/product-kit/handoffs/G3.3.verify.md` PASS).
  - `G2.7`: Authored canonical ADR 0006 on scale-later seams (`doc/adr/0006-scale-later-seams.md` and `docs/architecture/ADR-006-scale-later-seams.md`); completed comprehensive checklist of all 23 Prisma models and 16 server stores; verified Personal Mind is owner-scoped (`founderId`) and Company Brain is company-scoped (`organizationId`); filed finding `.agent/product-kit/findings/G2.7-owner-scoping-gaps.md`; enforced strict single-founder focus with zero multi-founder features built in code (`.agent/product-kit/handoffs/G2.7.verify.md` PASS).
- **Gate G1 Status: 100% COMPLETE (6/6 steps done: G1.1, G1.2, G1.3, G1.4, G1.5, G1.6; acknowledged by Founder).**
- **Gate G2 Status: In Progress (1/7 steps done: G2.7).**
- **Gate G3 Status: In Progress (3/6 steps done: G3.1, G3.2, G3.3).**
- **Awaiting Founder Decisions in Gate G0:**
  - `G0.2` (Founder Operating Loop v1 ratification)
  - `G0.3` (Infrastructure, hosting model, RPO/RTO, backup retention, budget)
  - `G0.6` (First AI employee roles & autonomy ceilings)
  - `G0.7` (Autonomy policy limits, spend caps, kill-switch behavior)
  - `G0.8` (Live conversation provider selection & monthly voice budget)
  - `G0.9` (Initial product ownership)

## Previous — SAM-5: SamJuniorsOS Repository & Project Reconciliation

**Baseline:** `main` at commit `1c86599` (direct reconciliation commit; parent `aed87ba`, incorporating Phase 2.3B PR #16 and subsequent roadmap date refreshes).


- **Linear Task:** SAM-5 (SamJuniorsOS Repository and Project Reconciliation).
- **Integration State:** Reconciliation changes were committed directly and pushed to `main` at commit `1c865991cb861283413b7b721777c0d89910da88` via Git fast-forward (upstream tracking configuration). No Pull Request was opened or merged for `1c86599`. A subsequent documentation hygiene branch was reviewed and merged via PR #17 at `b8607f7`, correcting baseline, backup-custody, and relative-link documentation.
- **Context:** ChatGPT technical lead coordination for workspace audit, documentation reconciliation, and proposal alignment. The Founder retains final authority.
- **Scope:** Documentation-only baseline alignment. Zero feature implementation, zero schema migrations, zero infrastructure changes, zero unapproved merges.

### Reconciliation Highlights
1. **Repository Reality Alignment:**
   - Corrected persistence statements across `PRODUCT.md`, `ROADMAP.md`, `PROGRESS.md`, and `ARCHITECTURE.md` to reflect actual verified code: Prisma SQLite (`provider = "sqlite"`, `file:./db/custom.db`) + atomic `DurableFileStore` (`.data/*.json`). Corrected stale claims of "PostgreSQL dual-layer" to reflect that PostgreSQL is an approved target architecture (Phase 2.3B), pending Phase 2.3C implementation authorization.
   - Identified that `prisma/migrations` does not exist; unversioned `prisma db push` is the active schema synchronization mechanism.
2. **Phase 2.3A Audit & PR #14 Resolution:**
   - Preserved Phase 2.3A audit report at [`docs/architecture/PHASE_2_3A_COMPANY_BRAIN_AUTHORITY_AUDIT.md`](docs/architecture/PHASE_2_3A_COMPANY_BRAIN_AUTHORITY_AUDIT.md), resolving broken references in the merged Phase 2.3B document.
   - Preserved the deployment-verification supporting report on local backup branch `backup/phase-2.3a-deployment-verification`. The branch was not found among the repository's remote branches during this review; the report is therefore not part of `main`, and remote backup availability is NOT VERIFIED.
   - Assessed PR #14 (draft): determined it is superseded in its roadmap/progress changes by PR #16 and commits on `main`. Left unmerged pending Founder review.
3. **Phase 2.3B Approved Baseline:**
   - Confirmed Phase 2.3B architecture specification (`docs/architecture/PHASE_2_3B_PERSISTENCE_AUTHORITY_AND_PRODUCTION_ARCHITECTURE.md`) was merged via PR #16 (`b8afe45`) and approved by Founder (`7c04463`).
   - Confirmed Phase 2.3C (PostgreSQL Foundation) is proposed only and strictly gated behind Founder infrastructure choices (hosting model, database URL, backup retention, recovery requirements).
4. **Founder Operating Loop Proposal Alignment:**
   - Framed the [Founder Operating Loop Product Definition and v1 Release Strategy](https://linear.app/samjuniors/document/founder-operating-loop-product-definition-and-v1-release-strategy-6f29b0c955b3) as the proposed first-release direction.
   - Preserved all canonical engineering invariants and product boundaries: SamJuniorsOS internal company OS, Sophia COO central intelligence, Founder final authority, closed 4-role workforce (Sophia, Thorne, Lin, Cruz), strict Personal Mind vs. Company Brain boundary, deterministic governance, no duplicate workflow engines, no unrestricted agent swarms, no speculative infrastructure.
5. **Verified Verification Suites:**
   - Re-verified core test suites locally on Node.js v24.20.0:
     - `tests/orchestration/council_deliberation.test.ts`: **35 passed, 0 failed** (100%)
     - `tests/decision/phase2_2_1_context.test.ts`: **15 passed, 0 failed** (100%)
     - `tests/sophia/production_response_path_regression.test.ts`: **4 passed, 0 failed** (100%)
     - `tests/phase4_3a_graph_read_model.test.ts`: **9 passed, 0 failed** (100%)
     - `npm run lint`: **0 errors, 0 warnings** (exit code 0)

**Acceptance:** SAM-5 reconciliation and documentation hygiene accepted; current `main` baseline is `b8607f7` (PR #17). No SAM-5 implementation work remains. **Next:** Founder review/ratification of the Founder Operating Loop proposal and resolution of hosting, recovery, backup-retention, and budget decisions before any separate Phase 2.3C authorization. Zero feature implementation, zero deployments.

## Historical detail — Phase 2.2.1 context integration
Decision Workflow Phase 2.2.1: Decision-Aware Company Context COMPLETE on `audit/m2-persistence-and-recovery`.
- **Phase 2.2.1 Implementation Highlights:**
  - **Authoritative Decision Context Provider (`src/lib/server/decision/context-provider.ts`):**
    - Single entry point `DecisionContextProvider.getInstance().getDecisionContext(options)`.
    - Explicitly partitions all 10 Decision statuses:
      - `activeCommitments`: `approved`, `executing` (binding company commitments).
      - `pendingGovernance`: `proposed`, `under_review`, `pending_approval` (awaiting Founder ratification; not yet active).
      - `interventionRequired`: `intervention_required` (operational execution paused/uncertain).
      - `historicalPrecedents`: `resolved` (relevant precedents only; never active work).
      - `inactiveDecisions`: `rejected`, `withdrawn`, `superseded` (strictly excluded from active commitments).
    - Preserves all typed fields: `decisionId`, `title`, `problemStatement`, `proposedAction`, `category`, `accountableOwner`, `status`, `impact`, `reversibility`, `uncertainty`, `evidenceFactIds`, `linkedWorkflowId`, transitions, and supersession links.
    - Lightweight deterministic conflict detection: detects unconfirmed predecessor executions (`unconfirmed_predecessor_execution`), superseded predecessor uncertainties, and superseded references (`superseded_reference`).
    - Formatters for Sophia (`formatForSophiaContext`) and Specialist Agents (`formatForSpecialistContext`).
  - **CompanyStateStore Integration (`src/lib/server/state/state-store.ts`):**
    - Updated `queryState()` Section 5 (Governance Decisions) to retrieve authoritative decisions from `DecisionContextProvider`.
    - Mapped active commitments, pending proposals, and interventions to `current_truth`.
    - Mapped resolved decisions to `historical_memory` with source system `decision_store`.
    - Surfaced deterministic governance conflict warnings directly into query results.
    - Eliminated silent fallback to legacy mock decision arrays.
    - Added automatic migration of legacy `company_state` decisions into `DecisionStore` on startup in `store.ts`.
  - **Sophia Context Assembler Integration (`src/lib/server/sophia/context-assembly.ts`):**
    - Updated Slice 1 (Company Operational State) to query and render structured decision context from `DecisionContextProvider`.
    - Preserved `Decision [${id}]` query-matching and temporal window gating invariants.
  - **Specialist & Employee Role Integration (`src/lib/server/context/company-context.ts`, `src/lib/server/context/context-assembly.ts`):**
    - Updated `CompanyContextProvider.formatForAdvisorPrompt` to partition active commitments, pending governance, and resolved historical precedents.
    - Added decision-awareness governance block in `formatForEmployeeRoleContext` for COO, PM, Research, and Finance roles.
    - Updated `ContextAssemblyService.assembleContextForTask` to respect `historical_memory` provenance from `queryState`.
- **Verification Suites Executed:**
  - `tests/decision/phase2_2_1_context.test.ts`: **12 PASSED, 0 FAILED**
  - `tests/decision/decision_lifecycle.test.ts`: **18 PASSED, 0 FAILED**
  - `tests/decision/phase2_1_1_hardening.test.ts`: **10 PASSED, 0 FAILED**
  - `tests/sophia/m52_retrieval_hygiene.test.ts`: **25 PASSED, 0 FAILED**
  - `tests/sophia/m53_dependency_relations.test.ts`: **25 PASSED, 0 FAILED**
  - `tests/sophia/m2_batch3_recovery_gate.test.ts`: **6 PASSED, 0 FAILED**
  - `tests/sophia/m2_batch3_concurrency_hygiene.test.ts`: **8 PASSED, 0 FAILED**
  - **Grand Total Across Targeted Suites: 104 PASSED, 0 FAILED.**
- **Production Build:**
  - `npm run build` compiled successfully in 18.3s, generating 31/31 static routes with exit code 0.
- **Hygiene Confirmation:**
  - Single-instance architecture preserved.
  - Zero merges, commits, pushes, or deployments performed.
  - Stopped for Founder review.

## Completed
- [2026-10-15] Phase 2.3B: Persistence Authority & Production Architecture Design — Completed comprehensive 17-section architecture specification ([`docs/architecture/PHASE_2_3B_PERSISTENCE_AUTHORITY_AND_PRODUCTION_ARCHITECTURE.md`](docs/architecture/PHASE_2_3B_PERSISTENCE_AUTHORITY_AND_PRODUCTION_ARCHITECTURE.md)). Merged to `main` via PR #16 (merge commit `b8afe455086ab044088079ef9081dd476bc457d6`); design baseline approved by Founder in commit `7c04463`. Establishes target domain contracts, independent data matrix, concurrency requirements, outbox/inbox reliability patterns, enforceable write freeze, provider-neutral durable buffering, and pre/post-write external side-effect rollback architecture. Implementation of Phase 2.3C is NOT authorized; gated behind Founder infrastructure choices.
- [2026-10-15] Phase 2.3A: Company Brain Authority & Persistence Audit — Audited store authority across all domains, verified that SQLite is the active datasource in `prisma/schema.prisma` with atomic `DurableFileStore` (`.data/*.json`), verified absence of external cloud manifests in repository, and recorded findings in [`docs/architecture/PHASE_2_3A_COMPANY_BRAIN_AUTHORITY_AUDIT.md`](docs/architecture/PHASE_2_3A_COMPANY_BRAIN_AUTHORITY_AUDIT.md). Assessed PR #14 (draft) and preserved supporting deployment report on dedicated backup branch.
- [2026-10-14] Phase 2.2.2: Bounded Executive Council Deliberation — Completed bounded multi-agent council deliberation (`ExecutiveCouncilEngine`) among Dr. Aris Thorne (researcher), Maya Lin (pm), and Julian Cruz (finance) supervised by Sophia Vance (coo), with sovereign deterministic verification by `ConstitutionalVerifier` (margin floor >= 80% calculation, fail-closed lease recovery, cryptographic review caching). Merged to `main` at commit `edca06919b17eaa6737afba23b140b8abb3a82e5`. 35-test comprehensive deterministic suite (`tests/orchestration/council_deliberation.test.ts`, 35/35 passing).
- [2026-10-13] Decision Workflow Phase 2.2.1: Decision-Aware Company Context — Connected authoritative `DecisionStore` into company intelligence and context-assembly architecture (`DecisionContextProvider`, `SophiaContextAssembler`, `CompanyStateStore.queryState`, `CompanyContextProvider`, `ContextAssemblyService`). Partitioned all 10 Decision statuses: active commitments (`approved`, `executing`), pending governance (`proposed`, `under_review`, `pending_approval`), interventions (`intervention_required`), historical precedents (`resolved` with `historical_memory` provenance), and inactive decisions (`rejected`, `withdrawn`, `superseded`). Implemented deterministic conflict detection (`unconfirmed_predecessor_execution`, `superseded_reference`). Added 12-test comprehensive suite `tests/decision/phase2_2_1_context.test.ts` (12/12 passed). All regression suites passed (104/104). Production build succeeded (31/31 routes, exit code 0). Stopped for Founder review.
- [2026-10-13] Decision Workflow Phase 2.1.1: Decision Safety Hardening — Closed verified Phase 2.1 gaps (F-01, F-02, F-03, F-04). Hardened lifecycle authorization for `resolveDecision()` and `supersedeDecision()`. Defined separate permissions for Founder governance, trusted workflow execution reports, and operational intervention. Enforced execution-aware supersession via `WorkflowRuntime.requestInstanceCancellation()`, distinguishing requested vs confirmed cancellation and blocking conflicting successor execution. Implemented idempotent audit trail reconciliation using deterministic `audit-dec-${transition.transitionId}` IDs. 10 focused hardening tests in `tests/decision/phase2_1_1_hardening.test.ts` (10/10 passed). Full regression suite (191/191 passed). Production build succeeded (exit code 0). Stopped for Founder review.
- [2026-10-13] Decision Workflow Phase 2.1: Core Decision Store and Lifecycle Foundation — Implemented `DecisionRecord` types (`src/types/decision.ts`), `DecisionStore` (`src/lib/server/decision/store.ts`), `DecisionLifecycleService` (`src/lib/server/decision/lifecycle.ts`), cryptographic approval binding (`src/lib/server/decision/payload-binding.ts`), legacy adapter (`src/lib/server/decision/adapter.ts`), and `CompanyStateStore` delegation. 18-test deterministic test suite (`tests/decision/decision_lifecycle.test.ts`). 181/181 passing across full suite. Production build succeeded. Stopped for Founder review.
- [2026-10-13] M2.3 Final Recovery Verification Gate — Implemented operation lifecycle recovery and reconciliation in `SideEffectAuthorizationGate` (`listInterruptedOperations`, `reconcileMissingAudit`, `resolveInterruptedOperation`). Failure-injection test suite `m2_batch3_recovery_gate.test.ts` (6/6 passed). Evaluated PID reuse safety in `InstanceConcurrencyGuard`. Full regression suite (163/163 passed). Production build succeeded. Stopped for Founder review.
- [2026-10-13] M2 Batch 2.3: Concurrency Safety & Multi-Store Transaction Hygiene — Full mutation matrix audit, hardened 5 confirmed concurrency defects across approval consumption, idempotency claiming, workflow step claiming, company decision updates, and instance lease recovery. Deterministic test suite `m2_batch3_concurrency_hygiene.test.ts` (8/8 passed). Full regression suite (157/157 passed). Production build succeeded.
- [2026-10-13] M2 Batch 2.2: Cross-Platform Child Test Runner & Restart Recovery — Reconciled test totals (182 core passed, 1 skipped; 228 extended passed, 2 skipped), verified Windows NT / Node.js & Bun environments, production build verified.
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