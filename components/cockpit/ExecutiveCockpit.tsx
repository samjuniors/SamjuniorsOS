'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Activity,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Users,
  Briefcase,
  LayoutGrid,
  RefreshCw,
  CalendarClock,
  FlaskConical,
  AlertTriangle,
  WifiOff,
  Database,
} from 'lucide-react';
import { FounderApprovalRecord } from '@/types/authorization';
import { AgentRole } from '@/types/os';
import { DETAILED_AI_EMPLOYEE_PROFILES } from '@/lib/employee-profiles';
import { PersonaStore } from '@/lib/persona-store';
import { CommandTerminal } from './CommandTerminal';
import { CommandOutcome, CommandErrorState } from '@/lib/cockpit/command-terminal-state';
import {
  CockpitOverviewView,
  CockpitStreamEventView,
  OverviewErrorState,
  deriveOverviewErrorFromHttpStatus,
  deriveOverviewErrorFromNetworkFailure,
  deriveVitalsTiles,
  describePersistenceMode,
  formatClockTime,
  formatRelativeTime,
  workflowStatusTone,
  agentRunStatusTone,
} from '@/lib/cockpit/overview-state';

interface ExecutiveCockpitProps {
  onSwitchToClassic: () => void;
  onOpenApp?: (appId: string) => void;
  onInspectEmployee?: (agentId: AgentRole) => void;
}

/** Approval record enriched with workflow context by GET /api/workflow/approvals. */
interface EnrichedApprovalRecord extends FounderApprovalRecord {
  workflowObjective?: string;
  workflowStatus?: string;
  stepStatus?: string;
  stepSkill?: string;
}

interface DecisionReconciliation {
  reconciled?: boolean;
  workflowInstanceId?: string;
  stepId?: string;
  workflowStatus?: string;
  stepStatus?: string;
  auditRecords?: number;
  outcomeNote?: string;
  error?: string;
}

/**
 * PHASE 3.3 — Executive Stream events.
 *
 * Server events are derived exclusively from persisted records via
 * GET /api/cockpit/overview (workflow instances, approval decisions, agent
 * runs, audit records). Local session events may additionally relay REAL
 * server outcomes (Phase 3.2 semantics: pushed only AFTER the server returns
 * the actual result) — nothing here is fabricated.
 */
interface StreamEvent {
  id: string;
  /** Display clock label. */
  timestamp: string;
  /** Server events carry their record's ISO timestamp. */
  timestampIso?: string;
  role: string;
  author: string;
  title: string;
  summary: string;
  type: 'milestone' | 'approval' | 'telemetry' | 'advisor';
  /** Present on server-derived events; identifies the persisted source. */
  source?: CockpitStreamEventView['source'];
}

const OVERVIEW_POLL_INTERVAL_MS = 15000;
const APPROVALS_POLL_INTERVAL_MS = 10000;

const STREAM_SOURCE_META: Record<
  CockpitStreamEventView['source'],
  { author: string; role: string; type: StreamEvent['type']; label: string }
> = {
  workflow: { author: 'Workflow Runtime', role: 'System', type: 'telemetry', label: 'WORKFLOW' },
  approval: { author: 'Founder & CEO', role: 'Executive Authority', type: 'approval', label: 'APPROVAL' },
  agent_run: { author: 'AI Employee', role: 'Agent Run', type: 'milestone', label: 'AGENT RUN' },
  audit: { author: 'Authorization Gate', role: 'Governance', type: 'approval', label: 'AUDIT' },
};

