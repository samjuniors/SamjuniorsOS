'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Wifi,
  Volume2,
  VolumeX,
  Bell,
  Sliders,
  Search,
  Battery,
  Shield,
  Clock,
  Activity,
  User,
  Power,
  RotateCcw,
  Info,
  CheckCircle2,
  Lock,
  Cpu,
  Zap,
} from 'lucide-react';
import { AppId, OSNotification } from '@/types/os';
import { playOSSound } from './IconHelper';
import { SystemActivityStore, SystemActivityState } from '@/lib/system-activity-store';

interface TopMenuBarProps {
  activeAppTitle?: string;
  activeAppId?: AppId;
  openApp: (id: AppId) => void;
  notifications: OSNotification[];
  toggleNotifications: () => void;
  toggleControlCenter: () => void;
  toggleCalendar: () => void;
  toggleSpotlight: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  autonomyMode: string;
  onRestartOS: () => void;
}

export const TopMenuBar: React.FC<TopMenuBarProps> = ({
  activeAppTitle = 'Workforce',
  activeAppId = 'workforce',
  openApp,
  notifications,
  toggleNotifications,
  toggleControlCenter,
  toggleCalendar,
  toggleSpotlight,
  soundEnabled,
  toggleSound,
  autonomyMode,
  onRestartOS,
}) => {
  const [timeStr, setTimeStr] = useState<string>('10:42 AM');
  const [dateStr, setDateStr] = useState<string>('Tue Sep 1');
  const [isSystemMenuOpen, setIsSystemMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [activity, setActivity] = useState<SystemActivityState>(SystemActivityStore.getState());
  const [isHeartbeatPopoverOpen, setIsHeartbeatPopoverOpen] = useState(false);

  useEffect(() => {
    const unsub = SystemActivityStore.subscribe(() => {
      setActivity(SystemActivityStore.getState());
    });
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
      setDateStr(
        now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      <header
        id="os-top-system-bar"
        className="h-8 w-full bg-black/40 backdrop-blur-xl border-b border-white/5 text-[11px] text-slate-300 px-4 flex items-center justify-between select-none z-50 fixed top-0 left-0"
      >
        {/* Left: SamJuniors OS menu + App Title + Navigation */}
        <div className="flex items-center space-x-4">
          {/* OS Logo Menu */}
          <div className="relative">
            <button
              id="os-system-menu-btn"
              onClick={() => {
                if (soundEnabled) playOSSound('click');
                setIsSystemMenuOpen(!isSystemMenuOpen);
              }}
              className={`flex items-center space-x-1.5 px-1.5 py-0.5 rounded transition-all font-semibold tracking-tight ${
                isSystemMenuOpen
                  ? 'bg-white/10 text-white'
                  : 'hover:bg-white/5 text-white/90'
              }`}
            >
              <div className="w-4 h-4 bg-white/90 rounded-full flex items-center justify-center shadow-sm">
                <div className="w-2 h-2 bg-black rounded-full" />
              </div>
              <span className="font-semibold text-xs tracking-tight text-white ml-0.5">SamJuniors OS</span>
            </button>

            {/* System Menu Dropdown */}
            <AnimatePresence>
              {isSystemMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsSystemMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute left-0 mt-1.5 w-60 os-glass rounded-xl shadow-2xl p-1.5 z-50 border border-white/15 text-slate-200"
                  >
                    <button
                      id="menu-item-about-os"
                      onClick={() => {
                        setIsAboutModalOpen(true);
                        setIsSystemMenuOpen(false);
                      }}
                      className="w-full flex items-center px-2.5 py-1.5 text-left rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <Info className="w-3.5 h-3.5 mr-2 text-indigo-400" />
                      <span>About SamJuniors OS</span>
                    </button>
                    <button
                      id="menu-item-messages"
                      onClick={() => {
                        openApp('messages');
                        setIsSystemMenuOpen(false);
                      }}
                      className="w-full flex items-center px-2.5 py-1.5 text-left rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-2 text-emerald-400" />
                      <span>Direct Messages (DMs)</span>
                    </button>
                    <button
                      id="menu-item-workforce"
                      onClick={() => {
                        openApp('workforce');
                        setIsSystemMenuOpen(false);
                      }}
                      className="w-full flex items-center px-2.5 py-1.5 text-left rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5 mr-2 text-purple-400" />
                      <span>Executive Workforce Console</span>
                    </button>
                    <button
                      id="menu-item-settings"
                      onClick={() => {
                        openApp('settings');
                        setIsSystemMenuOpen(false);
                      }}
                      className="w-full flex items-center px-2.5 py-1.5 text-left rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <Sliders className="w-3.5 h-3.5 mr-2 text-slate-400" />
                      <span>System Settings & Wallpapers</span>
                    </button>
                    <button
                      id="menu-item-terminal"
                      onClick={() => {
                        openApp('terminal');
                        setIsSystemMenuOpen(false);
                      }}
                      className="w-full flex items-center px-2.5 py-1.5 text-left rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <Cpu className="w-3.5 h-3.5 mr-2 text-emerald-400" />
                      <span>Kernel Shell (sj-cli)</span>
                    </button>

                    <div className="h-px bg-white/10 my-1" />

                    <div className="px-2.5 py-1 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                      <span>Kernel Status</span>
                      <span className="text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Online
                      </span>
                    </div>

                    <div className="h-px bg-white/10 my-1" />

                    <button
                      id="menu-item-restart-os"
                      onClick={() => {
                        setIsSystemMenuOpen(false);
                        onRestartOS();
                      }}
                      className="w-full flex items-center px-2.5 py-1.5 text-left rounded-lg hover:bg-red-500/20 text-red-300 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-2 text-red-400" />
                      <span>Restart SamJuniors OS</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Active Application Context Menus */}
          <div className="hidden md:flex items-center space-x-3 text-slate-300">
            <span className="font-semibold text-white cursor-default">
              {activeAppTitle}
            </span>
            <button
              id="topbar-action-messages"
              onClick={() => openApp('messages')}
              className="hover:text-emerald-300 text-emerald-400 font-semibold transition-colors px-1 py-0.5 rounded hover:bg-white/5 flex items-center space-x-1"
            >
              <span>Messages</span>
            </button>
            <button
              id="topbar-action-advisor"
              onClick={() => openApp('advisor')}
              className="hover:text-indigo-300 text-indigo-400 font-semibold transition-colors px-1 py-0.5 rounded hover:bg-white/5 flex items-center space-x-1"
            >
              <Sparkles className="w-3 h-3" />
              <span>Advisor</span>
            </button>
            <button
              id="topbar-action-dispatch"
              onClick={() => openApp('workforce')}
              className="hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-white/5"
            >
              Directives
            </button>
            <button
              id="topbar-action-agents"
              onClick={() => openApp('workforce')}
              className="hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-white/5"
            >
              AI Agents
            </button>
            <button
              id="topbar-action-research"
              onClick={() => openApp('research')}
              className="hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-white/5"
            >
              Intelligence
            </button>
            <button
              id="topbar-action-finance"
              onClick={() => openApp('finance')}
              className="hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-white/5"
            >
              Economics
            </button>
          </div>
        </div>

        {/* Center: Live Autonomous Company Telemetry & Agent Heartbeat */}
        <div className="hidden md:flex items-center space-x-2.5 text-[11px] text-slate-400">
          {/* Visual Heartbeat Status Indicator (Pulses when agents are actively processing tasks) */}
          <div className="relative">
            <button
              id="topbar-agent-heartbeat"
              onClick={() => {
                if (soundEnabled) playOSSound('click');
                setIsHeartbeatPopoverOpen(!isHeartbeatPopoverOpen);
              }}
              title={
                activity.isProcessing
                  ? `Active Processing: ${activity.activeTasks.map((t) => t.agentName).join(', ')} (${activity.pulseRateBpm} bpm)`
                  : 'Agent Heartbeat: Idle Standby (68 bpm)'
              }
              className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${
                activity.isProcessing
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)] animate-pulse'
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {activity.isProcessing ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500" />
                )}
              </span>
              <Activity
                className={`w-3.5 h-3.5 transition-transform ${
                  activity.isProcessing ? 'text-emerald-400 animate-pulse' : 'text-slate-400'
                }`}
              />
              <span className="font-mono text-[10px] font-semibold tracking-tight whitespace-nowrap">
                {activity.isProcessing ? (
                  <span className="text-emerald-300">
                    HEARTBEAT: <span className="text-white font-bold">{activity.pulseRateBpm} BPM</span> • PROCESSING
                  </span>
                ) : (
                  <span>HEARTBEAT: 68 BPM</span>
                )}
              </span>
            </button>

            {/* Heartbeat Telemetry Details Popover */}
            <AnimatePresence>
              {isHeartbeatPopoverOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsHeartbeatPopoverOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute left-1/2 -translate-x-1/2 mt-2 w-72 os-glass rounded-2xl shadow-2xl p-3.5 z-50 border border-white/15 text-slate-200 space-y-3"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <div className="flex items-center space-x-1.5">
                        <Activity className={`w-4 h-4 ${activity.isProcessing ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                        <span className="text-xs font-bold text-white">Autonomous Agent Heartbeat</span>
                      </div>
                      <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-semibold ${
                        activity.isProcessing
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-white/10 text-slate-400'
                      }`}>
                        {activity.isProcessing ? 'ACTIVE PROCESSING' : 'STANDBY'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex justify-between text-slate-400">
                        <span>Pulse Frequency:</span>
                        <span className="font-mono text-white font-semibold">{activity.pulseRateBpm} BPM</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Active Concurrent Tasks:</span>
                        <span className="font-mono text-white font-semibold">{activity.activeTasks.length}</span>
                      </div>
                    </div>

                    {activity.activeTasks.length > 0 ? (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Executing Agent Tasks:
                        </span>
                        {activity.activeTasks.map((task) => (
                          <div
                            key={task.id}
                            className="p-2 rounded-xl bg-black/40 border border-white/5 space-y-0.5"
                          >
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="font-bold text-emerald-400">{task.agentName}</span>
                              <span className="text-slate-500 font-mono">Running</span>
                            </div>
                            <p className="text-[11px] text-slate-300 truncate">{task.taskDescription}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-center text-[11px] text-slate-400">
                        All 4 executive AI agents idle & synchronized in memory.
                      </div>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <div className="hidden xl:flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-slate-300 font-medium">Autonomy:</span>
            <span className="text-emerald-400 uppercase font-mono tracking-wider font-semibold">
              {autonomyMode}
            </span>
          </div>

          <div className="hidden xl:flex items-center space-x-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/5">
            <Shield className="w-3 h-3 text-cyan-400" />
            <span>4 Agents Synced</span>
          </div>
        </div>

        {/* Right: Quick Controls, Notifications, Date, Time, Founder Profile */}
        <div className="flex items-center space-x-2">
          {/* Spotlight Search */}
          <button
            id="topbar-spotlight-btn"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              toggleSpotlight();
            }}
            title="Spotlight Search (Cmd+K)"
            className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors flex items-center space-x-1"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden xl:inline text-[10px] text-slate-400 bg-white/10 px-1.5 py-0.2 rounded">
              ⌘K
            </span>
          </button>

          {/* Sound Toggle */}
          <button
            id="topbar-sound-btn"
            onClick={toggleSound}
            title={soundEnabled ? 'Audio Feedback: ON' : 'Audio Feedback: MUTED'}
            className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          {/* Network / Neural Mesh */}
          <div
            title="Quantum Neural Mesh: 0.4ms latency"
            className="p-1 text-emerald-400 flex items-center"
          >
            <Wifi className="w-3.5 h-3.5" />
          </div>

          {/* Control Center */}
          <button
            id="topbar-control-center-btn"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              toggleControlCenter();
            }}
            title="Control Center"
            className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          {/* Notifications Bell */}
          <button
            id="topbar-notifications-btn"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              toggleNotifications();
            }}
            title="System Notifications"
            className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors relative"
          >
            <Bell className="w-3.5 h-3.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-rose-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Date & Time Calendar Trigger */}
          <button
            id="topbar-clock-btn"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              toggleCalendar();
            }}
            className="px-2 py-0.5 rounded hover:bg-white/10 text-slate-200 hover:text-white font-medium transition-colors flex items-center space-x-1.5"
          >
            <span className="text-slate-400 hidden sm:inline">{dateStr}</span>
            <span className="font-semibold">{timeStr}</span>
          </button>

          {/* Founder Profile */}
          <div className="relative">
            <button
              id="topbar-founder-profile-btn"
              onClick={() => {
                if (soundEnabled) playOSSound('click');
                setIsProfileMenuOpen(!isProfileMenuOpen);
              }}
              className="flex items-center space-x-1.5 pl-1.5 pr-2 py-0.5 rounded-full hover:bg-white/10 transition-colors border border-white/10"
            >
              <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-indigo-500 to-pink-500 flex items-center justify-center text-[9px] font-bold text-white">
                F
              </div>
              <span className="font-semibold text-slate-200 hidden md:inline text-[11px]">
                Founder
              </span>
            </button>

            {/* Profile Dropdown */}
            <AnimatePresence>
              {isProfileMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsProfileMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 mt-1.5 w-64 os-glass rounded-xl shadow-2xl p-3 z-50 border border-white/15 text-slate-200"
                  >
                    <div className="flex items-center space-x-3 pb-2.5 border-b border-white/10">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-sm font-bold text-white shadow-lg">
                        FA
                      </div>
                      <div>
                        <div className="font-semibold text-white">Founder Arena</div>
                        <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Master Authorization (L5)
                        </div>
                      </div>
                    </div>

                    <div className="py-2 space-y-1 text-xs">
                      <div className="flex justify-between py-1 text-slate-400">
                        <span>Autonomous Agents:</span>
                        <span className="text-white font-mono font-semibold">4 Active</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-400">
                        <span>Available Compute:</span>
                        <span className="text-emerald-400 font-mono font-semibold">9.8k TFlops</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-400">
                        <span>Monthly ARR:</span>
                        <span className="text-indigo-300 font-mono font-semibold">$148,500</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/10 space-y-1">
                      <button
                        id="profile-open-company"
                        onClick={() => {
                          openApp('company');
                          setIsProfileMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs flex items-center justify-between transition-colors"
                      >
                        <span>Company Constitution</span>
                        <span className="text-[10px] text-indigo-400">View</span>
                      </button>
                      <button
                        id="profile-open-settings"
                        onClick={() => {
                          openApp('settings');
                          setIsProfileMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs flex items-center justify-between transition-colors"
                      >
                        <span>Governance & Safeguards</span>
                        <span className="text-[10px] text-slate-400">Config</span>
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* About SamJuniors OS Modal */}
      <AnimatePresence>
        {isAboutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-md os-glass rounded-2xl p-6 border border-white/20 shadow-2xl relative text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 mx-auto flex items-center justify-center text-3xl shadow-xl mb-4">
                ⚡
              </div>
              <h2 className="text-xl font-bold text-white tracking-wide">
                SamJuniors OS
              </h2>
              <p className="text-xs font-mono text-indigo-400 mt-0.5">
                Version 3.4 Enterprise (Neural Kernel Build 8920)
              </p>
              <p className="text-xs text-slate-300 mt-3 leading-relaxed">
                The native executive operating system for fully autonomous AI companies.
                Coordinating Sophia (COO), Dr. Thorne (Research), Maya Lin (PM), and Julian Cruz (Finance)
                through a deterministic orchestrator.
              </p>

              <div className="mt-5 p-3 rounded-xl bg-white/5 border border-white/10 text-left text-xs space-y-1.5 font-mono text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">AI Model Engine:</span>
                  <span className="text-white">Gemini 3.7 Flash</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Orchestrator Latency:</span>
                  <span className="text-emerald-400">0.4ms Inter-Agent Bus</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Company Autonomy:</span>
                  <span className="text-indigo-400">{autonomyMode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Governance Tier:</span>
                  <span className="text-cyan-400">Zero-Trust Audit Logs</span>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                <button
                  id="close-about-modal-btn"
                  onClick={() => setIsAboutModalOpen(false)}
                  className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg transition-all"
                >
                  Close Information
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
