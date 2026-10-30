/**
 * ============================================================================
 * STOP CONTROL & SAFE MODE (M1.7 — Security / Stop Control)
 * ============================================================================
 *
 * Deterministic kill-switch and safe-mode freeze for SamJuniorsOS.
 * One command by voice ("stop", "halt", "freeze", etc.) or UI panel:
 *   1. Freezes in-flight turns across all sessions immediately via cooperative
 *      abort signals (settles cleanly, never hangs, works with provider down).
 *   2. Freezes scheduled work and autonomous workflows so no background tasks
 *      can trigger while stopped.
 *   3. Drops the system into Safe Mode (read-only / suspended execution).
 *   4. Requires explicit Founder confirmation to resume.
 *
 * ZERO MODEL DEPENDENCY:
 *   Every function here is 100% deterministic code. If every external model
 *   provider (Gemini, OpenAI, Anthropic, LM Studio) is unreachable, throwing
 *   500s or timing out, this stop control executes instantaneously and
 *   fail-closed.
 */

export interface FreezeState {
  isFrozen: boolean;
  frozenAt?: string;
  frozenBy?: string;
  reason?: string;
  source?: 'voice' | 'panel' | 'api' | 'system';
  haltedTurnsCount?: number;
  haltedWorkersCount?: number;
  frozenJobsCount?: number;
}

export interface StopTriggerOptions {
  source?: 'voice' | 'panel' | 'api' | 'system';
  reason?: string;
  founderId?: string;
}

export interface StopControlResult {
  success: boolean;
  frozen: boolean;
  frozenAt: string;
  reason: string;
  source: 'voice' | 'panel' | 'api' | 'system';
  haltedTurnsCount: number;
  haltedWorkersCount: number;
  frozenJobsCount: number;
}

export interface ResumeConfirmOptions {
  founderId: string;
  confirmed: boolean;
  reason?: string;
}

export interface ResumeControlResult {
  success: boolean;
  resumed: boolean;
  resumedAt: string;
  resumedBy: string;
  reason?: string;
}

export interface FreezeAuditEntry {
  id: string;
  type: 'STOP_TRIGGERED' | 'RESUME_CONFIRMED';
  timestamp: string;
  actor: string;
  reason?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface FreezableScheduler {
  freezeScheduledWork(reason: string): Promise<number>;
  resumeScheduledWork?(reason: string): Promise<void>;
}

export class SafeModeManager {
  private static instance: SafeModeManager | null = null;

  private state: FreezeState = {
    isFrozen: false,
  };

  private inFlightTurns = new Map<string, AbortController>();
  private activeWorkers = new Map<string, AbortController>();
  private activeSchedulers = new Set<FreezableScheduler>();
  private auditLog: FreezeAuditEntry[] = [];

  private constructor() {}

  public static getInstance(): SafeModeManager {
    if (!SafeModeManager.instance) {
      SafeModeManager.instance = new SafeModeManager();
    }
    return SafeModeManager.instance;
  }

  /**
   * Fast synchronous check for safe-mode freeze status.
   */
  public isFrozen(): boolean {
    return this.state.isFrozen;
  }

  /**
   * Returns a snapshot of current freeze state.
   */
  public getFreezeStatus(): Readonly<FreezeState> {
    return { ...this.state };
  }

  /**
   * Returns recent stop/resume audit events.
   */
  public getAuditLog(): ReadonlyArray<FreezeAuditEntry> {
    return [...this.auditLog];
  }

  /**
   * Registers an in-flight turn execution controller.
   */
  public registerInFlightTurn(key: string, controller: AbortController): void {
    this.inFlightTurns.set(key, controller);
  }

  /**
   * Unregisters an in-flight turn execution controller upon turn completion.
   */
  public unregisterInFlightTurn(key: string): void {
    this.inFlightTurns.delete(key);
  }
  /**
   * Registers an active worker or background task controller.
   */
  public registerActiveWorker(workerId: string, controller: AbortController): void {
    this.activeWorkers.set(workerId, controller);
  }

  /**
   * Unregisters an active worker controller upon task completion or error.
   */
  public unregisterActiveWorker(workerId: string): void {
    this.activeWorkers.delete(workerId);
  }

  /**
   * Returns current count of registered active workers.
   */
  public getActiveWorkersCount(): number {
    return this.activeWorkers.size;
  }


  /**
   * Registers a freezable workflow scheduler.
   */
  public registerActiveScheduler(scheduler: FreezableScheduler): void {
    this.activeSchedulers.add(scheduler);
  }

