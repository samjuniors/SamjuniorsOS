import assert from 'assert';
import { randomUUID } from 'crypto';
import {
  ConversationStore,
  ConversationSecurityError,
  ConversationNotFoundError,
} from '../../src/lib/server/conversation';
import { executeSophiaTurn } from '../../src/lib/server/sophia';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';
import { prisma, isDatabaseAvailable } from '../../src/lib/server/db/prisma';

/**
 * ============================================================================
 * M3 K-1 HARDENING REVIEW — CONVERSATION AUTHORITY SEMANTICS PINNING SUITE
 * ============================================================================
 *
 * Pins the DOCUMENTED authority semantics of the conversation system exactly
 * as reviewed on 3da24b4 (see ADR 0002 implementation-precision addendum,
 * SOPHIA_MEMORY_ARCHITECTURE.md §8, and the per-method doc comments in
 * src/lib/server/conversation/store.ts). Every assertion below documents
 * CURRENT CONTRACT — some of it is a KNOWN ISSUE that must only change via a
 * conscious Founder decision (and a matching test update).
 *
 * Pinned semantics:
 *  S1  Store: a supplied-but-unknown conversationId throws
 *      ConversationNotFoundError — the store NEVER auto-creates under a
 *      caller-supplied id (no phantom conversations).
 *  S2  Store: absent / whitespace-only conversationId creates a fresh
 *      conversation (first-turn semantics).
 *  S3  Store: ownership mismatch fails closed (ConversationSecurityError).
 *  S4  Executor: unknown conversationId provisions a FRESH founder-bound
 *      conversation (KNOWN ISSUE — diverges from ADR 0002 §7's blanket 404;
 *      agent-chat honors 404, executor forks). The bogus id itself never
 *      becomes a conversation.
 *  S5  Executor: ownership mismatch NEVER forks — it fails closed Forbidden,
 *      leaves the caller's conversation count unchanged, and the victim
 *      conversation untouched. (Security ordering: the 403 precedes the
 *      provisioning fallback.)
 *  S6  Executor KNOWN ISSUE: retrying with the SAME bogus conversationId and
 *      SAME turnId re-forks and RE-EXECUTES (the fork happens before the
 *      conversation-scoped idempotency lookup). Contrast S7.
 *  S7  Executor: retrying against the server-issued canonical conversationId
 *      with the same turnId is an idempotent replay (no new records).
 *  S8  Persistence: Prisma dual-write mirrors conversations + messages
 *      (opportunistic, current contract).
 *  S9  Persistence: getConversation reads Prisma as a fallback when the file
 *      store misses, then caches the row back (ONLY Prisma read path).
 *  S10 Persistence: getMessages / findMessageByIdempotencyKey read the
 *      DurableFileStore ONLY — Prisma message rows are write-only shadows
 *      (current contract; changes at the M6 authoritative migration).
 *
 * Covered ELSEWHERE (not duplicated here):
 *  - Fabricated browser history is non-authoritative:
 *      m3_conversation_convergence.test.ts tests 6-8 (store + file level).
 *  - Genuine process-restart durability: same suite, test 11 (bun children).
 *  - Route-level unauthenticated 401 + SSE contract: same suite, tests 2/12.
 */

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`  [FAIL] ${name}: ${err?.message || err}`);
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('M3 K-1 AUTHORITY HARDENING SUITE');
  console.log('======================================================\n');

  const convStore = ConversationStore.getInstance();
  const founderA = `founder_hr_a_${randomUUID().slice(0, 8)}`;
  const founderB = `founder_hr_b_${randomUUID().slice(0, 8)}`;
  const prismaConversationsCreated: string[] = [];

  // --------------------------------------------------------------------------
  // S1 — Store: unknown conversationId throws NotFound; no phantom creation
  // --------------------------------------------------------------------------
  await runTest('S1: store rejects unknown conversationId with ConversationNotFoundError (no phantom)', async () => {
    const bogus = `conv-hr-bogus-${randomUUID()}`;
    await assert.rejects(
      convStore.getOrCreateConversation({ founderId: founderA, conversationId: bogus }),
      (err: any) => err instanceof ConversationNotFoundError || err?.name === 'ConversationNotFoundError',
      'getOrCreateConversation must throw ConversationNotFoundError for an unknown id'
    );
    // No phantom conversation was created under the bogus id (store + file level).
    assert.strictEqual(await convStore.getConversation(founderA, bogus), null, 'bogus id must not resolve');
    const fileConvs = DurableFileStore.getInstance()
      .readCollection<{ id: string }>('conversations');
    assert.ok(!fileConvs[bogus], 'bogus id must not exist in the durable file store');
  });

  // --------------------------------------------------------------------------
  // S2 — Store: absent / whitespace-only id creates (first-turn semantics)
  // --------------------------------------------------------------------------
  await runTest('S2: store creates a fresh conversation when id is absent or whitespace-only', async () => {
    const created1 = await convStore.getOrCreateConversation({ founderId: founderA });
    assert.ok(created1.id, 'created conversation has an id');
    assert.strictEqual(created1.founderId, founderA, 'created conversation is founder-bound');
    assert.strictEqual(created1.agentId, 'sophia', 'default agent is sophia');

    const created2 = await convStore.getOrCreateConversation({
      founderId: founderA,
      conversationId: '   ',
    });
    assert.ok(created2.id, 'whitespace-only id is treated as absent');
    assert.notStrictEqual(created2.id, created1.id, 'each call provisions a distinct conversation');
  });

  // --------------------------------------------------------------------------
  // S3 — Store: ownership mismatch fails closed
  // --------------------------------------------------------------------------
  await runTest('S3: store fails closed (ConversationSecurityError) on ownership mismatch', async () => {
    const conv = await convStore.createConversation({ founderId: founderA, agentId: 'sophia' });
    await assert.rejects(
      convStore.getConversation(founderB, conv.id),
      (err: any) => err instanceof ConversationSecurityError || err?.name === 'ConversationSecurityError',
      'cross-founder read must throw ConversationSecurityError'
    );
    // Owner still reads it fine.
    const own = await convStore.getConversation(founderA, conv.id);
    assert.ok(own, 'owner still resolves the conversation');
  });

  // --------------------------------------------------------------------------
  // S4 — Executor: unknown conversationId provisions a FRESH conversation
  //      (KNOWN ISSUE, pinned)
  // --------------------------------------------------------------------------
  await runTest('S4: executor provisions a fresh founder-bound conversation for an unknown id (KNOWN ISSUE, pinned)', async () => {
    const bogus = `conv-hr-exec-bogus-${randomUUID()}`;
    const turnId = `hr-s4-${randomUUID().slice(0, 8)}`;
    const result = await executeSophiaTurn({
      message: 'What is our runway?',
      founderId: founderA,
      conversationId: bogus,
      turnId,
    });
    assert.strictEqual(result.success, true, 'turn succeeds despite the unknown id');
    assert.ok(result.conversationId, 'a canonical conversationId is returned');
    assert.notStrictEqual(result.conversationId, bogus, 'the bogus id is NOT echoed — a fresh conversation was provisioned');

    // The fork is founder-bound and canonical.
    const fork = await convStore.getConversation(founderA, result.conversationId);
    assert.ok(fork, 'the provisioned conversation exists in the canonical store');
    assert.strictEqual(fork.founderId, founderA, 'the provisioned conversation is bound to the CALLING founder');

    const messages = await convStore.getMessages(result.conversationId, founderA);
    assert.strictEqual(messages.length, 2, 'founder + assistant records persisted in the fork');

    // The bogus id never became a conversation anywhere.
    const fileConvs = DurableFileStore.getInstance()
      .readCollection<{ id: string }>('conversations');
    assert.ok(!fileConvs[bogus], 'bogus id never exists in the durable store');
  });

  // --------------------------------------------------------------------------
  // S5 — Executor: ownership mismatch NEVER forks — fails closed Forbidden
  // --------------------------------------------------------------------------
  await runTest('S5: executor ownership mismatch fails closed Forbidden and NEVER provisions a fork', async () => {
    const conv = await convStore.createConversation({ founderId: founderA, agentId: 'sophia' });
    await convStore.saveMessage(
      { conversationId: conv.id, sender: 'founder', role: 'user', content: 'victim-before' },
      founderA
    );
    const before = await convStore.getMessages(conv.id, founderA);
    const bConvCount = (await convStore.listConversations(founderB)).length;

    const result = await executeSophiaTurn({
      message: 'Intruder probe.',
      founderId: founderB,
      conversationId: conv.id,
      turnId: `hr-s5-${randomUUID().slice(0, 8)}`,
    });
    assert.strictEqual(result.success, false, 'cross-founder turn must fail');
    assert.ok(/forbidden/i.test(result.error || ''), `failure must be Forbidden (got: ${result.error})`);

    const after = await convStore.getMessages(conv.id, founderA);
    assert.strictEqual(after.length, before.length, 'victim conversation unchanged');

    const bConvCountAfter = (await convStore.listConversations(founderB)).length;
    assert.strictEqual(bConvCountAfter, bConvCount, 'no fork was provisioned for the unauthorized caller');
  });

  // --------------------------------------------------------------------------
  // S6 — Executor KNOWN ISSUE: same bogus id + same turnId re-forks and
  //      re-executes (fork precedes the conversation-scoped idempotency gate)
  // --------------------------------------------------------------------------
  await runTest('S6: KNOWN ISSUE — retry with the same bogus id + turnId re-forks and re-executes (pinned as documented)', async () => {
    const bogus = `conv-hr-retry-bogus-${randomUUID()}`;
    const turnId = `hr-s6-${randomUUID().slice(0, 8)}`;

    const first = await executeSophiaTurn({
      message: 'What is our runway?',
      founderId: founderA,
      conversationId: bogus,
      turnId,
    });
    assert.strictEqual(first.success, true);

    const second = await executeSophiaTurn({
      message: 'What is our runway?',
      founderId: founderA,
      conversationId: bogus, // caller did NOT adopt the server-issued id
      turnId, // same turn
    });
    assert.strictEqual(second.success, true, 'retry also completes');
    assert.notStrictEqual(
      second.conversationId,
      first.conversationId,
      'KNOWN ISSUE pinned: the retry forks a SECOND fresh conversation (idempotency is conversation-scoped and the fork happens first)'
    );
    assert.ok(second.idempotentReplay !== true, 'KNOWN ISSUE pinned: the retry is NOT recognized as an idempotent replay');

    const m1 = await convStore.getMessages(first.conversationId, founderA);
    const m2 = await convStore.getMessages(second.conversationId, founderA);
    assert.strictEqual(m1.length + m2.length, 4, 'the turn executed twice in two distinct forks');
  });

  // --------------------------------------------------------------------------
  // S7 — Executor: retry against the server-issued id IS an idempotent replay
  // --------------------------------------------------------------------------
  await runTest('S7: retry against the adopted canonical conversationId replays idempotently (contrast to S6)', async () => {
    const turnId = `hr-s7-${randomUUID().slice(0, 8)}`;
    const first = await executeSophiaTurn({
      message: 'What is our runway?',
      founderId: founderA,
      turnId,
    });
    assert.strictEqual(first.success, true);

    const second = await executeSophiaTurn({
      message: 'What is our runway?',
      founderId: founderA,
      conversationId: first.conversationId, // caller adopted the server-issued id
      turnId, // same turn
    });
    assert.strictEqual(second.idempotentReplay, true, 'canonical retry must replay');
    assert.strictEqual(second.reply, first.reply, 'replayed reply is byte-identical');
    const messages = await convStore.getMessages(first.conversationId, founderA);
    assert.strictEqual(messages.length, 2, 'replay appends nothing');
  });

  // --------------------------------------------------------------------------
  // S8-S10 — Current persistence-layer semantics (change ONLY at the M6
  //          authoritative migration; each pin must be consciously updated)
  // --------------------------------------------------------------------------
  const dbAvailable = await isDatabaseAvailable();
  if (!dbAvailable) {
    console.log('  [SKIP] S8-S10: DATABASE_URL unavailable — Prisma-semantics pins skipped');
  } else {
    // S8 — Prisma dual-write mirrors conversations + messages
    await runTest('S8: Prisma dual-write mirrors conversation + message rows (opportunistic mirror contract)', async () => {
      const conv = await convStore.createConversation({ founderId: founderA, agentId: 'sophia' });
      prismaConversationsCreated.push(conv.id);
      const saved = await convStore.saveMessage(
        { conversationId: conv.id, sender: 'founder', role: 'user', content: `hr-s8-${randomUUID().slice(0, 8)}` },
        founderA
      );
      const row = await (prisma as any).conversation.findUnique({ where: { id: conv.id } });
      assert.ok(row, 'conversation mirrored to Prisma');
      assert.strictEqual(row.founderId, founderA, 'Prisma mirror preserves founder binding');
      const msgRow = await (prisma as any).chatMessage.findUnique({ where: { id: saved.id } });
      assert.ok(msgRow, 'message mirrored to Prisma');
      assert.strictEqual(msgRow.conversationId, conv.id, 'Prisma message row references the conversation');
    });

    // S9 — getConversation's Prisma fallback + cache-back (the ONLY Prisma read)
    await runTest('S9: getConversation falls back to Prisma on a file miss and caches the row back', async () => {
      const id = `conv-hr-prisma-only-${randomUUID()}`;
      const now = new Date();
      await (prisma as any).conversation.create({
        data: {
          id,
          founderId: founderA,
          agentId: 'sophia',
          status: 'active',
          metadata: {},
          createdAt: now,
          updatedAt: now,
        },
      });
      prismaConversationsCreated.push(id);

      // File store does NOT have it — only Prisma does.
      const fileBefore = DurableFileStore.getInstance()
        .readCollection<{ id: string }>('conversations');
      assert.ok(!fileBefore[id], 'precondition: row exists only in Prisma');

      const fetched = await convStore.getConversation(founderA, id);
      assert.ok(fetched, 'getConversation resolves the Prisma-only row via fallback');
      assert.strictEqual(fetched.founderId, founderA, 'fallback preserves ownership binding');

      const fileAfter = DurableFileStore.getInstance()
        .readCollection<{ id: string }>('conversations');
      assert.ok(fileAfter[id], 'the Prisma row was cached back into the durable file store');
    });

    // S10 — Messages read file-only; Prisma message rows are write-only shadows
    await runTest('S10: getMessages/findMessageByIdempotencyKey read the file store ONLY (Prisma rows are write-only shadows)', async () => {
      const conv = await convStore.createConversation({ founderId: founderA, agentId: 'sophia' });
      prismaConversationsCreated.push(conv.id);
      const shadowId = `msg-hr-shadow-${randomUUID()}`;
      const shadowKey = `hr-shadow-key-${randomUUID().slice(0, 8)}`;
      await (prisma as any).chatMessage.create({
        data: {
          id: shadowId,
          conversationId: conv.id,
          sender: 'founder',
          role: 'user',
          content: 'PRISMA-ONLY-SHADOW-MESSAGE',
          idempotencyKey: shadowKey,
          metadata: {},
          createdAt: new Date(),
        },
      });

      try {
        const messages = await convStore.getMessages(conv.id, founderA);
        assert.ok(
          !messages.some((m) => m.id === shadowId),
          'CURRENT CONTRACT pinned: a Prisma-only message is invisible to getMessages (file store is the read authority)'
        );
        const byKey = await convStore.findMessageByIdempotencyKey(conv.id, shadowKey);
        assert.strictEqual(
          byKey,
          null,
          'CURRENT CONTRACT pinned: the idempotency gate is file-backed — Prisma-only rows are invisible'
        );
      } finally {
        await (prisma as any).chatMessage.delete({ where: { id: shadowId } }).catch(() => {});
      }
    });
  }

  // --------------------------------------------------------------------------
  // Cleanup: remove this suite's Prisma artifacts (best-effort)
  // --------------------------------------------------------------------------
  if (dbAvailable) {
    for (const convId of prismaConversationsCreated) {
      await (prisma as any).conversation.delete({ where: { id: convId } }).catch(() => {});
    }
    await (prisma as any).conversation.deleteMany({ where: { founderId: { in: [founderA, founderB] } } }).catch(() => {});
    await (prisma as any).conversation.deleteMany({ where: { founderId: { startsWith: 'founder_hr_' } } }).catch(() => {});
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log('\n======================================================');
  console.log(`M3 K-1 HARDENING SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('M3 K-1 hardening suite crashed:', err);
  process.exit(1);
});
