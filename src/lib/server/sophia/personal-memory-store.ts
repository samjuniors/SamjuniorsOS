import { randomUUID } from 'crypto';
import { DurableFileStore } from '../persistence/durable-file-store';
import { prisma, isDatabaseAvailable } from '../db/prisma';

/**
 * ============================================================================
 * SOPHIA PERSONAL MEMORY STORE (M3 K-2 — Personal Mind)
 * ============================================================================
 * Server-authoritative, founder-scoped personal/interaction memory store for
 * the Sophia Personal Mind (SOPHIA_MEMORY_ARCHITECTURE.md §1).
 *
 * TWO BRAINS, ONE GATE:
 *   This store is the Personal Mind's ONLY persistence boundary. It holds
 *   founder-specific interaction context (preferences, patterns, personal
 *   contextual notes). It is NOT the Company Brain:
 *     - it never stores company facts / strategy / financial truth
 *     - it never feeds CompanyKnowledge, CompanyMemory, or the epistemic
 *       claim/fact pipeline
 *     - it is NEVER an authorization source — personal memories cannot
 *       approve, bypass, or govern anything (the SideEffectAuthorizationGate
 *       and SophiaServerGateway read approval/policy state exclusively from
 *       their own governed stores)
 *     - there is NO promotion path out of this store; a personal memory
 *       stays personal/unverified context forever unless a Founder moves the
 *       underlying fact through the governed epistemic pipeline by hand.
 *
 * AUTHORITY SEMANTICS (four layers — keep these distinct in any claim):
 *
 *   [canonical abstraction]  This class IS the canonical Personal Mind
 *                            memory abstraction. Callers never read/write
 *                            `.data/sophia_memories.json` or the Prisma
 *                            SophiaMemory table directly.
 *
 *   [current local persistence — AUTHORITATIVE TODAY]
 *                            The DurableFileStore collection
 *                            `.data/sophia_memories.json` is the primary
 *                            write target and the authoritative read source
 *                            for every method (mirrors ConversationStore):
 *                              - listMemories()/findByIdempotencyKey() read
 *                                the file ONLY
 *                              - getMemory()/updateMemory()/deleteMemory()
 *                                resolve through the file ONLY
 *
 *   [current Prisma dual-write — opportunistic mirror, NOT authoritative]
 *                            createMemory()/updateMemory() upsert to the
 *                            Prisma SophiaMemory table best-effort AFTER
 *                            the durable file write; errors are swallowed
 *                            (never blocks the interaction).
 *                            deleteMemory() best-effort deletes the mirror
 *                            row. There is NO Prisma read fallback — Prisma
 *                            SophiaMemory rows are write-only shadows
 *                            (ADR 0002 §7 layering, applied to K-2).
 *
 *   [authoritative mode]     THIS STORE HAS NONE — deliberately, exactly
 *                            like ConversationStore. The same local-style
 *                            semantics (file primary, Prisma best-effort,
 *                            swallowed dual-write errors) apply in every
 *                            DATABASE_MODE, including production. The
 *                            M6 authoritative (PostgreSQL) migration moves
 *                            conversations and personal memories together;
 *                            until then Prisma must NOT be claimed as
 *                            authoritative for personal memory.
 *
 * INVARIANTS:
 * 1. Founder Ownership: every read/write/delete is bound to the caller's
 *    founderId. Cross-founder access FAILS CLOSED (403) — never a silent
 *    empty result when the record exists (existence is leaked only through
 *    the explicit 403; the victim's content is never returned).
 * 2. Process-Restart Durability: atomic DurableFileStore writes + best-effort
 *    Prisma dual-write.
 * 3. Deterministic Retrieval: listMemories is founder-scoped, filter-bounded,
 *    sorted (updatedAt DESC, id ASC tie-break), hard-capped — no vector
 *    search, no embeddings, no LLM-generated retrieval decisions.
 * 4. Idempotent Writes (optional): a founder-scoped idempotencyKey dedupes
 *    createMemory exactly like ChatMessage's idempotency convention
 *    (no key → no dedupe).
 * 5. No Fabrication: an empty store returns empty results — never seeded,
 *    never invented (bootstrap seeds are a CompanyKnowledge concept and do
 *    NOT apply to personal memory).
 */

/** Allowed Personal Mind memory categories (allow-list validated). */
export const SOPHIA_MEMORY_TYPES = [
  'INTERACTION_PREFERENCE',
  'COMMUNICATION_PREFERENCE',
  'INTERACTION_PATTERN',
  'PERSONAL_CONTEXT_NOTE',
  'INTERACTION_OBSERVATION',
] as const;

export type SophiaMemoryType = (typeof SOPHIA_MEMORY_TYPES)[number];

