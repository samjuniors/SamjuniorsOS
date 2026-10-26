/**
 * ============================================================================
 * ROLE BRAIN STORE (G11.5 / M3)
 * ============================================================================
 * Authoritative store for AI employee working and experience memories.
 *
 * GOVERNANCE & ARCHITECTURAL INVARIANTS:
 * 1. Strict Isolation:
 *    One employee cannot read, modify, or delete another employee's working
 *    or experience memory. Cross-employee access throws `RoleBrainSecurityError`.
 * 2. Personal Mind Exclusion:
 *    This store NEVER touches or accesses the Founder's Personal Mind
 *    (`SophiaMemoryStore`). Personal Mind memories are strictly excluded.
 * 3. Never Company Truth:
 *    Records here represent subjective employee scratchpad/experience. They
 *    are never returned as canonical company facts, knowledge, or precedents.
 * 4. Dual-Mode Durability:
 *    Local file-backed durability via `DurableFileStore` collection
 *    `role_brain_memories` + best-effort Prisma mirror (authoritative DB
 *    reads in authoritative mode).
 */

import { randomUUID } from 'node:crypto';
import { AgentRole } from '@/types/os';
import {
  RoleBrainMemoryRecord,
  RoleBrainMemoryScope,
} from '@/types/role-brain';
import { DurableFileStore } from '../persistence/durable-file-store';
import { prisma } from '@/lib/server/db/prisma';
import { isAuthoritativeMode, requireAuthoritativeDatabase } from '@/lib/server/db/authority';

export class RoleBrainSecurityError extends Error {
  public readonly code = 'ROLE_BRAIN_UNAUTHORIZED';
  public readonly statusCode = 403;

  constructor(message: string) {
    super(`[RoleBrainSecurity] ${message}`);
    this.name = 'RoleBrainSecurityError';
  }
}

export class RoleBrainValidationError extends Error {
  public readonly code = 'ROLE_BRAIN_INVALID';
  public readonly statusCode = 400;

  constructor(message: string) {
    super(`[RoleBrainValidation] ${message}`);
    this.name = 'RoleBrainValidationError';
  }
}

const COLLECTION = 'role_brain_memories';
const VALID_ROLES = new Set<string>(['coo', 'researcher', 'pm', 'finance']);
const VALID_SCOPES = new Set<string>(['working', 'experience']);

export interface ListRoleMemoriesOptions {
  scope?: RoleBrainMemoryScope;
  taskContext?: string;
  query?: string;
  limit?: number;
}

export class RoleBrainStore {
  private static instance: RoleBrainStore | null = null;
  private memories: Map<string, RoleBrainMemoryRecord> = new Map();
  private fileStore: DurableFileStore;

  constructor() {
    this.fileStore = DurableFileStore.getInstance();
    this.loadFromStorage();
  }

  public static getInstance(): RoleBrainStore {
    if (!RoleBrainStore.instance) {
      RoleBrainStore.instance = new RoleBrainStore();
    }
    return RoleBrainStore.instance;
  }

  private loadFromStorage(): void {
    try {
      const disk = this.fileStore.readCollection<RoleBrainMemoryRecord>(COLLECTION);
      for (const item of Object.values(disk)) {
        if (item && item.id) {
          this.memories.set(item.id, item);
        }
      }
    } catch {
      // Non-fatal if storage not yet initialized
    }
  }

  private validateRole(role: string): AgentRole {
    const clean = (role || '').trim().toLowerCase();
    if (!VALID_ROLES.has(clean)) {
      throw new RoleBrainValidationError(
        `Invalid agentId/role "${role}". Must be one of [${[...VALID_ROLES].join(', ')}].`
      );
    }
    return clean as AgentRole;
  }

  private validateScope(scope: string): RoleBrainMemoryScope {
    const clean = (scope || '').trim().toLowerCase();
    if (!VALID_SCOPES.has(clean)) {
      throw new RoleBrainValidationError(
        `Invalid memoryScope "${scope}". Must be one of [${[...VALID_SCOPES].join(', ')}].`
      );
    }
    return clean as RoleBrainMemoryScope;
  }

