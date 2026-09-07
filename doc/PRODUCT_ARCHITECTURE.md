# SAMJUNIORS PRODUCT ARCHITECTURE SPECIFICATION
**Version:** 2.0.0 — Repository-grounded rewrite, Phase 1 (Documentation-only)
**Status:** Frozen for implementation planning. Repository-grounded as of commit `7154ffc` (2026-09-07).
**Reference Audits:** AUDIT 00–11 (`doc/`), plus this document's own repository inspection, which supersedes AUDIT 00–11 wherever they conflict with actual code.

This document replaces v1.0.0/v1.0.1. It keeps every section that was already correct and rewrites every section that described target-state as if it were built. Four states are distinguished throughout, tagged inline:
- **[PRINCIPLE]** — an invariant that must hold regardless of implementation details.
- **[V1]** — required for the smallest working core loop.
- **[TARGET]** — the direction the system should evolve toward; not required for v1, not yet built.
- **[REPO STATE]** — a verified fact about what commit `7154ffc` actually contains today.

No claim of "done," "immutable," "deterministic," "verified," or "cryptographic" appears below unless the repository or an explicit v1 design decision actually justifies it.

---

## 1. Architectural Principles

**[PRINCIPLE]** The system exists to turn founder intent into verified work, not to look sophisticated. Every component must justify itself against the core loop:
```
Founder → Sophia → Thorne → structured artifact → deterministic verification
        → authenticated Founder approval → durable audit → memory/outcome
```

**[PRINCIPLE] Trust boundary, precisely stated:** privileged actions — approving a side effect, modifying company state, dispatching an external mutation — require Founder authority that is *established server-side*, independent of anything the client sends. This is the actual invariant. **Clerk is one possible implementation of it, not the invariant itself** — see §7 for the current recommendation, which is not Clerk.

**[REPO STATE]** This invariant does not currently hold. `app/api/workflow/approvals/route.ts` establishes Founder identity from a client-supplied JSON field (`decidedBy`) that defaults to `'founder'` when absent. No server-side session, token, or credential is checked anywhere in the repository (`grep` for Clerk/JWT/session/middleware across `app/`, `lib/`, `types/` returns nothing). This is the highest-priority gap in the entire system.

**[REPO STATE]** The application is built for and documented as a hosted deployment (`metadata.json`'s `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`, `.env.example`'s Cloud Run `APP_URL`), not a local-only prototype. This is decision-relevant: the trust-boundary gap above is a live-deployment risk, not a hypothetical future one.

---

## 2. Trust Boundaries

**[PRINCIPLE]**
- The client (browser) is a display and input surface only. It cannot establish who it is by simply saying so.
- Any endpoint that lists or mutates approvals, workflow instances, or company state is privileged and must authenticate the caller server-side before doing anything else.
- An external system (GitHub, Resend, any inbound webhook) is untrusted input and must be cryptographically verified before its payload is trusted — signature verification, not just "the request arrived."

**[REPO STATE — negative]** `POST/GET /api/workflow/approvals`, `/api/workflow/instances`, `/api/workflow/definitions`, `/api/orchestrate`, and all `/api/communication/*` routes except the Resend webhook have no authentication of any kind. Anyone with the deployed URL can read all workflow/approval state and approve any pending action.

**[REPO STATE — positive, use as the template]** `app/api/communication/webhooks/resend/route.ts` does this correctly: it fails closed if `RESEND_WEBHOOK_SECRET` is unset, requires Svix signature headers, and rejects on invalid signature before touching the payload. `lib/server/tools/verification.ts` also does real, deterministic SSRF defense (blocks localhost, link-local/cloud-metadata IPs, private ranges) before treating any external URL as a valid research source. Both should be the pattern copied for the approvals route, not new infrastructure invented from scratch.

---

## 3. Deterministic vs. LLM-Driven

