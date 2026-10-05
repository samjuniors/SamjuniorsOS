import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { fetchText, isProxyError, type FetchedText } from '@/lib/server/net';

export const dynamic = 'force-dynamic';

/**
 * GET /api/browser/read?url=...
 *
 * In-OS Browser Reader / Content Extraction Route.
 * Fetches remote web pages server-side to allow viewing inside SamJuniorsOS,
 * bypassing CORS and frame-busting restrictions (X-Frame-Options) for research.
 */
export async function GET(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required', success: false },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return NextResponse.json({ error: 'Missing url parameter', success: false }, { status: 400 });
    }

    // URL format validation (the hardened pipeline re-parses and vets the
    // target itself; this preserves the route's 400-on-garbage contract).
    try {
      new URL(targetUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format', success: false }, { status: 400 });
    }

    // Phase 4 (governance review): fetch through the hardened outbound
    // pipeline (vetTarget scheme/host checks + guardedLookup DNS gate that
    // refuses private addresses rebinding-safely + hand-followed redirects
    // re-vetted per hop + a hard byte cap). The previous inline guard blocked
    // only three metadata hostnames — localhost, 127.0.0.1, ::1, RFC1918
    // and CGNAT all passed, redirects were auto-followed unvetted, and the
    // response body was read unbounded (classic SSRF + memory-exhaustion
    // surface). Same pipeline as /api/sofia/page|img|media.
    let fetched: FetchedText;
    try {
      fetched = await fetchText(targetUrl, {
        maxBytes: 2_000_000,
        timeoutMs: 8000,
      });
    } catch (err: any) {
      if (isProxyError(err)) {
        return NextResponse.json({ error: err.message, success: false }, { status: err.status });
      }
      return NextResponse.json(
        { error: err?.message || 'Failed to fetch webpage content', success: false },
        { status: 500 }
      );
    }

    const contentType = fetched.type;
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return NextResponse.json({
        success: true,
        url: targetUrl,
        contentType,
        title: targetUrl,
        content: `Direct binary content (${contentType}). Use external open tab button.`,
      });
    }

    const html = fetched.text;

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : targetUrl;

    // Extract readable body text
    const cleanBody = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');

    return NextResponse.json({
      success: true,
      url: targetUrl,
      title,
      htmlSnippet: cleanBody.slice(0, 150000),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch webpage content', success: false },
      { status: 500 }
    );
  }
}
