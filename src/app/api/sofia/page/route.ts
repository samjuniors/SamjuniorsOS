/**
 * GET /api/sofia/page?url=…&mode=reader|live — a whole web page, fetched
 * here and served from this origin so it can be framed.
 *
 * The publisher's X-Frame-Options and CORS rules are enforced against the
 * browser, and from the browser's point of view this document is ours — so
 * an article that refuses to be embedded anywhere still opens on the
 * display. What each mode does to the markup lives in lib/server/page.ts.
 *
 * No Origin header arrives on an iframe navigation, which is why this is a
 * plain GET like the image proxy rather than something stricter.
 */

import { renderPage } from '@/lib/server/page'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const asked = new URL(req.url)
  const target = asked.searchParams.get('url') ?? ''
  const mode = asked.searchParams.get('mode') === 'live' ? 'live' : 'reader'
  try {
    const page = await renderPage(target, mode)
    return new Response(page.body, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        ...page.headers,
      },
    })
  } catch (err) {
    // Rendered as a page rather than returned as a status, because this lands
    // inside an iframe: a bare 502 body is a blank rectangle on the display,
    // which reads as the interface being broken rather than as the article
    // being unavailable.
    return new Response(
      `<!doctype html><meta charset="utf-8"><style>
         body{margin:0;padding:26px;background:transparent;color:#7fb6bf;
              font:400 13px/1.6 ui-monospace,monospace}
         b{color:#cfe9ee;font-weight:500;display:block;margin-bottom:6px}
       </style><b>This page could not be opened.</b>${
         String((err as Error)?.message ?? 'unknown error').replace(/[<&]/g, '')
       }`,
      {
        status: 502,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
        },
      },
    )
  }
}
