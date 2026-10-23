import {
  AudioMetrics,
  Emotion,
  SofiaMessage,
  SofiaState,
  SofiaSubtitleData,
  VoiceConfig,
  WakeSettings
} from '../types/sofia';
import { AudioInput } from './AudioInput';
import { AudioOutput } from './AudioOutput';
import { EmotionEngine } from './EmotionEngine';
import { InterruptionManager } from './InterruptionManager';
import { PersonaEngine } from './PersonaEngine';
import { SubtitleManager } from './SubtitleManager';
import { LiveApiProvider } from './providers/LiveApiProvider';
import { ModularProvider } from './providers/ModularProvider';
import { VoiceActivityDetection } from './VoiceActivityDetection';
import { WakeTrigger, WakeWordDetection } from './WakeWordDetection';

export interface ConversationManagerCallbacks {
  onStateChange: (state: SofiaState) => void;
  onEmotionChange: (emotion: Emotion) => void;
  onAudioMetrics: (metrics: AudioMetrics) => void;
  onMessageAdd: (message: SofiaMessage) => void;
  onWakeDetected: (trigger: WakeTrigger) => void;
  onError: (errorMsg: string) => void;
  onSubtitleUpdate: (subtitle: SofiaSubtitleData | null) => void;
}

export class ConversationManager {
  private state: SofiaState = 'BOOT';
  private callbacks: ConversationManagerCallbacks;

  // Core subsystems
  private audioInput = new AudioInput();
  private audioOutput = new AudioOutput();
  private vad: VoiceActivityDetection;
  private wakeWordDetector: WakeWordDetection;
  private interruptionManager: InterruptionManager;
  private emotionEngine = new EmotionEngine();
  private personaEngine = new PersonaEngine();

  // Providers
  private liveApiProvider: LiveApiProvider;
  private modularProvider = new ModularProvider();

  // State & Settings
  private messages: SofiaMessage[] = [];
  private activeTranscript = '';
  private subtitleManager: SubtitleManager;
  private isAwake = false; // whether Sofia is in active dialogue vs waiting for wake gesture
  private conversationTopic = '';
  private voiceConfig: VoiceConfig = {
    name: 'Sofia (Australian)',
    accent: 'Australian',
    speed: 1.0,
    pitch: 1.0,
    provider: 'gemini-live',
    geminiVoiceName: 'Aoede'
  };

  private animationFrameId: number | null = null;
  private isProcessingTurn = false;
  private isMuted = false;
  private inactivityTimer: any = null;
  private readonly INACTIVITY_DELAY_MS = 6000;

