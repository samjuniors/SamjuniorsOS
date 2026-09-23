# Sophia Memory & Brain Architecture

Status: DESIGN DECISION / RECONCILIATION REQUIRED
Date: 2026-09-21

## 1. Two brains — intentional separation

### Sophia Personal Mind
Owns:
- personality and conversation
- immediate/working context
- voice, vision, hearing and interaction
- personal preferences and interaction memories
- sensory interpretation
- deciding when a request requires company knowledge or execution

It may access the Company Brain, but it is NOT the source of company truth.

### SamJuniors Company Brain
Owns authoritative:
- company state
- strategy and objectives
- finances and operational metrics
- company knowledge
- employees/workforce
- work/workflows
- decisions
- governance/approvals
- audit/provenance
- canonical facts

Sophia can ask the Company Brain for information and communicate the result to the Founder.

Example:
"What's the financial status of SamJuniors?" -> Sophia routes to Company Brain -> authoritative data -> Sophia explains the result.

## 2. Memory is not one database

Memory is a cognitive system over multiple storage/index layers.

Core classes:
- Working memory: current task/conversation/context
- Episodic memory: meaningful experiences/events
- Semantic memory: durable concepts and learned knowledge
- Associative memory: relationships/patterns between entities and experiences
- Procedural memory: learned/versioned ways of doing things
- Raw/audit history: retained evidence where operational, security, recovery or audit requirements demand it

Embeddings are retrieval indexes, NOT canonical truth.

## 3. Selective retention

Sophia must not permanently retain every interaction.

Pipeline:

Experience -> capture -> memory gate -> retain/discard -> consolidate -> index -> retrieve

The memory gate considers relevance, recurrence, importance, future usefulness, novelty, confidence, dependencies, redundancy and staleness.

Low-value transient interaction may disappear from active memory.
Useful information can become a durable memory.
Repeated observations can be consolidated into a higher-level pattern.

## 4. Compression and consolidation

When many observations express the same useful pattern, consolidate them into compact memory while preserving provenance/evidence references.

Active cognitive memory should remain small even when historical storage reaches hundreds of millions of records.

Compression must be loss-aware:
- preserve source/provenance
- preserve important evidence references
- preserve historical versions where needed
- never turn a compressed belief into authoritative company truth merely because it is remembered

## 5. Forgetting and lifecycle

Memory has lifecycle states such as:
HOT -> WARM -> COLD -> ARCHIVE -> EXPIRE

Forgetting from active cognition does not necessarily mean deleting legally/operationally required history.

Lifecycle must support TTL/decay, relevance, access frequency, redundancy and retention policy.

## 6. Cache

Cache is a performance layer, never a source of truth.

Use it for:
- working context
- frequent retrieval results
- stable/high-value derived context
- expensive computations
- safe model computations where freshness permits

Cached objects should carry source/version/freshness information where relevant.

Cache miss must fall back to authoritative storage or recomputation — never guessing.

## 7. Scale

Do NOT design around one giant vector database.

Initial direction:
- relational authoritative storage
- object/event storage where appropriate
- lexical/structured indexes
- vector retrieval index
- cache
- partitioning/lifecycle management

Start with the simplest reliable architecture already present in SamJuniorsOS. Introduce dedicated distributed vector/search infrastructure only when measured scale requires it.

## 8. Existing repository reconciliation

Before adding new memory tables/services, inspect and reconcile existing:
- CompanyMemory
- CompanyKnowledge
- CompanyState
- Conversation / ChatMessage
- EpistemicSource
- EpistemicSignal
- EpistemicClaim
- EpistemicVerification
- CanonicalFact
- AgentRun
- telemetry/audit records

Do not create parallel memory, knowledge, fact or epistemic systems when an existing abstraction can be extended.

Current feat/sofia-merge schema uses SQLite as a sandbox port. Do not silently claim PostgreSQL is currently implemented; separate current implementation from target architecture.

### Conversation authority — four layers, precisely (M3 K-1 hardening, 2026-09-22)

For the conversation system specifically, keep these four layers distinct in any claim:

