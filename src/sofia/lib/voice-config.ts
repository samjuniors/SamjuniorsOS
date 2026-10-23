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
      deepgramConfigured: boolean;
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
  trustCurrentOrigin?: boolean;
  currentHostname?: string;
  allowedPorts?: number[];
  allowedPaths?: string[];
  isProduction?: boolean;
}

/**
 * Validates that a WebSocket gateway URL conforms to strict security policies:
 * 1. Protocol: ws: or wss: only (parsed directly via WHATWG URL).
 * 2. Authoritative production detection: test options cannot weaken a production environment.
 * 3. Query strings, fragments, and credentials strictly forbidden.
 * 4. Restrictive host policy: a supplied allowedHosts strictly replaces defaults.
 * 5. Default host policy: local loopback and *.samjuniors.com / *.samjuniors.local.
 *    Current origin hostname is trusted ONLY if trustCurrentOrigin is explicitly authorized.
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

  // Parse directly using WHATWG URL without artificial HTTP conversion
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err: any) {
    return { valid: false, error: `Malformed WebSocket URL: ${err.message}` };
  }

  // Validate actual protocol
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    return {
      valid: false,
      error: `Invalid protocol in "${url}". Expected ws:// or wss://.`,
    };
  }

  // Authoritative production detection: options cannot weaken process.env.NODE_ENV === 'production'
  const envIsProd =
    typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
  const isProd = envIsProd || options?.isProduction === true;

  if (isProd && parsed.protocol !== 'wss:') {
    return {
      valid: false,
      error: 'Insecure ws:// protocol is forbidden in production; wss:// is required',
    };
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
  if (!hostname) {
    return { valid: false, error: 'Empty or missing hostname in WebSocket URL' };
  }

  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]';

  // Explicit dev policy: ws: is permitted ONLY for local loopback
  if (parsed.protocol === 'ws:' && !isLocalHost) {
    return {
      valid: false,
      error: `Insecure ws:// protocol is only permitted for local loopback addresses in development. Remote host "${hostname}" requires wss://.`,
    };
  }

  // Host allowlist policy:
  // If allowedHosts is supplied, it strictly REPLACES the default policy.
  if (options?.allowedHosts) {
    const explicitAllowlist = new Set(options.allowedHosts.map((h) => h.toLowerCase()));
    if (!explicitAllowlist.has(hostname)) {
      return {
        valid: false,
        error: `Gateway host "${hostname}" is not in the restrictive allowedHosts list`,
      };
    }
  } else {
    // Default host policy: local loopback, company domains, or authorized origin
    const isSamJuniorsDomain =
      hostname === 'samjuniors.com' ||
      hostname.endsWith('.samjuniors.com') ||
      hostname === 'samjuniors.local' ||
      hostname.endsWith('.samjuniors.local');

    let isAuthorizedOrigin = false;
    if (options?.trustCurrentOrigin) {
      const current = (
        options?.currentHostname ||
        (typeof window !== 'undefined' && window.location ? window.location.hostname : '')
      )?.toLowerCase();
      if (current && hostname === current) {
        isAuthorizedOrigin = true;
      }
    }

    if (!isLocalHost && !isSamJuniorsDomain && !isAuthorizedOrigin) {
      return {
        valid: false,
        error: `Gateway host "${hostname}" is not in the trusted allowlist`,
      };
    }
  }

  // Port validation
  if (parsed.port) {
    const portNum = parseInt(parsed.port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return { valid: false, error: `Invalid port "${parsed.port}" in gateway URL` };
    }
    const allowedPorts = options?.allowedPorts ?? [3000, 3001, 80, 443, 8443];
    if (!allowedPorts.includes(portNum)) {
      return { valid: false, error: `Port ${portNum} is not in the allowed gateway ports list` };
    }
  }

  // Path validation
  const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
  if (normalizedPath.includes('..')) {
    return { valid: false, error: 'Path traversal in gateway URL is forbidden' };
  }
  const defaultAllowedPaths = ['/', '/ws', '/api/live/ws', '/api/live-ws', '/live'];
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
      deepgramConfigured: s.deepgram === true,
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
  options?: GatewayValidationOptions,
  timeoutMs = 5000,
): Promise<VoiceConfigResolution> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const request = (async (): Promise<VoiceConfigResolution> => {
      const res = await fetchFn('/api/sophia/status', {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
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
    })();

    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`Voice status request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } catch (err: any) {
    return {
      mode: 'CONFIG_UNAVAILABLE',
      error: err?.message || 'Network error fetching voice status',
    };
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}
