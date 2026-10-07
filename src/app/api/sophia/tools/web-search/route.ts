/**
 * POST /api/sophia/tools/web-search — SofiaUI's web search seam.
 * Body: {query} → {query, results, summary, provider, timestamp}
 * (SofiaUI's WebSearchResponse contract), delegated to this repo's live
 * web search (DuckDuckGo ladder with graceful fallbacks).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { searchLiveWeb } from '@/lib/server/tools/web-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export async function POST(req: NextRequest) {
  const founder = await getAuthenticatedFounder(req);
  if (!founder || founder.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Founder session required' }, { status: 401 });
  }
  try {
    const b = (await req.json()) as { query?: string };
    const query = String(b.query ?? '').trim();
    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }
    const out = await searchLiveWeb(query, 5);
    const results = (out.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      source: r.source || hostOf(r.url),
      snippet: r.snippet,
    }));
    const summary =
      results
        .slice(0, 2)
        .map((r) => r.snippet)
        .filter(Boolean)
        .join(' ') || (results[0]?.title ?? '');
    return NextResponse.json({
      query,
      results,
      summary,
      provider: out.source,
      timestamp: new Date().toISOString(),
      ...(out.error ? { error: out.error } : {}),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Search failed' }, { status: 500 });
  }
}
