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

const CONVERSATIONS_COLLECTION = 'conversations';
const CHAT_MESSAGES_COLLECTION = 'chat_messages';
const CONVERSATION_TOMBSTONES_COLLECTION = 'conversation_tombstones';

/** Durable anti-resurrection tombstone for deleted conversations. */
export interface ConversationTombstone {
  id: string; // conversationId
  founderId: string;
  deletedAt: string;
  purgedMessageCount: number;
  prismaReconciled: boolean;
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
   * Reconciles pending Prisma mirror deletions and cleans any local file orphans
   * from interrupted cascades across all tombstoned conversations.
   * Can be triggered lazily, on startup, or during background maintenance.
   */
  public async reconcileAllTombstones(): Promise<{ reconciledPrismaCount: number; cleanedLocalCount: number }> {
    let prismaCount = 0;
    let localCount = 0;

    const tombstones = this.fileStore.readCollection<ConversationTombstone>(
      CONVERSATION_TOMBSTONES_COLLECTION
    );

    // 1. Clean any lingering local file records for tombstoned conversations
    for (const [id] of Object.entries(tombstones)) {
      try {
        const lingering = this.fileStore.getItem<ConversationRecord>(CONVERSATIONS_COLLECTION, id);
        if (lingering) {
          this.fileStore.deleteItemStrict(CONVERSATIONS_COLLECTION, id);
          localCount++;
        }
      } catch {
        // Continue
      }
    }

    // 2. Reconcile Prisma mirrors
    try {
      if ((await isDatabaseAvailable()) && (prisma as any).conversation) {
        for (const [id, tombstone] of Object.entries(tombstones)) {
          if (tombstone && !tombstone.prismaReconciled) {
            try {
              await (prisma as any).conversation.delete({ where: { id } }).catch(() => {});
              tombstone.prismaReconciled = true;
              this.fileStore.saveItem(CONVERSATION_TOMBSTONES_COLLECTION, id, tombstone);
              prismaCount++;
            } catch {
              // Retry on next pass
            }
          }
        }
      }
    } catch {
      // Database unavailable
    }

    return { reconciledPrismaCount: prismaCount, cleanedLocalCount: localCount };
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
   * 4. Atomic Collection Cascade:
   *    Purges messages under `chat_messages` collection lock and removes conversation
   *    from `conversations` collection under lock.
   * 5. Prisma Mirror Reconciliation:
   *    Best-effort deletes from Prisma mirror; records `prismaReconciled: true` on tombstone.
   * 6. Audit & Evidence Preservation:
   *    Does NOT delete AgentRun, ApprovalRecord, or SideEffectAudit rows.
   */
  public async deleteConversation(
    founderId: string,
    conversationId: string
  ): Promise<DeleteConversationResult> {
    if (!founderId) {
      throw new ConversationSecurityError('Authenticated founderId is required to delete conversation.');
    }
    if (!conversationId || !conversationId.trim()) {
      return { success: false, deleted: false, notFound: true, conversationId: conversationId || '' };
    }
    const id = conversationId.trim();

    // 1. Check if already tombstoned (idempotent delete with safe retry cleanup)
    const existingTombstone = this.getTombstone(id);
    if (existingTombstone) {
      if (existingTombstone.founderId !== founderId) {
        throw new ConversationSecurityError(
          `Principal "${founderId}" is not authorized to delete conversation "${id}".`
        );
      }
      // Safe retry: guarantee local file records are cleaned even if previous run crashed midway
      try {
        this.fileStore.deleteItemStrict(CONVERSATIONS_COLLECTION, id);
      } catch {}
      // If Prisma wasn't reconciled previously, attempt reconciliation now
      if (!existingTombstone.prismaReconciled) {
        try {
          if ((await isDatabaseAvailable()) && (prisma as any).conversation) {
            await (prisma as any).conversation.delete({ where: { id } }).catch(() => {});
            existingTombstone.prismaReconciled = true;
            this.fileStore.saveItem(CONVERSATION_TOMBSTONES_COLLECTION, id, existingTombstone);
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

    // 3. Write-Ahead Tombstone (Anti-Resurrection Barrier)
    const newTombstone: ConversationTombstone = {
      id,
      founderId,
      deletedAt: new Date().toISOString(),
      purgedMessageCount: 0,
      prismaReconciled: false,
    };
    this.fileStore.saveItemStrict(CONVERSATION_TOMBSTONES_COLLECTION, id, newTombstone);

    // 4. Cascade purge all messages belonging to this conversation under lock
    let purgedCount = 0;
    this.fileStore.withCollectionLock(CHAT_MESSAGES_COLLECTION, () => {
      const allMessages = this.fileStore.readCollection<ChatMessageRecord>(CHAT_MESSAGES_COLLECTION);
      const filtered: Record<string, ChatMessageRecord> = {};
      for (const [msgId, msg] of Object.entries(allMessages)) {
        if (msg && msg.conversationId === id) {
          purgedCount++;
        } else if (msg) {
          filtered[msgId] = msg;
        }
      }
      this.fileStore.writeCollectionStrict(CHAT_MESSAGES_COLLECTION, filtered);
    });

    // 5. Delete conversation record from disk under lock
    this.fileStore.deleteItemStrict(CONVERSATIONS_COLLECTION, id);

    // 6. Best-effort Prisma mirror delete
    let prismaDeleted = false;
    try {
      if ((await isDatabaseAvailable()) && (prisma as any).conversation) {
        await (prisma as any).conversation.delete({
          where: { id },
        });
        prismaDeleted = true;
      }
    } catch {
      // Non-fatal in local/file-primary mode; tombstone preserves prismaReconciled = false
    }

    // 7. Update tombstone with final count and reconciliation state
    newTombstone.purgedMessageCount = purgedCount;
    newTombstone.prismaReconciled = prismaDeleted;
    this.fileStore.saveItem(CONVERSATION_TOMBSTONES_COLLECTION, id, newTombstone);

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
   * 3. Parent Timestamp: Updates parent conversation's updatedAt timestamp on disk.
   * 4. Idempotency: Returns notFound if message does not exist.
   */
  public async deleteMessage(
    founderId: string,
    conversationId: string,
    messageId: string
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

    // 1. Verify parent conversation exists and is owned by this founder
    const conversation = await this.getConversation(founderId, cId);
    if (!conversation) {
      return { success: false, deleted: false, notFound: true, conversationId: cId, messageId: mId };
    }

    // 2. Delete message under chat_messages collection lock
    const deleted = this.fileStore.withCollectionLock(CHAT_MESSAGES_COLLECTION, () => {
      const allMessages = this.fileStore.readCollection<ChatMessageRecord>(CHAT_MESSAGES_COLLECTION);
      const msg = allMessages[mId];
      if (!msg || msg.conversationId !== cId) {
        return false;
      }
      delete allMessages[mId];
      this.fileStore.writeCollectionStrict(CHAT_MESSAGES_COLLECTION, allMessages);
      return true;
    });

    if (!deleted) {
      return { success: false, deleted: false, notFound: true, conversationId: cId, messageId: mId };
    }

    // 3. Update parent conversation timestamp
    conversation.updatedAt = new Date().toISOString();
    this.fileStore.saveItem(CONVERSATIONS_COLLECTION, cId, conversation);

    // 4. Best-effort Prisma mirror delete
    try {
      if ((await isDatabaseAvailable()) && (prisma as any).chatMessage) {
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
    this.fileStore.writeCollection(CONVERSATIONS_COLLECTION, {});
    this.fileStore.writeCollection(CHAT_MESSAGES_COLLECTION, {});
    this.fileStore.writeCollection(CONVERSATION_TOMBSTONES_COLLECTION, {});
  }

  /**
   * Helper for tests: clears only the tombstones collection.
   */
  public clearTombstonesForTests(): void {
    this.fileStore.writeCollection(CONVERSATION_TOMBSTONES_COLLECTION, {});
  }
}
