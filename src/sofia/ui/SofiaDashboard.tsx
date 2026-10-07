'use client';

/**
 * src/sofia/ui/SofiaDashboard.tsx — Phase 2: Canonical Read-Only Sofia Dashboard.
 *
 * Pure read-only presentation layer over SamJuniorsOS canonical read models:
 *   - NOW: Active Work (fetchRuns, fetchApprovals) & Routines (fetchSchedulerStatus)
 *   - SYSTEM: Quick Actions, System Health & Companion Edge status
 *   - COMMAND: Workforce Capabilities (fetchRoster)
 *   - MEMORY: Institutional Memory (fetchEpistemicBoard) & Company Activity (fetchActivity)
 *   - INSIGHTS: Derived execution metrics from real runs (fetchRuns)
 *
 * Strict Security Invariants:
 *   - Absolutely zero mutation or approval actions in this view.
 *   - Zero imports from prohibited SofiaUI task/memory/autonomy execution engines.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  Bot,
  Brain,
  CheckCircle2,
  Clock,
  Cpu,
  FileCheck,
  History,
  LayoutDashboard,
  MessageSquare,
  Mic,
  Network,
  Orbit,
  RefreshCw,
  RotateCw,
  Server,
  Settings,
  ShieldAlert,
  Sparkles,
  Terminal,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import type { SophiaStateName } from '../sophia/types';
import { companion } from '../lib/companion-client';
import {
  fetchRoster,
  fetchRuns,
  fetchApprovals,
  fetchSchedulerStatus,
  fetchEpistemicBoard,
  fetchActivity,
  type ServerAgentDef,
  type AgentRunRecord,
  type ApprovalRecord,
} from '@/os/lib/runtime';
import type { SchedulerStatusProjection } from '@/types/scheduling';
import type { EpistemicBoardDTO } from '@/types/epistemic';
import type { ActivityEventDTO } from '@/types/activity';

export type OSStatus = 'idle' | 'connecting' | 'live' | 'offline' | 'denied' | 'error' | string;

export interface SofiaDashboardProps {
  state: SophiaStateName;
  status: OSStatus;
  health: string;
  onMic: () => void;
  onOpenChat: () => void;
  onOpenTerminal: () => void;
  onOpenDiagnostics: () => void;
  onOpenSettings: () => void;
  onBackToSofia: () => void;
}

/* ------------------------------------------------------------------ Reusable Card UI */

