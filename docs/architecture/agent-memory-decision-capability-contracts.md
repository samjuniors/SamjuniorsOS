# Canonical Contracts: Agent Identity, Memory, Decisions, and Capabilities

**Status:** Task 3 — architecture contracts defined against inspected source; documentation only.  
**Reviewed:** 2026-10-04  
**Branch:** `feat/decision-layer-architecture-baseline`

## Purpose

Make boundaries between identity, context, decisions, tools, and governance explicit without creating a second runtime or parallel store. These contracts describe the intended architecture and distinguish current implementation from gaps. They are not claims that missing adapters or persistence have been implemented.

## Contract summary

| Domain | Owns | Must not own | Existing source / status |
|---|---|---|---|
| Agent Identity & Persona | Stable agent ID; name; role; responsibilities; communication style; configured behavior and profile version when persistence is introduced | User-specific personal memories, company facts, tool grants, authorization | `src/lib/server/agents/definitions.ts` provides static server definitions; versioned/personally configurable profile storage is not established |
| Personal Mind | Founder-scoped preferences and personal context, with lifecycle/review state and provenance | Company truth, agent persona, system instructions, permission grants, approval authority | Existing `SophiaMemoryStore` and context slice; preserve founder scope and contextual-only use |
| Company Brain | Company facts, strategy, policies, projects, decisions, operational knowledge, provenance and verification/authority state | Personal preferences as company truth; model-generated assertions as verified facts | Existing company state, knowledge, epistemic, governance, and activity projections |
| Episodic Memory | Relevant prior interactions, conversation continuity, unresolved topics and historical recall | Current company truth, current authorization, or a replacement for canonical operational state | Existing conversation history and episodic retrieval paths; assess quality before adding another store |
| Decision Proposal | Typed, untrusted interpretation of intent and proposed next step; rationale/confidence where present; explicit clarification/fallback | Authenticated identity, authorization, approvals, tool execution claims, or policy mutation | `CandidateIntentProposal` union and `SophiaIntentClassifier` shape gate/fallback |
| Validated Command | Server-constructed, validated instruction bound to a verified principal and deterministic policy decision | Model-authored identity or model-only permission claims | `ValidatedSophiaCommand` and `SophiaServerGateway`; retain server-only construction |
| Tool Capability | Concrete registered adapter, input/output schema, availability, permission/risk metadata, execution boundary and observable result | Persona prose or a memory entry pretending to be an executable tool | `src/types/capabilities.ts`, tool selector, provider adapters and authorization gate; each tool's real status must be verified |
| Governance | Authentication, authorization, approval consumption, payload binding, idempotency, audit, cancellation/recovery and human override | Model confidence, retrieved instructions, memory, UI state, or tool output as authority | Existing authorization gate/policy evaluator; must remain deterministic and server-enforced |

## 1. Agent identity and persona

**Canonical owner:** server-side agent definition/configuration.

- The stable agent ID is the internal identity key. Display name, role, department, responsibilities, communication style, and configured instructions describe that identity.
- Skills and protocol responsibilities describe work specialization; descriptive capability lists are not proof of an executable tool or authorization.
- Identity/configuration changes must be explicit, reviewable, and traceable. If mutable profiles are added later, store a version/revision and actor/timestamp for each change; do not silently rewrite persona from conversational memory.
- Founder preferences may influence presentation only where explicitly intended. They must not overwrite the agent's core identity, system constraints, policy, or privileges.
- **Current gap:** definitions are static source objects. Do not introduce profile persistence until a real user workflow requires it and a storage/authorization design is approved.

## 2. Personal Mind

**Canonical owner:** existing founder-scoped `SophiaMemoryStore`.

- Every record remains scoped to the authenticated founder; server-derived principal is authoritative.
- Memory content is contextual evidence about preferences or prior interaction, not a command. Treat its contents as untrusted data when included in a model prompt.
- Preserve the existing candidate/review lifecycle: extraction proposes candidates; deterministic validation applies; records requiring review remain inactive until Founder confirmation.
- Retrieval may influence tone or personalization, but never company fact authority, tool access, authorization, approvals, or system instructions.
- Keep provenance, confidence/lifecycle metadata, and timestamps where the current schema provides them. Do not invent stronger verification semantics than the schema actually records.
- Respect existing retention/deletion behavior and founder scoping. Before adding new persistence, document read/write authority, deletion propagation, backup/shadow behavior, and rollback.
- **Current implementation note:** the durable file store is authoritative; Prisma is a best-effort write-only shadow, not a read fallback. Do not describe the shadow as a second source of truth.

