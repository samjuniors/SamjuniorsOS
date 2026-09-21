/**
 * GET /api/sofia/img?url=… — remote images, fetched server-side.
 *
 * The page never talks to the wider web: the sanitiser rewrites every remote
 * <img src> in a panel to this endpoint, and the server fetches it through
 * the hardened pipeline (SSRF guards, redirect caps, byte ceiling, kind
 * sniffing) and streams the bytes back same-origin. This is why hosts that
 * refuse to be hotlinked still render, and why the page's CSP can keep
 * img-src closed to https:.
 */

import { proxyMedia, isProxyError } from '@/lib/server/net'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_IMG_BYTES = 15 * 1024 * 1024
const IMG_TIMEOUT_MS = 10_000

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get('url') ?? ''
  if (!target) return new Response('no url', { status: 400 })
  try {
    const out = await proxyMedia(target, {
      kinds: ['image/'],
      maxBytes: MAX_IMG_BYTES,
      timeoutMs: IMG_TIMEOUT_MS,
      ranged: false,
    })
    return new Response(new Uint8Array(out.bytes), {
      status: out.status,
      headers: {
        'content-type': out.contentType,
        'cache-control': 'public, max-age=3600',
        'x-content-type-options': 'nosniff',
        ...out.headers,
      },
    })
  } catch (err) {
    const status = isProxyError(err) ? err.status : 502
    return new Response(String((err as Error)?.message ?? 'proxy failed'), { status })
  }
}
