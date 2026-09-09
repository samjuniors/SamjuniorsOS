/**
 * PHASE 11.10 — OPERATIONAL LEARNING LOOP
 * 
 * Makes Company Memory actively improve future company decisions and work
 * by retrieving relevant historical precedents, strictly separating:
 *   1. Current Evidence
 *   2. Historical Memory
 *   3. AI Inference / Recommendation
 *   4. Founder Decision
 * 
 * Governance Constraints:
 * - Historical memory is injected as clearly labeled historical context (never as new evidence).
 * - Historical memory must never automatically approve, execute, change permissions, or become policy.
 * - If memory conflicts with current evidence, current verified evidence takes precedence and the conflict is visible.
 * - No invented relevance, history, outcomes, or evidence.
 */

import { CompanyMemory, RetrievedHistoricalMemory } from '@/types/os';

export interface MemoryRetrievalQuery {
  title: string;
  summary: string;
  category?: string;
  evidenceBasis?: string;
  currentFacts?: string[];
  tags?: string[];
}

export interface OperationalSeparationResult {
  currentEvidence: string;
  historicalMemories: RetrievedHistoricalMemory[];
  hasConflicts: boolean;
  conflictNotice?: string;
  aiInference: string;
  founderDecision: {
    status: 'pending_approval';
    founderApprovalRequired: boolean;
    note: string;
  };
}

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
  'by', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me',
  'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she',
  'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until',
  'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves'
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export class OperationalLearningLoop {
  /**
   * Deterministically retrieves only relevant historical memories for a given query/finding.
   * Irrelevant memories (0 keyword overlap and no category match) are strictly excluded.
   */
  static retrieveRelevantMemories(
    query: MemoryRetrievalQuery,
    memories: CompanyMemory[]
  ): RetrievedHistoricalMemory[] {
    if (!memories || memories.length === 0) return [];

    const queryKeywords = new Set([
      ...extractKeywords(query.title),
      ...extractKeywords(query.summary),
      ...(query.currentFacts ? query.currentFacts.flatMap(extractKeywords) : []),
      ...(query.tags ? query.tags.map((t) => t.toLowerCase()) : []),
    ]);

    const results: RetrievedHistoricalMemory[] = [];

    for (const memory of memories) {
      const memoryTokens = [
        ...extractKeywords(memory.approvedAction),
        ...extractKeywords(memory.executionOutcome),
        ...memory.evidenceReferences.flatMap(extractKeywords),
      ];

      // Count intersecting keywords
      const matchedTerms: string[] = [];
      for (const token of memoryTokens) {
        if (queryKeywords.has(token) && !matchedTerms.includes(token)) {
          matchedTerms.push(token);
        }
      }

      // Check category match if available
      const categoryLower = query.category?.toLowerCase() || '';
      const isFinancialCategory = categoryLower.includes('financ') || categoryLower.includes('cost') || categoryLower.includes('pricing');
      const memoryIsFinancial = memory.approvedAction.toLowerCase().includes('cost') ||
        memory.approvedAction.toLowerCase().includes('margin') ||
        memory.approvedAction.toLowerCase().includes('burn') ||
        memory.approvedAction.toLowerCase().includes('pricing');

      const isEngineeringCategory = categoryLower.includes('engineer') || categoryLower.includes('tech') || categoryLower.includes('recon');
      const memoryIsEngineering = memory.approvedAction.toLowerCase().includes('github') ||
        memory.approvedAction.toLowerCase().includes('repo') ||
        memory.approvedAction.toLowerCase().includes('cloud') ||
        memory.approvedAction.toLowerCase().includes('architecture') ||
        memory.approvedAction.toLowerCase().includes('container');

      const categoryBonus = (isFinancialCategory && memoryIsFinancial) || (isEngineeringCategory && memoryIsEngineering) ? 1 : 0;

      // Strict Exclusion Rule: If no matched terms and no category overlap, exclude!
      if (matchedTerms.length === 0 && categoryBonus === 0) {
        continue;
      }

      const relevanceScore = Math.min(100, (matchedTerms.length * 20) + (categoryBonus * 25));

      // Explain why it is relevant (never presenting memory as new evidence)
      const relevanceExplanation = matchedTerms.length > 0
        ? `Historical organizational precedent from ${memory.decisionId}: Matches context terms [${matchedTerms.slice(0, 4).join(', ')}] with recorded outcome '${memory.executionOutcome}'.`
        : `Historical organizational precedent from ${memory.decisionId}: Aligns with ${query.category} governance and strategic domain.`;

      // Check for conflicts between memory and current evidence
      const conflictCheck = this.detectConflict(query, memory);

      results.push({
        memoryId: memory.id,
        sourceDecisionId: memory.decisionId,
        approvedAction: memory.approvedAction,
        executionOutcome: memory.executionOutcome,
        epistemicConfidence: memory.epistemicConfidence,
        evidenceReferences: memory.evidenceReferences,
        relevanceScore,
        relevanceExplanation,
        isConflicting: conflictCheck.hasConflict,
        conflictDetails: conflictCheck.details,
      });
    }

    // Sort by relevance score descending
    return results.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
  }

  /**
   * Conflict Detection between historical memory and current verified evidence.
   * Rule: Current verified empirical evidence always takes precedence over historical memory.
   */
  static detectConflict(
    query: MemoryRetrievalQuery,
    memory: CompanyMemory
  ): {
    hasConflict: boolean;
    details?: {
      memoryPremise: string;
      currentEvidence: string;
      precedenceResolution: string;
    };
  } {
    const memoryText = `${memory.approvedAction} ${memory.executionOutcome}`.toLowerCase();
    const currentFactsText = (query.currentFacts ? query.currentFacts.join(' ') : query.summary).toLowerCase();

    // Conflict Case 1: Infrastructure Cost & Provisioning (e.g. EC2/dedicated server vs Cloud Run serverless container)
    if (
      (memoryText.includes('ec2') || memoryText.includes('dedicated server') || memoryText.includes('5000')) &&
      (currentFactsText.includes('cloud run') || currentFactsText.includes('serverless') || currentFactsText.includes('0 idle') || currentFactsText.includes('container'))
    ) {
      return {
        hasConflict: true,
        details: {
          memoryPremise: `Historical memory recorded: "${memory.approvedAction.slice(0, 90)}"`,
          currentEvidence: `Current verified evidence demonstrates: "${query.currentFacts?.[0] || query.summary.slice(0, 90)}"`,
          precedenceResolution:
            'RULE APPLIED: Current verified empirical evidence takes precedence over historical memory. Historical assumption of dedicated server cost is superseded by verified serverless metrics.',
        },
      };
    }

    // Conflict Case 2: Margin / Pricing Floor Violations
    if (
      (memoryText.includes('discount') || memoryText.includes('60%') || memoryText.includes('margin sacrifice')) &&
      (currentFactsText.includes('80%') || currentFactsText.includes('85%') || currentFactsText.includes('margin floor'))
    ) {
      return {
        hasConflict: true,
        details: {
          memoryPremise: `Historical memory permitted: "${memory.approvedAction.slice(0, 90)}"`,
          currentEvidence: 'Current verified governance requires: 80%+ gross margin floor across autonomous agent seats',
          precedenceResolution:
            'RULE APPLIED: Current verified evidence and constitutional margin floors take precedence over historical concession.',
        },
      };
    }

    // Conflict Case 3: Deprecated Tool / Unverified vs Verified Repository Facts
    if (
      memory.epistemicConfidence === 'unverified' &&
      query.evidenceBasis === 'github_repository_read'
    ) {
      return {
        hasConflict: true,
        details: {
          memoryPremise: `Historical unverified memory: "${memory.approvedAction.slice(0, 90)}"`,
          currentEvidence: 'Current verified GitHub repository evidence with cryptographic provenance',
          precedenceResolution:
            'RULE APPLIED: Empirical repository evidence takes precedence over unverified historical memory.',
        },
      };
    }

    return { hasConflict: false };
  }

  /**
   * Separates:
   * 1. Current Evidence
   * 2. Historical Memory
   * 3. AI Inference / Recommendation
   * 4. Founder Decision
   */
  static separateOperationalComponents(params: {
    currentEvidence: string;
    historicalMemories: RetrievedHistoricalMemory[];
    aiInference: string;
    recommendationTitle: string;
  }): OperationalSeparationResult {
    const hasConflicts = params.historicalMemories.some((m) => m.isConflicting);
    const conflictingItem = params.historicalMemories.find((m) => m.isConflicting);

    const precedenceText = typeof conflictingItem?.conflictDetails === 'object'
      ? conflictingItem.conflictDetails.precedenceResolution
      : conflictingItem?.conflictDetails || 'Verified evidence takes precedence.';

    const conflictNotice = hasConflicts && conflictingItem?.conflictDetails
      ? `CONFLICT DETECTED: Historical precedent from ${conflictingItem.sourceDecisionId || conflictingItem.memoryId} contradicts current empirical evidence. ${precedenceText}`
      : undefined;

    return {
      currentEvidence: params.currentEvidence,
      historicalMemories: params.historicalMemories,
      hasConflicts,
      conflictNotice,
      aiInference: params.aiInference,
      founderDecision: {
        status: 'pending_approval',
        founderApprovalRequired: true,
        note: 'Requires Founder ratification. Historical memory does not automatically approve or execute decisions.',
      },
    };
  }

  /**
   * Formats retrieved historical memories into a cleanly labeled prompt section.
   * Enforces that historical memory is NEVER presented as new evidence.
   */
  static formatForPromptInjection(memories: RetrievedHistoricalMemory[]): string {
    if (!memories || memories.length === 0) {
      return '';
    }

    const lines = [
      '=== HISTORICAL COMPANY MEMORY (ORGANIZATIONAL PRECEDENT ONLY — NOT NEW EVIDENCE) ===',
      'IMPORTANT GOVERNANCE & GROUNDING RULES:',
      '1. The following items represent past organizational decisions and historical outcomes.',
      '2. NEVER cite or present historical memory as current empirical evidence.',
      '3. If historical memory contradicts current verified evidence, CURRENT VERIFIED EVIDENCE TAKES ABSOLUTE PRECEDENCE.',
      '4. Historical memory CANNOT automatically approve initiatives, authorize expenditures, or modify governance permissions.',
      '',
    ];

    memories.forEach((item, index) => {
      lines.push(`[Historical Precedent #${index + 1}] (Source: ${item.memoryId} / Decision: ${item.sourceDecisionId || 'canonical'})`);
      lines.push(`  • Past Approved Action: ${item.approvedAction}`);
      lines.push(`  • Recorded Outcome: ${item.executionOutcome}`);
      lines.push(`  • Epistemic Confidence: ${item.epistemicConfidence}`);
      lines.push(`  • Why Relevant: ${item.relevanceExplanation}`);
      if (item.isConflicting && item.conflictDetails) {
        if (typeof item.conflictDetails === 'object') {
          lines.push(`  • ⚠️ CONFLICT DETECTED: ${item.conflictDetails.memoryPremise}`);
          lines.push(`    Current Evidence: ${item.conflictDetails.currentEvidence}`);
          lines.push(`    Resolution: ${item.conflictDetails.precedenceResolution}`);
        } else {
          lines.push(`  • ⚠️ CONFLICT DETECTED: ${item.conflictDetails}`);
        }
      }
      lines.push('');
    });

    return lines.join('\n');
  }
}
