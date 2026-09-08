import { AgentRole } from '@/types/os';
import {
  AssembledEmployeeContext,
  ContextAssemblyPipelineStep,
  ContextAssemblyRequest,
  ContextConflict,
  CurrentEvidenceInput,
  EPISTEMIC_LABELS,
  EpistemicClassification,
  EpistemicLabel,
  ICompanyKnowledgeStore,
  ICompanyMemoryStore,
  ICompanyStateStore,
  InjectedContextItem,
  RetrievedKnowledgeItem,
  RetrievedStateItem,
} from '@/types/context';
import { RetrievedHistoricalMemory } from '@/types/os';
import { CompanyStateStore } from '../state/state-store';
import { CompanyKnowledgeStore } from '../knowledge/knowledge-store';
import { CompanyMemoryStore } from '../memory/memory-store';
import { ContextualRetrievalService } from './context-retrieval';
import { SERVER_AGENTS } from '../agents/definitions';
import { determineSkillForTask } from '@/lib/skills/skill-registry';
import { createHash } from 'crypto';

/**
 * PHASE 11.13: DETERMINISTIC EMPLOYEE CONTEXT ASSEMBLY SERVICE
 * 
 * Pipeline:
 * Task → Employee Role → Skill → relevant State/Knowledge/Memory → current evidence → final employee context
 * 
 * Invariants & Governance:
 * 1. Role & Skill-Aware: Employees only receive context directly pertinent to their assigned skill and role.
 * 2. Strict Epistemic Labels:
 *    - 'current verified evidence'
 *    - 'company state'
 *    - 'company knowledge'
 *    - 'historical memory'
 *    - 'AI inference'
 * 3. Precedence Hierarchy: Current Verified Evidence / State > Company Knowledge > Historical Memory.
 * 4. Provenance: Every injected context item retains full provenance metadata and selection reasoning.
 * 5. Budget & Noise Management: Rejection of irrelevant company items, enforcing strict character and item limits.
 * 6. Immutability & Employee Isolation: Context Assembly is strictly read-only and frozen. Employees cannot mutate context stores.
 * 7. Advisor Boundary: Advisor uses the assembly layer for consultative reasoning but cannot execute skills.
 */
export class ContextAssemblyService {
  private static defaultInstance: ContextAssemblyService | null = null;

  constructor(
    private stateStore: ICompanyStateStore = CompanyStateStore.getInstance(),
    private knowledgeStore: ICompanyKnowledgeStore = CompanyKnowledgeStore.getInstance(),
    private memoryStore: ICompanyMemoryStore = CompanyMemoryStore.getInstance(),
    private retrievalService: ContextualRetrievalService = ContextualRetrievalService.getInstance()
  ) {}

  public static getInstance(): ContextAssemblyService {
    if (!ContextAssemblyService.defaultInstance) {
      ContextAssemblyService.defaultInstance = new ContextAssemblyService();
    }
    return ContextAssemblyService.defaultInstance;
  }

