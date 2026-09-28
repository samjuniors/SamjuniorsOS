// The outbound side of the app, and the gate in front of it.
//
// This process — unlike a browser tab — can reach the user's LAN, their
// router's admin page and cloud metadata endpoints, and everything it fetches
// is fetched at a URL some model chose while reading the open web. So every
// outbound request goes through here, and here is an SSRF gate first and a
// fetch second.
//
// It lives in its own file because there are two callers with genuinely
// different jobs — the media proxy that streams bytes to an <img> or <video>,
// and the page proxy that reads whole documents — and the one thing neither
// of them may be allowed to reimplement is the gate.
//
// Outbound requests ride node:http / node:https (see requestOnce), but every
// socket's DNS resolution goes through guardedLookup, which refuses the whole
// name if ANY answer is private and hands the vetted address to the connect
// call — which then does no lookup of its own. fetch() cannot do this (it
// offers no hook into resolution), which is why this module exists at all:
// the gate is not an add-on to the transport, it *is* the transport.

import http from 'node:http'
import https from 'node:https'
import { lookup as dnsLookup, type LookupAddress, type LookupAllOptions, type LookupOptions } from 'node:dns'
import { isIP } from 'node:net'

/** A redirect chain longer than this is a loop or a game, not a CDN. */
export const MAX_REDIRECTS = 4

/**
 * A perfectly ordinary desktop browser, which is the entire point: the hosts we
 * are fetching from serve placeholders to anything that looks automated, and a
 * thumbnail that 403s is the bug we are here to fix. No Referer is sent and the
 * browser's own cookies never come near this, so nothing about the user leaks
 * upstream beyond the fact that some machine asked for a public page.
 */
export const PROXY_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' +
  ' (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

/**
 * Hostnames refused before a packet moves.
 *
 * `.local` is mDNS — every printer, NAS and Home Assistant box on the network
 * answers to it — and `.internal` / `.home.arpa` are the same idea by
 * convention. These never name anything on the public web, so a request for one
 * is either confused or hostile.
 */
const BLOCKED_HOSTNAME = /(^|\.)(localhost|local|internal|intranet|home\.arpa)$/i

/**
 * Is this *resolved address* one the server must not connect to?
 *
 * The list is the usual suspects plus the ones people forget: 169.254.169.254
 * is the cloud metadata endpoint, 100.64/10 is carrier-grade NAT (and Tailscale
 * lives there), 0.0.0.0/8 and the v4-mapped v6 forms are the classic ways of
 * writing "localhost" that a naive string check waves straight through.
 */
export function blockedAddress(ip: string): boolean {
  let addr = String(ip ?? '')
    .toLowerCase()
    .split('%')[0]
  // ::ffff:127.0.0.1 is loopback wearing a hat. Unwrap before judging.
  //
  // Worth knowing where this can and cannot fire. WHATWG URL parsing
  // serialises an IPv4-mapped literal into hex — new URL('http://[::ffff:127.0.0.1]/')
  // gives a hostname of [::ffff:7f00:1] — so a dotted-quad form never survives
  // to reach this branch from a parsed URL. It is still load-bearing for the
  // other caller: DNS answers arrive as strings in exactly this shape.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr)
  if (mapped) addr = mapped[1]

  if (addr.includes('.')) {
    const parts = addr.split('.').map(Number)
    if (parts.length !== 4) return true
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
    const [a, b] = parts
    if (a === 0) return true // 0.0.0.0/8 — "this network", routes to localhost
    if (a === 10) return true // 10/8
    if (a === 127) return true // loopback
    if (a === 169 && b === 254) return true // link-local AND cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12
    if (a === 192 && b === 168) return true // 192.168/16
    if (a === 192 && b === 0) return true // 192.0.0/24 protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT / tailnets
    if (a === 198 && (b === 18 || b === 19)) return true // benchmarking range
    if (a >= 224) return true // multicast, reserved, broadcast
    return false
  }

  // The hex forms the parser actually produces, including the mapped range that
  // the dotted-quad unwrap above can never see.
  if (addr === '::' || addr === '::1') return true
  if (/^::ffff:/.test(addr)) {
    const hex = addr.slice(7).split(':')
    if (hex.length === 2) {
      const high = parseInt(hex[0] ?? '', 16)
      const low = parseInt(hex[1] ?? '', 16)
      if (Number.isFinite(high) && Number.isFinite(low)) {
        return blockedAddress([high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'))
      }
    }
    return true
  }
  if (/^f[cd]/.test(addr)) return true // fc00::/7 unique local
  if (/^fe[89ab]/.test(addr)) return true // fe80::/10 link-local
  if (/^ff/.test(addr)) return true // multicast
  return false
}

/**
 * The DNS hook every outbound socket goes through.
 *
 * Checking the address *after* resolving and then letting net.connect resolve
 * again would leave a rebinding window — the second answer is free to be
 * 127.0.0.1. So we resolve once here, refuse the whole name if ANY answer is
 * private, and hand the vetted address back to the connect call, which then
 * does no lookup of its own (this is node's `lookup` socket option, so the
 * address that was checked is the address that is dialed). Strict on purpose: a
 * public host that also advertises a LAN address is not a host we need to be
 * able to reach.
 */
export function guardedLookup(
  hostname: string,
  options: LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  // Always resolve with all: true so every answer is judged, whatever shape
  // the caller asked for; the answer is converted back at the bottom.
  const opts: LookupAllOptions = { ...options, all: true }
  dnsLookup(hostname, opts, (err, addresses) => {
    if (err) return callback(err, '')
    const list: LookupAddress[] = addresses
    if (!list.length) {
      const none = new Error(`no address for ${hostname}`) as NodeJS.ErrnoException
      none.code = 'ENOTFOUND'
      return callback(none, '')
    }
    for (const entry of list) {
      if (blockedAddress(entry.address)) {
        const blocked = new Error(
          `refusing ${hostname}: resolves to the private address ${entry.address}`,
        ) as NodeJS.ErrnoException
        blocked.code = 'EBLOCKEDADDRESS'
        return callback(blocked, '')
      }
    }
    if (options.all) return callback(null, list)
    return callback(null, list[0]!.address, list[0]!.family)
  })
}

/** An error carrying the status we want the browser to see. */
export class ProxyError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ProxyError'
    this.status = status
  }
}

