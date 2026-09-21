import { FounderApprovalRecord } from '@/types/authorization';
import { AgentRunRecord } from '../agents/run-store';
import { EntityResolutionResult } from './types';

const GENERIC_APPROVAL_STOPWORDS = new Set([
  'i', 'approve', 'approved', 'ratify', 'ratified', 'authorize', 'authorized',
  'yes', 'please', 'it', 'that', 'this', 'the', 'decision', 'proposal', 'item',
  'request', 'proceed', 'go', 'ahead', 'confirm', 'sign', 'off', 'reject', 'rejected',
  'decline', 'declined', 'veto', 'vetoed', 'revision', 'revise', 'changes', 'with',
]);

const GENERIC_RUN_STOPWORDS = new Set([
  'pause', 'resume', 'redirect', 'halt', 'stop', 'kill', 'cancel', 'it', 'that',
  'this', 'the', 'run', 'task', 'directive', 'workflow', 'please', 'now',
]);

function extractTokens(text: string, stopWords: Set<string>): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));
}

/**
 * ============================================================================
 * SOPHIA CONSERVATIVE ENTITY RESOLVER (PHASE 2)
 * ============================================================================
 * Pure, deterministic set-based candidate matching against active authoritative
 * records.
 * 
 * INVARIANTS:
 * 1. Zero guessing. Never silently defaults to pendingApprovals[0] when ambiguous.
 * 2. Exactly 1 high-confidence match -> resolved.
 * 3. 0 matches -> unresolved.
 * 4. >=2 matches -> ambiguous with candidate list.
 * 5. Matched entity never confers authority; control plane remains authoritative.
 */
export class SophiaEntityResolver {
  /**
   * Deterministically resolves an approval candidate from message, history, and active approvals.
   */
  public static resolveApprovalCandidate(params: {
    message: string;
    history?: Array<{ sender: string; text: string }>;
    explicitId?: string;
    pendingApprovals: FounderApprovalRecord[];
  }): EntityResolutionResult<FounderApprovalRecord> {
    const { message, history, explicitId, pendingApprovals } = params;

    if (!pendingApprovals || pendingApprovals.length === 0) {
      return {
        status: 'unresolved',
        reason: 'No pending approvals currently exist in the governance gate.',
      };
    }

    // 1. Explicit ID lookup
    if (explicitId && explicitId !== 'none' && explicitId.trim().length > 0) {
      const match = pendingApprovals.find(
        (a) => a.id.toLowerCase() === explicitId.trim().toLowerCase()
      );
      if (match) {
        return {
          status: 'resolved',
          candidate: match,
          matchReason: `Explicit ID match: ${explicitId}`,
        };
      }
      return {
        status: 'unresolved',
        reason: `No pending approval exists with ID "${explicitId}".`,
      };
    }

    // 2. Scan message and recent 2 history turns for an explicit approval ID substring
    const dialogueTexts = [message];
    if (history && history.length > 0) {
      dialogueTexts.push(...history.slice(-2).map((h) => h.text));
    }
    const combinedDialogue = dialogueTexts.join(' ').toLowerCase();

    const idMatches = pendingApprovals.filter((a) =>
      combinedDialogue.includes(a.id.toLowerCase())
    );
    if (idMatches.length === 1) {
      return {
        status: 'resolved',
        candidate: idMatches[0],
        matchReason: `Explicit approval ID cited in dialogue: ${idMatches[0].id}`,
      };
    }
    if (idMatches.length > 1) {
      return {
        status: 'ambiguous',
        candidates: idMatches,
        reason: `Multiple approval IDs were referenced in recent dialogue.`,
      };
    }

    // 3. Keyword / attribute matching
    const queryTokens = extractTokens(dialogueTexts.join(' '), GENERIC_APPROVAL_STOPWORDS);

    if (queryTokens.length > 0) {
      const scored = pendingApprovals.map((approval) => {
        const approvalTokens = new Set([
          ...extractTokens(approval.actionName, GENERIC_APPROVAL_STOPWORDS),
          ...extractTokens(approval.employeeRole, GENERIC_APPROVAL_STOPWORDS),
          ...(approval.target?.targetSystem
            ? extractTokens(approval.target.targetSystem, GENERIC_APPROVAL_STOPWORDS)
            : []),
        ]);

        // Specific alias handling (e.g. "julian" -> finance, "maya" -> pm, "aris" -> researcher)
        if (queryTokens.includes('julian') && approval.employeeRole === 'finance') {
          approvalTokens.add('julian');
        }
        if (queryTokens.includes('maya') && approval.employeeRole === 'pm') {
          approvalTokens.add('maya');
        }
        if ((queryTokens.includes('aris') || queryTokens.includes('thorne')) && approval.employeeRole === 'researcher') {
          approvalTokens.add('aris');
          approvalTokens.add('thorne');
        }

        let hits = 0;
        for (const qt of queryTokens) {
          if (approvalTokens.has(qt)) hits++;
        }
        return { approval, hits };
      });

      const matching = scored.filter((s) => s.hits > 0).sort((a, b) => b.hits - a.hits);

      if (matching.length === 1) {
        return {
          status: 'resolved',
          candidate: matching[0].approval,
          matchReason: `Unambiguous candidate match for "${matching[0].approval.actionName}"`,
        };
      }

      if (matching.length > 1) {
        // If the top match strictly dominates other matches by hits
        if (matching[0].hits > matching[1].hits) {
          return {
            status: 'resolved',
            candidate: matching[0].approval,
            matchReason: `Dominant candidate match for "${matching[0].approval.actionName}"`,
          };
        }
        return {
          status: 'ambiguous',
          candidates: matching.map((m) => m.approval),
          reason: `Multiple pending approvals match the referenced action or role.`,
        };
      }
    }

    // 4. Pure generic pronoun ("approve it", "ratify this") without differentiating tokens
    if (pendingApprovals.length === 1) {
      return {
        status: 'resolved',
        candidate: pendingApprovals[0],
        matchReason: 'Single pending approval currently registered in governance gate',
      };
    }

    // Multiple pending approvals exist and no tokens differentiate them -> strictly ambiguous
    return {
      status: 'ambiguous',
      candidates: pendingApprovals,
      reason: `Multiple pending approvals (${pendingApprovals.length}) are active in the governance gate; unambiguous specification required.`,
    };
  }

