import { DatabaseMode, getDatabaseMode } from '@/lib/server/db/authority';
import { getWorkflowStore } from '@/lib/server/workflow/store';
import { InMemoryScheduledWorkStore } from '@/lib/server/workflow/scheduler-store';
import { AgentRunStore, AgentRunRecord } from '@/lib/server/agents/run-store';
import { SideEffectAuthorizationGate } from '@/lib/server/authorization/gate';
import { EpistemicClaimStore } from '@/lib/server/epistemic/claim-store';
import { DETAILED_AI_EMPLOYEE_PROFILES } from '@/lib/employee-profiles';
import { AgentRole } from '@/types/os';

/**
 * PHASE 3.3 — AUTHORITATIVE COMMAND CENTER READS (server-side aggregation).
 *
 * A READ-ONLY query layer for the Executive Cockpit. It performs NO mutation of
 * any authoritative state: every value it returns is derived exclusively from
 * the EXISTING persistence repositories (workflow instance store, scheduled
 * work store, agent run store, approval/audit stores behind the
 * SideEffectAuthorizationGate, and the epistemic claim store).
 *
 * Every metric below carries an explicit, deterministic definition. Metrics
 * with no authoritative source (e.g. financial runway, gross margin, static
 * initiatives, fabricated agent activity) are deliberately ABSENT from this
 * view: the Command Center renders "not available"/empty states for them
 * rather than substituting demo values.
 *
 * Failure semantics: fail-closed per source. If any repository read throws
 * (e.g. DatabaseAuthorityError when PostgreSQL is unavailable in authoritative
 * mode), the aggregation fails with the source named — a database failure is
 * NEVER translated into "0 active workflows".
 */

// ---------------------------------------------------------------------------
// Bounded read sizes (single-founder scale; server-side slicing only)
// ---------------------------------------------------------------------------

const RECENT_WORKFLOW_LIMIT = 8;
const STREAM_EVENT_LIMIT = 30;
const AGENT_RUN_WINDOW_LIMIT = 100;
const AGENT_RUN_WINDOW_HOURS = 24;
const RECENT_AUDIT_LIMIT = 10;
const RECENT_RUN_EVENT_LIMIT = 10;
const RECENT_APPROVAL_EVENT_LIMIT = 8;

// ---------------------------------------------------------------------------
// Typed view (serialized verbatim as the GET /api/cockpit/overview response)
// ---------------------------------------------------------------------------

export type CockpitStreamSource = 'workflow' | 'approval' | 'agent_run' | 'audit';

export interface CockpitStreamEvent {
  /** Stable, derived from the underlying record id (`source:recordId`). */
  id: string;
  source: CockpitStreamSource;
  /** ISO 8601 timestamp of the underlying persisted record. */
  timestamp: string;
  title: string;
  summary: string;
}

export interface CockpitFleetEntry {
  agentId: string;
  /** Roster configuration name (which AI employees exist), NOT runtime state. */
  agentName: string;
  role: string;
  /** Last real persisted run for this agent, or null when none exists. */
  lastRun: {
    runId: string;
    status: AgentRunRecord['status'];
    taskTitle: string;
    timestamp: string;
  } | null;
}

export interface CockpitOverview {
  asOf: string;
  persistenceMode: DatabaseMode;
  vitals: {
    /** Workflow instances currently in non-terminal, non-gated states. */
    workflows: {
      active: number;
      awaitingApproval: number;
      blocked: number;
      failed: number;
      completed: number;
      cancelled: number;
      total: number;
    };
    approvals: { pending: number };
    scheduledWork: { scheduled: number; nextDueAt?: string };
    epistemic: { claimsPendingVerification: number };
    agentRuns: {
      completedLast24h: number;
      failedLast24h: number;
      windowHours: number;
    };
  };
  recentWorkflows: Array<{
    instanceId: string;
    objective: string;
    status: string;
    updatedAt: string;
  }>;
  fleet: CockpitFleetEntry[];
  stream: CockpitStreamEvent[];
}

