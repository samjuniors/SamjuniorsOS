import assert from 'assert';
import {
  validateStepTransition,
  validateInstanceTransition,
  isTerminalStepStatus,
  isTerminalInstanceStatus,
  InvalidStateTransitionError,
  ConcurrencyConflictError,
  StepClaimError,
  ApprovalAlreadyConsumedError,
} from '../lib/server/workflow/state-machine';
import {
  InMemoryWorkflowStore,
  PostgresWorkflowStore,
  getWorkflowStore,
} from '../lib/server/workflow/store';
import {
  InMemoryApprovalStore,
  PostgresApprovalStore,
} from '../lib/server/authorization/approval-store';
import { WorkflowRuntime } from '../lib/server/workflow/runtime';
import { WorkflowDefinition, WorkflowInstanceState } from '../types/workflow';
import { FounderApprovalRecord } from '../types/authorization';
import { DatabaseAuthorityError } from '../lib/server/db/authority';

/**
 * ============================================================================
 * SAMJUNIORS OS — PHASE 2.3 TRANSACTIONS & STATE TRANSITIONS TEST SUITE
 * ============================================================================
 *
 * Verifies:
 * 1. State Machine & Transition Invariants
 * 2. Optimistic Concurrency Control (stateVersion increment & conflict rejection)
 * 3. Atomic Worker Step Claiming (single worker lease, non-ready rejection)
 * 4. Atomic Approval Consumption (single-use enforcement, double consumption rejection)
 * 5. Workflow Rehydration (active-only retrieval, chronological ordering)
 * 6. Fail-Closed Invariant in Authoritative Mode
 * 7. WorkflowRuntime End-to-End Atomic Orchestration
 * ============================================================================
 */

