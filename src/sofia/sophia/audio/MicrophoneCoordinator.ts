/**
 * MicrophoneCoordinator — Authoritative, deterministic arbiter of microphone ownership.
 *
 * Prevents contention between:
 * 1. Background wake-word spotter (SpeechRecognition)
 * 2. Active conversational sessions (Gemini Live / Deepgram / Local getUserMedia streams)
 * 3. Manual push-to-talk holds (PTT — highest priority)
 *
 * Ensures only ONE subsystem accesses or holds the microphone at any given moment.
 */

export type MicOwner = 'idle' | 'wake_word' | 'conversation' | 'ptt';

export interface OwnershipChangeEvent {
  owner: MicOwner;
  previous: MicOwner;
  reason?: string;
}

export type OwnershipChangeListener = (evt: OwnershipChangeEvent) => void;
export type PreemptListener = (preemptedBy: MicOwner) => void;

const OWNER_PRIORITIES: Record<MicOwner, number> = {
  idle: 0,
  wake_word: 10,
  conversation: 20,
  ptt: 30,
};

export class MicrophoneCoordinator {
  private _currentOwner: MicOwner = 'idle';
  private previousOwnerBeforePtt: MicOwner = 'idle';
  private changeListeners = new Set<OwnershipChangeListener>();
  private preemptListeners = new Map<MicOwner, PreemptListener>();

  get currentOwner(): MicOwner {
    return this._currentOwner;
  }

  isAvailableFor(owner: MicOwner): boolean {
    if (this._currentOwner === 'idle' || this._currentOwner === owner) {
      return true;
    }
    // Higher priority can preempt lower priority
    return OWNER_PRIORITIES[owner] > OWNER_PRIORITIES[this._currentOwner];
  }

  /**
   * Request exclusive ownership of the microphone.
   * Returns true if ownership was granted (or already held), false if denied.
   */
  requestOwnership(owner: MicOwner, reason?: string): boolean {
    if (owner === 'idle') {
      this.releaseOwnership(this._currentOwner, reason);
      return true;
    }

    if (this._currentOwner === owner) {
      return true;
    }

    const currentPriority = OWNER_PRIORITIES[this._currentOwner];
    const requestedPriority = OWNER_PRIORITIES[owner];

    // Cannot acquire if current owner has higher or equal priority
    if (requestedPriority <= currentPriority) {
      return false;
    }

    const previous = this._currentOwner;

    // Track if PTT preempted an active conversation
    if (owner === 'ptt' && previous === 'conversation') {
      this.previousOwnerBeforePtt = 'conversation';
    } else if (owner !== 'ptt') {
      this.previousOwnerBeforePtt = 'idle';
    }

    // Preempt the current owner
    const preemptHook = this.preemptListeners.get(previous);
    if (preemptHook) {
      try {
        preemptHook(owner);
      } catch (err) {
        console.warn(`[MicrophoneCoordinator] Error in preempt hook for ${previous}:`, err);
      }
    }

    this._currentOwner = owner;
    this.notifyChange({ owner, previous, reason });
    return true;
  }

  /**
   * Release microphone ownership.
   */
  releaseOwnership(owner: MicOwner, reason?: string): void {
    if (this._currentOwner !== owner && owner !== 'idle') {
      // Ignored: non-owner cannot release another owner's lock
      return;
    }

    const previous = this._currentOwner;

    // If PTT releases and a conversation was active prior to PTT, restore conversation
    if (previous === 'ptt' && this.previousOwnerBeforePtt === 'conversation') {
      this._currentOwner = 'conversation';
      this.previousOwnerBeforePtt = 'idle';
    } else {
      this._currentOwner = 'idle';
      this.previousOwnerBeforePtt = 'idle';
    }

    if (this._currentOwner !== previous) {
      this.notifyChange({ owner: this._currentOwner, previous, reason });
    }
  }

  /**
   * Register a callback to be notified when a specific owner is preempted.
   */
  registerPreemptHook(owner: MicOwner, hook: PreemptListener): () => void {
    this.preemptListeners.set(owner, hook);
    return () => {
      if (this.preemptListeners.get(owner) === hook) {
        this.preemptListeners.delete(owner);
      }
    };
  }

  /**
   * Subscribe to ownership changes.
   */
  onOwnershipChange(listener: OwnershipChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private notifyChange(evt: OwnershipChangeEvent): void {
    for (const listener of this.changeListeners) {
      try {
        listener(evt);
      } catch (err) {
        console.warn('[MicrophoneCoordinator] Error in change listener:', err);
      }
    }
  }

  reset(): void {
    const previous = this._currentOwner;
    this._currentOwner = 'idle';
    this.previousOwnerBeforePtt = 'idle';
    if (previous !== 'idle') {
      this.notifyChange({ owner: 'idle', previous, reason: 'reset' });
    }
  }
}
