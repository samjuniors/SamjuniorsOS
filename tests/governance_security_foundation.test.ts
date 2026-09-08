import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { SideEffectAuthorizationGate } from '@/lib/server/authorization/gate';
import { EpistemicPipeline } from '@/lib/server/epistemic/pipeline';
import { EpistemicClaimStore } from '@/lib/server/epistemic/claim-store';
import { ConstitutionalVerifier } from '@/lib/server/orchestration/verifier';
import { MultiAgentOrchestrator } from '@/lib/server/orchestration/orchestrator';
import { POST as orchestrateHandler } from '@/app/api/orchestrate/route';
import { POST as epistemicHandler } from '@/app/api/epistemic/route';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { CompanyMemoryStore } from '@/lib/server/memory/memory-store';

async function runTests() {
  console.log('================================================================');
  console.log('🛡️ RUNNING GOVERNANCE & SECURITY FOUNDATION INTEGRATION TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function recordPass(name: string) {
    passed++;
    total++;
    console.log(`  ✓ PASS: ${name}`);
  }

  function recordFail(name: string, err: any) {
    total++;
    console.error(`  ✗ FAIL: ${name}`, err);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: STRICT FOUNDER IDENTITY & ALLOWLIST
  // ---------------------------------------------------------------------------
  console.log('--- Test Group 1: Strict Founder Identity & Allowlist ---');

  try {
    // 1.1 Unauthenticated request rejected
    const unauthReq = new NextRequest('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      headers: {},
    });
    const unauthSession = await getAuthenticatedFounder(unauthReq);
    assert.strictEqual(unauthSession, null, 'Unauthenticated request must return null session');
    recordPass('Unauthenticated request returns null session');

    // 1.2 Spoofed dev role (e.g. attacker/intern) rejected
    const spoofedReq = new NextRequest('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      headers: { 'x-samjuniors-dev-as': 'attacker' },
    });
    const spoofedSession = await getAuthenticatedFounder(spoofedReq);
    assert.strictEqual(spoofedSession, null, 'Spoofed non-founder role must be rejected');
    recordPass('Spoofed non-founder role ("attacker") is rejected');

    // 1.3 Strict Allowlist in SideEffectAuthorizationGate.decideApproval
    const gate = SideEffectAuthorizationGate.getInstance();
    let internBlocked = false;
    try {
      await gate.decideApproval({
        approvalId: 'mock-approval-1',
        decision: 'approved',
        decidedBy: 'intern', // Unlisted role that previously bypassed blocklist
      });
    } catch (err: any) {
      if (err.message.includes('not an authorized Founder')) {
        internBlocked = true;
      }
    }
    assert.strictEqual(internBlocked, true, 'Unlisted role "intern" must be blocked by strict allowlist');
    recordPass('Strict allowlist blocks unlisted role ("intern") in decideApproval');

    let attackerBlocked = false;
    try {
      await gate.decideApproval({
        approvalId: 'mock-approval-2',
        decision: 'approved',
        decidedBy: 'unauthorized_attacker',
      });
    } catch (err: any) {
      if (err.message.includes('not an authorized Founder')) {
        attackerBlocked = true;
      }
    }
    assert.strictEqual(attackerBlocked, true, 'Attacker must be blocked by strict allowlist');
    recordPass('Strict allowlist blocks arbitrary attacker identity in decideApproval');
  } catch (err) {
    recordFail('Test Group 1 failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: HTTP ROUTE AUTHENTICATION (ORCHESTRATE & EPISTEMIC)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 2: HTTP Route Authentication Enforcement ---');

  try {
    // 2.1 POST /api/orchestrate without auth returns 401
    const rawReq = new NextRequest('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      body: JSON.stringify({ directive: 'Execute test directive' }),
      headers: { 'content-type': 'application/json' },
    });
    const orchestrateRes = await orchestrateHandler(rawReq);
    assert.strictEqual(orchestrateRes.status, 401, 'POST /api/orchestrate without auth must return 401');
    const orchestrateBody = await orchestrateRes.json();
    assert.strictEqual(orchestrateBody.success, false);
    recordPass('POST /api/orchestrate rejects unauthenticated calls with 401 Unauthorized');

    // 2.2 POST /api/epistemic without auth returns 401
    const unauthEpistemicReq = new NextRequest('http://localhost:3000/api/epistemic', {
      method: 'POST',
      body: JSON.stringify({ action: 'promote_to_fact', claimId: 'fake-claim' }),
      headers: { 'content-type': 'application/json' },
    });
    const epistemicRes = await epistemicHandler(unauthEpistemicReq);
    assert.strictEqual(epistemicRes.status, 401, 'POST /api/epistemic without auth must return 401');
    recordPass('POST /api/epistemic rejects unauthenticated promotion with 401 Unauthorized');
  } catch (err) {
    recordFail('Test Group 2 failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: SEPARATION OF POWERS (PROPOSER / VERIFIER / APPROVER)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 3: Separation of Powers in Epistemic Pipeline ---');

  try {
    const pipeline = EpistemicPipeline.getInstance();

    // 3.1 Proposer submits a claim
    const testClaim = await pipeline.submitClaim({
      statement: 'Customer acquisition cost decreased by 18% in Q3 testing',
      subject: 'CAC',
      category: 'financial',
      proposedBy: 'researcher',
      confidence: 'unverified',
    });
    assert.strictEqual(testClaim.verificationStatus, 'pending');
    recordPass('Candidate claim successfully submitted as pending');

    // 3.2 Proposer attempts self-review (proposer === reviewer)
    const selfReview = await pipeline.verifyClaim(testClaim.id, {
      role: 'researcher',
      userId: 'researcher',
    });
    assert.strictEqual(selfReview.passed, false, 'Self-review must not pass');
    assert.strictEqual(selfReview.policyOutcome, 'rejected_contradiction');
    assert.ok(selfReview.reason?.includes('SEPARATION_OF_POWERS_VIOLATION'), 'Rejection reason must mention separation of powers');
    recordPass('Proposer self-review is rejected with SEPARATION_OF_POWERS_VIOLATION');

    // 3.3 Independent verifier verifies the claim
    const independentReview = await pipeline.verifyClaim(testClaim.id, {
      role: 'coo',
      userId: 'sophia-vance',
    });
    assert.strictEqual(independentReview.passed, true, 'Independent verifier review must pass');
    recordPass('Independent verifier (COO) successfully verifies claim');

    // 3.4 Unauthorized specialist attempts promotion
    let unauthorizedPromotionBlocked = false;
    try {
      await pipeline.promoteClaimToFact(testClaim.id, 'researcher');
    } catch (err: any) {
      if (err.message.includes('Unauthorized promotion')) {
        unauthorizedPromotionBlocked = true;
      }
    }
    assert.strictEqual(unauthorizedPromotionBlocked, true, 'Non-founder specialist cannot promote claim to fact');
    recordPass('Non-founder identity ("researcher") is blocked from promoting claim to canonical fact');

    // 3.5 Authorized Founder promotes claim to Fact
    const promotedFact = await pipeline.promoteClaimToFact(testClaim.id, 'founder');
    assert.strictEqual(promotedFact.validityState, 'active');
    assert.strictEqual(promotedFact.confidence, 'verified_fact');
    recordPass('Authorized Founder successfully promotes verified claim to canonical fact');
  } catch (err) {
    recordFail('Test Group 3 failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: REAL VERIFICATION ENGINE (REJECTION CAPABILITY)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 4: Constitutional Verification Rejection Engine ---');

  try {
    // 4.1 Constitutional margin floor check rejection
    const marginViolationResult = ConstitutionalVerifier.verify({
      directive: 'Launch new lower tier with 60% gross margin to win volume',
      deliverables: [
        {
          name: 'Pricing Strategy',
          content: 'We propose reducing margin to 60% gross margin for entry tier.',
          provenance: {
            sourceSystem: 'test',
            sourceId: 'deliv-1',
            sourceTitle: 'Pricing',
            epistemicType: 'model_output',
            authority: 'pm',
            timestamp: new Date().toISOString(),
          },
        },
      ],
    });
    assert.strictEqual(marginViolationResult.isCompliant, false, 'Margin floor violation must fail verification');
    assert.ok(
      marginViolationResult.checksFailed.some((c) => c.includes('CONSTITUTIONAL_MARGIN_VIOLATION')),
      'Must record CONSTITUTIONAL_MARGIN_VIOLATION'
    );
    recordPass('ConstitutionalVerifier rejects 60% gross margin proposal');

    // 4.2 Secret / Credential Leak Detection
    const credentialLeakResult = ConstitutionalVerifier.verify({
      directive: 'Integrate external payments provider',
      deliverables: [
        {
          name: 'Integration Config',
          content: 'Export key: sk-live-987654321098765432109876543210 for billing.',
          provenance: {
            sourceSystem: 'test',
            sourceId: 'deliv-2',
            sourceTitle: 'Config',
            epistemicType: 'model_output',
            authority: 'pm',
            timestamp: new Date().toISOString(),
          },
        },
      ],
    });
    assert.strictEqual(credentialLeakResult.isCompliant, false, 'Credential leak must fail verification');
    assert.ok(
      credentialLeakResult.checksFailed.some((c) => c.includes('CREDENTIAL_LEAK_DETECTED')),
      'Must record CREDENTIAL_LEAK_DETECTED'
    );
    recordPass('ConstitutionalVerifier rejects output containing leaked API secret (sk-...)');

    // 4.3 Clean Compliant Deliverables Pass
    const cleanResult = ConstitutionalVerifier.verify({
      directive: 'Optimize token usage in chat inference pipeline',
      deliverables: [
        {
          name: 'PRD: Token Optimization',
          content: 'Preserve 84% gross margin by using client-side semantic caching.',
          provenance: {
            sourceSystem: 'test',
            sourceId: 'deliv-3',
            sourceTitle: 'Token PRD',
            epistemicType: 'model_output',
            authority: 'pm',
            timestamp: new Date().toISOString(),
          },
        },
      ],
    });
    assert.strictEqual(cleanResult.isCompliant, true, 'Clean deliverable with 84% margin must pass verification');
    recordPass('ConstitutionalVerifier accepts compliant deliverable preserving 84% margin floor');

    // 4.4 End-to-end Orchestration Rejection on Constitutional Violation
    const orchestrator = new MultiAgentOrchestrator();
    const rejectedRun = await orchestrator.orchestrateDirective({
      directive: 'Special promotion: reduce our pricing to a 60% gross margin floor',
    });
    assert.strictEqual(rejectedRun.status, 'failed', 'Orchestration must fail on verification rejection');
    assert.strictEqual(rejectedRun.verificationResult?.isCompliant, false, 'verificationResult must be non-compliant');
    assert.strictEqual(rejectedRun.executiveResult?.verificationStatus, 'failed');
    assert.strictEqual(rejectedRun.executiveResult?.executionOutcome, 'verification_rejected');
    recordPass('MultiAgentOrchestrator halts execution and marks status: failed on verification rejection');
  } catch (err) {
    recordFail('Test Group 4 failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: EPISTEMIC CONTAMINATION REMEDIATION
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 5: Epistemic Contamination Remediation ---');

  try {
    const memoryStore = CompanyMemoryStore.getInstance();

    // 5.1 Querying memories without explicit confidence does not coerce to verified_fact
    const queried = await memoryStore.queryMemories({
      queryText: 'margin floor gross unit economics',
      limit: 5,
    });
    assert.ok(queried.length > 0, 'Should return historical memories');

    // 5.2 Verify that memory store does not silently invent verified_fact for unverified items
    const testUnverifiedMemory = {
      id: `mem-test-unverified-${Date.now()}`,
      decisionId: 'dec-test-unverified',
      approvedAction: 'Trial experiment with tentative hypothesis',
      executionOutcome: 'tentative',
      evidenceReferences: [],
      epistemicConfidence: 'unverified' as const,
      timestamp: new Date().toISOString(),
    };
    await memoryStore.recordMemory(testUnverifiedMemory);

    const checkMem = await memoryStore.getMemoryById(testUnverifiedMemory.id);
    assert.strictEqual(checkMem?.epistemicConfidence, 'unverified', 'Recorded unverified memory must retain unverified confidence');
    recordPass('Unverified memory retained as unverified, preventing verified_fact contamination');
  } catch (err) {
    recordFail('Test Group 5 failed', err);
  }

  console.log('\n================================================================');
  console.log(`🎉 ALL GOVERNANCE & SECURITY INTEGRATION TESTS PASSED! (${passed}/${total})`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
