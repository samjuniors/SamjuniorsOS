# Company Brain Reference Study: JEV, Layered Retrieval, and Worktrees

**Status:** Research / proposal — not an implementation specification  
**Prepared:** 2026-10-01  
**Repository:** SamJuniorsOS  
**Reference material:** User-provided Gobi Automates Instagram carousel screenshots, public Jev/TypeSafe references, and Composio documentation.

## Executive decision

**Adapt the architecture patterns; do not clone the pictured stack.** SamJuniors should own its decision policy, company truth, capability/permission model, workflow lifecycle, verification, and audit trail. Use external services for integrations and specialized capabilities where they materially reduce maintenance. Add infrastructure only when measured workload or a benchmark justifies it.

The screenshots describe a coherent conceptual loop:

1. A lightweight decision/orchestration layer classifies a request and routes it.
2. A Company Brain supplies the relevant context.
3. A tool/integration layer performs external actions.
4. Work is organized into task-specific worktrees with bounded context, skills, and tools.
5. The workflow verifies and records the result, making useful outcomes available to later work.

These are patterns shown in the supplied reference material, not independently verified claims about a production implementation.

## What the reference proposes

### 1. JEV: a fast decision/routing layer

The carousel describes JEV as a "System One" decision model that classifies, routes, and escalates: retrieve context, call tools, or ask a larger LLM when needed. It proposes using structured choices/scores and confidence-based branching to keep common decisions off the expensive reasoning path.

**SamJuniors adaptation:**
- Use deterministic code for authorization, schema validation, state transitions, approval gates, idempotency, and audit.
- Use a small/cheap classifier or structured model call for bounded routing decisions only when rules are insufficient.
- Use a capable LLM for synthesis, planning, ambiguous interpretation, and complex reasoning.
- Treat confidence as a calibrated measurement, not an unquestioned truth. Until evaluated against representative examples, confidence must not authorize consequential actions.
- Log route choice, evidence, model/version, latency, cost, and outcome so the routing policy can be benchmarked.

**Important uncertainty:** Search results identify Jev as a TypeSafe AI decision-focused product and a Jev Lab ecosystem, but this research did not establish stable, generally available API terms, exact current pricing, service guarantees, or whether API access is free. Do not build a hard dependency until first-party API docs, pricing, data handling, and availability are verified. Build an internal DecisionRouter interface so a Jev provider, local model, general LLM, or deterministic rules can be swapped behind it.

### 2. Layered Company Brain

The carousel proposes four conceptual layers:

- **Source layer:** original documents, messages, CRM, files, and structured company data.
- **RAG layer:** fresh retrieval across source material.
- **CAG layer:** cached internal representations for recurring questions.
- **Graph layer:** people, projects, entities, and relationships.

**SamJuniors adaptation:**
- Keep PostgreSQL and authoritative domain records as the source of truth for company state.
- Treat embeddings, summaries, cached representations, and relationship indexes as derived/rebuildable views, not canonical truth.
- Use fresh retrieval when information may have changed; use cached representations only with freshness/version rules and invalidation.
- Add graph/relationship retrieval only for query classes where an evaluation demonstrates a material benefit over relational queries, full-text search, and existing retrieval.
- Preserve provenance: derived answers should link back to source facts/records and identify stale, missing, or conflicting evidence.

**Do not create a separate database/service for each pictured layer by default.** RAG is a retrieval pattern, CAG is a cache/context strategy, and a graph can be a data model or index; these do not automatically require four separate systems. The current memory benchmark work reported by the project indicates a graph layer is not justified merely for its own sake. Reassess only when a real workload exposes a measurable gap.

### 3. One controlled workflow

The reference proposes: Ask → Classify → Retrieve → Select tools → Act/answer → Write back.

**SamJuniors target loop:**

Request → Understand → Retrieve → Plan → Authorize → Execute → Verify → Record → Learn

- A plan is persisted when work is multi-step or has side effects.
- Every action is checked against the founder's identity, capability policy, data scope, and approval requirement.
- External writes have idempotency/retry policies and explicit failure states.
- Verification is distinct from successful tool invocation.
- Only evidence-backed outcomes become durable facts or reusable memory.
- "Write back" means recording outcomes with provenance and lifecycle rules, not blindly turning every model response into company truth.
- The founder can pause, cancel, override, approve, or reject consequential actions.

### 4. Worktrees / task-scoped context

The reference gives specialized worktrees (Sales, Research, Support, Ops, etc.) their own relevant context, skills, tools, and memory.

**SamJuniors adaptation:** Model this first as a persisted task/workflow execution scope, not a new microservice or isolated database per department. Each task should declare:
- objective and expected output;
- task owner/employee identity;
- bounded context and source references;
- allowed capabilities and data scope;
- required skill/procedure and constraints;
- risk/approval policy;
- timeout, retry, cancellation, and recovery behavior;
- verification contract and final artifact;
- audit and provenance links.

Specialized AI employees can later provide different policies and skill bundles over this common execution model. They should not each create their own competing company truth.

### 5. Composio and external data services

Composio's current public documentation describes integrations/toolkits, managed authentication, tool execution, MCP servers, triggers, and Tool Router. Its docs advertise 500+ toolkits. These are provider claims and need to be verified for the specific tools, plans, permissions, and reliability we need.

**SamJuniors adaptation:**
- Evaluate Composio against direct APIs and other integration options per use case.
- Keep SamJuniors' capability registry, authorization, approvals, audit, and company context outside the integration provider.
- Treat an MCP server as a transport/tool-discovery interface, not a security boundary or workflow engine.
- Start with a small set of high-value integrations and least-privilege scopes. Do not enable hundreds of tools simply because they are available.
- Make provider-specific code replaceable; avoid storing canonical company truth only inside a connector platform.
- Treat the carousel's "Treg" as an unverified external-data-provider label from the reference. This research did not establish a specific product/API behind that name; do not add it as a dependency without identifying the exact vendor and terms.