/** The old bridge's error factory, kept so call sites read the same as ever. */
export function proxyError(status: number, message: string): ProxyError {
  return new ProxyError(status, message)
}

/** Narrow an unknown throw to the thing route handlers actually want. */
export function isProxyError(err: unknown): err is ProxyError {
  return err instanceof ProxyError
}

/**
 * Only absolute http(s) URLs, and only ones whose host isn't obviously local.
 * Returns a URL or throws a ProxyError, so callers can treat parse failure and
 * policy failure the same way.
 */
export function vetTarget(raw: string): URL {
  let url: URL
  try {
    url = new URL(String(raw ?? ''))
  } catch {
    throw new ProxyError(400, 'absolute http(s) url required')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ProxyError(400, 'absolute http(s) url required')
  }
  if (!url.hostname) throw new ProxyError(400, 'absolute http(s) url required')
  if (BLOCKED_HOSTNAME.test(url.hostname)) throw new ProxyError(403, 'blocked host')
  // An IP literal never reaches DNS in any meaningful sense, so judge it here —
  // this is what turns http://127.0.0.1:3000/api/sofia/health into a refusal
  // before a socket is opened rather than after.
  const literal = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(literal) && blockedAddress(literal)) {
    throw new ProxyError(403, 'blocked host')
  }
  return url
}

/** Flatten node's header object into the plain lower-cased record callers use. */
function flatHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    out[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return out
}

/** Map any failure onto the status the browser should see, curl-exit-style. */
function toProxyError(err: unknown): ProxyError {
  if (err instanceof ProxyError) return err
  const code = (err as NodeJS.ErrnoException | null)?.code
  if (code === 'EBLOCKEDADDRESS') return new ProxyError(403, 'blocked host')
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || code === 'ECONNABORTED') {
    return new ProxyError(504, 'upstream timed out')
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return new ProxyError(502, 'upstream unreachable (dns)')
  }
  const note = err instanceof Error ? err.message : String(err)
  return new ProxyError(502, `upstream unreachable${note ? `: ${note.slice(0, 120)}` : ''}`)
}

/**
 * One hop, on a socket whose DNS went through the gate.
 *
 * vetTarget ran before this is called, and openRemote re-vets every redirect
 * hop, so the request is only ever pointed at a hostname we chose — and the
 * `lookup: guardedLookup` option is what makes the connection itself refuse a
 * name that resolves somewhere private even after the checks above.
 *
 * Resolves with the http.IncomingMessage the moment headers land; the body is
 * the caller's to read, cap or abandon. One wall clock (curl's --max-time was
 * the model) covers headers *and* body: the transfer is cut where it stands if
 * it outruns the budget, and a consumer mid-body sees the cut as an error on
 * the stream rather than a silent short read.
 */
