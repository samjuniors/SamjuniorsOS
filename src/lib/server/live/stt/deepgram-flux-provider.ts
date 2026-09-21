import { WebSocket } from 'ws';
import {
  STTProvider,
  STTProviderSessionOptions,
  CanonicalTranscriptEvent,
  STTWordTiming,
} from './types';

export interface DeepgramFluxConfig {
  apiKey?: string;
  model?: string; // default: 'flux-general-en'
  endpoint?: string; // default: 'wss://api.deepgram.com/v2/listen'
  targetChunkBytes?: number; // default: 2560 (80ms at 16kHz Int16)
}

/**
 * ============================================================================
 * DEEPGRAM FLUX STT PROVIDER ADAPTER (PHASE 4C-B)
 * ============================================================================
 * Streaming conversational Speech-to-Text adapter wrapping Deepgram's v2 API.
 * Encapsulates:
 * 1. Secure token authentication strictly on server-side.
 * 2. 80ms PCM frame aggregation (2560 bytes) for optimal latency/throughput.
 * 3. Normalization of TurnInfo messages (StartOfTurn, Update, EndOfTurn).
 * 4. PTT turn finalization via ForceEndTurn control messages.
 * 5. Provider-neutral event emission (CanonicalTranscriptEvent).
 */
export class DeepgramFluxProvider implements STTProvider {
  public readonly providerId = 'deepgram-flux';
  public readonly providerName = 'Deepgram Flux STT';

  private apiKey: string;
  private model: string;
  private endpoint: string;
  private targetChunkBytes: number;

  private ws: WebSocket | null = null;
  private sessionOpts: STTProviderSessionOptions | null = null;
  private audioBuffer: Buffer = Buffer.alloc(0);

  private eventListeners: Array<(event: CanonicalTranscriptEvent) => void> = [];
  private errorListeners: Array<(error: Error) => void> = [];

  private isConnected = false;
  private isTurnEnding = false;

  constructor(config: DeepgramFluxConfig = {}) {
    this.apiKey = config.apiKey || process.env.DEEPGRAM_API_KEY || '';
    this.model = config.model || process.env.DEEPGRAM_MODEL || 'flux-general-en';
    this.endpoint = config.endpoint || 'wss://api.deepgram.com/v2/listen';
    this.targetChunkBytes = config.targetChunkBytes || 2560; // 80ms at 16kHz mono 16-bit PCM
  }

  public onEvent(listener: (event: CanonicalTranscriptEvent) => void): void {
    this.eventListeners.push(listener);
  }

  public onError(listener: (error: Error) => void): void {
    this.errorListeners.push(listener);
  }

