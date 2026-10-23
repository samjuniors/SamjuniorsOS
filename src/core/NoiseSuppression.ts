export class NoiseSuppression {
  private noiseFloor = 0.015;
  private smoothing = 0.95;

  updateNoiseFloor(currentRms: number): number {
    // If signal is quiet, adapt the noise floor downward or gently upward
    if (currentRms < this.noiseFloor * 2.5) {
      this.noiseFloor = this.noiseFloor * this.smoothing + currentRms * (1 - this.smoothing);
    } else {
      // Very slow upward drift in case ambient environment gets louder
      this.noiseFloor = this.noiseFloor * 0.999 + currentRms * 0.001;
    }
    this.noiseFloor = Math.max(0.005, Math.min(0.1, this.noiseFloor));
    return this.noiseFloor;
  }

  getNoiseFloor(): number {
    return this.noiseFloor;
  }

  calculateSnr(rms: number): number {
    if (this.noiseFloor <= 0) return 0;
    return 20 * Math.log10(Math.max(rms, 1e-5) / this.noiseFloor);
  }
}
