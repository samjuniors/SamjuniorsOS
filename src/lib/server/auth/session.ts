import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Constant-time secret comparison (the repository's established pattern,
 * see /api/workflow/scheduling). Length mismatch short-circuits — only the
 * comparison itself is timing-safe.
 */
function secretsMatch(presented: string | null | undefined, expected: string | undefined): boolean {
  if (!presented || !expected) return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface AuthenticatedFounder {
  userId: string;
  email: string;
  name: string;
  role: 'FOUNDER' | 'EXECUTIVE' | 'AUDITOR';
  isVerified: boolean;
}

/**
 * Resolves the effective role for an authenticated user.
 * Strictly enforces that privileged FOUNDER access requires explicit
 * allowlisting in FOUNDER_EMAILS. Metadata claims (e.g. role: 'FOUNDER')
 * cannot grant FOUNDER authority without matching configured email.
 */
export function resolveUserRole(
  userEmail: string,
  userMetadataRole?: string
): 'FOUNDER' | 'EXECUTIVE' | 'AUDITOR' {
  const rawFounderEmails = process.env.FOUNDER_EMAILS?.trim();
  const configuredFounderEmails = rawFounderEmails
    ? rawFounderEmails
        .toLowerCase()
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e.length > 0)
    : [];

  const normalizedEmail = userEmail.toLowerCase().trim();

  const isExplicitlyAuthorizedFounder =
    configuredFounderEmails.length > 0 &&
    normalizedEmail.length > 0 &&
    configuredFounderEmails.includes(normalizedEmail);

  if (isExplicitlyAuthorizedFounder) {
    return 'FOUNDER';
  }

  if (userMetadataRole === 'EXECUTIVE') {
    return 'EXECUTIVE';
  }

  return 'AUDITOR';
}

/**
 * Validates the authenticated session for executive /api routes.
 *
 * The upstream repository verified identity via Clerk claims or secure
 * local development sessions (x-samjuniors-dev-as / secret). This sandbox
 * deployment has no external identity provider, so:
 *  - development/test: a local single-tenant Founder session is returned
 *    (matching the original sandbox behavior with dev credentials set).
 *  - production: identity fails closed unless SAMJUNIORS_DEV_SECRET is
 *    provisioned and presented via the dev headers/cookies.
 * Never trusts client-supplied identity parameters in HTTP bodies.
 */
export async function getAuthenticatedFounder(req?: NextRequest): Promise<AuthenticatedFounder | null> {
  // Prohibit test role overrides unconditionally in production. The dev-as /
  // dev-secret pair is NOT prohibited here — it is the documented production
  // credential this same function verifies (constant-time) below and the
  // executive-route middleware (proxy.ts) authorizes on. Only the role
  // override (which could mint EXECUTIVE/AUDITOR identities or mask the
  // real session) is a dev-only bypass that must never function in production.
  if (process.env.NODE_ENV === 'production' && req) {
    if (req.headers.has('x-samjuniors-role') || req.cookies.has('samjuniors-role')) {
      console.error('[SessionAuth] Fatal: Role override headers are strictly prohibited in production.');
      return null;
    }
  }

  // Sandbox / development / test mode: local session with optional test role inspection.
  if (process.env.NODE_ENV !== 'production') {
    const requestedRole = (req?.headers.get('x-samjuniors-role') || req?.cookies.get('samjuniors-role')?.value) as
      | 'FOUNDER'
      | 'EXECUTIVE'
      | 'AUDITOR'
      | null;

    const requestedUserId = req?.headers.get('x-samjuniors-user-id') || undefined;

    const effectiveRole = requestedRole && ['FOUNDER', 'EXECUTIVE', 'AUDITOR'].includes(requestedRole)
      ? requestedRole
      : 'FOUNDER';

    return {
      userId: requestedUserId || (effectiveRole === 'FOUNDER' ? 'founder-local-session' : 'member-local-session'),
      email: effectiveRole === 'FOUNDER' ? 'founder@samjuniors.com' : 'member@samjuniors.com',
      name: effectiveRole === 'FOUNDER' ? 'Executive Founder' : 'Member Auditor',
      role: effectiveRole,
      isVerified: effectiveRole === 'FOUNDER',
    };
  }

  // Production: verify the configured dev secret if provided.
  if (req) {
    const devAs =
      req.headers.get('x-samjuniors-dev-as') || req.cookies.get('samjuniors-dev-as')?.value;
    const devSecret =
      req.headers.get('x-samjuniors-dev-secret') || req.cookies.get('samjuniors-dev-secret')?.value;
    const requiredSecret = process.env.SAMJUNIORS_DEV_SECRET;

    if (devAs === 'founder' && requiredSecret && secretsMatch(devSecret, requiredSecret)) {
      return {
        userId: 'founder-production-session',
        email: 'founder@samjuniors.com',
        name: 'Executive Founder',
        role: 'FOUNDER',
        isVerified: true,
      };
    }
    return null;
  }

  // Internal server-side execution without HTTP context.
  return null;
}
