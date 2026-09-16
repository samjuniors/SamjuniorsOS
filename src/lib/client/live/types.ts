/**
 * ============================================================================
 * SOPHIA LIVE INTERACTION — CLIENT TYPES (PHASE 4B)
 * ============================================================================
 * Client-side contracts for microphone capture, AudioWorklet resampler,
 * Silero VAD gating, and companion WebSocket streaming.
 */

import { LiveModalityState } from '../../server/live/types';

export interface SophiaLiveClientOptions {
  wsUrl?: string;
  ticket?: string;
  conversationId?: string;
  sampleRate?: number; // Target sample rate, defaults to 16000 Hz
  chunkSize?: number;  // Target sample count per frame, defaults to 512 (32ms)
  autoConnect?: boolean;
  maxBufferBytes?: number; // Max allowed WebSocket bufferedAmount before dropping (default 65536)
  vad?: {
    speechStartThreshold?: number; // default 0.5
    speechEndThreshold?: number;   // default 0.35
    redemptionFrames?: number;     // default 8 frames (~250ms)
  };
  onStateChange?: (state: LiveModalityState, prevState: LiveModalityState) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (error: LiveClientError) => void;
}

export interface VadFrameResult {
  isSpeech: boolean;
  probability: number;
  energy: number;
  event?: 'speech_start' | 'speech_continue' | 'speech_end';
  timestamp: number;
}

export interface LiveClientError {
  code:
    | 'MIC_PERMISSION_DENIED'
    | 'MIC_NOT_FOUND'
    | 'AUDIO_WORKLET_UNSUPPORTED'
    | 'AUDIO_WORKLET_FAILED'
    | 'WEBSOCKET_ERROR'
    | 'WEBSOCKET_DISCONNECTED'
    | 'BUFFER_OVERFLOW';
  message: string;
  fatal?: boolean;
  originalError?: any;
}

export interface AudioIngressTelemetry {
  framesCaptured: number;
  framesTransmitted: number;
  framesGatedSilence: number;
  framesDroppedBackpressure: number;
  bytesTransmitted: number;
  speechDurationMs: number;
}
