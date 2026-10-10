/**
 * SophiaState — the single lifecycle state machine.
 *
 * AMBIENT / IDLE → WAKEUP → FOCUSING → LISTENING → THINKING → SPEAKING → AMBIENT
 * TRANSFORMING / RENDERING are overlay states: Sophia can return to where she was.
 * PAUSED is a global overlay: motion and voice hold still until resumed.
 *
 * Consumes normalized VoiceProvider events, user commands, and tool calls.
 */

import type {
  AudioPlaybackState,
  CognitiveState,
  SophiaEventDetail,
  SophiaEventType,
  SophiaStateName,
  TransportState,
} from './types';

type Listener = (state: SophiaStateName, prev: SophiaStateName, meta: Record<string, unknown>) => void;

const ALL_STATES: SophiaStateName[] = [
  'idle',
  'listening',
  'thinking',
  'rendering',
  'speaking',
  'pause',
  'paused',
  'completed',
  'blocked',
  'ambient',
  'wakeup',
  'focusing',
  'transforming',
];

/** Any state may move to any other; the gate is MIN_HOLD + real signals. */
const FLOW: Record<SophiaStateName, SophiaStateName[]> = {
  idle: ALL_STATES.filter((s) => s !== 'idle'),
  listening: ALL_STATES.filter((s) => s !== 'listening'),
  thinking: ALL_STATES.filter((s) => s !== 'thinking'),
  rendering: ALL_STATES.filter((s) => s !== 'rendering'),
  speaking: ALL_STATES.filter((s) => s !== 'speaking'),
  pause: ALL_STATES.filter((s) => s !== 'pause'),
  paused: ALL_STATES.filter((s) => s !== 'paused'),
  completed: ALL_STATES.filter((s) => s !== 'completed'),
  blocked: ALL_STATES.filter((s) => s !== 'blocked'),
  ambient: ALL_STATES.filter((s) => s !== 'ambient'),
  wakeup: ALL_STATES.filter((s) => s !== 'wakeup'),
  focusing: ALL_STATES.filter((s) => s !== 'focusing'),
  transforming: ALL_STATES.filter((s) => s !== 'transforming'),
};

const MIN_HOLD: Partial<Record<SophiaStateName, number>> = {
  focusing: 320,
  thinking: 200,
  wakeup: 900,
  completed: 900,
};

export class SophiaState {
  private _state: SophiaStateName = 'ambient';
  private _since = performance.now();
  private resumeAs: SophiaStateName = 'ambient';
  private pausedAs: SophiaStateName = 'ambient';
  private listeners = new Set<Listener>();
  private timers = new Set<ReturnType<typeof setTimeout>>();

  private _cognitiveState: CognitiveState = 'idle';
  private _audioState: AudioPlaybackState = 'silent';
  private _transportState: TransportState = 'disconnected';

  get current(): SophiaStateName {
    return this._state;
  }

  get cognitiveState(): CognitiveState {
    return this._cognitiveState;
  }

  get audioState(): AudioPlaybackState {
    return this._audioState;
  }

  get transportState(): TransportState {
    return this._transportState;
  }

