# M5.1 Memory Retrieval Benchmark — Baseline A0 Results

- Baseline: A0 — origin/main @ b9e63ad (M4-D state) via branch feat/m51-retrieval-benchmark
- Fixture digest (SHA-256): `40e53f1581def28371af8f050bc5ba85eaf58a47cbb86a4f449fad1beef719fb`
- Queries: 13 · Failures: 14 · Graph-candidate failures: 1

## Per-category summary

| category | queries | union recall | render recall | authority | temporal | supersession | failures | graph-candidates |
|---|---|---|---|---|---|---|---|---|
| TEMPORAL | 2 | 83% | 83% | 2/2 | 1/2 | 2/2 | 1 | 0 |
| CHANGE_DETECTION | 1 | 31% | 31% | 1/1 | 0/1 | 1/1 | 9 | 0 |
| MULTI_HOP | 2 | 71% | 71% | 2/2 | 0/0 | 0/0 | 2 | 1 |
| ENTITY_CENTRIC | 1 | 100% | 100% | 1/1 | 1/1 | 1/1 | 0 | 0 |
| CONTRADICTION_SUPERSESSION | 2 | 100% | 100% | 1/1 | 2/2 | 2/2 | 0 | 0 |
| EPISODIC | 2 | 50% | 50% | 2/2 | 0/0 | 0/0 | 2 | 0 |
| PERSONAL_MEMORY | 2 | 100% | 100% | 0/0 | 1/1 | 2/2 | 0 | 0 |
| COMPANY_AUTHORITY | 1 | 100% | 100% | 1/1 | 1/1 | 1/1 | 0 | 0 |

## Primary gap distribution (all failures)

| primary gap | count |
|---|---|
| B_semantic | 6 |
| C_structured_filtering | 3 |
| D_temporal_filtering | 2 |
| J_other | 2 |
| F_graph_traversal | 1 |

## Per-query detail

### BQ1a — TEMPORAL

> "What was our previous Lumora pricing strategy?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 1 | 2 | 100% | 50% | 1.00 |
| company_precedent | 2 | 1 | 2 | 100% | 50% | 1.00 |
| canonical_facts | 3 | 1 | 4 | 0% | 0% | — |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |

Union recall: **67%** · Render recall: **67%** · Authority: PASS · Temporal: FAIL · Supersession: PASS · Founder scope: PASS · Boundary: PASS

Measured failures (1):
- **FACT-OLD-01** (canonical_facts, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap D_temporal_filtering): GOLD_NOT_RETRIEVED for FACT-OLD-01 on canonical_facts: lexical overlap 2 (evidence lifecycle on its store: superseded) ; surface note: surface is NOT query-conditioned in A0 — the slice renders the 3 newest active facts regardless of the query

### BQ1b — TEMPORAL

> "When did we move Lumora to value-based pricing?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 1 | 2 | 100% | 50% | 1.00 |
| company_precedent | 2 | 1 | 2 | 100% | 50% | 1.00 |
| canonical_facts | 3 | 1 | 4 | 100% | 33% | 0.50 |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |

Union recall: **100%** · Render recall: **100%** · Authority: PASS · Temporal: PASS · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ2 — CHANGE_DETECTION

> "What changed in company strategy during the last 3 months?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 2 | 1 | 50% | 100% | 1.00 |
| company_precedent | 2 | 5 | 0 | 0% | 0% | — |
| canonical_facts | 3 | 5 | 4 | 60% | 100% | 1.00 |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 1 | 3 | 0% | 0% | — |

Union recall: **31%** · Render recall: **31%** · Authority: PASS · Temporal: FAIL · Supersession: PASS · Founder scope: PASS · Boundary: PASS

