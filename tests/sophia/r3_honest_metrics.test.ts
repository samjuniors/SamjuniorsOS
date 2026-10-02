import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * ============================================================================
 * R3 HONEST-METRICS REGRESSION SUITE
 * ============================================================================
 *
 * Pins the R3 Honest-Metrics Closure on /api/agent-chat:
 *
 *   A. SOURCE-LEVEL — fabricated-value absence & honest wiring
 *      A1  the hardcoded placeholder metrics (5 / 20 / 2 / 27 / 80) are gone
 *      A2  the `executionResult.metrics || {…}` fabrication fallback is gone;
 *          the response carries the measured `turnMetrics` object
 *      A3  the existing TurnStopwatch is instantiated and fed genuine
 *          wall-clock phase timings (assembly, model) before finalize()
 *      A4  the idempotent-replay metrics are PRESERVED (truthful zeros:
 *          a replay performs no assembly/model/gateway work; tokens come
 *          from the original turn's persisted metadata)
 *      A5  the persisted assistant metadata carries the MEASURED token
 *          estimate (`tokens: turnMetrics.estimatedTokens`) so replays
 *          return the original turn's real numbers
 *
 *   B. FUNCTIONAL — a live turn through the real route handler, executed in
 *      an isolated scratch data directory (chdir before any store singleton
 *      constructs — the m5.2 isolation contract; the repo's real .data is
 *      never touched):
 *      B1  measured-or-absent: latencies are real measurements with internal
 *          consistency; unmeasurable fields (gatewayValidationMs, retrievalMs)
 *          are ABSENT, never zero-filled; output tokens are derived from the
 *          actual reply length
 *      B2  replay behavior: same conversation + idempotency key returns the
 *          cached reply with idempotentReplay, zero latencies, and the
 *          ORIGINAL turn's persisted token estimates
 *
 * The live turn exercises the real provider once (intent classification),
 * exactly like the m3 convergence suite; provider 429s degrade to the
 * deterministic classifier fallback, which still produces measured metrics.
 */

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** Strip block + full-line comments so explanatory text can never satisfy
 *  an absence check (the r2 suite's established helper). */
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
  const ROUTE = 'src/app/api/agent-chat/route.ts';
  const routeCode = codeOnly(read(ROUTE));

  console.log('\n====================================================');
  console.log('A. SOURCE-LEVEL — fabricated-value absence & wiring');
  console.log('====================================================');

  await check('A1: the hardcoded placeholder metrics are gone (5 / 20 / 2 / 27 / 80)', () => {
    const fabricated: Array<[string, RegExp]> = [
      ['contextAssemblyMs: 5', /contextAssemblyMs:\s*5\b/],
      ['modelMs: 20', /modelMs:\s*20\b/],
      ['gatewayValidationMs: 2', /gatewayValidationMs:\s*2\b/],
      ['totalTurnMs: 27', /totalTurnMs:\s*27\b/],
      ['estimatedTokens output: 80', /output:\s*80\b/],
    ];
    for (const [label, pattern] of fabricated) {
      assert.ok(
        !pattern.test(routeCode),
        `the fabricated literal "${label}" must not appear in executable route code`
      );
    }
  });

  await check('A2: the metrics fabrication fallback is replaced by the measured turnMetrics object', () => {
    assert.ok(
      !/metrics:\s*executionResult\.metrics\s*\|\|/.test(routeCode),
      'the `executionResult.metrics || {fabricated}` fallback must be gone'
    );
    assert.match(routeCode, /metrics:\s*turnMetrics,/, 'the live response must return turnMetrics');
  });

  await check('A3: the existing TurnStopwatch is wired with genuine phase timings', () => {
    assert.match(routeCode, /new TurnStopwatch\(\)/, 'one stopwatch per live turn');
    assert.match(routeCode, /stopwatch\.recordContextAssembly\(/, 'assembly duration recorded');
    assert.match(routeCode, /stopwatch\.recordModel\(/, 'model (intent-classification) duration recorded');
    assert.match(routeCode, /stopwatch\.finalize\(\)/, 'metrics finalized from the stopwatch');
  });

  await check('A4: the idempotent-replay metrics semantics are preserved (truthful zeros)', () => {
    assert.match(routeCode, /idempotentReplay:\s*true/, 'replay responses are marked');
    assert.match(routeCode, /contextAssemblyMs:\s*0/, 'replay reports zero assembly work');
    assert.match(
      routeCode,
      /metadata\?\.tokens\s*\|\|\s*\{\s*input:\s*0,\s*output:\s*0\s*\}/,
      'replay token fallback for pre-R3 messages is preserved'
    );
  });

  await check('A5: the assistant metadata persists the MEASURED token estimate', () => {
    assert.match(
      routeCode,
      /tokens:\s*turnMetrics\.estimatedTokens/,
      'metadata.tokens must derive from the measured metrics, not a constant'
    );
  });

  console.log('\n====================================================');
  console.log('B. FUNCTIONAL — live turn through the real route (scratch data dir)');
  console.log('====================================================');

  // Isolation: bind every store singleton to a scratch directory BEFORE the
  // route module (and its lazily-constructed singletons) first executes.
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-r3-metrics-'));
  process.chdir(scratchDir);
  const { POST } = await import('../../src/app/api/agent-chat/route');
  const { NextRequest } = await import('next/server');

  const founderHeaders: Record<string, string> = {
    'content-type': 'application/json',
    'x-samjuniors-role': 'FOUNDER',
    'x-samjuniors-user-id': 'founder-r3-metrics-test',
  };

  function postTurn(body: Record<string, unknown>): Promise<{ status: number; data: any }> {
    const req = new NextRequest('http://localhost:3000/api/agent-chat', {
      method: 'POST',
      headers: founderHeaders,
      body: JSON.stringify(body),
    });
    return POST(req).then(async (res: any) => ({ status: res.status, data: await res.json() }));
  }

  const message = 'R3 honest-metrics probe: what is the current company runway?';
  const idempotencyKey = `r3-metrics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let conversationId = '';
  let firstMetrics: any = null;
  let firstReply = '';

  await check('B1: live turn returns measured-or-absent metrics (no fabricated values)', async () => {
    const { status, data } = await postTurn({
      agentId: 'coo',
      message,
      idempotencyKey,
      executeDirective: false,
    });
    assert.strictEqual(status, 200, `turn must succeed (got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
    assert.ok(data.success !== false, 'turn must report success');
    assert.ok(data.metrics, 'the live response must carry a metrics object');

    const metrics = data.metrics;
    firstMetrics = metrics;
    firstReply = data.reply ?? '';
    conversationId = data.conversationId;

    // Measured fields: real non-negative integers with internal consistency.
    for (const field of ['contextAssemblyMs', 'modelMs', 'totalTurnMs']) {
      assert.ok(
        typeof metrics[field] === 'number' && Number.isFinite(metrics[field]) && metrics[field] >= 0,
        `${field} must be a measured non-negative number (got ${metrics[field]})`
      );
    }
    assert.ok(
      metrics.totalTurnMs >= metrics.contextAssemblyMs + metrics.modelMs,
      `totalTurnMs (${metrics.totalTurnMs}) must cover assembly (${metrics.contextAssemblyMs}) + model (${metrics.modelMs})`
    );

    // Absent fields: unmeasurable at this boundary — omitted, never zero-filled.
    assert.ok(!('gatewayValidationMs' in metrics), 'gatewayValidationMs must be omitted (not measurable here)');
    assert.ok(!('retrievalMs' in metrics), 'retrievalMs must be omitted (not measurable here)');

    // Token estimates derived from the actual reply/message lengths.
    assert.ok(metrics.estimatedTokens && typeof metrics.estimatedTokens === 'object', 'estimatedTokens present');
    assert.strictEqual(
      metrics.estimatedTokens.output,
      Math.ceil(firstReply.length / 4),
      'output tokens must be derived from the actual reply length'
    );
    assert.ok(
      metrics.estimatedTokens.input >= Math.ceil(message.length / 4),
      `input tokens (${metrics.estimatedTokens.input}) must account for the message (${Math.ceil(message.length / 4)})`
    );

    // Genuine assembly signals.
    assert.strictEqual(typeof metrics.retrievalHit, 'boolean', 'retrievalHit is a boolean from assembly');
    if ('degradedStores' in metrics) {
      assert.ok(Array.isArray(metrics.degradedStores), 'degradedStores, when present, is an array');
    }

    // Not a replay.
    assert.ok(!data.idempotentReplay, 'a live turn must not be marked as a replay');
  });

  await check('B2: replaying the same idempotency key returns truthful zeros + original token estimates', async () => {
    const { status, data } = await postTurn({
      agentId: 'coo',
      message,
      conversationId,
      idempotencyKey,
      executeDirective: false,
    });
    assert.strictEqual(status, 200, `replay must succeed (got ${status})`);
    assert.strictEqual(data.idempotentReplay, true, 'the replay must be marked idempotentReplay');
    assert.strictEqual(data.reply, firstReply, 'the replay returns the cached reply');
    assert.strictEqual(data.conversationId, conversationId, 'the replay stays on the same conversation');

    const metrics = data.metrics;
    assert.ok(metrics, 'replay response carries metrics');
    for (const field of ['contextAssemblyMs', 'modelMs', 'gatewayValidationMs', 'totalTurnMs']) {
      assert.strictEqual(
        metrics[field],
        0,
        `replay ${field} must be the truthful zero (no work performed), got ${metrics[field]}`
      );
    }
    assert.deepStrictEqual(
      metrics.estimatedTokens,
      firstMetrics.estimatedTokens,
      'replay tokens must be the ORIGINAL turn\'s persisted estimates'
    );
  });

  console.log('\n====================================================');
  console.log(`R3 HONEST-METRICS RESULT: ${passed} passed, ${failed} failed`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('R3 honest-metrics suite crashed:', err);
  process.exit(1);
});
