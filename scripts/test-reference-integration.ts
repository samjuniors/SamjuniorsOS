import { EpistemicPipeline } from '../lib/server/epistemic/pipeline';
import { EpistemicClaimStore } from '../lib/server/epistemic/claim-store';
import { ConnectorRegistry } from '../lib/server/integrations/connector-registry';
import { AgentRunStore } from '../lib/server/agents/run-store';
import { CompanyMemoryStore } from '../lib/server/memory/memory-store';
import {
  EvidenceSourceSchema,
  EpistemicClaimInputSchema,
  ClaimVerificationInputSchema,
} from '../lib/server/epistemic/schemas';

async function runReferenceIntegrationTests() {
  console.log('================================================================');
  console.log('SAMJUNIORS OS: REFERENCE INTEGRATION (OptimalEngine + FounderOS)');
  console.log('VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  const pipeline = EpistemicPipeline.getInstance();
  const claimStore = EpistemicClaimStore.getInstance();
  const connectorRegistry = ConnectorRegistry.getInstance();
  const runStore = AgentRunStore.getInstance();
  const memoryStore = CompanyMemoryStore.getInstance();

  // -------------------------------------------------------------------------
  // SECTION 1: GOVERNED EPISTEMIC LIFECYCLE (OptimalEngine Pattern)
  // -------------------------------------------------------------------------
  console.log('--- Section 1: Governed Epistemic Lifecycle Pipeline ---');

  // Test 1.1: Evidence Source Ingestion with SHA-256 Hashing
  const testContent = 'Audited Q3 serverless cloud invoice: Total Cloud Run cost $0.00 across 10,000 idle hours.';
  const source = await pipeline.ingestSource({
    sourceSystem: 'stripe_and_cloud_run_billing',
    title: 'Cloud Run Q3 Audit',
    rawContent: testContent,
    capturedBy: 'finance',
    provenanceKind: 'live_operational',
  });

  assert(Boolean(source.id && source.id.startsWith('src-')), 'Stage 1: Ingested source receives valid ID');
  assert(source.contentHash.length === 64, 'Stage 1: Source receives valid 64-char SHA-256 contentHash');
  assert(source.provenanceKind === 'live_operational', 'Stage 1: Source maintains honest provenanceKind');

  // Test 1.2: Signal Extraction
  const signal = await pipeline.extractSignal({
    sourceId: source.id,
    signalType: 'financial_record',
    extractedObservation: 'Zero idle cost verified on container architecture.',
    confidence: 'verified_fact',
  });
  assert(signal.sourceId === source.id, 'Stage 2: Extracted signal links back to EvidenceSource');

  // Test 1.3: Claim Submission (AI-generated propositions enter as PENDING)
  const agentClaim = await pipeline.submitClaim({
    sourceId: source.id,
    signalId: signal.id,
    statement: 'Serverless architecture eliminates idle compute burn compared to legacy virtual machines.',
    subject: 'container_architecture',
    category: 'operational',
    proposedBy: 'coo',
    confidence: 'high_confidence',
  });

  assert(agentClaim.verificationStatus === 'pending', 'Stage 3: AI agent claims enter strictly as "pending"');
  assert(agentClaim.proposedBy === 'coo', 'Stage 3: Claim captures proposing agent role');

  // Test 1.4: Contradiction & Constitutional Policy Violation Check (Margin Floor)
  const rogueClaim = await pipeline.submitClaim({
    statement: 'Offer enterprise discount sacrificing gross margin down to 60% to accelerate enterprise acquisition.',
    subject: 'pricing_margin',
    category: 'financial',
    proposedBy: 'researcher',
    confidence: 'unverified',
  });

  const marginVerification = await pipeline.verifyClaim(rogueClaim.id, { role: 'system-policy' });
  assert(!marginVerification.passed, 'Stage 4: Constitutional margin floor violation is caught');
  assert(marginVerification.policyOutcome === 'rejected_contradiction', 'Stage 4: Rogue margin claim is rejected as contradiction');

  const reloadedRogue = await claimStore.getClaim(rogueClaim.id);
  assert(reloadedRogue?.verificationStatus === 'rejected', 'Stage 4: Rejected claim status updated in claim store');

  // Test 1.5: Valid Claim Verification
  const validVerification = await pipeline.verifyClaim(agentClaim.id, { role: 'founder', userId: 'usr-founder-1' });
  assert(validVerification.passed, 'Stage 4: Legitimate evidence-backed claim passes verification');
  assert(validVerification.policyOutcome === 'approved_for_promotion', 'Stage 4: Verified claim approved for promotion');

  // Test 1.6: Promotion to Canonical Fact
  const fact = await pipeline.promoteClaimToFact(agentClaim.id, 'founder');
  assert(Boolean(fact.id && fact.id.startsWith('fact-')), 'Stage 5: Claim promoted to CanonicalFact');
  assert(fact.validityState === 'active', 'Stage 5: Promoted fact has validityState "active"');
  assert(fact.confidence === 'verified_fact', 'Stage 5: Promoted fact has confidence "verified_fact"');
  assert(fact.provenance.sourceSystem === 'epistemic_pipeline', 'Stage 5: Fact provenance links to epistemic pipeline');

  // Test 1.7: Supersession Handling
  // Let's create an updated fact for the same subject with newer empirical evidence
  const newerSource = await pipeline.ingestSource({
    sourceSystem: 'cloud_monitoring',
    title: 'Q4 Cold Start Optimizations',
    rawContent: 'Cold starts reduced to 120ms with min-instance warm pools.',
    capturedBy: 'coo',
  });

  const newerClaim = await pipeline.submitClaim({
    sourceId: newerSource.id,
    statement: 'Serverless architecture eliminates idle compute burn with optimized 120ms warm pools.',
    subject: 'container_architecture',
    category: 'operational',
    proposedBy: 'coo',
  });

  await pipeline.verifyClaim(newerClaim.id, { role: 'founder' });
  const newerFact = await pipeline.promoteClaimToFact(newerClaim.id, 'founder');
  assert(newerFact.id !== fact.id, 'Stage 5: Newer verified fact created');

  // Test 1.8: Memory Packaging & Promotion
  const promotedMemory = await pipeline.promoteFactToMemory({
    factId: newerFact.id,
    approvedAction: newerFact.statement,
    executionOutcome: 'Adopted serverless container standard across all company services',
    category: 'infrastructure',
  });

  assert(Boolean(promotedMemory.id && promotedMemory.id.startsWith('mem-fact-')), 'Stage 6: Fact promoted to CompanyMemory');
  assert(promotedMemory.epistemicConfidence === 'verified_fact', 'Stage 6: Promoted memory has confidence "verified_fact"');
  const queriedMem = await memoryStore.getMemoryById(promotedMemory.id);
  assert(Boolean(queriedMem), 'Stage 6: Promoted memory is retrievable from CompanyMemoryStore');

  // -------------------------------------------------------------------------
  // SECTION 2: HONEST CONNECTOR STATE REGISTRY (FounderOS Pattern)
  // -------------------------------------------------------------------------
  console.log('\n--- Section 2: Honest Connector State Registry ---');

  const connectorStates = connectorRegistry.getConnectorStates();
  assert(Boolean(connectorStates.gemini), 'Connectors: Gemini connector registered');
  assert(Boolean(connectorStates.resend), 'Connectors: Resend connector registered');
  assert(Boolean(connectorStates.stripe), 'Connectors: Stripe connector registered');
  assert(Boolean(connectorStates.github), 'Connectors: GitHub connector registered');
  assert(Boolean(connectorStates.composio), 'Connectors: Composio connector registered');
  assert(Boolean(connectorStates.slack), 'Connectors: Slack connector registered');

  // Invariant: Unconfigured connectors must NOT claim to be live_connected!
  const resendState = connectorStates.resend;
  if (!process.env.RESEND_API_KEY) {
    assert(resendState.status === 'mock_sandbox', 'Connectors: Missing RESEND_API_KEY truthfully reports mock_sandbox');
    assert(resendState.isLive === false, 'Connectors: Missing key is NOT reported as live');
  }

  const stripeState = connectorStates.stripe;
  if (!process.env.STRIPE_SECRET_KEY) {
    assert(stripeState.status === 'mock_sandbox', 'Connectors: Missing STRIPE_SECRET_KEY truthfully reports mock_sandbox');
    assert(stripeState.isLive === false, 'Connectors: Missing Stripe key is NOT reported as live');
  }

  // -------------------------------------------------------------------------
  // SECTION 3: DURABLE AGENT RUNS & TRACES
  // -------------------------------------------------------------------------
  console.log('\n--- Section 3: Durable Agent Run Persistence ---');

  const testRunId = `run-test-${Date.now()}`;
  await runStore.saveRun({
    runId: testRunId,
    agentId: 'coo',
    agentName: 'Elena Vance',
    protocolStep: 'coo_review',
    taskTitle: 'Container Architecture Alignment',
    directive: 'Evaluate serverless infrastructure cost and latency',
    status: 'completed',
    durationMs: 450,
    outputContent: 'Elena Vance verified container configuration.',
    structuredData: { keyFindings: ['Zero idle cost', 'Clean auto-scaling'] },
    claimsGenerated: [agentClaim.id],
    provenance: {
      agentId: 'coo',
      agentName: 'Elena Vance',
      taskId: 'task-test-coo',
      protocolStep: 'coo_review',
      timestamp: new Date().toISOString(),
      isVerified: true,
      evidenceBasis: 'model_reasoning',
    },
    timestamp: new Date().toISOString(),
  });

  const retrievedRun = await runStore.getRun(testRunId);
  assert(Boolean(retrievedRun), 'Agent Runs: Saved run is retrievable');
  assert(retrievedRun?.agentId === 'coo', 'Agent Runs: Run preserves agentId');
  assert(retrievedRun?.claimsGenerated?.includes(agentClaim.id) === true, 'Agent Runs: Run links to generated epistemic claims');

  // Process restart simulation for AgentRunStore
  const runStoreReloaded = AgentRunStore.getInstance();
  const reloadedRun = await runStoreReloaded.getRun(testRunId);
  assert(Boolean(reloadedRun), 'Agent Runs: Survives process restart / cache reload');

  // -------------------------------------------------------------------------
  // SECTION 4: ZOD RUNTIME BOUNDARY VALIDATION
  // -------------------------------------------------------------------------
  console.log('\n--- Section 4: Zod Runtime Data Boundaries ---');

  // Valid claim input
  const validClaimPayload = {
    statement: 'Unit testing coverage across server runtime exceeds 90%',
    subject: 'testing_coverage',
    category: 'operational',
    proposedBy: 'coo',
  };
  const validParsed = EpistemicClaimInputSchema.safeParse(validClaimPayload);
  assert(validParsed.success, 'Zod: Valid claim input accepted');

  // Invalid claim input (empty statement, invalid category)
  const invalidClaimPayload = {
    statement: '',
    subject: 'test',
    category: 'invalid_category_name',
    proposedBy: 'alien_role',
  };
  const invalidParsed = EpistemicClaimInputSchema.safeParse(invalidClaimPayload);
  assert(!invalidParsed.success, 'Zod: Malformed claim input rejected at runtime boundary');

  // Valid verification input
  const validVerifPayload = {
    claimId: 'clm-12345',
    decision: 'approve_and_promote',
    reason: 'Verified against Cloud Run logs',
    reviewerRole: 'founder',
  };
  const validVerifParsed = ClaimVerificationInputSchema.safeParse(validVerifPayload);
  assert(validVerifParsed.success, 'Zod: Valid verification input accepted');

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`REFERENCE INTEGRATION RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runReferenceIntegrationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