function DashboardCard({
  icon,
  title,
  badge,
  children,
  wide = false,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section
      aria-label={title}
      className={`relative flex flex-col rounded-2xl border border-white/10 bg-[#070b16]/75 p-5 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-white/20 ${
        wide ? 'lg:col-span-2' : ''
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <span className="text-sky-400">{icon}</span>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">{title}</h2>
        </div>
        {badge}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

function SectionHeading({ title, count }: { title: string; count?: number | string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h3 className="text-[12px] font-medium uppercase tracking-[0.25em] text-sky-300/80">{title}</h3>
      {count !== undefined && (
        <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/60">
          {count}
        </span>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'ok' | 'warn' | 'error' | 'dim';
}) {
  const color =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'warn'
      ? 'text-amber-300'
      : tone === 'error'
      ? 'text-rose-300'
      : 'text-white/85';

  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
      <span className="text-white/45">{label}</span>
      <span className={`truncate font-mono font-medium ${color}`}>{value}</span>
    </div>
  );
}

const STATE_DOT: Record<string, string> = {
  idle: 'bg-sky-400',
  listening: 'bg-emerald-400 animate-pulse',
  thinking: 'bg-amber-400 animate-pulse',
  speaking: 'bg-cyan-400',
  wakeup: 'bg-indigo-400',
  focusing: 'bg-sky-300',
  ambient: 'bg-white/40',
};

/* ------------------------------------------------------------------ SofiaDashboard */

export function SofiaDashboard({
  state,
  status,
  health,
  onMic,
  onOpenChat,
  onOpenTerminal,
  onOpenDiagnostics,
  onOpenSettings,
  onBackToSofia,
}: SofiaDashboardProps) {
  // Canonical data states
  const [agents, setAgents] = useState<ServerAgentDef[]>([]);
  const [runs, setRuns] = useState<AgentRunRecord[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerStatusProjection | null>(null);
  const [epistemic, setEpistemic] = useState<EpistemicBoardDTO | null>(null);
  const [activities, setActivities] = useState<ActivityEventDTO[]>([]);
  const [companionStatus, setCompanionStatus] = useState({
    status: companion.status,
    connected: companion.connected,
    port: companion.info.port,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load all canonical read models concurrently
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErrorMsg(null);

    try {
      const [
        agentsRes,
        runsRes,
        approvalsRes,
        schedulerRes,
        epistemicRes,
        activityRes,
      ] = await Promise.allSettled([
        fetchRoster(),
        fetchRuns(30),
        fetchApprovals(),
        fetchSchedulerStatus(),
        fetchEpistemicBoard(),
        fetchActivity(12),
      ]);

      if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value);
      if (runsRes.status === 'fulfilled') setRuns(runsRes.value);
      if (approvalsRes.status === 'fulfilled') setApprovals(approvalsRes.value);
      if (schedulerRes.status === 'fulfilled' && schedulerRes.value.success) {
        setScheduler(schedulerRes.value.data);
      }
      if (epistemicRes.status === 'fulfilled') setEpistemic(epistemicRes.value);
      if (activityRes.status === 'fulfilled') setActivities(activityRes.value);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to refresh dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  // Subscribe to companion status changes
  useEffect(() => {
    const handleCompanion = () => {
      setCompanionStatus({
        status: companion.status,
        connected: companion.connected,
        port: companion.info.port,
      });
    };
    companion.addEventListener('status', handleCompanion);
    return () => companion.removeEventListener('status', handleCompanion);
  }, []);

  // Keyboard shortcut: Esc or V closes dashboard back to Sofia
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        onBackToSofia();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBackToSofia]);

  // Derived Execution Insights
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === 'completed').length;
  const failedRuns = runs.filter((r) => r.status === 'failed').length;
  const successRate = totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 100;
  const uniqueAgents = Array.from(new Set(runs.map((r) => r.agentName || r.agentId))).length;
  const avgDuration =
    totalRuns > 0
      ? Math.round(runs.reduce((acc, r) => acc + (r.durationMs || 0), 0) / totalRuns)
      : 0;

  const dotColor = STATE_DOT[state] ?? 'bg-white/40';

  return (
    <div
      role="region"
      aria-label="Sofia Command Dashboard"
      className="fixed inset-0 z-20 overflow-y-auto bg-[#04060f]/95 text-slate-100 backdrop-blur-xl"
    >
      <div className="mx-auto max-w-7xl space-y-9 px-5 py-8 pl-16 sm:px-10 sm:pl-20">
        {/* ---------------- Header ---------------- */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-sky-500/15 text-sky-300 shadow-[0_0_15px_rgba(56,189,248,0.25)]">
              <LayoutDashboard size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold tracking-wide text-white">Sofia Dashboard</h1>
                <span className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wider text-sky-200">
                  READ ONLY
                </span>
              </div>
              <p className="text-[11px] text-white/45">
                Authoritative company state & operational read model
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/80">
              <span className={`size-2 rounded-full ${dotColor}`} />
              <span className="capitalize">{state}</span>
            </span>

            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-white/70">
              voice:{status}
            </span>

            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-emerald-300/90">
              health:{health}
            </span>

            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              title="Refresh authoritative state"
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
            >
              <RotateCw size={13} className={refreshing ? 'animate-spin text-sky-300' : ''} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={onBackToSofia}
              title="Return to Sofia immersive view (Esc or V)"
              className="flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/15 px-3 py-1.5 text-[11px] font-medium text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.2)] transition hover:bg-sky-500/25 hover:text-white"
            >
              <Orbit size={13} />
              <span>Sofia View</span>
              <kbd className="ml-1 rounded border border-white/20 bg-black/30 px-1 py-0.2 text-[9px] text-white/50">
                Esc
              </kbd>
            </button>
          </div>
        </header>

        {errorMsg && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-[12px] text-amber-200"
          >
            <ShieldAlert size={16} className="shrink-0 text-amber-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ---------------- 1. NOW: Active Work & Routines ---------------- */}
        <section aria-labelledby="section-now">
          <SectionHeading title="Now · Live Operations" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Active Work Card */}
            <DashboardCard
              icon={<Cpu size={15} />}
              title="Active Work & Execution Trail"
              badge={
                approvals.length > 0 ? (
                  <span className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-medium text-amber-200">
                    <ShieldAlert size={11} />
                    {approvals.length} approval pending
                  </span>
                ) : (
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    Gates Clear
                  </span>
                )
              }
            >
              {loading && runs.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-[11px] text-white/40">
                  <RefreshCw size={14} className="mr-2 animate-spin text-sky-400" />
                  Loading execution stream…
                </div>
              ) : runs.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-white/40">
                  No active runs. All systems nominal.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {runs.slice(0, 5).map((run) => (
                      <div
                        key={run.runId}
                        className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5 transition hover:border-white/10"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] font-semibold text-sky-200">
                            {run.agentName || run.agentId}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${
                              run.status === 'completed'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : run.status === 'running'
                                ? 'bg-sky-500/20 text-sky-200 animate-pulse'
                                : 'bg-rose-500/15 text-rose-300'
                            }`}
                          >
                            {run.status}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-[11px] text-white/80" title={run.directive || run.taskTitle}>
                          {run.directive || run.taskTitle || 'Council step evaluation'}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/40">
                          <span className="font-mono">{run.protocolStep || 'protocol'}</span>
                          <span>{run.durationMs ? `${run.durationMs}ms` : 'live'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-right text-[10px] text-white/30">
                    Showing {Math.min(5, runs.length)} of {runs.length} runs · Read only
                  </p>
                </div>
              )}
            </DashboardCard>

            {/* Routines & Scheduler Status Card */}
            <DashboardCard
              icon={<Clock size={15} />}
              title="Routines & Automated Scheduler"
              badge={
                scheduler?.lastHeartbeat ? (
                  <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-mono text-sky-300">
                    eval {scheduler.lastHeartbeat.durationMs}ms
                  </span>
                ) : null
              }
            >
              <div className="space-y-3">
                <div className="divide-y divide-white/[0.06]">
                  <StatRow
                    label="Scheduler Heartbeat"
                    value={
                      scheduler?.lastHeartbeat
                        ? new Date(scheduler.lastHeartbeat.evaluatedAt).toLocaleTimeString()
                        : 'Active / Polling'
                    }
                    tone="ok"
                  />
                  <StatRow
                    label="Scheduled Items"
                    value={scheduler?.counts?.scheduled ?? 0}
                    tone={scheduler?.counts?.scheduled ? 'ok' : 'dim'}
                  />
                  <StatRow
                    label="Paused Automations"
                    value={scheduler?.counts?.paused ?? 0}
                  />
                  <StatRow
                    label="Completed Executions"
                    value={scheduler?.counts?.completed ?? 0}
                    tone="ok"
                  />
                  <StatRow
                    label="Awaiting Approval"
                    value={scheduler?.awaitingApproval ?? approvals.length}
                    tone={
                      (scheduler?.awaitingApproval ?? approvals.length) > 0 ? 'warn' : 'dim'
                    }
                  />
                  <StatRow
                    label="Next Due Item"
                    value={
                      scheduler?.nextDue
                        ? `${new Date(scheduler.nextDue.executeAt).toLocaleTimeString()} (${scheduler.nextDue.scheduleType})`
                        : 'None queued'
                    }
                    tone={scheduler?.nextDue?.isOverdue ? 'warn' : 'dim'}
                  />
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-black/20 p-2.5 text-[11px] text-white/50">
                  <p className="flex items-center gap-1.5 text-white/70">
                    <Zap size={12} className="text-amber-400" />
                    <span>Autonomous 24/7 Policy Layer</span>
                  </p>
                  <p className="mt-1 text-[10px] text-white/40 leading-relaxed">
                    Evaluations execute on schedule via Scheduler Engine. Mutations require Founder Approval Gate authorization.
                  </p>
                </div>
              </div>
            </DashboardCard>
          </div>
        </section>

        {/* ---------------- 2. SYSTEM: Quick Actions & Health ---------------- */}
        <section aria-labelledby="section-system">
          <SectionHeading title="System · Control & Health" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Quick Actions */}
            <DashboardCard icon={<Zap size={15} />} title="Quick Actions">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Talk', icon: <Mic size={16} />, onClick: onMic, desc: 'Voice session' },
                  { label: 'Chat', icon: <MessageSquare size={16} />, onClick: onOpenChat, desc: 'Text ingress' },
                  { label: 'Terminal', icon: <Terminal size={16} />, onClick: onOpenTerminal, desc: 'CLI console' },
                  { label: 'Diagnostics', icon: <Activity size={16} />, onClick: onOpenDiagnostics, desc: 'System checks' },
                  { label: 'Settings', icon: <Settings size={16} />, onClick: onOpenSettings, desc: 'Preferences' },
                  { label: 'Sofia', icon: <Orbit size={16} />, onClick: onBackToSofia, desc: 'Orb surface' },
                ].map((act) => (
                  <button
                    key={act.label}
                    type="button"
                    onClick={act.onClick}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white/70 transition-all duration-200 hover:scale-[1.02] hover:border-sky-400/40 hover:bg-white/[0.06] hover:text-white"
                  >
                    <span className="text-sky-300">{act.icon}</span>
                    <span className="text-[11px] font-medium">{act.label}</span>
                    <span className="text-[9px] text-white/30">{act.desc}</span>
                  </button>
                ))}
              </div>
            </DashboardCard>

            {/* System Health */}
            <DashboardCard icon={<Activity size={15} />} title="System Health">
              <div className="divide-y divide-white/[0.06]">
                <StatRow label="Core Sophia State" value={state} tone="ok" />
                <StatRow label="Voice Transport" value={status} tone={status === 'live' ? 'ok' : 'dim'} />
                <StatRow label="Health Report" value={health} tone={health === 'ok' ? 'ok' : 'warn'} />
                <StatRow label="Active Mouth" value="Gemini Aoede" tone="ok" />
                <StatRow label="Audio Ear Ingress" value="Bidi Streaming" tone="ok" />
                <StatRow label="Security Gate" value="Fail-Closed" tone="ok" />
              </div>
            </DashboardCard>

            {/* Companion Edge Link */}
            <DashboardCard icon={<Server size={15} />} title="Companion Edge Node">
              <div className="space-y-3">
                <div className="divide-y divide-white/[0.06]">
                  <StatRow
                    label="Edge Daemon"
                    value={companionStatus.connected ? 'Online' : 'Offline'}
                    tone={companionStatus.connected ? 'ok' : 'warn'}
                  />
                  <StatRow
                    label="WebSocket Port"
                    value={`:${companionStatus.port}`}
                    tone="dim"
                  />
                  <StatRow
                    label="Daemon Link"
                    value={companionStatus.status}
                    tone={companionStatus.status === 'connected' ? 'ok' : 'dim'}
                  />
                </div>
                <p className="rounded-lg border border-white/[0.05] bg-black/20 p-2 text-[10px] text-white/40">
                  {companionStatus.connected
                    ? 'Connected to local companion daemon for desktop awareness.'
                    : 'Edge companion daemon not currently active. System operates seamlessly in cloud-native mode.'}
                </p>
              </div>
            </DashboardCard>
          </div>
        </section>

        {/* ---------------- 3. COMMAND: Workforce Capabilities ---------------- */}
        <section aria-labelledby="section-command">
          <SectionHeading title="Command · Workforce Roster" count={agents.length} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#070b16]/75 p-4 shadow-xl backdrop-blur-xl transition hover:border-sky-400/30"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-[13px] font-semibold text-white">{agent.name}</h4>
                      <p className="text-[10px] font-mono uppercase tracking-wider text-sky-300/80">
                        {agent.role} · {agent.department}
                      </p>
                    </div>
                    <span className="grid size-7 place-items-center rounded-lg bg-sky-500/10 text-sky-400">
                      <Bot size={14} />
                    </span>
                  </div>

                  <div className="mt-3">
                    <p className="text-[9px] uppercase tracking-wider text-white/40">Responsibilities</p>
                    <ul className="mt-1 space-y-1">
                      {agent.responsibilities.slice(0, 3).map((resp, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-[11px] text-white/70">
                          <span className="mt-1 size-1 shrink-0 rounded-full bg-sky-400" />
                          <span className="line-clamp-2">{resp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 border-t border-white/[0.06] pt-2.5">
                  <p className="text-[9px] uppercase tracking-wider text-white/40">Capabilities</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(agent.capabilities || agent.skills || []).slice(0, 4).map((cap, idx) => (
                      <span
                        key={idx}
                        className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-mono text-white/60"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- 4. MEMORY & RECENT AUDIT ---------------- */}
        <section aria-labelledby="section-memory">
          <SectionHeading title="Memory & Epistemic Authority" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Epistemic Facts & Claims */}
            <DashboardCard
              icon={<Brain size={15} />}
              title="Governed Epistemic Board"
              badge={
                epistemic?.counts ? (
                  <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-mono text-sky-300">
                    {epistemic.counts.activeFacts} facts · {epistemic.counts.pending} pending
                  </span>
                ) : null
              }
            >
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/[0.06] bg-black/20 p-2.5 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-white/40">Active Facts</p>
                    <p className="mt-1 font-mono text-base font-semibold text-emerald-300">
                      {epistemic?.counts?.activeFacts ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-black/20 p-2.5 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-white/40">Verified Claims</p>
                    <p className="mt-1 font-mono text-base font-semibold text-sky-300">
                      {epistemic?.counts?.verified ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-black/20 p-2.5 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-white/40">Pending Review</p>
                    <p className="mt-1 font-mono text-base font-semibold text-amber-300">
                      {epistemic?.counts?.pending ?? 0}
                    </p>
                  </div>
                </div>

                <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {epistemic?.facts && epistemic.facts.length > 0 ? (
                    epistemic.facts.map((fact) => (
                      <div
                        key={fact.id}
                        className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-black/30 p-2 text-[11px]"
                      >
                        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-white/85">{fact.statement}</p>
                          <p className="text-[10px] text-white/40 font-mono">
                            {fact.category} · promoted by {fact.promotedBy}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-center text-[11px] text-white/40">
                      No promoted facts recorded yet.
                    </p>
                  )}
                </div>
              </div>
            </DashboardCard>

            {/* Chronological Audit Activity */}
            <DashboardCard icon={<History size={15} />} title="Chronological Activity Ledger">
              <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {activities.length > 0 ? (
                  activities.map((act) => (
                    <div
                      key={act.id}
                      className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-black/20 p-2.5 text-[11px]"
                    >
                      <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-sky-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-white/85">{act.summary}</p>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-white/40 font-mono">
                          <span>{act.category.replace(/_/g, ' ')}</span>
                          <span>{new Date(act.at).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-center text-[11px] text-white/40">
                    No recent activity records.
                  </p>
                )}
              </div>
            </DashboardCard>
          </div>
        </section>

        {/* ---------------- 5. INSIGHTS: Derived Execution Metrics ---------------- */}
        <section aria-labelledby="section-insights">
          <SectionHeading title="Insights · Operational Metrics" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-[#070b16]/75 p-4 shadow-xl backdrop-blur-xl">
              <div className="flex items-center gap-1.5 text-white/40">
                <FileCheck size={14} className="text-sky-300" />
                <span className="text-[10px] uppercase tracking-wider">Runs Executed</span>
              </div>
              <p className="mt-2 font-mono text-2xl font-light text-white">{totalRuns}</p>
              <p className="mt-0.5 text-[10px] text-white/40">Durable agent steps</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#070b16]/75 p-4 shadow-xl backdrop-blur-xl">
              <div className="flex items-center gap-1.5 text-white/40">
                <TrendingUp size={14} className="text-emerald-300" />
                <span className="text-[10px] uppercase tracking-wider">Success Rate</span>
              </div>
              <p className="mt-2 font-mono text-2xl font-light text-emerald-300">{successRate}%</p>
              <p className="mt-0.5 text-[10px] text-white/40">{completedRuns} completed / {failedRuns} failed</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#070b16]/75 p-4 shadow-xl backdrop-blur-xl">
              <div className="flex items-center gap-1.5 text-white/40">
                <Bot size={14} className="text-indigo-300" />
                <span className="text-[10px] uppercase tracking-wider">Active Agents</span>
              </div>
              <p className="mt-2 font-mono text-2xl font-light text-indigo-300">{uniqueAgents}</p>
              <p className="mt-0.5 text-[10px] text-white/40">Executive specialists</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#070b16]/75 p-4 shadow-xl backdrop-blur-xl">
              <div className="flex items-center gap-1.5 text-white/40">
                <Clock size={14} className="text-amber-300" />
                <span className="text-[10px] uppercase tracking-wider">Avg Latency</span>
              </div>
              <p className="mt-2 font-mono text-2xl font-light text-amber-300">{avgDuration}ms</p>
              <p className="mt-0.5 text-[10px] text-white/40">Per execution turn</p>
            </div>
          </div>
        </section>

        {/* Footer tip */}
        <p className="text-center font-mono text-[11px] text-white/30">
          Press <kbd className="rounded border border-white/20 bg-white/5 px-1 py-0.5">V</kbd> or{' '}
          <kbd className="rounded border border-white/20 bg-white/5 px-1 py-0.5">Esc</kbd> to return to Sophia.
        </p>
      </div>
    </div>
  );
}