1. **Canonical abstraction (current):** `ConversationStore` is the single canonical conversation authority; since M3 K-1 (3da24b4) every ingress (OS chat, SOFIA typed surface, live voice) delegates to `executeSophiaTurn` over it. Browser history is untrusted and never authoritative.
2. **Local DurableFileStore persistence (current, authoritative today):** `.data/conversations.json` + `.data/chat_messages.json` are the primary write target and the authoritative read source — including message reads, conversation listing, and the turn-idempotency gate.
3. **Prisma dual-write (current, opportunistic mirror only):** best-effort upserts after the file write, errors swallowed; the only Prisma read is `getConversation()`'s single-record fallback with cache-back. Prisma conversation/message rows must not be called authoritative.
4. **Authoritative PostgreSQL (target, not current):** the M6/multi-instance milestone. `ConversationStore` has no authoritative-mode branch today (unlike `CompanyKnowledgeStore`), so even production runs local-style semantics. See ADR 0002's implementation-precision addendum for the full per-method matrix and the documented divergence between the store's 404 contract and the turn executor's fresh-conversation provisioning for unknown ids.

## 9. Non-negotiable invariants

1. Personal Mind != Company Brain.
2. Memory != authoritative company state.
3. Embedding != source of truth.
4. Cache != source of truth.
5. Consolidation must preserve provenance.
6. Company-critical facts require governed authoritative state/epistemic promotion.
7. Frontend memory must never become execution authority.
8. Loss of cache must not damage company state.
9. Scaling must be evidence-driven.
10. Prefer extending existing SamJuniorsOS abstractions over parallel systems.

## 10. Next implementation phase

First perform a repository reconciliation/audit.

Produce:
- existing-memory inventory
- duplication/conflict map
- proposed canonical ownership for every existing model
- migration plan
- storage/index/cache boundaries
- retention/consolidation lifecycle
- scale plan
- tests required

Do not implement a large rewrite until reconciliation is complete.

## 11. K-2 Personal Mind implementation status (2026-09-23 addendum)

K-2 delivered the first server-side Personal Mind memory boundary. Keep the
following claims precise:

CURRENT (implemented on feat/sophia-personal-memory):
- `SophiaMemoryStore` (src/lib/server/sophia/personal-memory-store.ts) is the
  canonical Personal Mind abstraction: founder-scoped create / get / list /
  update / delete with fail-closed ownership (403 on cross-founder access of
  an existing record), deterministic bounded retrieval (updatedAt DESC, id ASC
  tie-break, hard cap 50), an allow-listed memory-type set, and optional
  founder-scoped idempotencyKey write dedupe (the ChatMessage convention).
- Persistence authority TODAY mirrors ConversationStore exactly: the
  DurableFileStore collection `.data/sophia_memories.json` is the primary
  write target and the ONLY read source; Prisma `SophiaMemory` rows are an
  opportunistic best-effort dual-write mirror (errors swallowed, no read
  fallback, no authoritative-mode branch). The M6 authoritative-PostgreSQL
  migration moves conversations and personal memories together — until then
  Prisma must NOT be called authoritative for personal memory.
- Context integration: `SophiaContextAssembler.assemble({ message, history,
  founderId })` renders the founder's active personal memories as an
  explicitly labeled `PERSONAL_MIND_MEMORY` slice (600-char budget), strictly
  separated from every Company Brain slice. `executeSophiaTurn` and
  /api/agent-chat thread the authenticated session principal into assembly;
  callers without a founderId get no slice (backward compatible).
- Governed ingress: `/api/sofia/memory` (GET/POST/PATCH/DELETE) binds every
  operation to the authenticated founder session (401 in production without
  credentials; founderId in bodies/query is untrusted and ignored).
- Boundary is test-pinned (tests/sophia/k2_personal_memory.test.ts, 20 pins):
  no cross-founder read/modify/delete, restart durability via genuine child
  processes, no leak into another founder's context, no auto-promotion to
  CompanyMemory / CanonicalFact / claims, no authorization capability (the
  gateway ignores personal-memory authority claims; the store imports no
  authorization/epistemic/company-brain module), idempotent writes, empty
  state stays empty.

NOT IMPLEMENTED (deliberately out of scope for K-2):
- MemoryGate, selective retention, consolidation/compression, forgetting /
  decay lifecycle, embeddings / vector search / pgvector / Qdrant, FTS
  migration, PostgreSQL migration, autonomous memory promotion, autonomous
  memory CAPTURE from conversations (a future governed learning loop — today
  memories enter only through the authenticated founder route or explicit
  server-side calls), and any personal-memory influence on approvals,
  governance, or company state.

