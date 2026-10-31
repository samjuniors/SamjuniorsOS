/**
 * SamJuniorsOS — Capability Registry (Gate G14.1)
 *
 * Authoritative registry of all tools, skills, and MCP servers in the company OS.
 * Enforces:
 * 1. Schema validation (Zod CapabilityManifestSchema).
 * 2. Anti-shadowing invariant: community or untrusted capabilities can NEVER shadow
 *    or override core or verified_partner capabilities.
 * 3. Strict semantic version pinning.
 */

import {
  CapabilityManifest,
  CapabilityManifestSchema,
  CapabilityTrustTier,
  CapabilityKind,
} from '@/types/capability';

export class CapabilityShadowingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityShadowingError';
  }
}

export class InvalidCapabilityManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCapabilityManifestError';
  }
}

export interface CapabilityExecutionContext {
  callerAgentId: string;
  userId?: string;
  conversationId?: string;
  reason?: string;
}

export type CapabilityExecutor = (
  parameters: Record<string, any>,
  context: CapabilityExecutionContext
) => Promise<any>;

export interface RegisteredCapability {
  manifest: CapabilityManifest;
  executor?: CapabilityExecutor;
  registeredAt: string;
}

export class CapabilityRegistry {
  private static instance: CapabilityRegistry | null = null;
  private capabilities: Map<string, RegisteredCapability> = new Map();

  private constructor() {
    this.registerCoreDefaults();
  }

  public static getInstance(): CapabilityRegistry {
    if (!CapabilityRegistry.instance) {
      CapabilityRegistry.instance = new CapabilityRegistry();
    }
    return CapabilityRegistry.instance;
  }

  /**
   * Resets registry and re-registers core defaults (primarily for test environments).
   */
  public reset(): void {
    this.capabilities.clear();
    this.registerCoreDefaults();
  }

  /**
   * Registers a capability manifest and optional executor.
   * Enforces schema conformance and the anti-shadowing invariant.
   */
  public register(
    manifestInput: unknown,
    executor?: CapabilityExecutor
  ): RegisteredCapability {
    const parseResult = CapabilityManifestSchema.safeParse(manifestInput);
    if (!parseResult.success) {
      throw new InvalidCapabilityManifestError(
        `Capability manifest validation failed: ${parseResult.error.message}`
      );
    }

    const manifest = parseResult.data;
    const existing = this.capabilities.get(manifest.id);

    // Anti-shadowing check:
    // If existing is core or verified_partner, non-core/non-partner cannot overwrite it.
    if (existing) {
      if (
        (existing.manifest.trustTier === 'core' ||
          existing.manifest.trustTier === 'verified_partner') &&
        manifest.trustTier !== 'core' &&
        manifest.trustTier !== 'verified_partner'
      ) {
        throw new CapabilityShadowingError(
          `Anti-shadowing invariant violated: Tier "${manifest.trustTier}" capability cannot overwrite or shadow "${existing.manifest.trustTier}" capability "${manifest.id}".`
        );
      }
    }

    // Reserved namespace check: only 'core' trust tier can register under 'core:' or 'system:'
    if (
      (manifest.id.startsWith('core:') || manifest.id.startsWith('system:')) &&
      manifest.trustTier !== 'core'
    ) {
      throw new CapabilityShadowingError(
        `Anti-shadowing invariant violated: Only core capabilities may use "core:" or "system:" prefixes (attempted by id "${manifest.id}" with tier "${manifest.trustTier}").`
      );
    }

    const registered: RegisteredCapability = {
      manifest,
      executor,
      registeredAt: new Date().toISOString(),
    };

    this.capabilities.set(manifest.id, registered);
    return registered;
  }

  /**
   * Retrieves a capability by ID.
   */
  public get(id: string): RegisteredCapability | undefined {
    return this.capabilities.get(id);
  }

  /**
   * Checks if a capability is registered.
   */
  public has(id: string): boolean {
    return this.capabilities.has(id);
  }

