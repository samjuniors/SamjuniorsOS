# SOPHIA MEMORY / BRAIN — RECONCILIATION REPORT

Status: RECONCILIATION COMPLETE / AWAITING FOUNDER REVIEW — **NO IMPLEMENTATION PERFORMED**
Date: 2026-09-21
Inputs: `docs/architecture/SOPHIA_MEMORY_ARCHITECTURE.md` (commit `3dd0b82`), full repository (branch `feat/sofia-merge` @ `3dd0b82`), all tests under `tests/`, live runtime in the sandbox preview, docs/audits (`doc/AUDIT 00/05/06/07/10`, ADR 0002/0003, ADR-001, ROADMAP, PRODUCT_ARCHITECTURE).

---

## 0. DATABASE REALITY (verified, separated per architecture doc §8)

| | What is true |
|---|---|
| **CURRENT IMPLEMENTATION** | `prisma/schema.prisma` declares `provider = "sqlite"` — an explicit **sandbox port of the upstream PostgreSQL schema** (enums flattened, Decimal→Float). `DATABASE_URL=file:./db/custom.db`. `DATABASE_MODE` unset in dev → `getDatabaseMode()` returns `local` (production would default to `authoritative`). All "Postgres*Store" classes (`PostgresEpistemicStore`, `PostgresAgentRunStore`, `PostgresIdempotencyStore`) actually run against **SQLite via Prisma** in this branch. Dual-mode stores: local mode = in-memory Maps + `.data/*.json` (DurableFileStore) + best-effort Prisma dual-write; authoritative mode = Prisma fail-closed (`DatabaseAuthorityError` 503). Live preview: `.data/` contains only `instance.lock` — no memory/conversation collections written yet; the app runs on in-memory seed constants. |
| **TARGET ARCHITECTURE (docs)** | PostgreSQL + Prisma as the single authoritative store (PRODUCT_ARCHITECTURE §14, AUDIT 05); DurableFileStore is the documented **single-instance primary** until Postgres is provisioned (ADR 0002 §7); pgvector/hybrid RAG explicitly **deferred** until the knowledge corpus outgrows full-context injection. |
| **MIGRATION REQUIRED** | Yes — Postgres provisioning + `DATABASE_MODE=authoritative` is the documented next milestone ("Full relational persistence" is ROADMAP *NEXT*, not done). Nothing in this report assumes Postgres is live. |

---

## 1. RECONCILIATION MAP (every existing memory-ish abstraction)

Legend — **Owner**: which brain owns the *concept* (P = Sophia Personal Mind, C = SamJuniors Company Brain, I = infrastructure). **SoT** = is it currently a source of truth in any mode?

