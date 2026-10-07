/**
 * VoiceProvider — the transport contract.
 *
 *      VoiceProvider
 *      ├── GeminiLiveProvider   (primary realtime transport)
 *      └── DeepgramVoiceProvider (fallback STT+LLM+TTS chain)
 *
 * Every provider emits the SAME normalized events:
 *   listening · speech_started · transcript · thinking · response_started
 *   audio_started · audio_chunk · interrupted · response_finished · error
 *
 * The Sophia visual engine consumes only these events and stays fully
 * independent from any provider-specific protocol.
 */

import type { SophiaEventDetail, SophiaEventType, VoiceProviderId } from '../types';

export abstract class VoiceProvider extends EventTarget {
  abstract readonly id: VoiceProviderId;
  protected active = false;

  isActive() {
    return this.active;
  }

  protected emit(type: SophiaEventType, detail: SophiaEventDetail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Open the session (may require network + mic). Throws on failure. */
  abstract start(): Promise<void>;
  /** Gracefully close the session. */
  abstract stop(): Promise<void>;
  /** Text input rides the same brain (keyboard fallback). */
  abstract sendText(text: string): void;
  /** Stop model output immediately (user barge-in / UI interrupt). */
  abstract interrupt(): void;
}

export function base64Encode(bytes: Uint8Array): string {
  let out = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + CH, bytes.length)));
  }
  return btoa(out);
}

export function base64Decode(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
