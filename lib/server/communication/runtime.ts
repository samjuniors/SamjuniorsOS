import {
  CommunicationChannel,
  CommunicationIntent,
  CommunicationIntentType,
  Contact,
  Conversation,
  Draft,
  Message,
  ContactParticipant,
  ContactFilter,
  ConversationFilter,
  MessageFilter,
  DraftFilter,
  IntentFilter,
  DeliveryStatus,
  CommunicationWebhookEvent,
  WebhookProcessingResult,
} from '../../../types/communication';
import { AgentRole } from '../../../types/os';
import { ContextItemProvenance } from '../../../types/context';
import {
  ActionTargetContext,
  AuthorizationDecision,
  SideEffectClassification,
} from '../../../types/authorization';
import { SideEffectAuthorizationGate } from '../authorization/gate';
import { InMemoryCommunicationStore } from './store';
import { CommunicationProviderRegistry } from './provider';
import { v4 as uuidv4 } from 'uuid';

export interface CommunicationExecutionResult<T = any> {
  intentId: string;
  allowed: boolean;
  executed: boolean;
  decision: AuthorizationDecision;
  auditId?: string;
  result?: T;
  error?: string;
}

/**
 * Maps CommunicationIntentType to deterministic Phase 12.3 SideEffectClassification.
 */
export function mapIntentToSideEffectClassification(type: CommunicationIntentType): SideEffectClassification {
  switch (type) {
    case 'read':
    case 'search':
    case 'classify':
      return 'read_only';
    case 'draft':
    case 'schedule':
      return 'internal_mutation';
    case 'send':
    case 'reply':
      return 'external_communication';
    default:
      return 'high_impact_action';
  }
}

/**
 * PHASE 12.4: Central Communication Runtime
 * Handles generic communication operations, strictly enforcing Phase 12.3 authorization gating.
 */
export class CommunicationRuntime {
  private static instance: CommunicationRuntime;
  private store: InMemoryCommunicationStore;
  private gate: SideEffectAuthorizationGate;
  private providerRegistry: CommunicationProviderRegistry;

  constructor(
    store?: InMemoryCommunicationStore,
    gate?: SideEffectAuthorizationGate,
    providerRegistry?: CommunicationProviderRegistry
  ) {
    this.store = store || InMemoryCommunicationStore.getInstance();
    this.gate = gate || SideEffectAuthorizationGate.getInstance();
    this.providerRegistry = providerRegistry || CommunicationProviderRegistry.getInstance();
  }

  static getInstance(): CommunicationRuntime {
    if (!CommunicationRuntime.instance) {
      CommunicationRuntime.instance = new CommunicationRuntime();
    }
    return CommunicationRuntime.instance;
  }

  // =========================================================================
  // Contact Management
  // =========================================================================

  async createContact(params: {
    name: string;
    email: string;
    organizationId?: string;
    organizationName?: string;
    role?: string;
    title?: string;
    verificationState?: 'verified' | 'unverified' | 'provisional';
    sourceProvenance?: ContextItemProvenance;
    metadata?: Record<string, any>;
    requestedBy?: AgentRole | 'system';
  }): Promise<Contact> {
    // Contact registration is an internal mutation
    const role = params.requestedBy || 'system';
    const classification: SideEffectClassification = 'internal_mutation';

    const decision = await this.gate.evaluateAuthorization({
      employeeRole: role,
      actionName: 'Register Contact',
      classification,
      target: {
        targetSystem: 'internal_store',
        resourceId: params.email,
        summary: `Register contact ${params.name} <${params.email}>`,
      },
    });

    if (decision.effect === 'denied') {
      throw new Error(`Contact creation denied: ${decision.reason}`);
    }

    return this.store.createContact({
      name: params.name,
      email: params.email,
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      role: params.role,
      title: params.title,
      verificationState: params.verificationState || 'unverified',
      sourceProvenance: params.sourceProvenance,
      metadata: params.metadata,
    });
  }

