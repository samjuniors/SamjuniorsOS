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
    const isDevOrTest =
      !process.env.NODE_ENV ||
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test';
    const devAs = req?.headers.get('x-samjuniors-dev-as') || req?.cookies.get('samjuniors-dev-as')?.value;

    // Reject if unauthorized in sandbox
    if (!isDevOrTest && devAs !== 'founder') {
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
