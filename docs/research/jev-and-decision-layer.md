# Research: Jev, Hey Jev, and a SamJuniors decision layer

**Status:** Initial research captured — third-party repository audit and implementation feasibility are still pending.  
**Last reviewed:** 2026-10-04  
**Scope:** SamjuniorsOS / Sophia (executive neural canvas) and its relationship to SOFIA (voice assistant). These are distinct surfaces.

## Objective

Study the decision-oriented approach associated with TypeSafe's Jev and the community `hey-jev` repository, then determine whether SamJuniorsOS should reuse, adapt, or independently implement useful ideas for Sophia/SOFIA. Priorities: Windows-first, zero-cost to start, optional provider keys, local operation where feasible, and no duplicate runtime authority.

## Sources and evidence status

### TypeSafe AI — company positioning

- Official site: https://typesafe.ai/
- The site describes TypeSafe as an AI lab focused on making intelligence more accessible and less expensive, and emphasizes intelligence beyond chat.
- The official public homepage reviewed in this research session does **not** provide enough technical detail to establish the full Jev API contract, current pricing, local-weight availability, or the claimed model training method.
- Treat the official product documentation and console as the authority for current API access, terms, models, and pricing. Re-check before implementation.

### Hey Jev repository

- Repository supplied by the founder: https://github.com/henryklunaris/hey-jev
- The repository is a **reference candidate**, not yet approved production code.
- The current repository contents, license, dependencies, macOS-specific assumptions, release history, and Windows support have **not yet been independently inspected successfully** in this research pass.
- Do not claim compatibility or copy code until the agent clones the repository and records its license and actual platform constraints.

### Existing SamjuniorsOS capabilities (verified from current README and setup guide)

- Repository: https://github.com/samjuniors/SamjuniorsOS
- Current README describes three distinct surfaces: SOFIA (voice-driven assistant), Sophia (executive neural canvas), and the SamJuniorsOS desktop.
- Current setup guide documents a zero-key start and an LLM fallback chain, including an OpenAI-compatible local endpoint via Ollama, LM Studio, vLLM, or llama.cpp.
- Therefore, do not create a parallel general-purpose LLM provider chain just to experiment with Jev-like decisions. First inspect and extend the existing abstractions where appropriate.
- Relevant existing docs: [SOFIA setup](../sofia/SETUP.md) and [SOFIA merge prompt](../sofia/MERGE_PROMPT.md).

## Working interpretation: what is worth learning from Jev?

A decision-oriented model/API is useful when software needs a constrained answer to a well-defined question rather than open-ended prose. Candidate operations include:

- routing a task to an agent or workflow;
- classifying an incoming request;
- scoring urgency or risk against a documented rubric;
- extracting a constrained label;
- checking whether an action meets a policy condition;
- deciding whether to ask for clarification or escalate to a human.

These are **candidate use cases**, not proof that Jev or a local model is accurate enough for SamJuniors. Validate each against representative examples.

## Adopt / adapt / avoid

| Idea | Recommendation | Rationale |
|---|---|---|
| Typed decision outputs instead of parsing free-form prose | **Adapt** | Use explicit schemas, enums, score ranges, validation, and versioned rubrics. |
| Batch several related questions against the same context | **Evaluate** | Can reduce request overhead, but only if supported by the chosen implementation and not harmful to isolation or latency. |
| Confidence-aware escalation | **Adapt cautiously** | Confidence is not automatically calibrated. Establish empirical thresholds with held-out evaluations; fail closed for consequential actions. |
| Dedicated hosted Jev API | **Optional experiment only** | Requires account/key, service availability, terms, network, and possibly cost. Never make it a required dependency for startup. |
| Build a proprietary Jev-equivalent model immediately | **Do not start here** | Training a competitive calibrated decision model requires data, evaluation, compute, and ongoing maintenance. First establish the product need and baseline performance. |
| Reuse the whole Hey Jev app as a production subsystem | **Not yet approved** | License, platform assumptions, architecture, security, and maintenance cost are not yet audited. Prefer selective porting of small, well-understood components. |

## Proposed SamJuniors direction

Build a **Decision Layer**, not a second general-purpose assistant or workflow runtime.

The initial layer should be a small, replaceable interface that accepts a typed task/context and returns a schema-validated decision. Candidate backends, in order of preference for initial experiments:

1. deterministic rules for cases that do not need ML;
2. a local model already supported by the repository's provider abstractions;
3. optional external decision API after an evaluation shows a measurable advantage;
4. model training/fine-tuning only after we have a real dataset, evaluation baseline, and evidence that simpler options are insufficient.

The layer must not gain authority to execute side effects merely because it produced a decision. Existing backend authorization, approval, idempotency, audit, and execution paths remain authoritative.

## Windows-first constraints

- Developer setup and first-run instructions must target supported Windows environments first.
- Inspect `hey-jev` for macOS-only frameworks, APIs, scripts, build tools, permissions, and assumptions before porting.
- Prefer cross-platform TypeScript/Node/Bun patterns already used by SamjuniorsOS when they fit the current repository.
- Keep platform-specific adapters isolated; do not spread OS conditionals through the decision logic.
- Verify on a real Windows environment or CI runner before claiming Windows support.

## Free-first and key policy

- Baseline development and core app startup must work without a Jev/TypeSafe key.
- Any external API integration must be optional, disabled when unconfigured, and report its status honestly.
- API keys stay server-side in environment variables or the existing secret/configuration mechanism. Never place secrets in browser code, source files, committed examples, logs, or screenshots.
- Do not assume a free tier, credits, API availability, or license permissions without checking the current official terms.
- Do not add a paid service or a new dependency to the default startup path without founder approval.

## Risks and open questions

1. What is the actual license and dependency footprint of `hey-jev`?
2. Which components are macOS-specific, and what is the smallest useful cross-platform unit?
3. Does Sophia currently have an explicit structured decision interface, or is decision logic embedded in existing orchestration?
4. Which high-value workflow decision has measurable pain today?
5. What local model and hardware are available on target Windows machines?
6. What quality, latency, memory, and cost thresholds should the baseline meet?
7. What exact Jev API access, terms, limits, and pricing are currently available to this account?

## Research acceptance criteria

Before implementation is approved, the agent must add evidence for:

- repository license and dependency inventory;
- Windows compatibility assessment with exact failing/passing commands;
- current SamjuniorsOS integration points and ownership boundaries;
- a small benchmark set with expected answers and failure cases;
- baseline comparison: deterministic rules vs local model vs optional API, where applicable;
- security review for prompt injection, untrusted state, secret handling, retries, and side-effect authorization.

## Evidence labels

- **Verified this session:** Current SamjuniorsOS README and SOFIA setup guide describe distinct surfaces, zero-key startup, and a local OpenAI-compatible LLM option.
- **Verified this session:** Official TypeSafe public homepage positioning was reviewed.
- **Not verified:** Hey Jev source/license/platform details; Jev API specifics, current pricing, account availability, local weights, and model-training details.
- **Inference:** A typed decision layer may complement existing assistants/orchestration, but value must be proven by task-level evaluation.
