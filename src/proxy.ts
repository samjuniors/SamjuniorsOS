import { NextResponse, type NextRequest } from '@/lib/server/http';
import {
  globalRateLimiter,
  getClientIdentifier,
  RATE_LIMIT_POLICIES,
  type RateLimitResult,
} from "./lib/server/security/rate-limiter";

/**
 * SamJuniorsOS gateway middleware.
 *
 * Enforces:
 *  - Strict HTTP Security Headers & Content Security Policy (CSP)
 *  - Request body size limits (fail-closed 413 Payload Too Large)
 *  - Edge-compatible rate limits with IETF RateLimit-* headers (429 Too Many Requests)
 *  - Executive API route authorization with constant-time founder & machine authentication
 */

const REQUEST_ID_HEADER = "x-request-id";

// Request body size limits
export const MAX_STANDARD_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_UPLOAD_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

export function getRequestSizeLimit(pathname: string): number {
  if (
    pathname.startsWith("/api/media") ||
    pathname.startsWith("/api/upload") ||
    pathname.startsWith("/api/speech")
  ) {
    return MAX_UPLOAD_BODY_BYTES;
  }
  return MAX_STANDARD_BODY_BYTES;
}

// Executive API routes that require Founder authority
const EXECUTIVE_API_PATTERNS = [
  "/api/workflow",
  "/api/orchestrate",
  "/api/advisor",
  "/api/agent-chat",
  "/api/agent-collab",
  "/api/epistemic",
  "/api/agents",
  "/api/activity", // Phase 4.4C — authoritative Activity projection (founder-only)
  "/api/communication/contacts",
  "/api/communication/conversations",
  "/api/communication/drafts",
  "/api/communication/intents",
  "/api/communication/messages",
  "/api/conversation",
  "/api/sofia/memory",
  "/api/sophia/system/action",
  "/api/auth/ws-ticket",
];

export function isExecutiveApiRoute(pathname: string): boolean {
  return EXECUTIVE_API_PATTERNS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * Constant-time string equality for the middleware layer. This file runs
 * in the Edge runtime, where node:crypto's timingSafeEqual and Buffer are
 * unavailable — a manual XOR accumulator is runtime-agnostic and leaks only
 * the (already public) length mismatch, matching the semantics of the
 * node-side secretsMatch helpers in auth/session.ts and live/auth.ts.
 */
function constantTimeEquals(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Generate standard Content Security Policy directives.
 * Permits same-origin frame ancestors only for prototype static asset routes.
 */
export function getContentSecurityPolicy(isPrototypeAsset: boolean): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://picsum.photos https://images.unsplash.com",
    "media-src 'self' blob: data:",
    "connect-src 'self' https: wss: ws:",
    `frame-ancestors ${isPrototypeAsset ? "'self'" : "'none'"}`,
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return directives.join("; ");
}

/**
 * Create a JSON response with all security headers attached fail-closed.
 */
function createJsonResponse(
  req: NextRequest,
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {}
): NextResponse {
  const requestId =
    req.headers.get(REQUEST_ID_HEADER) || crypto.randomUUID().toString();
  const isPrototypeAsset = req.nextUrl.pathname.startsWith("/prototype/");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [REQUEST_ID_HEADER]: requestId,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": isPrototypeAsset ? "SAMEORIGIN" : "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
    "X-DNS-Prefetch-Control": "on",
    "Content-Security-Policy": getContentSecurityPolicy(isPrototypeAsset),
    ...extraHeaders,
  };

  return new NextResponse(JSON.stringify(body), {
    status,
    headers,
  });
}

