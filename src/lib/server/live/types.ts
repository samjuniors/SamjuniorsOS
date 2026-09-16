/**
 * ============================================================================
 * SOPHIA LIVE INTERACTION — SESSION & PROTOCOL TYPES (PHASE 4A)
 * ============================================================================
 * Defines the modality state machine, session records, and WebSocket framing
 * protocol for the live interaction companion gateway.
 */

export type LiveModalityState =
  | 'IDLE'          // Passive standing by; microphone muted / PTT released
  | 'LISTENING'     // Active PTT press / microphone capturing audio
  | 'TRANSCRIBING'  // Audio frame stream finalizing transcript
  | 'THINKING'      // Cognitive turn handed off to Sophia reasoning gateway
  | 'SPEAKING'      // Synthesizing & streaming audio back to founder
  | 'INTERRUPTED'   // Active turn halted mid-sentence by founder barge-in
  | 'RECONNECTING'  // Transport dropped; backoff retry active
  | 'ERROR';        // Hardware, permission, or transport failure

export interface LiveSessionRecord {
  id: string;
  founderId: string;
  conversationId?: string;
  state: LiveModalityState;
  createdAt: number;
  lastActiveAt: number;
  connectedAt: number;
  isAlive: boolean;
  activeTurnId?: string;
}

export type ClientLiveMessage =
  | { type: 'INIT_SESSION'; conversationId?: string; clientTimestamp?: number }
  | { type: 'RESUME_SESSION'; sessionId: string; conversationId?: string; lastAckTurnId?: string }
  | { type: 'PING'; timestamp?: number }
  | { type: 'SET_STATE'; state: LiveModalityState }
  | { type: 'START_PTT'; turnId: string; timestamp?: number }
  | { type: 'STOP_PTT'; turnId: string; timestamp?: number }
  | { type: 'INTERRUPT'; turnId?: string }
  | { type: 'CLOSE_SESSION' };

export type ServerLiveMessage =
  | { type: 'SESSION_READY'; sessionId: string; founderId: string; conversationId?: string }
  | { type: 'SESSION_RESUMED'; sessionId: string; founderId: string; conversationId?: string; resumed: boolean }
  | { type: 'PONG'; timestamp: number }
  | { type: 'STATE_CHANGE'; state: LiveModalityState; previousState: LiveModalityState; reason?: string }
  | { type: 'PTT_ACK'; turnId: string; state: 'STARTED' | 'STOPPED'; timestamp: number }
  | { type: 'INTERRUPTED_ACK'; turnId?: string; timestamp: number }
  | { type: 'ERROR'; code: string; message: string; fatal?: boolean };

export const LIVE_CLOSE_CODES = {
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  UNAUTHORIZED: 4401,
  SESSION_SUPERSEDED: 4409,
  POLICY_VIOLATION: 4403,
  PROTOCOL_ERROR: 4400,
  INTERNAL_ERROR: 4500,
} as const;