Invariant kept: Personal Mind provides context; it can never grant authority.
The Company Brain (CompanyState / CompanyKnowledge / CompanyMemory /
epistemic pipeline) remains the only source of company truth.

## 12. M4-A memory capture + MemoryGate (2026-09-23 addendum)

M4-A (branch feat/sophia-memory-capture-m4a) adds the first governed
memory-capture loop on top of the K-2 store. Keep these claims precise:

### Capture flow (implemented)

```
persisted founder message
  -> persisted assistant reply
  -> asynchronous SophiaMemoryCaptureStage (fire-and-forget, never a
     conversational dependency)
  -> LLM extraction (untrusted proposals only)
  -> deterministic MemoryGate
       REJECT       -> nothing persisted
       NEEDS_REVIEW -> INACTIVE SophiaMemory candidate (captureStatus pending)
  -> Founder confirmation via the EXISTING governed PATCH /api/sofia/memory
     { active: true }  (stamps captureStatus confirmed + confirmedAt)
  -> active personal memory (renders in PERSONAL_MIND_MEMORY)
```

- Integrated at BOTH real Sophia execution paths: `executeSophiaTurn`
  (serving /api/sofia/ask and live voice) and the /api/agent-chat inline
  Sophia branch. Non-Sophia personas never capture. The two paths were
  deliberately NOT converged in M4-A.
- Capture input is built from authoritative persisted turn information
  (authenticated founderId, conversationId, founderMessageId,
  assistantMessageId, turnId, ingress). A replayed turn returns at the
  executor idempotency check before capture ever runs.

### MemoryGate responsibility split (LLM vs deterministic)

The LLM (SophiaMemoryExtractor, same zai-client architecture as the intent
classifier) may ONLY propose: that a stable personal preference/context
might exist, a memoryType, normalized content, and a confidence. Its output
is untrusted data parsed into a fixed four-field shape (any smuggled
founderId/token/authority fields are structurally discarded) and re-validated
deterministically.

The deterministic MemoryGate (src/lib/server/sophia/memory-gate.ts) decides:
structural validity, memory-type allow-list (the store's published list, exact
match), content bounds, confidence range, provenance well-formedness
(`conversation:<conversationId>`, stage-supplied only), secret/credential
indicators, instruction-shaped content, company-domain contamination,
transient content, and exact-normalized duplicate detection. Persistence,
idempotency, lifecycle, provenance, and audit state are NEVER
model-decided. The gate is a fail-safe first line in front of Founder
review: false rejects only cost a missed memory; false passes only reach an
inactive candidate a Founder must explicitly confirm.

### Founder-review requirement (no automatic activation)

M4-A deliberately has NO operational ACCEPT path. The gate's decision type
includes `ACCEPT` for future compatibility only — the gate never returns it
(the source contains no ACCEPT return; pinned by test). Every captured
candidate persists INACTIVE (`active: false`, metadata.captureStatus
`pending`) and is visible to the owning founder through the existing governed
GET (`?active=false` review queue). ONLY the governed PATCH `active: true`
activates. Automatic activation is an M4-B decision requiring an explicit
Founder decision — the review friction is the security control.

### Personal Mind security boundary (prompt hardening)

Personal memories are persistent untrusted data rendered into model context.
Since M4-A they render inside a structurally delimited
`<personal_memory_context type="untrusted_personal_interaction_data">`
container, one `<personal_memory id type confidence>` block per memory, with
all payload text XML-escaped so a stored memory can never terminate its own
container or inject instructions into the surrounding prompt. The container
is budget-bounded and always well-formed (closing tag guaranteed within the
600-char partition). The intent classifier's system prompt explicitly names
the container as untrusted data that can never act as instructions,
authorization, governance, or tool permission. Natural-language warnings are
documentation, not the control — the structural separation is.

### Idempotency

