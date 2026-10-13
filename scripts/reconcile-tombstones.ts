/**
 * Script: scripts/reconcile-tombstones.ts
 *
 * Operational Runbook Script for Sophia Conversation Tombstone Reconciliation.
 *
 * OPERATIONAL PURPOSE:
 * Performs store-wide sweep of conversation tombstones:
 * 1. Sweeps and purges any lingering orphaned local file records (conversations.json,
 *    chat_messages.json) left by crashed or interrupted deletion cascades.
 * 2. Reconciles pending Prisma mirror deletions for tombstoned conversations
 *    (e.g., if database was unreachable during initial deletion).
 * 3. Persists reconciliation state (`prismaReconciled: true`) only upon confirmed
 *    deletion or confirmed already-absent record (P2025).
 * 4. Fails closed with non-zero exit code (1) if any Prisma mirror remains pending
 *    or if local file cleanup encounters errors.
 *
 * INVOCATION:
 *   npx tsx scripts/reconcile-tombstones.ts
 *   npm run db:reconcile-tombstones
 */

import { ConversationStore, ReconcileResult } from '../src/lib/server/conversation/store';
import { DurableFileStore, CriticalCollectionCorruptionError } from '../src/lib/server/persistence/durable-file-store';

export interface RunReconcileOptions {
  convStore?: ConversationStore;
  fileStore?: DurableFileStore;
  log?: (msg: string) => void;
  error?: (msg: string) => void;
  warn?: (msg: string) => void;
}

export interface RunReconcileOutput {
  exitCode: number;
  totalTombstones: number;
  initialPendingPrisma: number;
  result: ReconcileResult;
}

export async function runReconcile(options?: RunReconcileOptions): Promise<RunReconcileOutput> {
  const log = options?.log ?? console.log;
  const error = options?.error ?? console.error;

  log('\n======================================================');
  log('SAMJUNIORS-OS: CONVERSATION TOMBSTONE RECONCILIATION');
  log('======================================================\n');

  const fileStore = options?.fileStore ?? DurableFileStore.getInstance();
  const convStore = options?.convStore ?? ConversationStore.getInstance();

  let tombstones: Record<string, any>;
  try {
    // readCollection routes registered critical ledgers through fail-closed
    // validation and quarantine. Never continue with an assumed-empty ledger.
    tombstones = fileStore.readCollection<any>('conversation_tombstones');
  } catch (err: any) {
    if (err instanceof CriticalCollectionCorruptionError) {
      error(`[Fatal] Critical tombstone ledger is not trustworthy: ${err.message}`);
      error('[Recovery] Keep traffic stopped. Restore the matching ledger and initialization marker from a verified backup, then rerun reconciliation.');
    }
    throw err;
  }
  const totalTombstones = Object.keys(tombstones).length;
  const initialPendingPrisma = Object.values(tombstones).filter((t: any) => t && !t.prismaReconciled).length;

  log(`[Status] Total durable tombstones: ${totalTombstones}`);
  log(`[Status] Pending Prisma reconciliation: ${initialPendingPrisma}`);

  log('\n[Action] Running store-wide reconciliation pass...');
  const start = Date.now();
  const result = await convStore.reconcileAllTombstones();
  const elapsed = Date.now() - start;

  log(`[Result] Reconciled Prisma mirrors : ${result.reconciledPrismaCount}`);
  log(`[Result] Cleaned local file orphans: ${result.cleanedLocalCount}`);
  log(`[Result] Failed local cleanup ops  : ${result.failedLocalCount}`);
  log(`[Result] Remaining pending Prisma  : ${result.pendingPrismaCount}`);
  log(`[Result] Completed in              : ${elapsed}ms\n`);

  let exitCode = 0;

  if (result.failedLocalCount > 0) {
    error(`[Error] Local file cleanup failed for ${result.failedLocalCount} record(s).`);
    if (result.errors) {
      result.errors.forEach((e) => error(`  - ${e}`));
    }
    exitCode = 1;
  }

  if (result.pendingPrismaCount > 0) {
    error(`[Error] ${result.pendingPrismaCount} tombstone(s) still pending Prisma reconciliation.`);
    error('Verify database connectivity and rerun when database is available.');
    exitCode = 1;
  }

  if (exitCode === 0 && result.success) {
    log('[Success] All conversation tombstones are fully reconciled.\n');
  } else {
    error('[Failure] Tombstone reconciliation did not complete successfully. Work remains pending for retry.\n');
  }

  return {
    exitCode,
    totalTombstones,
    initialPendingPrisma,
    result,
  };
}

async function main() {
  const { exitCode } = await runReconcile();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

// Only run automatically if executed directly as entrypoint
if (
  process.argv[1] &&
  (process.argv[1].endsWith('reconcile-tombstones.ts') || process.argv[1].endsWith('reconcile-tombstones.js'))
) {
  main().catch((err) => {
    console.error('[Fatal] Tombstone reconciliation crashed:', err);
    process.exit(1);
  });
}
