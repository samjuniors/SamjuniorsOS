/**
 * src/sofia/lib/voice-config.ts — Client configuration resolver for Sophia voice paths.
 * Phase 3 Step 6C: Canonical Gateway Discovery & Fail-Closed Seam.
 *
 * Enforces fail-closed evaluation: invalid or unreachable status responses
 * halt voice initialization and NEVER silently fall back to ungoverned providers.
 */

export type VoiceConfigResolution =
  | {
      mode: 'CANONICAL_GATEWAY';
      liveWsUrl: string;
    }
  | {
      mode: 'VOICE_ONLY_LEGACY';
    }
  | {
      mode: 'VOICE_DISABLED';
      reason: string;
    }
  | {
      mode: 'CONFIG_UNAVAILABLE';
      error: string;
    };

export interface GatewayValidationOptions {
  allowedHosts?: string[];
  currentHostname?: string;
  allowedPorts?: number[];
  allowedPaths?: string[];
  isProduction?: boolean;
}

/**
 * Validates that a WebSocket gateway URL conforms to strict security policies:
 * 1. Protocol: ws:// or wss:// only.
 * 2. Strict production policy: wss:// required in production; ws:// only allowed for local loopback in dev.
 * 3. Query strings and URL fragments strictly forbidden.
 * 4. Embedded credentials (username/password) strictly forbidden.
 * 5. Host allowlist: localhost, 127.0.0.1, [::1], current origin hostname, *.samjuniors.com / *.samjuniors.local, or allowedHosts.
 * 6. Port allowlist: default ports or explicitly allowed gateway ports (3001, 80, 443, 8443).
 * 7. Path allowlist: valid gateway paths (/, /ws, /api/live/ws, /live) with no path traversal.
 */
