import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/founder-session — server-validated founder session exchange.
 *
 * Trust boundary (R0.1): SAMJUNIORS_DEV_SECRET is a SERVER-only credential.
 * It is never baked into the client bundle and no NEXT_PUBLIC_ twin exists —
 * a secret visible in the browser proves nothing (any visitor could extract
 * it from the JS bundle) and would silently grant founder authority to
 * everyone who can load the page. The browser instead presents the secret
 * ONCE to this endpoint; the server validates it (constant-time) and mints
 * the exact HttpOnly cookie pair that the existing validators — proxy.ts
 * middleware, auth/session.ts route guards, live/auth.ts WS upgrades —
 * already accept. JavaScript can never read those cookies afterwards.
 *
 * Non-browser API clients may keep presenting the header pair directly:
 *   x-samjuniors-dev-as: founder
 *   x-samjuniors-dev-secret: <SAMJUNIORS_DEV_SECRET>
 *
 * Fail-closed in every mode: when SAMJUNIORS_DEV_SECRET is not configured,
 * this exchange cannot validate anything and refuses (401). Development mode
 * stays open by design on the routes themselves — no credentials are needed
 * there, so nothing is lost by refusing to mint them.
 *
 * DELETE /api/auth/founder-session clears the cookies (logout).
 */

const COOKIE_AS = 'samjuniors-dev-as';
const COOKIE_SECRET = 'samjuniors-dev-secret';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days, browser-enforced

/**
 * Constant-time secret comparison (the repository's established pattern,
 * see auth/session.ts, live/auth.ts and /api/workflow/scheduling). Length
 * mismatch short-circuits — only the comparison itself is timing-safe.
 */
function secretsMatch(presented: string | undefined, expected: string | undefined): boolean {
  if (!presented || !expected) return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Cookie values must survive round-tripping through the browser cookie jar
 * and the validators' parsers unchanged. Rather than minting a silently
 * broken session, reject values that would corrupt Set-Cookie syntax and
 * tell the operator to use a cookie-safe secret (e.g. `openssl rand -hex 32`).
 */
function isCookieSafe(value: string): boolean {
  return value.length > 0 && /^[\x21-\x3b\x3d-\x7e]+$/.test(value);
}

function sessionCookies(res: NextResponse, secretValue: string): NextResponse {
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(COOKIE_AS, 'founder', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  res.cookies.set(COOKIE_SECRET, secretValue, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const requiredSecret = process.env.SAMJUNIORS_DEV_SECRET;
    if (!requiredSecret) {
      console.error(
        '[FounderSessionAuth] Fatal: SAMJUNIORS_DEV_SECRET is not configured — founder session exchange fails closed.'
      );
      return NextResponse.json({ error: 'Server authentication is not configured' }, { status: 401 });
    }

    let presented: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.secret === 'string') {
        presented = body.secret;
      }
    } catch {
      // Missing/invalid body — fails closed exactly like a wrong secret below.
    }

    if (!presented || !secretsMatch(presented, requiredSecret)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (!isCookieSafe(presented)) {
      return NextResponse.json(
        {
          error:
            'Configured secret contains characters that cannot be carried in a cookie — use a URL-safe value (e.g. `openssl rand -hex 32`)',
        },
        { status: 400 }
      );
    }

    return sessionCookies(
      NextResponse.json({ success: true, role: 'FOUNDER', expiresInSeconds: SESSION_MAX_AGE_SECONDS }),
      presented
    );
  } catch (err: any) {
    console.error('[FounderSessionAuth] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ success: true, cleared: true });
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(COOKIE_AS, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 });
  res.cookies.set(COOKIE_SECRET, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
