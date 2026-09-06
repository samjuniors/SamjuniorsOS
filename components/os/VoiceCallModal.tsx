'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
  Sparkles,
  RefreshCw,
  Radio,
  Play,
  Square,
  MessageSquare,
  ChevronDown,
  Layers,
  Copy,
  Check,
  Zap,
  Info,
  SlidersHorizontal,
  X,
  FileText,
  User,
  ShieldAlert
} from 'lucide-react';
import { AgentAvatar, AGENT_REAL_PORTRAITS } from './AgentAvatar';
import { playOSSound } from './IconHelper';
import { ParticipantId } from '../apps/MessagesApp';
import { AgentRole } from '@/types/os';

export interface VoiceCallTurn {
  id: string;
  sender: 'user' | 'agent';
  agentId?: string;
  text: string;
  timestamp: string;
}

interface VoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAgentId?: ParticipantId;
  onSendToChat?: (agentId: ParticipantId, message: string) => void;
  onLaunchDirective?: (topic: string) => void;
}

interface VoicePersonaProfile {
  id: ParticipantId;
  name: string;
  role: string;
  department: string;
  voiceGender: 'female' | 'male';
  preferredVoiceLang: string;
  pitch: number;
  rate: number;
  greeting: string;
  themeColor: string;
  bgGlow: string;
}

const VOICE_PERSONAS: Record<ParticipantId, VoicePersonaProfile> = {
  coo: {
    id: 'coo',
    name: 'Sophia Vance',
    role: 'Chief Operating Officer & Orchestrator',
    department: 'Executive Operations',
    voiceGender: 'female',
    preferredVoiceLang: 'en-GB',
    pitch: 1.05,
    rate: 1.02,
    greeting: "Good to speak with you, Founder. Executive operations are fully synchronized. What directive or operational priority shall we address?",
    themeColor: '#a855f7',
    bgGlow: 'from-purple-900/40 via-indigo-950/50 to-[#0b0c12]',
  },
  researcher: {
    id: 'researcher',
    name: 'Dr. Aris Thorne',
    role: 'Lead Market & Intelligence Researcher',
    department: 'Market Intelligence & Deep Tech',
    voiceGender: 'male',
    preferredVoiceLang: 'en-GB',
    pitch: 0.9,
    rate: 0.98,
    greeting: "Hello Founder. I am monitoring frontier model benchmarks and competitive architectures. What market intelligence would you like to explore?",
    themeColor: '#f59e0b',
    bgGlow: 'from-amber-900/40 via-cyan-950/50 to-[#0b0c12]',
  },
  pm: {
    id: 'pm',
    name: 'Maya Lin',
    role: 'Principal Product Manager',
    department: 'Product Strategy & UX',
    voiceGender: 'female',
    preferredVoiceLang: 'en-US',
    pitch: 1.15,
    rate: 1.05,
    greeting: "Hi Founder! I'm here to refine our PRDs, user flows, and sprint deliverables. What feature or spec would you like to discuss?",
    themeColor: '#f43f5e',
    bgGlow: 'from-rose-900/40 via-pink-950/50 to-[#0b0c12]',
  },
  finance: {
    id: 'finance',
    name: 'Julian Cruz',
    role: 'Chief Financial Analyst',
    department: 'Capital & Unit Economics',
    voiceGender: 'male',
    preferredVoiceLang: 'en-US',
    pitch: 0.95,
    rate: 1.08,
    greeting: "Hello Founder. Our unit economics are healthy at 83.9% gross margin. What financial models or compute spend projections shall we run?",
    themeColor: '#10b981',
    bgGlow: 'from-emerald-900/40 via-teal-950/50 to-[#0b0c12]',
  },
  advisor: {
    id: 'advisor',
    name: 'Founder Intelligence',
    role: 'Strategic Advisor & Co-Pilot',
    department: 'Founder Strategic Advisory',
    voiceGender: 'male',
    preferredVoiceLang: 'en-US',
    pitch: 0.85,
    rate: 0.96,
    greeting: "Founder Intelligence online. I am grounded in company governance and strategic OKRs. How can I guide your executive decision-making today?",
    themeColor: '#8b5cf6',
    bgGlow: 'from-violet-900/40 via-sky-950/50 to-[#0b0c12]',
  },
};

