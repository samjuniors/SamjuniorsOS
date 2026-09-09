/**
 * PHASE 3.3 — Cockpit overview display derivations (pure, client-safe).
 *
 * The read-side counterpart of lib/cockpit/command-terminal-state.ts: this
 * module holds NO data of its own. It derives the cockpit's DISPLAY state
 * (Vitals Wall + Executive Stream) from the authoritative server response of
 * GET /api/cockpit/overview (lib/server/cockpit/overview.ts) and maps read
 * failures to honest error states.
 *
 * Hard rules encoded here (pinned by tests/phase3_3_authoritative_reads.test.ts):
 * - No fabricated values: every metric rendered by the cockpit comes from the
 *   server response; absent data renders as an explicit unavailable/empty state.
 * - A failed read NEVER renders as "0"/"All clear" — it renders as an error.
 * - Relative times are derived only from response timestamps.
 */

// ---------------------------------------------------------------------------
// Minimal typed mirror of the GET /api/cockpit/overview response contract.
// Read-only view of lib/server/cockpit/overview.ts — the server remains the
// single authority; this is NOT a second data model.
// ---------------------------------------------------------------------------

export type CockpitStreamSourceView = 'workflow' | 'approval' | 'agent_run' | 'audit';

export interface CockpitStreamEventView {
  id: string;
  source: CockpitStreamSourceView;
  timestamp: string;
  title: string;
  summary: string;
}

export interface CockpitFleetEntryView {
  agentId: string;
  agentName: string;
  role: string;
  lastRun: {
    runId: string;
    status: 'running' | 'completed' | 'failed' | 'halted';
    taskTitle: string;
    timestamp: string;
  } | null;
}

export interface CockpitOverviewView {
  asOf?: string;
  persistenceMode?: string;
  vitals?: {
    workflows?: {
      active?: number;
      awaitingApproval?: number;
      blocked?: number;
      failed?: number;
      completed?: number;
      cancelled?: number;
      total?: number;
    };
    approvals?: { pending?: number };
    scheduledWork?: { scheduled?: number; nextDueAt?: string };
    epistemic?: { claimsPendingVerification?: number };
    agentRuns?: {
      completedLast24h?: number;
      failedLast24h?: number;
      windowHours?: number;
    };
  };
  recentWorkflows?: Array<{
    instanceId: string;
    objective: string;
    status: string;
    updatedAt: string;
  }>;
  fleet?: CockpitFleetEntryView[];
  stream?: CockpitStreamEventView[];
}

