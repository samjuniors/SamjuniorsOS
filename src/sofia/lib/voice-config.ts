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

/**
 * Validates that a WebSocket gateway URL conforms to trusted host policies:
 * - Protocols: ws:// or wss:// only
 * - No credentials embedded in URL
 * - Hosts: localhost, 127.0.0.1, [::1], current origin hostname, or *.samjuniors.com / *.samjuniors.local
 */
export function validateGatewayHost(
  url: string,
  options?: { allowedHosts?: string[]; currentHostname?: string }
): { valid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'liveWsUrl must be a non-empty string' };
  }
  const trimmed = url.trim();
  if (!trimmed.startsWith('ws://') && !trimmed.startsWith('wss://')) {
    return { valid: false, error: `Invalid protocol in "${url}". Expected ws:// or wss://.` };
  }

  let parsed: URL;
  try {
    const httpScheme = trimmed.startsWith('wss://') ? 'https://' : 'http://';
    parsed = new URL(httpScheme + trimmed.replace(/^wss?:\/\//, ''));
  } catch (err: any) {
    return { valid: false, error: `Malformed WebSocket URL: ${err.message}` };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Credentials embedded in WebSocket URL are forbidden' };
  }

  const hostname = parsed.hostname.toLowerCase();
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

  return { valid: true };
}

/**
 * Pure evaluator for the server's status payload.
 * Validates fields deterministically; any missing, errored, or malformed
 * configuration fails closed to CONFIG_UNAVAILABLE or VOICE_DISABLED.
 */
export function resolveVoiceConfig(
  statusPayload: unknown,
  options?: { allowedHosts?: string[]; currentHostname?: string }
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
  fetchFn: typeof fetch = fetch
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
    return resolveVoiceConfig(data);
  } catch (err: any) {
    return {
      mode: 'CONFIG_UNAVAILABLE',
      error: err?.message || 'Network error fetching voice status',
    };
  }
}
