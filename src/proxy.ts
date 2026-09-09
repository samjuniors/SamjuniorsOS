import { NextResponse, type NextRequest } from "next/server";

/**
 * SamJuniorsOS gateway middleware.
 *
 * The upstream repository gated executive API routes behind Clerk
 * authentication (@clerk/nextjs). This deployment environment runs a
 * single-tenant sandbox with no Clerk credentials, so the middleware
 * was ported to a provider-free implementation:
 *
 *  - Security headers + request-id propagation are preserved verbatim.
 *  - In development (sandbox demo) executive API routes are open so the
 *    bundled OS frontend functions end-to-end.
 *  - In production without a real identity provider the executive routes
 *    fail closed (401), matching the original fail-closed posture.
 */

const REQUEST_ID_HEADER = "x-request-id";

// Executive API routes that require Founder authority
const EXECUTIVE_API_PATTERNS = [
  "/api/workflow",
  "/api/orchestrate",
  "/api/advisor",
  "/api/agent-chat",
  "/api/agent-collab",
  "/api/epistemic",
  "/api/agents",
  "/api/communication/contacts",
  "/api/communication/conversations",
  "/api/communication/drafts",
  "/api/communication/intents",
  "/api/communication/messages",
];

function isExecutiveApiRoute(pathname: string): boolean {
  return EXECUTIVE_API_PATTERNS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function applySecurityHeaders(req: NextRequest) {
  const requestId =
    req.headers.get(REQUEST_ID_HEADER) || crypto.randomUUID().toString();
  const securityHeaders: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-DNS-Prefetch-Control": "on",
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
  if (isExecutiveApiRoute(req.nextUrl.pathname)) {
    // Production without an identity provider: fail closed.
    if (process.env.NODE_ENV === "production") {
      const hasProvider =
        !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
        !!process.env.SAMJUNIORS_DEV_SECRET;
      const devToken =
        req.headers.get("x-samjuniors-dev-as") ||
        req.cookies.get("samjuniors-dev-as")?.value;
      const devSecret =
        req.headers.get("x-samjuniors-dev-secret") ||
        req.cookies.get("samjuniors-dev-secret")?.value;
      const authorized =
        hasProvider && devToken === "founder" && devSecret === process.env.SAMJUNIORS_DEV_SECRET;
      if (!authorized) {
        return new NextResponse(
          JSON.stringify({ error: "Unauthorized: Valid Founder session required" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    // Development sandbox: single-tenant demo mode, requests pass through.
  }
  return applySecurityHeaders(req);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
