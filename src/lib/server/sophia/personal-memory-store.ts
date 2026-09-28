import { randomUUID } from 'crypto';
import { DurableFileStore } from '../persistence/durable-file-store';
import { prisma, isDatabaseAvailable } from '../db/prisma';
import { evaluateAuthorityContent } from './authority-content-guard';

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
/** Page-offset hard bound (P2 follow-up): paginated reads may advance at most
 *  this many records into the collection — bounds any single API call while
 *  making every record reachable (the pre-pagination hard cap hid records
 *  beyond the first 50 from every reader). */
export const SOPHIA_MEMORY_LIST_MAX_OFFSET = 10000;

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
  /**
   * Lifecycle state at creation. Defaults to true (the founder-direct
   * contract of the governed /api/sofia/memory route, unchanged). The M4-A
   * capture stage is the ONLY caller that passes false — captured
   * candidates persist INACTIVE and require an explicit Founder
   * confirmation (governed PATCH active:true) before they ever render in
   * context. This is a store-internal parameter: the governed route never
   * forwards a client-supplied active flag.
   */
  active?: boolean;
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

/**
 * M4-A HARDENING: personal memory content that establishes or implies
 * AUTHORIZATION / PRIVILEGE / CONTROL / GOVERNANCE semantics is refused at
 * the STORE layer — the single persistence choke point. This applies to
 * BOTH ingress paths:
 *   - autonomous capture (the MemoryGate rejects it earlier with
 *     AUTHORITY_PRIVILEGE_CONTENT; the store check is defense-in-depth)
 *   - founder-direct authoring (/api/sofia/memory POST/PATCH): explicit
 *     Founder authoring is preserved for every legitimate personal memory,
 *     but authorization/privilege semantics are NOT personal preferences —
 *     they are policy, and policy belongs exclusively to the governed
 *     authorization / workflow system. A memory like "never ask me for
 *     confirmation" would render into every future prompt as founder data
 *     and launder an instruction through the personal-memory channel; the
 *     deterministic authority-content guard refuses it instead.
 */
export class SophiaMemoryAuthorityError extends Error {
  public readonly code = 'SOPHIA_MEMORY_AUTHORITY_CONTENT';
  public readonly statusCode = 400;

