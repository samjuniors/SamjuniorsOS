import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { SophiaContextAssembler, SophiaServerGateway, TurnStopwatch } from '../../src/lib/server/sophia';
import { CompanyStateStore } from '../../src/lib/server/state/state-store';
import { CompanyMemoryStore } from '../../src/lib/server/memory/memory-store';
import { AgentRunStore } from '../../src/lib/server/agents/run-store';
import { CompanyContextProvider } from '../../src/lib/server/context/company-context';
import {
  INITIAL_INITIATIVES,
  SAMPLE_FINANCIAL_MODEL,
} from '../../src/lib/os-data';

/**
 * ============================================================================
 * M1 REGRESSION SUITE — CANONICAL OPERATIONAL-STATE AUTHORITY
 * ============================================================================
 *
 * Proves the M1 wiring mandated by the Founder-approved reconciliation plan
 * (docs/architecture/MEMORY_RECONCILIATION_REPORT.md, migration step M1):
 *
 *   "Sophia slice 1 / ServerGateway / agent-chat and advisor consume the
 *    canonical state path — a CompanyState update reaches Sophia context."
 *
 * Before M1, Sophia's AUTHORITATIVE_OPERATIONAL_STATE slice and the
 * ServerGateway's company_metrics answer read HARDCODED os-data constants
 * through CompanyContextProvider, so CompanyStateStore updates could never
 * reach any consumer. These tests pin the fixed behavior.
 *
 * Deterministic by construction: the ServerGateway is invoked directly with
 * synthetic proposals (no live-LLM dependency).
 */

const DATA_DIR = path.resolve(process.cwd(), '.data');

/**
 * P2 FOLLOW-UP (test isolation): every .data file this suite touches is
 * snapshotted BEFORE the run and restored AFTER — the previous finally
 * re-SEEDED company knowledge/memory collections (leaving
 * company_knowledge.json + instance.lock behind on fresh .data) and only
 * handled company_state.json explicitly. Snapshot-restore is exact for
 * both cases: pre-existing files return to their original bytes, files the
 * suite created are removed. instance.lock is included so a stale lock
 * with this process's PID never outlives the run.
 */
const TOUCHED_DATA_FILES = [
  'company_state.json',
  'company_knowledge.json',
  'company_memories.json',
  'agent_runs.json',
  'epistemic_claims.json',
  'idempotency_records.json',
  'instance.lock',
].map((name) => path.join(DATA_DIR, name));
const TOUCHED_SNAPSHOTS: Array<{ file: string; original: string | null }> = [];

function snapshotTouchedDataFiles(): void {
  for (const file of TOUCHED_DATA_FILES) {
    TOUCHED_SNAPSHOTS.push({
      file,
      original: fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null,
    });
  }
}

function restoreTouchedDataFiles(): void {
  for (const { file, original } of TOUCHED_SNAPSHOTS) {
    try {
      if (original !== null) {
        fs.writeFileSync(file, original, 'utf-8');
      } else if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch {
      // best-effort restore (same contract as before)
    }
  }
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failed++;
    process.exitCode = 1;
  }
}

