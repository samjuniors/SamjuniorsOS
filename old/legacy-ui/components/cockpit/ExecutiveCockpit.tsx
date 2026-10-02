'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Activity,
  Zap,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Users,
  Briefcase,
  FileText,
  DollarSign,
  Maximize2,
  LayoutGrid,
  RefreshCw
} from 'lucide-react';
import { FounderApprovalRecord } from '@/types/authorization';
import { CompanyInitiative, AIAgent, FinanceMetric, AgentRole } from '@/types/os';
import { INITIAL_INITIATIVES, INITIAL_AGENTS, SAMPLE_FINANCIAL_MODEL } from '@/lib/os-data';
import { DETAILED_AI_EMPLOYEE_PROFILES } from '@/lib/employee-profiles';
import { PersonaStore } from '@/lib/persona-store';

interface ExecutiveCockpitProps {
  onSwitchToClassic: () => void;
  onOpenApp?: (appId: string) => void;
  onDispatchDirective?: (directive: string) => void;
  onInspectEmployee?: (agentId: AgentRole) => void;
}

interface StreamEvent {
  id: string;
  timestamp: string;
  role: string;
  author: string;
  title: string;
  summary: string;
  type: 'milestone' | 'approval' | 'telemetry' | 'advisor';
}

export function ExecutiveCockpit({
  onSwitchToClassic,
  onOpenApp,
  onDispatchDirective,
  onInspectEmployee,
}: ExecutiveCockpitProps) {
  // Directives & Inputs
  const [directiveInput, setDirectiveInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live Stream Feed
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([
    {
      id: 'stream-1',
      timestamp: '10:42 AM',
      role: 'Chief of Staff',
      author: 'Sophia Vance',
      title: 'Sprint Objective Decomposed',
      summary: 'Task graph compiled for Technical Strategy & PRD Specification. Dr. Thorne and Maya Lin initialized on autonomous branches.',
      type: 'milestone',
    },
    {
      id: 'stream-2',
      timestamp: '10:35 AM',
      role: 'VP Tech Strategy',
      author: 'Dr. Arthur Thorne',
      title: 'Architecture Audit Complete',
      summary: 'Deterministic invariant check passed: 4/4 test suites green. 0 regression failures detected across authorization gates.',
      type: 'telemetry',
    },
    {
      id: 'stream-3',
      timestamp: '10:15 AM',
      role: 'Head of Finance',
      author: 'Julian Cruz',
      title: 'Gross Margin Verification',
      summary: 'Validated unit economics for AI SaaS tiers. Contribution margin verified at 84.2%, well above the mandatory 80% governance floor.',
      type: 'milestone',
    },
  ]);

  // Approvals Inbox State
  const [approvals, setApprovals] = useState<FounderApprovalRecord[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(true);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Vitals State
  const [initiatives] = useState<CompanyInitiative[]>(INITIAL_INITIATIVES);
  const [workforce] = useState<AIAgent[]>(INITIAL_AGENTS);
  const [financialModel] = useState<FinanceMetric>(SAMPLE_FINANCIAL_MODEL);

  // Fetch pending approvals asynchronously
  const loadApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/workflow/approvals?status=pending');
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoadingApprovals(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch('/api/workflow/approvals?status=pending')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data?.approvals) {
          setApprovals(data.approvals);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoadingApprovals(false);
      });

    const interval = setInterval(() => {
      fetch('/api/workflow/approvals?status=pending')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (mounted && data?.approvals) {
            setApprovals(data.approvals);
          }
        })
        .catch(() => {});
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Handle Approval Decisions
  const handleDecision = async (approvalId: string, action: 'approve' | 'reject') => {
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
        setActionFeedback(`Action ${action === 'approve' ? 'Approved' : 'Rejected'} successfully.`);
        setTimeout(() => setActionFeedback(null), 4000);
        loadApprovals();

        // Push to executive stream
        setStreamEvents((prev) => [
          {
            id: `decision-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            role: 'Founder & CEO',
            author: 'Executive Authority',
            title: `Side-Effect Request ${action === 'approve' ? 'Authorized' : 'Rejected'}`,
            summary: `Approval ${approvalId} processed with decision: ${action.toUpperCase()}`,
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
    }
  };

  const submitDirective = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directiveInput.trim()) return;

    setIsSubmitting(true);
    const directive = directiveInput.trim();

    // Append to local stream
    setStreamEvents((prev) => [
      {
        id: `dir-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        role: 'Founder Directive',
        author: 'Executive Cockpit',
        title: 'Directive Issued to Workforce',
        summary: `"${directive}"`,
        type: 'advisor',
      },
      ...prev,
    ]);

    if (onDispatchDirective) {
      onDispatchDirective(directive);
    }

    setDirectiveInput('');
    setIsSubmitting(false);
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

          {/* Key Vitals Chips */}
          <div className="hidden lg:flex items-center space-x-6 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-500">Runway:</span>
              <span className="font-semibold text-emerald-400 font-mono">{financialModel.runwayMonths} Mo</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-slate-500">Gross Margin:</span>
              <span className="font-semibold text-indigo-400 font-mono">{financialModel.grossMargin}% Floor</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-slate-500">Monthly Burn:</span>
              <span className="font-semibold text-slate-300 font-mono">${financialModel.burnRate.toLocaleString()}</span>
            </div>
          </div>

          {/* Executive AI Fleet quick chips */}
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
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
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
            onClick={loadApprovals}
            title="Refresh Approvals & Status"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 ${loadingApprovals ? 'animate-spin text-indigo-400' : ''}`} />
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
            <span className="text-[11px] text-slate-500 font-mono">{streamEvents.length} updates</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-slate-800/40">
            {streamEvents.map((evt) => (
              <div key={evt.id} className="pt-3 first:pt-0">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <div className="flex items-center space-x-1.5 font-medium text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <span>{evt.author}</span>
                    <span className="text-slate-500 font-normal">({evt.role})</span>
                  </div>
                  <span className="text-slate-500 font-mono text-[10px]">{evt.timestamp}</span>
                </div>
                <div className="text-xs font-semibold text-slate-200">{evt.title}</div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{evt.summary}</p>
              </div>
            ))}
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
              {approvals.length === 0 ? (
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
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleDecision(appr.id, 'approve')}
                          className="px-3 py-1 text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-md shadow transition flex items-center space-x-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => handleDecision(appr.id, 'reject')}
                          className="px-3 py-1 text-xs font-semibold bg-rose-600/80 hover:bg-rose-500 text-white rounded-md shadow transition flex items-center space-x-1"
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

          {/* COMPANY VITALS WALL (BOTTOM HALF) */}
          <div className="flex-1 flex flex-col bg-[#161b22]/70 border border-slate-800 rounded-xl overflow-hidden shadow-lg min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-900/40">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Company Vitals Wall</h2>
              </div>
              <span className="text-[11px] text-slate-500">Ground Truth (PostgreSQL)</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Initiatives Card */}
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800/80">
                <div className="text-xs font-bold text-slate-300 flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-indigo-400" /> Active Initiatives
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">{initiatives.length} total</span>
                </div>
                <div className="space-y-2">
                  {initiatives.slice(0, 3).map((init) => (
                    <div key={init.id} className="text-[11px]">
                      <div className="flex justify-between text-slate-300 mb-0.5">
                        <span className="truncate">{init.title}</span>
                        <span className="font-mono text-[10px] text-indigo-400">{init.status}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {init.currentObjective}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Workforce Status Card */}
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800/80">
                <div className="text-xs font-bold text-slate-300 flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-purple-400" /> Executive Fleet
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">4 Active</span>
                </div>
                <div className="space-y-1.5">
                  {workforce.map((agent) => (
                    <div key={agent.id} className="flex items-center justify-between text-[11px] text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="font-medium">{agent.name}</span>
                        <span className="text-slate-500 text-[10px]">({agent.role})</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{agent.currentTask ? 'Executing' : 'Standby'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 3. BOTTOM DIRECTIVE TERMINAL */}
      <footer className="p-4 border-t border-slate-800 bg-[#161b22]/90 backdrop-blur-md z-30">
        <form onSubmit={submitDirective} className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={directiveInput}
              onChange={(e) => setDirectiveInput(e.target.value)}
              placeholder='Direct workforce: "Audit student drop-off rate and generate sprint PRD"...'
              className="w-full px-4 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 shadow-inner font-sans"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !directiveInput.trim()}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5"
          >
            <span>Dispatch</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </footer>
    </div>
  );
}
