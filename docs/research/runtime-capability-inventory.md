# Runtime Identity, Tool, and Execution Inventory

**Status:** Task 2 — source-level inventory completed; runtime tests and end-to-end behavior are not yet independently executed in this task.  
**Reviewed:** 2026-10-04  
**Branch:** `feat/decision-layer-architecture-baseline`

## Scope and method

This inventory traces the current source-level path from an authenticated SOFIA request to intent proposal, governance, orchestration, tool execution, and response. It is based on current files in this branch, which inherited application code from `development`. This is a source inspection, not a claim that every provider or path was live-tested.

## 1. Agent identity and persona

**Primary source:** `src/lib/server/agents/definitions.ts`

The existing `ServerAgentDefinition` contains:
- role ID, name, role title, department;
- system instruction;
- responsibilities and skills;
- descriptive `allowedCapabilities`;
- prohibited actions;
- protocol responsibilities.

**Boundary:** This is a static server-side agent definition. The inspected type does not itself provide a versioned profile store, per-founder agent-persona persistence, or runtime machine-control implementation. A capability written in `allowedCapabilities` is descriptive metadata unless a real tool and authorized execution path also exist.

## 2. SOFIA request path

**Sources:** `src/app/api/sofia/ask/route.ts`, `src/sofia/lib/api.ts`, `src/sofia/lib/brain.ts`, `src/lib/server/sophia/turn-executor.ts`

Current source path:

1. The SOFIA browser client posts a turn to `/api/sofia/ask`; the route requires an authenticated Founder session.
2. The route delegates to the canonical `executeSophiaTurn`; browser-supplied persona/history are compatibility-only and do not replace server-owned conversation history.
3. `executeSophiaTurn` resolves/creates a founder-bound conversation, checks completed-turn idempotency, coalesces in-flight duplicate turns, persists the founder message, and retrieves bounded server-side history.
4. `SophiaContextAssembler.assemble` retrieves authority-labeled context, including the separate founder-scoped Personal Mind and episodic context.
5. `SophiaIntentClassifier.classify` returns a typed proposal. It uses `zai-client`, validates the returned shape, and has deterministic pre-classification/fallback paths.
6. `SophiaServerGateway.process` strips untrusted identity/authorization fields from the proposal, binds the founder principal from the server session, and dispatches by proposal type.
7. For a directive proposal, only a Founder session with execution enabled reaches `MultiAgentOrchestrator.orchestrateDirective`; otherwise it is framed as prepare-only or rejected.
8. The orchestrator runs the existing specialist-agent protocol, selects from its declared tools, and conditionally executes supported research paths.
9. The assistant reply is persisted with an assistant idempotency key; the route streams the result to the browser through SSE.

This is one canonical Sophia turn path; it should not be replaced by a second independent decision engine.

## 3. Current tool definitions and real execution

**Sources:** `src/types/capabilities.ts`, `src/lib/server/tools/selector.ts`, `src/lib/server/orchestration/orchestrator.ts`, `src/lib/server/tools/definitions/github.ts`, `src/lib/server/tools/providers/composio.ts`, `src/lib/server/authorization/gate.ts`

### Observed orchestration tools

| Tool | Source-level status | Evidence |
|---|---|---|
| `web_research` | Declared available; wired to internal web research execution | Orchestrator selects it and calls `executeWebResearch` inside `SideEffectAuthorizationGate.executeWithGate`. |
| `github_repository_read` | Declared; read-only Composio mapping and GitHub intelligence execution path exist | GitHub tool definition, Composio mapping/provider, and gated `executeGitHubIntelligence` path. Actual execution still depends on provider/account configuration. |
| `github_read` | Declared; read-only Composio mapping and GitHub intelligence execution path exist | Same guarded GitHub research path. |
| `github_issues_read` | Declared; read-only Composio mapping exists | Tool definition and provider mapping; this inspection did not establish an independent end-to-end orchestration branch for it. |
| `finance_transfer` | Declared but unconfigured; not executable | Orchestrator explicitly documents that no finance executor is wired and marks availability `unconfigured`. |
| `github_issue_create` | Declared but unconfigured; not executable | Availability is `unconfigured`; approval metadata alone does not implement a write executor. |

The deterministic selector filters by required skills, tool availability, permissions, risk/approval requirements, and role restrictions. Unknown or unconfigured tools must not be presented as executable capabilities.

For the observed web and GitHub research branches, orchestration wraps execution with `SideEffectAuthorizationGate.executeWithGate` and emits structured execution evidence. Source-backed findings may be persisted through the existing epistemic pipeline with source-to-signal-to-claim lineage. The authorization gate includes policy evaluation, approval checks, payload binding, idempotency, and audit paths; this source inventory does not prove every failure case works in live deployment.

