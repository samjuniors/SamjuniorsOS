import { ConversationProvider, GenerateOptions, ProviderGenerateResult } from '../types';

/**
 * LM Studio Local Provider (M1.1 / G0.8 Local Model Fallback).
 * Connects to the local LM Studio OpenAI-compatible endpoint.
 * Private, runs on local hardware.
 */
export class LMStudioConversationProvider implements ConversationProvider {
  public readonly id = 'lmstudio';
  public readonly label = 'LM Studio (Local)';

  private cleanVal(raw: string | undefined): string | null {
    if (!raw) return null;
    let v = raw.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).trim();
    }
    return v.length > 0 ? v : null;
  }

  public getBaseUrl(): string {
    const raw = this.cleanVal(process.env.LMSTUDIO_BASE_URL) || 'http://localhost:1234/v1';
    let base = raw.replace(/\/+$/, '');
    if (!/\/v\d+$/.test(base)) {
      base += '/v1';
    }
    return base;
  }

  public isConfigured(): boolean {
    return Boolean(this.cleanVal(process.env.LMSTUDIO_BASE_URL));
  }

  public getModelName(): string {
    return this.cleanVal(process.env.LMSTUDIO_MODEL) || 'local-model';
  }

  public async generateText(options: GenerateOptions): Promise<ProviderGenerateResult> {
    const baseUrl = this.getBaseUrl();
    const model = this.getModelName();
    const token =
      this.cleanVal(process.env.LMSTUDIO_API_KEY) ||
      this.cleanVal(process.env.LM_API_TOKEN);

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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const timeout = options.timeoutMs ?? 20000;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`LM Studio HTTP ${res.status}: ${errText.slice(0, 250)}`);
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