**[PRINCIPLE]** Anything where a wrong answer is expensive, security-relevant, or needs to be provably true must be deterministic code, not an LLM's judgment call:
- **Deterministic, always:** authorization decisions (allowed/requires-approval/denied), URL/input validation, workflow state transitions, approval-payload binding, audit record writing, idempotency-key computation.
- **LLM-appropriate:** drafting a PRD, technical analysis, synthesizing a summary, proposing (not deciding) a plan.
- **A gray zone requiring an explicit design decision, not yet made:** DAG/workflow planning. An LLM proposing which steps to run is reasonable; an LLM's output should still pass through a deterministic schema/dependency validator before a plan is allowed to execute — a malformed or cyclic plan must be rejected mechanically, not trusted because an LLM produced it.

**[V1]** A "verified" artifact means it has passed at least one deterministic, mechanically-checkable test relevant to its type (schema validity, compiles, matches an expected structure) — **not** that an LLM (including a "critic" agent) said it looks correct. An LLM stating "verified" is a claim to be checked, not a check.

**[REPO STATE]** No component in the repository currently rejects a worker's output based on content and forces a retry. `WorkflowRuntime.executeReadyStep` (`lib/server/workflow/runtime.ts`) treats any non-throwing agent call as a completed step. `lib/server/tools/verification.ts` contains real deterministic logic (SSRF checks, source-count-based confidence scoring) but it is not wired in as a gate on workflow-step completion.

---

## 4. Workflow Runtime

**[V1]** A workflow instance is a directed sequence of steps with explicit dependencies. A step becomes `ready` only when its dependencies are `completed` and its declared inputs resolve to an actual prior output. A step that fails does not silently disappear — it is recorded as `failed` with an error, and advancing past it requires an explicit decision (retry or founder override), not automatic progression.

**[REPO STATE]** This state machine exists and its transition-validity rules are sound (`transitionStep` in `lib/server/workflow/runtime.ts` correctly rejects invalid transitions like `completed → running`). What's missing: no automatic retry (a thrown error goes straight to `failed`; `WorkflowStepState.retryCount` exists as a field but is never incremented anywhere in the runtime), and the entire state machine lives in an in-memory singleton (`InMemoryWorkflowStore`), so it does not survive a process restart and does not stay consistent across more than one running instance of the app.

**[V1 requirement, not yet met]** The runtime must persist instance/step state somewhere that survives a restart before it can be trusted for real directives. This does not require the full target-state Postgres/Prisma stack on day one — it requires *some* persistence beyond a JS array.

---

## 5. Blackboard / Artifact Model

**[TARGET]** `Artifact` should be a first-class, typed, versioned entity: every worker output that another step or the founder will read is an Artifact with an id, a type, a version, a producing step reference, and a content payload — not a loose key inside a `Json` blob.

**[REPO STATE]** No `Artifact` entity exists. Step outputs are stored as `Record<string, any>` on `WorkflowStepState.outputs`, referenced by string key convention (`outputReferences`/`inputReferences`). `evaluateReadiness`'s check for whether a step's inputs are satisfied is an existence check on a key name — it does not validate that the referenced output is the right type, the right version, or even non-stale. A wrong-shaped or outdated value can silently satisfy the check.

**[V1]** Given the current implementation, v1 does not need the full target-state Artifact model, but it does need: (a) each Thorne output tagged with a type identifier, and (b) the deterministic verification step (§3) checking that type before a downstream step is allowed to consume it. That's the minimum that prevents a malformed artifact from silently flowing through the loop.

---

## 6. State Persistence

**[REPO STATE]** `package.json` contains no database dependency of any kind — no `prisma`, `@prisma/client`, `pg`. Every store (`CompanyStateStore`, `InMemoryWorkflowStore`, `InMemoryApprovalStore`, `InMemoryAuditStore`, the memory store) is a `private static instance` JS singleton holding data in process memory. On the app's actual deployment target (Cloud Run), a scale-to-zero event, a restart, or running more than one instance all silently lose or fork this state. Nothing here is durable today, despite prior versions of this document describing a "Durability Invariant" as satisfied.

