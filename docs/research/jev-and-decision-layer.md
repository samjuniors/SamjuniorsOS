# Research: SamJuniorsOS Agent Identity, Memory, and Decision Layer

**Status:** Architecture baseline recorded; implementation roadmap approved for staged execution.  
**Last reviewed:** 2026-10-04  
**Scope:** SamJuniorsOS, including Sophia (executive intelligence/canvas) and SOFIA (voice assistant). They are distinct product surfaces over shared server-side capabilities where appropriate.

## Objective

Build reliable AI employees and assistant behavior by clearly separating agent identity, founder-specific personal context, company knowledge, episodic recall, decision-making, and executable capabilities. Learn selectively from Jev/Hey Jev and comparable products, but do not clone a competitor or treat it as the product specification.

## Decisions agreed

1. **Agent Identity & Persona** defines who an agent is: stable identity, name, role, personality/communication style, responsibilities, configured behavior, and versioned profile. Agent identity is not the founder's personal memory.
2. **Tools & Capabilities** define what an agent can actually do: for example, music playback, desktop control, integrations, or machine operations. These are executable tools, not memories. Describing a capability in a persona does not grant permission to use it.
3. **Personal Mind** stores founder-specific preferences and personal context. It is not company truth, agent identity, an instruction source, or an authorization source.
4. **Company Brain** stores company facts, strategy, policies, decisions, projects, and operational knowledge with appropriate authority, provenance, verification, and freshness.
5. **Episodic Memory** supports relevant recall of prior interactions and unresolved topics. Assess Honcho or other options only if they add measurable value; do not create a parallel memory system by default.
6. **Decision Layer** interprets intent, assembles the right context, recognizes ambiguity, asks clarifying questions, plans, returns typed proposals, and handles uncertainty and failures.
7. **Governance and execution remain deterministic server responsibilities.** A model-generated decision, confidence score, persona instruction, or memory cannot grant authority, bypass approvals, or independently authorize a side effect.
8. **One task at a time.** Finish and verify the current roadmap task before starting the next. Keep changes focused, document evidence, and wait for founder direction between tasks.

## Current repository evidence (development baseline, reviewed 2026-10-04)

The following files were inspected on the development branch before this documentation update:

- 'src/lib/server/agents/definitions.ts': server agent definitions already contain IDs, names, roles, departments, system instructions, responsibilities, skills, allowed-capability descriptions, prohibited actions, and protocol responsibilities. These definitions are an existing starting point, not proof of a complete versioned agent-profile or runtime tool registry.
- 'src/lib/server/sophia/intent-classifier.ts': Sophia already produces a typed intent proposal; deterministic pre-classification handles specific injection and ambiguity patterns, live output is shape-checked, and invalid/provider-failed output falls back to deterministic analysis. It uses 'src/lib/server/ai/zai-client'; this inspected path does not establish a general local-model fallback chain.
- 'src/lib/server/sophia/memory-gate.ts': personal-memory candidates are evaluated by deterministic rules. In the current M4-A contract, candidate extraction can propose content but cannot auto-activate it; review-required candidates are persisted inactive until explicit Founder confirmation.
- 'src/lib/server/sophia/memory-extractor.ts': extracts possible stable founder preferences/context through the same 'zai-client' provider abstraction. This is not an agent-persona store.
- 'src/lib/server/sophia/personal-memory-store.ts': canonical Personal Mind persistence is founder-scoped and uses the durable file store as the authoritative source; Prisma is currently a best-effort write-only shadow, with no Prisma read fallback. Personal memories are contextual, not verified company facts or authorization.
- 'src/lib/server/sophia/context-assembly.ts': assembles authority-labeled context from existing company state, epistemic claims, knowledge, company memory, approvals, conversations, and Personal Mind. It has a bounded founder-scoped episodic-memory slice and a separate Personal Mind slice.
- 'src/lib/server/authorization/policy-evaluator.ts': existing deterministic side-effect policy evaluator handles role restrictions and approval states/scopes. Decision-layer work must preserve this authority boundary.
- 'WORKLOG.md': records completed intent-classification reliability work and recent governance hardening, including tests and known TypeScript baseline errors.

