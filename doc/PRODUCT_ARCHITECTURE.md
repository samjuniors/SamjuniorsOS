# SAMJUNIORS PRODUCT ARCHITECTURE SPECIFICATION
**Version:** 3.0.0 — Reconciled against repository `8524908` and founder-locked strategic decisions (2026-09-08)
**Status:** Frozen for implementation planning. Repository-grounded as of commit `8524908`. Supersedes v2.1.0 (which was itself never committed to the repo — the repo's `doc/PRODUCT_ARCHITECTURE.md` at commit `8524908` still reflects the earlier, pre-fix v2.0.0 draft; this version reconciles both the code drift and the doc drift).
**Reference Audits:** AUDIT 00–11 (`doc/`), this document's own repository inspection at `7154ffc` and `8524908`, and architectural research from `Bennettxai/OptimalEngine` and `Bennettxai/FounderOS-DEMO` (patterns only — neither repo's runtime is adopted; see §11a, §17).

This document keeps every section that was already correct and rewrites every section that described target-state as if it were built, or that described a real gap as if it were still fully open when partial progress has landed. States distinguished throughout, tagged inline:
- **[PRINCIPLE]** — an invariant that must hold regardless of implementation details.
- **[V1]** — required for the smallest working core loop (the "FOUNDATION" phase — see ROADMAP.md).
- **[TARGET]** — the direction the system should evolve toward; not required for v1, not yet built.
- **[REPO STATE]** — a verified fact about what a specific commit actually contains, dated per claim since the codebase is moving quickly.

No claim of "done," "implemented," "immutable," "deterministic," "verified," or "cryptographic" appears below unless the repository or an explicit v1 design decision actually justifies it — and every such claim below is dated to the commit it was verified against, since this codebase changed substantially between the last two reviews in this same week.

---

## 0. Blocking Decision: Deployment Target (must be made before Phase 2 starts)

**[PRINCIPLE]** This document deliberately stops short of prescribing specific persistence and authentication mechanisms, because both depend on a decision that hasn't been made yet: **is v1 local-only, or does it stay on Cloud Run (or an equivalent hosted target)?** Repository evidence (§1, §6) shows the app is currently *built for* Cloud Run, but "built for" is not the same as "must stay there" — this is a founder decision, not a fact the repository can settle.

This matters concretely, not abstractly:
- **If local-only:** a local persistent store (e.g. a single SQLite file on disk) satisfies §6's durability requirement, and a simple local mechanism can satisfy §7's authentication requirement, because there's no network boundary for either to fail across.
- **If Cloud Run (or any hosted target) remains the deployment:** local filesystem storage is not durable — Cloud Run instances can be replaced or scaled without preserving local disk, so "SQLite on the container" would silently reproduce the exact in-memory durability problem this document exists to fix. Durability requires an *external* store (a managed database, object storage, or equivalent — the specific product is a §6 implementation choice, not fixed here). Authentication likewise requires a mechanism that doesn't depend on a secret reaching client-side JavaScript (§7) — a local shared-secret pattern does not translate safely to a public URL.

**Phase 2 must not start building persistence or auth until this decision is made.** Building SQLite-on-Cloud-Run or a client-side bearer secret on a public URL because "the document didn't forbid it" would recreate the exact failures this rewrite exists to close.

---

## 1. Architectural Principles

**[PRINCIPLE]** The system exists to turn founder intent into verified work, not to look sophisticated. Every component must justify itself against the core loop:
```
Founder → Sophia → Thorne → structured artifact → deterministic verification
        → authenticated Founder approval → durable audit → memory/outcome
```

**[PRINCIPLE] Trust boundary, precisely stated:** privileged actions — approving a side effect, modifying company state, dispatching an external mutation — require Founder authority that is *established server-side*, independent of anything the client sends. This is the actual invariant. **Clerk is one possible implementation of it, not the invariant itself** — see §7 for the current recommendation, which is not Clerk.