**[V1]** State persistence sufficient for the core loop must survive: (a) a process restart, and (b) concurrent access from at most one running instance. It does not need to solve multi-instance consistency yet — that's a [TARGET] problem, and should be called out as an explicit known limitation rather than silently ignored (see §9).

**[TARGET]** Full relational persistence (Postgres via Prisma or an equivalent) for `CompanyState`, `WorkflowInstance`/`WorkflowStep`, `ApprovalRecord`, `SideEffectAudit`, `Artifact`, and `CompanyMemory`, sized for concurrent multi-instance access. Not required for v1; required before this system runs on more than one instance at a time or holds state anyone other than the founder depends on.

---

## 7. Authorization (Founder Identity & the Side-Effect Gate)

**[PRINCIPLE]** Restated precisely: privileged actions require Founder authority established server-side, verified independently of any client-supplied field, before the action is evaluated — not after.

**[REPO STATE — the core finding of this review]** `SideEffectAuthorizationGate.decideApproval` (`lib/server/authorization/gate.ts`) checks only that `params.decidedBy?.toLowerCase()?.trim() === 'founder'` — a string comparison against a value the caller provides. `app/api/workflow/approvals/route.ts` defaults that value to `'founder'` when the client omits it. There is no session, token, cookie, or credential involved anywhere in this path. Given the app's public deployment target (§1), this means any request to this endpoint is currently treated as the Founder by default.

**[V1 — the smallest sufficient fix]** Do **not** default to introducing Clerk. The actual requirement is narrower: a single, server-side-verified secret that the client must present and the server must check, on every privileged route, deny-by-default. Concretely, for a single-founder, no-second-user deployment:
- A high-entropy secret (generated once, stored only as a server environment variable, never in client code or a default value).
- A `middleware.ts` (or equivalent per-route check) that requires this secret on every route under `/api/workflow/*`, `/api/orchestrate`, `/api/communication/*` (except the already-correct Resend webhook, which authenticates differently and correctly), and rejects with 401 if missing or wrong — using a constant-time comparison, not `===`, to avoid timing side-channels.
- No default-to-authorized behavior anywhere: a missing or malformed credential must fail closed, exactly like the Resend webhook already does.

This is deliberately smaller than Clerk: no user database, no session lifecycle, no OAuth — because there is exactly one user. **The moment a second human needs access, this must be upgraded to real session-based auth** (Clerk or otherwise) — a shared secret does not scale past one trusted party and should not be stretched to pretend it does.

**[V1] Approval-payload binding — not currently implemented, required before founder approval can be trusted:** an approval record must be bound to the *exact* action, target, and payload being approved — not just an approval ID that a step can later execute against different arguments. Concretely: at approval-request time, compute and store a hash of the canonicalized `{actionName, target, payload}` tuple on the `ApprovalRecord`; at dispatch time, recompute that hash from what's about to be executed and refuse to proceed unless it matches exactly and the approval is still `pending→approved` and unconsumed. This is what "cryptographically bound" should mean here — a hash comparison the code actually performs, not a description in a document.

**[REPO STATE]** No such binding exists today. `ApprovalRecord.scope` in the type definitions carries a loose `operationPattern`/`maxUses`, and `executeWithGate` consumes a `single_action`-scoped approval by ID, but nothing recomputes or compares a payload hash at dispatch time — an approval could in principle be granted for one payload and consumed against a different one if the calling code changed the payload between request and dispatch.

---

## 8. Side-Effect Failure Semantics

