/**
 * Deterministic Model Spend Settings & Autonomy Enforcement (M1.8 / G12.8).
 *
 * Implements deterministic spend limits for SamJuniorsOS:
 * 1. An unset spend cap (null) strictly blocks all autonomous model spend.
 * 2. Interactive spend (direct Founder chat & voice) is counted and shown.
 * 3. Reaching the spend cap halts autonomous operations and stops in-flight tasks.
 * 4. Lowering the cap below current spend immediately stops running tasks.
 * 5. Every modification by the Founder is durably logged to the audit ledger.
 *
 * Deterministic: zero LLM dependencies for governance or spend gate evaluation.
 */

import { DurableFileStore } from '../persistence/durable-file-store';
import { InMemoryAuditStore } from '../authorization/approval-store';
import { verifyAuditChain } from '../authorization/audit-integrity';
import { SafeModeManager } from './stop-control';
import { SideEffectAuditRecord } from '@/types/authorization';

export interface ModelSpendSettings {
  /**
   * Daily spend ceiling in USD.
   * When null or undefined (UNSET), no autonomous model spend is permitted.
   */
  dailySpendCapUsd: number | null;
  /** Cumulative spend today (USD) */
  currentDailySpendUsd: number;
  /** Breakdown: interactive dialogue turns (USD) */
  interactiveSpendUsd: number;
  /** Breakdown: background workflows and council deliberations (USD) */
  autonomousSpendUsd: number;
  /** Reset date (YYYY-MM-DD UTC) */
  lastResetDate: string;
  /** Currency */
  currency: 'USD';
  /** Last updated ISO timestamp */
  updatedAt: string;
  /** Principal who last updated settings */
  updatedBy: string;
}

export interface SpendEvaluationResult {
  allowed: boolean;
  reason?: 'NO_SPEND_CAP_CONFIGURED' | 'SPEND_CAP_EXCEEDED';
  message?: string;
  currentSpendUsd: number;
  spendCapUsd: number | null;
}

export interface RunningAutonomousTask {
  taskId: string;
  abortController: AbortController;
  description: string;
  startedAt: string;
}

export class SpendSettingsManager {
  private static instance: SpendSettingsManager | null = null;

  private settings: ModelSpendSettings;
  private runningTasks = new Map<string, RunningAutonomousTask>();

  private constructor() {
    this.settings = this.loadPersistedSettings();
  }

  public static getInstance(): SpendSettingsManager {
    if (!SpendSettingsManager.instance) {
      SpendSettingsManager.instance = new SpendSettingsManager();
    }
    return SpendSettingsManager.instance;
  }

  public static resetInstance(): void {
    SpendSettingsManager.instance = null;
  }

  private getTodayDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private loadPersistedSettings(): ModelSpendSettings {
    const today = this.getTodayDateString();
    const defaults: ModelSpendSettings = {
      dailySpendCapUsd: null, // Default is UNSET: autonomous spend disabled by default
      currentDailySpendUsd: 0,
      interactiveSpendUsd: 0,
      autonomousSpendUsd: 0,
      lastResetDate: today,
      currency: 'USD',
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    };

    try {
      const collection = DurableFileStore.getInstance().readCollection<any>('company_state');
      const persisted = collection['model_spend_settings'];
      if (persisted && typeof persisted === 'object') {
        const loaded: ModelSpendSettings = {
          dailySpendCapUsd: persisted.dailySpendCapUsd !== undefined ? persisted.dailySpendCapUsd : null,
          currentDailySpendUsd: typeof persisted.currentDailySpendUsd === 'number' ? persisted.currentDailySpendUsd : 0,
          interactiveSpendUsd: typeof persisted.interactiveSpendUsd === 'number' ? persisted.interactiveSpendUsd : 0,
          autonomousSpendUsd: typeof persisted.autonomousSpendUsd === 'number' ? persisted.autonomousSpendUsd : 0,
          lastResetDate: persisted.lastResetDate || today,
          currency: 'USD',
          updatedAt: persisted.updatedAt || new Date().toISOString(),
          updatedBy: persisted.updatedBy || 'system',
        };

        // Reset if date rolled over
        if (loaded.lastResetDate !== today) {
          loaded.currentDailySpendUsd = 0;
          loaded.interactiveSpendUsd = 0;
          loaded.autonomousSpendUsd = 0;
          loaded.lastResetDate = today;
          this.persistSettings(loaded);
        }

        return loaded;
      }
    } catch (err) {
      console.warn('[SpendSettingsManager] Could not read persisted spend settings; using defaults:', err);
    }

    return defaults;
  }

  private persistSettings(settingsToSave: ModelSpendSettings): void {
    try {
      DurableFileStore.getInstance().saveItemStrict(
        'company_state',
        'model_spend_settings',
        settingsToSave
      );
    } catch (err) {
      console.error('[SpendSettingsManager] Failed to persist spend settings:', err);
    }
  }

  private checkDailyReset(): void {
    const today = this.getTodayDateString();
    if (this.settings.lastResetDate !== today) {
      this.settings.currentDailySpendUsd = 0;
      this.settings.interactiveSpendUsd = 0;
      this.settings.autonomousSpendUsd = 0;
      this.settings.lastResetDate = today;
      this.persistSettings(this.settings);
    }
  }

