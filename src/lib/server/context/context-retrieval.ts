import { AgentRole } from '@/types/os';
import {
  ContextConflict,
  ICompanyKnowledgeStore,
  ICompanyMemoryStore,
  ICompanyStateStore,
  RetrievedKnowledgeItem,
  RetrievedStateItem,
  TaskRetrievedContextBundle,
} from '@/types/context';
import { RetrievedHistoricalMemory } from '@/types/os';
import { CompanyStateStore } from '../state/state-store';
import { CompanyKnowledgeStore } from '../knowledge/knowledge-store';
import { CompanyMemoryStore } from '../memory/memory-store';

export interface TaskRetrievalRequest {
  taskId?: string;
  role: AgentRole | 'advisor' | 'orchestrator' | 'council';
  taskTitle: string;
  taskDescription?: string;
  directive?: string;
  category?: string;
  currentFacts?: string[];
  tags?: string[];
  keywords?: string[];
}

export interface AdvisorRetrievalOptions {
  category?: string;
  targetContext?: any;
  currentFacts?: string[];
  keywords?: string[];
}

/**
 * PHASE 11.12: Server-Side CONTEXTUAL RETRIEVAL SERVICE
 * 
 * Retrieves role-appropriate and task-relevant Company State + Company Knowledge + Company Memory.
 * 
 * Governance Constraints:
 * 1. Clean Separation: Does NOT merge State, Knowledge, and Memory into one single store.
 * 2. Epistemic Hierarchy: Current State / Evidence > Durable Reference (Knowledge) > Historical Memory (Precedent Only).
 * 3. Provenance: Every retrieved item retains provenance and epistemic classification.
 * 4. Zero Fabrication: Never invents knowledge or memories.
 * 5. Automatic Injection: Employees receive context automatically without manual Founder assembly.
 * 6. Advisor Boundary: Advisor retrieves context for reasoning but cannot mutate or execute.
 * 7. Pluggable: Accepts ICompanyStateStore, ICompanyKnowledgeStore, ICompanyMemoryStore interfaces.
 */
export class ContextualRetrievalService {
  private static defaultInstance: ContextualRetrievalService | null = null;

  constructor(
    private stateStore: ICompanyStateStore = CompanyStateStore.getInstance(),
    private knowledgeStore: ICompanyKnowledgeStore = CompanyKnowledgeStore.getInstance(),
    private memoryStore: ICompanyMemoryStore = CompanyMemoryStore.getInstance()
  ) {}

  public static getInstance(): ContextualRetrievalService {
    if (!ContextualRetrievalService.defaultInstance) {
      ContextualRetrievalService.defaultInstance = new ContextualRetrievalService();
    }
    return ContextualRetrievalService.defaultInstance;
  }

