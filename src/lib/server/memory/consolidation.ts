/**
 * ============================================================================
 * MEMORY CONSOLIDATION ENGINE (G11.4 / M3)
 * ============================================================================
 * Consolidates episodic interaction history (conversations) into compact
 * semantic memory while preserving explicit provenance and evidence references.
 *
 * GOVERNANCE & ARCHITECTURAL INVARIANTS:
 * 1. Provenance Preservation:
 *    Every consolidated memory retains explicit linkage to its source
 *    conversation (`metadata.sourceConversationId`) and extraction timestamp.
 * 2. Cascading Deletion / Forgetting:
 *    When a source conversation is deleted or forgotten, derived semantic
 *    copies are purged so that no recall path returns ghost or derived copies.
 * 3. Personal Mind Isolation:
 *    Personal notes extracted from founder interactions stay strictly within
 *    the Founder's Personal Mind (`SophiaMemoryStore`). They never become
 *    unverified company truth.
 */

import { ConversationStore } from '../conversation/store';
import { SophiaMemoryStore, SophiaMemoryRecord } from '../sophia/personal-memory-store';

export interface ConsolidateConversationOptions {
  conversationId: string;
  founderId: string;
  targetType?: 'PERSONAL_CONTEXT_NOTE' | 'INTERACTION_PREFERENCE';
  summary?: string;
  confidence?: number;
}

export interface ConsolidationResult {
  success: boolean;
  memoryId?: string;
  record?: SophiaMemoryRecord;
  messageCount: number;
  reason?: string;
}

/**
 * Consolidates episodic turns from a conversation into a persistent semantic memory.
 */
export async function consolidateConversationToMemory(
  opts: ConsolidateConversationOptions
): Promise<ConsolidationResult> {
  const { conversationId, founderId } = opts;
  if (!conversationId?.trim() || !founderId?.trim()) {
    return { success: false, messageCount: 0, reason: 'conversationId and founderId are required' };
  }

  const convStore = ConversationStore.getInstance();
  const memoryStore = SophiaMemoryStore.getInstance();

  const messages = await convStore.getMessages(conversationId.trim(), founderId.trim());
  if (messages.length === 0) {
    return { success: false, messageCount: 0, reason: 'No messages found to consolidate' };
  }

  // Derive consolidated content: use provided summary or synthesize deterministic representation
  let content = opts.summary;
  if (!content) {
    const founderMessages = messages.filter((m) => m.sender === 'founder' || m.role === 'user');
    const highlights = founderMessages
      .map((m) => m.content?.trim())
      .filter(Boolean)
      .slice(-3);
    content = `Consolidated notes from conversation [${conversationId}]: ${highlights.join('; ')}`;
  }

  const turnIds = messages.map((m) => m.id);

  const memory = await memoryStore.createMemory({
    founderId: founderId.trim(),
    memoryType: opts.targetType ?? 'PERSONAL_CONTEXT_NOTE',
    content,
    confidence: opts.confidence ?? 0.9,
    lifecycleState: 'ACTIVE',
    metadata: {
      sourceConversationId: conversationId.trim(),
      sourceTurnIds: turnIds,
      consolidatedAt: new Date().toISOString(),
      derivedFrom: {
        type: 'conversation',
        id: conversationId.trim(),
        messageCount: messages.length,
      },
    },
  });

  return {
    success: true,
    memoryId: memory.id,
    record: memory,
    messageCount: messages.length,
  };
}

/**
 * Purges all derived semantic memories created from a given conversation.
 * Invoked during conversation deletion / forgetting drills to ensure no
 * derived copies remain in any store or recall path.
 */
export async function purgeDerivedMemoriesForConversation(
  conversationId: string,
  founderId: string
): Promise<number> {
  if (!conversationId?.trim() || !founderId?.trim()) return 0;
  const cleanConvId = conversationId.trim();
  const cleanFounderId = founderId.trim();

  const memoryStore = SophiaMemoryStore.getInstance();
  const allMemories = await memoryStore.listAllMemories(cleanFounderId);

  let purgedCount = 0;
  for (const memory of allMemories) {
    const derivedFrom = memory.metadata?.derivedFrom as { type?: string; id?: string } | undefined;
    const isDerived =
      memory.metadata?.sourceConversationId === cleanConvId ||
      derivedFrom?.id === cleanConvId ||
      memory.content?.includes(`[${cleanConvId}]`);

    if (isDerived) {
      await memoryStore.deleteMemory(cleanFounderId, memory.id);
      purgedCount++;
    }
  }

  return purgedCount;
}
