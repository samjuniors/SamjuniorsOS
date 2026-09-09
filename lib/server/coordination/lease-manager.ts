import { prisma } from '@/lib/server/db/prisma';
import { isAuthoritativeMode, requireAuthoritativeDatabase } from '@/lib/server/db/authority';
import { v4 as uuidv4 } from 'uuid';

export interface DistributedLeaseData {
  resourceKey: string;
  holderId: string;
  acquiredAt: string; // ISO 8601
  expiresAt: string;  // ISO 8601
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface LeaseAcquireResult {
  acquired: boolean;
  lease?: DistributedLeaseData;
  activeLease?: DistributedLeaseData;
  reason?: string;
}

export interface LeaseManager {
  acquire(resourceKey: string, holderId: string, ttlMs: number, metadata?: Record<string, any>): Promise<LeaseAcquireResult>;
  renew(resourceKey: string, holderId: string, ttlMs: number): Promise<boolean>;
  release(resourceKey: string, holderId: string): Promise<boolean>;
  get(resourceKey: string): Promise<DistributedLeaseData | null>;
  clear(): Promise<void> | void;
}

/**
 * Generate a unique worker identity incorporating host/revision and process ID
 * to safely distinguish workers across nodes and container instances without exposing secrets.
 */
export function generateWorkerIdentity(): string {
  const host = process.env.HOSTNAME || process.env.K_REVISION || 'local';
  const pid = process.pid;
  const rand = uuidv4().slice(0, 8);
  return `worker:${host}:${pid}:${rand}`;
}

function mapPrismaLease(record: any): DistributedLeaseData {
  return {
    resourceKey: record.resourceKey,
    holderId: record.holderId,
    acquiredAt: record.acquiredAt instanceof Date ? record.acquiredAt.toISOString() : new Date(record.acquiredAt).toISOString(),
    expiresAt: record.expiresAt instanceof Date ? record.expiresAt.toISOString() : new Date(record.expiresAt).toISOString(),
    metadata: record.metadata ? (record.metadata as Record<string, any>) : undefined,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : new Date(record.createdAt).toISOString(),
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : new Date(record.updatedAt).toISOString(),
  };
}

/**
 * Authoritative PostgreSQL Lease Manager.
 * Operates directly against PostgreSQL `distributed_leases` table.
 * Uses atomic transactions and conditional queries to guarantee at-most-one active worker ownership.
 */
export class PostgresLeaseManager implements LeaseManager {
  private static instance: PostgresLeaseManager;

  public static getInstance(): PostgresLeaseManager {
    if (!PostgresLeaseManager.instance) {
      PostgresLeaseManager.instance = new PostgresLeaseManager();
    }
    return PostgresLeaseManager.instance;
  }

  /**
   * Acquire a distributed lease using ONLY atomic single statements.
   *
   * Phase 2.6 hardening: the previous implementation resolved the P2002 insert race by
   * issuing a follow-up query INSIDE the same interactive transaction. Under PostgreSQL
   * that transaction is already aborted (25P02 — current transaction is aborted, commands
   * ignored until end of transaction block), so every losing worker crashed with
   * PrismaClientUnknownRequestError instead of cleanly returning acquired=false.
   *
   * The corrected protocol never runs recovery logic on an aborted connection:
   *   1. Guarded conditional UPDATE — atomically reclaims an expired lease
   *      (WHERE resourceKey AND expiresAt <= now). Zero rows matched means the row
   *      is absent or still actively held.
   *   2. INSERT anchor — creates the row when absent; the resourceKey PRIMARY KEY
   *      constraint alone decides the winner when workers race to create it.
   *   3. P2002 loser resolution — a FRESH read on a healthy connection (never inside
   *      a transaction) reports the true active lease. If the winner already released
   *      before the fresh read, the resource is genuinely free and we retry (bounded).
   */
  async acquire(
    resourceKey: string,
    holderId: string,
    ttlMs: number,
    metadata?: Record<string, any>
  ): Promise<LeaseAcquireResult> {
    const db = await requireAuthoritativeDatabase();
    const MAX_ACQUIRE_ATTEMPTS = 5;
    let lastActiveLease: DistributedLeaseData | undefined;
    let lastReason = 'concurrent_acquisition_lost';

    for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt++) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs);

      // Path 1 — atomic guarded reclaim of an expired (or absent-but-matched) lease row.
      const reclaimed = await db.distributedLease.updateMany({
        where: {
          resourceKey,
          expiresAt: { lte: now }, // Guard: only reclaim if genuinely expired
        },
        data: {
          holderId,
          acquiredAt: now,
          expiresAt,
          metadata: metadata ?? {},
          updatedAt: now,
        },
      });

      if (reclaimed.count === 1) {
        // We are now the holder: report from a fresh read so callers observe durable state.
        const fresh = await db.distributedLease.findUnique({ where: { resourceKey } });
        if (fresh) {
          return { acquired: true, lease: mapPrismaLease(fresh) };
        }
        // Extremely unlikely (we hold the row): retry rather than fabricate success.
        lastReason = 'reclaimed_row_vanished_before_read';
        continue;
      }

