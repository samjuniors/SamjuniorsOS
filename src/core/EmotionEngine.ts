import { Emotion, EmotionVisualTheme } from '../types/sofia';

export class EmotionEngine {
  private currentEmotion: Emotion = 'neutral';
  private emotionThemes: Record<Emotion, EmotionVisualTheme> = {
    neutral: {
      primary: '#38bdf8', // crisp ethereal cyan
      secondary: '#6366f1', // indigo
      glow: 'rgba(56, 189, 248, 0.42)',
      particleColor: 'rgba(186, 230, 253, 0.8)',
      pulseRate: 0.019,
      breathAmplitude: 7,
      waveHarmonics: 3,
      waveComplexity: 0.3,
      buoyancy: 0,
      orbitalSpeed: 1.0,
      particleExcitement: 1.0
    },
    happiness: {
      primary: '#fbbf24', // warm golden amber
      secondary: '#f59e0b', // golden light
      glow: 'rgba(251, 191, 36, 0.48)',
      particleColor: 'rgba(254, 240, 138, 0.85)',
      pulseRate: 0.024,
      breathAmplitude: 9,
      waveHarmonics: 3,
      waveComplexity: 0.35,
      buoyancy: -5, // light buoyant lift
      orbitalSpeed: 1.15,
      particleExcitement: 1.2
    },
    curiosity: {
      primary: '#a78bfa', // luminous purple
      secondary: '#38bdf8', // electric cyan
      glow: 'rgba(167, 139, 250, 0.52)',
      particleColor: 'rgba(233, 213, 255, 0.85)',
      pulseRate: 0.026,
      breathAmplitude: 11,
      waveHarmonics: 4,
      waveComplexity: 0.52,
      buoyancy: -2,
      orbitalSpeed: 1.35,
      particleExcitement: 1.3
    },
    surprise: {
      primary: '#34d399', // bright seafoam emerald
      secondary: '#38bdf8', // sky blue
      glow: 'rgba(52, 211, 153, 0.5)',
      particleColor: 'rgba(209, 250, 229, 0.9)',
      pulseRate: 0.03,
      breathAmplitude: 12,
      waveHarmonics: 4,
      waveComplexity: 0.45,
      buoyancy: -5,
      orbitalSpeed: 1.4,
      particleExcitement: 1.4
    },
    concern: {
      primary: '#fb923c', // soft terracotta amber
      secondary: '#f43f5e', // rose
      glow: 'rgba(251, 146, 60, 0.38)',
      particleColor: 'rgba(254, 215, 170, 0.75)',
      pulseRate: 0.017,
      breathAmplitude: 6.5,
      waveHarmonics: 2,
      waveComplexity: 0.22,
      buoyancy: 1,
      orbitalSpeed: 0.8,
      particleExcitement: 0.75
    },
    calmness: {
      primary: '#2dd4bf', // serene teal
      secondary: '#3b82f6', // soft ocean blue
      glow: 'rgba(45, 212, 191, 0.38)',
      particleColor: 'rgba(204, 251, 241, 0.8)',
      pulseRate: 0.014,
      breathAmplitude: 5.5,
      waveHarmonics: 2,
      waveComplexity: 0.18,
      buoyancy: 0,
      orbitalSpeed: 0.75,
      particleExcitement: 0.7
    },
    excitement: {
      primary: '#f43f5e', // radiant coral crimson
      secondary: '#fbbf24', // golden light
      glow: 'rgba(244, 63, 94, 0.55)',
      particleColor: 'rgba(255, 228, 230, 0.95)',
      pulseRate: 0.034,
      breathAmplitude: 13,
      waveHarmonics: 5,
      waveComplexity: 0.65,
      buoyancy: -7,
      orbitalSpeed: 1.6,
      particleExcitement: 1.65
    },
    empathy: {
      primary: '#c084fc', // gentle lavender
      secondary: '#f472b6', // soft warm rose
      glow: 'rgba(192, 132, 252, 0.42)',
      particleColor: 'rgba(243, 232, 255, 0.85)',
      pulseRate: 0.016,
      breathAmplitude: 7.5,
      waveHarmonics: 3,
      waveComplexity: 0.25,
      buoyancy: 2,
      orbitalSpeed: 0.85,
      particleExcitement: 0.8
    },
    playfulness: {
      primary: '#ec4899', // playful magenta rose
      secondary: '#a855f7', // violet
      glow: 'rgba(236, 72, 153, 0.5)',
      particleColor: 'rgba(251, 207, 232, 0.9)',
      pulseRate: 0.028,
      breathAmplitude: 10,
      waveHarmonics: 4,
      waveComplexity: 0.5,
      buoyancy: -4,
      orbitalSpeed: 1.4,
      particleExcitement: 1.45
    }
  };

  getEmotion(): Emotion {
    return this.currentEmotion;
  }

  setEmotion(emotion: Emotion) {
    this.currentEmotion = emotion;
  }

  getTheme(emotion: Emotion = this.currentEmotion): EmotionVisualTheme {
    return this.emotionThemes[emotion] || this.emotionThemes.neutral;
  }

  static hexToRgb(hex: string): [number, number, number] {
    const cleanHex = hex.replace('#', '');
    const num = parseInt(cleanHex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  static lerpRgb(
    from: [number, number, number],
    to: [number, number, number],
    t: number
  ): [number, number, number] {
    return [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t
    ];
  }

  /**
   * Evaluates text from either user or Sofia to infer natural emotional inflection.
   */
  inferEmotionFromText(text: string): Emotion {
    const lower = text.toLowerCase();

    if (/awesome|fantastic|congrat|love it|hurray|stoked|excited|can't wait|yay/i.test(lower)) {
      return 'excitement';
    }
    if (/haha|hehe|joke|funny|teasing|laugh|silly|cheeky|bloody hell/i.test(lower)) {
      return 'playfulness';
    }
    if (/wonder|curious|how come|why is|what if|fascinating|tell me more/i.test(lower)) {
      return 'curiosity';
    }
    if (/really\?|no way|whoa|wow|seriously\?|unbelievable/i.test(lower)) {
      return 'surprise';
    }
    if (/sad|lonely|tired|hurt|struggling|hard day|heavy|crying|tough time/i.test(lower)) {
      return 'empathy';
    }
    if (/worried|anxious|nervous|afraid|scared|danger|sick/i.test(lower)) {
      return 'concern';
    }
    if (/relax|peace|breathe|serene|calm|quiet|sunset|easy/i.test(lower)) {
      return 'calmness';
    }
    if (/good|great|happy|glad|cheers|sweet|thanks|smiling/i.test(lower)) {
      return 'happiness';
    }

    return 'neutral';
  }
}
