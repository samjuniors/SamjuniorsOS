/**
 * ScoreEngine — Atmospheric sound scoring and dynamic voice ducking for Sophia OS.
 *
 * Implements cinematic acoustic scoring inspired by J.A.R.V.I.S.:
 *   1. boot-music — Orchestral swell during boot / awakening (default: ON).
 *   2. ambient    — Subtle harmonic drone looping softly under standby (default: OFF, optional).
 *   3. work       — Industrial rhythmic pulse active while computing (default: OFF, optional).
 *
 * Dynamic Voice Ducking:
 *   Whenever Sophia speaks (playback starts), all music automatically ducks to 35%
 *   with smooth volume ramps so voice clarity is crystal clear.
 */

import type { SophiaStateName } from '../types';

export type ScoreCue = 'boot-music' | 'ambient' | 'work';

interface Track {
  el: HTMLAudioElement;
  targetVolume: number;
  currentFade?: number;
}

const DEFAULT_LEVELS: Record<ScoreCue, number> = {
  'boot-music': 0.70,
  ambient: 0.12,
  work: 0.16,
};

const DUCK_FACTOR = 0.35;

export class ScoreEngine {
  private tracks = new Map<ScoreCue, Track>();
  private missing = new Set<ScoreCue>();
  private unlocked = false;
  private enabled = true;
  private ambientLoopEnabled = false; // By default: ONLY boot fanfare plays, no continuous music!
  private masterVolume = 0.8;
  private ducked = false;
  private currentState: SophiaStateName = 'idle';

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedEnabled = localStorage.getItem('sophia:score-enabled');
        if (savedEnabled !== null) this.enabled = savedEnabled === 'true';
        const savedAmbient = localStorage.getItem('sophia:score-ambient-loop');
        if (savedAmbient !== null) this.ambientLoopEnabled = savedAmbient === 'true';
        const savedVol = localStorage.getItem('sophia:score-volume');
        if (savedVol !== null) this.masterVolume = parseFloat(savedVol) || 0.8;
      } catch {
        /* ignore */
      }
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enable: boolean) {
    this.enabled = enable;
    try {
      localStorage.setItem('sophia:score-enabled', String(enable));
    } catch {
      /* ignore */
    }
    if (!enable) {
      this.stopAll();
    } else if (this.unlocked) {
      this.syncToState(this.currentState);
    }
  }

  get isAmbientLoopEnabled(): boolean {
    return this.ambientLoopEnabled;
  }

  setAmbientLoopEnabled(enable: boolean) {
    this.ambientLoopEnabled = enable;
    try {
      localStorage.setItem('sophia:score-ambient-loop', String(enable));
    } catch {
      /* ignore */
    }
    if (!enable) {
      this.stopAmbient(400);
      this.stopWork(400);
    } else if (this.unlocked) {
      this.syncToState(this.currentState);
    }
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('sophia:score-volume', String(this.masterVolume));
    } catch {
      /* ignore */
    }
    this.updateAllTrackVolumes();
  }

  /** Called on user gesture to allow HTMLAudioElement playback */
  async unlock(): Promise<void> {
    if (this.unlocked) return;
    this.unlocked = true;
    this.initTrack('boot-music', false);
    if (this.ambientLoopEnabled) {
      this.initTrack('ambient', true);
      this.initTrack('work', true);
    }
  }

  private initTrack(cue: ScoreCue, loop: boolean): Track | null {
    if (typeof window === 'undefined' || this.missing.has(cue)) return null;
    let t = this.tracks.get(cue);
    if (!t) {
      const el = new Audio(`/audio/${cue}.mp3`);
      el.preload = 'auto';
      el.loop = loop;
      el.volume = 0;
      el.addEventListener(
        'error',
        () => {
          this.missing.add(cue);
          this.tracks.delete(cue);
        },
        { once: true }
      );
      t = { el, targetVolume: DEFAULT_LEVELS[cue] };
      this.tracks.set(cue, t);
    }
    return t;
  }

  private fadeTrack(cue: ScoreCue, targetVol: number, durationMs = 400): Promise<void> {
    const t = this.initTrack(cue, cue === 'ambient' || cue === 'work');
    if (!t || !this.enabled) return Promise.resolve();

    return new Promise((resolve) => {
      if (t.currentFade) {
        clearInterval(t.currentFade);
        t.currentFade = undefined;
      }

      const effectiveTarget = targetVol * this.masterVolume * (this.ducked ? DUCK_FACTOR : 1);

      if (effectiveTarget > 0 && t.el.paused) {
        t.el.volume = 0;
        void t.el.play().catch(() => {
          /* autoplay policy caught */
        });
      }

      const startVol = t.el.volume;
      const stepCount = 16;
      const intervalMs = durationMs / stepCount;
      let step = 0;

      t.currentFade = window.setInterval(() => {
        step++;
        const progress = step / stepCount;
        const current = startVol + (effectiveTarget - startVol) * progress;
        t.el.volume = Math.max(0, Math.min(1, current));

        if (step >= stepCount) {
          clearInterval(t.currentFade);
          t.currentFade = undefined;
          if (effectiveTarget <= 0 && !t.el.paused) {
            t.el.pause();
          }
          resolve();
        }
      }, intervalMs);
    });
  }

  private updateAllTrackVolumes() {
    for (const [, t] of this.tracks.entries()) {
      if (!t.el.paused) {
        const effective = t.targetVolume * this.masterVolume * (this.ducked ? DUCK_FACTOR : 1);
        t.el.volume = Math.max(0, Math.min(1, effective));
      }
    }
  }

  /**
   * Automatic Ducking: Reduces music volume to 35% when Sofia is speaking,
   * restoring original volume when she finishes.
   */
  setDucked(isDucked: boolean) {
    if (this.ducked === isDucked) return;
    this.ducked = isDucked;
    this.updateAllTrackVolumes();
  }

  playBoot() {
    if (!this.enabled || !this.unlocked) return;
    const t = this.initTrack('boot-music', false);
    if (t) {
      try {
        t.el.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    void this.fadeTrack('boot-music', DEFAULT_LEVELS['boot-music'], 200);
  }

  startAmbient() {
    if (!this.enabled || !this.unlocked || !this.ambientLoopEnabled) return;
    void this.fadeTrack('ambient', DEFAULT_LEVELS.ambient, 800);
  }

  stopAmbient(fadeMs = 500) {
    void this.fadeTrack('ambient', 0, fadeMs);
  }

  startWork() {
    if (!this.enabled || !this.unlocked || !this.ambientLoopEnabled) return;
    void this.fadeTrack('work', DEFAULT_LEVELS.work, 600);
  }

  stopWork(fadeMs = 500) {
    void this.fadeTrack('work', 0, fadeMs);
  }

  stopAll(fadeMs = 300) {
    for (const cue of ['boot-music', 'ambient', 'work'] as ScoreCue[]) {
      void this.fadeTrack(cue, 0, fadeMs);
    }
  }

  /**
   * Responds to SofiaOS state changes automatically.
   */
  syncToState(state: SophiaStateName) {
    this.currentState = state;
    if (!this.enabled || !this.unlocked) return;

    switch (state) {
      case 'wakeup':
        this.playBoot();
        if (this.ambientLoopEnabled) this.startAmbient();
        break;
      case 'ambient':
      case 'idle':
      case 'listening':
      case 'focusing':
        if (this.ambientLoopEnabled) {
          this.startAmbient();
        } else {
          this.stopAmbient(400);
        }
        this.stopWork(600);
        break;
      case 'thinking':
      case 'rendering':
        if (this.ambientLoopEnabled) {
          this.startWork();
        }
        break;
      case 'speaking':
        this.setDucked(true);
        break;
      case 'paused':
        this.stopAll(600);
        break;
      case 'completed':
        this.stopWork(400);
        if (this.ambientLoopEnabled) this.startAmbient();
        break;
    }

    if (state !== 'speaking') {
      this.setDucked(false);
    }
  }
}

export const scoreEngine = new ScoreEngine();
