import fs from 'fs';
import path from 'path';
import { DurableFileStore } from './durable-file-store';
import { getLeaseManager, DistributedLeaseData } from '@/lib/server/coordination/lease-manager';
import { isAuthoritativeMode } from '@/lib/server/db/authority';

export interface InstanceLockInfo {
  instanceId: string;
  pid: number;
  startedAt: string;
  lastHeartbeat: string;
  deploymentNote: string;
}

/**
 * Concurrency & Deployment Safety Guard for SamJuniorsOS.
 *
 * ARCHITECTURAL EVOLUTION:
 * Milestone 1.1 used a single-process local file lock (.data/instance.lock) with PID checks.
 * Milestone 2 (Phase 2.3B / Option A) replaces the single-host PID guard with shared
 * distributed leases in the database (distributed_leases table via DistributedLease model).
 *
 * The PID guard is NO LONGER load-bearing across container instances, VMs, or multi-process
 * deployments. Shared leases in the database provide atomic acquire, conditional renewal,
 * and failover reclamation based on expiration timestamps (expiresAt) rather than OS PIDs.
 */
export class InstanceConcurrencyGuard {
  private static instance: InstanceConcurrencyGuard;
  private currentInstanceId: string;
  private lockFilePath: string;
  private heartbeatTimer?: NodeJS.Timeout;
  private databaseHeartbeats: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    const dataDir = DurableFileStore.getInstance().getDataDir();
    this.lockFilePath = path.join(dataDir, 'instance.lock');
    this.currentInstanceId = `inst-${process.pid}-${Date.now()}`;
  }

  public static getInstance(): InstanceConcurrencyGuard {
    if (!InstanceConcurrencyGuard.instance) {
      InstanceConcurrencyGuard.instance = new InstanceConcurrencyGuard();
    }
    return InstanceConcurrencyGuard.instance;
  }


  /**
   * Checks and acquires the single-instance lease.
   */
  public acquireSingleInstanceLease(customLockPath?: string, options?: { failClosed?: boolean }): {
    acquired: boolean;
    activeExistingInstance?: InstanceLockInfo;
    warning?: string;
  } {
    const targetPath = customLockPath || this.lockFilePath;
    const now = new Date().toISOString();

    if (fs.existsSync(targetPath)) {
      try {
        const raw = fs.readFileSync(targetPath, 'utf-8');
        const lockInfo: InstanceLockInfo = JSON.parse(raw);

        const lastBeatTime = new Date(lockInfo.lastHeartbeat).getTime();
        const ageMs = Date.now() - lastBeatTime;

        // If heartbeat is fresh (< 15 seconds) and PID differs, check if owner process is still alive.
        // If the process is confirmed dead, the previous instance crashed and the lease can be safely reclaimed.
        const isOwnerAlive = typeof lockInfo.pid === 'number' && lockInfo.pid > 0
          ? DurableFileStore.isProcessAlive(lockInfo.pid)
          : true;

        if (ageMs < 15000 && lockInfo.pid !== process.pid && isOwnerAlive) {
          const warning = `[CONCURRENCY WARNING]: Another SamJuniorsOS instance (PID ${lockInfo.pid}, ID ${lockInfo.instanceId}) holds the active lease. SamJuniorsOS Milestone 1.1 requires a single instance deployment (min=1, max=1) to prevent state divergence.`;
          console.warn(warning);
          if (options?.failClosed || process.env.STRICT_SINGLE_INSTANCE === 'true') {
            throw new Error(warning);
          }
          return {
            acquired: false,
            activeExistingInstance: lockInfo,
            warning,
          };
        }
      } catch (err: any) {
        if (options?.failClosed && err?.message?.includes('[CONCURRENCY WARNING]')) {
          throw err;
        }
        // Corrupted lock file, proceed to overwrite
      }
    }

    // Write lease atomically via temp file + rename
    const newLock: InstanceLockInfo = {
      instanceId: this.currentInstanceId,
      pid: process.pid,
      startedAt: now,
      lastHeartbeat: now,
      deploymentNote: 'Single-instance constraint enforced for v1. Pin Cloud Run to max-instances=1.',
    };

    const tempPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(newLock, null, 2), 'utf-8');
      fs.renameSync(tempPath, targetPath);
      if (!customLockPath) {
        this.startHeartbeat();
      }
    } catch {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
    }

    return { acquired: true };
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      try {
        if (fs.existsSync(this.lockFilePath)) {
          const raw = fs.readFileSync(this.lockFilePath, 'utf-8');
          const lock: InstanceLockInfo = JSON.parse(raw);
          if (lock.instanceId === this.currentInstanceId) {
            lock.lastHeartbeat = new Date().toISOString();
            const tempBeat = `${this.lockFilePath}.tmp.${process.pid}.${Date.now()}`;
            fs.writeFileSync(tempBeat, JSON.stringify(lock, null, 2), 'utf-8');
            fs.renameSync(tempBeat, this.lockFilePath);
          }
        }
      } catch {}
    }, 5000);
    // Unref so the interval does not keep the Node.js event loop alive
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  public releaseLease(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    for (const [, timer] of this.databaseHeartbeats.entries()) {
      clearInterval(timer);
    }
    this.databaseHeartbeats.clear();

    try {
      if (fs.existsSync(this.lockFilePath)) {
        const raw = fs.readFileSync(this.lockFilePath, 'utf-8');
        const lock: InstanceLockInfo = JSON.parse(raw);
        if (lock.instanceId === this.currentInstanceId) {
          fs.unlinkSync(this.lockFilePath);
        }
      }
    } catch {}
  }

  /**
   * Indicates whether the legacy local OS process PID check is load-bearing.
   * Milestone M2 replaces local PID guards with shared distributed leases in the database.
   * Therefore, PID checks are no longer load-bearing for multi-instance deployments.
   */
  public isPidGuardLoadBearing(): boolean {
    return false;
  }

  /**
   * Acquire a shared distributed instance lease backed by the authoritative database.
   * This replaces single-host PID guards across containers, VMs, and multiple processes.
   * Liveness is enforced by database timestamps (expiresAt and TTL) instead of OS PIDs.
   */
  public async acquireSharedInstanceLease(options?: {
    resourceKey?: string;
    holderId?: string;
    ttlMs?: number;
    heartbeatIntervalMs?: number;
    failClosed?: boolean;
    metadata?: Record<string, any>;
  }): Promise<{
    acquired: boolean;
    lease?: DistributedLeaseData;
    activeLease?: DistributedLeaseData;
    instanceId: string;
    warning?: string;
  }> {
    const resourceKey = options?.resourceKey || 'instance:primary';
    const holderId = options?.holderId || this.currentInstanceId;
    const ttlMs = options?.ttlMs ?? 15000;
    const heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 5000;

    const leaseManager = getLeaseManager({ forceDatabase: true });
    const result = await leaseManager.acquire(resourceKey, holderId, ttlMs, options?.metadata);

    if (result.acquired) {
      // Start heartbeat renewal
      this.startDatabaseHeartbeat(resourceKey, holderId, heartbeatIntervalMs, ttlMs);
      return {
        acquired: true,
        lease: result.lease,
        instanceId: holderId,
      };
    }

    const warning = `[CONCURRENCY WARNING]: Resource "${resourceKey}" is currently held by instance "${result.activeLease?.holderId}" until ${result.activeLease?.expiresAt}. Active database lease prevents conflicting multi-instance operations.`;
    const shouldFailClosed = options?.failClosed !== undefined
      ? options.failClosed
      : process.env.STRICT_SINGLE_INSTANCE === 'true';
    if (shouldFailClosed) {
      throw new Error(warning);
    }

    return {
      acquired: false,
      activeLease: result.activeLease,
      instanceId: holderId,
      warning,
    };
  }

  /**
   * Release an acquired shared database lease and stop its heartbeat.
   */
  public async releaseSharedInstanceLease(resourceKey = 'instance:primary', holderId?: string): Promise<boolean> {
    const targetHolder = holderId || this.currentInstanceId;
    this.stopDatabaseHeartbeat(resourceKey);
    const leaseManager = getLeaseManager({ forceDatabase: true });
    return await leaseManager.release(resourceKey, targetHolder);
  }

  /**
   * Start a background heartbeat to maintain an acquired database lease.
   */
  public startDatabaseHeartbeat(
    resourceKey = 'instance:primary',
    holderId?: string,
    intervalMs = 5000,
    ttlMs = 15000
  ): void {
    const targetHolder = holderId || this.currentInstanceId;
    this.stopDatabaseHeartbeat(resourceKey);

    const timer = setInterval(async () => {
      try {
        const leaseManager = getLeaseManager({ forceDatabase: true });
        const renewed = await leaseManager.renew(resourceKey, targetHolder, ttlMs);
        if (!renewed) {
          console.warn(`[InstanceConcurrencyGuard] Failed to renew lease "${resourceKey}" for instance "${targetHolder}".`);
        }
      } catch (err: any) {
        console.warn(`[InstanceConcurrencyGuard] Heartbeat error on "${resourceKey}":`, err?.message);
      }
    }, intervalMs);

    if (timer.unref) {
      timer.unref();
    }

    this.databaseHeartbeats.set(resourceKey, timer);
  }

  /**
   * Stop background heartbeat for a specific database lease.
   */
  public stopDatabaseHeartbeat(resourceKey = 'instance:primary'): void {
    const existing = this.databaseHeartbeats.get(resourceKey);
    if (existing) {
      clearInterval(existing);
      this.databaseHeartbeats.delete(resourceKey);
    }
  }

  public getDeploymentConstraintDocumentation(): string {
    return `
================================================================================
SamJuniorsOS Multi-Instance Concurrency Architecture (Milestone M2 / Option A)
================================================================================
Milestone: M2 (Always-On Cloud Brain & Shared Persistence)
Status: Shared distributed leases active via Prisma (distributed_leases table)

Evolution from Milestone 1.1:
1. In M1.1, single-instance deployment was enforced via local OS process PID check (.data/instance.lock).
2. In M2, the PID guard is NO LONGER load-bearing. Multi-instance concurrency, leader
   election, and scheduled work partitioning are governed by DistributedLease records
   in the authoritative database (SQLite with Option A volume, target PostgreSQL).
3. If an instance crashes, its lease expires at expiresAt (TTL). A standby or peer
   instance reclaims the lease atomically without inspecting OS PIDs.
4. Concurrency protection:
   - Primary/coordinator leader election: acquireSharedInstanceLease('instance:primary')
   - Work item evaluation: sched-item:\${id}
   - Approval single-action consumption: atomic transaction with consumedAt guard
================================================================================
`;
  }
}