  constructor(message?: string) {
    super(
      `[SophiaMemoryAuthority] ${
        message ??
        'Personal memory cannot establish or imply authorization, privileges, approval authority, or governance semantics. Express operational policy through the governed authorization system instead.'
      }`
    );
    this.name = 'SophiaMemoryAuthorityError';
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
   * M4-A HARDENING: deterministic fail-closed check on the AUTHORITY /
   * PRIVILEGE / CONTROL / GOVERNANCE semantic category (see
   * authority-content-guard.ts). Applied on create AND on content updates
   * so neither ingress path — capture or founder-direct authoring — can
   * persist authorization-bearing personal memory.
   */
  private validateNotAuthorityContent(content: string): string {
    const evaluation = evaluateAuthorityContent(content);
    if (evaluation.blocked) {
      throw new SophiaMemoryAuthorityError();
    }
    return content;
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
   *
   * Lifecycle: created records are ACTIVE by default (founder-direct). The
   * M4-A capture path creates INACTIVE candidates (active: false) that stay
   * out of every context render until a Founder explicitly activates them.
   */
  public async createMemory(params: CreateSophiaMemoryParams): Promise<SophiaMemoryRecord> {
    const founderId = this.requireFounderId(params.founderId);
    const memoryType = this.validateMemoryType(params.memoryType);
    const content = this.validateNotAuthorityContent(this.validateContent(params.content));
    const provenance = this.validateProvenance(params.provenance || 'founder_direct');
    const confidence = this.validateConfidence(params.confidence ?? 0.8);

    const cleanKey =
      typeof params.idempotencyKey === 'string' && params.idempotencyKey.trim()
        ? params.idempotencyKey.trim()
        : undefined;

    const now = new Date().toISOString();
    const record: SophiaMemoryRecord = {
      id: `smem-${randomUUID()}`,
      founderId,
      memoryType,
      content,
      provenance,
      confidence,
      active: params.active ?? true,
      idempotencyKey: cleanKey,
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata && typeof params.metadata === 'object' ? { ...params.metadata } : {},
    };

    // 1. Atomic durable file write (authoritative today). The idempotency
    //    check and the save are ONE serialized cross-process read-check-write
    //    unit (M4-A hardening): two concurrent creators of the same key can
    //    no longer interleave the check and both persist, and concurrent
    //    writers can no longer silently erase each other's records. The lock
    //    is re-entrant, so the saveItem inside runs without re-acquiring.
    const written = this.fileStore.withCollectionLock(SOPHIA_MEMORIES_COLLECTION, () => {
      if (cleanKey) {
        const existing = this.findByIdempotencyKeySync(founderId, cleanKey);
        if (existing) {
          return existing;
        }
      }
      this.fileStore.saveItemStrict(SOPHIA_MEMORIES_COLLECTION, record.id, record);
      return record;
    });

    // Idempotent replay: the existing record is returned and nothing else
    // (including the Prisma mirror) is touched.
    if (written !== record) {
      return written;
    }

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
    // Fail-closed validation BEFORE the lock (pure checks, no store state):
    // a content patch may not introduce authorization/privilege semantics
    // into an existing record (M4-A hardening — PATCH must not become the
    // laundering path around the create-time guard).
    if (patch.content !== undefined) {
      this.validateNotAuthorityContent(this.validateContent(patch.content));
    }
    if (patch.confidence !== undefined) {
      this.validateConfidence(patch.confidence);
    }
    if (patch.active !== undefined && typeof patch.active !== 'boolean') {
      throw new SophiaMemoryValidationError('active must be a boolean.');
    }

    // Read-merge-write serialized on the collection's cross-process lock
    // (M4-A hardening): a concurrent update or create can no longer be
    // silently erased by this writer, and vice versa.
    const next = this.fileStore.withCollectionLock(SOPHIA_MEMORIES_COLLECTION, () => {
      const record = this.getOwnedMemory(owner, memoryId.trim());

      const updated: SophiaMemoryRecord = { ...record };

      if (patch.content !== undefined) {
        updated.content = this.validateContent(patch.content);
      }
      if (patch.confidence !== undefined) {
        updated.confidence = this.validateConfidence(patch.confidence);
      }
      if (patch.active !== undefined) {
        updated.active = patch.active;
        // M4-A founder-review confirmation stamp: activating a pending
        // captured candidate records WHEN the Founder confirmed it. This is
        // deterministic lifecycle metadata (server-side), not new authority —
        // the record only becomes visible in context because active is now
        // true, exactly like any founder-direct memory.
        if (patch.active === true && updated.metadata?.captureStatus === 'pending') {
          updated.metadata = {
            ...updated.metadata,
            captureStatus: 'confirmed',
            confirmedAt: new Date().toISOString(),
          };
        }
      }
      updated.updatedAt = new Date().toISOString();

      // 1. Atomic durable file write (STRICT — M4-A hardening: a failed
      //    authoritative write THROWS instead of returning a phantom update)
      this.fileStore.saveItemStrict(SOPHIA_MEMORIES_COLLECTION, updated.id, updated);
      return updated;
    });

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

    // Read-check-delete serialized on the collection's cross-process lock
    // (M4-A hardening — same race class as create/update).
    const deleted = this.fileStore.withCollectionLock(SOPHIA_MEMORIES_COLLECTION, () => {
      const record = this.fileStore.getItem<SophiaMemoryRecord>(SOPHIA_MEMORIES_COLLECTION, id);
      if (!record) {
        return false;
      }
      if (record.founderId !== owner) {
        throw new SophiaMemorySecurityError(
          `Principal "${owner}" is not authorized to delete personal memory "${id}".`
        );
      }
      // 1. Authoritative durable file delete (STRICT — a failed delete-write
      //    throws instead of reporting a deletion that never reached disk)
      return this.fileStore.deleteItemStrict(SOPHIA_MEMORIES_COLLECTION, id);
    });

    if (!deleted) {
      return false;
    }

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
   *
   * PAGINATION (P2 follow-up — queue >50 visibility): `offset` skips the
   * first N records of the SAME deterministic order (applied after sorting,
   * before the limit slice), so page k is `listMemories(f, { offset: k*50,
   * limit: 50 })`. Without it, the hard cap made the oldest pending review
   * candidates permanently invisible to both the API and the UI once the
   * founder-scoped set exceeded 50 records. Offset is clamped to
   * [0, SOPHIA_MEMORY_LIST_MAX_OFFSET] and a too-large offset yields an empty
   * page (a legitimate "past the end" result, not an error).
   */
  public async listMemories(
    founderId: string,
    opts?: { memoryType?: SophiaMemoryType; active?: boolean; limit?: number; offset?: number }
  ): Promise<SophiaMemoryRecord[]> {
    const owner = this.requireFounderId(founderId);

    const items = this.sortedFounderMemories(owner, opts);

    const requested = opts?.limit ?? SOPHIA_MEMORY_LIST_DEFAULT_LIMIT;
    const limit = Math.max(1, Math.min(SOPHIA_MEMORY_LIST_MAX_LIMIT, Math.floor(requested)));
    const offset = Math.max(0, Math.min(SOPHIA_MEMORY_LIST_MAX_OFFSET, Math.floor(opts?.offset ?? 0)));
    return items.slice(offset, offset + limit).map((m) => ({ ...m }));
  }

  /**
   * TOTAL record count for the same founder-scoped filter listMemories uses
   * (P2 follow-up): callers paginating the review queue need the authoritative
   * total to compute hasMore / badge counts — the page length alone cannot
   * distinguish "exactly one page" from "one visible page of many".
   */
  public async countMemories(
    founderId: string,
    opts?: { memoryType?: SophiaMemoryType; active?: boolean }
  ): Promise<number> {
    const owner = this.requireFounderId(founderId);
    return this.sortedFounderMemories(owner, opts).length;
  }

  /**
   * AUTHORITATIVE COLLECTION READ (P2 follow-up — dedupe must not read the
   * visible page): UNBOUNDED founder-scoped read used ONLY by internal
   * deterministic consumers that must compare against the whole collection:
   *   - the capture stage's duplicate detection (a duplicate of a record
   *     outside the newest-50 window must still be rejected — the phase-2
   *     observation proved the paginated read re-persisted such duplicates);
   *   - the review-queue annotation pool (duplicateOf/similarTo/contradicts
   *     must consider the founder's full set, active + pending).
   * This is the SAME full-collection read every store mutation already
   * performs internally; it is not a new search surface (no filters beyond
   * founder scope / active / type, same total order, no vectors). Route-level
   * pagination (limit/offset) governs what a CLIENT sees; dedupe correctness
   * is a store-internal concern and must never depend on page visibility.
   */
  public async listAllMemories(
    founderId: string,
    opts?: { memoryType?: SophiaMemoryType; active?: boolean }
  ): Promise<SophiaMemoryRecord[]> {
    const owner = this.requireFounderId(founderId);
    return this.sortedFounderMemories(owner, opts).map((m) => ({ ...m }));
  }

  /**
   * Shared deterministic read: full founder-scoped collection, optional exact
   * type/active filters, total order (updatedAt DESC, id ASC).
   */
  private sortedFounderMemories(
    owner: string,
    opts?: { memoryType?: SophiaMemoryType; active?: boolean }
  ): SophiaMemoryRecord[] {
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
    return items;
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
   * M4-A capture-replay guard: reports whether this founder already has any
   * memory whose idempotencyKey starts with the given prefix. The capture
   * stage derives deterministic keys ("m4cap:<conversationId>:<turnId>:<n>")
   * from authoritative turn identity; a REPLAYED turn must never capture
   * again — the prefix check short-circuits the whole capture stage before
   * any extraction or persistence happens. Unbounded by list limits (reads
   * the whole founder-scoped collection, which is the same read the store
   * already performs for dedupe).
   */
  public async hasIdempotencyKeyPrefix(founderId: string, prefix: string): Promise<boolean> {
    const owner = this.requireFounderId(founderId);
    if (typeof prefix !== 'string' || !prefix.trim()) {
      return false;
    }
    const all = this.fileStore.readCollection<SophiaMemoryRecord>(SOPHIA_MEMORIES_COLLECTION);
    return Object.values(all).some(
      (m) =>
        m &&
        m.founderId === owner &&
        typeof m.idempotencyKey === 'string' &&
        m.idempotencyKey.startsWith(prefix)
    );
  }

  /**
   * Helper for tests: clears the personal memory collection.
   */
  public clearForTests(): void {
    this.fileStore.writeCollection(SOPHIA_MEMORIES_COLLECTION, {});
  }
}
