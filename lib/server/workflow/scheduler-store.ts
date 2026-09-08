import { ScheduledWorkItem, ScheduledWorkFilter, ScheduledWorkStatus } from '../../../types/scheduling';
import { prisma } from '@/lib/server/db/prisma';
import { isAuthoritativeMode, requireAuthoritativeDatabase } from '@/lib/server/db/authority';

/**
 * Interface for persisting Scheduled Work items.
 */
export interface ScheduledWorkStore {
  save(item: ScheduledWorkItem): Promise<void>;
  get(id: string): Promise<ScheduledWorkItem | null>;
  listDue(asOfTime?: string): Promise<ScheduledWorkItem[]>;
  list(filter?: ScheduledWorkFilter): Promise<ScheduledWorkItem[]>;
  cancel(id: string, cancelledBy?: string, reason?: string): Promise<ScheduledWorkItem>;
  update(item: ScheduledWorkItem): Promise<void>;
  clear(): void;
}

/**
 * Authoritative PostgreSQL ScheduledWorkStore.
 * Direct persistence to PostgreSQL via Prisma. Fail-closed on database failure.
 */
export class PostgresScheduledWorkStore implements ScheduledWorkStore {
  private static instance: PostgresScheduledWorkStore;

  public static getInstance(): PostgresScheduledWorkStore {
    if (!PostgresScheduledWorkStore.instance) {
      PostgresScheduledWorkStore.instance = new PostgresScheduledWorkStore();
    }
    return PostgresScheduledWorkStore.instance;
  }

  async save(item: ScheduledWorkItem): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.scheduledWorkItem.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        workflowInstanceId: item.workflowInstanceId,
        stepId: item.stepId,
        executeAt: new Date(item.executeAt),
        status: item.status,
        idempotencyKey: item.id,
        metadata: (item as any) ?? {},
      },
      update: {
        executeAt: new Date(item.executeAt),
        status: item.status,
        metadata: (item as any) ?? {},
      },
    });
  }

  async get(id: string): Promise<ScheduledWorkItem | null> {
    const db = await requireAuthoritativeDatabase();
    const found = await db.scheduledWorkItem.findUnique({ where: { id } });
    if (!found || !found.metadata) return null;
    return found.metadata as unknown as ScheduledWorkItem;
  }

  async listDue(asOfTime?: string): Promise<ScheduledWorkItem[]> {
    const db = await requireAuthoritativeDatabase();
    const cutoff = asOfTime ? new Date(asOfTime) : new Date();

    const items = await db.scheduledWorkItem.findMany({
      where: {
        status: 'scheduled',
        executeAt: { lte: cutoff },
      },
      orderBy: { executeAt: 'asc' },
    });

    return items.map((i) => i.metadata as unknown as ScheduledWorkItem);
  }

  async list(filter?: ScheduledWorkFilter): Promise<ScheduledWorkItem[]> {
    const db = await requireAuthoritativeDatabase();
    const where: any = {};
    if (filter?.workflowInstanceId) where.workflowInstanceId = filter.workflowInstanceId;
    if (filter?.stepId) where.stepId = filter.stepId;
    if (filter?.status) where.status = filter.status;

    const items = await db.scheduledWorkItem.findMany({
      where,
      orderBy: { executeAt: 'asc' },
    });

    let results = items.map((i) => i.metadata as unknown as ScheduledWorkItem);
    if (filter?.scheduleType) {
      results = results.filter((i) => i.scheduleType === filter.scheduleType);
    }
    return results;
  }

  async cancel(id: string, cancelledBy: string = 'founder', reason?: string): Promise<ScheduledWorkItem> {
    const db = await requireAuthoritativeDatabase();
    const found = await db.scheduledWorkItem.findUnique({ where: { id } });
    if (!found || !found.metadata) {
      throw new Error(`Scheduled work item not found: ${id}`);
    }

    const item = found.metadata as unknown as ScheduledWorkItem;
    if (item.status === 'completed' || item.status === 'cancelled') {
      return item;
    }

    const now = new Date().toISOString();
    item.status = 'cancelled';
    item.updatedAt = now;
    item.cancellationState = {
      cancelledAt: now,
      cancelledBy,
      reason: reason || 'Cancelled by request',
    };

    await db.scheduledWorkItem.update({
      where: { id },
      data: {
        status: 'cancelled',
        metadata: item as any,
      },
    });

    return item;
  }

  async update(item: ScheduledWorkItem): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.scheduledWorkItem.update({
      where: { id: item.id },
      data: {
        status: item.status,
        executeAt: new Date(item.executeAt),
        metadata: item as any,
      },
    });
  }

  clear(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Scheduled work items cannot be cleared in production.');
    }
  }
}

/**
 * Dual-Mode ScheduledWorkStore.
 * In Authoritative Mode: delegates directly to PostgresScheduledWorkStore (fail-closed).
 * In Test/Local Mode: uses fast in-memory maps with local file persistence.
 */
export class InMemoryScheduledWorkStore implements ScheduledWorkStore {
  public items: Map<string, ScheduledWorkItem> = new Map();
  private static instance: InMemoryScheduledWorkStore;

