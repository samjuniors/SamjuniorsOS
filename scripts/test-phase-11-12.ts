import * as assert from 'node:assert';
import { CompanyStateStore } from '../lib/server/state/state-store';
import { CompanyKnowledgeStore } from '../lib/server/knowledge/knowledge-store';
import { CompanyMemoryStore } from '../lib/server/memory/memory-store';
import { ContextualRetrievalService } from '../lib/server/context/context-retrieval';
import {
  ICompanyStateStore,
  ICompanyKnowledgeStore,
  ICompanyMemoryStore,
  TaskRetrievedContextBundle,
  StateQueryParams,
} from '../types/context';
import { AdvisorService } from '../lib/server/advisor/advisor-service';

async function runPhase11_12_Tests() {
  console.log('\n==================================================');
  console.log('PHASE 11.12: COMPANY KNOWLEDGE & PERSISTENT CONTEXT TESTS');
  console.log('==================================================\n');

  try {
    // --------------------------------------------------------------------------
    // Test 1: Clean Separation of Context Stores
    // --------------------------------------------------------------------------
    console.log('Test 1: Clean Separation of Context Stores (State vs Knowledge vs Memory)');

    const stateStore: ICompanyStateStore = CompanyStateStore.getInstance();
    const knowledgeStore: ICompanyKnowledgeStore = CompanyKnowledgeStore.getInstance();
    const memoryStore: ICompanyMemoryStore = CompanyMemoryStore.getInstance();

    // Verify stores are completely distinct instances with isolated data
    assert.ok(stateStore, 'StateStore must exist');
    assert.ok(knowledgeStore, 'KnowledgeStore must exist');
    assert.ok(memoryStore, 'MemoryStore must exist');

    const stateItems = await stateStore.queryState({ query: 'margin pricing launch', role: 'pm' });
    const knowledgeItems = await knowledgeStore.queryKnowledge({ queryText: 'margin pricing launch', role: 'pm' });
    const memoryItems = await memoryStore.queryMemories({ queryText: 'margin pricing launch' });

    assert.ok(stateItems.length > 0, 'State items must be returned');
    assert.ok(knowledgeItems.length > 0, 'Knowledge items must be returned');
    assert.ok(memoryItems.length > 0, 'Memory items must be returned');

    // Confirm that state items have epistemicType 'current_truth' and sourceSystem 'company_state'
    for (const item of stateItems) {
      assert.strictEqual(item.provenance.sourceSystem, 'company_state', 'Item from stateStore must have sourceSystem === "company_state"');
      assert.strictEqual(item.provenance.epistemicType, 'current_truth', 'Item from stateStore must have epistemicType === "current_truth"');
    }

    // Confirm that knowledge items have epistemicType 'durable_reference' and sourceSystem 'company_knowledge'
    for (const item of knowledgeItems) {
      assert.strictEqual(item.provenance.sourceSystem, 'company_knowledge', 'Item from knowledgeStore must have sourceSystem === "company_knowledge"');
      assert.strictEqual(item.provenance.epistemicType, 'durable_reference', 'Item from knowledgeStore must have epistemicType === "durable_reference"');
    }

    // Confirm that memory items have epistemicConfidence and are historical
    for (const item of memoryItems) {
      assert.ok(item.memoryId, 'Memory item must have memoryId');
      assert.ok(item.approvedAction, 'Memory item must have approvedAction');
      assert.ok(item.executionOutcome, 'Memory item must have executionOutcome');
    }

    console.log('  ✓ Verified distinct stores: State, Knowledge, and Memory are strictly unmerged.\n');

    // --------------------------------------------------------------------------
    // Test 2: Provenance and Traceability on Every Retrieved Item
    // --------------------------------------------------------------------------
    console.log('Test 2: Complete Provenance and Traceability Metadata');

    const service = ContextualRetrievalService.getInstance();
    const bundle: TaskRetrievedContextBundle = await service.retrieveContextForTask({
      taskId: 'test-task-001',
      taskTitle: 'Evaluate enterprise pricing tier and token margin',
      taskDescription: 'Assess gross margin guardrails and pricing structure against self-serve expansion.',
      role: 'finance',
    });

    const totalRetrieved = bundle.retrievedState.totalCount + bundle.retrievedKnowledge.totalCount + bundle.retrievedMemory.totalCount;
    assert.ok(totalRetrieved > 0, 'Total items retrieved must be greater than 0');
    assert.ok(bundle.timestamp, 'Must have a valid ISO timestamp for retrieval');
    assert.strictEqual(bundle.taskId, 'test-task-001', 'Bundle must preserve taskId');
    assert.strictEqual(bundle.role, 'finance', 'Bundle must preserve role');

    // Check State items provenance
    for (const s of bundle.retrievedState.items) {
      assert.ok(s.id, 'State item must have id');
      assert.ok(s.title, 'State item must have title');
      assert.ok(s.provenance.sourceId, 'State item must have sourceId');
      assert.ok(s.provenance.authority, 'State item must have authority');
      assert.ok(s.provenance.confidence, 'State item must have confidence');
      assert.strictEqual(s.provenance.sourceSystem, 'company_state');
    }

    // Check Knowledge items provenance
    for (const k of bundle.retrievedKnowledge.items) {
      assert.ok(k.knowledgeId, 'Knowledge item must have knowledgeId');
      assert.ok(k.documentId, 'Knowledge item must have documentId');
      assert.ok(k.title, 'Knowledge item must have title');
      assert.ok(k.provenance.sourceId, 'Knowledge item must have sourceId');
      assert.ok(k.provenance.authority, 'Knowledge item must have authority');
      assert.strictEqual(k.provenance.sourceSystem, 'company_knowledge');
    }

    console.log(`  ✓ All retrieved items retain full provenance and source metadata.\n`);

    // --------------------------------------------------------------------------
    // Test 3: Epistemic Hierarchy & Conflict Precedence Rules
    // --------------------------------------------------------------------------
    console.log('Test 3: Epistemic Precedence (Current Evidence / State > Historical Memory)');

    // Infrastructure query: historical dedicated servers vs modern serverless containers
    const infraBundle = await service.retrieveContextForTask({
      taskId: 'test-task-infra',
      taskTitle: 'Container Architecture & Serverless Migration',
      taskDescription: 'Analyze serverless containerization cost against legacy dedicated server compute commitments.',
      role: 'researcher',
      currentFacts: ['Cloud Run serverless containers scale to 0 idle with verified sub-second cold starts'],
    });

    assert.ok(infraBundle.conflicts.length > 0, 'Conflict resolver must detect cross-store divergence');
    const infraConflict = infraBundle.conflicts.find((c) => c.conflictType === 'state_vs_memory');

    assert.ok(infraConflict, 'Must identify state vs memory conflict');
    assert.strictEqual(infraConflict.higherPrecedenceItem.sourceSystem, 'company_state', 'Higher precedence must be company_state');
    assert.strictEqual(infraConflict.lowerPrecedenceItem.sourceSystem, 'company_memory', 'Lower precedence must be company_memory');
    assert.ok(
      infraConflict.precedenceRule.includes('Current State') || infraConflict.precedenceRule.includes('empirical evidence'),
      'Precedence must prioritize Current State / Evidence over Historical Memory'
    );
    assert.ok(infraConflict.higherPrecedenceItem.claim.includes('Cloud Run') || infraConflict.higherPrecedenceItem.claim.includes('serverless'));

    console.log('  ✓ Conflict detected and resolved: Current State strictly supersedes Historical Memory.\n');

    // --------------------------------------------------------------------------
    // Test 4: Clean Separated Prompt Formatting for AI Employees
    // --------------------------------------------------------------------------
    console.log('Test 4: Clean Separated Prompt Formatting (No Context Soup)');

    const formattedPrompt = infraBundle.formattedSeparatedPrompt;

    assert.ok(formattedPrompt.includes('=== SECTION 1: CURRENT COMPANY STATE [CURRENT OPERATIONAL TRUTH] ==='), 'Must clearly separate State section');
    assert.ok(formattedPrompt.includes('=== SECTION 2: DURABLE COMPANY KNOWLEDGE [VERIFIED REFERENCE & SOPS] ==='), 'Must clearly separate Knowledge section');
    assert.ok(formattedPrompt.includes('=== SECTION 3: COMPANY MEMORY [HISTORICAL PRECEDENT ONLY — NOT NEW EVIDENCE] ==='), 'Must clearly separate Memory section');
    assert.ok(formattedPrompt.includes('=== SECTION 4: CONFLICT RESOLUTION & PRECEDENCE ENGINE ==='), 'Must clearly include Conflict section');
    assert.ok(formattedPrompt.includes('Epistemic Rule: Current State > Durable Knowledge > Historical Memory'), 'Must reinforce epistemic rule in prompt');

    console.log('  ✓ Formatted prompt cleanly partitions all three context layers.\n');

    // --------------------------------------------------------------------------
    // Test 5: Advisor Service Grounding and Strict Advisory Boundary
    // --------------------------------------------------------------------------
    console.log('Test 5: Advisor Service Grounding and Strict Advisory Boundary');

    const advisorResponse = await AdvisorService.query(
      'What is our current pricing and margin runway for enterprise agent seats?'
    );

    assert.ok(advisorResponse, 'Advisor must return a response');
    assert.ok(advisorResponse.analysisMarkdown, 'Advisor must return analysis markdown');
    assert.ok(advisorResponse.epistemicBreakdown, 'Advisor must return epistemic breakdown');
    assert.ok(advisorResponse.retrievedContext, 'Advisor must return retrievedContext bundle');
    const advisorItemCount =
      advisorResponse.retrievedContext.retrievedState.totalCount +
      advisorResponse.retrievedContext.retrievedKnowledge.totalCount +
      advisorResponse.retrievedContext.retrievedMemory.totalCount;
    assert.ok(advisorItemCount > 0, 'Advisor must have retrieved context items');

    // Verify Advisor boundaries: cannot mutate or execute operations
    assert.strictEqual(typeof (advisorResponse as any).executePlan, 'undefined', 'Advisor cannot execute plans');
    assert.strictEqual(typeof (advisorResponse as any).mutateState, 'undefined', 'Advisor cannot mutate state directly');

    console.log('  ✓ Advisor receives grounded context and maintains strict advisory boundaries.\n');

    // --------------------------------------------------------------------------
    // Test 6: Storage Interface Extensibility (PostgreSQL / Supabase Readiness)
    // --------------------------------------------------------------------------
    console.log('Test 6: Storage Interface Extensibility (PostgreSQL / Supabase Readiness)');

    // Mock SQL/Supabase-backed implementation of ICompanyStateStore
    class MockPostgresStateStore implements ICompanyStateStore {
      async getProducts() { return []; }
      async getInitiatives() { return []; }
      async getCustomers() { return []; }
      async getEmployees() { return []; }
      async getDecisions() { return []; }
      async getAttentionItems() { return []; }
      async getFinancialMetrics() { return {} as any; }
      async queryState(params: StateQueryParams) {
        return [
          {
            entityType: 'finance' as const,
            id: 'sql-row-metrics-1',
            title: 'PostgreSQL Cloud Database Metrics Table',
            summary: 'Active runway is 18.5 months with 82.4% gross margin',
            data: { runway_months: 18.5, gross_margin: 0.824 },
            relevanceScore: 0.95,
            matchReason: 'Direct SQL query against public.company_metrics',
            provenance: {
              sourceSystem: 'company_state' as const,
              sourceId: 'postgres:table:company_metrics',
              sourceTitle: 'Production Cloud SQL DB',
              epistemicType: 'current_truth' as const,
              authority: 'Cloud SQL / PostgreSQL Persistence Service',
              timestamp: new Date().toISOString(),
              confidence: 'verified_fact' as const,
            },
          },
        ];
      }
    }

    const pgService = new ContextualRetrievalService(new MockPostgresStateStore(), knowledgeStore, memoryStore);
    const pgBundle = await pgService.retrieveContextForTask({
      taskId: 'pg-task-1',
      taskTitle: 'Database persistence check',
      role: 'coo',
    });

    assert.ok(
      pgBundle.retrievedState.items.some((s) => s.provenance.sourceId.includes('postgres')),
      'Pluggable SQL store seamlessly integrates into ContextualRetrievalService'
    );
    console.log('  ✓ Storage interfaces support direct migration to PostgreSQL/Supabase without rewriting retrieval.\n');

    console.log('==================================================');
    console.log('ALL PHASE 11.12 TESTS PASSED SUCCESSFULLY');
    console.log('==================================================\n');
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

runPhase11_12_Tests();
