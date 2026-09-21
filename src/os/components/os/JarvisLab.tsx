'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Camera,
  CameraOff,
  Radio,
  Zap,
  Shield,
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  Terminal,
  Cpu,
  Layers,
  ArrowRight,
  Eye,
  RefreshCw,
  Send,
  Play,
} from 'lucide-react';
import { BrowserSttClient } from '@/lib/client/live/browser-stt';
import { TtsSpeaker } from '@/lib/client/live/tts-speaker';
import {
  holdCamera,
  releaseCamera,
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

export default function JarvisLab({ onBackToOs }: { onBackToOs?: () => void }) {
  // Session & Connection
  const [sessionId] = useState(() => `sess-${Math.random().toString(36).slice(2, 9)}`);
  const [isConnected, setIsConnected] = useState(false);
  const [activeProvider, setActiveProvider] = useState('gemini');
  const [availableProviders, setAvailableProviders] = useState<Array<{ id: string; name: string; model: string }>>([
    { id: 'gemini', name: 'Google Gemini Pro', model: 'gemini-1.5-pro' },
  ]);

  // Audio & Modality State
  const [modality, setModality] = useState<'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted'>('idle');
  const [isMicActive, setIsMicActive] = useState(false);
  const isMicActiveRef = useRef(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isTtsMuted, setIsTtsMuted] = useState(false);
  const [transcriptInterim, setTranscriptInterim] = useState('');
  const [transcriptFinal, setTranscriptFinal] = useState('');
  const [textInput, setTextInput] = useState('');
  const [speechAlert, setSpeechAlert] = useState<{ message: string; hint: string } | null>(null);
  const [lastReply, setLastReply] = useState('');
  const [turnLatencyMs, setTurnLatencyMs] = useState<number | null>(null);

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

  // Mic Mode: 'direct' (WebRTC MediaRecorder - resilient) vs 'webspeech' (Web Speech API)
  const [micMode, setMicMode] = useState<'direct' | 'webspeech'>('direct');

  const addEvent = useCallback((type: DiagnosticEvent['type'], detail: string, durationMs?: number) => {
    const time = new Date().toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setEvents((prev) => [
      { id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, timestamp: time, type, detail, durationMs },
      ...prev.slice(0, 49),
    ]);
  }, []);

  // Cleanup all audio resources and release microphone hardware
  const releaseAudioHardware = useCallback(() => {
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
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    sttClientRef.current?.stop();
    isMicActiveRef.current = false;
    setIsMicActive(false);
  }, []);

  // Initialize Speech Services
  useEffect(() => {
    ttsSpeakerRef.current = new TtsSpeaker({
      onStart: () => {
        setModality('speaking');
        addEvent('tts', 'Speech synthesis output started');
      },
      onEnd: () => {
        setModality('idle');
        addEvent('tts', 'Speech synthesis playback complete');
      },
      onError: (err) => {
        addEvent('error', `TTS error: ${err}`);
      },
    });

    sttClientRef.current = new BrowserSttClient({
      onSpeechStart: () => {
        setModality('listening');
        addEvent('stt', 'VAD speech detected (listening)');
      },
      onInterimTranscript: (interim) => {
        setTranscriptInterim(interim);
      },
      onFinalTranscript: (final) => {
        setTranscriptFinal(final);
        setTranscriptInterim('');
        addEvent('stt', `Transcribed utterance: "${final}"`);
        void handleTurnSubmit({ messageText: final });
      },
      onError: (err) => {
        // Fallback to Direct Audio Mode if Web Speech throws an error
        addEvent('error', `Web Speech: ${err.message}. Auto-switching to Direct Audio Capture mode.`);
        setSpeechAlert({
          message: 'Switched to Direct Audio Mode',
          hint: 'Your browser microphone is active and recording directly without relying on Google cloud speech servers.',
        });
        setMicMode('direct');
      },
      onEnd: () => {
        if (isMicActiveRef.current && micMode === 'webspeech') {
          try {
            sttClientRef.current?.start();
          } catch {
            // Safe ignore
          }
        } else {
          setModality('idle');
        }
      },
    });

    // Check providers from server
    fetch('/api/realtime/turn')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.providers)) {
          setAvailableProviders(data.providers);
          setIsConnected(true);
          addEvent('provider', `Loaded ${data.providers.length} registered realtime provider(s)`);
        } else {
          setIsConnected(false);
        }
      })
      .catch(() => {
        setIsConnected(false);
      });

    return () => {
      releaseAudioHardware();
      ttsSpeakerRef.current?.cancel();
      releaseCamera();
    };
  }, [addEvent, micMode, releaseAudioHardware]);

  // Start Direct Audio Recording & RMS Metering
  const startDirectAudio = async () => {
    releaseAudioHardware();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    mediaStreamRef.current = stream;

    // Audio Context for energy metering
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

    // MediaRecorder for capturing voice
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
          addEvent('stt', `Captured voice recording (${Math.round(audioBlob.size / 1024)}KB ${mimeType}). Dispatching to Sophia...`);
          void handleTurnSubmit({ audioBase64: base64, audioMimeType: mimeType });
        }
      };
      reader.readAsDataURL(audioBlob);
    };

    recorder.start(250);
    mediaRecorderRef.current = recorder;

    isMicActiveRef.current = true;
    setIsMicActive(true);
    setModality('listening');
    addEvent('stt', 'Microphone armed in Direct Audio Mode (hardware active)');
  };

  // Mic Toggle
  const toggleMic = async () => {
    osSound.click();
    setSpeechAlert(null);

    if (isMicActive) {
      // Disarm & process recorded turn
      addEvent('stt', 'Microphone stopped. Processing captured speech...');
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      releaseAudioHardware();
      setModality('thinking');
    } else {
      try {
        if (micMode === 'direct') {
          await startDirectAudio();
        } else {
          // Web Speech API Mode without competing stream
          releaseAudioHardware();
          isMicActiveRef.current = true;
          setIsMicActive(true);
          setModality('listening');
          const ok = sttClientRef.current?.start();
          if (ok) {
            addEvent('stt', 'Microphone armed in Web Speech mode');
          } else {
            // Fallback immediately to direct audio mode
            setMicMode('direct');
            await startDirectAudio();
          }
        }
      } catch (err: any) {
        releaseAudioHardware();
        setModality('idle');
        setSpeechAlert({
          message: 'Microphone access failed',
          hint: err?.message || 'Check if another application has an exclusive lock on your microphone.',
        });
        addEvent('error', `Microphone error: ${err?.message || err}`);
      }
    }
  };

  // Test Speech Output (TTS Preview)
  const testTtsPreview = () => {
    osSound.click();
    addEvent('tts', 'Triggered local TTS speaker test');
    ttsSpeakerRef.current?.speakText(
      'Sophia realtime voice channel is online. Deterministic governance and model provider are active.'
    );
  };

  // Instant Barge-In / Interrupt
  const handleInterrupt = () => {
    osSound.click();
    ttsSpeakerRef.current?.cancel();
    setModality('interrupted');
    addEvent('tts', 'Instant barge-in: Speech output canceled by founder');
    setTimeout(() => setModality('idle'), 600);
  };

  // Camera Toggle
  const toggleCamera = async () => {
    osSound.click();
    if (cameraActive) {
      releaseCamera();
      setCameraActive(false);
      setSnapshot(null);
      addEvent('camera', 'Camera released and preview detached');
    } else {
      try {
        await holdCamera(videoRef.current || undefined);
        setCameraActive(true);
        addEvent('camera', 'Camera stream active (refcounted handle)');
      } catch (err: any) {
        addEvent('error', `Camera error: ${err.message || err}`);
      }
    }
  };

  // Grab Visual Snapshot
  const captureStill = () => {
    osSound.click();
    if (!cameraActive) return;
    const shot = grabCameraSnapshot(videoRef.current || undefined);
    if (shot) {
      setSnapshot(shot);
      addEvent('camera', `Captured sample still (${shot.width}x${shot.height} JPEG, ${Math.round(shot.base64Data.length / 1024)}KB)`);
    }
  };

  // Turn Submission (accepts text, audio recording, or camera frame)
  const handleTurnSubmit = async (params: {
    messageText?: string;
    audioBase64?: string;
    audioMimeType?: string;
  }) => {
    const text = params.messageText?.trim() || '';
    if (!text && !params.audioBase64) return;

    setModality('thinking');
    const startTime = Date.now();
    if (text) {
      addEvent('provider', `Dispatching turn to '${activeProvider}': "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`);
    } else {
      addEvent('provider', `Dispatching raw voice recording to '${activeProvider}'`);
    }

    try {
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
      setLastGovernance({
        isDirective: !!data.isDirective,
        orchestrationRunId: data.orchestrationRunId,
        approvalsPending: data.approvalsPending,
        intent: data.detectedIntent,
      });

      if (data.isDirective) {
        addEvent('governance', `Directive routed to MultiAgentOrchestrator council (${data.approvalsPending || 0} pending approvals)`, elapsed);
      } else {
        addEvent('provider', `Model response received via ${data.modelUsed || activeProvider}`, elapsed);
      }

      // Speak reply if not muted
      if (!isTtsMuted && data.reply) {
        ttsSpeakerRef.current?.speakText(data.reply);
      } else {
        setModality('idle');
      }
    } catch (err: any) {
      setModality('idle');
      addEvent('error', `Turn error: ${err.message || err}`);
    }
  };

  return (
    <div className="relative h-full w-full overflow-y-auto bg-[#01040a] px-4 py-16 text-slate-200 sm:px-8">
      {/* ----------------- Header & Title ----------------- */}
      <div className="mx-auto mb-6 flex max-w-6xl items-center justify-between border-b border-white/10 pb-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse" />
            <span className="font-mono text-[10px] tracking-[0.24em] text-cyan-300 uppercase">
              SamJuniorsOS Realtime Engine
            </span>
          </div>
          <h1 className="text-2xl font-light tracking-tight text-white sm:text-3xl">
            Sophia Realtime Lab
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Realtime Voice, Vision & Provider Verification Studio · Authoritative Core
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Badge */}
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-mono">
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-rose-500'}`} />
            <span className="text-slate-300">{isConnected ? 'LIVE ENGINE READY' : 'OFFLINE'}</span>
          </div>

          {onBackToOs && (
            <button
              onClick={onBackToOs}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              Back to Desktop
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ----------------- Left Column: Audio & Perceptual Controls (7 cols) ----------------- */}
        <div className="space-y-6 lg:col-span-7">
          {/* 1. Modality Status & Microphone Card */}
          <div className="rounded-2xl border border-white/10 bg-[#040a14]/80 p-5 shadow-2xl backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Radio size={16} className="text-cyan-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Audio & Voice Channel
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {/* Audio Mode Switcher */}
                <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.02] p-0.5 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => {
                      if (isMicActive) releaseAudioHardware();
                      setMicMode('direct');
                      addEvent('stt', 'Switched to Direct Audio Mode (WebRTC hardware recording)');
                    }}
                    className={`rounded px-2 py-0.5 transition ${
                      micMode === 'direct'
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Direct hardware microphone recording (Resilient, 100% reliable)"
                  >
                    Direct Audio
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isMicActive) releaseAudioHardware();
                      setMicMode('webspeech');
                      addEvent('stt', 'Switched to Web Speech API mode (interim transcripts)');
                    }}
                    className={`rounded px-2 py-0.5 transition ${
                      micMode === 'webspeech'
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Browser Web Speech API (Google cloud speech recognition)"
                  >
                    Web Speech
                  </button>
                </div>

                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-mono tracking-wider uppercase border ${
                  modality === 'speaking'
                    ? 'border-violet-400/40 bg-violet-400/10 text-violet-300'
                    : modality === 'thinking'
                    ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                    : modality === 'listening'
                    ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300'
                    : modality === 'interrupted'
                    ? 'border-rose-400/40 bg-rose-400/10 text-rose-300'
                    : 'border-white/10 bg-white/[0.02] text-slate-400'
                }`}>
                  {modality}
                </span>
              </div>
            </div>

            {/* Mic Energy Gauge */}
            <div className="mb-5 rounded-xl border border-white/5 bg-black/40 p-4">
              <div className="mb-2 flex justify-between text-[11px] font-mono text-slate-400">
                <span>INPUT LEVEL (RMS)</span>
                <span className="text-cyan-300">{micLevel}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 transition-all duration-75"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
            </div>

            {/* Speech Alert Banner (if browser speech error occurs) */}
            {speechAlert && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs text-amber-200">
                <AlertCircle size={16} className="mt-0.5 text-amber-400 shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold text-amber-100">{speechAlert.message}</div>
                  <div className="mt-1 text-[11px] text-amber-300/80">{speechAlert.hint}</div>
                </div>
                <button
                  onClick={() => setSpeechAlert(null)}
                  className="text-amber-400/60 hover:text-amber-200 text-xs px-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={toggleMic}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold tracking-wide transition-all active:scale-95 ${
                  isMicActive
                    ? 'border border-cyan-400/40 bg-cyan-500/20 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.3)]'
                    : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {isMicActive ? <Mic size={15} className="text-cyan-300 animate-pulse" /> : <MicOff size={15} />}
                <span>{isMicActive ? 'Stop Listening' : 'Start Listening'}</span>
              </button>

              <button
                onClick={handleInterrupt}
                disabled={modality !== 'speaking'}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                title="Immediately halt assistant speech (Barge-in)"
              >
                <Zap size={14} />
                <span>Barge-in (Interrupt)</span>
              </button>

              <button
                onClick={testTtsPreview}
                className="flex items-center gap-1.5 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2.5 text-xs text-sky-200 transition hover:bg-sky-500/20 active:scale-95"
                title="Test browser speech synthesis audio output"
              >
                <Play size={13} />
                <span>Test Voice (TTS)</span>
              </button>

              <button
                onClick={() => {
                  osSound.click();
                  setIsTtsMuted((v) => !v);
                  if (!isTtsMuted) ttsSpeakerRef.current?.cancel();
                }}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs transition active:scale-95 ${
                  isTtsMuted ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
                title={isTtsMuted ? 'Unmute Assistant TTS' : 'Mute Assistant TTS'}
              >
                {isTtsMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                <span>{isTtsMuted ? 'Muted' : 'Sound On'}</span>
              </button>
            </div>

            {/* Live Transcript / Utterance Box */}
            <div className="mt-5 rounded-xl border border-white/5 bg-[#02050b] p-3.5">
              <div className="mb-1 text-[10.5px] font-mono uppercase tracking-wider text-slate-400">
                Live Speech Stream
              </div>
              <div className="min-h-[38px] text-[13px] leading-relaxed">
                {transcriptInterim && (
                  <span className="italic text-cyan-300/80">{transcriptInterim} </span>
                )}
                {transcriptFinal ? (
                  <span className="text-slate-100 font-medium">"{transcriptFinal}"</span>
                ) : !transcriptInterim ? (
                  <span className="text-slate-600">Speak into microphone to test realtime ingress…</span>
                ) : null}
              </div>
            </div>

            {/* Direct Command & Fallback Text Input */}
            <div className="mt-4 pt-4 border-t border-white/5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (textInput.trim()) {
                    void handleTurnSubmit({ messageText: textInput });
                    setTextInput('');
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type a voice directive or query (e.g. 'Research our competitors')..."
                  className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
                <button
                  type="submit"
                  disabled={!textInput.trim() || modality === 'thinking'}
                  className="flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-500/20 px-3.5 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/30 disabled:opacity-40"
                >
                  <Send size={13} />
                  <span>Send</span>
                </button>
              </form>

              {/* Quick Preset Directive Chips */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10.5px]">
                <span className="text-slate-500">Quick Test:</span>
                <button
                  type="button"
                  onClick={() => void handleTurnSubmit({ messageText: 'Sophia, give me an operational pulse on company workflows' })}
                  className="rounded-lg border border-white/5 bg-white/[0.02] px-2 py-0.5 text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-950/30 hover:text-cyan-200"
                >
                  💬 Operational Pulse
                </button>
                <button
                  type="button"
                  onClick={() => void handleTurnSubmit({ messageText: 'Research our competitors and summarize market risks' })}
                  className="rounded-lg border border-white/5 bg-white/[0.02] px-2 py-0.5 text-slate-300 transition hover:border-amber-400/30 hover:bg-amber-950/30 hover:text-amber-200"
                >
                  🛡️ Competitor Research (Council)
                </button>
                <button
                  type="button"
                  onClick={() => void handleTurnSubmit({ messageText: 'What is our current financial runway and burn rate?' })}
                  className="rounded-lg border border-white/5 bg-white/[0.02] px-2 py-0.5 text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-950/30 hover:text-cyan-200"
                >
                  📊 Financial Runway
                </button>
              </div>
            </div>
          </div>

          {/* 2. Visual Sensory & Camera Card */}
          <div className="rounded-2xl border border-white/10 bg-[#040a14]/80 p-5 shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Eye size={16} className="text-sky-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Sample-Gated Vision Channel
                </h3>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-mono uppercase border ${
                cameraActive ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : 'border-white/10 text-slate-500'
              }`}>
                {cameraActive ? 'Camera Active' : 'Camera Disarmed'}
              </span>
            </div>

            <p className="mb-4 text-xs text-slate-400 leading-relaxed">
              Demonstrating sample-gated multimodal vision. Video is NOT continuously streamed to cloud models; still frames are captured on demand to eliminate token waste.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Preview Box */}
              <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black/60 flex items-center justify-center">
                <video
                  ref={videoRef}
                  className={`h-full w-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                  autoPlay
                  playsInline
                  muted
                />
                {!cameraActive && (
                  <div className="flex flex-col items-center gap-1.5 text-slate-600">
                    <CameraOff size={22} />
                    <span className="text-[10px] font-mono">NO ACTIVE STREAM</span>
                  </div>
                )}
              </div>

              {/* Snapshot Thumbnail / Actions */}
              <div className="flex flex-col justify-between rounded-xl border border-white/5 bg-black/30 p-3">
                <div>
                  <div className="mb-2 text-[10px] font-mono text-slate-400 uppercase">Attached Still Snapshot</div>
                  {snapshot ? (
                    <div className="relative aspect-video overflow-hidden rounded-lg border border-cyan-400/30">
                      <img
                        src={`data:${snapshot.mimeType};base64,${snapshot.base64Data}`}
                        alt="Captured still frame"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 font-mono text-[9px] text-cyan-200">
                        {snapshot.width}x{snapshot.height}
                      </span>
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-white/10 text-[11px] text-slate-600">
                      No frame captured
                    </div>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={toggleCamera}
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:bg-white/10"
                  >
                    {cameraActive ? 'Disarm Camera' : 'Arm Camera'}
                  </button>
                  <button
                    onClick={captureStill}
                    disabled={!cameraActive}
                    className="flex-1 rounded-lg border border-sky-400/30 bg-sky-500/15 py-1.5 text-[11px] font-medium text-sky-200 transition hover:bg-sky-500/25 disabled:opacity-40"
                  >
                    Capture Still
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Latest Sophia Response & Governance Card */}
          <div className="rounded-2xl border border-white/10 bg-[#040a14]/80 p-5 shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-cyan-300" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Authoritative Cognitive Outcome
                </h3>
              </div>
              {turnLatencyMs !== null && (
                <span className="font-mono text-[10.5px] text-slate-400">
                  <Clock size={11} className="inline mr-1 text-slate-500" />
                  {turnLatencyMs} ms
                </span>
              )}
            </div>

            {lastReply ? (
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-950/15 p-4 text-[13px] leading-relaxed text-cyan-50">
                "{lastReply}"
              </div>
            ) : (
              <div className="rounded-xl border border-white/5 bg-black/20 p-4 text-xs italic text-slate-500">
                No turn executed yet. Speak or type a query to test.
              </div>
            )}

            {/* Governance Indicator */}
            {lastGovernance && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <Shield size={13} className={lastGovernance.isDirective ? 'text-amber-300' : 'text-cyan-300'} />
                  <span className="text-slate-300">
                    Governance Status:{' '}
                    <strong className={lastGovernance.isDirective ? 'text-amber-200' : 'text-cyan-200'}>
                      {lastGovernance.isDirective ? 'Council Directive' : 'Conversational Turn'}
                    </strong>
                  </span>
                </div>
                {lastGovernance.isDirective && (
                  <span className="rounded bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] uppercase text-amber-300 border border-amber-400/30">
                    Gated Approval Lock
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ----------------- Right Column: Provider & Diagnostics (5 cols) ----------------- */}
        <div className="space-y-6 lg:col-span-5">
          {/* 1. Model Provider Registry Card */}
          <div className="rounded-2xl border border-white/10 bg-[#040a14]/80 p-5 shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu size={16} className="text-cyan-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Realtime Model Provider
                </h3>
              </div>
              <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cyan-300 border border-cyan-500/20">
                Provider-Neutral
              </span>
            </div>

            <div className="space-y-2">
              {availableProviders.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { osSound.click(); setActiveProvider(p.id); }}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    activeProvider === p.id
                      ? 'border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_15px_rgba(56,189,248,0.2)]'
                      : 'border-white/5 bg-white/[0.02] hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">{p.name}</span>
                    {activeProvider === p.id && <CheckCircle2 size={13} className="text-cyan-300" />}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-slate-400">
                    Model: {p.model} · Cloud Server Ingress
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 border-t border-white/5 pt-3 text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">Target Extensibility:</span> Provider abstraction allows drop-in support for Gemini Live, OpenAI Realtime, or local Qwen-ASR nodes without altering Sophia core.
            </div>
          </div>

          {/* 2. Session & Ingress Telemetry Card */}
          <div className="rounded-2xl border border-white/10 bg-[#040a14]/80 p-5 shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-indigo-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Telemetry & Ingress
                </h3>
              </div>
              <span className="font-mono text-[10px] text-slate-500">/api/realtime/turn</span>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-slate-400">SESSION ID</span>
                <span className="text-slate-200">{sessionId}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-slate-400">TRANSPORT</span>
                <span className="text-emerald-400">Next.js HTTP/REST Ingress</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-slate-400">VAD ENGINE</span>
                <span className="text-cyan-300">WebAudio RMS AnalyserNode</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-slate-400">ACTIVE STT</span>
                <span className="text-slate-200">
                  {micMode === 'direct' ? 'WebRTC MediaRecorder (Direct)' : 'Browser SpeechRecognition'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">SECURITY GATE</span>
                <span className="text-amber-300">SideEffectAuthorizationGate (Server)</span>
              </div>
            </div>
          </div>

          {/* 3. Diagnostic Event Stream Card */}
          <div className="rounded-2xl border border-white/10 bg-[#040a14]/80 p-5 shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal size={15} className="text-emerald-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Live Diagnostic Stream
                </h3>
              </div>
              <button
                onClick={() => setEvents([])}
                className="text-[10px] font-mono text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto pr-1 font-mono text-[10.5px]">
              {events.length === 0 ? (
                <div className="py-6 text-center text-slate-600">Awaiting events…</div>
              ) : (
                events.map((e) => (
                  <div key={e.id} className="rounded border border-white/5 bg-black/40 p-2 leading-tight">
                    <div className="flex justify-between text-[9px] text-slate-500">
                      <span>[{e.timestamp}]</span>
                      <span className={`uppercase ${
                        e.type === 'error'
                          ? 'text-rose-400'
                          : e.type === 'governance'
                          ? 'text-amber-300'
                          : e.type === 'stt'
                          ? 'text-cyan-300'
                          : 'text-slate-400'
                      }`}>
                        {e.type}
                      </span>
                    </div>
                    <div className="mt-1 text-slate-300 break-words">{e.detail}</div>
                    {e.durationMs !== undefined && (
                      <div className="mt-0.5 text-[9px] text-slate-500">Latency: {e.durationMs}ms</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
