# Memory Architecture and Honcho Assessment

**Date:** 2026-10-04  
**Branch:** `feat/decision-layer-architecture-baseline`  
**Status:** Task 5 complete — read-only source audit and external-product assessment. No runtime integration or data-store change.

## Verdict

**Do not integrate Honcho at this stage.** Preserve the current SamJuniorsOS memory boundaries and deterministic retrieval architecture. The current repository already has founder-scoped Personal Mind, bounded episodic conversation retrieval, authority-partitioned Company Brain retrieval, and a frozen retrieval benchmark. The benchmark history shows that retrieval gaps identified in the original baseline were closed by targeted, in-repository changes without adding a graph database or external retrieval service.

Honcho's differentiated value is portable, reasoning-oriented memory shared across separate AI tools. That is not yet a demonstrated requirement for the current SamJuniorsOS request path. The M5.4 prompt/1 baseline did show a generation-faithfulness failure: the model omitted a transitive dependency despite receiving the evidence. However, a versioned prompt/2 remediation experiment is already present in this repository and its archived results show that the issue was resolved under the measured harness conditions. Adding another memory system would not solve the original failure, and no further retrieval change is indicated by that evidence.

**Decision:** IGNORE for the current implementation; RECONSIDER only if a reproducible cross-session, paraphrase, or cross-tool recall failure remains after a representative benchmark and the storage/deletion architecture is ready. This is not a claim that Honcho is technically weak.

## 1. Current repository architecture

### Personal Mind — founder-specific preferences and context

**Sources:** `src/lib/server/sophia/personal-memory-store.ts`, `memory-extractor.ts`, `memory-gate.ts`, `memory-capture-stage.ts`, `memory-lifecycle.ts`, `context-assembly.ts`, and `src/app/api/sofia/memory/route.ts`.

- `SophiaMemoryStore` is the canonical Personal Mind abstraction. The durable file collection `.data/sophia_memories.json` is the authoritative read/write source in the inspected implementation; Prisma is a best-effort write-only shadow with swallowed mirror errors and no read fallback.
- Records are founder-scoped, bounded, typed, provenance-bearing, and lifecycle-managed. Cross-founder reads/writes/deletes fail closed.
- Turn capture is asynchronous and best-effort. The model proposes at most three candidates; deterministic gates reject invalid/secret/instruction-shaped/authority-bearing or task-scoped content. Captured candidates enter `PENDING_REVIEW`; they do not auto-activate. Founder confirmation through the governed memory API is the activation path.
- Retrieval is deterministic and query-conditioned lexical matching, with bounded candidate count and context budget, type balancing, confidence/recency tie-breaks, and Personal-Mind-specific token folding. There is no embedding or semantic retrieval in this path.
- Lifecycle `ACTIVE` means eligible for advisory context only, not objectively true, verified company fact, instruction, or authorization.
- Explicit memory CRUD exists, including founder-scoped deletion. Deletion removes the authoritative file record strictly and deletes the Prisma shadow best-effort.

**Limits:** no automatic decay/TTL, consolidation, semantic merging, or synonym/paraphrase matching; no unified deletion/retention workflow across Personal Mind, conversations, derived records, and backups was established by this audit.

### Episodic memory — prior conversation recall

**Sources:** `src/lib/server/conversation/store.ts` and the episodic slice in `src/lib/server/sophia/context-assembly.ts`.

- Conversation records and messages are read from `DurableFileStore`; the inspected store documentation describes file-backed authority with Prisma as a best-effort mirror, not a read fallback.
- `searchConversations` scopes to the founder, uses deterministic token overlap, and considers the 20 most recently listed conversations. It returns at most three conversation hits and up to four matched messages per hit. The context assembler clamps the rendered episodic slice to 600 characters and labels it `EPISODIC_MEMORY`, not company truth.
- No usable query tokens or no lexical match produces no episodic hits. The context slice is optional and degrades fail-soft if the store read fails.
- Recent in-turn history is separately bounded; it is not the same as cross-conversation episodic retrieval.

**Limits:** older conversations outside the 20-conversation candidate window and paraphrase-only/anaphoric queries can be missed. The current evidence does not show that these misses materially impair representative founder workflows. No deletion method was found in the inspected `ConversationStore` API surface, and no unified conversation-plus-derived-memory purge path was established here. This needs a separate retention/deletion contract before making product-level deletion promises.

