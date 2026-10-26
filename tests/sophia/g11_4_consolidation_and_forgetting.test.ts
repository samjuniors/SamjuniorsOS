/**
 * ============================================================================
 * G11.4: CONSOLIDATION AND FORGETTING TEST SUITE
 * ============================================================================
 *
 * SPECIFICATION & EXIT CRITERIA:
 * "Tests show superseded facts are not recalled as current; after deletion
 *  no recall path (index, summary, embedding) returns the item."
 *
 * VERIFICATION SCOPE:
 * 1. Contradiction and Supersession:
 *    - Epistemic facts: superseded facts are excluded from active fact queries
 *      and active context assembly.
 *    - Dependency relations: relations from superseded facts are marked stale.
 *    - Personal mind memories: superseded personal memories are excluded from
 *      active recall slices.
 * 2. Episodic into Semantic Consolidation:
 *    - Conversation turns are consolidated into persistent semantic memory
 *      with explicit source conversation and turn IDs preserved in metadata.
 *    - Context assembly recalls consolidated semantic memory with provenance.
 * 3. Deletion and Derived Copy Purging:
 *    - Fact deletion purges the fact and all derived dependency relations.
 *    - Conversation deletion purges conversation, messages, AND all derived
 *      consolidated semantic memories (zero derived ghost copies).
 *    - Personal memory deletion removes the item from all recall paths.
 *    - Company knowledge deletion removes the document from all query paths.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./db/custom.db';

import assert from 'assert';
import { executeSophiaTurn } from '../../src/lib/server/sophia/turn-executor';
import { SophiaContextAssembler } from '../../src/lib/server/sophia/context-assembly';
import { SophiaMemoryStore } from '../../src/lib/server/sophia/personal-memory-store';
import { ConversationStore } from '../../src/lib/server/conversation/store';
import { ConversationAdapterRegistry } from '../../src/lib/server/ai';
import { EpistemicClaimStore } from '../../src/lib/server/epistemic/claim-store';
import { CompanyKnowledgeStore } from '../../src/lib/server/knowledge/knowledge-store';
import { DependencyRelationStore } from '../../src/lib/server/retrieval/dependency-relation-store';
import {
  consolidateConversationToMemory,
  purgeDerivedMemoriesForConversation,
} from '../../src/lib/server/memory/consolidation';

import { CanonicalFact } from '../../src/types/epistemic';

function makeFact(partial: Partial<CanonicalFact> & { id: string }): CanonicalFact {
  return {
    claimId: partial.claimId ?? `claim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    statement: partial.statement ?? 'synthetic statement',
    subject: partial.subject ?? 'Billing',
    category: partial.category ?? 'operational',
    validityState: partial.validityState ?? 'active',
    confidence: 'verified_fact',
    promotedAt: partial.promotedAt ?? new Date().toISOString(),
    promotedBy: partial.promotedBy ?? 'founder',
    provenance: partial.provenance ?? ({ sourceSystem: 'test' } as any),
    supersededById: partial.supersededById,
    supersededAt: partial.supersededAt,
    ...partial,
  } as CanonicalFact;
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('STARTING G11.4 CONSOLIDATION AND FORGETTING TEST SUITE');
  console.log('======================================================\n');

  // Setup test environment: fake provider pinned for deterministic offline execution
  const registry = ConversationAdapterRegistry.getInstance();
  registry.setPin('fake');

  const testFounderId = `founder-g11-4-${Date.now()}`;
  const memoryStore = SophiaMemoryStore.getInstance();
  const claimStore = EpistemicClaimStore.getInstance();
  const knowledgeStore = CompanyKnowledgeStore.getInstance();
  const convStore = ConversationStore.getInstance();
  const relationStore = DependencyRelationStore.getInstance();

  // --------------------------------------------------------------------------
  // Group 1: Superseded Facts and Memories are NOT Recalled as Current
  // --------------------------------------------------------------------------
  console.log('--- Group 1: Superseded Facts and Memories are NOT Recalled as Current ---');

  const factIdA = `FACT-PAYMENT-V1-${Date.now()}`;
  const factIdB = `FACT-PAYMENT-V2-${Date.now()}`;

  await runTest('1.1. Active epistemic facts are stored and returned by default', async () => {
    await claimStore.saveFact(
      makeFact({
        id: factIdA,
        subject: 'Billing',
        statement: 'Billing uses Stripe v1 Engine',
        validityState: 'active',
      })
    );

    const activeFacts = await claimStore.listActiveFacts();
    const foundA = activeFacts.find((f) => f.id === factIdA);
    assert.ok(foundA, 'Fact A must be present in active facts list');
    assert.strictEqual(foundA?.statement, 'Billing uses Stripe v1 Engine');
  });

  await runTest('1.2. Superseded fact is excluded from active queries and active facts list', async () => {
    await claimStore.saveFact(
      makeFact({
        id: factIdB,
        subject: 'Billing',
        statement: 'Billing uses Adyen Unified Gateway',
        validityState: 'active',
      })
    );

    // Mark fact A superseded by fact B
    await claimStore.markFactSuperseded(factIdA, factIdB);

    // Verify active facts exclude fact A
    const activeFacts = await claimStore.listActiveFacts();
    assert.ok(!activeFacts.some((f) => f.id === factIdA), 'Fact A must NOT be in listActiveFacts');
    assert.ok(activeFacts.some((f) => f.id === factIdB), 'Fact B must be in listActiveFacts');

    // Verify queryFacts without includeSuperseded excludes fact A
    const queried = await claimStore.queryFacts({
      queryText: 'Billing provider',
      includeSuperseded: false,
    });
    assert.ok(!queried.some((f) => f.id === factIdA), 'Fact A must NOT be in queryFacts({ includeSuperseded: false })');
    assert.ok(queried.some((f) => f.id === factIdB), 'Fact B must be in queryFacts({ includeSuperseded: false })');

    // Verify queryFacts with includeSuperseded preserves fact A with superseded status
    const allQueried = await claimStore.queryFacts({
      queryText: 'Billing provider',
      includeSuperseded: true,
    });
    const supersededA = allQueried.find((f) => f.id === factIdA);
    assert.ok(supersededA, 'Fact A must be returned when includeSuperseded is true');
    assert.strictEqual(supersededA?.validityState, 'superseded');
    assert.strictEqual(supersededA?.supersededById, factIdB);

    // Verify readFacts
    const currentRead = await claimStore.readFacts({ mode: 'CURRENT' });
    assert.ok(!currentRead.some((f) => f.id === factIdA), 'Fact A must NOT be in readFacts CURRENT');
    assert.ok(currentRead.some((f) => f.id === factIdB), 'Fact B must be in readFacts CURRENT');

    const historicalRead = await claimStore.readFacts({ mode: 'HISTORICAL' });
    assert.ok(historicalRead.some((f) => f.id === factIdA), 'Fact A must be in readFacts HISTORICAL');
    assert.ok(historicalRead.some((f) => f.id === factIdB), 'Fact B must be in readFacts HISTORICAL');
  });

  await runTest('1.3. Dependency relations for superseded fact are marked stale', async () => {
    const factWithDep = makeFact({
      id: `FACT-DEP-${Date.now()}`,
      statement: 'BillingService depends on StripeGateway for payment processing.',
      subject: 'BillingService',
      validityState: 'active',
    });
    await claimStore.saveFact(factWithDep);
    await relationStore.maintainRelationsForFact(factWithDep);

    let activeRelations = await relationStore.listActiveRelations();
    const foundRel = activeRelations.find((r) => r.sourceFactId === factWithDep.id);
    assert.ok(foundRel, 'Relation must be extracted and active');

    // Call markRelationsStaleForFact
    await relationStore.markRelationsStaleForFact(factWithDep.id);

    activeRelations = await relationStore.listActiveRelations();
    const foundAfter = activeRelations.find((r) => r.sourceFactId === factWithDep.id);
    assert.strictEqual(foundAfter, undefined, 'Superseded fact relations must not be active');
  });

  await runTest('1.4. Context assembly renders ONLY active fact, never superseded fact as current', async () => {
    const context = await SophiaContextAssembler.assemble({
      message: 'What provider does Billing use?',
      founderId: testFounderId,
      scope: 'company_only',
    });

    const factSlice = context.slices.find((s) => s.authority === 'CANONICAL_FACT');
    assert.ok(factSlice, 'CANONICAL_FACT slice must be present');
    assert.ok(factSlice.content.includes('Adyen Unified Gateway'), 'Context must include active Fact B');
    assert.ok(!factSlice.content.includes('Stripe v1 Engine'), 'Context must NOT include superseded Fact A as current truth');
  });

  await runTest('1.5. Superseded personal memory is excluded from active recall', async () => {
    const mem1 = await memoryStore.createMemory({
      founderId: testFounderId,
      memoryType: 'INTERACTION_PREFERENCE',
      content: 'I prefer sencha green tea in the morning.',
      lifecycleState: 'ACTIVE',
    });

    const mem2 = await memoryStore.createMemory({
      founderId: testFounderId,
      memoryType: 'INTERACTION_PREFERENCE',
      content: 'I switched to cold brew coffee in the morning.',
      lifecycleState: 'ACTIVE',
    });

    // Mark mem1 as superseded by mem2
    await memoryStore.updateMemory(testFounderId, mem1.id, {
      lifecycleState: 'SUPERSEDED',
      supersededByMemoryId: mem2.id,
    });

    const activeMemories = await memoryStore.listMemories(testFounderId, { active: true });
    assert.ok(!activeMemories.some((m) => m.id === mem1.id), 'Superseded memory M1 must NOT be in active memories');
    assert.ok(activeMemories.some((m) => m.id === mem2.id), 'Active memory M2 must be in active memories');

    const context = await SophiaContextAssembler.assemble({
      message: 'What is my personal morning beverage preference?',
      founderId: testFounderId,
      scope: 'personal_only',
    });

    const memSlice = context.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    assert.ok(memSlice, 'PERSONAL_MIND_MEMORY slice must be present');
    assert.ok(memSlice.content.includes('cold brew coffee'), 'Context must include active memory M2');
    assert.ok(!memSlice.content.includes('sencha green tea'), 'Context must NOT include superseded memory M1');
  });

  // --------------------------------------------------------------------------
  // Group 2: Episodic into Semantic Consolidation
  // --------------------------------------------------------------------------
  console.log('\n--- Group 2: Episodic into Semantic Consolidation ---');

  const conversationId = `conv-consolidation-${Date.now()}`;
  let consolidatedMemoryId = '';

  await runTest('2.1. Store episodic conversation with multiple dialogue turns', async () => {
    await convStore.createConversation({
      founderId: testFounderId,
      id: conversationId,
      title: 'Architecture Guidelines Discussion',
      agentId: 'sophia',
    });

    await convStore.saveMessage(
      {
        conversationId,
        sender: 'founder',
        role: 'user',
        content: 'When writing TypeScript, always declare strict return types and never use any.',
      },
      testFounderId
    );

    await convStore.saveMessage(
      {
        conversationId,
        sender: 'assistant',
        role: 'assistant',
        content: 'Understood. I will enforce explicit strict return types and avoid any across all modules.',
      },
      testFounderId
    );

    const messages = await convStore.getMessages(conversationId, testFounderId);
    assert.strictEqual(messages.length, 2, 'Conversation must contain 2 episodic messages');
  });

  await runTest('2.2. Consolidate conversation dialogue into semantic personal memory with provenance', async () => {
    const res = await consolidateConversationToMemory({
      conversationId,
      founderId: testFounderId,
      targetType: 'PERSONAL_CONTEXT_NOTE',
      summary: 'Founder guideline: strictly require explicit return types and disallow any.',
    });

    assert.strictEqual(res.success, true, 'Consolidation must succeed');
    assert.ok(res.memoryId, 'Consolidation must return a memoryId');
    assert.strictEqual(res.messageCount, 2, 'Consolidated 2 messages');

    consolidatedMemoryId = res.memoryId!;
    const saved = await memoryStore.getMemory(testFounderId, consolidatedMemoryId);
    assert.ok(saved, 'Consolidated memory must exist in SophiaMemoryStore');
    assert.strictEqual(saved?.metadata?.sourceConversationId, conversationId, 'Must record source conversation ID');
    assert.strictEqual(saved?.metadata?.derivedFrom?.type, 'conversation', 'Must record derivedFrom.type');
    assert.strictEqual(saved?.metadata?.derivedFrom?.id, conversationId, 'Must record derivedFrom.id');
    assert.ok(Array.isArray(saved?.metadata?.sourceTurnIds), 'Must record sourceTurnIds array');
    assert.strictEqual(saved?.metadata?.sourceTurnIds.length, 2, 'Must record all 2 turn IDs');
  });

  await runTest('2.3. Assembled context recalls consolidated memory with sourceIds attached', async () => {
    const context = await SophiaContextAssembler.assemble({
      message: 'What is my personal guideline on TypeScript types?',
      founderId: testFounderId,
      scope: 'personal_only',
    });

    const memSlice = context.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    assert.ok(memSlice, 'PERSONAL_MIND_MEMORY slice must be recalled');
    assert.ok(memSlice.content.includes('strictly require explicit return types'), 'Slice must contain consolidated note');
    assert.ok(memSlice.sourceIds?.includes(consolidatedMemoryId), 'Slice must cite consolidatedMemoryId in sourceIds');
    assert.ok(context.sourceIds?.includes(consolidatedMemoryId), 'Aggregate context must cite consolidatedMemoryId');
  });

  // --------------------------------------------------------------------------
  // Group 3: Deletion that Removes Derived Copies (No Recall Path Returns Item)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 3: Deletion that Removes Derived Copies ---');

  await runTest('3.1. Fact deletion purges fact AND all derived dependency relations', async () => {
    const factToDeleteId = `FACT-PRUNE-${Date.now()}`;
    const factToDelete = makeFact({
      id: factToDeleteId,
      subject: 'TelemetryService',
      statement: 'TelemetryService depends on KafkaCluster for stream processing.',
      validityState: 'active',
    });
    await claimStore.saveFact(factToDelete);
    await relationStore.maintainRelationsForFact(factToDelete);

    // Verify relation exists
    let relations = await relationStore.listActiveRelations();
    assert.ok(relations.some((r) => r.sourceFactId === factToDeleteId), 'Derived relation must exist initially');

    // Delete fact
    const deleted = await claimStore.deleteFact(factToDeleteId);
    assert.strictEqual(deleted, true, 'deleteFact must return true');

    // Fact must not be in active facts
    const activeFacts = await claimStore.listActiveFacts();
    assert.ok(!activeFacts.some((f) => f.id === factToDeleteId), 'Deleted fact must not be in listActiveFacts');

    // Fact must not be in queryFacts
    const queried = await claimStore.queryFacts({
      queryText: 'Telemetry Kafka',
      includeSuperseded: true,
    });
    assert.ok(!queried.some((f) => f.id === factToDeleteId), 'Deleted fact must not be in queryFacts');

    // Fact must not be in readFacts
    const allHistorical = await claimStore.readFacts({ mode: 'HISTORICAL' });
    assert.ok(!allHistorical.some((f) => f.id === factToDeleteId), 'Deleted fact must not be in readFacts');

    // Derived relations must be purged
    relations = await relationStore.listActiveRelations();
    assert.ok(
      !relations.some((r) => r.sourceFactId === factToDeleteId),
      'All derived relations must be purged after fact deletion'
    );
  });

  await runTest('3.2. Conversation deletion purges conversation AND derived consolidated memories', async () => {
    // Verify consolidated memory exists before conversation deletion
    const beforeMem = await memoryStore.getMemory(testFounderId, consolidatedMemoryId);
    assert.ok(beforeMem, 'Consolidated memory must exist before conversation deletion');

    // Delete the source conversation
    const delResult = await convStore.deleteConversation(testFounderId, conversationId);
    assert.strictEqual(delResult.success, true, 'Conversation deletion must succeed');
    assert.strictEqual(delResult.deleted, true, 'Conversation must be deleted');

    // Verify conversation is gone
    const conv = await convStore.getConversation(testFounderId, conversationId);
    assert.strictEqual(conv, null, 'Deleted conversation must not exist');

    // Verify messages cannot be retrieved (conversation deleted/tombstoned)
    await assert.rejects(
      async () => convStore.getMessages(conversationId, testFounderId),
      /Conversation ".*" not found/
    );

    // CRITICAL: Verify derived consolidated memory was purged
    const afterMem = await memoryStore.getMemory(testFounderId, consolidatedMemoryId);
    assert.strictEqual(afterMem, null, 'Derived consolidated memory must be purged after conversation deletion');

    const allMemories = await memoryStore.listAllMemories(testFounderId);
    assert.ok(
      !allMemories.some((m) => m.id === consolidatedMemoryId),
      'Derived consolidated memory must not exist in listAllMemories'
    );

    // Verify context assembly no longer recalls the consolidated note
    const context = await SophiaContextAssembler.assemble({
      message: 'What is my personal guideline on TypeScript types?',
      founderId: testFounderId,
      scope: 'personal_only',
    });
    const memSlice = context.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    const hasNote = memSlice?.text?.includes('strictly require explicit return types') ?? false;
    assert.strictEqual(hasNote, false, 'Deleted derived memory must NOT be recalled in context');
  });

  await runTest('3.3. Personal memory explicit deletion removes memory from all recall paths', async () => {
    const mem = await memoryStore.createMemory({
      founderId: testFounderId,
      memoryType: 'PERSONAL_CONTEXT_NOTE',
      content: 'Temporary secret project: Project Orion.',
      lifecycleState: 'ACTIVE',
    });

    const deleted = await memoryStore.deleteMemory(testFounderId, mem.id);
    assert.strictEqual(deleted, true, 'deleteMemory must return true');

    const retrieved = await memoryStore.getMemory(testFounderId, mem.id);
    assert.strictEqual(retrieved, null, 'Deleted memory must return null');

    const activeList = await memoryStore.listMemories(testFounderId, { active: true });
    assert.ok(!activeList.some((m) => m.id === mem.id), 'Deleted memory must not be in active list');

    const allList = await memoryStore.listAllMemories(testFounderId);
    assert.ok(!allList.some((m) => m.id === mem.id), 'Deleted memory must not be in listAllMemories');

    // Verify context assembly does not return it
    const context = await SophiaContextAssembler.assemble({
      message: 'What is my secret project?',
      founderId: testFounderId,
      scope: 'personal_only',
    });
    const memSlice = context.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    const hasSecret = memSlice?.text?.includes('Project Orion') ?? false;
    assert.strictEqual(hasSecret, false, 'Deleted memory must not appear in assembled context');
  });

  await runTest('3.4. Company knowledge deletion removes document from all query and recall paths', async () => {
    const docId = `DOC-TEST-DEL-${Date.now()}`;
    await knowledgeStore.addKnowledge({
      id: docId,
      documentId: docId,
      title: 'Decommissioned Subsystem Guide',
      category: 'guide',
      content: `Guidelines for operating Legacy Service Gamma decommissioned today ${Date.now()}.`,
      summary: 'Legacy Service Gamma guide',
      tags: ['legacy', 'gamma'],
      lastUpdated: new Date().toISOString(),
    });

    const retrievedBefore = await knowledgeStore.getKnowledgeById(docId);
    assert.ok(retrievedBefore, 'Document must exist before deletion');

    // Delete knowledge document
    const deleted = await knowledgeStore.deleteKnowledge(docId);
    assert.strictEqual(deleted, true, 'deleteKnowledge must return true');

    // Document cannot be retrieved by ID
    const retrievedAfter = await knowledgeStore.getKnowledgeById(docId);
    assert.strictEqual(retrievedAfter, null, 'Deleted document must return null by ID');

    // Document cannot be found by query
    const results = await knowledgeStore.queryKnowledge({
      query: 'Legacy Service Gamma',
      limit: 5,
    });
    assert.ok(!results.some((r) => r.documentId === docId || r.id === docId), 'Deleted document must not appear in query results');

    // Context assembly must not include it
    const context = await SophiaContextAssembler.assemble({
      message: 'How do I operate Legacy Service Gamma?',
      founderId: testFounderId,
      scope: 'company_only',
    });
    const knowSlice = context.slices.find((s) => s.authority === 'COMPANY_KNOWLEDGE');
    const hasDoc = knowSlice?.text?.includes('Legacy Service Gamma') ?? false;
    assert.strictEqual(hasDoc, false, 'Deleted knowledge must NOT appear in assembled context');
  });

  console.log('\n======================================================');
  console.log('ALL G11.4 TESTS PASSED CLEANLY');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('[FATAL] Unhandled error during G11.4 test run:', err);
  process.exit(1);
});
