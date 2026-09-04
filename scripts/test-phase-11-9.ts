import * as assert from 'node:assert';
import { executeGitHubIntelligence } from '../lib/server/tools/providers/github';
import { generateRecommendationFromFinding, executeApprovedDecision } from '../lib/server/orchestration/decision-loop';
import { GovernanceStore } from '../lib/governance-store';
import { CompanyContextProvider } from '../lib/server/context/company-context';

async function runPhase11_9_Tests() {
  console.log('\n==================================================');
  console.log('PHASE 11.9: COMPANY MEMORY & LEARNING TESTS');
  console.log('==================================================\n');

  try {
    // --------------------------------------------------------------------------
    // 1. GITHUB REPOSITORY EVIDENCE -> TECHNICAL FINDING
    // --------------------------------------------------------------------------
    console.log('Test 1: Real GitHub Evidence -> Finding');
    
    // Using a safe, real repository test target
    const directive = 'Dr. Aris Thorne: Reconnaissance analysis on octocat/Hello-World';
    const intelligenceResult = await executeGitHubIntelligence(directive, {
      toolId: 'github_repository_read',
      sessionScope: {
        userId: 'founder-001',
        employeeRole: 'researcher',
        permittedToolIds: ['github_repository_read'],
      },
      provenance: {
        taskId: 'test-phase-11-9-intel',
        agentId: 'researcher',
        protocolStep: 'analyze',
        timestamp: new Date().toISOString(),
      } as any,
    });
    
    assert.ok(intelligenceResult.intelligenceTopic, 'Must return a structured finding (ResearchTopic)');
    console.log('  Passed.\n');

    // --------------------------------------------------------------------------
    // 2. FINDING -> RECOMMENDATION -> APPROVAL -> EXECUTION
    // --------------------------------------------------------------------------
    console.log('Test 2: Founder approves and executes recommendation');
    
    const { decision } = await generateRecommendationFromFinding(
      intelligenceResult.intelligenceTopic.id,
      'researcher'
    );
    
    // Simulate Founder action
    GovernanceStore.handleDecisionAction(decision.id, 'approve');
    
    // Execute approved decision
    const run = await executeApprovedDecision(decision.id);
    assert.ok(run, 'Must return an orchestration run');
    console.log('  Passed.\n');

    // --------------------------------------------------------------------------
    // 3. COMPANY MEMORY CREATION
    // --------------------------------------------------------------------------
    console.log('Test 3: Completed outcome creates structured Company Memory');
    const memoryRecords = CompanyContextProvider.getCompanyMemory();
    const createdMemory = memoryRecords.find(m => m.decisionId === decision.id);
    
    assert.ok(createdMemory, 'Company Memory must be created for executed decision');
    assert.strictEqual(createdMemory.approvedAction, decision.recommendation, 'Memory must retain approved action');
    assert.strictEqual(createdMemory.executionOutcome, run.status, 'Memory must retain execution outcome');
    assert.strictEqual(createdMemory.epistemicConfidence, 'verified_fact', 'Memory must have epistemic confidence');
    assert.ok(createdMemory.evidenceReferences.includes(decision.evidenceSummary), 'Memory must retain evidence references');
    console.log('  Passed.\n');

    // --------------------------------------------------------------------------
    // 4. RETRIEVAL & ADVISOR/EMPLOYEE GROUNDING
    // --------------------------------------------------------------------------
    console.log('Test 4: Memory retrievable by relevant employees and Founder Advisor');
    
    const context = CompanyContextProvider.getCanonicalContext();
    
    // Advisor prompt grounding
    const advisorPrompt = CompanyContextProvider.formatForAdvisorPrompt(context);
    assert.ok(advisorPrompt.includes('=== DURABLE ORGANIZATIONAL MEMORY ==='), 'Advisor prompt must include memory section');
    assert.ok(advisorPrompt.includes(createdMemory.id), 'Advisor prompt must contain the created memory ID');
    
    // Employee prompt grounding
    const employeePrompt = CompanyContextProvider.formatForEmployeeRoleContext('pm', context);
    assert.ok(employeePrompt.includes('=== COMPANY MEMORY (APPROVED & COMPLETED STRATEGIES) ==='), 'Employee prompt must include memory section');
    assert.ok(employeePrompt.includes(createdMemory.id), 'Employee prompt must contain the created memory ID');
    assert.ok(employeePrompt.includes('cannot unilaterally alter them'), 'Employee prompt must communicate permission boundaries (cannot unilaterally alter)');
    
    console.log('  Passed.\n');

    console.log('==================================================');
    console.log('ALL PHASE 11.9 TESTS PASSED SUCCESSFULLY');
    console.log('==================================================');

  } catch (error) {
    console.error('\n❌ PHASE 11.9 TEST FAILED');
    console.error(error);
    process.exit(1);
  }
}

runPhase11_9_Tests();