/**
 * ============================================================================
 * SAMJUNIORS OS — AUTHORITATIVE ACTIVITY PROJECTION (PHASE 4.4C)
 * ============================================================================
 *
 * A strictly READ-ONLY, DETERMINISTIC projection of authoritative company
 * records into the founder-facing Activity history. It answers:
 *
 *   "What has the company ACTUALLY done?"
 *
 * …from what the SERVER persisted — never from what a browser happened to
 * observe. It is NOT a second event store: no new tables, no new models, no
 * new writes. Every projected item is derived, on request, from the existing
 * authoritative records:
 *
 *   ┌────────────────────────────────┬────────────────────────────────────────────┐
 *   │ Event category                 │ Authoritative source                       │
 *   ├────────────────────────────────┼────────────────────────────────────────────┤
 *   │ work_started                   │ WorkflowInstance.stepStates[].startedAt    │
 *   │ work_completed / work_failed   │ AgentRun terminal records                  │
 *   │ approval_requested             │ ApprovalRecord.requestedAt                 │
 *   │ approval_approved / _rejected  │ ApprovalRecord.decision + decidedAt        │
 *   │ side_effect_authorized         │ SideEffectAudit decision='allowed'         │
 *   │ side_effect_denied             │ SideEffectAudit decision='denied'          │
 *   │ scheduled_execution            │ ScheduledWorkItem.executionHistory[]       │
 *   │ automation_paused / _resumed   │ ScheduledWorkItem.pausedState              │
 *   │ automation_cancelled           │ ScheduledWorkItem.cancellationState        │
 *   └────────────────────────────────┴────────────────────────────────────────────┘
 *
 * Deliberately NOT projected (honest, by design):
 *   - SchedulerHeartbeat evaluation passes: background machinery. A heartbeat
 *     that executed occurrences describes the SAME logical events already
 *     carried by executionHistory + AgentRun records; projecting it would
 *     duplicate them. (The heartbeat log remains visible via the scheduler
 *     status projection.)
 *   - SideEffectAudit records with reasonCode IDEMPOTENT_REPLAY: a replay
 *     serves a cached result for an operation that was already authorized
 *     and executed — the same logical authorization, not a new company event.
 *   - Schedule creation, approval revocation/expiry: not part of the frozen
 *     4.4C event taxonomy; no events are fabricated for them.
 *
 * DETERMINISM CONTRACT
 *   - Ordering: by event time (newest first), then by frozen category rank,
 *     then by source record id — NEVER by database/insertion order.
 *   - Deduplication: by deterministic projection id `category:sourceId`.
 *     Multiple authoritative records describing the same logical event
 *     collapse to one Activity item.
 *   - Summaries: concise and NON-SENSITIVE. No payloads, no payload hashes,
 *     no target details, no authorization evidence, no error strings. Only
 *     provenance POINTERS (existing ids) trace to the authorized inspectors.
 *
 * Workstream identity reuses the canonical canvas read-model derivation
 * (deterministicIdHash in graph/read-model.ts) — the same workstream objects
 * the founder sees on the canvas.
 */

import {
  ACTIVITY_CATEGORY_RANK,
  ActivityEventDTO,
} from '@/types/activity';
import type {
  AgentRunRecord,
  IAgentRunStore,
} from '@/lib/server/agents/run-store';
import type {
  FounderApprovalRecord,
  SideEffectAuditRecord,
} from '@/types/authorization';
import { SideEffectAuthorizationGate } from '@/lib/server/authorization/gate';
import { getWorkflowStore } from '@/lib/server/workflow/store';
import { InMemoryScheduledWorkStore } from '@/lib/server/workflow/scheduler-store';
import type { WorkflowInstanceState } from '@/types/workflow';
import type { ScheduledWorkItem } from '@/types/scheduling';
import { deterministicIdHash } from '@/lib/server/graph/read-model';

/* ------------------------------------------------------------------ inputs */