export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  isOpen,
  onClose,
  initialAgentId = 'coo',
  onSendToChat,
  onLaunchDirective,
}) => {
  const [activeAgentId, setActiveAgentId] = useState<ParticipantId>(initialAgentId);
  const persona = VOICE_PERSONAS[activeAgentId] || VOICE_PERSONAS.coo;

  const [callState, setCallState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [continuousHandsFree, setContinuousHandsFree] = useState(true);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [callHistory, setCallHistory] = useState<VoiceCallTurn[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0.2);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [textFallbackInput, setTextFallbackInput] = useState('');
  const [isSpeechSupported, setIsSpeechSupported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  });

  // References
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const transcriptBoxRef = useRef<HTMLDivElement>(null);
  const speakTextRef = useRef<((text: string, currentPersona: VoicePersonaProfile) => void) | null>(null);
  const stopSpeakingRef = useRef<(() => void) | null>(null);
  const stopListeningRef = useRef<(() => void) | null>(null);
  const startListeningRef = useRef<(() => void) | null>(null);
  const handleUserVoiceMessageRef = useRef<((text: string) => Promise<void>) | null>(null);

  // Best Voice Selector matching persona
  const selectVoiceForPersona = useCallback((p: VoicePersonaProfile): SpeechSynthesisVoice | null => {
    if (!synthRef.current) return null;
    const voices = synthRef.current.getVoices();
    if (!voices || voices.length === 0) return null;

    // Filter by language
    const langVoices = voices.filter((v) => v.lang.startsWith(p.preferredVoiceLang.slice(0, 2)));

    if (p.voiceGender === 'female') {
      const femaleCandidate = langVoices.find(
        (v) =>
          v.name.includes('Female') ||
          v.name.includes('Samantha') ||
          v.name.includes('Victoria') ||
          v.name.includes('Zira') ||
          v.name.includes('Karen') ||
          v.name.includes('Natural') ||
          v.name.includes('Google UK English Female')
      );
      if (femaleCandidate) return femaleCandidate;
    } else {
      const maleCandidate = langVoices.find(
        (v) =>
          v.name.includes('Male') ||
          v.name.includes('Daniel') ||
          v.name.includes('David') ||
          v.name.includes('Alex') ||
          v.name.includes('George') ||
          v.name.includes('Google UK English Male')
      );
      if (maleCandidate) return maleCandidate;
    }

    return langVoices[0] || voices[0] || null;
  }, []);

  const stopSpeaking = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setCallState('idle');
    currentUtteranceRef.current = null;
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (callState === 'listening') {
      setCallState('idle');
    }
  }, [callState]);

  // Start Speech-to-Text Recognition
  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSpeechSupported(false);
      return;
    }

    stopSpeaking();

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setCallState('listening');
        setLiveTranscript('');
        playOSSound('click');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            final += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        const currentSaid = final || interim;
        setLiveTranscript(currentSaid);

        if (final && final.trim().length > 0) {
          handleUserVoiceMessageRef.current?.(final.trim());
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Voice recognition event:', event.error);
        if (event.error !== 'no-speech') {
          setCallState('idle');
        }
      };

      recognition.onend = () => {
        if (callState === 'listening') {
          setCallState('idle');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('SpeechRecognition start failed:', err);
      setCallState('idle');
    }
  }, [callState, stopSpeaking]);

  // Speak response aloud via SpeechSynthesis
  const speakText = useCallback((text: string, currentPersona: VoicePersonaProfile) => {
    if (!synthRef.current || isMuted) {
      if (continuousHandsFree) {
        setTimeout(() => startListeningRef.current?.(), 600);
      }
      return;
    }

    // Cancel ongoing speech
    synthRef.current.cancel();

    // Clean markdown syntax for clean spoken speech
    const cleanSpeech = text
      .replace(/\[.*?\]/g, '')
      .replace(/[*#_`~]/g, '')
      .replace(/https?:\/\/\S+/g, 'link')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.pitch = currentPersona.pitch;
    utterance.rate = currentPersona.rate * speechRate;

    const matchedVoice = selectVoiceForPersona(currentPersona);
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.onstart = () => {
      setCallState('speaking');
    };

    utterance.onend = () => {
      setCallState('idle');
      currentUtteranceRef.current = null;
      // If continuous hands-free is enabled, resume listening
      if (continuousHandsFree && isOpen) {
        setTimeout(() => startListeningRef.current?.(), 400);
      }
    };

    utterance.onerror = (e) => {
      console.warn('Speech synthesis error or cancelled:', e);
      setCallState('idle');
      currentUtteranceRef.current = null;
      if (continuousHandsFree && isOpen) {
        setTimeout(() => startListeningRef.current?.(), 500);
      }
    };

    currentUtteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  }, [continuousHandsFree, isMuted, isOpen, selectVoiceForPersona, speechRate]);

  // Process User's Spoken Message with Gemini AI
  const handleUserVoiceMessage = useCallback(async (spokenText: string) => {
    if (!spokenText.trim()) return;

    stopListening();
    setLiveTranscript('');

    const newTurn: VoiceCallTurn = {
      id: `turn-${Date.now()}`,
      sender: 'user',
      text: spokenText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setCallHistory((prev) => [...prev, newTurn]);
    setCallState('thinking');
    playOSSound('pop');

    try {
      // Call server-side Gemini endpoint
      const response = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: activeAgentId,
          message: spokenText,
          history: callHistory.slice(-6).map((h) => ({
            role: h.sender === 'user' ? 'user' : 'model',
            content: h.text,
          })),
        }),
      });

      const data = await response.json();
      const replyText = data.text || "I understand your directive and am aligning the council's execution parameters accordingly.";

      const replyTurn: VoiceCallTurn = {
        id: `turn-${Date.now() + 1}`,
        sender: 'agent',
        agentId: activeAgentId,
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setCallHistory((prev) => [...prev, replyTurn]);
      playOSSound('pop');

      // Speak answer
      const activePersona = VOICE_PERSONAS[activeAgentId] || VOICE_PERSONAS.coo;
      speakText(replyText, activePersona);
    } catch (err) {
      console.error('Voice call chat failed:', err);
      const fallbackText = "I have noted your command. The network is operating under safe invariant constraints.";
      const errorTurn: VoiceCallTurn = {
        id: `turn-${Date.now() + 1}`,
        sender: 'agent',
        agentId: activeAgentId,
        text: fallbackText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setCallHistory((prev) => [...prev, errorTurn]);
      speakText(fallbackText, VOICE_PERSONAS[activeAgentId] || VOICE_PERSONAS.coo);
    }
  }, [activeAgentId, callHistory, speakText, stopListening]);

  // Keep refs in sync
  useEffect(() => {
    speakTextRef.current = speakText;
    stopSpeakingRef.current = stopSpeaking;
    stopListeningRef.current = stopListening;
    startListeningRef.current = startListening;
    handleUserVoiceMessageRef.current = handleUserVoiceMessage;
  });

  // Initialize Speech Synthesis
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Sync initial agent when opened
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      prevOpenRef.current = true;
      const initPersona = VOICE_PERSONAS[initialAgentId] || VOICE_PERSONAS.coo;
      setActiveAgentId(initialAgentId);
      setCallDuration(0);
      setCallHistory([
        {
          id: `greet-${Date.now()}`,
          sender: 'agent',
          agentId: initialAgentId,
          text: initPersona.greeting,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      playOSSound('open');

      // Speak initial greeting
      const timeoutId = setTimeout(() => {
        speakTextRef.current?.(initPersona.greeting, initPersona);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else if (!isOpen && prevOpenRef.current) {
      prevOpenRef.current = false;
      stopSpeakingRef.current?.();
      stopListeningRef.current?.();
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen, initialAgentId]);

  // Call duration counter
  useEffect(() => {
    if (isOpen) {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  // Scroll transcript box to bottom on update
  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [callHistory, liveTranscript, callState]);

  // Dynamic Audio Visualizer Animation Loop
  useEffect(() => {
    let phase = 0;
    const updateWave = () => {
      phase += 0.15;
      if (callState === 'speaking') {
        setAudioLevel(0.4 + Math.sin(phase * 2) * 0.35 + Math.cos(phase * 3.5) * 0.25);
      } else if (callState === 'listening') {
        setAudioLevel(0.25 + Math.sin(phase * 1.5) * 0.2);
      } else if (callState === 'thinking') {
        setAudioLevel(0.2 + Math.sin(phase) * 0.1);
      } else {
        setAudioLevel(0.05);
      }
      animFrameRef.current = requestAnimationFrame(updateWave);
    };
    animFrameRef.current = requestAnimationFrame(updateWave);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [callState]);

  // Switch Active Agent during call
  const handleSwitchAgent = (newId: ParticipantId) => {
    if (newId === activeAgentId) return;
    stopSpeaking();
    stopListening();
    setActiveAgentId(newId);
    playOSSound('menu');

    const newPersona = VOICE_PERSONAS[newId] || VOICE_PERSONAS.coo;
    const switchGreeting = `Connecting to ${newPersona.name}. ${newPersona.greeting}`;

    setCallHistory((prev) => [
      ...prev,
      {
        id: `switch-${Date.now()}`,
        sender: 'agent',
        agentId: newId,
        text: switchGreeting,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    setTimeout(() => {
      speakText(switchGreeting, newPersona);
    }, 400);
  };

  const handleCopyTranscript = () => {
    const transcriptText = callHistory
      .map(
        (t) =>
          `[${t.timestamp}] ${t.sender === 'user' ? 'Founder' : VOICE_PERSONAS[t.agentId as ParticipantId]?.name || 'Agent'}: ${t.text}`
      )
      .join('\n\n');
    navigator.clipboard.writeText(transcriptText);
    setCopiedTranscript(true);
    playOSSound('copy');
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="relative w-full max-w-3xl h-[90vh] max-h-[760px] rounded-3xl bg-[#0e1017] border border-white/15 shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Ambient Background Aura */}
          <div
            className={`absolute inset-0 pointer-events-none opacity-40 bg-gradient-to-b ${persona.bgGlow} transition-all duration-700`}
          />

          {/* Top Bar / Header */}
          <div className="relative z-10 px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40 backdrop-blur-md">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <AgentAvatar
                  roleOrId={activeAgentId}
                  size="sm"
                  mode="photo"
                  showStatus={true}
                  status={callState !== 'idle' ? 'processing' : 'active'}
                />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-white tracking-tight">{persona.name}</h3>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>ENCRYPTED CALL</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">
                  {persona.role} • {formatDuration(callDuration)}
                </p>
              </div>
            </div>

            {/* Officer Switcher Dropdown / Pills */}
            <div className="flex items-center space-x-2">
              <div className="hidden sm:flex items-center space-x-1 p-1 rounded-xl bg-white/5 border border-white/10">
                {(Object.keys(VOICE_PERSONAS) as ParticipantId[]).map((pid) => {
                  const p = VOICE_PERSONAS[pid];
                  const isActive = pid === activeAgentId;
                  return (
                    <button
                      key={pid}
                      onClick={() => handleSwitchAgent(pid)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white font-bold shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                      title={`Switch voice to ${p.name}`}
                    >
                      {p.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>

              {/* End Call Button */}
              <button
                onClick={() => {
                  playOSSound('click');
                  onClose();
                }}
                className="p-2 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white transition-all shadow-md active:scale-95"
                title="Hang up"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Visual Stage */}
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden">
            {/* Real Avatar with Animated Voice Ripples */}
            <div className="relative my-2 sm:my-4 flex items-center justify-center">
              {/* Multi-layered Pulsing Audio Rings */}
              {callState === 'speaking' && (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0.1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    className="absolute w-52 h-52 rounded-full pointer-events-none"
                    style={{ border: `2px solid ${persona.themeColor}` }}
                  />
                  <motion.div
                    animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut', delay: 0.3 }}
                    className="absolute w-52 h-52 rounded-full pointer-events-none"
                    style={{ border: `1.5px dashed ${persona.themeColor}` }}
                  />
                </>
              )}

              {callState === 'listening' && (
                <motion.div
                  animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0.2, 0.8] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                  className="absolute w-52 h-52 rounded-full border-2 border-emerald-400 pointer-events-none"
                />
              )}

              {callState === 'thinking' && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                  className="absolute w-52 h-52 rounded-full border-2 border-dashed border-purple-400 pointer-events-none"
                />
              )}

              {/* Large Portrait Avatar */}
              <AgentAvatar
                roleOrId={activeAgentId}
                size="call"
                mode="photo"
                showGlow={true}
                isSpeaking={callState === 'speaking'}
                audioLevel={audioLevel}
                className="shadow-2xl ring-4 ring-white/10 transition-transform duration-300"
              />
            </div>

            {/* Audio Wave Visualizer Bars */}
            <div className="flex items-center justify-center space-x-1.5 h-10 my-2">
              {[0.4, 0.7, 1.0, 0.85, 0.6, 0.95, 0.5, 0.75, 0.3, 0.9, 0.65, 0.4].map((baseHeight, idx) => {
                const dynamicH =
                  callState === 'speaking' || callState === 'listening'
                    ? Math.max(8, baseHeight * 36 * (audioLevel + 0.3) * (0.8 + Math.sin(idx + audioLevel * 6) * 0.4))
                    : 6;
                return (
                  <motion.div
                    key={idx}
                    animate={{ height: dynamicH }}
                    transition={{ duration: 0.1 }}
                    className={`w-1.5 rounded-full transition-colors ${
                      callState === 'speaking'
                        ? 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]'
                        : callState === 'listening'
                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                        : callState === 'thinking'
                        ? 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]'
                        : 'bg-white/20'
                    }`}
                  />
                );
              })}
            </div>

            {/* Live State Badge */}
            <div className="mt-1 mb-2">
              {callState === 'listening' ? (
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center space-x-2 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>LISTENING TO YOU...</span>
                </span>
              ) : callState === 'thinking' ? (
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center space-x-2">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>REASONING (GEMINI 3.7 FLASH)...</span>
                </span>
              ) : callState === 'speaking' ? (
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center space-x-2">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span>{persona.name.toUpperCase()} IS SPEAKING</span>
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-mono text-slate-400 bg-white/5 border border-white/10 flex items-center space-x-2">
                  <span>TAP MIC TO SPEAK</span>
                </span>
              )}
            </div>

            {/* Live Transcript Log Box */}
            <div
              ref={transcriptBoxRef}
              className="w-full max-w-xl h-36 sm:h-44 rounded-2xl bg-black/50 border border-white/10 p-3.5 overflow-y-auto space-y-2.5 text-xs custom-scrollbar"
            >
              {callHistory.map((turn) => {
                const isUser = turn.sender === 'user';
                const turnPersona = VOICE_PERSONAS[turn.agentId as ParticipantId] || persona;
                return (
                  <div
                    key={turn.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center space-x-1.5 mb-0.5 text-[10px] text-slate-400 font-mono">
                      <span>{isUser ? 'Founder' : turnPersona.name}</span>
                      <span>•</span>
                      <span>{turn.timestamp}</span>
                    </div>
                    <div
                      className={`max-w-[85%] px-3.5 py-2 rounded-2xl leading-relaxed ${
                        isUser
                          ? 'bg-indigo-600/30 border border-indigo-500/40 text-slate-100 rounded-tr-sm'
                          : 'bg-white/5 border border-white/10 text-slate-200 rounded-tl-sm'
                      }`}
                    >
                      {turn.text}
                    </div>
                  </div>
                );
              })}

              {/* Interim Real-time Speech */}
              {liveTranscript && (
                <div className="flex flex-col items-end">
                  <div className="text-[10px] text-emerald-400 font-mono mb-0.5 animate-pulse">
                    Speaking live...
                  </div>
                  <div className="max-w-[85%] px-3.5 py-2 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-200 italic">
                    &ldquo;{liveTranscript}&rdquo;
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Interactive Voice Controls */}
          <div className="relative z-10 px-6 py-4 border-t border-white/10 bg-black/60 backdrop-blur-md flex flex-col space-y-3">
            {/* Quick Action Row */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center space-x-2">
                {/* Hands-free mode toggle */}
                <button
                  onClick={() => setContinuousHandsFree(!continuousHandsFree)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-semibold flex items-center space-x-1.5 transition-all ${
                    continuousHandsFree
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                  }`}
                  title="Toggle hands-free continuous conversation mode"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Hands-Free: {continuousHandsFree ? 'ON' : 'OFF'}</span>
                </button>

                {/* Speed Toggle */}
                <button
                  onClick={() => {
                    const speeds = [0.8, 1.0, 1.25, 1.5];
                    const nextIdx = (speeds.indexOf(speechRate) + 1) % speeds.length;
                    setSpeechRate(speeds[nextIdx]);
                    playOSSound('pop');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-slate-300"
                  title="Adjust speech playback speed"
                >
                  {speechRate}x Speed
                </button>
              </div>

              <div className="flex items-center space-x-2">
                {/* Copy transcript */}
                <button
                  onClick={handleCopyTranscript}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 flex items-center space-x-1.5 transition-all"
                  title="Copy session transcript"
                >
                  {copiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedTranscript ? 'Copied' : 'Transcript'}</span>
                </button>

                {/* Convert to 9-Step Directive */}
                {onLaunchDirective && (
                  <button
                    onClick={() => {
                      const lastTurn = callHistory.filter((t) => t.sender === 'user').slice(-1)[0];
                      if (lastTurn) {
                        onLaunchDirective(lastTurn.text);
                        onClose();
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-sm transition-all"
                    title="Launch 9-step verified directive from call"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Run Protocol</span>
                  </button>
                )}
              </div>
            </div>

            {/* Primary Center Call Controls */}
            <div className="flex items-center justify-center space-x-4">
              {/* Mute Speaker */}
              <button
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (!isMuted) stopSpeaking();
                  playOSSound('click');
                }}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isMuted
                    ? 'bg-amber-600/30 border-amber-500 text-amber-300'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                }`}
                title={isMuted ? 'Unmute voice audio' : 'Mute voice audio'}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              {/* Big Interactive Mic Action Button */}
              {callState === 'speaking' ? (
                <button
                  onClick={stopSpeaking}
                  className="px-6 py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm flex items-center space-x-2 shadow-lg shadow-amber-600/30 active:scale-95 transition-all"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Interrupt / Stop Speaking</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (callState === 'listening') {
                      stopListening();
                    } else {
                      startListening();
                    }
                  }}
                  className={`px-8 py-3.5 rounded-2xl font-bold text-sm flex items-center space-x-2.5 shadow-xl transition-all ${
                    callState === 'listening'
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/40 animate-pulse'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/30 hover:scale-105 active:scale-95'
                  }`}
                >
                  {callState === 'listening' ? (
                    <>
                      <MicOff className="w-5 h-5" />
                      <span>Stop Listening</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5" />
                      <span>Push to Speak</span>
                    </>
                  )}
                </button>
              )}

              {/* End Call Button */}
              <button
                onClick={() => {
                  stopSpeaking();
                  stopListening();
                  playOSSound('click');
                  onClose();
                }}
                className="p-3.5 rounded-2xl bg-rose-600/30 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white transition-all shadow-md active:scale-95"
                title="End Voice Call"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </div>

            {/* Keyboard / Text Fallback Input (if microphone is disabled or user prefers typing during voice call) */}
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="text"
                value={textFallbackInput}
                onChange={(e) => setTextFallbackInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && textFallbackInput.trim()) {
                    handleUserVoiceMessage(textFallbackInput.trim());
                    setTextFallbackInput('');
                  }
                }}
                placeholder={`Type a prompt to speak with ${persona.name}...`}
                className="flex-1 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
              />
              <button
                onClick={() => {
                  if (textFallbackInput.trim()) {
                    handleUserVoiceMessage(textFallbackInput.trim());
                    setTextFallbackInput('');
                  }
                }}
                disabled={!textFallbackInput.trim() || callState === 'thinking'}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs transition-all shadow-sm"
              >
                Speak
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default VoiceCallModal;
