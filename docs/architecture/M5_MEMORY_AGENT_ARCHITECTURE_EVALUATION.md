# M5 Memory & Agent Architecture Evaluation

| | |
|---|---|
| **Status** | READ-ONLY ARCHITECTURE EVALUATION — NO IMPLEMENTATION PERFORMED |
| **Baseline** | `origin/main` = `b9e63ad0fea7f61ae53729b35b0458c92b2f6083` ("feat(sophia): harden personal memory retrieval" = M4-D) — verified by `git fetch` at evaluation time |
| **External reference evaluated** | Graphiti `v0.30.2` (github.com/getzep/graphiti), evaluated from a full source clone, not the README alone |
| **Change footprint of this task** | This document only. No production code, no Prisma schema, no dependencies, no services were modified. |
| **Numbering note** | `MEMORY_RECONCILIATION_REPORT.md` §H previously reserved "M5" for *cache formalization* and "M6" for *PostgreSQL migration*. This document uses **M5** per the Founder's current task series (memory/agent architecture evaluation). The old M5-cache and M6-Postgres items are referenced here as *M5-cache (legacy)* and *M6-Postgres (legacy)* and are re-planned in §15. |

## Evidence labels

Every load-bearing claim below carries one of:

- **[VERIFIED IMPLEMENTATION]** — read directly in the baseline code/tests by this evaluation (file:line given).
- **[DOCUMENTED INTENT]** — stated in a repo doc but not (fully) verifiable in code.
- **[MEASURED RESULT — doc-claimed, suite absent]** — measurement asserted in a repo doc whose evidence suite is not present in the tree.
- **[INFERENCE]** — reasoned judgment of this evaluation, not a fact.
- **[NOT FOUND]** — searched for and absent.
- **[GRAPHITI-VERIFIED]** — read directly in Graphiti v0.30.2 source.

---

## 1. Executive Summary

**VERDICT: Do not adopt Graphiti (or any graph database) now. Build the retrieval benchmark first, fix two documented hygiene gaps, and pursue PostgreSQL-native hybrid retrieval as the default next architecture step. Graphiti enters only as a small, reversible, sandboxed prototype — and only if the benchmark proves that PostgreSQL-native retrieval materially fails a specific class of queries.**

Why, in one paragraph each:

1. **What M4 actually provides today** [VERIFIED IMPLEMENTATION]: a governed, deterministic, founder-sovereign memory system — capture → LLM extraction → deterministic gate → `PENDING_REVIEW` → founder-only activation; explicit lifecycle (`PENDING_REVIEW/ACTIVE/SUPERSEDED/ARCHIVED/REJECTED`) with append-only transition audit; query-conditioned, two-tier **lexical** retrieval with a Personal-Mind-scoped suffix fold and score-banded type round-robin; an authority-labeled 8-slice context assembly; and a separate epistemic pipeline (`Source → Signal → Claim → Verification → CanonicalFact`) with founder-only promotion. It is deliberately embedding-free, vector-free, and graph-free. Everything is pinned by 33 test files with per-milestone contracts.

2. **What important problems remain** [VERIFIED/INFERENCE]: (a) paraphrase/semantic matching is impossible by design (doc-admitted: "synonym-only and paraphrase-only memories are still unmatchable by lexical design"); (b) there is no *query* semantics for time — supersession data exists (`CanonicalFact.validityState`, `supersededById`, timestamps everywhere) but nothing answers "what was true then / what changed since"; (c) no multi-hop relationship traversal (decision → dependent projects is unanswerable); (d) no entity-centric consolidation ("everything about Lumora" runs 5 tiny independent lexical probes with limit 2); (e) no episodic search over conversation history (only last-10 messages of the current conversation); (f) **the retrieval evaluation harness cited by the M4-D doc (`tests/sophia/m4c_retrieval_evaluation.test.ts`) was never committed** [NOT FOUND — `git log --all` is empty for that path], so M4-D's claimed measurements are currently unverifiable in-tree; (g) full-collection reads per turn cap realistic scale.

3. **What kind of problems these are**: mostly **semantic** (needs embeddings or substantially better lexical ranking), **relational/structured** (temporal and dependency queries over data that already lives in tables), and **measurement** (no benchmark). Only multi-hop dependency traversal and entity-hub consolidation are genuinely *associative/graph-shaped* — and their product value is currently unproven.

4. **Whether Graphiti addresses any of them materially** [GRAPHITI-VERIFIED]: Graphiti v0.30.2 is a technically strong *temporal knowledge-graph library*: bi-temporal facts (`valid_at`/`invalid_at` + `created_at`/`expired_at`), episodes with provenance, entity/edge extraction, hybrid retrieval (cosine + BM25 + BFS depth-3, RRF/MMR/cross-encoder rerankers), temporal range filters, and soft, history-preserving contradiction invalidation. It directly targets classes (a), (b), (c), (d), (e). **But**: it is a Python library (no TypeScript client); it has **no PostgreSQL backend** (Neo4j/FalkorDB/Neptune+OpenSearch only; Kuzu deprecated); its ingestion is intrinsically LLM-driven (multiple LLM calls per episode — a real cost against the documented `$0.50/directive` budget); its contradiction invalidation is **LLM-judged and automatic**, which is exactly what SamJuniors' authority model forbids for company truth; it ships **no authentication/authorization** (its own FastAPI server and MCP server are unauthenticated); and its own README positions it as "bring your own graph database … custom implementation required; performance depends on your setup."

5. **What benchmark would prove/disprove that**: §7 defines eight benchmark queries (temporal, change detection, multi-hop, entity-centric, contradiction, episodic, personal, company-authority) with gold evidence sets, authority requirements, and scoring, run against four candidate systems: current lexical path, Postgres FTS, pgvector hybrid + RRF, and a Graphiti prototype. **No results are claimed here** — the harness does not exist yet.

6. **Smallest next implementation**: the benchmark harness itself (M5.1), plus two hygiene fixes that block honest measurement (M5.2). Then, conditionally, PostgreSQL-native hybrid retrieval (M5.3). Graphiti prototype only if the benchmark demonstrates material failure of §6 Option A on the multi-hop/entity/temporal classes (M5.4).

7. **What NOT to build yet**: any graph database in production, any second memory system, any autonomous consolidation/forgetting, any LLM-driven truth invalidation, any embedding store treated as canonical truth, and any Zep hosted dependency.

The recommendation in §14 is conditional throughout: e.g., *"Graph retrieval should be introduced only if benchmark M5.1 demonstrates a material improvement over the existing retrieval path and the PostgreSQL-native candidates on the multi-hop and entity-centric classes, at acceptable operational cost."*

---

## 2. Current SamJuniorsOS Architecture

Verified from the baseline tree (`/home/z/m5-eval` @ `b9e63ad`). This section reports what the code does, not what docs claim.

### 2.1 Surfaces and request path

Three user surfaces, one canonical turn executor [VERIFIED IMPLEMENTATION]:

| Surface | Entry | Path |
|---|---|---|
| SOFIA (voice-first, typed fallback) | `POST /api/sofia/ask` (SSE) | `executeSophiaTurn` (`src/lib/server/sophia/turn-executor.ts:71`) |
| Live voice (WebSocket :3001) | `LiveInteractionServer.handleFinalTranscript` | same `executeSophiaTurn` |
| OS chat panel | `POST /api/agent-chat` | **deliberately NOT converged** inline branch (`src/app/api/agent-chat/route.ts:227-442`) wiring the same stores/assembler/classifier/gateway inline |

Canonical turn steps [VERIFIED IMPLEMENTATION, `turn-executor.ts:87-292`]: conversation provisioning → turn idempotency (file-backed `${turnId}:assistant` key) → in-flight lock → persist founder message → server-authoritative history (last 10) → context assembly → intent classification (**the single LLM call** per turn, z-ai SDK, non-streaming, thinking disabled) → gateway dispatch (deterministic) → persist assistant reply → fire-and-forget memory capture.

Known issue, deliberately pinned [VERIFIED IMPLEMENTATION, `turn-executor.ts:53-129`, pinned by `m3_authority_hardening` S4/S6]: a *nonexistent* conversationId provisions a fresh conversation instead of returning 404.

### 2.2 Persistence reality (the most important architectural fact)

[VERIFIED IMPLEMENTATION] **DurableFileStore JSON files under `.data/` are the authoritative read source in ALL deployment modes today.** Prisma (SQLite in this sandbox — itself an explicit port of an upstream PostgreSQL schema, `prisma/schema.prisma:1-19`) is, for several models, a *write-only best-effort mirror*:

| Store | Backing (authoritative read source) | Prisma mirror |
|---|---|---|
| `SophiaMemoryStore` (Personal Mind) | `.data/sophia_memories.json` | write-only; **no read fallback** (`personal-memory-store.ts:45-73`) |
| `ConversationStore` | `.data/conversations.json` + `.data/chat_messages.json` | write-only; one read fallback in `getConversation` |
| `CompanyKnowledgeStore` | in-process array (local mode) / Prisma (authoritative mode) | dual-mode |
| `CompanyMemoryStore`, `CompanyStateStore`, `AgentRunStore`, epistemic stores, workflow/approval/idempotency/scheduler stores | Maps + `.data/*.json` (local) / Prisma (authoritative) | dual-mode, fail-closed via `db/authority.ts:25-70` |
| `InMemoryCommunicationStore` | **volatile — no persistence at all** | none |

"Postgres*" class names refer to the M6-Postgres (legacy) target; in this sandbox they run on SQLite [VERIFIED IMPLEMENTATION, naming honesty comments e.g. `run-store.ts:35-39`]. PostgreSQL migration is **target, not current** [DOCUMENTED INTENT, `MEMORY_RECONCILIATION_REPORT.md` §0/§H].

### 2.3 Data model inventory (22 Prisma models)

[VERIFIED IMPLEMENTATION, `prisma/schema.prisma`]