Measured failures (9):
- **FACT-OLD-01** (canonical_facts, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap D_temporal_filtering): GOLD_NOT_RETRIEVED for FACT-OLD-01 on canonical_facts: lexical overlap 0 (evidence lifecycle on its store: superseded) ; surface note: surface is NOT query-conditioned in A0 — the slice renders the 3 newest active facts regardless of the query
- **FACT-DEP-01** (canonical_facts, GOLD_BEYOND_EFFECTIVE_K, class RETRIEVAL, primary gap C_structured_filtering): GOLD_BEYOND_EFFECTIVE_K for FACT-DEP-01 on canonical_facts: lexical overlap 0 ; surface note: surface is NOT query-conditioned in A0 — the slice renders the 3 newest active facts regardless of the query
- **PREC-01** (company_precedent, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap B_semantic): GOLD_NOT_RETRIEVED for PREC-01 on company_precedent: lexical overlap 0 
- **PREC-02** (company_precedent, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap B_semantic): GOLD_NOT_RETRIEVED for PREC-02 on company_precedent: lexical overlap 0 
- **PREC-03** (company_precedent, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap B_semantic): GOLD_NOT_RETRIEVED for PREC-03 on company_precedent: lexical overlap 0 
- **PREC-04** (company_precedent, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap B_semantic): GOLD_NOT_RETRIEVED for PREC-04 on company_precedent: lexical overlap 0 
- **PREC-06** (company_precedent, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap B_semantic): GOLD_NOT_RETRIEVED for PREC-06 on company_precedent: lexical overlap 0 
- **SOP-LUMORA-PRICING-V2** (company_knowledge, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap B_semantic): GOLD_NOT_RETRIEVED for SOP-LUMORA-PRICING-V2 on company_knowledge: lexical overlap 0 
- **STATE-dec-pricing-value-based** (company_state, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap C_structured_filtering): GOLD_NOT_RETRIEVED for STATE-dec-pricing-value-based on company_state: lexical overlap 0 ; surface note: slice 1 renders UNCONDITIONALLY (metrics + top-3 active initiatives) — presence is NOT query-driven

### BQ3a — MULTI_HOP

> "Which services depend on the Helix Identity Store?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 0 | 1 | 0% | 0% | — |
| company_precedent | 2 | 1 | 1 | 100% | 100% | 1.00 |
| canonical_facts | 3 | 2 | 4 | 50% | 33% | 0.33 |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |

Union recall: **67%** · Render recall: **67%** · Authority: PASS · Temporal: n/a · Supersession: n/a · Founder scope: PASS · Boundary: PASS

Measured failures (1):
- **FACT-DEP-01** (canonical_facts, GOLD_BEYOND_EFFECTIVE_K, class RETRIEVAL, primary gap F_graph_traversal — GRAPH CANDIDATE): GOLD_BEYOND_EFFECTIVE_K for FACT-DEP-01 on canonical_facts: declared relationship hop depth 2 with zero single-shot lexical overlap ; surface note: surface is NOT query-conditioned in A0 — the slice renders the 3 newest active facts regardless of the query

### BQ3b — MULTI_HOP

> "Which projects depend on the value-based pricing decision?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 1 | 2 | 100% | 50% | 1.00 |
| company_precedent | 2 | 1 | 2 | 100% | 50% | 1.00 |
| canonical_facts | 3 | 0 | 4 | 0% | 0% | — |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 2 | 3 | 50% | 33% | 0.50 |

Union recall: **75%** · Render recall: **75%** · Authority: PASS · Temporal: n/a · Supersession: n/a · Founder scope: PASS · Boundary: PASS

Measured failures (1):
- **STATE-dec-pricing-value-based** (company_state, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap C_structured_filtering): GOLD_NOT_RETRIEVED for STATE-dec-pricing-value-based on company_state: lexical overlap 2 ; surface note: slice 1 renders UNCONDITIONALLY (metrics + top-3 active initiatives) — presence is NOT query-driven

### BQ4 — ENTITY_CENTRIC

> "Tell me everything relevant to Lumora right now."

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 1 | 2 | 100% | 50% | 0.50 |
| company_precedent | 2 | 2 | 2 | 100% | 100% | 1.00 |
| canonical_facts | 3 | 1 | 4 | 100% | 33% | 0.50 |
| unverified_claims | 3 | 1 | 1 | 100% | 100% | 1.00 |
| company_state | 3 | 1 | 3 | 100% | 33% | 0.50 |