  private emitEvent(event: CanonicalTranscriptEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[DeepgramFluxProvider] Error in event listener:', err);
      }
    }
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (err) {
        console.error('[DeepgramFluxProvider] Error in error listener:', err);
      }
    }
  }

  /**
   * Starts a streaming STT session for the specified turn.
   */
  public async startStream(opts: STTProviderSessionOptions): Promise<void> {
    this.sessionOpts = opts;
    this.audioBuffer = Buffer.alloc(0);
    this.isTurnEnding = false;

    // Fail closed if server credentials are absent
    if (!this.apiKey) {
      const missingKeyError = new Error('DEEPGRAM_API_KEY is not configured on server');
      this.emitEvent({
        kind: 'error',
        turnId: opts.turnId,
        sessionId: opts.sessionId,
        conversationId: opts.conversationId,
        text: '',
        isFinal: false,
        timestamp: Date.now(),
        error: {
          code: 'DEEPGRAM_API_KEY_MISSING',
          message: 'DEEPGRAM_API_KEY is not configured on server',
          fatal: true,
        },
      });
      this.emitError(missingKeyError);
      throw missingKeyError;
    }

    const queryParams = new URLSearchParams({
      model: this.model,
      encoding: 'linear16',
      sample_rate: String(opts.sampleRate || 16000),
      channels: String(opts.channels || 1),
      mip_opt_out: 'true',
    });

    const targetUrl = `${this.endpoint}?${queryParams.toString()}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(targetUrl, {
          headers: {
            Authorization: `Token ${this.apiKey}`,
          },
        });

        this.ws.on('open', () => {
          this.isConnected = true;
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleProviderMessage(data);
        });

        this.ws.on('error', (err: Error) => {
          console.error('[DeepgramFluxProvider] WebSocket error:', err.message);
          this.emitEvent({
            kind: 'error',
            turnId: opts.turnId,
            sessionId: opts.sessionId,
            conversationId: opts.conversationId,
            text: '',
            isFinal: false,
            timestamp: Date.now(),
            error: {
              code: 'DEEPGRAM_CONNECTION_ERROR',
              message: err.message,
              fatal: false,
            },
          });
          this.emitError(err);
          if (!this.isConnected) {
            reject(err);
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          this.isConnected = false;
          // If connection drops unexpectedly during an active turn
          if (!this.isTurnEnding && this.sessionOpts) {
            this.emitEvent({
              kind: 'error',
              turnId: this.sessionOpts.turnId,
              sessionId: this.sessionOpts.sessionId,
              conversationId: this.sessionOpts.conversationId,
              text: '',
              isFinal: false,
              timestamp: Date.now(),
              error: {
                code: 'DEEPGRAM_DISCONNECTED',
                message: `Deepgram socket closed unexpectedly: ${code} ${reason.toString()}`,
                fatal: false,
              },
            });
          }
        });
      } catch (err: any) {
        reject(err);
      }
    });
  }

  /**
   * Normalizes raw Deepgram JSON events into CanonicalTranscriptEvent.
   */
  public handleProviderMessage(data: WebSocket.Data): void {
    if (!this.sessionOpts) return;

    let payloadText = '';
    if (typeof data === 'string') {
      payloadText = data;
    } else if (Buffer.isBuffer(data)) {
      payloadText = data.toString('utf-8');
    } else {
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(payloadText);
    } catch {
      // Discard malformed JSON safely without throwing
      console.warn('[DeepgramFluxProvider] Discarding malformed provider event payload');
      return;
    }

    const { turnId, sessionId, conversationId } = this.sessionOpts;
    const now = Date.now();

    // 1. Handle TurnInfo events
    if (parsed.type === 'TurnInfo') {
      const eventType = parsed.event;
      const transcript = typeof parsed.transcript === 'string' ? parsed.transcript.trim() : '';

      const words: STTWordTiming[] | undefined = Array.isArray(parsed.words)
        ? parsed.words.map((w: any) => ({
            word: String(w.word || ''),
            confidence: typeof w.confidence === 'number' ? w.confidence : undefined,
            start: typeof w.start === 'number' ? w.start : undefined,
            end: typeof w.end === 'number' ? w.end : undefined,
          }))
        : undefined;

      switch (eventType) {
        case 'StartOfTurn':
          this.emitEvent({
            kind: 'speech_started',
            turnId,
            sessionId,
            conversationId,
            text: '',
            isFinal: false,
            timestamp: now,
          });
          break;

        case 'Update':
        case 'EagerEndOfTurn':
          if (transcript.length > 0) {
            this.emitEvent({
              kind: 'interim_transcript',
              turnId,
              sessionId,
              conversationId,
              text: transcript,
              isFinal: false,
              words,
              confidence: typeof parsed.end_of_turn_confidence === 'number' ? parsed.end_of_turn_confidence : undefined,
              timestamp: now,
            });
          }
          break;

        case 'EndOfTurn':
          this.emitEvent({
            kind: 'final_transcript',
            turnId,
            sessionId,
            conversationId,
            text: transcript,
            isFinal: true,
            words,
            confidence: typeof parsed.end_of_turn_confidence === 'number' ? parsed.end_of_turn_confidence : undefined,
            timestamp: now,
          });
          this.emitEvent({
            kind: 'turn_completed',
            turnId,
            sessionId,
            conversationId,
            text: transcript,
            isFinal: true,
            timestamp: now,
          });
          break;

        default:
          // Ignore other internal events (e.g. TurnResumed) safely
          break;
      }
      return;
    }

    // 2. Handle provider error messages
    if (parsed.type === 'Error' || parsed.error) {
      this.emitEvent({
        kind: 'error',
        turnId,
        sessionId,
        conversationId,
        text: '',
        isFinal: false,
        timestamp: now,
        error: {
          code: parsed.code || 'DEEPGRAM_ERROR',
          message: parsed.message || parsed.description || 'Deepgram API error',
          fatal: false,
        },
      });
    }
  }

  /**
   * Accepts PCM chunks, aggregates into target chunk size, and sends to Deepgram.
   */
  public sendAudio(chunk: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Append to aggregation buffer
    this.audioBuffer = Buffer.concat([this.audioBuffer, chunk]);

    // Emit aggregated chunks of targetChunkBytes (e.g. 2560 bytes = 80ms)
    while (this.audioBuffer.length >= this.targetChunkBytes) {
      const chunkToSend = this.audioBuffer.subarray(0, this.targetChunkBytes);
      this.audioBuffer = this.audioBuffer.subarray(this.targetChunkBytes);
      try {
        this.ws.send(chunkToSend);
      } catch (err) {
        console.error('[DeepgramFluxProvider] Failed to send audio chunk:', err);
        break;
      }
    }
  }

  /**
   * Finalizes the current turn (PTT release).
   * Flushes remaining buffered audio and sends ForceEndTurn message.
   */
  public async endTurn(): Promise<void> {
    this.isTurnEnding = true;

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // 1. Flush any remaining partial audio buffer
    if (this.audioBuffer.length > 0) {
      try {
        this.ws.send(this.audioBuffer);
        this.audioBuffer = Buffer.alloc(0);
      } catch (err) {
        console.error('[DeepgramFluxProvider] Failed to flush final audio chunk:', err);
      }
    }

    // 2. Transmit ForceEndTurn control frame to trigger immediate EndOfTurn
    try {
      this.ws.send(JSON.stringify({ type: 'ForceEndTurn' }));
    } catch (err) {
      console.error('[DeepgramFluxProvider] Failed to send ForceEndTurn:', err);
    }
  }

  /**
   * Immediately interrupts recognition (barge-in).
   */
  public interrupt(): void {
    this.audioBuffer = Buffer.alloc(0);
    this.isTurnEnding = true;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'ForceEndTurn' }));
      } catch {
        /* noop */
      }
    }
  }

  /**
   * Gracefully closes the provider session connection.
   */
  public async close(): Promise<void> {
    this.isConnected = false;
    this.isTurnEnding = true;
    this.audioBuffer = Buffer.alloc(0);

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {
        /* noop */
      }
      this.ws = null;
    }
  }
}
