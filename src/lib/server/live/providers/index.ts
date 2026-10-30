import { RealtimeModelProvider } from './types';
import { GeminiRealtimeProvider } from './gemini-provider';
import { FakeRealtimeModelProvider } from './fake-provider';

export * from './types';
export * from './gemini-provider';
export * from './fake-provider';

const providers: Map<string, RealtimeModelProvider> = new Map();

function initDefaultProviders() {
  providers.clear();
  const defaultGemini = new GeminiRealtimeProvider();
  const defaultFake = new FakeRealtimeModelProvider();
  providers.set(defaultGemini.providerId, defaultGemini);
  providers.set(defaultFake.providerId, defaultFake);
}

initDefaultProviders();

export function registerRealtimeProvider(provider: RealtimeModelProvider): void {
  providers.set(provider.providerId.toLowerCase(), provider);
}

export function resetRealtimeProviders(): void {
  initDefaultProviders();
}

export function getFakeRealtimeProvider(): FakeRealtimeModelProvider {
  return providers.get('fake') as FakeRealtimeModelProvider;
}

export function getActiveRealtimeProviderId(): string {
  const envPin = (
    process.env.SOFIA_REALTIME_PROVIDER ||
    process.env.SOFIA_LLM_PROVIDER ||
    process.env.JARVIS_LLM_PROVIDER ||
    ''
  ).toLowerCase().trim();

  if (envPin && envPin !== 'auto' && providers.has(envPin)) {
    return envPin;
  }

  // If in a test environment without cloud keys, prioritize fake
  if (process.env.NODE_ENV === 'test' && !process.env.GEMINI_API_KEY) {
    if (providers.has('fake')) return 'fake';
  }

  return 'gemini';
}

export function getRealtimeProvider(providerId?: string): RealtimeModelProvider {
  const targetId = (!providerId || providerId === 'default' || providerId === 'auto')
    ? getActiveRealtimeProviderId()
    : providerId.toLowerCase().trim();

  const provider = providers.get(targetId);
  if (!provider) {
    throw new Error(`Realtime provider '${targetId}' is not registered. Available: ${Array.from(providers.keys()).join(', ')}`);
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
