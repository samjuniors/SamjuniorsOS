/**
 * Phase 4.4B.1 attribution restart-simulation child process.
 *
 * Runs in a FRESH bun process whose cwd is a TEMP directory pre-seeded with
 * a `.data/workflow_instances.json` durable snapshot — exactly the on-disk
 * state a dev-server restart would find. The real InMemoryWorkflowStore
 * singleton cold-starts from that file (loadFromDurableStorage at
 * construction) and the test asserts the recovered instance retains the
 * founder attribution (initiatedById). Read-only: never writes.
 */
import { InMemoryWorkflowStore } from "../../src/lib/server/workflow/store";

async function main() {
  const instanceId = process.argv[2];
  if (!instanceId) {
    console.log(JSON.stringify({ found: false, error: "missing instanceId argv" }));
    return;
  }
  const store = InMemoryWorkflowStore.getInstance(); // cold start: loads .data
  const inst = await store.getInstance(instanceId);
  console.log(
    JSON.stringify({
      found: !!inst,
      initiatedById: inst?.initiatedById ?? null,
      status: inst?.status ?? null,
      objective: inst?.objective ?? null,
    })
  );
}

main();
