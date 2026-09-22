/**
 * M3 K-2 personal-memory child processes (genuine restart simulation).
 *
 * Runs in a FRESH bun process so the store singleton starts genuinely cold —
 * exactly like a dev-server restart. The parent suite spawns these to prove
 * personal-memory durability and founder-scoped context assembly across
 * process boundaries, plus the production 401 contract of the governed
 * /api/sofia/memory ingress.
 *
 * Modes (first CLI argument):
 *   create <founderId> <marker>   — create one personal memory carrying the
 *                                   marker; print the created record shape
 *   list <founderId>              — fresh process lists the founder's active
 *                                   memories; print count + contents
 *   context <founderId> <marker>   — fresh process runs
 *                                   SophiaContextAssembler.assemble with the
 *                                   founderId; print whether the
 *                                   PERSONAL_MIND_MEMORY slice exists and
 *                                   whether the marker is present
 *   route-unauth                  — run the /api/sofia/memory handlers with
 *                                   NODE_ENV=production semantics already set
 *                                   by the parent (no auth headers); print
 *                                   the HTTP outcome of every method
 *
 * Output contract: exactly one JSON line on stdout; non-zero exit on crash.
 */
import { NextRequest } from 'next/server';
import { SophiaMemoryStore } from '../../src/lib/server/sophia/personal-memory-store';
import { SophiaContextAssembler } from '../../src/lib/server/sophia/context-assembly';
import * as memoryRoute from '../../src/app/api/sofia/memory/route';

// Keep stdout pure for the one-line JSON output contract: any library log
// (provider probes, instance locks) goes to stderr instead.
const emit = (payload: Record<string, unknown>) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};
console.log = (...args: unknown[]) => {
  console.error(...args);
};

async function main() {
  const mode = process.argv[2] || '';

  if (mode === 'create') {
    const founderId = process.argv[3];
    const marker = process.argv[4];
    const store = SophiaMemoryStore.getInstance();
    const memory = await store.createMemory({
      founderId,
      memoryType: 'INTERACTION_PREFERENCE',
      content: `K-2 restart durability marker ${marker}`,
      provenance: 'k2_restart_child',
    });
    emit({
      mode,
      ok: !!memory.id && memory.founderId === founderId,
      id: memory.id,
      founderId: memory.founderId,
      memoryType: memory.memoryType,
      contentHasMarker: memory.content.includes(marker),
    });
    return;
  }

  if (mode === 'list') {
    const founderId = process.argv[3];
    const store = SophiaMemoryStore.getInstance();
    const memories = await store.listMemories(founderId, { active: true, limit: 50 });
    emit({
      mode,
      count: memories.length,
      allFounderScoped: memories.every((m) => m.founderId === founderId),
      contents: memories.map((m) => m.content),
    });
    return;
  }

  if (mode === 'context') {
    const founderId = process.argv[3];
    const marker = process.argv[4];
    const assembled = await SophiaContextAssembler.assemble({
      message: 'What is our current monthly recurring revenue?',
      founderId,
    });
    const personalSlices = assembled.slices.filter((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    emit({
      mode,
      personalSliceCount: personalSlices.length,
      label: personalSlices[0]?.label ?? null,
      markerPresent: assembled.formattedContext.includes(marker),
      companySlices: assembled.slices.filter((s) => s.authority !== 'PERSONAL_MIND_MEMORY').map((s) => s.authority),
      markerOnlyInPersonalSlice: personalSlices.some((s) => s.content.includes(marker)),
    });
    return;
  }

  if (mode === 'route-unauth') {
    // Parent spawns this child with NODE_ENV=production and NO auth headers.
    const base = 'http://localhost:3000/api/sofia/memory';
    const outcomes: Record<string, number> = {};

    const get = await memoryRoute.GET(new NextRequest(base, { method: 'GET' }));
    outcomes.GET = get.status;

    const post = await memoryRoute.POST(
      new NextRequest(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          memoryType: 'INTERACTION_PREFERENCE',
          content: 'should never be created',
        }),
      })
    );
    outcomes.POST = post.status;

    const patch = await memoryRoute.PATCH(
      new NextRequest(base, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'smem-should-never-exist', active: false }),
      })
    );
    outcomes.PATCH = patch.status;

    const del = await memoryRoute.DELETE(new NextRequest(`${base}?id=smem-should-never-exist`, { method: 'DELETE' }));
    outcomes.DELETE = del.status;

    // Also prove nothing was persisted by the rejected requests.
    const store = SophiaMemoryStore.getInstance();
    const all = await store.listMemories('founder-production-session', { limit: 50 });
    emit({ mode, outcomes, productionSessionMemoryCount: all.length });
    return;
  }

  emit({ mode, error: 'unknown mode' });
  process.exit(1);
}

main().catch((err) => {
  console.error('k2 memory child crashed:', err);
  process.exit(1);
});
