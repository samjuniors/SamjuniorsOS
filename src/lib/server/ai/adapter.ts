import {
  ConversationProvider,
  GenerateOptions,
  ProviderGenerateResult,
  WebSearchResultItem,
} from './types';
import { GeminiConversationProvider } from './providers/gemini';
import { OpenAIConversationProvider } from './providers/openai';
import { LMStudioConversationProvider } from './providers/lmstudio';
import { FakeConversationProvider } from './providers/fake';
import { ZaiConversationProvider } from './providers/zai';
import { searchWeb as zaiSearchWeb, parseJsonLoose } from './zai-client';

/**
 * Circuit breaker state per provider ID.
 */
interface ProviderHealth {
  fails: number;
  until: number;
}

export class ConversationAdapterRegistry {
  private static instance: ConversationAdapterRegistry | null = null;

  public static getInstance(): ConversationAdapterRegistry {
    if (!this.instance) {
      this.instance = new ConversationAdapterRegistry();
    }
    return this.instance;
  }

  public static resetInstance(): void {
    this.instance = null;
  }

  private providers = new Map<string, ConversationProvider>();
  private health = new Map<string, ProviderHealth>();
  private activePin: string | null = null;

  constructor() {
    this.register(new GeminiConversationProvider());
    this.register(new OpenAIConversationProvider());
    this.register(new LMStudioConversationProvider());
    this.register(new FakeConversationProvider());
    this.register(new ZaiConversationProvider());
  }

  public register(provider: ConversationProvider): void {
    this.providers.set(provider.id.toLowerCase(), provider);
  }

  public getProvider(id: string): ConversationProvider | undefined {
    return this.providers.get(id.toLowerCase());
  }

  public getFakeProvider(): FakeConversationProvider {
    return this.providers.get('fake') as FakeConversationProvider;
  }

  public setPin(id: string | null): void {
    this.activePin = id ? id.toLowerCase().trim() : null;
  }

  public getPin(): string | null {
    if (this.activePin) return this.activePin;
    const envPin = (
      process.env.SOFIA_LLM_PROVIDER ||
      process.env.JARVIS_LLM_PROVIDER ||
      process.env.SOPHIA_BRAIN_MODE ||
      ''
    ).toLowerCase().trim();
    if (envPin && envPin !== 'auto') {
      return envPin;
    }
    return null;
  }

  private isCooling(id: string): boolean {
    const h = this.health.get(id);
    return Boolean(h && h.until > Date.now());
  }

  private trip(id: string): void {
    const h = this.health.get(id) ?? { fails: 0, until: 0 };
    h.fails += 1;
    if (h.fails >= 3) {
      h.until = Date.now() + 60_000;
      h.fails = 0;
    }
    this.health.set(id, h);
  }

  private heal(id: string): void {
    this.health.set(id, { fails: 0, until: 0 });
  }

  /**
   * Resolves the candidate providers in G0.8 priority order:
   * 1. Pinned provider (if pin set)
   * 2. Gemini (primary working provider)
   * 3. OpenAI (cloud fallback)
   * 4. LM Studio (local model fallback)
   * 5. Z-AI (sandbox fallback)
   */
  public getCandidateChain(): ConversationProvider[] {
    const pin = this.getPin();
    if (pin) {
      const p = this.providers.get(pin);
      if (p) return [p];
    }

    const priorityOrder = ['gemini', 'openai', 'lmstudio', 'zai'];
    const candidates: ConversationProvider[] = [];

    for (const id of priorityOrder) {
      const p = this.providers.get(id);
      if (p && p.isConfigured()) {
        candidates.push(p);
      }
    }

    // If no provider is configured, return all registered so health reporting shows them
    return candidates.length > 0 ? candidates : [this.providers.get('gemini')!];
  }

  /**
   * Executes completion across the candidate chain with failover.
   */
  public async execute(options: GenerateOptions): Promise<ProviderGenerateResult> {
    const chain = this.getCandidateChain();
    let lastError: Error | null = null;

    for (const provider of chain) {
      if (this.isCooling(provider.id) && chain.length > 1) {
        continue;
      }

      try {
        const result = await provider.generateText(options);
        this.heal(provider.id);
        return result;
      } catch (err: any) {
        this.trip(provider.id);
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[ConversationAdapter] Provider "${provider.id}" failed: ${lastError.message}`);
      }
    }

    throw lastError || new Error('No AI conversation provider available');
  }

  /**
   * Synchronous check if any live provider is configured.
   */
  public isConfigured(): boolean {
    const pin = this.getPin();
    if (pin) {
      const p = this.providers.get(pin);
      return Boolean(p && p.isConfigured());
    }
    return ['gemini', 'openai', 'lmstudio', 'zai'].some(id => {
      const p = this.providers.get(id);
      return p && p.isConfigured();
    });
  }

  /**
   * Health report for /api/sofia/health and system indicators.
   */
  public getHealthReport() {
    const pin = this.getPin();
    const all = ['gemini', 'openai', 'lmstudio', 'zai'].map(id => {
      const p = this.providers.get(id)!;
      const configured = p ? p.isConfigured() : false;
      const cooling = this.isCooling(id);
      return {
        id,
        label: p ? p.label : id,
        configured,
        cooling,
        healthy: configured && !cooling,
      };
    });

    const active = pin
      ? pin
      : all.find(p => p.configured && p.healthy)?.id || (all[0]?.id ?? 'gemini');

    return {
      active,
      pin,
      providers: all,
    };
  }
}

/** Convenience singleton helpers */
const registry = ConversationAdapterRegistry.getInstance();

export async function generateConversationReply(options: GenerateOptions): Promise<ProviderGenerateResult> {
  return ConversationAdapterRegistry.getInstance().execute(options);
}

export async function generateText(options: GenerateOptions): Promise<string> {
  const res = await generateConversationReply(options);
  return res.text;
}

export async function generateJson<T = any>(options: GenerateOptions): Promise<T> {
  const text = await generateText(options);
  return parseJsonLoose(text) as T;
}

export function isAIConfigured(): boolean {
  return ConversationAdapterRegistry.getInstance().isConfigured();
}

export { parseJsonLoose };
export { zaiSearchWeb as searchWeb };
