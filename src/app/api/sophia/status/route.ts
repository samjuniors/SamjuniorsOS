/**
 * GET /api/sophia/status — SofiaUI's provider availability payload.
 * Reports the providers this deployment actually carries (cloud keys are
 * upgrades, never requirements — the canonical brain and the z-ai mouth
 * always answer).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { sophiaStatusPayload } from '@/lib/server/sophia/sofiaui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Fail closed: the payload reveals which paid provider keys this
  // deployment carries — a Founder session is required (same contract as
  // /api/tts/voices).
  const founder = await getAuthenticatedFounder(req);
  if (!founder || founder.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Founder session required' }, { status: 401 });
  }
  return NextResponse.json(sophiaStatusPayload());
}
