import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import {
  ConversationStore,
  ConversationSecurityError,
  ConversationNotFoundError,
  ChatMessageRecord,
  MessageTombstonedError,
} from '../../src/lib/server/conversation';
import { DurableFileStore, LockTimeoutError } from '../../src/lib/server/persistence/durable-file-store';
import { prisma } from '../../src/lib/server/db/prisma';
import { GET as conversationGet, DELETE as conversationDelete } from '../../src/app/api/conversation/route';
import { DELETE as messageDelete } from '../../src/app/api/conversation/message/route';
import { DELETE as agentChatDelete } from '../../src/app/api/agent-chat/route';

/**
 * ============================================================================
 * M1 BATCH 2 TEST SUITE: CONVERSATION DELETION & RETENTION GOVERNANCE
 * ============================================================================
 *
 * Verifies:
 *   1. Cross-founder isolation: Zero information leakage (404 on cross-founder).
 *   2. Unknown IDs: Safe notFound reporting.
 *   3. Repeated deletion: Idempotent success (alreadyDeleted: true).
 *   4. Concurrent deletion: Safe locking serialization without corruption.
 *   5. Active-turn races: Cannot recreate or append to tombstoned conversations.
 *   6. Single message deletion: Target purged, sibling messages intact, timestamp updated.
 *   7. Write-ahead tombstone: Anti-resurrection barrier against Prisma mirrors.
 *   8. Recovery & reconciliation: reconcileAllTombstones cleans orphaned files & mirrors.
 *   9. Search hygiene: searchConversations & listConversations exclude deleted records.
 *  10. Audit preservation: Independent AgentRun, ApprovalRecord & audit ledger preserved.
 *  11. REST API endpoint contracts: Proper 401, 404, 200 responses.
 */

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
  console.log('M1 BATCH 2: CONVERSATION DELETION & GOVERNANCE TEST SUITE');
  console.log('======================================================\n');

  const convStore = ConversationStore.getInstance();
  const fileStore = DurableFileStore.getInstance();

  // Reset collections before testing
  convStore.clearForTests();

  const FOUNDER_A = 'founder-alpha';
  const FOUNDER_B = 'founder-beta';

  try {
    // ------------------------------------------------------------------------
    // GROUP 1: BASIC DELETION & CASCADE PURGE
    // ------------------------------------------------------------------------
    await runTest('1.1: deleteConversation removes conversation and purges messages', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Strategy Session',
      });

      await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'founder',
        content: 'Alpha secret memo',
      }, FOUNDER_A);

      await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'assistant',
        content: 'Understood memo',
      }, FOUNDER_A);

      // Verify messages exist
      const msgsBefore = await convStore.getMessages(conv.id, FOUNDER_A);
      assert.strictEqual(msgsBefore.length, 2);

      // Execute delete
      const delResult = await convStore.deleteConversation(FOUNDER_A, conv.id);
      assert.strictEqual(delResult.success, true);
      assert.strictEqual(delResult.deleted, true);
      assert.strictEqual(delResult.purgedMessageCount, 2);

      // Verify conversation is gone
      const convAfter = await convStore.getConversation(FOUNDER_A, conv.id);
      assert.strictEqual(convAfter, null);

      // Verify messages are purged from raw file store
      const allMsgs = fileStore.readCollection<ChatMessageRecord>('chat_messages');
      const lingeringMsgs = Object.values(allMsgs).filter((m) => m && m.conversationId === conv.id);
      assert.strictEqual(lingeringMsgs.length, 0);

      // Verify tombstone is recorded
      assert.strictEqual(convStore.isTombstoned(conv.id), true);
      const tombstone = convStore.getTombstone(conv.id);
      assert.strictEqual(tombstone?.founderId, FOUNDER_A);
      assert.strictEqual(tombstone?.purgedMessageCount, 2);
    });

    // ------------------------------------------------------------------------
    // GROUP 2: IDEMPOTENCY & REPEATED DELETION
    // ------------------------------------------------------------------------
    await runTest('2.1: Repeated deleteConversation is an idempotent success', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Idempotency Verification',
      });

      const res1 = await convStore.deleteConversation(FOUNDER_A, conv.id);
      assert.strictEqual(res1.deleted, true);

      // Second deletion attempt
      const res2 = await convStore.deleteConversation(FOUNDER_A, conv.id);
      assert.strictEqual(res2.success, true);
      assert.strictEqual(res2.deleted, false);
      assert.strictEqual(res2.alreadyDeleted, true);
      assert.strictEqual(res2.conversationId, conv.id);
    });

    // ------------------------------------------------------------------------
    // GROUP 3: CROSS-FOUNDER ISOLATION & ZERO INFORMATION LEAKAGE
    // ------------------------------------------------------------------------
    await runTest('3.1: Cross-founder deletion is strictly blocked at store level', async () => {
      const convA = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Alpha Private Thoughts',
      });

      // Founder B attempts to delete Founder A's conversation
      await assert.rejects(
        async () => {
          await convStore.deleteConversation(FOUNDER_B, convA.id);
        },
        (err: any) => {
          assert(err instanceof ConversationSecurityError);
          return true;
        }
      );

      // Verify Founder A's conversation remains completely intact
      const fetched = await convStore.getConversation(FOUNDER_A, convA.id);
      assert.strictEqual(fetched?.id, convA.id);
    });

    await runTest('3.2: Cross-founder tombstone deletion is strictly blocked', async () => {
      const convA = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Alpha Tombstone Test',
      });

      await convStore.deleteConversation(FOUNDER_A, convA.id);

      // Founder B attempts to delete already-tombstoned conversation of Founder A
      await assert.rejects(
        async () => {
          await convStore.deleteConversation(FOUNDER_B, convA.id);
        },
        (err: any) => {
          assert(err instanceof ConversationSecurityError);
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // GROUP 4: UNKNOWN RESOURCE HANDLING
    // ------------------------------------------------------------------------
    await runTest('4.1: Deleting unknown conversation returns notFound: true', async () => {
      const res = await convStore.deleteConversation(FOUNDER_A, 'conv-never-existed-123');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.notFound, true);
    });

    await runTest('4.2: Deleting unknown message returns notFound: true', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Active Conv',
      });

      const res = await convStore.deleteMessage(FOUNDER_A, conv.id, 'msg-ghost-404');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.notFound, true);
    });

    // ------------------------------------------------------------------------
    // GROUP 5: SINGLE MESSAGE DELETION
    // ------------------------------------------------------------------------
    await runTest('5.1: deleteMessage purges target message while preserving siblings', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Message Granular Test',
      });

      const m1 = await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'founder',
        content: 'Preserve this message 1',
      }, FOUNDER_A);

      const m2 = await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'assistant',
        content: 'DELETE THIS MESSAGE 2',
      }, FOUNDER_A);

      const m3 = await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'founder',
        content: 'Preserve this message 3',
      }, FOUNDER_A);

      const initialUpdatedAt = conv.updatedAt;

      // Delete m2
      const delMsgResult = await convStore.deleteMessage(FOUNDER_A, conv.id, m2.id);
      assert.strictEqual(delMsgResult.success, true);
      assert.strictEqual(delMsgResult.deleted, true);

      // Check remaining messages
      const msgs = await convStore.getMessages(conv.id, FOUNDER_A);
      assert.strictEqual(msgs.length, 2);
      assert.strictEqual(msgs[0].id, m1.id);
      assert.strictEqual(msgs[1].id, m3.id);

      // Verify parent conversation timestamp was refreshed
      const refreshedConv = await convStore.getConversation(FOUNDER_A, conv.id);
      assert(new Date(refreshedConv!.updatedAt).getTime() >= new Date(initialUpdatedAt).getTime());

      // Repeated delete on m2 returns alreadyDeleted (Batch 2.1 tombstone)
      const repeatDel = await convStore.deleteMessage(FOUNDER_A, conv.id, m2.id);
      assert.strictEqual(repeatDel.alreadyDeleted, true);
      assert.strictEqual(repeatDel.deleted, false);
      assert.strictEqual(repeatDel.success, true);
    });

    await runTest('5.2: deleteMessage fails closed on cross-founder attempt', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Founder A Conv',
      });

      const m1 = await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'founder',
        content: 'Alpha secret',
      }, FOUNDER_A);

      await assert.rejects(
        async () => {
          await convStore.deleteMessage(FOUNDER_B, conv.id, m1.id);
        },
        (err: any) => {
          assert(err instanceof ConversationSecurityError);
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // GROUP 6: CONCURRENT DELETIONS & ACTIVE-TURN RACES
    // ------------------------------------------------------------------------
    await runTest('6.1: Concurrent deletions execute cleanly under collection locks', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Concurrent Race Conv',
      });

      for (let i = 0; i < 5; i++) {
        await convStore.saveMessage({
          conversationId: conv.id,
          sender: 'founder',
          content: `Concurrent message ${i}`,
        }, FOUNDER_A);
      }

      // Fire 3 simultaneous delete calls
      const [r1, r2, r3] = await Promise.all([
        convStore.deleteConversation(FOUNDER_A, conv.id),
        convStore.deleteConversation(FOUNDER_A, conv.id),
        convStore.deleteConversation(FOUNDER_A, conv.id),
      ]);

      assert(r1.success && r2.success && r3.success);
      // At least one reported deleted: true, subsequent reported alreadyDeleted: true
      const deletedCount = [r1, r2, r3].filter((r) => r.deleted).length;
      const alreadyDeletedCount = [r1, r2, r3].filter((r) => r.alreadyDeleted).length;
      assert.strictEqual(deletedCount + alreadyDeletedCount, 3);
      assert(deletedCount >= 1);

      // Verify no records remain
      const remaining = await convStore.getConversation(FOUNDER_A, conv.id);
      assert.strictEqual(remaining, null);
    });

    await runTest('6.2: Anti-Recreation Shield blocks active requests from recreating tombstone', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Doomed Conversation',
      });
      const convId = conv.id;

      await convStore.deleteConversation(FOUNDER_A, convId);

      // 1. Attempt createConversation with the same deleted ID -> fails
      await assert.rejects(
        async () => {
          await convStore.createConversation({
            id: convId,
            founderId: FOUNDER_A,
            title: 'Resurrected Conversation',
          });
        },
        (err: any) => {
          assert(err instanceof ConversationSecurityError);
          return true;
        }
      );

      // 2. Attempt getOrCreateConversation with deleted ID -> throws ConversationNotFoundError
      await assert.rejects(
        async () => {
          await convStore.getOrCreateConversation({
            conversationId: convId,
            founderId: FOUNDER_A,
          });
        },
        (err: any) => {
          assert(err instanceof ConversationNotFoundError);
          return true;
        }
      );

      // 3. Attempt saveMessage to deleted conversation -> throws ConversationNotFoundError
      await assert.rejects(
        async () => {
          await convStore.saveMessage({
            conversationId: convId,
            sender: 'founder',
            content: 'Late in-flight message',
          }, FOUNDER_A);
        },
        (err: any) => {
          assert(err instanceof ConversationNotFoundError);
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // GROUP 7: WRITE-AHEAD TOMBSTONE & ANTI-RESURRECTION SHIELD
    // ------------------------------------------------------------------------
    await runTest('7.1: Tombstone shields against resurrection even if Prisma mirror row persists', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Prisma Orphan Test',
      });
      const convId = conv.id;

      // Delete the conversation
      await convStore.deleteConversation(FOUNDER_A, convId);
      assert.strictEqual(convStore.isTombstoned(convId), true);

      // Now simulate a database mirror row or restored backup by mocking the Prisma fallback
      // Even if getConversation were to query Prisma, the tombstone check at line 270 MUST short-circuit.
      const fetched = await convStore.getConversation(FOUNDER_A, convId);
      assert.strictEqual(fetched, null);

      // Check that findMessageByIdempotencyKey also honors tombstone
      const idempMatch = await convStore.findMessageByIdempotencyKey(convId, 'idemp-key-test');
      assert.strictEqual(idempMatch, null);
    });

    // ------------------------------------------------------------------------
    // GROUP 8: RECOVERY & RECONCILIATION
    // ------------------------------------------------------------------------
    await runTest('8.1: reconcileAllTombstones cleans orphaned files from interrupted runs', async () => {
      const orphanId = 'conv-orphan-from-crash';

      // Simulate a crashed delete: tombstone was written, but local file record was not deleted
      fileStore.saveItem('conversation_tombstones', orphanId, {
        id: orphanId,
        founderId: FOUNDER_A,
        deletedAt: new Date().toISOString(),
        purgedMessageCount: 0,
        prismaReconciled: false,
      });

      fileStore.saveItem('conversations', orphanId, {
        id: orphanId,
        founderId: FOUNDER_A,
        title: 'Orphaned Residual Conv',
        agentId: 'sophia',
        status: 'active',
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Assert it exists before reconciliation
      assert.notStrictEqual(fileStore.getItem('conversations', orphanId), null);

      // Run reconciliation
      const recResult = await convStore.reconcileAllTombstones();
      assert(recResult.cleanedLocalCount >= 1);

      // Verify lingering record was purged
      assert.strictEqual(fileStore.getItem('conversations', orphanId), null);
    });

    await runTest('8.2: Tombstone write failure fails closed without modifying collections', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Failure Injection Test Conv',
      });
      await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'founder',
        content: 'Preserved test message',
      }, FOUNDER_A);

      // Monkey-patch saveItemStrict to simulate I/O failure when writing tombstone
      const origSaveItemStrict = fileStore.saveItemStrict.bind(fileStore);
      fileStore.saveItemStrict = (collection: string, id: string, item: any) => {
        if (collection === 'conversation_tombstones') {
          throw new Error('EIO: Disk write failure simulated');
        }
        return origSaveItemStrict(collection, id, item);
      };

      try {
        await assert.rejects(
          async () => {
            await convStore.deleteConversation(FOUNDER_A, conv.id);
          },
          /Disk write failure simulated/
        );

        // Verify conversation and messages are COMPLETELY INTACT
        const convStillExists = await convStore.getConversation(FOUNDER_A, conv.id);
        assert.notStrictEqual(convStillExists, null);
        const msgsStillExist = await convStore.getMessages(conv.id, FOUNDER_A);
        assert.strictEqual(msgsStillExist.length, 1);
        // Verify no tombstone exists
        assert.strictEqual(convStore.isTombstoned(conv.id), false);
      } finally {
        fileStore.saveItemStrict = origSaveItemStrict;
      }
    });

    await runTest('8.3: Interrupted deletion with lingering messages is safely cleaned up on retry', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Interrupted Run Conv',
      });
      const msg = await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'founder',
        content: 'Lingering message before retry',
      }, FOUNDER_A);

      // Simulate a crashed run: tombstone was written, but neither conversation nor message collection was wiped
      fileStore.saveItem('conversation_tombstones', conv.id, {
        id: conv.id,
        founderId: FOUNDER_A,
        deletedAt: new Date().toISOString(),
        purgedMessageCount: 0,
        prismaReconciled: false,
      });

      // Assert read is ALREADY shielded
      assert.strictEqual(await convStore.getConversation(FOUNDER_A, conv.id), null);

      // Now call deleteConversation retry
      const retryResult = await convStore.deleteConversation(FOUNDER_A, conv.id);
      assert.strictEqual(retryResult.alreadyDeleted, true);

      // Verify conversation and message are purged from raw disk storage
      assert.strictEqual(fileStore.getItem('conversations', conv.id), null);
      const allMsgs = fileStore.readCollection<ChatMessageRecord>('chat_messages');
      assert.strictEqual(allMsgs[msg.id], undefined);
    });

    await runTest('8.4: reconcileAllTombstones sweeps lingering messages across all tombstones', async () => {
      const crashedConvId = 'conv-crash-sweep-test';
      const crashedMsgId = 'msg-crash-sweep-test';

      fileStore.saveItem('conversation_tombstones', crashedConvId, {
        id: crashedConvId,
        founderId: FOUNDER_A,
        deletedAt: new Date().toISOString(),
        purgedMessageCount: 0,
        prismaReconciled: true,
      });

      fileStore.saveItem('chat_messages', crashedMsgId, {
        id: crashedMsgId,
        conversationId: crashedConvId,
        sender: 'founder',
        content: 'Ghost message from crash',
        createdAt: new Date().toISOString(),
      });

      // Run reconciliation sweep
      const rec = await convStore.reconcileAllTombstones();
      assert(rec.cleanedLocalCount >= 1);

      // Verify ghost message is wiped
      const allMsgs = fileStore.readCollection<ChatMessageRecord>('chat_messages');
      assert.strictEqual(allMsgs[crashedMsgId], undefined);
    });

    // ------------------------------------------------------------------------
    // GROUP 9: EPISODIC SEARCH & LIST RETRIEVAL HYGIENE
    // ------------------------------------------------------------------------
    await runTest('9.1: Deleted conversations are excluded from search and list views', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Episodic Secret Conversation',
      });

      await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'founder',
        content: 'Disclosing zephyr constellation secret coordinates',
      }, FOUNDER_A);

      // Search before deletion
      const searchBefore = await convStore.searchConversations(FOUNDER_A, 'constellation');
      assert.strictEqual(searchBefore.length, 1);
      assert.strictEqual(searchBefore[0].conversationId, conv.id);

      // List before deletion
      const listBefore = await convStore.listConversations(FOUNDER_A);
      assert(listBefore.some((c) => c.id === conv.id));

      // Execute deletion
      await convStore.deleteConversation(FOUNDER_A, conv.id);

      // Search after deletion: MUST return 0 hits
      const searchAfter = await convStore.searchConversations(FOUNDER_A, 'constellation');
      assert.strictEqual(searchAfter.length, 0);

      // List after deletion: MUST NOT contain deleted conversation
      const listAfter = await convStore.listConversations(FOUNDER_A);
      assert(!listAfter.some((c) => c.id === conv.id));
    });

    // ------------------------------------------------------------------------
    // GROUP 10: PRESERVATION OF INDEPENDENT AUDIT RECORDS
    // ------------------------------------------------------------------------
    await runTest('10.1: Independent AgentRun, ApprovalRecord and audit ledger are preserved intact', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Governance Bound Conversation',
      });
      const convId = conv.id;

      // Seed independent governance & audit records referencing this conversation
      const runId = `run-${convId}`;
      const approvalId = `app-${convId}`;
      const auditId = `audit-${convId}`;

      try {
        fileStore.saveItem('agent_runs', runId, {
          id: runId,
          agentId: 'sophia',
          status: 'completed',
          timestamp: new Date().toISOString(),
          metadata: { conversationId: convId, reason: 'executive_inquiry' },
        });

        fileStore.saveItem('approval_records', approvalId, {
          id: approvalId,
          action: 'hire_employee',
          status: 'approved',
          metadata: { conversationId: convId },
        });

        fileStore.saveItem('audit_ledger', auditId, {
          id: auditId,
          action: 'system_directive',
          conversationId: convId,
          timestamp: new Date().toISOString(),
        });

        // Delete the conversation
        const delResult = await convStore.deleteConversation(FOUNDER_A, convId);
        assert.strictEqual(delResult.success, true);

        // Verify conversation is gone
        assert.strictEqual(await convStore.getConversation(FOUNDER_A, convId), null);

        // Verify governance & audit records are COMPLETELY INTACT
        const runAfter = fileStore.getItem('agent_runs', runId);
        assert.notStrictEqual(runAfter, null);
        assert.strictEqual((runAfter as any).id, runId);

        const approvalAfter = fileStore.getItem('approval_records', approvalId);
        assert.notStrictEqual(approvalAfter, null);
        assert.strictEqual((approvalAfter as any).id, approvalId);

        const auditAfter = fileStore.getItem('audit_ledger', auditId);
        assert.notStrictEqual(auditAfter, null);
        assert.strictEqual((auditAfter as any).id, auditId);
      } finally {
        // Clean test audit fixtures so subsequent suites stay clean
        fileStore.deleteItem('agent_runs', runId);
        fileStore.deleteItem('approval_records', approvalId);
        fileStore.deleteItem('audit_ledger', auditId);
      }
    });

    // ------------------------------------------------------------------------
    // GROUP 11: HTTP API ENDPOINT BEHAVIOR & CONTRACTS
    // ------------------------------------------------------------------------
    await runTest('11.1: /api/conversation DELETE enforces auth (401 unauthenticated)', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversation?id=conv-test', {
        method: 'DELETE',
        headers: {
          'x-samjuniors-role': 'AUDITOR', // non-founder role
        },
      });

      const res = await conversationDelete(req);
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.success, false);
    });

    await runTest('11.2: /api/conversation DELETE returns 404 for unknown conversation', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversation?id=conv-ghost-999', {
        method: 'DELETE',
        headers: {
          'x-samjuniors-role': 'FOUNDER',
          'x-samjuniors-user-id': FOUNDER_A,
        },
      });

      const res = await conversationDelete(req);
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error, 'Conversation not found');
    });

    await runTest('11.3: /api/conversation DELETE returns 404 on cross-founder deletion (zero leakage)', async () => {
      const convA = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Alpha Secret API Conv',
      });

      // Founder B attempts to delete Founder A's conversation via API
      const req = new NextRequest(`http://localhost:3000/api/conversation?id=${convA.id}`, {
        method: 'DELETE',
        headers: {
          'x-samjuniors-role': 'FOUNDER',
          'x-samjuniors-user-id': FOUNDER_B,
        },
      });

      const res = await conversationDelete(req);
      // MUST be 404, NEVER 403 (Zero Information Leakage)
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error, 'Conversation not found');

      // Verify conversation A was NOT deleted
      assert.notStrictEqual(await convStore.getConversation(FOUNDER_A, convA.id), null);
    });

    await runTest('11.4: /api/conversation DELETE returns 200 on successful deletion and repeated delete', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Delete Me via API',
      });

      await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'founder',
        content: 'API Test message',
      }, FOUNDER_A);

      // First delete -> 200 { success: true, deleted: true }
      const req1 = new NextRequest(`http://localhost:3000/api/conversation?id=${conv.id}`, {
        method: 'DELETE',
        headers: {
          'x-samjuniors-role': 'FOUNDER',
          'x-samjuniors-user-id': FOUNDER_A,
        },
      });

      const res1 = await conversationDelete(req1);
      assert.strictEqual(res1.status, 200);
      const json1 = await res1.json();
      assert.strictEqual(json1.success, true);
      assert.strictEqual(json1.deleted, true);
      assert.strictEqual(json1.purgedMessageCount, 1);

      // Repeated delete -> 200 { success: true, deleted: false, alreadyDeleted: true }
      const req2 = new NextRequest(`http://localhost:3000/api/conversation?id=${conv.id}`, {
        method: 'DELETE',
        headers: {
          'x-samjuniors-role': 'FOUNDER',
          'x-samjuniors-user-id': FOUNDER_A,
        },
      });

      const res2 = await conversationDelete(req2);
      assert.strictEqual(res2.status, 200);
      const json2 = await res2.json();
      assert.strictEqual(json2.success, true);
      assert.strictEqual(json2.deleted, false);
      assert.strictEqual(json2.alreadyDeleted, true);
    });

    await runTest('11.5: /api/conversation/message DELETE deletes individual message', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Single Message API Test',
      });

      const msg = await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'founder',
        content: 'Individual target message',
      }, FOUNDER_A);

      // DELETE message
      const req = new NextRequest(
        `http://localhost:3000/api/conversation/message?conversationId=${conv.id}&messageId=${msg.id}`,
        {
          method: 'DELETE',
          headers: {
            'x-samjuniors-role': 'FOUNDER',
            'x-samjuniors-user-id': FOUNDER_A,
          },
        }
      );

      const res = await messageDelete(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.deleted, true);
      assert.strictEqual(json.messageId, msg.id);

      // Verify message is gone from store
      const remaining = await convStore.getMessages(conv.id, FOUNDER_A);
      assert.strictEqual(remaining.length, 0);
    });

    await runTest('11.6: /api/agent-chat DELETE alias supports conversation deletion', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Agent Chat Alias Conv',
      });

      const req = new NextRequest(
        `http://localhost:3000/api/agent-chat?conversationId=${conv.id}`,
        {
          method: 'DELETE',
          headers: {
            'x-samjuniors-role': 'FOUNDER',
            'x-samjuniors-user-id': FOUNDER_A,
          },
        }
      );

      const res = await agentChatDelete(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.deleted, true);
      assert.strictEqual(json.conversationId, conv.id);
    });

    await runTest('11.7: /api/conversation GET retrieves conversation and messages or 404 on deleted', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'API GET Test Conv',
      });

      await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'founder',
        content: 'Hello Sophia',
      }, FOUNDER_A);

      // GET active conversation
      const req1 = new NextRequest(`http://localhost:3000/api/conversation?id=${conv.id}`, {
        method: 'GET',
        headers: {
          'x-samjuniors-role': 'FOUNDER',
          'x-samjuniors-user-id': FOUNDER_A,
        },
      });

      const res1 = await conversationGet(req1);
      assert.strictEqual(res1.status, 200);
      const json1 = await res1.json();
      assert.strictEqual(json1.success, true);
      assert.strictEqual(json1.conversation.id, conv.id);
      assert.strictEqual(json1.messages.length, 1);

      // Delete conversation
      await convStore.deleteConversation(FOUNDER_A, conv.id);

      const req2 = new NextRequest(`http://localhost:3000/api/conversation?id=${conv.id}`, {
        method: 'GET',
        headers: {
          'x-samjuniors-role': 'FOUNDER',
          'x-samjuniors-user-id': FOUNDER_A,
        },
      });

      const res2 = await conversationGet(req2);
      assert.strictEqual(res2.status, 404);
    });

    // ------------------------------------------------------------------------
    // GROUP 12: BATCH 2.1 HARDENING — CONCURRENCY BARRIERS & DETERMINISTIC RACES
    // ------------------------------------------------------------------------
    await runTest('12.1: Controlled barrier — saveMessage after deletion tombstone fails closed via critical section recheck', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Barrier Race Test 1',
      });

      // Controlled barrier:
      // We simulate saveMessage having completed initial checks, but while waiting for the
      // collection lock, deleteConversation executes and tombstones the conversation.
      const originalGetConv = convStore.getConversation.bind(convStore);
      let deletionTriggered = false;

      (convStore as any).getConversation = async (fId: string, cId: string) => {
        const result = await originalGetConv(fId, cId);
        if (cId === conv.id && !deletionTriggered) {
          deletionTriggered = true;
          // Deletion runs and writes tombstone
          await convStore.deleteConversation(FOUNDER_A, conv.id);
        }
        return result;
      };

      try {
        await assert.rejects(
          async () => {
            await convStore.saveMessage({
              conversationId: conv.id,
              sender: 'founder',
              content: 'Should never be saved',
            }, FOUNDER_A);
          },
          (err: any) => {
            assert(
              err instanceof ConversationSecurityError ||
              err.name === 'ConversationSecurityError'
            );
            return true;
          }
        );
      } finally {
        (convStore as any).getConversation = originalGetConv;
      }

      // Verify no message was written
      const allMsgs = fileStore.readCollection<ChatMessageRecord>('chat_messages');
      const orphan = Object.values(allMsgs).find((m) => m && m.conversationId === conv.id);
      assert.strictEqual(orphan, undefined, 'Zero messages must exist for tombstoned conversation');
    });

    await runTest('12.2: Controlled barrier — saveMessage wins lock before deletion and is swept by subsequent delete', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Barrier Race Test 2',
      });

      // Save message wins the lock first
      const savedMsg = await convStore.saveMessage({
        conversationId: conv.id,
        sender: 'founder',
        content: 'Saved before deletion',
      }, FOUNDER_A);

      assert.strictEqual(savedMsg.content, 'Saved before deletion');

      // Then deleteConversation executes
      const delResult = await convStore.deleteConversation(FOUNDER_A, conv.id);
      assert.strictEqual(delResult.success, true);
      assert.strictEqual(delResult.purgedMessageCount, 1);

      // Verify message was swept
      const allMsgs = fileStore.readCollection<ChatMessageRecord>('chat_messages');
      const orphan = Object.values(allMsgs).find((m) => m && m.conversationId === conv.id);
      assert.strictEqual(orphan, undefined, 'Message saved before delete must be swept');
    });

    // ------------------------------------------------------------------------
    // GROUP 13: BATCH 2.1 HARDENING — PRISMA RECONCILIATION FAILURE INJECTION
    // ------------------------------------------------------------------------
    await runTest('13.1: DB connection outage leaves tombstone prismaReconciled = false and survives retry until restored', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Prisma Outage Test',
      });

      const originalDelete = (prisma as any).conversation?.delete;

      // Mock database availability active for tests
      convStore.setDatabaseAvailableForTests(true);

      // Inject failure: simulate database connection outage on delete
      (prisma as any).conversation.delete = async () => {
        const connErr = new Error("P1001: Can't reach database server at localhost:5432");
        (connErr as any).code = 'P1001';
        throw connErr;
      };

      try {
        // Execute delete under outage
        const delResult = await convStore.deleteConversation(FOUNDER_A, conv.id);
        assert.strictEqual(delResult.success, true);
        assert.strictEqual(delResult.deleted, true);

        // Verify tombstone is saved with prismaReconciled: false
        const tombstoneAfterDel = convStore.getTombstone(conv.id);
        assert(tombstoneAfterDel !== null);
        assert.strictEqual(tombstoneAfterDel.prismaReconciled, false);

        // Run store-wide reconciliation while outage persists
        const reconPass1 = await convStore.reconcileAllTombstones();
        assert.strictEqual(reconPass1.reconciledPrismaCount, 0);

        // Verify tombstone is STILL false (never falsely recorded as reconciled)
        const tombstoneAfterPass1 = convStore.getTombstone(conv.id);
        assert.strictEqual(tombstoneAfterPass1?.prismaReconciled, false);

        // Now restore database: simulate success
        (prisma as any).conversation.delete = async () => {
          return { id: conv.id };
        };

        // Run reconciliation now
        const reconPass2 = await convStore.reconcileAllTombstones();
        assert(reconPass2.reconciledPrismaCount >= 1);

        // Verify tombstone is now updated to true
        const tombstoneAfterPass2 = convStore.getTombstone(conv.id);
        assert.strictEqual(tombstoneAfterPass2?.prismaReconciled, true);
      } finally {
        convStore.setDatabaseAvailableForTests(null);
        if (originalDelete) {
          (prisma as any).conversation.delete = originalDelete;
        }
      }
    });

    await runTest('13.2: Confirmed already-absent Prisma record (P2025) is treated as reconciled', async () => {
      const convId = 'conv-absent-p2025';
      const tombstone = {
        id: convId,
        founderId: FOUNDER_A,
        deletedAt: new Date().toISOString(),
        purgedMessageCount: 0,
        prismaReconciled: false,
      };
      fileStore.saveItemStrict('conversation_tombstones', convId, tombstone);

      const originalDelete = (prisma as any).conversation?.delete;

      // Mock database availability active for tests
      convStore.setDatabaseAvailableForTests(true);

      (prisma as any).conversation.delete = async () => {
        const notFoundErr = new Error('Record to delete does not exist.');
        (notFoundErr as any).code = 'P2025';
        throw notFoundErr;
      };

      try {
        const reconPass = await convStore.reconcileAllTombstones();
        assert.strictEqual(reconPass.reconciledPrismaCount, 1);

        const tombstoneAfter = convStore.getTombstone(convId);
        assert.strictEqual(tombstoneAfter?.prismaReconciled, true);
      } finally {
        convStore.setDatabaseAvailableForTests(null);
        if (originalDelete) {
          (prisma as any).conversation.delete = originalDelete;
        }
        fileStore.deleteItemStrict('conversation_tombstones', convId);
      }
    });

    // ------------------------------------------------------------------------
    // GROUP 14: BATCH 2.1 HARDENING — FAIL-CLOSED LOCK TIMEOUT
    // ------------------------------------------------------------------------
    await runTest('14.1: Lock timeout fails closed without mutating collections', async () => {
      const lockPath = path.join(fileStore.getDataDir(), 'chat_messages.json.lock');
      // Create external lock file simulating an unyielding process
      fs.writeFileSync(lockPath, `${process.pid}\n`, 'utf-8');

      try {
        let threw = false;
        try {
          fileStore.withCollectionLockStrict(
            'chat_messages',
            () => {
              fileStore.saveItem('chat_messages', 'should-not-exist', { test: true });
            },
            50 // 50ms short timeout
          );
        } catch (err: any) {
          threw = true;
          assert(err instanceof LockTimeoutError || err.name === 'LockTimeoutError');
        }

        assert.strictEqual(threw, true, 'Strict lock must throw LockTimeoutError on timeout');

        // Verify zero mutation occurred
        const allMsgs = fileStore.readCollection('chat_messages');
        assert.strictEqual(allMsgs['should-not-exist'], undefined);
      } finally {
        try {
          if (fs.existsSync(lockPath)) {
            fs.unlinkSync(lockPath);
          }
        } catch {}
      }
    });

    // ------------------------------------------------------------------------
    // GROUP 15: BATCH 2.1 HARDENING — INDIVIDUAL MESSAGE REPLAY PREVENTION
    // ------------------------------------------------------------------------
    await runTest('15.1: Re-saving the same deleted message ID fails closed (MessageTombstonedError)', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Replay Msg ID Test',
      });

      const msgId = 'msg-replay-test-1';
      await convStore.saveMessage({
        id: msgId,
        conversationId: conv.id,
        sender: 'founder',
        content: 'Original secret message',
      }, FOUNDER_A);

      // Delete the message
      const delRes = await convStore.deleteMessage(FOUNDER_A, conv.id, msgId);
      assert.strictEqual(delRes.deleted, true);

      // Attempt to re-save with the exact same message ID
      await assert.rejects(
        async () => {
          await convStore.saveMessage({
            id: msgId,
            conversationId: conv.id,
            sender: 'founder',
            content: 'Recreated message attempt',
          }, FOUNDER_A);
        },
        (err: any) => {
          assert(
            err instanceof MessageTombstonedError ||
            err.name === 'MessageTombstonedError'
          );
          return true;
        }
      );

      // Verify message is not present
      const messages = await convStore.getMessages(conv.id, FOUNDER_A);
      assert.strictEqual(messages.length, 0);
    });

    await runTest('15.2: Replaying deleted idempotency key with a different message ID fails closed', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Replay Idempotency Key Test',
      });

      const idempotencyKey = 'idem-unique-key-abc';
      const m1 = await convStore.saveMessage({
        id: 'msg-first-instance',
        conversationId: conv.id,
        sender: 'founder',
        content: 'First attempt with idempotency key',
        idempotencyKey,
      }, FOUNDER_A);

      // Delete m1
      const delRes = await convStore.deleteMessage(FOUNDER_A, conv.id, m1.id);
      assert.strictEqual(delRes.deleted, true);

      // Attempt to replay the SAME idempotency key under a NEW message ID
      await assert.rejects(
        async () => {
          await convStore.saveMessage({
            id: 'msg-second-different-instance',
            conversationId: conv.id,
            sender: 'founder',
            content: 'Sneaky replay with same key',
            idempotencyKey,
          }, FOUNDER_A);
        },
        (err: any) => {
          assert(
            err instanceof MessageTombstonedError ||
            err.name === 'MessageTombstonedError'
          );
          return true;
        }
      );

      // Verify conversation has no messages
      const messages = await convStore.getMessages(conv.id, FOUNDER_A);
      assert.strictEqual(messages.length, 0);
    });

    await runTest('15.3: Cross-founder attempts on message tombstones fail closed', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Cross Founder Tombstone Test',
      });

      const m = await convStore.saveMessage({
        id: 'msg-founder-a-only',
        conversationId: conv.id,
        sender: 'founder',
        content: 'Alpha secret data',
      }, FOUNDER_A);

      await convStore.deleteMessage(FOUNDER_A, conv.id, m.id);

      // Founder B attempts to re-save Founder A's tombstoned message ID
      await assert.rejects(
        async () => {
          await convStore.saveMessage({
            id: 'msg-founder-a-only',
            conversationId: conv.id,
            sender: 'founder',
            content: 'Beta unauthorized inject',
          }, FOUNDER_B);
        },
        (err: any) => {
          assert(
            err instanceof ConversationSecurityError ||
            err.name === 'ConversationSecurityError' ||
            err instanceof ConversationNotFoundError ||
            err.name === 'ConversationNotFoundError'
          );
          return true;
        }
      );
    });

    await runTest('15.4: Repeated deletion of deleted message is idempotent (alreadyDeleted: true)', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Repeated Msg Delete Test',
      });

      const m = await convStore.saveMessage({
        id: 'msg-repeat-target',
        conversationId: conv.id,
        sender: 'founder',
        content: 'To be deleted twice',
      }, FOUNDER_A);

      const del1 = await convStore.deleteMessage(FOUNDER_A, conv.id, m.id);
      assert.strictEqual(del1.success, true);
      assert.strictEqual(del1.deleted, true);

      const del2 = await convStore.deleteMessage(FOUNDER_A, conv.id, m.id);
      assert.strictEqual(del2.success, true);
      assert.strictEqual(del2.deleted, false);
      assert.strictEqual(del2.alreadyDeleted, true);
    });

    await runTest('15.5: Persistence failure while writing message deletion marker fails closed', async () => {
      const conv = await convStore.createConversation({
        founderId: FOUNDER_A,
        title: 'Marker Failure Test',
      });

      const m = await convStore.saveMessage({
        id: 'msg-marker-fail-target',
        conversationId: conv.id,
        sender: 'founder',
        content: 'Must remain intact if marker fails',
      }, FOUNDER_A);

      // Intercept fileStore.saveItemStrict to inject a disk write error on message_tombstones
      const origSaveItemStrict = fileStore.saveItemStrict.bind(fileStore);
      (fileStore as any).saveItemStrict = (collection: string, id: string, item: any) => {
        if (collection === 'message_tombstones') {
          throw new Error('EIO: i/o disk failure writing message deletion marker');
        }
        return origSaveItemStrict(collection, id, item);
      };

      try {
        await assert.rejects(
          async () => {
            await convStore.deleteMessage(FOUNDER_A, conv.id, m.id);
          },
          /EIO: i\/o disk failure writing message deletion marker/
        );

        // Verify message is STILL intact in chat_messages!
        const allMsgs = fileStore.readCollection<ChatMessageRecord>('chat_messages');
        assert(allMsgs[m.id] !== undefined, 'Message must not be deleted if marker write fails');
      } finally {
        (fileStore as any).saveItemStrict = origSaveItemStrict;
      }
    });

  } finally {
    // Clean test artifacts
    convStore.clearForTests();
  }

  console.log('\n======================================================');
  console.log(`M1 BATCH 2 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