/** Hard content bounds (fail-closed validation, not silent truncation). */
export const SOPHIA_MEMORY_CONTENT_MAX_CHARS = 2000;
export const SOPHIA_MEMORY_PROVENANCE_MAX_CHARS = 500;
export const SOPHIA_MEMORY_LIST_DEFAULT_LIMIT = 20;
export const SOPHIA_MEMORY_LIST_MAX_LIMIT = 50;

export interface SophiaMemoryRecord {
  id: string;
  founderId: string;
  memoryType: SophiaMemoryType;
  content: string;
  provenance: string;
  confidence: number;
  active: boolean;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface CreateSophiaMemoryParams {
  founderId: string;
  memoryType: SophiaMemoryType;
  content: string;
  provenance?: string;
  confidence?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateSophiaMemoryParams {
  content?: string;
  confidence?: number;
  active?: boolean;
}

export class SophiaMemorySecurityError extends Error {
  public readonly code = 'SOPHIA_MEMORY_UNAUTHORIZED';
  public readonly statusCode = 403;

  constructor(message: string) {
    super(`[SophiaMemorySecurity] ${message}`);
    this.name = 'SophiaMemorySecurityError';
  }
}

export class SophiaMemoryNotFoundError extends Error {
  public readonly code = 'SOPHIA_MEMORY_NOT_FOUND';
  public readonly statusCode = 404;

  constructor(message: string) {
    super(`[SophiaMemoryStore] ${message}`);
    this.name = 'SophiaMemoryNotFoundError';
  }
}

export class SophiaMemoryValidationError extends Error {
  public readonly code = 'SOPHIA_MEMORY_INVALID';
  public readonly statusCode = 400;

  constructor(message: string) {
    super(`[SophiaMemoryValidation] ${message}`);
    this.name = 'SophiaMemoryValidationError';
  }
}

const SOPHIA_MEMORIES_COLLECTION = 'sophia_memories';

export class SophiaMemoryStore {
  private static instance: SophiaMemoryStore;
  private fileStore: DurableFileStore;

  private constructor() {
    this.fileStore = DurableFileStore.getInstance();
  }

  public static getInstance(): SophiaMemoryStore {
    if (!SophiaMemoryStore.instance) {
      SophiaMemoryStore.instance = new SophiaMemoryStore();
    }
    return SophiaMemoryStore.instance;
  }

  // --------------------------------------------------------------------------
  // Validation helpers (fail-closed; never silently coerce or truncate)
  // --------------------------------------------------------------------------

  private requireFounderId(founderId: string): string {
    if (typeof founderId !== 'string' || !founderId.trim()) {
      throw new SophiaMemorySecurityError(
        'Authenticated founderId is required for every personal memory operation.'
      );
    }
    return founderId.trim();
  }

  private validateMemoryType(memoryType: string): SophiaMemoryType {
    if (
      typeof memoryType !== 'string' ||
      !(SOPHIA_MEMORY_TYPES as readonly string[]).includes(memoryType)
    ) {
      throw new SophiaMemoryValidationError(
        `memoryType must be one of [${SOPHIA_MEMORY_TYPES.join(', ')}] (got: ${String(memoryType)}).`
      );
    }
    return memoryType as SophiaMemoryType;
  }

  private validateContent(content: string): string {
    if (typeof content !== 'string' || !content.trim()) {
      throw new SophiaMemoryValidationError('content must be a non-empty string.');
    }
    if (content.length > SOPHIA_MEMORY_CONTENT_MAX_CHARS) {
      throw new SophiaMemoryValidationError(
        `content exceeds the ${SOPHIA_MEMORY_CONTENT_MAX_CHARS}-character bound (got ${content.length}).`
      );
    }
    return content.trim();
  }

  private validateProvenance(provenance: string): string {
    if (typeof provenance !== 'string' || !provenance.trim()) {
      throw new SophiaMemoryValidationError('provenance must be a non-empty source reference.');
    }
    if (provenance.length > SOPHIA_MEMORY_PROVENANCE_MAX_CHARS) {
      throw new SophiaMemoryValidationError(
        `provenance exceeds the ${SOPHIA_MEMORY_PROVENANCE_MAX_CHARS}-character bound.`
      );
    }
    return provenance.trim();
  }

  private validateConfidence(confidence: number): number {
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new SophiaMemoryValidationError('confidence must be a finite number in [0, 1].');
    }
    return confidence;
  }

  /**
   * Resolves a memory from the durable file store (the ONLY read source today)
   * and enforces founder ownership STRICTLY. Existence + owner mismatch fails
   * closed (403); the victim's content is never returned to the caller.
   */
  private getOwnedMemory(founderId: string, memoryId: string): SophiaMemoryRecord {
    const record = this.fileStore.getItem<SophiaMemoryRecord>(SOPHIA_MEMORIES_COLLECTION, memoryId);
    if (!record) {
      throw new SophiaMemoryNotFoundError(
        `Personal memory "${memoryId}" not found for Founder "${founderId}".`
      );
    }
    if (record.founderId !== founderId) {
      throw new SophiaMemorySecurityError(
        `Principal "${founderId}" is not authorized to access personal memory "${memoryId}".`
      );
    }
    return record;
  }

  // --------------------------------------------------------------------------
  // Writes
  // --------------------------------------------------------------------------

  /**
   * Creates a personal memory bound to the authenticated founder.
   *
   * Idempotency (ChatMessage convention): when a non-empty idempotencyKey is
   * supplied and a memory with the SAME key already exists for the SAME
   * founder, the existing record is returned and nothing is written. Without
   * a key there is NO dedupe. The key is founder-scoped — Founder B may use
   * Founder A's key without collision.
   */
  public async createMemory(params: CreateSophiaMemoryParams): Promise<SophiaMemoryRecord> {
    const founderId = this.requireFounderId(params.founderId);
    const memoryType = this.validateMemoryType(params.memoryType);
    const content = this.validateContent(params.content);
    const provenance = this.validateProvenance(params.provenance || 'founder_direct');
    const confidence = this.validateConfidence(params.confidence ?? 0.8);

    const cleanKey =
      typeof params.idempotencyKey === 'string' && params.idempotencyKey.trim()
        ? params.idempotencyKey.trim()
        : undefined;

    if (cleanKey) {
      const existing = this.findByIdempotencyKeySync(founderId, cleanKey);
      if (existing) {
        return existing;
      }
    }

    const now = new Date().toISOString();
    const record: SophiaMemoryRecord = {
      id: `smem-${randomUUID()}`,
      founderId,
      memoryType,
      content,
      provenance,
      confidence,
      active: true,
      idempotencyKey: cleanKey,
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata && typeof params.metadata === 'object' ? { ...params.metadata } : {},
    };

    // 1. Atomic durable file write (authoritative today)
    this.fileStore.saveItem(SOPHIA_MEMORIES_COLLECTION, record.id, record);

    // 2. Best-effort Prisma dual-write (opportunistic mirror, never authoritative)
    try {
      if ((await isDatabaseAvailable()) && (prisma as any).sophiaMemory) {
        await (prisma as any).sophiaMemory.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            founderId: record.founderId,
            memoryType: record.memoryType,
            content: record.content,
            provenance: record.provenance,
            confidence: record.confidence,
            active: record.active,
            idempotencyKey: record.idempotencyKey ?? null,
            metadata: record.metadata,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
          update: {
            content: record.content,
            confidence: record.confidence,
            active: record.active,
            metadata: record.metadata,
            updatedAt: new Date(record.updatedAt),
          },
        });
      }
    } catch {
      // Non-fatal if DB is offline (local durable mode)
    }