  /**
   * Fast synchronous query for current spend settings.
   */
  public getSettings(): Readonly<ModelSpendSettings> {
    this.checkDailyReset();
    return { ...this.settings };
  }

  /**
   * Gate evaluation for autonomous spend:
   * 1. Unset cap (null/undefined) => strict block: with no value set, no autonomous spend runs.
   * 2. Current spend >= cap => strict block: cap reached.
   */
  public canExecuteAutonomousSpend(estimatedCostUsd: number = 0): SpendEvaluationResult {
    this.checkDailyReset();

    // 1. Unset Cap Check
    if (this.settings.dailySpendCapUsd === null || this.settings.dailySpendCapUsd === undefined) {
      return {
        allowed: false,
        reason: 'NO_SPEND_CAP_CONFIGURED',
        message: 'No spend cap configured: with no value set, no autonomous model spend runs by policy.',
        currentSpendUsd: this.settings.currentDailySpendUsd,
        spendCapUsd: null,
      };
    }

    // 2. Cap Exceeded Check
    if (this.settings.currentDailySpendUsd + estimatedCostUsd >= this.settings.dailySpendCapUsd) {
      return {
        allowed: false,
        reason: 'SPEND_CAP_EXCEEDED',
        message: `Model spend cap reached ($${this.settings.currentDailySpendUsd.toFixed(2)} / $${this.settings.dailySpendCapUsd.toFixed(2)}). Autonomous operations stopped.`,
        currentSpendUsd: this.settings.currentDailySpendUsd,
        spendCapUsd: this.settings.dailySpendCapUsd,
      };
    }

    return {
      allowed: true,
      currentSpendUsd: this.settings.currentDailySpendUsd,
      spendCapUsd: this.settings.dailySpendCapUsd,
    };
  }

  /**
   * Gate evaluation for interactive spend:
   * Direct Founder dialogues are permitted when cap is unset,
   * but blocked if a configured cap is reached.
   */
  public canExecuteInteractiveSpend(estimatedCostUsd: number = 0): SpendEvaluationResult {
    this.checkDailyReset();

    if (this.settings.dailySpendCapUsd !== null && this.settings.dailySpendCapUsd !== undefined) {
      if (this.settings.currentDailySpendUsd + estimatedCostUsd >= this.settings.dailySpendCapUsd) {
        return {
          allowed: false,
          reason: 'SPEND_CAP_EXCEEDED',
          message: `Model spend cap reached ($${this.settings.currentDailySpendUsd.toFixed(2)} / $${this.settings.dailySpendCapUsd.toFixed(2)}). Operations stopped.`,
          currentSpendUsd: this.settings.currentDailySpendUsd,
          spendCapUsd: this.settings.dailySpendCapUsd,
        };
      }
    }

    return {
      allowed: true,
      currentSpendUsd: this.settings.currentDailySpendUsd,
      spendCapUsd: this.settings.dailySpendCapUsd,
    };
  }

  /**
   * Registers a running autonomous task with an AbortController so it can be stopped immediately
   * if the cap is lowered or reached.
   */
  public registerRunningTask(taskId: string, abortController: AbortController, description: string = 'autonomous_task'): void {
    this.runningTasks.set(taskId, {
      taskId,
      abortController,
      description,
      startedAt: new Date().toISOString(),
    });
  }

  /**
   * Unregisters a running task upon completion.
   */
  public unregisterRunningTask(taskId: string): void {
    this.runningTasks.delete(taskId);
  }

  /**
   * Aborts all currently running autonomous tasks.
   */
  public stopRunningTasks(reason: string): number {
    let stoppedCount = 0;
    for (const [id, task] of this.runningTasks.entries()) {
      try {
        task.abortController.abort(new Error(reason));
        stoppedCount++;
      } catch {
        // Safe noop
      }
      this.runningTasks.delete(id);
    }
    return stoppedCount;
  }

  /**
   * Counts and records model spend.
   * If the spend reaches or exceeds the configured cap, stops operations immediately and says so.
   */
  public recordSpend(params: {
    amountUsd: number;
    type: 'interactive' | 'autonomous';
    model?: string;
    source?: string;
    turnId?: string;
    taskId?: string;
  }): void {
    this.checkDailyReset();

    const amount = Math.max(0, params.amountUsd);
    this.settings.currentDailySpendUsd = Number((this.settings.currentDailySpendUsd + amount).toFixed(4));

    if (params.type === 'interactive') {
      this.settings.interactiveSpendUsd = Number((this.settings.interactiveSpendUsd + amount).toFixed(4));
    } else {
      this.settings.autonomousSpendUsd = Number((this.settings.autonomousSpendUsd + amount).toFixed(4));
    }

    this.settings.updatedAt = new Date().toISOString();
    this.persistSettings(this.settings);

    // If cap configured and reached: stop running tasks and freeze operations!
    if (this.settings.dailySpendCapUsd !== null && this.settings.dailySpendCapUsd !== undefined) {
      if (this.settings.currentDailySpendUsd >= this.settings.dailySpendCapUsd) {
        const stopReason = `Model spend cap reached ($${this.settings.currentDailySpendUsd.toFixed(2)} / $${this.settings.dailySpendCapUsd.toFixed(2)}). Operations stopped.`;
        void SafeModeManager.getInstance().triggerStop({
          source: 'system',
          reason: stopReason,
          founderId: 'system',
        });
        this.stopRunningTasks(stopReason);
      }
    }
  }

