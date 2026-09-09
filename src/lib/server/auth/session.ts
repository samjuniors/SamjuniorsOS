import { NextRequest } from 'next/server';

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
  // Prohibit dev headers unconditionally in production
  if (process.env.NODE_ENV === 'production' && req) {
    if (req.headers.has('x-samjuniors-dev-as') || req.cookies.has('samjuniors-dev-as')) {
      console.error('[SessionAuth] Fatal: Dev bypass headers/cookies are strictly prohibited in production.');
      return null;
    }
  }

  const localFounderSession: AuthenticatedFounder = {
    userId: 'founder-local-session',
    email: 'founder@samjuniors.com',
    name: 'Executive Founder',
    role: 'FOUNDER',
    isVerified: true,
  };

  // Sandbox / development mode (this environment): local founder session.
  if (process.env.NODE_ENV !== 'production') {
    return localFounderSession;
  }

  // Production: verify the configured dev secret if provided.
  if (req) {
    const devAs =
      req.headers.get('x-samjuniors-dev-as') || req.cookies.get('samjuniors-dev-as')?.value;
    const devSecret =
      req.headers.get('x-samjuniors-dev-secret') || req.cookies.get('samjuniors-dev-secret')?.value;
    const requiredSecret = process.env.SAMJUNIORS_DEV_SECRET;

    if (devAs === 'founder' && requiredSecret && devSecret === requiredSecret) {
      return localFounderSession;
    }
    return null;
  }

  // Internal server-side execution without HTTP context.
  return null;
}
