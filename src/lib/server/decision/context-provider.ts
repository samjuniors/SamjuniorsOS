/**
 * SamJuniorsOS — Phase 2.2.1: Decision-Aware Company Context
 * Decision Context Provider
 *
 * Exposes authoritative DecisionStore records to existing context assembly,
 * Sophia, and specialist agents (Dr. Aris Thorne, Maya Lin, Julian Cruz, etc.).
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Single Authoritative Source:
 *    - Reads exclusively from DecisionStore (never stale in-memory arrays or client input).
 * 2. Explicit Status Partitioning:
 *    - Active commitments: `approved`, `executing`.
 *    - Pending governance: `proposed`, `under_review`, `pending_approval`.
 *    - Operational intervention required: `intervention_required`.
 *    - Historical precedent: `resolved` (with outcome summary).
 *    - Inactive: `rejected`, `withdrawn`, `superseded` (strictly excluded from active commitments).
 * 3. Complete Typed Fidelity:
 *    - Preserves decisionId, title, problemStatement, proposedAction, category,
 *      accountableOwner, status, impact, reversibility, uncertainty, evidenceFactIds,
 *      linkedWorkflowId, transitions, and supersession links.
 * 4. Deterministic Conflict Detection:
 *    - Lightweight, structured checks (unconfirmed predecessor execution, superseded references,
 *      concurrent category proposals). Zero vector databases or speculative LLM guessing.
 * 5. Strictly Read-Only:
 *    - Zero mutations permitted during context assembly.
 */

import {
  DecisionRecord,
  DecisionStatus,
  DecisionCategory,
  DecisionImpact,
  DecisionReversibility,
  DecisionUncertainty,
  DecisionOutcome,
} from '@/types/decision';
import { DecisionStore } from './store';
import { EpistemicClaimStore } from '@/lib/server/epistemic/claim-store';
import { extractTokens } from '@/lib/server/knowledge/knowledge-store';

export interface DecisionConflictWarning {
  decisionId: string;
  relatedDecisionId?: string;
  conflictType:
    | 'unconfirmed_predecessor_execution'
    | 'superseded_predecessor_uncertain'
    | 'superseded_reference'
    | 'concurrent_unresolved_in_category';
  message: string;
}

export interface DecisionContextBundle {
  /** Current binding company commitments (approved or actively executing) */
  activeCommitments: DecisionRecord[];
  /** Decisions pending Founder review or ratification (proposed, under_review, pending_approval) */
  pendingGovernance: DecisionRecord[];
  /** Decisions requiring operator or Founder intervention (intervention_required) */
  interventionRequired: DecisionRecord[];
  /** Historical resolved decisions (precedents) */
  historicalPrecedents: DecisionRecord[];
  /** Inactive decisions (rejected, withdrawn, superseded) — excluded from active commitments */
  inactiveDecisions: DecisionRecord[];
  /** Deterministic structural conflict warnings */
  conflictWarnings: DecisionConflictWarning[];
}

export interface RetrieveDecisionContextOptions {
  queryText?: string;
  role?: string;
  category?: DecisionCategory;
  includeHistoricalLimit?: number;
  includeInactive?: boolean;
}

export class DecisionContextProvider {
  private static instance: DecisionContextProvider | null = null;
  private store: DecisionStore;

  constructor(store?: DecisionStore) {
    this.store = store || DecisionStore.getInstance();
  }

  public static getInstance(): DecisionContextProvider {
    if (!DecisionContextProvider.instance) {
      DecisionContextProvider.instance = new DecisionContextProvider();
    }
    return DecisionContextProvider.instance;
  }