  /**
   * Enforces strict cross-employee isolation.
   * Throws 403 if requestingAgentId differs from targetAgentId.
   */
  public assertIsolation(requestingAgentId: AgentRole, targetAgentId: AgentRole): void {
    if (!requestingAgentId || !targetAgentId) {
      throw new RoleBrainSecurityError('Both requestingAgentId and targetAgentId are required.');
    }
    if (requestingAgentId !== targetAgentId) {
      throw new RoleBrainSecurityError(
        `Access denied: Employee "${requestingAgentId}" cannot read or write memory belonging to "${targetAgentId}".`
      );
    }
  }

  /**
   * Save a memory record for an employee.
   */
  public async saveMemory(record: Partial<RoleBrainMemoryRecord> & {
    agentId: AgentRole;
    memoryScope: RoleBrainMemoryScope;
    content: string;
    provenance: string;
  }): Promise<RoleBrainMemoryRecord> {
    const agentId = this.validateRole(record.agentId);
    const memoryScope = this.validateScope(record.memoryScope);

    if (!record.content || !record.content.trim()) {
      throw new RoleBrainValidationError('Memory content cannot be empty.');
    }

    const now = new Date().toISOString();
    const id = record.id || `rbm-${randomUUID()}`;

    const fullRecord: RoleBrainMemoryRecord = {
      id,
      agentId,
      memoryScope,
      content: record.content.trim(),
      taskContext: record.taskContext?.trim() || undefined,
      provenance: record.provenance?.trim() || 'employee_note',
      metadata: record.metadata ? { ...record.metadata } : {},
      createdAt: record.createdAt || now,
      updatedAt: now,
    };

    if (isAuthoritativeMode()) {
      const db = await requireAuthoritativeDatabase();
      await (db as any).roleBrainMemory.upsert({
        where: { id },
        create: {
          id: fullRecord.id,
          agentId: fullRecord.agentId,
          memoryScope: fullRecord.memoryScope,
          content: fullRecord.content,
          taskContext: fullRecord.taskContext || null,
          provenance: fullRecord.provenance,
          metadata: fullRecord.metadata,
          createdAt: new Date(fullRecord.createdAt),
          updatedAt: new Date(fullRecord.updatedAt),
        },
        update: {
          content: fullRecord.content,
          taskContext: fullRecord.taskContext || null,
          provenance: fullRecord.provenance,
          metadata: fullRecord.metadata,
          updatedAt: new Date(fullRecord.updatedAt),
        },
      });
      return fullRecord;
    }

    // Local mode: strictly under lock
    this.fileStore.saveItemStrict(COLLECTION, id, fullRecord);
    this.memories.set(id, fullRecord);

    // Best-effort Prisma mirror
    try {
      if ((prisma as any)?.roleBrainMemory) {
        await (prisma as any).roleBrainMemory.upsert({
          where: { id },
          create: {
            id: fullRecord.id,
            agentId: fullRecord.agentId,
            memoryScope: fullRecord.memoryScope,
            content: fullRecord.content,
            taskContext: fullRecord.taskContext || null,
            provenance: fullRecord.provenance,
            metadata: fullRecord.metadata,
            createdAt: new Date(fullRecord.createdAt),
            updatedAt: new Date(fullRecord.updatedAt),
          },
          update: {
            content: fullRecord.content,
            taskContext: fullRecord.taskContext || null,
            provenance: fullRecord.provenance,
            metadata: fullRecord.metadata,
            updatedAt: new Date(fullRecord.updatedAt),
          },
        });
      }
    } catch {
      // Non-fatal if DB is offline or unset in local mode
    }

    return fullRecord;
  }

  /**
   * List memories for an employee with strict isolation enforcement.
   */
  public async listMemories(
    requestingAgentId: AgentRole,
    targetAgentId: AgentRole,
    opts?: ListRoleMemoriesOptions
  ): Promise<RoleBrainMemoryRecord[]> {
    this.assertIsolation(requestingAgentId, targetAgentId);
    const agentId = this.validateRole(targetAgentId);

    if (isAuthoritativeMode()) {
      const db = await requireAuthoritativeDatabase();
      const where: any = { agentId };
      if (opts?.scope) where.memoryScope = opts.scope;
      if (opts?.taskContext) where.taskContext = opts.taskContext;

      const rows = await (db as any).roleBrainMemory.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      });

