# Company Brain Reference Study & Current-Repository Audit

**Status:** Research / implementation planning, not an implementation specification  
**Audited:** 2026-10-01  
**Repository:** `samjuniors/SamjuniorsOS`  
**Main commit inspected:** `b9e63ad0fea7f61ae53729b35b0458c92b2f6083` — M4-D Personal Mind retrieval hardening  
**Reference:** User-provided Gobi Automates carousel screenshots describing JEV, a layered Company Brain, Composio + Treg, one workflow, and task-scoped “worktrees.”

## Executive decision

**Adapt the useful patterns, do not clone the pictured stack, and do not rebuild existing SamJuniors abstractions.**

The latest inspected `main` already contains substantial pieces of the pictured architecture: typed skill/tool contracts, deterministic tool selection, a Composio provider adapter, connector health registry, agent definitions/execution/run storage, context retrieval and assembly, persisted workflow runtime/state transitions, authorization/approval gates, scheduling/leases, verification, memory/epistemic code, and a graph read-model area. The immediate task is therefore **implementation maturity and integration-gap audit**, not starting these systems from zero.

The JEV API and its current pricing/availability could not be verified from first-party documentation during this audit. Do not make JEV a dependency. Keep a provider-neutral decision/routing seam only if the existing orchestrator/intent routing does not already provide the required behavior.

## What the carousel proposes

1. **JEV decision layer:** classify, route, escalate; retrieve context, select tools, or invoke a stronger model when needed.
2. **Layered Company Brain:** source data, fresh retrieval (RAG), cached representations (CAG), and graph/relationship retrieval.
3. **Controlled workflow:** Ask → Classify → Retrieve → Select tools → Act/answer → Write back.
4. **Task-specific worktrees:** each task gets bounded context, relevant skills, tools, and memory.
5. **Integration layer:** Composio connects external software; “Treg” is shown as a separate external-data provider, but the exact product behind that name remains unverified.

These are conceptual patterns from the screenshots, not proof that the pictured implementation exists or has the claimed quality.

## Current repository audit — verified from GitHub main

### Existing abstractions to extend, not duplicate

- **Agent roles and execution:** `src/lib/server/agents/definitions.ts`, `executor.ts`, and `run-store.ts` define role metadata, responsibilities, skills/allowed capabilities, execution context, run results, provenance, and persistence.
- **Skill and tool contracts:** `src/types/capabilities.ts` defines skill IDs, structured skill definitions (inputs, procedures, allowed tools, evidence/verification requirements, escalation), tool IDs, tool schemas, risk levels, approval requirements, mutation classes, availability, and provider metadata.
- **Deterministic tool selection:** `src/lib/server/tools/selector.ts` selects tools by required skills, checks availability, denies unknown permissions, handles high-risk approval requirements, and restricts the advisor role from external tool execution.
- **External tool providers:** `src/lib/server/tools/providers/composio.ts`, `github.ts`, and `web_research.ts` exist. The Composio adapter is optional and fails closed when `@composio/core` or `COMPOSIO_API_KEY` is absent. `@composio/core` was not present in the inspected `package.json`, so do not claim live Composio execution is enabled.
- **Connector health registry:** `src/lib/server/integrations/connector-registry.ts` reports explicit configured/unconfigured/degraded/error states for known integrations. This is a connector health/configuration registry; it is not by itself proof that each connector has a complete, usable action adapter.
- **Workflow lifecycle:** `src/lib/server/workflow/runtime.ts`, `state-machine.ts`, `store.ts`, and scheduler/lease files exist. Runtime includes persisted definitions/instances, step transitions, server-derived scheduled-occurrence context, and authorization-gate integration. Do not create a parallel workflow engine.
- **Authorization and approvals:** `src/lib/server/authorization/` contains gate, approval store, payload binding, and policy evaluator.
- **Context and memory:** `src/lib/server/context/`, `src/lib/server/memory/`, `src/lib/server/epistemic/`, and Sophia memory paths exist. Main's last inspected memory milestone is M4-D, with deterministic query-conditioned retrieval, ACTIVE-only personal-memory eligibility, founder scoping, and bounded rendering.
- **Graph and company read models:** `src/lib/server/graph/` exists and `ARCHITECTURE.md` describes GraphDTO as a read model. Do not infer that a dedicated graph database or graph-based memory retrieval is present.
- **Agent collaboration:** the repo has an `agent-collab` API route (not enough evidence here to claim a general-purpose, bounded agent-to-agent task protocol). Inspect its exact contract before extending it.
- **Developer-tool capability list:** root `CAPABILITY_REGISTRY.md` is primarily a guide for Claude Code/MCP development tools by project phase. It is **not** the same thing as the app's runtime capability/tool registry in `src/types/capabilities.ts`.

### Current branch reality