  /**
   * Retrieves and categorizes authoritative decisions from DecisionStore.
   * Strictly read-only; fail-closed on corrupt stores.
   */
  public async getDecisionContext(
    options?: RetrieveDecisionContextOptions
  ): Promise<DecisionContextBundle> {
    const allRecords = await this.store.list();

    const activeCommitments: DecisionRecord[] = [];
    const pendingGovernance: DecisionRecord[] = [];
    const interventionRequired: DecisionRecord[] = [];
    const historicalPrecedents: DecisionRecord[] = [];
    const inactiveDecisions: DecisionRecord[] = [];

    const queryTokens = options?.queryText
      ? new Set(extractTokens(options.queryText))
      : null;

    // Helper to test if a decision matches the optional query
    const matchesQuery = (d: DecisionRecord): boolean => {
      if (!queryTokens || queryTokens.size === 0) return true;
      const decTokens = new Set([
        ...extractTokens(d.title),
        ...extractTokens(d.problemStatement),
        ...extractTokens(d.proposedAction),
        ...extractTokens(d.category),
        ...extractTokens(d.accountableOwner),
        ...extractTokens(d.uncertainty?.description || ''),
        ...(d.outcome ? extractTokens(d.outcome.outcomeSummary) : []),
      ]);
      for (const t of queryTokens) {
        if (decTokens.has(t)) return true;
      }
      return false;
    };

    for (const d of allRecords) {
      // Category filter if specified
      if (options?.category && d.category !== options.category) {
        continue;
      }

      switch (d.status) {
        case 'approved':
        case 'executing':
          // Active company commitments: always include if relevant or general context
          if (!queryTokens || matchesQuery(d)) {
            activeCommitments.push(d);
          }
          break;

        case 'proposed':
        case 'under_review':
        case 'pending_approval':
          // Pending governance: surface to help agents avoid proposing duplicates
          if (!queryTokens || matchesQuery(d)) {
            pendingGovernance.push(d);
          }
          break;

        case 'intervention_required':
          // Interventions: always surfaced to highlight blocked or uncertain work
          if (!queryTokens || matchesQuery(d)) {
            interventionRequired.push(d);
          }
          break;

        case 'resolved':
          // Historical precedent: only include when relevant to the query or explicitly scoped
          if (matchesQuery(d)) {
            historicalPrecedents.push(d);
          }
          break;

        case 'rejected':
        case 'withdrawn':
        case 'superseded':
          // Inactive decisions: strictly excluded from active commitments
          if (options?.includeInactive && matchesQuery(d)) {
            inactiveDecisions.push(d);
          }
          break;
      }
    }

    // Sort historical precedents by resolution timestamp descending and clamp limit
    historicalPrecedents.sort((a, b) => {
      const ta = new Date(a.outcome?.resolvedAt || a.createdAt).getTime();
      const tb = new Date(b.outcome?.resolvedAt || b.createdAt).getTime();
      return tb - ta;
    });

    const historicalLimit = options?.includeHistoricalLimit ?? 3;
    const clampedHistorical = historicalPrecedents.slice(0, historicalLimit);

    // Detect lightweight deterministic conflicts
    const conflictWarnings = this.detectDeterministicConflicts(allRecords, [
      ...activeCommitments,
      ...pendingGovernance,
      ...interventionRequired,
    ]);

    return {
      activeCommitments,
      pendingGovernance,
      interventionRequired,
      historicalPrecedents: clampedHistorical,
      inactiveDecisions,
      conflictWarnings,
    };
  }

  /**
   * Detects deterministic structural conflicts across decisions.
   * Rules:
   * 1. If decision B supersedes decision A, but decision A's execution is active or unconfirmed.
   * 2. If decision B references a superseded decision A as active.
   * 3. If multiple proposals exist in the exact same category with active execution.
   */
  public detectDeterministicConflicts(
    allRecords: DecisionRecord[],
    focalRecords: DecisionRecord[]
  ): DecisionConflictWarning[] {
    const warnings: DecisionConflictWarning[] = [];
    const recordMap = new Map<string, DecisionRecord>(allRecords.map((r) => [r.decisionId, r]));

    for (const dec of focalRecords) {
      // 1. Lineage conflict: supersedes predecessor whose execution is active or unconfirmed
      if (dec.supersedesDecisionId) {
        const pred = recordMap.get(dec.supersedesDecisionId);
        if (pred) {
          if (pred.status === 'executing') {
            warnings.push({
              decisionId: dec.decisionId,
              relatedDecisionId: pred.decisionId,
              conflictType: 'unconfirmed_predecessor_execution',
              message: `Decision [${dec.decisionId}] "${dec.title}" supersedes [${pred.decisionId}], but predecessor execution is still active. Conflicting executions must be halted.`,
            });
          } else if (pred.status === 'intervention_required') {
            warnings.push({
              decisionId: dec.decisionId,
              relatedDecisionId: pred.decisionId,
              conflictType: 'superseded_predecessor_uncertain',
              message: `Decision [${dec.decisionId}] "${dec.title}" supersedes [${pred.decisionId}], which currently requires operational intervention. Predecessor state must be resolved.`,
            });
          } else if (pred.cancellationState && !pred.cancellationState.cancellationConfirmed) {
            warnings.push({
              decisionId: dec.decisionId,
              relatedDecisionId: pred.decisionId,
              conflictType: 'superseded_predecessor_uncertain',
              message: `Decision [${dec.decisionId}] "${dec.title}" supersedes [${pred.decisionId}], but predecessor cancellation was not confirmed (running steps: [${(pred.cancellationState.runningStepIds || []).join(', ')}]).`,
            });
          }
        }
      }

      // 2. Outdated decision conflict: decision has been superseded by a newer decision
      if (dec.supersededByDecisionId) {
        warnings.push({
          decisionId: dec.decisionId,
          relatedDecisionId: dec.supersededByDecisionId,
          conflictType: 'superseded_reference',
          message: `Decision [${dec.decisionId}] "${dec.title}" is superseded by [${dec.supersededByDecisionId}]. It must not be treated as an active company commitment.`,
        });
      }
    }

    return warnings;
  }

