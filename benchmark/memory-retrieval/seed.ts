/**
 * ============================================================================
 * M5.1 — DETERMINISTIC STORE SEEDING (the A0 benchmark universe)
 * ============================================================================
 * Seeds the REAL production stores through their PUBLIC APIs, so every
 * lifecycle transition, supersession pointer and durable write is produced by
 * the production code path — never by fixture fiat.
 *
 * DETERMINISM CONTRACT:
 *   1. resetDurableState() wipes every fixture-relevant DurableFileStore
 *      collection BEFORE any store singleton is constructed (all singletons
 *      hydrate lazily at first getInstance()).
 *   2. CompanyState is written directly to the durable 'company_state'
 *      collection (its documented seed shape) before CompanyStateStore
 *      constructs.
 *   3. Personal memories are created through SophiaMemoryStore.createMemory
 *      and transitioned through updateMemory (the governed M4-B.1 path).
 *      createMemory stamps wall-clock createdAt/updatedAt; selection
 *      determinism does NOT depend on them because every founder's ACTIVE
 *      memories have DISTINCT confidences within a memoryType (asserted by
 *      the fixture integrity test), so the confidence-first tie-break order
 *      is fully fixture-determined.
 *   4. No result field ever reads the wall clock.
 *
 * RUN TWICE GUARANTEE: the benchmark CLI runs in a fresh process; two
 * consecutive runs produce byte-identical JSON (asserted by
 * tests/sophia/m51_benchmark.test.ts).
 */

import {
  PERSONAL_MEMORIES,
  COMPANY_KNOWLEDGE,
  COMPANY_MEMORIES,
  CANONICAL_FACTS,
  EPISTEMIC_CLAIMS,
  EPISTEMIC_SOURCES,
  STATE_FINANCIAL_MODEL,
  STATE_INITIATIVES,
  STATE_DECISIONS,
  EPISODIC_CONVERSATION,
  FOUNDER_A,
  FOUNDER_B,
} from './fixture';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';
import { SophiaMemoryStore } from '../../src/lib/server/sophia/personal-memory-store';
import { CompanyKnowledgeStore } from '../../src/lib/server/knowledge/knowledge-store';
import { CompanyMemoryStore } from '../../src/lib/server/memory/memory-store';
import { EpistemicClaimStore } from '../../src/lib/server/epistemic/claim-store';
import { ConversationStore } from '../../src/lib/server/conversation/store';

/** Collections wiped before seeding (all fixture-relevant surfaces). */
const RESET_COLLECTIONS = [
  'sophia_memories',
  'company_knowledge',
  'company_memories',
  'canonical_facts',
  'epistemic_claims',
  'epistemic_sources',
  'epistemic_signals',
  'epistemic_verifications',
  'company_state',
  'conversations',
  'chat_messages',
  'agent_runs',
  'audits',
  // M5.3-C — the derived dependency-relation index is durable in local mode;
  // the seed contract (wipe EVERY collection the universe depends on, so
  // consecutive runs are byte-deterministic) extends to it.
  'dependency_relations',
] as const;

export interface SeedResult {
  /** fixture evidence key → runtime record id (personal memories get uuid ids). */
  personalIdByKey: Map<string, string>;
  founderA: string;
  founderB: string;
}

/**
 * Step 1 + 2: wipe fixture-relevant durable state and write the CompanyState
 * seed. MUST run before any store singleton construction in the process.
 */
export function resetDurableState(): void {
  const fileStore = DurableFileStore.getInstance();
  for (const collection of RESET_COLLECTIONS) {
    fileStore.writeCollection(collection as string, {});
  }
  // CompanyState seed (the documented persistState shape) — written BEFORE
  // CompanyStateStore.getInstance() so the constructor hydrates the fixture.
  fileStore.writeCollection('company_state', {
    initiatives: STATE_INITIATIVES,
    products: [],
    customers: [],
    financialModel: STATE_FINANCIAL_MODEL,
    decisions: STATE_DECISIONS,
  });
}

/**
 * Seeds the full benchmark universe through the real store APIs.
 * Returns the runtime-id map used to score retrieval results.
 */