### Company Brain — canonical company knowledge and operational state

**Sources:** `context-assembly.ts`, company knowledge/state/epistemic stores, dependency retrieval modules, and M5.1–M5.4 benchmark documentation/results.

- Company truth, pending/unverified claims, historical precedent, superseded facts, current operational state, and episodic/personal context remain authority-partitioned.
- M5.2 added deterministic query-conditioned retrieval, temporal change enumeration, current-vs-retired knowledge labeling, structured decision projection, and episodic recall hygiene.
- M5.3 added an as-of read model and bounded relational dependency traversal rather than a graph database or separate retrieval service.
- The committed frozen retrieval benchmark reports A3 render recall of **1.0000** and zero retrieval/authority failures across its 13 synthetic queries. This is evidence for the benchmark's defined workload, not proof of perfect retrieval on real founder data.
- M5.4 prompt/1 baseline: three valid batteries each recorded 10 PASS / 2 FAIL out of 12; S6/S9 failed as `GF_SUPPORTED_FACT_MISS`. The repository also contains `docs/architecture/M5_4_PROMPT2_REMEDIATION.md`, versioned prompt/2 code, and three valid archived prompt/2 batteries. I inspected the six committed JSON artifacts: prompt/1 has 10/12 PASS in each battery; prompt/2 has 12/12 PASS in each battery, with S6 and S9 passing 3/3 each. The fixture digest and S6/S9 context digests are identical across the arms. The prompt/2 report records the other offline regression suites as passing at the time of that experiment; they were not rerun in this current task. This is evidence of a successful controlled harness remediation, not proof that the same clause is already in the production persona prompt.

### Persistence and deployment risk

The inspected Personal Mind and ConversationStore paths still use the durable local file store as the authoritative read source in all deployment modes, with Prisma best-effort shadows. This is a material architecture boundary: a local-file authority model needs explicit deployment, backup, concurrency, and multi-instance semantics before it can be treated as a horizontally scalable shared store. The planned authoritative database migration is a more concrete persistence concern than adding a separate memory service. Honcho would not automatically make SamJuniorsOS canonical company state, governance, or local-store migration problems go away.

## 2. Honcho — what it solves and what it does not

