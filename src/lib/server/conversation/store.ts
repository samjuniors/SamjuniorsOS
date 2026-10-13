import { randomUUID } from 'crypto';
import { DurableFileStore } from '../persistence/durable-file-store';
import { prisma, isDatabaseAvailable } from '../db/prisma';
import { extractTokens } from '../knowledge/knowledge-store';
import { foldPersonalMindToken } from '../sophia/context-assembly';
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

export class MessageTombstonedError extends Error {
  public readonly code = 'MESSAGE_TOMBSTONED';
  public readonly statusCode = 409;

  constructor(message: string) {
    super(`[ConversationStore] ${message}`);
    this.name = 'MessageTombstonedError';
  }
}

export const CONVERSATIONS_COLLECTION = 'conversations';
export const CHAT_MESSAGES_COLLECTION = 'chat_messages';
export const CONVERSATION_TOMBSTONES_COLLECTION = 'conversation_tombstones';
export const MESSAGE_TOMBSTONES_COLLECTION = 'message_tombstones';

/** Durable anti-resurrection tombstone for deleted conversations. */
export interface ConversationTombstone {
  id: string; // conversationId
  founderId: string;
  deletedAt: string;
  purgedMessageCount: number;
  prismaReconciled: boolean;
}

/** Durable anti-replay tombstone for deleted individual messages. */
export interface MessageTombstone {
  id: string; // messageId
  conversationId: string;
  founderId: string;
  idempotencyKey?: string;
  deletedAt: string;
}

/**
 * Checks whether an error from Prisma represents a confirmed already-absent record
 * (P2025: Record to delete does not exist) versus a genuine connection error or timeout.
 *
 * GOVERNANCE RULES:
 * 1. P2025 represents a confirmed absent record -> true.
 * 2. Connection errors (P1001, P1002, ETIMEDOUT, ECONNREFUSED) must remain pending -> false.
 * 3. Database configuration errors (P1003) must remain pending -> false.
 * 4. Generic phrases like "does not exist" (e.g. table/database does not exist) must NOT
 *    be treated as record absence -> false.
 */
export function isPrismaRecordNotFoundError(err: any): boolean {
  // Only Prisma's canonical P2025 code proves that the targeted record is absent.
  // Message text is not a stable contract and can describe missing tables/databases.
  return Boolean(err && typeof err === 'object' && err.code === 'P2025');
}

export interface ReconcileResult {
  reconciledPrismaCount: number;
  cleanedLocalCount: number;
  pendingPrismaCount: number;
  failedLocalCount: number;
  success: boolean;
  errors?: string[];
}

export interface DeleteConversationResult {
  success: boolean;
  deleted: boolean;
  alreadyDeleted?: boolean;
  notFound?: boolean;
  conversationId: string;
  purgedMessageCount?: number;
}

export interface DeleteMessageResult {
  success: boolean;
  deleted: boolean;
  alreadyDeleted?: boolean;
  notFound?: boolean;
  conversationId: string;
  messageId: string;
}

/** One scored episodic search hit (M5.2): a past conversation + matched messages. */
export interface ConversationSearchHit {
  conversationId: string;
  title?: string;
  updatedAt: string;
  /** Sum of per-message distinct-token scores (deterministic). */
  score: number;
  /** Highest-scoring messages, re-sorted chronologically for rendering. */
  matchedMessages: ChatMessageRecord[];
}

/**
 * ============================================================================
 * SOPHIA CONVERSATION STORE (PHASE 3 — M3 K-1 canonical conversation authority)
 * ============================================================================
 * Server-authoritative, durable conversation session and message store.
 * This class is the SINGLE canonical conversation authority for every Sophia
 * ingress (OS chat, SOFIA typed surface, live voice) — there is no second
 * conversation system (M3 K-1 convergence, commit 3da24b4).
 *
 * AUTHORITY SEMANTICS (M3 hardening review — precise, per method):
 *
 *   [canonical abstraction]  This class IS the canonical conversation
 *                            abstraction. Callers never read/write
 *                            `.data` or Prisma conversation tables directly.
 *
 *   [current local persistence — AUTHORITATIVE TODAY]
 *                            DurableFileStore collections
 *                            (`.data/conversations.json`,
 *                            `.data/chat_messages.json`) are the primary
 *                            write target and the authoritative read source:
 *                              - listConversations()          reads file only
 *                              - getMessages()/getRecentHistory()
 *                                                             read file only
 *                              - findMessageByIdempotencyKey() reads file only
 *                                (the turn-idempotency gate is file-backed)
 *
 *   [current Prisma dual-write — opportunistic mirror, NOT authoritative]
 *                            createConversation()/saveMessage() upsert to the
 *                            Prisma Conversation/ChatMessage tables best-effort
 *                            AFTER the durable file write; errors are
 *                            swallowed (never blocks dialogue). Read fallback
 *                            exists ONLY in getConversation(): on a file miss
 *                            it tries Prisma and caches the row back into the
 *                            file store. Prisma message rows are otherwise
 *                            write-only shadows (ADR 0002 §7, reconciliation
 *                            report row 10).
 *
 *   [authoritative mode]     THIS STORE HAS NONE. Unlike CompanyKnowledgeStore
 *                            it never consults db/authority
 *                            (isAuthoritativeMode/requireAuthoritativeDatabase):
 *                            the same local-style semantics (file primary,
 *                            Prisma best-effort, swallowed dual-write errors)
 *                            apply in every DATABASE_MODE, including
 *                            production/authoritative.
 *
 *   [target architecture]    M6: Prisma (PostgreSQL) becomes the authoritative
 *                            store with fail-closed semantics and query-shaped
 *                            reads (see ADR 0002 §7 milestone and the
 *                            reconciliation report migration plan H). Until
 *                            then, Prisma must NOT be claimed as authoritative
 *                            for conversations.
 *
 * INVARIANTS:
 * 1. Founder Ownership: All conversations are bound to the authenticated Founder.
 *    Unauthorized access attempts FAIL CLOSED immediately (403, never a
 *    silent fork — see turn-executor for the provisioning behavior).
 * 2. Process-Restart Durability: atomic DurableFileStore writes + best-effort
 *    Prisma dual-write (see AUTHORITY SEMANTICS above for which layer wins).
 * 3. Idempotent Turns: Deduplicates messages by conversationId + idempotencyKey.
 * 4. Bounded Context: Retrieves recent messages in chronological order for
 *    token-budgeted context assembly.
 * 5. Sanitized Storage: Does NOT store internal CoT, credentials, or prompts.
 */