Union recall: **100%** · Render recall: **100%** · Authority: PASS · Temporal: PASS · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ5a — CONTRADICTION_SUPERSESSION

> "I previously said the Lumora Starter tier costs $29 per month, later we changed it. What is the currently true price?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_knowledge | 2 | 1 | 2 | 100% | 50% | 0.50 |
| company_precedent | 2 | 0 | 2 | 0% | 0% | — |
| canonical_facts | 3 | 1 | 4 | 100% | 33% | 0.50 |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |

Union recall: **100%** · Render recall: **100%** · Authority: PASS · Temporal: PASS · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ5b — CONTRADICTION_SUPERSESSION

> "How do I want strategy updates delivered these days?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 1 | 8 | 100% | 13% | 1.00 |
| canonical_facts | 3 | 0 | 4 | 0% | 0% | — |
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
| canonical_facts | 3 | 0 | 4 | 0% | 0% | — |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |
| episodic_conversation | 10 | 1 | 0 | 0% | 0% | — |

Union recall: **50%** · Render recall: **50%** · Authority: PASS · Temporal: n/a · Supersession: n/a · Founder scope: PASS · Boundary: PASS

Measured failures (1):
- **CONV-EP-01** (episodic_conversation, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap J_other): GOLD_NOT_RETRIEVED for CONV-EP-01 on episodic_conversation: NO episodic retrieval surface exists in A0 — the canonical path loads only current-conversation history (last 10 turns, client-supplied) and no store offers past-conversation search; lexical overlap with the query is 3 but no code path ever consults it

### BQ6b — EPISODIC

> "Why did we abandon that approach?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 0 | 8 | 0% | 0% | — |
| company_precedent | 2 | 1 | 1 | 100% | 100% | 1.00 |
| canonical_facts | 3 | 0 | 4 | 0% | 0% | — |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |
| episodic_conversation | 10 | 1 | 0 | 0% | 0% | — |

Union recall: **50%** · Render recall: **50%** · Authority: PASS · Temporal: n/a · Supersession: n/a · Founder scope: PASS · Boundary: PASS

Measured failures (1):
- **CONV-EP-01** (episodic_conversation, GOLD_NOT_RETRIEVED, class RETRIEVAL, primary gap J_other): GOLD_NOT_RETRIEVED for CONV-EP-01 on episodic_conversation: NO episodic retrieval surface exists in A0 — the canonical path loads only current-conversation history (last 10 turns, client-supplied) and no store offers past-conversation search; lexical overlap with the query is 0 but no code path ever consults it

### BQ7a — PERSONAL_MEMORY

> "What do you know about how I prefer to work?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 6 | 8 | 100% | 75% | 1.00 |
| canonical_facts | 3 | 0 | 4 | 0% | 0% | — |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 0 | 3 | 0% | 0% | — |

Union recall: **100%** · Render recall: **100%** · Authority: n/a · Temporal: n/a · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

### BQ7b — PERSONAL_MEMORY

> "What are my communication preferences right now?"

| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |
|---|---|---|---|---|---|---|
| personal_mind | 20 | 2 | 8 | 100% | 25% | 0.50 |
| canonical_facts | 3 | 0 | 4 | 0% | 0% | — |
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
| canonical_facts | 3 | 1 | 4 | 100% | 33% | 1.00 |
| unverified_claims | 3 | 0 | 1 | 0% | 0% | — |
| company_state | 3 | 1 | 3 | 100% | 33% | 1.00 |

Union recall: **100%** · Render recall: **100%** · Authority: PASS · Temporal: PASS · Supersession: PASS · Founder scope: PASS · Boundary: PASS

No measured failures.

---

NOTE: GENERATION failures are structurally unmeasurable by this harness (no model call is made). Every failure above is RETRIEVAL or AUTHORITY_LIFECYCLE. A generation layer consuming this exact context could still produce a wrong answer; that failure class is out of scope and must be measured by a separate generation-side harness.
