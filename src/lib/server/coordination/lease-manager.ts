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
 * Authoritative Lease Manager (target: PostgreSQL — see M0 naming note).
 * DATABASE REALITY: in this sandbox branch the Prisma schema is the SQLite port,
 * so "Postgres*" classes currently run against SQLite via Prisma. The class
 * names refer to the target architecture (M6 migration milestone).
 * Operates directly against the `distributed_leases` table via Prisma.
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

  async acquire(
    resourceKey: string,
    holderId: string,
    ttlMs: number,
    metadata?: Record<string, any>
  ): Promise<LeaseAcquireResult> {
    const db = await requireAuthoritativeDatabase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    try {
      const existing = await db.distributedLease.findUnique({
        where: { resourceKey },
      });

      if (!existing) {
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
          // Concurrent insert race (unique constraint violation P2002)
          if (createErr.code === 'P2002') {
            const active = await db.distributedLease.findUnique({ where: { resourceKey } });
            return {
              acquired: false,
              activeLease: active ? mapPrismaLease(active) : undefined,
              reason: 'concurrent_acquisition_lost',
            };
          }
          throw createErr;
        }
      }

      // Lease exists: check expiration
      if (existing.expiresAt > now) {
        // If the SAME holder re-acquires, renew/extend the lease
        if (existing.holderId === holderId) {
          const updated = await db.distributedLease.update({
            where: { resourceKey },
            data: {
              expiresAt,
              metadata: metadata !== undefined ? metadata : (existing.metadata as any),
              updatedAt: now,
            },
          });
          return { acquired: true, lease: mapPrismaLease(updated) };
        }
        // Lease is still validly held by another worker
        return {
          acquired: false,
          activeLease: mapPrismaLease(existing),
          reason: 'active_lease_held_by_another_worker',
        };
      }

      // Lease is expired: atomically reclaim
      const updated = await db.distributedLease.updateMany({
        where: {
          resourceKey,
          expiresAt: { lte: now }, // Ensure no concurrent renew or reclaim occurred
        },
        data: {
          holderId,
          acquiredAt: now,
          expiresAt,
          metadata: metadata ?? {},
          updatedAt: now,
        },
      });

      if (updated.count === 1) {
        const fresh = await db.distributedLease.findUnique({ where: { resourceKey } });
        return { acquired: true, lease: mapPrismaLease(fresh!) };
      } else {
        // Another worker reclaimed it concurrently
        const active = await db.distributedLease.findUnique({ where: { resourceKey } });
        return {
          acquired: false,
          activeLease: active ? mapPrismaLease(active) : undefined,
          reason: 'concurrent_reclamation_lost',
        };
      }
    } catch (err: any) {
      // In SQLite/Postgres concurrent races, a transaction write conflict (P2034), unique constraint (P2002),
      // or busy lock indicates another concurrent worker acquired or reclaimed the lease.
      if (
        err?.code === 'P2034' ||
        err?.code === 'P2002' ||
        err?.message?.includes('database is locked') ||
        err?.message?.includes('write conflict')
      ) {
        try {
          const active = await db.distributedLease.findUnique({ where: { resourceKey } });
          return {
            acquired: false,
            activeLease: active ? mapPrismaLease(active) : undefined,
            reason: 'concurrent_acquisition_lost',
          };
        } catch {
          // Ignore and rethrow original below
        }
      }
      throw err;
    }
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
 * Options for lease manager resolution.
 */
export interface GetLeaseManagerOptions {
  forceDatabase?: boolean;
}

/**
 * Factory returning appropriate LeaseManager depending on mode.
 * Defaults to DatabaseDistributedLeaseManager (PostgresLeaseManager) in authoritative mode
 * or when forceDatabase is specified; otherwise falls back to InMemoryLeaseManager.
 */
export function getLeaseManager(options?: GetLeaseManagerOptions): LeaseManager {
  if (options?.forceDatabase || isAuthoritativeMode()) {
    return PostgresLeaseManager.getInstance();
  }
  return InMemoryLeaseManager.getInstance();
}

/**
 * Canonical alias for the Prisma-backed database lease manager.
 * Operates on the distributed_leases table via Prisma (SQLite or PostgreSQL).
 */
export { PostgresLeaseManager as DatabaseDistributedLeaseManager };