function applySecurityHeaders(
  req: NextRequest,
  extraHeaders: Record<string, string> = {}
): NextResponse {
  const requestId =
    req.headers.get(REQUEST_ID_HEADER) || crypto.randomUUID().toString();
  const isPrototypeAsset = req.nextUrl.pathname.startsWith("/prototype/");

  const securityHeaders: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": isPrototypeAsset ? "SAMEORIGIN" : "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
    "X-DNS-Prefetch-Control": "on",
    "Content-Security-Policy": getContentSecurityPolicy(isPrototypeAsset),
    ...extraHeaders,
  };

  const response = NextResponse.next({
    request: {
      headers: new Headers(req.headers),
    },
  });

  response.headers.set(REQUEST_ID_HEADER, requestId);
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // 1. REQUEST SIZE LIMITS (fail-closed on oversized mutation bodies)
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      const maxLimit = getRequestSizeLimit(pathname);
      if (!Number.isNaN(contentLength) && contentLength > maxLimit) {
        return createJsonResponse(
          req,
          {
            error: `Payload Too Large: request body of ${contentLength} bytes exceeds limit of ${maxLimit} bytes`,
            limit: maxLimit,
            received: contentLength,
          },
          413
        );
      }
    }
  }

  // 2. RATE LIMITING ON API ROUTES
  let rateLimitHeaders: Record<string, string> = {};
  if (pathname.startsWith("/api/")) {
    const cronSecret = process.env.CRON_TRIGGER_SECRET;
    const presentedCronSecret = req.headers.get("x-cron-secret");
    const isCronHeartbeat =
      pathname === "/api/workflow/scheduling" &&
      req.method === "POST" &&
      !!cronSecret &&
      !!presentedCronSecret &&
      constantTimeEquals(presentedCronSecret, cronSecret);

    const policy = isCronHeartbeat
      ? RATE_LIMIT_POLICIES.CRON_MACHINE
      : isExecutiveApiRoute(pathname)
      ? RATE_LIMIT_POLICIES.EXECUTIVE_API
      : RATE_LIMIT_POLICIES.STANDARD_API;

    const clientKey = isCronHeartbeat
      ? "machine:cron:heartbeat"
      : `${getClientIdentifier(req)}:${policy.maxRequests}`;

    const rateLimitResult: RateLimitResult = globalRateLimiter.check(
      clientKey,
      policy
    );

    rateLimitHeaders = {
      "RateLimit-Limit": rateLimitResult.limit.toString(),
      "RateLimit-Remaining": rateLimitResult.remaining.toString(),
      "RateLimit-Reset": rateLimitResult.resetSeconds.toString(),
    };

    if (!rateLimitResult.allowed) {
      return createJsonResponse(
        req,
        {
          error: `Too Many Requests: Rate limit exceeded. Try again in ${rateLimitResult.resetSeconds} seconds`,
          retryAfter: rateLimitResult.resetSeconds,
        },
        429,
        {
          "Retry-After": rateLimitResult.resetSeconds.toString(),
          ...rateLimitHeaders,
        }
      );
    }
  }

  // 3. EXECUTIVE API AUTHORIZATION GATE
  if (isExecutiveApiRoute(pathname)) {
    // Production without an identity provider: fail closed.
    if (process.env.NODE_ENV === "production") {
      // The dev-only ROLE override is prohibited in production
      if (
        req.headers.has("x-samjuniors-role") ||
        req.cookies.has("samjuniors-role")
      ) {
        return createJsonResponse(
          req,
          { error: "Unauthorized: Role override headers are prohibited in production" },
          401,
          rateLimitHeaders
        );
      }

      // MACHINE AUTHENTICATION — scheduler heartbeat POST admission
      if (
        pathname === "/api/workflow/scheduling" &&
        req.method === "POST"
      ) {
        const cronSecret = process.env.CRON_TRIGGER_SECRET;
        const presentedCronSecret = req.headers.get("x-cron-secret");
        if (
          cronSecret &&
          presentedCronSecret &&
          constantTimeEquals(presentedCronSecret, cronSecret)
        ) {
          return applySecurityHeaders(req, rateLimitHeaders);
        }
      }

      const hasClerk =
        !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
        !!process.env.CLERK_SECRET_KEY;
      const hasDevSecret = !!process.env.SAMJUNIORS_DEV_SECRET;
      const hasProvider = hasClerk || hasDevSecret;
      const devToken =
        req.headers.get("x-samjuniors-dev-as") ||
        req.cookies.get("samjuniors-dev-as")?.value;
      const devSecret =
        req.headers.get("x-samjuniors-dev-secret") ||
        req.cookies.get("samjuniors-dev-secret")?.value;
      const authorized =
        hasProvider &&
        devToken === "founder" &&
        !!devSecret &&
        !!process.env.SAMJUNIORS_DEV_SECRET &&
        constantTimeEquals(devSecret, process.env.SAMJUNIORS_DEV_SECRET);

      if (!authorized) {
        return createJsonResponse(
          req,
          { error: "Unauthorized: Valid Founder session required" },
          401,
          rateLimitHeaders
        );
      }
    }
    // Development sandbox: single-tenant demo mode, requests pass through.
  }

  return applySecurityHeaders(req, rateLimitHeaders);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
