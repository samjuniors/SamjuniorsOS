'use client';

import React from 'react';
import {
  Sliders,
  Image as ImageIcon,
  Shield,
  Cpu,
  Volume2,
  VolumeX,
  RotateCcw,
  CheckCircle2,
  Lock,
  Zap,
} from 'lucide-react';
import { WALLPAPERS } from '@/lib/os-data';
import { playOSSound } from '../os/IconHelper';

interface SettingsAppProps {
  currentWallpaper: string;
  onSelectWallpaper: (id: string) => void;
  autonomyMode: string;
  onSetAutonomyMode: (mode: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onResetOS: () => void;
}

export const SettingsApp: React.FC<SettingsAppProps> = ({
  currentWallpaper,
  onSelectWallpaper,
  autonomyMode,
  onSetAutonomyMode,
  soundEnabled,
  onToggleSound,
  onResetOS,
}) => {
  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 p-6 overflow-y-auto space-y-6">
      <div>
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Sliders className="w-4 h-4 text-slate-400" />
          SamJuniors OS Configuration & Governance
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Manage system wallpapers, AI autonomy levels, neural model settings, and audio preferences.
        </p>
      </div>

      {/* Section 1: Wallpapers */}
      <div className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-3">
        <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
          <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
          Desktop Wallpapers
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {WALLPAPERS.map((wp) => (
            <button
              key={wp.id}
              id={`wallpaper-select-${wp.id}`}
              onClick={() => {
                if (soundEnabled) playOSSound('click');
                onSelectWallpaper(wp.id);
              }}
              className={`p-2 rounded-xl border text-center transition-all ${
                currentWallpaper === wp.id
                  ? 'border-indigo-500 ring-2 ring-indigo-500/50 shadow-lg'
                  : 'border-white/10 hover:border-white/25'
              }`}
            >
              <div
                className="w-full h-14 rounded-lg shadow-inner border border-white/10 mb-1.5"
                style={{ background: wp.preview }}
              />
              <span className="text-[11px] font-semibold text-slate-200 block truncate">
                {wp.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Section 2: Autonomy Level */}
      <div className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-3">
        <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          Autonomous Execution Guardrails
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              id: 'autonomous',
              title: 'Fully Autonomous',
              desc: 'Agents execute approved directives end-to-end without stopping for intermediate prompts unless threshold > $5,000.',
            },
            {
              id: 'copilot',
              title: 'Human Co-Pilot',
              desc: 'Agents pause after PRD and Financial models for explicit Founder authorization before code/deploy.',
            },
            {
              id: 'advisory',
              title: 'Advisory Only',
              desc: 'Agents only produce research and recommendations without modifying live configurations.',
            },
          ].map((mode) => (
            <button
              key={mode.id}
              id={`autonomy-mode-${mode.id}`}
              onClick={() => {
                if (soundEnabled) playOSSound('click');
                onSetAutonomyMode(mode.title);
              }}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                autonomyMode === mode.title
                  ? 'os-glass-card-active border-emerald-500/60 ring-1 ring-emerald-500/40 shadow-lg'
                  : 'os-glass-card border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs text-white">{mode.title}</span>
                {autonomyMode === mode.title && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{mode.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Section 3: Audio & Sound FX */}
      <div className="os-glass-card rounded-2xl p-5 border border-white/10 flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
            OS Sound Effects & Neural Feedback
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Synthetic acoustic feedback for window actions, notifications, and directive executions.
          </p>
        </div>

        <button
          id="settings-toggle-sound-btn"
          onClick={onToggleSound}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            soundEnabled
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white/10 text-slate-400 hover:text-white'
          }`}
        >
          {soundEnabled ? 'Enabled' : 'Muted'}
        </button>
      </div>

      {/* Section 4: System Reset */}
      <div className="os-glass-card rounded-2xl p-5 border border-white/10 flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            Restart / Reset SamJuniors OS Desktop
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Re-initializes all window coordinates, clears transient memory buffers, and syncs AI agents.
          </p>
        </div>

        <button
          id="settings-reset-os-btn"
          onClick={onResetOS}
          className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 text-xs font-bold border border-rose-500/30 transition-all"
        >
          Restart Desktop
        </button>
      </div>
    </div>
  );
};
