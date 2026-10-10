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
 * Pure evaluator for the server's status payload.
 * Validates fields deterministically; any missing, errored, or malformed
 * configuration fails closed to CONFIG_UNAVAILABLE or VOICE_DISABLED.
 */
export function resolveVoiceConfig(statusPayload: unknown): VoiceConfigResolution {
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
    if (!liveWsUrl.startsWith('ws://') && !liveWsUrl.startsWith('wss://')) {
      return {
        mode: 'CONFIG_UNAVAILABLE',
        error: `Invalid liveWsUrl provided by server: "${liveWsUrl}". Expected ws:// or wss:// URL.`,
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
