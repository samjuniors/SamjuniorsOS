/**
 * GET /api/sophia/elevenlabs/voices — SofiaUI's voice picker list.
 * Upstream ElevenLabs voices when a key exists; SofiaUI's preset list
 * otherwise (identical fallback behavior).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { sophiaElevenLabsVoices } from '@/lib/server/sophia/sofiaui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Fail closed: the key-configured branch probes the ElevenLabs account
  // (provider quota) and reveals account capabilities (same contract as
  // /api/tts/voices).
  const founder = await getAuthenticatedFounder(req);
  if (!founder || founder.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Founder session required' }, { status: 401 });
  }
  return sophiaElevenLabsVoices();
}