  async getContact(id: string): Promise<Contact | null> {
    return this.store.getContact(id);
  }

  async findContactByEmail(email: string): Promise<Contact | null> {
    return this.store.findContactByEmail(email);
  }

  async listContacts(filter?: ContactFilter): Promise<Contact[]> {
    return this.store.listContacts(filter);
  }

  // =========================================================================
  // Conversation Management
  // =========================================================================

  async createConversation(params: {
    participants: ContactParticipant[];
    channel: CommunicationChannel;
    subject: string;
    relatedEntityRef?: Conversation['relatedEntityRef'];
    workflowRef?: Conversation['workflowRef'];
    requestedBy?: AgentRole | 'system';
  }): Promise<Conversation> {
    const role = params.requestedBy || 'system';
    const classification: SideEffectClassification = 'internal_mutation';

    const decision = await this.gate.evaluateAuthorization({
      employeeRole: role,
      actionName: 'Create Conversation',
      classification,
      target: {
        targetSystem: 'internal_store',
        summary: `Create ${params.channel} conversation: ${params.subject}`,
      },
    });

    if (decision.effect === 'denied') {
      throw new Error(`Conversation creation denied: ${decision.reason}`);
    }

    return this.store.createConversation({
      participants: params.participants,
      channel: params.channel,
      subject: params.subject,
      status: 'active',
      relatedEntityRef: params.relatedEntityRef,
      workflowRef: params.workflowRef,
    });
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.store.getConversation(id);
  }

  async listConversations(filter?: ConversationFilter): Promise<Conversation[]> {
    return this.store.listConversations(filter);
  }

  // =========================================================================
  // Draft Management
  // =========================================================================

  async createDraft(params: {
    conversationId?: string;
    threadId?: string;
    authoringRole: AgentRole;
    workflowRef?: Draft['workflowRef'];
    channel: CommunicationChannel;
    intendedRecipients: ContactParticipant[];
    cc?: ContactParticipant[];
    bcc?: ContactParticipant[];
    subject: string;
    bodyContent: string;
    bodyMimeType?: 'text/plain' | 'text/html' | 'application/json';
  }): Promise<Draft> {
    // Draft creation is an internal mutation
    const classification: SideEffectClassification = 'internal_mutation';

    const decision = await this.gate.evaluateAuthorization({
      employeeRole: params.authoringRole,
      actionName: 'Create Draft',
      classification,
      workflowContext: params.workflowRef,
      target: {
        targetSystem: 'internal_store',
        recipient: params.intendedRecipients.map((r) => r.address).join(', '),
        summary: `Draft email: "${params.subject}"`,
      },
    });

    if (decision.effect === 'denied') {
      throw new Error(`Draft creation denied: ${decision.reason}`);
    }

    return this.store.createDraft({
      conversationId: params.conversationId,
      threadId: params.threadId,
      authoringRole: params.authoringRole,
      workflowRef: params.workflowRef,
      channel: params.channel,
      intendedRecipients: params.intendedRecipients,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      bodyContent: params.bodyContent,
      bodyMimeType: params.bodyMimeType || 'text/plain',
      status: 'draft',
    });
  }

  async getDraft(id: string): Promise<Draft | null> {
    return this.store.getDraft(id);
  }

  async updateDraft(id: string, updates: Partial<Omit<Draft, 'id' | 'createdAt'>>, requestedBy: AgentRole): Promise<Draft | null> {
    const existing = await this.store.getDraft(id);
    if (!existing) return null;

    const decision = await this.gate.evaluateAuthorization({
      employeeRole: requestedBy,
      actionName: 'Update Draft',
      classification: 'internal_mutation',
      workflowContext: existing.workflowRef,
      target: {
        targetSystem: 'internal_store',
        resourceId: id,
        summary: `Update draft "${existing.subject}"`,
      },
    });

    if (decision.effect === 'denied') {
      throw new Error(`Draft update denied: ${decision.reason}`);
    }

    return this.store.updateDraft(id, updates);
  }