export interface CockpitOverviewErrorBody {
  error?: string;
  source?: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// Read error model (mirrors the command-terminal convention)
// ---------------------------------------------------------------------------

export type OverviewErrorKind =
  | 'unauthenticated' // 401 — no verified founder session
  | 'unavailable' // 503 — authoritative persistence unreachable
  | 'server_error' // 500 — read failed
  | 'network_error'; // fetch rejected (no HTTP response)

export interface OverviewErrorState {
  kind: OverviewErrorKind;
  /** Safe, server-provided message when present; honest default otherwise. */
  detail: string;
}

const DEFAULT_OVERVIEW_ERROR_DETAIL: Record<OverviewErrorKind, string> = {
  unauthenticated:
    'Founder session required — Command Center reads are unavailable until you re-authenticate.',
  unavailable:
    'Authoritative persistence is unavailable. Vital signs are NOT shown as zeros because the real state is unknown.',
  server_error:
    'Command Center reads failed. No metrics are shown rather than fabricated values.',
  network_error:
    'No response from the server (network/timeout). The last successful read is shown; live status is unknown.',
};

export function deriveOverviewErrorFromHttpStatus(
  status: number,
  body?: CockpitOverviewErrorBody | null
): OverviewErrorState {
  const serverMessage =
    typeof body?.error === 'string' ? body.error : undefined;
  let kind: OverviewErrorKind;
  switch (status) {
    case 401:
      kind = 'unauthenticated';
      break;
    case 503:
      kind = 'unavailable';
      break;
    default:
      kind = 'server_error';
      break;
  }
  return {
    kind,
    detail: serverMessage || DEFAULT_OVERVIEW_ERROR_DETAIL[kind],
  };
}

export function deriveOverviewErrorFromNetworkFailure(
  reason?: unknown
): OverviewErrorState {
  return {
    kind: 'network_error',
    detail: DEFAULT_OVERVIEW_ERROR_DETAIL.network_error,
  };
}

// ---------------------------------------------------------------------------
// Display derivations
// ---------------------------------------------------------------------------

/** Formats an ISO timestamp as a compact clock time (client locale). */
export function formatClockTime(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Honest relative-time label derived ONLY from the response timestamp. */
export function formatRelativeTime(iso?: string, now: Date = new Date()): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const deltaMs = now.getTime() - t;
  const minutes = Math.floor(Math.abs(deltaMs) / 60000);
  let span: string;
  if (minutes < 1) span = 'just now';
  else if (minutes < 60) span = `${minutes}m`;
  else if (minutes < 60 * 24) span = `${Math.floor(minutes / 60)}h`;
  else span = `${Math.floor(minutes / (60 * 24))}d`;
  if (deltaMs < 0 && span !== 'just now') return `in ${span}`;
  return span === 'just now' ? span : `${span} ago`;
}

/** Human label for the disclosed persistence mode (server-reported, not assumed). */
export function describePersistenceMode(mode?: string): string {
  switch (mode) {
    case 'authoritative':
      return 'PostgreSQL (authoritative)';
    case 'test':
      return 'Test persistence';
    case 'local':
      return 'Durable file store (local)';
    default:
      return 'Unknown persistence mode';
  }
}

export type VitalsTone = 'positive' | 'warning' | 'critical' | 'neutral';

export interface VitalsTile {
  key: string;
  label: string;
  value: string;
  hint?: string;
  tone: VitalsTone;
}

/**
 * Derives the four Vitals Wall metric tiles from the authoritative overview.
 * Each tile's definition is documented on the server aggregation and merely
 * rendered here — no client-side recomputation of any count.
 */
export function deriveVitalsTiles(
  overview: CockpitOverviewView,
  now: Date = new Date()
): VitalsTile[] {
  const v = overview.vitals ?? {};
  const tiles: VitalsTile[] = [];

  const pending = v.approvals?.pending;
  if (typeof pending === 'number') {
    tiles.push({
      key: 'pending-approvals',
      label: 'Pending Approvals',
      value: String(pending),
      hint: 'Approval records awaiting the founder decision',
      tone: pending > 0 ? 'warning' : 'positive',
    });
  }

  const scheduled = v.scheduledWork?.scheduled;
  if (typeof scheduled === 'number') {
    tiles.push({
      key: 'scheduled-work',
      label: 'Scheduled Work',
      value: String(scheduled),
      hint:
        v.scheduledWork?.nextDueAt
          ? `Next due ${formatRelativeTime(v.scheduledWork.nextDueAt, now)}`
          : 'No due item recorded',
      tone: 'neutral',
    });
  }

  const claims = v.epistemic?.claimsPendingVerification;
  if (typeof claims === 'number') {
    tiles.push({
      key: 'claims-pending',
      label: 'Claims Pending Verification',
      value: String(claims),
      hint: 'Epistemic claims awaiting verification review',
      tone: claims > 0 ? 'warning' : 'positive',
    });
  }

  const windowHours = v.agentRuns?.windowHours ?? 24;
  const completed = v.agentRuns?.completedLast24h;
  const failed = v.agentRuns?.failedLast24h;
  if (typeof completed === 'number' && typeof failed === 'number') {
    tiles.push({
      key: 'agent-runs',
      label: `Agent Runs (${windowHours}h)`,
      value: `${completed} ok / ${failed} failed`,
      hint: 'Persisted agent run outcomes in the trailing window',
      tone: failed > 0 ? 'critical' : completed > 0 ? 'positive' : 'neutral',
    });
  }

  return tiles;
}

/** Workflow status chip tone for the recent-workflows list. */
export function workflowStatusTone(status: string): VitalsTone {
  switch (status) {
    case 'completed':
      return 'positive';
    case 'awaiting_approval':
    case 'waiting':
    case 'pending':
      return 'warning';
    case 'blocked':
    case 'failed':
    case 'cancelled':
      return 'critical';
    case 'running':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Agent-run status chip tone for the fleet card. */
export function agentRunStatusTone(status: string): VitalsTone {
  switch (status) {
    case 'completed':
      return 'positive';
    case 'running':
      return 'neutral';
    case 'failed':
    case 'halted':
      return 'critical';
    default:
      return 'neutral';
  }
}

/** True only when a SUCCESSFUL read returned an empty stream. */
export function isStreamEmpty(overview: CockpitOverviewView): boolean {
  return (overview.stream?.length ?? 0) === 0;
}

/** True only when a SUCCESSFUL read returned no workflow instances. */
export function isWorkflowListEmpty(overview: CockpitOverviewView): boolean {
  return (overview.recentWorkflows?.length ?? 0) === 0;
}

/** True only when no fleet agent has any persisted run. */
export function isFleetInactive(overview: CockpitOverviewView): boolean {
  return (overview.fleet ?? []).every((entry) => entry.lastRun === null);
}
