# Memory Retrieval Benchmark — Run Results

- Baseline: A1 — M5.2 retrieval hygiene (feat/m52-retrieval-hygiene); fixture and gold sets byte-identical to A0 @ b9d1504
- Fixture digest (SHA-256): `40e53f1581def28371af8f050bc5ba85eaf58a47cbb86a4f449fad1beef719fb`
- Queries: 13 · Failures: 1 · Graph-candidate failures: 1

## Per-category summary

| category | queries | union recall | render recall | authority | temporal | supersession | failures | graph-candidates |
|---|---|---|---|---|---|---|---|---|
| TEMPORAL | 2 | 83% | 100% | 2/2 | 2/2 | 2/2 | 0 | 0 |
| CHANGE_DETECTION | 1 | 31% | 100% | 1/1 | 1/1 | 1/1 | 0 | 0 |
| MULTI_HOP | 2 | 83% | 83% | 2/2 | 0/0 | 0/0 | 1 | 1 |
| ENTITY_CENTRIC | 1 | 100% | 100% | 1/1 | 1/1 | 1/1 | 0 | 0 |
| CONTRADICTION_SUPERSESSION | 2 | 100% | 100% | 1/1 | 2/2 | 2/2 | 0 | 0 |
| EPISODIC | 2 | 100% | 100% | 2/2 | 0/0 | 0/0 | 0 | 0 |
| PERSONAL_MEMORY | 2 | 100% | 100% | 0/0 | 1/1 | 2/2 | 0 | 0 |
| COMPANY_AUTHORITY | 1 | 100% | 100% | 1/1 | 1/1 | 1/1 | 0 | 0 |

## Primary gap distribution (all failures)

| primary gap | count |
|---|---|
| F_graph_traversal | 1 |

## Per-query detail

### BQ1a — TEMPORAL

> "What was our previous Lumora pricing strategy?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 1 | 2 | 100% | 50% | 1.00 |
| company_precedent | 2 | 1 | 2 | 100% | 50% | 1.00 |
| canonical_facts | 3 | 1 | 3 | 0% | 0% | — |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 4 | 0% | 0% | — |

Union recall: **67%** · Render recall: **100%** · Authority: PASS · Temporal: PASS · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ1b — TEMPORAL

> "When did we move Lumora to value-based pricing?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 1 | 2 | 100% | 50% | 1.00 |
| company_precedent | 2 | 1 | 2 | 100% | 50% | 1.00 |
| canonical_facts | 3 | 1 | 3 | 100% | 33% | 1.00 |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 4 | 0% | 0% | — |

Union recall: **100%** · Render recall: **100%** · Authority: PASS · Temporal: PASS · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ2 — CHANGE_DETECTION

> "What changed in company strategy during the last 3 months?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 2 | 1 | 50% | 100% | 1.00 |
| company_precedent | 2 | 5 | 0 | 0% | 0% | — |
| canonical_facts | 3 | 5 | 3 | 60% | 100% | 1.00 |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 1 | 3 | 0% | 0% | — |

Union recall: **31%** · Render recall: **100%** · Authority: PASS · Temporal: PASS · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ3a — MULTI_HOP

> "Which services depend on the Helix Identity Store?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 0 | 1 | 0% | 0% | — |
| company_precedent | 2 | 1 | 1 | 100% | 100% | 1.00 |
| canonical_facts | 3 | 2 | 3 | 50% | 33% | 1.00 |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |

Union recall: **67%** · Render recall: **67%** · Authority: PASS · Temporal: n/a · Supersession: n/a · Founder scope: PASS · Boundary: PASS

Measured failures (1):
- **FACT-DEP-01** (canonical_facts, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap F_graph_traversal — GRAPH CANDIDATE): GOLD_NOT_RETRIEVED for FACT-DEP-01 on canonical_facts: declared relationship hop depth 2 with zero single-shot lexical overlap ; surface note: M5.2 query-conditioned facts slice (shared lexical scorer; ranked score DESC, promotedAt DESC, id ASC)

### BQ3b — MULTI_HOP

