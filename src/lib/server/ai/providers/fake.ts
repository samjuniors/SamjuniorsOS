import { ConversationProvider, GenerateOptions, ProviderGenerateResult } from '../types';

/**
 * Fake Conversation Provider for automated testing, CI, and test doubles.
 * Allows setting canned responses or dynamic generator functions without network calls.
 */
export class FakeConversationProvider implements ConversationProvider {
  public readonly id = 'fake';
  public readonly label = 'Fake Test Provider';

  private responseQueue: string[] = [];
  private generatorFn: ((options: GenerateOptions) => string | Promise<string>) | null = null;
  private configured = true;

  constructor() {
    this.responseQueue = [];
  }

  public isConfigured(): boolean {
    return this.configured;
  }

  public setConfigured(configured: boolean): void {
    this.configured = configured;
  }

  public enqueueResponse(text: string): void {
    this.responseQueue.push(text);
  }

  public setGenerator(fn: ((options: GenerateOptions) => string | Promise<string>) | null): void {
    this.generatorFn = fn;
  }

  public clearQueue(): void {
    this.responseQueue = [];
  }

  public async generateText(options: GenerateOptions): Promise<ProviderGenerateResult> {
    if (!this.configured) {
      throw new Error('Fake provider is unconfigured');
    }

    let text: string;
    if (this.generatorFn) {
      text = await this.generatorFn(options);
    } else if (this.responseQueue.length > 0) {
      text = this.responseQueue.shift()!;
    } else {
      text = 'Default canned response from Fake Provider';
    }

    return {
      text,
      providerId: this.id,
      model: 'fake-v1',
      liveAi: true,
    };
  }
}