- The remotely visible `main` branch is still at M4-D commit `b9e63ad0fea7f61ae53729b35b0458c92b2f6083`.
- The previously reported `feat/m53-postgres-retrieval-experiment` branch and `docs/architecture/M5_3_POSTGRES_RETRIEVAL_EXPERIMENT.md` were **not found on GitHub** during this audit. This is consistent with the report that M5.3 is local/unpushed; the local branch must be inspected directly before deciding it is the current next milestone.
- Remote branches currently visible include older M4 memory branches and `research/company-brain-jev-reference`; no remote M5.3 branch was returned.
- The repo's `PROGRESS.md` and `ARCHITECTURE.md` contain Phase 4C-B/4C-B-era snapshots and may not reflect every later local experiment. The current code, current git refs, and tested branch must be reconciled before treating any roadmap document as current.
- The open research PR is #1. This document is on the research branch, not merged into `main`.

This audit was conducted through GitHub's current remote refs and file contents. It does not inspect an unpushed local working tree, run tests, or prove production credentials/integration connectivity.

## Recommended interpretation for SamJuniors

### 1. Decision routing / JEV

**Recommendation: do not integrate JEV yet; do not build a second orchestrator.**

First audit the existing Sophia intent classifier, `brain.ts`, `src/lib/server/orchestration/orchestrator.ts`, tool selector, and current orchestration entrypoints. Identify whether there is a concrete routing failure measured on representative requests. If a gap exists, add a small provider-neutral policy/interface inside the existing orchestration boundary. Use deterministic rules for authorization, validation, state transitions, approvals, idempotency, and audit. Use models for classification or synthesis only where necessary and evaluated. Confidence estimates must never grant permissions or authorize consequential actions.

A JEV provider is worth reconsidering only after verifying first-party API access, pricing, privacy/data handling, latency, reliability, and a measurable advantage over the existing path.

### 2. Layered Company Brain

Treat the layers as **retrieval strategies and derived views**, not a mandate to deploy four databases/services.

- **Source/authority:** PostgreSQL/domain records and source-system data remain authoritative according to the existing architecture.
- **Fresh retrieval:** use existing context/retrieval abstractions and structured/full-text queries first.
- **Cached context:** only add when reuse is demonstrated; version it, track freshness, and define invalidation/rebuild behavior. Never let cache become canonical truth.
- **Graph/relationships:** use the existing graph/read-model infrastructure where appropriate. Do not add Graphiti, Neo4j, or another graph database solely because the carousel depicts a graph layer.
- **Provenance:** retain source references, timestamps, authority, and conflict state. A successful retrieval is not proof that a generated answer used the evidence faithfully.

The reported local M5.3 benchmark suggests a dependency-relation read model improved a particular query class and that other graph infrastructure was not justified by that fixture. That evidence is not currently reproducible from GitHub main because the M5.3 branch/report are not remotely present. Validate it on the local branch and preserve the frozen fixture before relying on it.

### 3. Workflow and “worktrees”

**Recommendation: map “worktrees” to existing persisted workflow/task scopes first.** Do not create per-department microservices, databases, or competing memories. Inspect current workflow definitions, context assembly, agent run provenance, step dependencies, and retry/cancel/approval behavior. Only add a task-scoped context object if a concrete gap is found.

A work/task scope should eventually make explicit: objective, assigned role, context/source references, permitted capabilities, skill/procedure, approval/risk policy, deadline/timeout, retry/idempotency rules, artifacts, verification criteria, and audit lineage. Prefer extending existing workflow/agent types over creating parallel types.

### 4. Tools, connectors, MCP

**Recommendation: mature the existing adapter and policy layer rather than add a blanket integration framework.**

- Keep SamJuniors' own capability/tool definitions, permission evaluation, approval binding, audit, and workflow lifecycle authoritative.
- Compare direct APIs with Composio for each prioritized integration; choose the smallest useful initial set.
- Do not install or enable hundreds of tools because a provider advertises them.
- Treat MCP as an optional transport/discovery adapter, not as an authorization boundary.
- Test real configured/unconfigured/degraded states, token scope, schema validation, prompt injection in tool output, timeouts, rate limits, retries, idempotency, duplicate writes, and human approval.
- Keep provider credentials server-side and never let retrieved content or model output modify capability grants.

### 5. Skills and agent-to-agent delegation

The repo already has structured skill contracts and named agent roles. The next audit is whether skills are actually selected/executed through a single governed path, and whether collaboration uses typed task handoffs with explicit outputs/dependencies rather than merely passing text between agents.

Do not build an “agent chat network.” Prefer a bounded handoff: task + objective + allowed tools/context → durable artifact + evidence + status → verifier/next workflow step. Every role should share authoritative Company Brain state and receive only the context/capabilities needed for its task.

## Weak ideas to drop or defer