> "Which projects depend on the value-based pricing decision?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 1 | 2 | 100% | 50% | 1.00 |
| company_precedent | 2 | 1 | 2 | 100% | 50% | 1.00 |
| canonical_facts | 3 | 0 | 3 | 0% | 0% | — |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 2 | 4 | 100% | 67% | 0.50 |

Union recall: **100%** · Render recall: **100%** · Authority: PASS · Temporal: n/a · Supersession: n/a · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ4 — ENTITY_CENTRIC

> "Tell me everything relevant to Lumora right now."

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 1 | 2 | 100% | 50% | 1.00 |
| company_precedent | 2 | 2 | 2 | 100% | 100% | 1.00 |
| canonical_facts | 3 | 1 | 3 | 100% | 33% | 1.00 |
| unverified_claims | 3 | 1 | 1 | 100% | 100% | 1.00 |
| company_state | 3 | 1 | 4 | 100% | 33% | 0.33 |

Union recall: **100%** · Render recall: **100%** · Authority: PASS · Temporal: PASS · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ5a — CONTRADICTION_SUPERSESSION

> "I previously said the Lumora Starter tier costs $29 per month, later we changed it. What is the currently true price?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 1 | 2 | 100% | 50% | 1.00 |
| company_precedent | 2 | 0 | 2 | 0% | 0% | — |
| canonical_facts | 3 | 1 | 3 | 100% | 33% | 1.00 |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 4 | 0% | 0% | — |
| episodic_conversation | 10 | 0 | 1 | 0% | 0% | — |

Union recall: **100%** · Render recall: **100%** · Authority: PASS · Temporal: PASS · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ5b — CONTRADICTION_SUPERSESSION

> "How do I want strategy updates delivered these days?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 1 | 8 | 100% | 13% | 1.00 |
| canonical_facts | 3 | 0 | 3 | 0% | 0% | — |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |

Union recall: **100%** · Render recall: **100%** · Authority: n/a · Temporal: PASS · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ6a — EPISODIC

> "Why did we abandon the microservices refactor for Aurorium?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 0 | 1 | 0% | 0% | — |
| company_precedent | 2 | 1 | 1 | 100% | 100% | 1.00 |
| canonical_facts | 3 | 0 | 3 | 0% | 0% | — |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |
| episodic_conversation | 10 | 1 | 1 | 100% | 100% | 1.00 |

Union recall: **100%** · Render recall: **100%** · Authority: PASS · Temporal: n/a · Supersession: n/a · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ6b — EPISODIC

> "Why did we abandon that approach?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_precedent | 2 | 1 | 1 | 100% | 100% | 1.00 |
| canonical_facts | 3 | 0 | 3 | 0% | 0% | — |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |
| episodic_conversation | 10 | 1 | 1 | 100% | 100% | 1.00 |

Union recall: **100%** · Render recall: **100%** · Authority: PASS · Temporal: n/a · Supersession: n/a · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ7a — PERSONAL_MEMORY

> "What do you know about how I prefer to work?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 6 | 8 | 100% | 75% | 1.00 |
| canonical_facts | 3 | 0 | 3 | 0% | 0% | — |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |

Union recall: **100%** · Render recall: **100%** · Authority: n/a · Temporal: n/a · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ7b — PERSONAL_MEMORY

> "What are my communication preferences right now?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 2 | 8 | 100% | 25% | 1.00 |
| canonical_facts | 3 | 0 | 3 | 0% | 0% | — |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |

Union recall: **100%** · Render recall: **100%** · Authority: n/a · Temporal: PASS · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ8 — COMPANY_AUTHORITY

> "What is SamJuniors' current financial state?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 0 | 1 | 0% | 0% | — |
| canonical_facts | 3 | 1 | 3 | 100% | 33% | 1.00 |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 1 | 5 | 100% | 33% | 1.00 |

Union recall: **100%** · Render recall: **100%** · Authority: PASS · Temporal: PASS · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

---

NOTE: GENERATION failures are structurally unmeasurable by this harness (no model call is made). Every failure above is RETRIEVAL or AUTHORITY_LIFECYCLE. A generation layer consuming this exact context could still produce a wrong answer; that failure class is out of scope and must be measured by a separate generation-side harness.
