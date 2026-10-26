# ADR 0011: Memory scopes, access, and evolution

**Status:** DRAFT — founder approval required; no approval is recorded by this ADR.
**Date:** 2026-10-26
**Decision owner:** Founder
**Scope:** G11.1 memory architecture decision; no runtime implementation.

## STATUS

Proposed for founder review. G11.1 is not approved or complete until the founder's decision is recorded in their own words by the kit workflow.

## DECISION

1. Keep one authoritative company intelligence and state system, with strictly separate **Personal Mind** and **Company Brain** scopes. This is a logical and authority boundary, not a mandate for a new storage product.
2. Keep the existing stores and Sophia's routed context assembly as the only memory read path. No second memory store, vector index, graph database, or external memory service is authorized by this decision.
3. Route first, then read only the authorized scope. Caller identity and memory scope are server-derived; client-supplied identity, scope, or memory content is not authoritative. Personal reads are bound to the authenticated founder ID. Company reads are company-scoped and returned as typed, authority-labelled projections.
4. Keep write authority deterministic. Personal memory writes use the governed founder memory route and existing lifecycle review/confirmation flow. Company knowledge promotion stays on the governed epistemic path; workers and models may propose, but may not directly authorize or mutate canonical state.
5. Preserve source provenance and scope in the answer record. Current evidence shows `executeSophiaTurn` persists `scopes`, `sources`, and `decisionLog` in assistant message metadata. This is answer-level provenance, not a separate immutable per-store read-access ledger. Do not claim the latter exists. Any requirement for a tamper-evident access-event ledger needs a separately scoped implementation and verification decision.
6. Retain domain-specific metadata already represented in the existing model: owner (`founderId`) for personal records, provenance, confidence, lifecycle/active state, owner-scoped idempotency, and explicit supersession/currentness for company facts. Confidence means different things in different domains and must not be treated as authorization or verification. Personal-memory confidence is contextual confidence; epistemic verification state belongs to Company Brain claims/facts.
7. Keep all memory retrieved into a prompt as untrusted data. Retrieval must not convert a memory into authorization, a verified company fact, or an instruction with higher authority.
8. Employees receive only the company-scope projection required for their task. They never receive Personal Mind. Role-specific projections remain derived views, not separate company-truth stores.
9. Add no new dependency, schema, migration, or runtime abstraction as part of G11.1. A future second store requires a separate ADR approved by the founder and must show a measured gap against current stores and preserve the access boundary.

### Scope-by-reader access matrix

This matrix is the proposed architectural contract. “Current evidence” points to inspected repository paths/tests; rows marked **contract** are intended access rules and must be proven at implementation steps before being claimed as implemented.

| Reader / caller | Personal Mind | Company Brain | Allowed route and constraints | Verification plan |
|---|---|---|---|---|
| Authenticated Founder via Sophia | Read own records; write through governed memory API; captured candidates remain pending until confirmation | Read through company route; company writes/promotions only through governed, typed workflows | Server-authenticated founder principal; no client-selected `founderId` or scope; report scope and sources | Existing `tests/sophia/k2_personal_memory.test.ts`, `tests/sophia/m1_3_scope_aware_context.test.ts`; add route tests for spoofed founder ID, cross-owner denial, and company/personal scope exclusion |
| Sophia turn executor | Read only when deterministic router selects personal recall or explicit allowed personal context | Read only when router selects company scope; use Company Brain/context projection | `executeSophiaTurn` → intent/router → `SophiaContextAssembler` → existing stores; persist result scope/source and decision log | Existing M1.3 scope suite and `tests/sophia/m4c_query_conditioned_retrieval.test.ts`; add assertions that route and stored metadata agree, including empty results and refusals |
| AI employees (Researcher, PM, Finance, future approved roles) | **Deny** | Read-only, task/role-scoped projection; no direct store access for unrelated domains | Typed company context/workflow assignment only; personal rows never enter employee context; no employee writes canonical facts directly | Extend employee-context tests with planted personal sentinel and role-specific company data; assert no Personal Mind source/slice is present |
| Workflow, scheduler, webhook, integration worker | **Deny** | Only the minimum typed company data required by the scheduled task; writes follow the existing policy/approval gate | Service identity and capability allowlist; external inputs remain untrusted; workflow output is a proposal until deterministic verification and approval | Add contract tests per trigger type for no Personal Mind read, company projection scope, idempotent execution, and approval on governed mutation |
| Browser/UI or public client | **Deny direct store access** | **Deny direct store access** | Authenticated API commands/read models only; UI cannot choose a memory authority or assert a principal | Route tests for unauthenticated access and forged client scope/principal; static check that UI imports no server store |
| Verification/audit reader | No content by default; founder-authorized content review only when needed | Read decision/source/provenance metadata; canonical content only under its existing authorization | Read-only, least-privilege audit projection; no access via a broad store singleton | Test metadata-only access, content-denial by default, and explicit grant/revocation behavior if such a reader is introduced |