/** The authoritative records the projection derives from. Kept as an explicit
 *  struct so tests can inject a fresh snapshot of the SAME record types the
 *  live stores return — the derivation itself stays pure and real. */
export interface ActivitySourceRecords {
  agentRuns: AgentRunRecord[];
  approvals: FounderApprovalRecord[];
  audits: SideEffectAuditRecord[];
  workflowInstances: WorkflowInstanceState[];
  scheduledItems: ScheduledWorkItem[];
}

/** Bounded per-source read window (most recent records). The projection is a
 *  feed, not an archive scan; older records beyond the window are honestly
 *  not projected (disclosed). Runs are the highest-volume source. */
const RUN_WINDOW = 500;
const APPROVAL_WINDOW = 200;
const AUDIT_WINDOW = 200;

/** Reads a bounded snapshot of the authoritative records through the EXISTING
 *  store singletons (dual-mode dev/prod behavior preserved). Fail-closed:
 *  any store error propagates — the projection never fabricates records. */
export async function loadActivitySourceRecords(): Promise<ActivitySourceRecords> {
  const gate = SideEffectAuthorizationGate.getInstance();
  const runStore: IAgentRunStore = await import('@/lib/server/agents/run-store').then(
    (m) => m.AgentRunStore.getInstance()
  );
  const workflowStore = getWorkflowStore();
  const schedulerStore = InMemoryScheduledWorkStore.getInstance();

  const [agentRuns, approvals, audits, workflowInstances, scheduledItems] =
    await Promise.all([
      runStore.listRuns({ limit: RUN_WINDOW }),
      gate.listApprovals({}),
      gate.listAudits({}),
      workflowStore.listInstances(),
      schedulerStore.list(),
    ]);

  // listApprovals/listAudits have no limit parameter in the store contract —
  // bound the projection window deterministically (newest first by the same
  // sort used for display) so a pathological ledger cannot grow the response
  // unboundedly.
  const recentApprovals = boundMostRecent(
    approvals,
    APPROVAL_WINDOW,
    (a) => a.requestedAt
  );
  const recentAudits = boundMostRecent(audits, AUDIT_WINDOW, (a) => a.timestamp);

  return {
    agentRuns,
    approvals: recentApprovals,
    audits: recentAudits,
    workflowInstances,
    scheduledItems,
  };
}

function boundMostRecent<T>(
  records: T[],
  limit: number,
  timeOf: (record: T) => string
): T[] {
  if (records.length <= limit) return records;
  return [...records]
    .sort((a, b) => timeOf(b).localeCompare(timeOf(a)))
    .slice(0, limit);
}

/* ------------------------------------------------------------- derivation */

