'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LayoutGrid,
  Settings,
  X,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Camera,
  Play,
  Zap,
  AlertCircle,
  Terminal,
  Sliders,
  Sparkles,
  RefreshCw,
  Send,
  ArrowRight,
  ArrowUp,
  Globe,
  Image as ImageIcon,
  ExternalLink,
} from 'lucide-react';
import { HudPanelCard, HudCardData } from './HudPanelCard';
import { InOsBrowserModal } from './InOsBrowserModal';
import { BrowserSttClient } from '@/lib/client/live/browser-stt';
import { TtsSpeaker } from '@/lib/client/live/tts-speaker';
import {
  holdCamera,
  releaseCamera as releaseCameraStream,
  grabCameraSnapshot,
  CameraSnapshot,
} from '@/lib/client/live/camera-capture';
import { osSound } from '../../lib/osAudio';

interface DiagnosticEvent {
  id: string;
  timestamp: string;
  type: 'stt' | 'tts' | 'provider' | 'governance' | 'error' | 'camera';
  detail: string;
  durationMs?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'sophia';
  text: string;
  timestamp: string;
  latencyMs?: number;
  isDirective?: boolean;
  model?: string;
}

export default function JarvisLab({ onBackToOs }: { onBackToOs?: () => void }) {
  // Session & Identity
  const [sessionId] = useState(() => `sess-${Math.random().toString(36).slice(2, 9)}`);
  const [isConnected, setIsConnected] = useState(true);
  const [activeProvider, setActiveProvider] = useState('gemini');
  const [availableProviders, setAvailableProviders] = useState<Array<{ id: string; name: string; model: string }>>([
    { id: 'gemini', name: 'Google Gemini Flash', model: 'gemini-flash-latest' },
  ]);

  // Audio & Modality State
  const [modality, setModality] = useState<'idle' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'interrupted'>('idle');
  const [isMicActive, setIsMicActive] = useState(false);
  const isMicActiveRef = useRef(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isTtsMuted, setIsTtsMuted] = useState(false);
  const [transcriptInterim, setTranscriptInterim] = useState('');
  const [transcriptFinal, setTranscriptFinal] = useState('');
  const [textInput, setTextInput] = useState('');
  const [speechAlert, setSpeechAlert] = useState<{ message: string; hint: string } | null>(null);
  const [lastReply, setLastReply] = useState('');
  const lastReplyRef = useRef('');
  const [displayedReply, setDisplayedReply] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showCaption, setShowCaption] = useState(false);
  const wordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentWordsRef = useRef<string[]>([]);
  const currentWordIndexRef = useRef(0);
  const isPausedRef = useRef(false);
  const captionFadeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [turnLatencyMs, setTurnLatencyMs] = useState<number | null>(null);

  // Audio-Synchronized Voice Pulse State
  const [voicePulse, setVoicePulse] = useState(0);
  const pulseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Chat History & Terminal State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  // Persona State: 'friendly' | 'professional' | 'creative' | 'technical'
  const [persona, setPersona] = useState<'friendly' | 'professional' | 'creative' | 'technical'>('friendly');

  // Voice & TTS Engine Settings
  const [ttsEngine, setTtsEngine] = useState<'system' | 'elevenlabs'>('elevenlabs');
  const [selectedVoiceId, setSelectedVoiceId] = useState('bMxLr8fP6hzNRRi9nJxU');
  const [selectedVoiceName, setSelectedVoiceName] = useState('George (Jarvis / British)');
  const [availableVoices, setAvailableVoices] = useState<Array<{ voice_id: string; name: string; category?: string }>>([]);
  const [customVoiceId, setCustomVoiceId] = useState('');
  const [nativeVoices, setNativeVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedNativeVoiceName, setSelectedNativeVoiceName] = useState('');

  // In-OS Browser & HUD Panels State
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [browserUrl, setBrowserUrl] = useState('https://en.wikipedia.org');
  const [hudCards, setHudCards] = useState<HudCardData[]>([]);

  // Bottom Chat Bar Input
  const [bottomChatInput, setBottomChatInput] = useState('');
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  // Panels State (Studio Drawer & Settings)
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Vision & Camera
  const [cameraActive, setCameraActive] = useState(false);
  const [snapshot, setSnapshot] = useState<CameraSnapshot | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Governance & Directive Status
  const [lastGovernance, setLastGovernance] = useState<{
    isDirective: boolean;
    orchestrationRunId?: string;
    approvalsPending?: number;
    intent?: string;
  } | null>(null);

  // Diagnostics Log
  const [events, setEvents] = useState<DiagnosticEvent[]>([]);

  // Subsystem Clients
  const sttClientRef = useRef<BrowserSttClient | null>(null);
  const ttsSpeakerRef = useRef<TtsSpeaker | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Mic Mode: 'webspeech' (Web Speech API continuous mode) vs 'direct' (raw MediaRecorder)
  const [micMode, setMicMode] = useState<'direct' | 'webspeech'>('webspeech');
  const handleTurnSubmitRef = useRef<any>(null);

  const addEvent = useCallback((type: DiagnosticEvent['type'], detail: string, durationMs?: number) => {
    const time = new Date().toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setEvents((prev) => [
      { id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, timestamp: time, type, detail, durationMs },
      ...prev.slice(0, 49),
    ]);
  }, []);

  // Trigger an audio-synchronized vocal pulse on the center ring
  const triggerVoicePulse = useCallback(() => {
    setVoicePulse(1);
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    pulseTimeoutRef.current = setTimeout(() => {
      setVoicePulse(0);
    }, 150);
  }, []);

  // Stop active word-by-word subtitle scheduling
  const stopWordByWordSubtitle = useCallback(() => {
    if (wordTimerRef.current) {
      clearTimeout(wordTimerRef.current);
      wordTimerRef.current = null;
    }
  }, []);

  // Advance to next word, rendering words cumulatively ("what" -> "what are" -> "what are you")
  const advanceToNextWord = useCallback(() => {
    if (isPausedRef.current) return;
    const words = currentWordsRef.current;
    const nextIdx = currentWordIndexRef.current + 1;
    if (nextIdx <= words.length) {
      currentWordIndexRef.current = nextIdx;
      setDisplayedReply(words.slice(0, nextIdx).join(' '));
      triggerVoicePulse();

      if (nextIdx < words.length) {
        const currentWord = words[nextIdx - 1];
        // Adaptive natural cadence matching utterance rate 0.95 (~140 wpm = ~240ms base + syllables)
        let delay = 220 + Math.min(Math.max(0, currentWord.length - 3) * 26, 200);
        if (/[,;:]$/.test(currentWord)) {
          delay += 160;
        } else if (/[.?!]$/.test(currentWord)) {
          delay += 360;
        } else if (/[-—]$/.test(currentWord)) {
          delay += 120;
        }
        wordTimerRef.current = setTimeout(advanceToNextWord, delay);
      } else {
        setIsTyping(false);
      }
    }
  }, [triggerVoicePulse]);

  // Start word-by-word streaming display for Sophia's speech
  const startWordByWordSubtitle = useCallback((fullText: string) => {
    stopWordByWordSubtitle();
    if (captionFadeTimerRef.current) {
      clearTimeout(captionFadeTimerRef.current);
      captionFadeTimerRef.current = null;
    }

    const words = fullText.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    currentWordsRef.current = words;
    currentWordIndexRef.current = 0;
    setDisplayedReply('');
    setShowCaption(true);
    setIsTyping(true);
    isPausedRef.current = false;

    // Trigger first word almost immediately as voice audio articulates
    wordTimerRef.current = setTimeout(advanceToNextWord, 40);
  }, [stopWordByWordSubtitle, advanceToNextWord]);

  // Instantly clear any caption, word timers, and stop active typing
  const clearCaptionImmediate = useCallback(() => {
    stopWordByWordSubtitle();
    if (captionFadeTimerRef.current) {
      clearTimeout(captionFadeTimerRef.current);
      captionFadeTimerRef.current = null;
    }
    currentWordsRef.current = [];
    currentWordIndexRef.current = 0;
    setVoicePulse(0);
    setIsTyping(false);
    setShowCaption(false);
    setDisplayedReply('');
    setLastReply('');
    lastReplyRef.current = '';
  }, [stopWordByWordSubtitle]);

  const startWordByWordSubtitleRef = useRef(startWordByWordSubtitle);
  const stopWordByWordSubtitleRef = useRef(stopWordByWordSubtitle);
  const advanceToNextWordRef = useRef(advanceToNextWord);
  useEffect(() => {
    startWordByWordSubtitleRef.current = startWordByWordSubtitle;
    stopWordByWordSubtitleRef.current = stopWordByWordSubtitle;
    advanceToNextWordRef.current = advanceToNextWord;
  });

  // Cleanup media streaming hardware
  const releaseMediaHardware = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setMicLevel(0);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Safe ignore
      }
      mediaRecorderRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  // Full audio release
  const releaseAudioHardware = useCallback(() => {
    releaseMediaHardware();
    sttClientRef.current?.stop();
    isMicActiveRef.current = false;
    setIsMicActive(false);
  }, [releaseMediaHardware]);

  // Initialize Speech Services
  useEffect(() => {
    ttsSpeakerRef.current = new TtsSpeaker({
      onStart: () => {
        setModality('speaking');
        setShowCaption(true);
        setIsTyping(true);
        addEvent('tts', 'Speech synthesis output started');
        if (lastReplyRef.current) {
          startWordByWordSubtitleRef.current(lastReplyRef.current);
        }
      },
      // Real-time boundary event: synchronous speech-audio tracking
      onBoundary: (data) => {
        if (data.fullSpokenText) {
          const spokenWords = data.fullSpokenText.trim().split(/\s+/).filter(Boolean);
          if (spokenWords.length > currentWordIndexRef.current) {
            currentWordIndexRef.current = spokenWords.length;
            setDisplayedReply(spokenWords.join(' '));
            triggerVoicePulse();
            stopWordByWordSubtitleRef.current();
            if (spokenWords.length < currentWordsRef.current.length) {
              const currentWord = spokenWords[spokenWords.length - 1];
              let delay = 220 + Math.min(Math.max(0, currentWord.length - 3) * 26, 200);
              if (/[,;:]$/.test(currentWord)) delay += 160;
              else if (/[.?!]$/.test(currentWord)) delay += 360;
              wordTimerRef.current = setTimeout(advanceToNextWordRef.current, delay);
            } else {
              setIsTyping(false);
            }
          }
        }
      },
      onEnd: () => {
        stopWordByWordSubtitleRef.current();
        setVoicePulse(0);
        if (lastReplyRef.current) {
          setDisplayedReply(lastReplyRef.current);
        }
        setIsTyping(false);
        if (isMicActiveRef.current) {
          setModality('listening');
        } else {
          setModality('idle');
        }
        addEvent('tts', 'Speech synthesis playback complete');

        // Auto-remove caption when chat finishes (allow 4.2 seconds to read)
        if (captionFadeTimerRef.current) {
          clearTimeout(captionFadeTimerRef.current);
        }
        captionFadeTimerRef.current = setTimeout(() => {
          setShowCaption(false);
          setTimeout(() => {
            setDisplayedReply('');
            setLastReply('');
            lastReplyRef.current = '';
          }, 700);
        }, 4200);
      },
      onError: (err) => {
        stopWordByWordSubtitleRef.current();
        setVoicePulse(0);
        addEvent('error', `TTS error: ${err}`);
        if (isMicActiveRef.current) {
          setModality('listening');
        } else {
          setModality('idle');
        }
        if (lastReplyRef.current) {
          setDisplayedReply(lastReplyRef.current);
        }
        setIsTyping(false);
      },
    });

    sttClientRef.current = new BrowserSttClient({
      onSpeechStart: () => {
        setModality('listening');
        addEvent('stt', 'VAD speech detected (listening)');
        clearCaptionImmediate();
      },
      onInterimTranscript: (interim) => {
        setTranscriptInterim(interim);
      },
      onFinalTranscript: (final) => {
        setTranscriptFinal(final);
        setTranscriptInterim('');
        addEvent('stt', `Transcribed utterance: "${final}"`);
        void handleTurnSubmitRef.current?.({ messageText: final });
      },
      isSpeaking: () => {
        return ttsSpeakerRef.current?.speaking() ?? false;
      },
      onError: (err) => {
        if (err.code === 'not-allowed' || err.code === 'service-not-allowed') {
          isMicActiveRef.current = false;
          setIsMicActive(false);
          setModality('idle');
          addEvent('error', `Microphone permission denied: ${err.message}`);
          setSpeechAlert({
            message: 'Microphone Permission Denied',
            hint: err.hint,
          });
        } else {
          addEvent('error', `Web Speech: ${err.message}`);
        }
      },
      onEnd: () => {
        if (!isMicActiveRef.current) {
          setModality('idle');
        }
      },
    });

    // Proactively check browser microphone permission status
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          if (status.state === 'denied') {
            setSpeechAlert({
              message: 'Microphone Permission Blocked in Chrome',
              hint: 'Click the tune/lock icon in your address bar and allow Microphone.',
            });
          }
          status.onchange = () => {
            if (status.state === 'granted') {
              setSpeechAlert(null);
              addEvent('stt', 'Microphone permission granted by user');
            } else if (status.state === 'denied') {
              setSpeechAlert({
                message: 'Microphone Permission Blocked',
                hint: 'Microphone access is set to Denied in browser settings.',
              });
            }
          };
        })
        .catch(() => {});
    }

    // Check providers from server
    fetch('/api/realtime/turn')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.providers)) {
          setAvailableProviders(data.providers);
          setIsConnected(true);
          addEvent('provider', `Loaded ${data.providers.length} registered realtime provider(s)`);
        }
      })
      .catch(() => {
        setIsConnected(false);
      });

    // Fetch ElevenLabs and Preset Voices from server
    fetch('/api/tts/voices')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.voices)) {
          setAvailableVoices(data.voices);
          if (data.defaultVoiceId) {
            setSelectedVoiceId(data.defaultVoiceId);
            ttsSpeakerRef.current?.setVoiceId(data.defaultVoiceId);
            const defVoice = data.voices.find((v: any) => v.voice_id === data.defaultVoiceId);
            if (defVoice) setSelectedVoiceName(defVoice.name);
          }
          if (data.hasKey) {
            setTtsEngine('elevenlabs');
            ttsSpeakerRef.current?.setEngine('elevenlabs');
            addEvent('tts', `ElevenLabs speech engine loaded with ${data.voices.length} voices`);
          }
        }
      })
      .catch(() => {});

    // Populate native browser voices
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const getVoices = () => {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length > 0) {
          const enVoices = v.filter((x) => /^en/i.test(x.lang));
          setNativeVoices(enVoices.length > 0 ? enVoices : v);
        }
      };
      getVoices();
      window.speechSynthesis.onvoiceschanged = getVoices;
    }

    return () => {
      releaseAudioHardware();
      ttsSpeakerRef.current?.cancel();
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [addEvent, releaseAudioHardware]);

  // Start Direct Audio Recording & Energy Metering
  const startDirectAudio = async () => {
    releaseAudioHardware();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    mediaStreamRef.current = stream;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    audioContextRef.current = ctx;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const updateMeter = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
      animFrameRef.current = requestAnimationFrame(updateMeter);
    };
    updateMeter();

    audioChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/mp4';

    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const chunks = audioChunksRef.current;
      if (chunks.length === 0) return;
      const audioBlob = new Blob(chunks, { type: mimeType });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string)?.split(',')[1];
        if (base64) {
          addEvent('stt', `Captured voice recording (${Math.round(audioBlob.size / 1024)}KB)`);
          void handleTurnSubmitRef.current?.({ audioBase64: base64, audioMimeType: mimeType });
        }
      };
      reader.readAsDataURL(audioBlob);
    };

    recorder.start(250);
    mediaRecorderRef.current = recorder;

    isMicActiveRef.current = true;
    setIsMicActive(true);
    setModality('listening');
    addEvent('stt', 'Microphone armed in Direct Audio Mode');
  };

  // Toggle Microphone / Listening
  const toggleMic = async () => {
    osSound.click();
    setSpeechAlert(null);

    // If assistant is actively speaking, tapping acts as instant barge-in
    if (modality === 'speaking') {
      ttsSpeakerRef.current?.cancel();
      setModality('listening');
      addEvent('tts', 'Barge-in: Interrupted speech playback');
      return;
    }

    if (isMicActive) {
      addEvent('stt', 'Microphone disarmed');
      clearCaptionImmediate();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      sttClientRef.current?.stop();
      releaseMediaHardware();
      isMicActiveRef.current = false;
      setIsMicActive(false);
      setModality('idle');
    } else {
      try {
        clearCaptionImmediate();
        if (micMode === 'direct') {
          await startDirectAudio();
        } else {
          releaseMediaHardware();
          isMicActiveRef.current = true;
          setIsMicActive(true);
          setModality('listening');
          const ok = sttClientRef.current?.start();
          if (ok) {
            addEvent('stt', 'Listening (Web Speech continuous mode)');
          } else {
            setMicMode('direct');
            await startDirectAudio();
          }
        }
      } catch (err: any) {
        releaseAudioHardware();
        setModality('idle');

        const isDenied =
          err?.name === 'NotAllowedError' ||
          err?.name === 'PermissionDeniedError' ||
          err?.message?.toLowerCase().includes('denied') ||
          err?.message?.toLowerCase().includes('permission');

        if (isDenied) {
          setSpeechAlert({
            message: 'Microphone Permission Blocked',
            hint: 'Click the lock/tune icon in your browser address bar and set Microphone to "Allow".',
          });
        } else {
          setSpeechAlert({
            message: 'Microphone Access Failed',
            hint: err?.message || 'Check microphone hardware connection.',
          });
        }
        addEvent('error', `Microphone error: ${err?.message || err}`);
      }
    }
  };

  // Instant Barge-In / Interrupt
  const handleInterrupt = () => {
    osSound.click();
    ttsSpeakerRef.current?.cancel();
    clearCaptionImmediate();
    setModality('interrupted');
    addEvent('tts', 'Instant barge-in: Speech output stopped');
    setTimeout(() => setModality(isMicActiveRef.current ? 'listening' : 'idle'), 500);
  };

  // Toggle Camera Sensor (Vision)
  const toggleCamera = async () => {
    osSound.click();
    if (cameraActive) {
      if (videoRef.current && videoRef.current.srcObject) {
        const s = videoRef.current.srcObject as MediaStream;
        s.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      setCameraActive(false);
      setSnapshot(null);
      addEvent('camera', 'Camera released');
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCameraActive(true);
        addEvent('camera', 'Camera streaming (640x480)');
      } catch (err: any) {
        addEvent('error', `Camera error: ${err.message}`);
      }
    }
  };

  // Toggle Screen Capture Sensor (Vision)
  const toggleScreen = async () => {
    osSound.click();
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const s = videoRef.current.srcObject as MediaStream;
        s.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
        setCameraActive(false);
        setSnapshot(null);
        addEvent('camera', 'Screen capture stopped');
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
      addEvent('camera', 'Screen sharing live');
    } catch (err: any) {
      addEvent('error', `Screen share error: ${err.message}`);
    }
  };

  // Toggle Pause/Resume playback
  const togglePause = useCallback(() => {
    osSound.click();
    if (modality === 'speaking') {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.pause();
        } catch {}
      }
      isPausedRef.current = true;
      stopWordByWordSubtitle();
      setModality('paused');
      addEvent('tts', 'Speech synthesis paused (hold state)');
    } else if (modality === 'paused') {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.resume();
        } catch {}
      }
      isPausedRef.current = false;
      wordTimerRef.current = setTimeout(advanceToNextWord, 100);
      setModality('speaking');
      addEvent('tts', 'Speech synthesis resumed');
    }
  }, [modality, addEvent, stopWordByWordSubtitle, advanceToNextWord]);

  // Keyboard Shortcuts (Space to toggle, P to pause/resume, Esc to interrupt)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        void toggleMic();
      } else if (e.code === 'KeyP' && (modality === 'speaking' || modality === 'paused')) {
        e.preventDefault();
        togglePause();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (isBrowserOpen) setIsBrowserOpen(false);
        else if (isStudioOpen) setIsStudioOpen(false);
        else if (isSettingsOpen) setIsSettingsOpen(false);
        else handleInterrupt();
      } else if (e.code === 'Slash') {
        e.preventDefault();
        chatInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMicActive, modality, isStudioOpen, isSettingsOpen, isBrowserOpen, togglePause]);

  // Turn Submission
  const handleTurnSubmit = async (params: {
    messageText?: string;
    audioBase64?: string;
    audioMimeType?: string;
  }) => {
    const text = params.messageText?.trim() || '';
    if (!text && !params.audioBase64) return;

    if (text) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-user`,
          sender: 'user',
          text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        },
      ]);
    }

    setModality('thinking');
    const startTime = Date.now();
    if (text) {
      addEvent('provider', `Dispatching turn: "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`);
    } else {
      addEvent('provider', `Dispatching audio turn to '${activeProvider}'`);
    }

    try {
      const historyPayload = chatMessages.slice(-10).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const res = await fetch('/api/realtime/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text || undefined,
          audioRecording: params.audioBase64
            ? { base64Data: params.audioBase64, mimeType: params.audioMimeType || 'audio/webm' }
            : undefined,
          sessionId,
          providerId: activeProvider,
          personaId: persona,
          conversationHistory: historyPayload,
          cameraSnapshot: snapshot ? { mimeType: snapshot.mimeType, base64Data: snapshot.base64Data } : undefined,
        }),
      });

      const data = await res.json();
      const elapsed = Date.now() - startTime;
      setTurnLatencyMs(elapsed);

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Turn execution failed');
      }

      setLastReply(data.reply);
      lastReplyRef.current = data.reply;
      setLastGovernance({
        isDirective: !!data.isDirective,
        orchestrationRunId: data.orchestrationRunId,
        approvalsPending: data.approvalsPending,
        intent: data.detectedIntent,
      });

      // Record Sophia's response in chat history
      if (data.reply) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-sophia`,
            sender: 'sophia',
            text: data.reply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            latencyMs: elapsed,
            isDirective: !!data.isDirective,
            model: data.modelUsed || activeProvider,
          },
        ]);
      }

      if (data.action) {
        if (data.action.type === 'clear_screen') {
          setEvents([]);
          setHudCards([]);
          addEvent('stt', 'Diagnostics event log cleared');
        } else if (data.action.type === 'company_status') {
          addEvent('governance', `Company Status: ${data.action.pendingApprovals ?? 0} pending approvals`);
        } else if (data.action.type === 'council_directive') {
          addEvent('governance', `Council directive started: Run ${data.action.runId}`);
        } else if (data.action.type === 'web_search') {
          addEvent('provider', `Web search: ${data.action.results?.length || 0} results`);
          setHudCards((prev) => [
            {
              id: `card-${Date.now()}`,
              type: 'web_search',
              title: `Web Search: ${data.action.query}`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              searchData: {
                query: data.action.query,
                source: data.action.source || 'Live Web',
                results: data.action.results || [],
              },
            },
            ...prev.slice(0, 2),
          ]);
        } else if (data.action.type === 'generate_image') {
          addEvent('provider', `Generated image for "${data.action.prompt}"`);
          setHudCards((prev) => [
            {
              id: `card-${Date.now()}`,
              type: 'image_generator',
              title: 'Synthesized Vision',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              imageData: {
                prompt: data.action.prompt,
                imageUrl: data.action.imageUrl,
                width: data.action.width,
                height: data.action.height,
              },
            },
            ...prev.slice(0, 2),
          ]);
        } else if (data.action.type === 'open_url' || data.action.type === 'open_browser') {
          const url = data.action.url || 'https://google.com';
          addEvent('provider', `Opening In-OS Browser: ${url}`);
          setBrowserUrl(url);
          setIsBrowserOpen(true);
        } else if (data.action.type === 'close_browser') {
          addEvent('provider', 'Closing In-OS Browser');
          setIsBrowserOpen(false);
        } else if (data.action.type === 'close_panel') {
          addEvent('provider', 'Closing HUD display panels');
          setHudCards([]);
        } else if (data.action.type === 'change_persona') {
          const p = data.action.persona;
          if (p === 'friendly' || p === 'professional' || p === 'creative' || p === 'technical') {
            setPersona(p);
            addEvent('provider', `Persona updated to ${p}`);
          }
        } else if (data.action.type === 'change_voice') {
          if (data.action.voiceId) {
            setSelectedVoiceId(data.action.voiceId);
            ttsSpeakerRef.current?.setVoiceId(data.action.voiceId);
          }
          if (data.action.voiceName) {
            setSelectedVoiceName(data.action.voiceName);
          }
          addEvent('tts', `Voice changed to ${data.action.voiceName || data.action.voiceId}`);
        } else if (data.action.type === 'toggle_camera') {
          if (data.action.state === 'off') {
            if (cameraActive) void toggleCamera();
          } else if (data.action.state === 'on') {
            if (!cameraActive) void toggleCamera();
          } else {
            void toggleCamera();
          }
        } else if (data.action.type === 'toggle_screen') {
          void toggleScreen();
        } else if (data.action.type === 'ui_settings') {
          setIsSettingsOpen(!!data.action.open);
        }
      }

      if (data.isDirective) {
        addEvent('governance', `Council recommendation: ${data.reply}`, elapsed);
      } else {
        addEvent('provider', `Reply via ${data.modelUsed || activeProvider}`, elapsed);
      }

      // Speak reply aloud with boundary-synchronized speech tracking
      if (!isTtsMuted && data.reply) {
        setDisplayedReply('');
        setShowCaption(true);
        setIsTyping(true);
        lastReplyRef.current = data.reply;
        ttsSpeakerRef.current?.speakText(data.reply);

        // Fallback safety: If utterance.onstart doesn't fire within 350ms, start subtitle timer anyway
        setTimeout(() => {
          if (currentWordIndexRef.current === 0 && lastReplyRef.current === data.reply) {
            startWordByWordSubtitleRef.current(data.reply);
          }
        }, 350);
      } else {
        if (data.reply) {
          startWordByWordSubtitle(data.reply);
        }
        setModality(isMicActiveRef.current ? 'listening' : 'idle');
      }
    } catch (err: any) {
      setModality(isMicActiveRef.current ? 'listening' : 'idle');
      addEvent('error', `Turn error: ${err.message || err}`);
    }
  };

  useEffect(() => {
    handleTurnSubmitRef.current = handleTurnSubmit;
  });

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#020308] text-slate-200 select-none flex flex-col justify-between p-6 sm:p-12">
      {/* ----------------- Atmospheric Background Glows ----------------- */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
        style={{
          background:
            'radial-gradient(circle at 12% 16%, rgba(126, 34, 206, 0.16) 0%, transparent 45%), radial-gradient(circle at 88% 82%, rgba(67, 24, 150, 0.2) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.05) 0%, transparent 60%)',
        }}
      />

      {/* ----------------- Top Bar ----------------- */}
      <header className="relative z-10 flex items-center justify-between">
        {/* Brand / Logo */}
        <div>
          <div className="font-sans font-extralight tracking-[0.42em] text-white text-xl sm:text-2xl drop-shadow-[0_0_12px_rgba(255,255,255,0.2)]">
            S O P H I Λ
          </div>
          <div className="font-mono text-[9px] tracking-[0.32em] text-white/40 mt-1.5 uppercase font-medium">
            ALWAYS WITH YOU
          </div>
        </div>

        {/* Top Actions: Studio, Terminal & Settings */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              osSound.click();
              setIsStudioOpen(true);
            }}
            className="flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.03] px-3.5 py-1.5 text-xs text-white/90 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-white/40 hover:bg-white/[0.08] active:scale-95"
            title="Open Studio Diagnostics & Vision"
          >
            <LayoutGrid size={13} className="text-white/70" />
            <span className="font-light tracking-wider">Studio</span>
          </button>

          <div className="h-4 w-[1px] bg-white/10" />

          <button
            onClick={() => {
              osSound.click();
              setIsSettingsOpen(true);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-white/70 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-white/40 hover:bg-white/[0.08] hover:text-white active:scale-95"
            title="System Settings & Navigation"
          >
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* ----------------- Center Ethereal Neon Portal Ring ----------------- */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center">
        {/* Speech Alert Banner if permission issues */}
        {speechAlert && (
          <div className="mb-6 flex max-w-md items-center gap-3 rounded-full border border-amber-500/30 bg-amber-950/40 px-4 py-2 text-xs text-amber-200 backdrop-blur-md shadow-lg animate-in fade-in">
            <AlertCircle size={15} className="text-amber-400 shrink-0" />
            <span className="flex-1 text-[11px] leading-tight">{speechAlert.message} — {speechAlert.hint}</span>
            <button onClick={() => setSpeechAlert(null)} className="text-amber-400/60 hover:text-amber-200 text-xs px-1">✕</button>
          </div>
        )}

        {/* Central Luminous Ring Container */}
        <div
          onClick={toggleMic}
          className="group relative flex cursor-pointer items-center justify-center p-8 transition-transform duration-500 active:scale-95 select-none"
          title={
            modality === 'speaking'
              ? 'Click to interrupt / barge-in'
              : modality === 'paused'
              ? 'Click to resume'
              : isMicActive
              ? 'Click to stop listening'
              : 'Click to start speaking'
          }
        >
          {/* ================= ATMOSPHERIC DUAL-TONE BLOOM (MATCHING REFERENCE) ================= */}
          {/* Left Violet Atmospheric Halo */}
          <div
            className="pointer-events-none absolute rounded-full transition-all duration-700"
            style={{
              width: '180px',
              height: '180px',
              left: 'calc(50% - 100px)',
              top: 'calc(50% - 90px)',
              background:
                modality === 'thinking'
                  ? 'radial-gradient(circle, rgba(251,191,36,0.25) 0%, transparent 70%)'
                  : modality === 'paused'
                  ? 'radial-gradient(circle, rgba(245,158,11,0.2) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(168,85,247,0.42) 0%, rgba(192,132,252,0.18) 40%, transparent 70%)',
              filter: 'blur(26px)',
              transform: `scale(${modality === 'speaking' ? 1.25 : isMicActive ? 1.08 + micLevel * 0.005 : 1})`,
            }}
          />

          {/* Right Electric Cyan Atmospheric Halo */}
          <div
            className="pointer-events-none absolute rounded-full transition-all duration-700"
            style={{
              width: '180px',
              height: '180px',
              left: 'calc(50% - 80px)',
              top: 'calc(50% - 90px)',
              background:
                modality === 'thinking'
                  ? 'radial-gradient(circle, rgba(245,158,11,0.25) 0%, transparent 70%)'
                  : modality === 'paused'
                  ? 'radial-gradient(circle, rgba(56,189,248,0.2) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(6,182,212,0.48) 0%, rgba(56,189,248,0.22) 40%, transparent 70%)',
              filter: 'blur(26px)',
              transform: `scale(${modality === 'speaking' ? 1.25 : isMicActive ? 1.08 + micLevel * 0.005 : 1})`,
            }}
          />

          {/* ================= DISTINCT STATE PHYSICAL PHYSICS ================= */}

          {/* 1. LISTENING: Concentric Sonar Soundwave Ripples */}
          {modality === 'listening' && (
            <>
              <div className="sophia-sonar-ripple-1 pointer-events-none absolute rounded-full border border-cyan-400/50" />
              <div className="sophia-sonar-ripple-2 pointer-events-none absolute rounded-full border border-purple-400/40" />
              <div className="sophia-sonar-ripple-3 pointer-events-none absolute rounded-full border border-cyan-300/30" />
            </>
          )}

          {/* 2. SPEAKING: Vocal Cadence Acoustic Waves */}
          {modality === 'speaking' && (
            <>
              <div className="sophia-vocal-wave-1 pointer-events-none absolute rounded-full border border-purple-400/60" />
              <div className="sophia-vocal-wave-2 pointer-events-none absolute rounded-full border border-cyan-400/50" />
            </>
          )}

          {/* 3. THINKING: Dual Orbital Light Particles & Swirl */}
          {modality === 'thinking' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {/* Clockwise Outer Orbit */}
              <div className="sophia-orbit-ring-cw absolute h-44 w-44 rounded-full border border-dashed border-amber-400/40">
                <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_12px_#fbbf24]" />
              </div>
              {/* Counter-Clockwise Inner Orbit */}
              <div className="sophia-orbit-ring-ccw absolute h-36 w-36 rounded-full border border-dotted border-purple-400/50">
                <div className="absolute -bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_10px_#22d3ee]" />
              </div>
            </div>
          )}

          {/* ================= THE ICON RING (TRANSPARENT WITH LUMINOUS GLOW) ================= */}
          <div
            className={`relative flex h-32 w-32 sm:h-36 sm:w-36 items-center justify-center rounded-full bg-transparent ${
              modality === 'idle' ? 'sophia-breath-anim' : ''
            }`}
            style={{
              transform:
                modality === 'listening'
                  ? `scale(${1.03 + (micLevel / 100) * 0.22})`
                  : modality === 'speaking'
                  ? `scale(${1.02 + voicePulse * 0.12})`
                  : undefined,
              transition:
                modality === 'speaking'
                  ? 'transform 120ms cubic-bezier(0.1, 0.9, 0.2, 1)'
                  : 'transform 300ms ease-out',
            }}
          >
            {/* Luminous Inner Glow Diffusion (Transparent, NOT black) */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full transition-all duration-300"
              style={{
                background:
                  modality === 'thinking'
                    ? 'radial-gradient(circle, rgba(251,191,36,0.2) 0%, rgba(245,158,11,0.1) 50%, transparent 75%)'
                    : modality === 'paused'
                    ? 'radial-gradient(circle, rgba(245,158,11,0.18) 0%, transparent 70%)'
                    : modality === 'speaking'
                    ? `radial-gradient(circle, rgba(192,132,252,${0.25 + voicePulse * 0.15}) 0%, rgba(56,189,248,${0.2 + voicePulse * 0.15}) 50%, transparent 75%)`
                    : isMicActive
                    ? 'radial-gradient(circle, rgba(168,85,247,0.25) 0%, rgba(6,182,212,0.2) 50%, transparent 75%)'
                    : 'radial-gradient(circle, rgba(168,85,247,0.16) 0%, rgba(56,189,248,0.14) 50%, transparent 75%)',
                boxShadow:
                  modality === 'speaking'
                    ? voicePulse > 0.4
                      ? 'inset 0 0 32px rgba(192,132,252,0.85), inset 0 0 45px rgba(56,189,248,0.75)'
                      : 'inset 0 0 20px rgba(192,132,252,0.5), inset 0 0 28px rgba(56,189,248,0.4)'
                    : modality === 'thinking'
                    ? 'inset 0 0 20px rgba(251,191,36,0.5), inset 0 0 30px rgba(245,158,11,0.4)'
                    : modality === 'paused'
                    ? 'inset 0 0 16px rgba(245,158,11,0.4)'
                    : isMicActive
                    ? 'inset 0 0 25px rgba(168,85,247,0.55), inset 0 0 35px rgba(6,182,212,0.5)'
                    : 'inset 0 0 18px rgba(168,85,247,0.35), inset 0 0 24px rgba(56,189,248,0.35)',
              }}
            />

            {/* Razor-Sharp High-Luminance SVG Neon Gradient Rim (fill=none) */}
            <svg
              className="absolute inset-0 h-full w-full pointer-events-none transition-all duration-150"
              viewBox="0 0 144 144"
              style={{
                filter:
                  modality === 'speaking'
                    ? voicePulse > 0.4
                      ? 'drop-shadow(-8px 0 22px rgba(192,132,252,1)) drop-shadow(8px 0 24px rgba(56,189,248,1))'
                      : 'drop-shadow(-5px 0 14px rgba(192,132,252,0.75)) drop-shadow(5px 0 16px rgba(56,189,248,0.75))'
                    : modality === 'thinking'
                    ? 'drop-shadow(0 0 16px rgba(251,191,36,0.9)) drop-shadow(0 0 28px rgba(245,158,11,0.6))'
                    : modality === 'paused'
                    ? 'drop-shadow(0 0 12px rgba(245,158,11,0.7))'
                    : isMicActive
                    ? 'drop-shadow(-6px 0 16px rgba(168,85,247,0.95)) drop-shadow(6px 0 18px rgba(6,182,212,0.95))'
                    : 'drop-shadow(-5px 0 14px rgba(168,85,247,0.85)) drop-shadow(5px 0 16px rgba(56,189,248,0.85))',
              }}
            >
              <defs>
                <linearGradient id="sophiaNeonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  {modality === 'thinking' ? (
                    <>
                      <stop offset="0%" stopColor="#fbbf24" />
                      <stop offset="50%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#d97706" />
                    </>
                  ) : modality === 'paused' ? (
                    <>
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="50%" stopColor="#fbbf24" />
                      <stop offset="100%" stopColor="#d97706" />
                    </>
                  ) : (
                    <>
                      <stop offset="0%" stopColor="#c084fc" />
                      <stop offset="35%" stopColor="#ec4899" />
                      <stop offset="65%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </>
                  )}
                </linearGradient>
              </defs>

              {/* High-Luminance Neon Circle Rim */}
              <circle
                cx="72"
                cy="72"
                r="67.5"
                fill="none"
                stroke="url(#sophiaNeonGrad)"
                strokeWidth="2.5"
                className="transition-all duration-500"
              />
            </svg>

            {/* Transparent Center Interactive Core */}
            <div className="relative z-10 flex h-full w-full items-center justify-center rounded-full bg-transparent">
              {modality === 'thinking' ? (
                <RefreshCw size={20} className="text-amber-300 animate-spin opacity-90 drop-shadow-[0_0_8px_#fbbf24]" />
              ) : modality === 'paused' ? (
                /* Paused: Dual Glowing Bars */
                <div className="flex items-center gap-1.5 animate-in fade-in duration-300">
                  <div className="h-4 w-1 rounded-full bg-amber-400/90 shadow-[0_0_8px_#fbbf24]" />
                  <div className="h-4 w-1 rounded-full bg-amber-400/90 shadow-[0_0_8px_#fbbf24]" />
                </div>
              ) : modality === 'speaking' ? (
                /* Speaking: Vocal Cadence Core Orb pulsing directly with voicePulse */
                <div
                  className="h-3.5 w-3.5 rounded-full bg-gradient-to-r from-purple-400 to-cyan-400 shadow-[0_0_16px_#c084fc] transition-transform duration-100"
                  style={{ transform: `scale(${1 + voicePulse * 0.7})` }}
                />
              ) : isMicActive ? (
                /* Listening: Audio-Reactive Iris Orb */
                <div
                  className="h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_14px_#22d3ee] transition-all duration-100"
                  style={{ transform: `scale(${1 + (micLevel / 100) * 1.8})` }}
                />
              ) : (
                /* Standby: Serene Pinpoint */
                <div className="h-2 w-2 rounded-full bg-white/30 transition-all duration-300 group-hover:scale-125 group-hover:bg-cyan-300" />
              )}
            </div>
          </div>
        </div>

        {/* ----------------- Subtitle / Dynamic Transcripts & Streamed Replies ----------------- */}
        <div className="mt-8 flex flex-col items-center justify-center text-center px-4 max-w-xl min-h-[64px]">
          {transcriptInterim ? (
            <div className="animate-in fade-in duration-200">
              <p className="text-sm sm:text-base font-light italic text-cyan-300 tracking-wide">
                &quot;{transcriptInterim}&quot;
              </p>
              <span className="mt-1.5 inline-block text-[10px] font-mono tracking-widest text-cyan-400/60 uppercase">
                LISTENING...
              </span>
            </div>
          ) : showCaption && displayedReply ? (
            <div className={`transition-opacity duration-700 ${showCaption ? 'opacity-100' : 'opacity-0'}`}>
              <p className="text-sm sm:text-base text-slate-100 font-light leading-relaxed tracking-wide drop-shadow-md">
                {displayedReply}
                {isTyping && (
                  <span className="inline-block w-1.5 h-4 ml-1.5 bg-cyan-400 align-middle sophia-cursor-anim shadow-[0_0_8px_#22d3ee]" />
                )}
              </p>
              {lastGovernance?.isDirective && (
                <span className="mt-2.5 inline-block rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-0.5 text-[10px] font-mono text-cyan-300 tracking-wider">
                  EXECUTIVE COUNCIL DISPATCHED
                </span>
              )}
            </div>
          ) : (
            <div className="tracking-[0.45em] text-[10.5px] sm:text-[11.5px] text-white/40 font-light uppercase transition-all duration-700">
              {isMicActive ? 'I AM LISTENING. SPEAK FREELY.' : 'TAP. SPEAK. OR JUST BE HERE.'}
            </div>
          )}
        </div>

        {/* ----------------- Active Visual HUD Cards (Web Search / AI Images) ----------------- */}
        {hudCards.length > 0 && (
          <div className="mt-4 flex flex-col items-center gap-3 w-full max-w-xl z-20">
            {hudCards.map((card) => (
              <HudPanelCard
                key={card.id}
                card={card}
                onClose={() => setHudCards((prev) => prev.filter((c) => c.id !== card.id))}
                onOpenUrl={(url) => {
                  setBrowserUrl(url);
                  setIsBrowserOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* ----------------- Bottom Controls & Persistent Chat Bar ----------------- */}
      <footer className="relative z-20 flex flex-col gap-3 w-full max-w-3xl mx-auto pt-2">
        {/* Permanent Glassmorphism Chat & Directive Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const val = bottomChatInput.trim();
            if (!val) return;
            setBottomChatInput('');
            void handleTurnSubmit({ messageText: val });
          }}
          className="flex items-center gap-2 rounded-2xl border border-white/15 bg-[#060814]/90 px-3.5 py-2 shadow-[0_0_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl transition-all focus-within:border-cyan-400/80 focus-within:shadow-[0_0_25px_rgba(6,182,212,0.3)]"
        >
          {/* Persona Selector Dropdown */}
          <div className="relative flex items-center shrink-0">
            <select
              value={persona}
              onChange={(e) => setPersona(e.target.value as any)}
              className="appearance-none bg-white/5 border border-white/10 rounded-xl px-2.5 py-1 text-[11px] font-mono text-cyan-300 hover:bg-white/10 focus:outline-none cursor-pointer pr-5 tracking-wider uppercase transition-colors"
              title="Select Persona"
            >
              <option value="friendly" className="bg-[#0b0e20] text-cyan-300">✨ Friendly</option>
              <option value="professional" className="bg-[#0b0e20] text-amber-300">👔 Professional</option>
              <option value="creative" className="bg-[#0b0e20] text-purple-300">🎨 Creative</option>
              <option value="technical" className="bg-[#0b0e20] text-emerald-300">⚡ Technical</option>
            </select>
            <div className="pointer-events-none absolute right-1.5 text-[8px] text-white/40">▼</div>
          </div>

          {/* Main Chat Input Field */}
          <input
            ref={chatInputRef}
            type="text"
            value={bottomChatInput}
            onChange={(e) => setBottomChatInput(e.target.value)}
            placeholder="Ask Sophia anything, search web, generate images, or enter directives..."
            className="flex-1 bg-transparent text-xs text-white placeholder:text-white/35 focus:outline-none font-light tracking-wide px-1.5"
          />

          {/* Quick Capability Chips */}
          <button
            type="button"
            onClick={() => {
              setBottomChatInput('/search ');
              chatInputRef.current?.focus();
            }}
            className="hidden sm:flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-mono text-white/60 hover:text-cyan-300 hover:border-cyan-400/40 hover:bg-cyan-500/10 transition-all"
            title="Live Web Search"
          >
            <Globe size={11} />
            <span>Search</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setBottomChatInput('/image ');
              chatInputRef.current?.focus();
            }}
            className="hidden sm:flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-mono text-white/60 hover:text-purple-300 hover:border-purple-400/40 hover:bg-purple-500/10 transition-all"
            title="Generate AI Image"
          >
            <ImageIcon size={11} />
            <span>Draw</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsBrowserOpen(true);
            }}
            className="hidden md:flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-mono text-white/60 hover:text-emerald-300 hover:border-emerald-400/40 hover:bg-emerald-500/10 transition-all"
            title="Open In-OS Browser"
          >
            <ExternalLink size={11} />
            <span>Browser</span>
          </button>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!bottomChatInput.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-md hover:from-purple-400 hover:to-cyan-400 disabled:opacity-25 disabled:cursor-not-allowed transition-all active:scale-95"
            title="Send message"
          >
            <ArrowUp size={14} />
          </button>
        </form>

        {/* Secondary Status & Branding Bar */}
        <div className="flex items-center justify-between text-xs px-2">
          {/* Status Pill (Bottom Left) */}
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#060814]/80 px-4 py-1.5 text-xs text-white/80 shadow-md backdrop-blur-xl transition-all duration-300">
            <span
              className={`h-2 w-2 rounded-full transition-all duration-300 ${
                modality === 'speaking'
                  ? 'bg-purple-400 shadow-[0_0_10px_#c084fc] animate-pulse'
                  : modality === 'thinking'
                  ? 'bg-amber-400 shadow-[0_0_10px_#fbbf24] animate-spin'
                  : modality === 'paused'
                  ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                  : isMicActive
                  ? 'bg-emerald-400 shadow-[0_0_12px_#34d399] animate-pulse'
                  : 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
              }`}
            />
            <span className="font-light tracking-wide text-slate-200">
              {modality === 'paused'
                ? 'Paused'
                : isMicActive
                ? modality === 'speaking'
                  ? 'Speaking'
                  : modality === 'thinking'
                  ? 'Thinking'
                  : 'Listening'
                : 'Ready'}
            </span>
            <span className="text-white/20 font-light">|</span>
            <span className="text-[11px] text-white/40 font-light hidden sm:inline">
              {modality === 'paused'
                ? 'Playback suspended (Press P to resume)'
                : isMicActive
                ? 'Listening for you...'
                : 'Tap ring, press Space, or type'}
            </span>
          </div>

          {/* Brand Monogram (Bottom Right) */}
          <div className="text-right">
            <div className="font-mono text-[9.5px] tracking-[0.35em] text-white/40 uppercase">
              SAMJUNIORS // OS
            </div>
          </div>
        </div>
      </footer>

      {/* ----------------- Embedded Dynamic Keyframes & Physical Physics ----------------- */}
      <style>{`
        @keyframes sophia-breath {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.025);
          }
        }
        .sophia-breath-anim {
          animation: sophia-breath 4s ease-in-out infinite;
        }

        @keyframes sophia-speak-pulse {
          0%, 100% {
            transform: scale(1.02);
            filter: drop-shadow(0 0 25px rgba(192, 132, 252, 0.75)) drop-shadow(0 0 50px rgba(6, 182, 212, 0.6));
          }
          50% {
            transform: scale(1.10);
            filter: drop-shadow(0 0 45px rgba(192, 132, 252, 1)) drop-shadow(0 0 85px rgba(56, 189, 248, 0.85));
          }
        }
        .sophia-speak-pulse-anim {
          animation: sophia-speak-pulse 1.15s ease-in-out infinite;
        }

        @keyframes sophia-core-voice {
          0%, 100% {
            transform: scale(1);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.4);
            opacity: 1;
          }
        }
        .sophia-core-voice-anim {
          animation: sophia-core-voice 0.6s ease-in-out infinite;
        }

        @keyframes sophia-sonar-ripple {
          0% {
            width: 140px;
            height: 140px;
            opacity: 0.8;
            transform: scale(1);
          }
          100% {
            width: 140px;
            height: 140px;
            opacity: 0;
            transform: scale(2.2);
          }
        }
        .sophia-sonar-ripple-1 {
          animation: sophia-sonar-ripple 2s cubic-bezier(0.1, 0.7, 0.1, 1) infinite;
        }
        .sophia-sonar-ripple-2 {
          animation: sophia-sonar-ripple 2s cubic-bezier(0.1, 0.7, 0.1, 1) infinite 0.65s;
        }
        .sophia-sonar-ripple-3 {
          animation: sophia-sonar-ripple 2s cubic-bezier(0.1, 0.7, 0.1, 1) infinite 1.3s;
        }

        @keyframes sophia-vocal-wave {
          0% {
            width: 140px;
            height: 140px;
            opacity: 0.85;
            transform: scale(1);
          }
          100% {
            width: 140px;
            height: 140px;
            opacity: 0;
            transform: scale(2.4);
          }
        }
        .sophia-vocal-wave-1 {
          animation: sophia-vocal-wave 1.2s ease-out infinite;
        }
        .sophia-vocal-wave-2 {
          animation: sophia-vocal-wave 1.2s ease-out infinite 0.6s;
        }

        @keyframes sophia-orbit-cw {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .sophia-orbit-ring-cw {
          animation: sophia-orbit-cw 2.4s linear infinite;
        }

        @keyframes sophia-orbit-ccw {
          0% { transform: rotate(360deg); }
          100% { transform: rotate(0deg); }
        }
        .sophia-orbit-ring-ccw {
          animation: sophia-orbit-ccw 3.6s linear infinite;
        }

        @keyframes sophia-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .sophia-cursor-anim {
          animation: sophia-cursor-blink 0.75s infinite;
        }
      `}</style>

      {/* ----------------- Slide-Out Studio Drawer ----------------- */}
      {isStudioOpen && (
        <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsStudioOpen(false)}
          />

          {/* Drawer Body */}
          <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#030611]/95 p-6 text-slate-200 shadow-2xl backdrop-blur-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <LayoutGrid size={15} className="text-cyan-400" />
                <h2 className="font-mono text-xs uppercase tracking-widest text-white">
                  Studio Diagnostics & Vision
                </h2>
              </div>
              <button
                onClick={() => setIsStudioOpen(false)}
                className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 space-y-6 overflow-y-auto py-4">
              {/* Audio Controls */}
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-3 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                  Audio & Voice Channel
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={toggleMic}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition ${
                      isMicActive
                        ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-200'
                        : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {isMicActive ? <Mic size={14} className="animate-pulse text-cyan-300" /> : <MicOff size={14} />}
                    <span>{isMicActive ? 'Stop Listening' : 'Start Listening'}</span>
                  </button>

                  <button
                    onClick={() => {
                      osSound.click();
                      ttsSpeakerRef.current?.speakText(
                        'Sophia realtime audio output is online and verified.'
                      );
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-500/20"
                  >
                    <Play size={12} />
                    <span>Test Voice</span>
                  </button>

                  <button
                    onClick={() => {
                      osSound.click();
                      setIsTtsMuted((v) => !v);
                      if (!isTtsMuted) ttsSpeakerRef.current?.cancel();
                    }}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${
                      isTtsMuted
                        ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                        : 'border-white/10 bg-white/5 text-slate-300'
                    }`}
                  >
                    {isTtsMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    <span>{isTtsMuted ? 'Muted' : 'Sound On'}</span>
                  </button>
                </div>

                {/* Mode Selector */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-mono">ENGINE:</span>
                  <button
                    onClick={() => setMicMode('webspeech')}
                    className={`rounded px-2 py-0.5 text-[10px] font-mono transition ${
                      micMode === 'webspeech' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40' : 'text-slate-400'
                    }`}
                  >
                    Web Speech (Continuous)
                  </button>
                  <button
                    onClick={() => setMicMode('direct')}
                    className={`rounded px-2 py-0.5 text-[10px] font-mono transition ${
                      micMode === 'direct' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40' : 'text-slate-400'
                    }`}
                  >
                    Direct Audio
                  </button>
                </div>
              </div>

              {/* Vision / Camera Preview */}
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    Sensory Vision (Camera)
                  </span>
                  <button
                    onClick={async () => {
                      osSound.click();
                      if (cameraActive) {
                        if (videoRef.current && videoRef.current.srcObject) {
                          const s = videoRef.current.srcObject as MediaStream;
                          s.getTracks().forEach((t) => t.stop());
                          videoRef.current.srcObject = null;
                        }
                        setCameraActive(false);
                        setSnapshot(null);
                        addEvent('camera', 'Camera released');
                      } else {
                        try {
                          const stream = await navigator.mediaDevices.getUserMedia({
                            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                            audio: false,
                          });
                          if (videoRef.current) {
                            videoRef.current.srcObject = stream;
                            videoRef.current.play().catch(() => {});
                          }
                          setCameraActive(true);
                          addEvent('camera', 'Camera streaming (640x480)');
                        } catch (err: any) {
                          addEvent('error', `Camera error: ${err.message}`);
                        }
                      }
                    }}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
                      cameraActive
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Camera size={13} />
                    <span>{cameraActive ? 'Disarm' : 'Arm Camera'}</span>
                  </button>
                </div>

                <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black/60 flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`h-full w-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                  />
                  {!cameraActive && (
                    <div className="flex flex-col items-center gap-1 text-slate-400 text-xs">
                      <Camera size={22} className="opacity-40" />
                      <span>Camera Disarmed</span>
                    </div>
                  )}
                </div>

                {cameraActive && (
                  <button
                    onClick={() => {
                      osSound.click();
                      const shot = grabCameraSnapshot(videoRef.current || undefined);
                      if (shot) {
                        setSnapshot(shot);
                        addEvent('camera', `Captured still frame (${shot.width}x${shot.height})`);
                      }
                    }}
                    className="mt-2.5 w-full rounded-lg border border-cyan-500/30 bg-cyan-500/10 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20"
                  >
                    Capture Sample Still for Turn
                  </button>
                )}
              </div>

              {/* Text Query Input */}
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-2 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                  Text Input Dispatch
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!textInput.trim()) return;
                    void handleTurnSubmit({ messageText: textInput });
                    setTextInput('');
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Enter directive or ask Sophia..."
                    className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!textInput.trim()}
                    className="rounded-lg border border-cyan-500/30 bg-cyan-500/20 p-2 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
                  >
                    <ArrowRight size={13} />
                  </button>
                </form>
              </div>

              {/* Diagnostic Event Stream */}
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    Telemetry Stream ({events.length})
                  </span>
                  <button
                    onClick={() => setEvents([])}
                    className="text-[10px] font-mono text-slate-400 hover:text-slate-200"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-1.5 font-mono text-[10.5px]">
                  {events.length === 0 ? (
                    <div className="py-4 text-center text-slate-400">No events logged</div>
                  ) : (
                    events.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-start gap-2 border-b border-white/[0.03] pb-1"
                      >
                        <span className="text-slate-400">{ev.timestamp}</span>
                        <span
                          className={`uppercase text-[9.5px] px-1 rounded ${
                            ev.type === 'error'
                              ? 'bg-rose-500/20 text-rose-300'
                              : ev.type === 'governance'
                              ? 'bg-amber-500/20 text-amber-300'
                              : ev.type === 'stt'
                              ? 'bg-cyan-500/20 text-cyan-300'
                              : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          {ev.type}
                        </span>
                        <span className="text-slate-300 flex-1 truncate">{ev.detail}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- Settings / Navigation Modal ----------------- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={() => setIsSettingsOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#050814]/95 p-6 shadow-2xl backdrop-blur-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Settings size={15} className="text-cyan-400" />
                <h3 className="font-mono text-xs uppercase tracking-widest text-white">System & Voice Configuration</h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-white/60 hover:text-white transition"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-5 space-y-5 text-xs">
              {/* 1. Conversational Persona Selector */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">Conversational Persona</span>
                  <span className="font-mono text-[9.5px] text-cyan-400">Current: {persona}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['friendly', 'professional', 'creative', 'technical'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        osSound.click();
                        setPersona(p);
                        addEvent('provider', `Persona switched to ${p}`);
                      }}
                      className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                        persona === p
                          ? 'border-cyan-500/60 bg-cyan-500/15 text-white shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="font-semibold capitalize text-xs">{p}</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {p === 'friendly' && 'Warm, empathetic & partner'}
                        {p === 'professional' && 'Executive COO & KPI-driven'}
                        {p === 'creative' && 'Visionary & brainstorm partner'}
                        {p === 'technical' && 'Systems architect & rigorous'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Speech Synthesis Engine & Voice Selection */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">Speech Engine (Mouth)</span>
                  <div className="flex rounded-lg border border-white/10 bg-black/40 p-0.5">
                    <button
                      onClick={() => {
                        osSound.click();
                        setTtsEngine('elevenlabs');
                        ttsSpeakerRef.current?.setEngine('elevenlabs');
                      }}
                      className={`px-2.5 py-1 rounded-md text-[10.5px] transition ${
                        ttsEngine === 'elevenlabs'
                          ? 'bg-cyan-500/30 text-cyan-200 font-medium'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      ElevenLabs
                    </button>
                    <button
                      onClick={() => {
                        osSound.click();
                        setTtsEngine('system');
                        ttsSpeakerRef.current?.setEngine('system');
                      }}
                      className={`px-2.5 py-1 rounded-md text-[10.5px] transition ${
                        ttsEngine === 'system'
                          ? 'bg-cyan-500/30 text-cyan-200 font-medium'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Browser
                    </button>
                  </div>
                </div>

                {ttsEngine === 'elevenlabs' ? (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Select ElevenLabs Voice</label>
                      <select
                        value={selectedVoiceId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedVoiceId(id);
                          ttsSpeakerRef.current?.setVoiceId(id);
                          const found = availableVoices.find((v) => v.voice_id === id);
                          if (found) setSelectedVoiceName(found.name);
                          addEvent('tts', `Active ElevenLabs voice set to ${found?.name || id}`);
                        }}
                        className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                      >
                        {availableVoices.map((v) => (
                          <option key={v.voice_id} value={v.voice_id} className="bg-slate-900 text-slate-200">
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Custom Voice ID (Optional)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. bMxLr8fP6hzNRRi9nJxU"
                          value={customVoiceId}
                          onChange={(e) => setCustomVoiceId(e.target.value)}
                          className="flex-1 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-cyan-400 focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            if (!customVoiceId.trim()) return;
                            osSound.click();
                            setSelectedVoiceId(customVoiceId.trim());
                            setSelectedVoiceName(`Custom (${customVoiceId.trim().slice(0, 8)}...)`);
                            ttsSpeakerRef.current?.setVoiceId(customVoiceId.trim());
                            addEvent('tts', `Custom Voice ID applied: ${customVoiceId.trim()}`);
                          }}
                          disabled={!customVoiceId.trim()}
                          className="rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-30"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Select Installed Browser Voice</label>
                    <select
                      value={selectedNativeVoiceName}
                      onChange={(e) => {
                        const name = e.target.value;
                        setSelectedNativeVoiceName(name);
                        ttsSpeakerRef.current?.setNativeVoiceByName(name);
                        addEvent('tts', `Browser voice set to ${name}`);
                      }}
                      className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                    >
                      {nativeVoices.map((v) => (
                        <option key={v.name} value={v.name} className="bg-slate-900 text-slate-200">
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  onClick={() => {
                    osSound.click();
                    ttsSpeakerRef.current?.speakText('Sophia speech synthesis active and calibrated, sir.');
                  }}
                  className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-cyan-500/30 bg-cyan-500/10 py-2 text-xs text-cyan-200 hover:bg-cyan-500/20 transition"
                >
                  <Play size={12} />
                  <span>Test Voice Audio Output</span>
                </button>
              </div>

              {/* 3. Audio Input Channel Mode (Ears) */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">Microphone Channel (Ears)</span>
                  <div className="flex rounded-lg border border-white/10 bg-black/40 p-0.5">
                    <button
                      onClick={() => setMicMode('webspeech')}
                      className={`px-2.5 py-1 rounded-md text-[10.5px] transition ${
                        micMode === 'webspeech'
                          ? 'bg-cyan-500/30 text-cyan-200 font-medium'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Web Speech (Auto)
                    </button>
                    <button
                      onClick={() => setMicMode('direct')}
                      className={`px-2.5 py-1 rounded-md text-[10.5px] transition ${
                        micMode === 'direct'
                          ? 'bg-cyan-500/30 text-cyan-200 font-medium'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Direct Audio
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 leading-relaxed">
                  {micMode === 'webspeech'
                    ? 'Continuous browser speech recognition with real-time word detection.'
                    : 'Raw high-fidelity audio recorder with neural server-side transcription.'}
                </div>
              </div>

              {/* 4. OS Desktop Return & Shortcuts */}
              {onBackToOs && (
                <button
                  onClick={() => {
                    osSound.click();
                    setIsSettingsOpen(false);
                    onBackToOs();
                  }}
                  className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 text-center font-medium text-slate-200 hover:bg-white/10 hover:text-white transition"
                >
                  Return to SamJuniorsOS Desktop
                </button>
              )}

              <div className="rounded-xl border border-white/5 bg-black/40 p-3 space-y-1.5">
                <div className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">Voice & Keyboard Hotkeys</div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Toggle Microphone</span>
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9.5px]">Space</kbd>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Focus Chat Bar</span>
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9.5px]">/</kbd>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Interrupt Speech (Barge-in)</span>
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9.5px]">Esc</kbd>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Pause / Resume Speech</span>
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9.5px]">P</kbd>
                </div>
              </div>

              <div className="text-center font-mono text-[9.5px] text-slate-500">
                Session: {sessionId}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- Slide-Out Conversation Terminal Drawer ----------------- */}
      {isTerminalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsTerminalOpen(false)}
          />

          {/* Drawer Body */}
          <div className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-[#030612]/95 text-slate-200 shadow-2xl backdrop-blur-2xl">
            {/* Terminal Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                  <Terminal size={14} />
                </div>
                <div>
                  <h2 className="font-mono text-xs uppercase tracking-widest text-white flex items-center gap-2">
                    Dialogue Terminal
                    <span className="rounded-full bg-cyan-500/20 text-cyan-300 px-2 py-0.5 text-[9px] font-mono border border-cyan-500/30">
                      {chatMessages.length} Turns
                    </span>
                  </h2>
                  <div className="font-mono text-[9.5px] text-white/40 tracking-wider">
                    sophia@samjuniorsOS:~/dialogue
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {chatMessages.length > 0 && (
                  <>
                    <button
                      onClick={() => {
                        const transcript = chatMessages
                          .map((m) => `[${m.timestamp}] ${m.sender.toUpperCase()}: ${m.text}`)
                          .join('\n\n');
                        navigator.clipboard.writeText(transcript);
                        addEvent('governance', 'Copied full dialogue transcript to clipboard');
                      }}
                      className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-mono text-white/70 hover:bg-white/10 hover:text-white transition"
                      title="Copy full transcript to clipboard"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        setChatMessages([]);
                        addEvent('governance', 'Cleared dialogue terminal history');
                      }}
                      className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-mono text-white/70 hover:bg-rose-500/20 hover:text-rose-300 transition"
                      title="Clear terminal history"
                    >
                      Clear
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsTerminalOpen(false)}
                  className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Terminal Dialogue Feed */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 font-mono text-xs">
              {chatMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-white/40 py-16">
                  <Terminal size={36} className="text-white/20 mb-3" />
                  <p className="text-xs font-mono">No conversation dialogue logged yet.</p>
                  <p className="text-[10px] text-white/30 mt-1">
                    Speak into the mic or submit a directive below to begin.
                  </p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-4 border transition-all ${
                      msg.sender === 'user'
                        ? 'border-cyan-500/25 bg-cyan-950/20 text-cyan-100 shadow-[0_0_15px_rgba(6,182,212,0.05)]'
                        : 'border-purple-500/25 bg-purple-950/20 text-slate-200 shadow-[0_0_15px_rgba(168,85,247,0.05)]'
                    }`}
                  >
                    {/* Message Header */}
                    <div className="flex items-center justify-between mb-2 text-[10px]">
                      <span
                        className={`font-semibold tracking-wider ${
                          msg.sender === 'user' ? 'text-cyan-400' : 'text-purple-400'
                        }`}
                      >
                        {msg.sender === 'user' ? '❯ FOUNDER DIRECTIVE' : '❯ SOPHIA RESPONSE'}
                      </span>
                      <div className="flex items-center gap-2 text-white/40">
                        {msg.model && (
                          <span className="text-[9px] text-white/40 border border-white/10 rounded px-1.5 py-0.5">
                            {msg.model}
                          </span>
                        )}
                        {msg.latencyMs && (
                          <span className="text-[9px] text-cyan-400/70">
                            {msg.latencyMs}ms
                          </span>
                        )}
                        <span>{msg.timestamp}</span>
                      </div>
                    </div>

                    {/* Message Content */}
                    <div className="font-sans text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-light">
                      {msg.text}
                    </div>

                    {msg.isDirective && (
                      <div className="mt-2.5 flex items-center gap-1.5 text-[9.5px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-md px-2.5 py-1 w-fit shadow-[0_0_8px_rgba(6,182,212,0.15)]">
                        <Sparkles size={11} className="text-cyan-400" />
                        EXECUTIVE COUNCIL DISPATCHED
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Terminal Quick Command Input */}
            <div className="border-t border-white/10 p-4 bg-white/[0.01]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!textInput.trim()) return;
                  const t = textInput.trim();
                  setTextInput('');
                  void handleTurnSubmit({ messageText: t });
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-cyan-400">
                    ❯
                  </span>
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Enter directive or ask Sophia..."
                    className="w-full rounded-lg border border-white/10 bg-white/5 pl-7 pr-3 py-2 text-xs font-mono text-white placeholder-white/30 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!textInput.trim()}
                  className="rounded-lg bg-cyan-500/20 border border-cyan-500/30 px-3.5 py-2 text-cyan-300 transition hover:bg-cyan-500/30 disabled:opacity-40 flex items-center gap-1"
                >
                  <Send size={13} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- In-OS Web Browser Window ----------------- */}
      <InOsBrowserModal
        isOpen={isBrowserOpen}
        initialUrl={browserUrl}
        onClose={() => setIsBrowserOpen(false)}
      />
    </div>
  );
}
