/**
 * POST /api/sophia/live/session — SofiaUI's Gemini Live session seam.
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
  const founder = await getAuthenticatedFounder(req);
  if (!founder || founder.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Founder session required' }, { status: 401 });
  }
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'GEMINI_API_KEY not configured',
        message: 'Gemini API key is required to initiate Gemini Live sessions.',
      },
      { status: 503 },
    );
  }

  let voice = 'Aoede';
  let modelOverride = process.env.GEMINI_LIVE_MODEL?.trim() || 'models/gemini-3.8-live';
  try {
    const b = (await req.json()) as { voice?: string; model?: string };
    if (b.voice) voice = b.voice;
    if (b.model) modelOverride = b.model;
  } catch {
    /* empty body is fine */
  }

  const now = Date.now();
  const expiresInSeconds = 1800;
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1alpha/authTokens', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + expiresInSeconds * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
      }),
    });
    if (res.ok) {
      const token = (await res.json()) as { name?: string };
      if (token?.name) {
        return NextResponse.json({
          token: token.name,
          model: modelOverride,
          wsUrl: LIVE_WS,
          voice,
          createdAt: now,
          expiresInSeconds,
        });
      }
    }
    console.error('[sophia-ui] ephemeral live token failed:', res.status);
  } catch (err) {
    console.error('[sophia-ui] ephemeral live token error:', (err as Error).message);
  }

  // Explicit, local-dev-only escape hatch mirroring SofiaUI.
  if (process.env.SOPHIA_ALLOW_RAW_LIVE_KEY === '1' || process.env.NODE_ENV !== 'production') {
    return NextResponse.json({
      token: apiKey,
      model: modelOverride,
      wsUrl: LIVE_WS,
      voice,
      createdAt: now,
      expiresInSeconds,
    });
  }

  return NextResponse.json(
    {
      error: 'live-token-unavailable',
      message: 'Could not mint an ephemeral Gemini Live token on this deployment.',
    },
    { status: 503 },
  );
}
