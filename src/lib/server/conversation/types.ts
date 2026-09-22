/**
 * ============================================================================
 * SOPHIA CONVERSATIONAL SESSIONS & PERSISTENCE — TYPES (PHASE 3)
 * ============================================================================
 * Defines types for server-authoritative dialogue sessions, chat messages,
 * ownership binding to the authenticated Founder, and bounded context history.
 */

export type MessageSender = 'founder' | 'assistant' | 'system';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface ConversationRecord {
  id: string;
  founderId: string;
  title?: string;
  agentId: string; // 'sophia' | 'coo' | 'researcher' | 'pm' | 'finance' | 'advisor'
  status: 'active' | 'archived';
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: string;
  conversationId: string;
  sender: MessageSender;
  role: MessageRole;
  content: string;
  intent?: string;
  confidence?: number;
  commandType?: string;
  idempotencyKey?: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface CreateConversationParams {
  id?: string;
  founderId: string;
  title?: string;
  agentId?: string;
  metadata?: Record<string, any>;
}

export interface CreateChatMessageParams {
  id?: string;
  conversationId: string;
  sender: MessageSender;
  role?: MessageRole;
  content: string;
  intent?: string;
  confidence?: number;
  commandType?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
}

export interface ConversationHistoryItem {
  sender: 'founder' | 'assistant';
  text: string;
  messageId?: string;
  createdAt?: string;
}
