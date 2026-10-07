/**
 * POST /api/sophia/dg/speak — SofiaUI's neural mouth seam (one of the unified
 * speak endpoints the client calls). Serves the audio contract by delegating
 * to this repo's canonical TTS ladder (ElevenLabs → z-ai neural → local),
 * honoring SofiaUI's explicit provider preference when its key exists.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { sophiaSpeak, type SophiaSpeakBody } from '@/lib/server/sophia/sofiaui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const founder = await getAuthenticatedFounder(req);
  if (!founder || founder.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Founder session required' }, { status: 401 });
  }
  let body: SophiaSpeakBody;
  try {
    body = (await req.json()) as SophiaSpeakBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  return sophiaSpeak(body);
}