## 4. Governance and execution boundary

**Sources:** `src/lib/server/authorization/gate.ts`, `policy-evaluator.ts`, `payload-binding.ts`, `src/lib/server/sophia/server-gateway.ts`

- The gateway removes model-provided identity, credential, role, and authorization fields before processing.
- Authenticated session identity, not proposal content, determines the founder principal.
- Directive dispatch is restricted to the Founder role in the gateway.
- Tool selection is deterministic and permission-aware.
- Consequential side effects are expected to pass the central authorization gate and approval/payload-binding checks.
- Approval records are authoritative; a model proposal cannot independently approve itself.
- Single-action approval consumption and idempotency are handled in the central gate.

**Follow-up for implementation:** audit the provenance of every identity passed into downstream provider scopes. In the observed GitHub orchestration branch, the Composio `sessionScope.userId` is hard-coded as `founder-001` instead of being visibly threaded from the verified request principal. This may be a legacy internal scope label, but it needs tracing before any change; do not silently replace it without checking provider expectations and tests.

## 5. Voice, music, and desktop capability boundary

**Sources:** `src/app/api/sofia/stt/route.ts`, `src/sofia/lib/capabilities.ts`, `src/sofia/lib/music.ts`, `src/sofia/lib/brain.ts`

- SOFIA's STT route requires a Founder session before calling the configured transcription provider chain.
- `src/sofia/lib/capabilities.ts` describes available speech/voice engines; it is not a registry of server-authorized desktop actions.
- `src/sofia/lib/music.ts` plays local UI/audio cues such as startup, ambient, and work sounds. It does not establish arbitrary music-app control or operating-system playback control.
- The inspected server tool types and orchestration registry do not expose a verified desktop-control tool for mouse/keyboard/system operations.
- The gateway's `operational_inspection` path explicitly says dispatch is not wired and no inspection was executed.
- The `steering_proposal` path acknowledges a run but explicitly says operational steering hooks are staged and do not control active tasks.

**Conclusion:** Do not tell users that general machine control, arbitrary music playback, live inspection, or operational steering is implemented based on persona descriptions, UI sound playback, or registered proposal types. These require actual tool adapters, scoped permissions, user-facing confirmations where appropriate, and end-to-end tests.

## 6. Tests located (not executed in this inventory task)

The repository tree includes relevant test files:
- `tests/sophia/phase1_conversational_executive.test.ts`
- `tests/sophia/phase1_intent_contract.test.ts`
- `tests/sophia/phase2_grounding_context.test.ts`
- `tests/sophia/phase3_conversation_persistence.test.ts`
- `tests/sophia/phase4a_live_session_foundation.test.ts`
- `tests/sophia/phase4b_audio_ingress_vad.test.ts`
- `tests/sophia/phase4c_streaming_stt_adapter.test.ts`
- `tests/sophia/m3_conversation_convergence.test.ts`
- `tests/sophia/m3_authority_hardening.test.ts`
- `tests/sophia/r1_honesty_consolidation.test.ts`
- `tests/sophia/r2_engine_convergence.test.ts`
- `tests/sophia/realtime_governance_audit.test.ts`

Presence in the tree is not evidence of a passing test. This task did not run tests or inspect CI results.

## 7. Inventory conclusions and gaps

1. **Existing foundation to reuse:** static agent definitions, a canonical Sophia turn path, authority-partitioned context assembly, typed intent proposals, deterministic authorization, tool selection, gated research execution, and epistemic evidence lineage.
2. **Agent persona gap:** static definitions are not yet demonstrated to be a versioned, user-configurable agent identity/personal-setup system.
3. **Machine capability gap:** no verified general desktop-control or arbitrary music playback adapter was found in the inspected tool registry/path; current music module is UI audio.
4. **Operational dispatch gap:** inspection dispatch and active-run steering are explicitly not wired to real execution hooks.
5. **Tool availability gap:** finance transfer and GitHub issue creation are explicitly unconfigured declarations.
6. **Identity threading question:** the GitHub research path uses a hard-coded `founder-001` provider scope label; trace before changing.
7. **Runtime verification gap:** this is a source-level inventory. Provider credentials, connected accounts, real audio/device behavior, failure recovery, and the tests above remain unverified here.

## Task 2 outcome

The inventory is complete at source level and identifies the actual request path, existing tool boundaries, explicit non-implementations, and the main identity-threading question. No runtime code was changed. The next roadmap task is to define canonical contracts using these existing abstractions and only the gaps demonstrated here.