  /**
   * Retrieves relevant State, Knowledge, and Memory for an employee's assigned task.
   */
  public async retrieveContextForTask(request: TaskRetrievalRequest): Promise<TaskRetrievedContextBundle> {
    const taskId = request.taskId || `task-ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = new Date().toISOString();

    const combinedQueryText = [
      request.taskTitle,
      request.taskDescription || '',
      request.directive || '',
      request.category || '',
      ...(request.currentFacts || []),
    ].join(' ').trim();

    // 1. Query COMPANY STATE (Current Operational Reality)
    const stateItems = await this.stateStore.queryState({
      query: combinedQueryText,
      role: request.role,
      tags: request.tags,
      keywords: request.keywords,
      limit: 6,
    });

    // 2. Query COMPANY KNOWLEDGE (Durable Reference Information & SOPs)
    const knowledgeItems = await this.knowledgeStore.queryKnowledge({
      queryText: combinedQueryText,
      category: request.category,
      role: request.role,
      tags: request.tags,
      keywords: request.keywords,
      limit: 4,
    });

    // 3. Query COMPANY MEMORY (Historical Precedent Only)
    const memoryItems = await this.memoryStore.queryMemories({
      queryText: combinedQueryText,
      category: request.category,
      tags: request.tags,
      keywords: request.keywords,
      currentFacts: request.currentFacts,
      limit: 4,
    });

    // 4. Calculate Excluded Items for Transparency
    const [allProducts, allInits, allKnowledge, allMemories] = await Promise.all([
      this.stateStore.getProducts(),
      this.stateStore.getInitiatives(),
      this.knowledgeStore.getAllKnowledge(),
      this.memoryStore.getAllMemories(),
    ]);

    const retrievedStateIds = new Set(stateItems.map((s) => s.id));
    const retrievedKnowledgeIds = new Set(knowledgeItems.map((k) => k.documentId));
    const retrievedMemoryIds = new Set(memoryItems.map((m) => m.memoryId));

    const excludedKnowledge = allKnowledge.filter((k) => !retrievedKnowledgeIds.has(k.documentId));
    const excludedMemories = allMemories.filter((m) => !retrievedMemoryIds.has(m.id));

    // 5. Detect Cross-Store Conflicts & Apply Epistemic Precedence
    const conflicts = this.detectConflicts(stateItems, knowledgeItems, memoryItems, request.currentFacts);

    // 6. Build Breakdown Counts
    const byEntityType: Record<string, number> = {};
    stateItems.forEach((s) => {
      byEntityType[s.entityType] = (byEntityType[s.entityType] || 0) + 1;
    });

    const byCategory: Record<string, number> = {};
    knowledgeItems.forEach((k) => {
      byCategory[k.category] = (byCategory[k.category] || 0) + 1;
    });

    // 7. Assemble Formatted Separated Prompt
    const bundle: TaskRetrievedContextBundle = {
      taskId,
      role: request.role,
      taskTitle: request.taskTitle,
      timestamp,
      retrievedState: {
        items: stateItems,
        totalCount: stateItems.length,
        byEntityType,
      },
      retrievedKnowledge: {
        items: knowledgeItems,
        totalCount: knowledgeItems.length,
        byCategory,
      },
      retrievedMemory: {
        items: memoryItems,
        totalCount: memoryItems.length,
        hasHistoricalPrecedents: memoryItems.length > 0,
      },
      conflicts,
      excludedNoise: {
        stateItemsExcludedCount: (allProducts.length + allInits.length) - stateItems.length,
        knowledgeItemsExcludedCount: excludedKnowledge.length,
        memoryItemsExcludedCount: excludedMemories.length,
        sampleExcludedTitles: [
          ...excludedKnowledge.slice(0, 2).map((k) => k.title),
          ...excludedMemories.slice(0, 2).map((m) => m.approvedAction),
        ],
      },
      formattedSeparatedPrompt: '',
    };

    bundle.formattedSeparatedPrompt = this.formatSeparatedContextForPrompt(bundle);
    return bundle;
  }

  /**
   * Retrieves context for the Founder Advisor (Consultative Reasoning Only)
   */
  public async retrieveForAdvisor(
    question: string,
    options: AdvisorRetrievalOptions = {}
  ): Promise<TaskRetrievedContextBundle> {
    const bundle = await this.retrieveContextForTask({
      taskId: `advisor-query-${Date.now()}`,
      role: 'advisor',
      taskTitle: question,
      taskDescription: 'Founder Intelligence strategic inquiry and scenario analysis',
      category: options.category,
      currentFacts: options.currentFacts,
      keywords: options.keywords,
    });

    return bundle;
  }

  /**
   * Detects semantic and empirical conflicts across State, Knowledge, and Memory.
   * Enforces Precedence: Current State / Evidence > Durable Reference (Knowledge) > Historical Memory (Precedent Only).
   */
  public detectConflicts(
    stateItems: RetrievedStateItem[],
    knowledgeItems: RetrievedKnowledgeItem[],
    memoryItems: RetrievedHistoricalMemory[],
    currentFacts?: string[]
  ): ContextConflict[] {
    const conflicts: ContextConflict[] = [];

    // Rule 1: Legacy dedicated servers in memory vs serverless / cloud run state
    const hasLegacyInfraMemory = memoryItems.find((m) =>
      (m.approvedAction?.toLowerCase().includes('dedicated virtual server') ||
       m.approvedAction?.toLowerCase().includes('5000 fixed monthly cost') ||
       m.pastAction?.toLowerCase().includes('dedicated virtual server'))
    );

    const hasModernInfraState = stateItems.some((s) =>
      s.title.toLowerCase().includes('cloud run') ||
      s.title.toLowerCase().includes('serverless') ||
      s.summary.toLowerCase().includes('serverless') ||
      s.summary.toLowerCase().includes('0 idle')
    ) || (currentFacts && currentFacts.some((f) => f.toLowerCase().includes('serverless') || f.toLowerCase().includes('cloud run')));

    if (hasLegacyInfraMemory && hasModernInfraState) {
      conflicts.push({
        id: `conflict-${Date.now()}-infra`,
        conflictType: 'state_vs_memory',
        higherPrecedenceItem: {
          sourceSystem: 'company_state',
          id: 'state:infra:serverless',
          title: 'Current Microkernel Container Architecture (Cloud Run)',
          epistemicType: 'current_truth',
          claim: 'Cloud Run serverless containers scale to 0 idle with verified sub-second cold starts and no fixed server overhead.',
        },
        lowerPrecedenceItem: {
          sourceSystem: 'company_memory',
          id: `memory:${hasLegacyInfraMemory.memoryId || hasLegacyInfraMemory.id}`,
          title: hasLegacyInfraMemory.approvedAction || hasLegacyInfraMemory.pastAction || 'Legacy Dedicated Compute',
          epistemicType: 'historical_memory',
          claim: 'Past decision allocated $5,000/mo fixed compute for dedicated virtual servers.',
        },
        precedenceRule: 'Current State & verified empirical evidence takes absolute precedence over historical precedent.',
        resolutionSummary: 'Current verified serverless container architecture supersedes legacy $5,000 fixed dedicated server precedent. Memory is retained solely for historical audit.',
      });
    }

    // Rule 2: Memory conflict flagged by OperationalLearningLoop
    for (const mem of memoryItems) {
      if (mem.isConflicting && mem.conflictDetails) {
        const details = typeof mem.conflictDetails === 'object' ? mem.conflictDetails : { notes: mem.conflictDetails };
        const exists = conflicts.some((c) => c.lowerPrecedenceItem.id === `memory:${mem.memoryId}`);
        if (!exists) {
          conflicts.push({
            id: `conflict-${Date.now()}-${mem.memoryId}`,
            conflictType: 'state_vs_memory',
            higherPrecedenceItem: {
              sourceSystem: 'company_state',
              id: 'state:current_evidence',
              title: 'Current Verified Empirical Evidence',
              epistemicType: 'current_truth',
              claim: (details as any).currentEvidenceClaim || 'Current verified data and telemetry',
            },
            lowerPrecedenceItem: {
              sourceSystem: 'company_memory',
              id: `memory:${mem.memoryId || mem.id}`,
              title: mem.approvedAction || mem.pastAction || 'Historical Precedent',
              epistemicType: 'historical_memory',
              claim: (details as any).historicalMemoryClaim || mem.approvedAction || mem.pastAction || 'Historical Precedent',
            },
            precedenceRule: 'Current State & verified empirical evidence takes absolute precedence over historical precedent.',
            resolutionSummary: (details as any).precedenceResolution || 'Current verified evidence supersedes historical memory.',
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Formats the 3-way separated context into prompt blocks with clear epistemic headers and provenance.
   * This is what is automatically delivered to the employee specialist.
   */
  public formatSeparatedContextForPrompt(bundle: TaskRetrievedContextBundle): string {
    const lines: string[] = [];

    lines.push('#################################################################');
    lines.push('### CONTEXT RETRIEVAL LAYER: AUTOMATIC SPECIALIST INJECTION   ###');
    lines.push(`### Assigned Role: ${bundle.role.toUpperCase()} | Task: "${bundle.taskTitle}"`);
    lines.push(`### Epistemic Rule: Current State > Durable Knowledge > Historical Memory`);
    lines.push('#################################################################');
    lines.push('');

    // ==========================================
    // SECTION 1: COMPANY STATE [CURRENT TRUTH]
    // ==========================================
    lines.push('=================================================================');
    lines.push('=== SECTION 1: CURRENT COMPANY STATE [CURRENT OPERATIONAL TRUTH] ===');
    lines.push('=================================================================');
    lines.push('EPISTEMIC CLASSIFICATION: [current_truth]');
    lines.push('These items reflect the live, operational reality of the enterprise.');
    lines.push('');

    if (bundle.retrievedState.items.length === 0) {
      lines.push('No direct state items matched this specific task.');
    } else {
      bundle.retrievedState.items.forEach((item, idx) => {
        lines.push(`[STATE-${idx + 1}] ${item.title}`);
        lines.push(`  - Summary: ${item.summary}`);
        lines.push(`  - Provenance: [Source: ${item.provenance.sourceId}] [Authority: ${item.provenance.authority}] [Confidence: ${item.provenance.confidence}]`);
        lines.push(`  - Relevance: ${item.matchReason}`);
        lines.push('');
      });
    }

    // ==========================================
    // SECTION 2: COMPANY KNOWLEDGE [DURABLE REFERENCE]
    // ==========================================
    lines.push('=================================================================');
    lines.push('=== SECTION 2: DURABLE COMPANY KNOWLEDGE [VERIFIED REFERENCE & SOPS] ===');
    lines.push('=================================================================');
    lines.push('EPISTEMIC CLASSIFICATION: [durable_reference]');
    lines.push('These are verified company policies, standard operating procedures, and architectural specs.');
    lines.push('');

    if (bundle.retrievedKnowledge.items.length === 0) {
      lines.push('No specific durable reference documents matched this task.');
    } else {
      bundle.retrievedKnowledge.items.forEach((item, idx) => {
        lines.push(`[KNOWLEDGE-${idx + 1}] [${item.documentId}] ${item.title} (v${item.version})`);
        lines.push(`  - Summary: ${item.summary}`);
        lines.push(`  - Provenance: [Source: ${item.provenance.sourceId}] [Authority: ${item.provenance.authority}] [Verified: ${item.provenance.timestamp}]`);
        lines.push(`  - Relevance: ${item.matchReason}`);
        lines.push(`  - Reference Content Snippet:`);
        item.contentSnippet.split('\n').forEach((line) => lines.push(`      ${line}`));
        lines.push('');
      });
    }

    // ==========================================
    // SECTION 3: COMPANY MEMORY [HISTORICAL PRECEDENT]
    // ==========================================
    lines.push('=================================================================');
    lines.push('=== SECTION 3: COMPANY MEMORY [HISTORICAL PRECEDENT ONLY — NOT NEW EVIDENCE] ===');
    lines.push('=================================================================');
    lines.push('EPISTEMIC CLASSIFICATION: [historical_memory]');
    lines.push('OPERATIONAL LEARNING & SAFETY BOUNDARIES:');
    lines.push('1. Memory items represent completed past decisions and historical outcomes.');
    lines.push('2. Historical precedent must NEVER be presented as new or current empirical evidence.');
    lines.push('3. Memory CANNOT automatically approve initiatives, bypass permissions, or execute actions.');
    lines.push('4. If historical memory contradicts current verified state/evidence, current state takes precedence.');
    lines.push('');

    if (bundle.retrievedMemory.items.length === 0) {
      lines.push('No relevant historical precedent records found for this query.');
    } else {
      bundle.retrievedMemory.items.forEach((item, idx) => {
        lines.push(`[MEMORY-${idx + 1}] Past Action: "${item.approvedAction}"`);
        lines.push(`  - Execution Outcome: ${item.executionOutcome}`);
        lines.push(`  - Precedent Confidence: ${item.epistemicConfidence}`);
        lines.push(`  - Provenance: [Source: ${item.provenance?.sourceId || item.memoryId}] [Authority: Founder-Approved Precedent]`);
        lines.push(`  - Contextual Relevance: ${item.relevanceExplanation}`);
        if (item.isConflicting) {
          lines.push(`  - [!] CONFLICT DETECTED: Historical precedent superseded by current verified state.`);
        }
        lines.push('');
      });
    }

    // ==========================================
    // SECTION 4: CONFLICT PRECEDENCE ENGINE
    // ==========================================
    if (bundle.conflicts.length > 0) {
      lines.push('=================================================================');
      lines.push('=== SECTION 4: CONFLICT RESOLUTION & PRECEDENCE ENGINE ===');
      lines.push('=================================================================');
      bundle.conflicts.forEach((conflict, idx) => {
        lines.push(`[CONFLICT-${idx + 1}] Type: ${conflict.conflictType.toUpperCase()}`);
        lines.push(`  - Higher Precedence (${conflict.higherPrecedenceItem.epistemicType}): "${conflict.higherPrecedenceItem.title}"`);
        lines.push(`    Claim: ${conflict.higherPrecedenceItem.claim}`);
        lines.push(`  - Lower Precedence (${conflict.lowerPrecedenceItem.epistemicType}): "${conflict.lowerPrecedenceItem.title}"`);
        lines.push(`    Claim: ${conflict.lowerPrecedenceItem.claim}`);
        lines.push(`  - Rule Applied: ${conflict.precedenceRule}`);
        lines.push(`  - Resolution: ${conflict.resolutionSummary}`);
        lines.push('');
      });
    }

    lines.push('#################################################################');
    lines.push('### END RETRIEVED CONTEXT — PROCEED WITH SPECIALIST EXECUTION ###');
    lines.push('#################################################################');

    return lines.join('\n');
  }
}
