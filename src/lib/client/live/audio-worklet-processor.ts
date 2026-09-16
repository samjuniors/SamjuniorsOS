/**
 * ============================================================================
 * PCM RESAMPLER AUDIO WORKLET PROCESSOR (PHASE 4B)
 * ============================================================================
 * Runs inside the browser's AudioWorklet thread off the main UI loop.
 * Resamples arbitrary native hardware sample rates (44.1kHz, 48kHz, etc.) down
 * to 16 kHz mono 16-bit signed integer linear PCM.
 */

export const PCM_RESAMPLER_WORKLET_NAME = 'pcm-resampler-processor';

export const PCM_RESAMPLER_WORKLET_CODE = `
class PcmResamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.chunkSize = 512; // 512 samples = 32ms at 16kHz (1024 bytes)
    this.pcmBuffer = new Int16Array(this.chunkSize);
    this.bufferIndex = 0;
    this.resampleRatio = 1.0;
    this.resamplePhase = 0.0;
    this.lastInputSample = 0.0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const inputChannel = input[0];
    const sourceSampleRate = sampleRate; // AudioWorklet global sampleRate (e.g. 48000 or 44100)
    const ratio = sourceSampleRate / this.targetSampleRate;

    // Linear interpolation resampler from sourceSampleRate to 16000 Hz
    let inPos = this.resamplePhase;
    while (inPos < inputChannel.length) {
      const idx0 = Math.floor(inPos);
      const frac = inPos - idx0;
      const s0 = idx0 === 0 ? this.lastInputSample : inputChannel[idx0 - 1];
      const s1 = inputChannel[idx0] || 0.0;

      // Linear interpolation between consecutive source samples
      let interpolated = s0 + frac * (s1 - s0);

      // Clamp to [-1.0, 1.0]
      if (interpolated > 1.0) interpolated = 1.0;
      else if (interpolated < -1.0) interpolated = -1.0;

      // Quantize to 16-bit signed integer PCM
      const sampleInt16 = interpolated < 0 ? Math.round(interpolated * 32768) : Math.round(interpolated * 32767);

      this.pcmBuffer[this.bufferIndex++] = sampleInt16;

      // When full 512-sample chunk is accumulated, dispatch to main thread
      if (this.bufferIndex >= this.chunkSize) {
        const chunkToSend = new Int16Array(this.pcmBuffer);
        this.port.postMessage(
          {
            type: 'pcm_chunk',
            pcm: chunkToSend.buffer,
            sampleRate: this.targetSampleRate,
            samples: this.chunkSize,
          },
          [chunkToSend.buffer]
        );
        this.bufferIndex = 0;
      }

      inPos += ratio;
    }

    this.resamplePhase = inPos - inputChannel.length;
    this.lastInputSample = inputChannel[inputChannel.length - 1] || 0.0;

    return true;
  }
}

registerProcessor('${PCM_RESAMPLER_WORKLET_NAME}', PcmResamplerProcessor);
`;

/**
 * Creates an ephemeral Object URL containing the self-contained AudioWorklet code.
 */
export function createAudioWorkletBlobUrl(): string {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined') {
    throw new Error('AudioWorklet requires a browser environment with Blob and URL support');
  }
  const blob = new Blob([PCM_RESAMPLER_WORKLET_CODE], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}
