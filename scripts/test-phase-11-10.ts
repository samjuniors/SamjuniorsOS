import * as assert from 'node:assert';
import { OperationalLearningLoop } from '../lib/server/memory/learning-loop';
import { CompanyMemory } from '@/types/os';
import { generateRecommendationFromFinding } from '../lib/server/orchestration/decision-loop';
import { CompanyContextProvider } from '../lib/server/context/company-context';
import { GovernanceStore } from '../lib/governance-store';

async function runPhase11_10_Tests() {
  console.log('\n==================================================');
  console.log('PHASE 11.10: OPERATIONAL LEARNING LOOP TESTS');
  console.log('==================================================\n');

  try {
    // --------------------------------------------------------------------------
    // Test 1: Selective Memory Retrieval & Relevance Filtering
    // --------------------------------------------------------------------------
    console.log('Test 1: Selective Memory Retrieval & Relevance Filtering');

    const testMemories: CompanyMemory[] = [
      {
        id: 'mem-margin-1',
        decisionId: 'dec-margin-80',
        approvedAction: 'Enforce strict 80%+ gross margin floor across all customer tiers and token usage',
        executionOutcome: 'Preserved 83.9% gross margin during high-load stress testing',
        epistemicConfidence: 'verified_fact',
        evidenceReferences: ['finance-model-audit', 'margin-verification'],
        timestamp: '2026-09-01T10:00:00Z',
        recordedAt: '2026-09-01T10:00:00Z',
      },
      {
        id: 'mem-infra-1',
        decisionId: 'dec-infra-ec2',
        approvedAction: 'Provision dedicated EC2 server cluster with 5000 fixed monthly cost',
        executionOutcome: 'High idle costs observed during off-peak hours',
        epistemicConfidence: 'verified_fact',
        evidenceReferences: ['legacy-cloud-bill'],
        timestamp: '2026-08-15T10:00:00Z',
        recordedAt: '2026-08-15T10:00:00Z',
      },
      {
        id: 'mem-unrelated-1',
        decisionId: 'dec-office-decor',
        approvedAction: 'Purchase ergonomic desk monitors for San Francisco design studio',
        executionOutcome: 'Completed on budget',
        epistemicConfidence: 'verified_fact',
        evidenceReferences: ['hardware-receipt'],
        timestamp: '2026-07-20T10:00:00Z',
        recordedAt: '2026-07-20T10:00:00Z',
      },
    ];

    // Query asking about gross margin and pricing tier
    const marginQuery = {
      title: 'Pricing Strategy for Enterprise Agent Seats',
      summary: 'Evaluating whether enterprise agent seats can maintain gross margin above 80% with token caching.',
      category: 'Financial',
    };

    const retrievedForMargin = OperationalLearningLoop.retrieveRelevantMemories(marginQuery, testMemories);

    // Assert that relevant memory is retrieved
    assert.ok(
      retrievedForMargin.some((m) => m.memoryId === 'mem-margin-1'),
      'Relevant margin memory must be retrieved.'
    );
    // Assert that unrelated memory (desk monitors) is strictly excluded
    assert.ok(
      !retrievedForMargin.some((m) => m.memoryId === 'mem-unrelated-1'),
      'Unrelated memory (desk monitors) must be strictly excluded.'
    );

    // Check that whyRelevant is clearly explained and not presented as new evidence
    const retrievedItem = retrievedForMargin.find((m) => m.memoryId === 'mem-margin-1')!;
    const relExplanation = retrievedItem.relevanceExplanation || '';
    assert.ok(relExplanation.length > 0, 'Must have a clear explanation of why it is relevant');
    assert.ok(
      relExplanation.includes('Historical') || relExplanation.includes('precedent'),
      'Relevance explanation must clearly identify it as historical precedent, never new evidence.'
    );

    console.log('  ✓ Selective retrieval excludes noise and provides clear historical context.\n');

    // --------------------------------------------------------------------------
    // Test 2: Conflict Detection & Evidence Precedence Rules
    // --------------------------------------------------------------------------
    console.log('Test 2: Conflict Detection & Verified Evidence Precedence Rules');

    // Current verified empirical evidence: Cloud Run serverless deployment with 0 idle cost
    const serverlessQuery = {
      title: 'Containerization Deployment on Cloud Run',
      summary: 'Verified empirical benchmarks confirm Cloud Run serverless container scales to 0 idle with zero fixed cost.',
      currentFacts: ['Cloud Run serverless containers have 0 idle server cost'],
      category: 'Engineering',
      evidenceBasis: 'cloud_run_benchmark',
    };

    const retrievedForInfra = OperationalLearningLoop.retrieveRelevantMemories(serverlessQuery, testMemories);
    const conflictingInfraMemory = retrievedForInfra.find((m) => m.memoryId === 'mem-infra-1')!;

    assert.ok(conflictingInfraMemory, 'Infra memory must be retrieved as historical context.');
    assert.strictEqual(conflictingInfraMemory.isConflicting, true, 'Conflict must be detected between legacy EC2 and serverless.');
    assert.ok(conflictingInfraMemory.conflictDetails, 'Conflict details must be populated.');
    const precedenceText = typeof conflictingInfraMemory.conflictDetails === 'object'
      ? conflictingInfraMemory.conflictDetails.precedenceResolution
      : conflictingInfraMemory.conflictDetails;
    assert.ok(
      precedenceText.includes('Current verified empirical evidence takes precedence'),
      'Precedence rule must prioritize current empirical evidence over historical memory.'
    );

    console.log('  ✓ Conflict detected: Verified empirical evidence supersedes legacy assumptions.\n');

    // --------------------------------------------------------------------------
    // Test 3: 4-Way Operational Separation
    // --------------------------------------------------------------------------
    console.log('Test 3: 4-Way Operational Separation');

    const separation = OperationalLearningLoop.separateOperationalComponents({
      currentEvidence: 'Cloud Run verified telemetry demonstrates $0.18 per-tenant onboarding compute.',
      historicalMemories: retrievedForInfra,
      aiInference: 'Finance and Operations infer that serverless scaling maintains 88% gross margin.',
      recommendationTitle: 'Adopt Serverless Cloud Run Deployment',
    });

    // 1. Current Evidence
    assert.ok(separation.currentEvidence.includes('$0.18 per-tenant'), 'Component 1 (Current Evidence) must be preserved.');

    // 2. Historical Memory
    assert.ok(separation.historicalMemories.length > 0, 'Component 2 (Historical Memory) must be separated.');

    // 3. AI Inference
    assert.ok(separation.aiInference.includes('Finance and Operations infer'), 'Component 3 (AI Inference) must be separated.');

    // 4. Founder Decision
    assert.strictEqual(separation.founderDecision.status, 'pending_approval', 'Component 4 must be pending Founder decision.');
    assert.strictEqual(separation.founderDecision.founderApprovalRequired, true, 'Founder approval must be required.');

    console.log('  ✓ Clean 4-way separation achieved across evidence, memory, inference, and founder decision.\n');

    // --------------------------------------------------------------------------
    // Test 4: Governance Invariant: Memory Never Automatically Approves or Executes
    // --------------------------------------------------------------------------
    console.log('Test 4: Governance Invariant (Memory never auto-approves or executes)');

    // Seed a finding into CompanyContext
    CompanyContextProvider.recordIntelligence({
      id: 'res-test-loop-1',
      title: 'Empirical Verification of Multi-Agent Workflows',
      category: 'Model Tech',
      confidence: 95,
      impact: 'High',
      date: 'Sep 2026',
      author: 'Dr. Aris Thorne',
      summary: 'Verified multi-agent debate reduces hallucination rate from 18% to 1.4% in safe mock testing.',
      tags: ['Multi-Agent', 'Safety', 'Validation'],
    });

    const { decision, attentionItem } = await generateRecommendationFromFinding('res-test-loop-1', 'coo');

    // Historical memory must NEVER auto-approve
    assert.strictEqual(decision.status, 'pending_approval', 'Decision must remain pending_approval.');
    assert.strictEqual(decision.founderApprovalRequired, true, 'founderApprovalRequired must be true.');
    assert.strictEqual(attentionItem.status, 'pending', 'Attention item must remain pending.');
    assert.strictEqual(attentionItem.founderActionRequired, true, 'founderActionRequired must be true.');

    console.log('  ✓ Governance safety invariant verified: Founder authority strictly preserved.\n');

    // --------------------------------------------------------------------------
    // Test 5: Prompt Grounding & Instruction Integrity
    // --------------------------------------------------------------------------
    console.log('Test 5: Prompt Grounding & Clear Labeling (Never presenting memory as new evidence)');

    const promptText = OperationalLearningLoop.formatForPromptInjection(retrievedForInfra);
    assert.ok(
      promptText.includes('=== HISTORICAL COMPANY MEMORY (ORGANIZATIONAL PRECEDENT ONLY — NOT NEW EVIDENCE) ==='),
      'Prompt must clearly label historical memory as organizational precedent, not new evidence.'
    );
    assert.ok(
      promptText.includes('CURRENT VERIFIED EVIDENCE TAKES ABSOLUTE PRECEDENCE'),
      'Prompt must instruct agents that current verified evidence takes absolute precedence.'
    );
    assert.ok(
      promptText.includes('Historical memory CANNOT automatically approve'),
      'Prompt must instruct agents that memory cannot automatically approve actions.'
    );

    console.log('  ✓ Prompt injection adheres to all grounding and anti-hallucination rules.\n');

    console.log('==================================================');
    console.log('ALL PHASE 11.10 TESTS PASSED SUCCESSFULLY');
    console.log('==================================================\n');
  } catch (error) {
    console.error('\n❌ PHASE 11.10 TEST FAILED');
    console.error(error);
    process.exit(1);
  }
}

runPhase11_10_Tests();
