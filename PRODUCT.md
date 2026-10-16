# PRODUCT.md — Product Definition
**Status:** Reconciled against the repository working tree (SAM-5 reconciliation committed directly to `main` at commit `1c86599`, 2026-10-16) and founder-locked strategic decisions. Supersedes all prior versions.

---

## 1. What is SamJuniorsOS?

**LOCKED DECISION:** SamJuniorsOS is the internal operating system of SamJuniors, built first to help SamJuniors operate itself as an AI-native company — not a SaaS product for external customers. Commercialization is an explicit open future option (§8) and must not distort current architecture decisions. This replaces the previously-unresolved "internal tool vs. sellable product" question from earlier drafts — the founder has now decided: internal, for now.

It helps the company run itself: manage and ship products, market and sell them, manage customers, revenue, and finances, conduct continuous market research, coordinate AI employees, manage company knowledge/memory, plan and prioritize, execute recurring work, measure outcomes, and keep the founder informed and in control of consequential decisions — while reducing how much of that the founder has to do by hand.

**Core principle:** *SamJuniorsOS should not replace the founder. It should multiply the founder.*

## 2. Who is it for?

Single founder (Sam), operating solo, directing a small set of AI "employees." No second human user exists today. Internal-only per §1 — this is not scoped for other founders to use.

## 3. What problem does it solve?

Two related problems, not one:
1. **Execution legibility:** directing AI agents currently means switching between terminals, chat windows, and ad hoc scripts, with no durable record of what was asked, produced, approved, or what actually happened.
2. **Operating cognitive load:** running a company means continuously observing the market, deciding what matters, executing, measuring results, and learning — today that entire cycle lives in the founder's head. The OS's job is to externalize and support that cycle without removing the founder's authority over it.

## 4. What is the core operating loop?

**This is broader than the original execution loop, per founder direction.** The full company-operating cycle:

```
MARKET / COMPANY SIGNALS → RESEARCH → GOVERNED KNOWLEDGE (Company Brain)
→ COMPANY STATE + MEMORY → STRATEGY / PRIORITIES → AI EMPLOYEES + WORKFLOWS
→ EXECUTION → RESULTS → VERIFICATION → LEARNING → COMPANY MEMORY → NEXT CYCLE
```
Shorthand: **Observe → Understand → Decide → Execute → Measure → Learn → Improve.**

