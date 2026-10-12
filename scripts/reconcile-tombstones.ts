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
 *
 * INVOCATION:
 *   npx tsx scripts/reconcile-tombstones.ts
 */

import { ConversationStore } from '../src/lib/server/conversation/store';
import { DurableFileStore } from '../src/lib/server/persistence/durable-file-store';

async function main() {
  console.log('\n======================================================');
  console.log('SAMJUNIORS-OS: CONVERSATION TOMBSTONE RECONCILIATION');
  console.log('======================================================\n');

  const fileStore = DurableFileStore.getInstance();
  const convStore = ConversationStore.getInstance();

  const tombstones = fileStore.readCollection<any>('conversation_tombstones');
  const totalTombstones = Object.keys(tombstones).length;
  const pendingPrisma = Object.values(tombstones).filter((t: any) => t && !t.prismaReconciled).length;

  console.log(`[Status] Total durable tombstones: ${totalTombstones}`);
  console.log(`[Status] Pending Prisma reconciliation: ${pendingPrisma}`);

  console.log('\n[Action] Running store-wide reconciliation pass...');
  const start = Date.now();
  const result = await convStore.reconcileAllTombstones();
  const elapsed = Date.now() - start;

  console.log(`[Result] Reconciled Prisma mirrors : ${result.reconciledPrismaCount}`);
  console.log(`[Result] Cleaned local file orphans: ${result.cleanedLocalCount}`);
  console.log(`[Result] Completed in              : ${elapsed}ms\n`);

  const remainingPending = Object.values(
    fileStore.readCollection<any>('conversation_tombstones')
  ).filter((t: any) => t && !t.prismaReconciled).length;

  if (remainingPending > 0) {
    console.warn(`[Warning] ${remainingPending} tombstone(s) still pending Prisma reconciliation.`);
    console.warn(`Verify database connectivity and rerun when database is available.\n`);
  } else {
    console.log('[Success] All conversation tombstones are fully reconciled.\n');
  }
}

main().catch((err) => {
  console.error('[Fatal] Tombstone reconciliation failed:', err);
  process.exit(1);
});
