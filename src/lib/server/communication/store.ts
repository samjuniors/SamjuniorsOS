import {
  Contact,
  Organization,
  Conversation,
  Message,
  Draft,
  CommunicationIntent,
  ContactFilter,
  ConversationFilter,
  MessageFilter,
  DraftFilter,
  IntentFilter,
  CommunicationWebhookEvent,
} from '../../../types/communication';
import { v4 as uuidv4 } from 'uuid';

/**
 * PHASE 12.4 & 12.5: In-Memory Communication Domain Store
 * Stores internal communication models (contacts, conversations, messages, drafts, intents, webhook events).
 * Keeps conversation state cleanly separated from workflow runtime state.
 */
export class InMemoryCommunicationStore {
  private static instance: InMemoryCommunicationStore;

  private contacts: Map<string, Contact> = new Map();
  private organizations: Map<string, Organization> = new Map();
  private conversations: Map<string, Conversation> = new Map();
  private messages: Map<string, Message> = new Map();
  private drafts: Map<string, Draft> = new Map();
  private intents: Map<string, CommunicationIntent> = new Map();
  private webhookEvents: Map<string, CommunicationWebhookEvent> = new Map();

  private constructor() {}

  static getInstance(): InMemoryCommunicationStore {
    if (!InMemoryCommunicationStore.instance) {
      InMemoryCommunicationStore.instance = new InMemoryCommunicationStore();
    }
    return InMemoryCommunicationStore.instance;
  }

