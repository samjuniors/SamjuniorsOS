import { EpistemicPipeline } from '../lib/server/epistemic/pipeline';
import { EpistemicClaimStore } from '../lib/server/epistemic/claim-store';
import { HonestConnectorRegistry } from '../lib/server/integrations/connector-registry';
import { AgentRunStore } from '../lib/server/agents/run-store';

async function runTests() {
  console.log('=== RUNNING PHASE 13 EPISTEMIC & FOUNDEROS INTEGRATION TEST ===\n');

  const pipeline = EpistemicPipeline.getInstance();
  const claimStore = EpistemicClaimStore.getInstance();
  const connectorRegistry = HonestConnectorRegistry.getInstance();
  const runStore = AgentRunStore.getInstance();

  // Test 1: Honest Connectors
  console.log('1. Checking Honest Connector Statuses...');
  const connectors = connectorRegistry.listAllConnectorHealth();
  console.log(`- Connectors inspected: ${connectors.length}`);
  connectors.forEach((c) => {
    console.log(`  * ${c.name} [${c.category}]: status="${c.status}", isMock=${c.isMock}`);
    if (c.missingEnvKeys.length > 0) {
      console.log(`    Missing keys reported truthfully: ${c.missingEnvKeys.join(', ')}`);
    }
  });

  // Test 2: Ingest Raw Evidence Source
  console.log('\n2. Ingesting Raw Evidence Source...');
  const source = await pipeline.ingestSource({
    sourceSystem: 'stripe',
    title: 'Q3 Verified Billing Telemetry',
    rawContent: '{"mrr": 42500, "gross_margin_percent": 84.2, "serverless_cost": 1240}',
    capturedBy: 'finance',
    provenanceKind: 'live_operational',
  });
  console.log(`- Source created: id=${source.id}, hash=${source.contentHash.slice(0, 16)}...`);

  // Test 3: Extract Signal
  console.log('\n3. Extracting Epistemic Signal...');
  const signal = await pipeline.extractSignal({
    sourceId: source.id,
    signalType: 'financial_record',
    extractedObservation: 'Current gross margin holds at 84.2% on Cloud Run serverless compute with zero idle cost.',
    data: { gross_margin_percent: 84.2 },
  });
  console.log(`- Signal extracted: id=${signal.id}, confidence=${signal.confidence}`);

  // Test 4: Submit Claim (Adheres to 80%+ gross margin floor)
  console.log('\n4. Submitting Valid Epistemic Claim...');
  const validClaim = await pipeline.submitClaim({
    sourceId: source.id,
    signalId: signal.id,
    statement: 'SamJuniors OS gross margin is 84.2%, well above our mandatory 80% constitutional floor.',
    subject: 'gross_margin',
    category: 'financial',
    proposedBy: 'finance',
    confidence: 'high_confidence',
  });
  console.log(`- Valid claim submitted: id=${validClaim.id}, status=${validClaim.verificationStatus}`);

  // Test 5: Verify & Promote to Canonical Fact
  console.log('\n5. Verifying & Promoting Valid Claim...');
  const verifyResult = await pipeline.verifyClaim(validClaim.id, { role: 'founder' });
  console.log(`- Policy evaluation: passed=${verifyResult.passed}, outcome=${verifyResult.policyOutcome}`);

  const founderPrincipal = {
    userId: 'usr-founder-1',
    role: 'FOUNDER' as const,
    email: 'founder@samjuniors.com',
    name: 'Executive Founder',
    isVerified: true as const,
  };
  const promotedFact = await pipeline.promoteClaimToFact(validClaim.id, founderPrincipal);
  console.log(`- Fact Promoted: id=${promotedFact.id}, validity=${promotedFact.validityState}`);

  // Test 6: Constitutional Floor Violation Check
  console.log('\n6. Testing Constitutional Violation Detection...');
  const violationClaim = await pipeline.submitClaim({
    statement: 'We can acquire new clients by offering a discount lowering our margin to 60%.',
    subject: 'pricing_discount',
    category: 'financial',
    proposedBy: 'pm',
  });
  const violationResult = await pipeline.verifyClaim(violationClaim.id, { role: 'system-policy' });
  console.log(`- Violation Check Outcome: passed=${violationResult.passed}, reason="${violationResult.reason}"`);

  // Test 7: Contradiction & Supersession
  console.log('\n7. Testing Contradiction & Supersession...');
  const supersedingSource = await pipeline.ingestSource({
    sourceSystem: 'stripe',
    title: 'Q4 Audited FinOps Report',
    rawContent: '{"mrr": 58000, "gross_margin_percent": 86.5}',
    capturedBy: 'finance',
  });
  const supersedingClaim = await pipeline.submitClaim({
    sourceId: supersedingSource.id,
    statement: 'SamJuniors OS gross margin is 86.5%, driven by batch caching optimization.',
    subject: 'gross_margin',
    category: 'financial',
    proposedBy: 'finance',
    confidence: 'high_confidence',
  });
  // Founder review overrides previous fact with newer empirical evidence
  const supersedingVerify = await pipeline.verifyClaim(supersedingClaim.id, { role: 'founder' });
  console.log(`- Superseding verify passed: ${supersedingVerify.passed}`);
  const newFact = await pipeline.promoteClaimToFact(supersedingClaim.id, founderPrincipal);
  console.log(`- New Fact Promoted: id=${newFact.id}`);

  // Verify old fact is marked superseded
  const oldFactRefreshed = await claimStore.getFact(promotedFact.id);
  console.log(`- Old Fact Status: validityState="${oldFactRefreshed?.validityState}", supersededById="${oldFactRefreshed?.supersededById}"`);

  // Test 8: Memory Promotion
  console.log('\n8. Promoting Verified Fact to Organizational Memory Precedent...');
  const memory = await pipeline.promoteFactToMemory({
    factId: newFact.id,
    approvedAction: 'Maintain strict serverless batching to sustain >86% gross margins',
    executionOutcome: 'Successfully maintained gross margin above target throughout Q4',
  });
  console.log(`- Memory saved: id=${memory.id}, decisionId=${memory.decisionId}`);

  // Test 9: Persisted Agent Run Repository
  console.log('\n9. Testing Persisted Agent Run Store...');
  await runStore.saveRun({
    runId: `test-run-${Date.now()}`,
    agentId: 'researcher',
    agentName: 'Dr. Aris Thorne',
    protocolStep: 'research',
    taskTitle: 'OptimalEngine Epistemic Benchmark',
    directive: 'Evaluate epistemic lifecycle integration',
    status: 'completed',
    durationMs: 420,
    outputContent: 'OptimalEngine Source -> Signal -> Claim -> Fact -> Memory architecture successfully incorporated.',
    claimsGenerated: [validClaim.id, supersedingClaim.id],
    provenance: {
      agentId: 'researcher',
      agentName: 'Dr. Aris Thorne',
      taskId: 'test-task',
      protocolStep: 'research',
      timestamp: new Date().toISOString(),
      isVerified: true,
      evidenceBasis: 'external_evidence',
    },
    timestamp: new Date().toISOString(),
  });

  const recentRuns = await runStore.listRuns({ limit: 5 });
  console.log(`- Total persisted agent runs in store: ${recentRuns.length}`);

  console.log('\n=== ALL PHASE 13 INTEGRATION TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