**[PRINCIPLE]** None of the following may be waved away with the word "idempotent" without saying exactly which mechanism enforces it:
- **DB commit before dispatch:** the intent to perform a side effect must be durably recorded *before* the external call is made, so a crash mid-dispatch leaves a recoverable trail instead of silence. **[REPO STATE: not possible today — there is no durable store to commit to before dispatch; `executeWithGate` records the audit entry in-memory, in the same process, with no ordering guarantee against the external call surviving a crash.]**
- **External action succeeds, DB update fails:** requires either a two-phase reconciliation step or relying on the external system's own idempotency key so a safe retry doesn't double-execute. **[Not implemented. No side-effect provider call in the repo passes an idempotency key.]**
- **Timeout after unknown execution state:** must not blindly retry; must either check the external system's state first or use a provider-supported idempotency key. **[Not implemented — a timeout is currently indistinguishable from a clean failure in the runtime's error handling.]**
- **Duplicate retry:** only safe where the external provider supports idempotency keys (GitHub, Resend, and Stripe all do, when used correctly) and the system actually sends one. **[Not currently sent by any integration in the repo.]**
- **Provider outage:** should degrade a specific step to a `degraded`/blocked status and stop, not retry indefinitely or silently drop the step. **[No such status/circuit-breaker exists in the current step-status enum or runtime.]**

**[V1]** At minimum, v1 must generate and pass an idempotency key to any external side-effect call that supports one, and must surface — not silently swallow — any case where dispatch outcome is unknown (timeout, ambiguous response) so the founder sees "unknown, needs manual check" rather than a false "completed" or false "failed."

---

## 9. Concurrency

**[REPO STATE]** The current implementation does not support more than one concurrently-running instance of the application holding consistent state — each `InMemoryWorkflowStore`/`InMemoryApprovalStore` singleton is process-local. If the deployment ever runs more than one instance (Cloud Run can do this automatically under load), two instances can hold diverging copies of "the same" workflow with no reconciliation.

**[V1]** State this as an explicit, documented limitation: **v1 must run as a single instance** (Cloud Run min/max instance count pinned to 1) until durable, shared persistence exists. This is a real constraint on the current deployment, not a hypothetical.

**[TARGET]** Once shared durable persistence exists, workflow-step execution needs actual concurrency control — a claim/lock per step (e.g., a conditional update keyed on current status, or a real DB transaction) so two workers can't both pick up the same `ready` step.

---

## 10. AI Output Verification

Restated from §3 for completeness: a "verified" artifact is one that has passed a specific, named, mechanically-checkable test. Examples appropriate to this system's actual work (PRD/spec drafting, technical research): structural schema validation of the artifact's shape, a compile/lint check for anything code-shaped, a source-count-based confidence score for research claims (`verification.ts` already does the last one correctly). **An LLM's self-report that its own output is correct is never sufficient on its own and must not be logged with the same confidence label as a mechanically verified fact.**

---

## 11. Memory / Knowledge / State Separation

**[PRINCIPLE]** Real company state, real historical outcomes, and example/seed data used for development must never share a label that claims they're all equally authoritative.

**[REPO STATE — second-highest-priority finding of this review]** `lib/server/state/state-store.ts`'s `queryState` tags every result — including entirely synthetic sample customers and a synthetic financial model (`lib/os-data.ts`'s `SAMPLE_PIPELINE_DEALS`, `SAMPLE_FINANCIAL_MODEL`) — with `epistemicType: 'current_truth'` and `confidence: 'verified_fact'`, unconditionally. `lib/server/memory/memory-store.ts`'s `INITIAL_COMPANY_MEMORIES` hardcodes five fabricated historical events (a fictional "9-step executive council debate reduced hallucinated specifications by 92%," a fictional monitor purchase) also tagged `epistemicConfidence: 'verified_fact'`. Any agent querying state or memory today cannot distinguish real founder-approved history from placeholder fiction — both carry the system's highest confidence label.

**[V1 requirement]** Every state and memory record must carry an explicit provenance flag distinguishing at minimum: `real` vs. `synthetic/seed`. Synthetic data may remain in the codebase for development/demo purposes, but must never be labeled `verified_fact` or `current_truth`. This is a small schema change with a large trust impact and should be done before any other memory/state work.

