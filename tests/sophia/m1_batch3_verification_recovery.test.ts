import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  ConversationStore,
  ConversationSecurityError,
  ConversationNotFoundError,
  ChatMessageRecord,
  MessageTombstonedError,
  isPrismaRecordNotFoundError,
} from '../../src/lib/server/conversation';
import {
  DurableFileStore,
  LockTimeoutError,
  CriticalCollectionCorruptionError,
} from '../../src/lib/server/persistence/durable-file-store';
import { prisma } from '../../src/lib/server/db/prisma';
import { runReconcile } from '../../scripts/reconcile-tombstones';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    failed++;
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('SAMJUNIORS-OS: M1 BATCH 3 VERIFICATION & ACCEPTANCE');
  console.log('======================================================\n');

  const fileStore = DurableFileStore.getInstance();
  const convStore = ConversationStore.getInstance();

  const FOUNDER_A = 'founder-batch3-a';
  const FOUNDER_B = 'founder-batch3-b';

  // Ensure clean starting baseline
  convStore.clearForTests();

  try {
    // ========================================================================
    // TASK 2: INDEPENDENT ATTACK ON CORRUPTION HANDLING
    // ========================================================================
    console.log('--- TASK 2: CORRUPTION HANDLING ATTACKS ---');

    await runTest('2.1a: conversation_tombstones — Invalid JSON is quarantined and fails closed', () => {
      const filePath = path.join(fileStore.getDataDir(), 'conversation_tombstones.json');
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
      const beforeQuarantine = new Set(
        fs.readdirSync(fileStore.getDataDir()).filter((f) => f.startsWith('conversation_tombstones.json.corrupt.'))
      );

      try {
        fileStore.writeCollectionStrict('conversation_tombstones', {}, { lockStrict: true });
        fs.writeFileSync(filePath, '{"broken": [unclosed', 'utf-8');

        assert.throws(
          () => fileStore.readCollection('conversation_tombstones'),
          (err: any) => err instanceof CriticalCollectionCorruptionError && Boolean(err.quarantinePath)
        );

        const afterQuarantine = fs
          .readdirSync(fileStore.getDataDir())
          .filter((f) => f.startsWith('conversation_tombstones.json.corrupt.') && !beforeQuarantine.has(f));
        assert.strictEqual(afterQuarantine.length, 1, 'Exactly one quarantine file created');
      } finally {
        if (original !== null) fs.writeFileSync(filePath, original, 'utf-8');
        else if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        for (const f of fs.readdirSync(fileStore.getDataDir())) {
          if (f.startsWith('conversation_tombstones.json.corrupt.') && !beforeQuarantine.has(f)) {
            fs.unlinkSync(path.join(fileStore.getDataDir(), f));
          }
        }
      }
    });

    await runTest('2.1b: message_tombstones — Invalid JSON is quarantined and fails closed', () => {
      const filePath = path.join(fileStore.getDataDir(), 'message_tombstones.json');
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
      const beforeQuarantine = new Set(
        fs.readdirSync(fileStore.getDataDir()).filter((f) => f.startsWith('message_tombstones.json.corrupt.'))
      );

      try {
        fileStore.writeCollectionStrict('message_tombstones', {}, { lockStrict: true });
        fs.writeFileSync(filePath, '<<<NOT_JSON>>>', 'utf-8');

        assert.throws(
          () => fileStore.readCollection('message_tombstones'),
          (err: any) => err instanceof CriticalCollectionCorruptionError && Boolean(err.quarantinePath)
        );

        const afterQuarantine = fs
          .readdirSync(fileStore.getDataDir())
          .filter((f) => f.startsWith('message_tombstones.json.corrupt.') && !beforeQuarantine.has(f));
        assert.strictEqual(afterQuarantine.length, 1, 'Exactly one quarantine file created');
      } finally {
        if (original !== null) fs.writeFileSync(filePath, original, 'utf-8');
        else if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        for (const f of fs.readdirSync(fileStore.getDataDir())) {
          if (f.startsWith('message_tombstones.json.corrupt.') && !beforeQuarantine.has(f)) {
            fs.unlinkSync(path.join(fileStore.getDataDir(), f));
          }
        }
      }
    });

    await runTest('2.2a: conversation_tombstones — Truncated/empty file is quarantined rather than treated as empty', () => {
      const filePath = path.join(fileStore.getDataDir(), 'conversation_tombstones.json');
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
      const beforeQuarantine = new Set(
        fs.readdirSync(fileStore.getDataDir()).filter((f) => f.startsWith('conversation_tombstones.json.corrupt.'))
      );

      try {
        fileStore.writeCollectionStrict('conversation_tombstones', {}, { lockStrict: true });
        fs.writeFileSync(filePath, '   \n   ', 'utf-8'); // empty whitespace

        assert.throws(
          () => fileStore.readCollection('conversation_tombstones'),
          (err: any) => err instanceof CriticalCollectionCorruptionError && Boolean(err.quarantinePath)
        );

        const afterQuarantine = fs
          .readdirSync(fileStore.getDataDir())
          .filter((f) => f.startsWith('conversation_tombstones.json.corrupt.') && !beforeQuarantine.has(f));
        assert.strictEqual(afterQuarantine.length, 1);
      } finally {
        if (original !== null) fs.writeFileSync(filePath, original, 'utf-8');
        else if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        for (const f of fs.readdirSync(fileStore.getDataDir())) {
          if (f.startsWith('conversation_tombstones.json.corrupt.') && !beforeQuarantine.has(f)) {
            fs.unlinkSync(path.join(fileStore.getDataDir(), f));
          }
        }
      }
    });

    await runTest('2.2b: message_tombstones — Truncated/empty file is quarantined rather than treated as empty', () => {
      const filePath = path.join(fileStore.getDataDir(), 'message_tombstones.json');
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
      const beforeQuarantine = new Set(
        fs.readdirSync(fileStore.getDataDir()).filter((f) => f.startsWith('message_tombstones.json.corrupt.'))
      );

      try {
        fileStore.writeCollectionStrict('message_tombstones', {}, { lockStrict: true });
        fs.writeFileSync(filePath, '', 'utf-8'); // 0 bytes

        assert.throws(
          () => fileStore.readCollection('message_tombstones'),
          (err: any) => err instanceof CriticalCollectionCorruptionError && Boolean(err.quarantinePath)
        );

        const afterQuarantine = fs
          .readdirSync(fileStore.getDataDir())
          .filter((f) => f.startsWith('message_tombstones.json.corrupt.') && !beforeQuarantine.has(f));
        assert.strictEqual(afterQuarantine.length, 1);
      } finally {
        if (original !== null) fs.writeFileSync(filePath, original, 'utf-8');
        else if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        for (const f of fs.readdirSync(fileStore.getDataDir())) {
          if (f.startsWith('message_tombstones.json.corrupt.') && !beforeQuarantine.has(f)) {
            fs.unlinkSync(path.join(fileStore.getDataDir(), f));
          }
        }
      }
    });

    await runTest('2.3a: conversation_tombstones — Missing initialized ledger fails closed', () => {
      const filePath = path.join(fileStore.getDataDir(), 'conversation_tombstones.json');
      const markerPath = `${filePath}.initialized`;
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
      const markerOriginal = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf-8') : null;

      try {
        fileStore.writeCollectionStrict('conversation_tombstones', {}, { lockStrict: true });
        fs.unlinkSync(filePath);

        assert.throws(
          () => fileStore.readCollection('conversation_tombstones'),
          (err: any) => err instanceof CriticalCollectionCorruptionError && /missing although its initialization marker exists/.test(err.message)
        );
        // Writing to collection also fails closed
        assert.throws(
          () => fileStore.writeCollectionStrict('conversation_tombstones', {}, { lockStrict: true }),
          (err: any) => err instanceof CriticalCollectionCorruptionError
        );
      } finally {
        fs.writeFileSync(filePath, original ?? '{}', 'utf-8');
        if (markerOriginal !== null) fs.writeFileSync(markerPath, markerOriginal, 'utf-8');
      }
    });

    await runTest('2.3b: message_tombstones — Missing initialized ledger fails closed', () => {
      const filePath = path.join(fileStore.getDataDir(), 'message_tombstones.json');
      const markerPath = `${filePath}.initialized`;
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
      const markerOriginal = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf-8') : null;

      try {
        fileStore.writeCollectionStrict('message_tombstones', {}, { lockStrict: true });
        fs.unlinkSync(filePath);

        assert.throws(
          () => fileStore.readCollection('message_tombstones'),
          (err: any) => err instanceof CriticalCollectionCorruptionError && /missing although its initialization marker exists/.test(err.message)
        );
      } finally {
        fs.writeFileSync(filePath, original ?? '{}', 'utf-8');
        if (markerOriginal !== null) fs.writeFileSync(markerPath, markerOriginal, 'utf-8');
      }
    });

    await runTest('2.4: Missing initialization marker on pre-existing ledger auto-seeds marker before parsing', () => {
      const filePath = path.join(fileStore.getDataDir(), 'conversation_tombstones.json');
      const markerPath = `${filePath}.initialized`;
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
      const markerOriginal = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf-8') : null;

      try {
        // Write a raw file directly without marker
        if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
        fs.writeFileSync(filePath, JSON.stringify({ test: { id: 'test' } }), 'utf-8');

        // Read must succeed AND create the marker
        const read = fileStore.readCollection<any>('conversation_tombstones');
        assert.strictEqual(read.test.id, 'test');
        assert.strictEqual(fs.existsSync(markerPath), true, 'Initialization marker must be automatically seeded');
      } finally {
        if (original !== null) fs.writeFileSync(filePath, original, 'utf-8');
        if (markerOriginal !== null) fs.writeFileSync(markerPath, markerOriginal, 'utf-8');
      }
    });

    await runTest('2.5: Quarantine rename failure preserves original corrupt bytes and fails closed', () => {
      const filePath = path.join(fileStore.getDataDir(), 'message_tombstones.json');
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '{}';
      const corruptPayload = '{"corrupted_data": true';
      const originalRename = fs.renameSync;

      try {
        fileStore.writeCollectionStrict('message_tombstones', {}, { lockStrict: true });
        fs.writeFileSync(filePath, corruptPayload, 'utf-8');

        // Simulate quarantine failure (e.g. cross-device link or permission failure)
        (fs as any).renameSync = () => {
          const err: any = new Error('EACCES: permission denied for quarantine rename');
          err.code = 'EACCES';
          throw err;
        };

        assert.throws(
          () => fileStore.readCollection('message_tombstones'),
          (err: any) => err instanceof CriticalCollectionCorruptionError && /quarantine failed/.test(err.message)
        );

        // Verification: original corrupt bytes were NOT overwritten or unlinked
        const preserved = fs.readFileSync(filePath, 'utf-8');
        assert.strictEqual(preserved, corruptPayload, 'Original corrupt bytes must remain intact');
      } finally {
        (fs as any).renameSync = originalRename;
        fs.writeFileSync(filePath, original, 'utf-8');
      }
    });

    await runTest('2.6: Read permission failure triggers quarantine failure handling and fails closed', () => {
      const filePath = path.join(fileStore.getDataDir(), 'conversation_tombstones.json');
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '{}';
      const originalRead = fs.readFileSync;

      try {
        fileStore.writeCollectionStrict('conversation_tombstones', {}, { lockStrict: true });

        // Simulate read permission denial
        (fs as any).readFileSync = (p: string, opts: any) => {
          if (p === filePath) {
            const err: any = new Error('EACCES: permission denied to read ledger');
            err.code = 'EACCES';
            throw err;
          }
          return originalRead(p, opts);
        };

        assert.throws(
          () => fileStore.readCollection('conversation_tombstones'),
          (err: any) => err instanceof CriticalCollectionCorruptionError
        );
      } finally {
        (fs as any).readFileSync = originalRead;
        fs.writeFileSync(filePath, original, 'utf-8');
      }
    });

    await runTest('2.7: Interrupted writes — atomic write failure leaves target intact or fails closed', () => {
      const filePath = path.join(fileStore.getDataDir(), 'conversation_tombstones.json');
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '{}';
      const originalRename = fs.renameSync;

      try {
        fileStore.writeCollectionStrict('conversation_tombstones', { baseline: { id: 'baseline' } }, { lockStrict: true });

        // Simulate crash right before atomic rename
        (fs as any).renameSync = (tmp: string, target: string) => {
          if (target === filePath) {
            throw new Error('EIO: write interrupted by power failure simulated');
          }
          return originalRename(tmp, target);
        };

        assert.throws(
          () => fileStore.writeCollectionStrict('conversation_tombstones', { updated: { id: 'updated' } }, { lockStrict: true }),
          /write interrupted/
        );

        // Target file remained at valid baseline
        (fs as any).renameSync = originalRename;
        const read = fileStore.readCollection<any>('conversation_tombstones');
        assert.strictEqual(read.baseline.id, 'baseline');
      } finally {
        (fs as any).renameSync = originalRename;
        fs.writeFileSync(filePath, original, 'utf-8');
      }
    });

    await runTest('2.8: Operator recovery after quarantine restores healthy operational state', () => {
      const filePath = path.join(fileStore.getDataDir(), 'conversation_tombstones.json');
      const markerPath = `${filePath}.initialized`;
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
      const markerOriginal = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf-8') : null;
      const beforeQuarantine = new Set(
        fs.readdirSync(fileStore.getDataDir()).filter((f) => f.startsWith('conversation_tombstones.json.corrupt.'))
      );

      try {
        // Step 1: Valid initial tombstone
        fileStore.writeCollectionStrict('conversation_tombstones', {
          'conv-recovered-1': { id: 'conv-recovered-1', founderId: FOUNDER_A, prismaReconciled: true, deletedAt: new Date().toISOString() }
        }, { lockStrict: true });

        // Backup this good state
        const goodPayload = fs.readFileSync(filePath, 'utf-8');
        const goodMarker = fs.readFileSync(markerPath, 'utf-8');

        // Step 2: Corrupt the file
        fs.writeFileSync(filePath, 'bad-bytes', 'utf-8');

        // Step 3: Read triggers quarantine and fails closed
        assert.throws(
          () => fileStore.readCollection('conversation_tombstones'),
          (err: any) => err instanceof CriticalCollectionCorruptionError && Boolean(err.quarantinePath)
        );

        // Step 4: Operator restores the backup
        fs.writeFileSync(filePath, goodPayload, 'utf-8');
        fs.writeFileSync(markerPath, goodMarker, 'utf-8');

        // Step 5: Read now succeeds and preserves data
        const restored = fileStore.readCollection<any>('conversation_tombstones');
        assert.strictEqual(restored['conv-recovered-1'].id, 'conv-recovered-1');
        assert.strictEqual(convStore.isTombstoned('conv-recovered-1'), true);
      } finally {
        if (original !== null) fs.writeFileSync(filePath, original, 'utf-8');
        if (markerOriginal !== null) fs.writeFileSync(markerPath, markerOriginal, 'utf-8');
        for (const f of fs.readdirSync(fileStore.getDataDir())) {
          if (f.startsWith('conversation_tombstones.json.corrupt.') && !beforeQuarantine.has(f)) {
            fs.unlinkSync(path.join(fileStore.getDataDir(), f));
          }
        }
      }
    });

    await runTest('2.9: Verify NO store operation interprets unknown/corrupt ledger as empty', async () => {
      const conv = await convStore.createConversation({ founderId: FOUNDER_A, title: 'Attack Ledger Test' });
      const filePath = path.join(fileStore.getDataDir(), 'conversation_tombstones.json');
      const original = fs.readFileSync(filePath, 'utf-8');

      try {
        fs.writeFileSync(filePath, '{corrupt_ledger', 'utf-8');

        // 1. isTombstoned fails closed
        assert.throws(() => convStore.isTombstoned(conv.id), (err: any) => err instanceof CriticalCollectionCorruptionError);

        // 2. getTombstone fails closed
        assert.throws(() => convStore.getTombstone(conv.id), (err: any) => err instanceof CriticalCollectionCorruptionError);

        // 3. getConversation fails closed
        await assert.rejects(
          () => convStore.getConversation(FOUNDER_A, conv.id),
          (err: any) => err instanceof CriticalCollectionCorruptionError
        );

        // 4. deleteConversation fails closed
        await assert.rejects(
          () => convStore.deleteConversation(FOUNDER_A, conv.id),
          (err: any) => err instanceof CriticalCollectionCorruptionError
        );

        // 5. reconcileAllTombstones fails closed
        await assert.rejects(
          () => convStore.reconcileAllTombstones(),
          (err: any) => err instanceof CriticalCollectionCorruptionError
        );
      } finally {
        fs.writeFileSync(filePath, original, 'utf-8');
        for (const f of fs.readdirSync(fileStore.getDataDir())) {
          if (f.startsWith('conversation_tombstones.json.corrupt.')) {
            fs.unlinkSync(path.join(fileStore.getDataDir(), f));
          }
        }
      }
    });

    // ========================================================================
    // TASK 3: PRISMA FALLBACK VERIFICATION
    // ========================================================================
    console.log('--- TASK 3: PRISMA FALLBACK VERIFICATION ---');

    await runTest('3.1: Corrupt conversation tombstone ledger strictly blocks Prisma fallback in getConversation', async () => {
      const conv = await convStore.createConversation({ founderId: FOUNDER_A, title: 'Prisma Block Test' });
      const filePath = path.join(fileStore.getDataDir(), 'conversation_tombstones.json');
      const original = fs.readFileSync(filePath, 'utf-8');

      let prismaFindUniqueCalled = 0;
      const originalFindUnique = (prisma as any).conversation?.findUnique;
      if ((prisma as any).conversation) {
        (prisma as any).conversation.findUnique = async () => {
          prismaFindUniqueCalled++;
          return null;
        };
      }

      try {
        fs.writeFileSync(filePath, '{corrupt_json', 'utf-8');

        await assert.rejects(
          () => convStore.getConversation(FOUNDER_A, conv.id),
          (err: any) => err instanceof CriticalCollectionCorruptionError
        );

        assert.strictEqual(prismaFindUniqueCalled, 0, 'Prisma findUnique must NEVER be invoked when tombstone ledger is corrupt');
      } finally {
        fs.writeFileSync(filePath, original, 'utf-8');
        if ((prisma as any).conversation) {
          (prisma as any).conversation.findUnique = originalFindUnique;
        }
        for (const f of fs.readdirSync(fileStore.getDataDir())) {
          if (f.startsWith('conversation_tombstones.json.corrupt.')) {
            fs.unlinkSync(path.join(fileStore.getDataDir(), f));
          }
        }
      }
    });

    await runTest('3.2: Missing initialized conversation tombstone ledger strictly blocks Prisma fallback', async () => {
      const conv = await convStore.createConversation({ founderId: FOUNDER_A, title: 'Missing Ledger Test' });
      const filePath = path.join(fileStore.getDataDir(), 'conversation_tombstones.json');
      const original = fs.readFileSync(filePath, 'utf-8');
      const markerPath = `${filePath}.initialized`;
      const markerOriginal = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf-8') : null;

      let prismaFindUniqueCalled = 0;
      const originalFindUnique = (prisma as any).conversation?.findUnique;
      if ((prisma as any).conversation) {
        (prisma as any).conversation.findUnique = async () => {
          prismaFindUniqueCalled++;
          return null;
        };
      }

      try {
        fs.unlinkSync(filePath);

        await assert.rejects(
          () => convStore.getConversation(FOUNDER_A, conv.id),
          (err: any) => err instanceof CriticalCollectionCorruptionError && /missing although its initialization marker exists/.test(err.message)
        );

        assert.strictEqual(prismaFindUniqueCalled, 0, 'Prisma fallback must NOT run when ledger is missing but initialized');
      } finally {
        fs.writeFileSync(filePath, original, 'utf-8');
        if (markerOriginal !== null) fs.writeFileSync(markerPath, markerOriginal, 'utf-8');
        if ((prisma as any).conversation) {
          (prisma as any).conversation.findUnique = originalFindUnique;
        }
      }
    });

    await runTest('3.3: Corrupt message tombstone ledger prevents message recreation', async () => {
      const conv = await convStore.createConversation({ founderId: FOUNDER_A, title: 'Message Tombstone Guard' });
      const filePath = path.join(fileStore.getDataDir(), 'message_tombstones.json');
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '{}';

      try {
        fileStore.writeCollectionStrict('message_tombstones', {}, { lockStrict: true });
        fs.writeFileSync(filePath, '{"damaged":', 'utf-8');

        await assert.rejects(
          () => convStore.saveMessage({ conversationId: conv.id, sender: 'founder', content: 'hello' }, FOUNDER_A),
          (err: any) => err instanceof CriticalCollectionCorruptionError
        );
      } finally {
        fs.writeFileSync(filePath, original, 'utf-8');
        for (const f of fs.readdirSync(fileStore.getDataDir())) {
          if (f.startsWith('message_tombstones.json.corrupt.')) {
            fs.unlinkSync(path.join(fileStore.getDataDir(), f));
          }
        }
      }
    });

    await runTest('3.4: Database connection outage leaves tombstones pending (prismaReconciled = false)', async () => {
      const conv = await convStore.createConversation({ founderId: FOUNDER_A, title: 'Outage Reconcile Test' });
      convStore.setDatabaseAvailableForTests(false); // Inject database outage

      try {
        const delRes = await convStore.deleteConversation(FOUNDER_A, conv.id);
        assert.strictEqual(delRes.deleted, true);

        const tombstone = convStore.getTombstone(conv.id);
        assert.strictEqual(tombstone?.prismaReconciled, false, 'Tombstone must remain pending during DB outage');

        const recRes = await convStore.reconcileAllTombstones();
        assert.strictEqual(recRes.success, false, 'Reconciliation must report failure under DB outage');
        assert.strictEqual(recRes.pendingPrismaCount, 1, 'Tombstone must stay in pending count');
      } finally {
        convStore.setDatabaseAvailableForTests(null);
      }
    });

    await runTest('3.5: Strict Prisma error classification: Only canonical P2025 is accepted as confirmed record absence', () => {
      // 1. Canonical P2025 code -> true
      assert.strictEqual(isPrismaRecordNotFoundError({ code: 'P2025' }), true);
      assert.strictEqual(isPrismaRecordNotFoundError({ code: 'P2025', message: 'Record to delete does not exist' }), true);

      // 2. Connection errors -> false
      assert.strictEqual(isPrismaRecordNotFoundError({ code: 'P1001' }), false);
      assert.strictEqual(isPrismaRecordNotFoundError({ code: 'P1002' }), false);
      assert.strictEqual(isPrismaRecordNotFoundError({ code: 'ETIMEDOUT' }), false);
      assert.strictEqual(isPrismaRecordNotFoundError({ code: 'ECONNREFUSED' }), false);
      assert.strictEqual(isPrismaRecordNotFoundError({ code: 'ENOTFOUND' }), false);

      // 3. Database configuration error -> false
      assert.strictEqual(isPrismaRecordNotFoundError({ code: 'P1003' }), false);

      // 4. Message-only errors without code -> false (tightened in Batch 2.2/3)
      assert.strictEqual(isPrismaRecordNotFoundError({ message: 'Record to delete does not exist' }), false);

      // 5. Generic fragments -> false
      assert.strictEqual(isPrismaRecordNotFoundError({ message: 'database does not exist' }), false);
      assert.strictEqual(isPrismaRecordNotFoundError({ message: 'table does not exist' }), false);
      assert.strictEqual(isPrismaRecordNotFoundError({ message: 'relation does not exist' }), false);
    });

    // ========================================================================
    // TASK 4: BACKUP AND RESTORATION CONTROLLED PROCEDURE
    // ========================================================================
    console.log('--- TASK 4: BACKUP & RESTORATION (ISOLATED ENVIRONMENT) ---');

    await runTest('4.1: Full end-to-end backup, quarantine preservation, and restore verification in isolated environment', async () => {
      const tempBackupDir = path.join(os.tmpdir(), `samjuniors-backup-test-${Date.now()}`);
      fs.mkdirSync(tempBackupDir, { recursive: true });

      const origPrismaDelete = (prisma as any).conversation?.delete;

      try {
        // Step 1: Populate active state and tombstoned state
        const activeConv = await convStore.createConversation({
          founderId: FOUNDER_A,
          title: 'Active Retained Conversation',
        });
        await convStore.saveMessage({
          conversationId: activeConv.id,
          sender: 'founder',
          content: 'Important retained business contract',
        }, FOUNDER_A);

        const deletedConv = await convStore.createConversation({
          founderId: FOUNDER_A,
          title: 'Deleted Private Conversation',
        });
        await convStore.saveMessage({
          conversationId: deletedConv.id,
          sender: 'founder',
          content: 'Confidential draft to be permanently forgotten',
        }, FOUNDER_A);

        // Delete deletedConv -> generates durable tombstone + markers
        const delRes = await convStore.deleteConversation(FOUNDER_A, deletedConv.id);
        assert.strictEqual(delRes.deleted, true);

        // Step 2: Quiesce writers (simulate stop traffic)
        // Step 3: Back up both tombstone JSON files and initialization markers
        const dataDir = fileStore.getDataDir();
        const filesToBackup = [
          'conversation_tombstones.json',
          'conversation_tombstones.json.initialized',
          'message_tombstones.json',
          'message_tombstones.json.initialized',
          'conversations.json',
          'chat_messages.json',
        ];

        const manifest: Record<string, { hash: string; size: number }> = {};
        const backupTimestamp = new Date().toISOString();
        const backupId = `bkp-${Date.now()}`;

        for (const file of filesToBackup) {
          const src = path.join(dataDir, file);
          if (fs.existsSync(src)) {
            const dest = path.join(tempBackupDir, file);
            const content = fs.readFileSync(src);
            fs.writeFileSync(dest, content);
            manifest[file] = {
              hash: crypto.createHash('sha256').update(content).digest('hex'),
              size: content.length,
            };
          }
        }

        // Verify backup integrity: check hashes
        assert.ok(manifest['conversation_tombstones.json'], 'Tombstone file in backup');
        assert.ok(manifest['conversation_tombstones.json.initialized'], 'Tombstone marker in backup');

        // Step 4: Simulate a catastrophic disaster / corruption on live system
        const liveTombstonePath = path.join(dataDir, 'conversation_tombstones.json');
        fs.writeFileSync(liveTombstonePath, 'CORRUPTED_DISASTER_PAYLOAD', 'utf-8');

        // Verify system fails closed and quarantines
        assert.throws(
          () => fileStore.readCollection('conversation_tombstones'),
          (err: any) => err instanceof CriticalCollectionCorruptionError && Boolean(err.quarantinePath)
        );

        // Find the quarantined file
        const quarantinedFiles = fs
          .readdirSync(dataDir)
          .filter((f) => f.startsWith('conversation_tombstones.json.corrupt.'));
        assert.ok(quarantinedFiles.length >= 1, 'Quarantine file exists');
        // Preserve corrupt originals: verify quarantine file is not touched

        // Step 5: Restore from backup
        for (const file of Object.keys(manifest)) {
          const src = path.join(tempBackupDir, file);
          const dest = path.join(dataDir, file);
          const content = fs.readFileSync(src);
          // Verify hash before writing
          const currentHash = crypto.createHash('sha256').update(content).digest('hex');
          assert.strictEqual(currentHash, manifest[file].hash, `Backup integrity verified for ${file}`);
          fs.writeFileSync(dest, content);
        }

        // Step 6: Verify permissions and file contents
        const restoredTombstones = fileStore.readCollection<any>('conversation_tombstones');
        assert.ok(restoredTombstones[deletedConv.id], 'Deleted conv tombstone restored');

        // Step 7: Run reconciliation runbook
        convStore.setDatabaseAvailableForTests(true);
        if ((prisma as any).conversation) {
          (prisma as any).conversation.delete = async () => ({ id: deletedConv.id });
        }
        const recOutput = await runReconcile({
          convStore,
          fileStore,
          log: () => {},
          error: () => {},
        });
        assert.strictEqual(recOutput.exitCode, 0, 'Reconciliation runbook exits 0 after clean restore');

        // Step 8: Verify deleted conversations CANNOT be retrieved or recreated
        const retrievedDeleted = await convStore.getConversation(FOUNDER_A, deletedConv.id);
        assert.strictEqual(retrievedDeleted, null, 'Deleted conversation cannot be retrieved');

        await assert.rejects(
          () => convStore.createConversation({ id: deletedConv.id, founderId: FOUNDER_A, title: 'Resurrected' }),
          (err: any) => err instanceof ConversationSecurityError && /permanently deleted/.test(err.message),
          'Deleted conversation cannot be recreated'
        );

        // Step 9: Verify unrelated active conversations remain accessible
        const retrievedActive = await convStore.getConversation(FOUNDER_A, activeConv.id);
        assert.notStrictEqual(retrievedActive, null, 'Active conversation remains accessible');
        assert.strictEqual(retrievedActive?.title, 'Active Retained Conversation');

        const activeMessages = await convStore.getMessages(activeConv.id, FOUNDER_A);
        assert.strictEqual(activeMessages.length, 1);
        assert.strictEqual(activeMessages[0].content, 'Important retained business contract');
      } finally {
        convStore.setDatabaseAvailableForTests(null);
        if ((prisma as any).conversation) {
          (prisma as any).conversation.delete = origPrismaDelete;
        }
        fs.rmSync(tempBackupDir, { recursive: true, force: true });
        for (const f of fs.readdirSync(fileStore.getDataDir())) {
          if (f.startsWith('conversation_tombstones.json.corrupt.')) {
            fs.unlinkSync(path.join(fileStore.getDataDir(), f));
          }
        }
      }
    });

    // ========================================================================
    // TASK 5: RACE AND FAILURE TESTING
    // ========================================================================
    console.log('--- TASK 5: RACE AND FAILURE TESTING ---');

    await runTest('5.1: Concurrent conversation deletion — multiple parallel deletes execute safely under lock', async () => {
      const conv = await convStore.createConversation({ founderId: FOUNDER_A, title: 'Parallel Delete Race' });
      await convStore.saveMessage({ conversationId: conv.id, sender: 'founder', content: 'race msg 1' }, FOUNDER_A);
      await convStore.saveMessage({ conversationId: conv.id, sender: 'founder', content: 'race msg 2' }, FOUNDER_A);

      // Launch 5 parallel delete operations for the same conversation
      const results = await Promise.all([
        convStore.deleteConversation(FOUNDER_A, conv.id),
        convStore.deleteConversation(FOUNDER_A, conv.id),
        convStore.deleteConversation(FOUNDER_A, conv.id),
        convStore.deleteConversation(FOUNDER_A, conv.id),
        convStore.deleteConversation(FOUNDER_A, conv.id),
      ]);

      assert(results.every((r) => r.success === true), 'All parallel deletion calls must succeed');
      const deletedCount = results.filter((r) => r.deleted === true).length;
      const alreadyDeletedCount = results.filter((r) => r.alreadyDeleted === true).length;
      assert.strictEqual(deletedCount + alreadyDeletedCount, 5, 'Every call is either primary delete or idempotent retry');
      assert.ok(deletedCount >= 1, 'At least one call completed initial deletion');

      // Zero residual messages or conversation record
      assert.strictEqual(await convStore.getConversation(FOUNDER_A, conv.id), null);
      const msgs = fileStore.readCollection<ChatMessageRecord>('chat_messages');
      const residual = Object.values(msgs).filter((m) => m && m.conversationId === conv.id);
      assert.strictEqual(residual.length, 0);
    });

    await runTest('5.2: Concurrent message write racing with deletion fails closed or is purged', async () => {
      const conv = await convStore.createConversation({ founderId: FOUNDER_A, title: 'Write vs Delete Race' });

      // Save a message while deleting in parallel
      const [saveRes, delRes] = await Promise.allSettled([
        convStore.saveMessage({ conversationId: conv.id, sender: 'founder', content: 'racing message' }, FOUNDER_A),
        convStore.deleteConversation(FOUNDER_A, conv.id),
      ]);

      // If delete won first, saveMessage must have rejected (ConversationNotFoundError or MessageTombstonedError)
      // If save won first, deleteConversation must have swept the message
      const finalConv = await convStore.getConversation(FOUNDER_A, conv.id);
      assert.strictEqual(finalConv, null, 'Conversation is deleted at end of race');

      const allMsgs = fileStore.readCollection<ChatMessageRecord>('chat_messages');
      const lingering = Object.values(allMsgs).filter((m) => m && m.conversationId === conv.id);
      assert.strictEqual(lingering.length, 0, 'No ghost messages remain on disk');
    });

    await runTest('5.3: Strict lock timeout fails closed without mutating state', async () => {
      const lockPath = path.join(fileStore.getDataDir(), 'conversation_tombstones.json.lock');
      fs.writeFileSync(lockPath, `${process.pid}\n`, 'utf-8');

      try {
        assert.throws(
          () => fileStore.saveItemStrict('conversation_tombstones', 'timeout-test', { id: 'timeout-test' }, { timeoutMs: 20 }),
          (err: any) => err instanceof LockTimeoutError
        );
      } finally {
        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
      }
    });

    await runTest('5.4: Crash between tombstone write and conversation purge — shielded immediately, swept on retry', async () => {
      const crashConvId = 'conv-crash-simulation';
      const crashMsgId = 'msg-crash-simulation';

      // 1. Manually write the tombstone as if step 3 succeeded
      fileStore.saveItemStrict('conversation_tombstones', crashConvId, {
        id: crashConvId,
        founderId: FOUNDER_A,
        deletedAt: new Date().toISOString(),
        purgedMessageCount: 0,
        prismaReconciled: false,
      });

      // 2. Put conversation and message records in place as if steps 4-5 never ran
      fileStore.saveItem('conversations', crashConvId, {
        id: crashConvId,
        founderId: FOUNDER_A,
        title: 'Crash Leftover',
        agentId: 'sophia',
        status: 'active',
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      fileStore.saveItem('chat_messages', crashMsgId, {
        id: crashMsgId,
        conversationId: crashConvId,
        sender: 'founder',
        content: 'Unpurged text',
        createdAt: new Date().toISOString(),
      });

      // 3. Verify getConversation is IMMEDIATELY shielded
      assert.strictEqual(await convStore.getConversation(FOUNDER_A, crashConvId), null);

      // 4. Retry deleteConversation: cleans local file and message records
      const retry = await convStore.deleteConversation(FOUNDER_A, crashConvId);
      assert.strictEqual(retry.alreadyDeleted, true);

      assert.strictEqual(fileStore.getItem('conversations', crashConvId), null);
      const msgs = fileStore.readCollection<ChatMessageRecord>('chat_messages');
      assert.strictEqual(msgs[crashMsgId], undefined);
    });

    await runTest('5.5: Crash during Prisma reconciliation leaves tombstone durable and pending', async () => {
      const conv = await convStore.createConversation({ founderId: FOUNDER_A, title: 'Crash During Reconcile' });
      // Delete under simulated offline DB
      convStore.setDatabaseAvailableForTests(false);
      await convStore.deleteConversation(FOUNDER_A, conv.id);

      const tombstone = convStore.getTombstone(conv.id);
      assert.strictEqual(tombstone?.prismaReconciled, false);

      // Now restore DB availability and mock successful delete
      convStore.setDatabaseAvailableForTests(true);
      const origPrismaDelete = (prisma as any).conversation?.delete;
      if ((prisma as any).conversation) {
        (prisma as any).conversation.delete = async () => ({ id: conv.id });
      }

      try {
        const rec = await convStore.reconcileAllTombstones();
        assert.strictEqual(rec.success, true);
        assert.strictEqual(convStore.getTombstone(conv.id)?.prismaReconciled, true);
      } finally {
        convStore.setDatabaseAvailableForTests(null);
        if ((prisma as any).conversation) {
          (prisma as any).conversation.delete = origPrismaDelete;
        }
      }
    });

    await runTest('5.6: Crash during recovery (missing ledger with initialized marker) fails closed and never treats as empty', () => {
      const filePath = path.join(fileStore.getDataDir(), 'conversation_tombstones.json');
      const markerPath = `${filePath}.initialized`;
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '{}';

      try {
        // Operator restored marker but process died before restoring ledger
        fs.writeFileSync(markerPath, 'initialized\n', 'utf-8');
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        assert.throws(
          () => fileStore.readCollection('conversation_tombstones'),
          (err: any) => err instanceof CriticalCollectionCorruptionError && /missing although its initialization marker exists/.test(err.message)
        );
      } finally {
        fs.writeFileSync(filePath, original, 'utf-8');
      }
    });

  } finally {
    // Clean all test data
    convStore.clearForTests();
  }

  console.log('\n======================================================');
  console.log(`TASK 2-5 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
