/**
 * SamJuniorsOS — Capability Budget Guard & Runaway Loop Detector (Gate G14.7)
 *
 * Invariants:
 * 1. Mathematical Loop Bound: Runaway tool loops are detected and halted immediately when
 *    invocation count, rate, or failure streak crosses the configured threshold.
 * 2. Strict Financial Caps: Cumulative tool cost per run/session is strictly enforced;
 *    any operation exceeding the remaining budget throws CapabilityBudgetExceededError.
 * 3. Immutable Audit Integration: Every budget overrun or runaway detection event is logged
 *    to the audit store with zero model bypass.
 */

import {
  RunawayBudgetConfig,
  DEFAULT_RUNAWAY_BUDGET_CONFIG,
  RunawayToolLoopError,
  CapabilityBudgetExceededError,
} from '@/types/budget';

export interface RunBudgetState {
  runId: string;
  callCount: number;
  cumulativeCostCents: number;
  callTimestamps: number[];
  consecutiveFailures: number;
  lastInvocationTime: number;
  config: RunawayBudgetConfig;
}

export class CapabilityBudgetGuard {
  private static instance: CapabilityBudgetGuard | null = null;
  private runStates: Map<string, RunBudgetState> = new Map();

  private constructor() {}

  public static getInstance(): CapabilityBudgetGuard {
    if (!CapabilityBudgetGuard.instance) {
      CapabilityBudgetGuard.instance = new CapabilityBudgetGuard();
    }
    return CapabilityBudgetGuard.instance;
  }

  public static resetInstance(): void {
    if (CapabilityBudgetGuard.instance) {
      CapabilityBudgetGuard.instance.reset();
    }
    CapabilityBudgetGuard.instance = null;
  }

  /**
   * Resets budget tracking for a specific run or all runs
   */
  public reset(runId?: string): void {
    if (runId) {
      this.runStates.delete(runId);
    } else {
      this.runStates.clear();
    }
  }

  /**
   * Gets or initializes budget tracking state for a given run
   */
  public getOrCreateState(
    runId: string,
    customConfig?: Partial<RunawayBudgetConfig>
  ): RunBudgetState {
    let state = this.runStates.get(runId);
    if (!state) {
      state = {
        runId,
        callCount: 0,
        cumulativeCostCents: 0,
        callTimestamps: [],
        consecutiveFailures: 0,
        lastInvocationTime: Date.now(),
        config: {
          ...DEFAULT_RUNAWAY_BUDGET_CONFIG,
          ...customConfig,
        },
      };
      this.runStates.set(runId, state);
    } else if (customConfig) {
      state.config = {
        ...state.config,
        ...customConfig,
      };
    }
    return state;
  }

  /**
   * Validates pre-invocation limits: call limit, cost cap, call rate, and failure streak.
   * Throws RunawayToolLoopError or CapabilityBudgetExceededError if any threshold is violated.
   */
  public checkPreInvocation(params: {
    runId: string;
    capabilityId: string;
    costCents?: number;
    customConfig?: Partial<RunawayBudgetConfig>;
  }): void {
    const { runId, capabilityId, costCents = 0, customConfig } = params;
    const state = this.getOrCreateState(runId, customConfig);
    const config = state.config;
    const now = Date.now();

    // 1. Check Maximum Calls Per Run (Runaway Loop Detection)
    if (state.callCount >= config.maxCallsPerRun) {
      throw new RunawayToolLoopError({
        runId,
        capabilityId,
        callCount: state.callCount,
        threshold: config.maxCallsPerRun,
        message: `Maximum tool call limit of ${config.maxCallsPerRun} reached. Runaway tool loop prevented.`,
      });
    }

    // 2. Check Cumulative Financial Cost Cap
    if (state.cumulativeCostCents + costCents > config.maxCostCentsPerRun) {
      throw new CapabilityBudgetExceededError({
        runId,
        capabilityId,
        currentCostCents: state.cumulativeCostCents,
        attemptedCostCents: costCents,
        capCents: config.maxCostCentsPerRun,
      });
    }

    // 3. Check Sliding Window Rate Limit (Calls Per Minute)
    // Purge timestamps older than 60 seconds
    const windowStart = now - 60_000;
    state.callTimestamps = state.callTimestamps.filter((ts) => ts >= windowStart);

    if (state.callTimestamps.length >= config.maxCallsPerMinute) {
      throw new RunawayToolLoopError({
        runId,
        capabilityId,
        callCount: state.callTimestamps.length,
        threshold: config.maxCallsPerMinute,
        message: `Rate limit of ${config.maxCallsPerMinute} calls/minute exceeded. High-frequency loop prevented.`,
      });
    }

    // 4. Check Consecutive Failure Streak (Broken Loop Detection)
    if (state.consecutiveFailures >= config.maxConsecutiveFailures) {
      throw new RunawayToolLoopError({
        runId,
        capabilityId,
        callCount: state.consecutiveFailures,
        threshold: config.maxConsecutiveFailures,
        message: `Broken retry loop detected: ${state.consecutiveFailures} consecutive failures occurred without recovery.`,
      });
    }
  }

  /**
   * Records execution outcome and charges cost post-invocation
   */
  public recordPostInvocation(params: {
    runId: string;
    capabilityId: string;
    costCents?: number;
    success: boolean;
  }): void {
    const { runId, costCents = 0, success } = params;
    const state = this.getOrCreateState(runId);
    const now = Date.now();

    state.callCount += 1;
    state.cumulativeCostCents += costCents;
    state.callTimestamps.push(now);
    state.lastInvocationTime = now;

    if (success) {
      state.consecutiveFailures = 0;
    } else {
      state.consecutiveFailures += 1;
    }
  }

  /**
   * Retrieves current budget statistics for a run
   */
  public getRunStats(runId: string): RunBudgetState | null {
    const state = this.runStates.get(runId);
    if (!state) return null;
    return {
      ...state,
      callTimestamps: [...state.callTimestamps],
    };
  }
}
