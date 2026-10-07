/**
 * POST /api/sophia/test-voice — SofiaUI's diagnostic quick voice sample.
 * Speaks the fixed SofiaUI greeting through the same canonical TTS ladder
 * as /api/sophia/mouth/speak.
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
  let body: SophiaSpeakBody = {};
  try {
    body = (await req.json()) as SophiaSpeakBody;
  } catch {
    /* SofiaUI sends an empty body sometimes — the fixed sample is the point */
  }
  return sophiaSpeak({
    text: "G'day! I am Sofia. All audio systems and voice output are functioning properly.",
    provider: body.provider || 'auto',
    voice: body.voice || 'Aoede',
    voiceId: body.voiceId,
    modelId: body.modelId,
  });
}