  get resumeState(): SophiaStateName {
    return this.resumeAs;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  is(...names: SophiaStateName[]): boolean {
    return names.includes(this._state);
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  transition(to: SophiaStateName, meta: Record<string, unknown> = {}, force = false): boolean {
    if (to === this._state) return true;
    if (!force && !FLOW[this._state].includes(to)) return false;
    const held = performance.now() - this._since;
    const need = MIN_HOLD[this._state] ?? 0;
    if (!force && held < need) {
      this.later(need - held, () => this.transition(to, meta, force));
      return true;
    }
    const prev = this._state;
    if (to === 'transforming' || to === 'rendering') {
      if (prev !== 'transforming' && prev !== 'rendering' && prev !== 'paused' && prev !== 'pause') this.resumeAs = prev;
    }
    if ((to === 'paused' || to === 'pause') && prev !== 'paused' && prev !== 'pause') this.pausedAs = prev;
    if (to === 'wakeup' && prev !== 'wakeup') this.resumeAs = (prev === 'paused' || prev === 'pause') ? this.resumeAs : prev;
    this._state = to;
    this._since = performance.now();
    if (to === 'ambient' || to === 'idle') this.clearTimers();
    this.listeners.forEach((fn) => fn(to, prev, meta));
    return true;
  }

  /** Force state change for manual preview / settings triggers. */
  setState(to: SophiaStateName, meta: Record<string, unknown> = {}) {
    this.transition(to, meta, true);
  }

  /** Resume from TRANSFORMING / RENDERING / WAKEUP back to previous state. */
  releaseTransform(meta: Record<string, unknown> = {}) {
    if (this._state === 'transforming' || this._state === 'rendering' || this._state === 'wakeup') {
      this.transition(this.resumeAs, meta, true);
    }
  }

  /** Hold everything still. */
  pause(reason = 'user') {
    if (this._state !== 'pause' && this._state !== 'paused') this.transition('pause', { reason }, true);
  }

  /** Pick back up exactly where she was. */
  resume(reason = 'user') {
    if (this._state === 'pause' || this._state === 'paused') this.transition(this.pausedAs, { reason }, true);
  }

  get paused(): boolean {
    return this._state === 'pause' || this._state === 'paused';
  }

  /** Map a normalized provider event onto the lifecycle. */
  handleVoiceEvent(type: SophiaEventType, detail: SophiaEventDetail = {}) {
    // While paused, provider chatter must not move her.
    if (this._state === 'paused') return;
    switch (type) {
      case 'listening':
        this._cognitiveState = 'listening';
        if (this._audioState === 'silent') {
          if (this.is('focusing', 'rendering', 'wakeup', 'completed', 'ambient', 'idle')) {
            this.transition('listening', { source: detail.source });
          }
        }
        break;
      case 'speech_started':
        this._cognitiveState = 'listening';
        this._audioState = 'silent';
        if (this.is('speaking', 'thinking', 'rendering', 'wakeup', 'completed', 'focusing')) {
          this.transition('listening', { reason: 'barge-in' });
        }
        break;
      case 'thinking':
        this._cognitiveState = 'thinking';
        if (this._audioState === 'silent') {
          if (this.is('listening', 'ambient', 'idle', 'wakeup', 'completed', 'focusing')) {
            this.transition('thinking');
          }
        }
        break;
      case 'tool_started':
        this._cognitiveState = 'tool_executing';
        if (this._audioState === 'silent') {
          if (this.is('listening', 'ambient', 'idle', 'wakeup', 'completed', 'focusing', 'thinking')) {
            this.transition('thinking', { tool: detail.tool });
          }
        }
        break;
      case 'tool_finished':
        if (this._cognitiveState === 'tool_executing') {
          this._cognitiveState = 'thinking';
        }
        break;
      case 'response_started':
        // Model generation has started. Audio has not begun audible playback yet.
        this._cognitiveState = 'thinking';
        break;
      case 'audio_started':
      case 'audio_chunk':
        this._audioState = 'playing';
        if (this.is('thinking', 'listening', 'rendering', 'wakeup', 'completed', 'focusing')) {
          this.transition('speaking');
        }
        break;
      case 'interrupted':
        this._cognitiveState = 'listening';
        this._audioState = 'silent';
        if (this.is('speaking', 'thinking', 'rendering', 'completed')) {
          this.transition('listening', { reason: 'interrupted' });
        }
        break;
      case 'response_finished':
        this._cognitiveState = 'done';
        // CRITICAL INVARIANT: response_finished != playback_finished.
        // If audio playback is still active or draining, remain SPEAKING until playback drains!
        if (this._audioState === 'silent') {
          if (this.is('speaking', 'thinking', 'rendering')) {
            this.transition('completed', { reason: 'turn-complete' });
          }
        }
        break;
      case 'playback_finished':
        this._audioState = 'silent';
        // Natural end of utterance playback: now that audio has fully drained, settle state.
        if (this._cognitiveState === 'done') {
          if (this.is('speaking', 'thinking', 'rendering')) {
            this.transition('completed', { reason: 'playback-drained' });
          }
        } else if (this._cognitiveState === 'listening') {
          if (this.is('speaking')) {
            this.transition('listening', { reason: 'playback-drained' });
          }
        }
        break;
      case 'error':
        this._cognitiveState = 'error';
        this._audioState = 'silent';
        if (!this.is('ambient', 'idle')) {
          this.transition('ambient', { reason: 'error', code: detail.code });
        }
        break;
      default:
        break;
    }
  }

  /** Explicitly stand down to ambient (silence timeout / user dismissal). */
  standDown(reason: string) {
    if (!this.is('ambient', 'transforming', 'paused')) this.transition('ambient', { reason });
  }
}