/** Thrown when one of the authoritative sources fails; names the source. */
export class CockpitReadError extends Error {
  public constructor(
    public readonly source: string,
    public readonly cause?: unknown
  ) {
    super(
      `Authoritative read failed for '${source}': ${
        cause instanceof Error ? cause.message : String(cause)
      }`
    );
    this.name = 'CockpitReadError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function toMillis(iso?: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

// ---------------------------------------------------------------------------
// Section readers (each wraps ONE authoritative source, fail-closed)
// ---------------------------------------------------------------------------

async function readWorkflowInstances() {
  try {
    return await getWorkflowStore().listInstances();
  } catch (err) {
    throw new CockpitReadError('workflow-instances', err);
  }
}

async function readScheduledWork() {
  try {
    return await InMemoryScheduledWorkStore.getInstance().list({
      status: 'scheduled',
    });
  } catch (err) {
    throw new CockpitReadError('scheduled-work', err);
  }
}

async function readAgentRuns() {
  try {
    return await AgentRunStore.getInstance().listRuns({
      limit: AGENT_RUN_WINDOW_LIMIT,
    });
  } catch (err) {
    throw new CockpitReadError('agent-runs', err);
  }
}

async function readPendingApprovals() {
  try {
    const gate = SideEffectAuthorizationGate.getInstance();
    return {
      pending: await gate.listApprovals({ status: 'pending' }),
      approved: await gate.listApprovals({ status: 'approved' }),
      rejected: await gate.listApprovals({ status: 'rejected' }),
    };
  } catch (err) {
    throw new CockpitReadError('approvals', err);
  }
}

async function readRecentAudits() {
  try {
    return await SideEffectAuthorizationGate.getInstance().listAudits();
  } catch (err) {
    throw new CockpitReadError('audit-trail', err);
  }
}

async function readPendingClaims() {
  try {
    return await EpistemicClaimStore.getInstance().listClaims({
      status: 'pending',
    });
  } catch (err) {
    throw new CockpitReadError('epistemic-claims', err);
  }
}

// ---------------------------------------------------------------------------
// Derivations (deterministic, factual persisted state only)
// ---------------------------------------------------------------------------

function deriveWorkflowVitals(
  instances: Awaited<ReturnType<typeof readWorkflowInstances>>
): CockpitOverview['vitals']['workflows'] {
  const vitals = {
    active: 0,
    awaitingApproval: 0,
    blocked: 0,
    failed: 0,
    completed: 0,
    cancelled: 0,
    total: instances.length,
  };
  for (const instance of instances) {
    switch (instance.status) {
      case 'pending':
      case 'running':
      case 'waiting':
        vitals.active++;
        break;
      case 'awaiting_approval':
        vitals.awaitingApproval++;
        break;
      case 'blocked':
        vitals.blocked++;
        break;
      case 'failed':
        vitals.failed++;
        break;
      case 'completed':
        vitals.completed++;
        break;
      case 'cancelled':
        vitals.cancelled++;
        break;
      default:
        // Unknown persisted status is not silently bucketed into any count.
        break;
    }
  }
  return vitals;
}

function deriveScheduledVitals(
  items: Awaited<ReturnType<typeof readScheduledWork>>
): CockpitOverview['vitals']['scheduledWork'] {
  let nextDueAt: string | undefined;
  for (const item of items) {
    if (!nextDueAt || toMillis(item.executeAt) < toMillis(nextDueAt)) {
      nextDueAt = item.executeAt;
    }
  }
  return { scheduled: items.length, nextDueAt };
}

function deriveAgentRunVitals(
  runs: AgentRunRecord[],
  nowMs: number
): CockpitOverview['vitals']['agentRuns'] {
  const windowMs = AGENT_RUN_WINDOW_HOURS * 60 * 60 * 1000;
  let completed = 0;
  let failed = 0;
  for (const run of runs) {
    if (nowMs - toMillis(run.timestamp) <= windowMs) {
      if (run.status === 'completed') completed++;
      else if (run.status === 'failed' || run.status === 'halted') failed++;
    }
  }
  return {
    completedLast24h: completed,
    failedLast24h: failed,
    windowHours: AGENT_RUN_WINDOW_HOURS,
  };
}

function deriveFleet(
  runs: AgentRunRecord[]
): CockpitFleetEntry[] {
  const roles = Object.keys(DETAILED_AI_EMPLOYEE_PROFILES) as AgentRole[];
  return roles.map((role) => {
    const profile = DETAILED_AI_EMPLOYEE_PROFILES[role];
    const lastRun = runs.find((r) => r.agentId === role) ?? null;
    return {
      agentId: role,
      agentName: profile?.name ?? role,
      role: profile?.role ?? '',
      lastRun: lastRun
        ? {
            runId: lastRun.runId,
            status: lastRun.status,
            taskTitle: lastRun.taskTitle,
            timestamp: lastRun.timestamp,
          }
        : null,
    };
  });
}

function deriveWorkflowStreamEvents(
  instances: Awaited<ReturnType<typeof readWorkflowInstances>>
): CockpitStreamEvent[] {
  const sorted = [...instances].sort(
    (a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt)
  );
  return sorted.slice(0, RECENT_WORKFLOW_LIMIT).map((instance) => ({
    id: `workflow:${instance.instanceId}`,
    source: 'workflow' as const,
    timestamp: instance.updatedAt,
    title: `Workflow ${instance.status.replace(/_/g, ' ')}`,
    summary: truncate(instance.objective, 160),
  }));
}

function deriveApprovalStreamEvents(approvals: {
  pending: Awaited<ReturnType<typeof readPendingApprovals>>['pending'];
  approved: Awaited<ReturnType<typeof readPendingApprovals>>['approved'];
  rejected: Awaited<ReturnType<typeof readPendingApprovals>>['approved'];
}): CockpitStreamEvent[] {
  const decided = [
    ...approvals.approved.map((r) => ({ record: r, decision: 'approved' as const })),
    ...approvals.rejected.map((r) => ({ record: r, decision: 'rejected' as const })),
  ]
    .filter((entry) => Boolean(entry.record.decidedAt || entry.record.requestedAt))
    .sort(
      (a, b) =>
        toMillis(b.record.decidedAt ?? b.record.requestedAt) -
        toMillis(a.record.decidedAt ?? a.record.requestedAt)
    )
    .slice(0, RECENT_APPROVAL_EVENT_LIMIT);

  return decided.map(({ record, decision }) => ({
    id: `approval:${record.id}`,
    source: 'approval' as const,
    timestamp: record.decidedAt ?? record.requestedAt!,
    title: `Founder ${decision} side-effect request`,
    summary: truncate(
      `${record.actionName} (${record.classification}) requested by ${record.employeeRole}`,
      160
    ),
  }));
}

function deriveAgentRunStreamEvents(
  runs: AgentRunRecord[]
): CockpitStreamEvent[] {
  return runs.slice(0, RECENT_RUN_EVENT_LIMIT).map((run) => ({
    id: `agent_run:${run.runId}`,
    source: 'agent_run' as const,
    timestamp: run.timestamp,
    title: `${run.agentName} run ${run.status}`,
    summary: truncate(run.taskTitle, 160),
  }));
}

function deriveAuditStreamEvents(
  audits: Awaited<ReturnType<typeof readRecentAudits>>
): CockpitStreamEvent[] {
  return audits.slice(0, RECENT_AUDIT_LIMIT).map((audit) => ({
    id: `audit:${audit.id}`,
    source: 'audit' as const,
    timestamp: audit.timestamp,
    title: `Side-effect gate: ${audit.decision.replace(/_/g, ' ')}`,
    summary: truncate(
      `${audit.actionName} by ${audit.employeeRole} — ${
        audit.executed ? 'executed' : 'not executed'
      }`,
      160
    ),
  }));
}

function mergeStreamEvents(
  sections: CockpitStreamEvent[]
): CockpitStreamEvent[] {
  return [...sections]
    .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))
    .slice(0, STREAM_EVENT_LIMIT);
}