**Current public product sources reviewed on 2026-10-04:**
- [Honcho overview](https://honcho.dev/)
- [Honcho TypeScript SDK](https://www.npmjs.com/package/@honcho-ai/sdk)
- [Honcho open-source repository](https://github.com/plastic-labs/honcho)
- [Hosted-service privacy policy](https://app.honcho.dev/privacy)
- [Hosted-service terms](https://app.honcho.dev/tos)

Honcho provides a peer/session/message model, background reasoning over interaction history, peer representations, session context, search, and natural-language memory queries. It can be used as a hosted service or self-hosted. The TypeScript SDK exists, so a Node/TypeScript adapter is technically plausible; no SDK compatibility or integration test was run as part of this assessment.

| Dimension | Assessment for SamJuniorsOS |
|---|---|
| Problem solved | Persistent, reasoning-oriented recall across sessions and potentially across separate AI tools. |
| Differentiation | More than a vector store: peer-centric representations and background reasoning over accumulated messages. |
| Overlap with current system | Personal preferences, conversation persistence, bounded context assembly, and lexical episodic recall already exist. |
| Not a replacement for | Company Brain authority, epistemic promotion, current operational state, authorization, approval binding, audit, or deterministic command execution. |
| Reliability | Adds a network dependency, provider outage modes, SDK/API versioning, latency, and another place where data can drift or be unavailable. |
| Privacy/data flow | Hosted use sends conversation-derived data outside SamJuniorsOS. The published privacy policy describes customer content, subprocessors, international processing, configurable/default retention, and backup retention. Review the current policy and contract before any production use. |
| Deletion | A hosted purge/workspace deletion API is documented, but application-level deletion still needs a tested mapping from founder/conversation identity to every remote peer/session/message and a reconciliation path for failures. Deleting local data alone would not prove remote deletion. |
| Licensing/operations | The open-source core is AGPL-3.0; assess obligations before modifying and operating it as a network service. Self-hosting avoids the hosted data boundary but adds service, database, model-provider, monitoring, backup, upgrade, and security operations. |
| Cost/latency | Requires measurement against SamJuniors' own corpus, query frequency, token volume, depth settings, and latency budget; marketing benchmarks are not an adoption case. |
| Evidence fit today | No reproducible failure in the current frozen retrieval benchmark requires Honcho. The M5.4 harness's original generation-side failure has a successful, archived prompt/2 remediation; production-prompt adoption remains a separate decision. |

The currently published hosted terms state that availability is not guaranteed absent a separate SLA and that retention depends on the tier. The privacy policy currently published by Honcho describes a 90-day default for customer content, 90-day API logs and rolling backups, and US-centered processing/subprocessors. These terms/policies may change and must be rechecked before any adoption. Hosted account setup for a minor also requires the parent/guardian consent and supervision specified in Honcho's terms.

## 3. Adopt / adapt / ignore decision

### ADOPT — existing SamJuniorsOS boundaries

- Keep Personal Mind, Company Brain, Episodic Memory, agent identity, and governance separate.
- Keep retrieval evidence advisory unless it comes from the appropriate canonical authority.
- Keep deterministic retrieval and frozen benchmark regressions as the gate for architectural changes.
- Treat the model as a generator of proposals/answers, not the authority for memory persistence, company truth, or permissions.

### ADAPT — useful Honcho ideas without adopting the dependency

- Continue treating interaction history as an evolving, queryable source rather than only injecting the last few turns.
- Measure cross-session recall using realistic, consented scenarios and gold evidence, including older-session queries, paraphrases, anaphora, contradictions, stale preferences, and deletion.
- If multi-tool portability later becomes a real requirement, define a provider-neutral, server-only memory interface behind the existing context assembler; do not let a provider-specific representation become canonical company truth.
- Require every retrieval result to carry founder/tenant scope, source provenance, retrieval status, bounded size, and a fail-soft state.

### IGNORE — for now

- Do not add Honcho as a second Personal Mind store or source of truth.
- Do not upload all raw conversations by default.
- Do not add a graph/vector service merely because it is available.
- Do not use model-generated representations to supersede canonical company facts, silently activate Personal Mind memories, or authorize tools.
- Do not interpret synthetic benchmark success as proof of production-scale recall or generation correctness.

## 4. Re-entry gate for Honcho or another semantic memory layer

Reconsider only when all of the following are true:

1. A representative, consented evaluation set shows repeatable failures in existing retrieval that matter to real founder workflows—especially older-session recall, paraphrase/anaphora, or cross-tool continuity.
2. The failure is confirmed to be retrieval-related, not missing canonical data, context-budget starvation, or generation ignoring evidence already supplied.
3. A candidate provider beats the current deterministic baseline on the same frozen gold set, with authority/lifecycle/tenant isolation gates remaining green.
4. Latency, availability, token/data egress, pricing, hosted terms, licensing, deletion propagation, export, backup/restore, and migration/rollback are measured and accepted.
5. The design preserves a provider-off fallback and makes the existing canonical stores authoritative. No integration is approved by this assessment.

## 5. Recommended next priority

The controlled M5.4 prompt-version experiment is already implemented and archived: prompt/1 produced stable S6/S9 failures (0/3 each), while prompt/2 produced stable passes (3/3 each) and 12/12 overall in each of three valid batteries. Do not duplicate that experiment or alter retrieval to solve the generation failure. The remaining decision is whether to run a separate evaluation using the actual production persona prompt and, only if warranted, promote the general relationship/completeness clause into that prompt. The harness intentionally uses its own versioned prompt, so its success alone does not authorize a production prompt change.

A separate persistence/deletion audit is also warranted before production-scale or multi-instance claims: the file-authoritative stores, best-effort Prisma shadows, remote-provider data flows, backups, and conversation deletion semantics need a single documented lifecycle contract.

## Evidence boundaries

- Repository source and committed benchmark documents/results were inspected on the feature branch; the suites were not re-run for this assessment.
- The A3 retrieval numbers and M5.4 generation-battery results are transcribed from existing committed evidence, not newly generated by this task. The six prompt/1 and prompt/2 JSON battery artifacts were read and their summary, prompt version, fixture digest, S6/S9 verdicts, and context digests were compared programmatically; no live model calls or test suites were run.
- Honcho claims are based on the linked public product, SDK, repository, privacy-policy, and terms pages as accessed 2026-10-04. They are vendor-published claims, not independent security or performance validation.
- No runtime code, dependency, schema, provider configuration, test, or data-store behavior changed.
