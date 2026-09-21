import {
  RealtimeModelProvider,
  RealtimeProviderTurnInput,
  RealtimeProviderTurnOutput,
} from './types';
import { generateText } from '../../ai/zai-client';

/**
 * Gemini Pro / Flash Realtime Provider.
 *
 * Implements RealtimeModelProvider using Google Gemini.
 * Never leaks API keys to the browser client.
 */
export class GeminiRealtimeProvider implements RealtimeModelProvider {
  public readonly providerId = 'gemini';
  public readonly displayName = 'Google Gemini Pro';
  public readonly modelId = 'gemini-1.5-pro';
  public readonly capabilities = {
    audioStreaming: true,
    visionInput: true,
    functionCalling: true,
    streamingText: true,
  };

  private apiKey: string | null = null;

  public constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || null;
  }

  public async executeTurn(
    input: RealtimeProviderTurnInput,
    onDelta?: (delta: string) => void
  ): Promise<RealtimeProviderTurnOutput> {
    const start = Date.now();
    const cleanKey = this.apiKey && this.apiKey !== 'MY_GEMINI_API_KEY' ? this.apiKey : null;

    // Build unified messages list
    const systemPrompt =
      input.systemInstruction ||
      'You are Sophia, the AI Chief Operating Officer and persistent intelligence of SamJuniors. Be concise, precise, strategic, and professional. The founder is interacting via the realtime lab.';

    // If native Gemini API Key is available, call the official Gemini REST endpoint
    if (cleanKey) {
      try {
        const contents: Array<{ role: string; parts: Array<Record<string, any>> }> = [];

        // Add conversation history
        if (input.conversationHistory && input.conversationHistory.length > 0) {
          for (const msg of input.conversationHistory.slice(-8)) {
            contents.push({
              role: msg.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: msg.content }],
            });
          }
        }

        // Current turn parts (including vision snapshot and audio recording if provided)
        const currentParts: Array<Record<string, any>> = [];
        if (input.cameraSnapshot?.base64Data) {
          currentParts.push({
            inline_data: {
              mime_type: input.cameraSnapshot.mimeType || 'image/jpeg',
              data: input.cameraSnapshot.base64Data,
            },
          });
        }
        if (input.audioRecording?.base64Data) {
          currentParts.push({
            inline_data: {
              mime_type: input.audioRecording.mimeType || 'audio/webm',
              data: input.audioRecording.base64Data,
            },
          });
        }
        if (input.founderMessage) {
          currentParts.push({ text: input.founderMessage });
        } else if (!input.cameraSnapshot && !input.audioRecording) {
          currentParts.push({ text: 'Hello' });
        }

        contents.push({
          role: 'user',
          parts: currentParts,
        });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:generateContent?key=${encodeURIComponent(
          cleanKey
        )}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemPrompt }],
            },
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1024,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const candidate = data.candidates?.[0];
          const text =
            candidate?.content?.parts?.map((p: any) => p.text || '').join('') || '';

          if (text) {
            if (onDelta) onDelta(text);
            return {
              turnId: input.turnId,
              providerId: this.providerId,
              modelUsed: this.modelId,
              fullText: text,
              durationMs: Date.now() - start,
              costEstimateUsd: 0.0004,
              detectedIntent: text.toLowerCase().includes('plan') ? 'directive' : 'conversation',
            };
          }
        }
      } catch (err) {
        console.warn('[GeminiRealtimeProvider] Gemini direct API call failed, attempting fallback client:', err);
      }
    }

    // Fallback: Use shared AI Client (zai-client)
    try {
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      if (input.conversationHistory) {
        for (const m of input.conversationHistory.slice(-6)) {
          if (m.role === 'user' || m.role === 'assistant') {
            messages.push({ role: m.role, content: m.content });
          }
        }
      }
      messages.push({ role: 'user', content: input.founderMessage });

      const reply = await generateText({
        system: systemPrompt,
        messages,
      });

      if (onDelta) onDelta(reply);

      return {
        turnId: input.turnId,
        providerId: this.providerId,
        modelUsed: 'gemini-fallback',
        fullText: reply,
        durationMs: Date.now() - start,
        costEstimateUsd: 0,
        detectedIntent: 'conversation',
      };
    } catch (fallbackErr) {
      // Deterministic emergency fallback
      const durationMs = Date.now() - start;
      const isAction =
        input.founderMessage &&
        /^(please\s+)?(research|plan|audit|review|analyze|calculate|build|execute|model|orchestrate|run|start|transfer|delete|drop|send|deploy|publish|create|remove|pay|hire|fire)\b/i.test(
          input.founderMessage
        );
      const fallbackText = isAction
        ? `Acknowledged. Directing executive council on: "${input.founderMessage}".`
        : `Acknowledged. Sophia core is standing by for company operations.`;
      if (onDelta) onDelta(fallbackText);
      return {
        turnId: input.turnId,
        providerId: this.providerId,
        modelUsed: 'deterministic-offline-fallback',
        fullText: fallbackText,
        durationMs,
        detectedIntent: isAction ? 'directive' : 'conversation',
      };
    }
  }
}
