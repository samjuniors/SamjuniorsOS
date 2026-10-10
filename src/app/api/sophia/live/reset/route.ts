/**
 * POST /api/sophia/live/reset — SofiaUI's Gemini Live session seam.
 * When GEMINI_API_KEY exists, mints a short-lived ephemeral token over the
 * same REST call SofiaUI's server makes (the raw key never reaches the
 * browser); answers the same honest 503 otherwise, so the provider chain
 * falls through to the next transport exactly as SofiaUI does.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

export async function POST(req: NextRequest) {
  // Fail-closed authentication precedes retirement: unauthorized callers
  // must never receive information about internal endpoint existence or status.
  const founder = await getAuthenticatedFounder(req);
  if (!founder || founder.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Founder session required' }, { status: 401 });
  }

  // Phase 3 Step 6B: /api/sophia/live/reset was an orphaned clone of the
  // live/session prototype seam with zero callers across the codebase.
  // It is permanently retired (410 Gone). Canonical gateway is /api/auth/ws-ticket.
  return NextResponse.json(
    {
      error: 'endpoint_retired',
      message:
        'The /api/sophia/live/reset endpoint was an orphaned prototype clone and has been retired (410 Gone). Use canonical gateway /api/auth/ws-ticket.',
      canonicalRoute: '/api/auth/ws-ticket',
    },
    {
      status: 410,
      headers: {
        Deprecation: '@deprecated',
        Warning:
          '299 - "The /api/sophia/live/reset endpoint has been retired (410 Gone). Use /api/auth/ws-ticket."',
        'X-SamJuniors-Canonical-Route': '/api/auth/ws-ticket',
      },
    },
  );
}
