# Plan: Agent Identity, Memory Boundaries, and Reliable Decision Layer

**Status:** Tasks 1–5 completed on the feature branch. S6 regression suites are green; 153 baseline-equivalent TypeScript diagnostics remain. No merge or deployment.  
**Owner:** Founder + SamJuniors engineering agent  
**Repository:** SamJuniorsOS  
**Branch policy:** Work on a focused feature branch based on current development. Never modify main, merge, deploy, or start a later task without the founder's direction.  
**Execution rule:** One task at a time. Finish the current task, verify it, report the result, then stop.

## Objective

Improve Sophia/SOFIA and AI employee behavior by extending existing SamJuniorsOS architecture, not by creating a competing assistant, memory stack, or workflow runtime. The goal is reliable contextual judgment, consistent identity, useful memory, clarification when uncertain, safe tool execution, and graceful failure recovery.

## Agreed boundaries

### 1. Agent Identity & Persona
Defines who each agent is: stable identity, name, role, personality and communication style, responsibilities, configured behavior, and versioned profile. Existing server agent definitions are the starting point. Do not assume they already provide versioned persistence or full runtime profile management.

### 2. Personal Mind
Founder-specific preferences and personal context. Existing Personal Mind must remain founder-scoped and contextual only. It is not agent identity, company truth, an instruction source, or an authorization source.

### 3. Company Brain
Company facts, strategy, policies, projects, decisions, procedures, and operational knowledge with provenance, verification state, authority, and freshness. Preserve current authority partitions and canonical stores.

### 4. Episodic Memory
Useful recall of past interactions, unresolved topics, and relevant history. Audit existing conversation/episodic paths before considering Honcho or another external system. No parallel memory store without a demonstrated gap and a migration/deletion/access plan.

### 5. Decision Layer
Interprets user intent, assembles relevant context, handles ambiguity, asks clarifying questions, plans where appropriate, and emits typed proposals with explicit failure behavior. The model is replaceable and is not the governance authority.

### 6. Tools & Capabilities
Music playback, desktop control, and external integrations are executable capabilities, not memories. A persona or capability description does not itself grant runtime access. Each real action must go through the existing tool boundary, least-privilege permissions, deterministic authorization, approval rules where required, idempotency, and audit. Never imply a tool works until its implementation and end-to-end behavior are verified.

### 7. Governance
Model output, retrieved memory, user-provided text, tool results, and confidence values cannot grant permissions or bypass approvals. Preserve deterministic server authorization, human override, and safe recovery. No autonomous learning may silently modify identity, policy, or privileges.

## Current baseline

Reviewed on 2026-10-04 against the development branch. Relevant existing files:

- 'src/lib/server/agents/definitions.ts' — current static server agent identity, role, responsibilities, skills, capability descriptions, prohibitions, and protocol responsibilities.
- 'src/lib/server/sophia/intent-classifier.ts' — typed proposal contract, deterministic pre-classification for selected injection/ambiguity cases, shape validation, and deterministic fallback; uses 'zai-client'.
- 'src/lib/server/sophia/memory-gate.ts' and 'memory-extractor.ts' — deterministic personal-memory gate plus model-proposed candidates; current review-required candidates stay inactive pending Founder confirmation.
- 'src/lib/server/sophia/personal-memory-store.ts' — founder-scoped Personal Mind; durable file store is authoritative, Prisma is a best-effort write-only shadow, and there is no Prisma read fallback.
- 'src/lib/server/sophia/context-assembly.ts' — authority-labeled context assembled from existing company, governance, conversation, episodic, and Personal Mind sources.
- 'src/lib/server/authorization/policy-evaluator.ts' — deterministic side-effect policy and approval evaluation.
- 'WORKLOG.md' — prior classifier reliability and governance hardening results.

This baseline is not proof that all voice-to-tool paths, local-model fallback, Honcho integration, runtime tool permissions, Windows behavior, or recovery cases are complete. Verify them before making claims.

## Roadmap — execute sequentially, one task per session

