import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { SideEffectAuthorizationGate } from '@/lib/server/authorization/gate';
import { EpistemicPipeline } from '@/lib/server/epistemic/pipeline';
import { EpistemicClaimStore } from '@/lib/server/epistemic/claim-store';
import { ConstitutionalVerifier } from '@/lib/server/orchestration/verifier';
import { MultiAgentOrchestrator } from '@/lib/server/orchestration/orchestrator';
import { POST as orchestrateHandler } from '@/app/api/orchestrate/route';
import { POST as epistemicHandler } from '@/app/api/epistemic/route';
import { POST as agentChatHandler } from '@/app/api/agent-chat/route';
import { GET as intentsHandler } from '@/app/api/communication/intents/route';
import { GET as auditHandler } from '@/app/api/workflow/authorizations/audit/route';
import { getAuthenticatedFounder, resolveClerkUserRole, AuthenticatedFounder } from '@/lib/server/auth/session';
import { CompanyMemoryStore } from '@/lib/server/memory/memory-store';
import { InMemoryAuditStore } from '@/lib/server/authorization/approval-store';
import { verifyApprovalPayloadBinding, computeApprovalPayloadHash } from '@/lib/server/authorization/payload-binding';

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

    // 1.4 Clerk User Role Resolution Matrix (Fail-closed & Anti-spoofing)
    const originalFounderEmails = process.env.FOUNDER_EMAILS;
    try {
      // 1.4a configured Founder email -> Founder
      process.env.FOUNDER_EMAILS = 'sam@samjuniors.com,founder@samjuniors.com';
      const role1 = resolveClerkUserRole('sam@samjuniors.com');
      assert.strictEqual(role1, 'FOUNDER', 'Configured founder email must resolve to FOUNDER');
      recordPass('Configured Founder email resolves to FOUNDER');

      // 1.4b configured non-Founder Clerk user -> Auditor
      const role2 = resolveClerkUserRole('attacker@evil.com');
      assert.strictEqual(role2, 'AUDITOR', 'Non-allowlisted user email must resolve to AUDITOR');
      recordPass('Configured non-Founder Clerk user resolves to AUDITOR');

      // 1.4c missing FOUNDER_EMAILS in production -> no Founder privilege
      delete process.env.FOUNDER_EMAILS;
      const role3 = resolveClerkUserRole('founder@samjuniors.com');
      assert.strictEqual(role3, 'AUDITOR', 'Missing FOUNDER_EMAILS must fail closed to AUDITOR');
      recordPass('Missing FOUNDER_EMAILS fails closed with no Founder privilege');

      // 1.4d spoofed Founder metadata -> cannot bypass the configured Founder authorization model
      process.env.FOUNDER_EMAILS = 'sam@samjuniors.com';
      const role4 = resolveClerkUserRole('imposter@untrusted.com', 'FOUNDER');
      assert.strictEqual(role4, 'AUDITOR', 'Spoofed metadata role=FOUNDER must not grant Founder privilege without matching email');
      recordPass('Spoofed Founder metadata cannot bypass configured Founder authorization model');
    } finally {
      process.env.FOUNDER_EMAILS = originalFounderEmails;
    }
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
    // 3.4 String identities are unconditionally eliminated
    let plainStringFounderBlocked = false;
    try {
      await pipeline.promoteClaimToFact(testClaim.id, 'founder');
    } catch (err: any) {
      if (err.message.includes('String-based promoter identities are strictly prohibited') || err.message.includes('Unauthorized promotion')) {
        plainStringFounderBlocked = true;
      }
    }
    assert.strictEqual(plainStringFounderBlocked, true, 'Plain string "founder" must be rejected');
    recordPass('Arbitrary string identity ("founder") is strictly rejected');

    let plainStringFounderIdBlocked = false;
    try {
      await pipeline.promoteClaimToFact(testClaim.id, 'founder-001');
    } catch (err: any) {
      if (err.message.includes('String-based promoter identities are strictly prohibited') || err.message.includes('Unauthorized promotion')) {
        plainStringFounderIdBlocked = true;
      }
    }
    assert.strictEqual(plainStringFounderIdBlocked, true, 'Plain string "founder-001" must be rejected');
    recordPass('Arbitrary string identity ("founder-001") is strictly rejected');

    // 3.5 Reject arbitrary privileged strings (system_governor, system-policy, researcher)
    let sysGovBlocked = false;
    try {
      await pipeline.promoteClaimToFact(testClaim.id, 'system_governor');
    } catch (err: any) {
      if (err.message.includes('Unauthorized promotion')) {
        sysGovBlocked = true;
      }
    }
    assert.strictEqual(sysGovBlocked, true, 'Arbitrary string "system_governor" must be blocked');
    recordPass('Arbitrary string "system_governor" is blocked from fact promotion');

    let sysPolicyBlocked = false;
    try {
      await pipeline.promoteClaimToFact(testClaim.id, 'system-policy');
    } catch (err: any) {
      if (err.message.includes('Unauthorized promotion')) {
        sysPolicyBlocked = true;
      }
    }
    assert.strictEqual(sysPolicyBlocked, true, 'Arbitrary string "system-policy" must be blocked');
    recordPass('Arbitrary string "system-policy" is blocked from fact promotion');

    let researcherStrBlocked = false;
    try {
      await pipeline.promoteClaimToFact(testClaim.id, 'researcher');
    } catch (err: any) {
      if (err.message.includes('Unauthorized promotion')) {
        researcherStrBlocked = true;
      }
    }
    assert.strictEqual(researcherStrBlocked, true, 'Non-founder specialist string cannot promote claim to fact');
    recordPass('Non-founder string identity ("researcher") is blocked from promoting claim');

    // 3.6 Reject unverified / spoofed Founder objects in all environments
    let unverifiedFounderBlocked = false;
    try {
      await pipeline.promoteClaimToFact(testClaim.id, {
        userId: 'founder-unverified',
        role: 'FOUNDER',
        isVerified: false,
      });
    } catch (err: any) {
      if (err.message.includes('Only an authenticated and verified Founder principal can promote')) {
        unverifiedFounderBlocked = true;
      }
    }
    assert.strictEqual(unverifiedFounderBlocked, true, 'Unverified Founder object (isVerified: false) must be rejected');
    recordPass('Unverified Founder object (isVerified: false) is strictly rejected');

    let missingVerifiedFlagBlocked = false;
    try {
      await pipeline.promoteClaimToFact(testClaim.id, {
        userId: 'founder-spoofed',
        role: 'FOUNDER',
      } as any);
    } catch (err: any) {
      if (err.message.includes('Only an authenticated and verified Founder principal can promote')) {
        missingVerifiedFlagBlocked = true;
      }
    }
    assert.strictEqual(missingVerifiedFlagBlocked, true, 'Founder object with missing isVerified must be rejected');
    recordPass('Founder object with missing isVerified is strictly rejected');

    // 3.7 Reject AI specialist / auditor objects attempting promotion
    let specialistObjBlocked = false;
    try {
      await pipeline.promoteClaimToFact(testClaim.id, { userId: 'agent-1', role: 'researcher', isVerified: true });
    } catch (err: any) {
      if (err.message.includes('Unauthorized promotion')) {
        specialistObjBlocked = true;
      }
    }
    assert.strictEqual(specialistObjBlocked, true, 'AI specialist object cannot promote claim to fact');
    recordPass('AI specialist object ({ role: "researcher" }) is blocked from fact promotion');

    let auditorObjBlocked = false;
    try {
      await pipeline.promoteClaimToFact(testClaim.id, { userId: 'auditor-1', role: 'AUDITOR', isVerified: true });
    } catch (err: any) {
      if (err.message.includes('Unauthorized promotion')) {
        auditorObjBlocked = true;
      }
    }
    assert.strictEqual(auditorObjBlocked, true, 'Auditor object cannot promote claim to fact');
    recordPass('Auditor object ({ role: "AUDITOR" }) is blocked from fact promotion');

    // 3.8 Authorized Founder principal promotes claim to Fact
    const founderPrincipal: AuthenticatedFounder = {
      userId: 'founder-001',
      role: 'FOUNDER',
      email: 'founder@samjuniors.com',
      name: 'Executive Founder',
      isVerified: true,
    };
    const promotedFact = await pipeline.promoteClaimToFact(testClaim.id, founderPrincipal);
    assert.strictEqual(promotedFact.validityState, 'active');
    assert.strictEqual(promotedFact.confidence, 'verified_fact');
    assert.strictEqual(promotedFact.promotedBy, 'founder-001');
    recordPass('Explicit AuthenticatedFounder principal successfully promotes verified claim to canonical fact');
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
    // 5.3 Attempting to inject verified_fact without evidenceReferences is automatically sanitized
    const testDirectFactInjection = {
      id: `mem-test-unbacked-${Date.now()}`,
      decisionId: 'dec-unbacked-fact',
      approvedAction: 'Claiming verified fact without evidence',
      executionOutcome: 'unbacked',
      evidenceReferences: [],
      epistemicConfidence: 'verified_fact' as const,
      timestamp: new Date().toISOString(),
    };
    await memoryStore.recordMemory(testDirectFactInjection);
    const checkSanitized = await memoryStore.getMemoryById(testDirectFactInjection.id);
    assert.strictEqual(checkSanitized?.epistemicConfidence, 'high_confidence', 'Unbacked verified_fact must be sanitized to high_confidence');
    recordPass('Unbacked verified_fact memory is downgraded to high_confidence');
  } catch (err) {
    recordFail('Test Group 5 failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: DEV SECRET BOUNDARY & PRODUCTION ENFORCEMENT
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 6: Dev Secret Boundary & Production Enforcement ---');

  const originalEnv = process.env.NODE_ENV;
  const originalDevSecret = process.env.SAMJUNIORS_DEV_SECRET;

  try {
    process.env.SAMJUNIORS_DEV_SECRET = 'correct_super_secret_dev_key';

    // 6.1 Dev header with missing secret returns null session
    const noSecretReq = new NextRequest('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      headers: { 'x-samjuniors-dev-as': 'founder' },
    });
    const noSecretSession = await getAuthenticatedFounder(noSecretReq);
    assert.strictEqual(noSecretSession, null, 'Dev header without dev secret header must be rejected');
    recordPass('Dev header without dev secret header returns null session');

    // 6.2 Dev header with wrong secret returns null session
    const wrongSecretReq = new NextRequest('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      headers: {
        'x-samjuniors-dev-as': 'founder',
        'x-samjuniors-dev-secret': 'wrong_secret',
      },
    });
    const wrongSecretSession = await getAuthenticatedFounder(wrongSecretReq);
    assert.strictEqual(wrongSecretSession, null, 'Dev header with invalid dev secret must be rejected');
    recordPass('Dev header with invalid dev secret returns null session');

    // 6.3 Dev header with correct secret in development returns valid founder session
    const validSecretReq = new NextRequest('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      headers: {
        'x-samjuniors-dev-as': 'founder',
        'x-samjuniors-dev-secret': 'correct_super_secret_dev_key',
      },
    });
    const validDevSession = await getAuthenticatedFounder(validSecretReq);
    assert.ok(validDevSession !== null, 'Dev session with matching secret should succeed in dev');
    assert.strictEqual(validDevSession?.role, 'FOUNDER');
    recordPass('Dev session with matching secret succeeds in development');

    // 6.4 Production mode strictly rejects dev bypass even with matching secret
    (process.env as any).NODE_ENV = 'production';
    const prodDevReq = new NextRequest('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      headers: {
        'x-samjuniors-dev-as': 'founder',
        'x-samjuniors-dev-secret': 'correct_super_secret_dev_key',
      },
    });
    const prodDevSession = await getAuthenticatedFounder(prodDevReq);
    assert.strictEqual(prodDevSession, null, 'Production mode must strictly reject all dev header bypasses');
    recordPass('Production mode strictly rejects dev header bypass even with valid secret');
  } finally {
    (process.env as any).NODE_ENV = originalEnv;
    process.env.SAMJUNIORS_DEV_SECRET = originalDevSecret;
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 7: CRYPTOGRAPHIC PAYLOAD BINDING & ROUTE AUTHORIZATION
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 7: Cryptographic Payload Binding & Route Authorization ---');

  try {
    // 7.1 Missing payloadHash fails closed on consequential action
    const mockApprovalRecord: any = {
      id: 'appr-no-hash',
      decision: 'approved',
      actionName: 'Send Email',
      classification: 'external_communication',
      employeeRole: 'pm',
      target: { targetSystem: 'email', recipient: 'alice@example.com' },
      payloadHash: undefined, // Missing hash
    };
    const bindingResult = verifyApprovalPayloadBinding(mockApprovalRecord, {
      actionName: 'Send Email',
      target: { targetSystem: 'email', recipient: 'alice@example.com' },
      payload: { body: 'Hello' },
    });
    assert.strictEqual(bindingResult.isMatch, false, 'Missing payloadHash must fail closed');
    recordPass('Cryptographic payload binding fails closed when approval lacks payloadHash');

    // 7.2 POST /api/agent-chat: Unauthenticated request rejected with 401
    const unauthChatReq = new NextRequest('http://localhost:3000/api/agent-chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello' }),
    });
    const unauthChatRes = await agentChatHandler(unauthChatReq);
    assert.strictEqual(unauthChatRes.status, 401, 'POST /api/agent-chat must reject unauthenticated requests with 401');
    recordPass('POST /api/agent-chat rejects unauthenticated requests with HTTP 401');

    // 7.3 GET /api/communication/intents: Unauthenticated request rejected with 401
    const unauthIntentsReq = new NextRequest('http://localhost:3000/api/communication/intents', {
      method: 'GET',
    });
    const unauthIntentsRes = await intentsHandler(unauthIntentsReq);
    assert.strictEqual(unauthIntentsRes.status, 401, 'GET /api/communication/intents must reject unauthenticated requests with 401');
    recordPass('GET /api/communication/intents rejects unauthenticated requests with HTTP 401');

    // 7.4 GET /api/workflow/authorizations/audit: Unauthenticated request rejected with 401
    const unauthAuditReq = new NextRequest('http://localhost:3000/api/workflow/authorizations/audit', {
      method: 'GET',
    });
    const unauthAuditRes = await auditHandler(unauthAuditReq);
    assert.strictEqual(unauthAuditRes.status, 401, 'GET /api/workflow/authorizations/audit must reject unauthenticated requests with 401');
    recordPass('GET /api/workflow/authorizations/audit rejects unauthenticated requests with HTTP 401');
  } catch (err) {
    recordFail('Test Group 7 failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 8: AUDIT IMMUTABILITY & EPISTEMIC PROMOTION IDEMPOTENCY
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 8: Audit Immutability & Epistemic Promotion Idempotency ---');

  try {
    // 8.1 Audit trail immutability in production
    const auditStore = InMemoryAuditStore.getInstance();
    const envBefore = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';
      let clearBlocked = false;
      try {
        auditStore.clear();
      } catch (err: any) {
        if (err.message.includes('strictly append-only and immutable')) {
          clearBlocked = true;
        }
      }
      assert.strictEqual(clearBlocked, true, 'Audit store clear() must throw error in production');
      recordPass('InMemoryAuditStore.clear() strictly prohibited and throws in production');
    } finally {
      (process.env as any).NODE_ENV = envBefore;
    }

    // 8.2 Epistemic promotion idempotency
    const pipeline = EpistemicPipeline.getInstance();
    const claim = await pipeline.submitClaim({
      statement: 'Idempotency test statement for canonical facts',
      subject: 'Idempotency Testing Fact Subject',
      category: 'technical_architecture',
      proposedBy: 'researcher',
      empiricalConfidence: 0.95,
      reasoning: 'Grounded unit test verification',
    });

    await pipeline.verifyClaim(claim.id, { role: 'coo', userId: 'coo-verifier-1' });

    const founderAuth: AuthenticatedFounder = {
      userId: 'founder-001',
      role: 'FOUNDER',
      email: 'founder@samjuniors.com',
      name: 'Executive Founder',
      isVerified: true,
    };
    const fact1 = await pipeline.promoteClaimToFact(claim.id, founderAuth);
    const fact2 = await pipeline.promoteClaimToFact(claim.id, founderAuth);

    assert.strictEqual(fact1.id, fact2.id, 'Promoting an already promoted claim must return the identical canonical fact');
    recordPass('Promoting an already promoted claim is idempotent and does not duplicate facts');
  } catch (err) {
    recordFail('Test Group 8 failed', err);
  }

  console.log('\n================================================================');
  console.log(`🎉 ALL GOVERNANCE & SECURITY INTEGRATION TESTS PASSED! (${passed}/${total})`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