const TONE_CLASS: Record<string, string> = {
  positive: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  critical: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  neutral: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

function mapServerStreamEvents(
  events: CockpitStreamEventView[] | undefined
): StreamEvent[] {
  return (events ?? []).map((evt) => {
    const meta = STREAM_SOURCE_META[evt.source] ?? STREAM_SOURCE_META.workflow;
    return {
      id: evt.id,
      timestamp: formatClockTime(evt.timestamp),
      timestampIso: evt.timestamp,
      author: meta.author,
      role: meta.role,
      title: evt.title,
      summary: evt.summary,
      type: meta.type,
      source: evt.source,
    };
  });
}

export function ExecutiveCockpit({
  onSwitchToClassic,
  onOpenApp,
  onInspectEmployee,
}: ExecutiveCockpitProps) {
  // -----------------------------------------------------------------------
  // AUTHORITATIVE OVERVIEW (Phase 3.3) — Vitals Wall + Executive Stream now
  // derive from persisted state via GET /api/cockpit/overview. The demo-data
  // constants previously imported from lib/os-data (seed initiatives, the
  // static workforce array, the sample financial model, and the seeded stream
  // events) are REMOVED.
  // -----------------------------------------------------------------------
  const [overview, setOverview] = useState<CockpitOverviewView | null>(null);
  const [overviewError, setOverviewError] = useState<OverviewErrorState | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [serverStreamEvents, setServerStreamEvents] = useState<StreamEvent[]>([]);
  const [localStreamEvents, setLocalStreamEvents] = useState<StreamEvent[]>([]);

  // Approvals Inbox State (Phase 3.1 loop — unchanged semantics, with an
  // honest failure state added in Phase 3.3: a failed read no longer renders
  // as "All Side-Effects Clear").
  const [approvals, setApprovals] = useState<EnrichedApprovalRecord[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(true);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/cockpit/overview');
      if (res.ok) {
        const data = (await res.json()) as CockpitOverviewView;
        setOverview(data);
        setOverviewError(null);
        setServerStreamEvents(mapServerStreamEvents(data.stream));
      } else {
        let body: { error?: string; source?: string; code?: string } | null = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        setOverviewError(deriveOverviewErrorFromHttpStatus(res.status, body));
      }
    } catch (reason) {
      // Network failure: keep the last successful read (stale, clearly
      // labeled) — never silently substitute fabricated values.
      setOverviewError(deriveOverviewErrorFromNetworkFailure(reason));
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/workflow/approvals?status=pending');
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals || []);
        setApprovalsError(null);
      } else {
        const errBody = await res.json().catch(() => null);
        setApprovalsError(
          errBody?.error || `Approval reads failed (HTTP ${res.status}).`
        );
      }
    } catch (e: any) {
      setApprovalsError(`Approval reads unavailable: ${e?.message || 'network error'}`);
    } finally {
      setLoadingApprovals(false);
    }
  }, []);

  // Bounded polling: simple intervals, cleared on unmount. The underlying
  // data is genuinely polled from authoritative persistence — no simulated
  // liveness. The initial reads are deferred to a timer so the effect body
  // only subscribes; every setState happens asynchronously after a fetch.
  useEffect(() => {
    let mounted = true;

    const initialRead = setTimeout(() => {
      if (mounted) {
        loadApprovals();
        loadOverview();
      }
    }, 0);

    const approvalsTimer = setInterval(() => {
      if (mounted) loadApprovals();
    }, APPROVALS_POLL_INTERVAL_MS);
    const overviewTimer = setInterval(() => {
      if (mounted) loadOverview();
    }, OVERVIEW_POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearTimeout(initialRead);
      clearInterval(approvalsTimer);
      clearInterval(overviewTimer);
    };
  }, [loadApprovals, loadOverview]);

  // Handle Approval Decisions
  // Phase 3 (Command Center): the decision travels through the authorization
  // gate and is then reconciled into the bound workflow by the existing
  // runtime; the response reports the DURABLE outcome, which is what the
  // founder sees — never a UI-assumed success.
  const [decidingApprovalId, setDecidingApprovalId] = useState<string | null>(null);

  const handleDecision = async (approvalId: string, action: 'approve' | 'reject') => {
    setDecidingApprovalId(approvalId);
    try {
      const res = await fetch('/api/workflow/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          approvalId,
          reason: action === 'approve' ? 'Approved via Executive Cockpit' : 'Rejected via Executive Cockpit',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const recon: DecisionReconciliation | undefined = data?.reconciliation;
        let feedback: string;
        if (recon?.error) {
          // The decision itself is durable; reconciliation failed and must not be
          // silently presented as success.
          feedback = `Decision recorded, but workflow reconciliation FAILED: ${recon.error}`;
        } else if (recon?.reconciled) {
          feedback = `${action === 'approve' ? 'Approved' : 'Rejected'} — durable result: step '${recon.stepId}' is ${recon.stepStatus}, workflow ${recon.workflowStatus} (${recon.auditRecords} audit record${recon.auditRecords === 1 ? '' : 's'}).`;
        } else {
          feedback = `${action === 'approve' ? 'Approved' : 'Rejected'} — ${recon?.outcomeNote || 'Decision recorded.'}`;
        }
        setActionFeedback(feedback);
        setTimeout(() => setActionFeedback(null), 8000);
        loadApprovals();
        // The durable state changed — re-read the authoritative overview.
        loadOverview();

        // Push to executive stream (relays the REAL server reconciliation
        // result — pushed only after the server returned it).
        setLocalStreamEvents((prev) => [
          {
            id: `decision-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestampIso: new Date().toISOString(),
            role: 'Founder & CEO',
            author: 'Executive Authority',
            title: `Side-Effect Request ${action === 'approve' ? 'Authorized' : 'Rejected'}`,
            summary: recon?.outcomeNote || `Approval ${approvalId} processed with decision: ${action.toUpperCase()}`,
            type: 'approval',
          },
          ...prev,
        ]);
      } else {
        const err = await res.json();
        setActionFeedback(`Error: ${err.error || 'Failed to process'}`);
      }
    } catch (e: any) {
      setActionFeedback(`Network error: ${e.message}`);
    } finally {
      setDecidingApprovalId(null);
    }
  };

  // The command terminal reports the FINAL server-derived state; the stream
  // event reflects that actual result (durable status or request failure),
  // never an assumed success. The authoritative overview is re-read so the
  // Vitals Wall / stream reflect the new durable state.
  const pushCommandOutcome = useCallback(
    (directive: string, state: CommandOutcome | CommandErrorState, isOutcome: boolean) => {
      const label = isOutcome
        ? `Directive ${String((state as CommandOutcome).kind).replace(/_/g, ' ')} (server-verified)`
        : `Directive submission failed (${String((state as CommandErrorState).kind).replace(/_/g, ' ')})`;
      setLocalStreamEvents((prev) => [
        {
          id: `command-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestampIso: new Date().toISOString(),
          role: 'Founder Directive',
          author: 'Command Terminal',
          title: label,
          summary: state.detail,
          type: 'approval' as const,
        },
        ...prev,
      ]);
      loadOverview();
    },
    [loadOverview]
  );

  // Command Terminal → real orchestration: refresh the existing approvals
  // inbox immediately when the server reports approval-worthy work.
  const handleApprovalRequested = useCallback(() => {
    loadApprovals();
    loadOverview();
  }, [loadApprovals, loadOverview]);

  const handleRefreshAll = useCallback(() => {
    loadApprovals();
    loadOverview();
  }, [loadApprovals, loadOverview]);

  // -----------------------------------------------------------------------
  // Derived display state (pure derivations from the authoritative response)
  // -----------------------------------------------------------------------
  const vitalsTiles = overview ? deriveVitalsTiles(overview) : [];
  const workflowCounts = overview?.vitals?.workflows;
  const isStaleRead =
    overviewError?.kind === 'network_error' && overview !== null;

  const streamEvents = [...localStreamEvents, ...serverStreamEvents];

  const renderHeaderVitals = () => {
    if (overview) {
      const pending = overview.vitals?.approvals?.pending;
      const active = overview.vitals?.workflows?.active;
      return (
        <div className="hidden lg:flex items-center space-x-6 text-xs">
          <div className="flex items-center space-x-2" data-testid="cockpit-header-vital-pending-approvals">
            <span className="text-slate-500">Pending Approvals:</span>
            <span className={`font-semibold font-mono ${typeof pending === 'number' && pending > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {typeof pending === 'number' ? pending : '—'}
            </span>
          </div>
          <div className="flex items-center space-x-2" data-testid="cockpit-header-vital-active-workflows">
            <span className="text-slate-500">Active Workflows:</span>
            <span className="font-semibold text-indigo-400 font-mono">
              {typeof active === 'number' ? active : '—'}
            </span>
          </div>
          {isStaleRead && (
            <span className="flex items-center space-x-1 text-[10px] font-mono text-amber-400/90" title={overviewError?.detail}>
              <WifiOff className="w-3 h-3" />
              <span>STALE</span>
            </span>
          )}
        </div>
      );
    }
    return (
      <div className="hidden lg:flex items-center space-x-2 text-xs text-slate-500" data-testid="cockpit-vitals-unavailable">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Vitals {overviewLoading ? 'connecting…' : 'unavailable'}</span>
      </div>
    );
  };

  const renderVitalsError = () => {
    if (!overviewError || isStaleRead) return null;
    return (
      <div className="px-4 py-3 bg-rose-950/30 border-b border-rose-900/40 flex items-start gap-2.5">
        {overviewError.kind === 'unauthenticated' ? (
          <Shield className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        ) : (
          <Database className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        )}
        <div>
          <p className="text-xs font-semibold text-rose-300" data-testid="cockpit-vitals-error">
            Vital signs unavailable
          </p>
          <p className="text-[11px] text-rose-400/80 leading-relaxed">{overviewError.detail}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            No values are shown as zeros — the real state is unknown until the read succeeds.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0d1117] text-slate-100 font-sans select-none overflow-hidden">
      {/* 1. TOP EXECUTIVE HEADER */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-[#161b22]/90 backdrop-blur-md z-30">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-md">
              SJ
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                SamJuniors Cockpit
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-medium border border-emerald-500/30">
                  LIVE GOVERNANCE
                </span>
              </div>
              <div className="text-xs text-slate-400">Autonomous Company Operating System</div>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden md:block" />

          {/* Key Vitals Chips — derived from the authoritative overview read.
              The fabricated financial chips (runway / margin / burn from the
              static sample financial model in the demo-data module) were
              removed in Phase 3.3: no authoritative financial source exists. */}
          {renderHeaderVitals()}

          {/* Executive AI Fleet quick chips — roster CONFIGURATION (who
              exists), not runtime status. The fabricated "active" status dot
              was removed in Phase 3.3; real run activity is shown in the
              Vitals Wall fleet card. */}
          <div className="hidden xl:flex items-center space-x-2 pl-4 border-l border-slate-800">
            <span className="text-[10px] uppercase font-mono text-slate-500 mr-1">AI Fleet:</span>
            {(['coo', 'researcher', 'pm', 'finance'] as AgentRole[]).map((role) => {
              const prof = DETAILED_AI_EMPLOYEE_PROFILES[role];
              if (!prof) return null;
              const tone = PersonaStore.getPersona(role)?.tone || 'professional';
              return (
                <button
                  key={role}
                  id={`cockpit-officer-chip-${role}`}
                  onClick={() => onInspectEmployee ? onInspectEmployee(role) : onOpenApp?.('workforce')}
                  title={`${prof.name} (${prof.role}) • Tone: ${tone} • Click to inspect profile`}
                  className="flex items-center space-x-1.5 px-2 py-1 rounded-md bg-slate-800/80 hover:bg-indigo-950/60 border border-slate-700/60 hover:border-indigo-500/50 text-xs transition cursor-pointer"
                >
                  <span className="font-medium text-slate-300 hover:text-white">{prof.name.split(' ')[0]}</span>
                  <span className="text-[9px] font-mono text-indigo-400 capitalize">({prof.role.split(' ')[0]})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mode Switcher & Quick Actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefreshAll}
            title="Refresh Approvals & Authoritative Status"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 ${loadingApprovals || overviewLoading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          <button
            onClick={onSwitchToClassic}
            className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 rounded-lg transition"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
            <span>Classic Desktop</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN COCKPIT BODY */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 min-h-0 overflow-hidden bg-radial from-slate-900/40 to-[#0d1117]">
        {/* LEFT COLUMN: THE EXECUTIVE STREAM (5 COLS) */}
        <section className="lg:col-span-5 flex flex-col bg-[#161b22]/70 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-900/40">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">The Executive Stream</h2>
            </div>
            <span className="text-[11px] text-slate-500 font-mono" data-testid="cockpit-stream-count">
              {streamEvents.length} events
            </span>
          </div>

          {isStaleRead && (
            <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-900/40 text-[11px] text-amber-300/90 flex items-center gap-2" data-testid="cockpit-stream-stale">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              Live read unavailable — showing the last successful read. Underlying state may have changed.
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-slate-800/40" data-testid="cockpit-stream-list">
            {serverStreamEvents.length === 0 && localStreamEvents.length === 0 ? (
              overviewError && !isStaleRead ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                  <AlertTriangle className="w-8 h-8 text-rose-500/40 mb-2" />
                  <p className="text-xs font-medium text-slate-400">Stream reads unavailable</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{overviewError.detail}</p>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                  <Activity className="w-8 h-8 text-slate-600/60 mb-2" />
                  <p className="text-xs font-medium text-slate-400" data-testid="cockpit-stream-empty">
                    No persisted activity yet
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Real events appear here as work is created, approved, and executed.
                    Nothing is simulated.
                  </p>
                </div>
              )
            ) : (
              streamEvents.map((evt) => (
                <div key={evt.id} className="pt-3 first:pt-0">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <div className="flex items-center space-x-1.5 font-medium text-slate-300">
                      <span className={`w-1.5 h-1.5 rounded-full ${evt.type === 'approval' ? 'bg-amber-500' : evt.type === 'milestone' ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                      <span>{evt.author}</span>
                      <span className="text-slate-500 font-normal">({evt.role})</span>
                      {evt.source && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wider bg-slate-800/80 text-slate-400 border border-slate-700/60">
                          {STREAM_SOURCE_META[evt.source].label}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-500 font-mono text-[10px]" title={evt.timestampIso || evt.timestamp}>
                      {evt.timestamp}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200">{evt.title}</div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{evt.summary}</p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: APPROVALS INBOX & VITALS WALL (7 COLS) */}
        <section className="lg:col-span-7 flex flex-col gap-4 min-h-0">
          {/* APPROVALS INBOX (TOP HALF) */}
          <div className="flex-1 flex flex-col bg-[#161b22]/70 border border-slate-800 rounded-xl overflow-hidden shadow-lg min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-900/40">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Side-Effect Authorization Gate
                </h2>
                {approvals.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {approvals.length} PENDING
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500">Founder Decision Required</span>
            </div>

            {actionFeedback && (
              <div className="px-4 py-2 bg-indigo-950/40 border-b border-indigo-800/40 text-xs text-indigo-300 flex items-center justify-between">
                <span>{actionFeedback}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {approvalsError ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500" data-testid="cockpit-approvals-error">
                  <AlertTriangle className="w-8 h-8 text-rose-500/40 mb-2" />
                  <p className="text-xs font-medium text-slate-400">Approval status unavailable</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{approvalsError}</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Pending approvals are unknown — not shown as zero.
                  </p>
                </div>
              ) : loadingApprovals && approvals.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500" data-testid="cockpit-approvals-loading">
                  Reading pending approvals…
                </div>
              ) : approvals.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mb-2" />
                  <p className="text-xs font-medium text-slate-400">All Side-Effects Clear</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    No mutating external actions are awaiting Founder authorization.
                  </p>
                </div>
              ) : (
                approvals.map((appr) => (
                  <div
                    key={appr.id}
                    className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800/80 hover:border-slate-700/80 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-200">{appr.actionName}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {appr.classification}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Requested by <span className="text-slate-300 font-medium">{appr.employeeRole}</span> on target system{' '}
                          <code className="text-[10px] px-1 py-0.5 rounded bg-slate-800 text-slate-300">{appr.target?.targetSystem || 'internal'}</code>
                        </div>
                        {appr.workflowObjective && (
                          <div className="text-[10px] text-slate-500 mt-1 truncate" title={appr.workflowObjective}>
                            Directive: {appr.workflowObjective}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleDecision(appr.id, 'approve')}
                          disabled={decidingApprovalId === appr.id}
                          className="px-3 py-1 text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md shadow transition flex items-center space-x-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{decidingApprovalId === appr.id ? 'Executing…' : 'Approve'}</span>
                        </button>
                        <button
                          onClick={() => handleDecision(appr.id, 'reject')}
                          disabled={decidingApprovalId === appr.id}
                          className="px-3 py-1 text-xs font-semibold bg-rose-600/80 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md shadow transition flex items-center space-x-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>

                    {appr.target?.metadata && (
                      <div className="mt-2.5 p-2 bg-slate-950/60 rounded text-[10px] font-mono text-slate-400 overflow-x-auto max-h-20 border border-slate-800/60">
                        {JSON.stringify(appr.target.metadata, null, 2)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* COMPANY VITALS WALL (BOTTOM HALF) — Phase 3.3: every metric is
              derived from the authoritative overview read. The fabricated
              initiatives / fleet "Executing-Standby" / static financial
              surfaces were removed. */}
          <div className="flex-1 flex flex-col bg-[#161b22]/70 border border-slate-800 rounded-xl overflow-hidden shadow-lg min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-900/40">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Company Vitals Wall</h2>
              </div>
              <span className="text-[11px] text-slate-500 font-mono" data-testid="cockpit-vitals-source">
                {overview
                  ? `${describePersistenceMode(overview.persistenceMode)} · as of ${formatClockTime(overview.asOf ?? '')}`
                  : overviewLoading
                  ? 'reading authoritative state…'
                  : 'reads unavailable'}
              </span>
            </div>

            {renderVitalsError()}

            <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="cockpit-vitals-body">
              {/* Metric tiles — each backed by a documented, deterministic
                  server-side definition (see lib/server/cockpit/overview.ts). */}
              {vitalsTiles.length > 0 && (
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5" data-testid="cockpit-vitals-tiles">
                  {vitalsTiles.map((tile) => {
                    const Icon =
                      tile.key === 'pending-approvals'
                        ? Shield
                        : tile.key === 'scheduled-work'
                        ? CalendarClock
                        : tile.key === 'claims-pending'
                        ? FlaskConical
                        : Activity;
                    return (
                      <div
                        key={tile.key}
                        className={`p-2.5 rounded-lg border ${TONE_CLASS[tile.tone]} bg-slate-900/50`}
                      >
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide opacity-90">
                          <Icon className="w-3 h-3" />
                          <span className="truncate">{tile.label}</span>
                        </div>
                        <div className="text-lg font-bold font-mono leading-tight mt-1" data-testid={`cockpit-vital-${tile.key}`}>
                          {tile.value}
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5 truncate" title={tile.hint}>
                          {tile.hint}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Workflow Instances card (replaces the fabricated
                    "Active Initiatives" card) */}
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800/80">
                  <div className="text-xs font-bold text-slate-300 flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-indigo-400" /> Workflow Instances
                    </span>
                    <span className="text-[10px] font-mono text-slate-500" data-testid="cockpit-vital-workflow-total">
                      {workflowCounts ? `${workflowCounts.total ?? 0} total` : '—'}
                    </span>
                  </div>
                  {overview && workflowCounts && (overview.recentWorkflows?.length ?? 0) === 0 ? (
                    <div className="py-4 text-center text-[11px] text-slate-500" data-testid="cockpit-workflows-empty">
                      No workflow instances recorded yet.
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        Dispatch a directive below to create real work.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {overview && (
                        <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            {workflowCounts?.active ?? 0} active
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {workflowCounts?.awaitingApproval ?? 0} awaiting approval
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            {(workflowCounts?.blocked ?? 0) + (workflowCounts?.failed ?? 0)} blocked/failed
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {workflowCounts?.completed ?? 0} completed
                          </span>
                        </div>
                      )}
                      {(overview?.recentWorkflows ?? []).slice(0, 3).map((wf) => (
                        <div key={wf.instanceId} className="text-[11px]">
                          <div className="flex justify-between text-slate-300 mb-0.5 gap-2">
                            <span className="truncate" title={wf.objective}>{wf.objective}</span>
                            <span
                              className={`font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${TONE_CLASS[workflowStatusTone(wf.status)]}`}
                            >
                              {wf.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {formatRelativeTime(wf.updatedAt)} · {wf.instanceId.slice(0, 8)}
                          </div>
                        </div>
                      ))}
                      {!overview && (
                        <div className="text-[11px] text-slate-500 py-2" data-testid="cockpit-workflows-unavailable">
                          Workflow instance reads pending or unavailable.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* AI Fleet run-activity card (replaces the fabricated
                    "Executing / Standby" status card) */}
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800/80">
                  <div className="text-xs font-bold text-slate-300 flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-purple-400" /> AI Fleet — Verified Run Activity
                    </span>
                  </div>
                  {overview && (overview.fleet ?? []).every((entry) => entry.lastRun === null) ? (
                    <div className="py-4 text-center text-[11px] text-slate-500" data-testid="cockpit-fleet-empty">
                      No agent runs recorded yet.
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        Fleet status appears here only after real executions — never simulated.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {(overview?.fleet ?? []).map((entry) => (
                        <div key={entry.agentId} className="flex items-center justify-between text-[11px] text-slate-300 gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium truncate" title={entry.agentName}>{entry.agentName}</span>
                          </div>
                          {entry.lastRun ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-slate-500 font-mono truncate max-w-[120px]" title={entry.lastRun.taskTitle}>
                                {entry.lastRun.taskTitle}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${TONE_CLASS[agentRunStatusTone(entry.lastRun.status)]}`}
                              >
                                {entry.lastRun.status}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {formatRelativeTime(entry.lastRun.timestamp)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-600 shrink-0">no runs recorded</span>
                          )}
                        </div>
                      ))}
                      {!overview && (
                        <div className="text-[11px] text-slate-500 py-2" data-testid="cockpit-fleet-unavailable">
                          Fleet run reads pending or unavailable.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 3. BOTTOM COMMAND TERMINAL — Phase 3.2 vertical slice:
          founder command → /api/orchestrate → existing runtime → durable result →
          audit; the terminal displays authoritative server state only. */}
      <footer className="p-4 border-t border-slate-800 bg-[#161b22]/90 backdrop-blur-md z-30">
        <CommandTerminal
          onApprovalRequested={handleApprovalRequested}
          onOutcome={pushCommandOutcome}
        />
      </footer>
    </div>
  );
}