**[REPO STATE, `7154ffc`]** This invariant did not hold at all as of the first review. **[REPO STATE, `8524908` — updated]** Real progress: `middleware.ts` now exists, wired to `@clerk/nextjs`, gating `/api/workflow/*`, `/api/orchestrate`, `/api/advisor`, `/api/agent-chat`, `/api/agent-collab`, and most `/api/communication/*` routes. This is structurally correct and follows this document's own prior recommendation. **It is not yet a closed gap**, for two independent reasons: (1) `.env.example` provisions no live Clerk key variables, and the middleware's own `isSandboxMode` fallback — active whenever a live publishable key is absent — is bypassable via a client-settable `x-samjuniors-dev-as: founder` header whenever `NODE_ENV` isn't `development`/`test`; (2) downstream, `SideEffectAuthorizationGate.decideApproval` (`lib/server/authorization/gate.ts`) still authorizes via a **blocklist** of disallowed role-strings (`'researcher','pm','coo','finance','advisor','agent','system','developer','guest'`) rather than an allowlist checking a server-verified identity — a client sending any `decidedBy` value not on that list (e.g. `"admin"`, `"sam"`, a typo) currently passes this check. Whether (1) or (2) is exploitable in practice depends on whether live Clerk credentials are actually provisioned in the deployed environment, which this document cannot verify from static code — **treat as open and unconfirmed, not resolved.**

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

**[V1 requirement, not yet met]** The runtime must persist instance/step state somewhere that survives a restart before it can be trusted for real directives. This does not automatically mean the full target-state Postgres/Prisma stack on day one — but which lighter-weight mechanism is acceptable depends on the deployment target; see §0 and §6 before choosing one.

---

## 5. Blackboard / Artifact Model

**[TARGET]** `Artifact` should be a first-class, typed, versioned entity: every worker output that another step or the founder will read is an Artifact with an id, a type, a version, a producing step reference, and a content payload — not a loose key inside a `Json` blob.

**[REPO STATE]** No `Artifact` entity exists. Step outputs are stored as `Record<string, any>` on `WorkflowStepState.outputs`, referenced by string key convention (`outputReferences`/`inputReferences`). `evaluateReadiness`'s check for whether a step's inputs are satisfied is an existence check on a key name — it does not validate that the referenced output is the right type, the right version, or even non-stale. A wrong-shaped or outdated value can silently satisfy the check.

**[V1]** Given the current implementation, v1 does not need the full target-state Artifact model, but it does need: (a) each Thorne output tagged with a type identifier, and (b) the deterministic verification step (§3) checking that type before a downstream step is allowed to consume it. That's the minimum that prevents a malformed artifact from silently flowing through the loop.

---

## 6. State Persistence

