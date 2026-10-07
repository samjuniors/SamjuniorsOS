/**
 * core/BackgroundKeepAlive.ts
 *
 * Ensures Sofia continues listening, processing, and running smoothly even when
 * the browser tab is minimized, hidden, or running in the background.
 *
 * Employs a low-overhead Web Audio silent keeper to prevent Chrome/Edge background throttling.
 */

export class BackgroundKeepAlive {
  private audioContext: AudioContext | null = null;
  private silentGain: GainNode | null = null;
  private oscillator: OscillatorNode | null = null;
  private isRunning = false;
  private heartbeatTimer: any = null;

  start(existingContext?: AudioContext) {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      this.audioContext = existingContext || new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Silent oscillator (gain 0.00001 or 0) keeps audio thread active without making audible sound
      this.silentGain = this.audioContext.createGain();
      this.silentGain.gain.setValueAtTime(0.00001, this.audioContext.currentTime);

      this.oscillator = this.audioContext.createOscillator();
      this.oscillator.type = 'sine';
      this.oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);

      this.oscillator.connect(this.silentGain);
      this.silentGain.connect(this.audioContext.destination);
      this.oscillator.start();

      console.log('[BackgroundKeepAlive] Silent audio thread active.');
    } catch (e) {
      console.warn('[BackgroundKeepAlive] Could not initialize silent background audio:', e);
    }

    // Monitor document visibility
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Periodic heartbeat to prevent browser freeze
    this.heartbeatTimer = setInterval(() => {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        void this.audioContext.resume();
      }
    }, 5000);
  }

  private handleVisibilityChange = () => {
    if (document.hidden) {
      console.log('[BackgroundKeepAlive] Tab minimized/hidden — keeping Sofia active in background.');
      if (this.audioContext && this.audioContext.state === 'suspended') {
        void this.audioContext.resume();
      }
    } else {
      console.log('[BackgroundKeepAlive] Tab visible again.');
    }
  };

  stop() {
    this.isRunning = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    try {
      this.oscillator?.stop();
      this.oscillator?.disconnect();
      this.silentGain?.disconnect();
    } catch {
      // ignore
    }
    this.oscillator = null;
    this.silentGain = null;
  }
}

export const backgroundKeepAlive = new BackgroundKeepAlive();