      let items: RoleBrainMemoryRecord[] = rows.map((r: any) => ({
        id: r.id,
        agentId: r.agentId as AgentRole,
        memoryScope: r.memoryScope as RoleBrainMemoryScope,
        content: r.content,
        taskContext: r.taskContext || undefined,
        provenance: r.provenance,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString ? r.createdAt.toISOString() : String(r.createdAt),
        updatedAt: r.updatedAt.toISOString ? r.updatedAt.toISOString() : String(r.updatedAt),
      }));

      if (opts?.query?.trim()) {
        const qTokens = opts.query.toLowerCase().split(/\s+/).filter(Boolean);
        items = items.filter((item) => {
          const text = item.content.toLowerCase();
          return qTokens.some((tok) => text.includes(tok));
        });
      }

      if (opts?.limit && opts.limit > 0) {
        items = items.slice(0, opts.limit);
      }
      return items;
    }

    // Local mode
    let items = Array.from(this.memories.values()).filter((m) => m.agentId === agentId);

    if (opts?.scope) {
      items = items.filter((m) => m.memoryScope === opts.scope);
    }
    if (opts?.taskContext) {
      items = items.filter((m) => m.taskContext === opts.taskContext);
    }
    if (opts?.query?.trim()) {
      const qTokens = opts.query.toLowerCase().split(/\s+/).filter(Boolean);
      items = items.filter((item) => {
        const text = item.content.toLowerCase();
        return qTokens.some((tok) => text.includes(tok));
      });
    }

    items.sort((a, b) => {
      const ta = Date.parse(a.updatedAt) || 0;
      const tb = Date.parse(b.updatedAt) || 0;
      if (tb !== ta) return tb - ta;
      return a.id.localeCompare(b.id);
    });

    if (opts?.limit && opts.limit > 0) {
      items = items.slice(0, opts.limit);
    }

    return items.map((m) => ({ ...m }));
  }

  /**
   * Clear working scratchpad memory for a completed task or run.
   */
  public async clearWorkingMemory(
    requestingAgentId: AgentRole,
    targetAgentId: AgentRole,
    taskContext?: string
  ): Promise<number> {
    this.assertIsolation(requestingAgentId, targetAgentId);
    const agentId = this.validateRole(targetAgentId);

    if (isAuthoritativeMode()) {
      const db = await requireAuthoritativeDatabase();
      const where: any = { agentId, memoryScope: 'working' };
      if (taskContext) where.taskContext = taskContext;
      const res = await (db as any).roleBrainMemory.deleteMany({ where });
      return res.count;
    }

    let deletedCount = 0;
    for (const [id, mem] of [...this.memories.entries()]) {
      if (mem.agentId === agentId && mem.memoryScope === 'working') {
        if (!taskContext || mem.taskContext === taskContext) {
          this.memories.delete(id);
          try {
            this.fileStore.deleteItem(COLLECTION, id);
          } catch {}
          deletedCount++;
        }
      }
    }

    try {
      if ((prisma as any)?.roleBrainMemory) {
        const where: any = { agentId, memoryScope: 'working' };
        if (taskContext) where.taskContext = taskContext;
        await (prisma as any).roleBrainMemory.deleteMany({ where });
      }
    } catch {}

    return deletedCount;
  }

  /**
   * Delete a single memory record by ID.
   */
  public async deleteMemory(
    requestingAgentId: AgentRole,
    targetAgentId: AgentRole,
    memoryId: string
  ): Promise<boolean> {
    this.assertIsolation(requestingAgentId, targetAgentId);
    const agentId = this.validateRole(targetAgentId);
    const cleanId = (memoryId || '').trim();
    if (!cleanId) return false;

    if (isAuthoritativeMode()) {
      const db = await requireAuthoritativeDatabase();
      const res = await (db as any).roleBrainMemory.deleteMany({
        where: { id: cleanId, agentId },
      });
      return res.count > 0;
    }

    const mem = this.memories.get(cleanId);
    if (!mem || mem.agentId !== agentId) return false;

    this.memories.delete(cleanId);
    try {
      this.fileStore.deleteItem(COLLECTION, cleanId);
    } catch {}

    try {
      if ((prisma as any)?.roleBrainMemory) {
        await (prisma as any).roleBrainMemory.deleteMany({
          where: { id: cleanId, agentId },
        });
      }
    } catch {}

    return true;
  }
}