  /**
   * Lists all registered capabilities.
   */
  public list(): RegisteredCapability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Filters capabilities by trust tier.
   */
  public listByTrustTier(tier: CapabilityTrustTier): RegisteredCapability[] {
    return this.list().filter((c) => c.manifest.trustTier === tier);
  }

  /**
   * Filters capabilities by kind (tool, skill, mcp_server).
   */
  public listByKind(kind: CapabilityKind): RegisteredCapability[] {
    return this.list().filter((c) => c.manifest.kind === kind);
  }

  /**
   * Registers baseline core capabilities audited for SamJuniorsOS.
   */
  private registerCoreDefaults(): void {
    // 1. Core workspace read tool
    this.register({
      id: 'tool:workspace:read_file',
      name: 'Workspace Read File',
      description: 'Deterministically reads file contents within allowed workspace bounds.',
      kind: 'tool',
      version: '1.0.0',
      trustTier: 'core',
      sideEffectClass: 'read_only',
      permissions: ['fs:read'],
      cost: { perCallCents: 0, currency: 'USD' },
      entrypoint: {
        type: 'internal_function',
        target: 'workspace.read_file',
      },
    }, async (params) => {
      return { path: params.path, content: `[Mock file content for ${params.path}]` };
    });

    // 2. Core GitHub issue reader
    this.register({
      id: 'tool:github:read_issue',
      name: 'GitHub Read Issue',
      description: 'Reads public or authenticated repository issue metadata.',
      kind: 'tool',
      version: '1.0.0',
      trustTier: 'core',
      sideEffectClass: 'read_only',
      permissions: ['net:outbound:api.github.com'],
      cost: { perCallCents: 0, currency: 'USD' },
      entrypoint: {
        type: 'internal_function',
        target: 'github.read_issue',
      },
    }, async (params) => {
      return { issueNumber: params.issueNumber, title: 'Sample Issue', state: 'open' };
    });

    // 3. Core GitHub issue creator (external_reversible)
    this.register({
      id: 'tool:github:create_issue',
      name: 'GitHub Create Issue',
      description: 'Creates a new issue in the specified repository.',
      kind: 'tool',
      version: '1.0.0',
      trustTier: 'core',
      sideEffectClass: 'external_reversible',
      permissions: ['net:outbound:api.github.com'],
      cost: { perCallCents: 0, currency: 'USD' },
      entrypoint: {
        type: 'internal_function',
        target: 'github.create_issue',
      },
    }, async (params) => {
      return { created: true, issueNumber: 101, url: 'https://github.com/mock/repo/issues/101' };
    });

    // 4. Core competitive research skill (skill / prompt template)
    this.register({
      id: 'skill:research:competitive_scan',
      name: 'Competitive Scan Skill',
      description: 'Synthesizes competitive market intelligence into executive summaries.',
      kind: 'skill',
      version: '1.0.0',
      trustTier: 'core',
      sideEffectClass: 'read_only',
      permissions: ['net:outbound:*'],
      cost: { perCallCents: 5, currency: 'USD' },
      entrypoint: {
        type: 'prompt_template',
        target: 'skills.research.competitive_scan',
      },
    }, async (params) => {
      return { competitors: ['CompA', 'CompB'], summary: 'Market landscape scan complete.' };
    });

    // 5. Core SQLite query MCP server
    this.register({
      id: 'mcp:sqlite:query',
      name: 'SQLite Query MCP Server',
      description: 'Executes verified SQL read queries against the read-replica database.',
      kind: 'mcp_server',
      version: '1.0.0',
      trustTier: 'core',
      sideEffectClass: 'read_only',
      permissions: ['db:read'],
      cost: { perCallCents: 0, currency: 'USD' },
      entrypoint: {
        type: 'mcp_stdio',
        target: 'mcp-server-sqlite',
      },
    }, async (params) => {
      return { rows: [{ id: 1, name: 'Sample' }], rowCount: 1 };
    });
  }
}
