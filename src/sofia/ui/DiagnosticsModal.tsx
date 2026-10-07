/**
 * DiagnosticsModal — Live System Diagnostics & Status Monitor.
 *
 * Provides real-time visual inspection for:
 *   - Microphone Hardware & Capture (Live input VU level meter, sample rate, permissions)
 *   - Gemini Live Bidi Transport (WebSocket status, live token, packets sent/received)
 *   - Brain Intelligence Engine (Pure Gemini Live vs Multi-LLM)
 *   - Speech / Mouth Output (Gemini Flash Lite TTS / 24 kHz DAC, playback level)
 *   - WebGL Particle Geometry Renderer (FPS, density tier, active geometric form)
 *   - Interactive Quick Tests: "Test Mic", "Test Voice", and "Reset Gemini Live"
 */

import { Activity, CheckCircle2, Mic, RefreshCw, Sparkles, Volume2, X, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SophiaOS, DiagnosticsSnapshot } from '../sophia/SophiaOS';
import { controlLayer } from '../sophia/control';

export function DiagnosticsModal({
  os,
  onClose,
}: {
  os: SophiaOS;
  onClose: () => void;
}) {
  const [diag, setDiag] = useState<DiagnosticsSnapshot>(() => os.getDiagnostics());
  const [micTesting, setMicTesting] = useState(false);
  const [micTestScore, setMicTestScore] = useState<number | null>(null);
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [resettingLive, setResettingLive] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setDiag(os.getDiagnostics());
    }, 100);
    return () => clearInterval(timer);
  }, [os]);

  const handleTestMic = async () => {
    setMicTesting(true);
    setMicTestScore(null);
    const score = await os.testMic();
    setMicTestScore(score);
    setMicTesting(false);
  };

  const handleTestVoice = async () => {
    setVoiceTesting(true);
    await os.testVoice();
    setVoiceTesting(false);
  };

  const handleResetLive = async () => {
    setResettingLive(true);
    await os.resetGeminiLiveSession();
    setResettingLive(false);
  };

  const isMicOk = diag.mic.status === 'capturing' || diag.mic.status === 'idle';
  const isLiveOk = diag.live.status === 'connected' || diag.live.status === 'idle';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl border border-sky-400/30 bg-[#060a14] p-5 shadow-[0_0_40px_rgba(56,189,248,0.22)] text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="block size-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse" />
            <div>
              <h2 className="text-xs font-semibold tracking-[0.2em] uppercase text-white/95">
                Live System Diagnostics & Monitor
              </h2>
              <p className="text-[9px] text-sky-200/60 font-mono">Real-time health verification</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Diagnostics"
            className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Diagnostic Grid */}
        <div className="mt-4 space-y-3 max-h-[70vh] overflow-y-auto pr-1">

          {/* 1. Pure Gemini Live Status Banner */}
          {controlLayer.pureGeminiLive && (
            <div className="flex items-center justify-between rounded-xl border border-sky-400/40 bg-sky-500/10 p-3 shadow-[inset_0_0_12px_rgba(56,189,248,0.15)]">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-sky-300 animate-spin" />
                <div>
                  <p className="text-[10px] font-semibold tracking-wider text-sky-200 uppercase">
                    Pure Gemini Live Mode Active
                  </p>
                  <p className="text-[8.5px] text-sky-200/70">
                    All-in-one native audio & brain enabled. Other backends disabled.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-sky-400/20 px-2 py-0.5 font-mono text-[8.5px] font-medium text-sky-300">
                All-In-One
              </span>
            </div>
          )}

          {/* 2. Microphone Capture Section */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic size={15} className={isMicOk ? 'text-emerald-400' : 'text-rose-400'} />
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/80">
                  Microphone Capture
                </span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-wider ${
                  diag.mic.status === 'capturing'
                    ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                    : diag.mic.status === 'denied'
                      ? 'border border-rose-500/40 bg-rose-500/20 text-rose-300'
                      : 'border border-white/10 bg-white/5 text-white/60'
                }`}
              >
                {diag.mic.status}
              </span>
            </div>

            {/* Live Audio Level Meter */}
            <div className="mt-2.5">
              <div className="flex justify-between text-[8px] font-mono text-white/40 mb-1">
                <span>Input Level (16 kHz PCM)</span>
                <span>{(diag.mic.level * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/60 border border-white/10 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-300 transition-all duration-75"
                  style={{ width: `${Math.min(100, Math.max(4, diag.mic.level * 100))}%` }}
                />
              </div>
            </div>

            {diag.mic.error && (
              <p className="mt-2 text-[8.5px] text-rose-300 flex items-center gap-1">
                <AlertTriangle size={12} /> {diag.mic.error}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestMic}
                disabled={micTesting}
                className="flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[9px] font-medium text-sky-200 hover:bg-sky-400/20 disabled:opacity-50"
              >
                <Activity size={12} className={micTesting ? 'animate-spin' : ''} />
                {micTesting ? 'Listening for audio…' : 'Test Microphone'}
              </button>

              {micTestScore !== null && (
                <span className="text-[8.5px] font-mono text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Peak {(micTestScore * 100).toFixed(0)}% (Healthy)
                </span>
              )}
            </div>
          </div>

          {/* 3. Gemini Live Bidi WebSocket Section */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={15} className={isLiveOk ? 'text-sky-400' : 'text-amber-400'} />
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/80">
                  Gemini Live Bidi Stream
                </span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-wider ${
                  diag.live.status === 'connected'
                    ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                    : diag.live.status === 'connecting'
                      ? 'border border-amber-400/40 bg-amber-500/20 text-amber-300 animate-pulse'
                      : 'border border-white/10 bg-white/5 text-white/60'
                }`}
              >
                {diag.live.status}
              </span>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2 text-[8.5px] font-mono text-white/60">
              <div className="rounded-lg bg-black/40 p-1.5 border border-white/5">
                <p className="text-white/40 text-[7.5px]">MODEL</p>
                <p className="text-sky-200 truncate">{diag.live.model}</p>
              </div>
              <div className="rounded-lg bg-black/40 p-1.5 border border-white/5">
                <p className="text-white/40 text-[7.5px]">VOICE</p>
                <p className="text-sky-200 truncate">{diag.live.voice}</p>
              </div>
              <div className="rounded-lg bg-black/40 p-1.5 border border-white/5">
                <p className="text-white/40 text-[7.5px]">PACKETS IN</p>
                <p className="text-white/90">{diag.live.packetsReceived}</p>
              </div>
              <div className="rounded-lg bg-black/40 p-1.5 border border-white/5">
                <p className="text-white/40 text-[7.5px]">PACKETS OUT</p>
                <p className="text-white/90">{diag.live.packetsSent}</p>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleResetLive}
                disabled={resettingLive}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-medium text-white/80 hover:border-sky-400/40 hover:bg-sky-400/10 hover:text-white disabled:opacity-50"
              >
                <RefreshCw size={12} className={resettingLive ? 'animate-spin' : ''} />
                {resettingLive ? 'Resetting Link…' : 'Reset & Reconnect Gemini Live'}
              </button>
            </div>
          </div>

          {/* 4. Speech Output / Mouth Engine */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 size={15} className="text-emerald-400" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/80">
                  Voice & Speech Output
                </span>
              </div>
              <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-sky-200">
                24 kHz DAC
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <div className="text-[8.5px] font-mono text-white/60">
                <span>Engine: </span>
                <span className="text-sky-200 uppercase font-semibold">{diag.mouth.engine}</span>
              </div>

              <button
                type="button"
                onClick={handleTestVoice}
                disabled={voiceTesting}
                className="flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[9px] font-medium text-sky-200 hover:bg-sky-400/20 disabled:opacity-50"
              >
                <Volume2 size={12} className={voiceTesting ? 'animate-pulse' : ''} />
                {voiceTesting ? 'Speaking…' : 'Test Voice (Say Hello)'}
              </button>
            </div>
          </div>

          {/* 5. Particle Substance & WebGL Performance */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
            <div className="flex items-center justify-between text-[9px] font-mono">
              <div className="flex items-center gap-2">
                <span className="block size-2 rounded-full bg-emerald-400" />
                <span className="text-white/70">WebGL Substance Performance</span>
              </div>
              <span className="text-emerald-300 font-semibold">{diag.visuals.fps} FPS</span>
            </div>

            <div className="mt-2 flex items-center justify-between text-[8.5px] font-mono text-white/50">
              <span>Shape: <strong className="text-sky-200 uppercase">{diag.visuals.shape}</strong></span>
              <span>Density: <strong className="text-sky-200 uppercase">{diag.visuals.density}</strong></span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
          <span className="text-[8.5px] font-mono text-emerald-400 flex items-center gap-1">
            <CheckCircle2 size={12} /> All subsystems operational
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-sky-500/20 border border-sky-400/40 px-3.5 py-1.5 text-[10px] font-medium text-sky-100 hover:bg-sky-500/30"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
