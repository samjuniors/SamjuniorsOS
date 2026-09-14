/**
 * Phase 4.4B — Founder directive → durable scheduled work.
 *
 * The SMALLEST bridge from the founder's directive experience to the EXISTING
 * authoritative execution machinery. There is deliberately NO new work model
 * here: a founder directive becomes the same concepts immediate execution
 * already uses —
 *
 *   directive  →  WorkflowDefinition (single objective step)
 *              →  WorkflowInstance    (via runtime.createInstance)
 *              →  ScheduledWorkItem   (via scheduler.scheduleWork)
 *
 * …and every later occurrence flows through the unchanged 4.4A heartbeat →
 * WorkflowScheduler → WorkflowRuntime → SideEffectAuthorizationGate →
 * ServerAgentExecutor → AgentRunStore chain (leases, occurrence idempotency,
 * wake-time re-authorization and approval blocking all remain in force).
 */
import { WorkflowDefinition } from '../../../types/workflow';
import {
  RecurrenceIntervalUnit,
  RecurrenceRule,
  ScheduleType,
  ScheduledWorkItem,
} from '../../../types/scheduling';
import { WorkflowRuntime } from './runtime';
import { WorkflowScheduler } from './scheduler';
import { v4 as uuidv4 } from 'uuid';

/** Step id of the single objective step synthesized for a directive. */
export const DIRECTIVE_STEP_ID = 'step-objective';

/**
 * Phase 4.4B.1 — authenticated founder identity for attribution.
 * Comes from the server-side session (getAuthenticatedFounder); never from
 * client-supplied payload fields. Populates the authoritative
 * WorkflowInstance.initiatedById column (mirrors the Prisma schema).
 */
export interface FounderInitiator {
  userId: string;
}

export interface DirectiveScheduleRequest {
  directive: string;
  scheduleType: 'recurring' | 'one_time';
  /** First occurrence (ISO 8601). Required for one_time; defaults to now for
   *  recurring (the founder's interval then anchors on first evaluation). */
  executeAt?: string;
  intervalUnit?: RecurrenceIntervalUnit;
  intervalValue?: number;
  maxOccurrences?: number;
  endDate?: string;
  /** Governance requirement persisted with the step: each execution waits for
   *  founder approval (defense-in-depth on top of the side-effect gate's own
   *  classification, which is re-evaluated at every wake). */
  requiresApproval?: boolean;
}

export interface DirectiveScheduleResult {
  definition: WorkflowDefinition;
  workflowInstanceId: string;
  schedule: ScheduledWorkItem;
}

/* ------------------------------------------------------------------ validation */

const INTERVAL_UNITS: readonly RecurrenceIntervalUnit[] = ['minutes', 'hours', 'days', 'weeks'];
const UNIT_MS: Record<RecurrenceIntervalUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
};
/** Sanity ceiling: a recurrence interval beyond ~5 years is rejected. */
const MAX_INTERVAL_MS = 5 * 365 * 24 * 3_600_000;
/** Sanity ceiling for maxOccurrences. */
const MAX_OCCURRENCES = 1000;

export class DirectiveScheduleValidationError extends Error {
  readonly statusCode = 400;
}

function fail(message: string): never {
  throw new DirectiveScheduleValidationError(message);
}

function parseIsoDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be an ISO 8601 date string`);
  const d = new Date(value);
  if (isNaN(d.getTime())) fail(`${field} is not a valid ISO 8601 date: ${value}`);
  return d.toISOString();
}

/** Fail-closed validation of the founder-supplied schedule payload. Returns
 *  the canonicalized parameters; never trusts client-computed timestamps
 *  beyond parsing them (occurrence identity remains server-derived). */
export function validateDirectiveSchedule(input: DirectiveScheduleRequest): {
  scheduleType: ScheduleType;
  executeAt: string;
  recurrence?: RecurrenceRule;
  requiresApproval: boolean;
} {
  const requiresApproval = input.requiresApproval === true;

  if (input.scheduleType === 'one_time') {
    if (!input.executeAt) fail('one_time schedules require an explicit executeAt (ISO 8601)');
    return { scheduleType: 'exact_timestamp', executeAt: parseIsoDate(input.executeAt, 'executeAt'), requiresApproval };
  }

  if (input.scheduleType !== 'recurring') {
    fail(`scheduleType must be 'recurring' or 'one_time' (received: ${String(input.scheduleType)})`);
  }

  const intervalUnit = input.intervalUnit ?? 'weeks';
  if (!INTERVAL_UNITS.includes(intervalUnit)) {
    fail(`intervalUnit must be one of ${INTERVAL_UNITS.join(', ')} (received: ${String(input.intervalUnit)})`);
  }
  const intervalValue = input.intervalValue ?? 1;
  if (!Number.isInteger(intervalValue) || intervalValue < 1) {
    fail(`intervalValue must be an integer >= 1 (received: ${String(input.intervalValue)})`);
  }
  const intervalMs = intervalValue * UNIT_MS[intervalUnit];
  if (intervalMs > MAX_INTERVAL_MS) {
    fail(`recurrence interval exceeds the sanity ceiling of ~5 years (${intervalValue} ${intervalUnit})`);
  }

  let maxOccurrences: number | undefined;
  if (input.maxOccurrences !== undefined) {
    if (!Number.isInteger(input.maxOccurrences) || input.maxOccurrences < 1 || input.maxOccurrences > MAX_OCCURRENCES) {
      fail(`maxOccurrences must be an integer between 1 and ${MAX_OCCURRENCES}`);
    }
    maxOccurrences = input.maxOccurrences;
  }

  const executeAt = input.executeAt ? parseIsoDate(input.executeAt, 'executeAt') : new Date().toISOString();

  return {
    scheduleType: 'recurring',
    executeAt,
    recurrence: {
      intervalUnit,
      intervalValue,
      intervalMs,
      currentOccurrence: 1,
      maxOccurrences,
      endDate: input.endDate ? parseIsoDate(input.endDate, 'endDate') : undefined,
    },
    requiresApproval,
  };
}

/* ------------------------------------------------------------------ factory */

/**
 * Synthesizes the WorkflowDefinition for a scheduled directive: ONE objective
 * step owned by the COO that executes the directive through the existing
 * agent executor. `report` as the protocol skill keeps the deliverable honest
 * — each occurrence of a scheduled directive is expected to PRODUCE its
 * recommendation, and the workstream projection derives "done" from a real
 * `report` step.
 */
export function buildDirectiveWorkflowDefinition(
  directive: string,
  requiresApproval: boolean = false
): WorkflowDefinition {
  const id = `wf-auto-${uuidv4()}`;
  return {
    id,
    name: `Recurring directive: ${directive.slice(0, 80)}`,
    description: `Scheduled founder directive (Phase 4.4B automation). Objective: ${directive}`,
    objective: directive,
    version: '1.0.0',
    steps: [
      {
        id: DIRECTIVE_STEP_ID,
        name: 'Execute scheduled directive',
        description: `Execute the founder's scheduled directive and deliver the result: ${directive}`,
        assignedRole: 'coo',
        skill: 'report',
        dependencies: [],
        inputReferences: [],
        outputReferences: ['result'],
        requiresApproval,
        retryPolicy: { maxRetries: 2, backoffMs: 60_000 },
        sideEffectClassification: requiresApproval ? 'external_communication' : 'read_only',
      },
    ],
    dependencies: [],
    requiredApprovals: requiresApproval ? 1 : 0,
    allowedRoles: ['coo'],
    allowedSkills: ['report'],
    expectedOutputs: ['result'],
  };
}

/**
 * Creates the full authoritative chain for a scheduled directive using ONLY
 * existing runtime/scheduler APIs. Every artifact lands in the same stores
 * immediate execution uses — no parallel work authority is introduced.
 *
 * Phase 4.4B.1: `deps.founder` (authenticated founder identity) populates
 * WorkflowInstance.initiatedById — authoritative founder attribution for the
 * scheduled work. Schedule provenance (createdByRole) is preserved as
 * supporting audit context, not a second attribution system.
 */
export async function createScheduledDirective(
  input: DirectiveScheduleRequest,
  deps?: {
    runtime?: WorkflowRuntime;
    scheduler?: WorkflowScheduler;
    founder?: FounderInitiator;
  }
): Promise<DirectiveScheduleResult> {
  const validated = validateDirectiveSchedule(input);
  if (!input.directive || typeof input.directive !== 'string' || !input.directive.trim()) {
    fail('directive is required and must be a non-empty string');
  }
  const directive = input.directive.trim();

  const runtime = deps?.runtime ?? new WorkflowRuntime();
  const scheduler = deps?.scheduler ?? new WorkflowScheduler();

  const definition = buildDirectiveWorkflowDefinition(directive, validated.requiresApproval);
  await runtime.registerWorkflow(definition);

  const instance = await runtime.createInstance(definition.id, definition.version, {
    initiatedById: deps?.founder?.userId,
    // Phase 4.4B.1 — scheduled work defers readiness evaluation to the
    // scheduler's due-work pass, which evaluates WITH occurrence context (the
    // per-occurrence approval authority). An immediate cascade here would
    // request an UNBOUND approval before any occurrence is due.
    deferReadinessEvaluation: true,
  });
  const schedule = await scheduler.scheduleWork({
    workflowInstanceId: instance.instanceId,
    stepId: DIRECTIVE_STEP_ID,
    scheduleType: validated.scheduleType,
    executeAt: validated.executeAt,
    recurrence: validated.recurrence,
    provenance: {
      createdByRole: 'founder',
      workflowId: definition.id,
      stepName: definition.steps[0].name,
    },
  });

  return { definition, workflowInstanceId: instance.instanceId, schedule };
}