**[REPO STATE, `7154ffc`]** No database dependency existed at all. **[REPO STATE, `8524908` — updated]** `lib/server/persistence/durable-file-store.ts` now provides atomic-write (`temp file + rename`), restart-survivable local persistence backing several stores, and `prisma/schema.prisma` (222 lines) now exists as a real, if unconnected, target schema. This is genuine progress and correctly solves durability *against an in-process crash or restart*. It does **not** solve durability against the actual stated deployment target: `.env.example` still has no `DATABASE_URL`, and `DurableFileStore` writes to `process.cwd()/.data` (falling back to `/tmp` if that's read-only) — on Cloud Run, neither location is guaranteed to survive container replacement or a scale event. This is exactly the failure mode §0 exists to prevent, and it appears to have been built without §0's deployment decision having actually been made first — the code comment in `durable-file-store.ts` itself claims "durability without external database dependencies," which is true for restarts and false for container replacement. **The §0 decision is now more urgent, not less: real engineering effort has now been spent on a mechanism that is correct for one deployment target and insufficient for the other.**

**[V1] Corrected — this requirement is conditional on §0's deployment decision, not deployment-agnostic:** "beyond a JS array" is necessary but not sufficient on its own. Specifically:
- If v1 is **local-only**: a local persistent store (single SQLite file or equivalent) satisfies this — it survives a process restart because the disk it's written to is the same disk that persists across restarts.
- If v1 **stays on Cloud Run** (or any hosted target with ephemeral/non-guaranteed local disk): the same SQLite-on-local-disk approach does **not** satisfy this — an external durable store is required, because container replacement is not guaranteed to preserve local filesystem state. This is not a hypothetical: it's the same failure mode as the current in-memory store, one layer down.

Either way, v1 does not need to solve multi-instance consistency yet — that's a [TARGET] problem, and should be called out as an explicit known limitation rather than silently ignored (see §9) — but which persistence mechanism is *acceptable at all* is decided by §0, not by this section alone.

**[TARGET]** Full relational persistence (Postgres via Prisma or an equivalent) for `CompanyState`, `WorkflowInstance`/`WorkflowStep`, `ApprovalRecord`, `SideEffectAudit`, `Artifact`, and `CompanyMemory`, sized for concurrent multi-instance access. Not required for v1; required before this system runs on more than one instance at a time or holds state anyone other than the founder depends on.

---

## 7. Authorization (Founder Identity & the Side-Effect Gate)

**[PRINCIPLE]** Restated precisely: privileged actions require Founder authority established server-side, verified independently of any client-supplied field, before the action is evaluated — not after.

**[REPO STATE — the core finding of this review]** `SideEffectAuthorizationGate.decideApproval` (`lib/server/authorization/gate.ts`) checks only that `params.decidedBy?.toLowerCase()?.trim() === 'founder'` — a string comparison against a value the caller provides. `app/api/workflow/approvals/route.ts` defaults that value to `'founder'` when the client omits it. There is no session, token, cookie, or credential involved anywhere in this path. Given the app's public deployment target (§1), this means any request to this endpoint is currently treated as the Founder by default.

**[V1 — invariant frozen, mechanism deliberately not frozen here]** Do **not** default to introducing Clerk. But also: **do not default to a shared secret presented by the browser**, which an earlier version of this document recommended and which this revision retracts. The reasoning: if a secret must reach the browser for the client to present it, it is functionally a bearer credential sitting in client-side JavaScript — reachable by XSS, a malicious extension, or a compromised browser environment. That's a materially different (and weaker) guarantee than "server-established," even though it's stronger than trusting `decidedBy`.

The invariant that's actually frozen: **privileged requests must carry Founder authority that the server verifies independently of any client-supplied identity field.** The concrete mechanism is a §0 deployment decision, not fixed here. Depending on that decision, appropriate options include (not a ranked recommendation — the right one depends on §0):
- **Local-only v1:** authority can be established by the fact that the request originates from the founder's own machine — no network-exposed credential is needed at all, because there's no network boundary for one to fail across.
- **Hosted (Cloud Run) v1:** an authenticated access layer in front of the app (e.g. an identity-aware proxy at the platform level) so the application itself never has to implement or store a credential — the platform establishes identity before the request reaches app code.
- **Hosted v1, app-level auth:** a minimal server-side session mechanism (a login step that sets an `httpOnly`, `Secure` session cookie the browser can't read or exfiltrate via JS, verified server-side on every privileged route) — still far smaller than Clerk's full multi-role infrastructure, but without the bearer-secret-in-JS weakness.

Whichever option §0 selects, the non-negotiable part carries over unchanged: no default-to-authorized behavior anywhere (a missing or malformed credential fails closed, exactly like the Resend webhook already does), and **the moment a second human needs access, this must be upgraded to real multi-user session auth** (Clerk or otherwise) — none of the v1 options above are designed to scale past one trusted party.

**[V1] Approval-payload binding — not currently implemented, required before founder approval can be trusted:** an approval record must be bound to the *exact* action, target, and payload being approved — not just an approval ID that a step can later execute against different arguments. Concretely: at approval-request time, compute and store a hash of the canonicalized `{actionName, target, payload}` tuple on the `ApprovalRecord`; at dispatch time, recompute that hash from what's about to be executed and refuse to proceed unless it matches exactly and the approval is still `pending→approved` and unconsumed. This is what "cryptographically bound" should mean here — a hash comparison the code actually performs, not a description in a document.

**[REPO STATE, `7154ffc`]** No such binding existed. **[REPO STATE, `8524908` — updated]** `lib/server/authorization/payload-binding.ts` now implements `computeApprovalPayloadHash` correctly: a deterministic SHA-256 hash over a canonicalized (sorted-key) `{actionName, target, payload}` tuple, matching this document's specification. **Not yet confirmed:** whether every dispatch path actually recomputes and compares this hash before executing, versus the function existing but only being called on some paths. Treat enforcement as unconfirmed until traced end to end — the computation being correct doesn't guarantee it's checked everywhere it needs to be.

---

## 8. Side-Effect Failure Semantics

**[V1 scope — explicit, not implied]** Neither PRODUCT.md nor this document, prior to this revision, stated which specific external effects are in scope for v1 — "External Effect — idempotency-key-aware dispatch" named a stage in the loop without naming a provider. Corrected: **v1 may exercise the authorization/approval architecture using a single, controlled integration adapter (GitHub is the natural first candidate, matching PRODUCT.md's integration scope), but no external mutation capability — GitHub or otherwise — is considered v1-complete until that specific provider's idempotency-key support and unknown-outcome handling (§ below) are explicitly defined for it.** This is deliberately narrower than "build a generic external-action framework": one adapter, fully specified, before any second one is added.

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

## 11. Memory / Knowledge / State Separation, and the Company Brain (target-state)

**[PRINCIPLE]** Real company state, real historical outcomes, and example/seed data used for development must never share a label that claims they're all equally authoritative.

**[REPO STATE, `7154ffc`]** `lib/server/state/state-store.ts`'s `queryState` tagged every result — including entirely synthetic sample customers and a synthetic financial model (`lib/os-data.ts`'s `SAMPLE_PIPELINE_DEALS`, `SAMPLE_FINANCIAL_MODEL`) — with `epistemicType: 'current_truth'` and `confidence: 'verified_fact'`, unconditionally. `lib/server/memory/memory-store.ts`'s `INITIAL_COMPANY_MEMORIES` hardcoded five fabricated historical events also tagged `verified_fact`.

**[REPO STATE, `8524908` — substantial progress]** A new `lib/server/epistemic/` module (`pipeline.ts`, `claim-store.ts`, `schemas.ts`, `types/epistemic.ts`) implements a genuine governed lifecycle: `EvidenceSource → EpistemicSignal → EpistemicClaim → CanonicalFact → GovernedMemoryObject`, explicitly modeled on OptimalEngine's pattern (§11a). Critically, `EvidenceSource` carries `provenanceKind: 'live_operational' | 'synthetic' | 'sandbox_mock'` — this is exactly the provenance flag this document called for. Claims require explicit policy evaluation or founder review before promotion to `CanonicalFact`; superseded facts retain lineage rather than being silently overwritten. **This is real, substantive work in the right direction.**

**[OPEN — unconfirmed]** What is not yet confirmed: whether the *original* flagged code paths (`state-store.ts`'s `queryState`, `memory-store.ts`'s `INITIAL_COMPANY_MEMORIES`) have been migrated to read through this new pipeline, or still run in parallel with their old unconditional `verified_fact` tagging. Until traced, do not assume the original finding is resolved just because a correct replacement now exists elsewhere — a correct new system alongside an un-migrated old one is a common way a synthetic-data problem "looks fixed" while remaining exploitable through the old path.

### 11a. Company Brain (target-state architectural concept — [TARGET], not v1)

The **Company Brain** is the governed, shared source of company truth: verified facts, company state, strategic decisions, goals/priorities, historical decisions, institutional memory, market intelligence, and policy. It is architecturally required to distinguish authoritative/verified information from raw sources, signals, unverified claims, hypotheses, recommendations, working context, and superseded information. The epistemic pipeline above (§11, `8524908`) is the correct substrate for this — Company Brain is not new infrastructure to build from scratch, it's the name for what that pipeline becomes once it's the single path all state and memory reads/writes go through.

**Fabricated/demo data must never become Company Brain truth.** This is the same invariant as §11's `[V1 requirement]`, restated at the architectural-concept level: it is not satisfied by a data-labeling patch, it is satisfied when nothing outside the governed pipeline is treated as authoritative.

### 11b. Role Brains (target-state architectural concept — [TARGET], not v1, NOT IMPLEMENTED)

Each AI employee should eventually have a **Role Brain**: identity/role/responsibilities/authority boundaries, role-relevant knowledge drawn from the Company Brain, working memory (current assignments, open questions), experience (completed work, outcomes, lessons learned), skills (current proficiency, gaps, evaluation history), and development state (version, training completed, upgrade/rollback history).

**Hard architectural rule: `ROLE BRAIN ≠ COMPANY TRUTH`.** A Role Brain may hold specialized context, derived knowledge, and working memory, but authoritative company facts remain governed centrally by the Company Brain (§11a) — a Role Brain is a *view and a workspace*, never an independent or competing source of truth. No code implements this today; it is correctly out of v1 scope.

### 11c. Self-Improvement Safety Model (target-state principle — [PRINCIPLE], applies whenever any of this is eventually built)

**Self-improving ≠ self-authorizing.** AI employees may eventually identify weaknesses, propose training or workflow improvements, request new knowledge, create candidate improvements, run evaluations, and recommend upgrades or specialization. They must **never**, under any implementation phase: silently grant themselves permissions, change security or financial authority, bypass founder approval, rewrite authoritative Company Brain facts, deploy untested production behavior, delete historical records, or modify their own authorization boundaries. Consequential changes require governance and explicit founder approval — this is an architectural safety principle that must hold from the first line of code toward this capability, not a UI feature to be added once autonomy already exists.

**Employee versioning:** an eventual upgrade to an AI employee (e.g. Sophia v1.0 → v1.1) must carry a version, change set, reason, evidence, evaluation results, approval status, deployment timestamp, and rollback target. A production employee configuration must never be silently overwritten. Not implemented today; correctly deferred (see ROADMAP.md).

**Correcting prior document language:** earlier versions of this document described structured state injection as having "zero hallucination potential." That claim is not justified and remains removed. Structured, deterministically-queried state reduces the chance of an LLM *fabricating* a fact, because the fact itself doesn't come from the LLM — but the LLM can still misread, misquote, or misapply a correctly-retrieved fact. The accurate claim is: **authoritative state is kept deterministic and non-LLM-generated, which reduces (not eliminates) fabrication risk.**

---

## 12. V1 Build Order (the dependency chain, stated once, unambiguously)

An earlier version of this document called persistence "the highest-priority build item after auth" in §6/§12, while the accompanying chat summary separately listed a four-item order that put persistence third. That inconsistency is resolved here — this is the single authoritative order, and no other section or summary should restate a conflicting one:

1. **§0 — Deployment decision.** Nothing below can be built correctly until this is answered; it determines which persistence and auth mechanisms are even valid.
2. **§7 — Auth boundary.** Establish server-verified Founder authority per whichever mechanism §0 implies. This closes the highest-severity live gap (any request can currently self-declare as Founder).
3. **§6 — Durable persistence.** Make workflow/approval/audit state survive a restart, per the mechanism §0 implies. This is sequenced before approval binding deliberately: a binding check on state that can vanish on the next restart is only partially meaningful — durability makes the binding check (next step) actually count for something over time, not just within a single process lifetime.
4. **§7 — Approval-payload binding.** Now that approval records persist, bind them to the exact action/target/payload at dispatch time.
5. **§11 — Provenance correction (synthetic vs. real data tagging).** Independent of 1–4 — this can be done in parallel with any of the above, since it's a data-labeling fix with no dependency on auth or persistence. Called out separately here so it doesn't get silently deprioritized behind the sequential items.
6. **§3/§10 — Verification gate.** Wire the existing deterministic checks (`verification.ts`) into the runtime as an actual pass/fail gate, now that there's a durable, authenticated, correctly-bound workflow to gate.
7. **§8 — Side-effect/idempotency behavior.** Defined last because it's the highest-complexity item and the one most clearly scoped to a single adapter (§8) rather than the whole system — it depends on the loop above already being trustworthy end to end.

## 13. V1 Architecture (build this)

```
Founder (server-verified per §0's deployment decision and §7's invariant — NOT client-supplied identity)
 ↓
Executive Cockpit (already implemented)
 ↓
Directive
 ↓
Sophia — planner (already implemented)
 ↓
Workflow Kernel — persisted beyond process memory (NOT YET IMPLEMENTED — see §12 build order, item 3)
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

## 14. Target Architecture (evolve toward this, not now)

Full relational persistence (Postgres/Prisma or equivalent) for all entities in §6, connected via a real `DATABASE_URL` once §0's deployment decision is made; first-class versioned `Artifact` model (§5); multi-instance-safe concurrency control (§9); session-based multi-user authentication once a second human is added (§7), with live Clerk credentials actually provisioned rather than structurally present but unconfigured; pgvector-based retrieval once the knowledge corpus outgrows full-context injection; broader Composio integrations (Slack/Linear/Calendar) once GitHub-only proves the pattern; E2B sandboxing once autonomous code execution is actually needed; the remaining employee roster (Elena, Marcus) once there's a concrete task only they can do; fine-tuning/eval infrastructure once there's enough real approval-decision volume for it to mean anything; the full Company Brain (§11a), Role Brains (§11b), employee versioning and self-improvement governance (§11c), and continuous market intelligence (§18) — all genuinely valuable, all correctly sequenced after the foundation in ROADMAP.md.

## 15. What Remains Deferred (unchanged unless evidence says otherwise)

pgvector/RAG, E2B, fine-tuning, Elena Rostova, Marcus Vance, broad Composio integrations, multi-user RBAC, voice, persona customization, multi-agent council workflows, Role Brains, employee versioning/evaluation, market intelligence scheduling, any "production security audit" milestone (premature while the app is single-user and internal-only by design — see PRODUCT.md §1).

## 16. Architectural Invariants (precise, minimal, status dated per claim)

1. **Founder authority is established server-side, never from a client-supplied field.** [`8524908`: partially met — middleware/Clerk structure exists; live credentials and the gate.ts blocklist-vs-allowlist gap remain open. §7.]
2. **A privileged action's approval is bound to its exact action/target/payload, checked at dispatch time.** [`8524908`: hash computation implemented; end-to-end enforcement unconfirmed. §7.]
3. **Workflow and audit state survive a process restart.** [`8524908`: met for in-process restart via `DurableFileStore`; not met for container replacement on the stated Cloud Run target — depends on §0. §6.]
4. **Synthetic/example data is never labeled with the same confidence as verified real data.** [`8524908`: a correct governed pipeline now exists (§11); whether the original offending code paths were migrated onto it is unconfirmed. §11.]
5. **"Verified" means a named, mechanically-checkable test passed — not that an LLM said so.** [Still unmet — §3, §10, no new evidence of a workflow-step verification gate.]
6. **External side effects carry idempotency keys where the provider supports them, and unknown-outcome dispatch is surfaced, not guessed at.** [Still unmet — §8.]
7. **Self-improving ≠ self-authorizing.** [Not yet applicable — no self-improvement capability exists to violate this yet; stated now so it governs from the first line of code toward §11c, not retrofitted after the fact.]

## 17. Reference Repository Research (architectural inspiration only — [PRINCIPLE]: do not adopt either runtime wholesale)

**OptimalEngine** (`Bennettxai/OptimalEngine`, Elixir/OTP): the source of the Source→Signal→Claim→Fact→Memory Object lifecycle, provenance tracking, evidence links, verification/review, supersession, and contradiction handling. **Already substantively adopted** in `lib/server/epistemic/` (§11) — this is the correct way to use this reference: take the pattern, keep the existing TypeScript/Next.js/Postgres-Prisma direction, do not import Elixir/OTP.

**FounderOS-DEMO** (`Bennettxai/FounderOS-DEMO`, Next.js/SQLite): explicitly documents itself as "larp-first, real-ready" — seeded with placeholder data by design, with an `/integrations` page giving "honest status for every connector" rather than pretending a disconnected integration is live. The relevant pattern for SamJuniorsOS: **connector/integration status must be honestly reported** (connected/not-configured/error — never silently treated as working), and demo/placeholder data must be structurally distinguishable from real data, exactly as §11's Company Brain principle already requires. Do not adopt FounderOS's specific department/persona UI metaphor or its SQLite-by-default runtime choice.

## 18. Continuous Market Intelligence (target-state — [TARGET], NOT IMPLEMENTED, not v1)

A recurring capability (not a generic dashboard) tracking competitors, customer behavior, technology/product/pricing/channel/regulatory changes specifically relevant to SamJuniors, through: Source → Signal → Claim → Verified Fact → Implication → Recommendation → Decision → Action → Outcome → Learning. This reuses the exact §11 epistemic pipeline — it is a *consumer* of that pipeline (a scheduled/recurring source feeding it), not separate infrastructure. Research must feed real decisions and actions, not only produce reports. Scheduling/cadence (e.g., monthly review) is explicitly out of scope for this documentation task and is not implemented.

---

## Document Change Log
- v1.0.0 → v1.0.1: added scope-deferral annotations based on doc-only review (no repository access).
- v1.0.1 → v2.0.0: full rewrite following direct repository inspection at `7154ffc`. Removed all claims of "done," "immutable," "cryptographic," "zero hallucination potential" that repository evidence did not support at that commit. Removed Clerk as a mandatory dependency; replaced with the precise invariant plus a v1 recommendation. Added Artifact, approval-binding, side-effect-failure, and concurrency semantics that were previously undefined or asserted without mechanism.
- v2.0.0 → v2.1.0: fixed four internal contradictions — conditional persistence requirement (§0 added), retracted shared-secret-in-browser as a frozen auth mechanism, single authoritative build order (§12), explicit v1 external-effect scope (§8). **Never committed to the repository** — existed only as chat output; the repo's own `doc/PRODUCT_ARCHITECTURE.md` remained at v2.0.0 until this revision.
- v2.1.0 → v3.0.0 (this version): reconciled against repository commit `8524908` (4 commits ahead of the last review) and new founder-locked strategic decisions. Updated auth, persistence, and approval-binding [REPO STATE] claims from "absent" to "partial, dated per commit" based on real implementation progress (Clerk middleware, `DurableFileStore`, SHA-256 payload-binding hash) — while identifying that the persistence work solves restart-durability but not the Cloud-Run-container-replacement case §0 warned about, and that `gate.ts`'s blocklist-based role check remains a real gap alongside the new middleware. Added Company Brain (§11a), Role Brains (§11b), Self-Improvement Safety Model and employee versioning (§11c), Reference Repository Research (§17), and Continuous Market Intelligence (§18) as new [TARGET] sections per founder decision — none moved into v1 scope. Locked the internal-only product boundary (was previously an open question) per explicit founder direction — see PRODUCT.md §1.