/**
 * ============================================================================
 * SOPHIA LIVE INTERACTION — PROVIDER-NEUTRAL STT TYPES (PHASE 4C-B)
 * ============================================================================
 * Defines the canonical contract for streaming Speech-to-Text providers.
 * All speech recognition engines (Deepgram Flux, Qwen3-ASR, mock engines)
 * must implement this contract to ensure Sophia remains provider-agnostic.
 */

export type STTEventKind =
  | 'speech_started'     // Acoustic onset of speech detected by provider
  | 'interim_transcript' // Partial real-time transcript update (isFinal = false)
  | 'final_transcript'   // High-confidence finalized turn transcript (isFinal = true)
  | 'turn_completed'     // Turn lifecycle finalized by provider
  | 'error';             // Provider-level recognition error

export interface STTWordTiming {
  word: string;
  confidence?: number;
  start?: number;
  end?: number;
}

export interface CanonicalTranscriptEvent {
  kind: STTEventKind;
  turnId: string;
  conversationId?: string;
  sessionId?: string;
  text: string;
  isFinal: boolean;
  confidence?: number;
  words?: STTWordTiming[];
  timestamp: number;
  error?: {
    code: string;
    message: string;
    fatal?: boolean;
  };
}

export interface STTProviderSessionOptions {
  sessionId: string;
  founderId: string;
  conversationId?: string;
  turnId: string;
  sampleRate: number; // e.g. 16000
  channels?: number;  // default: 1
  language?: string;  // e.g. 'en' or 'multi'
}

/**
 * Provider-agnostic interface for streaming Speech-to-Text adapters.
 */
export interface STTProvider {
  readonly providerId: string;
  readonly providerName: string;

  /**
   * Initializes and connects a streaming recognition session for a turn.
   */
  startStream(opts: STTProviderSessionOptions): Promise<void>;

  /**
   * Forwards a raw Int16 PCM chunk (16 kHz mono) to the provider stream.
   */
  sendAudio(chunk: Buffer): void;

  /**
   * Signals the end of a spoken turn (e.g. on PTT release).
   * For Deepgram Flux, translates to ForceEndTurn.
   */
  endTurn(): Promise<void>;

  /**
   * Immediately halts recognition and flushes in-flight state (barge-in).
   */
  interrupt(): void;

  /**
   * Gracefully tears down the provider stream connection.
   */
  close(): Promise<void>;

  /**
   * Registers a callback for normalized canonical transcript events.
   */
  onEvent(listener: (event: CanonicalTranscriptEvent) => void): void;

  /**
   * Registers a callback for provider errors.
   */
  onError(listener: (error: Error) => void): void;
}
