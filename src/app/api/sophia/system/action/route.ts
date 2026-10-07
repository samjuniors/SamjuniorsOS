/**
 * POST /api/sophia/system/action — SofiaUI's device action seam.
 * get_time / get_system_info are real (this server is the founder's own
 * deployment); the desktop-open actions answer honestly — the user-visible
 * part (the in-app Sofia BrowserPanel) is client-side.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { sophiaSystemAction } from '@/lib/server/sophia/sofiaui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const founder = await getAuthenticatedFounder(req);
  if (!founder || founder.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Founder session required' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as { action?: string; url?: string; query?: string; app?: string };
    return await sophiaSystemAction(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}
