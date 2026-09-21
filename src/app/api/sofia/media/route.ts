/**
 * GET /api/sofia/media?url=… — remote video and audio, fetched server-side.
 *
 * Same hardened pipeline as /img, but the limits and the Range handling are
 * genuinely different, not because the code is: media is big, so 206 partial
 * responses are passed through and the byte ceiling is far higher.
 */

import { proxyMedia, isProxyError } from '@/lib/server/net'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_MEDIA_BYTES = 200 * 1024 * 1024
const MEDIA_TIMEOUT_MS = 30_000

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get('url') ?? ''
  if (!target) return new Response('no url', { status: 400 })
  try {
    const out = await proxyMedia(target, {
      kinds: ['video/', 'audio/'],
      maxBytes: MAX_MEDIA_BYTES,
      timeoutMs: MEDIA_TIMEOUT_MS,
      ranged: true,
      range: req.headers.get('range'),
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