export async function requestOnce(
  url: URL,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    let settled = false
    let response: http.IncomingMessage | null = null
    let timer: NodeJS.Timeout | null = null

    const clearTimer = (): void => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }

    const fail = (err: ProxyError): void => {
      if (settled) return
      settled = true
      clearTimer()
      req.destroy()
      reject(err)
    }

    const onResponse = (res: http.IncomingMessage): void => {
      response = res
      settled = true
      // The budget keeps running over the body. `close` fires however the
      // response ends — consumed, destroyed, abandoned by peek — and is where
      // the clock is finally stopped.
      res.on('close', clearTimer)
      resolve(res)
    }

    const options: http.RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: { ...headers },
      lookup: guardedLookup,
      agent: false,
    }
    const req =
      url.protocol === 'https:'
        ? https.request(options, onResponse)
        : http.request(options, onResponse)

    req.on('error', (err: Error) => {
      if (settled && response) response.destroy(err)
      fail(toProxyError(err))
    })

    // Nothing to send but the request itself: without end() the headers sit in
    // the writable and nothing ever moves (http.get does this for you;
    // http.request does not).
    req.end()

    timer = setTimeout(() => {
      const dead = new ProxyError(504, 'upstream timed out')
      if (!settled) {
        fail(dead)
        return
      }
      if (response) {
        // Headers already went to the consumer, so the cut is delivered on the
        // stream it is reading rather than as a rejection it cannot see.
        response.destroy(dead)
      }
      req.destroy()
    }, timeoutMs)
  })
}

/**
 * Follow redirects by hand rather than letting a client library do it, because
 * every hop has to be vetted again: a public URL that 302s to
 * http://169.254.169.254/ is the whole SSRF attack, and a redirect to
 * file:// or data: is the other half of it.
 */
export async function openRemote(
  startUrl: URL,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ res: http.IncomingMessage; url: URL }> {
  let url = startUrl
  for (let hop = 0; ; hop++) {
    const res = await requestOnce(url, headers, timeoutMs)
    const status = res.statusCode ?? 0
    const location = res.headers.location
    if (status >= 300 && status < 400 && location) {
      res.resume() // drain, or the socket never returns to the pool
      if (hop >= MAX_REDIRECTS) throw new ProxyError(502, 'too many redirects')
      let next: URL
      try {
        next = new URL(location, url)
      } catch {
        throw new ProxyError(502, 'bad redirect')
      }
      // vetTarget re-runs the scheme and host checks; guardedLookup re-runs the
      // address check when the next hop connects.
      url = vetTarget(next.href)
      continue
    }
    return { res, url }
  }
}

export type FetchedText = {
  text: string
  type: string
  url: string
  headers: Record<string, string>
  bytes: number
}

/**
 * Read a whole response as text, with a hard cap.
 *
 * Separate from the streaming proxy because a document is not media: we need
 * all of it in hand before we can rewrite it, and a page that will not fit in
 * the cap is one we should decline rather than truncate — half an HTML document
 * parses into something arbitrary.
 */
export async function fetchText(
  url: string,
  opts: { maxBytes: number; timeoutMs: number; accept?: string },
): Promise<FetchedText> {
  const target = vetTarget(url)
  const { res, url: finalUrl } = await openRemote(
    target,
    {
      'user-agent': PROXY_UA,
      accept: opts.accept ?? 'text/html,application/xhtml+xml,*/*;q=0.8',
      'accept-language': 'en-GB,en;q=0.9',
      'accept-encoding': 'identity',
    },
    opts.timeoutMs,
  )

  const status = res.statusCode ?? 0
  const type = String(res.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()

  if (status !== 200) {
    res.resume()
    throw new ProxyError(status === 404 ? 404 : 502, `upstream said ${status}`)
  }

  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of res) {
      size += chunk.length
      if (size > opts.maxBytes) {
        res.destroy()
        throw new ProxyError(413, 'page too large')
      }
      chunks.push(chunk)
    }
  } catch (err) {
    throw err instanceof ProxyError ? err : toProxyError(err)
  }

  // Character set matters more here than anywhere else: a page decoded as
  // UTF-8 when it is really windows-1252 turns every quotation mark in the
  // article into a replacement glyph, which looks like our bug.
  const raw = Buffer.concat(chunks)
  const declared = /charset=["']?([\w-]+)/i.exec(String(res.headers['content-type'] ?? ''))
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(raw.subarray(0, 4096).toString('latin1'))
  const charset = (declared?.[1] ?? meta?.[1] ?? 'utf-8').toLowerCase()
  let text: string
  try {
    text = new TextDecoder(charset).decode(raw)
  } catch {
    text = raw.toString('utf8')
  }

  return { text, type, url: finalUrl.href, headers: flatHeaders(res.headers), bytes: size }
}

export type PeekResult = {
  status: number
  type: string
  bytes: number | null
  headers: Record<string, string>
  url: string
}

/**
 * Headers only, for deciding what a URL *is* before committing to fetching it.
 *
 * Sent as a GET rather than a HEAD, and immediately abandoned: a surprising
 * share of the web answers HEAD with 405, or with headers that disagree with
 * what a real GET would return, and being wrong about the content type is the
 * entire failure this is here to prevent.
 */
