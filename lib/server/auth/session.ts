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
 * Validates the authenticated session for executive /api routes.
 * Strictly verifies identity from Clerk claims or secure local development sessions.
 * Never trusts client-supplied identity parameters in HTTP bodies.
 */
export async function getAuthenticatedFounder(req?: NextRequest): Promise<AuthenticatedFounder | null> {
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

    // If req is not provided (internal server-side execution without HTTP context)
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

    // Strict check: devAs MUST be explicitly 'founder'
    if (devAs !== 'founder') {
      return null;
    }

    // If a dev secret is configured, it must match
    if (requiredSecret && devSecret !== requiredSecret) {
      console.warn('[SessionAuth] Rejecting dev session: invalid x-samjuniors-dev-secret.');
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
    const roleClaim = (authData.sessionClaims?.publicMetadata as any)?.role || 'FOUNDER';

    return {
      userId: authData.userId,
      email: user?.emailAddresses[0]?.emailAddress || 'founder@samjuniors.com',
      name: `${user?.firstName || ''} ${user?.lastName || 'Founder'}`.trim(),
      role: roleClaim === 'AUDITOR' ? 'AUDITOR' : roleClaim === 'EXECUTIVE' ? 'EXECUTIVE' : 'FOUNDER',
      isVerified: true,
    };
  } catch (err) {
    console.error('[SessionAuth] Error validating Clerk session:', err);
    return null;
  }
}
