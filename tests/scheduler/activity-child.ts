/**
 * Phase 4.4C Activity restart-simulation child process.
 *
 * Runs in a FRESH bun process whose cwd is a TEMP directory pre-seeded with
 * the durable `.data` collections (workflow instances, definitions, agent
 * runs, approvals, audits) and a SQLite copy carrying the scheduled work
 * items — exactly the on-disk state a dev-server restart would find. The REAL
 * store singletons cold-start from that state, the REAL projection
 * (loadActivitySourceRecords + deriveActivityEvents) re-derives the company
 * Activity, and the event ids are printed for the parent to compare. This
 * proves Activity survives restart BECAUSE the authoritative records persist
 * (the projection holds no state of its own). Read-only: never writes.
 */
import { loadActivitySourceRecords, deriveActivityEvents } from "../../src/lib/server/activity/projection";

async function main() {
  const instanceId = process.argv[2];
  if (!instanceId) {
    console.log(JSON.stringify({ found: false, error: "missing instanceId argv" }));
    return;
  }
  // Cold start: every store singleton loads from <cwd>/.data (+ SQLite copy
  // for scheduled items) exactly as a restarted server process would.
  const sources = await loadActivitySourceRecords();
  const events = deriveActivityEvents(sources);
  const mine = events.filter((e) => e.provenance.workflowInstanceId === instanceId);
  console.log(
    JSON.stringify({
      found: mine.length > 0,
      eventIds: mine.map((e) => e.id),
      categories: mine.map((e) => e.category),
    })
  );
}

main();