  async listDrafts(filter?: DraftFilter): Promise<Draft[]> {
    return this.store.listDrafts(filter);
  }

  // =========================================================================
  // Generic Intent Execution (Central Authorization Boundary)
  // =========================================================================

  async executeIntent(intentInput: Omit<CommunicationIntent, 'id' | 'createdAt'>): Promise<CommunicationExecutionResult> {
    const classification = mapIntentToSideEffectClassification(intentInput.type);
    const intent = await this.store.recordIntent(intentInput);

    // Build target context
    const target: ActionTargetContext = {
      targetSystem: intent.channel,
      recipient: intent.payload.recipient || intent.payload.to,
      summary: `Execute communication intent '${intent.type}' on ${intent.channel}`,
      ...intent.target,
    };

    // 1. Evaluate or Execute through Phase 12.3 Central Authorization Gate
    if (classification === 'read_only') {
      const decision = await this.gate.evaluateAuthorization({
        employeeRole: intent.employeeRole,
        actionName: `Communication: ${intent.type}`,
        classification,
        workflowContext: intent.workflowRef,
        target,
      });

      if (decision.effect === 'denied') {
        return {
          intentId: intent.id,
          allowed: false,
          executed: false,
          decision,
          error: `Read authorization denied: ${decision.reason}`,
        };
      }

      // Handle read_only execution
      const provider = this.providerRegistry.getAdapter(intent.channel);
      const messages = await provider.readMessages(intent.payload.filter);
      return {
        intentId: intent.id,
        allowed: true,
        executed: true,
        decision,
        result: { messages, count: messages.length },
      };
    }

    if (classification === 'internal_mutation') {
      const decision = await this.gate.evaluateAuthorization({
        employeeRole: intent.employeeRole,
        actionName: `Communication: ${intent.type}`,
        classification,
        workflowContext: intent.workflowRef,
        target,
      });

      if (decision.effect === 'denied') {
        return {
          intentId: intent.id,
          allowed: false,
          executed: false,
          decision,
          error: `Internal communication mutation denied: ${decision.reason}`,
        };
      }

      if (intent.type === 'draft') {
        const draft = await this.store.createDraft({
          conversationId: intent.payload.conversationId,
          threadId: intent.payload.threadId,
          authoringRole: intent.employeeRole as AgentRole,
          workflowRef: intent.workflowRef,
          channel: intent.channel,
          intendedRecipients: intent.payload.intendedRecipients || [],
          cc: intent.payload.cc,
          bcc: intent.payload.bcc,
          subject: intent.payload.subject || '',
          bodyContent: intent.payload.bodyContent || '',
          bodyMimeType: intent.payload.bodyMimeType || 'text/plain',
          status: 'draft',
        });
        return {
          intentId: intent.id,
          allowed: true,
          executed: true,
          decision,
          result: draft,
        };
      }

      return {
        intentId: intent.id,
        allowed: true,
        executed: true,
        decision,
        result: { recorded: true },
      };
    }

    // 2. External Communication Execution ('send' or 'reply')
    // Must pass strictly through gate.executeWithGate!
    const gateResult = await this.gate.executeWithGate({
      request: {
        employeeRole: intent.employeeRole,
        actionName: `Send Communication (${intent.type})`,
        classification: 'external_communication',
        workflowContext: intent.workflowRef,
        target,
        approvalId: intent.approvalId,
      },
      executeFn: async () => {
        const provider = this.providerRegistry.getAdapter(intent.channel);

        // Idempotency check: if draft was already approved or message already sent
        if (intent.payload.draftId) {
          const draft = await this.store.getDraft(intent.payload.draftId);
          if (draft && draft.status === 'approved' && draft.approvalRef === intent.approvalId) {
            // Find existing message for this draft/approval
            const existingMessages = await this.store.listMessages({
              channel: intent.channel,
              direction: 'outbound',
            });
            const matchingMsg = existingMessages.find(
              (m) => m.deliveryStatus === 'sending' || m.deliveryStatus === 'delivered'
            );
            if (matchingMsg && matchingMsg.subject === draft.subject) {
              return {
                delivered: true,
                deliveryStatus: matchingMsg.deliveryStatus,
                message: matchingMsg,
                externalMessageId: matchingMsg.externalProviderRef,
                idempotentReplay: true,
              };
            }
          }
        }

        // Prepare message payload
        const executionId = intent.payload.executionRef || `comm-exec-${uuidv4().slice(0, 8)}`;
        const messageId = `msg-${uuidv4().slice(0, 8)}`;

        const messageRecord: Message = {
          id: messageId,
          conversationId: intent.payload.conversationId || `conv-auto-${uuidv4().slice(0, 8)}`,
          threadId: intent.payload.threadId,
          channel: intent.channel,
          sender: intent.payload.sender || { address: `${intent.employeeRole}@company.internal`, name: String(intent.employeeRole).toUpperCase() },
          recipients: intent.payload.recipients || intent.payload.intendedRecipients || [],
          cc: intent.payload.cc,
          bcc: intent.payload.bcc,
          subject: intent.payload.subject || 'No Subject',
          bodyContent: intent.payload.bodyContent || '',
          bodyMimeType: intent.payload.bodyMimeType || 'text/plain',
          direction: 'outbound',
          timestamp: new Date().toISOString(),
          deliveryStatus: 'pending_approval',
          executionRef: executionId,
          sourceProvenance: intent.payload.sourceProvenance,
        };

        // Check if provider adapter is configured
        if (!provider.isConfigured()) {
          messageRecord.deliveryStatus = 'failed';
          messageRecord.error = `NO_EXTERNAL_PROVIDER_CONFIGURED: Channel '${intent.channel}' currently has no external provider adapter connected.`;
          await this.store.createMessage(messageRecord);

          return {
            delivered: false,
            deliveryStatus: 'failed' as DeliveryStatus,
            message: messageRecord,
            error: messageRecord.error,
          };
        }

        // Call provider adapter
        const sendResult = await provider.sendMessage(messageRecord, intent.approvalId);
        messageRecord.deliveryStatus = sendResult.deliveryStatus;
        messageRecord.externalProviderRef = sendResult.externalMessageId;
        messageRecord.error = sendResult.error;

        await this.store.createMessage(messageRecord);

        // If from draft, mark draft as approved/sent
        if (intent.payload.draftId) {
          await this.store.updateDraft(intent.payload.draftId, {
            status: 'approved',
            approvalRef: intent.approvalId,
          });
        }

        return {
          delivered: sendResult.success,
          deliveryStatus: sendResult.deliveryStatus,
          message: messageRecord,
          externalMessageId: sendResult.externalMessageId,
        };
      },
    });

    return {
      intentId: intent.id,
      allowed: gateResult.allowed,
      executed: gateResult.allowed && !!gateResult.result,
      decision: gateResult.decision,
      auditId: gateResult.auditId,
      result: gateResult.result,
      error: gateResult.error,
    };
  }