      // Path 2 — INSERT anchor: row is absent (or actively held, in which case P2002 decides).
      try {
        const created = await db.distributedLease.create({
          data: {
            resourceKey,
            holderId,
            acquiredAt: now,
            expiresAt,
            metadata: metadata ?? {},
          },
        });
        return { acquired: true, lease: mapPrismaLease(created) };
      } catch (createErr: any) {
        if (createErr.code !== 'P2002') {
          throw createErr;
        }
        // Lost the insert race (resourceKey PRIMARY KEY). Resolve the winner via a
        // FRESH read outside any transaction — never on the aborted statement path.
        const active = await db.distributedLease.findUnique({ where: { resourceKey } });
        if (!active) {
          // Winner inserted and released before our fresh read: resource is free — retry.
          lastReason = 'concurrent_release_during_acquisition';
          continue;
        }
        lastActiveLease = mapPrismaLease(active);
        return {
          acquired: false,
          activeLease: lastActiveLease,
          reason: active.holderId === holderId ? 'already_held_by_self' : 'active_lease_held_by_another_worker',
        };
      }
    }

    return { acquired: false, activeLease: lastActiveLease, reason: lastReason };
  }

  async renew(resourceKey: string, holderId: string, ttlMs: number): Promise<boolean> {
    const db = await requireAuthoritativeDatabase();
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + ttlMs);

    // Atomic conditional update: must match resourceKey AND current holderId AND not be expired
    const result = await db.distributedLease.updateMany({
      where: {
        resourceKey,
        holderId,
        expiresAt: { gt: now },
      },
      data: {
        expiresAt: newExpiresAt,
        updatedAt: now,
      },
    });

    return result.count === 1;
  }

  async release(resourceKey: string, holderId: string): Promise<boolean> {
    const db = await requireAuthoritativeDatabase();

    // Atomic conditional delete: only the current holder may release
    const result = await db.distributedLease.deleteMany({
      where: {
        resourceKey,
        holderId,
      },
    });

    return result.count === 1;
  }

  async get(resourceKey: string): Promise<DistributedLeaseData | null> {
    const db = await requireAuthoritativeDatabase();
    const found = await db.distributedLease.findUnique({ where: { resourceKey } });
    if (!found) return null;
    return mapPrismaLease(found);
  }

  async clear(): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.distributedLease.deleteMany();
  }
}

/**
 * In-Memory Lease Manager.
 * Thread-safe simulated distributed lease manager for unit testing and offline development.
 */
export class InMemoryLeaseManager implements LeaseManager {
  private leases: Map<string, DistributedLeaseData> = new Map();
  private static instance: InMemoryLeaseManager;

  public static getInstance(): InMemoryLeaseManager {
    if (!InMemoryLeaseManager.instance) {
      InMemoryLeaseManager.instance = new InMemoryLeaseManager();
    }
    return InMemoryLeaseManager.instance;
  }

  async acquire(
    resourceKey: string,
    holderId: string,
    ttlMs: number,
    metadata?: Record<string, any>
  ): Promise<LeaseAcquireResult> {
    if (isAuthoritativeMode()) {
      return PostgresLeaseManager.getInstance().acquire(resourceKey, holderId, ttlMs, metadata);
    }

    const now = new Date();
    const existing = this.leases.get(resourceKey);

    if (existing) {
      const expiresAt = new Date(existing.expiresAt);
      if (expiresAt > now) {
        return {
          acquired: false,
          activeLease: JSON.parse(JSON.stringify(existing)),
          reason: 'active_lease_held_by_another_worker',
        };
      }
    }

    // Unallocated or expired: acquire
    const newExpiresAt = new Date(now.getTime() + ttlMs).toISOString();
    const leaseData: DistributedLeaseData = {
      resourceKey,
      holderId,
      acquiredAt: now.toISOString(),
      expiresAt: newExpiresAt,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      createdAt: existing ? existing.createdAt : now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.leases.set(resourceKey, leaseData);
    return { acquired: true, lease: JSON.parse(JSON.stringify(leaseData)) };
  }

  async renew(resourceKey: string, holderId: string, ttlMs: number): Promise<boolean> {
    if (isAuthoritativeMode()) {
      return PostgresLeaseManager.getInstance().renew(resourceKey, holderId, ttlMs);
    }

    const now = new Date();
    const existing = this.leases.get(resourceKey);
    if (!existing) return false;

    // Strict validation: holder must match and existing lease must not be expired
    if (existing.holderId !== holderId) return false;
    if (new Date(existing.expiresAt) <= now) return false;

    existing.expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    existing.updatedAt = now.toISOString();
    this.leases.set(resourceKey, existing);
    return true;
  }

  async release(resourceKey: string, holderId: string): Promise<boolean> {
    if (isAuthoritativeMode()) {
      return PostgresLeaseManager.getInstance().release(resourceKey, holderId);
    }

    const existing = this.leases.get(resourceKey);
    if (!existing) return false;

    // Only current holder can release
    if (existing.holderId !== holderId) return false;

    this.leases.delete(resourceKey);
    return true;
  }

  async get(resourceKey: string): Promise<DistributedLeaseData | null> {
    if (isAuthoritativeMode()) {
      return PostgresLeaseManager.getInstance().get(resourceKey);
    }

    const existing = this.leases.get(resourceKey);
    if (!existing) return null;
    return JSON.parse(JSON.stringify(existing));
  }

  clear(): void {
    this.leases.clear();
  }
}

/**
 * Factory returning appropriate LeaseManager depending on mode.
 */
export function getLeaseManager(): LeaseManager {
  if (isAuthoritativeMode()) {
    return PostgresLeaseManager.getInstance();
  }
  return InMemoryLeaseManager.getInstance();
}
