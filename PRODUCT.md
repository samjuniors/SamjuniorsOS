# PRODUCT.md — Product Definition
**Status:** Reconciled against the repository working tree (Phase 3.4 runtime wiring, 2026-09-11) and founder-locked strategic decisions. Supersedes all prior versions.

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

**The near-term execution primitive** — the thing that must work before the broader loop means anything — is implemented as the executive-council protocol:
```
Founder directive → /api/orchestrate → Sophia/COO (understand·plan·verify·review·report)
  → Dr. Aris Thorne/researcher (research·analyze) → Maya Lin/pm (build_execute: PRD)
  → Julian Cruz/finance (test: unit economics) → ConstitutionalVerifier (deterministic, can reject)
  → Founder approval on side effects (SideEffectAuthorizationGate, payload-bound)
  → durable audit (AgentRunStore + audit store) → memory/outcome
```
Evidence (authoritative repository implementation): `lib/server/orchestration/orchestrator.ts` executes all four roles on every directive; `lib/server/agents/definitions.ts` defines the closed four-role union (COO/Sophia, Researcher/Thorne, PM/Maya, Finance/Julian); `.data/agent_runs.json` shows persisted runs for all four roles on a single directive.

**Conflict note (2026-09-11, Phase 3.4):** earlier versions of this document stated "Sophia + Thorne only" in the v1 critical path and an Executive Cockpit UI. That description is superseded by the implementation above and by the active root UI — the V2 Design1 shell (Sophia conversation mode + SamJuniorsOS desktop + operating graph, `src/app/page.tsx` → `Uploaded/Design1/src/App`). The archived Executive Cockpit remains in-tree as inactive reference material. This is a component of the larger loop, not a replacement definition of the product. See PRODUCT_ARCHITECTURE.md for how Company Brain, Role Brains, and market intelligence relate to it.

## 5. What is v1?

Unchanged in substance from the prior v1 scope, now explicitly framed as "foundation phase" of the larger loop (see ROADMAP.md), and corrected to match the implemented four-agent council (see §4 conflict note):
- V2 Design1 shell UI (implemented; active root route): Sophia conversation mode (real /api/agent-chat), SamJuniorsOS desktop with the operating graph, founder chat panel.
- All four employed roles participate in the orchestration critical path (implemented: orchestrator runs COO, Researcher, PM, Finance on every directive).
- One typed artifact per directive per specialist, one deterministic verification gate that can actually reject (implemented: ConstitutionalVerifier).
- Founder approval on side effects, gated behind server-established Founder identity — **implemented and wired** (SideEffectAuthorizationGate + payload binding).
- Durable audit trail surviving a restart — **implemented and wired** (AgentRunStore → DurableFileStore/PostgreSQL dual-layer).

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
- Workflow/audit state survives an application restart — **implemented (durable file + PostgreSQL dual-layer; verified in .data/).**
- No data is presented as verified fact unless it actually is — **epistemic pipeline implemented and wired; the UI renders only server-derived execution state (Phase 3.4 runtime wiring).**

## 11. Product boundary

Internal-only (§1). Not a replacement for GitHub/Slack/email/a CRM. Not autonomous — every side effect requires a founder decision. Future commercialization: an explicit, separate, not-yet-made decision — nothing in the current architecture should assume it, and nothing should block it either.

---

## Current Repository State (verified against the working tree, Phase 3.4 runtime wiring, 2026-09-11 — supersedes all earlier repository-state snapshots)

Foundation remediation, the V2 shell, and runtime wiring are complete and verified. Status below uses IMPLEMENTED + WIRED / IMPLEMENTED + ISOLATED / PARTIAL / NOT IMPLEMENTED precisely:

- **Auth:** IMPLEMENTED + WIRED. Route middleware and server-session derivation strictly enforced. Production (`NODE_ENV === 'production'`) rejects all dev header/cookie bypasses; dev/test in the sandbox deployment resolves a local single-tenant Founder session (documented sandbox adaptation — the upstream remote additionally requires `SAMJUNIORS_DEV_SECRET` in dev). `SideEffectAuthorizationGate.decideApproval` enforces a strict Founder allowlist. Privileged API routes (`/api/orchestrate`, `/api/epistemic`, `/api/agent-chat`, `/api/communication/*`, `/api/workflow/*`, `/api/agents`) strictly enforce authenticated Founder sessions.
- **Persistence & Concurrency:** IMPLEMENTED + WIRED. Restart durability via atomic `DurableFileStore` + PostgreSQL dual-layer (verified: `.data/agent_runs.json` retains real council runs across restarts). Single-instance constraint guarded by `InstanceConcurrencyGuard`. Audit store append-only immutability guarded in production.
- **Approval-payload binding:** IMPLEMENTED + WIRED. SHA-256 canonical tuple hashing binds Founder approval to execution; fails closed on omitted/tampered payloads.
- **Epistemic/provenance separation (Company Brain substrate):** IMPLEMENTED + WIRED. Source→Signal→Claim→CanonicalFact→Memory pipeline active with strict role separation; legacy synthetic bypasses remediated.
- **Deterministic verification:** IMPLEMENTED + WIRED. `ConstitutionalVerifier.verify()` halts orchestration on invariant violations (margin floor, credential leaks), marking the run `failed` / `verification_rejected`.
- **Workforce:** IMPLEMENTED + WIRED. Closed four-role union (COO/Sophia Vance, Researcher/Dr. Aris Thorne, PM/Maya Lin, Finance/Julian Cruz) in `lib/server/agents/definitions.ts`; exposed to the UI as a read model at `GET /api/agents`.
- **Runtime wiring (Phase 3.4):** IMPLEMENTED + WIRED. The V2 Design1 UI dispatches founder directives to the real `/api/orchestrate` path; conversational chat uses `/api/agent-chat`; execution state (workstreams, agent activity, decisions) is server-authoritative, derived from `/api/agents/runs` and `/api/workflow/approvals` via the client read model (`Uploaded/Design1/src/lib/runtime.ts`); the operating graph visualizes only that authoritative state; approval decisions route to `POST /api/workflow/approvals`. No simulated responses or fake workflow progress remain in the active UI.
- **Role Brains, employee versioning, self-improvement governance, market intelligence:** NOT IMPLEMENTED — correctly remain target-state per §7–§9 and strictly preserved out of scope.