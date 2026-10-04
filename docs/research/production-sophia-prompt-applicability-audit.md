# Production Sophia Prompt Applicability Audit

**Status:** Read-only source audit complete; no production prompt change authorized or made  
**Branch:** `feat/decision-layer-architecture-baseline`  
**Purpose:** Determine whether the M5.4 `prompt/2` relationship/completeness instruction can be meaningfully A/B evaluated against the actual production Sophia prompt.

## Verdict

**Do not run a production-prompt A/B battery yet, and do not copy the M5.4 instruction into production.** The M5.4 harness generates a natural-language factual answer from assembled context. The production path does not use that prompt template for factual answer generation: it uses a model-backed intent classifier, followed by a deterministic server gateway that constructs the user-facing informational reply. A prompt-only A/B would therefore test classification side effects, not the factual answer behavior that failed in M5.4.

The source trace also identifies a concrete production-path coverage gap for dependency questions: the context assembler renders a bounded, provenance-bearing dependency-chain slice, but the gateway's generic informational reply path does not select that slice. The M5.4 prompt instruction cannot fix evidence that the production reply path never renders.

## Source trace (current branch)

1. `src/app/api/sofia/ask/route.ts` delegates to `executeSophiaTurn`; the route itself does not generate answers.
2. `src/lib/server/sophia/turn-executor.ts` orchestrates the turn through context assembly, intent classification, and the server gateway.
3. `src/lib/server/sophia/intent-classifier.ts` builds a production `systemInstruction` for intent/proposal classification. It requests a JSON proposal. Although the prompt describes factual-query handling and includes a `reply` field in its JSON schema, `sanitizeProposal()` reconstructs an `informational_query` proposal from the domain, original query, confidence, and reason; it does not preserve the model's generated factual reply for that kind.
4. `src/lib/server/sophia/context-assembly.ts` recognizes dependency intent, traverses active canonical dependency relations to bounded depth, and renders a `CANONICAL_FACT` slice with both relation-edge provenance and fact identifiers.
5. `src/lib/server/sophia/server-gateway.ts` constructs the final user-facing response for `informational_query`. For `epistemic_fact`, it currently summarizes the first active fact/claim and lineage. For the generic domain, it looks for `COMPANY_KNOWLEDGE`, `HISTORICAL_PRECEDENT`, then `RECENT_ACTIVITY`; it does not select the `CANONICAL_FACT` dependency-path slice.

## Consequence for M5.4 S6/S9

- S6 asks: `Which services depend on the Helix Identity Store?`
- S9 asks the same question and requests evidence citations.
- The context assembler's existing tests verify that both direct and transitive dependency edges, with their source fact IDs, are present in the assembled context.
- The final production reply path is not shown to consume that dependency slice. S9's word `evidence` also matches the deterministic epistemic-query classifier pattern, whose gateway branch summarizes a single fact/claim rather than answering the dependency-path question.
- Therefore, a production prompt A/B would be a misleading test of the original M5.4 failure. The relevant first experiment is an end-to-end production-path regression around context → intent proposal → gateway reply.

This is a static source-path finding, **not a newly executed runtime test**. No live model calls, test suites, or database operations were run for this audit.

## Recommended next action

Create a separately scoped production-response-path task before changing the prompt:

1. Add isolated, deterministic regression coverage for S6/S9 through the actual gateway response path, using the existing frozen benchmark seed/context.
2. Verify that the final reply includes both direct and transitive dependents and cites only supplied evidence keys.
3. Include adjacent guard cases: unresolvable dependency anchors must not invent a chain; superseded dependency edges must not be presented as current; personal memory must not become company truth; existing unsupported-claim and injection behavior must remain fail-closed.
4. If the test demonstrates the response path is missing canonical dependency evidence, propose the smallest gateway/context rendering fix and test it in isolation. Do not change production code until that fix is separately approved.
5. Only after the production answer path has a measurable, correct baseline should a diagnostic production-prompt experiment be considered. It should remain non-gating and must not replace the existing frozen M5.4 harness.

## Scope boundary

- No production prompt or runtime code changed.
- No dependencies, schemas, stores, fixtures, or benchmark artifacts changed.
- Existing `prompt/1` and `prompt/2` benchmark evidence remains untouched.
- No tests or live model batteries were run.
- No merge, deployment, or branch promotion was performed.