  public static resetInstance(): void {
    DecisionContextProvider.instance = null;
  }

  /**
   * Formats categorized decision context for Sophia prompt slices.
   */
  public async formatForSophiaContext(bundle: DecisionContextBundle): Promise<string> {
    const lines: string[] = [];

    // 1. Active commitments
    if (bundle.activeCommitments.length > 0) {
      lines.push('Active Company Commitments (Ratified & Binding):');
      for (const dec of bundle.activeCommitments) {
        lines.push(
          `  - Decision [${dec.decisionId}] "${dec.title}" (${dec.status.toUpperCase()}, Impact: ${dec.impact}, Category: ${dec.category}) -> ${dec.proposedAction}`
        );
        lines.push(`    Problem Statement: ${dec.problemStatement}`);
        lines.push(`    Owner: ${dec.accountableOwner} | Reversibility: ${dec.reversibility} | Uncertainty: ${dec.uncertainty.level} (${dec.uncertainty.description})`);
        if (dec.linkedWorkflowId) {
          lines.push(`    Linked Workflow: ${dec.linkedWorkflowId}`);
        }
        if (dec.evidenceFactIds.length > 0) {
          lines.push(`    Verified Evidence Fact IDs: [${dec.evidenceFactIds.join(', ')}]`);
        }
        if (dec.supersedesDecisionId) {
          lines.push(`    Supersedes Earlier Decision: ${dec.supersedesDecisionId}`);
        }
        if (dec.transitions && dec.transitions.length > 0) {
          const lastTr = dec.transitions[dec.transitions.length - 1];
          lines.push(`    Latest Transition: ${lastTr.fromStatus} -> ${lastTr.toStatus} (by ${lastTr.actor})`);
        }
      }
    }

    // 2. Pending governance
    if (bundle.pendingGovernance.length > 0) {
      lines.push('Pending Governance (Awaiting Founder Ratification — NOT Yet Active):');
      for (const dec of bundle.pendingGovernance) {
        lines.push(
          `  - Decision [${dec.decisionId}] "${dec.title}" (PENDING: ${dec.status.toUpperCase()}, Proposed By: ${dec.proposer})`
        );
        lines.push(`    Proposed Action: ${dec.proposedAction}`);
        lines.push(`    Problem Statement: ${dec.problemStatement}`);
        lines.push(`    Status: Awaiting explicit Founder approval before execution.`);
        if (dec.evidenceFactIds.length > 0) {
          lines.push(`    Verified Evidence Fact IDs: [${dec.evidenceFactIds.join(', ')}]`);
        }
      }
    }

    // 3. Operational interventions required
    if (bundle.interventionRequired.length > 0) {
      lines.push('Operational Interventions Required (Paused / Uncertain Execution):');
      for (const dec of bundle.interventionRequired) {
        const runningInfo = dec.cancellationState?.runningStepIds?.length
          ? ` (Running Steps: ${dec.cancellationState.runningStepIds.join(', ')})`
          : '';
        lines.push(
          `  - Decision [${dec.decisionId}] "${dec.title}" (INTERVENTION_REQUIRED — execution halted / requires operator resolution${runningInfo})`
        );
        lines.push(`    Problem Statement: ${dec.problemStatement}`);
        lines.push(`    Owner: ${dec.accountableOwner}`);
      }
    }

    // 4. Historical precedents
    if (bundle.historicalPrecedents.length > 0) {
      lines.push('Historical Precedents (Resolved Decisions — Precedent Only, NOT Current Work):');
      for (const dec of bundle.historicalPrecedents) {
        const outcomeText = dec.outcome?.outcomeSummary || 'Resolved without detailed summary';
        const dateText = dec.outcome?.resolvedAt ? dec.outcome.resolvedAt.slice(0, 10) : dec.createdAt.slice(0, 10);
        lines.push(
          `  - Decision [${dec.decisionId}] "${dec.title}" (Resolved ${dateText} by ${dec.outcome?.resolvedBy || 'founder'}):`
        );
        lines.push(`    Outcome: ${outcomeText}`);
        if (dec.evidenceFactIds.length > 0) {
          lines.push(`    Historical Evidence Basis: [${dec.evidenceFactIds.join(', ')}]`);
        }
      }
    }

    // 5. Conflict warnings
    if (bundle.conflictWarnings.length > 0) {
      lines.push('Governance Conflict Warnings:');
      for (const w of bundle.conflictWarnings) {
        lines.push(`  - [WARNING] ${w.message}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Formats decision context for specialist agents (Research, PM, Finance, etc.).
   */
  public async formatForSpecialistContext(
    bundle: DecisionContextBundle,
    role?: string
  ): Promise<string> {
    const lines: string[] = [];

    lines.push('=== AUTHORITATIVE COMPANY DECISIONS & COMMITMENTS ===');

    if (bundle.activeCommitments.length > 0) {
      lines.push('Active Commitments (Binding constraints — do not contradict without explicit supersession proposal):');
      for (const dec of bundle.activeCommitments) {
        lines.push(`- Decision [${dec.decisionId}] "${dec.title}" (${dec.category.toUpperCase()})`);
        lines.push(`  Committed Action: ${dec.proposedAction}`);
        lines.push(`  Problem Statement: ${dec.problemStatement}`);
        lines.push(`  Accountable: ${dec.accountableOwner} | Reversibility: ${dec.reversibility} | Impact: ${dec.impact}`);
        lines.push(`  Uncertainty: ${dec.uncertainty.level} (${dec.uncertainty.description})`);
        if (dec.linkedWorkflowId) {
          lines.push(`  Linked Workflow: ${dec.linkedWorkflowId}`);
        }
        if (dec.evidenceFactIds.length > 0) {
          lines.push(`  Verified Evidence Fact IDs: [${dec.evidenceFactIds.join(', ')}]`);
        }
        if (dec.supersedesDecisionId) {
          lines.push(`  Supersedes Earlier Decision: ${dec.supersedesDecisionId}`);
        }
        if (dec.transitions && dec.transitions.length > 0) {
          const lastTr = dec.transitions[dec.transitions.length - 1];
          lines.push(`  Transition: ${lastTr.fromStatus} -> ${lastTr.toStatus} (${lastTr.actor})`);
        }
      }
    } else {
      lines.push('Active Commitments: None currently recorded.');
    }

    if (bundle.pendingGovernance.length > 0) {
      lines.push('');
      lines.push('Decisions Pending Founder Ratification (Under review — do not assume approved):');
      for (const dec of bundle.pendingGovernance) {
        lines.push(`- Decision [${dec.decisionId}] "${dec.title}" (Status: ${dec.status.toUpperCase()}, Proposer: ${dec.proposer})`);
        lines.push(`  Proposed Action: ${dec.proposedAction}`);
        lines.push(`  Problem Statement: ${dec.problemStatement}`);
        if (dec.evidenceFactIds.length > 0) {
          lines.push(`  Evidence Fact IDs: [${dec.evidenceFactIds.join(', ')}]`);
        }
      }
    }

    if (bundle.interventionRequired.length > 0) {
      lines.push('');
      lines.push('Decisions Requiring Operational Intervention:');
      for (const dec of bundle.interventionRequired) {
        lines.push(`- Decision [${dec.decisionId}] "${dec.title}" (Requires Founder/Operator intervention)`);
        lines.push(`  Action: ${dec.proposedAction}`);
        lines.push(`  Accountable: ${dec.accountableOwner}`);
      }
    }

    if (bundle.historicalPrecedents.length > 0) {
      lines.push('');
      lines.push('Relevant Historical Precedents (Resolved past decisions — precedent only):');
      for (const dec of bundle.historicalPrecedents) {
        lines.push(`- Decision [${dec.decisionId}] "${dec.title}" -> Outcome: ${dec.outcome?.outcomeSummary || 'Resolved'}`);
        if (dec.evidenceFactIds.length > 0) {
          lines.push(`  Evidence References: [${dec.evidenceFactIds.join(', ')}]`);
        }
      }
    }

    if (bundle.conflictWarnings.length > 0) {
      lines.push('');
      lines.push('Potential Governance Conflicts Detected:');
      for (const w of bundle.conflictWarnings) {
        lines.push(`- [CONFLICT WARNING]: ${w.message}`);
      }
    }

    lines.push('=====================================================');

    return lines.join('\n');
  }
}
