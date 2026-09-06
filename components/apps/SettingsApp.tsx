'use client';

import React, { useState, useEffect } from 'react';
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
  BookOpen,
  ShieldCheck,
  Bell,
  BellOff,
  Bot,
  Building2,
  Sparkles,
} from 'lucide-react';
import { WALLPAPERS } from '@/lib/os-data';
import { playOSSound } from '../os/IconHelper';
import { SkillExplorerView } from './SkillExplorerView';
import { NotificationStore } from '@/lib/notification-center';

interface SettingsAppProps {
  currentWallpaper: string;
  onSelectWallpaper: (id: string) => void;
  autonomyMode: string;
  onSetAutonomyMode: (mode: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onResetOS: () => void;
  initialTab?: 'skills' | 'preferences';
}

export const SettingsApp: React.FC<SettingsAppProps> = ({
  currentWallpaper,
  onSelectWallpaper,
  autonomyMode,
  onSetAutonomyMode,
  soundEnabled,
  onToggleSound,
  onResetOS,
  initialTab = 'skills',
}) => {
  const [activeTab, setActiveTab] = useState<'skills' | 'preferences'>(initialTab);
  const [toastsEnabled, setToastsEnabled] = useState(() => NotificationStore.getState().toastsEnabled);

  useEffect(() => {
    return NotificationStore.subscribe(() => {
      setToastsEnabled(NotificationStore.getState().toastsEnabled);
    });
  }, []);

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 p-6 overflow-y-auto space-y-6">
      {/* Top Header & Navigation Bar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-400" />
              SamJuniors OS Configuration & Governance
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Explore departmental AI employee skills, system wallpapers, autonomy guardrails, and audio preferences.
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5" /> Constitutional Governance
            </span>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <button
            id="settings-tab-skills"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              setActiveTab('skills');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'skills'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400/40'
                : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Skill Explorer</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-black/40 text-indigo-300 border border-indigo-400/30 font-bold">
              10
            </span>
          </button>

          <button
            id="settings-tab-preferences"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              setActiveTab('preferences');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'preferences'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400/40'
                : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>System & Desktop</span>
          </button>
        </div>
      </div>

      {/* Conditional View: Skill Explorer */}
      {activeTab === 'skills' && <SkillExplorerView />}

      {/* Conditional View: General System Preferences */}
      {activeTab === 'preferences' && (
        <div className="space-y-6">
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

          {/* Section 3: Notification System & Real-Time Alerts */}
          <div className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                  <Bell className="w-3.5 h-3.5 text-indigo-400" />
                  Real-Time Notification System & Swarm Telemetry
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Configure subtle popup banners, top system bar indicators, and test multi-agent event triggers.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  id="settings-toggle-toasts-btn"
                  onClick={() => {
                    if (soundEnabled) playOSSound('click');
                    NotificationStore.setToastsEnabled(!toastsEnabled);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    toastsEnabled
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {toastsEnabled ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                  <span>Popup Toasts {toastsEnabled ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            </div>

            {/* Test Trigger Simulator */}
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  Trigger Test Notification Event:
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Simulate real-time OS events</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  id="settings-sim-ai-action"
                  onClick={() => {
                    NotificationStore.simulateAIEmployeeAction();
                  }}
                  className="p-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-left transition-all group"
                >
                  <div className="flex items-center space-x-1.5 text-indigo-300 font-bold text-xs mb-1">
                    <Bot className="w-3.5 h-3.5" />
                    <span>AI Employee Action</span>
                  </div>
                  <p className="text-[10px] text-slate-400 group-hover:text-slate-300">
                    Directives completed by Sophia, Aris, Maya, or Julian
                  </p>
                </button>

                <button
                  id="settings-sim-system-event"
                  onClick={() => {
                    NotificationStore.simulateSystemEvent();
                  }}
                  className="p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-left transition-all group"
                >
                  <div className="flex items-center space-x-1.5 text-amber-300 font-bold text-xs mb-1">
                    <Zap className="w-3.5 h-3.5" />
                    <span>System Event</span>
                  </div>
                  <p className="text-[10px] text-slate-400 group-hover:text-slate-300">
                    Side-effect gates, heartbeat sync, and security audits
                  </p>
                </button>

                <button
                  id="settings-sim-company-update"
                  onClick={() => {
                    NotificationStore.simulateCompanyUpdate();
                  }}
                  className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-left transition-all group"
                >
                  <div className="flex items-center space-x-1.5 text-rose-300 font-bold text-xs mb-1">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Company Update</span>
                  </div>
                  <p className="text-[10px] text-slate-400 group-hover:text-slate-300">
                    Governance decisions, OKR milestones, and deals
                  </p>
                </button>
              </div>
            </div>
          </div>

          {/* Section 4: Audio & Sound FX */}
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

          {/* Section 5: System Reset */}
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
      )}
    </div>
  );
};
