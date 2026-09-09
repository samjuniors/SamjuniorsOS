import { z } from 'zod';
import { DurableFileStore } from '../persistence/durable-file-store';

/**
 * ============================================================================
 * SAMJUNIORS OS — HONEST CONNECTOR & INTEGRATION REGISTRY
 * 
 * Inspired by FounderOS-DEMO's honest connector states:
 * - Explicit separation between configured live connectors vs sandbox/mock
 * - Strict Zod validation on configuration payloads
 * - Clear declaration of capabilities and rate limits
 * - No silent fabrication: If an integration is unconfigured, it reports
 *   status: 'unconfigured' truthfully.
 * ============================================================================
 */

export type ConnectorStatus = 
  | 'active'
  | 'live_connected'
  | 'unconfigured'
  | 'degraded'
  | 'mock_sandbox'
  | 'rate_limited'
  | 'error';

export interface ConnectorHealth {
  connectorId: string;
  name: string;
  category: 'communication' | 'payment' | 'code_repository' | 'analytics' | 'cloud_infra' | 'tool_hub' | 'chat';
  status: ConnectorStatus;
  isLive: boolean;
  isMock: boolean;
  isMockSandbox: boolean;
  lastHealthCheck: string;
  error?: string;
  configuredEnvKeys: string[];
  missingEnvKeys: string[];
}

export const ConnectorConfigSchema = z.object({
  connectorId: z.string().min(2),
  name: z.string().min(2),
  category: z.enum(['communication', 'payment', 'code_repository', 'analytics', 'cloud_infra', 'tool_hub', 'chat']),
  requiredEnvKeys: z.array(z.string()),
  endpointUrl: z.string().optional(),
  enabled: z.boolean().default(true),
});

export type ConnectorConfig = z.infer<typeof ConnectorConfigSchema>;

export class HonestConnectorRegistry {
  private static instance: HonestConnectorRegistry | null = null;
  private connectors: Map<string, ConnectorConfig> = new Map();

  private constructor() {
    this.registerStandardConnectors();
  }

  public static getInstance(): HonestConnectorRegistry {
    if (!HonestConnectorRegistry.instance) {
      HonestConnectorRegistry.instance = new HonestConnectorRegistry();
    }
    return HonestConnectorRegistry.instance;
  }

  private registerStandardConnectors(): void {
    // 1. Resend / Email Communication
    this.connectors.set('resend', {
      connectorId: 'resend',
      name: 'Resend Transactional Email',
      category: 'communication',
      requiredEnvKeys: ['RESEND_API_KEY'],
      enabled: true,
    });

    // 2. Stripe / Payments
    this.connectors.set('stripe', {
      connectorId: 'stripe',
      name: 'Stripe Billing & Subscriptions',
      category: 'payment',
      requiredEnvKeys: ['STRIPE_SECRET_KEY'],
      enabled: true,
    });

    // 3. GitHub / Version Control
    this.connectors.set('github', {
      connectorId: 'github',
      name: 'GitHub Enterprise / Workspace',
      category: 'code_repository',
      requiredEnvKeys: ['GITHUB_TOKEN'],
      enabled: true,
    });

    // 4. Gemini AI Provider
    this.connectors.set('gemini', {
      connectorId: 'gemini',
      name: 'Google Gemini Pro & Flash AI',
      category: 'analytics',
      requiredEnvKeys: ['GEMINI_API_KEY'],
      enabled: true,
    });

    // 5. Composio / Tool Hub
    this.connectors.set('composio', {
      connectorId: 'composio',
      name: 'Composio Tool Integration Hub',
      category: 'tool_hub',
      requiredEnvKeys: ['COMPOSIO_API_KEY'],
      enabled: true,
    });

    // 6. Slack / Internal Chat
    this.connectors.set('slack', {
      connectorId: 'slack',
      name: 'Slack Internal Communications',
      category: 'chat',
      requiredEnvKeys: ['SLACK_BOT_TOKEN'],
      enabled: true,
    });
  }

  /**
   * Evaluates the honest status of each connector against actual environment variables.
   * INVARIANT: Never claims an integration is active unless required credentials exist!
   */
  public getConnectorHealth(connectorId: string): ConnectorHealth {
    const config = this.connectors.get(connectorId);
    if (!config) {
      return {
        connectorId,
        name: 'Unknown Connector',
        category: 'cloud_infra',
        status: 'unconfigured',
        isLive: false,
        isMock: true,
        isMockSandbox: true,
        lastHealthCheck: new Date().toISOString(),
        error: `Connector '${connectorId}' is not registered.`,
        configuredEnvKeys: [],
        missingEnvKeys: [],
      };
    }

    const missingKeys: string[] = [];
    const presentKeys: string[] = [];

    for (const key of config.requiredEnvKeys) {
      if (process.env[key] && process.env[key]!.trim().length > 0) {
        presentKeys.push(key);
      } else {
        missingKeys.push(key);
      }
    }

    const now = new Date().toISOString();

    if (missingKeys.length === 0) {
      return {
        connectorId,
        name: config.name,
        category: config.category,
        status: 'active',
        isLive: true,
        isMock: false,
        isMockSandbox: false,
        lastHealthCheck: now,
        configuredEnvKeys: presentKeys,
        missingEnvKeys: [],
      };
    }

    // Honest reporting: Missing keys means unconfigured or running in sandbox/mock
    const status: ConnectorStatus = (config.category === 'payment' || config.category === 'communication')
      ? 'mock_sandbox'
      : 'unconfigured';

    return {
      connectorId,
      name: config.name,
      category: config.category,
      status,
      isLive: false,
      isMock: true,
      isMockSandbox: status === 'mock_sandbox',
      lastHealthCheck: now,
      error: `Missing environment credentials: ${missingKeys.join(', ')}. Side-effects will execute in safe mock sandbox.`,
      configuredEnvKeys: presentKeys,
      missingEnvKeys: missingKeys,
    };
  }

  public listAllConnectorHealth(): ConnectorHealth[] {
    return Array.from(this.connectors.keys()).map((id) => this.getConnectorHealth(id));
  }

  public getConnectorStates(): Record<string, ConnectorHealth> {
    const states: Record<string, ConnectorHealth> = {};
    for (const id of this.connectors.keys()) {
      states[id] = this.getConnectorHealth(id);
    }
    return states;
  }
}

export const ConnectorRegistry = HonestConnectorRegistry;
export type ConnectorRegistry = HonestConnectorRegistry;
