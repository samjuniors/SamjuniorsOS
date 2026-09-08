import fs from 'fs';
import path from 'path';
import { DurableFileStore } from './durable-file-store';

export interface InstanceLockInfo {
  instanceId: string;
  pid: number;
  startedAt: string;
  lastHeartbeat: string;
  deploymentNote: string;
}

/**
 * Concurrency & Deployment Safety Guard for SamJuniorsOS Milestone 1.1.
 *
 * ARCHITECTURAL INVARIANT (§9 Concurrency):
 * Milestone 1.1 persists durable state to the local container volume.
 * Running more than one concurrent container instance (e.g. Cloud Run auto-scaling)
 * causes store divergence because separate instances cannot coordinate file locks.
 *
 * Deployment Target Configuration:
 * - Cloud Run min-instances: 1
 * - Cloud Run max-instances: 1
 * - Concurrency: 80 requests / 1 container instance
 */
export class InstanceConcurrencyGuard {
  private static instance: InstanceConcurrencyGuard;
  private currentInstanceId: string;
  private lockFilePath: string;
  private heartbeatTimer?: NodeJS.Timeout;

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
  public acquireSingleInstanceLease(customLockPath?: string): {
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

        // If heartbeat is fresh (< 15 seconds) and PID differs, another instance is running
        if (ageMs < 15000 && lockInfo.pid !== process.pid) {
          const warning = `[CONCURRENCY WARNING]: Another SamJuniorsOS instance (PID ${lockInfo.pid}, ID ${lockInfo.instanceId}) holds the active lease. SamJuniorsOS Milestone 1.1 requires a single instance deployment (min=1, max=1) to prevent state divergence.`;
          console.warn(warning);
          return {
            acquired: false,
            activeExistingInstance: lockInfo,
            warning,
          };
        }
      } catch {
        // Corrupted lock file, proceed to overwrite
      }
    }

    // Write lease
    const newLock: InstanceLockInfo = {
      instanceId: this.currentInstanceId,
      pid: process.pid,
      startedAt: now,
      lastHeartbeat: now,
      deploymentNote: 'Single-instance constraint enforced for v1. Pin Cloud Run to max-instances=1.',
    };

    try {
      fs.writeFileSync(targetPath, JSON.stringify(newLock, null, 2), 'utf-8');
      if (!customLockPath) {
        this.startHeartbeat();
      }
    } catch {
      // ignore
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
            fs.writeFileSync(this.lockFilePath, JSON.stringify(lock, null, 2), 'utf-8');
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

  public getDeploymentConstraintDocumentation(): string {
    return `
================================================================================
SamJuniorsOS v1 Single-Instance Deployment Constraint
================================================================================
Current Milestone: 1.1
Requirement: Single Instance Deployment (Pinned max-instances=1, min-instances=1)

Why single instance is required for v1:
1. Milestone 1.1 uses file-backed durable persistence (.data/) which provides
   process-restart durability for a single container.
2. If multiple container instances run concurrently without shared Postgres:
   - Workflow step states can diverge across containers.
   - Approval single-action consumption can be double-consumed.
   - Company state mutations in Container A will not replicate to Container B.
3. Cloud Run Service Configuration:
   - max-instances=1
   - min-instances=1
   - Concurrency: 80 requests / instance
4. Target Architecture (§13): Full multi-instance concurrency requires PostgreSQL
   distributed row-locks and transactional leasing.
================================================================================
`;
  }
}
