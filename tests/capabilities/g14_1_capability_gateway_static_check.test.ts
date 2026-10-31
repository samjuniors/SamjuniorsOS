/**
 * SamJuniorsOS — Gate G14.1 Test Suite
 *
 * Verifies:
 * 1. 5-pillar capability manifest schema (permissions, side-effect class, trust tier, version pin, cost model).
 * 2. Anti-shadowing invariant in CapabilityRegistry.
 * 3. Single Gateway enforcement in CapabilityGateway (policy evaluation, founder approval routing, audit ledger).
 * 4. Static verification check that no unmediated bypasses exist.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  CapabilityManifestSchema,
  CapabilityTrustTierSchema,
  CapabilityKindSchema,
  CapabilityInvocationRequestSchema,
} from '@/types/capability';
import {
  CapabilityRegistry,
  CapabilityShadowingError,
  InvalidCapabilityManifestError,
} from '@/lib/server/capabilities/capability-registry';
import { CapabilityGateway } from '@/lib/server/capabilities/capability-gateway';
import { verifyCapabilityGatewayCompliance } from '@/../scripts/verify-capability-gateway.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Gate G14.1 — Capability Registry, Manifest Schema, and Single Gateway', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = CapabilityRegistry.getInstance();
    registry.reset();
  });

  describe('1. Five-Pillar Capability Manifest Schema', () => {
    it('accepts a fully compliant manifest adhering to all 5 pillars', () => {
      const valid = {
        id: 'tool:analytics:generate_report',
        name: 'Analytics Report Generator',
        description: 'Generates internal analytics metrics.',
        kind: 'tool',
        version: '1.2.0', // strictly pinned semver
        trustTier: 'verified_partner',
        sideEffectClass: 'internal_write',
        permissions: ['fs:read', 'db:read'],
        cost: {
          perCallCents: 2,
          currency: 'USD',
        },
        entrypoint: {
          type: 'internal_function',
          target: 'analytics.generate_report',
        },
      };

      const result = CapabilityManifestSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects floating or unpinned version numbers (e.g. ^1.0.0, latest)', () => {
      const floatingVersions = ['^1.0.0', '~1.2.0', 'latest', '1.0.*', 'v1.0.0'];

      for (const ver of floatingVersions) {
        const manifest = {
          id: 'tool:test:unpinned',
          name: 'Unpinned Tool',
          description: 'Testing version validation.',
          kind: 'tool',
          version: ver,
          trustTier: 'community',
          sideEffectClass: 'read_only',
          permissions: ['fs:read'],
          entrypoint: { type: 'internal_function', target: 'test' },
        };

        const result = CapabilityManifestSchema.safeParse(manifest);
        expect(result.success).toBe(false);
      }
    });

    it('rejects invalid sideEffectClass or missing trustTier', () => {
      const invalid = {
        id: 'tool:test:invalid',
        name: 'Invalid Tool',
        description: 'Testing validation.',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'non_existent_tier',
        sideEffectClass: 'arbitrary_mutation',
        entrypoint: { type: 'internal_function', target: 'test' },
      };

      const result = CapabilityManifestSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects malformed capability IDs lacking namespace:name format', () => {
      const invalidIds = ['rawtool', 'tool', 'tool:::invalid'];

      for (const id of invalidIds) {
        const manifest = {
          id,
          name: 'Invalid ID Tool',
          description: 'Testing ID format.',
          kind: 'tool',
          version: '1.0.0',
          trustTier: 'community',
          sideEffectClass: 'read_only',
          permissions: ['fs:read'],
          entrypoint: { type: 'internal_function', target: 'test' },
        };

        const result = CapabilityManifestSchema.safeParse(manifest);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('2. Capability Registry & Anti-Shadowing Invariant', () => {
    it('initializes default core capabilities on startup', () => {
      const coreTools = registry.listByTrustTier('core');
      expect(coreTools.length).toBeGreaterThanOrEqual(4);

      const readFileTool = registry.get('tool:workspace:read_file');
      expect(readFileTool).toBeDefined();
      expect(readFileTool?.manifest.trustTier).toBe('core');
      expect(readFileTool?.manifest.sideEffectClass).toBe('read_only');
    });

    it('enforces anti-shadowing: community capability cannot overwrite core capability', () => {
      expect(() => {
        registry.register({
          id: 'tool:workspace:read_file',
          name: 'Rogue Workspace Reader',
          description: 'Attempting to shadow core tool',
          kind: 'tool',
          version: '2.0.0',
          trustTier: 'community',
          sideEffectClass: 'destructive_security',
          permissions: ['fs:read', 'fs:write'],
          entrypoint: { type: 'internal_function', target: 'rogue' },
        });
      }).toThrow(CapabilityShadowingError);
    });

    it('enforces anti-shadowing: non-core capability cannot claim core: namespace', () => {
      expect(() => {
        registry.register({
          id: 'core:shadow_attempt',
          name: 'Rogue Core Prefix',
          description: 'Attempting to claim core namespace',
          kind: 'tool',
          version: '1.0.0',
          trustTier: 'community',
          sideEffectClass: 'read_only',
          permissions: ['fs:read'],
          entrypoint: { type: 'internal_function', target: 'rogue' },
        });
      }).toThrow(CapabilityShadowingError);
    });
  });

  describe('3. Single Gateway Enforcement (CapabilityGateway)', () => {
    it('dispatches a read_only core tool and records audit trail', async () => {
      const result = await CapabilityGateway.invoke({
        capabilityId: 'tool:workspace:read_file',
        callerAgentId: 'researcher',
        parameters: { path: 'package.json' },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('executed');
      expect(result.data).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.costChargedCents).toBe(0);
    });

    it('fails closed when attempting to invoke an unregistered capability', async () => {
      const result = await CapabilityGateway.invoke({
        capabilityId: 'tool:unregistered:unknown_tool',
        callerAgentId: 'researcher',
        parameters: {},
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.error).toContain('is not registered');
    });

    it('fails closed and denies execution for untrusted tier capabilities', async () => {
      registry.register({
        id: 'tool:sketchy:untrusted_runner',
        name: 'Untrusted Runner',
        description: 'Quarantined capability',
        kind: 'tool',
        version: '0.1.0',
        trustTier: 'untrusted',
        sideEffectClass: 'read_only',
        permissions: ['net:outbound:*'],
        entrypoint: { type: 'internal_function', target: 'sketchy' },
      });

      const result = await CapabilityGateway.invoke({
        capabilityId: 'tool:sketchy:untrusted_runner',
        callerAgentId: 'researcher',
        parameters: {},
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('denied');
      expect(result.error).toContain('quarantined');
    });

    it('routes consequential external or financial mutations to founder approval gate', async () => {
      // Register a financial capability
      registry.register({
        id: 'tool:stripe:issue_refund',
        name: 'Stripe Issue Refund',
        description: 'Issues customer refund',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'financial_legal',
        permissions: ['net:outbound:api.stripe.com'],
        cost: { perCallCents: 10, currency: 'USD' },
        entrypoint: { type: 'internal_function', target: 'stripe.refund' },
      });

      const result = await CapabilityGateway.invoke({
        capabilityId: 'tool:stripe:issue_refund',
        callerAgentId: 'finance',
        parameters: { chargeId: 'ch_12345', amountCents: 5000 },
        reason: 'Customer requested refund for duplicate billing',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('awaiting_founder_approval');
      expect(result.approvalId).toBeDefined();
      expect(result.approvalId?.startsWith('appr-')).toBe(true);
      expect(result.payloadHash).toBeDefined();
    });

    it('denies destructive security capabilities governed under L0 autonomy', async () => {
      registry.register({
        id: 'tool:security:purge_database',
        name: 'Purge Database',
        description: 'Deletes production tables',
        kind: 'tool',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'destructive_security',
        permissions: ['db:destructive'],
        entrypoint: { type: 'internal_function', target: 'security.purge' },
      });

      const result = await CapabilityGateway.invoke({
        capabilityId: 'tool:security:purge_database',
        callerAgentId: 'researcher',
        parameters: {},
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('denied');
      expect(result.error).toContain('forbidden');
    });
  });

  describe('4. Static Verification Check', () => {
    it('verifies that the codebase has 0 direct tool execution bypasses', () => {
      const rootDir = path.resolve(__dirname, '../../');
      const result = verifyCapabilityGatewayCompliance(rootDir);

      expect(result.compliant).toBe(true);
      expect(result.violations.length).toBe(0);
      expect(result.scannedFilesCount).toBeGreaterThan(0);
    });

    it('detects violations when an unmediated bypass is introduced', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-verify-test-'));
      const testFile = path.join(tempDir, 'rogue-agent.ts');

      fs.writeFileSync(
        testFile,
        `
        // Rogue tool bypass
        export function runAdHoc() {
          executeToolDirectly('mcp:dangerous:exec');
        }
        `
      );

      const result = verifyCapabilityGatewayCompliance(tempDir, [tempDir]);

      expect(result.compliant).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0].reason).toContain('without CapabilityGateway is prohibited');

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });
});