**Correcting prior document language:** earlier versions of this document described structured state injection as having "zero hallucination potential." That claim is not justified and is removed. Structured, deterministically-queried state reduces the chance of an LLM *fabricating* a fact, because the fact itself doesn't come from the LLM — but the LLM can still misread, misquote, or misapply a correctly-retrieved fact. The accurate claim is: **authoritative state is kept deterministic and non-LLM-generated, which reduces (not eliminates) fabrication risk.**

---

## 12. V1 Architecture (build this)

```
Founder (server-verified via §7's minimal secret mechanism — NOT client-supplied identity)
 ↓
Executive Cockpit (already implemented)
 ↓
Directive
 ↓
Sophia — planner (already implemented)
 ↓
Workflow Kernel — persisted beyond process memory (NOT YET IMPLEMENTED — highest-priority build item after auth)
 ↓
Thorne — worker (already implemented)
 ↓
Artifact — minimally typed, not yet a first-class entity (partial — see §5)
 ↓
Verification — a real deterministic check that can reject (NOT YET WIRED IN — see §3, §10)
 ↓
Authorization — Side-Effect Gate with payload binding (partially implemented; binding NOT YET IMPLEMENTED — see §7)
 ↓
External Effect — idempotency-key-aware dispatch (NOT YET IMPLEMENTED — see §8)
 ↓
Audit — durable, not in-memory (NOT YET IMPLEMENTED — see §6)
 ↓
Memory — provenance-tagged, real vs. synthetic (NOT YET IMPLEMENTED — see §11)
```

## 13. Target Architecture (evolve toward this, not now)

Full relational persistence (Postgres/Prisma or equivalent) for all entities in §6; first-class versioned `Artifact` model (§5); multi-instance-safe concurrency control (§9); session-based multi-user authentication once a second human is added (§7); pgvector-based retrieval once the knowledge corpus outgrows full-context injection; broader Composio integrations (Slack/Linear/Calendar) once GitHub-only proves the pattern; E2B sandboxing once autonomous code execution is actually needed; the remaining employee roster (Elena, Marcus) once there's a concrete task only they can do; fine-tuning/eval infrastructure once there's enough real approval-decision volume for it to mean anything.

## 14. What Remains Deferred (unchanged unless evidence says otherwise)

pgvector/RAG, E2B, fine-tuning, Elena Rostova, Marcus Vance, broad Composio integrations, multi-user RBAC, voice, persona customization, multi-agent council workflows, any "production security audit" milestone (premature while the app is single-user by design).

## 15. Architectural Invariants (precise, minimal, and currently unmet where noted)

1. **Founder authority is established server-side, never from a client-supplied field.** [Currently unmet — §7, highest priority.]
2. **A privileged action's approval is bound to its exact action/target/payload, checked at dispatch time.** [Currently unmet — §7.]
3. **Workflow and audit state survive a process restart.** [Currently unmet — §6.]
4. **Synthetic/example data is never labeled with the same confidence as verified real data.** [Currently unmet — §11, second priority.]
5. **"Verified" means a named, mechanically-checkable test passed — not that an LLM said so.** [Partially unmet — §3, §10.]
6. **External side effects carry idempotency keys where the provider supports them, and unknown-outcome dispatch is surfaced, not guessed at.** [Currently unmet — §8.]

---

## Document Change Log
- v1.0.0 → v1.0.1: added scope-deferral annotations based on doc-only review (no repository access).
- v1.0.1 → v2.0.0 (this version): full rewrite following direct repository inspection. Removed all claims of "done," "immutable," "cryptographic," "zero hallucination potential" that repository evidence does not support. Removed Clerk as a mandatory dependency; replaced with the precise invariant plus a minimal-secret v1 recommendation. Added Artifact, approval-binding, side-effect-failure, and concurrency semantics that were previously undefined or asserted without mechanism.