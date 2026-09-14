import {
  ScheduledWorkItem,
  ScheduledWorkFilter,
  ScheduledWorkStatus,
  SchedulerHeartbeatRecord,
} from '../../../types/scheduling';
import { prisma } from '@/lib/server/db/prisma';
import { isAuthoritativeMode, requireAuthoritativeDatabase } from '@/lib/server/db/authority';

/** Bounded in-memory retention of heartbeat records (dev/local mode). */
const HEARTBEAT_RETENTION = 100;

function countsFromRecord(record: SchedulerHeartbeatRecord) {
  return {
    id: record.id,
    processedCount: record.processedCount,
    executedCount: record.executedCount,
    skippedCount: record.skippedCount,
    failedCount: record.failedCount,
    awaitingApprovalCount: record.awaitingApprovalCount,
    cancelledCount: record.cancelledCount,
    durationMs: record.durationMs,
    results: record.results as any,
    triggerSource: record.triggerSource,
    workerId: record.workerId,
    asOfTime: new Date(record.asOfTime),
    evaluatedAt: new Date(record.evaluatedAt),
  };
}

/** Maps a persisted heartbeat row back to the canonical record type. */
function mapHeartbeatRow(row: any): SchedulerHeartbeatRecord {
  const toIso = (v: any): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());
  return {
    id: row.id,
    evaluatedAt: toIso(row.evaluatedAt),
    triggerSource: row.triggerSource === 'cron' ? 'cron' : 'founder',
    workerId: row.workerId,
    asOfTime: toIso(row.asOfTime),
    processedCount: row.processedCount ?? 0,
    executedCount: row.executedCount ?? 0,
    skippedCount: row.skippedCount ?? 0,
    failedCount: row.failedCount ?? 0,
    awaitingApprovalCount: row.awaitingApprovalCount ?? 0,
    cancelledCount: row.cancelledCount ?? 0,
    durationMs: row.durationMs ?? 0,
    results: Array.isArray(row.results) ? row.results : [],
  };
}

/**
 * Interface for persisting Scheduled Work items.
 */
export interface ScheduledWorkStore {
  save(item: ScheduledWorkItem): Promise<void>;
  get(id: string): Promise<ScheduledWorkItem | null>;
  listDue(asOfTime?: string, limit?: number): Promise<ScheduledWorkItem[]>;
  list(filter?: ScheduledWorkFilter): Promise<ScheduledWorkItem[]>;
  cancel(id: string, cancelledBy?: string, reason?: string): Promise<ScheduledWorkItem>;
  update(item: ScheduledWorkItem): Promise<void>;
  clear(): void;
  /** Phase 4.4A — append-only automation heartbeat log (same scheduling authority). */
  recordHeartbeat(record: SchedulerHeartbeatRecord): Promise<void>;
  listHeartbeats(limit?: number): Promise<SchedulerHeartbeatRecord[]>;
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

  async listDue(asOfTime?: string, limit?: number): Promise<ScheduledWorkItem[]> {
    const db = await requireAuthoritativeDatabase();
    const cutoff = asOfTime ? new Date(asOfTime) : new Date();

    const items = await db.scheduledWorkItem.findMany({
      where: {
        status: 'scheduled',
        executeAt: { lte: cutoff },
      },
      orderBy: { executeAt: 'asc' },
      ...(limit !== undefined && limit > 0 ? { take: limit } : {}),
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

  async recordHeartbeat(record: SchedulerHeartbeatRecord): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.schedulerHeartbeat.create({ data: countsFromRecord(record) });
  }

  async listHeartbeats(limit: number = 20): Promise<SchedulerHeartbeatRecord[]> {
    const db = await requireAuthoritativeDatabase();
    const rows = await db.schedulerHeartbeat.findMany({
      orderBy: { evaluatedAt: 'desc' },
      ...(limit > 0 ? { take: limit } : {}),
    });
    return rows.map(mapHeartbeatRow);
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
  /** Phase 4.4A — bounded heartbeat log (dev/local mode). */
  public heartbeats: SchedulerHeartbeatRecord[] = [];
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

  async listDue(asOfTime?: string, limit?: number): Promise<ScheduledWorkItem[]> {
    if (isAuthoritativeMode()) {
      return PostgresScheduledWorkStore.getInstance().listDue(asOfTime, limit);
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

    const sorted = results.sort((a, b) => new Date(a.executeAt).getTime() - new Date(b.executeAt).getTime());
    if (limit !== undefined && limit > 0) {
      return sorted.slice(0, limit);
    }
    return sorted;
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

  async recordHeartbeat(record: SchedulerHeartbeatRecord): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresScheduledWorkStore.getInstance().recordHeartbeat(record);
    }

    this.heartbeats.unshift(JSON.parse(JSON.stringify(record)));
    if (this.heartbeats.length > HEARTBEAT_RETENTION) {
      this.heartbeats.length = HEARTBEAT_RETENTION;
    }

    if (process.env.DATABASE_URL) {
      try {
        await prisma.schedulerHeartbeat.create({ data: countsFromRecord(record) });
      } catch {
        // Offline fallback — in-memory log remains authoritative for this mode
      }
    }
  }

  async listHeartbeats(limit: number = 20): Promise<SchedulerHeartbeatRecord[]> {
    if (isAuthoritativeMode()) {
      return PostgresScheduledWorkStore.getInstance().listHeartbeats(limit);
    }

    const local = this.heartbeats.slice(0, limit > 0 ? limit : this.heartbeats.length);
    if (local.length > 0) return JSON.parse(JSON.stringify(local));

    // Cold-start dev process: recover the persisted tail so the status
    // projection stays honest across dev-server restarts.
    if (process.env.DATABASE_URL) {
      try {
        const rows = await prisma.schedulerHeartbeat.findMany({
          orderBy: { evaluatedAt: 'desc' },
          ...(limit > 0 ? { take: limit } : {}),
        });
        const recovered = rows.map(mapHeartbeatRow);
        this.heartbeats = recovered;
        return JSON.parse(JSON.stringify(recovered));
      } catch {
        // Offline fallback
      }
    }

    return [];
  }

  clear(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Scheduled work items cannot be cleared in production.');
    }
    this.items.clear();
    this.heartbeats = [];
  }
}
