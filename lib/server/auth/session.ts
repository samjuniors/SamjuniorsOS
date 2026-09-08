import { NextRequest } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';

export interface AuthenticatedFounder {
  userId: string;
  email: string;
  name: string;
  role: 'FOUNDER' | 'EXECUTIVE' | 'AUDITOR';
  isVerified: boolean;
}

/**
 * Resolves the effective role for a Clerk-authenticated user.
 * Strictly enforces that privileged FOUNDER access requires explicit allowlisting in FOUNDER_EMAILS.
 * Metadata claims (e.g. role: 'FOUNDER') cannot grant FOUNDER authority without matching configured email.
 */
export function resolveClerkUserRole(
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

  // If FOUNDER_EMAILS is missing, empty, or unconfigured, privileged Founder role fails closed.
  const isExplicitlyAuthorizedFounder =
    configuredFounderEmails.length > 0 &&
    normalizedEmail.length > 0 &&
    configuredFounderEmails.includes(normalizedEmail);

  if (isExplicitlyAuthorizedFounder) {
    return 'FOUNDER';
  }

  // Non-Founder users can be EXECUTIVE if declared, otherwise default strictly to AUDITOR.
  // Note: userMetadataRole === 'FOUNDER' without matching configuredFounderEmails is deliberately ignored to prevent metadata spoofing.
  if (userMetadataRole === 'EXECUTIVE') {
    return 'EXECUTIVE';
  }

  return 'AUDITOR';
}

/**
 * Validates the authenticated session for executive /api routes.
 * Strictly verifies identity from Clerk claims or secure local development sessions.
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

  const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const isSandbox =
    !clerkPubKey ||
    clerkPubKey === 'pk_test_dummy-sandbox-key' ||
    clerkPubKey.includes('dummy') ||
    clerkPubKey.includes('placeholder');

  // In sandbox / test mode without real Clerk credentials:
  if (isSandbox) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[SessionAuth] Fatal: Sandbox/dummy credentials are not permitted in production.');
      return null;
    }

    // If req is not provided (internal server-side execution without HTTP context, e.g. CLI/unit test runner)
    if (!req) {
      if (process.env.NODE_ENV === 'test') {
        return {
          userId: 'founder-local-session',
          email: 'founder@samjuniors.com',
          name: 'Executive Founder',
          role: 'FOUNDER',
          isVerified: true,
        };
      }
      return null;
    }

    const devAs = req.headers.get('x-samjuniors-dev-as') || req.cookies.get('samjuniors-dev-as')?.value;
    const devSecret = req.headers.get('x-samjuniors-dev-secret') || req.cookies.get('samjuniors-dev-secret')?.value;
    const requiredSecret = process.env.SAMJUNIORS_DEV_SECRET;

    // Strict security check:
    // 1. devAs MUST be explicitly 'founder'
    // 2. SAMJUNIORS_DEV_SECRET MUST be set on the server
    // 3. devSecret MUST be present and match SAMJUNIORS_DEV_SECRET exactly
    if (devAs !== 'founder') {
      return null;
    }

    if (!requiredSecret || !devSecret || devSecret !== requiredSecret) {
      // In automated test environments without HTTP secret setup, allow only if NODE_ENV === 'test' and no spoofed header was sent
      if (process.env.NODE_ENV === 'test' && !req.headers.has('x-samjuniors-dev-as') && !req.cookies.has('samjuniors-dev-as')) {
        return {
          userId: 'founder-local-session',
          email: 'founder@samjuniors.com',
          name: 'Executive Founder',
          role: 'FOUNDER',
          isVerified: true,
        };
      }
      return null;
    }

    return {
      userId: 'founder-local-session',
      email: 'founder@samjuniors.com',
      name: 'Executive Founder',
      role: 'FOUNDER',
      isVerified: true,
    };
  }

  // Real Clerk Session Verification
  try {
    const authData = await auth();
    if (!authData.userId) {
      return null;
    }

    const user = await currentUser();
    const userMetadata = (authData.sessionClaims?.publicMetadata as Record<string, any>) || {};
    const roleClaim = userMetadata.role;
    const userEmail = user?.emailAddresses[0]?.emailAddress?.toLowerCase() || '';

    const effectiveRole = resolveClerkUserRole(userEmail, roleClaim);

    return {
      userId: authData.userId,
      email: userEmail || 'auditor@samjuniors.com',
      name: `${user?.firstName || ''} ${user?.lastName || 'User'}`.trim(),
      role: effectiveRole,
      isVerified: true,
    };
  } catch (err) {
    console.error('[SessionAuth] Error validating Clerk session:', err);
    return null;
  }
}