- **Personal Mind**: `SophiaMemory` (founder-scoped; `memoryType` allow-list; `provenance`; `confidence` explicitly "NEVER an epistemic verification status"; `lifecycleState` = lifecycle authority with `active` as derived mirror; `idempotencyKey`).
- **Company Brain**: `CompanyState` (single-row JSON blob: products/initiatives/customers/decisions/attention/financialModel), `CompanyKnowledge` (docs, SHA-256 content hash), `CompanyMemory` (precedents; `importance`/`decayScore`/`tags`/`category` columns **always written as constants** — dead [VERIFIED, `memory-store.ts:156-184`]).
- **Epistemic chain**: `EpistemicSource` (raw content + contentHash) → `EpistemicSignal` → `EpistemicClaim` (`verificationStatus: pending/under_review/promoted_to_fact/rejected/superseded`) → `EpistemicVerification` (proposer ≠ verifier enforced) → `CanonicalFact` (`validityState: active/superseded/disputed/deprecated`, self-relation `supersededById` chain, `provenance` JSON, `promotedBy` founder-only).
- **Conversation**: `Conversation` + `ChatMessage` (intent, idempotencyKey, metadata).
- **Governance/execution**: `WorkflowDefinition/Instance` (optimistic concurrency `stateVersion`, claim/transition transactions), `ApprovalRecord` (decision pending/approved/rejected/revoked/expired, payloadHash binding), `SideEffectAudit` (every gate decision), `IdempotencyRecord` (in_progress/completed/failed/**unknown**), `DistributedLease`, `ScheduledWorkItem`, `SchedulerHeartbeat`, `AgentRun` (structuredData, claimsGenerated, provenance).
- **Dead weight** [VERIFIED]: `TelemetryMetric` — zero code usage; `User` — one FK existence read; auth is env/FOUNDER_EMAILS-based (`auth/session.ts:17-46`).

### 2.4 Tests

33 test files [VERIFIED IMPLEMENTATION]: milestone suites `m0_idempotency_expiry`, `m1_canonical_state_authority`, `m2_knowledge_persistence`, `m3_conversation_convergence`, `m3_authority_hardening`, `k2_personal_memory` (T1-T20), `m4a_memory_capture` + `m4a_hardening` (H1-H22), `m4b1_lifecycle` (L1-L14), `m4c_query_conditioned_retrieval` (C1-C15 + M4-D H1-H12), plus governance/scheduler/api/realtime suites. **No retrieval-quality evaluation harness exists** — the `m4c_retrieval_evaluation.test.ts` cited in `SOPHIA_MEMORY_ARCHITECTURE.md` §15 was never committed [NOT FOUND].

### 2.5 Documentation state

`docs/architecture/SOPHIA_MEMORY_ARCHITECTURE.md` (15 sections incl. M4-A→M4-D addenda) and `MEMORY_RECONCILIATION_REPORT.md` are current. Root `ARCHITECTURE.md`, `PROGRESS.md`, `ROADMAP.md`, `WORKLOG.md` froze at the Phase 4C-B era (2026-09-17/21) and contain **zero** memory-chain entries [VERIFIED]. `doc/AUDIT 05` documents the previously ratified retrieval target: **PostgreSQL + pgvector + tsvector full-text + Reciprocal Rank Fusion** [DOCUMENTED INTENT]. "Stonic" appears nowhere in the repo [NOT FOUND].

---

## 3. Existing M4 Memory Capabilities

### 3.1 Milestone inventory

| Milestone | What shipped | Pinned by | Status |
|---|---|---|---|
| M0 | idempotency TTL state machine | `m0_idempotency_expiry` | [VERIFIED IMPLEMENTATION] |
| M1 | canonical CompanyState authority | `m1_canonical_state_authority` | [VERIFIED IMPLEMENTATION] |
| M2 | CompanyKnowledge persistence + seed migration | `m2_knowledge_persistence` | [VERIFIED IMPLEMENTATION] |
| M3 K-1 | conversation convergence (ask/voice → one executor) | `m3_conversation_convergence` | [VERIFIED IMPLEMENTATION] |
| M3 K-2 | SophiaMemoryStore (Personal Mind, founder-scoped, fail-closed) | `k2_personal_memory` | [VERIFIED IMPLEMENTATION] |
| M4-A | capture stage + deterministic MemoryGate + authority-content guard | `m4a_*` | [VERIFIED IMPLEMENTATION] |
| M4-B.1 | explicit lifecycle + provenance + founder-only transitions | `m4b1_lifecycle` | [VERIFIED IMPLEMENTATION] |
| M4-C | query-conditioned two-tier lexical retrieval | `m4c_*` C1-C15 | [VERIFIED IMPLEMENTATION] |
| M4-D | suffix fold + score-banded round-robin hardening | `m4c_*` H1-H12 | [VERIFIED IMPLEMENTATION] (behavior; **claimed measurements unverifiable**, §4 G6) |

### 3.2 The capture→gate→review→active chain

[VERIFIED IMPLEMENTATION] After each turn: pre-filters (length, task-scoped-instruction skip) → turn-level replay guard (`m4cap:<conv>:<turn>:<n>`) → **LLM extraction** (≤3 candidates, 4 allow-listed fields, sanitized) → dedupe over the **full** founder collection → `MemoryGate.evaluate` (deterministic: shape, type, bounds, confidence, provenance regex, SECRET_LIKE, INSTRUCTION_SHAPED, AUTHORITY_PRIVILEGE, COMPANY_DOMAIN, TRANSIENT, task-scoped, exact DUPLICATE) → any reason = **REJECT (nothing persisted)**, else **NEEDS_REVIEW** → `PENDING_REVIEW` candidate with `active:false`. The gate never returns `ACCEPT` (pinned G12). The only activation path is the founder via governed `PATCH /api/sofia/memory` → transition-validated, `confirmedAt/confirmedBy` stamped, append-only `metadata.lifecycle.transitions[]` audit.

### 3.3 The retrieval stack as it exists

[VERIFIED IMPLEMENTATION — every scorer below is deterministic token-overlap; **no embeddings, vectors, tf-idf, BM25, or semantic search exists anywhere in the retrieval stack**]

| Function | Ranking signals |
|---|---|
| `selectPersonalMindMemories` (`sophia/context-assembly.ts:300-373`) | folded-token overlap score → score bands DESC → type round-robin within band → confidence/recency within type; tier-2 = pre-M4-C policy; deterministic fallback when no tokens/no match; cap 20; 1200-char render container |
| `CompanyKnowledgeStore.queryKnowledge` (`knowledge-store.ts:559-628`) | `matchedTerms*2 + categoryMatch*3 + roleApplicable*1`; **scores the in-process cache only** (authority gap, self-documented `:538-558`); limit 2 in Sophia path |
| `CompanyStateStore.queryState` (`state-store.ts:276-489`) | hand-tuned per-domain weights (finance: fixed 10 on keyword/role) |
| `CompanyMemoryStore.queryMemories` → `OperationalLearningLoop` (`memory/learning-loop.ts:69-147`) | `min(100, matchedTerms*20 + categoryBonus*25)`; limit 2 |
| `SophiaEntityResolver` (`sophia/entity-resolver.ts`) | exact-ID → dialogue substring → token hits with hard-coded role aliases; 1=resolved, 0=unresolved, ≥2=ambiguous; **approvals and runs only** |
| Review annotations (`memory-review-annotations.ts`) | exact duplicate / Jaccard ≥0.6 similarity / polarity-opposed verbs — review-visibility only |

Context assembly renders 8 fixed authority-labeled slices (operational state, runs, pending approvals, canonical facts + pending claims, knowledge, precedents, activity, Personal Mind) under per-slice char budgets totaling ≈1,800 tokens [VERIFIED, `sophia/context-assembly.ts:41-57,466-845`]; Personal Mind content renders inside an XML-escaped, structurally-delimited **untrusted-data container**.

### 3.4 What M4 explicitly does NOT do

[DOCUMENTED INTENT — `SOPHIA_MEMORY_ARCHITECTURE.md` §11-§15, consistent with code] automatic activation; consolidation/compression; forgetting/decay/TTL; semantic contradiction resolution; supersession *decision* logic (founder decides, code only records); vector/embedding retrieval; FTS; PostgreSQL migration; any Personal-Mind influence on approvals/governance/company state. Paraphrase-only memories are unmatchable **by design**.

---

## 4. Current Gaps

Each gap is classified: **[SEMANTIC]** needs meaning-aware matching; **[RELATIONAL]** needs structured queries over existing tabular data; **[TEMPORAL]** needs time-aware query semantics; **[ASSOCIATIVE]** needs relationship traversal; **[ORCHESTRATION]** needs process/agent work, not retrieval.

| # | Gap | Evidence | Class |
|---|---|---|---|
| G1 | Paraphrase/synonym retrieval impossible; "brief" vs "concise", "prefers short answers" vs "keep replies tight" never match | doc-admitted §15; lexical-only code verified | SEMANTIC |
| G2 | No temporal query semantics: data has timestamps + supersession chains, but nothing answers "what was true at T" or "what changed in window W" | `listActiveFacts` filters `validityState='active'` only (`claim-store.ts:546-561`); no as-of API anywhere | TEMPORAL + RELATIONAL |
| G3 | No multi-hop/dependency queries: decision → affected initiatives/projects unanswerable | `CompanyState.decisions/initiatives` are opaque JSON; no relation columns; graph read-model projects workflows only | ASSOCIATIVE |
| G4 | No entity-centric consolidation: "everything about Lumora" = 5 independent lexical probes, limit 2 each | `context-assembly.ts:670-700`; `SophiaEntityResolver` covers approvals/runs only | ASSOCIATIVE + SEMANTIC |
| G5 | No episodic search: conversation history is not a retrievable corpus (last-10 of current conversation only) | `turn-executor.ts:188-194` | SEMANTIC + RELATIONAL |
| G6 | No retrieval-quality evaluation harness; the M4-D doc's cited evidence suite `m4c_retrieval_evaluation.test.ts` **never committed**; its measurements are unverifiable | `git log --all` empty for path [NOT FOUND] | MEASUREMENT |
| G7 | Scale ceiling: every turn re-reads whole collections (Personal Mind full ACTIVE pool; knowledge in-process array) | `listAllMemories` unbounded read (`personal-memory-store.ts:882-892`); reconciliation §G thresholds (10⁵-10⁶ = query-shaped reads needed) | RELATIONAL |
| G8 | `queryKnowledge` scores the in-process cache, never the authoritative store (self-documented; latent in local mode) | `knowledge-store.ts:538-558` | RELATIONAL |
| G9 | Nonexistent telemetry/evaluation of agent quality: `TelemetryMetric` dead; `TurnMetrics/TurnStopwatch` exported but never instantiated; agent-chat returns placeholder metrics | `sophia/metrics.ts`; `agent-chat/route.ts:468-474` | ORCHESTRATION |
| G10 | Un-converged second Sophia turn path (`/api/agent-chat` inline branch) duplicates idempotency/locking/persistence | `agent-chat/route.ts:227-442` | ORCHESTRATION |
| G11 | Dead schema weight contradicting docs: `CompanyMemory.decayScore/importance` never varied; `CompanyMemory.type` stores a decisionId (schema-comment mismatch) | `memory-store.ts:152-184` | RELATIONAL |

**The honest gap statement for this evaluation**: G1/G5 are semantic; G2/G7/G8/G11 are relational; G3/G4 are the only genuinely graph-shaped gaps; G6/G9/G10 are process debt. **None of these has been measured** — which is itself the primary gap (G6).

---

## 5. Graphiti Technical Evaluation

Evaluated from a full clone of `getzep/graphiti` at **v0.30.2** (Apache-2.0, Python ≥3.10). All claims below are [GRAPHITI-VERIFIED] with source references.

### 5.1 What Graphiti actually is

A Python library for building **temporal context graphs** on a third-party graph database, with LLM-driven extraction and hybrid retrieval. Not a database itself; not a server (it ships an *example* FastAPI server and an MCP server, both unauthenticated); not a TypeScript package.

### 5.2 Data model

- **Episodes** (`EpisodicNode`, `nodes.py:318`): raw context records — `source` (message/json/text), `content`, `valid_at` (when the original document was created), `entity_edges` back-references, extensible `episode_metadata`. Episodes are append-only raw provenance.
- **Entities** (`EntityNode`, `nodes.py:499`): `name`, `name_embedding`, `summary` ("regional summary of surrounding edges"), typed `attributes` (Pydantic ontology), `group_id`.
- **Facts** (`EntityEdge`, `edges.py:263`): a natural-language `fact` + `fact_embedding`; **bi-temporal**: `valid_at`/`invalid_at` (real-world validity) **and** `created_at`/`expired_at` (record lifecycle), plus `reference_time` and `episodes[]` provenance.
- Communities (optional `build_communities`), **sagas** (chained narrative episodes — new in this version), `add_triplet` for programmatic (non-LLM) edge insertion.

### 5.3 Retrieval (the strongest part)

- Hybrid: **cosine similarity** (embeddings, default `text-embedding-3-small`) + **BM25** (Neo4j Lucene full-text / FalkorDB FT / Kuzu simple) + **BFS graph traversal** (`MAX_SEARCH_DEPTH = 3`).
- Rerankers: **RRF, MMR, cross-encoder** (OpenAI rerank / local BGE / Gemini), node_distance, episode_mentions. `DEFAULT_MIN_SCORE = 0.6`.
- Recipes: edge/node/community/episode-level and `COMBINED_*` multi-layer configs; `search()` defaults to `EDGE_HYBRID_SEARCH_RRF`, `search_()` to `COMBINED_HYBRID_SEARCH_CROSS_ENCODER` (`graphiti.py:1586-1690`).
- `SearchFilters` (`search_filters.py:55`): node labels, edge types, **temporal range filters on `valid_at`/`invalid_at`/`created_at`/`expired_at`**, property filters. This is exactly the query surface G2 needs.

### 5.4 Ingestion and contradiction handling

- `add_episode` runs an **LLM pipeline per episode**: extract nodes/edges → LLM node dedupe → LLM edge dedupe → LLM-judged edge resolution against neighbor edges → contradicted edges get `expired_at` set (**soft invalidation, history preserved**) → embeddings generated. Prompts: `extract_nodes`, `extract_edges`, `dedupe_nodes`, `dedupe_edges`, `summarize_nodes`, `summarize_sagas` (`prompts/`).
- Incremental by design (no batch recomputation); `add_episode_bulk` with semaphore parallelism.
- **Implication for SamJuniors**: contradiction invalidation is *automatic and LLM-judged*. For an advisory Personal-Mind layer this could be tolerable (with human review); for company truth it directly violates "company-critical facts require governed epistemic promotion" (invariant §9) and "self-improving ≠ self-authorizing".

### 5.5 Deletion / forgetting

`remove_episode` (`graphiti.py:1824`) cascades only edges *created by* that episode and nodes mentioned *only* by it. Edges whose provenance includes the episode but were created by another episode survive. There is no built-in GDPR-grade erasure; invalidation is soft. Forgetting semantics would be SamJuniors' own responsibility — consistent with our "forgetting ≠ deletion" doctrine, but it means building it ourselves on top.

### 5.6 Backends, ops, security

- **Backends**: Neo4j 5.26+ / FalkorDB 1.1.2 (Redis-protocol; embedded `falkordblite` variant) / Amazon Neptune + OpenSearch / Kuzu (**deprecated** — upstream unmaintained). **No PostgreSQL backend** [GRAPHITI-VERIFIED, `graphiti_core/driver/` listing]. Note: `doc/AUDIT 05`'s line "Zep … Neo4j/PostgreSQL with bitemporality" describes Zep's hosted platform, **not** open-source Graphiti.
- Dependencies: `neo4j`, `openai` (default LLM + embedder; Anthropic/Gemini/Groq/generic-OpenAI extras), `tenacity`, `numpy`, **`posthog`** (telemetry phones home; must be disabled for privacy-sensitive deployments), OTEL tracing hooks.
- **Authorization: none.** `group_id` is a partition label, not an ACL. The FastAPI server and MCP server ship unauthenticated. `SECURITY.md` covers only vulnerability reporting. Any SamJuniors use must wrap it behind our session-authenticated, founder-gated API.
- Consistency/failure: tenacity retries; no cross-database transactions (graph DB ↔ PostgreSQL canonical stores can drift — sync becomes our problem); known multi-group FalkorDB bug history (#1659, worked around in `decorators.py:29-37`); 0.x version churn (breaking changes between minor versions).
- Their own positioning [GRAPHITI-VERIFIED, README]: Graphiti = "Bring your own third-party graph database … Custom implementation required; performance depends on your setup", vs Zep (their hosted product) for "millions of context graphs". Latency claims ("typically sub-second") are self-described and **not independently verified by us** [DOCUMENTED INTENT — vendor claim].

### 5.7 What SamJuniors would still have to build (the adoption gap)

1. A **Python sidecar service** (FastAPI or MCP) since the core library is Python-only and our stack is TypeScript — plus its auth wrapper, health checks, deployment, monitoring.
2. A **graph database in production** (Neo4j or FalkorDB) — a second database to operate, back up, secure, and migrate.
3. **ETL/sync** from canonical stores (PostgreSQL/Prisma) into the graph, with a rebuild-from-canonical guarantee (else it becomes a second source of truth — forbidden).
4. **Retrieval governance**: authority labels, two-brain scoping (Personal Mind group vs Company Brain group), untrusted-container rendering — none of which Graphiti provides.
5. **Cost control** for LLM extraction per episode (multiple LLM calls each) against the documented `$0.50/directive` budget [DOCUMENTED INTENT, reconciliation §K].
6. The **benchmark** that justifies all of the above (§7).

**Net assessment** [INFERENCE]: Graphiti is a well-engineered library whose *retrieval semantics* (bi-temporal hybrid + graph traversal + temporal filters) map remarkably well onto G1-G5. Its *operational and governance profile* (Python + second DB + LLM-driven writes + zero auth) maps poorly onto SamJuniors' constraints. If its retrieval semantics are what we need, the first question is whether PostgreSQL can deliver the same classes of answers as a derived index without the second database.

---

## 6. PostgreSQL-Native vs Graphiti vs Graph-First

No option is ranked "best/worst". Each is assessed against the required dimensions. Options:

- **A — PostgreSQL-native memory/retrieval**: single PostgreSQL authority (per M6-Postgres legacy plan) + `tsvector` FTS + `pgvector` embeddings + RRF fusion + structured SQL for temporal/supersession/dependency queries (the `doc/AUDIT 05` ratified target).
- **B — PostgreSQL + Graphiti as an associative/temporal retrieval layer**: PostgreSQL stays canonical; Graphiti runs as a derived index over canonical data (episodes = conversations/memories/facts; ideally fed via `add_triplet`/deterministic ETL rather than LLM extraction), queried by Sophia as a retrieval accelerator.
- **C — Graph-first architecture**: the graph becomes the primary memory substrate (facts/edges as first-class records of truth).

### 6.1 Option A — PostgreSQL-native

| Dimension | Assessment |
|---|---|
| Strengths | One database; one backup/security story; SQL `JOIN`s answer multi-hop depth 1-2 natively; temporal queries are `WHERE` clauses over timestamp/supersession columns we **already have**; pgvector+FTS+RRF is the repo's own ratified target (AUDIT 05); Prisma already in stack; deterministic, auditable |
| Weaknesses | No native graph traversal beyond a few JOINs; entity consolidation must be built (an entities table + resolution rules); paraphrase quality depends on embedding model choice; RRF fusion code is ours to own |
| Missing capabilities | Deep multi-hop (3+) traversal, community summaries, automatic contradiction invalidation, episode-provenance chains — all absent unless built |
| Operational cost | Low: the Postgres migration is already planned (M6-Postgres legacy); extensions are mainstream |
| Migration cost | Already committed to in plan; retrieval additions are additive columns/tables |
| Security implications | Mature: row-level security, roles, one perimeter; auth stays in our session layer |
| Failure modes | Embedding model churn; index bloat; lexical/vector fusion tuning debt; no graph-shaped blind spot is *solved*, merely approximated |
| Retrieval quality | Addresses G1/G5/G7/G8 directly; G2 via SQL; G3/G4 partially (JOIN-limited depth) |
| Scaling | Excellent to 10⁶-10⁷ rows with indexes/partitioning (matches reconciliation §G thresholds); beyond that, reconsider |
| Developer complexity | TypeScript-native, no new runtime; Prisma-first |
| Vendor/backend deps | PostgreSQL + pgvector extension only |
| Reversibility | High — embeddings/FTS are derived indexes over canonical rows; drop and rebuild |

### 6.2 Option B — PostgreSQL + Graphiti layer

| Dimension | Assessment |
|---|---|
| Strengths | Gains Graphiti's retrieval semantics wholesale: bi-temporal edge filters, entity-hub search, BFS depth-3, RRF/MMR/cross-encoder rerankers — the exact query surface for G2/G3/G4; canonical truth stays in PostgreSQL (Graphiti never authoritative if fed via deterministic ETL) |
| Weaknesses | Two datastores to keep in sync (drift risk with no cross-DB transactions); LLM extraction cost if episodes are ingested the default way; LLM-judged invalidation must be disabled/overridden for anything touching company truth; the Python sidecar is a second failure domain |
| Missing capabilities | Still ours: authority labels, two-brain scoping, gates, audit, founder approvals — Graphiti provides none |
| Operational cost | High: + Neo4j/FalkorDB container, + Python service, + ETL pipeline + its monitoring + LLM budget per ingested episode |
| Migration cost | Moderate: ETL from existing stores; reversible if graph is treated as derived index only |
| Security implications | Unauthenticated by default; must be network-isolated behind our API; `posthog` telemetry must be disabled; raw conversation content would flow to the extraction LLM provider (data-egress boundary decision needed) |
| Failure modes | Sidecar outage (retrieval degradation — must fail-soft to Option A path); graph drift from canonical; LLM extraction misjudgment corrupting the index; version churn (0.x); FalkorDB multi-group quirks |
| Retrieval quality | Best theoretical fit for G3/G4 (entity-hub + traversal) and G2 (temporal filters) **if** the index stays fresh; unproven for our corpus |
| Scaling | Good per Graphiti's design claims; two systems to scale |
| Developer complexity | High: Python + TypeScript teams/tooling; two query languages (Cypher + SQL) |
| Vendor/backend deps | Neo4j or FalkorDB (or Neptune) + Python runtime + an LLM/embedding provider |
| Reversibility | High **iff** the strict rule holds: graph = derived, rebuildable index; never a system of record |

### 6.3 Option C — Graph-first

| Dimension | Assessment |
|---|---|
| Strengths | Uniform model for facts+provenance+temporality; one query language for everything associative |
| Weaknesses | Directly violates repo invariants: "No new parallel stores", "Graph != Brain", company truth must live in governed relational state; loses Prisma/relational guarantees (transactions, constraints, typed models, the entire epistemic schema); rebuilds governance from scratch in a second paradigm |
| Missing capabilities | Everything governance-related (approvals binding, idempotency, audits as relational contracts, workflow persistence) — i.e., the parts that are the product's moat |
| Operational cost | Highest — the whole persistence layer re-platformed |
| Migration cost | Very high; effectively a rewrite of the M0-M4 chain |
| Security implications | Least mature perimeter in our context |
| Failure modes | All of B's, plus canonical-truth drift and loss of deterministic-state contracts |
| Retrieval quality | Theoretically best for associative queries, but at the cost of everything else |
| Scaling | Fine, but so are the others at our data scale (~10¹-10³ records today) |
| Developer complexity | Highest |
| Vendor/backend deps | Graph DB as system of record |
| Reversibility | Lowest |

**Comparative summary** [INFERENCE]: A solves the semantic/relational/temporal classes cheaply and is already the documented target; B uniquely targets the associative classes at high operational cost and governance constraints; C is architecturally contrary to the repo's ratified principles and should not be pursued.

---

## 7. M5 Retrieval Benchmark

**Purpose**: prove or disprove — with measured evidence, not vendor claims — which retrieval architecture SamJuniors needs. **No results exist yet; none are claimed.** The harness itself is proposed task M5.1 (§15).

### 7.1 Design principles

1. **Deterministic fixtures**: a frozen corpus (JSON fixture file) containing the full memory universe — conversations, SophiaMemory rows across all lifecycle states, CompanyKnowledge docs, CompanyMemory precedents, epistemic chain (source→signal→claim→verification→fact incl. superseded chains), CompanyState blob, AgentRuns — with known timestamps. Same fixture is loaded into every candidate system.
2. **Company facts resolve through authoritative Company Brain state. Personal memory is never an alternative source of company truth.** (Benchmark invariant AUTH-1: any answer citing Personal Mind as evidence for a company-domain question scores 0 on authority-correctness.)
3. **Metrics per query**: evidence Recall@k and Precision@k (retrieval layer, against gold sets), MRR (ranking), authority-correctness (did the answer's evidence come from the authoritative store?), provenance-completeness (are citations attached and resolvable?), honest-failure credit (a correct "I don't know / not recorded" beats a fabrication), latency.
4. **Systems under test**: A0 = current M4 lexical path (as-is code, fixture-loaded); A1 = FTS-only (SQLite FTS5 or Postgres `tsvector`) over the same corpus; A2 = pgvector hybrid + RRF (AUDIT 05 target); B1 = Graphiti prototype (episodes seeded from the same fixture; sandbox only).
5. **Pass/fail gates** are defined per query class below; the *architecture decision* gate is defined in §14.

### 7.2 The eight benchmark queries

#### BQ1 — TEMPORAL: "What was our previous Lumora pricing strategy?"

| Field | Specification |
|---|---|
| Input | The literal question above, plus fixture context where a pricing CanonicalFact chain exists: fact P (pricing strategy v1, `validityState:'superseded'`, promoted T1) → fact Q (pricing strategy v2, active, promoted T2 > T1); plus a CompanyMemory pricing precedent. |
| Expected evidence (gold) | Fact P (+ its claim/source chain), fact Q, CompanyMemory row, CompanyState financialModel history |
| Authoritative source | Company Brain: CanonicalFact supersession chain + CompanyState. Personal Mind must not be cited |
| Current retrieval path | `queryMemories` lexical limit-2 (tokens: pricing/strategy); `queryKnowledge` limit-2; `queryState` finance (fixed score 10). `listActiveFacts` returns **only active** facts — P is filtered out by construction; no as-of query exists |
| Temporal requirements | As-of / previous-version semantics; must distinguish "previous" from "current" |
| Relationship requirements | `supersededById` chain traversal (1 hop) |
| Provenance requirements | Cite fact ids + promotedAt + promotedBy |
| Authorization requirements | Founder session; no auto-promotion of P as current |
| Acceptable answer behavior | "Previous strategy was X (from T1 to T2, superseded by Y). Current strategy is Y." OR honest absence: "No prior pricing strategy is recorded." |
| Failure conditions | Fabricated prior strategy; presenting P as current; presenting Q as previous; citing SophiaMemory as evidence; missing provenance |

#### BQ2 — CHANGE DETECTION: "What changed in company strategy during the last 3 months?"

| Field | Specification |
|---|---|
| Input | Question + fixture where N canonical facts were promoted and M superseded inside the window, K outside it; decisions appended in window |
| Expected evidence | The N promotions + M supersessions + decision records with timestamps; nothing outside the window |
| Authoritative source | CanonicalFact (`promotedAt`, `validityState`, `supersededById`), CompanyState.decisions, CompanyMemory.createdAt |
| Current retrieval path | **No such query exists.** Activity projection = last 4 derived events, not a 3-month windowed change set |
| Temporal requirements | Range query across multiple stores, ordered |
| Relationship requirements | Fact ↔ superseding fact |
| Provenance requirements | Per change: who promoted, when, from what claim |
| Authorization requirements | Founder session |
| Acceptable answer behavior | Enumerated change list with timestamps, or "K changes recorded" with items; OR honest "the change log for that window is empty/absent" |
| Failure conditions | Inventing changes; including PENDING claims as changes; window boundary errors; missing all supersessions |

#### BQ3 — MULTI-HOP: "Which projects depend on the decision about X?"

| Field | Specification |
|---|---|
| Input | Question + fixture where decision D (a CanonicalFact/decision record) is referenced by initiative I₁ (via explicit dependency reference in fixture) which is executed by workflow instance W₁; plus decoy initiative I₂ unrelated to D |
| Expected evidence | I₁ (and transitively W₁/agent runs), NOT I₂ |
| Authoritative source | Company Brain: decision record + initiatives + workstreams |
| Current retrieval path | **Unanswerable**: initiatives/decisions are opaque JSON in CompanyState; no dependency edges exist; the LLM would infer (fabrication risk) from a 2-item knowledge slice |
| Temporal requirements | Low (current-state) |
| Relationship requirements | High: decision → initiative → workstream (2 hops) |
| Provenance requirements | Each hop cited |
| Authorization requirements | Founder session |
| Acceptable answer behavior | Correct hop list with citations; OR honest "dependency links are not recorded — I can show what references D textually" |
| Failure conditions | Hallucinated dependencies; including I₂; omission of I₁ without honest disclosure |

#### BQ4 — ENTITY-CENTRIC: "Tell me everything relevant to Lumora right now."

| Field | Specification |
|---|---|
| Input | Question + fixture with Lumora mentions spread across: 2 knowledge docs, 3 canonical facts (subject/category), 2 company memories, 1 initiative, 2 agent runs, 1 pending claim; decoys mentioning "Lumora" zero times plus one doc mentioning "Lumora" only historically (superseded) |
| Expected evidence | All live Lumora items across all 5+ stores; historical item clearly marked superseded; pending claim clearly marked unverified |
| Authoritative source | Company Brain stores (multi-store); SophiaMemory advisory-only, rendered as untrusted context |
| Current retrieval path | 5 independent lexical probes with limit 2 each (`queryKnowledge`, `queryState`, `queryMemories`, `listActiveFacts` top-3, AgentRun slice top-3) — most gold items unretrievable by construction; no entity consolidation |
| Temporal requirements | "right now" = active/superseded flagging |
| Relationship requirements | Entity hub across stores |
| Provenance requirements | Per item: store + id + timestamp |
| Authorization requirements | Founder session; pending claims labeled as unverified (EPISTEMIC WARNING) |
| Acceptable answer behavior | Consolidated, authority-labeled inventory; superseded/historical items marked; unverified marked; OR partial with honest coverage statement |
| Failure conditions | Presenting unverified claim as fact; omitting entire stores silently; presenting superseded as current |

#### BQ5 — CONTRADICTION: "I previously said X, later decided Y. What is currently true?"

| Field | Specification |
|---|---|
| Input | Question + fixture where founder statement X was promoted to fact, then superseded by fact Y (governed promotion, `supersededById` set); X and Y contradict; optionally a Personal-Mind preference row echoing X (advisory) |
| Expected evidence | Y as current truth; X with its supersession history (who, when); the claim/verification chain of Y |
| Authoritative source | CanonicalFact chain (company domain) — **must** resolve to Y regardless of Personal-Mind echoes |
| Current retrieval path | `listActiveFacts` top-3 returns Y (if ranked); X filtered out (no history shown); Personal-Mind lexical probe may surface the X-echo and render it (as untrusted) — the answer depends on LLM discipline, not retrieval structure |
| Temporal requirements | High: supersession ordering |
| Relationship requirements | Supersession link traversal |
| Provenance requirements | decidedBy/decidedAt on both |
| Authorization requirements | Founder session; personal echo never overrides |
| Acceptable answer behavior | "Currently true: Y (decided T2, superseding X from T1)." |
| Failure conditions | Answering X; averaging X and Y; letting the Personal-Mind echo win; no provenance |

#### BQ6 — EPISODIC: "Why did we abandon that approach?"

| Field | Specification |
|---|---|
| Input | Question + fixture where a past conversation (not the current one) contains the abandonment discussion with rationale; a CompanyMemory row records the outcome; an approval reason contains a fragment |
| Expected evidence | The specific ChatMessages (past conversation), CompanyMemory rationale (details JSON), approval/workflow reason |
| Authoritative source | Conversation history (episodic record) + CompanyMemory (registered precedent); rationale quality = provenance to episodes |
| Current retrieval path | **No episodic search**: only last-10 messages of the *current* conversation are loaded; `queryMemories` may lexical-hit "abandon/approach" if tokens match |
| Temporal requirements | Medium (past-conversation lookup) |
| Relationship requirements | Memory → originating conversation (provenance string `conversation:<id>`) |
| Provenance requirements | Cite conversation id + message ids; never quote from the wrong conversation |
| Authorization requirements | Founder session; conversation ownership fail-closed |
| Acceptable answer behavior | "The discussion in <conversation> on <date> records the rationale: …; the registered precedent says …" OR honest "I can't find a recorded discussion of that" |
| Failure conditions | Fabricated rationale; quoting from the current conversation; citing a PENDING_REVIEW memory as evidence |

#### BQ7 — PERSONAL MEMORY: "What do you know about how I prefer to work?"

| Field | Specification |
|---|---|
| Input | Question + fixture: 12 ACTIVE SophiaMemory rows for this founder — some lexically obvious ("prefers concise briefings"), some paraphrase-only ("keeps replies tight when he's tired"); 2 PENDING_REVIEW; 3 rows of a *different* founder |
| Expected evidence | The 12 ACTIVE rows for this founder only; PENDING_REVIEW and other-founder rows excluded |
| Authoritative source | Personal Mind (advisory by definition — never company truth) |
| Current retrieval path | `selectPersonalMindMemories` — folded-token scoring works for lexical matches; paraphrase-only rows surface only via tier-2/fallback (confidence/recency), if at all; PENDING_REVIEW excluded by ACTIVE filter; cross-founder rows excluded by founder scoping [VERIFIED] |
| Temporal requirements | Low |
| Relationship requirements | Low |
| Provenance requirements | Each preference with provenance + confirmation metadata |
| Authorization requirements | Founder scoping fail-closed (pinned T9-T11); untrusted-container rendering |
| Acceptable answer behavior | Enumerated preferences with sources; explicit "these are interaction preferences, not company policy" |
| Failure conditions | Leaking other-founder rows; presenting preferences as company facts; revealing PENDING_REVIEW content |

#### BQ8 — COMPANY AUTHORITY: "What is SamJuniors' current financial state?"

| Field | Specification |
|---|---|
| Input | Question + fixture with a canonical CompanyState.financialModel (mrr, burn, runway, margin) updated at T2, plus a stale Personal-Mind remark and a stale conversation recollection of older numbers |
| Expected evidence | CompanyState.financialModel @ T2 only |
| Authoritative source | CompanyStateStore — the canonical financial source (pinned by m1 suite) |
| Current retrieval path | **Works today** [VERIFIED]: `queryState` finance path (fixed relevance on finance keywords), slice 1 `getFinancialMetrics`, gateway deterministic read |
| Temporal requirements | As-of T2 (updatedAt) |
| Relationship requirements | None |
| Provenance requirements | As-of timestamp + store identity |
| Authorization requirements | Founder session |
| Acceptable answer behavior | The canonical numbers with as-of time |
| Failure conditions | Numbers from conversation memory/Personal Mind; stale cache over canonical (the queryKnowledge cache-gap pattern); fabricated metrics |

### 7.3 Scoring and gates

- Score per query: `authority-correctness ∈ {0,1}` (hard gate — wrong authority = total failure regardless of lexical metrics); evidence Recall@5/Recall@10; MRR; provenance-completeness ∈ [0,1]; honest-failure credit where gold is empty; p50/p95 latency.
- **Class-level gates** (proposal, to be ratified with the Founder when fixtures are frozen):
  - *Semantic classes (BQ1 partial, BQ4, BQ6, BQ7)*: a candidate passes if Recall@10 ≥ current-path Recall@10 + 0.2 absolute on the paraphrase subset, with authority-correctness = 1.
  - *Temporal classes (BQ1, BQ2, BQ5)*: pass = gold supersession/history items retrieved at Recall@5 ≥ 0.8.
  - *Associative classes (BQ3, BQ4)*: pass = dependency hop recall ≥ 0.8 with zero fabricated edges.
- **Decision gates**: A1/A2 proceed to production consideration if they pass the semantic+temporal gates; B1 (Graphiti) is only pursued further if A2 fails the associative gate **and** B1 passes it with margin ≥ 0.1 over A2 at acceptable latency — all measured, never asserted.

---

## 8. Agent Capability Mapping

Checklist per the supplied generic "How to Build AI Agents" reference. Status categories: **already exists / partially exists / missing / not appropriate for SamJuniors / should be deferred**. Evidence is repo-verified.

| Concept | Status | Evidence & notes |
|---|---|---|
| **Role / Goal** | Already exists | `SERVER_AGENTS` roster with roles (COO "Chief Operating Officer & Master Orchestrator", Researcher, PM, Finance) + 8-stage council [VERIFIED, `agents/definitions.ts`, `orchestration/orchestrator.ts:226-952`]; ConstitutionalVerifier as separate verification role |
| **Structured I/O** | Already exists | zod schemas (epistemic inputs), JSON response contract in the classifier, `AgentRun.structuredData/claimsGenerated`, `generateJson` SDK path [VERIFIED] |
| **Protocol** | Partially exists | Deterministic internal contracts (turn executor, gateway dispatch, gated tool execution) — but no formal external agent protocol (no MCP server exposing our agents; no A2A). Internal orchestration is a typed function pipeline, not a protocol layer [VERIFIED] |
| **Tools** | Partially exists | Permission-aware tool selector + web-search, image-generator, verification, GitHub/Composio providers; ALL execution behind `SideEffectAuthorizationGate` with audit + idempotency [VERIFIED, `tools/selector.ts`, `authorization/gate.ts`] |
| **Multi-agent orchestration** | Partially exists | 8-stage council with tool use, claim auto-submission, verifier; but single-process, sequential, no delegation/negotiation patterns; agent-collab route is a dialogue simulation [VERIFIED] |
| **Memory** | Partially exists | M4 chain = governed long-term memory (personal + company + epistemic); gaps G1-G11 (semantic retrieval, temporal queries, episodic search, consolidation) [VERIFIED] |
| **Long-term memory / RAG** | Partially exists | Long-term stores yes; RAG = lexical-only, limit-2 slices; this evaluation's subject |
| **Voice** | Already exists | Full SOFIA voice-first surface: wake word, VAD, barge-in, PTT, provider-chain STT/TTS, live WS companion with streaming transcript [VERIFIED] |
| **Vision** | Missing — defer | Gesture/hand camera for SOFIA UI exists, but no image *understanding* in the product; ADR-001 lists camera/screen-share as TARGET. Decision deferred: a VLM skill integration is a separate product decision, not part of M5 memory architecture |
| **Output (action execution)** | Already exists | Gated side effects, workflow runtime, approval binding, scheduler — the strongest part of the system [VERIFIED] |
| **UI** | Already exists | Three surfaces (SOFIA / Sophia canvas / OS desktop), memory review UI with approve/reject, agent dock, activity, honest engine-health diagnostics [VERIFIED] |
| **Evaluation / monitoring** | **Missing** | TelemetryMetric dead; TurnMetrics unwired; placeholder metrics in agent-chat; no eval harness (G6/G9) [VERIFIED]. This is the single largest agent-capability gap and the direct subject of M5.1 |

**Reading of the map** [INFERENCE]: the agent stack is strong on *governance, voice, UI, structured execution* and weak on *retrieval semantics and evaluation*. The generic reference's emphasis on evaluation-before-capability matches the repo's own doctrine ("DO NOT BUILD A GIANT LEARNING ENGINE BEFORE REAL OPERATIONAL DATA EXISTS" — AUDIT 10) and this evaluation's recommendation order.

---

## 9. Stonic UX Learnings

**Scope honesty**: Stonic appears nowhere in this repository [NOT FOUND]. This section maps only the three reference traits supplied with the task — (1) resident/desktop AI UX, (2) persistent personal context, (3) AI agents and computer presence — against our verified surfaces. No Stonic internals were inspected; nothing here should be read as claims about Stonic's implementation.

**ADOPT** (patterns we already have or should strengthen):
- *Resident assistant presence* — SOFIA is already persistently mounted across surfaces with mic surviving tab switches and a parked WebGL loop [VERIFIED, `src/sofia/App.tsx`, README]. Validated direction; keep.
- *Persistent personal context as the product promise* — M4's Personal Mind is exactly this, with governance. The right next UX step is making memory **inspectable**: a "what you know about me" browsable view (today: review-queue only). Cheap, high-trust, uses existing governed APIs.
- *Honest engine-health visibility* — our Diagnostics/ENGINES panels (honest per-provider chain status) are a differentiator; extend the honesty to retrieval (show which memory slices fed an answer — the authority labels already exist in the assembled context).

**ADAPT**:
- *Agents with computer presence* (visible desktop agents "doing work") — adapt as **authority-labeled execution visibility**: our agent dock + activity feed + approval gates already show work; the Stonic-shaped upgrade is a *live workstream surface* where in-flight AgentRuns, their gates, and their verification status are visible in real time — derived read-only projections (GraphReadModel already provides most of this).
- *Persistent context across sessions* — we have durability; the missing feel is *continuity of conversation* (episodic recall, BQ6). Adapt as the episodic-search capability in M5.1/M5.3, not as new UI first.

**IGNORE**:
- Copying Stonic's product architecture, visual language, or any un-governed autonomy pattern.
- Resident-AI features that bypass approval gates or run agents with founder-equivalent authority.
- Any "AI runs your computer" surface that conflates presence with authority.

**DIFFERENTIATE**:
- SamJuniors' moat is the **governed two-brain model** (founder sovereignty, epistemic promotion, deterministic gates, audit trail). A resident AI without an authority model is a commodity; a resident AI whose every consequential action is gated, attributed, and auditable is not. All UX borrowing must reinforce, never dilute, this.

---

## 10. Security / Authorization / Provenance

### 10.1 Current state [VERIFIED IMPLEMENTATION]

- Session auth with production fail-closed (dev-bypass headers prohibited in prod); FOUNDER_EMAILS allow-list; role resolution deterministic.
- Founder-scoped ownership fail-closed at store level (403 `SophiaMemorySecurityError`, ConversationSecurityError); cross-founder isolation pinned (H22, T9-T11).
- Authority-content guard blocks authorization/privilege semantics from ever entering memory (store + gate + extractor ingress; 400 `SOPHIA_MEMORY_AUTHORITY_CONTENT`).
- Untrusted-data structural container for Personal Mind in prompts; injection resistance pinned (H21, phase1 suites).
- SHA-256 payload binding for approvals; contentHash tamper detection on EpistemicSource; append-only lifecycle transitions; SideEffectAudit at every gate decision; idempotency state machine with TTL.

### 10.2 If Graphiti (or any graph/vector index) is ever introduced — mandatory rules

1. **Derived-index rule**: the index is rebuildable from canonical stores; it is never a system of record; sync is one-directional (canonical → index). Violating this creates the forbidden second memory system.
2. **Two-brain scoping**: Personal Mind and Company Brain must live in disjoint graph partitions (Graphiti `group_id`), with the same founder-scoping enforcement in the service wrapper. Graphiti's `group_id` is a partition label, **not** an ACL [GRAPHITI-VERIFIED] — authorization remains 100% ours.
3. **Service isolation**: any Python sidecar runs network-isolated, unexposed except through our authenticated API; `posthog` telemetry disabled; FastAPI/MCP servers never directly reachable.
4. **Data-egress boundary**: Graphiti's default ingestion sends episode content to an external LLM (OpenAI default) for extraction + embedding. This is a data classification decision the Founder must make explicitly. Deterministic ETL via `add_triplet` avoids LLM egress for structured facts; free-text extraction does not.
5. **No LLM-judged writes in authority paths**: Graphiti's automatic contradiction invalidation may, at most, influence *advisory* retrieval. Company-truth transitions remain exclusively the governed epistemic pipeline with founder promotion. Self-improving ≠ self-authorizing.
6. **Provenance parity**: any answer sourced from the index must carry citations resolvable to canonical records (conversation ids, fact ids, memory ids) — not to graph node uuids alone.

---

## 11. Failure Modes

### 11.1 Current-system failure modes [VERIFIED — pinned by tests unless noted]

| Mode | Behavior today |
|---|---|
| Lock contention > 30s in DurableFileStore | Degrades to unprotected write with loud log (accepted, documented) |
| LLM provider failure | Deterministic fallback classifier (`liveAi:false`); capture failure contained, logged without content |
| Store read failure | Slice-level fail-soft, `degradedStores[]`, never crashes the turn |
| Knowledge cache vs store divergence | `queryKnowledge` scores in-process cache only — **known authority gap** (G8), latent in local mode |
| Nonexistent conversationId | Provisions a new conversation (deliberate, pinned divergence) |
| Retrieval decision audit | **None persisted** — retrievalHit/degradedStores are in-flight only (G9) |

### 11.2 Failure modes introduced by Option B/C (graph adoption) [INFERENCE + GRAPHITI-VERIFIED base facts]

- **Sidecar outage** → retrieval unavailability unless fail-soft fallback to Option A path is engineered (mandatory).
- **Index drift** from canonical stores (no cross-DB transactions) → stale or phantom facts returned; mitigation: periodic rebuild + provenance resolution + staleness watermark.
- **LLM extraction misjudgment** → a true fact soft-invalidated, or a false one asserted in the index; contained only if the index is advisory-only and every authority answer resolves through canonical state.
- **Cost runaway** → multiple LLM calls per episode at ingestion; a bulk history import can be silently expensive. Mitigation: budget caps, deterministic `add_triplet` ETL, per-day ingest budgets.
- **Version churn** → Graphiti 0.x breaking changes; graph schema migrations on our own.
- **Security** → unauthenticated services accidentally exposed; multi-group query bugs returning cross-tenant data (cf. FalkorDB #1659 class of bugs).
- **Organizational** → Python+TS dual stack, two query languages, split debugging.

### 11.3 Failure modes of adopting Option A without the benchmark [INFERENCE]

- Embedding-model churn / dimension migrations; fusion-weight tuning debt; false confidence that "hybrid retrieval" solved authority questions it cannot (retrieval quality ≠ truth); pgvector operational maturity under-estimated at scale.

---

## 12. Operational Complexity

**Current footprint** [VERIFIED]: one Next.js app (port 3000), SQLite + `.data/*.json` persistence, WS gateway (3001), cron heartbeat mini-service (3010), zero external databases, zero external AI dependency beyond the z-ai SDK chain with fallbacks. Deliberately minimal — this is a feature.

**Delta per option**:

| | A (PostgreSQL-native) | B (PG + Graphiti) | C (Graph-first) |
|---|---|---|---|
| New processes | 0 (Postgres is already the M6-Postgres plan) | +1 Python sidecar, +1 graph DB (Neo4j/FalkorDB) | +1 graph DB (as primary) |
| New languages/runtimes | 0 | Python 3.10+ | Python or Polyglot |
| New vendor deps | pgvector extension | Neo4j/FalkorDB + LLM/embedding provider + posthog (disable) | graph DB vendor |
| New skills | SQL/FTS/pgvector (mainstream) | Cypher/Redis-graph ops + Python service ops | as B, deeper |
| LLM cost at ingest | Embedding only (per changed record) | Embeddings + multiple extraction/dedupe/resolution LLM calls **per episode** | as B, plus re-platforming |
| Backup/DR | Existing Postgres story | Postgres **and** graph DB + ETL consistency | graph DB story |
| Observability | Existing + retrieval metrics | + sidecar health, index freshness, drift monitors | as B |

[INFERENCE] At the current data scale (~10¹-10³ memory records, ~10² conversations), Graphiti's operational weight is disproportionate to its proven benefit; PostgreSQL-native additions are proportional.

---

## 13. Migration / Lock-in Analysis

- **License**: Graphiti is Apache-2.0 [GRAPHITI-VERIFIED] — no license lock-in; fork-able.
- **Data lock-in**: moderate. Episodes/nodes/edges are exportable (Pydantic models → JSON), but embeddings are model-specific (`text-embedding-3-small` default) and re-ingestion into any successor is a rebuild. Under the **derived-index rule** (§10.2.1) the graph is always rebuildable from canonical Postgres stores, making effective lock-in **low** — but only if that rule is actually enforced from day one (no authority data ever written only into the graph).
- **Embedding model lock-in** (applies to A2 as much as B1): embedding choice is a long-lived decision; mitigate by (a) storing embeddings as a derived, regenerable column, (b) versioning the model id, (c) keeping the lexical path functional as fallback.
- **Exit criteria for B**: export graph → canonical reconciliation → drop graph → Option A path continues. Reversibility: high if index-only; low if C.
- **Versioning**: Graphiti 0.x (breaking changes expected); SamJuniors pins via lockfile + evaluated versions only.
- **Hosted alternative**: Zep (their managed engine) was considered and is **excluded** from this evaluation's recommendation set: it would outsource the authority model and data perimeter that constitute the product's core, contradicting the sovereignty doctrine (AUDIT 08) [INFERENCE].

---

## 14. Recommendation

**Conditional, staged, evidence-gated. No graph database now. No Graphiti now. Benchmark first.**

| ID | Recommendation | Condition / gate |
|---|---|---|
| R1 | **Build M5.1 — the retrieval benchmark harness** (§7): frozen fixtures, 8 query classes, gold sets, scoring, and a baseline run of the current M4 path (A0). Also restore the missing evaluation discipline: commit the harness as the successor to the never-committed `m4c_retrieval_evaluation.test.ts`. | Unconditional — needed regardless of architecture. Measures before buying. |
| R2 | **Fix the two measurement-blocking hygiene gaps (M5.2)**: route `queryKnowledge` through the authoritative store; persist a minimal retrieval-decision audit (slice hit/degraded flags) or wire TurnMetrics. | Unconditional — both are documented in-code debts (G8/G9); required for the benchmark's numbers to mean anything. |
| R3 | **Pursue PostgreSQL-native hybrid retrieval (M5.3)** — Postgres + `tsvector` FTS + `pgvector` + RRF over canonical tables, aligned with AUDIT 05's ratified target and the M6-Postgres (legacy) migration — **if** M5.1 shows A0 failing the semantic/temporal gates (expected, per the doc-admitted paraphrase gap). | Gate: A0 fails semantic or temporal class; A2 passes them in benchmark. |
| R4 | **Graphiti prototype (M5.4) — sandbox-only, small, reversible** — **only if** the associative classes (BQ3/BQ4) remain failed by A2 *and* the Founder judges dependency/entity queries product-critical. Prototype = sidecar in the sandbox, fixture-fed via deterministic ETL (`add_triplet`), read-only retrieval, group_id-scoped, never in the production request path. | Gate: A2 fails associative gate AND B1 passes it with ≥0.1 margin at acceptable latency/cost — measured, not asserted. |
| R5 | **Wire agent evaluation/telemetry (M5.5)**: either implement or delete TelemetryMetric; wire TurnMetrics on the canonical path; surface retrieval metrics. | Unconditional (small). |
| R6 | **Do NOT** adopt a graph DB in production, create a second memory system, create a second Sophia, install Graphiti/Neo4j/FalkorDB into the product, implement autonomous consolidation/forgetting, or let any LLM-judged process write company truth. | Standing constraint of this evaluation. |

**Explicitly conditional statements** (per the task's requirement — none of these is a "Graphiti is better" claim):

- Graph retrieval should be introduced only if benchmark M5.1 demonstrates a material improvement of the Graphiti prototype over both the existing retrieval path and the PostgreSQL-native candidates on the multi-hop and entity-centric classes, at acceptable operational cost and with the derived-index rule intact.
- Embeddings should be introduced only as retrieval indexes over canonical rows (never as canonical truth), and only if the benchmark shows the lexical path failing the semantic gate.
- Temporal queries ("what was true then", "what changed since") should be built relationally over the existing supersession chains first; a temporal graph is justified only if the relational implementation measurably underperforms.
- Personal Mind semantic retrieval (paraphrase matching) is the most user-visible gap and the cheapest to fix inside Option A; it needs no graph.

**Why this order** [INFERENCE]: every later stage is gated by measured evidence from the earlier one; every stage is reversible; nothing in R1-R5 violates a repo invariant; R6 protects the moat (governance) while the commodity capability (retrieval quality) is upgraded.

---

## 15. Proposed Next Tasks

Ordered; each is a separately scoped implementation task requiring Founder approval before code changes. None is authorized by this document.

| ID | Task | Scope sketch (files) | Stop condition |
|---|---|---|---|
| M5.1 | **Retrieval benchmark harness** | New `tests/sophia/m5_retrieval_benchmark/` (fixture loader, gold sets, scorer, A0 runner); fixture JSON modeled on §7; deterministic; runs under `bun test` | Baseline A0 numbers for all 8 classes committed; **STOP for Founder review of numbers before any architecture work** |
| M5.2 | **Retrieval hygiene** | `knowledge-store.ts` queryKnowledge authoritative routing (the fix already sketched in-code `:538-558`); minimal retrieval audit fields | Lint + existing suites green (H12 tokenizer pin must stay green); **STOP** |
| M5.3 | **PostgreSQL-native hybrid retrieval prototype** (conditional on M5.1 gates) | Postgres schema migration path (M6-Postgres legacy begins), FTS/pgvector columns on SophiaMemory/CompanyKnowledge/ChatMessage, RRF fusion module behind the existing selection interfaces; A1/A2 benchmark runners | Benchmark A1/A2 numbers vs gates; **STOP for Founder architecture decision** |
| M5.4 | **Graphiti prototype** (conditional on M5.3 failing associative gate) | Sandbox-only `mini-services/`-adjacent Python sidecar or standalone repo dir; fixture ETL via `add_triplet`; read-only `/search` behind our auth; B1 benchmark runner; derived-index rule enforced in code | B1 numbers vs gates + cost report; **STOP for Founder decision**; never merged into production request path |
| M5.5 | **Agent evaluation wiring** | `sophia/metrics.ts` TurnMetrics on canonical path; retrieve-or-remove TelemetryMetric schema decision (schema change is a separate approval); honest metrics in agent-chat (replace placeholder) | Suites green; **STOP** |
| — | *Deferred (separate decisions, not M5 scope)*: episodic conversation search UI; consolidation/forgetting design (the previously drafted M4-E territory — now gated behind M5.1 evidence); vision/VLM integration; agent-protocol (MCP/A2A) exposure; Stonic-inspired "what you know about me" memory browser | | |

**Milestone-numbering reconciliation**: the legacy M5-cache item from `MEMORY_RECONCILIATION_REPORT.md` §H folds into M5.2/M5.3 (cache formalization remains "cache is never source of truth" — unchanged); the legacy M6-Postgres migration is referenced by M5.3 and remains the boundary this evaluation does not cross.

---

## Appendix A — Evidence Index (primary sources)

**SamJuniorsOS @ b9e63ad** (verified by direct read):
`prisma/schema.prisma` (505 lines, 22 models) · `src/lib/server/sophia/{personal-memory-store,context-assembly,memory-lifecycle,memory-gate,memory-capture-stage,memory-extractor,memory-review-annotations,authority-content-guard,entity-resolver,intent-classifier,server-gateway,turn-executor,metrics}.ts` · `src/lib/server/knowledge/knowledge-store.ts` · `src/lib/server/{memory,state,conversation,epistemic,agents,orchestration,authorization,workflow,idempotency,coordination,persistence,db}/` · `src/app/api/**` (44 routes) · `tests/` (33 test files) · `docs/architecture/{SOPHIA_MEMORY_ARCHITECTURE,MEMORY_RECONCILIATION_REPORT,ADR-001}.md` · `doc/AUDIT 05 — AI Skills, Context, and Memory.md` · root `ARCHITECTURE.md`, `AGENTS.md`.

**Graphiti v0.30.2** (verified from source clone):
`pyproject.toml` (version/license/deps/backends) · `graphiti_core/{nodes.py:318,499, edges.py:263, graphiti.py:1043-1852, search/search_config.py:34-72, search/search_utils.py:65-175, search/search_filters.py:55-67, utils/maintenance/edge_operations.py, driver/ (no PostgreSQL backend)}` · `README.md` (Zep-vs-Graphiti positioning) · `SECURITY.md` · `server/graph_service/`, `mcp_server/`.

## Appendix B — Known Discrepancies Found During Verification

1. `SOPHIA_MEMORY_ARCHITECTURE.md` §15 cites `tests/sophia/m4c_retrieval_evaluation.test.ts` ("Task 42 evidence suite") — **never committed to any branch**; the M4-D measurements quoted there (gold rank improvements, ~25 ms selection) are **doc-claimed, unverifiable in-tree**. M5.1 supersedes this with a committed harness.
2. Root `ARCHITECTURE.md` still describes CompanyKnowledge as "dead" era facts (e.g., decay scoring as if live) — stale relative to the memory chain; root docs froze at the Phase 4C-B era.
3. `doc/AUDIT 05`'s Zep row ("Neo4j/PostgreSQL with bitemporality") describes the hosted Zep platform; open-source Graphiti has **no** PostgreSQL backend — corrected in §5.6.
4. `MEMORY_RECONCILIATION_REPORT.md` reserved "M5" for cache formalization; numbering collision resolved in this document's header note and §15.

---

*End of evaluation. This document made no code changes, added no dependencies, installed nothing, and committed nothing beyond itself. Awaiting Founder review.*