## Repository evidence inspected

- The default branch main package.json was fetched during this research.
- It includes Next.js, Prisma, PostgreSQL-oriented application infrastructure, Zod, Zustand, and related UI/runtime packages.
- It does **not** list Jev or Composio as direct dependencies.
- GitHub keyword searches for orchestrator, MCP connector tools skills, and memory architecture returned no indexed results. Search misses do not prove a capability is absent; inspect exact source paths before implementation claims.
- This document is a research artifact only. It does not change runtime code or assert that the pictured capabilities already exist.

## Build vs. buy / decision matrix

| Capability | Default recommendation | Why / gate |
|---|---|---|
| Decision routing | Build a thin internal interface; begin with deterministic rules + evaluated model routing | Keep provider swappable; use Jev only after API, pricing, privacy, and quality checks |
| Company truth and lifecycle | Own in SamJuniors | Needs authoritative state, provenance, access control, approvals, audit |
| Retrieval | Extend existing PostgreSQL-native approach first | Add semantic, cached, or graph indexes only against a benchmarked need |
| SaaS integrations | Buy/integrate selectively | Mature commodity capability; compare direct API vs integration platform |
| MCP support | Adopt as an adapter where useful | Transport compatibility does not replace permission enforcement |
| Workflow engine | Own the domain lifecycle; use proven libraries/services only if they fit | Must support pause/resume, retries, idempotency, approvals, recovery, artifacts, and audit |
| Task worktrees | Build as scoped execution records over shared infrastructure | Avoid one database/service/agent framework per role |
| Context cache (CAG-like) | Add only with version/freshness/invalidation rules and measured reuse | Stale context is a correctness risk |
| Graph retrieval | Defer until a real benchmark justifies it | Avoid operating a graph database without a demonstrated query gap |

## Risks and required safeguards

1. **Confident wrong routing:** confidence estimates can be miscalibrated. Benchmark on held-out examples; uncertain or high-risk cases escalate.
2. **Prompt injection in retrieved content or tool output:** treat external text as untrusted data; never let it change permissions or system policy.
3. **Connector overreach:** apply least privilege, explicit scopes, server-side authorization, and founder approval for consequential writes.
4. **Duplicate side effects:** use idempotency keys, durable action records, bounded retries, and reconciliation.
5. **Stale cached context:** track source/version/freshness; invalidate or re-retrieve when authoritative data changes.
6. **False memory writes:** distinguish observation, inference, proposal, verified fact, and superseded fact.
7. **Vendor lock-in or unavailable API:** keep provider adapters replaceable and maintain a fallback path.
8. **Unbounded agent-to-agent chatter:** use structured task handoffs and artifact contracts, not uncontrolled free-form loops.
9. **Tool success mistaken for task success:** require output verification and explicit completion criteria.

## Suggested implementation sequence

1. **Finish the current retrieval evaluation checkpoint** and merge only after the documented acceptance audit. Add a generation-side faithfulness/context-use harness before expanding memory infrastructure.
2. **Specify the capability registry and action envelope:** capability ID/version, input/output schema, provider, permissions, data scope, risk class, approval requirement, timeout, retry/idempotency policy, audit requirements, and availability.
3. **Define the single persisted work lifecycle:** objective → plan → authorized actions → artifacts → verification → approval when required → final state/audit.
4. **Implement one or two useful connectors** using direct APIs or an integration platform selected after a focused comparison. Exercise real authorization and failure cases.
5. **Introduce task-scoped worktrees** as workflow context/policy, not separate infrastructure.
6. **Evaluate routing alternatives** (rules, a small model, a larger model, and Jev if a suitable API is available) on a frozen set of representative decisions. Measure accuracy, false-safe rate, latency, and cost.
7. **Add cached context or graph retrieval only when benchmark evidence supports it.**

## Acceptance criteria before autonomous execution expands

- Every capability has an explicit schema and authorization policy.
- Untrusted retrieved content cannot grant capabilities or alter approval requirements.
- Consequential external writes are approval-gated according to policy.
- Retries cannot silently duplicate side effects.
- Every action has durable status, provenance, and an auditable result.
- A task can be paused, cancelled, resumed, or escalated.
- Cached/derived memory can be rebuilt from authoritative sources.
- Routing and context generation are evaluated on held-out cases, including adversarial and ambiguous examples.
- Human override remains available and is recorded.

## Sources

### User-provided reference
- Gobi Automates Instagram carousel screenshots supplied in the SamJuniorsOS conversation, titled around "Build Your JEV Company Brain," "What is Jev?", layered Company Brain, Composio + Treg, one workflow, and worktrees. These images are treated as conceptual reference material, not verified product documentation.

### Public research
- Jev by TypeSafe AI / Jev Lab: https://jev-lab.com/en/ — surfaced in search as a decision-focused system and ecosystem. Direct page content could not be independently fetched during this run; API availability, pricing, privacy, and service terms remain unverified.
- Composio documentation, "Welcome to Composio": https://docs.composio.dev/docs/welcome — describes toolkits, managed authentication, tool execution, MCP servers, triggers, Tool Router, and framework integrations.
- SamJuniorsOS main package manifest: https://github.com/samjuniors/SamjuniorsOS/blob/main/package.json

## Final recommendation

**Adopt the patterns, keep the architecture smaller, and prove the decision layer empirically.** SamJuniors should not need a Jev API to have a decision router, and it should not need a separate graph database or CAG service to have a layered Company Brain. Build stable internal interfaces and governance first; select external providers based on measured usefulness, current terms, and replaceability.
