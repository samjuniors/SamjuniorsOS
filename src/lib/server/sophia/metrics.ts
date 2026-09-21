import { TurnMetrics } from './types';

/**
 * StopWatch utility for precise, low-overhead phase timing in Sophia turns.
 */
export class TurnStopwatch {
  private startTime: number;
  private contextAssemblyDuration: number = 0;
  private retrievalDuration: number = 0;
  private modelDuration: number = 0;
  private gatewayDuration: number = 0;
  private inputChars: number = 0;
  private outputChars: number = 0;
  private dynamicPayloadChars: number = 0;
  private systemPromptChars: number = 0;
  private retrievalHit: boolean = false;
  private degradedStores: string[] = [];
  private breakdown: NonNullable<TurnMetrics['estimatedTokens']['breakdown']> = {};

  constructor() {
    this.startTime = Date.now();
  }

  public recordContextAssembly(durationMs: number, chars: number = 0): void {
    this.contextAssemblyDuration = durationMs;
    this.dynamicPayloadChars = chars;
    this.inputChars += chars;
  }

  public recordRetrieval(durationMs: number, hit: boolean = false): void {
    this.retrievalDuration = durationMs;
    if (hit) this.retrievalHit = true;
  }

  public recordDegradedStore(storeName: string): void {
    if (!this.degradedStores.includes(storeName)) {
      this.degradedStores.push(storeName);
    }
  }

  public recordBreakdown(breakdown: NonNullable<TurnMetrics['estimatedTokens']['breakdown']>): void {
    this.breakdown = { ...this.breakdown, ...breakdown };
  }

  public recordModel(durationMs: number, charsIn: number = 0, charsOut: number = 0, systemChars: number = 0): void {
    this.modelDuration = durationMs;
    this.inputChars += charsIn;
    this.outputChars += charsOut;
    this.systemPromptChars = systemChars;
  }

  public recordGateway(durationMs: number): void {
    this.gatewayDuration = durationMs;
  }

  public finalize(): TurnMetrics {
    const totalTurnMs = Date.now() - this.startTime;
    return {
      contextAssemblyMs: Math.round(this.contextAssemblyDuration),
      retrievalMs: Math.round(this.retrievalDuration),
      modelMs: Math.round(this.modelDuration),
      gatewayValidationMs: Math.round(this.gatewayDuration),
      totalTurnMs: Math.round(totalTurnMs),
      estimatedTokens: {
        input: Math.ceil(this.inputChars / 4),
        output: Math.ceil(this.outputChars / 4),
        dynamicPayload: Math.ceil(this.dynamicPayloadChars / 4),
        systemPrompt: Math.ceil(this.systemPromptChars / 4),
        breakdown: this.breakdown,
      },
      retrievalHit: this.retrievalHit,
      degradedStores: this.degradedStores.length > 0 ? [...this.degradedStores] : undefined,
    };
  }
}
