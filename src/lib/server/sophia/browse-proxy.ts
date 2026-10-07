/**
 * Same-origin browse proxy for the SofiaUI BrowserPanel — one-way reference
 * port of SofiaUI's src/lib/browse-proxy.ts @ 9e88dee (the SofiaUI
 * repository remains independent), so the ported panel can show pages that
 * send X-Frame-Options / CSP frame-ancestors and refuse a raw iframe.
 *
 * Served at GET /api/sophia/browse?url=… (founder-gated by the route).
 */

import { lookup } from 'node:dns/promises';

const BLOCKED_HOSTNAME = /(^|\.)(localhost|local|internal|intranet|home\.arpa)$/i;
const PROXY_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const MAX_BYTES = 8 * 1024 * 1024;
const FRAME_GUARD = `<script data-sophia-frame-guard>(function(){try{Object.defineProperty(window,'top',{get:function(){return window}});Object.defineProperty(window,'parent',{get:function(){return window}});Object.defineProperty(window,'frameElement',{get:function(){return null}});}catch(e){}})();</script>`;

function json(body: unknown, status = 400) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function proxyPath(target: string): string {
  return `/api/sophia/browse?url=${encodeURIComponent(target)}`;
}

/** SofiaUI's media-proxy isBlockedAddress, inlined (private/link-local/metadata guard). */
function isBlockedAddress(ip: string): boolean {
  let addr = String(ip || '').toLowerCase().split('%')[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
  if (mapped) addr = mapped[1];

  if (addr.includes('.')) {
    const parts = addr.split('.').map(Number);
    if (parts.length !== 4) return true;
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local & cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 192 && b === 0) return true; // 192.0.0.0/24
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / Tailnet
    if (a >= 224) return true; // multicast / broadcast
    return false;
  }

  if (addr === '::' || addr === '::1') return true; // any + loopback
  if (addr.startsWith('fe80:') || addr.startsWith('fc') || addr.startsWith('fd')) return true; // link-local + ULA
  return false;
}

async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw json({ error: 'Invalid URL' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw json({ error: 'Only http and https are allowed' }, 400);
  }
  if (BLOCKED_HOSTNAME.test(parsed.hostname)) {
    throw json({ error: 'Target host is blocked' }, 403);
  }
  try {
    const resolved = await lookup(parsed.hostname, { all: true });
    for (const entry of resolved) {
      if (isBlockedAddress(entry.address)) {
        throw json({ error: 'Target resolves to a restricted address' }, 403);
      }
    }
  } catch (err) {
    if (err instanceof Response) throw err;
    throw json({ error: `DNS lookup failed: ${(err as Error).message}` }, 502);
  }
  return parsed;
}

function rewriteAbsolute(value: string, base: URL): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/api/sophia/browse')
  ) {
    return value;
  }
  try {
    const abs = new URL(trimmed, base);
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return value;
    return proxyPath(abs.toString());
  } catch {
    return value;
  }
}

function rewriteHtml(html: string, pageUrl: URL): string {
  let out = html;
  out = out.replace(/\s+(href|src|action|poster|data-src)\s*=\s*(["'])([\s\S]*?)\2/gi, (_m, attr, q, val) => {
    return ` ${attr}=${q}${rewriteAbsolute(val, pageUrl)}${q}`;
  });
  out = out.replace(/\s+srcset\s*=\s*(["'])([\s\S]*?)\1/gi, (_m, q, val: string) => {
    const next = val
      .split(',')
      .map((part) => {
        const [u, ...rest] = part.trim().split(/\s+/);
        return [rewriteAbsolute(u, pageUrl), ...rest].join(' ');
      })
      .join(', ');
    return ` srcset=${q}${next}${q}`;
  });
  if (/<head[\s>]/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1><base href="${pageUrl.href}">${FRAME_GUARD}`);
  } else {
    out = FRAME_GUARD + out;
  }
  return out;
}

function rewriteCss(css: string, pageUrl: URL): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_m, _q, val: string) => {
    return `url("${rewriteAbsolute(val, pageUrl)}")`;
  });
}

function passthroughHeaders(contentType: string): Record<string, string> {
  return {
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, max-age=60',
    'content-security-policy': 'frame-ancestors *',
  };
}

export async function handleSophiaBrowseProxy(req: Request): Promise<Response> {
  const target = new URL(req.url).searchParams.get('url')?.trim();
  if (!target) return json({ error: 'Missing "url" query parameter' }, 400);

  let parsed: URL;
  try {
    parsed = await assertPublicHttpUrl(target);
  } catch (err) {
    if (err instanceof Response) return err;
    return json({ error: 'Invalid URL' }, 400);
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 14000);
  try {
    const upstream = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': PROXY_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/css,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'accept-encoding': 'identity',
      },
      signal: abort.signal,
    });

    const contentType = (upstream.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    const length = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_BYTES) {
      return json({ error: 'Page is too large to preview' }, 413);
    }

    if (!upstream.ok) {
      return json({ error: `Upstream returned ${upstream.status}`, url: parsed.toString() }, upstream.status === 404 ? 404 : 502);
    }

    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      const html = rewriteHtml(await upstream.text(), new URL(upstream.url || parsed.toString()));
      return new Response(html, { headers: { ...passthroughHeaders('text/html; charset=utf-8') } });
    }
    if (contentType.includes('text/css')) {
      const css = rewriteCss(await upstream.text(), parsed);
      return new Response(css, { headers: passthroughHeaders('text/css; charset=utf-8') });
    }

    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return json({ error: 'Payload too large' }, 413);
    return new Response(buf, { headers: passthroughHeaders(contentType || 'application/octet-stream') });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return json({ error: 'Timed out fetching page' }, 504);
    return json({ error: (err as Error).message || 'Browse proxy failed' }, 502);
  } finally {
    clearTimeout(timer);
  }
}
