/**
 * Canonical Voice Presence State Model & Resolver
 *
 * Implements Gate G6.5: Panel fallback when voice is unavailable, with honest presence states.
 * Exit evidence: Every presence state designed and tested, including offline.
 *
 * Invariants per AGENTS.md §1, §6:
 * 1. Honest reporting: Presence states must never fabricate connectivity or voice readiness.
 * 2. When network or voice transport is offline, presence must report 'offline' honestly.
 * 3. When microphone is blocked, presence must report 'mic_blocked' and provide remediation.
 * 4. When voice provider errors, presence must report 'voice_unavailable'.
 * 5. Whenever voice is unavailable, a prominent panel fallback ("Type to Sophia") must be
 *    available to smoothly transition the founder into the text conversation panel.
 */

import type { SophiaStateName } from "@/sofia/sophia/types";
import type { OSStatus } from "@/sofia/sophia/SophiaOS";

export type VoicePresenceState =
  | 'offline'
  | 'mic_blocked'
  | 'voice_unavailable'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'voice_off';

export interface PresenceStateOptions {
  isOnline: boolean;
  status: OSStatus; // 'idle' | 'connecting' | 'live' | 'offline' | 'denied' | 'error'
  state: SophiaStateName; // 'idle' | 'listening' | 'thinking' | 'speaking' | ...
  micDenied: boolean;
  interrupted?: boolean;
}

export interface PresenceStateInfo {
  state: VoicePresenceState;
  label: string;
  isVoiceAvailable: boolean;
  fallbackAvailable: boolean;
  canInterrupt: boolean;
  canStartVoice: boolean;
  ariaLabel: string;
  description: string;
  badgeClass: string;
}

/**
 * Pure, deterministic resolver mapping transport and environment telemetry
 * into an honest PresenceStateInfo object.
 */
export function resolvePresenceState(opts: PresenceStateOptions): PresenceStateInfo {
  // 1. Offline invariant: if network is offline or status is explicitly offline
  if (!opts.isOnline || opts.status === 'offline') {
    return {
      state: 'offline',
      label: 'Offline',
      isVoiceAvailable: false,
      fallbackAvailable: true,
      canInterrupt: false,
      canStartVoice: false,
      ariaLabel: 'Sophia voice presence is offline. Text panel fallback is available.',
      description: 'Network or voice gateway is unreachable. Chat panel fallback is ready.',
      badgeClass: 'border-slate-500/40 bg-slate-900/90 text-slate-300',
    };
  }

  // 2. Microphone blocked: permission denied
  if (opts.micDenied || opts.status === 'denied') {
    return {
      state: 'mic_blocked',
      label: 'Microphone blocked',
      isVoiceAvailable: false,
      fallbackAvailable: true,
      canInterrupt: false,
      canStartVoice: false,
      ariaLabel: 'Microphone permission denied. Click for help or use text chat.',
      description: 'Microphone access is blocked in browser settings. Use text panel fallback.',
      badgeClass: 'border-rose-500/40 bg-[#1f0b12]/95 text-rose-300',
    };
  }

  // 3. Voice error / unavailable: provider or audio context failure
  if (opts.status === 'error') {
    return {
      state: 'voice_unavailable',
      label: 'Voice unavailable',
      isVoiceAvailable: false,
      fallbackAvailable: true,
      canInterrupt: false,
      canStartVoice: false,
      ariaLabel: 'Voice service unavailable. Use text chat panel.',
      description: 'Voice provider or audio gateway error. Fallback to text chat.',
      badgeClass: 'border-amber-500/40 bg-[#1d1406]/95 text-amber-300',
    };
  }

  // 4. Connecting: handshake or provider initialization in progress
  if (opts.status === 'connecting') {
    return {
      state: 'connecting',
      label: 'Connecting',
      isVoiceAvailable: true,
      fallbackAvailable: true,
      canInterrupt: false,
      canStartVoice: false,
      ariaLabel: 'Connecting to Sophia voice gateway...',
      description: 'Initializing hands-free voice transport...',
      badgeClass: 'border-cyan-400/40 bg-cyan-950/80 text-cyan-200 animate-pulse',
    };
  }

  // 5. Interrupted: user or system interrupted speaking or thinking
  if (opts.interrupted) {
    return {
      state: 'interrupted',
      label: 'Interrupted',
      isVoiceAvailable: true,
      fallbackAvailable: true,
      canInterrupt: false,
      canStartVoice: true,
      ariaLabel: 'Voice turn interrupted.',
      description: 'Spoken reply was interrupted by user.',
      badgeClass: 'border-rose-400/30 bg-rose-950/60 text-rose-200',
    };
  }

  // 6. Live session active
  if (opts.status === 'live') {
    if (opts.state === 'speaking') {
      return {
        state: 'speaking',
        label: 'Speaking',
        isVoiceAvailable: true,
        fallbackAvailable: true,
        canInterrupt: true,
        canStartVoice: true,
        ariaLabel: 'Sophia is speaking. Press Escape to interrupt.',
        description: 'Streaming spoken audio reply.',
        badgeClass: 'border-emerald-400/40 bg-emerald-950/80 text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.3)]',
      };
    }
    if (opts.state === 'thinking') {
      return {
        state: 'thinking',
        label: 'Thinking',
        isVoiceAvailable: true,
        fallbackAvailable: true,
        canInterrupt: true,
        canStartVoice: true,
        ariaLabel: 'Sophia is thinking. Press Escape to cancel.',
        description: 'Processing cognitive turn and intent.',
        badgeClass: 'border-amber-400/40 bg-amber-950/80 text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.3)]',
      };
    }
    // Default live state is listening
    return {
      state: 'listening',
      label: 'Listening',
      isVoiceAvailable: true,
      fallbackAvailable: true,
      canInterrupt: false,
      canStartVoice: true,
      ariaLabel: 'Sophia is listening. Speak hands-free.',
      description: 'Microphone active, listening for speech.',
      badgeClass: 'border-cyan-400/40 bg-cyan-950/80 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.3)]',
    };
  }

  // 7. Voice Off / Idle (standby)
  return {
    state: 'voice_off',
    label: 'Voice off',
    isVoiceAvailable: true,
    fallbackAvailable: true,
    canInterrupt: false,
    canStartVoice: true,
    ariaLabel: 'Voice session is off. Click to start hands-free voice.',
    description: 'Voice is in standby. Text chat available anytime.',
    badgeClass: 'border-cyan-400/20 bg-[#06101d]/95 text-slate-300',
  };
}