  constructor(callbacks: ConversationManagerCallbacks) {
    this.callbacks = callbacks;

    // Subtitle Manager for English pronunciation thought groups
    this.subtitleManager = new SubtitleManager((data) => {
      this.callbacks.onSubtitleUpdate(data);
    });
    this.subtitleManager.setSpeed(this.voiceConfig.speed || 1.0);

    // 1. Audio Output setup
    this.audioOutput = new AudioOutput((isPlaying) => {
      if (isPlaying && this.getState() !== 'SPEAKING') {
        this.setState('SPEAKING');
      } else if (!isPlaying && this.getState() === 'SPEAKING' && !this.isProcessingTurn) {
        if (this.getState() !== 'PAUSED') {
          this.setState('LISTENING');
          this.resetInactivityTimer();
        }
        this.subtitleManager.finishTurn();
      }
    });

    // 2. Interruption Manager
    this.interruptionManager = new InterruptionManager(this.audioOutput, {
      onInterrupt: () => {
        this.handleInterruption();
      }
    });

    // 3. VAD setup
    this.vad = new VoiceActivityDetection({
      onSpeechStart: () => {
        this.handleUserSpeechStart();
      },
      onSpeechEnd: (durationMs) => {
        this.handleUserSpeechEnd(durationMs);
      },
      onMetrics: (metrics) => {
        this.callbacks.onAudioMetrics(metrics);
        // Interruption checking while Sofia is speaking
        if (this.state === 'SPEAKING') {
          this.interruptionManager.handleUserSpeechDetected(metrics.isSpeech, metrics.rms);
        } else if (metrics.isSpeech && this.state === 'LISTENING') {
          this.postponeInactivity();
        }
      },
      onTransientNoise: (type) => {
        console.debug('Environmental sound ignored:', type);
      }
    });

    // 4. Wake Word Detection
    this.wakeWordDetector = new WakeWordDetection({
      onWake: (trigger, transcript) => {
        this.handleWakeActivation(trigger, transcript);
      }
    });

    // 5. Live API Provider setup
    this.liveApiProvider = new LiveApiProvider({
      onReady: () => {
        console.log('Sofia Live API connected.');
      },
      onAudioChunk: (base64Pcm) => {
        if (this.getState() === 'PAUSED' || !this.isAwake) {
          return;
        }
        if (this.state !== 'SPEAKING') {
          this.setState('SPEAKING');
          this.interruptionManager.setSofiaSpeaking(true);
        }
        this.audioOutput.queuePcmChunk(base64Pcm);
      },
      onTranscript: (text) => {
        if (this.getState() === 'PAUSED' || !this.isAwake) {
          return;
        }
        this.activeTranscript += text;
        this.subtitleManager.appendLiveChunk(text);
        const inferred = this.emotionEngine.inferEmotionFromText(text);
        if (inferred !== this.emotionEngine.getEmotion()) {
          this.emotionEngine.setEmotion(inferred);
          this.callbacks.onEmotionChange(inferred);
        }
      },
      onInterrupted: () => {
        this.handleInterruption();
      },
      onTurnComplete: () => {
        this.isProcessingTurn = false;
        if (this.getState() === 'PAUSED' || !this.isAwake) {
          return;
        }
        if (this.activeTranscript.trim()) {
          const msg: SofiaMessage = {
            id: 'sofia-' + Date.now(),
            role: 'sofia',
            text: this.personaEngine.cleanSpokenText(this.activeTranscript),
            timestamp: Date.now(),
            emotion: this.emotionEngine.getEmotion()
          };
          this.messages.push(msg);
          this.callbacks.onMessageAdd(msg);
          this.activeTranscript = '';
        }
        if (!this.audioOutput.getIsPlaying()) {
          if (this.state !== 'PAUSED') {
            this.setState('LISTENING');
            this.resetInactivityTimer();
          }
          this.subtitleManager.finishTurn();
        }
      },
      onError: (err) => {
        console.warn('Live API Provider error:', err);
      },
      onClose: () => {
        console.log('Live API session closed.');
      }
    });
  }

  async boot(wakeTrigger?: WakeTrigger): Promise<boolean> {
    this.setState('BOOT');
    try {
      // Initialize audio output
      await this.audioOutput.init();

      // Initialize audio input with 16kHz PCM chunk streaming
      const micSuccess = await this.audioInput.init((pcm16Base64, rawFloat) => {
        // While paused, do NOT stream audio or process claps
        if (this.getState() === 'PAUSED' || !this.isAwake) {
          return;
        }

        // Send to Live API only if connected, awake, and actively listening/speaking (not paused or idle)
        if (
          this.liveApiProvider.getIsConnected() &&
          this.isAwake &&
          this.state !== 'IDLE'
        ) {
          this.liveApiProvider.sendAudioChunk(pcm16Base64);
        }
        // Also feed raw audio into physical clap detector when awake
        this.wakeWordDetector.processFrameForClap(rawFloat);
      });

      if (!micSuccess) {
        this.setState('ERROR');
        this.callbacks.onError('Microphone access is required to talk with Sofia.');
        return false;
      }

      // Try connecting to Gemini Live API via WebSocket
      const liveConnected = await this.liveApiProvider.connect();
      if (!liveConnected) {
        console.info('Live WebSocket fallback to ModularProvider');
        this.voiceConfig.provider = 'gemini-tts';
      }

      // Start wake word detector
      this.wakeWordDetector.startWakeWordRecognizer();

      // Start audio analysis loop
      this.startAnalysisLoop();

      // Sofia is ready!
      this.isAwake = true;
      if (wakeTrigger) {
        this.handleWakeActivation(wakeTrigger);
      } else {
        this.setState('IDLE');
      }
      return true;
    } catch (err: any) {
      console.error('Boot sequence error:', err);
      this.setState('ERROR');
      this.callbacks.onError(err?.message || 'Failed to start voice system');
      return false;
    }
  }

