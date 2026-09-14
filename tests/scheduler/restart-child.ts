/**
 * Phase 4.4B restart-simulation child process.
 *
 * Runs in a FRESH bun process so the InMemoryScheduledWorkStore singleton
 * starts genuinely cold (empty map, recovery armed) — exactly the state of a
 * dev-server restart. Prints the due-work list as JSON for the parent test.
 * Read-only: never writes, never mutates.
 */
import { InMemoryScheduledWorkStore } from "../../src/lib/server/workflow/scheduler-store";

async function main() {
  const store = InMemoryScheduledWorkStore.getInstance();
  const due = await store.listDue();
  console.log(
    JSON.stringify(
      due.map((i) => ({
        id: i.id,
        status: i.status,
        workflowInstanceId: i.workflowInstanceId,
        intervalUnit: i.recurrence?.intervalUnit,
        currentOccurrence: i.recurrence?.currentOccurrence,
      }))
    )
  );
}

main();