function truncate(text: string, max = 64): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function isoTime(value: string | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

const ROLE_LABELS: Record<string, string> = {
  coo: 'Sophia Vance (COO)',
  researcher: 'Dr. Aris Thorne (Research)',
  pm: 'Maya Lin (Product)',
  finance: 'Julian Cruz (Finance)',
  advisor: 'Strategic Advisor',
  founder: 'Founder',
  system: 'System',
};

function roleLabel(role: string | undefined): string {
  if (!role) return 'System';
  return ROLE_LABELS[role] ?? role;
}

/** Workstream provenance for a directive: the SAME deterministic identity the
 *  canvas read-model derives from run groups. */
function workstreamOf(directive: string): {
  workstreamId: string;
  workstreamTitle: string;
} {
  return {
    workstreamId: deterministicIdHash('ws', directive.trim()),
    workstreamTitle: truncate(directive),
  };
}

/** Instance-only workstream provenance (no run group): mirrors the read-model
 *  'wf' cross-reference. */
function instanceWorkstreamOf(instanceId: string, objective: string): {
  workstreamId: string;
  workstreamTitle: string;
} {
  return {
    workstreamId: deterministicIdHash('wf', instanceId),
    workstreamTitle: truncate(objective),
  };
}

/**
 * Pure, deterministic derivation of the Activity event list from the
 * authoritative source records. No I/O, no clocks, no randomness — the same
 * inputs ALWAYS produce the same events in the same order.
 */
export function deriveActivityEvents(
  sources: ActivitySourceRecords
): ActivityEventDTO[] {
  const events: ActivityEventDTO[] = [];
  const seen = new Set<string>();

  const push = (event: ActivityEventDTO): void => {
    // Deterministic dedupe: one logical event per (category, source record).
    if (seen.has(event.id)) return;
    seen.add(event.id);
    events.push(event);
  };

  /* ---- 1. Work lifecycle ------------------------------------------------ */

  // work_started ← WorkflowInstance step execution history (stepStates).
  // The authoritative start signal: the runtime stamps step.startedAt when a
  // step is claimed for execution. Council/orchestrate runs without a
  // workflow instance persist no start record — no event is invented for them.
  for (const instance of sources.workflowInstances) {
    for (const step of Object.values(instance.stepStates)) {
      if (!step.startedAt) continue;
      const ws = instanceWorkstreamOf(instance.instanceId, instance.objective);
      push({
        id: `work_started:${instance.instanceId}:${step.stepId}`,
        category: 'work_started',
        summary: `Work started: "${truncate(instance.objective)}" — ${roleLabel(step.assignedRole)} executing ${step.skill}`,
        at: step.startedAt,
        status: step.status === 'completed' ? 'completed' : step.status === 'failed' ? 'failed' : 'in_flight',
        actor: roleLabel(step.assignedRole),
        provenance: {
          ...ws,
          workflowInstanceId: instance.instanceId,
          stepId: step.stepId,
        },
      });
    }
  }

  // work_completed / work_failed ← AgentRun terminal records. Covers ALL real
  // agent executions (council directives AND scheduled occurrences): the
  // ServerAgentExecutor persists exactly one AgentRun per execution attempt,
  // so runId is the sound per-execution dedupe identity.
  //
  // Phase 4.4C provenance: when the WorkflowRuntime executed the run as a
  // workflow step, the run's provenance carries the AUTHORITATIVE
  // instance/step/occurrence identity (stamped by the runtime — never
  // client-supplied). Council/orchestrate runs carry none: their provenance
  // honestly stops at the workstream + AgentRun.
  const scheduleByOccurrence = new Map<string, ScheduledWorkItem>();
  for (const item of sources.scheduledItems) {
    for (const occ of item.executionHistory) {
      if (!scheduleByOccurrence.has(occ.occurrenceId)) {
        scheduleByOccurrence.set(occ.occurrenceId, item);
      }
    }
  }
  for (const run of sources.agentRuns) {
    if (run.status !== 'completed' && run.status !== 'failed') continue;
    const ws = workstreamOf(run.directive);
    const completed = run.status === 'completed';
    const runProv = (run.provenance ?? {}) as Partial<AgentRunRecord['provenance']>;
    const occItem = runProv.occurrenceId
      ? scheduleByOccurrence.get(runProv.occurrenceId)
      : undefined;
    push({
      id: `work_${completed ? 'completed' : 'failed'}:${run.runId}`,
      category: completed ? 'work_completed' : 'work_failed',
      summary: completed
        ? `Work completed: "${truncate(run.directive)}" — ${run.agentName} (${run.protocolStep}, ${run.durationMs}ms)`
        : `Work failed: "${truncate(run.directive)}" — ${run.agentName} (${run.protocolStep})`,
      at: run.timestamp,
      status: completed ? 'completed' : 'failed',
      actor: run.agentName,
      provenance: {
        ...ws,
        workflowInstanceId: runProv.workflowInstanceId,
        stepId: runProv.stepId,
        agentRunId: run.runId,
        scheduleId: occItem?.id,
        occurrenceId: runProv.occurrenceId,
        occurrenceNumber: runProv.occurrenceNumber,
      },
    });
  }

  /* ---- 2. Founder approvals --------------------------------------------- */

  for (const approval of sources.approvals) {
    const actor = roleLabel(approval.employeeRole);
    const approvalProvenance = {
      workflowInstanceId: approval.workflowInstanceId,
      stepId: approval.stepId,
      approvalId: approval.id,
      occurrenceId: approval.scope?.occurrenceId,
    };

    // approval_requested: the request itself, at requestedAt, regardless of
    // any later decision (the ApprovalRecord IS the authoritative request).
    push({
      id: `approval_requested:${approval.id}`,
      category: 'approval_requested',
      summary: `Founder approval requested: "${truncate(approval.actionName)}" (${approval.classification})`,
      at: approval.requestedAt,
      status:
        approval.decision === 'pending'
          ? 'pending'
          : approval.decision === 'approved'
            ? 'approved'
            : approval.decision === 'rejected'
              ? 'rejected'
              : undefined,
      actor,
      provenance: approvalProvenance,
    });

    // approval decision events (approved / rejected) at decidedAt.
    if (
      (approval.decision === 'approved' || approval.decision === 'rejected') &&
      approval.decidedAt
    ) {
      push({
        id: `approval_${approval.decision}:${approval.id}`,
        category:
          approval.decision === 'approved'
            ? 'approval_approved'
            : 'approval_rejected',
        summary:
          approval.decision === 'approved'
            ? `Founder approved: "${truncate(approval.actionName)}"`
            : `Founder rejected: "${truncate(approval.actionName)}"`,
        at: approval.decidedAt,
        status: approval.decision,
        actor: 'Founder',
        provenance: approvalProvenance,
      });
    }
  }

  /* ---- 3. Side-effect authorizations ------------------------------------ */

  for (const audit of sources.audits) {
    // IDEMPOTENT_REPLAY: a cached re-serve of an operation that was already
    // authorized — the same logical authorization, not a new company event.
    // Excluded so duplicate source records never duplicate logical Activity.
    if (audit.reasonCode === 'IDEMPOTENT_REPLAY') continue;

    const allowed = audit.decision === 'allowed';
    push({
      id: `side_effect_${allowed ? 'authorized' : 'denied'}:${audit.id}`,
      category: allowed ? 'side_effect_authorized' : 'side_effect_denied',
      summary: allowed
        ? `Side effect authorized: ${truncate(audit.actionName)} (${audit.actionClassification})`
        : `Side effect denied: ${truncate(audit.actionName)} (${audit.actionClassification})`,
      at: audit.timestamp,
      status: allowed ? 'allowed' : 'denied',
      actor: roleLabel(audit.employeeRole),
      provenance: {
        workflowInstanceId: audit.workflowInstanceId,
        stepId: audit.stepId,
        auditId: audit.id,
        approvalId: audit.approvalId,
      },
    });
  }

  /* ---- 4. Automation (scheduled work) ------------------------------------ */

  for (const item of sources.scheduledItems) {
    const ws = instanceWorkstreamOf(
      item.workflowInstanceId,
      objectiveOf(item, sources)
    );

    // scheduled_execution: one event per occurrence, from the durable
    // per-occurrence history (replace-or-push semantics keep exactly one
    // record per occurrenceId — repeated heartbeats cannot duplicate it).
    for (const occ of item.executionHistory) {
      push({
        id: `scheduled_execution:${occ.occurrenceId}`,
        category: 'scheduled_execution',
        summary: `Automation ran: occurrence ${occ.occurrenceNumber} of "${ws.workstreamTitle}"`,
        at: occ.triggeredAt,
        status:
          occ.status === 'completed'
            ? 'completed'
            : occ.status === 'failed'
              ? 'failed'
              : occ.status === 'awaiting_approval'
                ? 'awaiting_approval'
                : 'in_flight',
        actor: 'Scheduler',
        provenance: {
          ...ws,
          scheduleId: item.id,
          workflowInstanceId: item.workflowInstanceId,
          stepId: item.stepId,
          occurrenceId: occ.occurrenceId,
          occurrenceNumber: occ.occurrenceNumber,
        },
      });
    }

    // automation_paused (latest retained pause window — model semantics).
    if (item.pausedState) {
      push({
        id: `automation_paused:${item.id}:${item.pausedState.pausedAt}`,
        category: 'automation_paused',
        summary: `Automation paused: "${ws.workstreamTitle}"`,
        at: item.pausedState.pausedAt,
        status: item.pausedState.resumedAt ? 'resumed' : 'paused',
        actor: 'Founder',
        provenance: {
          ...ws,
          scheduleId: item.id,
          workflowInstanceId: item.workflowInstanceId,
        },
      });

      // automation_resumed — ONLY when the authoritative record carries resume
      // provenance (Phase 4.4C). Pre-4.4C resumes left no derivable
      // timestamp; no event is fabricated for them.
      if (item.pausedState.resumedAt) {
        push({
          id: `automation_resumed:${item.id}:${item.pausedState.resumedAt}`,
          category: 'automation_resumed',
          summary: `Automation resumed: "${ws.workstreamTitle}"`,
          at: item.pausedState.resumedAt,
          status: 'resumed',
          actor: 'Founder',
          provenance: {
            ...ws,
            scheduleId: item.id,
            workflowInstanceId: item.workflowInstanceId,
          },
        });
      }
    }

    // automation_cancelled (founder action or honest system cancellation).
    if (item.cancellationState) {
      push({
        id: `automation_cancelled:${item.id}:${item.cancellationState.cancelledAt}`,
        category: 'automation_cancelled',
        summary: `Automation cancelled: "${ws.workstreamTitle}"`,
        at: item.cancellationState.cancelledAt,
        status: 'cancelled',
        actor:
          item.cancellationState.cancelledBy === 'system' ? 'System' : 'Founder',
        provenance: {
          ...ws,
          scheduleId: item.id,
          workflowInstanceId: item.workflowInstanceId,
        },
      });
    }
  }

  /* ---- 5. Deterministic ordering ----------------------------------------- */

  // Newest first; ties broken by frozen category rank, then source id —
  // never by database/insertion order.
  events.sort((a, b) => {
    const timeDelta = isoTime(b.at) - isoTime(a.at);
    if (timeDelta !== 0) return timeDelta;
    const rankDelta =
      ACTIVITY_CATEGORY_RANK[a.category] - ACTIVITY_CATEGORY_RANK[b.category];
    if (rankDelta !== 0) return rankDelta;
    return a.id.localeCompare(b.id);
  });

  return events;
}

/** Objective for a scheduled item: from its workflow instance when present in
 *  the same snapshot (the authoritative source); falls back honestly to the
 *  schedule's own persisted step-name provenance — never fabricated. */
function objectiveOf(
  item: ScheduledWorkItem,
  sources: ActivitySourceRecords
): string {
  const instance = sources.workflowInstances.find(
    (i) => i.instanceId === item.workflowInstanceId
  );
  if (instance?.objective) return instance.objective;
  return item.provenance?.stepName || item.id;
}

/* -------------------------------------------------------------- projection */

export interface ActivityProjectionOptions {
  /** Maximum events returned (founder feed slice). Default 60, cap 200. */
  limit?: number;
}

export interface ActivityProjectionResult {
  asOfTime: string;
  totalProjected: number;
  events: ActivityEventDTO[];
}

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

/**
 * Builds the founder-facing Activity projection from the CURRENT authoritative
 * records. Stateless and deterministic: two calls over identical store
 * content produce identical output (except asOfTime, the honest read clock).
 */
export async function buildActivityProjection(
  options: ActivityProjectionOptions = {}
): Promise<ActivityProjectionResult> {
  const requested = options.limit ?? DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_LIMIT, requested));

  const sources = await loadActivitySourceRecords();
  const events = deriveActivityEvents(sources);

  return {
    asOfTime: new Date().toISOString(),
    totalProjected: events.length,
    events: events.slice(0, limit),
  };
}
