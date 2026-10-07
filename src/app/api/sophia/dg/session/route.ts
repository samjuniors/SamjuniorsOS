/**
 * POST /api/sophia/dg/session — SofiaUI's Deepgram STT key grant seam.
 * Grants a short-lived Deepgram access token when DEEPGRAM_API_KEY exists
 * (identical to SofiaUI's deepgramSession()); answers the same honest 503
 * when it does not, so the provider chain falls through exactly as SofiaUI
 * does without a key.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const founder = await getAuthenticatedFounder(req);
  if (!founder || founder.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Founder session required' }, { status: 401 });
  }
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'DEEPGRAM_API_KEY not configured' }, { status: 503 });
  }
  try {
    const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: { authorization: `Token ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ time_to_live_in_seconds: 3600 }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `grant:${res.status}` }, { status: 502 });
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      return NextResponse.json({ error: 'no token issued' }, { status: 502 });
    }
    return NextResponse.json({ key: data.access_token });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'grant failed' }, { status: 502 });
  }
}
