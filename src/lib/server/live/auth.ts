import http from 'http';
import { URL } from 'url';
import { AuthenticatedFounder } from '../auth/session';
import { LiveTicketStore } from './ticket-store';

export interface UpgradeAuthResult {
  founder: AuthenticatedFounder;
  conversationId?: string;
}

/**
 * Parses HTTP cookie string into key-value map.
 */
function parseCookies(cookieHeader?: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!cookieHeader) return map;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.substring(0, idx).trim();
      const val = pair.substring(idx + 1).trim();
      map.set(key, decodeURIComponent(val));
    }
  }
  return map;
}

/**
 * Authenticates an incoming HTTP upgrade request before accepting the WebSocket connection.
 */
export async function authenticateUpgrade(req: http.IncomingMessage): Promise<UpgradeAuthResult | null> {
  const fullUrl = `http://${req.headers.host || 'localhost'}${req.url || '/'}`;
  const parsedUrl = new URL(fullUrl);

  // 1. Ticket-based authentication (query parameter)
  const ticketParam = parsedUrl.searchParams.get('ticket');
  if (ticketParam) {
    const ticketResult = LiveTicketStore.getInstance().consumeTicket(ticketParam);
    if (ticketResult && ticketResult.founder.role === 'FOUNDER') {
      return ticketResult;
    }
    return null;
  }

  const cookies = parseCookies(req.headers.cookie);
  const getHeader = (name: string): string | undefined => {
    const val = req.headers[name.toLowerCase()];
    return Array.isArray(val) ? val[0] : val;
  };

  // 2. Production verification
  if (process.env.NODE_ENV === 'production') {
    // Prohibit dev headers/cookies
    if (
      getHeader('x-samjuniors-dev-as') ||
      cookies.has('samjuniors-dev-as') ||
      getHeader('x-samjuniors-role') ||
      cookies.has('samjuniors-role')
    ) {
      return null;
    }

    const devAs = getHeader('x-samjuniors-dev-as') || cookies.get('samjuniors-dev-as');
    const devSecret = getHeader('x-samjuniors-dev-secret') || cookies.get('samjuniors-dev-secret');
    const requiredSecret = process.env.SAMJUNIORS_DEV_SECRET;

    if (devAs === 'founder' && requiredSecret && devSecret === requiredSecret) {
      return {
        founder: {
          userId: 'founder-production-session',
          email: 'founder@samjuniors.com',
          name: 'Executive Founder',
          role: 'FOUNDER',
          isVerified: true,
        },
        conversationId: parsedUrl.searchParams.get('conversationId') || undefined,
      };
    }

    return null;
  }

  // 3. Sandbox / development / test mode
  const requestedRole = (getHeader('x-samjuniors-role') || cookies.get('samjuniors-role')) as
    | 'FOUNDER'
    | 'EXECUTIVE'
    | 'AUDITOR'
    | undefined;

  const requestedUserId = getHeader('x-samjuniors-user-id');

  const effectiveRole = requestedRole && ['FOUNDER', 'EXECUTIVE', 'AUDITOR'].includes(requestedRole)
    ? requestedRole
    : 'FOUNDER';

  // Live interaction is privileged to verified Founder
  if (effectiveRole !== 'FOUNDER') {
    return null;
  }

  return {
    founder: {
      userId: requestedUserId || 'founder-local-session',
      email: 'founder@samjuniors.com',
      name: 'Executive Founder',
      role: 'FOUNDER',
      isVerified: true,
    },
    conversationId: parsedUrl.searchParams.get('conversationId') || undefined,
  };
}
