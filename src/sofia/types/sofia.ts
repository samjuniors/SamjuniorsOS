export type SofiaState =
  | 'BOOT'
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'ERROR';

export type Emotion =
  | 'neutral'
  | 'happiness'
  | 'curiosity'
  | 'surprise'
  | 'concern'
  | 'calmness'
  | 'excitement'
  | 'empathy'
  | 'playfulness';

export interface EmotionVisualTheme {
  primary: string;
  secondary: string;
  glow: string;
  particleColor: string;
  pulseRate: number;
  breathAmplitude: number;
  waveHarmonics: number;
  waveComplexity: number;
  buoyancy: number; // subtle vertical float offset
  orbitalSpeed: number;
  particleExcitement: number;
}

export interface AudioMetrics {
  rms: number;
  peak: number;
  lowEnergy: number; // 80 - 300Hz vocal bass
  midEnergy: number; // 300 - 2500Hz vocal formants
  highEnergy: number; // > 2500Hz consonants/air
  speechScore: number;
  isSpeech: boolean;
  dominantFrequency: number;
  noiseFloor: number;
  isClap: boolean;
}

export interface VoiceConfig {
  name: string;
  accent: string;
  speed: number;
  pitch: number;
  provider: 'gemini-live' | 'gemini-tts' | 'webspeech';
  geminiVoiceName: 'Aoede' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
}

export interface SofiaMessage {
  id: string;
  role: 'user' | 'sofia';
  text: string;
  timestamp: number;
  emotion?: Emotion;
  interrupted?: boolean;
}

export interface ConversationContext {
  messages: SofiaMessage[];
  lastUserSpeechTimestamp: number;
  currentEmotion: Emotion;
  userName?: string;
  conversationTopic?: string;
}

export interface WakeSettings {
  wakeWordEnabled: boolean;
  clapGestureEnabled: boolean;
  tapEnabled: boolean;
  sensitivity: number; // 0.1 to 1.0
  clapThreshold: number;
  /** Phrases that wake her (lower-cased substring match). Defaults to the Sofia family. */
  wakeWords?: string[];
}
