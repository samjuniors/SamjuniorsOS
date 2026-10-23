import { useState, useEffect, useRef, useCallback } from 'react';
import { ConversationManager } from './ConversationManager';
import {
  AudioMetrics,
  Emotion,
  SofiaMessage,
  SofiaState,
  SofiaSubtitleData,
  VoiceConfig,
  WakeSettings,
  WakeTrigger,
} from '../types/sofia';

export interface UseSofiaVoiceOptions {
  autoConnectStatus?: boolean;
  initialVoiceConfig?: Partial<VoiceConfig>;
  initialWakeSettings?: Partial<WakeSettings>;
  onStateChange?: (state: SofiaState) => void;
  onEmotionChange?: (emotion: Emotion) => void;
  onAudioMetrics?: (metrics: AudioMetrics) => void;
  onMessageAdd?: (msg: SofiaMessage) => void;
  onWakeDetected?: (trigger: WakeTrigger) => void;
  onError?: (error: string) => void;
}

export function useSofiaVoice(options: UseSofiaVoiceOptions = {}) {
  const {
    autoConnectStatus = true,
    initialVoiceConfig,
    initialWakeSettings,
    onStateChange,
    onEmotionChange,
    onAudioMetrics,
    onMessageAdd,
    onWakeDetected,
    onError,
  } = options;

  const [state, setState] = useState<SofiaState>('BOOT');
  const [emotion, setEmotionState] = useState<Emotion>('neutral');
  const [subtitle, setSubtitle] = useState<SofiaSubtitleData | null>(null);
  const [isMuted, setIsMutedState] = useState(false);
  const [audioMetrics, setAudioMetrics] = useState<AudioMetrics>({
    rms: 0,
    peak: 0,
    lowEnergy: 0,
    midEnergy: 0,
    highEnergy: 0,
    speechScore: 0,
    isSpeech: false,
    dominantFrequency: 0,
    noiseFloor: 0.01,
    isClap: false,
  });
  const [messages, setMessages] = useState<SofiaMessage[]>([]);
  const [isAwakened, setIsAwakened] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [lastWakeTrigger, setLastWakeTrigger] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<any>(null);

  const [voiceConfig, setVoiceConfigState] = useState<VoiceConfig>({
    name: 'Sofia (Australian)',
    accent: 'Australian',
    speed: 1.0,
    pitch: 1.0,
    provider: 'gemini-live',
    geminiVoiceName: 'Aoede',
    ...initialVoiceConfig,
  });

  const [wakeSettings, setWakeSettingsState] = useState<WakeSettings>({
    wakeWordEnabled: true,
    clapGestureEnabled: true,
    tapEnabled: true,
    sensitivity: 0.6,
    clapThreshold: 0.35,
    ...initialWakeSettings,
  });

  const managerRef = useRef<ConversationManager | null>(null);

  // Status check
  useEffect(() => {
    if (!autoConnectStatus) return;
    fetch('/api/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setServerStatus(data);
      })
      .catch((err) => console.warn('Could not reach /api/status:', err));
  }, [autoConnectStatus]);

  // Boot / Awaken Sofia
  const awaken = useCallback(
    async (trigger?: WakeTrigger): Promise<boolean> => {
      setIsBooting(true);
      setBootError(null);

      if (managerRef.current) {
        managerRef.current.destroy();
      }

      const manager = new ConversationManager({
        onStateChange: (newState) => {
          setState(newState);
          onStateChange?.(newState);
        },
        onEmotionChange: (newEmotion) => {
          setEmotionState(newEmotion);
          onEmotionChange?.(newEmotion);
        },
        onAudioMetrics: (metrics) => {
          setAudioMetrics(metrics);
          onAudioMetrics?.(metrics);
        },
        onMessageAdd: (msg) => {
          setMessages((prev) => [...prev, msg]);
          onMessageAdd?.(msg);
        },
        onWakeDetected: (trig) => {
          setLastWakeTrigger(trig);
          onWakeDetected?.(trig);
          setTimeout(() => setLastWakeTrigger(null), 3000);
        },
        onError: (err) => {
          setBootError(err);
          onError?.(err);
        },
        onSubtitleUpdate: (subtitleData) => {
          setSubtitle(subtitleData);
        },
      });

      managerRef.current = manager;
      manager.setVoiceConfig(voiceConfig);
      manager.setWakeSettings(wakeSettings);

      const success = await manager.boot(trigger);
      setIsBooting(false);
      if (success) {
        setIsAwakened(true);
        if (trigger) {
          setLastWakeTrigger(trigger);
          setTimeout(() => setLastWakeTrigger(null), 3000);
        }
      }
      return success;
    },
    [onStateChange, onEmotionChange, onAudioMetrics, onMessageAdd, onWakeDetected, onError, voiceConfig, wakeSettings]
  );

  const togglePause = useCallback(() => {
    if (!managerRef.current) return;
    if (state === 'PAUSED') {
      managerRef.current.resume();
    } else {
      managerRef.current.pause();
    }
  }, [state]);

  const pause = useCallback(() => {
    managerRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    managerRef.current?.resume();
  }, []);

  const toggleMute = useCallback(() => {
    if (!managerRef.current) return;
    const nextMuted = !isMuted;
    setIsMutedState(nextMuted);
    managerRef.current.setMuted(nextMuted);
  }, [isMuted]);

  const setMuted = useCallback((muted: boolean) => {
    setIsMutedState(muted);
    managerRef.current?.setMuted(muted);
  }, []);

  const triggerTap = useCallback(() => {
    managerRef.current?.triggerTapActivation();
  }, []);

  const setEmotion = useCallback((newEmotion: Emotion) => {
    setEmotionState(newEmotion);
    managerRef.current?.setEmotion(newEmotion);
  }, []);

  const setVoiceConfig = useCallback((config: Partial<VoiceConfig>) => {
    setVoiceConfigState((prev) => {
      const updated = { ...prev, ...config };
      managerRef.current?.setVoiceConfig(updated);
      return updated;
    });
  }, []);

  const setWakeSettings = useCallback((settings: Partial<WakeSettings>) => {
    setWakeSettingsState((prev) => {
      const updated = { ...prev, ...settings };
      managerRef.current?.setWakeSettings(updated);
      return updated;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (managerRef.current) {
        managerRef.current.destroy();
        managerRef.current = null;
      }
    };
  }, []);

  return {
    state,
    emotion,
    subtitle,
    isMuted,
    audioMetrics,
    messages,
    isAwakened,
    isBooting,
    bootError,
    lastWakeTrigger,
    serverStatus,
    voiceConfig,
    wakeSettings,
    awaken,
    togglePause,
    pause,
    resume,
    toggleMute,
    setMuted,
    triggerTap,
    setEmotion,
    setVoiceConfig,
    setWakeSettings,
    manager: managerRef.current,
  };
}
