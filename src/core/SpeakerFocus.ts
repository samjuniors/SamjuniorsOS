export class SpeakerFocus {
  /**
   * Distinguishes human voice from environmental sounds (coughs, breathing, keyboards, fans).
   * @param freqData Uint8Array frequency spectrum from AnalyserNode
   * @param sampleRate audio context sample rate (typically 16000 or 44100/48000)
   * @param rms current signal RMS
   */
  analyzeVoicePresence(freqData: Uint8Array, sampleRate: number = 16000, rms: number = 0): {
    speechScore: number;
    isHumanSpeech: boolean;
    dominantFreq: number;
    soundType: 'speech' | 'transient_click' | 'rumble' | 'breath' | 'silence';
    lowBand: number;
    midBand: number;
    highBand: number;
  } {
    if (rms < 0.012) {
      return {
        speechScore: 0,
        isHumanSpeech: false,
        dominantFreq: 0,
        soundType: 'silence',
        lowBand: 0,
        midBand: 0,
        highBand: 0
      };
    }

    const binCount = freqData.length;
    const nyquist = sampleRate / 2;
    const binWidth = nyquist / binCount;

    let lowEnergy = 0; // < 250Hz (rumble, fan, AC)
    let speechEnergy = 0; // 300Hz - 3400Hz (human vocal core & vowel formants)
    let highEnergy = 0; // > 4000Hz (keyboard clicks, hiss, mouse)
    let totalEnergy = 0;

    let peakVal = 0;
    let peakIndex = 0;

    for (let i = 0; i < binCount; i++) {
      const val = freqData[i];
      const freq = i * binWidth;
      totalEnergy += val;

      if (val > peakVal) {
        peakVal = val;
        peakIndex = i;
      }

      if (freq < 250) {
        lowEnergy += val;
      } else if (freq >= 300 && freq <= 3400) {
        speechEnergy += val;
      } else if (freq > 4000) {
        highEnergy += val;
      }
    }

    const dominantFreq = peakIndex * binWidth;

    if (totalEnergy === 0) {
      return {
        speechScore: 0,
        isHumanSpeech: false,
        dominantFreq: 0,
        soundType: 'silence',
        lowBand: 0,
        midBand: 0,
        highBand: 0
      };
    }

    const speechRatio = speechEnergy / (totalEnergy + 1e-5);
    const highRatio = highEnergy / (totalEnergy + 1e-5);
    const lowRatio = lowEnergy / (totalEnergy + 1e-5);

    // Normalized band intensities (0.0 to 1.0)
    const lowBand = Math.min(1.0, (lowEnergy / (binCount * 0.25 * 255)) * 2.5);
    const midBand = Math.min(1.0, (speechEnergy / (binCount * 0.5 * 255)) * 2.5);
    const highBand = Math.min(1.0, (highEnergy / (binCount * 0.25 * 255)) * 3.0);

    let soundType: 'speech' | 'transient_click' | 'rumble' | 'breath' | 'silence' = 'silence';

    // Keyboard clicks have prominent energy above 4.5kHz and very sharp dropoff in speech band
    if (highRatio > 0.45 && speechRatio < 0.35) {
      soundType = 'transient_click';
    } else if (lowRatio > 0.6 && speechRatio < 0.3) {
      soundType = 'rumble';
    } else if (rms < 0.025 && speechRatio < 0.4) {
      soundType = 'breath';
    } else if (speechRatio > 0.38 && dominantFreq >= 100 && dominantFreq <= 3500) {
      soundType = 'speech';
    }

    // Speech score calculation between 0.0 and 1.0
    let speechScore = Math.min(1.0, speechRatio * 1.5);
    if (dominantFreq >= 120 && dominantFreq <= 2500) {
      speechScore = Math.min(1.0, speechScore + 0.2);
    }
    if (soundType === 'transient_click' || soundType === 'rumble') {
      speechScore *= 0.3;
    }

    const isHumanSpeech = soundType === 'speech' && speechScore >= 0.48;

    return {
      speechScore,
      isHumanSpeech,
      dominantFreq,
      soundType,
      lowBand,
      midBand,
      highBand
    };
  }
}
