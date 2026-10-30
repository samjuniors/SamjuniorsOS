import {
  RealtimeModelProvider,
  RealtimeProviderTurnInput,
  RealtimeProviderTurnOutput,
} from './types';

/**
 * Fake Realtime Model Provider (G6.1 test double).
 * Implements RealtimeModelProvider with configurable canned responses,
 * dynamic generator functions, simulated streaming text deltas, and zero network calls.
 */
export class FakeRealtimeModelProvider implements RealtimeModelProvider {
  public readonly providerId = 'fake';
  public readonly displayName = 'Fake Test Realtime Provider';
  public readonly modelId = 'fake-realtime-v1';
  public readonly capabilities = {
    audioStreaming: true,
    visionInput: true,
    functionCalling: true,
    streamingText: true,
  };

  private responseQueue: string[] = [];
  private generatorFn: ((input: RealtimeProviderTurnInput) => string | Promise<string>) | null = null;
  private configured = true;

  public isConfigured(): boolean {
    return this.configured;
  }

  public setConfigured(configured: boolean): void {
    this.configured = configured;
  }

  public enqueueResponse(text: string): void {
    this.responseQueue.push(text);
  }

  public setGenerator(fn: ((input: RealtimeProviderTurnInput) => string | Promise<string>) | null): void {
    this.generatorFn = fn;
  }

  public clearQueue(): void {
    this.responseQueue = [];
  }

  public async executeTurn(
    input: RealtimeProviderTurnInput,
    onDelta?: (delta: string) => void
  ): Promise<RealtimeProviderTurnOutput> {
    if (!this.configured) {
      throw new Error('Fake realtime provider is unconfigured');
    }

    let replyText = 'Default canned response from Fake Realtime Provider';
    if (this.generatorFn) {
      replyText = await this.generatorFn(input);
    } else if (this.responseQueue.length > 0) {
      replyText = this.responseQueue.shift()!;
    }

    if (onDelta) {
      const chunks = replyText.split(/(\s+)/);
      for (const chunk of chunks) {
        if (chunk.length > 0) {
          onDelta(chunk);
        }
      }
    }

    const isDirective =
      replyText.toLowerCase().includes('directive') ||
      replyText.toLowerCase().includes('action') ||
      replyText.toLowerCase().includes('plan');

    return {
      turnId: input.turnId,
      providerId: this.providerId,
      modelUsed: this.modelId,
      fullText: replyText,
      durationMs: 5,
      costEstimateUsd: 0,
      detectedIntent: isDirective ? 'directive' : 'conversation',
    };
  }
}
