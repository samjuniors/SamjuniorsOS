import { AgentRole, AgentWorkProtocolStep } from './os';
import { ContextItemProvenance } from './context';
import { ActionTargetContext, SideEffectClassification } from './authorization';

/**
 * PHASE 12.4: COMMUNICATION INFRASTRUCTURE FOUNDATION
 * Typed domain taxonomy for generic communication across channels.
 */

export type CommunicationChannel = 'email' | 'slack' | 'webhook' | 'sms' | 'in_app';

export type ContactVerificationState = 'verified' | 'unverified' | 'provisional';

export interface Contact {
  id: string;
  name: string;
  email: string;
  organizationId?: string;
  organizationName?: string;
  role?: string;
  title?: string;
  verificationState: ContactVerificationState;
  sourceProvenance?: ContextItemProvenance;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactParticipant {
  contactId?: string;
  name?: string;
  address: string; // e.g. email address or username
  role?: string;
}

export type DeliveryStatus =
  | 'draft'
  | 'pending_approval'
  | 'queued'
  | 'sending'
  | 'delivered'
  | 'failed'
  | 'bounced';

export type MessageDirection = 'inbound' | 'outbound' | 'internal';

export interface Message {
  id: string;
  conversationId: string;
  threadId?: string;
  channel: CommunicationChannel;
  sender: ContactParticipant;
  recipients: ContactParticipant[];
  cc?: ContactParticipant[];
  bcc?: ContactParticipant[];
  subject: string;
  bodyContent: string;
  bodyMimeType?: 'text/plain' | 'text/html' | 'application/json';
  direction: MessageDirection;
  timestamp: string;
  deliveryStatus: DeliveryStatus;
  sourceProvenance?: ContextItemProvenance;
  externalProviderRef?: string;
  executionRef?: string;
  evidenceRef?: string;
  error?: string;
}

export interface MessageThread {
  threadId: string;
  conversationId: string;
  messageIds: string[];
  participantAddresses: string[];
  lastMessageAt: string;
  messageCount: number;
}

export type ConversationStatus = 'active' | 'archived' | 'closed';

export interface Conversation {
  id: string;
  participants: ContactParticipant[];
  channel: CommunicationChannel;
  subject: string;
  messageIds: string[];
  status: ConversationStatus;
  relatedEntityRef?: {
    entityType: 'company' | 'customer' | 'prospect' | 'deal' | 'initiative';
    entityId: string;
    entityName?: string;
  };
  workflowRef?: {
    workflowId: string;
    workflowInstanceId: string;
    stepId: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type DraftStatus = 'draft' | 'pending_approval' | 'approved' | 'discarded';

export interface Draft {
  id: string;
  conversationId?: string;
  threadId?: string;
  authoringRole: AgentRole;
  workflowRef?: {
    workflowId: string;
    workflowInstanceId: string;
    stepId: string;
  };
  channel: CommunicationChannel;
  intendedRecipients: ContactParticipant[];
  cc?: ContactParticipant[];
  bcc?: ContactParticipant[];
  subject: string;
  bodyContent: string;
  bodyMimeType?: 'text/plain' | 'text/html' | 'application/json';
  createdAt: string;
  updatedAt: string;
  approvalRef?: string;
  status: DraftStatus;
}

export type CommunicationIntentType =
  | 'read'
  | 'search'
  | 'draft'
  | 'send'
  | 'reply'
  | 'schedule'
  | 'classify';

export interface CommunicationIntent {
  id: string;
  type: CommunicationIntentType;
  employeeRole: AgentRole | 'advisor' | 'system';
  skillId?: string;
  channel: CommunicationChannel;
  payload: Record<string, any>;
  target?: ActionTargetContext;
  workflowRef?: {
    workflowId: string;
    workflowInstanceId: string;
    stepId: string;
  };
  approvalId?: string;
  createdAt: string;
}

export interface ReplyClassification {
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent' | 'action_required';
  intentCategory: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionNeeded: boolean;
  recommendedAction?: string;
  confidence: number;
}

export interface ContactFilter {
  query?: string;
  organizationId?: string;
  verificationState?: ContactVerificationState;
}

export interface ConversationFilter {
  channel?: CommunicationChannel;
  status?: ConversationStatus;
  participantAddress?: string;
  workflowInstanceId?: string;
}

export interface MessageFilter {
  conversationId?: string;
  threadId?: string;
  channel?: CommunicationChannel;
  direction?: MessageDirection;
  deliveryStatus?: DeliveryStatus;
  externalProviderRef?: string;
}

export interface DraftFilter {
  authoringRole?: AgentRole;
  workflowInstanceId?: string;
  status?: DraftStatus;
}

export interface IntentFilter {
  employeeRole?: string;
  type?: CommunicationIntentType;
  channel?: CommunicationChannel;
  workflowInstanceId?: string;
}

/**
 * PHASE 12.5: Resend & Webhook Event Types
 */

export interface ResendEmailConfig {
  apiKey: string;
  fromEmail: string;
  webhookSecret?: string;
}

export type CommunicationWebhookEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained';

export interface CommunicationWebhookEvent {
  id: string; // Event ID (e.g. from svix-id)
  provider: 'resend' | string;
  eventType: CommunicationWebhookEventType | string;
  externalMessageId: string;
  timestamp: string;
  recipient?: string;
  deliveryStatus: DeliveryStatus;
  error?: string;
  rawPayload?: Record<string, any>;
  processedAt: string;
}

export interface WebhookProcessingResult {
  success: boolean;
  duplicate: boolean;
  messageId?: string;
  externalMessageId?: string;
  deliveryStatus?: DeliveryStatus;
  error?: string;
}
