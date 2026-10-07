/**
 * POST /api/sophia/chat — the SofiaUI client's brain seam.
 *
 * Serves SofiaUI's /api/sophia/chat contract (body: {lastUser, history,
 * brainMode, ollama*, lmstudio*} → JSON {text, toolCalls, brain, sources})
 * by delegating every turn to the canonical executor — executeSophiaTurn
 * over the server-authoritative ConversationStore, the same path the OS
 * chat and live voice use. The client-sent `history` is accepted for
 * protocol compatibility and never used to reconstruct dialogue (the
 * same backwards-compat-only contract /api/sofia/ask documents).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { sophiaChatTurn, type SophiaChatBody } from '@/lib/server/sophia/sofiaui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const founder = await getAuthenticatedFounder(req);
  if (!founder || founder.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Unauthorized: Valid Founder session required' }, { status: 401 });
  }
  let body: SophiaChatBody;
  try {
    body = (await req.json()) as SophiaChatBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  try {
    return await sophiaChatTurn(founder.userId, body);
  } catch (err) {
    console.error('[sophia-ui] chat turn failed:', (err as Error)?.message ?? err);
    return NextResponse.json({ error: (err as Error)?.message || 'Chat turn failed' }, { status: 500 });
  }
}