export async function seedBenchmarkUniverse(): Promise<SeedResult> {
  const personalIdByKey = new Map<string, string>();

  // -------------------------------------------------------------------------
  // Personal Mind (SophiaMemoryStore) — create all, then transition.
  // -------------------------------------------------------------------------
  const sophiaMemory = SophiaMemoryStore.getInstance();
  sophiaMemory.clearForTests();

  for (const spec of PERSONAL_MEMORIES) {
    const record = await sophiaMemory.createMemory({
      founderId: spec.founderId,
      memoryType: spec.memoryType,
      content: spec.content,
      provenance: spec.provenance,
      confidence: spec.confidence,
      lifecycleState: spec.birthState,
      active: spec.birthState === 'ACTIVE',
    });
    personalIdByKey.set(spec.evidenceKey, record.id);
  }

  // Founder-executed lifecycle transitions (the governed M4-B.1 path).
  for (const spec of PERSONAL_MEMORIES) {
    if (!spec.transition) continue;
    if (!personalIdByKey.has(spec.evidenceKey)) {
      throw new Error(`Seed bug: transition on unknown key ${spec.evidenceKey}`);
    }
    await sophiaMemory.updateMemory(spec.founderId, personalIdByKey.get(spec.evidenceKey)!, {
      lifecycleState: spec.transition.to,
      supersededByMemoryId:
        spec.transition.to === 'SUPERSEDED' && spec.transition.successorKey
          ? personalIdByKey.get(spec.transition.successorKey)!
          : undefined,
    });
  }

  // -------------------------------------------------------------------------
  // Company Knowledge — replace the entire collection with the fixture corpus.
  // (The canonical 8 seed SOPs are thereby excluded by design: the benchmark
  // measures retrieval MECHANICS over a known corpus, not production data.)
  // -------------------------------------------------------------------------
  const knowledge = CompanyKnowledgeStore.getInstance();
  await knowledge.setKnowledge(COMPANY_KNOWLEDGE);

  // -------------------------------------------------------------------------
  // Company Memory — historical precedent set.
  // -------------------------------------------------------------------------
  const precedent = CompanyMemoryStore.getInstance();
  await precedent.setMemories(COMPANY_MEMORIES);

  // -------------------------------------------------------------------------
  // Epistemic chain — sources → claims → facts, then the supersession event
  // through the real markFactSuperseded machinery.
  // -------------------------------------------------------------------------
  const epistemic = EpistemicClaimStore.getInstance();
  for (const source of EPISTEMIC_SOURCES) {
    await epistemic.saveSource(source);
  }
  for (const claim of EPISTEMIC_CLAIMS) {
    await epistemic.saveClaim(claim);
  }
  for (const fact of CANONICAL_FACTS) {
    await epistemic.saveFact(fact);
  }
  // The supersession event: FACT-OLD-01 was seeded active; the governed store
  // method flips it to 'superseded' with the successor pointer.
  await epistemic.markFactSuperseded('fact-lumora-price-29', 'fact-lumora-price-49');

  // -------------------------------------------------------------------------
  // Episodic record — a PAST conversation holding the abandonment rationale.
  // -------------------------------------------------------------------------
  const conversations = ConversationStore.getInstance();
  const conversation = await conversations.createConversation({
    id: EPISODIC_CONVERSATION.conversationId,
    founderId: EPISODIC_CONVERSATION.founderId,
    agentId: 'sophia',
    title: EPISODIC_CONVERSATION.title,
  });
  for (const message of EPISODIC_CONVERSATION.messages) {
    await conversations.saveMessage(
      {
        id: message.id,
        conversationId: conversation.id,
        sender: message.sender,
        role: message.sender === 'founder' ? 'user' : 'assistant',
        content: message.content,
        createdAt: message.createdAt,
      },
      EPISODIC_CONVERSATION.founderId
    );
  }

  return { personalIdByKey, founderA: FOUNDER_A, founderB: FOUNDER_B };
}

/**
 * Cross-founder access probe (founder-scope correctness, access-control leg).
 * Returns the observed outcome — the caller (harness) records it; it does not
 * throw on the expected 403 because that IS the correct behavior.
 */
export async function probeCrossFounderAccess(
  founderId: string,
  otherFounderMemoryId: string
): Promise<'BLOCKED_403' | 'ALLOWED'> {
  try {
    const store = SophiaMemoryStore.getInstance();
    await store.getMemory(founderId, otherFounderMemoryId);
    return 'ALLOWED';
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'SOPHIA_MEMORY_UNAUTHORIZED') return 'BLOCKED_403';
    throw err;
  }
}
