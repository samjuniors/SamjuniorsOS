import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import {
  SophiaMemoryStore,
  SophiaMemoryValidationError,
  SophiaMemorySecurityError,
  SOPHIA_MEMORY_LIFECYCLE_STATES,
  SOPHIA_MEMORY_LIFECYCLE_TRANSITIONS,
  SOPHIA_MEMORY_LIFECYCLE_BIRTH_STATES,
  SophiaMemoryLifecycleError,
  canTransitionSophiaMemory,
  isEligibleForPersonalMindContext,
} from '../../src/lib/server/sophia/personal-memory-store';
import {
  resolveLifecycleState,
  withResolvedLifecycle,
} from '../../src/lib/server/sophia/memory-lifecycle';
import { SophiaContextAssembler } from '../../src/lib/server/sophia';
import {
  captureSophiaMemoryCandidates,
} from '../../src/lib/server/sophia/memory-capture-stage';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';
import { prisma, isDatabaseAvailable } from '../../src/lib/server/db/prisma';
import * as memoryRoute from '../../src/app/api/sofia/memory/route';

/**
 * ============================================================================
 * M4-B.1 — SOPHIA PERSONAL MEMORY LIFECYCLE FOUNDATION SUITE
 * ============================================================================
 *
 * The first narrow slice of M4-B: replace the overloaded `active` boolean
 * with an explicit, auditable lifecycle model and establish the provenance
 * needed for later correction, supersession, archive, and contradiction
 * behavior. This suite pins the LIFECYCLE FOUNDATION ONLY:
 *
 *   L1   Model integrity — states, transition table, birth states,
 *        eligibility (ACTIVE = advisory context eligibility ONLY).
 *   L2   Creation — founder-direct defaults ACTIVE; capture birth state
 *        PENDING_REVIEW; non-birth creation states refused; inconsistent
 *        active/lifecycleState creation refused.
 *   L3   Activation (compat path) — PATCH active:true is still the ONLY
 *        activation path for captured candidates; confirmation stamp
 *        (confirmedAt + NEW confirmedBy attribution) + audit trail.
 *   L4   Explicit transitions — ACTIVE↔ARCHIVED, idempotent same-state
 *        no-ops, derived `active` mirror stays synchronized.
 *   L5   REJECTED tombstone — provenance preserved, out of context, out of
 *        the pending queue, terminal (fail-closed on any exit transition).
 *   L6   Illegal transitions fail closed (never into PENDING_REVIEW;
 *        ambiguous active+lifecycleState; supersededByMemoryId misuse).
 *   L7   Supersession provenance — create-B + mark-A pointer recorded;
 *        successor untouched; self/cross-founder/unknown successor refused;
 *        restore SUPERSEDED → ACTIVE.
 *   L8   Review-queue isolation (route) — ?lifecycleState=PENDING_REVIEW
 *        returns ONLY pending candidates (ARCHIVED no longer pollutes the
 *        queue — the M4-B.1 conflation fix); ?active=false compat intact;
 *        combined/invalid filters refused.
 *   L9   Context assembly — ONLY ACTIVE records render into the
 *        PERSONAL_MIND_MEMORY slice.
 *   L10  No automatic activation (regression) — captured candidates stay
 *        PENDING_REVIEW and out of context until the Founder activates.
 *   L11  Cross-founder 403 on lifecycle transitions.
 *   L12  Legacy derivation — pre-M4-B.1 records derive at read time and are
 *        lazily stamped on their first update.
 *   L13  Prisma mirror carries lifecycleState (DB-gated).
 *   L14  Route-level lifecycle PATCH end-to-end (governed ingress).
 *
 * NOT UNDER TEST (deliberately out of M4-B.1 scope): vectors/embeddings,
 * consolidation, decay/TTL, background schedulers, automatic activation,
 * semantic LLM memory reasoning, cross-founder memory, Company Brain changes.
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

const DATA_DIR = path.resolve(process.cwd(), '.data');

function readCollectionFile<T>(name: string): Record<string, T> {
  const p = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, T>;
  } catch {
    return {};
  }
}

function routeReq(method: string, founderId: string | null, body?: Record<string, unknown>, query = ''): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (founderId) {
    headers['x-samjuniors-user-id'] = founderId;
    headers['x-samjuniors-role'] = 'FOUNDER';
  }
  return new NextRequest(`http://localhost:3000/api/sofia/memory${query}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function main() {
  console.log('\n======================================================');
  console.log('M4-B.1 PERSONAL MEMORY LIFECYCLE FOUNDATION SUITE');
  console.log('======================================================\n');

  const store = SophiaMemoryStore.getInstance();
  const fileStore = DurableFileStore.getInstance();
  const founderA = `founder_m4b1_a_${randomUUID().slice(0, 8)}`;
  const founderB = `founder_m4b1_b_${randomUUID().slice(0, 8)}`;
  const prismaRowsCreated: string[] = [];
  const dbAvailable = await isDatabaseAvailable().catch(() => false);

  // Isolate this suite's personal memory state from anything left in .data.
  store.clearForTests();

  // ==========================================================================
  // L1 — MODEL INTEGRITY (pure functions; no state)
  // ==========================================================================
  await runTest('L1a: lifecycle states are exactly the five M4-B states', async () => {
    assert.deepStrictEqual([...SOPHIA_MEMORY_LIFECYCLE_STATES], [
      'PENDING_REVIEW',
      'ACTIVE',
      'SUPERSEDED',
      'ARCHIVED',
      'REJECTED',
    ]);
    assert.deepStrictEqual([...SOPHIA_MEMORY_LIFECYCLE_BIRTH_STATES], ['PENDING_REVIEW', 'ACTIVE']);
  });

  await runTest('L1b: transition table matches the M4-B.1 contract (founder-only, fail-closed)', async () => {
    assert.deepStrictEqual([...SOPHIA_MEMORY_LIFECYCLE_TRANSITIONS.PENDING_REVIEW], ['ACTIVE', 'ARCHIVED', 'REJECTED']);
    assert.deepStrictEqual([...SOPHIA_MEMORY_LIFECYCLE_TRANSITIONS.ACTIVE], ['ARCHIVED', 'SUPERSEDED']);
    assert.deepStrictEqual([...SOPHIA_MEMORY_LIFECYCLE_TRANSITIONS.ARCHIVED], ['ACTIVE', 'SUPERSEDED']);
    assert.deepStrictEqual([...SOPHIA_MEMORY_LIFECYCLE_TRANSITIONS.SUPERSEDED], ['ACTIVE']);
    assert.deepStrictEqual([...SOPHIA_MEMORY_LIFECYCLE_TRANSITIONS.REJECTED], []);
    // Nothing may ever transition INTO PENDING_REVIEW.
    for (const from of SOPHIA_MEMORY_LIFECYCLE_STATES) {
      assert.ok(!canTransitionSophiaMemory(from, 'PENDING_REVIEW'), `${from} → PENDING_REVIEW must be illegal`);
    }
  });

  await runTest('L1c: ACTIVE means context eligibility ONLY — every other state is ineligible', async () => {
    assert.strictEqual(isEligibleForPersonalMindContext('ACTIVE'), true);
    for (const state of SOPHIA_MEMORY_LIFECYCLE_STATES) {
      if (state !== 'ACTIVE') {
        assert.strictEqual(isEligibleForPersonalMindContext(state), false, `${state} must be ineligible`);
      }
    }
  });

  await runTest('L1d: legacy derivation is total and behavior-preserving', async () => {
    // active:true → ACTIVE
    assert.strictEqual(
      resolveLifecycleState({ active: true, metadata: {} }),
      'ACTIVE'
    );
    // active:false + captureStatus pending → PENDING_REVIEW (captured, unreviewed)
    assert.strictEqual(
      resolveLifecycleState({ active: false, metadata: { captureStatus: 'pending' } }),
      'PENDING_REVIEW'
    );
    // active:false + anything else → ARCHIVED (founder-deactivated)
    assert.strictEqual(
      resolveLifecycleState({ active: false, metadata: { captureStatus: 'confirmed' } }),
      'ARCHIVED'
    );
    assert.strictEqual(resolveLifecycleState({ active: false, metadata: {} }), 'ARCHIVED');
    assert.strictEqual(resolveLifecycleState({ active: false }), 'ARCHIVED');
    // An explicit lifecycleState is never overridden
    assert.strictEqual(
      resolveLifecycleState({ active: false, lifecycleState: 'SUPERSEDED', metadata: {} }),
      'SUPERSEDED'
    );
    // Untrusted garbage states fall back to derivation
    assert.strictEqual(
      resolveLifecycleState({ active: true, lifecycleState: 'hacked', metadata: {} } as any),
      'ACTIVE'
    );
  });

  // ==========================================================================
  // L2 — CREATION LIFECYCLE
  // ==========================================================================
  await runTest('L2a: founder-direct creation defaults to ACTIVE (compat contract)', async () => {
    const mem = await store.createMemory({
      founderId: founderA,
      memoryType: 'INTERACTION_PREFERENCE',
      content: `L2a founder-direct memory ${randomUUID().slice(0, 8)}`,
    });
    assert.strictEqual(mem.lifecycleState, 'ACTIVE');
    assert.strictEqual(mem.active, true, 'derived mirror synchronized');
    // Persisted on disk with the explicit state
    const raw = readCollectionFile<any>('sophia_memories')[mem.id];
    assert.strictEqual(raw.lifecycleState, 'ACTIVE');
  });

  await runTest('L2b: capture-style creation (active:false) derives PENDING_REVIEW', async () => {
    const mem = await store.createMemory({
      founderId: founderA,
      memoryType: 'INTERACTION_PREFERENCE',
      content: `L2b captured candidate ${randomUUID().slice(0, 8)}`,
      active: false,
      metadata: { captureStatus: 'pending' },
    });
    assert.strictEqual(mem.lifecycleState, 'PENDING_REVIEW');
    assert.strictEqual(mem.active, false);
  });

  await runTest('L2c: explicit birth state accepted; non-birth creation states refused fail-closed', async () => {
    const okPending = await store.createMemory({
      founderId: founderA,
      memoryType: 'PERSONAL_CONTEXT_NOTE',
      content: `L2c explicit pending ${randomUUID().slice(0, 8)}`,
      lifecycleState: 'PENDING_REVIEW',
    });
    assert.strictEqual(okPending.lifecycleState, 'PENDING_REVIEW');

    for (const bad of ['SUPERSEDED', 'ARCHIVED', 'REJECTED'] as const) {
      await assert.rejects(
        () =>
          store.createMemory({
            founderId: founderA,
            memoryType: 'PERSONAL_CONTEXT_NOTE',
            content: `L2c illegal birth ${bad} ${randomUUID().slice(0, 8)}`,
            lifecycleState: bad,
          }),
        (err: any) => err instanceof SophiaMemoryLifecycleError
      );
    }
  });

  await runTest('L2d: inconsistent active/lifecycleState creation refused', async () => {
    await assert.rejects(
      () =>
        store.createMemory({
          founderId: founderA,
          memoryType: 'PERSONAL_CONTEXT_NOTE',
          content: `L2d inconsistent ${randomUUID().slice(0, 8)}`,
          lifecycleState: 'PENDING_REVIEW',
          active: true,
        }),
        (err: any) => err instanceof SophiaMemoryValidationError
    );
  });

  // ==========================================================================
  // L3 — ACTIVATION (compat path, M4-A contract preserved)
  // ==========================================================================
  let activationCandidateId = '';
  await runTest('L3: PATCH active:true activates a pending candidate (ONLY activation path) with confirmedAt + confirmedBy + audit trail', async () => {
    const candidate = await store.createMemory({
      founderId: founderA,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `L3 captured preference ${randomUUID().slice(0, 8)}`,
      lifecycleState: 'PENDING_REVIEW',
      metadata: {
        captureStatus: 'pending',
        conversationId: 'conv-l3',
        gate: { decision: 'NEEDS_REVIEW', reasons: ['PASSED_DETERMINISTIC_CHECKS'] },
      },
    });
    activationCandidateId = candidate.id;

    const confirmed = await store.updateMemory(founderA, candidate.id, { active: true });
    assert.strictEqual(confirmed.lifecycleState, 'ACTIVE');
    assert.strictEqual(confirmed.active, true);
    assert.strictEqual(confirmed.metadata.captureStatus, 'confirmed');
    assert.ok(confirmed.metadata.confirmedAt, 'confirmedAt stamped');
    assert.strictEqual(confirmed.metadata.confirmedBy, founderA, 'confirmedBy attribution (M4-B.1)');

    // Audit trail — the executed transition with the founder as actor
    const transitions = (confirmed.metadata.lifecycle as any)?.transitions as any[];
    assert.ok(Array.isArray(transitions) && transitions.length === 1, 'one audit entry');
    assert.strictEqual(transitions[0].from, 'PENDING_REVIEW');
    assert.strictEqual(transitions[0].to, 'ACTIVE');
    assert.strictEqual(transitions[0].by, founderA);
    assert.ok(transitions[0].at);

    // Provenance preserved — capture metadata intact through the transition
    assert.strictEqual(confirmed.metadata.conversationId, 'conv-l3');
    assert.deepStrictEqual(confirmed.metadata.gate, {
      decision: 'NEEDS_REVIEW',
      reasons: ['PASSED_DETERMINISTIC_CHECKS'],
    });

    // Founder-direct toggle (no captureStatus) stamps nothing (S3 parity)
    const direct = await store.createMemory({
      founderId: founderA,
      memoryType: 'INTERACTION_PREFERENCE',
      content: `L3 direct no-stamp ${randomUUID().slice(0, 8)}`,
    });
    await store.updateMemory(founderA, direct.id, { active: false });
    const back = await store.updateMemory(founderA, direct.id, { active: true });
    assert.strictEqual(back.metadata.captureStatus, undefined);
    assert.strictEqual(back.metadata.confirmedAt, undefined);
    assert.strictEqual(back.metadata.confirmedBy, undefined);
  });

  // ==========================================================================
  // L4 — EXPLICIT TRANSITIONS + DERIVED MIRROR
  // ==========================================================================
  await runTest('L4: ACTIVE → ARCHIVED → ACTIVE; derived mirror synchronized; idempotent no-ops add no audit entries', async () => {
    const mem = await store.createMemory({
      founderId: founderA,
      memoryType: 'INTERACTION_PREFERENCE',
      content: `L4 transition probe ${randomUUID().slice(0, 8)}`,
    });

    const archived = await store.updateMemory(founderA, mem.id, { lifecycleState: 'ARCHIVED' });
    assert.strictEqual(archived.lifecycleState, 'ARCHIVED');
    assert.strictEqual(archived.active, false, 'derived mirror false when archived');

    // Idempotent same-state no-op: no new audit entry
    const again = await store.updateMemory(founderA, mem.id, { lifecycleState: 'ARCHIVED' });
    assert.strictEqual(again.lifecycleState, 'ARCHIVED');
    const t1 = ((again.metadata.lifecycle as any)?.transitions ?? []) as any[];
    assert.strictEqual(t1.length, 1, 'same-state patch records no transition');

    // Legacy deactivation on an ARCHIVED record is a no-op (compat: pending
    // stays pending; archived stays archived — nothing errors)
    const noop = await store.updateMemory(founderA, mem.id, { active: false });
    assert.strictEqual(noop.lifecycleState, 'ARCHIVED');

    const restored = await store.updateMemory(founderA, mem.id, { active: true });
    assert.strictEqual(restored.lifecycleState, 'ACTIVE');
    assert.strictEqual(restored.active, true);
    const t2 = ((restored.metadata.lifecycle as any)?.transitions ?? []) as any[];
    assert.strictEqual(t2.length, 2, 'ARCHIVED → ACTIVE audited');
    assert.strictEqual(t2[1].from, 'ARCHIVED');
    assert.strictEqual(t2[1].to, 'ACTIVE');

    // active list membership follows the derived state
    const activeList = await store.listMemories(founderA, { active: true, limit: 50 });
    assert.ok(activeList.some((m) => m.id === mem.id));
    const archivedList = await store.listMemories(founderA, { lifecycleState: 'ARCHIVED', limit: 50 });
    assert.ok(!archivedList.some((m) => m.id === mem.id));
  });

  // ==========================================================================
  // L5 — REJECTED TOMBSTONE
  // ==========================================================================
  let rejectedId = '';
  await runTest('L5: REJECTED is a provenance-preserving terminal tombstone', async () => {
    const candidate = await store.createMemory({
      founderId: founderA,
      memoryType: 'INTERACTION_OBSERVATION',
      content: `L5 rejected candidate ${randomUUID().slice(0, 8)}`,
      lifecycleState: 'PENDING_REVIEW',
      idempotencyKey: `m4b1:reject:${randomUUID().slice(0, 8)}`,
      metadata: {
        captureStatus: 'pending',
        conversationId: 'conv-l5',
        gate: { decision: 'NEEDS_REVIEW', reasons: ['PASSED_DETERMINISTIC_CHECKS'] },
      },
    });
    rejectedId = candidate.id;

    const rejected = await store.updateMemory(founderA, candidate.id, { lifecycleState: 'REJECTED' });
    assert.strictEqual(rejected.lifecycleState, 'REJECTED');
    assert.strictEqual(rejected.active, false);

    // Provenance preserved (never silently deleted)
    assert.strictEqual(rejected.metadata.conversationId, 'conv-l5');
    assert.strictEqual(rejected.metadata.captureStatus, 'pending');
    assert.strictEqual(rejected.idempotencyKey, candidate.idempotencyKey);
    const transitions = (rejected.metadata.lifecycle as any)?.transitions as any[];
    assert.strictEqual(transitions[0].from, 'PENDING_REVIEW');
    assert.strictEqual(transitions[0].to, 'REJECTED');

    // The tombstone still EXISTS on disk (reject ≠ delete)
    const raw = readCollectionFile<any>('sophia_memories')[rejected.id];
    assert.ok(raw, 'tombstone persisted');

    // It stays in the non-active compat set but NEVER in the pending queue
    const notActive = await store.listMemories(founderA, { active: false, limit: 50 });
    assert.ok(notActive.some((m) => m.id === rejected.id), 'compat ?active=false includes REJECTED');
    const pendingQueue = await store.listMemories(founderA, { lifecycleState: 'PENDING_REVIEW', limit: 50 });
    assert.ok(!pendingQueue.some((m) => m.id === rejected.id), 'REJECTED is out of the review queue');

    // TERMINAL: every exit transition fails closed
    for (const target of ['ACTIVE', 'ARCHIVED', 'SUPERSEDED', 'PENDING_REVIEW'] as const) {
      await assert.rejects(
        () => store.updateMemory(founderA, rejected.id, { lifecycleState: target }),
        (err: any) => err instanceof SophiaMemoryLifecycleError,
        `REJECTED → ${target} must fail`
      );
    }
    await assert.rejects(
      () => store.updateMemory(founderA, rejected.id, { active: true }),
      (err: any) => err instanceof SophiaMemoryLifecycleError,
      'REJECTED + active:true must fail (rejected stays rejected)'
    );
  });

  // ==========================================================================
  // L6 — ILLEGAL TRANSITIONS FAIL CLOSED
  // ==========================================================================
  await runTest('L6: ambiguous and illegal patches refused (400-class errors, state unchanged)', async () => {
    const mem = await store.createMemory({
      founderId: founderA,
      memoryType: 'PERSONAL_CONTEXT_NOTE',
      content: `L6 illegal probe ${randomUUID().slice(0, 8)}`,
    });

    // active + lifecycleState together → ambiguous
    await assert.rejects(
      () => store.updateMemory(founderA, mem.id, { active: true, lifecycleState: 'ACTIVE' } as any),
      (err: any) => err instanceof SophiaMemoryValidationError
    );
    // supersededByMemoryId without SUPERSEDED target → invalid
    await assert.rejects(
      () => store.updateMemory(founderA, mem.id, { lifecycleState: 'ARCHIVED', supersededByMemoryId: 'smem-x' } as any),
      (err: any) => err instanceof SophiaMemoryValidationError
    );
    // ACTIVE → REJECTED is not in the table (use ARCHIVED for deactivation)
    await assert.rejects(
      () => store.updateMemory(founderA, mem.id, { lifecycleState: 'REJECTED' }),
      (err: any) => err instanceof SophiaMemoryLifecycleError
    );
    // Untrusted state strings rejected
    await assert.rejects(
      () => store.updateMemory(founderA, mem.id, { lifecycleState: 'HACKED' as any }),
      (err: any) => err instanceof SophiaMemoryValidationError
    );
    // Store-level filter ambiguity is fail-closed too
    await assert.rejects(
      () => store.listMemories(founderA, { active: true, lifecycleState: 'ACTIVE' } as any),
      (err: any) => err instanceof SophiaMemoryValidationError
    );

    // State unchanged after every refusal
    const after = await store.getMemory(founderA, mem.id);
    assert.strictEqual(after?.lifecycleState, 'ACTIVE');
    const transitions = ((after?.metadata.lifecycle as any)?.transitions ?? []) as any[];
    assert.strictEqual(transitions.length, 0, 'no audit entries from refused patches');
  });

  // ==========================================================================
  // L7 — SUPERSESSION PROVENANCE
  // ==========================================================================
  await runTest('L7: create-B + mark-A supersession — pointer recorded, successor untouched, restore possible', async () => {
    const memA = await store.createMemory({
      founderId: founderA,
      memoryType: 'INTERACTION_PREFERENCE',
      content: `L7 old preference: concise answers ${randomUUID().slice(0, 8)}`,
    });
    const memB = await store.createMemory({
      founderId: founderA,
      memoryType: 'INTERACTION_PREFERENCE',
      content: `L7 new preference: detailed answers with examples ${randomUUID().slice(0, 8)}`,
    });

    // Self-supersession refused
    await assert.rejects(
      () => store.updateMemory(founderA, memA.id, { lifecycleState: 'SUPERSEDED', supersededByMemoryId: memA.id }),
      (err: any) => err instanceof SophiaMemoryValidationError
    );
    // Cross-founder successor refused (403 semantics)
    await assert.rejects(
      () => store.updateMemory(founderA, memA.id, { lifecycleState: 'SUPERSEDED', supersededByMemoryId: 'smem-nonexistent' }),
      (err: any) => err.name === 'SophiaMemoryNotFoundError'
    );

    // Founder B's memory cannot be the successor (ownership fails closed)
    const memBofB = await store.createMemory({
      founderId: founderB,
      memoryType: 'INTERACTION_PREFERENCE',
      content: `L7 other founder memory ${randomUUID().slice(0, 8)}`,
    });
    await assert.rejects(
      () => store.updateMemory(founderA, memA.id, { lifecycleState: 'SUPERSEDED', supersededByMemoryId: memBofB.id }),
      (err: any) => err instanceof SophiaMemorySecurityError
    );

    // Valid supersession
    const superseded = await store.updateMemory(founderA, memA.id, {
      lifecycleState: 'SUPERSEDED',
      supersededByMemoryId: memB.id,
    });
    assert.strictEqual(superseded.lifecycleState, 'SUPERSEDED');
    assert.strictEqual(superseded.active, false, 'out of context');
    const pointer = superseded.metadata.supersededBy as any;
    assert.strictEqual(pointer.memoryId, memB.id);
    assert.strictEqual(pointer.content, memB.content, 'audit snapshot of successor content');
    assert.ok(pointer.at);

    // Successor untouched — nothing automatic happens on either side
    const successorAfter = await store.getMemory(founderA, memB.id);
    assert.strictEqual(successorAfter?.lifecycleState, 'ACTIVE');
    assert.strictEqual(successorAfter?.metadata.supersededBy, undefined);

    // A is out of context; both remain in the compat non-active/active lists
    const activeList = await store.listMemories(founderA, { active: true, limit: 50 });
    assert.ok(!activeList.some((m) => m.id === memA.id));
    assert.ok(activeList.some((m) => m.id === memB.id));

    // Restore a wrong supersession (founder decision)
    const restored = await store.updateMemory(founderA, memA.id, { lifecycleState: 'ACTIVE' });
    assert.strictEqual(restored.lifecycleState, 'ACTIVE');
    assert.strictEqual(
      (restored.metadata.supersededBy as any)?.memoryId,
      memB.id,
      'pointer retained for audit'
    );
    const transitions = (restored.metadata.lifecycle as any)?.transitions as any[];
    assert.ok(transitions.some((t) => t.from === 'ACTIVE' && t.to === 'SUPERSEDED'));
    assert.ok(transitions.some((t) => t.from === 'SUPERSEDED' && t.to === 'ACTIVE'));
  });

  // ==========================================================================
  // L8 — REVIEW-QUEUE ISOLATION (governed route)
  // ==========================================================================
  await runTest('L8: route queue isolation — ?lifecycleState=PENDING_REVIEW shows ONLY pending; ?active=false stays compat; combined filter 400', async () => {
    // A pending captured candidate
    const pending = await store.createMemory({
      founderId: founderA,
      memoryType: 'INTERACTION_OBSERVATION',
      content: `L8 pending candidate ${randomUUID().slice(0, 8)}`,
      lifecycleState: 'PENDING_REVIEW',
      metadata: { captureStatus: 'pending' },
    });
    // A confirmed memory the founder archived (pre-M4-B.1 this polluted the queue)
    const archived = await store.createMemory({
      founderId: founderA,
      memoryType: 'INTERACTION_PREFERENCE',
      content: `L8 archived memory ${randomUUID().slice(0, 8)}`,
    });
    await store.updateMemory(founderA, archived.id, { active: false }); // ACTIVE → ARCHIVED
    // The tombstone from L5 is also present (rejectedId).

    const queueRes = await memoryRoute.GET(routeReq('GET', founderA, undefined, '?lifecycleState=PENDING_REVIEW&limit=50'));
    assert.strictEqual(queueRes.status, 200);
    const queueBody = await queueRes.json();
    const queueIds = (queueBody.memories as any[]).map((m) => m.id);
    assert.ok(queueIds.includes(pending.id), 'pending candidate is in the queue');
    assert.ok(!queueIds.includes(archived.id), 'ARCHIVED record no longer pollutes the review queue');
    assert.ok(!queueIds.includes(rejectedId), 'REJECTED tombstone is not in the queue');
    assert.ok(queueBody.memories.every((m: any) => m.lifecycleState === 'PENDING_REVIEW'));

    // Compat: ?active=false returns the full non-active set (archived + rejected + pending)
    const compatRes = await memoryRoute.GET(routeReq('GET', founderA, undefined, '?active=false&limit=50'));
    const compatBody = await compatRes.json();
    const compatIds = (compatBody.memories as any[]).map((m) => m.id);
    assert.ok(compatIds.includes(archived.id) && compatIds.includes(rejectedId) && compatIds.includes(pending.id));

    // Combined filter → 400; invalid state → 400
    const bothRes = await memoryRoute.GET(routeReq('GET', founderA, undefined, '?active=false&lifecycleState=PENDING_REVIEW'));
    assert.strictEqual(bothRes.status, 400);
    const badStateRes = await memoryRoute.GET(routeReq('GET', founderA, undefined, '?lifecycleState=BOGUS'));
    assert.strictEqual(badStateRes.status, 400);
  });

  // ==========================================================================
  // L9 — CONTEXT ASSEMBLY: ONLY ACTIVE RENDERS
  // ==========================================================================
  await runTest('L9: only ACTIVE memories render into PERSONAL_MIND_MEMORY (all other states excluded)', async () => {
    const marker = `L9CTX${randomUUID().slice(0, 8)}`;
    const activeMem = await store.createMemory({
      founderId: founderA,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `Active preference marker ${marker} visible`,
    });
    const pendingMem = await store.createMemory({
      founderId: founderA,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `Pending marker ${marker} hidden`,
      lifecycleState: 'PENDING_REVIEW',
    });
    const archivedMem = await store.createMemory({
      founderId: founderA,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `Archived marker ${marker} hidden`,
    });
    await store.updateMemory(founderA, archivedMem.id, { lifecycleState: 'ARCHIVED' });
    const supersededMem = await store.createMemory({
      founderId: founderA,
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: `Superseded marker ${marker} hidden`,
    });
    await store.updateMemory(founderA, supersededMem.id, { lifecycleState: 'SUPERSEDED' });
    // rejectedId from L5 carries its own marker already

    const assembled = await SophiaContextAssembler.assemble({
      message: 'How should I communicate with you?',
      founderId: founderA,
    });
    const ctx = assembled.formattedContext;
    assert.ok(ctx.includes(`Active preference marker ${marker} visible`), 'ACTIVE renders');
    assert.ok(!ctx.includes(`Pending marker ${marker}`), 'PENDING_REVIEW excluded');
    assert.ok(!ctx.includes(`Archived marker ${marker}`), 'ARCHIVED excluded');
    assert.ok(!ctx.includes(`Superseded marker ${marker}`), 'SUPERSEDED excluded');
    assert.ok(!ctx.includes('L5 rejected candidate'), 'REJECTED excluded');
  });

  // ==========================================================================
  // L10 — NO AUTOMATIC ACTIVATION (M4-A REGRESSION, now lifecycle-explicit)
  // ==========================================================================
  await runTest('L10: captured candidates stay PENDING_REVIEW and out of context until Founder activation (no auto-activation)', async () => {
    const marker = `L10AUTO${randomUUID().slice(0, 8)}`;
    const conversationId = `conv-${randomUUID().slice(0, 8)}`;
    const turnId = `turn-${randomUUID().slice(0, 8)}`;

    const outcome = await captureSophiaMemoryCandidates(
      {
        founderId: founderA,
        conversationId,
        founderMessageId: `fm-${turnId}`,
        assistantMessageId: `am-${turnId}`,
        turnId,
        founderMessage: `I really prefer when you flag risks early in any plan. ${marker}`,
        assistantReply: 'Understood — I will surface risks first.',
        ingress: 'test',
      },
      {
        extract: async () => [
          {
            memoryType: 'INTERACTION_PREFERENCE',
            content: `The founder prefers early risk flagging. ${marker}`,
            confidence: 0.9,
          },
        ],
      }
    );
    assert.strictEqual(outcome.status, 'captured');
    assert.strictEqual(outcome.persisted, 1);

    const pending = await store.listMemories(founderA, { lifecycleState: 'PENDING_REVIEW', limit: 50 });
    const captured = pending.find((m) => (m.content as string).includes(marker));
    assert.ok(captured, 'candidate persisted as PENDING_REVIEW');
    assert.strictEqual(captured!.lifecycleState, 'PENDING_REVIEW');
    assert.strictEqual(captured!.active, false);
    assert.strictEqual(captured!.metadata.captureStatus, 'pending');

    // Not in context before Founder confirmation
    const before = await SophiaContextAssembler.assemble({ message: 'Hello', founderId: founderA });
    assert.ok(!before.formattedContext.includes(marker));

    // Founder activation via the governed compat path → now in context
    const confirmed = await store.updateMemory(founderA, captured!.id, { active: true });
    assert.strictEqual(confirmed.lifecycleState, 'ACTIVE');
    const after = await SophiaContextAssembler.assemble({ message: 'Hello', founderId: founderA });
    assert.ok(after.formattedContext.includes(marker));
  });

  // ==========================================================================
  // L11 — CROSS-FOUNDER 403 ON LIFECYCLE TRANSITIONS
  // ==========================================================================
  await runTest('L11: another founder cannot drive any lifecycle transition (403, state intact)', async () => {
    const mem = await store.createMemory({
      founderId: founderA,
      memoryType: 'PERSONAL_CONTEXT_NOTE',
      content: `L11 cross-founder probe ${randomUUID().slice(0, 8)}`,
    });
    await assert.rejects(
      () => store.updateMemory(founderB, mem.id, { lifecycleState: 'ARCHIVED' }),
      (err: any) => err instanceof SophiaMemorySecurityError
    );
    await assert.rejects(
      () => store.updateMemory(founderB, mem.id, { lifecycleState: 'REJECTED' }),
      (err: any) => err instanceof SophiaMemorySecurityError
    );
    const intact = await store.getMemory(founderA, mem.id);
    assert.strictEqual(intact?.lifecycleState, 'ACTIVE');
  });

  // ==========================================================================
  // L12 — LEGACY DERIVATION (pre-M4-B.1 records on disk)
  // ==========================================================================
  await runTest('L12: records without lifecycleState derive at read time and lazily stamp on first update', async () => {
    const legacyA = `smem-legacy-a-${randomUUID().slice(0, 8)}`;
    const legacyB = `smem-legacy-b-${randomUUID().slice(0, 8)}`;
    const legacyC = `smem-legacy-c-${randomUUID().slice(0, 8)}`;
    const base = {
      founderId: founderA,
      memoryType: 'INTERACTION_PREFERENCE',
      provenance: 'founder_direct',
      confidence: 0.8,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    };
    // Forge three pre-M4-B.1-shaped records directly in the file store.
    fileStore.saveItem('sophia_memories', legacyA, {
      ...base, id: legacyA, content: `L12 legacy active ${randomUUID().slice(0, 8)}`, active: true,
    });
    fileStore.saveItem('sophia_memories', legacyB, {
      ...base, id: legacyB, content: `L12 legacy pending ${randomUUID().slice(0, 8)}`,
      active: false, metadata: { captureStatus: 'pending' },
    });
    fileStore.saveItem('sophia_memories', legacyC, {
      ...base, id: legacyC, content: `L12 legacy deactivated ${randomUUID().slice(0, 8)}`,
      active: false, metadata: { captureStatus: 'confirmed' },
    });

    // Read-time derivation
    const a = await store.getMemory(founderA, legacyA);
    assert.strictEqual(a?.lifecycleState, 'ACTIVE');
    const b = await store.getMemory(founderA, legacyB);
    assert.strictEqual(b?.lifecycleState, 'PENDING_REVIEW');
    const c = await store.getMemory(founderA, legacyC);
    assert.strictEqual(c?.lifecycleState, 'ARCHIVED');

    // Derived filters treat legacy rows identically
    const activeList = await store.listMemories(founderA, { active: true, limit: 50 });
    assert.ok(activeList.some((m) => m.id === legacyA));
    assert.ok(!activeList.some((m) => m.id === legacyB));
    const queue = await store.listMemories(founderA, { lifecycleState: 'PENDING_REVIEW', limit: 50 });
    assert.ok(queue.some((m) => m.id === legacyB), 'legacy pending candidate appears in the queue');
    assert.ok(!queue.some((m) => m.id === legacyC), 'legacy deactivated does NOT pollute the queue');

    // Legacy pending candidate can be activated (compat) and the record is
    // stamped with its explicit state on that first update (lazy migration)
    const activated = await store.updateMemory(founderA, legacyB, { active: true });
    assert.strictEqual(activated.lifecycleState, 'ACTIVE');
    const rawAfter = readCollectionFile<any>('sophia_memories')[legacyB];
    assert.strictEqual(rawAfter.lifecycleState, 'ACTIVE', 'lazily migrated on first update');
    assert.strictEqual(rawAfter.metadata.captureStatus, 'confirmed');

    // withResolvedLifecycle is a pure pass-through for explicit states
    const explicit = withResolvedLifecycle({ ...a! });
    assert.strictEqual(explicit.lifecycleState, 'ACTIVE');
  });

  // ==========================================================================
  // L13 — PRISMA MIRROR (DB-gated)
  // ==========================================================================
  if (dbAvailable) {
    await runTest('L13: Prisma mirror carries lifecycleState through create and transitions', async () => {
      const mem = await store.createMemory({
        founderId: founderA,
        memoryType: 'INTERACTION_PREFERENCE',
        content: `L13 mirror probe ${randomUUID().slice(0, 8)}`,
      });
      prismaRowsCreated.push(mem.id);

      let row = await (prisma as any).sophiaMemory.findUnique({ where: { id: mem.id } });
      assert.ok(row, 'memory mirrored to Prisma');
      assert.strictEqual(row.lifecycleState, 'ACTIVE');

      await store.updateMemory(founderA, mem.id, { lifecycleState: 'ARCHIVED' });
      row = await (prisma as any).sophiaMemory.findUnique({ where: { id: mem.id } });
      assert.strictEqual(row.lifecycleState, 'ARCHIVED');
      assert.strictEqual(row.active, false, 'derived mirror synchronized in Prisma too');

      await store.updateMemory(founderA, mem.id, { lifecycleState: 'ACTIVE' });
      row = await (prisma as any).sophiaMemory.findUnique({ where: { id: mem.id } });
      assert.strictEqual(row.lifecycleState, 'ACTIVE');
    });
  } else {
    console.log('  [SKIP] L13: Prisma mirror test (database unavailable)');
  }

  // ==========================================================================
  // L14 — ROUTE-LEVEL LIFECYCLE PATCH (governed ingress end-to-end)
  // ==========================================================================
  await runTest('L14: governed route drives explicit lifecycle transitions end-to-end', async () => {
    // A request WITHOUT founder headers resolves to the default dev founder
    // (dev/test contract; the production 401 contract is pinned by the K-2
    // route-unauth child) — it must still FAIL CLOSED on another founder's
    // memory: no header-less caller can drive a lifecycle transition.
    const foreign = await store.createMemory({
      founderId: founderA,
      memoryType: 'INTERACTION_OBSERVATION',
      content: `L14 headerless probe ${randomUUID().slice(0, 8)}`,
    });
    const headerless = await memoryRoute.PATCH(
      routeReq('PATCH', null, { id: foreign.id, lifecycleState: 'REJECTED' })
    );
    assert.ok([401, 403].includes(headerless.status), `fail-closed (got ${headerless.status})`);

    // Create + reject through the route
    const created = await store.createMemory({
      founderId: founderA,
      memoryType: 'INTERACTION_OBSERVATION',
      content: `L14 route lifecycle probe ${randomUUID().slice(0, 8)}`,
      lifecycleState: 'PENDING_REVIEW',
      metadata: { captureStatus: 'pending' },
    });
    const rejectRes = await memoryRoute.PATCH(
      routeReq('PATCH', founderA, { id: created.id, lifecycleState: 'REJECTED' })
    );
    assert.strictEqual(rejectRes.status, 200);
    const rejectedBody = await rejectRes.json();
    assert.strictEqual(rejectedBody.memory.lifecycleState, 'REJECTED');
    assert.strictEqual(rejectedBody.memory.metadata.captureStatus, 'pending', 'provenance preserved');

    // Illegal transition through the route → 400 with the lifecycle code
    const illegalRes = await memoryRoute.PATCH(
      routeReq('PATCH', founderA, { id: created.id, active: true })
    );
    assert.strictEqual(illegalRes.status, 400);
    const illegalBody = await illegalRes.json();
    assert.strictEqual(illegalBody.code, 'SOPHIA_MEMORY_INVALID_TRANSITION');

    // Approve a fresh candidate through the legacy compat form (the pinned
    // M4-A activation path still works verbatim)
    const fresh = await store.createMemory({
      founderId: founderA,
      memoryType: 'INTERACTION_PREFERENCE',
      content: `L14 compat activation ${randomUUID().slice(0, 8)}`,
      lifecycleState: 'PENDING_REVIEW',
      metadata: { captureStatus: 'pending' },
    });
    const approveRes = await memoryRoute.PATCH(
      routeReq('PATCH', founderA, { id: fresh.id, active: true })
    );
    assert.strictEqual(approveRes.status, 200);
    const approvedBody = await approveRes.json();
    assert.strictEqual(approvedBody.memory.lifecycleState, 'ACTIVE');
    assert.strictEqual(approvedBody.memory.metadata.captureStatus, 'confirmed');

    // Cross-founder lifecycle PATCH → 403
    const crossRes = await memoryRoute.PATCH(
      routeReq('PATCH', founderB, { id: fresh.id, lifecycleState: 'ARCHIVED' })
    );
    assert.strictEqual(crossRes.status, 403);
  });

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------
  if (dbAvailable) {
    for (const id of prismaRowsCreated) {
      await (prisma as any).sophiaMemory.delete({ where: { id } }).catch(() => {});
    }
    await (prisma as any).sophiaMemory.deleteMany({
      where: { founderId: { startsWith: 'founder_m4b1_' } },
    }).catch(() => {});
  }
  store.clearForTests();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log('\n======================================================');
  console.log(`M4-B.1 LIFECYCLE SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('M4-B.1 lifecycle suite crashed:', err);
  process.exit(1);
});
