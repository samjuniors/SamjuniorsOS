import { RealtimeModelProvider } from './types';
import { GeminiRealtimeProvider } from './gemini-provider';

export * from './types';
export * from './gemini-provider';

const providers: Map<string, RealtimeModelProvider> = new Map();

// Initialize default providers
const defaultGemini = new GeminiRealtimeProvider();
providers.set(defaultGemini.providerId, defaultGemini);

export function getRealtimeProvider(providerId = 'gemini'): RealtimeModelProvider {
  const provider = providers.get(providerId);
  if (!provider) {
    throw new Error(`Realtime provider '${providerId}' is not registered`);
  }
  return provider;
}

export function listRealtimeProviders(): Array<{
  id: string;
  name: string;
  model: string;
  capabilities: RealtimeModelProvider['capabilities'];
}> {
  return Array.from(providers.values()).map((p) => ({
    id: p.providerId,
    name: p.displayName,
    model: p.modelId,
    capabilities: p.capabilities,
  }));
}
