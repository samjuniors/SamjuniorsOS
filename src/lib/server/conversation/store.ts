import { randomUUID } from 'crypto';
import { DurableFileStore } from '../persistence/durable-file-store';
import { prisma, isDatabaseAvailable } from '../db/prisma';
import {
  ConversationRecord,
  ChatMessageRecord,
  CreateConversationParams,
  CreateChatMessageParams,
  ConversationHistoryItem,
} from './types';

export class ConversationSecurityError extends Error {
  public readonly code = 'CONVERSATION_UNAUTHORIZED';
  public readonly statusCode = 403;

  constructor(message: string) {
    super(`[ConversationSecurity] ${message}`);
    this.name = 'ConversationSecurityError';
  }
}

export class ConversationNotFoundError extends Error {
  public readonly code = 'CONVERSATION_NOT_FOUND';
  public readonly statusCode = 404;

  constructor(message: string) {
    super(`[ConversationStore] ${message}`);
    this.name = 'ConversationNotFoundError';
  }
}

const CONVERSATIONS_COLLECTION = 'conversations';
const CHAT_MESSAGES_COLLECTION = 'chat_messages';

/**
 * ============================================================================
 * SOPHIA CONVERSATION STORE (PHASE 3)
 * ============================================================================
 * Server-authoritative, durable conversation session and message store.
 * 
 * INVARIANTS:
 * 1. Founder Ownership: All conversations are bound to the authenticated Founder.
 *    Unauthorized access attempts FAIL CLOSED immediately.
 * 2. Process-Restart Durability: Uses atomic DurableFileStore + relational Prisma.
 * 3. Idempotent Turns: Deduplicates messages by conversationId + idempotencyKey.
 * 4. Bounded Context: Retrieves recent messages in chronological order for
 *    token-budgeted context assembly.
 * 5. Sanitized Storage: Does NOT store internal CoT, credentials, or prompts.
 */
export class ConversationStore {
  private static instance: ConversationStore;
  private fileStore: DurableFileStore;

  private constructor() {
    this.fileStore = DurableFileStore.getInstance();
  }

  public static getInstance(): ConversationStore {
    if (!ConversationStore.instance) {
      ConversationStore.instance = new ConversationStore();
    }
    return ConversationStore.instance;
  }

  /**
   * Resolves an existing conversation or creates a new one for the authenticated Founder.
   */
  public async getOrCreateConversation(params: {
    founderId: string;
    conversationId?: string;
    agentId?: string;
    title?: string;
  }): Promise<ConversationRecord> {
    const { founderId, conversationId, agentId, title } = params;

    if (!founderId) {
      throw new ConversationSecurityError('Authenticated founderId is required to access conversation.');
    }

    if (conversationId && conversationId.trim().length > 0) {
      const existing = await this.getConversation(founderId, conversationId.trim());
      if (existing) {
        return existing;
      }
      throw new ConversationNotFoundError(
        `Conversation "${conversationId.trim()}" not found for Founder "${founderId}".`
      );
    }

    // No conversationId provided -> create a new active conversation
    return this.createConversation({
      founderId,
      agentId: agentId || 'sophia',
      title: title || 'Executive Dialogue',
    });
  }

