import {
  CommunicationChannel,
  DeliveryStatus,
  Message,
  MessageFilter,
  MessageThread,
} from '../../../types/communication';
import { ResendCommunicationProviderAdapter } from './resend-provider';

/**
 * PHASE 12.4 & 12.5: Communication Provider Adapter Boundary
 * Standard interface for external providers (Resend, Gmail, Slack, etc.).
 */
export interface CommunicationProviderAdapter {
  providerId: string;
  channel: CommunicationChannel;
  isConfigured(): boolean;
  readMessages(filter?: MessageFilter): Promise<Message[]>;
  getThread(threadId: string): Promise<MessageThread | null>;
  sendMessage(
    message: Message,
    approvalId?: string,
    idempotencyKey?: string
  ): Promise<{
    success: boolean;
    externalMessageId?: string;
    deliveryStatus: DeliveryStatus;
    error?: string;
  }>;
  getDeliveryStatus(externalMessageId: string): Promise<DeliveryStatus>;
}

/**
 * Null provider adapter representing an environment with no external provider configured.
 * Strictly adheres to truthfulness: does NOT simulate fake external delivery.
 */
export class NullCommunicationProviderAdapter implements CommunicationProviderAdapter {
  readonly providerId: string;
  readonly channel: CommunicationChannel;

  constructor(channel: CommunicationChannel = 'email', providerId: string = 'null-provider') {
    this.channel = channel;
    this.providerId = providerId;
  }

  isConfigured(): boolean {
    return false;
  }

  async readMessages(_filter?: MessageFilter): Promise<Message[]> {
    return [];
  }

  async getThread(_threadId: string): Promise<MessageThread | null> {
    return null;
  }

  async sendMessage(
    _message: Message,
    _approvalId?: string,
    _idempotencyKey?: string
  ): Promise<{
    success: boolean;
    externalMessageId?: string;
    deliveryStatus: DeliveryStatus;
    error?: string;
  }> {
    return {
      success: false,
      deliveryStatus: 'failed',
      error: `NO_EXTERNAL_PROVIDER_CONFIGURED: Channel '${this.channel}' currently has no external provider adapter connected.`,
    };
  }

  async getDeliveryStatus(_externalMessageId: string): Promise<DeliveryStatus> {
    return 'failed';
  }
}

/**
 * Registry for communication provider adapters.
 */
export class CommunicationProviderRegistry {
  private static instance: CommunicationProviderRegistry;
  private adapters: Map<CommunicationChannel, CommunicationProviderAdapter> = new Map();

  private constructor() {
    this.initializeDefaults();
  }

  static getInstance(): CommunicationProviderRegistry {
    if (!CommunicationProviderRegistry.instance) {
      CommunicationProviderRegistry.instance = new CommunicationProviderRegistry();
    }
    return CommunicationProviderRegistry.instance;
  }

  private initializeDefaults(): void {
    const resendKey = (process.env.RESEND_API_KEY || '').trim();
    if (resendKey.length > 0) {
      this.adapters.set('email', new ResendCommunicationProviderAdapter());
    } else {
      this.adapters.set('email', new NullCommunicationProviderAdapter('email', 'null-email-adapter'));
    }

    this.adapters.set('slack', new NullCommunicationProviderAdapter('slack', 'null-slack-adapter'));
    this.adapters.set('webhook', new NullCommunicationProviderAdapter('webhook', 'null-webhook-adapter'));
    this.adapters.set('sms', new NullCommunicationProviderAdapter('sms', 'null-sms-adapter'));
  }

  registerAdapter(channel: CommunicationChannel, adapter: CommunicationProviderAdapter): void {
    this.adapters.set(channel, adapter);
  }

  getAdapter(channel: CommunicationChannel): CommunicationProviderAdapter {
    return this.adapters.get(channel) || new NullCommunicationProviderAdapter(channel);
  }

  resetToDefaults(): void {
    this.adapters.clear();
    this.initializeDefaults();
  }
}
