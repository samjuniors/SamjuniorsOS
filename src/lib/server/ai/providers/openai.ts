import { ConversationProvider, GenerateOptions, ProviderGenerateResult, ChatMessage } from '../types';

/**
 * OpenAI REST Provider (M1.1 / G0.8 Cloud Fallback).
 * Uses standard fetch with Bearer authentication.
 */
export class OpenAIConversationProvider implements ConversationProvider {
  public readonly id = 'openai';
  public readonly label = 'OpenAI (Cloud Fallback)';

  private cleanKey(raw: string | undefined): string | null {
    if (!raw) return null;
    let k = raw.trim();
    if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
      k = k.slice(1, -1).trim();
    }
    return k && k.length > 5 ? k : null;
  }

  private getApiKey(): string | null {
    return this.cleanKey(process.env.OPENAI_API_KEY);
  }

  public isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  public getModelName(): string {
    return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  }

  public async generateText(options: GenerateOptions): Promise<ProviderGenerateResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const model = this.getModelName();
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (options.system && options.system.trim()) {
      messages.push({ role: 'system', content: options.system.trim() });
    }

    for (const msg of options.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const requestBody: Record<string, unknown> = {
      model,
      messages,
    };

    if (typeof options.temperature === 'number') {
      requestBody.temperature = options.temperature;
    }

    const timeout = options.timeoutMs ?? 15000;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI API HTTP ${res.status}: ${errText.slice(0, 250)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const text = data.choices?.[0]?.message?.content ?? '';

    return {
      text,
      providerId: this.id,
      model,
      liveAi: true,
      raw: data,
    };
  }
}