export class ConversationStore {
  private static instance: ConversationStore;
  private fileStore: DurableFileStore;
  private dbAvailableOverride: boolean | null = null;

  private constructor() {
    this.fileStore = DurableFileStore.getInstance();
  }

  public static getInstance(): ConversationStore {
    if (!ConversationStore.instance) {
      ConversationStore.instance = new ConversationStore();
    }
    return ConversationStore.instance;
  }

  /** Allows test suites to inject database availability without relying on ambient SQLite files. */
  public setDatabaseAvailableForTests(available: boolean | null): void {
    this.dbAvailableOverride = available;
  }

  private async isDbAvailable(): Promise<boolean> {
    if (this.dbAvailableOverride !== null) return this.dbAvailableOverride;
    return isDatabaseAvailable();
  }

  /**
   * Resolves an existing conversation or creates a new one for the authenticated Founder.
   *
   * Authority semantics (pinned by tests/sophia/m3_authority_hardening.test.ts):
   * - conversationId supplied (non-empty after trim) but NOT FOUND
   *     → throws ConversationNotFoundError. This store NEVER auto-creates
   *       under a caller-supplied id (ADR 0002 §7: phantom conversations
   *       are never silently created). The fresh-conversation fallback for
   *       unknown ids lives in executeSophiaTurn (turn executor) — a
   *       deliberate availability choice for the voice/typed surfaces,
   *       documented there as a known issue.
   * - conversationId absent or whitespace-only → creates a new conversation.
   * - conversationId found but owned by another founder → the underlying
   *   getConversation() ownership check FAILS CLOSED (403) before any
   *   creation path can run.
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

    // ANTI-RECREATION SHIELD: Prevent active in-flight requests or retries from recreating a tombstoned conversation
    if (this.isTombstoned(id)) {
      throw new ConversationSecurityError(
        `Cannot create conversation "${id}" because it has been permanently deleted.`
      );
    }

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
      if ((await this.isDbAvailable()) && (prisma as any).conversation) {
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
   *
   * Read source: DurableFileStore first; on a file miss, Prisma fallback
   * (best-effort, swallowed errors) with cache-back into the file store.
   * This is the ONLY method in this store with a Prisma read fallback.
   */
  public async getConversation(founderId: string, conversationId: string): Promise<ConversationRecord | null> {
    if (!founderId || !conversationId) return null;

    // ANTI-RESURRECTION SHIELD:
    // If this conversation was deleted (tombstoned), return null immediately.
    // Strictly bypasses the Prisma read fallback, preventing a failed mirror deletion
    // or point-in-time database restore from resurrecting a deleted conversation.
    if (this.isTombstoned(conversationId)) {
      return null;
    }

    // 1. Try fileStore first (fast, atomic local cache)
    let record = this.fileStore.getItem<ConversationRecord>(CONVERSATIONS_COLLECTION, conversationId);

    // 2. If not found in fileStore, try Prisma if available
    if (!record) {
      try {
        if ((await this.isDbAvailable()) && (prisma as any).conversation) {
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
   *
   * Read source: DurableFileStore ONLY (no Prisma fallback). A conversation
   * that exists solely as a Prisma row (durable file wiped) is invisible
   * here — current persistence contract, pinned by the M3 hardening suite;
   * changes when the M6 authoritative migration lands.
   */
  public async listConversations(founderId: string, limit: number = 20): Promise<ConversationRecord[]> {
    if (!founderId) return [];

    const all = this.fileStore.readCollection<ConversationRecord>(CONVERSATIONS_COLLECTION);
    const founderConvs = Object.values(all)
      .filter((c) => c && c.founderId === founderId && !this.isTombstoned(c.id))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);

    return founderConvs;
  }

  /**
   * Saves a chat message to the conversation, with deduplication / idempotency handling,
   * serialized on the CHAT_MESSAGES_COLLECTION lock (Fail-Closed, no race against deletion).
   */
  public async saveMessage(
    msg: CreateChatMessageParams,
    founderId: string,
    options?: { lockTimeoutMs?: number }
  ): Promise<ChatMessageRecord> {
    const { conversationId, content, sender } = msg;

    if (!founderId) {
      throw new ConversationSecurityError('Authenticated founderId is required to save message.');
    }

    // Verify conversation exists and is owned by this founder
    const conversation = await this.getConversation(founderId, conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(`Conversation "${conversationId}" not found for this Founder.`);
    }

    const now = msg.createdAt || new Date().toISOString();
    const id = msg.id || `msg-${randomUUID()}`;
    const role = msg.role || (sender === 'founder' ? 'user' : sender === 'assistant' ? 'assistant' : 'system');
    const trimmedIdempotencyKey = msg.idempotencyKey?.trim() || undefined;

    // Check anti-replay tombstones (outside lock fast-path check)
    if (this.isMessageTombstoned(id)) {
      const tombstone = this.getMessageTombstone(id);
      if (tombstone && tombstone.founderId !== founderId) {
        throw new ConversationSecurityError(`Principal "${founderId}" is not authorized for message "${id}".`);
      }
      throw new MessageTombstonedError(
        `Cannot save message "${id}" because it has been permanently deleted.`
      );
    }

    if (trimmedIdempotencyKey) {
      const keyTombstone = this.findMessageTombstoneByIdempotencyKey(conversationId, trimmedIdempotencyKey);
      if (keyTombstone) {
        if (keyTombstone.founderId !== founderId) {
          throw new ConversationSecurityError(
            `Principal "${founderId}" is not authorized to replay idempotency key in conversation "${conversationId}".`
          );
        }
        throw new MessageTombstonedError(
          `Cannot replay idempotency key "${trimmedIdempotencyKey}" in conversation "${conversationId}" because the associated message was permanently deleted.`
        );
      }
    }

    const record: ChatMessageRecord = {
      id,
      conversationId,
      sender,
      role,
      content,
      intent: msg.intent,
      confidence: msg.confidence,
      commandType: msg.commandType,
      idempotencyKey: trimmedIdempotencyKey,
      metadata: msg.metadata || {},
      createdAt: now,
    };

    // CRITICAL SECTION: Serialized on CHAT_MESSAGES_COLLECTION lock (Fail-Closed)
    // Synchronous execution: no await inside withCollectionLockStrict!
    const writtenRecord = this.fileStore.withCollectionLockStrict(
      CHAT_MESSAGES_COLLECTION,
      () => {
      // 1. Recheck conversation tombstone inside critical section immediately before writing
      if (this.isTombstoned(conversationId)) {
        throw new ConversationSecurityError(
          `Cannot save message to conversation "${conversationId}" because it has been permanently deleted.`
        );
      }

      // 2. Recheck parent conversation still exists in local file store
      const currentConv = this.fileStore.getItem<ConversationRecord>(CONVERSATIONS_COLLECTION, conversationId);
      if (!currentConv) {
        throw new ConversationNotFoundError(`Conversation "${conversationId}" not found for this Founder.`);
      }

      // 3. Recheck message tombstone inside critical section
      if (this.isMessageTombstoned(id)) {
        const tombstone = this.getMessageTombstone(id);
        if (tombstone && tombstone.founderId !== founderId) {
          throw new ConversationSecurityError(`Principal "${founderId}" is not authorized for message "${id}".`);
        }
        throw new MessageTombstonedError(
          `Cannot save message "${id}" because it has been permanently deleted.`
        );
      }

      // 4. Recheck idempotency key tombstone inside critical section
      if (trimmedIdempotencyKey) {
        const keyTombstone = this.findMessageTombstoneByIdempotencyKey(conversationId, trimmedIdempotencyKey);
        if (keyTombstone) {
          if (keyTombstone.founderId !== founderId) {
            throw new ConversationSecurityError(
              `Principal "${founderId}" is not authorized to replay idempotency key in conversation "${conversationId}".`
            );
          }
          throw new MessageTombstonedError(
            `Cannot replay idempotency key "${trimmedIdempotencyKey}" in conversation "${conversationId}" because the associated message was permanently deleted.`
          );
        }
      }

      // 5. Deduplication check on existing messages
      const allMessages = this.fileStore.readCollection<ChatMessageRecord>(CHAT_MESSAGES_COLLECTION);
      if (allMessages[id]) {
        return allMessages[id];
      }
      if (trimmedIdempotencyKey) {
        for (const existingMsg of Object.values(allMessages)) {
          if (
            existingMsg &&
            existingMsg.conversationId === conversationId &&
            existingMsg.idempotencyKey === trimmedIdempotencyKey
          ) {
            return existingMsg;
          }
        }
      }

      // 6. Write message strictly under lock
      allMessages[id] = record;
      this.fileStore.writeCollectionStrict(CHAT_MESSAGES_COLLECTION, allMessages);

      // 7. Update parent conversation timestamp
      currentConv.updatedAt = now;
      this.fileStore.saveItem(CONVERSATIONS_COLLECTION, conversationId, currentConv);

      return record;
    }, options?.lockTimeoutMs);

    // 2. Dual-write to Prisma if database is available (opportunistic mirror, non-blocking)
    try {
      if ((await this.isDbAvailable()) && (prisma as any).chatMessage) {
        await (prisma as any).chatMessage.upsert({
          where: { id: writtenRecord.id },
          create: {
            id: writtenRecord.id,
            conversationId: writtenRecord.conversationId,
            sender: writtenRecord.sender,
            role: writtenRecord.role,
            content: writtenRecord.content,
            intent: writtenRecord.intent,
            confidence: writtenRecord.confidence,
            commandType: writtenRecord.commandType,
            idempotencyKey: writtenRecord.idempotencyKey,
            metadata: writtenRecord.metadata,
            createdAt: new Date(writtenRecord.createdAt),
          },
          update: {
            content: writtenRecord.content,
            intent: writtenRecord.intent,
            confidence: writtenRecord.confidence,
            commandType: writtenRecord.commandType,
            metadata: writtenRecord.metadata,
          },
        });
      }
    } catch {
      // Non-fatal if DB is offline
    }

    return writtenRecord;
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
      id: m.id,
      createdAt: m.createdAt,
    }));
  }

