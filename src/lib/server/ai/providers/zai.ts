import { ConversationProvider, GenerateOptions, ProviderGenerateResult } from '../types';
import { getAIClient, ChatMessage as ZaiChatMessage } from '../zai-client';

/**
 * Z-AI SDK Provider (Pre-existing sandbox integration).
 * Preserves compatibility with existing sandbox SDK deployment.
 */
export class ZaiConversationProvider implements ConversationProvider {
  public readonly id = 'zai';
  public readonly label = 'Z-AI';

  public isConfigured(): boolean {
    // In sandboxes where z-ai is provisioned, this succeeds.
    return true;
  }

  public async generateText(options: GenerateOptions): Promise<ProviderGenerateResult> {
    const zai = await getAIClient();
    const messages: ZaiChatMessage[] = [];

    if (options.system && options.system.trim()) {
      messages.push({ role: 'assistant', content: options.system });
    }

    for (const msg of options.messages) {
      messages.push({
        role: msg.role === 'system' ? 'assistant' : msg.role,
        content: msg.content,
      });
    }

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    });

    const text = completion.choices[0]?.message?.content || '';

    return {
      text,
      providerId: this.id,
      model: 'zai-llm',
      liveAi: true,
      raw: completion,
    };
  }
}