async function runTransactionsAndTransitionsSuite() {
  console.log('================================================================');
  console.log('⚡  SAMJUNIORS OS — PHASE 2.3 TRANSACTIONS & TRANSITIONS SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(testName: string) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  }

  function recordFail(testName: string, error: any) {
    console.error(`  ✗ FAIL: ${testName}`);
    console.error(`    ${error?.stack || error?.message || error}`);
    failed++;
  }

  const originalEnv = { ...process.env };

  function resetState() {
    process.env = { ...originalEnv };
    delete process.env.DATABASE_MODE;
    delete process.env.SAMJUNIORS_AUTHORITY_MODE;
    (process.env as any).NODE_ENV = 'test';
    InMemoryWorkflowStore.getInstance().clear();
    InMemoryApprovalStore.getInstance().clear();
  }

  // --- Group 1: State Machine & Transition Rules ---
  console.log('--- Group 1: State Machine & Transition Invariants ---');
  try {
    resetState();

    // Valid step transitions
    validateStepTransition('pending', 'ready');
    validateStepTransition('ready', 'running');
    validateStepTransition('running', 'completed');
    validateStepTransition('running', 'failed');
    validateStepTransition('running', 'blocked');
    validateStepTransition('running', 'awaiting_approval');
    validateStepTransition('waiting', 'ready');
    recordPass('Valid step transitions succeed');

    // Terminal step states cannot transition out
    assert.throws(
      () => validateStepTransition('completed', 'running'),
      (err: any) => err instanceof InvalidStateTransitionError,
      'completed step cannot transition to running'
    );
    assert.throws(
      () => validateStepTransition('cancelled', 'running'),
      (err: any) => err instanceof InvalidStateTransitionError,
      'cancelled step cannot transition to running'
    );
    assert.throws(
      () => validateStepTransition('failed', 'completed'),
      (err: any) => err instanceof InvalidStateTransitionError,
      'failed step cannot transition directly to completed'
    );
    assert.throws(
      () => validateStepTransition('pending', 'completed'),
      (err: any) => err instanceof InvalidStateTransitionError,
      'pending step cannot skip directly to completed'
    );
    recordPass('Illegal step transitions throw InvalidStateTransitionError');

    // Idempotent self-transitions
    validateStepTransition('running', 'running');
    validateStepTransition('completed', 'completed');
    validateInstanceTransition('running', 'running');
    recordPass('Idempotent self-transitions succeed without mutation error');

    // Instance transitions
    validateInstanceTransition('pending', 'running');
    validateInstanceTransition('running', 'completed');
    validateInstanceTransition('running', 'failed');
    assert.throws(
      () => validateInstanceTransition('completed', 'running'),
      (err: any) => err instanceof InvalidStateTransitionError,
      'completed instance cannot transition to running'
    );
    assert.throws(
      () => validateInstanceTransition('failed', 'running'),
      (err: any) => err instanceof InvalidStateTransitionError,
      'failed instance cannot transition to running'
    );
    recordPass('Instance transitions enforce state machine invariants');

    // Terminal state predicate
    assert.strictEqual(isTerminalStepStatus('completed'), true);
    assert.strictEqual(isTerminalStepStatus('failed'), true);
    assert.strictEqual(isTerminalStepStatus('cancelled'), true);
    assert.strictEqual(isTerminalStepStatus('running'), false);
    assert.strictEqual(isTerminalStepStatus('ready'), false);

    assert.strictEqual(isTerminalInstanceStatus('completed'), true);
    assert.strictEqual(isTerminalInstanceStatus('failed'), true);
    assert.strictEqual(isTerminalInstanceStatus('cancelled'), true);
    assert.strictEqual(isTerminalInstanceStatus('running'), false);
    recordPass('Terminal state predicates accurately classify terminal vs active states');
  } catch (err) {
    recordFail('Group 1: State Machine & Transition Invariants', err);
  }

  // --- Group 2: Optimistic Concurrency Control (stateVersion) ---
  console.log('\n--- Group 2: Optimistic Concurrency Control (stateVersion) ---');
  try {
    resetState();
    const store = InMemoryWorkflowStore.getInstance();
    const instanceId = 'test-wf-occ-1';

    const initialInstance: WorkflowInstanceState = {
      instanceId,
      workflowId: 'test-def',
      version: '1.0.0',
      stateVersion: 0,
      objective: 'Test OCC',
      status: 'pending',
      stepStates: {
        'step-1': {
          stepId: 'step-1',
          status: 'ready',
          assignedRole: 'cmo',
          skill: 'content_drafting',
          outputs: {},
          evidenceReferences: [],
          retryCount: 0,
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputs: {},
      evidenceReferences: [],
    };

    await store.saveInstance(initialInstance);

    // Atomic claim at version 0
    const claimResult = await store.claimStepAtomic(instanceId, 'step-1', 'worker-1', 0);
    assert.strictEqual(claimResult.instance.stateVersion, 1, 'stateVersion must increment to 1 on claim');
    assert.strictEqual(claimResult.step.status, 'running');
    assert.strictEqual(claimResult.step.claimedBy, 'worker-1');
    recordPass('Atomic step claim advances stateVersion monotonically');

    // Atomic transition at version 1
    const transitionResult = await store.transitionStepAtomic(
      instanceId,
      'step-1',
      'completed',
      1,
      { outputs: { result: 'ok' } }
    );
    assert.strictEqual(transitionResult.stateVersion, 2, 'stateVersion must increment to 2 on transition');
    assert.strictEqual(transitionResult.stepStates['step-1'].status, 'completed');
    recordPass('Atomic step transition advances stateVersion monotonically');

    // Concurrency conflict rejection
    let conflictThrown = false;
    try {
      await store.transitionStepAtomic(instanceId, 'step-1', 'failed', 0, { error: 'conflict' });
    } catch (err: any) {
      if (err instanceof ConcurrencyConflictError) {
        conflictThrown = true;
        assert.strictEqual(err.expectedVersion, 0);
        assert.strictEqual(err.actualVersion, 2);
      }
    }
    assert.strictEqual(conflictThrown, true, 'Stale expectedVersion must throw ConcurrencyConflictError');
    recordPass('Stale stateVersion transition rejected with ConcurrencyConflictError');
  } catch (err) {
    recordFail('Group 2: Optimistic Concurrency Control', err);
  }

  // --- Group 3: Worker Step Claiming ---
  console.log('\n--- Group 3: Worker Step Claiming ---');
  try {
    resetState();
    const store = InMemoryWorkflowStore.getInstance();
    const instanceId = 'test-wf-claim-race';

    const initialInstance: WorkflowInstanceState = {
      instanceId,
      workflowId: 'test-def',
      version: '1.0.0',
      stateVersion: 0,
      objective: 'Test Claim Race',
      status: 'running',
      stepStates: {
        'step-1': {
          stepId: 'step-1',
          status: 'ready',
          assignedRole: 'cmo',
          skill: 'content_drafting',
          outputs: {},
          evidenceReferences: [],
          retryCount: 0,
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputs: {},
      evidenceReferences: [],
    };

    await store.saveInstance(initialInstance);

    // Worker A claims step
    const claimA = await store.claimStepAtomic(instanceId, 'step-1', 'worker-A', 0);
    assert.strictEqual(claimA.step.status, 'running');
    assert.strictEqual(claimA.step.claimedBy, 'worker-A');
    assert.ok(claimA.step.claimedAt, 'claimedAt must be recorded');
    recordPass('Worker A successfully claims ready step');

    // Worker B attempts to claim the already claimed step
    let claimErrorThrown = false;
    try {
      await store.claimStepAtomic(instanceId, 'step-1', 'worker-B', 1);
    } catch (err: any) {
      if (err instanceof StepClaimError) {
        claimErrorThrown = true;
        assert.strictEqual(err.currentStatus, 'running');
      }
    }
    assert.strictEqual(claimErrorThrown, true, 'Competing worker claim must throw StepClaimError');
    recordPass('Worker B claim rejected: step already claimed and running');

    // Attempt to claim non-ready step
    const notReadyInstId = 'test-wf-claim-not-ready';
    await store.saveInstance({
      instanceId: notReadyInstId,
      workflowId: 'test-def',
      version: '1.0.0',
      stateVersion: 0,
      objective: 'Not Ready',
      status: 'pending',
      stepStates: {
        'step-pending': {
          stepId: 'step-pending',
          status: 'pending',
          assignedRole: 'cmo',
          skill: 'content_drafting',
          outputs: {},
          evidenceReferences: [],
          retryCount: 0,
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputs: {},
      evidenceReferences: [],
    });

    let nonReadyThrown = false;
    try {
      await store.claimStepAtomic(notReadyInstId, 'step-pending', 'worker-1', 0);
    } catch (err: any) {
      if (err instanceof StepClaimError) {
        nonReadyThrown = true;
      }
    }
    assert.strictEqual(nonReadyThrown, true, 'Non-ready step claim must throw StepClaimError');
    recordPass('Non-ready step claim rejected with StepClaimError');
  } catch (err) {
    recordFail('Group 3: Worker Step Claiming', err);
  }

  // --- Group 4: Atomic Approval Consumption & Double-Consumption Prevention ---
  console.log('\n--- Group 4: Atomic Approval Consumption & Double-Consumption Prevention ---');
  try {
    resetState();
    const store = InMemoryApprovalStore.getInstance();
    const approvalId = 'appr-single-use-123';

    const approvalRecord: FounderApprovalRecord = {
      id: approvalId,
      workflowInstanceId: 'wf-100',
      stepId: 'step-send-email',
      actionName: 'send_production_email',
      employeeRole: 'cmo',
      classification: 'external_communication',
      target: {
        targetSystem: 'email',
        metadata: { recipient: 'user@example.com' },
      },
      payloadHash: 'hash1234567890abcdef',
      decision: 'approved',
      decidedBy: 'founder@samjuniors.com',
      decidedAt: new Date().toISOString(),
      isConsumed: false,
      scope: {
        scopeType: 'step',
        maxUses: 1,
        usedCount: 0,
      },
    };

    await store.save(approvalRecord);

    // First consumption succeeds
    const consumed1 = await store.consume(approvalId);
    assert.strictEqual(consumed1.isConsumed, true);
    assert.strictEqual(consumed1.scope.usedCount, 1);
    recordPass('First approval consumption succeeds atomically');

    // Second consumption must throw ApprovalAlreadyConsumedError
    let doubleConsumeThrown = false;
    try {
      await store.consume(approvalId);
    } catch (err: any) {
      if (err instanceof ApprovalAlreadyConsumedError) {
        doubleConsumeThrown = true;
        assert.strictEqual(err.approvalId, approvalId);
      }
    }
    assert.strictEqual(doubleConsumeThrown, true, 'Double consumption must throw ApprovalAlreadyConsumedError');
    recordPass('Duplicate approval consumption strictly rejected with ApprovalAlreadyConsumedError');

    // Consumption of non-existent approval record
    let notFoundThrown = false;
    try {
      await store.consume('non-existent-approval-id');
    } catch (err: any) {
      if (/Approval record not found/.test(err.message)) {
        notFoundThrown = true;
      }
    }
    assert.strictEqual(notFoundThrown, true, 'Non-existent approval record consumption rejected');
    recordPass('Non-existent approval record consumption rejected');
  } catch (err) {
    recordFail('Group 4: Atomic Approval Consumption', err);
  }

  // --- Group 5: Workflow Rehydration ---
  console.log('\n--- Group 5: Workflow Rehydration ---');
  try {
    resetState();
    const store = InMemoryWorkflowStore.getInstance();

    const makeInst = (id: string, status: any, updatedAtOffsetMs: number): WorkflowInstanceState => ({
      instanceId: id,
      workflowId: 'wf-def-1',
      version: '1.0.0',
      stateVersion: 1,
      objective: `Inst ${id}`,
      status,
      stepStates: {},
      createdAt: new Date(1000000).toISOString(),
      updatedAt: new Date(1000000 + updatedAtOffsetMs).toISOString(),
      outputs: {},
      evidenceReferences: [],
    });

    await store.saveInstance(makeInst('wf-completed', 'completed', 100));
    await store.saveInstance(makeInst('wf-failed', 'failed', 200));
    await store.saveInstance(makeInst('wf-cancelled', 'cancelled', 300));
    await store.saveInstance(makeInst('wf-active-2', 'running', 600));
    await store.saveInstance(makeInst('wf-active-1', 'pending', 400));
    await store.saveInstance(makeInst('wf-active-3', 'awaiting_approval', 500));

    const active = await store.rehydrateActiveInstances();
    const activeIds = active.map((a) => a.instanceId);

    // Terminal instances must be excluded
    assert.strictEqual(activeIds.includes('wf-completed'), false, 'completed instance must not rehydrate');
    assert.strictEqual(activeIds.includes('wf-failed'), false, 'failed instance must not rehydrate');
    assert.strictEqual(activeIds.includes('wf-cancelled'), false, 'cancelled instance must not rehydrate');

    // Active instances must be ordered by updatedAt ascending
    assert.deepStrictEqual(activeIds, ['wf-active-1', 'wf-active-3', 'wf-active-2']);
    recordPass('Rehydration excludes terminal instances and orders active instances chronologically');
  } catch (err) {
    recordFail('Group 5: Workflow Rehydration', err);
  }

  // --- Group 6: Fail-Closed Invariant in Authoritative Mode ---
  console.log('\n--- Group 6: Fail-Closed Invariant in Authoritative Mode ---');
  try {
    resetState();
    process.env.DATABASE_MODE = 'authoritative';
    delete process.env.DATABASE_URL; // Unreachable/unconfigured PostgreSQL

    const pgStore = PostgresWorkflowStore.getInstance();
    const pgApprovalStore = PostgresApprovalStore.getInstance();

    let claimFailedClosed = false;
    try {
      await pgStore.claimStepAtomic('wf-1', 'step-1', 'worker-1');
    } catch (err: any) {
      if (err instanceof DatabaseAuthorityError || /DatabaseAuthority|unavailable|DATABASE_URL/i.test(err.message)) {
        claimFailedClosed = true;
      }
    }
    assert.strictEqual(claimFailedClosed, true, 'claimStepAtomic must fail closed without PostgreSQL');
    recordPass('PostgresWorkflowStore.claimStepAtomic fails closed when DB is unreachable');

    let transitionFailedClosed = false;
    try {
      await pgStore.transitionStepAtomic('wf-1', 'step-1', 'completed', 0);
    } catch (err: any) {
      if (err instanceof DatabaseAuthorityError || /DatabaseAuthority|unavailable|DATABASE_URL/i.test(err.message)) {
        transitionFailedClosed = true;
      }
    }
    assert.strictEqual(transitionFailedClosed, true, 'transitionStepAtomic must fail closed without PostgreSQL');
    recordPass('PostgresWorkflowStore.transitionStepAtomic fails closed when DB is unreachable');

    let rehydrateFailedClosed = false;
    try {
      await pgStore.rehydrateActiveInstances();
    } catch (err: any) {
      if (err instanceof DatabaseAuthorityError || /DatabaseAuthority|unavailable|DATABASE_URL/i.test(err.message)) {
        rehydrateFailedClosed = true;
      }
    }
    assert.strictEqual(rehydrateFailedClosed, true, 'rehydrateActiveInstances must fail closed without PostgreSQL');
    recordPass('PostgresWorkflowStore.rehydrateActiveInstances fails closed when DB is unreachable');

    let consumeFailedClosed = false;
    try {
      await pgApprovalStore.consume('appr-1');
    } catch (err: any) {
      if (err instanceof DatabaseAuthorityError || /DatabaseAuthority|unavailable|DATABASE_URL/i.test(err.message)) {
        consumeFailedClosed = true;
      }
    }
    assert.strictEqual(consumeFailedClosed, true, 'consume must fail closed without PostgreSQL');
    recordPass('PostgresApprovalStore.consume fails closed when DB is unreachable');
  } catch (err) {
    recordFail('Group 6: Fail-Closed Invariant in Authoritative Mode', err);
  }

  // --- Group 7: WorkflowRuntime Integration ---
  console.log('\n--- Group 7: WorkflowRuntime Integration ---');
  try {
    resetState();
    const runtime = new WorkflowRuntime();
    const def: WorkflowDefinition = {
      id: 'wf-runtime-test',
      name: 'Runtime Test Workflow',
      description: 'Testing atomic claim and transition via runtime',
      objective: 'Test atomic step execution',
      version: '1.0.0',
      dependencies: [],
      requiredApprovals: 0,
      allowedRoles: ['cmo'],
      allowedSkills: ['content_drafting'],
      expectedOutputs: ['result'],
      steps: [
        {
          id: 'step-draft',
          name: 'Draft Content',
          description: 'Draft initial content',
          assignedRole: 'cmo',
          skill: 'content_drafting',
          dependencies: [],
          inputReferences: [],
          outputReferences: ['result'],
          requiresApproval: false,
          retryPolicy: { maxRetries: 0, backoffMs: 0 },
          sideEffectClassification: 'read_only',
        },
      ],
    };

    await runtime.registerWorkflow(def);
    const instance = await runtime.createInstance(def.id);

    // Initial state
    assert.strictEqual(instance.stepStates['step-draft'].status, 'ready');
    recordPass('Runtime prepares workflow instance and marks root step ready');

    // Execute ready step atomically
    await runtime.executeReadyStep(instance.instanceId, 'step-draft', 'worker-test-agent');

    const reloaded = (await InMemoryWorkflowStore.getInstance().getInstance(instance.instanceId))!;
    assert.strictEqual(reloaded.stepStates['step-draft'].status, 'completed');
    assert.strictEqual(reloaded.stepStates['step-draft'].claimedBy, undefined, 'Worker claim cleared on step completion');
    assert.ok((reloaded.stateVersion ?? 0) >= 2, 'stateVersion must have advanced through claim and completion');
    assert.strictEqual(reloaded.status, 'completed');
    recordPass('Runtime executes ready step with atomic claim and terminal completion');

    // Rehydrate via runtime
    const rehydrated = await runtime.rehydrate();
    const completedIds = rehydrated.map((r) => r.instanceId);
    assert.strictEqual(completedIds.includes(instance.instanceId), false, 'Completed instance excluded from rehydration');
    recordPass('Runtime.rehydrate excludes completed instances');
  } catch (err) {
    recordFail('Group 7: WorkflowRuntime Integration', err);
  }

  // Summary
  console.log('\n================================================================');
  console.log(`Phase 2.3 Transactions & State Transitions Suite: ${passed}/${passed + failed} Passed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTransactionsAndTransitionsSuite().catch((err) => {
  console.error('Unhandled failure in test suite:', err);
  process.exit(1);
});