  /**
   * Updates the Model Spend Cap setting.
   *
   * Exit Criteria:
   * - Lowering the cap below current spend stops running tasks.
   * - Every change is logged as a Founder action in the durable audit store.
   */
  public async updateSpendCap(args: {
    newCapUsd: number | null;
    founderId: string;
    reason?: string;
  }): Promise<ModelSpendSettings> {
    this.checkDailyReset();

    const previousCap = this.settings.dailySpendCapUsd;
    const newCap = args.newCapUsd !== null && args.newCapUsd !== undefined ? Number(args.newCapUsd) : null;

    if (newCap !== null && (isNaN(newCap) || newCap < 0)) {
      throw new Error('Spend cap must be a non-negative number or null');
    }

    const currentSpend = this.settings.currentDailySpendUsd;
    const isLoweredBelowCurrent = newCap !== null && newCap <= currentSpend;
    const isLowered = previousCap !== null && newCap !== null && newCap < previousCap;

    this.settings.dailySpendCapUsd = newCap;
    this.settings.updatedAt = new Date().toISOString();
    this.settings.updatedBy = args.founderId;
    this.persistSettings(this.settings);

    // Lowering the cap stops a running task
    if (isLoweredBelowCurrent || isLowered) {
      const stopReason = `Spend cap lowered to $${newCap?.toFixed(2)} (current spend: $${currentSpend.toFixed(2)}). Halting active tasks.`;
      await SafeModeManager.getInstance().triggerStop({
        source: 'system',
        reason: stopReason,
        founderId: args.founderId,
      });
      this.stopRunningTasks(stopReason);
    }

    // Durably log the Founder's change to the audit store
    await this.logAuditRecord({
      action: 'spend_cap_updated',
      actorId: args.founderId,
      previousCapUsd: previousCap,
      newCapUsd: newCap,
      currentSpendUsd: currentSpend,
      reason: args.reason || (isLowered ? 'Lowered model spend cap in settings' : 'Updated model spend cap in settings'),
    });

    return { ...this.settings };
  }

  /**
   * Durably logs the Founder action into the existing 'audits' collection.
   */
  private async logAuditRecord(entry: {
    action: string;
    actorId: string;
    previousCapUsd: number | null;
    newCapUsd: number | null;
    currentSpendUsd: number;
    reason: string;
  }): Promise<void> {
    const auditId = `audit-spend-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const auditRecord: SideEffectAuditRecord = {
      id: auditId,
      timestamp: new Date().toISOString(),
      requestId: `req-spend-${Date.now()}`,
      employeeRole: 'system',
      requestedBy: entry.actorId,
      actionClassification: 'internal_mutation',
      actionName: 'update_model_spend_cap',
      target: {
        targetSystem: 'settings',
        summary: `Model spend cap changed from ${entry.previousCapUsd !== null ? `$${entry.previousCapUsd}` : 'UNSET'} to ${entry.newCapUsd !== null ? `$${entry.newCapUsd}` : 'UNSET'} (current: $${entry.currentSpendUsd.toFixed(2)})`,
        metadata: {
          previousCapUsd: entry.previousCapUsd,
          newCapUsd: entry.newCapUsd,
          currentSpendUsd: entry.currentSpendUsd,
          reason: entry.reason,
        },
      },
      decision: 'allowed',
      reasonCode: 'APPROVED_BY_FOUNDER',
      reason: entry.reason,
      executed: true,
    };

    try {
      await InMemoryAuditStore.getInstance().record(auditRecord);
    } catch (err) {
      console.error('[SpendSettingsManager] Failed to persist audit record to audits collection:', err);
    }
  }

  /**
   * Retrieves audit log history of spend cap modifications.
   */
  public getSpendAuditHistory(): SideEffectAuditRecord[] {
    try {
      const all = DurableFileStore.getInstance().readCollection<SideEffectAuditRecord>('audits');
      return verifyAuditChain(Object.values(all))
        .filter((a) => a.actionName === 'update_model_spend_cap')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch {
      return [];
    }
  }

  /**
   * Test helper to reset internal state for isolated drill and unit testing.
   */
  public resetForTest(overrides?: Partial<ModelSpendSettings>): void {
    const today = this.getTodayDateString();
    this.settings = {
      dailySpendCapUsd: null,
      currentDailySpendUsd: 0,
      interactiveSpendUsd: 0,
      autonomousSpendUsd: 0,
      lastResetDate: today,
      currency: 'USD',
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
      ...overrides,
    };
    this.runningTasks.clear();
    this.persistSettings(this.settings);
  }
}