  // =========================================================================
  // Webhook Event Processing (Phase 12.5)
  // =========================================================================

  /**
   * Ingests and processes asynchronous delivery notifications from external providers (e.g. Resend).
   * Idempotently deduplicates events and truthfully transitions message states.
   */
  async handleWebhookEvent(params: {
    eventId: string;
    provider: 'resend' | string;
    eventType: string;
    externalMessageId: string;
    timestamp?: string;
    recipient?: string;
    rawPayload?: Record<string, any>;
  }): Promise<WebhookProcessingResult> {
    const { eventId, provider, eventType, externalMessageId, timestamp, recipient, rawPayload } = params;

    // 1. Idempotency Check
    if (await this.store.hasProcessedWebhookEvent(eventId)) {
      return {
        success: true,
        duplicate: true,
        externalMessageId,
      };
    }

    // 2. Map Event Type to DeliveryStatus
    let deliveryStatus: DeliveryStatus = 'sending';
    let errorDetail: string | undefined = undefined;

    switch (eventType) {
      case 'email.sent':
        deliveryStatus = 'sending';
        break;
      case 'email.delivered':
        deliveryStatus = 'delivered';
        break;
      case 'email.bounced':
        deliveryStatus = 'bounced';
        errorDetail = rawPayload?.data?.bounce?.message || 'Email delivery bounced.';
        break;
      case 'email.complained':
        deliveryStatus = 'bounced';
        errorDetail = 'Email recipient marked message as spam / complained.';
        break;
      case 'email.delivery_delayed':
        deliveryStatus = 'sending';
        break;
      default:
        deliveryStatus = 'sending';
    }

    // 3. Record Webhook Audit in Store
    const now = new Date().toISOString();
    const webhookEvent: CommunicationWebhookEvent = {
      id: eventId,
      provider,
      eventType,
      externalMessageId,
      timestamp: timestamp || now,
      recipient,
      deliveryStatus,
      error: errorDetail,
      rawPayload,
      processedAt: now,
    };
    await this.store.recordWebhookEvent(webhookEvent);

    // 4. Update corresponding internal message if found
    const matchedMessage = await this.store.findMessageByExternalProviderRef(externalMessageId);
    if (matchedMessage) {
      await this.store.updateMessage(matchedMessage.id, {
        deliveryStatus,
        error: errorDetail || matchedMessage.error,
      });

      return {
        success: true,
        duplicate: false,
        messageId: matchedMessage.id,
        externalMessageId,
        deliveryStatus,
      };
    }

    return {
      success: true,
      duplicate: false,
      externalMessageId,
      deliveryStatus,
    };
  }

