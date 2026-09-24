/**
 * /api/sofia/memory — governed founder ingress for the Sophia Personal Mind
 * (M3 K-2).
 *
 * TWO BRAINS, ONE GATE:
 * This is the personal/interaction memory boundary — founder preferences,
 * communication style, personal contextual notes. It is NOT the Company
 * Brain: nothing created here can authorize an action, bypass an approval,
 * or become company knowledge/facts (there is NO promotion path out of the
 * personal store).
 *
 * AUTHENTICATION (fail-closed, identical contract to /api/sofia/ask):
 *   request → getAuthenticatedFounder (401 in production without the
 *   configured dev secret; dev/test honors x-samjuniors-user-id).
 *   The founder principal comes EXCLUSIVELY from the authenticated session.
 *   founderId fields in bodies/query strings are IGNORED — they are untrusted
 *   client data and can never select another founder's memories.
 *
 * Methods (all founder-scoped through SophiaMemoryStore):
 *   GET    ?memoryType=&active=&limit=&offset= — list the CALLER's memories
 *          (deterministic: updatedAt DESC; page size hard-capped at 50;
 *          `offset` pages through the same order so records beyond the
 *          first page stay reachable; response carries `total` + `hasMore`)
 *   POST   { memoryType, content, provenance?, confidence?, idempotencyKey? }
 *          — create (idempotencyKey dedupes per the ChatMessage convention)
 *   PATCH  { id, content?, confidence?, active? }
 *          — update the CALLER's memory (403 on any other founder's id)
 *   DELETE ?id= — delete the CALLER's memory (403 on any other founder's id)
 *
 * Error mapping: 401 unauthenticated · 400 validation · 403 ownership
 * mismatch (fail-closed) · 404 not found.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import {
  SophiaMemoryStore,
  SophiaMemoryValidationError,
  SophiaMemoryNotFoundError,
  SophiaMemorySecurityError,
  SOPHIA_MEMORY_TYPES,
  SOPHIA_MEMORY_LIST_MAX_LIMIT,
  SophiaMemoryType,
} from '@/lib/server/sophia';
import { annotateReviewRecords } from '@/lib/server/sophia/memory-review-annotations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(err: unknown): NextResponse {
  if (err instanceof SophiaMemoryValidationError || (err as Error)?.name === 'SophiaMemoryValidationError') {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  // M4-A HARDENING: founder-direct authoring may not store authorization /
  // privilege / governance semantics (deterministic authority-content
  // guard — see authority-content-guard.ts). Refused with an actionable
  // message; the governed authorization system is the policy surface.
  if ((err as Error)?.name === 'SophiaMemoryAuthorityError' || (err as any)?.code === 'SOPHIA_MEMORY_AUTHORITY_CONTENT') {
    return NextResponse.json(
      {
        error: (err as Error).message,
        code: 'SOPHIA_MEMORY_AUTHORITY_CONTENT',
      },
      { status: 400 }
    );
  }
  if (err instanceof SophiaMemorySecurityError || (err as Error)?.name === 'SophiaMemorySecurityError') {
    return NextResponse.json({ error: `Forbidden: ${(err as Error).message}` }, { status: 403 });
  }
  if (err instanceof SophiaMemoryNotFoundError || (err as Error)?.name === 'SophiaMemoryNotFoundError') {
    return NextResponse.json({ error: 'Personal memory not found' }, { status: 404 });
  }
  console.error('[sofia/memory] unexpected error:', err);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}

async function requireSession(req: NextRequest) {
  const session = await getAuthenticatedFounder(req);
  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 }),
    };
  }
  return { session, response: null };
}

export async function GET(req: NextRequest) {
  const { session, response } = await requireSession(req);
  if (!session) return response;

  try {
    const url = new URL(req.url);
    const memoryTypeParam = url.searchParams.get('memoryType');
    const activeParam = url.searchParams.get('active');
    const limitParam = url.searchParams.get('limit');
    // P2 follow-up (queue >50 visibility): offset-based pagination over the
    // SAME deterministic order — the oldest pending review candidates were
    // previously invisible to both this API and the UI once the founder's set
    // exceeded the 50-record page cap.
    const offsetParam = url.searchParams.get('offset');

    const opts: {
      memoryType?: SophiaMemoryType;
      active?: boolean;
      limit?: number;
      offset?: number;
    } = {};
    if (memoryTypeParam) {
      if (!(SOPHIA_MEMORY_TYPES as readonly string[]).includes(memoryTypeParam)) {
        return NextResponse.json(
          { error: `memoryType must be one of [${SOPHIA_MEMORY_TYPES.join(', ')}]` },
          { status: 400 }
        );
      }
      opts.memoryType = memoryTypeParam as SophiaMemoryType;
    }
    if (activeParam !== null) {
      if (activeParam !== 'true' && activeParam !== 'false') {
        return NextResponse.json({ error: 'active must be "true" or "false"' }, { status: 400 });
      }
      opts.active = activeParam === 'true';
    }
    if (limitParam !== null) {
      const parsed = Number.parseInt(limitParam, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return NextResponse.json({ error: 'limit must be a positive integer' }, { status: 400 });
      }
      opts.limit = Math.min(SOPHIA_MEMORY_LIST_MAX_LIMIT, parsed);
    }
    if (offsetParam !== null) {
      const parsed = Number.parseInt(offsetParam, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json({ error: 'offset must be a non-negative integer' }, { status: 400 });
      }
      opts.offset = Math.min(parsed, 100_000);
    }

    const store = SophiaMemoryStore.getInstance();
    const memories = await store.listMemories(session.userId, opts);
    // Authoritative totals for pagination (P2 follow-up): the page length
    // alone cannot distinguish "exactly one page" from "one visible page of
    // many" — reviewers and badges need the real count.
    const total = await store.countMemories(session.userId, {
      memoryType: opts.memoryType,
      active: opts.active,
    });
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;

    // M4-A HARDENING (reviewability) + P2 follow-up: deterministic
    // duplicate/similarity hints for the review queue. The comparison pool is
    // the caller's FULL record set (active + pending, the AUTHORITATIVE
    // collection — NOT the visible page) so a pending candidate can be
    // flagged against any already-active memory, including records that fall
    // outside the current page window. Purely advisory — the reviewer decides;
    // nothing is merged or auto-actioned.
    const pool = await store.listAllMemories(session.userId);
    const annotations = annotateReviewRecords(memories, pool);

    return NextResponse.json({
      memories,
      annotations,
      count: memories.length,
      total,
      offset,
      limit,
      hasMore: offset + memories.length < total,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireSession(req);
  if (!session) return response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    // SECURITY: founderId comes ONLY from the authenticated session — any
    // founderId in the body is untrusted and deliberately ignored.
    const memory = await SophiaMemoryStore.getInstance().createMemory({
      founderId: session.userId,
      memoryType: body.memoryType as SophiaMemoryType,
      content: body.content as string,
      provenance: typeof body.provenance === 'string' ? body.provenance : 'founder_direct',
      confidence: typeof body.confidence === 'number' ? body.confidence : undefined,
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined,
    });
    return NextResponse.json({ memory }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest) {
  const { session, response } = await requireSession(req);
  if (!session) return response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    // SECURITY: ownership is resolved against the session principal only.
    const memory = await SophiaMemoryStore.getInstance().updateMemory(session.userId, id, {
      content: body.content as string | undefined,
      confidence: body.confidence as number | undefined,
      active: body.active as boolean | undefined,
    });
    return NextResponse.json({ memory });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  const { session, response } = await requireSession(req);
  if (!session) return response;

  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  }

  try {
    // SECURITY: ownership is resolved against the session principal only.
    const deleted = await SophiaMemoryStore.getInstance().deleteMemory(session.userId, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Personal memory not found' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
