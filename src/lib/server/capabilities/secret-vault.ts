/**
 * SamJuniorsOS — Capability Secret Vault & Redactor (Gate G14.5)
 *
 * Implements:
 * 1. Least-privilege secret storage with per-tool access control.
 * 2. Cross-tool secret isolation: A tool cannot access secrets provisioned to another tool.
 * 3. Call-time injection: Secrets are injected by the server at invocation time.
 * 4. Deep recursive redaction: Secrets are NEVER exposed to the model, caller, or logs.
 */

import {
  SecretVaultEntry,
  SecretVaultEntrySchema,
  SecretAccessDeniedError,
  SecretNotFoundError,
} from '@/types/sandbox';

export class CapabilitySecretVault {
  private static instance: CapabilitySecretVault | null = null;
  private entries: Map<string, SecretVaultEntry> = new Map();

  private constructor() {
    this.seedDefaultSecrets();
  }

  public static getInstance(): CapabilitySecretVault {
    if (!CapabilitySecretVault.instance) {
      CapabilitySecretVault.instance = new CapabilitySecretVault();
    }
    return CapabilitySecretVault.instance;
  }

  /**
   * Resets the vault (primarily for testing).
   */
  public reset(): void {
    this.entries.clear();
    this.seedDefaultSecrets();
  }

  /**
   * Registers or updates a secret with explicit capability allowlist.
   */
  public registerSecret(params: {
    name: string;
    value: string;
    allowedCapabilityIds: string[];
    description?: string;
  }): SecretVaultEntry {
    const entry = SecretVaultEntrySchema.parse({
      ...params,
      createdAt: new Date().toISOString(),
    });

    this.entries.set(entry.name, entry);
    return entry;
  }

  /**
   * Retrieves a secret for a specific capability, enforcing least-privilege scoping.
   * Throws SecretNotFoundError if secret is not configured.
   * Throws SecretAccessDeniedError if the capability is not on the secret's allowlist.
   */
  public getSecret(capabilityId: string, secretName: string): string {
    const entry = this.entries.get(secretName);
    if (!entry) {
      throw new SecretNotFoundError(capabilityId, secretName);
    }

    const isAllowed =
      entry.allowedCapabilityIds.includes(capabilityId) ||
      entry.allowedCapabilityIds.includes('*');

    if (!isAllowed) {
      throw new SecretAccessDeniedError(capabilityId, secretName);
    }

    return entry.value;
  }

  /**
   * Resolves and returns all requested secrets for a given capability.
   * Fails closed if any requested secret is unauthorized or missing.
   */
  public getSecretsForCapability(
    capabilityId: string,
    secretRefs: string[] = []
  ): Record<string, string> {
    const resolved: Record<string, string> = {};

    for (const ref of secretRefs) {
      resolved[ref] = this.getSecret(capabilityId, ref);
    }

    return resolved;
  }

  /**
   * Returns all stored secret values (for global redaction).
   */
  public getAllSecretValues(): Array<{ name: string; value: string }> {
    const result: Array<{ name: string; value: string }> = [];
    for (const entry of this.entries.values()) {
      if (entry.value && entry.value.length > 0) {
        result.push({ name: entry.name, value: entry.value });
      }
    }
    return result;
  }

  /**
   * Optional default seeding from process environment.
   */
  private seedDefaultSecrets(): void {
    // Note: Core tools can have designated secrets mapped from environment if present
    if (process.env.GITHUB_TOKEN) {
      this.registerSecret({
        name: 'GITHUB_TOKEN',
        value: process.env.GITHUB_TOKEN,
        allowedCapabilityIds: [
          'tool:github:read',
          'tool:github:read_issue',
          'tool:github:create_issue',
          'tool:github:repository_read',
          'tool:github:issues_read',
        ],
        description: 'GitHub integration token',
      });
    }

    if (process.env.RESEND_API_KEY) {
      this.registerSecret({
        name: 'RESEND_API_KEY',
        value: process.env.RESEND_API_KEY,
        allowedCapabilityIds: ['tool:resend:send_email'],
        description: 'Resend email API key',
      });
    }

    if (process.env.STRIPE_SECRET_KEY) {
      this.registerSecret({
        name: 'STRIPE_SECRET_KEY',
        value: process.env.STRIPE_SECRET_KEY,
        allowedCapabilityIds: ['tool:stripe:create_payment_intent'],
        description: 'Stripe secret key',
      });
    }
  }
}

/**
 * SecretRedactor — scrubs all known secret values from arbitrary objects,
 * strings, arrays, or error messages.
 */
export class SecretRedactor {
  /**
   * Recursively redacts secrets from any data structure.
   */
  public static redact<T = any>(
    target: T,
    specificSecrets?: Array<{ name: string; value: string }>
  ): T {
    if (target === null || target === undefined) {
      return target;
    }

    const secrets =
      specificSecrets && specificSecrets.length > 0
        ? specificSecrets
        : CapabilitySecretVault.getInstance().getAllSecretValues();

    if (secrets.length === 0) {
      return target;
    }

    const seen = new WeakSet<object>();

    const redactString = (str: string): string => {
      let result = str;
      for (const { name, value } of secrets) {
        if (!value || value.length < 4) continue;
        // Escape special regex characters in the secret value
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'g');
        result = result.replace(regex, `[REDACTED_SECRET:${name}]`);
      }
      return result;
    };

    const redactRecursive = (val: any): any => {
      if (typeof val === 'string') {
        return redactString(val);
      }

      if (typeof val !== 'object' || val === null) {
        return val;
      }

      // Handle Error objects
      if (val instanceof Error) {
        const redactedErr = new Error(redactString(val.message));
        redactedErr.name = val.name;
        if (val.stack) {
          redactedErr.stack = redactString(val.stack);
        }
        return redactedErr;
      }

      // Prevent cycles
      if (seen.has(val)) {
        return val;
      }
      seen.add(val);

      if (Array.isArray(val)) {
        return val.map((item) => redactRecursive(item));
      }

      const copy: Record<string, any> = {};
      for (const [key, propVal] of Object.entries(val)) {
        copy[key] = redactRecursive(propVal);
      }
      return copy;
    };

    return redactRecursive(target);
  }
}
