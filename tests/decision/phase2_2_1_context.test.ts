/**
 * SamJuniorsOS — Phase 2.2.1: Decision-Aware Company Context Test Suite
 *
 * Verifies that the authoritative DecisionStore is available to the existing
 * company intelligence and context-assembly architecture (DecisionContextProvider,
 * SophiaContextAssembler, CompanyContextProvider, ContextAssemblyService, CompanyStateStore).
 *
 * Tests:
 * 1. Active decision retrieval (approved, executing).
 * 2. Pending approval visibility (proposed, under_review, pending_approval).
 * 3. Intervention-required visibility (intervention_required).
 * 4. Exclusion of rejected and withdrawn decisions from active commitments.
 * 5. Superseded decisions excluded from active commitments + conflict warning.
 * 6. Resolved decisions represented strictly as historical precedent (historical_memory).
 * 7. Correct preservation of evidence references and provenance.
 * 8. Context consistency across Sophia and relevant specialists.
 * 9. No accidental use of legacy decision arrays as authoritative data.
 * 10. Corrupt or unavailable decision store fail-closed behavior.
 * 11. Immutability — zero mutations during context retrieval.
 * 12. Lightweight deterministic conflict detection (unconfirmed predecessor execution).
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { DecisionStore } from '@/lib/server/decision/store';
import { DecisionContextProvider } from '@/lib/server/decision/context-provider';
import { CompanyStateStore } from '@/lib/server/state/state-store';
import { CompanyContextProvider } from '@/lib/server/context/company-context';
import { ContextAssemblyService } from '@/lib/server/context/context-assembly';
import { SophiaContextAssembler } from '@/lib/server/sophia/context-assembly';
import { DurableFileStore, CriticalCollectionCorruptionError } from '@/lib/server/persistence/durable-file-store';
import { DecisionRecord } from '@/types/decision';
import { DecisionLifecycleService, generateWorkerCapabilityToken } from '@/lib/server/decision/lifecycle';
import { UnauthorizedDecisionActionError } from '@/lib/server/decision/errors';
import { computeDecisionApprovalHash } from '@/lib/server/decision/payload-binding';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    testResults.push({ name, passed: true });
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    testResults.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`  [FAIL] ${name}: ${err?.message || err}`);
  }
}

async function main(): Promise<void> {
  console.log('\n======================================================');
  console.log('PHASE 2.2.1: DECISION-AWARE COMPANY CONTEXT TEST SUITE');
  console.log('======================================================\n');

  const originalCwd = process.cwd();
  // Isolated scratch directory
  const scratchDir = path.join(os.tmpdir(), `samjuniors-phase221-ctx-${Date.now()}`);
  fs.mkdirSync(scratchDir, { recursive: true });
  process.chdir(scratchDir);

  try {
    // Initialize clean stores
    DurableFileStore.resetInstance();
    DecisionStore.resetInstance();
    DecisionContextProvider.resetInstance();
    CompanyStateStore.resetInstance();
    const fileStore = DurableFileStore.getInstance();
    fileStore.writeCollection('decisions', {});
    fileStore.writeCollection('company_state', {});

  const decisionStore = DecisionStore.getInstance();
  const contextProvider = DecisionContextProvider.getInstance();

  // Create test decision records covering all 10 states
  const now = new Date().toISOString();

  // 1. Active: approved
  const dApproved: DecisionRecord = {
    decisionId: 'dec-test-approved',
    creationRequestId: 'req-appr-1',
    stateVersion: 2,
    title: 'Adopt Enterprise GPU Cluster for Reasoning',
    problemStatement: 'Model latency requires dedicated compute cluster.',
    proposedAction: 'Procure 8x H100 GPU reserved instances.',
    category: 'operational',
    proposer: 'coo',
    accountableOwner: 'founder',
    createdAt: '2026-09-01T10:00:00.000Z',
    evidenceFactIds: ['fact-gpu-pricing', 'fact-latency-benchmark'],
    assumptions: ['Cloud provider delivers within SLA'],
    uncertainty: { level: 'low', description: 'Benchmarked in sandbox with 15% latency reduction' },
    impact: 'high',
    reversibility: 'partially_reversible',
    status: 'approved',
    approvalRequired: true,
    decidedBy: 'founder',
    decidedAt: '2026-09-02T10:00:00.000Z',
    transitions: [
      {
        transitionId: 'tr-appr-1',
        fromStatus: 'proposed',
        toStatus: 'approved',
        actor: 'founder',
        timestamp: '2026-09-02T10:00:00.000Z',
        reason: 'Ratified by Founder',
        stateVersion: 2,
      },
    ],
  };
  dApproved.approvedPayloadHash = computeDecisionApprovalHash(dApproved);

  // 2. Active: executing
  const dExecuting: DecisionRecord = {
    decisionId: 'dec-test-executing',
    creationRequestId: 'req-exec-1',
    stateVersion: 3,
    title: 'Migrate Billing to Usage-Based Metering',
    problemStatement: 'Fixed pricing leaves compute costs unhedged.',
    proposedAction: 'Deploy real-time token metering proxy.',
    category: 'financial',
    proposer: 'finance',
    accountableOwner: 'founder',
    createdAt: '2026-09-05T10:00:00.000Z',
    evidenceFactIds: ['fact-token-spend'],
    assumptions: ['Stripe billing meters support sub-second events'],
    uncertainty: { level: 'medium', description: 'Requires SDK backward compatibility' },
    impact: 'critical',
    reversibility: 'partially_reversible',
    status: 'executing',
    approvalRequired: true,
    linkedWorkflowId: 'wf-billing-migration-01',
    transitions: [
      {
        transitionId: 'tr-exec-1',
        fromStatus: 'approved',
        toStatus: 'executing',
        actor: 'founder',
        timestamp: '2026-09-06T10:00:00.000Z',
        reason: 'Execution authorized',
        stateVersion: 3,
      },
    ],
  };

  // 3. Pending: pending_approval
  const dPendingApproval: DecisionRecord = {
    decisionId: 'dec-test-pending',
    creationRequestId: 'req-pend-1',
    stateVersion: 1,
    title: 'Expand Free Tier Onboarding Limits',
    problemStatement: 'Waitlist conversion is stalling on signup friction.',
    proposedAction: 'Raise self-serve seat cap from 5 to 25.',
    category: 'product',
    proposer: 'pm',
    accountableOwner: 'founder',
    createdAt: '2026-09-10T10:00:00.000Z',
    evidenceFactIds: ['fact-funnel-dropoff'],
    assumptions: ['Abuse prevention rate limiter holds'],
    uncertainty: { level: 'medium', description: 'May increase monthly GPU burn by $4,000' },
    impact: 'medium',
    reversibility: 'reversible',
    status: 'pending_approval',
    approvalRequired: true,
    transitions: [
      {
        transitionId: 'tr-pend-1',
        fromStatus: 'proposed',
        toStatus: 'pending_approval',
        actor: 'pm',
        timestamp: '2026-09-10T10:00:00.000Z',
        reason: 'PRD submitted for founder signoff',
        stateVersion: 1,
      },
    ],
  };

  // 4. Pending: under_review
  const dUnderReview: DecisionRecord = {
    decisionId: 'dec-test-review',
    creationRequestId: 'req-rev-1',
    stateVersion: 1,
    title: 'Transition Core Gateway to WebSockets',
    problemStatement: 'Polling incurs excess HTTP header overhead.',
    proposedAction: 'Refactor client sync to bidirectional WebSockets.',
    category: 'strategic',
    proposer: 'researcher',
    accountableOwner: 'coo',
    createdAt: '2026-09-12T10:00:00.000Z',
    evidenceFactIds: [],
    assumptions: [],
    uncertainty: { level: 'high', description: 'Requires client reconnect logic verification' },
    impact: 'high',
    reversibility: 'reversible',
    status: 'under_review',
    approvalRequired: true,
    transitions: [],
  };

  // 5. Intervention: intervention_required
  const dIntervention: DecisionRecord = {
    decisionId: 'dec-test-intervention',
    creationRequestId: 'req-int-1',
    stateVersion: 4,
    title: 'Deprecate Legacy v1 Authentication Endpoints',
    problemStatement: 'Unused v1 routes present surface maintenance debt.',
    proposedAction: 'Hard deprecate /api/v1/auth tokens.',
    category: 'governance',
    proposer: 'coo',
    accountableOwner: 'founder',
    createdAt: '2026-08-20T10:00:00.000Z',
    evidenceFactIds: ['fact-v1-traffic-zero'],
    assumptions: [],
    uncertainty: { level: 'low', description: 'Client traffic audited' },
    impact: 'medium',
    reversibility: 'partially_reversible',
    status: 'intervention_required',
    approvalRequired: true,
    cancellationState: {
      cancellationRequested: true,
      requestedAt: '2026-08-25T10:00:00.000Z',
      requestedBy: 'operator',
      runningStepIds: ['step-v1-cert-revoke'],
      cancellationConfirmed: false,
    },
    transitions: [
      {
        transitionId: 'tr-int-1',
        fromStatus: 'executing',
        toStatus: 'intervention_required',
        actor: 'system',
        timestamp: '2026-08-25T10:00:00.000Z',
        reason: 'Certificate revocation step hung during execution',
        stateVersion: 4,
      },
    ],
  };

  // 6. Resolved: resolved (Historical precedent)
  const dResolved: DecisionRecord = {
    decisionId: 'dec-test-resolved',
    creationRequestId: 'req-res-1',
    stateVersion: 3,
    title: 'Migrate Primary Database to CockroachDB',
    problemStatement: 'Multi-region failover required for enterprise SLA.',
    proposedAction: 'Migrate schema to distributed Postgres-compatible engine.',
    category: 'strategic',
    proposer: 'coo',
    accountableOwner: 'founder',
    createdAt: '2026-06-01T10:00:00.000Z',
    evidenceFactIds: ['fact-db-latency-audit'],
    assumptions: [],
    uncertainty: { level: 'low', description: 'Stress tested' },
    impact: 'critical',
    reversibility: 'irreversible',
    status: 'resolved',
    approvalRequired: true,
    decidedBy: 'founder',
    decidedAt: '2026-06-05T10:00:00.000Z',
    outcome: {
      outcomeSummary: 'Migration completed on 2026-06-15 with 99.99% availability and zero lost transactions.',
      resolvedAt: '2026-06-15T18:00:00.000Z',
      resolvedBy: 'founder',
    },
    transitions: [
      {
        transitionId: 'tr-res-1',
        fromStatus: 'executing',
        toStatus: 'resolved',
        actor: 'founder',
        timestamp: '2026-06-15T18:00:00.000Z',
        reason: 'Verification tests passed',
        stateVersion: 3,
      },
    ],
  };

  // 7. Inactive: rejected
  const dRejected: DecisionRecord = {
    decisionId: 'dec-test-rejected',
    creationRequestId: 'req-rej-1',
    stateVersion: 2,
    title: 'Adopt Public Unfiltered LLM Proxy',
    problemStatement: 'Bypass internal moderation for raw throughput.',
    proposedAction: 'Route prompt directly to third-party without audit logging.',
    category: 'governance',
    proposer: 'researcher',
    accountableOwner: 'founder',
    createdAt: '2026-07-01T10:00:00.000Z',
    evidenceFactIds: [],
    assumptions: [],
    uncertainty: { level: 'high', description: 'Violates core governance charter' },
    impact: 'critical',
    reversibility: 'irreversible',
    status: 'rejected',
    approvalRequired: true,
    transitions: [
      {
        transitionId: 'tr-rej-1',
        fromStatus: 'proposed',
        toStatus: 'rejected',
        actor: 'founder',
        timestamp: '2026-07-02T10:00:00.000Z',
        reason: 'Violates zero-trust audit invariant',
        stateVersion: 2,
      },
    ],
  };

  // 8. Inactive: withdrawn
  const dWithdrawn: DecisionRecord = {
    decisionId: 'dec-test-withdrawn',
    creationRequestId: 'req-wd-1',
    stateVersion: 2,
    title: 'Implement Custom CSS Theming Framework',
    problemStatement: 'Desire custom design tokens.',
    proposedAction: 'Replace standard Tailwind with bespoke runtime styling.',
    category: 'product',
    proposer: 'pm',
    accountableOwner: 'coo',
    createdAt: '2026-07-10T10:00:00.000Z',
    evidenceFactIds: [],
    assumptions: [],
    uncertainty: { level: 'medium', description: 'Overhead' },
    impact: 'low',
    reversibility: 'reversible',
    status: 'withdrawn',
    approvalRequired: false,
    transitions: [],
  };

  // 9. Inactive: superseded
  const dSuperseded: DecisionRecord = {
    decisionId: 'dec-test-superseded',
    creationRequestId: 'req-sup-1',
    stateVersion: 3,
    title: 'Fixed $29 Flat Monthly Pricing',
    problemStatement: 'Early alpha pricing model.',
    proposedAction: 'Charge flat $29 per workspace.',
    category: 'financial',
    proposer: 'finance',
    accountableOwner: 'founder',
    createdAt: '2026-05-01T10:00:00.000Z',
    evidenceFactIds: [],
    assumptions: [],
    uncertainty: { level: 'low', description: 'Initial alpha' },
    impact: 'high',
    reversibility: 'reversible',
    status: 'superseded',
    approvalRequired: true,
    supersededByDecisionId: 'dec-test-executing',
    transitions: [],
  };

  // 10. Conflict precursor: supersedes dExecuting while dExecuting is still executing!
  const dConflictNew: DecisionRecord = {
    decisionId: 'dec-test-conflict-new',
    creationRequestId: 'req-conf-1',
    stateVersion: 1,
    title: 'Switch Billing to Annual Upfront Enterprise Contracts',
    problemStatement: 'Cash flow optimization.',
    proposedAction: 'Deprecate usage-based metering in favor of annual contracts.',
    category: 'financial',
    proposer: 'finance',
    accountableOwner: 'founder',
    createdAt: '2026-09-15T10:00:00.000Z',
    evidenceFactIds: [],
    assumptions: [],
    uncertainty: { level: 'medium', description: 'Shifts revenue model' },
    impact: 'critical',
    reversibility: 'partially_reversible',
    status: 'proposed',
    approvalRequired: true,
    supersedesDecisionId: 'dec-test-executing', // Conflict: dec-test-executing is actively executing!
    transitions: [],
  };

  // Populate decisionStore with test records
  const allTestDecisions = [
    dApproved,
    dExecuting,
    dPendingApproval,
    dUnderReview,
    dIntervention,
    dResolved,
    dRejected,
    dWithdrawn,
    dSuperseded,
    dConflictNew,
  ];

  for (const dec of allTestDecisions) {
    await decisionStore.create(dec);
  }

  // =========================================================================
  // TEST CASES
  // =========================================================================

  await runTest('1. Active decision retrieval (approved & executing)', async () => {
    const bundle = await contextProvider.getDecisionContext();
    const activeIds = bundle.activeCommitments.map((d) => d.decisionId);

    assert.ok(activeIds.includes('dec-test-approved'), 'approved decision must be in activeCommitments');
    assert.ok(activeIds.includes('dec-test-executing'), 'executing decision must be in activeCommitments');
    assert.ok(!activeIds.includes('dec-test-pending'), 'pending decision must NOT be in activeCommitments');
    assert.ok(!activeIds.includes('dec-test-resolved'), 'resolved decision must NOT be in activeCommitments');
    assert.ok(!activeIds.includes('dec-test-rejected'), 'rejected decision must NOT be in activeCommitments');
  });

  await runTest('2. Pending approval visibility (proposed, under_review, pending_approval)', async () => {
    const bundle = await contextProvider.getDecisionContext();
    const pendingIds = bundle.pendingGovernance.map((d) => d.decisionId);

    assert.ok(pendingIds.includes('dec-test-pending'), 'pending_approval must be in pendingGovernance');
    assert.ok(pendingIds.includes('dec-test-review'), 'under_review must be in pendingGovernance');
    assert.ok(pendingIds.includes('dec-test-conflict-new'), 'proposed must be in pendingGovernance');
    assert.ok(!pendingIds.includes('dec-test-approved'), 'approved must NOT be in pendingGovernance');
  });

  await runTest('3. Intervention-required visibility', async () => {
    const bundle = await contextProvider.getDecisionContext();
    const interventionIds = bundle.interventionRequired.map((d) => d.decisionId);

    assert.ok(interventionIds.includes('dec-test-intervention'), 'intervention_required must be in interventionRequired');
    assert.ok(!bundle.activeCommitments.some((d) => d.decisionId === 'dec-test-intervention'), 'intervention must NOT be treated as active commitment');
  });

  await runTest('4. Exclusion of rejected and withdrawn decisions from active commitments', async () => {
    const bundle = await contextProvider.getDecisionContext();
    const activeIds = bundle.activeCommitments.map((d) => d.decisionId);
    const pendingIds = bundle.pendingGovernance.map((d) => d.decisionId);

    assert.ok(!activeIds.includes('dec-test-rejected'), 'rejected must be excluded from activeCommitments');
    assert.ok(!pendingIds.includes('dec-test-rejected'), 'rejected must be excluded from pendingGovernance');
    assert.ok(!activeIds.includes('dec-test-withdrawn'), 'withdrawn must be excluded from activeCommitments');
    assert.ok(!pendingIds.includes('dec-test-withdrawn'), 'withdrawn must be excluded from pendingGovernance');
  });

  await runTest('5. Superseded decisions excluded from active commitments', async () => {
    const bundle = await contextProvider.getDecisionContext();
    const activeIds = bundle.activeCommitments.map((d) => d.decisionId);

    assert.ok(!activeIds.includes('dec-test-superseded'), 'superseded decision must NOT be in activeCommitments');

    // Query specifically for the superseded decision
    const specificBundle = await contextProvider.getDecisionContext({
      queryText: 'Fixed $29 Flat Monthly Pricing',
      includeInactive: true,
    });
    assert.ok(!specificBundle.activeCommitments.some((d) => d.decisionId === 'dec-test-superseded'), 'must still not be in activeCommitments');
    assert.ok(specificBundle.inactiveDecisions.some((d) => d.decisionId === 'dec-test-superseded'), 'accessible under inactiveDecisions when explicitly requested');
  });

  await runTest('6. Resolved decisions represented strictly as historical precedent', async () => {
    const bundle = await contextProvider.getDecisionContext({
      queryText: 'CockroachDB database migration',
    });

    assert.ok(!bundle.activeCommitments.some((d) => d.decisionId === 'dec-test-resolved'), 'resolved decision must NOT be in activeCommitments');
    assert.ok(bundle.historicalPrecedents.some((d) => d.decisionId === 'dec-test-resolved'), 'resolved decision must be in historicalPrecedents');

    const precedent = bundle.historicalPrecedents.find((d) => d.decisionId === 'dec-test-resolved');
    assert.ok(precedent?.outcome?.outcomeSummary.includes('99.99% availability'), 'outcome summary preserved');
  });

  await runTest('7. Preservation of evidence references and provenance', async () => {
    const bundle = await contextProvider.getDecisionContext();
    const gpuDec = bundle.activeCommitments.find((d) => d.decisionId === 'dec-test-approved');

    assert.ok(gpuDec, 'gpu decision found');
    assert.deepStrictEqual(
      gpuDec!.evidenceFactIds,
      ['fact-gpu-pricing', 'fact-latency-benchmark'],
      'evidenceFactIds preserved verbatim'
    );
    assert.strictEqual(gpuDec!.uncertainty.level, 'low', 'uncertainty level preserved');
    assert.ok(gpuDec!.uncertainty.description.includes('Benchmarked in sandbox'), 'uncertainty description preserved');
  });

  await runTest('8. Context consistency across Sophia and specialist agents', async () => {
    const bundle = await contextProvider.getDecisionContext();

    // Format for Sophia
    const sophiaText = await contextProvider.formatForSophiaContext(bundle);
    assert.ok(sophiaText.includes('Decision [dec-test-approved]'), 'Sophia context mentions approved commitment');
    assert.ok(sophiaText.includes('Decision [dec-test-executing]'), 'Sophia context mentions executing commitment');
    assert.ok(sophiaText.includes('Decision [dec-test-pending]'), 'Sophia context mentions pending governance');
    assert.ok(sophiaText.includes('Decision [dec-test-intervention]'), 'Sophia context mentions intervention');
    assert.ok(sophiaText.includes('fact-gpu-pricing'), 'Sophia context includes evidence references');

    // Format for Specialist (PM / Finance)
    const specialistText = await contextProvider.formatForSpecialistContext(bundle, 'pm');
    assert.ok(specialistText.includes('dec-test-approved'), 'specialist context includes active commitments');
    assert.ok(specialistText.includes('dec-test-pending'), 'specialist context includes pending governance');
    assert.ok(specialistText.includes('fact-gpu-pricing'), 'specialist context includes evidence references');
  });

  await runTest('9. No accidental use of legacy decision arrays as authoritative data in queryState', async () => {
    const stateStore = CompanyStateStore.getInstance();
    const queryResults = await stateStore.queryState({
      query: 'GPU cluster metering',
    });

    const activeDecItem = queryResults.find((r) => r.id === 'dec-test-approved');
    assert.ok(activeDecItem, 'authoritative decision from DecisionStore must appear in queryState results');
    assert.strictEqual(activeDecItem!.provenance.sourceSystem, 'decision_store', 'provenance is decision_store, NOT legacy synthetic state');
    assert.strictEqual(activeDecItem!.provenance.epistemicType, 'current_truth', 'active commitment has current_truth epistemicType');
  });

  await runTest('10. Fail-closed behavior on store corruption', async () => {
    // If critical corruption occurs in decisions collection, ensure it throws CriticalCollectionCorruptionError
    class CorruptDecisionStore {
      public async list(): Promise<DecisionRecord[]> {
        throw new CriticalCollectionCorruptionError({
          collection: 'decisions',
          filePath: '/fake/decisions.json',
          message: 'Simulated disk CRC failure',
        });
      }
    }
    const corruptProvider = new DecisionContextProvider(new CorruptDecisionStore() as any);
    await assert.rejects(
      async () => {
        await corruptProvider.getDecisionContext();
      },
      (err: any) => err instanceof CriticalCollectionCorruptionError,
      'must fail-closed and throw CriticalCollectionCorruptionError on corrupt store'
    );
  });

  await runTest('11. Immutability — context retrieval causes ZERO mutations', async () => {
    const recBefore = await decisionStore.get('dec-test-approved');
    assert.ok(recBefore, 'record exists');
    const versionBefore = recBefore!.stateVersion;

    // Execute multiple retrieval calls across providers and formatters
    const bundle = await contextProvider.getDecisionContext({ queryText: 'GPU cluster' });
    await contextProvider.formatForSophiaContext(bundle);
    await contextProvider.formatForSpecialistContext(bundle, 'coo');
    await CompanyStateStore.getInstance().queryState({ query: 'GPU' });

    const recAfter = await decisionStore.get('dec-test-approved');
    assert.strictEqual(recAfter!.stateVersion, versionBefore, 'stateVersion must NOT be modified');
    assert.deepStrictEqual(recAfter, recBefore, 'record must be byte-identical after context retrieval');
  });

  await runTest('12. Lightweight deterministic conflict detection', async () => {
    const bundle = await contextProvider.getDecisionContext();
    assert.ok(bundle.conflictWarnings.length > 0, 'conflict warning must be detected');

    const lineageConflict = bundle.conflictWarnings.find(
      (w) => w.conflictType === 'unconfirmed_predecessor_execution' && w.decisionId === 'dec-test-conflict-new'
    );
    assert.ok(lineageConflict, 'must flag dec-test-conflict-new superseding dec-test-executing while predecessor is still executing');
    assert.ok(lineageConflict!.message.includes('predecessor execution is still active'), 'explanatory warning message present');
  });

    await runTest('13. Empty DecisionStore returns [] without synthetic fallback', async () => {
      const storeInstance = DecisionStore.getInstance();
      const origList = storeInstance.list.bind(storeInstance);
      storeInstance.list = async () => [];
      try {
        const stateStore = CompanyStateStore.getInstance();
        const decisions = await stateStore.getDecisions();
        assert.ok(Array.isArray(decisions), 'getDecisions() must return an array');
        assert.strictEqual(decisions.length, 0, 'Must return [] when store is empty (no synthetic INITIAL_COMPANY_DECISIONS)');
      } finally {
        storeInstance.list = origList;
      }
    });

    await runTest('14. Prompt serialization semantic fidelity for advisor and employee prompts', async () => {
      const canonicalContext = await CompanyContextProvider.getCanonicalContext();

      // Advisor prompt
      const advisorPrompt = CompanyContextProvider.formatForAdvisorPrompt(canonicalContext);
      assert.ok(advisorPrompt.includes('Active Commitments (Binding):'), 'Advisor prompt contains Active section');
      assert.ok(advisorPrompt.includes('dec-test-approved'), 'Active section includes approved decision');
      assert.ok(advisorPrompt.includes('Pending Governance (Awaiting Founder Ratification — NOT Operational Ground Truth):'), 'Advisor prompt contains Pending Governance section');
      assert.ok(advisorPrompt.includes('NOT Operational Ground Truth'), 'Pending Governance explicitly flags NOT Ground Truth');
      assert.ok(advisorPrompt.includes('Operational Interventions Required (EXECUTION HALTED — Immediate Founder/Operator Action Needed):'), 'Advisor prompt contains Interventions section');
      assert.ok(advisorPrompt.includes('EXECUTION HALTED'), 'Interventions explicitly marks EXECUTION HALTED');
      assert.ok(advisorPrompt.includes('Historical Precedents'), 'Advisor prompt contains Historical section');
      assert.ok(advisorPrompt.includes('Superseded Decisions'), 'Advisor prompt contains Superseded section');
      assert.ok(advisorPrompt.includes('dec-test-superseded'), 'Superseded section includes dec-test-superseded');

      // Employee role context
      const employeeContext = CompanyContextProvider.formatForEmployeeRoleContext('pm', canonicalContext);
      assert.ok(employeeContext.includes('ACTIVE COMPANY COMMITMENTS & GOVERNANCE BOUNDARIES'), 'Employee context contains Active section');
      assert.ok(employeeContext.includes('OPERATIONAL INTERVENTIONS REQUIRED (EXECUTION HALTED'), 'Employee context contains Interventions section');
      assert.ok(employeeContext.includes('[HALT]'), 'Employee context marks interventions with [HALT]');
      assert.ok(employeeContext.includes('SUPERSEDED DECISIONS (DEPRECATED LINEAGE — DO NOT EXECUTE)'), 'Employee context contains Superseded section');
    });

    await runTest('15. Authorization hardening for Founder, Worker, and startExecution mutations', async () => {
      const lifecycle = DecisionLifecycleService.getInstance();

      // 15a. Founder unauthenticated rejection (caller without userContext fails closed, F-03)
      await assert.rejects(
        async () => {
          await lifecycle.approveDecision({
            decisionId: 'dec-test-pending',
            expectedStateVersion: 1,
            actor: 'founder',
            reason: 'Attempted unauthenticated approval',
            userContext: undefined, // Missing userContext!
          });
        },
        (err: any) => err instanceof UnauthorizedDecisionActionError,
        'Must reject approval when userContext is missing (no string fallback)'
      );

      // 15b. Client-sourced role spoofing rejection (F-03)
      await assert.rejects(
        async () => {
          await lifecycle.approveDecision({
            decisionId: 'dec-test-pending',
            expectedStateVersion: 1,
            actor: 'attacker',
            reason: 'Attempted spoofed approval',
            userContext: { role: 'FOUNDER', userId: 'attacker', source: 'client' }, // Rejected source: client
          });
        },
        (err: any) => err instanceof UnauthorizedDecisionActionError,
        'Must reject approval with source: client'
      );

      // 15c. Worker unauthenticated string prefix rejection (F-02)
      await assert.rejects(
        async () => {
          await lifecycle.resolveDecision({
            decisionId: 'dec-test-executing',
            expectedStateVersion: 3,
            actor: 'worker-123',
            reason: 'Attempted prefix spoof resolution',
            outcome: {
              outcomeSummary: 'Resolved',
              resolvedAt: new Date().toISOString(),
              resolvedBy: 'worker-123',
            },
            userContext: undefined, // Missing capability and workflow context!
          });
        },
        (err: any) => err instanceof UnauthorizedDecisionActionError,
        'Must reject worker resolution based only on worker- prefix'
      );

      // 15d. Worker cross-workflow instance rejection (F-02)
      await assert.rejects(
        async () => {
          await lifecycle.resolveDecision({
            decisionId: 'dec-test-executing', // linkedWorkflowId is 'wf-billing-migration-01'
            expectedStateVersion: 3,
            actor: 'workflow_worker',
            reason: 'Cross-workflow resolution attempt',
            outcome: {
              outcomeSummary: 'Cross-workflow',
              resolvedAt: new Date().toISOString(),
              resolvedBy: 'workflow_worker',
            },
            userContext: {
              role: 'WORKFLOW_WORKER',
              workflowInstanceId: 'wf-other-workflow-999', // Mismatched workflow instance!
            },
          });
        },
        (err: any) => err instanceof UnauthorizedDecisionActionError,
        'Must reject worker resolution from mismatched workflow instance'
      );

      // 15e. startExecution actor authorization gate (F-04)
      await assert.rejects(
        async () => {
          await lifecycle.startExecution({
            decisionId: 'dec-test-approved',
            expectedStateVersion: 2,
            actor: 'unauthorized_agent',
            reason: 'Start execution attempt',
            linkedWorkflowId: 'wf-unauth-start',
            userContext: undefined,
          });
        },
        (err: any) => err instanceof UnauthorizedDecisionActionError,
        'startExecution must require authorized actor'
      );

      // 15f. Legitimate startExecution with authorized Founder succeeds (F-04)
      const execRes = await lifecycle.startExecution({
        decisionId: 'dec-test-approved',
        expectedStateVersion: 2,
        actor: 'founder',
        reason: 'Authorized execution start',
        linkedWorkflowId: 'wf-authorized-exec',
        userContext: { role: 'FOUNDER', userId: 'founder', source: 'session' },
      });
      assert.strictEqual(execRes.status, 'executing', 'Status successfully transitions to executing');
      assert.strictEqual(execRes.linkedWorkflowId, 'wf-authorized-exec', 'Linked workflow ID correctly recorded');
    });
  } finally {
    process.chdir(originalCwd);
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch {}
    DurableFileStore.resetInstance();
    DecisionStore.resetInstance();
    DecisionContextProvider.resetInstance();
    CompanyStateStore.resetInstance();
  }

  console.log('\n======================================================');
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;
  console.log(`PHASE 2.2.1 TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
