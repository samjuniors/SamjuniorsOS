/**
 * SAMJUNIORS OS — REALTIME MODEL PROVIDER CONTRACT
 *
 * Provider-neutral abstraction for realtime/conversational model backends.
 * Prevents vendor lock-in (Gemini, OpenAI Realtime, Grok, local open-weight models).
 *
 * Invariants:
 * 1. Model providers are execution capabilities, NOT Sophia.
 * 2. Providers receive sanitized inputs and produce streamed text deltas.
 * 3. Side effects and directives route through Sophia/Core and SideEffectAuthorizationGate.
 * 4. API keys and provider credentials NEVER leak to the browser.
 */

export interface RealtimeProviderTurnInput {
  turnId: string;
  sessionId: string;
  founderMessage: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  systemInstruction?: string;
  /** Optional sample-gated camera or screen still frame */
  cameraSnapshot?: {
    mimeType: string;
    /** Base64-encoded image data */
    base64Data: string;
  };
  /** Optional audio recording from browser (e.g. audio/webm base64) */
  audioRecording?: {
    mimeType: string;
    base64Data: string;
  };
}

export interface RealtimeProviderTurnOutput {
  turnId: string;
  providerId: string;
  modelUsed: string;
  fullText: string;
  durationMs: number;
  costEstimateUsd?: number;
  /** Directives or governance actions extracted from model response */
  detectedIntent?: 'conversation' | 'directive' | 'query' | 'unknown';
}

export interface RealtimeModelProvider {
  readonly providerId: string;
  readonly displayName: string;
  readonly modelId: string;
  readonly capabilities: {
    audioStreaming: boolean;
    visionInput: boolean;
    functionCalling: boolean;
    streamingText: boolean;
  };

  /**
   * Execute a conversational or multimodal turn.
   * Can stream incremental text chunks via onDelta callback.
   */
  executeTurn(
    input: RealtimeProviderTurnInput,
    onDelta?: (delta: string) => void
  ): Promise<RealtimeProviderTurnOutput>;
}
