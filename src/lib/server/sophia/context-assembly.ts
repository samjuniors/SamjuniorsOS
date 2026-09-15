import { CompanyContextProvider } from '../context/company-context';
import { AgentRunStore } from '../agents/run-store';
import { EpistemicClaimStore } from '../epistemic/claim-store';
import { InMemoryApprovalStore } from '../authorization/approval-store';
import { CompanyKnowledgeStore } from '../knowledge/knowledge-store';
import { CompanyMemoryStore } from '../memory/memory-store';
import { buildActivityProjection } from '../activity/projection';
import { SophiaAssembledContext, SophiaContextSlice } from './types';

/**
 * ============================================================================
 * SOPHIA CONTEXT ASSEMBLER (PHASE 2: GROUNDING & CONTEXT INTELLIGENCE)
 * ============================================================================
 * Assembles selective, authority-partitioned, budgeted context slices for Sophia.
 * 
 * INVARIANTS & PRECEDENCE:
 * 1. Epistemic Precedence:
 *    Authoritative Operational State / Canonical Facts > Company Knowledge > Historical Precedent
 * 2. Strict Partitioning:
 *    Canonical verified facts are strictly separated from unverified claims.
 * 3. Dynamic Knowledge & Precedent:
 *    Queries existing CompanyKnowledgeStore and CompanyMemoryStore; skips on trivial greetings.
 * 4. Recent Activity:
 *    Integrates authoritative projected company actions from ActivityProjection.
 * 5. Bounded Dynamic Payload:
 *    Enforces the ~1,800-token dynamic payload ceiling (excluding system prompt).
 * 6. Fail-Soft:
 *    Store outages emit [UNAVAILABLE / DEGRADED] slices and record telemetry; assembly does not crash.
 */

// Initial engineering budget ceilings per partition (characters ≈ tokens * 4)
const PARTITION_LIMITS = {
  operationalState: 1000,    // ~250 tokens
  activeWorkflows: 1200,     // ~300 tokens
  pendingGovernance: 1200,   // ~300 tokens
  canonicalFacts: 1000,      // ~250 tokens
  unverifiedClaims: 800,     // ~200 tokens
  companyKnowledge: 1400,    // ~350 tokens
  historicalPrecedent: 800,  // ~200 tokens
  recentActivity: 800,       // ~200 tokens
  dialogueHistory: 1000,     // ~250 tokens
};