  async listWebhookEvents(): Promise<CommunicationWebhookEvent[]> {
    return this.store.listWebhookEvents();
  }

  async findMessageByExternalProviderRef(externalProviderRef: string): Promise<Message | null> {
    return this.store.findMessageByExternalProviderRef(externalProviderRef);
  }

  getStore(): InMemoryCommunicationStore {
    return this.store;
  }

  getProviderRegistry(): CommunicationProviderRegistry {
    return this.providerRegistry;
  }

  // =========================================================================
  // Send Draft Helper
  // =========================================================================

  async sendDraft(params: {
    draftId: string;
    approvalId: string;
    senderAddress?: string;
    senderName?: string;
    requestedBy?: AgentRole;
    workflowRef?: {
      workflowId: string;
      workflowInstanceId: string;
      stepId: string;
    };
  }): Promise<CommunicationExecutionResult> {
    const draft = await this.store.getDraft(params.draftId);
    if (!draft) {
      throw new Error(`Draft '${params.draftId}' not found.`);
    }

    const role = params.requestedBy || draft.authoringRole;
    const effectiveWorkflowRef = params.workflowRef || draft.workflowRef;

    return this.executeIntent({
      type: 'send',
      employeeRole: role,
      channel: draft.channel,
      approvalId: params.approvalId,
      workflowRef: effectiveWorkflowRef,
      payload: {
        draftId: draft.id,
        conversationId: draft.conversationId,
        threadId: draft.threadId,
        sender: {
          address: params.senderAddress || `${role}@company.internal`,
          name: params.senderName || role.toUpperCase(),
        },
        recipients: draft.intendedRecipients,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject,
        bodyContent: draft.bodyContent,
        bodyMimeType: draft.bodyMimeType,
      },
      target: {
        targetSystem: draft.channel,
        recipient: draft.intendedRecipients.map((r) => r.address).join(', '),
        summary: `Send approved draft: "${draft.subject}"`,
      },
    });
  }

  // Helper to clear stores for tests
  clearAll(): void {
    this.store.clear();
    this.providerRegistry.resetToDefaults();
  }
}