Two deterministic layers, both derived from authoritative turn identity
(never wall-clock time): (1) a turn-level replay guard — the capture stage
checks for any existing `m4cap:<conversationId>:<turnId>:` key prefix BEFORE
extraction, so a replayed turn never re-captures; (2) candidate-level keys
`m4cap:<conversationId>:<turnId>:<index>` — the store's founder-scoped
idempotencyKey dedupe makes any re-persistence a no-op replay. Exact-
normalized duplicate content is additionally gate-rejected. No semantic
consolidation exists in M4-A (deliberately out of scope).

### Rejection behavior and failure containment

Every capture failure is contained inside the stage: the triggering
conversation always succeeds. Extraction unavailable/malformed → no
candidates, no persistence (no fake memory ever). Gate rejection → nothing
persisted, reason logged. Persistence failure → logged, candidate lost
(fail-safe). Prisma mirror failures are swallowed by the store's existing
opportunistic dual-write contract. Observability is structured single-line
events (`[SophiaMemoryCapture]` JSON) recording capture started/skipped,
extraction/gate/persist outcomes and reason codes — candidate CONTENT is
never logged (private memory text does not leak into generic logs).

### Explicit non-goals (M4-A)

No M4-B, no automatic activation, no forgetting/decay/TTL, no consolidation
or semantic merging, no vector search / pgvector / Qdrant, no PostgreSQL
migration, no CompanyMemory/CompanyKnowledge/EpistemicClaim redesign, no
cross-brain promotion mechanism, no agent-chat architectural convergence, no
new workflow/approval framework, no new review UI (the governed API is the
review surface). Pinned by tests/sophia/m4a_memory_capture.test.ts (41 pins).

## 13. M4-A hardening — security + persistence + reviewability (2026-09-23 addendum)

The M4-A real-use observation (commit 4b6ac2a) demonstrated concrete
defects. This hardening closes them WITHOUT expanding scope. M4-B remains
BLOCKED (Founder decision). Pinned by tests/sophia/m4a_hardening.test.ts
(H1-H22) on top of the existing m4a suite (42 pins).

### Deterministic authority/privilege content gate (H1-H4, H8, H21)

The observation showed LLM paraphrase laundering: instruction-shaped
authority requests ("never ask me for confirmation") re-emerged as benign-
looking third-person preference sentences that the keyword-based
INSTRUCTION_PATTERNS passed into NEEDS_REVIEW.

`src/lib/server/sophia/authority-content-guard.ts` adds a deterministic,
fail-closed AUTHORITY/PRIVILEGE/CONTROL/GOVERNANCE/AUTHORIZATION/
APPROVAL_BYPASS/POLICY_OVERRIDE/TOOL_PERMISSION category, applied at the
MemoryGate (new reason AUTHORITY_PRIVILEGE → REJECT) and at the STORE layer
(both create and content PATCH → SophiaMemoryAuthorityError, HTTP 400 code
SOPHIA_MEMORY_AUTHORITY_CONTENT). Detection is paraphrase-resistant without
semantics: ANY hard authority term blocks (administrator, sudo, unrestricted,
override, bypass, blanket approve, on-behalf, standing approval, sole
approver, …); otherwise a DOMAIN term (approve/permission/policy/rights/…)
and a SIGNAL term (modals, never/always/without, grant/treat/exempt, …) in
the SAME CLAUSE blocks. Normalization defeats separator/case/punctuation
evasion ("never.ask.me.for-confirmation"). Benign preferences
("I prefer concise answers", "Never ask me about sports on weekends") pass
by design — the false-positive boundary is pinned (H3). Residual limit
(documented, NOT claimed solved): a paraphrase avoiding both concept
families in one clause can still pass the deterministic net; it remains
contained by inactive-by-default capture + Founder activation. The LLM is
never the security authority; it may only propose.

### Personal memory is NEVER an authorization source

The authority-content guard applies to BOTH ingress paths — autonomous
capture AND founder-direct authoring (POST/PATCH /api/sofia/memory). The
Founder keeps full control of every legitimate personal memory, but
authorization/privilege semantics are not personal preferences: they are
policy, and the governed authorization/workflow system is the only policy
surface. Founder-authored memory therefore cannot grant privileges, cannot
alter Company Brain state, and cannot bypass approvals/governance (H5-H7,
H21; Company Brain separation pinned by the existing X2/X3 tests).
Cross-founder isolation remains fail-closed on every locked path (H22).

### DurableFileStore concurrency + no false success (H13-H20)