  /**
   * Retrieves all messages for a conversation in chronological order, strictly verifying ownership.
   *
   * Read source: DurableFileStore ONLY (no Prisma fallback) — Prisma
   * ChatMessage rows are write-only shadows of the canonical file records
   * (ADR 0002 §7, reconciliation report row 10). Pinned by the M3 hardening
   * suite; changes at the M6 authoritative migration.
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
   *
   * Read source: DurableFileStore ONLY. The turn-idempotency gate is
   * file-backed by design in the current deployment (local mode authority);
   * M6 moves it to the authoritative database.
   */
  public async findMessageByIdempotencyKey(
    conversationId: string,
    idempotencyKey: string
  ): Promise<ChatMessageRecord | null> {
    if (this.isTombstoned(conversationId)) {
      return null;
    }
    const all = this.fileStore.readCollection<ChatMessageRecord>(CHAT_MESSAGES_COLLECTION);
    for (const msg of Object.values(all)) {
      if (msg && msg.conversationId === conversationId && msg.idempotencyKey === idempotencyKey) {
        return msg;
      }
    }
    return null;
  }

  // ===========================================================================
  // M5.2 — EPISODIC RETRIEVAL PROJECTION (founder-scoped past-conversation
  // search over THIS canonical store — no second conversation database)
  // ===========================================================================

