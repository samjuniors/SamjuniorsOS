import assert from 'assert';
import { NextRequest } from 'next/server';
import { POST as orchestrateHandler } from '../app/api/orchestrate/route';
import { MultiAgentOrchestrator } from '../lib/server/orchestration/orchestrator';
import { WorkflowRuntime } from '../lib/server/workflow/runtime';
import { InMemoryWorkflowStore, getWorkflowStore } from '../lib/server/workflow/store';
import { InMemoryApprovalStore, InMemoryAuditStore } from '../lib/server/authorization/approval-store';
import { SideEffectAuthorizationGate } from '../lib/server/authorization/gate';
import { getIdempotencyStore } from '../lib/server/idempotency/store';
import { reconcileFounderDecision } from '../lib/server/workflow/decision-reconciler';
import {
  createExecutiveWorkflowDefinition,
  synthesizeOrchestrationRunFromWorkflow,
} from '../lib/server/workflow/dynamic-dag';
import { DurableFileStore } from '../lib/server/persistence/durable-file-store';
import {
  deriveTerminalOutcomeFromOrchestrateResponse,
  deriveTerminalOutcomeFromInstance,
  deriveTerminalErrorFromHttpStatus,
  deriveTerminalErrorFromNetworkFailure,
  generateCommandIdempotencyKey,
} from '../lib/cockpit/command-terminal-state';

/**
 * ============================================================================
 * SAMJUNIORS OS — PHASE 3.2 COMMAND TERMINAL → REAL ORCHESTRATION TEST SUITE
 * ============================================================================
 *
 * Vertical slice under test:
 *
 *   FOUNDER COMMAND → COMMAND TERMINAL → POST /api/orchestrate (EXISTING)
 *   → EXISTING ORCHESTRATION RUNTIME → WORKFLOW → APPROVAL WHEN REQUIRED
 *   → DURABLE RESULT → AUDIT → TERMINAL REFLECTS ACTUAL SERVER STATE
 *
 * Levels exercised (only the REAL implementations — no mocks of gates,
 * stores, or the runtime):
 *
 * A. HTTP boundary — the actual POST route handler with real NextRequests:
 *    founder auth, unauthenticated/unauthorized rejection, malformed
 *    command rejection, honest unconfigured-engine response, idempotency
 *    claim/replay/mismatch/conflict semantics (including the Phase 3.2
 *    409 structured error mapping).
 *
 * B. Orchestration/runtime boundary — the exact functions the route calls
 *    after its configured-check (createExecutiveWorkflowDefinition →
 *    registerWorkflow → createInstance → executeWorkflow →
 *    synthesizeOrchestrationRunFromWorkflow): successful completion,
 *    approval-required entry into the EXISTING Phase 3.1 approval loop,
 *    and durable state survival.
 *
 * C. Terminal display logic — the pure derivation functions the
 *    CommandTerminal component uses: authoritative run status → outcome
 *    (HTTP 200 / success:true NEVER maps to completed), HTTP errors →
 *    terminal error kinds, durable instance re-read → outcome.
 * ============================================================================
 */

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
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_MODE;
  delete process.env.SAMJUNIORS_AUTHORITY_MODE;
  delete process.env.GEMINI_API_KEY; // honest unconfigured-engine contract
  delete process.env.SAMJUNIORS_DEV_SECRET;
  (process.env as any).NODE_ENV = 'test';
  InMemoryWorkflowStore.getInstance().clear();
  InMemoryApprovalStore.getInstance().clear();
  InMemoryAuditStore.getInstance().clear();
  getIdempotencyStore().clear();
}

const TEST_DEV_SECRET = 'p32_dev_secret_for_test';

