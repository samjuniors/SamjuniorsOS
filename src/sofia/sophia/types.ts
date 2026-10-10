/**
 * Sophia — shared types
 * The visual engine, state machine and every VoiceProvider speak these types.
 */

/** Lifecycle: AMBIENT / IDLE → WAKEUP → FOCUSING → LISTENING → THINKING → SPEAKING → (RENDERING / TRANSFORMING) → AMBIENT
 *  PAUSED is an overlay state that can wrap any of the above. */
export type SophiaStateName =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'rendering'
  | 'speaking'
  | 'pause'
  | 'paused'
  | 'completed'
  | 'blocked'
  | 'ambient'
  | 'wakeup'
  | 'focusing'
  | 'transforming';

/** Normalized events every VoiceProvider must emit. */
export type SophiaEventType =
  | 'listening'
  | 'speech_started'
  | 'transcript'
  | 'thinking'
  | 'rendering'
  | 'tool_started'
  | 'tool_finished'
  | 'response_started'
  | 'audio_started'
  | 'audio_chunk'
  | 'interrupted'
  | 'response_finished'
  | 'playback_finished'
  | 'error';

export type TransportState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type CognitiveState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'tool_executing'
  | 'done'
  | 'error';

export type AudioPlaybackState =
  | 'silent'
  | 'playing'
  | 'draining'
  | 'interrupted';

export interface SophiaEventDetail {
  /** transcript payloads */
  text?: string;
  role?: 'user' | 'sophia';
  final?: boolean;
  /** realtime 0..1 level carried by audio_chunk / speech_started */
  level?: number;
  /** error payloads */
  code?: string;
  message?: string;
  source?: string;
  /** tool execution metadata */
  tool?: string;
  callId?: string;
  latencyMs?: number;
}

export type VoiceProviderId = 'gemini-live' | 'deepgram' | 'elevenlabs' | 'local';

/** Geometry the substance can become. Generated, never hand-animated. */
export type SophiaShape =
  | 'organic'
  | 'circle'
  | 'waveform'
  | 'bow'
  | 'torus'
  | 'infinity'
  | 'helix'
  | 'hypercube'
  | 'pyramid'
  | 'star'
  | 'galaxy'
  | 'heart'
  | 'shield'
  | 'matrix'
  | 'split'
  | 'merge'
  | 'dissolve'
  | 'face'
  | 'spiky'
  | 'liquid'
  | 'letter-z'
  | 'letter-s'
  | 'letter-a'
  | 'letter-o';

/** What actually wakes Sophia. */
export type ActivationSource = 'wake-word' | 'mic-button' | 'chat' | 'clap' | 'boot';

export interface Turn {
  role: 'user' | 'sophia' | 'system';
  text: string;
  final: boolean;
  ts: number;
  imageUrl?: string;
  imagePrompt?: string;
  sources?: Array<{ title: string; url: string }>;
}