### Task 1 — Repository baseline and architecture documentation
- Update the research and plan documents to reflect current code, agreed boundaries, verified behavior, and open questions.
- Reconcile stale claims and status labels; distinguish implementation from proposals and unknowns.
- Record this decision and the current task status in WORKLOG.
- Verify the edited documents and commit on the feature branch.
- **Stop after reporting. Do not start Task 2 in the same pass.**

**Acceptance:** Documentation matches inspected code; no unverified capabilities are described as implemented; branch and commit are reported.

### Task 2 — Inventory current identity, tools, and execution boundaries — COMPLETE
- Source-level inventory recorded in `docs/research/runtime-capability-inventory.md`.
- Traced SOFIA ingress through canonical turn execution, context assembly, intent proposal, server gateway, orchestration, gated research tools, persistence, and SSE response.
- Identified configured and unconfigured tools, current persona definition shape, missing general desktop-control adapter in the inspected runtime path, unwired inspection/steering dispatch, and a hard-coded provider scope identity requiring follow-up.
- Tests were located but not run; provider/device behavior remains unverified.

**Acceptance:** Met for source-level inventory. Runtime tests and provider behavior remain explicit follow-up evidence, not assumed successes.

### Task 3 — Define and document canonical contracts — COMPLETE
- Contract document: `docs/architecture/agent-memory-decision-capability-contracts.md`.
- Defined ownership, trust boundaries, provenance, identity/versioning expectations, data access and deletion limitations, capability availability, and failure semantics for identity/persona, Personal Mind, Company Brain, episodic memory, decision proposals, validated commands, tools, and governance.
- Mapped each contract to current source abstractions and marked gaps without adding a parallel store or changing runtime code.
- Provider-scope identity concern remains open for a separately scoped trace; no change made.

**Acceptance:** Met for architecture documentation. Runtime behavior, deletion coverage, and individual failure cases are not newly tested by this documentation task.

### Task 4 — Decision reliability evaluation — BASELINE RECORDED
- Evaluation catalog v1 recorded in `docs/research/decision-reliability-evaluation-v1.md`.
- Reported execution at commit `7024a4925f2c6ad92e2738ce0b2aa4c9a9086e90`: intent contract 22/22, honesty consolidation 17/17, and authority hardening 10/10; total 49 passed, 0 failed, all commands exit 0.
- The intent suite used a provider SDK fake. Live-provider quality suites were intentionally out of scope.
- Authority S8–S10 ran with an ambient `DATABASE_URL` pointing at the shared development database. The execution report states cleanup verification found no residue; future runs should use a dedicated worktree-local test database.
- S4 unknown-conversation provisioning remains unchanged, as does compound-objective loss under the single-kind intent contract. The S6 stale-ID retry duplicate-execution defect is fixed and regression-tested at branch head `de1a57985bf0b7ec6566a3064c065ae4be427820`.
- The post-fix isolated run passed the three deterministic suites: 22 intent contract, 17 honesty consolidation, and 10 authority hardening assertions (49 passed, 0 failed, 0 skipped). S8–S10 ran against a worktree-local SQLite database; the shared development DB mtime was unchanged.
- `bunx tsc --noEmit` still exits 1 with 153 diagnostics. The report states the same 153-error set occurs at baseline commit `7024a4925f2c6ad92e2738ce0b2aa4c9a9086e90`, with only two existing `turn-executor.ts` line-number shifts and no new diagnostics.
- EVAL-023…026 remain not directly covered by dedicated deterministic regressions: provider timeout/partial execution, compound requests, conflicting current-vs-historical context, and clarification escalation.
- Live-provider quality and release readiness are not established. No merge or deployment occurred.

**Acceptance:** The targeted S6 fix is accepted as verified for the covered sequential retry path. The original deterministic baseline remains historical, and TypeScript debt remains explicitly non-green. This is not a live-provider quality claim or release-readiness result.

