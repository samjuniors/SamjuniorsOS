import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Mic, Volume2, Radio } from 'lucide-react';
import { WakeTrigger } from '../types/sofia';
import { scoreEngine } from '../sofia/sophia/audio/ScoreEngine';

interface BootScreenProps {
  onAwaken: (trigger?: WakeTrigger) => Promise<void>;
  isLoading: boolean;
  error?: string | null;
}

export const BootScreen: React.FC<BootScreenProps> = ({
  onAwaken,
  isLoading,
  error
}) => {
  const [bootPhase, setBootPhase] = useState<'welcome' | 'connecting'>('welcome');
  const [isListeningForWakeWord, setIsListeningForWakeWord] = useState(false);
  const [heardTranscript, setHeardTranscript] = useState<string | null>(null);
  const [wakeTriggerDetected, setWakeTriggerDetected] = useState(false);

  const recognitionRef = useRef<any>(null);
  const hasTriggeredRef = useRef(false);

  const handleStart = async (trigger: WakeTrigger = 'tap') => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    // Immediately unlock audio and trigger boot fanfare upon user gesture
    void scoreEngine.unlock().then(() => {
      scoreEngine.playBoot();
    }).catch(() => {});

    // Stop background boot speech recognizer cleanly before starting full engine
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null;
    }

    setBootPhase('connecting');
    await onAwaken(trigger);
  };

  // Continuous background listener for "Hey Sofia" right on the boot screen
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('SpeechRecognition not available in this browser for boot wake word.');
      return;
    }

    let isMounted = true;

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-AU';

      recognition.onstart = () => {
        if (isMounted && !hasTriggeredRef.current) {
          setIsListeningForWakeWord(true);
        }
      };

      recognition.onresult = (event: any) => {
        if (hasTriggeredRef.current) return;

        const results = event.results;
        for (let i = event.resultIndex; i < results.length; i++) {
          const transcript = results[i][0].transcript.trim().toLowerCase();
          setHeardTranscript(transcript);

          // Check if wake word matches "hey sofia", "hi sofia", "sofia", "sophia", etc.
          if (
            transcript.includes('hey sofia') ||
            transcript.includes('hey sophia') ||
            transcript.includes('hi sofia') ||
            transcript.includes('hello sofia') ||
            transcript.includes('sofia') ||
            transcript.includes('sophia') ||
            transcript.includes('wake up')
          ) {
            setWakeTriggerDetected(true);
            handleStart('wake-word');
            break;
          }
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error === 'not-allowed') {
          console.debug('Microphone permission not yet granted on boot screen');
          setIsListeningForWakeWord(false);
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.debug('Boot recognition event:', e.error);
        }
      };

      recognition.onend = () => {
        // Automatically restart if user is still on welcome phase
        if (isMounted && !hasTriggeredRef.current) {
          try {
            recognition.start();
          } catch (e) {
            // Already started or busy
          }
        }
      };

      recognition.start();
    } catch (err) {
      console.warn('Could not start wake word recognition on boot screen:', err);
    }

    return () => {
      isMounted = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch (e) {}
        recognitionRef.current = null;
      }
    };
  }, []);

  // Keyboard shortcut listener on boot screen (Space or Enter to awaken)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleStart('tap');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      onClick={(e) => {
        // If clicking outside interactive button, still awaken Sofia
        if ((e.target as HTMLElement).tagName !== 'BUTTON') {
          handleStart('tap');
        }
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#07090e] px-6 text-center select-none overflow-hidden cursor-pointer"
    >
      {/* Ambient background glow */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute w-[300px] h-[300px] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none translate-y-20" />

      <AnimatePresence mode="wait">
        {bootPhase === 'welcome' ? (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center max-w-sm"
          >
            {/* Minimal glowing sigil */}
            <div className="relative mb-6 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-cyan-500/30 to-indigo-500/30 blur-md animate-pulse" />
              <div className="absolute w-14 h-14 rounded-full border border-cyan-400/40 flex items-center justify-center bg-[#0d121c]/80 backdrop-blur-md shadow-[0_0_25px_rgba(56,189,248,0.25)]">
                <Sparkles className="w-6 h-6 text-cyan-300 animate-spin" style={{ animationDuration: '10s' }} />
              </div>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-white mb-2 font-['Plus_Jakarta_Sans',sans-serif]">
              Sofia
            </h1>
            <p className="text-sm text-slate-400 font-light mb-6 leading-relaxed">
              Warm, natural voice companion. Simply speak naturally or say <span className="text-cyan-300 font-medium">"Hey Sofia"</span>.
            </p>

            {/* Active Wake Word Status Badge */}
            <div className="mb-6 flex flex-col items-center gap-1.5">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/30 backdrop-blur-md shadow-[0_0_15px_rgba(56,189,248,0.15)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                </span>
                <span className="text-xs text-cyan-200 font-medium tracking-wide flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  {wakeTriggerDetected
                    ? 'Heard "Hey Sofia"! Waking up...'
                    : isListeningForWakeWord
                    ? 'Listening for "Hey Sofia"...'
                    : 'Voice-ready • Say "Hey Sofia"'}
                </span>
              </div>

              {/* Real-time speech transcript feedback on boot screen */}
              {heardTranscript && !wakeTriggerDetected && (
                <motion.span
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[11px] text-slate-400 font-light italic truncate max-w-[260px]"
                >
                  Hearing: "{heardTranscript}"
                </motion.span>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleStart('tap');
              }}
              className="group relative inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/25 hover:border-cyan-300 transition-all duration-300 text-sm font-medium tracking-wide shadow-[0_0_20px_rgba(56,189,248,0.2)] active:scale-95"
            >
              <Mic className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span>Awaken Sofia</span>
            </button>

            <p className="mt-4 text-xs text-slate-400/90 font-light">
              Say <strong className="text-slate-300">"Hey Sofia"</strong> or click anywhere to begin
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="connecting"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center"
          >
            {/* Awakening concentric ring animation */}
            <div className="relative w-28 h-28 flex items-center justify-center mb-6">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-ping opacity-40" />
              <div className="absolute inset-2 rounded-full border border-cyan-300/50 animate-spin" style={{ animationDuration: '3s' }} />
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 shadow-[0_0_30px_rgba(56,189,248,0.5)] flex items-center justify-center">
                <Volume2 className="w-5 h-5 text-slate-950 animate-pulse" />
              </div>
            </div>

            <p className="text-base text-slate-200 font-medium tracking-wide mb-1">
              {wakeTriggerDetected ? 'Awakening Sofia from wake word...' : 'Awakening Sofia...'}
            </p>
            <p className="text-xs text-slate-400">
              Calibrating voice activity & audio resonance
            </p>

            {error && (
              <div className="mt-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs max-w-xs">
                {error}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    hasTriggeredRef.current = false;
                    setWakeTriggerDetected(false);
                    setBootPhase('welcome');
                  }}
                  className="block mt-2 underline text-white font-medium mx-auto"
                >
                  Try Again
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