  // --- Contacts ---
  async createContact(contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Contact> {
    const id = contact.id || `contact-${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    const newContact: Contact = {
      ...contact,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.contacts.set(id, newContact);
    return { ...newContact };
  }

  async getContact(id: string): Promise<Contact | null> {
    const contact = this.contacts.get(id);
    return contact ? { ...contact } : null;
  }

  async findContactByEmail(email: string): Promise<Contact | null> {
    const normalized = email.trim().toLowerCase();
    for (const c of this.contacts.values()) {
      if (c.email.trim().toLowerCase() === normalized) {
        return { ...c };
      }
    }
    return null;
  }

  async listContacts(filter?: ContactFilter): Promise<Contact[]> {
    let result = Array.from(this.contacts.values());
    if (filter) {
      if (filter.organizationId) {
        result = result.filter((c) => c.organizationId === filter.organizationId);
      }
      if (filter.verificationState) {
        result = result.filter((c) => c.verificationState === filter.verificationState);
      }
      if (filter.query) {
        const q = filter.query.toLowerCase();
        result = result.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q) ||
            (c.organizationName && c.organizationName.toLowerCase().includes(q)) ||
            (c.role && c.role.toLowerCase().includes(q))
        );
      }
    }
    return result.map((c) => ({ ...c }));
  }

  // --- Organizations ---
  async createOrganization(org: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Organization> {
    const id = org.id || `org-${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    const newOrg: Organization = {
      ...org,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.organizations.set(id, newOrg);
    return { ...newOrg };
  }

  async getOrganization(id: string): Promise<Organization | null> {
    const org = this.organizations.get(id);
    return org ? { ...org } : null;
  }

  async listOrganizations(): Promise<Organization[]> {
    return Array.from(this.organizations.values()).map((o) => ({ ...o }));
  }

  // --- Conversations ---
  async createConversation(
    conv: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'messageIds'> & { id?: string; messageIds?: string[] }
  ): Promise<Conversation> {
    const id = conv.id || `conv-${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    const newConv: Conversation = {
      ...conv,
      id,
      messageIds: conv.messageIds || [],
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, newConv);
    return { ...newConv };
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const conv = this.conversations.get(id);
    return conv ? { ...conv } : null;
  }

  async listConversations(filter?: ConversationFilter): Promise<Conversation[]> {
    let result = Array.from(this.conversations.values());
    if (filter) {
      if (filter.channel) {
        result = result.filter((c) => c.channel === filter.channel);
      }
      if (filter.status) {
        result = result.filter((c) => c.status === filter.status);
      }
      if (filter.workflowInstanceId) {
        result = result.filter((c) => c.workflowRef?.workflowInstanceId === filter.workflowInstanceId);
      }
      if (filter.participantAddress) {
        const addr = filter.participantAddress.toLowerCase();
        result = result.filter((c) => c.participants.some((p) => p.address.toLowerCase() === addr));
      }
    }
    return result.map((c) => ({ ...c }));
  }

  async addMessageToConversation(conversationId: string, messageId: string): Promise<Conversation | null> {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;
    if (!conv.messageIds.includes(messageId)) {
      conv.messageIds.push(messageId);
      conv.updatedAt = new Date().toISOString();
      this.conversations.set(conversationId, conv);
    }
    return { ...conv };
  }

  // --- Messages ---
  async createMessage(msg: Omit<Message, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): Promise<Message> {
    const id = msg.id || `msg-${uuidv4().slice(0, 8)}`;
    const timestamp = msg.timestamp || new Date().toISOString();
    const newMsg: Message = {
      ...msg,
      id,
      timestamp,
    };
    this.messages.set(id, newMsg);

    // Link into conversation if exists
    if (newMsg.conversationId) {
      await this.addMessageToConversation(newMsg.conversationId, id);
    }

    return { ...newMsg };
  }

  async getMessage(id: string): Promise<Message | null> {
    const msg = this.messages.get(id);
    return msg ? { ...msg } : null;
  }

  async listMessages(filter?: MessageFilter): Promise<Message[]> {
    let result = Array.from(this.messages.values());
    if (filter) {
      if (filter.conversationId) {
        result = result.filter((m) => m.conversationId === filter.conversationId);
      }
      if (filter.threadId) {
        result = result.filter((m) => m.threadId === filter.threadId);
      }
      if (filter.channel) {
        result = result.filter((m) => m.channel === filter.channel);
      }
      if (filter.direction) {
        result = result.filter((m) => m.direction === filter.direction);
      }
      if (filter.deliveryStatus) {
        result = result.filter((m) => m.deliveryStatus === filter.deliveryStatus);
      }
      if (filter.externalProviderRef) {
        result = result.filter((m) => m.externalProviderRef === filter.externalProviderRef);
      }
    }
    return result.map((m) => ({ ...m }));
  }

  async findMessageByExternalProviderRef(externalProviderRef: string): Promise<Message | null> {
    if (!externalProviderRef) return null;
    for (const msg of this.messages.values()) {
      if (msg.externalProviderRef === externalProviderRef) {
        return { ...msg };
      }
    }
    return null;
  }

  async updateMessage(id: string, updates: Partial<Message>): Promise<Message | null> {
    const msg = this.messages.get(id);
    if (!msg) return null;
    const updated = { ...msg, ...updates };
    this.messages.set(id, updated);
    return { ...updated };
  }

  // --- Drafts ---
  async createDraft(draft: Omit<Draft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Draft> {
    const id = draft.id || `draft-${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    const newDraft: Draft = {
      ...draft,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.drafts.set(id, newDraft);
    return { ...newDraft };
  }

  async getDraft(id: string): Promise<Draft | null> {
    const draft = this.drafts.get(id);
    return draft ? { ...draft } : null;
  }

  async updateDraft(id: string, updates: Partial<Omit<Draft, 'id' | 'createdAt'>>): Promise<Draft | null> {
    const draft = this.drafts.get(id);
    if (!draft) return null;
    const updated: Draft = {
      ...draft,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.drafts.set(id, updated);
    return { ...updated };
  }

  async listDrafts(filter?: DraftFilter): Promise<Draft[]> {
    let result = Array.from(this.drafts.values());
    if (filter) {
      if (filter.authoringRole) {
        result = result.filter((d) => d.authoringRole === filter.authoringRole);
      }
      if (filter.workflowInstanceId) {
        result = result.filter((d) => d.workflowRef?.workflowInstanceId === filter.workflowInstanceId);
      }
      if (filter.status) {
        result = result.filter((d) => d.status === filter.status);
      }
    }
    return result.map((d) => ({ ...d }));
  }

  async deleteDraft(id: string): Promise<boolean> {
    return this.drafts.delete(id);
  }

  // --- Communication Intents ---
  async recordIntent(intent: Omit<CommunicationIntent, 'id' | 'createdAt'> & { id?: string }): Promise<CommunicationIntent> {
    const id = intent.id || `intent-${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    const newIntent: CommunicationIntent = {
      ...intent,
      id,
      createdAt: now,
    };
    this.intents.set(id, newIntent);
    return { ...newIntent };
  }

  async getIntent(id: string): Promise<CommunicationIntent | null> {
    const intent = this.intents.get(id);
    return intent ? { ...intent } : null;
  }

  async listIntents(filter?: IntentFilter): Promise<CommunicationIntent[]> {
    let result = Array.from(this.intents.values());
    if (filter) {
      if (filter.employeeRole) {
        result = result.filter((i) => i.employeeRole === filter.employeeRole);
      }
      if (filter.type) {
        result = result.filter((i) => i.type === filter.type);
      }
      if (filter.channel) {
        result = result.filter((i) => i.channel === filter.channel);
      }
      if (filter.workflowInstanceId) {
        result = result.filter((i) => i.workflowRef?.workflowInstanceId === filter.workflowInstanceId);
      }
    }
    return result.map((i) => ({ ...i }));
  }

  // --- Webhook Events ---
  async recordWebhookEvent(event: CommunicationWebhookEvent): Promise<CommunicationWebhookEvent> {
    this.webhookEvents.set(event.id, { ...event });
    return { ...event };
  }

  async hasProcessedWebhookEvent(eventId: string): Promise<boolean> {
    return this.webhookEvents.has(eventId);
  }

  async getWebhookEvent(eventId: string): Promise<CommunicationWebhookEvent | null> {
    const event = this.webhookEvents.get(eventId);
    return event ? { ...event } : null;
  }

  async listWebhookEvents(): Promise<CommunicationWebhookEvent[]> {
    return Array.from(this.webhookEvents.values()).map((e) => ({ ...e }));
  }

  // Clear all for testing
  clear(): void {
    this.contacts.clear();
    this.organizations.clear();
    this.conversations.clear();
    this.messages.clear();
    this.drafts.clear();
    this.intents.clear();
    this.webhookEvents.clear();
  }
}