  /**
   * Unregisters a workflow scheduler.
   */
  public unregisterActiveScheduler(scheduler: FreezableScheduler): void {
    this.activeSchedulers.delete(scheduler);
  }

  /**
   * Triggers the Stop Control (Safe Mode Freeze).
   * Deterministic, zero LLM dependencies, works when all model providers are down.
   */
  public async triggerStop(opts: StopTriggerOptions = {}): Promise<StopControlResult> {
    const now = new Date().toISOString();
    const source = opts.source || 'panel';
    const reason = opts.reason || `Stop control triggered via ${source}`;
    const actor = opts.founderId || 'founder-primary';

    // 1. Immediately abort all in-flight turn executions across all ingress channels
    let haltedTurnsCount = 0;
    for (const [key, controller] of this.inFlightTurns.entries()) {
      try {
        controller.abort();
        haltedTurnsCount++;
      } catch {
        // ignore errors on already settled abort controllers
      }
    }
    this.inFlightTurns.clear();
    // 1b. Immediately abort all active workers and background tasks
    let haltedWorkersCount = 0;
    for (const [key, controller] of this.activeWorkers.entries()) {
      try {
        controller.abort(new Error(`Worker execution halted by Stop Control: ${reason}`));
        haltedWorkersCount++;
      } catch {
        // ignore errors on already settled abort controllers
      }
    }
    this.activeWorkers.clear();


    // 2. Freeze all active schedulers and workflow background jobs
    let frozenJobsCount = 0;
    for (const scheduler of this.activeSchedulers) {
      try {
        const frozen = await scheduler.freezeScheduledWork(reason);
        frozenJobsCount += frozen;
      } catch (err) {
        console.error('[SafeModeManager] Error freezing scheduler:', err);
      }
    }

    // 3. Persist freeze state in-memory
    this.state = {
      isFrozen: true,
      frozenAt: now,
      frozenBy: actor,
      reason,
      source,
      haltedTurnsCount,
      haltedWorkersCount,
      frozenJobsCount,
    };

    // 4. Record audit entry
    this.auditLog.push({
      id: `stop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'STOP_TRIGGERED',
      timestamp: now,
      actor,
      reason,
      source,
      metadata: { haltedTurnsCount, haltedWorkersCount, frozenJobsCount },
    });

    return {
      success: true,
      frozen: true,
      frozenAt: now,
      reason,
      source,
      haltedTurnsCount,
      haltedWorkersCount,
      frozenJobsCount,
    };
  }

  /**
   * Resumes normal system operations.
   * STRICT REQUIREMENT: Requires explicit Founder confirmation (confirmed === true).
   */
  public async confirmResume(opts: ResumeConfirmOptions): Promise<ResumeControlResult> {
    if (!opts.founderId || !opts.founderId.trim()) {
      throw new Error('Founder identity required to resume operations.');
    }
    if (!opts.confirmed) {
      throw new Error('Explicit confirmation (confirmed: true) is required to resume from Safe Mode.');
    }

    const now = new Date().toISOString();
    const reason = opts.reason || 'Founder confirmed resumption of normal operations.';

    // Notify registered schedulers of resumption if supported
    for (const scheduler of this.activeSchedulers) {
      if (typeof scheduler.resumeScheduledWork === 'function') {
        try {
          await scheduler.resumeScheduledWork(reason);
        } catch (err) {
          console.error('[SafeModeManager] Error resuming scheduler:', err);
        }
      }
    }

    this.state = {
      isFrozen: false,
    };

    this.auditLog.push({
      id: `resume-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'RESUME_CONFIRMED',
      timestamp: now,
      actor: opts.founderId,
      reason,
    });

    return {
      success: true,
      resumed: true,
      resumedAt: now,
      resumedBy: opts.founderId,
      reason,
    };
  }

  /**
   * Reset method for isolated test suites.
   */
  public resetForTesting(): void {
    this.state = { isFrozen: false };
    this.inFlightTurns.clear();
    this.activeWorkers.clear();
    this.activeSchedulers.clear();
    this.auditLog = [];
  }
}

/**
 * Checks if a user voice transcript or text message is an explicit stop command.
 */
export function isStopCommand(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  return /^(?:stop|halt|freeze|pause everything|emergency stop|cancel all|shut down|stand down)(?:\s+(?:immediately|now|right now))?[!.\s]*$/i.test(trimmed);
}

/**
 * Checks if a user voice transcript or text message is an explicit resume confirmation command.
 */
export function isResumeCommand(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  return /^(?:confirm resume|resume operations|resume system|resume|unfreeze)[!.\s]*$/i.test(trimmed);
}
