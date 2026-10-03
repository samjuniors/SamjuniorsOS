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
  "/api/activity", // Phase 4.4C — authoritative Activity projection (founder-only)
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

function applySecurityHeaders(req: NextRequest) {
  const requestId =
    req.headers.get(REQUEST_ID_HEADER) || crypto.randomUUID().toString();
  // The Core V4 prototype (/) embeds the static prototype directory in a
  // same-origin iframe; allow same-origin framing for those assets only.
  const isPrototypeAsset = req.nextUrl.pathname.startsWith("/prototype/");
  const securityHeaders: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": isPrototypeAsset ? "SAMEORIGIN" : "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
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
      // The dev-only ROLE override is prohibited in production — the same
      // policy auth/session.ts and live/auth.ts already enforce. A forged
      // role header voids the request instead of upgrading it. This check
      // deliberately precedes the machine-credential admission below: a
      // request presenting role headers is voided even with a valid cron
      // secret (the heartbeat never sends them).
      if (req.headers.has("x-samjuniors-role") || req.cookies.has("samjuniors-role")) {
        return new NextResponse(
          JSON.stringify({ error: "Unauthorized: Role override headers are prohibited in production" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      // MACHINE AUTHENTICATION — the single non-founder production admission.
      // The scheduler heartbeat (mini-services/scheduler-heartbeat, or a
      // platform cron in a deployed environment) wakes due-work evaluation by
      // POSTing EXACTLY this endpoint with the x-cron-secret machine
      // credential. The scope is deliberately minimal:
      //   - exact path only: /api/workflow/scheduling, NOT …/actions,
      //     …/status or any other executive route (schedule lifecycle stays
      //     founder-session-only; the machine can evaluate work, never
      //     approve, pause, resume, cancel or create schedules),
      //   - POST only (reads of scheduler state stay founder-only),
      //   - constant-time comparison, fail-closed when CRON_TRIGGER_SECRET
      //     is unset or the presented header is absent/empty.
      // This mirrors what the route itself already authorizes
      // (founder session OR cron secret — see the route's cronSecretMatches):
      // the gate admits the request; the route STILL re-authenticates it
      // independently, so this is defense in depth, not a bypass. Machine
      // auth mints no identity: no session, no cookies, no role — the
      // cron-secret path can never make a request look founder-authored
      // (the route reports triggerSource: 'cron' honestly).
      if (
        req.nextUrl.pathname === "/api/workflow/scheduling" &&
        req.method === "POST"
      ) {
        const cronSecret = process.env.CRON_TRIGGER_SECRET;
        const presentedCronSecret = req.headers.get("x-cron-secret");
        if (
          cronSecret && presentedCronSecret &&
          constantTimeEquals(presentedCronSecret, cronSecret)
        ) {
          return applySecurityHeaders(req);
        }
        // Invalid/absent machine credential: fall through to the founder
        // check below — a Founder may still POST here manually with founder
        // credentials (documented route behavior), and any other caller
        // keeps receiving the same 401 as before this admission existed.
      }
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
        hasProvider && devToken === "founder" && !!devSecret && !!process.env.SAMJUNIORS_DEV_SECRET &&
        constantTimeEquals(devSecret, process.env.SAMJUNIORS_DEV_SECRET);
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