  private startAnalysisLoop() {
    const inputAnalyser = this.audioInput.getAnalyserNode();
    const outputAnalyser = this.audioOutput.getAnalyserNode();
    if (!inputAnalyser) return;

    const timeData = new Float32Array(inputAnalyser.fftSize);
    const freqData = new Uint8Array(inputAnalyser.frequencyBinCount);

    const tick = () => {
      // When Sofia is speaking, visualize her output voice; otherwise visualize user mic input
      if (this.state === 'SPEAKING' && outputAnalyser) {
        outputAnalyser.getFloatTimeDomainData(timeData);
        outputAnalyser.getByteFrequencyData(freqData);

        let sum = 0;
        let peak = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = Math.abs(timeData[i]);
          if (v > peak) peak = v;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / timeData.length);

        // Real frequency band extraction for Sofia's output voice
        const binCount = freqData.length;
        const binWidth = (this.audioOutput.getAnalyserNode()?.context.sampleRate || 24000) / (2 * binCount);
        let lowSum = 0;
        let midSum = 0;
        let highSum = 0;
        let peakVal = 0;
        let peakIndex = 0;

        for (let i = 0; i < binCount; i++) {
          const val = freqData[i];
          const freq = i * binWidth;
          if (val > peakVal) {
            peakVal = val;
            peakIndex = i;
          }
          if (freq < 300) {
            lowSum += val;
          } else if (freq <= 2500) {
            midSum += val;
          } else {
            highSum += val;
          }
        }

        const dominantFreq = peakIndex * binWidth || 450;
        const lowEnergy = Math.min(1.0, (lowSum / (binCount * 0.25 * 255)) * 2.5);
        const midEnergy = Math.min(1.0, (midSum / (binCount * 0.5 * 255)) * 2.5);
        const highEnergy = Math.min(1.0, (highSum / (binCount * 0.25 * 255)) * 3.0);

        this.callbacks.onAudioMetrics({
          rms,
          peak,
          lowEnergy,
          midEnergy,
          highEnergy,
          speechScore: 0.95,
          isSpeech: true,
          dominantFrequency: dominantFreq,
          noiseFloor: 0.01,
          isClap: false
        });
      } else {
        inputAnalyser.getFloatTimeDomainData(timeData);
        inputAnalyser.getByteFrequencyData(freqData);
        if (this.getState() !== 'PAUSED' && this.isAwake) {
          this.vad.processFrame(timeData, freqData, 16000);
        }
      }

      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  private handleUserSpeechStart() {
    if (this.getState() === 'PAUSED' || !this.isAwake) {
      // In explicit PAUSED state, do not interrupt sleep unless wake word or tap happens
      return;
    }

    if (this.state === 'SPEAKING') {
      // Natural interruption!
      this.handleInterruption();
      return;
    }

    this.clearInactivityTimer();
    if (this.state !== 'LISTENING') {
      this.setState('LISTENING');
    }
  }

  private async handleUserSpeechEnd(durationMs: number) {
    if (this.getState() === 'SPEAKING' || this.getState() === 'PAUSED' || !this.isAwake) return;

    // Transition to thinking
    this.setState('THINKING');
    this.isProcessingTurn = true;

    // If using ModularProvider (fallback or configured)
    if (this.voiceConfig.provider !== 'gemini-live' || !this.liveApiProvider.getIsConnected()) {
      // In modular mode, speech recognition provides transcript
      // or we simulate context if speech recognition wasn't available
      const userText = this.activeTranscript || 'Hello Sofia!';
      this.activeTranscript = '';

      const userMsg: SofiaMessage = {
        id: 'user-' + Date.now(),
        role: 'user',
        text: userText,
        timestamp: Date.now()
      };
      this.messages.push(userMsg);
      this.callbacks.onMessageAdd(userMsg);

      // Infer emotion from user speech
      const userEmotion = this.emotionEngine.inferEmotionFromText(userText);
      this.emotionEngine.setEmotion(userEmotion);
      this.callbacks.onEmotionChange(userEmotion);

      // Generate response from Gemini Flash
      try {
        const responseText = await this.modularProvider.generateResponse(
          this.messages.map((m) => ({ role: m.role, content: m.text })),
          userText,
          userEmotion
        );

        if (this.getState() === 'INTERRUPTED' || this.getState() === 'PAUSED') return;

        const cleanText = this.personaEngine.cleanSpokenText(responseText);
        const sofiaMsg: SofiaMessage = {
          id: 'sofia-' + Date.now(),
          role: 'sofia',
          text: cleanText,
          timestamp: Date.now(),
          emotion: userEmotion
        };
        this.messages.push(sofiaMsg);
        this.callbacks.onMessageAdd(sofiaMsg);

        this.setState('SPEAKING');
        this.interruptionManager.setSofiaSpeaking(true);
        this.subtitleManager.startTurn(cleanText);

        await this.modularProvider.speak(
          cleanText,
          this.voiceConfig,
          userEmotion,
          (pcmChunk, durationMs) => {
            if (durationMs) {
              this.subtitleManager.adjustTotalDuration(durationMs);
            }
            this.audioOutput.queuePcmChunk(pcmChunk);
          },
          (charIndex) => {
            this.subtitleManager.onCharBoundary(charIndex);
          }
        );
        this.subtitleManager.finishTurn();
      } catch (err: any) {
        console.error('Modular turn error:', err);
        this.subtitleManager.clear();
        this.setState('ERROR');
        setTimeout(() => this.setState('IDLE'), 2000);
      } finally {
        this.isProcessingTurn = false;
        if (!this.audioOutput.getIsPlaying() && this.getState() !== 'INTERRUPTED' && this.getState() !== 'PAUSED') {
          this.setState('LISTENING');
          this.resetInactivityTimer();
        }
      }
    }
  }

  handleInterruption() {
    this.clearInactivityTimer();
    this.subtitleManager.clear();
    this.audioOutput.stopImmediately();
    this.modularProvider.stopSpeaking();
    this.liveApiProvider.sendInterrupt();
    this.interruptionManager.setSofiaSpeaking(false);
    this.isProcessingTurn = false;

    // Flash interrupted state briefly then transition to listening
    this.setState('INTERRUPTED');
    setTimeout(() => {
      if (this.state !== 'PAUSED') {
        this.setState('LISTENING');
        this.resetInactivityTimer();
      }
    }, 280);
  }

  handleWakeActivation(trigger: WakeTrigger, transcript?: string) {
    // If paused, reject clap triggers completely (only explicit wake-word or orb tap allowed)
    if (this.getState() === 'PAUSED' && trigger === 'clap') {
      return;
    }

    this.isAwake = true;
    this.callbacks.onWakeDetected(trigger);

    // If Sofia is paused, idle, or active, wake up and focus!
    this.resume();

    if (trigger === 'wake-word') {
      const queryAfterWake = transcript
        ? transcript
            .replace(/^(hey|hi|hello)\s+(sofia|sophia)\s*/i, '')
            .replace(/^(sofia|sophia|wake up)\s*/i, '')
            .trim()
        : '';

      if (queryAfterWake.length > 2) {
        this.handleUserQueryDirect(queryAfterWake);
      } else {
        this.greetOnWake();
      }
    }
  }

  private async greetOnWake() {
    if (this.state === 'SPEAKING' || this.isProcessingTurn) return;

    const greetings = [
      "Hey there, I'm listening!",
      "I'm right here! How can I help?",
      "G'day! What's on your mind?",
      "Hey! I'm all ears."
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    const sofiaMsg: SofiaMessage = {
      id: 'sofia-' + Date.now(),
      role: 'sofia',
      text: greeting,
      timestamp: Date.now(),
      emotion: 'happiness'
    };
    this.messages.push(sofiaMsg);
    this.callbacks.onMessageAdd(sofiaMsg);
    this.callbacks.onEmotionChange('happiness');

    this.setState('SPEAKING');
    this.interruptionManager.setSofiaSpeaking(true);
    this.subtitleManager.startTurn(greeting);

    try {
      await this.modularProvider.speak(
        greeting,
        this.voiceConfig,
        'happiness',
        (pcmChunk, durationMs) => {
          if (durationMs) {
            this.subtitleManager.adjustTotalDuration(durationMs);
          }
          this.audioOutput.queuePcmChunk(pcmChunk);
        },
        (charIndex) => {
          this.subtitleManager.onCharBoundary(charIndex);
        }
      );
      this.subtitleManager.finishTurn();
    } catch (e) {
      console.warn('Greeting speak error:', e);
      this.subtitleManager.finishTurn();
    } finally {
      this.interruptionManager.setSofiaSpeaking(false);
      if (this.state !== 'INTERRUPTED' && this.state !== 'PAUSED') {
        this.setState('LISTENING');
        this.resetInactivityTimer();
      }
    }
  }

  private async handleUserQueryDirect(query: string) {
    this.setState('THINKING');
    this.isProcessingTurn = true;
    this.activeTranscript = '';

    const userMsg: SofiaMessage = {
      id: 'user-' + Date.now(),
      role: 'user',
      text: query,
      timestamp: Date.now()
    };
    this.messages.push(userMsg);
    this.callbacks.onMessageAdd(userMsg);

    const userEmotion = this.emotionEngine.inferEmotionFromText(query);
    this.emotionEngine.setEmotion(userEmotion);
    this.callbacks.onEmotionChange(userEmotion);

    try {
      const responseText = await this.modularProvider.generateResponse(
        this.messages.map((m) => ({ role: m.role, content: m.text })),
        query,
        userEmotion
      );

      if (this.getState() === 'INTERRUPTED' || this.getState() === 'PAUSED') return;

      const cleanText = this.personaEngine.cleanSpokenText(responseText);
      const sofiaMsg: SofiaMessage = {
        id: 'sofia-' + Date.now(),
        role: 'sofia',
        text: cleanText,
        timestamp: Date.now(),
        emotion: userEmotion
      };
      this.messages.push(sofiaMsg);
      this.callbacks.onMessageAdd(sofiaMsg);

      this.setState('SPEAKING');
      this.interruptionManager.setSofiaSpeaking(true);
      this.subtitleManager.startTurn(cleanText);

      await this.modularProvider.speak(
        cleanText,
        this.voiceConfig,
        userEmotion,
        (pcmChunk, durationMs) => {
          if (durationMs) {
            this.subtitleManager.adjustTotalDuration(durationMs);
          }
          this.audioOutput.queuePcmChunk(pcmChunk);
        },
        (charIndex) => {
          this.subtitleManager.onCharBoundary(charIndex);
        }
      );
      this.subtitleManager.finishTurn();
    } catch (err: any) {
      console.error('Direct query error:', err);
      this.subtitleManager.clear();
      this.setState('ERROR');
      setTimeout(() => this.setState('IDLE'), 2000);
    } finally {
      this.isProcessingTurn = false;
      this.interruptionManager.setSofiaSpeaking(false);
      if (!this.audioOutput.getIsPlaying() && this.getState() !== 'INTERRUPTED' && this.getState() !== 'PAUSED') {
        this.setState('LISTENING');
        this.resetInactivityTimer();
      }
    }
  }

  sendText(text: string) {
    if (!text.trim()) return;
    if (this.state === 'PAUSED') {
      this.resume();
    }
    if (this.liveApiProvider.getIsConnected()) {
      const userMsg: SofiaMessage = {
        id: 'user-' + Date.now(),
        role: 'user',
        text: text.trim(),
        timestamp: Date.now(),
      };
      this.messages.push(userMsg);
      this.callbacks.onMessageAdd(userMsg);
      this.liveApiProvider.sendText(text.trim());
      this.setState('THINKING');
      this.isProcessingTurn = true;
    } else {
      this.handleUserQueryDirect(text.trim());
    }
  }

  triggerTapActivation() {
    this.wakeWordDetector.triggerTapWake();
    if (this.state === 'PAUSED') {
      this.resume();
    } else {
      this.pause();
    }
  }

  pause() {
    this.clearInactivityTimer();
    this.subtitleManager.clear();
    this.audioOutput.stopImmediately();
    this.modularProvider.stopSpeaking();
    this.liveApiProvider.sendInterrupt();
    this.interruptionManager.setSofiaSpeaking(false);
    this.isProcessingTurn = false;
    this.isAwake = false;
    this.setState('PAUSED');
    this.wakeWordDetector.setPaused(true);
  }

  resume() {
    this.wakeWordDetector.setPaused(false);
    this.isAwake = true;
    this.setState('LISTENING');
    this.resetInactivityTimer();
  }

  private resetInactivityTimer() {
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(() => {
      if (this.state === 'LISTENING' && !this.isProcessingTurn && !this.audioOutput.getIsPlaying()) {
        this.setState('IDLE');
      }
    }, this.INACTIVITY_DELAY_MS);
  }

  private clearInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private postponeInactivity() {
    if (this.inactivityTimer) {
      this.clearInactivityTimer();
      this.resetInactivityTimer();
    }
  }

  // Voice & Persona customization
  setVoiceConfig(config: Partial<VoiceConfig>) {
    this.voiceConfig = { ...this.voiceConfig, ...config };
    if (this.voiceConfig.speed) {
      this.subtitleManager.setSpeed(this.voiceConfig.speed);
    }
  }

  getVoiceConfig(): VoiceConfig {
    return { ...this.voiceConfig };
  }

  setWakeSettings(settings: Partial<WakeSettings>) {
    this.wakeWordDetector.updateSettings(settings);
  }

  getWakeSettings(): WakeSettings {
    return this.wakeWordDetector.getSettings();
  }

  getState(): SofiaState {
    return this.state;
  }

  getEmotion(): Emotion {
    return this.emotionEngine.getEmotion();
  }

  setEmotion(emotion: Emotion) {
    this.emotionEngine.setEmotion(emotion);
    this.callbacks.onEmotionChange(emotion);
  }

  getEmotionTheme() {
    return this.emotionEngine.getTheme();
  }

  getMessages(): SofiaMessage[] {
    return [...this.messages];
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    this.audioInput.setCapturing(!muted);
    if (muted) {
      if (this.state === 'LISTENING') {
        this.setState('IDLE');
      }
    } else {
      if (this.state === 'IDLE' && this.isAwake) {
        this.setState('LISTENING');
      }
    }
  }

  getIsMuted(): boolean {
    return this.isMuted;
  }

  private setState(newState: SofiaState) {
    if (this.state !== newState) {
      this.state = newState;
      this.callbacks.onStateChange(newState);
    }
  }

  destroy() {
    this.clearInactivityTimer();
    this.subtitleManager.destroy();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.audioInput.destroy();
    this.audioOutput.destroy();
    this.wakeWordDetector.destroy();
    this.liveApiProvider.disconnect();
    this.modularProvider.stopListening();
  }
}
