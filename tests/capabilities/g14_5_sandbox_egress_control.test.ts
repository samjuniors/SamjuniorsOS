/**
 * SamJuniorsOS — Gate G14.5 Automated Test Suite
 *
 * Sandbox and egress control: least-privilege tools, network allowlists,
 * secrets injected at call time and never shown to the model.
 *
 * Exit evidence required:
 * Test shows a tool cannot reach a non-allowlisted host or read another tool's secret.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CapabilityRegistry } from '@/lib/server/capabilities/capability-registry';
import { CapabilityGateway } from '@/lib/server/capabilities/capability-gateway';
import { CapabilitySecretVault, SecretRedactor } from '@/lib/server/capabilities/secret-vault';
import {
  evaluateEgress,
  parseEgressRules,
  createCapabilitySandbox,
} from '@/lib/server/capabilities/sandbox-egress';
import {
  NetworkEgressViolationError,
  SSRFViolationError,
  SecretAccessDeniedError,
  SecretNotFoundError,
} from '@/types/sandbox';
import { CapabilityManifest } from '@/types/capability';
import { InMemoryAuditStore } from '@/lib/server/authorization/approval-store';

describe('Gate G14.5 — Sandbox and Egress Control', () => {
  const registry = CapabilityRegistry.getInstance();
  const vault = CapabilitySecretVault.getInstance();

  beforeEach(() => {
    registry.reset();
    vault.reset();
    CapabilityGateway.setCustomFetchDispatcher(null);
  });

  afterEach(() => {
    CapabilityGateway.setCustomFetchDispatcher(null);
  });

  describe('1. Network Egress Control & Outbound Allowlists (Least Privilege)', () => {
    it('parses egress rules from permissions correctly', () => {
      const permissions = [
        'net:outbound:api.github.com',
        'net:outbound:api.stripe.com:443',
        'net:outbound:*.subdomain.com',
        'fs:read', // non-network permission
      ];

      const { rules, allowedHosts } = parseEgressRules(permissions);
      expect(rules).toHaveLength(3);
      expect(allowedHosts).toEqual([
        'api.github.com',
        'api.stripe.com:443',
        '*.subdomain.com',
      ]);
      expect(rules[0]).toEqual({ host: 'api.github.com', port: undefined, wildcard: false });
      expect(rules[1]).toEqual({ host: 'api.stripe.com', port: 443, wildcard: false });
      expect(rules[2]).toEqual({ host: '*.subdomain.com', port: undefined, wildcard: true });
    });

    it('blocks network egress when capability has no outbound permissions', async () => {
      const manifest: CapabilityManifest = {
        id: 'tool:local:calculator',
        name: 'Local Calculator',
        description: 'Performs local calculations with zero network access',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'read_only',
        permissions: [], // no net:outbound:*
        secretRefs: [],
        cost: { perCallCents: 0, currency: 'USD' },
        entrypoint: { type: 'internal_function', target: 'calc' },
      };

      registry.register(manifest, async (_params, { sandbox }) => {
        // Attempting to fetch anything should fail
        return await sandbox!.fetch('https://api.github.com/users');
      });

      const result = await CapabilityGateway.invoke({
        capabilityId: 'tool:local:calculator',
        callerAgentId: 'dr_aris_thorne',
        parameters: {},
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.error).toContain('Network egress violation');
      expect(result.error).toContain('api.github.com');
      expect(result.error).toContain('Allowed outbound hosts: [none]');
    });

    it('allows egress to explicitly allowlisted host and blocks non-allowlisted host', async () => {
      const manifest: CapabilityManifest = {
        id: 'tool:github:fetcher',
        name: 'GitHub Fetcher',
        description: 'Fetches public GitHub data',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'read_only',
        permissions: ['net:outbound:api.github.com'],
        secretRefs: [],
        cost: { perCallCents: 0, currency: 'USD' },
        entrypoint: { type: 'internal_function', target: 'fetch' },
      };

      // Mock fetch dispatcher to verify network dispatch without live IO
      let dispatchedUrl = '';
      CapabilityGateway.setCustomFetchDispatcher(async (input) => {
        dispatchedUrl = String(input);
        return new Response(JSON.stringify({ login: 'octocat' }), { status: 200 });
      });

      registry.register(manifest, async (params, { sandbox }) => {
        const targetUrl = params.targetUrl as string;
        const res = await sandbox!.fetch(targetUrl);
        return await res.json();
      });

      // 1. Calling allowlisted host succeeds
      const successResult = await CapabilityGateway.invoke({
        capabilityId: 'tool:github:fetcher',
        callerAgentId: 'dr_aris_thorne',
        parameters: { targetUrl: 'https://api.github.com/users/octocat' },
      });

      expect(successResult.success).toBe(true);
      expect(successResult.status).toBe('executed');
      expect(successResult.data).toEqual({ login: 'octocat' });
      expect(dispatchedUrl).toBe('https://api.github.com/users/octocat');

      // 2. Calling non-allowlisted host fails closed
      const blockedResult = await CapabilityGateway.invoke({
        capabilityId: 'tool:github:fetcher',
        callerAgentId: 'dr_aris_thorne',
        parameters: { targetUrl: 'https://api.stripe.com/v1/charges' },
      });

      expect(blockedResult.success).toBe(false);
      expect(blockedResult.status).toBe('error');
      expect(blockedResult.error).toContain('Network egress violation');
      expect(blockedResult.error).toContain('api.stripe.com');
      expect(blockedResult.error).toContain('Allowed outbound hosts: [api.github.com]');
    });

    it('correctly handles subdomain wildcards (*.domain.com)', () => {
      const { rules } = parseEgressRules(['net:outbound:*.company.com']);

      const sub1 = evaluateEgress('https://api.company.com/v1', rules);
      expect(sub1.allowed).toBe(true);

      const sub2 = evaluateEgress('https://deep.sub.company.com/resource', rules);
      expect(sub2.allowed).toBe(true);

      const apex = evaluateEgress('https://company.com/about', rules);
      expect(apex.allowed).toBe(true);

      const attacker = evaluateEgress('https://evil-company.com/steal', rules);
      expect(attacker.allowed).toBe(false);

      const unrelated = evaluateEgress('https://other.org', rules);
      expect(unrelated.allowed).toBe(false);
    });

    it('rejects forbidden protocols (file:, gopher:, ftp:)', () => {
      const { rules } = parseEgressRules(['net:outbound:api.github.com']);

      const fileResult = evaluateEgress('file:///etc/passwd', rules);
      expect(fileResult.allowed).toBe(false);
      expect(fileResult.reason).toContain('Forbidden protocol "file:"');

      const ftpResult = evaluateEgress('ftp://ftp.example.com', rules);
      expect(ftpResult.allowed).toBe(false);
      expect(ftpResult.reason).toContain('Forbidden protocol "ftp:"');
    });
  });

  describe('2. SSRF & Private Network Egress Defense', () => {
    it('blocks requests to loopback addresses (localhost, 127.0.0.1)', async () => {
      const manifest: CapabilityManifest = {
        id: 'tool:ssrf:probe',
        name: 'SSRF Probe Tool',
        description: 'Attempts to probe internal network',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'read_only',
        permissions: ['net:outbound:localhost', 'net:outbound:127.0.0.1'], // even if manifest includes them
        secretRefs: [],
        cost: { perCallCents: 0, currency: 'USD' },
        entrypoint: { type: 'internal_function', target: 'probe' },
      };

      registry.register(manifest, async (params, { sandbox }) => {
        return await sandbox!.fetch(params.url);
      });

      // 1. Test localhost
      const resLocalhost = await CapabilityGateway.invoke({
        capabilityId: 'tool:ssrf:probe',
        callerAgentId: 'dr_aris_thorne',
        parameters: { url: 'http://localhost:3000/internal' },
      });

      expect(resLocalhost.success).toBe(false);
      expect(resLocalhost.status).toBe('error');
      expect(resLocalhost.error).toContain('SSRF violation');
      expect(resLocalhost.error).toContain('forbidden local/private domain');

      // 2. Test 127.0.0.1
      const resIp = await CapabilityGateway.invoke({
        capabilityId: 'tool:ssrf:probe',
        callerAgentId: 'dr_aris_thorne',
        parameters: { url: 'http://127.0.0.1:8080/admin' },
      });

      expect(resIp.success).toBe(false);
      expect(resIp.status).toBe('error');
      expect(resIp.error).toContain('SSRF violation');
      expect(resIp.error).toContain('forbidden private, loopback, or cloud metadata address');
    });

    it('blocks requests to cloud metadata endpoint (169.254.169.254)', async () => {
      const manifest: CapabilityManifest = {
        id: 'tool:cloud:meta_probe',
        name: 'Cloud Metadata Probe',
        description: 'Attempts to steal AWS/GCP instance credentials',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'read_only',
        permissions: ['net:outbound:169.254.169.254'],
        secretRefs: [],
        cost: { perCallCents: 0, currency: 'USD' },
        entrypoint: { type: 'internal_function', target: 'probe' },
      };

      registry.register(manifest, async (_params, { sandbox }) => {
        return await sandbox!.fetch('http://169.254.169.254/latest/meta-data/');
      });

      const res = await CapabilityGateway.invoke({
        capabilityId: 'tool:cloud:meta_probe',
        callerAgentId: 'dr_aris_thorne',
        parameters: {},
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('error');
      expect(res.error).toContain('SSRF violation');
      expect(res.error).toContain('169.254.169.254');
    });

    it('blocks requests to RFC 1918 private subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
      const { rules } = parseEgressRules(['net:outbound:10.0.0.5', 'net:outbound:192.168.1.1']);

      const priv1 = evaluateEgress('http://10.0.0.5:8080/status', rules);
      expect(priv1.allowed).toBe(false);
      expect(priv1.isSSRFBlocked).toBe(true);

      const priv2 = evaluateEgress('http://192.168.1.1/router', rules);
      expect(priv2.allowed).toBe(false);
      expect(priv2.isSSRFBlocked).toBe(true);

      const priv3 = evaluateEgress('http://172.16.0.5/api', rules);
      expect(priv3.allowed).toBe(false);
      expect(priv3.isSSRFBlocked).toBe(true);
    });
  });

  describe('3. Call-Time Secret Injection & Cross-Tool Isolation (Least Privilege)', () => {
    it('provisions secrets strictly to authorized capability IDs', () => {
      vault.registerSecret({
        name: 'GITHUB_ACCESS_TOKEN',
        value: 'ghp_live_token_abc123',
        allowedCapabilityIds: ['tool:github:reader'],
        description: 'GitHub token for repo reader',
      });

      vault.registerSecret({
        name: 'STRIPE_SECRET_KEY',
        value: 'sk_live_stripe_xyz789',
        allowedCapabilityIds: ['tool:stripe:charger'],
        description: 'Stripe live key',
      });

      // 1. GitHub tool CAN read GitHub token
      const ghToken = vault.getSecret('tool:github:reader', 'GITHUB_ACCESS_TOKEN');
      expect(ghToken).toBe('ghp_live_token_abc123');

      // 2. GitHub tool CANNOT read Stripe key -> SecretAccessDeniedError
      expect(() => {
        vault.getSecret('tool:github:reader', 'STRIPE_SECRET_KEY');
      }).toThrow(SecretAccessDeniedError);

      // 3. Stripe tool CAN read Stripe key
      const stripeKey = vault.getSecret('tool:stripe:charger', 'STRIPE_SECRET_KEY');
      expect(stripeKey).toBe('sk_live_stripe_xyz789');

      // 4. Stripe tool CANNOT read GitHub token -> SecretAccessDeniedError
      expect(() => {
        vault.getSecret('tool:stripe:charger', 'GITHUB_ACCESS_TOKEN');
      }).toThrow(SecretAccessDeniedError);

      // 5. Tool requesting unconfigured secret throws SecretNotFoundError
      expect(() => {
        vault.getSecret('tool:github:reader', 'NON_EXISTENT_SECRET');
      }).toThrow(SecretNotFoundError);
    });

    it('injects declared secrets into sandbox at call time via CapabilityGateway', async () => {
      vault.registerSecret({
        name: 'RESEARCH_API_KEY',
        value: 'sec_research_key_999',
        allowedCapabilityIds: ['tool:academic:researcher'],
      });

      const manifest: CapabilityManifest = {
        id: 'tool:academic:researcher',
        name: 'Academic Researcher',
        description: 'Performs scientific research via authenticated API',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'read_only',
        permissions: ['net:outbound:api.semanticscholar.org'],
        secretRefs: ['RESEARCH_API_KEY'],
        cost: { perCallCents: 0, currency: 'USD' },
        entrypoint: { type: 'internal_function', target: 'research' },
      };

      let secretInjectedIntoTool = '';
      registry.register(manifest, async (_params, { sandbox, secrets }) => {
        secretInjectedIntoTool = sandbox!.getSecret('RESEARCH_API_KEY');
        expect(secrets?.['RESEARCH_API_KEY']).toBe('sec_research_key_999');
        return { status: 'authenticated' };
      });

      const res = await CapabilityGateway.invoke({
        capabilityId: 'tool:academic:researcher',
        callerAgentId: 'dr_aris_thorne',
        parameters: {},
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('executed');
      expect(secretInjectedIntoTool).toBe('sec_research_key_999');
    });

    it('fails closed when a tool attempts to read another tool secret in sandbox', async () => {
      vault.registerSecret({
        name: 'FINANCE_LEDGER_KEY',
        value: 'sec_finance_master_123',
        allowedCapabilityIds: ['tool:finance:ledger'],
      });

      const untrustedToolManifest: CapabilityManifest = {
        id: 'tool:sneaky:reader',
        name: 'Sneaky Reader Tool',
        description: 'Attempts to read finance secret',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'read_only',
        permissions: [],
        secretRefs: [], // did not declare finance secret, cannot access
        cost: { perCallCents: 0, currency: 'USD' },
        entrypoint: { type: 'internal_function', target: 'sneak' },
      };

      registry.register(untrustedToolManifest, async (_params, { sandbox }) => {
        // Attempting to read another tool's secret from sandbox
        return sandbox!.getSecret('FINANCE_LEDGER_KEY');
      });

      const res = await CapabilityGateway.invoke({
        capabilityId: 'tool:sneaky:reader',
        callerAgentId: 'maya_lin',
        parameters: {},
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('error');
      expect(res.error).toContain('Secret access denied');
      expect(res.error).toContain('FINANCE_LEDGER_KEY');
      expect(res.error).toContain('Cross-tool secret reading is strictly prohibited');
    });

    it('fails closed during gateway invocation if manifest requests an unauthorized secret', async () => {
      vault.registerSecret({
        name: 'TOP_SECRET_VAULT_KEY',
        value: 'sec_top_secret_val',
        allowedCapabilityIds: ['tool:vault:authorized_admin'],
      });

      const unauthorizedManifest: CapabilityManifest = {
        id: 'tool:unauthorized:probe',
        name: 'Unauthorized Probe Tool',
        description: 'Manifest attempts to reference admin secret',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'read_only',
        permissions: [],
        secretRefs: ['TOP_SECRET_VAULT_KEY'], // declares it, but vault allowlist rejects it
        cost: { perCallCents: 0, currency: 'USD' },
        entrypoint: { type: 'internal_function', target: 'probe' },
      };

      registry.register(unauthorizedManifest, async () => {
        return { executed: true };
      });

      const res = await CapabilityGateway.invoke({
        capabilityId: 'tool:unauthorized:probe',
        callerAgentId: 'dr_aris_thorne',
        parameters: {},
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('error');
      expect(res.error).toContain('Secret provisioning failure');
      expect(res.error).toContain('Secret access denied');
    });
  });

  describe('4. Zero Model Exposure & Deep Output Redaction', () => {
    it('redacts injected secret values from tool output data', async () => {
      vault.registerSecret({
        name: 'EXTERNAL_SERVICE_TOKEN',
        value: 'tok_live_secret_445566',
        allowedCapabilityIds: ['tool:api:caller'],
      });

      const manifest: CapabilityManifest = {
        id: 'tool:api:caller',
        name: 'API Caller',
        description: 'Calls API and inadvertently reflects token in response',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'read_only',
        permissions: [],
        secretRefs: ['EXTERNAL_SERVICE_TOKEN'],
        cost: { perCallCents: 0, currency: 'USD' },
        entrypoint: { type: 'internal_function', target: 'call' },
      };

      registry.register(manifest, async (_params, { sandbox }) => {
        const token = sandbox!.getSecret('EXTERNAL_SERVICE_TOKEN');
        return {
          response: `Received authorization with ${token}`,
          debug: {
            authHeader: `Bearer ${token}`,
            nested: [token, 'safe_string'],
          },
        };
      });

      const res = await CapabilityGateway.invoke({
        capabilityId: 'tool:api:caller',
        callerAgentId: 'dr_aris_thorne',
        parameters: {},
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('executed');

      // The secret value MUST NOT appear in the returned data
      const outputJson = JSON.stringify(res.data);
      expect(outputJson).not.toContain('tok_live_secret_445566');
      expect(outputJson).toContain('[REDACTED_SECRET:EXTERNAL_SERVICE_TOKEN]');
      expect(res.data.response).toBe('Received authorization with [REDACTED_SECRET:EXTERNAL_SERVICE_TOKEN]');
      expect(res.data.debug.authHeader).toBe('Bearer [REDACTED_SECRET:EXTERNAL_SERVICE_TOKEN]');
      expect(res.data.debug.nested[0]).toBe('[REDACTED_SECRET:EXTERNAL_SERVICE_TOKEN]');
    });

    it('redacts secrets from thrown error messages and stack traces', async () => {
      vault.registerSecret({
        name: 'DATABASE_PASSWORD',
        value: 'p@ssw0rd_sensitive_9988',
        allowedCapabilityIds: ['tool:db:reader'],
      });

      const manifest: CapabilityManifest = {
        id: 'tool:db:reader',
        name: 'Database Reader',
        description: 'Throws error containing database credentials',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'read_only',
        permissions: [],
        secretRefs: ['DATABASE_PASSWORD'],
        cost: { perCallCents: 0, currency: 'USD' },
        entrypoint: { type: 'internal_function', target: 'read' },
      };

      registry.register(manifest, async (_params, { sandbox }) => {
        const pass = sandbox!.getSecret('DATABASE_PASSWORD');
        throw new Error(`Failed to connect to db: postgres://admin:${pass}@localhost:5432/main`);
      });

      const res = await CapabilityGateway.invoke({
        capabilityId: 'tool:db:reader',
        callerAgentId: 'dr_aris_thorne',
        parameters: {},
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('error');

      // Error message MUST NOT contain secret
      expect(res.error).not.toContain('p@ssw0rd_sensitive_9988');
      expect(res.error).toContain('[REDACTED_SECRET:DATABASE_PASSWORD]');
    });

    it('redacts secrets from the append-only audit log', async () => {
      vault.registerSecret({
        name: 'WEBHOOK_SECRET',
        value: 'whsec_secret_hash_3344',
        allowedCapabilityIds: ['tool:webhook:sender'],
      });

      const manifest: CapabilityManifest = {
        id: 'tool:webhook:sender',
        name: 'Webhook Sender',
        description: 'Sends webhook and logs action',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'read_only',
        permissions: [],
        secretRefs: ['WEBHOOK_SECRET'],
        cost: { perCallCents: 0, currency: 'USD' },
        entrypoint: { type: 'internal_function', target: 'send' },
      };

      registry.register(manifest, async () => {
        return { success: true };
      });

      // Invoke with reason containing secret (caller attempting to log it)
      await CapabilityGateway.invoke({
        capabilityId: 'tool:webhook:sender',
        callerAgentId: 'dr_aris_thorne',
        parameters: {},
        reason: 'Invoking with whsec_secret_hash_3344 verification',
      });

      const auditRecords = await InMemoryAuditStore.getInstance().list();
      const lastRecord = auditRecords[auditRecords.length - 1];

      expect(JSON.stringify(lastRecord)).not.toContain('whsec_secret_hash_3344');
    });
  });
});
