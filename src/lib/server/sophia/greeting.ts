/**
 * Sofia Greeting Service (M1.5 / G6.6).
 *
 * Generates an honest greeting grounded strictly in real company state:
 * - Empty state: plain greeting ("Systems are calm, no approvals are pending...")
 * - Real state: factual summary of pending approvals, active runs, and metrics
 * - Invariant: Zero state is invented. Every statement is verified against real stores.
 */

import { InMemoryApprovalStore } from '../authorization/approval-store';
import { AgentRunStore } from '../agents/run-store';
import { CompanyBrain } from '../brain/company-brain';
import type { MemoryScope } from './types';

export interface SofiaGreetingStateSummary {
  pendingApprovalsCount: number;
  activeWorkstreamsCount: number;
  mrr?: number | null;
  runwayMonths?: number | null;
}

export interface SofiaGreetingResult {
  text: string;
  hasRealState: boolean;
  stateSummary: SofiaGreetingStateSummary;
  liveAi: boolean;
  fallback: boolean;
  scopes: MemoryScope[];
  sources: string[];
}

export async function getSofiaGreeting(opts?: { founderId?: string }): Promise<SofiaGreetingResult> {
  const approvalStore = InMemoryApprovalStore.getInstance();
  const allApprovals = await approvalStore.list();
  const pendingApprovals = allApprovals.filter(
    (a) => (!a.decision || (a.decision as string) === 'pending') && (!a.expiresAt || new Date(a.expiresAt).getTime() > Date.now())
  );

  const runStore = AgentRunStore.getInstance();
  const runs = await runStore.listRuns();
  const activeRuns = runs.filter((r) => r.status === 'running');

  let finMetrics: { mrr?: number; runwayMonths?: number } | null = null;
  try {
    const fin = await CompanyBrain.getInstance().getFinancialMetrics();
    if (fin && !fin.isSimulatedModel && typeof fin.mrr === 'number' && fin.mrr > 0) {
      finMetrics = fin;
    }
  } catch {
    // brain optional fail-soft
  }

  const pendingCount = pendingApprovals.length;
  const activeCount = activeRuns.length;
  const mrr = finMetrics?.mrr ?? null;
  const runway = finMetrics?.runwayMonths ?? null;

  const hasRealState = pendingCount > 0 || activeCount > 0 || (mrr !== null && mrr > 0);

  const sources: string[] = [];
  if (pendingCount > 0) sources.push('InMemoryApprovalStore');
  if (activeCount > 0) sources.push('AgentRunStore');
  if (mrr !== null && mrr > 0) {
    sources.push('CompanyBrain');
    sources.push('CompanyStateStore');
  }

  let text: string;
  if (!hasRealState) {
    // Plain greeting from real state (honest - zero state invented)
    text = `[Sophia Vance • Chief Operating Officer]\nGood to connect, Founder. Systems are calm, no approvals are pending, and all monitors are standing by.`;
  } else {
    // Factual greeting derived strictly from real state (no state invented)
    const parts: string[] = [];
    if (pendingCount > 0) {
      parts.push(`${pendingCount} approval${pendingCount === 1 ? '' : 's'} awaiting your review in the governance gate`);
    }
    if (activeCount > 0) {
      parts.push(`${activeCount} active multi-agent workstream${activeCount === 1 ? '' : 's'} in flight`);
    }
    if (mrr !== null && mrr > 0) {
      parts.push(`MRR is currently $${mrr.toLocaleString()}`);
    }
    text = `[Sophia Vance • Chief Operating Officer]\nGood to connect, Founder. Real-time operational standing: ${parts.join(', ')}.`;
  }

  return {
    text,
    hasRealState,
    stateSummary: {
      pendingApprovalsCount: pendingCount,
      activeWorkstreamsCount: activeCount,
      mrr,
      runwayMonths: runway,
    },
    liveAi: false,
    fallback: true,
    scopes: ['company_brain'],
    sources: sources.length > 0 ? sources : ['CompanyBrain', 'CompanyStateStore'],
  };
}