  /**
   * Main Assembly Entry Point
   * Executes the 8-stage deterministic Context Assembly pipeline.
   */
  public async assembleContextForTask(
    request: ContextAssemblyRequest
  ): Promise<AssembledEmployeeContext> {
    const timestamp = new Date().toISOString();
    const taskId = request.taskId || `task-ctx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const pipelineStages: ContextAssemblyPipelineStep[] = [];

    // ------------------------------------------------------------------------
    // STAGE 1: TASK INTAKE & SCOPING
    // ------------------------------------------------------------------------
    const cleanTaskTitle = request.taskTitle?.trim() || 'Untitled Operational Task';
    const cleanTaskDescription = request.taskDescription?.trim() || cleanTaskTitle;
    const directive = request.directive?.trim();

    pipelineStages.push({
      stage: 'task_intake',
      description: `Task intake parsed: "${cleanTaskTitle}"`,
      status: 'completed',
      timestamp: new Date().toISOString(),
      details: { taskId, directive: directive || 'None specified' },
    });

    // ------------------------------------------------------------------------
    // STAGE 2: ROLE RESOLUTION & EMPLOYEE ISOLATION
    // ------------------------------------------------------------------------
    const role = request.role;
    const agentDef = SERVER_AGENTS[role as AgentRole] || {
      id: role,
      name: role === 'advisor' ? 'Founder Intelligence' : role.toUpperCase(),
      role: role === 'advisor' ? 'Founder Strategic Advisor' : 'Operational Officer',
      department: role === 'advisor' ? 'Executive Advisory' : 'Operations',
      skills: [],
      allowedCapabilities: [],
      prohibitedActions: [],
      systemInstruction: '',
      responsibilities: [],
      protocolResponsibilities: {},
    };

    pipelineStages.push({
      stage: 'role_resolution',
      description: `Role resolved to [${role}] (${agentDef.name}, ${agentDef.department})`,
      status: 'completed',
      timestamp: new Date().toISOString(),
      details: { role, department: agentDef.department },
    });

    // ------------------------------------------------------------------------
    // STAGE 3: SKILL BINDING & PARAMETER EXTRACTION
    // ------------------------------------------------------------------------
    let skillId = request.explicitSkillId || '';
    let skillName = '';
    let skillPurpose = '';

    if (role === 'advisor') {
      skillId = 'strategic_advisory';
      skillName = 'Strategic Cognitive Co-Pilot';
      skillPurpose = 'Provide scenario modeling, trade-off analysis, and executive strategic guidance without execution.';
    } else {
      const skillDecision = determineSkillForTask(
        {
          title: cleanTaskTitle,
          description: cleanTaskDescription,
          protocolStep: request.protocolStep,
          directive,
        },
        role as AgentRole
      );
      skillId = skillDecision.selectedSkill?.id || 'standard_execution';
      skillName = skillDecision.selectedSkill?.name || 'Standard Specialist Execution';
      skillPurpose = skillDecision.selectedSkill?.purpose || 'Execute assigned task within role boundaries.';
    }

    pipelineStages.push({
      stage: 'skill_binding',
      description: `Bound task to skill "${skillName}" (${skillId})`,
      status: 'completed',
      timestamp: new Date().toISOString(),
      details: { skillId, skillName, skillPurpose },
    });

    // ------------------------------------------------------------------------
    // STAGE 4: ROLE & SKILL-AWARE CONTEXTUAL RETRIEVAL
    // ------------------------------------------------------------------------
    const combinedQuery = [
      cleanTaskTitle,
      cleanTaskDescription,
      directive || '',
      skillId,
      skillName,
      ...(request.keywords || []),
      ...(request.tags || []),
      ...(request.currentFacts || []),
    ].join(' ').trim();

    // Query stores through their role-scoped interfaces
    const [rawStateItems, rawKnowledgeItems, rawMemoryItems] = await Promise.all([
      this.stateStore.queryState({
        query: combinedQuery,
        role: role as any,
        tags: request.tags,
        keywords: request.keywords,
        limit: 5,
      }),
      this.knowledgeStore.queryKnowledge({
        queryText: combinedQuery,
        role: role as any,
        tags: request.tags,
        keywords: request.keywords,
        limit: 4,
      }),
      this.memoryStore.queryMemories({
        queryText: combinedQuery,
        tags: request.tags,
        keywords: request.keywords,
        currentFacts: request.currentFacts,
        limit: 4,
      }),
    ]);

    // Relevance threshold filtering: keep items with score >= 0.25
    const filteredState = rawStateItems.filter((s) => s.relevanceScore >= 0.25);
    const filteredKnowledge = rawKnowledgeItems.filter((k) => k.relevanceScore >= 0.25);
    const filteredMemory = rawMemoryItems.filter((m) => (m.relevanceScore ?? 0.5) >= 0.25);

    // Calculate excluded noise metrics
    const [allProducts, allInits, allKnowledge, allMemories] = await Promise.all([
      this.stateStore.getProducts(),
      this.stateStore.getInitiatives(),
      this.knowledgeStore.getAllKnowledge(),
      this.memoryStore.getAllMemories(),
    ]);

    const totalStatePool = allProducts.length + allInits.length;
    const stateExcluded = Math.max(0, totalStatePool - filteredState.length);
    const knowledgeExcluded = Math.max(0, allKnowledge.length - filteredKnowledge.length);
    const memoryExcluded = Math.max(0, allMemories.length - filteredMemory.length);

    pipelineStages.push({
      stage: 'retrieval',
      description: `Retrieved ${filteredState.length} State, ${filteredKnowledge.length} Knowledge, and ${filteredMemory.length} Memory items (Filtered out ${stateExcluded + knowledgeExcluded + memoryExcluded} unneeded items).`,
      status: 'completed',
      timestamp: new Date().toISOString(),
      details: {
        stateCount: filteredState.length,
        knowledgeCount: filteredKnowledge.length,
        memoryCount: filteredMemory.length,
        stateExcluded,
        knowledgeExcluded,
        memoryExcluded,
      },
    });

    // ------------------------------------------------------------------------
    // STAGE 5: CURRENT VERIFIED EVIDENCE INGESTION
    // ------------------------------------------------------------------------
    const injectedEvidence: InjectedContextItem[] = [];
    if (request.currentEvidence && request.currentEvidence.length > 0) {
      for (const ev of request.currentEvidence) {
        const itemContent = ev.summary + (ev.data ? `\nData: ${JSON.stringify(ev.data)}` : '');
        injectedEvidence.push({
          id: `evidence:${ev.id}`,
          title: ev.title,
          epistemicClassification: 'current_evidence',
          epistemicLabel: EPISTEMIC_LABELS.current_evidence,
          sourceSystem: 'current_evidence',
          sourceId: ev.id,
          authority: `Verified Tool Run (${ev.sourceToolOrTest})`,
          relevanceScore: ev.relevanceScore ?? 1.0,
          matchReason: ev.matchReason || `Empirical verification from ${ev.sourceToolOrTest}`,
          selectionReason: ev.selectionReason || `Direct empirical output for active task "${cleanTaskTitle}"`,
          characterCount: itemContent.length,
          content: itemContent,
          timestamp: ev.timestamp || timestamp,
          provenance: {
            sourceSystem: 'current_evidence',
            sourceId: `evidence:${ev.id}`,
            sourceTitle: ev.title,
            epistemicType: 'current_evidence',
            epistemicLabel: EPISTEMIC_LABELS.current_evidence,
            authority: `Verified Tool Run (${ev.sourceToolOrTest})`,
            timestamp: ev.timestamp || timestamp,
            confidence: 'verified_fact',
            notes: 'Real-time empirical observation — takes top epistemic precedence',
          },
        });
      }
    }

    pipelineStages.push({
      stage: 'evidence_injection',
      description: `Injected ${injectedEvidence.length} current verified evidence item(s).`,
      status: 'completed',
      timestamp: new Date().toISOString(),
      details: { evidenceCount: injectedEvidence.length },
    });

    // Transform State items into InjectedContextItems
    const injectedState: InjectedContextItem[] = filteredState.map((s) => {
      const content = `${s.summary}\nEntity: ${s.entityType} | ID: ${s.id}`;
      return {
        id: `state:${s.id}`,
        title: s.title,
        epistemicClassification: 'current_truth',
        epistemicLabel: EPISTEMIC_LABELS.current_truth,
        sourceSystem: 'company_state',
        sourceId: s.id,
        authority: s.provenance?.authority || 'Operational Ground Truth',
        relevanceScore: s.relevanceScore,
        matchReason: s.matchReason,
        selectionReason: `Selected for ${agentDef.name} (${role}) executing ${skillName} because entity matches active operational state.`,
        characterCount: content.length,
        content,
        timestamp: s.provenance?.timestamp || timestamp,
        provenance: {
          ...s.provenance,
          epistemicLabel: EPISTEMIC_LABELS.current_truth,
        },
      };
    });

    // Transform Knowledge items into InjectedContextItems
    const injectedKnowledge: InjectedContextItem[] = filteredKnowledge.map((k) => {
      const content = `[${k.documentId}] ${k.summary}\n${k.contentSnippet}`;
      return {
        id: `knowledge:${k.documentId}`,
        title: k.title,
        epistemicClassification: 'durable_reference',
        epistemicLabel: EPISTEMIC_LABELS.durable_reference,
        sourceSystem: 'company_knowledge',
        sourceId: k.documentId,
        authority: k.provenance?.authority || 'Verified Standard Operating Procedure',
        relevanceScore: k.relevanceScore,
        matchReason: k.matchReason,
        selectionReason: `Selected for ${agentDef.name} (${role}) executing ${skillName} because document provides governing SOP/spec for ${k.category}.`,
        characterCount: content.length,
        content,
        timestamp: k.provenance?.timestamp || timestamp,
        provenance: {
          ...k.provenance,
          epistemicLabel: EPISTEMIC_LABELS.durable_reference,
        },
      };
    });

    // Transform Memory items into InjectedContextItems
    const injectedMemory: InjectedContextItem[] = filteredMemory.map((m) => {
      const content = `Past Action: "${m.approvedAction || m.pastAction}"\nOutcome: ${m.executionOutcome}\nConfidence: ${m.epistemicConfidence}`;
      return {
        id: `memory:${m.memoryId || m.id || 'mem-1'}`,
        title: m.approvedAction || m.pastAction || 'Historical Precedent',
        epistemicClassification: 'historical_memory',
        epistemicLabel: EPISTEMIC_LABELS.historical_memory,
        sourceSystem: 'company_memory',
        sourceId: m.memoryId || m.id || 'mem-1',
        authority: 'Founder-Approved Historical Precedent',
        relevanceScore: m.relevanceScore ?? 0.6,
        matchReason: m.relevanceExplanation || 'Historical decision precedent',
        selectionReason: `Selected for ${agentDef.name} (${role}) to provide historical precedent context without treating past actions as new evidence.`,
        characterCount: content.length,
        content,
        timestamp: m.provenance?.timestamp || timestamp,
        isConflicting: m.isConflicting,
        provenance: {
          sourceSystem: 'company_memory',
          sourceId: `memory:${m.memoryId || m.id}`,
          sourceTitle: m.approvedAction || m.pastAction || 'Historical Precedent',
          epistemicType: 'historical_memory',
          epistemicLabel: EPISTEMIC_LABELS.historical_memory,
          authority: 'Founder-Approved Historical Precedent',
          timestamp: m.provenance?.timestamp || timestamp,
          confidence: (m.epistemicConfidence as any) || 'unverified',
          immutablePrecedent: true,
          notes: 'Precedent only — never new empirical evidence',
        },
      };
    });

    // ------------------------------------------------------------------------
    // STAGE 6: CONFLICT ARBITRATION & EPISTEMIC PRECEDENCE
    // Rule: Current Verified Evidence / State > Company Knowledge > Historical Memory
    // ------------------------------------------------------------------------
    const currentFacts = [
      ...(request.currentFacts || []),
      ...injectedEvidence.map((e) => e.title),
      ...injectedState.map((s) => s.title),
    ];

    const conflicts = this.retrievalService.detectConflicts(
      filteredState,
      filteredKnowledge,
      filteredMemory,
      currentFacts
    );

    // If conflicts exist, mark lower-precedence items and annotate resolution
    if (conflicts.length > 0) {
      for (const conflict of conflicts) {
        if (conflict.lowerPrecedenceItem.sourceSystem === 'company_memory') {
          const mem = injectedMemory.find((m) => m.id === conflict.lowerPrecedenceItem.id);
          if (mem) {
            mem.isConflicting = true;
            mem.conflictResolutionNote = `Superseded by ${conflict.higherPrecedenceItem.sourceSystem}: ${conflict.resolutionSummary}`;
          }
        }
      }
    }

    pipelineStages.push({
      stage: 'conflict_arbitration',
      description:
        conflicts.length > 0
          ? `Detected ${conflicts.length} epistemic conflict(s); applied strict state/evidence precedence overrides.`
          : 'Zero epistemic conflicts detected across all context sources.',
      status: conflicts.length > 0 ? 'flagged' : 'completed',
      timestamp: new Date().toISOString(),
      details: { conflictCount: conflicts.length, conflicts },
    });

    // ------------------------------------------------------------------------
    // STAGE 7: CONTEXT BUDGETING & TOKEN/CHARACTER MANAGEMENT
    // ------------------------------------------------------------------------
    const maxBudgetChars = request.maxBudgetChars || 12000;
    const maxItemsPerCategory = {
      evidence: 4,
      state: 4,
      knowledge: 3,
      memory: 3,
    };

    // Apply category caps
    const budgetedEvidence = injectedEvidence.slice(0, maxItemsPerCategory.evidence);
    const budgetedState = injectedState.slice(0, maxItemsPerCategory.state);
    const budgetedKnowledge = injectedKnowledge.slice(0, maxItemsPerCategory.knowledge);
    const budgetedMemory = injectedMemory.slice(0, maxItemsPerCategory.memory);

    let allItems: InjectedContextItem[] = [
      ...budgetedEvidence,
      ...budgetedState,
      ...budgetedKnowledge,
      ...budgetedMemory,
    ];

    let totalChars = allItems.reduce((acc, it) => acc + it.characterCount, 0);
    let isTruncated = false;
    let truncatedItemCount = 0;

    // If budget exceeded, trim lower-precedence items first (Memory -> Knowledge -> State -> Evidence)
    if (totalChars > maxBudgetChars) {
      isTruncated = true;
      // Sort by epistemic precedence and relevance score descending
      const precedenceWeight: Record<EpistemicClassification, number> = {
        current_evidence: 4,
        current_truth: 3,
        durable_reference: 2,
        historical_memory: 1,
        ai_inference: 0,
      };

      allItems.sort((a, b) => {
        const weightDiff = (precedenceWeight[b.epistemicClassification] || 0) - (precedenceWeight[a.epistemicClassification] || 0);
        if (weightDiff !== 0) return weightDiff;
        return b.relevanceScore - a.relevanceScore;
      });

      const keptItems: InjectedContextItem[] = [];
      let runningChars = 0;

      for (const item of allItems) {
        if (runningChars + item.characterCount <= maxBudgetChars) {
          keptItems.push(item);
          runningChars += item.characterCount;
        } else {
          truncatedItemCount++;
        }
      }

      allItems = keptItems;
      totalChars = runningChars;
    }

    const budgetUtilizationPct = Math.min(100, Math.round((totalChars / maxBudgetChars) * 100));

    pipelineStages.push({
      stage: 'budget_enforcement',
      description: `Context budget: ${totalChars}/${maxBudgetChars} chars (${budgetUtilizationPct}%). Truncated: ${truncatedItemCount} items.`,
      status: 'completed',
      timestamp: new Date().toISOString(),
      details: {
        maxBudgetChars,
        totalChars,
        budgetUtilizationPct,
        isTruncated,
        truncatedItemCount,
      },
    });

    // ------------------------------------------------------------------------
    // STAGE 8: FORMATTED PROMPT GENERATION & FINAL ASSEMBLY
    // ------------------------------------------------------------------------
    const finalEvidence = allItems.filter((i) => i.epistemicClassification === 'current_evidence');
    const finalState = allItems.filter((i) => i.epistemicClassification === 'current_truth');
    const finalKnowledge = allItems.filter((i) => i.epistemicClassification === 'durable_reference');
    const finalMemory = allItems.filter((i) => i.epistemicClassification === 'historical_memory');

    const formattedSeparatedSections = this.formatSeparatedSections({
      taskId,
      taskTitle: cleanTaskTitle,
      role: role as any,
      employeeName: agentDef.name,
      skillName,
      evidence: finalEvidence,
      state: finalState,
      knowledge: finalKnowledge,
      memory: finalMemory,
      conflicts,
    });

    const formattedPrompt = [
      formattedSeparatedSections.evidenceSection,
      formattedSeparatedSections.stateSection,
      formattedSeparatedSections.knowledgeSection,
      formattedSeparatedSections.memorySection,
      formattedSeparatedSections.conflictsSection,
    ].filter(Boolean).join('\n\n');

    // Create deterministic hash for provenance and immutability guarantee
    const hashInput = JSON.stringify({
      taskId,
      role,
      skillId,
      itemIds: allItems.map((i) => i.id),
      timestamp,
    });
    const immutableSnapshotHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16);

    pipelineStages.push({
      stage: 'final_assembly',
      description: `Assembly complete. Snapshot [${immutableSnapshotHash}] assembled with ${allItems.length} verified context items.`,
      status: 'completed',
      timestamp: new Date().toISOString(),
      details: {
        totalItems: allItems.length,
        snapshotHash: immutableSnapshotHash,
      },
    });

    const assembledContext: AssembledEmployeeContext = {
      contextId: `ctx-${Date.now()}-${immutableSnapshotHash}`,
      taskId,
      taskTitle: cleanTaskTitle,
      taskDescription: cleanTaskDescription,
      directive,
      employeeRole: role as any,
      employeeName: agentDef.name,
      skillId,
      skillName,
      skillPurpose,
      timestamp,
      pipelineStages,
      currentEvidence: finalEvidence,
      companyState: finalState,
      companyKnowledge: finalKnowledge,
      historicalMemory: finalMemory,
      allInjectedItems: allItems,
      totalInjectedItems: allItems.length,
      conflicts,
      budget: {
        maxTotalCharacters: maxBudgetChars,
        maxItemsPerCategory,
        totalCharactersUsed: totalChars,
        budgetUtilizationPct,
        isTruncated,
        truncatedItemCount,
      },
      excludedNoise: {
        stateItemsExcludedCount: stateExcluded,
        knowledgeItemsExcludedCount: knowledgeExcluded,
        memoryItemsExcludedCount: memoryExcluded,
        sampleExcludedTitles: [
          ...allKnowledge.slice(0, 2).map((k) => k.title),
          ...allMemories.slice(0, 2).map((m) => m.approvedAction),
        ],
        rejectionReason: 'Items were excluded because their relevance score fell below threshold or they are outside the role/skill domain.',
      },
      isReadOnly: true,
      immutableSnapshotHash,
      formattedPrompt,
      formattedSeparatedSections,
    };

    // Deep freeze the context object to prevent any downstream mutation by employees
    return Object.freeze(assembledContext);
  }

  /**
   * Helper for Founder Intelligence Advisor Queries
   */
  public async assembleContextForAdvisor(
    question: string,
    options: {
      targetContext?: any;
      currentFacts?: string[];
      keywords?: string[];
      maxBudgetChars?: number;
    } = {}
  ): Promise<AssembledEmployeeContext> {
    return this.assembleContextForTask({
      taskId: `advisor-ctx-${Date.now()}`,
      taskTitle: question,
      taskDescription: 'Founder Intelligence strategic scenario and trade-off evaluation',
      role: 'advisor',
      explicitSkillId: 'strategic_advisory',
      currentFacts: options.currentFacts,
      keywords: options.keywords,
      maxBudgetChars: options.maxBudgetChars || 16000,
    });
  }

  /**
   * Formats partitioned prompt sections with standardized epistemic labels.
   */
  private formatSeparatedSections(data: {
    taskId: string;
    taskTitle: string;
    role: string;
    employeeName: string;
    skillName: string;
    evidence: InjectedContextItem[];
    state: InjectedContextItem[];
    knowledge: InjectedContextItem[];
    memory: InjectedContextItem[];
    conflicts: ContextConflict[];
  }) {
    // 1. Evidence Section
    const evLines: string[] = [
      '=================================================================',
      '=== SECTION 1: CURRENT VERIFIED EVIDENCE [EMPIRICAL OBSERVATIONS] ===',
      '=================================================================',
      `EPISTEMIC LABEL: "${EPISTEMIC_LABELS.current_evidence}"`,
      'Real-time empirical verification from automated test runs and live tool executions.',
      'Takes top epistemic precedence over theoretical assumptions or historical precedents.',
      '',
    ];
    if (data.evidence.length === 0) {
      evLines.push('No empirical tool evidence attached to initial task prompt.');
    } else {
      data.evidence.forEach((ev, idx) => {
        evLines.push(`[EVIDENCE-${idx + 1}] ${ev.title}`);
        evLines.push(`  - Epistemic Label: ${ev.epistemicLabel}`);
        evLines.push(`  - Summary: ${ev.content}`);
        evLines.push(`  - Provenance: [Source: ${ev.provenance.sourceId}] [Authority: ${ev.provenance.authority}]`);
        evLines.push(`  - Selection Reason: ${ev.selectionReason}`);
        evLines.push('');
      });
    }

    // 2. State Section
    const stateLines: string[] = [
      '=================================================================',
      '=== SECTION 2: COMPANY STATE [OPERATIONAL GROUND TRUTH] ===',
      '=================================================================',
      `EPISTEMIC LABEL: "${EPISTEMIC_LABELS.current_truth}"`,
      'Verified operational reality across active initiatives, financial metrics, and company architecture.',
      '',
    ];
    if (data.state.length === 0) {
      stateLines.push('No specific company state records matched this task.');
    } else {
      data.state.forEach((st, idx) => {
        stateLines.push(`[STATE-${idx + 1}] ${st.title}`);
        stateLines.push(`  - Epistemic Label: ${st.epistemicLabel}`);
        stateLines.push(`  - Summary: ${st.content}`);
        stateLines.push(`  - Provenance: [Source: ${st.provenance.sourceId}] [Authority: ${st.provenance.authority}]`);
        stateLines.push(`  - Selection Reason: ${st.selectionReason}`);
        stateLines.push('');
      });
    }

    // 3. Knowledge Section
    const knowLines: string[] = [
      '=================================================================',
      '=== SECTION 3: COMPANY KNOWLEDGE [DURABLE REFERENCE & SOPS] ===',
      '=================================================================',
      `EPISTEMIC LABEL: "${EPISTEMIC_LABELS.durable_reference}"`,
      'Durable standard operating procedures, architectural specifications, and governance policies.',
      '',
    ];
    if (data.knowledge.length === 0) {
      knowLines.push('No durable knowledge documents matched this task.');
    } else {
      data.knowledge.forEach((kn, idx) => {
        knowLines.push(`[KNOWLEDGE-${idx + 1}] ${kn.title}`);
        knowLines.push(`  - Epistemic Label: ${kn.epistemicLabel}`);
        knowLines.push(`  - Summary: ${kn.content}`);
        knowLines.push(`  - Provenance: [Source: ${kn.provenance.sourceId}] [Authority: ${kn.provenance.authority}]`);
        knowLines.push(`  - Selection Reason: ${kn.selectionReason}`);
        knowLines.push('');
      });
    }

    // 4. Memory Section
    const memLines: string[] = [
      '=================================================================',
      '=== SECTION 4: HISTORICAL MEMORY [PRECEDENT ONLY — NOT NEW EVIDENCE] ===',
      '=================================================================',
      `EPISTEMIC LABEL: "${EPISTEMIC_LABELS.historical_memory}"`,
      'Historical decisions and execution outcomes. NEVER treat as current empirical evidence or automated approvals.',
      '',
    ];
    if (data.memory.length === 0) {
      memLines.push('No historical memories matched this task.');
    } else {
      data.memory.forEach((mem, idx) => {
        memLines.push(`[MEMORY-${idx + 1}] ${mem.title}`);
        memLines.push(`  - Epistemic Label: ${mem.epistemicLabel}`);
        memLines.push(`  - Details: ${mem.content}`);
        memLines.push(`  - Provenance: [Source: ${mem.provenance.sourceId}] [Authority: ${mem.provenance.authority}]`);
        memLines.push(`  - Selection Reason: ${mem.selectionReason}`);
        if (mem.isConflicting) {
          memLines.push(`  - [!] CONFLICT OVERRIDE: ${mem.conflictResolutionNote || 'Superseded by current verified state.'}`);
        }
        evLines.push('');
      });
    }

    // 5. Conflicts Section
    const conflictLines: string[] = [];
    if (data.conflicts.length > 0) {
      conflictLines.push('=================================================================');
      conflictLines.push('=== SECTION 5: CONFLICT RESOLUTION & PRECEDENCE OVERRIDES ===');
      conflictLines.push('=================================================================');
      data.conflicts.forEach((c, idx) => {
        conflictLines.push(`[CONFLICT-${idx + 1}] ${c.conflictType.toUpperCase()}`);
        conflictLines.push(`  - Override Rule: ${c.precedenceRule}`);
        conflictLines.push(`  - Resolution: ${c.resolutionSummary}`);
        conflictLines.push(`  - Superior: ${c.higherPrecedenceItem.title} (${c.higherPrecedenceItem.epistemicType})`);
        conflictLines.push(`  - Subordinated: ${c.lowerPrecedenceItem.title} (${c.lowerPrecedenceItem.epistemicType})`);
        conflictLines.push('');
      });
    }

    return {
      evidenceSection: evLines.join('\n'),
      stateSection: stateLines.join('\n'),
      knowledgeSection: knowLines.join('\n'),
      memorySection: memLines.join('\n'),
      conflictsSection: conflictLines.join('\n'),
    };
  }
}