**Proposed First-Release Operating Direction (Founder Operating Loop):**  
The [Founder Operating Loop Product Definition and v1 Release Strategy](https://linear.app/samjuniors/document/founder-operating-loop-product-definition-and-v1-release-strategy-6f29b0c955b3) proposes the first-release operating cycle and company nervous system. This is an active strategic proposal submitted for Founder review; it remains a proposed direction until formally approved by the Founder. It operates strictly within the non-negotiable architectural boundaries:
- SamJuniorsOS is the internal company operating system for SamJuniors.
- Sophia is the Chief Operating Officer and persistent central company intelligence.
- The Founder retains ultimate authority over all consequential decisions and external side effects.
- Specialist roster is strictly bounded to Dr. Aris Thorne (Research), Maya Lin (PM), and Julian Cruz (Finance). No additional AI employees without demonstrated need and Founder approval.
- Employee Role Brains are scoped context projections, never competing company-truth databases.
- The Sophia Personal Mind and SamJuniors Company Brain remain strictly partitioned.
- Authorization, approvals, state transitions, audit, idempotency, and persistence remain deterministic.
- Workflow orchestration architecture must not be duplicated into uncoordinated swarms.
- No speculative infrastructure or unapproved database migrations.

**The near-term execution primitive** — the thing that must work before the broader loop means anything — is implemented as the executive-council protocol:
```
Founder directive → /api/orchestrate → Sophia/COO (understand·plan·verify·review·report)
  → Dr. Aris Thorne/researcher (research·analyze) → Maya Lin/pm (build_execute: PRD)
  → Julian Cruz/finance (test: unit economics) → ConstitutionalVerifier (deterministic, can reject)
  → Founder approval on side effects (SideEffectAuthorizationGate, payload-bound)
  → durable audit (AgentRunStore + audit store) → memory/outcome
```
Evidence (authoritative repository implementation): `lib/server/orchestration/orchestrator.ts` executes all four roles on every directive; `lib/server/agents/definitions.ts` defines the closed four-role union (COO/Sophia, Researcher/Thorne, PM/Maya, Finance/Julian); `.data/agent_runs.json` shows persisted runs for all four roles on a single directive.

**Conflict note (2026-09-11, Phase 3.4; layout updated Phase 4.3C):** earlier versions of this document stated "Sophia + Thorne only" in the v1 critical path and an Executive Cockpit UI. That description is superseded by the implementation above and by the active root UI — the canonical SamJuniorsOS shell (Sophia conversation mode + SamJuniorsOS desktop + operating graph, `src/app/page.tsx` → `src/os/App`). The archived Executive Cockpit and all earlier UI generations live in the inert `/old` archive. This is a component of the larger loop, not a replacement definition of the product. See PRODUCT_ARCHITECTURE.md for how Company Brain, Role Brains, and market intelligence relate to it.

## 5. What is v1?

Unchanged in substance from the prior v1 scope, now explicitly framed as "foundation phase" of the larger loop (see ROADMAP.md), and corrected to match the implemented four-agent council (see §4 conflict note):
- V2 Design1 shell UI (implemented; active root route): Sophia conversation mode (real /api/agent-chat), SamJuniorsOS desktop with the operating graph, founder chat panel.
- All four employed roles participate in the orchestration critical path (implemented: orchestrator runs COO, Researcher, PM, Finance on every directive).
- One typed artifact per directive per specialist, one deterministic verification gate that can actually reject (implemented: ConstitutionalVerifier).
- Founder approval on side effects, gated behind server-established Founder identity — **implemented and wired** (SideEffectAuthorizationGate + payload binding).
- Durable audit trail surviving a restart — **implemented and wired** (AgentRunStore → atomic DurableFileStore + SQLite via Prisma dual-layer; PostgreSQL persistence designed and approved in Phase 2.3B, pending Phase 2.3C implementation).

## 6. What is explicitly deferred?

Unchanged from the prior document, plus the new strategic concepts from §7–§8 below, all of which are **NEXT/LATER, not v1**:
- Maya/Julian's own dedicated workflow surfaces (beyond council participation), Elena Rostova, Marcus Vance.
- Broad integrations beyond GitHub, pgvector, E2B, fine-tuning, multi-user RBAC, voice, council workflows.
- Company Brain (beyond the epistemic pipeline substrate already in progress), Role Brains, employee versioning/evaluation, continuous market intelligence scheduling, organizational learning loops.
- Any commercial/SaaS framing — remains an open future option per §1, never a current design input.

## 7. Company Brain and Role Brains (new architectural concepts, target-state — see PRODUCT_ARCHITECTURE.md for detail)

**Company Brain** is the governed, shared source of company truth: knowledge, verified facts, state, strategic decisions, goals, priorities, historical decisions, institutional memory, market intelligence, and policy — explicitly separated from raw sources, unverified claims, hypotheses, and superseded information. Fabricated/demo data must never be represented as Company Brain truth.

**Role Brains** are per-employee derived context (identity, role-specific knowledge, working memory, experience, skills, development state) built *from* the Company Brain, never a competing source of truth. `ROLE BRAIN ≠ COMPANY TRUTH.`

A real substrate for this (a Source→Signal→Claim→Fact→Memory pipeline) is already under active development in the repository — see PRODUCT_ARCHITECTURE.md §Memory/Knowledge/State Separation for current status.

## 8. AI Employee Development and Self-Improvement (new, LATER phase, not v1)

Employees should improve over time (work → measure → evaluate → identify skill gaps → train/update → test → approve → deploy → measure again → learn), with immutable version history the founder can inspect and roll back.

**Hard safety principle, non-negotiable regardless of implementation phase: self-improving ≠ self-authorizing.** Agents may propose training, workflow improvements, or upgrades; they must never silently grant themselves permissions, change security or financial authority, bypass founder approval, rewrite canonical company facts, deploy untested behavior, or delete historical records. This is an architectural constraint, not a UI feature, and it applies even to future phases that don't exist yet.

## 9. Continuous Market Intelligence (new, NEXT/LATER, not v1)

A future recurring capability, not a generic news feed: tracking competitors, customer behavior, technology/product/pricing/regulatory changes relevant to SamJuniors specifically, through the lifecycle Source → Signal → Claim → Verified Fact → Implication → Recommendation → Decision → Action → Outcome → Learning. Research must feed decisions and actions, not just produce reports. Scheduling/cadence (e.g. a monthly review) is **not** part of this documentation task's scope and is not implemented.

## 10. Success criteria (v1, unchanged)

- A real directive produces a verified-or-rejected artifact, not a silently-accepted one — **implemented (ConstitutionalVerifier can halt the run).**
- A side-effect step cannot be approved without server-verified Founder identity — **implemented and wired.**
- Workflow/audit state survives an application restart — **implemented (atomic DurableFileStore + SQLite via Prisma dual-layer; verified in .data/; PostgreSQL target persistence designed in Phase 2.3B).**
- No data is presented as verified fact unless it actually is — **epistemic pipeline implemented and wired; the UI renders only server-derived execution state (Phase 3.4 runtime wiring).**

## 11. Product boundary

Internal-only (§1). Not a replacement for GitHub/Slack/email/a CRM. Not autonomous — every side effect requires a founder decision. Future commercialization: an explicit, separate, not-yet-made decision — nothing in the current architecture should assume it, and nothing should block it either.

---

## Current Repository State (verified against the working tree, SAM-5 reconciliation at commit `1c86599`, 2026-10-16 — supersedes all earlier repository-state snapshots)

Foundation remediation, the V2 shell, runtime wiring, Decision Workflow (Phases 2.1 & 2.2.1), Executive Council Deliberation (Phase 2.2.2), and Persistence Authority Design (Phase 2.3B) are verified in code or merged architecture:

- **Auth:** IMPLEMENTED + WIRED. Route middleware and server-session derivation strictly enforced. Production (`NODE_ENV === 'production'`) rejects all dev header/cookie bypasses; dev/test in the sandbox deployment resolves a local single-tenant Founder session (documented sandbox adaptation — the upstream remote additionally requires `SAMJUNIORS_DEV_SECRET` in dev). `SideEffectAuthorizationGate.decideApproval` enforces a strict Founder allowlist. Privileged API routes (`/api/orchestrate`, `/api/epistemic`, `/api/agent-chat`, `/api/communication/*`, `/api/workflow/*`, `/api/agents`) strictly enforce authenticated Founder sessions.
- **Persistence & Concurrency:** IMPLEMENTED + WIRED (LOCAL/SANDBOX). Restart durability via atomic `DurableFileStore` (`.data/*.json`) and SQLite via Prisma (`db/custom.db`). Target PostgreSQL relational schema and production persistence architecture are designed and approved in Phase 2.3B (PR #16, commit `b8afe45`), but PostgreSQL is NOT currently connected, provisioned, or active in runtime code. Versioned migrations directory (`prisma/migrations`) does not exist; Prisma uses unversioned `db push`. Single-instance container constraint is guarded by `InstanceConcurrencyGuard` (using local OS process PID checks, effective for single-host runtime only; multi-instance cloud clustering is not yet supported). Audit store append-only immutability guarded in production.
- **Approval-payload binding:** IMPLEMENTED + WIRED. SHA-256 canonical tuple hashing binds Founder approval to execution; fails closed on omitted/tampered payloads.
- **Epistemic/provenance separation (Company Brain substrate):** IMPLEMENTED + WIRED. Source→Signal→Claim→CanonicalFact→Memory pipeline active with strict role separation; legacy synthetic bypasses remediated.
- **Deterministic verification:** IMPLEMENTED + WIRED. `ConstitutionalVerifier.verify()` halts orchestration on invariant violations (margin floor, credential leaks), marking the run `failed` / `verification_rejected`.
- **Workforce:** IMPLEMENTED + WIRED. Closed four-role union (COO/Sophia Vance, Researcher/Dr. Aris Thorne, PM/Maya Lin, Finance/Julian Cruz) in `lib/server/agents/definitions.ts`; exposed to the UI as a read model at `GET /api/agents`.
- **Executive Council Deliberation (Phase 2.2.2):** IMPLEMENTED + WIRED. `ExecutiveCouncilEngine` manages structured, bounded peer review among Dr. Aris Thorne (researcher), Maya Lin (pm), and Julian Cruz (finance) supervised by Sophia Vance (coo), with sovereign deterministic verification by `ConstitutionalVerifier` (including mathematical 80%+ margin floor calculation and fail-closed lease recovery). Deliberation results are persisted to `.data/council_deliberations.json` with cryptographic fingerprint caching. Merged to `main` (commit `edca069`).
- **Decision Ledger & Context (Phase 2.1 & 2.2.1):** IMPLEMENTED + WIRED. Authoritative `DecisionStore` and `DecisionContextProvider` manage all 10 decision lifecycle statuses with deterministic conflict detection and execution-aware supersession. Merged to `main` via PR #8 and PR #10.
- **Runtime wiring (Phase 3.4):** IMPLEMENTED + WIRED. The canonical UI dispatches founder directives to the real `/api/orchestrate` path; conversational chat uses `/api/agent-chat`; execution state (workstreams, agent activity, decisions) is server-authoritative, derived from `/api/agents/runs` and `/api/workflow/approvals` via the client read model (`src/os/lib/runtime.ts`); the operating graph visualizes only that authoritative state; approval decisions route to `POST /api/workflow/approvals`. No simulated responses or fake workflow progress remain in the active UI.
- **Repository structure (Phase 4.3C):** ONE canonical runtime with clear ownership: `src/app` (Next.js shell/routes) · `src/os` (the canonical application) · `src/components` (workflow design-system library + shadcn ui scaffold) · `src/lib` (server orchestration/persistence + shared lib) · `src/types` (GraphDTO + contracts) · `old/` (explicitly inert archive: legacy UI generations, prototypes, media; guarded by tsconfig/eslint/Tailwind boundaries + `scripts/verify-canonical-boundaries.js`). The canonical design/workflow primitives (Phase 4.1 tokens + Phase 4.3C-B.1 execution language) are reused across the UI — no component invents separate visual/state treatments. 19 dead dependencies removed after per-dependency verification.
- **Role Brains, employee versioning, self-improvement governance, market intelligence:** NOT IMPLEMENTED — correctly remain target-state per §7–§9 and strictly preserved out of scope.
