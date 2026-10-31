/**
 * SamJuniorsOS — Capability Sandbox Egress Guard (Gate G14.5)
 *
 * Implements:
 * 1. Least-privilege network egress: Outbound requests are strictly limited
 *    to hosts explicitly allowlisted in manifest permissions (net:outbound:<host>).
 * 2. SSRF defense: Blocks private RFC 1918 networks, loopback (127.0.0.1, localhost),
 *    link-local/cloud metadata (169.254.169.254), and local network domains.
 * 3. Sandboxed fetch dispatcher: Provided to tool execution contexts to enforce
 *    egress rules at the network boundary.
 */

import { isIP } from 'node:net';
import { blockedAddress } from '@/lib/server/net';
import {
  EgressRule,
  EgressEvaluationResult,
  NetworkEgressViolationError,
  SSRFViolationError,
  SandboxedFetch,
  CapabilitySandbox,
  SecretAccessDeniedError,
} from '@/types/sandbox';
import { CapabilityManifest } from '@/types/capability';

const BLOCKED_HOSTNAME_REGEX = /(^|\.)(localhost|local|internal|intranet|home\.arpa)$/i;

/**
 * Extracts and parses outbound network rules from capability permissions.
 */
export function parseEgressRules(permissions: string[] = []): {
  rules: EgressRule[];
  allowedHosts: string[];
} {
  const rules: EgressRule[] = [];
  const allowedHosts: string[] = [];

  for (const perm of permissions) {
    const match = /^net:outbound:(.+)$/i.exec(perm.trim());
    if (!match) continue;

    const rawTarget = match[1].toLowerCase();
    let host = rawTarget;
    let port: number | undefined;

    if (rawTarget.includes(':')) {
      const parts = rawTarget.split(':');
      host = parts[0];
      const parsedPort = parseInt(parts[1], 10);
      if (!isNaN(parsedPort)) {
        port = parsedPort;
      }
    }

    const wildcard = host.startsWith('*.');
    rules.push({ host, port, wildcard });
    allowedHosts.push(rawTarget);
  }

  return { rules, allowedHosts };
}

/**
 * Evaluates whether a given URL destination is permitted under the egress rules and SSRF guards.
 */
export function evaluateEgress(
  destination: string | URL,
  rules: EgressRule[]
): EgressEvaluationResult {
  let parsedUrl: URL;
  try {
    parsedUrl = typeof destination === 'string' ? new URL(destination) : destination;
  } catch (err: any) {
    return {
      allowed: false,
      host: String(destination),
      reason: `Malformed or invalid destination URL: ${err?.message}`,
    };
  }

  // 1. Protocol check: only http and https allowed
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      allowed: false,
      host: parsedUrl.hostname,
      reason: `Forbidden protocol "${parsedUrl.protocol}". Only "http:" and "https:" are permitted for network egress.`,
    };
  }

  const rawHostname = parsedUrl.hostname.toLowerCase();
  const hostname = rawHostname.replace(/^\[|\]$/g, '');
  const port = parsedUrl.port
    ? parseInt(parsedUrl.port, 10)
    : parsedUrl.protocol === 'https:'
    ? 443
    : 80;

  // 2. SSRF Check: Hostname matching localhost/local domains
  if (BLOCKED_HOSTNAME_REGEX.test(hostname)) {
    return {
      allowed: false,
      host: hostname,
      port,
      isSSRFBlocked: true,
      reason: `SSRF Blocked: Host "${hostname}" resolves to a forbidden local/private domain.`,
    };
  }

  // 3. SSRF Check: Direct IP checks (loopback, private subnets, cloud metadata)
  if (isIP(hostname) !== 0 && blockedAddress(hostname)) {
    return {
      allowed: false,
      host: hostname,
      port,
      isSSRFBlocked: true,
      reason: `SSRF Blocked: Address "${hostname}" is a forbidden private, loopback, or cloud metadata address.`,
    };
  }

  // 4. Outbound Allowlist Evaluation
  if (rules.length === 0) {
    return {
      allowed: false,
      host: hostname,
      port,
      reason: 'Capability does not have any outbound network permissions (net:outbound:*) declared.',
    };
  }

  for (const rule of rules) {
    let hostMatch = false;

    if (rule.wildcard) {
      const suffix = rule.host.slice(2); // remove '*.'
      hostMatch = hostname.endsWith('.' + suffix) || hostname === suffix;
    } else {
      hostMatch = hostname === rule.host;
    }

    if (hostMatch) {
      if (rule.port === undefined || rule.port === port) {
        return {
          allowed: true,
          host: hostname,
          port,
        };
      }
    }
  }

  return {
    allowed: false,
    host: hostname,
    port,
    reason: `Host "${hostname}" is not in the capability's declared network allowlist.`,
  };
}

/**
 * Creates a sandboxed fetch function enforcing the capability's network egress boundary.
 */
export function createSandboxedFetch(
  capabilityId: string,
  allowedHosts: string[],
  rules: EgressRule[],
  customDispatcher?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
): SandboxedFetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let urlString: string;
    if (typeof input === 'string') {
      urlString = input;
    } else if (input instanceof URL) {
      urlString = input.toString();
    } else if ('url' in input) {
      urlString = input.url;
    } else {
      urlString = String(input);
    }

    const evaluation = evaluateEgress(urlString, rules);

    if (!evaluation.allowed) {
      if (evaluation.isSSRFBlocked) {
        throw new SSRFViolationError(
          capabilityId,
          evaluation.host,
          evaluation.reason || 'Private/internal network access prohibited'
        );
      }
      throw new NetworkEgressViolationError(
        capabilityId,
        evaluation.host,
        allowedHosts
      );
    }

    if (customDispatcher) {
      return customDispatcher(input, init);
    }

    return fetch(input, init);
  };
}

/**
 * Builds a complete CapabilitySandbox for runtime execution.
 */
export function createCapabilitySandbox(params: {
  manifest: CapabilityManifest;
  secrets: Record<string, string>;
  customFetchDispatcher?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}): CapabilitySandbox {
  const { manifest, secrets, customFetchDispatcher } = params;
  const { rules, allowedHosts } = parseEgressRules(manifest.permissions);

  const sandboxedFetch = createSandboxedFetch(
    manifest.id,
    allowedHosts,
    rules,
    customFetchDispatcher
  );

  return {
    capabilityId: manifest.id,
    allowedHosts,
    secrets: Object.freeze({ ...secrets }),
    getSecret: (name: string): string => {
      if (!(name in secrets)) {
        throw new SecretAccessDeniedError(manifest.id, name);
      }
      return secrets[name];
    },
    isEgressAllowed: (url: string | URL): EgressEvaluationResult => {
      return evaluateEgress(url, rules);
    },
    fetch: sandboxedFetch,
  };
}