  private constructor() {}

  public static getInstance(): InMemoryScheduledWorkStore {
    if (!InMemoryScheduledWorkStore.instance) {
      InMemoryScheduledWorkStore.instance = new InMemoryScheduledWorkStore();
    }
    return InMemoryScheduledWorkStore.instance;
  }

  async save(item: ScheduledWorkItem): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresScheduledWorkStore.getInstance().save(item);
    }

    this.items.set(item.id, JSON.parse(JSON.stringify(item)));

    if (process.env.DATABASE_URL) {
      try {
        await prisma.scheduledWorkItem.upsert({
          where: { id: item.id },
          create: {
            id: item.id,
            workflowInstanceId: item.workflowInstanceId,
            stepId: item.stepId,
            executeAt: new Date(item.executeAt),
            status: item.status,
            idempotencyKey: item.id,
            metadata: (item as any) ?? {},
          },
          update: {
            executeAt: new Date(item.executeAt),
            status: item.status,
            metadata: (item as any) ?? {},
          },
        });
      } catch {
        // Fallback safely for offline test environments
      }
    }
  }

  async get(id: string): Promise<ScheduledWorkItem | null> {
    if (isAuthoritativeMode()) {
      return PostgresScheduledWorkStore.getInstance().get(id);
    }

    const item = this.items.get(id);
    if (item) return JSON.parse(JSON.stringify(item));

    if (process.env.DATABASE_URL) {
      try {
        const dbItem = await prisma.scheduledWorkItem.findUnique({ where: { id } });
        if (dbItem && dbItem.metadata) {
          const mapped = dbItem.metadata as unknown as ScheduledWorkItem;
          this.items.set(mapped.id, mapped);
          return mapped;
        }
      } catch {
        // Fallback
      }
    }

    return null;
  }

  async listDue(asOfTime?: string): Promise<ScheduledWorkItem[]> {
    if (isAuthoritativeMode()) {
      return PostgresScheduledWorkStore.getInstance().listDue(asOfTime);
    }

    const cutoff = asOfTime ? new Date(asOfTime).getTime() : Date.now();
    const results: ScheduledWorkItem[] = [];

    for (const item of this.items.values()) {
      if (item.status === 'scheduled') {
        const executeTime = new Date(item.executeAt).getTime();
        if (!isNaN(executeTime) && executeTime <= cutoff) {
          results.push(JSON.parse(JSON.stringify(item)));
        }
      }
    }

    return results.sort((a, b) => new Date(a.executeAt).getTime() - new Date(b.executeAt).getTime());
  }

  async list(filter?: ScheduledWorkFilter): Promise<ScheduledWorkItem[]> {
    if (isAuthoritativeMode()) {
      return PostgresScheduledWorkStore.getInstance().list(filter);
    }

    let results = Array.from(this.items.values());

    if (filter) {
      if (filter.workflowInstanceId) {
        results = results.filter((i) => i.workflowInstanceId === filter.workflowInstanceId);
      }
      if (filter.stepId) {
        results = results.filter((i) => i.stepId === filter.stepId);
      }
      if (filter.status) {
        results = results.filter((i) => i.status === filter.status);
      }
      if (filter.scheduleType) {
        results = results.filter((i) => i.scheduleType === filter.scheduleType);
      }
    }

    return results.map((i) => JSON.parse(JSON.stringify(i)));
  }

  async cancel(id: string, cancelledBy: string = 'founder', reason?: string): Promise<ScheduledWorkItem> {
    if (isAuthoritativeMode()) {
      return PostgresScheduledWorkStore.getInstance().cancel(id, cancelledBy, reason);
    }

    const item = this.items.get(id);
    if (!item) {
      throw new Error(`Scheduled work item not found: ${id}`);
    }

    if (item.status === 'completed' || item.status === 'cancelled') {
      return JSON.parse(JSON.stringify(item));
    }

    const now = new Date().toISOString();
    item.status = 'cancelled';
    item.updatedAt = now;
    item.cancellationState = {
      cancelledAt: now,
      cancelledBy,
      reason: reason || 'Cancelled by request',
    };

    this.items.set(id, item);

    if (process.env.DATABASE_URL) {
      try {
        await prisma.scheduledWorkItem.update({
          where: { id },
          data: {
            status: 'cancelled',
            metadata: item as any,
          },
        });
      } catch {
        // Fallback
      }
    }

    return JSON.parse(JSON.stringify(item));
  }

  async update(item: ScheduledWorkItem): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresScheduledWorkStore.getInstance().update(item);
    }

    const clone = JSON.parse(JSON.stringify(item));
    this.items.set(item.id, clone);

    if (process.env.DATABASE_URL) {
      try {
        await prisma.scheduledWorkItem.update({
          where: { id: item.id },
          data: {
            status: item.status,
            executeAt: new Date(item.executeAt),
            metadata: clone as any,
          },
        });
      } catch {
        // Fallback
      }
    }
  }

  clear(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Scheduled work items cannot be cleared in production.');
    }
    this.items.clear();
  }
}
