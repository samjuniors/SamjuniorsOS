'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Sparkles,
  Sun,
  Moon,
  X,
  ChevronRight,
  ListTodo,
  Terminal,
  ExternalLink,
  Sliders,
  Clock,
  Lock,
  Compass,
} from 'lucide-react';
import { FounderApprovalRecord } from '@/types/authorization';
import { AgentRole } from '@/types/os';
import { DETAILED_AI_EMPLOYEE_PROFILES } from '@/lib/employee-profiles';
import { PersonaStore } from '@/lib/persona-store';
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
import { SamJuniorsCoreCanvas, SPECIALIST_NODES, SpecialistId } from './SamJuniorsCoreCanvas';
import { SophiaConversationalBar } from './SophiaConversationalBar';
import { WorkQueueDrawer } from './WorkQueueDrawer';

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

interface StreamEvent {
  id: string;
  timestamp: string;
  timestampIso?: string;
  role: string;
  author: string;
  title: string;
  summary: string;
  type: 'milestone' | 'approval' | 'telemetry' | 'advisor';
  source?: CockpitStreamEventView['source'];
}

type ContextSurface = 'idle' | 'approval' | 'work' | 'audit' | 'telemetry';

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
  // AUTHORITATIVE OVERVIEW (Phase 3.3 / 3.14)
  // Vitals Wall + Executive Stream derive purely from persisted state via
  // GET /api/cockpit/overview.
  // -----------------------------------------------------------------------
  const [overview, setOverview] = useState<CockpitOverviewView | null>(null);
  const [overviewError, setOverviewError] = useState<OverviewErrorState | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [serverStreamEvents, setServerStreamEvents] = useState<StreamEvent[]>([]);
  const [localStreamEvents, setLocalStreamEvents] = useState<StreamEvent[]>([]);

  // Approvals Inbox State
  const [approvals, setApprovals] = useState<EnrichedApprovalRecord[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(true);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [decidingApprovalId, setDecidingApprovalId] = useState<string | null>(null);

  // Progressive Disclosure UI States (Phase 3.12 / 3.14 Calm Core)
  const [activeContext, setActiveContext] = useState<ContextSurface>('idle');
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<SpecialistId | null>(null);
  const [currentTheme, setCurrentTheme] = useState<'solar' | 'luna'>('solar');
  const [noticeToast, setNoticeToast] = useState<string | null>(null);

  const sophiaInputRef = useRef<HTMLInputElement>(null);

  // Load theme preference on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('samjuniors_cockpit_theme');
      if (savedTheme === 'luna' || savedTheme === 'solar') {
        setCurrentTheme(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
      }
    }
  }, []);

  const toggleTheme = () => {
    const next = currentTheme === 'solar' ? 'luna' : 'solar';
    setCurrentTheme(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('samjuniors_cockpit_theme', next);
      document.documentElement.setAttribute('data-theme', next);
    }
    showToast(`Theme switched to ${next === 'solar' ? 'Dark Solar (Amber Core)' : 'Dark Luna (Cyan/Teal Core)'}`);
  };

  const showToast = (msg: string) => {
    setNoticeToast(msg);
    setTimeout(() => {
      setNoticeToast((prev) => (prev === msg ? null : prev));
    }, 7000);
  };

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

  // Keyboard shortcut listener: 'q' for queue, '/' for Sophia focus, 'Escape' to dismiss context
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      if (e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setIsQueueOpen((prev) => !prev);
      } else if (e.key === '/') {
        e.preventDefault();
        sophiaInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (isQueueOpen) setIsQueueOpen(false);
        else if (activeContext !== 'idle') setActiveContext('idle');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQueueOpen, activeContext]);

  // Handle Approval Decisions
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
          feedback = `Decision recorded, but workflow reconciliation FAILED: ${recon.error}`;
        } else if (recon?.reconciled) {
          feedback = `${action === 'approve' ? 'Approved' : 'Rejected'} — durable result: step '${recon.stepId}' is ${recon.stepStatus}, workflow ${recon.workflowStatus} (${recon.auditRecords} audit record${recon.auditRecords === 1 ? '' : 's'}).`;
        } else {
          feedback = `${action === 'approve' ? 'Approved' : 'Rejected'} — ${recon?.outcomeNote || 'Decision recorded.'}`;
        }
        setActionFeedback(feedback);
        showToast(feedback);
        setTimeout(() => setActionFeedback(null), 8000);
        loadApprovals();
        loadOverview();

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
        const msg = `Error: ${err.error || 'Failed to process decision'}`;
        setActionFeedback(msg);
        showToast(msg);
      }
    } catch (e: any) {
      const msg = `Network error: ${e.message}`;
      setActionFeedback(msg);
      showToast(msg);
    } finally {
      setDecidingApprovalId(null);
    }
  };

  const handleRefreshAll = useCallback(() => {
    loadApprovals();
    loadOverview();
    showToast('Authoritative persistence refreshed.');
  }, [loadApprovals, loadOverview]);

  // Derived display state
  const vitalsTiles = overview ? deriveVitalsTiles(overview) : [];
  const workflowCounts = overview?.vitals?.workflows;
  const isStaleRead = overviewError?.kind === 'network_error' && overview !== null;
  const streamEvents = [...localStreamEvents, ...serverStreamEvents];

  return (
    <div className="cockpit-shell">
      {/* 1. TOP AMBIENT HEADER */}
      <header className="cockpit-top-bar" aria-label="Executive Cockpit Header">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-600 to-amber-500 flex items-center justify-center font-bold text-white shadow-md text-sm tracking-wider">
            SJ
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider text-slate-100 uppercase">
                SamJuniors OS v1 Core
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-mono font-medium border border-emerald-500/30">
                POSTGRES AUTHORITATIVE
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              CONSTITUTIONAL EXECUTIVE SHELL · CALM CORE
            </div>
          </div>
        </div>

        {/* Center Eyebrow */}
        <div className="hidden lg:flex items-center gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">APPROVAL GATE:</span>
            <span
              className={`font-semibold font-mono ${
                approvals.length > 0 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {loadingApprovals ? '…' : `${approvals.length} PENDING`}
            </span>
          </div>
          <div className="h-3 w-px bg-slate-800" />
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">ACTIVE WORKFLOWS:</span>
            <span className="font-semibold text-indigo-400 font-mono">
              {workflowCounts ? workflowCounts.active : '0'}
            </span>
          </div>
          {isStaleRead && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400">
              <WifiOff className="w-3 h-3" /> STALE
            </span>
          )}
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2">
          {/* Quick Refresh */}
          <button
            onClick={handleRefreshAll}
            title="Refresh Authoritative Data"
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 rounded-lg transition"
            aria-label="Refresh data"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                loadingApprovals || overviewLoading ? 'animate-spin text-amber-400' : ''
              }`}
            />
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            title={`Switch Theme (Current: ${currentTheme === 'solar' ? 'Dark Solar' : 'Dark Luna'})`}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-slate-300 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 rounded-lg transition"
          >
            {currentTheme === 'solar' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">SOLAR</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">LUNA</span>
              </>
            )}
          </button>

          {/* Classic Desktop Toggle */}
          <button
            onClick={onSwitchToClassic}
            title="Switch to Classic Multi-Window Desktop"
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-200 bg-slate-800/90 hover:bg-slate-700 border border-slate-700 rounded-lg transition"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Classic Desktop</span>
          </button>
        </div>
      </header>

      {/* 2. NOTICE TOAST */}
      {noticeToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-900/95 border border-amber-500/40 shadow-2xl text-xs text-slate-200 flex items-center gap-3 backdrop-blur-md animate-in fade-in slide-in-from-top-2 max-w-2xl">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="flex-1 font-mono text-[11px] leading-relaxed">{noticeToast}</span>
          <button
            onClick={() => setNoticeToast(null)}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. CENTRAL WORKSPACE: CALM CORE 3D CANVAS */}
      <main className="cockpit-center-canvas">
        <SamJuniorsCoreCanvas
          selectedAgent={selectedAgent}
          theme={currentTheme}
          onSelectSpecialist={(role: SpecialistId) => {
            setSelectedAgent(role);
            if (role === 'systems' || role === 'advisor') {
              setActiveContext('audit');
            } else {
              if (onInspectEmployee) {
                onInspectEmployee(role as AgentRole);
              } else {
                onOpenApp?.('workforce');
              }
            }
          }}
        />

        {/* Edge Affordance: Left Side Workflow Trigger */}
        <div className="edge-trigger-left">
          <button
            onClick={() => setActiveContext(activeContext === 'work' ? 'idle' : 'work')}
            className={`edge-action-pill ${activeContext === 'work' ? 'active' : ''}`}
            title="Toggle Active Workflow Context"
          >
            <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
            <span>ACTIVE WORKFLOW</span>
          </button>
        </div>

        {/* Edge Affordance: Right Side Invariants Trigger */}
        <div className="edge-trigger-right">
          <button
            onClick={() => setActiveContext(activeContext === 'audit' ? 'idle' : 'audit')}
            className={`edge-action-pill ${activeContext === 'audit' ? 'active' : ''}`}
            title="Toggle Constitutional Invariants Audit"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>SYSTEM & INVARIANTS</span>
          </button>
        </div>

        {/* 4. CONTEXTUAL PROGRESSIVE DISCLOSURE SURFACES */}
        {activeContext === 'approval' && (
          <aside className="contextual-panel contextual-panel-left animate-in fade-in slide-in-from-left-4">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Founder Decision Gate
                </h3>
                {approvals.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {approvals.length} PENDING
                  </span>
                )}
              </div>
              <button
                onClick={() => setActiveContext('idle')}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                aria-label="Close Decision Gate"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {actionFeedback && (
              <div className="p-2.5 bg-indigo-950/40 border-b border-indigo-800/40 text-[11px] text-indigo-300 font-mono">
                {actionFeedback}
              </div>
            )}

            <div className="panel-body space-y-3">
              {approvalsError ? (
                <div className="p-4 text-center text-slate-400">
                  <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-rose-300">Approval read failed</p>
                  <p className="text-[11px] text-slate-500 mt-1">{approvalsError}</p>
                </div>
              ) : loadingApprovals && approvals.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 font-mono">
                  Reading authoritative approvals…
                </div>
              ) : approvals.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-200">All Side-Effects Clear</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Zero mutating external actions are awaiting Founder cryptographic authorization.
                  </p>
                </div>
              ) : (
                approvals.map((appr) => (
                  <div key={appr.id} className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-100">{appr.actionName}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
                            {appr.classification}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Agent: <span className="text-slate-200 font-medium">{appr.employeeRole}</span> · Target:{' '}
                          <code className="text-[10px] px-1 py-0.5 rounded bg-slate-800 text-slate-300">
                            {appr.target?.targetSystem || 'internal'}
                          </code>
                        </div>
                        {appr.workflowObjective && (
                          <div className="text-[10px] text-slate-500 mt-1 truncate" title={appr.workflowObjective}>
                            Directive: {appr.workflowObjective}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                      <button
                        onClick={() => handleDecision(appr.id, 'approve')}
                        disabled={decidingApprovalId === appr.id}
                        className="flex-1 px-3 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded shadow transition flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{decidingApprovalId === appr.id ? 'Authorizing…' : 'Approve'}</span>
                      </button>
                      <button
                        onClick={() => handleDecision(appr.id, 'reject')}
                        disabled={decidingApprovalId === appr.id}
                        className="flex-1 px-3 py-1 text-xs font-semibold bg-rose-600/80 hover:bg-rose-500 disabled:opacity-50 text-white rounded shadow transition flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {activeContext === 'work' && (
          <aside className="contextual-panel contextual-panel-left animate-in fade-in slide-in-from-left-4">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Active Workflow Surface
                </h3>
              </div>
              <button
                onClick={() => setActiveContext('idle')}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                aria-label="Close Workflow Surface"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="panel-body space-y-3">
              <div className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-xs">
                <div className="font-semibold text-indigo-300 flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5" /> Autonomous Orchestration State
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  PostgreSQL-confirmed workflows executing under Level 5 Constitutional Governance. Real runtime records only.
                </p>
              </div>

              {(overview?.recentWorkflows ?? []).length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-400">No Active Workflows</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Workflows instantiated via Sophia directives appear here with durable server state.
                  </p>
                </div>
              ) : (
                (overview?.recentWorkflows ?? []).map((wf) => (
                  <div key={wf.instanceId} className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200 line-clamp-2" title={wf.objective}>
                        {wf.objective}
                      </span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${TONE_CLASS[workflowStatusTone(wf.status)]}`}>
                        {wf.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between">
                      <span>ID: {wf.instanceId.slice(0, 8)}</span>
                      <span>{formatRelativeTime(wf.updatedAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {activeContext === 'audit' && (
          <aside className="contextual-panel contextual-panel-right animate-in fade-in slide-in-from-right-4">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Constitutional Invariants Audit
                </h3>
              </div>
              <button
                onClick={() => setActiveContext('idle')}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                aria-label="Close Invariants Audit"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="panel-body space-y-2.5">
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200 mb-1">
                  <span>INVARIANT 1: SIDE-EFFECT APPROVAL</span>
                  <span className="text-[10px] font-mono text-emerald-400">ENFORCED</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Mutating external system actions strictly require explicit Founder cryptographic sign-off.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200 mb-1">
                  <span>INVARIANT 2: EPISTEMIC INTEGRITY</span>
                  <span className="text-[10px] font-mono text-emerald-400">ENFORCED</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Claims require empirical source citations. Hallucinated financial or market metrics are rejected.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200 mb-1">
                  <span>INVARIANT 3: AUTHORITATIVE TRUTH</span>
                  <span className="text-[10px] font-mono text-emerald-400">ENFORCED</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  PostgreSQL durable records are the sole source of truth. Client optimistic fakes are banned.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200 mb-1">
                  <span>INVARIANT 4: BOUNDED AUTONOMY</span>
                  <span className="text-[10px] font-mono text-emerald-400">ENFORCED</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Execution terminates deterministically on budget or depth boundary limits.
                </p>
              </div>
            </div>
          </aside>
        )}

        {activeContext === 'telemetry' && (
          <aside className="contextual-panel contextual-panel-right animate-in fade-in slide-in-from-right-4">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Company Vitals Wall
                </h3>
              </div>
              <button
                onClick={() => setActiveContext('idle')}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                aria-label="Close Vitals Wall"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="panel-body space-y-3">
              <div className="text-[11px] text-slate-400 font-mono pb-1 border-b border-slate-800">
                Persistence: {describePersistenceMode(overview?.persistenceMode)}
              </div>

              {vitalsTiles.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
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
                        className={`p-2.5 rounded-lg border ${TONE_CLASS[tile.tone]} bg-slate-900/60`}
                      >
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide opacity-90">
                          <Icon className="w-3 h-3" />
                          <span className="truncate">{tile.label}</span>
                        </div>
                        <div className="text-base font-bold font-mono leading-tight mt-1">
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

              {/* AI Fleet Run Activity */}
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-purple-400" /> AI Fleet Activity
                  </span>
                </div>
                {(overview?.fleet ?? []).length === 0 ? (
                  <div className="text-[11px] text-slate-500 py-2 text-center">
                    Fleet run status reading…
                  </div>
                ) : (
                  (overview?.fleet ?? []).map((entry) => (
                    <div key={entry.agentId} className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>{entry.agentName}</span>
                      {entry.lastRun ? (
                        <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${TONE_CLASS[agentRunStatusTone(entry.lastRun.status)]}`}>
                          {entry.lastRun.status}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-600">idle</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        )}
      </main>

      {/* 5. SOPHIA CONVERSATIONAL BAR (Anchored above dock) */}
      <div className="cockpit-bar-anchor">
        <SophiaConversationalBar
          inputRef={sophiaInputRef}
          approvalPendingCount={approvals.length}
          onOpenQueue={() => setIsQueueOpen(true)}
          onOpenApproval={() => setActiveContext('approval')}
          onOpenAudit={() => setActiveContext('audit')}
          onOpenTelemetry={() => setActiveContext('telemetry')}
          onToggleRoster={() => setIsRosterOpen((prev) => !prev)}
          onNotice={showToast}
        />
      </div>

      {/* 6. SPECIALIST ROSTER MINI CARDS (Progressive Disclosure) */}
      {isRosterOpen && (
        <div className="cockpit-roster-tray animate-in fade-in slide-in-from-bottom-3">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px]">
            <span className="font-mono text-slate-400 font-semibold">
              SPECIALIST ROSTER · 2 ACTIVE (V1) · 4 GOVERNED STANDBY
            </span>
            <button
              onClick={() => setIsRosterOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {SPECIALIST_NODES.map((node) => (
              <button
                key={node.id}
                onClick={() => {
                  setSelectedAgent(node.id as AgentRole);
                  if (node.id !== 'systems' && onInspectEmployee) {
                    onInspectEmployee(node.id as AgentRole);
                  } else {
                    onOpenApp?.('workforce');
                  }
                }}
                className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-indigo-500/50 text-left transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                    <span>{node.fullName.split(' ')[0]}</span>
                    <span
                      className={`text-[8px] font-mono px-1 py-0.2 rounded ${
                        node.isV1Active
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                    >
                      {node.tier.split(' ')[0]}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{node.short}</div>
                </div>
                <div className="text-[9px] text-slate-500 truncate mt-2">{node.department}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 7. BOTTOM COCKPIT DOCK */}
      <footer className="cockpit-dock" aria-label="Command Center Dock">
        <button
          onClick={() => sophiaInputRef.current?.focus()}
          className="dock-item"
          title="Sophia Conversational Prompt (/)"
        >
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>Sophia</span>
        </button>

        <button
          onClick={() => setIsQueueOpen((prev) => !prev)}
          className={`dock-item ${isQueueOpen ? 'active' : ''}`}
          title="Work Queue DAG & Task Drawer (Q)"
        >
          <ListTodo className="w-4 h-4 text-amber-400" />
          <span>Work Queue (Q)</span>
        </button>

        <button
          onClick={() => setActiveContext(activeContext === 'telemetry' ? 'idle' : 'telemetry')}
          className={`dock-item ${activeContext === 'telemetry' ? 'active' : ''}`}
          title="Company Vitals Wall"
        >
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span>Telemetry</span>
        </button>

        <button
          onClick={() => setActiveContext(activeContext === 'audit' ? 'idle' : 'audit')}
          className={`dock-item ${activeContext === 'audit' ? 'active' : ''}`}
          title="Constitutional Invariants Audit"
        >
          <Shield className="w-4 h-4 text-indigo-400" />
          <span>Invariants</span>
        </button>

        <button
          onClick={toggleTheme}
          className="dock-item"
          title="Toggle Theme (Dark Solar / Dark Luna)"
        >
          {currentTheme === 'solar' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-cyan-400" />
          )}
          <span>Theme</span>
        </button>

        <button
          onClick={onSwitchToClassic}
          className="dock-item"
          title="Switch to Classic Multi-Window Desktop"
        >
          <LayoutGrid className="w-4 h-4 text-slate-400" />
          <span>Classic Desktop</span>
        </button>
      </footer>

      {/* 8. WORK QUEUE DRAWER */}
      <WorkQueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        onOpenApproval={() => {
          setIsQueueOpen(false);
          setActiveContext('approval');
        }}
        onSelectSpecialist={(role) => {
          setSelectedAgent(role);
          if (onInspectEmployee) onInspectEmployee(role);
          else onOpenApp?.('workforce');
        }}
        recentWorkflows={overview?.recentWorkflows}
        pendingApprovalsCount={approvals.length}
      />
    </div>
  );
}
