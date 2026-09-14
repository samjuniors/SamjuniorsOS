import { CompanyContextProvider } from '../context/company-context';
import { AgentRunStore } from '../agents/run-store';
import { EpistemicClaimStore } from '../epistemic/claim-store';
import { InMemoryApprovalStore } from '../authorization/approval-store';
import { SophiaAssembledContext, SophiaContextSlice } from './types';

/**
 * ============================================================================
 * SOPHIA CONTEXT ASSEMBLER (PHASE 1)
 * ============================================================================
 * Assembles selective, authority-labeled context slices for Sophia.
 * 
 * INVARIANT: Every slice carries an explicit authority classification:
 * - CONVERSATIONAL_RECORD: dialogue memory, not empirical reality.
 * - AUTHORITATIVE_OPERATIONAL_STATE: verified DB company telemetry.
 * - EPISTEMIC_FACT: claims vetted by EpistemicPipeline (authoritative per status).
 * - ACTIVE_WORKFLOW_STATE: authoritative background agent run states.
 * - PENDING_GOVERNANCE_STATE: authoritative pending founder decision gates.
 * - HISTORICAL_PRECEDENT: past decision records, not new empirical data.
 */
export class SophiaContextAssembler {
  /**
   * Assembles the contextual projection for the current turn.
   */
  public static async assemble(opts: {
    message: string;
    history?: Array<{ sender: string; text: string }>;
    includeFullTelemetry?: boolean;
  }): Promise<SophiaAssembledContext> {
    const slices: SophiaContextSlice[] = [];

    // 1. Authoritative Operational Telemetry
    try {
      const companyCtx = CompanyContextProvider.getMergedContext();
      const fin = companyCtx.financialModel;
      const initiatives = (companyCtx.initiatives || []).filter(i => i.status === 'in_progress' || i.status === 'active');

      const mrrText = typeof fin?.mrr === 'number' ? `$${fin.mrr.toLocaleString()}` : 'Unavailable (unconnected)';
      const arrText = typeof fin?.arr === 'number' ? `$${fin.arr.toLocaleString()}` : 'Unavailable (unconnected)';
      const marginText = typeof fin?.grossMargin === 'number' ? `${fin.grossMargin}%` : 'Unavailable';
      const burnText = typeof fin?.burnRate === 'number' ? `$${fin.burnRate.toLocaleString()}` : 'Unavailable (unconnected)';
      const runwayText = typeof fin?.runwayMonths === 'number' ? `${fin.runwayMonths} months` : 'Unavailable';
      const modelStatus = fin?.isSimulatedModel ? ' [SANDBOX SIMULATION MODEL — Live ledger integration pending]' : '';

      const operationalLines = [
        `Operational Financial Standing${modelStatus}:`,
        `  - MRR: ${mrrText} | ARR: ${arrText}`,
        `  - Gross Margin Floor: ${marginText} | Monthly Burn: ${burnText} | Cash Runway: ${runwayText}`,
      ];

      if (initiatives.length > 0) {
        operationalLines.push('Active Strategic Initiatives:');
        initiatives.slice(0, 3).forEach(i => {
          operationalLines.push(`  - [${i.id}] "${i.title}" (Objective: ${i.currentObjective})`);
        });
      } else {
        operationalLines.push('Active Strategic Initiatives: None currently registered in Company HQ.');
      }

      slices.push({
        label: 'Company Operational State',
        authority: 'AUTHORITATIVE_OPERATIONAL_STATE',
        provenance: 'CompanyContextProvider / Database Financial Model',
        content: operationalLines.join('\n'),
      });
    } catch (err) {
      slices.push({
        label: 'Company Operational State',
        authority: 'AUTHORITATIVE_OPERATIONAL_STATE',
        provenance: 'CompanyContextProvider (Offline)',
        content: 'Authoritative operational telemetry is currently unavailable.',
        isStale: true,
      });
    }

    // 2. Active Workflows & In-flight Runs
    try {
      const runs = await AgentRunStore.getInstance().listRuns();
      const activeRuns = runs.filter(r => r.status === 'running' || r.status === 'halted').slice(0, 3);
      const recentCompleted = runs.filter(r => r.status === 'completed').slice(0, 2);

      const workflowLines: string[] = [];
      if (activeRuns.length > 0) {
        workflowLines.push('IN-FLIGHT RUNS:');
        activeRuns.forEach(r => {
          workflowLines.push(`  - Run [${r.runId}] "${r.directive}" | Step: ${r.protocolStep} (${r.taskTitle}) | Owner: ${r.agentId} | Status: ${r.status}`);
        });
      }
      if (recentCompleted.length > 0) {
        workflowLines.push('RECENTLY COMPLETED RUNS:');
        recentCompleted.forEach(r => {
          workflowLines.push(`  - Run [${r.runId}] "${r.directive}" | Completed in ${r.durationMs}ms`);
        });
      }
      if (workflowLines.length === 0) {
        workflowLines.push('No workflows currently in flight. Council is idle and available for directives.');
      }

      slices.push({
        label: 'Active Workstream State',
        authority: 'ACTIVE_WORKFLOW_STATE',
        provenance: 'AgentRunStore',
        content: workflowLines.join('\n'),
      });
    } catch (err) {
      slices.push({
        label: 'Active Workstream State',
        authority: 'ACTIVE_WORKFLOW_STATE',
        provenance: 'AgentRunStore',
        content: 'Workstream state currently unavailable.',
        isStale: true,
      });
    }

    // 3. Epistemic Facts & Claims
    try {
      const claimStore = EpistemicClaimStore.getInstance();
      const claims = await claimStore.listClaims();
      const facts = await claimStore.listActiveFacts();

      const epistemicLines: string[] = [];
      if (facts.length > 0) {
        epistemicLines.push('PROMOTED CANONICAL FACTS:');
        facts.slice(0, 3).forEach(f => {
          epistemicLines.push(`  - [FACT-${f.id}] "${f.statement}" (Subject: ${f.subject}, Promoted: ${f.promotedAt})`);
        });
      }

      if (claims.length > 0) {
        epistemicLines.push('RECENT VERIFIED / PENDING CLAIMS:');
        claims.slice(0, 4).forEach(c => {
          epistemicLines.push(`  - [CLAIM-${c.id}] "${c.statement}" (Status: ${c.verificationStatus.toUpperCase()}, Confidence: ${c.confidence})`);
        });
      }

      if (epistemicLines.length > 0) {
        slices.push({
          label: 'Epistemic Claims & Canonical Facts',
          authority: 'EPISTEMIC_FACT',
          provenance: 'EpistemicClaimStore',
          content: epistemicLines.join('\n'),
        });
      }
    } catch (err) {
      // Non-fatal if epistemic claims are unconfigured in test environment
    }

    // 4. Pending Governance Gates (Approvals)
    try {
      const approvalStore = InMemoryApprovalStore.getInstance();
      const pending = await approvalStore.list({ decision: 'pending' });

      if (pending.length > 0) {
        const approvalLines = pending.slice(0, 3).map(a => 
          `  - [${a.id}] Action: "${a.actionName}" | Class: ${a.classification} | Role: ${a.employeeRole} | Requested: ${a.requestedAt}`
        );
        slices.push({
          label: 'Pending Founder Governance Gates',
          authority: 'PENDING_GOVERNANCE_STATE',
          provenance: 'InMemoryApprovalStore / SideEffectAuthorizationGate',
          content: approvalLines.join('\n'),
        });
      }
    } catch (err) {
      // Non-fatal
    }

    // 5. Recent Conversation Context (Conversational Record)
    if (opts.history && opts.history.length > 0) {
      const recentTurns = opts.history.slice(-10).map(h => 
        `${h.sender === 'user' || h.sender === 'founder' ? 'Founder' : 'Sophia'}: ${h.text}`
      );
      slices.push({
        label: 'Recent Conversation History',
        authority: 'CONVERSATIONAL_RECORD',
        provenance: 'Session Dialogue Thread',
        content: recentTurns.join('\n'),
      });
    }

    // Format all slices into an authority-labeled prompt block
    const formattedBlocks = slices.map(s => {
      const staleNotice = s.isStale ? ' [STALE / DEGRADED]' : '';
      return `=== [${s.authority}] ${s.label.toUpperCase()}${staleNotice} ===\n(Source: ${s.provenance})\n${s.content}`;
    });

    const formattedContext = formattedBlocks.join('\n\n');
    const estimatedTokens = Math.ceil(formattedContext.length / 4);

    return {
      slices,
      formattedContext,
      estimatedTokens,
    };
  }
}