function clamp(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 25).trimEnd()}\n[TRUNCATED TO BUDGET]`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function isCasualGreeting(message: string): boolean {
  const clean = message.trim().toLowerCase();
  return /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|how's it going|how are things|thanks|thank you)\b/i.test(clean) && clean.length < 50;
}

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
    const degradedStores: string[] = [];
    let retrievalHit = false;
    const tokenBreakdown: SophiaAssembledContext['tokenBreakdown'] = {};

    const isCasual = isCasualGreeting(opts.message);

    // =========================================================================
    // 1. Authoritative Operational Telemetry
    // =========================================================================
    try {
      const companyCtx = CompanyContextProvider.getMergedContext();
      const fin = companyCtx.financialModel;
      const initiatives = (companyCtx.initiatives || []).filter(
        (i) => i.status === 'in_progress' || i.status === 'active'
      );

      const mrrText = typeof fin?.mrr === 'number' ? `$${fin.mrr.toLocaleString()}` : 'Unavailable (Live ledger sync required)';
      const arrText = typeof fin?.arr === 'number' ? `$${fin.arr.toLocaleString()}` : 'Unavailable';
      const marginText = typeof fin?.grossMargin === 'number' ? `${fin.grossMargin}%` : 'Unavailable';
      const burnText = typeof fin?.burnRate === 'number' ? `$${fin.burnRate.toLocaleString()}` : 'Unavailable';
      const runwayText = typeof fin?.runwayMonths === 'number' ? `${fin.runwayMonths} months` : 'Unavailable';
      const modelStatus = fin?.isSimulatedModel ? ' [SANDBOX SIMULATION MODEL — Live ledger integration pending]' : '';

      const operationalLines = [
        `Operational Financial Standing${modelStatus}:`,
        `  - MRR: ${mrrText} | ARR: ${arrText}`,
        `  - Gross Margin Floor: ${marginText} | Monthly Burn: ${burnText} | Cash Runway: ${runwayText}`,
      ];

      if (initiatives.length > 0) {
        operationalLines.push('Active Strategic Initiatives:');
        initiatives.slice(0, 3).forEach((i) => {
          operationalLines.push(`  - [${i.id}] "${i.title}" (Objective: ${i.currentObjective})`);
        });
      } else {
        operationalLines.push('Active Strategic Initiatives: None currently registered in Company HQ.');
      }

      const content = clamp(operationalLines.join('\n'), PARTITION_LIMITS.operationalState);
      tokenBreakdown.operationalState = estimateTokens(content);

      slices.push({
        label: 'Company Operational State',
        authority: 'AUTHORITATIVE_OPERATIONAL_STATE',
        provenance: 'CompanyContextProvider / Database Financial Model',
        content,
      });
    } catch (err) {
      degradedStores.push('CompanyContextProvider');
      slices.push({
        label: 'Company Operational State',
        authority: 'AUTHORITATIVE_OPERATIONAL_STATE',
        provenance: 'CompanyContextProvider (Offline)',
        content: 'Authoritative operational telemetry is currently unavailable.',
        isStale: true,
      });
    }

    // =========================================================================
    // 2. Active Workflows & In-flight Runs
    // =========================================================================
    try {
      const runs = await AgentRunStore.getInstance().listRuns();
      const activeRuns = runs.filter((r) => r.status === 'running' || r.status === 'halted').slice(0, 3);
      const recentCompleted = runs.filter((r) => r.status === 'completed').slice(0, 2);

      const workflowLines: string[] = [];
      if (activeRuns.length > 0) {
        workflowLines.push('IN-FLIGHT RUNS:');
        activeRuns.forEach((r) => {
          workflowLines.push(`  - Run [${r.runId}] "${r.directive}" | Step: ${r.protocolStep} (${r.taskTitle}) | Owner: ${r.agentId} | Status: ${r.status}`);
        });
      }
      if (recentCompleted.length > 0) {
        workflowLines.push('RECENTLY COMPLETED RUNS:');
        recentCompleted.forEach((r) => {
          workflowLines.push(`  - Run [${r.runId}] "${r.directive}" | Completed in ${r.durationMs}ms`);
        });
      }
      if (workflowLines.length === 0) {
        workflowLines.push('No workflows currently in flight. Council is idle and available for directives.');
      }

      const content = clamp(workflowLines.join('\n'), PARTITION_LIMITS.activeWorkflows);
      tokenBreakdown.activeWorkflows = estimateTokens(content);

      slices.push({
        label: 'Active Workstream State',
        authority: 'ACTIVE_WORKFLOW_STATE',
        provenance: 'AgentRunStore',
        content,
      });
    } catch (err) {
      degradedStores.push('AgentRunStore');
      slices.push({
        label: 'Active Workstream State',
        authority: 'ACTIVE_WORKFLOW_STATE',
        provenance: 'AgentRunStore',
        content: 'Workstream state currently unavailable.',
        isStale: true,
      });
    }

    // =========================================================================
    // 3. Pending Governance Gates (Approvals)
    // =========================================================================
    try {
      const approvalStore = InMemoryApprovalStore.getInstance();
      const pending = await approvalStore.list({ decision: 'pending' });

      if (pending.length > 0) {
        const approvalLines = pending.slice(0, 3).map((a) =>
          `  - [${a.id}] Action: "${a.actionName}" | Class: ${a.classification} | Role: ${a.employeeRole} | Requested: ${a.requestedAt}`
        );
        const content = clamp(approvalLines.join('\n'), PARTITION_LIMITS.pendingGovernance);
        tokenBreakdown.pendingGovernance = estimateTokens(content);

        slices.push({
          label: 'Pending Founder Governance Gates',
          authority: 'PENDING_GOVERNANCE_STATE',
          provenance: 'InMemoryApprovalStore / SideEffectAuthorizationGate',
          content,
        });
      }
    } catch (err) {
      degradedStores.push('ApprovalStore');
    }

    // =========================================================================
    // 4. Epistemic Grounding: Strictly Partitioned Facts vs Unverified Claims
    // =========================================================================
    try {
      const claimStore = EpistemicClaimStore.getInstance();
      const facts = await claimStore.listActiveFacts();
      const allClaims = await claimStore.listClaims();

      // 4A. Canonical Facts (Promoted, verified truth)
      if (facts.length > 0) {
        const factLines = facts.slice(0, 3).map((f) =>
          `  - [FACT-${f.id}] "${f.statement}" (Subject: ${f.subject}, Verified: ${f.promotedAt})`
        );
        const content = clamp(factLines.join('\n'), PARTITION_LIMITS.canonicalFacts);
        tokenBreakdown.canonicalFacts = estimateTokens(content);

        slices.push({
          label: 'Canonical Verified Facts',
          authority: 'CANONICAL_FACT',
          provenance: 'EpistemicClaimStore / CanonicalFact',
          content,
        });
      }

      // 4B. Unverified / Pending Claims (Strictly hypotheses under review)
      const pendingClaims = allClaims.filter(
        (c) => c.verificationStatus === 'pending' || c.verificationStatus === 'under_review'
      );
      if (pendingClaims.length > 0) {
        const claimLines = [
          'EPISTEMIC WARNING: The following claims are UNVERIFIED hypotheses under active research. Do NOT treat or report them as established facts:',
          ...pendingClaims.slice(0, 3).map((c) =>
            `  - [CLAIM-${c.id}] "${c.statement}" (Status: [${c.verificationStatus.toUpperCase()}], Confidence: ${c.confidence})`
          ),
        ];
        const content = clamp(claimLines.join('\n'), PARTITION_LIMITS.unverifiedClaims);
        tokenBreakdown.unverifiedClaims = estimateTokens(content);

        slices.push({
          label: 'Unverified Empirical Claims',
          authority: 'UNVERIFIED_CLAIM',
          provenance: 'EpistemicClaimStore / EpistemicClaim',
          content,
        });
      }
    } catch (err) {
      degradedStores.push('EpistemicClaimStore');
    }

    // =========================================================================
    // 5. Dynamic Retrieval: Company Knowledge (SOPs, PRDs) & Historical Precedent
    // =========================================================================
    if (!isCasual) {
      // 5A. Company Knowledge Store (SOPs, Architecture, PRDs)
      try {
        const knowledgeStore = CompanyKnowledgeStore.getInstance();
        const knowledgeItems = await knowledgeStore.queryKnowledge({
          queryText: opts.message,
          limit: 2,
        });

        if (knowledgeItems.length > 0) {
          retrievalHit = true;
          const kLines = knowledgeItems.map((k) =>
            `[${k.documentId}] "${k.title}" (Category: ${k.category}):\n${k.summary || k.snippet || k.content}`
          );
          const content = clamp(kLines.join('\n\n'), PARTITION_LIMITS.companyKnowledge);
          tokenBreakdown.companyKnowledge = estimateTokens(content);

          slices.push({
            label: 'Company Knowledge & Standard Operating Procedures',
            authority: 'COMPANY_KNOWLEDGE',
            provenance: 'CompanyKnowledgeStore',
            content,
          });
        }
      } catch (err) {
        degradedStores.push('CompanyKnowledgeStore');
      }

      // 5B. Company Memory Store (Historical Precedent)
      try {
        const memoryStore = CompanyMemoryStore.getInstance();
        const memoryItems = await memoryStore.queryMemories({
          queryText: opts.message,
          limit: 2,
        });

        if (memoryItems.length > 0) {
          retrievalHit = true;
          const mLines = [
            'NOTE: Historical precedents reflect past outcomes and do NOT override current operational policy or facts:',
            ...memoryItems.map((m) =>
              `  - Precedent [${m.memoryId}]: Action "${m.approvedAction}" -> Outcome: "${m.executionOutcome}" (Evidence: ${(m.evidenceReferences || []).join(', ') || 'historical'})`
            ),
          ];
          const content = clamp(mLines.join('\n'), PARTITION_LIMITS.historicalPrecedent);
          tokenBreakdown.historicalPrecedent = estimateTokens(content);

          slices.push({
            label: 'Historical Company Precedent',
            authority: 'HISTORICAL_PRECEDENT',
            provenance: 'CompanyMemoryStore',
            content,
          });
        }
      } catch (err) {
        degradedStores.push('CompanyMemoryStore');
      }
    }

    // =========================================================================
    // 6. Recent Company Activity Feed (Deterministic Projection)
    // =========================================================================
    if (!isCasual) {
      try {
        const projection = await buildActivityProjection({ limit: 4 });
        if (projection.events.length > 0) {
          const actLines = projection.events.map((e) =>
            `  - [${e.at}] ${e.summary} (Actor: ${e.actor})`
          );
          const content = clamp(actLines.join('\n'), PARTITION_LIMITS.recentActivity);
          tokenBreakdown.recentActivity = estimateTokens(content);

          slices.push({
            label: 'Recent Company Activity History',
            authority: 'RECENT_ACTIVITY',
            provenance: 'ActivityProjection (Derived from authoritative control plane)',
            content,
          });
        }
      } catch (err) {
        degradedStores.push('ActivityProjection');
      }
    }

    // =========================================================================
    // 7. Recent Conversation Context (Untrusted Client-Supplied Input Data)
    // =========================================================================
    if (opts.history && opts.history.length > 0) {
      // Server-side sanitization: bound to last 8 turns and max 150 chars per turn
      const boundedTurns = opts.history.slice(-8).map((h) => {
        const sender = h.sender === 'user' || h.sender === 'founder' ? 'Founder' : 'Sophia';
        const cleanText = (h.text || '').replace(/[\r\n]+/g, ' ').slice(0, 150);
        return `${sender}: ${cleanText}`;
      });

      const rawContent = boundedTurns.join('\n');
      const content = clamp(rawContent, PARTITION_LIMITS.dialogueHistory);
      tokenBreakdown.dialogueHistory = estimateTokens(content);

      slices.push({
        label: 'Recent Conversation History',
        authority: 'CONVERSATIONAL_RECORD',
        provenance: 'Client Request Body (Untrusted dialogue context)',
        content,
      });
    }

    // =========================================================================
    // 8. Format all slices into authority-labeled prompt blocks
    // =========================================================================
    const formattedBlocks = slices.map((s) => {
      const staleNotice = s.isStale ? ' [STALE / DEGRADED]' : '';
      return `=== [${s.authority}] ${s.label.toUpperCase()}${staleNotice} ===\n(Source: ${s.provenance})\n${s.content}`;
    });

    const formattedContext = formattedBlocks.join('\n\n');
    const dynamicPayloadTokens = estimateTokens(formattedContext);

    return {
      slices,
      formattedContext,
      estimatedTokens: dynamicPayloadTokens,
      dynamicPayloadTokens,
      retrievalHit,
      degradedStores: degradedStores.length > 0 ? degradedStores : undefined,
      tokenBreakdown,
    };
  }
}
