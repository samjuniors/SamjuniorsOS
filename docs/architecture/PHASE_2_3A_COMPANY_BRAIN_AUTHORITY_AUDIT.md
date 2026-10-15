# Phase 2.3A — Company Brain Authority & Persistence Audit

**Status:** Initial static repository audit — Founder review pending  
**Audit date:** 2026-10-15  
**Repository:** samjuniors/SamJuniorsOS  
**Branch baseline:** main at 99441fd27ac927554028a41779a19aa86f4c67ce  
**Tracking issue:** [#13 — Company Brain authority & persistence audit](https://github.com/samjuniors/SamJuniorsOS/issues/13)

> This report records source-level observations only. It does not establish the deployed hosting provider, live environment variables, database provisioning, runtime persistence, or production health. Those require deployment/account evidence and controlled runtime checks. No tests or builds were executed as part of this static audit.

---

## 1. Executive verdict

**Do not implement Role Brains or add another knowledge subsystem yet.**

The repository already contains most of the required conceptual building blocks: operational state, decisions, epistemic sources/claims/facts, company knowledge, historical memory, agent runs, approvals, and bounded context assemblers. The immediate gap is not the absence of a Company Brain class. It is the lack of a fully reconciled, evidence-backed authority map across these existing domains.

The current architecture is a set of distinct domain stores plus read projections. Some domains have different local and authoritative persistence paths; some remain file-backed; some state fields still come from seeded in-memory collections. The current documentation describes a more complete and more PostgreSQL-oriented state than the source inspected here establishes.

**Recommended direction:** define Company Brain as a governed architecture over distinct canonical domain owners and explicit projections—not as one giant table, one new store, or a replacement memory framework.

### Evidence confidence

| Statement | Status |
|---|---|
| main currently contains only the main branch | Verified through GitHub branch listing on 2026-10-15 |
| There are no open PRs or open issues before this audit issue | Verified through GitHub search |
| Current Prisma datasource is SQLite | Verified in prisma/schema.prisma |
| .env.example documents a local SQLite file URL | Verified in .env.example |
| DurableFileStore writes to .data, falling back to OS temp | Verified in source |
| A live PostgreSQL instance is configured | **Not established** |
| The deployed host guarantees persistent local disk | **Not established** |
| Production is running with DATABASE_MODE=authoritative | **Not established** |
| Latest main passed tests/build | **Not established**; no workflow runs were returned for the inspected HEAD, and no local execution was performed |

---

## 2. Deployment and persistence reality

### 2.1 What the repository proves

- prisma/schema.prisma declares provider = sqlite.
- .env.example documents DATABASE_URL=file:./db/custom.db.
- src/lib/server/db/prisma.ts describes a SQLite-backed application client.
- src/lib/server/db/authority.ts defaults to authoritative when NODE_ENV === production, unless DATABASE_MODE explicitly overrides it.
- requireAuthoritativeDatabase() checks whether the configured Prisma database is reachable. It does not independently prove that the provider is PostgreSQL.
- Several classes named Postgres*Store explicitly document that the current schema is a SQLite port and that PostgreSQL is a target architecture.
- DurableFileStore resolves its data directory to process.cwd()/.data; if that directory cannot be created, it falls back to an OS temp directory.

### 2.2 What remains unknown

The repository does not prove which hosting platform currently serves the app, which environment variables are actually configured, whether the SQLite file is on persistent storage, whether .data survives instance replacement, or whether only one instance is running.

There is no deployment manifest in the inspected repository root that settles these questions. Absence of a manifest does not prove absence of an external dashboard configuration.

### 2.3 Consequence

The phrase “authoritative database mode” currently means “use the configured Prisma client and fail closed if it is unavailable.” It does **not** mean “PostgreSQL is provisioned and durable in the deployed environment.”

Before selecting or migrating persistence, obtain deployment evidence. Do not assume Cloud Run, Vercel, PostgreSQL, a persistent volume, or a single-instance guarantee.

---

## 3. Domain ownership and persistence matrix

This is the initial source-level map. “Authoritative mode” below refers to the code path selected by DATABASE_MODE, not proof that the deployed environment has been configured correctly.

| Domain | Current owner / implementation | Local or test mode | Authoritative mode | Initial assessment |
|---|---|---|---|---|
| Operational state | CompanyStateStore | In-memory seed/cache plus .data/company_state.json for selected writes | Selected fields read/write Prisma CompanyState; several getters remain in-memory | Partial authority; field-level behavior differs |
| Decisions | DecisionStore + DecisionContextProvider | DurableFileStore collection decisions; seed/migration logic | Same file-backed store; no Prisma mode switch in DecisionStore | File-backed across modes; deployment durability must be established |
| Sources/signals/claims/verifications/facts | EpistemicClaimStore / PostgresEpistemicStore | .data collections and in-memory Maps | Prisma models, fail-closed through requireAuthoritativeDatabase | Clear dual-mode pattern; actual DB provider remains SQLite in schema |
| Company knowledge | CompanyKnowledgeStore | Seeded cache plus durable file collection; best-effort Prisma mirror | Prisma CompanyKnowledge reads/writes, with create-only seed bootstrap | More complete than the September reconciliation report claims; still distinct from canonical facts |
| Historical company memory | CompanyMemoryStore | Seeded cache plus .data/company_memories; Prisma best-effort mirror | Prisma CompanyMemory | Separate precedent domain; seed and mutation semantics need review |
| Agent runs | AgentRunStore | .data/agent_runs plus Map cache | Prisma AgentRun | Dual-mode; local whole-collection loading has scaling implications |
| Workflow definitions/instances | getWorkflowStore() | InMemoryWorkflowStore with strict durable file writes and cache | PostgresWorkflowStore via Prisma | Dual-mode; PostgreSQL naming is not evidence of PostgreSQL provider |
| Approvals and side-effect audit | InMemoryApprovalStore, InMemoryAuditStore and Prisma variants | Durable file collections with in-memory caches | Prisma ApprovalRecord / SideEffectAudit | Dual-mode; consumers must use the mode-aware store, not assume class names imply memory-only |
| Sophia personal memory | SophiaMemoryStore | Separate founder-scoped personal-memory path | Requires separate source inspection in the detailed personal-memory pass | Must remain isolated from Company Brain truth |
| Research/engineering context | CompanyContextProvider module-level arrays | Process memory | Process memory in inspected code | Ephemeral projection/capture path; not durable company truth |

### 3.1 Operational state is not one uniform store

In src/lib/server/state/state-store.ts:

- Initial arrays are populated from INITIAL_FEATURES, INITIAL_INITIATIVES, SAMPLE_PIPELINE_DEALS, INITIAL_AGENTS, INITIAL_COMPANY_DECISIONS, INITIAL_ATTENTION_ITEMS, and SAMPLE_FINANCIAL_MODEL.
- loadFromDurableStorage() hydrates selected fields from company_state.
- getInitiatives() reads Prisma in authoritative mode and returns an empty list if no row exists.
- getFinancialMetrics() reads Prisma in authoritative mode when a row exists, but falls back to the in-memory financial model if no row/model is found.
- getProducts(), getCustomers(), getEmployees(), and getAttentionItems() return in-memory arrays.
- getDecisions() delegates to the separate DecisionStore.
- queryState() iterates the in-memory initiative/product/customer/financial fields. It labels some synthetic content honestly, but it is not a uniform Prisma-backed query path.

This means a single method name such as CompanyStateStore hides different authority and persistence semantics by field. The follow-up audit must verify every caller and UI projection before changing this.

### 3.2 Decisions are a distinct governance domain

src/lib/server/decision/store.ts writes and reads the decisions collection through DurableFileStore, uses a strict collection lock, and seeds three canonical decision records if absent. It does not delegate to a Prisma decision store in authoritative mode.

This is not automatically wrong: decisions are a distinct governed commitment ledger and should not be collapsed into generic facts. But the file-backed durability assumption must match the actual deployment target. Its seed records and migration from legacy company_state.decisions must also be explicitly treated as migration/bootstrap data, not fresh empirical evidence.

### 3.3 Epistemic facts and memory are related, not interchangeable

EpistemicPipeline implements source → signal → claim → verification/review → canonical fact → company memory. The API route src/app/api/epistemic/route.ts exposes the founder-facing lifecycle and derives the authenticated founder principal for promotion operations.

Keep the semantic distinction:

- Raw source: captured evidence, not truth by itself.
- Signal: extracted observation.
- Claim: candidate statement requiring policy/review.
- Canonical fact: governed, promoted statement with provenance and lifecycle.
- Company memory: historical precedent/outcome, not new evidence.
- Decision: a ratified or pending commitment; not the same entity as a factual claim.
- Company knowledge: versioned reference material such as SOPs/policies; not automatically empirical fact.

A “single Company Brain” should unify governance and retrieval semantics without flattening these distinct domain types.

---

## 4. Read-path observations

### 4.1 Sophia's context is assembled from multiple domain stores

src/lib/server/sophia/context-assembly.ts directly reads from:

- CompanyStateStore
- AgentRunStore
- InMemoryApprovalStore (mode-aware implementation)
- EpistemicClaimStore
- CompanyKnowledgeStore
- CompanyMemoryStore
- SophiaMemoryStore
- ConversationStore
- ActivityProjection
- dependency-relation and temporal-retrieval helpers

This is a useful existing composition layer, not proof that all domains share one persistence authority. The audit should trace each slice to the source method, its selected mode, fallback behavior, provenance label and failure handling.

### 4.2 CompanyContextProvider remains a separate projection path

src/lib/server/context/company-context.ts describes operational state as owned by CompanyStateStore, historical precedent by CompanyMemoryStore, and runs by AgentRunStore. Its getCanonicalContext() reads those stores.

However, serverRecentIntelligence and serverEngineeringIntelligence remain module-level in-memory variables initialized from INITIAL_RESEARCH. They are not durable canonical evidence records. They should be either explicitly treated as ephemeral UI/research projections or routed through the existing epistemic ingestion path where appropriate.

The existence of both CompanyContextProvider and SophiaContextAssembler is not by itself a defect: one is a broader company/advisor projection and the other is a bounded per-turn Sophia context. Their ownership, consumers and source guarantees must be documented so they do not drift into competing truth paths.

### 4.3 Approval context must use the mode-aware abstraction

Sophia's assembler imports InMemoryApprovalStore, whose methods delegate to Prisma in authoritative mode and durable files in local mode. The class name is misleading if read without its factory/mode behavior. Preserve the mode-aware abstraction and avoid bypassing it with direct in-memory Maps.

---

## 5. Seed, synthetic and provenance risks

The code contains multiple seed families. Seeds can be useful bootstrap/migration fixtures, but must not silently become current empirical company truth.

Verified examples:

- CompanyStateStore starts from os-data.ts sample arrays and a sample financial model.
- CompanyMemoryStore starts with INITIAL_COMPANY_MEMORIES and uses that cache unless durable or authoritative records replace it.
- CompanyKnowledgeStore has canonical seed documents and a one-time local durable seed path; authoritative mode bootstraps missing documents into Prisma without overwriting existing rows.
- DecisionStore seeds three canonical decisions into its durable collection.
- EpistemicClaimStore loads local collections into Maps; authoritative mode delegates to Prisma.
- Some queryState() results explicitly label synthetic financial and customer content. These labels must survive all formatting and UI projections.

**Required invariant:** seed/demo data may be displayed as seed/reference/simulation data, but cannot be represented as live company evidence, verified facts, actual customer relationships, or executed outcomes without a provenance-backed transition.

The audit does not recommend deleting seed records now. First identify their consumers, migration status, tests and rollback requirements.

---

### 5.1 Company-memory seed behavior needs an explicit contract

Current source behavior differs by mode:

- Local mode starts with INITIAL_COMPANY_MEMORIES in the in-process array. If a non-empty company_memories file exists, loadFromDurableStorage() replaces that entire seed array with the file contents. The initial seed list is not explicitly migrated as a complete collection on first boot.
- Authoritative mode getAllMemories() reads only CompanyMemory rows from Prisma; it does not bootstrap INITIAL_COMPANY_MEMORIES into the database.
- setMemories() only replaces the in-process array and does not persist to file or Prisma.
- queryMemories() currently labels every returned item with authority “Founder-Approved Organizational Precedent”; the Epistemic Board separately classifies memories without resolvable fact lineage as seed_or_unattributed.

This may be deliberate seed/demo behavior, but the lifecycle and authority labels need one explicit contract. Add tests for first boot, after first durable write, restart, authoritative empty DB, and provenance labels. Do not automatically promote these seeds or treat the Board label as proof that the underlying record was never founder-approved; the two projections currently express different evidence levels.

## 6. Documentation drift

The current docs are not safe to use as a single current-state source without reconciliation.

| Document | Drift observed |
|---|---|
| doc/ROADMAP.md | Says PR #12 is pending review and asks to submit Issue #11, despite PR #12 being merged and only main remaining |
| PROGRESS.md | Still titles the active work as Phase 2.2.2 and gives pre-merge baseline/next-action instructions |
| PRODUCT.md | Describes PostgreSQL dual-layer persistence and broad “implemented + wired” claims that must be checked against SQLite schema and per-domain code paths |
| doc/PRODUCT_ARCHITECTURE.md | Snapshot references old commits and contains repo-state findings that conflict with later code; its own top-level status is not current |
| docs/architecture/MEMORY_RECONCILIATION_REPORT.md | Dated 2026-09-21; some claims (for example CompanyKnowledgeStore persistence and CompanyContextProvider data ownership) are stale relative to current source |

The audit branch is updating the roadmap/progress status to the verified 2026-10-15 state and adding dated caveats to product/architecture snapshots rather than silently rewriting historical findings as if they were current. A specific correction: the September reconciliation report's queryKnowledge authoritative-mode gap was subsequently closed by M5.2; current CompanyKnowledgeStore.queryKnowledge() obtains candidates through getAllKnowledge(), so authoritative retrieval reads from Prisma and fails closed on database failure.

---

## 6.1 Corrections against historical memory audit

The 2026-09-21 MEMORY_RECONCILIATION_REPORT is a dated snapshot, not a current source of truth. Two notable corrections from current source:

- CompanyKnowledgeStore is no longer memory-only. Local mode persists to DurableFileStore with a best-effort Prisma mirror; authoritative mode uses Prisma. M5.2 also corrected queryKnowledge() to obtain candidates via getAllKnowledge(), so authoritative retrieval reads the database rather than a stale process cache.
- CompanyContextProvider.getCanonicalContext() now reads operational initiatives/decisions, company memories and agent runs from their respective store abstractions. Its research-intelligence arrays remain process-local. The old report's description of CompanyContextProvider reading operational constants is no longer current.

These corrections do not resolve the separate authority gaps described below.

## 6.2 Existing test and CI coverage (source inventory only)

No tests were executed during this audit. The following describes test intent and code paths from inspected test files, not fresh pass results.

| Domain | Existing test evidence | Coverage boundary / gap |
|---|---|---|
| CompanyStateStore | tests/sophia/m1_canonical_state_authority.test.ts checks seed baseline, local state updates reaching Sophia context and CompanyContextProvider | Exercises local/test behavior; does not establish authoritative-mode parity or employee-context queryState correctness |
| CompanyMemoryStore | tests/sophia/m1_batch1_memory_authority.test.ts checks DATABASE_MODE parsing, getAllMemories routing, strict local file failure behavior and deduplication | The inspected suite does not create a throwaway authoritative database to exercise CompanyMemoryStore's Prisma branch |
| CompanyKnowledgeStore | tests/sophia/m2_knowledge_persistence.test.ts checks local restart durability, seed preservation, poisoned-content labels and authoritative mode using a throwaway SQLite DB | Good dual-mode coverage for this domain; it is not a PostgreSQL-server test |
| EpistemicClaimStore | tests/sophia/m53_authoritative_read_model.test.ts exercises authoritative Prisma branches against a throwaway SQLite DB, including read modes, supersession, dependency relations and fail-closed database failure; tests/api/epistemic.auth.test.ts checks route auth and lifecycle contracts | No actual PostgreSQL server is exercised |
| DecisionStore | tests/decision/decision_lifecycle.test.ts checks lifecycle, locking, idempotency, approval binding and local file restart recovery | No Prisma Decision model exists in the current schema; the store is file-backed and has no authoritative database implementation |
| Workflow / approval / audit / AgentRun | Several local recovery, workflow and route-auth suites exist; source has mode-aware Prisma branches for multiple stores | The inspected test inventory did not establish a complete authoritative-mode, restart and cross-process matrix for these domains |
| CI | .github/workflows contains one workflow, sophia-response-path-regression.yml | Its path filters cover Sophia response/voice files and selected tests, not the CompanyStateStore, DecisionStore, knowledge, memory, epistemic, workflow or approval persistence paths. Changes to these areas do not currently trigger this workflow by their own paths |

The latest inspected main commit (99441fd27ac927554028a41779a19aa86f4c67ce) returned no GitHub Actions workflow runs. This is not a test failure; it means no run evidence was available for that commit. The only inspected workflow is path-filtered, and the latest commit changed repository hygiene rather than one of its watched paths.

## 7. Prioritized findings

Severity here describes architectural risk based on source inspection, not a confirmed production incident.

### P0 — Deployment/persistence contract is not established

**Evidence:** SQLite schema and local file URL; .data path is container filesystem; no repository evidence proves deployed storage durability or provider configuration.

**Failure mode:** a process/container replacement can lose file-backed decisions, approvals, runs, memory or other local-mode state if the actual runtime does not preserve those paths.

**Action:** establish deployed host, environment mode, actual DATABASE_URL provider, persistent-volume semantics, instance count and backup/restore process before changing persistence.

### P1 — DecisionStore is not in the Prisma authority path

**Schema evidence:** the current Prisma schema has no Decision/DecisionRecord model at all. The decision lifecycle therefore cannot currently be moved into authoritative Prisma mode by toggling DATABASE_MODE; doing so requires an explicit schema and migration decision, not just switching an existing store implementation.


**Evidence:** DecisionStore reads/writes the durable file collection directly; DecisionContextProvider and CompanyStateStore decision reads depend on it.

**Failure mode:** decision commitments may not share the same persistence guarantees as other Prisma-backed domains. In a runtime with ephemeral local disk, the decision ledger may not survive replacement.

**Action:** after deployment decision, select one authoritative persistence path for decisions. Preserve the existing lifecycle, payload-binding, idempotency, migration and audit semantics. Do not duplicate-write indefinitely to two “authorities.”

### P1 — Specialist context retrieval bypasses authoritative CompanyStateStore getters

**Evidence:** both ContextualRetrievalService.retrieveContextForTask() and ContextAssemblyService.assembleContextForTask() call CompanyStateStore.queryState(). The current queryState() implementation iterates this.initiatives, this.products, this.customers and this.financialModel directly. In contrast, getInitiatives() and getFinancialMetrics() have separate authoritative-mode Prisma reads. queryState() does not call those getters or load a database snapshot.

**Failure mode:** in authoritative mode, Sophia's dedicated context assembler can read selected Prisma-backed values through getInitiatives()/getFinancialMetrics(), while specialist task context can read the process-local/file-hydrated arrays instead. Updates written to the authoritative CompanyState row can therefore be missing from employee task context. Initial initiatives may also be presented with epistemicType current_truth despite originating from code-seeded in-memory state; product/customer/finance samples are marked synthetic in some result branches, but provenance must remain explicit through all formatting paths.

**Action:** make queryState() derive its candidate pool from the same mode-aware canonical reads used by getters, and preserve field-level provenance. Add authoritative-mode tests proving DB updates are visible in employee context, missing records do not silently reappear from stale seeds, and synthetic fixtures never acquire current-truth labels. Do not implement until the audit confirms expected seed/bootstrap semantics.

### P1 — CompanyStateStore has field-level authority differences and a sample fallback

**Evidence:** some fields are Prisma-backed in authoritative mode, others remain in-memory; missing authoritative financial state can fall back to the seeded financial model; queryState() reads in-memory arrays.

**Failure mode:** a caller may receive plausible sample state where it expected absent/unavailable authoritative state. A projection may appear current despite being backed by bootstrap values.

**Action:** classify each field as canonical persisted state, derived projection, seed/reference fixture, or unavailable. In authoritative mode, missing live values should be explicit, not silently replaced with a simulated value unless the response remains clearly marked synthetic.

### P1 — Partial financial updates can overwrite authoritative values with stale in-memory defaults

**Evidence:** the authoritative branch of CompanyStateStore.updateFinancialMetrics() builds nextModel from this.financialModel plus the patch, then upserts that whole object. It does not first read the existing CompanyState.financialModel row. The constructor initializes this.financialModel from SAMPLE_FINANCIAL_MODEL and its hydration method reads DurableFileStore, not Prisma.

**Failure mode:** after a process starts with an empty/stale local file cache, a partial update (for example, only MRR) can write the seeded/default values for the other financial fields over values already stored in the authoritative database.

**Action:** in authoritative mode, read the current row inside a transaction and merge the patch against the persisted JSON value, with a deliberate create/default policy when no row exists. Add a regression test with non-default persisted fields followed by a partial update and assert all untouched fields survive. This is a source-level risk requiring a targeted fix, not a confirmed production data-loss incident.

### P1 — Seed research is injected into the Founder Advisor as empirical intelligence

**Evidence:** CompanyContextProvider initializes serverRecentIntelligence from INITIAL_RESEARCH in src/lib/os-data.ts. The three static records carry confidence scores of 96, 94 and 91, named research authors and summaries, but no source URI, captured evidence, verification record or provenance object. CompanyContextProvider.getCanonicalContext() includes these records in recentIntelligence, and formatForAdvisorPrompt() renders them under “MARKET & TECHNICAL RESEARCH RADAR” with their confidence percentages. recordIntelligence() adds new items to the same process-local list; it does not persist or distinguish seed records.

**Failure mode:** the Founder Advisor can consume static demonstration assertions as if they were researched, high-confidence market or regulatory findings. A restart discards newly recorded intelligence and reinitializes the three seeds. Confidence percentages can create false certainty without an evidence basis.

**Action:** classify these entries as demo/seed content and exclude them from evidence-bearing advisor context unless explicitly labeled as illustrative. Real research should enter through the existing evidence/epistemic path with source URI, capture time, provenance and verification state. Keep the research UI useful by showing honest empty/unverified states; do not fabricate sources to make the radar look populated.

### P1 — Company Brain is currently a composition, not one enforced read/write boundary

**Evidence:** several context assemblers query multiple stores directly; the epistemic pipeline is present and API-backed, but not every company domain is an epistemic fact and not every consumer necessarily routes through one shared policy.

**Failure mode:** new features may read a different store or bypass provenance/freshness rules, creating competing interpretations of company truth.

**Action:** define a thin, existing-abstraction-based Company Brain read contract/projection. Do not create a second storage engine. Keep decisions, operational state, facts, reference knowledge and historical memory as separate domains with explicit precedence and provenance.

### P1 — Product/architecture documents overstate or misdate implementation state

**Evidence:** roadmap asks for already-merged PR work; product docs state PostgreSQL and end-to-end authority that source does not prove.

**Failure mode:** future engineering decisions are based on stale or incorrect assumptions.

**Action:** reconcile dated status statements and add source links/paths for each claim. Preserve historical context.

### P2 — Ephemeral research intelligence is mixed into company context

**Evidence:** CompanyContextProvider holds recent and engineering intelligence in module-level variables.

**Failure mode:** restart loss and unclear distinction between transient research notes and durable, source-backed claims.

**Action:** classify as ephemeral projection or capture through EpistemicPipeline.ingestSource; do not persist every transient UI event as a canonical fact.

### P2 — Whole-collection file stores and local Map hydration have scaling limits

**Evidence:** DurableFileStore uses JSON collection files; stores hydrate collections into Maps. The implementation contains cross-process locking and atomic writes, but collection-level rewrites and full hydration grow with record count.

**Failure mode:** increasing write amplification, startup latency, lock contention and local filesystem coordination complexity.

**Action:** measure actual volume and latency before optimizing. This is not a reason by itself to introduce microservices or a new database.

---

## 8. Recommended target architecture

### 8.1 Keep distinct domain authorities

1. **Operational State:** current initiatives, products, customer/finance data and operational status. Each field needs a defined owner and explicit source/provenance.
2. **Decision Ledger:** proposals, approvals, commitments, transitions, supersession and execution linkage.
3. **Epistemic Ledger:** source, signal, claim, verification, canonical fact and fact lineage.
4. **Company Knowledge:** versioned reference documents, SOPs, policies and technical/product specifications.
5. **Historical Memory:** outcomes and precedents, explicitly historical and never new evidence.
6. **Execution/Audit:** agent runs, workflow instances, approvals, side-effect audit and idempotency records.
7. **Derived Context:** Sophia context, employee task context, advisor summaries, activity projections and UI graph data. These are projections, not authorities.

### 8.2 Company Brain as a governed operating layer

The Company Brain should provide:

- a catalog of canonical domain owners and their read/write contracts;
- provenance and epistemic classification on returned items;
- deterministic precedence between current facts, commitments, reference knowledge, history, seed data and inference;
- query-conditioned bounded context projections;
- freshness, degraded/unavailable and stale-state signaling;
- authenticated write paths and Founder-controlled promotion/approval;
- audit and reconciliation of consequential changes.

It should not become another database wrapper that duplicates existing stores.

### 8.3 Role Brains remain downstream

Role-specific context is derived from Company Brain data plus role-specific working memory and skills. It must never become an alternative source of company truth. Do not implement it until the shared domain authority and provenance contracts are stable.

---

## 9. Migration sequence (proposed, not yet approved)

1. **Deployment fact-finding:** confirm hosting, actual env mode, database provider, persistent storage, instance count and backups.
2. **Domain contract freeze:** publish the domain/store matrix and decide canonical owners, including decisions and each operational-state field.
3. **Persistence authority alignment:** migrate only domains that violate the selected deployment durability contract. Preserve IDs, versions, lifecycle transitions, idempotency and lineage. Use checksums/counts and a reversible cutover plan.
4. **Read-path alignment:** update context projections to consume canonical domain interfaces and preserve provenance/status. Avoid a broad rewrite.
5. **Seed-data hardening:** separate one-time bootstrap fixtures from runtime defaults; make missing authoritative data explicit.
6. **Regression gates:** add mode-parity, restart, container-replacement (where applicable), corruption, concurrency, authorization, provenance and no-silent-fallback tests.
7. **Role-specific context:** only after the above acceptance gates pass.

Every persistence cutover requires a backup, deterministic migration, reconciliation report, rollback path and Founder review. No migration should be run against production from this audit.

---

## 10. Required follow-up inspection

The static pass is not complete enough to authorize implementation. The next audit pass must inspect:

- all callers of CompanyStateStore getters/setters and every direct os-data import in server execution paths;
- all DecisionStore read/write callers, legacy decision migration and decision-to-fact linkage;
- all CompanyMemoryStore write paths, seed visibility, setMemories() callers and fact-to-memory lineage;
- CompanyKnowledgeStore write/update/version semantics and callers;
- all epistemic ingestion/claim/promotion call sites outside /api/epistemic;
- all context consumers (Sophia, council, advisor, API/UI) and their authority labels;
- test coverage for each domain in local and authoritative modes, including missing-row and restart behavior;
- deployment/account evidence supplied by the Founder.

---

## 11. Decision gate

**Recommended decision:** approve completion of the audit and documentation reconciliation first. Do not yet approve a database migration, schema rewrite, new CompanyBrainStore, Role Brain implementation, or production deployment change.

Founder choices needed after evidence is assembled:

1. What is the actual intended deployment target for the internal OS?
2. Does that target provide durable shared storage and what is the current configured provider?
3. Should Company Brain be defined as a thin governed facade over the existing domain stores (recommended), with domain-by-domain migrations only where evidence requires them?

**No runtime code, schema, credentials, provider configuration or production data has been changed by this audit.**
