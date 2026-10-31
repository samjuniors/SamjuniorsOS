/**
 * SamJuniorsOS — Capability Sandbox & Egress Control Types (Gate G14.5)
 *
 * Invariants:
 * 1. Least privilege: Tools have NO ambient network access. Egress is strictly
 *    limited to explicitly allowlisted hosts declared in manifest permissions.
 * 2. Cross-tool secret isolation: A tool can ONLY access secrets explicitly provisioned
 *    for its capability ID. Reading another tool's secret is strictly forbidden.
 * 3. Zero model exposure: Secrets are injected server-side at call time and never
 *    passed in model prompts, conversation turns, or logged in plaintext.
 */

import { z } from 'zod';

// ----------------------------------------------------------------------------
// 1. DOMAIN ERRORS
// ----------------------------------------------------------------------------

export class NetworkEgressViolationError extends Error {
  public readonly capabilityId: string;
  public readonly targetHost: string;
  public readonly allowedHosts: string[];

  constructor(capabilityId: string, targetHost: string, allowedHosts: string[] = []) {
    super(
      `Network egress violation: Capability "${capabilityId}" attempted to access unauthorized host "${targetHost}". ` +
      `Allowed outbound hosts: [${allowedHosts.length > 0 ? allowedHosts.join(', ') : 'none'}]`
    );
    this.name = 'NetworkEgressViolationError';
    this.capabilityId = capabilityId;
    this.targetHost = targetHost;
    this.allowedHosts = allowedHosts;
  }
}

export class SSRFViolationError extends Error {
  public readonly capabilityId: string;
  public readonly targetHost: string;
  public readonly reason: string;

  constructor(capabilityId: string, targetHost: string, reason: string) {
    super(
      `SSRF violation: Capability "${capabilityId}" attempted to access forbidden internal/private target "${targetHost}". ` +
      `Reason: ${reason}`
    );
    this.name = 'SSRFViolationError';
    this.capabilityId = capabilityId;
    this.targetHost = targetHost;
    this.reason = reason;
  }
}

export class SecretAccessDeniedError extends Error {
  public readonly capabilityId: string;
  public readonly secretName: string;

  constructor(capabilityId: string, secretName: string) {
    super(
      `Secret access denied: Capability "${capabilityId}" is not authorized to access secret "${secretName}". ` +
      `Cross-tool secret reading is strictly prohibited.`
    );
    this.name = 'SecretAccessDeniedError';
    this.capabilityId = capabilityId;
    this.secretName = secretName;
  }
}

export class SecretNotFoundError extends Error {
  public readonly capabilityId: string;
  public readonly secretName: string;

  constructor(capabilityId: string, secretName: string) {
    super(
      `Secret not found: Capability "${capabilityId}" requested secret "${secretName}", but it is not configured in the vault.`
    );
    this.name = 'SecretNotFoundError';
    this.capabilityId = capabilityId;
    this.secretName = secretName;
  }
}

// ----------------------------------------------------------------------------
// 2. EGRESS ALLOWLIST & RULES
// ----------------------------------------------------------------------------

export interface EgressRule {
  host: string;
  port?: number;
  wildcard: boolean;
}

export interface EgressEvaluationResult {
  allowed: boolean;
  host: string;
  port?: number;
  reason?: string;
  isSSRFBlocked?: boolean;
}

// ----------------------------------------------------------------------------
// 3. SECRET VAULT ENTRY
// ----------------------------------------------------------------------------

export const SecretVaultEntrySchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  allowedCapabilityIds: z.array(z.string()).min(1),
  description: z.string().optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
});

export type SecretVaultEntry = z.infer<typeof SecretVaultEntrySchema>;

// ----------------------------------------------------------------------------
// 4. CAPABILITY SANDBOX CONTEXT
// ----------------------------------------------------------------------------

export type SandboxedFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface CapabilitySandbox {
  capabilityId: string;
  allowedHosts: string[];
  secrets: Readonly<Record<string, string>>;
  getSecret: (name: string) => string;
  isEgressAllowed: (url: string | URL) => EgressEvaluationResult;
  fetch: SandboxedFetch;
}