    return record;
  }

  /**
   * Updates a personal memory's mutable fields (content / confidence / active).
   * Ownership fails closed (403); unknown id → 404.
   */
  public async updateMemory(
    founderId: string,
    memoryId: string,
    patch: UpdateSophiaMemoryParams
  ): Promise<SophiaMemoryRecord> {
    const owner = this.requireFounderId(founderId);
    if (typeof memoryId !== 'string' || !memoryId.trim()) {
      throw new SophiaMemoryValidationError('memoryId is required.');
    }
    const record = this.getOwnedMemory(owner, memoryId.trim());

    const next: SophiaMemoryRecord = { ...record };

    if (patch.content !== undefined) {
      next.content = this.validateContent(patch.content);
    }
    if (patch.confidence !== undefined) {
      next.confidence = this.validateConfidence(patch.confidence);
    }
    if (patch.active !== undefined) {
      if (typeof patch.active !== 'boolean') {
        throw new SophiaMemoryValidationError('active must be a boolean.');
      }
      next.active = patch.active;
    }
    next.updatedAt = new Date().toISOString();

    // 1. Atomic durable file write
    this.fileStore.saveItem(SOPHIA_MEMORIES_COLLECTION, next.id, next);

    // 2. Best-effort Prisma dual-write
    try {
      if ((await isDatabaseAvailable()) && (prisma as any).sophiaMemory) {
        await (prisma as any).sophiaMemory.update({
          where: { id: next.id },
          data: {
            content: next.content,
            confidence: next.confidence,
            active: next.active,
            metadata: next.metadata as any,
            updatedAt: new Date(next.updatedAt),
          },
        });
      }
    } catch {
      // Non-fatal (mirror only)
    }

    return next;
  }

  /**
   * Deletes a personal memory. Ownership fails closed (403); unknown id →
   * returns false (idempotent delete for the OWNER — a second delete of a
   * memory the caller legitimately owned is a no-op, never an error).
   */
  public async deleteMemory(founderId: string, memoryId: string): Promise<boolean> {
    const owner = this.requireFounderId(founderId);
    if (typeof memoryId !== 'string' || !memoryId.trim()) {
      throw new SophiaMemoryValidationError('memoryId is required.');
    }
    const id = memoryId.trim();

    const record = this.fileStore.getItem<SophiaMemoryRecord>(SOPHIA_MEMORIES_COLLECTION, id);
    if (!record) {
      return false;
    }
    if (record.founderId !== owner) {
      throw new SophiaMemorySecurityError(
        `Principal "${owner}" is not authorized to delete personal memory "${id}".`
      );
    }

    // 1. Authoritative durable file delete
    this.fileStore.deleteItem(SOPHIA_MEMORIES_COLLECTION, id);

    // 2. Best-effort Prisma mirror delete
    try {
      if ((await isDatabaseAvailable()) && (prisma as any).sophiaMemory) {
        await (prisma as any).sophiaMemory.delete({ where: { id } }).catch(() => {});
      }
    } catch {
      // Non-fatal (mirror only)
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Reads (DurableFileStore ONLY — Prisma rows are write-only shadows)
  // --------------------------------------------------------------------------

  /**
   * Retrieves one personal memory, strictly validating ownership.
   * Unknown id → null; owner mismatch → SophiaMemorySecurityError (403).
   */
  public async getMemory(founderId: string, memoryId: string): Promise<SophiaMemoryRecord | null> {
    const owner = this.requireFounderId(founderId);
    if (typeof memoryId !== 'string' || !memoryId.trim()) {
      return null;
    }
    const record = this.fileStore.getItem<SophiaMemoryRecord>(SOPHIA_MEMORIES_COLLECTION, memoryId.trim());
    if (!record) {
      return null;
    }
    if (record.founderId !== owner) {
      throw new SophiaMemorySecurityError(
        `Principal "${owner}" is not authorized to access personal memory "${memoryId.trim()}".`
      );
    }
    return { ...record };
  }

  /**
   * Deterministic, founder-scoped, bounded retrieval.
   *
   * Ordering: updatedAt DESC, then id ASC (total, stable, explainable order).
   * Filters: memoryType (exact allow-list match), active flag. Limit defaults
   * to 20 and is hard-capped at 50. No scoring, no vectors, no LLM decisions.
   */
  public async listMemories(
    founderId: string,
    opts?: { memoryType?: SophiaMemoryType; active?: boolean; limit?: number }
  ): Promise<SophiaMemoryRecord[]> {
    const owner = this.requireFounderId(founderId);

    const all = this.fileStore.readCollection<SophiaMemoryRecord>(SOPHIA_MEMORIES_COLLECTION);
    let items = Object.values(all).filter((m) => m && m.founderId === owner);

    if (opts?.memoryType !== undefined) {
      const type = this.validateMemoryType(opts.memoryType);
      items = items.filter((m) => m.memoryType === type);
    }
    if (opts?.active !== undefined) {
      items = items.filter((m) => m.active === opts.active);
    }

    items.sort((a, b) => {
      const ta = new Date(a.updatedAt).getTime();
      const tb = new Date(b.updatedAt).getTime();
      if (tb !== ta) return tb - ta;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const requested = opts?.limit ?? SOPHIA_MEMORY_LIST_DEFAULT_LIMIT;
    const limit = Math.max(1, Math.min(SOPHIA_MEMORY_LIST_MAX_LIMIT, Math.floor(requested)));
    return items.slice(0, limit).map((m) => ({ ...m }));
  }

  /**
   * Founder-scoped idempotency lookup (file-backed, like the turn gate).
   */
  public async findByIdempotencyKey(
    founderId: string,
    idempotencyKey: string
  ): Promise<SophiaMemoryRecord | null> {
    return this.findByIdempotencyKeySync(founderId, idempotencyKey);
  }

  private findByIdempotencyKeySync(founderId: string, idempotencyKey: string): SophiaMemoryRecord | null {
    const owner = this.requireFounderId(founderId);
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return null;
    }
    const key = idempotencyKey.trim();
    const all = this.fileStore.readCollection<SophiaMemoryRecord>(SOPHIA_MEMORIES_COLLECTION);
    for (const m of Object.values(all)) {
      if (m && m.founderId === owner && m.idempotencyKey === key) {
        return m;
      }
    }
    return null;
  }

  /**
   * Helper for tests: clears the personal memory collection.
   */
  public clearForTests(): void {
    this.fileStore.writeCollection(SOPHIA_MEMORIES_COLLECTION, {});
  }
}