function restoreCanonicalOperationalState(): void {
  try {
    const stateStore = CompanyStateStore.getInstance();
    // Best-effort in-process restore of the canonical seed state.
    (stateStore as any).initiatives = [...INITIAL_INITIATIVES];
    (stateStore as any).financialModel = { ...SAMPLE_FINANCIAL_MODEL };
  } catch {
    // best-effort only
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('M1 CANONICAL STATE AUTHORITY REGRESSION SUITE');
  console.log('======================================================\n');

  // --- .data isolation: back up every touched durable file (P2 follow-up) ---
  snapshotTouchedDataFiles();

  let originalMrr: number;
  let originalBurn: number;
  let originalInitiativeCount: number;

  try {
    // ------------------------------------------------------------------
    // Baseline capture (canonical seeds via the state store)
    // ------------------------------------------------------------------
    const stateStore = CompanyStateStore.getInstance();
    const baselineFin = await stateStore.getFinancialMetrics();
    const baselineInitiatives = await stateStore.getInitiatives();
    originalMrr = baselineFin.mrr;
    originalBurn = baselineFin.burnRate;
    originalInitiativeCount = baselineInitiatives.length;

    await test('1. CompanyStateStore baseline serves the canonical seed financial model', async () => {
      assert.strictEqual(baselineFin.mrr, SAMPLE_FINANCIAL_MODEL.mrr);
      assert.strictEqual(baselineFin.burnRate, SAMPLE_FINANCIAL_MODEL.burnRate);
      assert.ok(baselineInitiatives.length > 0, 'Canonical seed initiatives must be present');
    });

    // ------------------------------------------------------------------
    // 2. THE CORE M1 REGRESSION: a CompanyStateStore financial update
    //    reaches Sophia's AUTHORITATIVE_OPERATIONAL_STATE slice within
    //    one assembly turn.
    // ------------------------------------------------------------------
    await test('2. CompanyStateStore financial update reaches Sophia context slice 1 within one turn', async () => {
      const TEST_MRR = 262500;
      const TEST_BURN = 31800;
      await stateStore.updateFinancialMetrics({ mrr: TEST_MRR, burnRate: TEST_BURN });

      const assembled = await SophiaContextAssembler.assemble({
        message: 'What is our current MRR and burn rate?',
      });

      const opSlice = assembled.slices.find((s) => s.authority === 'AUTHORITATIVE_OPERATIONAL_STATE');
      assert.ok(opSlice, 'Operational state slice must exist');
      assert.ok(
        opSlice.content.includes(`$${TEST_MRR.toLocaleString()}`),
        `Sophia slice 1 must contain the UPDATED MRR ($${TEST_MRR.toLocaleString()}), got:\n${opSlice.content}`
      );
      assert.ok(
        opSlice.content.includes(`$${TEST_BURN.toLocaleString()}`),
        `Sophia slice 1 must contain the UPDATED burn rate ($${TEST_BURN.toLocaleString()})`
      );
      assert.ok(
        !opSlice.content.includes(`$${originalMrr.toLocaleString()}`),
        'The STALE seed MRR must no longer appear in the slice (constants authority is dead)'
      );
      assert.strictEqual(opSlice.provenance, 'CompanyStateStore (canonical operational state)');
    });

    // ------------------------------------------------------------------
    // 3. CompanyStateStore initiative update reaches Sophia slice 1
    // ------------------------------------------------------------------
    await test('3. CompanyStateStore initiative update reaches Sophia context slice 1', async () => {
      const modifiedInitiatives: typeof baselineInitiatives = baselineInitiatives.map((i, idx) =>
        idx === 0
          ? { ...i, title: 'M1 Canonical State Verification Initiative', status: 'Active' as const }
          : i
      );
      await stateStore.setInitiatives(modifiedInitiatives);

      const assembled = await SophiaContextAssembler.assemble({
        message: 'What active strategic initiatives are running?',
      });
      const opSlice = assembled.slices.find((s) => s.authority === 'AUTHORITATIVE_OPERATIONAL_STATE');
      assert.ok(opSlice, 'Operational state slice must exist');
      assert.ok(
        opSlice.content.includes('M1 Canonical State Verification Initiative'),
        `Sophia slice 1 must reflect the state-store initiative update, got:\n${opSlice.content}`
      );
    });

    // ------------------------------------------------------------------
    // 4. ServerGateway company_metrics answers from the canonical store
    // ------------------------------------------------------------------
    await test('4. ServerGateway company_metrics answer reflects the canonical CompanyStateStore financial model', async () => {
      const TEST_MRR_2 = 271000;
      await stateStore.updateFinancialMetrics({ mrr: TEST_MRR_2 });

      const stopwatch = new TurnStopwatch();
      const metrics = stopwatch.finalize();
      const result = await SophiaServerGateway.process({
        proposal: {
          kind: 'informational_query',
          confidence: 0.95,
          reason: 'Founder requesting company telemetry',
          domain: 'company_metrics',
        } as any,
        context: await SophiaContextAssembler.assemble({ message: 'What is our MRR?' }),
        session: { role: 'FOUNDER', founderId: 'founder_primary_001' },
        message: 'What is our current MRR?',
        metrics,
      });

      assert.strictEqual(result.success, true);
      assert.ok(
        (result.reply as string).includes(`$${TEST_MRR_2.toLocaleString()}`),
        `Gateway reply must carry the canonical MRR $${TEST_MRR_2.toLocaleString()}, got:\n${result.reply}`
      );
      assert.ok(
        ((result.validatedCommand as any)?.provenance || []).some((p: string) => p.includes('CompanyStateStore')),
        `Provenance must cite CompanyStateStore, got: ${JSON.stringify((result.validatedCommand as any)?.provenance)}`
      );
      assert.strictEqual(
        (result.authoritativeData as any)?.mrr,
        TEST_MRR_2,
        'authoritativeData must be the canonical financial model object'
      );
    });

    // ------------------------------------------------------------------
    // 5. CompanyContextProvider (advisor / agent-chat path) assembles from
    //    the canonical stores — no constants authority, no parallel memory.
    // ------------------------------------------------------------------
    await test('5. CompanyContextProvider.getMergedContext assembles canonical state, memory, and runs', async () => {
      // 5a. Financial + initiatives come from the state store.
      const ctx = await CompanyContextProvider.getMergedContext();
      const currentFin = await stateStore.getFinancialMetrics();
      assert.strictEqual(ctx.financialModel.mrr, currentFin.mrr);
      assert.strictEqual(ctx.financialModel.burnRate, currentFin.burnRate);
      assert.ok(
        ctx.initiatives.some((i) => i.title.startsWith('M1 Canonical')),
        'Provider initiatives must come from the state store, not os-data constants'
      );

      // 5b. Company memory comes from the canonical CompanyMemoryStore.
      const markerMemory = {
        id: 'mem-m1-provider-check',
        decisionId: 'dec-m1-provider-check',
        approvedAction: 'M1 provider canonical-memory verification record',
        executionOutcome: 'Verified the provider reads CompanyMemoryStore',
        evidenceReferences: ['m1-regression-suite'],
        epistemicConfidence: 'high_confidence' as const,
        timestamp: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
      };
      await CompanyMemoryStore.getInstance().recordMemory(markerMemory);
      const ctx2 = await CompanyContextProvider.getMergedContext();
      assert.ok(
        ctx2.companyMemory.some((m) => m.id === 'mem-m1-provider-check'),
        'Provider companyMemory must be sourced from CompanyMemoryStore (parallel serverCompanyMemory deleted)'
      );

      // 5c. Advisory prompt renders the marker memory with the historical
      //     grounding disclaimer (authority labeling preserved).
      const prompt = CompanyContextProvider.formatForAdvisorPrompt(ctx2);
      assert.ok(prompt.includes('M1 provider canonical-memory verification record'));
      assert.ok(prompt.includes('Historical memory must NEVER be presented as new or current empirical evidence.'));

      // 5d. Orchestration history comes from the canonical AgentRunStore.
      await AgentRunStore.getInstance().saveRun({
        runId: 'run-m1-provider-check',
        agentId: 'coo',
        agentName: 'Sophia Vance',
        protocolStep: 'understand',
        taskTitle: 'M1 Provider Run',
        directive: 'Verify provider run sourcing',
        status: 'completed',
        durationMs: 42,
        outputContent: 'Canonical run store verified',
        provenance: {
          agentId: 'coo',
          timestamp: new Date().toISOString(),
          confidence: 'high_confidence',
        } as any,
        timestamp: new Date().toISOString(),
      });
      const ctx3 = await CompanyContextProvider.getMergedContext();
      assert.ok(
        ctx3.orchestrationHistory.some((r) => r.id === 'run-m1-provider-check'),
        'Provider orchestrationHistory must be adapted from AgentRunStore records'
      );
    });

    // ------------------------------------------------------------------
    // 6. Constitution remains a static charter (not operational state).
    // ------------------------------------------------------------------
    await test('6. CompanyContextProvider.getCompanyConstitution exposes the static charter', async () => {
      const constitution = CompanyContextProvider.getCompanyConstitution();
      assert.strictEqual(constitution.name, 'SamJuniors OS');
      assert.ok(constitution.operatingPrinciples.length > 0);
    });

    // ------------------------------------------------------------------
    // 7. Slice 1 fails soft when the state store is unreachable.
    // ------------------------------------------------------------------
    await test('7. Sophia slice 1 fails soft (degraded, not crashed) when the state store throws', async () => {
      const stateStoreAny = CompanyStateStore.getInstance() as any;
      const original = stateStoreAny.getFinancialMetrics;
      stateStoreAny.getFinancialMetrics = async () => {
        throw new Error('simulated state-store outage');
      };
      try {
        const assembled = await SophiaContextAssembler.assemble({ message: 'What is our MRR?' });
        const opSlice = assembled.slices.find((s) => s.authority === 'AUTHORITATIVE_OPERATIONAL_STATE');
        assert.ok(opSlice, 'Slice must still exist');
        assert.strictEqual(opSlice.isStale, true, 'Slice must be marked stale/degraded');
        assert.ok(assembled.degradedStores?.includes('CompanyStateStore'), 'CompanyStateStore must be recorded as degraded');
      } finally {
        stateStoreAny.getFinancialMetrics = original;
      }
    });

  } finally {
    // --- restore environment so the dev app is unaffected (P2 follow-up:
    // exact snapshot-restore of every touched .data file — no re-seeded
    // leftovers on fresh .data, no stale instance.lock with a dead PID) ---
    try {
      restoreCanonicalOperationalState();
      restoreTouchedDataFiles();
    } catch {}
  }

  console.log('\n======================================================');
  console.log(`M1 REGRESSION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');
}

/**
 * P2 FOLLOW-UP (test isolation — same fix as the M0 suite): under `bun test`
 * the runner force-exits after module evaluation when no bun:test tests
 * are registered, killing the async suite's pending timers BEFORE the
 * finally cleanup runs (this is exactly how the M0 leftover state was
 * produced in the phase-2 audit). Registering the suite as a REAL bun:test
 * when the runner is detected makes the runner await it to completion;
 * under `bun run` the registration throws ("Cannot use test outside of the
 * test runner") and the classic module-level invocation below drives it —
 * unchanged protocol, single execution under both runners.
 */
(async () => {
  let registered = false;
  try {
    const bunTest: any = await import('bun:test');
    const testFn = bunTest.test ?? bunTest.default?.test;
    if (typeof testFn === 'function') {
      testFn('M1 canonical state authority regression suite (async)', async () => {
        await runTests();
        if (failed > 0) {
          throw new Error(`${failed} M1 test(s) failed — see the log above`);
        }
      });
      registered = true;
    }
  } catch {
    // Not under the bun test runner (normal `bun run` protocol) — fall through.
  }
  if (!registered) {
    runTests().catch((err) => {
      console.error('M1 suite crashed:', err);
      process.exitCode = 1;
    });
  }
})();
