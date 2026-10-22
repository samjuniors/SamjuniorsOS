/**
 * Canonical AI Provider Subsystem (M1.1 / G6.1).
 *
 * Exposes provider-neutral conversation generation and search abstractions
 * behind stable interfaces. Keeps zero vendor-specific code in business modules.
 */

export * from './types';
export * from './adapter';
export { getAIClient } from './zai-client';
export { GeminiConversationProvider } from './providers/gemini';
export { OpenAIConversationProvider } from './providers/openai';
export { LMStudioConversationProvider } from './providers/lmstudio';
export { FakeConversationProvider } from './providers/fake';
export { ZaiConversationProvider } from './providers/zai';