### Task 5 — Memory and Honcho assessment — COMPLETE
- Assessment: `docs/research/memory-and-honcho-assessment.md`.
- Re-inspected current Personal Mind, capture/gate/lifecycle, context assembly, ConversationStore episodic search, governed memory API, and existing M5.1–M5.4 benchmark evidence.
- Verified the existing system already has founder-scoped Personal Mind, pending-review capture, deterministic query-conditioned lexical retrieval, bounded episodic search over up to 20 recent conversations, authority-partitioned Company Brain retrieval, and a frozen synthetic retrieval benchmark.
- Existing M5.3 evidence reports 1.0000 render recall and zero retrieval/authority failures on its 13-query synthetic workload. The M5.4 prompt/1 baseline failed S6/S9, but the repository already contains a versioned prompt/2 remediation and three valid archived prompt/2 batteries; each recorded 12/12 PASS, with S6/S9 passing 3/3. Fixture and context digests match across prompt versions. This is controlled harness evidence, not production-prompt validation or a production-wide guarantee.
- Reviewed Honcho's current public product/SDK, hosted privacy policy and terms, and open-source AGPL-3.0 license. Honcho's strongest differentiator is reasoning-oriented, portable memory across separate tools; that requirement is not yet demonstrated in the current SamJuniorsOS workflow.
- **Decision: do not integrate Honcho now.** Adapt its emphasis on cross-session recall evaluation only if a representative workload reveals meaningful misses. Keep canonical company truth, Personal Mind lifecycle, and governance in existing SamJuniorsOS stores.
- Identified follow-up risks: file-authoritative local persistence with best-effort Prisma shadows; no unified cross-store deletion/retention contract established; episodic lexical retrieval can miss paraphrase-only queries and searches only the 20 most recently updated conversations. A persistence/deletion audit is needed before production-scale or multi-instance claims.
- No runtime code, dependencies, schema, provider configuration, or tests changed. Existing benchmark results were inspected, not rerun in this task.

**Acceptance:** Met for the read-only assessment and evidence-based adopt/adapt/ignore recommendation. No Honcho integration or new memory store was approved.

### Task 6 — End-to-end SOFIA voice and desktop capability validation
- Trace real request lifecycle, interruption/cancellation, authorization, tool feedback, retries, idempotency, duplicates, and recovery.
- Validate every capability against actual registered tools and platform behavior.
- Keep mock/demo behavior clearly distinct from real machine control.

**Acceptance:** Tests or manual verification evidence for each supported path and explicit list of unimplemented capabilities.

### Task 7 — Model/provider comparison, only if justified
- First establish reliable deterministic and existing-provider baselines.
- Compare candidate models/providers on the same evaluation set for quality, latency, privacy, cost, availability, and operational complexity.
- Verify current official terms/pricing before any hosted integration; ask the founder before adding recurring cost.
- Do not train a model unless a measured gap, dataset strategy, evaluation protocol, licensing review, compute estimate, and success criteria justify it.

**Acceptance:** Evidence-based keep/adapt/replace/stop decision; no provider or model change based on hype alone.

### Task 8 — Hardening and release readiness
- Verify authorization cannot be bypassed by model output, memory, UI state, or retrieved instructions.
- Test provider failures, timeouts, bounded retries, duplicate actions, permission boundaries, secret handling, audit, cancellation, and rollback.
- Run the relevant test/build commands and report exact results, including existing baseline failures.
- Document operational setup, disable/rollback path, privacy/retention, and known limitations.

**Acceptance:** Explicit release-readiness report. No merge or deployment without founder approval.

## Non-negotiable guardrails

- Preserve SamJuniorsOS product boundaries and existing working architecture.
- No code reuse from Hey Jev until license, provenance, security, and platform compatibility are verified.
- Do not assume a local-model fallback or Honcho integration exists; verify code and tests.
- No new provider chain, memory store, agent framework, or dependency without a demonstrated need.
- Keep secrets out of source control, frontend code, logs, and tests.
- Never let confidence scores substitute for measured calibration.
- Use deterministic policy for authorization; fail closed for consequential actions.
- Use bounded retries, timeouts, idempotency, human override, auditability, and recovery.
- Keep changes small, test them, update documentation, and finish one task before the next.

## Required report after each task

Report only the completed task: branch, commit, changed files, verification performed and exact results, known limitations, and the next single task. Then stop and wait for the founder.
