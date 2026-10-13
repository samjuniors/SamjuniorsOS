/**
 * SamJuniorsOS — Native Decision Workflow
 * Phase 2.1 Deterministic Test Suite
 *
 * Exercises:
 *  1. Deterministic seed migration and duplicate-seed prevention
 *  2. Idempotent creation (same creationRequestId returns existing)
 *  3. Distinct decisions with identical titles have separate IDs
 *  4. Valid lifecycle transitions (proposed -> under_review -> pending_approval -> approved -> executing -> resolved)
 *  5. Rejection of illegal transitions (proposed -> executing, rejected -> approved, etc.)
 *  6. Optimistic concurrency control (stale stateVersion rejection)
 *  7. Concurrent transition serialization
 *  8. Strict Founder authorization (AI employees rejected, Founder accepted)
 *  9. Cryptographic approval payload binding (material tamper detection)
 * 10. Epistemic evidence validation (missing facts and stale/superseded facts)
 * 11. Mandatory outcome record on resolution
 * 12. Supersession while execution is pending
 * 13. Durable disk persistence and process restart recovery
 * 14. Immutable creation fields enforcement
 * 15. Backward-compatible CompanyStateStore adapter integration
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';
import { DecisionStore } from '../../src/lib/server/decision/store';
import { DecisionLifecycleService } from '../../src/lib/server/decision/lifecycle';
import {
  InvalidDecisionTransitionError,
  DecisionVersionConflictError,
  UnauthorizedDecisionActionError,
  InvalidDecisionEvidenceError,
  MissingOutcomeError,
  DecisionApprovalPayloadMismatchError,
} from '../../src/lib/server/decision/errors';
import { EpistemicClaimStore } from '../../src/lib/server/epistemic/claim-store';
import { CanonicalFact } from '../../src/types/epistemic';
import { CompanyStateStore } from '../../src/lib/server/state/state-store';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    failed++;
  }
}

function resetSingletons() {
  (DurableFileStore as any).instance = undefined;
  (DecisionStore as any).instance = null;
  (DecisionLifecycleService as any).instance = null;
  (EpistemicClaimStore as any).instance = null;
  (CompanyStateStore as any).instance = null;
}

async function main() {
  console.log('\n==================================================================');
  console.log('SAMJUNIORS-OS: PHASE 2.1 DECISION STORE & LIFECYCLE FOUNDATION');
  console.log('==================================================================\n');

  const originalCwd = process.cwd();
  const tempTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-dec-test-'));

  process.chdir(tempTestRoot);
  resetSingletons();

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Deterministic Seed Migration & Non-duplication on Restart
    // -------------------------------------------------------------------------
    await runTest('Test 1: Seed migration initializes dec-1, dec-2, dec-3 without duplication on restart', async () => {
      const store = DecisionStore.getInstance();
      const all = await store.list();

      assert.strictEqual(all.length, 3, 'Should seed exactly 3 canonical decisions');
      const dec1 = await store.get('dec-1');
      const dec2 = await store.get('dec-2');
      const dec3 = await store.get('dec-3');

      assert.ok(dec1, 'dec-1 must exist');
      assert.strictEqual(dec1?.status, 'pending_approval');
      assert.strictEqual(dec1?.stateVersion, 1);

      assert.ok(dec2, 'dec-2 must exist');
      assert.strictEqual(dec2?.status, 'approved');
      assert.strictEqual(dec2?.stateVersion, 2);
      assert.ok(dec2?.approvedPayloadHash, 'dec-2 must have approvedPayloadHash');

      assert.ok(dec3, 'dec-3 must exist');
      assert.strictEqual(dec3?.status, 'approved');

      // Restart store instance
      (DecisionStore as any).instance = null;
      const reloadedStore = DecisionStore.getInstance();
      const reloaded = await reloadedStore.list();
      assert.strictEqual(reloaded.length, 3, 'Restart must not duplicate seeds');
    });

    // -------------------------------------------------------------------------
    // TEST 2: Idempotent Creation (Same creationRequestId Returns Existing)
    // -------------------------------------------------------------------------
    await runTest('Test 2: Idempotent creation returns existing decision on identical creationRequestId', async () => {
      const service = DecisionLifecycleService.getInstance();
      const reqId = 'req-pricing-pilot-001';

      const d1 = await service.proposeDecision({
        creationRequestId: reqId,
        title: 'Launch Enterprise Pricing Pilot',
        problemStatement: 'Current pricing tiers do not capture high-volume API demand.',
        proposedAction: 'Roll out pilot tier at $0.04/1k tokens for 5 enterprise partners.',
        category: 'financial',
        proposer: 'coo',
        impact: 'high',
        reversibility: 'reversible',
      });

      assert.ok(d1.decisionId);
      assert.strictEqual(d1.status, 'proposed');
      assert.strictEqual(d1.stateVersion, 1);

      // Repeat with identical creationRequestId
      const d2 = await service.proposeDecision({
        creationRequestId: reqId,
        title: 'Launch Enterprise Pricing Pilot (Duplicate Call)',
        problemStatement: 'Altered statement on duplicate request',
        proposedAction: 'Altered action',
        category: 'financial',
        proposer: 'coo',
      });

      assert.strictEqual(d2.decisionId, d1.decisionId, 'Must return same decisionId');
      assert.strictEqual(d2.title, d1.title, 'Must preserve original title');
      assert.strictEqual(d2.stateVersion, d1.stateVersion);
    });

    // -------------------------------------------------------------------------
    // TEST 3: Distinct Decisions with Identical Titles Have Distinct Identities
    // -------------------------------------------------------------------------
    await runTest('Test 3: Distinct creationRequestIds with identical titles create distinct decisions', async () => {
      const service = DecisionLifecycleService.getInstance();

      const d1 = await service.proposeDecision({
        creationRequestId: 'req-distinct-title-A',
        title: 'Adopt Shared Compute Strategy',
        problemStatement: 'Resource pooling evaluation.',
        proposedAction: 'Evaluate Kubernetes cluster sharing.',
        category: 'strategic',
        proposer: 'researcher',
      });

      const d2 = await service.proposeDecision({
        creationRequestId: 'req-distinct-title-B',
        title: 'Adopt Shared Compute Strategy',
        problemStatement: 'Resource pooling evaluation for second team.',
        proposedAction: 'Evaluate container isolation.',
        category: 'strategic',
        proposer: 'researcher',
      });

      assert.notStrictEqual(d1.decisionId, d2.decisionId, 'Decisions must have unique IDs');
      assert.strictEqual(d1.title, d2.title, 'Titles match but identities remain distinct');
    });

    // -------------------------------------------------------------------------
    // TEST 4: Full Valid Lifecycle (proposed -> under_review -> pending_approval -> approved -> executing -> resolved)
    // -------------------------------------------------------------------------
    await runTest('Test 4: Full valid decision lifecycle execution path', async () => {
      const service = DecisionLifecycleService.getInstance();

      // 1. Propose
      let d = await service.proposeDecision({
        creationRequestId: 'req-lifecycle-full',
        title: 'Automate Billing Telemetry Sync',
        problemStatement: 'Stripe webhook delays cause manual verification toil.',
        proposedAction: 'Implement real-time webhook ingestion with 3-retry queue.',
        category: 'operational',
        proposer: 'pm',
        accountableOwner: 'founder',
        impact: 'medium',
        reversibility: 'reversible',
      });
      assert.strictEqual(d.status, 'proposed');
      assert.strictEqual(d.stateVersion, 1);

      // 2. Review
      d = await service.reviewDecision({
        decisionId: d.decisionId,
        expectedStateVersion: d.stateVersion,
        actor: 'coo',
        reason: 'Technical feasibility reviewed and approved by engineering team',
      });
      assert.strictEqual(d.status, 'under_review');
      assert.strictEqual(d.stateVersion, 2);

      // 3. Submit for approval
      d = await service.submitForApproval({
        decisionId: d.decisionId,
        expectedStateVersion: d.stateVersion,
        actor: 'pm',
        reason: 'Ready for executive Founder sign-off',
      });
      assert.strictEqual(d.status, 'pending_approval');
      assert.strictEqual(d.stateVersion, 3);

      // 4. Approve (Founder)
      d = await service.approveDecision({
        decisionId: d.decisionId,
        expectedStateVersion: d.stateVersion,
        actor: 'founder',
        reason: 'Authorized billing automation rollout',
      });
      assert.strictEqual(d.status, 'approved');
      assert.strictEqual(d.stateVersion, 4);
      assert.strictEqual(d.decidedBy, 'founder');
      assert.ok(d.approvedPayloadHash, 'approvedPayloadHash must be present');

      // 5. Start Execution
      d = await service.startExecution({
        decisionId: d.decisionId,
        expectedStateVersion: d.stateVersion,
        actor: 'system',
        linkedWorkflowId: 'wf-stripe-sync-01',
        reason: 'Initiating workflow dispatch',
      });
      assert.strictEqual(d.status, 'executing');
      assert.strictEqual(d.stateVersion, 5);
      assert.strictEqual(d.linkedWorkflowId, 'wf-stripe-sync-01');

      // 6. Resolve with verified outcome
      d = await service.resolveDecision({
        decisionId: d.decisionId,
        expectedStateVersion: d.stateVersion,
        actor: 'founder',
        reason: 'Workflow verified in staging and production',
        outcome: {
          outcomeSummary: 'Webhook queue successfully handling Stripe billing events with 0 drops.',
          resolvedAt: new Date().toISOString(),
          resolvedBy: 'founder',
        },
      });
      assert.strictEqual(d.status, 'resolved');
      assert.strictEqual(d.stateVersion, 6);
      assert.ok(d.outcome?.outcomeSummary.includes('Webhook queue successfully'));
      assert.strictEqual(d.transitions.length, 6);
    });

    // -------------------------------------------------------------------------
    // TEST 5: Illegal Transition Rejection (FSM Enforcement)
    // -------------------------------------------------------------------------
    await runTest('Test 5: Rejects illegal state transitions', async () => {
      const service = DecisionLifecycleService.getInstance();

      const d = await service.proposeDecision({
        creationRequestId: 'req-illegal-transitions',
        title: 'Evaluate Vector Database Migration',
        problemStatement: 'Evaluating retrieval options.',
        proposedAction: 'Do not migrate to vector DB per architecture rules.',
        category: 'strategic',
        proposer: 'researcher',
      });

      // 1. proposed cannot jump directly to executing
      await assert.rejects(
        async () => {
          await service.startExecution({
            decisionId: d.decisionId,
            expectedStateVersion: d.stateVersion,
            actor: 'system',
            reason: 'Illegal jump to execution',
          });
        },
        InvalidDecisionTransitionError,
        'proposed -> executing must be rejected'
      );

      // 2. Reject the decision
      const rejected = await service.rejectDecision({
        decisionId: d.decisionId,
        expectedStateVersion: d.stateVersion,
        actor: 'founder',
        reason: 'Vector DB prohibited by company guardrails',
      });
      assert.strictEqual(rejected.status, 'rejected');

      // 3. rejected is terminal; cannot transition to approved or executing
      await assert.rejects(
        async () => {
          await service.approveDecision({
            decisionId: rejected.decisionId,
            expectedStateVersion: rejected.stateVersion,
            actor: 'founder',
            reason: 'Illegal reactivation of rejected decision',
          });
        },
        InvalidDecisionTransitionError,
        'rejected -> approved must be rejected'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 6: Optimistic Concurrency Control (Stale stateVersion Rejection)
    // -------------------------------------------------------------------------
    await runTest('Test 6: Rejects stale stateVersion during update', async () => {
      const service = DecisionLifecycleService.getInstance();

      const d = await service.proposeDecision({
        creationRequestId: 'req-concurrency-version',
        title: 'Harden Sandbox Environment',
        problemStatement: 'Isolation check.',
        proposedAction: 'Enforce process limits.',
        category: 'governance',
        proposer: 'coo',
      });

      // Valid update increments version from 1 -> 2
      await service.reviewDecision({
        decisionId: d.decisionId,
        expectedStateVersion: 1,
        actor: 'coo',
        reason: 'Review 1',
      });

      // Contender attempts update using stale version 1
      await assert.rejects(
        async () => {
          await service.submitForApproval({
            decisionId: d.decisionId,
            expectedStateVersion: 1, // Stale! Actual is 2
            actor: 'pm',
            reason: 'Contender submit with stale version',
          });
        },
        DecisionVersionConflictError,
        'Stale expectedStateVersion must throw DecisionVersionConflictError'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 7: Strict Founder Authorization Checks
    // -------------------------------------------------------------------------
    await runTest('Test 7: Prohibits AI agents and unverified roles from approving or rejecting', async () => {
      const service = DecisionLifecycleService.getInstance();

      const d = await service.proposeDecision({
        creationRequestId: 'req-auth-checks',
        title: 'Authorize Marketing Budget Reallocation',
        problemStatement: 'Need to shift $5,000 to search campaign.',
        proposedAction: 'Reallocate budget from events to search.',
        category: 'financial',
        proposer: 'pm',
        initialStatus: 'pending_approval',
      });

      // AI employee "coo" tries to self-approve
      await assert.rejects(
        async () => {
          await service.approveDecision({
            decisionId: d.decisionId,
            expectedStateVersion: d.stateVersion,
            actor: 'coo',
            reason: 'Agent self-approval attempt',
          });
        },
        UnauthorizedDecisionActionError,
        'AI employee coo must be rejected from approving'
      );

      // AI employee "finance" tries to reject
      await assert.rejects(
        async () => {
          await service.rejectDecision({
            decisionId: d.decisionId,
            expectedStateVersion: d.stateVersion,
            actor: 'finance',
            reason: 'Agent rejection attempt',
          });
        },
        UnauthorizedDecisionActionError,
        'AI employee finance must be rejected from rejecting'
      );

      // Verified Founder succeeds
      const approved = await service.approveDecision({
        decisionId: d.decisionId,
        expectedStateVersion: d.stateVersion,
        actor: 'founder',
        reason: 'Founder authorized reallocation',
      });
      assert.strictEqual(approved.status, 'approved');
      assert.strictEqual(approved.decidedBy, 'founder');
    });

    // -------------------------------------------------------------------------
    // TEST 8: Cryptographic Payload Binding & Tamper Detection
    // -------------------------------------------------------------------------
    await runTest('Test 8: Detects payload tampering between approval and execution', async () => {
      const service = DecisionLifecycleService.getInstance();
      const store = DecisionStore.getInstance();

      const d = await service.proposeDecision({
        creationRequestId: 'req-tamper-detection',
        title: 'Approve Contractor SOW',
        problemStatement: 'Hiring external security auditor for 2 weeks.',
        proposedAction: 'Authorize $8,000 spend for security audit.',
        category: 'governance',
        proposer: 'coo',
        initialStatus: 'pending_approval',
      });

      const approved = await service.approveDecision({
        decisionId: d.decisionId,
        expectedStateVersion: d.stateVersion,
        actor: 'founder',
        reason: 'Approved $8,000 audit',
      });

      assert.ok(approved.approvedPayloadHash);

      // Tamper: simulate unauthorized mutation of proposedAction on disk
      await store.update(approved.decisionId, approved.stateVersion, (draft) => {
        draft.proposedAction = 'Authorize $50,000 spend for security audit.'; // Tampered!
        return draft;
      });

      // Attempt to start execution should FAIL with DecisionApprovalPayloadMismatchError
      await assert.rejects(
        async () => {
          await service.startExecution({
            decisionId: approved.decisionId,
            expectedStateVersion: approved.stateVersion + 1,
            actor: 'system',
            reason: 'Attempt execution on tampered decision',
          });
        },
        DecisionApprovalPayloadMismatchError,
        'Tampered proposedAction must fail cryptographic approval binding verification'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 9: Epistemic Evidence Validation (Missing & Stale Facts)
    // -------------------------------------------------------------------------
    await runTest('Test 9: Validates evidence facts; detects missing and superseded facts', async () => {
      const service = DecisionLifecycleService.getInstance();
      const claimStore = EpistemicClaimStore.getInstance();

      // Seed an active fact
      const activeFact: CanonicalFact = {
        id: 'fact-active-01',
        claimId: 'claim-01',
        statement: 'Unit token cost is $0.18 per onboarding run.',
        subject: 'cost',
        category: 'financial',
        validityState: 'active',
        confidence: 'verified_fact',
        promotedAt: new Date().toISOString(),
        promotedBy: 'finance',
        provenance: { sourceId: 'src-01', traceId: 'tr-01' } as any,
      };
      await claimStore.saveFact(activeFact);

      // Seed a superseded fact
      const supersededFact: CanonicalFact = {
        id: 'fact-superseded-01',
        claimId: 'claim-02',
        statement: 'Legacy gross margin target was 70%.',
        subject: 'margin',
        category: 'financial',
        validityState: 'superseded',
        supersededById: 'fact-margin-80',
        confidence: 'verified_fact',
        promotedAt: new Date().toISOString(),
        promotedBy: 'finance',
        provenance: { sourceId: 'src-02', traceId: 'tr-02' } as any,
      };
      await claimStore.saveFact(supersededFact);

      // 1. Missing fact fails approval
      const dMissing = await service.proposeDecision({
        creationRequestId: 'req-missing-fact',
        title: 'Decision with Missing Fact',
        problemStatement: 'Problem statement',
        proposedAction: 'Proposed action',
        category: 'strategic',
        proposer: 'coo',
        evidenceFactIds: ['fact-non-existent-999'],
        initialStatus: 'pending_approval',
      });

      await assert.rejects(
        async () => {
          await service.approveDecision({
            decisionId: dMissing.decisionId,
            expectedStateVersion: dMissing.stateVersion,
            actor: 'founder',
            reason: 'Approval attempt with missing fact',
          });
        },
        InvalidDecisionEvidenceError,
        'Missing evidence fact must fail approval'
      );

      // 2. Superseded fact fails approval without explicit allowStaleEvidence
      const dStale = await service.proposeDecision({
        creationRequestId: 'req-stale-fact',
        title: 'Decision with Superseded Fact',
        problemStatement: 'Problem statement',
        proposedAction: 'Proposed action',
        category: 'financial',
        proposer: 'finance',
        evidenceFactIds: ['fact-superseded-01'],
        initialStatus: 'pending_approval',
      });

      await assert.rejects(
        async () => {
          await service.approveDecision({
            decisionId: dStale.decisionId,
            expectedStateVersion: dStale.stateVersion,
            actor: 'founder',
            reason: 'Attempt approval with stale fact without override',
          });
        },
        InvalidDecisionEvidenceError,
        'Superseded fact must fail approval without allowStaleEvidence=true'
      );

      // 3. With explicit allowStaleEvidence: true, approval succeeds with warning recorded
      const approvedWithStale = await service.approveDecision({
        decisionId: dStale.decisionId,
        expectedStateVersion: dStale.stateVersion,
        actor: 'founder',
        reason: 'Founder consciously acknowledges historical superseded fact',
        allowStaleEvidence: true,
      });
      assert.strictEqual(approvedWithStale.status, 'approved');

      // 4. Decision with active fact succeeds cleanly
      const dActive = await service.proposeDecision({
        creationRequestId: 'req-active-fact',
        title: 'Decision with Active Fact',
        problemStatement: 'Problem statement',
        proposedAction: 'Proposed action',
        category: 'financial',
        proposer: 'finance',
        evidenceFactIds: ['fact-active-01'],
        initialStatus: 'pending_approval',
      });

      const approvedActive = await service.approveDecision({
        decisionId: dActive.decisionId,
        expectedStateVersion: dActive.stateVersion,
        actor: 'founder',
        reason: 'Approved with validated active evidence',
      });
      assert.strictEqual(approvedActive.status, 'approved');
    });

    // -------------------------------------------------------------------------
    // TEST 10: Mandatory Outcome Record on Resolution
    // -------------------------------------------------------------------------
    await runTest('Test 10: Enforces mandatory outcome record for resolved status', async () => {
      const service = DecisionLifecycleService.getInstance();

      const d = await service.proposeDecision({
        creationRequestId: 'req-outcome-check',
        title: 'Deploy New Telemetry Dashboard',
        problemStatement: 'Observability gap.',
        proposedAction: 'Deploy dashboard.',
        category: 'operational',
        proposer: 'pm',
        initialStatus: 'pending_approval',
      });

      const approved = await service.approveDecision({
        decisionId: d.decisionId,
        expectedStateVersion: d.stateVersion,
        actor: 'founder',
        reason: 'Approved',
      });

      const executing = await service.startExecution({
        decisionId: approved.decisionId,
        expectedStateVersion: approved.stateVersion,
        actor: 'system',
        reason: 'Executing',
      });

      // Attempt resolution with empty outcome
      await assert.rejects(
        async () => {
          await service.resolveDecision({
            decisionId: executing.decisionId,
            expectedStateVersion: executing.stateVersion,
            actor: 'founder',
            reason: 'Resolve without outcome',
            outcome: {
              outcomeSummary: '', // Empty!
              resolvedAt: new Date().toISOString(),
              resolvedBy: 'founder',
            },
          });
        },
        MissingOutcomeError,
        'Empty outcomeSummary must be rejected'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 11: Supersession While Execution is Pending
    // -------------------------------------------------------------------------
    await runTest('Test 11: Superseding a decision while execution is pending', async () => {
      const service = DecisionLifecycleService.getInstance();

      // Original decision in executing state
      const dOld = await service.proposeDecision({
        creationRequestId: 'req-supersede-old',
        title: 'Policy: 2-Day Review Cycle',
        problemStatement: 'Speed up review.',
        proposedAction: 'Enforce 48-hour turnarounds.',
        category: 'governance',
        proposer: 'coo',
        initialStatus: 'pending_approval',
      });
      const dOldAppr = await service.approveDecision({
        decisionId: dOld.decisionId,
        expectedStateVersion: dOld.stateVersion,
        actor: 'founder',
        reason: 'Approved',
      });
      const dOldExec = await service.startExecution({
        decisionId: dOldAppr.decisionId,
        expectedStateVersion: dOldAppr.stateVersion,
        actor: 'system',
        reason: 'Rollout begun',
      });

      // Successor decision
      const dNew = await service.proposeDecision({
        creationRequestId: 'req-supersede-new',
        title: 'Policy: Same-Day Asynchronous Review Cycle',
        problemStatement: '48 hours is too slow.',
        proposedAction: 'Enforce same-day turnaround.',
        category: 'governance',
        proposer: 'founder',
      });

      // Supersede old decision with new decision
      const { superseded, successor } = await service.supersedeDecision({
        decisionId: dOldExec.decisionId,
        expectedStateVersion: dOldExec.stateVersion,
        supersededByDecisionId: dNew.decisionId,
        actor: 'founder',
        reason: 'Accelerating review policy to same-day',
      });

      assert.strictEqual(superseded.status, 'superseded');
      assert.strictEqual(superseded.supersededByDecisionId, dNew.decisionId);
      assert.strictEqual(successor.supersedesDecisionId, dOldExec.decisionId);
    });

    // -------------------------------------------------------------------------
    // TEST 12: Durability and Crash Recovery
    // -------------------------------------------------------------------------
    await runTest('Test 12: State persists to disk and survives process restart / cache clear', async () => {
      const service = DecisionLifecycleService.getInstance();

      const d = await service.proposeDecision({
        creationRequestId: 'req-durability-test',
        title: 'Durable Audit Record Test',
        problemStatement: 'Verify disk recovery.',
        proposedAction: 'Ensure state survives restart.',
        category: 'governance',
        proposer: 'coo',
      });

      // Clear in-memory caches and re-instantiate store from disk
      (DecisionStore as any).instance = null;
      (DecisionLifecycleService as any).instance = null;

      const restoredStore = DecisionStore.getInstance();
      const restored = await restoredStore.get(d.decisionId);

      assert.ok(restored, 'Decision must be restored from disk');
      assert.strictEqual(restored?.decisionId, d.decisionId);
      assert.strictEqual(restored?.title, d.title);
      assert.strictEqual(restored?.status, 'proposed');
      assert.strictEqual(restored?.stateVersion, 1);
    });

    // -------------------------------------------------------------------------
    // TEST 13: Immutable Creation Fields Enforcement
    // -------------------------------------------------------------------------
    await runTest('Test 13: Enforces immutability of creation attributes during updates', async () => {
      const store = DecisionStore.getInstance();
      const service = DecisionLifecycleService.getInstance();

      const d = await service.proposeDecision({
        creationRequestId: 'req-immutable-fields',
        title: 'Immutable Integrity Test',
        problemStatement: 'Verify creation fields cannot be tampered with.',
        proposedAction: 'Lock creation fields.',
        category: 'operational',
        proposer: 'researcher',
      });

      // Try mutating proposer
      await assert.rejects(
        async () => {
          await store.update(d.decisionId, d.stateVersion, (draft) => {
            (draft as any).proposer = 'attacker';
            return draft;
          });
        },
        /Immutable field violation/,
        'Mutating proposer must throw immutable field violation'
      );

      // Try mutating createdAt
      await assert.rejects(
        async () => {
          await store.update(d.decisionId, d.stateVersion, (draft) => {
            draft.createdAt = '1970-01-01T00:00:00.000Z';
            return draft;
          });
        },
        /Immutable field violation/,
        'Mutating createdAt must throw immutable field violation'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 14: CompanyStateStore Adapter Compatibility
    // -------------------------------------------------------------------------
    await runTest('Test 14: CompanyStateStore integrates cleanly with DecisionStore via adapter', async () => {
      const companyStateStore = CompanyStateStore.getInstance();
      const decisions = await companyStateStore.getDecisions();

      assert.ok(Array.isArray(decisions), 'getDecisions must return an array');
      assert.ok(decisions.length >= 3, 'Must contain at least the 3 canonical decisions');

      const dec1 = decisions.find((d) => d.id === 'dec-1');
      assert.ok(dec1, 'dec-1 must be returned in CompanyDecision format');
      assert.strictEqual(dec1?.category, 'Strategic');
      assert.strictEqual(dec1?.status, 'pending_approval');
      assert.strictEqual(dec1?.founderApprovalRequired, true);

      // Test recordDecision back-propagation
      await companyStateStore.recordDecision({
        id: 'dec-legacy-test',
        title: 'Legacy API Recorded Decision',
        status: 'approved',
        category: 'Product',
        recommendedBy: 'Sophia Vance',
        agentId: 'coo',
        recommendation: 'Launch feature flag.',
        businessImpact: 'Improves rollout safety.',
        evidenceSummary: 'Benchmark results.',
        date: 'Today',
        founderApprovalRequired: false,
      });

      const updated = await companyStateStore.getDecisions();
      const found = updated.find((d) => d.id === 'dec-legacy-test');
      assert.ok(found, 'Legacy recorded decision must be reflected in getDecisions');
      assert.strictEqual(found?.title, 'Legacy API Recorded Decision');
    });

    // -------------------------------------------------------------------------
    // TEST 15: Concurrent Creation Under Collection Lock
    // -------------------------------------------------------------------------
    await runTest('Test 15: Concurrent creation requests serialize cleanly without lost records', async () => {
      const service = DecisionLifecycleService.getInstance();
      const store = DecisionStore.getInstance();

      const promises = Array.from({ length: 5 }, (_, i) =>
        service.proposeDecision({
          creationRequestId: `req-concurrent-create-${i}`,
          title: `Concurrent Decision ${i}`,
          problemStatement: `Problem ${i}`,
          proposedAction: `Action ${i}`,
          category: 'operational',
          proposer: 'coo',
        })
      );

      const results = await Promise.all(promises);
      assert.strictEqual(results.length, 5, 'All 5 concurrent creations must succeed');

      const all = await store.list();
      for (let i = 0; i < 5; i++) {
        const found = all.find((d) => d.creationRequestId === `req-concurrent-create-${i}`);
        assert.ok(found, `Concurrent decision ${i} must exist in store`);
      }
    });

    // -------------------------------------------------------------------------
    // TEST 16: Concurrent Transition Serialization & Version Conflict
    // -------------------------------------------------------------------------
    await runTest('Test 16: Concurrent transition attempts on same stateVersion yield exactly 1 winner and 1 conflict', async () => {
      const service = DecisionLifecycleService.getInstance();

      const d = await service.proposeDecision({
        creationRequestId: 'req-concurrent-trans',
        title: 'Concurrent Transition Target',
        problemStatement: 'Testing concurrent transitions',
        proposedAction: 'Action',
        category: 'governance',
        proposer: 'pm',
      });

      assert.strictEqual(d.stateVersion, 1);

      // Launch 2 simultaneous transition requests with expectedStateVersion: 1
      const p1 = service.reviewDecision({
        decisionId: d.decisionId,
        expectedStateVersion: 1,
        actor: 'coo',
        reason: 'Contender 1: move to review',
      });

      const p2 = service.submitForApproval({
        decisionId: d.decisionId,
        expectedStateVersion: 1,
        actor: 'pm',
        reason: 'Contender 2: move to pending_approval',
      });

      const settled = await Promise.allSettled([p1, p2]);
      const fulfilled = settled.filter((s) => s.status === 'fulfilled');
      const rejected = settled.filter((s) => s.status === 'rejected');

      assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent transition must succeed');
      assert.strictEqual(rejected.length, 1, 'Exactly one concurrent transition must fail');
      assert.ok(
        (rejected[0] as PromiseRejectedResult).reason instanceof DecisionVersionConflictError,
        'Failed transition must be a DecisionVersionConflictError'
      );
    });

    // -------------------------------------------------------------------------
    // TEST 17: Audit Trail Integration
    // -------------------------------------------------------------------------
    await runTest('Test 17: Transitions write durable audit records to InMemoryAuditStore', async () => {
      const { InMemoryAuditStore } = await import(
        '../../src/lib/server/authorization/approval-store'
      );
      const auditStore = InMemoryAuditStore.getInstance();
      const service = DecisionLifecycleService.getInstance();

      const d = await service.proposeDecision({
        creationRequestId: 'req-audit-verify',
        title: 'Audit Recording Verification Decision',
        problemStatement: 'Problem statement',
        proposedAction: 'Proposed action',
        category: 'strategic',
        proposer: 'coo',
        initialStatus: 'pending_approval',
      });

      await service.approveDecision({
        decisionId: d.decisionId,
        expectedStateVersion: d.stateVersion,
        actor: 'founder',
        reason: 'Approved for audit verification',
      });

      const audits = await auditStore.list();
      const matching = audits.filter(
        (a) => a.target?.metadata?.decisionId === d.decisionId
      );

      assert.ok(matching.length >= 2, 'Must record audit entries for creation and approval');
      const approvalAudit = matching.find((a) => a.actionName === 'decision.approved');
      assert.ok(approvalAudit, 'decision.approved audit record must exist');
      assert.strictEqual(approvalAudit?.decision, 'approved');
      assert.strictEqual(approvalAudit?.target?.targetSystem, 'decision_store');
    });

    // -------------------------------------------------------------------------
    // TEST 18: Corrupted Collection Quarantine Protection
    // -------------------------------------------------------------------------
    await runTest('Test 18: Corrupted decisions.json fails closed and quarantines file', async () => {
      const store = DecisionStore.getInstance();
      const dataDir = DurableFileStore.getInstance().getDataDir();
      const decisionsPath = path.join(dataDir, 'decisions.json');

      assert.ok(fs.existsSync(decisionsPath), 'decisions.json must exist');

      // Write corrupted JSON into decisions.json
      fs.writeFileSync(decisionsPath, 'CORRUPTED_NON_JSON_DATA{{{', 'utf-8');

      // Re-instantiate store: reading corrupted file must throw CriticalCollectionCorruptionError
      (DecisionStore as any).instance = null;
      let caughtError: any = null;
      try {
        DecisionStore.getInstance();
      } catch (err: any) {
        caughtError = err;
      }
      assert.ok(caughtError, 'Reading corrupted decisions collection must fail closed and quarantine');
      assert.strictEqual(caughtError.name, 'CriticalCollectionCorruptionError');
      assert.ok(caughtError.message.includes('Critical collection "decisions" is corrupt'));

      // Verify quarantine file was created
      const dirFiles = fs.readdirSync(dataDir);
      const quarantineFile = dirFiles.find((f) => f.startsWith('decisions.json.corrupt.'));
      assert.ok(quarantineFile, 'Quarantine file must be created preserving corrupted bytes');
    });

  } finally {
    process.chdir(originalCwd);
    resetSingletons();
    try {
      fs.rmSync(tempTestRoot, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n------------------------------------------------------------------');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log('------------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
