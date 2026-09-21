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