  /**
   * M5.2 — deterministic, founder-scoped lexical search over PAST
   * conversations (the episodic retrieval surface M5.1 measured as missing).
   *
   * CONTRACT:
   *  - FOUNDER SCOPING: candidates come from listConversations(founderId) —
   *    the same founder-owned read every other method uses. Another
   *    founder's conversations can never enter the result (the ownership
   *    check this store enforces elsewhere is structural here: the candidate
   *    set itself is founder-filtered before any scoring).
   *  - DETERMINISTIC SCORING: the shared extractTokens pipeline plus the
   *    M4-D light suffix fold applied SYMMETRICALLY to query and message
   *    tokens (so "abandon" matches "abandoning"), counted as DISTINCT
   *    folded query tokens present in each message. Conversation score =
   *    sum of per-message scores; rank: score DESC, updatedAt DESC, id ASC.
   *  - CONVERSATION BOUNDARIES PRESERVED: results carry the conversation id,
   *    title, and the matched messages in chronological order — the caller
   *    renders them as clearly labeled episodic (advisory) context.
   *  - NEVER COMPANY TRUTH: this store returns interaction records only;
   *    promoting any part of a conversation into company knowledge remains
   *    an explicit governed action elsewhere (epistemic pipeline / founder).
   *
   * Read source: DurableFileStore ONLY (same authority contract as
   * listConversations/getMessages).
   */
  public async searchConversations(
    founderId: string,
    queryText: string,
    limitConversations: number = 3,
    maxMatchedMessages: number = 4
  ): Promise<ConversationSearchHit[]> {
    if (!founderId) return [];

    const queryTokens = new Set(extractTokens(queryText).map(foldPersonalMindToken));
    if (queryTokens.size === 0) return [];

    const conversations = await this.listConversations(founderId, 20);
    const allMessages = Object.values(
      this.fileStore.readCollection<ChatMessageRecord>(CHAT_MESSAGES_COLLECTION)
    );

    const hits: ConversationSearchHit[] = [];
    for (const conversation of conversations) {
      const convMessages = allMessages
        .filter((m) => m && m.conversationId === conversation.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const scored = convMessages.map((m) => {
        const messageTokens = new Set(extractTokens(m.content).map(foldPersonalMindToken));
        let score = 0;
        for (const token of queryTokens) {
          if (messageTokens.has(token)) score++;
        }
        return { message: m, score };
      });

      const conversationScore = scored.reduce((sum, entry) => sum + entry.score, 0);
      if (conversationScore <= 0) continue;

      const matched = scored
        .filter((entry) => entry.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return new Date(a.message.createdAt).getTime() - new Date(b.message.createdAt).getTime();
        })
        .slice(0, Math.max(1, maxMatchedMessages))
        .map((entry) => entry.message)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      hits.push({
        conversationId: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        score: conversationScore,
        matchedMessages: matched,
      });
    }

    hits.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = new Date(a.updatedAt).getTime();
      const tb = new Date(b.updatedAt).getTime();
      if (tb !== ta) return tb - ta;
      return a.conversationId < b.conversationId ? -1 : 1;
    });

    return hits.slice(0, Math.max(1, limitConversations));
  }

  // ===========================================================================
  // M1 BATCH 2 — FOUNDER-CONTROLLED CONVERSATION & MESSAGE DELETION
  // (With write-ahead tombstone and deferred Prisma mirror reconciliation)
  // ===========================================================================

  /**
   * Checks whether a conversation ID has a durable deletion tombstone.
   */
  public isTombstoned(conversationId: string): boolean {
    if (!conversationId) return false;
    const tombstone = this.fileStore.getItem<ConversationTombstone>(
      CONVERSATION_TOMBSTONES_COLLECTION,
      conversationId
    );
    return tombstone !== null;
  }

  /**
   * Retrieves the durable deletion tombstone for a conversation, if one exists.
   */
  public getTombstone(conversationId: string): ConversationTombstone | null {
    if (!conversationId) return null;
    return this.fileStore.getItem<ConversationTombstone>(
      CONVERSATION_TOMBSTONES_COLLECTION,
      conversationId
    );
  }

  /**
   * Checks whether a message ID has a durable deletion tombstone.
   */
  public isMessageTombstoned(messageId: string): boolean {
    if (!messageId) return false;
    const tombstone = this.fileStore.getItem<MessageTombstone>(
      MESSAGE_TOMBSTONES_COLLECTION,
      messageId
    );
    return tombstone !== null;
  }

  /**
   * Retrieves the durable deletion tombstone for an individual message, if one exists.
   */
  public getMessageTombstone(messageId: string): MessageTombstone | null {
    if (!messageId) return null;
    return this.fileStore.getItem<MessageTombstone>(
      MESSAGE_TOMBSTONES_COLLECTION,
      messageId
    );
  }

  /**
   * Looks up a message deletion tombstone by idempotency key within a conversation.
   */
  public findMessageTombstoneByIdempotencyKey(
    conversationId: string,
    idempotencyKey: string
  ): MessageTombstone | null {
    if (!conversationId || !idempotencyKey) return null;
    const tombstones = this.fileStore.readCollection<MessageTombstone>(MESSAGE_TOMBSTONES_COLLECTION);
    for (const t of Object.values(tombstones)) {
      if (t && t.conversationId === conversationId && t.idempotencyKey === idempotencyKey) {
        return t;
      }
    }
    return null;
  }

  /**
   * Reconciles pending Prisma mirror deletions and cleans any local file orphans
   * from interrupted cascades across all tombstoned conversations.
   * Can be triggered by an operator script or during background maintenance.
   *
   * FAILURE & RECONCILIATION INTEGRITY:
   * Only genuine deletions and confirmed already-absent records (P2025) are recorded
   * as reconciled. Database outages, timeouts, and connection errors leave tombstones
   * pending (`prismaReconciled: false`) for retry on subsequent passes.
   */
  /**
   * Reconciles pending Prisma mirror deletions and cleans any local file orphans
   * from interrupted cascades across all tombstoned conversations.
   * Can be triggered by an operator script or during background maintenance.
   *
   * FAILURE & RECONCILIATION INTEGRITY:
   * Only genuine deletions and confirmed already-absent records (P2025) are recorded
   * as reconciled. Database outages, timeouts, and connection errors leave tombstones
   * pending (`prismaReconciled: false`) for retry on subsequent passes.
   */
  public async reconcileAllTombstones(): Promise<ReconcileResult> {
    let prismaCount = 0;
    let localCount = 0;
    let failedLocalCount = 0;
    const errors: string[] = [];

    const tombstones = this.fileStore.readCollection<ConversationTombstone>(
      CONVERSATION_TOMBSTONES_COLLECTION
    );

    // 1. Clean any lingering local file records for tombstoned conversations
    for (const [id] of Object.entries(tombstones)) {
      try {
        const lingering = this.fileStore.getItem<ConversationRecord>(CONVERSATIONS_COLLECTION, id);
        if (lingering) {
          const deleted = this.fileStore.deleteItemStrict(CONVERSATIONS_COLLECTION, id, { lockStrict: true });
          if (deleted) {
            localCount++;
          }
        }
      } catch (err: any) {
        failedLocalCount++;
        errors.push(`Failed to clean lingering conversation "${id}": ${err.message || String(err)}`);
      }
    }

    // 1b. Clean any lingering chat messages belonging to tombstoned conversations under strict lock
    try {
      this.fileStore.withCollectionLockStrict(CHAT_MESSAGES_COLLECTION, () => {
        const allMessages = this.fileStore.readCollection<ChatMessageRecord>(CHAT_MESSAGES_COLLECTION);
        let cleaned = false;
        const filtered: Record<string, ChatMessageRecord> = {};
        for (const [msgId, msg] of Object.entries(allMessages)) {
          if (msg && tombstones[msg.conversationId]) {
            cleaned = true;
            localCount++;
          } else if (msg) {
            filtered[msgId] = msg;
          }
        }
        if (cleaned) {
          this.fileStore.writeCollectionStrict(CHAT_MESSAGES_COLLECTION, filtered, { lockStrict: true });
        }
      });
    } catch (err: any) {
      failedLocalCount++;
      errors.push(`Failed to sweep lingering chat messages under lock: ${err.message || String(err)}`);
    }

    // 2. Reconcile Prisma mirrors
    let dbAvailable = false;
    try {
      dbAvailable = await this.isDbAvailable();
    } catch (err: any) {
      errors.push(`Failed to inspect database availability: ${err.message || String(err)}`);
    }

    if (dbAvailable && (prisma as any).conversation) {
      for (const [id, tombstone] of Object.entries(tombstones)) {
        if (tombstone && !tombstone.prismaReconciled) {
          let reconciled = false;
          try {
            await (prisma as any).conversation.delete({ where: { id } });
            reconciled = true;
          } catch (err: any) {
            if (isPrismaRecordNotFoundError(err)) {
              reconciled = true; // Confirmed already-absent
            } else {
              errors.push(`Prisma deletion for tombstone "${id}" failed: ${err.message || String(err)}`);
            }
          }

          if (reconciled) {
            try {
              tombstone.prismaReconciled = true;
              this.fileStore.saveItemStrict(CONVERSATION_TOMBSTONES_COLLECTION, id, tombstone, { lockStrict: true });
              prismaCount++;
            } catch (err: any) {
              tombstone.prismaReconciled = false;
              errors.push(`Failed to persist reconciled tombstone "${id}": ${err.message || String(err)}`);
            }
          }
        }
      }
    } else {
      const pendingCount = Object.values(tombstones).filter((t) => t && !t.prismaReconciled).length;
      if (pendingCount > 0) {
        errors.push(`Database unavailable; ${pendingCount} tombstone(s) remain pending Prisma reconciliation.`);
      }
    }

    const updatedTombstones = this.fileStore.readCollection<ConversationTombstone>(
      CONVERSATION_TOMBSTONES_COLLECTION
    );
    const pendingPrismaCount = Object.values(updatedTombstones).filter(
      (t) => t && !t.prismaReconciled
    ).length;

    const success = pendingPrismaCount === 0 && failedLocalCount === 0;

    return {
      reconciledPrismaCount: prismaCount,
      cleanedLocalCount: localCount,
      pendingPrismaCount,
      failedLocalCount,
      success,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Reconciles pending Prisma mirror deletions for tombstoned conversations.
   * Preserved for backward compatibility; calls reconcileAllTombstones.
   */
  public async reconcilePrismaTombstones(): Promise<{ reconciledCount: number }> {
    const res = await this.reconcileAllTombstones();
    return { reconciledCount: res.reconciledPrismaCount };
  }

  /**
   * Deletes a conversation and all associated messages for the authenticated Founder.
   *
   * CONTRACT & GOVERNANCE:
   * 1. Founder Ownership: Enforces ownership strictly. If the conversation belongs to
   *    another founder, throws ConversationSecurityError (fails closed).
   * 2. Idempotency & Safe Retry: If the conversation was already deleted by this founder,
   *    re-verifies local file cleanup and returns
   *    { success: true, deleted: false, alreadyDeleted: true, conversationId }.
   * 3. Write-Ahead Tombstone (Anti-Resurrection Barrier):
   *    Writes a tombstone to `conversation_tombstones.json` before modifying collections.
   *    This guarantees that even if a mirror deletion or process restart interrupts execution,
   *    subsequent reads will NEVER resurrect the conversation from Prisma.
   * 4. Atomic Collection Cascade (Fail-Closed Lock):
   *    Purges messages under `chat_messages` collection lock (strict fail-closed) and
   *    removes conversation from `conversations` collection under lock.
   * 5. Prisma Mirror Reconciliation:
   *    Best-effort deletes from Prisma mirror; records `prismaReconciled: true` on tombstone
   *    ONLY upon confirmed deletion or verified absent (P2025). Errors leave tombstone pending.
   * 6. Audit & Evidence Preservation:
   *    Does NOT delete AgentRun, ApprovalRecord, or SideEffectAudit rows.
   */
  public async deleteConversation(
    founderId: string,
    conversationId: string,
    options?: { lockTimeoutMs?: number }
  ): Promise<DeleteConversationResult> {
    if (!founderId) {
      throw new ConversationSecurityError('Authenticated founderId is required to delete conversation.');
    }
    if (!conversationId || !conversationId.trim()) {
      return { success: false, deleted: false, notFound: true, conversationId: conversationId || '' };
    }
    const id = conversationId.trim();
    const lockTimeoutMs = options?.lockTimeoutMs;

    // 1. Check if already tombstoned (idempotent delete with safe retry cleanup)
    const existingTombstone = this.getTombstone(id);
    if (existingTombstone) {
      if (existingTombstone.founderId !== founderId) {
        throw new ConversationSecurityError(
          `Principal "${founderId}" is not authorized to delete conversation "${id}".`
        );
      }
      // Safe retry: guarantee local file records and messages are cleaned even if previous run crashed midway
      try {
        this.fileStore.deleteItemStrict(CONVERSATIONS_COLLECTION, id, { lockStrict: true, timeoutMs: lockTimeoutMs });
        this.fileStore.withCollectionLockStrict(CHAT_MESSAGES_COLLECTION, () => {
          const allMessages = this.fileStore.readCollection<ChatMessageRecord>(CHAT_MESSAGES_COLLECTION);
          let modified = false;
          const filtered: Record<string, ChatMessageRecord> = {};
          for (const [msgId, msg] of Object.entries(allMessages)) {
            if (msg && msg.conversationId === id) {
              modified = true;
            } else if (msg) {
              filtered[msgId] = msg;
            }
          }
          if (modified) {
            this.fileStore.writeCollectionStrict(CHAT_MESSAGES_COLLECTION, filtered, { lockStrict: true, timeoutMs: lockTimeoutMs });
          }
        }, lockTimeoutMs);
      } catch {}

      // If Prisma wasn't reconciled previously, attempt reconciliation now
      if (!existingTombstone.prismaReconciled) {
        try {
          if ((await this.isDbAvailable()) && (prisma as any).conversation) {
            let reconciled = false;
            try {
              await (prisma as any).conversation.delete({ where: { id } });
              reconciled = true;
            } catch (err: any) {
              if (isPrismaRecordNotFoundError(err)) {
                reconciled = true;
              }
            }
            if (reconciled) {
              existingTombstone.prismaReconciled = true;
              this.fileStore.saveItemStrict(CONVERSATION_TOMBSTONES_COLLECTION, id, existingTombstone, { lockStrict: true, timeoutMs: lockTimeoutMs });
            }
          }
        } catch {}
      }

      return {
        success: true,
        deleted: false,
        alreadyDeleted: true,
        conversationId: id,
        purgedMessageCount: existingTombstone.purgedMessageCount,
      };
    }

    // 2. Resolve existing conversation (checks ownership strictly, throws ConversationSecurityError on mismatch)
    const existing = await this.getConversation(founderId, id);
    if (!existing) {
      return { success: false, deleted: false, notFound: true, conversationId: id };
    }

    // 3. Write-Ahead Tombstone (Anti-Resurrection Barrier) - STRICT LOCKING
    const newTombstone: ConversationTombstone = {
      id,
      founderId,
      deletedAt: new Date().toISOString(),
      purgedMessageCount: 0,
      prismaReconciled: false,
    };
    this.fileStore.saveItemStrict(CONVERSATION_TOMBSTONES_COLLECTION, id, newTombstone, { lockStrict: true, timeoutMs: lockTimeoutMs });

    // 4. Cascade purge all messages belonging to this conversation under fail-closed lock
    let purgedCount = 0;
    this.fileStore.withCollectionLockStrict(CHAT_MESSAGES_COLLECTION, () => {
      const allMessages = this.fileStore.readCollection<ChatMessageRecord>(CHAT_MESSAGES_COLLECTION);
      const filtered: Record<string, ChatMessageRecord> = {};
      for (const [msgId, msg] of Object.entries(allMessages)) {
        if (msg && msg.conversationId === id) {
          purgedCount++;
        } else if (msg) {
          filtered[msgId] = msg;
        }
      }
      this.fileStore.writeCollectionStrict(CHAT_MESSAGES_COLLECTION, filtered, { lockStrict: true, timeoutMs: lockTimeoutMs });
    }, lockTimeoutMs);

    // 5. Delete conversation record from disk under fail-closed lock
    this.fileStore.deleteItemStrict(CONVERSATIONS_COLLECTION, id, { lockStrict: true, timeoutMs: lockTimeoutMs });

    // 6. Best-effort Prisma mirror delete
    let prismaDeleted = false;
    try {
      if ((await this.isDbAvailable()) && (prisma as any).conversation) {
        try {
          await (prisma as any).conversation.delete({
            where: { id },
          });
          prismaDeleted = true;
        } catch (err: any) {
          if (isPrismaRecordNotFoundError(err)) {
            prismaDeleted = true;
          }
        }
      }
    } catch {
      // Non-fatal in local/file-primary mode; tombstone preserves prismaReconciled = false
    }

    // 7. Update tombstone with final count and reconciliation state using strict write & strict lock
    newTombstone.purgedMessageCount = purgedCount;
    newTombstone.prismaReconciled = prismaDeleted;
    this.fileStore.saveItemStrict(CONVERSATION_TOMBSTONES_COLLECTION, id, newTombstone, { lockStrict: true, timeoutMs: lockTimeoutMs });

    return {
      success: true,
      deleted: true,
      conversationId: id,
      purgedMessageCount: purgedCount,
    };
  }

  /**
   * Deletes an individual chat message within a conversation.
   *
   * CONTRACT & GOVERNANCE:
   * 1. Strict Ownership: Validates parent conversation exists, is owned by founderId,
   *    and is not tombstoned.
   * 2. Message Verification: Validates that the message belongs to conversationId.
   * 3. Durable Anti-Replay Tombstone:
   *    Persists a founder-scoped deletion marker (`message_tombstones.json`) for the
   *    message ID and its idempotency key BEFORE removing the message from `chat_messages`.
   *    If marker persistence fails, the deletion fails closed and the message is NOT removed.
   * 4. Parent Timestamp: Updates parent conversation's updatedAt timestamp on disk.
   * 5. Idempotency: Returns `alreadyDeleted: true` if message was previously tombstoned;
   *    returns notFound if message never existed.
   */
  public async deleteMessage(
    founderId: string,
    conversationId: string,
    messageId: string,
    options?: { lockTimeoutMs?: number }
  ): Promise<DeleteMessageResult> {
    if (!founderId) {
      throw new ConversationSecurityError('Authenticated founderId is required to delete message.');
    }
    if (!conversationId || !conversationId.trim() || !messageId || !messageId.trim()) {
      return {
        success: false,
        deleted: false,
        notFound: true,
        conversationId: conversationId || '',
        messageId: messageId || '',
      };
    }
    const cId = conversationId.trim();
    const mId = messageId.trim();
    const lockTimeoutMs = options?.lockTimeoutMs;

    // 1. Verify parent conversation exists and is owned by this founder
    const conversation = await this.getConversation(founderId, cId);
    if (!conversation) {
      return { success: false, deleted: false, notFound: true, conversationId: cId, messageId: mId };
    }

    // 2. Check if already tombstoned (repeated deletion / idempotent delete)
    const existingTombstone = this.getMessageTombstone(mId);
    if (existingTombstone) {
      if (existingTombstone.founderId !== founderId) {
        throw new ConversationSecurityError(
          `Principal "${founderId}" is not authorized to delete message "${mId}".`
        );
      }
      if (existingTombstone.conversationId !== cId) {
        return { success: false, deleted: false, notFound: true, conversationId: cId, messageId: mId };
      }
      return { success: true, deleted: false, alreadyDeleted: true, conversationId: cId, messageId: mId };
    }

    // 3. Delete message under chat_messages collection lock (Fail-Closed)
    const deleted = this.fileStore.withCollectionLockStrict(CHAT_MESSAGES_COLLECTION, () => {
      // Recheck conversation tombstone inside lock
      if (this.isTombstoned(cId)) {
        return false;
      }

      const allMessages = this.fileStore.readCollection<ChatMessageRecord>(CHAT_MESSAGES_COLLECTION);
      const msg = allMessages[mId];
      if (!msg || msg.conversationId !== cId) {
        return false;
      }

      // Write durable deletion marker FIRST with strict write & strict lock
      // If persistence of the marker fails, throws immediately; msg is NOT removed from collection!
      const tombstone: MessageTombstone = {
        id: mId,
        conversationId: cId,
        founderId,
        idempotencyKey: msg.idempotencyKey,
        deletedAt: new Date().toISOString(),
      };
      this.fileStore.saveItemStrict(MESSAGE_TOMBSTONES_COLLECTION, mId, tombstone, { lockStrict: true, timeoutMs: lockTimeoutMs });

      // Now remove from collection
      delete allMessages[mId];
      this.fileStore.writeCollectionStrict(CHAT_MESSAGES_COLLECTION, allMessages, { lockStrict: true, timeoutMs: lockTimeoutMs });
      return true;
    }, lockTimeoutMs);

    if (!deleted) {
      return { success: false, deleted: false, notFound: true, conversationId: cId, messageId: mId };
    }

    // 4. Update parent conversation timestamp
    conversation.updatedAt = new Date().toISOString();
    this.fileStore.saveItem(CONVERSATIONS_COLLECTION, cId, conversation);

    // 5. Best-effort Prisma mirror delete
    try {
      if ((await this.isDbAvailable()) && (prisma as any).chatMessage) {
        await (prisma as any).chatMessage.delete({ where: { id: mId } }).catch(() => {});
      }
    } catch {
      // Non-fatal mirror
    }

    return { success: true, deleted: true, conversationId: cId, messageId: mId };
  }

  /**
   * Helper for tests: clears conversation collections and tombstones.
   */
  public clearForTests(): void {
    this.dbAvailableOverride = null;
    this.fileStore.writeCollection(CONVERSATIONS_COLLECTION, {});
    this.fileStore.writeCollection(CHAT_MESSAGES_COLLECTION, {});
    this.fileStore.writeCollectionStrict(CONVERSATION_TOMBSTONES_COLLECTION, {}, { lockStrict: true });
    this.fileStore.writeCollectionStrict(MESSAGE_TOMBSTONES_COLLECTION, {}, { lockStrict: true });
  }

  /**
   * Helper for tests: clears only the tombstones collection.
   */
  public clearTombstonesForTests(): void {
    this.fileStore.writeCollection(CONVERSATION_TOMBSTONES_COLLECTION, {});
    this.fileStore.writeCollection(MESSAGE_TOMBSTONES_COLLECTION, {});
  }
}
