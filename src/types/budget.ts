/**
 * SamJuniorsOS — Capability Evaluation, Budget Caps & Runaway Loop Prevention Types (Gate G14.7)
 *
 * Invariants:
 * 1. Deterministic Cost Bounds: Runaway tool loops are halted mathematically when call count
 *    or financial cost exceeds configured run limits.
 * 2. Untrusted Output Enveloping: Data returned from external capabilities/tools is explicitly
 *    enveloped as untrusted content, preventing indirect prompt injection from hijacking execution.
 * 3. Fail-Closed Error Taxonomy: Specialized error classes for loop detection and budget overrun.
 */

import { z } from 'zod';

/**
 * Runaway Budget Configuration Schema
 */
export const RunawayBudgetConfigSchema = z.object({
  /** Maximum number of capability invocations permitted in a single run/session */
  maxCallsPerRun: z.number().int().positive().default(25),
  /** Maximum cumulative cost permitted in cents (e.g. 500 = $5.00) */
  maxCostCentsPerRun: z.number().int().positive().default(500),
  /** Maximum rate of tool invocations per 60-second sliding window */
  maxCallsPerMinute: z.number().int().positive().default(30),
  /** Maximum consecutive failure streak before halting runaway error loops */
  maxConsecutiveFailures: z.number().int().positive().default(5),
});

export type RunawayBudgetConfig = z.infer<typeof RunawayBudgetConfigSchema>;

/**
 * Default Runaway Budget Limits
 */
export const DEFAULT_RUNAWAY_BUDGET_CONFIG: RunawayBudgetConfig = {
  maxCallsPerRun: 25,
  maxCostCentsPerRun: 500, // $5.00
  maxCallsPerMinute: 30,
  maxConsecutiveFailures: 5,
};

/**
 * Error thrown when a runaway tool loop is detected (call count or rate limit exceeded)
 */
export class RunawayToolLoopError extends Error {
  public readonly code = 'RUNAWAY_TOOL_LOOP_DETECTED';
  public readonly runId: string;
  public readonly capabilityId: string;
  public readonly callCount: number;
  public readonly threshold: number;

  constructor(params: {
    runId: string;
    capabilityId: string;
    callCount: number;
    threshold: number;
    message: string;
  }) {
    super(`[RUNAWAY_TOOL_LOOP] ${params.message} (run: ${params.runId}, capability: ${params.capabilityId}, count: ${params.callCount}/${params.threshold})`);
    this.name = 'RunawayToolLoopError';
    this.runId = params.runId;
    this.capabilityId = params.capabilityId;
    this.callCount = params.callCount;
    this.threshold = params.threshold;
  }
}

/**
 * Error thrown when a capability invocation exceeds the cost cap
 */
export class CapabilityBudgetExceededError extends Error {
  public readonly code = 'CAPABILITY_BUDGET_EXCEEDED';
  public readonly runId: string;
  public readonly capabilityId: string;
  public readonly currentCostCents: number;
  public readonly attemptedCostCents: number;
  public readonly capCents: number;

  constructor(params: {
    runId: string;
    capabilityId: string;
    currentCostCents: number;
    attemptedCostCents: number;
    capCents: number;
  }) {
    super(
      `[BUDGET_EXCEEDED] Invocation of "${params.capabilityId}" would exceed cost cap: current ${params.currentCostCents}¢ + charge ${params.attemptedCostCents}¢ > limit ${params.capCents}¢ for run "${params.runId}".`
    );
    this.name = 'CapabilityBudgetExceededError';
    this.runId = params.runId;
    this.capabilityId = params.capabilityId;
    this.currentCostCents = params.currentCostCents;
    this.attemptedCostCents = params.attemptedCostCents;
    this.capCents = params.capCents;
  }
}

/**
 * Tool Output Envelope Schema
 * Wraps external capability output data with provenance and untrusted flags
 */
export const ToolOutputEnvelopeSchema = z.object({
  /** Raw or sanitized tool output data */
  data: z.any(),
  /** Explicit untrusted boundary marker */
  isUntrusted: z.literal(true),
  /** Originating capability identifier */
  sourceCapabilityId: z.string(),
  /** Whether prompt injection delimiters were neutralized */
  sanitized: z.boolean(),
  /** Array of suspected prompt injection patterns detected in payload */
  injectionMarkersDetected: z.array(z.string()).default([]),
  /** ISO timestamp when output was enveloped */
  timestamp: z.string(),
});

export type ToolOutputEnvelope = z.infer<typeof ToolOutputEnvelopeSchema>;