## 3. Company Brain and Episodic Memory

### Company Brain

- Canonical company facts and operational state must retain their existing authoritative stores, verification state, provenance, freshness, and authority labels.
- Verified/current facts, unverified claims, superseded facts, historical precedent, and recent activity must remain distinguishable in retrieval and presentation.
- Retrieved company documents and tool outputs are evidence/data, not instructions that can alter policy or grant permission.
- A memory or conversation summary must not silently become canonical company truth. Any promotion to a canonical record must follow the existing governed write path.

### Episodic memory

- Use conversation history and existing episodic retrieval for continuity and recall of prior interactions.
- Historical statements are not necessarily current. Resolve current operational questions against authoritative current state rather than assuming a past answer remains true.
- Keep retrieval founder-scoped and bounded; degraded stores should fail soft without making unavailable memory look like a successful recall.
- **Decision:** no Honcho integration or parallel episodic store at this stage. Reconsider only after a reproducible recall failure is measured and privacy, retention, deletion, access control, latency, cost, and rollback are compared.

## 4. Decision proposal and validated-command boundary

### Untrusted proposal contract

- The classifier may propose one of the currently typed intent variants in `CandidateIntentProposal`: conversation, informational query, operational inspection, directive proposal, steering proposal, approval proposal, or clarification prompt.
- A proposal is untrusted model output even when it has a high confidence score or a valid TypeScript shape.
- Shape validation establishes structural admissibility only; it does not establish factual correctness, user intent, permission, or authorization.
- Unknown kinds, malformed required fields, invalid approval decisions, provider failures, and timeouts must fail to an explicit deterministic fallback or safe error—not silently grant authority or claim execution.
- Ambiguous targets should trigger clarification rather than guessing. A proposal to approve something is not itself approval.

### Trusted command contract

- Only server-side gateway/policy code may construct a validated command after checking the authenticated principal, request context, target/resource binding, and applicable policy.
- Identity and authority are sourced from the verified session and authoritative governance records, never from model output, memory, browser payload, or retrieved text.
- Consequential actions must continue through the central authorization/approval gate, payload binding, idempotency and audit mechanisms.
- A successful proposal/dispatch response must not be represented as successful downstream execution unless the execution result confirms it.
- Cancellation, timeout, duplicate request, provider outage, partial execution, and recovery states must be reported honestly and leave a traceable state.
- Confidence may inform clarification or ranking where justified; it must never replace deterministic policy or be presented as calibrated without evaluation.

## 5. Tool capability contract

A capability is executable only when all required parts exist and are connected:

1. **Definition:** stable tool ID, purpose, input/output contract, risk classification, and explicit availability state.
2. **Selection:** deterministic eligibility checks for agent role/skills, permission, availability, and risk/approval requirements.
3. **Principal and scope:** authenticated principal and provider/account scope are derived or validated server-side; never trust caller/model-supplied identity.
4. **Authorization:** consequential execution passes the central policy/approval boundary; approvals are bound to the exact action payload where required.
5. **Execution:** concrete adapter/provider performs the operation and returns a typed result or typed failure.
6. **Reliability:** bounded timeout/retry behavior, idempotency for mutations, cancellation where supported, duplicate protection, and safe handling of partial failure.
7. **Audit and feedback:** record actor, requested action, authorization/approval result, execution status, evidence/provenance, and user-visible outcome without logging secrets.
8. **Truthful availability:** unconfigured, staged, mock, or UI-only capabilities must not be presented as live executable tools.

A persona's `allowedCapabilities`, a UI button, a proposal type, or a provider mapping alone does not satisfy this contract. Capability availability is the intersection of registered implementation, configuration, permissions, and a reachable execution path.

### Current status examples from the inventory