function founderRequest(body: unknown, extraHeaders?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/orchestrate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-samjuniors-dev-as': 'founder',
      'x-samjuniors-dev-secret': TEST_DEV_SECRET,
      ...(extraHeaders || {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/**
 * Drives the EXACT code path POST /api/orchestrate executes once its
 * configured-check passes (the same MultiAgentOrchestrator methods,
 * runtime, DAG construction, and run synthesis). Used to exercise the
 * workflow-creating path with the real (unconfigured) executor, which
 * truthfully completes read-only steps without any AI network call.
 */
async function orchestrateThroughRuntime(directive: string) {
  const orchestrator = new MultiAgentOrchestrator();
  // Mirrors orchestrateDirective steps 1–5 with the executor unconfigured.
  const workflowDef = createExecutiveWorkflowDefinition(directive, {
    executeTools: true,
    autonomyLevel: 'autonomous',
  });
  await orchestrator.getRuntime().registerWorkflow(workflowDef);
  const initialInstance = await orchestrator.getRuntime().createInstance(
    workflowDef.id,
    workflowDef.version
  );
  const executedInstance = await orchestrator.getRuntime().executeWorkflow(
    initialInstance.instanceId,
    { executeTools: true }
  );
  const run = synthesizeOrchestrationRunFromWorkflow(executedInstance, workflowDef, directive);
  return { workflowDef, instance: executedInstance, run };
}

async function main(): Promise<void> {
  console.log('\n=== PHASE 3.2 — COMMAND TERMINAL → REAL ORCHESTRATION ===\n');

  // ------------------------------------------------------------------
  console.log('--- Group A: HTTP boundary — authentication & validation ---');
  // ------------------------------------------------------------------

  // A1. Unauthenticated request is rejected with 401.
  try {
    resetState();
    const req = new NextRequest('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ directive: 'Analyze the market' }),
    });
    const res = await orchestrateHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    recordPass('Unauthenticated request is rejected with HTTP 401');
  } catch (err) {
    recordFail('Unauthenticated request is rejected with HTTP 401', err);
  }

  // A2. Unauthorized (non-founder) identity is rejected with 401.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const req = new NextRequest('http://localhost:3000/api/orchestrate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-samjuniors-dev-as': 'attacker',
        'x-samjuniors-dev-secret': TEST_DEV_SECRET,
      },
      body: JSON.stringify({ directive: 'Analyze the market' }),
    });
    const res = await orchestrateHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    recordPass('Unauthorized (non-founder) identity is rejected with HTTP 401');
  } catch (err) {
    recordFail('Unauthorized (non-founder) identity is rejected with HTTP 401', err);
  }

  // A2b. Correct identity but wrong secret is rejected with 401.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;
    const req = founderRequest({ directive: 'Analyze the market' }, {
      'x-samjuniors-dev-secret': 'wrong_secret',
    });
    const res = await orchestrateHandler(req);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    recordPass('Founder identity with an invalid dev secret is rejected with HTTP 401');
  } catch (err) {
    recordFail('Founder identity with an invalid dev secret is rejected with HTTP 401', err);
  }

  // A3. Malformed command (missing / empty / non-string directive) → 400.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const missing = await orchestrateHandler(founderRequest({ agents: ['coo'] }));
    assert.strictEqual(missing.status, 400, 'Missing directive must be 400');

    const empty = await orchestrateHandler(founderRequest({ directive: '   ' }));
    assert.strictEqual(empty.status, 400, 'Whitespace-only directive must be 400');

    const nonString = await orchestrateHandler(
      founderRequest({ directive: { injected: true } })
    );
    assert.strictEqual(nonString.status, 400, 'Non-string directive must be 400');

    const emptyBody = await orchestrateHandler(founderRequest('{not valid json'));
    assert.strictEqual(
      emptyBody.status,
      500,
      'Unparseable body is handled by the existing 500 catch (no crash)'
    );

    recordPass('Malformed command is rejected (missing/empty/non-string directive → 400)');
  } catch (err) {
    recordFail('Malformed command is rejected (missing/empty/non-string directive → 400)', err);
  }

  // A4. Authenticated founder submits a valid command through the REAL route:
  // the honest unconfigured-engine response is returned — nothing fabricated.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const key = `cc-p32-${Date.now()}-a4`;
    const res = await orchestrateHandler(
      founderRequest({ directive: 'Audit our onboarding funnel', idempotencyKey: key })
    );
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);

    const body = await res.json();
    // The existing envelope contract.
    assert.strictEqual(typeof body.success, 'boolean');
    assert.ok(body.data, 'Response must carry the orchestration run payload');
    assert.strictEqual(body.data.directive, 'Audit our onboarding funnel');
    assert.strictEqual(body.liveAi, false, 'Unconfigured engine must report liveAi false');
    assert.strictEqual(body.executionMode, 'unconfigured');

    // Honest failure semantics: the run is FAILED (not success), with the
    // truthful reason — no fabricated business data anywhere in the payload.
    assert.strictEqual(body.data.status, 'failed');
    assert.ok(
      /GEMINI_API_KEY/i.test(body.data.executiveResult?.failureReason || body.data.failureReason || ''),
      `failureReason must name the missing engine secret, got: ${body.data.executiveResult?.failureReason || body.data.failureReason}`
    );
    const serialized = JSON.stringify(body);
    // No fabricated business values: the honest response contains no currency
    // amounts, no decimal-percentage metrics (the old fake-data pattern, e.g.
    // "84.2%"), and no verified-margin claims. The only numeric-adjacent text
    // is the constitutional invariant description ("80%+ gross margin floor").
    assert.ok(
      !/\$\d|\d+\.\d+%|contribution margin verified/i.test(serialized),
      `No fabricated metrics may appear, got: ${serialized.slice(0, 400)}`
    );

    // No durable work was created (unconfigured engine creates none).
    const instances = await InMemoryWorkflowStore.getInstance().listInstances();
    assert.strictEqual(instances.length, 0, 'Unconfigured engine must create no workflow instances');

    // The existing idempotency machinery engaged for this key.
    const idemRecord = await getIdempotencyStore().get(`client:orchestrate:${key}`);
    assert.ok(idemRecord, 'Route must claim the idempotency key in the existing store');
    assert.strictEqual(idemRecord!.status, 'completed', 'Unconfigured response is a completed request outcome');
    assert.strictEqual(idemRecord!.actionName, 'Orchestrate Directive');

    recordPass('Authenticated founder command reaches the real /api/orchestrate path (honest unconfigured result, idempotency claimed)');
  } catch (err) {
    recordFail('Authenticated founder command reaches the real /api/orchestrate path (honest unconfigured result, idempotency claimed)', err);
  }

  // ------------------------------------------------------------------
  console.log('\n--- Group B: Idempotency / duplicates (existing semantics) ---');
  // ------------------------------------------------------------------

  // B1. Double submission with the same key + same payload → idempotent replay.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const key = `cc-p32-${Date.now()}-b1`;
    const payload = { directive: 'Replay semantics probe', idempotencyKey: key };

    const res1 = await orchestrateHandler(founderRequest(payload));
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.headers.get('x-idempotent-replay'), null, 'First submission must not be a replay');
    const body1 = await res1.json();

    const res2 = await orchestrateHandler(founderRequest(payload));
    assert.strictEqual(res2.status, 200, 'Replay must return the recorded outcome, not an error');
    assert.strictEqual(res2.headers.get('x-idempotent-replay'), 'true', 'Replay must set X-Idempotent-Replay');
    const body2 = await res2.json();
    assert.deepStrictEqual(body2, body1, 'Replayed response must deep-equal the original');

    recordPass('Duplicate submission (same key + payload) replays the recorded outcome exactly');
  } catch (err) {
    recordFail('Duplicate submission (same key + payload) replays the recorded outcome exactly', err);
  }

  // B2. Same key + altered payload → 422 payload mismatch (existing binding).
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const key = `cc-p32-${Date.now()}-b2`;
    const res1 = await orchestrateHandler(
      founderRequest({ directive: 'Original directive', idempotencyKey: key })
    );
    assert.strictEqual(res1.status, 200);

    const res2 = await orchestrateHandler(
      founderRequest({ directive: 'TAMPERED directive', idempotencyKey: key })
    );
    assert.strictEqual(res2.status, 422, `Expected 422, got ${res2.status}`);
    const body2 = await res2.json();
    assert.strictEqual(body2.success, false);
    assert.ok(body2.error.includes('altered payload'), '422 must explain the payload binding');

    recordPass('Idempotency key reuse with an altered payload is rejected with 422');
  } catch (err) {
    recordFail('Idempotency key reuse with an altered payload is rejected with 422', err);
  }

  // B3. Concurrent duplicate (key already in progress) → structured 409.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const key = `cc-p32-${Date.now()}-b3`;
    // Seed the durable idempotency store exactly as a crashed/in-flight
    // duplicate would leave it — the same store the route claims through.
    await getIdempotencyStore().claim({
      key: `client:orchestrate:${key}`,
      actionName: 'Orchestrate Directive',
      payloadHash: undefined,
      executionRef: 'in-flight-from-prior-request',
    });

    const res = await orchestrateHandler(
      founderRequest({ directive: 'Concurrent duplicate probe', idempotencyKey: key })
    );
    assert.strictEqual(res.status, 409, `In-progress duplicate must be 409, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.code, 'idempotency_in_progress', '409 must carry the structured code');
    assert.ok(body.error.includes('currently in progress'), `Store message must surface verbatim, got: ${body.error}`);

    recordPass('Concurrent duplicate (in-progress key) is rejected with structured 409 idempotency_in_progress');
  } catch (err) {
    recordFail('Concurrent duplicate (in-progress key) is rejected with structured 409 idempotency_in_progress', err);
  }

  // B4. Unknown prior outcome (coordination loss) → structured 409.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const key = `cc-p32-${Date.now()}-b4`;
    await getIdempotencyStore().claim({
      key: `client:orchestrate:${key}`,
      actionName: 'Orchestrate Directive',
    });
    await getIdempotencyStore().markUnknown(
      `client:orchestrate:${key}`,
      'Outcome ambiguous after coordinator loss'
    );

    const res = await orchestrateHandler(
      founderRequest({ directive: 'Unknown outcome probe', idempotencyKey: key })
    );
    assert.strictEqual(res.status, 409, `Unknown-state retry must be 409, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.code, 'idempotency_unknown');
    assert.ok(/UNKNOWN state|blind retry/i.test(body.error), `Store message must surface verbatim, got: ${body.error}`);

    recordPass('Unknown prior result (coordination loss) is surfaced as structured 409 idempotency_unknown');
  } catch (err) {
    recordFail('Unknown prior result (coordination loss) is surfaced as structured 409 idempotency_unknown', err);
  }

  // B5. Definitively failed prior attempt → structured 409.
  try {
    resetState();
    process.env.SAMJUNIORS_DEV_SECRET = TEST_DEV_SECRET;

    const key = `cc-p32-${Date.now()}-b5`;
    await getIdempotencyStore().claim({
      key: `client:orchestrate:${key}`,
      actionName: 'Orchestrate Directive',
    });
    await getIdempotencyStore().fail(
      `client:orchestrate:${key}`,
      'Prior orchestration failed definitively'
    );

    const res = await orchestrateHandler(
      founderRequest({ directive: 'Failed prior probe', idempotencyKey: key })
    );
    assert.strictEqual(res.status, 409, `Failed-prior retry must be 409, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.code, 'idempotency_prior_failure');

    recordPass('Definitively failed prior attempt returns structured 409 idempotency_prior_failure');
  } catch (err) {
    recordFail('Definitively failed prior attempt returns structured 409 idempotency_prior_failure', err);
  }

  // ------------------------------------------------------------------
  console.log('\n--- Group C: Workflow path — real orchestration results ---');
  // ------------------------------------------------------------------

  // C1. Successful orchestration returns the real durable result (the exact
  // functions the route calls once configured).
  try {
    resetState();

    const { instance, run } = await orchestrateThroughRuntime(
      'Analyze competitor pricing and produce a recommendation memo'
    );
    assert.strictEqual(instance.status, 'completed', `Instance should complete, got '${instance.status}'`);
    assert.strictEqual(run.status, 'completed');
    assert.strictEqual(run.liveAi, true);
    assert.strictEqual(run.workflowInstanceId, instance.instanceId);
    assert.ok(run.executionSummary, 'Run must carry the execution summary');

    recordPass('Successful orchestration returns the real durable result (completed run + instance id)');
  } catch (err) {
    recordFail('Successful orchestration returns the real durable result (completed run + instance id)', err);
  }

  // C2. Approval-required orchestration enters the EXISTING approval path
  // (Phase 3.1 loop), executes only after the founder decides, and audits.
  try {
    resetState();

    const { instance, run } = await orchestrateThroughRuntime(
      'Send email digest of the pricing memo to the leadership list'
    );

    // The API-visible contract the terminal consumes.
    assert.strictEqual(instance.status, 'awaiting_approval');
    assert.strictEqual(run.status, 'requires_approval', `Run must report requires_approval, got '${run.status}'`);
    assert.ok(run.workflowInstanceId);
    assert.ok(
      run.executiveResult?.decisionsRequired?.length,
      'Run must surface the pending founder decision'
    );

    // The approval is pending in the EXISTING approval store (the inbox source).
    const step = instance.stepStates['step-side-effect'];
    assert.strictEqual(step.status, 'awaiting_approval');
    assert.ok(step.approvalId);
    const pendingRecord = await InMemoryApprovalStore.getInstance().get(step.approvalId!);
    assert.ok(pendingRecord, 'Approval record must exist in the existing store');
    assert.strictEqual(pendingRecord!.decision, 'pending');
    assert.strictEqual(pendingRecord!.workflowInstanceId, instance.instanceId);

    // Nothing executed before the founder decision (fail-closed gate).
    const auditsBefore = (await SideEffectAuthorizationGate.getInstance().listAudits({
      workflowInstanceId: instance.instanceId,
      stepId: 'step-side-effect',
    })).filter((a) => a.executed);
    assert.strictEqual(auditsBefore.length, 0, 'No side-effect execution before founder decision');

    // The founder decides through the authority + existing reconciliation
    // (the exact path POST /api/workflow/approvals drives).
    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: step.approvalId!,
      decision: 'approved',
      decidedBy: 'founder-local-session',
    });
    const recon = await reconcileFounderDecision(decided);
    assert.strictEqual(recon.reconciled, true, `Note: ${recon.outcomeNote}`);
    assert.strictEqual(recon.stepStatus, 'completed');
    assert.strictEqual(recon.workflowStatus, 'completed');
    assert.ok(recon.auditRecords! >= 1, 'Approved execution must be audited');

    recordPass('Approval-required command enters the existing approval loop and executes only after the founder decides');
  } catch (err) {
    recordFail('Approval-required command enters the existing approval loop and executes only after the founder decides', err);
  }

  // C3. Rejected approval fails closed — the command's consequential step blocks.
  try {
    resetState();

    const { instance } = await orchestrateThroughRuntime(
      'Send email digest to external partners'
    );
    const step = instance.stepStates['step-side-effect'];

    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: step.approvalId!,
      decision: 'rejected',
      decidedBy: 'founder-local-session',
    });
    const recon = await reconcileFounderDecision(decided);
    assert.strictEqual(recon.stepStatus, 'blocked', 'Rejected side-effect must block');

    const executedAudits = (await SideEffectAuthorizationGate.getInstance().listAudits({
      workflowInstanceId: instance.instanceId,
      stepId: 'step-side-effect',
    })).filter((a) => a.executed);
    assert.strictEqual(executedAudits.length, 0, 'Rejected side-effect must never execute');

    recordPass('Rejected approval blocks the consequential step (fail-closed, zero executions)');
  } catch (err) {
    recordFail('Rejected approval blocks the consequential step (fail-closed, zero executions)', err);
  }

  // ------------------------------------------------------------------
  console.log('\n--- Group D: Durable state survives re-read (refresh semantics) ---');
  // ------------------------------------------------------------------

  // D1. The server result survives a re-read through the exact read the
  // terminal performs on refresh (GET /api/workflow/instances store read).
  try {
    resetState();

    const { instance } = await orchestrateThroughRuntime(
      'Send email digest to the board'
    );
    const step = instance.stepStates['step-side-effect'];
    const decided = await SideEffectAuthorizationGate.getInstance().decideApproval({
      approvalId: step.approvalId!,
      decision: 'approved',
      decidedBy: 'founder-local-session',
    });
    await reconcileFounderDecision(decided);

    // Fresh authoritative read — what GET /api/workflow/instances returns.
    const reread = await getWorkflowStore().getInstance(instance.instanceId);
    assert.ok(reread, 'Instance must be re-readable');
    assert.strictEqual(reread!.status, 'completed', 'Durable state must remain completed on re-read');

    // The durable file layer (the restart-survival substrate) holds it too.
    const durable = DurableFileStore.getInstance().readCollection<any>('workflow_instances');
    assert.ok(
      durable[instance.instanceId],
      'Instance must be persisted in the durable file layer'
    );
    assert.strictEqual(durable[instance.instanceId].status, 'completed');

    // The terminal's refresh derivation maps it to the honest outcome.
    const outcome = deriveTerminalOutcomeFromInstance(reread);
    assert.strictEqual(outcome.kind, 'completed');
    assert.strictEqual(outcome.workflowInstanceId, instance.instanceId);

    recordPass('Server result survives re-read: durable store + file layer + terminal re-derivation');
  } catch (err) {
    recordFail('Server result survives re-read: durable store + file layer + terminal re-derivation', err);
  }

  // D2. Awaiting-approval state also survives re-read (terminal refresh shows it).
  try {
    resetState();

    const { instance } = await orchestrateThroughRuntime(
      'Send email digest to the advisory board'
    );

    const reread = await getWorkflowStore().getInstance(instance.instanceId);
    const outcome = deriveTerminalOutcomeFromInstance(reread);
    assert.strictEqual(outcome.kind, 'awaiting_approval', `Expected awaiting_approval, got ${outcome.kind}`);

    recordPass('Awaiting-approval state survives re-read and re-derives to awaiting_approval');
  } catch (err) {
    recordFail('Awaiting-approval state survives re-read and re-derives to awaiting_approval', err);
  }

  // ------------------------------------------------------------------
  console.log('\n--- Group E: Terminal display logic never fabricates success ---');
  // ------------------------------------------------------------------

  // E1. HTTP 200 + success:true + failed status → UNCONFIGURED, never success.
  try {
    const outcome = deriveTerminalOutcomeFromOrchestrateResponse({
      success: true,
      liveAi: false,
      executionMode: 'unconfigured',
      data: {
        status: 'failed',
        liveAi: false,
        failureReason: 'GEMINI_API_KEY environment variable is not configured.',
        executionSummary: { executionMode: 'unconfigured' },
      },
    });
    assert.strictEqual(outcome.kind, 'unconfigured', `Got ${outcome.kind}`);
    assert.notStrictEqual(outcome.kind, 'completed');
    assert.ok(/GEMINI_API_KEY/.test(outcome.detail));
    recordPass('200 + success:true + failed/unconfigured run → terminal shows UNCONFIGURED, never success');
  } catch (err) {
    recordFail('200 + success:true + failed/unconfigured run → terminal shows UNCONFIGURED, never success', err);
  }

  // E2. 200 + success:true + requires_approval → AWAITING APPROVAL, not success.
  try {
    const outcome = deriveTerminalOutcomeFromOrchestrateResponse({
      success: true,
      data: {
        status: 'requires_approval',
        workflowInstanceId: 'wf-inst-e2',
        executiveResult: { executionOutcome: 'awaiting_founder_decision' },
      },
    });
    assert.strictEqual(outcome.kind, 'awaiting_approval');
    assert.strictEqual(outcome.workflowInstanceId, 'wf-inst-e2');
    recordPass('200 + success:true + requires_approval → terminal shows AWAITING APPROVAL, not success');
  } catch (err) {
    recordFail('200 + success:true + requires_approval → terminal shows AWAITING APPROVAL, not success', err);
  }

  // E3. Only an authoritative completed status produces completed.
  try {
    const completed = deriveTerminalOutcomeFromOrchestrateResponse({
      success: true,
      data: { status: 'completed', summary: 'Durable result recorded.' },
    });
    assert.strictEqual(completed.kind, 'completed');

    const running = deriveTerminalOutcomeFromOrchestrateResponse({
      success: true,
      data: { status: 'running' },
    });
    assert.strictEqual(running.kind, 'running');

    const failed = deriveTerminalOutcomeFromOrchestrateResponse({
      success: true,
      data: { status: 'failed', liveAi: true, failureReason: 'Step execution failed' },
    });
    assert.strictEqual(failed.kind, 'failed');

    const noData = deriveTerminalOutcomeFromOrchestrateResponse({ success: true });
    assert.strictEqual(noData.kind, 'unknown', 'Missing run payload must be unknown, not success');

    recordPass('Only authoritative completed/running/failed statuses produce their outcome kinds');
  } catch (err) {
    recordFail('Only authoritative completed/running/failed statuses produce their outcome kinds', err);
  }

  // E4. Replay flag propagates for honest idempotent-replay display.
  try {
    const outcome = deriveTerminalOutcomeFromOrchestrateResponse(
      { success: true, data: { status: 'completed' } },
      { replayed: true }
    );
    assert.strictEqual(outcome.kind, 'completed');
    assert.strictEqual(outcome.replayed, true);
    recordPass('Idempotent replay flag propagates to the terminal outcome');
  } catch (err) {
    recordFail('Idempotent replay flag propagates to the terminal outcome', err);
  }

  // E5. HTTP error mapping — every failure class renders a distinct state.
  try {
    const e401 = deriveTerminalErrorFromHttpStatus(401, { error: 'Unauthorized: Valid Founder session required to orchestrate executive directives', success: false });
    assert.strictEqual(e401.kind, 'unauthenticated');
    assert.strictEqual(e401.retrySameKey, false);

    const e400 = deriveTerminalErrorFromHttpStatus(400, { error: 'Directive is required and must be a non-empty string', success: false });
    assert.strictEqual(e400.kind, 'validation');

    const e409a = deriveTerminalErrorFromHttpStatus(409, { error: 'already in progress', success: false, code: 'idempotency_in_progress' });
    assert.strictEqual(e409a.kind, 'duplicate_in_progress');

    const e409b = deriveTerminalErrorFromHttpStatus(409, { error: 'ambiguous prior state', success: false, code: 'idempotency_unknown' });
    assert.strictEqual(e409b.kind, 'unknown_result');
    assert.strictEqual(e409b.retrySameKey, true, 'Unknown result is the same-key retry case');

    const e409c = deriveTerminalErrorFromHttpStatus(409, { error: 'Previous operation failed definitively', success: false, code: 'idempotency_prior_failure' });
    assert.strictEqual(e409c.kind, 'prior_failure');

    const e422 = deriveTerminalErrorFromHttpStatus(422, { error: 'cannot reuse existing idempotency key with an altered payload', success: false });
    assert.strictEqual(e422.kind, 'payload_mismatch');

    const e500 = deriveTerminalErrorFromHttpStatus(500, { error: 'Failed to orchestrate directive', success: false });
    assert.strictEqual(e500.kind, 'server_error');

    // Backward-compat: pre-3.2 servers returned 500 with the same message text.
    const legacy = deriveTerminalErrorFromHttpStatus(500, { error: "Operation with idempotency key 'x' is currently in progress", success: false });
    assert.strictEqual(legacy.kind, 'duplicate_in_progress', 'Message-sniff fallback maps legacy 500s');

    const net = deriveTerminalErrorFromNetworkFailure(new Error('fetch failed'));
    assert.strictEqual(net.kind, 'network_error');
    assert.strictEqual(net.retrySameKey, true, 'Network failure must reuse the same idempotency key');

    recordPass('HTTP/network error classes map to distinct terminal states with correct retry semantics');
  } catch (err) {
    recordFail('HTTP/network error classes map to distinct terminal states with correct retry semantics', err);
  }

  // E6. Durable instance re-read mapping — blocked and cancelled are honest.
  try {
    const blocked = deriveTerminalOutcomeFromInstance({
      instanceId: 'wf-b',
      status: 'blocked',
      stepStates: { 'step-side-effect': { status: 'blocked', blockedReason: 'Founder rejected approval request' } },
    });
    assert.strictEqual(blocked.kind, 'blocked');
    assert.ok(blocked.detail.includes('Founder rejected'));

    const cancelled = deriveTerminalOutcomeFromInstance({ instanceId: 'wf-c', status: 'cancelled' });
    assert.strictEqual(cancelled.kind, 'failed');

    const missing = deriveTerminalOutcomeFromInstance(null);
    assert.strictEqual(missing.kind, 'unknown');

    recordPass('Durable instance re-read maps blocked/cancelled/missing honestly');
  } catch (err) {
    recordFail('Durable instance re-read maps blocked/cancelled/missing honestly', err);
  }

  // E7. Idempotency key generation is well-formed and unique.
  try {
    const a = generateCommandIdempotencyKey();
    const b = generateCommandIdempotencyKey();
    assert.notStrictEqual(a, b);
    assert.ok(/^cc-/.test(a), 'Keys must carry the command-terminal prefix');
    recordPass('Client idempotency keys are unique and namespaced');
  } catch (err) {
    recordFail('Client idempotency keys are unique and namespaced', err);
  }

  // ------------------------------------------------------------------
  console.log('\n==========================================');
  console.log(`PHASE 3.2 COMMAND TERMINAL SUITE: ${passed} passed, ${failed} failed`);
  console.log('==========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