### Test plan for changes under later memory steps

- Preserve M1.3 planted-secret tests in both directions: personal sentinel absent from company answers and company-only context; company-only data absent from personal-only context.
- Prove `founderId` comes from authenticated server context; requests supplying another ID cannot list, retrieve, update, or delete those records.
- Prove employees, schedulers, and integrations cannot read Personal Mind, even when a task prompt or external payload asks for it.
- Prove router output selects the permitted scope before context assembly; unknown/refusal paths fail closed or read neither scope.
- Prove every returned memory item retains provenance/source, and persisted answer metadata records the scope and source actually used; empty results return an honest abstention.
- Prove pending, rejected, archived, and superseded entries are not returned as current active memory; company verification status remains distinct from personal contextual confidence.
- Prove owner-scoped idempotency prevents cross-founder collision and retries do not duplicate writes.
- If retrieval indexes or derived copies are introduced later, test deletion and supersession propagation across every copy before shipping (Q-MEM-4).
- Treat durable/tamper-evident read-event logging as **not verified in the current code**; if required, propose and test it in a separate step rather than inferring it from conversation provenance.

## WHY

The repository already contains the needed boundaries and stores. The Sophia turn executor routes the message, selects a scope, and calls `SophiaContextAssembler`; the assembler reads personal memories through `SophiaMemoryStore` using the server-provided founder ID, and reads company operational state, knowledge, and precedent through separate company stores. Scope and source metadata plus a decision log are attached to the persisted assistant message. Existing M1.3, K-2, M4-C, and G4.1 tests exercise isolation and the Company Brain single path.

The data model is also already adequate for the step’s requested seams: `SophiaMemory` has `founderId`, `provenance`, contextual `confidence`, `lifecycleState`, and `idempotencyKey`; `EpistemicClaim` and `CanonicalFact` carry verification/currentness, provenance, confidence, and supersession relationships. G11.1 should lock the boundary and test contract, not duplicate these structures or prematurely choose a new persistence engine.

### Repository evidence inspected

- `PRODUCT.md` — Personal Mind and Company Brain remain partitioned; Sophia reads through the routed path; employees never read Personal Mind.
- `src/lib/server/sophia/turn-executor.ts` — deterministic route-to-scope mapping, calls context assembly, persists answer scopes/sources and decision log in assistant message metadata.
- `src/lib/server/sophia/context-assembly.ts` — `personal_only`, `company_only`, `none`, and `all`; Personal Mind read is bound to passed founder ID; Company Knowledge and Company Memory are separate company reads; personal slice is explicitly contextual and not company authority.
- `src/lib/server/sophia/personal-memory-store.ts` — `SophiaMemoryStore`, owner checks, lifecycle and idempotency; persistence uses existing durable/Prisma backing.
- `src/lib/server/knowledge/knowledge-store.ts`, `src/lib/server/memory/memory-store.ts`, `src/lib/server/brain/company-brain.ts` — existing company read stores and Brain façade.
- `prisma/schema.prisma` — existing `CompanyKnowledge`, `CompanyMemory`, `EpistemicClaim`, `CanonicalFact`, and owner-scoped `SophiaMemory` records; no second store is required for this ADR.
- `tests/sophia/m1_3_scope_aware_context.test.ts`, `tests/sophia/k2_personal_memory.test.ts`, `tests/sophia/m4c_query_conditioned_retrieval.test.ts`, `tests/platform/company_brain_single_path.test.ts` — existing evidence targets for future access tests.
- `AGENTS.md` §3–4, §11, §14; `.agent/product-kit/VISION.md` §5 and §7; `.agent/product-kit/QUALITY_BAR.md` Q-SEC-5/Q-SEC-7, Q-MEM-1–5, Q-SCALE-1, Q-DOC-4.