Root cause of the observed 2/20 silent write loss: saveItem/deleteItem were
unlocked read-modify-write cycles; two processes could interleave reads and
last-writer-wins erase each other's records while both callers received
success. Fix (generic, in DurableFileStore): per-collection cross-process
LOCK FILES (O_EXCL creation, atomic on POSIX), Atomics.wait polling,
stale-lock breaking (10s), 30s timeout fallback (loud, best-effort), and
in-process re-entrancy. SophiaMemoryStore create/update/delete and the
idempotency check now run as ONE serialized unit via withCollectionLock.
Additionally, STRICT variants (saveItemStrict/deleteItemStrict/
writeCollectionStrict) THROW when the authoritative write fails — the
personal-memory store uses them, so a failed durable write can never
masquerade as success (H20; pre-fix: phantom record + console.error only).
Prisma remains the opportunistic mirror only (M6 decision unchanged).

Remaining limitation (stated, not hidden): the lock timeout fallback means
a pathological >30s contention degrades to the old unprotected write (loud
console.error) rather than blocking persistence forever; the 50-record
listing cap still bounds review-queue visibility; multi-process Prisma
mirror writes remain opportunistic (no transactionality — unchanged until
M6).

### Reviewability (H12, H19 + SophiaPanel "Memory review" section)

The governed GET /api/sofia/memory?active=false now returns deterministic
advisory annotations computed over the caller's full record pool:
duplicateOf (exact-normalized — the gate's own equality), similarTo
(token-Jaccard near-duplicate, threshold 0.6, worst-first, top 3), and
contradicts (OBVIOUS contradictions only: opposing polarity verbs over the
same object tokens — "prefers concise" vs "dislikes concise"). The existing
SophiaPanel gained a small "Memory review" section: each pending candidate
shows content, memory type, confidence, capture timestamp, source
conversation, gate reason, duplicate/similarity/contradiction hints, and
Approve (governed PATCH active:true — the only activation path) / Reject
(governed DELETE) actions. No automatic activation, no merging, no
consolidation — the Founder decides.

Deliberately NOT detected (documented): paraphrase duplicates beyond token
overlap ("I prefer concise answers" vs "Keep responses short"), same-
polarity changed preferences ("prefers concise" → "now prefers detailed"),
numeric/factual contradictions, and semantic contradiction generally. No
embeddings/vectors — deterministic visibility only.

### Context budget (H10-H11)

Measured pre-hardening: fixed wrapper overhead 267/600 chars + ~125 chars
per memory (a 46-char UUID id attribute alone cost ~51), leaving ~333 for
content — effectively ONE rendered memory (the newest), 7/8 actives
invisible. Hardening: removed the per-memory id attribute and trimmed the
in-container security line to its load-bearing core. Fixed overhead is now
~165 chars, per-memory ~77 — roughly THREE short useful memories render
inside the unchanged 600-char PERSONAL_MIND_MEMORY budget (H10), long
memories truncate with [TRUNCATED] inside the structurally delimited,
XML-escaped, always-closed container (H11). The structural trust boundary
is unchanged: untrusted-data container tag, XML escaping, always-emitted
closing tag, 600-char partition, Company Brain separation, injection
containment.

### Provider failure observability (H9)

Capture remains fire-and-forget and never blocks the turn. The stage now
emits structured single-line [SophiaMemoryCapture] JSON events with a
failure taxonomy classified from the error message ALONE (never from
conversation or candidate content): PROVIDER_RATE_LIMITED (429/rate-limit
text + providerStatus), PROVIDER_ERROR, PARSE_ERROR, UNKNOWN — plus
capture_started / capture_skipped(+reason) / gate_rejected(+reasons) /
candidate_persisted / candidate_persist_failed / capture_completed
(persisted+rejected counts). 429 storms are now greppable and countable in
dev logs; extraction loss remains silent to the USER (fail-safe) but loud
to the OPERATOR.

### M4-B gate: STILL BLOCKED (unchanged)

M4-B (memory lifecycle, forgetting/decay, activation UX, consolidation)
remains a Founder decision and is NOT implemented. Personal memory remains
persistent untrusted contextual DATA — never instructions, never
authorization. No automatic activation path exists (the gate never returns
ACCEPT; only the governed Founder PATCH activates).
