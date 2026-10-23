import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import {
  globalRateLimiter,
  RATE_LIMIT_POLICIES,
  type RateLimitResult,
} from '../lib/server/security/rate-limiter';

const REQUEST_ID_HEADER = 'x-request-id';

export function getContentSecurityPolicy(): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://picsum.photos https://images.unsplash.com",
    "media-src 'self' blob: data:",
    "connect-src 'self' https: wss: ws:",
    "frame-ancestors 'none'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return directives.join('; ');
}

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers[REQUEST_ID_HEADER] as string) || randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('X-DNS-Prefetch-Control', 'on');
  res.setHeader('Content-Security-Policy', getContentSecurityPolicy());
  next();
}

const EXECUTIVE_API_PATTERNS = [
  '/api/workflow',
  '/api/orchestrate',
  '/api/advisor',
  '/api/agent-chat',
  '/api/agent-collab',
  '/api/epistemic',
  '/api/agents',
  '/api/activity',
  '/api/communication/contacts',
  '/api/communication/conversations',
  '/api/communication/drafts',
  '/api/communication/intents',
  '/api/communication/messages',
  '/api/conversation',
  '/api/sofia/memory',
  '/api/sophia/system/action',
  '/api/auth/ws-ticket',
];

function isExecutiveApiRoute(pathname: string): boolean {
  return EXECUTIVE_API_PATTERNS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const pathname = req.path.startsWith('/api') ? req.path : `/api${req.path}`;
  const cronSecret = process.env.CRON_TRIGGER_SECRET;
  const presentedCronSecret = req.headers['x-cron-secret'] as string | undefined;

  const isCronHeartbeat =
    pathname === '/api/workflow/scheduling' &&
    req.method === 'POST' &&
    !!cronSecret &&
    !!presentedCronSecret &&
    presentedCronSecret === cronSecret;

  const policy = isCronHeartbeat
    ? RATE_LIMIT_POLICIES.CRON_MACHINE
    : isExecutiveApiRoute(pathname)
    ? RATE_LIMIT_POLICIES.EXECUTIVE_API
    : RATE_LIMIT_POLICIES.STANDARD_API;

  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const clientKey = isCronHeartbeat
    ? 'machine:cron:heartbeat'
    : `${clientIp}:${policy.maxRequests}`;

  const rateLimitResult: RateLimitResult = globalRateLimiter.check(clientKey, policy);

  res.setHeader('RateLimit-Limit', rateLimitResult.limit.toString());
  res.setHeader('RateLimit-Remaining', rateLimitResult.remaining.toString());
  res.setHeader('RateLimit-Reset', rateLimitResult.resetSeconds.toString());

  if (!rateLimitResult.allowed) {
    res.setHeader('Retry-After', rateLimitResult.resetSeconds.toString());
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please retry after the cooldown period.',
      retryAfterSeconds: rateLimitResult.resetSeconds,
    });
    return;
  }

  next();
}
