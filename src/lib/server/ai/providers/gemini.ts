import { ConversationProvider, GenerateOptions, ProviderGenerateResult } from '../types';

/**
 * Google Gemini REST Provider (M1.1 / G0.8 Primary Provider).
 * Uses standard fetch to the Google Generative Language v1beta API.
 * Supports batch generateContent and SSE streamed streamGenerateContent.
 * Requires zero heavy npm SDKs.
 */
export class GeminiConversationProvider implements ConversationProvider {
  public readonly id = 'gemini';
  public readonly label = 'Google Gemini (Live)';

  private cleanKey(raw: string | undefined): string | null {
    if (!raw) return null;
    let k = raw.trim();
    if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
      k = k.slice(1, -1).trim();
    }
    return k && k.length > 5 ? k : null;
  }

  private getApiKey(): string | null {
    return (
      this.cleanKey(process.env.GEMINI_API_KEY) ||
      this.cleanKey(process.env.GOOGLE_API_KEY) ||
      null
    );
  }

  public isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  public getModelName(): string {
    return (
      process.env.GEMINI_TEXT_MODEL?.trim() ||
      process.env.GEMINI_MODEL?.trim() ||
      'gemini-3.5-flash'
    );
  }

  private buildRequestBody(options: GenerateOptions): Record<string, unknown> {
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    for (const msg of options.messages) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    const requestBody: Record<string, unknown> = {
      contents,
    };

    if (options.system && options.system.trim()) {
      requestBody.systemInstruction = {
        parts: [{ text: options.system }],
      };
    }

    if (typeof options.temperature === 'number') {
      requestBody.generationConfig = {
        temperature: options.temperature,
      };
    }

    return requestBody;
  }

  public async generateText(options: GenerateOptions): Promise<ProviderGenerateResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const model = this.getModelName();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const requestBody = this.buildRequestBody(options);
    const timeout = options.timeoutMs ?? 15000;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini API HTTP ${res.status}: ${errText.slice(0, 250)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return {
      text,
      providerId: this.id,
      model,
      liveAi: true,
      raw: data,
    };
  }

  public async streamText(
    options: GenerateOptions,
    onDelta: (delta: string) => void
  ): Promise<ProviderGenerateResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const model = this.getModelName();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const requestBody = this.buildRequestBody(options);
    const timeout = options.timeoutMs ?? 25000;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini API Stream HTTP ${res.status}: ${errText.slice(0, 250)}`);
    }

    if (!res.body) {
      // If no streaming body is exposed by runtime, fall back to batch
      return this.generateText(options);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6).trim();
            if (dataStr && dataStr !== '[DONE]') {
              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (typeof delta === 'string' && delta.length > 0) {
                  accumulatedText += delta;
                  onDelta(delta);
                }
              } catch {
                // Ignore transient JSON parse chunks in SSE line buffer
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      text: accumulatedText,
      providerId: this.id,
      model,
      liveAi: true,
    };
  }
}