export async function peek(url: string, opts: { timeoutMs: number }): Promise<PeekResult> {
  const target = vetTarget(url)
  const { res, url: finalUrl } = await openRemote(
    target,
    { 'user-agent': PROXY_UA, accept: '*/*', 'accept-encoding': 'identity' },
    opts.timeoutMs,
  )
  const out: PeekResult = {
    status: res.statusCode ?? 0,
    type: String(res.headers['content-type'] ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase(),
    bytes: Number(res.headers['content-length']) || null,
    headers: flatHeaders(res.headers),
    url: finalUrl.href,
  }
  res.destroy()
  return out
}

export type ProxiedMedia = {
  /** Upstream status (200, or 206 when a Range was honoured). */
  status: number
  /** Sniffed (prefix-allowlisted) content type. */
  contentType: string
  /** The (possibly partial) body. */
  bytes: Uint8Array
  /** Pass-through headers worth keeping: content-range, accept-ranges, content-length, etag, last-modified. */
  headers: Record<string, string>
}

/**
 * Fetch a remote image or media file through the hardened pipeline, whole.
 *
 * This is the old bridge's proxyRemote with the socket handed to the caller
 * instead of piped: the Next route wraps the bytes and headers in a Response.
 * The gate order is the one that makes it safe to be an origin-serving proxy —
 * vetTarget before anything moves, status and content-type checked before a
 * body byte is read, and a running cap on the way in.
 *
 * `kinds` is a content-type prefix allowlist (the old /img passed ['image/'],
 * the old /media ['video/', 'audio/']); anything else is refused with 415.
 * That check is load-bearing: without it this is an open proxy that will
 * serve an attacker's HTML from this app's own origin — the one origin allowed
 * to talk to the agent — which is also why no flavour of svg makes a sane
 * allowlist here.
 */
export async function proxyMedia(
  url: string,
  opts: {
    kinds: string[]
    maxBytes: number
    timeoutMs: number
    ranged?: boolean
    range?: string | null
  },
): Promise<ProxiedMedia> {
  const ranged = opts.ranged === true
  const target = vetTarget(url)

  const headers: Record<string, string> = {
    'user-agent': PROXY_UA,
    accept: ranged ? '*/*' : 'image/*,*/*;q=0.8',
    // Identity encoding so the byte cap counts the bytes we actually buffer and
    // content-length means what it says. Media is already compressed anyway.
    'accept-encoding': 'identity',
  }
  // Range is the difference between a <video> that seeks and one Safari refuses
  // to play at all, so the browser's request is passed through verbatim.
  if (ranged && typeof opts.range === 'string') {
    headers.range = opts.range
  }

  const { res: upstream } = await openRemote(target, headers, opts.timeoutMs)
  const status = upstream.statusCode ?? 0

  if (status !== 200 && status !== 206) {
    upstream.resume()
    throw new ProxyError(status === 404 ? 404 : 502, `upstream said ${status}`)
  }

  const type = String(upstream.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (!opts.kinds.some((kind) => type.startsWith(kind))) {
    upstream.resume()
    throw new ProxyError(415, `not ${opts.kinds.join(' or ')} (got ${type || 'nothing'})`)
  }

  const declared = Number(upstream.headers['content-length'])
  if (Number.isFinite(declared) && declared > opts.maxBytes) {
    upstream.resume()
    throw new ProxyError(413, 'too large')
  }

  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of upstream) {
      size += chunk.length
      if (size > opts.maxBytes) {
        // A body that outruns the cap is refused outright here, where the old
        // bridge had no choice but to cut an in-flight response short.
        upstream.destroy()
        throw new ProxyError(413, 'too large')
      }
      chunks.push(chunk)
    }
  } catch (err) {
    throw err instanceof ProxyError ? err : toProxyError(err)
  }

  const flat = flatHeaders(upstream.headers)
  const out: Record<string, string> = { 'content-length': String(size) }
  if (flat['etag']) out['etag'] = flat['etag']
  if (flat['last-modified']) out['last-modified'] = flat['last-modified']
  if (ranged) {
    // Only claim range support when the origin actually demonstrated it — a
    // 206, or an explicit accept-ranges of its own. Plenty of hosts ignore the
    // Range header and hand back the whole file with a 200; advertising
    // accept-ranges on top of that tells the video element it may seek by
    // issuing byte requests that will never be honoured, and the scrub bar
    // then misbehaves in a way that looks like our bug rather than theirs.
    if (status === 206 || flat['accept-ranges'] === 'bytes') {
      out['accept-ranges'] = 'bytes'
    }
    if (flat['content-range']) out['content-range'] = flat['content-range']
  }

  return { status, contentType: type, bytes: Buffer.concat(chunks), headers: out }
}
