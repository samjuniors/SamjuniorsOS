import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  Play,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { AudioMetrics, Emotion, SofiaState } from '../types/sofia';

interface MinimalOverlayProps {
  state: SofiaState;
  emotion: Emotion;
  audioMetrics: AudioMetrics;
  lastWakeTrigger?: string | null;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onTogglePause?: () => void;
  onOpenSettings: () => void;
  onOpenTranscript: () => void;
  onTapWake: () => void;
}

export const MinimalOverlay: React.FC<MinimalOverlayProps> = ({
  state,
  emotion,
  audioMetrics,
  lastWakeTrigger: _lastWakeTrigger,
  isMuted = false,
  onToggleMute,
  onTogglePause,
  onOpenSettings,
  onOpenTranscript,
  onTapWake,
}) => {
  // State description and color
  const getStateInfo = () => {
    switch (state) {
      case 'BOOT':
        return { label: 'Initializing Sofia...', color: 'bg-cyan-400', text: 'text-cyan-300' };
      case 'IDLE':
        return { label: 'Sofia resting • Idle', color: 'bg-teal-400', text: 'text-teal-300' };
      case 'PAUSED':
        return { label: 'Sofia paused', color: 'bg-amber-400', text: 'text-amber-300' };
      case 'LISTENING':
        return { label: 'Listening to you...', color: 'bg-cyan-400', text: 'text-cyan-300' };
      case 'THINKING':
        return { label: 'Sofia is thinking...', color: 'bg-purple-400', text: 'text-purple-300' };
      case 'SPEAKING':
        return { label: 'Sofia speaking', color: 'bg-amber-400', text: 'text-amber-300' };
      case 'INTERRUPTED':
        return { label: 'Interrupted', color: 'bg-rose-400', text: 'text-rose-300' };
      case 'ERROR':
        return { label: 'Connection issue', color: 'bg-rose-500', text: 'text-rose-400' };
    }
  };

  const stateInfo = getStateInfo();

  // Emotion color accents
  const getEmotionColor = () => {
    switch (emotion) {
      case 'happiness':
        return { text: 'text-amber-300', bg: 'bg-amber-400', border: 'border-amber-400/30' };
      case 'curiosity':
        return { text: 'text-violet-300', bg: 'bg-violet-400', border: 'border-violet-400/30' };
      case 'calmness':
        return { text: 'text-teal-300', bg: 'bg-teal-400', border: 'border-teal-400/30' };
      case 'excitement':
        return { text: 'text-rose-300', bg: 'bg-rose-400', border: 'border-rose-400/30' };
      case 'empathy':
        return { text: 'text-purple-300', bg: 'bg-purple-400', border: 'border-purple-400/30' };
      case 'playfulness':
        return { text: 'text-pink-300', bg: 'bg-pink-400', border: 'border-pink-400/30' };
      case 'concern':
        return { text: 'text-orange-300', bg: 'bg-orange-400', border: 'border-orange-400/30' };
      case 'surprise':
        return { text: 'text-emerald-300', bg: 'bg-emerald-400', border: 'border-emerald-400/30' };
      default:
        return { text: 'text-cyan-300', bg: 'bg-cyan-400', border: 'border-cyan-400/30' };
    }
  };

  const emotionColor = getEmotionColor();

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 sm:p-8 select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between w-full pointer-events-auto">
        {/* Left: Companion Presence Badge */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-md shadow-lg shadow-black/20">
            <span className="relative flex h-2 w-2">
              {state === 'LISTENING' || state === 'SPEAKING' ? (
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    state === 'SPEAKING' ? emotionColor.bg : stateInfo.color
                  }`}
                />
              ) : null}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 transition-colors duration-500 ${
                  state === 'SPEAKING' ? emotionColor.bg : stateInfo.color
                }`}
              />
            </span>
            <span className="text-xs font-medium text-white tracking-wide">Sofia</span>
            <span className="text-[11px] text-slate-400 border-l border-white/10 pl-2">
              {stateInfo.label}
            </span>
          </div>

          {/* Emotion Pill */}
          <AnimatePresence mode="wait">
            {emotion && emotion !== 'neutral' && (
              <motion.div
                key={emotion}
                initial={{ opacity: 0, scale: 0.9, y: -2 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 2 }}
                transition={{ duration: 0.3 }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border ${emotionColor.border} text-[11px] ${emotionColor.text} backdrop-blur-sm capitalize`}
              >
                <Sparkles className="w-3 h-3" />
                <span>{emotion}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Companion Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenTranscript}
            className="p-2.5 rounded-full bg-white/[0.04] border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.08] transition-all backdrop-blur-md shadow-lg shadow-black/20 active:scale-95"
            title="Conversation Memory"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2.5 rounded-full bg-white/[0.04] border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.08] transition-all backdrop-blur-md shadow-lg shadow-black/20 active:scale-95"
            title="Voice & Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Subtle Tap Notice (On idle or paused) */}
      {(state === 'IDLE' || state === 'PAUSED') && (
        <div className="self-center text-center opacity-60 hover:opacity-90 transition-opacity pointer-events-auto">
          <button
            onClick={onTapWake}
            className="text-xs text-slate-300 hover:text-cyan-300 transition-colors tracking-wide bg-white/[0.04] px-4 py-1.5 rounded-full border border-white/10"
          >
            {state === 'PAUSED' ? 'Paused • Click orb to resume or say "Hey Sofia"' : 'Idle • Start speaking, click orb, or say "Hey Sofia"'}
          </button>
        </div>
      )}

      {/* Bottom Status & Clean Control Bar */}
      <div className="flex flex-col items-center gap-2.5 pointer-events-auto w-full max-w-lg mx-auto">
        {/* Dynamic State Cue Banner with Audio Equalizer */}
        <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-[#0d121c]/80 border border-white/10 backdrop-blur-md shadow-2xl">
          {/* Audio frequency band equalizer (Low, Mid, High, Peak) */}
          <div className="flex items-end gap-1 h-3.5 w-6">
            {[
              { val: audioMetrics.lowEnergy || audioMetrics.rms, factor: 1.0 },
              { val: audioMetrics.midEnergy || audioMetrics.rms, factor: 1.2 },
              { val: audioMetrics.highEnergy || audioMetrics.rms, factor: 1.1 },
              { val: audioMetrics.rms, factor: 0.9 },
            ].map((band, i) => {
              const activeHeight = Math.max(
                20,
                Math.min(100, Math.round(band.val * 100 * band.factor + (audioMetrics.isSpeech ? 15 : 0)))
              );
              return (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-75 ${
                    state === 'SPEAKING' ? emotionColor.bg : 'bg-cyan-400/85'
                  }`}
                  style={{
                    height: `${audioMetrics.isSpeech || state === 'SPEAKING' ? activeHeight : 20}%`,
                    opacity: audioMetrics.isSpeech || state === 'SPEAKING' ? 0.95 : 0.35,
                  }}
                />
              );
            })}
          </div>

          <div className="text-xs text-slate-300 font-light flex items-center gap-2">
            {state === 'SPEAKING' ? (
              <span className="text-amber-200">Sofia speaking • Interrupt naturally anytime</span>
            ) : state === 'PAUSED' ? (
              <span className="text-amber-300">Sofia is paused • Click orb or say <strong className="font-medium text-white">"Hey Sofia"</strong></span>
            ) : state === 'LISTENING' ? (
              <span className="text-cyan-200">Listening to your voice...</span>
            ) : state === 'THINKING' ? (
              <span className="text-purple-200">Sofia is reflecting...</span>
            ) : state === 'INTERRUPTED' ? (
              <span className="text-rose-200">Stopped immediately • You have the floor</span>
            ) : (
              <span>Say <strong className="font-medium text-white">"Hey Sofia"</strong>, clap 👏, or talk</span>
            )}
          </div>
        </div>

        {/* Clean Companion Control Bar (Mute, Pause/Resume, Transcript, Settings) */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#080d18]/90 border border-white/10 backdrop-blur-xl shadow-2xl">
          {/* Mute Button */}
          <button
            onClick={onToggleMute}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              isMuted
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span>{isMuted ? 'Muted' : 'Mute'}</span>
          </button>

          {/* Pause / Resume Button */}
          <button
            onClick={onTogglePause}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              state === 'PAUSED'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title={state === 'PAUSED' ? 'Resume Sofia' : 'Pause Sofia'}
          >
            {state === 'PAUSED' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{state === 'PAUSED' ? 'Resume' : 'Pause'}</span>
          </button>

          <span className="w-px h-3.5 bg-white/10 mx-1" />

          {/* Transcript Drawer Button */}
          <button
            onClick={onOpenTranscript}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-all"
            title="Conversation Memory & Transcripts"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Transcripts</span>
          </button>

          {/* Voice Settings Button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-all"
            title="Voice & Companion Settings"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>

        {/* Australian Voice Companion footer note */}
        <div className="text-[11px] text-slate-400 font-light text-center">
          Australian Voice Companion • Natural Spoken Dialogue
        </div>
      </div>
    </div>
  );
};
