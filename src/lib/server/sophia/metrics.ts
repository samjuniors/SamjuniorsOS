import { TurnMetrics } from './types';

/**
 * StopWatch utility for precise, low-overhead phase timing in Sophia turns.
 */
export class TurnStopwatch {
  private startTime: number;
  private contextAssemblyDuration: number = 0;
  private modelDuration: number = 0;
  private gatewayDuration: number = 0;
  private inputChars: number = 0;
  private outputChars: number = 0;

  constructor() {
    this.startTime = Date.now();
  }

  public recordContextAssembly(durationMs: number, chars: number = 0): void {
    this.contextAssemblyDuration = durationMs;
    this.inputChars += chars;
  }

  public recordModel(durationMs: number, charsIn: number = 0, charsOut: number = 0): void {
    this.modelDuration = durationMs;
    this.inputChars += charsIn;
    this.outputChars += charsOut;
  }

  public recordGateway(durationMs: number): void {
    this.gatewayDuration = durationMs;
  }

  public finalize(): TurnMetrics {
    const totalTurnMs = Date.now() - this.startTime;
    return {
      contextAssemblyMs: Math.round(this.contextAssemblyDuration),
      modelMs: Math.round(this.modelDuration),
      gatewayValidationMs: Math.round(this.gatewayDuration),
      totalTurnMs: Math.round(totalTurnMs),
      estimatedTokens: {
        input: Math.ceil(this.inputChars / 4),
        output: Math.ceil(this.outputChars / 4),
      },
    };
  }
}
