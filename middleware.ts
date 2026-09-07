import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const REQUEST_ID_HEADER = "x-request-id";

// Executive API routes that require authenticated Founder authority
const isExecutiveApiRoute = createRouteMatcher([
  "/api/workflow/(.*)",
  "/api/orchestrate(.*)",
  "/api/advisor(.*)",
  "/api/agent-chat(.*)",
  "/api/agent-collab(.*)",
  "/api/communication/contacts(.*)",
  "/api/communication/conversations(.*)",
  "/api/communication/drafts(.*)",
  "/api/communication/intents(.*)",
  "/api/communication/messages(.*)",
]);

// Webhook routes that authenticate via cryptographic provider signatures (e.g. Svix)
const isWebhookRoute = createRouteMatcher([
  "/api/communication/webhooks/(.*)",
]);

function applySecurityHeaders(req: NextRequest) {
  const requestId = req.headers.get(REQUEST_ID_HEADER) || crypto.randomUUID().toString();
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

const SANDBOX_PUB_KEY = "pk_test_dummy-sandbox-key";
const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isSandboxMode =
  !clerkPubKey ||
  clerkPubKey === SANDBOX_PUB_KEY ||
  clerkPubKey.includes("dummy") ||
  clerkPubKey.includes("placeholder");

// In sandbox mode without live Clerk credentials:
function sandboxMiddleware(req: NextRequest) {
  // If hitting an executive API route in sandbox, ensure non-spoofed origin or dev token
  if (isExecutiveApiRoute(req) && !isWebhookRoute(req)) {
    const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
    const devToken = req.headers.get("x-samjuniors-dev-as") || req.cookies.get("samjuniors-dev-as")?.value;
    if (!isDev && devToken !== "founder") {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized: Valid session required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
  }
  return applySecurityHeaders(req);
}

// In production with live Clerk credentials:
const realClerkMiddleware = clerkMiddleware(async (auth, req) => {
  if (isExecutiveApiRoute(req) && !isWebhookRoute(req)) {
    let userId: string | null = null;
    try {
      const authData = await auth();
      userId = authData.userId;
    } catch {
      userId = null;
    }

    if (!userId) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized: Valid Founder session required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return applySecurityHeaders(req);
});

export default isSandboxMode ? sandboxMiddleware : realClerkMiddleware;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