  /**
   * Deterministically resolves an active run candidate from message, history, and active runs.
   */
  public static resolveRunCandidate(params: {
    message: string;
    history?: Array<{ sender: string; text: string }>;
    explicitRunId?: string;
    activeRuns: AgentRunRecord[];
  }): EntityResolutionResult<AgentRunRecord> {
    const { message, history, explicitRunId, activeRuns } = params;

    if (!activeRuns || activeRuns.length === 0) {
      return {
        status: 'unresolved',
        reason: 'No agent runs are currently active in the control plane.',
      };
    }

    // 1. Explicit run ID lookup
    if (explicitRunId && explicitRunId.trim().length > 0) {
      const match = activeRuns.find(
        (r) => r.runId.toLowerCase() === explicitRunId.trim().toLowerCase()
      );
      if (match) {
        return {
          status: 'resolved',
          candidate: match,
          matchReason: `Explicit runId match: ${explicitRunId}`,
        };
      }
      return {
        status: 'unresolved',
        reason: `No active run exists with runId "${explicitRunId}".`,
      };
    }

    // 2. Scan dialogue for runId substring
    const dialogueTexts = [message];
    if (history && history.length > 0) {
      dialogueTexts.push(...history.slice(-2).map((h) => h.text));
    }
    const combinedDialogue = dialogueTexts.join(' ').toLowerCase();

    const idMatches = activeRuns.filter((r) =>
      combinedDialogue.includes(r.runId.toLowerCase())
    );
    if (idMatches.length === 1) {
      return {
        status: 'resolved',
        candidate: idMatches[0],
        matchReason: `Explicit run ID cited in dialogue: ${idMatches[0].runId}`,
      };
    }
    if (idMatches.length > 1) {
      return {
        status: 'ambiguous',
        candidates: idMatches,
        reason: `Multiple active run IDs were referenced in recent dialogue.`,
      };
    }

    // 3. Keyword / role matching
    const queryTokens = extractTokens(dialogueTexts.join(' '), GENERIC_RUN_STOPWORDS);

    if (queryTokens.length > 0) {
      const scored = activeRuns.map((run) => {
        const runTokens = new Set([
          ...extractTokens(run.directive, GENERIC_RUN_STOPWORDS),
          ...extractTokens(run.taskTitle, GENERIC_RUN_STOPWORDS),
          ...extractTokens(run.agentId, GENERIC_RUN_STOPWORDS),
          ...extractTokens(run.agentName, GENERIC_RUN_STOPWORDS),
        ]);

        let hits = 0;
        for (const qt of queryTokens) {
          if (runTokens.has(qt)) hits++;
        }
        return { run, hits };
      });

      const matching = scored.filter((s) => s.hits > 0).sort((a, b) => b.hits - a.hits);

      if (matching.length === 1) {
        return {
          status: 'resolved',
          candidate: matching[0].run,
          matchReason: `Unambiguous active run match for "${matching[0].run.taskTitle}"`,
        };
      }

      if (matching.length > 1) {
        if (matching[0].hits > matching[1].hits) {
          return {
            status: 'resolved',
            candidate: matching[0].run,
            matchReason: `Dominant active run match for "${matching[0].run.taskTitle}"`,
          };
        }
        return {
          status: 'ambiguous',
          candidates: matching.map((m) => m.run),
          reason: `Multiple active runs match the referenced directive or agent.`,
        };
      }
    }

    // 4. Pure generic pronoun ("pause that run", "halt it")
    if (activeRuns.length === 1) {
      return {
        status: 'resolved',
        candidate: activeRuns[0],
        matchReason: 'Single active run currently in flight',
      };
    }

    return {
      status: 'ambiguous',
      candidates: activeRuns,
      reason: `Multiple active runs (${activeRuns.length}) are currently in flight; unambiguous specification required.`,
    };
  }
}