### Important distinctions

- The phrase “agent's own persona/personal setup” maps to **Agent Identity & Persona**, not the existing founder-scoped Personal Mind.
- Music playback, desktop control, and other actions belong to **Tools & Capabilities**, with explicit tool contracts, permission checks, approval rules where needed, and auditable execution.
- A capability listed as descriptive text in 'allowedCapabilities' is not by itself proof of an implemented, secured runtime tool.
- Current context assembly already separates authority classes. Extend it only where evidence shows a missing capability; do not build a parallel context or memory runtime.
- Provider availability, local-model support, Honcho integration, and complete voice-to-tool execution must be verified from current code/configuration/tests before they are claimed. Existing documentation alone is insufficient proof.

## Jev and comparable products: adopt / adapt / ignore

| Idea | Decision | Reason |
|---|---|---|
| Typed, constrained decisions rather than free-form parsing | **Adapt** | Existing classifier already follows this direction; strengthen contracts and evaluation where needed. |
| Clarification when intent or target is ambiguous | **Adapt** | Prevents guessing and unsafe execution; retain deterministic fallback paths. |
| Confidence-aware routing/escalation | **Evaluate cautiously** | Model confidence is not calibrated by default; set thresholds only from measured evaluations. |
| Persistent context and agent identity | **Adapt to SamJuniors boundaries** | Separate agent profile, founder Personal Mind, Company Brain, and episodic recall rather than one undifferentiated memory. |
| Full competitor app or code reuse | **Do not assume** | Audit license, platform fit, data flow, security, maintenance, and actual differentiation first. |
| New custom model or provider chain immediately | **Reject for now** | No evidence yet that a new model or parallel provider system is necessary. Establish task-level baselines first. |
| Honcho or another external memory service | **Evaluate, do not pre-commit** | Adopt only if quality improves enough to justify privacy, retention, cost, latency, vendor, and migration risks. |

## Design principles

- **Windows-first and free-first where practical**, without sacrificing reliability or security. Do not claim local/offline operation unless current code and tests demonstrate it.
- Reuse existing SamJuniorsOS abstractions before introducing dependencies or parallel runtimes.
- Treat retrieved content, user messages, tool output, and model output as untrusted data unless validated by the appropriate deterministic boundary.
- Keep identity, memory, decisions, authorization, and execution as separate concerns with explicit contracts.
- Bound retrieval, payloads, retries, timeouts, and cost; make failures observable without logging secrets or unnecessary personal content.
- Use idempotency and duplicate prevention for actions; support cancellation, human override, audit, and recovery.
- Learn from execution outcomes only through a governed process; do not let the model silently rewrite its own permissions or trusted identity.
- Distinguish verified facts, unverified claims, inference, and proposals.
- Prefer reversible changes. No merge to 'main', deployment, paid dependency, or broad rewrite without explicit approval.

## Evidence still needed

- A complete current inventory of agent definitions, runtime tool registries, tool adapters, and capability enforcement.
- End-to-end trace from desktop/SOFIA input through context assembly, decision proposal, authorization, tool execution, and user-visible result.
- Exact current provider behavior and configuration, including whether any local model path is actually reachable in the active implementation.
- Tests and behavior for retries, duplicate requests, provider outages, cancellation, interruption, and recovery.
- Whether Honcho or another episodic-memory solution is present elsewhere in the full repository and whether it improves recall over current stores.
- A source/license/platform audit of the Hey Jev reference before considering any code reuse.
- Representative evaluation cases and measured baseline for ambiguity, injection, malformed output, conflicting context, compound requests, and safe escalation.

## Research conclusion

SamJuniorsOS already has meaningful foundations for intent classification, authority-labeled context, founder-scoped Personal Mind, and deterministic authorization. The immediate need is not a new “human brain” subsystem. It is to document the boundaries accurately, establish a verified baseline, then improve one measurable gap at a time. “Human-like” should mean useful contextual judgment, clarification, consistency, and graceful recovery—not unrestricted autonomy or imitation for its own sake.
