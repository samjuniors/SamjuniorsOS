# PRODUCT.md — Product Definition
**Status:** Frozen for Phase 1 (Documentation). Repository-grounded as of commit `7154ffc` (2026-09-07).
**Do not treat "frozen" as "static."** This freezes the *decisions*, not the document — it should still be corrected the moment repository evidence contradicts it. It should not be revised on preference or speculation.

---

## 1. What is SamJuniorsOS?

An internal operating system that lets a solo founder direct a small set of AI "employees" to do real, verifiable work — research, product specs, technical analysis — under a founder-approval gate for anything that mutates state outside the system. The product bet is the **loop**, not the UI shell around it: founder intent → AI-produced work → deterministic check → founder decision → durable record. The Executive Cockpit is the UI expression of that loop, not the product itself.

## 2. Who is it for?

Single founder (Sam), operating solo. No confirmed second user, team member, or customer today.

**Open, unresolved product-boundary question — not decided by this document:** is SamJuniorsOS strictly personal/internal tooling, or a product intended to eventually be used by other founders? These imply materially different architectures (see PRODUCT_ARCHITECTURE.md §Trust Boundaries) — internal-only tooling can defer multi-user auth indefinitely; a sellable product cannot. This document does not resolve that question because it isn't a repository or architecture fact — it's a business decision the founder has to make. Everything below is scoped to "internal, single-founder" as the current default, and should be revisited explicitly if that changes.

## 3. What problem does it solve?

Directing multiple AI agents currently means switching between terminals, chat windows, and ad hoc scripts, with no single durable record of what was asked, what was produced, what was approved, and what actually happened as a result. SamJuniorsOS's job is to make that loop legible and auditable in one place — not to make the AI agents smarter, and not to replace tools that already do their job well (GitHub, email, a CRM).

## 4. What is the core product loop? (the thing that must work before anything else matters)

```
Founder → Sophia (planner) → Thorne (worker) → structured artifact
       → deterministic verification → authenticated Founder approval (where required)
       → durable audit record → memory/outcome
```

Every other feature — additional employees, integrations, UI surfaces — is downstream of this loop being real and trustworthy. Right now it is not: see "Current Repository State" below.

## 5. What is v1?

The smallest version of the loop above, made real:
- Founder directive, captured through the Executive Cockpit (stream / approval inbox / vitals wall / directive terminal) — UI already exists in the repo, see below.
- Sophia (planner/COO) and Thorne (technical/research) — the only two agents v1 needs. Both already exist in code.
- One structured, typed artifact produced by Thorne per directive (not a loose text blob).
- One deterministic verification step that can actually reject an artifact and force a retry — not "the agent call didn't throw."
- Founder approval on any step classified as a side effect, gated behind **server-established Founder identity** (see PRODUCT_ARCHITECTURE.md — this is the single hardest v1 requirement and the current repository does not meet it).
- An audit record for every decision and every side effect that survives a process restart. The current repository does not meet this either — see below.

## 6. What is explicitly deferred?

Deferred until the v1 loop above is proven durable and secure, not on a calendar:
- Maya Lin, Julian Cruz, and any employee beyond Sophia/Thorne (Maya and Julian exist in code already but are out of the v1 critical loop; Elena Rostova and Marcus Vance don't exist in code at all yet and shouldn't be built until there's a concrete task only they can do).
- Broad Composio integrations beyond GitHub (Slack, Linear, Calendar).
- pgvector / RAG retrieval over Canonical Knowledge — flat-table/full-injection is sufficient at current corpus size.
- E2B sandbox, fine-tuning / eval "Horizon 3."
- Multi-user RBAC (EXECUTIVE/AUDITOR roles) — no second user exists today.
- Voice calling, persona customization system, multi-agent "council" collaboration workflows.
- Any claim that this is a "commercially shippable" product — see the unresolved product-boundary question in §2. Nothing here should be built toward external users until that's explicitly decided.

## 7. What are the success criteria (for v1, specifically)?

- A real directive, given to Sophia, produces a Thorne artifact that passes a deterministic check or is rejected and retried — not silently accepted.
- A side-effect step cannot be approved by anything other than a server-verified Founder identity — verified by attempting to approve one without that identity and confirming it's rejected.
- A workflow's state and its audit trail survive an application restart (currently: **fails**, everything is in-memory).
- No data presented to an agent or the founder as "verified fact" is actually placeholder/sample data (currently: **fails**, see PRODUCT_ARCHITECTURE.md §Memory/Knowledge/State Separation).

## 8. Product boundary — what SamJuniorsOS is explicitly NOT (for now)

- Not a multi-tenant SaaS product (no second user, no billing, no public signup).
- Not a replacement for GitHub, Slack, email, or a CRM — it directs a narrow set of tools, it doesn't rebuild them.
- Not an autonomous system — every side effect requires a founder decision; nothing here acts without that gate holding.
- Not, today, a system whose "verified"/"audited"/"durable" claims can be trusted end to end — seven of them do not hold against the current repository (enumerated in PRODUCT_ARCHITECTURE.md). This document exists partly to stop describing those claims as already true.

---

## Current Repository State (verified against commit `7154ffc`, 2026-09-07)

- **Stack, as installed:** Next.js 15 / React 19 / TypeScript 5.9, Tailwind 4, Framer Motion, `@google/genai` (Gemini), `@composio/core`. **Not installed, anywhere:** Prisma, any Postgres/DB driver, Clerk, pgvector, E2B. These are target-state only.
- **Agents implemented in code:** Sophia Vance (COO/orchestrator), Dr. Aris Thorne (research — note: architecture doc previously said "Arthur," code says "Aris," corrected here), Maya Lin (PM), Julian Cruz (Finance). Elena Rostova and Marcus Vance are not implemented.
- **Persistence:** every store (`CompanyStateStore`, `InMemoryWorkflowStore`, `InMemoryApprovalStore`, `InMemoryAuditStore`, memory store) is a JS singleton holding arrays in process memory. Nothing is durable. A restart or Cloud Run scale event erases all workflow, approval, and audit state.
- **Authentication:** none. No `middleware.ts`, no Clerk/JWT/session code anywhere in the repository. `POST /api/workflow/approvals` treats a request as the Founder unless the request body explicitly says otherwise (`decidedBy` defaults to `'founder'` when omitted).
- **Deployment target:** `metadata.json` (`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`) and `.env.example` (`APP_URL` documented as a Cloud Run service URL) confirm this is built for a Google AI Studio / Cloud Run hosted deployment, i.e. a public URL — not a local-only prototype.
- **Test suite:** `tests/*.test.ts` exist (3 files, `describe`/`it` style) but neither `jest` nor `vitest` is a dependency; `npm test` runs an unrelated script (`scripts/test-advisor.ts`). These tests do not currently run in any automated way.
- **Seed data:** `lib/os-data.ts` and `lib/server/memory/memory-store.ts` contain fabricated sample customers, a fabricated financial model, and five fabricated "company memories" describing events that never occurred — all unconditionally tagged `verified_fact` in code.