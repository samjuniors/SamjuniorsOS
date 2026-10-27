/**
 * SamJuniorsOS — Gate G11.7: Continuity Evaluation Cold Process Child Runner
 *
 * Runs inside a FRESH, cold Node.js / Bun process with empty in-memory heap,
 * uninitialized store singletons, and cold context assemblers. Reads solely
 * from persistent SQLite database and durable storage to prove:
 *   1. 100% memory survival across process restart.
 *   2. Zero resurrection of deleted memories.
 *   3. Zero leakage of superseded facts as current truth.
 *   4. Zero boundary violations between personal and company contexts.
 *   5. Zero hallucination on unknown queries.
 *
 * Protocol:
 *   process.argv[2]: 'evaluate'
 *   process.argv[3]: JSON payload { founderId, markers }
 *   stdout: Single JSON line { ok: true, phaseResult }
 */

import { resolveSqliteDatabaseUrl } from '../../src/lib/server/db/database-url';
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolveSqliteDatabaseUrl(process.env.DATABASE_URL);
}

import { evaluateContinuityScenarios, ContinuityMarkers } from '../../scripts/evaluate-continuity';

// Pure stdout emission for child process contract
const emit = (payload: Record<string, unknown>) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

// Route console.log to stderr so child process stdout remains pure JSON
const originalLog = console.log;
console.log = (...args: unknown[]) => {
  console.error(...args);
};

async function main() {
  const mode = process.argv[2];
  if (mode !== 'evaluate') {
    emit({ ok: false, error: `Unknown mode "${mode}". Expected "evaluate".` });
    process.exit(1);
  }

  const rawPayload = process.argv[3];
  if (!rawPayload) {
    emit({ ok: false, error: 'Missing evaluation payload in process.argv[3].' });
    process.exit(1);
  }

  let payload: { founderId: string; markers: ContinuityMarkers };
  try {
    payload = JSON.parse(rawPayload);
  } catch (err: any) {
    emit({ ok: false, error: `Invalid JSON payload: ${err.message}` });
    process.exit(1);
  }

  const { founderId, markers } = payload;
  if (!founderId || !markers) {
    emit({ ok: false, error: 'Payload missing required founderId or markers.' });
    process.exit(1);
  }

  try {
    const phaseResult = await evaluateContinuityScenarios({
      founderId,
      markers,
      phase: 'post_restart',
    });

    emit({
      ok: true,
      phaseResult,
    });
    process.exit(0);
  } catch (err: any) {
    console.error('Continuity child evaluation failed:', err);
    emit({
      ok: false,
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

main();
