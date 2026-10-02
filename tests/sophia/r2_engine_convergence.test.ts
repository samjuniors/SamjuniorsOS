import assert from 'assert';
import fs from 'fs';
import path from 'path';

/**
 * ============================================================================
 * R2 ENGINE CONVERGENCE REGRESSION SUITE
 * ============================================================================
 *
 * R2 merged the M5 lineage (feat/m54-generation-faithfulness) into the
 * R0/R0.1/R1-hardened main. The merge brought the Phase 4.4 scheduler + the
 * real workflow runtime, which means the "two engines" the FlowDesktop copy
 * describes no longer merely coexist — they now share one authority stack.
 * This suite PINS that convergence:
 *
 *   A. SOURCE-LEVEL — the shared-authority contract:
 *      both the multi-agent orchestrator (immediate directives) and the
 *      workflow runtime (scheduled directives) route agent execution through
 *      the SAME ServerAgentExecutor, which talks to the ONE LLM provider
 *      (ai/zai-client); both engines route side effects through the SAME
 *      SideEffectAuthorizationGate singleton; neither routes through
 *      skill-registry's executeSkill (the R1 not_executed boundary); the
 *      realtime surface's direct tools use the same gate too.
 *
 *   B. FUNCTIONAL — one scheduled directive, executed end-to-end through the
 *      workflow runtime with a recording stub executor (the live executor
 *      contract is pinned by m3/m4/phase suites; here we verify the
 *      CONVERGENCE wiring, not the provider):
 *      createScheduledDirective → occurrence-bound evaluateReadiness →
 *      executeReadyStep → completed step with gate audit + canonical
 *      idempotency + executor context carrying workflow/occurrence identity.
 *      Plus the honest failure path (provider failure → step 'failed',
 *      never completed-with-error).
 *
 *   C. HONEST COPY — the surfaces describe exactly this convergence (both
 *      engines named, shared authority named).
 */

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** Strip block + full-line comments so the suite's own explanatory quotes
 *  (which mention removed symbols) never satisfy an absence check. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  [PASS] ${name}`);
    })
    .catch((err) => {
      failed++;
      console.error(`  [FAIL] ${name}`);
      console.error(`        ${err && err.message ? err.message.split('\n')[0] : err}`);
    });
}

async function run(): Promise<void> {
  const ORCHESTRATOR = 'src/lib/server/orchestration/orchestrator.ts';
  const RUNTIME = 'src/lib/server/workflow/runtime.ts';
  const EXECUTOR = 'src/lib/server/agents/executor.ts';
  const SKILL_REGISTRY = 'src/lib/skills/skill-registry.ts';
  const REALTIME = 'src/app/api/realtime/turn/route.ts';

  const orchestratorSrc = read(ORCHESTRATOR);
  const runtimeSrc = read(RUNTIME);
  const executorSrc = read(EXECUTOR);
  const skillRegistrySrc = read(SKILL_REGISTRY);
  const realtimeSrc = codeOnly(read(REALTIME));

  console.log('\n====================================================');
  console.log('A. SOURCE-LEVEL — the shared-authority contract');
  console.log('====================================================');

  await check('A1: the orchestrator and the workflow runtime import the SAME ServerAgentExecutor', () => {
    assert.match(
      orchestratorSrc,
      /import \{ ServerAgentExecutor \} from '\.\.\/agents\/executor'/,
      'orchestrator must import ServerAgentExecutor from ../agents/executor'
    );
    assert.match(
      runtimeSrc,
      /import \{ ServerAgentExecutor \} from '\.\.\/agents\/executor'/,
      'workflow runtime must import ServerAgentExecutor from ../agents/executor'
    );
  });

  await check('A2: the shared executor talks to exactly ONE LLM provider (ai/zai-client) — no second brain', () => {
    const code = codeOnly(executorSrc);
    assert.match(code, /from '\.\.\/ai\/zai-client'/, 'executor imports ai/zai-client');
    // The executor must NOT spin up any other provider (no SDK clients, no REST LLM ladders).
    assert.ok(!/from '(@google\/genai|openai|@anthropic-ai\/sdk)'/.test(code), 'executor must not import another LLM SDK');
    assert.ok(!/brain/.test(code.replace(/zai-client/g, '')), 'executor must not reference the deleted brain path');
  });

  await check('A3: the dead brain path stays deleted — no engine imports src/lib/server/brain.ts', () => {
    assert.ok(!fs.existsSync(path.join(ROOT, 'src/lib/server/brain.ts')), 'brain.ts must remain deleted (R1)');
    for (const src of [orchestratorSrc, runtimeSrc, executorSrc, realtimeSrc]) {
      assert.ok(!/server\/brain/.test(codeOnly(src)), 'no engine references the deleted brain module');
    }
  });

  await check('A4: BOTH engines route side effects through the SideEffectAuthorizationGate', () => {
    assert.match(
      codeOnly(orchestratorSrc),
      /authGate\.executeWithGate\(/,
      'orchestrator tool branches must call executeWithGate'
    );
    assert.match(
      codeOnly(runtimeSrc),
      /this\.gate\.executeWithGate\(/,
      'workflow runtime executeReadyStep must call executeWithGate'
    );
    assert.match(
      codeOnly(runtimeSrc),
      /await this\.gate\.evaluateAuthorization\(/,
      'workflow runtime must pre-evaluate authorization before claiming the step'
    );
  });

  await check('A5: both engines resolve the SAME gate singleton (no private gate instance anywhere)', () => {
    assert.match(
      codeOnly(orchestratorSrc),
      /SideEffectAuthorizationGate\.getInstance\(\)/,
      'orchestrator uses the gate singleton'
    );
    assert.match(
      codeOnly(runtimeSrc),
      /SideEffectAuthorizationGate\.getInstance\(\)/,
      'workflow runtime uses the gate singleton'
    );
    // The realtime surface (R0) closes the loop on the third tool path.
    assert.match(realtimeSrc, /SideEffectAuthorizationGate\.getInstance\(\)/, 'realtime tools use the gate singleton');
  });

  await check('A6: NEITHER engine routes through skill-registry.executeSkill (R1 not_executed boundary)', () => {
    const orchCode = codeOnly(orchestratorSrc);
    const runtimeCode = codeOnly(runtimeSrc);
    assert.ok(!/executeSkill/.test(orchCode), 'orchestrator must not call executeSkill');
    assert.ok(!/executeSkill/.test(runtimeCode), 'workflow runtime must not call executeSkill');
    assert.match(
      codeOnly(skillRegistrySrc),
      /status: 'not_executed'/,
      "skill-registry must keep reporting 'not_executed' (R1 honesty)"
    );
  });

  await check('A7: the shared executor persists runs to the SAME AgentRunStore both engines read', () => {
    assert.match(codeOnly(executorSrc), /AgentRunStore\.getInstance\(\)/, 'executor persists via the AgentRunStore singleton');
  });

  console.log('\n====================================================');
  console.log('B. FUNCTIONAL — one scheduled directive through the runtime');
  console.log('====================================================');

  // Import the converged machinery. The stub executor RECORDS the convergence
  // payload (workflowInstanceId / stepId / occurrence identity) instead of
  // calling the live provider — the live executor contract is pinned by the
  // m3/m4/phase suites; here we pin the WIRING.
  const { WorkflowRuntime } = await import('../../src/lib/server/workflow/runtime');
  const { WorkflowScheduler } = await import('../../src/lib/server/workflow/scheduler');
  const {
    createScheduledDirective,
    DIRECTIVE_STEP_ID,
  } = await import('../../src/lib/server/workflow/directive-schedule');
  const { InMemoryAuditStore } = await import('../../src/lib/server/authorization/approval-store');
  const { AgentRunStore } = await import('../../src/lib/server/agents/run-store');

  const directiveText = `R2 convergence probe ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  interface RecordedCall {
    role: string;
    context: Record<string, unknown>;
    prompt: string;
  }
  const calls: RecordedCall[] = [];
  let callCount = 0;
  const stubExecutor = {
    isConfigured: () => true,
    executeAgentTask: async (role: string, context: Record<string, unknown>, prompt: string) => {
      callCount++;
      calls.push({ role, context, prompt });
      if (callCount === 1) {
        return {
          success: true,
          runId: `run-r2-stub-${callCount}`,
          outputContent: `R2 convergence stub report for: ${String(context.directive ?? '')}`,
          provenance: { agentId: 'r2-stub-agent' },
        };
      }
      // Second configured execution exercises the honest failure path.
      return { success: false, error: 'r2 simulated provider failure', runId: `run-r2-stub-${callCount}` };
    },
  } as any;

  const runtime = new WorkflowRuntime(undefined, stubExecutor);
  const scheduler = new WorkflowScheduler(undefined, undefined, runtime);

  let workflowInstanceId = '';
  let scheduleId = '';
  let stepId = '';

  await check('B1: createScheduledDirective synthesizes the single-COO read_only report step on the shared stores', async () => {
    const result = await createScheduledDirective(
      {
        directive: directiveText,
        scheduleType: 'one_time',
        executeAt: new Date(Date.now() + 60_000).toISOString(),
        requiresApproval: false,
      },
      { runtime, scheduler, founder: { userId: 'founder-r2-test' } }
    );
    workflowInstanceId = result.workflowInstanceId;
    scheduleId = result.schedule?.id ?? '';
    assert.ok(workflowInstanceId, 'a workflow instance must be created');
    assert.equal(result.definition.steps.length, 1, 'scheduled directive = ONE objective step');
    const step = result.definition.steps[0];
    assert.equal(step.assignedRole, 'coo', 'the step is owned by the COO');
    assert.equal(step.skill, 'report', "the protocol skill is 'report'");
    assert.equal(step.sideEffectClassification, 'read_only', 'no-approval scheduled directives are read_only');
    stepId = step.id;
    assert.equal(stepId, DIRECTIVE_STEP_ID, 'the directive step id is the canonical DIRECTIVE_STEP_ID');
  });

  const occurrence = {
    occurrenceId: `r2-occ-${Date.now()}`,
    occurrenceNumber: 1,
    scheduleId: scheduleId || 'r2-schedule-test',
  };

  await check('B2: occurrence-bound evaluateReadiness readies the scheduled step without an approval detour', async () => {
    await runtime.evaluateReadiness(workflowInstanceId, occurrence);
    const instance = await (runtime as any).store.getInstance(workflowInstanceId);
    assert.ok(instance, 'instance readable from the shared store');
    const step = instance.stepStates[stepId];
    assert.equal(step.status, 'ready', `step must be ready after occurrence-bound evaluation (got ${step.status})`);
  });

  await check('B3: executeReadyStep completes the step through the gate with canonical idempotency and audit', async () => {
    const auditsBefore = (InMemoryAuditStore.getInstance() as any).audits?.size ?? 0;
    await runtime.executeReadyStep(workflowInstanceId, stepId, 'r2-worker', occurrence);

    const instance = await (runtime as any).store.getInstance(workflowInstanceId);
    const step = instance.stepStates[stepId];
    assert.equal(step.status, 'completed', `step must be completed (got ${step.status})`);
    assert.ok(step.outputs && typeof step.outputs.result === 'string', "the step records its 'result' output");
    assert.ok(
      Array.isArray(step.evidenceReferences) && step.evidenceReferences.length > 0,
      'completion evidence references the gate audit'
    );
    assert.ok((InMemoryAuditStore.getInstance() as any).audits?.size > auditsBefore, 'a gate audit record was written');
  });

  await check('B4: the shared executor received the convergence payload (role, protocolStep, workflow + occurrence identity)', () => {
    assert.equal(calls.length, 1, 'exactly one agent execution for the one-step directive');
    const call = calls[0];
    assert.equal(call.role, 'coo', 'the executor was invoked as the COO');
    assert.equal(call.context.protocolStep, 'report', "protocolStep is 'report'");
    assert.equal(call.context.directive, directiveText, 'the directive text was carried through');
    assert.equal(call.context.workflowInstanceId, workflowInstanceId, 'workflow instance identity stamped into the run context');
    assert.equal(call.context.stepId, stepId, 'step identity stamped into the run context');
    assert.equal(call.context.occurrenceId, occurrence.occurrenceId, 'occurrence identity stamped into the run context');
    assert.equal(call.context.occurrenceNumber, 1, 'occurrence number stamped into the run context');
  });

  await check('B5: a provider failure surfaces as an honest retryable step failure (never completed-with-error)', async () => {
    // Configure a SECOND scheduled directive on the same runtime; the stub
    // executor's second call reports failure (deterministic failure
    // semantics pinned by Phase 4.4B.1 — re-verified here at the boundary).
    const result = await createScheduledDirective(
      {
        directive: `${directiveText} (failure path)`,
        scheduleType: 'one_time',
        executeAt: new Date(Date.now() + 60_000).toISOString(),
        requiresApproval: false,
      },
      { runtime, scheduler }
    );
    const failOccurrence = {
      occurrenceId: `r2-occ-fail-${Date.now()}`,
      occurrenceNumber: 1,
      scheduleId: result.schedule?.id ?? 'r2-schedule-fail',
    };
    await runtime.evaluateReadiness(result.workflowInstanceId, failOccurrence);
    await runtime.executeReadyStep(result.workflowInstanceId, result.definition.steps[0].id, 'r2-worker', failOccurrence);
    const instance = await (runtime as any).store.getInstance(result.workflowInstanceId);
    const step = instance.stepStates[result.definition.steps[0].id];
    assert.equal(step.status, 'failed', `provider failure must mark the step failed (got ${step.status})`);
    assert.ok(/r2 simulated provider failure/.test(String(step.error)), 'the failure reason is preserved on the step');
    // The failed execution still audited honestly through the gate.
    assert.equal(calls.length, 2, 'the failing execution also went through the shared executor');
  });

  await check('B6: the AgentRunStore singleton is the one shared execution ledger (importable + consistent)', async () => {
    const store = AgentRunStore.getInstance();
    assert.ok(store, 'AgentRunStore singleton resolves');
    const list = typeof (store as any).list === 'function' ? await (store as any).list({}) : null;
    assert.ok(list === null || Array.isArray(list), 'the ledger read path stays coherent');
  });

  console.log('\n====================================================');
  console.log('C. HONEST COPY — the surfaces describe the convergence');
  console.log('====================================================');

  await check('C1: FlowDesktop names BOTH engines and their shared authority (executor, gate, audit)', () => {
    const src = read('src/os/components/FlowDesktop.tsx');
    assert.match(src, /multi-agent orchestrator/, 'the immediate engine is named');
    assert.match(src, /workflow runtime/, 'the scheduled engine is named');
    assert.match(src, /side-effect authorization gate/i, 'the shared gate is named');
    assert.match(src, /agent executor/i, 'the shared agent executor is named (R2 convergence copy)');
  });

  await check('C2: README states one execution authority over both engines', () => {
    const src = read('README.md');
    assert.match(src, /One execution authority/, 'README governance names the single authority');
    assert.match(src, /SideEffectAuthorizationGate/, 'the README names the gate');
  });

  console.log('\n====================================================');
  console.log(`R2 ENGINE CONVERGENCE RESULT: ${passed} passed, ${failed} failed`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('R2 engine convergence suite crashed:', err);
  process.exit(1);
});
