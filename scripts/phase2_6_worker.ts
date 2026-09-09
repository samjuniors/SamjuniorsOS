/**
 * PHASE 2.6 — Independent worker process for multi-process contention testing.
 *
 * Each invocation is a SEPARATE OS process with its own PrismaClient and its
 * own connection pool. All worker processes hammer the same resource keys
 * concurrently; the parent test process verifies the durable invariants.
 *
 * Usage: bun scripts/phase2_6_worker.ts <iterations> <prefix> <workerTag> <startAtEpochMs>
 * Environment: DATABASE_URL + DATABASE_MODE=authoritative (inherited from parent).
 *
 * Prints a single machine-readable line: RESULT {"leaseWins":N,"idemWins":N,...}
 * Exits 0 on clean completion, 1 on unexpected fatal error.
 */

import { PostgresLeaseManager } from '../lib/server/coordination/lease-manager';
import { PostgresIdempotencyStore } from '../lib/server/idempotency/store';
import { PostgresWorkflowStore } from '../lib/server/workflow/store';
import { PostgresApprovalStore } from '../lib/server/authorization/approval-store';
import { isDatabaseAvailable } from '../lib/server/db/prisma';

async function main() {
  const iterations = parseInt(process.argv[2] || '10', 10);
  const prefix = process.argv[3] || 'p26-mp';
  const tag = process.argv[4] || `worker-${process.pid}`;
  const startAt = parseInt(process.argv[5] || '0', 10);

  const online = await isDatabaseAvailable();
  if (!online) {
    console.error('WORKER FATAL: PostgreSQL unreachable');
    process.exit(1);
  }

  // Simultaneous start barrier so all processes contend at the same instant
  const waitMs = startAt - Date.now();
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

  const leaseMgr = PostgresLeaseManager.getInstance();
  const idemStore = PostgresIdempotencyStore.getInstance();
  const wfStore = PostgresWorkflowStore.getInstance();
  const apprStore = PostgresApprovalStore.getInstance();

  let leaseWins = 0;
  let idemWins = 0;
  let approvalWins = 0;
  let claimWins = 0;
  let errors = 0;

  for (let i = 0; i < iterations; i++) {
    // 1. Distributed lease contention
    try {
      const r = await leaseMgr.acquire(`${prefix}-lease-${i}`, tag, 30000);
      if (r.acquired) leaseWins++;
    } catch {
      errors++;
    }

    // 2. Idempotency claim contention (losers throw OperationInProgressError)
    try {
      const r = await idemStore.claim({
        key: `${prefix}-idem-${i}`,
        actionName: 'p26.probe',
        payloadHash: `hash-${prefix}-${i}`,
        executionRef: tag,
      });
      if (r.state === 'claimed') idemWins++;
    } catch {
      // Expected for losers: OperationInProgressError
    }

    // 3. Single-use approval consumption contention (losers throw ApprovalAlreadyConsumedError)
    try {
      await apprStore.consume(`${prefix}-appr-${i}`);
      approvalWins++;
    } catch {
      // Expected for losers
    }

    // 4. Workflow step claim contention (losers throw StepClaimError/ConcurrencyConflictError)
    try {
      await wfStore.claimStepAtomic(`${prefix}-inst-${i}`, 'step-1', tag);
      claimWins++;
    } catch {
      // Expected for losers
    }
  }

  console.log(
    `RESULT ${JSON.stringify({
      tag,
      iterations,
      leaseWins,
      idemWins,
      approvalWins,
      claimWins,
      errors,
    })}`
  );
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('WORKER FATAL:', err);
  process.exit(1);
});