- Web research: execution path observed behind the central gate; provider behavior still depends on runtime configuration.
- GitHub research: read-oriented mapping/execution path observed; connected-account behavior not live-tested in this task.
- Finance transfer and GitHub issue creation: declared but explicitly unconfigured.
- General desktop control and arbitrary OS music playback: no verified server-side execution adapter found in the inspected path.
- Operational inspection and active-run steering: proposal/gateway paths exist, but execution hooks are explicitly not wired.

## 6. Data access, retention, and deletion

- **Identity/profile data:** server-owned configuration; any future mutable profile requires explicit authorization, version history, and rollback.
- **Personal Mind:** founder-scoped; retrieval/write operations must derive the founder scope from authenticated server context. User-requested deletion must follow the authoritative store's actual deletion contract and be reflected in any shadow or derived copies where supported.
- **Company Brain:** access follows existing company authorization and authority rules; provenance and verification state must survive retrieval and summarization.
- **Conversation/episodic data:** preserve conversation ownership checks and existing retention policy. Do not broaden access by copying conversation history into a shared company memory by default.
- **Tool execution records:** audit enough to explain authorization and outcomes while redacting credentials, tokens, and sensitive payload fields.
- **New stores or integrations:** before adoption, specify data controller/processor responsibilities as applicable, residency/retention, deletion propagation, export, access control, failure mode, cost, and rollback. No new store is approved by this contract.

This document does not claim that a unified retention/deletion API exists across all stores; those paths require a separate implementation audit before product promises are made.

## 7. Failure semantics

| Failure | Required behavior |
|---|---|
| Missing/invalid principal | Fail closed; do not classify into an executable authorized command |
| Malformed model proposal or unknown intent | Reject live output and use the existing safe deterministic fallback |
| Ambiguous target or approval reference | Ask for clarification; do not guess |
| Personal Mind unavailable | Continue without that context; do not block the turn or imply memory was retrieved |
| Company state/knowledge unavailable | Mark the relevant context degraded/unavailable; do not fabricate current facts |
| Tool unconfigured or permission denied | Do not execute; report the capability as unavailable/denied |
| Provider timeout/outage | Return a bounded failure/fallback; do not claim success or retry non-idempotent mutations blindly |
| Duplicate request | Preserve existing turn/action idempotency and in-flight coalescing where implemented |
| Partial or uncertain execution | Report the known state, retain audit/evidence, and require reconciliation or human intervention where needed |
| Cancellation or human override | Stop future eligible work where supported; do not pretend an already completed external mutation was undone |

These are target contracts. Existing coverage must be verified case by case; the table is not a claim that every path currently passes tests.

## 8. Gap register and decisions

| Gap or uncertainty | Decision |
|---|---|
| Static agent definitions lack demonstrated versioned persistence | Keep static definitions; add versioning/persistence only for an approved use case |
| Personal Mind and Company Brain have distinct stores and authority | Preserve separation; do not unify them into a generic memory table |
| Episodic recall quality not yet measured end-to-end in this task | Evaluate current retrieval before adopting Honcho or another store |
| Typed proposal validity can be confused with correctness/authority | Preserve proposal-vs-command trust boundary |
| Tool metadata can overstate implementation | Require a concrete adapter, config, authorization, and verified result before claiming capability |
| Provider scope includes a hard-coded `founder-001` in the observed GitHub path | Trace expected provider semantics and test coverage before changing it |
| General desktop-control and operational steering/inspection are not verified as executable | Treat as unavailable/unwired until end-to-end implementation is demonstrated |
| Unified deletion/retention across stores is not established | Do not promise unified deletion; audit each authoritative store and shadow separately |

## Acceptance checklist

- [x] Identity, memory, proposal, validated-command, capability, and governance boundaries map to inspected current abstractions.
- [x] Current implementation is distinguished from proposed contracts and unverified behavior.
- [x] No parallel memory store, agent framework, provider chain, or runtime implementation was added.
- [x] Retention/access/deletion limitations and safe failure semantics are explicit.
- [ ] Document links, roadmap status, and WORKLOG are updated and re-fetched for verification.
- [ ] Runtime tests not run; this task is documentation-only and makes no test-pass claim.