export function validateGatewayHost(
  url: string,
  options?: GatewayValidationOptions
): { valid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'liveWsUrl must be a non-empty string' };
  }
  const trimmed = url.trim();

  // Reject query strings, fragments, and path traversal upfront
  if (trimmed.includes('?')) {
    return { valid: false, error: 'Query parameters in gateway URL are forbidden' };
  }
  if (trimmed.includes('#')) {
    return { valid: false, error: 'URL fragments in gateway URL are forbidden' };
  }
  if (trimmed.includes('..')) {
    return { valid: false, error: 'Path traversal in gateway URL is forbidden' };
  }

  // Protocol check
  if (!trimmed.startsWith('ws://') && !trimmed.startsWith('wss://')) {
    return { valid: false, error: `Invalid protocol in "${url}". Expected ws:// or wss://.` };
  }

  const isProd =
    options?.isProduction ??
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production');

  if (isProd && !trimmed.startsWith('wss://')) {
    return {
      valid: false,
      error: 'Insecure ws:// protocol is forbidden in production; wss:// is required',
    };
  }

  let parsed: URL;
  try {
    const httpScheme = trimmed.startsWith('wss://') ? 'https://' : 'http://';
    parsed = new URL(httpScheme + trimmed.replace(/^wss?:\/\//, ''));
  } catch (err: any) {
    return { valid: false, error: `Malformed WebSocket URL: ${err.message}` };
  }

  // Reject query string, hash, or credentials parsed from URL
  if (parsed.search) {
    return { valid: false, error: 'Query parameters in gateway URL are forbidden' };
  }
  if (parsed.hash) {
    return { valid: false, error: 'URL fragments in gateway URL are forbidden' };
  }
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Credentials embedded in WebSocket URL are forbidden' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]';

  // Explicit dev policy: ws:// is permitted ONLY for local loopback
  if (trimmed.startsWith('ws://') && !isLocalHost) {
    return {
      valid: false,
      error: `Insecure ws:// protocol is only permitted for local loopback addresses in development. Remote host "${hostname}" requires wss://.`,
    };
  }

  const currentHostname =
    options?.currentHostname ||
    (typeof window !== 'undefined' && window.location ? window.location.hostname.toLowerCase() : 'localhost');

  const trustedHosts = new Set(
    (options?.allowedHosts || [
      'localhost',
      '127.0.0.1',
      '::1',
      '[::1]',
      currentHostname,
    ]).map((h) => h.toLowerCase())
  );

  const isExplicitlyAllowed = trustedHosts.has(hostname);
  const isSamJuniorsDomain =
    hostname === 'samjuniors.com' ||
    hostname.endsWith('.samjuniors.com') ||
    hostname === 'samjuniors.local' ||
    hostname.endsWith('.samjuniors.local');

  if (!isExplicitlyAllowed && !isSamJuniorsDomain) {
    return {
      valid: false,
      error: `Gateway host "${hostname}" is not in the trusted allowlist`,
    };
  }

  // Port validation
  if (parsed.port) {
    const portNum = parseInt(parsed.port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return { valid: false, error: `Invalid port "${parsed.port}" in gateway URL` };
    }
    const allowedPorts = options?.allowedPorts ?? [3001, 80, 443, 8443];
    if (!allowedPorts.includes(portNum)) {
      return { valid: false, error: `Port ${portNum} is not in the allowed gateway ports list` };
    }
  }

  // Path validation
  const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
  if (normalizedPath.includes('..')) {
    return { valid: false, error: 'Path traversal in gateway URL is forbidden' };
  }
  const defaultAllowedPaths = ['/', '/ws', '/api/live/ws', '/live'];
  const allowedPaths = options?.allowedPaths ?? defaultAllowedPaths;
  if (!allowedPaths.includes(normalizedPath)) {
    return { valid: false, error: `Path "${normalizedPath}" is not in the allowed gateway path list` };
  }

  return { valid: true };
}

/**
 * Pure evaluator for the server's status payload.
 * Validates fields deterministically; any missing, errored, or malformed
 * configuration fails closed to CONFIG_UNAVAILABLE or VOICE_DISABLED.
 */
export function resolveVoiceConfig(
  statusPayload: unknown,
  options?: GatewayValidationOptions
): VoiceConfigResolution {
  if (!statusPayload || typeof statusPayload !== 'object') {
    return {
      mode: 'CONFIG_UNAVAILABLE',
      error: 'Missing or non-object status payload from server',
    };
  }

  const s = statusPayload as Record<string, unknown>;

  // Check if server returned an error (e.g. 401/500 JSON error response)
  if (typeof s.error === 'string') {
    return {
      mode: 'CONFIG_UNAVAILABLE',
      error: `Server status error: ${s.error}`,
    };
  }

  // Strict boolean evaluation (never truthy coercion)
  const voiceGateway = s.voiceGateway === true;
  const legacyAllowed = s.legacyVoiceAllowed === true;

  if (voiceGateway) {
    const liveWsUrl = typeof s.liveWsUrl === 'string' ? s.liveWsUrl.trim() : '';
    const hostCheck = validateGatewayHost(liveWsUrl, options);
    if (!hostCheck.valid) {
      return {
        mode: 'CONFIG_UNAVAILABLE',
        error: hostCheck.error || `Invalid liveWsUrl provided by server: "${liveWsUrl}".`,
      };
    }
    return {
      mode: 'CANONICAL_GATEWAY',
      liveWsUrl,
    };
  }

  // Gateway is disabled / 0 / unset
  if (legacyAllowed) {
    return {
      mode: 'VOICE_ONLY_LEGACY',
    };
  }

  return {
    mode: 'VOICE_DISABLED',
    reason:
      'Canonical voice gateway is not enabled (SAMJUNIORS_VOICE_GATEWAY=1 required), and ungoverned legacy voice is disabled.',
  };
}

/**
 * Fetches the authoritative status payload and resolves the voice configuration.
 * Network errors and non-200 responses fail closed to CONFIG_UNAVAILABLE.
 */
export async function fetchVoiceConfig(
  fetchFn: typeof fetch = fetch,
  options?: GatewayValidationOptions
): Promise<VoiceConfigResolution> {
  try {
    const res = await fetchFn('/api/sophia/status', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        mode: 'CONFIG_UNAVAILABLE',
        error:
          (errBody as { error?: string }).error ||
          `HTTP ${res.status} from status endpoint`,
      };
    }
    const data = await res.json();
    return resolveVoiceConfig(data, options);
  } catch (err: any) {
    return {
      mode: 'CONFIG_UNAVAILABLE',
      error: err?.message || 'Network error fetching voice status',
    };
  }
}
