import * as assert from 'node:assert';
import { executeGitHubIntelligence } from '../lib/server/tools/providers/github';
import { generateRecommendationFromFinding, executeApprovedDecision } from '../lib/server/orchestration/decision-loop';
import { GovernanceStore } from '../lib/governance-store';
import { CompanyContextProvider } from '../lib/server/context/company-context';

async function runPhase11_8_Tests() {
  console.log('\n==================================================');
  console.log('PHASE 11.8: CONTROLLED COMPANY LOOP TESTS');
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
        taskId: 'test-phase-11-8-intel',
        agentId: 'researcher',
        protocolStep: 'analyze',
        timestamp: new Date().toISOString(),
      } as any,
    });

    assert.ok(intelligenceResult.intelligenceTopic, 'Must return a structured finding (ResearchTopic)');
    assert.strictEqual(intelligenceResult.intelligenceTopic.category, 'Engineering');
    assert.ok(intelligenceResult.intelligenceTopic.evidence?.facts?.length ?? 0 > 0, 'Finding must contain facts');
    
    // Finding retains evidence/provenance
    assert.strictEqual(
      intelligenceResult.intelligenceTopic.evidence?.repositoryTarget,
      'octocat/Hello-World',
      'Finding must retain repository provenance'
    );
    console.log('  Passed.\n');


    // --------------------------------------------------------------------------
    // 2. FINDING -> RECOMMENDATION
    // --------------------------------------------------------------------------
    console.log('Test 2: Researcher generates recommendation from finding');
    
    const { decision, attentionItem } = await generateRecommendationFromFinding(
      intelligenceResult.intelligenceTopic.id,
      'researcher'
    );

    assert.ok(decision, 'Must generate a CompanyDecision');
    assert.ok(attentionItem, 'Must generate an AttentionItem');
    assert.strictEqual(decision.recommendedBy, 'researcher', 'Decision must record author');
    
    // New recommendation defaults to awaiting_founder_decision ('pending_approval')
    assert.strictEqual(decision.status, 'pending_approval', 'Recommendation must default to pending_approval');
    assert.strictEqual(decision.founderApprovalRequired, true, 'Recommendation must require Founder approval');
    
    // Verify it is separated from the original finding
    assert.notStrictEqual(decision.id, intelligenceResult.intelligenceTopic.id, 'Recommendation ID must differ from finding ID');
    
    // Verify it was added to Governance Store
    const storeDecision = GovernanceStore.getDecisions().find(d => d.id === decision.id);
    assert.ok(storeDecision, 'Decision must be present in GovernanceStore');
    console.log('  Passed.\n');


    // --------------------------------------------------------------------------
    // 3. ATTEMPT TO EXECUTE UNAPPROVED DECISION
    // --------------------------------------------------------------------------
    console.log('Test 3: Cannot orchestrate an unapproved decision');
    
    let caughtError = false;
    try {
      await executeApprovedDecision(decision.id);
    } catch (e: any) {
      caughtError = true;
      assert.ok(e.message.includes('expected \'approved\''), 'Must throw error about unapproved status');
    }
    assert.ok(caughtError, 'System must block execution of unapproved decision');
    console.log('  Passed.\n');


    // --------------------------------------------------------------------------
    // 4. FOUNDER REJECTION
    // --------------------------------------------------------------------------
    console.log('Test 4: Founder rejection behavior');
    
    const { decision: decision2 } = await generateRecommendationFromFinding(
      intelligenceResult.intelligenceTopic.id,
      'pm'
    );
    
    const rejectionResult = GovernanceStore.handleDecisionAction(decision2.id, 'reject', 'Not a priority right now');
    assert.strictEqual(rejectionResult.success, true);
    assert.strictEqual(rejectionResult.decision?.status, 'rejected');
    
    let caughtErrorReject = false;
    try {
      await executeApprovedDecision(decision2.id);
    } catch (e: any) {
      caughtErrorReject = true;
    }
    assert.ok(caughtErrorReject, 'System must block execution of rejected decision');
    console.log('  Passed.\n');

    // --------------------------------------------------------------------------
    // 5. FOUNDER APPROVAL -> DIRECTIVE -> EXISTING ORCHESTRATION
    // --------------------------------------------------------------------------
    console.log('Test 5: Founder approves, creating directive in existing orchestration');

    // Simulate Founder action
    const approvalResult = GovernanceStore.handleDecisionAction(decision.id, 'approve');
    assert.strictEqual(approvalResult.success, true, 'Approval must succeed');
    assert.strictEqual(approvalResult.decision?.status, 'approved', 'Decision state must change to approved');

    // Execute approved decision
    const run = await executeApprovedDecision(decision.id);
    
    assert.ok(run, 'Must return an orchestration run');
    assert.ok(run.id.startsWith('run-'), 'Run must use existing orchestration engine');
    assert.ok(run.directive.includes(decision.id), 'Directive must retain decision provenance');
    assert.ok(run.directive.includes(decision.recommendation), 'Directive must contain the recommendation');
    
    // Result/evidence enters Company Context
    const context = CompanyContextProvider.getCanonicalContext();
    const historyRun = context.orchestrationHistory.find(r => r.id === run.id);
    assert.ok(historyRun, 'Orchestration run must be recorded in Company Context');
    console.log('  Passed.\n');


    console.log('==================================================');
    console.log('ALL PHASE 11.8 TESTS PASSED SUCCESSFULLY');
    console.log('==================================================');

  } catch (error) {
    console.error('\n❌ PHASE 11.8 TEST FAILED');
    console.error(error);
    process.exit(1);
  }
}

runPhase11_8_Tests();
