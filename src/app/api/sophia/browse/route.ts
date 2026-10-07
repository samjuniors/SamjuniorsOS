/**
 * GET /api/sophia/browse?url=… — the SofiaUI BrowserPanel's same-origin
 * page proxy (frame-guard injection + URL rewriting), ported from SofiaUI's
 * browse-proxy. Founder-gated like every other SofiaUI seam.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { handleSophiaBrowseProxy } from '@/lib/server/sophia/browse-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const founder = await getAuthenticatedFounder(req);
  if (!founder || founder.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Founder session required' }, { status: 401 });
  }
  return handleSophiaBrowseProxy(req);
}
