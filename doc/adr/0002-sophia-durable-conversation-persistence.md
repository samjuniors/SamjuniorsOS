# ADR 0002: Sophia Durable Conversation Persistence

## Status
ACCEPTED — 2026-09-16

## Context & Problem
Following the completion of Sophia Phase 1 (Cognitive Ingress, Context Assembly & Trust Boundaries) and Phase 2 (Grounding & Context Intelligence), Sophia possesses robust contextual intelligence, deterministic entity resolution, and governance gates.

However, the architecture audit revealed a fundamental state gap:
1. **No Server-Authoritative Conversation State**: Sophia currently receives conversation history as an unverified client-supplied array (`req.body.history`). The server trusts the client's version of past exchanges.
2. **Ephemeral Sessions**: Dialogue history exists only in client React memory. Refreshing the browser or reconnecting resets conversation state to static fixtures.
3. **No Durable Ownership Binding**: Dialogues are not linked to the authenticated Founder session in a persistent store.
4. **No Turn-Level Idempotency**: Repeated POST requests or network retries can submit duplicate messages.

### Why Existing Stores Are Insufficient
SamJuniorsOS already has several specialized persistence and intelligence subsystems:
- **`CompanyKnowledgeStore`**: Static and semi-static reference documents (PRDs, SOPs, architectural guidelines).
- **`CompanyMemoryStore`**: Founder-approved organizational precedents and post-workflow lessons extracted by `OperationalLearningLoop`.
- **`EpistemicClaimStore`**: Lineage-backed empirical claims and verified canonical facts.
- **`CompanyContextProvider` / `CompanyState`**: Live operational telemetry (financial metrics, in-flight runs, pending governance).
- **`AgentRunStore`**: Execution trace of autonomous multi-agent council protocol steps.

None of these stores represent **human-agent conversational dialogue**. Commingling conversational turns into `CompanyMemory` would violate the core architectural rule: *Conversational remarks are not organizational precedents, and unverified chat turns must never become company ground truth.*

## Decision
We establish **Durable Conversation Persistence** as dedicated, server-authoritative infrastructure for Sophia.

### 1. Conceptual Separation
We strictly distinguish four classes of persistent state:
- **Conversation History** (This ADR): Turn-by-turn interactive dialogue between the Founder and Sophia. Bounded in token budget, ephemeral in authority (`CONVERSATIONAL_RECORD`), durable on disk/database.
- **Company Memory**: Founder-verified historical precedents extracted after successful workflow completion (`HISTORICAL_PRECEDENT`).
- **Operational State**: Live company metrics and database state (`AUTHORITATIVE_OPERATIONAL_STATE`).
- **Epistemic Facts**: Empirically verified claims with provenance lineage (`EPISTEMIC_FACT` / `CANONICAL_FACT`).

### 2. Relational & Dual-Mode Persistence Architecture
We introduce two minimal relational models in `prisma/schema.prisma` and implement dual-mode persistence (`PostgresConversationStore` with `DurableFileStore` fallback):

1. **`Conversation`**:
   - `id`: Stable UUID.
   - `founderId`: Bound strictly to the authenticated Founder principal (`session.founderId`).
   - `title`: Optional descriptive conversation label.
   - `agentId`: Executive agent role (defaults to `sophia`).
   - `status`: `active` or `archived`.
   - `createdAt`, `updatedAt`: Timestamps for sorting and lifecycle management.

2. **`ChatMessage`**:
   - `id`: Stable UUID.
   - `conversationId`: Foreign key relation with cascade deletion.
   - `sender`: `founder` | `assistant` | `system`.
   - `role`: `user` | `assistant` | `system`.
   - `content`: Text content of the utterance or response.
   - `intent`: Candidate intent kind (e.g. `conversation`, `directive_proposal`, `informational_query`).
   - `confidence`: Intent classification confidence score.
   - `commandType`: Validated server command type (e.g. `CONVERSATION_REPLY`, `DISPATCH_DIRECTIVE`).
   - `idempotencyKey`: Optional key for deduplicating retries.
   - `metadata`: Structured execution metadata (directive titles, run IDs, options; no raw CoT or credentials).
   - `createdAt`: Timestamp for strict chronological ordering.