| Idea | Decision | Reason |
|---|---|---|
| Hard dependency on JEV | **Defer / likely drop unless benchmark proves value** | API, pricing, privacy, and measurable advantage are unverified; existing routing/orchestration already exists |
| Build a second tool/capability registry | **Drop** | Runtime tool/skill contracts and deterministic selector already exist |
| Build a second workflow engine | **Drop** | Persisted WorkflowRuntime/state machine/scheduler/authorization integration already exist |
| Treat root `CAPABILITY_REGISTRY.md` as the app's runtime registry | **Drop** | It is a developer-tool/MCP installation guide; runtime contracts are elsewhere |
| Add a graph DB/Graphiti now | **Defer** | No demonstrated requirement beyond the existing graph/read-model approach; M5.3 local evidence still needs branch reconciliation |
| Add CAG as a separate service | **Defer** | Cache strategy is not a separate canonical memory system; freshness and invalidation risks must be justified by workload |
| Create independent “worktree” infrastructure per department | **Drop** | Start with existing workflow/agent task scopes |
| Integrate “Treg” from the image | **Drop until identified** | Exact vendor/product/API is not verified |
| Enable a large connector catalog immediately | **Drop** | Expands permission surface and operational failure modes before user value is proven |

## Recommended next sequence

1. **Reconcile local and remote git state first.** Inspect local branches, worktree status, uncommitted changes, current `origin/main`, and the exact local M5.3 commit. Do not overwrite or reset the local branch. Confirm whether the reported frozen benchmark fixture and experiment report exist and match their stated digest.
2. **Run a focused M5.3 acceptance audit** against the actual current base and existing architecture. Check migration/schema integrity, derived dependency relation rebuildability, provenance, depth/cycle bounds, determinism, failure behavior, all benchmark query diffs, governance gates, and tests. If accepted, update the report and create a clean branch/PR; do not push unrelated working-tree changes.
3. **Then run the proposed M5.4 generation-side faithfulness/context-use harness** against the same frozen fixture. Retrieval recall alone cannot prove that the model used retrieved evidence correctly. Measure grounded support, ignored relevant evidence, unsupported claims, contradiction handling, source attribution, and deterministic repeatability. Keep this as an evaluation harness before changing production prompts or memory behavior.
4. **After memory acceptance, audit one end-to-end action path** using existing workflow → agent/skill → tool selection → authorization/approval → provider → verification → audit. Select one low-risk read or reversible operation. Do not build new registries/frameworks before this trace is verified.
5. **Select the first real connector based on founder workflow value**, then compare direct API vs Composio on implementation cost, permissions, scopes, reliability, rate limits, retries, idempotency, cost, and replacement risk.
6. **Evaluate JEV only if a routing benchmark identifies a problem** that the existing classifier/orchestrator cannot economically solve.

## Acceptance gates

- Existing main abstractions are extended rather than duplicated.
- Company truth remains server-authoritative; derived indexes/cache are rebuildable.
- Tool output and retrieved documents are treated as untrusted data.
- Unknown capability, permission, or provider state fails closed.
- External side effects are idempotent/recoverable and approval-gated by risk.
- Workflow/agent execution is durable, auditable, cancellable, and verifiable.
- Memory writes distinguish proposals, founder-confirmed personal memories, evidence-backed company facts, and derived summaries.
- Benchmarks are frozen, repeatable, and include failure/contradiction cases.
- No production-readiness or live-integration claim is made without credentials and real execution evidence.

## Public/reference sources

- User-provided Gobi Automates carousel screenshots (conceptual reference; not verified implementation documentation).
- Composio docs: https://docs.composio.dev/docs/welcome — public docs describe toolkits, managed authentication, tool execution, MCP servers, triggers, and Tool Router; individual integration support and commercial terms must be checked for the actual use case.
- Jev/TypeSafe reference surfaced as https://jev-lab.com/en/; first-party API availability, pricing, privacy, and reliability terms remain unverified in this audit.
- Current SamJuniorsOS main package manifest: https://github.com/samjuniors/SamjuniorsOS/blob/main/package.json
- Current main architecture: https://github.com/samjuniors/SamjuniorsOS/blob/main/ARCHITECTURE.md
- Runtime skill/tool contracts: https://github.com/samjuniors/SamjuniorsOS/blob/main/src/types/capabilities.ts
- Tool selection: https://github.com/samjuniors/SamjuniorsOS/blob/main/src/lib/server/tools/selector.ts
- Workflow runtime: https://github.com/samjuniors/SamjuniorsOS/blob/main/src/lib/server/workflow/runtime.ts
- Composio adapter: https://github.com/samjuniors/SamjuniorsOS/blob/main/src/lib/server/tools/providers/composio.ts
- Connector registry: https://github.com/samjuniors/SamjuniorsOS/blob/main/src/lib/server/integrations/connector-registry.ts
- Personal memory architecture: https://github.com/samjuniors/SamjuniorsOS/blob/main/docs/architecture/SOPHIA_MEMORY_ARCHITECTURE.md

## Final recommendation

**The useful reference is a routing-and-context policy over a governed execution system, not a mandate to adopt JEV, CAG, a graph database, Composio everywhere, or a new workflow framework.** SamJuniors already has important underlying abstractions. First reconcile the unpushed M5.3 work, then validate memory generation faithfulness, then prove one complete, safe external-action path using the current workflow/tool/authorization architecture. Add new infrastructure only when a measured gap requires it.
