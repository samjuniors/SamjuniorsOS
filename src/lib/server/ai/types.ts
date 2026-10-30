/**
 * Provider-Neutral LLM & Conversation Types (M1.1 / G6.1).
 *
 * Defines the contract between SamJuniorsOS cognitive surfaces
 * (Sophia intent classifier, turn executor, agents, chat) and underlying
 * model providers (Gemini, OpenAI, LM Studio, Fake, Z-AI).
 *
 * Core rule: No provider-specific types or vendor logic in business code.
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface GenerateOptions {
  /** System instruction or prompt guidance */
  system?: string;
  /** Ordered chat conversation turns */
  messages: ChatMessage[];
  /** Optional temperature (0.0 to 1.0) */
  temperature?: number;
  /** Optional token limit */
  maxTokens?: number;
  /** Optional request timeout in milliseconds */
  timeoutMs?: number;
}

export interface ProviderGenerateResult {
  text: string;
  providerId: string;
  model: string;
  liveAi: boolean;
  raw?: unknown;
}

export interface WebSearchResultItem {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  rank: number;
  date: string;
  favicon: string;
}

export interface ConversationProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  generateText(options: GenerateOptions): Promise<ProviderGenerateResult>;
  streamText?(
    options: GenerateOptions,
    onDelta: (delta: string) => void
  ): Promise<ProviderGenerateResult>;
}
