/**
 * Sofia Greeting Service (M1.5 / G6.6).
 *
 * Generates an honest greeting grounded strictly in real company state:
 * - Empty state: plain greeting ("Good morning, Founder. Systems are calm, no approvals are pending...")
 * - Real state: factual summary of pending approvals, active runs, alerts, last session, and metrics
 * - Invariant: Zero state is invented. Every statement is verified against real stores.
 */

import { InMemoryApprovalStore } from '../authorization/approval-store';
import { AgentRunStore } from '../agents/run-store';
import { CompanyBrain } from '../brain/company-brain';
import type { MemoryScope } from './types';
export type { SofiaGreetingOptions, SofiaGreetingStateSummary, SofiaGreetingResult } from '@/types/greeting';
import type { SofiaGreetingOptions, SofiaGreetingResult } from '@/types/greeting';

export async function getSofiaGreeting(opts?: SofiaGreetingOptions): Promise<SofiaGreetingResult> {
  const t0 = performance.now();

  // 1. Time grounding (morning / afternoon / evening)
  let hour: number;
  if (typeof opts?.clientHour === 'number' && opts.clientHour >= 0 && opts.clientHour <= 23) {
    hour = opts.clientHour;
  } else if (opts?.clientTime) {
    const d = new Date(opts.clientTime);
    hour = !isNaN(d.getTime()) ? d.getHours() : new Date().getHours();
  } else {
    hour = new Date().getHours();
  }

  const timeOfDay: 'morning' | 'afternoon' | 'evening' =
    hour >= 4 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : 'evening';

  const now = opts?.clientTime ? new Date(opts.clientTime) : new Date();
  const formattedTime = !isNaN(now.getTime())
    ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  // 2. Last session grounding
  let lastSessionAt: string | null = opts?.lastSessionAt || null;
  let lastSessionText: string | null = null;
  if (lastSessionAt) {
    const sessionDate = new Date(lastSessionAt);
    if (!isNaN(sessionDate.getTime())) {
      const diffMs = Math.max(0, Date.now() - sessionDate.getTime());
      if (diffMs < 120000) {
        lastSessionText = 'a moment ago';
      } else if (diffMs < 3600000) {
        const mins = Math.floor(diffMs / 60000);
        lastSessionText = `${mins} minute${mins === 1 ? '' : 's'} ago`;
      } else if (diffMs < 86400000) {
        const hours = Math.floor(diffMs / 3600000);
        lastSessionText = `${hours} hour${hours === 1 ? '' : 's'} ago`;
      } else {
        const days = Math.floor(diffMs / 86400000);
        lastSessionText = `${days} day${days === 1 ? '' : 's'} ago`;
      }
    }
  }

  // 3. Pending approvals grounding
  const approvalStore = InMemoryApprovalStore.getInstance();
  const allApprovals = await approvalStore.list();
  const pendingApprovals = allApprovals.filter(
    (a) => (!a.decision || (a.decision as string) === 'pending') && (!a.expiresAt || new Date(a.expiresAt).getTime() > Date.now())
  );

  // 4. Active workstreams grounding
  const runStore = AgentRunStore.getInstance();
  const runs = await runStore.listRuns();
  const activeRuns = runs.filter((r) => r.status === 'running');

  // 5. Attention items / Alerts grounding
  let openAlerts: string[] = [];
  try {
    const atts = await CompanyBrain.getInstance().getAttentionItems();
    openAlerts = (atts || [])
      .filter((a) => a.status === 'pending')
      .map((a) => a.title);
  } catch {
    // fail soft
  }

  // 6. Financial metrics
  let finMetrics: { mrr?: number; runwayMonths?: number } | null = null;
  try {
    const fin = await CompanyBrain.getInstance().getFinancialMetrics();
    if (fin && !fin.isSimulatedModel && typeof fin.mrr === 'number' && fin.mrr > 0) {
      finMetrics = fin;
    }
  } catch {
    // fail soft
  }

  const pendingCount = pendingApprovals.length;
  const activeCount = activeRuns.length;
  const openAlertsCount = openAlerts.length;
  const mrr = finMetrics?.mrr ?? null;
  const runway = finMetrics?.runwayMonths ?? null;

  const hasRealState = pendingCount > 0 || activeCount > 0 || (mrr !== null && mrr > 0);

  const sources: string[] = [];
  if (pendingCount > 0) sources.push('InMemoryApprovalStore');
  if (activeCount > 0) sources.push('AgentRunStore');
  if (openAlertsCount > 0 || (mrr !== null && mrr > 0)) {
    sources.push('CompanyBrain');
    sources.push('CompanyStateStore');
  }

  let text: string;
  if (!hasRealState) {
    // Plain greeting from real state (honest - zero state invented)
    text = `[Sophia Vance • Chief Operating Officer]\nGood ${timeOfDay}, Founder. Systems are calm, no approvals are pending, and all monitors are standing by.`;
    if (lastSessionText) {
      text += ` (Last session was ${lastSessionText}.)`;
    }
  } else {
    // Factual greeting derived strictly from real state (no state invented)
    const parts: string[] = [];
    if (pendingCount > 0) {
      parts.push(`${pendingCount} approval${pendingCount === 1 ? '' : 's'} awaiting your review in the governance gate`);
    }
    if (activeCount > 0) {
      parts.push(`${activeCount} active multi-agent workstream${activeCount === 1 ? '' : 's'} in flight`);
    }
    if (openAlertsCount > 0) {
      parts.push(`${openAlertsCount} alert${openAlertsCount === 1 ? '' : 's'} in your attention queue`);
    }
    if (mrr !== null && mrr > 0) {
      parts.push(`MRR is currently $${mrr.toLocaleString()}`);
    }
    text = `[Sophia Vance • Chief Operating Officer]\nGood ${timeOfDay}, Founder. Real-time operational standing: ${parts.join(', ')}.`;
    if (lastSessionText) {
      text += ` (Last session was ${lastSessionText}.)`;
    }
  }

  const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

  return {
    text,
    hasRealState,
    stateSummary: {
      pendingApprovalsCount: pendingCount,
      activeWorkstreamsCount: activeCount,
      openAlertsCount,
      openAlerts,
      mrr,
      runwayMonths: runway,
      timeOfDay,
      formattedTime,
      lastSessionAt,
      lastSessionText,
    },
    latencyMs,
    liveAi: false,
    fallback: true,
    scopes: ['company_brain'],
    sources: sources.length > 0 ? sources : ['CompanyBrain', 'CompanyStateStore'],
  };
}