## ALTERNATIVES CONSIDERED

| Candidate | Relevant documented capability | Decision | Reason / bounded borrow |
|---|---|---|---|
| [Mem0](https://docs.mem0.ai/platform/quickstart) | User-filtered add/search APIs; optional graph memory adds entities/relations alongside vector storage. | **Do not adopt; borrow owner-filtered retrieval and explicit memory history/provenance ideas for tests.** | Useful memory extraction/retrieval commodity, but it introduces an external authority and optional graph/vector stores. It does not replace deterministic route authorization or the Company Brain epistemic pipeline. |
| [Graphiti (Zep)](https://help.getzep.com/graphiti/getting-started/welcome) | Temporal graph built incrementally from episodes; original episodes retain provenance; hybrid semantic/BM25/graph search; temporal facts can be invalidated. | **Do not adopt; borrow temporal validity, source episodes, and explicit invalidation/supersession concepts.** | These concepts map to existing company fact currentness and supersession seams. A new graph database and LLM extraction path are not justified without a measured retrieval gap. |
| [Letta](https://docs.letta.com/v1-sdk/concepts/stateful-agents) | Stateful agent runtime with persistent messages, in-context memory blocks, archival memory, and configurable read-only/shared blocks. | **Do not adopt as memory or runtime; borrow read-only projection and inspectable memory-block ideas for future role context.** | Letta's memory is integrated into its own agent state/runtime. Adopting it would create a competing execution/memory authority and expand scope beyond a store decision. |
| [Cognee](https://docs.cognee.ai/reference/colab_notebooks) | Ingestion/cognify/search pipeline linking chunks, extracted entities/relations, graph traversal, and vector retrieval. | **Do not adopt; borrow only as a future benchmark candidate for graph/vector retrieval if G11.3 demonstrates a gap.** | It is a graph-plus-vector memory engine with its own ingest/query and storage model. Introducing it now conflicts with “no second store” and is not shown necessary by current deterministic retrieval tests. |

These are design-input comparisons, not product endorsement or claims of comparative benchmark performance. Vendor documentation describes capabilities; this ADR does not independently validate their runtime behavior or performance.

## BOUNDARIES

- This ADR decides architectural boundaries and a future verification plan only. It does not implement new access checks, fields, adapters, readers, migrations, indexes, LLM memory extraction, vector search, graph storage, or employee memory.
- There is one Sophia, one authoritative company state, and one Company Brain. Role context is a scoped projection.
- Personal Mind data is private founder interaction context, never company truth, authorization, approval evidence, or employee context.
- Company Brain truth is governed by deterministic validation and the existing epistemic pipeline. A retrieved item’s confidence score does not grant authority.
- Existing stores are reused. A second store requires a new ADR, evidence of a measured gap, and explicit founder approval.
- This decision does not authorize multi-founder product features; owner-scoped seams remain for future compatibility under Q-SCALE-1.

## RISKS

- The current assistant metadata/decision log provides answer-level scope and provenance, but a dedicated append-only access-read ledger was not found. **NOT VERIFIED / not implemented as a distinct ledger.** If the founder interprets “audited read path” as requiring per-read ledger events, that needs an explicit follow-up implementation.
- Current employee-context non-access is an architectural contract; the listed tests must be extended/verified at the employee boundary before claiming it across every worker.
- External comparator documentation may change, and vendor-described features are not performance/security verification. Re-check the official docs before any future adoption decision.
- Existing file/Prisma persistence behavior and production durability are outside G11.1; no new persistence guarantees are claimed.

## MIGRATION / REVERSIBILITY

No migration or runtime change. This ADR documents reuse of the current records and routed read projection. If founder-approved future benchmark evidence justifies another engine, that proposal must define a reversible adapter, canonical record ownership, source/provenance export, deletion/supersession propagation, outage behavior, and parity tests before implementation. Company truth must remain canonical in the existing authoritative system.

## NEXT ACTION

Founder: review and explicitly approve, reject, or amend this draft. Until the founder’s own words are recorded, status remains **DRAFT — approval pending**, G11.1 is not done, and no memory implementation step may treat this proposal as approved architecture.