// ---------------------------------------------------------------------------
// Public aggregation entrypoint (READ-ONLY)
// ---------------------------------------------------------------------------

/**
 * Aggregates the authoritative Command Center overview. Read-only: it calls
 * only list/read methods on the existing repositories; no write path, no
 * gate decision, no workflow mutation is invoked anywhere below.
 */
export async function getCockpitOverview(): Promise<CockpitOverview> {
  // Each source read is fail-closed; failures throw CockpitReadError naming
  // the source (including DatabaseAuthorityError causes in authoritative mode).
  const [instances, scheduled, runs, approvals, audits, pendingClaims] =
    await Promise.all([
      readWorkflowInstances(),
      readScheduledWork(),
      readAgentRuns(),
      readPendingApprovals(),
      readRecentAudits(),
      readPendingClaims(),
    ]);

  const nowMs = Date.now();

  const sortedInstances = [...instances].sort(
    (a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt)
  );

  return {
    asOf: new Date(nowMs).toISOString(),
    persistenceMode: getDatabaseMode(),
    vitals: {
      workflows: deriveWorkflowVitals(instances),
      approvals: { pending: approvals.pending.length },
      scheduledWork: deriveScheduledVitals(scheduled),
      epistemic: { claimsPendingVerification: pendingClaims.length },
      agentRuns: deriveAgentRunVitals(runs, nowMs),
    },
    recentWorkflows: sortedInstances
      .slice(0, RECENT_WORKFLOW_LIMIT)
      .map((instance) => ({
        instanceId: instance.instanceId,
        objective: truncate(instance.objective, 120),
        status: instance.status,
        updatedAt: instance.updatedAt,
      })),
    fleet: deriveFleet(runs),
    stream: mergeStreamEvents([
      ...deriveWorkflowStreamEvents(instances),
      ...deriveApprovalStreamEvents(approvals),
      ...deriveAgentRunStreamEvents(runs),
      ...deriveAuditStreamEvents(audits),
    ]),
  };
}