### 3. Server-Authoritative Pipeline
The client is no longer the authority for past dialogue:
```
Founder POST /api/agent-chat { message, conversationId?, idempotencyKey? }
      ↓
Authenticate Founder Session (getAuthenticatedFounder fail-closed)
      ↓
Resolve / Create Conversation (enforce conversation.founderId === session.founderId)
      ↓
Idempotency Check (if idempotencyKey exists and already processed, return existing message)
      ↓
Persist Founder Message (ChatMessage role: 'user')
      ↓
Load Recent History from Store (bounded by token budget, ordered by createdAt asc)
      ↓
SophiaContextAssembler.assemble({ message, history: serverHistory })
      ↓
SophiaIntentClassifier.classify({ message, context, history: serverHistory })
      ↓
SophiaServerGateway.process({ proposal, session, message, context })
      ↓
Persist Assistant Response (ChatMessage role: 'assistant', intent, commandType, metadata)
      ↓
Return Response { success, conversationId, messageId, reply, intent, ... }
```

### 4. Security & Ownership Boundary
- **Never Trust Client-Supplied Identity**: `founderId` is extracted exclusively from the authenticated session cookie / dev-secret header via `getAuthenticatedFounder(req)`.
- **Fail-Closed Access**: If a client requests or posts to a `conversationId` owned by a different founder, the server rejects the request with HTTP 403 / fail-closed error.
- **Data Sanitization**: Assistant messages persist only the final user-facing reply, classified intent kind, and validated command type. Raw chain-of-thought, internal prompt wrappers, and security tokens are strictly forbidden from persistence.

### 5. Context Budgeting Policy
To prevent token bloat and context poisoning:
- The server retrieves at most the last 10 messages (5 conversational turns) for dynamic context assembly.
- All retrieved turns are formatted as `{ sender: 'founder' | 'assistant', text: message.content }`.
- `SophiaContextAssembler` clamps dialogue history to `PARTITION_LIMITS.dialogueHistory` (1,000 characters, ~250 tokens).
- Historical messages beyond the recent budget remain permanently archived in the database, accessible via paginated history endpoints, but are not fed into LLM prompts.

### 6. Idempotency, Replay & Concurrency Locking
- Clients may supply an optional `idempotencyKey` per turn.
- **Turn-Level Deduplication**: When `idempotencyKey` is provided, the route checks whether an assistant reply has already been persisted for `${idempotencyKey}:assistant`.
- **Instant Replay**: If the turn was already completed, the server replays the existing assistant response and metrics with `idempotentReplay: true` without re-executing inference, directives, or side-effects.
- **In-Flight Concurrency Lock**: In-flight turns are locked via an in-memory execution map (`inFlightTurns`) keyed by `${founderId}:${conversationId}:${idempotencyKey}`. Simultaneous concurrent requests await the identical promise, eliminating race conditions and duplicate turns.

### 7. Dual-Mode Persistence & Authority Model
- **Milestone 1.1 Local Authority (`DurableFileStore`)**:
  - `DurableFileStore` (`.data/conversations.json`, `.data/chat_messages.json`) is the **primary authoritative store** for reads, writes, idempotency lookups, and context hydration in the current deployment.
  - This matches the project's single-instance deployment model (enforced by `InstanceConcurrencyGuard`).
  - Guarantees durability across browser reloads, connection loss, and process restarts.
- **Opportunistic Relational Synchronization (`Prisma`)**:
  - Relational models (`Conversation`, `ChatMessage`) exist in `prisma/schema.prisma` and are validated.
  - Writes are dual-synced to Prisma when database connections are active, but failures do not block user dialogue.
  - Full relational authority is targeted for the multi-instance deployment milestone when PostgreSQL is provisioned.
- **Authorization & Existence (Fail-Closed)**:
  - Unauthorized conversation access immediately throws `ConversationSecurityError` and returns `403 Forbidden`.
  - Nonexistent conversation IDs immediately throw `ConversationNotFoundError` and return `404 Not Found`.
  - Phantom conversations are never silently created on read or write failures.

## Rejected Alternatives
1. **Commingling Conversation in `CompanyMemoryStore`**: Rejected because chat turns are unverified, unstructured dialogues, whereas company memory represents verified institutional precedents.
2. **Client-Authoritative History with Server Verification**: Rejected because trusting client history opens the door to history poisoning and prompt injection.
3. **Unlimited Context Window Injection**: Rejected because unbounded dialogue history degrades reasoning latency, increases token cost, and exceeds the dynamic payload ceiling.
4. **End-to-End Voice Integration in this Phase**: Rejected per architectural staging rules. Voice is a modality adapter to be added in Phase 4 once conversational state is durable.

## Consequences
- Sophia conversations now survive browser reloads, connection loss, and process restarts.
- Multi-turn context is strictly server-authoritative and bound to the authenticated Founder.
- The chat UI can reload and inspect past conversations without losing context.
- Provides the essential state foundation required for the upcoming Live Interaction / Voice phase.