| # | Existing abstraction | Current purpose | Canonical owner | Memory type | SoT? | Duplicate? | Verdict | Reason |
|---|---|---|---|---|---|---|---|---|
| 1 | `CompanyMemoryStore` (`lib/server/memory/memory-store.ts`) | Founder-approved historical precedents; in-mem array + `.data/company_memories.json` + Prisma `CompanyMemory` (whole object in `details` JSON; `importance:1`, `decayScore:1.0` hardcoded) | C | Episodic/semantic precedent | Only in authoritative mode; local = `.data`+memory | Yes (#3, #7, #9) | **KEEP + EXTEND** | The governed precedent store; 4.4E tests pin the full Fact→Memory lineage. Extend columns/lifecycle, don't replace |
| 2 | `OperationalLearningLoop` (`learning-loop.ts`) | Deterministic keyword retrieval + 3 hardcoded conflict cases + "NOT NEW EVIDENCE" prompt formatting | C | Procedural | No (pure logic) | Partial (#15 conflict rules) | **KEEP + EXTEND** | Correct governance labels; retrieval is token-overlap only (AUDIT 05 flaw #2 stands); conflict rules are demo-hardcoded — keep deterministic, make data-driven |
| 3 | `INITIAL_COMPANY_MEMORIES` / `CANONICAL_COMPANY_KNOWLEDGE` / `os-data.ts` seeds | Baked-in "canonical" company data in source code | none (code) | Seed data | No | Yes (#1, #4, #6, #7) | **KEEP as seed, DEMOTE from runtime authority** | Seeds must become migration data (one-time insert), not the effective source of truth on every boot |
| 4 | `CompanyKnowledgeStore` (`knowledge/knowledge-store.ts`) | SOPs/PRDs/policies for retrieval; **in-memory only — `addKnowledge` never persists anything** | C | Semantic/procedural (docs) | No | Yes (#5, #3) | **KEEP + EXTEND** | Right interface, wrong durability. Wire it to Prisma + DurableFileStore; poison-resistance already tested |
| 5 | `CompanyKnowledge` (Prisma model) | **DEAD** — zero reads/writes anywhere in `src/` | C | Semantic | No (unused) | Yes (#4) | **EXTEND (activate)** | Becomes the canonical knowledge table it was designed to be (`hash`, `category` index already in schema) |
| 6 | `CompanyStateStore` (`state/state-store.ts`) | Operational state (initiatives, finance, decisions…); partial `.data` + partial Prisma coverage; `recordDecision`/`updateFinancialMetrics` have **zero callers** | C | Working/current state | Partial (3 fields in auth mode) | Yes (#7) | **KEEP + EXTEND** | Intended single state authority; today it is written by nobody and read only by the council context path |
| 7 | `CompanyContextProvider` (`context/company-context.ts`) | Serves the "full company context" to Sophia slice 1, ServerGateway, agent-chat, advisor — but `getCanonicalContext()` reads **os-data constants**, not the stores; holds 4 parallel module-level arrays | C (should be P-facing read layer) | Working memory constructor + ephemeral holders | Effectively yes (constants!) | Yes (#6, #1, #8, #9) | **MERGE into formatter; deprecate parallel state** | Biggest authority inversion: Sophia's `AUTHORITATIVE_OPERATIONAL_STATE` slice is hardcoded demo data. Keep the formatter, delete the shadow state (after wiring) |
| 8 | `serverRecentIntelligence` / `serverEngineeringIntelligence` (in CompanyContextProvider) | Ephemeral research notes; written by the GitHub tool provider; **lost on restart** | C (evidence) | Episodic (observations) | No | Yes (#14 epistemic sources) | **MERGE into epistemic ingest** | These are `EvidenceSource`s in disguise; route through `EpistemicPipeline.ingestSource` for durable, provenance-carrying capture |
| 9 | `serverCompanyMemory` / `serverOrchestrationHistory` (in CompanyContextProvider) | **Dead write paths** — `recordCompanyMemory`/`recordOrchestration` have zero callers; advisor prompt always shows an empty memory section | — | — | No | Yes (#1, #18) | **DEPRECATE (pending Founder approval)** | Pure duplication; zero callers; misleading projections |
| 10 | `ConversationStore` + `Conversation`/`ChatMessage` (Prisma) | Founder-scoped durable dialogue (Phase 3, ADR 0002); ownership fail-closed; idempotent turns | P (interaction memory) + audit trail | Episodic (personal) | Yes (`.data` primary, Prisma opportunistic) | Yes (#12) | **KEEP (canonical conversation authority)** | Correct design and tests. Extend: Prisma read path (messages today are **write-only shadows** — `getMessages` reads only the file store), pagination, archival |
| 11 | `EpistemicClaimStore` (dual-mode) + `PostgresEpistemicStore` | Source→Signal→Claim→Verification→Fact lifecycle with supersession; `.data` + Prisma | C | Semantic (facts) + raw evidence | Yes (auth mode; local = `.data`) | No | **KEEP** | The Company Brain's epistemic substrate; 4.4E tests pin lineage, fail-closed promotion, restart survival |
| 12 | `EpistemicPipeline` (`epistemic/pipeline.ts`) | Founder-sovereign promotion, separation-of-powers, constitution checks | C | Procedural (governance logic) | No (logic) | Partial (#2) | **KEEP + EXTEND later** | `detectFactContradiction` is 2 hardcoded cases — future work, deterministic-first |
| 13 | `EpistemicBoard` (`epistemic/board.ts`) + `/api/epistemic` | Founder review projection (claims/facts/memories + lineage) | C | View | No (derived) | No | **KEEP** | Honest projection; tests pin no-fabricated-provenance |
| 14 | `AgentRunStore` (dual-mode) + `AgentRun` (Prisma) | Durable work episodes (output, claims, provenance) | C | Episodic (work) | Yes | No | **KEEP + EXTEND** | Local mode loads the entire `.data/agent_runs.json` into a Map at construction — needs pagination/lazy reads at scale |
| 15 | `ContextualRetrievalService` + `ContextAssemblyService` (`context/`) | 8-stage employee context assembly (12k-char budget, epistemic precedence, SHA-256 frozen snapshot, `Object.freeze`) | C | Working memory constructor | No (derived) | Partial (its own conflict rules vs #2) | **KEEP** | The council-side working memory factory; architecturally sound |
| 16 | `SophiaContextAssembler` (`sophia/context-assembly.ts`) | Sophia's per-turn 9-slice bounded context (~1,800-token ceiling, fail-soft, EPISTEMIC WARNING partitioning) | P (reads C) | Working memory constructor | No (derived) | Partial (two assemblers by design) | **KEEP** | This IS Sophia's working memory today; test-pinned behavior |
| 17 | `executeSophiaTurn` + in-flight turn locks (`sophia/turn-executor.ts`) | Unified text/voice ingress → Conversation → Assembler → Classifier → Gateway; exactly-once per turnId | P (reads C) | Working memory flow | No | No | **KEEP** | The single cognitive ingress; ADR-001's guarantee |
| 18 | `ActivityProjection` (`activity/projection.ts`) | Stateless derivation of company events from 5 authoritative sources | C | Derived view | No (derived) | Yes (overlaps #9) | **KEEP** | Deterministic, honest, restart-safe — the right pattern for derived memory |
| 19 | `InMemoryApprovalStore` + `SideEffectAudit` + `IdempotencyStore` | Governance gates, audit ledger, exactly-once | I/C | Working + audit | Yes | No | **KEEP** | Golden invariants, heavily tested. Verify idempotency `expiresAt` enforcement on `claim()` (stored but not checked) |
| 20 | Scheduler stores (`ScheduledWorkItem`, `SchedulerHeartbeat`, leases) | Time-based work + heartbeat audit | C | Procedural/audit | Yes | No | **KEEP** | Also the natural home for the future memory-lifecycle jobs (no new infra) |
| 21 | `TelemetryMetric` (Prisma model) | **DEAD** — zero usages | C | Raw telemetry | No (unused) | No | **EXTEND later or DEPRECATE** | Intended reality-grounding feed (LUMORAGLM/Stripe); unused today |
| 22 | `DurableFileStore` (`persistence/durable-file-store.ts`) | Atomic whole-file JSON persistence for local/test mode | I | Durability engine | Local mode only | No | **KEEP (local/test only)** | Whole-collection rewrite per `saveItem` = O(N) write amplification; already correctly bypassed in authoritative mode |
| 23 | SOFIA surface history (`sofia/store.ts` + `/api/sofia/ask`, client-side) | The sofia-next voice/typed assistant keeps its **last-40-message history in the browser** and sends it with every request; server keeps nothing | P | Working/episodic (personal) | No | **Yes (#10) — the "Two Sophias" risk ADR-001 warns about** | **MERGE (Founder decision required)** | Two conversation systems for one persona: browser-held vs server-durable. Must converge or be explicitly declared ephemeral |
| 24 | `osStore` (`os/lib/osStore.ts`, localStorage) + `ChatPanel` conversationId | Client UI state, live transcript, active conversation pointer | P | Client session state | No | No | **KEEP (UI only)** | Already treated as untrusted; never authority — matches invariant #7 |
| 25 | `CompanyMemory.decayScore`/`importance`/`tags`/`category` (schema columns) | Designed for memory lifecycle | C | Lifecycle metadata | No (dead columns — always 1.0/1/[]/null) | No | **EXTEND** | The forgetting hooks exist in schema but are never written or read |

---

## A. EXISTING MEMORY INVENTORY (summary by class)

**Company Brain — authoritative stores (server):** CompanyState (Prisma row + DurableFileStore + in-mem), CompanyKnowledge (dead Prisma model + non-persistent in-mem store), CompanyMemory (store + `.data` + Prisma JSON-blob), EpistemicSource/Signal/Claim/Verification/CanonicalFact (dual-mode store, full lifecycle), AgentRun (dual-mode), ApprovalRecord/SideEffectAudit/ScheduledWorkItem/SchedulerHeartbeat/IdempotencyRecord (Prisma + in-mem), Conversation/ChatMessage (founder-scoped dialogue).

**Personal Mind — what actually exists:** ConversationStore records (founder↔Sophia dialogue — currently the *only* durable personal-side memory), per-turn SophiaContextAssembler working memory (reconstructed each turn, never stored), the SOFIA surface's browser-held 40-message history, osStore/localStorage UI state, personas/avatars/constraints as **code constants**, live-session ephemeral state (60s reconnect window). **There is no server-side personal-preference store, no personality persistence, no sensory-interpretation memory.**

**Derived/projection (stateless, correct by design):** EpistemicBoard, ActivityProjection, graph read-model, SophiaContextAssembler output, ContextAssemblyService output.

**Infrastructure:** DurableFileStore (`.data` JSON), Prisma/SQLite, in-process Maps, in-flight turn locks, module-level arrays in CompanyContextProvider.

**Test-verified behavior (de-facto contract):** epistemic lifecycle fail-closed and founder-sovereign; memories are precedents ("NOT NEW EVIDENCE") with evidence lineage; conversations founder-scoped/idempotent/durable; context partitioned and budget-bounded; authorization never imports epistemic/memory; projections honest; restart survival for conversations/epistemic/activity/schedules. **No tests exist for:** forgetting/decay (dead columns), consolidation, cache freshness, embeddings (none exist), knowledge persistence (can't — it doesn't persist), CompanyState writes.

---

## B. DUPLICATION / CONFLICT MAP

1. **Two conversation systems for one Sophia (critical).** OS path: `/api/agent-chat` + live voice → `executeSophiaTurn` → ConversationStore (durable, founder-scoped, governed). SOFIA surface path: `/api/sofia/ask` → provider chain (z-ai→Gemini→local) with browser-held history (stateless server). Same persona, two memory models, two prompt systems, two tool sets. This is precisely ADR-001's "Two Sophias" failure mode, now inside one app.
2. **Two sources of "authoritative operational state" (critical).** `CompanyContextProvider.getCanonicalContext()` serves Sophia's slice 1, the ServerGateway, agent-chat and the advisor — from `os-data.ts` **code constants**. `CompanyStateStore` (the intended authority, with Prisma + `.data` persistence) is read only by the council assembly path, and **its write methods have zero callers**. DB writes to CompanyState can never reach Sophia's context.
3. **Company memory ×3.** `CompanyMemoryStore` (durable-ish), `CompanyContextProvider.serverCompanyMemory` (dead write path, always empty), `INITIAL_COMPANY_MEMORIES` (code seed re-asserted at every boot when `.data` is empty).
4. **Knowledge ×3.** In-memory `CompanyKnowledgeStore` (non-persistent, code-constant seeds), dead `CompanyKnowledge` Prisma table, and the repo's actual docs (`doc/*.md`, `docs/sofia/*`) — three unsynchronized homes for "company knowledge."
5. **Conflict detection ×3.** `OperationalLearningLoop.detectConflict` (3 hardcoded cases), `EpistemicPipeline.detectFactContradiction` (2 hardcoded cases), `ContextualRetrievalService.detectConflicts` (rule-based). All deterministic (good) but disjoint and demo-specific.
6. **Research/intelligence duplication.** `serverRecentIntelligence` (ephemeral, restart-lost, written by the GitHub tool) vs `EpistemicSource` (durable, provenance-carrying, designed for exactly this).
7. **History/audit overlap.** `serverOrchestrationHistory` (dead, ephemeral) vs `AgentRun` (durable) vs `ActivityProjection` (derived). Only the latter two are real.
8. **Dead schema weight.** `TelemetryMetric` unused; `CompanyKnowledge` unused; `CompanyMemory` columns (`decayScore`, `importance`, `tags`, `category`) dead; `ChatMessage` Prisma rows are written but never read back (`.data`-only reads).
9. **Cache/authority inversion (local mode).** In-memory singletons are simultaneously cache and de-facto source of truth; `CompanyMemoryStore.getMemoryById` even pushes Prisma rows *into* the in-memory array (cache absorbing authority). Nothing carries freshness/version metadata; singletons load once at construction and never refresh.
10. **Test-isolation defect:** `resetStores()` in phase2 never clears Knowledge/Memory stores → poisoned knowledge items persist process-wide across suites.

---

## C. CANONICAL OWNERSHIP MAP (proposed)

| Data class | Canonical owner (single) | Everything else becomes |
|---|---|---|
| Company operational state | `CompanyStateStore` → Prisma `CompanyState` (authoritative mode) | CompanyContextProvider = read/format only; os-data = one-time seed migration |
| Company knowledge (SOPs, specs, policy) | `CompanyKnowledgeStore` wired to Prisma `CompanyKnowledge` | Code constants = seed migration; repo markdown = authored source, ingested via hash (column exists) |
| Company precedent memory | `CompanyMemoryStore` → Prisma `CompanyMemory` | serverCompanyMemory removed; seeds migrated once |
| Canonical facts & epistemic evidence | `EpistemicClaimStore` → Prisma (unchanged) | — |
| Founder↔Sophia conversation (all modalities) | `ConversationStore` → Prisma (extended read path) | SOFIA-surface browser history either converges here or is formally declared ephemeral (Founder decision) |
| Work episodes | `AgentRunStore` → Prisma | — |
| Sophia working memory | `SophiaContextAssembler` per-turn construction (ephemeral by design) + a future bounded session cache (performance layer only) | — |
| Sophia personal memory (preferences, interaction patterns, sensory notes) | **Does not exist yet** — net-new, Founder decision on shape (see K-2). Must live on the Personal-Mind side of the gate with governed promotion into Company stores | Never CompanyMemory directly |
| Derived views | ActivityProjection / EpistemicBoard / graph read-model (stateless, keep) | — |
| Audit/raw history | SideEffectAudit, SchedulerHeartbeat, EpistemicSource.rawContent, `.data` JSON, IdempotencyRecord | Append-only, never "forgotten" |

---

## D. RECOMMENDED TARGET ARCHITECTURE (extends what exists — no parallel system)

**Two brains, one gate (unchanged from the doc):** Sophia's Personal Mind = conversation/working/personal memory + sensory interpretation + routing decisions. Company Brain = state/strategy/finance/knowledge/workflows/decisions/governance/audit/facts. Sophia reads the Company Brain through the existing authority-labeled slices and can propose, never authoritatively write, company truth (promotion stays in `EpistemicPipeline` under founder principals).

**Six memory classes mapped onto existing abstractions:**

| Class | Owner (existing) | Gap |
|---|---|---|
| Working | `SophiaContextAssembler` (per-turn) + live session state | Add a small TTL'd session cache (performance only) |
| Episodic | `Conversation`/`ChatMessage` (personal), `AgentRun` (work) | Consolidation + archival lifecycle missing |
| Semantic | `CanonicalFact` (company truth), `CompanyKnowledge` (docs) | Knowledge persistence dead; needs wiring |
| Associative | `decisionId`, claim→source→fact relations, fact supersession chain | No general entity linking — defer (measured need first) |
| Procedural | SOPs (`CompanyKnowledge`), skill registry, learning-loop governance rules, constitution checks in code | Keep deterministic; externalize hardcoded rules to data gradually |
| Raw/audit | `SideEffectAudit`, `SchedulerHeartbeat`, `EpistemicSource`, `.data`, `IdempotencyRecord` | Retention policy formalization |

**The memory engine (the one genuinely new component, built on existing parts):** a `MemoryGate` + consolidation job implementing the doc's pipeline — `Experience → capture → gate → retain/discard → consolidate → index → retrieve → lifecycle`. Placement: a deterministic service invoked at turn-completion (turn-executor) and a scheduled job on the **existing** `WorkflowScheduler` (no new infra). Rules first (relevance/recurrence/importance/novelty/redundancy/staleness per doc §3); LLM summarization may only produce *derived, advisory* episode notes — never canonical content (doc rule: no LLM-only pipeline as source of truth). Company-critical retention flows through the epistemic/company-state architecture (doc §6).

---

## E. STORAGE / INDEX / CACHE ARCHITECTURE

- **Storage tiers (current → target):** in-process Maps (cache) → `.data` JSON (local durability) → Prisma/SQLite (sandbox authority) → PostgreSQL (target authority). The dual-mode store pattern already encodes this; keep it.
- **Indexes today:** Prisma indexes exist on the right columns (conversationId+createdAt, status+executeAt, verificationStatus+category…) but code rarely uses them (full-collection scans in `getMessages`, `findMessageByIdempotencyKey`, `listRuns` local mode, `getAllMemories`). **Fix reads to be query-shaped before adding any index.**
- **Lexical retrieval:** token-overlap everywhere. Before any vector work, add SQLite FTS5 / Postgres full-text (deterministic, cheap, explainable) behind the existing store interfaces.
- **Vectors:** none. Per doc §7 and PRODUCT_ARCHITECTURE §15, defer pgvector until measured retrieval failure at real corpus size. Embeddings, when added, are retrieval indexes only — never truth.
- **Cache:** formalize what singletons already are: TTL + version/freshness metadata, miss = re-read authoritative store, never answer company-state questions from stale cache without validation (doc §6). Loss of cache must be non-destructive (already true structurally, needs enforcement + tests).

---

## F. CONSOLIDATION + FORGETTING LIFECYCLE (design, not implemented)

- **Retention gate at write time:** deterministic scoring (importance heuristics exist in embryo: `epistemicConfidence`, `evidenceReferences`, category bonuses in the learning loop). Low-value turns stay in raw audit history; only gated items become active memories.
- **Consolidation:** N observations → episode summaries → durable patterns, with `evidenceReferences` pointing at concrete `ChatMessage`/`AgentRun`/`EpistemicSource` ids (the mechanism 4.4E already proves for Fact→Memory). 1000 observations → 100 episodes → 10 patterns is a compression of *active* memory, not of evidence.
- **Lifecycle states:** `HOT → WARM → COLD → ARCHIVE → EXPIRE` as a `lifecycleState` (+ `lastAccessedAt`, `accessCount`) on memory records; transitions driven by TTL/decay (reusing the dead `decayScore` column), access frequency, and founder retention policy; executed by the existing scheduler heartbeat.
- **Forgetting ≠ deletion:** active-cognition removal only. Audit/approval/side-effect/epistemic-source histories are append-only and exempt. Founder-only expiry of memories; soft-delete with tombstone per AUDIT 05 D-series.

---

## G. SCALING STRATEGY (evidence-driven thresholds; nothing built now)

| Scale (records) | Action | Trigger |
|---|---|---|
| ≤ ~10⁴ (today: ~10¹) | Nothing. Current design is correct and simple | — |
| ~10⁵–10⁶ | Query-shaped reads + pagination everywhere; FTS5/Postgres FTS behind store interfaces; archive conversations to cold table | p95 retrieval latency or collection-scan cost measurably degrades |
| ~10⁷ | PostgreSQL + time-range partitioning for ChatMessage/AgentRun/audit; background consolidation mandatory (working set stays small per doc §4) | Sustained write volume / table sizes |
| 10⁸+ (doc's stated horizon) | Partitioned Postgres + object/event storage for raw history + vector index *if* retrieval quality measurably lacks; distributed search only with evidence | Measured, not speculative |

Known future bottlenecks to watch, not to fix now: DurableFileStore whole-file rewrites (already bypassed in authoritative mode); in-memory Maps holding full collections; `getAllMemories`/`listRuns` unbounded; embedding cost (none today); write amplification of dual-writes (accept in local mode, zero in authoritative mode).

---

## H. MIGRATION PLAN (phased, each step test-first, no rewrite)

- **M0 — Hygiene (no behavior change):** fix phase2 `resetStores` contamination; verify/complete idempotency `expiresAt` enforcement; document that "Postgres*" classes run on SQLite in the sandbox (naming honesty per doc §8).
- **M1 — Unify authority reads:** Sophia slice 1 / ServerGateway / agent-chat / advisor read from `CompanyStateStore` (not CompanyContextProvider constants). CompanyContextProvider becomes a pure formatter; delete dead `serverCompanyMemory`/`serverOrchestrationHistory` after caller audit (they have none). Small diff, large correctness gain.
- **M2 — Activate knowledge persistence:** wire `CompanyKnowledgeStore` to Prisma `CompanyKnowledge` + DurableFileStore (same dual-mode pattern as its siblings); one-time seed migration of the 8 canonical documents; ingestion path respects the existing SHA-256 hash column.
- **M3 — Conversation convergence (Founder decision K-1):** route the SOFIA surface (`/api/sofia/ask`) history through `ConversationStore` (or formally declare it ephemeral). This closes the Two-Sophias gap at the memory level while keeping both UX surfaces.
- **M4 — Memory lifecycle:** add `lifecycleState`/`lastAccessedAt`/`accessCount` (+ bi-temporal `validFrom/validTo` per AUDIT 05) to `CompanyMemory`; implement the deterministic `MemoryGate` + scheduler-driven consolidation/decay job; personal-memory store if approved (K-2).
- **M5 — Cache formalization:** TTL/version/freshness on retrieval caches; stale-fallback rules; metrics.
- **M6 — Postgres migration (separate milestone, already on ROADMAP):** provision, `DATABASE_MODE=authoritative`, cut DurableFileStore out of the authoritative path.

---

## I. REQUIRED SCHEMA CHANGES (proposed only — none applied)

1. `CompanyMemory`: first-class `subject`/`category` (real values, not `decisionId` leftovers), `lifecycleState`, `lastAccessedAt`, `accessCount`, `validFrom`/`validTo`, `supersedesMemoryId`, `promotedBy`/`provenance` — while keeping `details` for the transitional shape. Index on `(lifecycleState, lastAccessedAt)`.
2. `Conversation`: `lastTurnAt`/`summary` columns to support consolidation references and archival without scanning messages.
3. `ChatMessage`: optional `turnId` (turn-executor already synthesizes `${turnId}`/`${turnId}:assistant` keys — formalize).
4. Net-new (Founder decision): Sophia personal-memory tables (Personal-Mind side), e.g. `SophiaMemory` with the same provenance discipline but personal scope, **never** auto-promoted into company stores.
5. `TelemetryMetric`: keep or drop — decide with the reality-grounding milestone.
6. All changes SQLite-compatible first; the enum/Decimal port conventions continue until the Postgres milestone.

---

## J. REQUIRED TESTS (before each migration step)

- M1: state-store updates are reflected in Sophia's assembled slice within one turn (kills the constants bug forever); CompanyContextProvider contains no mutable authority after wiring.
- M2: knowledge round-trip (add → restart → retrieve); poisoned-knowledge isolation survives persistence; hash change-detection works.
- M3: SOFIA-surface turn persists to ConversationStore with founder binding; idempotent replay across surfaces; untrusted transcript stays untrusted.
- M4: gate retain/discard determinism; consolidation output preserves resolvable `evidenceReferences`; lifecycle transitions; **audit history survives EXPIRE**; founder-only expiry; memory never grants authority (extends 4.4E [G1]).
- M5: cache miss falls back to store; stale cache never answers state questions; cache loss is non-destructive.
- Scale guards: `getMessages`/`listRuns` pagination limits enforced.
- All existing suites must stay green (they are the contract).

---

## K. RISKS / OPEN QUESTIONS

1. **K-1 (Founder decision):** Which brain owns the SOFIA-surface conversation — converge `/api/sofia/ask` onto `ConversationStore` (recommended; ADR-001 compliance) or explicitly declare the voice-surface history ephemeral-by-design?
2. **K-2 (Founder decision):** Personal Mind memory shape — new personal-scope tables (recommended, keeps the two-brain boundary physical) vs. scoped rows inside company tables (risks boundary erosion).
3. **K-3:** Synthetic data honesty: the "authoritative" financial model is seeded demo data labeled `[SANDBOX SIMULATION]`. Fine for the sandbox; must never silently become "live" truth — live-ledger integration is a product milestone, not a memory one.
4. **K-4:** `.data` vs SQLite divergence risk in local mode (dual-writes are best-effort; message reads ignore Prisma entirely). Authoritative mode resolves this; until then, treat `.data` as the local-mode primary exactly as ADR 0002 states.
5. **K-5:** Hardcoded conflict/constitution checks are demo-specific; generalizing them is policy work (deterministic code or data-driven policy tables) — explicitly *not* LLM work.
6. **K-6:** Idempotency `expiresAt` is stored but appears unenforced in `claim()` — verify before relying on TTL semantics.
7. **K-7:** Consolidation jobs cost compute on the founder's $0.50/directive budget (AUDIT 00 D14) — batch off-peak via scheduler; measure before scaling.
8. **K-8:** The architecture doc itself was stranded one commit ahead on the remote (now reconciled locally via this audit); keep `docs/architecture/` in the branch the founder reviews.

---

# VERDICT

**RECONCILE — DO NOT REWRITE. Extend the existing governed architecture; fix four specific authority inversions; add the missing memory-lifecycle layer on top of existing stores and the existing scheduler.**

**WHY:** The repository already contains a genuinely strong Company Brain — a test-pinned, fail-closed, founder-sovereign epistemic pipeline with honest provenance, idempotent durable conversations, and correctly-partitioned, budget-bounded context assembly (the de-facto test contract enforces the doc's invariants 1, 2, 5, 6, 7 today). Creating new memory tables or a vector database now would duplicate all of it. But the reconciliation surfaced real defects: **(1)** Sophia's "authoritative operational state" actually reads hardcoded demo constants, bypassing both the state store and the database; **(2)** the knowledge store never persists and its Prisma table is dead; **(3)** the merged app runs two separate conversation memory systems for one persona (the exact "Two Sophias" ADR-001 prohibits); **(4)** the designed forgetting hooks (decayScore/importance) are dead columns — there is no retention, consolidation, or lifecycle at all; **(5)** the Personal Mind has no server-side memory beyond raw chat logs. None of these require a rewrite — each is an extension or a wiring fix of an existing abstraction.

**CURRENT STATE:** SQLite sandbox port (DATABASE_MODE=local) with dual-mode stores (in-memory + `.data` JSON + best-effort Prisma); strong governance skeleton; token-overlap retrieval; no embeddings; no vectors; no forgetting; knowledge unpersisted; two conversation paths; state reads from code constants; several dead schema pieces; comprehensive passing tests that pin the right invariants and honestly expose the gaps (no forgetting/consolidation/cache tests because the features don't exist).

**TARGET STATE:** One conversation authority (all Sophia modalities through ConversationStore); state/knowledge/memory/facts each with exactly one canonical owner backed by Prisma (PostgreSQL at the migration milestone); Sophia's Personal Mind with a small, governed personal-memory store; a deterministic memory gate + scheduler-driven consolidation/forgetting with preserved provenance; cache as a pure performance layer; scale work strictly threshold-driven (FTS before vectors, partitioning before distribution).

**REQUIRED CHANGES:** Migration plan M0–M6 above; schema changes per §I; tests per §J. Nothing else. No new vector database. No new parallel stores.

**RISKS:** Founder decisions K-1/K-2 gate M3/M4; local-mode dual-write divergence until the Postgres milestone; consolidation compute cost against the budget ceiling; hardcoded conflict rules are demo-specific until externalized; test-isolation defect (phase2) can mask contamination.

**NEXT ACTION:** Founder review of this report, specifically: approve/deny K-1 (SOFIA-surface conversation convergence) and K-2 (personal-memory store shape), and greenlight the M0–M2 sequence (hygiene + state-read unification + knowledge persistence). **Implementation begins only after that approval. No code was changed in this reconciliation.**

---

## Addendum — M3 K-1 hardening review (2026-09-22, post-3da24b4)

*The body of this report is the point-in-time review baseline (branch feat/sofia-merge @ 3dd0b82). This addendum records what changed since and the authority-precision findings of the M3 K-1 hardening pass, so the doc set never conflates current implementation with target architecture.*

**Implemented since the report:** M0–M2 (commit 6ac3c03, correction pass 5067e99) and M3 K-1 (commit 3da24b4) — the SOFIA typed surface (`/api/sofia/ask`) is now a thin governed ingress delegating every turn to `executeSophiaTurn` over `ConversationStore`; browser history is untrusted, never persisted, never used to reconstruct canonical dialogue. Row 23's convergence item is therefore DONE; row 10's "KEEP (canonical conversation authority)" stands.

**ConversationStore authority semantics (verified per method):**
- Local DurableFileStore (`.data/conversations.json`, `.data/chat_messages.json`) is the primary write target and the authoritative read source today — including `getMessages`, `getRecentHistory`, `listConversations`, and the turn-idempotency gate `findMessageByIdempotencyKey` (all file-only reads).
- Prisma dual-write is opportunistic only: best-effort upserts after the file write, errors swallowed. The single Prisma read path is `getConversation()`'s fallback on a file miss (with cache-back). Prisma conversation/message rows are write-only shadows — not authoritative.
- `ConversationStore` has NO authoritative-mode branch (unlike `CompanyKnowledgeStore`): local-style semantics apply in every `DATABASE_MODE`, including production. Authoritative PostgreSQL remains the M6 target; nothing in the current docs may claim it is live for conversations.

**Known issues recorded (deliberately NOT changed this pass):**
1. **Bogus-conversationId provisioning (executor-level, pinned):** the store correctly throws `ConversationNotFoundError` for unknown ids (no phantom creation — row 10 / ADR 0002 §7 hold at store level), but `executeSophiaTurn` provisions a fresh founder-bound conversation instead of surfacing the 404. Ownership mismatch still fails closed (403) before the fallback can run, so this is not an authorization weakness; it is a semantic divergence from ADR 0002 §7's blanket 404 claim (agent-chat honors it), causes silent continuity loss on stale ids, and re-executes turns when a caller retries with the same bogus id + turnId (fork precedes the conversation-scoped idempotency lookup). Required by live-voice/SOFIA-surface UX; changing it is a broader behavioral decision (ADR amendment + surface contracts). Pinned by `tests/sophia/m3_authority_hardening.test.ts`.
2. **queryKnowledge authoritative-mode gap (next authority-audit item):** in authoritative mode, `getAllKnowledge()`/`getKnowledgeById()` read the fail-closed Prisma table, but `queryKnowledge()` still scores the in-process cache hydrated from DurableFileStore/code seeds — knowledge edited in another process is invisible to retrieval while visible to list/get. Callers are context-assembly hot paths (every Sophia turn), so the smallest safe correction is not fully isolated; fixing it needs a dedicated pass with its own authoritative-mode verification matrix. Latent in the current local-mode deployment.

**Where the precise layering is documented:** ADR 0002 implementation-precision addendum (four-layer distinction + the §7 divergence), `SOPHIA_MEMORY_ARCHITECTURE.md` §8 conversation-authority subsection, and per-method doc comments in `src/lib/server/conversation/store.ts`.


---

## K-2 Addendum (2026-09-23): Sophia Personal Mind memory — implemented

Milestone M3 K-2 (branch feat/sophia-personal-memory) implemented the first
Personal Mind memory boundary per the approved two-brains architecture:

- New canonical abstraction: `SophiaMemoryStore` + `SophiaMemory` Prisma
  model + DurableFileStore collection `sophia_memories` (ConversationStore
  storage pattern: file authoritative today, Prisma opportunistic dual-write,
  no authoritative-mode branch until M6).
- Founder-scoped fail-closed ownership on every operation; deterministic
  bounded retrieval; ChatMessage-convention idempotencyKey dedupe.
- `PERSONAL_MIND_MEMORY` context slice in SophiaContextAssembler, threaded
  from executeSophiaTurn and /api/agent-chat via the authenticated principal.
- Governed ingress /api/sofia/memory (session-bound only; body founderId
  ignored; 401 in production).
- No promotion path to CompanyMemory / CompanyKnowledge / CanonicalFact; no
  authorization capability; no MemoryGate / consolidation / forgetting /
  embeddings / vector search / PostgreSQL migration (all remain out of scope).
- Pinned by tests/sophia/k2_personal_memory.test.ts (20 tests incl. genuine
  restart-durability children and production 401 probes).