  /**
   * Creates a new conversation bound to the authenticated Founder.
   */
  public async createConversation(params: CreateConversationParams): Promise<ConversationRecord> {
    if (!params.founderId) {
      throw new ConversationSecurityError('Authenticated founderId is required.');
    }

    const now = new Date().toISOString();
    const id = params.id || `conv-${randomUUID()}`;

    const record: ConversationRecord = {
      id,
      founderId: params.founderId,
      title: params.title || 'Executive Dialogue',
      agentId: params.agentId || 'sophia',
      status: 'active',
      metadata: params.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    // 1. Atomic durable file write
    this.fileStore.saveItem(CONVERSATIONS_COLLECTION, id, record);

    // 2. Dual-write to Prisma if database is available
    try {
      if ((await isDatabaseAvailable()) && (prisma as any).conversation) {
        await (prisma as any).conversation.upsert({
          where: { id },
          create: {
            id,
            founderId: record.founderId,
            title: record.title,
            agentId: record.agentId,
            status: record.status,
            metadata: record.metadata,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
          update: {
            title: record.title,
            agentId: record.agentId,
            status: record.status,
            metadata: record.metadata,
            updatedAt: new Date(record.updatedAt),
          },
        });
      }
    } catch (err) {
      // Non-fatal if DB is offline or running under standalone sqlite/durable mode
    }

    return record;
  }

  /**
   * Retrieves a conversation, strictly validating ownership by the authenticated Founder.
   */
  public async getConversation(founderId: string, conversationId: string): Promise<ConversationRecord | null> {
    if (!founderId || !conversationId) return null;

    // 1. Try fileStore first (fast, atomic local cache)
    let record = this.fileStore.getItem<ConversationRecord>(CONVERSATIONS_COLLECTION, conversationId);

    // 2. If not found in fileStore, try Prisma if available
    if (!record) {
      try {
        if ((await isDatabaseAvailable()) && (prisma as any).conversation) {
          const dbRow = await (prisma as any).conversation.findUnique({
            where: { id: conversationId },
          });
          if (dbRow) {
            record = {
              id: dbRow.id,
              founderId: dbRow.founderId,
              title: dbRow.title || undefined,
              agentId: dbRow.agentId,
              status: dbRow.status as 'active' | 'archived',
              metadata: (dbRow.metadata as Record<string, any>) || {},
              createdAt: dbRow.createdAt.toISOString(),
              updatedAt: dbRow.updatedAt.toISOString(),
            };
            // Cache back to fileStore
            this.fileStore.saveItem(CONVERSATIONS_COLLECTION, record.id, record);
          }
        }
      } catch {
        // Fallback gracefully
      }
    }

    if (!record) return null;

    // SECURITY INVARIANT: Enforce ownership strictly. Fail closed if mismatched.
    if (record.founderId !== founderId) {
      throw new ConversationSecurityError(
        `Principal "${founderId}" is not authorized to access conversation "${conversationId}".`
      );
    }

    return record;
  }

  /**
   * Lists conversations belonging to the authenticated Founder.
   */
  public async listConversations(founderId: string, limit: number = 20): Promise<ConversationRecord[]> {
    if (!founderId) return [];

    const all = this.fileStore.readCollection<ConversationRecord>(CONVERSATIONS_COLLECTION);
    const founderConvs = Object.values(all)
      .filter((c) => c && c.founderId === founderId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);

    return founderConvs;
  }

  /**
   * Saves a chat message to the conversation, with deduplication / idempotency handling.
   */
  public async saveMessage(msg: CreateChatMessageParams, founderId: string): Promise<ChatMessageRecord> {
    const { conversationId, content, sender } = msg;

    if (!founderId) {
      throw new ConversationSecurityError('Authenticated founderId is required to save message.');
    }

    // Verify conversation exists and is owned by this founder
    const conversation = await this.getConversation(founderId, conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(`Conversation "${conversationId}" not found for this Founder.`);
    }

    // IDEMPOTENCY / DEDUPLICATION:
    // If an idempotencyKey is supplied, check if this message was already recorded
    if (msg.idempotencyKey && msg.idempotencyKey.trim().length > 0) {
      const existing = await this.findMessageByIdempotencyKey(conversationId, msg.idempotencyKey.trim());
      if (existing) {
        return existing;
      }
    }

    const now = msg.createdAt || new Date().toISOString();
    const id = msg.id || `msg-${randomUUID()}`;
    const role = msg.role || (sender === 'founder' ? 'user' : sender === 'assistant' ? 'assistant' : 'system');

    const record: ChatMessageRecord = {
      id,
      conversationId,
      sender,
      role,
      content,
      intent: msg.intent,
      confidence: msg.confidence,
      commandType: msg.commandType,
      idempotencyKey: msg.idempotencyKey,
      metadata: msg.metadata || {},
      createdAt: now,
    };

    // 1. Atomic durable file write
    this.fileStore.saveItem(CHAT_MESSAGES_COLLECTION, id, record);

    // Update conversation timestamp
    conversation.updatedAt = now;
    this.fileStore.saveItem(CONVERSATIONS_COLLECTION, conversationId, conversation);

    // 2. Dual-write to Prisma if database is available
    try {
      if ((await isDatabaseAvailable()) && (prisma as any).chatMessage) {
        await (prisma as any).chatMessage.upsert({
          where: { id },
          create: {
            id,
            conversationId: record.conversationId,
            sender: record.sender,
            role: record.role,
            content: record.content,
            intent: record.intent,
            confidence: record.confidence,
            commandType: record.commandType,
            idempotencyKey: record.idempotencyKey,
            metadata: record.metadata,
            createdAt: new Date(record.createdAt),
          },
          update: {
            content: record.content,
            intent: record.intent,
            confidence: record.confidence,
            commandType: record.commandType,
            metadata: record.metadata,
          },
        });
      }
    } catch {
      // Non-fatal if DB is offline
    }

    return record;
  }

  /**
   * Retrieves recent conversation history in chronological order, bounded for context assembly.
   */
  public async getRecentHistory(
    conversationId: string,
    founderId: string,
    limitMessages: number = 10
  ): Promise<ConversationHistoryItem[]> {
    const messages = await this.getMessages(conversationId, founderId, limitMessages);

    return messages.map((m) => ({
      sender: m.sender === 'founder' || m.role === 'user' ? 'founder' : 'assistant',
      text: m.content,
      messageId: m.id,
      createdAt: m.createdAt,
    }));
  }

  /**
   * Retrieves all messages for a conversation in chronological order, strictly verifying ownership.
   */
  public async getMessages(
    conversationId: string,
    founderId: string,
    limit?: number
  ): Promise<ChatMessageRecord[]> {
    // Ownership check (throws 403 if unauthorized)
    const conversation = await this.getConversation(founderId, conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(`Conversation "${conversationId}" not found.`);
    }

    const all = this.fileStore.readCollection<ChatMessageRecord>(CHAT_MESSAGES_COLLECTION);
    const convMsgs = Object.values(all)
      .filter((m) => m && m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (limit && limit > 0) {
      // Take the most recent `limit` messages in chronological order
      return convMsgs.slice(-limit);
    }

    return convMsgs;
  }

  /**
   * Looks up a message by its idempotency key within a conversation.
   */
  public async findMessageByIdempotencyKey(
    conversationId: string,
    idempotencyKey: string
  ): Promise<ChatMessageRecord | null> {
    const all = this.fileStore.readCollection<ChatMessageRecord>(CHAT_MESSAGES_COLLECTION);
    for (const msg of Object.values(all)) {
      if (msg && msg.conversationId === conversationId && msg.idempotencyKey === idempotencyKey) {
        return msg;
      }
    }
    return null;
  }

  /**
   * Helper for tests: clears conversation collections.
   */
  public clearForTests(): void {
    this.fileStore.writeCollection(CONVERSATIONS_COLLECTION, {});
    this.fileStore.writeCollection(CHAT_MESSAGES_COLLECTION, {});
  }
}
