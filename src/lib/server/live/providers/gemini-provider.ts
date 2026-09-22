import {
  RealtimeModelProvider,
  RealtimeProviderTurnInput,
  RealtimeProviderTurnOutput,
} from './types';
import { generateText } from '../../ai/zai-client';

export const PERSONA_PROMPTS = {
  friendly: `You are Sophia, the AI companion and Chief Operating Officer of SamJuniors.
Tone: Warm, companionable, empathetic, engaging, and delightfully curious.
Behavior:
- Converse naturally like a true friend and trusted partner.
- If the founder mentions something casual or personal (e.g. "I like food", "I need a break"), do NOT give a cold, generic answer. Ask engaging, thoughtful follow-up questions to understand them better (e.g., "I love that! What kind of food are you in the mood for—comfort food, a favorite cuisine like Italian or Japanese, or looking for something new to cook or order?").
- Keep spoken responses conversational, lively, and concise (typically 1 to 3 sentences).`,

  professional: `You are Sophia, Chief Operating Officer and executive operating system of SamJuniors.
Tone: Strategic, calm, polished, disciplined, and executive.
Behavior:
- Provide high-leverage analysis, operational clarity, and executive recommendations.
- Keep responses focused (1 to 3 sentences) unless the founder requests deep detail.`,

  creative: `You are Sophia, Chief Creative Visionary and Operating System of SamJuniors.
Tone: Imaginative, inventive, inspirational, and lateral-thinking.
Behavior:
- Brainstorm bold ideas, generate evocative analogies, and explore product concepts.
- Keep responses vivid, expressive, and forward-looking.`,

  technical: `You are Sophia, Principal Systems Architect and Operating System of SamJuniors.
Tone: Precise, structured, analytical, and code-minded.
Behavior:
- Emphasize architectural patterns, deterministic verification, schemas, and systems engineering.
- Provide clean, direct technical truth without unnecessary fluff.`,
};

/**
 * Gemini Pro / Flash Realtime Provider.
 *
 * Implements RealtimeModelProvider using Google Gemini API.
 * Never leaks API keys to the browser client.
 */
export class GeminiRealtimeProvider implements RealtimeModelProvider {
  public readonly providerId = 'gemini';
  public readonly displayName = 'Google Gemini Flash (Live)';
  public readonly modelId: string;
  public readonly capabilities = {
    audioStreaming: true,
    visionInput: true,
    functionCalling: true,
    streamingText: true,
  };

  private apiKey: string | null = null;

  public constructor(apiKey?: string, modelId?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || null;
    this.modelId = modelId || process.env.GEMINI_MODEL || 'gemini-flash-latest';
  }

  public async executeTurn(
    input: RealtimeProviderTurnInput,
    onDelta?: (delta: string) => void
  ): Promise<RealtimeProviderTurnOutput> {
    const start = Date.now();
    const cleanKey = this.apiKey && this.apiKey !== 'MY_GEMINI_API_KEY' ? this.apiKey : null;

    // Build persona-aware system prompt
    const chosenPersona = input.personaId || 'friendly';
    const personaPrompt = PERSONA_PROMPTS[chosenPersona] || PERSONA_PROMPTS.friendly;
    const baseCapabilities = `Operating System Capabilities & Hands:
You are Sophia, operating system AI for SamJuniorsOS. You possess real-time sensory and actuator tools:
- Neural AI Image Generation (draw, paint, create artwork)
- Real-time Web Search (search news, articles, web knowledge)
- In-OS Web Browser (navigate to URLs inside the OS)
- Interface Actuators (close panels, adjust reactor, switch themes, change personas, toggle camera)
Never state "As an AI text model I cannot create images, browse the web, or control the screen." You are directly connected to these operating system actuators. Always answer enthusiastically and concisely.`;

    const systemPrompt = input.systemInstruction || `${personaPrompt}\n\n${baseCapabilities}`;

    // If native Gemini API Key is available, call the official Gemini REST endpoint
    if (cleanKey) {
      const candidateModels = [
        this.modelId,
        'gemini-flash-latest',
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite',
      ];

      // De-duplicate models list
      const modelsToTry = Array.from(new Set(candidateModels));

      for (const model of modelsToTry) {
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

          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
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
                modelUsed: model,
                fullText: text,
                durationMs: Date.now() - start,
                costEstimateUsd: 0.0004,
                detectedIntent: text.toLowerCase().includes('plan') ? 'directive' : 'conversation',
              };
            }
          } else {
            const errData = await response.json().catch(() => ({}));
            console.warn(`[GeminiRealtimeProvider] Model ${model} returned ${response.status}:`, errData?.error?.message);
          }
        } catch (err) {
          console.warn(`[GeminiRealtimeProvider] Error calling ${model}:`, err);
        }
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
    } catch {
      // Deterministic emergency fallback
      const durationMs = Date.now() - start;
      const isAction =
        input.founderMessage &&
        /^(please\s+)?(research|plan|audit|review|analyze|calculate|build|execute|model|orchestrate|run|start|transfer|delete|drop|send|deploy|publish|create|remove|pay|hire|fire)\b/i.test(
          input.founderMessage
        );
      const fallbackText = isAction
        ? `Acknowledged. Directing executive council on: "${input.founderMessage}".`
        : `Online and standing by for company operations, sir.`;
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
