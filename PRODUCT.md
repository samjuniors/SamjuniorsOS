# PRODUCT.md — Product Definition
**Status:** Reconciled against repository `8524908` (2026-09-08) and founder-locked strategic decisions. Supersedes all prior versions.

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

**The near-term execution primitive** — the thing that must work before the broader loop means anything — remains:
```
Founder → Sophia (planner) → Thorne (worker) → structured artifact
       → deterministic verification → authenticated Founder approval → durable audit → memory/outcome
```
This is a component of the larger loop, not a replacement definition of the product. See PRODUCT_ARCHITECTURE.md for how Company Brain, Role Brains, and market intelligence relate to it.

## 5. What is v1?

Unchanged in substance from the prior v1 scope, now explicitly framed as "foundation phase" of the larger loop (see ROADMAP.md):
- Executive Cockpit UI (implemented).
- Sophia + Thorne only (implemented; Maya/Julian exist in code but are out of the v1 critical path).
- One typed artifact per directive, one deterministic verification gate that can actually reject.
- Founder approval on side effects, gated behind server-established Founder identity — **partially implemented, see Current Repository State.**
- Durable audit trail surviving a restart — **partially implemented and deployment-mismatched, see Current Repository State.**

## 6. What is explicitly deferred?

Unchanged from the prior document, plus the new strategic concepts from §7–§8 below, all of which are **NEXT/LATER, not v1**:
- Maya/Julian's own workflows, Elena Rostova, Marcus Vance.
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

- A real directive produces a verified-or-rejected artifact, not a silently-accepted one.
- A side-effect step cannot be approved without server-verified Founder identity — **currently not fully guaranteed; see Current Repository State.**
- Workflow/audit state survives an application restart **in the actual deployment environment**, not just a local dev machine — **currently not guaranteed; see Current Repository State.**
- No data is presented as verified fact unless it actually is — **substantial real progress underway (epistemic pipeline), not yet fully migrated across all state paths.**

## 11. Product boundary

Internal-only (§1). Not a replacement for GitHub/Slack/email/a CRM. Not autonomous — every side effect requires a founder decision. Future commercialization: an explicit, separate, not-yet-made decision — nothing in the current architecture should assume it, and nothing should block it either.

---

## Current Repository State (verified against commit `8524908`, 2026-09-08 — supersedes all earlier repository-state snapshots)

Significant progress since the last review (commit `7154ffc`). Status below uses IMPLEMENTED / PARTIAL / NOT IMPLEMENTED precisely — see PRODUCT_ARCHITECTURE.md for full detail and file references.

- **Auth:** PARTIAL. `middleware.ts` + Clerk now gate the right routes structurally. But `.env.example` has no live Clerk key variables, and the code's own sandbox-mode fallback (active whenever a live key is absent) is bypassable via a client-settable header when not running in `development`/`test`. Separately, `gate.ts`'s `decideApproval` still authorizes via a **blocklist** of disallowed role-strings rather than an allowlist checking against a server-verified identity — a client sending any `decidedBy` string not on that blocklist (e.g. `"admin"`, `"sam"`) currently passes. Not yet a closed gap.
- **Persistence:** PARTIAL, and mismatched to the stated deployment target. `DurableFileStore` gives real atomic-write, restart-survivable local persistence — but writes to local disk on an app documented as Cloud-Run-hosted, where local disk isn't guaranteed to survive container replacement. Prisma is now a dependency with a real schema, but no `DATABASE_URL` is configured anywhere.
- **Approval-payload binding:** the SHA-256 canonical-hash computation is implemented correctly. Full enforcement at every dispatch path wasn't confirmed this session — treat as unconfirmed, not assumed complete.
- **Epistemic/provenance separation (Company Brain substrate):** substantial real work in progress — a genuine Source→Signal→Claim→CanonicalFact→Memory pipeline exists, explicitly modeled on OptimalEngine, with a live/synthetic/sandbox provenance field. Whether the original flagged code paths (`state-store.ts`, `memory-store.ts`'s unconditional `verified_fact` tagging) have been migrated onto it is unconfirmed.
- **Role Brains, employee versioning, self-improvement governance, market intelligence:** NOT IMPLEMENTED — all correctly remain target-state per §7–§9 above.